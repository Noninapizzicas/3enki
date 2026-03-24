/**
 * Módulo Device Registry v1.0.0
 *
 * Fuente única de verdad de TODOS los dispositivos del sistema.
 * Escucha birth messages, LWT, y status MQTT para mantener un registro
 * vivo de dispositivos con su estado, capacidades y metadata.
 *
 * Topics MQTT que escucha:
 *   devices/{project}/+/birth    — Birth message (retained) → auto-registro
 *   devices/{project}/+/lwt      — Last Will → marcar offline
 *   +/+/status/+                 — Status periódico (compat impresion/+/status/+)
 *
 * Los módulos de dominio consultan este registro en vez de mantener Maps propios.
 * Un solo lugar donde preguntar "¿qué dispositivos tengo?".
 *
 * Tier: tier_2_platform (carga antes que módulos de dominio)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class DeviceRegistryModule {
  constructor() {
    this.name = 'device-registry';
    this.version = '1.0.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    // Config
    this.config = {
      heartbeat_timeout_ms: 90000,  // 90s sin status → offline
      persist_interval_ms: 30000,   // Guardar a disco cada 30s
      data_path: './data/devices'
    };

    // Registry: device_id → device object
    this.devices = new Map();

    // Timers de heartbeat por dispositivo
    this._heartbeatTimers = new Map();

    // Timer de persistencia periódica
    this._persistTimer = null;

    // Flag de cambios pendientes
    this._dirty = false;

    // Listener MQTT
    this._onMqttMessage = null;

    // Métricas internas
    this.internalMetrics = {
      registered_total: 0,
      unregistered_total: 0,
      births_total: 0,
      lwts_total: 0,
      online_current: 0,
      offline_current: 0
    };
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    // Merge config
    if (core.config?.['device-registry']) {
      this.config = { ...this.config, ...core.config['device-registry'] };
    }

    // Resolver data path
    this.config.data_path = path.resolve(this.config.data_path);

    // Cargar registro persistido
    await this._loadFromDisk();

    // Marcar todos como offline al arrancar (se actualizarán con birth/status)
    for (const device of this.devices.values()) {
      device.state = 'offline';
    }
    this._recalcMetrics();

    // Iniciar escucha MQTT
    await this._startMqttListeners();

    // Iniciar persistencia periódica
    this._persistTimer = setInterval(() => this._persistIfDirty(), this.config.persist_interval_ms);

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      devices_loaded: this.devices.size,
      data_path: this.config.data_path
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    // Parar MQTT listeners
    this._stopMqttListeners();

    // Parar timers
    if (this._persistTimer) {
      clearInterval(this._persistTimer);
      this._persistTimer = null;
    }

    for (const timer of this._heartbeatTimers.values()) {
      clearTimeout(timer);
    }
    this._heartbeatTimers.clear();

    // Persistir estado final
    await this._persistToDisk();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // MQTT Listeners
  // ==========================================

  async _startMqttListeners() {
    const mqtt = this.eventBus?.mqtt;
    if (!mqtt || !mqtt.isConnected) {
      this.logger.warn('device-registry.mqtt.not_available');
      return;
    }

    this._onMqttMessage = this._handleMqttMessage.bind(this);
    mqtt.on('message', this._onMqttMessage);

    try {
      await mqtt.subscribe('devices/+/+/birth');
      await mqtt.subscribe('devices/+/+/lwt');
      await mqtt.subscribe('enki/+/status/+');
      await mqtt.subscribe('impresion/+/status/+');
      await mqtt.subscribe('esp32/+/status');

      this.logger.info('device-registry.mqtt.subscribed', {
        topics: ['devices/+/+/birth', 'devices/+/+/lwt', 'enki/+/status/+', 'impresion/+/status/+', 'esp32/+/status']
      });
    } catch (err) {
      this.logger.error('device-registry.mqtt.subscribe_error', { error: err.message });
    }
  }

  _stopMqttListeners() {
    const mqtt = this.eventBus?.mqtt;
    if (mqtt && this._onMqttMessage) {
      mqtt.removeListener('message', this._onMqttMessage);
      this._onMqttMessage = null;
    }
  }

  /**
   * Router de mensajes MQTT entrantes.
   */
  _handleMqttMessage(topic, payload) {
    try {
      // Birth message: devices/{project}/{device_id}/birth
      const birthMatch = topic.match(/^devices\/([^/]+)\/([^/]+)\/birth$/);
      if (birthMatch) {
        this._handleBirth(birthMatch[1], birthMatch[2], payload);
        return;
      }

      // LWT: devices/{project}/{device_id}/lwt
      const lwtMatch = topic.match(/^devices\/([^/]+)\/([^/]+)\/lwt$/);
      if (lwtMatch) {
        this._handleLwt(lwtMatch[1], lwtMatch[2]);
        return;
      }

      // Status Enki BASE: enki/{project}/status/{device_id}
      const enkiMatch = topic.match(/^enki\/([^/]+)\/status\/([^/]+)$/);
      if (enkiMatch) {
        this._handleStatus(enkiMatch[1], enkiMatch[2], payload, 'mqtt-native');
        return;
      }

      // Status impresion (legacy): impresion/{project}/status/{device_id}
      const impresionMatch = topic.match(/^impresion\/([^/]+)\/status\/([^/]+)$/);
      if (impresionMatch) {
        this._handleStatus(impresionMatch[1], impresionMatch[2], payload, 'mqtt-native');
        return;
      }

      // Status ESP32 genérico: esp32/{device_id}/status
      const esp32Match = topic.match(/^esp32\/([^/]+)\/status$/);
      if (esp32Match) {
        this._handleStatus(null, esp32Match[1], payload, 'mqtt-native');
        return;
      }
    } catch (err) {
      this.logger.error('device-registry.mqtt.message_error', {
        topic,
        error: err.message
      });
    }
  }

  // ==========================================
  // Birth / LWT / Status handlers
  // ==========================================

  _handleBirth(projectId, deviceId, payload) {
    const data = this._parsePayload(payload);
    if (!data) return;

    this.internalMetrics.births_total++;

    const existing = this.devices.get(deviceId);
    const device = {
      device_id: deviceId,
      project_id: projectId,
      name: data.name || data.nombre || deviceId,
      type: data.type || data.tipo || 'unknown',
      driver: data.driver || null,
      capabilities: data.capabilities || data.capacidades || [],
      protocol: data.protocol || data.protocolo || 'mqtt-native',
      gateway: data.gateway || null,
      state: 'online',
      firmware: data.firmware || null,
      metadata: data.metadata || {},
      last_seen: new Date().toISOString(),
      registered_at: existing?.registered_at || new Date().toISOString()
    };

    const isNew = !existing;
    this.devices.set(deviceId, device);
    this._dirty = true;
    this._resetHeartbeat(deviceId);
    this._recalcMetrics();

    if (isNew) {
      this.internalMetrics.registered_total++;
      this.logger.info('device-registry.device.registered', {
        device_id: deviceId,
        project_id: projectId,
        type: device.type,
        capabilities: device.capabilities,
        source: 'birth'
      });
      this.eventBus.publish('device.registered', { device: this._sanitize(device) });
    }

    this.eventBus.publish('device.online', {
      device_id: deviceId,
      project_id: projectId,
      timestamp: device.last_seen
    });
  }

  _handleLwt(projectId, deviceId) {
    this.internalMetrics.lwts_total++;

    const device = this.devices.get(deviceId);
    if (!device) return;

    device.state = 'offline';
    this._dirty = true;
    this._clearHeartbeat(deviceId);
    this._recalcMetrics();

    this.logger.info('device-registry.device.offline', {
      device_id: deviceId,
      source: 'lwt'
    });

    this.eventBus.publish('device.offline', {
      device_id: deviceId,
      project_id: projectId,
      reason: 'lwt',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Status periódico de un dispositivo (compatible con formato impresion/esp32).
   * Si el dispositivo no existe, lo registra automáticamente.
   */
  _handleStatus(projectId, deviceId, payload, protocol) {
    const data = this._parsePayload(payload);
    if (!data) return;

    const existing = this.devices.get(deviceId);
    const now = new Date().toISOString();

    if (!existing) {
      // Auto-registro desde status
      const device = {
        device_id: deviceId,
        project_id: projectId || data.project_id || 'default',
        name: data.name || data.nombre || data.device_id || deviceId,
        type: data.type || data.tipo || this._inferType(data),
        driver: data.driver || null,
        capabilities: data.capabilities || data.capacidades || this._inferCapabilities(data),
        protocol: protocol || 'mqtt-native',
        gateway: data.gateway || null,
        state: 'online',
        firmware: data.firmware || null,
        metadata: this._extractMetadata(data),
        last_seen: now,
        registered_at: now
      };

      this.devices.set(deviceId, device);
      this.internalMetrics.registered_total++;
      this._dirty = true;
      this._resetHeartbeat(deviceId);
      this._recalcMetrics();

      this.logger.info('device-registry.device.registered', {
        device_id: deviceId,
        type: device.type,
        source: 'status-autodiscovery'
      });

      this.eventBus.publish('device.registered', { device: this._sanitize(device) });
      this.eventBus.publish('device.online', {
        device_id: deviceId,
        project_id: device.project_id,
        timestamp: now
      });
      return;
    }

    // Actualizar dispositivo existente
    const wasOffline = existing.state !== 'online';
    existing.state = 'online';
    existing.last_seen = now;
    if (data.firmware) existing.firmware = data.firmware;
    if (data.driver) existing.driver = data.driver;
    existing.metadata = { ...existing.metadata, ...this._extractMetadata(data) };
    this._dirty = true;
    this._resetHeartbeat(deviceId);

    if (wasOffline) {
      this._recalcMetrics();
      this.logger.info('device-registry.device.online', {
        device_id: deviceId,
        source: 'status'
      });
      this.eventBus.publish('device.online', {
        device_id: deviceId,
        project_id: existing.project_id,
        timestamp: now
      });
    }
  }

  // ==========================================
  // Heartbeat (timeout → offline)
  // ==========================================

  _resetHeartbeat(deviceId) {
    this._clearHeartbeat(deviceId);

    const timer = setTimeout(() => {
      const device = this.devices.get(deviceId);
      if (device && device.state === 'online') {
        device.state = 'offline';
        this._dirty = true;
        this._recalcMetrics();

        this.logger.info('device-registry.device.offline', {
          device_id: deviceId,
          source: 'heartbeat_timeout',
          timeout_ms: this.config.heartbeat_timeout_ms
        });

        this.eventBus.publish('device.offline', {
          device_id: deviceId,
          project_id: device.project_id,
          reason: 'heartbeat_timeout',
          timestamp: new Date().toISOString()
        });
      }
    }, this.config.heartbeat_timeout_ms);

    this._heartbeatTimers.set(deviceId, timer);
  }

  _clearHeartbeat(deviceId) {
    const existing = this._heartbeatTimers.get(deviceId);
    if (existing) {
      clearTimeout(existing);
      this._heartbeatTimers.delete(deviceId);
    }
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onDeviceRegister(event) {
    const data = event?.data || event?.payload || event;
    const { device_id, project_id, name, type, capabilities, protocol, gateway, metadata } = data;

    if (!device_id) {
      this.logger.warn('device-registry.register.missing_device_id');
      return;
    }

    const now = new Date().toISOString();
    const existing = this.devices.get(device_id);

    const device = {
      device_id,
      project_id: project_id || 'default',
      name: name || device_id,
      type: type || 'unknown',
      capabilities: capabilities || [],
      protocol: protocol || 'manual',
      gateway: gateway || null,
      state: 'offline',
      firmware: data.firmware || null,
      metadata: metadata || {},
      last_seen: now,
      registered_at: existing?.registered_at || now
    };

    this.devices.set(device_id, device);
    this._dirty = true;
    this.internalMetrics.registered_total++;
    this._recalcMetrics();

    this.logger.info('device-registry.device.registered', {
      device_id,
      type: device.type,
      source: 'event'
    });

    await this.eventBus.publish('device.registered', { device: this._sanitize(device) });
  }

  async onDeviceUnregister(event) {
    const data = event?.data || event?.payload || event;
    const { device_id } = data;

    if (!device_id) return;

    const device = this.devices.get(device_id);
    if (!device) return;

    this.devices.delete(device_id);
    this._clearHeartbeat(device_id);
    this._dirty = true;
    this.internalMetrics.unregistered_total++;
    this._recalcMetrics();

    this.logger.info('device-registry.device.unregistered', { device_id });

    await this.eventBus.publish('device.unregistered', {
      device_id,
      project_id: device.project_id,
      timestamp: new Date().toISOString()
    });
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleList(data) {
    let devices = Array.from(this.devices.values());

    // Filtros opcionales
    if (data?.type) {
      devices = devices.filter(d => d.type === data.type);
    }
    if (data?.state) {
      devices = devices.filter(d => d.state === data.state);
    }
    if (data?.project_id) {
      devices = devices.filter(d => d.project_id === data.project_id);
    }
    if (data?.capability) {
      devices = devices.filter(d => d.capabilities.includes(data.capability));
    }
    if (data?.protocol) {
      devices = devices.filter(d => d.protocol === data.protocol);
    }

    return {
      status: 200,
      data: {
        devices: devices.map(d => this._sanitize(d)),
        total: devices.length
      }
    };
  }

  async handleGet(data) {
    if (!data?.device_id) return { status: 400, error: 'device_id requerido' };

    const device = this.devices.get(data.device_id);
    if (!device) return { status: 404, error: `Dispositivo ${data.device_id} no encontrado` };

    return { status: 200, data: { device: this._sanitize(device) } };
  }

  async handleRegister(data) {
    if (!data?.device_id) return { status: 400, error: 'device_id requerido' };

    await this.onDeviceRegister({ data });

    return {
      status: 201,
      data: { device: this._sanitize(this.devices.get(data.device_id)) }
    };
  }

  async handleUnregister(data) {
    if (!data?.device_id) return { status: 400, error: 'device_id requerido' };

    const existed = this.devices.has(data.device_id);
    await this.onDeviceUnregister({ data });

    return { status: 200, data: { removed: existed } };
  }

  async handleStats() {
    const devices = Array.from(this.devices.values());
    const byType = {};
    const byProtocol = {};
    const byState = { online: 0, offline: 0, error: 0 };

    for (const d of devices) {
      byType[d.type] = (byType[d.type] || 0) + 1;
      byProtocol[d.protocol] = (byProtocol[d.protocol] || 0) + 1;
      byState[d.state] = (byState[d.state] || 0) + 1;
    }

    return {
      status: 200,
      data: {
        total: devices.length,
        by_type: byType,
        by_protocol: byProtocol,
        by_state: byState,
        metrics: { ...this.internalMetrics }
      }
    };
  }

  // ==========================================
  // Public API (para otros módulos via require)
  // ==========================================

  /**
   * Obtener dispositivo por ID.
   * Otros módulos pueden hacer: const registry = core.modules.get('device-registry');
   */
  getDevice(deviceId) {
    return this.devices.get(deviceId) || null;
  }

  /**
   * Listar dispositivos con filtro.
   */
  listDevices(filter = {}) {
    let devices = Array.from(this.devices.values());
    if (filter.type) devices = devices.filter(d => d.type === filter.type);
    if (filter.state) devices = devices.filter(d => d.state === filter.state);
    if (filter.capability) devices = devices.filter(d => d.capabilities.includes(filter.capability));
    if (filter.project_id) devices = devices.filter(d => d.project_id === filter.project_id);
    if (filter.protocol) devices = devices.filter(d => d.protocol === filter.protocol);
    return devices;
  }

  /**
   * Verificar si un dispositivo está online.
   */
  isOnline(deviceId) {
    const device = this.devices.get(deviceId);
    return device?.state === 'online';
  }

  // ==========================================
  // Persistencia
  // ==========================================

  async _loadFromDisk() {
    const filePath = path.join(this.config.data_path, 'registry.json');

    try {
      await fs.promises.mkdir(this.config.data_path, { recursive: true });

      const raw = await fs.promises.readFile(filePath, 'utf8');
      const data = JSON.parse(raw);

      if (Array.isArray(data.devices)) {
        for (const device of data.devices) {
          this.devices.set(device.device_id, device);
        }
      }

      this.logger.info('device-registry.loaded_from_disk', {
        devices: this.devices.size,
        file: filePath
      });
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('device-registry.load_error', { error: err.message });
      }
    }
  }

  async _persistToDisk() {
    const filePath = path.join(this.config.data_path, 'registry.json');

    try {
      await fs.promises.mkdir(this.config.data_path, { recursive: true });

      const data = {
        _version: '1.0.0',
        _updated: new Date().toISOString(),
        devices: Array.from(this.devices.values())
      };

      await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
      this._dirty = false;
    } catch (err) {
      this.logger.error('device-registry.persist_error', { error: err.message });
    }
  }

  _persistIfDirty() {
    if (this._dirty) {
      this._persistToDisk();
    }
  }

  // ==========================================
  // Utilidades
  // ==========================================

  _parsePayload(payload) {
    try {
      if (typeof payload === 'string') return JSON.parse(payload);
      if (Buffer.isBuffer(payload)) return JSON.parse(payload.toString());
      return payload;
    } catch {
      return null;
    }
  }

  _sanitize(device) {
    return { ...device };
  }

  _inferType(data) {
    if (data.printer_ready !== undefined || data.printer_name) return 'impresora-termica';
    if (data.temperature !== undefined || data.humidity !== undefined) return 'sensor';
    return 'unknown';
  }

  _inferCapabilities(data) {
    const caps = [];
    if (data.printer_ready !== undefined || data.printer_name) caps.push('imprimir');
    if (data.display !== undefined) caps.push('display');
    if (caps.length === 0) caps.push('status');
    return caps;
  }

  _extractMetadata(data) {
    const meta = {};
    const metaKeys = [
      'ip', 'mac', 'wifi_rssi', 'wifi_ssid', 'uptime_sec',
      'printer_name', 'printer_addr', 'printer_ready', 'ancho',
      'free_heap', 'print_count', 'error_count', 'marca', 'modelo'
    ];
    for (const key of metaKeys) {
      if (data[key] !== undefined) meta[key] = data[key];
    }
    return meta;
  }

  _recalcMetrics() {
    let online = 0;
    let offline = 0;
    for (const d of this.devices.values()) {
      if (d.state === 'online') online++;
      else offline++;
    }
    this.internalMetrics.online_current = online;
    this.internalMetrics.offline_current = offline;
  }
}

module.exports = DeviceRegistryModule;

/**
 * device-registry v2.0.0 — Fuente unica de verdad de los dispositivos IoT del sistema.
 *
 * Auto-descubre dispositivos via MQTT (birth/status), trackea online/offline via
 * LWT + heartbeat timeout, persiste el registro en disco (atomico).
 *
 * Topics MQTT escuchados:
 *   devices/{project}/+/birth      → auto-registro online
 *   devices/{project}/+/lwt        → marcar offline
 *   enki/{project}/status/+        → status periodico (auto-discovery + heartbeat reset)
 *   impresion/{project}/status/+   → status periodico legacy (compat firmware antiguo)
 *
 * Eventos del bus emitidos (todos con correlation_id + timestamp + project_id top-level):
 *   device.registered    — nuevo dispositivo en el registro
 *   device.unregistered  — dispositivo eliminado
 *   device.online        — dispositivo detectado vivo
 *   device.offline       — dispositivo no responde (LWT o heartbeat timeout)
 *   device.updated       — metadata/firmware/driver actualizado en device existente
 *
 * Subscribes:
 *   device.register      → onDeviceRegister (registro manual)
 *   device.unregister    → onDeviceUnregister
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

class DeviceRegistryModule {
  constructor() {
    this.name    = 'device-registry';
    this.version = '2.0.0';

    this.eventBus = null;
    this.logger   = null;
    this.metrics  = null;

    this.config = {
      heartbeat_timeout_ms: 90000,
      persist_interval_ms:  30000,
      data_path: './data/devices'
    };

    // Registry: device_id → device object
    this.devices = new Map();

    // Heartbeat timer por device_id
    this._heartbeatTimers = new Map();

    this._persistTimer  = null;
    this._dirty         = false;
    this._onMqttMessage = null;

    this.internalMetrics = {
      registered_total:   0,
      unregistered_total: 0,
      births_total:       0,
      lwts_total:         0,
      online_current:     0,
      offline_current:    0
    };
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger   = core.logger;
    this.metrics  = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    if (core.config?.['device-registry']) {
      this.config = { ...this.config, ...core.config['device-registry'] };
    }

    this.config.data_path = path.resolve(this.config.data_path);

    await this._loadFromDisk();

    // Todos arrancan offline; la realidad MQTT mandara
    for (const device of this.devices.values()) {
      device.state = 'offline';
    }
    this._recalcMetrics();

    await this._startMqttListeners();

    this._persistTimer = setInterval(() => this._persistIfDirty(), this.config.persist_interval_ms);

    this.logger.info('module.loaded', {
      module:         this.name,
      version:        this.version,
      devices_loaded: this.devices.size,
      data_path:      this.config.data_path
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    this._stopMqttListeners();

    if (this._persistTimer) {
      clearInterval(this._persistTimer);
      this._persistTimer = null;
    }

    for (const timer of this._heartbeatTimers.values()) clearTimeout(timer);
    this._heartbeatTimers.clear();

    await this._persistToDisk();

    this.devices.clear();
    this.internalMetrics = {
      registered_total: 0, unregistered_total: 0, births_total: 0,
      lwts_total: 0, online_current: 0, offline_current: 0
    };

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

    const topics = [
      'devices/+/+/birth',
      'devices/+/+/lwt',
      'enki/+/status/+',
      'impresion/+/status/+'
    ];

    try {
      for (const t of topics) await mqtt.subscribe(t);
      this.logger.info('device-registry.mqtt.subscribed', { topics });
    } catch (err) {
      this.logger.error('device-registry.mqtt.subscribe_error', { error: err.message });
      this.metrics?.increment('device-registry.errors', { kind: 'mqtt_subscribe', code: 'INTERNAL_ERROR' });
    }
  }

  _stopMqttListeners() {
    const mqtt = this.eventBus?.mqtt;
    if (mqtt && this._onMqttMessage) {
      mqtt.removeListener('message', this._onMqttMessage);
      this._onMqttMessage = null;
    }
  }

  _handleMqttMessage(topic, payload) {
    try {
      const birthMatch = topic.match(/^devices\/([^/]+)\/([^/]+)\/birth$/);
      if (birthMatch) { this._handleBirth(birthMatch[1], birthMatch[2], payload); return; }

      const lwtMatch = topic.match(/^devices\/([^/]+)\/([^/]+)\/lwt$/);
      if (lwtMatch) { this._handleLwt(lwtMatch[1], lwtMatch[2]); return; }

      const enkiMatch = topic.match(/^enki\/([^/]+)\/status\/([^/]+)$/);
      if (enkiMatch) { this._handleStatus(enkiMatch[1], enkiMatch[2], payload, 'mqtt-native'); return; }

      const impresionMatch = topic.match(/^impresion\/([^/]+)\/status\/([^/]+)$/);
      if (impresionMatch) { this._handleStatus(impresionMatch[1], impresionMatch[2], payload, 'mqtt-native'); return; }
    } catch (err) {
      this.logger.error('device-registry.mqtt.message_error', { topic, error: err.message });
      this.metrics?.increment('device-registry.errors', { kind: 'mqtt_message', code: 'INTERNAL_ERROR' });
    }
  }

  // ==========================================
  // Birth / LWT / Status
  // ==========================================

  _handleBirth(projectId, deviceId, payload) {
    const data = this._parsePayload(payload, 'birth');
    if (!data) return;

    this.internalMetrics.births_total++;
    this.metrics?.increment('devices.births.total');

    const existing = this.devices.get(deviceId);
    const now = new Date().toISOString();
    const device = {
      device_id:     deviceId,
      project_id:    projectId,
      name:          data.name || data.nombre || deviceId,
      type:          data.type || data.tipo || 'unknown',
      driver:        data.driver || null,
      capabilities:  data.capabilities || data.capacidades || [],
      protocol:      data.protocol || data.protocolo || 'mqtt-native',
      gateway:       data.gateway || null,
      state:         'online',
      firmware:      data.firmware || null,
      metadata:      data.metadata || {},
      last_seen:     now,
      registered_at: existing?.registered_at || now
    };

    const isNew = !existing;
    this.devices.set(deviceId, device);
    this._dirty = true;
    this._resetHeartbeat(deviceId);
    this._recalcMetrics();

    if (isNew) {
      this.internalMetrics.registered_total++;
      this.metrics?.increment('devices.registered.total');
      this.logger.info('device-registry.device.registered', {
        device_id: deviceId, project_id: projectId, type: device.type, source: 'birth'
      });
      this._publicarEvento('device.registered', {
        device_id:  deviceId,
        project_id: projectId,
        device:     this._sanitize(device),
        source:     'birth'
      });
    }

    this._publicarEvento('device.online', {
      device_id:  deviceId,
      project_id: projectId,
      timestamp:  now,
      source:     'birth'
    });
  }

  _handleLwt(projectId, deviceId) {
    this.internalMetrics.lwts_total++;
    this.metrics?.increment('devices.lwts.total');

    const device = this.devices.get(deviceId);
    if (!device) return;

    if (device.state === 'offline') return;

    device.state = 'offline';
    this._dirty  = true;
    this._clearHeartbeat(deviceId);
    this._recalcMetrics();

    this.logger.info('device-registry.device.offline', { device_id: deviceId, source: 'lwt' });

    this._publicarEvento('device.offline', {
      device_id:  deviceId,
      project_id: projectId,
      reason:     'lwt',
      timestamp:  new Date().toISOString()
    });
  }

  _handleStatus(projectId, deviceId, payload, protocol) {
    const data = this._parsePayload(payload, 'status');
    if (!data) return;

    const existing = this.devices.get(deviceId);
    const now = new Date().toISOString();

    if (!existing) {
      // Auto-registro desde status
      const resolvedProject = projectId || data.project_id || 'default';
      const device = {
        device_id:     deviceId,
        project_id:    resolvedProject,
        name:          data.name || data.nombre || data.device_id || deviceId,
        type:          data.type || data.tipo || this._inferType(data),
        driver:        data.driver || null,
        capabilities:  data.capabilities || data.capacidades || this._inferCapabilities(data),
        protocol:      protocol || 'mqtt-native',
        gateway:       data.gateway || null,
        state:         'online',
        firmware:      data.firmware || null,
        metadata:      this._extractMetadata(data),
        last_seen:     now,
        registered_at: now
      };

      this.devices.set(deviceId, device);
      this.internalMetrics.registered_total++;
      this.metrics?.increment('devices.registered.total');
      this._dirty = true;
      this._resetHeartbeat(deviceId);
      this._recalcMetrics();

      this.logger.info('device-registry.device.registered', {
        device_id: deviceId, project_id: resolvedProject, type: device.type, source: 'status-autodiscovery'
      });

      this._publicarEvento('device.registered', {
        device_id:  deviceId,
        project_id: resolvedProject,
        device:     this._sanitize(device),
        source:     'status-autodiscovery'
      });
      this._publicarEvento('device.online', {
        device_id:  deviceId,
        project_id: resolvedProject,
        timestamp:  now,
        source:     'status-autodiscovery'
      });
      return;
    }

    // Device existente: actualizar y detectar cambios
    const wasOffline = existing.state !== 'online';
    const changes    = {};

    existing.state     = 'online';
    existing.last_seen = now;
    if (data.firmware && data.firmware !== existing.firmware) {
      changes.firmware = { from: existing.firmware, to: data.firmware };
      existing.firmware = data.firmware;
    }
    if (data.driver && data.driver !== existing.driver) {
      changes.driver = { from: existing.driver, to: data.driver };
      existing.driver = data.driver;
    }
    const newMeta = this._extractMetadata(data);
    const metaDiff = this._metaDiff(existing.metadata || {}, newMeta);
    if (Object.keys(metaDiff).length > 0) {
      changes.metadata = metaDiff;
      existing.metadata = { ...existing.metadata, ...newMeta };
    }

    this._dirty = true;
    this._resetHeartbeat(deviceId);

    if (wasOffline) {
      this._recalcMetrics();
      this.logger.info('device-registry.device.online', { device_id: deviceId, source: 'status' });
      this._publicarEvento('device.online', {
        device_id:  deviceId,
        project_id: existing.project_id,
        timestamp:  now,
        source:     'status'
      });
    }

    if (Object.keys(changes).length > 0) {
      this.metrics?.increment('device-registry.device.updated');
      this._publicarEvento('device.updated', {
        device_id:  deviceId,
        project_id: existing.project_id,
        changes,
        timestamp:  now
      });
    }
  }

  // ==========================================
  // Heartbeat timeout → offline
  // ==========================================

  _resetHeartbeat(deviceId) {
    this._clearHeartbeat(deviceId);

    const timer = setTimeout(() => {
      const device = this.devices.get(deviceId);
      if (!device || device.state !== 'online') return;

      device.state = 'offline';
      this._dirty = true;
      this._recalcMetrics();

      this.logger.info('device-registry.device.offline', {
        device_id:  deviceId,
        source:     'heartbeat_timeout',
        timeout_ms: this.config.heartbeat_timeout_ms
      });

      this._publicarEvento('device.offline', {
        device_id:  deviceId,
        project_id: device.project_id,
        reason:     'heartbeat_timeout',
        timestamp:  new Date().toISOString()
      });
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
  // Bus handlers (subscribes)
  // ==========================================

  async onDeviceRegister(event) {
    const data = event?.data || event?.payload || event;
    const { device_id, project_id, name, type, capabilities, protocol, gateway, metadata, driver, firmware, correlation_id } = data || {};

    if (!device_id) {
      this.logger.warn('device-registry.register.missing_device_id');
      this.metrics?.increment('device-registry.errors', { kind: 'register', code: 'VALIDATION_FAILED' });
      return;
    }

    const now = new Date().toISOString();
    const existing = this.devices.get(device_id);
    const resolvedProject = project_id || existing?.project_id || 'default';

    const device = {
      device_id,
      project_id:    resolvedProject,
      name:          name || existing?.name || device_id,
      type:          type || existing?.type || 'unknown',
      capabilities:  capabilities || existing?.capabilities || [],
      protocol:      protocol || existing?.protocol || 'manual',
      gateway:       gateway ?? existing?.gateway ?? null,
      driver:        driver ?? existing?.driver ?? null,
      state:         existing?.state || 'offline',
      firmware:      firmware ?? existing?.firmware ?? null,
      metadata:      metadata || existing?.metadata || {},
      last_seen:     existing?.last_seen || now,
      registered_at: existing?.registered_at || now
    };

    this.devices.set(device_id, device);
    this._dirty = true;
    this.internalMetrics.registered_total++;
    this.metrics?.increment('devices.registered.total');
    this._recalcMetrics();

    this.logger.info('device-registry.device.registered', {
      device_id, project_id: resolvedProject, type: device.type, source: 'event'
    });

    this._publicarEvento('device.registered', {
      device_id,
      project_id: resolvedProject,
      device:     this._sanitize(device),
      source:     'event'
    }, { correlation_id });
  }

  async onDeviceUnregister(event) {
    const data = event?.data || event?.payload || event;
    const { device_id, correlation_id } = data || {};

    if (!device_id) {
      this.logger.warn('device-registry.unregister.missing_device_id');
      this.metrics?.increment('device-registry.errors', { kind: 'unregister', code: 'VALIDATION_FAILED' });
      return;
    }

    const device = this.devices.get(device_id);
    if (!device) return;

    this.devices.delete(device_id);
    this._clearHeartbeat(device_id);
    this._dirty = true;
    this.internalMetrics.unregistered_total++;
    this.metrics?.increment('devices.unregistered.total');
    this._recalcMetrics();

    this.logger.info('device-registry.device.unregistered', { device_id });

    this._publicarEvento('device.unregistered', {
      device_id,
      project_id: device.project_id,
      timestamp:  new Date().toISOString()
    }, { correlation_id });
  }

  // ==========================================
  // UI Handlers (mqttRequest cross-modulo)
  // ==========================================

  async handleList(data) {
    try {
      let devices = Array.from(this.devices.values());

      if (data?.type)        devices = devices.filter(d => d.type === data.type);
      if (data?.state)       devices = devices.filter(d => d.state === data.state);
      if (data?.project_id)  devices = devices.filter(d => d.project_id === data.project_id);
      if (data?.capability)  devices = devices.filter(d => Array.isArray(d.capabilities) && d.capabilities.includes(data.capability));
      if (data?.protocol)    devices = devices.filter(d => d.protocol === data.protocol);
      if (data?.online_only) devices = devices.filter(d => d.state === 'online');

      return {
        status: 200,
        data: {
          devices: devices.map(d => this._sanitize(d)),
          total:   devices.length
        }
      };
    } catch (err) {
      return this._handleHandlerError('device-registry.ui.list.failed', err, 'ui_list');
    }
  }

  async handleGet(data) {
    try {
      if (!data?.device_id) {
        return this._errorResponse(400, 'VALIDATION_FAILED', 'device_id requerido', { field: 'device_id' });
      }
      const device = this.devices.get(data.device_id);
      if (!device) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Dispositivo ${data.device_id} no encontrado`, {
          entity_type: 'device', entity_id: data.device_id
        });
      }
      return { status: 200, data: { device: this._sanitize(device) } };
    } catch (err) {
      return this._handleHandlerError('device-registry.ui.get.failed', err, 'ui_get');
    }
  }

  async handleRegister(data) {
    try {
      if (!data?.device_id) {
        return this._errorResponse(400, 'VALIDATION_FAILED', 'device_id requerido', { field: 'device_id' });
      }
      await this.onDeviceRegister({ data });
      const device = this.devices.get(data.device_id);
      return { status: 201, data: { device: this._sanitize(device) } };
    } catch (err) {
      return this._handleHandlerError('device-registry.ui.register.failed', err, 'ui_register');
    }
  }

  async handleUnregister(data) {
    try {
      if (!data?.device_id) {
        return this._errorResponse(400, 'VALIDATION_FAILED', 'device_id requerido', { field: 'device_id' });
      }
      const existed = this.devices.has(data.device_id);
      await this.onDeviceUnregister({ data });
      return { status: 200, data: { removed: existed, device_id: data.device_id } };
    } catch (err) {
      return this._handleHandlerError('device-registry.ui.unregister.failed', err, 'ui_unregister');
    }
  }

  async handleStats() {
    try {
      const devices = Array.from(this.devices.values());
      const byType = {};
      const byProtocol = {};
      const byState = { online: 0, offline: 0, error: 0 };

      for (const d of devices) {
        byType[d.type] = (byType[d.type] || 0) + 1;
        byProtocol[d.protocol] = (byProtocol[d.protocol] || 0) + 1;
        if (byState[d.state] !== undefined) byState[d.state]++;
        else byState[d.state] = 1;
      }

      return {
        status: 200,
        data: {
          total:       devices.length,
          by_type:     byType,
          by_protocol: byProtocol,
          by_state:    byState,
          metrics:     { ...this.internalMetrics }
        }
      };
    } catch (err) {
      return this._handleHandlerError('device-registry.ui.stats.failed', err, 'ui_stats');
    }
  }

  // ==========================================
  // Public API (consumida por otros modulos via core.modules.get)
  // ==========================================

  getDevice(deviceId) {
    return this.devices.get(deviceId) || null;
  }

  listDevices(filter = {}) {
    let devices = Array.from(this.devices.values());
    if (filter.type)       devices = devices.filter(d => d.type === filter.type);
    if (filter.state)      devices = devices.filter(d => d.state === filter.state);
    if (filter.capability) devices = devices.filter(d => Array.isArray(d.capabilities) && d.capabilities.includes(filter.capability));
    if (filter.project_id) devices = devices.filter(d => d.project_id === filter.project_id);
    if (filter.protocol)   devices = devices.filter(d => d.protocol === filter.protocol);
    return devices;
  }

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
      const raw  = await fs.promises.readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.devices)) {
        for (const device of data.devices) {
          if (device?.device_id) this.devices.set(device.device_id, device);
        }
      }
      this.logger.info('device-registry.loaded_from_disk', {
        devices: this.devices.size, file: filePath
      });
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('device-registry.load_error', { error: err.message });
      }
    }
  }

  async _persistToDisk() {
    const filePath = path.join(this.config.data_path, 'registry.json');
    const tmpPath  = filePath + '.tmp';
    try {
      await fs.promises.mkdir(this.config.data_path, { recursive: true });
      const data = {
        _version: '2.0.0',
        _updated: new Date().toISOString(),
        devices:  Array.from(this.devices.values())
      };
      await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      await fs.promises.rename(tmpPath, filePath);
      this._dirty = false;
    } catch (err) {
      this.logger.error('device-registry.persist_error', { error: err.message });
      this.metrics?.increment('device-registry.errors', { kind: 'persist', code: 'INTERNAL_ERROR' });
    }
  }

  _persistIfDirty() {
    if (this._dirty) this._persistToDisk();
  }

  // ==========================================
  // Helpers POC2
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details && typeof details === 'object') error.details = details;
    return { status, error };
  }

  _handleHandlerError(logEvent, err, kind) {
    const code   = err._code || this._classifyHandlerError(err);
    const status = code === 'VALIDATION_FAILED'      ? 400 :
                   code === 'RESOURCE_NOT_FOUND'     ? 404 :
                   code === 'AUTHORIZATION_REQUIRED' ? 403 :
                   code === 'CONFLICT'               ? 409 : 500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code });
    this.metrics?.increment('device-registry.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('not found'))                                                          return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('validation')) return 'VALIDATION_FAILED';
    if (msg.includes('unauthorized') || msg.includes('forbidden'))                          return 'AUTHORIZATION_REQUIRED';
    if (msg.includes('conflict') || msg.includes('already exists'))                         return 'CONFLICT';
    return 'INTERNAL_ERROR';
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      timestamp:      new Date().toISOString(),
      ...payload
    };
    await this.eventBus.publish(name, enriched);
  }

  // Auxiliar canonico de parsing MQTT (5o helper)
  _parsePayload(payload, source = '') {
    try {
      if (typeof payload === 'string') return JSON.parse(payload);
      if (Buffer.isBuffer(payload))    return JSON.parse(payload.toString());
      return payload;
    } catch {
      this.logger.warn('device-registry.mqtt.parse_error', { source });
      this.metrics?.increment('device-registry.errors', { kind: 'mqtt_parse', code: 'VALIDATION_FAILED' });
      return null;
    }
  }

  // ==========================================
  // Internals
  // ==========================================

  _sanitize(device) {
    return { ...device };
  }

  _inferType(data) {
    if (data.printer_ready !== undefined || data.printer_name) return 'print-proxy';
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

  _metaDiff(prev, next) {
    const diff = {};
    for (const [k, v] of Object.entries(next)) {
      if (JSON.stringify(prev[k]) !== JSON.stringify(v)) diff[k] = { from: prev[k] ?? null, to: v };
    }
    return diff;
  }

  _recalcMetrics() {
    let online = 0, offline = 0;
    for (const d of this.devices.values()) {
      if (d.state === 'online') online++;
      else offline++;
    }
    this.internalMetrics.online_current  = online;
    this.internalMetrics.offline_current = offline;
    this.metrics?.gauge('devices.online.current',  online);
    this.metrics?.gauge('devices.offline.current', offline);
  }
}

module.exports = DeviceRegistryModule;

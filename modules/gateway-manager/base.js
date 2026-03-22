/**
 * GatewayBase — Clase base para gateways MQTT↔protocolo nativo.
 *
 * Un gateway es un "ESP32 virtual" en software: recibe comandos MQTT,
 * los traduce al protocolo nativo del dispositivo, y responde por MQTT.
 *
 * Desde el servidor, un gateway es indistinguible de un ESP32 real.
 * Mismo contrato MQTT: birth, status, command, ack.
 *
 * Cada subclase (TCP, BLE, USB, CMD) implementa:
 *   - _discoverDevices() → dispositivos encontrados
 *   - _createTransport(device) → instancia de transporte
 *   - _getProtocol() → nombre del protocolo
 *
 * Contrato MQTT por dispositivo gestionado:
 *   devices/{project}/{device_id}/birth    → birth message (retained)
 *   devices/{project}/{device_id}/lwt      → LWT (retained)
 *   {domain}/{project}/print/{device_id}   ← comandos (subscribe)
 *   {domain}/{project}/printed/{device_id} → ACK (publish)
 *   {domain}/{project}/status/{device_id}  → status periódico
 */

class GatewayBase {
  /**
   * @param {string} type — Tipo de gateway (tcp, ble, usb, cmd)
   * @param {Object} config — Configuración del gateway
   * @param {Object} deps — { mqtt, eventBus, logger }
   */
  constructor(type, config, deps) {
    this.type = type;
    this.config = config || {};
    this.mqtt = deps.mqtt;
    this.eventBus = deps.eventBus;
    this.logger = deps.logger;
    this.projectId = config.project_id || 'default';

    // Dispositivos gestionados: device_id → { transport, config, state, last_seen }
    this.devices = new Map();

    // Listener MQTT para comandos
    this._onMqttMessage = null;

    // Timer de status periódico
    this._statusTimer = null;

    // Estado del gateway
    this.state = 'stopped'; // stopped, running, error
    this.startedAt = null;

    // Métricas
    this.metrics = {
      devices_found: 0,
      commands_processed: 0,
      errors: 0
    };
  }

  /**
   * Arranca el gateway: descubre dispositivos, publica births, suscribe a comandos.
   */
  async start() {
    this.logger.info(`gateway.${this.type}.starting`);

    try {
      // Descubrir dispositivos
      const manualDevices = this.config.manual_devices || [];
      const discoveredDevices = this.config.autodiscovery !== false
        ? await this._discoverDevices()
        : [];

      const allDevices = [...manualDevices, ...discoveredDevices];

      // Registrar cada dispositivo
      for (const deviceConfig of allDevices) {
        await this._addDevice(deviceConfig);
      }

      // Suscribirse a comandos MQTT
      this._onMqttMessage = this._handleCommand.bind(this);
      this.mqtt.on('message', this._onMqttMessage);

      // Suscribir a topics de comando para cada dispositivo
      for (const deviceId of this.devices.keys()) {
        await this.mqtt.subscribe(`impresion/${this.projectId}/print/${deviceId}`);
      }

      // Status periódico cada 30s
      this._statusTimer = setInterval(() => this._publishAllStatus(), 30000);

      this.state = 'running';
      this.startedAt = new Date().toISOString();

      this.logger.info(`gateway.${this.type}.started`, {
        devices: this.devices.size,
        manual: manualDevices.length,
        discovered: discoveredDevices.length
      });
    } catch (err) {
      this.state = 'error';
      this.logger.error(`gateway.${this.type}.start_error`, { error: err.message });
      throw err;
    }
  }

  /**
   * Para el gateway: desconecta transportes, limpia suscripciones.
   */
  async stop() {
    this.logger.info(`gateway.${this.type}.stopping`);

    // Parar status timer
    if (this._statusTimer) {
      clearInterval(this._statusTimer);
      this._statusTimer = null;
    }

    // Remover listener MQTT
    if (this._onMqttMessage) {
      this.mqtt.removeListener('message', this._onMqttMessage);
      this._onMqttMessage = null;
    }

    // Publicar LWT y desconectar cada dispositivo
    for (const [deviceId, entry] of this.devices) {
      await this._publishLwt(deviceId);
      if (entry.transport) {
        try { await entry.transport.desconectar(); } catch {}
      }
    }

    this.devices.clear();
    this.state = 'stopped';
    this.logger.info(`gateway.${this.type}.stopped`);
  }

  // ==========================================
  // Device management
  // ==========================================

  async _addDevice(deviceConfig) {
    const deviceId = deviceConfig.device_id || deviceConfig.nombre || deviceConfig.name;
    if (!deviceId || this.devices.has(deviceId)) return;

    const transport = await this._createTransport(deviceConfig);

    this.devices.set(deviceId, {
      config: deviceConfig,
      transport,
      state: 'offline',
      last_seen: null,
      type: deviceConfig.type || deviceConfig.tipo || 'unknown',
      capabilities: deviceConfig.capabilities || deviceConfig.capacidades || ['imprimir']
    });

    this.metrics.devices_found++;

    // Publicar birth message
    await this._publishBirth(deviceId);

    // Intentar conectar
    if (transport) {
      const result = await transport.conectar();
      if (result.ok) {
        this.devices.get(deviceId).state = 'online';
        this.devices.get(deviceId).last_seen = new Date().toISOString();
      }
    }

    // Publicar status
    await this._publishStatus(deviceId);
  }

  // ==========================================
  // MQTT contract: birth, lwt, status, command/ack
  // ==========================================

  async _publishBirth(deviceId) {
    const entry = this.devices.get(deviceId);
    if (!entry) return;

    const topic = `devices/${this.projectId}/${deviceId}/birth`;
    const payload = {
      device_id: deviceId,
      type: entry.type,
      capabilities: entry.capabilities,
      protocol: this._getProtocol(),
      gateway: {
        type: `gateway-${this.type}`,
        version: '1.0.0',
        host: require('os').hostname()
      },
      timestamp: new Date().toISOString()
    };

    await this.mqtt.publish(topic, JSON.stringify(payload), { qos: 1, retain: true });
  }

  async _publishLwt(deviceId) {
    const topic = `devices/${this.projectId}/${deviceId}/lwt`;
    await this.mqtt.publish(topic, JSON.stringify({
      device_id: deviceId,
      online: false,
      timestamp: new Date().toISOString()
    }), { qos: 1, retain: true });
  }

  async _publishStatus(deviceId) {
    const entry = this.devices.get(deviceId);
    if (!entry) return;

    const topic = `impresion/${this.projectId}/status/${deviceId}`;
    const transportState = entry.transport ? await entry.transport.getEstado() : { conectado: false };

    const payload = {
      device_id: deviceId,
      project_id: this.projectId,
      online: transportState.conectado,
      type: entry.type,
      capabilities: entry.capabilities,
      protocol: this._getProtocol(),
      gateway: `gateway-${this.type}`,
      ...entry.config.metadata,
      timestamp: new Date().toISOString()
    };

    await this.mqtt.publish(topic, JSON.stringify(payload), { qos: 0 });
  }

  _publishAllStatus() {
    for (const deviceId of this.devices.keys()) {
      this._publishStatus(deviceId).catch(() => {});
    }
  }

  /**
   * Handler de comandos MQTT: traduce al protocolo nativo.
   * Topic: impresion/{project}/print/{device_id}
   * Payload: { job_id, data (base64) }
   */
  async _handleCommand(topic, payload) {
    const match = topic.match(new RegExp(`^impresion/${this.projectId}/print/([^/]+)$`));
    if (!match) return;

    const deviceId = match[1];
    const entry = this.devices.get(deviceId);
    if (!entry || !entry.transport) return;

    let data;
    try {
      data = typeof payload === 'string' ? JSON.parse(payload)
           : Buffer.isBuffer(payload) ? JSON.parse(payload.toString())
           : payload;
    } catch {
      return;
    }

    const jobId = data.job_id || `gw_${Date.now().toString(36)}`;
    const rawData = data.data ? Buffer.from(data.data, 'base64') : null;

    if (!rawData) {
      await this._publishAck(deviceId, jobId, 'error', 'No data in payload');
      return;
    }

    this.metrics.commands_processed++;

    try {
      const result = await entry.transport.enviar(rawData);
      if (result.ok) {
        await this._publishAck(deviceId, jobId, 'ok', null, result.bytes);
      } else {
        this.metrics.errors++;
        await this._publishAck(deviceId, jobId, 'error', result.error);
      }
    } catch (err) {
      this.metrics.errors++;
      await this._publishAck(deviceId, jobId, 'error', err.message);
    }
  }

  async _publishAck(deviceId, jobId, status, error, bytes) {
    const topic = `impresion/${this.projectId}/printed/${deviceId}`;
    const payload = {
      job_id: jobId,
      status,
      error: error || undefined,
      bytes: bytes || undefined,
      timestamp: new Date().toISOString()
    };

    await this.mqtt.publish(topic, JSON.stringify(payload), { qos: 1 });
  }

  // ==========================================
  // Abstract methods (subclases implementan)
  // ==========================================

  /**
   * Descubrir dispositivos del protocolo nativo.
   * @returns {Promise<Array<{device_id, host?, port?, ...}>>}
   */
  async _discoverDevices() {
    return [];
  }

  /**
   * Crear instancia de transporte para un dispositivo.
   * @param {Object} deviceConfig
   * @returns {Promise<TransporteBase>}
   */
  async _createTransport(deviceConfig) {
    return null;
  }

  /**
   * Nombre del protocolo para metadata.
   * @returns {string}
   */
  _getProtocol() {
    return this.type;
  }

  // ==========================================
  // Info
  // ==========================================

  getInfo() {
    const devices = [];
    for (const [id, entry] of this.devices) {
      devices.push({
        device_id: id,
        type: entry.type,
        state: entry.state,
        capabilities: entry.capabilities,
        last_seen: entry.last_seen
      });
    }

    return {
      type: this.type,
      state: this.state,
      started_at: this.startedAt,
      devices,
      devices_count: devices.length,
      metrics: { ...this.metrics }
    };
  }
}

module.exports = GatewayBase;

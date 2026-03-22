/**
 * Módulo Device Shadow v1.0.0
 *
 * Sincronización bidireccional de estado entre servidor y dispositivos.
 * Implementa el patrón desired/reported/delta:
 *
 *   desired  — lo que el servidor quiere que el dispositivo tenga
 *   reported — lo que el dispositivo dice que tiene
 *   delta    — diferencia: keys de desired que difieren de reported
 *
 * Topics MQTT:
 *   devices/{project}/{device_id}/state/reported  ← dispositivo publica (escuchamos)
 *   devices/{project}/{device_id}/state/desired   → servidor publica (retained)
 *   devices/{project}/{device_id}/state/delta     → este módulo computa (retained)
 *
 * Flujo:
 *   1. Módulo X escribe desired via evento shadow.set_desired
 *   2. Este módulo guarda desired, computa delta, publica delta a MQTT
 *   3. Dispositivo lee delta → aplica cambios → publica reported
 *   4. Este módulo recibe reported, recalcula delta
 *   5. Si delta vacío → publica shadow.synced
 *
 * Tier: tier_2_platform
 */

const fs = require('fs');
const path = require('path');

class DeviceShadowModule {
  constructor() {
    this.name = 'device-shadow';
    this.version = '1.0.0';

    // Dependencias
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    // Config
    this.config = {
      persist_interval_ms: 30000,
      data_path: './data/devices'
    };

    // Shadows: device_id → { reported, desired, delta, last_reported_at, last_desired_at }
    this.shadows = new Map();

    // Persistencia
    this._persistTimer = null;
    this._dirty = false;

    // MQTT listener
    this._onMqttMessage = null;

    // Métricas
    this.internalMetrics = {
      reported_updates_total: 0,
      desired_updates_total: 0,
      deltas_computed_total: 0,
      synced_total: 0
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

    if (core.config?.['device-shadow']) {
      this.config = { ...this.config, ...core.config['device-shadow'] };
    }

    this.config.data_path = path.resolve(this.config.data_path);

    await this._loadFromDisk();
    await this._startMqttListeners();

    this._persistTimer = setInterval(() => this._persistIfDirty(), this.config.persist_interval_ms);

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      shadows_loaded: this.shadows.size
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    this._stopMqttListeners();

    if (this._persistTimer) {
      clearInterval(this._persistTimer);
      this._persistTimer = null;
    }

    await this._persistToDisk();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // MQTT Listeners
  // ==========================================

  async _startMqttListeners() {
    const mqtt = this.eventBus?.mqtt;
    if (!mqtt || !mqtt.isConnected) {
      this.logger.warn('device-shadow.mqtt.not_available');
      return;
    }

    this._onMqttMessage = this._handleMqttMessage.bind(this);
    mqtt.on('message', this._onMqttMessage);

    try {
      await mqtt.subscribe('devices/+/+/state/reported');
      this.logger.info('device-shadow.mqtt.subscribed', {
        topic: 'devices/+/+/state/reported'
      });
    } catch (err) {
      this.logger.error('device-shadow.mqtt.subscribe_error', { error: err.message });
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
    // devices/{project}/{device_id}/state/reported
    const match = topic.match(/^devices\/([^/]+)\/([^/]+)\/state\/reported$/);
    if (!match) return;

    const [, projectId, deviceId] = match;
    const data = this._parsePayload(payload);
    if (!data) return;

    this._updateReported(deviceId, projectId, data);
  }

  // ==========================================
  // Core: reported/desired/delta
  // ==========================================

  _updateReported(deviceId, projectId, reported) {
    this.internalMetrics.reported_updates_total++;

    const shadow = this._getOrCreateShadow(deviceId);
    shadow.reported = { ...shadow.reported, ...reported };
    shadow.last_reported_at = new Date().toISOString();
    this._dirty = true;

    this.logger.info('device-shadow.reported.updated', {
      device_id: deviceId,
      keys: Object.keys(reported)
    });

    this.eventBus.publish('shadow.updated', {
      device_id: deviceId,
      project_id: projectId,
      reported: shadow.reported,
      timestamp: shadow.last_reported_at
    });

    // Recalcular delta
    this._computeAndPublishDelta(deviceId, projectId);
  }

  _updateDesired(deviceId, projectId, desired) {
    this.internalMetrics.desired_updates_total++;

    const shadow = this._getOrCreateShadow(deviceId);

    // Merge desired (permite actualización parcial)
    shadow.desired = { ...shadow.desired, ...desired };
    shadow.last_desired_at = new Date().toISOString();
    this._dirty = true;

    // Publicar desired a MQTT (retained para que el dispositivo lo lea al conectar)
    const mqtt = this.eventBus?.mqtt;
    if (mqtt?.isConnected) {
      const topic = `devices/${projectId}/${deviceId}/state/desired`;
      mqtt.publish(topic, JSON.stringify(shadow.desired), { qos: 1, retain: true });
    }

    this.logger.info('device-shadow.desired.updated', {
      device_id: deviceId,
      keys: Object.keys(desired)
    });

    // Recalcular delta
    this._computeAndPublishDelta(deviceId, projectId);
  }

  _computeAndPublishDelta(deviceId, projectId) {
    const shadow = this.shadows.get(deviceId);
    if (!shadow) return;

    const delta = this._computeDelta(shadow.desired, shadow.reported);
    const hadDelta = Object.keys(shadow.delta).length > 0;
    shadow.delta = delta;
    this._dirty = true;

    this.internalMetrics.deltas_computed_total++;

    // Publicar delta a MQTT (retained)
    const mqtt = this.eventBus?.mqtt;
    if (mqtt?.isConnected) {
      const topic = `devices/${projectId}/${deviceId}/state/delta`;
      mqtt.publish(topic, JSON.stringify(delta), { qos: 1, retain: true });
    }

    if (Object.keys(delta).length > 0) {
      this.eventBus.publish('shadow.delta', {
        device_id: deviceId,
        project_id: projectId,
        delta,
        timestamp: new Date().toISOString()
      });
    } else if (hadDelta) {
      // Delta se vació → dispositivo sincronizado
      this.internalMetrics.synced_total++;
      this.logger.info('device-shadow.synced', { device_id: deviceId });
      this.eventBus.publish('shadow.synced', {
        device_id: deviceId,
        project_id: projectId,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Computa delta entre desired y reported.
   * Solo incluye keys de desired cuyo valor difiere de reported (shallow comparison).
   * Si desired no tiene keys, delta está vacío.
   */
  _computeDelta(desired, reported) {
    const delta = {};

    for (const [key, desiredValue] of Object.entries(desired)) {
      const reportedValue = reported[key];

      if (typeof desiredValue === 'object' && desiredValue !== null &&
          typeof reportedValue === 'object' && reportedValue !== null) {
        // Recursive comparison para objetos anidados (1 nivel)
        const subDelta = {};
        let hasSubDiff = false;
        for (const [subKey, subVal] of Object.entries(desiredValue)) {
          if (JSON.stringify(subVal) !== JSON.stringify(reportedValue[subKey])) {
            subDelta[subKey] = subVal;
            hasSubDiff = true;
          }
        }
        if (hasSubDiff) {
          delta[key] = subDelta;
        }
      } else if (JSON.stringify(desiredValue) !== JSON.stringify(reportedValue)) {
        delta[key] = desiredValue;
      }
    }

    return delta;
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onSetDesired(event) {
    const data = event?.data || event?.payload || event;
    const { device_id, project_id, state } = data;

    if (!device_id) {
      this.logger.warn('device-shadow.set_desired.missing_device_id');
      return;
    }
    if (!state || typeof state !== 'object') {
      this.logger.warn('device-shadow.set_desired.missing_state', { device_id });
      return;
    }

    this._updateDesired(device_id, project_id || 'default', state);
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleGetReported(data) {
    if (!data?.device_id) return { status: 400, error: 'device_id requerido' };

    const shadow = this.shadows.get(data.device_id);
    if (!shadow) return { status: 404, error: `Shadow no encontrado para ${data.device_id}` };

    return {
      status: 200,
      data: { device_id: data.device_id, reported: shadow.reported, last_reported_at: shadow.last_reported_at }
    };
  }

  async handleGetDesired(data) {
    if (!data?.device_id) return { status: 400, error: 'device_id requerido' };

    const shadow = this.shadows.get(data.device_id);
    if (!shadow) return { status: 404, error: `Shadow no encontrado para ${data.device_id}` };

    return {
      status: 200,
      data: { device_id: data.device_id, desired: shadow.desired, last_desired_at: shadow.last_desired_at }
    };
  }

  async handleGetDelta(data) {
    if (!data?.device_id) return { status: 400, error: 'device_id requerido' };

    const shadow = this.shadows.get(data.device_id);
    if (!shadow) return { status: 404, error: `Shadow no encontrado para ${data.device_id}` };

    return {
      status: 200,
      data: {
        device_id: data.device_id,
        delta: shadow.delta,
        synced: Object.keys(shadow.delta).length === 0
      }
    };
  }

  async handleSetDesired(data) {
    if (!data?.device_id) return { status: 400, error: 'device_id requerido' };
    if (!data?.state) return { status: 400, error: 'state requerido' };

    this._updateDesired(data.device_id, data.project_id || 'default', data.state);

    const shadow = this.shadows.get(data.device_id);
    return {
      status: 200,
      data: {
        device_id: data.device_id,
        desired: shadow.desired,
        delta: shadow.delta
      }
    };
  }

  async handleGetFull(data) {
    if (!data?.device_id) return { status: 400, error: 'device_id requerido' };

    const shadow = this.shadows.get(data.device_id);
    if (!shadow) return { status: 404, error: `Shadow no encontrado para ${data.device_id}` };

    return {
      status: 200,
      data: {
        device_id: data.device_id,
        reported: shadow.reported,
        desired: shadow.desired,
        delta: shadow.delta,
        synced: Object.keys(shadow.delta).length === 0,
        last_reported_at: shadow.last_reported_at,
        last_desired_at: shadow.last_desired_at
      }
    };
  }

  // ==========================================
  // Public API (para otros módulos)
  // ==========================================

  getReported(deviceId) {
    return this.shadows.get(deviceId)?.reported || null;
  }

  getDesired(deviceId) {
    return this.shadows.get(deviceId)?.desired || null;
  }

  getDelta(deviceId) {
    return this.shadows.get(deviceId)?.delta || null;
  }

  setDesired(deviceId, projectId, state) {
    this._updateDesired(deviceId, projectId, state);
  }

  isSynced(deviceId) {
    const shadow = this.shadows.get(deviceId);
    return shadow ? Object.keys(shadow.delta).length === 0 : true;
  }

  // ==========================================
  // Persistencia
  // ==========================================

  _getOrCreateShadow(deviceId) {
    if (!this.shadows.has(deviceId)) {
      this.shadows.set(deviceId, {
        reported: {},
        desired: {},
        delta: {},
        last_reported_at: null,
        last_desired_at: null
      });
    }
    return this.shadows.get(deviceId);
  }

  async _loadFromDisk() {
    const filePath = path.join(this.config.data_path, 'shadows.json');

    try {
      await fs.promises.mkdir(this.config.data_path, { recursive: true });
      const raw = await fs.promises.readFile(filePath, 'utf8');
      const data = JSON.parse(raw);

      if (data.shadows && typeof data.shadows === 'object') {
        for (const [deviceId, shadow] of Object.entries(data.shadows)) {
          this.shadows.set(deviceId, shadow);
        }
      }

      this.logger.info('device-shadow.loaded_from_disk', { shadows: this.shadows.size });
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('device-shadow.load_error', { error: err.message });
      }
    }
  }

  async _persistToDisk() {
    const filePath = path.join(this.config.data_path, 'shadows.json');

    try {
      await fs.promises.mkdir(this.config.data_path, { recursive: true });

      const data = {
        _version: '1.0.0',
        _updated: new Date().toISOString(),
        shadows: Object.fromEntries(this.shadows)
      };

      await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
      this._dirty = false;
    } catch (err) {
      this.logger.error('device-shadow.persist_error', { error: err.message });
    }
  }

  _persistIfDirty() {
    if (this._dirty) {
      this._persistToDisk();
    }
  }

  _parsePayload(payload) {
    try {
      if (typeof payload === 'string') return JSON.parse(payload);
      if (Buffer.isBuffer(payload)) return JSON.parse(payload.toString());
      return payload;
    } catch {
      return null;
    }
  }
}

module.exports = DeviceShadowModule;

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const BaseModule = require('../_shared/base-module');
class DeviceShadowModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'device-shadow';
    this.version = '2.0.0';
    this.config = {
      persist_interval_ms: 30000,
      data_path: './data/devices'
    };

    // Shadows: device_id → { reported, desired, delta, last_reported_at, last_desired_at }
    this.shadows = new Map();

    this._persistTimer    = null;
    this._dirty           = false;
    this._onMqttMessage   = null;

    this.internalMetrics = {
      reported_updates_total: 0,
      desired_updates_total:  0,
      deltas_computed_total:  0,
      synced_total:           0
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

    this.shadows.clear();
    this.internalMetrics = { reported_updates_total: 0, desired_updates_total: 0, deltas_computed_total: 0, synced_total: 0 };

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
      this.logger.info('device-shadow.mqtt.subscribed', { topic: 'devices/+/+/state/reported' });
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
    const data = this._parsePayload(payload, topic);
    if (!data) return;

    this._updateReported(deviceId, projectId, data);
  }

  // ==========================================
  // Core: reported/desired/delta
  // ==========================================

  _updateReported(deviceId, projectId, reported, correlationId = null) {
    this.internalMetrics.reported_updates_total++;
    this.metrics?.increment('shadow.reported_updates.total');

    const shadow = this._getOrCreateShadow(deviceId);
    shadow.reported        = { ...shadow.reported, ...reported };
    shadow.last_reported_at = new Date().toISOString();
    this._dirty = true;

    this.logger.info('device-shadow.reported.updated', {
      device_id: deviceId,
      keys: Object.keys(reported)
    });

    this._publicarEvento('shadow.updated', {
      device_id:  deviceId,
      project_id: projectId,
      reported:   shadow.reported,
      timestamp:  shadow.last_reported_at
    }, { correlation_id: correlationId });

    this._computeAndPublishDelta(deviceId, projectId, correlationId);
  }

  _updateDesired(deviceId, projectId, desired, correlationId = null) {
    this.internalMetrics.desired_updates_total++;
    this.metrics?.increment('shadow.desired_updates.total');

    const shadow = this._getOrCreateShadow(deviceId);
    shadow.desired         = { ...shadow.desired, ...desired };
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

    this._computeAndPublishDelta(deviceId, projectId, correlationId);
  }

  _computeAndPublishDelta(deviceId, projectId, correlationId = null) {
    const shadow = this.shadows.get(deviceId);
    if (!shadow) return;

    const delta    = this._computeDelta(shadow.desired, shadow.reported);
    const hadDelta = Object.keys(shadow.delta).length > 0;
    shadow.delta   = delta;
    this._dirty    = true;

    this.internalMetrics.deltas_computed_total++;
    this.metrics?.increment('shadow.deltas_computed.total');

    // Publicar delta a MQTT (retained)
    const mqtt = this.eventBus?.mqtt;
    if (mqtt?.isConnected) {
      const topic = `devices/${projectId}/${deviceId}/state/delta`;
      mqtt.publish(topic, JSON.stringify(delta), { qos: 1, retain: true });
    }

    if (Object.keys(delta).length > 0) {
      this._publicarEvento('shadow.delta', {
        device_id:  deviceId,
        project_id: projectId,
        delta,
        timestamp: new Date().toISOString()
      }, { correlation_id: correlationId });
    } else if (hadDelta) {
      // Delta se vació → dispositivo sincronizado
      this.internalMetrics.synced_total++;
      this.metrics?.increment('shadow.synced.total');
      this.logger.info('device-shadow.synced', { device_id: deviceId });
      this._publicarEvento('shadow.synced', {
        device_id:  deviceId,
        project_id: projectId,
        timestamp: new Date().toISOString()
      }, { correlation_id: correlationId });
    }
  }

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
        if (hasSubDiff) delta[key] = subDelta;
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
    const data = event?.data || event;
    const { device_id, project_id, state, correlation_id } = data;

    if (!device_id) {
      this.logger.warn('device-shadow.set_desired.missing_device_id');
      return;
    }
    if (!state || typeof state !== 'object') {
      this.logger.warn('device-shadow.set_desired.missing_state', { device_id });
      return;
    }

    this._updateDesired(device_id, project_id || 'default', state, correlation_id);
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleGetReported(data) {
    try {
      if (!data?.device_id) return this._errorResponse(400, 'INVALID_INPUT', 'device_id requerido', { field: 'device_id' });

      const shadow = this.shadows.get(data.device_id);
      if (!shadow) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Shadow no encontrado para ${data.device_id}`, { entity_type: 'shadow', entity_id: data.device_id });

      return {
        status: 200,
        data: { device_id: data.device_id, reported: shadow.reported, last_reported_at: shadow.last_reported_at }
      };
    } catch (err) {
      return this._handleHandlerError('device-shadow.ui.get_reported.failed', err, 'ui_get_reported');
    }
  }

  async handleGetDesired(data) {
    try {
      if (!data?.device_id) return this._errorResponse(400, 'INVALID_INPUT', 'device_id requerido', { field: 'device_id' });

      const shadow = this.shadows.get(data.device_id);
      if (!shadow) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Shadow no encontrado para ${data.device_id}`, { entity_type: 'shadow', entity_id: data.device_id });

      return {
        status: 200,
        data: { device_id: data.device_id, desired: shadow.desired, last_desired_at: shadow.last_desired_at }
      };
    } catch (err) {
      return this._handleHandlerError('device-shadow.ui.get_desired.failed', err, 'ui_get_desired');
    }
  }

  async handleGetDelta(data) {
    try {
      if (!data?.device_id) return this._errorResponse(400, 'INVALID_INPUT', 'device_id requerido', { field: 'device_id' });

      const shadow = this.shadows.get(data.device_id);
      if (!shadow) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Shadow no encontrado para ${data.device_id}`, { entity_type: 'shadow', entity_id: data.device_id });

      return {
        status: 200,
        data: {
          device_id: data.device_id,
          delta:     shadow.delta,
          synced:    Object.keys(shadow.delta).length === 0
        }
      };
    } catch (err) {
      return this._handleHandlerError('device-shadow.ui.get_delta.failed', err, 'ui_get_delta');
    }
  }

  async handleSetDesired(data) {
    try {
      if (!data?.device_id) return this._errorResponse(400, 'INVALID_INPUT', 'device_id requerido', { field: 'device_id' });
      if (!data?.state)     return this._errorResponse(400, 'INVALID_INPUT', 'state requerido',     { field: 'state' });

      this._updateDesired(data.device_id, data.project_id || 'default', data.state, data.correlation_id);

      const shadow = this.shadows.get(data.device_id);
      return {
        status: 200,
        data: {
          device_id: data.device_id,
          desired:   shadow.desired,
          delta:     shadow.delta
        }
      };
    } catch (err) {
      return this._handleHandlerError('device-shadow.ui.set_desired.failed', err, 'ui_set_desired');
    }
  }

  async handleGetFull(data) {
    try {
      if (!data?.device_id) return this._errorResponse(400, 'INVALID_INPUT', 'device_id requerido', { field: 'device_id' });

      const shadow = this.shadows.get(data.device_id);
      if (!shadow) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Shadow no encontrado para ${data.device_id}`, { entity_type: 'shadow', entity_id: data.device_id });

      return {
        status: 200,
        data: {
          device_id:        data.device_id,
          reported:         shadow.reported,
          desired:          shadow.desired,
          delta:            shadow.delta,
          synced:           Object.keys(shadow.delta).length === 0,
          last_reported_at: shadow.last_reported_at,
          last_desired_at:  shadow.last_desired_at
        }
      };
    } catch (err) {
      return this._handleHandlerError('device-shadow.ui.get_full.failed', err, 'ui_get_full');
    }
  }

  // ==========================================
  // Public API (para otros módulos)
  // ==========================================

  getReported(deviceId) { return this.shadows.get(deviceId)?.reported || null; }
  getDesired(deviceId)  { return this.shadows.get(deviceId)?.desired  || null; }
  getDelta(deviceId)    { return this.shadows.get(deviceId)?.delta    || null; }
  isSynced(deviceId) {
    const shadow = this.shadows.get(deviceId);
    return shadow ? Object.keys(shadow.delta).length === 0 : true;
  }

  setDesired(deviceId, projectId, state) {
    this._updateDesired(deviceId, projectId, state);
  }

  // ==========================================
  // Persistencia
  // ==========================================

  _getOrCreateShadow(deviceId) {
    if (!this.shadows.has(deviceId)) {
      this.shadows.set(deviceId, {
        reported:        {},
        desired:         {},
        delta:           {},
        last_reported_at: null,
        last_desired_at:  null
      });
    }
    return this.shadows.get(deviceId);
  }

  async _loadFromDisk() {
    const filePath = path.join(this.config.data_path, 'shadows.json');
    try {
      await fs.promises.mkdir(this.config.data_path, { recursive: true });
      const raw  = await fs.promises.readFile(filePath, 'utf8');
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
    const tmpPath  = filePath + '.tmp';
    try {
      await fs.promises.mkdir(this.config.data_path, { recursive: true });
      const data = {
        _version: '2.0.0',
        _updated: new Date().toISOString(),
        shadows:  Object.fromEntries(this.shadows)
      };
      await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      await fs.promises.rename(tmpPath, filePath);
      this._dirty = false;
    } catch (err) {
      this.logger.error('device-shadow.persist_error', { error: err.message });
      this.metrics?.increment('device-shadow.errors', { kind: 'persist', code: 'UNKNOWN_ERROR' });
    }
  }

  _persistIfDirty() {
    if (this._dirty) this._persistToDisk();
  }

  _parsePayload(payload, topic = '') {
    try {
      if (typeof payload === 'string') return JSON.parse(payload);
      if (Buffer.isBuffer(payload))    return JSON.parse(payload.toString());
      return payload;
    } catch {
      this.logger.warn('device-shadow.mqtt.parse_error', { topic });
      return null;
    }
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
    const status = code === 'INVALID_INPUT'     ? 400 :
                   code === 'RESOURCE_NOT_FOUND'    ? 404 :
                   code === 'PERMISSION_DENIED'? 403 :
                   code === 'CONFLICT_STATE'              ? 409 : 500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code });
    this.metrics?.increment('device-shadow.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('not found'))                                                    return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('validation')) return 'INVALID_INPUT';
    if (msg.includes('unauthorized') || msg.includes('forbidden'))                   return 'PERMISSION_DENIED';
    if (msg.includes('conflict') || msg.includes('already exists'))                  return 'CONFLICT_STATE';
    return 'UNKNOWN_ERROR';
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...payload
    };
    await this.eventBus.publish(name, enriched);
  }
}

module.exports = DeviceShadowModule;

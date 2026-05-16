/**
 * device-health v2.0.0 — Observador puro de la flota IoT.
 *
 * Escucha eventos device.online/offline + firmware.ota_*, mantiene state
 * por dispositivo (uptime, reconexiones, periodos offline, historial OTA),
 * detecta condiciones de alerta (offline prolongado, reconnect-loops, OTA
 * fallidos) y emite alertas + reporte periódico de la flota.
 *
 * NO toma acciones correctivas — solo informa.
 *
 * Eventos del bus emitidos (todos con correlation_id + timestamp):
 *   health.alert.offline         — dispositivo lleva > N minutos offline
 *   health.alert.reconnect_loop  — dispositivo reconecta repetidamente
 *   health.alert.ota_failed      — OTA falló para un dispositivo
 *   health.report                — snapshot periódico agregado de la flota
 *
 * Subscribes:
 *   device.online             → onDeviceOnline
 *   device.offline            → onDeviceOffline
 *   firmware.ota_failed       → onOtaFailed
 *   firmware.ota_completed    → onOtaCompleted
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const BaseModule = require('../_shared/base-module');
const KNOWN_ALERT_TYPES = ['offline', 'reconnect_loop', 'ota_failed'];
const DAY_MS = 24 * 60 * 60 * 1000;

class DeviceHealthModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'device-health';
    this.version = '2.0.0';
    this.config = {
      offline_threshold_min:     5,
      reconnect_loop_threshold:  5,
      reconnect_loop_window_min: 30,
      report_interval_min:       60,
      data_path: './data/devices'
    };

    // device_id → DeviceHealthState
    this.deviceStates = new Map();

    // FIFO acotado de alertas
    this.alerts    = [];
    this.maxAlerts = 200;

    this._offlineTimers = new Map();  // device_id → setTimeout handle
    this._reportTimer   = null;

    this.internalMetrics = {
      alerts_total:          0,
      alerts_offline:        0,
      alerts_reconnect_loop: 0,
      alerts_ota_failed:     0
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

    if (core.config?.['device-health']) {
      this.config = { ...this.config, ...core.config['device-health'] };
    }

    this.config.data_path = path.resolve(this.config.data_path);

    await this._loadHistory();

    const reportMs = this.config.report_interval_min * 60 * 1000;
    this._reportTimer = setInterval(() => this._publishReport(), reportMs);

    this.logger.info('module.loaded', {
      module:                this.name,
      version:               this.version,
      devices_tracked:       this.deviceStates.size,
      offline_threshold_min: this.config.offline_threshold_min
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    if (this._reportTimer) {
      clearInterval(this._reportTimer);
      this._reportTimer = null;
    }

    for (const timer of this._offlineTimers.values()) clearTimeout(timer);
    this._offlineTimers.clear();

    await this._saveHistory();

    this.deviceStates.clear();
    this.alerts.length = 0;
    this.internalMetrics = {
      alerts_total: 0, alerts_offline: 0, alerts_reconnect_loop: 0, alerts_ota_failed: 0
    };

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Bus handlers (subscribes)
  // ==========================================

  async onDeviceOnline(event) {
    const data = event?.data || event?.payload || event;
    const { device_id, project_id, correlation_id } = data || {};
    if (!device_id) {
      this.logger.warn('device-health.online.missing_device_id');
      this.metrics?.increment('device-health.errors', { kind: 'online', code: 'INVALID_INPUT' });
      return;
    }

    const state = this._getOrCreateState(device_id);
    const now = new Date();
    const nowIso = now.toISOString();

    if (state.is_offline && state.last_offline) {
      const offlineDuration = now - new Date(state.last_offline);
      state.offline_periods.push({
        from:        state.last_offline,
        to:          nowIso,
        duration_ms: offlineDuration
      });
      if (state.offline_periods.length > 50) {
        state.offline_periods = state.offline_periods.slice(-50);
      }
    }

    state.is_offline  = false;
    state.last_online = nowIso;
    state.reconnections_24h.push(nowIso);

    const cutoff24h = new Date(now - DAY_MS).toISOString();
    state.reconnections_24h = state.reconnections_24h.filter(t => t > cutoff24h);

    this._clearOfflineTimer(device_id);

    // Reconnect loop detection
    const windowMs     = this.config.reconnect_loop_window_min * 60 * 1000;
    const windowCutoff = new Date(now - windowMs).toISOString();
    const recent       = state.reconnections_24h.filter(t => t > windowCutoff).length;

    if (recent >= this.config.reconnect_loop_threshold) {
      await this._createAlert('reconnect_loop', device_id, project_id, {
        message: `Dispositivo ${device_id} reconectó ${recent} veces en ${this.config.reconnect_loop_window_min} minutos`,
        details: { count: recent, window_min: this.config.reconnect_loop_window_min, threshold: this.config.reconnect_loop_threshold }
      }, { correlation_id });
    }
  }

  async onDeviceOffline(event) {
    const data = event?.data || event?.payload || event;
    const { device_id, project_id, reason, correlation_id } = data || {};
    if (!device_id) {
      this.logger.warn('device-health.offline.missing_device_id');
      this.metrics?.increment('device-health.errors', { kind: 'offline', code: 'INVALID_INPUT' });
      return;
    }

    const state = this._getOrCreateState(device_id);
    state.is_offline   = true;
    state.last_offline = new Date().toISOString();

    this._clearOfflineTimer(device_id);

    const thresholdMs = this.config.offline_threshold_min * 60 * 1000;
    const timer = setTimeout(async () => {
      const current = this.deviceStates.get(device_id);
      if (current?.is_offline) {
        await this._createAlert('offline', device_id, project_id, {
          message: `Dispositivo ${device_id} lleva más de ${this.config.offline_threshold_min} minutos offline (razón: ${reason || 'unknown'})`,
          details: { offline_threshold_min: this.config.offline_threshold_min, reason: reason || 'unknown', last_offline: current.last_offline }
        }, { correlation_id });
      }
    }, thresholdMs);

    this._offlineTimers.set(device_id, timer);
  }

  async onOtaFailed(event) {
    const data = event?.data || event?.payload || event;
    const { device_id, project_id, type, from, to, correlation_id } = data || {};
    if (!device_id) {
      this.logger.warn('device-health.ota_failed.missing_device_id');
      this.metrics?.increment('device-health.errors', { kind: 'ota_failed', code: 'INVALID_INPUT' });
      return;
    }

    await this._createAlert('ota_failed', device_id, project_id || null, {
      message: `OTA falló para ${device_id}: ${from || '?'} → ${to || '?'} (tipo: ${type || 'unknown'})`,
      details: { from: from || null, to: to || null, type: type || 'unknown' }
    }, { correlation_id });

    const state = this._getOrCreateState(device_id);
    state.ota_history.push({
      status: 'failed',
      from, to, type,
      timestamp: new Date().toISOString()
    });
    if (state.ota_history.length > 20) {
      state.ota_history = state.ota_history.slice(-20);
    }
  }

  async onOtaCompleted(event) {
    const data = event?.data || event?.payload || event;
    const { device_id, type, from, to } = data || {};
    if (!device_id) {
      this.logger.warn('device-health.ota_completed.missing_device_id');
      this.metrics?.increment('device-health.errors', { kind: 'ota_completed', code: 'INVALID_INPUT' });
      return;
    }

    const state = this._getOrCreateState(device_id);
    state.ota_history.push({
      status: 'completed',
      from, to, type,
      timestamp: new Date().toISOString()
    });
    if (state.ota_history.length > 20) {
      state.ota_history = state.ota_history.slice(-20);
    }
  }

  // ==========================================
  // UI handlers
  // ==========================================

  async handleDashboard(_data) {
    try {
      const devices = [];
      const now       = new Date();
      const cutoff24h = new Date(now - DAY_MS);

      for (const [deviceId, state] of this.deviceStates) {
        let totalOfflineMs = 0;
        for (const period of state.offline_periods) {
          const from = new Date(period.from);
          const to   = new Date(period.to);
          if (to > cutoff24h) {
            const effectiveFrom = from > cutoff24h ? from : cutoff24h;
            totalOfflineMs += to - effectiveFrom;
          }
        }
        if (state.is_offline && state.last_offline) {
          const offlineStart  = new Date(state.last_offline);
          const effectiveStart = offlineStart > cutoff24h ? offlineStart : cutoff24h;
          totalOfflineMs += now - effectiveStart;
        }

        const uptimePct = Math.max(0, Math.min(100,
          ((DAY_MS - totalOfflineMs) / DAY_MS) * 100
        ));

        const reconnections = state.reconnections_24h.filter(t => new Date(t) > cutoff24h).length;

        devices.push({
          device_id:               deviceId,
          is_offline:              state.is_offline,
          uptime_pct_24h:          Math.round(uptimePct * 10) / 10,
          reconnections_24h:       reconnections,
          last_online:             state.last_online,
          last_offline:            state.last_offline,
          consecutive_offline_min: state.is_offline && state.last_offline
            ? Math.round((now - new Date(state.last_offline)) / 60000)
            : 0
        });
      }

      const online       = devices.filter(d => !d.is_offline).length;
      const offline      = devices.filter(d => d.is_offline).length;
      const activeAlerts = this.alerts.filter(a => !a.resolved).length;

      return {
        status: 200,
        data: {
          summary: {
            total:          devices.length,
            online,
            offline,
            active_alerts:  activeAlerts,
            avg_uptime_pct: devices.length > 0
              ? Math.round(devices.reduce((s, d) => s + d.uptime_pct_24h, 0) / devices.length * 10) / 10
              : 100
          },
          devices,
          recent_alerts: this.alerts.slice(0, 10)
        }
      };
    } catch (err) {
      return this._handleHandlerError('device-health.ui.dashboard.failed', err, 'ui_dashboard');
    }
  }

  async handleDeviceHistory(data) {
    try {
      if (!data?.device_id) {
        return this._errorResponse(400, 'INVALID_INPUT', 'device_id requerido', { field: 'device_id' });
      }

      const state = this.deviceStates.get(data.device_id);
      if (!state) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `No hay historial para ${data.device_id}`, {
          entity_type: 'device_health_state', entity_id: data.device_id
        });
      }

      return {
        status: 200,
        data: {
          device_id:         data.device_id,
          is_offline:        state.is_offline,
          last_online:       state.last_online,
          last_offline:      state.last_offline,
          reconnections_24h: state.reconnections_24h.length,
          offline_periods:   state.offline_periods.slice(-20),
          ota_history:       state.ota_history,
          alerts:            this.alerts.filter(a => a.device_id === data.device_id).slice(0, 20)
        }
      };
    } catch (err) {
      return this._handleHandlerError('device-health.ui.device_history.failed', err, 'ui_device_history');
    }
  }

  async handleAlerts(data) {
    try {
      let alerts = [...this.alerts];

      if (data?.active_only) alerts = alerts.filter(a => !a.resolved);
      if (data?.device_id)   alerts = alerts.filter(a => a.device_id === data.device_id);
      if (data?.type)        alerts = alerts.filter(a => a.type === data.type);

      const limit = parseInt(data?.limit, 10) || 50;

      return {
        status: 200,
        data: {
          alerts: alerts.slice(0, limit),
          total:  alerts.length,
          active: this.alerts.filter(a => !a.resolved).length
        }
      };
    } catch (err) {
      return this._handleHandlerError('device-health.ui.alerts.failed', err, 'ui_alerts');
    }
  }

  // ==========================================
  // Alert system
  // ==========================================

  async _createAlert(type, deviceId, projectId, body, sourcePayload = null) {
    if (!KNOWN_ALERT_TYPES.includes(type)) {
      this.logger.warn('device-health.alert.unknown_type', { type, device_id: deviceId });
      this.metrics?.increment('device-health.errors', { kind: 'alert', code: 'INVALID_INPUT' });
      return;
    }

    const message   = body?.message || `Alerta ${type} en ${deviceId}`;
    const details   = body?.details || {};
    const timestamp = new Date().toISOString();

    const alert = {
      type,
      device_id:  deviceId,
      project_id: projectId,
      message,
      details,
      timestamp,
      resolved:   false
    };

    this.alerts.unshift(alert);
    if (this.alerts.length > this.maxAlerts) this.alerts.pop();

    this.internalMetrics.alerts_total++;
    this.internalMetrics[`alerts_${type}`] = (this.internalMetrics[`alerts_${type}`] || 0) + 1;
    this.metrics?.increment('health.alerts.total');
    this.metrics?.increment(`health.alerts.${type}`);

    this.logger.warn(`device-health.alert.${type}`, { device_id: deviceId, message, details });

    await this._publicarEvento(`health.alert.${type}`, {
      device_id:  deviceId,
      project_id: projectId,
      message,
      details,
      timestamp
    }, sourcePayload);
  }

  // ==========================================
  // Periodic report
  // ==========================================

  async _publishReport() {
    const now = new Date();

    let online = 0, offline = 0;
    for (const state of this.deviceStates.values()) {
      if (state.is_offline) offline++;
      else online++;
    }

    const activeAlerts = this.alerts.filter(a => !a.resolved).length;

    this.metrics?.gauge('health.flota.online',  online);
    this.metrics?.gauge('health.flota.offline', offline);

    await this._publicarEvento('health.report', {
      total_devices: this.deviceStates.size,
      online,
      offline,
      active_alerts: activeAlerts,
      timestamp:     now.toISOString()
    });
  }

  // ==========================================
  // State management
  // ==========================================

  _getOrCreateState(deviceId) {
    if (!this.deviceStates.has(deviceId)) {
      this.deviceStates.set(deviceId, {
        is_offline:        true,
        last_online:       null,
        last_offline:      null,
        reconnections_24h: [],
        offline_periods:   [],
        ota_history:       []
      });
    }
    return this.deviceStates.get(deviceId);
  }

  _clearOfflineTimer(deviceId) {
    const timer = this._offlineTimers.get(deviceId);
    if (timer) {
      clearTimeout(timer);
      this._offlineTimers.delete(deviceId);
    }
  }

  // ==========================================
  // Persistencia (atomica via tmp + rename)
  // ==========================================

  async _loadHistory() {
    const filePath = path.join(this.config.data_path, 'health-history.json');
    try {
      await fs.promises.mkdir(this.config.data_path, { recursive: true });
      const raw  = await fs.promises.readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      if (data.states && typeof data.states === 'object') {
        for (const [deviceId, state] of Object.entries(data.states)) {
          this.deviceStates.set(deviceId, state);
        }
      }
      if (Array.isArray(data.alerts)) {
        this.alerts = data.alerts;
      }
      this.logger.info('device-health.loaded_from_disk', {
        devices: this.deviceStates.size,
        alerts:  this.alerts.length
      });
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('device-health.load_error', { error: err.message });
      }
    }
  }

  async _saveHistory() {
    const filePath = path.join(this.config.data_path, 'health-history.json');
    const tmpPath  = filePath + '.tmp';
    try {
      await fs.promises.mkdir(this.config.data_path, { recursive: true });
      const data = {
        _version: '2.0.0',
        _updated: new Date().toISOString(),
        states:   Object.fromEntries(this.deviceStates),
        alerts:   this.alerts
      };
      await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      await fs.promises.rename(tmpPath, filePath);
    } catch (err) {
      this.logger.error('device-health.save_error', { error: err.message });
      this.metrics?.increment('device-health.errors', { kind: 'persist', code: 'UNKNOWN_ERROR' });
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
    const status = code === 'INVALID_INPUT'      ? 400 :
                   code === 'RESOURCE_NOT_FOUND'     ? 404 :
                   code === 'PERMISSION_DENIED' ? 403 :
                   code === 'CONFLICT_STATE'               ? 409 : 500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code });
    this.metrics?.increment('device-health.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('not found'))                                                          return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('validation')) return 'INVALID_INPUT';
    if (msg.includes('unauthorized') || msg.includes('forbidden'))                          return 'PERMISSION_DENIED';
    if (msg.includes('conflict') || msg.includes('already exists'))                         return 'CONFLICT_STATE';
    return 'UNKNOWN_ERROR';
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      timestamp:      new Date().toISOString(),
      ...payload
    };
    await this.eventBus.publish(name, enriched);
  }
}

module.exports = DeviceHealthModule;

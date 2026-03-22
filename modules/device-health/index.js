/**
 * Módulo Device Health v1.0.0
 *
 * Monitoriza liveness de dispositivos, genera alertas y métricas de flota.
 *
 * Responsabilidades:
 *   - Escuchar eventos device.online/device.offline de device-registry
 *   - Detectar dispositivos offline prolongado (>N minutos)
 *   - Detectar reconnect loops (>N reconexiones en M minutos)
 *   - Alertas de OTA fallida
 *   - Métricas de uptime por dispositivo
 *   - Reporte periódico del estado de la flota
 *
 * NO toma acciones correctivas — solo informa via eventos y alertas.
 *
 * Tier: tier_3_core (depende de device-registry y firmware-manager)
 */

const fs = require('fs');
const path = require('path');

class DeviceHealthModule {
  constructor() {
    this.name = 'device-health';
    this.version = '1.0.0';

    // Dependencias
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    // Config
    this.config = {
      offline_threshold_min: 5,
      reconnect_loop_threshold: 5,
      reconnect_loop_window_min: 30,
      report_interval_min: 60,
      data_path: './data/devices'
    };

    // Estado por dispositivo: device_id → DeviceHealthState
    this.deviceStates = new Map();

    // Alertas activas: [ { type, device_id, message, timestamp, resolved } ]
    this.alerts = [];
    this.maxAlerts = 200;

    // Timers
    this._offlineTimers = new Map();  // device_id → setTimeout handle
    this._reportTimer = null;

    // Métricas
    this.internalMetrics = {
      alerts_total: 0,
      alerts_offline: 0,
      alerts_reconnect_loop: 0,
      alerts_ota_failed: 0
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

    if (core.config?.['device-health']) {
      this.config = { ...this.config, ...core.config['device-health'] };
    }

    this.config.data_path = path.resolve(this.config.data_path);

    await this._loadHistory();

    // Reporte periódico
    const reportMs = this.config.report_interval_min * 60 * 1000;
    this._reportTimer = setInterval(() => this._publishReport(), reportMs);

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      devices_tracked: this.deviceStates.size,
      offline_threshold_min: this.config.offline_threshold_min
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    if (this._reportTimer) {
      clearInterval(this._reportTimer);
      this._reportTimer = null;
    }

    for (const timer of this._offlineTimers.values()) {
      clearTimeout(timer);
    }
    this._offlineTimers.clear();

    await this._saveHistory();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onDeviceOnline(event) {
    const data = event?.data || event?.payload || event;
    const { device_id, project_id } = data;
    if (!device_id) return;

    const state = this._getOrCreateState(device_id);
    const now = new Date();

    // Si estaba offline, registrar duración
    if (state.is_offline && state.last_offline) {
      const offlineDuration = now - new Date(state.last_offline);
      state.offline_periods.push({
        from: state.last_offline,
        to: now.toISOString(),
        duration_ms: offlineDuration
      });
      // Mantener solo últimos 50 periodos
      if (state.offline_periods.length > 50) {
        state.offline_periods = state.offline_periods.slice(-50);
      }
    }

    state.is_offline = false;
    state.last_online = now.toISOString();
    state.reconnections_24h.push(now.toISOString());

    // Limpiar reconexiones fuera de ventana de 24h
    const cutoff24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    state.reconnections_24h = state.reconnections_24h.filter(t => t > cutoff24h);

    // Cancelar timer de alerta offline
    this._clearOfflineTimer(device_id);

    // Verificar reconnect loop
    const windowMs = this.config.reconnect_loop_window_min * 60 * 1000;
    const windowCutoff = new Date(now - windowMs).toISOString();
    const recentReconnections = state.reconnections_24h.filter(t => t > windowCutoff).length;

    if (recentReconnections >= this.config.reconnect_loop_threshold) {
      await this._createAlert('reconnect_loop', device_id, project_id,
        `Dispositivo ${device_id} reconectó ${recentReconnections} veces en ${this.config.reconnect_loop_window_min} minutos`
      );
    }
  }

  async onDeviceOffline(event) {
    const data = event?.data || event?.payload || event;
    const { device_id, project_id, reason } = data;
    if (!device_id) return;

    const state = this._getOrCreateState(device_id);
    state.is_offline = true;
    state.last_offline = new Date().toISOString();

    // Iniciar timer para alerta de offline prolongado
    const thresholdMs = this.config.offline_threshold_min * 60 * 1000;

    this._clearOfflineTimer(device_id);

    const timer = setTimeout(async () => {
      // Verificar que sigue offline
      const currentState = this.deviceStates.get(device_id);
      if (currentState?.is_offline) {
        await this._createAlert('offline', device_id, project_id,
          `Dispositivo ${device_id} lleva más de ${this.config.offline_threshold_min} minutos offline (razón: ${reason || 'unknown'})`
        );
      }
    }, thresholdMs);

    this._offlineTimers.set(device_id, timer);
  }

  async onOtaFailed(event) {
    const data = event?.data || event?.payload || event;
    const { device_id, type, from, to } = data;
    if (!device_id) return;

    await this._createAlert('ota_failed', device_id, null,
      `OTA falló para ${device_id}: ${from || '?'} → ${to || '?'} (tipo: ${type || 'unknown'})`
    );

    const state = this._getOrCreateState(device_id);
    state.ota_history.push({
      status: 'failed',
      from, to, type,
      timestamp: new Date().toISOString()
    });
  }

  async onOtaCompleted(event) {
    const data = event?.data || event?.payload || event;
    const { device_id, type, from, to } = data;
    if (!device_id) return;

    const state = this._getOrCreateState(device_id);
    state.ota_history.push({
      status: 'completed',
      from, to, type,
      timestamp: new Date().toISOString()
    });

    // Mantener solo últimos 20 OTAs
    if (state.ota_history.length > 20) {
      state.ota_history = state.ota_history.slice(-20);
    }
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleDashboard() {
    const devices = [];
    const now = new Date();
    const cutoff24h = new Date(now - 24 * 60 * 60 * 1000);

    for (const [deviceId, state] of this.deviceStates) {
      // Calcular uptime % últimas 24h
      let totalOfflineMs = 0;
      for (const period of state.offline_periods) {
        const from = new Date(period.from);
        const to = new Date(period.to);
        if (to > cutoff24h) {
          const effectiveFrom = from > cutoff24h ? from : cutoff24h;
          totalOfflineMs += to - effectiveFrom;
        }
      }
      // Si actualmente offline, contar desde last_offline
      if (state.is_offline && state.last_offline) {
        const offlineStart = new Date(state.last_offline);
        const effectiveStart = offlineStart > cutoff24h ? offlineStart : cutoff24h;
        totalOfflineMs += now - effectiveStart;
      }

      const uptimePct = Math.max(0, Math.min(100,
        ((24 * 60 * 60 * 1000 - totalOfflineMs) / (24 * 60 * 60 * 1000)) * 100
      ));

      const reconnections = state.reconnections_24h.filter(t => new Date(t) > cutoff24h).length;

      devices.push({
        device_id: deviceId,
        is_offline: state.is_offline,
        uptime_pct_24h: Math.round(uptimePct * 10) / 10,
        reconnections_24h: reconnections,
        last_online: state.last_online,
        last_offline: state.last_offline,
        consecutive_offline_min: state.is_offline && state.last_offline
          ? Math.round((now - new Date(state.last_offline)) / 60000)
          : 0
      });
    }

    // Resumen
    const online = devices.filter(d => !d.is_offline).length;
    const offline = devices.filter(d => d.is_offline).length;
    const activeAlerts = this.alerts.filter(a => !a.resolved).length;

    return {
      status: 200,
      data: {
        summary: {
          total: devices.length,
          online,
          offline,
          active_alerts: activeAlerts,
          avg_uptime_pct: devices.length > 0
            ? Math.round(devices.reduce((s, d) => s + d.uptime_pct_24h, 0) / devices.length * 10) / 10
            : 100
        },
        devices,
        recent_alerts: this.alerts.slice(0, 10)
      }
    };
  }

  async handleDeviceHistory(data) {
    if (!data?.device_id) return { status: 400, error: 'device_id requerido' };

    const state = this.deviceStates.get(data.device_id);
    if (!state) return { status: 404, error: `No hay historial para ${data.device_id}` };

    return {
      status: 200,
      data: {
        device_id: data.device_id,
        is_offline: state.is_offline,
        last_online: state.last_online,
        last_offline: state.last_offline,
        reconnections_24h: state.reconnections_24h.length,
        offline_periods: state.offline_periods.slice(-20),
        ota_history: state.ota_history,
        alerts: this.alerts.filter(a => a.device_id === data.device_id).slice(0, 20)
      }
    };
  }

  async handleAlerts(data) {
    let alerts = [...this.alerts];

    if (data?.active_only) {
      alerts = alerts.filter(a => !a.resolved);
    }
    if (data?.device_id) {
      alerts = alerts.filter(a => a.device_id === data.device_id);
    }
    if (data?.type) {
      alerts = alerts.filter(a => a.type === data.type);
    }

    const limit = parseInt(data?.limit) || 50;

    return {
      status: 200,
      data: {
        alerts: alerts.slice(0, limit),
        total: alerts.length,
        active: this.alerts.filter(a => !a.resolved).length
      }
    };
  }

  // ==========================================
  // Alert system
  // ==========================================

  async _createAlert(type, deviceId, projectId, message) {
    const alert = {
      type,
      device_id: deviceId,
      project_id: projectId,
      message,
      timestamp: new Date().toISOString(),
      resolved: false
    };

    this.alerts.unshift(alert);
    if (this.alerts.length > this.maxAlerts) {
      this.alerts.pop();
    }

    this.internalMetrics.alerts_total++;
    this.internalMetrics[`alerts_${type}`] = (this.internalMetrics[`alerts_${type}`] || 0) + 1;

    this.logger.warn(`device-health.alert.${type}`, {
      device_id: deviceId,
      message
    });

    await this.eventBus.publish(`health.alert.${type}`, {
      device_id: deviceId,
      project_id: projectId,
      message,
      timestamp: alert.timestamp
    });
  }

  // ==========================================
  // Periodic report
  // ==========================================

  async _publishReport() {
    const now = new Date();
    const cutoff24h = new Date(now - 24 * 60 * 60 * 1000);

    let online = 0;
    let offline = 0;

    for (const state of this.deviceStates.values()) {
      if (state.is_offline) offline++;
      else online++;
    }

    const activeAlerts = this.alerts.filter(a => !a.resolved).length;

    await this.eventBus.publish('health.report', {
      total_devices: this.deviceStates.size,
      online,
      offline,
      active_alerts: activeAlerts,
      timestamp: now.toISOString()
    });
  }

  // ==========================================
  // State management
  // ==========================================

  _getOrCreateState(deviceId) {
    if (!this.deviceStates.has(deviceId)) {
      this.deviceStates.set(deviceId, {
        is_offline: true,
        last_online: null,
        last_offline: null,
        reconnections_24h: [],
        offline_periods: [],
        ota_history: []
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
  // Persistencia
  // ==========================================

  async _loadHistory() {
    const filePath = path.join(this.config.data_path, 'health-history.json');

    try {
      await fs.promises.mkdir(this.config.data_path, { recursive: true });
      const raw = await fs.promises.readFile(filePath, 'utf8');
      const data = JSON.parse(raw);

      if (data.states) {
        for (const [deviceId, state] of Object.entries(data.states)) {
          this.deviceStates.set(deviceId, state);
        }
      }
      if (data.alerts) {
        this.alerts = data.alerts;
      }

      this.logger.info('device-health.loaded_from_disk', {
        devices: this.deviceStates.size,
        alerts: this.alerts.length
      });
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('device-health.load_error', { error: err.message });
      }
    }
  }

  async _saveHistory() {
    const filePath = path.join(this.config.data_path, 'health-history.json');

    try {
      await fs.promises.mkdir(this.config.data_path, { recursive: true });

      const data = {
        _version: '1.0.0',
        _updated: new Date().toISOString(),
        states: Object.fromEntries(this.deviceStates),
        alerts: this.alerts
      };

      await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      this.logger.error('device-health.save_error', { error: err.message });
    }
  }
}

module.exports = DeviceHealthModule;

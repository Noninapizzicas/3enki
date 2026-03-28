/**
 * Log Collector
 *
 * Recolecta logs de múltiples fuentes y los envía al SessionLogger:
 * - MQTT: Suscribe a core/+/logs/# para capturar todos los logs del backend
 * - HTTP: Recibe logs del frontend vía POST /api/logs
 * - EventBus: Captura eventos activity.logged, activity.batch
 *
 * Normaliza todos los logs a un formato unificado antes de pasarlos al storage.
 */

class LogCollector {
  /**
   * @param {Object} options
   * @param {Object} options.storage - Instancia de LogStorage (consolidado)
   * @param {Object} options.session - Instancia de SessionLogger (por sesión)
   * @param {Object} options.eventBus - Event bus del core
   * @param {Object} options.logger - Logger del core
   * @param {string} options.coreId - ID del core
   */
  constructor(options = {}) {
    this.storage = options.storage;
    this.session = options.session;
    this.eventBus = options.eventBus;
    this.logger = options.logger;
    this.coreId = options.coreId || 'unknown';

    this.stats = {
      collected: 0,
      fromMqtt: 0,
      fromHttp: 0,
      fromActivity: 0,
      toSession: 0,
      errors: 0
    };

    // Tracking dispositivos (impresoras ESP32)
    this.deviceStats = {};
    // Tracking MQTT conexión
    this.mqttEvents = [];

    this.subscriptions = [];
  }

  /**
   * Inicia la recolección de logs
   */
  start() {
    this.subscribeMqtt();
    this.logger?.info('log-collector.started', { coreId: this.coreId });
  }

  /**
   * Suscribe a topics de logs via MQTT/EventBus
   */
  subscribeMqtt() {
    // Suscribir a todos los logs de todos los cores
    const patterns = [
      'core/+/logs/debug',
      'core/+/logs/info',
      'core/+/logs/warn',
      'core/+/logs/error'
    ];

    for (const pattern of patterns) {
      if (this.eventBus?.on) {
        const handler = (topic, message) => {
          if (this.matchesTopic(topic, pattern)) {
            this.handleMqttLog(topic, message);
          }
        };

        this.eventBus.on('mqtt:message', handler);
        this.subscriptions.push({ event: 'mqtt:message', handler });
      }
    }

    // Suscribir directamente al MQTT para capturar logs de interacciones
    if (this.eventBus?.mqtt) {
      this.eventBus.mqtt.subscribe('log/#');
      this.eventBus.mqtt.on('message', (topic, message) => {
        if (topic.startsWith('log/')) {
          this.handleInteractionLog(topic, message);
        }
      });
    }

    // Escuchar eventos internos del sistema
    if (this.eventBus?.on) {
      const eventsToTrack = [
        'module.loaded',
        'module.unloaded',
        'module.error',
        'api.request',
        'api.response',
        'api.error'
      ];

      for (const event of eventsToTrack) {
        this.eventBus.on(event, (data) => {
          this.collectInternalEvent(event, data);
        });
      }

      // =============================================
      // Tracking MQTT conexión/desconexión
      // =============================================
      for (const mqttEvent of ['mqtt:connected', 'mqtt:disconnected', 'mqtt:reconnecting', 'mqtt:error']) {
        this.eventBus.on(mqttEvent, (data) => {
          const entry = {
            ts: new Date().toISOString(),
            level: mqttEvent === 'mqtt:connected' ? 'info' : 'warn',
            source: 'backend',
            module: 'mqtt',
            msg: mqttEvent,
            ctx: data || {}
          };
          this.mqttEvents.push({ ts: entry.ts, event: mqttEvent, ctx: data });
          if (this.mqttEvents.length > 500) this.mqttEvents.shift();
          this.storage?.write(entry);
          if (this.session) this.session.write('mqtt', entry);
          this.stats.collected++;
        });
      }

      // =============================================
      // Tracking impresora: resultados de impresión
      // =============================================
      this.eventBus.on('mqtt:message', (topic, message) => {
        // impresion/{project}/printed/{device} — resultado de print job
        if (typeof topic === 'string' && topic.includes('/printed/')) {
          this._handlePrintResult(topic, message);
        }
        // impresion/{project}/status/{device} — status periódico ESP32
        if (typeof topic === 'string' && topic.includes('/status/') &&
            (topic.startsWith('impresion/') || topic.startsWith('enki/'))) {
          this._handleDeviceStatus(topic, message);
        }
      });

      // Suscribir a eventos de ActivityLogger
      this.eventBus.on('activity.logged', (envelope) => {
        const activity = envelope.data || envelope;
        this.collectActivityLog(activity);
      });

      this.eventBus.on('activity.batch', (envelope) => {
        const data = envelope.data || envelope;
        if (data.entries && Array.isArray(data.entries)) {
          for (const entry of data.entries) {
            this.collectActivityLog(entry);
          }
        }
      });
    }
  }

  /**
   * Recolecta un log de actividad del ActivityLogger
   */
  collectActivityLog(activity) {
    const entry = {
      ts: activity.ts || new Date().toISOString(),
      level: activity.level || 'info',
      source: 'activity',
      module: activity.module,
      msg: `${activity.type}:${activity.action}`,
      ctx: {
        activityId: activity.id,
        type: activity.type,
        action: activity.action,
        outcome: activity.outcome,
        ...(activity.duration_ms && { duration_ms: activity.duration_ms }),
        ...(activity.traceId && { traceId: activity.traceId }),
        ...activity.ctx
      },
      ...(activity.error && { error: activity.error })
    };

    // Escribir al storage consolidado
    this.storage?.write(entry);

    // Escribir al SessionLogger (por módulo)
    if (this.session && entry.module) {
      this.session.write(entry.module, entry);
      this.stats.toSession++;
    }

    this.stats.collected++;
    this.stats.fromActivity++;
  }

  /**
   * Maneja logs de interacciones (HTTP Gateway, Event Bus, etc.)
   */
  handleInteractionLog(topic, message) {
    try {
      const logData = typeof message === 'string' ? JSON.parse(message) : message;

      if (logData.ts && logData.level && logData.source) {
        this.storage?.write(logData);

        // Escribir al SessionLogger
        if (this.session && logData.module) {
          this.session.write(logData.module, logData);
          this.stats.toSession++;
        }

        this.stats.collected++;
        this.stats.fromMqtt++;
      }
    } catch (err) {
      this.stats.errors++;
    }
  }

  /**
   * Verifica si un topic coincide con un patrón
   */
  matchesTopic(topic, pattern) {
    const topicParts = topic.split('/');
    const patternParts = pattern.split('/');

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === '+') continue;
      if (patternParts[i] === '#') return true;
      if (patternParts[i] !== topicParts[i]) return false;
    }

    return topicParts.length === patternParts.length;
  }

  /**
   * Maneja un log recibido via MQTT
   */
  handleMqttLog(topic, message) {
    try {
      const logData = typeof message === 'string' ? JSON.parse(message) : message;

      // Extraer nivel del topic: core/core-a/logs/info -> info
      const parts = topic.split('/');
      const level = parts[parts.length - 1];
      const sourceCore = parts[1];

      // Normalizar al formato unificado
      const entry = this.normalize({
        ...logData,
        level: logData.level || level,
        source: 'backend',
        sourceCore: sourceCore,
        _topic: topic
      });

      this.storage?.write(entry);

      // Escribir al SessionLogger
      if (this.session && entry.module) {
        this.session.write(entry.module, entry);
        this.stats.toSession++;
      }

      this.stats.collected++;
      this.stats.fromMqtt++;

    } catch (err) {
      this.stats.errors++;
      console.error('[log-collector] Error handling MQTT log:', err.message);
    }
  }

  /**
   * Recolecta un evento interno del sistema
   */
  collectInternalEvent(eventType, data) {
    const entry = this.normalize({
      level: 'info',
      source: 'backend',
      module: 'core',
      msg: eventType,
      ctx: data
    });

    this.storage?.write(entry);

    // Escribir al SessionLogger
    if (this.session) {
      this.session.write('core', entry);
      this.stats.toSession++;
    }

    this.stats.collected++;
    this.stats.fromMqtt++;
  }

  /**
   * Agrega un log recibido via HTTP (frontend)
   * @param {Object} logData - Datos del log
   */
  addFromHttp(logData) {
    try {
      const entry = this.normalize({
        ...logData,
        source: logData.source || 'frontend'
      });

      this.storage?.write(entry);

      // Escribir al SessionLogger
      if (this.session && entry.module) {
        this.session.write(entry.module, entry);
        this.stats.toSession++;
      }

      this.stats.collected++;
      this.stats.fromHttp++;

      return { success: true, entry };
    } catch (err) {
      this.stats.errors++;
      return { success: false, error: err.message };
    }
  }

  /**
   * Normaliza un log al formato unificado
   * @param {Object} data - Datos del log
   * @returns {Object} Log normalizado
   */
  normalize(data) {
    return {
      ts: data.ts || data.timestamp || new Date().toISOString(),
      level: data.level || 'info',
      source: data.source || 'unknown',
      module: data.module || data.core_id || 'unknown',
      msg: data.msg || data.message || 'unknown',
      ctx: data.ctx || data.context || {},
      // Metadata adicional
      ...(data.trace_id && { traceId: data.trace_id }),
      ...(data.span_id && { spanId: data.span_id }),
      ...(data.sourceCore && { sourceCore: data.sourceCore }),
      ...(data.error && { error: data.error })
    };
  }

  /**
   * Obtiene estadísticas del collector
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Resultado de impresión del ESP32
   */
  _handlePrintResult(topic, message) {
    try {
      const data = typeof message === 'string' ? JSON.parse(message) : message;
      const parts = topic.split('/');
      const deviceId = parts[parts.length - 1];

      // Inicializar stats del dispositivo
      if (!this.deviceStats[deviceId]) {
        this.deviceStats[deviceId] = {
          prints_ok: 0, prints_fail: 0, errors: [], last_seen: null,
          printer_ready: null, wifi_rssi: null
        };
      }

      const ds = this.deviceStats[deviceId];
      ds.last_seen = new Date().toISOString();

      if (data.success) {
        ds.prints_ok++;
      } else {
        ds.prints_fail++;
        ds.errors.push({
          ts: ds.last_seen,
          error: data.error || 'unknown',
          job_id: data.job_id
        });
        if (ds.errors.length > 50) ds.errors.shift();
      }

      const entry = {
        ts: ds.last_seen,
        level: data.success ? 'info' : 'error',
        source: 'device',
        module: 'impresion',
        msg: data.success ? 'print.ok' : 'print.fail',
        ctx: {
          device_id: deviceId,
          job_id: data.job_id,
          print_count: data.print_count,
          ...(data.error && { error: data.error })
        }
      };

      this.storage?.write(entry);
      if (this.session) this.session.write('impresion', entry);
      this.stats.collected++;
    } catch (err) {
      this.stats.errors++;
    }
  }

  /**
   * Status periódico del ESP32
   */
  _handleDeviceStatus(topic, message) {
    try {
      const data = typeof message === 'string' ? JSON.parse(message) : message;
      const parts = topic.split('/');
      const deviceId = parts[parts.length - 1];

      if (!this.deviceStats[deviceId]) {
        this.deviceStats[deviceId] = {
          prints_ok: 0, prints_fail: 0, errors: [], last_seen: null,
          printer_ready: null, wifi_rssi: null
        };
      }

      const ds = this.deviceStats[deviceId];
      const wasReady = ds.printer_ready;
      ds.last_seen = new Date().toISOString();
      ds.printer_ready = data.printer_ready || false;
      ds.wifi_rssi = data.wifi_rssi || null;
      ds.firmware = data.firmware || null;

      // Registrar cambio de estado de impresora (conecta/desconecta)
      if (wasReady !== null && wasReady !== ds.printer_ready) {
        const entry = {
          ts: ds.last_seen,
          level: ds.printer_ready ? 'info' : 'warn',
          source: 'device',
          module: 'impresion',
          msg: ds.printer_ready ? 'printer.connected' : 'printer.disconnected',
          ctx: {
            device_id: deviceId,
            printer_name: data.printer_name,
            wifi_rssi: data.wifi_rssi,
            uptime_sec: data.uptime_sec
          }
        };
        this.storage?.write(entry);
        if (this.session) this.session.write('impresion', entry);
        this.stats.collected++;
      }
    } catch (err) {
      this.stats.errors++;
    }
  }

  /**
   * Stats de dispositivos para diagnóstico
   */
  getDeviceStats() {
    return { ...this.deviceStats };
  }

  /**
   * Timeline MQTT para diagnóstico
   */
  getMqttTimeline() {
    return [...this.mqttEvents];
  }

  /**
   * Detiene la recolección
   */
  stop() {
    for (const sub of this.subscriptions) {
      if (this.eventBus?.off) {
        this.eventBus.off(sub.event, sub.handler);
      }
    }
    this.subscriptions = [];

    this.logger?.info('log-collector.stopped', { stats: this.stats });
  }
}

module.exports = LogCollector;

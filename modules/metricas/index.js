/**
 * metricas v2.0.0 — Instrumentación pasiva del sistema.
 *
 * Subscribe a wildcards de sufijo (*.creado, *.actualizado, *.eliminado,
 * *.error, *.completado) y mantiene contadores + gauges + histograma de
 * timings + agregados por evento. Publica metricas.snapshot cada N segundos.
 * Persiste estado a disco cada M segundos.
 *
 * NO se mide a sí mismo (recursión vía wildcards) — usa counters internos
 * en lugar de this.metrics.increment.
 *
 * Eventos del bus emitidos:
 *   metricas.snapshot — snapshot agregado periódico (counters, gauges, uptime)
 *
 * Subscribes (wildcards de sufijo, instrumentación cross-system):
 *   *.creado       → onEntityCreated
 *   *.actualizado  → onEntityUpdated
 *   *.eliminado    → onEntityDeleted
 *   *.error        → onError
 *   *.completado   → onOperationCompleted
 */

'use strict';

const fs     = require('fs').promises;
const path   = require('path');
const crypto = require('crypto');

const BaseModule = require('../_shared/base-module');
class MetricasModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'metricas';
    this.version = '2.0.0';

    // Estado in-memory
    this.counters     = new Map();  // Map<string, number>
    this.gauges       = new Map();  // Map<string, number>
    this.timings      = [];         // Array<{event_type, duration, timestamp, correlation_id}>
    this.eventMetrics = new Map();  // Map<string, {total, ultimo}>

    // Config (defaults; sobreescribibles via core.config.metricas)
    this.config = {
      snapshot_interval_ms:      10000,
      persist_interval_ms:       60000,
      max_timings_stored:         1000,
      max_event_metrics_tracked:  500,
      data_path: path.join(process.cwd(), 'data')
    };

    // Timers
    this.snapshotTimer = null;
    this.persistTimer  = null;
    this.startTime     = Date.now();

    // Inyectados en onLoad
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger   = core.logger;
    this.eventBus = core.eventBus;
    this.metrics  = core.metrics || null;

    if (core.config?.metricas) {
      this.config = { ...this.config, ...core.config.metricas };
    }
    this.config.data_path = path.resolve(this.config.data_path);
    this.dataFile = path.join(this.config.data_path, 'metricas.json');

    this.logger.info('metricas.loading', { module: this.name, version: this.version });

    await this._loadFromJSON();
    this._initializeSystemGauges();

    this.snapshotTimer = setInterval(() => this._publishSnapshot(), this.config.snapshot_interval_ms);
    this.persistTimer  = setInterval(() => this._persistToJSON(),  this.config.persist_interval_ms);

    this.logger.info('metricas.loaded', {
      module:               this.name,
      snapshot_interval_ms: this.config.snapshot_interval_ms,
      persist_interval_ms:  this.config.persist_interval_ms,
      counters_loaded:      this.counters.size,
      gauges_loaded:        this.gauges.size
    });
  }

  async onUnload() {
    this.logger.info('metricas.unloading', {
      counters_total: this.counters.size,
      gauges_total:   this.gauges.size,
      timings_total:  this.timings.length
    });

    if (this.snapshotTimer) { clearInterval(this.snapshotTimer); this.snapshotTimer = null; }
    if (this.persistTimer)  { clearInterval(this.persistTimer);  this.persistTimer  = null; }

    await this._persistToJSON();

    try { await this._publishSnapshot(); }
    catch (err) { this.logger.debug('metricas.unload.snapshot.skipped', { reason: err.message }); }

    this.counters.clear();
    this.gauges.clear();
    this.timings.length = 0;
    this.eventMetrics.clear();

    this.logger.info('metricas.unloaded', { module: this.name, metrics_persisted: true });
  }

  // ==========================================
  // Bus handlers (wildcards de sufijo)
  // ==========================================

  async onEntityCreated(envelope) {
    this._safeRecordEvent(envelope, 'creado');
  }

  async onEntityUpdated(envelope) {
    this._safeRecordEvent(envelope, 'actualizado');
  }

  async onEntityDeleted(envelope) {
    this._safeRecordEvent(envelope, 'eliminado', { record_timing: false });
  }

  async onError(envelope) {
    try {
      const eventType = envelope?.event_type;
      if (!eventType) {
        this.logger.warn('metricas.evento.invalid', { reason: 'Missing event_type', event_id: envelope?.event_id });
        return;
      }

      this._increment('errores.total');
      this._increment(`${eventType}.total`);

      const domain = eventType.split('.')[0];
      const rollupKey = domain && `${domain}.error.total`;
      if (rollupKey && rollupKey !== `${eventType}.total`) {
        this._increment(rollupKey);
      }

      this._updateEventMetric(eventType);

      this.logger.warn('metricas.error.registrado', { event_type: eventType, event_id: envelope?.event_id });
    } catch (err) {
      this._recordInternalError('onError', err, envelope?.event_id);
    }
  }

  async onOperationCompleted(envelope) {
    this._safeRecordEvent(envelope, 'completado');
  }

  _safeRecordEvent(envelope, suffix, opts = {}) {
    try {
      const eventType = envelope?.event_type;
      if (!eventType) {
        this.logger.warn('metricas.evento.invalid', { reason: 'Missing event_type', event_id: envelope?.event_id });
        return;
      }

      this._increment(`${eventType}.total`);

      const domain = eventType.split('.')[0];
      const rollupKey = domain && `${domain}.${suffix}.total`;
      // Solo incrementar el rollup si difiere del counter event-specific
      // (evita doble contar en eventos de 2 segmentos `<domain>.<suffix>`).
      if (rollupKey && rollupKey !== `${eventType}.total`) {
        this._increment(rollupKey);
      }

      this._updateEventMetric(eventType);

      if (opts.record_timing !== false && envelope?.metadata?.duration) {
        this._recordTiming(eventType, envelope.metadata.duration, envelope.metadata?.correlationId);
      }

      this.logger.debug('metricas.evento.procesado', {
        event_type:     eventType,
        event_id:       envelope.event_id,
        correlation_id: envelope.metadata?.correlationId
      });
    } catch (err) {
      this._recordInternalError(`on${suffix}`, err, envelope?.event_id);
    }
  }

  // ==========================================
  // HTTP API handlers (shape canonico { status, data | error })
  // ==========================================

  async handleGetAllMetrics(_req, context) {
    try {
      this._updateSystemGauges();
      return {
        status: 200,
        data: {
          counters:  Object.fromEntries(this.counters),
          gauges:    Object.fromEntries(this.gauges),
          timings:   this.timings.slice(-100),
          timestamp: new Date().toISOString(),
          uptime:    (Date.now() - this.startTime) / 1000
        }
      };
    } catch (err) {
      return this._handleHandlerError('metricas.api.getAll.failed', err, 'http_getAll', context);
    }
  }

  async handleGetCounters(_req, context) {
    try {
      return {
        status: 200,
        data: {
          counters:  Object.fromEntries(this.counters),
          total:     this.counters.size,
          timestamp: new Date().toISOString()
        }
      };
    } catch (err) {
      return this._handleHandlerError('metricas.api.getCounters.failed', err, 'http_getCounters', context);
    }
  }

  async handleGetGauges(_req, context) {
    try {
      this._updateSystemGauges();
      return {
        status: 200,
        data: {
          gauges:    Object.fromEntries(this.gauges),
          total:     this.gauges.size,
          timestamp: new Date().toISOString()
        }
      };
    } catch (err) {
      return this._handleHandlerError('metricas.api.getGauges.failed', err, 'http_getGauges', context);
    }
  }

  async handleGetTimings(req, context) {
    try {
      const limit = parseInt(req?.query?.limit, 10) || 100;
      return {
        status: 200,
        data: {
          timings:   this.timings.slice(-limit),
          count:     this.timings.length,
          timestamp: new Date().toISOString()
        }
      };
    } catch (err) {
      return this._handleHandlerError('metricas.api.getTimings.failed', err, 'http_getTimings', context);
    }
  }

  async handleGetEventMetrics(_req, context) {
    try {
      return {
        status: 200,
        data: {
          eventos:   Object.fromEntries(this.eventMetrics),
          total:     this.eventMetrics.size,
          timestamp: new Date().toISOString()
        }
      };
    } catch (err) {
      return this._handleHandlerError('metricas.api.getEventMetrics.failed', err, 'http_getEventMetrics', context);
    }
  }

  async handleResetMetrics(_req, context) {
    try {
      const before = {
        counters: this.counters.size,
        gauges:   this.gauges.size,
        timings:  this.timings.length,
        events:   this.eventMetrics.size
      };

      this.counters.clear();
      this.gauges.clear();
      this.timings.length = 0;
      this.eventMetrics.clear();
      this._initializeSystemGauges();

      this.logger.warn('metricas.reset', {
        counters_cleared: before.counters,
        gauges_cleared:   before.gauges,
        timings_cleared:  before.timings,
        events_cleared:   before.events,
        correlation_id:   context?.correlationId
      });

      return {
        status: 200,
        data: {
          success:   true,
          message:   'Metricas reseteadas correctamente',
          cleared:   before,
          timestamp: new Date().toISOString()
        }
      };
    } catch (err) {
      return this._handleHandlerError('metricas.api.reset.failed', err, 'http_reset', context);
    }
  }

  async handleHealthCheck(_req, _context) {
    return {
      status: 200,
      data: {
        status:    'healthy',
        module:    this.name,
        version:   this.version,
        uptime:    (Date.now() - this.startTime) / 1000,
        timestamp: new Date().toISOString(),
        metrics_count: {
          counters: this.counters.size,
          gauges:   this.gauges.size,
          timings:  this.timings.length,
          events:   this.eventMetrics.size
        }
      }
    };
  }

  // ==========================================
  // Internals
  // ==========================================

  _increment(name) {
    this.counters.set(name, (this.counters.get(name) || 0) + 1);
  }

  _updateEventMetric(eventType) {
    const current = this.eventMetrics.get(eventType) || { total: 0, ultimo: null };
    this.eventMetrics.set(eventType, {
      total:  current.total + 1,
      ultimo: new Date().toISOString()
    });
    if (this.eventMetrics.size > this.config.max_event_metrics_tracked) {
      this._evictOldestEventMetric();
    }
  }

  _evictOldestEventMetric() {
    let oldestKey = null;
    let oldestTs  = null;
    for (const [key, val] of this.eventMetrics) {
      if (!oldestTs || (val.ultimo && val.ultimo < oldestTs)) {
        oldestTs  = val.ultimo;
        oldestKey = key;
      }
    }
    if (oldestKey) this.eventMetrics.delete(oldestKey);
  }

  _recordTiming(eventType, duration, correlationId) {
    this.timings.push({
      event_type:     eventType,
      duration,
      timestamp:      new Date().toISOString(),
      correlation_id: correlationId || null
    });
    if (this.timings.length > this.config.max_timings_stored) {
      this.timings.shift();
    }
  }

  _initializeSystemGauges() {
    this.gauges.set('sistema.uptime',          0);
    this.gauges.set('metricas.counters.count', 0);
    this.gauges.set('metricas.timings.count',  0);
    this.gauges.set('metricas.events.count',   0);
  }

  _updateSystemGauges() {
    this.gauges.set('sistema.uptime',          (Date.now() - this.startTime) / 1000);
    this.gauges.set('metricas.counters.count', this.counters.size);
    this.gauges.set('metricas.timings.count',  this.timings.length);
    this.gauges.set('metricas.events.count',   this.eventMetrics.size);
  }

  _recordInternalError(where, err, eventId) {
    this._increment('metricas.errors.total');
    this._increment(`metricas.errors.${where}`);
    this.logger.error(`metricas.${where}.error`, {
      error:    err.message,
      event_id: eventId
    });
  }

  // ==========================================
  // Snapshot publish
  // ==========================================

  async _publishSnapshot() {
    try {
      if (!this.eventBus || (typeof this.eventBus.isConnected === 'function' && !this.eventBus.isConnected())) {
        this.logger.debug('metricas.snapshot.skipped', { reason: 'mqtt_not_connected' });
        return;
      }

      this._updateSystemGauges();

      await this._publicarEvento('metricas.snapshot', {
        counters: Object.fromEntries(this.counters),
        gauges:   Object.fromEntries(this.gauges),
        uptime:   (Date.now() - this.startTime) / 1000
      });

      this.logger.debug('metricas.snapshot.publicado', {
        counters_count: this.counters.size,
        gauges_count:   this.gauges.size
      });
    } catch (err) {
      this._recordInternalError('snapshot', err);
    }
  }

  // ==========================================
  // Persistencia (atomica via tmp + rename)
  // ==========================================

  async _loadFromJSON() {
    try {
      await fs.mkdir(this.config.data_path, { recursive: true });

      let raw;
      try { raw = await fs.readFile(this.dataFile, 'utf8'); }
      catch (err) {
        if (err.code === 'ENOENT') {
          this.logger.info('metricas.load.first_run', { message: 'No hay metricas persistidas, iniciando desde cero' });
          return;
        }
        throw err;
      }

      const parsed = JSON.parse(raw);

      if (parsed.version && parsed.version !== this.version) {
        this.logger.warn('metricas.load.version_mismatch', {
          file_version:   parsed.version,
          module_version: this.version,
          message:        'Cargando metricas de version diferente'
        });
      }

      if (parsed.counters) {
        this.counters = new Map(Object.entries(parsed.counters));
      }
      if (Array.isArray(parsed.timings)) {
        this.timings = parsed.timings.slice(-this.config.max_timings_stored);
      }
      if (parsed.eventMetrics) {
        this.eventMetrics = new Map(Object.entries(parsed.eventMetrics));
      }

      this.logger.info('metricas.loaded_from_json', {
        counters:     this.counters.size,
        timings:      this.timings.length,
        eventMetrics: this.eventMetrics.size,
        file:         this.dataFile,
        saved_at:     parsed.metadata?.saved_at
      });
    } catch (err) {
      this._recordInternalError('load', err);
    }
  }

  async _persistToJSON() {
    try {
      await fs.mkdir(this.config.data_path, { recursive: true });

      const snapshot = {
        version:      this.version,
        counters:     Object.fromEntries(this.counters),
        gauges:       Object.fromEntries(this.gauges),
        timings:      this.timings.slice(-this.config.max_timings_stored),
        eventMetrics: Object.fromEntries(this.eventMetrics),
        metadata: {
          saved_at:       new Date().toISOString(),
          module_version: this.version,
          uptime:         (Date.now() - this.startTime) / 1000
        }
      };

      const tempFile = `${this.dataFile}.tmp`;
      await fs.writeFile(tempFile, JSON.stringify(snapshot, null, 2), 'utf8');
      await fs.rename(tempFile, this.dataFile);

      this.logger.debug('metricas.persisted_to_json', {
        counters: this.counters.size,
        gauges:   this.gauges.size,
        timings:  this.timings.length,
        file:     this.dataFile
      });
    } catch (err) {
      this._recordInternalError('persist', err);
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

  _handleHandlerError(logEvent, err, kind, context) {
    const code   = err._code || this._classifyHandlerError(err);
    const status = code === 'INVALID_INPUT'      ? 400 :
                   code === 'RESOURCE_NOT_FOUND'     ? 404 :
                   code === 'PERMISSION_DENIED' ? 403 :
                   code === 'CONFLICT_STATE'               ? 409 : 500;
    const message = err.message || String(err);
    this.logger.error(logEvent, {
      error:          message,
      code,
      correlation_id: context?.correlationId
    });
    this._increment(`metricas.errors.${kind}`);
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

module.exports = MetricasModule;

'use strict';

const SnapshotStorage = require('./snapshot-storage');

/**
 * cocina POC v2.0.0 — Display de cocina single-tenant.
 *
 * Aplica los 8 contratos arquitectonicos:
 *  - events:        publishes/subscribes declarados, _publicarEvento canonico,
 *                   sin acceso directo a otros modulos (subscribe_only).
 *  - lifecycle:     onLoad inicializa, onUnload flushea snapshot + limpia maps.
 *  - observability: log + metric en cada operacion via API canonica.
 *  - errors:        _buildErrorResponse / _buildSuccessResponse con codigos canonicos.
 *  - persistence:   SnapshotStorage (json-file single-global con write atomico
 *                   + debounce). Snapshot es la fuente de verdad; in-memory es cache.
 *  - http:          5 apis con routing canonico /modules/cocina/<path>, response
 *                   shape { status, data | error }, auth_required declarado.
 *  - naming:        language=es, eventos verbo en pasado, tools sin (no hay tools).
 *  - glossary:      pedido, item, cuenta, canal, estado.
 *
 * Esta parcela (3/6) trae lifecycle + helpers + estado in-memory. Los handlers
 * reales de subscribes y apis HTTP vienen en la parcela 4/6.
 */
class CocinaModule {
  constructor() {
    this.name    = 'cocina';
    this.version = '2.0.0';

    // Inyectados en onLoad
    this.eventBus = null;
    this.logger   = null;
    this.metrics  = null;
    this.config   = null;

    // Estado in-memory (cache; el snapshot en disco es la fuente de verdad)
    this.pedidosActivos = new Map();   // pedido_id → pedido_cocina
    this.historial      = [];          // ultimos N pedidos completados (FIFO)

    // Helpers
    this.storage = null;
  }

  // ----------------------------------------------------------------- lifecycle

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger   = context.logger;
    this.metrics  = context.metrics || null;
    this.config   = context.moduleConfig || context.config || {};

    const persistenceCfg = this.config.persistence || {};
    if (persistenceCfg.pattern !== 'json-file') {
      throw new Error(`cocina-poc: config.persistence.pattern must be 'json-file' (got '${persistenceCfg.pattern}')`);
    }
    if (!persistenceCfg.data_path) {
      throw new Error('cocina-poc: config.persistence.data_path is required');
    }

    this.storage = new SnapshotStorage({
      dataPath:   persistenceCfg.data_path,
      logger:     this.logger,
      metrics:    this.metrics,
      moduleName: this.name,
      debounceMs: this.config.snapshot_debounce_ms || 1000
    });

    // Cargar snapshot (graceful con ENOENT y corrupto)
    const r = await this.storage.read({ pedidos: {}, historial: [] });
    if (r.data?.pedidos) {
      for (const [pid, pedido] of Object.entries(r.data.pedidos)) {
        this.pedidosActivos.set(pid, pedido);
      }
    }
    if (Array.isArray(r.data?.historial)) {
      this.historial = r.data.historial.slice(-(this.config.max_historial || 50));
    }

    this.logger.info(`${this.name}.loaded`, {
      version:           this.version,
      pedidos_activos:   this.pedidosActivos.size,
      historial_size:    this.historial.length,
      snapshot_source:   r.source
    });
    this._emitMetric(`${this.name}.lifecycle.loaded`, 1, {});
    this._emitMetric(`${this.name}.pedidos_activos.count`, this.pedidosActivos.size, {});
  }

  async onUnload() {
    // Flush sincronico del snapshot pendiente — nunca perder mutaciones recientes.
    if (this.storage) {
      // Si hay debounce pendiente, escribir; si no, no-op.
      const f = await this.storage.flush();
      if (!f.ok && !f.skipped) {
        this.logger.warn(`${this.name}.unload.flush_failed`, { error_code: f.error?.code });
      }
    }
    this.pedidosActivos.clear();
    this.historial = [];
    if (this.logger) this.logger.info(`${this.name}.unloaded`, {});
    this._emitMetric(`${this.name}.lifecycle.unloaded`, 1, {});
  }

  // ----------------------------------------------------------------- handlers (stubs en parcela 3)

  // Implementacion real en parcela 4. Dejados como no-op para que la clase
  // cargue completa.

  async onPedidoEnviadoCocina(payload) {
    /* parcela 4 */
  }

  async onPedidoCancelado(payload) {
    /* parcela 4 */
  }

  async onCajaCerrada(payload) {
    /* parcela 4 */
  }

  async onDiaIniciado(payload) {
    /* parcela 4 */
  }

  async handleGetActivos(req)        { /* parcela 4 */ return this._buildErrorResponse({ status: 501, code: 'NOT_IMPLEMENTED', message: 'wip' }); }
  async handleGetPedido(req)         { /* parcela 4 */ return this._buildErrorResponse({ status: 501, code: 'NOT_IMPLEMENTED', message: 'wip' }); }
  async handleGetHistorial(req)      { /* parcela 4 */ return this._buildErrorResponse({ status: 501, code: 'NOT_IMPLEMENTED', message: 'wip' }); }
  async handlePrepararItem(req)      { /* parcela 4 */ return this._buildErrorResponse({ status: 501, code: 'NOT_IMPLEMENTED', message: 'wip' }); }
  async handleMarcarListo(req)       { /* parcela 4 */ return this._buildErrorResponse({ status: 501, code: 'NOT_IMPLEMENTED', message: 'wip' }); }

  // ----------------------------------------------------------------- helpers (canonicos)

  _buildErrorResponse({ status, code, message, details }) {
    return { status, error: { code, message, details: details || {} } };
  }

  _buildSuccessResponse({ status, data }) {
    return { status: status || 200, data };
  }

  async _publicarEvento(eventName, payload, sourcePayload = null) {
    const correlation_id = sourcePayload?.correlation_id || payload?.correlation_id || null;
    const outPayload = {
      ...(correlation_id ? { correlation_id } : {}),
      ...payload,
      timestamp: payload.timestamp || new Date().toISOString()
    };
    try {
      await this.eventBus.publish(eventName, outPayload);
      this.logger.info(`${this.name}.event.published`, { event: eventName, correlation_id });
    } catch (err) {
      this.logger.error(`${this.name}.event.publish.failed`, {
        event: eventName, error_message: err.message, correlation_id
      });
      this._emitMetric(`${this.name}.event.errors`, 1, { event: eventName });
    }
  }

  /**
   * Persiste el snapshot actual (debounced). Llamado tras cualquier mutacion
   * de pedidosActivos o historial.
   */
  _persistirSnapshot() {
    if (!this.storage) return;
    this.storage.saveDebounced({
      _saved_at: new Date().toISOString(),
      pedidos:   Object.fromEntries(this.pedidosActivos),
      historial: this.historial
    });
  }

  /**
   * Empuja un pedido al historial con cap maximo (FIFO).
   */
  _archivarEnHistorial(pedido) {
    const max = this.config.max_historial || 50;
    this.historial.push({ ...pedido, archivado_at: new Date().toISOString() });
    if (this.historial.length > max) {
      this.historial = this.historial.slice(-max);
    }
  }

  _validate(payload, requiredFields) {
    if (!payload || typeof payload !== 'object') return { ok: false, message: 'payload missing or invalid', field: 'payload' };
    for (const f of requiredFields) {
      if (payload[f] === undefined || payload[f] === null) return { ok: false, message: `${f} is required`, field: f };
    }
    return { ok: true };
  }

  _emitMetric(name, value, labels) {
    if (!this.metrics) return;
    if (/\.duration$/.test(name))   { this.metrics.timing(name, value, labels);    return; }
    if (/\.count$/.test(name))      { this.metrics.gauge(name, value, labels);     return; }
    this.metrics.increment(name, value || 1, labels);
  }
}

module.exports = CocinaModule;

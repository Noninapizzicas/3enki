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

  // ----------------------------------------------------------------- handlers de subscribes

  /**
   * pedido.enviado_cocina → añade el pedido a pedidosActivos.
   * Payload esperado: { pedido_id, cuenta_id?, items: [{ id, nombre, cantidad?, ... }], canal?, ... }
   */
  async onPedidoEnviadoCocina(payload) {
    const v = this._validate(payload, ['pedido_id']);
    if (!v.ok) {
      this.logger.warn(`${this.name}.pedido.enviado.invalid`, { reason: v.message, field: v.field });
      return;
    }
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (this.pedidosActivos.size >= (this.config.max_pedidos_activos || 500)) {
      this.logger.warn(`${this.name}.pedido.rejected.capacity`, {
        pedido_id: payload.pedido_id, current: this.pedidosActivos.size
      });
      this._emitMetric(`${this.name}.pedido.rejected`, 1, { reason: 'capacity' });
      return;
    }

    const pedido = {
      pedido_id:    payload.pedido_id,
      cuenta_id:    payload.cuenta_id || null,
      canal:        payload.canal     || null,
      items:        items.map(it => ({
        item_id:        it.id || it.item_id,
        nombre:         it.nombre || it.name || '',
        cantidad:       it.cantidad || 1,
        estado:         'pendiente',
        preparando_at:  null,
        preparado_at:   null
      })),
      estado:       'activo',
      recibido_at:  new Date().toISOString()
    };
    this.pedidosActivos.set(pedido.pedido_id, pedido);
    this._persistirSnapshot();

    this.logger.info(`${this.name}.pedido.recibido`, {
      pedido_id: pedido.pedido_id, items: pedido.items.length
    });
    this._emitMetric(`${this.name}.pedido_recibido.total`, 1, {});
    this._emitMetric(`${this.name}.pedidos_activos.count`, this.pedidosActivos.size, {});
  }

  /**
   * pedido.cancelado → elimina el pedido de pedidosActivos sin pasar al historial.
   */
  async onPedidoCancelado(payload) {
    const pedidoId = payload?.pedido_id;
    if (!pedidoId) return;
    const removed = this.pedidosActivos.delete(pedidoId);
    if (removed) {
      this._persistirSnapshot();
      this.logger.info(`${this.name}.pedido.cancelado`, { pedido_id: pedidoId });
      this._emitMetric(`${this.name}.pedido_cancelado.total`, 1, {});
      this._emitMetric(`${this.name}.pedidos_activos.count`, this.pedidosActivos.size, {});
    }
  }

  /**
   * caja.cerrada → limpia pedidos activos (los pendientes pasan a historial).
   */
  async onCajaCerrada(payload) {
    let archivados = 0;
    for (const pedido of this.pedidosActivos.values()) {
      this._archivarEnHistorial({ ...pedido, motivo_cierre: 'caja.cerrada' });
      archivados++;
    }
    this.pedidosActivos.clear();
    this._persistirSnapshot();
    this.logger.info(`${this.name}.caja.cerrada.cleanup`, { archivados });
    this._emitMetric(`${this.name}.caja_cerrada.cleanup`, archivados, {});
    this._emitMetric(`${this.name}.pedidos_activos.count`, 0, {});
  }

  /**
   * dia.iniciado → vacia pedidosActivos sin archivar (asume continuidad limpia).
   * Idempotente: si ya esta vacio, no-op.
   */
  async onDiaIniciado(payload) {
    if (this.pedidosActivos.size === 0) return;
    this.pedidosActivos.clear();
    this._persistirSnapshot();
    this.logger.info(`${this.name}.dia.iniciado.cleanup`, {});
    this._emitMetric(`${this.name}.pedidos_activos.count`, 0, {});
  }

  // ----------------------------------------------------------------- handlers HTTP

  /**
   * GET /modules/cocina/activos — lista todos los pedidos activos.
   * Response canonica: { status: 200, data: { pedidos, total } }.
   */
  async handleGetActivos(req) {
    const pedidos = Array.from(this.pedidosActivos.values())
      .sort((a, b) => new Date(a.recibido_at) - new Date(b.recibido_at));
    return this._buildSuccessResponse({ status: 200, data: { pedidos, total: pedidos.length } });
  }

  /**
   * GET /modules/cocina/pedidos/:pedido_id — detalle de un pedido.
   * 404 si no existe.
   */
  async handleGetPedido(req) {
    const pedidoId = req?.params?.pedido_id || req?.pedido_id;
    if (!pedidoId) {
      return this._buildErrorResponse({
        status: 400, code: 'INVALID_INPUT',
        message: 'pedido_id is required',
        details: { kind: 'domain', field: 'pedido_id' }
      });
    }
    const pedido = this.pedidosActivos.get(pedidoId);
    if (!pedido) {
      return this._buildErrorResponse({
        status: 404, code: 'RESOURCE_NOT_FOUND',
        message: `Pedido "${pedidoId}" no encontrado en cocina`,
        details: { kind: 'domain', entity_type: 'pedido', entity_id: pedidoId }
      });
    }
    return this._buildSuccessResponse({ status: 200, data: { pedido } });
  }

  /**
   * GET /modules/cocina/historial — ultimos N pedidos archivados.
   */
  async handleGetHistorial(req) {
    return this._buildSuccessResponse({
      status: 200,
      data: { historial: this.historial, total: this.historial.length, max: this.config.max_historial || 50 }
    });
  }

  /**
   * POST /modules/cocina/items/:item_id/preparar — marca un item como preparado.
   * Body: { pedido_id }.
   *
   * Si el item estaba en 'pendiente', publica cocina.item_preparando primero
   * (transicion pendiente → preparando) y luego cocina.item_preparado.
   * Si todos los items del pedido quedan en 'preparado', publica cocina.pedido_listo
   * y archiva el pedido.
   */
  async handlePrepararItem(req) {
    const itemId   = req?.params?.item_id || req?.item_id;
    const body     = req?.body || {};
    const pedidoId = body.pedido_id;

    const v = this._validate({ item_id: itemId, pedido_id: pedidoId }, ['item_id', 'pedido_id']);
    if (!v.ok) {
      return this._buildErrorResponse({
        status: 400, code: 'INVALID_INPUT',
        message: v.message, details: { kind: 'domain', field: v.field }
      });
    }

    const pedido = this.pedidosActivos.get(pedidoId);
    if (!pedido) {
      return this._buildErrorResponse({
        status: 404, code: 'RESOURCE_NOT_FOUND',
        message: `Pedido "${pedidoId}" no encontrado en cocina`,
        details: { kind: 'domain', entity_type: 'pedido', entity_id: pedidoId }
      });
    }
    const item = pedido.items.find(it => it.item_id === itemId);
    if (!item) {
      return this._buildErrorResponse({
        status: 404, code: 'RESOURCE_NOT_FOUND',
        message: `Item "${itemId}" no encontrado en pedido "${pedidoId}"`,
        details: { kind: 'domain', entity_type: 'item', entity_id: itemId, pedido_id: pedidoId }
      });
    }
    if (item.estado === 'preparado') {
      return this._buildErrorResponse({
        status: 409, code: 'CONFLICT_STATE',
        message: `Item "${itemId}" ya estaba preparado`,
        details: { kind: 'domain', entity_type: 'item', entity_id: itemId, estado_actual: 'preparado' }
      });
    }

    const ahora = new Date().toISOString();

    // Transicion pendiente → preparando (publish cocina.item_preparando)
    if (item.estado === 'pendiente') {
      item.estado        = 'preparando';
      item.preparando_at = ahora;
      await this._publicarEvento('cocina.item_preparando', {
        pedido_id: pedidoId, cuenta_id: pedido.cuenta_id,
        item_id:   itemId,  nombre: item.nombre, preparando_at: ahora
      }, body);
    }

    // Marcar preparado (publish cocina.item_preparado)
    item.estado        = 'preparado';
    item.preparado_at  = ahora;
    await this._publicarEvento('cocina.item_preparado', {
      pedido_id: pedidoId, cuenta_id: pedido.cuenta_id,
      item_id:   itemId,  nombre: item.nombre, preparado_at: ahora
    }, body);

    this._emitMetric(`${this.name}.item_preparado.total`, 1, {});

    // Si TODOS los items estan preparados → cocina.pedido_listo + archivar
    const allReady = pedido.items.every(it => it.estado === 'preparado');
    if (allReady) {
      pedido.estado     = 'listo';
      pedido.listo_at   = ahora;
      this._archivarEnHistorial(pedido);
      this.pedidosActivos.delete(pedidoId);
      await this._publicarEvento('cocina.pedido_listo', {
        pedido_id: pedidoId, cuenta_id: pedido.cuenta_id, listo_at: ahora
      }, body);
      this._emitMetric(`${this.name}.pedido_listo.total`, 1, {});
      this._emitMetric(`${this.name}.pedidos_activos.count`, this.pedidosActivos.size, {});
    }

    this._persistirSnapshot();

    return this._buildSuccessResponse({
      status: 200,
      data: {
        item:           { item_id: itemId, estado: item.estado, preparado_at: ahora },
        pedido_listo:   allReady,
        message:        allReady ? 'Item preparado. Pedido completo, archivado.' : 'Item preparado.'
      }
    });
  }

  /**
   * POST /modules/cocina/pedidos/:pedido_id/listo — marca pedido completo como
   * listo manualmente (sin esperar item-by-item).
   */
  async handleMarcarListo(req) {
    const pedidoId = req?.params?.pedido_id || req?.pedido_id;
    const body     = req?.body || {};

    if (!pedidoId) {
      return this._buildErrorResponse({
        status: 400, code: 'INVALID_INPUT',
        message: 'pedido_id is required',
        details: { kind: 'domain', field: 'pedido_id' }
      });
    }
    const pedido = this.pedidosActivos.get(pedidoId);
    if (!pedido) {
      return this._buildErrorResponse({
        status: 404, code: 'RESOURCE_NOT_FOUND',
        message: `Pedido "${pedidoId}" no encontrado en cocina`,
        details: { kind: 'domain', entity_type: 'pedido', entity_id: pedidoId }
      });
    }

    const ahora = new Date().toISOString();
    for (const item of pedido.items) {
      if (item.estado !== 'preparado') {
        item.estado       = 'preparado';
        item.preparado_at = ahora;
      }
    }
    pedido.estado    = 'listo';
    pedido.listo_at  = ahora;
    this._archivarEnHistorial(pedido);
    this.pedidosActivos.delete(pedidoId);
    this._persistirSnapshot();

    await this._publicarEvento('cocina.pedido_listo', {
      pedido_id: pedidoId, cuenta_id: pedido.cuenta_id, listo_at: ahora,
      via: 'manual'
    }, body);

    this._emitMetric(`${this.name}.pedido_listo.total`, 1, { via: 'manual' });
    this._emitMetric(`${this.name}.pedidos_activos.count`, this.pedidosActivos.size, {});

    return this._buildSuccessResponse({
      status: 200,
      data: { pedido_id: pedidoId, listo_at: ahora, message: 'Pedido marcado como listo.' }
    });
  }

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

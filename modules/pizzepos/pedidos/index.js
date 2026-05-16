/**
 * Modulo Pedidos v3.0.0 — POC2 canonico.
 *
 * Gestion completa de pedidos formales pizzepos. Recibe del comandero
 * (bridge `comandero.enviar_cocina`) o se crea via UI handler. Persiste
 * en memoria (Map pedidos + Map pedidosPorCuenta) con restauracion
 * desde cuentas_activas.json al arrancar (delegacion a persistencia-comandero).
 *
 * Cache de productos invalidada por catalogo.actualizado / producto.{creado,actualizado}.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const BaseModule = require('../../_shared/base-module');
const UI_ACTIONS = [
  'list', 'get', 'create', 'add-item', 'update-item', 'delete-item',
  'send-kitchen', 'complete', 'cancel', 'total', 'health'
];

class PedidosModule extends BaseModule {
  constructor() {
    super();
    this.name = 'pedidos';
    this.version = '3.0.0';

    this.pedidos = new Map();
    this.pedidosPorCuenta = new Map();
    this.productosCache = new Map();
    this.uiHandler = null;
    this.config = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;
    this.config = core.config || null;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    this._registerUIHandlers();
    await this._restaurarDesdeArchivo();

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    if (this.uiHandler) {
      for (const action of UI_ACTIONS) {
        this.uiHandler.unregister('pedido', action);
      }
    }

    this.pedidos.clear();
    this.pedidosPorCuenta.clear();
    this.productosCache.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Helpers POC2
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details !== undefined) error.details = details;
    return { status, error };
  }

  _classifyHandlerError(err) {
    const msg = err?.message || String(err);
    const code = err?.code;
    if (code === 'ENOENT') return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/required|invalid|missing|requerido/i.test(msg)) return { status: 400, code: 'INVALID_INPUT' };
    if (/not found|no encontrado/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/conflict|estado|already|ya esta/i.test(msg)) return { status: 409, code: 'CONFLICT_STATE' };
    return { status: 500, code: 'UNKNOWN_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'handler') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('pedidos.errors', { code, kind });
    return this._errorResponse(status, code, err?.message || 'Error interno');
  }

  async _publicarEvento(name, payload, sourcePayload) {
    const correlation_id =
      payload?.correlation_id ||
      sourcePayload?.correlation_id ||
      sourcePayload?.metadata?.correlationId ||
      null;
    const project_id =
      payload?.project_id ??
      sourcePayload?.project_id ??
      sourcePayload?.data?.project_id ??
      null;
    const enriched = {
      ...payload,
      correlation_id,
      timestamp: payload?.timestamp || new Date().toISOString()
    };
    if (project_id !== null && project_id !== undefined) enriched.project_id = project_id;
    await this.eventBus.publish(name, enriched);
    return enriched;
  }

  async _readJsonSafe(filePath) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      this.logger?.warn?.('pedidos.read_json.error', {
        file: filePath,
        error_code: err.code || 'PARSE_ERROR',
        error_message: err.message
      });
      return null;
    }
  }

  // ==========================================
  // UI Handler Registration
  // ==========================================

  _registerUIHandlers() {
    if (!this.uiHandler) {
      this.logger.warn('pedidos.uiHandler.not_available', { module: this.name });
      return;
    }

    const map = {
      'list': this.handleListPedidos,
      'get': this.handleGetPedido,
      'create': this.handleCreatePedido,
      'add-item': this.handleAgregarItem,
      'update-item': this.handleActualizarItem,
      'delete-item': this.handleEliminarItem,
      'send-kitchen': this.handleEnviarCocina,
      'complete': this.handleCompletarPedido,
      'cancel': this.handleCancelarPedido,
      'total': this.handleCalcularTotal,
      'health': this.handleHealthCheck
    };

    for (const [action, fn] of Object.entries(map)) {
      this.uiHandler.register('pedido', action, fn.bind(this));
    }

    this.logger.info('pedidos.ui_handlers.registered', { handlers: Object.keys(map) });
  }

  // ==========================================
  // Bus Subscribers (auto-wired desde manifest)
  // ==========================================

  async onVariacionValidada(event) {
    const data = event?.data || event?.payload || event;
    this.logger.info('pedidos.variacion.validada.received', {
      producto_id: data?.producto_id,
      precio_total: data?.precio_total,
      correlation_id: event?.metadata?.correlationId
    });
  }

  async onVariacionRechazada(event) {
    const data = event?.data || event?.payload || event;
    this.logger.warn('pedidos.variacion.rechazada.received', {
      producto_id: data?.producto_id,
      motivo: data?.motivo,
      correlation_id: event?.metadata?.correlationId
    });
  }

  async onCuentaCreada(event) {
    const data = event?.data || event?.payload || event;
    const { cuenta_id } = data || {};
    if (!cuenta_id) return;
    if (!this.pedidosPorCuenta.has(cuenta_id)) {
      this.pedidosPorCuenta.set(cuenta_id, new Set());
    }
  }

  async onCajaCerrada(event) {
    const size = this.pedidos.size;
    this.pedidos.clear();
    this.pedidosPorCuenta.clear();
    this.metrics?.gauge?.('pedidos.activos.count', 0);
    this.logger.info('pedidos.reset.caja_cerrada', {
      pedidos_limpiados: size,
      correlation_id: event?.metadata?.correlationId
    });
  }

  async onDiaIniciado(event) {
    const size = this.pedidos.size;
    this.pedidos.clear();
    this.pedidosPorCuenta.clear();
    this.metrics?.gauge?.('pedidos.activos.count', 0);
    this.logger.info('pedidos.reset.dia_iniciado', {
      pedidos_limpiados: size,
      correlation_id: event?.metadata?.correlationId
    });
  }

  async onComanderoEnviarCocina(event) {
    try {
      const data = event?.data || event?.payload || event;
      const correlationId = event?.metadata?.correlationId;
      const { cuenta_id, pedido_id: comandero_pedido_id, items, total, notas_generales, created_at, project_id, ref_display } = data || {};

      if (!cuenta_id || !items || items.length === 0) {
        this.logger.warn('pedidos.bridge.datos_incompletos', { cuenta_id, correlation_id: correlationId });
        return;
      }

      this.logger.info('pedidos.bridge.recibido', {
        cuenta_id, items_count: items.length, total,
        correlation_id: correlationId
      });

      const pedido_id = comandero_pedido_id || crypto.randomUUID();
      const canal = this._detectarCanal(cuenta_id);

      const pedido = {
        id: pedido_id,
        cuenta_id,
        canal,
        ref_display: ref_display || null,
        project_id: project_id || null,
        items: items.map(item => this._buildPedidoItem(item, 'en_cocina')),
        estado: 'en_cocina',
        subtotal: total || 0,
        total: total || 0,
        notas_generales: notas_generales || null,
        created_at: created_at || new Date().toISOString(),
        enviado_cocina_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      this.pedidos.set(pedido_id, pedido);
      if (!this.pedidosPorCuenta.has(cuenta_id)) {
        this.pedidosPorCuenta.set(cuenta_id, new Set());
      }
      this.pedidosPorCuenta.get(cuenta_id).add(pedido_id);

      this.metrics?.increment?.('pedidos.creado.total');
      this.metrics?.increment?.('pedidos.enviado_cocina.total');
      this.metrics?.gauge?.('pedidos.activos.count', this.pedidos.size);

      await this._publishPedidoCreado(pedido, { correlation_id: correlationId });
      await this._publishEnviadoCocina(pedido, { correlation_id: correlationId });

      this.logger.info('pedidos.bridge.pedido_formal_creado', {
        pedido_id, cuenta_id,
        items_count: pedido.items.length,
        total: pedido.total,
        correlation_id: correlationId
      });
    } catch (err) {
      this._handleHandlerError('pedidos.bridge.error', err, 'subscribe');
    }
  }

  async onCatalogoActualizado(event) {
    const data = event?.data || event?.payload || event;
    const productos = data?.productos || [];
    for (const producto of productos) {
      if (producto.id && producto.precio !== undefined) {
        this.productosCache.set(producto.id, {
          nombre: producto.nombre || producto.id,
          precio: producto.precio,
          categoria: producto.categoria,
          estaciones: producto.estaciones || null
        });
      }
    }
    this.logger.info('pedidos.catalogo.synced', {
      productos_en_cache: this.productosCache.size
    });
  }

  async onProductoActualizado(event) {
    const data = event?.data || event?.payload || event;
    const { id, nombre, precio, categoria } = data || {};
    if (id && precio !== undefined) {
      this.productosCache.set(id, { nombre: nombre || id, precio, categoria });
      this.logger.info('pedidos.producto.cache_updated', { producto_id: id, precio });
    }
  }

  _buildPedidoItem(item, defaultEstado = 'pendiente') {
    const precio = item.precio || item.precio_unitario || 0;
    const cantidad = item.cantidad || 1;
    const built = {
      item_id: item.id || item.item_id || crypto.randomUUID(),
      producto_id: item.producto_id,
      nombre: item.nombre,
      categoria: item.categoria || null,
      estaciones: item.estaciones || null,
      cantidad,
      precio_unitario: precio,
      precio_total: item.subtotal || item.precio_total || precio * cantidad,
      variaciones: item.variaciones || null,
      notas: item.notas || null,
      estado: defaultEstado,
      created_at: item.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (item.tipo) built.tipo = item.tipo;
    if (item.pizza_izquierda) built.pizza_izquierda = item.pizza_izquierda;
    if (item.pizza_derecha) built.pizza_derecha = item.pizza_derecha;
    if (item.ingredientes) built.ingredientes = item.ingredientes;
    if (item.ingredientes_base) built.ingredientes_base = item.ingredientes_base;
    return built;
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleCreatePedido(data) {
    try {
      const start_time = Date.now();
      const { cuenta_id, project_id, notas_generales } = data || {};

      if (!cuenta_id) {
        this.metrics?.increment?.('pedidos.errors', { code: 'INVALID_INPUT', kind: 'create' });
        this.logger.warn('pedidos.create.missing', { field: 'cuenta_id' });
        return this._errorResponse(400, 'INVALID_INPUT', 'cuenta_id es requerido', { field: 'cuenta_id' });
      }

      const pedido_id = crypto.randomUUID();
      const canal = this._detectarCanal(cuenta_id);

      const pedido = {
        id: pedido_id,
        cuenta_id,
        canal,
        project_id: project_id || null,
        items: [],
        estado: 'borrador',
        subtotal: 0,
        total: 0,
        notas_generales: notas_generales || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      this.pedidos.set(pedido_id, pedido);
      if (!this.pedidosPorCuenta.has(cuenta_id)) {
        this.pedidosPorCuenta.set(cuenta_id, new Set());
      }
      this.pedidosPorCuenta.get(cuenta_id).add(pedido_id);

      this.metrics?.increment?.('pedidos.creado.total');
      this.metrics?.gauge?.('pedidos.activos.count', this.pedidos.size);
      this.metrics?.timing?.('pedidos.create.duration', Date.now() - start_time);

      await this._publishPedidoCreado(pedido, data);

      this.logger.info('pedidos.creado', {
        pedido_id, cuenta_id, duration: Date.now() - start_time
      });

      return { status: 201, data: pedido };
    } catch (err) {
      return this._handleHandlerError('pedidos.create.error', err);
    }
  }

  async handleListPedidos(data) {
    try {
      const { cuenta_id, estado } = data || {};
      let pedidos = Array.from(this.pedidos.values());
      if (cuenta_id) pedidos = pedidos.filter(p => p.cuenta_id === cuenta_id);
      if (estado) pedidos = pedidos.filter(p => p.estado === estado);
      pedidos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return { status: 200, data: { pedidos, total: pedidos.length } };
    } catch (err) {
      return this._handleHandlerError('pedidos.list.error', err);
    }
  }

  async handleGetPedido(data) {
    try {
      const { id } = data || {};
      if (!id) {
        return this._errorResponse(400, 'INVALID_INPUT', 'id requerido', { field: 'id' });
      }
      const pedido = this.pedidos.get(id);
      if (!pedido) {
        this.metrics?.increment?.('pedidos.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'get' });
        this.logger.warn('pedidos.get.not_found', { id });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', { id });
      }
      return { status: 200, data: pedido };
    } catch (err) {
      return this._handleHandlerError('pedidos.get.error', err);
    }
  }

  async handleAgregarItem(data) {
    try {
      const start_time = Date.now();
      const { pedido_id, producto_id, cantidad, variaciones, notas } = data || {};

      const pedido = this.pedidos.get(pedido_id);
      if (!pedido) {
        this.metrics?.increment?.('pedidos.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'add-item' });
        this.logger.warn('pedidos.add_item.not_found', { pedido_id });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', { pedido_id });
      }

      if (pedido.estado !== 'borrador' && pedido.estado !== 'confirmado') {
        this.metrics?.increment?.('pedidos.errors', { code: 'CONFLICT_STATE', kind: 'add-item' });
        this.logger.warn('pedidos.add_item.bad_state', { pedido_id, estado: pedido.estado });
        return this._errorResponse(409, 'CONFLICT_STATE',
          `No se pueden agregar items a un pedido en estado ${pedido.estado}`,
          { pedido_id, estado: pedido.estado });
      }

      if (!producto_id) {
        this.metrics?.increment?.('pedidos.errors', { code: 'INVALID_INPUT', kind: 'add-item' });
        this.logger.warn('pedidos.add_item.missing', { field: 'producto_id' });
        return this._errorResponse(400, 'INVALID_INPUT', 'producto_id es requerido', { field: 'producto_id' });
      }

      const item_id = crypto.randomUUID();
      const producto = this.productosCache.get(producto_id);
      const precio_unitario = producto?.precio ?? 0;
      const nombre_producto = producto?.nombre ?? producto_id;

      if (!producto) {
        this.logger.warn('pedidos.producto.not_in_cache', {
          producto_id, cache_size: this.productosCache.size
        });
      }

      const cantidadFinal = cantidad || 1;
      const item = {
        item_id, producto_id,
        nombre: nombre_producto,
        cantidad: cantidadFinal,
        precio_unitario,
        precio_total: precio_unitario * cantidadFinal,
        variaciones: variaciones || null,
        notas: notas || null,
        estado: 'pendiente',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      pedido.items.push(item);
      pedido.subtotal = this._calcularSubtotal(pedido);
      pedido.total = pedido.subtotal;
      pedido.updated_at = new Date().toISOString();

      this.metrics?.increment?.('pedidos.item_agregado.total');
      this.metrics?.gauge?.('pedidos.items_total.count',
        Array.from(this.pedidos.values()).reduce((sum, p) => sum + p.items.length, 0)
      );

      await this._publishItemAgregado(pedido, item, data);

      this.logger.info('pedidos.item_agregado', {
        pedido_id, item_id, producto_id, cantidad: cantidadFinal, precio_unitario,
        duration: Date.now() - start_time
      });

      return { status: 201, data: { pedido_id, item, total: pedido.total } };
    } catch (err) {
      return this._handleHandlerError('pedidos.add_item.error', err);
    }
  }

  async handleActualizarItem(data) {
    try {
      const { pedido_id, item_id, cantidad, variaciones, notas } = data || {};
      const pedido = this.pedidos.get(pedido_id);
      if (!pedido) {
        this.metrics?.increment?.('pedidos.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'update-item' });
        this.logger.warn('pedidos.update_item.pedido_not_found', { pedido_id });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', { pedido_id });
      }

      const itemIndex = pedido.items.findIndex(i => i.item_id === item_id);
      if (itemIndex === -1) {
        this.metrics?.increment?.('pedidos.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'update-item' });
        this.logger.warn('pedidos.update_item.item_not_found', { pedido_id, item_id });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Item no encontrado', { item_id });
      }

      const item = pedido.items[itemIndex];
      const cambios = {};

      if (cantidad !== undefined && cantidad !== item.cantidad) {
        cambios.cantidad = { anterior: item.cantidad, nuevo: cantidad };
        item.cantidad = cantidad;
        item.precio_total = item.precio_unitario * item.cantidad;
      }
      if (variaciones !== undefined) {
        cambios.variaciones = { anterior: item.variaciones, nuevo: variaciones };
        item.variaciones = variaciones;
      }
      if (notas !== undefined) {
        cambios.notas = { anterior: item.notas, nuevo: notas };
        item.notas = notas;
      }

      item.updated_at = new Date().toISOString();
      pedido.subtotal = this._calcularSubtotal(pedido);
      pedido.total = pedido.subtotal;
      pedido.updated_at = new Date().toISOString();

      await this._publishItemActualizado(pedido, item_id, cambios, data);
      this.logger.info('pedidos.item_actualizado', { pedido_id, item_id, cambios });
      return { status: 200, data: { pedido_id, item, total: pedido.total } };
    } catch (err) {
      return this._handleHandlerError('pedidos.update_item.error', err);
    }
  }

  async handleEliminarItem(data) {
    try {
      const { pedido_id, item_id } = data || {};
      const pedido = this.pedidos.get(pedido_id);
      if (!pedido) {
        this.metrics?.increment?.('pedidos.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'delete-item' });
        this.logger.warn('pedidos.delete_item.pedido_not_found', { pedido_id });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', { pedido_id });
      }
      const itemIndex = pedido.items.findIndex(i => i.item_id === item_id);
      if (itemIndex === -1) {
        this.metrics?.increment?.('pedidos.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'delete-item' });
        this.logger.warn('pedidos.delete_item.item_not_found', { pedido_id, item_id });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Item no encontrado', { item_id });
      }

      pedido.items.splice(itemIndex, 1);
      pedido.subtotal = this._calcularSubtotal(pedido);
      pedido.total = pedido.subtotal;
      pedido.updated_at = new Date().toISOString();

      await this._publishItemEliminado(pedido, item_id, data);
      this.logger.info('pedidos.item_eliminado', { pedido_id, item_id });
      return { status: 200, data: { pedido_id, item_id, total: pedido.total } };
    } catch (err) {
      return this._handleHandlerError('pedidos.delete_item.error', err);
    }
  }

  async handleEnviarCocina(data) {
    try {
      const start_time = Date.now();
      const { id } = data || {};
      const pedido = this.pedidos.get(id);
      if (!pedido) {
        this.metrics?.increment?.('pedidos.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'send-kitchen' });
        this.logger.warn('pedidos.send_kitchen.not_found', { id });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', { id });
      }
      if (pedido.items.length === 0) {
        this.metrics?.increment?.('pedidos.errors', { code: 'INVALID_INPUT', kind: 'send-kitchen' });
        this.logger.warn('pedidos.send_kitchen.empty', { id });
        return this._errorResponse(400, 'INVALID_INPUT', 'No se puede enviar un pedido vacio a cocina', { id });
      }
      if (pedido.estado === 'en_cocina') {
        this.metrics?.increment?.('pedidos.errors', { code: 'CONFLICT_STATE', kind: 'send-kitchen' });
        this.logger.warn('pedidos.send_kitchen.already', { id });
        return this._errorResponse(409, 'CONFLICT_STATE', 'Pedido ya esta en cocina', { id });
      }

      pedido.estado = 'en_cocina';
      pedido.enviado_cocina_at = new Date().toISOString();
      pedido.updated_at = new Date().toISOString();
      pedido.items.forEach(item => {
        if (item.estado === 'pendiente') item.estado = 'en_cocina';
      });

      this.metrics?.increment?.('pedidos.enviado_cocina.total');
      this.metrics?.gauge?.('pedidos.en_cocina.count',
        Array.from(this.pedidos.values()).filter(p => p.estado === 'en_cocina').length
      );
      this.metrics?.timing?.('pedidos.envio_cocina.duration', Date.now() - start_time);

      await this._publishEnviadoCocina(pedido, data);
      this.logger.info('pedidos.enviado_cocina', {
        pedido_id: id, items_count: pedido.items.length,
        duration: Date.now() - start_time
      });

      return {
        status: 200,
        data: {
          pedido_id: id,
          estado: pedido.estado,
          items_count: pedido.items.length,
          enviado_at: pedido.enviado_cocina_at
        }
      };
    } catch (err) {
      return this._handleHandlerError('pedidos.send_kitchen.error', err);
    }
  }

  async handleCompletarPedido(data) {
    try {
      const { id } = data || {};
      const pedido = this.pedidos.get(id);
      if (!pedido) {
        this.metrics?.increment?.('pedidos.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'complete' });
        this.logger.warn('pedidos.complete.not_found', { id });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', { id });
      }
      pedido.estado = 'completado';
      pedido.completado_at = new Date().toISOString();
      pedido.updated_at = new Date().toISOString();
      const duracion = Math.floor((new Date(pedido.completado_at) - new Date(pedido.created_at)) / 1000 / 60);

      this.metrics?.increment?.('pedidos.completado.total');
      await this._publishPedidoCompletado(pedido, duracion, data);
      this.logger.info('pedidos.completado', { pedido_id: id, duracion_minutos: duracion });

      return {
        status: 200,
        data: {
          pedido_id: id,
          estado: pedido.estado,
          completado_at: pedido.completado_at,
          duracion_minutos: duracion
        }
      };
    } catch (err) {
      return this._handleHandlerError('pedidos.complete.error', err);
    }
  }

  async handleCancelarPedido(data) {
    try {
      const { id, motivo } = data || {};
      const pedido = this.pedidos.get(id);
      if (!pedido) {
        this.metrics?.increment?.('pedidos.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'cancel' });
        this.logger.warn('pedidos.cancel.not_found', { id });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', { id });
      }
      pedido.estado = 'cancelado';
      pedido.cancelado_at = new Date().toISOString();
      pedido.updated_at = new Date().toISOString();

      this.metrics?.increment?.('pedidos.cancelado.total');
      await this._publishPedidoCancelado(pedido, motivo, data);
      this.logger.info('pedidos.cancelado', { pedido_id: id, motivo });

      return {
        status: 200,
        data: {
          pedido_id: id,
          estado: pedido.estado,
          motivo: motivo || null,
          cancelado_at: pedido.cancelado_at
        }
      };
    } catch (err) {
      return this._handleHandlerError('pedidos.cancel.error', err);
    }
  }

  async handleCalcularTotal(data) {
    try {
      const { id } = data || {};
      const pedido = this.pedidos.get(id);
      if (!pedido) {
        this.metrics?.increment?.('pedidos.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'total' });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', { id });
      }
      return {
        status: 200,
        data: {
          pedido_id: id,
          subtotal: pedido.subtotal,
          total: pedido.total,
          items_count: pedido.items.length
        }
      };
    } catch (err) {
      return this._handleHandlerError('pedidos.total.error', err);
    }
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        productos_en_cache: this.productosCache.size,
        pedidos: {
          total: this.pedidos.size,
          borrador: Array.from(this.pedidos.values()).filter(p => p.estado === 'borrador').length,
          en_cocina: Array.from(this.pedidos.values()).filter(p => p.estado === 'en_cocina').length,
          completado: Array.from(this.pedidos.values()).filter(p => p.estado === 'completado').length
        }
      }
    };
  }

  // ==========================================
  // Event Publishers (canonicos via _publicarEvento)
  // ==========================================

  async _publishPedidoCreado(pedido, sourcePayload) {
    await this._publicarEvento('pedido.creado', {
      pedido_id: pedido.id,
      cuenta_id: pedido.cuenta_id,
      canal: pedido.canal || null,
      ref_display: pedido.ref_display || null,
      project_id: pedido.project_id || null,
      estado: pedido.estado,
      total: pedido.total,
      items: pedido.items || [],
      created_at: pedido.created_at
    }, sourcePayload);
  }

  async _publishItemAgregado(pedido, item, sourcePayload) {
    await this._publicarEvento('pedido.item_agregado', {
      pedido_id: pedido.id,
      cuenta_id: pedido.cuenta_id,
      project_id: pedido.project_id || null,
      item_id: item.item_id,
      producto_id: item.producto_id,
      nombre: item.nombre,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      precio_total: item.precio_total,
      variaciones: item.variaciones,
      notas: item.notas
    }, sourcePayload);
  }

  async _publishItemActualizado(pedido, item_id, cambios, sourcePayload) {
    await this._publicarEvento('pedido.item_actualizado', {
      pedido_id: pedido.id,
      project_id: pedido.project_id || null,
      item_id,
      cambios
    }, sourcePayload);
  }

  async _publishItemEliminado(pedido, item_id, sourcePayload) {
    await this._publicarEvento('pedido.item_eliminado', {
      pedido_id: pedido.id,
      project_id: pedido.project_id || null,
      item_id,
      motivo: 'eliminado_por_usuario'
    }, sourcePayload);
  }

  async _publishEnviadoCocina(pedido, sourcePayload) {
    await this._publicarEvento('pedido.enviado_cocina', {
      pedido_id: pedido.id,
      cuenta_id: pedido.cuenta_id,
      canal: pedido.canal || null,
      ref_display: pedido.ref_display || null,
      project_id: pedido.project_id || null,
      items: pedido.items.map(item => {
        const mapped = {
          item_id: item.item_id,
          producto_id: item.producto_id,
          nombre: item.nombre,
          categoria: item.categoria || null,
          estaciones: item.estaciones || null,
          cantidad: item.cantidad,
          variaciones: item.variaciones,
          notas: item.notas
        };
        if (item.tipo) mapped.tipo = item.tipo;
        if (item.pizza_izquierda) mapped.pizza_izquierda = item.pizza_izquierda;
        if (item.pizza_derecha) mapped.pizza_derecha = item.pizza_derecha;
        if (item.ingredientes) mapped.ingredientes = item.ingredientes;
        if (item.ingredientes_base) mapped.ingredientes_base = item.ingredientes_base;
        return mapped;
      }),
      items_count: pedido.items.length,
      notas_generales: pedido.notas_generales,
      enviado_at: pedido.enviado_cocina_at
    }, sourcePayload);
  }

  async _publishPedidoCompletado(pedido, duracion_minutos, sourcePayload) {
    await this._publicarEvento('pedido.completado', {
      pedido_id: pedido.id,
      cuenta_id: pedido.cuenta_id,
      project_id: pedido.project_id || null,
      total: pedido.total,
      items_count: pedido.items.length,
      completado_at: pedido.completado_at,
      duracion_minutos
    }, sourcePayload);
  }

  async _publishPedidoCancelado(pedido, motivo, sourcePayload) {
    await this._publicarEvento('pedido.cancelado', {
      pedido_id: pedido.id,
      cuenta_id: pedido.cuenta_id,
      project_id: pedido.project_id || null,
      motivo: motivo || 'sin_especificar',
      cancelado_at: pedido.cancelado_at
    }, sourcePayload);
  }

  // ==========================================
  // Restauracion legacy desde cuentas_activas.json
  // ==========================================

  async _restaurarDesdeArchivo() {
    const archivo = path.join('./data/current', 'cuentas_activas.json');
    const datos = await this._readJsonSafe(archivo);
    if (!datos?.cuentas) return;

    let restaurados = 0;
    for (const [cuenta_id, cuenta] of Object.entries(datos.cuentas)) {
      if (!cuenta.pedidos || cuenta.pedidos.length === 0) continue;
      if (!this.pedidosPorCuenta.has(cuenta_id)) {
        this.pedidosPorCuenta.set(cuenta_id, new Set());
      }
      const canal = this._detectarCanal(cuenta_id);

      for (const pedidoData of cuenta.pedidos) {
        const pedido_id = pedidoData.pedido_id;
        if (!pedido_id || this.pedidos.has(pedido_id)) continue;

        const pedido = {
          id: pedido_id,
          cuenta_id,
          canal,
          project_id: cuenta.project_id || null,
          items: (pedidoData.items || []).map(item => this._buildPedidoItem(item, 'en_cocina')),
          estado: 'en_cocina',
          subtotal: pedidoData.total || 0,
          total: pedidoData.total || 0,
          notas_generales: null,
          created_at: cuenta.created_at || new Date().toISOString(),
          updated_at: cuenta.updated_at || new Date().toISOString()
        };

        this.pedidos.set(pedido_id, pedido);
        this.pedidosPorCuenta.get(cuenta_id).add(pedido_id);
        restaurados++;
      }
    }

    if (restaurados > 0) {
      this.metrics?.gauge?.('pedidos.activos.count', this.pedidos.size);
      this.logger.info('pedidos.estado_restaurado', {
        pedidos_restaurados: restaurados,
        cuentas_con_pedidos: this.pedidosPorCuenta.size
      });
    }
  }

  // ==========================================
  // Helpers internos
  // ==========================================

  _calcularSubtotal(pedido) {
    return pedido.items.reduce((sum, item) => sum + item.precio_total, 0);
  }

  _detectarCanal(cuenta_id) {
    if (!cuenta_id) return null;
    const longPrefixes = [
      ['llevadoo_', 'llevadoo'], ['mesa_', 'mesa'], ['llevar_', 'llevar'],
      ['telefono_', 'telefono'], ['tel_', 'telefono'],
      ['whatsapp_', 'whatsapp'], ['wa_', 'whatsapp'],
      ['glovo_', 'glovo'], ['delivery_', 'delivery']
    ];
    for (const [prefix, canal] of longPrefixes) {
      if (cuenta_id.startsWith(prefix)) return canal;
    }
    const shortPrefixes = [
      ['M_', 'mesa'], ['L_', 'llevar'], ['T_', 'telefono'],
      ['W_', 'whatsapp'], ['G_', 'glovo'], ['D_', 'llevadoo']
    ];
    for (const [prefix, canal] of shortPrefixes) {
      if (cuenta_id.startsWith(prefix)) return canal;
    }
    return null;
  }
}

module.exports = PedidosModule;

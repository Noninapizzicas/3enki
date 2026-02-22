/**
 * Módulo Cocina v2.0
 * Display de cocina en tiempo real con tracking item a item
 * Alineado con patrones event-core: uiHandler, event envelope, cleanup
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const cocinaSchema = require('./schemas/cocina.json');
const eventsSchema = require('./schemas/events.json');

class CocinaModule {
  constructor() {
    this.name = 'cocina';
    this.version = '2.0.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.uiHandler = null;

    // Validación JSON Schema
    this.ajv = new Ajv({ allErrors: true, useDefaults: true });
    addFormats(this.ajv);
    this.ajv.addSchema(cocinaSchema);
    this.ajv.addSchema(eventsSchema);

    // Estado en memoria
    this.pedidosActivos = new Map(); // pedido_id -> pedido_cocina
    this.historial = []; // últimos 50 pedidos completados
    this.maxHistorial = 50;

    // SSE clients
    this.sseClients = new Set();

    // Métricas internas
    this.internalMetrics = {
      pedidos_recibidos: 0,
      items_preparados: 0,
      pedidos_listos: 0,
      pedidos_cancelados: 0,
      tiempo_promedio_preparacion: 0
    };

    this.tiemposPreparacion = [];
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    // Event subscriptions are auto-wired from module.json by the loader.
    this.registerUIHandlers();

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    // Cerrar clientes SSE
    for (const client of this.sseClients) {
      try {
        if (client.close) client.close();
      } catch (_) { /* ignore */ }
    }
    this.sseClients.clear();

    // Desregistrar UI handlers
    if (this.uiHandler) {
      const actions = [
        'list-active', 'get', 'history', 'prepare-item',
        'mark-ready', 'stream', 'health', 'metrics'
      ];
      for (const action of actions) {
        this.uiHandler.unregister('cocina', action);
      }
    }

    // Limpiar estado
    this.pedidosActivos.clear();
    this.historial = [];
    this.tiemposPreparacion = [];

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // UI Handler Registration
  // ==========================================

  registerUIHandlers() {
    if (!this.uiHandler) {
      this.logger.warn('cocina.uiHandler.not_available', { module: this.name });
      return;
    }

    this.uiHandler.register('cocina', 'list-active', this.handleGetActivos.bind(this));
    this.uiHandler.register('cocina', 'get', this.handleGetPedido.bind(this));
    this.uiHandler.register('cocina', 'history', this.handleGetHistorial.bind(this));
    this.uiHandler.register('cocina', 'prepare-item', this.handlePrepararItem.bind(this));
    this.uiHandler.register('cocina', 'mark-ready', this.handleMarcarListo.bind(this));
    this.uiHandler.register('cocina', 'stream', this.handleSSEStream.bind(this));
    this.uiHandler.register('cocina', 'health', this.handleHealthCheck.bind(this));
    this.uiHandler.register('cocina', 'metrics', this.handleGetMetrics.bind(this));

    this.logger.info('cocina.ui_handlers.registered', {
      handlers: ['list-active', 'get', 'history', 'prepare-item', 'mark-ready', 'stream', 'health', 'metrics']
    });
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe('pedido.enviado_cocina', this.onPedidoEnviadoCocina.bind(this));
    await this.eventBus.subscribe('pedido.cancelado', this.onPedidoCancelado.bind(this));

    this.logger.info('cocina.events.subscribed', {
      events: ['pedido.enviado_cocina', 'pedido.cancelado']
    });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onPedidoEnviadoCocina(event) {
    const data = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { pedido_id, items, numero_mesa, cuenta_id, notas_generales } = data;

    this.logger.info('cocina.pedido.recibido', {
      correlation_id: correlationId,
      pedido_id,
      numero_mesa,
      items_count: items?.length || 0
    });

    const pedidoCocina = {
      pedido_id,
      numero_mesa,
      cuenta_id,
      items: (items || []).map(item => {
        const cocinaItem = {
          item_id: item.item_id,
          producto_id: item.producto_id,
          nombre: item.nombre,
          cantidad: item.cantidad,
          variaciones: item.variaciones || {},
          notas: item.notas || '',
          estado: 'pendiente'
        };
        // Metadata especial: mitad-mitad, al gusto, etc.
        if (item.tipo) cocinaItem.tipo = item.tipo;
        if (item.pizza_izquierda) cocinaItem.pizza_izquierda = item.pizza_izquierda;
        if (item.pizza_derecha) cocinaItem.pizza_derecha = item.pizza_derecha;
        if (item.ingredientes) cocinaItem.ingredientes = item.ingredientes;
        return cocinaItem;
      }),
      estado: 'activo',
      notas_generales: notas_generales || '',
      recibido_at: new Date().toISOString()
    };

    this.pedidosActivos.set(pedido_id, pedidoCocina);
    this.internalMetrics.pedidos_recibidos++;

    this.broadcastSSE({ type: 'nuevo_pedido', data: pedidoCocina });
  }

  async onPedidoCancelado(event) {
    const data = event?.data || event?.payload || event;
    const { pedido_id } = data;

    if (!this.pedidosActivos.has(pedido_id)) return;

    this.pedidosActivos.delete(pedido_id);
    this.internalMetrics.pedidos_cancelados++;

    this.broadcastSSE({ type: 'pedido_cancelado', data: { pedido_id } });

    this.logger.info('cocina.pedido.cancelado', { pedido_id });
  }

  // ==========================================
  // UI Handlers (MQTT Request/Response)
  // ==========================================

  async handleGetActivos() {
    const activos = Array.from(this.pedidosActivos.values());
    activos.sort((a, b) => new Date(a.recibido_at) - new Date(b.recibido_at));

    const itemsPendientes = activos.reduce((sum, p) => {
      return sum + p.items.filter(i => i.estado === 'pendiente').length;
    }, 0);

    return {
      status: 200,
      data: { pedidos: activos, total: activos.length, items_pendientes: itemsPendientes }
    };
  }

  async handleGetHistorial(data) {
    const { limit } = data || {};
    const historial = this.historial.slice(0, parseInt(limit) || 20);

    return {
      status: 200,
      data: { pedidos: historial, total: historial.length }
    };
  }

  async handleGetPedido(data) {
    const { pedido_id } = data;
    const pedido = this.pedidosActivos.get(pedido_id);

    if (!pedido) {
      return { status: 404, error: 'Pedido no encontrado en cocina' };
    }

    return { status: 200, data: pedido };
  }

  async handlePrepararItem(data) {
    const { item_id } = data;

    // Buscar item en pedidos activos
    let pedidoEncontrado = null;
    let itemEncontrado = null;

    for (const pedido of this.pedidosActivos.values()) {
      const item = pedido.items.find(i => i.item_id === item_id);
      if (item) {
        pedidoEncontrado = pedido;
        itemEncontrado = item;
        break;
      }
    }

    if (!itemEncontrado) {
      return { status: 404, error: 'Item no encontrado en cocina' };
    }

    // Marcar como listo
    itemEncontrado.estado = 'listo';
    itemEncontrado.preparado_at = new Date().toISOString();
    this.internalMetrics.items_preparados++;

    await this.publishItemPreparado(pedidoEncontrado.pedido_id, itemEncontrado);

    this.broadcastSSE({
      type: 'item_preparado',
      data: { pedido_id: pedidoEncontrado.pedido_id, item_id }
    });

    // Auto-completar si todos listos
    const todosListos = pedidoEncontrado.items.every(i => i.estado === 'listo');
    if (todosListos) {
      await this.marcarPedidoListo(pedidoEncontrado);
    }

    this.logger.info('cocina.item.preparado', {
      pedido_id: pedidoEncontrado.pedido_id, item_id, pedido_completo: todosListos
    });

    return {
      status: 200,
      data: { item: itemEncontrado, pedido_completo: todosListos }
    };
  }

  async handleMarcarListo(data) {
    const { pedido_id } = data;

    const pedido = this.pedidosActivos.get(pedido_id);
    if (!pedido) {
      return { status: 404, error: 'Pedido no encontrado en cocina' };
    }

    const now = new Date().toISOString();
    pedido.items.forEach(item => {
      if (item.estado !== 'listo') {
        item.estado = 'listo';
        item.preparado_at = now;
        this.internalMetrics.items_preparados++;
      }
    });

    await this.marcarPedidoListo(pedido);

    return { status: 200, data: pedido };
  }

  async handleSSEStream(data) {
    // El uiHandler/core gestiona la conexión SSE
    // Aquí registramos el interés y devolvemos estado inicial
    const activos = Array.from(this.pedidosActivos.values());

    return {
      status: 200,
      data: {
        type: 'connected',
        pedidos_activos: activos,
        clientes_sse: this.sseClients.size
      }
    };
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        pedidos_activos: this.pedidosActivos.size,
        clientes_sse: this.sseClients.size
      }
    };
  }

  async handleGetMetrics() {
    return {
      status: 200,
      data: {
        ...this.internalMetrics,
        pedidos_activos: this.pedidosActivos.size,
        clientes_sse: this.sseClients.size
      }
    };
  }

  // ==========================================
  // Lógica interna
  // ==========================================

  async marcarPedidoListo(pedido) {
    pedido.estado = 'listo';
    pedido.listo_at = new Date().toISOString();

    // Tiempo de preparación
    const tiempoPreparacion = (new Date(pedido.listo_at) - new Date(pedido.recibido_at)) / 1000;
    pedido.tiempo_preparacion = tiempoPreparacion;

    // Rolling average (últimos 100)
    this.tiemposPreparacion.push(tiempoPreparacion);
    if (this.tiemposPreparacion.length > 100) {
      this.tiemposPreparacion.shift();
    }
    this.internalMetrics.tiempo_promedio_preparacion =
      this.tiemposPreparacion.reduce((a, b) => a + b, 0) / this.tiemposPreparacion.length;

    this.internalMetrics.pedidos_listos++;

    // Historial (últimos 50)
    this.historial.unshift(pedido);
    if (this.historial.length > this.maxHistorial) {
      this.historial.pop();
    }

    this.pedidosActivos.delete(pedido.pedido_id);

    await this.publishPedidoListo(pedido);

    this.broadcastSSE({
      type: 'pedido_listo',
      data: {
        pedido_id: pedido.pedido_id,
        numero_mesa: pedido.numero_mesa,
        tiempo_preparacion: tiempoPreparacion
      }
    });

    this.logger.info('cocina.pedido.listo', {
      pedido_id: pedido.pedido_id,
      tiempo_preparacion: tiempoPreparacion
    });
  }

  broadcastSSE(message) {
    for (const client of this.sseClients) {
      try {
        client.send(message);
      } catch (error) {
        this.sseClients.delete(client);
      }
    }
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishItemPreparado(pedido_id, item) {
    await this.eventBus.publish('cocina.item_preparado', {
      pedido_id,
      item_id: item.item_id,
      producto_id: item.producto_id,
      nombre: item.nombre,
      cantidad: item.cantidad,
      preparado_at: item.preparado_at
    });
  }

  async publishPedidoListo(pedido) {
    await this.eventBus.publish('cocina.pedido_listo', {
      pedido_id: pedido.pedido_id,
      numero_mesa: pedido.numero_mesa,
      items_count: pedido.items.length,
      tiempo_preparacion: pedido.tiempo_preparacion,
      listo_at: pedido.listo_at
    });
  }
}

module.exports = CocinaModule;

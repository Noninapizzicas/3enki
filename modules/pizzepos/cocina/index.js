/**
 * Módulo Cocina v2.1
 * Display de cocina en tiempo real con tracking item a item
 * Estados item: pendiente → preparando → listo
 * Alineado con patrones event-core: uiHandler, event envelope, cleanup
 */

class CocinaModule {
  constructor() {
    this.name = 'cocina';
    this.version = '2.1.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.uiHandler = null;

    // Estado en memoria
    this.pedidosActivos = new Map(); // pedido_id -> pedido_cocina
    this.historial = []; // últimos 50 pedidos completados
    this.maxHistorial = 50;

    // SSE clients
    this.sseClients = new Set();

    // Rolling average tiempos preparación (últimos 100)
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

    // Restaurar pedidos activos en cocina desde persistencia
    await this.restaurarDesdeArchivo();

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
  // Event Handlers (auto-wired from module.json)
  // ==========================================

  async onPedidoEnviadoCocina(event) {
    const data = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { pedido_id, items, cuenta_id, canal, notas_generales, metadata } = data;

    this.logger.info('cocina.pedido.recibido', {
      correlation_id: correlationId,
      pedido_id,
      canal: canal || 'directo',
      items_count: items?.length || 0
    });

    const pedidoCocina = {
      pedido_id,
      cuenta_id,
      canal: canal || null,
      items: (items || []).map(item => {
        const cocinaItem = {
          item_id: item.item_id,
          producto_id: item.producto_id,
          nombre: item.nombre,
          cantidad: item.cantidad,
          variaciones: item.variaciones || null,
          notas: item.notas || '',
          estado: 'pendiente'
        };
        // Metadata especial: mitad-mitad, al gusto, ingredientes_base, etc.
        if (item.tipo) cocinaItem.tipo = item.tipo;
        if (item.pizza_izquierda) cocinaItem.pizza_izquierda = item.pizza_izquierda;
        if (item.pizza_derecha) cocinaItem.pizza_derecha = item.pizza_derecha;
        if (item.ingredientes) cocinaItem.ingredientes = item.ingredientes;
        if (item.ingredientes_base) cocinaItem.ingredientes_base = item.ingredientes_base;
        return cocinaItem;
      }),
      estado: 'activo',
      notas_generales: notas_generales || '',
      recibido_at: new Date().toISOString(),
      metadata: metadata || null
    };

    this.pedidosActivos.set(pedido_id, pedidoCocina);

    this.metrics?.increment?.('cocina.pedido_recibido.total');
    this.metrics?.gauge?.('cocina.pedidos_activos.count', this.pedidosActivos.size);

    this.broadcastSSE({ type: 'nuevo_pedido', data: pedidoCocina });
  }

  async onPedidoCancelado(event) {
    const data = event?.data || event?.payload || event;
    const { pedido_id } = data;

    if (!this.pedidosActivos.has(pedido_id)) return;

    this.pedidosActivos.delete(pedido_id);

    this.metrics?.increment?.('cocina.pedido_cancelado.total');
    this.metrics?.gauge?.('cocina.pedidos_activos.count', this.pedidosActivos.size);

    this.broadcastSSE({ type: 'pedido_cancelado', data: { pedido_id } });

    this.logger.info('cocina.pedido.cancelado', { pedido_id });
  }

  // ==========================================
  // UI Handlers (MQTT Request/Response)
  // ==========================================

  async handleGetActivos() {
    const activos = Array.from(this.pedidosActivos.values());
    activos.sort((a, b) => new Date(a.recibido_at) - new Date(b.recibido_at));

    let itemsPendientes = 0;
    let itemsPreparando = 0;
    for (const p of activos) {
      for (const i of p.items) {
        if (i.estado === 'pendiente') itemsPendientes++;
        else if (i.estado === 'preparando') itemsPreparando++;
      }
    }

    return {
      status: 200,
      data: { pedidos: activos, total: activos.length, items_pendientes: itemsPendientes, items_preparando: itemsPreparando }
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

  /**
   * Tap toggle para items:
   *   pendiente → preparando (cocinero empieza a preparar)
   *   preparando → listo (cocinero termina de preparar)
   * Si todos los items quedan listo → auto-completa el pedido.
   */
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

    if (itemEncontrado.estado === 'listo') {
      return { status: 400, error: 'Item ya está listo' };
    }

    const now = new Date().toISOString();

    if (itemEncontrado.estado === 'pendiente') {
      // Primer tap: empezar a preparar
      itemEncontrado.estado = 'preparando';
      itemEncontrado.preparando_at = now;

      this.broadcastSSE({
        type: 'item_preparando',
        data: { pedido_id: pedidoEncontrado.pedido_id, item_id }
      });

      this.logger.info('cocina.item.preparando', {
        pedido_id: pedidoEncontrado.pedido_id, item_id
      });

      return {
        status: 200,
        data: { item: itemEncontrado, pedido_completo: false }
      };
    }

    // Segundo tap (preparando → listo): terminar
    itemEncontrado.estado = 'listo';
    itemEncontrado.preparado_at = now;

    this.metrics?.increment?.('cocina.item_preparado.total');

    await this.publishItemPreparado(pedidoEncontrado, itemEncontrado);

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

  /**
   * Marca el pedido entero como listo de golpe (atajo rápido).
   * Todos los items pendientes/preparando pasan a listo.
   */
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
        this.metrics?.increment?.('cocina.item_preparado.total');
      }
    });

    await this.marcarPedidoListo(pedido);

    return { status: 200, data: pedido };
  }

  /**
   * Registra un cliente SSE y devuelve estado inicial.
   * El cliente se pasa en data.client (inyectado por el core/ui SSE handler).
   * Si no hay client (ej. MQTT request), solo devuelve estado.
   */
  async handleSSEStream(data) {
    const { client } = data || {};

    if (client) {
      this.sseClients.add(client);

      // Auto-cleanup cuando el cliente se desconecta
      const onClose = () => {
        this.sseClients.delete(client);
        this.logger.info('cocina.sse.client_disconnected', {
          clientes_sse: this.sseClients.size
        });
      };

      if (client.on) client.on('close', onClose);
      else if (client.onclose) client.onclose = onClose;

      this.logger.info('cocina.sse.client_connected', {
        clientes_sse: this.sseClients.size
      });
    }

    const activos = Array.from(this.pedidosActivos.values());
    activos.sort((a, b) => new Date(a.recibido_at) - new Date(b.recibido_at));

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
    const itemsPendientes = Array.from(this.pedidosActivos.values())
      .reduce((sum, p) => sum + p.items.filter(i => i.estado === 'pendiente').length, 0);
    const itemsPreparando = Array.from(this.pedidosActivos.values())
      .reduce((sum, p) => sum + p.items.filter(i => i.estado === 'preparando').length, 0);

    const tiempoPromedio = this.tiemposPreparacion.length > 0
      ? this.tiemposPreparacion.reduce((a, b) => a + b, 0) / this.tiemposPreparacion.length
      : 0;

    return {
      status: 200,
      data: {
        pedidos_activos: this.pedidosActivos.size,
        items_pendientes: itemsPendientes,
        items_preparando: itemsPreparando,
        historial_count: this.historial.length,
        tiempo_promedio_preparacion: Math.round(tiempoPromedio),
        clientes_sse: this.sseClients.size,
        timestamp: new Date().toISOString()
      }
    };
  }

  // ==========================================
  // Restauración desde persistencia
  // ==========================================

  /**
   * Reconstruye pedidos activos de cocina desde cuentas_activas.json.
   * Los pedidos que tenían estado en_preparacion/con_pedido se restauran
   * como pendientes en cocina.
   */
  async restaurarDesdeArchivo() {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const archivo = path.join('./data/current', 'cuentas_activas.json');
      const contenido = await fs.readFile(archivo, 'utf8');
      const datos = JSON.parse(contenido);

      if (!datos.cuentas) return;

      let restaurados = 0;
      for (const [cuenta_id, cuenta] of Object.entries(datos.cuentas)) {
        if (!cuenta.pedidos || cuenta.pedidos.length === 0) continue;

        for (const pedidoData of cuenta.pedidos) {
          const pedido_id = pedidoData.pedido_id;
          if (!pedido_id || this.pedidosActivos.has(pedido_id)) continue;

          const items = (pedidoData.items || []).map((item, idx) => {
            const cocinaItem = {
              item_id: item.item_id || item.id || `${pedido_id}_item_${idx + 1}`,
              producto_id: item.producto_id,
              nombre: item.nombre,
              cantidad: item.cantidad || 1,
              variaciones: item.variaciones || null,
              notas: item.notas || '',
              estado: 'pendiente'
            };
            if (item.tipo) cocinaItem.tipo = item.tipo;
            if (item.pizza_izquierda) cocinaItem.pizza_izquierda = item.pizza_izquierda;
            if (item.pizza_derecha) cocinaItem.pizza_derecha = item.pizza_derecha;
            if (item.ingredientes) cocinaItem.ingredientes = item.ingredientes;
            if (item.ingredientes_base) cocinaItem.ingredientes_base = item.ingredientes_base;
            return cocinaItem;
          });

          if (items.length === 0) continue;

          // Detectar canal por prefijo del cuenta_id
          let canal = null;
          if (cuenta_id.startsWith('mesa_')) canal = 'mesa';
          else if (cuenta_id.startsWith('tel_')) canal = 'telefono';
          else if (cuenta_id.startsWith('llevar_')) canal = 'llevar';
          else if (cuenta_id.startsWith('glovo_')) canal = 'glovo';

          const pedidoCocina = {
            pedido_id,
            cuenta_id,
            canal,
            items,
            estado: 'activo',
            notas_generales: '',
            recibido_at: cuenta.created_at || new Date().toISOString(),
            metadata: null
          };

          this.pedidosActivos.set(pedido_id, pedidoCocina);
          restaurados++;
        }
      }

      if (restaurados > 0) {
        this.metrics?.gauge?.('cocina.pedidos_activos.count', this.pedidosActivos.size);
        this.logger.info('cocina.estado_restaurado', {
          pedidos_restaurados: restaurados
        });
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.logger.warn('cocina.restaurar.error', { error: error.message });
      }
    }
  }

  // ==========================================
  // Lógica interna
  // ==========================================

  async marcarPedidoListo(pedido) {
    pedido.estado = 'listo';
    pedido.listo_at = new Date().toISOString();

    // Tiempo de preparación (segundos)
    const tiempoPreparacion = (new Date(pedido.listo_at) - new Date(pedido.recibido_at)) / 1000;
    pedido.tiempo_preparacion = tiempoPreparacion;

    // Rolling average (últimos 100)
    this.tiemposPreparacion.push(tiempoPreparacion);
    if (this.tiemposPreparacion.length > 100) {
      this.tiemposPreparacion.shift();
    }

    // Métricas via core
    this.metrics?.increment?.('cocina.pedido_listo.total');
    this.metrics?.timing?.('cocina.preparacion_pedido.duration', tiempoPreparacion * 1000);
    this.metrics?.gauge?.('cocina.pedidos_activos.count', this.pedidosActivos.size - 1);

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
        canal: pedido.canal || null,
        tiempo_preparacion: tiempoPreparacion
      }
    });

    this.logger.info('cocina.pedido.listo', {
      pedido_id: pedido.pedido_id,
      canal: pedido.canal || null,
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

  async publishItemPreparado(pedidoCocina, item) {
    await this.eventBus.publish('cocina.item_preparado', {
      pedido_id: pedidoCocina.pedido_id,
      cuenta_id: pedidoCocina.cuenta_id,
      canal: pedidoCocina.canal || null,
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
      cuenta_id: pedido.cuenta_id,
      canal: pedido.canal || null,
      items_count: pedido.items.length,
      tiempo_preparacion: pedido.tiempo_preparacion,
      listo_at: pedido.listo_at
    });
  }
}

module.exports = CocinaModule;

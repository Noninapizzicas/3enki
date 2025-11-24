const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const cocinaSchema = require('./schemas/cocina.json');
const eventsSchema = require('./schemas/events.json');

class CocinaModule {
  constructor() {
    this.name = 'cocina';
    this.version = '1.0.0';

    // Dependencias (inicializadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

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

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('[cocina] Inicializando módulo cocina v1.0');

    // Suscribirse a eventos
    await this.eventBus.subscribe('pedido.enviado_cocina', this.onPedidoEnviadoCocina.bind(this));
    await this.eventBus.subscribe('pedido.item_agregado', this.onItemAgregado.bind(this));
    await this.eventBus.subscribe('pedido.cancelado', this.onPedidoCancelado.bind(this));

    this.logger.info('[cocina] Módulo cocina iniciado - Display en tiempo real');
    return true;
  }

  async onUnload() {
    this.logger.info('modulo.unloading', { module: this.name });
  }

  // ================== Event Handlers ==================

  async onPedidoEnviadoCocina(event) {
    const correlationId = event.correlation_id || 'missing-cid';
    const { pedido_id, items, numero_mesa, cuenta_id, notas_generales } = event.payload;

    this.logger.info('[cocina] Pedido recibido en cocina', {
      correlation_id: correlationId,
      pedido_id: pedido_id,
      numero_mesa: numero_mesa,
      items_count: items.length
    });

    // Crear pedido de cocina
    const pedidoCocina = {
      pedido_id: pedido_id,
      numero_mesa: numero_mesa,
      cuenta_id: cuenta_id,
      items: items.map(item => ({
        item_id: item.item_id,
        producto_id: item.producto_id,
        nombre: item.nombre,
        cantidad: item.cantidad,
        variaciones: item.variaciones || {},
        notas: item.notas || '',
        estado: 'pendiente'
      })),
      estado: 'activo',
      notas_generales: notas_generales || '',
      recibido_at: new Date().toISOString()
    };

    this.pedidosActivos.set(pedido_id, pedidoCocina);
    this.internalMetrics.pedidos_recibidos++;

    // Notificar a clientes SSE
    this.broadcastSSE({
      type: 'nuevo_pedido',
      data: pedidoCocina
    });

    this.logger.info('[cocina] Pedido añadido a cola activa', {
      correlation_id: correlationId,
      pedido_id: pedido_id,
      items_pendientes: items.length
    });
  }

  async onItemAgregado(event) {
    const correlationId = event.correlation_id || 'missing-cid';
    const { pedido_id, item } = event.payload;

    const pedidoCocina = this.pedidosActivos.get(pedido_id);
    if (!pedidoCocina) {
      this.logger.warn('[cocina] Item agregado a pedido no activo en cocina', {
        correlation_id: correlationId,
        pedido_id: pedido_id
      });
      return;
    }

    // Agregar item al pedido
    pedidoCocina.items.push({
      item_id: item.item_id,
      producto_id: item.producto_id,
      nombre: item.nombre,
      cantidad: item.cantidad,
      variaciones: item.variaciones || {},
      notas: item.notas || '',
      estado: 'pendiente'
    });

    // Notificar a clientes SSE
    this.broadcastSSE({
      type: 'item_agregado',
      data: { pedido_id, item }
    });

    this.logger.info('[cocina] Item agregado a pedido activo', {
      correlation_id: correlationId,
      pedido_id: pedido_id,
      item_id: item.item_id
    });
  }

  async onPedidoCancelado(event) {
    const correlationId = event.correlation_id || 'missing-cid';
    const { pedido_id } = event.payload;

    const pedidoCocina = this.pedidosActivos.get(pedido_id);
    if (!pedidoCocina) {
      return;
    }

    // Remover de activos
    this.pedidosActivos.delete(pedido_id);
    this.internalMetrics.pedidos_cancelados++;

    // Notificar a clientes SSE
    this.broadcastSSE({
      type: 'pedido_cancelado',
      data: { pedido_id }
    });

    this.logger.info('[cocina] Pedido cancelado y removido', {
      correlation_id: correlationId,
      pedido_id: pedido_id
    });
  }

  // ================== HTTP Handlers ==================

  async handleGetActivos(req, context) {
    const correlationId = context.correlationId;

    const activos = Array.from(this.pedidosActivos.values());

    // Ordenar por tiempo de espera (más antiguos primero)
    activos.sort((a, b) => new Date(a.recibido_at) - new Date(b.recibido_at));

    // Calcular estadísticas
    const itemsPendientes = activos.reduce((sum, p) => {
      return sum + p.items.filter(i => i.estado === 'pendiente').length;
    }, 0);

    this.logger.info('[cocina] GET /cocina/activos', {
      correlation_id: correlationId,
      pedidos_activos: activos.length,
      items_pendientes: itemsPendientes
    });

    return {
      status: 200,
      body: {
        pedidos: activos,
        total: activos.length,
        items_pendientes: itemsPendientes
      }
    };
  }

  async handleGetHistorial(req, context) {
    const correlationId = context.correlationId;
    const { limit = 20 } = context.query || {};

    const historial = this.historial.slice(0, parseInt(limit));

    return {
      status: 200,
      body: {
        pedidos: historial,
        total: historial.length
      }
    };
  }

  async handleGetPedido(req, context) {
    const correlationId = context.correlationId;
    const pedido_id = context.params.pedido_id;

    const pedido = this.pedidosActivos.get(pedido_id);
    if (!pedido) {
      return {
        status: 404,
        body: { error: 'Pedido no encontrado en cocina' }
      };
    }

    return {
      status: 200,
      body: pedido
    };
  }

  async handlePrepararItem(req, context) {
    const correlationId = context.correlationId;
    const item_id = context.params.item_id;

    this.logger.info('[cocina] POST /cocina/items/:item_id/preparar', {
      correlation_id: correlationId,
      item_id: item_id
    });

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
      return {
        status: 404,
        body: { error: 'Item no encontrado en cocina' }
      };
    }

    // Marcar como listo
    itemEncontrado.estado = 'listo';
    itemEncontrado.preparado_at = new Date().toISOString();
    this.internalMetrics.items_preparados++;

    // Publicar evento
    await this.publishItemPreparado(pedidoEncontrado.pedido_id, itemEncontrado, correlationId);

    // Notificar SSE
    this.broadcastSSE({
      type: 'item_preparado',
      data: {
        pedido_id: pedidoEncontrado.pedido_id,
        item_id: item_id
      }
    });

    // Verificar si todos los items están listos
    const todosListos = pedidoEncontrado.items.every(i => i.estado === 'listo');
    if (todosListos) {
      await this.marcarPedidoListo(pedidoEncontrado, correlationId);
    }

    this.logger.info('[cocina] Item marcado como preparado', {
      correlation_id: correlationId,
      pedido_id: pedidoEncontrado.pedido_id,
      item_id: item_id
    });

    return {
      status: 200,
      body: {
        item: itemEncontrado,
        pedido_completo: todosListos
      }
    };
  }

  async handleMarcarListo(req, context) {
    const correlationId = context.correlationId;
    const pedido_id = context.params.pedido_id;

    this.logger.info('[cocina] POST /cocina/pedidos/:pedido_id/listo', {
      correlation_id: correlationId,
      pedido_id: pedido_id
    });

    const pedido = this.pedidosActivos.get(pedido_id);
    if (!pedido) {
      return {
        status: 404,
        body: { error: 'Pedido no encontrado en cocina' }
      };
    }

    // Marcar todos los items como listos
    const now = new Date().toISOString();
    pedido.items.forEach(item => {
      if (item.estado !== 'listo') {
        item.estado = 'listo';
        item.preparado_at = now;
        this.internalMetrics.items_preparados++;
      }
    });

    await this.marcarPedidoListo(pedido, correlationId);

    return {
      status: 200,
      body: pedido
    };
  }

  async handleSSEStream(req, context) {
    const correlationId = context.correlationId;

    this.logger.info('[cocina] Cliente SSE conectado', {
      correlation_id: correlationId
    });

    // Configurar headers SSE
    const headers = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    };

    // Crear cliente SSE
    const client = {
      id: `client_${Date.now()}`,
      send: (data) => {
        // Esta función será implementada por el core del servidor
        return `data: ${JSON.stringify(data)}\n\n`;
      }
    };

    this.sseClients.add(client);

    // Enviar estado inicial
    const activos = Array.from(this.pedidosActivos.values());
    client.send({
      type: 'connected',
      data: {
        pedidos_activos: activos
      }
    });

    // Cleanup al desconectar
    req.on('close', () => {
      this.sseClients.delete(client);
      this.logger.info('[cocina] Cliente SSE desconectado', {
        correlation_id: correlationId,
        client_id: client.id
      });
    });

    return {
      status: 200,
      headers: headers,
      body: client // El core manejará el streaming
    };
  }

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      body: {
        status: 'healthy',
        module: 'cocina',
        version: '1.0.0',
        pedidos_activos: this.pedidosActivos.size,
        clientes_sse: this.sseClients.size
      }
    };
  }

  async handleGetMetrics(req, context) {
    return {
      status: 200,
      body: {
        ...this.internalMetrics,
        pedidos_activos: this.pedidosActivos.size,
        clientes_sse: this.sseClients.size
      }
    };
  }

  // ================== Utilidades ==================

  async marcarPedidoListo(pedido, correlationId) {
    pedido.estado = 'listo';
    pedido.listo_at = new Date().toISOString();

    // Calcular tiempo de preparación
    const tiempoPreparacion = (new Date(pedido.listo_at) - new Date(pedido.recibido_at)) / 1000;
    pedido.tiempo_preparacion = tiempoPreparacion;

    // Actualizar métricas
    this.tiemposPreparacion.push(tiempoPreparacion);
    if (this.tiemposPreparacion.length > 100) {
      this.tiemposPreparacion.shift();
    }
    this.internalMetrics.tiempo_promedio_preparacion =
      this.tiemposPreparacion.reduce((a, b) => a + b, 0) / this.tiemposPreparacion.length;

    this.internalMetrics.pedidos_listos++;

    // Mover a historial
    this.historial.unshift(pedido);
    if (this.historial.length > this.maxHistorial) {
      this.historial.pop();
    }

    // Remover de activos
    this.pedidosActivos.delete(pedido.pedido_id);

    // Publicar evento
    await this.publishPedidoListo(pedido, correlationId);

    // Notificar SSE
    this.broadcastSSE({
      type: 'pedido_listo',
      data: {
        pedido_id: pedido.pedido_id,
        numero_mesa: pedido.numero_mesa,
        tiempo_preparacion: tiempoPreparacion
      }
    });

    this.logger.info('[cocina] Pedido marcado como listo', {
      correlation_id: correlationId,
      pedido_id: pedido.pedido_id,
      tiempo_preparacion: tiempoPreparacion
    });
  }

  broadcastSSE(message) {
    const payload = JSON.stringify(message);
    for (const client of this.sseClients) {
      try {
        client.send(message);
      } catch (error) {
        this.logger.warn('[cocina] Error enviando SSE a cliente', {
          client_id: client.id,
          error: error.message
        });
        this.sseClients.delete(client);
      }
    }
  }

  // ================== Event Publishers ==================

  async publishItemPreparado(pedido_id, item, correlationId) {
    await this.eventBus.publish('cocina.item_preparado', {
      pedido_id: pedido_id,
      item_id: item.item_id,
      producto_id: item.producto_id,
      nombre: item.nombre,
      cantidad: item.cantidad,
      preparado_at: item.preparado_at
    }, { correlationId });
  }

  async publishPedidoListo(pedido, correlationId) {
    await this.eventBus.publish('cocina.pedido_listo', {
      pedido_id: pedido.pedido_id,
      numero_mesa: pedido.numero_mesa,
      items_count: pedido.items.length,
      tiempo_preparacion: pedido.tiempo_preparacion,
      listo_at: pedido.listo_at
    }, { correlationId });
  }
}

module.exports = CocinaModule;

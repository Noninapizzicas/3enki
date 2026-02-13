/**
 * Modulo Comandero v1.0
 * Gestion de pedidos - Añadir productos a cuentas
 */

class ComanderoModule {
  constructor() {
    this.name = 'comandero';
    this.version = '1.0.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    // Estado en memoria
    this.pedidos = new Map(); // cuenta_id -> { items: [], notas: '', total: 0 }
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('modulo.loading', { module: this.name });

    // Suscribirse a eventos
    await this.eventBus.subscribe('cuenta.actualizada', this.onCuentaActualizada.bind(this));
    await this.eventBus.subscribe('caja.cerrada', this.onCajaCerrada.bind(this));
    await this.eventBus.subscribe('dia.iniciado', this.onDiaIniciado.bind(this));

    this.logger.info('modulo.loaded', { module: this.name });
  }

  async onUnload() {
    this.logger.info('modulo.unloading', { module: this.name });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onCuentaActualizada(event) {
    const { cuenta_id } = event.payload;
    this.logger.debug('cuenta.actualizada.received', {
      cuenta_id,
      correlation_id: event.correlation_id
    });
  }

  async onCajaCerrada(event) {
    // Limpiar todos los pedidos al cerrar caja
    this.pedidos.clear();
    this.logger.info('comandero.reset.caja_cerrada', {
      correlation_id: event.correlation_id
    });
  }

  async onDiaIniciado(event) {
    // Limpiar todos los pedidos al iniciar dia
    this.pedidos.clear();
    this.logger.info('comandero.reset.dia_iniciado', {
      correlation_id: event.correlation_id
    });
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleGetPedido(req, context) {
    const cuenta_id = context.params.cuenta_id;

    let pedido = this.pedidos.get(cuenta_id);
    if (!pedido) {
      pedido = { items: [], notas: '', total: 0 };
      this.pedidos.set(cuenta_id, pedido);
    }

    return {
      status: 200,
      data: {
        cuenta_id,
        ...pedido
      }
    };
  }

  async handleAddItem(req, context) {
    const cuenta_id = context.params.cuenta_id;
    const { producto_id, nombre, precio, cantidad, variaciones, notas } = context.body;

    this.logger.info('pedido.add_item.start', {
      cuenta_id,
      producto_id,
      correlation_id: context.correlationId
    });

    // Obtener o crear pedido
    let pedido = this.pedidos.get(cuenta_id);
    if (!pedido) {
      pedido = { items: [], notas: '', total: 0 };
      this.pedidos.set(cuenta_id, pedido);
    }

    // Crear item
    const item_id = `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const item = {
      id: item_id,
      producto_id,
      nombre,
      precio: precio || 0,
      cantidad: cantidad || 1,
      variaciones: variaciones || [],
      notas: notas || '',
      subtotal: (precio || 0) * (cantidad || 1),
      created_at: new Date().toISOString()
    };

    pedido.items.push(item);
    pedido.total = this.calcularTotal(pedido.items);

    // Metricas
    this.metrics.increment('pedido.item_agregado.total');

    // Publicar evento
    await this.eventBus.publish('pedido.item_agregado', {
      cuenta_id,
      item_id,
      producto_id,
      nombre,
      precio: item.precio,
      cantidad: item.cantidad
    }, {
      correlationId: context.correlationId
    });

    this.logger.info('pedido.item_agregado', {
      cuenta_id,
      item_id,
      producto_id,
      correlation_id: context.correlationId
    });

    return {
      status: 201,
      data: {
        item,
        pedido: {
          cuenta_id,
          items: pedido.items,
          total: pedido.total
        }
      }
    };
  }

  async handleRemoveItem(req, context) {
    const cuenta_id = context.params.cuenta_id;
    const item_id = context.params.item_id;

    this.logger.info('pedido.remove_item.start', {
      cuenta_id,
      item_id,
      correlation_id: context.correlationId
    });

    const pedido = this.pedidos.get(cuenta_id);
    if (!pedido) {
      return {
        status: 404,
        data: { error: 'Pedido no encontrado' }
      };
    }

    const itemIndex = pedido.items.findIndex(i => i.id === item_id);
    if (itemIndex === -1) {
      return {
        status: 404,
        data: { error: 'Item no encontrado en pedido' }
      };
    }

    const removedItem = pedido.items.splice(itemIndex, 1)[0];
    pedido.total = this.calcularTotal(pedido.items);

    // Metricas
    this.metrics.increment('pedido.item_eliminado.total');

    // Publicar evento
    await this.eventBus.publish('pedido.item_eliminado', {
      cuenta_id,
      item_id,
      producto_id: removedItem.producto_id
    }, {
      correlationId: context.correlationId
    });

    this.logger.info('pedido.item_eliminado', {
      cuenta_id,
      item_id,
      correlation_id: context.correlationId
    });

    return {
      status: 200,
      data: {
        message: 'Item eliminado',
        pedido: {
          cuenta_id,
          items: pedido.items,
          total: pedido.total
        }
      }
    };
  }

  async handleEnviarCocina(req, context) {
    const cuenta_id = context.params.cuenta_id;

    this.logger.info('pedido.enviar_cocina.start', {
      cuenta_id,
      correlation_id: context.correlationId
    });

    const pedido = this.pedidos.get(cuenta_id);
    if (!pedido || pedido.items.length === 0) {
      return {
        status: 400,
        data: { error: 'No hay items en el pedido para enviar' }
      };
    }

    // Metricas
    this.metrics.increment('pedido.enviado.total');

    // Publicar evento
    await this.eventBus.publish('pedido.enviado_cocina', {
      cuenta_id,
      items: pedido.items,
      total: pedido.total,
      notas: pedido.notas,
      enviado_at: new Date().toISOString()
    }, {
      correlationId: context.correlationId
    });

    this.logger.info('pedido.enviado_cocina', {
      cuenta_id,
      items_count: pedido.items.length,
      total: pedido.total,
      correlation_id: context.correlationId
    });

    return {
      status: 200,
      data: {
        message: 'Pedido enviado a cocina',
        cuenta_id,
        items_count: pedido.items.length,
        total: pedido.total
      }
    };
  }

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        pedidos_activos: this.pedidos.size,
        timestamp: new Date().toISOString()
      }
    };
  }

  // ==========================================
  // Utilidades
  // ==========================================

  calcularTotal(items) {
    return items.reduce((total, item) => total + item.subtotal, 0);
  }
}

module.exports = ComanderoModule;

/**
 * Módulo Pedidos v1.0
 * Gestión completa de pedidos - Reemplazo de comandero 100% event-driven
 */

class PedidosModule {
  constructor() {
    this.name = 'pedidos';
    this.version = '1.0.0';

    // Estado
    this.pedidos = new Map(); // pedido_id -> pedido
    this.pedidosPorCuenta = new Map(); // cuenta_id -> Set(pedido_ids)
    this.itemsPendientesValidacion = new Map(); // item_id -> {pedido_id, item_data}

    // Dependencias (inyectadas)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('modulo.loading', { module: this.name });

    await this.subscribeToEvents();

    this.logger.info('modulo.loaded', { module: this.name });
  }

  async onUnload() {
    this.logger.info('modulo.unloading', { module: this.name });
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe('variacion.validada', this.onVariacionValidada.bind(this));
    await this.eventBus.subscribe('variacion.rechazada', this.onVariacionRechazada.bind(this));
    await this.eventBus.subscribe('cuenta.creada', this.onCuentaCreada.bind(this));
  }

  async onVariacionValidada(event) {
    const { producto_id, precio_total, ingredientes_finales } = event.payload;

    // Buscar item pendiente de validación
    // En una implementación real, usaríamos un request_id para correlacionar
    this.logger.info('variacion.validada.received', {
      producto_id,
      precio_total,
      correlation_id: event.correlation_id
    });
  }

  async onVariacionRechazada(event) {
    const { producto_id, motivo } = event.payload;

    this.logger.warn('variacion.rechazada.received', {
      producto_id,
      motivo,
      correlation_id: event.correlation_id
    });
  }

  async onCuentaCreada(event) {
    const { cuenta_id } = event.payload;

    this.logger.info('cuenta.creada.received', {
      cuenta_id,
      correlation_id: event.correlation_id
    });

    // Inicializar set de pedidos para esta cuenta
    if (!this.pedidosPorCuenta.has(cuenta_id)) {
      this.pedidosPorCuenta.set(cuenta_id, new Set());
    }
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleCreatePedido(req) {
    const start_time = Date.now();

    this.logger.info('pedido.create.start', {
      correlation_id: req.correlationId || req.request_id
    });

    try {
      const { cuenta_id, numero_mesa, notas_generales } = req.body;

      const pedido_id = `pedido_${Date.now()}`;

      const pedido = {
        id: pedido_id,
        cuenta_id,
        numero_mesa,
        items: [],
        estado: 'borrador',
        subtotal: 0,
        total: 0,
        notas_generales,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      this.pedidos.set(pedido_id, pedido);

      // Registrar en índice por cuenta
      if (!this.pedidosPorCuenta.has(cuenta_id)) {
        this.pedidosPorCuenta.set(cuenta_id, new Set());
      }
      this.pedidosPorCuenta.get(cuenta_id).add(pedido_id);

      // Métricas
      this.metrics.increment('pedido.creado.total');
      this.metrics.gauge('pedido.activos.count', this.pedidos.size);
      this.metrics.timing('pedido.create.duration', Date.now() - start_time);

      // Publicar evento
      await this.publishPedidoCreado(pedido, req.correlationId || req.request_id);

      this.logger.info('pedido.creado', {
        pedido_id,
        cuenta_id,
        correlation_id: req.correlationId || req.request_id,
        duration: Date.now() - start_time
      });

      return {
        status: 201,
        data: pedido
      };

    } catch (error) {
      this.metrics.increment('pedido.errors.total', 1, { operation: 'create' });

      this.logger.error('pedido.create.error', {
        error: error.message,
        stack: error.stack,
        correlation_id: req.correlationId || req.request_id
      });

      return {
        status: 500,
        data: { error: error.message }
      };
    }
  }

  async handleListPedidos(req) {
    const { cuenta_id, estado } = req.query || {};

    let pedidos = Array.from(this.pedidos.values());

    // Filtros
    if (cuenta_id) {
      pedidos = pedidos.filter(p => p.cuenta_id === cuenta_id);
    }

    if (estado) {
      pedidos = pedidos.filter(p => p.estado === estado);
    }

    // Ordenar por fecha de creación (más recientes primero)
    pedidos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return {
      status: 200,
      data: {
        pedidos,
        total: pedidos.length
      }
    };
  }

  async handleGetPedido(req) {
    const { id } = req.params;
    const pedido = this.pedidos.get(id);

    if (!pedido) {
      return {
        status: 404,
        data: { error: 'Pedido no encontrado' }
      };
    }

    return {
      status: 200,
      data: pedido
    };
  }

  async handleAgregarItem(req) {
    const start_time = Date.now();
    const { id } = req.params;
    const { producto_id, cantidad, variaciones, notas } = req.body;

    const pedido = this.pedidos.get(id);
    if (!pedido) {
      return {
        status: 404,
        data: { error: 'Pedido no encontrado' }
      };
    }

    if (pedido.estado !== 'borrador' && pedido.estado !== 'confirmado') {
      return {
        status: 400,
        data: { error: `No se pueden agregar items a un pedido en estado ${pedido.estado}` }
      };
    }

    try {
      const item_id = `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Precio base del producto (en una implementación real, consultaríamos el módulo productos)
      // Por ahora, usamos un precio de ejemplo
      const precio_unitario = 10.00; // TODO: Obtener de productos module
      const nombre_producto = 'Producto Example'; // TODO: Obtener de productos module

      const item = {
        item_id,
        producto_id,
        nombre: nombre_producto,
        cantidad,
        precio_unitario,
        precio_total: precio_unitario * cantidad,
        variaciones: variaciones || null,
        notas,
        estado: 'pendiente',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Si tiene variaciones, validar con módulo variaciones
      if (variaciones && (variaciones.ingredientes_quitar || variaciones.ingredientes_anadir)) {
        // En implementación real, publicaríamos evento para validar variaciones
        // y esperaríamos respuesta antes de confirmar el item
        // Por ahora, aceptamos directamente
      }

      pedido.items.push(item);
      pedido.subtotal = this.calcularSubtotal(pedido);
      pedido.total = pedido.subtotal;
      pedido.updated_at = new Date().toISOString();

      this.pedidos.set(id, pedido);

      // Métricas
      this.metrics.increment('pedido.item_agregado.total');
      this.metrics.gauge('pedido.items_total.count',
        Array.from(this.pedidos.values()).reduce((sum, p) => sum + p.items.length, 0)
      );

      // Publicar evento
      await this.publishItemAgregado(pedido, item, req.correlationId || req.request_id);

      this.logger.info('pedido.item_agregado', {
        pedido_id: id,
        item_id,
        producto_id,
        cantidad,
        correlation_id: req.correlationId || req.request_id
      });

      return {
        status: 201,
        data: {
          pedido_id: id,
          item,
          total: pedido.total
        }
      };

    } catch (error) {
      this.metrics.increment('pedido.errors.total', 1, { operation: 'agregar_item' });

      this.logger.error('pedido.agregar_item.error', {
        error: error.message,
        correlation_id: req.correlationId || req.request_id
      });

      return {
        status: 500,
        data: { error: error.message }
      };
    }
  }

  async handleActualizarItem(req) {
    const { id, item_id } = req.params;
    const updates = req.body;

    const pedido = this.pedidos.get(id);
    if (!pedido) {
      return {
        status: 404,
        data: { error: 'Pedido no encontrado' }
      };
    }

    const itemIndex = pedido.items.findIndex(i => i.item_id === item_id);
    if (itemIndex === -1) {
      return {
        status: 404,
        data: { error: 'Item no encontrado' }
      };
    }

    const item = pedido.items[itemIndex];
    const cambios = {};

    // Actualizar cantidad
    if (updates.cantidad !== undefined && updates.cantidad !== item.cantidad) {
      cambios.cantidad = { anterior: item.cantidad, nuevo: updates.cantidad };
      item.cantidad = updates.cantidad;
      item.precio_total = item.precio_unitario * item.cantidad;
    }

    // Actualizar variaciones
    if (updates.variaciones !== undefined) {
      cambios.variaciones = { anterior: item.variaciones, nuevo: updates.variaciones };
      item.variaciones = updates.variaciones;
    }

    // Actualizar notas
    if (updates.notas !== undefined) {
      cambios.notas = { anterior: item.notas, nuevo: updates.notas };
      item.notas = updates.notas;
    }

    item.updated_at = new Date().toISOString();
    pedido.items[itemIndex] = item;

    // Recalcular totales
    pedido.subtotal = this.calcularSubtotal(pedido);
    pedido.total = pedido.subtotal;
    pedido.updated_at = new Date().toISOString();

    this.pedidos.set(id, pedido);

    // Publicar evento
    await this.publishItemActualizado(id, item_id, cambios, req.correlationId || req.request_id);

    this.logger.info('pedido.item_actualizado', {
      pedido_id: id,
      item_id,
      cambios,
      correlation_id: req.correlationId || req.request_id
    });

    return {
      status: 200,
      data: {
        pedido_id: id,
        item,
        total: pedido.total
      }
    };
  }

  async handleEliminarItem(req) {
    const { id, item_id } = req.params;

    const pedido = this.pedidos.get(id);
    if (!pedido) {
      return {
        status: 404,
        data: { error: 'Pedido no encontrado' }
      };
    }

    const itemIndex = pedido.items.findIndex(i => i.item_id === item_id);
    if (itemIndex === -1) {
      return {
        status: 404,
        data: { error: 'Item no encontrado' }
      };
    }

    pedido.items.splice(itemIndex, 1);
    pedido.subtotal = this.calcularSubtotal(pedido);
    pedido.total = pedido.subtotal;
    pedido.updated_at = new Date().toISOString();

    this.pedidos.set(id, pedido);

    // Publicar evento
    await this.publishItemEliminado(id, item_id, req.correlationId || req.request_id);

    this.logger.info('pedido.item_eliminado', {
      pedido_id: id,
      item_id,
      correlation_id: req.correlationId || req.request_id
    });

    return {
      status: 200,
      data: {
        message: 'Item eliminado',
        pedido_id: id,
        item_id,
        total: pedido.total
      }
    };
  }

  async handleEnviarCocina(req) {
    const start_time = Date.now();
    const { id } = req.params;

    const pedido = this.pedidos.get(id);
    if (!pedido) {
      return {
        status: 404,
        data: { error: 'Pedido no encontrado' }
      };
    }

    if (pedido.items.length === 0) {
      return {
        status: 400,
        data: { error: 'No se puede enviar un pedido vacío a cocina' }
      };
    }

    if (pedido.estado === 'en_cocina') {
      return {
        status: 400,
        data: { error: 'Pedido ya está en cocina' }
      };
    }

    pedido.estado = 'en_cocina';
    pedido.enviado_cocina_at = new Date().toISOString();
    pedido.updated_at = new Date().toISOString();

    // Actualizar estado de items
    pedido.items.forEach(item => {
      if (item.estado === 'pendiente') {
        item.estado = 'en_cocina';
      }
    });

    this.pedidos.set(id, pedido);

    // Métricas
    this.metrics.increment('pedido.enviado_cocina.total');
    this.metrics.gauge('pedido.en_cocina.count',
      Array.from(this.pedidos.values()).filter(p => p.estado === 'en_cocina').length
    );
    this.metrics.timing('pedido.envio_cocina.duration', Date.now() - start_time);

    // Publicar evento
    await this.publishEnviadoCocina(pedido, req.correlationId || req.request_id);

    this.logger.info('pedido.enviado_cocina', {
      pedido_id: id,
      items_count: pedido.items.length,
      correlation_id: req.correlationId || req.request_id,
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
  }

  async handleCompletarPedido(req) {
    const { id } = req.params;

    const pedido = this.pedidos.get(id);
    if (!pedido) {
      return {
        status: 404,
        data: { error: 'Pedido no encontrado' }
      };
    }

    pedido.estado = 'completado';
    pedido.completado_at = new Date().toISOString();
    pedido.updated_at = new Date().toISOString();

    // Calcular duración
    const duracion = Math.floor((new Date(pedido.completado_at) - new Date(pedido.created_at)) / 1000 / 60);

    this.pedidos.set(id, pedido);

    // Métricas
    this.metrics.increment('pedido.completado.total');

    // Publicar evento
    await this.publishPedidoCompletado(pedido, duracion, req.correlationId || req.request_id);

    this.logger.info('pedido.completado', {
      pedido_id: id,
      duracion_minutos: duracion,
      correlation_id: req.correlationId || req.request_id
    });

    return {
      status: 200,
      data: {
        pedido_id: id,
        estado: pedido.estado,
        completado_at: pedido.completado_at,
        duracion_minutos: duracion
      }
    };
  }

  async handleCancelarPedido(req) {
    const { id } = req.params;
    const { motivo } = req.body || {};

    const pedido = this.pedidos.get(id);
    if (!pedido) {
      return {
        status: 404,
        data: { error: 'Pedido no encontrado' }
      };
    }

    pedido.estado = 'cancelado';
    pedido.cancelado_at = new Date().toISOString();
    pedido.updated_at = new Date().toISOString();

    this.pedidos.set(id, pedido);

    // Métricas
    this.metrics.increment('pedido.cancelado.total');

    // Publicar evento
    await this.publishPedidoCancelado(pedido, motivo, req.correlationId || req.request_id);

    this.logger.info('pedido.cancelado', {
      pedido_id: id,
      motivo,
      correlation_id: req.correlationId || req.request_id
    });

    return {
      status: 200,
      data: {
        pedido_id: id,
        estado: pedido.estado,
        motivo,
        cancelado_at: pedido.cancelado_at
      }
    };
  }

  async handleCalcularTotal(req) {
    const { id } = req.params;

    const pedido = this.pedidos.get(id);
    if (!pedido) {
      return {
        status: 404,
        data: { error: 'Pedido no encontrado' }
      };
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
  }

  async handleHealthCheck(req) {
    return {
      status: 200,
      data: {
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: this.version,
        pedidos: {
          total: this.pedidos.size,
          borrador: Array.from(this.pedidos.values()).filter(p => p.estado === 'borrador').length,
          en_cocina: Array.from(this.pedidos.values()).filter(p => p.estado === 'en_cocina').length,
          completado: Array.from(this.pedidos.values()).filter(p => p.estado === 'completado').length
        }
      }
    };
  }

  async handleGetMetrics(req) {
    return {
      status: 200,
      data: {
        counters: {
          'pedido.creado.total': this.metrics.getCounter('pedido.creado.total') || 0,
          'pedido.item_agregado.total': this.metrics.getCounter('pedido.item_agregado.total') || 0,
          'pedido.enviado_cocina.total': this.metrics.getCounter('pedido.enviado_cocina.total') || 0,
          'pedido.completado.total': this.metrics.getCounter('pedido.completado.total') || 0,
          'pedido.cancelado.total': this.metrics.getCounter('pedido.cancelado.total') || 0
        },
        gauges: {
          'pedido.activos.count': this.pedidos.size,
          'pedido.en_cocina.count': Array.from(this.pedidos.values()).filter(p => p.estado === 'en_cocina').length
        }
      }
    };
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishPedidoCreado(pedido, correlation_id) {
    await this.eventBus.publish('pedido.creado', {
      pedido_id: pedido.id,
      cuenta_id: pedido.cuenta_id,
      numero_mesa: pedido.numero_mesa,
      estado: pedido.estado,
      created_at: pedido.created_at
    }, {
      correlationId: correlation_id
    });
  }

  async publishItemAgregado(pedido, item, correlation_id) {
    await this.eventBus.publish('pedido.item_agregado', {
      pedido_id: pedido.id,
      item_id: item.item_id,
      producto_id: item.producto_id,
      nombre: item.nombre,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      precio_total: item.precio_total,
      variaciones: item.variaciones,
      notas: item.notas
    }, {
      correlationId: correlation_id
    });
  }

  async publishItemActualizado(pedido_id, item_id, cambios, correlation_id) {
    await this.eventBus.publish('pedido.item_actualizado', {
      pedido_id,
      item_id,
      cambios
    }, {
      correlationId: correlation_id
    });
  }

  async publishItemEliminado(pedido_id, item_id, correlation_id) {
    await this.eventBus.publish('pedido.item_eliminado', {
      pedido_id,
      item_id,
      motivo: 'eliminado_por_usuario'
    }, {
      correlationId: correlation_id
    });
  }

  async publishEnviadoCocina(pedido, correlation_id) {
    await this.eventBus.publish('pedido.enviado_cocina', {
      pedido_id: pedido.id,
      cuenta_id: pedido.cuenta_id,
      numero_mesa: pedido.numero_mesa,
      items: pedido.items.map(item => ({
        item_id: item.item_id,
        producto_id: item.producto_id,
        nombre: item.nombre,
        cantidad: item.cantidad,
        variaciones: item.variaciones,
        notas: item.notas
      })),
      items_count: pedido.items.length,
      notas_generales: pedido.notas_generales,
      enviado_at: pedido.enviado_cocina_at
    }, {
      correlationId: correlation_id
    });
  }

  async publishPedidoCompletado(pedido, duracion_minutos, correlation_id) {
    await this.eventBus.publish('pedido.completado', {
      pedido_id: pedido.id,
      cuenta_id: pedido.cuenta_id,
      total: pedido.total,
      items_count: pedido.items.length,
      completado_at: pedido.completado_at,
      duracion_minutos
    }, {
      correlationId: correlation_id
    });
  }

  async publishPedidoCancelado(pedido, motivo, correlation_id) {
    await this.eventBus.publish('pedido.cancelado', {
      pedido_id: pedido.id,
      cuenta_id: pedido.cuenta_id,
      motivo: motivo || 'sin_especificar',
      cancelado_at: pedido.cancelado_at
    }, {
      correlationId: correlation_id
    });
  }

  // ==========================================
  // Helper Methods
  // ==========================================

  calcularSubtotal(pedido) {
    return pedido.items.reduce((sum, item) => sum + item.precio_total, 0);
  }
}

module.exports = PedidosModule;

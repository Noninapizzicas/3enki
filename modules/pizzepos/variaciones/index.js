/**
 * Módulo Variaciones v2.0
 * Gestión de variaciones de productos (quitar/añadir ingredientes)
 * Alineado con patrones event-core: uiHandler, event envelope, cleanup
 *
 * Emite: variacion.validada, variacion.rechazada
 * Consume: producto.creado, pedido.item_agregado
 */

class VariacionesModule {
  constructor() {
    this.name = 'variaciones';
    this.version = '2.0.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.uiHandler = null;

    // Estado en memoria
    this.configuraciones = new Map(); // producto_id -> variacion_config
    this.ingredientesDisponibles = new Map(); // ingrediente_id -> {precio, disponible}
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

    if (this.uiHandler) {
      const actions = ['get', 'validar', 'calcular_precio', 'health', 'metrics'];
      for (const action of actions) {
        this.uiHandler.unregister('variaciones', action);
      }
    }

    this.configuraciones.clear();
    this.ingredientesDisponibles.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // UI Handler Registration
  // ==========================================

  registerUIHandlers() {
    if (!this.uiHandler) {
      this.logger.warn('variaciones.uiHandler.not_available', { module: this.name });
      return;
    }

    this.uiHandler.register('variaciones', 'get', this.handleGetVariacionesProducto.bind(this));
    this.uiHandler.register('variaciones', 'validar', this.handleValidarVariacion.bind(this));
    this.uiHandler.register('variaciones', 'calcular_precio', this.handleCalcularPrecio.bind(this));
    this.uiHandler.register('variaciones', 'health', this.handleHealthCheck.bind(this));
    this.uiHandler.register('variaciones', 'metrics', this.handleGetMetrics.bind(this));

    this.logger.info('variaciones.ui_handlers.registered', {
      handlers: ['get', 'validar', 'calcular_precio', 'health', 'metrics']
    });
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe('producto.creado', this.onProductoCreado.bind(this));
    await this.eventBus.subscribe('pedido.item_agregado', this.onPedidoItemAgregado.bind(this));

    this.logger.info('variaciones.events.subscribed', {
      events: ['producto.creado', 'pedido.item_agregado']
    });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onProductoCreado(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { producto_id, variaciones, ingredientes_base, precio } = eventData;

    if (!variaciones) {
      return;
    }

    this.logger.info('producto.creado.received', {
      producto_id,
      correlation_id: correlationId
    });

    const config = {
      producto_id,
      precio_base: precio,
      permite_quitar: variaciones.permite_quitar || [],
      permite_anadir: variaciones.permite_anadir || false,
      extras_sugeridos: variaciones.extras_sugeridos || [],
      max_ingredientes_extra: variaciones.max_ingredientes_extra || 5,
      ingredientes_base: (ingredientes_base || []).map(i => i.id)
    };

    this.configuraciones.set(producto_id, config);

    if (config.extras_sugeridos) {
      config.extras_sugeridos.forEach(extra => {
        this.ingredientesDisponibles.set(extra.ingrediente_id, {
          precio: extra.precio_extra,
          disponible: true
        });
      });
    }

    this.metrics.gauge('variacion.productos_configurados.count', this.configuraciones.size);

    this.logger.info('variacion.configurada', {
      producto_id,
      permite_quitar: config.permite_quitar.length,
      extras_sugeridos: config.extras_sugeridos.length,
      correlation_id: correlationId
    });
  }

  async onPedidoItemAgregado(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { producto_id, variaciones } = eventData;

    if (!variaciones || (!variaciones.ingredientes_quitar && !variaciones.ingredientes_anadir)) {
      return;
    }

    this.logger.info('pedido.item_agregado.received', {
      producto_id,
      tiene_variaciones: true,
      correlation_id: correlationId
    });

    const resultado = await this.validarVariacion({
      producto_id,
      ingredientes_quitar: variaciones.ingredientes_quitar || [],
      ingredientes_anadir: variaciones.ingredientes_anadir || []
    });

    if (resultado.valida) {
      await this.publishVariacionValidada(resultado, correlationId);
    } else {
      await this.publishVariacionRechazada(producto_id, variaciones, resultado.motivo_rechazo, correlationId);
    }
  }

  // ==========================================
  // UI Handlers (MQTT Request/Response)
  // ==========================================

  async handleGetVariacionesProducto(data) {
    const { producto_id } = data;
    const config = this.configuraciones.get(producto_id);

    if (!config) {
      return { status: 404, error: 'Producto no configurado para variaciones' };
    }

    return {
      status: 200,
      data: {
        producto_id,
        permite_quitar: config.permite_quitar,
        permite_anadir: config.permite_anadir,
        extras_sugeridos: config.extras_sugeridos,
        max_ingredientes_extra: config.max_ingredientes_extra
      }
    };
  }

  async handleValidarVariacion(data) {
    const { producto_id, ingredientes_quitar, ingredientes_anadir } = data;

    if (!producto_id) {
      return { status: 400, error: 'producto_id requerido' };
    }

    const resultado = await this.validarVariacion({
      producto_id,
      ingredientes_quitar: ingredientes_quitar || [],
      ingredientes_anadir: ingredientes_anadir || []
    });

    if (resultado.valida) {
      this.metrics.increment('variacion.validada.total');
      await this.publishVariacionValidada(resultado);
    } else {
      this.metrics.increment('variacion.rechazada.total');
    }

    return {
      status: resultado.valida ? 200 : 400,
      data: resultado
    };
  }

  async handleCalcularPrecio(data) {
    const { producto_id, ingredientes_anadir } = data;

    const config = this.configuraciones.get(producto_id);
    if (!config) {
      return { status: 404, error: 'Producto no encontrado' };
    }

    const precio_base = config.precio_base;
    let precio_extras = 0;

    if (ingredientes_anadir && ingredientes_anadir.length > 0) {
      ingredientes_anadir.forEach(item => {
        const ingrediente = this.ingredientesDisponibles.get(item.ingrediente_id);
        if (ingrediente) {
          const cantidad = item.cantidad || 1;
          precio_extras += ingrediente.precio * cantidad;
        }
      });
    }

    return {
      status: 200,
      data: {
        producto_id,
        precio_base,
        precio_extras,
        precio_total: precio_base + precio_extras
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
        catalogo: {
          productos_configurados: this.configuraciones.size,
          ingredientes_extras: this.ingredientesDisponibles.size
        }
      }
    };
  }

  async handleGetMetrics() {
    return {
      status: 200,
      data: {
        counters: {
          'variacion.validada.total': this.metrics.getCounter('variacion.validada.total') || 0,
          'variacion.rechazada.total': this.metrics.getCounter('variacion.rechazada.total') || 0
        },
        gauges: {
          'variacion.productos_configurados.count': this.configuraciones.size
        }
      }
    };
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishVariacionValidada(resultado, correlation_id) {
    await this.eventBus.publish('variacion.validada', {
      producto_id: resultado.producto_id,
      ingredientes_quitar: resultado.ingredientes_quitar,
      ingredientes_anadir: resultado.ingredientes_anadir,
      precio_base: resultado.precio_base,
      precio_extras: resultado.precio_extras,
      precio_total: resultado.precio_total,
      ingredientes_finales: resultado.ingredientes_finales
    }, {
      correlationId: correlation_id
    });
  }

  async publishVariacionRechazada(producto_id, variaciones, motivo, correlation_id) {
    await this.eventBus.publish('variacion.rechazada', {
      producto_id,
      ingredientes_quitar: variaciones.ingredientes_quitar || [],
      ingredientes_anadir: variaciones.ingredientes_anadir || [],
      motivo
    }, {
      correlationId: correlation_id
    });
  }

  // ==========================================
  // Business Logic
  // ==========================================

  async validarVariacion(request) {
    const { producto_id, ingredientes_quitar, ingredientes_anadir } = request;

    const config = this.configuraciones.get(producto_id);
    if (!config) {
      return {
        valida: false,
        producto_id,
        motivo_rechazo: 'Producto no configurado para variaciones'
      };
    }

    // Validar ingredientes a quitar
    if (ingredientes_quitar && ingredientes_quitar.length > 0) {
      for (const ing_id of ingredientes_quitar) {
        if (!config.permite_quitar.includes(ing_id)) {
          return {
            valida: false,
            producto_id,
            motivo_rechazo: `Ingrediente ${ing_id} no se puede quitar`
          };
        }
      }
    }

    // Validar ingredientes a añadir
    if (ingredientes_anadir && ingredientes_anadir.length > 0) {
      if (!config.permite_anadir) {
        return {
          valida: false,
          producto_id,
          motivo_rechazo: 'Este producto no permite añadir ingredientes'
        };
      }

      if (ingredientes_anadir.length > config.max_ingredientes_extra) {
        return {
          valida: false,
          producto_id,
          motivo_rechazo: `Máximo ${config.max_ingredientes_extra} ingredientes extra permitidos`
        };
      }

      for (const item of ingredientes_anadir) {
        const ingrediente = this.ingredientesDisponibles.get(item.ingrediente_id);
        if (!ingrediente) {
          return {
            valida: false,
            producto_id,
            motivo_rechazo: `Ingrediente ${item.ingrediente_id} no disponible`
          };
        }
        if (!ingrediente.disponible) {
          return {
            valida: false,
            producto_id,
            motivo_rechazo: `Ingrediente ${item.ingrediente_id} no está disponible actualmente`
          };
        }
      }
    }

    // Calcular precio
    const precio_base = config.precio_base;
    let precio_extras = 0;

    if (ingredientes_anadir && ingredientes_anadir.length > 0) {
      ingredientes_anadir.forEach(item => {
        const ingrediente = this.ingredientesDisponibles.get(item.ingrediente_id);
        if (ingrediente) {
          const cantidad = item.cantidad || 1;
          precio_extras += ingrediente.precio * cantidad;
        }
      });
    }

    // Calcular ingredientes finales
    const ingredientes_finales = [...config.ingredientes_base];

    if (ingredientes_quitar) {
      ingredientes_quitar.forEach(ing_id => {
        const index = ingredientes_finales.indexOf(ing_id);
        if (index > -1) {
          ingredientes_finales.splice(index, 1);
        }
      });
    }

    if (ingredientes_anadir) {
      ingredientes_anadir.forEach(item => {
        ingredientes_finales.push(item.ingrediente_id);
      });
    }

    return {
      valida: true,
      producto_id,
      ingredientes_quitar: ingredientes_quitar || [],
      ingredientes_anadir: ingredientes_anadir || [],
      precio_base,
      precio_extras,
      precio_total: precio_base + precio_extras,
      ingredientes_finales
    };
  }
}

module.exports = VariacionesModule;

/**
 * Módulo Variaciones v1.0
 * Gestión de variaciones de productos (quitar/añadir ingredientes)
 */

class VariacionesModule {
  constructor() {
    this.name = 'variaciones';
    this.version = '1.0.0';

    // Estado
    this.configuraciones = new Map(); // producto_id -> variacion_config
    this.ingredientesDisponibles = new Map(); // ingrediente_id -> {precio, disponible}

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
    await this.eventBus.subscribe('producto.creado', this.onProductoCreado.bind(this));
    await this.eventBus.subscribe('pedido.item_agregado', this.onPedidoItemAgregado.bind(this));
  }

  async onProductoCreado(event) {
    const { producto_id, variaciones, ingredientes_base, precio } = event.payload;

    if (!variaciones) {
      return;
    }

    this.logger.info('producto.creado.received', {
      producto_id,
      correlation_id: event.correlation_id
    });

    // Registrar configuración de variaciones
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

    // Registrar ingredientes disponibles para extras
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
      correlation_id: event.correlation_id
    });
  }

  async onPedidoItemAgregado(event) {
    const { producto_id, variaciones } = event.payload;

    if (!variaciones || (!variaciones.ingredientes_quitar && !variaciones.ingredientes_anadir)) {
      return; // No hay variaciones en este item
    }

    this.logger.info('pedido.item_agregado.received', {
      producto_id,
      tiene_variaciones: true,
      correlation_id: event.correlation_id
    });

    // Validar variaciones
    const resultado = await this.validarVariacion({
      producto_id,
      ingredientes_quitar: variaciones.ingredientes_quitar || [],
      ingredientes_anadir: variaciones.ingredientes_anadir || []
    }, event.correlation_id);

    if (resultado.valida) {
      await this.publishVariacionValidada(resultado, event.correlation_id);
    } else {
      await this.publishVariacionRechazada(producto_id, variaciones, resultado.motivo_rechazo, event.correlation_id);
    }
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleGetVariacionesProducto(req) {
    const { producto_id } = req.params;
    const config = this.configuraciones.get(producto_id);

    if (!config) {
      return {
        status: 404,
        data: { error: 'Producto no configurado para variaciones' }
      };
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

  async handleValidarVariacion(req) {
    const { producto_id, ingredientes_quitar, ingredientes_anadir } = req.body;

    if (!producto_id) {
      return {
        status: 400,
        data: { error: 'producto_id requerido' }
      };
    }

    const resultado = await this.validarVariacion({
      producto_id,
      ingredientes_quitar: ingredientes_quitar || [],
      ingredientes_anadir: ingredientes_anadir || []
    }, req.correlationId || req.request_id);

    if (resultado.valida) {
      this.metrics.increment('variacion.validada.total');
      await this.publishVariacionValidada(resultado, req.correlationId || req.request_id);
    } else {
      this.metrics.increment('variacion.rechazada.total');
    }

    return {
      status: resultado.valida ? 200 : 400,
      data: resultado
    };
  }

  async handleCalcularPrecio(req) {
    const { producto_id, ingredientes_anadir } = req.body;

    const config = this.configuraciones.get(producto_id);
    if (!config) {
      return {
        status: 404,
        data: { error: 'Producto no encontrado' }
      };
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

    const precio_total = precio_base + precio_extras;

    return {
      status: 200,
      data: {
        producto_id,
        precio_base,
        precio_extras,
        precio_total
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
        catalogo: {
          productos_configurados: this.configuraciones.size,
          ingredientes_extras: this.ingredientesDisponibles.size
        }
      }
    };
  }

  async handleGetMetrics(req) {
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

  async validarVariacion(request, correlation_id) {
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

      // Verificar que los ingredientes existen y están disponibles
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

    // Quitar ingredientes
    if (ingredientes_quitar) {
      ingredientes_quitar.forEach(ing_id => {
        const index = ingredientes_finales.indexOf(ing_id);
        if (index > -1) {
          ingredientes_finales.splice(index, 1);
        }
      });
    }

    // Añadir ingredientes
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

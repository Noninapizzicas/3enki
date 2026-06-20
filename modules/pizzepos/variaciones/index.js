/**
 * Módulo Variaciones v3.0
 * Gestión de variaciones de productos (quitar/añadir ingredientes)
 * Reglas por producto: qué se puede quitar, qué se puede añadir, máximo de extras.
 * Calcula precio final consultando precios a ingredientes (fuente única).
 *
 * Emite: variacion.validada, variacion.rechazada
 * Consume: producto.creado, comandero.item_agregado
 */

const BaseModule = require('../../_shared/base-module');

class VariacionesModule extends BaseModule {
  constructor() {
    super();
    this.name = 'variaciones';
    this.version = '4.0.0';

    // Dependencias (inyectadas en onLoad)
    this.uiHandler = null;

    // Estado en memoria — solo reglas por producto, NO precios de ingredientes
    this.configuraciones = new Map(); // producto_id -> variacion_config
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
    if (/not found|no encontrado|no configurado|no permite|no disponible/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    return { status: 500, code: 'UNKNOWN_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'handler') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('variaciones.errors', { code, kind });
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

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    // Event subscriptions y tools[] son auto-wireados desde module.json por el loader
    // (tools.contract v1.2: una declaracion, tres destinos).

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    // El loader desregistra automaticamente bus subs y uiHandler entries de tools[]
    // via unregisterToolsForAI. Aqui solo limpiamos estado del modulo.
    this.configuraciones.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe('carta.actualizada', this.onCartaActualizada.bind(this));
    await this.eventBus.subscribe('carta.editada', this.onCartaActualizada.bind(this));
    await this.eventBus.subscribe('producto.creado', this.onProductoCreado.bind(this));
    await this.eventBus.subscribe('comandero.item_agregado', this.onComanderoItemAgregado.bind(this));

    this.logger.info('variaciones.events.subscribed', {
      events: ['carta.actualizada', 'carta.editada', 'producto.creado', 'comandero.item_agregado']
    });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  // Configura (o reconfigura) un producto desde su forma de carta. Fuente ÚNICA de la
  // lógica; la usan onCartaActualizada (flujo nuevo) y onProductoCreado (legacy).
  _configurar(producto_id, { categoria, precio, variaciones, ingredientes_base, ingredientes }) {
    if (!producto_id) return;
    const v = variaciones || {};
    this.configuraciones.set(producto_id, {
      producto_id,
      grupo: categoria || 'otro',
      precio_base: precio,
      permite_quitar: v.permite_quitar || [],
      permite_anadir: v.permite_anadir || false,
      extras_sugeridos: v.extras_sugeridos || [],
      max_ingredientes_extra: v.max_ingredientes_extra || 5,
      ingredientes_base: (ingredientes_base || ingredientes || [])
        .map(i => (typeof i === 'string' ? i : i && i.id)).filter(Boolean)
    });
  }

  // Flujo NUEVO: configura las variaciones de TODOS los productos de la carta. La CARTA
  // es la fuente (carta.actualizada/editada de carta-manager). Reemplaza al muerto
  // 'producto.creado', que en la arquitectura carta-based no lo emite nadie — variaciones
  // se quedó huérfana y por eso no se podía quitar/añadir en ninguna pizza.
  async onCartaActualizada(event) {
    const d = event?.data || event?.payload || event;
    const carta = d?.carta;
    if (!carta || !Array.isArray(carta.productos)) return;
    for (const p of carta.productos) {
      if (!p || !p.id) continue;
      this._configurar(p.id, {
        categoria: p.categoria_id || p.categoria,
        precio: p.precio,
        variaciones: p.variaciones,
        ingredientes_base: p.ingredientes_base,
        ingredientes: p.ingredientes
      });
    }
    this.metrics?.gauge?.('variacion.productos_configurados.count', this.configuraciones.size);
    this.logger?.info?.('variaciones.carta.configurada', {
      carta_id: carta.meta?.id,
      productos: carta.productos.length,
      correlation_id: d?.correlation_id
    });
  }

  // Legacy: emisor 'producto.creado' (hoy nadie lo emite; se conserva por compat).
  async onProductoCreado(event) {
    const eventData = event?.data || event?.payload || event;
    const { producto_id, variaciones, ingredientes_base, precio, categoria } = eventData;
    if (!variaciones) return;
    this._configurar(producto_id, { categoria, precio, variaciones, ingredientes_base });
    this.metrics.gauge('variacion.productos_configurados.count', this.configuraciones.size);
    this.logger.info('variacion.configurada', { producto_id, correlation_id: event?.metadata?.correlationId });
  }

  async onComanderoItemAgregado(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { producto_id, variaciones } = eventData;

    if (!variaciones || (!variaciones.ingredientes_quitar && !variaciones.ingredientes_anadir)) {
      return;
    }

    this.logger.info('comandero.item_agregado.received', {
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
      this.metrics?.increment?.('variaciones.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'get' });
      this.logger.warn('variaciones.get.not_configured', { producto_id });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        'Producto no configurado para variaciones',
        { producto_id });
    }

    return {
      status: 200,
      data: {
        producto_id,
        grupo: config.grupo,
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
      this.metrics?.increment?.('variaciones.errors', { code: 'INVALID_INPUT', kind: 'validar' });
      this.logger.warn('variaciones.validar.missing', { field: 'producto_id' });
      return this._errorResponse(400, 'INVALID_INPUT', 'producto_id requerido', { field: 'producto_id' });
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
      this.metrics?.increment?.('variaciones.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'calcular_precio' });
      this.logger.warn('variaciones.calcular_precio.not_found', { producto_id });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Producto no encontrado', { producto_id });
    }

    const precio_base = config.precio_base;
    let precio_extras = 0;

    if (ingredientes_anadir && ingredientes_anadir.length > 0) {
      precio_extras = await this.calcularPrecioExtras(ingredientes_anadir, config);
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
          productos_configurados: this.configuraciones.size
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
    await this._publicarEvento('variacion.validada', {
      producto_id: resultado.producto_id,
      ingredientes_quitar: resultado.ingredientes_quitar,
      ingredientes_anadir: resultado.ingredientes_anadir,
      precio_base: resultado.precio_base,
      precio_extras: resultado.precio_extras,
      precio_total: resultado.precio_total,
      ingredientes_finales: resultado.ingredientes_finales
    }, { correlation_id });
  }

  async publishVariacionRechazada(producto_id, variaciones, motivo, correlation_id) {
    await this._publicarEvento('variacion.rechazada', {
      producto_id,
      ingredientes_quitar: variaciones.ingredientes_quitar || [],
      ingredientes_anadir: variaciones.ingredientes_anadir || [],
      motivo
    }, { correlation_id });
  }

  // ==========================================
  // Business Logic
  // ==========================================

  /**
   * Obtiene precio_extra de un ingrediente consultando al módulo ingredientes.
   * Si hay extras_sugeridos con precio específico para este producto, usa ese.
   */
  async getPrecioIngrediente(ingrediente_id, config) {
    // extras_sugeridos sobreescribe precios (configuración específica del producto)
    if (config && config.extras_sugeridos) {
      const extra = config.extras_sugeridos.find(e => e.ingrediente_id === ingrediente_id);
      if (extra && extra.precio_extra != null) {
        return extra.precio_extra;
      }
    }

    // Consultar al módulo ingredientes (fuente única)
    const result = await this.uiHandler.handle('ingredientes', 'get_precio', { ingrediente_id });
    if (result?.status === 200 && result?.data) {
      return result.data.precio_extra || 0;
    }

    return 0;
  }

  /**
   * Calcula precio total de ingredientes extra.
   */
  async calcularPrecioExtras(ingredientes_anadir, config) {
    let total = 0;

    for (const item of ingredientes_anadir) {
      const precio = await this.getPrecioIngrediente(item.ingrediente_id, config);
      const cantidad = item.cantidad || 1;
      total += precio * cantidad;
    }

    return total;
  }

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

      // Verificar disponibilidad consultando al módulo ingredientes
      for (const item of ingredientes_anadir) {
        const result = await this.uiHandler.handle('ingredientes', 'get', { id: item.ingrediente_id });
        if (!result || result.status !== 200) {
          return {
            valida: false,
            producto_id,
            motivo_rechazo: `Ingrediente ${item.ingrediente_id} no disponible`
          };
        }
        if (result.data?.disponible === false) {
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
      precio_extras = await this.calcularPrecioExtras(ingredientes_anadir, config);
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

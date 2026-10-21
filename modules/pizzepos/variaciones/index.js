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
const { derivarOpciones } = require('../../_shared/derivar-opciones');
const { evaluarProducto } = require('../../_shared/motor-opciones');

// Paleta de ingredientes "para sumar" por categoría: unión de los ingredientes de los productos de
// esa categoría (con su precio_extra si la carta lo trae). Alimenta el modo ELEGIR_VARIOS al derivar.
function _paletasPorCategoria(carta) {
  const porCat = new Map();
  const productos = (carta && Array.isArray(carta.productos)) ? carta.productos : [];
  for (const p of productos) {
    const cat = p && (p.categoria_id || p.categoria);
    if (!cat) continue;
    if (!porCat.has(cat)) porCat.set(cat, new Map());
    const m = porCat.get(cat);
    const lista = (Array.isArray(p.ingredientes_base) && p.ingredientes_base.length)
      ? p.ingredientes_base : (Array.isArray(p.ingredientes) ? p.ingredientes : []);
    for (const ing of lista) {
      if (!ing || !ing.id || m.has(ing.id)) continue;
      m.set(ing.id, { id: ing.id, nombre: ing.nombre, emoji: ing.emoji, familia: ing.familia, precio_extra: ing.precio_extra, disponible: ing.disponible });
    }
  }
  const out = new Map();
  for (const [cat, m] of porCat) out.set(cat, [...m.values()]);
  return out;
}

class VariacionesModule extends BaseModule {
  constructor() {
    super();
    this.name = 'variaciones';
    this.version = '4.6.1';

    // Dependencias (inyectadas en onLoad)
    this.uiHandler = null;

    // Estado en memoria — solo reglas por producto, NO precios de ingredientes
    this.configuraciones = new Map(); // producto_id -> variacion_config
    this._hidratando = new Map();     // project_id -> Promise (hidrataciones en vuelo)
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
    this._hidratando.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe('project.activated', this.onProjectActivated.bind(this));
    await this.eventBus.subscribe('carta.actualizada', this.onCartaActualizada.bind(this));
    await this.eventBus.subscribe('carta.editada', this.onCartaActualizada.bind(this));
    await this.eventBus.subscribe('producto.creado', this.onProductoCreado.bind(this));
    await this.eventBus.subscribe('comandero.item_agregado', this.onComanderoItemAgregado.bind(this));

    this.logger.info('variaciones.events.subscribed', {
      events: ['project.activated', 'carta.actualizada', 'carta.editada', 'producto.creado', 'comandero.item_agregado']
    });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  // Configura (o reconfigura) un producto desde su forma de carta. Fuente ÚNICA de la
  // lógica; la usan onCartaActualizada (flujo nuevo) y onProductoCreado (legacy).
  _configurar(producto_id, { categoria, precio, variaciones, ingredientes_base, ingredientes, opciones, paleta }) {
    if (!producto_id) return;
    const v = variaciones || {};
    const max = v.max_ingredientes_extra || 10;
    // Subsistema Opciones: usa las opciones que trae la carta; si no, las DERIVA (QUITAR los propios +
    // ELEGIR_VARIOS la paleta de su categoría). El frontend pinta por modo; el motor valida/precia.
    const ops = (Array.isArray(opciones) && opciones.length)
      ? opciones
      : derivarOpciones({ ingredientes: ingredientes_base || ingredientes || [] }, paleta || [], { maxExtras: max });
    const maxOpciones = (() => {
      // El máximo que MANDA es el declarado en las opciones de la carta: es lo que el panel pinta
      // y lo que el camarero/cliente ve. `variaciones.max_ingredientes_extra` es la forma vieja
      // y solo actúa de respaldo cuando la carta no declara opciones.
      const grupos = Array.isArray(ops) ? ops : [];
      const g = grupos.find(o => o && o.modo === 'ELEGIR_VARIOS' && o.max != null);
      const n = g ? Number(g.max) : NaN;
      return Number.isFinite(n) ? n : null;
    })();
    this.configuraciones.set(producto_id, {
      producto_id,
      grupo: categoria || 'otro',
      precio_base: precio,
      precio_base_centimos: Math.round((Number(precio) || 0) * 100),
      permite_quitar: v.permite_quitar || [],
      // Por defecto SÍ se puede añadir (salvo que la carta lo niegue explícitamente).
      permite_anadir: v.permite_anadir !== false,
      extras_sugeridos: v.extras_sugeridos || [],
      max_ingredientes_extra: maxOpciones != null ? maxOpciones : (v.max_ingredientes_extra || 5),
      ingredientes_base: (ingredientes_base || ingredientes || [])
        .map(i => (typeof i === 'string' ? i : i && i.id)).filter(Boolean),
      opciones: ops
    });
  }

  // Configura una lista de productos proyectados (misma forma de carta). Devuelve cuántos.
  _configurarLista(productos) {
    if (!Array.isArray(productos)) return 0;
    const paletas = _paletasPorCategoria({ productos });
    for (const p of productos) {
      if (!p || !p.id) continue;
      this._configurar(p.id, {
        categoria: p.categoria_id || p.categoria,
        precio: p.precio,
        variaciones: p.variaciones,
        ingredientes_base: p.ingredientes_base,
        ingredientes: p.ingredientes,
        opciones: p.opciones,
        paleta: paletas.get(p.categoria_id || p.categoria) || []
      });
    }
    this.metrics?.gauge?.('variacion.productos_configurados.count', this.configuraciones.size);
    return productos.length;
  }

  // Caché con AUTO-VIVIFICACIÓN: el estado vive en memoria y solo se poblaba con
  // project.activated (lo emite el frontend al entrar al proyecto) o con una edición de carta.
  // En frío —tras un reinicio, nadie ha activado nada— la caché nace VACÍA: variaciones.get
  // responde 404 al panel ("no se pudo leer el informe") y cada comandero.item_agregado con
  // variación emite variacion.rechazada hasta la primera edición de carta.
  // Aquí el ACTO crea el estado: quien pregunta por un producto de un proyecto conocido hidrata
  // ESE proyecto desde la fuente (productos.carta_completa, proyector sin estado) y se reintenta.
  // No se hidratan todos los proyectos de golpe a propósito: los ids de producto se REPITEN entre
  // proyectos (nonina y the-pirate comparten 52) y esta caché está indexada por producto_id —
  // un barrido en bloque dejaría la config del último proyecto encima de la del primero.
  // Las peticiones concurrentes del mismo proyecto comparten el viaje (una sola RPC).
  _asegurarProyecto(project_id) {
    if (!project_id || !this.uiHandler?.handle) return Promise.resolve(0);
    const enVuelo = this._hidratando.get(project_id);
    if (enVuelo) return enVuelo;
    const viaje = (async () => {
      try {
        const res = await this.uiHandler.handle('productos', 'carta_completa', { project_id });
        const productos = res?.data?.productos;
        if (!Array.isArray(productos)) return 0;
        const n = this._configurarLista(productos);
        this.logger?.info?.('variaciones.hidratada.bajo_demanda', { project_id, productos: n });
        return n;
      } catch (err) {
        // Best-effort: si productos no responde, el 404 sigue siendo el mismo de antes.
        this.logger?.warn?.('variaciones.hidratada.fallida', { project_id, error: err?.message });
        return 0;
      } finally {
        this._hidratando.delete(project_id);
      }
    })();
    this._hidratando.set(project_id, viaje);
    return viaje;
  }

  // Lee la config del producto; si la caché está fría y sabemos el proyecto, hidrata y reintenta.
  // Sin project_id no se inventa nada: se devuelve el mismo hueco de antes (404).
  async _configDeProducto(producto_id, project_id) {
    let config = this.configuraciones.get(producto_id);
    if (!config && project_id && producto_id) {
      await this._asegurarProyecto(project_id);
      config = this.configuraciones.get(producto_id);
    }
    return config || null;
  }

  // Flujo NUEVO: configura las variaciones de TODOS los productos de la carta. La CARTA
  // es la fuente (carta.actualizada/editada de carta-manager). Reemplaza al muerto
  // 'producto.creado', que en la arquitectura carta-based no lo emite nadie — variaciones
  // se quedó huérfana y por eso no se podía quitar/añadir en ninguna pizza.
  async onCartaActualizada(event) {
    const d = event?.data || event?.payload || event;
    const carta = d?.carta;
    if (!carta || !Array.isArray(carta.productos)) return;
    this._configurarLista(carta.productos);
    this.logger?.info?.('variaciones.carta.configurada', {
      carta_id: carta.meta?.id,
      productos: carta.productos.length,
      correlation_id: d?.correlation_id
    });
  }

  // Warm tras un (re)arranque en seco: variaciones vive en memoria (lost_on_restart) y
  // sin esto esperaría a la 1ª edición de carta para repoblarse. Al activarse un proyecto
  // pide la carta activa YA proyectada al reflejo de productos (uiHandler.handle, síncrono;
  // productos resuelve qué carta es la activa y la proyecta con su campo `variaciones`) y
  // configura TODOS sus productos. La carta sigue siendo la fuente; aquí solo se lee.
  async onProjectActivated(event) {
    const d = event?.data || event?.payload || event;
    const project_id = d?.project_id;
    if (!project_id || !this.uiHandler) return;
    try {
      const res = await this.uiHandler.handle('productos', 'carta_completa', { project_id });
      const productos = res?.data?.productos;
      if (!Array.isArray(productos)) return;
      this._configurarLista(productos);
      this.logger?.info?.('variaciones.warm.project_activated', {
        project_id, productos: productos.length, correlation_id: d?.correlation_id
      });
    } catch (err) {
      // Warm best-effort: si productos aún no responde, la 1ª edición de carta repobla igual.
      this.logger?.warn?.('variaciones.warm.failed', { project_id, error: err?.message });
    }
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
    const { producto_id, variaciones, project_id } = eventData;

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
      project_id,
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
    const { producto_id, project_id } = data || {};
    const config = await this._configDeProducto(producto_id, project_id);

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
        max_ingredientes_extra: config.max_ingredientes_extra,
        precio_base_centimos: config.precio_base_centimos,
        opciones: config.opciones || []
      }
    };
  }

  async handleValidarVariacion(data) {
    const { producto_id, ingredientes_quitar, ingredientes_anadir, project_id } = data || {};

    if (!producto_id) {
      this.metrics?.increment?.('variaciones.errors', { code: 'INVALID_INPUT', kind: 'validar' });
      this.logger.warn('variaciones.validar.missing', { field: 'producto_id' });
      return this._errorResponse(400, 'INVALID_INPUT', 'producto_id requerido', { field: 'producto_id' });
    }

    const resultado = await this.validarVariacion({
      producto_id,
      project_id,
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
    const { producto_id, ingredientes_anadir, project_id } = data || {};

    const config = await this._configDeProducto(producto_id, project_id);
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

  // Subsistema Opciones: valida + precia una selección server-side con el motor genérico
  // (gemelo del pedido-tasador: el cliente manda valor_ids por opción, el precio lo pone el motor).
  async handleEvaluarOpciones(data) {
    const { producto_id, selecciones, project_id } = data || {};
    if (!producto_id) return this._errorResponse(400, 'INVALID_INPUT', 'producto_id requerido', { field: 'producto_id' });
    const config = await this._configDeProducto(producto_id, project_id);
    if (!config) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Producto no configurado', { producto_id });
    const r = evaluarProducto(
      { precio_base_centimos: config.precio_base_centimos || 0, opciones: config.opciones || [] },
      selecciones || {}
    );
    return { status: r.valida ? 200 : 400, data: { producto_id, ...r } };
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
    const { producto_id, ingredientes_quitar, ingredientes_anadir, project_id } = request || {};

    const config = await this._configDeProducto(producto_id, project_id);
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

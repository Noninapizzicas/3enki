/**
 * pizzepos/comandero v3.1.0 — Buffer de pedido por cuenta + envio a cocina (POC2 rewrite).
 *
 * El camarero añade items al buffer, modifica cantidades/notas, y envia a cocina.
 * Mantiene caches de productos (catalogo + por carta) para resolver precio por canal.
 * Persiste buffers transitorios atomicamente (debounced 1s) para sobrevivir restart.
 *
 * Aislamiento event-core: la resolucion canal→carta_id se mantiene como cache
 * local hidratado por el evento tarifas.config.actualizada. En onLoad emite
 * tarifas.config.solicitada para obtener el snapshot inicial. NO accede a tarifas
 * directamente via moduleLoader (paradigma "emite evento, quien sabe hace").
 *
 * Eventos del bus:
 *   subscribes (9): cuenta.{creada,actualizada}, caja.cerrada, dia.iniciado,
 *                   catalogo.actualizado, producto.{creado,actualizado},
 *                   carta.actualizada, tarifas.config.actualizada.
 *   publishes  (5): comandero.{item_agregado, item_eliminado, item_actualizado, enviar_cocina},
 *                   tarifas.config.solicitada.
 *
 * 7 ui_handlers (auto-wired desde module.json).
 */

'use strict';

const crypto = require('crypto');
const fs     = require('fs').promises;
const path   = require('path');

const BaseModule = require('../../_shared/base-module');
const { tasarPedido } = require('../../_shared/pedido-tasador');
const DEFAULT_PROJECT_ID = 'default';
const SAVE_DEBOUNCE_MS   = 1000;

class ComanderoModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'comandero';
    this.version = '3.6.1';
    this.validator = null;

    this.pedidos              = new Map();
    this.refDisplayCache      = new Map();
    // Cache del catálogo BASE: Map<project_id, Map<producto_id, producto>>.
    // Era un Map PLANO, sin proyecto y sin purga: cada catalogo.actualizado solo hacía .set(),
    // así que los productos de otra carta u otro proyecto se acumulaban (el POS llegó a declarar
    // 63 productos con una carta de 22) y un producto borrado seguía cobrándose para siempre.
    // Ahora es por proyecto y se REEMPLAZA entero con cada señal.
    this.productosCache       = new Map();
    this.cartasProductosCache = new Map();
    // Carta COMPLETA por carta_id: { productos, ingredientes_catalogo }. Es la que come el
    // tasador de pedidos (_shared/pedido-tasador.js) — la misma función pura que re-tasa el
    // autoservicio de WhatsApp, de modo que POS y web cobran con el mismo criterio.
    this.cartasCompletas      = new Map();
    // request_id → {project_id, carta_id} de los carta.get.request en vuelo (hidratación al cargar).
    this._cartaGetPendientes = new Map();
    // Cache local de la config de tarifas hidratado via tarifas.config.actualizada.
    // Map<project_id, { general:string|null, canales:{canal->carta_id} }>
    this.tarifasConfigPorProject = new Map();

    this._bufferFile = path.join('./data/current', 'comandero_buffers.json');
    this._saveTimer  = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger    = core.logger;
    this.metrics   = core.metrics;
    this.eventBus  = core.eventBus;
    this.validator = core.validationManager || null;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    this._registerSchemas();
    await this._restaurarBuffers();

    // Pide snapshot inicial a tarifas. La respuesta llega via
    // tarifas.config.actualizada (tipo=snapshot) por cada proyecto conocido.
    // OJO: NO es una carrera de suscripción — el loader cablea las suscripciones ANTES de onLoad
    // (core/modules/loader.js: wireEventSubscriptions → onLoad). El hueco real es el RESPONDEDOR:
    // en arranque en frío tarifas puede no estar cargado todavía, así que este publish se queda sin
    // quien lo atienda. Por eso se repite en dos momentos deterministas (ver _solicitarSnapshotTarifas):
    // core.modules.loaded.all (ya están TODOS los módulos) y project.activated (proyecto vivo).
    // La respuesta es full-replace por proyecto: repetir la petición es idempotente.
    this._solicitarSnapshotTarifas('onLoad');

    this.logger.info('module.loaded', {
      module:           this.name,
      version:          this.version,
      pedidos_restored: this.pedidos.size
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this.pedidos.clear();
    this.productosCache.clear();
    this.cartasProductosCache.clear();
    this.cartasCompletas.clear();
    this.refDisplayCache.clear();
    this.tarifasConfigPorProject.clear();
    this.logger.info('module.unloaded', { module: this.name });
  }

  _registerSchemas() {
    if (!this.validator) return;

    this.validator.registerSchema('comandero.add-item', {
      type: 'object',
      required: ['cuenta_id', 'producto_id'],
      properties: {
        cuenta_id:   { type: 'string', minLength: 1 },
        producto_id: { type: 'string', minLength: 1 },
        project_id:  { type: 'string' },
        nombre:      { type: 'string' },
        precio:      { type: 'number', minimum: 0 },
        cantidad:    { type: 'integer', minimum: 1 },
        notas:       { type: 'string' },
        categoria:   { type: 'string' },
        tipo:        { type: 'string', enum: ['mitad_mitad', 'al_gusto'] },
        // variaciones: objeto nuevo { ingredientes_quitar, ingredientes_anadir } O array legacy.
        variaciones: { type: ['array', 'object'] },
        // mitad y mitad: cada mitad = { id, nombre, ingredientes_base, quitar?, anadir? }.
        pizza_izquierda: { type: 'object' },
        pizza_derecha:   { type: 'object' },
        // al gusto / catálogo del item
        ingredientes:      { type: 'array' },
        ingredientes_base: { type: 'array' },
        precio_canal_resuelto: { type: 'boolean' }
      }
    });

    this.validator.registerSchema('comandero.update-item', {
      type: 'object',
      required: ['cuenta_id', 'item_id'],
      properties: {
        cuenta_id: { type: 'string', minLength: 1 },
        item_id:   { type: 'string', minLength: 1 },
        cantidad:  { type: 'integer' },
        notas:     { type: 'string' }
      }
    });

    this.validator.registerSchema('comandero.remove-item', {
      type: 'object',
      required: ['cuenta_id', 'item_id'],
      properties: {
        cuenta_id: { type: 'string', minLength: 1 },
        item_id:   { type: 'string', minLength: 1 }
      }
    });

    this.validator.registerSchema('comandero.send-kitchen', {
      type: 'object',
      required: ['cuenta_id'],
      properties: {
        cuenta_id:  { type: 'string', minLength: 1 },
        project_id: { type: 'string' }
      }
    });

    this.logger.info('comandero.schemas.registered', { count: 4 });
  }

  _validateInput(schemaId, data) {
    if (!this.validator) return null;
    const result = this.validator.validate(schemaId, data);
    if (!result.valid) {
      return this._errorResponse(400, 'INVALID_INPUT', 'Validacion fallida', { validation_errors: result.errors });
    }
    return null;
  }

  // ==========================================
  // Bus handlers
  // ==========================================

  async onCuentaCreada(event) {
    const data = this._unwrap(event);
    const { cuenta_id, ref_display } = data;
    if (cuenta_id && ref_display) this.refDisplayCache.set(cuenta_id, ref_display);
  }

  async onCuentaActualizada(event) {
    const data = this._unwrap(event);
    const { cuenta_id, cambios } = data;
    if (cuenta_id && cambios?.ref_display) this.refDisplayCache.set(cuenta_id, cambios.ref_display);
  }

  async onCajaCerrada(event) {
    const size = this.pedidos.size;
    this.pedidos.clear();
    this._guardarBuffers();
    this.logger.info('comandero.reset.caja_cerrada', {
      pedidos_limpiados: size,
      correlation_id: event?.metadata?.correlationId || this._unwrap(event)?.correlation_id
    });
  }

  async onDiaIniciado(event) {
    const size = this.pedidos.size;
    this.pedidos.clear();
    this._guardarBuffers();
    this.logger.info('comandero.reset.dia_iniciado', {
      pedidos_limpiados: size,
      correlation_id: event?.metadata?.correlationId || this._unwrap(event)?.correlation_id
    });
  }

  // catalogo.actualizado — señal de refresco del catálogo BASE. Llega en DOS formas y solo una
  // alimenta este cache:
  //   · { project_id, menu_id, productos: [...] }  → proyección de la carta GENERAL (productos/)
  //   · { project_id, catalogo: {...} }            → catálogo crudo (prisma/producto-manager), otra verdad
  // La guarda de array no es cosmética: sin ella un evento de la segunda forma (trae 0 productos)
  // vaciaría el cache y el POS cobraría 0 hasta la siguiente proyección.
  async onCatalogoActualizado(event) {
    const data = this._unwrap(event);
    const productos = data?.productos;
    if (!Array.isArray(productos)) {
      this.logger.debug('comandero.catalogo.ignored', {
        reason: 'evento sin array productos', keys: Object.keys(data || {})
      });
      return;
    }

    const projectId = data.project_id || DEFAULT_PROJECT_ID;
    const previos   = this.productosCache.get(projectId) || new Map();

    // FULL-REPLACE, no acumulación: lo que la carta ya no tiene deja de existir y deja de cobrarse.
    // Un producto renombrado o eliminado desaparece aquí; con el .set() de antes se quedaba.
    const fresco = new Map();
    for (const producto of productos) {
      if (!producto?.id || producto.precio === undefined) continue;
      fresco.set(producto.id, {
        nombre:      producto.nombre || producto.id,
        precio:      producto.precio,
        categoria:   producto.categoria || null,
        estaciones:  producto.estaciones || null,
        precio_fijo: producto.precio_fijo || false
      });
    }
    let purgados = 0;
    for (const id of previos.keys()) if (!fresco.has(id)) purgados++;
    this.productosCache.set(projectId, fresco);

    this.logger.info('comandero.catalogo.synced', {
      project_id:   projectId,
      menu_id:      data.menu_id || null,
      source:       data.source || null,
      productos_en_cache: fresco.size,
      previos:      previos.size,
      purgados
    });
  }

  async onCartaActualizada(event) {
    const data    = this._unwrap(event);
    // carta-manager publica { project_id, carta, motivo } — la carta va ENVUELTA. Antes se leía
    // data.meta.id (undefined) → return silencioso → cartasProductosCache NUNCA se hidrataba y el
    // precio por canal no existía (el canal caía siempre al precio base). Acepta ambas formas.
    const carta     = data?.carta || data;
    const cartaId   = carta?.meta?.id;
    const productos = carta?.productos || [];
    if (!cartaId || productos.length === 0) return;

    this._cachearCarta(carta);
  }

  // Cache POR CARTA (la del canal): es lo que hace que un canal con carta propia cobre su precio.
  _cachearCarta(carta) {
    const cartaId = carta?.meta?.id;
    const productos = carta?.productos || [];
    if (!cartaId || productos.length === 0) return;
    const cartaCache = new Map();
    for (const p of productos) {
      if (p.id && p.precio !== undefined) {
        cartaCache.set(p.id, {
          nombre:     p.nombre || p.id,
          precio:     p.precio,
          categoria:  p.categoria || p.categoria_id || null,
          estaciones: p.estaciones || null
        });
      }
    }
    this.cartasProductosCache.set(cartaId, cartaCache);
    // Carta completa (productos + catálogo de extras) para el tasador: el índice de productos
    // de arriba es solo para la resolución rápida de precio por canal.
    this.cartasCompletas.set(cartaId, {
      productos,
      ingredientes_catalogo: this._extrasDeCarta(productos)
    });
    this.logger.info('comandero.carta.cached', { carta_id: cartaId, productos: cartaCache.size });
  }

  // Respuesta al RPC carta.get.request que pedimos al hidratar las cartas del mapping.
  // Si la carta es la GENERAL, además rellena productosCache: sin esto, tras un restart el POS
  // cobraba 0 y nombraba el item con el producto_id hasta que alguien tocara la carta.
  async onCartaGetResponse(event) {
    const data = this._unwrap(event);
    if (data?.status !== 200 || !data?.data) return;
    const carta = data.data;
    const cartaId = carta?.meta?.id || null;
    this._cachearCarta(carta);

    const pend = this._cartaGetPendientes.get(data.request_id);
    if (pend) this._cartaGetPendientes.delete(data.request_id);
    const project_id = pend?.project_id;
    const general = project_id ? this.tarifasConfigPorProject.get(project_id)?.general : null;
    if (general && cartaId === general) this._cachearCatalogoBase(carta, project_id);
  }

  // Map<project_id → Map<producto_id → producto>> del catálogo BASE. Un proyecto nuevo nace vacío:
  // el catálogo de un proyecto jamás puede servir precio a otro.
  _productosDe(projectId) {
    const pid = projectId || DEFAULT_PROJECT_ID;
    let map = this.productosCache.get(pid);
    if (!map) { map = new Map(); this.productosCache.set(pid, map); }
    return map;
  }

  _totalProductosCache() {
    let total = 0;
    for (const map of this.productosCache.values()) total += map.size;
    return total;
  }

  // Catálogo BASE (productosCache): lo que cobra mostrador/recogida cuando el canal no tiene
  // carta propia o el producto no está en ella. FULL-REPLACE del proyecto: hidratar la general
  // no puede dejar vivos los productos de una versión anterior de la carta.
  _cachearCatalogoBase(carta, projectId) {
    const pid = projectId || DEFAULT_PROJECT_ID;
    const previos = this.productosCache.get(pid) || new Map();
    const fresco  = new Map();
    for (const p of (carta?.productos || [])) {
      if (!p?.id || p.precio === undefined) continue;
      fresco.set(p.id, {
        nombre:     p.nombre || p.id,
        precio:     p.precio,
        categoria:  p.categoria || p.categoria_id || null,
        estaciones: p.estaciones || null,
        precio_fijo: p.precio_fijo || false
      });
    }
    let purgados = 0;
    for (const id of previos.keys()) if (!fresco.has(id)) purgados++;
    this.productosCache.set(pid, fresco);
    this.logger.info('comandero.catalogo.hidratado', {
      project_id: pid, productos_en_cache: fresco.size, previos: previos.size, purgados
    });
  }

  async onProductoActualizado(event) {
    const data = this._unwrap(event);
    const { id, nombre, precio, categoria, project_id } = data;
    if (id && precio !== undefined) {
      const cache = this._productosDe(project_id);
      const existing = cache.get(id);
      cache.set(id, {
        nombre:     nombre || id,
        precio,
        categoria:  categoria || existing?.categoria || null,
        estaciones: existing?.estaciones || null
      });
    }
  }

  /**
   * Hidrata cache local de tarifas. Llega en dos sabores:
   *   - tipo === 'snapshot' (respuesta a tarifas.config.solicitada): payload.config trae estado completo.
   *   - tipo en {'general','assign','variant_registered'} (cambio real): tambien trae payload.config completo.
   * En ambos casos hacemos full-replace del entry del project_id en el cache.
   */
  async onTarifasConfigActualizada(event) {
    const data = this._unwrap(event);
    const { project_id, config } = data;
    if (!project_id || !config) return;
    this.tarifasConfigPorProject.set(project_id, {
      general: config.general ?? null,
      canales: { ...(config.canales || {}) }
    });
    this.logger.info('comandero.tarifas.config.cached', {
      project_id,
      tipo: data.tipo || null,
      canales_count: Object.keys(config.canales || {}).length
    });
    this._hidratarCartasDeCanal(project_id, config);
  }

  // La petición de snapshot a tarifas se repite en tres momentos DETERMINISTAS (sin timers):
  //   1. onLoad            — camino caliente (hot-reload): tarifas ya está cargado, responde ya.
  //   2. core.modules.loaded.all — arranque en frío: el loader publica este evento cuando TODOS los
  //                               módulos están cargados, así que tarifas ya existe y atiende.
  //   3. project.activated — el proyecto acaba de activarse: tarifas ya indexó su carril.
  // Repetir es inocuo: la respuesta es full-replace por project_id y _hidratarCartasDeCanal salta
  // las cartas ya cacheadas.
  _solicitarSnapshotTarifas(etapa, projectId = null) {
    if (!this.eventBus || typeof this.eventBus.publish !== 'function') return;
    const payload = {
      tipo: 'snapshot',
      correlation_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    };
    if (projectId) payload.project_id = projectId;
    try {
      this.eventBus.publish('tarifas.config.solicitada', payload);
    } catch (err) {
      this.logger?.warn?.('comandero.tarifas.solicitada.failed', { etapa, error: err?.message });
    }
  }

  async onCoreModulesLoadedAll() {
    this._solicitarSnapshotTarifas('modules_loaded_all');
  }

  async onProjectActivado(event) {
    const data = event?.data || event || {};
    if (!data.project_id) return;
    this._solicitarSnapshotTarifas('project_activated', data.project_id);
  }

  // Las cartas de canal necesitan su cache aunque nadie las acabe de tocar (tras un restart el
  // cache nace vacío y el canal cobraría precio base). Se piden por RPC al custodio, una vez cada una.
  _hidratarCartasDeCanal(project_id, config) {
    const ids = new Set([config.general, ...Object.values(config.canales || {})].filter(Boolean));
    for (const carta_id of ids) {
      if (this.cartasProductosCache.has(carta_id)) continue;
      const reqId = crypto.randomUUID();
      this._cartaGetPendientes.set(reqId, { project_id, carta_id });
      try {
        this.eventBus.publish('carta.get.request', { request_id: reqId, project_id, carta_id });
      } catch (err) {
        this.logger.warn('comandero.carta_hidratar.publish_failed', { carta_id, error: err?.message });
      }
    }
  }

  // ==========================================
  // UI Handlers (auto-wired desde module.json)
  // ==========================================

  async handleGetPedido(data) {
    try {
      const { cuenta_id } = data || {};
      if (!cuenta_id) {
        this._logError('comandero.ui.get.validation_failed', { missing: 'cuenta_id' }, 'ui_get', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'cuenta_id es requerido', { field: 'cuenta_id' });
      }

      let pedido = this.pedidos.get(cuenta_id);
      if (!pedido) {
        pedido = { items: [], notas: '', total: 0 };
        this.pedidos.set(cuenta_id, pedido);
      }
      return { status: 200, data: { cuenta_id, ...pedido } };
    } catch (err) {
      return this._handleHandlerError('comandero.ui.get.failed', err, 'ui_get');
    }
  }

  async handleAddItem(data) {
    try {
      const invalid = this._validateInput('comandero.add-item', data);
      if (invalid) {
        this._logError('comandero.ui.add_item.validation_failed', { details: invalid.error.details }, 'ui_add_item', 'INVALID_INPUT');
        return invalid;
      }

      const { cuenta_id, producto_id, nombre, precio, cantidad, categoria, variaciones, notas,
              tipo, pizza_izquierda, pizza_derecha,
              ingredientes: metaIngredientes, ingredientes_base, project_id } = data;

      let pedido = this.pedidos.get(cuenta_id);
      if (!pedido) {
        pedido = { items: [], notas: '', total: 0 };
        this.pedidos.set(cuenta_id, pedido);
      }

      const cached       = this._productosDe(project_id).get(producto_id);
      const itemNombre   = nombre || cached?.nombre || producto_id;
      const precioBase   = precio ?? cached?.precio ?? 0;
      const itemCantidad = cantidad || 1;

      // GUARDA (invariante de borde): toda linea de cocina nombra su producto. Sin nombre NI
      // producto_id el item seria MUDO -> la "linea vacia" del autoservicio. Se rechaza en la
      // puerta en vez de empujar un fantasma al buffer (no_silent_failures). Defensa en
      // profundidad: aunque un emisor viejo (p.ej. _inyectarPedidoInicial de delivery) lo intente.
      if (!itemNombre) {
        this._logError('comandero.ui.add_item.sin_nombre', { cuenta_id }, 'ui_add_item', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'El item necesita nombre o producto_id (linea sin nombre no permitida)', { field: 'nombre' });
      }

      if (!cached && precio === undefined) {
        this.logger.warn('comandero.producto.not_in_cache', { producto_id });
      }

      const canal      = this._detectarCanalCuenta(cuenta_id);

      // ── UN SOLO TASADOR (v3.6.0) ──────────────────────────────────────────────
      // El precio del item lo pone el SERVIDOR contra la carta del canal, con la misma función
      // pura que re-tasa el autoservicio (`_shared/pedido-tasador.js`): producto + Σ extras.
      // Antes había dos verdades — el panel mandaba un total y este backend lo pisaba con el
      // precio pelado de la carta en todo canal que no fuera mesa —, así que los extras se
      // caían en llevar/teléfono/glovo. Ahora el precio del cliente no manda: se re-tasa.
      const tasado = this._tasarItem({
        producto_id, cantidad: itemCantidad, tipo, pizza_izquierda, pizza_derecha,
        variaciones, canal, project_id
      });

      let itemPrecio;
      if (tasado) {
        itemPrecio = tasado.precio;
        for (const av of (tasado.avisos || [])) {
          this.logger.warn('comandero.tasado.aviso', { producto_id, ...av });
        }
      } else {
        // Degradación honesta (no_silent_failures): el producto no está en la carta del canal
        // (p.ej. 'pizza_algusto', 'porcion', un pack de tienda) o la carta aún no está cacheada.
        // Se mantiene el camino anterior —incluido el flag precio_canal_resuelto del delivery—
        // y se AVISA, para que un fallback no pase por precio bueno.
        this.logger.warn('comandero.tasado.fallback', { producto_id, canal, project_id, tipo: tipo || 'normal' });
        this.metrics?.increment('comandero.tasado.fallback');
        itemPrecio = (data.precio_canal_resuelto === true)
          ? precioBase
          : this._resolverPrecioCanal(producto_id, precioBase, canal, project_id);
      }

      const item_id = crypto.randomUUID();
      const item = {
        id:          item_id,
        producto_id,
        nombre:      itemNombre,
        precio:      itemPrecio,
        cantidad:    itemCantidad,
        categoria:   categoria || cached?.categoria || null,
        estaciones:  cached?.estaciones || null,
        variaciones: variaciones || [],
        notas:       notas || '',
        subtotal:    itemPrecio * itemCantidad,
        created_at:  new Date().toISOString()
      };

      if (tipo)              item.tipo              = tipo;
      if (pizza_izquierda)   item.pizza_izquierda   = pizza_izquierda;
      if (pizza_derecha)     item.pizza_derecha     = pizza_derecha;
      if (metaIngredientes)  item.ingredientes      = metaIngredientes;
      if (ingredientes_base) item.ingredientes_base = ingredientes_base;

      pedido.items.push(item);
      pedido.total = this._calcularTotal(pedido.items);

      this.metrics?.increment('comandero.item_agregado.total');

      const eventPayload = {
        cuenta_id,
        item_id,
        producto_id,
        nombre:           itemNombre,
        precio_unitario:  itemPrecio,
        precio_total:     item.subtotal,
        cantidad:         itemCantidad,
        pedido_total:     pedido.total,
        pedido_items:     pedido.items.reduce((s, i) => s + i.cantidad, 0)
      };
      if (tipo)              eventPayload.tipo              = tipo;
      if (pizza_izquierda)   eventPayload.pizza_izquierda   = pizza_izquierda;
      if (pizza_derecha)     eventPayload.pizza_derecha     = pizza_derecha;
      if (item.variaciones)  eventPayload.variaciones       = item.variaciones;
      if (item.ingredientes_base) eventPayload.ingredientes_base = item.ingredientes_base;
      if (metaIngredientes)  eventPayload.ingredientes      = metaIngredientes;

      await this._publicarEvento('comandero.item_agregado', eventPayload, data);
      this._guardarBuffers();

      this.logger.info('comandero.item.agregado', {
        cuenta_id, item_id, producto_id, precio: itemPrecio, cantidad: itemCantidad
      });

      return {
        status: 201,
        data: {
          item,
          pedido: { cuenta_id, items: pedido.items, total: pedido.total }
        }
      };
    } catch (err) {
      return this._handleHandlerError('comandero.ui.add_item.failed', err, 'ui_add_item');
    }
  }

  async handleRemoveItem(data) {
    try {
      const invalid = this._validateInput('comandero.remove-item', data);
      if (invalid) {
        this._logError('comandero.ui.remove_item.validation_failed', { details: invalid.error.details }, 'ui_remove_item', 'INVALID_INPUT');
        return invalid;
      }

      const { cuenta_id, item_id } = data;
      const pedido = this.pedidos.get(cuenta_id);
      if (!pedido) {
        this._logError('comandero.ui.remove_item.pedido_not_found', { cuenta_id }, 'ui_remove_item', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', {
          entity_type: 'pedido', entity_id: cuenta_id
        });
      }

      const itemIndex = pedido.items.findIndex(i => i.id === item_id);
      if (itemIndex === -1) {
        this._logError('comandero.ui.remove_item.item_not_found', { cuenta_id, item_id }, 'ui_remove_item', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Item no encontrado en pedido', {
          entity_type: 'item', entity_id: item_id
        });
      }

      const removedItem = pedido.items.splice(itemIndex, 1)[0];
      pedido.total = this._calcularTotal(pedido.items);

      this.metrics?.increment('comandero.item_eliminado.total');

      await this._publicarEvento('comandero.item_eliminado', {
        cuenta_id,
        item_id,
        producto_id:  removedItem.producto_id,
        cantidad:     removedItem.cantidad || 1,
        precio_total: removedItem.subtotal,
        pedido_total: pedido.total,
        pedido_items: pedido.items.reduce((s, i) => s + i.cantidad, 0)
      }, data);

      this._guardarBuffers();
      this.logger.info('comandero.item.eliminado', { cuenta_id, item_id });

      return {
        status: 200,
        data: { pedido: { cuenta_id, items: pedido.items, total: pedido.total } }
      };
    } catch (err) {
      return this._handleHandlerError('comandero.ui.remove_item.failed', err, 'ui_remove_item');
    }
  }

  async handleUpdateItem(data) {
    try {
      const invalid = this._validateInput('comandero.update-item', data);
      if (invalid) {
        this._logError('comandero.ui.update_item.validation_failed', { details: invalid.error.details }, 'ui_update_item', 'INVALID_INPUT');
        return invalid;
      }

      const { cuenta_id, item_id, cantidad, notas } = data;
      const pedido = this.pedidos.get(cuenta_id);
      if (!pedido) {
        this._logError('comandero.ui.update_item.pedido_not_found', { cuenta_id }, 'ui_update_item', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', {
          entity_type: 'pedido', entity_id: cuenta_id
        });
      }

      const item = pedido.items.find(i => i.id === item_id);
      if (!item) {
        this._logError('comandero.ui.update_item.item_not_found', { cuenta_id, item_id }, 'ui_update_item', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Item no encontrado en pedido', {
          entity_type: 'item', entity_id: item_id
        });
      }

      if (cantidad !== undefined) {
        if (cantidad <= 0) {
          // cantidad 0 o negativa → eliminar item
          const idx = pedido.items.indexOf(item);
          pedido.items.splice(idx, 1);
          pedido.total = this._calcularTotal(pedido.items);

          await this._publicarEvento('comandero.item_eliminado', {
            cuenta_id, item_id,
            producto_id:  item.producto_id,
            cantidad:     item.cantidad || 1,
            precio_total: item.subtotal,
            pedido_total: pedido.total,
            pedido_items: pedido.items.reduce((s, i) => s + i.cantidad, 0)
          }, data);

          this._guardarBuffers();
          return { status: 200, data: { pedido: { cuenta_id, items: pedido.items, total: pedido.total } } };
        }

        const cantidadAnterior = item.cantidad;
        const subtotalAnterior = item.subtotal;
        item.cantidad = cantidad;
        item.subtotal = item.precio * cantidad;
        pedido.total  = this._calcularTotal(pedido.items);

        await this._publicarEvento('comandero.item_actualizado', {
          cuenta_id, item_id,
          producto_id:        item.producto_id,
          nombre:             item.nombre,
          cantidad_anterior:  cantidadAnterior,
          cantidad_nueva:     cantidad,
          diff_cantidad:      cantidad - cantidadAnterior,
          diff_precio:        item.subtotal - subtotalAnterior,
          pedido_total:       pedido.total,
          pedido_items:       pedido.items.reduce((s, i) => s + i.cantidad, 0)
        }, data);

        this._guardarBuffers();
        this.logger.info('comandero.item.actualizado', { cuenta_id, item_id, cantidad, notas });

        return {
          status: 200,
          data: { item, pedido: { cuenta_id, items: pedido.items, total: pedido.total } }
        };
      }

      if (notas !== undefined) item.notas = notas;
      this._guardarBuffers();
      this.logger.info('comandero.item.actualizado', { cuenta_id, item_id, cantidad, notas });

      return {
        status: 200,
        data: { item, pedido: { cuenta_id, items: pedido.items, total: pedido.total } }
      };
    } catch (err) {
      return this._handleHandlerError('comandero.ui.update_item.failed', err, 'ui_update_item');
    }
  }

  async handleEnviarCocina(data) {
    try {
      const invalid = this._validateInput('comandero.send-kitchen', data);
      if (invalid) {
        this._logError('comandero.ui.send_kitchen.validation_failed', { details: invalid.error.details }, 'ui_send_kitchen', 'INVALID_INPUT');
        return invalid;
      }

      const { cuenta_id, project_id } = data;
      const pedido = this.pedidos.get(cuenta_id);
      if (!pedido || pedido.items.length === 0) {
        this._logError('comandero.ui.send_kitchen.empty', { cuenta_id }, 'ui_send_kitchen', 'CONFLICT_STATE');
        return this._errorResponse(409, 'CONFLICT_STATE', 'No hay items en el pedido para enviar', {
          cuenta_id
        });
      }

      const itemsParaEnviar = pedido.items.filter(i => !i.enviado);
      if (itemsParaEnviar.length === 0) {
        this._logError('comandero.ui.send_kitchen.all_sent', { cuenta_id }, 'ui_send_kitchen', 'CONFLICT_STATE');
        return this._errorResponse(409, 'CONFLICT_STATE', 'Todos los items ya fueron enviados a cocina', {
          cuenta_id
        });
      }

      const pedido_id = `ped_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      const ahora     = new Date().toISOString();

      for (const item of itemsParaEnviar) {
        item.enviado    = true;
        item.enviado_at = ahora;
        item.pedido_id  = pedido_id;
      }

      const totalEnviado = this._calcularTotal(itemsParaEnviar);
      this.metrics?.increment('comandero.enviado.total');

      await this._publicarEvento('comandero.enviar_cocina', {
        cuenta_id,
        pedido_id,
        project_id,
        ref_display:     this.refDisplayCache.get(cuenta_id) || null,
        items:           itemsParaEnviar,
        total:           totalEnviado,
        notas_generales: pedido.notas,
        created_at:      ahora
      }, data);

      this._guardarBuffers();

      this.logger.info('comandero.enviado_cocina', {
        cuenta_id, pedido_id, items_enviados: itemsParaEnviar.length, total_enviado: totalEnviado
      });

      return {
        status: 200,
        data: {
          cuenta_id,
          pedido_id,
          items_enviados: itemsParaEnviar.length,
          total_enviado:  totalEnviado,
          pedido:         { cuenta_id, items: pedido.items, total: pedido.total }
        }
      };
    } catch (err) {
      return this._handleHandlerError('comandero.ui.send_kitchen.failed', err, 'ui_send_kitchen');
    }
  }

  async handleListBuffers() {
    try {
      const buffers = [];
      for (const [cuenta_id, pedido] of this.pedidos.entries()) {
        const pendientes = pedido.items.filter(i => !i.enviado);
        if (pendientes.length === 0) continue;
        buffers.push({
          cuenta_id,
          total:       this._calcularTotal(pendientes),
          items_count: pendientes.reduce((s, i) => s + i.cantidad, 0),
          items: pendientes.map(i => ({
            item_id:     i.id,
            producto_id: i.producto_id,
            nombre:      i.nombre,
            cantidad:    i.cantidad,
            precio:      i.precio,
            subtotal:    i.subtotal
          }))
        });
      }
      return { status: 200, data: { buffers } };
    } catch (err) {
      return this._handleHandlerError('comandero.ui.buffers.failed', err, 'ui_buffers');
    }
  }

  async handleHealthCheck() {
    try {
      return {
        status: 200,
        data: {
          status:             'healthy',
          module:             this.name,
          version:            this.version,
          pedidos_activos:    this.pedidos.size,
          productos_en_cache: this._totalProductosCache(),
          proyectos_en_cache: this.productosCache.size,
          timestamp:          new Date().toISOString()
        }
      };
    } catch (err) {
      return this._handleHandlerError('comandero.ui.health.failed', err, 'ui_health');
    }
  }

  // ==========================================
  // Persistencia transitoria del buffer
  // ==========================================

  async _restaurarBuffers() {
    const datos = await this._readJsonSafe(this._bufferFile, 'restaurar_buffers');
    if (!datos?.buffers) return;

    let restaurados = 0;
    for (const [cuenta_id, buffer] of Object.entries(datos.buffers)) {
      if (!buffer.items || buffer.items.length === 0) continue;
      this.pedidos.set(cuenta_id, {
        items: buffer.items,
        notas: buffer.notas || '',
        total: this._calcularTotal(buffer.items)
      });
      restaurados++;
    }

    if (restaurados > 0) {
      this.logger.info('comandero.buffers_restaurados', {
        buffers_restaurados: restaurados,
        items_total: Array.from(this.pedidos.values()).reduce((s, p) => s + p.items.length, 0)
      });
    }
  }

  _guardarBuffers() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(async () => {
      try {
        const buffers = {};
        for (const [cuenta_id, pedido] of this.pedidos.entries()) {
          const itemsNoEnviados = pedido.items.filter(i => !i.enviado);
          if (itemsNoEnviados.length > 0) {
            buffers[cuenta_id] = {
              items: itemsNoEnviados,
              notas: pedido.notas,
              total: this._calcularTotal(itemsNoEnviados)
            };
          }
        }

        await fs.mkdir(path.dirname(this._bufferFile), { recursive: true });
        await this._atomicWriteFile(
          this._bufferFile,
          JSON.stringify({ buffers, updated_at: new Date().toISOString() }, null, 2)
        );
      } catch (err) {
        this.logger.warn('comandero.guardar_buffers.error', { error: err.message });
        this.metrics?.increment('comandero.errors', { kind: 'guardar_buffers', code: 'UNKNOWN_ERROR' });
      }
    }, SAVE_DEBOUNCE_MS);
  }

  // ==========================================
  // Helpers POC2
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details && typeof details === 'object') error.details = details;
    return { status, error };
  }

  _handleHandlerError(logEvent, err, kind) {
    const code   = err._code || this._classifyHandlerError(err);
    const status = code === 'INVALID_INPUT'           ? 400 :
                   code === 'RESOURCE_NOT_FOUND'      ? 404 :
                   code === 'PERMISSION_DENIED'       ? 403 :
                   code === 'CONFLICT_STATE'          ? 409 :
                   code === 'ALREADY_EXISTS'          ? 409 :
                   code === 'UPSTREAM_UNREACHABLE'  ? 503 :
                   code === 'UPSTREAM_TIMEOUT'                 ? 504 :
                   code === 'UNKNOWN_ERROR'        ? 500 : 500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code, kind });
    this.metrics?.increment('comandero.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg  = (err?.message || '').toLowerCase();
    const ecod = err?.code || '';
    if (ecod === 'ENOENT' || msg.includes('not found') || msg.includes('no encontrad')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('validation')) return 'INVALID_INPUT';
    if (msg.includes('conflict') || msg.includes('already')) return 'CONFLICT_STATE';
    if (ecod && ecod.startsWith('E')) return 'UNKNOWN_ERROR';
    return 'UNKNOWN_ERROR';
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    if (!this.eventBus?.publish) return;
    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      timestamp:      new Date().toISOString(),
      ...payload,
      project_id:     payload?.project_id || sourcePayload?.project_id || DEFAULT_PROJECT_ID
    };
    try {
      await this.eventBus.publish(name, enriched);
    } catch (err) {
      this.logger.error('comandero.publish_error', { event: name, error: err.message });
      this.metrics?.increment('comandero.errors', { kind: 'publish', code: 'UNKNOWN_ERROR' });
    }
  }

  // 5o helper auxiliar — escritura atomica .tmp + rename
  async _atomicWriteFile(absPath, contents) {
    const tmpPath = absPath + '.tmp';
    await fs.writeFile(tmpPath, contents, 'utf-8');
    await fs.rename(tmpPath, absPath);
  }

  // 6o helper — lectura JSON con log+metric en error (no swallow)
  async _readJsonSafe(filePath, kind) {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('comandero.read_error', { file: filePath, kind, error: err.message });
        this.metrics?.increment('comandero.errors', { kind: kind || 'read_json', code: this._classifyHandlerError(err) });
      }
      return null;
    }
  }

  _logError(logEvent, fields, kind, code) {
    this.logger.error(logEvent, { ...fields, code, kind });
    this.metrics?.increment('comandero.errors', { kind, code });
  }

  _unwrap(event) { return event?.data || event?.payload || event || {}; }

  // ==========================================
  // Internals — UN SOLO TASADOR (v3.6.0)
  // ==========================================

  /**
   * Deriva el catálogo de extras DE LA CARTA (dueño único del delta). Recorre las opciones
   * ELEGIR_VARIOS de cada producto y se queda con {id, nombre, precio_extra}: exactamente lo que
   * el panel de variaciones le enseña al camarero, así el precio tasado es el que vio en pantalla.
   * Los valores del grupo QUITAR no entran: quitar es gratis.
   */
  _extrasDeCarta(productos) {
    const porId = new Map();
    for (const p of (productos || [])) {
      for (const o of (p?.opciones || [])) {
        if (o?.modo !== 'ELEGIR_VARIOS') continue;
        for (const v of (o?.valores || [])) {
          if (!v?.id) continue;
          const id = String(v.id);
          if (porId.has(id)) continue;
          porId.set(id, {
            id,
            nombre: v.etiqueta || id,
            precio_extra: (Number(v.delta_precio_centimos) || 0) / 100
          });
        }
      }
    }
    return Array.from(porId.values());
  }

  _clave(texto) {
    return String(texto ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /**
   * Puente legacy: VariacionesPanel y MitadMitadPanel mandan los extras por NOMBRE ("Calabacín",
   * "Jamón de york"), no por id. Se resuelven aquí contra la carta del canal; un id explícito
   * gana siempre. Sin esta resolución el extra se cae del precio — que es justo el agujero que
   * esto cierra.
   */
  _idsDeExtras(anadir, catalogo) {
    if (!Array.isArray(anadir)) return [];
    const porNombre = new Map();
    for (const e of catalogo) porNombre.set(this._clave(e.nombre), e.id);
    const ids = [];
    for (const raw of anadir) {
      if (raw == null) continue;
      const id  = (typeof raw === 'object') ? raw.id : null;
      const nom = (typeof raw === 'object') ? (raw.nombre || raw.etiqueta) : raw;
      if (id != null) { ids.push(String(id)); continue; }
      const resuelto = porNombre.get(this._clave(nom));
      if (resuelto) ids.push(resuelto);   // si no resuelve, el tasador lo reporta como aviso
    }
    return ids;
  }

  /**
   * UN SOLO TASADOR. Tasado server-side del item contra la carta del CANAL con la función pura
   * `tasarPedido` (la misma del autoservicio): producto + Σ extras; mitad y mitad = max(base) +
   * extras de cada mitad. El dinero va en céntimos dentro del tasador y sale en EUROS porque el
   * buffer, la cuenta y el cobro están en euros.
   *
   * Devuelve { precio, avisos } o null. null = no se puede tasar (sin carta cacheada, producto
   * fuera de la carta): el llamante cae al camino anterior y AVISA — nunca se inventa un precio.
   */
  _tasarItem({ producto_id, cantidad, tipo, pizza_izquierda, pizza_derecha, variaciones, canal, project_id }) {
    const cartaId = this._resolverCartaIdParaCanal(canal, project_id);
    if (!cartaId) return null;
    const carta = this.cartasCompletas.get(cartaId);
    if (!carta) return null;

    const catalogo  = carta.ingredientes_catalogo;
    const descriptor = {
      producto_id,
      cantidad: Number.isInteger(cantidad) && cantidad > 0 ? cantidad : 1,
      tipo: (tipo === 'mitad_mitad' || tipo === 'al_gusto') ? tipo : 'normal'
    };

    if (descriptor.tipo === 'mitad_mitad') {
      if (!pizza_izquierda?.id || !pizza_derecha?.id) return null;
      descriptor.pizza_izquierda = {
        id: String(pizza_izquierda.id),
        anadir: this._idsDeExtras(pizza_izquierda.anadir, catalogo)
      };
      descriptor.pizza_derecha = {
        id: String(pizza_derecha.id),
        anadir: this._idsDeExtras(pizza_derecha.anadir, catalogo)
      };
    } else {
      const v = (variaciones && !Array.isArray(variaciones)) ? variaciones : {};
      descriptor.anadir = this._idsDeExtras(v.ingredientes_anadir, catalogo);
      descriptor.quitar = v.ingredientes_quitar;
    }

    const r = tasarPedido([descriptor], carta);
    if (!r.ok || r.items.length !== 1) return null;
    const centimos = r.items[0].precio_unitario_centimos;
    if (!Number.isInteger(centimos)) return null;
    return { precio: centimos / 100, avisos: r.avisos };
  }

  // ==========================================
  // Internals — calculo + canal + precio
  // ==========================================

  _calcularTotal(items) {
    return items.reduce((total, item) => total + item.subtotal, 0);
  }

  _detectarCanalCuenta(cuenta_id) {
    if (!cuenta_id) return 'mesa';
    const PREFIJOS = {
      'mesa_': 'mesa', 'M_': 'mesa',
      'llevar_': 'llevar', 'L_': 'llevar',
      'telefono_': 'telefono', 'tel_': 'telefono', 'T_': 'telefono',
      'whatsapp_': 'whatsapp', 'W_': 'whatsapp',
      'glovo_': 'glovo', 'G_': 'glovo',
      'llevadoo_': 'llevadoo', 'D_': 'llevadoo'
    };
    for (const [prefix, canal] of Object.entries(PREFIJOS)) {
      if (cuenta_id.startsWith(prefix)) return canal;
    }
    return 'mesa';
  }

  /**
   * Resuelve precio por canal con cascada (sin acceso directo a otros modulos):
   *   1. Cache local de tarifas (hidratado por tarifas.config.actualizada) →
   *      mapea canal → carta_id; si no hay override, cae a general.
   *   2. cartasProductosCache (hidratado por carta.actualizada) → precio del producto en esa carta.
   *   3. precioBase pasado en la request o productosCache → fallback.
   */
  _resolverCartaIdParaCanal(canal, projectId) {
    const pid = projectId || DEFAULT_PROJECT_ID;
    const cfg = this.tarifasConfigPorProject.get(pid);
    if (!cfg) return null;
    return cfg.canales?.[canal] || cfg.general || null;
  }

  _resolverPrecioCanal(producto_id, precioBase, canal, projectId) {
    if (!canal || canal === 'mesa') return precioBase;

    const cartaId = this._resolverCartaIdParaCanal(canal, projectId);
    if (!cartaId) return precioBase;

    const cartaCache = this.cartasProductosCache.get(cartaId);
    if (!cartaCache) return precioBase;

    const producto = cartaCache.get(producto_id);
    return producto?.precio !== undefined ? producto.precio : precioBase;
  }
}

module.exports = ComanderoModule;

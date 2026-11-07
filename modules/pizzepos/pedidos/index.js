/**
 * Modulo Pedidos v3.1.0 — POC2 canonico.
 *
 * Gestion completa de pedidos pizzepos. Dos tipos:
 *   - tipo: 'pos'    — flujo clasico POS pizzeria con cuenta_id (cuentas-canales),
 *                      items en pasos separados, enviado a cocina, etc.
 *   - tipo: 'tienda' — flujo plano vertical tienda PWA: cuenta_id null, todos los
 *                      items de una, cliente_nombre (ANCLA de recogida que el cliente
 *                      introduce), estado pendiente_recogida -> recogido_y_cobrado / expirado.
 *
 * Maps internos:
 *   - this.pedidos = Map<pedido_id, pedido>             (todos los tipos)
 *   - this.pedidosPorCuenta = Map<cuenta_id, Set<pedido_id>>   (solo tipo pos)
 *   - this.pedidosPorProject = Map<project_slug, Set<pedido_id>>  (solo tipo tienda)
 *
 * Recibe POS del comandero (bridge `comandero.enviar_cocina`) o se crea via UI handler.
 * Recibe tienda via tool pedido.crear-tienda (auto-wire bus).
 *
 * Persiste en memoria con restauracion desde cuentas_activas.json al arrancar
 * (delegacion a persistencia-comandero; aplica solo a tipo pos en v3.1.0).
 *
 * Cache de productos invalidada por catalogo.actualizado / producto.{creado,actualizado}.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const BaseModule = require('../../_shared/base-module');
const LectorServicio = require('../../_shared/lector-servicio');
const { estadoServicio, mensajeCierre } = require('../../_shared/horario-servicio');
const { normalizarUbicacion, enlaceMapa } = require('../../_shared/ubicacion-entrega');

// Cuántos pedidos RECOGIDOS convierten a un cliente en habitual. A partir de ahí su
// pedido entra directo a cocina: ya le hemos visto la cara y no se le hace esperar
// una confirmación. Por debajo, el pedido espera su "sí" (o el botón de barra).
// Se cuenta lo ENTREGADO, no lo pedido: tres pedidos que se quedaron en el aire no
// hacen de nadie un cliente de confianza.
const PEDIDOS_HABITUAL = 3;

class PedidosModule extends BaseModule {
  constructor() {
    super();
    this.name = 'pedidos';
    this.version = require('./module.json').version;   // fuente única (antes 3.2.0 clavado divergía del manifest)

    this.pedidos = new Map();
    this.pedidosPorCuenta = new Map();
    this.pedidosPorProject = new Map();
    this.productosCache = new Map();
    // Ficha mínima del cliente: identificador de WhatsApp + nombre + cuántos pedidos
    // ha RECOGIDO. Sin gustos y sin teléfono inventado: WhatsApp manda un LID, no un móvil.
    this.fichasClientes = new Map();
    this.fichasCargadas = new Set();
    this.reglasConfirmacion = new Map();
    this.basePathCache = new Map();
    this.uiHandler = null;
    this.config = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;
    this.moduleRegistry = core.moduleRegistry;   // para crear cuentas vía cuentas.handleCreateCuenta
    this.config = core.config || null;

    // Puerta única de la config de servicio (horario + interruptor). Un cierre puesto
    // por el dueño tiene que morder en segundos: caché corta, invalidada por
    // `servicio.cambiado`. Sin lectura no se frena nada (degradación honesta).
    this.servicio = new LectorServicio({
      eventBus: core.eventBus,
      logger: core.logger,
      metrics: core.metrics,
      ttlMs: 15000,
      timeoutMs: 4000
    });

    this.logger.info('module.loading', { module: this.name, version: this.version });

    // tools.contract v1.2: el loader auto-wirea tools[] del module.json a uiHandler.
    await this._restaurarDesdeArchivo();

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    // El loader desregistra uiHandler entries automaticamente.
    this.pedidos.clear();
    this.pedidosPorCuenta.clear();
    this.pedidosPorProject.clear();
    this.productosCache.clear();
    this.fichasClientes.clear();
    this.fichasCargadas.clear();
    this.reglasConfirmacion.clear();
    this.basePathCache.clear();

    this.logger.info('module.unloaded', { module: this.name });
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
    if (/not found|no encontrado/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/conflict|estado|already|ya esta/i.test(msg)) return { status: 409, code: 'CONFLICT_STATE' };
    return { status: 500, code: 'UNKNOWN_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'handler') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('pedidos.errors', { code, kind });
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
      sourcePayload?.data?.project_id ??
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

  async _readJsonSafe(filePath) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      this.logger?.warn?.('pedidos.read_json.error', {
        file: filePath,
        error_code: err.code || 'PARSE_ERROR',
        error_message: err.message
      });
      return null;
    }
  }

  // ==========================================
  // Bus Subscribers (auto-wired desde manifest)
  // ==========================================

  async onVariacionValidada(event) {
    const data = event?.data || event?.payload || event;
    this.logger.info('pedidos.variacion.validada.received', {
      producto_id: data?.producto_id,
      precio_total: data?.precio_total,
      correlation_id: event?.metadata?.correlationId
    });
  }

  async onVariacionRechazada(event) {
    const data = event?.data || event?.payload || event;
    this.logger.warn('pedidos.variacion.rechazada.received', {
      producto_id: data?.producto_id,
      motivo: data?.motivo,
      correlation_id: event?.metadata?.correlationId
    });
  }

  // El interruptor de servicio cambió (lo tocó el dueño o un panel): se suelta la caché
  // para que el siguiente pedido vea el estado nuevo sin esperar al TTL.
  async onServicioCambiado(event) {
    const data = event?.data || event?.payload || event;
    this.servicio?.invalidar(data?.project_slug || data?.project_id || null);
    this.logger?.debug?.('pedidos.servicio.cache_invalidada', {
      project: data?.project_slug || data?.project_id || null
    });
  }

  async onCuentaCreada(event) {
    const data = event?.data || event?.payload || event;
    const { cuenta_id } = data || {};
    if (!cuenta_id) return;
    if (!this.pedidosPorCuenta.has(cuenta_id)) {
      this.pedidosPorCuenta.set(cuenta_id, new Set());
    }
  }

  // Capa de pago anticipado (opcional): el líder de pago confirmó el pago online de un
  // pedido tienda → marcar pagado y liberarlo. Idempotente (el webhook puede repetir).
  async onPagoConfirmado(event) {
    const d = event?.data || event?.payload || event;
    const pedido_id = d?.pedido_id;
    if (!pedido_id) return;
    let pedido = this.pedidos.get(pedido_id);
    if (!pedido) {
      // FRENO 4 (el huerfano): el pago es ASINCRONO — el cliente paga minutos despues y el webhook
      // llega despues. Si el proceso reinicio en esa ventana (p.ej. un DEPLOY), el pedido de tienda
      // (que vive en memoria y NO se restaura) ya no esta. El dinero SI entro en la pasarela: no se
      // pierde en silencio. Se re-crea MINIMO desde la metadata de la sesion (pedido_id + project_id
      // + importe, lo unico que la pasarela devuelve) y se emite pedido.pagado igual, marcado
      // recreado. Todo por evento, sin persistir nada.
      pedido = {
        id: pedido_id,
        tipo: 'tienda',
        cuenta_id: null,
        canal: null,
        canal_origen: d.canal_origen || 'pasarela',
        project_slug: d.project_slug || d.project_id || null,
        project_id: d.project_id || null,
        items: [],
        estado: 'pagado',
        total_centimos: Number.isInteger(d.monto_centimos) ? d.monto_centimos : null,
        total: Number.isInteger(d.monto_centimos) ? d.monto_centimos / 100 : null,
        cliente_nombre: d.cliente_nombre || null,
        cliente_telefono: d.cliente_telefono || null,   // transitorio: solo para avisar al cliente
        metodo_pago: 'tarjeta',
        recreado_desde_pago: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.pedidos.set(pedido_id, pedido);
      if (pedido.project_slug) {
        if (!this.pedidosPorProject.has(pedido.project_slug)) this.pedidosPorProject.set(pedido.project_slug, new Set());
        this.pedidosPorProject.get(pedido.project_slug).add(pedido_id);
      }
      this.metrics?.increment?.('pedidos.tienda.recreado_desde_pago', { project: String(pedido.project_slug || 'desconocido') });
      this.logger?.warn('pedidos.pago_confirmado.recreado', {
        pedido_id, project_slug: pedido.project_slug, monto_centimos: pedido.total_centimos
      });
    }
    if (pedido.pago && pedido.pago.estado === 'pagado') return;   // idempotencia
    pedido.pago = {
      estado: 'pagado',
      session_id: d.session_id || null,
      pasarela: d.pasarela || null,
      monto_centimos: (d.monto_centimos !== undefined ? d.monto_centimos : null),
      confirmado_at: new Date().toISOString()
    };
    pedido.updated_at = new Date().toISOString();
    this.metrics?.increment?.('pedidos.pagado.total', { pasarela: d.pasarela || 'desconocida' });
    this.logger?.info('pedidos.pagado', { pedido_id, pasarela: d.pasarela });
    await this._publicarEvento('pedido.pagado', {
      pedido_id, project_id: pedido.project_id || d.project_id || null,
      project_slug: pedido.project_slug || d.project_slug || null,   // el consumidor necesita SABER A QUIEN avisar
      session_id: d.session_id || null, total: pedido.total,
      cliente_nombre: pedido.cliente_nombre || null,
      cliente_telefono: pedido.cliente_telefono || null,   // transitorio: solo para avisar al cliente
      recreado: !!pedido.recreado_desde_pago
    }, d);
  }

  async onCajaCerrada(event) {
    const before = this.pedidos.size;
    // Solo limpiar pedidos tipo='pos' — los pedidos tipo='tienda' NO estan atados
    // al ciclo de caja del POS, viven con su propio expira_at.
    for (const [id, p] of this.pedidos) {
      if (p.tipo !== 'tienda') this.pedidos.delete(id);
    }
    this.pedidosPorCuenta.clear();
    this.metrics?.gauge?.('pedidos.activos.count', this.pedidos.size);
    this.logger.info('pedidos.reset.caja_cerrada', {
      pedidos_pos_limpiados: before - this.pedidos.size,
      pedidos_tienda_preservados: this.pedidos.size,
      correlation_id: event?.metadata?.correlationId
    });
  }

  async onDiaIniciado(event) {
    const before = this.pedidos.size;
    // Solo limpiar pedidos tipo='pos' (idem onCajaCerrada).
    for (const [id, p] of this.pedidos) {
      if (p.tipo !== 'tienda') this.pedidos.delete(id);
    }
    this.pedidosPorCuenta.clear();
    this.metrics?.gauge?.('pedidos.activos.count', this.pedidos.size);
    this.logger.info('pedidos.reset.dia_iniciado', {
      pedidos_pos_limpiados: before - this.pedidos.size,
      pedidos_tienda_preservados: this.pedidos.size,
      correlation_id: event?.metadata?.correlationId
    });
  }

  async onComanderoEnviarCocina(event) {
    try {
      const data = event?.data || event?.payload || event;
      const correlationId = event?.metadata?.correlationId;
      const { cuenta_id, pedido_id: comandero_pedido_id, items, total, notas_generales, created_at, project_id, ref_display } = data || {};

      if (!cuenta_id || !items || items.length === 0) {
        this.logger.warn('pedidos.bridge.datos_incompletos', { cuenta_id, correlation_id: correlationId });
        return;
      }

      this.logger.info('pedidos.bridge.recibido', {
        cuenta_id, items_count: items.length, total,
        correlation_id: correlationId
      });

      const pedido_id = comandero_pedido_id || crypto.randomUUID();
      const canal = this._detectarCanal(cuenta_id);

      // IDENTIDAD = id de origen. Si el pedido YA existe (tienda lo crea antes de la
      // cuenta), este evento COMPLETA su envío a cocina: no se crea un gemelo. Antes
      // nacía un pedido_2 por cada envío, y persistencia apilaba los dos en la cuenta
      // (4 apuntes donde había 2 items, y el gemelo con project_id 'default').
      const existente = this.pedidos.get(pedido_id);
      if (existente) {
        const originales = existente.items || [];
        existente.cuenta_id  = cuenta_id;
        existente.canal      = existente.canal || canal;
        existente.estado     = 'en_cocina';
        existente.project_id = existente.project_id || project_id || null;
        existente.ref_display = ref_display || existente.ref_display || null;
        // Los items de cocina son la verdad viva (nombre, precio, estructura); el shape
        // de origen (descripcion + centimos) se conserva para no dejar líneas mudas.
        existente.items = (items || []).map((item, idx) => {
          const built = this._buildPedidoItem(item, 'en_cocina');
          const orig  = originales[idx] || {};
          if (orig.descripcion) built.descripcion = orig.descripcion;
          if (Number.isInteger(orig.precio_unitario_centimos)) built.precio_unitario_centimos = orig.precio_unitario_centimos;
          return built;
        });
        existente.subtotal = total || existente.total || 0;
        existente.total    = total || existente.total || 0;
        existente.notas_generales   = existente.notas_generales || notas_generales || null;
        existente.enviado_cocina_at = new Date().toISOString();
        existente.updated_at        = existente.enviado_cocina_at;

        if (!this.pedidosPorCuenta.has(cuenta_id)) {
          this.pedidosPorCuenta.set(cuenta_id, new Set());
        }
        this.pedidosPorCuenta.get(cuenta_id).add(pedido_id);

        this.metrics?.increment?.('pedidos.enviado_cocina.total');
        this.metrics?.increment?.('pedidos.bridge.envio_completado.total');
        // Un pedido = un pedido.creado: el de tienda sale después, con cuenta_id.
        // Aquí solo se cierra el círculo de cocina.
        await this._publishEnviadoCocina(existente, { correlation_id: correlationId });

        this.logger.info('pedidos.bridge.envio_completado', {
          pedido_id, cuenta_id, items_count: existente.items.length,
          total: existente.total, correlation_id: correlationId
        });
        return;
      }

      const pedido = {
        id: pedido_id,
        cuenta_id,
        canal,
        ref_display: ref_display || null,
        project_id: project_id || null,
        items: items.map(item => this._buildPedidoItem(item, 'en_cocina')),
        estado: 'en_cocina',
        subtotal: total || 0,
        total: total || 0,
        notas_generales: notas_generales || null,
        created_at: created_at || new Date().toISOString(),
        enviado_cocina_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      this.pedidos.set(pedido_id, pedido);
      if (!this.pedidosPorCuenta.has(cuenta_id)) {
        this.pedidosPorCuenta.set(cuenta_id, new Set());
      }
      this.pedidosPorCuenta.get(cuenta_id).add(pedido_id);

      this.metrics?.increment?.('pedidos.creado.total');
      this.metrics?.increment?.('pedidos.enviado_cocina.total');
      this.metrics?.gauge?.('pedidos.activos.count', this.pedidos.size);

      await this._publishPedidoCreado(pedido, { correlation_id: correlationId });
      await this._publishEnviadoCocina(pedido, { correlation_id: correlationId });

      this.logger.info('pedidos.bridge.pedido_formal_creado', {
        pedido_id, cuenta_id,
        items_count: pedido.items.length,
        total: pedido.total,
        correlation_id: correlationId
      });
    } catch (err) {
      this._handleHandlerError('pedidos.bridge.error', err, 'subscribe');
    }
  }

  async onCatalogoActualizado(event) {
    const data = event?.data || event?.payload || event;
    const productos = data?.productos || [];
    for (const producto of productos) {
      if (producto.id && producto.precio !== undefined) {
        this.productosCache.set(producto.id, {
          nombre: producto.nombre || producto.id,
          precio: producto.precio,
          categoria: producto.categoria,
          estaciones: producto.estaciones || null,
          // La FICHA del plato (lo que lleva) viaja con el catálogo: es lo que la cocina
          // pinta bajo el nombre. Se guardan los NOMBRES porque es lo que se lee en la
          // pantalla; el comandero manual hace exactamente lo mismo.
          ingredientes_base: this._nombresIngredientes(producto)
        });
      }
    }
    this.logger.info('pedidos.catalogo.synced', {
      productos_en_cache: this.productosCache.size
    });
  }

  async onProductoActualizado(event) {
    const data = event?.data || event?.payload || event;
    const { id, nombre, precio, categoria, estaciones } = data || {};
    if (id && precio !== undefined) {
      const previo = this.productosCache.get(id) || {};
      this.productosCache.set(id, {
        nombre: nombre || id,
        precio,
        categoria,
        estaciones: estaciones || previo.estaciones || null,
        ingredientes_base: this._nombresIngredientes(data) || previo.ingredientes_base || null
      });
      this.logger.info('pedidos.producto.cache_updated', { producto_id: id, precio });
    }
  }

  // Nombres de los ingredientes de un producto de la carta, tolerando las dos claves
  // (ingredientes_base / ingredientes) y los dos shapes (string u objeto).
  _nombresIngredientes(producto) {
    const lista = (Array.isArray(producto?.ingredientes_base) && producto.ingredientes_base.length)
      ? producto.ingredientes_base
      : (Array.isArray(producto?.ingredientes) ? producto.ingredientes : []);
    const nombres = lista.map(i => (typeof i === 'string' ? i : i?.nombre)).filter(Boolean);
    return nombres.length ? nombres : null;
  }

  _buildPedidoItem(item, defaultEstado = 'pendiente') {
    const precio = item.precio || item.precio_unitario || 0;
    const cantidad = item.cantidad || 1;
    const built = {
      item_id: item.id || item.item_id || crypto.randomUUID(),
      producto_id: item.producto_id,
      nombre: item.nombre,
      categoria: item.categoria || null,
      estaciones: item.estaciones || null,
      cantidad,
      precio_unitario: precio,
      precio_total: item.subtotal || item.precio_total || precio * cantidad,
      variaciones: item.variaciones || null,
      notas: item.notas || null,
      estado: defaultEstado,
      created_at: item.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (item.tipo) built.tipo = item.tipo;
    if (item.pizza_izquierda) built.pizza_izquierda = item.pizza_izquierda;
    if (item.pizza_derecha) built.pizza_derecha = item.pizza_derecha;
    if (item.ingredientes) built.ingredientes = item.ingredientes;
    if (item.ingredientes_base) built.ingredientes_base = item.ingredientes_base;
    return built;
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleCreatePedido(data) {
    try {
      const start_time = Date.now();
      const { cuenta_id, project_id, notas_generales } = data || {};

      if (!cuenta_id) {
        this.metrics?.increment?.('pedidos.errors', { code: 'INVALID_INPUT', kind: 'create' });
        this.logger.warn('pedidos.create.missing', { field: 'cuenta_id' });
        return this._errorResponse(400, 'INVALID_INPUT', 'cuenta_id es requerido', { field: 'cuenta_id' });
      }

      const pedido_id = crypto.randomUUID();
      const canal = this._detectarCanal(cuenta_id);

      const pedido = {
        id: pedido_id,
        cuenta_id,
        canal,
        project_id: project_id || null,
        items: [],
        estado: 'borrador',
        subtotal: 0,
        total: 0,
        notas_generales: notas_generales || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      this.pedidos.set(pedido_id, pedido);
      if (!this.pedidosPorCuenta.has(cuenta_id)) {
        this.pedidosPorCuenta.set(cuenta_id, new Set());
      }
      this.pedidosPorCuenta.get(cuenta_id).add(pedido_id);

      this.metrics?.increment?.('pedidos.creado.total');
      this.metrics?.gauge?.('pedidos.activos.count', this.pedidos.size);
      this.metrics?.timing?.('pedidos.create.duration', Date.now() - start_time);

      await this._publishPedidoCreado(pedido, data);

      this.logger.info('pedidos.creado', {
        pedido_id, cuenta_id, duration: Date.now() - start_time
      });

      return { status: 201, data: pedido };
    } catch (err) {
      return this._handleHandlerError('pedidos.create.error', err);
    }
  }

  // ==========================================
  // Handlers Tienda PWA (tipo='tienda')
  // ==========================================

  // Estado de servicio del proyecto (horario + interruptor) ya resuelto para AHORA.
  // Devuelve null cuando no se pudo leer: sin lectura no se frena nada.
  async _estadoServicio(project_slug, { recargar = false } = {}) {
    if (!this.servicio) return null;
    let cfg;
    try {
      cfg = await this.servicio.leer(project_slug, { recargar });
    } catch (err) {
      this.logger?.warn?.('pedidos.servicio.lectura_error', { project_slug, error: err?.message });
      return null;
    }
    if (cfg === null) return null;
    return estadoServicio(cfg);
  }

  // Tool pedido.servicio.estado — ¿se puede pedir ahora? (la PWA y el bot preguntan aquí)
  async handleEstadoServicio(data) {
    try {
      const project_slug = data?.project_slug || data?.project_id;
      if (!project_slug || typeof project_slug !== 'string') {
        return this._errorResponse(400, 'INVALID_INPUT', 'project_slug es requerido', { field: 'project_slug' });
      }
      const estado = await this._estadoServicio(project_slug, { recargar: data?.recargar === true });
      if (!estado) {
        return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'no se pudo leer la config de servicio del proyecto', { project_slug });
      }
      const abiertos = this.pedidosPorProject.get(project_slug);
      const pendientes = abiertos ? [...abiertos].map(id => this.pedidos.get(id)).filter(p => p && p.estado === 'pendiente_recogida').length : 0;
      return {
        status: 200,
        data: {
          ...estado,
          project_slug,
          mensaje: mensajeCierre(estado),
          pedidos_pendientes: pendientes
        }
      };
    } catch (err) {
      return this._handleHandlerError('pedidos.servicio.estado.error', err);
    }
  }

  // Tool pedido.servicio.set — la tecla del dueño: cerrar (saturación) y abrir cuando amaine.
  // `hasta` con fecha ISO = se reabre solo. Sin `hasta` = cerrado hasta que lo abra él.
  async handleFijarServicio(data) {
    try {
      const project_slug = data?.project_slug || data?.project_id;
      if (!project_slug || typeof project_slug !== 'string') {
        return this._errorResponse(400, 'INVALID_INPUT', 'project_slug es requerido', { field: 'project_slug' });
      }
      if (typeof data?.abierto !== 'boolean') {
        return this._errorResponse(400, 'INVALID_INPUT', 'abierto es requerido (true = aceptar pedidos, false = cerrar)', { field: 'abierto' });
      }
      let hasta = data?.hasta ?? null;
      if (hasta !== null) {
        const ms = Date.parse(String(hasta));
        if (!Number.isFinite(ms)) {
          return this._errorResponse(400, 'INVALID_INPUT', 'hasta debe ser una fecha ISO valida (o null)', { field: 'hasta' });
        }
        hasta = new Date(ms).toISOString();
      }
      const r = await this.servicio.fijarInterruptor(project_slug, {
        abierto: data.abierto,
        motivo: data?.motivo || 'manual',
        motivo_texto: data?.motivo_texto || null,
        hasta,
        aviso: data?.aviso || null
      });
      if (!r.ok) {
        const code = r.error?.code || 'UNKNOWN_ERROR';
        const status = code === 'INVALID_INPUT' ? 400 : (code === 'CONFLICT_STATE' ? 409 : 502);
        return { status, error: r.error || { code, message: 'no se pudo fijar el interruptor de servicio' } };
      }
      const estado = estadoServicio(r.servicio);
      await this.eventBus?.publish?.('servicio.cambiado', {
        request_id: data?.request_id || crypto.randomUUID(),
        project_slug,
        abierto: data.abierto,
        motivo: estado.motivo,
        hasta: estado.hasta,
        correlation_id: data?.correlation_id
      });
      this.logger?.info?.('pedidos.servicio.cambiado', {
        project_slug, abierto: data.abierto, motivo: estado.motivo, hasta: estado.hasta
      });
      return { status: 200, data: { ...estado, project_slug, mensaje: mensajeCierre(estado) } };
    } catch (err) {
      return this._handleHandlerError('pedidos.servicio.set.error', err);
    }
  }

  async handleCreatePedidoTienda(data) {
    try {
      const start_time = Date.now();
      const {
        project_slug,
        items,
        total_centimos,
        canal_origen,
        cliente_telefono,
        cliente_jid,
        canal_cuenta,
        cliente_nombre,
        modo_consumo,
        direccion_entrega,
        ubicacion,
        hora_recogida,
        metodo_pago,
        mayor_edad_confirmado,
        expira_horas,
        notas_generales,
        correlation_id
      } = data || {};
      // Nombre del pedido = ANCLA de recogida (el dependiente lo pide al recoger).
      // Texto libre normalizado. No es secreto; es lo que identifica el pedido en barra.
      const cliente_nombre_norm = typeof cliente_nombre === 'string'
        ? cliente_nombre.trim().replace(/\s+/g, ' ').slice(0, 60)
        : null;

      // MODO DE CONSUMO (el CANAL, lo que marca el ritmo): mesa | recoger | llevar | domicilio.
      // Es lo que el cliente elige en la PWA junto al nombre. Opcional: si no llega
      // (caller legacy), 'llevar' preserva el comportamiento previo (tienda = takeaway).
      const MODOS_CONSUMO = ['mesa', 'recoger', 'llevar', 'domicilio'];
      const modo_consumo_norm = MODOS_CONSUMO.includes(modo_consumo) ? modo_consumo : 'llevar';
      // DIRECCIÓN DE ENTREGA — solo tiene sentido (y es obligatoria) en 'domicilio'.
      // Sin destino no hay entrega: el pedido se rechaza en la puerta en vez de nacer
      // con una cuenta que nadie sabe dónde llevar. El TELÉFONO es el otro dato sin el
      // cual el reparto no se puede cerrar (se llama al llegar).
      const direccion_entrega_norm = (typeof direccion_entrega === 'string' && direccion_entrega.trim())
        ? direccion_entrega.trim().replace(/\s+/g, ' ').slice(0, 240)
        : null;
      // PUNTO EXACTO del cliente — el botón "Mi ubicación" de la PWA. OPCIONAL por
      // diseño: negar el permiso del móvil no puede dejar a nadie sin pedido. Si llega,
      // el repartidor navega al punto; si no, el enlace se compone de la dirección.
      // Sin pin, sin dirección y en domicilio → la puerta de abajo lo rechaza igual.
      const ubicacion_entrega = (modo_consumo_norm === 'domicilio')
        ? normalizarUbicacion(ubicacion)
        : null;
      // ENLACE DEL REPARTO — se compone UNA vez, aquí, para que cliente, staff y
      // cocina no discrepen: con pin abre el punto exacto, sin pin busca la dirección.
      const mapa_entrega = (modo_consumo_norm === 'domicilio')
        ? enlaceMapa({ direccion: direccion_entrega_norm, ubicacion: ubicacion_entrega })
        : null;
      // HORA pactada (solo aplica a 'recoger'). Texto libre tipo "20:30" o ISO; la
      // agenda (pieza futura) la leerá para inyectar al turno X min antes. Hoy solo
      // viaja y se muestra; el FIFO no se altera.
      const hora_recogida_norm = (modo_consumo_norm === 'recoger'
        && typeof hora_recogida === 'string' && hora_recogida.trim())
        ? hora_recogida.trim().slice(0, 20)
        : null;
      // METODO DE PAGO elegido por el cliente en la PWA: efectivo (paga al recoger) | tarjeta
      // (pago online por la pasarela). Opcional: sin el, 'efectivo' (comportamiento previo).
      // Esto solo REGISTRA lo que el cliente pidio; quien manda sobre el cobro es la VERDAD del
      // pago (pedido.pago.estado), no esta preferencia.
      const METODOS_PAGO = ['efectivo', 'tarjeta'];
      const metodo_pago_norm = METODOS_PAGO.includes(metodo_pago) ? metodo_pago : 'efectivo';

      if (!project_slug || typeof project_slug !== 'string') {
        this.metrics?.increment?.('pedidos.errors', { code: 'INVALID_INPUT', kind: 'create_tienda' });
        return this._errorResponse(400, 'INVALID_INPUT', 'project_slug es requerido', { field: 'project_slug' });
      }
      if (!Array.isArray(items) || items.length === 0) {
        this.metrics?.increment?.('pedidos.errors', { code: 'INVALID_INPUT', kind: 'create_tienda' });
        return this._errorResponse(400, 'INVALID_INPUT', 'items es requerido (array no vacio)', { field: 'items' });
      }
      if (!Number.isInteger(total_centimos) || total_centimos < 0) {
        this.metrics?.increment?.('pedidos.errors', { code: 'INVALID_INPUT', kind: 'create_tienda' });
        return this._errorResponse(400, 'INVALID_INPUT', 'total_centimos debe ser entero >= 0', { field: 'total_centimos' });
      }
      // LEY DE LA EVIDENCIA (prisma): el canal de origen JAMAS se veta por nombre — el pedido
      // ES su propia evidencia (items+total+cliente). glovo, telegram o el canal de manana
      // entran sin tocar esta linea; lo unico exigible es que el canal EXISTA (slug).
      if (!canal_origen || typeof canal_origen !== 'string' || !/^[a-z0-9_-]{2,30}$/.test(canal_origen)) {
        this.metrics?.increment?.('pedidos.errors', { code: 'INVALID_INPUT', kind: 'create_tienda' });
        return this._errorResponse(400, 'INVALID_INPUT', "canal_origen requerido (slug del canal: whatsapp, web, manual, glovo, ...)", { field: 'canal_origen' });
      }
      // El nombre es el ANCLA de recogida (sustituye al codigo_recogida) → obligatorio.
      if (!cliente_nombre_norm || cliente_nombre_norm.length < 2) {
        this.metrics?.increment?.('pedidos.errors', { code: 'INVALID_INPUT', kind: 'create_tienda' });
        return this._errorResponse(400, 'INVALID_INPUT', 'cliente_nombre es requerido (ancla de recogida)', { field: 'cliente_nombre' });
      }
      // ENTREGA A DOMICILIO: dos datos sin los cuales el reparto no existe — destino y
      // teléfono. Se piden en la puerta (no en la PWA, que se puede saltar).
      if (modo_consumo_norm === 'domicilio') {
        if (!direccion_entrega_norm || direccion_entrega_norm.length < 6) {
          this.metrics?.increment?.('pedidos.errors', { code: 'INVALID_INPUT', kind: 'create_tienda' });
          return this._errorResponse(400, 'INVALID_INPUT', 'direccion_entrega es requerida para entrega a domicilio', { field: 'direccion_entrega' });
        }
        const digitosTel = String(cliente_telefono || '').replace(/\D/g, '');
        if (digitosTel.length < 9) {
          this.metrics?.increment?.('pedidos.errors', { code: 'INVALID_INPUT', kind: 'create_tienda' });
          return this._errorResponse(400, 'INVALID_INPUT', 'cliente_telefono es requerido para entrega a domicilio', { field: 'cliente_telefono' });
        }
      }

      // ── GUARD DE SERVICIO — la puerta donde el pedido NACE ─────────────────────
      // Aceptar pedidos no es un derecho del cliente: es una decisión del negocio.
      // Dos razones para no aceptarlo ahora, las dos escritas en el config del proyecto:
      //   · interruptor del dueño (saturación / imprevisto) → 409 TIENDA_CERRADA
      //   · horario o excepción del día                    → 412 FUERA_DE_HORARIO
      // Vive aquí y no en la PWA porque la PWA es estática y se puede saltar: este es
      // el único sitio donde nacen los pedidos de tienda (web y WhatsApp desembocan aquí).
      // Las mesas NO pasan por esta puerta (otra tool): el bar sigue trabajando.
      const servicioEstado = await this._estadoServicio(project_slug);
      if (servicioEstado && servicioEstado.abierto === false) {
        const porHorario = servicioEstado.motivo === 'horario' || servicioEstado.motivo === 'excepcion';
        const status = porHorario ? 412 : 409;
        const code = porHorario ? 'FUERA_DE_HORARIO' : 'TIENDA_CERRADA';
        const mensaje = mensajeCierre(servicioEstado)
          || (porHorario ? 'Fuera de horario de pedidos' : 'La tienda no acepta pedidos ahora mismo');
        this.metrics?.increment?.('pedidos.rechazado.total', 1, { project: project_slug, code });
        this.logger?.info?.('pedidos.rechazado.servicio_cerrado', {
          project_slug, code, motivo: servicioEstado.motivo,
          hasta: servicioEstado.hasta, correlation_id
        });
        return this._errorResponse(status, code, mensaje, {
          motivo: servicioEstado.motivo,
          motivo_texto: servicioEstado.motivo_texto,
          hasta: servicioEstado.hasta,
          aviso: servicioEstado.aviso,
          proxima_apertura: servicioEstado.proxima_apertura,
          franjas_hoy: servicioEstado.franjas_hoy
        });
      }
      // Construir items canonicos del shape tienda. Items vienen del parser
      // (modules/whatsapp-bot/services/pedido-parser.js) o de la PWA directamente.
      const items_tienda = [];
      for (let i = 0; i < items.length; i++) {
        const raw = items[i] || {};
        const cantidad = Number(raw.cantidad);
        if (!Number.isInteger(cantidad) || cantidad <= 0) {
          this.metrics?.increment?.('pedidos.errors', { code: 'INVALID_INPUT', kind: 'create_tienda' });
          return this._errorResponse(400, 'INVALID_INPUT', `items[${i}].cantidad debe ser entero > 0`, { field: `items[${i}].cantidad` });
        }
        const descripcion = typeof raw.descripcion === 'string' ? raw.descripcion.trim() : '';
        if (!descripcion) {
          this.metrics?.increment?.('pedidos.errors', { code: 'INVALID_INPUT', kind: 'create_tienda' });
          return this._errorResponse(400, 'INVALID_INPUT', `items[${i}].descripcion es requerida`, { field: `items[${i}].descripcion` });
        }
        items_tienda.push({
          item_id: crypto.randomUUID(),
          cantidad,
          descripcion,
          producto_id: raw.producto_id || null,
          precio_unitario_centimos: Number.isInteger(raw.precio_unitario_centimos) ? raw.precio_unitario_centimos : null,
          precio_total_centimos: Number.isInteger(raw.precio_total_centimos) ? raw.precio_total_centimos : null,
          // Estructura para cocina (la pinta el ItemLine como el POS). El bot la re-tasó y la
          // mandó; aquí solo la dejamos pasar hacia el comandero → enviar_cocina → cocina.
          // `tipo` solo si es mitad/al_gusto (el comandero lo valida con ese enum; normal NO lo lleva).
          ...((raw.tipo === 'mitad_mitad' || raw.tipo === 'al_gusto') ? { tipo: raw.tipo } : {}),
          ...(raw.variaciones ? { variaciones: raw.variaciones } : {}),
          ...(Array.isArray(raw.ingredientes_base) ? { ingredientes_base: raw.ingredientes_base } : {}),
          ...(raw.pizza_izquierda ? { pizza_izquierda: raw.pizza_izquierda } : {}),
          ...(raw.pizza_derecha ? { pizza_derecha: raw.pizza_derecha } : {})
        });
      }

      const horas = Number.isInteger(expira_horas) && expira_horas > 0 ? expira_horas : 24;
      const expira_at = new Date(Date.now() + horas * 3600_000).toISOString();
      const pedido_id = crypto.randomUUID();
      const created_at = new Date().toISOString();

      const pedido = {
        id: pedido_id,
        tipo: 'tienda',
        cuenta_id: null,
        canal: null,
        canal_origen,
        project_slug,
        project_id: project_slug,
        items: items_tienda,
        estado: 'pendiente_recogida',
        total_centimos,
        total: total_centimos / 100,
        cliente_nombre: cliente_nombre_norm,
        cliente_telefono: cliente_telefono || null,
        // JID completa de WhatsApp del cliente (`...@s.whatsapp.net` o `...@lid`). Es lo que
        // permite avisarle cuando la cocina termina: con numero oculto (LID) no hay movil
        // que componer, y los avisos de recogida se quedarian sin destino.
        cliente_jid: this._normalizarJid(cliente_jid) || this._jidDesdeNotas(notas_generales),
        // Cuenta del puente por la que entro el pedido: por ahi sale el aviso de recogida.
        canal_cuenta: this._normalizarCuentaPuente(canal_cuenta),
        modo_consumo: modo_consumo_norm,
        // DESTINO del reparto. Solo en 'domicilio'; null en mesa/recoger/llevar.
        direccion_entrega: direccion_entrega_norm,
        ubicacion_entrega: ubicacion_entrega,
        mapa_entrega: mapa_entrega,
        hora_recogida: hora_recogida_norm,
        metodo_pago: metodo_pago_norm,
        // Decision 6.2 = C: configurable por proyecto. Si la PWA mostro gate
        // y el cliente lo paso, este flag llega como true. Si el proyecto no
        // activa verificacion, llega null (sin info — no aplica).
        mayor_edad_confirmado: mayor_edad_confirmado === true ? true : (mayor_edad_confirmado === false ? false : null),
        mayor_edad_confirmado_at: mayor_edad_confirmado === true ? created_at : null,
        expira_at,
        notas_generales: notas_generales || null,
        created_at,
        updated_at: created_at
      };

      this.pedidos.set(pedido_id, pedido);
      if (!this.pedidosPorProject.has(project_slug)) {
        this.pedidosPorProject.set(project_slug, new Set());
      }
      this.pedidosPorProject.get(project_slug).add(pedido_id);

      this.metrics?.increment?.('pedidos.creado.total');
      this.metrics?.increment?.('pedidos.tienda.creado', { project: project_slug });
      this.metrics?.gauge?.('pedidos.activos.count', this.pedidos.size);
      this.metrics?.timing?.('pedidos.create_tienda.duration', Date.now() - start_time);

      // Crea una CUENTA operativa en comandero (editable + cobrable en cualquier
      // método) con el pedido inyectado. cuentas emite comandero.enviar_cocina → el
      // pedido entra en cocina por la ruta normal, atado al cuenta_id real. Fallback:
      // si cuentas no está disponible, envío directo a cocina (no romper el flujo).
      // ── LA PUERTA DE LA CONFIANZA ──────────────────────────────────────────────
      // El pedido NO sale siempre a cocina. Dos caminos, una sola regla:
      //   · cliente HABITUAL (ya recogió los pedidos de confianza) → directo, como siempre.
      //   · cliente NUEVO → se queda parado en 'pendiente_confirmacion', con su cuenta
      //     creada (para que el de la barra lo vea y lo pueda editar/cobrar) pero SIN
      //     entrar en cocina, hasta que confirme. Así un pedido de un desconocido no
      //     arranca la cocina sin que nadie lo haya mirado.
      // La puerta se abre SOLO si el proyecto la pide en su config (`confirmacion_pedidos`).
      // Sin ese dato el comportamiento es el de siempre: ningún otro canal ni proyecto
      // se entera de este cambio.
      const regla = await this._reglaConfirmacion(project_slug);
      const ficha = regla.activo ? await this._fichaCliente(project_slug, pedido.cliente_jid) : null;
      const entregados = (ficha && ficha.pedidos_entregados) || 0;
      // Sin identificador no se puede reconocer a nadie: se comporta como nuevo, sin
      // inventar identidad (y sin frenar a quien no vino por un canal con JID).
      const habitual = !regla.activo || !pedido.cliente_jid || entregados >= regla.pedidos_habitual;

      if (habitual) {
        pedido.enviado_cocina_at = new Date().toISOString();
        await this._crearCuentaTienda(pedido, { correlation_id });
      } else {
        pedido.estado = 'pendiente_confirmacion';
        pedido.confirmacion = {
          estado: 'pendiente',
          pedidos_entregados: entregados,
          pedida_at: null,
          respondida_at: null
        };
        await this._crearCuentaTienda(pedido, { correlation_id }, { enviar_cocina: false });
      }

      // pedido.creado DESPUÉS de crear la cuenta → ya lleva cuenta_id (lo usa el
      // whatsapp-bot para confirmar al cliente y para avisarle "ven a recoger".
      await this._publishPedidoCreado(pedido, { correlation_id });

      // Quien habla con el cliente es el módulo de confirmación: aquí solo se le dice
      // qué pasó. Un habitual recibe trato de siempre; uno nuevo, la petición de "sí".
      // Si el proyecto no tiene la puerta activa, no se avisa a nadie: el flujo es el
      // de antes, sin mensajes nuevos.
      if (regla.activo && habitual) {
        await this._publicarEvento('pedido.cliente_habitual', {
          pedido_id,
          project_id: project_slug,
          project_slug,
          cuenta_id: pedido.cuenta_id || null,
          cliente_jid: pedido.cliente_jid || null,
          cliente_nombre: pedido.cliente_nombre || null,
          pedidos_entregados: entregados
        }, { correlation_id });
      } else if (regla.activo) {
        await this._publicarEvento('pedido.confirmacion_pendiente', {
          pedido_id,
          project_id: project_slug,
          project_slug,
          cuenta_id: pedido.cuenta_id || null,
          cliente_jid: pedido.cliente_jid || null,
          cliente_nombre: pedido.cliente_nombre || null,
          total_centimos,
          pedidos_entregados: entregados
        }, { correlation_id });
      }

      this.logger.info('pedidos.tienda.creado', {
        pedido_id,
        project_slug,
        items_count: items_tienda.length,
        total_centimos,
        cliente_nombre: cliente_nombre_norm,
        canal_origen,
        duration: Date.now() - start_time
      });

      return {
        status: 201,
        data: {
          pedido_id,
          cliente_nombre: cliente_nombre_norm,
          modo_consumo: modo_consumo_norm,
          direccion_entrega: direccion_entrega_norm,
          ubicacion_entrega: ubicacion_entrega,
          mapa_entrega: mapa_entrega,
          hora_recogida: hora_recogida_norm,
          metodo_pago: metodo_pago_norm,
          expira_at,
          estado: pedido.estado,
          total_centimos,
          tipo: 'tienda'
        }
      };
    } catch (err) {
      return this._handleHandlerError('pedidos.create_tienda.error', err);
    }
  }

  // ENTREGA (pieza 3, flujo A): el dependiente confirma la recogida. Canal-agnóstico:
  // se puede llamar desde la pantalla de cocina/comandero o desde una respuesta del staff.
  // Localiza por cliente_nombre (el ANCLA: el nombre que el cliente introdujo). Si hay varios
  // pedidos pendientes con el mismo nombre, el dependiente desambigua con pedido_id.
  // → recogido_y_cobrado (efectivo) → emite pedido.recogido.
  async handleConfirmarRecogida(data) {
    try {
      const { cliente_nombre, pedido_id, correlation_id } = data || {};
      const nombre_norm = typeof cliente_nombre === 'string'
        ? cliente_nombre.trim().replace(/\s+/g, ' ').toLowerCase()
        : '';
      if (!nombre_norm && !pedido_id) {
        return this._errorResponse(400, 'INVALID_INPUT', 'cliente_nombre (o pedido_id) es requerido', { field: 'cliente_nombre' });
      }

      // candidatos: pedidos de tienda. Por pedido_id directo, o por nombre normalizado.
      const candidatos = [];
      for (const p of this.pedidos.values()) {
        if (p.tipo !== 'tienda') continue;
        if (pedido_id) {
          if (p.id === pedido_id) { candidatos.push(p); break; }
          continue;
        }
        const pn = typeof p.cliente_nombre === 'string'
          ? p.cliente_nombre.trim().replace(/\s+/g, ' ').toLowerCase() : '';
        if (pn && pn === nombre_norm) candidatos.push(p);
      }
      if (candidatos.length === 0) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'no hay ningún pedido de tienda a ese nombre', { cliente_nombre: cliente_nombre || null, pedido_id: pedido_id || null });
      }

      // Si hay varios PENDIENTES con el mismo nombre y no se dio pedido_id → desambiguar.
      if (!pedido_id) {
        const pendientes = candidatos.filter(p => p.estado === 'pendiente_recogida');
        if (pendientes.length > 1) {
          return this._errorResponse(409, 'CONFLICT_STATE', 'varios pedidos a ese nombre: indica pedido_id', {
            cliente_nombre,
            candidatos: pendientes.map(p => ({ pedido_id: p.id, total_centimos: p.total_centimos, created_at: p.created_at }))
          });
        }
      }
      const pedido = candidatos.find(p => p.estado === 'pendiente_recogida') || candidatos[0];

      if (pedido.estado === 'recogido_y_cobrado') {
        return this._errorResponse(409, 'CONFLICT_STATE', 'el pedido ya fue recogido y cobrado', { estado: pedido.estado });
      }
      // caducidad on-read: si pasó expira_at, márcalo expirado y no permitas recogida
      if (pedido.estado === 'expirado' ||
          (pedido.expira_at && Date.now() > new Date(pedido.expira_at).getTime())) {
        if (pedido.estado !== 'expirado') {
          pedido.estado = 'expirado';
          pedido.updated_at = new Date().toISOString();
          await this._publicarEvento('pedido.expirado',
            { pedido_id: pedido.id, project_id: pedido.project_id, cliente_nombre: pedido.cliente_nombre || null }, { correlation_id });
        }
        return this._errorResponse(409, 'CONFLICT_STATE', 'el pedido caducó (expira_at superado)', { estado: 'expirado' });
      }
      if (pedido.estado !== 'pendiente_recogida') {
        return this._errorResponse(409, 'CONFLICT_STATE', `estado no recogible: ${pedido.estado}`, { estado: pedido.estado });
      }
      // cerrar: recogido + cobrado. El METODO sale de la VERDAD del pago (pedido.pago): si la
      // pasarela ya lo confirmo, la caja apunta 'tarjeta' (con su session_id); si no, 'efectivo'
      // (se cobra en barra al entregar). Antes se clavaba 'efectivo' a fuego → descuadraba la caja.
      const recogido_at = new Date().toISOString();
      const pagoConfirmado = !!(pedido.pago && pedido.pago.estado === 'pagado');
      const metodo_cobro = pagoConfirmado ? 'tarjeta' : 'efectivo';
      pedido.estado = 'recogido_y_cobrado';
      pedido.recogido_at = recogido_at;
      pedido.cobro = {
        metodo: metodo_cobro,
        monto_centimos: pedido.total_centimos,
        cobrado_at: recogido_at,
        ...(pagoConfirmado ? { session_id: pedido.pago.session_id || null, pasarela: pedido.pago.pasarela || null } : {})
      };
      pedido.updated_at = recogido_at;

      this.metrics?.increment?.('pedidos.tienda.recogido', { project: pedido.project_slug });
      // El pedido ENTREGADO es lo que hace a un cliente habitual: aquí, y solo aquí,
      // se suma a su ficha. Contarlo al crear sería regalar confianza a quien pedía
      // y nunca venía.
      await this._anotarRecogida(pedido);
      await this._publicarEvento('pedido.recogido', {
        pedido_id: pedido.id,
        project_id: pedido.project_id,
        cliente_nombre: pedido.cliente_nombre || null,
        total_centimos: pedido.total_centimos,
        metodo_pago: metodo_cobro,
        recogido_at
      }, { correlation_id });

      this.logger.info('pedidos.tienda.recogido', {
        pedido_id: pedido.id, project_slug: pedido.project_slug, total_centimos: pedido.total_centimos
      });

      return { status: 200, data: { pedido_id: pedido.id, estado: pedido.estado, total_centimos: pedido.total_centimos, metodo_pago: metodo_cobro, cobro: pedido.cobro } };
    } catch (err) {
      return this._handleHandlerError('pedidos.confirmar_recogida.error', err);
    }
  }

  async handleListPedidos(data) {
    try {
      const { cuenta_id, estado } = data || {};
      let pedidos = Array.from(this.pedidos.values());
      if (cuenta_id) pedidos = pedidos.filter(p => p.cuenta_id === cuenta_id);
      if (estado) pedidos = pedidos.filter(p => p.estado === estado);
      pedidos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return { status: 200, data: { pedidos, total: pedidos.length } };
    } catch (err) {
      return this._handleHandlerError('pedidos.list.error', err);
    }
  }

  async handleGetPedido(data) {
    try {
      const { id } = data || {};
      if (!id) {
        return this._errorResponse(400, 'INVALID_INPUT', 'id requerido', { field: 'id' });
      }
      const pedido = this.pedidos.get(id);
      if (!pedido) {
        this.metrics?.increment?.('pedidos.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'get' });
        this.logger.warn('pedidos.get.not_found', { id });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', { id });
      }
      return { status: 200, data: pedido };
    } catch (err) {
      return this._handleHandlerError('pedidos.get.error', err);
    }
  }

  async handleAgregarItem(data) {
    try {
      const start_time = Date.now();
      const { pedido_id, producto_id, cantidad, variaciones, notas } = data || {};

      const pedido = this.pedidos.get(pedido_id);
      if (!pedido) {
        this.metrics?.increment?.('pedidos.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'add-item' });
        this.logger.warn('pedidos.add_item.not_found', { pedido_id });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', { pedido_id });
      }

      if (pedido.estado !== 'borrador' && pedido.estado !== 'confirmado') {
        this.metrics?.increment?.('pedidos.errors', { code: 'CONFLICT_STATE', kind: 'add-item' });
        this.logger.warn('pedidos.add_item.bad_state', { pedido_id, estado: pedido.estado });
        return this._errorResponse(409, 'CONFLICT_STATE',
          `No se pueden agregar items a un pedido en estado ${pedido.estado}`,
          { pedido_id, estado: pedido.estado });
      }

      if (!producto_id) {
        this.metrics?.increment?.('pedidos.errors', { code: 'INVALID_INPUT', kind: 'add-item' });
        this.logger.warn('pedidos.add_item.missing', { field: 'producto_id' });
        return this._errorResponse(400, 'INVALID_INPUT', 'producto_id es requerido', { field: 'producto_id' });
      }

      const item_id = crypto.randomUUID();
      const producto = this.productosCache.get(producto_id);
      const precio_unitario = producto?.precio ?? 0;
      const nombre_producto = producto?.nombre ?? producto_id;

      if (!producto) {
        this.logger.warn('pedidos.producto.not_in_cache', {
          producto_id, cache_size: this.productosCache.size
        });
      }

      const cantidadFinal = cantidad || 1;
      const item = {
        item_id, producto_id,
        nombre: nombre_producto,
        cantidad: cantidadFinal,
        precio_unitario,
        precio_total: precio_unitario * cantidadFinal,
        variaciones: variaciones || null,
        notas: notas || null,
        estado: 'pendiente',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      pedido.items.push(item);
      pedido.subtotal = this._calcularSubtotal(pedido);
      pedido.total = pedido.subtotal;
      pedido.updated_at = new Date().toISOString();

      this.metrics?.increment?.('pedidos.item_agregado.total');
      this.metrics?.gauge?.('pedidos.items_total.count',
        Array.from(this.pedidos.values()).reduce((sum, p) => sum + p.items.length, 0)
      );

      await this._publishItemAgregado(pedido, item, data);

      this.logger.info('pedidos.item_agregado', {
        pedido_id, item_id, producto_id, cantidad: cantidadFinal, precio_unitario,
        duration: Date.now() - start_time
      });

      return { status: 201, data: { pedido_id, item, total: pedido.total } };
    } catch (err) {
      return this._handleHandlerError('pedidos.add_item.error', err);
    }
  }

  async handleActualizarItem(data) {
    try {
      const { pedido_id, item_id, cantidad, variaciones, notas } = data || {};
      const pedido = this.pedidos.get(pedido_id);
      if (!pedido) {
        this.metrics?.increment?.('pedidos.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'update-item' });
        this.logger.warn('pedidos.update_item.pedido_not_found', { pedido_id });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', { pedido_id });
      }

      const itemIndex = pedido.items.findIndex(i => i.item_id === item_id);
      if (itemIndex === -1) {
        this.metrics?.increment?.('pedidos.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'update-item' });
        this.logger.warn('pedidos.update_item.item_not_found', { pedido_id, item_id });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Item no encontrado', { item_id });
      }

      const item = pedido.items[itemIndex];
      const cambios = {};

      if (cantidad !== undefined && cantidad !== item.cantidad) {
        cambios.cantidad = { anterior: item.cantidad, nuevo: cantidad };
        item.cantidad = cantidad;
        item.precio_total = item.precio_unitario * item.cantidad;
      }
      if (variaciones !== undefined) {
        cambios.variaciones = { anterior: item.variaciones, nuevo: variaciones };
        item.variaciones = variaciones;
      }
      if (notas !== undefined) {
        cambios.notas = { anterior: item.notas, nuevo: notas };
        item.notas = notas;
      }

      item.updated_at = new Date().toISOString();
      pedido.subtotal = this._calcularSubtotal(pedido);
      pedido.total = pedido.subtotal;
      pedido.updated_at = new Date().toISOString();

      await this._publishItemActualizado(pedido, item_id, cambios, data);
      this.logger.info('pedidos.item_actualizado', { pedido_id, item_id, cambios });
      return { status: 200, data: { pedido_id, item, total: pedido.total } };
    } catch (err) {
      return this._handleHandlerError('pedidos.update_item.error', err);
    }
  }

  async handleEliminarItem(data) {
    try {
      const { pedido_id, item_id } = data || {};
      const pedido = this.pedidos.get(pedido_id);
      if (!pedido) {
        this.metrics?.increment?.('pedidos.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'delete-item' });
        this.logger.warn('pedidos.delete_item.pedido_not_found', { pedido_id });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', { pedido_id });
      }
      const itemIndex = pedido.items.findIndex(i => i.item_id === item_id);
      if (itemIndex === -1) {
        this.metrics?.increment?.('pedidos.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'delete-item' });
        this.logger.warn('pedidos.delete_item.item_not_found', { pedido_id, item_id });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Item no encontrado', { item_id });
      }

      pedido.items.splice(itemIndex, 1);
      pedido.subtotal = this._calcularSubtotal(pedido);
      pedido.total = pedido.subtotal;
      pedido.updated_at = new Date().toISOString();

      await this._publishItemEliminado(pedido, item_id, data);
      this.logger.info('pedidos.item_eliminado', { pedido_id, item_id });
      return { status: 200, data: { pedido_id, item_id, total: pedido.total } };
    } catch (err) {
      return this._handleHandlerError('pedidos.delete_item.error', err);
    }
  }

  async handleEnviarCocina(data) {
    try {
      const start_time = Date.now();
      // El schema de la tool declara `pedido_id`; `id` se acepta por compat (los handlers
      // viejos leian `id` y toda llamada que siguiera el schema daba 404 — el pedido nunca
      // llegaba a cocina). Un solo contrato: pedido_id.
      const { id: _id, pedido_id } = data || {};
      const id = pedido_id || _id;
      const pedido = this.pedidos.get(id);
      if (!pedido) {
        this.metrics?.increment?.('pedidos.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'send-kitchen' });
        this.logger.warn('pedidos.send_kitchen.not_found', { id });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', { id });
      }
      if (pedido.items.length === 0) {
        this.metrics?.increment?.('pedidos.errors', { code: 'INVALID_INPUT', kind: 'send-kitchen' });
        this.logger.warn('pedidos.send_kitchen.empty', { id });
        return this._errorResponse(400, 'INVALID_INPUT', 'No se puede enviar un pedido vacio a cocina', { id });
      }
      if (pedido.estado === 'en_cocina') {
        this.metrics?.increment?.('pedidos.errors', { code: 'CONFLICT_STATE', kind: 'send-kitchen' });
        this.logger.warn('pedidos.send_kitchen.already', { id });
        return this._errorResponse(409, 'CONFLICT_STATE', 'Pedido ya esta en cocina', { id });
      }

      pedido.estado = 'en_cocina';
      pedido.enviado_cocina_at = new Date().toISOString();
      pedido.updated_at = new Date().toISOString();
      pedido.items.forEach(item => {
        if (item.estado === 'pendiente') item.estado = 'en_cocina';
      });

      this.metrics?.increment?.('pedidos.enviado_cocina.total');
      this.metrics?.gauge?.('pedidos.en_cocina.count',
        Array.from(this.pedidos.values()).filter(p => p.estado === 'en_cocina').length
      );
      this.metrics?.timing?.('pedidos.envio_cocina.duration', Date.now() - start_time);

      await this._publishEnviadoCocina(pedido, data);
      this.logger.info('pedidos.enviado_cocina', {
        pedido_id: id, items_count: pedido.items.length,
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
    } catch (err) {
      return this._handleHandlerError('pedidos.send_kitchen.error', err);
    }
  }

  async handleCompletarPedido(data) {
    try {
      const { id: _id, pedido_id } = data || {};
      const id = pedido_id || _id;
      const pedido = this.pedidos.get(id);
      if (!pedido) {
        this.metrics?.increment?.('pedidos.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'complete' });
        this.logger.warn('pedidos.complete.not_found', { id });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', { id });
      }
      pedido.estado = 'completado';
      pedido.completado_at = new Date().toISOString();
      pedido.updated_at = new Date().toISOString();
      const duracion = Math.floor((new Date(pedido.completado_at) - new Date(pedido.created_at)) / 1000 / 60);

      this.metrics?.increment?.('pedidos.completado.total');
      await this._publishPedidoCompletado(pedido, duracion, data);
      this.logger.info('pedidos.completado', { pedido_id: id, duracion_minutos: duracion });

      return {
        status: 200,
        data: {
          pedido_id: id,
          estado: pedido.estado,
          completado_at: pedido.completado_at,
          duracion_minutos: duracion
        }
      };
    } catch (err) {
      return this._handleHandlerError('pedidos.complete.error', err);
    }
  }

  async handleCancelarPedido(data) {
    try {
      const { id: _id, pedido_id, motivo } = data || {};
      const id = pedido_id || _id;
      const pedido = this.pedidos.get(id);
      if (!pedido) {
        this.metrics?.increment?.('pedidos.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'cancel' });
        this.logger.warn('pedidos.cancel.not_found', { id });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', { id });
      }
      pedido.estado = 'cancelado';
      pedido.cancelado_at = new Date().toISOString();
      pedido.updated_at = new Date().toISOString();

      this.metrics?.increment?.('pedidos.cancelado.total');
      await this._publishPedidoCancelado(pedido, motivo, data);
      this.logger.info('pedidos.cancelado', { pedido_id: id, motivo });

      return {
        status: 200,
        data: {
          pedido_id: id,
          estado: pedido.estado,
          motivo: motivo || null,
          cancelado_at: pedido.cancelado_at
        }
      };
    } catch (err) {
      return this._handleHandlerError('pedidos.cancel.error', err);
    }
  }

  async handleCalcularTotal(data) {
    try {
      const { id: _id, pedido_id } = data || {};
      const id = pedido_id || _id;
      const pedido = this.pedidos.get(id);
      if (!pedido) {
        this.metrics?.increment?.('pedidos.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'total' });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', { id });
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
    } catch (err) {
      return this._handleHandlerError('pedidos.total.error', err);
    }
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        productos_en_cache: this.productosCache.size,
        pedidos: {
          total: this.pedidos.size,
          borrador: Array.from(this.pedidos.values()).filter(p => p.estado === 'borrador').length,
          en_cocina: Array.from(this.pedidos.values()).filter(p => p.estado === 'en_cocina').length,
          completado: Array.from(this.pedidos.values()).filter(p => p.estado === 'completado').length
        }
      }
    };
  }

  // ==========================================
  // Event Publishers (canonicos via _publicarEvento)
  // ==========================================

  async _publishPedidoCreado(pedido, sourcePayload) {
    const payload = {
      pedido_id: pedido.id,
      cuenta_id: pedido.cuenta_id,
      canal: pedido.canal || null,
      ref_display: pedido.ref_display || null,
      project_id: pedido.project_id || null,
      estado: pedido.estado,
      total: pedido.total,
      items: pedido.items || [],
      created_at: pedido.created_at
    };
    // Campos del shape tienda (solo presentes cuando tipo='tienda').
    // cliente_telefono NO se incluye aqui (anti-fraude + RGPD-cero):
    // viven solo en el shape persistido y se desechan al cerrar/expirar el pedido.
    if (pedido.tipo) payload.tipo = pedido.tipo;
    if (pedido.canal_origen) payload.canal_origen = pedido.canal_origen;
    if (pedido.cliente_nombre) payload.cliente_nombre = pedido.cliente_nombre;
    if (pedido.expira_at) payload.expira_at = pedido.expira_at;
    if (pedido.project_slug) payload.project_slug = pedido.project_slug;
    if (pedido.metodo_pago) payload.metodo_pago = pedido.metodo_pago;
    // REPARTO: el modo, el destino y el enlace del mapa. Sin esto, quien avisa al
    // repartidor (staff) solo sabe que hay un pedido, no a dónde va. El TELÉFONO
    // sigue sin viajar (anti-fraude + RGPD-cero); la dirección ya iba al ticket.
    if (pedido.modo_consumo) payload.modo_consumo = pedido.modo_consumo;
    if (pedido.direccion_entrega) payload.direccion_entrega = pedido.direccion_entrega;
    if (pedido.mapa_entrega) payload.mapa_entrega = pedido.mapa_entrega;
    if (pedido.ubicacion_entrega) payload.ubicacion_entrega = pedido.ubicacion_entrega;
    if (pedido.total_centimos !== undefined && pedido.total_centimos !== null) {
      payload.total_centimos = pedido.total_centimos;
    }
    // mayor_edad_confirmado SI viaja en el evento (es metadata operativa, no PII).
    // El staff puede usarlo para auditoria — el dependiente sigue exigiendo DNI
    // en presencial si la regulacion lo manda.
    if (pedido.mayor_edad_confirmado !== undefined && pedido.mayor_edad_confirmado !== null) {
      payload.mayor_edad_confirmado = pedido.mayor_edad_confirmado;
    }
    await this._publicarEvento('pedido.creado', payload, sourcePayload);
  }

  async _publishItemAgregado(pedido, item, sourcePayload) {
    await this._publicarEvento('pedido.item_agregado', {
      pedido_id: pedido.id,
      cuenta_id: pedido.cuenta_id,
      project_id: pedido.project_id || null,
      item_id: item.item_id,
      producto_id: item.producto_id,
      nombre: item.nombre,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      precio_total: item.precio_total,
      variaciones: item.variaciones,
      notas: item.notas
    }, sourcePayload);
  }

  async _publishItemActualizado(pedido, item_id, cambios, sourcePayload) {
    await this._publicarEvento('pedido.item_actualizado', {
      pedido_id: pedido.id,
      project_id: pedido.project_id || null,
      item_id,
      cambios
    }, sourcePayload);
  }

  async _publishItemEliminado(pedido, item_id, sourcePayload) {
    await this._publicarEvento('pedido.item_eliminado', {
      pedido_id: pedido.id,
      project_id: pedido.project_id || null,
      item_id,
      motivo: 'eliminado_por_usuario'
    }, sourcePayload);
  }

  async _publishEnviadoCocina(pedido, sourcePayload) {
    await this._publicarEvento('pedido.enviado_cocina', {
      pedido_id: pedido.id,
      cuenta_id: pedido.cuenta_id,
      canal: pedido.canal || null,
      ref_display: pedido.ref_display || null,
      project_id: pedido.project_id || null,
      items: pedido.items.map(item => {
        const mapped = {
          item_id: item.item_id,
          producto_id: item.producto_id,
          nombre: item.nombre,
          categoria: item.categoria || null,
          estaciones: item.estaciones || null,
          cantidad: item.cantidad,
          variaciones: item.variaciones,
          notas: item.notas
        };
        if (item.tipo) mapped.tipo = item.tipo;
        if (item.pizza_izquierda) mapped.pizza_izquierda = item.pizza_izquierda;
        if (item.pizza_derecha) mapped.pizza_derecha = item.pizza_derecha;
        if (item.ingredientes) mapped.ingredientes = item.ingredientes;
        if (item.ingredientes_base) mapped.ingredientes_base = item.ingredientes_base;
        return mapped;
      }),
      items_count: pedido.items.length,
      notas_generales: pedido.notas_generales,
      enviado_at: pedido.enviado_cocina_at
    }, sourcePayload);
  }

  // Envía un pedido de TIENDA (plano, sin cuenta_id, items con `descripcion`) a cocina,
  // adaptando el shape al contrato de cocina (que espera item.nombre + cuenta_id como clave).
  // Flujo A (pago a recoger): se llama al crear. Flujo B (Stripe): se llamará tras pago.confirmado.
  _slugItem(desc) {
    return String(desc || 'item').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';
  }

  // ==========================================
  // Ficha del cliente
  // ==========================================

  // ¿Este proyecto pide confirmación a los clientes nuevos? Es DATO suyo, en
  // `config/config.json`:
  //   "confirmacion_pedidos": { "activo": true, "pedidos_habitual": 3, "espera_segundos": 30 }
  // Sin ese bloque (o con activo=false) no cambia nada: el pedido va a cocina como
  // siempre. La puerta no se activa sola en ningún proyecto ni en ningún canal.
  async _reglaConfirmacion(project_slug) {
    const porDefecto = { activo: false, pedidos_habitual: PEDIDOS_HABITUAL, espera_segundos: 30 };
    if (!project_slug) return porDefecto;
    if (this.reglasConfirmacion.has(project_slug)) return this.reglasConfirmacion.get(project_slug);
    const base = await this._basePath(project_slug);
    let regla = porDefecto;
    if (base) {
      const cfg = await this._readJsonSafe(path.join(base, 'config', 'config.json'));
      const c = cfg && cfg.confirmacion_pedidos;
      if (c && c.activo === true) {
        regla = {
          activo: true,
          pedidos_habitual: Number.isInteger(c.pedidos_habitual) && c.pedidos_habitual > 0
            ? c.pedidos_habitual : PEDIDOS_HABITUAL,
          espera_segundos: Number.isInteger(c.espera_segundos) && c.espera_segundos >= 0
            ? c.espera_segundos : 30
        };
      }
    }
    this.reglasConfirmacion.set(project_slug, regla);
    return regla;
  }

  // WhatsApp ya casi no manda el móvil: manda un identificador interno (LID) que es
  // estable para esa cuenta. Por eso la ficha se indexa por la JID completa y no por
  // teléfono — con el móvil, la mitad de los clientes no tendrían ficha. Se guarda lo
  // mínimo: identificador, nombre del último pedido y cuántos ha recogido. Los gustos
  // NO se guardan aquí: se leen de sus pedidos, que ya están persistidos.
  _claveCliente(project_slug, jid) {
    const j = String(jid || '').trim().toLowerCase();
    return j ? `${project_slug}:${j}` : null;
  }

  async _basePath(project_id) {
    if (!project_id) return null;
    if (this.basePathCache.has(project_id)) return this.basePathCache.get(project_id);
    let base = null;
    try {
      const pm = this.moduleRegistry?.get('project-manager')?.instance;
      const res = await pm?.handleGetProject?.({ params: { id: project_id } });
      base = res?.data?.project?.base_path || null;
    } catch (_err) {
      base = null;   // sin project-manager la ficha vive solo en memoria (degradación honesta)
    }
    this.basePathCache.set(project_id, base);
    return base;
  }

  async _cargarFichas(project_slug) {
    if (!project_slug || this.fichasCargadas.has(project_slug)) return;
    this.fichasCargadas.add(project_slug);
    const base = await this._basePath(project_slug);
    if (!base) return;
    const datos = await this._readJsonSafe(path.join(base, 'storage', 'pizzepos', 'clientes.json'));
    for (const f of (datos && Array.isArray(datos.clientes) ? datos.clientes : [])) {
      const clave = this._claveCliente(project_slug, f.jid);
      if (clave) this.fichasClientes.set(clave, f);
    }
  }

  async _guardarFichas(project_slug) {
    const base = await this._basePath(project_slug);
    if (!base) return;
    const clientes = [];
    for (const [clave, f] of this.fichasClientes) {
      if (clave.startsWith(`${project_slug}:`)) clientes.push(f);
    }
    try {
      const dir = path.join(base, 'storage', 'pizzepos');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, 'clientes.json'),
        JSON.stringify({ actualizado_at: new Date().toISOString(), clientes }, null, 2)
      );
    } catch (err) {
      this.logger?.warn?.('pedidos.clientes.persist_error', {
        project_slug, error_message: err && err.message ? err.message : String(err)
      });
    }
  }

  async _fichaCliente(project_slug, jid) {
    const clave = this._claveCliente(project_slug, jid);
    if (!clave) return null;
    await this._cargarFichas(project_slug);
    return this.fichasClientes.get(clave) || null;
  }

  async _anotarRecogida(pedido) {
    const clave = this._claveCliente(pedido?.project_slug, pedido?.cliente_jid);
    if (!clave) return null;
    const ahora = pedido.recogido_at || new Date().toISOString();
    const ficha = this.fichasClientes.get(clave) || {
      jid: pedido.cliente_jid,
      nombre: null,
      pedidos_entregados: 0,
      primer_pedido_at: pedido.created_at || ahora,
      creado_at: ahora
    };
    ficha.pedidos_entregados = (Number(ficha.pedidos_entregados) || 0) + 1;
    ficha.nombre = pedido.cliente_nombre || ficha.nombre || null;
    ficha.ultimo_pedido_at = ahora;
    this.fichasClientes.set(clave, ficha);
    await this._guardarFichas(pedido.project_slug);
    this.logger?.info?.('pedidos.cliente.recogida_anotada', {
      project_slug: pedido.project_slug,
      pedidos_entregados: ficha.pedidos_entregados
    });
    return ficha;
  }

  // El cliente dijo SÍ. Su pedido estaba esperando esa confirmación: ahora sí entra
  // en cocina, por la misma puerta que cualquier otro pedido (comandero.enviar_cocina).
  async handleConfirmarPedido(data) {
    try {
      const { pedido_id } = data || {};
      const pedido = this.pedidos.get(pedido_id);
      if (!pedido) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', { pedido_id });
      if (pedido.estado !== 'pendiente_confirmacion') {
        return this._errorResponse(409, 'CONFLICT_STATE', `El pedido no espera confirmación (estado: ${pedido.estado})`, { pedido_id, estado: pedido.estado });
      }
      const comandero = this.moduleRegistry?.get('comandero')?.instance;
      if (!pedido.cuenta_id || !comandero?.handleEnviarCocina) {
        return this._errorResponse(409, 'CONFLICT_STATE', 'El pedido no tiene cuenta operativa o falta el comandero', { pedido_id });
      }
      const envio = await comandero.handleEnviarCocina({
        cuenta_id: pedido.cuenta_id,
        project_id: pedido.project_id || pedido.project_slug,
        pedido_id: pedido.id
      });
      if (envio && envio.status >= 400) {
        return this._errorResponse(502, 'UPSTREAM_ERROR', 'El comandero no pudo enviar el pedido a cocina', { pedido_id });
      }
      pedido.estado = 'en_cocina';
      pedido.enviado_cocina_at = new Date().toISOString();
      pedido.confirmacion = {
        ...(pedido.confirmacion || {}),
        estado: 'confirmado',
        respondida_at: pedido.enviado_cocina_at
      };
      pedido.updated_at = pedido.enviado_cocina_at;
      await this._publicarEvento('pedido.confirmado', {
        pedido_id: pedido.id,
        project_id: pedido.project_id || pedido.project_slug,
        cuenta_id: pedido.cuenta_id,
        cliente_nombre: pedido.cliente_nombre || null,
        confirmado_at: pedido.enviado_cocina_at
      }, data);
      this.metrics?.increment?.('pedidos.confirmado.total', { project: pedido.project_slug });
      this.logger.info('pedidos.confirmado', { pedido_id: pedido.id, project_slug: pedido.project_slug });
      return { status: 200, data: { pedido_id: pedido.id, estado: pedido.estado } };
    } catch (err) {
      return this._handleHandlerError('pedidos.confirmar.error', err);
    }
  }

  // El cliente dijo NO (o se echó atrás). El pedido se cierra sin entrar en cocina.
  async handleRechazarPedido(data) {
    try {
      const { pedido_id, motivo } = data || {};
      const pedido = this.pedidos.get(pedido_id);
      if (!pedido) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', { pedido_id });
      if (pedido.estado !== 'pendiente_confirmacion') {
        return this._errorResponse(409, 'CONFLICT_STATE', `El pedido no espera confirmación (estado: ${pedido.estado})`, { pedido_id, estado: pedido.estado });
      }
      pedido.estado = 'cancelado';
      pedido.cancelado_at = new Date().toISOString();
      pedido.motivo_cancelacion = motivo || 'cliente_no_confirma';
      pedido.confirmacion = {
        ...(pedido.confirmacion || {}),
        estado: 'rechazado',
        respondida_at: pedido.cancelado_at
      };
      pedido.updated_at = pedido.cancelado_at;
      await this._publishPedidoCancelado(pedido, pedido.motivo_cancelacion, data);
      this.metrics?.increment?.('pedidos.rechazado_por_cliente.total', { project: pedido.project_slug });
      this.logger.info('pedidos.rechazado_por_cliente', { pedido_id: pedido.id, motivo: pedido.motivo_cancelacion });
      return { status: 200, data: { pedido_id: pedido.id, estado: pedido.estado } };
    } catch (err) {
      return this._handleHandlerError('pedidos.rechazar.error', err);
    }
  }

  // La JID que trae el pedido de WhatsApp, sacada de su propio texto libre.
  // El lector del puente (`bridges/whatsapp-qr/ingest/ingest.js`) NO manda un campo
  // `cliente_jid`: ya escribe el remitente dentro de `notas_generales` como
  // `WhatsApp <jid> · <nonce>`. Se lee de ahi en vez de tocar ese lector, que es un
  // carril COMPARTIDO (lo arranca tambien rapitvapers): lo que sirve a un negocio no
  // puede meter codigo en el puente del otro. Sin JID no hay destino al que contestar
  // cuando el cliente escribe con numero oculto; con ella, el aviso sale igual.
  _jidDesdeNotas(notas) {
    if (typeof notas !== 'string') return null;
    const m = notas.match(/whatsapp\s+([a-z0-9.:_-]+@(?:s\.whatsapp\.net|lid|c\.us))/i);
    return m ? this._normalizarJid(m[1]) : null;
  }

  // JID de WhatsApp normalizada (`<usuario>@<servidor>`), o null si no lo parece.
  // No se inventa un `@s.whatsapp.net` a partir de un numero suelto: eso es lo que
  // convierte un LID (id interno de WhatsApp) en un "telefono" que no existe.
  _normalizarJid(valor) {
    if (typeof valor !== 'string') return null;
    const s = valor.trim().toLowerCase();
    if (!s || s.length > 80) return null;
    return /^[a-z0-9.:_-]+@(s\.whatsapp\.net|lid|c\.us)$/.test(s) ? s : null;
  }

  // Slug de la cuenta del PUENTE de WhatsApp (`tienda`, `the-pirate`…). No es el slug
  // del proyecto y no se deriva de el: es la sesion de WhatsApp por la que entro el pedido.
  _normalizarCuentaPuente(valor) {
    if (typeof valor !== 'string') return null;
    const s = valor.trim().toLowerCase();
    return /^[a-z0-9][a-z0-9_-]{0,39}$/.test(s) ? s : null;
  }

  // Crea una cuenta POS operativa desde un pedido de tienda y la alimenta por el
  // FLUJO REAL del comandero (no se reinventa nada, todo eventos):
  //   cuentas.handleCreateCuenta  → cuenta vacía
  //   comandero.handleAddItem (×N) → comandero.item_agregado → cuentas suma el total
  //                                  (el cobro lee ESE total del buffer)
  //   comandero.handleEnviarCocina → comandero.enviar_cocina → bridge → cocina
  // Mismo patrón de delegación por instancia que cuentas-canales. Si falta algún
  // módulo o algo falla, cae al envío directo a cocina (no romper).
  async _crearCuentaTienda(pedido, sourcePayload, opciones = {}) {
    // `enviar_cocina: false` = crear la cuenta y sus líneas SIN arrancar la cocina.
    // Es lo que necesita un pedido de cliente nuevo: el de barra lo ve, puede
    // editarlo y cobrarlo, pero la cocina no empieza hasta que el cliente confirma.
    const enviar_cocina = opciones.enviar_cocina !== false;
    const cuentas   = this.moduleRegistry?.get('cuentas')?.instance;
    const comandero = this.moduleRegistry?.get('comandero')?.instance;
    if (!cuentas?.handleCreateCuenta || !comandero?.handleAddItem || !comandero?.handleEnviarCocina) {
      this.logger.warn('pedidos.tienda.modulos_no_disponibles', {
        pedido_id: pedido.id, cuentas: !!cuentas, comandero: !!comandero
      });
      if (enviar_cocina) await this._enviarTiendaACocina(pedido, sourcePayload);
      return null;
    }

    const project_id = pedido.project_id || pedido.project_slug;
    const correlation_id = sourcePayload?.correlation_id || null;

    try {
      // 1) Cuenta operativa SIN pedido_inicial (ese atajo salta el buffer del comandero).
      const cuentaRes = await cuentas.handleCreateCuenta({
        project_id,
        tipo: pedido.modo_consumo || 'llevar',     // MODO del cliente: mesa | recoger | llevar | domicilio.
                                                  // cuentas lo canoniza a CANAL (recoger/domicilio→llevar).
        nombre: pedido.cliente_nombre || null,
        metadata: {
          origen: 'tienda',
          canal_origen: pedido.canal_origen || null,
          modo_consumo: pedido.modo_consumo || null,
          // El DESTINO vive en la cuenta: es lo que el de mostrador mira cuando sale
          // el pedido, y lo que se imprime en el ticket de cocina.
          direccion_entrega: pedido.direccion_entrega || null,
          hora_recogida: pedido.hora_recogida || null,
          cliente_nombre: pedido.cliente_nombre || null,
          cliente_telefono: pedido.cliente_telefono || null,
          // Destino del AVISO DE RECOGIDA: la cuenta es lo unico que sigue existiendo
          // cuando la cocina termina (el pedido de tienda puede haberse reciclado), asi
          // que la JID de WhatsApp tiene que vivir aqui, no solo en el pedido.
          cliente_jid: pedido.cliente_jid || null,
          canal_cuenta: pedido.canal_cuenta || null,
          pedido_tienda_id: pedido.id,
          // Un pedido de tienda no tiene mesa ni ticket: nadie del canal lo va a
          // cerrar, así que el cierre es del COBRO (y con él, la venta al libro).
          // Las cuentas de mesa las cierra su canal; las de recogida en barra, no.
          cerrar_al_cobrar: (pedido.modo_consumo || 'llevar') !== 'mesa'
        },
        correlation_id
      });
      if (!cuentaRes || cuentaRes.status >= 400) {
        this.logger.error('pedidos.tienda.cuenta_create_failed', { pedido_id: pedido.id, status: cuentaRes?.status });
        if (enviar_cocina) await this._enviarTiendaACocina(pedido, sourcePayload);
        return null;
      }
      const cuenta_id = cuentaRes.data.id;
      pedido.cuenta_id = cuenta_id;

      // 2) Cargar items en el buffer del comandero: UNA línea por item del pedido.
      //    Cada línea lleva su nombre SIEMPRE. El precio por unidad es:
      //      a) el que manda el emisor (PWA web nueva, parser WhatsApp) → se usa tal cual;
      //      b) si no viene, el comandero re-tasa por producto_id contra la carta del canal;
      //      c) si tampoco hay producto real en carta (carta vieja, ids sintéticos 'tienda:*'),
      //         la línea se lleva un REPARTO del total del pedido, para que la cuenta no
      //         se quede en 0 y el cobro no dependa de un precio que no viajó.
      //    NUNCA se colapsa el pedido en una sola línea "Pedido tienda · Nombre" con el total:
      //    la cocina necesita los platos, no la suma (bug 30-oct-2026: pedido web de 34 EUR
      //    llegó a cocina como una única línea sin categoría → "sin items de tu estación").
      const conPrecio = pedido.items.length > 0 &&
        pedido.items.every(it => Number.isInteger(it.precio_unitario_centimos));
      if (!conPrecio) {
        this.logger.warn('pedidos.tienda.items_sin_precio', {
          pedido_id: pedido.id, items: pedido.items.length, total: pedido.total
        });
      }
      // Reparto EXACTO del total entre las líneas que llegan sin precio (carta vieja): se reparte
      // en céntimos enteros por unidad y el resto se asigna a las primeras unidades. Así la
      // cuenta suma exactamente el importe que el cliente vio en su móvil, sin inventarse un 0.
      const totalCentimosPedido = Number(pedido.total_centimos) || 0;
      const centimosConPrecio = pedido.items
        .filter(it => Number.isInteger(it.precio_unitario_centimos))
        .reduce((s, it) => s + it.precio_unitario_centimos * (Number(it.cantidad) || 0), 0);
      const sinPrecio = pedido.items.filter(it => !Number.isInteger(it.precio_unitario_centimos));
      const unidadesSinPrecio = sinPrecio.reduce((s, it) => s + (Number(it.cantidad) || 0), 0);
      let centimosRestantes = Math.max(totalCentimosPedido - centimosConPrecio, 0);
      const baseCentimos = unidadesSinPrecio > 0 ? Math.floor(centimosRestantes / unidadesSinPrecio) : 0;
      let centimosDeResto = unidadesSinPrecio > 0 ? centimosRestantes - baseCentimos * unidadesSinPrecio : 0;
      for (const it of pedido.items) {
        const tienePrecio = Number.isInteger(it.precio_unitario_centimos);
        let precioLinea = tienePrecio ? it.precio_unitario_centimos / 100 : 0;
        if (!tienePrecio) {
          const unidades = Number(it.cantidad) || 1;
          const extra = Math.min(centimosDeResto, unidades);
          centimosDeResto -= extra;
          const subtotalCentimos = baseCentimos * unidades + extra;
          precioLinea = Math.round((subtotalCentimos / unidades)) / 100;
        }
        // LA FICHA DEL PLATO: si el canal no la manda (web, WhatsApp, Telegram), sale de
        // la carta — el plato se reconoce por su `producto_id` y el POS ya tiene el
        // catálogo. Sin esto la cocina ve el nombre y nada más: no sabe qué lleva el plato,
        // ni qué le han quitado ni añadido. Lo que el cliente pidió de más SÍ viaja en
        // `variaciones`; esto es lo que el plato lleva de fábrica.
        const enCache = it.producto_id ? this.productosCache.get(it.producto_id) : null;
        const ingredientesBase = (Array.isArray(it.ingredientes_base) && it.ingredientes_base.length)
          ? it.ingredientes_base
          : (enCache?.ingredientes_base || null);

        await comandero.handleAddItem({
          cuenta_id, project_id,
          producto_id: it.producto_id || `tienda:${this._slugItem(it.descripcion)}`,
          nombre: it.descripcion,
          precio: precioLinea,
          cantidad: it.cantidad,
          precio_canal_resuelto: true,
          // Estructura → el comandero la guarda y la reenvía en enviar_cocina → cocina la pinta.
          // `tipo` solo mitad/al_gusto (enum del comandero); normal va solo con `variaciones`.
          ...((it.tipo === 'mitad_mitad' || it.tipo === 'al_gusto') ? { tipo: it.tipo } : {}),
          ...(it.variaciones ? { variaciones: it.variaciones } : {}),
          ...(Array.isArray(ingredientesBase) ? { ingredientes_base: ingredientesBase } : {}),
          ...(it.pizza_izquierda ? { pizza_izquierda: it.pizza_izquierda } : {}),
          ...(it.pizza_derecha ? { pizza_derecha: it.pizza_derecha } : {})
        });
      }

      // 3) Enviar a cocina por el flujo normal del comandero.
      //    pedido_id = el id de ESTE pedido de tienda: comandero y pedidos hablan del mismo.
      //    project_id viaja explícito: sin él, comandero cae a DEFAULT_PROJECT_ID ('default').
      //    Un cliente NUEVO no llega aquí: su cuenta se crea igual, pero la cocina espera.
      if (enviar_cocina) {
        await comandero.handleEnviarCocina({
          cuenta_id, project_id, pedido_id: pedido.id,
          // EL DESTINO VA EN EL TICKET. Sin esto, la cocina ve "1 x Elf Bar" y el de
          // mostrador no sabe a dónde sale el pedido: la entrega se queda a medias.
          ...(pedido.direccion_entrega ? {
            notas_generales: `🛵 ENTREGA A DOMICILIO: ${pedido.direccion_entrega}`
              + (pedido.cliente_telefono ? ` · Tel: ${pedido.cliente_telefono}` : '')
          } : {})
        });
      }

      this.metrics?.increment?.('pedidos.tienda.cuenta_creada', { project: pedido.project_slug });
      this.logger.info('pedidos.tienda.cuenta_creada', {
        pedido_id: pedido.id, cuenta_id, ref_display: cuentaRes.data.ref_display,
        items: pedido.items.length, con_precio: conPrecio, enviado_cocina: enviar_cocina
      });
      return cuentaRes.data;
    } catch (err) {
      this.logger.error('pedidos.tienda.cuenta_create_error', { pedido_id: pedido.id, error: err.message });
      if (enviar_cocina) await this._enviarTiendaACocina(pedido, sourcePayload);
      return null;
    }
  }

  async _enviarTiendaACocina(pedido, sourcePayload) {
    await this._publicarEvento('pedido.enviado_cocina', {
      pedido_id: pedido.id,
      cuenta_id: pedido.id,                         // clave sintética: tienda no tiene cuenta
      canal: 'tienda',
      canal_origen: pedido.canal_origen || null,
      // Etiqueta para cocina: el nombre del cliente (ancla de recogida); fallback al id corto.
      // El icono dice el MODO de un vistazo: 🛵 domicilio · 🛍 recoger/llevar.
      ref_display: `${pedido.direccion_entrega ? '🛵' : '🛍'} ${pedido.cliente_nombre || pedido.id.slice(0, 6)}`,
      project_id: pedido.project_id || pedido.project_slug || null,
      items: (pedido.items || []).map(it => ({
        item_id: it.item_id,
        producto_id: it.producto_id || null,
        nombre: it.descripcion,                     // tienda usa `descripcion` como nombre legible
        cantidad: it.cantidad
      })),
      items_count: (pedido.items || []).length,
      notas_generales: pedido.direccion_entrega
        ? `🛵 ENTREGA A DOMICILIO: ${pedido.direccion_entrega}`
          + (pedido.cliente_telefono ? ` · Tel: ${pedido.cliente_telefono}` : '')
        : (pedido.notas_generales || null),
      enviado_at: pedido.enviado_cocina_at || new Date().toISOString(),
      metadata: { tipo: 'tienda', modo_consumo: pedido.modo_consumo || null, direccion_entrega: pedido.direccion_entrega || null, mapa_entrega: pedido.mapa_entrega || null, hora_recogida: pedido.hora_recogida || null, cliente_nombre: pedido.cliente_nombre || null, cliente_telefono: pedido.cliente_telefono || null }
    }, sourcePayload);
  }

  async _publishPedidoCompletado(pedido, duracion_minutos, sourcePayload) {
    await this._publicarEvento('pedido.completado', {
      pedido_id: pedido.id,
      cuenta_id: pedido.cuenta_id,
      project_id: pedido.project_id || null,
      total: pedido.total,
      items_count: pedido.items.length,
      completado_at: pedido.completado_at,
      duracion_minutos
    }, sourcePayload);
  }

  async _publishPedidoCancelado(pedido, motivo, sourcePayload) {
    await this._publicarEvento('pedido.cancelado', {
      pedido_id: pedido.id,
      cuenta_id: pedido.cuenta_id,
      project_id: pedido.project_id || null,
      motivo: motivo || 'sin_especificar',
      cancelado_at: pedido.cancelado_at
    }, sourcePayload);
  }

  // ==========================================
  // Restauracion legacy desde cuentas_activas.json
  // ==========================================

  async _restaurarDesdeArchivo() {
    const archivo = path.join('./data/current', 'cuentas_activas.json');
    const datos = await this._readJsonSafe(archivo);
    if (!datos?.cuentas) return;

    let restaurados = 0;
    for (const [cuenta_id, cuenta] of Object.entries(datos.cuentas)) {
      if (!cuenta.pedidos || cuenta.pedidos.length === 0) continue;
      if (!this.pedidosPorCuenta.has(cuenta_id)) {
        this.pedidosPorCuenta.set(cuenta_id, new Set());
      }
      const canal = this._detectarCanal(cuenta_id);

      for (const pedidoData of cuenta.pedidos) {
        const pedido_id = pedidoData.pedido_id;
        if (!pedido_id || this.pedidos.has(pedido_id)) continue;

        const pedido = {
          id: pedido_id,
          cuenta_id,
          canal,
          project_id: cuenta.project_id || null,
          items: (pedidoData.items || []).map(item => this._buildPedidoItem(item, 'en_cocina')),
          estado: 'en_cocina',
          subtotal: pedidoData.total || 0,
          total: pedidoData.total || 0,
          notas_generales: null,
          created_at: cuenta.created_at || new Date().toISOString(),
          updated_at: cuenta.updated_at || new Date().toISOString()
        };

        this.pedidos.set(pedido_id, pedido);
        this.pedidosPorCuenta.get(cuenta_id).add(pedido_id);
        restaurados++;
      }
    }

    if (restaurados > 0) {
      this.metrics?.gauge?.('pedidos.activos.count', this.pedidos.size);
      this.logger.info('pedidos.estado_restaurado', {
        pedidos_restaurados: restaurados,
        cuentas_con_pedidos: this.pedidosPorCuenta.size
      });
    }
  }

  // ==========================================
  // Helpers internos
  // ==========================================

  _calcularSubtotal(pedido) {
    return pedido.items.reduce((sum, item) => sum + item.precio_total, 0);
  }

  _detectarCanal(cuenta_id) {
    if (!cuenta_id) return null;
    const longPrefixes = [
      ['llevadoo_', 'llevadoo'], ['mesa_', 'mesa'], ['llevar_', 'llevar'],
      ['telefono_', 'telefono'], ['tel_', 'telefono'],
      ['whatsapp_', 'whatsapp'], ['wa_', 'whatsapp'],
      ['glovo_', 'glovo'], ['delivery_', 'delivery']
    ];
    for (const [prefix, canal] of longPrefixes) {
      if (cuenta_id.startsWith(prefix)) return canal;
    }
    const shortPrefixes = [
      ['M_', 'mesa'], ['L_', 'llevar'], ['T_', 'telefono'],
      ['W_', 'whatsapp'], ['G_', 'glovo'], ['D_', 'llevadoo']
    ];
    for (const [prefix, canal] of shortPrefixes) {
      if (cuenta_id.startsWith(prefix)) return canal;
    }
    return null;
  }

}

module.exports = PedidosModule;

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

class PedidosModule extends BaseModule {
  constructor() {
    super();
    this.name = 'pedidos';
    this.version = require('./module.json').version;   // fuente única (antes 3.2.0 clavado divergía del manifest)

    this.pedidos = new Map();
    this.pedidosPorCuenta = new Map();
    this.pedidosPorProject = new Map();
    this.productosCache = new Map();
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
          estaciones: producto.estaciones || null
        });
      }
    }
    this.logger.info('pedidos.catalogo.synced', {
      productos_en_cache: this.productosCache.size
    });
  }

  async onProductoActualizado(event) {
    const data = event?.data || event?.payload || event;
    const { id, nombre, precio, categoria } = data || {};
    if (id && precio !== undefined) {
      this.productosCache.set(id, { nombre: nombre || id, precio, categoria });
      this.logger.info('pedidos.producto.cache_updated', { producto_id: id, precio });
    }
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
        cliente_nombre,
        modo_consumo,
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

      // MODO DE CONSUMO (el CANAL, lo que marca el ritmo): mesa | recoger | llevar.
      // Es lo que el cliente elige en la PWA junto al nombre. Opcional: si no llega
      // (caller legacy), 'llevar' preserva el comportamiento previo (tienda = takeaway).
      const MODOS_CONSUMO = ['mesa', 'recoger', 'llevar'];
      const modo_consumo_norm = MODOS_CONSUMO.includes(modo_consumo) ? modo_consumo : 'llevar';
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
        modo_consumo: modo_consumo_norm,
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
      pedido.enviado_cocina_at = new Date().toISOString();
      await this._crearCuentaTienda(pedido, { correlation_id });

      // pedido.creado DESPUÉS de crear la cuenta → ya lleva cuenta_id (lo usa el
      // whatsapp-bot para confirmar al cliente y para avisarle "ven a recoger".
      await this._publishPedidoCreado(pedido, { correlation_id });

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

  // Crea una cuenta POS operativa desde un pedido de tienda y la alimenta por el
  // FLUJO REAL del comandero (no se reinventa nada, todo eventos):
  //   cuentas.handleCreateCuenta  → cuenta vacía
  //   comandero.handleAddItem (×N) → comandero.item_agregado → cuentas suma el total
  //                                  (el cobro lee ESE total del buffer)
  //   comandero.handleEnviarCocina → comandero.enviar_cocina → bridge → cocina
  // Mismo patrón de delegación por instancia que cuentas-canales. Si falta algún
  // módulo o algo falla, cae al envío directo a cocina (no romper).
  async _crearCuentaTienda(pedido, sourcePayload) {
    const cuentas   = this.moduleRegistry?.get('cuentas')?.instance;
    const comandero = this.moduleRegistry?.get('comandero')?.instance;
    if (!cuentas?.handleCreateCuenta || !comandero?.handleAddItem || !comandero?.handleEnviarCocina) {
      this.logger.warn('pedidos.tienda.modulos_no_disponibles', {
        pedido_id: pedido.id, cuentas: !!cuentas, comandero: !!comandero
      });
      await this._enviarTiendaACocina(pedido, sourcePayload);
      return null;
    }

    const project_id = pedido.project_id || pedido.project_slug;
    const correlation_id = sourcePayload?.correlation_id || null;

    try {
      // 1) Cuenta operativa SIN pedido_inicial (ese atajo salta el buffer del comandero).
      const cuentaRes = await cuentas.handleCreateCuenta({
        project_id,
        tipo: pedido.modo_consumo || 'llevar',     // MODO del cliente: mesa | recoger | llevar.
                                                  // cuentas lo canoniza a CANAL (recoger→llevar).
        nombre: pedido.cliente_nombre || null,
        metadata: {
          origen: 'tienda',
          canal_origen: pedido.canal_origen || null,
          modo_consumo: pedido.modo_consumo || null,
          hora_recogida: pedido.hora_recogida || null,
          cliente_nombre: pedido.cliente_nombre || null,
          cliente_telefono: pedido.cliente_telefono || null,
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
        await this._enviarTiendaACocina(pedido, sourcePayload);
        return null;
      }
      const cuenta_id = cuentaRes.data.id;
      pedido.cuenta_id = cuenta_id;

      // 2) Cargar items en el buffer del comandero (precio por unidad del pedido).
      //    Si algún item no trae precio, una línea agregada con el total → el cobro
      //    nunca queda en 0. precio_canal_resuelto:true → comandero confía el precio.
      const conPrecio = pedido.items.length > 0 &&
        pedido.items.every(it => Number.isInteger(it.precio_unitario_centimos));
      if (conPrecio) {
        for (const it of pedido.items) {
          await comandero.handleAddItem({
            cuenta_id, project_id,
            producto_id: it.producto_id || `tienda:${this._slugItem(it.descripcion)}`,
            nombre: it.descripcion,
            precio: it.precio_unitario_centimos / 100,
            cantidad: it.cantidad,
            precio_canal_resuelto: true,
            // Estructura → el comandero la guarda y la reenvía en enviar_cocina → cocina la pinta.
            // `tipo` solo mitad/al_gusto (enum del comandero); normal va solo con `variaciones`.
            ...((it.tipo === 'mitad_mitad' || it.tipo === 'al_gusto') ? { tipo: it.tipo } : {}),
            ...(it.variaciones ? { variaciones: it.variaciones } : {}),
            ...(Array.isArray(it.ingredientes_base) ? { ingredientes_base: it.ingredientes_base } : {}),
            ...(it.pizza_izquierda ? { pizza_izquierda: it.pizza_izquierda } : {}),
            ...(it.pizza_derecha ? { pizza_derecha: it.pizza_derecha } : {})
          });
        }
      } else {
        await comandero.handleAddItem({
          cuenta_id, project_id,
          producto_id: 'tienda:pedido',
          nombre: `Pedido tienda${pedido.cliente_nombre ? ' · ' + pedido.cliente_nombre : ''}`,
          precio: pedido.total,
          cantidad: 1,
          precio_canal_resuelto: true
        });
      }

      // 3) Enviar a cocina por el flujo normal del comandero.
      //    pedido_id = el id de ESTE pedido de tienda: comandero y pedidos hablan del mismo.
      //    project_id viaja explícito: sin él, comandero cae a DEFAULT_PROJECT_ID ('default').
      await comandero.handleEnviarCocina({ cuenta_id, project_id, pedido_id: pedido.id });

      this.metrics?.increment?.('pedidos.tienda.cuenta_creada', { project: pedido.project_slug });
      this.logger.info('pedidos.tienda.cuenta_creada', {
        pedido_id: pedido.id, cuenta_id, ref_display: cuentaRes.data.ref_display,
        items: pedido.items.length, con_precio: conPrecio
      });
      return cuentaRes.data;
    } catch (err) {
      this.logger.error('pedidos.tienda.cuenta_create_error', { pedido_id: pedido.id, error: err.message });
      await this._enviarTiendaACocina(pedido, sourcePayload);
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
      ref_display: `🛍 ${pedido.cliente_nombre || pedido.id.slice(0, 6)}`,
      project_id: pedido.project_id || pedido.project_slug || null,
      items: (pedido.items || []).map(it => ({
        item_id: it.item_id,
        producto_id: it.producto_id || null,
        nombre: it.descripcion,                     // tienda usa `descripcion` como nombre legible
        cantidad: it.cantidad
      })),
      items_count: (pedido.items || []).length,
      notas_generales: pedido.notas_generales || null,
      enviado_at: pedido.enviado_cocina_at || new Date().toISOString(),
      metadata: { tipo: 'tienda', modo_consumo: pedido.modo_consumo || null, hora_recogida: pedido.hora_recogida || null, cliente_nombre: pedido.cliente_nombre || null, cliente_telefono: pedido.cliente_telefono || null }
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

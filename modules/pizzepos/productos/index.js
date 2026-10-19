/**
 * Módulo Productos — PROYECTOR SIN ESTADO sobre carta-manager.
 *
 * Rediseño FASE 1 (subsistema-carta → productos). productos deja de tener store propio.
 * La CARTA (carta-manager) es la ÚNICA fuente de verdad. productos PROYECTA la carta
 * activa del proyecto a formato POS al vuelo (carta.get.request → reflejo, milisegundos).
 * No hay copia que acumule (adiós a los 29 fantasmas), no hay leak cross-project (cada
 * lectura es de LA carta de ESE proyecto; sin "primer proyecto con datos"), no hay stale
 * (siempre la carta del momento).
 *
 *   catalogo == proyectar(carta_activa)   — SIEMPRE, por construcción.
 *
 * Antes: productosPerProject + catalogo_activo.json + syncCatalogo (merge incremental que
 * derivaba) + loadCartaFromProject (unión de TODAS las cartas). Todo eliminado.
 *
 * REQUIERE carta-manager híbrido (reflejo) desplegado: sirve carta.get/list.request en ms.
 * Antes productos cacheaba porque leer la carta costaba un turno LLM; ya no.
 *
 * Emite : catalogo.actualizado (SEÑAL de refresco — el comandero re-pull y proyecta fresco).
 * Consume: carta.actualizada/editada/borrada, tarifas.config.actualizada, project.activated.
 */

const path = require('path');
const crypto = require('crypto');

const BaseModule = require('../../_shared/base-module');
class ProductosModule extends BaseModule {
  constructor() {
    super();
    this.name = 'productos';
    this.version = '5.2.0';

    // Dependencias (inyectadas en onLoad)
    this.uiHandler = null;
    this.config = {};

    // mapping canal->carta_id por proyecto (de tarifas.config.actualizada). Resuelve QUÉ carta
    // es la activa por canal/general. ÚNICO estado que productos conserva.
    this.mappingCanalesPerProject = new Map();

    // base_path por proyecto (cache; lo puebla project.activated / project.get.response).
    this.storageSection = 'pizzepos';
    this.projectPaths = new Map();
    this.pendingProjectRequests = new Map();
  }

  // ==========================================
  // Helpers de respuesta / evento
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
    if (code === 'EACCES' || code === 'EPERM') return { status: 500, code: 'UNKNOWN_ERROR' };
    if (/required|invalid|missing|requerido/i.test(msg)) return { status: 400, code: 'INVALID_INPUT' };
    if (/not found|no encontrado/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/timeout/i.test(msg)) return { status: 504, code: 'UPSTREAM_TIMEOUT' };
    return { status: 500, code: 'UNKNOWN_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'handler') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, { kind, error_code: code, error_message: err?.message || String(err) });
    this.metrics?.increment?.('productos.errors', { code, kind });
    return this._errorResponse(status, code, err?.message || 'Error interno');
  }

  async _publicarEvento(name, payload, sourcePayload) {
    const correlation_id =
      payload?.correlation_id ||
      sourcePayload?.correlation_id ||
      sourcePayload?.metadata?.correlationId ||
      sourcePayload?.data?.correlation_id ||
      null;
    const project_id =
      payload?.project_id ??
      sourcePayload?.project_id ??
      sourcePayload?.data?.project_id ??
      null;
    const enriched = { ...payload, correlation_id, timestamp: payload?.timestamp || new Date().toISOString() };
    if (project_id !== null && project_id !== undefined) enriched.project_id = project_id;
    await this.eventBus.publish(name, enriched);
    return enriched;
  }

  // ==========================================
  // RPC al bus — publica <ev>.request y espera <ev>.response por request_id.
  // Best-effort: si no llega en timeout_ms, resuelve null (no cuelga el handler).
  // ==========================================
  async _rpc(evento, payload = {}, { timeout_ms = 5000 } = {}) {
    if (!this.eventBus?.subscribe || !this.eventBus?.publish) return null;
    const request_id = crypto.randomUUID();
    const responseEvent = evento.endsWith('.request')
      ? evento.slice(0, -('.request'.length)) + '.response'
      : `${evento}.response`;
    return new Promise((resolve) => {
      let unsub = null;
      const timeout = setTimeout(() => { if (unsub) unsub(); resolve(null); }, timeout_ms);
      try {
        unsub = this.eventBus.subscribe(responseEvent, (event) => {
          const d = event?.data || event;
          if (!d || d.request_id !== request_id) return;
          clearTimeout(timeout);
          if (unsub) unsub();
          resolve(d);
        });
        this.eventBus.publish(evento, { request_id, ...payload });
      } catch (_) {
        clearTimeout(timeout);
        if (unsub) unsub();
        resolve(null);
      }
    });
  }

  // ==========================================
  // Resolución de la carta activa (canal → tarifas → general → en_servicio)
  // ==========================================

  async _resolverCartaActiva(project_id, canal, carta_id) {
    if (carta_id) return carta_id;                              // el caller ya resolvió (carta de canal)
    const map = this.mappingCanalesPerProject.get(project_id) || {};
    if (canal && map[canal]) return map[canal];                 // override de canal
    if (map.general) return map.general;                        // general (de tarifas)
    return this._cartaEnServicio(project_id);                   // fallback robusto: pregunta a carta-manager
  }

  async _cartaEnServicio(project_id) {
    const r = await this._rpc('carta.list.request', { project_id }, { timeout_ms: 5000 });
    if (!r || r.status !== 200 || !Array.isArray(r.data)) return null;
    const list = r.data;
    const enServicio = list.find(c => c.estado === 'en_servicio');
    if (enServicio) return enServicio.id;
    const activa = list.find(c => c.estado !== 'archivada');
    return (activa || list[0])?.id || null;
  }

  // La carta DEL MOMENTO, fuente única (vía carta-manager reflejo). null si no hay.
  async _cartaActiva(project_id, canal, carta_id) {
    const cid = await this._resolverCartaActiva(project_id, canal, carta_id);
    if (!cid) return null;
    const r = await this._rpc('carta.get.request', { project_id, carta_id: cid }, { timeout_ms: 5000 });
    if (!r || r.status !== 200 || !r.data) return null;
    return r.data;
  }

  // ==========================================
  // Proyección carta → POS (función pura, sin guardar)
  // ==========================================

  _proyectar(carta) {
    const cats = Array.isArray(carta?.categorias) ? carta.categorias : [];
    const categorias = cats
      .filter(c => c.activa !== false)
      .sort((a, b) => (a.orden || 0) - (b.orden || 0))
      .map(c => ({ ...c, activa: true }));

    // estaciones por categoría (para herencia al producto)
    const catEst = {};
    for (const c of cats) {
      if (c.estaciones) { catEst[c.id] = c.estaciones; if (c.nombre) catEst[c.nombre] = c.estaciones; }
    }

    const productos = (Array.isArray(carta?.productos) ? carta.productos : [])
      .filter(p => p.activo !== false)
      .map(p => this._proyectarProducto(p, catEst));

    return { categorias, productos };
  }

  // Un producto de la carta → forma POS. Tolera el drift categoria/categoria_id e ingredientes/_base.
  _proyectarProducto(p, catEst) {
    const categoria_id = p.categoria_id || p.categoria || null;
    const prod = {
      id: p.id,
      nombre: p.nombre,
      precio: (p.precio ?? p.precio_base ?? 0),
      categoria: p.categoria || p.categoria_id || null,
      categoria_id,
      activo: p.activo !== false
    };
    if (p.tipo) prod.tipo = p.tipo;
    if (p.descripcion) prod.descripcion = p.descripcion;
    if (p.imagen) prod.imagen = p.imagen;
    if (Array.isArray(p.alergenos)) prod.alergenos = p.alergenos;
    if (Array.isArray(p.etiquetas)) prod.etiquetas = p.etiquetas;
    if (p.disponible !== undefined) prod.disponible = p.disponible;
    if (p.variaciones && typeof p.variaciones === 'object') prod.variaciones = p.variaciones;

    if (Array.isArray(p.ingredientes_base) && p.ingredientes_base.length) {
      prod.ingredientes_base = p.ingredientes_base;
    } else if (Array.isArray(p.ingredientes) && p.ingredientes.length) {
      prod.ingredientes_base = p.ingredientes.map(ing => {
        const r = { id: ing.id || `ing_${this.slugify(ing.nombre)}`, nombre: ing.nombre, emoji: ing.emoji || '' };
        if (ing.familia) r.familia = ing.familia;
        if (ing.tipo) r.tipo = ing.tipo;
        if (ing.precio_extra != null) r.precio_extra = ing.precio_extra;
        return r;
      });
    }

    if (!prod.estaciones && categoria_id && catEst[categoria_id]) prod.estaciones = catEst[categoria_id];
    return prod;
  }

  // Catálogo de ingredientes PROYECTADO desde la carta (productos v5: catalogo == proyectar(carta_activa)).
  // Es lo que enciende el AlGustoPanel del comandero ("AÑADIR INGREDIENTES", agrupado por familia).
  // Union de los ingredientes de TODOS los productos (ingredientes_base o, si no, ingredientes — la carta
  // los trae bajo cualquiera de las dos claves), dedup por id (mismo id que usa _proyectarProducto, para
  // que AlGusto pueda restar lo que el producto ya lleva). Sin store en-memoria que se vacíe al reiniciar.
  _proyectarCatalogoIngredientes(carta) {
    const productos = Array.isArray(carta?.productos) ? carta.productos : [];
    const byId = new Map();
    for (const p of productos) {
      const lista = (Array.isArray(p.ingredientes_base) && p.ingredientes_base.length)
        ? p.ingredientes_base
        : (Array.isArray(p.ingredientes) ? p.ingredientes : []);
      const grupo = p.categoria_id || p.categoria || null;          // la puerta donde aparece
      for (const ing of lista) {
        if (!ing || (!ing.id && !ing.nombre)) continue;
        const id = ing.id || `ing_${this.slugify(ing.nombre)}`;
        const existente = byId.get(id);
        if (existente) {
          // ya visto en otra puerta: solo se ACUMULA dónde aparece (el resto, primero gana).
          // Así el pepinillo del bocata no cae dentro de la pizza: su grupos será ['el-fardel'].
          if (grupo && !existente.grupos.includes(grupo)) existente.grupos.push(grupo);
          continue;
        }
        const familia = ing.familia || ing.tipo || 'otro';
        byId.set(id, {
          id,
          nombre: ing.nombre || id,
          emoji: ing.emoji || '',
          familia,
          tipo: ing.tipo || familia,                                 // AlGusto agrupa por familia||tipo
          // grupos = las categorías/puertas donde vive este ingrediente. Es el filtro que ya
          // leen carta-digital (static-template extrasForGroup) y el panel. Nace del DATO que
          // viaja en la carta — sin estado nuevo, sin módulo nuevo.
          grupos: grupo ? [grupo] : [],
          precio_extra: (typeof ing.precio_extra === 'number' ? ing.precio_extra : 0),
          disponible: ing.disponible !== false,
          // alérgenos heredados del módulo `ingredientes` (si la carta los trae en el ingrediente)
          alergenos: Array.isArray(ing.alergenos) ? ing.alergenos : [],
          es_alergeno: ing.es_alergeno === true || (Array.isArray(ing.alergenos) && ing.alergenos.length > 0)
        });
      }
    }
    return Array.from(byId.values()).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  }

  // ==========================================
  // Lifecycle
  // ==========================================


  // ── IDENTIDAD DE CARRIL (misma doctrina que el filesystem) ──────────────────
  // `projectPaths` se indexa bajo TODAS las caras del mismo proyecto (UUID · slug · nombre
  // del directorio): da igual cómo lo llame el caller — el chat manda el slug, el frontend
  // el UUID. El slug llega EN EL EVENTO (lo emite project-manager): antes cada módulo lo
  // derivaba por su cuenta, y el que lo calculaba distinto (espacio, acento, rename) no
  // encontraba nada y acababa escribiendo en el proyecto activo.
  _carasProyecto(project_id, name, base_path, slug) {
    const caras = [project_id];
    if (slug) caras.push(slug);
    if (base_path) { try { caras.push(path.basename(base_path)); } catch (_) {} }
    return caras.filter((c, i) => c && caras.indexOf(c) === i);
  }
  _indexarCarril(project_id, valor, { name = null, base_path = null, slug = null } = {}) {
    if (!project_id) return;
    for (const cara of this._carasProyecto(project_id, name, base_path, slug)) this.projectPaths.set(cara, valor);
  }
  _olvidarCarril(project_id, { name = null, base_path = null, slug = null } = {}) {
    const v = this.projectPaths.get(project_id);
    for (const cara of this._carasProyecto(project_id, name, base_path, slug)) {
      if (this.projectPaths.get(cara) === v) this.projectPaths.delete(cara);
    }
  }
  // Se hidrata desde la fuente de verdad al onLoad: tras un hot-reload no llega ningún
  // project.activated y el mapa nacería con SOLO los activos, sin poder resolver el resto.
  _hidratarCarriles() {
    if (!this.eventBus || !this.eventBus.publish) return;
    this._hidrataCarrilesRequestId = `carriles-${this.name || 'mod'}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    try { this.eventBus.publish('project.list.request', { request_id: this._hidrataCarrilesRequestId }); } catch (_) {}
  }
  async onProjectListResponse(event) {
    const data = event?.data || event?.payload || event;
    if (!data || data.request_id !== this._hidrataCarrilesRequestId) return;   // respuestas ajenas
    let n = 0;
    for (const p of (Array.isArray(data.projects) ? data.projects : [])) {
      if (!p?.id || !p?.base_path) continue;
      if (p.metadata?.is_system === true) continue;
      this._indexarCarril(p.id, path.join(p.base_path, 'storage', this.storageSection), { name: p.name, base_path: p.base_path, slug: p.slug });
      n++;
    }
    this.logger?.info?.(`${this.name}.carriles.hidratados`, { carriles: this.projectPaths.size, proyectos: n });
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;
    this.config = core.config || {};
    this.logger.info('module.loaded', { module: this.name, version: this.version, mode: 'proyector-sin-estado' });
    this._hidratarCarriles();
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });
    this.mappingCanalesPerProject.clear();
    this.projectPaths.clear();
    for (const [, pending] of this.pendingProjectRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Module unloading'));
    }
    this.pendingProjectRequests.clear();
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Project path resolution (cache base_path; wired)
  // ==========================================

  async onProjectActivated(event) {
    const data = event.data || event;
    const { project_id, base_path, name, slug } = data;
    if (!project_id) return;
    if (base_path) this._indexarCarril(project_id, path.join(base_path, 'storage', this.storageSection), { name, base_path, slug });

    const correlation_id = event?.metadata?.correlationId || crypto.randomUUID();
    // Hidratar el mapping canal->carta_id pidiendo snapshot a tarifas (fire-and-forget).
    try {
      await this.eventBus.publish('tarifas.config.solicitada', {
        project_id, tipo: 'snapshot', correlation_id, timestamp: new Date().toISOString()
      });
    } catch (err) {
      this.logger.warn('tarifas.config.solicitada.publish_failed', { project_id, error: err?.message });
    }

    // Warm del comandero: proyectar la carta activa y emitir catalogo.actualizado. Sin store.
    try {
      const carta = await this._cartaActiva(project_id);
      if (carta) await this._emitCatalogo(project_id, carta, 'project_activated', event);
    } catch (err) {
      this.logger.warn('productos.activate.project_failed', { project_id, error: err.message });
    }
  }

  async onProjectGetResponse(event) {
    const { request_id, success, project } = event.data || event;
    const pending = this.pendingProjectRequests.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingProjectRequests.delete(request_id);
    if (success && project) {
      if (project.base_path) {
        this._indexarCarril(project.id, path.join(project.base_path, 'storage', this.storageSection), { name: project.name, base_path: project.base_path, slug: project.slug });
      }
      pending.resolve(project);
    } else {
      pending.reject(new Error('Project not found'));
    }
  }

  async resolveStoragePath(projectId) {
    if (this.projectPaths.has(projectId)) return this.projectPaths.get(projectId);
    const requestId = crypto.randomUUID();
    const project = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingProjectRequests.delete(requestId);
        reject(new Error(`Project path resolve timeout: ${projectId}`));
      }, 5000);
      this.pendingProjectRequests.set(requestId, { resolve, reject, timeout });
      this.eventBus.publish('project.get.request', { request_id: requestId, project_id: projectId }).catch(err => {
        clearTimeout(timeout);
        this.pendingProjectRequests.delete(requestId);
        reject(err);
      });
    });
    return this.projectPaths.get(projectId) || path.join(project.base_path, 'storage', this.storageSection);
  }

  // ==========================================
  // Eventos de carta — SEÑAL de refresco (no hay store que sincronizar)
  // ==========================================

  // Emite catalogo.actualizado con la proyección lite (el comandero re-pull carta_completa).
  async _emitCatalogo(project_id, carta, source, sourceEvent) {
    const { productos } = this._proyectar(carta);
    await this._publicarEvento('catalogo.actualizado', {
      project_id,
      menu_id: carta?.meta?.id || null,
      source,
      productos: productos.map(p => ({
        id: p.id, nombre: p.nombre, precio: p.precio, categoria: p.categoria || null, estaciones: p.estaciones || null
      }))
    }, sourceEvent);
    this.metrics?.increment?.('catalogo.actualizado.total');
  }

  // carta.actualizada / carta.editada — la carta entera viene en el payload: la proyectamos
  // y emitimos la señal. Sin tocar disco, sin acumular.
  async onCartaGenerada(event) {
    const data = event?.data || event?.payload || event;
    const carta = data?.carta || data;
    if (!carta?.meta?.id || !carta?.productos) {
      this.logger.debug('carta.evento.ignored', { reason: 'no carta.meta.id or carta.productos' });
      return;
    }
    const project_id = data?.project_id || carta.project_id;
    if (!project_id) { this.logger.warn('carta.evento.no_project', { carta_id: carta.meta.id }); return; }
    try {
      await this._emitCatalogo(project_id, carta, 'carta_change', event);
      this.logger.info('carta.evento.proyectado', { carta_id: carta.meta.id, project_id, productos: carta.productos.length });
    } catch (err) {
      this.logger.error('carta.evento.error', { carta_id: carta.meta.id, project_id, error: err.message });
    }
  }

  // carta.borrada — la borrada deja de ser la activa: re-proyectamos la que quede (si queda).
  async onCartaBorrada(event) {
    const data = event?.data || event?.payload || event;
    const carta = data?.carta || data;
    if (!carta?.meta?.id) { this.logger.debug('carta.borrada.ignored', { reason: 'no carta.meta.id' }); return; }
    const project_id = data?.project_id || carta.project_id;
    if (!project_id) { this.logger.warn('carta.borrada.no_project', { carta_id: carta.meta.id }); return; }
    try {
      const activa = await this._cartaActiva(project_id);
      if (activa) {
        await this._emitCatalogo(project_id, activa, 'carta_borrada', event);
      } else {
        await this._publicarEvento('catalogo.actualizado', {
          project_id, menu_id: carta.meta.id, source: 'carta_borrada', productos: []
        }, event);
        this.metrics?.increment?.('catalogo.actualizado.total');
      }
      this.logger.info('carta.borrada.aplicada', { carta_id: carta.meta.id, project_id });
    } catch (err) {
      this.logger.error('carta.borrada.error', { carta_id: carta.meta.id, project_id, error: err.message });
    }
  }

  // tarifas.config.actualizada — cachea el mapping canal->carta_id (resolución de carta activa).
  async onTarifasConfigActualizada(event) {
    const data = event?.data || event?.payload || event;
    const project_id = data?.project_id;
    if (!project_id) { this.logger.debug('tarifas.config.actualizada.no_project_id', {}); return; }
    const config = data?.config;
    if (!config) { this.logger.debug('tarifas.config.actualizada.no_config', { project_id }); return; }
    const correlation_id = event?.metadata?.correlationId || data?.correlation_id || crypto.randomUUID();
    const canales = config.canales || {};
    const mapping = {
      general: config.general || null,
      mesa: canales.mesa || null,
      telefono: canales.telefono || null,
      llevar: canales.llevar || null,
      glovo: canales.glovo || null,
      whatsapp: canales.whatsapp || null,
      llevadoo: canales.llevadoo || null
    };
    this.mappingCanalesPerProject.set(project_id, mapping);
    this.logger.info('tarifas.config.applied', {
      project_id,
      tipo: data?.tipo || 'unknown',
      mapping_general: mapping.general,
      canales_con_override: Object.keys(mapping).filter(k => k !== 'general' && mapping[k] !== null),
      correlation_id
    });
  }

  // ==========================================
  // UI Handlers — todos proyectan la carta activa (sin store, sin leak)
  // ==========================================

  async handleCartaCompleta(data) {
    try {
      const { project_id, canal, carta_id } = data || {};
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      const carta = await this._cartaActiva(project_id, canal, carta_id);
      if (!carta) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'No hay carta activa para el proyecto', { project_id });

      const { categorias, productos } = this._proyectar(carta);
      const productosOut = productos.map(p => ({
        ...p,
        tiene_variaciones: Array.isArray(p.ingredientes_base) && p.ingredientes_base.length > 0
      }));

      // Catálogo PROYECTADO desde esta misma carta (consistente con productos v5; no depende del store en-memoria).
      const ingredientes = this._proyectarCatalogoIngredientes(carta);

      return {
        status: 200,
        data: {
          project_id,
          carta_id: carta?.meta?.id || carta_id || null,
          categorias,
          productos: productosOut,
          ingredientes,
          total_categorias: categorias.length,
          total_productos: productosOut.length,
          total_ingredientes: ingredientes.length
        }
      };
    } catch (err) {
      return this._handleHandlerError('productos.carta_completa.error', err, 'carta_completa');
    }
  }

  async handleListProductos(data) {
    try {
      const start_time = Date.now();
      const { project_id, categoria, categoria_id, activo, canal, carta_id } = data || {};
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });

      const carta = await this._cartaActiva(project_id, canal, carta_id);
      let productos = carta ? this._proyectar(carta).productos : [];

      if (categoria) productos = productos.filter(p => p.categoria === categoria);
      if (categoria_id) productos = productos.filter(p => p.categoria_id === categoria_id || p.categoria === categoria_id);
      if (activo !== undefined) {
        const activoBoolean = activo === 'true' || activo === true;
        productos = productos.filter(p => (p.activo !== false) === activoBoolean);
      }

      productos.sort((a, b) =>
        a.categoria !== b.categoria
          ? (a.categoria || '').localeCompare(b.categoria || '')
          : (a.nombre || '').localeCompare(b.nombre || ''));

      this.metrics?.timing?.('producto.list.duration', Date.now() - start_time);
      return { status: 200, data: { project_id, productos, total: productos.length } };
    } catch (err) {
      return this._handleHandlerError('productos.list.error', err, 'list');
    }
  }

  async handleGetProducto(data) {
    try {
      const { project_id, id, canal, carta_id } = data || {};
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'id es requerido', { field: 'id' });
      const carta = await this._cartaActiva(project_id, canal, carta_id);
      const producto = carta ? this._proyectar(carta).productos.find(p => p.id === id) : null;
      if (!producto) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Producto no encontrado', { id });
      return { status: 200, data: producto };
    } catch (err) {
      return this._handleHandlerError('productos.get.error', err, 'get');
    }
  }

  async handleSearchProductos(data) {
    try {
      const start_time = Date.now();
      const { project_id, q, canal, carta_id } = data || {};
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      if (!q) return this._errorResponse(400, 'INVALID_INPUT', 'Parametro q requerido', { field: 'q' });

      const carta = await this._cartaActiva(project_id, canal, carta_id);
      const searchTerm = q.toLowerCase();
      const resultados = (carta ? this._proyectar(carta).productos : []).filter(p =>
        p.activo !== false &&
        ((p.nombre || '').toLowerCase().includes(searchTerm) ||
         (p.descripcion && p.descripcion.toLowerCase().includes(searchTerm)))
      );

      this.metrics?.timing?.('producto.search.duration', Date.now() - start_time);
      return { status: 200, data: { project_id, resultados, total: resultados.length, query: q } };
    } catch (err) {
      return this._handleHandlerError('productos.search.error', err, 'search');
    }
  }

  async handleListCategorias(data) {
    try {
      const { project_id, canal, carta_id } = data || {};
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      const carta = await this._cartaActiva(project_id, canal, carta_id);
      if (!carta) return { status: 200, data: { project_id, categorias: [], total: 0 } };

      const { categorias, productos } = this._proyectar(carta);
      const categoriasConConteo = categorias.map(cat => ({
        ...cat,
        productos_count: productos.filter(p => (p.categoria === cat.nombre || p.categoria_id === cat.id) && p.activo !== false).length
      }));
      return { status: 200, data: { project_id, categorias: categoriasConConteo, total: categorias.length } };
    } catch (err) {
      return this._handleHandlerError('productos.categorias.error', err, 'categorias');
    }
  }

  async handleListIngredientes(data) {
    try {
      const { project_id, canal, carta_id, tipo } = data || {};
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      // PROYECTADO desde la carta activa (no un store en-memoria que se vacía). El AlGustoPanel lo agrupa por familia.
      const carta = await this._cartaActiva(project_id, canal, carta_id);
      if (!carta) return { status: 200, data: { project_id, carta_id: carta_id || null, ingredientes: [], total: 0 } };
      let ingredientes = this._proyectarCatalogoIngredientes(carta);
      if (tipo) ingredientes = ingredientes.filter(i => i.familia === tipo || i.tipo === tipo);
      return { status: 200, data: { project_id, carta_id: carta?.meta?.id || carta_id || null, ingredientes, total: ingredientes.length } };
    } catch (err) {
      return this._handleHandlerError('productos.ingredientes.error', err, 'ingredientes');
    }
  }

  // ── dominio UI 'ingredientes' ────────────────────────────────────────────────
  // El módulo `ingredientes` (pizzepos) se RETIRÓ: su store en-memoria nunca se alimentaba
  // (el handler de carta.actualizada desestructuraba claves que el emisor ya no manda) → su
  // catálogo era 0. Su única capacidad viva, la autoridad de precio_extra, YA VIVE en el
  // custodio (carta.update_extras.request: cambia el precio en TODAS las apariciones, una
  // versión). Aquí se REBINDA su contrato UI (domain 'ingredientes') sobre la MISMA proyección
  // de la carta que sirve productos.ingredientes: una sola fuente, cero stale, cero copia.
  async _ctxIngredientes(data) {
    const { project_id, canal, carta_id } = data || {};
    if (!project_id) return null;
    const carta = await this._cartaActiva(project_id, canal, carta_id);
    return {
      project_id,
      carta_id: carta?.meta?.id || carta_id || null,
      ingredientes: carta ? this._proyectarCatalogoIngredientes(carta) : []
    };
  }

  async handleIngredientesList(data) {
    try {
      const ctx = await this._ctxIngredientes(data);
      if (!ctx) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      const { tipo, grupo, alergeno } = data || {};
      let ings = ctx.ingredientes;
      if (grupo) ings = ings.filter(i => (i.grupos || []).includes(grupo));
      if (tipo) ings = ings.filter(i => i.familia === tipo || i.tipo === tipo);
      if (alergeno === 'true' || alergeno === true) ings = ings.filter(i => i.es_alergeno === true);
      return { status: 200, data: { project_id: ctx.project_id, ingredientes: ings, total: ings.length } };
    } catch (err) {
      return this._handleHandlerError('ingredientes.ui.list.failed', err, 'ui_list');
    }
  }

  async handleIngredientesGet(data) {
    try {
      const { id } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'id es requerido', { field: 'id' });
      const ctx = await this._ctxIngredientes(data);
      if (!ctx) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      const ing = ctx.ingredientes.find(i => i.id === id);
      if (!ing) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Ingrediente no encontrado', { entity_type: 'ingrediente', entity_id: id });
      return { status: 200, data: ing };
    } catch (err) {
      return this._handleHandlerError('ingredientes.ui.get.failed', err, 'ui_get');
    }
  }

  async handleIngredientesGetPrecio(data) {
    try {
      const { ingrediente_id } = data || {};
      if (!ingrediente_id) return this._errorResponse(400, 'INVALID_INPUT', 'ingrediente_id es requerido', { field: 'ingrediente_id' });
      const ctx = await this._ctxIngredientes(data);
      if (!ctx) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      const ing = ctx.ingredientes.find(i => i.id === ingrediente_id);
      if (!ing) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Ingrediente no encontrado', { entity_type: 'ingrediente', entity_id: ingrediente_id });
      return { status: 200, data: { ingrediente_id, precio_extra: ing.precio_extra || 0, disponible: ing.disponible !== false } };
    } catch (err) {
      return this._handleHandlerError('ingredientes.ui.get_precio.failed', err, 'ui_get_precio');
    }
  }

  async handleIngredientesSearch(data) {
    try {
      const { q, grupo } = data || {};
      if (!q) return this._errorResponse(400, 'INVALID_INPUT', 'q (query) es requerido', { field: 'q' });
      const ctx = await this._ctxIngredientes(data);
      if (!ctx) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      const term = String(q).toLowerCase();
      let res = ctx.ingredientes.filter(i => String(i.nombre).toLowerCase().includes(term));
      if (grupo) res = res.filter(i => (i.grupos || []).includes(grupo));
      return { status: 200, data: { resultados: res, total: res.length, query: q } };
    } catch (err) {
      return this._handleHandlerError('ingredientes.ui.search.failed', err, 'ui_search');
    }
  }

  async handleIngredientesAlergenos(data) {
    try {
      const ctx = await this._ctxIngredientes(data);
      if (!ctx) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      const alergenos = ctx.ingredientes.filter(i => i.es_alergeno === true);
      const por_tipo = {};
      for (const ing of alergenos) for (const a of (ing.alergenos || [])) { (por_tipo[a] = por_tipo[a] || []).push({ id: ing.id, nombre: ing.nombre, emoji: ing.emoji }); }
      return { status: 200, data: { alergenos, total: alergenos.length, por_tipo } };
    } catch (err) {
      return this._handleHandlerError('ingredientes.ui.alergenos.failed', err, 'ui_alergenos');
    }
  }

  // Editar el precio del extra = delegar en el CUSTODIO (una versión, todas las apariciones).
  async handleIngredientesUpdate(data) {
    try {
      const { project_id, id, ...updates } = data || {};
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'id es requerido', { field: 'id' });
      if (updates.precio_extra == null) {
        return this._errorResponse(400, 'INVALID_INPUT',
          'Solo el precio del extra se edita aquí (precio_extra) — vive en la carta. Nombre/emoji/etc. se editan en la carta o el menú-generator.',
          { fields: Object.keys(updates), hint: 'action=update_precios, o edita el ingrediente en la Carta' });
      }
      return this.handleIngredientesUpdatePrecios({ ...data, id, precio_extra: updates.precio_extra });
    } catch (err) {
      return this._handleHandlerError('ingredientes.ui.update.failed', err, 'ui_update');
    }
  }

  async handleIngredientesUpdatePrecios(data) {
    try {
      const { project_id, id, tipo, grupo, precio_extra, porcentaje, canal, carta_id } = data || {};
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      if (precio_extra == null && porcentaje == null) {
        return this._errorResponse(400, 'INVALID_INPUT', 'precio_extra o porcentaje es requerido', { fields: ['precio_extra', 'porcentaje'] });
      }
      const ctx = await this._ctxIngredientes(data);
      if (!ctx) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      let objetivo = ctx.ingredientes;
      if (id) objetivo = objetivo.filter(i => i.id === id);
      if (grupo) objetivo = objetivo.filter(i => (i.grupos || []).includes(grupo));
      if (tipo) objetivo = objetivo.filter(i => i.familia === tipo || i.tipo === tipo);
      if (objetivo.length === 0) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'No se encontraron ingredientes con ese filtro', { filter: { id, tipo, grupo } });
      }
      const filas = objetivo.map(i => {
        const anterior = Number(i.precio_extra) || 0;
        const nuevo = porcentaje != null ? Math.round(anterior * (1 + porcentaje / 100) * 100) / 100 : Number(precio_extra);
        return { id: i.id, anterior, nuevo };
      });
      const cid = await this._resolverCartaActiva(project_id, canal, carta_id);
      if (!cid) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'No hay carta activa para el proyecto', { project_id });
      const r = await this._rpc('carta.update_extras.request',
        { project_id, carta_id: cid, updates: filas.map(f => ({ ingrediente_id: f.id, precio_extra_nuevo: f.nuevo })) }, { timeout_ms: 8000 });
      if (!r) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'carta-manager no responde');
      if (r.error) return { status: r.error.code === 'RESOURCE_NOT_FOUND' ? 404 : 502, error: r.error };
      return { status: 200, data: { actualizados: filas.map(f => ({ id: f.id, anterior: f.anterior, nuevo: f.nuevo })), total: filas.length, carta_id: cid, custodia: r.aplicados || null } };
    } catch (err) {
      return this._handleHandlerError('ingredientes.ui.update_precios.failed', err, 'ui_update_precios');
    }
  }

  async handleIngredientesHealth(data) {
    try {
      const ctx = await this._ctxIngredientes(data);
      const ings = ctx ? ctx.ingredientes : [];
      return { status: 200, data: { status: 'healthy', module: 'productos(ingredientes)', fuente: 'proyeccion-de-la-carta', catalogo: { total: ings.length, alergenos: ings.filter(i => i.es_alergeno).length } } };
    } catch (err) {
      return this._handleHandlerError('ingredientes.ui.health.failed', err, 'ui_health');
    }
  }

  async handleIngredientesMetrics(data) {
    try {
      const ctx = await this._ctxIngredientes(data);
      const ings = ctx ? ctx.ingredientes : [];
      const por_grupo = {};
      for (const i of ings) for (const g of (i.grupos || [])) por_grupo[g] = (por_grupo[g] || 0) + 1;
      return { status: 200, data: { gauges: { 'ingrediente.total.count': ings.length, 'ingrediente.alergenos.count': ings.filter(i => i.es_alergeno).length }, por_grupo } };
    } catch (err) {
      return this._handleHandlerError('ingredientes.ui.metrics.failed', err, 'ui_metrics');
    }
  }

  async handleListPizzas(data) {
    try {
      const { project_id, canal, carta_id } = data || {};
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      const carta = await this._cartaActiva(project_id, canal, carta_id);
      const productos = carta ? this._proyectar(carta).productos : [];
      const pizzas = productos
        .filter(p =>
          p.activo !== false && (
            (p.categoria && p.categoria.toLowerCase().startsWith('pizz')) ||
            (p.categoria_id && p.categoria_id.toLowerCase().startsWith('pizz')) ||
            p.tipo === 'pizza'
          ))
        .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
      return { status: 200, data: { project_id, pizzas, total: pizzas.length, carta_id: carta_id || carta?.meta?.id || null } };
    } catch (err) {
      return this._handleHandlerError('productos.pizzas.error', err, 'pizzas');
    }
  }

  // Mutaciones → delegan a carta-manager (la carta es la fuente de verdad; productos no escribe).
  async handleUpdateProducto(data) {
    try {
      const { project_id, id, carta_id, canal, ...updates } = data || {};
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'id es requerido', { field: 'id' });
      const cid = await this._resolverCartaActiva(project_id, canal, carta_id);
      if (!cid) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'No hay carta activa para el proyecto', { project_id });
      const r = await this._rpc('carta.update_product.request',
        { project_id, carta_id: cid, producto_id: id, campos: updates }, { timeout_ms: 8000 });
      if (!r) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'carta-manager no responde');
      return r;
    } catch (err) {
      return this._handleHandlerError('productos.update.error', err, 'update');
    }
  }

  // ── ALTA (la puerta del asistente) ───────────────────────────────────────────
  // productos NO escribe: delega en carta-manager, que es quien hace snapshot, sube version y emite.
  // La cadena que enciende UNA alta, toda por eventos (nadie cablea consumidores a mano):
  //   carta.add_product → carta-manager._mutar (version++, snapshot) → carta.editada
  //     → productos.onCartaGenerada   → catalogo.actualizado → comandero + pedidos (cache POS)
  //     → variaciones.onCartaActualizada → reconfigura reglas del producto
  //     → carta-digital._autoPublicar (debounce) → bundle re-horneado → web pública
  //   cocina: el producto llega dentro de pedido.enviado_cocina con nombre + estaciones + variaciones.
  _normalizarAlta(data) {
    const flat = data || {};
    const p = { ...(flat.producto || {}) };
    // Acepta la forma plana (nombre/precio/categoria_id/...) además de {producto:{...}}.
    const campos = ['nombre', 'precio', 'categoria_id', 'descripcion', 'etiquetas', 'alergenos', 'disponible',
      'tipo', 'emoji', 'estaciones', 'ingredientes', 'ingredientes_base', 'dietas', 'variaciones'];
    for (const k of campos) if (flat[k] !== undefined) p[k] = flat[k];
    if (typeof p.nombre === 'string') p.nombre = p.nombre.trim();
    if (typeof p.precio === 'string' && p.precio.trim() !== '') p.precio = Number(p.precio);
    return p;
  }

  async handleCrearProducto(data) {
    try {
      const { project_id, carta_id, canal } = data || {};
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      const producto = this._normalizarAlta(data);
      if (!producto.nombre) return this._errorResponse(400, 'INVALID_INPUT', 'nombre es requerido', { field: 'nombre' });
      if (!Number.isFinite(producto.precio) || producto.precio < 0) {
        return this._errorResponse(400, 'INVALID_INPUT', 'precio (€, número >= 0) es requerido', { field: 'precio' });
      }
      if (!producto.categoria_id) {
        return this._errorResponse(400, 'INVALID_INPUT', 'categoria_id es requerido (productos.categorias lista; productos.crear_categoria crea)', { field: 'categoria_id' });
      }
      const cid = await this._resolverCartaActiva(project_id, canal, carta_id);
      if (!cid) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'No hay carta activa para el proyecto', { project_id });
      const r = await this._rpc('carta.add_product.request', { project_id, carta_id: cid, producto }, { timeout_ms: 8000 });
      if (!r) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'carta-manager no responde');
      if (r.status === 201 || r.status === 200) {
        this.logger.info('productos.creado', {
          project_id, carta_id: cid,
          producto_id: r.data?.producto?.id, carta_version: r.data?.carta_version
        });
      }
      return r;
    } catch (err) {
      return this._handleHandlerError('productos.crear.error', err, 'crear');
    }
  }

  // Categoría nueva: misma puerta, mismo dueño (carta-manager). Sin esto, un producto de una
  // sección nueva no tendría dónde nacer y acabaría en un fichero paralelo (el bug de siempre).
  async handleCrearCategoria(data) {
    try {
      const { project_id, carta_id, canal } = data || {};
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      const categoria = { ...((data || {}).categoria || {}) };
      for (const k of ['nombre', 'descripcion', 'orden']) if (data?.[k] !== undefined) categoria[k] = data[k];
      if (typeof categoria.nombre === 'string') categoria.nombre = categoria.nombre.trim();
      if (!categoria.nombre) return this._errorResponse(400, 'INVALID_INPUT', 'nombre es requerido', { field: 'nombre' });
      const cid = await this._resolverCartaActiva(project_id, canal, carta_id);
      if (!cid) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'No hay carta activa para el proyecto', { project_id });
      const r = await this._rpc('carta.add_category.request', { project_id, carta_id: cid, categoria }, { timeout_ms: 8000 });
      if (!r) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'carta-manager no responde');
      if (r.status === 201 || r.status === 200) {
        this.logger.info('productos.categoria.creada', { project_id, carta_id: cid, categoria_id: r.data?.categoria?.id });
      }
      return r;
    } catch (err) {
      return this._handleHandlerError('productos.categoria.crear.error', err, 'crear_categoria');
    }
  }

  async handleDeleteProducto(data) {
    try {
      const { project_id, id, carta_id, canal } = data || {};
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'id es requerido', { field: 'id' });
      const cid = await this._resolverCartaActiva(project_id, canal, carta_id);
      if (!cid) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'No hay carta activa para el proyecto', { project_id });
      const r = await this._rpc('carta.remove_product.request',
        { project_id, carta_id: cid, producto_id: id }, { timeout_ms: 8000 });
      if (!r) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'carta-manager no responde');
      return r;
    } catch (err) {
      return this._handleHandlerError('productos.delete.error', err, 'delete');
    }
  }

  async handleGetStats(data) {
    try {
      const { project_id } = data || {};
      if (!project_id) {
        return {
          status: 200,
          data: {
            mode: 'proyector-sin-estado',
            mensaje: 'productos no mantiene store; proyecta la carta activa por proyecto',
            proyectos_con_mapping: this.mappingCanalesPerProject.size
          }
        };
      }
      const carta = await this._cartaActiva(project_id);
      if (!carta) {
        return { status: 200, data: { project_id, total_productos: 0, total_categorias: 0, productos_por_categoria: {} } };
      }
      const { categorias, productos } = this._proyectar(carta);
      const productosPorCategoria = {};
      for (const p of productos) {
        const cat = p.categoria || 'Sin categoría';
        productosPorCategoria[cat] = (productosPorCategoria[cat] || 0) + 1;
      }
      const productosConAlergenos = productos.filter(p => Array.isArray(p.alergenos) && p.alergenos.length > 0).length;
      return {
        status: 200,
        data: {
          project_id,
          carta_id: carta?.meta?.id || null,
          total_productos: productos.length,
          productos_activos: productos.length,
          total_categorias: categorias.length,
          productos_por_categoria: productosPorCategoria,
          productos_con_alergenos: productosConAlergenos
        }
      };
    } catch (err) {
      return this._handleHandlerError('productos.stats.error', err, 'stats');
    }
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        mode: 'proyector-sin-estado',
        proyectos_con_mapping: this.mappingCanalesPerProject.size
      }
    };
  }

  async handleGetMetrics() {
    return {
      status: 200,
      data: {
        counters: {
          'catalogo.actualizado.total': this.metrics?.getCounter?.('catalogo.actualizado.total') || 0
        },
        gauges: {
          'proyectos.con_mapping': this.mappingCanalesPerProject.size
        }
      }
    };
  }

  // Re-proyecta la carta activa y reemite catalogo.actualizado (refresco bajo demanda).
  async handleLoadCarta(data) {
    try {
      const { project_id } = data || {};
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      const carta = await this._cartaActiva(project_id);
      if (!carta) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'No hay carta activa para el proyecto', { project_id });
      await this._emitCatalogo(project_id, carta, 'load_carta', { data });
      const { categorias, productos } = this._proyectar(carta);
      return {
        status: 200,
        data: {
          project_id,
          carta_id: carta?.meta?.id || null,
          productos: productos.length,
          categorias: categorias.length,
          message: 'Catálogo re-proyectado desde la carta activa'
        }
      };
    } catch (err) {
      return this._handleHandlerError('productos.load_carta.error', err, 'load_carta');
    }
  }

  // ==========================================
  // Helper
  // ==========================================

  // Slugify — misma lógica que menu-generator para IDs deterministas de ingrediente.
  slugify(text) {
    if (!text) return 'sin_nombre';
    return text.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      || 'sin_nombre';
  }
}

module.exports = ProductosModule;

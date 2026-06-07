/**
 * Módulo Productos v2.3
 * Catálogo de productos - Actualizado desde menús generados por IA
 * Alineado con patrones event-core: uiHandler, event envelope, cleanup
 * Multi-tenant: cada proyecto tiene su propio catálogo
 * Persiste cambios a disco en cartas JSON
 *
 * Emite: producto.creado, producto.actualizado, producto.eliminado, catalogo.actualizado
 * Consume: carta.actualizada, carta.editada, carta.borrada, tarifas.config.actualizada (v4.0.0 subsistema-carta)
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const BaseModule = require('../../_shared/base-module');
class ProductosModule extends BaseModule {
  constructor() {
    super();
    this.name = 'productos';
    this.version = '4.0.0';

    // Dependencias (inyectadas en onLoad)
    this.uiHandler = null;
    this.config = {};

    // Estado en memoria - por proyecto
    this.productosPerProject = new Map(); // project_id -> Map<producto_id, producto>
    this.categoriasPerProject = new Map(); // project_id -> Map<categoria_id, categoria>
    this.menusPendientes = new Map(); // menu_id -> { project_id, productos_draft } (legacy: ya no se popula en v4; lo leen health/stats)
    // v4.0.0 (subsistema-carta): cache del mapping canal->carta_id por proyecto desde tarifas.config.actualizada.
    // Postura C: solo cachea. NO expone tool de resolucion --los consumers (comandero/pedidos) hacen RESOLVER_CARTA.
    this.mappingCanalesPerProject = new Map(); // project_id -> { general, mesa, telefono, llevar, glovo, whatsapp, llevadoo }

    // Rutas de storage por proyecto (project_id -> base_path/storage/pizzepos)
    this.storageSection = 'pizzepos';
    this.projectPaths = new Map();
    this.pendingProjectRequests = new Map();
  }

  // Helpers para obtener/crear maps por proyecto
  getProductos(projectId) {
    if (!this.productosPerProject.has(projectId)) {
      this.productosPerProject.set(projectId, new Map());
    }
    return this.productosPerProject.get(projectId);
  }

  getCategorias(projectId) {
    if (!this.categoriasPerProject.has(projectId)) {
      this.categoriasPerProject.set(projectId, new Map());
    }
    return this.categoriasPerProject.get(projectId);
  }

  /**
   * Resuelve un project_id al proyecto activo con datos.
   * Si el project_id dado tiene productos cargados, lo usa.
   * Si no, busca el primer proyecto que sí tenga datos.
   * Esto permite que el frontend envíe aliases ("a") sin romper nada.
   */
  resolveToActiveProject(projectId) {
    // Si este proyecto ya tiene datos, usarlo
    if (this.productosPerProject.has(projectId) && this.productosPerProject.get(projectId).size > 0) {
      return projectId;
    }
    // Buscar el primer proyecto con productos cargados
    for (const [pid, prods] of this.productosPerProject) {
      if (prods.size > 0) {
        this.logger.debug('productos.resolve_fallback', { requested: projectId, resolved: pid });
        return pid;
      }
    }
    // No hay datos en ningún proyecto, devolver el original
    return projectId;
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
    if (code === 'EACCES' || code === 'EPERM') return { status: 500, code: 'UNKNOWN_ERROR' };
    if (/required|invalid|missing|requerido/i.test(msg)) return { status: 400, code: 'INVALID_INPUT' };
    if (/not found|no encontrado/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/timeout/i.test(msg)) return { status: 504, code: 'UPSTREAM_TIMEOUT' };
    return { status: 500, code: 'UNKNOWN_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'handler') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('productos.errors', { code, kind });
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

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;
    this.config = core.config || {};

    this.logger.info('module.loading', { module: this.name, version: this.version });

    // Event subscriptions y tools[] (incluyendo registro en uiHandler) son
    // auto-wireados desde module.json por el loader. tools.contract v1.2:
    // una declaracion, tres destinos.

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    // El loader desregistra automaticamente bus subs y uiHandler entries de tools[]
    // via unregisterToolsForAI. Aqui solo limpiamos estado del modulo.
    this.productosPerProject.clear();
    this.categoriasPerProject.clear();
    this.menusPendientes.clear();
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
  // Project Path Resolution
  // ==========================================

  async onProjectActivated(event) {
    const data = event.data || event;
    const { project_id, base_path } = data;
    if (project_id && base_path) {
      this.projectPaths.set(project_id, path.join(base_path, 'storage', this.storageSection));

      // Auto-load cartas from disk so productos/categorias are available immediately
      try {
        const result = await this.loadCartaFromProject(project_id);
        this.logger.info('productos.auto_loaded', { project_id, ...result });

        // Emitir catalogo.actualizado para que comandero (y otros) llenen su cache
        if (result.productos > 0) {
          const productos = Array.from(this.getProductos(project_id).values())
            .filter(p => p.activo !== false)
            .map(p => ({ id: p.id, nombre: p.nombre, precio: p.precio, categoria: p.categoria || null, estaciones: p.estaciones || null }));

          await this._publicarEvento('catalogo.actualizado', {
            project_id,
            productos,
            source: 'disk_load'
          }, event);
        }
      } catch (err) {
        this.logger.warn('productos.auto_load.failed', { project_id, error: err.message });
      }

      // v4.0.0 (subsistema-carta): solicitar snapshot inicial de tarifas para hidratar el mapping canal->carta_id.
      // Fire-and-forget --si tarifas no responde, el mapping queda vacio y se hidratara cuando tarifas publique
      // tarifas.config.actualizada por cambio.
      const correlation_id = event?.metadata?.correlationId || crypto.randomUUID();
      try {
        await this.eventBus.publish('tarifas.config.solicitada', {
          project_id,
          tipo: 'snapshot',
          correlation_id,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        this.logger.warn('tarifas.config.solicitada.publish_failed', { project_id, error: err?.message });
      }
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
        this.projectPaths.set(project.id, path.join(project.base_path, 'storage', this.storageSection));
      }
      pending.resolve(project);
    } else {
      pending.reject(new Error('Project not found'));
    }
  }

  /**
   * Resolve the storage path for a project.
   * Uses cached path from project.activated, or requests from project-manager.
   */
  async resolveStoragePath(projectId) {
    if (this.projectPaths.has(projectId)) {
      return this.projectPaths.get(projectId);
    }

    // Request project info from project-manager
    const requestId = crypto.randomUUID();

    const project = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingProjectRequests.delete(requestId);
        reject(new Error(`Project path resolve timeout: ${projectId}`));
      }, 5000);

      this.pendingProjectRequests.set(requestId, { resolve, reject, timeout });

      this.eventBus.publish('project.get.request', {
        request_id: requestId, project_id: projectId
      }).catch(err => {
        clearTimeout(timeout);
        this.pendingProjectRequests.delete(requestId);
        reject(err);
      });
    });

    return this.projectPaths.get(projectId) || path.join(project.base_path, 'storage', this.storageSection);
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  // v4.0.0 (subsistema-carta): handlers onMenuGenerado y onMenuValidado ELIMINADOS (zona 1 = drift).
  // Auditoria F0 confirmo que solo productos los consumia (sin terceros). El catalogo se sincroniza
  // ahora SOLO desde zona 3: carta.actualizada/editada (onCartaGenerada), carta.borrada (onCartaBorrada)
  // y tarifas.config.actualizada (onTarifasConfigActualizada). menusPendientes queda vestigial (lo leen
  // health/stats; siempre 0 al no poblarse).


  // ==========================================
  // carta.generada auto-sync
  // ==========================================

  /**
   * Recibe carta.generada del menu-generator (cambios incrementales:
   * precios, productos, ingredientes) y sincroniza directamente al catálogo.
   * Esto cierra la brecha: antes solo toolExportToPOS propagaba cambios.
   */
  async onCartaGenerada(event) {
    // v4.0.0 (subsistema-carta): el payload canonico de carta.actualizada/editada es
    //   { project_id, carta: <envelope meta+categorias+productos>, correlation_id, ... }.
    // Compat: si event.data ya ES la carta (shape antiguo con meta al root), se usa tal cual.
    const data = event?.data || event?.payload || event;
    const carta = data?.carta || data;
    if (!carta?.meta?.id || !carta?.productos) {
      this.logger.debug('carta.evento.ignored', { reason: 'no carta.meta.id or carta.productos' });
      return;
    }

    const project_id = data?.project_id || carta.project_id;
    if (!project_id) {
      this.logger.warn('carta.evento.no_project', { carta_id: carta.meta.id });
      return;
    }

    const correlationId = event?.metadata?.correlationId || crypto.randomUUID();
    const start_time = Date.now();

    this.logger.info('carta.generada.received', {
      carta_id: carta.meta.id,
      project_id,
      productos_count: carta.productos.length,
      categorias_count: carta.categorias?.length || 0,
      correlation_id: correlationId
    });

    try {
      // Transformar carta RAW a formato POS (ingredientes → ingredientes_base con IDs)
      const productos = carta.productos.map(p => {
        const prod = {
          id: p.id,
          nombre: p.nombre,
          categoria: p.categoria,
          precio: p.precio,
          activo: true
        };
        if (p.ingredientes_base) {
          prod.ingredientes_base = p.ingredientes_base;
        } else if (p.ingredientes && p.ingredientes.length > 0) {
          prod.ingredientes_base = p.ingredientes.map(ing => ({
            id: ing.id || `ing_${this.slugify(ing.nombre)}`,
            nombre: ing.nombre,
            emoji: ing.emoji || '',
            precio_extra: ing.precio_extra ?? 0,
            grupo: p.categoria || 'otro'
          }));
        }
        if (p.imagen) prod.imagen = p.imagen;
        if (p.descripcion) prod.descripcion = p.descripcion;
        return prod;
      });

      const categorias = (carta.categorias || []).map(c => ({
        ...c,
        activa: true
      }));

      // Sincronizar directamente al catálogo en memoria
      const stats = await this.syncCatalogo(project_id, carta.meta.id, productos, categorias, correlationId);

      // Publicar catalogo.actualizado para que comandero refresque su cache
      await this.publishCatalogoActualizado(project_id, carta.meta.id, stats, Date.now() - start_time, correlationId);

      // Persistir a disco
      await this.persistCatalog(project_id);

      this.logger.info('carta.generada.synced', {
        carta_id: carta.meta.id,
        project_id,
        estadisticas: stats,
        correlation_id: correlationId,
        duration: Date.now() - start_time
      });
    } catch (error) {
      this.logger.error('carta.generada.sync_error', {
        carta_id: carta.meta.id,
        project_id,
        error: error.message,
        correlation_id: correlationId
      });
    }
  }

  // ==========================================
  // carta.borrada — soft-delete (subsistema-carta zona 3)
  // ==========================================

  /**
   * Recibe carta.borrada (carta archivada por carta-manager.delete).
   * Payload canonico: { project_id, carta: <envelope con meta.estado='archivada'>, correlation_id, motivo? }.
   * El consumer saca los productos de esa carta de su catalogo activo (los marca activo:false).
   * No borra del disco --la carta sigue consultable por carta.get (soft-delete, contrato subsistema-carta).
   */
  async onCartaBorrada(event) {
    const data = event?.data || event?.payload || event;
    const carta = data?.carta || data;
    if (!carta?.meta?.id) {
      this.logger.debug('carta.borrada.ignored', { reason: 'no carta.meta.id' });
      return;
    }
    const project_id = data?.project_id || carta.project_id;
    if (!project_id) {
      this.logger.warn('carta.borrada.no_project', { carta_id: carta.meta.id });
      return;
    }
    const correlationId = event?.metadata?.correlationId || data?.correlation_id || crypto.randomUUID();
    const start_time = Date.now();

    try {
      const productosMap = this.getProductos(project_id);
      const ids = Array.isArray(carta.productos) ? carta.productos.map(p => p.id) : [];
      let desactivados = 0;
      for (const id of ids) {
        const prod = productosMap.get(id);
        if (prod && prod.activo !== false) {
          prod.activo = false;
          prod.updated_at = new Date().toISOString();
          productosMap.set(id, prod);
          desactivados++;
          await this.publishProductoActualizado(project_id, id, { activo: false }, correlationId);
        }
      }

      if (desactivados > 0) {
        await this.persistCatalog(project_id);
        const stats = { productos_desactivados: desactivados };
        await this.publishCatalogoActualizado(project_id, carta.meta.id, stats, Date.now() - start_time, correlationId);
      }

      this.logger.info('carta.borrada.applied', {
        carta_id: carta.meta.id,
        project_id,
        productos_desactivados: desactivados,
        correlation_id: correlationId,
        duration: Date.now() - start_time
      });
    } catch (error) {
      this.logger.error('carta.borrada.error', {
        carta_id: carta.meta.id,
        project_id,
        error: error.message,
        correlation_id: correlationId
      });
    }
  }

  // ==========================================
  // tarifas.config.actualizada — cache mapping canal->carta_id (subsistema-carta)
  // ==========================================

  /**
   * Recibe tarifas.config.actualizada (snapshot del estado de tarifas).
   * Payload canonico: { project_id, tipo, config: { general, canales: {...}, variantes }, correlation_id }.
   * Postura C: productos solo cachea el mapping canal->carta_id en memoria. NO expone tool de resolucion
   * --los consumers (comandero/pedidos) hacen RESOLVER_CARTA por su cuenta e invocan productos.list({carta_id}).
   */
  async onTarifasConfigActualizada(event) {
    const data = event?.data || event?.payload || event;
    const project_id = data?.project_id;
    if (!project_id) {
      this.logger.debug('tarifas.config.actualizada.no_project_id', {});
      return;
    }
    const config = data?.config;
    if (!config) {
      this.logger.debug('tarifas.config.actualizada.no_config', { project_id });
      return;
    }
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
    // No emite publish propio --productos solo cachea internamente.
  }

  // ==========================================
  // UI Handlers (MQTT Request/Response)
  // ==========================================

  async handleListProductos(data) {
    const start_time = Date.now();
    const { project_id: raw_pid, categoria, categoria_id, activo } = data || {};

    if (!raw_pid) {
      return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
    }

    const project_id = this.resolveToActiveProject(raw_pid);

    // Intentar cargar desde archivo si no hay productos en memoria
    const productosMap = this.getProductos(project_id);
    if (productosMap.size === 0) {
      await this.loadCartaFromProject(project_id);
    }

    let productos = Array.from(this.getProductos(project_id).values());

    // Filtrar por categoria (nombre o id)
    if (categoria) {
      productos = productos.filter(p => p.categoria === categoria);
    }
    if (categoria_id) {
      productos = productos.filter(p => p.categoria_id === categoria_id || p.categoria === categoria_id);
    }

    if (activo !== undefined) {
      const activoBoolean = activo === 'true' || activo === true;
      productos = productos.filter(p => p.activo === activoBoolean);
    }

    productos.sort((a, b) => {
      if (a.categoria !== b.categoria) {
        return (a.categoria || '').localeCompare(b.categoria || '');
      }
      return (a.nombre || '').localeCompare(b.nombre || '');
    });

    this.metrics?.timing?.('producto.list.duration', Date.now() - start_time);

    return {
      status: 200,
      data: { project_id, productos, total: productos.length }
    };
  }

  async handleGetProducto(data) {
    const { project_id: raw_pid, id } = data || {};

    if (!raw_pid) {
      return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
    }

    const project_id = this.resolveToActiveProject(raw_pid);
    const producto = this.getProductos(project_id).get(id);

    if (!producto) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Producto no encontrado', { id: data?.id });
    }

    return { status: 200, data: producto };
  }

  async handleSearchProductos(data) {
    const start_time = Date.now();
    const { project_id: raw_pid, q } = data || {};

    if (!raw_pid) {
      return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
    }

    if (!q) {
      return this._errorResponse(400, 'INVALID_INPUT', 'Parametro q requerido', { field: 'q' });
    }

    const project_id = this.resolveToActiveProject(raw_pid);
    const searchTerm = q.toLowerCase();
    const resultados = Array.from(this.getProductos(project_id).values())
      .filter(p =>
        p.activo &&
        ((p.nombre || '').toLowerCase().includes(searchTerm) ||
         (p.descripcion && p.descripcion.toLowerCase().includes(searchTerm)))
      );

    this.metrics?.timing?.('producto.search.duration', Date.now() - start_time);

    return {
      status: 200,
      data: { project_id, resultados, total: resultados.length, query: q }
    };
  }

  async handleListCategorias(data) {
    const { project_id: raw_pid } = data || {};

    if (!raw_pid) {
      return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
    }

    const project_id = this.resolveToActiveProject(raw_pid);

    // Intentar cargar desde archivo si no hay categorías en memoria
    const categoriasMap = this.getCategorias(project_id);
    if (categoriasMap.size === 0) {
      await this.loadCartaFromProject(project_id);
    }

    const categorias = Array.from(this.getCategorias(project_id).values())
      .sort((a, b) => (a.orden || 0) - (b.orden || 0));

    const categoriasConConteo = categorias.map(cat => ({
      ...cat,
      productos_count: Array.from(this.getProductos(project_id).values())
        .filter(p => (p.categoria === cat.nombre || p.categoria_id === cat.id) && p.activo !== false).length
    }));

    return {
      status: 200,
      data: { project_id, categorias: categoriasConConteo, total: categorias.length }
    };
  }

  /**
   * Delega al módulo ingredientes (fuente única de ingredientes).
   * Mantiene el endpoint productos/ingredientes por compatibilidad con el frontend.
   */
  async handleListIngredientes(data) {
    const { project_id: raw_pid, tipo, grupo } = data || {};

    if (!raw_pid) {
      return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
    }

    const result = await this.uiHandler.handle('ingredientes', 'list', { tipo, grupo });
    return result;
  }

  // v2 D3 (subsistema-catalogo): lee los productos de UNA carta concreta por id (carta de canal),
  // SIN tocar el catálogo activo general. Devuelve el mismo shape POS (con .precio mapeado de precio_base).
  // Devuelve null si la carta no existe o falla → el caller cae al catálogo activo (fallback seguro).
  async _readCartaProductos(project_id, carta_id) {
    try {
      const storagePath = await this.resolveStoragePath(project_id);
      const cartaPath = path.join(storagePath, 'cartas', `${carta_id}.json`);
      const carta = JSON.parse(await fs.readFile(cartaPath, 'utf8'));
      return (carta.productos || []).map(p => ({
        id: p.id,
        nombre: p.nombre,
        categoria: p.categoria,
        categoria_id: p.categoria_id || p.categoria,
        precio: (p.precio ?? p.precio_base ?? 0),
        tipo: p.tipo || null,
        activo: p.activo !== false,
        ingredientes_base: p.ingredientes_base || p.ingredientes || []
      }));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('productos.read_carta_by_id.failed', { project_id, carta_id, error: err.message });
      }
      return null;
    }
  }

  async handleListPizzas(data) {
    const { project_id: raw_pid, carta_id } = data || {};

    if (!raw_pid) {
      return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
    }

    const project_id = this.resolveToActiveProject(raw_pid);

    // v2 D3: si llega carta_id (carta de canal), servir ESA carta; si no o si no existe, catálogo activo (fallback).
    let source = carta_id ? await this._readCartaProductos(project_id, carta_id) : null;
    if (!source) {
      const productosMap = this.getProductos(project_id);
      if (productosMap.size === 0) {
        await this.loadCartaFromProject(project_id);
      }
      source = Array.from(this.getProductos(project_id).values());
    }

    const pizzas = source
      .filter(p =>
        p.activo !== false && (
          (p.categoria && p.categoria.toLowerCase().startsWith('pizz')) ||
          (p.categoria_id && p.categoria_id.toLowerCase().startsWith('pizz')) ||
          p.tipo === 'pizza'
        )
      )
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    this.logger.debug('productos.pizzas.list', {
      project_id, raw_pid, total: pizzas.length, carta_id: carta_id || null
    });

    return {
      status: 200,
      data: { project_id, pizzas, total: pizzas.length, carta_id: carta_id || null }
    };
  }

  async handleUpdateProducto(data) {
    const { project_id, id, ...updates } = data || {};

    if (!project_id) {
      return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
    }

    const productosMap = this.getProductos(project_id);
    const producto = productosMap.get(id);
    if (!producto) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Producto no encontrado', { id: data?.id });
    }

    const cambios = {};
    Object.keys(updates).forEach(key => {
      if (updates[key] !== producto[key]) {
        cambios[key] = { anterior: producto[key], nuevo: updates[key] };
        producto[key] = updates[key];
      }
    });

    producto.updated_at = new Date().toISOString();
    productosMap.set(id, producto);

    this.metrics?.increment?.('producto.actualizado.total');

    await this.publishProductoActualizado(project_id, id, cambios);

    // Persist to disk
    await this.persistCatalog(project_id);

    this.logger.info('producto.actualizado', {
      project_id,
      producto_id: id,
      cambios_count: Object.keys(cambios).length
    });

    return { status: 200, data: producto };
  }

  async handleDeleteProducto(data) {
    const { project_id, id } = data || {};

    if (!project_id) {
      return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
    }

    const productosMap = this.getProductos(project_id);
    const producto = productosMap.get(id);
    if (!producto) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Producto no encontrado', { id: data?.id });
    }

    productosMap.delete(id);

    this.metrics?.increment?.('producto.eliminado.total');
    this.metrics?.gauge?.('producto.activos.count', productosMap.size);

    await this.publishProductoEliminado(project_id, id, 'manual');

    // Persist to disk
    await this.persistCatalog(project_id);

    this.logger.info('producto.eliminado', { project_id, producto_id: id });

    return {
      status: 200,
      data: { message: 'Producto eliminado', project_id, producto_id: id }
    };
  }

  async handleGetStats(data) {
    const { project_id } = data || {};

    if (!project_id) {
      // Stats globales de todos los proyectos
      let totalProductos = 0;
      let totalCategorias = 0;

      for (const [, productos] of this.productosPerProject) {
        totalProductos += productos.size;
      }
      for (const [, categorias] of this.categoriasPerProject) {
        totalCategorias += categorias.size;
      }

      return {
        status: 200,
        data: {
          proyectos_cargados: this.productosPerProject.size,
          total_productos: totalProductos,
          total_categorias: totalCategorias,
          menus_pendientes_validacion: this.menusPendientes.size
        }
      };
    }

    const productosMap = this.getProductos(project_id);
    const categoriasMap = this.getCategorias(project_id);

    const productosPorCategoria = {};
    const productosActivos = Array.from(productosMap.values()).filter(p => p.activo !== false);

    productosActivos.forEach(p => {
      const cat = p.categoria || 'Sin categoría';
      productosPorCategoria[cat] = (productosPorCategoria[cat] || 0) + 1;
    });

    const productosConAlergenos = productosActivos.filter(p => p.alergenos && p.alergenos.length > 0).length;

    return {
      status: 200,
      data: {
        project_id,
        total_productos: productosMap.size,
        productos_activos: productosActivos.length,
        productos_inactivos: productosMap.size - productosActivos.length,
        total_categorias: categoriasMap.size,
        productos_por_categoria: productosPorCategoria,
        productos_con_alergenos: productosConAlergenos,
        menus_pendientes_validacion: this.menusPendientes.size
      }
    };
  }

  async handleHealthCheck() {
    let totalProductos = 0;
    let totalCategorias = 0;

    for (const [, productos] of this.productosPerProject) {
      totalProductos += productos.size;
    }
    for (const [, categorias] of this.categoriasPerProject) {
      totalCategorias += categorias.size;
    }

    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        catalogo: {
          proyectos: this.productosPerProject.size,
          productos: totalProductos,
          categorias: totalCategorias,
          menus_pendientes: this.menusPendientes.size
        }
      }
    };
  }

  async handleGetMetrics() {
    let totalProductos = 0;
    let totalCategorias = 0;

    for (const [, productos] of this.productosPerProject) {
      totalProductos += productos.size;
    }
    for (const [, categorias] of this.categoriasPerProject) {
      totalCategorias += categorias.size;
    }

    return {
      status: 200,
      data: {
        counters: {
          'producto.creado.total': this.metrics?.getCounter?.('producto.creado.total') || 0,
          'producto.actualizado.total': this.metrics?.getCounter?.('producto.actualizado.total') || 0,
          'producto.eliminado.total': this.metrics?.getCounter?.('producto.eliminado.total') || 0,
          'catalogo.actualizado.total': this.metrics?.getCounter?.('catalogo.actualizado.total') || 0
        },
        gauges: {
          'proyectos.count': this.productosPerProject.size,
          'producto.activos.count': totalProductos,
          'categorias.count': totalCategorias
        }
      }
    };
  }

  /**
   * Carga la carta desde archivo del proyecto
   */
  async handleLoadCarta(data) {
    const { project_id } = data || {};

    if (!project_id) {
      return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
    }

    try {
      const start_time = Date.now();
      const result = await this.loadCartaFromProject(project_id);
      const stats = {
        productos_nuevos: result.productos,
        productos_actualizados: 0,
        productos_desactivados: 0,
        categorias_nuevas: result.categorias
      };
      await this.publishCatalogoActualizado(project_id, 'load_carta', stats, Date.now() - start_time, data?.correlation_id);
      return {
        status: 200,
        data: {
          project_id,
          productos: result.productos,
          categorias: result.categorias,
          message: 'Carta cargada exitosamente'
        }
      };
    } catch (error) {
      this.logger.error('productos.load_carta.error', {
        project_id,
        error: error.message
      });
      return this._handleHandlerError('productos.load_carta.error', error);
    }
  }

  /**
   * Devuelve la carta COMPLETA (categorías + productos + ingredientes) de golpe.
   * NO requiere project_id — busca el primer proyecto que tenga datos cargados.
   * Si se pasa project_id, lo usa; si no, usa el primero disponible.
   * Pensado para que el comandero cargue todo de un solo golpe.
   */
  async handleCartaCompleta(data) {
    let projectId = data?.project_id;

    // Si no hay project_id o no tiene datos, buscar el primer proyecto con datos
    if (!projectId || !this.productosPerProject.has(projectId) || this.productosPerProject.get(projectId).size === 0) {
      for (const [pid, prods] of this.productosPerProject) {
        if (prods.size > 0) {
          projectId = pid;
          break;
        }
      }
    }

    if (!projectId) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'No hay carta cargada en ningun proyecto');
    }

    const categoriasMap = this.categoriasPerProject.get(projectId) || new Map();
    const productosMap = this.productosPerProject.get(projectId) || new Map();

    const categorias = Array.from(categoriasMap.values())
      .filter(c => c.activa !== false)
      .sort((a, b) => (a.orden || 0) - (b.orden || 0));

    const productos = Array.from(productosMap.values())
      .filter(p => p.activo !== false)
      .map(p => ({
        ...p,
        tiene_variaciones: (p.ingredientes && p.ingredientes.length > 0) ||
                           (p.ingredientes_base && p.ingredientes_base.length > 0)
      }));

    // Ingredientes: pedir al módulo ingredientes (fuente única)
    let ingredientes = [];
    const ingResult = await this.uiHandler.handle('ingredientes', 'list', {});
    if (ingResult?.status === 200 && ingResult?.data?.ingredientes) {
      ingredientes = ingResult.data.ingredientes;
    }

    return {
      status: 200,
      data: {
        project_id: projectId,
        categorias,
        productos,
        ingredientes,
        total_categorias: categorias.length,
        total_productos: productos.length,
        total_ingredientes: ingredientes.length
      }
    };
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishProductoCreado(project_id, producto, correlation_id) {
    await this._publicarEvento('producto.creado', {
      project_id,
      id: producto.id,
      producto_id: producto.id,
      nombre: producto.nombre,
      emoji: producto.emoji,
      categoria: producto.categoria,
      precio: producto.precio,
      ingredientes_base: producto.ingredientes_base,
      alergenos: producto.alergenos,
      menu_source_id: producto.menu_source_id,
      created_at: producto.created_at
    }, { correlation_id });
  }

  async publishProductoActualizado(project_id, producto_id, cambios, correlation_id) {
    const producto = this.getProductos(project_id).get(producto_id);
    await this._publicarEvento('producto.actualizado', {
      project_id,
      id: producto_id,
      producto_id,
      nombre: producto?.nombre || producto_id,
      precio: producto?.precio,
      cambios,
      updated_at: new Date().toISOString()
    }, { correlation_id });
  }

  async publishProductoEliminado(project_id, producto_id, motivo, correlation_id) {
    await this._publicarEvento('producto.eliminado', {
      project_id,
      producto_id,
      motivo
    }, { correlation_id });
  }

  async publishCatalogoActualizado(project_id, menu_id, estadisticas, sync_duration, correlation_id) {
    const productos = Array.from(this.getProductos(project_id).values())
      .filter(p => p.activo !== false)
      .map(p => ({ id: p.id, nombre: p.nombre, precio: p.precio, categoria: p.categoria || null, estaciones: p.estaciones || null }));

    await this._publicarEvento('catalogo.actualizado', {
      project_id,
      menu_id,
      estadisticas,
      sync_duration,
      productos
    }, { correlation_id });
  }

  // ==========================================
  // Helper Methods
  // ==========================================

  /**
   * Persiste el catálogo actual a disco como carta JSON.
   * Guarda productos y categorías en {storagePath}/productos/catalogo_activo.json (namespace propio, v4.0.0)
   */
  async persistCatalog(project_id) {
    let storagePath;
    try {
      storagePath = await this.resolveStoragePath(project_id);
    } catch (err) {
      this.logger.warn('productos.persist.path_failed', { project_id, error: err.message });
      return;
    }

    // v4.0.0 (subsistema-carta): productos escribe su catalogo en su PROPIO namespace.
    // Solo carta-manager escribe a /storage/pizzepos/cartas/ (contrato D1).
    const productosDir = path.join(storagePath, 'productos');
    const catalogPath = path.join(productosDir, 'catalogo_activo.json');

    try {
      await fs.mkdir(productosDir, { recursive: true });

      const productosMap = this.getProductos(project_id);
      const categoriasMap = this.getCategorias(project_id);

      const catalog = {
        meta: {
          id: 'catalogo_activo',
          nombre: 'Catálogo Activo',
          updated_at: new Date().toISOString()
        },
        categorias: Array.from(categoriasMap.values()),
        productos: Array.from(productosMap.values())
      };

      await fs.writeFile(catalogPath, JSON.stringify(catalog, null, 2), 'utf-8');

      this.logger.info('productos.persisted', {
        project_id,
        productos: catalog.productos.length,
        categorias: catalog.categorias.length,
        path: catalogPath
      });
    } catch (err) {
      this.logger.error('productos.persist.failed', {
        project_id,
        error: err.message
      });
    }
  }

  async syncCatalogo(project_id, menu_id, productos, categorias, correlation_id) {
    const stats = {
      productos_nuevos: 0,
      productos_actualizados: 0,
      productos_desactivados: 0,
      categorias_nuevas: 0
    };

    const categoriasMap = this.getCategorias(project_id);
    const productosMap = this.getProductos(project_id);

    for (const cat of categorias) {
      if (!categoriasMap.has(cat.id)) {
        categoriasMap.set(cat.id, { ...cat, activa: true });
        stats.categorias_nuevas++;
      }
    }

    const productosExistentes = new Set(productosMap.keys());

    for (const prod of productos) {
      const productoExistente = productosMap.get(prod.id);

      if (productoExistente) {
        const productoActualizado = {
          ...productoExistente,
          ...prod,
          activo: true,
          menu_source_id: menu_id,
          updated_at: new Date().toISOString()
        };
        productosMap.set(prod.id, productoActualizado);
        stats.productos_actualizados++;

        await this.publishProductoActualizado(project_id, prod.id, { menu_source_id: menu_id }, correlation_id);

      } else {
        const nuevoProducto = {
          ...prod,
          activo: true,
          menu_source_id: menu_id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        productosMap.set(prod.id, nuevoProducto);
        stats.productos_nuevos++;

        this.metrics?.increment?.('producto.creado.total');
        await this.publishProductoCreado(project_id, nuevoProducto, correlation_id);
      }

      productosExistentes.delete(prod.id);
    }

    for (const prod_id of productosExistentes) {
      const producto = productosMap.get(prod_id);
      if (producto && producto.activo) {
        producto.activo = false;
        producto.updated_at = new Date().toISOString();
        productosMap.set(prod_id, producto);
        stats.productos_desactivados++;

        await this.publishProductoActualizado(project_id, prod_id, { activo: false }, correlation_id);
      }
    }

    return stats;
  }

  /**
   * Carga carta desde el sistema de archivos del proyecto
   * Resuelve base_path via project-manager (no asume UUID como directorio)
   */
  async loadCartaFromProject(project_id) {
    let storagePath;
    try {
      storagePath = await this.resolveStoragePath(project_id);
    } catch (err) {
      this.logger.warn('productos.resolve_path.failed', { project_id, error: err.message });
      return { productos: 0, categorias: 0 };
    }
    const cartasDir = path.join(storagePath, 'cartas');

    const result = {
      productos: 0,
      categorias: 0
    };

    try {
      // Cargar cartas
      try {
        const files = await fs.readdir(cartasDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        for (const file of jsonFiles) {
          const cartaPath = path.join(cartasDir, file);
          const cartaData = await fs.readFile(cartaPath, 'utf8');
          const carta = JSON.parse(cartaData);

          // Cargar categorías de la carta
          if (carta.categorias) {
            const categoriasMap = this.getCategorias(project_id);
            for (const cat of carta.categorias) {
              categoriasMap.set(cat.id, { ...cat, activa: true });
              result.categorias++;
            }
          }

          // Cargar productos de la carta (normalizar RAW → POS si falta ingredientes_base)
          if (carta.productos) {
            // Construir mapa de estaciones por categoría para herencia
            const catEstacionesMap = {};
            if (carta.categorias) {
              for (const cat of carta.categorias) {
                if (cat.estaciones) catEstacionesMap[cat.id] = cat.estaciones;
              }
            }

            const productosMap = this.getProductos(project_id);
            for (const prod of carta.productos) {
              this.normalizeProductoPOS(prod);
              // Heredar estaciones de la categoría si el producto no define las suyas
              if (!prod.estaciones && prod.categoria && catEstacionesMap[prod.categoria]) {
                prod.estaciones = catEstacionesMap[prod.categoria];
              }
              productosMap.set(prod.id, {
                ...prod,
                activo: true,
                carta_source: carta.meta?.id || file.replace('.json', ''),
                loaded_at: new Date().toISOString()
              });
              result.productos++;
            }
          }
        }
      } catch (e) {
        // No hay directorio de cartas
        this.logger.debug('productos.no_cartas_dir', { project_id, path: cartasDir });
      }

      this.logger.info('productos.carta_loaded', {
        project_id,
        productos: result.productos,
        categorias: result.categorias
      });

      // v4.0.0 (subsistema-carta): re-emit de menu.generado eliminado (zona 1 = drift).
      // categorias se popula via carta.actualizada/editada (zona 3), no via menu.generado.

      return result;
    } catch (error) {
      this.logger.warn('productos.load_carta.error', {
        project_id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Slugify — misma lógica que menu-generator para generar IDs deterministas
   */
  slugify(text) {
    if (!text) return 'sin_nombre';
    return text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      || 'sin_nombre';
  }

  /**
   * Normaliza un producto RAW de carta (ingredientes sin ID)
   * al formato POS (ingredientes_base con IDs).
   * Conserva tipo y precio_extra si vienen del menu-generator.
   * Si ya tiene ingredientes_base, no toca nada.
   */
  normalizeProductoPOS(prod) {
    if (prod.ingredientes_base) return prod;
    if (!prod.ingredientes || prod.ingredientes.length === 0) return prod;

    prod.ingredientes_base = prod.ingredientes.map(ing => {
      const result = {
        id: ing.id || `ing_${this.slugify(ing.nombre)}`,
        nombre: ing.nombre,
        emoji: ing.emoji || ''
      };
      if (ing.tipo) result.tipo = ing.tipo;
      if (ing.precio_extra != null) result.precio_extra = ing.precio_extra;
      return result;
    });

    return prod;
  }

  applyCorrections(productos, correcciones) {
    const productosMap = new Map(productos.map(p => [p.id, p]));

    correcciones.forEach(corr => {
      const producto = productosMap.get(corr.producto_id);
      if (producto && corr.campo) {
        producto[corr.campo] = corr.valor_nuevo;
      }
    });

    return Array.from(productosMap.values());
  }
}

module.exports = ProductosModule;

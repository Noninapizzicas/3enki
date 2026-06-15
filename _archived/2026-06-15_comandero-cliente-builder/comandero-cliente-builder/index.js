'use strict';

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const BaseModule = require('../_shared/base-module');
const { SafeUpdate } = require('./services/safe-update');
const { generateStaticHTML } = require('./services/static-template');

const VALID_IMAGE_TYPES = {
  'image/png':  'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp'
};

const MAX_IMAGEN_BYTES = 2 * 1024 * 1024; // 2 MB tras decodificar base64

class ComanderoClienteBuilderModule extends BaseModule {
  constructor() {
    super();
    this.name = 'comandero-cliente-builder';
    this.version = '1.0.0';

    this.config = null;
    this.safeUpdate = null;
    // project_id -> { productos: [...], categorias: [...] }
    this.catalogoCachePerProject = new Map();
    // project_id -> { config: {...} } (snapshot de tarifas — informativo, no critico para builder)
    this.tarifasCachePerProject = new Map();
    // project_id -> { base_path } resuelto perezosamente
    this.projectInfoCache = new Map();
  }

  // ==========================================
  // Helpers de dominio (5to POC2 auxiliar)
  // ==========================================

  _projectsDir() {
    return this.config?.projects_dir || 'data/projects';
  }

  _projectDir(project_id) {
    return path.join(this._projectsDir(), project_id);
  }

  _storageDir(project_id) {
    return path.join(this._projectDir(project_id), 'storage', 'comandero-cliente-builder');
  }

  _presentacionPath(project_id) {
    return path.join(this._storageDir(project_id), 'presentacion.json');
  }

  _bundlesIndexPath(project_id) {
    return path.join(this._storageDir(project_id), 'bundles.json');
  }

  _bundleHtmlPath(project_id, bundle_id) {
    return path.join(this._storageDir(project_id), 'bundles', `${bundle_id}.html`);
  }

  _imagenPath(project_id, producto_id, ext) {
    return path.join(this._storageDir(project_id), 'imagenes', `${producto_id}.${ext}`);
  }

  _projectConfigPath(project_id) {
    return path.join(this._projectDir(project_id), 'config', 'project.json');
  }

  _emptyPresentacion() {
    return { _meta: { categorias_orden: [] }, productos: {} };
  }

  _emptyBundlesIndex() {
    return { bundles: [] };
  }

  async _ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
  }

  async _readProjectConfig(project_id) {
    try {
      const raw = await fs.readFile(this._projectConfigPath(project_id), 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      this.logger?.warn?.('comandero-cliente-builder.project_config.read_error', { project_id, error: err.message });
      return null;
    }
  }

  async _resolveTiendaApiUrl(project_id, override) {
    if (override && typeof override === 'string') return override;
    const cfg = await this._readProjectConfig(project_id);
    if (cfg?.tienda_api_url && typeof cfg.tienda_api_url === 'string') return cfg.tienda_api_url;
    return null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    const moduleJson = JSON.parse(await fs.readFile(path.join(__dirname, 'module.json'), 'utf8'));
    this.config = moduleJson.config || {};
    this.safeUpdate = new SafeUpdate();

    this.logger.info('module.loading', { module: this.name, version: this.version });

    // Snapshot inicial de tarifas (mismo patron canonico de comandero post-dc77c0d).
    // No esperamos respuesta — hidrata cuando llegue tarifas.config.actualizada.
    try {
      await this._publicarEvento('tarifas.config.solicitada', {});
    } catch (err) {
      this.logger.warn('comandero-cliente-builder.tarifas_snapshot_solicitada.failed', { error: err.message });
    }

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger?.info?.('module.unloading', { module: this.name });
    this.catalogoCachePerProject.clear();
    this.tarifasCachePerProject.clear();
    this.projectInfoCache.clear();
    this.safeUpdate = null;
    this.logger?.info?.('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Bus API (handlers de eventos)
  // ==========================================

  async onCatalogoActualizado(event) {
    const data = event?.data || event || {};
    const { project_id, productos, categorias } = data;
    if (!project_id || !Array.isArray(productos)) return;
    this.catalogoCachePerProject.set(project_id, {
      productos: productos.slice(),
      categorias: Array.isArray(categorias) ? categorias.slice() : []
    });
    this.logger?.debug?.('comandero-cliente-builder.catalogo.hidratado', {
      project_id,
      productos_count: productos.length,
      categorias_count: Array.isArray(categorias) ? categorias.length : 0
    });
  }

  async onProductoCreado(event) {
    const data = event?.data || event || {};
    const { project_id } = data;
    const producto_id = data.producto_id || data.id;
    if (!project_id || !producto_id) return;
    const cache = this.catalogoCachePerProject.get(project_id);
    if (!cache) return;
    const existente = cache.productos.findIndex(p => p.id === producto_id);
    const productoNuevo = {
      id: producto_id,
      nombre: data.nombre,
      precio: data.precio,
      categoria: data.categoria || null,
      estaciones: data.estaciones || null
    };
    if (existente >= 0) cache.productos[existente] = productoNuevo;
    else cache.productos.push(productoNuevo);
  }

  async onProductoActualizado(event) {
    const data = event?.data || event || {};
    const { project_id } = data;
    const producto_id = data.producto_id || data.id;
    if (!project_id || !producto_id) return;
    const cache = this.catalogoCachePerProject.get(project_id);
    if (!cache) return;
    const existente = cache.productos.findIndex(p => p.id === producto_id);
    if (existente < 0) return;
    cache.productos[existente] = {
      ...cache.productos[existente],
      nombre: data.nombre ?? cache.productos[existente].nombre,
      precio: data.precio ?? cache.productos[existente].precio,
      categoria: data.categoria ?? cache.productos[existente].categoria
    };
  }

  async onProductoEliminado(event) {
    const data = event?.data || event || {};
    const { project_id } = data;
    const producto_id = data.producto_id || data.id;
    if (!project_id || !producto_id) return;
    const cache = this.catalogoCachePerProject.get(project_id);
    if (!cache) return;
    cache.productos = cache.productos.filter(p => p.id !== producto_id);
    // Purga presentacion huerfana (best effort, async, no bloquea)
    try {
      await this.safeUpdate.update(this._presentacionPath(project_id), (snapshot) => {
        if (!snapshot?.productos?.[producto_id]) return undefined;
        const copy = JSON.parse(JSON.stringify(snapshot));
        delete copy.productos[producto_id];
        return copy;
      });
    } catch (err) {
      this.logger?.warn?.('comandero-cliente-builder.presentacion_huerfana.purge_failed', {
        project_id, producto_id, error: err.message
      });
    }
  }

  async onTarifasConfigActualizada(event) {
    const data = event?.data || event || {};
    const { project_id, config } = data;
    if (!project_id) return;
    this.tarifasCachePerProject.set(project_id, { config: config || null });
  }

  async onProjectActivated(event) {
    const data = event?.data || event || {};
    const { project_id } = data;
    if (!project_id) return;
    // No hace falta hidratar disco aqui — los handlers leen on-demand via safeUpdate.
    // Solo cacheamos info del proyecto para resoluciones rapidas.
    this.projectInfoCache.set(project_id, { activated_at: Date.now() });
  }

  // ==========================================
  // HTTP API
  // ==========================================

  async handleHealthCheck(req, res) {
    const body = {
      module: this.name,
      version: this.version,
      proyectos_con_catalogo_hidratado: this.catalogoCachePerProject.size,
      proyectos_con_tarifas: this.tarifasCachePerProject.size
    };
    if (res && typeof res.status === 'function') {
      return res.status(200).json({ status: 'ok', ...body });
    }
    return { status: 200, data: body };
  }

  // ==========================================
  // Tool handlers (canonical {status, data|error})
  // ==========================================

  async handlePresentacionActualizar(data) {
    try {
      const { project_id, producto_id } = data || {};
      const correlation_id = data?.correlation_id;
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id requerido', { kind: 'missing', field: 'project_id' });
      if (!producto_id) return this._errorResponse(400, 'INVALID_INPUT', 'producto_id requerido', { kind: 'missing', field: 'producto_id' });

      const catalogo = this.catalogoCachePerProject.get(project_id);
      if (!catalogo) {
        return this._errorResponse(422, 'PRECONDITION_FAILED',
          `Catalogo del proyecto '${project_id}' no esta hidratado todavia. Espera a que catalogo.actualizado llegue del modulo pizzepos/productos.`,
          { kind: 'catalogo_no_hidratado', project_id });
      }
      if (!catalogo.productos.some(p => p.id === producto_id)) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
          `Producto '${producto_id}' no existe en el catalogo de '${project_id}'`,
          { entity_type: 'producto', entity_id: producto_id, project_id });
      }

      const cambios = {};
      if (typeof data.imagen_url === 'string') cambios.imagen_url = data.imagen_url;
      if (typeof data.descripcion_publica === 'string') cambios.descripcion_publica = data.descripcion_publica;
      if (Number.isFinite(data.orden_publico)) cambios.orden_publico = data.orden_publico;
      if (typeof data.oculto_publico === 'boolean') cambios.oculto_publico = data.oculto_publico;

      if (Object.keys(cambios).length === 0) {
        return this._errorResponse(400, 'INVALID_INPUT',
          'al menos un campo de presentacion requerido (imagen_url, descripcion_publica, orden_publico, oculto_publico)',
          { kind: 'missing', field: 'presentacion' });
      }

      await this._ensureDir(this._storageDir(project_id));
      const updated = await this.safeUpdate.update(this._presentacionPath(project_id), (snapshot) => {
        const store = snapshot || this._emptyPresentacion();
        if (!store.productos) store.productos = {};
        const previo = store.productos[producto_id] || {};
        const nuevo = { ...previo, ...cambios, actualizada_en: new Date().toISOString() };
        store.productos[producto_id] = nuevo;
        return store;
      });

      const presentacionFinal = updated?.productos?.[producto_id] || cambios;

      this.metrics?.increment?.('comandero-cliente.presentacion.actualizada.total', { project: project_id });
      await this._publicarEvento('comandero-cliente.presentacion.actualizada', {
        project_id,
        producto_id,
        presentacion: presentacionFinal
      }, { correlation_id });

      return {
        status: 200,
        data: { project_id, producto_id, presentacion: presentacionFinal }
      };
    } catch (err) {
      return this._handleHandlerError('comandero-cliente-builder.presentacion.error', err, 'tool');
    }
  }

  async handleImagenSubir(data) {
    try {
      const { project_id, producto_id, imagen_base64, content_type } = data || {};
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id requerido', { kind: 'missing', field: 'project_id' });
      if (!producto_id) return this._errorResponse(400, 'INVALID_INPUT', 'producto_id requerido', { kind: 'missing', field: 'producto_id' });
      if (!imagen_base64 || typeof imagen_base64 !== 'string') {
        return this._errorResponse(400, 'INVALID_INPUT', 'imagen_base64 requerido', { kind: 'missing', field: 'imagen_base64' });
      }
      if (!content_type || !VALID_IMAGE_TYPES[content_type]) {
        return this._errorResponse(400, 'INVALID_INPUT',
          `content_type debe ser uno de: ${Object.keys(VALID_IMAGE_TYPES).join(', ')}`,
          { kind: 'invalid_format', field: 'content_type' });
      }

      const ext = VALID_IMAGE_TYPES[content_type];
      const buffer = Buffer.from(imagen_base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
      if (buffer.length === 0) {
        return this._errorResponse(400, 'INVALID_INPUT', 'imagen_base64 vacio o invalido', { kind: 'invalid_format', field: 'imagen_base64' });
      }
      if (buffer.length > MAX_IMAGEN_BYTES) {
        return this._errorResponse(400, 'INVALID_INPUT',
          `imagen excede ${MAX_IMAGEN_BYTES} bytes (recibido ${buffer.length})`,
          { kind: 'too_large', field: 'imagen_base64', max: MAX_IMAGEN_BYTES, received: buffer.length });
      }

      const filePath = this._imagenPath(project_id, producto_id, ext);
      await this._ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, buffer);

      // URL canonica relativa al base_path del proyecto. El operador / la PWA la sirve
      // desde el host estatico del proyecto. Builder NO sirve archivos por HTTP.
      const imagen_url = `/storage/comandero-cliente-builder/imagenes/${producto_id}.${ext}`;

      this.metrics?.increment?.('comandero-cliente.imagen.subir.total', { project: project_id });
      this.logger?.info?.('comandero-cliente-builder.imagen.subida', {
        project_id, producto_id, bytes: buffer.length, ext
      });

      return { status: 200, data: { project_id, producto_id, imagen_url, bytes: buffer.length } };
    } catch (err) {
      return this._handleHandlerError('comandero-cliente-builder.imagen.error', err, 'tool');
    }
  }

  async handleCategoriasReordenar(data) {
    try {
      const { project_id, orden } = data || {};
      const correlation_id = data?.correlation_id;
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id requerido', { kind: 'missing', field: 'project_id' });
      if (!Array.isArray(orden) || orden.some(x => typeof x !== 'string')) {
        return this._errorResponse(400, 'INVALID_INPUT', 'orden debe ser array de string (categoria_id)', { kind: 'invalid_format', field: 'orden' });
      }

      const catalogo = this.catalogoCachePerProject.get(project_id);
      if (!catalogo) {
        return this._errorResponse(422, 'PRECONDITION_FAILED',
          `Catalogo del proyecto '${project_id}' no esta hidratado todavia.`,
          { kind: 'catalogo_no_hidratado', project_id });
      }

      await this._ensureDir(this._storageDir(project_id));
      const updated = await this.safeUpdate.update(this._presentacionPath(project_id), (snapshot) => {
        const store = snapshot || this._emptyPresentacion();
        if (!store._meta) store._meta = {};
        store._meta.categorias_orden = orden.slice();
        store._meta.actualizada_en = new Date().toISOString();
        return store;
      });

      this.metrics?.increment?.('comandero-cliente.categorias.reordenadas.total', { project: project_id });
      await this._publicarEvento('comandero-cliente.presentacion.actualizada', {
        project_id,
        producto_id: '_categorias_orden',
        presentacion: { categorias_orden: updated?._meta?.categorias_orden || orden }
      }, { correlation_id });

      return { status: 200, data: { project_id, orden: updated?._meta?.categorias_orden || orden } };
    } catch (err) {
      return this._handleHandlerError('comandero-cliente-builder.categorias.error', err, 'tool');
    }
  }

  async handleBundleGenerar(data) {
    const correlation_id = data?.correlation_id;
    let project_id = null;
    let bundle_id = null;
    const start = Date.now();
    try {
      project_id = data?.project_id;
      const identidad = data?.identidad;
      const tiendaApiUrlOverride = data?.tienda_api_url;
      const opciones = data?.opciones || {};

      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id requerido', { kind: 'missing', field: 'project_id' });
      if (!identidad || typeof identidad !== 'object') return this._errorResponse(400, 'INVALID_INPUT', 'identidad requerida', { kind: 'missing', field: 'identidad' });
      if (!identidad.marca || typeof identidad.marca !== 'string') return this._errorResponse(400, 'INVALID_INPUT', 'identidad.marca requerida', { kind: 'missing', field: 'identidad.marca' });

      const catalogo = this.catalogoCachePerProject.get(project_id);
      if (!catalogo) {
        return this._errorResponse(422, 'PRECONDITION_FAILED',
          `Catalogo del proyecto '${project_id}' no esta hidratado todavia. Espera a que catalogo.actualizado llegue del modulo pizzepos/productos.`,
          { kind: 'catalogo_no_hidratado', project_id });
      }

      const tienda_api_url = await this._resolveTiendaApiUrl(project_id, tiendaApiUrlOverride);
      if (!tienda_api_url) {
        return this._errorResponse(400, 'INVALID_INPUT',
          `tienda_api_url no resuelto: pasalo en el parametro o declaralo en data/projects/${project_id}/config/project.json bajo la clave tienda_api_url`,
          { kind: 'missing', field: 'tienda_api_url' });
      }

      // Cargar presentacion desde disco
      const presentacionStore = (await this.safeUpdate.read(this._presentacionPath(project_id))) || this._emptyPresentacion();
      const presentacionProductos = presentacionStore.productos || {};

      // Productos filtrados (no ocultos, segun presentacion)
      const productosNoOcultos = catalogo.productos.filter(p => {
        const pres = presentacionProductos[p.id];
        return !(pres && pres.oculto_publico === true);
      });

      // Generar bundle_id y compilar HTML
      bundle_id = crypto.randomUUID();
      const html = generateStaticHTML({
        catalogo: { productos: catalogo.productos, categorias: catalogo.categorias || [] },
        presentacion: presentacionProductos,
        identidad,
        project_slug: project_id,
        tienda_api_url,
        opciones
      });

      // Escribir bundle a disco
      await this._ensureDir(path.dirname(this._bundleHtmlPath(project_id, bundle_id)));
      const bundlePath = this._bundleHtmlPath(project_id, bundle_id);
      await fs.writeFile(bundlePath, html, 'utf8');

      // Alias 'latest.html' para que el operador no tenga que recordar el bundle_id
      const latestPath = this._bundleHtmlPath(project_id, 'latest');
      try { await fs.unlink(latestPath); } catch (_err) { /* primera vez no existe */ }
      try { await fs.writeFile(latestPath, html, 'utf8'); } catch (err) {
        this.logger?.warn?.('comandero-cliente-builder.bundle.latest_alias_failed', { error: err.message });
      }

      // Actualizar indice de bundles
      const generado_en = new Date().toISOString();
      const bundleMeta = {
        bundle_id,
        bundle_path: bundlePath,
        productos_count: productosNoOcultos.length,
        size_bytes: Buffer.byteLength(html, 'utf8'),
        generado_en
      };
      await this.safeUpdate.update(this._bundlesIndexPath(project_id), (snapshot) => {
        const store = snapshot || this._emptyBundlesIndex();
        if (!Array.isArray(store.bundles)) store.bundles = [];
        store.bundles.unshift(bundleMeta);
        // Conservar ultimos 20
        if (store.bundles.length > 20) store.bundles = store.bundles.slice(0, 20);
        return store;
      });

      const duration_ms = Date.now() - start;
      this.metrics?.timing?.('comandero-cliente.bundle.generar.duration', duration_ms, { project: project_id });
      this.metrics?.increment?.('comandero-cliente.bundle.generado.total', { project: project_id });
      this.logger.info('comandero-cliente-builder.bundle.generado', {
        project_id, bundle_id, bundle_path: bundlePath,
        productos_count: productosNoOcultos.length,
        size_bytes: bundleMeta.size_bytes,
        duration_ms
      });

      await this._publicarEvento('comandero-cliente.bundle.generado', {
        project_id,
        bundle_id,
        bundle_path: bundlePath,
        productos_count: productosNoOcultos.length,
        generado_en
      }, { correlation_id });

      return {
        status: 201,
        data: {
          project_id,
          bundle_id,
          bundle_path: bundlePath,
          productos_count: productosNoOcultos.length,
          size_bytes: bundleMeta.size_bytes,
          generado_en,
          latest_alias: latestPath
        }
      };
    } catch (err) {
      this.metrics?.increment?.('comandero-cliente.bundle.fallido.total', { project: project_id, fase: 'generar' });
      const errResponse = this._handleHandlerError('comandero-cliente-builder.bundle.error', err, 'tool');
      try {
        await this._publicarEvento('comandero-cliente.bundle.fallido', {
          project_id,
          bundle_id,
          fase: 'generar',
          error: errResponse.error
        }, { correlation_id });
      } catch (_publishErr) { /* ignore */ }
      return errResponse;
    }
  }
}

module.exports = ComanderoClienteBuilderModule;

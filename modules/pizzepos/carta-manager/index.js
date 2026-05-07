'use strict';

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

class CartaManagerModule {
  constructor() {
    this.name = 'carta-manager';
    this.version = '1.1.0';
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    // Multi-tenant: project_id → Map<carta_id, carta>
    this.cartasPerProject = new Map();
    // project_id → { featurePath, storagePath }
    this.projectPaths = new Map();
  }

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
    this.metrics = context.metrics;
    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.cartasPerProject.clear();
    this.projectPaths.clear();
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // POC2 Helpers
  // ==========================================

  _errorResponse(status, code, message, details) {
    const err = { code, message };
    if (details !== undefined) err.details = details;
    return { status, error: err };
  }

  _classifyHandlerError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('no encontrad')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('requiere') || msg.includes('inválid') || msg.includes('invalid') || msg.includes('validation')) return 'INVALID_INPUT';
    if (msg.includes('already') || msg.includes('ya existe')) return 'ALREADY_EXISTS';
    return 'UNKNOWN_ERROR';
  }

  _handleHandlerError(logKey, err, kind) {
    const code = err._code || this._classifyHandlerError(err);
    const statusMap = { RESOURCE_NOT_FOUND: 404, INVALID_INPUT: 400, ALREADY_EXISTS: 409, FILESYSTEM_ERROR: 500 };
    const status = statusMap[code] || 500;
    this.logger.error('carta-manager.handler_error', { handler: logKey, error: err.message, code });
    this.metrics?.increment('carta-manager.error', { kind: kind || logKey, code });
    return this._errorResponse(status, code, err.message, err._details);
  }

  async _publicarEvento(name, payload, ctx) {
    const correlation_id = ctx?.correlation_id || crypto.randomUUID();
    await this.eventBus.publish(name, { ...payload, correlation_id, timestamp: new Date().toISOString() });
  }

  async _emitCartaActualizada(carta, project_id, ctx) {
    await this._publicarEvento('carta.actualizada', { ...carta, project_id }, ctx);
  }

  // ==========================================
  // Project Lifecycle
  // ==========================================

  getCartas(projectId) {
    if (!this.cartasPerProject.has(projectId)) {
      this.cartasPerProject.set(projectId, new Map());
    }
    return this.cartasPerProject.get(projectId);
  }

  getPaths(projectId) {
    return this.projectPaths.get(projectId);
  }

  async onProjectActivated(event) {
    const data = event.data || event;
    const { project_id, base_path, metadata } = data;

    const resolvedBase = (metadata?.is_system === true) ? process.cwd() : base_path;
    if (resolvedBase) {
      this.projectPaths.set(project_id, {
        featurePath: path.join(resolvedBase, 'storage', 'pizzepos'),
        storagePath: path.join(resolvedBase, 'storage')
      });
    }

    await this.loadCartasFromDisk(project_id);
    this.logger.info('carta-manager.project.activated', {
      project_id, cartas: this.getCartas(project_id).size
    });
  }

  async onProjectDeactivated(event) {
    // Keep data — multi-tenant
  }

  // ==========================================
  // Domain event handlers
  // ==========================================

  async onCartaListarSolicitada(event) {
    const data = event.data || event.payload || event;
    const { project_id, request_id, correlation_id } = data;
    try {
      const result = await this.toolList({ project_id });
      if (result.error) {
        await this._publicarEvento('carta.listar.fallida', {
          request_id, project_id, error: result.error
        }, { correlation_id });
        return;
      }
      await this._publicarEvento('carta.listada', {
        request_id, project_id,
        cartas: result.data.cartas, total: result.data.total
      }, { correlation_id });
    } catch (err) {
      const code = err._code || this._classifyHandlerError(err);
      this.logger.error('carta-manager.listar.error', { project_id, error: err.message, code });
      await this._publicarEvento('carta.listar.fallida', {
        request_id, project_id, error: { code, message: err.message }
      }, { correlation_id });
    }
  }

  async onCartaEditarSolicitada(event) {
    const data = event.data || event.payload || event;
    const { carta_id, project_id, cambios, request_id, correlation_id } = data;
    try {
      if (cambios?.producto_id) {
        const result = await this.toolUpdateProduct({ carta_id, project_id, ...cambios });
        if (result.error) {
          await this._publicarEvento('carta.editar.fallida', {
            request_id, project_id, carta_id, error: result.error
          }, { correlation_id });
          return;
        }
      }
      await this._publicarEvento('carta.editada', {
        request_id, project_id, carta_id, cambios_aplicados: cambios
      }, { correlation_id });
    } catch (err) {
      const code = err._code || this._classifyHandlerError(err);
      this.logger.error('carta-manager.editar.error', { project_id, carta_id, error: err.message, code });
      await this._publicarEvento('carta.editar.fallida', {
        request_id, project_id, carta_id, error: { code, message: err.message }
      }, { correlation_id });
    }
  }

  async onCartaBorrarSolicitada(event) {
    const data = event.data || event.payload || event;
    const { carta_id, project_id, request_id, correlation_id } = data;
    try {
      const result = await this.toolDelete({ carta_id, project_id });
      if (result.error) {
        await this._publicarEvento('carta.borrar.fallida', {
          request_id, project_id, carta_id, error: result.error
        }, { correlation_id });
        return;
      }
      await this._publicarEvento('carta.borrada', {
        request_id, project_id, carta_id
      }, { correlation_id });
    } catch (err) {
      const code = err._code || this._classifyHandlerError(err);
      this.logger.error('carta-manager.borrar.error', { project_id, carta_id, error: err.message, code });
      await this._publicarEvento('carta.borrar.fallida', {
        request_id, project_id, carta_id, error: { code, message: err.message }
      }, { correlation_id });
    }
  }

  // ==========================================
  // Persistence
  // ==========================================

  cartasDirFor(projectId) {
    const paths = this.getPaths(projectId);
    return paths ? path.join(paths.featurePath, 'cartas') : null;
  }

  async saveCartaToDisk(carta, projectId) {
    const dir = this.cartasDirFor(projectId);
    if (!dir) return;
    try {
      await fs.mkdir(dir, { recursive: true });
      await this.saveVersion(carta.meta.id, dir);
      if (carta.meta) carta.meta.updated_at = new Date().toISOString();
      await fs.writeFile(
        path.join(dir, `${carta.meta.id}.json`),
        JSON.stringify(carta, null, 2), 'utf-8'
      );
    } catch (err) {
      this.logger.warn('carta-manager.save_failed', {
        carta_id: carta.meta?.id, project_id: projectId, error: err.message
      });
      this.metrics?.increment('carta-manager.save_failed', { project_id: projectId });
      throw err;
    }
  }

  async loadCartasFromDisk(projectId) {
    const dir = this.cartasDirFor(projectId);
    if (!dir) return;
    try {
      await fs.mkdir(dir, { recursive: true });
      const files = await fs.readdir(dir);
      const cartas = this.getCartas(projectId);

      for (const file of files.filter(f => f.endsWith('.json'))) {
        try {
          const content = await fs.readFile(path.join(dir, file), 'utf-8');
          const carta = JSON.parse(content);
          if (carta.meta?.id) cartas.set(carta.meta.id, carta);
        } catch (err) {
          this.logger.warn('carta-manager.load_failed', {
            file, project_id: projectId, error: err.message
          });
          this.metrics?.increment('carta-manager.load_failed', { project_id: projectId });
        }
      }
    } catch (err) {
      this.logger.warn('carta-manager.dir_error', {
        project_id: projectId, error: err.message
      });
      this.metrics?.increment('carta-manager.dir_error', { project_id: projectId });
    }
  }

  // ==========================================
  // Version Control
  // ==========================================

  versionsDir(cartasDir, cartaId) {
    return path.join(cartasDir, '.versions', cartaId);
  }

  async saveVersion(cartaId, cartasDir) {
    const currentPath = path.join(cartasDir, `${cartaId}.json`);
    try {
      const current = await fs.readFile(currentPath, 'utf-8');
      const vDir = this.versionsDir(cartasDir, cartaId);
      await fs.mkdir(vDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      await fs.writeFile(path.join(vDir, `${ts}.json`), current, 'utf-8');

      const files = (await fs.readdir(vDir)).filter(f => f.endsWith('.json')).sort();
      if (files.length > 50) {
        for (const old of files.slice(0, files.length - 50)) {
          await fs.unlink(path.join(vDir, old)).catch(e => {
            this.logger.debug('carta-manager.version.prune_failed', { carta_id: cartaId, file: old, error: e.message });
          });
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.debug('carta-manager.version.skip', {
          carta_id: cartaId, error: err.message
        });
      }
    }
  }

  // ==========================================
  // Tools — CRUD
  // ==========================================

  async toolSave({ carta_id, nombre, carta, project_id }) {
    if (!project_id) {
      this.logger.warn('carta-manager.save.validation', { field: 'project_id' });
      this.metrics?.increment('carta-manager.error', { kind: 'save', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere project_id');
    }

    const cartas = this.getCartas(project_id);
    let cartaObj;

    if (carta_id && cartas.has(carta_id)) {
      cartaObj = cartas.get(carta_id);
    } else if (carta && typeof carta === 'object') {
      carta_id = carta.meta?.id || `carta_${Date.now().toString(36)}`;
      cartaObj = this.normalizeCarta(carta_id, carta, nombre);
      cartas.set(carta_id, cartaObj);
    } else {
      carta_id = `carta_${Date.now().toString(36)}`;
      cartaObj = {
        meta: { id: carta_id, nombre: nombre || 'Carta sin nombre', source: 'manual', created_at: new Date().toISOString() },
        categorias: [],
        productos: []
      };
      cartas.set(carta_id, cartaObj);
    }

    cartaObj.meta.updated_at = new Date().toISOString();
    try {
      await this.saveCartaToDisk(cartaObj, project_id);
    } catch (err) {
      const e = Object.assign(err, { _code: 'FILESYSTEM_ERROR' });
      return this._handleHandlerError('save.disk_error', e, 'save');
    }
    await this._emitCartaActualizada(cartaObj, project_id);
    this.metrics?.increment('carta-manager.carta.saved', { project_id });

    return {
      status: 200,
      data: {
        carta_id: cartaObj.meta.id, nombre: cartaObj.meta.nombre,
        categorias: cartaObj.categorias.length, productos: cartaObj.productos.length,
        message: `Carta "${cartaObj.meta.nombre}" guardada.`
      }
    };
  }

  async toolGet({ carta_id, project_id }) {
    if (!carta_id) {
      this.logger.warn('carta-manager.get.validation', { field: 'carta_id' });
      this.metrics?.increment('carta-manager.error', { kind: 'get', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere carta_id');
    }
    if (!project_id) {
      this.logger.warn('carta-manager.get.validation', { field: 'project_id' });
      this.metrics?.increment('carta-manager.error', { kind: 'get', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere project_id');
    }

    const carta = this.getCartas(project_id).get(carta_id);
    if (!carta) {
      this.logger.warn('carta-manager.get.not_found', { carta_id, project_id });
      this.metrics?.increment('carta-manager.error', { kind: 'get', code: 'RESOURCE_NOT_FOUND' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Carta "${carta_id}" no encontrada`);
    }
    return { status: 200, data: carta };
  }

  async toolList({ project_id }) {
    if (!project_id) {
      this.logger.warn('carta-manager.list.validation', { field: 'project_id' });
      this.metrics?.increment('carta-manager.error', { kind: 'list', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere project_id');
    }

    const cartas = Array.from(this.getCartas(project_id).values())
      .sort((a, b) => new Date(b.meta.created_at) - new Date(a.meta.created_at))
      .map(c => ({
        id: c.meta.id, nombre: c.meta.nombre,
        productos: c.productos.length, categorias: c.categorias.length,
        created_at: c.meta.created_at, updated_at: c.meta.updated_at
      }));

    return { status: 200, data: { cartas, total: cartas.length } };
  }

  async toolDelete({ carta_id, project_id }) {
    if (!carta_id) {
      this.logger.warn('carta-manager.delete.validation', { field: 'carta_id' });
      this.metrics?.increment('carta-manager.error', { kind: 'delete', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere carta_id');
    }
    if (!project_id) {
      this.logger.warn('carta-manager.delete.validation', { field: 'project_id' });
      this.metrics?.increment('carta-manager.error', { kind: 'delete', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere project_id');
    }
    if (carta_id.includes('..') || carta_id.includes('/')) {
      this.logger.warn('carta-manager.delete.validation', { carta_id, reason: 'path_traversal' });
      this.metrics?.increment('carta-manager.error', { kind: 'delete', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'carta_id inválido');
    }

    const cartas = this.getCartas(project_id);
    const carta = cartas.get(carta_id);
    if (!carta) {
      this.logger.warn('carta-manager.delete.not_found', { carta_id, project_id });
      this.metrics?.increment('carta-manager.error', { kind: 'delete', code: 'RESOURCE_NOT_FOUND' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Carta "${carta_id}" no encontrada`);
    }

    const nombre = carta.meta?.nombre || carta_id;
    const dir = this.cartasDirFor(project_id);
    if (dir) {
      await this.saveVersion(carta_id, dir);
      try {
        await fs.unlink(path.join(dir, `${carta_id}.json`));
      } catch (err) {
        this.logger.warn('carta-manager.delete.unlink_failed', { carta_id, project_id, error: err.message });
        this.metrics?.increment('carta-manager.delete.unlink_failed', { project_id });
      }
    }
    cartas.delete(carta_id);
    this.metrics?.increment('carta-manager.carta.deleted', { project_id });

    return { status: 200, data: { carta_id, nombre, message: `Carta "${nombre}" eliminada.` } };
  }

  async toolAddProduct({ carta_id, project_id, nombre, categoria, precio, ingredientes }) {
    if (!project_id) {
      this.logger.warn('carta-manager.add_product.validation', { field: 'project_id' });
      this.metrics?.increment('carta-manager.error', { kind: 'add_product', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere project_id');
    }
    const carta = this.getCartas(project_id).get(carta_id);
    if (!carta) {
      this.logger.warn('carta-manager.add_product.not_found', { carta_id, project_id });
      this.metrics?.increment('carta-manager.error', { kind: 'add_product', code: 'RESOURCE_NOT_FOUND' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Carta "${carta_id}" no encontrada`);
    }

    const cat = carta.categorias.find(c => c.id === categoria);
    if (!cat) {
      this.logger.warn('carta-manager.add_product.categoria_not_found', { carta_id, categoria });
      this.metrics?.increment('carta-manager.error', { kind: 'add_product', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', `Categoría "${categoria}" no existe. Disponibles: ${carta.categorias.map(c => c.id).join(', ')}`);
    }

    const prodId = `${this._slugify(categoria)}_${this._slugify(nombre)}`;
    if (carta.productos.find(p => p.id === prodId)) {
      this.logger.warn('carta-manager.add_product.already_exists', { carta_id, prodId });
      this.metrics?.increment('carta-manager.error', { kind: 'add_product', code: 'ALREADY_EXISTS' });
      return this._errorResponse(409, 'ALREADY_EXISTS', `Ya existe "${prodId}"`);
    }

    const producto = {
      id: prodId, nombre, categoria, precio: Number(precio),
      ingredientes: this.normalizeIngredientes(ingredientes || [])
    };
    carta.productos.push(producto);

    try {
      await this.saveCartaToDisk(carta, project_id);
    } catch (err) {
      const e = Object.assign(err, { _code: 'FILESYSTEM_ERROR' });
      return this._handleHandlerError('add_product.disk_error', e, 'add_product');
    }
    await this._emitCartaActualizada(carta, project_id);
    this.metrics?.increment('carta-manager.carta.product.added', { project_id });
    return { status: 201, data: producto };
  }

  async toolRemoveProduct({ carta_id, project_id, producto_id }) {
    if (!project_id) {
      this.logger.warn('carta-manager.remove_product.validation', { field: 'project_id' });
      this.metrics?.increment('carta-manager.error', { kind: 'remove_product', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere project_id');
    }
    const carta = this.getCartas(project_id).get(carta_id);
    if (!carta) {
      this.logger.warn('carta-manager.remove_product.not_found', { carta_id, project_id });
      this.metrics?.increment('carta-manager.error', { kind: 'remove_product', code: 'RESOURCE_NOT_FOUND' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Carta "${carta_id}" no encontrada`);
    }

    const idx = carta.productos.findIndex(p => p.id === producto_id);
    if (idx === -1) {
      this.logger.warn('carta-manager.remove_product.not_found', { carta_id, producto_id });
      this.metrics?.increment('carta-manager.error', { kind: 'remove_product', code: 'RESOURCE_NOT_FOUND' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Producto "${producto_id}" no encontrado`);
    }

    const removed = carta.productos.splice(idx, 1)[0];
    try {
      await this.saveCartaToDisk(carta, project_id);
    } catch (err) {
      const e = Object.assign(err, { _code: 'FILESYSTEM_ERROR' });
      return this._handleHandlerError('remove_product.disk_error', e, 'remove_product');
    }
    await this._emitCartaActualizada(carta, project_id);
    this.metrics?.increment('carta-manager.carta.product.removed', { project_id });
    return { status: 200, data: { removed: removed.nombre, productos_restantes: carta.productos.length } };
  }

  async toolUpdateProduct({ carta_id, project_id, producto_id, nombre, precio, categoria, ingredientes }) {
    if (!project_id) {
      this.logger.warn('carta-manager.update_product.validation', { field: 'project_id' });
      this.metrics?.increment('carta-manager.error', { kind: 'update_product', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere project_id');
    }
    const carta = this.getCartas(project_id).get(carta_id);
    if (!carta) {
      this.logger.warn('carta-manager.update_product.not_found', { carta_id, project_id });
      this.metrics?.increment('carta-manager.error', { kind: 'update_product', code: 'RESOURCE_NOT_FOUND' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Carta "${carta_id}" no encontrada`);
    }

    const prod = carta.productos.find(p => p.id === producto_id);
    if (!prod) {
      this.logger.warn('carta-manager.update_product.not_found', { carta_id, producto_id });
      this.metrics?.increment('carta-manager.error', { kind: 'update_product', code: 'RESOURCE_NOT_FOUND' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Producto "${producto_id}" no encontrado`);
    }

    if (nombre !== undefined) prod.nombre = nombre;
    if (precio !== undefined) prod.precio = Number(precio);
    if (categoria !== undefined) {
      if (!carta.categorias.find(c => c.id === categoria)) {
        this.logger.warn('carta-manager.update_product.categoria_not_found', { carta_id, categoria });
        this.metrics?.increment('carta-manager.error', { kind: 'update_product', code: 'INVALID_INPUT' });
        return this._errorResponse(400, 'INVALID_INPUT', `Categoría "${categoria}" no existe`);
      }
      prod.categoria = categoria;
    }
    if (ingredientes !== undefined) prod.ingredientes = this.normalizeIngredientes(ingredientes);

    try {
      await this.saveCartaToDisk(carta, project_id);
    } catch (err) {
      const e = Object.assign(err, { _code: 'FILESYSTEM_ERROR' });
      return this._handleHandlerError('update_product.disk_error', e, 'update_product');
    }
    await this._emitCartaActualizada(carta, project_id);
    return { status: 200, data: prod };
  }

  async toolAddCategory({ carta_id, project_id, nombre }) {
    if (!project_id) {
      this.logger.warn('carta-manager.add_category.validation', { field: 'project_id' });
      this.metrics?.increment('carta-manager.error', { kind: 'add_category', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere project_id');
    }
    const carta = this.getCartas(project_id).get(carta_id);
    if (!carta) {
      this.logger.warn('carta-manager.add_category.not_found', { carta_id, project_id });
      this.metrics?.increment('carta-manager.error', { kind: 'add_category', code: 'RESOURCE_NOT_FOUND' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Carta "${carta_id}" no encontrada`);
    }

    const catId = this._slugify(nombre);
    if (carta.categorias.find(c => c.id === catId)) {
      this.logger.warn('carta-manager.add_category.already_exists', { carta_id, catId });
      this.metrics?.increment('carta-manager.error', { kind: 'add_category', code: 'ALREADY_EXISTS' });
      return this._errorResponse(409, 'ALREADY_EXISTS', `Ya existe categoría "${catId}"`);
    }

    const maxOrden = carta.categorias.reduce((max, c) => Math.max(max, c.orden), 0);
    const cat = { id: catId, nombre, orden: maxOrden + 1 };
    carta.categorias.push(cat);

    try {
      await this.saveCartaToDisk(carta, project_id);
    } catch (err) {
      const e = Object.assign(err, { _code: 'FILESYSTEM_ERROR' });
      return this._handleHandlerError('add_category.disk_error', e, 'add_category');
    }
    await this._emitCartaActualizada(carta, project_id);
    return { status: 201, data: cat };
  }

  async toolUpdatePrices({ carta_id, project_id, porcentaje, categoria, precios }) {
    if (!project_id) {
      this.logger.warn('carta-manager.update_prices.validation', { field: 'project_id' });
      this.metrics?.increment('carta-manager.error', { kind: 'update_prices', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere project_id');
    }
    const carta = this.getCartas(project_id).get(carta_id);
    if (!carta) {
      this.logger.warn('carta-manager.update_prices.not_found', { carta_id, project_id });
      this.metrics?.increment('carta-manager.error', { kind: 'update_prices', code: 'RESOURCE_NOT_FOUND' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Carta "${carta_id}" no encontrada`);
    }
    if (!porcentaje && !precios) {
      this.logger.warn('carta-manager.update_prices.validation', { carta_id, reason: 'no_prices_or_porcentaje' });
      this.metrics?.increment('carta-manager.error', { kind: 'update_prices', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere "porcentaje" o "precios"');
    }

    const cambios = [];
    if (precios && typeof precios === 'object') {
      for (const [prodId, nuevoPrecio] of Object.entries(precios)) {
        const prod = carta.productos.find(p => p.id === prodId);
        if (prod) {
          const anterior = prod.precio;
          prod.precio = Number(nuevoPrecio);
          cambios.push({ id: prodId, nombre: prod.nombre, anterior, nuevo: prod.precio });
        }
      }
    }
    if (typeof porcentaje === 'number') {
      const factor = 1 + porcentaje / 100;
      for (const prod of carta.productos) {
        if (categoria && prod.categoria !== categoria) continue;
        if (precios && precios[prod.id] !== undefined) continue;
        const anterior = prod.precio;
        prod.precio = Math.round(prod.precio * factor * 100) / 100;
        cambios.push({ id: prod.id, nombre: prod.nombre, anterior, nuevo: prod.precio });
      }
    }

    try {
      await this.saveCartaToDisk(carta, project_id);
    } catch (err) {
      const e = Object.assign(err, { _code: 'FILESYSTEM_ERROR' });
      return this._handleHandlerError('update_prices.disk_error', e, 'update_prices');
    }
    await this._emitCartaActualizada(carta, project_id);
    this.metrics?.increment('carta-manager.carta.prices.updated', { project_id });
    return { status: 200, data: { carta_id, productos_actualizados: cambios.length, cambios } };
  }

  async toolSearch({ carta_id, project_id, query }) {
    if (!project_id) {
      this.logger.warn('carta-manager.search.validation', { field: 'project_id' });
      this.metrics?.increment('carta-manager.error', { kind: 'search', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere project_id');
    }
    const carta = this.getCartas(project_id).get(carta_id);
    if (!carta) {
      this.logger.warn('carta-manager.search.not_found', { carta_id, project_id });
      this.metrics?.increment('carta-manager.error', { kind: 'search', code: 'RESOURCE_NOT_FOUND' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Carta "${carta_id}" no encontrada`);
    }
    if (!query) {
      this.logger.warn('carta-manager.search.validation', { field: 'query' });
      this.metrics?.increment('carta-manager.error', { kind: 'search', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere "query"');
    }

    const q = query.toLowerCase();
    const results = carta.productos.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      p.ingredientes.some(i => i.nombre.toLowerCase().includes(q))
    );
    return { status: 200, data: { query, resultados: results.length, productos: results } };
  }

  async toolStats({ carta_id, project_id }) {
    if (!project_id) {
      this.logger.warn('carta-manager.stats.validation', { field: 'project_id' });
      this.metrics?.increment('carta-manager.error', { kind: 'stats', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere project_id');
    }
    const carta = this.getCartas(project_id).get(carta_id);
    if (!carta) {
      this.logger.warn('carta-manager.stats.not_found', { carta_id, project_id });
      this.metrics?.increment('carta-manager.error', { kind: 'stats', code: 'RESOURCE_NOT_FOUND' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Carta "${carta_id}" no encontrada`);
    }

    const precios = carta.productos.map(p => p.precio).filter(p => p > 0);
    const porCategoria = {};
    for (const p of carta.productos) porCategoria[p.categoria] = (porCategoria[p.categoria] || 0) + 1;

    return {
      status: 200,
      data: {
        carta_id, nombre: carta.meta.nombre,
        total_productos: carta.productos.length, total_categorias: carta.categorias.length,
        total_ingredientes: carta.productos.reduce((sum, p) => sum + p.ingredientes.length, 0),
        precio_min: precios.length ? Math.min(...precios) : 0,
        precio_max: precios.length ? Math.max(...precios) : 0,
        precio_medio: precios.length ? Math.round(precios.reduce((a, b) => a + b, 0) / precios.length * 100) / 100 : 0,
        por_categoria: porCategoria
      }
    };
  }

  async toolVersions({ carta_id, project_id }) {
    if (!carta_id || !project_id) {
      this.logger.warn('carta-manager.versions.validation', { carta_id, project_id });
      this.metrics?.increment('carta-manager.error', { kind: 'versions', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere carta_id y project_id');
    }

    const dir = this.cartasDirFor(project_id);
    if (!dir) return { status: 200, data: { carta_id, versions: [], total: 0 } };

    const vDir = this.versionsDir(dir, carta_id);
    const versions = [];
    try {
      const files = (await fs.readdir(vDir)).filter(f => f.endsWith('.json')).sort().reverse();
      for (const file of files) {
        try {
          const raw = await fs.readFile(path.join(vDir, file), 'utf-8');
          const c = JSON.parse(raw);
          versions.push({
            file, timestamp: c.meta?.updated_at || file.replace('.json', ''),
            nombre: c.meta?.nombre || carta_id,
            productos: c.productos?.length || 0, categorias: c.categorias?.length || 0
          });
        } catch (err) {
          this.logger.warn('carta-manager.versions.read_failed', { carta_id, file, error: err.message });
          this.metrics?.increment('carta-manager.versions.read_failed', { project_id });
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('carta-manager.versions.dir_error', { carta_id, project_id, error: err.message });
        this.metrics?.increment('carta-manager.versions.dir_error', { project_id });
      }
    }

    return { status: 200, data: { carta_id, versions, total: versions.length } };
  }

  async toolRestore({ carta_id, version_file, project_id }) {
    if (!carta_id || !version_file || !project_id) {
      this.logger.warn('carta-manager.restore.validation', { carta_id, version_file, project_id });
      this.metrics?.increment('carta-manager.error', { kind: 'restore', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere carta_id, version_file y project_id');
    }
    if (carta_id.includes('..') || version_file.includes('..')) {
      this.logger.warn('carta-manager.restore.validation', { carta_id, version_file, reason: 'path_traversal' });
      this.metrics?.increment('carta-manager.error', { kind: 'restore', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Parámetro inválido');
    }

    const dir = this.cartasDirFor(project_id);
    if (!dir) {
      this.logger.warn('carta-manager.restore.no_paths', { carta_id, project_id });
      this.metrics?.increment('carta-manager.error', { kind: 'restore', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Proyecto sin paths');
    }

    let carta;
    try {
      carta = JSON.parse(await fs.readFile(path.join(this.versionsDir(dir, carta_id), version_file), 'utf-8'));
    } catch (err) {
      this.logger.warn('carta-manager.restore.version_not_found', { carta_id, version_file, error: err.message });
      this.metrics?.increment('carta-manager.error', { kind: 'restore', code: 'RESOURCE_NOT_FOUND' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Versión "${version_file}" no encontrada`);
    }

    await this.saveVersion(carta_id, dir);
    carta.meta.restored_from = version_file;
    carta.meta.restored_at = new Date().toISOString();
    try {
      await fs.writeFile(path.join(dir, `${carta_id}.json`), JSON.stringify(carta, null, 2), 'utf-8');
    } catch (err) {
      this.logger.error('carta-manager.restore.disk_error', { carta_id, error: err.message });
      this.metrics?.increment('carta-manager.error', { kind: 'restore', code: 'FILESYSTEM_ERROR' });
      return this._errorResponse(500, 'FILESYSTEM_ERROR', err.message);
    }

    this.getCartas(project_id).set(carta_id, carta);
    await this._emitCartaActualizada(carta, project_id);

    return {
      status: 200,
      data: {
        carta_id, restored_from: version_file, nombre: carta.meta?.nombre,
        productos: carta.productos?.length || 0, categorias: carta.categorias?.length || 0,
        message: `Carta restaurada desde ${version_file}.`
      }
    };
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleList(data) { return (await this.toolList({ project_id: data?.project_id })).data; }
  async handleGet(data) {
    const r = await this.toolGet({ carta_id: data.id || data.carta_id, project_id: data.project_id });
    if (r.error) throw { status: r.status, code: r.error.code, message: r.error.message };
    return r.data;
  }
  async handleHealth() {
    let total = 0;
    for (const c of this.cartasPerProject.values()) total += c.size;
    return { status: 'healthy', module: this.name, version: this.version, cartas: total, proyectos: this.cartasPerProject.size };
  }

  // ==========================================
  // Utils
  // ==========================================

  _slugify(text) {
    if (!text) return 'sin_nombre';
    return text.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'sin_nombre';
  }

  normalizeIngredientes(ingredientes) {
    if (typeof ingredientes === 'string') {
      return ingredientes.split(',').map(s => ({ nombre: s.trim() })).filter(i => i.nombre.length > 0);
    }
    if (Array.isArray(ingredientes)) {
      return ingredientes.map(ing => {
        if (typeof ing === 'string') return { nombre: ing.trim() };
        const r = { nombre: ing.nombre || ing.name || '' };
        if (ing.emoji) r.emoji = ing.emoji;
        if (ing.tipo) r.tipo = ing.tipo;
        if (ing.precio_extra != null) r.precio_extra = ing.precio_extra;
        return r;
      }).filter(i => i.nombre.length > 0);
    }
    return [];
  }

  normalizeCarta(cartaId, raw, nombre) {
    const categorias = (raw.categorias || []).map((cat, idx) => ({
      id: cat.id || this._slugify(cat.nombre), nombre: cat.nombre,
      orden: cat.orden !== undefined ? cat.orden : idx + 1
    }));
    const productos = (raw.productos || []).map(p => ({
      id: p.id || `${this._slugify(p.categoria || 'general')}_${this._slugify(p.nombre)}`,
      nombre: p.nombre, categoria: p.categoria || 'general',
      precio: typeof p.precio === 'number' ? p.precio : parseFloat(p.precio) || 0,
      ingredientes: this.normalizeIngredientes(p.ingredientes || []),
      ...(p.descripcion && { descripcion: p.descripcion }),
      ...(p.emoji && { emoji: p.emoji }),
      ...(p.tags && { tags: p.tags }),
      ...(p.imagen && { imagen: p.imagen })
    }));

    return {
      meta: {
        id: cartaId,
        nombre: raw.meta?.nombre || raw.nombre_carta || nombre || 'Carta sin nombre',
        source: raw.meta?.source || 'external',
        created_at: raw.meta?.created_at || new Date().toISOString()
      },
      categorias, productos
    };
  }
}

module.exports = CartaManagerModule;

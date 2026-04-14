/**
 * Carta Manager v1.0.0 — Dueño de datos de cartas
 *
 * CRUD, persistencia, versionado, búsqueda, estadísticas.
 * Gestiona cartas durante todo su ciclo de vida.
 * Los agentes (menu-structurer, tarifas-creator) guardan cartas via carta.save tool.
 *
 * Tools expuestos al LLM y agentes:
 *   carta.save         — Guardar carta (nueva o existente)
 *   carta.get          — Obtener por ID
 *   carta.list         — Listar todas
 *   carta.delete       — Eliminar (con versión de seguridad)
 *   carta.add_product  — Añadir producto
 *   carta.remove_product — Eliminar producto
 *   carta.update_product — Actualizar producto
 *   carta.add_category — Añadir categoría
 *   carta.update_prices — Ajustar precios
 *   carta.search       — Buscar productos
 *   carta.stats        — Estadísticas
 *   carta.versions     — Historial de versiones
 *   carta.restore      — Restaurar versión anterior
 */

const path = require('path');
const fs = require('fs').promises;

class CartaManagerModule {
  constructor() {
    this.name = 'carta-manager';
    this.version = '1.0.0';
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
        }
      }
    } catch (err) {
      this.logger.warn('carta-manager.dir_error', {
        project_id: projectId, error: err.message
      });
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
          await fs.unlink(path.join(vDir, old)).catch(() => {});
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
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };

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
    await this.saveCartaToDisk(cartaObj, project_id);
    await this.eventBus.publish('carta.actualizada', { ...cartaObj, project_id });

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
    if (!carta_id) return { status: 400, error: 'Se requiere carta_id' };
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };

    const carta = this.getCartas(project_id).get(carta_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada` };
    return { status: 200, data: carta };
  }

  async toolList({ project_id }) {
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };

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
    if (!carta_id) return { status: 400, error: 'Se requiere carta_id' };
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    if (carta_id.includes('..') || carta_id.includes('/')) return { status: 400, error: 'carta_id inválido' };

    const cartas = this.getCartas(project_id);
    const carta = cartas.get(carta_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada` };

    const nombre = carta.meta?.nombre || carta_id;
    const dir = this.cartasDirFor(project_id);
    if (dir) {
      await this.saveVersion(carta_id, dir);
      try { await fs.unlink(path.join(dir, `${carta_id}.json`)); } catch (_) {}
    }
    cartas.delete(carta_id);

    return { status: 200, data: { carta_id, nombre, message: `Carta "${nombre}" eliminada.` } };
  }

  async toolAddProduct({ carta_id, project_id, nombre, categoria, precio, ingredientes }) {
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    const carta = this.getCartas(project_id).get(carta_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada` };

    const cat = carta.categorias.find(c => c.id === categoria);
    if (!cat) return { status: 400, error: `Categoría "${categoria}" no existe. Disponibles: ${carta.categorias.map(c => c.id).join(', ')}` };

    const prodId = `${this.slugify(categoria)}_${this.slugify(nombre)}`;
    if (carta.productos.find(p => p.id === prodId)) return { status: 409, error: `Ya existe "${prodId}"` };

    const producto = {
      id: prodId, nombre, categoria, precio: Number(precio),
      ingredientes: this.normalizeIngredientes(ingredientes || [])
    };
    carta.productos.push(producto);

    await this.saveCartaToDisk(carta, project_id);
    await this.eventBus.publish('carta.actualizada', { ...carta, project_id });
    return { status: 201, data: producto };
  }

  async toolRemoveProduct({ carta_id, project_id, producto_id }) {
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    const carta = this.getCartas(project_id).get(carta_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada` };

    const idx = carta.productos.findIndex(p => p.id === producto_id);
    if (idx === -1) return { status: 404, error: `Producto "${producto_id}" no encontrado` };

    const removed = carta.productos.splice(idx, 1)[0];
    await this.saveCartaToDisk(carta, project_id);
    await this.eventBus.publish('carta.actualizada', { ...carta, project_id });
    return { status: 200, data: { removed: removed.nombre, productos_restantes: carta.productos.length } };
  }

  async toolUpdateProduct({ carta_id, project_id, producto_id, nombre, precio, categoria, ingredientes }) {
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    const carta = this.getCartas(project_id).get(carta_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada` };

    const prod = carta.productos.find(p => p.id === producto_id);
    if (!prod) return { status: 404, error: `Producto "${producto_id}" no encontrado` };

    if (nombre !== undefined) prod.nombre = nombre;
    if (precio !== undefined) prod.precio = Number(precio);
    if (categoria !== undefined) {
      if (!carta.categorias.find(c => c.id === categoria)) return { status: 400, error: `Categoría "${categoria}" no existe` };
      prod.categoria = categoria;
    }
    if (ingredientes !== undefined) prod.ingredientes = this.normalizeIngredientes(ingredientes);

    await this.saveCartaToDisk(carta, project_id);
    await this.eventBus.publish('carta.actualizada', { ...carta, project_id });
    return { status: 200, data: prod };
  }

  async toolAddCategory({ carta_id, project_id, nombre }) {
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    const carta = this.getCartas(project_id).get(carta_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada` };

    const catId = this.slugify(nombre);
    if (carta.categorias.find(c => c.id === catId)) return { status: 409, error: `Ya existe categoría "${catId}"` };

    const maxOrden = carta.categorias.reduce((max, c) => Math.max(max, c.orden), 0);
    const cat = { id: catId, nombre, orden: maxOrden + 1 };
    carta.categorias.push(cat);

    await this.saveCartaToDisk(carta, project_id);
    await this.eventBus.publish('carta.actualizada', { ...carta, project_id });
    return { status: 201, data: cat };
  }

  async toolUpdatePrices({ carta_id, project_id, porcentaje, categoria, precios }) {
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    const carta = this.getCartas(project_id).get(carta_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada` };
    if (!porcentaje && !precios) return { status: 400, error: 'Se requiere "porcentaje" o "precios"' };

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

    await this.saveCartaToDisk(carta, project_id);
    await this.eventBus.publish('carta.actualizada', { ...carta, project_id });
    return { status: 200, data: { carta_id, productos_actualizados: cambios.length, cambios } };
  }

  async toolSearch({ carta_id, project_id, query }) {
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    const carta = this.getCartas(project_id).get(carta_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada` };
    if (!query) return { status: 400, error: 'Se requiere "query"' };

    const q = query.toLowerCase();
    const results = carta.productos.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      p.ingredientes.some(i => i.nombre.toLowerCase().includes(q))
    );
    return { status: 200, data: { query, resultados: results.length, productos: results } };
  }

  async toolStats({ carta_id, project_id }) {
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    const carta = this.getCartas(project_id).get(carta_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada` };

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
    if (!carta_id || !project_id) return { status: 400, error: 'Se requiere carta_id y project_id' };

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
        } catch (_) {}
      }
    } catch (_) {}

    return { status: 200, data: { carta_id, versions, total: versions.length } };
  }

  async toolRestore({ carta_id, version_file, project_id }) {
    if (!carta_id || !version_file || !project_id) return { status: 400, error: 'Se requiere carta_id, version_file y project_id' };
    if (carta_id.includes('..') || version_file.includes('..')) return { status: 400, error: 'Parámetro inválido' };

    const dir = this.cartasDirFor(project_id);
    if (!dir) return { status: 400, error: 'Proyecto sin paths' };

    let carta;
    try {
      carta = JSON.parse(await fs.readFile(path.join(this.versionsDir(dir, carta_id), version_file), 'utf-8'));
    } catch (_) {
      return { status: 404, error: `Versión "${version_file}" no encontrada` };
    }

    await this.saveVersion(carta_id, dir);
    carta.meta.restored_from = version_file;
    carta.meta.restored_at = new Date().toISOString();
    await fs.writeFile(path.join(dir, `${carta_id}.json`), JSON.stringify(carta, null, 2), 'utf-8');

    this.getCartas(project_id).set(carta_id, carta);
    await this.eventBus.publish('carta.actualizada', { ...carta, project_id });

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
    if (r.error) throw { status: r.status, code: 'NOT_FOUND', message: r.error };
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

  slugify(text) {
    if (!text) return 'sin_nombre';
    return text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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
      id: cat.id || this.slugify(cat.nombre), nombre: cat.nombre,
      orden: cat.orden !== undefined ? cat.orden : idx + 1
    }));
    const productos = (raw.productos || []).map(p => ({
      id: p.id || `${this.slugify(p.categoria || 'general')}_${this.slugify(p.nombre)}`,
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

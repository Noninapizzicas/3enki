/**
 * Menu Generator v5.0.0 — CRUD & Data Owner
 *
 * Dueño de los datos de cartas de restaurante.
 * Responsabilidad única: CRUD + persistencia + versionado.
 *
 * NO ejecuta pipeline OCR (→ agente menu-extractor)
 * NO llama a IA para estructurar (→ agente menu-structurer)
 * NO enriquece productos (→ agente menu-enricher)
 * NO exporta al POS (→ escucha eventos downstream o handler dedicado)
 * NO gestiona imágenes de marketing (→ módulo carta-marketing/design)
 *
 * Tools expuestos al LLM (via toolsRegistry):
 *   menu.save_carta       — Crear/guardar carta
 *   menu.get_carta         — Obtener carta por ID
 *   menu.list_cartas       — Listar cartas
 *   menu.delete_carta      — Eliminar carta
 *   menu.add_product       — Añadir producto
 *   menu.remove_product    — Eliminar producto
 *   menu.update_product    — Actualizar producto
 *   menu.add_category      — Añadir categoría
 *   menu.update_prices     — Ajustar precios
 *   menu.search_products   — Buscar productos
 *   menu.stats             — Estadísticas
 *   menu.list_versions     — Historial de versiones
 *   menu.restore_version   — Restaurar versión
 *
 * Output: schemas/carta-output.json
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;

class MenuGeneratorModule {
  constructor() {
    this.name = 'menu-generator';
    this.version = '5.0.0';
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    // Multi-tenant: project_id → Map<carta_id, carta>
    this.cartasPerProject = new Map();
    // project_id → { featurePath, storagePath }
    this.projectPaths = new Map();
  }

  // ==========================================
  // Lifecycle
  // ==========================================

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

    this.logger.info('menu-generator.project.activated', {
      project_id,
      paths: this.projectPaths.get(project_id)
    });

    await this.loadCartasFromDisk(project_id);
  }

  async onProjectDeactivated(event) {
    // Keep data in memory for multi-tenant access
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
      const filePath = path.join(dir, `${carta.meta.id}.json`);

      // Versionado: guardar copia antes de sobreescribir
      await this.saveVersion(carta.meta.id, dir);

      if (carta.meta) carta.meta.updated_at = new Date().toISOString();
      await fs.writeFile(filePath, JSON.stringify(carta, null, 2), 'utf-8');
    } catch (err) {
      this.logger.warn('menu-generator.carta.save_failed', {
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
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      const cartas = this.getCartas(projectId);

      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(dir, file), 'utf-8');
          const carta = JSON.parse(content);
          if (carta.meta?.id) {
            cartas.set(carta.meta.id, carta);
          }
        } catch (err) {
          this.logger.warn('menu-generator.carta.load_failed', {
            file, project_id: projectId, error: err.message
          });
        }
      }

      this.logger.info('menu-generator.cartas.loaded', {
        project_id: projectId, count: cartas.size
      });
    } catch (err) {
      this.logger.warn('menu-generator.cartas.dir_error', {
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

      // Limitar a 50 versiones
      const files = (await fs.readdir(vDir)).filter(f => f.endsWith('.json')).sort();
      if (files.length > 50) {
        for (const old of files.slice(0, files.length - 50)) {
          await fs.unlink(path.join(vDir, old)).catch(() => {});
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.debug('menu-generator.version.save_skip', {
          carta_id: cartaId, error: err.message
        });
      }
    }
  }

  // ==========================================
  // Tools — CRUD expuesto al LLM y agentes
  // ==========================================

  async toolSaveCarta({ carta_id, nombre, carta, project_id }) {
    if (!project_id) {
      const firstProject = this.projectPaths.keys().next().value;
      project_id = firstProject || 'default';
    }

    const cartas = this.getCartas(project_id);
    let cartaObj;

    if (carta_id && cartas.has(carta_id)) {
      // Guardar carta existente en memoria
      cartaObj = cartas.get(carta_id);
    } else if (carta && typeof carta === 'object') {
      // Guardar carta completa recibida del agente structurer
      carta_id = carta.meta?.id || `carta_${Date.now().toString(36)}`;
      cartaObj = this.normalizeCarta(carta_id, carta, nombre);
      cartas.set(carta_id, cartaObj);
    } else {
      // Crear carta vacía nueva
      carta_id = `carta_${Date.now().toString(36)}`;
      cartaObj = {
        meta: {
          id: carta_id,
          nombre: nombre || 'Carta sin nombre',
          source: 'manual',
          created_at: new Date().toISOString()
        },
        categorias: [],
        productos: []
      };
      cartas.set(carta_id, cartaObj);
    }

    cartaObj.meta.updated_at = new Date().toISOString();
    await this.saveCartaToDisk(cartaObj, project_id);

    await this.eventBus.publish('carta.generada', { ...cartaObj, project_id });

    this.logger.info('menu-generator.carta.saved', {
      carta_id: cartaObj.meta.id, project_id,
      categorias: cartaObj.categorias.length,
      productos: cartaObj.productos.length
    });

    return {
      status: 200,
      data: {
        carta_id: cartaObj.meta.id,
        nombre: cartaObj.meta.nombre,
        categorias: cartaObj.categorias.length,
        productos: cartaObj.productos.length,
        message: `Carta "${cartaObj.meta.nombre}" guardada con ${cartaObj.productos.length} productos en ${cartaObj.categorias.length} categorías.`
      }
    };
  }

  async toolGetCarta({ carta_id, project_id }) {
    if (!carta_id) return { status: 400, error: 'Se requiere carta_id' };
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };

    const carta = this.getCartas(project_id).get(carta_id);
    if (!carta) {
      return { status: 404, error: `Carta "${carta_id}" no encontrada` };
    }

    return { status: 200, data: carta };
  }

  async toolListCartas({ project_id }) {
    if (!project_id) return { status: 400, error: 'Se requiere "project_id"' };

    const cartas = Array.from(this.getCartas(project_id).values())
      .sort((a, b) => new Date(b.meta.created_at) - new Date(a.meta.created_at));

    const lista = cartas.map(c => ({
      id: c.meta.id,
      nombre: c.meta.nombre,
      estado: 'generada',
      productos: c.productos.length,
      categorias: c.categorias.length,
      created_at: c.meta.created_at,
      updated_at: c.meta.updated_at
    }));

    return { status: 200, data: { cartas: lista, total: lista.length } };
  }

  async toolDeleteCarta({ carta_id, project_id }) {
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
    this.logger.info('menu-generator.carta.deleted', { carta_id, project_id, nombre });

    return {
      status: 200,
      data: {
        carta_id, nombre,
        message: `Carta "${nombre}" eliminada. La última versión se guardó en el historial.`
      }
    };
  }

  async toolAddProduct({ carta_id, project_id, nombre, categoria, precio, ingredientes }) {
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    const carta = this.getCartas(project_id).get(carta_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada` };

    const cat = carta.categorias.find(c => c.id === categoria);
    if (!cat) {
      return { status: 400, error: `Categoría "${categoria}" no existe. Categorías: ${carta.categorias.map(c => c.id).join(', ')}` };
    }

    const prodId = `${this.slugify(categoria)}_${this.slugify(nombre)}`;
    if (carta.productos.find(p => p.id === prodId)) {
      return { status: 409, error: `Ya existe un producto con ID "${prodId}"` };
    }

    const producto = {
      id: prodId, nombre, categoria,
      precio: Number(precio),
      ingredientes: this.normalizeIngredientes(ingredientes || [])
    };

    carta.productos.push(producto);
    this.metrics?.increment('menu.product.added');
    await this.saveCartaToDisk(carta, project_id);
    await this.eventBus.publish('carta.generada', { ...carta, project_id });

    return { status: 201, data: producto };
  }

  async toolRemoveProduct({ carta_id, project_id, producto_id }) {
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    const carta = this.getCartas(project_id).get(carta_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada` };

    const idx = carta.productos.findIndex(p => p.id === producto_id);
    if (idx === -1) return { status: 404, error: `Producto "${producto_id}" no encontrado` };

    const removed = carta.productos.splice(idx, 1)[0];
    this.metrics?.increment('menu.product.removed');
    await this.saveCartaToDisk(carta, project_id);
    await this.eventBus.publish('carta.generada', { ...carta, project_id });

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
      if (!carta.categorias.find(c => c.id === categoria)) {
        return { status: 400, error: `Categoría "${categoria}" no existe` };
      }
      prod.categoria = categoria;
    }
    if (ingredientes !== undefined) {
      prod.ingredientes = this.normalizeIngredientes(ingredientes);
    }

    await this.saveCartaToDisk(carta, project_id);
    await this.eventBus.publish('carta.generada', { ...carta, project_id });

    return { status: 200, data: prod };
  }

  async toolAddCategory({ carta_id, project_id, nombre }) {
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    const carta = this.getCartas(project_id).get(carta_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada` };

    const catId = this.slugify(nombre);
    if (carta.categorias.find(c => c.id === catId)) {
      return { status: 409, error: `Ya existe categoría "${catId}"` };
    }

    const maxOrden = carta.categorias.reduce((max, c) => Math.max(max, c.orden), 0);
    const categoria = { id: catId, nombre, orden: maxOrden + 1 };
    carta.categorias.push(categoria);

    await this.saveCartaToDisk(carta, project_id);
    await this.eventBus.publish('carta.generada', { ...carta, project_id });

    return { status: 201, data: categoria };
  }

  async toolUpdatePrices({ carta_id, project_id, porcentaje, categoria, precios }) {
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    const carta = this.getCartas(project_id).get(carta_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada` };

    if (!porcentaje && !precios) {
      return { status: 400, error: 'Se requiere "porcentaje" o "precios" (objeto {producto_id: nuevo_precio})' };
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

    this.metrics?.increment('menu.prices.updated');
    await this.saveCartaToDisk(carta, project_id);
    await this.eventBus.publish('carta.generada', { ...carta, project_id });

    return { status: 200, data: { carta_id, productos_actualizados: cambios.length, cambios } };
  }

  async toolSearchProducts({ carta_id, project_id, query }) {
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
    for (const p of carta.productos) {
      porCategoria[p.categoria] = (porCategoria[p.categoria] || 0) + 1;
    }

    return {
      status: 200,
      data: {
        carta_id, nombre: carta.meta.nombre,
        total_productos: carta.productos.length,
        total_categorias: carta.categorias.length,
        total_ingredientes: carta.productos.reduce((sum, p) => sum + p.ingredientes.length, 0),
        precio_min: precios.length > 0 ? Math.min(...precios) : 0,
        precio_max: precios.length > 0 ? Math.max(...precios) : 0,
        precio_medio: precios.length > 0 ? Math.round(precios.reduce((a, b) => a + b, 0) / precios.length * 100) / 100 : 0,
        por_categoria: porCategoria
      }
    };
  }

  async toolListVersions({ carta_id, project_id }) {
    if (!carta_id) return { status: 400, error: 'Se requiere carta_id' };
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };

    const dir = this.cartasDirFor(project_id);
    if (!dir) return { status: 200, data: { carta_id, versions: [], total: 0 } };

    const vDir = this.versionsDir(dir, carta_id);
    let versions = [];
    try {
      const files = (await fs.readdir(vDir)).filter(f => f.endsWith('.json')).sort().reverse();
      for (const file of files) {
        try {
          const raw = await fs.readFile(path.join(vDir, file), 'utf-8');
          const carta = JSON.parse(raw);
          versions.push({
            file,
            timestamp: carta.meta?.updated_at || file.replace('.json', ''),
            nombre: carta.meta?.nombre || carta_id,
            productos: carta.productos?.length || 0,
            categorias: carta.categorias?.length || 0,
            size_bytes: Buffer.byteLength(raw, 'utf-8')
          });
        } catch (_) {}
      }
    } catch (_) {}

    return { status: 200, data: { carta_id, versions, total: versions.length } };
  }

  async toolRestoreVersion({ carta_id, version_file, project_id }) {
    if (!carta_id) return { status: 400, error: 'Se requiere carta_id' };
    if (!version_file) return { status: 400, error: 'Se requiere version_file' };
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    if (carta_id.includes('..') || carta_id.includes('/')) return { status: 400, error: 'carta_id inválido' };
    if (version_file.includes('..') || version_file.includes('/')) return { status: 400, error: 'version_file inválido' };

    const dir = this.cartasDirFor(project_id);
    if (!dir) return { status: 400, error: 'Proyecto sin paths configurados' };

    const vDir = this.versionsDir(dir, carta_id);
    const versionPath = path.join(vDir, version_file);

    let carta;
    try {
      carta = JSON.parse(await fs.readFile(versionPath, 'utf-8'));
    } catch (_) {
      return { status: 404, error: `Versión "${version_file}" no encontrada` };
    }

    await this.saveVersion(carta_id, dir);

    carta.meta.restored_from = version_file;
    carta.meta.restored_at = new Date().toISOString();
    await fs.writeFile(path.join(dir, `${carta_id}.json`), JSON.stringify(carta, null, 2), 'utf-8');

    const cartas = this.getCartas(project_id);
    cartas.set(carta_id, carta);

    await this.eventBus.publish('carta.generada', { ...carta, project_id });
    this.logger.info('menu-generator.version.restored', { carta_id, version_file, project_id });

    return {
      status: 200,
      data: {
        carta_id, restored_from: version_file,
        nombre: carta.meta?.nombre,
        productos: carta.productos?.length || 0,
        categorias: carta.categorias?.length || 0,
        message: `Carta restaurada desde versión ${version_file}.`
      }
    };
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleListCartas(data) {
    const result = await this.toolListCartas({ project_id: data?.project_id });
    return result.data;
  }

  async handleGetCarta(data) {
    const result = await this.toolGetCarta({ carta_id: data.id, project_id: data.project_id });
    if (result.error) throw { status: result.status || 404, code: 'NOT_FOUND', message: result.error };
    return result.data;
  }

  async handleHealth() {
    let totalCartas = 0;
    for (const cartas of this.cartasPerProject.values()) totalCartas += cartas.size;
    return {
      status: 'healthy', module: this.name, version: this.version,
      cartas: totalCartas, proyectos: this.cartasPerProject.size
    };
  }

  // ==========================================
  // Utils
  // ==========================================

  slugify(text) {
    if (!text) return 'sin_nombre';
    return text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      || 'sin_nombre';
  }

  normalizeIngredientes(ingredientes) {
    if (typeof ingredientes === 'string') {
      return ingredientes.split(',')
        .map(s => ({ nombre: s.trim() }))
        .filter(i => i.nombre.length > 0);
    }

    if (Array.isArray(ingredientes)) {
      return ingredientes.map(ing => {
        if (typeof ing === 'string') return { nombre: ing.trim() };
        const result = { nombre: ing.nombre || ing.name || '' };
        // Preserve enrichment fields if present
        if (ing.emoji) result.emoji = ing.emoji;
        if (ing.tipo) result.tipo = ing.tipo;
        if (ing.precio_extra != null) result.precio_extra = ing.precio_extra;
        return result;
      }).filter(i => i.nombre.length > 0);
    }

    return [];
  }

  /**
   * Normalize a carta object received from an agent or external source.
   * Ensures all required fields exist with correct structure.
   */
  normalizeCarta(cartaId, raw, nombre) {
    const categorias = (raw.categorias || []).map((cat, idx) => ({
      id: cat.id || this.slugify(cat.nombre),
      nombre: cat.nombre,
      orden: cat.orden !== undefined ? cat.orden : idx + 1
    }));

    const productos = (raw.productos || []).map(p => ({
      id: p.id || `${this.slugify(p.categoria || 'general')}_${this.slugify(p.nombre)}`,
      nombre: p.nombre,
      categoria: p.categoria || 'general',
      precio: typeof p.precio === 'number' ? p.precio : parseFloat(p.precio) || 0,
      ingredientes: this.normalizeIngredientes(p.ingredientes || []),
      // Preserve enrichment fields
      ...(p.descripcion && { descripcion: p.descripcion }),
      ...(p.emoji && { emoji: p.emoji }),
      ...(p.tags && { tags: p.tags }),
      ...(p.imagen && { imagen: p.imagen })
    }));

    return {
      meta: {
        id: cartaId,
        nombre: raw.meta?.nombre || raw.nombre_carta || nombre || 'Carta sin nombre',
        source: raw.meta?.source || 'agent',
        created_at: raw.meta?.created_at || new Date().toISOString()
      },
      categorias,
      productos
    };
  }
}

module.exports = MenuGeneratorModule;

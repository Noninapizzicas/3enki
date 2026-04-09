/**
 * Módulo Tarifas v1.0.0
 *
 * Sistema de precios diferenciados por canal de venta.
 * Resolución por cascada:
 *   1. producto.precio_fijo → precio base (sin modificar)
 *   2. categoría+canal      → regla específica de esa categoría para ese canal
 *   3. canal                 → regla global del canal
 *   4. fallback              → precio base
 *
 * Config: data/projects/{id}/config/tarifas.json
 *
 * Consumido por:
 *   - comandero (resolverPrecio al añadir items al buffer)
 *   - cualquier módulo que necesite precios por canal
 *
 * Emite: tarifa.config.actualizada
 * Consume: project.activated, project.deactivated
 */

const fs = require('fs').promises;
const path = require('path');

const CANALES_VALIDOS = ['mesa', 'llevar', 'telefono', 'whatsapp', 'glovo', 'llevadoo'];

class TarifasModule {
  constructor() {
    this.name = 'tarifas';
    this.version = '1.0.0';

    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.uiHandler = null;

    // Multi-tenant: project_id → tarifas config
    this.tarifasPerProject = new Map();
    // project_id → base storage path
    this.projectPaths = new Map();
    // Último proyecto activo (para llamadas sin projectId explícito)
    this._lastActiveProjectId = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
    this.metrics = context.metrics;
    this.uiHandler = context.uiHandler;

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.tarifasPerProject.clear();
    this.projectPaths.clear();
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Project Lifecycle
  // ==========================================

  async onProjectActivated(event) {
    const data = event.data || event;
    const { project_id, base_path, metadata } = data;

    const resolvedBase = (metadata?.is_system === true) ? process.cwd() : base_path;
    if (resolvedBase) {
      this.projectPaths.set(project_id, resolvedBase);
    }

    this._lastActiveProjectId = project_id;
    await this.loadTarifas(project_id);

    this.logger.info('tarifas.project.activated', { project_id });
  }

  async onProjectDeactivated(event) {
    // Keep data in memory for multi-tenant access
  }

  // ==========================================
  // Config Persistence
  // ==========================================

  tarifasPathFor(projectId) {
    const basePath = this.projectPaths.get(projectId);
    if (!basePath) return null;
    return path.join(basePath, 'storage', 'config', 'tarifas.json');
  }

  getDefaultTarifas() {
    return {
      canales: {
        mesa:     { mult: 1.0, recargo: 0 },
        llevar:   { mult: 1.0, recargo: 0 },
        telefono: { mult: 1.0, recargo: 0 },
        whatsapp: { mult: 1.0, recargo: 0 },
        glovo:    { mult: 1.0, recargo: 0 },
        llevadoo: { mult: 1.0, recargo: 0 }
      },
      categorias: {},
      redondeo: 0.10
    };
  }

  async loadTarifas(projectId) {
    const filePath = this.tarifasPathFor(projectId);
    if (!filePath) return;

    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const config = JSON.parse(raw);
      this.tarifasPerProject.set(projectId, { ...this.getDefaultTarifas(), ...config });
      this.logger.info('tarifas.loaded', { project_id: projectId });
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('tarifas.load_error', { project_id: projectId, error: err.message });
      }
      this.tarifasPerProject.set(projectId, this.getDefaultTarifas());
    }
  }

  async saveTarifas(projectId) {
    const filePath = this.tarifasPathFor(projectId);
    if (!filePath) return;

    const config = this.tarifasPerProject.get(projectId);
    if (!config) return;

    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf-8');
      this.logger.info('tarifas.saved', { project_id: projectId });
    } catch (err) {
      this.logger.error('tarifas.save_error', { project_id: projectId, error: err.message });
    }
  }

  getTarifas(projectId) {
    return this.tarifasPerProject.get(projectId) || this.getDefaultTarifas();
  }

  // ==========================================
  // Core: resolverPrecio
  // ==========================================

  /**
   * Resuelve el precio final de un producto para un canal dado.
   * Cascada: precio_fijo → categoría+canal → canal → precio base.
   *
   * @param {{ precio: number, categoria?: string, precio_fijo?: boolean }} producto
   * @param {string} canal
   * @param {string} [projectId] - Si no se pasa, usa el último proyecto activo
   * @returns {number}
   */
  resolverPrecio(producto, canal, projectId) {
    if (!canal || canal === 'mesa') return producto.precio;
    if (producto.precio_fijo) return producto.precio;

    const pid = projectId || this._lastActiveProjectId;
    const config = pid ? this.getTarifas(pid) : this.getDefaultTarifas();

    // Override por categoría+canal
    const catOverride = config.categorias?.[producto.categoria]?.[canal];
    if (catOverride) {
      return this.redondearPrecio(
        producto.precio * (catOverride.mult ?? 1) + (catOverride.recargo ?? 0),
        config.redondeo
      );
    }

    // Regla global del canal
    const regla = config.canales?.[canal];
    if (regla) {
      return this.redondearPrecio(
        producto.precio * (regla.mult ?? 1) + (regla.recargo ?? 0),
        config.redondeo
      );
    }

    return producto.precio;
  }

  redondearPrecio(precio, step) {
    const s = step || 0.01;
    return Math.round(precio / s) * s;
  }

  // ==========================================
  // Tools (AI chat)
  // ==========================================

  async toolSetTarifaCanal({ canal, multiplicador, recargo, project_id }) {
    return this.handleSetTarifaCanal({ canal, multiplicador, recargo, project_id });
  }

  async toolSetTarifaCategoria({ categoria, canales, multiplicador, recargo, project_id }) {
    return this.handleSetTarifaCategoria({ categoria, canales, multiplicador, recargo, project_id });
  }

  async toolGetTarifas({ project_id }) {
    return this.handleGetTarifas({ project_id });
  }

  async toolPreviewPrecios({ carta_id, producto_id, categoria, project_id }) {
    return this.handlePreviewPrecios({ carta_id, producto_id, categoria, project_id });
  }

  async toolSetPrecioFijo({ carta_id, producto_ids, precio_fijo, project_id }) {
    return this.handleSetPrecioFijo({ carta_id, producto_ids, precio_fijo, project_id });
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleSetTarifaCanal(data) {
    const { canal, multiplicador, recargo, project_id } = data;
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    if (!canal) return { status: 400, error: 'Se requiere canal' };

    if (!CANALES_VALIDOS.includes(canal)) {
      return { status: 400, error: `Canal inválido. Válidos: ${CANALES_VALIDOS.join(', ')}` };
    }

    const config = this.getTarifas(project_id);
    if (!config.canales) config.canales = {};
    if (!config.canales[canal]) config.canales[canal] = { mult: 1.0, recargo: 0 };

    if (multiplicador !== undefined) config.canales[canal].mult = Number(multiplicador);
    if (recargo !== undefined) config.canales[canal].recargo = Number(recargo);

    this.tarifasPerProject.set(project_id, config);
    await this.saveTarifas(project_id);
    this.metrics?.increment('tarifas.canal.updated');

    await this.eventBus.publish('tarifa.config.actualizada', {
      project_id, tipo: 'canal', canal, config: config.canales[canal]
    });

    this.logger.info('tarifas.canal.updated', {
      project_id, canal,
      mult: config.canales[canal].mult,
      recargo: config.canales[canal].recargo
    });

    return {
      status: 200,
      data: {
        canal,
        ...config.canales[canal],
        message: `Tarifa de ${canal} actualizada: ×${config.canales[canal].mult} + ${config.canales[canal].recargo}€`
      }
    };
  }

  async handleSetTarifaCategoria(data) {
    const { categoria, canales, multiplicador, recargo, project_id } = data;
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    if (!categoria) return { status: 400, error: 'Se requiere categoria' };

    if (multiplicador === undefined && recargo === undefined) {
      return { status: 400, error: 'Se requiere al menos multiplicador o recargo' };
    }

    const config = this.getTarifas(project_id);
    if (!config.categorias) config.categorias = {};
    if (!config.categorias[categoria]) config.categorias[categoria] = {};

    const targetCanales = canales || ['llevar', 'telefono', 'whatsapp', 'glovo', 'llevadoo'];

    const regla = {};
    if (multiplicador !== undefined) regla.mult = Number(multiplicador);
    if (recargo !== undefined) regla.recargo = Number(recargo);

    for (const canal of targetCanales) {
      config.categorias[categoria][canal] = { ...regla };
    }

    this.tarifasPerProject.set(project_id, config);
    await this.saveTarifas(project_id);
    this.metrics?.increment('tarifas.categoria.updated');

    await this.eventBus.publish('tarifa.config.actualizada', {
      project_id, tipo: 'categoria', categoria, canales: targetCanales, regla
    });

    this.logger.info('tarifas.categoria.updated', {
      project_id, categoria, canales: targetCanales, regla
    });

    return {
      status: 200,
      data: {
        categoria,
        canales: targetCanales,
        regla,
        message: `Excepción de tarifa para "${categoria}" en [${targetCanales.join(', ')}]`
      }
    };
  }

  async handleGetTarifas(data) {
    const project_id = data?.project_id;
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };

    const config = this.getTarifas(project_id);

    return {
      status: 200,
      data: {
        canales: config.canales || {},
        categorias: config.categorias || {},
        redondeo: config.redondeo || 0.10,
        resumen: Object.entries(config.canales || {}).map(([canal, regla]) => {
          const desc = [];
          if (regla.mult !== 1.0) desc.push(`×${regla.mult}`);
          if (regla.recargo) desc.push(`+${regla.recargo}€`);
          return `${canal}: ${desc.length ? desc.join(' ') : 'precio carta'}`;
        })
      }
    };
  }

  async handlePreviewPrecios(data) {
    const { carta_id, producto_id, categoria, project_id } = data;
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    if (!carta_id) return { status: 400, error: 'Se requiere carta_id' };

    // Obtener productos de la carta via ui handler de menu-generator
    const cartaResult = await this.uiHandler.handle('menu', 'get', { carta_id, project_id });
    if (!cartaResult || cartaResult.status !== 200) {
      return { status: 404, error: `Carta "${carta_id}" no encontrada` };
    }

    const carta = cartaResult.data;
    let productos = carta.productos || [];

    if (producto_id) {
      productos = productos.filter(p => p.id === producto_id);
      if (productos.length === 0) return { status: 404, error: `Producto "${producto_id}" no encontrado` };
    } else if (categoria) {
      productos = productos.filter(p => p.categoria === categoria);
      if (productos.length === 0) return { status: 404, error: `Sin productos en categoría "${categoria}"` };
    }

    const preview = productos.map(p => {
      const prod = { precio: p.precio, categoria: p.categoria, precio_fijo: p.precio_fijo };
      const precios = {};
      for (const canal of CANALES_VALIDOS) {
        precios[canal] = this.resolverPrecio(prod, canal, project_id);
      }
      return {
        id: p.id,
        nombre: p.nombre,
        categoria: p.categoria,
        precio_carta: p.precio,
        precio_fijo: p.precio_fijo || false,
        precios_por_canal: precios
      };
    });

    this.metrics?.increment('tarifas.preview.requested');

    return {
      status: 200,
      data: {
        carta_id,
        productos: preview,
        total_productos: preview.length
      }
    };
  }

  async handleSetPrecioFijo(data) {
    const { carta_id, producto_ids, precio_fijo, project_id } = data;
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    if (!carta_id) return { status: 400, error: 'Se requiere carta_id' };
    if (!producto_ids || !Array.isArray(producto_ids) || producto_ids.length === 0) {
      return { status: 400, error: 'Se requiere producto_ids (array de IDs)' };
    }
    if (typeof precio_fijo !== 'boolean') {
      return { status: 400, error: 'Se requiere precio_fijo (true/false)' };
    }

    // Obtener carta via menu-generator
    const cartaResult = await this.uiHandler.handle('menu', 'get', { carta_id, project_id });
    if (!cartaResult || cartaResult.status !== 200) {
      return { status: 404, error: `Carta "${carta_id}" no encontrada` };
    }

    const carta = cartaResult.data;
    const actualizados = [];

    for (const prodId of producto_ids) {
      const prod = (carta.productos || []).find(p => p.id === prodId);
      if (prod) {
        prod.precio_fijo = precio_fijo;
        actualizados.push({ id: prod.id, nombre: prod.nombre, precio_fijo });
      }
    }

    if (actualizados.length === 0) {
      return { status: 404, error: 'Ninguno de los producto_ids existe en la carta' };
    }

    // Persistir cambios en la carta via menu-generator
    // Actualizar cada producto individualmente
    for (const { id } of actualizados) {
      await this.uiHandler.handle('menu', 'update-product-flag', {
        carta_id, producto_id: id, precio_fijo, project_id
      }).catch(() => {
        // Si el handler específico no existe, publicamos carta.generada directamente
      });
    }

    // Publicar carta actualizada para que el POS sincronice el flag
    await this.eventBus.publish('carta.generada', { ...carta, project_id });

    this.metrics?.increment('tarifas.precio_fijo.updated');

    return {
      status: 200,
      data: {
        carta_id,
        actualizados,
        message: `${actualizados.length} producto(s) ${precio_fijo ? 'marcados como precio fijo' : 'sujetos a tarifas'}`
      }
    };
  }
}

module.exports = TarifasModule;

/**
 * Escandallo Module v2.0.0
 *
 * Análisis de costes de recetas basado en precios de mercado.
 *
 * Integrates EscandalloManager for cost calculations with market prices.
 * Tools expose escandallo data for agents (analyzer, cost optimization, etc).
 *
 * Tools:
 *   escandallo.receta            — Escandallo completo de una receta
 *   escandallo.global            — Escandallo global de todas las recetas
 *   escandallo.obtener           — Get full escandallo calculation (for analyzer agent)
 *   escandallo.obtener_historico — Get historical calculations (for trend analysis)
 *   escandallo.obtener_alertas   — Get price change alerts (for anomaly detection)
 *   escandallo.comparar_precios  — Compara mercado vs compra
 *   escandallo.simular_precio    — Simula precios de venta
 *   escandallo.ingrediente_impacto — Impacto de un ingrediente
 *   escandallo.optimizar         — Sugerencias de optimización
 *   escandallo.ficha_tecnica     — Ficha técnica profesional
 */

const path = require('path');
const fs = require('fs').promises;
const EscandalloManager = require('./core/escandallo-manager');

class EscandalloModule {
  constructor() {
    this.name = 'escandallo';
    this.version = '2.0.0';
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.moduleLoader = null;

    // Cache: project_id → { recetas, ingredientes }
    this.cache = new Map();
    this.projectPaths = new Map();

    // Manager: project_id → EscandalloManager instance
    this.managers = new Map();
  }

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
    this.metrics = context.metrics;
    this.moduleLoader = context.moduleLoader;

    // Register analyzer tools
    this.registerAnalyzerTools();

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.cache.clear();
    this.projectPaths.clear();

    // Close all managers
    for (const [projectId, manager] of this.managers) {
      try {
        if (manager && typeof manager.close === 'function') {
          await manager.close();
        }
      } catch (err) {
        this.logger.error('escandallo.manager.close_failed', {
          project_id: projectId,
          error: err.message
        });
      }
    }
    this.managers.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Manager initialization and caching
  // ==========================================

  /**
   * Get or create EscandalloManager for a project
   */
  async getManager(projectId) {
    if (!this.managers.has(projectId)) {
      const dbPath = this.resolveDbPath(projectId);
      const manager = new EscandalloManager(dbPath, this.logger);
      await manager.initialize();
      this.managers.set(projectId, manager);
    }
    return this.managers.get(projectId);
  }

  /**
   * Resolve database path for a project
   */
  resolveDbPath(projectId) {
    const paths = this.projectPaths.get(projectId);
    if (!paths) {
      throw new Error(`Project ${projectId} not registered. Path unknown.`);
    }
    return path.join(paths.storagePath, 'escandallo.db');
  }

  // ==========================================
  // Tool registration (for analyzer agent)
  // ==========================================

  registerAnalyzerTools() {
    if (!this.moduleLoader || !this.moduleLoader.toolsRegistry) {
      this.logger.warn('escandallo.register_tools.no_module_loader');
      return;
    }

    // Tool 1: escandallo.obtener
    this.moduleLoader.toolsRegistry.set('escandallo.obtener', {
      name: 'escandallo.obtener',
      description: 'Get full escandallo calculation with cost breakdown. Used by analyzer agent to validate calculations.',
      parameters: {
        type: 'object',
        properties: {
          escandallo_id: {
            type: 'string',
            description: 'The escandallo ID (e.g., "esc_rec_pasta_1713090000")'
          },
          project_id: {
            type: 'string',
            description: 'Project ID for database access'
          }
        },
        required: ['escandallo_id', 'project_id']
      },
      handler: this.toolObtenerEscandallo.bind(this),
      module: 'escandallo',
      confirmation: false
    });

    // Tool 2: escandallo.obtener_historico
    this.moduleLoader.toolsRegistry.set('escandallo.obtener_historico', {
      name: 'escandallo.obtener_historico',
      description: 'Get historical escandallo calculations for a recipe to detect price trends and anomalies.',
      parameters: {
        type: 'object',
        properties: {
          receta_id: {
            type: 'string',
            description: 'The recipe ID to get history for'
          },
          project_id: {
            type: 'string',
            description: 'Project ID for database access'
          },
          limit: {
            type: 'integer',
            description: 'Number of historical records to retrieve (default: 5)',
            default: 5
          }
        },
        required: ['receta_id', 'project_id']
      },
      handler: this.toolObtenerHistorico.bind(this),
      module: 'escandallo',
      confirmation: false
    });

    // Tool 3: escandallo.obtener_alertas
    this.moduleLoader.toolsRegistry.set('escandallo.obtener_alertas', {
      name: 'escandallo.obtener_alertas',
      description: 'Get price change alerts for an escandallo. Helps analyzer detect anomalies and significant price movements.',
      parameters: {
        type: 'object',
        properties: {
          escandallo_id: {
            type: 'string',
            description: 'The escandallo ID to get alerts for'
          },
          project_id: {
            type: 'string',
            description: 'Project ID for database access'
          }
        },
        required: ['escandallo_id', 'project_id']
      },
      handler: this.toolObtenerAlertas.bind(this),
      module: 'escandallo',
      confirmation: false
    });

    // Tool 4: escandallo.buscar
    this.moduleLoader.toolsRegistry.set('escandallo.buscar', {
      name: 'escandallo.buscar',
      description: 'Search escandallos by criteria: cost range, date range, alert presence, missing prices.',
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'Project ID for database access'
          },
          coste_min: {
            type: 'number',
            description: 'Minimum cost per portion (€)'
          },
          coste_max: {
            type: 'number',
            description: 'Maximum cost per portion (€)'
          },
          tiene_alerta: {
            type: 'boolean',
            description: 'Filter by alert presence (true=has alerts, false=no alerts)'
          },
          tiene_alerta_sin_leer: {
            type: 'boolean',
            description: 'Filter by unread alerts'
          },
          desde_fecha: {
            type: 'integer',
            description: 'Start date timestamp (milliseconds)'
          },
          hasta_fecha: {
            type: 'integer',
            description: 'End date timestamp (milliseconds)'
          },
          sin_precio: {
            type: 'boolean',
            description: 'Filter escandallos with missing prices'
          },
          limit: {
            type: 'integer',
            description: 'Max results to return (default: 50, max: 100)'
          }
        },
        required: ['project_id']
      },
      handler: this.toolBuscar.bind(this),
      module: 'escandallo',
      confirmation: false
    });

    // Tool 5: escandallo.buscar_y_ordenar
    this.moduleLoader.toolsRegistry.set('escandallo.buscar_y_ordenar', {
      name: 'escandallo.buscar_y_ordenar',
      description: 'Search escandallos with intelligent ranking by relevance, anomaly score, cost, or recency.',
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'Project ID for database access'
          },
          coste_min: {
            type: 'number',
            description: 'Minimum cost per portion (€)'
          },
          coste_max: {
            type: 'number',
            description: 'Maximum cost per portion (€)'
          },
          rankBy: {
            type: 'string',
            enum: ['relevance', 'cost', 'cost_desc', 'alerts', 'recent', 'old'],
            description: 'Ranking strategy: relevance (anomalies/alerts), cost (low to high), cost_desc (high to low), alerts, recent, old'
          },
          limit: {
            type: 'integer',
            description: 'Max results (default: 50, max: 100)'
          }
        },
        required: ['project_id']
      },
      handler: this.toolBuscarYOrdenar.bind(this),
      module: 'escandallo',
      confirmation: false
    });

    this.logger.info('escandallo.search_tools.registered', {
      tools_count: 5
    });
  }

  // ==========================================
  // Project resolution
  // ==========================================

  resolveToActiveProject(projectId) {
    if (projectId && this.cache.has(projectId)) return projectId;
    if (projectId && this.projectPaths.has(projectId)) return projectId;
    for (const [pid] of this.projectPaths) return pid;
    return projectId;
  }

  // ==========================================
  // Data Access — reads from recetas storage
  // ==========================================

  async loadRecetasData(projectId) {
    const paths = this.projectPaths.get(projectId);
    if (!paths) return { recetas: [], ingredientes: [] };

    const dir = path.join(paths.storagePath, 'recetas');
    let recetas = [];
    let ingredientes = [];

    try {
      const content = await fs.readFile(path.join(dir, 'recetas.json'), 'utf-8');
      recetas = JSON.parse(content);
    } catch (e) { /* no data yet */ }

    try {
      const content = await fs.readFile(path.join(dir, 'ingredientes.json'), 'utf-8');
      ingredientes = JSON.parse(content);
    } catch (e) { /* no data yet */ }

    this.cache.set(projectId, { recetas, ingredientes });
    return { recetas, ingredientes };
  }

  async getRecetas(projectId) {
    if (this.cache.has(projectId)) return this.cache.get(projectId);
    return await this.loadRecetasData(projectId);
  }

  findReceta(recetas, recetaId) {
    return recetas.find(r => r.id === recetaId);
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onProjectActivated(event) {
    const data = event.data || event;
    const { project_id, base_path, metadata } = data;
    const resolvedBase = (metadata?.is_system === true) ? process.cwd() : base_path;
    if (resolvedBase) {
      this.projectPaths.set(project_id, {
        storagePath: path.join(resolvedBase, 'storage')
      });
    }
    await this.loadRecetasData(project_id);
    this.logger.info('escandallo.project.activated', { project_id });
  }

  async onProjectDeactivated() {}

  async onRecetaCreada(event) {
    const data = event.data || event;
    if (data.proyecto_id) {
      this.cache.delete(data.proyecto_id);
    }
  }

  async onRecetaActualizada(event) {
    const data = event.data || event;
    if (data.proyecto_id) {
      this.cache.delete(data.proyecto_id);
    }
  }

  async onIngredientePrecioActualizado(event) {
    // Invalidate all caches — ingredient price change affects all projects
    this.cache.clear();
  }

  // ==========================================
  // Helpers
  // ==========================================

  round(n, decimals = 2) {
    const f = Math.pow(10, decimals);
    return Math.round(n * f) / f;
  }

  calcularEscandallo(receta, usarCompra = false) {
    const desglose = receta.ingredientes.map(ing => {
      const precio = (usarCompra && ing.precio_compra !== null && ing.precio_compra !== undefined)
        ? ing.precio_compra
        : (ing.precio_mercado || 0);
      return {
        nombre: ing.nombre,
        cantidad: ing.cantidad,
        unidad: ing.unidad,
        precio: this.round(precio),
        tipo_precio: (usarCompra && ing.precio_compra !== null && ing.precio_compra !== undefined) ? 'compra' : 'mercado'
      };
    });

    const coste_total = desglose.reduce((sum, d) => sum + d.precio, 0);
    const coste_porcion = receta.porciones > 0 ? coste_total / receta.porciones : 0;

    // Add percentages
    const conPorcentaje = desglose.map(d => ({
      ...d,
      porcentaje: coste_total > 0 ? this.round((d.precio / coste_total) * 100) : 0
    }));

    // Sort by cost descending
    conPorcentaje.sort((a, b) => b.precio - a.precio);

    return {
      coste_total: this.round(coste_total),
      coste_porcion: this.round(coste_porcion),
      desglose: conPorcentaje
    };
  }

  calcularMargen(costePorcion, precioVenta) {
    if (!precioVenta || precioVenta <= 0) return null;
    const margen = precioVenta - costePorcion;
    return {
      precio_venta: precioVenta,
      margen_euro: this.round(margen),
      margen_porcentaje: this.round((margen / precioVenta) * 100),
      food_cost_porcentaje: this.round((costePorcion / precioVenta) * 100),
      multiplicador: this.round(precioVenta / costePorcion)
    };
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleEscandalloReceta(data) {
    const project_id = this.resolveToActiveProject(data?.project_id);
    const result = await this.toolEscandalloReceta({ ...data, project_id });
    if (result.error) throw { status: result.status || 400, code: 'ESCANDALLO_ERROR', message: result.error };
    return result.data;
  }

  async handleEscandalloGlobal(data) {
    const project_id = this.resolveToActiveProject(data?.project_id);
    const result = await this.toolEscandalloGlobal({ ...data, project_id });
    if (result.error) throw { status: result.status || 400, code: 'ESCANDALLO_ERROR', message: result.error };
    return result.data;
  }

  async handleComparativa(data) {
    const project_id = this.resolveToActiveProject(data?.project_id);
    const result = await this.toolCompararPrecios({ ...data, project_id });
    return result.data;
  }

  async handleStats(data) {
    const project_id = this.resolveToActiveProject(data?.project_id);
    const result = await this.toolEscandalloGlobal({ ...data, project_id });
    return result.data;
  }

  // ==========================================
  // Tools
  // ==========================================

  async toolEscandalloReceta({ receta_id, precio_venta, usar_precio_compra, project_id }) {
    if (!receta_id) return { status: 400, error: 'Se requiere "receta_id"' };
    if (!project_id) return { status: 400, error: 'Se requiere "project_id"' };

    const { recetas } = await this.getRecetas(project_id);
    const receta = this.findReceta(recetas, receta_id);
    if (!receta) return { status: 404, error: `Receta "${receta_id}" no encontrada` };

    const esc = this.calcularEscandallo(receta, usar_precio_compra);
    const result = {
      receta_id,
      nombre: receta.nombre,
      categoria: receta.categoria,
      porciones: receta.porciones,
      ...esc
    };

    if (precio_venta) {
      const margen = this.calcularMargen(esc.coste_porcion, precio_venta);
      Object.assign(result, margen);
    }

    // Insights
    const insights = [];
    if (esc.desglose.length > 0) {
      const top = esc.desglose[0];
      insights.push(`Ingrediente más caro: ${top.nombre} (${top.porcentaje}% del coste)`);
    }
    if (precio_venta) {
      const fc = this.round((esc.coste_porcion / precio_venta) * 100);
      if (fc > 35) insights.push(`Food cost alto (${fc}%). Lo recomendable es < 33%.`);
      else if (fc < 25) insights.push(`Food cost bajo (${fc}%). Buen margen.`);
      else insights.push(`Food cost aceptable (${fc}%).`);
    }
    result.insights = insights;

    await this.eventBus.publish('escandallo.calculado', result);

    // Emit alert if food cost exceeds threshold
    if (precio_venta) {
      const fc = this.round((esc.coste_porcion / precio_venta) * 100);
      if (fc > 35) {
        await this.eventBus.publish('escandallo.alerta', {
          tipo: 'food_cost_alto',
          receta_id,
          nombre: receta.nombre,
          food_cost: fc,
          umbral: 35,
          mensaje: `Food cost de "${receta.nombre}" al ${fc}% (umbral: 35%)`
        });
      }
    }

    this.metrics?.increment('escandallo.receta.calculated');

    return { status: 200, data: result };
  }

  async toolEscandalloGlobal({ precios_venta, project_id }) {
    if (!project_id) return { status: 400, error: 'Se requiere "project_id"' };

    const { recetas, ingredientes } = await this.getRecetas(project_id);
    if (recetas.length === 0) {
      return { status: 200, data: { total_recetas: 0, message: 'No hay recetas. Crea recetas primero.' } };
    }

    const preciosMap = precios_venta || {};
    const analisis = recetas.map(r => {
      const esc = this.calcularEscandallo(r);
      const entry = {
        id: r.id,
        nombre: r.nombre,
        categoria: r.categoria,
        porciones: r.porciones,
        coste_total: esc.coste_total,
        coste_porcion: esc.coste_porcion,
        ingrediente_mas_caro: esc.desglose[0]?.nombre || '-',
        ingrediente_mas_caro_pct: esc.desglose[0]?.porcentaje || 0
      };

      if (preciosMap[r.id]) {
        const m = this.calcularMargen(esc.coste_porcion, preciosMap[r.id]);
        if (m) Object.assign(entry, m);
      }

      return entry;
    });

    // Rankings
    const porCoste = [...analisis].sort((a, b) => b.coste_porcion - a.coste_porcion);
    const costesAll = analisis.map(a => a.coste_porcion);

    // Ingredient frequency and total cost impact
    const ingImpacto = {};
    for (const r of recetas) {
      for (const ing of r.ingredientes) {
        if (!ingImpacto[ing.nombre]) {
          ingImpacto[ing.nombre] = { nombre: ing.nombre, recetas: 0, coste_total: 0 };
        }
        ingImpacto[ing.nombre].recetas++;
        ingImpacto[ing.nombre].coste_total += (ing.precio_mercado || 0);
      }
    }
    const topIngredientes = Object.values(ingImpacto)
      .sort((a, b) => b.coste_total - a.coste_total)
      .slice(0, 15)
      .map(i => ({ ...i, coste_total: this.round(i.coste_total) }));

    // By category
    const porCategoria = {};
    for (const a of analisis) {
      if (!porCategoria[a.categoria]) {
        porCategoria[a.categoria] = { recetas: 0, coste_medio_porcion: 0, _total: 0 };
      }
      porCategoria[a.categoria].recetas++;
      porCategoria[a.categoria]._total += a.coste_porcion;
    }
    for (const [cat, data] of Object.entries(porCategoria)) {
      porCategoria[cat].coste_medio_porcion = this.round(data._total / data.recetas);
      delete porCategoria[cat]._total;
    }

    this.metrics?.increment('escandallo.global.calculated');

    return {
      status: 200,
      data: {
        total_recetas: recetas.length,
        total_ingredientes_catalogo: ingredientes.length,
        coste_porcion_medio: this.round(costesAll.reduce((a, b) => a + b, 0) / costesAll.length),
        coste_porcion_min: this.round(Math.min(...costesAll)),
        coste_porcion_max: this.round(Math.max(...costesAll)),
        ranking_por_coste: porCoste.slice(0, 10),
        por_categoria: porCategoria,
        top_ingredientes_por_coste: topIngredientes,
        recetas: analisis
      }
    };
  }

  async toolCompararPrecios({ project_id }) {
    if (!project_id) return { status: 400, error: 'Se requiere "project_id"' };

    const { ingredientes } = await this.getRecetas(project_id);
    if (ingredientes.length === 0) {
      return { status: 200, data: { total: 0, message: 'No hay ingredientes en el catálogo.' } };
    }

    const conCompra = ingredientes.filter(i => i.precio_compra_kg !== null && i.precio_compra_kg !== undefined);
    const sinCompra = ingredientes.filter(i => i.precio_compra_kg === null || i.precio_compra_kg === undefined);

    const comparativa = conCompra.map(i => {
      const diferencia = i.precio_mercado_kg - i.precio_compra_kg;
      return {
        nombre: i.nombre,
        precio_mercado: i.precio_mercado_kg,
        precio_compra: i.precio_compra_kg,
        diferencia: this.round(diferencia),
        ahorro_pct: this.round((diferencia / i.precio_mercado_kg) * 100),
        unidad: i.unidad_base
      };
    }).sort((a, b) => b.diferencia - a.diferencia);

    const ahorroTotal = comparativa.reduce((sum, c) => sum + c.diferencia, 0);

    this.metrics?.increment('escandallo.comparativa.generated');

    const resultData = {
      con_precio_compra: comparativa,
      sin_precio_compra: sinCompra.map(i => ({ nombre: i.nombre, precio_mercado: i.precio_mercado_kg, unidad: i.unidad_base })),
      resumen: {
          total_ingredientes: ingredientes.length,
          con_compra: conCompra.length,
          sin_compra: sinCompra.length,
          ahorro_potencial_total: this.round(ahorroTotal),
          message: sinCompra.length > 0
            ? `${sinCompra.length} ingredientes sin precio de compra real. Enlaza con facturas para obtener precios reales.`
            : 'Todos los ingredientes tienen precio de compra real.'
        }
    };

    await this.eventBus.publish('escandallo.comparativa', resultData);

    return { status: 200, data: resultData };
  }

  async toolSimularPrecio({ receta_id, precios, food_cost_objetivo, project_id }) {
    if (!receta_id) return { status: 400, error: 'Se requiere "receta_id"' };
    if (!project_id) return { status: 400, error: 'Se requiere "project_id"' };

    const { recetas } = await this.getRecetas(project_id);
    const receta = this.findReceta(recetas, receta_id);
    if (!receta) return { status: 404, error: `Receta "${receta_id}" no encontrada` };

    const esc = this.calcularEscandallo(receta);
    const costePorcion = esc.coste_porcion;

    const result = {
      receta_id,
      nombre: receta.nombre,
      coste_porcion: costePorcion,
      porciones: receta.porciones,
      simulaciones: []
    };

    // Simulate specific prices
    const preciosSimular = precios || [
      this.round(costePorcion * 2.5),
      this.round(costePorcion * 3),
      this.round(costePorcion * 3.5),
      this.round(costePorcion * 4)
    ];

    result.simulaciones = preciosSimular.map(pv => ({
      precio_venta: pv,
      ...this.calcularMargen(costePorcion, pv)
    }));

    // Calculate price needed for target food cost
    if (food_cost_objetivo) {
      const precioNecesario = this.round(costePorcion / (food_cost_objetivo / 100));
      result.precio_para_food_cost = {
        food_cost_objetivo: food_cost_objetivo,
        precio_venta_necesario: precioNecesario,
        ...this.calcularMargen(costePorcion, precioNecesario)
      };
    }

    this.metrics?.increment('escandallo.simulacion.run');

    return { status: 200, data: result };
  }

  async toolIngredienteImpacto({ ingrediente_nombre, subida_porcentaje, project_id }) {
    if (!ingrediente_nombre) return { status: 400, error: 'Se requiere "ingrediente_nombre"' };
    if (!project_id) return { status: 400, error: 'Se requiere "project_id"' };

    const { recetas, ingredientes } = await this.getRecetas(project_id);
    const nombreLower = ingrediente_nombre.toLowerCase();

    // Find in catalog
    const catIng = ingredientes.find(i => i.nombre.toLowerCase().includes(nombreLower));

    // Find in recipes
    const recetasConIng = [];
    let costeTotal = 0;

    for (const r of recetas) {
      for (const ing of r.ingredientes) {
        if (ing.nombre.toLowerCase().includes(nombreLower)) {
          const precioActual = ing.precio_mercado || 0;
          costeTotal += precioActual;
          recetasConIng.push({
            receta_id: r.id,
            receta_nombre: r.nombre,
            cantidad: ing.cantidad,
            unidad: ing.unidad,
            precio_actual: precioActual,
            coste_porcion_receta: r.coste_porcion || 0
          });
        }
      }
    }

    if (recetasConIng.length === 0) {
      return { status: 404, error: `Ingrediente "${ingrediente_nombre}" no encontrado en ninguna receta` };
    }

    const result = {
      ingrediente: ingrediente_nombre,
      catalogo: catIng ? {
        precio_mercado: catIng.precio_mercado_kg,
        precio_compra: catIng.precio_compra_kg,
        unidad: catIng.unidad_base,
        fuente: catIng.fuente_precio
      } : null,
      aparece_en: recetasConIng.length,
      recetas: recetasConIng,
      coste_total_actual: this.round(costeTotal)
    };

    // Simulate price increase
    if (subida_porcentaje) {
      const factor = 1 + (subida_porcentaje / 100);
      const nuevoCosteTotal = this.round(costeTotal * factor);
      const impacto = recetasConIng.map(r => {
        const nuevoCosteIng = this.round(r.precio_actual * factor);
        const incremento = this.round(nuevoCosteIng - r.precio_actual);
        return {
          receta: r.receta_nombre,
          incremento_ingrediente: incremento,
          nuevo_coste_porcion_estimado: this.round(r.coste_porcion_receta + (incremento / (recetas.find(rec => rec.id === r.receta_id)?.porciones || 1)))
        };
      });

      result.simulacion_subida = {
        porcentaje: subida_porcentaje,
        coste_total_nuevo: nuevoCosteTotal,
        incremento: this.round(nuevoCosteTotal - costeTotal),
        impacto_por_receta: impacto
      };
    }

    return { status: 200, data: result };
  }

  async toolOptimizar({ food_cost_maximo, project_id }) {
    if (!project_id) return { status: 400, error: 'Se requiere "project_id"' };

    const fcMax = food_cost_maximo || 33;
    const { recetas, ingredientes } = await this.getRecetas(project_id);

    if (recetas.length === 0) {
      return { status: 200, data: { sugerencias: [], message: 'No hay recetas para analizar.' } };
    }

    const sugerencias = [];

    // 1. Recetas con coste alto por porción
    const costesOrdenados = [...recetas].sort((a, b) => (b.coste_porcion || 0) - (a.coste_porcion || 0));
    const media = recetas.reduce((s, r) => s + (r.coste_porcion || 0), 0) / recetas.length;
    for (const r of costesOrdenados) {
      if (r.coste_porcion > media * 1.5) {
        sugerencias.push({
          tipo: 'coste_alto',
          receta: r.nombre,
          receta_id: r.id,
          coste_porcion: this.round(r.coste_porcion),
          media_proyecto: this.round(media),
          mensaje: `"${r.nombre}" tiene coste/porción ${this.round(r.coste_porcion)}€, un ${this.round(((r.coste_porcion - media) / media) * 100)}% más que la media (${this.round(media)}€)`
        });
      }
    }

    // 2. Ingredientes caros que dominan el coste
    for (const r of recetas) {
      const esc = this.calcularEscandallo(r);
      for (const d of esc.desglose) {
        if (d.porcentaje > 50) {
          sugerencias.push({
            tipo: 'ingrediente_dominante',
            receta: r.nombre,
            receta_id: r.id,
            ingrediente: d.nombre,
            porcentaje: d.porcentaje,
            mensaje: `"${d.nombre}" representa ${d.porcentaje}% del coste de "${r.nombre}". Considera reducir cantidad o buscar alternativa.`
          });
        }
      }
    }

    // 3. Ingredientes de poco uso (solo en 1 receta)
    const ingPocosUsos = ingredientes.filter(i => (i.recetas_count || 0) === 1);
    if (ingPocosUsos.length > 3) {
      sugerencias.push({
        tipo: 'stock_variado',
        ingredientes: ingPocosUsos.map(i => i.nombre).slice(0, 10),
        total: ingPocosUsos.length,
        mensaje: `${ingPocosUsos.length} ingredientes aparecen solo en 1 receta. Stock muy variado = más desperdicio y coste de gestión.`
      });
    }

    // 4. Ingredientes sin precio de compra
    const sinCompra = ingredientes.filter(i => i.precio_compra_kg === null || i.precio_compra_kg === undefined);
    if (sinCompra.length > 0) {
      sugerencias.push({
        tipo: 'precios_sin_verificar',
        total: sinCompra.length,
        mensaje: `${sinCompra.length} ingredientes con precio de mercado estimado (sin verificar con compra real). Los costes podrían variar.`
      });
    }

    return {
      status: 200,
      data: {
        food_cost_objetivo: fcMax,
        total_recetas: recetas.length,
        coste_porcion_medio: this.round(media),
        sugerencias,
        message: sugerencias.length === 0
          ? 'No se encontraron problemas evidentes. Los costes parecen bien equilibrados.'
          : `${sugerencias.length} sugerencias de optimización encontradas.`
      }
    };
  }

  async toolFichaTecnica({ receta_id, precio_venta, project_id }) {
    if (!receta_id) return { status: 400, error: 'Se requiere "receta_id"' };
    if (!project_id) return { status: 400, error: 'Se requiere "project_id"' };

    const { recetas, ingredientes } = await this.getRecetas(project_id);
    const receta = this.findReceta(recetas, receta_id);
    if (!receta) return { status: 404, error: `Receta "${receta_id}" no encontrada` };

    const esc = this.calcularEscandallo(receta);

    // Collect allergens from catalog
    const alergenos = new Set();
    for (const ing of receta.ingredientes) {
      const catIng = ingredientes.find(i => i.id === ing.ingrediente_id);
      if (catIng?.alergenos) {
        catIng.alergenos.forEach(a => alergenos.add(a));
      }
    }

    const ficha = {
      // Header
      nombre: receta.nombre,
      descripcion: receta.descripcion,
      categoria: receta.categoria,
      porciones: receta.porciones,
      tiempo_preparacion: receta.tiempo_preparacion,
      dificultad: receta.dificultad,
      tags: receta.tags,

      // Escandallo
      escandallo: {
        coste_total: esc.coste_total,
        coste_porcion: esc.coste_porcion,
        desglose: esc.desglose
      },

      // Margin (if price given)
      margen: precio_venta ? this.calcularMargen(esc.coste_porcion, precio_venta) : null,

      // Recipe
      ingredientes: receta.ingredientes.map(i => ({
        nombre: i.nombre,
        cantidad: i.cantidad,
        unidad: i.unidad,
        precio: i.precio_mercado,
        notas: i.notas
      })),
      elaboracion: receta.elaboracion,

      // Safety
      alergenos: Array.from(alergenos),

      // Meta
      fuente: receta.fuente,
      notas: receta.notas,
      fecha: new Date().toISOString()
    };

    this.metrics?.increment('escandallo.ficha.generated');

    return { status: 200, data: ficha };
  }

  // ==========================================
  // Analyzer Agent Tools
  // ==========================================

  /**
   * Tool: escandallo.obtener
   * Get complete escandallo calculation for analyzer validation
   */
  async toolObtenerEscandallo(params) {
    try {
      const { escandallo_id, project_id } = params;

      if (!escandallo_id || !project_id) {
        return {
          error: 'Missing required parameters: escandallo_id, project_id',
          status: 400
        };
      }

      const manager = await this.getManager(project_id);
      const escandallo = await manager.getEscandallo(escandallo_id);

      if (!escandallo) {
        return {
          error: `Escandallo "${escandallo_id}" not found`,
          status: 404
        };
      }

      return {
        status: 200,
        data: escandallo
      };
    } catch (err) {
      this.logger.error('escandallo.obtener.error', {
        error: err.message
      });
      return {
        error: err.message,
        status: 500
      };
    }
  }

  /**
   * Tool: escandallo.obtener_historico
   * Get historical escandallo data for trend analysis
   */
  async toolObtenerHistorico(params) {
    try {
      const { receta_id, project_id, limit = 5 } = params;

      if (!receta_id || !project_id) {
        return {
          error: 'Missing required parameters: receta_id, project_id',
          status: 400
        };
      }

      const manager = await this.getManager(project_id);
      const history = await manager.getHistory(receta_id, limit);

      if (!history || history.length === 0) {
        return {
          error: `No historical data found for recipe "${receta_id}"`,
          status: 404
        };
      }

      return {
        status: 200,
        data: {
          receta_id,
          historico: history,
          total_records: history.length
        }
      };
    } catch (err) {
      this.logger.error('escandallo.obtener_historico.error', {
        error: err.message
      });
      return {
        error: err.message,
        status: 500
      };
    }
  }

  /**
   * Tool: escandallo.obtener_alertas
   * Get price change alerts for an escandallo
   */
  async toolObtenerAlertas(params) {
    try {
      const { escandallo_id, project_id } = params;

      if (!escandallo_id || !project_id) {
        return {
          error: 'Missing required parameters: escandallo_id, project_id',
          status: 400
        };
      }

      const manager = await this.getManager(project_id);
      const alerts = await manager.getAlertas(escandallo_id);

      return {
        status: 200,
        data: {
          escandallo_id,
          alertas: alerts || [],
          total_alertas: alerts ? alerts.length : 0
        }
      };
    } catch (err) {
      this.logger.error('escandallo.obtener_alertas.error', {
        error: err.message
      });
      return {
        error: err.message,
        status: 500
      };
    }
  }

  // ==========================================
  // Search Tools
  // ==========================================

  /**
   * Tool: escandallo.buscar
   * Search with filters
   */
  async toolBuscar(params) {
    try {
      const { project_id, coste_min, coste_max, tiene_alerta, tiene_alerta_sin_leer, desde_fecha, hasta_fecha, sin_precio, limit = 50 } = params;

      if (!project_id) {
        return {
          error: 'Missing required parameter: project_id',
          status: 400
        };
      }

      // Limit max results
      const safeLimit = Math.min(limit, 100);

      const manager = await this.getManager(project_id);
      const results = await manager.search({
        coste_min,
        coste_max,
        tiene_alerta,
        tiene_alerta_sin_leer,
        desde_fecha,
        hasta_fecha,
        sin_precio,
        limit: safeLimit
      });

      return {
        status: 200,
        data: {
          results: results || [],
          count: results ? results.length : 0,
          filters_applied: {
            coste_min,
            coste_max,
            tiene_alerta,
            tiene_alerta_sin_leer,
            desde_fecha,
            hasta_fecha,
            sin_precio
          }
        }
      };
    } catch (err) {
      this.logger.error('escandallo.buscar.error', {
        error: err.message
      });
      return {
        error: err.message,
        status: 500
      };
    }
  }

  /**
   * Tool: escandallo.buscar_y_ordenar
   * Search with intelligent ranking
   */
  async toolBuscarYOrdenar(params) {
    try {
      const { project_id, coste_min, coste_max, rankBy = 'relevance', limit = 50 } = params;

      if (!project_id) {
        return {
          error: 'Missing required parameter: project_id',
          status: 400
        };
      }

      // Limit max results
      const safeLimit = Math.min(limit, 100);

      const manager = await this.getManager(project_id);
      const searchResult = await manager.searchAndRank(
        {
          coste_min,
          coste_max
        },
        {
          rankBy,
          limit: safeLimit
        }
      );

      return {
        status: 200,
        data: {
          results: searchResult.results || [],
          summary: searchResult.summary,
          count: searchResult.count || 0,
          rankBy
        }
      };
    } catch (err) {
      this.logger.error('escandallo.buscar_y_ordenar.error', {
        error: err.message
      });
      return {
        error: err.message,
        status: 500
      };
    }
  }
}

module.exports = EscandalloModule;

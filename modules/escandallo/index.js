/**
 * escandallo v3.0.0 — Analisis de costes y escandallo de recetas (POC2 rewrite).
 *
 * Calcula costes, margenes, food cost, comparativas mercado vs compra real,
 * simulaciones de precio, impacto de ingredientes, optimizacion automatica y
 * fichas tecnicas. Persiste calculos en SQLite via EscandalloManager por proyecto.
 *
 * Tools del LLM (12):
 *   7 principales (declarados en module.json.tools):
 *     escandallo.{receta, global, comparar_precios, simular_precio,
 *                 ingrediente_impacto, optimizar, ficha_tecnica}
 *   5 analyzer (registrados en moduleLoader.toolsRegistry):
 *     escandallo.{obtener, obtener_historico, obtener_alertas,
 *                 buscar, buscar_y_ordenar}
 *
 * Eventos del bus:
 *   subscribes (5): project.activated, project.deactivated, receta.creada,
 *                   receta.actualizada, ingrediente.precio.actualizado.
 *   publishes  (3): escandallo.{calculado, alerta, comparativa}.
 *
 * 4 ui_handlers (auto-wired desde module.json).
 */

'use strict';

const path   = require('path');
const fs     = require('fs').promises;
const crypto = require('crypto');

const EscandalloManager              = require('./core/escandallo-manager');
const EscandalloToolResultFormatter = require('./core/tool-result-formatter');

const BaseModule = require('../_shared/base-module');
const DEFAULT_PROJECT_ID         = 'default';
const FOOD_COST_UMBRAL_ALERTA    = 35; // %
const FOOD_COST_UMBRAL_BAJO      = 25; // %

class EscandalloModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'escandallo';
    this.version = '3.0.0';
    this.moduleLoader = null;

    this.cache        = new Map();
    this.projectPaths = new Map();
    this.managers     = new Map();
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.eventBus     = context.eventBus;
    this.logger       = context.logger;
    this.metrics      = context.metrics;
    this.moduleLoader = context.moduleLoader;

    this.logger.info('module.loading', { module: this.name, version: this.version });
    this._registerAnalyzerTools();
    this.logger.info('module.loaded',  { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    this.cache.clear();
    this.projectPaths.clear();

    for (const [projectId, manager] of this.managers) {
      try {
        if (manager?.close) await manager.close();
      } catch (err) {
        this.logger.error('escandallo.manager.close_failed', { project_id: projectId, error: err.message });
        this.metrics?.increment('escandallo.errors', { kind: 'manager_close', code: 'UNKNOWN_ERROR' });
      }
    }
    this.managers.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Manager por proyecto
  // ==========================================

  async _getManager(projectId) {
    if (!this.managers.has(projectId)) {
      const dbPath = this._resolveDbPath(projectId);
      const manager = new EscandalloManager(dbPath, this.logger);
      await manager.initialize();
      this.managers.set(projectId, manager);
    }
    return this.managers.get(projectId);
  }

  _resolveDbPath(projectId) {
    const paths = this.projectPaths.get(projectId);
    if (!paths) {
      // Fallback: in-memory si no hay path resuelto
      return ':memory:';
    }
    return path.join(paths.storagePath, 'escandallos.db');
  }

  // ==========================================
  // Bus handlers
  // ==========================================

  async onProjectActivated(event) {
    const data = this._unwrap(event);
    const { project_id, base_path, metadata } = data || {};
    if (!project_id) {
      this._logError('escandallo.project.activated.invalid', { missing: 'project_id' }, 'project_activated', 'INVALID_INPUT');
      return;
    }

    const resolvedBase = (metadata?.is_system === true) ? process.cwd() : base_path;
    if (resolvedBase) {
      this.projectPaths.set(project_id, { storagePath: path.join(resolvedBase, 'storage') });
    }
    await this._loadRecetasData(project_id);
    this.logger.info('escandallo.project.activated', { project_id });
  }

  async onProjectDeactivated() { /* no-op multi-tenant */ }

  async onRecetaCreada(event) {
    const data = this._unwrap(event);
    const projectKey = data?.project_id || data?.proyecto_id;
    if (projectKey) this.cache.delete(projectKey);
  }

  async onRecetaActualizada(event) {
    const data = this._unwrap(event);
    const projectKey = data?.project_id || data?.proyecto_id;
    if (projectKey) this.cache.delete(projectKey);
  }

  async onIngredientePrecioActualizado() {
    // Invalidate all caches — ingredient price affects all projects
    this.cache.clear();
  }

  // ==========================================
  // Data Access — lectura JSON de recetas y ingredientes
  // ==========================================

  async _loadRecetasData(projectId) {
    const paths = this.projectPaths.get(projectId);
    if (!paths) return { recetas: [], ingredientes: [] };

    const dir = path.join(paths.storagePath, 'recetas');
    const recetas      = (await this._readJsonSafe(path.join(dir, 'recetas.json'),       'recetas')) || [];
    const ingredientes = (await this._readJsonSafe(path.join(dir, 'ingredientes.json'),  'ingredientes')) || [];

    this.cache.set(projectId, { recetas, ingredientes });
    return { recetas, ingredientes };
  }

  async _getRecetas(projectId) {
    if (this.cache.has(projectId)) return this.cache.get(projectId);
    return this._loadRecetasData(projectId);
  }

  _findReceta(recetas, recetaId) {
    return recetas.find(r => r.id === recetaId);
  }

  _resolveToActiveProject(projectId) {
    if (projectId && this.cache.has(projectId)) return projectId;
    if (projectId && this.projectPaths.has(projectId)) return projectId;
    for (const [pid] of this.projectPaths) return pid;
    return projectId;
  }

  // ==========================================
  // Calculo central
  // ==========================================

  _round(n, decimals = 2) {
    const f = Math.pow(10, decimals);
    return Math.round(n * f) / f;
  }

  _calcularEscandallo(receta, usarCompra = false) {
    const desglose = receta.ingredientes.map(ing => {
      const precio = (usarCompra && ing.precio_compra != null) ? ing.precio_compra : (ing.precio_mercado || 0);
      return {
        nombre:      ing.nombre,
        cantidad:    ing.cantidad,
        unidad:      ing.unidad,
        precio:      this._round(precio),
        tipo_precio: (usarCompra && ing.precio_compra != null) ? 'compra' : 'mercado'
      };
    });

    const coste_total   = desglose.reduce((sum, d) => sum + d.precio, 0);
    const coste_porcion = receta.porciones > 0 ? coste_total / receta.porciones : 0;

    const conPorcentaje = desglose.map(d => ({
      ...d,
      porcentaje: coste_total > 0 ? this._round((d.precio / coste_total) * 100) : 0
    }));
    conPorcentaje.sort((a, b) => b.precio - a.precio);

    return {
      coste_total:   this._round(coste_total),
      coste_porcion: this._round(coste_porcion),
      desglose:      conPorcentaje
    };
  }

  _calcularMargen(costePorcion, precioVenta) {
    if (!precioVenta || precioVenta <= 0) return null;
    const margen = precioVenta - costePorcion;
    return {
      precio_venta:         precioVenta,
      margen_euro:          this._round(margen),
      margen_porcentaje:    this._round((margen / precioVenta) * 100),
      food_cost_porcentaje: this._round((costePorcion / precioVenta) * 100),
      multiplicador:        this._round(precioVenta / costePorcion)
    };
  }

  // ==========================================
  // UI Handlers — delegan a tools
  // ==========================================

  async handleEscandalloReceta(data) {
    const project_id = this._resolveToActiveProject(data?.project_id);
    return this.toolEscandalloReceta({ ...data, project_id });
  }

  async handleEscandalloGlobal(data) {
    const project_id = this._resolveToActiveProject(data?.project_id);
    return this.toolEscandalloGlobal({ ...data, project_id });
  }

  async handleComparativa(data) {
    const project_id = this._resolveToActiveProject(data?.project_id);
    return this.toolCompararPrecios({ ...data, project_id });
  }

  async handleStats(data) {
    const project_id = this._resolveToActiveProject(data?.project_id);
    return this.toolEscandalloGlobal({ ...data, project_id });
  }

  async handleHealthCheck() {
    try {
      return {
        status: 200,
        data: {
          status:    'healthy',
          module:    this.name,
          version:   this.version,
          proyectos: this.cache.size,
          managers:  this.managers.size
        }
      };
    } catch (err) {
      return this._handleHandlerError('escandallo.ui.health.failed', err, 'ui_health');
    }
  }

  // ==========================================
  // Tools "principales" (LLM-facing)
  // ==========================================

  async toolEscandalloReceta(args) {
    try {
      const { receta_id, precio_venta, usar_precio_compra, project_id } = args || {};
      if (!receta_id)  return this._validateMissing('receta_id',  'tool_escandallo_receta');
      if (!project_id) return this._validateMissing('project_id', 'tool_escandallo_receta');

      const { recetas } = await this._getRecetas(project_id);
      const receta = this._findReceta(recetas, receta_id);
      if (!receta) {
        this._logError('escandallo.receta.not_found', { receta_id, project_id }, 'tool_escandallo_receta', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Receta "${receta_id}" no encontrada`, {
          entity_type: 'receta', entity_id: receta_id
        });
      }

      const esc = this._calcularEscandallo(receta, usar_precio_compra);
      const result = {
        receta_id,
        project_id,
        nombre:    receta.nombre,
        categoria: receta.categoria,
        porciones: receta.porciones,
        ...esc
      };

      if (precio_venta) {
        const margen = this._calcularMargen(esc.coste_porcion, precio_venta);
        Object.assign(result, margen);
      }

      const insights = [];
      if (esc.desglose.length > 0) {
        const top = esc.desglose[0];
        insights.push(`Ingrediente mas caro: ${top.nombre} (${top.porcentaje}% del coste)`);
      }
      if (precio_venta) {
        const fc = this._round((esc.coste_porcion / precio_venta) * 100);
        if (fc > FOOD_COST_UMBRAL_ALERTA)        insights.push(`Food cost alto (${fc}%). Lo recomendable es < 33%.`);
        else if (fc < FOOD_COST_UMBRAL_BAJO)     insights.push(`Food cost bajo (${fc}%). Buen margen.`);
        else                                      insights.push(`Food cost aceptable (${fc}%).`);
      }
      result.insights = insights;

      await this._publicarEvento('escandallo.calculado', result, args);

      // Alerta opcional
      if (precio_venta) {
        const fc = this._round((esc.coste_porcion / precio_venta) * 100);
        if (fc > FOOD_COST_UMBRAL_ALERTA) {
          await this._publicarEvento('escandallo.alerta', {
            tipo:       'food_cost_alto',
            project_id, receta_id,
            nombre:     receta.nombre,
            food_cost:  fc,
            umbral:     FOOD_COST_UMBRAL_ALERTA,
            mensaje:    `Food cost de "${receta.nombre}" al ${fc}% (umbral: ${FOOD_COST_UMBRAL_ALERTA}%)`
          }, args);
        }
      }

      this.metrics?.increment('escandallo.receta.calculated', { project_id });
      return { status: 200, data: result };
    } catch (err) {
      return this._handleHandlerError('escandallo.receta.failed', err, 'tool_escandallo_receta');
    }
  }

  async toolEscandalloGlobal(args) {
    try {
      const { precios_venta, project_id } = args || {};
      if (!project_id) return this._validateMissing('project_id', 'tool_escandallo_global');

      const { recetas, ingredientes } = await this._getRecetas(project_id);
      if (recetas.length === 0) {
        return { status: 200, data: { project_id, total_recetas: 0, user_hint: 'No hay recetas. Crea recetas primero.' } };
      }

      const preciosMap = precios_venta || {};
      const analisis = recetas.map(r => {
        const esc = this._calcularEscandallo(r);
        const entry = {
          id: r.id, nombre: r.nombre, categoria: r.categoria, porciones: r.porciones,
          coste_total: esc.coste_total, coste_porcion: esc.coste_porcion,
          ingrediente_mas_caro:     esc.desglose[0]?.nombre || '-',
          ingrediente_mas_caro_pct: esc.desglose[0]?.porcentaje || 0
        };
        if (preciosMap[r.id]) {
          const m = this._calcularMargen(esc.coste_porcion, preciosMap[r.id]);
          if (m) Object.assign(entry, m);
        }
        return entry;
      });

      const porCoste   = [...analisis].sort((a, b) => b.coste_porcion - a.coste_porcion);
      const costesAll  = analisis.map(a => a.coste_porcion);

      const ingImpacto = {};
      for (const r of recetas) {
        for (const ing of r.ingredientes) {
          if (!ingImpacto[ing.nombre]) ingImpacto[ing.nombre] = { nombre: ing.nombre, recetas: 0, coste_total: 0 };
          ingImpacto[ing.nombre].recetas++;
          ingImpacto[ing.nombre].coste_total += (ing.precio_mercado || 0);
        }
      }
      const topIngredientes = Object.values(ingImpacto)
        .sort((a, b) => b.coste_total - a.coste_total)
        .slice(0, 15)
        .map(i => ({ ...i, coste_total: this._round(i.coste_total) }));

      const porCategoria = {};
      for (const a of analisis) {
        if (!porCategoria[a.categoria]) {
          porCategoria[a.categoria] = { recetas: 0, coste_medio_porcion: 0, _total: 0 };
        }
        porCategoria[a.categoria].recetas++;
        porCategoria[a.categoria]._total += a.coste_porcion;
      }
      for (const [cat, info] of Object.entries(porCategoria)) {
        porCategoria[cat].coste_medio_porcion = this._round(info._total / info.recetas);
        delete porCategoria[cat]._total;
      }

      this.metrics?.increment('escandallo.global.calculated', { project_id });

      return {
        status: 200,
        data: {
          project_id,
          total_recetas:               recetas.length,
          total_ingredientes_catalogo: ingredientes.length,
          coste_porcion_medio:         this._round(costesAll.reduce((a, b) => a + b, 0) / costesAll.length),
          coste_porcion_min:           this._round(Math.min(...costesAll)),
          coste_porcion_max:           this._round(Math.max(...costesAll)),
          ranking_por_coste:           porCoste.slice(0, 10),
          por_categoria:               porCategoria,
          top_ingredientes_por_coste:  topIngredientes,
          recetas:                     analisis
        }
      };
    } catch (err) {
      return this._handleHandlerError('escandallo.global.failed', err, 'tool_escandallo_global');
    }
  }

  async toolCompararPrecios(args) {
    try {
      const { project_id } = args || {};
      if (!project_id) return this._validateMissing('project_id', 'tool_comparar_precios');

      const { ingredientes } = await this._getRecetas(project_id);
      if (ingredientes.length === 0) {
        return { status: 200, data: { project_id, total: 0, user_hint: 'No hay ingredientes en el catalogo.' } };
      }

      const conCompra = ingredientes.filter(i => i.precio_compra_kg != null);
      const sinCompra = ingredientes.filter(i => i.precio_compra_kg == null);

      const comparativa = conCompra.map(i => {
        const diferencia = i.precio_mercado_kg - i.precio_compra_kg;
        return {
          nombre:         i.nombre,
          precio_mercado: i.precio_mercado_kg,
          precio_compra:  i.precio_compra_kg,
          diferencia:     this._round(diferencia),
          ahorro_pct:     this._round((diferencia / i.precio_mercado_kg) * 100),
          unidad:         i.unidad_base
        };
      }).sort((a, b) => b.diferencia - a.diferencia);

      const ahorroTotal = comparativa.reduce((sum, c) => sum + c.diferencia, 0);

      this.metrics?.increment('escandallo.comparativa.generated', { project_id });

      const resultData = {
        project_id,
        con_precio_compra: comparativa,
        sin_precio_compra: sinCompra.map(i => ({ nombre: i.nombre, precio_mercado: i.precio_mercado_kg, unidad: i.unidad_base })),
        resumen: {
          total_ingredientes:       ingredientes.length,
          con_compra:               conCompra.length,
          sin_compra:               sinCompra.length,
          ahorro_potencial_total:   this._round(ahorroTotal),
          user_hint: sinCompra.length > 0
            ? `${sinCompra.length} ingredientes sin precio de compra real. Enlaza con facturas para obtener precios reales.`
            : 'Todos los ingredientes tienen precio de compra real.'
        }
      };

      await this._publicarEvento('escandallo.comparativa', resultData, args);
      return { status: 200, data: resultData };
    } catch (err) {
      return this._handleHandlerError('escandallo.comparativa.failed', err, 'tool_comparar_precios');
    }
  }

  async toolSimularPrecio(args) {
    try {
      const { receta_id, precios, food_cost_objetivo, project_id } = args || {};
      if (!receta_id)  return this._validateMissing('receta_id',  'tool_simular_precio');
      if (!project_id) return this._validateMissing('project_id', 'tool_simular_precio');

      const { recetas } = await this._getRecetas(project_id);
      const receta = this._findReceta(recetas, receta_id);
      if (!receta) {
        this._logError('escandallo.simular.not_found', { receta_id }, 'tool_simular_precio', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Receta "${receta_id}" no encontrada`, {
          entity_type: 'receta', entity_id: receta_id
        });
      }

      const esc = this._calcularEscandallo(receta);
      const costePorcion = esc.coste_porcion;

      const result = {
        project_id, receta_id,
        nombre: receta.nombre, coste_porcion: costePorcion, porciones: receta.porciones,
        simulaciones: []
      };

      const preciosSimular = precios || [
        this._round(costePorcion * 2.5),
        this._round(costePorcion * 3),
        this._round(costePorcion * 3.5),
        this._round(costePorcion * 4)
      ];
      result.simulaciones = preciosSimular.map(pv => ({ precio_venta: pv, ...this._calcularMargen(costePorcion, pv) }));

      if (food_cost_objetivo) {
        const precioNecesario = this._round(costePorcion / (food_cost_objetivo / 100));
        result.precio_para_food_cost = {
          food_cost_objetivo,
          precio_venta_necesario: precioNecesario,
          ...this._calcularMargen(costePorcion, precioNecesario)
        };
      }

      this.metrics?.increment('escandallo.simulacion.run', { project_id });
      return { status: 200, data: result };
    } catch (err) {
      return this._handleHandlerError('escandallo.simular.failed', err, 'tool_simular_precio');
    }
  }

  async toolIngredienteImpacto(args) {
    try {
      const { ingrediente_nombre, subida_porcentaje, project_id } = args || {};
      if (!ingrediente_nombre) return this._validateMissing('ingrediente_nombre', 'tool_ingrediente_impacto');
      if (!project_id)         return this._validateMissing('project_id',         'tool_ingrediente_impacto');

      const { recetas, ingredientes } = await this._getRecetas(project_id);
      const nombreLower = ingrediente_nombre.toLowerCase();

      const catIng = ingredientes.find(i => i.nombre.toLowerCase().includes(nombreLower));

      const recetasConIng = [];
      let costeTotal = 0;
      for (const r of recetas) {
        for (const ing of r.ingredientes) {
          if (ing.nombre.toLowerCase().includes(nombreLower)) {
            const precioActual = ing.precio_mercado || 0;
            costeTotal += precioActual;
            recetasConIng.push({
              receta_id:            r.id,
              receta_nombre:        r.nombre,
              cantidad:             ing.cantidad,
              unidad:               ing.unidad,
              precio_actual:        precioActual,
              coste_porcion_receta: r.coste_porcion || 0
            });
          }
        }
      }

      if (recetasConIng.length === 0) {
        this._logError('escandallo.impacto.no_match', { ingrediente_nombre }, 'tool_ingrediente_impacto', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
          `Ingrediente "${ingrediente_nombre}" no encontrado en ninguna receta`,
          { entity_type: 'ingrediente', entity_id: ingrediente_nombre });
      }

      const result = {
        project_id,
        ingrediente: ingrediente_nombre,
        catalogo: catIng ? {
          precio_mercado: catIng.precio_mercado_kg,
          precio_compra:  catIng.precio_compra_kg,
          unidad:         catIng.unidad_base,
          fuente:         catIng.fuente_precio
        } : null,
        aparece_en:          recetasConIng.length,
        recetas:             recetasConIng,
        coste_total_actual:  this._round(costeTotal)
      };

      if (subida_porcentaje) {
        const factor = 1 + (subida_porcentaje / 100);
        const nuevoCosteTotal = this._round(costeTotal * factor);
        const impacto = recetasConIng.map(r => {
          const nuevoCosteIng = this._round(r.precio_actual * factor);
          const incremento   = this._round(nuevoCosteIng - r.precio_actual);
          return {
            receta:                          r.receta_nombre,
            incremento_ingrediente:          incremento,
            nuevo_coste_porcion_estimado:    this._round(r.coste_porcion_receta + (incremento / (recetas.find(rec => rec.id === r.receta_id)?.porciones || 1)))
          };
        });

        result.simulacion_subida = {
          porcentaje:           subida_porcentaje,
          coste_total_nuevo:    nuevoCosteTotal,
          incremento:           this._round(nuevoCosteTotal - costeTotal),
          impacto_por_receta:   impacto
        };
      }

      return { status: 200, data: result };
    } catch (err) {
      return this._handleHandlerError('escandallo.impacto.failed', err, 'tool_ingrediente_impacto');
    }
  }

  async toolOptimizar(args) {
    try {
      const { food_cost_maximo, project_id } = args || {};
      if (!project_id) return this._validateMissing('project_id', 'tool_optimizar');

      const fcMax = food_cost_maximo || 33;
      const { recetas, ingredientes } = await this._getRecetas(project_id);

      if (recetas.length === 0) {
        return { status: 200, data: { project_id, sugerencias: [], user_hint: 'No hay recetas para analizar.' } };
      }

      const sugerencias = [];

      // 1. Recetas con coste alto por porcion
      const costesOrdenados = [...recetas].sort((a, b) => (b.coste_porcion || 0) - (a.coste_porcion || 0));
      const media = recetas.reduce((s, r) => s + (r.coste_porcion || 0), 0) / recetas.length;
      for (const r of costesOrdenados) {
        if (r.coste_porcion > media * 1.5) {
          sugerencias.push({
            tipo:           'coste_alto',
            receta:         r.nombre,
            receta_id:      r.id,
            coste_porcion:  this._round(r.coste_porcion),
            media_proyecto: this._round(media),
            mensaje:        `"${r.nombre}" tiene coste/porcion ${this._round(r.coste_porcion)}€, un ${this._round(((r.coste_porcion - media) / media) * 100)}% mas que la media (${this._round(media)}€)`
          });
        }
      }

      // 2. Ingredientes caros que dominan el coste
      for (const r of recetas) {
        const esc = this._calcularEscandallo(r);
        for (const d of esc.desglose) {
          if (d.porcentaje > 50) {
            sugerencias.push({
              tipo:        'ingrediente_dominante',
              receta:      r.nombre,
              receta_id:   r.id,
              ingrediente: d.nombre,
              porcentaje:  d.porcentaje,
              mensaje:     `"${d.nombre}" representa ${d.porcentaje}% del coste de "${r.nombre}". Considera reducir cantidad o buscar alternativa.`
            });
          }
        }
      }

      // 3. Ingredientes de poco uso (solo en 1 receta)
      const ingPocosUsos = ingredientes.filter(i => (i.recetas_count || 0) === 1);
      if (ingPocosUsos.length > 3) {
        sugerencias.push({
          tipo:         'stock_variado',
          ingredientes: ingPocosUsos.map(i => i.nombre).slice(0, 10),
          total:        ingPocosUsos.length,
          mensaje:      `${ingPocosUsos.length} ingredientes aparecen solo en 1 receta. Stock muy variado = mas desperdicio y coste de gestion.`
        });
      }

      // 4. Ingredientes sin precio de compra
      const sinCompra = ingredientes.filter(i => i.precio_compra_kg == null);
      if (sinCompra.length > 0) {
        sugerencias.push({
          tipo:    'precios_sin_verificar',
          total:   sinCompra.length,
          mensaje: `${sinCompra.length} ingredientes con precio de mercado estimado (sin verificar con compra real). Los costes podrian variar.`
        });
      }

      return {
        status: 200,
        data: {
          project_id,
          food_cost_objetivo:  fcMax,
          total_recetas:       recetas.length,
          coste_porcion_medio: this._round(media),
          sugerencias,
          user_hint: sugerencias.length === 0
            ? 'No se encontraron problemas evidentes. Los costes parecen bien equilibrados.'
            : `${sugerencias.length} sugerencias de optimizacion encontradas.`
        }
      };
    } catch (err) {
      return this._handleHandlerError('escandallo.optimizar.failed', err, 'tool_optimizar');
    }
  }

  async toolFichaTecnica(args) {
    try {
      const { receta_id, precio_venta, project_id } = args || {};
      if (!receta_id)  return this._validateMissing('receta_id',  'tool_ficha_tecnica');
      if (!project_id) return this._validateMissing('project_id', 'tool_ficha_tecnica');

      const { recetas, ingredientes } = await this._getRecetas(project_id);
      const receta = this._findReceta(recetas, receta_id);
      if (!receta) {
        this._logError('escandallo.ficha.not_found', { receta_id }, 'tool_ficha_tecnica', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Receta "${receta_id}" no encontrada`, {
          entity_type: 'receta', entity_id: receta_id
        });
      }

      const esc = this._calcularEscandallo(receta);
      const alergenos = new Set();
      for (const ing of receta.ingredientes) {
        const catIng = ingredientes.find(i => i.id === ing.ingrediente_id);
        if (catIng?.alergenos) catIng.alergenos.forEach(a => alergenos.add(a));
      }

      const ficha = {
        project_id,
        nombre:               receta.nombre,
        descripcion:          receta.descripcion,
        categoria:            receta.categoria,
        porciones:            receta.porciones,
        tiempo_preparacion:   receta.tiempo_preparacion,
        dificultad:           receta.dificultad,
        tags:                 receta.tags,
        escandallo: {
          coste_total:   esc.coste_total,
          coste_porcion: esc.coste_porcion,
          desglose:      esc.desglose
        },
        margen:               precio_venta ? this._calcularMargen(esc.coste_porcion, precio_venta) : null,
        ingredientes:         receta.ingredientes.map(i => ({
          nombre:   i.nombre,
          cantidad: i.cantidad,
          unidad:   i.unidad,
          precio:   i.precio_mercado,
          notas:    i.notas
        })),
        elaboracion:          receta.elaboracion,
        alergenos:            Array.from(alergenos),
        fuente:               receta.fuente,
        notas:                receta.notas,
        fecha:                new Date().toISOString()
      };

      this.metrics?.increment('escandallo.ficha.generated', { project_id });
      return { status: 200, data: ficha };
    } catch (err) {
      return this._handleHandlerError('escandallo.ficha.failed', err, 'tool_ficha_tecnica');
    }
  }

  // ==========================================
  // Tools "analyzer" — registrados en moduleLoader.toolsRegistry
  // ==========================================

  async toolObtenerEscandallo(params) {
    try {
      const { escandallo_id, project_id } = params || {};
      if (!escandallo_id || !project_id) {
        this._logError('escandallo.obtener.validation_failed', { missing: !escandallo_id ? 'escandallo_id' : 'project_id' }, 'tool_obtener', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT',
          'Se requiere escandallo_id y project_id',
          { fields: ['escandallo_id', 'project_id'] });
      }

      const manager    = await this._getManager(project_id);
      const escandallo = await manager.getEscandallo(escandallo_id);
      if (!escandallo) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Escandallo "${escandallo_id}" not found`, {
          entity_type: 'escandallo', entity_id: escandallo_id
        });
      }

      const formattedData = EscandalloToolResultFormatter.formatSafely(escandallo, 'obtener');
      return { status: 200, data: formattedData };
    } catch (err) {
      return this._handleHandlerError('escandallo.obtener.failed', err, 'tool_obtener');
    }
  }

  async toolObtenerHistorico(params) {
    try {
      const { receta_id, project_id, limit = 5 } = params || {};
      if (!receta_id || !project_id) {
        this._logError('escandallo.historico.validation_failed', { missing: !receta_id ? 'receta_id' : 'project_id' }, 'tool_obtener_historico', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere receta_id y project_id', { fields: ['receta_id', 'project_id'] });
      }

      const manager = await this._getManager(project_id);
      const history = await manager.getHistory(receta_id, limit);
      if (!history || history.length === 0) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `No historical data found for recipe "${receta_id}"`, {
          entity_type: 'receta_historico', entity_id: receta_id
        });
      }

      const lines = [
        `=== HISTORICO ESCANDALLO: ${receta_id} ===`,
        `Total registros: ${history.length}`,
        ''
      ];
      history.forEach((record, idx) => {
        lines.push(`Registro ${idx + 1}:`);
        lines.push(`  Fecha: ${record.timestamp ? new Date(record.timestamp).toLocaleString('es-ES') : 'desconocida'}`);
        if (record.coste_porcion !== undefined)        lines.push(`  Coste/porcion: €${record.coste_porcion.toFixed(2)}`);
        if (record.food_cost_porcentaje !== undefined) lines.push(`  Food Cost: ${record.food_cost_porcentaje.toFixed(1)}%`);
        lines.push('');
      });

      return { status: 200, data: lines.join('\n') };
    } catch (err) {
      return this._handleHandlerError('escandallo.historico.failed', err, 'tool_obtener_historico');
    }
  }

  async toolObtenerAlertas(params) {
    try {
      const { escandallo_id, project_id } = params || {};
      if (!escandallo_id || !project_id) {
        this._logError('escandallo.alertas.validation_failed', { missing: !escandallo_id ? 'escandallo_id' : 'project_id' }, 'tool_obtener_alertas', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere escandallo_id y project_id', { fields: ['escandallo_id', 'project_id'] });
      }

      const manager = await this._getManager(project_id);
      const alerts  = await manager.getAlertas(escandallo_id);

      const lines = [`=== ALERTAS: ${escandallo_id} ===`];
      if (!alerts || alerts.length === 0) {
        lines.push('Sin alertas activas');
      } else {
        lines.push(`Total alertas: ${alerts.length}`);
        lines.push('');
        alerts.forEach((alert, idx) => {
          lines.push(`Alerta ${idx + 1}:`);
          lines.push(`  Tipo: ${alert.tipo || 'desconocido'}`);
          if (alert.descripcion) lines.push(`  Descripcion: ${alert.descripcion}`);
          if (alert.fecha)       lines.push(`  Fecha: ${new Date(alert.fecha).toLocaleString('es-ES')}`);
          if (alert.leida !== undefined) lines.push(`  Leida: ${alert.leida ? 'Si' : 'No'}`);
          lines.push('');
        });
      }

      return { status: 200, data: lines.join('\n') };
    } catch (err) {
      return this._handleHandlerError('escandallo.alertas.failed', err, 'tool_obtener_alertas');
    }
  }

  async toolBuscar(params) {
    try {
      const { project_id, coste_min, coste_max, tiene_alerta, tiene_alerta_sin_leer,
              desde_fecha, hasta_fecha, sin_precio, limit = 50 } = params || {};
      if (!project_id) return this._validateMissing('project_id', 'tool_buscar');

      const safeLimit = Math.min(limit, 100);
      const manager   = await this._getManager(project_id);
      const results   = await manager.search({
        coste_min, coste_max, tiene_alerta, tiene_alerta_sin_leer,
        desde_fecha, hasta_fecha, sin_precio, limit: safeLimit
      });

      const lines = ['=== BUSQUEDA DE ESCANDALLOS ===', `Resultados encontrados: ${results ? results.length : 0}`, ''];
      if (!results || results.length === 0) {
        lines.push('Sin resultados que coincidan con los criterios.');
      } else {
        results.slice(0, 10).forEach((r, idx) => {
          lines.push(`${idx + 1}. ${r.nombre || 'Sin nombre'}`);
          if (r.coste_porcion !== undefined) lines.push(`   Coste/porcion: €${r.coste_porcion.toFixed(2)}`);
          if (r.tiene_alerta)                lines.push(`   ⚠ Tiene alertas`);
          lines.push('');
        });
        if (results.length > 10) lines.push(`... y ${results.length - 10} resultados mas`);
      }

      return { status: 200, data: lines.join('\n') };
    } catch (err) {
      return this._handleHandlerError('escandallo.buscar.failed', err, 'tool_buscar');
    }
  }

  async toolBuscarYOrdenar(params) {
    try {
      const { project_id, coste_min, coste_max, rankBy = 'relevance', limit = 50 } = params || {};
      if (!project_id) return this._validateMissing('project_id', 'tool_buscar_y_ordenar');

      const safeLimit    = Math.min(limit, 100);
      const manager      = await this._getManager(project_id);
      const searchResult = await manager.searchAndRank({ coste_min, coste_max }, { rankBy, limit: safeLimit });

      const lines = [
        '=== BUSQUEDA ORDENADA DE ESCANDALLOS ===',
        `Criterio: ${rankBy}`,
        `Resultados: ${searchResult.count || 0}`
      ];
      if (searchResult.summary) lines.push(`Resumen: ${searchResult.summary}`);
      lines.push('');

      const results = searchResult.results || [];
      if (results.length === 0) {
        lines.push('Sin resultados.');
      } else {
        results.slice(0, 10).forEach((r, idx) => {
          lines.push(`${idx + 1}. ${r.nombre || 'Sin nombre'}`);
          if (r.coste_porcion !== undefined) lines.push(`   Coste: €${r.coste_porcion.toFixed(2)}`);
          if (r.score !== undefined)         lines.push(`   Score: ${r.score.toFixed(2)}`);
          lines.push('');
        });
        if (results.length > 10) lines.push(`... y ${results.length - 10} resultados mas`);
      }

      return { status: 200, data: lines.join('\n') };
    } catch (err) {
      return this._handleHandlerError('escandallo.buscar_y_ordenar.failed', err, 'tool_buscar_y_ordenar');
    }
  }

  // ==========================================
  // Tool registry para analyzer agent
  // ==========================================

  _registerAnalyzerTools() {
    if (!this.moduleLoader || !this.moduleLoader.toolsRegistry) {
      this.logger.warn('escandallo.register_tools.no_module_loader');
      return;
    }

    const reg = this.moduleLoader.toolsRegistry;

    reg.set('escandallo.obtener', {
      name:        'escandallo.obtener',
      description: 'Get full escandallo calculation with cost breakdown. Used by analyzer agent to validate calculations.',
      parameters: {
        type: 'object',
        properties: {
          escandallo_id: { type: 'string', description: 'The escandallo ID (e.g., "esc_rec_pasta_1713090000")' },
          project_id:    { type: 'string', description: 'Project ID for database access' }
        },
        required: ['escandallo_id', 'project_id']
      },
      handler:      this.toolObtenerEscandallo.bind(this),
      module:       'escandallo',
      confirmation: false
    });

    reg.set('escandallo.obtener_historico', {
      name:        'escandallo.obtener_historico',
      description: 'Get historical escandallo calculations for a recipe to detect price trends and anomalies.',
      parameters: {
        type: 'object',
        properties: {
          receta_id:  { type: 'string', description: 'The recipe ID to get history for' },
          project_id: { type: 'string', description: 'Project ID for database access' },
          limit:      { type: 'integer', description: 'Number of historical records (default: 5)', default: 5 }
        },
        required: ['receta_id', 'project_id']
      },
      handler:      this.toolObtenerHistorico.bind(this),
      module:       'escandallo',
      confirmation: false
    });

    reg.set('escandallo.obtener_alertas', {
      name:        'escandallo.obtener_alertas',
      description: 'Get price change alerts for an escandallo. Helps analyzer detect anomalies and significant price movements.',
      parameters: {
        type: 'object',
        properties: {
          escandallo_id: { type: 'string', description: 'The escandallo ID to get alerts for' },
          project_id:    { type: 'string', description: 'Project ID for database access' }
        },
        required: ['escandallo_id', 'project_id']
      },
      handler:      this.toolObtenerAlertas.bind(this),
      module:       'escandallo',
      confirmation: false
    });

    reg.set('escandallo.buscar', {
      name:        'escandallo.buscar',
      description: 'Search escandallos by criteria: cost range, date range, alert presence, missing prices.',
      parameters: {
        type: 'object',
        properties: {
          project_id:            { type: 'string',  description: 'Project ID for database access' },
          coste_min:             { type: 'number',  description: 'Minimum cost per portion (€)' },
          coste_max:             { type: 'number',  description: 'Maximum cost per portion (€)' },
          tiene_alerta:          { type: 'boolean', description: 'Filter by alert presence' },
          tiene_alerta_sin_leer: { type: 'boolean', description: 'Filter by unread alerts' },
          desde_fecha:           { type: 'integer', description: 'Start date timestamp (ms)' },
          hasta_fecha:           { type: 'integer', description: 'End date timestamp (ms)' },
          sin_precio:            { type: 'boolean', description: 'Filter escandallos with missing prices' },
          limit:                 { type: 'integer', description: 'Max results (default: 50, max: 100)' }
        },
        required: ['project_id']
      },
      handler:      this.toolBuscar.bind(this),
      module:       'escandallo',
      confirmation: false
    });

    reg.set('escandallo.buscar_y_ordenar', {
      name:        'escandallo.buscar_y_ordenar',
      description: 'Search escandallos with intelligent ranking by relevance, anomaly score, cost, or recency.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string',  description: 'Project ID for database access' },
          coste_min:  { type: 'number',  description: 'Minimum cost per portion (€)' },
          coste_max:  { type: 'number',  description: 'Maximum cost per portion (€)' },
          rankBy:     { type: 'string',  enum: ['relevance', 'cost', 'cost_desc', 'alerts', 'recent', 'old'], description: 'Ranking strategy' },
          limit:      { type: 'integer', description: 'Max results (default: 50, max: 100)' }
        },
        required: ['project_id']
      },
      handler:      this.toolBuscarYOrdenar.bind(this),
      module:       'escandallo',
      confirmation: false
    });

    this.logger.info('escandallo.search_tools.registered', { tools_count: 5 });
  }

  // ==========================================
  // Helpers POC2
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details && typeof details === 'object') error.details = details;
    return { status, error };
  }

  _validateMissing(field, kind) {
    this._logError('escandallo.validation_failed', { missing: field }, kind, 'INVALID_INPUT');
    return this._errorResponse(400, 'INVALID_INPUT', `${field} es requerido`, { field });
  }

  _handleHandlerError(logEvent, err, kind) {
    const code   = err._code || this._classifyHandlerError(err);
    const status = code === 'INVALID_INPUT'           ? 400 :
                   code === 'RESOURCE_NOT_FOUND'      ? 404 :
                   code === 'PERMISSION_DENIED'       ? 403 :
                   code === 'CONFLICT_STATE'          ? 409 :
                   code === 'DEPENDENCY_UNAVAILABLE'  ? 503 :
                   code === 'EXTERNAL_API_FAILED'     ? 502 :
                   code === 'TIMEOUT'                 ? 504 :
                   code === 'FILESYSTEM_ERROR'        ? 500 : 500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code, kind });
    this.metrics?.increment('escandallo.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg  = (err?.message || '').toLowerCase();
    const ecod = err?.code || '';
    if (ecod === 'ENOENT' || msg.includes('not found') || msg.includes('no encontrad')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('validation')) return 'INVALID_INPUT';
    if (ecod && ecod.startsWith('E'))                                                    return 'FILESYSTEM_ERROR';
    return 'UNKNOWN_ERROR';
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    if (!this.eventBus?.publish) return;
    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      timestamp:      new Date().toISOString(),
      ...payload,
      project_id:     payload?.project_id || sourcePayload?.project_id || DEFAULT_PROJECT_ID
    };
    try {
      await this.eventBus.publish(name, enriched);
    } catch (err) {
      this.logger.error('escandallo.publish_error', { event: name, error: err.message });
      this.metrics?.increment('escandallo.errors', { kind: 'publish', code: 'UNKNOWN_ERROR' });
    }
  }

  // 5o helper auxiliar — lectura JSON con log+metric en error (no swallow)
  async _readJsonSafe(filePath, kind) {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('escandallo.read_error', { file: filePath, kind, error: err.message });
        this.metrics?.increment('escandallo.errors', { kind: kind || 'read_json', code: this._classifyHandlerError(err) });
      }
      return null;
    }
  }

  // 6o helper — slugify canonico
  _slugify(text) {
    if (!text) return 'sin_nombre';
    return String(text).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'sin_nombre';
  }

  _logError(logEvent, fields, kind, code) {
    this.logger.error(logEvent, { ...fields, code, kind });
    this.metrics?.increment('escandallo.errors', { kind, code });
  }

  _unwrap(event) { return event?.data || event?.payload || event || {}; }
}

module.exports = EscandalloModule;

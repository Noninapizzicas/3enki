/**
 * MÓDULO RECETAS v2 — Refactorizado
 *
 * Responsabilidades:
 * - Ingestion multi-formato (URL/PDF/foto/JSON) → eventos
 * - Búsqueda en BD local (40+ criterios)
 * - Persistencia SQLite per-project con versionado
 * - Orquestación vía eventos (NO lógica bloqueante)
 *
 * Flujo event-driven:
 *   Ingestion Pipeline → receta.ingestion.completed
 *   → Recipe Structurer Agent → receta.structuring.completed
 *   → Recipe Analyzer Agent → receta.analysis.completed
 *   → Recipe Curator Agent → receta.creada/actualizada
 *
 * @version 2.0.0
 */

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const SQLiteManager = require('./core/sqlite-manager');
const RecipeIngestionPipeline = require('./pipeline/recipe-ingestion-pipeline');
const ServiceExecutor = require('../../core/service-executor');

class RecetasModule {
  constructor() {
    this.name = 'recetas';
    this.version = '2.0.0';

    // Inyected by loader
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.uiHandler = null;

    // Per-project managers
    this.sqliteManagers = new Map();    // projectId → SQLiteManager
    this.pipelines = new Map();          // projectId → RecipeIngestionPipeline
    this.services = null;                // ServiceExecutor

    // Config
    this.config = {
      ingestion: {
        timeout_url: 30000,
        timeout_pdf: 60000,
        timeout_ocr: 60000,
        max_file_size: 50000000
      }
    };
  }

  // ==========================================
  // LIFECYCLE
  // ==========================================

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
    this.metrics = context.metrics;
    this.uiHandler = context.uiHandler;

    // ServiceExecutor para providers
    this.services = new ServiceExecutor(this.eventBus, this.logger);

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    // Cerrar todas las BDs
    for (const [projectId, manager] of this.sqliteManagers) {
      try {
        await manager.close();
      } catch (err) {
        this.logger.error('sqlite.close_failed', { projectId, error: err.message });
      }
    }
    this.sqliteManagers.clear();
    this.pipelines.clear();
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // PROJECT ACTIVATION
  // ==========================================

  async onProjectActivated(event) {
    const { project_id, base_path, metadata } = event.data || event;

    try {
      // Inicializar SQLiteManager para este proyecto
      const resolvedBase = (metadata?.is_system === true) ? process.cwd() : base_path;
      const manager = new SQLiteManager(project_id, resolvedBase, this.logger);
      await manager.init();

      this.sqliteManagers.set(project_id, manager);

      // Inicializar pipeline para este proyecto
      const pipeline = new RecipeIngestionPipeline({
        services: this.services,
        eventBus: this.eventBus,
        logger: this.logger,
        sqliteManager: manager,
        metrics: this.metrics
      });

      this.pipelines.set(project_id, pipeline);

      this.logger.info('recetas.project.activated', { project_id });
    } catch (err) {
      this.logger.error('recetas.project.activation_failed', { project_id, error: err.message });
      throw err;
    }
  }

  async onProjectDeactivated(event) {
    const { project_id } = event.data || event;

    try {
      const manager = this.sqliteManagers.get(project_id);
      if (manager) {
        await manager.close();
        this.sqliteManagers.delete(project_id);
      }
      this.pipelines.delete(project_id);

      this.logger.info('recetas.project.deactivated', { project_id });
    } catch (err) {
      this.logger.error('recetas.project.deactivation_failed', { project_id, error: err.message });
    }
  }

  // ==========================================
  // HANDLERS: UI endpoints (domain: recetas)
  // ==========================================

  async handleIngestar(request) {
    const { proyecto_id, input, tipo, fuente_referencia } = request;

    try {
      const pipeline = this.pipelines.get(proyecto_id);
      if (!pipeline) {
        return { status: 400, error: 'Proyecto no activado' };
      }

      const result = await pipeline.process(proyecto_id, input, {
        tipo,
        fuente_referencia
      });

      return { status: 200, data: result };
    } catch (err) {
      this.logger.error('recetas.ingestar.failed', { proyecto_id, error: err.message });
      return { status: 500, error: err.message };
    }
  }

  async handleBuscar(request) {
    const { proyecto_id, ...criteria } = request;

    try {
      const manager = this.sqliteManagers.get(proyecto_id);
      if (!manager) {
        return { status: 400, error: 'Proyecto no activado' };
      }

      const resultados = await manager.searchRecetas(proyecto_id, criteria);
      this.metrics?.increment('receta.buscada');

      return {
        status: 200,
        data: {
          recetas: resultados,
          total_encontradas: resultados.length,
          criterios_aplicados: criteria,
          timestamp: Date.now()
        }
      };
    } catch (err) {
      this.logger.error('recetas.buscar.failed', { proyecto_id, error: err.message });
      return { status: 500, error: err.message };
    }
  }

  async handleListar(request) {
    const { proyecto_id, estado, limit } = request;

    try {
      const manager = this.sqliteManagers.get(proyecto_id);
      if (!manager) {
        return { status: 400, error: 'Proyecto no activado' };
      }

      const recetas = await manager.listRecetas(proyecto_id, { estado, limit });

      return {
        status: 200,
        data: {
          recetas,
          total: recetas.length
        }
      };
    } catch (err) {
      this.logger.error('recetas.listar.failed', { proyecto_id, error: err.message });
      return { status: 500, error: err.message };
    }
  }

  async handleObtener(request) {
    const { receta_id, proyecto_id } = request;

    try {
      const manager = this.sqliteManagers.get(proyecto_id);
      if (!manager) {
        return { status: 400, error: 'Proyecto no activado' };
      }

      const receta = await manager.getReceta(receta_id);
      if (!receta) {
        return { status: 404, error: 'Receta no encontrada' };
      }

      return { status: 200, data: receta };
    } catch (err) {
      this.logger.error('recetas.obtener.failed', { receta_id, error: err.message });
      return { status: 500, error: err.message };
    }
  }

  async handleHistorial(request) {
    const { receta_id, limit } = request;

    try {
      // Buscar manager (en una app real vendría en request)
      const manager = Array.from(this.sqliteManagers.values())[0];
      if (!manager) {
        return { status: 400, error: 'Ningún proyecto activo' };
      }

      const historial = await manager.getVersionHistory(receta_id, limit);

      return { status: 200, data: historial };
    } catch (err) {
      this.logger.error('recetas.historial.failed', { receta_id, error: err.message });
      return { status: 500, error: err.message };
    }
  }

  async handleRevertir(request) {
    const { receta_id, proyecto_id, target_version } = request;

    try {
      const manager = this.sqliteManagers.get(proyecto_id);
      if (!manager) {
        return { status: 400, error: 'Proyecto no activado' };
      }

      const result = await manager.revertVersion(receta_id, target_version, proyecto_id);

      await this.eventBus.publish('receta.versión.revertida', {
        receta_id,
        proyecto_id,
        revertida_a_version: target_version,
        timestamp: Date.now()
      });

      return { status: 200, data: result };
    } catch (err) {
      this.logger.error('recetas.revertir.failed', { receta_id, error: err.message });
      return { status: 500, error: err.message };
    }
  }

  async handleIngredientes(request) {
    const { proyecto_id, categoria } = request;

    try {
      const manager = this.sqliteManagers.get(proyecto_id);
      if (!manager) {
        return { status: 400, error: 'Proyecto no activado' };
      }

      const ingredientes = await manager.getIngredientes(proyecto_id, { categoria });

      return { status: 200, data: ingredientes };
    } catch (err) {
      this.logger.error('recetas.ingredientes.failed', { proyecto_id, error: err.message });
      return { status: 500, error: err.message };
    }
  }

  async handleActualizarPrecio(request) {
    const { ingrediente_id, proyecto_id, precio_mercado, fuente } = request;

    try {
      const manager = this.sqliteManagers.get(proyecto_id);
      if (!manager) {
        return { status: 400, error: 'Proyecto no activado' };
      }

      await manager.updatePrecioMercado(ingrediente_id, precio_mercado, proyecto_id, fuente);

      await this.eventBus.publish('ingrediente.precio.actualizado', {
        ingrediente_id,
        proyecto_id,
        precio_mercado,
        fuente,
        timestamp: Date.now()
      });

      return { status: 200, data: { ingrediente_id, precio_mercado } };
    } catch (err) {
      this.logger.error('recetas.actualizar_precio.failed', { ingrediente_id, error: err.message });
      return { status: 500, error: err.message };
    }
  }

  async handleEstadisticas(request) {
    const { proyecto_id } = request;

    try {
      const manager = this.sqliteManagers.get(proyecto_id);
      if (!manager) {
        return { status: 400, error: 'Proyecto no activado' };
      }

      const stats = await manager.getStats(proyecto_id);

      return { status: 200, data: stats };
    } catch (err) {
      this.logger.error('recetas.estadisticas.failed', { proyecto_id, error: err.message });
      return { status: 500, error: err.message };
    }
  }

  /**
   * Handle: investigar_receta (OPCIÓN 2 - Fase 1)
   *
   * Orquesta la investigación de una receta:
   * 1. Busca en BD local
   * 2. Si existe → retorna con costos
   * 3. Si no existe → estructura parcial con "needs_generation"
   */
  async handleInvestigarReceta(request) {
    const { proyecto_id, nombre_receta, descripcion_opcional } = request;

    try {
      // Validar proyecto
      const manager = this.sqliteManagers.get(proyecto_id);
      if (!manager) {
        return { status: 400, error: 'Proyecto no activado' };
      }

      if (!nombre_receta || nombre_receta.trim() === '') {
        return { status: 400, error: 'nombre_receta es requerido' };
      }

      this.logger.info('recetas.investigar.iniciado', {
        proyecto_id,
        nombre_receta,
        tiene_descripcion: !!descripcion_opcional
      });

      // PASO 1: Buscar receta existente
      const busqueda = await manager.searchRecetas(proyecto_id, {
        nombre: nombre_receta,
        limit: 5
      });

      let resultado = {
        investigacion_id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        proyecto_id,
        nombre_buscado: nombre_receta,
        descripcion_proporcionada: descripcion_opcional || null
      };

      // PASO 2: Evaluar resultados
      if (busqueda && busqueda.length > 0) {
        // Encontró coincidencias
        const receta = busqueda[0];

        resultado.status = 'receta_encontrada';
        resultado.confianza = 'alta';
        resultado.receta = receta;
        resultado.ingredientes_pendientes = [];
        resultado.flags = [];

        // Intentar obtener costos
        try {
          // Simulación: en producción llamaría a escandallo real
          if (receta.ingredientes && receta.ingredientes.length > 0) {
            let coste_total = 0;
            receta.ingredientes.forEach(ing => {
              if (ing.precio_mercado_en_momento) {
                coste_total += ing.precio_mercado_en_momento;
              }
            });

            resultado.costes = {
              coste_total,
              coste_porcion: receta.porciones ? (coste_total / receta.porciones).toFixed(2) : coste_total,
              food_cost_porcentaje: null,
              detalles: receta.ingredientes.map(ing => ({
                nombre: ing.nombre,
                costo: ing.precio_mercado_en_momento || 0
              }))
            };
          }
        } catch (e) {
          this.logger.debug('recetas.investigar.costos-error', { error: e.message });
        }

        resultado.viabilidad = {
          estado: 'VIABLE',
          razon: 'Receta encontrada en sistema',
          confianza_alta: true
        };

        this.logger.info('recetas.investigar.encontrada', {
          proyecto_id,
          receta_id: receta.id
        });

      } else {
        // No encontró - necesita generación (Fase 2)
        resultado.status = 'needs_generation';
        resultado.confianza = 'baja';
        resultado.receta = {
          nombre: nombre_receta,
          descripcion: descripcion_opcional || '',
          estado: 'borrador',
          ingredientes: [],
          elaboracion: [],
          _estatus_investigacion: 'pendiente_generacion'
        };
        resultado.ingredientes_pendientes = [
          {
            razon: 'no_encontrada_en_bd',
            sugerencia: 'Se requiere generación con Claude en Fase 2'
          }
        ];
        resultado.flags = [
          'receta_no_existe',
          'requiere_generacion_fase_2',
          'fase_1_completada'
        ];

        this.logger.info('recetas.investigar.no_encontrada', {
          proyecto_id,
          nombre_receta
        });
      }

      this.metrics?.increment('receta.investigada');

      return {
        status: 200,
        data: resultado
      };

    } catch (err) {
      this.logger.error('recetas.investigar.failed', {
        proyecto_id,
        nombre_receta,
        error: err.message
      });
      return { status: 500, error: err.message };
    }
  }

  // ==========================================
  // TOOLS: Para agentes IA
  // ==========================================

  async toolIngestar(params) {
    return this.handleIngestar(params);
  }

  async toolBuscar(params) {
    return this.handleBuscar(params);
  }

  async toolListar(params) {
    return this.handleListar(params);
  }

  async toolObtener(params) {
    return this.handleObtener(params);
  }

  async toolHistorial(params) {
    return this.handleHistorial(params);
  }

  async toolRevertir(params) {
    return this.handleRevertir(params);
  }

  async toolIngredientes(params) {
    return this.handleIngredientes(params);
  }

  async toolActualizarPrecio(params) {
    return this.handleActualizarPrecio(params);
  }

  async toolEstadisticas(params) {
    return this.handleEstadisticas(params);
  }

  async toolInvestigarReceta(params) {
    return this.handleInvestigarReceta(params);
  }

  // NOTE: toolAnalizar, toolCrear, toolActualizar no están aquí
  // — son responsabilidad de agentes especializados que escuchan eventos
}

module.exports = RecetasModule;

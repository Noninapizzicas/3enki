/**
 * Viabilidad Calculation Pipeline
 *
 * Pipeline event-driven:
 * - Escucha: escandallo.calculado
 * - Lee: escandallo (coste_porcion), receta (precio_venta)
 * - Calcula: viabilidad per receta
 * - Genera: recomendaciones automáticas
 * - Publica: receta.viabilidad.evaluada
 */

const ViabilidadManager = require('../core/viabilidad-manager');

class ViabilidadCalculationPipeline {
  constructor(logger, eventBus, recetasModule) {
    this.logger = logger;
    this.eventBus = eventBus;
    this.recetas = recetasModule;
    this.manager = null;
  }

  /**
   * Inicializa el pipeline
   */
  async init() {
    // Manager será inicializado por proyecto en getManager()
    if (this.eventBus) {
      this.eventBus.on('escandallo.calculado', this.onEscandalloCalculado.bind(this));
      this.eventBus.on('receta.precio.actualizado', this.onRecetaPrecioActualizado.bind(this));
    }

    this.logger.info('viabilidad_pipeline.initialized');
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onEscandalloCalculado(event) {
    const { escandallo_id, receta_id, projectId, coste_porcion } = event.data || event;

    this.logger.info('viabilidad_pipeline.escandallo_calculado', {
      receta_id,
      projectId,
      coste_porcion
    });

    try {
      await this.executeForReceta(projectId, receta_id, coste_porcion, escandallo_id);
    } catch (err) {
      this.logger.error('viabilidad_pipeline.escandallo_failed', {
        receta_id,
        error: err.message
      });
      this.eventBus?.emit('receta.viabilidad.failed', {
        receta_id,
        projectId,
        error: err.message
      });
    }
  }

  async onRecetaPrecioActualizado(event) {
    const { receta_id, projectId, nuevo_precio } = event.data || event;

    this.logger.info('viabilidad_pipeline.receta_precio_actualizado', {
      receta_id,
      projectId,
      nuevo_precio
    });

    try {
      // Recalcular viabilidad con nuevo precio
      const manager = await this.getManager(projectId);
      const viability = await manager.getViability(projectId, receta_id);

      if (viability) {
        // Recalcular con nuevo precio
        const actualizada = manager.calculateViability(receta_id, viability.coste_porcion, nuevo_precio);
        const recomendaciones = manager.generateRecommendations(receta_id, actualizada);

        await manager.saveViability(projectId, actualizada);
        await manager.saveRecommendations(projectId, receta_id, recomendaciones);

        this.eventBus?.emit('receta.viabilidad.evaluada', {
          receta_id,
          projectId,
          viabilidad: actualizada,
          recomendaciones,
          timestamp: Date.now()
        });
      }
    } catch (err) {
      this.logger.error('viabilidad_pipeline.precio_update_failed', {
        receta_id,
        error: err.message
      });
    }
  }

  // ==========================================
  // Main Pipeline Execution
  // ==========================================

  /**
   * Ejecuta evaluación de viabilidad para una receta
   */
  async executeForReceta(projectId, recetaId, coste_porcion, escandallo_id) {
    const startTime = Date.now();

    this.logger.info('viabilidad_pipeline.execute_started', { receta_id: recetaId });

    try {
      const manager = await this.getManager(projectId);

      // STEP 1: Obtener precio de venta de la receta (si existe)
      const precioVenta = await this.getRecetaPrecio(projectId, recetaId);

      // STEP 2: Calcular viabilidad
      const viability = manager.calculateViability(recetaId, coste_porcion, precioVenta);
      viability.escandallo_id = escandallo_id;

      this.logger.info('viabilidad_pipeline.calculado', {
        receta_id: recetaId,
        estado: viability.estado,
        food_cost: viability.food_cost_porcentaje
      });

      // STEP 3: Generar recomendaciones
      const recomendaciones = manager.generateRecommendations(recetaId, viability);

      if (recomendaciones.length > 0) {
        this.logger.info('viabilidad_pipeline.recomendaciones_generadas', {
          receta_id: recetaId,
          count: recomendaciones.length
        });
      }

      // STEP 4: Persistir
      const viabilidadId = await manager.saveViability(projectId, viability);
      await manager.saveRecommendations(projectId, receta_id, recomendaciones);

      // STEP 5: Publicar evento
      const duration = Date.now() - startTime;
      this.eventBus?.emit('receta.viabilidad.evaluada', {
        receta_id: recetaId,
        projectId,
        escandallo_id,
        viabilidad,
        recomendaciones,
        duration_ms: duration,
        timestamp: Date.now()
      });

      this.logger.info('viabilidad_pipeline.execute_completed', {
        receta_id: recetaId,
        duration_ms: duration
      });

      return {
        success: true,
        viabilidad_id: viabilidadId,
        estado: viability.estado,
        recomendaciones: recomendaciones.length
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      this.logger.error('viabilidad_pipeline.execute_failed', {
        receta_id: recetaId,
        error: err.message,
        duration_ms: duration
      });
      throw err;
    }
  }

  // ==========================================
  // Helpers
  // ==========================================

  /**
   * Obtiene o crea manager para un proyecto
   */
  async getManager(projectId) {
    if (!this.manager) {
      throw new Error('Manager not initialized. Project path unknown.');
    }
    return this.manager;
  }

  /**
   * Inyecta manager (desde módulo)
   */
  setManager(manager) {
    this.manager = manager;
  }

  /**
   * Obtiene precio de venta de una receta
   */
  async getRecetaPrecio(projectId, recetaId) {
    try {
      // Intentar obtener de recetas module si disponible
      if (this.recetas && this.recetas.getReceta) {
        const receta = await this.recetas.getReceta(projectId, recetaId);
        return receta?.precio_venta || null;
      }
      return null;
    } catch (err) {
      this.logger.warn('viabilidad_pipeline.get_precio_failed', {
        receta_id: recetaId,
        error: err.message
      });
      return null;
    }
  }

  /**
   * Obtiene estadísticas del pipeline
   */
  async getStats(projectId) {
    if (!this.manager) return null;

    return {
      summary: await this.manager.getProjectSummary(projectId),
      timestamp: Date.now()
    };
  }
}

module.exports = ViabilidadCalculationPipeline;

/**
 * Escandallo Calculation Pipeline
 *
 * Pipeline event-driven:
 * - Escucha: receta.creada, receta.actualizada, ingrediente.precio.actualizado
 * - Busca precios (Mercadona → Carrefour → Google → Histórico)
 * - Calcula escandallo
 * - Detecta cambios y alertas
 * - Publica: escandallo.calculado
 */

const PrecioFinder = require('../core/precio-finder');
const PrecioCacheManager = require('../core/precio-cache-manager');

class EscandalloCalculationPipeline {
  constructor(logger, eventBus, escandalloManager, recetasModule) {
    this.logger = logger;
    this.eventBus = eventBus;
    this.manager = escandalloManager;
    this.recetas = recetasModule;

    this.precioFinder = new PrecioFinder(logger, null); // Cache inicializa después
    this.precioCache = null;
  }

  /**
   * Inicializa pipeline
   */
  async init() {
    this.precioCache = new PrecioCacheManager(this.manager.db, this.logger);
    this.precioFinder = new PrecioFinder(this.logger, this.precioCache);

    // Suscribirse a eventos
    if (this.eventBus) {
      this.eventBus.on('receta.creada', this.onRecetaCreada.bind(this));
      this.eventBus.on('receta.actualizada', this.onRecetaActualizada.bind(this));
      this.eventBus.on('ingrediente.precio.actualizado', this.onIngredientePrecioActualizado.bind(this));
    }

    this.logger.info('escandallo_pipeline.initialized');
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onRecetaCreada(event) {
    const { receta_id, projectId, receta } = event.data || event;
    this.logger.info('escandallo_pipeline.receta_creada', { receta_id, projectId });

    try {
      await this.executeForReceta(projectId, receta_id, receta);
    } catch (err) {
      this.logger.error('escandallo_pipeline.receta_creada_failed', {
        receta_id,
        error: err.message
      });
      this.eventBus?.emit('escandallo.calculado.failed', {
        receta_id,
        projectId,
        error: err.message
      });
    }
  }

  async onRecetaActualizada(event) {
    const { receta_id, projectId, receta } = event.data || event;
    this.logger.info('escandallo_pipeline.receta_actualizada', { receta_id, projectId });

    try {
      await this.executeForReceta(projectId, receta_id, receta);
    } catch (err) {
      this.logger.error('escandallo_pipeline.receta_actualizada_failed', {
        receta_id,
        error: err.message
      });
    }
  }

  async onIngredientePrecioActualizado(event) {
    const { ingrediente_nombre, projectId } = event.data || event;
    this.logger.info('escandallo_pipeline.ingrediente_precio_actualizado', {
      ingrediente: ingrediente_nombre,
      projectId
    });

    // Recalcular todos los escandallos que usan este ingrediente
    // (implementar después si es necesario)
  }

  // ==========================================
  // Main Pipeline Execution
  // ==========================================

  /**
   * Ejecuta pipeline completo para una receta
   */
  async executeForReceta(projectId, recetaId, receta) {
    this.logger.info('escandallo_pipeline.execute_started', { receta_id: recetaId });

    const startTime = Date.now();

    try {
      // STEP 1: Validar receta
      if (!receta || !receta.ingredientes || receta.ingredientes.length === 0) {
        throw new Error('Receta sin ingredientes');
      }

      // STEP 2: Buscar precios para cada ingrediente
      const preciosMercado = {};
      const preciosNoEncontrados = [];

      for (const ingrediente of receta.ingredientes) {
        this.logger.debug('escandallo_pipeline.buscando_precio', {
          ingrediente: ingrediente.nombre
        });

        const precioDato = await this.precioFinder.findPrecio(ingrediente.nombre);

        if (precioDato) {
          preciosMercado[ingrediente.nombre] = precioDato.precio;
          this.logger.info('escandallo_pipeline.precio_encontrado', {
            ingrediente: ingrediente.nombre,
            precio: precioDato.precio,
            fuente: precioDato.fuente
          });
        } else {
          preciosNoEncontrados.push(ingrediente.nombre);
          this.logger.warn('escandallo_pipeline.precio_no_encontrado', {
            ingrediente: ingrediente.nombre
          });
        }
      }

      // STEP 3: Calcular escandallo
      const calculation = await this.manager.calculateEscandallo(
        recetaId,
        receta,
        preciosMercado
      );

      this.logger.info('escandallo_pipeline.calculado', {
        receta_id: recetaId,
        coste_total: calculation.coste_total,
        coste_porcion: calculation.coste_porcion
      });

      // STEP 4: Persistir
      const escandalloId = await this.manager.saveEscandallo(recetaId, calculation);

      // STEP 5: Detectar cambios y alertas
      const alertas = await this.manager.detectPriceChanges(
        escandalloId,
        recetaId,
        calculation.snapshot
      );

      if (alertas.length > 0) {
        this.logger.info('escandallo_pipeline.alertas_detectadas', {
          escandallo_id: escandalloId,
          count: alertas.length
        });
      }

      // STEP 6: Publicar evento
      const duration = Date.now() - startTime;
      this.eventBus?.emit('escandallo.calculado', {
        escandallo_id: escandalloId,
        receta_id: recetaId,
        projectId,
        coste_total: calculation.coste_total,
        coste_porcion: calculation.coste_porcion,
        alertas: alertas.length,
        precios_no_encontrados: preciosNoEncontrados,
        duration_ms: duration,
        timestamp: Date.now()
      });

      this.logger.info('escandallo_pipeline.execute_completed', {
        receta_id: recetaId,
        duration_ms: duration
      });

      return {
        success: true,
        escandallo_id: escandalloId,
        coste_total: calculation.coste_total,
        coste_porcion: calculation.coste_porcion,
        alertas: alertas.length,
        precios_no_encontrados
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      this.logger.error('escandallo_pipeline.execute_failed', {
        receta_id: recetaId,
        error: err.message,
        duration_ms: duration
      });
      throw err;
    }
  }

  // ==========================================
  // Maintenance
  // ==========================================

  /**
   * Limpia cache expirado (ejecutar diariamente)
   */
  async cleanupCache() {
    this.logger.info('escandallo_pipeline.cleanup_started');
    const deleted = await this.precioCache.cleanupExpired();
    this.logger.info('escandallo_pipeline.cleanup_completed', { deleted });
    return deleted;
  }

  /**
   * Obtiene estadísticas del pipeline
   */
  async getStats() {
    return {
      cache: await this.precioCache.getStats(),
      timestamp: Date.now()
    };
  }
}

module.exports = EscandalloCalculationPipeline;

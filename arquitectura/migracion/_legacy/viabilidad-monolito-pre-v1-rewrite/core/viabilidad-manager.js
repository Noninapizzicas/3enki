/**
 * Viabilidad Manager v2
 *
 * Gestiona evaluación de viabilidad por receta:
 * - Cálculo de márgenes y food cost
 * - Persistencia en SQLite
 * - Generación de recomendaciones
 * - Búsqueda y filtrado
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

class ViabilidadManager {
  constructor(dbPath, logger) {
    this.dbPath = dbPath;
    this.logger = logger;
    this.db = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, async (err) => {
        if (err) {
          this.logger.error('viabilidad.db.open_failed', { error: err.message });
          reject(err);
          return;
        }

        try {
          await this._applySchema();
          this.logger.info('viabilidad.db.initialized');
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  async _applySchema() {
    const schemaPath = path.join(__dirname, '../db/schema-viabilidad-receta.sql');
    const schema = await fs.readFile(schemaPath, 'utf-8');

    return new Promise((resolve, reject) => {
      this.db.exec(schema, (err) => {
        if (err) {
          this.logger.error('viabilidad.schema.apply_failed', { error: err.message });
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  // ==========================================
  // Database operations
  // ==========================================

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // ==========================================
  // Core calculations
  // ==========================================

  /**
   * Calcula viabilidad de una receta
   * Entrada: coste_porcion (de escandallo), precio_venta (opcional)
   * Salida: viabilidad con estado y recomendaciones
   */
  calculateViability(recetaId, coste_porcion, precio_venta = null) {
    const id = `via_${recetaId}_${Date.now()}`;

    let viability = {
      id,
      receta_id: recetaId,
      coste_porcion: this.round(coste_porcion),
      precio_venta: precio_venta ? this.round(precio_venta) : null,
      margen_bruto: null,
      margen_porcentaje: null,
      food_cost_porcentaje: null,
      markup: null,
      estado: 'PENDIENTE',
      razon_estado: 'Sin precio de venta definido',
      evaluado_at: Date.now()
    };

    // Si no hay precio de venta, no podemos evaluar
    if (!precio_venta || precio_venta <= 0) {
      return viability;
    }

    // Cálculos
    viability.margen_bruto = this.round(precio_venta - coste_porcion);
    viability.margen_porcentaje = this.round((viability.margen_bruto / precio_venta) * 100);
    viability.food_cost_porcentaje = this.round((coste_porcion / precio_venta) * 100);
    viability.markup = this.round(precio_venta / coste_porcion);

    // Determinar estado
    const fc = viability.food_cost_porcentaje;
    const margen = viability.margen_porcentaje;

    if (viability.margen_bruto <= 0) {
      viability.estado = 'INVIABLE';
      viability.razon_estado = `Margen negativo: -€${Math.abs(viability.margen_bruto)}`;
    } else if (fc > 45) {
      viability.estado = 'INVIABLE';
      viability.razon_estado = `Food cost ${fc}% es insostenible (>45%)`;
    } else if (fc > 40) {
      viability.estado = 'CRÍTICO';
      viability.razon_estado = `Food cost ${fc}% muy alto (>40%)`;
    } else if (fc > 35) {
      viability.estado = 'ACEPTABLE';
      viability.razon_estado = `Food cost ${fc}% aceptable pero alto`;
    } else if (margen < 20) {
      viability.estado = 'ACEPTABLE';
      viability.razon_estado = `Margen ${margen}% es bajo`;
    } else {
      viability.estado = 'VIABLE';
      viability.razon_estado = `Margen ${margen}% y food cost ${fc}% óptimos`;
    }

    return viability;
  }

  /**
   * Genera recomendaciones basadas en viabilidad
   */
  generateRecommendations(recetaId, viability, costeInicial = null) {
    const recommendations = [];

    if (!viability.precio_venta) {
      recommendations.push({
        tipo: 'falta_precio',
        prioridad: 'ADVERTENCIA',
        texto: 'Sin precio de venta definido. Define un precio para evaluar viabilidad.',
        impacto_estimado: 0
      });
      return recommendations;
    }

    const fc = viability.food_cost_porcentaje;
    const margen = viability.margen_porcentaje;
    const coste = viability.coste_porcion;

    // Recomendación 1: Subir precio
    if (fc > 35) {
      const precioParaFc30 = this.round(coste / 0.30);
      const subidasugería = this.round(precioParaFc30 - viability.precio_venta);
      recommendations.push({
        tipo: 'subir_precio',
        prioridad: fc > 40 ? 'CRÍTICA' : 'ADVERTENCIA',
        texto: `Subir precio de €${viability.precio_venta} a €${precioParaFc30} para conseguir 30% food cost`,
        impacto_estimado: subidasugería,
        detalles: { precio_actual: viability.precio_venta, precio_recomendado: precioParaFc30, fc_objetivo: 30 }
      });
    }

    // Recomendación 2: Bajar coste
    if (fc > 35) {
      const costeParaFc30 = this.round(viability.precio_venta * 0.30);
      const ahorroNecesario = this.round(coste - costeParaFc30);
      recommendations.push({
        tipo: 'bajar_coste',
        prioridad: fc > 40 ? 'CRÍTICA' : 'ADVERTENCIA',
        texto: `Reducir coste de €${coste} a €${costeParaFc30} (ahorrar €${ahorroNecesario}) para conseguir 30% food cost`,
        impacto_estimado: ahorroNecesario,
        detalles: { coste_actual: coste, coste_objetivo: costeParaFc30, ahorro_necesario: ahorroNecesario }
      });
    }

    // Recomendación 3: Margen muy bajo
    if (margen < 20 && margen > 0) {
      recommendations.push({
        tipo: 'aumentar_margen',
        prioridad: 'ADVERTENCIA',
        texto: `Margen ${margen}% es bajo. Objetivo: >25%. Subir precio o reducir coste.`,
        impacto_estimado: 0,
        detalles: { margen_actual: margen, margen_objetivo: 25 }
      });
    }

    // Recomendación 4: Eliminar (si inviable)
    if (viability.estado === 'INVIABLE') {
      recommendations.push({
        tipo: 'eliminar',
        prioridad: 'CRÍTICA',
        texto: `Esta receta no es rentable. Considerar: reformular ingredientes, eliminar del menú, o aumentar precio significativamente.`,
        impacto_estimado: 0,
        detalles: { razon: viability.razon_estado }
      });
    }

    return recommendations;
  }

  // ==========================================
  // Persistence
  // ==========================================

  /**
   * Guarda viabilidad calculada
   */
  async saveViability(projectId, viability) {
    try {
      const now = Date.now();

      await this.run(
        `INSERT OR REPLACE INTO viabilidad_receta
        (id, receta_id, proyecto_id, coste_porcion, precio_venta, margen_bruto, margen_porcentaje, food_cost_porcentaje, markup, estado, razon_estado, evaluado_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          viability.id,
          viability.receta_id,
          projectId,
          viability.coste_porcion,
          viability.precio_venta,
          viability.margen_bruto,
          viability.margen_porcentaje,
          viability.food_cost_porcentaje,
          viability.markup,
          viability.estado,
          viability.razon_estado,
          viability.evaluado_at,
          now,
          now
        ]
      );

      this.logger.info('viabilidad.saved', {
        receta_id: viability.receta_id,
        estado: viability.estado
      });

      return viability.id;
    } catch (err) {
      this.logger.error('viabilidad.save_failed', { error: err.message });
      throw err;
    }
  }

  /**
   * Guarda recomendaciones
   */
  async saveRecommendations(projectId, recetaId, recommendations) {
    try {
      for (const rec of recommendations) {
        const id = `rec_${recetaId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

        await this.run(
          `INSERT INTO viabilidad_recomendacion
          (id, receta_id, proyecto_id, tipo, texto, prioridad, impacto_estimado, detalles, detectada_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            recetaId,
            projectId,
            rec.tipo,
            rec.texto,
            rec.prioridad,
            rec.impacto_estimado || null,
            rec.detalles ? JSON.stringify(rec.detalles) : null,
            Date.now(),
            Date.now()
          ]
        );
      }

      this.logger.info('viabilidad.recommendations_saved', {
        receta_id: recetaId,
        count: recommendations.length
      });
    } catch (err) {
      this.logger.error('viabilidad.recommendations_save_failed', { error: err.message });
    }
  }

  // ==========================================
  // Retrieval
  // ==========================================

  /**
   * Obtiene viabilidad actual de una receta
   */
  async getViability(projectId, recetaId) {
    try {
      const viability = await this.get(
        `SELECT * FROM viabilidad_receta WHERE proyecto_id = ? AND receta_id = ? ORDER BY evaluado_at DESC LIMIT 1`,
        [projectId, recetaId]
      );
      return viability || null;
    } catch (err) {
      this.logger.error('viabilidad.get_failed', { error: err.message });
      return null;
    }
  }

  /**
   * Obtiene viabilidades de todas las recetas de un proyecto
   */
  async getProjectViabilities(projectId, limit = 100) {
    try {
      const viabilities = await this.all(
        `SELECT * FROM v_viabilidad_con_estado WHERE proyecto_id = ? ORDER BY evaluado_at DESC LIMIT ?`,
        [projectId, limit]
      );
      return viabilities || [];
    } catch (err) {
      this.logger.error('viabilidad.get_project_failed', { error: err.message });
      return [];
    }
  }

  /**
   * Obtiene recomendaciones para una receta
   */
  async getRecommendations(recetaId, onlyPending = false) {
    try {
      let sql = `SELECT * FROM viabilidad_recomendacion WHERE receta_id = ?`;
      const params = [recetaId];

      if (onlyPending) {
        sql += ` AND implementada = 0`;
      }

      sql += ` ORDER BY prioridad DESC, detectada_at DESC`;

      const recommendations = await this.all(sql, params);
      return recommendations || [];
    } catch (err) {
      this.logger.error('viabilidad.get_recommendations_failed', { error: err.message });
      return [];
    }
  }

  /**
   * Filtra recetas por estado
   */
  async getRecetasByEstado(projectId, estado, limit = 100) {
    try {
      const recetas = await this.all(
        `SELECT * FROM v_viabilidad_con_estado WHERE proyecto_id = ? AND estado = ? ORDER BY evaluado_at DESC LIMIT ?`,
        [projectId, estado, limit]
      );
      return recetas || [];
    } catch (err) {
      this.logger.error('viabilidad.get_by_estado_failed', { error: err.message });
      return [];
    }
  }

  /**
   * Obtiene resumen de viabilidad del proyecto
   */
  async getProjectSummary(projectId) {
    try {
      const summary = await this.get(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN estado = 'VIABLE' THEN 1 ELSE 0 END) as viable,
          SUM(CASE WHEN estado = 'ACEPTABLE' THEN 1 ELSE 0 END) as aceptable,
          SUM(CASE WHEN estado = 'CRÍTICO' THEN 1 ELSE 0 END) as critico,
          SUM(CASE WHEN estado = 'INVIABLE' THEN 1 ELSE 0 END) as inviable,
          ROUND(AVG(margen_porcentaje), 2) as margen_promedio,
          ROUND(AVG(food_cost_porcentaje), 2) as food_cost_promedio
        FROM viabilidad_receta
        WHERE proyecto_id = ?`,
        [projectId]
      );

      return summary || {
        total: 0,
        viable: 0,
        aceptable: 0,
        critico: 0,
        inviable: 0,
        margen_promedio: 0,
        food_cost_promedio: 0
      };
    } catch (err) {
      this.logger.error('viabilidad.summary_failed', { error: err.message });
      return null;
    }
  }

  // ==========================================
  // Helpers
  // ==========================================

  round(n, decimals = 2) {
    const f = Math.pow(10, decimals);
    return Math.round(n * f) / f;
  }
}

module.exports = ViabilidadManager;

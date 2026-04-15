/**
 * Search Filters for Viabilidad Receta
 *
 * Filtra recetas por viabilidad.
 *
 * Supported filters:
 * - estado: VIABLE, ACEPTABLE, CRÍTICO, INVIABLE
 * - margen_min / margen_max: Margin range (%)
 * - food_cost_min / food_cost_max: Food cost range (%)
 * - tiene_riesgo: Has pending recommendations
 * - desde_fecha / hasta_fecha: Date range
 */

class ViabilityFilters {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Build WHERE clause from filter criteria
   *
   * @param {Object} criteria - Filter criteria
   * @returns {Object} { whereClause: string, params: array }
   */
  buildWhereClause(criteria = {}) {
    const conditions = [];
    const params = [];

    // Estado filtering
    if (criteria.estado) {
      if (Array.isArray(criteria.estado)) {
        const placeholders = criteria.estado.map(() => '?').join(',');
        conditions.push(`vr.estado IN (${placeholders})`);
        params.push(...criteria.estado);
      } else {
        conditions.push('vr.estado = ?');
        params.push(criteria.estado);
      }
    }

    // Margin range filtering
    if (criteria.margen_min !== null && criteria.margen_min !== undefined) {
      conditions.push('vr.margen_porcentaje >= ?');
      params.push(criteria.margen_min);
    }

    if (criteria.margen_max !== null && criteria.margen_max !== undefined) {
      conditions.push('vr.margen_porcentaje <= ?');
      params.push(criteria.margen_max);
    }

    // Food cost range filtering
    if (criteria.food_cost_min !== null && criteria.food_cost_min !== undefined) {
      conditions.push('vr.food_cost_porcentaje >= ?');
      params.push(criteria.food_cost_min);
    }

    if (criteria.food_cost_max !== null && criteria.food_cost_max !== undefined) {
      conditions.push('vr.food_cost_porcentaje <= ?');
      params.push(criteria.food_cost_max);
    }

    // Has risk/recommendations
    if (criteria.tiene_riesgo === true) {
      conditions.push('(SELECT COUNT(*) FROM viabilidad_recomendacion WHERE receta_id = vr.receta_id AND implementada = 0) > 0');
    }

    if (criteria.tiene_riesgo === false) {
      conditions.push('(SELECT COUNT(*) FROM viabilidad_recomendacion WHERE receta_id = vr.receta_id AND implementada = 0) = 0');
    }

    // Date range filtering
    if (criteria.desde_fecha) {
      conditions.push('vr.evaluado_at >= ?');
      params.push(criteria.desde_fecha);
    }

    if (criteria.hasta_fecha) {
      conditions.push('vr.evaluado_at <= ?');
      params.push(criteria.hasta_fecha);
    }

    // Project ID (required safety check)
    if (criteria.proyecto_id) {
      conditions.push('vr.proyecto_id = ?');
      params.push(criteria.proyecto_id);
    }

    const whereClause = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    return { whereClause, params };
  }

  /**
   * Validate filter criteria
   */
  validate(criteria) {
    if (criteria.margen_min && criteria.margen_max && criteria.margen_min > criteria.margen_max) {
      this.logger.warn('viability-filters.invalid_range', {
        margen_min: criteria.margen_min,
        margen_max: criteria.margen_max
      });
      return {
        valid: false,
        error: 'margen_min debe ser menor que margen_max'
      };
    }

    if (criteria.food_cost_min && criteria.food_cost_max && criteria.food_cost_min > criteria.food_cost_max) {
      this.logger.warn('viability-filters.invalid_fc_range', {
        food_cost_min: criteria.food_cost_min,
        food_cost_max: criteria.food_cost_max
      });
      return {
        valid: false,
        error: 'food_cost_min debe ser menor que food_cost_max'
      };
    }

    return { valid: true };
  }

  /**
   * Build complete query with filters
   *
   * @param {Object} criteria - Filter criteria
   * @param {Object} options - Query options (offset, limit, sort)
   * @returns {Object} { sql: string, params: array }
   */
  buildQuery(criteria = {}, options = {}) {
    const { whereClause, params } = this.buildWhereClause(criteria);

    let sql = `
      SELECT
        vr.id,
        vr.receta_id,
        vr.proyecto_id,
        vr.coste_porcion,
        vr.precio_venta,
        vr.margen_bruto,
        vr.margen_porcentaje,
        vr.food_cost_porcentaje,
        vr.estado,
        vr.evaluado_at,
        COUNT(DISTINCT CASE WHEN vrec.implementada = 0 THEN vrec.id END) as recomendaciones_pendientes,
        COUNT(DISTINCT CASE WHEN vrec.prioridad = 'CRÍTICA' THEN vrec.id END) as riesgos_criticos
      FROM viabilidad_receta vr
      LEFT JOIN viabilidad_recomendacion vrec ON vr.receta_id = vrec.receta_id
      ${whereClause}
      GROUP BY vr.id
    `;

    // Add sorting
    if (options.sort) {
      const sortByMap = {
        margen_desc: 'vr.margen_porcentaje DESC',
        margen_asc: 'vr.margen_porcentaje ASC',
        food_cost_asc: 'vr.food_cost_porcentaje ASC',
        food_cost_desc: 'vr.food_cost_porcentaje DESC',
        estado: 'CASE WHEN vr.estado="INVIABLE" THEN 0 WHEN vr.estado="CRÍTICO" THEN 1 WHEN vr.estado="ACEPTABLE" THEN 2 ELSE 3 END ASC',
        riesgo: 'riesgos_criticos DESC, recomendaciones_pendientes DESC',
        reciente: 'vr.evaluado_at DESC'
      };

      const orderClause = sortByMap[options.sort] || sortByMap.reciente;
      sql += ` ORDER BY ${orderClause}`;
    } else {
      sql += ' ORDER BY vr.evaluado_at DESC';
    }

    // Add pagination
    if (options.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);

      if (options.offset) {
        sql += ` OFFSET ?`;
        params.push(options.offset);
      }
    }

    return { sql, params };
  }
}

module.exports = ViabilityFilters;

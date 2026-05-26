/**
 * SearchFilters for Escandallo
 *
 * Provides SQL-safe filtering methods for escandallo queries.
 * Constructs WHERE clauses based on filter criteria.
 *
 * Supported filters:
 * - coste_min / coste_max: Cost range filtering
 * - tiene_alerta: Filter by alert presence
 * - desde_fecha / hasta_fecha: Date range filtering
 * - sin_precio: Filter escandallos with missing prices
 */

class SearchFilters {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Build WHERE clause and parameters from filter criteria
   *
   * @param {Object} criteria - Filter criteria
   * @returns {Object} { whereClause: string, params: array }
   */
  buildWhereClause(criteria = {}) {
    const conditions = [];
    const params = [];

    // Cost range filtering
    if (criteria.coste_min !== null && criteria.coste_min !== undefined) {
      conditions.push('e.coste_porcion >= ?');
      params.push(criteria.coste_min);
    }

    if (criteria.coste_max !== null && criteria.coste_max !== undefined) {
      conditions.push('e.coste_porcion <= ?');
      params.push(criteria.coste_max);
    }

    // Alert filtering
    if (criteria.tiene_alerta === true) {
      conditions.push('(SELECT COUNT(*) FROM escandallo_alerts WHERE escandallo_id = e.id) > 0');
    }

    if (criteria.tiene_alerta === false) {
      conditions.push('(SELECT COUNT(*) FROM escandallo_alerts WHERE escandallo_id = e.id) = 0');
    }

    // Unread alerts
    if (criteria.tiene_alerta_sin_leer === true) {
      conditions.push('(SELECT COUNT(*) FROM escandallo_alerts WHERE escandallo_id = e.id AND leida = 0) > 0');
    }

    // Date range filtering
    if (criteria.desde_fecha) {
      conditions.push('e.calculado_at >= ?');
      params.push(criteria.desde_fecha);
    }

    if (criteria.hasta_fecha) {
      conditions.push('e.calculado_at <= ?');
      params.push(criteria.hasta_fecha);
    }

    // Missing prices
    if (criteria.sin_precio === true) {
      conditions.push('e.notas LIKE ?');
      params.push('%Falta precio%');
    }

    // Recipe ID filter
    if (criteria.receta_id) {
      conditions.push('e.receta_id = ?');
      params.push(criteria.receta_id);
    }

    // Project ID (required safety check)
    if (criteria.proyecto_id) {
      conditions.push('e.proyecto_id = ?');
      params.push(criteria.proyecto_id);
    }

    const whereClause = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    return { whereClause, params };
  }

  /**
   * Validate filter criteria to prevent invalid queries
   */
  validate(criteria) {
    if (criteria.coste_min && criteria.coste_max && criteria.coste_min > criteria.coste_max) {
      this.logger.warn('search-filters.invalid_range', {
        coste_min: criteria.coste_min,
        coste_max: criteria.coste_max
      });
      return {
        valid: false,
        error: 'coste_min debe ser menor que coste_max'
      };
    }

    if (criteria.desde_fecha && criteria.hasta_fecha && criteria.desde_fecha > criteria.hasta_fecha) {
      this.logger.warn('search-filters.invalid_date_range', {
        desde_fecha: criteria.desde_fecha,
        hasta_fecha: criteria.hasta_fecha
      });
      return {
        valid: false,
        error: 'desde_fecha debe ser anterior a hasta_fecha'
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
        e.id,
        e.receta_id,
        e.proyecto_id,
        e.coste_total,
        e.coste_porcion,
        e.calculado_at,
        COUNT(CASE WHEN ea.leida = 0 THEN 1 END) as alertas_sin_leer,
        MAX(ea.porcentaje_cambio) as max_cambio_porcentaje
      FROM escandallo e
      LEFT JOIN escandallo_alerts ea ON e.id = ea.escandallo_id
      ${whereClause}
      GROUP BY e.id
    `;

    // Add sorting
    if (options.sort) {
      const sortByMap = {
        coste_asc: 'e.coste_porcion ASC',
        coste_desc: 'e.coste_porcion DESC',
        reciente: 'e.calculado_at DESC',
        antiguo: 'e.calculado_at ASC',
        alertas: 'alertas_sin_leer DESC'
      };

      const orderClause = sortByMap[options.sort] || sortByMap.reciente;
      sql += ` ORDER BY ${orderClause}`;
    } else {
      sql += ' ORDER BY e.calculado_at DESC';
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

module.exports = SearchFilters;

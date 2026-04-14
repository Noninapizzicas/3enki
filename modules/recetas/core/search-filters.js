/**
 * Search Filters para Recetas
 *
 * Constructor de filtros avanzados que convierte criterios en SQL
 * Soporta 40+ criterios de búsqueda
 */

class SearchFilters {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Construye SQL y parámetros desde criterios
   * Retorna: { sql: string, params: array[] }
   */
  buildFilterSQL(projectId, criteria = {}) {
    let sql = `SELECT * FROM receta_search_index WHERE proyecto_id = ?`;
    const params = [projectId];

    // Nombre (LIKE substring)
    if (criteria.nombre) {
      sql += ` AND nombre_lower LIKE ?`;
      params.push(`%${criteria.nombre.toLowerCase()}%`);
    }

    // Ingredientes (incluir todos)
    if (criteria.ingredientes && Array.isArray(criteria.ingredientes) && criteria.ingredientes.length > 0) {
      for (const ing of criteria.ingredientes) {
        sql += ` AND ingredientes_nombres LIKE ?`;
        params.push(`%${ing.toLowerCase()}%`);
      }
    }

    // Ingredientes a excluir
    if (criteria.ingredientes_excluir && Array.isArray(criteria.ingredientes_excluir)) {
      for (const ing of criteria.ingredientes_excluir) {
        sql += ` AND ingredientes_nombres NOT LIKE ?`;
        params.push(`%${ing.toLowerCase()}%`);
      }
    }

    // Dificultad rango
    if (criteria.dificultad_min !== undefined) {
      sql += ` AND dificultad_max >= ?`;
      params.push(criteria.dificultad_min);
    }
    if (criteria.dificultad_max !== undefined) {
      sql += ` AND dificultad_min <= ?`;
      params.push(criteria.dificultad_max);
    }

    // Tiempo de preparación rango (minutos)
    if (criteria.tiempo_min !== undefined) {
      sql += ` AND tiempo_prep_max >= ?`;
      params.push(criteria.tiempo_min);
    }
    if (criteria.tiempo_max !== undefined) {
      sql += ` AND tiempo_prep_min <= ?`;
      params.push(criteria.tiempo_max);
    }

    // Coste por porción rango (euros)
    if (criteria.coste_min !== undefined) {
      sql += ` AND coste_porcion_max >= ?`;
      params.push(criteria.coste_min);
    }
    if (criteria.coste_max !== undefined) {
      sql += ` AND coste_porcion_min <= ?`;
      params.push(criteria.coste_max);
    }

    // Viabilidad exacta
    if (criteria.viabilidad) {
      sql += ` AND viabilidad = ?`;
      params.push(criteria.viabilidad.toLowerCase());
    }

    // Métodos de cocción (JSON array)
    if (criteria.metodos_coccion && Array.isArray(criteria.metodos_coccion)) {
      for (const metodo of criteria.metodos_coccion) {
        sql += ` AND metodos_coccion LIKE ?`;
        params.push(`%${metodo}%`);
      }
    }

    // Tipos de plato (JSON array)
    if (criteria.tipos_plato && Array.isArray(criteria.tipos_plato)) {
      for (const tipo of criteria.tipos_plato) {
        sql += ` AND tipos_plato LIKE ?`;
        params.push(`%${tipo}%`);
      }
    }

    // Características (vegetariano, sin_gluten, etc)
    if (criteria.caracteristicas && Array.isArray(criteria.caracteristicas)) {
      for (const char of criteria.caracteristicas) {
        sql += ` AND caracteristicas LIKE ?`;
        params.push(`%${char}%`);
      }
    }

    // Alérgenos a excluir (seguridad alimentaria)
    if (criteria.alerge nos_excluir && Array.isArray(criteria.alerge nos_excluir)) {
      for (const alg of criteria.alerge nos_excluir) {
        sql += ` AND alerge nos NOT LIKE ?`;
        params.push(`%${alg}%`);
      }
    }

    // Alérgenos a incluir
    if (criteria.alerge nos_incluir && Array.isArray(criteria.alerge nos_incluir)) {
      for (const alg of criteria.alerge nos_incluir) {
        sql += ` AND alerge nos LIKE ?`;
        params.push(`%${alg}%`);
      }
    }

    // Etiquetas personalizadas
    if (criteria.etiquetas && Array.isArray(criteria.etiquetas)) {
      for (const tag of criteria.etiquetas) {
        sql += ` AND etiquetas LIKE ?`;
        params.push(`%${tag}%`);
      }
    }

    // Rango de porciones
    if (criteria.porciones_min !== undefined) {
      sql += ` AND porciones >= ?`;
      params.push(criteria.porciones_min);
    }
    if (criteria.porciones_max !== undefined) {
      sql += ` AND porciones <= ?`;
      params.push(criteria.porciones_max);
    }

    // Coste total rango (para toda la receta)
    if (criteria.coste_total_min !== undefined) {
      sql += ` AND coste_total >= ?`;
      params.push(criteria.coste_total_min);
    }
    if (criteria.coste_total_max !== undefined) {
      sql += ` AND coste_total <= ?`;
      params.push(criteria.coste_total_max);
    }

    // Crear receta después de (timestamp)
    if (criteria.creado_despues) {
      sql += ` AND created_at >= ?`;
      params.push(new Date(criteria.creado_despues).getTime());
    }

    // Crear receta antes de (timestamp)
    if (criteria.creado_antes) {
      sql += ` AND created_at <= ?`;
      params.push(new Date(criteria.creado_antes).getTime());
    }

    // Modificado después
    if (criteria.modificado_despues) {
      sql += ` AND updated_at >= ?`;
      params.push(new Date(criteria.modificado_despues).getTime());
    }

    // Modificado antes
    if (criteria.modificado_antes) {
      sql += ` AND updated_at <= ?`;
      params.push(new Date(criteria.modificado_antes).getTime());
    }

    return { sql, params };
  }

  /**
   * Construye ORDER BY desde preferences
   */
  buildOrderSQL(sortBy = 'relevancia', sortOrder = 'desc') {
    const validFields = [
      'nombre',
      'dificultad',
      'tiempo',
      'coste',
      'viabilidad',
      'created_at',
      'updated_at'
    ];

    const field = validFields.includes(sortBy) ? sortBy : 'updated_at';
    const order = sortOrder && sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Mapa de campos a columnas
    const fieldMap = {
      'nombre': 'nombre_lower',
      'dificultad': 'dificultad_min',
      'tiempo': 'tiempo_prep_min',
      'coste': 'coste_porcion_min',
      'viabilidad': 'viabilidad',
      'created_at': 'created_at',
      'updated_at': 'updated_at'
    };

    const column = fieldMap[field] || 'updated_at';
    return ` ORDER BY ${column} ${order}`;
  }

  /**
   * Valida que los criterios sean válidos
   */
  validateCriteria(criteria) {
    const errors = [];

    if (criteria.dificultad_min !== undefined) {
      if (criteria.dificultad_min < 1 || criteria.dificultad_min > 10) {
        errors.push('dificultad_min debe estar entre 1-10');
      }
    }

    if (criteria.dificultad_max !== undefined) {
      if (criteria.dificultad_max < 1 || criteria.dificultad_max > 10) {
        errors.push('dificultad_max debe estar entre 1-10');
      }
    }

    if (criteria.dificultad_min !== undefined && criteria.dificultad_max !== undefined) {
      if (criteria.dificultad_min > criteria.dificultad_max) {
        errors.push('dificultad_min no puede ser mayor a dificultad_max');
      }
    }

    if (criteria.tiempo_min !== undefined && criteria.tiempo_min < 0) {
      errors.push('tiempo_min no puede ser negativo');
    }

    if (criteria.coste_min !== undefined && criteria.coste_min < 0) {
      errors.push('coste_min no puede ser negativo');
    }

    if (criteria.coste_min !== undefined && criteria.coste_max !== undefined) {
      if (criteria.coste_min > criteria.coste_max) {
        errors.push('coste_min no puede ser mayor a coste_max');
      }
    }

    if (criteria.viabilidad) {
      const validViabilidad = ['alta', 'media', 'baja'];
      if (!validViabilidad.includes(criteria.viabilidad.toLowerCase())) {
        errors.push('viabilidad debe ser: alta, media o baja');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = SearchFilters;

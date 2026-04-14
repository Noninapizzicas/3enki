/**
 * Search Ranker para Recetas
 *
 * Algoritmo de puntuación multi-factor para ranking de resultados:
 * - Nombre match (40 puntos): exactitud de coincidencia
 * - Ingredientes (30 puntos): densidad de ingredientes buscados
 * - Coste (20 puntos): proximidad al rango de coste deseado
 * - Viabilidad (10 puntos): bonus por viabilidad alta
 * - Recency (5 puntos): bonus por recetas recientes
 *
 * Score final: 0-100+
 */

class SearchRanker {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Rankea un array de resultados
   * Retorna resultados ordenados por score descendente
   */
  rankResults(results, criteria = {}) {
    if (!Array.isArray(results) || results.length === 0) {
      return results;
    }

    // Calcular score para cada resultado
    const scored = results.map(result => ({
      ...result,
      _score: this._calculateScore(result, criteria)
    }));

    // Ordenar por score descendente
    return scored.sort((a, b) => b._score - a._score);
  }

  /**
   * Calcula score individual para un resultado
   */
  _calculateScore(result, criteria) {
    let score = 0;

    // 1. Nombre match (40 puntos máximo)
    if (criteria.nombre) {
      score += this._scoreNombreMatch(result.nombre, criteria.nombre);
    }

    // 2. Ingredientes (30 puntos máximo)
    if (criteria.ingredientes && Array.isArray(criteria.ingredientes) && criteria.ingredientes.length > 0) {
      score += this._scoreIngredientes(result, criteria.ingredientes);
    }

    // 3. Coste (20 puntos máximo)
    if (criteria.coste_min !== undefined || criteria.coste_max !== undefined) {
      score += this._scoreCoste(result, criteria.coste_min, criteria.coste_max);
    }

    // 4. Viabilidad (10 puntos máximo)
    if (criteria.viabilidad_bonus) {
      score += this._scoreViabilidad(result.viabilidad);
    }

    // 5. Recency (5 puntos máximo)
    score += this._scoreRecency(result.updated_at || result.created_at);

    return Math.round(score);
  }

  /**
   * Score por nombre: coincidencia exacta > prefijo > substring
   */
  _scoreNombreMatch(nombre, searchNombre) {
    const n = nombre.toLowerCase().trim();
    const s = searchNombre.toLowerCase().trim();

    // Coincidencia exacta: 40 puntos
    if (n === s) {
      return 40;
    }

    // Comienza con: 35 puntos
    if (n.startsWith(s)) {
      return 35;
    }

    // Palabra exacta en nombre: 30 puntos
    if (n.split(/\s+/).some(word => word === s)) {
      return 30;
    }

    // Contiene substring: escala según longitud relativa
    if (n.includes(s)) {
      const ratio = s.length / n.length;
      return Math.round(20 * ratio); // 0-20 puntos
    }

    return 0;
  }

  /**
   * Score por ingredientes: cuántos están presentes
   */
  _scoreIngredientes(result, searchIngredientes) {
    const ingredientesNombres = (result.ingredientes_nombres || '').toLowerCase();
    if (!ingredientesNombres) return 0;

    let matchCount = 0;
    for (const ing of searchIngredientes) {
      if (ingredientesNombres.includes(ing.toLowerCase())) {
        matchCount++;
      }
    }

    if (searchIngredientes.length === 0) return 0;

    // Proporción de ingredientes encontrados
    const ratio = matchCount / searchIngredientes.length;
    return Math.round(30 * ratio); // 0-30 puntos
  }

  /**
   * Score por coste: proximidad al rango deseado
   */
  _scoreCoste(result, cosceMin, costeMax) {
    const coste = result.coste_porcion_min || 0;

    // Si no hay límites, sin puntos
    if (cosceMin === undefined && costeMax === undefined) {
      return 0;
    }

    // Si está en el rango: 20 puntos
    if ((cosceMin === undefined || coste >= cosceMin) &&
        (costeMax === undefined || coste <= costeMax)) {
      return 20;
    }

    // Si está fuera, penalizar según distancia
    if (cosceMin !== undefined && coste < cosceMin) {
      const diff = cosceMin - coste;
      return Math.max(0, 20 - diff * 2); // Penaliza 2 puntos por euro
    }

    if (costeMax !== undefined && coste > costeMax) {
      const diff = coste - costeMax;
      return Math.max(0, 20 - diff * 2);
    }

    return 0;
  }

  /**
   * Score por viabilidad
   */
  _scoreViabilidad(viabilidad) {
    if (!viabilidad) return 0;

    switch (viabilidad.toLowerCase()) {
      case 'alta':
        return 10;
      case 'media':
        return 5;
      case 'baja':
        return 0;
      default:
        return 0;
    }
  }

  /**
   * Score por recency: recetas recientes bonus
   */
  _scoreRecency(updatedAt) {
    if (!updatedAt) return 0;

    const now = Date.now();
    const updated = new Date(updatedAt).getTime();
    const daysSince = (now - updated) / (1000 * 60 * 60 * 24);

    // Máximo 5 puntos por recency
    // Reduce 1 punto cada 7 días
    return Math.max(0, Math.round(5 - daysSince / 7));
  }
}

module.exports = SearchRanker;

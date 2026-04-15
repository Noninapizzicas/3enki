/**
 * Search Ranker for Viabilidad Receta
 *
 * Post-processes and ranks viability search results based on:
 * - Risk level (inviable vs viable)
 * - Improvement potential (how much better could it be)
 * - Margin health (absolute margin %)
 * - Stability (variance in viability)
 *
 * Scoring algorithm:
 * - Base score: 50 points
 * - Risk penalty: -10 to -50 (worse = lower score)
 * - Improvement bonus: +10 to +30 (potential = higher)
 * - Stability: +0 to +10 (consistency = higher)
 */

class ViabilityRanker {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Calculate risk score for a result
   * Higher score = better (less risky)
   */
  calculateRiskScore(result) {
    const estado = result.estado;

    // Estado scoring
    if (estado === 'VIABLE') return 40; // Best
    if (estado === 'ACEPTABLE') return 25; // Good
    if (estado === 'CRÍTICO') return 10; // Risky
    if (estado === 'INVIABLE') return -50; // Fail

    return 0;
  }

  /**
   * Calculate improvement potential
   * How much better could this recipe become?
   */
  calculateImprovementPotential(result) {
    let potential = 0;

    // If food cost can be reduced
    if (result.food_cost_porcentaje > 30) {
      const reduction = result.food_cost_porcentaje - 30;
      potential += Math.min(reduction, 15); // Cap at +15 points
    }

    // If margin can be increased
    if (result.margen_porcentaje < 25) {
      const increase = 25 - result.margen_porcentaje;
      potential += Math.min(increase / 2, 15); // Cap at +15 points
    }

    // If inviable, huge improvement potential
    if (result.estado === 'INVIABLE') {
      potential += 20;
    }

    return Math.min(potential, 30);
  }

  /**
   * Calculate stability score (consistency)
   * Placeholder - would need historical data
   */
  calculateStabilityScore(result) {
    // Currently 0 - would compare vs historical data
    return 0;
  }

  /**
   * Score a single result
   *
   * @param {Object} result - Viability result from database
   * @returns {Object} { score: number, breakdown: Object }
   */
  scoreResult(result) {
    const baseScore = 50;

    const riskScore = this.calculateRiskScore(result);
    const improvementScore = this.calculateImprovementPotential(result);
    const stabilityScore = this.calculateStabilityScore(result);

    const totalScore = Math.max(0, baseScore + riskScore + improvementScore + stabilityScore);

    return {
      score: totalScore,
      breakdown: {
        base: baseScore,
        riesgo: riskScore,
        mejora_potencial: improvementScore,
        estabilidad: stabilityScore
      }
    };
  }

  /**
   * Rank an array of results
   *
   * @param {Array} results - Array of viability results
   * @param {String} rankBy - 'relevance' (default), 'margen', 'riesgo', 'mejora'
   * @returns {Array} Ranked results with score metadata
   */
  rank(results, rankBy = 'relevance') {
    if (!Array.isArray(results)) return [];

    // Calculate scores
    const scored = results.map(r => ({
      ...r,
      _scoring: this.scoreResult(r)
    }));

    // Sort based on rankBy strategy
    switch (rankBy) {
      case 'relevance':
        // Higher score = more relevant (best condition + improvement potential)
        return scored.sort((a, b) => b._scoring.score - a._scoring.score);

      case 'margen':
        // By margin percentage (highest first)
        return scored.sort((a, b) => b.margen_porcentaje - a.margen_porcentaje);

      case 'margen_asc':
        // By margin percentage (lowest first - to fix)
        return scored.sort((a, b) => a.margen_porcentaje - b.margen_porcentaje);

      case 'riesgo':
        // Most risky first (to fix immediately)
        const estadoOrder = { 'INVIABLE': 0, 'CRÍTICO': 1, 'ACEPTABLE': 2, 'VIABLE': 3 };
        return scored.sort((a, b) => {
          const aOrder = estadoOrder[a.estado] ?? 99;
          const bOrder = estadoOrder[b.estado] ?? 99;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return a.margen_porcentaje - b.margen_porcentaje;
        });

      case 'mejora':
        // By improvement potential (highest potential first)
        return scored.sort((a, b) => b._scoring.breakdown.mejora_potencial - a._scoring.breakdown.mejora_potencial);

      case 'viable_first':
        // Viable recipes first (best for business)
        const viableOrder = { 'VIABLE': 0, 'ACEPTABLE': 1, 'CRÍTICO': 2, 'INVIABLE': 3 };
        return scored.sort((a, b) => {
          const aOrder = viableOrder[a.estado] ?? 99;
          const bOrder = viableOrder[b.estado] ?? 99;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return b.margen_porcentaje - a.margen_porcentaje;
        });

      default:
        return scored;
    }
  }

  /**
   * Get recipes by risk level
   *
   * @param {Array} results - Search results
   * @returns {Object} Grouped by estado
   */
  groupByEstado(results) {
    const grouped = {
      VIABLE: [],
      ACEPTABLE: [],
      CRÍTICO: [],
      INVIABLE: []
    };

    for (const result of results) {
      if (grouped[result.estado]) {
        grouped[result.estado].push(result);
      }
    }

    return grouped;
  }

  /**
   * Get recipes needing immediate action
   */
  getAtRisk(results) {
    return results.filter(r => r.estado === 'INVIABLE' || r.estado === 'CRÍTICO');
  }

  /**
   * Get improvement opportunities
   */
  getImprovementOpportunities(results, minPotential = 15) {
    const scored = results.map(r => ({
      ...r,
      _scoring: this.scoreResult(r)
    }));

    return scored
      .filter(r => r._scoring.breakdown.mejora_potencial >= minPotential)
      .sort((a, b) => b._scoring.breakdown.mejora_potencial - a._scoring.breakdown.mejora_potencial);
  }

  /**
   * Get summary statistics for results
   *
   * @param {Array} results - Search results
   * @returns {Object} Statistics
   */
  getSummary(results) {
    if (results.length === 0) {
      return {
        total: 0,
        viable: 0,
        aceptable: 0,
        critico: 0,
        inviable: 0,
        margen_promedio: 0,
        food_cost_promedio: 0,
        margen_min: 0,
        margen_max: 0
      };
    }

    const margenes = results.map(r => r.margen_porcentaje);
    const foodCosts = results.map(r => r.food_cost_porcentaje);

    const grouped = this.groupByEstado(results);

    return {
      total: results.length,
      viable: grouped.VIABLE.length,
      aceptable: grouped.ACEPTABLE.length,
      critico: grouped.CRÍTICO.length,
      inviable: grouped.INVIABLE.length,
      margen_promedio: this.round(margenes.reduce((a, b) => a + b, 0) / margenes.length),
      food_cost_promedio: this.round(foodCosts.reduce((a, b) => a + b, 0) / foodCosts.length),
      margen_min: this.round(Math.min(...margenes)),
      margen_max: this.round(Math.max(...margenes)),
      porcentaje_viable: this.round((grouped.VIABLE.length / results.length) * 100),
      porcentaje_riesgo: this.round(((grouped.CRÍTICO.length + grouped.INVIABLE.length) / results.length) * 100)
    };
  }

  round(n, decimals = 2) {
    const f = Math.pow(10, decimals);
    return Math.round(n * f) / f;
  }
}

module.exports = ViabilityRanker;

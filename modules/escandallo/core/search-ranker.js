/**
 * SearchRanker for Escandallo
 *
 * Post-processes and ranks escandallo search results based on:
 * - Anomaly severity (ingredients >30% cost, high price changes)
 * - Cost viability (food cost %, margin health)
 * - Freshness (recent calculations)
 * - Alert presence and urgency
 *
 * Scoring algorithm:
 * - Base score: 50 points
 * - Anomaly: +20-40 points (higher = more anomalies)
 * - High food cost: +10-20 points (warning indicator)
 * - Alerts: +5-15 points per unread alert
 * - Recency: 0-20 points (fresher = better)
 */

class SearchRanker {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Calculate anomaly score for a result
   * Higher score = more anomalies detected
   */
  calculateAnomalyScore(result) {
    let score = 0;

    // Check price snapshot for expensive ingredients
    if (result.precio_mercado_snapshot) {
      const snapshot = typeof result.precio_mercado_snapshot === 'string'
        ? JSON.parse(result.precio_mercado_snapshot)
        : result.precio_mercado_snapshot;

      if (snapshot && typeof snapshot === 'object') {
        let totalPrice = 0;
        const prices = Object.values(snapshot);

        for (const price of prices) {
          totalPrice += price;
        }

        // If any ingredient > 30% of total
        for (const price of prices) {
          if (totalPrice > 0 && (price / totalPrice) > 0.30) {
            score += 15; // High ingredient concentration
            break;
          }
        }
      }
    }

    // Check for unread alerts
    if (result.alertas_sin_leer && result.alertas_sin_leer > 0) {
      score += Math.min(result.alertas_sin_leer * 8, 30);
    }

    // Check for large price changes
    if (result.max_cambio_porcentaje && result.max_cambio_porcentaje > 20) {
      score += 20; // Significant price change
    }

    return score;
  }

  /**
   * Calculate recency score
   * Fresher calculations get higher scores
   */
  calculateRecencyScore(result) {
    const now = Date.now();
    const age = now - result.calculado_at; // milliseconds

    const dayMs = 24 * 60 * 60 * 1000;
    const weekMs = 7 * dayMs;

    // Scoring:
    // 0 days: 20 points (fresh)
    // 1-3 days: 15 points
    // 3-7 days: 10 points
    // 7-14 days: 5 points
    // > 14 days: 0 points

    if (age < dayMs) return 20;
    if (age < 3 * dayMs) return 15;
    if (age < weekMs) return 10;
    if (age < 2 * weekMs) return 5;
    return 0;
  }

  /**
   * Calculate alert urgency score
   * More unread alerts = higher urgency
   */
  calculateAlertScore(result) {
    if (!result.alertas_sin_leer || result.alertas_sin_leer === 0) {
      return 0;
    }

    // 1 unread: 5, 2-3: 10, 4+: 15
    if (result.alertas_sin_leer === 1) return 5;
    if (result.alertas_sin_leer <= 3) return 10;
    return 15;
  }

  /**
   * Score a single result
   *
   * @param {Object} result - Escandallo result from database
   * @returns {Object} { score: number, breakdown: Object }
   */
  scoreResult(result) {
    const baseScore = 50;

    const anomalyScore = this.calculateAnomalyScore(result);
    const recencyScore = this.calculateRecencyScore(result);
    const alertScore = this.calculateAlertScore(result);

    const totalScore = baseScore + anomalyScore + recencyScore + alertScore;

    return {
      score: totalScore,
      breakdown: {
        base: baseScore,
        anomalies: anomalyScore,
        recency: recencyScore,
        alerts: alertScore
      }
    };
  }

  /**
   * Rank an array of results
   *
   * @param {Array} results - Array of escandallo results
   * @param {String} rankBy - 'relevance' (default), 'cost', 'alerts', 'recent'
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
        // Higher score = more anomalies/alerts/urgency
        return scored.sort((a, b) => b._scoring.score - a._scoring.score);

      case 'cost':
        // Lowest cost first
        return scored.sort((a, b) => a.coste_porcion - b.coste_porcion);

      case 'cost_desc':
        // Highest cost first
        return scored.sort((a, b) => b.coste_porcion - a.coste_porcion);

      case 'alerts':
        // Most unread alerts first
        return scored.sort((a, b) => {
          const diffAlerts = (b.alertas_sin_leer || 0) - (a.alertas_sin_leer || 0);
          if (diffAlerts !== 0) return diffAlerts;
          return b._scoring.score - a._scoring.score;
        });

      case 'recent':
        // Newest first
        return scored.sort((a, b) => b.calculado_at - a.calculado_at);

      case 'old':
        // Oldest first
        return scored.sort((a, b) => a.calculado_at - b.calculado_at);

      default:
        return scored;
    }
  }

  /**
   * Get top anomalies from results
   *
   * @param {Array} results - Search results
   * @param {Integer} limit - Max number to return (default: 10)
   * @returns {Array} Top anomaly escandallos
   */
  getTopAnomalies(results, limit = 10) {
    return this.rank(results, 'relevance').slice(0, limit);
  }

  /**
   * Get cost-sorted results
   *
   * @param {Array} results - Search results
   * @param {String} direction - 'asc' (low to high) or 'desc' (high to low)
   * @returns {Array} Cost-sorted results
   */
  getByCost(results, direction = 'asc') {
    const rankBy = direction === 'desc' ? 'cost_desc' : 'cost';
    return this.rank(results, rankBy);
  }

  /**
   * Filter results by anomaly threshold
   *
   * @param {Array} results - Search results
   * @param {Integer} minScore - Minimum anomaly score
   * @returns {Array} Results with anomaly score >= minScore
   */
  filterByAnomalyScore(results, minScore = 20) {
    return results
      .map(r => ({
        ...r,
        _scoring: this._scoring || this.scoreResult(r)
      }))
      .filter(r => r._scoring.breakdown.anomalies >= minScore);
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
        coste_medio: 0,
        coste_min: 0,
        coste_max: 0,
        con_alertas: 0,
        alertas_totales: 0
      };
    }

    const costes = results.map(r => r.coste_porcion);
    const conAlertas = results.filter(r => (r.alertas_sin_leer || 0) > 0).length;
    const alertasTotal = results.reduce((sum, r) => sum + (r.alertas_sin_leer || 0), 0);

    return {
      total: results.length,
      coste_medio: this.round(costes.reduce((a, b) => a + b, 0) / costes.length),
      coste_min: this.round(Math.min(...costes)),
      coste_max: this.round(Math.max(...costes)),
      con_alertas: conAlertas,
      alertas_totales: alertasTotal,
      porcentaje_con_alertas: this.round((conAlertas / results.length) * 100)
    };
  }

  round(n, decimals = 2) {
    const f = Math.pow(10, decimals);
    return Math.round(n * f) / f;
  }
}

module.exports = SearchRanker;

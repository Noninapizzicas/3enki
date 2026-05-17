/**
 * SearchRanker Unit Tests
 *
 * Tests ranking and scoring logic:
 * - Anomaly detection scoring
 * - Recency scoring
 * - Alert scoring
 * - Ranking strategies
 * - Summary statistics
 */

const test = require('node:test');
const assert = require('node:assert');
const SearchRanker = require('../core/search-ranker');

const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
};

test('SearchRanker - Anomaly Scoring', async (t) => {
  const ranker = new SearchRanker(mockLogger);

  await t.test('should detect ingredient > 30% concentration', async () => {
    const result = {
      coste_total: 10.00,
      precio_mercado_snapshot: JSON.stringify({
        'jamón': 4.00,  // 40% > 30%
        'queso': 6.00
      }),
      alertas_sin_leer: 0,
      max_cambio_porcentaje: 0,
      calculado_at: Date.now()
    };

    const { breakdown } = ranker.scoreResult(result);
    assert.ok(breakdown.anomalies > 0, 'Should score anomaly for >30% ingredient');
  });

  await t.test('should score unread alerts', async () => {
    const result1 = {
      precio_mercado_snapshot: JSON.stringify({}),
      alertas_sin_leer: 0,
      max_cambio_porcentaje: 0,
      calculado_at: Date.now()
    };

    const result2 = {
      precio_mercado_snapshot: JSON.stringify({}),
      alertas_sin_leer: 3,
      max_cambio_porcentaje: 0,
      calculado_at: Date.now()
    };

    const score1 = ranker.scoreResult(result1);
    const score2 = ranker.scoreResult(result2);

    assert.ok(score2.breakdown.alerts > score1.breakdown.alerts);
  });

  await t.test('should score large price changes', async () => {
    const result = {
      precio_mercado_snapshot: JSON.stringify({}),
      alertas_sin_leer: 0,
      max_cambio_porcentaje: 25, // > 20%
      calculado_at: Date.now()
    };

    const { breakdown } = ranker.scoreResult(result);
    assert.ok(breakdown.anomalies > 0, 'Should score large price changes');
  });
});

test('SearchRanker - Recency Scoring', async (t) => {
  const ranker = new SearchRanker(mockLogger);

  await t.test('should score fresh calculations highest', async () => {
    const now = Date.now();

    const fresh = {
      precio_mercado_snapshot: JSON.stringify({}),
      alertas_sin_leer: 0,
      max_cambio_porcentaje: 0,
      calculado_at: now // Today
    };

    const old = {
      precio_mercado_snapshot: JSON.stringify({}),
      alertas_sin_leer: 0,
      max_cambio_porcentaje: 0,
      calculado_at: now - 30 * 24 * 60 * 60 * 1000 // 30 days ago
    };

    const freshScore = ranker.scoreResult(fresh);
    const oldScore = ranker.scoreResult(old);

    assert.ok(freshScore.breakdown.recency > oldScore.breakdown.recency);
  });

  await t.test('should score by time tiers', async () => {
    const baseTime = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    const scoreAt = (daysAgo) => {
      const result = {
        precio_mercado_snapshot: JSON.stringify({}),
        alertas_sin_leer: 0,
        max_cambio_porcentaje: 0,
        calculado_at: baseTime - daysAgo * oneDay
      };
      return ranker.calculateRecencyScore(result);
    };

    assert.ok(scoreAt(0) >= scoreAt(1)); // Today >= yesterday
    assert.ok(scoreAt(1) >= scoreAt(7)); // 1 day ago >= 7 days ago
    assert.ok(scoreAt(7) >= scoreAt(30)); // 7 days >= 30 days
  });
});

test('SearchRanker - Ranking Strategies', async (t) => {
  const ranker = new SearchRanker(mockLogger);

  const results = [
    {
      id: 'esc_1',
      coste_porcion: 5.00,
      alertas_sin_leer: 0,
      precio_mercado_snapshot: JSON.stringify({}),
      max_cambio_porcentaje: 0,
      calculado_at: Date.now()
    },
    {
      id: 'esc_2',
      coste_porcion: 3.00,
      alertas_sin_leer: 2,
      precio_mercado_snapshot: JSON.stringify({ 'jamón': 10 }),
      max_cambio_porcentaje: 25,
      calculado_at: Date.now() - 7 * 24 * 60 * 60 * 1000
    },
    {
      id: 'esc_3',
      coste_porcion: 8.00,
      alertas_sin_leer: 0,
      precio_mercado_snapshot: JSON.stringify({}),
      max_cambio_porcentaje: 0,
      calculado_at: Date.now()
    }
  ];

  await t.test('should rank by relevance (anomalies)', async () => {
    const ranked = ranker.rank(results, 'relevance');
    // esc_2 should be first (has alerts and price change)
    assert.strictEqual(ranked[0].id, 'esc_2');
  });

  await t.test('should rank by cost ascending', async () => {
    const ranked = ranker.rank(results, 'cost');
    assert.strictEqual(ranked[0].id, 'esc_2'); // 3.00 is lowest
    assert.strictEqual(ranked[ranked.length - 1].id, 'esc_3'); // 8.00 is highest
  });

  await t.test('should rank by cost descending', async () => {
    const ranked = ranker.rank(results, 'cost_desc');
    assert.strictEqual(ranked[0].id, 'esc_3'); // 8.00 is highest
    assert.strictEqual(ranked[ranked.length - 1].id, 'esc_2'); // 3.00 is lowest
  });

  await t.test('should rank by alerts', async () => {
    const ranked = ranker.rank(results, 'alerts');
    // esc_2 has 2 unread alerts, should be first
    assert.strictEqual(ranked[0].id, 'esc_2');
  });

  await t.test('should rank by recency', async () => {
    const ranked = ranker.rank(results, 'recent');
    // esc_1 and esc_3 are today, esc_2 is 7 days ago
    assert.ok(['esc_1', 'esc_3'].includes(ranked[0].id));
  });
});

test('SearchRanker - Filtering', async (t) => {
  const ranker = new SearchRanker(mockLogger);

  const results = [
    {
      coste_porcion: 2.00,
      precio_mercado_snapshot: JSON.stringify({}),
      alertas_sin_leer: 0,
      max_cambio_porcentaje: 5,
      calculado_at: Date.now()
    },
    {
      coste_porcion: 5.00,
      precio_mercado_snapshot: JSON.stringify({ 'jamón': 4 }), // 80%
      alertas_sin_leer: 0,
      max_cambio_porcentaje: 0,
      calculado_at: Date.now()
    },
    {
      coste_porcion: 7.00,
      precio_mercado_snapshot: JSON.stringify({ 'trufa': 6 }), // 86%
      alertas_sin_leer: 0,
      max_cambio_porcentaje: 25,
      calculado_at: Date.now()
    }
  ];

  await t.test('should filter by anomaly score', async () => {
    const filtered = ranker.filterByAnomalyScore(results, 20);
    // Only items with anomaly score >= 20
    assert.ok(filtered.length < results.length);
  });
});

test('SearchRanker - Summary Statistics', async (t) => {
  const ranker = new SearchRanker(mockLogger);

  const results = [
    {
      coste_porcion: 3.00,
      alertas_sin_leer: 0,
      precio_mercado_snapshot: JSON.stringify({}),
      max_cambio_porcentaje: 0,
      calculado_at: Date.now()
    },
    {
      coste_porcion: 5.00,
      alertas_sin_leer: 2,
      precio_mercado_snapshot: JSON.stringify({}),
      max_cambio_porcentaje: 0,
      calculado_at: Date.now()
    },
    {
      coste_porcion: 7.00,
      alertas_sin_leer: 0,
      precio_mercado_snapshot: JSON.stringify({}),
      max_cambio_porcentaje: 0,
      calculado_at: Date.now()
    }
  ];

  await t.test('should calculate summary statistics', async () => {
    const summary = ranker.getSummary(results);

    assert.strictEqual(summary.total, 3);
    assert.strictEqual(summary.coste_min, 3.00);
    assert.strictEqual(summary.coste_max, 7.00);
    assert.strictEqual(summary.coste_medio, 5.00); // (3+5+7)/3
    assert.strictEqual(summary.con_alertas, 1);
    assert.strictEqual(summary.alertas_totales, 2);
  });

  await t.test('should handle empty results', async () => {
    const summary = ranker.getSummary([]);
    assert.strictEqual(summary.total, 0);
    assert.strictEqual(summary.coste_medio, 0);
  });
});

console.log('SearchRanker tests completed');

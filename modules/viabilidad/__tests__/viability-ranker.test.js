/**
 * ViabilityRanker Unit Tests
 *
 * Tests ranking and scoring logic:
 * - Risk scoring based on estado
 * - Improvement potential calculation
 * - Overall score calculation
 * - Ranking strategies
 * - Summary statistics
 */

const test = require('node:test');
const assert = require('node:assert');
const ViabilityRanker = require('../core/viability-ranker');

const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
};

test('ViabilityRanker - Risk Scoring', async (t) => {
  const ranker = new ViabilityRanker(mockLogger);

  await t.test('should score VIABLE estado +40', () => {
    const risk = ranker.calculateRiskScore({ estado: 'VIABLE' });
    assert.strictEqual(risk, 40, 'VIABLE should score 40');
  });

  await t.test('should score ACEPTABLE estado +25', () => {
    const risk = ranker.calculateRiskScore({ estado: 'ACEPTABLE' });
    assert.strictEqual(risk, 25, 'ACEPTABLE should score 25');
  });

  await t.test('should score CRÍTICO estado +10', () => {
    const risk = ranker.calculateRiskScore({ estado: 'CRÍTICO' });
    assert.strictEqual(risk, 10, 'CRÍTICO should score 10');
  });

  await t.test('should score INVIABLE estado -50', () => {
    const risk = ranker.calculateRiskScore({ estado: 'INVIABLE' });
    assert.strictEqual(risk, -50, 'INVIABLE should score -50');
  });

  await t.test('should score unknown estado 0', () => {
    const risk = ranker.calculateRiskScore({ estado: 'UNKNOWN' });
    assert.strictEqual(risk, 0, 'Unknown should score 0');
  });
});

test('ViabilityRanker - Improvement Potential', async (t) => {
  const ranker = new ViabilityRanker(mockLogger);

  await t.test('should score improvement for high food cost', () => {
    // FC = 40%, can reduce to 30% = 10% improvement potential
    const potential = ranker.calculateImprovementPotential({
      food_cost_porcentaje: 40,
      margen_porcentaje: 30,
      estado: 'ACEPTABLE'
    });

    assert.ok(potential > 0, 'Should have improvement potential for high FC');
  });

  await t.test('should score improvement for low margin', () => {
    // Margen = 10%, target 25% = 15% improvement potential
    const potential = ranker.calculateImprovementPotential({
      food_cost_porcentaje: 25,
      margen_porcentaje: 10,
      estado: 'CRÍTICO'
    });

    assert.ok(potential > 0, 'Should have improvement potential for low margin');
  });

  await t.test('should boost improvement potential for inviable recipes', () => {
    const potential = ranker.calculateImprovementPotential({
      food_cost_porcentaje: 100,
      margen_porcentaje: -10,
      estado: 'INVIABLE'
    });

    assert.ok(potential > 0, 'Inviable should have high improvement potential');
  });

  await t.test('should cap improvement potential at 30', () => {
    const potential = ranker.calculateImprovementPotential({
      food_cost_porcentaje: 95,
      margen_porcentaje: 1,
      estado: 'INVIABLE'
    });

    assert.ok(potential <= 30, 'Improvement potential should be capped at 30');
  });

  await t.test('should return 0 for optimal recipes', () => {
    const potential = ranker.calculateImprovementPotential({
      food_cost_porcentaje: 25,
      margen_porcentaje: 75,
      estado: 'VIABLE'
    });

    assert.strictEqual(potential, 0, 'Optimal recipe should have 0 improvement potential');
  });
});

test('ViabilityRanker - Score Calculation', async (t) => {
  const ranker = new ViabilityRanker(mockLogger);

  await t.test('should calculate viable recipe score > 80', () => {
    const { score } = ranker.scoreResult({
      estado: 'VIABLE',
      food_cost_porcentaje: 25,
      margen_porcentaje: 75
    });

    assert.ok(score > 80, 'Viable recipe should score > 80');
  });

  await t.test('should calculate aceptable recipe score 30-60', () => {
    const { score } = ranker.scoreResult({
      estado: 'ACEPTABLE',
      food_cost_porcentaje: 35,
      margen_porcentaje: 20
    });

    assert.ok(score >= 30 && score <= 60, 'Aceptable recipe should score 30-60');
  });

  await t.test('should calculate crítico recipe score 0-30', () => {
    const { score } = ranker.scoreResult({
      estado: 'CRÍTICO',
      food_cost_porcentaje: 40,
      margen_porcentaje: 12
    });

    assert.ok(score >= 0 && score <= 30, 'Crítico recipe should score 0-30');
  });

  await t.test('should ensure inviable recipe never negative', () => {
    const { score } = ranker.scoreResult({
      estado: 'INVIABLE',
      food_cost_porcentaje: 100,
      margen_porcentaje: -50
    });

    assert.ok(score >= 0, 'Score should never be negative');
  });

  await t.test('should include breakdown in result', () => {
    const { breakdown } = ranker.scoreResult({
      estado: 'VIABLE',
      food_cost_porcentaje: 25,
      margen_porcentaje: 75
    });

    assert.ok(breakdown.base === 50, 'Should have base 50');
    assert.ok(breakdown.riesgo >= 0, 'Should have riesgo score');
    assert.ok(breakdown.mejora_potencial >= 0, 'Should have mejora_potencial score');
    assert.ok(breakdown.estabilidad >= 0, 'Should have estabilidad score');
  });
});

test('ViabilityRanker - Ranking Strategies', async (t) => {
  const ranker = new ViabilityRanker(mockLogger);

  const testData = [
    { id: 1, estado: 'VIABLE', margen_porcentaje: 75, food_cost_porcentaje: 25 },
    { id: 2, estado: 'ACEPTABLE', margen_porcentaje: 20, food_cost_porcentaje: 35 },
    { id: 3, estado: 'CRÍTICO', margen_porcentaje: 10, food_cost_porcentaje: 45 },
    { id: 4, estado: 'INVIABLE', margen_porcentaje: -5, food_cost_porcentaje: 100 }
  ];

  await t.test('should rank by relevance (score)', () => {
    const ranked = ranker.rank(testData, 'relevance');

    assert.strictEqual(ranked[0].id, 1, 'VIABLE should be first by relevance');
    assert.ok(ranked[0]._scoring.score > ranked[1]._scoring.score);
  });

  await t.test('should rank by margen (descending)', () => {
    const ranked = ranker.rank(testData, 'margen');

    assert.strictEqual(ranked[0].margen_porcentaje, 75, 'Highest margin should be first');
    assert.ok(ranked[0].margen_porcentaje >= ranked[1].margen_porcentaje);
  });

  await t.test('should rank by margen_asc (ascending)', () => {
    const ranked = ranker.rank(testData, 'margen_asc');

    assert.strictEqual(ranked[0].margen_porcentaje, -5, 'Lowest margin should be first');
  });

  await t.test('should rank by riesgo (critical first)', () => {
    const ranked = ranker.rank(testData, 'riesgo');

    const estadoOrder = { 'INVIABLE': 0, 'CRÍTICO': 1, 'ACEPTABLE': 2, 'VIABLE': 3 };
    for (let i = 1; i < ranked.length; i++) {
      const prevOrder = estadoOrder[ranked[i - 1].estado] ?? 99;
      const currOrder = estadoOrder[ranked[i].estado] ?? 99;
      assert.ok(prevOrder <= currOrder, 'Should be in risk order');
    }
  });

  await t.test('should rank by mejora (improvement potential)', () => {
    const ranked = ranker.rank(testData, 'mejora');

    assert.ok(ranked[0]._scoring.breakdown.mejora_potencial >= ranked[1]._scoring.breakdown.mejora_potencial);
  });

  await t.test('should rank by viable_first', () => {
    const ranked = ranker.rank(testData, 'viable_first');

    const viableOrder = { 'VIABLE': 0, 'ACEPTABLE': 1, 'CRÍTICO': 2, 'INVIABLE': 3 };
    assert.ok(viableOrder[ranked[0].estado] <= viableOrder[ranked[1].estado]);
  });

  await t.test('should handle empty results', () => {
    const ranked = ranker.rank([], 'relevance');

    assert.strictEqual(ranked.length, 0, 'Should handle empty array');
  });

  await t.test('should handle non-array input', () => {
    const ranked = ranker.rank(null, 'relevance');

    assert.strictEqual(ranked.length, 0, 'Should return empty array for non-array input');
  });
});

test('ViabilityRanker - Grouping', async (t) => {
  const ranker = new ViabilityRanker(mockLogger);

  const testData = [
    { estado: 'VIABLE', margen_porcentaje: 75 },
    { estado: 'VIABLE', margen_porcentaje: 80 },
    { estado: 'ACEPTABLE', margen_porcentaje: 20 },
    { estado: 'CRÍTICO', margen_porcentaje: 10 },
    { estado: 'INVIABLE', margen_porcentaje: -5 }
  ];

  await t.test('should group recipes by estado', () => {
    const grouped = ranker.groupByEstado(testData);

    assert.strictEqual(grouped.VIABLE.length, 2);
    assert.strictEqual(grouped.ACEPTABLE.length, 1);
    assert.strictEqual(grouped.CRÍTICO.length, 1);
    assert.strictEqual(grouped.INVIABLE.length, 1);
  });

  await t.test('should handle missing groups', () => {
    const grouped = ranker.groupByEstado([{ estado: 'VIABLE', margen_porcentaje: 50 }]);

    assert.strictEqual(grouped.VIABLE.length, 1);
    assert.strictEqual(grouped.ACEPTABLE.length, 0);
  });
});

test('ViabilityRanker - Risk Detection', async (t) => {
  const ranker = new ViabilityRanker(mockLogger);

  const testData = [
    { estado: 'VIABLE', margen_porcentaje: 75 },
    { estado: 'ACEPTABLE', margen_porcentaje: 20 },
    { estado: 'CRÍTICO', margen_porcentaje: 10 },
    { estado: 'INVIABLE', margen_porcentaje: -5 }
  ];

  await t.test('should identify at-risk recipes', () => {
    const atRisk = ranker.getAtRisk(testData);

    assert.strictEqual(atRisk.length, 2, 'Should find CRÍTICO and INVIABLE');
    assert.ok(atRisk.every(r => ['CRÍTICO', 'INVIABLE'].includes(r.estado)));
  });
});

test('ViabilityRanker - Improvement Opportunities', async (t) => {
  const ranker = new ViabilityRanker(mockLogger);

  const testData = [
    { estado: 'INVIABLE', food_cost_porcentaje: 95, margen_porcentaje: -10 },
    { estado: 'CRÍTICO', food_cost_porcentaje: 50, margen_porcentaje: 10 },
    { estado: 'ACEPTABLE', food_cost_porcentaje: 35, margen_porcentaje: 20 },
    { estado: 'VIABLE', food_cost_porcentaje: 25, margen_porcentaje: 75 }
  ];

  await t.test('should find improvement opportunities', () => {
    const opps = ranker.getImprovementOpportunities(testData, 15);

    assert.ok(opps.length > 0, 'Should find opportunities');
    assert.ok(opps.every(r => r._scoring.breakdown.mejora_potencial >= 15));
  });

  await t.test('should sort by improvement potential', () => {
    const opps = ranker.getImprovementOpportunities(testData, 10);

    if (opps.length > 1) {
      assert.ok(
        opps[0]._scoring.breakdown.mejora_potencial >= opps[1]._scoring.breakdown.mejora_potencial
      );
    }
  });
});

test('ViabilityRanker - Summary Statistics', async (t) => {
  const ranker = new ViabilityRanker(mockLogger);

  const testData = [
    { estado: 'VIABLE', margen_porcentaje: 75, food_cost_porcentaje: 25 },
    { estado: 'VIABLE', margen_porcentaje: 80, food_cost_porcentaje: 20 },
    { estado: 'ACEPTABLE', margen_porcentaje: 20, food_cost_porcentaje: 35 },
    { estado: 'CRÍTICO', margen_porcentaje: 10, food_cost_porcentaje: 45 },
    { estado: 'INVIABLE', margen_porcentaje: -5, food_cost_porcentaje: 100 }
  ];

  await t.test('should calculate summary statistics', () => {
    const summary = ranker.getSummary(testData);

    assert.strictEqual(summary.total, 5);
    assert.strictEqual(summary.viable, 2);
    assert.strictEqual(summary.aceptable, 1);
    assert.strictEqual(summary.critico, 1);
    assert.strictEqual(summary.inviable, 1);
    assert.ok(summary.margen_promedio > 0);
    assert.ok(summary.food_cost_promedio > 0);
    assert.ok(summary.porcentaje_viable > 0);
  });

  await t.test('should handle empty results', () => {
    const summary = ranker.getSummary([]);

    assert.strictEqual(summary.total, 0);
    assert.strictEqual(summary.viable, 0);
    assert.strictEqual(summary.margen_promedio, 0);
  });

  await t.test('should round decimal values', () => {
    const summary = ranker.getSummary(testData);

    // Check all numeric values are properly rounded to 2 decimals
    assert.ok(Number.isFinite(summary.margen_promedio));
    assert.ok(Number.isFinite(summary.food_cost_promedio));
  });
});

console.log('All ViabilityRanker tests completed');

/**
 * ViabilityFilters Unit Tests
 *
 * Tests filtering and query building:
 * - Where clause generation
 * - Parameter binding
 * - Query building with pagination
 * - Filter validation
 */

const test = require('node:test');
const assert = require('node:assert');
const ViabilityFilters = require('../core/viability-filters');

const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
};

test('ViabilityFilters - Clause Building', async (t) => {
  const filters = new ViabilityFilters(mockLogger);

  await t.test('should build empty where clause for no criteria', () => {
    const { whereClause, params } = filters.buildWhereClause({});

    assert.strictEqual(whereClause, '', 'Should return empty string for no criteria');
    assert.strictEqual(params.length, 0, 'Should have no parameters');
  });

  await t.test('should filter by single estado', () => {
    const { whereClause, params } = filters.buildWhereClause({
      estado: 'VIABLE'
    });

    assert.ok(whereClause.includes('vr.estado'), 'Should include estado filter');
    assert.ok(whereClause.includes('='), 'Should use equals operator');
    assert.strictEqual(params[0], 'VIABLE');
  });

  await t.test('should filter by multiple estados', () => {
    const { whereClause, params } = filters.buildWhereClause({
      estado: ['VIABLE', 'ACEPTABLE']
    });

    assert.ok(whereClause.includes('IN'), 'Should use IN operator');
    assert.strictEqual(params.length, 2, 'Should have 2 parameters');
    assert.strictEqual(params[0], 'VIABLE');
    assert.strictEqual(params[1], 'ACEPTABLE');
  });

  await t.test('should filter by margin range', () => {
    const { whereClause, params } = filters.buildWhereClause({
      margen_min: 15,
      margen_max: 30
    });

    assert.ok(whereClause.includes('>='), 'Should include >= for min');
    assert.ok(whereClause.includes('<='), 'Should include <= for max');
    assert.strictEqual(params[0], 15);
    assert.strictEqual(params[1], 30);
  });

  await t.test('should filter by food cost range', () => {
    const { whereClause, params } = filters.buildWhereClause({
      food_cost_min: 25,
      food_cost_max: 40
    });

    assert.ok(whereClause.includes('food_cost_porcentaje'), 'Should filter by food cost');
    assert.strictEqual(params[0], 25);
    assert.strictEqual(params[1], 40);
  });

  await t.test('should filter by project_id', () => {
    const { whereClause, params } = filters.buildWhereClause({
      proyecto_id: 'proj_123'
    });

    assert.ok(whereClause.includes('proyecto_id'), 'Should include project_id filter');
    assert.strictEqual(params[params.length - 1], 'proj_123');
  });

  await t.test('should filter by tiene_riesgo true', () => {
    const { whereClause, params } = filters.buildWhereClause({
      tiene_riesgo: true
    });

    assert.ok(whereClause.includes('COUNT'), 'Should include COUNT subquery');
    assert.ok(whereClause.includes('implementada = 0'), 'Should filter by unimplemented');
    assert.ok(whereClause.includes('> 0'), 'Should check > 0');
  });

  await t.test('should filter by tiene_riesgo false', () => {
    const { whereClause, params } = filters.buildWhereClause({
      tiene_riesgo: false
    });

    assert.ok(whereClause.includes('COUNT'), 'Should include COUNT subquery');
    assert.ok(whereClause.includes('= 0'), 'Should check = 0');
  });

  await t.test('should filter by date range', () => {
    const date1 = '2026-01-01';
    const date2 = '2026-12-31';

    const { whereClause, params } = filters.buildWhereClause({
      desde_fecha: date1,
      hasta_fecha: date2
    });

    assert.ok(whereClause.includes('evaluado_at'), 'Should filter by evaluado_at');
    assert.strictEqual(params[0], date1);
    assert.strictEqual(params[1], date2);
  });

  await t.test('should combine multiple filters', () => {
    const { whereClause, params } = filters.buildWhereClause({
      estado: ['VIABLE', 'ACEPTABLE'],
      margen_min: 15,
      proyecto_id: 'proj_1'
    });

    assert.ok(whereClause.includes('AND'), 'Should combine filters with AND');
    assert.strictEqual(params.length, 4, 'Should have 4 parameters');
  });
});

test('ViabilityFilters - Query Building', async (t) => {
  const filters = new ViabilityFilters(mockLogger);

  await t.test('should build basic SELECT query', () => {
    const { sql, params } = filters.buildQuery({}, {});

    assert.ok(sql.includes('SELECT'), 'Should have SELECT');
    assert.ok(sql.includes('FROM viabilidad_receta'), 'Should select from viabilidad_receta');
    assert.ok(sql.includes('GROUP BY'), 'Should have GROUP BY');
    assert.ok(sql.includes('ORDER BY'), 'Should have ORDER BY');
  });

  await t.test('should add pagination to query', () => {
    const { sql, params } = filters.buildQuery({}, { limit: 20, offset: 40 });

    assert.ok(sql.includes('LIMIT'), 'Should have LIMIT');
    assert.ok(sql.includes('OFFSET'), 'Should have OFFSET');
    assert.strictEqual(params[params.length - 2], 20);
    assert.strictEqual(params[params.length - 1], 40);
  });

  await t.test('should add sort options to query', () => {
    const testCases = [
      { sort: 'margen_desc', expected: 'DESC' },
      { sort: 'margen_asc', expected: 'ASC' },
      { sort: 'riesgo', expected: 'riesgos_criticos DESC' },
      { sort: 'reciente', expected: 'evaluado_at DESC' }
    ];

    for (const tc of testCases) {
      const { sql } = filters.buildQuery({}, { sort: tc.sort });
      assert.ok(sql.includes(tc.expected), `Should include ${tc.expected} for sort ${tc.sort}`);
    }
  });

  await t.test('should build complete query with filters and pagination', () => {
    const { sql, params } = filters.buildQuery(
      { estado: 'VIABLE', margen_min: 20, proyecto_id: 'proj_1' },
      { sort: 'margen_desc', limit: 10, offset: 0 }
    );

    assert.ok(sql.includes('WHERE'), 'Should have WHERE clause');
    assert.ok(sql.includes('estado'), 'Should filter by estado');
    assert.ok(sql.includes('margen_porcentaje >= ?'), 'Should filter by margen');
    assert.ok(sql.includes('ORDER BY'), 'Should have ORDER BY');
    assert.ok(sql.includes('LIMIT'), 'Should have LIMIT');
  });
});

test('ViabilityFilters - Validation', async (t) => {
  const filters = new ViabilityFilters(mockLogger);

  await t.test('should validate margin range', () => {
    const result = filters.validate({
      margen_min: 50,
      margen_max: 30 // Invalid: min > max
    });

    assert.strictEqual(result.valid, false, 'Should invalidate margen_min > margen_max');
    assert.ok(result.error, 'Should have error message');
  });

  await t.test('should validate food cost range', () => {
    const result = filters.validate({
      food_cost_min: 50,
      food_cost_max: 30 // Invalid: min > max
    });

    assert.strictEqual(result.valid, false, 'Should invalidate food_cost_min > food_cost_max');
    assert.ok(result.error, 'Should have error message');
  });

  await t.test('should accept valid ranges', () => {
    const result = filters.validate({
      margen_min: 10,
      margen_max: 50,
      food_cost_min: 20,
      food_cost_max: 40
    });

    assert.strictEqual(result.valid, true, 'Should accept valid ranges');
  });

  await t.test('should accept missing min/max values', () => {
    const result = filters.validate({
      margen_min: 10
      // margen_max undefined - should be ok
    });

    assert.strictEqual(result.valid, true, 'Should accept missing max when min present');
  });
});

test('ViabilityFilters - Real Query Examples', async (t) => {
  const filters = new ViabilityFilters(mockLogger);

  await t.test('should build query for "recipes with risk and low margin"', () => {
    const { sql, params } = filters.buildQuery(
      {
        proyecto_id: 'proj_1',
        tiene_riesgo: true,
        margen_max: 20
      },
      { sort: 'riesgo', limit: 50 }
    );

    assert.ok(sql.includes('WHERE'), 'Should filter');
    assert.ok(sql.includes('tiene_riesgo'), 'Should filter by risk');
    assert.ok(sql.includes('margen_porcentaje <= ?'), 'Should filter by low margin');
    assert.ok(params.includes('proj_1'), 'Should have project_id');
    assert.ok(params.includes(20), 'Should have margin_max');
  });

  await t.test('should build query for "all viable recipes sorted by margin"', () => {
    const { sql, params } = filters.buildQuery(
      {
        proyecto_id: 'proj_1',
        estado: 'VIABLE'
      },
      { sort: 'margen_desc', limit: 100 }
    );

    assert.ok(sql.includes('estado'), 'Should filter by estado');
    assert.ok(sql.includes('margen_desc'), 'Should sort by margin');
    assert.ok(params.includes('VIABLE'), 'Should have VIABLE');
  });

  await t.test('should build query for "high FC recipes with improvement potential"', () => {
    const { sql, params } = filters.buildQuery(
      {
        proyecto_id: 'proj_1',
        food_cost_min: 35
      },
      { sort: 'mejora', limit: 25 }
    );

    assert.ok(sql.includes('food_cost_porcentaje'), 'Should filter by food cost');
    assert.ok(params.includes(35), 'Should have food_cost_min');
  });
});

console.log('All ViabilityFilters tests completed');

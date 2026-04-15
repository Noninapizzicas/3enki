/**
 * SearchFilters Unit Tests
 *
 * Tests filtering logic:
 * - Cost range filtering
 * - Date range filtering
 * - Alert filtering
 * - Query building
 */

const test = require('node:test');
const assert = require('node:assert');
const SearchFilters = require('../core/search-filters');

const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
};

test('SearchFilters - WHERE Clause Building', async (t) => {
  const filters = new SearchFilters(mockLogger);

  await t.test('should build cost range filter', async () => {
    const { whereClause, params } = filters.buildWhereClause({
      coste_min: 3.50,
      coste_max: 8.00,
      proyecto_id: 'proj_1'
    });

    assert.ok(whereClause.includes('coste_porcion >= ?'));
    assert.ok(whereClause.includes('coste_porcion <= ?'));
    assert.ok(whereClause.includes('proyecto_id = ?'));
    assert.deepStrictEqual(params, [3.50, 8.00, 'proj_1']);
  });

  await t.test('should build alert filter', async () => {
    const { whereClause, params } = filters.buildWhereClause({
      tiene_alerta: true,
      proyecto_id: 'proj_1'
    });

    assert.ok(whereClause.includes('escandallo_alerts'));
    assert.ok(whereClause.includes('> 0'));
  });

  await t.test('should build unread alert filter', async () => {
    const { whereClause, params } = filters.buildWhereClause({
      tiene_alerta_sin_leer: true,
      proyecto_id: 'proj_1'
    });

    assert.ok(whereClause.includes('leida = 0'));
  });

  await t.test('should build date range filter', async () => {
    const start = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const end = Date.now();

    const { whereClause, params } = filters.buildWhereClause({
      desde_fecha: start,
      hasta_fecha: end,
      proyecto_id: 'proj_1'
    });

    assert.ok(whereClause.includes('calculado_at >= ?'));
    assert.ok(whereClause.includes('calculado_at <= ?'));
    assert.ok(params.includes(start));
    assert.ok(params.includes(end));
  });

  await t.test('should handle empty criteria', async () => {
    const { whereClause, params } = filters.buildWhereClause({});
    assert.strictEqual(whereClause, '');
    assert.deepStrictEqual(params, []);
  });
});

test('SearchFilters - Validation', async (t) => {
  const filters = new SearchFilters(mockLogger);

  await t.test('should reject invalid cost range', async () => {
    const validation = filters.validate({
      coste_min: 8.00,
      coste_max: 3.50 // Min > Max
    });

    assert.strictEqual(validation.valid, false);
  });

  await t.test('should accept valid cost range', async () => {
    const validation = filters.validate({
      coste_min: 3.50,
      coste_max: 8.00
    });

    assert.strictEqual(validation.valid, true);
  });

  await t.test('should reject invalid date range', async () => {
    const start = Date.now();
    const end = start - 1000; // End before start

    const validation = filters.validate({
      desde_fecha: start,
      hasta_fecha: end
    });

    assert.strictEqual(validation.valid, false);
  });
});

test('SearchFilters - Query Building', async (t) => {
  const filters = new SearchFilters(mockLogger);

  await t.test('should build complete query with sorting', async () => {
    const { sql, params } = filters.buildQuery(
      {
        coste_min: 3.50,
        proyecto_id: 'proj_1'
      },
      {
        sort: 'coste_asc',
        limit: 20
      }
    );

    assert.ok(sql.includes('SELECT'));
    assert.ok(sql.includes('ORDER BY'));
    assert.ok(sql.includes('coste_porcion ASC'));
    assert.ok(sql.includes('LIMIT ?'));
    assert.strictEqual(params[params.length - 1], 20);
  });

  await t.test('should support all sort options', async () => {
    const sortOptions = ['coste_asc', 'coste_desc', 'reciente', 'antiguo', 'alertas'];

    for (const sort of sortOptions) {
      const { sql } = filters.buildQuery({ proyecto_id: 'proj_1' }, { sort });
      assert.ok(sql.includes('ORDER BY'), `Sort option "${sort}" should build valid query`);
    }
  });

  await t.test('should build query with pagination', async () => {
    const { sql, params } = filters.buildQuery(
      { proyecto_id: 'proj_1' },
      { limit: 50, offset: 100 }
    );

    const limitIndex = params.indexOf(50);
    const offsetIndex = params.indexOf(100);

    assert.ok(limitIndex >= 0, 'Should include limit parameter');
    assert.ok(offsetIndex > limitIndex, 'Should include offset after limit');
  });

  await t.test('should default to reciente sort', async () => {
    const { sql } = filters.buildQuery({ proyecto_id: 'proj_1' });
    assert.ok(sql.includes('calculado_at DESC'));
  });
});

console.log('SearchFilters tests completed');

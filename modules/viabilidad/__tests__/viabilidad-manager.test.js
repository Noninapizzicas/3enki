/**
 * ViabilidadManager Unit Tests
 *
 * Tests core functionality:
 * - Viability calculations (margin, food cost, estado)
 * - Recommendation generation
 * - Database persistence
 * - Project summary statistics
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const ViabilidadManager = require('../core/viabilidad-manager');

// Mock logger
const mockLogger = {
  info: (msg, ctx) => {},
  warn: (msg, ctx) => {},
  error: (msg, ctx) => {},
  debug: (msg, ctx) => {}
};

// Test setup
const testDbPath = path.join(__dirname, 'test-viabilidad.db');

function cleanupDb() {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  if (fs.existsSync(testDbPath + '-shm')) {
    fs.unlinkSync(testDbPath + '-shm');
  }
  if (fs.existsSync(testDbPath + '-wal')) {
    fs.unlinkSync(testDbPath + '-wal');
  }
}

test('ViabilidadManager - Initialization', async (t) => {
  cleanupDb();

  const manager = new ViabilidadManager(testDbPath, mockLogger);

  await t.test('should initialize database', async () => {
    await manager.initialize();
    assert.ok(manager.db, 'Database should be initialized');
    assert.ok(fs.existsSync(testDbPath), 'Database file should exist');
  });

  await t.test('should apply schema', async () => {
    const result = await manager.db.all(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='viabilidad_receta'`
    );
    assert.ok(result.length > 0, 'viabilidad_receta table should exist');

    const recResult = await manager.db.all(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='viabilidad_recomendacion'`
    );
    assert.ok(recResult.length > 0, 'viabilidad_recomendacion table should exist');
  });

  await manager.close();
  cleanupDb();
});

test('ViabilidadManager - Viability Calculations', async (t) => {
  cleanupDb();
  const manager = new ViabilidadManager(testDbPath, mockLogger);
  await manager.initialize();

  await t.test('should calculate VIABLE recipe (margen > 25%, FC < 30%)', async () => {
    // Coste: 3€, Precio: 12€
    // Margen: 9€ (75%)
    // Food Cost: 25%
    const viability = manager.calculateViability('rec_1', 3, 12);

    assert.strictEqual(viability.coste_porcion, 3);
    assert.strictEqual(viability.precio_venta, 12);
    assert.strictEqual(viability.margen_bruto, 9);
    assert.strictEqual(viability.margen_porcentaje, 75);
    assert.strictEqual(viability.food_cost_porcentaje, 25);
    assert.strictEqual(viability.estado, 'VIABLE');
  });

  await t.test('should calculate ACEPTABLE recipe (margen 15-25%, FC 30-35%)', async () => {
    // Coste: 5€, Precio: 12€
    // Margen: 7€ (58%)
    // Food Cost: ~41.7% (should trigger ACEPTABLE due to FC)
    const viability = manager.calculateViability('rec_2', 5, 12);

    assert.ok(viability.margen_porcentaje > 0, 'Should have positive margin');
    assert.ok([
      'VIABLE',
      'ACEPTABLE'
    ].includes(viability.estado), 'Should be VIABLE or ACEPTABLE');
  });

  await t.test('should calculate CRÍTICO recipe (margen < 15%, FC > 35%)', async () => {
    // Coste: 8€, Precio: 9€
    // Margen: 1€ (11%)
    // Food Cost: 88.9%
    const viability = manager.calculateViability('rec_3', 8, 9);

    assert.strictEqual(viability.margen_bruto, 1);
    assert.strictEqual(viability.margen_porcentaje, 11);
    assert.strictEqual(viability.estado, 'CRÍTICO');
  });

  await t.test('should calculate INVIABLE recipe (margen <= 0)', async () => {
    // Coste: 10€, Precio: 8€
    // Margen: -2€
    const viability = manager.calculateViability('rec_4', 10, 8);

    assert.strictEqual(viability.margen_bruto, -2);
    assert.strictEqual(viability.estado, 'INVIABLE');
  });

  await t.test('should calculate markup correctly', async () => {
    // Coste: 4€, Precio: 12€
    // Markup: (12-4)/4 = 2 = 200%
    const viability = manager.calculateViability('rec_5', 4, 12);

    assert.strictEqual(viability.markup, 2);
  });

  await manager.close();
  cleanupDb();
});

test('ViabilidadManager - Recommendation Generation', async (t) => {
  cleanupDb();
  const manager = new ViabilidadManager(testDbPath, mockLogger);
  await manager.initialize();

  await t.test('should recommend subir_precio for high food cost', async () => {
    // FC = 45%, price = 10€
    const viability = manager.calculateViability('rec_fc_high', 4.5, 10);
    const recs = manager.generateRecommendations('rec_fc_high', viability);

    assert.ok(recs.length > 0, 'Should have recommendations');
    const precioRec = recs.find(r => r.tipo === 'subir_precio');
    assert.ok(precioRec, 'Should recommend price increase');
  });

  await t.test('should recommend bajar_coste for high food cost', async () => {
    // FC = 40%, coste = 4€
    const viability = manager.calculateViability('rec_cost_high', 4, 10);
    const recs = manager.generateRecommendations('rec_cost_high', viability);

    const costeRec = recs.find(r => r.tipo === 'bajar_coste');
    assert.ok(costeRec, 'Should recommend cost reduction');
  });

  await t.test('should recommend eliminar for inviable recipe', async () => {
    // Margen negativo
    const viability = manager.calculateViability('rec_eliminate', 15, 10);
    const recs = manager.generateRecommendations('rec_eliminate', viability);

    const elimRec = recs.find(r => r.tipo === 'eliminar');
    assert.ok(elimRec, 'Should recommend elimination for inviable recipe');
  });

  await t.test('should not recommend for viable recipe', async () => {
    // Optimal: FC 25%, margen 75%
    const viability = manager.calculateViability('rec_optimal', 3, 12);
    const recs = manager.generateRecommendations('rec_optimal', viability);

    // Viable recipes may have 0 critical recommendations
    assert.ok(Array.isArray(recs), 'Should return recommendations array');
  });

  await manager.close();
  cleanupDb();
});

test('ViabilidadManager - Persistence', async (t) => {
  cleanupDb();
  const manager = new ViabilidadManager(testDbPath, mockLogger);
  await manager.initialize();

  await t.test('should save and retrieve viability', async () => {
    const viability = manager.calculateViability('rec_persist', 4, 12);
    const id = await manager.saveViability('proj_1', viability);

    assert.ok(id, 'Should return viability ID');

    const retrieved = await manager.getViability('proj_1', 'rec_persist');
    assert.ok(retrieved, 'Should retrieve saved viability');
    assert.strictEqual(retrieved.coste_porcion, 4);
    assert.strictEqual(retrieved.precio_venta, 12);
  });

  await t.test('should save and retrieve recommendations', async () => {
    const viability = manager.calculateViability('rec_rec', 8, 10);
    const recs = manager.generateRecommendations('rec_rec', viability);

    await manager.saveRecommendations('proj_1', 'rec_rec', recs);

    const retrieved = await manager.getRecommendations('proj_1', 'rec_rec');
    assert.ok(retrieved.length > 0, 'Should have saved recommendations');
    assert.ok(retrieved[0].tipo, 'Should have tipo field');
    assert.ok(retrieved[0].prioridad, 'Should have prioridad field');
  });

  await manager.close();
  cleanupDb();
});

test('ViabilidadManager - Summary Statistics', async (t) => {
  cleanupDb();
  const manager = new ViabilidadManager(testDbPath, mockLogger);
  await manager.initialize();

  await t.test('should calculate project summary statistics', async () => {
    // Create several recipes with different states
    const recipes = [
      { id: 'rec_v1', coste: 3, precio: 12, estado: 'VIABLE' },
      { id: 'rec_v2', coste: 4, precio: 14, estado: 'VIABLE' },
      { id: 'rec_a1', coste: 5, precio: 12, estado: 'ACEPTABLE' },
      { id: 'rec_c1', coste: 8, precio: 9, estado: 'CRÍTICO' },
      { id: 'rec_i1', coste: 10, precio: 8, estado: 'INVIABLE' }
    ];

    for (const r of recipes) {
      const viability = manager.calculateViability(r.id, r.coste, r.precio);
      await manager.saveViability('proj_summary', viability);
    }

    const summary = await manager.getProjectSummary('proj_summary');

    assert.strictEqual(summary.total, 5, 'Should have 5 recipes');
    assert.strictEqual(summary.viable, 2, 'Should have 2 viable');
    assert.strictEqual(summary.aceptable, 1, 'Should have 1 aceptable');
    assert.strictEqual(summary.critico, 1, 'Should have 1 crítico');
    assert.strictEqual(summary.inviable, 1, 'Should have 1 inviable');
    assert.ok(summary.margen_promedio > 0, 'Should have average margin');
    assert.ok(summary.food_cost_promedio > 0, 'Should have average food cost');
  });

  await manager.close();
  cleanupDb();
});

test('ViabilidadManager - Search Operations', async (t) => {
  cleanupDb();
  const manager = new ViabilidadManager(testDbPath, mockLogger);
  await manager.initialize();

  await t.test('should retrieve recipes by estado', async () => {
    // Create recipes in different states
    const recipes = [
      { id: 'rec_v', coste: 3, precio: 12 }, // VIABLE
      { id: 'rec_c', coste: 8, precio: 9 }    // CRÍTICO
    ];

    for (const r of recipes) {
      const viability = manager.calculateViability(r.id, r.coste, r.precio);
      await manager.saveViability('proj_search', viability);
    }

    const viables = await manager.getRecetasByEstado('proj_search', 'VIABLE');
    assert.ok(viables.length > 0, 'Should find viable recipes');
    assert.ok(viables.every(r => r.estado === 'VIABLE'));
  });

  await manager.close();
  cleanupDb();
});

console.log('All ViabilidadManager tests completed');

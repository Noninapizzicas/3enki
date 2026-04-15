/**
 * EscandalloManager Unit Tests
 *
 * Tests core functionality:
 * - Cost calculations
 * - Database persistence
 * - Alert detection
 * - Historical data access
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const EscandalloManager = require('../core/escandallo-manager');

// Mock logger
const mockLogger = {
  info: (msg, ctx) => console.log(`[INFO] ${msg}`, ctx),
  warn: (msg, ctx) => console.warn(`[WARN] ${msg}`, ctx),
  error: (msg, ctx) => console.error(`[ERROR] ${msg}`, ctx),
  debug: (msg, ctx) => {}
};

// Test setup
const testDbPath = path.join(__dirname, 'test-escandallo.db');

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

test('EscandalloManager - Initialization', async (t) => {
  cleanupDb();

  const manager = new EscandalloManager(testDbPath, mockLogger);

  await t.test('should initialize database', async () => {
    await manager.initialize();
    assert.ok(manager.db, 'Database should be initialized');
    assert.ok(fs.existsSync(testDbPath), 'Database file should exist');
  });

  await t.test('should apply schema', async () => {
    // Should not throw
    const result = await manager.db.all(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='escandallo'`
    );
    assert.ok(result.length > 0, 'escandallo table should exist');
  });

  await manager.close();
  cleanupDb();
});

test('EscandalloManager - Cost Calculations', async (t) => {
  cleanupDb();
  const manager = new EscandalloManager(testDbPath, mockLogger);
  await manager.initialize();

  await t.test('should calculate correct total cost', async () => {
    const receta = {
      id: 'rec_test_1',
      nombre: 'Pasta Carbonara',
      porciones: 4,
      ingredientes: [
        { nombre: 'pasta', cantidad: 400, unidad: 'g' },
        { nombre: 'huevo', cantidad: 3, unidad: 'ud' },
        { nombre: 'jamón', cantidad: 200, unidad: 'g' }
      ]
    };

    const preciosMercado = {
      'pasta': 1.20,
      'huevo': 0.50,
      'jamón': 8.50
    };

    const calc = await manager.calculateEscandallo('rec_test_1', receta, preciosMercado);

    // Total: 1.20 + 0.50 + 8.50 = 10.20€
    assert.strictEqual(calc.coste_total, 10.20, 'Total cost should be 10.20€');
    // Per portion: 10.20 / 4 = 2.55€
    assert.strictEqual(calc.coste_porcion, 2.55, 'Cost per portion should be 2.55€');
  });

  await t.test('should handle unit conversions', async () => {
    // Test g → kg conversion (divide by 1000)
    const receta = {
      id: 'rec_test_2',
      nombre: 'Test Recipe',
      porciones: 1,
      ingredientes: [
        { nombre: 'tomate', cantidad: 500, unidad: 'g' } // 0.5 kg
      ]
    };

    const preciosMercado = {
      'tomate': 2.00 // €/kg
    };

    const calc = await manager.calculateEscandallo('rec_test_2', receta, preciosMercado);
    // 0.5 kg * 2.00 €/kg = 1.00€
    assert.strictEqual(calc.coste_total, 1.00);
  });

  await manager.close();
  cleanupDb();
});

test('EscandalloManager - Persistence', async (t) => {
  cleanupDb();
  const manager = new EscandalloManager(testDbPath, mockLogger);
  await manager.initialize();

  await t.test('should save and retrieve escandallo', async () => {
    const receta = {
      id: 'rec_pasta_1',
      nombre: 'Pasta',
      porciones: 2,
      ingredientes: [
        { nombre: 'pasta', cantidad: 200, unidad: 'g' },
        { nombre: 'salsa', cantidad: 300, unidad: 'ml' }
      ]
    };

    const preciosMercado = {
      'pasta': 1.20,
      'salsa': 2.50
    };

    const calc = await manager.calculateEscandallo('rec_pasta_1', receta, preciosMercado);
    const escandalloId = await manager.saveEscandallo('rec_pasta_1', calc);

    assert.ok(escandalloId, 'Should return escandallo ID');

    const retrieved = await manager.getEscandallo('rec_pasta_1');
    assert.ok(retrieved, 'Should retrieve saved escandallo');
    assert.strictEqual(retrieved.coste_total, calc.coste_total);
  });

  await manager.close();
  cleanupDb();
});

test('EscandalloManager - Alert Detection', async (t) => {
  cleanupDb();
  const manager = new EscandalloManager(testDbPath, mockLogger);
  await manager.initialize();

  await t.test('should detect price increases > 10%', async () => {
    // First calculation
    const calc1 = {
      coste_total: 10.00,
      coste_porcion: 5.00,
      snapshot: {
        'tomate': 2.00,
        'queso': 8.00
      }
    };
    await manager.saveEscandallo('rec_test_1', calc1);

    // Second calculation with 15% increase
    const calc2 = {
      coste_total: 11.50,
      coste_porcion: 5.75,
      snapshot: {
        'tomate': 2.30, // +15%
        'queso': 9.20  // +15%
      }
    };

    const escandalloId = await manager.saveEscandallo('rec_test_1', calc2);
    const alerts = await manager.detectPriceChanges(escandalloId, 'rec_test_1', calc2.snapshot);

    assert.ok(alerts.length > 0, 'Should detect price changes');
    assert.ok(alerts.some(a => a.porcentaje_cambio > 10), 'Should detect > 10% change');
  });

  await manager.close();
  cleanupDb();
});

test('EscandalloManager - Historical Data', async (t) => {
  cleanupDb();
  const manager = new EscandalloManager(testDbPath, mockLogger);
  await manager.initialize();

  await t.test('should retrieve multiple historical records', async () => {
    for (let i = 0; i < 3; i++) {
      const calc = {
        coste_total: 10.00 + i,
        coste_porcion: 5.00 + i * 0.5,
        snapshot: { 'tomate': 2.00 }
      };
      await manager.saveEscandallo('rec_hist_1', calc);

      // Simulate time passing
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const history = await manager.getHistory('rec_hist_1', 10);
    assert.ok(history.length > 0, 'Should have history');
    assert.ok(history[0].coste_porcion > history[1].coste_porcion, 'Should be in descending order by date');
  });

  await manager.close();
  cleanupDb();
});

test('EscandalloManager - Search', async (t) => {
  cleanupDb();
  const manager = new EscandalloManager(testDbPath, mockLogger);
  await manager.initialize();

  await t.test('should filter by cost range', async () => {
    // Create multiple escandallos with different costs
    for (let i = 1; i <= 5; i++) {
      const calc = {
        coste_total: i * 10,
        coste_porcion: i,
        snapshot: {}
      };
      await manager.saveEscandallo(`rec_${i}`, calc);
    }

    const results = await manager.search({
      coste_min: 2,
      coste_max: 4
    });

    assert.ok(results.length > 0, 'Should find results in range');
    assert.ok(results.every(r => r.coste_porcion >= 2 && r.coste_porcion <= 4));
  });

  await manager.close();
  cleanupDb();
});

console.log('All tests completed');

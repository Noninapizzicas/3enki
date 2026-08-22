/**
 * Tests unitarios — confluencia-h3 (Portal de llamada · S1 criterio + S2 porta-aviso).
 *
 * Ejecutar: node tests/unit/confluencia-h3.test.js
 */
'use strict';

const assert = require('assert');

const ConfluenciaH3 = require('../../modules/confluencia-h3');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// Harness mínimo: _rpc devuelve null (sin config → defaults de regla).
function makeModulo() {
  const m = new ConfluenciaH3();
  m.logger = { debug() {}, info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m.eventBus = { publish() {}, subscribe() { return () => {}; } };
  m._rpc = async () => null;
  return m;
}

// ---------------------------------------------------------------------------
// S1 · Criterio de escalada
// ---------------------------------------------------------------------------
test('S1: no_disponible → aviso al cliente, prioridad alta', async () => {
  const m = makeModulo();
  const r = await m._criterioEscalada({ resultado: { tipo: 'no_disponible' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.aviso, true);
  assert.strictEqual(r.data.categoria, 'cliente');
  assert.strictEqual(r.data.prioridad, 'alta');
});

test('S1: ajustado cercano (mismo día) → self, sin aviso', async () => {
  const m = makeModulo();
  const r = await m._criterioEscalada({
    resultado: { tipo: 'ajustado', fecha_solicitada: '2026-08-22', propuesta: '2026-08-22' }
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.aviso, false);
  assert.strictEqual(r.data.motivo, 'ajustado_cercano');
});

test('S1: ajustado lejano (5 días ≥ umbral 2) → cliente, prioridad media', async () => {
  const m = makeModulo();
  const r = await m._criterioEscalada({
    resultado: { tipo: 'ajustado', fecha_solicitada: '2026-08-22', propuesta: '2026-08-27' }
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.aviso, true);
  assert.strictEqual(r.data.categoria, 'cliente');
  assert.strictEqual(r.data.prioridad, 'media');
  assert.strictEqual(r.data.dias, 5);
});

test('S1: movimiento 5u (≥ umbral 3) → aviso al dueño, prioridad media', async () => {
  const m = makeModulo();
  const r = await m._criterioEscalada({
    resultado: { tipo: 'confirmado', movimiento: { unidades: 5 } }
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.aviso, true);
  assert.strictEqual(r.data.categoria, 'dueno');
  assert.strictEqual(r.data.prioridad, 'media');
});

test('S1: movimiento 2u (bajo umbral 3) → self, sin aviso', async () => {
  const m = makeModulo();
  const r = await m._criterioEscalada({
    resultado: { tipo: 'confirmado', movimiento: { unidades: 2 } }
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.aviso, false);
  assert.strictEqual(r.data.motivo, 'self');
});

test('S1: sin resultado → INVALID_INPUT 400', async () => {
  const m = makeModulo();
  const r = await m._criterioEscalada({});
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error, 'INVALID_INPUT');
});

// ---------------------------------------------------------------------------
// S2 · Porta-aviso
// ---------------------------------------------------------------------------
test('S2: empaqueta contexto accionable (cliente + producto + día propuesto)', async () => {
  const m = makeModulo();
  const r = await m._portaAviso({
    resultado: { tipo: 'ajustado', producto_id: 'barra_pan', cantidad: 3, fecha_solicitada: '2026-08-22', propuesta: '2026-08-27' },
    cliente: { nombre: 'Ana', telefono: '+34600000000' }
  });
  assert.strictEqual(r.status, 200);
  const a = r.data.aviso;
  assert.ok(a);
  assert.strictEqual(a.categoria, 'cliente');
  assert.strictEqual(a.motivo, 'ajustado_lejano');
  assert.strictEqual(a.cliente.nombre, 'Ana');
  assert.strictEqual(a.pedido.producto, 'barra_pan');
  assert.strictEqual(a.pedido.dia_propuesto, '2026-08-27');
  assert.strictEqual(a.decision_pendiente, false);
});

test('S2: sin escalada → aviso null', async () => {
  const m = makeModulo();
  const r = await m._portaAviso({ resultado: { tipo: 'confirmado' }, cliente: { nombre: 'Ana' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.aviso, null);
  assert.strictEqual(r.data.motivo, 'sin_escalada');
});

test('S2: sin cliente → INVALID_INPUT 400', async () => {
  const m = makeModulo();
  const r = await m._portaAviso({ resultado: { tipo: 'no_disponible' } });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error, 'INVALID_INPUT');
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
(async () => {
  let passed = 0, failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      passed += 1;
      console.log(`  ✓ ${t.name}`);
    } catch (err) {
      failed += 1;
      console.error(`  ✗ ${t.name}\n    ${err.message}`);
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();

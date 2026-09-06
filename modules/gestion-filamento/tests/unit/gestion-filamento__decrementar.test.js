'use strict';

/**
 * gestion-filamento — REFLEJO _registrar / _decrementar (proyecciones del CUSTODIO).
 *
 * El gestor de filamento es el unico escritor de su store. Esta suite fija el
 * contrato de las proyecciones principales:
 *   - rollo bien formado → status 201, se guarda, emite filamento.registrado.
 *   - sin tipo → INVALID_INPUT (400).
 *   - sin project_id → INVALID_INPUT (400).
 *   - id duplicado → ALREADY_EXISTS (409) y NO se sobreescribe.
 *   - longitud inicial ausente → longitud_desconocida (nunca inventada).
 *   - decrementar por longitud (mm) → resta acumulada, piso 0, emite
 *     filamento.decrementado.
 *   - decrementar rollo inexistente → RESOURCE_NOT_FOUND (404).
 *   - decrementar rollo con longitud desconocida → LONGITUD_DESCONOCIDA (409),
 *     NO se decrementa (invariante 9).
 *   - decrementar bajo el umbral → emite filamento.bajo.
 *   - filamento.usado (fire-and-forget) decrementa el rollo activo.
 *
 * Sin bus ni fs: las proyecciones son puras, se invocan directas con eventBus stub.
 * Ejecutar: node tests/unit/gestion-filamento__decrementar.test.js
 */

const assert = require('assert');
const GestionFilamento = require('../../index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevoReflejo() {
  const m = new GestionFilamento();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m.eventBus = { publish: () => {} };
  return m;
}

test('rollo bien formado → status 201, guardado y emite filamento.registrado', async () => {
  const m = nuevoReflejo();
  let emitido = null;
  m.eventBus = { publish: (ev, d) => { if (ev === 'filamento.registrado') emitido = d; } };
  const r = await m._registrar({ project_id: 'proj-1', tipo: 'PLA', color: 'rojo', longitud_inicial: 100000 });
  assert.strictEqual(r.status, 201);
  assert.ok(r.data.filamento.id, 'genera id');
  assert.strictEqual(m.filamentos.size, 1, 'guarda en el store');
  assert.strictEqual(emitido.filamento_id, r.data.filamento.id, 'emite con el id del rollo');
  assert.strictEqual(emitido.longitud_desconocida, false);
  assert.strictEqual(emitido.project_id, 'proj-1');
});

test('sin tipo → INVALID_INPUT (400)', async () => {
  const m = nuevoReflejo();
  const r = await m._registrar({ project_id: 'proj-1' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
  assert.strictEqual(m.filamentos.size, 0, 'no guarda nada');
});

test('sin project_id → INVALID_INPUT (400)', async () => {
  const m = nuevoReflejo();
  const r = await m._registrar({ tipo: 'PLA' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
});

test('id duplicado → ALREADY_EXISTS (409) y NO sobreescribe', async () => {
  const m = nuevoReflejo();
  const r1 = await m._registrar({ project_id: 'proj-1', tipo: 'PLA', id: 'f1' });
  assert.strictEqual(r1.status, 201);
  const r2 = await m._registrar({ project_id: 'proj-1', tipo: 'PETG', id: 'f1' });
  assert.strictEqual(r2.status, 409);
  assert.strictEqual(r2.error.code, 'ALREADY_EXISTS');
  assert.strictEqual(m.filamentos.get('f1').tipo, 'PLA', 'conserva el original');
  assert.strictEqual(m.filamentos.size, 1);
});

test('longitud inicial ausente → longitud_desconocida (nunca inventada)', async () => {
  const m = nuevoReflejo();
  let emitido = null;
  m.eventBus = { publish: (ev, d) => { if (ev === 'filamento.registrado') emitido = d; } };
  const r = await m._registrar({ project_id: 'proj-1', tipo: 'ABS' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.filamento.longitud_inicial, null);
  assert.strictEqual(r.data.filamento.longitud_restante, null);
  assert.strictEqual(emitido.longitud_desconocida, true);
});

test('decrementar por longitud (mm) → resta acumulada, piso 0, emite decrementado', async () => {
  const m = nuevoReflejo();
  await m._registrar({ project_id: 'proj-1', tipo: 'PLA', id: 'f1', longitud_inicial: 100000 });
  let emitido = null;
  m.eventBus = { publish: (ev, d) => { if (ev === 'filamento.decrementado') emitido = d; } };
  const r = await m._decrementar({ project_id: 'proj-1', rollo_id: 'f1', filament_used: 25000 });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.filamento.longitud_restante, 75000, 'resta 25000 de 100000');
  assert.strictEqual(emitido.filament_used, 25000);
  assert.strictEqual(emitido.longitud_antes, 100000);
  assert.strictEqual(emitido.longitud_restante, 75000);
  // piso 0: no puede quedar negativo
  await m._decrementar({ project_id: 'proj-1', rollo_id: 'f1', filament_used: 999999 });
  assert.strictEqual(m.filamentos.get('f1').longitud_restante, 0, 'piso 0');
});

test('decrementar rollo inexistente → RESOURCE_NOT_FOUND (404)', async () => {
  const m = nuevoReflejo();
  const r = await m._decrementar({ project_id: 'proj-1', rollo_id: 'no-existe', filament_used: 10 });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
});

test('decrementar rollo con longitud desconocida → LONGITUD_DESCONOCIDA (409), NO decrementa', async () => {
  const m = nuevoReflejo();
  await m._registrar({ project_id: 'proj-1', tipo: 'ABS', id: 'f2' });   // sin longitud_inicial
  const r = await m._decrementar({ project_id: 'proj-1', rollo_id: 'f2', filament_used: 10 });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'LONGITUD_DESCONOCIDA');
  assert.strictEqual(m.filamentos.get('f2').longitud_restante, null, 'no se decrementa');
});

test('decrementar bajo el umbral → emite filamento.bajo', async () => {
  const m = nuevoReflejo();
  m.umbralBajo = 5000;
  await m._registrar({ project_id: 'proj-1', tipo: 'PLA', id: 'f3', longitud_inicial: 10000 });
  let bajo = null;
  m.eventBus = { publish: (ev, d) => { if (ev === 'filamento.bajo') bajo = d; } };
  const r = await m._decrementar({ project_id: 'proj-1', rollo_id: 'f3', filament_used: 6000 });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.bajo, true, 'restante 4000 <= umbral 5000');
  assert.ok(bajo, 'emite filamento.bajo');
  assert.strictEqual(bajo.umbral, 5000);
});

test('filamento.usado (fire-and-forget) decrementa el rollo activo', async () => {
  const m = nuevoReflejo();
  await m._registrar({ project_id: 'proj-1', tipo: 'PLA', id: 'fA', longitud_inicial: 100000, activo: true });
  await m._registrar({ project_id: 'proj-1', tipo: 'PETG', id: 'fB', longitud_inicial: 100000 });
  let decrementado = null;
  m.eventBus = { publish: (ev, d) => { if (ev === 'filamento.decrementado') decrementado = d; } };
  m.onFilamentoUsado({ data: { project_id: 'proj-1', filament_used: 30000 } });
  assert.strictEqual(m.filamentos.get('fA').longitud_restante, 70000, 'decrementa el activo');
  assert.strictEqual(m.filamentos.get('fB').longitud_restante, 100000, 'no toca el inactivo');
  assert.strictEqual(decrementado.filamento_id, 'fA');
});

test('listar filtra por project_id y marca bajo', async () => {
  const m = nuevoReflejo();
  m.umbralBajo = 5000;
  await m._registrar({ project_id: 'proj-1', tipo: 'PLA', id: 'f1', longitud_inicial: 1000 });
  await m._registrar({ project_id: 'proj-2', tipo: 'PETG', id: 'f2', longitud_inicial: 100000 });
  const r = await m._listar({ project_id: 'proj-1' });
  assert.strictEqual(r.data.total, 1);
  assert.strictEqual(r.data.filamentos[0].bajo, true, '1000 <= umbral 5000');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[gestion-filamento__decrementar] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[gestion-filamento__decrementar] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

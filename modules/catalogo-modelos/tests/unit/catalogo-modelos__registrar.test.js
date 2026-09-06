'use strict';

/**
 * catalogo-modelos — REFLEJO _registrar (la proyeccion principal del CUSTODIO).
 *
 * El catalogo es el unico escritor de su store. Esta suite fija el contrato
 * de la proyeccion principal:
 *   - modelo bien formado → status 201, se guarda en el store, emite
 *     catalogo.modelo_registrado.
 *   - sin nombre → INVALID_INPUT (400).
 *   - sin project_id → INVALID_INPUT (400).
 *   - id duplicado → ALREADY_EXISTS (409) y NO se sobreescribe.
 *   - metadatos con huecos → 'desconocido' (nunca inventado).
 *
 * Sin bus ni fs: _registrar es pura, se invoca directa con eventBus stub.
 * Ejecutar: node modules/catalogo-modelos/tests/unit/catalogo-modelos__registrar.test.js
 */

const assert = require('assert');
const CatalogoModelos = require('../../index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevoReflejo() {
  const m = new CatalogoModelos();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m.eventBus = { publish: () => {} };
  return m;
}

test('modelo bien formado → status 201, guardado y emite modelo_registrado', async () => {
  const m = nuevoReflejo();
  let emitido = null;
  m.eventBus = { publish: (ev, d) => { if (ev === 'catalogo.modelo_registrado') emitido = d; } };
  const r = await m._registrar({ project_id: 'proj-1', nombre: 'Soporte de llaves', categoria: 'utilidad' });
  assert.strictEqual(r.status, 201);
  assert.ok(r.data.modelo.id, 'genera id');
  assert.strictEqual(m.modelos.size, 1, 'guarda en el store');
  assert.strictEqual(emitido.modelo_id, r.data.modelo.id, 'emite con el id del modelo');
  assert.strictEqual(emitido.project_id, 'proj-1');
});

test('sin nombre → INVALID_INPUT (400)', async () => {
  const m = nuevoReflejo();
  const r = await m._registrar({ project_id: 'proj-1' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
  assert.strictEqual(m.modelos.size, 0, 'no guarda nada');
});

test('sin project_id → INVALID_INPUT (400)', async () => {
  const m = nuevoReflejo();
  const r = await m._registrar({ nombre: 'X' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
});

test('id duplicado → ALREADY_EXISTS (409) y NO sobreescribe', async () => {
  const m = nuevoReflejo();
  const r1 = await m._registrar({ project_id: 'proj-1', nombre: 'A', id: 'm1' });
  assert.strictEqual(r1.status, 201);
  const r2 = await m._registrar({ project_id: 'proj-1', nombre: 'B', id: 'm1' });
  assert.strictEqual(r2.status, 409);
  assert.strictEqual(r2.error.code, 'ALREADY_EXISTS');
  assert.strictEqual(m.modelos.get('m1').nombre, 'A', 'conserva el original');
  assert.strictEqual(m.modelos.size, 1);
});

test('metadatos con huecos → desconocido (nunca inventado)', async () => {
  const m = nuevoReflejo();
  const r = await m._registrar({ project_id: 'proj-1', nombre: 'Caja' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.modelo.metadatos.material, 'desconocido');
  assert.strictEqual(r.data.modelo.metadatos.dimensiones, 'desconocido');
  assert.strictEqual(r.data.modelo.categoria, 'sin_categoria');
});

test('listar filtra por project_id', async () => {
  const m = nuevoReflejo();
  await m._registrar({ project_id: 'proj-1', nombre: 'A' });
  await m._registrar({ project_id: 'proj-2', nombre: 'B' });
  const r = await m._listar({ project_id: 'proj-1' });
  assert.strictEqual(r.data.total, 1);
  assert.strictEqual(r.data.modelos[0].nombre, 'A');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[catalogo-modelos__registrar] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[catalogo-modelos__registrar] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

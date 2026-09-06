'use strict';

/**
 * cola-impresion — REFLEJO _entrar / _siguiente / _reordenar / _longitud / _ordenar
 * (las proyecciones del CUSTODIO de la cola de impresión 3D).
 *
 * La cola es el único escritor de su store. Esta suite fija el contrato:
 *   - _entrar: pieza bien formada → 201, guarda, emite cola.entrada; sin nombre →
 *     INVALID_INPUT; sin project_id → INVALID_INPUT; modelo duplicado pendiente →
 *     ALREADY_EXISTS (409) y NO se duplica; modelo inexistente en catálogo → 404.
 *   - _siguiente: cola vacía → cola.vacia; con pendientes → extrae la de mayor score
 *     del motor _ordenar, la pasa a 'imprimiendo' y ajusta el materialCargado.
 *   - _ordenar: el motor puntúa por material (coincidir con el cargado), urgencia,
 *     tamaño y tiempo; el material extraído pasa a ser el cargado (ajuste con el uso).
 *   - _reordenar: sube/baja una pendiente; solo pendiente (no imprimiendo/hecho).
 *   - _longitud: pendientes + total.
 *
 * Sin bus ni fs: las proyecciones se invocan directas con eventBus/_rpc stub.
 * Ejecutar: node modules/cola-impresion/tests/unit/cola-impresion__entrar.test.js
 */

const assert = require('assert');
const ColaImpresion = require('../../index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevoReflejo() {
  const m = new ColaImpresion();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m.eventBus = { publish: () => {} };
  // catálogo: responde 200 para cualquier modelo (best-effort en _entrar)
  m._rpc = async (topic) => {
    if (topic === 'catalogo.obtener.request') return { status: 200, data: { modelo: { id: 'm1' } } };
    return { status: 500, data: {} };
  };
  return m;
}

test('entrar pieza bien formada → 201, guarda y emite cola.entrada', async () => {
  const m = nuevoReflejo();
  let emitido = null;
  m.eventBus = { publish: (ev, d) => { if (ev === 'cola.entrada') emitido = d; } };
  const r = await m._entrar({ project_id: 'proj-1', modelo_id: 'm1', nombre: 'Soporte de llaves', material: 'PLA', urgencia: 3 });
  assert.strictEqual(r.status, 201);
  assert.ok(r.data.item.id, 'genera id');
  assert.strictEqual(r.data.item.estado, 'pendiente');
  assert.strictEqual(m._stores.get('proj-1').items.size, 1, 'guarda en el store');
  assert.strictEqual(emitido.item_id, r.data.item.id, 'emite con el id del item');
  assert.strictEqual(emitido.project_id, 'proj-1');
});

test('entrar sin nombre → INVALID_INPUT (400)', async () => {
  const m = nuevoReflejo();
  const r = await m._entrar({ project_id: 'proj-1', modelo_id: 'm1' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
  assert.strictEqual(m._stores.get('proj-1')?.items?.size ?? 0, 0, 'no guarda nada');
});

test('entrar sin project_id → INVALID_INPUT (400)', async () => {
  const m = nuevoReflejo();
  const r = await m._entrar({ modelo_id: 'm1', nombre: 'X' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
});

test('entrar modelo duplicado pendiente → ALREADY_EXISTS (409) y NO duplica', async () => {
  const m = nuevoReflejo();
  const r1 = await m._entrar({ project_id: 'proj-1', modelo_id: 'm1', nombre: 'A' });
  assert.strictEqual(r1.status, 201);
  const r2 = await m._entrar({ project_id: 'proj-1', modelo_id: 'm1', nombre: 'B' });
  assert.strictEqual(r2.status, 409);
  assert.strictEqual(r2.error.code, 'ALREADY_EXISTS');
  assert.strictEqual(m._stores.get('proj-1').items.size, 1, 'conserva el original');
});

test('entrar modelo inexistente en catálogo → 404 RESOURCE_NOT_FOUND', async () => {
  const m = nuevoReflejo();
  m._rpc = async (topic) => {
    if (topic === 'catalogo.obtener.request') return { status: 404, data: {} };
    return { status: 500, data: {} };
  };
  const r = await m._entrar({ project_id: 'proj-1', modelo_id: 'no-existe', nombre: 'X' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
  assert.strictEqual(m._stores.get('proj-1')?.items?.size ?? 0, 0, 'no guarda nada');
});

test('siguiente en cola vacía → cola.vacia y item null', async () => {
  const m = nuevoReflejo();
  let emitido = null;
  m.eventBus = { publish: (ev, d) => { if (ev === 'cola.vacia') emitido = d; } };
  const r = await m._siguiente({ project_id: 'proj-1' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.vacia, true);
  assert.strictEqual(r.data.item, null);
  assert.ok(emitido, 'emite cola.vacia');
});

test('siguiente extrae la de mayor score y ajusta materialCargado', async () => {
  const m = nuevoReflejo();
  // Dos piezas: una PLA (urgencia 1) y una PETG (urgencia 5). Sin material cargado,
  // la de mayor urgencia gana.
  await m._entrar({ project_id: 'proj-1', modelo_id: 'm1', nombre: 'A', material: 'PLA', urgencia: 1 });
  await m._entrar({ project_id: 'proj-1', modelo_id: 'm2', nombre: 'B', material: 'PETG', urgencia: 5 });
  const r = await m._siguiente({ project_id: 'proj-1' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.vacia, false);
  assert.strictEqual(r.data.item.nombre, 'B', 'extrae la de mayor urgencia');
  assert.strictEqual(r.data.item.estado, 'imprimiendo');
  assert.strictEqual(r.data.materialCargado, 'PETG', 'el material extraído pasa a ser el cargado');
});

test('motor _ordenar: material cargado gana prioridad (evita cambio de filamento)', async () => {
  const m = nuevoReflejo();
  await m._entrar({ project_id: 'proj-1', modelo_id: 'm1', nombre: 'A', material: 'PLA', urgencia: 1 });
  await m._entrar({ project_id: 'proj-1', modelo_id: 'm2', nombre: 'B', material: 'PETG', urgencia: 1 });
  const store = m._stores.get('proj-1');
  // Simula que el material cargado es PLA (ajuste con el uso).
  store.materialCargado = 'PLA';
  const ordenado = m._ordenar(store, [...store.items.values()].filter(i => i.estado === 'pendiente'));
  assert.strictEqual(ordenado[0].nombre, 'A', 'la pieza del material cargado va primero');
});

test('reordenar sube una pieza pendiente a la posición 1', async () => {
  const m = nuevoReflejo();
  await m._entrar({ project_id: 'proj-1', modelo_id: 'm1', nombre: 'A' });
  await m._entrar({ project_id: 'proj-1', modelo_id: 'm2', nombre: 'B' });
  const store = m._stores.get('proj-1');
  const b = [...store.items.values()].find(i => i.nombre === 'B');
  const r = await m._reordenar({ project_id: 'proj-1', item_id: b.id, pos: 1 });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.pos, 1);
  const pendientes = [...store.items.values()].filter(i => i.estado === 'pendiente');
  const primero = pendientes.reduce((min, i) => (i.orden < min.orden ? i : min), pendientes[0]);
  assert.strictEqual(primero.id, b.id, 'B queda primero (menor orden)');
});

test('reordenar una pieza no pendiente → CONFLICT_STATE (409)', async () => {
  const m = nuevoReflejo();
  await m._entrar({ project_id: 'proj-1', modelo_id: 'm1', nombre: 'A' });
  const store = m._stores.get('proj-1');
  const a = [...store.items.values()][0];
  a.estado = 'imprimiendo';   // ya en impresión
  const r = await m._reordenar({ project_id: 'proj-1', item_id: a.id, pos: 1 });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'CONFLICT_STATE');
});

test('longitud cuenta pendientes y total', async () => {
  const m = nuevoReflejo();
  await m._entrar({ project_id: 'proj-1', modelo_id: 'm1', nombre: 'A' });
  await m._entrar({ project_id: 'proj-1', modelo_id: 'm2', nombre: 'B' });
  const r = await m._longitud({ project_id: 'proj-1' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.pendientes, 2);
  assert.strictEqual(r.data.total, 2);
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[cola-impresion__entrar] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[cola-impresion__entrar] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

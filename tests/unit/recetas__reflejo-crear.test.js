'use strict';

/**
 * recetas — REFLEJO _crear (alta determinista).
 *
 * El alta migró del blueprint (100% LLM) al reflejo JS. Esta suite fija el contrato:
 *   - id slug estable + sufijo si choca · dedup activo (409) · validación (400).
 *   - persist rama A (archivo no existe → fs.write) y rama B (existe → fs.edit add).
 *   - GARANTÍA ANTI-FANTASMA: solo emite receta.creada si la receta REALMENTE
 *     aterrizó en el archivo. Si el fs "dice OK" pero no persiste (la firma de
 *     K-Pop: fs inestable), devuelve 503 y NO emite → el guardado falso es imposible.
 *
 * Sin bus ni fs reales: se stubean _leerJson/_editarJson/_rpc contra un store en memoria.
 * Ejecutar: node tests/unit/recetas__reflejo-crear.test.js
 */

const assert = require('assert');
const Recetas = require('../../modules/pizzepos/recetas');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevoReflejo(initialStore) {
  const m = new Recetas();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m.published = [];
  m.eventBus = { publish: (ev, p) => m.published.push([ev, p]) };
  m._store = initialStore === undefined ? null : initialStore;   // null = archivo no existe
  m._dropWrites = false;                                          // true = fs dice OK pero NO persiste

  m._leerJson = async () => (m._store ? JSON.parse(JSON.stringify(m._store)) : null);
  m._editarJson = async (_pid, _path, patches) => {
    if (m._dropWrites) return { status: 200 };                   // K-Pop: éxito aparente, escritura perdida
    for (const p of patches) {
      if (p.op === 'add' && p.path === '/recetas/-') m._store.recetas.push(p.value);
      if (p.op === 'replace' && p.path === '/_updated_at') m._store._updated_at = p.value;
    }
    return { status: 200 };
  };
  m._rpc = async (ev, payload) => {
    if (ev === 'fs.write.request') {
      if (m._dropWrites) return { status: 200 };
      m._store = JSON.parse(payload.content);
      return { status: 200 };
    }
    return null;
  };
  return m;
}

const storeCon = (recetas) => ({ _version: '1.0', _updated_at: 'x', recetas, ingredientes_catalogo: [] });
const emitida = (m) => m.published.find(p => p[0] === 'receta.creada');

test('alta OK en archivo existente (fs.edit add) → 201 + receta.creada + id slug', async () => {
  const m = nuevoReflejo(storeCon([{ id: 'samba', nombre: 'Samba', estado_operativo: 'en_servicio' }]));
  const r = await m._crear({ project_id: 'p', nombre: 'Bossa Nova', tipo: 'pizza', lineas: [{ nombre: 'Tomate frito', cantidad: 50, unidad: 'g' }] });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.receta_id, 'bossa-nova');
  assert.strictEqual(r.data.estado_operativo, 'en_servicio');
  assert.strictEqual(m._store.recetas.length, 2, 'persistió en el store');
  assert.ok(emitida(m), 'emite receta.creada tras verificar');
});

test('alta en archivo INEXISTENTE (fs.read 404) → rama A fs.write → 201', async () => {
  const m = nuevoReflejo(undefined);
  const r = await m._crear({ project_id: 'p', nombre: 'Masa Napolitana', tipo: 'masa', lineas: [{ nombre: 'Harina', cantidad: 1000, unidad: 'g' }] });
  assert.strictEqual(r.status, 201);
  assert.ok(m._store && m._store.recetas.length === 1 && m._store.recetas[0].id === 'masa-napolitana');
  assert.ok(emitida(m));
});

test('dedup: nombre activo duplicado → 409 ALREADY_EXISTS y NO emite', async () => {
  const m = nuevoReflejo(storeCon([{ id: 'samba', nombre: 'Samba', estado_operativo: 'en_servicio' }]));
  const r = await m._crear({ project_id: 'p', nombre: 'samba', lineas: [{ nombre: 'X', cantidad: 1 }] });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'ALREADY_EXISTS');
  assert.ok(!emitida(m));
});

test('id colisiona con uno NO activo → sufijo -2 (no dedup, pero id único)', async () => {
  const m = nuevoReflejo(storeCon([{ id: 'samba', nombre: 'Samba', estado_operativo: 'archivada' }]));
  const r = await m._crear({ project_id: 'p', nombre: 'Samba', lineas: [{ nombre: 'X', cantidad: 1 }] });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.receta_id, 'samba-2');
});

test('validación: sin nombre → 400; sin project_id → 400', async () => {
  const m = nuevoReflejo(storeCon([]));
  assert.strictEqual((await m._crear({ project_id: 'p' })).status, 400);
  assert.strictEqual((await m._crear({ nombre: 'X' })).status, 400);
});

test('GARANTÍA: fs "dice OK" pero NO persiste → 503 y NO emite receta.creada (anti-fantasma)', async () => {
  const m = nuevoReflejo(storeCon([]));
  m._dropWrites = true;   // simula el fs inestable de K-Pop
  const r = await m._crear({ project_id: 'p', nombre: 'K-Pop', lineas: [{ nombre: 'Tomate', cantidad: 50 }] });
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.error.code, 'UPSTREAM_UNREACHABLE');
  assert.ok(!emitida(m), 'NO emite receta.creada si no aterrizó → guardado falso imposible');
});

test('sin lineas → borrador + campos_pendientes:[lineas]', async () => {
  const m = nuevoReflejo(storeCon([]));
  const r = await m._crear({ project_id: 'p', nombre: 'Vacía', tipo: 'pizza', lineas: [] });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.estado_operativo, 'borrador');
  assert.deepStrictEqual(r.data.campos_pendientes, ['lineas']);
});

test('lineas se normalizan: cantidad→Number, unidad default g, ref desde nombre', async () => {
  const m = nuevoReflejo(storeCon([]));
  await m._crear({ project_id: 'p', nombre: 'Test', lineas: [{ nombre: 'Mozzarella', cantidad: '100' }] });
  const linea = m._store.recetas[0].lineas[0];
  assert.deepStrictEqual(linea, { ref: 'mozzarella', nombre: 'Mozzarella', cantidad: 100, unidad: 'g' });
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[recetas__reflejo-crear] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[recetas__reflejo-crear] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

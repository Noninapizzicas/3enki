'use strict';

/**
 * recetas — REFLEJO _validar (EL FRENO, skill blueprint-agentico).
 *
 * El blueprint da forma a una Receta (lo fuzzy) y la pasa por recetas.validar.request
 * ANTES de persistir. Este responder es función PURA: ni lee ni escribe el store, solo
 * juzga la FORMA contra el contrato (receta.schema.json, AJV) y devuelve {valid, errors}.
 *
 * Esta suite fija el contrato del freno:
 *   - receta bien formada → valid:true.
 *   - borrador (lineas vacías) → valid:true (el freno valida FORMA, no completitud).
 *   - línea hueca (cantidad:0 / nombre vacío / unidad no canónica) → valid:false con su path.
 *   - sin 'receta' → INVALID_INPUT (400).
 *   - el veredicto va en data.valid; el status es 200 (la validación tuvo éxito).
 *
 * Sin bus ni fs: _validar es pura, se invoca directa.
 * Ejecutar: node tests/unit/recetas__reflejo-validar.test.js
 */

const assert = require('assert');
const Recetas = require('../../modules/pizzepos/recetas');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevoReflejo() {
  const m = new Recetas();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  return m;
}

const LINEA_OK = { ref: 'mozzarella', nombre: 'Mozzarella', cantidad: 80, unidad: 'g' };

test('receta bien formada → valid:true, sin errores, status 200', async () => {
  const m = nuevoReflejo();
  const r = await m._validar({ receta: { nombre: 'Cumbia', tipo: 'pizza', rinde: { cantidad: 1, unidad: 'ud' }, lineas: [LINEA_OK] } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.valid, true);
  assert.deepStrictEqual(r.data.errors, []);
});

test('borrador (lineas vacías) → valid:true (valida FORMA, no completitud)', async () => {
  const m = nuevoReflejo();
  const r = await m._validar({ receta: { nombre: 'Nueva', tipo: 'pizza', lineas: [] } });
  assert.strictEqual(r.data.valid, true, 'una receta sin líneas es borrador legítimo, no forma rota');
});

test('línea hueca (cantidad:0, nombre vacío, unidad no canónica) → valid:false con 3 paths', async () => {
  const m = nuevoReflejo();
  const r = await m._validar({ receta: { nombre: 'Rota', tipo: 'pizza', lineas: [{ ref: 'x', nombre: '', cantidad: 0, unidad: 'kg' }] } });
  assert.strictEqual(r.data.valid, false);
  const paths = r.data.errors.map(e => e.path).sort();
  assert.deepStrictEqual(paths, ['/lineas/0/cantidad', '/lineas/0/nombre', '/lineas/0/unidad']);
  // los mensajes llevan el path → el blueprint sabe QUÉ campo re-PENSAR
  assert.ok(r.data.errors.every(e => typeof e.message === 'string' && e.message.length > 0));
});

test('cantidad:0 sola → valid:false en /lineas/N/cantidad (la coacción silenciosa muere aquí)', async () => {
  const m = nuevoReflejo();
  const r = await m._validar({ receta: { nombre: 'X', tipo: 'pizza', lineas: [LINEA_OK, { ref: 'aceite', nombre: 'Aceite', cantidad: 0, unidad: 'ml' }] } });
  assert.strictEqual(r.data.valid, false);
  assert.ok(r.data.errors.some(e => e.path === '/lineas/1/cantidad'));
});

test('tipo fuera del enum → valid:false', async () => {
  const m = nuevoReflejo();
  const r = await m._validar({ receta: { nombre: 'X', tipo: 'postre', lineas: [LINEA_OK] } });
  assert.strictEqual(r.data.valid, false);
  assert.ok(r.data.errors.some(e => e.path === '/tipo'));
});

test('falta tipo (required) → valid:false', async () => {
  const m = nuevoReflejo();
  const r = await m._validar({ receta: { nombre: 'X', lineas: [LINEA_OK] } });
  assert.strictEqual(r.data.valid, false);
  assert.ok(r.data.errors.some(e => /tipo/.test(e.message)));
});

test('campo extra en una línea (typo cantidadd) → valid:false (additionalProperties:false)', async () => {
  const m = nuevoReflejo();
  const r = await m._validar({ receta: { nombre: 'X', tipo: 'pizza', lineas: [{ ref: 'q', nombre: 'Queso', cantidadd: 50, unidad: 'g' }] } });
  assert.strictEqual(r.data.valid, false, 'un typo en el nombre del campo no debe colarse');
});

test('campos derivados extra a nivel receta (id, version, coste) NO rompen (additionalProperties:true)', async () => {
  const m = nuevoReflejo();
  const r = await m._validar({ receta: { id: 'cumbia', version: 3, coste_unidad: 1.2, history: [], nombre: 'Cumbia', tipo: 'pizza', lineas: [LINEA_OK] } });
  assert.strictEqual(r.data.valid, true, 'el reflejo añade id/version/coste; validar la receta resultante no debe rechazarlos');
});

test('sin receta → INVALID_INPUT (400)', async () => {
  const m = nuevoReflejo();
  const r = await m._validar({});
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
});

test('acepta también la clave "obra" como alias de receta', async () => {
  const m = nuevoReflejo();
  const r = await m._validar({ obra: { nombre: 'X', tipo: 'pizza', lineas: [LINEA_OK] } });
  assert.strictEqual(r.data.valid, true);
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[recetas__reflejo-validar] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[recetas__reflejo-validar] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

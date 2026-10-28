'use strict';

/**
 * Paso 4b: "aviso sin precio". La carta-digital (PWA pública) ofrece TODO extra con precio
 * declarado — precio 0 = Gratis (orden del dueño 2026-10-28: el extra a cero es el gancho) — y
 * cuenta los que NO tienen precio declarado para AVISAR al dueño (extras_sin_precio).
 *
 * Prueba _catalogoIngredientes con un productos stub. Ejecutar:
 *   node tests/unit/pizzepos__carta-digital-aviso-precio.test.js
 */

const assert = require('assert');
const CartaDigital = require('../../modules/pizzepos/carta-digital');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function conProductos(ingredientes) {
  const m = new CartaDigital();
  m.moduleRegistry = {
    get: (n) => n === 'productos'
      ? { instance: { handleListIngredientes: async () => ({ status: 200, data: { ingredientes } }) } }
      : null,
  };
  return m;
}

test('gate: precio declarado (incluido 0 = Gratis) viaja al cliente; sin precio declarado se cuenta (aviso)', async () => {
  const m = conProductos([
    { id: 'bacon', nombre: 'Bacon', precio_extra: 0.5, disponible: true },
    { id: 'pollo', nombre: 'Pollo', precio_extra: 0, disponible: true },   // 0 = GRATIS → se ofrece
    { id: 'queso', nombre: 'Queso', disponible: true },              // sin precio_extra → aviso
    { id: 'x', nombre: 'X', precio_extra: 1, disponible: false },     // no disponible → ni se cuenta
  ]);
  const r = await m._catalogoIngredientes('proj', 'digital');
  assert.strictEqual(r.catalogo.length, 2, 'bacon y pollo(gratis) se ofrecen');
  assert.deepStrictEqual(r.catalogo.map(c => c.id).sort(), ['bacon', 'pollo']);
  assert.strictEqual(r.catalogo.find(c => c.id === 'pollo').precio_extra, 0, 'el gratis viaja con precio 0');
  assert.strictEqual(r.sin_precio, 1, 'queso → aviso (no disponible no cuenta)');
});

test('todos con precio → sin_precio 0 (no hay aviso)', async () => {
  const m = conProductos([
    { id: 'bacon', nombre: 'Bacon', precio_extra: 0.5 },
    { id: 'pollo', nombre: 'Pollo', precio_extra: 0.5 },
  ]);
  const r = await m._catalogoIngredientes('proj', 'digital');
  assert.strictEqual(r.catalogo.length, 2);
  assert.strictEqual(r.sin_precio, 0);
});

test('sin productos / registry vacío → soft-fail {catalogo:[],sin_precio:0}', async () => {
  const m = new CartaDigital();
  m.moduleRegistry = { get: () => null };
  const r = await m._catalogoIngredientes('proj', 'digital');
  assert.deepStrictEqual(r, { catalogo: [], sin_precio: 0 });
});

// ── runner ──
(async () => {
  let passed = 0, failed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; } catch (err) { failed++; fails.push({ name, err }); }
  }
  if (failed === 0) { console.log(`\n[pizzepos__carta-digital-aviso-precio] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[pizzepos__carta-digital-aviso-precio] FAIL ${failed}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

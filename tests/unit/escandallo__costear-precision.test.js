'use strict';

/**
 * escandallo — REFLEJO _costear · PRECISIÓN de sub-recetas.
 *
 * Caso testigo (conversación "1" del proyecto The Pirate, escandallo de «El Sansón Extremeño»):
 * el motor daba 2,08 € cuando el coste real era 2,29 €. El `round(…, 2)` intermedio tragaba
 * las sub-recetas de menos de 0,005 €/unidad — la masa (0,001 €/g) redondeaba a 0,00 €/g y su
 * coste_unidad viajaba a la receta padre como 0,00, haciendo desaparecer los 0,20 € de masa.
 *
 * La cura: precisión intermedia a 6 decimales (valor de línea + coste_unidad que propaga hacia
 * el padre); el coste_total FINAL sigue cerrando en 2 decimales.
 *
 * Ejecutar: node tests/unit/escandallo__costear-precision.test.js
 */

const assert = require('assert');
const Escandallo = require('../../modules/pizzepos/escandallo');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevo() {
  const m = new Escandallo();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  return m;
}

// harina a 1,00 €/kg = 0,001 €/g. La sub-receta "masa" rinde 500 g de 500 g de harina.
const CATALOGO = {
  items: [],
  porId: { harina: { id: 'harina', nombre: 'Harina', precio: 1.0, compra_unidad: 'kg' } },
  porNombre: { harina: { id: 'harina', nombre: 'Harina', precio: 1.0, compra_unidad: 'kg' } }
};
const MASA = {
  id: 'masa', nombre: 'Masa',
  rinde: { cantidad: 500, unidad: 'g' },
  lineas: [{ ref: 'harina', nombre: 'Harina', cantidad: 500, unidad: 'g' }]
};
// El Sansón usa 200 g de esa masa como sub-receta.
const SANSON = {
  id: 'sanson', nombre: 'El Sansón',
  rinde: { cantidad: 1, unidad: 'ud' },
  lineas: [{ ref: 'masa', nombre: 'Masa', cantidad: 200, unidad: 'g' }]
};

function conMasa() {
  const m = nuevo();
  m._cargarReceta = async (_input, id) => (id === 'masa' ? MASA : null); // sin bus: inyecta la sub-receta
  return m;
}

test('sub-receta de 0,001 €/g NO se traga: la masa aporta sus 0,20 € al padre', async () => {
  const m = conMasa();
  const r = await m._costear({}, SANSON, CATALOGO, []);
  // Antes del fix: precio_u de la masa era 0,00 → línea 0,00 → coste_total 0,00.
  assert.strictEqual(r.coste_total, 0.20, `la masa debe aportar 0,20 €, dio ${r.coste_total}`);
  const linea = r.desglose[0];
  assert.strictEqual(linea.precio_unitario, 0.001, `coste_unidad de la masa a 6 decimales, dio ${linea.precio_unitario}`);
  assert.strictEqual(linea.valor_calculado, 0.2, `valor de línea con precisión, dio ${linea.valor_calculado}`);
  assert.strictEqual(linea.fuente, 'sub_receta');
});

test('la sub-receta base conserva coste_unidad de alta precisión (0,001 €/g)', async () => {
  const m = nuevo();
  const r = await m._costear({}, MASA, CATALOGO, []);
  assert.strictEqual(r.coste_total, 0.50, `masa coste_total 0,50 €, dio ${r.coste_total}`);
  assert.strictEqual(r.coste_unidad, 0.001, `masa coste_unidad 0,001 €/g (no 0,00), dio ${r.coste_unidad}`);
});

test('el coste_total final sigue redondeado a 2 decimales', async () => {
  const m = conMasa();
  const r = await m._costear({}, SANSON, CATALOGO, []);
  assert.strictEqual(r.coste_total, this_round(r.coste_total), 'coste_total con ≤2 decimales');
  function this_round(x) { return Math.round(x * 100) / 100; }
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[escandallo__costear-precision] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[escandallo__costear-precision] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

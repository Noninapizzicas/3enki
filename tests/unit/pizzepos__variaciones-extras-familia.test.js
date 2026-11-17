'use strict';

/**
 * La paleta de «Añadir» es la FAMILIA de la carta, no el catálogo entero.
 *
 * Contrato (dueño, 2026-11-17): la FAMILIA vive en `categorias[].tipo` — 'pizzas' = La Flota +
 * Puerto Seguro, 'bocatas' = El Fardel. La paleta de un producto es la UNIÓN de los ingredientes
 * de todas las categorías de su familia, menos los que ya lleva. Y manda lo que la carta DECLARA:
 * variaciones solo deriva cuando el producto aún no trae `opciones`.
 *
 * Lo que queda candado aquí:
 *  - dos subcategorías de la misma familia comparten UNA paleta (La Flota ofrece lo de Puerto Seguro)
 *  - una familia NO ve los ingredientes de otra (un bocata nunca ofrece pepperoni)
 *  - lo que la carta declara se respeta tal cual, con sus precios (no se amplía ni se re-precian)
 *  - sin familia declarada, la categoría cae a su propio id (nadie inventa parentescos)
 *
 * Ejecutar: node tests/unit/pizzepos__variaciones-extras-familia.test.js
 */

const assert = require('assert');
const Variaciones = require('../../modules/pizzepos/variaciones');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const ing = (id, extra = 0.5, familia = 'otro') => ({ id, nombre: id, precio_extra: extra, familia });
const quitarDe = (...ids) => ({
  id: 'sin', etiqueta: 'Sin', modo: 'QUITAR',
  valores: ids.map(id => ({ id, etiqueta: id, delta_precio_centimos: 0 }))
});

// Dos familias + una categoría suelta. Mahón NO declara opciones (se deriva); Margarita SÍ las
// declara (manda la carta); los bocatas se derivan para ver el límite entre familias.
const carta = () => ({
  meta: { id: 'carta_familia' },
  categorias: [
    { id: 'la_flota', nombre: 'La Flota', tipo: 'pizzas' },
    { id: 'pizzas', nombre: 'Pizzas Puerto Seguro', tipo: 'pizzas' },
    { id: 'el_fardel', nombre: 'El Fardel', tipo: 'bocatas' },
    { id: 'bebidas', nombre: 'Bebidas' }
  ],
  productos: [
    {
      id: 'la_flota_mahon', categoria_id: 'la_flota', precio: 12,
      ingredientes: [ing('salsa_the_pirate', 0.5, 'salsa'), ing('mezcla_de_quesos', 0.5, 'queso'), ing('jamon_de_york', 1, 'carne')]
    },
    {
      id: 'pizzas_fandango', categoria_id: 'pizzas', precio: 13,
      ingredientes: [ing('tomate', 0.5, 'verdura'), ing('mozzarella', 0.5, 'queso')],
      opciones: [
        quitarDe('tomate', 'mozzarella'),
        { id: 'anadir', etiqueta: 'Añadir', modo: 'ELEGIR_VARIOS', min: 0, max: 4, valores: [
          { id: 'ternera', etiqueta: 'Ternera', ref: 'ternera', delta_precio_centimos: 150 }
        ] }
      ]
    },
    {
      id: 'el_fardel_barbanegra', categoria_id: 'el_fardel', precio: 7,
      ingredientes: [ing('pancito', 0.5, 'masa'), ing('atun', 1, 'pescado')]
    },
    {
      id: 'el_fardel_perrito', categoria_id: 'el_fardel', precio: 7,
      ingredientes: [ing('pancito', 0.5, 'masa'), ing('lomo', 1, 'carne'), ing('pepinillo', 0.5, 'verdura')]
    },
    { id: 'bebidas_agua', categoria_id: 'bebidas', precio: 2, ingredientes: [] }
  ]
});

async function configurado() {
  const m = new Variaciones();
  m.metrics = { increment() {}, gauge() {}, observe() {} };
  await m.onCartaActualizada({ data: { carta: carta() } });
  return m;
}

const anadir = (cfg) => (cfg.opciones || []).find(o => o.modo === 'ELEGIR_VARIOS') || null;
const quitar = (cfg) => (cfg.opciones || []).find(o => o.modo === 'QUITAR') || null;
const ids = (op) => (op.valores || []).map(v => v.id);

test('La Flota deriva su Añadir de la FAMILIA: ve los ingredientes de Puerto Seguro', async () => {
  const op = anadir((await configurado()).configuraciones.get('la_flota_mahon'));
  assert.ok(op, 'La Flota se quedó sin sección de Añadir');
  // Familia pizzas = salsa, quesos, jamón (Flota) + tomate, mozzarella (Puerto Seguro). Menos los
  // tres que ya lleva el Mahón → tomate y mozzarella, los dos de la OTRA subcategoría.
  assert.deepStrictEqual(ids(op).sort(), ['mozzarella', 'tomate']);
  for (const id of ['salsa_the_pirate', 'mezcla_de_quesos', 'jamon_de_york']) {
    assert.ok(!ids(op).includes(id), `${id} se ofrece como extra pero el producto ya lo lleva`);
  }
});

test('Una familia no ve a la otra: el bocata no ofrece pizza', async () => {
  const m = await configurado();
  const op = anadir(m.configuraciones.get('el_fardel_barbanegra'));
  assert.ok(op, 'El Fardel se quedó sin Añadir');
  // Familia bocatas = pancito, atún, lomo, pepinillo. El Barbanegra lleva pancito y atún.
  assert.deepStrictEqual(ids(op).sort(), ['lomo', 'pepinillo']);
  for (const id of ['tomate', 'mozzarella', 'ternera', 'mezcla_de_quesos']) {
    assert.ok(!ids(op).includes(id), `${id} es de otra familia y se coló en un bocata`);
  }
});

test('Lo que la carta DECLARA manda: se respeta tal cual, con sus precios y su máximo', async () => {
  const m = await configurado();
  const cfg = m.configuraciones.get('pizzas_fandango');
  const op = anadir(cfg);
  assert.deepStrictEqual(ids(op), ['ternera'], 'la carta declaró un extra y se sustituyó por la paleta derivada');
  assert.strictEqual(op.valores[0].delta_precio_centimos, 150, 'se re-preció un extra declarado por el dueño');
  assert.strictEqual(op.max, 4, 'el máximo declarado en la carta no manda');
  assert.strictEqual(cfg.max_ingredientes_extra, 4);
});

test('Un producto que no declara opciones nace con QUITAR de lo suyo', async () => {
  const q = quitar((await configurado()).configuraciones.get('la_flota_mahon'));
  assert.deepStrictEqual(ids(q), ['salsa_the_pirate', 'mezcla_de_quesos', 'jamon_de_york']);
});

test('Sin familia declarada, la categoría cae a su propio id (nadie inventa parentescos)', async () => {
  const m = await configurado();
  const cfg = m.configuraciones.get('bebidas_agua');
  assert.strictEqual(anadir(cfg), null, 'una categoría sin familia abrió una paleta que no le toca');
});

// ── runner ──
(async () => {
  let passed = 0, failed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; } catch (err) { failed++; fails.push({ name, err }); }
  }
  if (failed === 0) { console.log(`\n[pizzepos__variaciones-extras-familia] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[pizzepos__variaciones-extras-familia] FAIL ${failed}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

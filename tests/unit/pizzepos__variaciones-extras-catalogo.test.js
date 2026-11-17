'use strict';

/**
 * Blindaje de la orden del dueño 2026-11-17: «en La Flota y en Puerto Seguro el comandero debe
 * ofrecer TODOS los ingredientes para añadir, no solo los de su familia» — de momento SOLO en las
 * dos categorías de pizza. El resto de categorías (El Fardel, Las Calas, Bebidas) queda como estaba.
 *
 * Lo que queda candado aquí:
 *  - categoría de pizza (tipo 'pizzas' o id/nombre de pizza) → ELEGIR_VARIOS con el catálogo entero
 *    menos lo que el producto ya lleva, incluidos ingredientes que hoy solo viven en otras familias
 *  - lo que la carta YA declara NO se pierde y conserva su precio (el catálogo amplía, no encoge)
 *  - el precio de un extra es el declarado si existe; si nadie lo declaró, su precio_extra
 *  - categoría que NO es pizza → opciones intactas (ni se abre el catálogo)
 *
 * Ejecutar: node tests/unit/pizzepos__variaciones-extras-catalogo.test.js
 */

const assert = require('assert');
const Variaciones = require('../../modules/pizzepos/variaciones');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// Carta mínima con las TRES puertas que importan: dos de pizza y una que no lo es.
const carta = () => ({
  meta: { id: 'carta_extras' },
  categorias: [
    { id: 'la_flota', nombre: 'La Flota', tipo: 'pizzas' },
    { id: 'pizzas', nombre: 'Pizzas Puerto Seguro' },
    { id: 'el_fardel', nombre: 'El Fardel' }
  ],
  productos: [
    {
      id: 'la_flota_mahon', categoria_id: 'la_flota', precio: 12,
      ingredientes: [
        { id: 'salsa_the_pirate', nombre: 'Salsa The Pirate', precio_extra: 0.5, familia: 'salsa' },
        { id: 'mezcla_de_quesos', nombre: 'Mezcla de quesos', precio_extra: 0.5, familia: 'queso' },
        { id: 'jamon_de_york', nombre: 'Jamón de york', precio_extra: 1, familia: 'carne' }
      ],
      opciones: [
        { id: 'sin', etiqueta: 'Sin', modo: 'QUITAR', valores: [
          { id: 'salsa_the_pirate', etiqueta: 'Salsa The Pirate', delta_precio_centimos: 0 },
          { id: 'mozzarella', etiqueta: 'Mozzarella', delta_precio_centimos: 0 },
          { id: 'mezcla_de_quesos', etiqueta: 'Mezcla de quesos', delta_precio_centimos: 0 },
          { id: 'jamon_de_york', etiqueta: 'Jamón de york', delta_precio_centimos: 0 }
        ] }
      ]
    },
    {
      id: 'pizzas_margarita', categoria_id: 'pizzas', precio: 9,
      ingredientes: [
        { id: 'tomate', nombre: 'Tomate', precio_extra: 0.5, familia: 'verdura' },
        { id: 'mozzarella', nombre: 'Mozzarella', precio_extra: 0.5, familia: 'queso' },
        { id: 'albahaca', nombre: 'Albahaca', precio_extra: 0.5, familia: 'verdura' }
      ],
      opciones: [
        { id: 'sin', etiqueta: 'Sin', modo: 'QUITAR', valores: [
          { id: 'tomate', etiqueta: 'Tomate', delta_precio_centimos: 0 },
          { id: 'mozzarella', etiqueta: 'Mozzarella', delta_precio_centimos: 0 },
          { id: 'albahaca', etiqueta: 'Albahaca', delta_precio_centimos: 0 }
        ] },
        // Declara solo DOS extras y a precios del dueño (1,50 la carne): esto no se puede perder.
        { id: 'anadir', etiqueta: 'Añadir', modo: 'ELEGIR_VARIOS', min: 0, max: 10, valores: [
          { id: 'ternera', etiqueta: 'Ternera', ref: 'ternera', delta_precio_centimos: 150 },
          { id: 'cebolla', etiqueta: 'Cebolla', ref: 'cebolla', delta_precio_centimos: 50 }
        ] }
      ]
    },
    {
      id: 'el_fardel_barbanegra', categoria_id: 'el_fardel', precio: 7,
      ingredientes: [
        { id: 'pancito', nombre: 'Pancito', precio_extra: 0.5, familia: 'masa' },
        { id: 'atun', nombre: 'Atún', precio_extra: 1, familia: 'pescado' },
        { id: 'pepinillo_agridulce', nombre: 'Pepinillo agridulce', precio_extra: 0.5, familia: 'otro' }
      ],
      opciones: [
        { id: 'sin', etiqueta: 'Sin', modo: 'QUITAR', valores: [
          { id: 'pancito', etiqueta: 'Pancito', delta_precio_centimos: 0 },
          { id: 'atun', etiqueta: 'Atún', delta_precio_centimos: 0 }
        ] }
      ]
    }
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

test('La Flota (pizza por tipo): ofrece el catálogo entero, no solo su familia', async () => {
  const m = await configurado();
  const op = anadir(m.configuraciones.get('la_flota_mahon'));
  assert.ok(op, 'La Flota se quedó sin sección de Añadir');
  // Catálogo = 11 ingredientes únicos en la carta; el producto lleva 3 (más mozzarella por el QUITAR),
  // así que quedan 7. El pepinillo y el pancito solo viven en el fardel: si aparecen, NO hay filtro
  // por familia (que es justo el fallo que se arregló).
  assert.ok(ids(op).includes('pepinillo_agridulce'), 'el pepinillo (solo del fardel) no aparece en La Flota');
  assert.ok(ids(op).includes('pancito'), 'el pancito (solo del fardel) no aparece en La Flota');
  assert.strictEqual(ids(op).length, 7, `esperaba 7 extras, hay ${ids(op).length}: ${ids(op)}`);
  // Lo que el producto YA lleva no se ofrece como extra.
  for (const id of ['salsa_the_pirate', 'mezcla_de_quesos', 'jamon_de_york', 'mozzarella']) {
    assert.ok(!ids(op).includes(id), `${id} se ofrece como extra pero el producto ya lo lleva`);
  }
});

test('Puerto Seguro: conserva lo declarado con su precio y añade el resto del catálogo', async () => {
  const m = await configurado();
  const op = anadir(m.configuraciones.get('pizzas_margarita'));
  const porId = new Map(op.valores.map(v => [v.id, v]));
  // Lo declarado sigue ahí, con el precio del dueño (1,50) y no con el del catálogo (1,00).
  assert.ok(porId.has('ternera'), 'se perdió un extra declarado por la carta');
  assert.strictEqual(porId.get('ternera').delta_precio_centimos, 150);
  assert.strictEqual(porId.get('cebolla').delta_precio_centimos, 50);
  // Y ahora también lo que nadie había declarado, a su precio_extra del catálogo.
  assert.ok(porId.has('pepinillo_agridulce'), 'no se completó con el catálogo');
  assert.strictEqual(porId.get('pepinillo_agridulce').delta_precio_centimos, 50);
  assert.strictEqual(ids(op).length, 8, `esperaba 8 extras, hay ${ids(op).length}: ${ids(op)}`);
  // El máximo lo sigue mandando la carta.
  assert.strictEqual(m.configuraciones.get('pizzas_margarita').max_ingredientes_extra, 10);
});

test('El Fardel (no es pizza): intacto, sin abrir el catálogo', async () => {
  const m = await configurado();
  const cfg = m.configuraciones.get('el_fardel_barbanegra');
  assert.strictEqual(anadir(cfg), null, 'El Fardel abrió el catálogo y no debía');
  assert.deepStrictEqual(ids(quitar(cfg)), ['pancito', 'atun']);
});

test('La puerta de pizza se resuelve por tipo de categoría, id y nombre', async () => {
  const m = await configurado();
  assert.ok(anadir(m.configuraciones.get('la_flota_mahon')), 'tipo: pizzas no abre el catálogo');
  assert.ok(anadir(m.configuraciones.get('pizzas_margarita')), '«Pizzas Puerto Seguro» no abre el catálogo');
  assert.strictEqual(anadir(m.configuraciones.get('el_fardel_barbanegra')), null, 'un bocadillo abrió el catálogo');
});

test('Sin categorías en la carta, el id «pizzas» sigue abriendo el catálogo', async () => {
  const c = carta();
  delete c.categorias;
  const m = new Variaciones();
  m.metrics = { increment() {}, gauge() {}, observe() {} };
  await m.onCartaActualizada({ data: { carta: c } });
  assert.ok(anadir(m.configuraciones.get('pizzas_margarita')), 'sin categorias, «pizzas» no abrió el catálogo');
});

// ── runner ──
(async () => {
  let passed = 0, failed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; } catch (err) { failed++; fails.push({ name, err }); }
  }
  if (failed === 0) { console.log(`\n[pizzepos__variaciones-extras-catalogo] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[pizzepos__variaciones-extras-catalogo] FAIL ${failed}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

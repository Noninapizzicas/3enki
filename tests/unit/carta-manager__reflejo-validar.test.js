'use strict';

/**
 * carta-manager — REFLEJO _validar / _checkCarta (EL FRENO, skill blueprint-agentico).
 *
 * menu-generator DA FORMA a la carta (lo fuzzy) y la entrega al custodio. El custodio valida la
 * ESTRUCTURA contra el contrato carta-pizzepos ANTES de persistir — el agujero ORIGEN (carta1):
 * 10 productos huecos cantados como "✅ creada". El freno caza: carta sin categorías/productos,
 * producto sin nombre / precio inválido / categoria_id colgando, ingrediente sin nombre / familia
 * no canónica / precio_extra no numérico. NO exige completitud de borrador: precio 0 e ingredientes
 * vacíos (una bebida) son borrador legítimo — valida que lo que HAY esté bien formado.
 *
 * Función pura: no lee ni escribe. Ejecutar: node tests/unit/carta-manager__reflejo-validar.test.js
 */

const assert = require('assert');
const CartaManager = require('../../modules/pizzepos/carta-manager');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevo() {
  const m = new CartaManager();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  return m;
}

// carta bien formada: 1 categoría, 2 productos (uno con ingredientes, una bebida sin).
const CARTA_OK = {
  meta: { id: 'general', estado: 'borrador' },
  categorias: [{ id: 'pizzas', nombre: 'Pizzas' }, { id: 'bebidas', nombre: 'Bebidas' }],
  productos: [
    { id: 'margarita', nombre: 'Margarita', categoria_id: 'pizzas', precio: 8, ingredientes_base: [{ id: 'mozzarella', nombre: 'Mozzarella', familia: 'queso', precio_extra: 0.5 }] },
    { id: 'agua', nombre: 'Agua', categoria_id: 'bebidas', precio: 2, ingredientes_base: [] }
  ]
};
const clon = () => JSON.parse(JSON.stringify(CARTA_OK));

test('carta bien formada → valid:true', async () => {
  const m = nuevo();
  const r = await m._validar({ carta: CARTA_OK });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.valid, true, JSON.stringify(r.data.errors));
  assert.strictEqual(r.data.productos, 2);
});

test('bebida sin ingredientes + precio 0 → valid (borrador legítimo, no se prohíbe)', async () => {
  const m = nuevo();
  const c = clon();
  c.productos[1].precio = 0;            // borrador: precio aún sin poner
  c.productos[1].ingredientes_base = []; // bebida: sin extras
  assert.strictEqual((await m._validar({ carta: c })).data.valid, true);
});

test('carta sin productos → SIN_PRODUCTOS (el agujero carta1: carta cantada vacía)', async () => {
  const m = nuevo();
  const c = clon(); c.productos = [];
  const r = await m._validar({ carta: c });
  assert.strictEqual(r.data.valid, false);
  assert.ok(r.data.errors.some(e => e.code === 'SIN_PRODUCTOS'));
});

test('carta sin categorías → SIN_CATEGORIAS', async () => {
  const m = nuevo();
  const c = clon(); c.categorias = [];
  assert.ok((await m._validar({ carta: c })).data.errors.some(e => e.code === 'SIN_CATEGORIAS'));
});

test('producto sin nombre → PRODUCTO_SIN_NOMBRE', async () => {
  const m = nuevo();
  const c = clon(); c.productos[0].nombre = '';
  const r = await m._validar({ carta: c });
  assert.strictEqual(r.data.valid, false);
  assert.ok(r.data.errors.some(e => e.code === 'PRODUCTO_SIN_NOMBRE' && e.path === '/productos/0'));
});

test('precio no numérico → PRECIO_INVALIDO (pero 0 es válido, ya cubierto)', async () => {
  const m = nuevo();
  const c = clon(); c.productos[0].precio = 'ocho';
  assert.ok((await m._validar({ carta: c })).data.errors.some(e => e.code === 'PRECIO_INVALIDO'));
});

test('categoria_id que no existe en categorias[] → CATEGORIA_DANGLING', async () => {
  const m = nuevo();
  const c = clon(); c.productos[0].categoria_id = 'fantasma';
  const r = await m._validar({ carta: c });
  assert.ok(r.data.errors.some(e => e.code === 'CATEGORIA_DANGLING'));
});

test('producto sin categoria_id → PRODUCTO_SIN_CATEGORIA', async () => {
  const m = nuevo();
  const c = clon(); delete c.productos[0].categoria_id;
  assert.ok((await m._validar({ carta: c })).data.errors.some(e => e.code === 'PRODUCTO_SIN_CATEGORIA'));
});

test('ingrediente sin nombre → INGREDIENTE_SIN_NOMBRE', async () => {
  const m = nuevo();
  const c = clon(); c.productos[0].ingredientes_base[0].nombre = '';
  const r = await m._validar({ carta: c });
  assert.ok(r.data.errors.some(e => e.code === 'INGREDIENTE_SIN_NOMBRE' && e.path === '/productos/0/ingredientes/0'));
});

test('familia no canónica → FAMILIA_DESCONOCIDA', async () => {
  const m = nuevo();
  const c = clon(); c.productos[0].ingredientes_base[0].familia = 'lacteo';
  assert.ok((await m._validar({ carta: c })).data.errors.some(e => e.code === 'FAMILIA_DESCONOCIDA'));
});

test('precio_extra no numérico → PRECIO_EXTRA_INVALIDO', async () => {
  const m = nuevo();
  const c = clon(); c.productos[0].ingredientes_base[0].precio_extra = 'caro';
  assert.ok((await m._validar({ carta: c })).data.errors.some(e => e.code === 'PRECIO_EXTRA_INVALIDO'));
});

test('familia/precio_extra ausentes → válido (el normalizador los rellena al guardar)', async () => {
  const m = nuevo();
  const c = clon();
  delete c.productos[0].ingredientes_base[0].familia;
  delete c.productos[0].ingredientes_base[0].precio_extra;
  assert.strictEqual((await m._validar({ carta: c })).data.valid, true);
});

test('acepta la carta cruda (sin envoltorio "carta")', async () => {
  const m = nuevo();
  assert.strictEqual((await m._validar(CARTA_OK)).data.valid, true);
});

test('carta ausente → CARTA_AUSENTE', async () => {
  const m = nuevo();
  const r = await m._validar({ carta: null });
  assert.strictEqual(r.data.valid, false);
  assert.ok(r.data.errors.some(e => e.code === 'CARTA_AUSENTE'));
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[carta-manager__reflejo-validar] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[carta-manager__reflejo-validar] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

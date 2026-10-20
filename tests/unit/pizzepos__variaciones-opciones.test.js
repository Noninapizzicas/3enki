'use strict';

/**
 * Paso 2 del banco de pruebas Opciones: `variaciones` sirve `producto.opciones` (derivadas de la
 * carta cuando el producto no las trae) y valida/precia con _shared/motor-opciones.
 *
 * Alimenta el módulo con una carta real (vía onCartaActualizada, sin bus/fs) y comprueba:
 *  - get devuelve opciones QUITAR (los propios) + ELEGIR_VARIOS (la paleta de su categoría menos lo propio)
 *  - los campos legacy (permite_anadir) siguen ahí (aditivo, no rompe el panel actual)
 *  - evaluar valida+precia server-side con el motor
 *
 * Ejecutar: node tests/unit/pizzepos__variaciones-opciones.test.js
 */

const assert = require('assert');
const Variaciones = require('../../modules/pizzepos/variaciones');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// Carta mínima real (2 pizzas que comparten ingredientes → la paleta de pizzicas tiene extras; 1 bebida).
const carta = {
  meta: { id: 'carta_test' },
  productos: [
    { id: 'pizzicas_batucada', categoria_id: 'pizzicas', precio: 10.5, ingredientes: [
      { id: 'tomate', nombre: 'Tomate' }, { id: 'mozzarella', nombre: 'Mozzarella' },
      { id: 'queso_azul', nombre: 'Queso azul' }, { id: 'mezcla_de_quesos', nombre: 'Mezcla de quesos' },
      { id: 'nata', nombre: 'Nata' },
    ] },
    { id: 'pizzicas_country', categoria_id: 'pizzicas', precio: 11.5, ingredientes: [
      { id: 'tomate', nombre: 'Tomate' }, { id: 'salsa_bbq', nombre: 'Salsa BBQ' }, { id: 'nata', nombre: 'Nata' },
      { id: 'pollo', nombre: 'Pollo' }, { id: 'mezcla_de_quesos', nombre: 'Mezcla de quesos' },
      { id: 'cebolla', nombre: 'Cebolla' }, { id: 'bacon', nombre: 'Bacon' },
    ] },
    { id: 'bebidas_agua', categoria_id: 'bebidas', precio: 1, ingredientes: [] },
  ],
};

async function cargado() {
  const m = new Variaciones();
  await m.onCartaActualizada({ data: { carta } });
  return m;
}

test('get(Batucada): QUITAR = sus 5 ingredientes', async () => {
  const m = await cargado();
  const r = await m.handleGetVariacionesProducto({ producto_id: 'pizzicas_batucada' });
  const sin = r.data.opciones.find(o => o.modo === 'QUITAR');
  assert.ok(sin, 'falta QUITAR');
  assert.strictEqual(sin.valores.length, 5);
});

test('get(Batucada): ELEGIR_VARIOS = paleta de pizzicas menos lo propio (4)', async () => {
  const m = await cargado();
  const r = await m.handleGetVariacionesProducto({ producto_id: 'pizzicas_batucada' });
  const anadir = r.data.opciones.find(o => o.modo === 'ELEGIR_VARIOS');
  assert.ok(anadir, 'falta ELEGIR_VARIOS — el comandero no tendría "sumar"');
  // paleta pizzicas (union de las 2 pizzas) = 9 ; Batucada lleva 5 ; 9-5 = 4
  assert.strictEqual(anadir.valores.length, 4);
  assert.ok(anadir.valores.some(v => v.id === 'bacon'));
});

test('get(Batucada): los campos legacy siguen (aditivo) — permite_anadir true', async () => {
  const m = await cargado();
  const r = await m.handleGetVariacionesProducto({ producto_id: 'pizzicas_batucada' });
  assert.strictEqual(r.data.permite_anadir, true);
  assert.strictEqual(r.data.precio_base_centimos, 1050);
});

test('get(Agua): sin ingredientes y sin paleta → opciones vacías (no se ofrecen toppings a una bebida)', async () => {
  const m = await cargado();
  const r = await m.handleGetVariacionesProducto({ producto_id: 'bebidas_agua' });
  assert.deepStrictEqual(r.data.opciones, []);
});

test('evaluar(Batucada, +bacon): válida; precio 1050 (sin precio_extra en la carta aún)', async () => {
  const m = await cargado();
  const r = await m.handleEvaluarOpciones({ producto_id: 'pizzicas_batucada', selecciones: { anadir: ['bacon'] } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.valida, true);
  assert.strictEqual(r.data.precio_final_centimos, 1050);
});

test('evaluar(Batucada, +inexistente): rechazada (400)', async () => {
  const m = await cargado();
  const r = await m.handleEvaluarOpciones({ producto_id: 'pizzicas_batucada', selecciones: { anadir: ['caviar'] } });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.data.valida, false);
});

// ── el MÁXIMO lo manda la carta, no el 5 viejo ──
// Visto en vivo 2026-10-20: the-pirate declaraba `max: 10` en las opciones y variaciones.get
// devolvía max_ingredientes_extra: 5 (el campo viejo), así que la validación (onComanderoItemAgregado)
// rechazaba el 6º extra que la carta sí permite. El panel y el camarero veían 10; el motor, 5.
const cartaConMax = (max) => ({
  meta: { id: 'carta_max' },
  productos: [{
    id: 'pizzas_prueba', categoria_id: 'pizzas', precio: 10,
    ingredientes: [{ id: 'tomate', nombre: 'Tomate' }, { id: 'mozzarella', nombre: 'Mozzarella' }],
    opciones: [
      { id: 'sin', etiqueta: 'Sin', modo: 'QUITAR', valores: [{ id: 'tomate', etiqueta: 'Tomate' }] },
      { id: 'anadir', etiqueta: 'Añadir', modo: 'ELEGIR_VARIOS', min: 0, max,
        valores: [{ id: 'bacon', etiqueta: 'Bacon' }, { id: 'cebolla', etiqueta: 'Cebolla' }] },
    ],
  }],
});

test('get: el max declarado en las opciones de la carta es el que devuelve (10, no 5)', async () => {
  const m = new Variaciones();
  await m.onCartaActualizada({ data: { carta: cartaConMax(10) } });
  const r = await m.handleGetVariacionesProducto({ producto_id: 'pizzas_prueba' });
  assert.strictEqual(r.data.max_ingredientes_extra, 10);
});

test('get: la carta gana al campo viejo variaciones.max_ingredientes_extra', async () => {
  const carta = cartaConMax(10);
  carta.productos[0].variaciones = { max_ingredientes_extra: 3 };
  const m = new Variaciones();
  await m.onCartaActualizada({ data: { carta } });
  const r = await m.handleGetVariacionesProducto({ producto_id: 'pizzas_prueba' });
  assert.strictEqual(r.data.max_ingredientes_extra, 10);
});

test('validar: con max 10 de la carta, 6 extras NO se rechazan', async () => {
  const m = new Variaciones();
  m.metrics = { increment() {}, gauge() {}, observe() {} };
  m.eventBus = { publish: async () => {}, subscribe: async () => () => {} };
  const carta = cartaConMax(10);
  const paleta = ['bacon', 'cebolla', 'atun', 'huevo', 'maiz', 'pina', 'olivas_negras'];
  carta.productos[0].opciones[1].valores = paleta.map(id => ({ id, etiqueta: id }));
  await m.onCartaActualizada({ data: { carta } });
  const r = await m.handleValidarVariacion({
    producto_id: 'pizzas_prueba',
    variaciones: { ingredientes_anadir: ['bacon', 'cebolla', 'atun', 'huevo', 'maiz', 'pina'] }
  });
  assert.strictEqual(r.status, 200, `rechazó 6 extras: ${JSON.stringify(r.data)}`);
});

// ── runner ──
(async () => {
  let passed = 0, failed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; } catch (err) { failed++; fails.push({ name, err }); }
  }
  if (failed === 0) { console.log(`\n[pizzepos__variaciones-opciones] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[pizzepos__variaciones-opciones] FAIL ${failed}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

/**
 * Tests de pizza-a-universal — el mapeador que carga el peso de la convergencia (a).
 * La prueba dura: la salida PASA EL FRENO REAL de producto-manager (_checkProducto),
 * no un mock. Si pasa, una pizza puede escribirse en catalogo.* como ProductoUniversal.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { pizzaAUniversal } = require('../../modules/_shared/pizza-a-universal.js');
const ProductoManagerReflejo = require('../../modules/prisma/producto-manager/index.js');

const PM = new ProductoManagerReflejo();

const PIZZA = {
  id: 'pizzas_bachata',
  nombre: 'Bachata',
  precio: 8.5,
  categoria_id: 'pizzas',
  descripcion: 'pizza artesanal con base de tomate',
  alergenos: ['gluten', 'lactosa'],
  ingredientes: [
    { id: 'mozzarella', nombre: 'Mozzarella', familia: 'queso', precio_extra: 0 },
    { id: 'tomate', nombre: 'Tomate', familia: 'salsa', precio_extra: 0 }
  ],
  ingredientes_base: [
    { id: 'jamon', nombre: 'Jamón', familia: 'carne', precio_extra: 1.5 }
  ]
};

test('mapea los campos esenciales pizza → ProductoUniversal', () => {
  const u = pizzaAUniversal(PIZZA);
  assert.equal(u.nombre, 'Bachata');
  assert.equal(u.arquetipo, 'comestible');
  assert.equal(u.identidad.que_es, 'pizza artesanal con base de tomate');
  assert.equal(u.precio_base_centimos, 850);                 // 8.5€ → 850 céntimos
  assert.equal(u.naturalezas.stock, 'ingredientes');
  assert.equal(u.madurez, 'listo');                          // tiene precio
});

test('alérgenos → restricciones verdad_obligatoria (no negociable)', () => {
  const u = pizzaAUniversal(PIZZA);
  assert.equal(u.restricciones.length, 2);
  assert.ok(u.restricciones.every(r => r.tipo === 'verdad_obligatoria' && r.no_negociable === true));
  assert.ok(u.restricciones.some(r => r.regla.includes('gluten')));
});

test('ingredientes → opción QUITAR; extras → opción ELEGIR_VARIOS con delta en céntimos', () => {
  const u = pizzaAUniversal(PIZZA);
  const quitar = u.contrato.opciones.find(o => o.modo === 'QUITAR');
  assert.ok(quitar && quitar.valores.length === 2);
  const extras = u.contrato.opciones.find(o => o.modo === 'ELEGIR_VARIOS');
  assert.ok(extras && extras.valores[0].delta_precio === 150);   // 1.5€ → 150 céntimos
});

test('LA PRUEBA DURA — la salida pasa el freno REAL de producto-manager', () => {
  const u = pizzaAUniversal(PIZZA);
  const errs = PM._checkProducto(u);
  assert.deepEqual(errs, [], 'el ProductoUniversal mapeado no tiene errores de forma');
});

test('sin precio → borrador legítimo: pregunta de coste abierta, madurez a la espera, y AÚN pasa el freno', () => {
  const u = pizzaAUniversal({ nombre: 'Especial del día', categoria_id: 'pizzas' });
  assert.equal(u.madurez, 'necesita_aclaracion_comerciante');
  assert.ok(u.preguntas_abiertas.some(q => q.campo === 'coste' && !q.respondida));
  assert.equal(u.precio_base_centimos, undefined);           // no inventa precio
  assert.deepEqual(PM._checkProducto(u), []);                // borrador válido, no roto
});

test('NO ata receta_ref (lo hace recetario por nombre) — el arco queda por atar, no forzado', () => {
  const u = pizzaAUniversal(PIZZA);
  assert.equal(u.receta_ref, undefined);
});

test('input basura → null (no revienta el que llama)', () => {
  assert.equal(pizzaAUniversal(null), null);
  assert.equal(pizzaAUniversal({}), null);                   // sin nombre
});

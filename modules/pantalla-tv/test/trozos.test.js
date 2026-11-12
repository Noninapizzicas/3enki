'use strict';

/**
 * Tests de la traducción PEDIDO DE COCINA → LISTA DE TROZOS — sin disco, sin bus.
 * Uso: node modules/pantalla-tv/test/trozos.test.js
 *
 * Lo que se protege (es lo que se ve en la calle si falla):
 *   · una cuenta que NO es del mostrador no toca la franja (mesa y llevar no son existencias);
 *   · mandar pizzas dos veces el mismo día AÑADE, no borra;
 *   · un documento de ayer se descarta entero (nadie anuncia lo que ya no hay);
 *   · el mismo producto no sale dos veces;
 *   · sin pizzas válidas no hay documento → la franja se colapsa.
 */

const assert = require('assert');
const { esCuentaDeTrozos, documentoDeTrozos, pizzasDe } = require('../fuentes/trozos');

let ok = 0;
const probar = (nombre, fn) => {
  try { fn(); console.log(`  ok  ${nombre}`); ok++; }
  catch (e) { console.log(`  FALLA ${nombre}\n        ${e.message}`); process.exitCode = 1; }
};

const HOY = '2026-11-12';
const item = (producto_id, nombre, cantidad = 1) => ({ producto_id, nombre, cantidad, precio: 12 });

probar('solo la cuenta del mostrador alimenta la franja', () => {
  assert.strictEqual(esCuentaDeTrozos('trozos_9f2a1b7c'), true);
  assert.strictEqual(esCuentaDeTrozos('mesa_1'), false);
  assert.strictEqual(esCuentaDeTrozos('llevar_20261112_001'), false);
  assert.strictEqual(esCuentaDeTrozos('whatsapp_abc'), false);
  assert.strictEqual(esCuentaDeTrozos(null), false);
});

probar('tres pizzas a cocina = tres piezas con su nombre', () => {
  const doc = documentoDeTrozos({
    items: [item('pizzas_pizza_de_atun', 'Pizza de atún'), item('la_flota_mahon', 'Mahón'), item('pizzas_punk', 'Punk')],
    hoy: HOY, cuenta_id: 'trozos_9f2a1b7c'
  });
  assert.strictEqual(doc.fecha, HOY);
  assert.strictEqual(doc.pizzas.length, 3);
  assert.deepStrictEqual(doc.pizzas.map(p => p.producto_id), ['pizzas_pizza_de_atun', 'la_flota_mahon', 'pizzas_punk']);
  assert.strictEqual(doc.precio_porcion, 3);
  assert.deepStrictEqual(doc.bundle, { cada: 4, precio: 10.5 });
  assert.strictEqual(doc.origen.cuenta_id, 'trozos_9f2a1b7c');
});

probar('el mismo producto no se anuncia dos veces', () => {
  const doc = documentoDeTrozos({
    items: [item('pizzas_pizza_de_atun', 'Pizza de atún', 2), item('pizzas_pizza_de_atun', 'Pizza de atún')],
    hoy: HOY
  });
  assert.strictEqual(doc.pizzas.length, 1);
});

probar('mandar a las 20:00 no borra lo de las 19:00 (mismo día)', () => {
  const previo = {
    fecha: HOY, precio_porcion: 3,
    pizzas: [{ producto_id: 'la_flota_mahon', nombre: 'Mahón', imagen: null }],
    bundle: { cada: 4, precio: 10.5 }
  };
  const doc = documentoDeTrozos({ items: [item('pizzas_punk', 'Punk')], hoy: HOY, previo });
  assert.deepStrictEqual(doc.pizzas.map(p => p.producto_id), ['la_flota_mahon', 'pizzas_punk']);
});

probar('el documento de ayer se descarta entero', () => {
  const previo = {
    fecha: '2026-11-11', precio_porcion: 3,
    pizzas: [{ producto_id: 'la_flota_mahon', nombre: 'Mahón' }]
  };
  const doc = documentoDeTrozos({ items: [item('pizzas_punk', 'Punk')], hoy: HOY, previo });
  assert.deepStrictEqual(doc.pizzas.map(p => p.producto_id), ['pizzas_punk']);
});

probar('previo = null (el fichero no existe) no revienta: precio por defecto', () => {
  const doc = documentoDeTrozos({ items: [item('pizzas_punk', 'Punk')], hoy: HOY, previo: null });
  assert.strictEqual(doc.precio_porcion, 3);
  assert.deepStrictEqual(doc.bundle, { cada: 4, precio: 10.5 });
});

probar('el precio y el bulto salen del cableado cuando están', () => {
  const doc = documentoDeTrozos({
    items: [item('pizzas_punk', 'Punk')], hoy: HOY,
    precio_porcion: 3.5, bundle: { cada: 5, precio: 15 }
  });
  assert.strictEqual(doc.precio_porcion, 3.5);
  assert.deepStrictEqual(doc.bundle, { cada: 5, precio: 15 });
});

probar('sin pizzas válidas no hay documento (la franja se colapsa)', () => {
  assert.strictEqual(documentoDeTrozos({ items: [], hoy: HOY }), null);
  assert.strictEqual(documentoDeTrozos({ items: [{ nombre: 'sin id' }], hoy: HOY }), null);
  assert.strictEqual(documentoDeTrozos({ hoy: HOY }), null);
});

probar('pizzasDe: un item sin nombre se nombra por su id, no queda en blanco', () => {
  const [p] = pizzasDe([{ producto_id: 'pizzas_punk' }]);
  assert.strictEqual(p.nombre, 'pizzas_punk');
});

console.log(`\n${ok} pruebas de trozos en verde`);
process.exit(process.exitCode || 0);

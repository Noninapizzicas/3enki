/**
 * Round-trip del autoservicio: PWA (#P1 por ids) → parser del bot → tasador.
 * Demuestra que las tres rebanadas encajan: la PWA codifica el pedido por ids, el bot lo
 * decodifica, y el re-tasado da los precios del servidor con la estructura intacta.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { parsearPedido } = require('../../modules/whatsapp-bot/services/pedido-parser');
const { tasarPedido } = require('../../modules/_shared/pedido-tasador');

// Réplica EXACTA de buildP1Line() de la PWA (btoa(unescape(encodeURIComponent(json))) → base64url).
function pwaP1(items) {
  const json = JSON.stringify({ v: 1, items });
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return '#P1 ' + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pwaMensaje(items, opts) {
  opts = opts || {};
  return [
    'PEDIDO nonina-A3F2',
    '- 1 x lo que sea (9,99 EUR)',      // línea humana (el bot la ignora si hay #P1)
    'Total: ' + (opts.totalCliente || '0,01') + ' EUR',   // cliente intenta colar un total bajo
    'Nombre: Juan',
    pwaP1(items)
  ].join('\n');
}

const CARTA = {
  productos: [
    { id: 'bachata', nombre: 'Bachata', precio: 9.5 },
    { id: 'tropical', nombre: 'Tropical', precio: 11 },
    { id: 'margarita', nombre: 'Margarita', precio: 8 }
  ],
  ingredientes_catalogo: [
    { id: 'i_bacon', nombre: 'Bacon', precio_extra: 1.5 },
    { id: 'i_ajo', nombre: 'Ajo', precio_extra: 0.8 }
  ]
};

test('round-trip — normal con variaciones: PWA→bot→tasador, precio del servidor', () => {
  // Lo que produciría addDetailToCart de la PWA: anadir por ids, quitar por nombre.
  const items = [{ cantidad: 1, producto_id: 'bachata', tipo: 'normal', quitar: ['Anchoas'], anadir: ['i_bacon'] }];
  const parsed = parsearPedido(pwaMensaje(items));
  assert.ok(parsed.estructura, 'el parser decodifica el #P1 de la PWA');
  const t = tasarPedido(parsed.estructura.items, CARTA);
  assert.equal(t.ok, true);
  assert.equal(t.total_centimos, 950 + 150);     // bachata + bacon; quitar gratis (NO el 0,01 del cliente)
  assert.equal(t.items[0].descripcion, 'Bachata (sin Anchoas, + Bacon)');
});

test('round-trip — al_gusto: base por id + extras', () => {
  const items = [{ cantidad: 1, tipo: 'al_gusto', producto_id: 'margarita', base_id: 'margarita', anadir: ['i_ajo'] }];
  const parsed = parsearPedido(pwaMensaje(items));
  const t = tasarPedido(parsed.estructura.items, CARTA);
  assert.equal(t.total_centimos, 800 + 80);
  assert.equal(t.items[0].nombre, 'Margarita al gusto');
});

test('round-trip — mitad con variaciones en ambas: max+extras, estructura a cocina', () => {
  const items = [{
    cantidad: 1, tipo: 'mitad_mitad',
    pizza_izquierda: { id: 'bachata', quitar: ['Anchoas'], anadir: [] },
    pizza_derecha: { id: 'tropical', quitar: [], anadir: ['i_ajo'] }
  }];
  const parsed = parsearPedido(pwaMensaje(items));
  const t = tasarPedido(parsed.estructura.items, CARTA);
  assert.equal(t.total_centimos, 1180);          // max(950,1100)+ajo(80)
  assert.equal(t.items[0].pizza_izquierda.id, 'bachata');
  assert.equal(t.items[0].pizza_derecha.anadir[0], 'Ajo');
});

test('round-trip — utf8 (acentos en quitar) sobrevive al base64url', () => {
  const items = [{ cantidad: 2, producto_id: 'tropical', tipo: 'normal', quitar: ['Piña', 'Jamón'], anadir: [] }];
  const parsed = parsearPedido(pwaMensaje(items));
  assert.ok(parsed.estructura);
  const t = tasarPedido(parsed.estructura.items, CARTA);
  assert.equal(t.items[0].descripcion, 'Tropical (sin Piña, sin Jamón)');
  assert.equal(t.items[0].precio_total_centimos, 1100 * 2);
});

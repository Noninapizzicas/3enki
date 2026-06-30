/**
 * Tests del tasador de pedidos (re-tasado server-side, seguridad anti-manipulación).
 * El precio SIEMPRE nace de la carta; el cliente no aporta precios (los ids son lo único que viaja).
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { tasarPedido } = require('../../modules/_shared/pedido-tasador.js');

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

test('normal — precio del producto, sin extras', () => {
  const r = tasarPedido([{ producto_id: 'bachata', cantidad: 1, tipo: 'normal' }], CARTA);
  assert.equal(r.ok, true);
  assert.equal(r.items[0].precio_unitario_centimos, 950);
  assert.equal(r.total_centimos, 950);
});

test('normal con variaciones — quitar gratis, añadir suma; descripción legible', () => {
  const r = tasarPedido([{
    producto_id: 'bachata', cantidad: 1, tipo: 'normal',
    quitar: ['Anchoas'], anadir: ['i_bacon']
  }], CARTA);
  assert.equal(r.items[0].precio_unitario_centimos, 950 + 150);   // bacon +1,50; quitar gratis
  assert.equal(r.items[0].descripcion, 'Bachata (sin Anchoas, + Bacon)');
  assert.deepEqual(r.items[0].variaciones, { ingredientes_quitar: ['Anchoas'], ingredientes_anadir: ['Bacon'] });
});

test('al_gusto — base elegida + extras', () => {
  const r = tasarPedido([{
    producto_id: 'margarita', base_id: 'margarita', cantidad: 1, tipo: 'al_gusto',
    anadir: ['i_bacon', 'i_ajo']
  }], CARTA);
  assert.equal(r.items[0].precio_unitario_centimos, 800 + 150 + 80);   // 8 + bacon + ajo
  assert.equal(r.items[0].nombre, 'Margarita al gusto');
});

test('mitad — política max(izq,der) + extras de AMBAS mitades (idéntica al comandero)', () => {
  const r = tasarPedido([{
    cantidad: 1, tipo: 'mitad_mitad',
    pizza_izquierda: { id: 'bachata', quitar: ['Anchoas'], anadir: [] },
    pizza_derecha: { id: 'tropical', quitar: [], anadir: ['i_ajo'] }
  }], CARTA);
  // max(950, 1100) + ajo(80) = 1180 ; quitar gratis
  assert.equal(r.items[0].precio_unitario_centimos, 1180);
  assert.equal(r.items[0].descripcion, '½ Bachata (sin Anchoas) + ½ Tropical (+ Ajo)');
  assert.equal(r.items[0].pizza_izquierda.id, 'bachata');
  assert.equal(r.items[0].pizza_derecha.id, 'tropical');
});

test('cantidad — el total de línea multiplica el unitario', () => {
  const r = tasarPedido([{ producto_id: 'tropical', cantidad: 3, tipo: 'normal' }], CARTA);
  assert.equal(r.items[0].precio_total_centimos, 1100 * 3);
  assert.equal(r.total_centimos, 3300);
});

test('SEGURIDAD — el cliente no puede colar precio; un precio en el item se ignora', () => {
  // Aunque el cliente meta precios falsos en el item, el tasador solo mira ids+carta.
  const r = tasarPedido([{
    producto_id: 'bachata', cantidad: 1, tipo: 'normal',
    precio_unitario_centimos: 1, precio_total_centimos: 1, total_centimos: 1
  }], CARTA);
  assert.equal(r.items[0].precio_unitario_centimos, 950);   // el de la carta, no el '1' del cliente
});

test('producto desconocido → ok=false (no_silent_failures), el bot avisará', () => {
  const r = tasarPedido([{ producto_id: 'no_existe', cantidad: 1, tipo: 'normal' }], CARTA);
  assert.equal(r.ok, false);
  assert.equal(r.errores[0].code, 'PRODUCTO_DESCONOCIDO');
});

test('extra desconocido → NO se cobra y se avisa (el pedido sigue)', () => {
  const r = tasarPedido([{
    producto_id: 'bachata', cantidad: 1, tipo: 'normal', anadir: ['i_fantasma']
  }], CARTA);
  assert.equal(r.ok, true);
  assert.equal(r.items[0].precio_unitario_centimos, 950);   // no suma el fantasma
  assert.equal(r.avisos[0].code, 'EXTRA_DESCONOCIDO');
});

test('pedido vacío → ok=false', () => {
  const r = tasarPedido([], CARTA);
  assert.equal(r.ok, false);
  assert.equal(r.errores[0].code, 'SIN_ITEMS');
});

test('mixto — varias líneas suman el total correcto', () => {
  const r = tasarPedido([
    { producto_id: 'bachata', cantidad: 2, tipo: 'normal' },                    // 1900
    { producto_id: 'margarita', cantidad: 1, tipo: 'al_gusto', base_id: 'margarita', anadir: ['i_ajo'] }  // 880
  ], CARTA);
  assert.equal(r.ok, true);
  assert.equal(r.total_centimos, 1900 + 880);
});

// ── ingredientes_base: lo que cocina pinta para saber qué lleva el plato ──
test('ingredientes_base — normal lleva los ingredientes del plato (de objetos → nombres)', () => {
  const carta = { productos: [{ id: 'bachata', nombre: 'Bachata', precio: 9.5, ingredientes: [{ nombre: 'Mozzarella' }, { nombre: 'Tomate' }] }], ingredientes_catalogo: [] };
  const r = tasarPedido([{ producto_id: 'bachata', cantidad: 1, tipo: 'normal' }], carta);
  assert.deepEqual(r.items[0].ingredientes_base, ['Mozzarella', 'Tomate']);
});

test('ingredientes_base — acepta ingredientes_base ya como strings', () => {
  const carta = { productos: [{ id: 'bachata', nombre: 'Bachata', precio: 9.5, ingredientes_base: ['Mozzarella', 'Tomate'] }], ingredientes_catalogo: [] };
  const r = tasarPedido([{ producto_id: 'bachata', cantidad: 1, tipo: 'normal' }], carta);
  assert.deepEqual(r.items[0].ingredientes_base, ['Mozzarella', 'Tomate']);
});

test('ingredientes_base — mitad: cada mitad lleva los suyos (cocina pinta ambas)', () => {
  const carta = { productos: [
    { id: 'bachata', nombre: 'Bachata', precio: 9.5, ingredientes: [{ nombre: 'Mozzarella' }] },
    { id: 'tropical', nombre: 'Tropical', precio: 11, ingredientes: [{ nombre: 'Piña' }, { nombre: 'Jamón' }] }
  ], ingredientes_catalogo: [] };
  const r = tasarPedido([{ cantidad: 1, tipo: 'mitad_mitad', pizza_izquierda: { id: 'bachata' }, pizza_derecha: { id: 'tropical' } }], carta);
  assert.deepEqual(r.items[0].pizza_izquierda.ingredientes_base, ['Mozzarella']);
  assert.deepEqual(r.items[0].pizza_derecha.ingredientes_base, ['Piña', 'Jamón']);
});

test('ingredientes_base — producto sin ingredientes: el campo no aparece (no rompe el camino feliz)', () => {
  const r = tasarPedido([{ producto_id: 'bachata', cantidad: 1, tipo: 'normal' }], CARTA);
  assert.equal('ingredientes_base' in r.items[0], false);
});

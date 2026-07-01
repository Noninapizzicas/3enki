/**
 * Tests de prisma/carrito — el buffer de venta universal. Añadir/quitar/actualizar
 * ítems, total en céntimos. Con precio inline (precio_unitario_centimos) no toca el
 * bus, así que el flujo del buffer se prueba puro. La tasación vía opciones (RPC) es
 * integración en vivo.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const PrismaCarritoReflejo = require('../../modules/prisma/carrito/index.js');

test('añade ítems y suma el total en céntimos', async () => {
  const C = new PrismaCarritoReflejo();
  await C._addItem({ cuenta_id: 'c1', producto_id: 'bachata', nombre: 'Bachata', precio_unitario_centimos: 1400, cantidad: 1 });
  const r = await C._addItem({ cuenta_id: 'c1', producto_id: 'agua', nombre: 'Agua', precio_unitario_centimos: 200, cantidad: 2 });
  assert.equal(r.status, 201);
  assert.equal(r.data.carrito.total_centimos, 1400 + 400);   // 1800
  assert.equal(r.data.carrito.items.length, 2);
});

test('actualizar cantidad recalcula subtotal y total', async () => {
  const C = new PrismaCarritoReflejo();
  const add = await C._addItem({ cuenta_id: 'c1', producto_id: 'x', nombre: 'X', precio_unitario_centimos: 500, cantidad: 1 });
  const id = add.data.item.id;
  const r = await C._updateItem({ cuenta_id: 'c1', item_id: id, cantidad: 3 });
  assert.equal(r.data.item.subtotal_centimos, 1500);
  assert.equal(r.data.carrito.total_centimos, 1500);
});

test('actualizar cantidad a 0 elimina el ítem', async () => {
  const C = new PrismaCarritoReflejo();
  const add = await C._addItem({ cuenta_id: 'c1', producto_id: 'x', nombre: 'X', precio_unitario_centimos: 500 });
  const r = await C._updateItem({ cuenta_id: 'c1', item_id: add.data.item.id, cantidad: 0 });
  assert.equal(r.data.carrito.items.length, 0);
  assert.equal(r.data.carrito.total_centimos, 0);
});

test('quitar un ítem recalcula el total', async () => {
  const C = new PrismaCarritoReflejo();
  const a = await C._addItem({ cuenta_id: 'c1', nombre: 'A', precio_unitario_centimos: 300 });
  await C._addItem({ cuenta_id: 'c1', nombre: 'B', precio_unitario_centimos: 700 });
  const r = await C._removeItem({ cuenta_id: 'c1', item_id: a.data.item.id });
  assert.equal(r.data.carrito.total_centimos, 700);
  assert.equal(r.data.carrito.items.length, 1);
});

test('get de una cuenta sin carrito → vacío; vaciar borra', async () => {
  const C = new PrismaCarritoReflejo();
  assert.deepEqual((await C._get({ cuenta_id: 'nueva' })).data.items, []);
  await C._addItem({ cuenta_id: 'c1', nombre: 'A', precio_unitario_centimos: 100 });
  await C._vaciar({ cuenta_id: 'c1' });
  assert.deepEqual(C._get({ cuenta_id: 'c1' }).data.items, []);
});

test('guarda la selección del cliente en el ítem (para el cobro y la cocina)', async () => {
  const C = new PrismaCarritoReflejo();
  const r = await C._addItem({ cuenta_id: 'c1', producto_id: 'bachata', nombre: 'Bachata', precio_unitario_centimos: 1400, selecciones: { tamano: ['familiar'], quitar: ['cebolla'] } });
  assert.deepEqual(r.data.item.selecciones, { tamano: ['familiar'], quitar: ['cebolla'] });
});

test('persistencia: snapshot filtra por proyecto y hidratar restaura el buffer', async () => {
  const A = new PrismaCarritoReflejo();
  await A._addItem({ cuenta_id: 'c1', nombre: 'A', precio_unitario_centimos: 1000, project_id: 'p1' });
  await A._addItem({ cuenta_id: 'c2', nombre: 'B', precio_unitario_centimos: 500, project_id: 'p2' });
  const snap = A._persist._snapshot('p1');
  assert.equal(snap.carritos.length, 1);          // solo c1 (p1)
  assert.equal(snap.carritos[0][0], 'c1');
  const B = new PrismaCarritoReflejo();
  B._persist._hidratar('p1', snap);
  assert.equal(B._get({ cuenta_id: 'c1' }).data.total_centimos, 1000);
  assert.deepEqual(B._get({ cuenta_id: 'c2' }).data.items, []);   // p2 no viaja en el snapshot de p1
  A._persist.detener(); B._persist.detener();
});

console.log('prisma__carrito: asserts definidos');

/**
 * CANAL en el autoservicio: el modo de consumo (mesa | recoger | llevar) + la hora
 * pactada viajan PWA → #P1 → parser → pedido.crear-tienda → cuenta (tipo + metadata).
 *
 * Fija el hilo abierto en esta pasada: el dato NO existía (canal:null, tipo hardcodeado
 * 'llevar'); ahora el modo elegido por el cliente fija el tipo de la cuenta y la hora
 * viaja en metadata (la agenda futura la leerá; hoy solo se muestra).
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { parsearPedido } = require('../../modules/whatsapp-bot/services/pedido-parser');
const PedidosModule = require('../../modules/pizzepos/pedidos/index.js');

function p1Line(payload) {
  const b64url = Buffer.from(JSON.stringify(payload), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return '#P1 ' + b64url;
}

function mensaje(p1) {
  return [
    'PEDIDO nonina-A3F2',
    '- 1 x Bachata (10,00 EUR)',
    'Total: 10,00 EUR',
    'Nombre: Juan',
    p1
  ].join('\n');
}

test('parser — #P1 con modo_consumo recoger + hora aflora en parsed', () => {
  const r = parsearPedido(mensaje(p1Line({
    v: 1, modo_consumo: 'recoger', hora_recogida: '20:30',
    items: [{ producto_id: 'bachata', cantidad: 1, tipo: 'normal' }]
  })));
  assert.equal(r.ok, true);
  assert.equal(r.modo_consumo, 'recoger');
  assert.equal(r.hora_recogida, '20:30');
});

test('parser — hora SOLO en recoger: en mesa/llevar se descarta', () => {
  const r = parsearPedido(mensaje(p1Line({
    v: 1, modo_consumo: 'mesa', hora_recogida: '20:30',
    items: [{ producto_id: 'bachata', cantidad: 1, tipo: 'normal' }]
  })));
  assert.equal(r.modo_consumo, 'mesa');
  assert.equal(r.hora_recogida, null, 'la hora solo aplica a recoger');
});

test('parser — modo inválido cae a null (no rompe el pedido)', () => {
  const r = parsearPedido(mensaje(p1Line({
    v: 1, modo_consumo: 'teletransporte',
    items: [{ producto_id: 'bachata', cantidad: 1, tipo: 'normal' }]
  })));
  assert.equal(r.ok, true);
  assert.equal(r.modo_consumo, null);
});

async function pedidosConCaptura() {
  const m = new PedidosModule();
  await m.onLoad({
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    metrics: { increment() {}, gauge() {}, timing() {} },
    eventBus: { publish: async () => {}, subscribe() {} },
    uiHandler: null, config: null
  });
  const cuentaArgs = [];
  const cuentas = { instance: { handleCreateCuenta: async (a) => { cuentaArgs.push(a); return { status: 201, data: { id: 'c1', ref_display: 'T1' } }; } } };
  const comandero = { instance: {
    handleAddItem: async () => ({ status: 201, data: {} }),
    handleEnviarCocina: async () => ({ status: 200, data: {} })
  } };
  m.moduleRegistry = { get: (n) => (n === 'cuentas' ? cuentas : n === 'comandero' ? comandero : null) };
  return { m, cuentaArgs };
}

const ITEM = [{ cantidad: 1, descripcion: 'Bachata', producto_id: 'bachata', precio_unitario_centimos: 1000, precio_total_centimos: 1000 }];

test('pedidos — modo_consumo recoger fija tipo de cuenta y guarda hora en metadata', async () => {
  const { m, cuentaArgs } = await pedidosConCaptura();
  const res = await m.handleCreatePedidoTienda({
    project_slug: 'nonina', canal_origen: 'web', total_centimos: 1000,
    cliente_nombre: 'Juan', items: ITEM,
    modo_consumo: 'recoger', hora_recogida: '20:30'
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.modo_consumo, 'recoger');
  assert.equal(res.data.hora_recogida, '20:30');
  assert.equal(cuentaArgs.length, 1);
  assert.equal(cuentaArgs[0].tipo, 'recoger', 'la cuenta nace con el modo como tipo');
  assert.equal(cuentaArgs[0].metadata.hora_recogida, '20:30');
  assert.equal(cuentaArgs[0].metadata.modo_consumo, 'recoger');
});

test('pedidos — modo mesa → tipo mesa, sin hora', async () => {
  const { m, cuentaArgs } = await pedidosConCaptura();
  await m.handleCreatePedidoTienda({
    project_slug: 'nonina', canal_origen: 'web', total_centimos: 1000,
    cliente_nombre: 'Ana', items: ITEM, modo_consumo: 'mesa'
  });
  assert.equal(cuentaArgs[0].tipo, 'mesa');
  assert.equal(cuentaArgs[0].metadata.hora_recogida, null);
});

test('pedidos — sin modo_consumo: compat legacy → tipo llevar', async () => {
  const { m, cuentaArgs } = await pedidosConCaptura();
  await m.handleCreatePedidoTienda({
    project_slug: 'nonina', canal_origen: 'web', total_centimos: 1000,
    cliente_nombre: 'Lu', items: ITEM
  });
  assert.equal(cuentaArgs[0].tipo, 'llevar', 'sin modo, se preserva el comportamiento previo');
});

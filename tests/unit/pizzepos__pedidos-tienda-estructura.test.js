/**
 * Rebanada D: la estructura del pedido de tienda (tipo/mitades/variaciones) sobrevive
 * pedidos → comandero.handleAddItem → enviar_cocina → cocina (que ya la pinta).
 * Verifica los DOS puntos donde antes se caía: items_tienda y el handleAddItem del bridge.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const PedidosModule = require('../../modules/pizzepos/pedidos/index.js');

async function instanciarConBridge() {
  const m = new PedidosModule();
  await m.onLoad({
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    metrics: { increment() {}, gauge() {}, timing() {} },
    eventBus: { publish: async () => {}, subscribe() {} },
    uiHandler: null, config: null
  });
  const addItemCalls = [];
  let enviarCocinaCalls = 0;
  const cuentas = { instance: { handleCreateCuenta: async () => ({ status: 201, data: { id: 'cuenta-1', ref_display: 'T1' } }) } };
  const comandero = { instance: {
    handleAddItem: async (args) => { addItemCalls.push(args); return { status: 201, data: {} }; },
    handleEnviarCocina: async () => { enviarCocinaCalls++; return { status: 200, data: {} }; }
  } };
  m.moduleRegistry = { get: (n) => (n === 'cuentas' ? cuentas : n === 'comandero' ? comandero : null) };
  return { m, addItemCalls, getEnviarCocina: () => enviarCocinaCalls };
}

test('D — mitad con variaciones llega ESTRUCTURADA al handleAddItem del comandero', async () => {
  const { m, addItemCalls, getEnviarCocina } = await instanciarConBridge();
  const res = await m.handleCreatePedidoTienda({
    project_slug: 'nonina', canal_origen: 'whatsapp', total_centimos: 1180,
    cliente_nombre: 'Juan', cliente_telefono: '34600000000',
    items: [{
      cantidad: 1, descripcion: '½ Bachata (sin Anchoas) + ½ Tropical (+ Ajo)',
      producto_id: 'mitad_bachata_tropical', precio_unitario_centimos: 1180, precio_total_centimos: 1180,
      tipo: 'mitad_mitad',
      pizza_izquierda: { id: 'bachata', quitar: ['Anchoas'], anadir: [] },
      pizza_derecha: { id: 'tropical', quitar: [], anadir: ['Ajo'] }
    }]
  });
  assert.equal(res.status, 201);
  assert.equal(addItemCalls.length, 1);
  const it = addItemCalls[0];
  assert.equal(it.tipo, 'mitad_mitad');
  assert.equal(it.pizza_izquierda.id, 'bachata');
  assert.deepEqual(it.pizza_izquierda.quitar, ['Anchoas']);
  assert.equal(it.pizza_derecha.anadir[0], 'Ajo');
  assert.equal(getEnviarCocina(), 1, 'se envía a cocina por el flujo normal');
});

test('D — normal con variaciones lleva `variaciones` pero NO `tipo` (enum del comandero)', async () => {
  const { m, addItemCalls } = await instanciarConBridge();
  await m.handleCreatePedidoTienda({
    project_slug: 'nonina', canal_origen: 'whatsapp', total_centimos: 1100,
    cliente_nombre: 'Ana', cliente_telefono: '34600000000',
    items: [{
      cantidad: 1, descripcion: 'Bachata (sin Anchoas, + Bacon)', producto_id: 'bachata',
      precio_unitario_centimos: 1100, precio_total_centimos: 1100,
      tipo: 'normal',
      variaciones: { ingredientes_quitar: ['Anchoas'], ingredientes_anadir: ['Bacon'] }
    }]
  });
  const it = addItemCalls[0];
  assert.equal(it.tipo, undefined, "normal NO debe forwardear tipo (el comandero solo acepta mitad/al_gusto)");
  assert.deepEqual(it.variaciones, { ingredientes_quitar: ['Anchoas'], ingredientes_anadir: ['Bacon'] });
});

test('D — al_gusto forwardea tipo al_gusto', async () => {
  const { m, addItemCalls } = await instanciarConBridge();
  await m.handleCreatePedidoTienda({
    project_slug: 'nonina', canal_origen: 'whatsapp', total_centimos: 880,
    cliente_nombre: 'Eva', cliente_telefono: '34600000000',
    items: [{
      cantidad: 1, descripcion: 'Margarita al gusto (con Ajo)', producto_id: 'margarita',
      precio_unitario_centimos: 880, precio_total_centimos: 880,
      tipo: 'al_gusto',
      variaciones: { ingredientes_quitar: [], ingredientes_anadir: ['Ajo'] }
    }]
  });
  assert.equal(addItemCalls[0].tipo, 'al_gusto');
});

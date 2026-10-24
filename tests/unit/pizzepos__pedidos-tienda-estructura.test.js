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
  const enviarCocinaCalls = [];
  const cuentas = { instance: { handleCreateCuenta: async () => ({ status: 201, data: { id: 'cuenta-1', ref_display: 'T1' } }) } };
  const comandero = { instance: {
    handleAddItem: async (args) => { addItemCalls.push(args); return { status: 201, data: {} }; },
    handleEnviarCocina: async (args) => { enviarCocinaCalls.push(args); return { status: 200, data: {} }; }
  } };
  m.moduleRegistry = { get: (n) => (n === 'cuentas' ? cuentas : n === 'comandero' ? comandero : null) };
  return { m, addItemCalls, getEnviarCocina: () => enviarCocinaCalls.length, getEnviarCocinaArgs: () => enviarCocinaCalls };
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

test('ingredientes_base — normal: el plato llega a comandero con sus ingredientes (cocina los pinta)', async () => {
  const { m, addItemCalls } = await instanciarConBridge();
  await m.handleCreatePedidoTienda({
    project_slug: 'nonina', canal_origen: 'whatsapp', total_centimos: 950,
    cliente_nombre: 'Leo', cliente_telefono: '34600000000',
    items: [{
      cantidad: 1, descripcion: 'Bachata', producto_id: 'bachata',
      precio_unitario_centimos: 950, precio_total_centimos: 950,
      ingredientes_base: ['Mozzarella', 'Tomate', 'Anchoas']
    }]
  });
  assert.deepEqual(addItemCalls[0].ingredientes_base, ['Mozzarella', 'Tomate', 'Anchoas']);
});

test('ingredientes_base — mitad: cada mitad llega con los suyos dentro de pizza_*', async () => {
  const { m, addItemCalls } = await instanciarConBridge();
  await m.handleCreatePedidoTienda({
    project_slug: 'nonina', canal_origen: 'whatsapp', total_centimos: 1180,
    cliente_nombre: 'Mar', cliente_telefono: '34600000000',
    items: [{
      cantidad: 1, descripcion: '½ Bachata + ½ Tropical', producto_id: 'mitad_bachata_tropical',
      precio_unitario_centimos: 1180, precio_total_centimos: 1180, tipo: 'mitad_mitad',
      pizza_izquierda: { id: 'bachata', nombre: 'Bachata', ingredientes_base: ['Mozzarella'], quitar: [], anadir: [] },
      pizza_derecha: { id: 'tropical', nombre: 'Tropical', ingredientes_base: ['Piña', 'Jamón'], quitar: [], anadir: [] }
    }]
  });
  assert.deepEqual(addItemCalls[0].pizza_izquierda.ingredientes_base, ['Mozzarella']);
  assert.deepEqual(addItemCalls[0].pizza_derecha.ingredientes_base, ['Piña', 'Jamón']);
});

// ── un pedido, un id (24-oct-2026) ──────────────────────────────────────────
// El gemelo nacía aquí: tienda creaba su pedido, comandero acuñaba otro para cocina
// y el puente lo registraba como pedido nuevo. Resultado en la cuenta: 4 apuntes
// donde había 2 items. Estos dos tests congelan la invariante.

test('un pedido, un id — el envío a cocina lleva el id del pedido de tienda y su project_id', async () => {
  const { m, getEnviarCocinaArgs } = await instanciarConBridge();
  const res = await m.handleCreatePedidoTienda({
    project_slug: 'nonina', canal_origen: 'whatsapp', total_centimos: 950,
    cliente_nombre: 'Ana', cliente_telefono: '34600000000',
    items: [{ cantidad: 1, descripcion: 'Bachata', producto_id: 'bachata',
      precio_unitario_centimos: 950, precio_total_centimos: 950 }]
  });
  const envio = getEnviarCocinaArgs()[0];
  assert.equal(envio.pedido_id, res.data.pedido_id, 'el comandero NO acuña un id propio');
  assert.equal(envio.project_id, 'nonina', 'sin project_id el evento cae a DEFAULT_PROJECT_ID');
});

test('un pedido, un id — el puente completa el envío y NO crea gemelo si el pedido ya existe', async () => {
  const { m } = await instanciarConBridge();
  const publicados = [];
  m.eventBus.publish = async (name, payload) => { publicados.push({ name, payload }); };

  const pedido = {
    id: 'p-tienda', tipo: 'tienda', cuenta_id: null, canal: null, project_id: 'nonina',
    items: [{ item_id: 'i1', producto_id: 'bachata', descripcion: 'Bachata',
      precio_unitario_centimos: 950, cantidad: 1 }],
    estado: 'pendiente_recogida', total: 9.5, created_at: '2026-10-24T02:00:00.000Z'
  };
  m.pedidos.set('p-tienda', pedido);

  await m.onComanderoEnviarCocina({ data: {
    cuenta_id: 'cuenta-1', pedido_id: 'p-tienda', project_id: 'nonina',
    ref_display: 'Ana M 1', total: 9.5,
    items: [{ id: 'cm1', producto_id: 'bachata', nombre: 'Bachata', precio: 9.5, cantidad: 1 }]
  } });

  assert.equal(m.pedidos.size, 1, 'un solo pedido, sin gemelo');
  assert.equal(publicados.filter(p => p.name === 'pedido.creado').length, 0, 'no se republica pedido.creado');
  assert.equal(publicados.filter(p => p.name === 'pedido.enviado_cocina').length, 1);

  const enviado = publicados.find(p => p.name === 'pedido.enviado_cocina').payload;
  assert.equal(enviado.pedido_id, 'p-tienda');
  assert.equal(enviado.items[0].nombre, 'Bachata', 'cocina recibe nombre, no una línea muda');
  assert.equal(pedido.estado, 'en_cocina');
  assert.equal(pedido.cuenta_id, 'cuenta-1');
  assert.equal(pedido.items[0].descripcion, 'Bachata', 'el shape de origen se conserva');
});

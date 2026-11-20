'use strict';

/**
 * pedidos — EL NOMBRE DEL CLIENTE ES PARTE DEL HECHO.
 *
 * El pedido guardaba solo `cuenta_id`; el nombre vivía en la cuenta. Eso obligaba a cada
 * consumidor a resolverlo por su cuenta (cocina: ref_display || cuentaNombres || metadata;
 * aviso: datos.cliente_nombre || cuenta.nombre; impresión: cliente_nombre || LLEVAR n;
 * portero: cruzando cuenta.list). Cuatro fallbacks = el dato faltaba donde se usa.
 *
 * Regla: SNAPSHOT al nacer, no sincronización. Se copia una vez; un rename de la cuenta
 * NO reescribe pedidos ya creados. El histórico sigue diciendo quién pidió.
 *
 * Ejecutar: node tests/unit/pizzepos__pedido-nombre-snapshot.test.js
 */

const assert = require('assert');
const Pedidos = require('../../modules/pizzepos/pedidos');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevo({ mqttRequest } = {}) {
  const m = new Pedidos();
  m.logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  m.metrics = { increment: () => {}, gauge: () => {}, timing: () => {} };
  m.eventBus = { publish: async () => {} };
  m._publishPedidoCreado = async () => {};
  if (mqttRequest) m.mqttRequest = mqttRequest;
  return m;
}

const CUENTA_OK = async () => ({ status: 200, data: { cuenta: { id: 'M_1', nombre: 'Mijael Rodas Limpias' } } });

test('create: el nombre explícito se guarda en el pedido', async () => {
  const m = nuevo({ mqttRequest: CUENTA_OK });
  const r = await m.handleCreatePedido({ cuenta_id: 'M_1', project_id: 'the-pirate', cliente_nombre: 'Mijael' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.cliente_nombre, 'Mijael');
});

test('create: sin nombre, lo resuelve de la cuenta UNA vez', async () => {
  const m = nuevo({ mqttRequest: CUENTA_OK });
  const r = await m.handleCreatePedido({ cuenta_id: 'M_1', project_id: 'the-pirate' });
  assert.strictEqual(r.data.cliente_nombre, 'Mijael Rodas Limpias');
});

test('create: guarda teléfono y jid si vienen (canal)', async () => {
  const m = nuevo({ mqttRequest: CUENTA_OK });
  const r = await m.handleCreatePedido({ cuenta_id: 'M_1', cliente_telefono: '600111222', cliente_jid: '34@s.whatsapp.net' });
  assert.strictEqual(r.data.cliente_telefono, '600111222');
  assert.strictEqual(r.data.cliente_jid, '34@s.whatsapp.net');
});

test('create: sin cuenta legible y sin nombre → null (no se inventa)', async () => {
  const m = nuevo();   // sin mqttRequest
  const r = await m.handleCreatePedido({ cuenta_id: 'M_1' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.cliente_nombre, null);
});

test('create: si la RPC falla, el pedido nace igual (fail-open)', async () => {
  const m = nuevo({ mqttRequest: async () => { throw new Error('bus caído'); } });
  const r = await m.handleCreatePedido({ cuenta_id: 'M_1' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.cliente_nombre, null);
});

test('snapshot: renombrar la cuenta NO reescribe el pedido ya creado', async () => {
  let nombreEnLaCuenta = 'Mijael';
  const m = nuevo({ mqttRequest: async () => ({ status: 200, data: { cuenta: { nombre: nombreEnLaCuenta } } }) });

  const p1 = await m.handleCreatePedido({ cuenta_id: 'M_1' });
  assert.strictEqual(p1.data.cliente_nombre, 'Mijael');

  nombreEnLaCuenta = 'Miki';                 // la cuenta se renombra
  const p2 = await m.handleCreatePedido({ cuenta_id: 'M_1' });
  assert.strictEqual(p2.data.cliente_nombre, 'Miki');       // el nuevo pedido nace con el nuevo
  assert.strictEqual(p1.data.cliente_nombre, 'Mijael', 'el pedido viejo no se reescribió');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[pedido-nombre-snapshot] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[pedido-nombre-snapshot] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

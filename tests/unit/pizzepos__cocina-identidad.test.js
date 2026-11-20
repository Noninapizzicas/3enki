'use strict';

/**
 * cocina — IDENTIDAD OPERATIVA EN LA COMANDA (aditivo).
 *
 * La comanda ya llevaba `nombre_cuenta`/`ref_display` (un solo string compuesto). Ahora
 * recibe ADEMÁS `numero_pedido` y `cliente_nombre` por separado, para que la pantalla no
 * tenga que descomponer nada. Nada de lo anterior se retira: los consumidores viejos
 * siguen leyendo el display.
 *
 * Ejecutar: node tests/unit/pizzepos__cocina-identidad.test.js
 */

const assert = require('assert');
const Cocina = require('../../modules/pizzepos/cocina');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevo() {
  const m = new Cocina();
  m.logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  m.metrics = { increment: () => {}, gauge: () => {}, timing: () => {} };
  m.eventBus = { publish: async () => {} };
  m._publicarEvento = async () => {};
  m._slugProyecto = async (p) => p;
  return m;
}

const cuenta = (extra = {}) => ({
  cuenta_id: 'M_1',
  ref_display: 'M 123',
  numero_pedido: 'M 123',
  cliente_nombre: 'Mijael',
  ...extra
});

const comanda = (extra = {}) => ({
  pedido_id: 'p1',
  cuenta_id: 'M_1',
  project_id: 'the-pirate',
  items: [{ producto_id: 'la_flota_mahon', nombre: 'Mahón', cantidad: 1 }],
  ...extra
});

test('la comanda lleva numero_pedido y cliente_nombre separados', async () => {
  const m = nuevo();
  await m.onCuentaCreada({ data: cuenta() });
  await m.onPedidoEnviadoCocina({ data: comanda() });

  const p = m.pedidosActivos.get('p1');
  assert.ok(p, 'no se creó el pedido en cocina');
  assert.strictEqual(p.numero_pedido, 'M 123');
  assert.strictEqual(p.cliente_nombre, 'Mijael');
  assert.strictEqual(p.nombre_cuenta, 'M 123', 'el display de compatibilidad sigue igual');
});

test('si el evento ya trae los campos, se usan aunque no haya caché de cuenta', async () => {
  const m = nuevo();
  await m.onPedidoEnviadoCocina({ data: comanda({ numero_pedido: 'L 391', cliente_nombre: 'Ana' }) });

  const p = m.pedidosActivos.get('p1');
  assert.strictEqual(p.numero_pedido, 'L 391');
  assert.strictEqual(p.cliente_nombre, 'Ana');
});

test('compatibilidad: un evento viejo sin los campos nuevos no rompe nada', async () => {
  const m = nuevo();
  await m.onCuentaCreada({ data: { cuenta_id: 'M_1', ref_display: 'Mesa 40 M 123' } });
  await m.onPedidoEnviadoCocina({ data: comanda() });

  const p = m.pedidosActivos.get('p1');
  assert.strictEqual(p.numero_pedido, null);
  assert.strictEqual(p.cliente_nombre, null);
  assert.strictEqual(p.nombre_cuenta, 'Mesa 40 M 123', 'el display viejo sigue funcionando');
});

test('cuenta.actualizada refresca el cliente del pedido activo', async () => {
  const m = nuevo();
  await m.onCuentaCreada({ data: cuenta({ cliente_nombre: null }) });
  await m.onPedidoEnviadoCocina({ data: comanda() });
  assert.strictEqual(m.pedidosActivos.get('p1').cliente_nombre, null);

  await m.onCuentaActualizada({ data: { cuenta_id: 'M_1', cambios: { cliente_nombre: 'Mijael' } } });

  assert.strictEqual(m.pedidosActivos.get('p1').cliente_nombre, 'Mijael');
});

test('el evento cocina.item_ticket lleva numero_pedido y cliente_nombre', async () => {
  const m = nuevo();
  const publicados = [];
  m._publicarEvento = async (ev, payload) => { publicados.push([ev, payload]); };

  const pedido = {
    pedido_id: 'p1', cuenta_id: 'M_1', project_id: 'the-pirate',
    ref_display: 'Mijael M 123', numero_pedido: 'M 123', cliente_nombre: 'Mijael', canal: 'mesa'
  };
  const item = { item_id: 'i1', producto_id: 'la_flota_mahon', nombre: 'Mahón', cantidad: 1 };

  await m._publishItemTicket(pedido, item, 'horno', null);
  const ev = publicados.find(([e]) => e === 'cocina.item_ticket');
  assert.ok(ev, 'no se publicó cocina.item_ticket');
  assert.strictEqual(ev[1].numero_pedido, 'M 123');
  assert.strictEqual(ev[1].cliente_nombre, 'Mijael');
  assert.strictEqual(ev[1].ref_display, 'Mijael M 123', 'el display sigue viajando');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[cocina-identidad] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[cocina-identidad] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

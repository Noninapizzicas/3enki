'use strict';

/**
 * bocaos/tienda-captura — C01 (el alta de un pedido, de a uno).
 *
 * Lo que se vigila:
 *   1. sin precio cerrado NO hay pedido: PRECIO_SIN_CERRAR y no se llama a la plaza.
 *   2. con precio: se PIDE el alta por el bus (pedido.crear.request) y el pedido_id es el que
 *      contesta la plaza, no uno inventado por la tienda.
 *   3. la plaza es un proyecto: el project_id que viaja en el RPC es el de la plaza.
 *   4. alta en bloque → 422; plaza que no contesta → 502 PEDIDO_NO_CREADO.
 *
 * Ejecutar: node tests/unit/bocaos__tienda-captura.test.js
 */

const assert = require('assert');
const TiendaCaptura = require('../../modules/bocaos/tienda-captura/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevo({ pedido = { status: 201, data: { pedido_id: 'ped-abc123', estado: 'RECIBIDO' } } } = {}) {
  const publicados = [];
  const rpc = [];
  const m = new TiendaCaptura();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => { rpc.push({ ev, payload }); return ev === 'pedido.crear.request' ? pedido : null; };
  return { m, rpc, eventos: (ev) => publicados.filter((x) => x.ev === ev), publicados };
}

const ALTA = {
  plaza_id: 'plaza-malaga',
  tienda_id: 'tienda-paco',
  cliente_id: 'cli-7',
  lineas: [{ sku: 'bocata-calamares', cantidad: 1 }],
  precio_congelado: { total_cents: 950, moneda: 'EUR' },
  oferta_reparto_cents: 350,
  punto: { lat: 36.72, lng: -4.42 }
};

test('alta con precio cerrado: pide el alta a la plaza y publica pedido_compuesto', async () => {
  const { m, rpc, eventos } = nuevo();
  const r = await m.onAltaRequest({ request_id: 'a1', data: ALTA });

  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.pedido_id, 'ped-abc123', 'el id lo pone la plaza');

  const peticion = rpc.find((x) => x.ev === 'pedido.crear.request');
  assert.ok(peticion, 'se pide el alta POR EL BUS');
  assert.strictEqual(peticion.payload.project_id, 'plaza-malaga', 'la plaza es un proyecto');
  assert.deepStrictEqual(peticion.payload.pedido.precio_congelado, ALTA.precio_congelado);

  const hechos = eventos('bocaos.pedido_compuesto');
  assert.strictEqual(hechos.length, 1);
  assert.strictEqual(hechos[0].p.pedido_id, 'ped-abc123');
  assert.strictEqual(hechos[0].p.plaza_id, 'plaza-malaga');
  assert.strictEqual(hechos[0].p.oferta_reparto_cents, 350);
});

test('sin precio cerrado no hay pedido: PRECIO_SIN_CERRAR y no se molesta a la plaza', async () => {
  const { m, rpc, eventos } = nuevo();
  const sinPrecio = { ...ALTA };
  delete sinPrecio.precio_congelado;

  const r = await m.onAltaRequest({ request_id: 'a2', data: sinPrecio });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'PRECIO_SIN_CERRAR');
  assert.strictEqual(r.error.details.hueco, 'sin precio cerrado');
  assert.strictEqual(rpc.length, 0, 'no se pide un alta que no puede nacer');
  assert.strictEqual(eventos('bocaos.pedido_compuesto').length, 0);
  assert.strictEqual(eventos('tienda-captura.alta.failed').length, 1);
});

test('precio con total 0 tampoco es precio', async () => {
  const { m } = nuevo();
  const r = await m.onAltaRequest({ request_id: 'a3', data: { ...ALTA, precio_congelado: { total_cents: 0 } } });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'PRECIO_SIN_CERRAR');
});

test('alta en bloque → 422 (de a uno, C01)', async () => {
  const { m } = nuevo();
  const r = await m.onAltaRequest({ request_id: 'a4', data: { ...ALTA, pedidos: [ALTA, ALTA] } });
  assert.strictEqual(r.status, 422);
  assert.strictEqual(r.error.code, 'ALTA_EN_BLOQUE');
});

test('la plaza no contesta → 502 PEDIDO_NO_CREADO (no se finge el pedido)', async () => {
  const { m, eventos } = nuevo({ pedido: null });
  const r = await m.onAltaRequest({ request_id: 'a5', data: ALTA });
  assert.strictEqual(r.status, 502);
  assert.strictEqual(r.error.code, 'PEDIDO_NO_CREADO');
  assert.strictEqual(r.error.details.causa, 'SIN_RESPUESTA');
  assert.strictEqual(eventos('bocaos.pedido_compuesto').length, 0);
});

(async () => {
  let fallos = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`ok — ${t.name}`);
    } catch (err) {
      fallos += 1;
      console.error(`FALLO — ${t.name}\n  ${err.message}`);
    }
  }
  console.log(`\n${tests.length - fallos}/${tests.length} tests ok`);
  if (fallos > 0) process.exitCode = 1;
})();

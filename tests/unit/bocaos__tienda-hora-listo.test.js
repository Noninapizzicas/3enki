'use strict';

/**
 * bocaos/tienda-hora-listo — C04 (la tienda declara la hora de listo).
 *
 * Lo que se vigila:
 *   1. sólo la tienda DUEÑA declara: el rol plaza y otra tienda reciben 403.
 *   2. la declaración lleva el precio congelado y el punto CON ELLA: la plaza no tendrá que
 *      leer el almacén de la tienda (el dato viaja en el evento).
 *   3. una sola vez: la segunda → 409 YA_DECLARADO (corregir es desmentir en la plaza).
 *   4. pedido que la tienda no conoce → 409; hora que no es hora → 400.
 *
 * Ejecutar: node tests/unit/bocaos__tienda-hora-listo.test.js
 */

const assert = require('assert');
const TiendaHoraListo = require('../../modules/bocaos/tienda-hora-listo/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevo() {
  const publicados = [];
  const m = new TiendaHoraListo();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async () => null;
  return { m, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const TIENDA = 'tienda-paco';
const PLAZA = 'plaza-malaga';
const PRECIO = { total_cents: 1850, reparto_cents: 450 };

async function conPedido() {
  const ctx = nuevo();
  await ctx.m.onPedidoAceptado({
    data: {
      project_id: TIENDA,
      pedido_id: 'ped-1',
      tienda_id: TIENDA,
      plaza_id: PLAZA,
      precio_congelado: PRECIO,
      punto: { lat: 36.72, lng: -4.42 }
    }
  });
  return ctx;
}

test('la tienda dueña declara: el hecho sale con hora, precio y punto dentro', async () => {
  const { m, eventos } = await conPedido();
  const r = await m.onDeclararRequest({
    request_id: 'h1',
    data: { project_id: TIENDA, pedido_id: 'ped-1', hora_listo: '2026-11-03T21:05:00.000Z', autor: { rol: 'tienda', tienda_id: TIENDA } }
  });

  assert.strictEqual(r.status, 201);
  const hechos = eventos('bocaos.listo_declarado');
  assert.strictEqual(hechos.length, 1);
  const h = hechos[0].p;
  assert.strictEqual(h.pedido_id, 'ped-1');
  assert.strictEqual(h.plaza_id, PLAZA);
  assert.strictEqual(h.hora_listo, '2026-11-03T21:05:00.000Z');
  assert.deepStrictEqual(h.precio_congelado, PRECIO, 'sin esto la plaza no puede anotar el hecho (A01)');
  assert.deepStrictEqual(h.punto, { lat: 36.72, lng: -4.42 });
  assert.deepStrictEqual(h.autor, { rol: 'tienda', tienda_id: TIENDA });
});

test('la sala/plaza no declara por la tienda → 403', async () => {
  const { m, eventos } = await conPedido();
  const r = await m.onDeclararRequest({
    request_id: 'h2',
    data: { project_id: TIENDA, pedido_id: 'ped-1', hora_listo: '2026-11-03T21:05:00.000Z', autor: { rol: 'plaza', tienda_id: TIENDA } }
  });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.error.details.hueco, 'autor no es la tienda');
  assert.strictEqual(eventos('bocaos.listo_declarado').length, 0);
});

test('otra tienda no declara por esta → 403', async () => {
  const { m } = await conPedido();
  const r = await m.onDeclararRequest({
    request_id: 'h3',
    data: { project_id: TIENDA, pedido_id: 'ped-1', hora_listo: '2026-11-03T21:05:00.000Z', autor: { rol: 'tienda', tienda_id: 'tienda-otra' } }
  });
  assert.strictEqual(r.status, 403);
});

test('dos declaraciones → 409 YA_DECLARADO y la primera hora queda intacta', async () => {
  const { m, eventos } = await conPedido();
  await m.onDeclararRequest({ request_id: 'h4', data: { project_id: TIENDA, pedido_id: 'ped-1', hora_listo: '2026-11-03T21:05:00.000Z' } });
  const r = await m.onDeclararRequest({ request_id: 'h5', data: { project_id: TIENDA, pedido_id: 'ped-1', hora_listo: '2026-11-03T21:30:00.000Z' } });

  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'YA_DECLARADO');
  assert.strictEqual(r.error.details.hora_declarada, '2026-11-03T21:05:00.000Z');
  assert.strictEqual(eventos('bocaos.listo_declarado').length, 1, 'no se reescribe: se desmiente en la plaza');
});

test('pedido que la tienda no conoce → 409; hora inválida → 400', async () => {
  const { m } = nuevo();
  const r = await m.onDeclararRequest({ request_id: 'h6', data: { project_id: TIENDA, pedido_id: 'ped-x', hora_listo: '2026-11-03T21:05:00.000Z' } });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'PEDIDO_NO_CONSTA_EN_TIENDA');

  const ctx = await conPedido();
  const malo = await ctx.m.onDeclararRequest({ request_id: 'h7', data: { project_id: TIENDA, pedido_id: 'ped-1', hora_listo: 'mañana' } });
  assert.strictEqual(malo.status, 400);
});

test('de: la declaración vigente | NO_CONSTA', async () => {
  const { m } = await conPedido();
  const antes = await m.onDeRequest({ request_id: 'h8', data: { project_id: TIENDA, pedido_id: 'ped-1' } });
  assert.strictEqual(antes.status, 404);
  assert.strictEqual(antes.error.code, 'NO_CONSTA');

  await m.onDeclararRequest({ request_id: 'h9', data: { project_id: TIENDA, pedido_id: 'ped-1', hora_listo: '2026-11-03T21:05:00.000Z' } });
  const despues = await m.onDeRequest({ request_id: 'h10', data: { project_id: TIENDA, pedido_id: 'ped-1' } });
  assert.strictEqual(despues.status, 200);
  assert.strictEqual(despues.data.declaracion.hora_listo, '2026-11-03T21:05:00.000Z');
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

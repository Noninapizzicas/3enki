'use strict';

/**
 * rpc-index — el ÍNDICE RPC del sistema (reflejo determinista).
 *
 * Genera en onLoad el catálogo de TODOS los RPC .request del ecosistema
 * (lee los module.json) y lo sirve bajo demanda: rpc.buscar (query por
 * nombre/módulo/descripción) y rpc.ver (todos los RPC de un módulo).
 *
 * Ejecutar: node tests/unit/rpc-index.test.js
 */

const assert = require('assert');
const path = require('path');
const RpcIndex = require('../../modules/rpc-index/index.js');

const tests = [];
const test = (n, f) => tests.push({ n, f });

function nuevo() {
  const r = new RpcIndex();
  r.logger = { info() {}, warn() {}, error() {}, debug() {} };
  r.metrics = { increment() {} };
  r.eventBus = { publish() {} };
  return r;
}

test('genera el índice en onLoad: hay RPC y son .request', async () => {
  const r = nuevo();
  await r.onLoad({ logger: r.logger, metrics: r.metrics, eventBus: r.eventBus });
  assert.ok(r.indice.length > 100, `esperaba >100 RPC, hay ${r.indice.length}`);
  assert.ok(r.indice.every(x => x.evento.endsWith('.request')), 'todos los eventos terminan en .request');
  assert.ok(r.indice.every(x => x.modulo && typeof x.modulo === 'string'), 'todos tienen módulo');
  assert.ok(r.porModulo.size > 30, `esperaba >30 módulos con RPC, hay ${r.porModulo.size}`);
});

test('rpc.buscar por nombre exacto devuelve el RPC con su descripción', async () => {
  const r = nuevo();
  await r.onLoad({ logger: r.logger, metrics: r.metrics, eventBus: r.eventBus });
  const res = await r.onBuscarRequest({ data: { request_id: 'x', query: 'carrito.add_item' } });
  assert.strictEqual(res.status, 200);
  const hit = res.data.rpcs.find(x => x.evento === 'carrito.add_item.request');
  assert.ok(hit, 'carrito.add_item.request está en el índice');
  assert.strictEqual(hit.modulo, 'carrito');
  assert.ok(hit.descripcion.length > 0, 'tiene descripción');
});

test('rpc.buscar por módulo (rpc.ver) lista todos sus RPC', async () => {
  const r = nuevo();
  await r.onLoad({ logger: r.logger, metrics: r.metrics, eventBus: r.eventBus });
  const res = await r.onVerRequest({ data: { request_id: 'x', modulo: 'carrito' } });
  assert.strictEqual(res.status, 200);
  assert.ok(res.data.total >= 4, `carrito tiene varios RPC: ${res.data.total}`);
  assert.ok(res.data.rpcs.every(x => x.evento.startsWith('carrito.')), 'todos son del carrito');
});

test('rpc.buscar por texto de descripción encuentra el RPC', async () => {
  const r = nuevo();
  await r.onLoad({ logger: r.logger, metrics: r.metrics, eventBus: r.eventBus });
  const res = await r.onBuscarRequest({ data: { request_id: 'x', query: 'cobro' } });
  assert.strictEqual(res.status, 200);
  assert.ok(res.data.total > 0, `query 'cobro' encuentra RPC: ${res.data.total}`);
});

test('rpc.buscar sin query ni modulo → 400 INVALID_INPUT', async () => {
  const r = nuevo();
  await r.onLoad({ logger: r.logger, metrics: r.metrics, eventBus: r.eventBus });
  const res = await r.onBuscarRequest({ data: { request_id: 'x' } });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.error.code, 'INVALID_INPUT');
});

test('rpc.ver de módulo inexistente → 200 con total 0 (no rompe)', async () => {
  const r = nuevo();
  await r.onLoad({ logger: r.logger, metrics: r.metrics, eventBus: r.eventBus });
  const res = await r.onVerRequest({ data: { request_id: 'x', modulo: 'no-existe' } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.total, 0);
});

test('el índice NO incluye node_modules ni eventos que no son .request', async () => {
  const r = nuevo();
  await r.onLoad({ logger: r.logger, metrics: r.metrics, eventBus: r.eventBus });
  assert.ok(!r.indice.some(x => x.evento.includes('node_modules')), 'sin node_modules');
  assert.ok(!r.indice.some(x => !x.evento.endsWith('.request')), 'solo .request');
});

test('response publicada al bus con request_id correlado', async () => {
  const r = nuevo();
  const published = [];
  r.eventBus = { publish: (ev, p) => published.push([ev, p]) };
  await r.onLoad({ logger: r.logger, metrics: r.metrics, eventBus: r.eventBus });
  await r.onBuscarRequest({ data: { request_id: 'rid-1', query: 'fs.read' } });
  const pub = published.find(([ev]) => ev === 'rpc.buscar.response');
  assert.ok(pub, 'publica rpc.buscar.response');
  assert.strictEqual(pub[1].request_id, 'rid-1');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { n, f } of tests) {
    try { await f(); passed++; }
    catch (err) { fails.push({ n, err }); }
  }
  if (fails.length === 0) { console.log(`\n[rpc-index] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[rpc-index] FAIL ${fails.length}/${tests.length}`);
  for (const { n, err } of fails) console.error(`  x ${n}\n    ${err.message}`);
  process.exit(1);
})();

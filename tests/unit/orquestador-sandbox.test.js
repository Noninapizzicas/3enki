/**
 * Tests unitarios — OrquestadorSandbox (la cura de "una operacion por turno").
 *
 * Verifica que el codigo del LLM SOLO puede tocar el bus (capability-based),
 * que itera/orquesta de verdad, y que el doble timeout corta runaway.
 *
 * Ejecutar: node tests/unit/orquestador-sandbox.test.js
 */
'use strict';

const assert = require('assert');
const { ejecutarOrquestacion } = require('../../modules/_shared/orquestador-sandbox');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// Fake bus: publish acumula; subscribe + publish auto-resuelven publishAndWait.
function fakeBus() {
  const published = [];
  const handlers = new Map();
  return {
    published,
    publish: (topic, data) => {
      published.push({ topic, data });
      // auto-responder: si es <op>.request, dispara <op>.response con el request_id
      if (topic.endsWith('.request')) {
        const respTopic = topic.slice(0, -('.request'.length)) + '.response';
        const hs = handlers.get(respTopic) || [];
        const payload = { request_id: data.request_id, status: 200, data: { eco: data } };
        setImmediate(() => hs.forEach(h => h({ data: payload })));
      }
    },
    subscribe: (topic, handler) => {
      const hs = handlers.get(topic) || []; hs.push(handler); handlers.set(topic, hs);
      return () => { const l = handlers.get(topic) || []; handlers.set(topic, l.filter(h => h !== handler)); };
    }
  };
}

test('orquesta un BUCLE de publishAndWait en una sola ejecucion', async () => {
  const bus = fakeBus();
  const codigo = `
    const resultados = [];
    for (let i = 0; i < 5; i++) {
      const r = await bus.publishAndWait('recetas.obtener.request', { receta_id: 'r' + i });
      resultados.push(r.data.eco.receta_id);
    }
    return { costeadas: resultados.length, ids: resultados };
  `;
  const out = await ejecutarOrquestacion(codigo, { eventBus: bus, project_id: 'P' });
  assert.strictEqual(out.resultado.costeadas, 5, 'el bucle hizo 5 RPC en una ejecucion');
  // el resultado vuelve cross-realm del vm; en produccion se serializa a JSON en la
  // frontera (el handler), asi que comparamos por valor.
  assert.strictEqual(JSON.stringify(out.resultado.ids), JSON.stringify(['r0', 'r1', 'r2', 'r3', 'r4']));
  // 5 requests publicados, todos correlados y con project_id inyectado
  const reqs = bus.published.filter(p => p.topic === 'recetas.obtener.request');
  assert.strictEqual(reqs.length, 5);
  assert.ok(reqs.every(r => r.data.project_id === 'P' && r.data.correlation_id));
});

test('bus.publish enriquece con project_id y correlation_id', async () => {
  const bus = fakeBus();
  await ejecutarOrquestacion(`bus.publish('algo.paso', { x: 1 });`,
    { eventBus: bus, project_id: 'P', correlation_id: 'CORR' });
  const ev = bus.published.find(p => p.topic === 'algo.paso');
  assert.strictEqual(ev.data.project_id, 'P');
  assert.strictEqual(ev.data.correlation_id, 'CORR');
  assert.strictEqual(ev.data.x, 1);
});

test('capability-based: require / process / fs NO existen en el sandbox', async () => {
  const bus = fakeBus();
  for (const expr of ['typeof require', 'typeof process', 'typeof global', 'typeof module']) {
    const out = await ejecutarOrquestacion(`return ${expr};`, { eventBus: bus });
    assert.strictEqual(out.resultado, 'undefined', `${expr} debe ser undefined en el sandbox`);
  }
});

test('captura console.log como logs', async () => {
  const bus = fakeBus();
  const out = await ejecutarOrquestacion(`console.log('hola', 42); console.log({a:1}); return 'ok';`,
    { eventBus: bus });
  assert.strictEqual(out.resultado, 'ok');
  assert.deepStrictEqual(out.logs, ['hola 42', '{"a":1}']);
});

test('timeout ASINCRONO: un await que nunca resuelve se corta', async () => {
  // bus sin auto-responder -> publishAndWait nunca resuelve
  const busColgado = { published: [], publish: () => {}, subscribe: () => () => {} };
  let err = null;
  try {
    await ejecutarOrquestacion(`await bus.publishAndWait('x.request', {}); return 'no llega';`,
      { eventBus: busColgado, timeout_ms: 120 });
  } catch (e) { err = e; }
  assert.ok(err, 'debe lanzar');
  assert.strictEqual(err._code, 'UPSTREAM_TIMEOUT');
});

test('timeout SINCRONO: un bucle infinito sin await se corta', async () => {
  const bus = fakeBus();
  let err = null;
  try {
    await ejecutarOrquestacion(`while (true) {}`, { eventBus: bus, timeout_ms: 120 });
  } catch (e) { err = e; }
  assert.ok(err, 'debe lanzar');
  assert.strictEqual(err._code, 'UPSTREAM_TIMEOUT');
});

test('codigo vacio o no-string -> INVALID_INPUT', async () => {
  const bus = fakeBus();
  for (const bad of ['', '   ', null, 123]) {
    let err = null;
    try { await ejecutarOrquestacion(bad, { eventBus: bus }); } catch (e) { err = e; }
    assert.ok(err && err._code === 'INVALID_INPUT', `${JSON.stringify(bad)} -> INVALID_INPUT`);
  }
});

test('codigo con error de sintaxis -> INVALID_INPUT', async () => {
  const bus = fakeBus();
  let err = null;
  try { await ejecutarOrquestacion(`return (((;`, { eventBus: bus }); } catch (e) { err = e; }
  assert.ok(err && err._code === 'INVALID_INPUT');
});

test('error en runtime del codigo -> EXEC_FAILED con logs', async () => {
  const bus = fakeBus();
  let err = null;
  try {
    await ejecutarOrquestacion(`console.log('antes'); throw new Error('boom');`, { eventBus: bus });
  } catch (e) { err = e; }
  assert.ok(err && err._code === 'EXEC_FAILED');
  assert.ok((err._logs || []).includes('antes'), 'los logs previos al error se conservan');
});

// ── Interruptor on/off (kill switch) via code-executor ──
test('code.orquestar respeta el interruptor on/off (config + toggle en caliente)', async () => {
  const CodeExecutor = require('../../modules/code-executor');
  const bus = { publish: () => {}, subscribe: () => () => {} };
  const noop = { info() {}, warn() {}, error() {} };

  // default ON
  const mod = new CodeExecutor();
  await mod.onLoad({ logger: noop, metrics: { increment() {} }, eventBus: bus, moduleConfig: {} });
  assert.strictEqual((await mod.handleToolOrquestar({ codigo: 'return 1;' })).status, 200);

  // toggle OFF en caliente -> bloquea
  await mod.handleToolOrquestarSet({ enabled: false });
  const off = await mod.handleToolOrquestar({ codigo: 'return 1;' });
  assert.strictEqual(off.status, 403);
  assert.strictEqual(off.error.code, 'CAPABILITY_DISABLED');

  // toggle ON -> ejecuta de nuevo
  await mod.handleToolOrquestarSet({ enabled: true });
  assert.strictEqual((await mod.handleToolOrquestar({ codigo: 'return 1;' })).status, 200);

  // config OFF persistente -> arranca bloqueado
  const mod2 = new CodeExecutor();
  await mod2.onLoad({ logger: noop, metrics: { increment() {} }, eventBus: bus, moduleConfig: { orquestarEnabled: false } });
  assert.strictEqual((await mod2.handleToolOrquestar({ codigo: 'return 1;' })).status, 403);
});

(async () => {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log(`  ✅ ${name}`); passed++; }
    catch (err) { console.log(`  ❌ ${name}\n     ${err.stack || err.message}`); failed++; }
  }
  console.log(`\n  orquestador-sandbox: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();

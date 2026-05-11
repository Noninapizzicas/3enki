/**
 * Tests unitarios — core/modules/loader.js::_wireToolBusSubscription.
 *
 * Cubre la primitiva nueva (v1.1 tools.contract): cuando registerToolsForAI
 * registra una tool con handler, auto-suscribe el wrapper bus que recibe
 * `<toolName>` y publica `<toolName>.response` con shape canonico
 * `{request_id, result|error}`. Esta primitiva es lo que permite eliminar
 * PATH 1 de ai-gateway (acceso directo a toolsRegistry.handler).
 *
 * Ejecutar: node tests/unit/core-module-loader-tool-bus.test.js
 */

'use strict';

const assert = require('assert');
const ModuleLoader = require('../../core/modules/loader.js');

// ============================================================
// Mocks
// ============================================================

function makeMiniBus() {
  // Implementacion minima: subscribe(name, handler) -> unsub fn;
  // publish(name, data) llama listeners y captura para asserts.
  const subs = new Map();
  const published = [];
  return {
    published,
    subscribe(name, handler) {
      if (!subs.has(name)) subs.set(name, new Set());
      subs.get(name).add(handler);
      return () => subs.get(name)?.delete(handler);
    },
    async publish(name, data) {
      published.push([name, data]);
      const set = subs.get(name);
      if (!set) return;
      for (const h of [...set]) {
        try { await h(data); } catch (_) { /* swallow for tests */ }
      }
    },
    listenerCount(name) { return subs.get(name)?.size || 0; }
  };
}

function makeLoader(bus, opts = {}) {
  const logger = opts.logger || {
    debug: () => {}, info: () => {}, warn: () => {}, error: () => {}
  };
  return new ModuleLoader({
    core: { eventBus: bus },
    logger,
    modulesPath: '/tmp/__never_used_in_test__'
  });
}

function publishedOf(bus, name) {
  return bus.published.filter(p => p[0] === name).map(p => p[1]);
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (err) {
    console.error(`✗ ${description}`); console.error(`  ${err.message}`);
    if (process.env.STACK) console.error(err.stack);
    process.exit(1);
  }
}

// ============================================================
// Tests
// ============================================================

(async () => {
  console.log('core/modules/loader — tool bus auto-subscription (tools.contract v1.1)\n');

  // ---------- Group 1: wiring basico ----------

  await testAsync('registerToolsForAI auto-suscribe `<toolName>` cuando hay handler+bus', async () => {
    const bus = makeMiniBus();
    const loader = makeLoader(bus);
    const instance = { doIt: async (args) => ({ status: 200, data: { ok: true, echo: args } }) };
    loader.registerToolsForAI('mod-x', [
      { name: 'modx.do_it', handler: 'doIt', parameters: { type: 'object' } }
    ], instance);

    assert.strictEqual(bus.listenerCount('modx.do_it'), 1, 'auto-sub registrado en <toolName>');
    const entry = loader.toolsRegistry.get('modx.do_it');
    assert.ok(entry, 'tool entry creada');
    assert.strictEqual(typeof entry._busUnsub, 'function', '_busUnsub guardado para teardown');
    assert.strictEqual(typeof entry.handler, 'function', 'handler queda accesible para introspeccion');
  });

  await testAsync('tool sin handler NO crea suscripcion bus (entry queda con _busUnsub null)', async () => {
    const bus = makeMiniBus();
    const loader = makeLoader(bus);
    loader.registerToolsForAI('mod-y', [
      { name: 'mody.no_handler', parameters: {} }
    ], {});

    assert.strictEqual(bus.listenerCount('mody.no_handler'), 0, 'sin handler no hay sub');
    const entry = loader.toolsRegistry.get('mody.no_handler');
    assert.strictEqual(entry.handler, null);
    assert.strictEqual(entry._busUnsub, null);
  });

  await testAsync('loader sin bus disponible registra entry sin crashear', async () => {
    const loader = new ModuleLoader({ core: {}, modulesPath: '/tmp' });
    const instance = { doIt: async () => ({ status: 200, data: 'x' }) };
    loader.registerToolsForAI('mod-z', [
      { name: 'modz.do_it', handler: 'doIt', parameters: {} }
    ], instance);
    const entry = loader.toolsRegistry.get('modz.do_it');
    assert.ok(entry);
    assert.strictEqual(entry._busUnsub, null, 'sin bus, no hay sub que cancelar');
  });

  // ---------- Group 2: shape canonico de respuesta ----------

  await testAsync('handler {status:200, data} -> publica <toolName>.response {request_id, result=data}', async () => {
    const bus = makeMiniBus();
    const loader = makeLoader(bus);
    const instance = { greet: async ({ name }) => ({ status: 200, data: `Hola ${name}` }) };
    loader.registerToolsForAI('greeter', [{ name: 'greeter.greet', handler: 'greet', parameters: {} }], instance);

    await bus.publish('greeter.greet', { request_id: 'r-1', name: 'Ada' });

    const resps = publishedOf(bus, 'greeter.greet.response');
    assert.strictEqual(resps.length, 1);
    assert.strictEqual(resps[0].request_id, 'r-1');
    assert.strictEqual(resps[0].result, 'Hola Ada', 'data unwrapped');
    assert.ok(!('error' in resps[0]), 'sin campo error');
  });

  await testAsync('handler {status:400, error:{code,message}} -> publica response con error canonico', async () => {
    const bus = makeMiniBus();
    const loader = makeLoader(bus);
    const instance = { val: async () => ({ status: 400, error: { code: 'INVALID_INPUT', message: 'malo' } }) };
    loader.registerToolsForAI('val-mod', [{ name: 'val.run', handler: 'val', parameters: {} }], instance);

    await bus.publish('val.run', { request_id: 'r-err' });

    const resps = publishedOf(bus, 'val.run.response');
    assert.strictEqual(resps.length, 1);
    assert.strictEqual(resps[0].request_id, 'r-err');
    assert.deepStrictEqual(resps[0].error, { code: 'INVALID_INPUT', message: 'malo' });
    assert.ok(!('result' in resps[0]));
  });

  await testAsync('handler con error string suelto -> envuelto en INTERNAL_ERROR canonico', async () => {
    const bus = makeMiniBus();
    const loader = makeLoader(bus);
    const instance = { run: async () => ({ status: 500, error: 'oops' }) };
    loader.registerToolsForAI('m', [{ name: 'm.run', handler: 'run', parameters: {} }], instance);

    await bus.publish('m.run', { request_id: 'r-x' });
    const resp = publishedOf(bus, 'm.run.response')[0];
    assert.strictEqual(resp.error.code, 'INTERNAL_ERROR');
    assert.strictEqual(resp.error.message, 'oops');
  });

  await testAsync('handler que lanza excepcion -> publica response con INTERNAL_ERROR + message', async () => {
    const bus = makeMiniBus();
    const loader = makeLoader(bus);
    const instance = { boom: async () => { throw new Error('kaboom'); } };
    loader.registerToolsForAI('m', [{ name: 'm.boom', handler: 'boom', parameters: {} }], instance);

    await bus.publish('m.boom', { request_id: 'r-b' });
    const resp = publishedOf(bus, 'm.boom.response')[0];
    assert.strictEqual(resp.request_id, 'r-b');
    assert.strictEqual(resp.error.code, 'INTERNAL_ERROR');
    assert.strictEqual(resp.error.message, 'kaboom');
  });

  await testAsync('handler que devuelve valor pelado (legacy) -> publica result tal cual', async () => {
    const bus = makeMiniBus();
    const loader = makeLoader(bus);
    const instance = { peeled: async () => ['a', 'b', 'c'] };
    loader.registerToolsForAI('m', [{ name: 'm.peeled', handler: 'peeled', parameters: {} }], instance);

    await bus.publish('m.peeled', { request_id: 'r-p' });
    const resp = publishedOf(bus, 'm.peeled.response')[0];
    assert.deepStrictEqual(resp.result, ['a', 'b', 'c']);
  });

  // ---------- Group 3: args (request_id stripped) ----------

  await testAsync('handler recibe args sin request_id (stripped del payload)', async () => {
    const bus = makeMiniBus();
    const loader = makeLoader(bus);
    let received = null;
    const instance = { capt: async (args) => { received = args; return { status: 200, data: 'ok' }; } };
    loader.registerToolsForAI('m', [{ name: 'm.capt', handler: 'capt', parameters: {} }], instance);

    await bus.publish('m.capt', { request_id: 'r-99', foo: 1, bar: 'x' });

    assert.deepStrictEqual(received, { foo: 1, bar: 'x' }, 'handler ve solo los args, no request_id');
  });

  await testAsync('handler funciona si payload viene envuelto en {data: ...} (compat envelope)', async () => {
    const bus = makeMiniBus();
    const loader = makeLoader(bus);
    let received = null;
    const instance = { capt: async (args) => { received = args; return { status: 200, data: 'ok' }; } };
    loader.registerToolsForAI('m', [{ name: 'm.capt2', handler: 'capt', parameters: {} }], instance);

    // Algunos buses pueden envolver — el wrapper debe aceptar ambas formas.
    const sub = bus.subscribe.bind(bus);  // no-op, solo para no enredar
    sub;
    // Simulamos un publish envuelto invocando manualmente el listener
    const wrapper = [...(loader.toolsRegistry.get('m.capt2') ? [] : [])];
    // En lugar de simular, hacemos publish directo con shape envuelto
    await bus.publish('m.capt2', { data: { request_id: 'r-w', foo: 42 } });

    assert.deepStrictEqual(received, { foo: 42 });
  });

  // ---------- Group 4: lifecycle (unregister cancela el sub) ----------

  await testAsync('unregisterToolsForAI cancela auto-sub bus (listenerCount queda a 0)', async () => {
    const bus = makeMiniBus();
    const loader = makeLoader(bus);
    const instance = { doIt: async () => ({ status: 200, data: 'ok' }) };
    loader.registerToolsForAI('mod-life', [{ name: 'life.do_it', handler: 'doIt', parameters: {} }], instance);

    assert.strictEqual(bus.listenerCount('life.do_it'), 1);
    loader.unregisterToolsForAI('mod-life');
    assert.strictEqual(bus.listenerCount('life.do_it'), 0, 'sub cancelado en unregister');
    assert.strictEqual(loader.toolsRegistry.has('life.do_it'), false, 'entry eliminada');
  });

  await testAsync('unregister NO afecta tools de otros modulos', async () => {
    const bus = makeMiniBus();
    const loader = makeLoader(bus);
    const a = { fa: async () => ({ status: 200, data: 'a' }) };
    const b = { fb: async () => ({ status: 200, data: 'b' }) };
    loader.registerToolsForAI('mod-a', [{ name: 'a.fa', handler: 'fa', parameters: {} }], a);
    loader.registerToolsForAI('mod-b', [{ name: 'b.fb', handler: 'fb', parameters: {} }], b);

    loader.unregisterToolsForAI('mod-a');
    assert.strictEqual(bus.listenerCount('a.fa'), 0);
    assert.strictEqual(bus.listenerCount('b.fb'), 1, 'mod-b sigue intacto');
    assert.strictEqual(loader.toolsRegistry.has('b.fb'), true);
  });

  // ---------- Group 5: invocaciones concurrentes (request_id correlation) ----------

  await testAsync('multiples request_id concurrentes — cada response lleva su request_id', async () => {
    const bus = makeMiniBus();
    const loader = makeLoader(bus);
    let resolveDelay;
    const instance = {
      slow: (args) => new Promise(resolve => {
        // Resolve sincronicamente con valor especifico del request
        resolve({ status: 200, data: `done-${args.tag}` });
      })
    };
    loader.registerToolsForAI('m', [{ name: 'm.slow', handler: 'slow', parameters: {} }], instance);

    await Promise.all([
      bus.publish('m.slow', { request_id: 'r-1', tag: 'one' }),
      bus.publish('m.slow', { request_id: 'r-2', tag: 'two' }),
      bus.publish('m.slow', { request_id: 'r-3', tag: 'three' })
    ]);

    const resps = publishedOf(bus, 'm.slow.response');
    assert.strictEqual(resps.length, 3);
    const byReq = Object.fromEntries(resps.map(r => [r.request_id, r.result]));
    assert.strictEqual(byReq['r-1'], 'done-one');
    assert.strictEqual(byReq['r-2'], 'done-two');
    assert.strictEqual(byReq['r-3'], 'done-three');
  });

  console.log('\nTodos los tests pasaron.');
  process.exit(0);
})().catch(err => { console.error('FATAL', err); process.exit(1); });

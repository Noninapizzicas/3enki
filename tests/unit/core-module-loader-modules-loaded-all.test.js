/**
 * Tests unitarios — core/modules/loader.js::loadAll publica core.modules.loaded.all
 *
 * Cubre la primitiva nueva (frente blueprint-async-wiring-clean):
 * cuando loadAll() termina, publica el evento canonico
 * `core.modules.loaded.all` al bus con `{total, successful, failed, timestamp}`.
 * Esta primitiva sustituye el lazy-rewire del PR #206 por un disparo
 * deterministico que permite a ai-gateway suscribirse y completar el
 * wiring de blueprint async subscribers ANTES del primer chat.
 *
 * Ejecutar: node tests/unit/core-module-loader-modules-loaded-all.test.js
 */

'use strict';

const assert = require('assert');
const ModuleLoader = require('../../core/modules/loader.js');

// ============================================================
// Mocks
// ============================================================

function makeMiniBus() {
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
        try { await h(data); } catch (_) { /* swallow */ }
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
    core: bus !== null ? { eventBus: bus } : null,
    logger,
    metrics: { increment: () => {}, gauge: () => {} },
    modulesPath: '/tmp/__never_used_in_test_' + Date.now()
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
  console.log('core/modules/loader — loadAll publica core.modules.loaded.all\n');

  await testAsync('loadAll() emite core.modules.loaded.all con shape canonico', async () => {
    const bus = makeMiniBus();
    const loader = makeLoader(bus);
    await loader.loadAll();

    const emitted = publishedOf(bus, 'core.modules.loaded.all');
    assert.strictEqual(emitted.length, 1, 'evento emitido exactamente una vez');
    const payload = emitted[0];
    assert.ok(typeof payload.total === 'number', 'payload.total es number');
    assert.ok(typeof payload.successful === 'number', 'payload.successful es number');
    assert.ok(typeof payload.failed === 'number', 'payload.failed es number');
    assert.ok(typeof payload.timestamp === 'string', 'payload.timestamp es string ISO');
    // Como el modulesPath no existe, total/successful/failed son 0.
    assert.strictEqual(payload.total, 0, 'modulesPath inexistente -> total=0');
    assert.strictEqual(payload.successful, 0);
    assert.strictEqual(payload.failed, 0);
  });

  await testAsync('loadAll() sin eventBus disponible NO rompe', async () => {
    // core sin eventBus
    const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
    const loader = new ModuleLoader({
      core: {},
      logger,
      metrics: { increment: () => {}, gauge: () => {} },
      modulesPath: '/tmp/__never_used_in_test_no_bus__'
    });
    // No debe lanzar.
    const result = await loader.loadAll();
    assert.ok(Array.isArray(result), 'loadAll devuelve array de resultados');
  });

  await testAsync('loadAll() captura error si publish lanza (no propaga)', async () => {
    const failingBus = {
      subscribe: () => () => {},
      publish: async () => { throw new Error('bus down'); }
    };
    const warnings = [];
    const logger = {
      debug: () => {}, info: () => {}, error: () => {},
      warn: (event, data) => warnings.push([event, data])
    };
    const loader = new ModuleLoader({
      core: { eventBus: failingBus },
      logger,
      metrics: { increment: () => {}, gauge: () => {} },
      modulesPath: '/tmp/__never_used_in_test_failing_publish__'
    });
    // No debe lanzar.
    await loader.loadAll();
    const matched = warnings.find(([ev]) => ev === 'core.modules.loaded.all.publish_failed');
    assert.ok(matched, 'warning capturado tras publish error');
    assert.ok(matched[1].error_message.includes('bus down'), 'error message preservado');
  });

  await testAsync('listener registrado antes de loadAll recibe el evento', async () => {
    const bus = makeMiniBus();
    const loader = makeLoader(bus);
    let received = null;
    bus.subscribe('core.modules.loaded.all', (data) => { received = data; });
    await loader.loadAll();
    assert.ok(received, 'listener invocado');
    assert.strictEqual(typeof received.timestamp, 'string', 'timestamp llega al listener');
  });

  console.log('\nTodos los tests pasaron.');
})();

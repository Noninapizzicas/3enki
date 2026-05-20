/**
 * Tests unitarios — core/modules/loader.js auto-wire de tools[] al uiHandler.
 *
 * Cubre la primitiva nueva de tools.contract v1.2 ("una declaracion, tres
 * destinos"): cuando registerToolsForAI registra una tool con handler, ademas
 * de toolsRegistry y bus, llama uiHandler.register(domain, action, handler)
 * con domain=parte_antes_del_primer_punto, action=resto.
 *
 * Ejecutar: node tests/unit/core-module-loader-tool-ui.test.js
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
        try { await h(data); } catch (_) { /* swallow for tests */ }
      }
    },
    listenerCount(name) { return subs.get(name)?.size || 0; }
  };
}

function makeMiniUiHandler() {
  // Implementacion minima del contrato uiHandler.register / .unregister.
  const handlers = new Map();
  const calls = { register: [], unregister: [] };
  return {
    handlers,
    calls,
    register(domain, action, handler) {
      const key = `${domain}.${action}`;
      handlers.set(key, handler);
      calls.register.push({ domain, action });
    },
    unregister(domain, action) {
      const key = `${domain}.${action}`;
      handlers.delete(key);
      calls.unregister.push({ domain, action });
    }
  };
}

function makeLoader({ bus, uiHandler } = {}) {
  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  return new ModuleLoader({
    core: { eventBus: bus || null, uiHandler: uiHandler || null },
    logger,
    modulesPath: '/tmp/__never_used_in_test__'
  });
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
  console.log('core/modules/loader — tool ui auto-registration (tools.contract v1.2)\n');

  // ---------- Group 1: _deriveUiKeyFromToolName ----------

  await testAsync('_deriveUiKey: name simple `pdf.extract` → {domain:pdf, action:extract}', async () => {
    const loader = makeLoader();
    assert.deepStrictEqual(loader._deriveUiKeyFromToolName('pdf.extract'), { domain: 'pdf', action: 'extract' });
  });

  await testAsync('_deriveUiKey: name compuesto `mercadona.producto.obtener` → split en el PRIMER punto', async () => {
    const loader = makeLoader();
    assert.deepStrictEqual(
      loader._deriveUiKeyFromToolName('mercadona.producto.obtener'),
      { domain: 'mercadona', action: 'producto.obtener' }
    );
  });

  await testAsync('_deriveUiKey: name con guion en el modulo `carta-scheduler.crear_regla`', async () => {
    const loader = makeLoader();
    assert.deepStrictEqual(
      loader._deriveUiKeyFromToolName('carta-scheduler.crear_regla'),
      { domain: 'carta-scheduler', action: 'crear_regla' }
    );
  });

  await testAsync('_deriveUiKey: name sin punto → null (no se auto-registra en ui)', async () => {
    const loader = makeLoader();
    assert.strictEqual(loader._deriveUiKeyFromToolName('sinpunto'), null);
  });

  await testAsync('_deriveUiKey: name vacio o no-string → null', async () => {
    const loader = makeLoader();
    assert.strictEqual(loader._deriveUiKeyFromToolName(''), null);
    assert.strictEqual(loader._deriveUiKeyFromToolName(null), null);
    assert.strictEqual(loader._deriveUiKeyFromToolName(undefined), null);
    assert.strictEqual(loader._deriveUiKeyFromToolName(123), null);
  });

  await testAsync('_deriveUiKey: name que empieza por punto → null', async () => {
    const loader = makeLoader();
    assert.strictEqual(loader._deriveUiKeyFromToolName('.action'), null);
  });

  await testAsync('_deriveUiKey: name que termina en punto → null', async () => {
    const loader = makeLoader();
    assert.strictEqual(loader._deriveUiKeyFromToolName('domain.'), null);
  });

  // ---------- Group 2: registerToolsForAI auto-wire ----------

  await testAsync('registerToolsForAI auto-registra en uiHandler cuando hay handler+ui', async () => {
    const bus = makeMiniBus();
    const ui = makeMiniUiHandler();
    const loader = makeLoader({ bus, uiHandler: ui });
    const instance = { doIt: async (args) => ({ status: 200, data: { ok: true, args } }) };

    loader.registerToolsForAI('mod-x', [
      { name: 'modx.do_it', handler: 'doIt', parameters: { type: 'object' } }
    ], instance);

    assert.deepStrictEqual(ui.calls.register, [{ domain: 'modx', action: 'do_it' }]);
    assert.ok(ui.handlers.has('modx.do_it'), 'handler registrado bajo clave domain.action');

    const entry = loader.toolsRegistry.get('modx.do_it');
    assert.deepStrictEqual(entry._uiKey, { domain: 'modx', action: 'do_it' }, '_uiKey guardado en entry');
  });

  await testAsync('handler registrado en uiHandler es invocable y devuelve shape canonico', async () => {
    const bus = makeMiniBus();
    const ui = makeMiniUiHandler();
    const loader = makeLoader({ bus, uiHandler: ui });
    const instance = { greet: async ({ name }) => ({ status: 200, data: `Hola ${name}` }) };

    loader.registerToolsForAI('greeter', [{ name: 'greeter.greet', handler: 'greet', parameters: {} }], instance);

    const handler = ui.handlers.get('greeter.greet');
    assert.ok(handler);
    const result = await handler({ name: 'Ada' });
    assert.deepStrictEqual(result, { status: 200, data: 'Hola Ada' });
  });

  await testAsync('tools con name compuesto (>1 punto) registran action con puntos preservados', async () => {
    const bus = makeMiniBus();
    const ui = makeMiniUiHandler();
    const loader = makeLoader({ bus, uiHandler: ui });
    const instance = { obtener: async ({ id }) => ({ status: 200, data: { id } }) };

    loader.registerToolsForAI('mercadona-api', [
      { name: 'mercadona.producto.obtener', handler: 'obtener', parameters: {} }
    ], instance);

    assert.deepStrictEqual(ui.calls.register, [{ domain: 'mercadona', action: 'producto.obtener' }]);
    assert.ok(ui.handlers.has('mercadona.producto.obtener'));
  });

  // ---------- Group 3: edge cases (no auto-wire) ----------

  await testAsync('tool sin handler NO se auto-registra en uiHandler', async () => {
    const bus = makeMiniBus();
    const ui = makeMiniUiHandler();
    const loader = makeLoader({ bus, uiHandler: ui });

    loader.registerToolsForAI('mod-y', [
      { name: 'mody.declarative_only', parameters: {} }
    ], {});

    assert.strictEqual(ui.calls.register.length, 0, 'sin handler resoluble no se registra ui');
    const entry = loader.toolsRegistry.get('mody.declarative_only');
    assert.strictEqual(entry._uiKey, null);
  });

  await testAsync('loader sin uiHandler no crashea — solo registra en bus + toolsRegistry', async () => {
    const bus = makeMiniBus();
    const loader = makeLoader({ bus, uiHandler: null });
    const instance = { run: async () => ({ status: 200, data: 'ok' }) };

    loader.registerToolsForAI('mod-z', [{ name: 'modz.run', handler: 'run', parameters: {} }], instance);

    const entry = loader.toolsRegistry.get('modz.run');
    assert.ok(entry);
    assert.strictEqual(entry._uiKey, null, 'sin uiHandler no hay _uiKey');
    assert.strictEqual(bus.listenerCount('modz.run'), 1, 'bus auto-sub sigue activo');
  });

  await testAsync('tool con name sin punto NO se auto-registra en uiHandler (pero si en bus+registry)', async () => {
    const bus = makeMiniBus();
    const ui = makeMiniUiHandler();
    const loader = makeLoader({ bus, uiHandler: ui });
    const instance = { run: async () => ({ status: 200, data: 'ok' }) };

    loader.registerToolsForAI('mod-w', [{ name: 'sinpunto', handler: 'run', parameters: {} }], instance);

    assert.strictEqual(ui.calls.register.length, 0, 'name sin punto no produce uiKey valido');
    assert.strictEqual(loader.toolsRegistry.has('sinpunto'), true);
    assert.strictEqual(bus.listenerCount('sinpunto'), 1);
  });

  // ---------- Group 4: unregister symmetry ----------

  await testAsync('unregisterToolsForAI cancela registro ui simetricamente', async () => {
    const bus = makeMiniBus();
    const ui = makeMiniUiHandler();
    const loader = makeLoader({ bus, uiHandler: ui });
    const instance = { run: async () => ({ status: 200, data: 'ok' }) };

    loader.registerToolsForAI('mod-life', [{ name: 'life.run', handler: 'run', parameters: {} }], instance);
    assert.ok(ui.handlers.has('life.run'));

    loader.unregisterToolsForAI('mod-life');

    assert.deepStrictEqual(ui.calls.unregister, [{ domain: 'life', action: 'run' }]);
    assert.strictEqual(ui.handlers.has('life.run'), false, 'handler ui eliminado');
    assert.strictEqual(loader.toolsRegistry.has('life.run'), false);
  });

  await testAsync('unregister NO afecta UI handlers de otros modulos', async () => {
    const bus = makeMiniBus();
    const ui = makeMiniUiHandler();
    const loader = makeLoader({ bus, uiHandler: ui });
    const a = { fa: async () => ({ status: 200, data: 'a' }) };
    const b = { fb: async () => ({ status: 200, data: 'b' }) };

    loader.registerToolsForAI('mod-a', [{ name: 'a.fa', handler: 'fa', parameters: {} }], a);
    loader.registerToolsForAI('mod-b', [{ name: 'b.fb', handler: 'fb', parameters: {} }], b);

    loader.unregisterToolsForAI('mod-a');

    assert.strictEqual(ui.handlers.has('a.fa'), false);
    assert.strictEqual(ui.handlers.has('b.fb'), true, 'mod-b ui intacto');
  });

  await testAsync('unregister sin uiHandler en core no crashea', async () => {
    const bus = makeMiniBus();
    const loader = makeLoader({ bus, uiHandler: null });
    const instance = { run: async () => ({ status: 200, data: 'ok' }) };

    loader.registerToolsForAI('mod-q', [{ name: 'q.run', handler: 'run', parameters: {} }], instance);
    loader.unregisterToolsForAI('mod-q');

    assert.strictEqual(loader.toolsRegistry.has('q.run'), false);
  });

  // ---------- Group 5: tres destinos coexisten ----------

  await testAsync('una sola declaracion produce los TRES destinos: toolsRegistry + bus + ui', async () => {
    const bus = makeMiniBus();
    const ui = makeMiniUiHandler();
    const loader = makeLoader({ bus, uiHandler: ui });
    const instance = { execute: async (args) => ({ status: 200, data: { received: args } }) };

    loader.registerToolsForAI('multi', [
      { name: 'multi.execute', handler: 'execute', parameters: {} }
    ], instance);

    // 1. toolsRegistry
    assert.ok(loader.toolsRegistry.has('multi.execute'), 'destino 1: toolsRegistry');

    // 2. bus event subscription
    assert.strictEqual(bus.listenerCount('multi.execute'), 1, 'destino 2: bus event');

    // 3. uiHandler register
    assert.ok(ui.handlers.has('multi.execute'), 'destino 3: uiHandler');

    // Los 3 destinos invocan el MISMO handler subyacente
    const direct = await loader.toolsRegistry.get('multi.execute').handler({ x: 1 });
    const viaUi = await ui.handlers.get('multi.execute')({ x: 1 });
    assert.deepStrictEqual(direct, viaUi, 'handler invocable via los 3 destinos devuelve lo mismo');
  });

  console.log('\nTodos los tests pasaron.');
  process.exit(0);
})().catch(err => { console.error('FATAL', err); process.exit(1); });

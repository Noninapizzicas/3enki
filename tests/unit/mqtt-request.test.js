/**
 * Test E2E del mqttRequest inyectado al moduleContext.
 *
 * Carga 2 módulos mock (peer-a llama a peer-b via context.mqttRequest) y
 * verifica el flujo completo: peer-a obtiene la respuesta canónica que
 * peer-b devuelve desde su handler.
 *
 * Validación de la implementación de loader.js (events v1.5.0 context_injection):
 *   context.mqttRequest(domain, action, payload, options?)
 *     → delega a core.uiHandler.handle(domain, action, payload)
 *     → invoca el handler registrado por el módulo destinatario
 *     → devuelve { status, data | error }
 *
 * Ejecutar: node tests/unit/mqtt-request.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const ModuleLoader = require('../../core/modules/loader');

// ----------------------------------------------------------------- helpers

function makeMockUIHandler() {
  const handlers = new Map();
  return {
    register: (domain, action, fn) => handlers.set(`${domain}.${action}`, fn),
    unregister: (domain, action) => handlers.delete(`${domain}.${action}`),
    handle: async (domain, action, data) => {
      const fn = handlers.get(`${domain}.${action}`);
      if (!fn) return { status: 404, error: `No handler for ${domain}/${action}` };
      return fn(data);
    },
    _handlers: handlers
  };
}

function makeMockEventBus() {
  const subs = new Map();
  return {
    subscribe: async (event, handler) => {
      if (!subs.has(event)) subs.set(event, []);
      subs.get(event).push(handler);
      return () => {
        const arr = subs.get(event) || [];
        const i = arr.indexOf(handler);
        if (i >= 0) arr.splice(i, 1);
      };
    },
    publish: async () => {},
    _subs: subs
  };
}

function makeNoopLogger() {
  return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}

function writeMockModule(dir, name, indexCode, manifest) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.js'), indexCode);
  const fullManifest = { name, version: '1.0.0', description: `Mock module ${name}`, main: 'index.js', ...manifest };
  fs.writeFileSync(path.join(dir, 'module.json'), JSON.stringify(fullManifest, null, 2));
  return { dir, manifest: fullManifest };
}

async function loadModule(loader, modulesPath, name) {
  const dir = path.join(modulesPath, name);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'module.json'), 'utf-8'));
  return loader.load(name, dir, manifest);
}

async function unloadModule(loader, name) {
  return loader.unload(name);
}

async function testAsync(description, fn) {
  try {
    await fn();
    console.log(`✓ ${description}`);
  } catch (error) {
    console.error(`✗ ${description}`);
    console.error(`  ${error.message}`);
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  }
}

// ----------------------------------------------------------------- tests

(async () => {
  console.log('mqtt-request — context.mqttRequest E2E\n');

  // ============================================================ Group 1: smoke

  await testAsync('mqttRequest se inyecta al moduleContext', async () => {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'mqtt-req-'));
    const modulesPath = path.join(tmpdir, 'modules');

    let captured = null;
    writeMockModule(path.join(modulesPath, 'peer-a'), 'peer-a',
      `class M {
         async onLoad(ctx) {
           ${'this'}.ctx = ctx;
         }
         async onUnload() {}
       }
       module.exports = M;`,
      { events: { publishes: [], subscribes: [] } }
    );

    const uiHandler = makeMockUIHandler();
    const loader = new ModuleLoader({
      modulesPath,
      core: { uiHandler, eventBus: makeMockEventBus(), logger: makeNoopLogger() },
      logger: makeNoopLogger()
    });

    const result = await loadModule(loader, modulesPath, 'peer-a');
    const inst = result;
    assert.strictEqual(typeof inst.ctx.mqttRequest, 'function', 'mqttRequest debe ser funcion');

    await unloadModule(loader, 'peer-a');
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  // ============================================================ Group 2: peer A llama a peer B

  await testAsync('peer-a hace mqttRequest("peer-b","ping",...) y recibe respuesta canonica', async () => {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'mqtt-req-'));
    const modulesPath = path.join(tmpdir, 'modules');

    // peer-b: declara ui_handlers. El loader lo auto-wirea al uiHandler.
    writeMockModule(path.join(modulesPath, 'peer-b'), 'peer-b',
      `class M {
         async onLoad() { this.callCount = 0; }
         async onUnload() {}
         async handlePing(data) {
           this.callCount++;
           return { status: 200, data: { pong: data?.echo || 'default', call: this.callCount } };
         }
       }
       module.exports = M;`,
      {
        events: { publishes: [], subscribes: [] },
        ui_handlers: [{ domain: 'peer-b', action: 'ping', handler: 'handlePing' }]
      }
    );

    // peer-a: usa mqttRequest
    writeMockModule(path.join(modulesPath, 'peer-a'), 'peer-a',
      `class M {
         async onLoad(ctx) { this.mqttRequest = ctx.mqttRequest; }
         async onUnload() {}
         async callPeer(echo) {
           return this.mqttRequest('peer-b', 'ping', { echo });
         }
       }
       module.exports = M;`,
      { events: { publishes: [], subscribes: [] } }
    );

    const uiHandler = makeMockUIHandler();
    const loader = new ModuleLoader({
      modulesPath,
      core: { uiHandler, eventBus: makeMockEventBus(), logger: makeNoopLogger() },
      logger: makeNoopLogger()
    });

    await loadModule(loader, modulesPath, 'peer-b');     // primero peer-b para que registre su handler
    const a = await loadModule(loader, modulesPath, 'peer-a');

    const r1 = await a.callPeer('hola');
    assert.strictEqual(r1.status, 200);
    assert.strictEqual(r1.data.pong, 'hola');
    assert.strictEqual(r1.data.call, 1);

    const r2 = await a.callPeer('again');
    assert.strictEqual(r2.data.pong, 'again');
    assert.strictEqual(r2.data.call, 2, 'segundo call cuenta correctamente');

    await unloadModule(loader, 'peer-a');
    await unloadModule(loader, 'peer-b');
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  // ============================================================ Group 3: peer destino sin handler → 404

  await testAsync('mqttRequest a domain/action no registrado devuelve 404', async () => {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'mqtt-req-'));
    const modulesPath = path.join(tmpdir, 'modules');

    writeMockModule(path.join(modulesPath, 'peer-a'), 'peer-a',
      `class M {
         async onLoad(ctx) { this.mqttRequest = ctx.mqttRequest; }
         async onUnload() {}
         async callMissing() { return this.mqttRequest('does-not-exist', 'foo', {}); }
       }
       module.exports = M;`,
      { events: { publishes: [], subscribes: [] } }
    );

    const uiHandler = makeMockUIHandler();
    const loader = new ModuleLoader({
      modulesPath,
      core: { uiHandler, eventBus: makeMockEventBus(), logger: makeNoopLogger() },
      logger: makeNoopLogger()
    });

    const a = await loadModule(loader, modulesPath, 'peer-a');
    const r = await a.callMissing();
    assert.strictEqual(r.status, 404);
    assert.ok(/does-not-exist/.test(r.error || ''));

    await unloadModule(loader, 'peer-a');
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  // ============================================================ Group 4: error en handler destinatario propaga

  await testAsync('mqttRequest propaga error que el handler destinatario devuelve', async () => {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'mqtt-req-'));
    const modulesPath = path.join(tmpdir, 'modules');

    writeMockModule(path.join(modulesPath, 'peer-b'), 'peer-b',
      `class M {
         async onLoad() {}
         async onUnload() {}
         async handleFail(data) {
           return { status: 400, error: { code: 'INVALID_INPUT', message: 'missing arg', details: { field: data?.field || '?' } } };
         }
       }
       module.exports = M;`,
      {
        events: { publishes: [], subscribes: [] },
        ui_handlers: [{ domain: 'peer-b', action: 'fail', handler: 'handleFail' }]
      }
    );

    writeMockModule(path.join(modulesPath, 'peer-a'), 'peer-a',
      `class M {
         async onLoad(ctx) { this.mqttRequest = ctx.mqttRequest; }
         async onUnload() {}
         async callFail() { return this.mqttRequest('peer-b', 'fail', { field: 'x' }); }
       }
       module.exports = M;`,
      { events: { publishes: [], subscribes: [] } }
    );

    const uiHandler = makeMockUIHandler();
    const loader = new ModuleLoader({
      modulesPath,
      core: { uiHandler, eventBus: makeMockEventBus(), logger: makeNoopLogger() },
      logger: makeNoopLogger()
    });

    await loadModule(loader, modulesPath, 'peer-b');
    const a = await loadModule(loader, modulesPath, 'peer-a');

    const r = await a.callFail();
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'x');

    await unloadModule(loader, 'peer-a');
    await unloadModule(loader, 'peer-b');
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  // ============================================================ Group 5: mqttRequest sin uiHandler → throws

  await testAsync('mqttRequest lanza si el core no tiene uiHandler', async () => {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'mqtt-req-'));
    const modulesPath = path.join(tmpdir, 'modules');

    writeMockModule(path.join(modulesPath, 'peer-a'), 'peer-a',
      `class M {
         async onLoad(ctx) { this.mqttRequest = ctx.mqttRequest; }
         async onUnload() {}
       }
       module.exports = M;`,
      { events: { publishes: [], subscribes: [] } }
    );

    const loader = new ModuleLoader({
      modulesPath,
      core: { /* sin uiHandler */ eventBus: makeMockEventBus(), logger: makeNoopLogger() },
      logger: makeNoopLogger()
    });

    const a = await loadModule(loader, modulesPath, 'peer-a');
    let threw = false;
    try { await a.mqttRequest('x', 'y', {}); }
    catch (e) { threw = true; assert.ok(/uiHandler/.test(e.message)); }
    assert.ok(threw, 'debe lanzar si no hay uiHandler');

    await unloadModule(loader, 'peer-a');
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  console.log('\nmqtt-request: todos los tests pasaron ✓');
})().catch(err => { console.error(err); process.exit(1); });

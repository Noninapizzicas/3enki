/**
 * Tests unitarios — plugin-manager v2.1.0 (POC2 #7 reescritura).
 *
 * Foco:
 *  - Lifecycle (onLoad descubre plugins, onUnload publica plugin.unloaded por cada uno).
 *  - Validacion canonica HTTP (5 handlers) → { status, data | error: { code, message, details? } }.
 *  - Discovery + load de plugins validos / invalidos.
 *  - Bus handlers (onGetPluginRequest, onListPluginsRequest) con par success/failure.
 *  - correlation_id propagado en TODOS los publishes.
 *  - handleReloadPlugins / handleHealthCheck / handleGetMetrics.
 *  - Helpers POC2 internos.
 *  - Aislamiento: pluginsPath en tmpdir, sin tocar disco real persistente.
 *
 * Ejecutar: node tests/unit/plugin-manager.test.js
 */

'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');

const PluginManagerModule = require('../../modules/plugin-manager/index.js');

// --------------------------------------------------
// Mock infra
// --------------------------------------------------

function makeMocks() {
  const logs = [];
  const published = [];
  const metricsCalls = [];

  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };

  const metrics = {
    increment: (n, l) => metricsCalls.push(['increment', n, l]),
    gauge:     (n, v, l) => metricsCalls.push(['gauge', n, v, l]),
    timing:    (n, ms, l) => metricsCalls.push(['timing', n, ms, l])
  };

  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); }
  };

  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

function makeTmpPluginsDir() {
  const tmpDir = path.join(os.tmpdir(), `plugmgr-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

function writePluginFile(tmpDir, pluginName, content) {
  const tmpPathDir = path.join(tmpDir, pluginName);
  fs.mkdirSync(tmpPathDir, { recursive: true });
  const tmpPath = path.join(tmpPathDir, `${pluginName}.functions.json`);
  fs.writeFileSync(tmpPath, typeof content === 'string' ? content : JSON.stringify(content));
  return tmpPath;
}

async function instantiate(mocks, opts = {}) {
  const m = new PluginManagerModule();
  const pluginsPath = opts.pluginsPath || makeTmpPluginsDir();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    moduleConfig: { pluginsPath, autoReload: false, ...opts.config }
  });
  return { module: m, pluginsPath };
}

async function cleanup(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

function isCanonicalError(result) {
  return result && typeof result.status === 'number'
    && result.error && typeof result.error === 'object'
    && typeof result.error.code === 'string'
    && typeof result.error.message === 'string'
    && !('data' in result);
}

function isCanonicalSuccess(result) {
  return result && typeof result.status === 'number'
    && result.data && typeof result.data === 'object'
    && !('error' in result);
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

const validPlugin = (name = 'demo') => ({
  metadata: { name, version: '1.0.0', description: 'demo' },
  functions: {
    foo: { description: 'foo fn', parameters: { type: 'object', properties: {} } },
    bar: { description: 'bar fn', parameters: { type: 'object', properties: {} } }
  }
});

// ==================================================
//                                                Tests
// ==================================================

(async () => {
  console.log('plugin-manager — reescritura canonica v2.1.0 (POC2 #7)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad sin plugins → carga limpia + plugins.size=0', async () => {
    const mocks = makeMocks();
    const { module: m, pluginsPath } = await instantiate(mocks);
    assert.strictEqual(m.plugins.size, 0);
    await m.onUnload();
    await cleanup(pluginsPath);
  });

  await testAsync('onLoad descubre plugin valido + publica plugin.loaded con correlation_id', async () => {
    const mocks = makeMocks();
    const pluginsPath = makeTmpPluginsDir();
    writePluginFile(pluginsPath, 'demo', validPlugin('demo'));

    const m = new PluginManagerModule();
    await m.onLoad({
      logger: mocks.logger,
      metrics: mocks.metrics,
      eventBus: mocks.eventBus,
      moduleConfig: { pluginsPath, autoReload: false }
    });

    assert.strictEqual(m.plugins.size, 1);
    assert.ok(m.plugins.has('demo'));
    const loaded = publishedOf(mocks, 'plugin.loaded');
    assert.strictEqual(loaded.length, 1);
    assert.strictEqual(loaded[0].name, 'demo');
    assert.strictEqual(loaded[0].function_count, 2);
    assert.ok(loaded[0].correlation_id);
    assert.ok(loaded[0].timestamp);
    await m.onUnload();
    await cleanup(pluginsPath);
  });

  await testAsync('onLoad con plugin invalido → publica plugin.error con context=load', async () => {
    const mocks = makeMocks();
    const pluginsPath = makeTmpPluginsDir();
    // metadata sin name → invalid structure
    writePluginFile(pluginsPath, 'broken', { metadata: { version: '1.0.0' }, functions: {} });

    const m = new PluginManagerModule();
    await m.onLoad({
      logger: mocks.logger,
      metrics: mocks.metrics,
      eventBus: mocks.eventBus,
      moduleConfig: { pluginsPath, autoReload: false }
    });

    assert.strictEqual(m.plugins.size, 0);
    const errors = publishedOf(mocks, 'plugin.error');
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].context, 'load');
    assert.ok(/invalid structure/i.test(errors[0].error));
    await m.onUnload();
    await cleanup(pluginsPath);
  });

  await testAsync('onUnload publica plugin.unloaded por cada plugin + clear Map', async () => {
    const mocks = makeMocks();
    const pluginsPath = makeTmpPluginsDir();
    writePluginFile(pluginsPath, 'a', validPlugin('a'));
    writePluginFile(pluginsPath, 'b', validPlugin('b'));

    const m = new PluginManagerModule();
    await m.onLoad({
      logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus,
      moduleConfig: { pluginsPath, autoReload: false }
    });
    assert.strictEqual(m.plugins.size, 2);
    mocks.published.length = 0;

    await m.onUnload();
    assert.strictEqual(m.plugins.size, 0);
    const unloaded = publishedOf(mocks, 'plugin.unloaded');
    assert.strictEqual(unloaded.length, 2);
    const names = unloaded.map(u => u.name).sort();
    assert.deepStrictEqual(names, ['a', 'b']);
    await cleanup(pluginsPath);
  });

  await testAsync('onUnload limpia watchInterval (sin leak de timer)', async () => {
    const mocks = makeMocks();
    const pluginsPath = makeTmpPluginsDir();
    const m = new PluginManagerModule();
    await m.onLoad({
      logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus,
      moduleConfig: { pluginsPath, autoReload: true, watchInterval: 60000 }
    });
    assert.ok(m.watchInterval);
    await m.onUnload();
    assert.strictEqual(m.watchInterval, null);
    await cleanup(pluginsPath);
  });

  // ==========================================
  // Group 2: Validacion canonica HTTP handlers
  // ==========================================

  await testAsync('handleGetPlugin sin name → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m, pluginsPath } = await instantiate(mocks);
    const r = await m.handleGetPlugin({}, { params: {} });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
    await cleanup(pluginsPath);
  });

  await testAsync('handleGetPlugin name no existe → 404 RESOURCE_NOT_FOUND canonico', async () => {
    const mocks = makeMocks();
    const { module: m, pluginsPath } = await instantiate(mocks);
    const r = await m.handleGetPlugin({}, { params: { name: 'noexist' } });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(r.error.details.entity_type, 'plugin');
    assert.strictEqual(r.error.details.entity_id, 'noexist');
    await m.onUnload();
    await cleanup(pluginsPath);
  });

  await testAsync('handleGetPlugin name existe → 200 con plugin', async () => {
    const mocks = makeMocks();
    const pluginsPath = makeTmpPluginsDir();
    writePluginFile(pluginsPath, 'demo', validPlugin('demo'));
    const m = new PluginManagerModule();
    await m.onLoad({
      logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus,
      moduleConfig: { pluginsPath, autoReload: false }
    });
    const r = await m.handleGetPlugin({}, { params: { name: 'demo' } });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.plugin.metadata.name, 'demo');
    await m.onUnload();
    await cleanup(pluginsPath);
  });

  // ==========================================
  // Group 3: Discovery + load
  // ==========================================

  await testAsync('Discovery procesa solo *.functions.json y skipea otros archivos', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpPluginsDir();
    writePluginFile(tmpDir, 'demo', validPlugin('demo'));
    fs.writeFileSync(path.join(tmpDir, 'demo', 'README.md'), '# noise');
    fs.writeFileSync(path.join(tmpDir, 'demo', 'config.yml'), 'noise');
    const pluginsPath = tmpDir;

    const m = new PluginManagerModule();
    await m.onLoad({
      logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus,
      moduleConfig: { pluginsPath, autoReload: false }
    });
    assert.strictEqual(m.plugins.size, 1);
    await m.onUnload();
    await cleanup(pluginsPath);
  });

  await testAsync('Discovery con JSON malformado → 0 plugins + plugin.error publicado', async () => {
    const mocks = makeMocks();
    const pluginsPath = makeTmpPluginsDir();
    writePluginFile(pluginsPath, 'broken', '{ this is: not valid json }');

    const m = new PluginManagerModule();
    await m.onLoad({
      logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus,
      moduleConfig: { pluginsPath, autoReload: false }
    });
    assert.strictEqual(m.plugins.size, 0);
    const errors = publishedOf(mocks, 'plugin.error');
    assert.strictEqual(errors.length, 1);
    await m.onUnload();
    await cleanup(pluginsPath);
  });

  await testAsync('Discovery skip si plugin ya cargado (idempotencia)', async () => {
    const mocks = makeMocks();
    const pluginsPath = makeTmpPluginsDir();
    writePluginFile(pluginsPath, 'demo', validPlugin('demo'));

    const m = new PluginManagerModule();
    await m.onLoad({
      logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus,
      moduleConfig: { pluginsPath, autoReload: false }
    });
    mocks.published.length = 0;
    // Re-discover: el plugin ya esta cargado → no se publica plugin.loaded otra vez
    await m._discoverPlugins(crypto.randomUUID());
    const loaded = publishedOf(mocks, 'plugin.loaded');
    assert.strictEqual(loaded.length, 0);
    assert.strictEqual(m.plugins.size, 1);
    await m.onUnload();
    await cleanup(pluginsPath);
  });

  // ==========================================
  // Group 4: Bus handlers
  // ==========================================

  await testAsync('onGetPluginRequest con plugin existente → response success + correlation_id propagado', async () => {
    const mocks = makeMocks();
    const pluginsPath = makeTmpPluginsDir();
    writePluginFile(pluginsPath, 'demo', validPlugin('demo'));
    const m = new PluginManagerModule();
    await m.onLoad({
      logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus,
      moduleConfig: { pluginsPath, autoReload: false }
    });
    mocks.published.length = 0;

    await m.onGetPluginRequest({
      payload: { name: 'demo', request_id: 'req-1', correlation_id: 'cid-abc' }
    });
    const resp = publishedOf(mocks, 'plugin.get.response')[0];
    assert.ok(resp);
    assert.strictEqual(resp.request_id, 'req-1');
    assert.strictEqual(resp.success, true);
    assert.strictEqual(resp.correlation_id, 'cid-abc');
    assert.ok(resp.plugin);
    await m.onUnload();
    await cleanup(pluginsPath);
  });

  await testAsync('onGetPluginRequest con plugin inexistente → response success:false + error_code', async () => {
    const mocks = makeMocks();
    const { module: m, pluginsPath } = await instantiate(mocks);
    mocks.published.length = 0;

    await m.onGetPluginRequest({
      payload: { name: 'noexist', request_id: 'req-2' }
    });
    const resp = publishedOf(mocks, 'plugin.get.response')[0];
    assert.ok(resp);
    assert.strictEqual(resp.success, false);
    assert.strictEqual(resp.error_code, 'RESOURCE_NOT_FOUND');
    assert.ok(resp.correlation_id);
    await m.onUnload();
    await cleanup(pluginsPath);
  });

  await testAsync('onGetPluginRequest sin request_id → no publica + warn', async () => {
    const mocks = makeMocks();
    const { module: m, pluginsPath } = await instantiate(mocks);
    mocks.published.length = 0;

    await m.onGetPluginRequest({ payload: { name: 'demo' } });
    const resp = publishedOf(mocks, 'plugin.get.response');
    assert.strictEqual(resp.length, 0);
    const warns = mocks.logs.filter(l => l[0] === 'warn');
    assert.ok(warns.some(w => w[1].includes('invalid_payload')));
    await m.onUnload();
    await cleanup(pluginsPath);
  });

  await testAsync('onListPluginsRequest devuelve count + plugins[]', async () => {
    const mocks = makeMocks();
    const pluginsPath = makeTmpPluginsDir();
    writePluginFile(pluginsPath, 'a', validPlugin('a'));
    writePluginFile(pluginsPath, 'b', validPlugin('b'));
    const m = new PluginManagerModule();
    await m.onLoad({
      logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus,
      moduleConfig: { pluginsPath, autoReload: false }
    });
    mocks.published.length = 0;

    await m.onListPluginsRequest({ payload: { request_id: 'req-list' } });
    const resp = publishedOf(mocks, 'plugin.list.response')[0];
    assert.ok(resp);
    assert.strictEqual(resp.success, true);
    assert.strictEqual(resp.count, 2);
    assert.strictEqual(resp.plugins.length, 2);
    await m.onUnload();
    await cleanup(pluginsPath);
  });

  // ==========================================
  // Group 5: handleReloadPlugins
  // ==========================================

  await testAsync('handleReloadPlugins re-descubre plugins + publica plugin.reloaded', async () => {
    const mocks = makeMocks();
    const pluginsPath = makeTmpPluginsDir();
    writePluginFile(pluginsPath, 'demo', validPlugin('demo'));
    const m = new PluginManagerModule();
    await m.onLoad({
      logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus,
      moduleConfig: { pluginsPath, autoReload: false }
    });

    // Anyadir un plugin nuevo en disco
    writePluginFile(pluginsPath, 'demo2', validPlugin('demo2'));
    mocks.published.length = 0;

    const r = await m.handleReloadPlugins({}, { correlationId: 'cid-reload' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.count, 2);
    assert.strictEqual(r.data.loaded, 2);

    const reloaded = publishedOf(mocks, 'plugin.reloaded')[0];
    assert.ok(reloaded);
    assert.strictEqual(reloaded.count, 2);
    assert.strictEqual(reloaded.correlation_id, 'cid-reload');
    await m.onUnload();
    await cleanup(pluginsPath);
  });

  // ==========================================
  // Group 6: handleHealthCheck + handleGetMetrics
  // ==========================================

  await testAsync('handleHealthCheck devuelve shape canonico { status, data } con info', async () => {
    const mocks = makeMocks();
    const { module: m, pluginsPath } = await instantiate(mocks);
    const r = await m.handleHealthCheck();
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.status, 'healthy');
    assert.strictEqual(r.data.module, 'plugin-manager');
    assert.strictEqual(r.data.version, '2.1.0');
    assert.strictEqual(typeof r.data.uptime, 'number');
    await m.onUnload();
    await cleanup(pluginsPath);
  });

  await testAsync('handleGetMetrics devuelve counters + gauges con prefix plugin-manager.*', async () => {
    const mocks = makeMocks();
    const pluginsPath = makeTmpPluginsDir();
    writePluginFile(pluginsPath, 'demo', validPlugin('demo'));
    const m = new PluginManagerModule();
    await m.onLoad({
      logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus,
      moduleConfig: { pluginsPath, autoReload: false }
    });

    const r = await m.handleGetMetrics();
    assert.strictEqual(r.status, 200);
    assert.ok('plugin-manager.loaded.total' in r.data.counters);
    assert.ok('plugin-manager.count' in r.data.gauges);
    assert.strictEqual(r.data.gauges['plugin-manager.count'], 1);
    assert.strictEqual(r.data.gauges['plugin-manager.functions.count'], 2);
    await m.onUnload();
    await cleanup(pluginsPath);
  });

  // ==========================================
  // Group 7: Helpers POC2 internos
  // ==========================================

  await testAsync('_errorResponse construye shape canonico { status, error: { code, message, details? } }', async () => {
    const mocks = makeMocks();
    const { module: m, pluginsPath } = await instantiate(mocks);
    const r1 = m._errorResponse(400, 'INVALID_INPUT', 'msg', { field: 'x' });
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { field: 'x' } } });
    const r2 = m._errorResponse(500, 'UNKNOWN_ERROR', 'oops');
    assert.deepStrictEqual(r2, { status: 500, error: { code: 'UNKNOWN_ERROR', message: 'oops' } });
    await m.onUnload();
    await cleanup(pluginsPath);
  });

  await testAsync('_classifyHandlerError mapea por mensaje a codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m, pluginsPath } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(new Error('Plugin not found')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('name is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('already loaded')), 'ALREADY_EXISTS');
    assert.strictEqual(m._classifyHandlerError(new Error('something exploded')), 'UNKNOWN_ERROR');
    await m.onUnload();
    await cleanup(pluginsPath);
  });

  await testAsync('_publicarEvento hereda correlation_id si se pasa, genera uno nuevo si no', async () => {
    const mocks = makeMocks();
    const { module: m, pluginsPath } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { foo: 1 }, { correlation_id: 'cid-inherit' });
    await m._publicarEvento('test.event', { bar: 2 });
    const evs = publishedOf(mocks, 'test.event');
    assert.strictEqual(evs.length, 2);
    assert.strictEqual(evs[0].correlation_id, 'cid-inherit');
    assert.notStrictEqual(evs[1].correlation_id, 'cid-inherit');
    assert.ok(typeof evs[1].correlation_id === 'string');
    assert.ok(evs[0].timestamp && evs[1].timestamp);
    await m.onUnload();
    await cleanup(pluginsPath);
  });

  await testAsync('_handleHandlerError mapea status segun code y registra metric', async () => {
    const mocks = makeMocks();
    const { module: m, pluginsPath } = await instantiate(mocks);
    const err = Object.assign(new Error('not found'), { _code: 'RESOURCE_NOT_FOUND', _details: { e: 1 } });
    const r = m._handleHandlerError('test.failed', err, 'kind');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.deepStrictEqual(r.error.details, { e: 1 });
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'plugin-manager.errors');
    assert.ok(errMetric);
    await m.onUnload();
    await cleanup(pluginsPath);
  });

  console.log('\nTodos los tests pasaron.');
})();

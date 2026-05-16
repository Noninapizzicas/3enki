/**
 * Tests unitarios — admin-panel (POC2).
 *
 * Mocks _httpRequest (loopback) + filesystem para refreshModulesCache.
 *
 * Ejecutar: node tests/unit/admin-panel.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const AdminPanelModule = require('../../modules/admin-panel/index.js');

let TMP_ROOT;
let ORIG_CWD;

function setupTmpCwd() {
  ORIG_CWD = process.cwd();
  TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-panel-test-'));
  process.chdir(TMP_ROOT);
  fs.mkdirSync(path.join(TMP_ROOT, 'modules', 'sample-module'), { recursive: true });
  fs.writeFileSync(
    path.join(TMP_ROOT, 'modules', 'sample-module', 'module.json'),
    JSON.stringify({
      name: 'sample-module',
      version: '1.0.0',
      description: 'Sample for testing',
      ui: { enabled: true, title: 'Sample' }
    })
  );
}

function teardownTmpCwd() {
  if (ORIG_CWD) process.chdir(ORIG_CWD);
  if (TMP_ROOT) {
    try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch (_) {}
  }
}

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
  const eventBus = { publish: async (e, p) => { published.push([e, p]); } };
  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

async function instantiate(mocks, opts = {}) {
  const m = new AdminPanelModule();

  // Mock _httpRequest para evitar loopback HTTP real
  const httpResponses = opts.httpResponses || {};
  const httpCalls = [];
  m._httpRequest = async (method, requestPath, payload) => {
    httpCalls.push({ method, path: requestPath, payload });
    const key = `${method} ${requestPath}`;
    if (httpResponses[key]) {
      const r = httpResponses[key];
      if (r._fail) throw new Error(r._fail);
      return r;
    }
    // Defaults razonables
    if (method === 'GET' && requestPath.includes('/plugins')) return { plugins: [] };
    if (method === 'GET' && requestPath.includes('/prompts')) return { prompts: [] };
    return {};
  };

  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    moduleConfig: {},
    config: {}
  });
  m._httpCalls = httpCalls;
  return { module: m };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

function isCanonicalError(r) {
  return r && typeof r.status === 'number' && r.error
    && typeof r.error.code === 'string'
    && typeof r.error.message === 'string'
    && !('data' in r);
}

function isCanonicalSuccess(r) {
  return r && typeof r.status === 'number' && r.data && !('error' in r);
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

(async () => {
  setupTmpCwd();
  console.log('admin-panel — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad inicializa estado limpio + carga caches', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'admin-panel');
    assert.strictEqual(m.version, '2.0.0');
    assert.ok(Array.isArray(m.cache.modules));
    // sample-module fue auto-discovered de modules/
    assert.ok(m.cache.modules.length >= 1);
    await m.onUnload();
  });

  await testAsync('onUnload limpia caches', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onUnload();
    assert.strictEqual(m.cache.plugins.length, 0);
    assert.strictEqual(m.cache.modules.length, 0);
  });

  // Group 2: Validacion canonica
  await testAsync('handleTogglePlugin sin name devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleTogglePlugin({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleCreateAgent sin name devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreateAgent({});
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('handleDeleteAgent sin id devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleDeleteAgent({});
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('handleDeleteAgent con id inexistente devuelve 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleDeleteAgent({ id: 'fantasma' });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleGetPrompt sin name devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetPrompt({});
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('handleCreatePrompt sin name devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreatePrompt({ body: {} });
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('handleUpdatePrompt sin name devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleUpdatePrompt({});
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  // Group 3: Plugin toggle + eventos canonicos
  await testAsync('handleTogglePlugin emite admin.plugin.toggled (no admin.action)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, {
      httpResponses: {
        'POST /modules/plugin-manager/plugin/foo/toggle': { enabled: true }
      }
    });
    const r = await m.handleTogglePlugin({
      name: 'foo',
      project_id: 'proj-1',
      correlation_id: 'cid-toggle'
    });
    assert.strictEqual(r.status, 200);

    // Antes: admin.action (verbo generico). Ahora: admin.plugin.toggled
    assert.strictEqual(publishedOf(mocks, 'admin.action').length, 0);
    const evs = publishedOf(mocks, 'admin.plugin.toggled');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].plugin, 'foo');
    assert.strictEqual(evs[0].correlation_id, 'cid-toggle');
    assert.strictEqual(evs[0].project_id, 'proj-1');
    assert.ok(evs[0].timestamp);
    await m.onUnload();
  });

  // Group 4: Agent CRUD
  await testAsync('handleCreateAgent emite admin.agent.creado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreateAgent({
      body: { name: 'My Agent', subscribes: ['evt.x'], provider: 'deepseek' },
      project_id: 'proj-2',
      correlation_id: 'cid-agent'
    });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.name, 'My Agent');

    const evs = publishedOf(mocks, 'admin.agent.creado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].agent_name, 'My Agent');
    assert.strictEqual(evs[0].project_id, 'proj-2');
    assert.strictEqual(evs[0].correlation_id, 'cid-agent');
    await m.onUnload();
  });

  await testAsync('handleDeleteAgent emite admin.agent.eliminado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const created = await m.handleCreateAgent({ body: { name: 'A' } });
    const r = await m.handleDeleteAgent({ id: created.data.id });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.deleted, true);

    const evs = publishedOf(mocks, 'admin.agent.eliminado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].agent_id, created.data.id);
    await m.onUnload();
  });

  // Group 5: Prompt CRUD
  await testAsync('handleCreatePrompt emite admin.prompt.creado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, {
      httpResponses: {
        'POST /modules/prompt-manager/prompts': { ok: true, name: 'mi-prompt' }
      }
    });
    const r = await m.handleCreatePrompt({
      body: { name: 'mi-prompt', content: 'Eres un asistente' },
      correlation_id: 'cid-p'
    });
    assert.strictEqual(r.status, 201);
    const evs = publishedOf(mocks, 'admin.prompt.creado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].prompt_name, 'mi-prompt');
    await m.onUnload();
  });

  await testAsync('handleUpdatePrompt emite admin.prompt.actualizado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, {
      httpResponses: {
        'PUT /modules/prompt-manager/prompt/mi-prompt': { ok: true }
      }
    });
    const r = await m.handleUpdatePrompt({
      name: 'mi-prompt',
      body: { content: 'nuevo contenido' }
    });
    assert.strictEqual(r.status, 200);
    const evs = publishedOf(mocks, 'admin.prompt.actualizado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].prompt_name, 'mi-prompt');
    await m.onUnload();
  });

  await testAsync('handleGetPrompt forwarda al prompt-manager via _httpRequest', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, {
      httpResponses: {
        'GET /modules/prompt-manager/prompt/foo': { name: 'foo', content: 'X' }
      }
    });
    const r = await m.handleGetPrompt({ name: 'foo' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.name, 'foo');
    await m.onUnload();
  });

  // Group 6: List handlers + dashboard
  await testAsync('handleDashboard devuelve summary + caches', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, {
      httpResponses: {
        'GET /modules/plugin-manager/plugins': { plugins: [{ name: 'p1' }] },
        'GET /modules/prompt-manager/prompts': { prompts: [{ name: 'pr1' }] }
      }
    });
    const r = await m.handleDashboard();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.summary.total_plugins, 1);
    assert.strictEqual(r.data.summary.total_prompts, 1);
    assert.ok(r.data.summary.total_modules >= 1);
    await m.onUnload();
  });

  await testAsync('handleListPlugins delega via http loopback', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, {
      httpResponses: {
        'GET /modules/plugin-manager/plugins': { plugins: [{ name: 'a' }, { name: 'b' }] }
      }
    });
    const r = await m.handleListPlugins();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.count, 2);
    await m.onUnload();
  });

  await testAsync('handleListAgents devuelve mock data por defecto', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleListAgents();
    assert.ok(isCanonicalSuccess(r));
    assert.ok(r.data.count >= 1);
    await m.onUnload();
  });

  await testAsync('handleListModules lee modules/ desde filesystem', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleListModules();
    assert.ok(isCanonicalSuccess(r));
    assert.ok(r.data.count >= 1);
    const sample = r.data.modules.find(m => m.name === 'sample-module');
    assert.ok(sample);
    assert.strictEqual(sample.hasAutoUI, true);
    await m.onUnload();
  });

  await testAsync('handleListPrompts delega via http loopback', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, {
      httpResponses: {
        'GET /modules/prompt-manager/prompts': { prompts: [{ name: 'p' }] }
      }
    });
    const r = await m.handleListPrompts();
    assert.strictEqual(r.data.count, 1);
    await m.onUnload();
  });

  await testAsync('handleHealth devuelve shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealth();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.status, 'healthy');
    assert.strictEqual(r.data.version, '2.0.0');
    await m.onUnload();
  });

  // Group 7: Subscriber + helpers POC2
  await testAsync('onPluginLoaded refresca cache de plugins', async () => {
    const mocks = makeMocks();
    let calls = 0;
    const { module: m } = await instantiate(mocks);
    const orig = m._httpRequest;
    m._httpRequest = async (method, p) => {
      calls++;
      if (method === 'GET' && p.includes('/plugins')) return { plugins: [{ name: 'newone' }] };
      return orig(method, p);
    };
    await m.onPluginLoaded({ data: { plugin: 'newone' } });
    assert.ok(calls >= 1);
    assert.strictEqual(m.cache.plugins.length, 1);
    await m.onUnload();
  });

  await testAsync('_errorResponse construye shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._errorResponse(400, 'INVALID_INPUT', 'msg', { f: 'x' });
    assert.deepStrictEqual(r, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { f: 'x' } } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.deepStrictEqual(m._classifyHandlerError(new Error('field is required')), { status: 400, code: 'INVALID_INPUT' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('not found')), { status: 404, code: 'RESOURCE_NOT_FOUND' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('ECONNREFUSED')), { status: 503, code: 'UPSTREAM_UNREACHABLE' });
    await m.onUnload();
  });

  await testAsync('_publicarEvento añade correlation_id, project_id top-level y timestamp', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { foo: 1, project_id: 'p-z' }, { correlation_id: 'cid-z' });
    const ev = mocks.published[0][1];
    assert.strictEqual(ev.correlation_id, 'cid-z');
    assert.strictEqual(ev.project_id, 'p-z');
    assert.ok(ev.timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError emite metric admin-panel.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'));
    assert.strictEqual(r.status, 404);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'admin-panel.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  teardownTmpCwd();
  console.log('\nTodos los tests pasaron.');
})().catch(e => {
  teardownTmpCwd();
  console.error(e);
  process.exit(1);
});

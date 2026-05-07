/**
 * Tests unitarios — conversation-export (POC2 reescritura).
 * Ejecutar: node tests/unit/conversation-export.test.js
 */

'use strict';

const assert = require('assert');
const crypto = require('crypto');

const ConversationExportModule = require('../../modules/conversation-export/index.js');

// --------------------------------------------------
// Mock infra
// --------------------------------------------------

function makeMocks() {
  const logs = [];
  const published = [];
  const metricsCalls = [];
  const subscribeHandlers = {};

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
    publish: async (event, payload) => { published.push([event, payload]); },
    subscribe: async (event, handler) => {
      if (!subscribeHandlers[event]) subscribeHandlers[event] = [];
      subscribeHandlers[event].push(handler);
      return async () => {
        subscribeHandlers[event] = subscribeHandlers[event].filter(h => h !== handler);
      };
    }
  };

  return { logs, published, metricsCalls, subscribeHandlers, logger, metrics, eventBus };
}

async function instantiate(mocks, opts = {}) {
  const m = new ConversationExportModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    moduleConfig: opts.config || {}
  });
  return { module: m };
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

// ==================================================
//                                                Tests
// ==================================================

(async () => {
  console.log('conversation-export — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa estado limpio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'conversation-export');
    assert.strictEqual(m.version, '2.0.0');
    assert.ok(m.pendingDbRequests instanceof Map);
    assert.strictEqual(m.pendingDbRequests.size, 0);
    assert.ok(Array.isArray(m.activityBuffer));
    assert.strictEqual(m.activityBuffer.length, 0);
    await m.onUnload();
  });

  await testAsync('onLoad loguea warn si no hay token', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: {} });
    const warnLogs = mocks.logs.filter(([l, e]) => l === 'warn' && e === 'conversation-export.no_token');
    assert.strictEqual(warnLogs.length, 1);
    await m.onUnload();
  });

  await testAsync('onLoad NO loguea warn si hay token', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { token: 'secret' } });
    const warnLogs = mocks.logs.filter(([l, e]) => l === 'warn' && e === 'conversation-export.no_token');
    assert.strictEqual(warnLogs.length, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia pendingDbRequests con reject + clearTimeout', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let rejected = false;
    m.pendingDbRequests.set('leak-1', {
      resolve: () => {},
      reject: () => { rejected = true; },
      timeout: setTimeout(() => {}, 60000)
    });
    assert.strictEqual(m.pendingDbRequests.size, 1);
    await m.onUnload();
    assert.strictEqual(m.pendingDbRequests.size, 0);
    assert.strictEqual(rejected, true);
  });

  await testAsync('onUnload vacia activityBuffer', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.activityBuffer.push({ ts: 'x' });
    await m.onUnload();
    assert.strictEqual(m.activityBuffer.length, 0);
  });

  // ==========================================
  // Group 2: Auth
  // ==========================================

  await testAsync('handleListSessions devuelve DEPENDENCY_UNAVAILABLE si no hay token configurado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: {} });
    const req = { params: { project_id: 'proj1' }, query: {}, headers: {} };
    const r = await m.handleListSessions(req, {});
    assert.ok(isCanonicalError(r), 'debe ser canonical error');
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.error.code, 'DEPENDENCY_UNAVAILABLE');
    await m.onUnload();
  });

  await testAsync('handleListSessions devuelve AUTHENTICATION_REQUIRED si falta token en request', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { token: 'secret' } });
    const req = { params: { project_id: 'proj1' }, query: {}, headers: {} };
    const r = await m.handleListSessions(req, {});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 401);
    assert.strictEqual(r.error.code, 'AUTHENTICATION_REQUIRED');
    await m.onUnload();
  });

  await testAsync('handleListSessions devuelve PERMISSION_DENIED si token es incorrecto', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { token: 'secret' } });
    const req = { params: { project_id: 'proj1' }, query: { token: 'wrong' }, headers: {} };
    const r = await m.handleListSessions(req, {});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.error.code, 'PERMISSION_DENIED');
    await m.onUnload();
  });

  await testAsync('_checkAuth acepta token via header X-Token', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { token: 'secret' } });
    const req = { query: {}, headers: { 'x-token': 'secret' } };
    const err = m._checkAuth(req);
    assert.strictEqual(err, null);
    await m.onUnload();
  });

  await testAsync('_checkAuth acepta token via Authorization Bearer', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { token: 'secret' } });
    const req = { query: {}, headers: { authorization: 'Bearer secret' } };
    const err = m._checkAuth(req);
    assert.strictEqual(err, null);
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Validacion de campos requeridos
  // ==========================================

  await testAsync('handleListSessions devuelve MISSING_FIELD si falta project_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { token: 'tok' } });
    const req = { params: {}, query: { token: 'tok' }, headers: {} };
    const r = await m.handleListSessions(req, {});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'MISSING_FIELD');
    await m.onUnload();
  });

  await testAsync('handleGetSession devuelve MISSING_FIELD si falta session_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { token: 'tok' } });
    const req = { params: {}, query: { token: 'tok', project_id: 'p1' }, headers: {} };
    const r = await m.handleGetSession(req, {});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'MISSING_FIELD');
    await m.onUnload();
  });

  await testAsync('handleGetSession devuelve MISSING_FIELD si falta project_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { token: 'tok' } });
    const req = { params: { session_id: 'sess1' }, query: { token: 'tok' }, headers: {} };
    const r = await m.handleGetSession(req, {});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'MISSING_FIELD');
    await m.onUnload();
  });

  await testAsync('handleGetLatest devuelve MISSING_FIELD si falta project_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { token: 'tok' } });
    const req = { params: {}, query: { token: 'tok' }, headers: {} };
    const r = await m.handleGetLatest(req, {});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'MISSING_FIELD');
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Activity buffer
  // ==========================================

  await testAsync('_bufferActivity acumula entradas hasta MAX_BUFFER', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.MAX_BUFFER = 3;
    m._bufferActivity({ ts: '1' });
    m._bufferActivity({ ts: '2' });
    m._bufferActivity({ ts: '3' });
    m._bufferActivity({ ts: '4' });
    assert.strictEqual(m.activityBuffer.length, 3);
    assert.strictEqual(m.activityBuffer[0].ts, '2');
    assert.strictEqual(m.activityBuffer[2].ts, '4');
    await m.onUnload();
  });

  await testAsync('_filterActivityBuffer filtra por ventana temporal', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const now = Date.now();
    m.activityBuffer.push({ timestamp: new Date(now - 5000).toISOString() });
    m.activityBuffer.push({ timestamp: new Date(now).toISOString() });
    m.activityBuffer.push({ timestamp: new Date(now + 5000).toISOString() });
    const filtered = m._filterActivityBuffer({ start: now - 1000, end: now + 1000 });
    assert.strictEqual(filtered.length, 1);
    await m.onUnload();
  });

  await testAsync('_filterActivityBuffer sin timeWindow devuelve todo el buffer', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.activityBuffer.push({ ts: '1' }, { ts: '2' });
    const filtered = m._filterActivityBuffer(null);
    assert.strictEqual(filtered.length, 2);
    await m.onUnload();
  });

  // ==========================================
  // Group 5: DB query (correlation_id + response handling)
  // ==========================================

  await testAsync('_queryDB publica db.query.request con correlation_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const cid = 'test-cid-001';
    const queryPromise = m._queryDB('proj1', 'SELECT 1', [], cid);

    const published = publishedOf(mocks, 'db.query.request');
    assert.strictEqual(published.length, 1);
    assert.strictEqual(published[0].correlation_id, cid);
    assert.strictEqual(published[0].project_id, 'proj1');
    assert.strictEqual(published[0].read_only, true);
    const requestId = published[0].request_id;
    assert.ok(requestId);

    // Resolver la promise simulando respuesta del bus
    m._onDbQueryResponse({ data: { request_id: requestId, success: true, data: [{ id: 1 }] } });
    const rows = await queryPromise;
    assert.deepStrictEqual(rows, [{ id: 1 }]);
    await m.onUnload();
  });

  await testAsync('_onDbQueryResponse rechaza promise si success=false', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const queryPromise = m._queryDB('proj1', 'SELECT 1', []);

    const published = publishedOf(mocks, 'db.query.request');
    const requestId = published[0].request_id;

    m._onDbQueryResponse({ data: { request_id: requestId, success: false, error: 'Table not found' } });
    await assert.rejects(async () => queryPromise, /Table not found/);
    await m.onUnload();
  });

  await testAsync('_onDbQueryResponse ignora request_id desconocido', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.doesNotThrow(() => {
      m._onDbQueryResponse({ data: { request_id: 'unknown-id', success: true, data: [] } });
    });
    await m.onUnload();
  });

  // ==========================================
  // Group 6: handleGetLatest — RESOURCE_NOT_FOUND cuando no hay sesiones
  // ==========================================

  await testAsync('handleGetLatest devuelve RESOURCE_NOT_FOUND si no hay sesiones', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { token: 'tok' } });
    const req = { params: { project_id: 'emptyproj' }, query: { token: 'tok' }, headers: {} };

    // Patch _loadSessionsFromDB para devolver []
    m._loadSessionsFromDB = async () => [];

    const r = await m.handleGetLatest(req, {});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleHealth siempre devuelve 200 sin auth', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: {} });
    const r = await m.handleHealth({}, {});
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.module, 'conversation-export');
    assert.strictEqual(r.data.token_configured, false);
    await m.onUnload();
  });

  // ==========================================
  // Group 7: Helpers POC2 internos
  // ==========================================

  await testAsync('_errorResponse construye shape canonico { status, error: { code, message, details? } }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = m._errorResponse(400, 'MISSING_FIELD', 'msg', { field: 'x' });
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'MISSING_FIELD', message: 'msg', details: { field: 'x' } } });
    const r2 = m._errorResponse(500, 'UNKNOWN_ERROR', 'oops');
    assert.deepStrictEqual(r2, { status: 500, error: { code: 'UNKNOWN_ERROR', message: 'oops' } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea por mensaje a codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(new Error('not found')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'MISSING_FIELD');
    assert.strictEqual(m._classifyHandlerError(new Error('query timeout')), 'TIMEOUT');
    assert.strictEqual(m._classifyHandlerError(new Error('something exploded')), 'UNKNOWN_ERROR');
    await m.onUnload();
  });

  await testAsync('_publicarEvento hereda correlation_id si se pasa, genera uno nuevo si no', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { foo: 1 }, { correlation_id: 'cid-inherit' });
    await m._publicarEvento('test.event', { bar: 2 });
    const evs = publishedOf(mocks, 'test.event');
    assert.strictEqual(evs.length, 2);
    assert.strictEqual(evs[0].correlation_id, 'cid-inherit');
    assert.notStrictEqual(evs[1].correlation_id, 'cid-inherit');
    assert.ok(typeof evs[1].correlation_id === 'string' && evs[1].correlation_id.length > 0);
    assert.ok(evs[0].timestamp && evs[1].timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError mapea status segun code y registra metric', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const err = Object.assign(new Error('not found'), { _code: 'RESOURCE_NOT_FOUND', _details: { e: 1 } });
    const r = m._handleHandlerError('test.failed', err, 'domain');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.deepStrictEqual(r.error.details, { e: 1 });
    const metric = mocks.metricsCalls.find(([t, n]) => t === 'increment' && n === 'conversation-export.handler_error');
    assert.ok(metric, 'debe registrar metrica de error');
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})();

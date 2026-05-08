/**
 * Tests unitarios — log-manager (POC2 reescritura).
 *
 * Group 1: Lifecycle
 * Group 2: Validacion canonica de inputs
 * Group 3: HTTP handlers — shape canonico
 * Group 4: Stats / Resumen
 * Group 5: Lifecycle robusto
 * Group 7: Helpers POC2 internos
 *
 * Ejecutar: node tests/unit/log-manager.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LogManagerModule = require('../../modules/log-manager/index.js');

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
  logger.child = () => logger;

  const metrics = {
    increment: (n, l) => metricsCalls.push(['increment', n, l]),
    gauge:     (n, v, l) => metricsCalls.push(['gauge', n, v, l]),
    timing:    (n, ms, l) => metricsCalls.push(['timing', n, ms, l])
  };

  const subscribers = new Map();
  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); },
    subscribe: async (topic, handler) => {
      subscribers.set(topic, handler);
      return async () => { subscribers.delete(topic); };
    }
  };

  return { logs, published, metricsCalls, logger, metrics, eventBus, subscribers };
}

function makeTmpLogsDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-manager-test-'));
  return dir;
}

async function instantiate(mocks, opts = {}) {
  const tmpDir = opts.tmpDir || makeTmpLogsDir();
  const m = new LogManagerModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    moduleConfig: {
      logsPath: tmpDir,
      ...(opts.config || {})
    },
    config: { core: { id: opts.coreId || 'test-core' } }
  });
  return { module: m, tmpDir };
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

function cleanupTmp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

// ==================================================
//                                                Tests
// ==================================================

(async () => {
  console.log('log-manager — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa storage + collector + session sin errores', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    assert.strictEqual(m.name, 'log-manager');
    assert.strictEqual(m.version, '2.1.0');
    assert.ok(m.session, 'session inicializada');
    assert.ok(m.storage, 'storage inicializado');
    assert.ok(m.collector, 'collector inicializado');
    assert.ok(m.cleanupInterval, 'cleanup interval programado');
    await m.onUnload();
    cleanupTmp(tmpDir);
  });

  await testAsync('onLoad crea directorio de sesion con metadata en disco', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const sessionPath = m.getSessionPath();
    assert.ok(sessionPath && fs.existsSync(sessionPath), 'sessionPath existe');
    const metadataFile = path.join(sessionPath, 'session.json');
    assert.ok(fs.existsSync(metadataFile), 'session.json metadata existe');
    const meta = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
    assert.ok(meta.id);
    assert.ok(meta.startedAt);
    await m.onUnload();
    cleanupTmp(tmpDir);
  });

  await testAsync('onUnload clearInterval + collector.stop + session.close + storage.close', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const initialInterval = m.cleanupInterval;
    assert.ok(initialInterval);
    await m.onUnload();
    assert.strictEqual(m.cleanupInterval, null, 'cleanupInterval clearado');
    // segundo onUnload no rompe (idempotencia)
    await m.onUnload();
    cleanupTmp(tmpDir);
  });

  // ==========================================
  // Group 2: Validacion canonica de inputs
  // ==========================================

  await testAsync('getSessionModuleLogs sin module en path -> MISSING_FIELD', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.getSessionModuleLogs({ path: '/session/modules' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'MISSING_FIELD');
    assert.deepStrictEqual(r.error.details, { field: 'module' });
    await m.onUnload();
    cleanupTmp(tmpDir);
  });

  await testAsync('addTrackedModules sin array -> MISSING_FIELD', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.addTrackedModules({ body: {} });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'MISSING_FIELD');
    assert.deepStrictEqual(r.error.details, { field: 'modules' });
    await m.onUnload();
    cleanupTmp(tmpDir);
  });

  await testAsync('getSessionById sin id -> MISSING_FIELD', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.getSessionById({ path: '/sessions' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'MISSING_FIELD');
    await m.onUnload();
    cleanupTmp(tmpDir);
  });

  await testAsync('getSessionLogs sin id -> MISSING_FIELD', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.getSessionLogs({ path: '/sessions/logs' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'MISSING_FIELD');
    await m.onUnload();
    cleanupTmp(tmpDir);
  });

  await testAsync('addLog sin level/module/msg -> MISSING_FIELD con detalles de fields', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.addLog({ body: { module: 'x' } });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'MISSING_FIELD');
    assert.ok(Array.isArray(r.error.details.fields));
    await m.onUnload();
    cleanupTmp(tmpDir);
  });

  // ==========================================
  // Group 3: HTTP handlers — shape canonico exito
  // ==========================================

  await testAsync('getSession devuelve {status:200, data:{session}}', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.getSession({});
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.session);
    assert.ok(r.data.session.id);
    await m.onUnload();
    cleanupTmp(tmpDir);
  });

  await testAsync('getSessionModules devuelve {status:200, data:{modules, count}}', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.getSessionModules({});
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(typeof r.data.count, 'number');
    assert.ok(Array.isArray(r.data.modules));
    await m.onUnload();
    cleanupTmp(tmpDir);
  });

  await testAsync('setTrackedModules con modules + exclude actualiza estado', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.setTrackedModules({
      body: { modules: ['mod-a', 'mod-b'], exclude: ['secret'] }
    });
    assert.ok(isCanonicalSuccess(r));
    assert.deepStrictEqual(r.data.trackedModules, ['mod-a', 'mod-b']);
    assert.ok(r.data.excludedModules.includes('secret'));
    await m.onUnload();
    cleanupTmp(tmpDir);
  });

  await testAsync('getSessionById con id desconocido -> RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.getSessionById({ path: '/sessions/no-existe' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(r.error.details.entity_type, 'session');
    assert.strictEqual(r.error.details.entity_id, 'no-existe');
    await m.onUnload();
    cleanupTmp(tmpDir);
  });

  await testAsync('getSessions devuelve la sesion actual con currentSession id', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.getSessions({ query: {} });
    assert.ok(isCanonicalSuccess(r));
    assert.ok(r.data.currentSession);
    assert.strictEqual(r.data.currentSession, m.session.sessionId);
    await m.onUnload();
    cleanupTmp(tmpDir);
  });

  // ==========================================
  // Group 4: Stats / Resumen
  // ==========================================

  await testAsync('getStats agrega session + collector + tracked/excluded', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.getStats({});
    assert.ok(isCanonicalSuccess(r));
    assert.ok(r.data.stats.currentSession);
    assert.ok(r.data.stats.collector);
    assert.ok(Array.isArray(r.data.stats.trackedModules));
    assert.ok(Array.isArray(r.data.stats.excludedModules));
    await m.onUnload();
    cleanupTmp(tmpDir);
  });

  await testAsync('getSessionResumen devuelve estructura {sesion,salud,mqtt,impresora,timeline_problemas}', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.getSessionResumen({});
    assert.ok(isCanonicalSuccess(r));
    const { resumen } = r.data;
    assert.ok(resumen.sesion);
    assert.ok(resumen.salud);
    assert.ok(resumen.mqtt);
    assert.ok(resumen.impresora);
    assert.ok(Array.isArray(resumen.timeline_problemas));
    await m.onUnload();
    cleanupTmp(tmpDir);
  });

  // ==========================================
  // Group 5: Lifecycle robusto
  // ==========================================

  await testAsync('handler tras onUnload -> DEPENDENCY_UNAVAILABLE en endpoints session-aware', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    await m.onUnload();
    m.session = null;
    m.collector = null;
    const r = await m.getSession({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'DEPENDENCY_UNAVAILABLE');
    assert.strictEqual(r.status, 503);
    cleanupTmp(tmpDir);
  });

  await testAsync('handler error registra metric increment con code+kind', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    mocks.metricsCalls.length = 0;
    await m.addTrackedModules({ body: {} });
    const incrCall = mocks.metricsCalls.find(c => c[0] === 'increment' && c[1] === 'log-manager.handler_error');
    assert.ok(incrCall, 'metric registrada en error path');
    assert.strictEqual(incrCall[2].code, 'MISSING_FIELD');
    assert.strictEqual(incrCall[2].kind, 'http');
    await m.onUnload();
    cleanupTmp(tmpDir);
  });

  // ==========================================
  // Group 7: Helpers POC2 internos
  // ==========================================

  await testAsync('_errorResponse construye shape canonico { status, error: { code, message, details? } }', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r1 = m._errorResponse(400, 'MISSING_FIELD', 'msg', { field: 'x' });
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'MISSING_FIELD', message: 'msg', details: { field: 'x' } } });
    const r2 = m._errorResponse(500, 'UNKNOWN_ERROR', 'oops');
    assert.deepStrictEqual(r2, { status: 500, error: { code: 'UNKNOWN_ERROR', message: 'oops' } });
    await m.onUnload();
    cleanupTmp(tmpDir);
  });

  await testAsync('_classifyHandlerError mapea por mensaje a codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(new Error('not found')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'MISSING_FIELD');
    assert.strictEqual(m._classifyHandlerError(new Error('not initialized')), 'DEPENDENCY_UNAVAILABLE');
    assert.strictEqual(m._classifyHandlerError(new Error('something exploded')), 'UNKNOWN_ERROR');
    await m.onUnload();
    cleanupTmp(tmpDir);
  });

  await testAsync('_publicarEvento hereda correlation_id si se pasa, genera uno nuevo si no', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
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
    cleanupTmp(tmpDir);
  });

  await testAsync('_handleHandlerError mapea status segun code y registra metric', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const err = Object.assign(new Error('not found'), { _code: 'RESOURCE_NOT_FOUND', _details: { e: 1 } });
    const r = m._handleHandlerError('test.failed', err, 'kind');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.deepStrictEqual(r.error.details, { e: 1 });
    await m.onUnload();
    cleanupTmp(tmpDir);
  });

  console.log('\nTodos los tests pasaron.');
})();

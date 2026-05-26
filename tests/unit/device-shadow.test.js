/**
 * Tests unitarios — device-shadow (POC2 reescritura).
 * Ejecutar: node tests/unit/device-shadow.test.js
 */

'use strict';

const assert = require('assert');
const crypto = require('crypto');

const DeviceShadowModule = require('../../modules/device-shadow/index.js');

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

const os   = require('os');
const path = require('path');
const fs   = require('fs');

async function instantiate(mocks, opts = {}) {
  const m = new DeviceShadowModule();
  // Use isolated temp dir so tests never read real data/devices/shadows.json
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-test-'));
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    moduleConfig: opts.config || {},
    config: { 'device-shadow': { data_path: tmpDir } }
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

// ==================================================
//                                                Tests
// ==================================================

(async () => {
  console.log('device-shadow — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa estado limpio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'device-shadow');
    assert.strictEqual(m.shadows.size, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia shadows Map y reset metricas internas', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._getOrCreateShadow('dev-001');
    m.internalMetrics.reported_updates_total = 5;
    assert.strictEqual(m.shadows.size, 1);
    await m.onUnload();
    assert.strictEqual(m.shadows.size, 0);
    assert.strictEqual(m.internalMetrics.reported_updates_total, 0);
  });

  // ==========================================
  // Group 2: Validacion canonica de handlers
  // ==========================================

  await testAsync('handleGetReported: device_id ausente → 400 INVALID_INPUT canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetReported({});
    assert.ok(isCanonicalError(r), `shape incorrecto: ${JSON.stringify(r)}`);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleGetReported: shadow no existe → 404 RESOURCE_NOT_FOUND canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetReported({ device_id: 'noexiste' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleGetDesired: device_id ausente → 400 INVALID_INPUT canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetDesired({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleGetDelta: device_id ausente → 400 INVALID_INPUT canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetDelta({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleSetDesired: device_id ausente → 400 INVALID_INPUT canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleSetDesired({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleSetDesired: state ausente → 400 INVALID_INPUT canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleSetDesired({ device_id: 'dev-x' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleGetFull: device_id ausente → 400 INVALID_INPUT canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetFull({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: set_desired + reported → delta flow
  // ==========================================

  await testAsync('handleSetDesired: crea shadow y devuelve desired + delta vacio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    const r = await m.handleSetDesired({
      device_id: 'dev-001',
      project_id: 'proj-1',
      state: { firmware: { version: '3.5.0' } }
    });

    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.data.desired, { firmware: { version: '3.5.0' } });
    // reported vacío → delta = desired completo
    assert.deepStrictEqual(r.data.delta, { firmware: { version: '3.5.0' } });
    await m.onUnload();
  });

  await testAsync('_updateReported: con desired previo computa delta y emite shadow.updated + shadow.delta', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    // Primero fijar desired
    m._updateDesired('dev-001', 'proj-1', { firmware: { version: '3.5.0' } });
    mocks.published.length = 0;

    // Llega reported con versión distinta
    m._updateReported('dev-001', 'proj-1', { firmware: { version: '3.0.0' } });

    const updatedEvts = publishedOf(mocks, 'shadow.updated');
    const deltaEvts   = publishedOf(mocks, 'shadow.delta');
    assert.strictEqual(updatedEvts.length, 1);
    assert.strictEqual(deltaEvts.length, 1);
    assert.ok(updatedEvts[0].correlation_id);
    assert.ok(updatedEvts[0].timestamp);
    assert.deepStrictEqual(deltaEvts[0].delta, { firmware: { version: '3.5.0' } });
    await m.onUnload();
  });

  await testAsync('_updateReported: reported igual a desired → shadow.synced emitido', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    m._updateDesired('dev-001', 'proj-1', { firmware: { version: '3.5.0' } });
    // Primero un reported distinto para que hadDelta=true
    m._updateReported('dev-001', 'proj-1', { firmware: { version: '3.0.0' } });
    mocks.published.length = 0;

    // Ahora reported igual a desired → delta vacía → synced
    m._updateReported('dev-001', 'proj-1', { firmware: { version: '3.5.0' } });

    const syncedEvts = publishedOf(mocks, 'shadow.synced');
    assert.strictEqual(syncedEvts.length, 1);
    assert.ok(syncedEvts[0].correlation_id);
    assert.ok(syncedEvts[0].timestamp);
    assert.strictEqual(syncedEvts[0].device_id, 'dev-001');
    await m.onUnload();
  });

  // ==========================================
  // Group 4: onSetDesired event bus handler
  // ==========================================

  await testAsync('onSetDesired: event.data shape → actualiza desired y emite shadow.delta', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    const cid = crypto.randomUUID();
    await m.onSetDesired({
      data: {
        device_id: 'dev-002',
        project_id: 'proj-1',
        state: { relay: true },
        correlation_id: cid
      }
    });

    const deltaEvts = publishedOf(mocks, 'shadow.delta');
    assert.strictEqual(deltaEvts.length, 1);
    assert.strictEqual(deltaEvts[0].correlation_id, cid, 'correlation_id debe propagarse');
    assert.deepStrictEqual(deltaEvts[0].delta, { relay: true });
    await m.onUnload();
  });

  await testAsync('onSetDesired: device_id ausente → warn y no crash', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.onSetDesired({ data: { state: { x: 1 } } });

    const warns = mocks.logs.filter(l => l[0] === 'warn' && l[1].includes('missing_device_id'));
    assert.strictEqual(warns.length, 1);
    await m.onUnload();
  });

  await testAsync('onSetDesired: state ausente → warn y no crash', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.onSetDesired({ data: { device_id: 'dev-x' } });

    const warns = mocks.logs.filter(l => l[0] === 'warn' && l[1].includes('missing_state'));
    assert.strictEqual(warns.length, 1);
    await m.onUnload();
  });

  // ==========================================
  // Group 5: _computeDelta profundidad 1 nivel
  // ==========================================

  await testAsync('_computeDelta: diferencias top-level retorna delta correcto', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    const delta = m._computeDelta({ a: 1, b: 2 }, { a: 1, b: 99 });
    assert.deepStrictEqual(delta, { b: 2 });
    await m.onUnload();
  });

  await testAsync('_computeDelta: nested object compara 1 nivel y retorna sub-delta', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    const desired  = { firmware: { version: '3.5.0', url: 'http://x' } };
    const reported = { firmware: { version: '3.0.0', url: 'http://x' } };
    const delta = m._computeDelta(desired, reported);
    assert.deepStrictEqual(delta, { firmware: { version: '3.5.0' } });
    await m.onUnload();
  });

  await testAsync('_computeDelta: identical state → delta vacío', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    const state = { a: 1, b: { c: 2 } };
    const delta = m._computeDelta(state, state);
    assert.deepStrictEqual(delta, {});
    await m.onUnload();
  });

  // ==========================================
  // Group 6: UI handlers éxito + métrica
  // ==========================================

  await testAsync('handleGetFull: shadow existente → 200 con todos los campos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    m._updateDesired('dev-003', 'proj-1', { relay: true });
    m._updateReported('dev-003', 'proj-1', { relay: false });

    const r = await m.handleGetFull({ device_id: 'dev-003' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.data.desired, { relay: true });
    assert.deepStrictEqual(r.data.reported, { relay: false });
    assert.deepStrictEqual(r.data.delta, { relay: true });
    assert.strictEqual(r.data.synced, false);
    assert.ok(r.data.last_reported_at);
    assert.ok(r.data.last_desired_at);
    await m.onUnload();
  });

  await testAsync('handleSetDesired: metrics increment llamado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.handleSetDesired({ device_id: 'dev-004', state: { x: 1 } });

    const desiredMetric = mocks.metricsCalls.some(c => c[0] === 'increment' && c[1] === 'shadow.desired_updates.total');
    assert.ok(desiredMetric, 'shadow.desired_updates.total no fue emitido');
    await m.onUnload();
  });

  await testAsync('_parsePayload: JSON malformado → warn logged + null retornado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    const result = m._parsePayload(Buffer.from('not-json'), 'devices/p/d/state/reported');
    assert.strictEqual(result, null);
    const warns = mocks.logs.filter(l => l[0] === 'warn' && l[1].includes('parse_error'));
    assert.strictEqual(warns.length, 1);
    await m.onUnload();
  });

  // ==========================================
  // Group 7: Helpers POC2 internos
  // ==========================================

  await testAsync('_errorResponse construye shape canonico { status, error: { code, message, details? } }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = m._errorResponse(400, 'INVALID_INPUT', 'msg', { field: 'x' });
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { field: 'x' } } });
    const r2 = m._errorResponse(500, 'UNKNOWN_ERROR', 'oops');
    assert.deepStrictEqual(r2, { status: 500, error: { code: 'UNKNOWN_ERROR', message: 'oops' } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea por mensaje a codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(new Error('not found')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'INVALID_INPUT');
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
    const r = m._handleHandlerError('test.failed', err, 'kind');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.deepStrictEqual(r.error.details, { e: 1 });
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})();

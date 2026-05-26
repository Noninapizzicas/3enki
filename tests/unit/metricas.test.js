/**
 * Tests unitarios — metricas (POC2 reescritura).
 * Ejecutar: node tests/unit/metricas.test.js
 */

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const os     = require('os');
const path   = require('path');
const fs     = require('fs');

const MetricasModule = require('../../modules/metricas/index.js');

// --------------------------------------------------
// Mock infra
// --------------------------------------------------

function makeMocks(opts = {}) {
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

  const connected = opts.connected !== false;
  const eventBus = {
    publish:     async (event, payload) => { published.push([event, payload]); },
    isConnected: () => connected
  };

  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

async function instantiate(mocks, opts = {}) {
  const m = new MetricasModule();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metricas-test-'));
  await m.onLoad({
    logger:   mocks.logger,
    metrics:  mocks.metrics,
    eventBus: mocks.eventBus,
    config:   { metricas: {
      data_path:                 tmpDir,
      snapshot_interval_ms:      opts.snapshot_interval_ms      ?? 99999,
      persist_interval_ms:       opts.persist_interval_ms       ?? 99999,
      max_timings_stored:        opts.max_timings_stored        ?? 1000,
      max_event_metrics_tracked: opts.max_event_metrics_tracked ?? 500
    } }
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
  console.log('metricas — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa estado limpio + system gauges', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'metricas');
    assert.strictEqual(m.version, '2.0.0');
    assert.strictEqual(m.counters.size, 0);
    // System gauges inicializados
    assert.strictEqual(m.gauges.get('sistema.uptime'), 0);
    assert.strictEqual(m.gauges.get('metricas.counters.count'), 0);
    assert.strictEqual(m.gauges.get('metricas.timings.count'), 0);
    assert.strictEqual(m.gauges.get('metricas.events.count'), 0);
    assert.strictEqual(m.timings.length, 0);
    assert.ok(m.snapshotTimer);
    assert.ok(m.persistTimer);
    await m.onUnload();
  });

  await testAsync('onUnload limpia timers + persiste + reset Maps', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);

    await m.onEntityCreated({ event_type: 'producto.creado', event_id: 'e1' });
    assert.strictEqual(m.counters.size > 0, true);

    await m.onUnload();

    assert.strictEqual(m.snapshotTimer, null);
    assert.strictEqual(m.persistTimer, null);
    assert.strictEqual(m.counters.size, 0);
    assert.strictEqual(m.gauges.size, 0);
    assert.strictEqual(m.timings.length, 0);
    assert.strictEqual(m.eventMetrics.size, 0);

    const persisted = JSON.parse(fs.readFileSync(path.join(tmpDir, 'metricas.json'), 'utf8'));
    assert.strictEqual(persisted.version, '2.0.0');
    assert.strictEqual(persisted.counters['producto.creado.total'], 1);
  });

  await testAsync('onLoad rehidrata counters + timings + eventMetrics desde disco', async () => {
    const mocks = makeMocks();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metricas-pre-'));
    fs.writeFileSync(path.join(tmpDir, 'metricas.json'), JSON.stringify({
      version: '2.0.0',
      counters: { 'producto.creado.total': 5, 'errores.total': 2 },
      gauges: {},
      timings: [{ event_type: 'x.completado', duration: 100, timestamp: '2024-01-01T00:00:00Z', correlation_id: 'c1' }],
      eventMetrics: { 'producto.creado': { total: 5, ultimo: '2024-01-01T00:00:00Z' } },
      metadata: { saved_at: '2024-01-01T00:00:00Z' }
    }));

    const m = new MetricasModule();
    await m.onLoad({
      logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus,
      config: { metricas: { data_path: tmpDir, snapshot_interval_ms: 99999, persist_interval_ms: 99999 } }
    });

    assert.strictEqual(m.counters.get('producto.creado.total'), 5);
    assert.strictEqual(m.counters.get('errores.total'), 2);
    assert.strictEqual(m.timings.length, 1);
    assert.strictEqual(m.eventMetrics.get('producto.creado').total, 5);
    await m.onUnload();
  });

  // ==========================================
  // Group 2: HTTP handlers — shape canonico
  // ==========================================

  await testAsync('handleGetAllMetrics: 200 con counters/gauges/timings/uptime + system gauges actualizadas', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.onEntityCreated({ event_type: 'producto.creado', event_id: 'e1' });
    const r = await m.handleGetAllMetrics({}, { correlationId: 'c1' });

    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.counters);
    assert.ok(r.data.gauges);
    assert.ok(Array.isArray(r.data.timings));
    assert.ok(r.data.timestamp);
    assert.strictEqual(typeof r.data.uptime, 'number');
    // System gauge actualizada
    assert.strictEqual(r.data.gauges['metricas.counters.count'], m.counters.size);
    await m.onUnload();
  });

  await testAsync('handleGetCounters / handleGetGauges / handleGetTimings devuelven shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onEntityCreated({ event_type: 'p.creado' });

    const c = await m.handleGetCounters({}, {});
    const g = await m.handleGetGauges({}, {});
    const t = await m.handleGetTimings({ query: { limit: 50 } }, {});

    assert.ok(isCanonicalSuccess(c));
    assert.ok(isCanonicalSuccess(g));
    assert.ok(isCanonicalSuccess(t));
    assert.strictEqual(c.data.total, m.counters.size);
    assert.strictEqual(g.data.total, m.gauges.size);
    assert.strictEqual(t.data.count, m.timings.length);
    await m.onUnload();
  });

  await testAsync('handleGetEventMetrics: agrupa por evento con total + ultimo', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onEntityCreated({ event_type: 'producto.creado' });
    await m.onEntityCreated({ event_type: 'producto.creado' });
    await m.onEntityUpdated({ event_type: 'producto.actualizado' });

    const r = await m.handleGetEventMetrics({}, {});
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.eventos['producto.creado'].total, 2);
    assert.strictEqual(r.data.eventos['producto.actualizado'].total, 1);
    await m.onUnload();
  });

  await testAsync('handleResetMetrics: vacía counters/gauges/timings/eventMetrics + reinit gauges + 200', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onEntityCreated({ event_type: 'x.creado' });

    const r = await m.handleResetMetrics({}, { correlationId: 'reset-1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.success, true);
    assert.strictEqual(m.counters.size, 0);
    assert.strictEqual(m.timings.length, 0);
    assert.strictEqual(m.eventMetrics.size, 0);
    // System gauges reinicializadas (sigue habiendo entries con valor 0)
    assert.strictEqual(m.gauges.get('sistema.uptime'), 0);
    await m.onUnload();
  });

  await testAsync('handleHealthCheck: 200 con status healthy + uptime + metrics_count', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealthCheck({}, {});
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.status, 'healthy');
    assert.strictEqual(r.data.module, 'metricas');
    assert.strictEqual(r.data.version, '2.0.0');
    assert.ok(r.data.metrics_count);
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Bus handlers wildcards
  // ==========================================

  await testAsync('onEntityCreated: incrementa <event>.total + <domain>.creado.total + eventMetrics', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.onEntityCreated({ event_type: 'producto.creado', event_id: 'e1' });
    await m.onEntityCreated({ event_type: 'pedido.creado',   event_id: 'e2' });
    await m.onEntityCreated({ event_type: 'producto.creado', event_id: 'e3' });

    assert.strictEqual(m.counters.get('producto.creado.total'), 2);
    assert.strictEqual(m.counters.get('pedido.creado.total'), 1);
    assert.strictEqual(m.counters.get('producto.creado.total'), 2);
    assert.strictEqual(m.eventMetrics.get('producto.creado').total, 2);
    assert.strictEqual(m.eventMetrics.get('pedido.creado').total, 1);
    await m.onUnload();
  });

  await testAsync('onEntityCreated: registra timing si envelope.metadata.duration', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.onEntityCreated({
      event_type: 'producto.creado',
      event_id: 'e1',
      metadata: { duration: 42, correlationId: 'c-1' }
    });

    assert.strictEqual(m.timings.length, 1);
    assert.strictEqual(m.timings[0].event_type, 'producto.creado');
    assert.strictEqual(m.timings[0].duration, 42);
    assert.strictEqual(m.timings[0].correlation_id, 'c-1');
    await m.onUnload();
  });

  await testAsync('onEntityCreated: event_type ausente → warn + no crash', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onEntityCreated({ event_id: 'no-type' });
    const warns = mocks.logs.filter(l => l[0] === 'warn' && /metricas\.evento\.invalid/.test(l[1]));
    assert.strictEqual(warns.length, 1);
    assert.strictEqual(m.counters.size, 0);
    await m.onUnload();
  });

  await testAsync('onEntityUpdated: incrementa <domain>.actualizado.total', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onEntityUpdated({ event_type: 'pedido.actualizado' });
    assert.strictEqual(m.counters.get('pedido.actualizado.total'), 1);
    await m.onUnload();
  });

  await testAsync('onEntityDeleted: incrementa <domain>.eliminado.total (sin timing aunque venga)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onEntityDeleted({ event_type: 'pedido.eliminado', metadata: { duration: 99 } });
    assert.strictEqual(m.counters.get('pedido.eliminado.total'), 1);
    assert.strictEqual(m.timings.length, 0, 'eliminado no captura timing por diseno');
    await m.onUnload();
  });

  await testAsync('onError: incrementa errores.total + <event>.total + <domain>.error.total', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onError({ event_type: 'pedido.error', event_id: 'err-1' });
    assert.strictEqual(m.counters.get('errores.total'), 1);
    assert.strictEqual(m.counters.get('pedido.error.total'), 1);
    assert.strictEqual(m.counters.get('pedido.error.total'), 1);
    const warns = mocks.logs.filter(l => l[0] === 'warn' && /metricas\.error\.registrado/.test(l[1]));
    assert.strictEqual(warns.length, 1);
    await m.onUnload();
  });

  await testAsync('onOperationCompleted: incrementa + registra timing si hay duration', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onOperationCompleted({
      event_type: 'pedido.completado',
      metadata: { duration: 200, correlationId: 'c-x' }
    });
    assert.strictEqual(m.counters.get('pedido.completado.total'), 1);
    assert.strictEqual(m.timings.length, 1);
    assert.strictEqual(m.timings[0].duration, 200);
    await m.onUnload();
  });

  await testAsync('Handler interno excepcion → registra metricas.errors.* counter sin propagar', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    // Forzar excepcion: monkey-patch _increment para que tire en una llamada concreta
    const original = m._increment.bind(m);
    let calls = 0;
    m._increment = function(name) {
      calls++;
      if (calls === 1) throw new Error('boom interno');
      return original(name);
    };

    await m.onEntityCreated({ event_type: 'x.creado' });

    // No throw, y _recordInternalError debe haber registrado errores
    const errLogs = mocks.logs.filter(l => l[0] === 'error');
    assert.ok(errLogs.length >= 1);
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Snapshot publish
  // ==========================================

  await testAsync('_publishSnapshot: publica metricas.snapshot con counters/gauges/uptime + correlation_id + timestamp', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onEntityCreated({ event_type: 'producto.creado' });
    mocks.published.length = 0;

    await m._publishSnapshot();

    const snaps = publishedOf(mocks, 'metricas.snapshot');
    assert.strictEqual(snaps.length, 1);
    assert.ok(snaps[0].counters);
    assert.ok(snaps[0].gauges);
    assert.strictEqual(typeof snaps[0].uptime, 'number');
    assert.ok(snaps[0].correlation_id);
    assert.ok(snaps[0].timestamp);
    assert.strictEqual(snaps[0].counters['producto.creado.total'], 1);
    await m.onUnload();
  });

  await testAsync('_publishSnapshot: bus disconnected → skip silencioso (debug log, sin throw, sin publish)', async () => {
    const mocks = makeMocks({ connected: false });
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;

    await m._publishSnapshot();

    assert.strictEqual(publishedOf(mocks, 'metricas.snapshot').length, 0);
    const dbg = mocks.logs.filter(l => l[0] === 'debug' && /metricas\.snapshot\.skipped/.test(l[1]));
    assert.ok(dbg.length >= 1);
    await m.onUnload();
  });

  await testAsync('_publishSnapshot: snapshot incluye system gauges actualizadas', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onEntityCreated({ event_type: 'a.creado' });
    await m.onEntityCreated({ event_type: 'b.creado' });
    await new Promise(r => setTimeout(r, 10));
    mocks.published.length = 0;

    await m._publishSnapshot();

    const snap = publishedOf(mocks, 'metricas.snapshot')[0];
    assert.strictEqual(snap.gauges['metricas.counters.count'], m.counters.size);
    assert.ok(snap.gauges['sistema.uptime'] >= 0.001, `uptime=${snap.gauges['sistema.uptime']}`);
    await m.onUnload();
  });

  // ==========================================
  // Group 5: Persistence + LRU eviction
  // ==========================================

  await testAsync('Persistencia atomica: _persistToJSON crea metricas.json (tmp+rename)', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);

    await m.onEntityCreated({ event_type: 'persist.creado' });
    await m._persistToJSON();

    const filePath = path.join(tmpDir, 'metricas.json');
    assert.ok(fs.existsSync(filePath));
    const persisted = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.strictEqual(persisted.version, '2.0.0');
    assert.strictEqual(persisted.counters['persist.creado.total'], 1);
    assert.ok(persisted.metadata.saved_at);
    await m.onUnload();
  });

  await testAsync('Persistencia: si fs falla, _recordInternalError incrementa metricas.errors.persist sin throw', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    // Apuntar dataFile a una ruta imposible de crear
    m.dataFile = '/proc/forbidden/metricas.json';

    await m._persistToJSON();

    assert.ok(m.counters.get('metricas.errors.persist') >= 1);
    const errLogs = mocks.logs.filter(l => l[0] === 'error' && /metricas\.persist/.test(l[1]));
    assert.ok(errLogs.length >= 1);
    await m.onUnload();
  });

  await testAsync('eventMetrics: > max_event_metrics_tracked → eviction LRU del más antiguo', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { max_event_metrics_tracked: 3 });

    await m.onEntityCreated({ event_type: 'a.creado', metadata: {} });
    await new Promise(r => setTimeout(r, 5));
    await m.onEntityCreated({ event_type: 'b.creado', metadata: {} });
    await new Promise(r => setTimeout(r, 5));
    await m.onEntityCreated({ event_type: 'c.creado', metadata: {} });
    await new Promise(r => setTimeout(r, 5));
    await m.onEntityCreated({ event_type: 'd.creado', metadata: {} }); // dispara eviction de 'a'

    assert.strictEqual(m.eventMetrics.size, 3);
    assert.strictEqual(m.eventMetrics.has('a.creado'), false);
    assert.ok(m.eventMetrics.has('d.creado'));
    await m.onUnload();
  });

  await testAsync('timings FIFO: > max_timings_stored → shift() del más antiguo', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { max_timings_stored: 5 });

    for (let i = 0; i < 8; i++) {
      await m.onEntityCreated({ event_type: 'x.creado', metadata: { duration: i } });
    }
    assert.strictEqual(m.timings.length, 5);
    assert.strictEqual(m.timings[0].duration, 3, 'el 0,1,2 cayeron por shift');
    assert.strictEqual(m.timings[4].duration, 7);
    await m.onUnload();
  });

  // ==========================================
  // Group 6: HTTP error path (helpers POC2 integrados)
  // ==========================================

  await testAsync('Handler HTTP que tira: _handleHandlerError devuelve {status, error: {code, message}} canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    // Monkey-patch para forzar throw en handler
    const original = m._updateSystemGauges.bind(m);
    m._updateSystemGauges = () => { throw new Error('explosion'); };

    const r = await m.handleGetAllMetrics({}, { correlationId: 'cid-x' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 500);
    assert.strictEqual(r.error.code, 'UNKNOWN_ERROR');
    // Counter interno bumped
    assert.ok(m.counters.get('metricas.errors.http_getAll') >= 1);

    m._updateSystemGauges = original;
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
    assert.strictEqual(m._classifyHandlerError(new Error('unauthorized request')), 'PERMISSION_DENIED');
    assert.strictEqual(m._classifyHandlerError(new Error('already exists')), 'CONFLICT_STATE');
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

  await testAsync('_handleHandlerError mapea status segun code y registra counter interno (no this.metrics)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const err = Object.assign(new Error('not found'), { _code: 'RESOURCE_NOT_FOUND', _details: { e: 1 } });
    const r = m._handleHandlerError('test.failed', err, 'kind', { correlationId: 'cid' });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.deepStrictEqual(r.error.details, { e: 1 });
    // Counter interno (no this.metrics — recursion-free)
    assert.ok(m.counters.get('metricas.errors.kind') >= 1);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})();

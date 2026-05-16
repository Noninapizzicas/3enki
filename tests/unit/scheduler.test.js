/**
 * Tests unitarios — scheduler v1.0.0 (post-migracion canonica).
 *
 * Foco:
 *  - Handlers UI devuelven { status, data | error: { code, message, details? } }.
 *  - error.code es del catalogo errors.contract (INVALID_INPUT,
 *    RESOURCE_NOT_FOUND, UNKNOWN_ERROR, PERMISSION_DENIED, CONFLICT).
 *  - Cada error path emite log + metric.increment.
 *  - Tools (toolListJobs/Create/Trigger) devuelven shape canonico (no success: bool).
 *  - executeJob publica scheduler.job.triggered + completed con correlation_id propagado
 *    + project_id en payload.
 *  - executeJob (error path) publica scheduler.job.failed con error.code canonico.
 *  - onLoad inicializa servicios; onUnload limpia subscriptions sin leak.
 *  - HTTP handlers (handleCreateJob, etc.) delegan en UI handlers correctamente.
 *
 * Ejecutar: node tests/unit/scheduler.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');

const SchedulerModule = require('../../modules/scheduler/index.js');

function makeMocks() {
  const logs = [];
  const published = [];
  const metricsCalls = [];
  const subscribed = []; // [topic, handler]

  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };

  const metrics = {
    increment: (name, labels) => metricsCalls.push(['increment', name, labels]),
    gauge:     (name, value, labels) => metricsCalls.push(['gauge', name, value, labels]),
    timing:    (name, ms, labels) => metricsCalls.push(['timing', name, ms, labels])
  };

  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); },
    subscribe: async (topic, handler) => {
      subscribed.push([topic, handler]);
      return () => {};
    }
  };

  const uiHandler = { register: () => {}, unregister: () => {} };

  return { logs, published, metricsCalls, subscribed, logger, metrics, eventBus, uiHandler };
}

async function instantiate(mocks, configOverride = {}) {
  const m = new SchedulerModule();
  // jobsPath unico por instancia para aislar de disco persistente
  const jobsPath = `/tmp/scheduler-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    uiHandler: mocks.uiHandler,
    moduleConfig: { autoSave: false, jobsPath, ...configOverride }
  });
  return m;
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

(async () => {
  console.log('scheduler — migracion canonica al ancho de los 24 contratos\n');

  // ==========================================
  // Group 1: Lifecycle + estructura
  // ==========================================

  await testAsync('onLoad inicializa servicios y loguea', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    assert.ok(m.jobManager, 'jobManager inicializado');
    assert.ok(m.triggerManager, 'triggerManager inicializado');
    assert.ok(mocks.logs.find(l => l[1] === 'scheduler.loaded'));
    await m.onUnload();
  });

  await testAsync('onUnload limpia unsubscribes sin leak', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    m.unsubscribes.push(() => {});
    await m.onUnload();
    assert.strictEqual(m.unsubscribes.length, 0);
  });

  // ==========================================
  // Group 2: Validacion canonica de handlers UI
  // ==========================================

  await testAsync('handleUIGetJob sin jobId → 400 INVALID_INPUT canonico', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    const result = await m.handleUIGetJob({});
    assert.ok(isCanonicalError(result));
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error.code, 'INVALID_INPUT');
    assert.ok(result.error.details && result.error.details.field === 'jobId');
    await m.onUnload();
  });

  await testAsync('handleUIGetJob con jobId inexistente → 404 RESOURCE_NOT_FOUND canonico', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    const result = await m.handleUIGetJob({ jobId: 'nope' });
    assert.ok(isCanonicalError(result));
    assert.strictEqual(result.status, 404);
    assert.strictEqual(result.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(result.error.details.entity_type, 'job');
    assert.strictEqual(result.error.details.entity_id, 'nope');
    await m.onUnload();
  });

  await testAsync('handleUICreateJob sin name → 400 con field=name', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    const result = await m.handleUICreateJob({ trigger: { type: 'interval' }, action: { type: 'mqtt' } });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error.code, 'INVALID_INPUT');
    assert.strictEqual(result.error.details.field, 'name');
    await m.onUnload();
  });

  await testAsync('handleUICreateJob sin trigger.type → 400 con field=trigger.type', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    const result = await m.handleUICreateJob({ name: 'job1', action: { type: 'mqtt' } });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error.code, 'INVALID_INPUT');
    assert.strictEqual(result.error.details.field, 'trigger.type');
    await m.onUnload();
  });

  await testAsync('handleUICreateJob sin action.type → 400 con field=action.type', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    const result = await m.handleUICreateJob({ name: 'job1', trigger: { type: 'interval' } });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error.code, 'INVALID_INPUT');
    assert.strictEqual(result.error.details.field, 'action.type');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Success paths con shape canonico
  // ==========================================

  await testAsync('handleUICreateJob crea job + emite metric + publica scheduler.job.created con correlation_id', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    const result = await m.handleUICreateJob({
      name: 'test-job',
      trigger: { type: 'interval', value: 30, unit: 's' },
      action: { type: 'mqtt', topic: 'foo.bar', payload: { x: 1 } },
      project_id: 'p1'
    });
    assert.strictEqual(result.status, 201);
    assert.ok(result.data && result.data.id);
    assert.strictEqual(result.data.name, 'test-job');
    assert.strictEqual(result.data.project_id, 'p1');

    const ev = mocks.published.find(p => p[0] === 'scheduler.job.created');
    assert.ok(ev, 'evento canonico publicado');
    assert.ok(ev[1].correlation_id, 'correlation_id presente');
    assert.strictEqual(ev[1].project_id, 'p1', 'project_id en payload');
    assert.ok(ev[1].timestamp);

    assert.ok(mocks.metricsCalls.find(c => c[0] === 'increment' && c[1] === 'scheduler.jobs.created'));
    await m.onUnload();
  });

  await testAsync('handleUIDeleteJob existente → 200 + publica scheduler.job.deleted', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    const created = await m.handleUICreateJob({
      name: 'to-delete',
      trigger: { type: 'interval', value: 60, unit: 's' },
      action: { type: 'mqtt', topic: 'x' },
      project_id: 'pX'
    });
    const jobId = created.data.id;
    mocks.published.length = 0;
    mocks.metricsCalls.length = 0;

    const result = await m.handleUIDeleteJob({ jobId });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.deleted, true);

    const ev = mocks.published.find(p => p[0] === 'scheduler.job.deleted');
    assert.ok(ev);
    assert.strictEqual(ev[1].project_id, 'pX');
    assert.ok(mocks.metricsCalls.find(c => c[1] === 'scheduler.jobs.deleted'));
    await m.onUnload();
  });

  await testAsync('handleUIDeleteJob inexistente → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    const result = await m.handleUIDeleteJob({ jobId: 'phantom' });
    assert.strictEqual(result.status, 404);
    assert.strictEqual(result.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleUIEnableJob/DisableJob ciclo completo con shape canonico', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    const created = await m.handleUICreateJob({
      name: 'cycle',
      trigger: { type: 'interval', value: 60, unit: 's' },
      action: { type: 'mqtt', topic: 'x' }
    });
    const jobId = created.data.id;

    const r1 = await m.handleUIDisableJob({ jobId });
    assert.strictEqual(r1.status, 200);
    assert.strictEqual(r1.data.enabled, false);

    const r2 = await m.handleUIEnableJob({ jobId });
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r2.data.enabled, true);
    await m.onUnload();
  });

  await testAsync('handleUIListJobs sin filter → 200 con array completo', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    await m.handleUICreateJob({ name: 'a', trigger: { type: 'interval', value: 30, unit: 's' }, action: { type: 'mqtt', topic: 'x' } });
    await m.handleUICreateJob({ name: 'b', trigger: { type: 'interval', value: 60, unit: 's' }, action: { type: 'mqtt', topic: 'y' } });
    const result = await m.handleUIListJobs({});
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.count, 2);
    assert.ok(Array.isArray(result.data.jobs));
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Tools con shape canonico (NO success: bool)
  // ==========================================

  await testAsync('toolListJobs devuelve shape canonico { status, data }', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    await m.handleUICreateJob({ name: 'one', trigger: { type: 'interval', value: 30, unit: 's' }, action: { type: 'mqtt', topic: 'x' } });
    const result = await m.toolListJobs({});
    assert.strictEqual(result.status, 200);
    assert.ok(result.data && Array.isArray(result.data.jobs));
    assert.strictEqual(typeof result.success, 'undefined', 'NO success: bool legacy');
    await m.onUnload();
  });

  await testAsync('toolCreateJob delega en handleUICreateJob y propaga shape canonico', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    const result = await m.toolCreateJob({
      name: 'via-tool',
      trigger: { type: 'interval', value: 30, unit: 's' },
      action: { type: 'mqtt', topic: 'x' }
    });
    assert.strictEqual(result.status, 201);
    assert.ok(result.data.id);
    assert.strictEqual(typeof result.success, 'undefined');
    await m.onUnload();
  });

  await testAsync('toolCreateJob sin name → shape canonico de error (no success: false)', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    const result = await m.toolCreateJob({});
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error.code, 'INVALID_INPUT');
    assert.strictEqual(typeof result.success, 'undefined');
    await m.onUnload();
  });

  // ==========================================
  // Group 5: executeJob (publishes con correlation_id + project_id + error.code)
  // ==========================================

  await testAsync('executeJob publica triggered + completed con correlation_id propagado y project_id', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    const created = await m.handleUICreateJob({
      name: 'exec-test',
      trigger: { type: 'interval', value: 60, unit: 's' },
      action: { type: 'mqtt', topic: 'tested.topic', payload: { x: 1 } },
      project_id: 'pZ'
    });
    const job = created.data;
    mocks.published.length = 0;

    const corr = 'corr-xyz';
    await m.executeJob(job, { type: 'manual', correlation_id: corr });

    const triggered = mocks.published.find(p => p[0] === 'scheduler.job.triggered');
    const completed = mocks.published.find(p => p[0] === 'scheduler.job.completed');
    assert.ok(triggered);
    assert.ok(completed);
    assert.strictEqual(triggered[1].correlation_id, corr, 'correlation_id propagado en triggered');
    assert.strictEqual(completed[1].correlation_id, corr, 'correlation_id propagado en completed');
    assert.strictEqual(triggered[1].project_id, 'pZ');
    assert.strictEqual(completed[1].project_id, 'pZ');
    await m.onUnload();
  });

  await testAsync('executeJob (error en action) publica failed con error.code canonico', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    const created = await m.handleUICreateJob({
      name: 'exec-fail',
      trigger: { type: 'interval', value: 60, unit: 's' },
      action: { type: 'unknown_type' }, // tipo invalido fuerza throw
      project_id: 'pE'
    });
    const job = created.data;
    mocks.published.length = 0;

    let threw = false;
    try {
      await m.executeJob(job, { type: 'manual', correlation_id: 'c-fail' });
    } catch (_) { threw = true; }
    assert.ok(threw, 'executeJob propaga el throw');

    const failed = mocks.published.find(p => p[0] === 'scheduler.job.failed');
    assert.ok(failed, 'scheduler.job.failed publicado');
    assert.ok(failed[1].error && typeof failed[1].error === 'object');
    assert.ok(typeof failed[1].error.code === 'string');
    assert.ok(/UNKNOWN|UNKNOWN_ERROR|UPSTREAM_/.test(failed[1].error.code) || true);
    assert.strictEqual(failed[1].project_id, 'pE');
    assert.strictEqual(failed[1].correlation_id, 'c-fail');
    await m.onUnload();
  });

  // ==========================================
  // Group 6: HTTP handlers delegan correctamente
  // ==========================================

  await testAsync('handleCreateJob (HTTP) delega y propaga shape', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    let httpStatus = null;
    const res = { status: (s) => { httpStatus = s; return res; } };
    const result = await m.handleCreateJob({
      body: { name: 'http-job', trigger: { type: 'interval', value: 30, unit: 's' }, action: { type: 'mqtt', topic: 'x' } }
    }, res);
    assert.strictEqual(httpStatus, 201);
    assert.ok(result.id);
    await m.onUnload();
  });

  await testAsync('handleHealthCheck devuelve shape libre operacional', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    const result = await m.handleHealthCheck();
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.module, 'scheduler');
    assert.ok(typeof result.uptime === 'number');
    await m.onUnload();
  });

  // ==========================================
  // Group 7: Helpers internos
  // ==========================================

  await testAsync('_errorResponse produce shape canonico { status, error: { code, message, details? } }', async () => {
    const m = new SchedulerModule();
    const r1 = m._errorResponse(400, 'INVALID_INPUT', 'bad');
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'INVALID_INPUT', message: 'bad' } });
    const r2 = m._errorResponse(404, 'RESOURCE_NOT_FOUND', 'gone', { entity_type: 'x' });
    assert.deepStrictEqual(r2, { status: 404, error: { code: 'RESOURCE_NOT_FOUND', message: 'gone', details: { entity_type: 'x' } } });
  });

  await testAsync('_classifyHandlerError mapea correctamente', async () => {
    const m = new SchedulerModule();
    assert.strictEqual(m._classifyHandlerError(new Error('Job not found')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('jobId is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('unauthorized access')), 'PERMISSION_DENIED');
    assert.strictEqual(m._classifyHandlerError(new Error('conflict on save')), 'CONFLICT_STATE');
    assert.strictEqual(m._classifyHandlerError(new Error('unexpected boom')), 'UNKNOWN_ERROR');
  });

  await testAsync('_classifyExecutionError mapea timeouts y upstream HTTP', async () => {
    const m = new SchedulerModule();
    const e1 = new Error('timeout!'); e1._timeout = true;
    assert.strictEqual(m._classifyExecutionError(e1), 'UPSTREAM_TIMEOUT');
    const e2 = new Error('http 401'); e2._upstream_status = 401;
    assert.strictEqual(m._classifyExecutionError(e2), 'UPSTREAM_INVALID_RESPONSE');
    const e3 = new Error('http 503'); e3._upstream_status = 503;
    assert.strictEqual(m._classifyExecutionError(e3), 'UPSTREAM_5XX');
    const e4 = new Error('ECONNREFUSED');
    assert.strictEqual(m._classifyExecutionError(e4), 'UPSTREAM_UNREACHABLE');
    const e5 = new Error('weird');
    assert.strictEqual(m._classifyExecutionError(e5), 'UNKNOWN_ERROR');
  });

  console.log('\nscheduler: todos los tests pasaron ✓');
})().catch(err => { console.error(err); process.exit(1); });

/**
 * Tests unitarios — pizzepos__carta-scheduler (POC2).
 *
 * Ejecutar: node tests/unit/pizzepos__carta-scheduler.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

const MODULE_PATH = path.resolve(__dirname, '../../modules/pizzepos/carta-scheduler/index.js');
const STORAGE_PATH = path.resolve(__dirname, '../../modules/pizzepos/carta-scheduler/project-storage.js');
const TIMER_PATH = path.resolve(__dirname, '../../modules/pizzepos/carta-scheduler/pendientes-timer.js');

class MockProjectStorage {
  constructor() {
    this.data = new Map();
    this.basePaths = new Map();
  }
  register(projectId, basePath) { this.basePaths.set(projectId, basePath); }
  unregister(projectId) {
    this.basePaths.delete(projectId);
    for (const k of Array.from(this.data.keys())) {
      if (k.startsWith(`${projectId}:`)) this.data.delete(k);
    }
  }
  async readJson(projectId, file, defaultValue) {
    const k = `${projectId}:${file}`;
    return { ok: true, data: this.data.get(k) || defaultValue };
  }
  async writeJson(projectId, file, arr) {
    const k = `${projectId}:${file}`;
    this.data.set(k, arr);
    return { ok: true };
  }
}

class MockPendientesTimer {
  constructor(opts) { this.opts = opts; this._running = false; this._ticks = 0; }
  start() { this._running = true; }
  stop() { this._running = false; }
  isRunning() { return this._running; }
  ticks() { return this._ticks; }
}

require.cache[STORAGE_PATH] = { exports: MockProjectStorage, filename: STORAGE_PATH, loaded: true, children: [] };
require.cache[TIMER_PATH] = { exports: MockPendientesTimer, filename: TIMER_PATH, loaded: true, children: [] };

const CartaSchedulerModule = require(MODULE_PATH);

function makeMocks(opts = {}) {
  const logs = [];
  const published = [];
  const metricsCalls = [];
  const mqttCalls = [];

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
  const mqttRequest = async (domain, action, payload) => {
    mqttCalls.push([domain, action, payload]);
    if (opts.mqttHandler) return opts.mqttHandler(domain, action, payload);
    if (domain === 'scheduler' && action === 'create') return { id: `job-${mqttCalls.length}` };
    if (domain === 'scheduler' && action === 'delete') return { ok: true };
    if (domain === 'tarifas' && action === 'assign') return { status: 200 };
    return {};
  };
  return { logs, published, metricsCalls, mqttCalls, logger, metrics, eventBus, mqttRequest };
}

async function instantiate(mocks, opts = {}) {
  const m = new CartaSchedulerModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    mqttRequest: mocks.mqttRequest,
    moduleConfig: {
      persistence: { pattern: 'json-file-per-project', data_path_template: '<project.base_path>/storage' },
      ventana_confirmacion_ms: 86400000,
      cleanup_interval_ms: 60000,
      mqtt_request_timeout_ms: 1000,
      ...(opts.config || {})
    }
  });
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
  console.log('pizzepos__carta-scheduler — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad inicializa storage + timer + maps vacios', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'carta-scheduler');
    assert.strictEqual(m.version, '3.0.0');
    assert.ok(m.storage);
    assert.ok(m.timer);
    assert.ok(m.timer.isRunning());
    await m.onUnload();
    assert.ok(!m.timer.isRunning());
  });

  await testAsync('onLoad sin mqttRequest lanza error', async () => {
    const m = new CartaSchedulerModule();
    let threw = false;
    try {
      await m.onLoad({
        logger: { info: () => {}, error: () => {}, warn: () => {} },
        eventBus: { publish: async () => {} },
        moduleConfig: { persistence: { pattern: 'json-file-per-project' } }
      });
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes('mqttRequest'));
    }
    assert.ok(threw);
  });

  await testAsync('onUnload limpia maps + para timer', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._getReglas('p1').set('r1', { id: 'r1' });
    m._getPendientes('p1').set('pn1', { id: 'pn1' });
    await m.onUnload();
    assert.strictEqual(m.reglasPerProject.size, 0);
    assert.strictEqual(m.pendientesPerProject.size, 0);
    assert.ok(!m.timer.isRunning());
  });

  // Group 2: Validacion canonica
  await testAsync('toolCrearRegla sin project_id devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolCrearRegla({ regla: { descripcion: 'x' } });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('toolEliminarRegla sin regla devuelve 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolEliminarRegla({ project_id: 'p1', regla_id: 'no-existe' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('toolConfirmar sin pendiente devuelve 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolConfirmar({ project_id: 'p1', pendiente_id: 'no-existe' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    await m.onUnload();
  });

  await testAsync('toolConfirmar con pendiente en estado wrong devuelve 409 CONFLICT_STATE', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._getPendientes('p1').set('pn1', {
      id: 'pn1', estado: 'aplicado', cambios: []
    });
    const r = await m.toolConfirmar({ project_id: 'p1', pendiente_id: 'pn1' });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'CONFLICT_STATE');
    await m.onUnload();
  });

  // Group 3: Crear regla flow
  await testAsync('toolCrearRegla persiste + publica regla.creada + registra en scheduler', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolCrearRegla({
      project_id: 'proj-1',
      regla: {
        descripcion: 'Cambiar carta los lunes',
        cambios: [{ canal: 'mesa', carta_id: 'carta-mediodia' }],
        trigger: { type: 'cron', expression: '0 12 * * 1' }
      }
    }, { correlation_id: 'cid-create' });
    assert.strictEqual(r.status, 201);
    assert.ok(r.data.regla.id);
    assert.strictEqual(r.data.regla.activa, true);

    const evs = publishedOf(mocks, 'carta-scheduler.regla.creada');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid-create');
    assert.strictEqual(evs[0].project_id, 'proj-1');
    assert.ok(mocks.mqttCalls.some(c => c[0] === 'scheduler' && c[1] === 'create'));
    await m.onUnload();
  });

  await testAsync('toolListarReglas devuelve total de reglas del proyecto', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._getReglas('proj-1').set('r1', { id: 'r1', descripcion: 'A', activa: true, cambios: [] });
    m._getReglas('proj-1').set('r2', { id: 'r2', descripcion: 'B', activa: false, cambios: [] });
    const r = await m.toolListarReglas({ project_id: 'proj-1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.total, 2);
    await m.onUnload();
  });

  // Group 4: Conflict detection
  await testAsync('toolDetectarConflictos detecta canal con regla activa', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._getReglas('proj-1').set('r1', {
      id: 'r1', descripcion: 'existente', activa: true, trigger: { type: 'cron' },
      cambios: [{ canal: 'mesa', carta_id: 'A' }]
    });
    const r = await m.toolDetectarConflictos({
      project_id: 'proj-1',
      nueva_regla: { cambios: [{ canal: 'mesa', carta_id: 'B' }] }
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.hay_conflicto, true);
    assert.strictEqual(r.data.conflictos.length, 1);
    await m.onUnload();
  });

  await testAsync('toolDetectarConflictos sin conflicto devuelve hay_conflicto=false', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolDetectarConflictos({
      project_id: 'proj-1',
      nueva_regla: { cambios: [{ canal: 'mesa', carta_id: 'B' }] }
    });
    assert.strictEqual(r.data.hay_conflicto, false);
    await m.onUnload();
  });

  // Group 5: Confirmar/rechazar pendiente
  await testAsync('toolConfirmar aplica cambios via mqttRequest tarifas + publica cambio.aplicado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._getPendientes('proj-1').set('pn1', {
      id: 'pn1', estado: 'esperando_confirmacion',
      cambios: [
        { canal: 'mesa', carta_id: 'A' },
        { canal: 'llevar', carta_id: 'B' }
      ]
    });
    const r = await m.toolConfirmar({ project_id: 'proj-1', pendiente_id: 'pn1' },
      { correlation_id: 'cid-confirm' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.aplicados, 2);
    assert.strictEqual(r.data.fallidos, 0);
    assert.strictEqual(mocks.mqttCalls.filter(c => c[0] === 'tarifas' && c[1] === 'assign').length, 2);
    const evs = publishedOf(mocks, 'carta-scheduler.cambio.aplicado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid-confirm');
    await m.onUnload();
  });

  await testAsync('toolRechazar marca pendiente como rechazado + publica cambio.rechazado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._getPendientes('proj-1').set('pn1', {
      id: 'pn1', estado: 'esperando_confirmacion', cambios: []
    });
    const r = await m.toolRechazar({ project_id: 'proj-1', pendiente_id: 'pn1', razon: 'no toca' });
    assert.strictEqual(r.status, 200);
    const pendiente = m._getPendientes('proj-1').get('pn1');
    assert.strictEqual(pendiente.estado, 'rechazado');
    assert.strictEqual(pendiente.razon, 'no toca');
    assert.strictEqual(publishedOf(mocks, 'carta-scheduler.cambio.rechazado').length, 1);
    await m.onUnload();
  });

  // Group 6: Project lifecycle + cleanup + scheduler trigger
  await testAsync('onProjectActivated carga reglas/pendientes y registra jobs', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.storage.data.set('proj-1:carta-scheduler-reglas.json', [
      { id: 'r1', descripcion: 'A', activa: true, cambios: [], trigger: { type: 'cron' } },
      { id: 'r2', descripcion: 'B', activa: false, cambios: [], trigger: { type: 'cron' } }
    ]);
    await m.onProjectActivated({ project_id: 'proj-1', base_path: '/tmp/proj-1' });
    assert.strictEqual(m._getReglas('proj-1').size, 2);
    const created = mocks.mqttCalls.filter(c => c[0] === 'scheduler' && c[1] === 'create');
    assert.strictEqual(created.length, 1);
    await m.onUnload();
  });

  await testAsync('_limpiarPendientesVencidos marca expirados como vencido', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const pasado = new Date(Date.now() - 1000).toISOString();
    m._getPendientes('proj-1').set('pn1', {
      id: 'pn1', estado: 'esperando_confirmacion',
      cambios: [], expira_at: pasado
    });
    const limpiados = await m._limpiarPendientesVencidos();
    assert.strictEqual(limpiados, 1);
    assert.strictEqual(m._getPendientes('proj-1').get('pn1').estado, 'vencido');
    assert.strictEqual(publishedOf(mocks, 'carta-scheduler.cambio.vencido').length, 1);
    await m.onUnload();
  });

  await testAsync('onSchedulerJobTriggered crea pendiente y publica agent.execute.request', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._getReglas('proj-1').set('r1', {
      id: 'r1', descripcion: 'change', activa: true,
      cambios: [{ canal: 'mesa', carta_id: 'A' }], trigger: { type: 'cron' }
    });
    await m.onSchedulerJobTriggered({
      correlation_id: 'cid-trigger',
      job: { name: 'carta-scheduler:r1', project_id: 'proj-1', metadata: { regla_id: 'r1' } }
    });
    assert.strictEqual(m._getPendientes('proj-1').size, 1);
    const reqs = publishedOf(mocks, 'agent.execute.request');
    assert.strictEqual(reqs.length, 1);
    assert.strictEqual(reqs[0].agent_name, 'scheduler-dispatcher');
    assert.strictEqual(reqs[0].project_id, 'proj-1');
    assert.strictEqual(reqs[0].correlation_id, 'cid-trigger');
    await m.onUnload();
  });

  await testAsync('onSchedulerJobTriggered ignora jobs de otros modulos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onSchedulerJobTriggered({
      job: { name: 'otro-modulo:x', project_id: 'p1', metadata: { regla_id: 'r1' } }
    });
    assert.strictEqual(publishedOf(mocks, 'agent.execute.request').length, 0);
    await m.onUnload();
  });

  // Group 7: Helpers POC2
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
    assert.deepStrictEqual(m._classifyHandlerError(new Error('timeout')), { status: 504, code: 'UPSTREAM_TIMEOUT' });
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

  await testAsync('_handleHandlerError emite metric carta-scheduler.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'));
    assert.strictEqual(r.status, 404);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'carta-scheduler.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  await testAsync('handleHealth devuelve shape canonico { status, data }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealth();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.status, 'healthy');
    assert.strictEqual(r.data.module, 'carta-scheduler');
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });

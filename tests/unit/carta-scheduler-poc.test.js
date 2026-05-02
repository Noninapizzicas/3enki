/**
 * Tests unitarios para carta-scheduler-poc (parcela 5/6 del POC3).
 *
 * Cubre los 8 contratos a traves de casos E2E con mocks:
 *  - Bus mockeado (publish + mqttRequest a scheduler/tarifas)
 *  - fs real con tmpdir (json-file-per-project con write atomico)
 *
 * Ejecutar: node tests/unit/carta-scheduler-poc.test.js
 *           npm run test:carta-scheduler-poc
 */

'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');

const CartaSchedulerModule = require('../../modules/pizzepos/carta-scheduler-poc/index.js');
const moduleConfigBase     = require('../../modules/pizzepos/carta-scheduler-poc/module.json').config;

// ----------------------------------------------------------------- helpers

function makeMocks() {
  const logs        = [];
  const metricsCalls = [];
  const published   = [];
  const requests    = [];

  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };
  const metrics = {
    increment: (n, v, l) => metricsCalls.push(['increment', n, v, l]),
    gauge:     (n, v, l) => metricsCalls.push(['gauge',     n, v, l]),
    timing:    (n, v, l) => metricsCalls.push(['timing',    n, v, l])
  };

  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); }
  };

  // Mock mqttRequest: cada test puede registrar respuestas por (domain, action)
  const responses = new Map();   // 'domain.action' → Function (payload) => result | throw
  const mqttRequest = async (domain, action, payload, _opts) => {
    requests.push({ domain, action, payload });
    const key = `${domain}.${action}`;
    const handler = responses.get(key);
    if (!handler) return { status: 200, data: { ok: true } };  // default success
    return handler(payload);
  };

  return {
    logs, metricsCalls, published, requests,
    logger, metrics, eventBus, mqttRequest,
    setMqttResponse: (domain, action, handler) => responses.set(`${domain}.${action}`, handler)
  };
}

function makeTmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'carta-scheduler-poc-'));
}

function findEvent(published, name) {
  return published.find(p => p[0] === name);
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

async function loadModule(mocks, configOverrides = {}) {
  const m = new CartaSchedulerModule();
  const cfg = JSON.parse(JSON.stringify(moduleConfigBase));
  Object.assign(cfg, configOverrides);
  // Acelerar el cleanup interval para que los tests no esperen 1h
  cfg.cleanup_interval_ms      = configOverrides.cleanup_interval_ms      || 60_000_000;  // efectivamente nunca
  cfg.ventana_confirmacion_ms  = configOverrides.ventana_confirmacion_ms  || 50;          // 50ms para test de vencimiento
  await m.onLoad({
    logger:      mocks.logger,
    eventBus:    mocks.eventBus,
    metrics:     mocks.metrics,
    moduleConfig: cfg,
    mqttRequest: mocks.mqttRequest
  });
  return m;
}

// ----------------------------------------------------------------- tests

(async () => {
  console.log('carta-scheduler-poc — smoke tests\n');

  // ============================================================ Group 1: lifecycle

  await testAsync('onLoad lanza si no se provee mqttRequest (cross-modulo via bus)', async () => {
    const mocks = makeMocks();
    const m = new CartaSchedulerModule();
    let threw = false;
    try {
      await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig: moduleConfigBase /* sin mqttRequest */ });
    } catch (e) {
      threw = true;
      assert.ok(/mqttRequest/.test(e.message));
    }
    assert.ok(threw, 'onLoad debe lanzar sin mqttRequest');
  });

  await testAsync('onLoad lanza si pattern != json-file-per-project', async () => {
    const mocks = makeMocks();
    const m = new CartaSchedulerModule();
    const cfg = JSON.parse(JSON.stringify(moduleConfigBase));
    cfg.persistence.pattern = 'in-memory';
    let threw = false;
    try {
      await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig: cfg, mqttRequest: mocks.mqttRequest });
    } catch (e) {
      threw = true;
      assert.ok(/json-file-per-project/.test(e.message));
    }
    assert.ok(threw, 'onLoad debe lanzar con pattern incorrecto');
  });

  await testAsync('onUnload para timer y vacia maps (sin leak)', async () => {
    const mocks = makeMocks();
    const m = await loadModule(mocks);
    assert.strictEqual(m.timer.isRunning(), true);
    await m.onUnload();
    assert.strictEqual(m.timer.isRunning(), false);
    assert.strictEqual(m.reglasPerProject.size, 0);
    assert.strictEqual(m.pendientesPerProject.size, 0);
  });

  // ============================================================ Group 2: project lifecycle + persistence

  await testAsync('onProjectActivated carga reglas vacias (ENOENT graceful)', async () => {
    const mocks = makeMocks();
    const m = await loadModule(mocks);
    const tmp = makeTmpProject();
    await m.onProjectActivated({ project_id: 'p1', base_path: tmp });
    assert.strictEqual(m._getReglas('p1').size, 0);
    assert.strictEqual(m._getPendientes('p1').size, 0);
    await m.onUnload();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await testAsync('toolCrearRegla escribe atomico + publica regla.creada', async () => {
    const mocks = makeMocks();
    const m = await loadModule(mocks);
    const tmp = makeTmpProject();
    await m.onProjectActivated({ project_id: 'p1', base_path: tmp });

    const r = await m.toolCrearRegla({ project_id: 'p1', regla: {
      descripcion: 'test', cambios: [{ canal: 'mesa', carta_id: 'carta-x' }],
      trigger: { type: 'cron', cron: '0 12 * * *' }, activa: true
    }});
    assert.strictEqual(r.status, 201);
    assert.ok(r.data.regla.id);
    assert.strictEqual(r.error, undefined);

    // archivo creado, sin .tmp residual
    const fpath = path.join(tmp, 'storage/pizzepos/config/carta-scheduler-reglas.json');
    assert.ok(fs.existsSync(fpath), 'archivo de reglas debe existir');
    assert.ok(!fs.existsSync(fpath + '.tmp'), 'tempFile no debe quedar');
    const arr = JSON.parse(fs.readFileSync(fpath, 'utf-8'));
    assert.strictEqual(arr.length, 1);

    // evento publicado
    const ev = findEvent(mocks.published, 'carta-scheduler.regla.creada');
    assert.ok(ev, 'debe publicar carta-scheduler.regla.creada');
    assert.strictEqual(ev[1].project_id, 'p1');

    // mqttRequest a scheduler.addJob
    const sched = mocks.requests.find(r => r.domain === 'scheduler' && r.action === 'addJob');
    assert.ok(sched, 'debe llamar mqttRequest a scheduler.addJob');
    assert.ok(sched.payload.name.startsWith('carta-scheduler:'));

    await m.onUnload();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await testAsync('Reload tras restart: reglas persistidas se cargan (restart_resilient)', async () => {
    const tmp = makeTmpProject();
    {
      const mocks = makeMocks();
      const m = await loadModule(mocks);
      await m.onProjectActivated({ project_id: 'p1', base_path: tmp });
      await m.toolCrearRegla({ project_id: 'p1', regla: {
        descripcion: 'persistente', cambios: [{ canal: 'mesa', carta_id: 'A' }],
        trigger: { type: 'datetime', at: '2099-01-01T12:00:00Z' }, activa: true
      }});
      await m.onUnload();
    }
    {
      const mocks = makeMocks();
      const m = await loadModule(mocks);
      await m.onProjectActivated({ project_id: 'p1', base_path: tmp });
      const reglas = m._getReglas('p1');
      assert.strictEqual(reglas.size, 1, 'la regla debe sobrevivir al restart');
      const r = reglas.values().next().value;
      assert.strictEqual(r.descripcion, 'persistente');
      // tambien debe re-registrar el job en scheduler
      const sched = mocks.requests.find(r => r.domain === 'scheduler' && r.action === 'addJob');
      assert.ok(sched, 'al activar proyecto, jobs activos se re-registran');
      await m.onUnload();
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  // ============================================================ Group 3: tools — validation + canonical errors

  await testAsync('toolCrearRegla sin project_id → VALIDATION_FAILED (shape canonico)', async () => {
    const mocks = makeMocks();
    const m = await loadModule(mocks);
    const r = await m.toolCrearRegla({ regla: { trigger: {} } });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'VALIDATION_FAILED');
    assert.strictEqual(r.error.details.field, 'project_id');
    assert.strictEqual(r.data, undefined, 'mutual excl: sin data');
    await m.onUnload();
  });

  await testAsync('toolEliminarRegla con id inexistente → RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const m = await loadModule(mocks);
    const tmp = makeTmpProject();
    await m.onProjectActivated({ project_id: 'p1', base_path: tmp });
    const r = await m.toolEliminarRegla({ project_id: 'p1', regla_id: 'no_existe' });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(r.error.details.entity_type, 'regla');
    assert.strictEqual(r.error.details.entity_id, 'no_existe');
    await m.onUnload();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await testAsync('toolDetectarConflictos detecta canal solapado', async () => {
    const mocks = makeMocks();
    const m = await loadModule(mocks);
    const tmp = makeTmpProject();
    await m.onProjectActivated({ project_id: 'p1', base_path: tmp });
    await m.toolCrearRegla({ project_id: 'p1', regla: {
      descripcion: 'r1', cambios: [{ canal: 'mesa', carta_id: 'A' }],
      trigger: { type: 'cron', cron: '0 12 * * *' }, activa: true
    }});
    const r = await m.toolDetectarConflictos({ project_id: 'p1', nueva_regla: {
      cambios: [{ canal: 'mesa', carta_id: 'B' }]
    }});
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.hay_conflicto, true);
    assert.strictEqual(r.data.conflictos.length, 1);
    assert.strictEqual(r.data.conflictos[0].canal, 'mesa');
    await m.onUnload();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  // ============================================================ Group 4: scheduler.job.triggered + dispatcher

  await testAsync('onSchedulerJobTriggered crea pendiente + notifica dispatcher', async () => {
    const mocks = makeMocks();
    const m = await loadModule(mocks);
    const tmp = makeTmpProject();
    await m.onProjectActivated({ project_id: 'p1', base_path: tmp });
    const c = await m.toolCrearRegla({ project_id: 'p1', regla: {
      descripcion: 'lunes mesa', cambios: [{ canal: 'mesa', carta_id: 'A' }],
      trigger: { type: 'cron', cron: '0 0 * * 1' }, activa: true
    }});
    const reglaId = c.data.regla.id;

    mocks.published.length = 0; // reset

    await m.onSchedulerJobTriggered({
      job: {
        name: `carta-scheduler:${reglaId}`,
        project_id: 'p1',
        metadata: { regla_id: reglaId }
      }
    });

    assert.strictEqual(m._getPendientes('p1').size, 1);
    const ev = findEvent(mocks.published, 'agent.execute.request');
    assert.ok(ev, 'debe publicar agent.execute.request al dispatcher');
    assert.strictEqual(ev[1].agentName, 'scheduler-dispatcher');
    assert.strictEqual(ev[1].context.project_id, 'p1');
    await m.onUnload();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await testAsync('onSchedulerJobTriggered ignora jobs de otros modulos', async () => {
    const mocks = makeMocks();
    const m = await loadModule(mocks);
    await m.onSchedulerJobTriggered({ job: { name: 'otra-cosa:foo', project_id: 'p1', metadata: {} } });
    assert.strictEqual(m._getPendientes('p1').size, 0);
    await m.onUnload();
  });

  // ============================================================ Group 5: confirmar / rechazar (mqttRequest a tarifas)

  await testAsync('toolConfirmar aplica via mqttRequest a tarifas + publica cambio.aplicado', async () => {
    const mocks = makeMocks();
    mocks.setMqttResponse('tarifas', 'assign', () => ({ status: 200, data: { ok: true } }));

    const m = await loadModule(mocks);
    const tmp = makeTmpProject();
    await m.onProjectActivated({ project_id: 'p1', base_path: tmp });
    const c = await m.toolCrearRegla({ project_id: 'p1', regla: {
      descripcion: 'r', cambios: [{ canal: 'mesa', carta_id: 'A' }, { canal: 'terraza', carta_id: 'B' }],
      trigger: { type: 'datetime', at: '2099-01-01T12:00:00Z' }, activa: true
    }});
    await m.onSchedulerJobTriggered({ job: { name: `carta-scheduler:${c.data.regla.id}`, project_id: 'p1', metadata: { regla_id: c.data.regla.id } } });
    const pendiente = m._getPendientes('p1').values().next().value;

    mocks.requests.length = 0;
    mocks.published.length = 0;

    const r = await m.toolConfirmar({ project_id: 'p1', pendiente_id: pendiente.id });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.aplicados, 2);
    assert.strictEqual(r.data.fallidos, 0);

    // 2 mqttRequest a tarifas.assign
    const tarifasReqs = mocks.requests.filter(r => r.domain === 'tarifas' && r.action === 'assign');
    assert.strictEqual(tarifasReqs.length, 2, '2 cambios → 2 mqttRequest');

    // evento canonico publicado
    const ev = findEvent(mocks.published, 'carta-scheduler.cambio.aplicado');
    assert.ok(ev);
    assert.strictEqual(ev[1].aplicados, 2);

    await m.onUnload();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await testAsync('toolConfirmar parcial cuando tarifas falla un cambio', async () => {
    const mocks = makeMocks();
    let callIdx = 0;
    mocks.setMqttResponse('tarifas', 'assign', () => {
      callIdx++;
      if (callIdx === 1) return { status: 200, data: { ok: true } };
      return { status: 500, error: { code: 'INTERNAL_ERROR', message: 'oops' } };
    });

    const m = await loadModule(mocks);
    const tmp = makeTmpProject();
    await m.onProjectActivated({ project_id: 'p1', base_path: tmp });
    const c = await m.toolCrearRegla({ project_id: 'p1', regla: {
      descripcion: 'r', cambios: [{ canal: 'mesa', carta_id: 'A' }, { canal: 'terraza', carta_id: 'B' }],
      trigger: { type: 'datetime', at: '2099-01-01T12:00:00Z' }, activa: true
    }});
    await m.onSchedulerJobTriggered({ job: { name: `carta-scheduler:${c.data.regla.id}`, project_id: 'p1', metadata: { regla_id: c.data.regla.id } } });
    const pendiente = m._getPendientes('p1').values().next().value;

    const r = await m.toolConfirmar({ project_id: 'p1', pendiente_id: pendiente.id });
    assert.strictEqual(r.data.aplicados, 1);
    assert.strictEqual(r.data.fallidos, 1);
    assert.strictEqual(m._getPendientes('p1').get(pendiente.id).estado, 'aplicado_con_errores');

    await m.onUnload();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await testAsync('toolConfirmar pendiente ya aplicado → CONFLICT (status 409)', async () => {
    const mocks = makeMocks();
    mocks.setMqttResponse('tarifas', 'assign', () => ({ status: 200, data: { ok: true } }));

    const m = await loadModule(mocks);
    const tmp = makeTmpProject();
    await m.onProjectActivated({ project_id: 'p1', base_path: tmp });
    const c = await m.toolCrearRegla({ project_id: 'p1', regla: {
      descripcion: 'r', cambios: [{ canal: 'mesa', carta_id: 'A' }],
      trigger: { type: 'datetime', at: '2099-01-01T12:00:00Z' }, activa: true
    }});
    await m.onSchedulerJobTriggered({ job: { name: `carta-scheduler:${c.data.regla.id}`, project_id: 'p1', metadata: { regla_id: c.data.regla.id } } });
    const pendiente = m._getPendientes('p1').values().next().value;
    await m.toolConfirmar({ project_id: 'p1', pendiente_id: pendiente.id });
    const r2 = await m.toolConfirmar({ project_id: 'p1', pendiente_id: pendiente.id });
    assert.strictEqual(r2.status, 409);
    assert.strictEqual(r2.error.code, 'CONFLICT');

    await m.onUnload();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await testAsync('toolRechazar cambia estado + publica cambio.rechazado', async () => {
    const mocks = makeMocks();
    const m = await loadModule(mocks);
    const tmp = makeTmpProject();
    await m.onProjectActivated({ project_id: 'p1', base_path: tmp });
    const c = await m.toolCrearRegla({ project_id: 'p1', regla: {
      descripcion: 'r', cambios: [{ canal: 'mesa', carta_id: 'A' }],
      trigger: { type: 'datetime', at: '2099-01-01T12:00:00Z' }, activa: true
    }});
    await m.onSchedulerJobTriggered({ job: { name: `carta-scheduler:${c.data.regla.id}`, project_id: 'p1', metadata: { regla_id: c.data.regla.id } } });
    const pendiente = m._getPendientes('p1').values().next().value;

    mocks.published.length = 0;
    const r = await m.toolRechazar({ project_id: 'p1', pendiente_id: pendiente.id, razon: 'no quiero' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(m._getPendientes('p1').get(pendiente.id).estado, 'rechazado');
    assert.strictEqual(m._getPendientes('p1').get(pendiente.id).razon, 'no quiero');
    const ev = findEvent(mocks.published, 'carta-scheduler.cambio.rechazado');
    assert.ok(ev);

    await m.onUnload();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  // ============================================================ Group 6: cleanup vencidos

  await testAsync('cleanup vencidos: pendientes expirados pasan a estado=vencido', async () => {
    const mocks = makeMocks();
    const m = await loadModule(mocks, { ventana_confirmacion_ms: 30 });
    const tmp = makeTmpProject();
    await m.onProjectActivated({ project_id: 'p1', base_path: tmp });
    const c = await m.toolCrearRegla({ project_id: 'p1', regla: {
      descripcion: 'r', cambios: [{ canal: 'mesa', carta_id: 'A' }],
      trigger: { type: 'datetime', at: '2099-01-01T12:00:00Z' }, activa: true
    }});
    await m.onSchedulerJobTriggered({ job: { name: `carta-scheduler:${c.data.regla.id}`, project_id: 'p1', metadata: { regla_id: c.data.regla.id } } });
    const pendiente = m._getPendientes('p1').values().next().value;

    await new Promise(r => setTimeout(r, 80));  // pasa ventana de 30ms

    mocks.published.length = 0;
    const cleaned = await m._limpiarPendientesVencidos();
    assert.strictEqual(cleaned, 1);
    assert.strictEqual(m._getPendientes('p1').get(pendiente.id).estado, 'vencido');
    const ev = findEvent(mocks.published, 'carta-scheduler.cambio.vencido');
    assert.ok(ev);
    assert.strictEqual(ev[1].count, 1);

    await m.onUnload();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  // ============================================================ Group 7: mqttRequest failure handling

  await testAsync('mqttRequest a tarifas falla con timeout → toolConfirmar reporta fallido', async () => {
    const mocks = makeMocks();
    mocks.setMqttResponse('tarifas', 'assign', () => { throw new Error('timeout exceeded'); });

    const m = await loadModule(mocks);
    const tmp = makeTmpProject();
    await m.onProjectActivated({ project_id: 'p1', base_path: tmp });
    const c = await m.toolCrearRegla({ project_id: 'p1', regla: {
      descripcion: 'r', cambios: [{ canal: 'mesa', carta_id: 'A' }],
      trigger: { type: 'datetime', at: '2099-01-01T12:00:00Z' }, activa: true
    }});
    await m.onSchedulerJobTriggered({ job: { name: `carta-scheduler:${c.data.regla.id}`, project_id: 'p1', metadata: { regla_id: c.data.regla.id } } });
    const pendiente = m._getPendientes('p1').values().next().value;

    const r = await m.toolConfirmar({ project_id: 'p1', pendiente_id: pendiente.id });
    assert.strictEqual(r.data.fallidos, 1);
    assert.strictEqual(r.data.aplicados, 0);
    assert.strictEqual(r.data.detalle.fallidos[0].error_code, 'UPSTREAM_TIMEOUT');

    await m.onUnload();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  // ============================================================ Group 8: disciplina

  await testAsync('correlation_id se propaga en publishes (events v1.3.0)', async () => {
    const mocks = makeMocks();
    const m = await loadModule(mocks);
    const tmp = makeTmpProject();
    await m.onProjectActivated({ project_id: 'p1', base_path: tmp });

    // sourcePayload simulado con correlation_id
    const c = await m.toolCrearRegla.call(m, { project_id: 'p1', regla: {
      descripcion: 'r', cambios: [{ canal: 'mesa', carta_id: 'A' }],
      trigger: { type: 'datetime', at: '2099-01-01T12:00:00Z' }, activa: true
    }}, { correlation_id: 'corr-123' });

    const ev = findEvent(mocks.published, 'carta-scheduler.regla.creada');
    assert.strictEqual(ev[1].correlation_id, 'corr-123');

    await m.onUnload();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await testAsync('handleHealth devuelve estado del modulo (totales + timer)', async () => {
    const mocks = makeMocks();
    const m = await loadModule(mocks);
    const tmp = makeTmpProject();
    await m.onProjectActivated({ project_id: 'p1', base_path: tmp });
    const h = await m.handleHealth();
    assert.strictEqual(h.status, 'healthy');
    assert.strictEqual(h.module, 'carta-scheduler');
    assert.strictEqual(h.timer_running, true);

    await m.onUnload();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  console.log('\ncarta-scheduler-poc: todos los tests pasaron ✓');
})().catch(err => { console.error(err); process.exit(1); });

/**
 * Tests unitarios — viabilidad (POC2).
 *
 * Ejecutar: node tests/unit/viabilidad.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');

const ViabilidadModule = require('../../modules/viabilidad/index.js');

let TMP_ROOT;

function setupTmp() {
  TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'viabilidad-test-'));
}

function teardownTmp() {
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

async function instantiate(mocks) {
  const m = new ViabilidadModule();
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus });
  return { module: m };
}

async function activateProject(m, projectId, basePath, opts = {}) {
  const recetasDir = path.join(basePath, 'storage', 'recetas');
  await fsp.mkdir(recetasDir, { recursive: true });
  if (opts.recetas) {
    await fsp.writeFile(path.join(recetasDir, 'recetas.json'), JSON.stringify(opts.recetas), 'utf-8');
  }
  if (opts.ingredientes) {
    await fsp.writeFile(path.join(recetasDir, 'ingredientes.json'), JSON.stringify(opts.ingredientes), 'utf-8');
  }
  await m.onProjectActivated({ data: { project_id: projectId, base_path: basePath } });
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
  setupTmp();
  console.log('viabilidad — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad inicializa estado limpio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'viabilidad');
    assert.strictEqual(m.version, '2.0.0');
    assert.strictEqual(m.configs.size, 0);
    assert.strictEqual(m.recetasCache.size, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia maps', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.configs.set('p', {});
    m.recetasCache.set('p', { recetas: [] });
    m.escenarios.set('p', []);
    m.projectPaths.set('p', { storagePath: '/tmp' });
    await m.onUnload();
    assert.strictEqual(m.configs.size, 0);
    assert.strictEqual(m.recetasCache.size, 0);
    assert.strictEqual(m.escenarios.size, 0);
    assert.strictEqual(m.projectPaths.size, 0);
  });

  await testAsync('onProjectActivated carga recetas/config/escenarios desde disco', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const projDir = path.join(TMP_ROOT, 'proj-1');
    await activateProject(m, 'proj-1', projDir, {
      recetas: [{ id: 'r1', nombre: 'Pizza', coste_porcion: 3 }]
    });
    const data = await m.getRecetas('proj-1');
    assert.strictEqual(data.recetas.length, 1);
    assert.strictEqual(data.recetas[0].nombre, 'Pizza');
    await m.onUnload();
  });

  // Group 2: Validacion canonica
  await testAsync('toolEstudio sin gastos_fijos devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolEstudio({ project_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'gastos_fijos_mensuales');
    await m.onUnload();
  });

  await testAsync('toolEstudio sin project_id devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolEstudio({ gastos_fijos_mensuales: 1000 });
    assert.strictEqual(r.error.details.field, 'project_id');
    await m.onUnload();
  });

  await testAsync('toolPuntoEquilibrio sin gastos_fijos devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolPuntoEquilibrio({ project_id: 'p1' });
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('toolEscenario sin nombre devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolEscenario({
      project_id: 'p1', gastos_fijos_mensuales: 1000,
      comensales_dia: 50, ticket_medio: 15
    });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.details.field, 'nombre');
    await m.onUnload();
  });

  await testAsync('toolCompararEscenarios con menos de 2 escenarios devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolCompararEscenarios({ escenarios: [], project_id: 'p1' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.details.min_length, 2);
    await m.onUnload();
  });

  await testAsync('toolProyeccion sin comensales_dia_inicial devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolProyeccion({
      project_id: 'p1', gastos_fijos_mensuales: 1000, ticket_medio: 15
    });
    assert.strictEqual(r.error.details.field, 'comensales_dia_inicial');
    await m.onUnload();
  });

  await testAsync('toolGuardarConfig sin project_id devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolGuardarConfig({ nombre_negocio: 'X' });
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  // Group 3: Calculo de escenarios
  await testAsync('calcularEscenario calcula breakeven y rentabilidad', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m.calcularEscenario({
      nombre: 'Test',
      gastos_fijos_mensuales: 5000,
      comensales_dia: 100,
      ticket_medio: 20,
      food_cost_porcentaje: 30,
      dias_operacion_mes: 25
    });
    assert.strictEqual(r.ingresos.dia, 2000);
    assert.strictEqual(r.ingresos.mes, 50000);
    assert.strictEqual(r.gastos.materia_prima_mes, 15000);
    assert.strictEqual(r.gastos.total_mes, 20000);
    assert.strictEqual(r.beneficio.mes, 30000);
    assert.strictEqual(r.beneficio.es_rentable, true);
    assert.ok(r.punto_equilibrio.comensales_dia > 0);
    await m.onUnload();
  });

  await testAsync('calcularEscenario con gastos > ingresos marca no rentable', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m.calcularEscenario({
      nombre: 'Quiebra',
      gastos_fijos_mensuales: 50000,
      comensales_dia: 5,
      ticket_medio: 15,
      food_cost_porcentaje: 30,
      dias_operacion_mes: 25
    });
    assert.strictEqual(r.beneficio.es_rentable, false);
    assert.ok(r.beneficio.mes < 0);
    await m.onUnload();
  });

  // Group 4: Estudio + flow completo
  await testAsync('toolEstudio genera 3 escenarios + persiste + emite evento', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const projDir = path.join(TMP_ROOT, 'proj-estudio');
    await activateProject(m, 'proj-1', projDir);
    const r = await m.toolEstudio({
      gastos_fijos_mensuales: 5000,
      comensales_dia_estimados: 80,
      ticket_medio: 18,
      project_id: 'proj-1',
      correlation_id: 'cid-est'
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.escenarios.principal.parametros.comensales_dia, 80);
    assert.strictEqual(r.data.escenarios.conservador.parametros.comensales_dia, 64);
    assert.strictEqual(r.data.escenarios.optimista.parametros.comensales_dia, 104);
    assert.ok(r.data.conclusiones.length > 0);

    const evs = publishedOf(mocks, 'viabilidad.estudio.generado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid-est');
    assert.strictEqual(evs[0].project_id, 'proj-1');
    await m.onUnload();
  });

  await testAsync('toolEstudio con recetas calcula food_cost desde costes', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const projDir = path.join(TMP_ROOT, 'proj-recetas');
    await activateProject(m, 'proj-1', projDir, {
      recetas: [
        { id: 'r1', nombre: 'A', coste_porcion: 3 },
        { id: 'r2', nombre: 'B', coste_porcion: 5 }
      ]
    });
    const r = await m.toolEstudio({
      gastos_fijos_mensuales: 5000,
      ticket_medio: 12,
      project_id: 'proj-1'
    });
    // costeMedio = 4, ticket=12, foodCost = 4/12*100 = 33.33
    assert.ok(r.data.food_cost_medio >= 33);
    assert.ok(r.data.recetas.length === 2);
    await m.onUnload();
  });

  // Group 5: Punto equilibrio + escenarios
  await testAsync('toolPuntoEquilibrio devuelve tabla_escenarios + punto exacto', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const projDir = path.join(TMP_ROOT, 'proj-pe');
    await activateProject(m, 'proj-1', projDir);
    const r = await m.toolPuntoEquilibrio({
      gastos_fijos_mensuales: 5000,
      ticket_medio: 20,
      food_cost_porcentaje: 30,
      project_id: 'proj-1'
    });
    assert.ok(isCanonicalSuccess(r));
    assert.ok(r.data.punto_equilibrio.comensales_dia > 0);
    assert.strictEqual(r.data.tabla_escenarios.length, 7);
    await m.onUnload();
  });

  await testAsync('toolEscenario persiste y reemplaza por nombre', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const projDir = path.join(TMP_ROOT, 'proj-esc');
    await activateProject(m, 'proj-1', projDir);

    await m.toolEscenario({
      nombre: 'Esc1', gastos_fijos_mensuales: 5000,
      comensales_dia: 80, ticket_medio: 15,
      project_id: 'proj-1'
    });
    await m.toolEscenario({
      nombre: 'Esc1', gastos_fijos_mensuales: 7000,
      comensales_dia: 80, ticket_medio: 15,
      project_id: 'proj-1'
    });

    const lista = m.escenarios.get('proj-1');
    assert.strictEqual(lista.length, 1);
    assert.strictEqual(lista[0].parametros.gastos_fijos_mensuales, 7000);

    // Verifica persistencia
    const filePath = path.join(projDir, 'storage', 'viabilidad', 'escenarios.json');
    const stored = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    assert.strictEqual(stored.length, 1);
    await m.onUnload();
  });

  await testAsync('toolCompararEscenarios identifica mejor y peor', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const projDir = path.join(TMP_ROOT, 'proj-cmp');
    await activateProject(m, 'proj-1', projDir);
    const r = await m.toolCompararEscenarios({
      escenarios: [
        { nombre: 'A', gastos_fijos_mensuales: 3000, comensales_dia: 100, ticket_medio: 20, food_cost_porcentaje: 30 },
        { nombre: 'B', gastos_fijos_mensuales: 5000, comensales_dia: 50, ticket_medio: 15, food_cost_porcentaje: 35 }
      ],
      project_id: 'proj-1'
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.escenarios.length, 2);
    assert.ok(r.data.comparativa.mejor_escenario);
    assert.ok(r.data.comparativa.peor_escenario);
    assert.ok(r.data.comparativa.diferencia >= 0);
    await m.onUnload();
  });

  // Group 6: Proyeccion + config
  await testAsync('toolProyeccion proyecta N meses + ROI con inversion', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const projDir = path.join(TMP_ROOT, 'proj-proy');
    await activateProject(m, 'proj-1', projDir);
    const r = await m.toolProyeccion({
      meses: 6,
      gastos_fijos_mensuales: 5000,
      comensales_dia_inicial: 50,
      comensales_dia_objetivo: 100,
      ticket_medio: 20,
      inversion_inicial: 30000,
      project_id: 'proj-1'
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.proyeccion.length, 6);
    // mes 1 = 50 comensales, mes 6 = 100 comensales
    assert.strictEqual(r.data.proyeccion[0].comensales_dia, 50);
    assert.strictEqual(r.data.proyeccion[5].comensales_dia, 100);
    assert.ok(r.data.resumen.beneficio_total_periodo);
    await m.onUnload();
  });

  await testAsync('toolGuardarConfig persiste atomicamente y se recarga', async () => {
    const mocks = makeMocks();
    const projDir = path.join(TMP_ROOT, 'proj-config');

    const { module: m1 } = await instantiate(mocks);
    await activateProject(m1, 'proj-1', projDir);
    await m1.toolGuardarConfig({
      project_id: 'proj-1',
      nombre_negocio: 'La Pizzeria',
      gastos_fijos_mensuales: 3500,
      ticket_medio: 18
    });
    await m1.onUnload();

    const mocks2 = makeMocks();
    const { module: m2 } = await instantiate(mocks2);
    await activateProject(m2, 'proj-1', projDir);
    const config = m2.getConfig('proj-1');
    assert.strictEqual(config.nombre_negocio, 'La Pizzeria');
    assert.strictEqual(config.ticket_medio, 18);
    await m2.onUnload();
  });

  await testAsync('onRecetaChanged invalida cache del proyecto', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const projDir = path.join(TMP_ROOT, 'proj-inv');
    await activateProject(m, 'proj-1', projDir, {
      recetas: [{ id: 'r1', nombre: 'A', coste_porcion: 3 }]
    });
    assert.ok(m.recetasCache.has('proj-1'));
    await m.onRecetaChanged({ data: { project_id: 'proj-1' } });
    assert.ok(!m.recetasCache.has('proj-1'));
    await m.onUnload();
  });

  await testAsync('handleConfig action=get devuelve config canonical', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const projDir = path.join(TMP_ROOT, 'proj-getcfg');
    await activateProject(m, 'proj-1', projDir);
    await m.toolGuardarConfig({ project_id: 'proj-1', nombre_negocio: 'X' });
    const r = await m.handleConfig({ project_id: 'proj-1', action: 'get' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.nombre_negocio, 'X');
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

  await testAsync('_atomicWriteFile escribe via tmp + rename', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const target = path.join(TMP_ROOT, 'sub', 'atomic.json');
    await m._atomicWriteFile(target, JSON.stringify({ ok: 1 }));
    const data = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.strictEqual(data.ok, 1);
    assert.ok(!fs.existsSync(`${target}.tmp`));
    await m.onUnload();
  });

  await testAsync('_readJsonSafe ENOENT devuelve default value', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m._readJsonSafe(path.join(TMP_ROOT, 'no-existe.json'), { x: 1 });
    assert.deepStrictEqual(r, { x: 1 });
    await m.onUnload();
  });

  await testAsync('_handleHandlerError emite metric viabilidad.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'));
    assert.strictEqual(r.status, 404);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'viabilidad.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  teardownTmp();
  console.log('\nTodos los tests pasaron.');
})().catch(e => {
  teardownTmp();
  console.error(e);
  process.exit(1);
});

/**
 * Tests unitarios — pizzepos__tarifas (POC2).
 *
 * Ejecutar: node tests/unit/pizzepos__tarifas.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');

const TarifasModule = require('../../modules/pizzepos/tarifas/index.js');

let TMP_ROOT;

function setupTmp() {
  TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'tarifas-test-'));
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
  const m = new TarifasModule();
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus });
  return { module: m };
}

async function activateProject(m, projectId, basePath) {
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
  console.log('pizzepos__tarifas — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad inicializa estado limpio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'tarifas');
    assert.strictEqual(m.version, '3.0.0');
    assert.strictEqual(m.configPerProject.size, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia maps', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.configPerProject.set('p1', m.defaultConfig());
    m.projectPaths.set('p1', '/tmp/p1');
    await m.onUnload();
    assert.strictEqual(m.configPerProject.size, 0);
    assert.strictEqual(m.projectPaths.size, 0);
  });

  await testAsync('onProjectActivated carga config + setea _lastActiveProjectId', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await activateProject(m, 'proj-1', path.join(TMP_ROOT, 'proj-1'));
    assert.strictEqual(m._lastActiveProjectId, 'proj-1');
    assert.ok(m.configPerProject.has('proj-1'));
    await m.onUnload();
  });

  // Group 2: Validacion canonica
  await testAsync('toolSetGeneral sin carta_id devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolSetGeneral({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('toolAssign sin canal devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolAssign({ carta_id: 'c1', project_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'canal');
    await m.onUnload();
  });

  await testAsync('toolAssign con canal invalido devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolAssign({ canal: 'bogus', carta_id: 'c1', project_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.deepStrictEqual(r.error.details.valid_values, ['mesa', 'llevar', 'telefono', 'whatsapp', 'glovo', 'llevadoo']);
    await m.onUnload();
  });

  await testAsync('toolRegisterVariant sin carta_id/base_carta_id devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolRegisterVariant({ project_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  // Group 3: Set general + assign + resolverCarta flow
  await testAsync('toolSetGeneral persiste + publica tarifas.config.actualizada con project_id top-level', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await activateProject(m, 'proj-1', path.join(TMP_ROOT, 'proj-1'));
    const r = await m.toolSetGeneral({ carta_id: 'carta-base', project_id: 'proj-1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(m.getConfig('proj-1').general, 'carta-base');
    const evs = publishedOf(mocks, 'tarifas.config.actualizada');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].project_id, 'proj-1');
    assert.strictEqual(evs[0].tipo, 'general');
    assert.ok(evs[0].timestamp);

    // Verifica persistencia atomica
    const filePath = m.configPathFor('proj-1');
    const content = await fsp.readFile(filePath, 'utf8');
    assert.strictEqual(JSON.parse(content).general, 'carta-base');
    await m.onUnload();
  });

  await testAsync('toolAssign canal especifico override sobre general', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await activateProject(m, 'proj-1', path.join(TMP_ROOT, 'proj-1b'));
    await m.toolSetGeneral({ carta_id: 'carta-base', project_id: 'proj-1' });
    await m.toolAssign({ canal: 'glovo', carta_id: 'carta-glovo', project_id: 'proj-1' });
    assert.strictEqual(m.resolverCarta('mesa', 'proj-1'), 'carta-base');
    assert.strictEqual(m.resolverCarta('glovo', 'proj-1'), 'carta-glovo');
    await m.onUnload();
  });

  await testAsync('toolAssign sin carta_id remueve override del canal', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await activateProject(m, 'proj-1', path.join(TMP_ROOT, 'proj-1c'));
    await m.toolSetGeneral({ carta_id: 'carta-base', project_id: 'proj-1' });
    await m.toolAssign({ canal: 'glovo', carta_id: 'carta-glovo', project_id: 'proj-1' });
    await m.toolAssign({ canal: 'glovo', carta_id: null, project_id: 'proj-1' });
    assert.strictEqual(m.resolverCarta('glovo', 'proj-1'), 'carta-base');
    await m.onUnload();
  });

  // Group 4: Get + variantes
  await testAsync('toolGet devuelve resumen con todos los canales y override flag', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await activateProject(m, 'proj-1', path.join(TMP_ROOT, 'proj-1d'));
    await m.toolSetGeneral({ carta_id: 'general', project_id: 'proj-1' });
    await m.toolAssign({ canal: 'mesa', carta_id: 'mesa-carta', project_id: 'proj-1' });
    const r = await m.toolGet({ project_id: 'proj-1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.general, 'general');
    assert.strictEqual(r.data.canales.mesa.carta_id, 'mesa-carta');
    assert.strictEqual(r.data.canales.mesa.es_override, true);
    assert.strictEqual(r.data.canales.llevar.usa_general, true);
    await m.onUnload();
  });

  await testAsync('toolRegisterVariant guarda variante + asigna canales', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await activateProject(m, 'proj-1', path.join(TMP_ROOT, 'proj-1e'));
    const r = await m.toolRegisterVariant({
      carta_id: 'carta-delivery',
      base_carta_id: 'carta-base',
      nombre: 'Delivery con recargo',
      canales: ['glovo', 'llevadoo'],
      reglas: { precio: '+15%' },
      project_id: 'proj-1'
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(m.resolverCarta('glovo', 'proj-1'), 'carta-delivery');
    assert.strictEqual(m.resolverCarta('llevadoo', 'proj-1'), 'carta-delivery');
    const config = m.getConfig('proj-1');
    assert.strictEqual(config.variantes.length, 1);
    await m.onUnload();
  });

  await testAsync('toolRegisterVariant reemplaza variante existente con mismo carta_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await activateProject(m, 'proj-1', path.join(TMP_ROOT, 'proj-1f'));
    await m.toolRegisterVariant({
      carta_id: 'v1', base_carta_id: 'b', nombre: 'V1', canales: ['mesa'], project_id: 'proj-1'
    });
    await m.toolRegisterVariant({
      carta_id: 'v1', base_carta_id: 'b', nombre: 'V1-updated', canales: ['llevar'], project_id: 'proj-1'
    });
    const config = m.getConfig('proj-1');
    assert.strictEqual(config.variantes.length, 1);
    assert.strictEqual(config.variantes[0].nombre, 'V1-updated');
    await m.onUnload();
  });

  // Group 5: Persistencia + reload
  await testAsync('config persiste a disco y se recarga al re-activar proyecto', async () => {
    const mocks = makeMocks();
    const projDir = path.join(TMP_ROOT, 'proj-persist');
    const { module: m1 } = await instantiate(mocks);
    await activateProject(m1, 'proj-1', projDir);
    await m1.toolSetGeneral({ carta_id: 'persistente', project_id: 'proj-1' });
    await m1.onUnload();

    const mocks2 = makeMocks();
    const { module: m2 } = await instantiate(mocks2);
    await activateProject(m2, 'proj-1', projDir);
    assert.strictEqual(m2.getConfig('proj-1').general, 'persistente');
    await m2.onUnload();
  });

  await testAsync('config inexistente carga defaults sin error', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await activateProject(m, 'proj-new', path.join(TMP_ROOT, 'proj-new-empty'));
    const config = m.getConfig('proj-new');
    assert.strictEqual(config.general, null);
    assert.deepStrictEqual(config.canales, {});
    assert.deepStrictEqual(config.variantes, []);
    await m.onUnload();
  });

  // Group 6: resolverCarta + UI handlers
  await testAsync('resolverCarta devuelve general si canal sin override', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await activateProject(m, 'proj-1', path.join(TMP_ROOT, 'proj-1g'));
    await m.toolSetGeneral({ carta_id: 'g', project_id: 'proj-1' });
    assert.strictEqual(m.resolverCarta('mesa', 'proj-1'), 'g');
    await m.onUnload();
  });

  await testAsync('resolverCarta devuelve null si no hay general ni override', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await activateProject(m, 'proj-1', path.join(TMP_ROOT, 'proj-1h'));
    assert.strictEqual(m.resolverCarta('mesa', 'proj-1'), null);
    await m.onUnload();
  });

  await testAsync('handleGet devuelve shape canonico { status, data }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await activateProject(m, 'proj-1', path.join(TMP_ROOT, 'proj-1i'));
    const r = await m.handleGet({ project_id: 'proj-1' });
    assert.ok(isCanonicalSuccess(r));
    await m.onUnload();
  });

  await testAsync('handleHealth devuelve shape canonico healthy', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealth();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.status, 'healthy');
    assert.strictEqual(r.data.module, 'tarifas');
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
    assert.deepStrictEqual(m._classifyHandlerError(Object.assign(new Error('no file'), { code: 'ENOENT' })), { status: 404, code: 'RESOURCE_NOT_FOUND' });
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

  await testAsync('_handleHandlerError emite metric tarifas.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'));
    assert.strictEqual(r.status, 404);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'tarifas.errors');
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

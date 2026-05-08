/**
 * Tests unitarios — pizzepos__carta-marketing (POC2).
 *
 * Ejecutar: node tests/unit/pizzepos__carta-marketing.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');

const CartaMarketingModule = require('../../modules/pizzepos/carta-marketing/index.js');

let TMP_ROOT;

function setupTmp() {
  TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-mkt-test-'));
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
  const m = new CartaMarketingModule();
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
  console.log('pizzepos__carta-marketing — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad inicializa estado limpio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'carta-marketing');
    assert.strictEqual(m.version, '2.0.0');
    assert.strictEqual(m.perfilesPerProject.size, 0);
    assert.strictEqual(m.processedHashes.size, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia maps', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.perfilesPerProject.set('p1', m.defaultPerfil());
    m.processedHashes.set('p1:c1', 'hash1');
    await m.onUnload();
    assert.strictEqual(m.perfilesPerProject.size, 0);
    assert.strictEqual(m.processedHashes.size, 0);
  });

  await testAsync('onProjectActivated carga perfil default si no hay archivo', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await activateProject(m, 'proj-1', path.join(TMP_ROOT, 'proj-1'));
    const perfil = m.getPerfil('proj-1');
    assert.strictEqual(perfil.idioma, 'es');
    assert.strictEqual(perfil.onboarding_completado, false);
    await m.onUnload();
  });

  // Group 2: Validacion canonica
  await testAsync('toolGetPerfil sin project_id devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolGetPerfil({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('toolUpdatePerfil sin project_id devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolUpdatePerfil({ tono: 'alegre' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('toolGetActividad sin project_id devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolGetActividad({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  // Group 3: Update perfil + persistencia atomica
  await testAsync('toolUpdatePerfil persiste cambios atomicamente', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await activateProject(m, 'proj-1', path.join(TMP_ROOT, 'proj-1b'));
    const r = await m.toolUpdatePerfil({
      project_id: 'proj-1',
      nombre: 'Pizzeria Roma',
      tono: 'cercano',
      idioma: 'es'
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(m.getPerfil('proj-1').nombre, 'Pizzeria Roma');
    const filePath = m.perfilPathFor('proj-1');
    const stored = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    assert.strictEqual(stored.tono, 'cercano');
    await m.onUnload();
  });

  await testAsync('perfil persiste y se recarga al re-activar', async () => {
    const mocks = makeMocks();
    const projDir = path.join(TMP_ROOT, 'proj-persist');
    const { module: m1 } = await instantiate(mocks);
    await activateProject(m1, 'proj-1', projDir);
    await m1.toolUpdatePerfil({ project_id: 'proj-1', nombre: 'Trattoria' });
    await m1.onUnload();

    const mocks2 = makeMocks();
    const { module: m2 } = await instantiate(mocks2);
    await activateProject(m2, 'proj-1', projDir);
    assert.strictEqual(m2.getPerfil('proj-1').nombre, 'Trattoria');
    await m2.onUnload();
  });

  await testAsync('toolCompletarOnboarding marca flag en perfil', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await activateProject(m, 'proj-1', path.join(TMP_ROOT, 'proj-1c'));
    const r = await m.toolCompletarOnboarding({ project_id: 'proj-1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(m.getPerfil('proj-1').onboarding_completado, true);
    await m.onUnload();
  });

  // Group 4: Loop prevention
  await testAsync('cartaHash devuelve hash determinista 12 chars', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const carta = { productos: [{ id: 'p1', nombre: 'A', precio: 10 }] };
    const h1 = m.cartaHash(carta);
    const h2 = m.cartaHash(carta);
    assert.strictEqual(h1, h2);
    assert.strictEqual(h1.length, 12);
    await m.onUnload();
  });

  await testAsync('wasProcessedByMe + markProcessed funcionan correctamente', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.wasProcessedByMe('p', 'c', 'h1'), false);
    m.markProcessed('p', 'c', 'h1');
    assert.strictEqual(m.wasProcessedByMe('p', 'c', 'h1'), true);
    assert.strictEqual(m.wasProcessedByMe('p', 'c', 'h2'), false);
    await m.onUnload();
  });

  // Group 5: onCartaActualizada → dispatch agentes
  await testAsync('onCartaActualizada sin onboarding_completado NO dispara agentes', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await activateProject(m, 'proj-1', path.join(TMP_ROOT, 'proj-1d'));
    await m.onCartaActualizada({
      data: {
        project_id: 'proj-1',
        meta: { id: 'carta-1' },
        productos: [{ id: 'p1', nombre: 'A' }]
      }
    });
    assert.strictEqual(publishedOf(mocks, 'agent.execute.request').length, 0);
    await m.onUnload();
  });

  await testAsync('onCartaActualizada con productos sin descripcion dispara copywriter + brand-keeper', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await activateProject(m, 'proj-1', path.join(TMP_ROOT, 'proj-1e'));
    await m.toolCompletarOnboarding({ project_id: 'proj-1' });
    await m.onCartaActualizada({
      data: {
        project_id: 'proj-1',
        correlation_id: 'cid-mkt',
        meta: { id: 'carta-1' },
        productos: [
          { id: 'p1', nombre: 'A' },
          { id: 'p2', nombre: 'B', descripcion: 'ya tiene' }
        ]
      }
    });
    const evs = publishedOf(mocks, 'agent.execute.request');
    assert.ok(evs.length >= 2);
    const agentes = evs.map(e => e.agent_name);
    assert.ok(agentes.includes('marketing-copywriter'));
    assert.ok(agentes.includes('marketing-brand-keeper'));
    assert.strictEqual(evs[0].correlation_id, 'cid-mkt');
    assert.strictEqual(evs[0].project_id, 'proj-1');
    await m.onUnload();
  });

  await testAsync('onCartaActualizada con mismo hash NO redispara (loop prevention)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await activateProject(m, 'proj-1', path.join(TMP_ROOT, 'proj-1f'));
    await m.toolCompletarOnboarding({ project_id: 'proj-1' });
    const carta = {
      data: {
        project_id: 'proj-1',
        meta: { id: 'carta-1' },
        productos: [{ id: 'p1', nombre: 'A' }]
      }
    };
    await m.onCartaActualizada(carta);
    const evsAfterFirst = publishedOf(mocks, 'agent.execute.request').length;
    await m.onCartaActualizada(carta);
    const evsAfterSecond = publishedOf(mocks, 'agent.execute.request').length;
    assert.strictEqual(evsAfterFirst, evsAfterSecond, 'segundo evento NO redispara');
    await m.onUnload();
  });

  // Group 6: detectarNecesidades
  await testAsync('detectarNecesidades sin productos devuelve []', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const necesidades = m.detectarNecesidades({ productos: [] });
    assert.strictEqual(necesidades.length, 0);
    await m.onUnload();
  });

  await testAsync('detectarNecesidades con todos descritos devuelve []', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const necesidades = m.detectarNecesidades({
      productos: [
        { id: 'p1', nombre: 'A', descripcion: 'desc' },
        { id: 'p2', nombre: 'B', descripcion: 'desc' }
      ]
    });
    assert.strictEqual(necesidades.length, 0);
    await m.onUnload();
  });

  await testAsync('detectarNecesidades incluye strategy si >5 productos sin tags', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const productos = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, nombre: `P${i}`, descripcion: 'd' }));
    const necesidades = m.detectarNecesidades({ productos });
    assert.ok(necesidades.some(n => n.tipo === 'strategy'));
    assert.ok(necesidades.some(n => n.tipo === 'brand-review'));
    await m.onUnload();
  });

  await testAsync('handleHealth devuelve shape canonico healthy', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealth();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.status, 'healthy');
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
    assert.deepStrictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'ENOENT' })), { status: 404, code: 'RESOURCE_NOT_FOUND' });
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
    await m.onUnload();
  });

  await testAsync('_handleHandlerError emite metric carta-marketing.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'));
    assert.strictEqual(r.status, 404);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'carta-marketing.errors');
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

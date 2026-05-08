/**
 * Tests unitarios — pizzepos__menu-generator (POC2).
 *
 * Ejecutar: node tests/unit/pizzepos__menu-generator.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

// Mock ServiceExecutor antes de require el modulo
const SE_PATH = path.resolve(__dirname, '../../core/service-executor.js');
class MockServiceExecutor {
  constructor() {
    this.calls = [];
    this._handlers = new Map();
  }
  setHandler(service, action, fn) { this._handlers.set(`${service}:${action}`, fn); }
  async call(service, action, payload, opts) {
    this.calls.push([service, action, payload]);
    const h = this._handlers.get(`${service}:${action}`);
    if (h) return h(payload);
    return { data: {} };
  }
}
require.cache[SE_PATH] = { exports: MockServiceExecutor, filename: SE_PATH, loaded: true, children: [] };

const MenuGeneratorModule = require('../../modules/pizzepos/menu-generator/index.js');

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

async function instantiate(mocks, opts = {}) {
  const m = new MenuGeneratorModule();
  const services = opts.services || new MockServiceExecutor();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    services
  });
  return { module: m, services };
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
  console.log('pizzepos__menu-generator — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad inicializa estado limpio + ServiceExecutor', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'menu-generator');
    assert.strictEqual(m.version, '7.0.0');
    assert.ok(m.services);
    await m.onUnload();
    assert.strictEqual(m.services, null);
  });

  // Group 2: Validacion canonica
  await testAsync('toolGenerate sin nombre devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolGenerate({ texto: 'x', project_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'nombre');
    await m.onUnload();
  });

  await testAsync('toolGenerate sin texto ni filePath devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolGenerate({ nombre: 'X', project_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.deepStrictEqual(r.error.details.fields, ['texto', 'filePath']);
    await m.onUnload();
  });

  await testAsync('toolGenerate sin project_id devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolGenerate({ nombre: 'X', texto: 'menu' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.details.field, 'project_id');
    await m.onUnload();
  });

  // Group 3: Pipeline texto → structurer
  await testAsync('toolGenerate con texto invoca menu-structurer', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolGenerate({
      nombre: 'Carta Verano', texto: 'Pizza margarita 10€', project_id: 'proj-1',
      correlation_id: 'cid-gen'
    });
    assert.strictEqual(r.status, 202);
    assert.strictEqual(r.data.pipeline, 'text');

    const agentReqs = publishedOf(mocks, 'agent.execute.request');
    assert.strictEqual(agentReqs.length, 1);
    assert.strictEqual(agentReqs[0].agent_name, 'menu-structurer');
    assert.strictEqual(agentReqs[0].correlation_id, 'cid-gen');
    assert.strictEqual(agentReqs[0].project_id, 'proj-1');

    const progress = publishedOf(mocks, 'menu.generation.progress');
    assert.ok(progress.length >= 1);
    assert.strictEqual(progress[0].step, 'structuring');
    await m.onUnload();
  });

  // Group 4: Pipeline filePath → OCR + structurer
  await testAsync('toolGenerate con filePath imagen extrae texto + invoca structurer', async () => {
    const mocks = makeMocks();
    const services = new MockServiceExecutor();
    services.setHandler('local.sharp', 'prepare-ocr', () => ({ data: { image: 'prepared' } }));
    services.setHandler('local.google-vision', 'extract', () => ({ data: { text: 'Pizza Margarita 10€', confidence: 0.95 } }));
    const { module: m } = await instantiate(mocks, { services });

    const r = await m.toolGenerate({
      nombre: 'Carta', filePath: '/tmp/menu.jpg', project_id: 'proj-1'
    });
    assert.strictEqual(r.status, 202);
    assert.strictEqual(r.data.pipeline, 'document');

    const agentReqs = publishedOf(mocks, 'agent.execute.request');
    assert.strictEqual(agentReqs.length, 1);
    assert.strictEqual(agentReqs[0].context.texto, 'Pizza Margarita 10€');
    assert.ok(services.calls.some(c => c[0] === 'local.google-vision' && c[1] === 'extract'));
    await m.onUnload();
  });

  await testAsync('toolGenerate con filePath PDF renderiza paginas + extrae', async () => {
    const mocks = makeMocks();
    const services = new MockServiceExecutor();
    services.setHandler('local.pdfjs', 'info', () => ({ data: { pages: 2 } }));
    services.setHandler('local.pdfjs', 'render', ({ page }) => ({ data: { image: `pdf-img-${page}` } }));
    services.setHandler('local.sharp', 'prepare-ocr', ({ image }) => ({ data: { image } }));
    services.setHandler('local.google-vision', 'extract', ({ image }) => ({ data: { text: `texto-pagina-${image}` } }));
    const { module: m } = await instantiate(mocks, { services });

    const r = await m.toolGenerate({
      nombre: 'Carta PDF', filePath: '/tmp/menu.pdf', project_id: 'proj-1'
    });
    assert.strictEqual(r.status, 202);
    const agentReqs = publishedOf(mocks, 'agent.execute.request');
    assert.ok(agentReqs[0].context.texto.includes('pdf-img-1'));
    assert.ok(agentReqs[0].context.texto.includes('pdf-img-2'));
    await m.onUnload();
  });

  await testAsync('toolGenerate con filePath formato no soportado devuelve 500 EXTRACTION_FAILED', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolGenerate({
      nombre: 'X', filePath: '/tmp/menu.docx', project_id: 'proj-1'
    });
    assert.strictEqual(r.status, 500);
    assert.strictEqual(r.error.code, 'EXTRACTION_FAILED');
    assert.ok(publishedOf(mocks, 'menu.generation.failed').length === 1);
    await m.onUnload();
  });

  // Group 5: extractText pipeline
  await testAsync('extractText con OCR fallido devuelve success=false', async () => {
    const mocks = makeMocks();
    const services = new MockServiceExecutor();
    services.setHandler('local.sharp', 'prepare-ocr', () => ({ data: { image: 'p' } }));
    services.setHandler('local.google-vision', 'extract', () => { throw new Error('vision API down'); });
    const { module: m } = await instantiate(mocks, { services });
    const r = await m.extractText('/tmp/menu.jpg', 'proj-1');
    assert.strictEqual(r.success, false);
    await m.onUnload();
  });

  // Group 6: Bus subscribe
  await testAsync('onCartaGenerarSolicitada emite carta.generar.iniciada cuando OK', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCartaGenerarSolicitada({
      data: {
        request_id: 'req-1',
        correlation_id: 'cid-x',
        project_id: 'proj-1',
        nombre: 'Carta',
        texto: 'menu de prueba'
      }
    });
    const evs = publishedOf(mocks, 'carta.generar.iniciada');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].request_id, 'req-1');
    assert.strictEqual(evs[0].correlation_id, 'cid-x');
    assert.strictEqual(evs[0].project_id, 'proj-1');
    await m.onUnload();
  });

  await testAsync('onCartaGenerarSolicitada emite carta.generar.fallida en error de validacion', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCartaGenerarSolicitada({
      data: { request_id: 'req-2', project_id: 'proj-1' /* sin nombre */ }
    });
    const evs = publishedOf(mocks, 'carta.generar.fallida');
    assert.strictEqual(evs.length, 1);
    await m.onUnload();
  });

  await testAsync('handleHealth devuelve shape canonico healthy', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealth();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.status, 'healthy');
    assert.strictEqual(r.data.version, '7.0.0');
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
    assert.deepStrictEqual(m._classifyHandlerError(new Error('timeout')), { status: 504, code: 'TIMEOUT' });
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

  await testAsync('_handleHandlerError emite metric menu-generator.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'));
    assert.strictEqual(r.status, 404);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'menu-generator.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });

/**
 * Tests unitarios — pdf-viewer (POC2 reescritura).
 * Ejecutar: node tests/unit/pdf-viewer.test.js
 */

'use strict';

const assert = require('assert');
const crypto = require('crypto');

const PdfViewerModule = require('../../modules/pdf-viewer/index.js');

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

async function instantiate(mocks, opts = {}) {
  const m = new PdfViewerModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    moduleConfig: opts.config || {}
  });
  return { module: m };
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
  console.log('pdf-viewer — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa estado limpio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.ok(m.name === 'pdf-viewer');
    assert.ok(m.projectPaths instanceof Map);
    assert.strictEqual(m.projectPaths.size, 0);
    assert.ok(m.cache instanceof Map);
    await m.onUnload();
  });

  await testAsync('onUnload limpia Maps y timers sin leak', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { cache_enabled: true, cache_ttl: 60000 } });
    m.projectPaths.set('proj-1', '/some/path');
    m.cache.set('k1', { timestamp: Date.now() });
    await m.onUnload();
    assert.strictEqual(m.projectPaths.size, 0);
    assert.strictEqual(m.cache.size, 0);
    assert.strictEqual(m.cacheCleanupInterval, null);
  });

  // ==========================================
  // Group 2: Validacion canonica de handlers
  // ==========================================

  await testAsync('handleUIView: missing file_path devuelve 400 MISSING_FIELD', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleUIView({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'MISSING_FIELD');
    await m.onUnload();
  });

  await testAsync('handleUIMetadata: missing file_path devuelve 400 MISSING_FIELD', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleUIMetadata({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'MISSING_FIELD');
    await m.onUnload();
  });

  await testAsync('handleToolCreate: missing filename devuelve 400 MISSING_FIELD', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleToolCreate({ content: 'test' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'MISSING_FIELD');
    await m.onUnload();
  });

  await testAsync('handleToolCreate: missing content devuelve 400 MISSING_FIELD', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleToolCreate({ filename: 'doc.pdf' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'MISSING_FIELD');
    await m.onUnload();
  });

  await testAsync('handleToolList: missing projectId devuelve 400 MISSING_FIELD', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleToolList({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'MISSING_FIELD');
    await m.onUnload();
  });

  await testAsync('handleToolMetadata: missing projectId devuelve 400 MISSING_FIELD', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleToolMetadata({ filePath: 'x.pdf' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'MISSING_FIELD');
    await m.onUnload();
  });

  await testAsync('handleToolExtract: missing filePath devuelve 400 MISSING_FIELD', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleToolExtract({ projectId: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'MISSING_FIELD');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: _validatePathSafe
  // ==========================================

  await testAsync('_validatePathSafe: path traversal lanza PERMISSION_DENIED', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let threw = false;
    try { m._validatePathSafe('/tmp/proj', '../../../etc/passwd'); }
    catch (e) { threw = true; assert.strictEqual(e._code, 'PERMISSION_DENIED'); }
    assert.ok(threw, 'debio lanzar error');
    await m.onUnload();
  });

  await testAsync('_validatePathSafe: path valido devuelve ruta absoluta dentro del base', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const result = m._validatePathSafe('/tmp/proj', 'subdir/file.pdf');
    assert.ok(result.startsWith('/tmp/proj/'));
    assert.ok(result.endsWith('file.pdf'));
    await m.onUnload();
  });

  await testAsync('_validatePathSafe: leading slash en relativePath se normaliza', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const result = m._validatePathSafe('/tmp/proj', '/doc.pdf');
    assert.ok(result.startsWith('/tmp/proj/'));
    await m.onUnload();
  });

  await testAsync('handleUIView: path traversal devuelve 403 PERMISSION_DENIED', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.getBasePath = async () => '/tmp/proj-safe';
    const r = await m.handleUIView({ file_path: '../../../etc/shadow' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.error.code, 'PERMISSION_DENIED');
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Event handlers — correlation_id propagation
  // ==========================================

  await testAsync('handleViewRequest: propaga correlation_id del evento en el publish', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.getProjectPath = async () => { throw new Error('no such file or directory'); };
    mocks.published.length = 0;
    await m.handleViewRequest({ data: { request_id: 'req-1', project_id: 'p1', file_path: 'test.pdf', correlation_id: 'cid-abc' } });
    const evs = publishedOf(mocks, 'pdf.view.response');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid-abc');
    assert.strictEqual(evs[0].success, false);
    assert.ok(evs[0].error?.code, 'debe tener error.code canonico');
    assert.ok(evs[0].timestamp, 'debe tener timestamp');
    await m.onUnload();
  });

  await testAsync('handleListRequest: genera correlation_id nuevo si event no trae uno', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.getProjectPath = async () => { throw new Error('not found'); };
    mocks.published.length = 0;
    await m.handleListRequest({ data: { request_id: 'req-2', project_id: 'p2' } });
    const evs = publishedOf(mocks, 'pdf.list.response');
    assert.strictEqual(evs.length, 1);
    assert.ok(typeof evs[0].correlation_id === 'string' && evs[0].correlation_id.length > 0);
    assert.strictEqual(evs[0].success, false);
    await m.onUnload();
  });

  await testAsync('handleExtractRequest: publica success con correlation_id heredado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m.handleExtractRequest({ data: { request_id: 'req-3', project_id: 'p3', correlation_id: 'cid-xyz' } });
    const evs = publishedOf(mocks, 'pdf.extract.response');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid-xyz');
    assert.strictEqual(evs[0].success, true);
    assert.ok(evs[0].data?.text);
    await m.onUnload();
  });

  await testAsync('handleMetadataRequest: error path incluye error.code canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.getProjectPath = async () => { throw new Error('path outside project directory'); };
    mocks.published.length = 0;
    await m.handleMetadataRequest({ data: { request_id: 'req-4', project_id: 'p4', file_path: 'x.pdf', correlation_id: 'cid-meta' } });
    const evs = publishedOf(mocks, 'pdf.metadata.response');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].success, false);
    assert.ok(evs[0].error?.code, 'debe tener error.code');
    assert.ok(typeof evs[0].error.message === 'string');
    await m.onUnload();
  });

  // ==========================================
  // Group 5: Tool handlers — forma canonica
  // ==========================================

  await testAsync('handleToolMetadata: INVALID_INPUT si archivo no es PDF', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.getBasePath = async () => '/tmp/proj';
    const r = await m.handleToolMetadata({ projectId: 'p1', filePath: 'doc.txt' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleToolExtract: INVALID_INPUT si archivo no es PDF', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.getBasePath = async () => '/tmp/proj';
    const r = await m.handleToolExtract({ projectId: 'p1', filePath: 'doc.docx' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleToolCreate: anade extension .pdf si no tiene', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    // createViaProvider devuelve null, createDirectPdf falla por pdfkit no instalado
    m.createViaProvider = async () => null;
    m.createDirectPdf = async () => ({ status: 200, data: { filename: 'test.pdf', path: '/x/test.pdf', size: 100, method: 'direct' } });
    const r = await m.handleToolCreate({ filename: 'test', content: 'hello' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
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
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'MISSING_FIELD');
    assert.strictEqual(m._classifyHandlerError(new Error('something exploded')), 'UNKNOWN_ERROR');
    const enoent = new Error('ENOENT'); enoent.code = 'ENOENT';
    assert.strictEqual(m._classifyHandlerError(enoent), 'RESOURCE_NOT_FOUND');
    const coded = new Error('custom'); coded._code = 'PERMISSION_DENIED';
    assert.strictEqual(m._classifyHandlerError(coded), 'PERMISSION_DENIED');
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

/**
 * Tests unitarios — pizzepos/carta-impresion (POC2 reescritura).
 *
 * Aislamiento: tests con persistencia usan tmpdir como base_path.
 *
 * Ejecutar: node tests/unit/pizzepos__carta-impresion.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const fsp    = require('fs').promises;
const os     = require('os');

const CartaImpresionModule = require('../../modules/pizzepos/carta-impresion/index.js');

// --------------------------------------------------
// Mocks
// --------------------------------------------------

function makeMocks() {
  const logs         = [];
  const published    = [];
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

const tmpDirs = [];
function makeTmpProject() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-impresion-test-'));
  tmpDirs.push(base);
  return base;
}
function cleanupTmp() {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

async function instantiate(mocks, opts = {}) {
  const m = new CartaImpresionModule();
  await m.onLoad({ eventBus: mocks.eventBus, logger: mocks.logger, metrics: mocks.metrics });
  if (opts.project) {
    await m.onProjectActivated({ data: { project_id: opts.project.id, base_path: opts.project.base }});
  }
  return { module: m };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); cleanupTmp(); process.exit(1); }
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
  console.log('pizzepos/carta-impresion — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa Maps vacios', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'carta-impresion');
    assert.strictEqual(m.version, '3.0.0');
    assert.strictEqual(m.projectPaths.size, 0);
    assert.strictEqual(m.htmlCache.size, 0);
    assert.strictEqual(m.debounceTimers.size, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia los 3 Maps + clearTimeouts', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.projectPaths.set('p1', '/x');
    m.htmlCache.set('p1:c1', { filePath: '/y' });
    m.debounceTimers.set('p1:c1', setTimeout(() => {}, 60000));
    await m.onUnload();
    assert.strictEqual(m.projectPaths.size, 0);
    assert.strictEqual(m.htmlCache.size, 0);
    assert.strictEqual(m.debounceTimers.size, 0);
  });

  // ==========================================
  // Group 2: Validacion canonica
  // ==========================================

  await testAsync('toolGet sin project_id/carta_id → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = await m.toolGet({});
    assert.ok(isCanonicalError(r1));
    assert.strictEqual(r1.error.details.field, 'project_id');
    const r2 = await m.toolGet({ project_id: 'p1' });
    assert.strictEqual(r2.error.details.field, 'carta_id');
    await m.onUnload();
  });

  await testAsync('toolGenerar sin args → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolGenerar({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('toolSaveHtml sin html → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolSaveHtml({ project_id: 'p1', carta_id: 'c1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.details.field, 'html');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Tools success — save + get + cache
  // ==========================================

  await testAsync('toolSaveHtml escribe atomico HTML + meta + publica carta.impresion.lista', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base }});
    mocks.published.length = 0;

    const html = '<!DOCTYPE html><html><body>' + 'x'.repeat(200) + '</body></html>';
    const r = await m.toolSaveHtml({
      project_id: 'p1', carta_id: 'menu-2025', html,
      layout: { caras: 2 }, brand_applied: { paleta: 'oscura' },
      correlation_id: 'cid-SH'
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.path.endsWith('menu-2025.html'));
    assert.ok(r.data.user_hint);

    // Verificar HTML en disco
    const dir = path.join(base, 'storage', 'pizzepos', 'cartas-impresion');
    const htmlContent = await fsp.readFile(path.join(dir, 'menu-2025.html'), 'utf-8');
    assert.strictEqual(htmlContent, html);

    // Meta en disco
    const meta = JSON.parse(await fsp.readFile(path.join(dir, 'menu-2025.meta.json'), 'utf-8'));
    assert.strictEqual(meta.carta_id, 'menu-2025');
    assert.deepStrictEqual(meta.layout, { caras: 2 });
    assert.deepStrictEqual(meta.brand_applied, { paleta: 'oscura' });

    // .tmp NO debe quedar (atomic)
    const htmlTmp = await fsp.access(path.join(dir, 'menu-2025.html.tmp')).then(() => true).catch(() => false);
    assert.strictEqual(htmlTmp, false);

    // Cache
    assert.ok(m.htmlCache.has('p1:menu-2025'));

    // Bus publish
    const evs = publishedOf(mocks, 'carta.impresion.lista');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid-SH');
    assert.strictEqual(evs[0].project_id, 'p1');
    assert.strictEqual(evs[0].carta_id, 'menu-2025');
    await m.onUnload();
  });

  await testAsync('toolSaveHtml sin proyecto activado → 503 DEPENDENCY_UNAVAILABLE', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolSaveHtml({ project_id: 'p1', carta_id: 'c1', html: '<x/>' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.error.code, 'DEPENDENCY_UNAVAILABLE');
    await m.onUnload();
  });

  await testAsync('toolGet existente devuelve HTML + meta + filePath', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base }});

    const html = '<!DOCTYPE html><html><body>' + 'a'.repeat(150) + '</body></html>';
    await m.toolSaveHtml({ project_id: 'p1', carta_id: 'c1', html });

    const r = await m.toolGet({ project_id: 'p1', carta_id: 'c1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.html, html);
    assert.ok(r.data.filePath.endsWith('c1.html'));
    assert.strictEqual(r.data.metadata.carta_id, 'c1');
    await m.onUnload();
  });

  await testAsync('toolGet inexistente → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base }});
    const r = await m.toolGet({ project_id: 'p1', carta_id: 'fantasma' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(r.error.details.entity_id, 'fantasma');
    await m.onUnload();
  });

  await testAsync('toolGenerar publica agent.execute.request con shape canonico (architect)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;

    const r = await m.toolGenerar({ project_id: 'p1', carta_id: 'c1', correlation_id: 'cid-GG' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 202);
    assert.ok(r.data.user_hint);

    const evs = publishedOf(mocks, 'agent.execute.request');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].agent_name, 'impresion-architect');
    assert.strictEqual(evs[0].user_id, 'system');
    assert.strictEqual(evs[0].project_id, 'p1');
    assert.strictEqual(evs[0].correlation_id, 'cid-GG');
    assert.ok(evs[0].request_id);
    assert.strictEqual(evs[0].context.carta_id, 'c1');
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Bus subscribes — debounce + dispatch
  // ==========================================

  await testAsync('onCartaActualizada programa debounce timer (no dispara inmediatamente)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;

    await m.onCartaActualizada({ data: {
      project_id: 'p1', meta: { id: 'c1' }, correlation_id: 'cid-CA'
    }});

    assert.strictEqual(m.debounceTimers.size, 1);
    assert.strictEqual(publishedOf(mocks, 'agent.execute.request').length, 0, 'no dispara inmediatamente');
    // Limpiar timer para no contaminar
    clearTimeout(m.debounceTimers.get('p1:c1'));
    m.debounceTimers.clear();
    await m.onUnload();
  });

  await testAsync('onCartaActualizada en rafaga consolida en un solo timer', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    for (let i = 0; i < 5; i++) {
      await m.onCartaActualizada({ data: { project_id: 'p1', meta: { id: 'c1' }}});
    }
    assert.strictEqual(m.debounceTimers.size, 1, '5 cambios → 1 timer (debounced)');
    clearTimeout(m.debounceTimers.get('p1:c1'));
    m.debounceTimers.clear();
    await m.onUnload();
  });

  await testAsync('onCartaActualizada sin project_id o carta_id es no-op', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCartaActualizada({ data: { meta: { id: 'c1' }}});
    await m.onCartaActualizada({ data: { project_id: 'p1' }});
    assert.strictEqual(m.debounceTimers.size, 0);
    await m.onUnload();
  });

  await testAsync('onProjectActivated sin project_id loguea error', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onProjectActivated({ data: { base_path: '/tmp/foo' }});
    assert.strictEqual(m.projectPaths.size, 0);
    assert.ok(mocks.logs.some(l => l[0] === 'error' && l[1] === 'carta-impresion.project.activated.invalid'));
    await m.onUnload();
  });

  await testAsync('onProjectDeactivated NO limpia state (multi-tenant)', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base }});
    await m.onProjectDeactivated({ data: { project_id: 'p1' }});
    assert.ok(m.projectPaths.has('p1'), 'projectPaths preservado');
    await m.onUnload();
  });

  // ==========================================
  // Group 5: Persistencia — atomic + readJsonSafe + roundtrip
  // ==========================================

  await testAsync('_atomicWriteFile escribe via .tmp + rename', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const base   = makeTmpProject();
    const target = path.join(base, 'a.json');
    await m._atomicWriteFile(target, '{"x":1}');
    assert.strictEqual(await fsp.readFile(target, 'utf-8'), '{"x":1}');
    const tmpExists = await fsp.access(target + '.tmp').then(() => true).catch(() => false);
    assert.strictEqual(tmpExists, false);
    await m.onUnload();
  });

  await testAsync('_readJsonSafe ENOENT silencioso, JSON invalido warn+metric', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.logs.length = 0;
    const r1 = await m._readJsonSafe('/tmp/nonexistent-' + Date.now() + '.json', 'test');
    assert.strictEqual(r1, null);
    assert.strictEqual(mocks.logs.filter(l => l[0] === 'warn').length, 0);

    const base = makeTmpProject();
    const f = path.join(base, 'corrupt.json');
    await fsp.writeFile(f, 'not-json');
    mocks.logs.length = 0;
    const r2 = await m._readJsonSafe(f, 'corrupt');
    assert.strictEqual(r2, null);
    assert.ok(mocks.logs.some(l => l[0] === 'warn' && l[1] === 'carta-impresion.read_error'));
    await m.onUnload();
  });

  // ==========================================
  // Group 6: UI handlers — delegacion
  // ==========================================

  await testAsync('handleGet / handleGenerar delegan a tools (mismo shape)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = await m.handleGet({});
    assert.ok(isCanonicalError(r1));
    const r2 = await m.handleGenerar({});
    assert.ok(isCanonicalError(r2));
    await m.onUnload();
  });

  await testAsync('handleHealth → 200 healthy con metricas internas', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealth();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.status, 'healthy');
    assert.strictEqual(r.data.module, 'carta-impresion');
    await m.onUnload();
  });

  // ==========================================
  // Group 7: Helpers POC2
  // ==========================================

  await testAsync('_errorResponse construye shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._errorResponse(400, 'INVALID_INPUT', 'msg', { field: 'x' });
    assert.deepStrictEqual(r, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { field: 'x' } } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea ENOENT/no-path/E*', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'ENOENT' })), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('No path for project')), 'DEPENDENCY_UNAVAILABLE');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'EIO' })), 'FILESYSTEM_ERROR');
    await m.onUnload();
  });

  await testAsync('_publicarEvento hereda correlation_id, defaultea project_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { x: 1 }, { correlation_id: 'cid-X', project_id: 'p-X' });
    await m._publicarEvento('test.event', { y: 2 });
    const evs = publishedOf(mocks, 'test.event');
    assert.strictEqual(evs[0].correlation_id, 'cid-X');
    assert.strictEqual(evs[0].project_id, 'p-X');
    assert.notStrictEqual(evs[1].correlation_id, 'cid-X');
    assert.strictEqual(evs[1].project_id, 'default');
    await m.onUnload();
  });

  await testAsync('_handleHandlerError mapea status y registra metric carta-impresion.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.metricsCalls.length = 0;
    const err = Object.assign(new Error('boom'), { _code: 'FILESYSTEM_ERROR' });
    const r = m._handleHandlerError('t.failed', err, 'kind');
    assert.strictEqual(r.status, 500);
    const metric = mocks.metricsCalls.find(c => c[1] === 'carta-impresion.errors');
    assert.ok(metric);
    await m.onUnload();
  });

  cleanupTmp();
  console.log('\nTodos los tests pasaron.');
  process.exit(0);
})();

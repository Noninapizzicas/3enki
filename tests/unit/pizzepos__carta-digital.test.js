/**
 * Tests unitarios — pizzepos/carta-digital (POC2 reescritura).
 *
 * Aislamiento: tests con persistencia usan tmpdir como base_path.
 *
 * Ejecutar: node tests/unit/pizzepos__carta-digital.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const fsp    = require('fs').promises;
const os     = require('os');

const CartaDigitalModule = require('../../modules/pizzepos/carta-digital/index.js');

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
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-digital-test-'));
  tmpDirs.push(base);
  return base;
}
function cleanupTmp() {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

async function instantiate(mocks, opts = {}) {
  const m = new CartaDigitalModule();
  await m.onLoad({
    eventBus: mocks.eventBus,
    logger:   mocks.logger,
    metrics:  mocks.metrics
  });
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
  console.log('pizzepos/carta-digital — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa Maps vacios', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'carta-digital');
    assert.strictEqual(m.version, '3.0.0');
    assert.strictEqual(m.configPerProject.size, 0);
    assert.strictEqual(m.projectPaths.size, 0);
    assert.strictEqual(m.cartaCompuestaCache.size, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia los 3 Maps', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.configPerProject.set('p1', {});
    m.projectPaths.set('p1', '/x');
    m.cartaCompuestaCache.set('p1', {});
    await m.onUnload();
    assert.strictEqual(m.configPerProject.size, 0);
    assert.strictEqual(m.projectPaths.size, 0);
    assert.strictEqual(m.cartaCompuestaCache.size, 0);
  });

  // ==========================================
  // Group 2: Validacion canonica de tools
  // ==========================================

  await testAsync('toolGetConfig sin project_id → 400 INVALID_INPUT canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolGetConfig({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'project_id');
    await m.onUnload();
  });

  await testAsync('los 4 tools sin project_id devuelven 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    for (const fn of ['toolGetConfig', 'toolUpdateConfig', 'toolGetCartaPublica', 'toolSetCartaCompuesta']) {
      const r = await m[fn]({});
      assert.ok(isCanonicalError(r), `${fn} debe devolver shape canonico`);
      assert.strictEqual(r.error.code, 'INVALID_INPUT', `${fn} code`);
    }
    await m.onUnload();
  });

  await testAsync('toolSetCartaCompuesta sin carta_compuesta → 400 INVALID_INPUT (field=carta_compuesta)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolSetCartaCompuesta({ project_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.details.field, 'carta_compuesta');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Tools success — config CRUD + carta compuesta cache
  // ==========================================

  await testAsync('toolGetConfig devuelve defaultConfig cuando no hay config previa', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolGetConfig({ project_id: 'p1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.tema.color_primario, '#f59e0b');
    assert.strictEqual(r.data.funcionalidades.carrito, true);
    assert.strictEqual(r.data.moneda, '€');
    await m.onUnload();
  });

  await testAsync('toolUpdateConfig hace deep-merge de tema y funcionalidades', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base }});

    const r = await m.toolUpdateConfig({
      project_id: 'p1',
      whatsapp_telefono: '+34600000000',
      tema: { color_primario: '#ff0000' },
      funcionalidades: { whatsapp: false }
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.config.whatsapp_telefono, '+34600000000');
    // tema merged (no perdimos color_fondo)
    assert.strictEqual(r.data.config.tema.color_primario, '#ff0000');
    assert.strictEqual(r.data.config.tema.color_fondo, '#0a0a0a');
    // funcionalidades merged
    assert.strictEqual(r.data.config.funcionalidades.whatsapp, false);
    assert.strictEqual(r.data.config.funcionalidades.carrito, true);
    assert.ok(r.data.user_hint, 'user_hint presente');
    await m.onUnload();
  });

  await testAsync('toolGetCartaPublica sin cache devuelve config + carta=null', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolGetCartaPublica({ project_id: 'p1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.carta, null);
    assert.ok(r.data.config);
    assert.ok(r.data.user_hint);
    await m.onUnload();
  });

  await testAsync('toolSetCartaCompuesta + toolGetCartaPublica devuelve la carta cacheada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const cartaFinal = { items: [{ id: 'pizza', precio: 10 }], total: 10 };
    await m.toolSetCartaCompuesta({ project_id: 'p1', carta_compuesta: cartaFinal });

    const r = await m.toolGetCartaPublica({ project_id: 'p1' });
    assert.ok(isCanonicalSuccess(r));
    assert.deepStrictEqual(r.data, cartaFinal);
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Bus subscribes — invalidar cache + publicar agent.execute.request canonico
  // ==========================================

  await testAsync('onCartaActualizada invalida cache y publica agent.execute.request con shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.toolSetCartaCompuesta({ project_id: 'p1', carta_compuesta: { x: 1 }});
    assert.ok(m.cartaCompuestaCache.has('p1'));
    mocks.published.length = 0;

    await m.onCartaActualizada({ data: {
      project_id: 'p1',
      meta:       { id: 'carta-X' },
      correlation_id: 'cid-CA'
    }});

    assert.strictEqual(m.cartaCompuestaCache.has('p1'), false, 'cache invalidada');
    const evs = publishedOf(mocks, 'agent.execute.request');
    assert.strictEqual(evs.length, 1);
    const ev = evs[0];
    assert.strictEqual(ev.agent_name, 'cartadigital-composer');
    assert.strictEqual(ev.user_id,    'system');
    assert.strictEqual(ev.project_id, 'p1');
    assert.strictEqual(ev.correlation_id, 'cid-CA');
    assert.ok(ev.request_id, 'request_id presente');
    assert.ok(ev.timestamp);
    assert.strictEqual(ev.context.carta_id, 'carta-X');
    assert.ok(ev.task.includes('Recomponer'));
    await m.onUnload();
  });

  await testAsync('onTarifasActualizada invalida cache y publica agent.execute.request', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.toolSetCartaCompuesta({ project_id: 'p1', carta_compuesta: { x: 1 }});
    mocks.published.length = 0;

    await m.onTarifasActualizada({ data: { project_id: 'p1', correlation_id: 'cid-T' }});
    assert.strictEqual(m.cartaCompuestaCache.has('p1'), false);

    const evs = publishedOf(mocks, 'agent.execute.request');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid-T');
    assert.ok(evs[0].task.includes('asignacion de cartas'));
    await m.onUnload();
  });

  await testAsync('onProjectActivated sin project_id loguea error y no crashea', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onProjectActivated({ data: { base_path: '/tmp/foo' }});
    assert.strictEqual(m.projectPaths.size, 0);
    assert.ok(mocks.logs.some(l => l[0] === 'error' && l[1] === 'carta-digital.project.activated.invalid'));
    await m.onUnload();
  });

  await testAsync('onProjectActivated con metadata.is_system usa process.cwd', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onProjectActivated({ data: { project_id: 'system', metadata: { is_system: true }}});
    assert.strictEqual(m.projectPaths.get('system'), path.join(process.cwd(), 'storage', 'pizzepos'));
    await m.onUnload();
  });

  await testAsync('onProjectDeactivated NO limpia config (multi-tenant preservation)', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base }});
    await m.toolUpdateConfig({ project_id: 'p1', nombre_negocio: 'Pizzicas' });

    await m.onProjectDeactivated({ data: { project_id: 'p1' }});
    assert.ok(m.configPerProject.has('p1'));
    assert.strictEqual(m.configPerProject.get('p1').nombre_negocio, 'Pizzicas');
    await m.onUnload();
  });

  // ==========================================
  // Group 5: Persistencia — atomic write + load roundtrip
  // ==========================================

  await testAsync('toolUpdateConfig persiste atomicamente y se recupera tras reactivar proyecto', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base }});

    await m.toolUpdateConfig({ project_id: 'p1', nombre_negocio: 'Pizzicas Bar' });

    // Verificar archivo en disco
    const file = path.join(base, 'storage', 'pizzepos', 'carta-digital.json');
    const exists = await fsp.access(file).then(() => true).catch(() => false);
    assert.ok(exists, 'archivo de config persistido');
    const content = JSON.parse(await fsp.readFile(file, 'utf-8'));
    assert.strictEqual(content.nombre_negocio, 'Pizzicas Bar');
    assert.ok(content.updated_at, 'updated_at timestamp');

    // Tmp file no debe quedar (atomic write)
    const tmpExists = await fsp.access(file + '.tmp').then(() => true).catch(() => false);
    assert.strictEqual(tmpExists, false);

    // Reload: instanciar otro modulo y reactivar el proyecto
    await m.onUnload();
    const mocks2 = makeMocks();
    const m2 = new CartaDigitalModule();
    await m2.onLoad({ eventBus: mocks2.eventBus, logger: mocks2.logger, metrics: mocks2.metrics });
    await m2.onProjectActivated({ data: { project_id: 'p1', base_path: base }});
    const r = await m2.toolGetConfig({ project_id: 'p1' });
    assert.strictEqual(r.data.nombre_negocio, 'Pizzicas Bar');
    await m2.onUnload();
  });

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
    const r2 = await m._readJsonSafe(f, 'test_corrupt');
    assert.strictEqual(r2, null);
    assert.ok(mocks.logs.some(l => l[0] === 'warn' && l[1] === 'carta-digital.read_error'));
    await m.onUnload();
  });

  // ==========================================
  // Group 6: UI handlers — delegacion
  // ==========================================

  await testAsync('handleGetConfig / handleUpdateConfig / handleGetCartaPublica delegan a tools (mismo shape)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = await m.handleGetConfig({});
    assert.ok(isCanonicalError(r1));
    assert.strictEqual(r1.error.code, 'INVALID_INPUT');

    const r2 = await m.handleUpdateConfig({});
    assert.ok(isCanonicalError(r2));
    assert.strictEqual(r2.error.code, 'INVALID_INPUT');

    const r3 = await m.handleGetCartaPublica({});
    assert.ok(isCanonicalError(r3));

    const rOk = await m.handleGetCartaPublica({ project_id: 'p1' });
    assert.ok(isCanonicalSuccess(rOk));
    await m.onUnload();
  });

  await testAsync('handleHealth devuelve 200 con metricas internas', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealth();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.status, 'healthy');
    assert.strictEqual(r.data.module, 'carta-digital');
    assert.strictEqual(typeof r.data.proyectos, 'number');
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

  await testAsync('_classifyHandlerError mapea ENOENT/EACCES/E*', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'ENOENT' })), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'EACCES' })), 'PERMISSION_DENIED');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'EIO' })), 'FILESYSTEM_ERROR');
    assert.strictEqual(m._classifyHandlerError(new Error('weird')), 'UNKNOWN_ERROR');
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

  await testAsync('_handleHandlerError mapea status segun code y registra metric carta-digital.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.metricsCalls.length = 0;
    const err = Object.assign(new Error('not found'), { _code: 'RESOURCE_NOT_FOUND' });
    const r = m._handleHandlerError('t.failed', err, 'kind');
    assert.strictEqual(r.status, 404);
    const metric = mocks.metricsCalls.find(c => c[1] === 'carta-digital.errors');
    assert.ok(metric);
    await m.onUnload();
  });

  cleanupTmp();
  console.log('\nTodos los tests pasaron.');
  process.exit(0);
})();

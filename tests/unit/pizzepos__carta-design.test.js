/**
 * Tests unitarios — pizzepos/carta-design (POC2 reescritura).
 *
 * Tests aislados: cada uno crea su propio tmpdir y limpia despues.
 *
 * Ejecutar: node tests/unit/pizzepos__carta-design.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const fsp    = require('fs').promises;
const os     = require('os');

const CartaDesignModule = require('../../modules/pizzepos/carta-design/index.js');

// --------------------------------------------------
// Mock infra
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
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-design-test-'));
  tmpDirs.push(base);
  return base;
}

function cleanupTmp() {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
  }
}

async function instantiate(mocks, opts = {}) {
  const m = new CartaDesignModule();
  await m.onLoad({
    logger:   mocks.logger,
    metrics:  mocks.metrics,
    eventBus: mocks.eventBus
  });
  if (opts.project) {
    await m.onProjectActivated({ data: {
      project_id: opts.project.id,
      base_path:  opts.project.base
    }});
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

async function writeCarta(base, cartaId, carta) {
  const dir = path.join(base, 'storage', 'pizzepos', 'cartas');
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, `${cartaId}.json`), JSON.stringify(carta, null, 2), 'utf-8');
}

// ==================================================
//                                                Tests
// ==================================================

(async () => {
  console.log('pizzepos/carta-design — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa Maps vacios y carga builtinProfiles', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'carta-design');
    assert.strictEqual(m.version, '4.0.0');
    assert.ok(m.projectPaths instanceof Map);
    assert.ok(m.builtinProfiles instanceof Map);
    // los 5 perfiles built-in vienen de design-profiles/*.json del repo
    assert.ok(m.builtinProfiles.size >= 1, 'al menos un builtin profile cargado');
    await m.onUnload();
  });

  await testAsync('onUnload limpia projectPaths y builtinProfiles', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.projectPaths.set('p1', { featurePath: '/x', storagePath: '/y' });
    await m.onUnload();
    assert.strictEqual(m.projectPaths.size, 0);
    assert.strictEqual(m.builtinProfiles.size, 0);
  });

  // ==========================================
  // Group 2: Validacion canonica de tools (INVALID_INPUT)
  // ==========================================

  await testAsync('toolLoadCarta sin carta_id devuelve 400 INVALID_INPUT canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolLoadCarta({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'carta_id');
    await m.onUnload();
  });

  await testAsync('toolSave sin carta_id / sin html / con html corto → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = await m.toolSave({ html: 'x'.repeat(200) });
    assert.strictEqual(r1.error.code, 'INVALID_INPUT');
    assert.strictEqual(r1.error.details.field, 'carta_id');
    const r2 = await m.toolSave({ carta_id: 'c1' });
    assert.strictEqual(r2.error.details.field, 'html');
    const r3 = await m.toolSave({ carta_id: 'c1', html: 'too-short' });
    assert.strictEqual(r3.error.details.field, 'html');
    await m.onUnload();
  });

  await testAsync('toolSaveProfile sin nombre / toolDeleteProfile sin profile_id / toolGallery sin carta_id → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual((await m.toolSaveProfile({})).error.code, 'INVALID_INPUT');
    assert.strictEqual((await m.toolDeleteProfile({})).error.code, 'INVALID_INPUT');
    assert.strictEqual((await m.toolGallery({})).error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Tools success — load_carta + save (publica + escribe atomico)
  // ==========================================

  await testAsync('toolLoadCarta carga carta existente y agrega stats', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    await writeCarta(base, 'carta-X', {
      meta: { id: 'carta-X', nombre: 'Test' },
      categorias: [{ id: 'cat-a', nombre: 'A', orden: 1 }, { id: 'cat-b', nombre: 'B', orden: 2 }],
      productos: [
        { categoria: 'cat-a', precio: 10 },
        { categoria: 'cat-a', precio: 20 },
        { categoria: 'cat-b', precio: 5 }
      ]
    });
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base } });

    const r = await m.toolLoadCarta({ carta_id: 'carta-X', project_id: 'p1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.resumen.total_productos, 3);
    assert.strictEqual(r.data.resumen.total_categorias, 2);
    assert.strictEqual(r.data.resumen.precio_min, 5);
    assert.strictEqual(r.data.resumen.precio_max, 20);
    assert.strictEqual(r.data.resumen.categorias_stats[0].id, 'cat-a');
    assert.strictEqual(r.data.resumen.categorias_stats[0].productos_count, 2);
    await m.onUnload();
  });

  await testAsync('toolLoadCarta sobre carta inexistente devuelve 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base } });
    const r = await m.toolLoadCarta({ carta_id: 'fantasma', project_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(r.error.details.entity_type, 'carta');
    await m.onUnload();
  });

  await testAsync('toolSave escribe HTML + meta atomicos y publica carta.html.generada con correlation_id + project_id', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base } });
    mocks.published.length = 0;

    const html = '<!DOCTYPE html><html><head></head><body>' + 'x'.repeat(150) + '</body></html>';
    const r = await m.toolSave({
      carta_id: 'carta-X', html, nombre: 'Mi Diseño',
      project_id: 'p1', correlation_id: 'cid-99'
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.filename.startsWith('carta-X_'));
    assert.ok(r.data.path.startsWith('/'), 'path relativo desde storagePath');
    assert.ok(r.data.user_hint, 'user_hint en lugar de message');

    // verificar archivos en disco
    const dir = path.join(base, 'storage', 'pizzepos', 'carta-design', 'designs');
    const files = await fsp.readdir(dir);
    const htmlFile = files.find(f => f === r.data.filename);
    const metaFile = files.find(f => f === r.data.filename + '.meta.json');
    assert.ok(htmlFile, 'archivo HTML existe');
    assert.ok(metaFile, 'archivo meta existe');
    const meta = JSON.parse(await fsp.readFile(path.join(dir, metaFile), 'utf-8'));
    assert.strictEqual(meta.carta_id, 'carta-X');
    assert.strictEqual(meta.nombre, 'Mi Diseño');

    // publish enriquecido
    const evs = publishedOf(mocks, 'carta.html.generada');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid-99');
    assert.strictEqual(evs[0].project_id, 'p1');
    assert.ok(evs[0].timestamp);
    assert.strictEqual(evs[0].carta_id, 'carta-X');
    await m.onUnload();
  });

  await testAsync('toolProfiles devuelve builtin + custom combinados', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base } });

    // pre-crear perfil custom en disco
    const custDir = path.join(base, 'storage', 'pizzepos', 'carta-design', 'profiles');
    await fsp.mkdir(custDir, { recursive: true });
    await fsp.writeFile(path.join(custDir, 'custom_x.json'), JSON.stringify({ id: 'custom_x', nombre: 'X', builtin: false }, null, 2));

    const r = await m.toolProfiles({ project_id: 'p1' });
    assert.ok(isCanonicalSuccess(r));
    assert.ok(r.data.builtin.length >= 1);
    assert.strictEqual(r.data.custom.length, 1);
    assert.strictEqual(r.data.custom[0].id, 'custom_x');
    assert.strictEqual(r.data.total, r.data.builtin.length + 1);
    await m.onUnload();
  });

  await testAsync('toolSaveProfile persiste perfil y devuelve 201 + builtin:false', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base } });

    const r = await m.toolSaveProfile({
      nombre: 'Test Profile', description: 'demo',
      color_palette: { fondo: '#000' }, fonts: { titular: 'Inter' },
      project_id: 'p1'
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.id, 'custom_test_profile');
    assert.strictEqual(r.data.builtin, false);

    const dir = path.join(base, 'storage', 'pizzepos', 'carta-design', 'profiles');
    const exists = await fsp.access(path.join(dir, 'custom_test_profile.json')).then(() => true).catch(() => false);
    assert.ok(exists, 'archivo del perfil persistido');
    await m.onUnload();
  });

  await testAsync('toolGallery devuelve diseños ordenados por created_at descendente', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base } });

    // crear 2 diseños con timestamps distintos
    const html = '<!DOCTYPE html><html><body>' + 'a'.repeat(200) + '</body></html>';
    await m.toolSave({ carta_id: 'c1', html, nombre: 'old', project_id: 'p1' });
    await new Promise(r => setTimeout(r, 10));
    await m.toolSave({ carta_id: 'c1', html, nombre: 'new', project_id: 'p1' });

    const r = await m.toolGallery({ carta_id: 'c1', project_id: 'p1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.total, 2);
    assert.ok(new Date(r.data.designs[0].created_at) >= new Date(r.data.designs[1].created_at), 'orden descendente');
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Tools edge cases
  // ==========================================

  await testAsync('toolDeleteProfile sobre builtin → 403 PERMISSION_DENIED', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    // tomar el primer builtin
    const builtinId = Array.from(m.builtinProfiles.keys())[0];
    assert.ok(builtinId, 'debe haber al menos 1 builtin');

    const r = await m.toolDeleteProfile({ profile_id: builtinId });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.error.code, 'PERMISSION_DENIED');
    assert.strictEqual(r.error.details.builtin, true);
    await m.onUnload();
  });

  await testAsync('toolDeleteProfile sobre custom inexistente → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base } });
    const r = await m.toolDeleteProfile({ profile_id: 'custom_fantasma', project_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('toolDeleteProfile sobre custom existente → 200 + borra disco', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base } });

    await m.toolSaveProfile({ nombre: 'Borrame', project_id: 'p1' });
    const r = await m.toolDeleteProfile({ profile_id: 'custom_borrame', project_id: 'p1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    const dir = path.join(base, 'storage', 'pizzepos', 'carta-design', 'profiles');
    const exists = await fsp.access(path.join(dir, 'custom_borrame.json')).then(() => true).catch(() => false);
    assert.strictEqual(exists, false);
    await m.onUnload();
  });

  // ==========================================
  // Group 5: Bus subscribes
  // ==========================================

  await testAsync('onProjectActivated registra paths del proyecto', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onProjectActivated({ data: { project_id: 'p1', base_path: '/tmp/foo' } });
    const paths = m.projectPaths.get('p1');
    assert.ok(paths);
    assert.strictEqual(paths.featurePath, path.join('/tmp/foo', 'storage', 'pizzepos'));
    assert.strictEqual(paths.storagePath, path.join('/tmp/foo', 'storage'));
    await m.onUnload();
  });

  await testAsync('onProjectActivated con metadata.is_system usa process.cwd como base', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onProjectActivated({ data: { project_id: 'system', metadata: { is_system: true } } });
    const paths = m.projectPaths.get('system');
    assert.ok(paths);
    assert.strictEqual(paths.featurePath, path.join(process.cwd(), 'storage', 'pizzepos'));
    await m.onUnload();
  });

  await testAsync('onProjectActivated sin project_id loguea error y no crashea', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onProjectActivated({ data: { base_path: '/tmp/foo' } });
    assert.strictEqual(m.projectPaths.size, 0);
    const errs = mocks.logs.filter(l => l[0] === 'error' && /invalid/.test(l[1]));
    assert.ok(errs.length >= 1);
    await m.onUnload();
  });

  await testAsync('onProjectDeactivated elimina paths', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onProjectActivated({ data: { project_id: 'p1', base_path: '/tmp/foo' } });
    await m.onProjectDeactivated({ data: { project_id: 'p1' } });
    assert.strictEqual(m.projectPaths.has('p1'), false);
    await m.onUnload();
  });

  await testAsync('onCartaActualizada loguea con project_id + carta_id (rename del handler)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.logs.length = 0;
    await m.onCartaActualizada({ data: { project_id: 'p1', meta: { id: 'carta-Y' } } });
    const log = mocks.logs.find(l => l[1] === 'carta-design.carta.updated');
    assert.ok(log);
    assert.strictEqual(log[2].project_id, 'p1');
    assert.strictEqual(log[2].carta_id, 'carta-Y');
    await m.onUnload();
  });

  // ==========================================
  // Group 6: Persistencia atomica + lectura segura
  // ==========================================

  await testAsync('_atomicWriteFile escribe via .tmp + rename y deja contenido final', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const base = makeTmpProject();
    const target = path.join(base, 'a.txt');
    await m._atomicWriteFile(target, 'hola');
    const content = await fsp.readFile(target, 'utf-8');
    assert.strictEqual(content, 'hola');
    // .tmp no debe quedar
    const tmpExists = await fsp.access(target + '.tmp').then(() => true).catch(() => false);
    assert.strictEqual(tmpExists, false);
    await m.onUnload();
  });

  await testAsync('_readJsonSafe devuelve null silenciosamente si ENOENT (sin spam de logs)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.logs.length = 0;
    const r = await m._readJsonSafe('/tmp/nonexistent-' + Date.now() + '.json', 'test');
    assert.strictEqual(r, null);
    const warnLogs = mocks.logs.filter(l => l[0] === 'warn');
    assert.strictEqual(warnLogs.length, 0, 'ENOENT NO debe loguear warn');
    await m.onUnload();
  });

  await testAsync('_readJsonSafe loguea warn + metric en JSON invalido (no swallow)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const base = makeTmpProject();
    const f = path.join(base, 'corrupt.json');
    await fsp.writeFile(f, 'not-json');
    mocks.logs.length = 0; mocks.metricsCalls.length = 0;
    const r = await m._readJsonSafe(f, 'test_corrupt');
    assert.strictEqual(r, null);
    assert.ok(mocks.logs.some(l => l[0] === 'warn' && l[1] === 'carta-design.read_error'));
    assert.ok(mocks.metricsCalls.some(c => c[1] === 'carta-design.errors'));
    await m.onUnload();
  });

  // ==========================================
  // Group 7: Helpers POC2 internos
  // ==========================================

  await testAsync('_errorResponse construye shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._errorResponse(400, 'INVALID_INPUT', 'msg', { field: 'x' });
    assert.deepStrictEqual(r, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { field: 'x' } } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea ENOENT/EACCES/EEXIST y mensajes', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'ENOENT' })), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'EACCES' })), 'PERMISSION_DENIED');
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'EEXIST' })), 'ALREADY_EXISTS');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('weird')), 'INTERNAL_ERROR');
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'EIO' })), 'FILESYSTEM_ERROR');
    await m.onUnload();
  });

  await testAsync('_publicarEvento hereda correlation_id + project_id, defaultea a "default"', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { x: 1 }, { correlation_id: 'cid-Z', project_id: 'p-Z' });
    await m._publicarEvento('test.event', { y: 2 });
    const evs = publishedOf(mocks, 'test.event');
    assert.strictEqual(evs[0].correlation_id, 'cid-Z');
    assert.strictEqual(evs[0].project_id, 'p-Z');
    assert.notStrictEqual(evs[1].correlation_id, 'cid-Z');
    assert.strictEqual(evs[1].project_id, 'default');
    assert.ok(evs[0].timestamp && evs[1].timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError con ENOENT mapea a 404 RESOURCE_NOT_FOUND y registra metric', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.metricsCalls.length = 0;
    const err = Object.assign(new Error('file not found'), { code: 'ENOENT' });
    const r = m._handleHandlerError('t.failed', err, 'kind');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    const metric = mocks.metricsCalls.find(c => c[1] === 'carta-design.errors');
    assert.ok(metric, 'metric carta-design.errors registrada');
    assert.strictEqual(metric[2].kind, 'kind');
    await m.onUnload();
  });

  // ==========================================
  // UI handlers son delegacion pura
  // ==========================================

  await testAsync('handleLoadCarta delega a toolLoadCarta (mismo shape)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleLoadCarta({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  cleanupTmp();
  console.log('\nTodos los tests pasaron.');
})();

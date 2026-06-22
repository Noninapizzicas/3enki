/**
 * Tests unitarios — filesystem v2.0.0 (POC2 #12 reescritura).
 *
 * Foco:
 *  - Lifecycle (onLoad ensures basePath; onUnload limpia state).
 *  - Validacion canonica de UI/tool handlers → { status, error: { code, message, details } }.
 *  - CRUD: write/read/delete/mkdir/move/copy/append/info/list/stats/search/cleanup.
 *  - Path security: 404/403 con codes canonicos (RESOURCE_NOT_FOUND / PERMISSION_DENIED).
 *  - Bus handlers fs.*.request → fs.*.response correlacionados por request_id + correlation_id.
 *  - Spanish handlers archivo.*.solicitado.
 *  - Project lifecycle (onProjectActivated cambia working directory).
 *  - Eventos publicados (fs.file.created/updated/deleted, fs.directory.created, fs.workdir.changed).
 *  - Helpers POC2.
 *  - Aislamiento: basePath en os.tmpdir, sin tocar el repo real.
 *
 * Ejecutar: node tests/unit/filesystem.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const FilesystemModule = require('../../modules/filesystem/index.js');

// --------------------------------------------------
// Mock infra + tmpdir helpers
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

function makeTmpDir() {
  const tmpDir = path.join(os.tmpdir(), `fs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fsSync.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

async function instantiate(mocks, opts = {}) {
  const tmpDir = opts.basePath || makeTmpDir();
  const m = new FilesystemModule();
  m.basePath = tmpDir; // override antes de onLoad
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    moduleConfig: {}
  });
  return { module: m, tmpDir };
}

async function cleanup(p) {
  try { await fs.rm(p, { recursive: true, force: true }); } catch {}
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
  console.log('filesystem — reescritura canonica v2.0.0 (POC2 #12)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa state limpio + ensure basePath', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    assert.strictEqual(m.activeProjectId, null);
    assert.strictEqual(m.activeProjectPath, null);
    assert.strictEqual(m.workingDirectory, null);
    assert.strictEqual(m.systemMode, false);
    assert.ok(fsSync.existsSync(tmpDir));
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('onUnload limpia state del proyecto activo', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    m.activeProjectId = 'p1';
    m.activeProjectPath = '/x';
    m.workingDirectory = '/x';
    m.systemMode = true;
    await m.onUnload();
    assert.strictEqual(m.activeProjectId, null);
    assert.strictEqual(m.activeProjectPath, null);
    assert.strictEqual(m.workingDirectory, null);
    assert.strictEqual(m.systemMode, false);
    await cleanup(tmpDir);
  });

  // ==========================================
  // Group 2: Validacion canonica de handlers
  // ==========================================

  await testAsync('handleRead sin path → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.handleRead({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('handleWrite sin content → 400 INVALID_INPUT + field=content', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.handleWrite({ path: '/x.txt' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.details.field, 'content');
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('handleDelete root path → 403 PERMISSION_DENIED', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.handleDelete({ path: '/' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.error.code, 'PERMISSION_DENIED');
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('handleRead path inexistente → 404 RESOURCE_NOT_FOUND canonico', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.handleRead({ path: '/no-existe.txt' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(r.error.details.entity_type, 'file');
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('handleSearch sin query → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.handleSearch({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  // ==========================================
  // Group 3: CRUD operations
  // ==========================================

  await testAsync('handleWrite + handleRead round-trip', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);

    const w = await m.handleWrite({ path: '/hola.txt', content: 'mundo' });
    assert.ok(isCanonicalSuccess(w));
    assert.strictEqual(w.status, 201);
    assert.strictEqual(w.data.created, true);

    const r = await m.handleRead({ path: '/hola.txt' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.content, 'mundo');
    assert.strictEqual(r.data.encoding, 'utf-8');
    assert.strictEqual(r.data.type, 'text');

    const created = publishedOf(mocks, 'fs.file.created');
    assert.strictEqual(created.length, 1);
    assert.ok(created[0].correlation_id);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('handleWrite a archivo existente → 200 + fs.file.updated', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    await m.handleWrite({ path: '/hola.txt', content: 'v1' });
    mocks.published.length = 0;

    const r = await m.handleWrite({ path: '/hola.txt', content: 'v2' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.created, false);
    const updated = publishedOf(mocks, 'fs.file.updated');
    assert.strictEqual(updated.length, 1);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('handleMkdir crea directorio + fs.directory.created', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.handleMkdir({ path: '/sub/nested' });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.created, true);
    const created = publishedOf(mocks, 'fs.directory.created');
    assert.strictEqual(created.length, 1);
    assert.ok(fsSync.existsSync(path.join(tmpDir, 'sub/nested')));
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('handleDelete file + fs.file.deleted', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    await m.handleWrite({ path: '/borrar.txt', content: 'x' });
    mocks.published.length = 0;

    const r = await m.handleDelete({ path: '/borrar.txt' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.deleted, true);
    assert.strictEqual(r.data.type, 'file');
    const ev = publishedOf(mocks, 'fs.file.deleted');
    assert.strictEqual(ev.length, 1);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('handleDelete inexistente → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.handleDelete({ path: '/no-existe' });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('handleMove + handleCopy round-trip', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    await m.handleWrite({ path: '/a.txt', content: 'foo' });

    const cp = await m.handleCopy({ from: '/a.txt', to: '/b.txt' });
    assert.strictEqual(cp.status, 200);
    assert.strictEqual(cp.data.copied, true);

    const mv = await m.handleMove({ from: '/b.txt', to: '/c.txt' });
    assert.strictEqual(mv.status, 200);
    assert.strictEqual(mv.data.moved, true);

    const r = await m.handleRead({ path: '/c.txt' });
    assert.strictEqual(r.data.content, 'foo');
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('handleAppend anyade contenido al final', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    await m.handleWrite({ path: '/log.txt', content: 'line1\n' });

    const r = await m.handleAppend({ path: '/log.txt', content: 'line2\n' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.appended, true);

    const read = await m.handleRead({ path: '/log.txt' });
    assert.strictEqual(read.data.content, 'line1\nline2\n');
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('handleList devuelve files[] ordenados (directorios primero)', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    await m.handleWrite({ path: '/file-z.txt', content: 'z' });
    await m.handleMkdir({ path: '/dir-a' });
    await m.handleWrite({ path: '/file-a.txt', content: 'a' });

    const r = await m.handleList({ path: '/' });
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.files.length >= 3);
    assert.strictEqual(r.data.files[0].type, 'directory');
    assert.strictEqual(r.data.files[0].name, 'dir-a');
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('handleInfo devuelve metadata del archivo', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    await m.handleWrite({ path: '/x.txt', content: 'abc' });

    const r = await m.handleInfo({ path: '/x.txt' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.type, 'file');
    assert.strictEqual(r.data.size, 3);
    assert.ok(r.data.modified);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  // ==========================================
  // Group 4: Path security
  // ==========================================

  await testAsync('validatePath rechaza path traversal con PERMISSION_DENIED', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    let caught = null;
    try { m.validatePath('../../../etc/passwd'); } catch (e) { caught = e; }
    assert.ok(caught);
    assert.strictEqual(caught._code, 'PERMISSION_DENIED');
    assert.strictEqual(caught._details.kind, 'path_traversal');
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('handleRead con path traversal → 403 PERMISSION_DENIED canonico', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.handleRead({ path: '../../etc/passwd' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.error.code, 'PERMISSION_DENIED');
    await m.onUnload();
    await cleanup(tmpDir);
  });

  // ==========================================
  // Group 5: Bus handlers (request → response)
  // ==========================================

  await testAsync('onWriteRequest publica fs.write.response success + correlation_id propagado', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    mocks.published.length = 0;

    await m.onWriteRequest({
      data: { request_id: 'r1', correlation_id: 'cid-abc',
              path: '/bus.txt', content: 'foo' }
    });
    const resp = publishedOf(mocks, 'fs.write.response')[0];
    assert.ok(resp);
    assert.strictEqual(resp.request_id, 'r1');
    assert.strictEqual(resp.correlation_id, 'cid-abc');
    assert.strictEqual(resp.created, true);
    assert.ok(!resp.error);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('onReadRequest a inexistente publica fs.read.response con error canonico', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    mocks.published.length = 0;

    await m.onReadRequest({ data: { request_id: 'r2', path: '/no-existe.txt' } });
    const resp = publishedOf(mocks, 'fs.read.response')[0];
    assert.ok(resp);
    assert.strictEqual(resp.request_id, 'r2');
    assert.ok(resp.error);
    assert.strictEqual(resp.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('onExistsRequest path inexistente → exists:false (no error)', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    mocks.published.length = 0;

    await m.onExistsRequest({ data: { request_id: 'r3', path: '/no-existe' } });
    const resp = publishedOf(mocks, 'fs.exists.response')[0];
    assert.strictEqual(resp.exists, false);
    assert.strictEqual(resp.path, '/no-existe');
    assert.ok(!resp.error);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('onExistsRequest path existente → exists:true + type', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    await m.handleWrite({ path: '/x.txt', content: 'x' });
    mocks.published.length = 0;

    await m.onExistsRequest({ data: { request_id: 'r4', path: '/x.txt' } });
    const resp = publishedOf(mocks, 'fs.exists.response')[0];
    assert.strictEqual(resp.exists, true);
    assert.strictEqual(resp.type, 'file');
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('onArchivoListarSolicitado publica archivo.listado', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    await m.handleWrite({ path: '/a.txt', content: 'a' });
    mocks.published.length = 0;

    await m.onArchivoListarSolicitado({
      data: { request_id: 'r5', project_id: 'p1', path: '/' }
    });
    const resp = publishedOf(mocks, 'archivo.listado')[0];
    assert.ok(resp);
    assert.strictEqual(resp.request_id, 'r5');
    assert.strictEqual(resp.project_id, 'p1');
    assert.ok(Array.isArray(resp.files));
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('onArchivoLeerSolicitado a inexistente publica archivo.leer.fallido', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    mocks.published.length = 0;

    await m.onArchivoLeerSolicitado({
      data: { request_id: 'r6', project_id: 'p1', path: '/no-existe.txt' }
    });
    const resp = publishedOf(mocks, 'archivo.leer.fallido')[0];
    assert.ok(resp);
    assert.ok(resp.error);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  // ==========================================
  // Group 6: Project lifecycle + workdir
  // ==========================================

  await testAsync('onProjectActivated cambia working directory al storage del proyecto', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);

    const projDir = path.join(tmpDir, 'projects', 'p1');
    fsSync.mkdirSync(projDir, { recursive: true });
    await m.onProjectActivated({
      data: { project_id: 'p1', base_path: projDir, name: 'P1' }
    });
    assert.strictEqual(m.activeProjectId, 'p1');
    assert.strictEqual(m.activeProjectPath, path.join(projDir, 'storage'));
    assert.strictEqual(m.workingDirectory, path.join(projDir, 'storage'));
    assert.strictEqual(m.systemMode, false);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('onProjectActivated con metadata.is_system=true → systemMode + cwd', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);

    await m.onProjectActivated({
      data: { project_id: 'sys', name: 'Sistema', metadata: { is_system: true } }
    });
    assert.strictEqual(m.systemMode, true);
    assert.strictEqual(m.activeProjectPath, process.cwd());
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('MULTI-TENANT: el project_id de la petición manda sobre el proyecto activo', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);

    const dirA = path.join(tmpDir, 'projects', 'A');
    const dirB = path.join(tmpDir, 'projects', 'B');
    fsSync.mkdirSync(dirA, { recursive: true });
    fsSync.mkdirSync(dirB, { recursive: true });
    // Activo A, luego B → B queda como "proyecto activo" global.
    await m.onProjectActivated({ data: { project_id: 'A', base_path: dirA, name: 'A' } });
    await m.onProjectActivated({ data: { project_id: 'B', base_path: dirB, name: 'B' } });
    assert.strictEqual(m.activeProjectId, 'B');

    // Escribo con project_id A AUNQUE el activo es B → debe caer en el storage de A.
    const w = await m.handleWrite({ path: '/f.txt', content: 'soy-A', project_id: 'A' });
    assert.strictEqual(w.status, 201);
    // En disco: el fichero está en A, NO en B (esto es lo que antes se pisaba).
    assert.ok(fsSync.existsSync(path.join(dirA, 'storage', 'f.txt')), 'el fichero está en A');
    assert.ok(!fsSync.existsSync(path.join(dirB, 'storage', 'f.txt')), 'NO está en B (el activo)');

    // Leo con project_id A → lo encuentra; con B → 404 (aislamiento real).
    const rA = await m.handleRead({ path: '/f.txt', project_id: 'A' });
    assert.strictEqual(rA.status, 200);
    assert.strictEqual(rA.data.content, 'soy-A');
    const rB = await m.handleRead({ path: '/f.txt', project_id: 'B' });
    assert.strictEqual(rB.status, 404);

    // Sin project_id → fallback al proyecto activo (B), retrocompat.
    const wActive = await m.handleWrite({ path: '/g.txt', content: 'activo' });
    assert.strictEqual(wActive.status, 201);
    assert.ok(fsSync.existsSync(path.join(dirB, 'storage', 'g.txt')), 'sin project_id usa el activo (B)');

    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('handleSetWorkDir cambia working directory + publica fs.workdir.changed', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    await m.handleMkdir({ path: '/work' });
    mocks.published.length = 0;

    const r = await m.handleSetWorkDir({ path: '/work' });
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.working_directory);
    const ev = publishedOf(mocks, 'fs.workdir.changed');
    assert.strictEqual(ev.length, 1);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('handleGetWorkDir devuelve info del workdir + project context', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.handleGetWorkDir();
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.is_project_context, false);
    assert.ok(r.data.working_directory);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  // ==========================================
  // Group 7: Helpers POC2 internos
  // ==========================================

  await testAsync('_errorResponse construye shape canonico { status, error: { code, message, details? } }', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r1 = m._errorResponse(400, 'INVALID_INPUT', 'msg', { field: 'x' });
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { field: 'x' } } });
    const r2 = m._errorResponse(500, 'UNKNOWN_ERROR', 'oops');
    assert.deepStrictEqual(r2, { status: 500, error: { code: 'UNKNOWN_ERROR', message: 'oops' } });
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('_classifyHandlerError mapea ENOENT/EACCES/EEXIST/messages a codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'ENOENT' })), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'EACCES' })), 'PERMISSION_DENIED');
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'EEXIST' })), 'CONFLICT_STATE');
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'EISDIR' })), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('something exploded')), 'UNKNOWN_ERROR');
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('_publicarEvento hereda correlation_id si se pasa, genera uno nuevo si no', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { foo: 1 }, { correlation_id: 'cid-inherit' });
    await m._publicarEvento('test.event', { bar: 2 });
    const evs = publishedOf(mocks, 'test.event');
    assert.strictEqual(evs.length, 2);
    assert.strictEqual(evs[0].correlation_id, 'cid-inherit');
    assert.notStrictEqual(evs[1].correlation_id, 'cid-inherit');
    assert.ok(evs[0].timestamp && evs[1].timestamp);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('_handleHandlerError mapea status segun code y registra metric', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const err = Object.assign(new Error('not found'), { _code: 'RESOURCE_NOT_FOUND' });
    const r = m._handleHandlerError('test.failed', err, 'kind');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'filesystem.errors');
    assert.ok(errMetric);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  // ==========================================
  // Group X: Versionado optimista CAS (Critica 1)
  // ==========================================

  await testAsync('handleRead devuelve hash SHA-256 hex valido en text', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    await m.handleWrite({ path: '/cas-text.json', content: '{"a":1}' });
    const r = await m.handleRead({ path: '/cas-text.json' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(typeof r.data.hash, 'string');
    assert.strictEqual(r.data.hash.length, 64, 'sha256 hex length');
    assert.ok(/^[a-f0-9]{64}$/.test(r.data.hash), 'hex format');
    // hash determinista del contenido conocido
    const expected = crypto.createHash('sha256').update('{"a":1}', 'utf-8').digest('hex');
    assert.strictEqual(r.data.hash, expected);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('handleWrite con expected_hash correcto pasa y devuelve nuevo hash', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    await m.handleWrite({ path: '/cas-ok.json', content: 'v1' });
    const read1 = await m.handleRead({ path: '/cas-ok.json' });
    const w2 = await m.handleWrite({
      path: '/cas-ok.json',
      content: 'v2',
      expected_hash: read1.data.hash
    });
    assert.ok(isCanonicalSuccess(w2), 'write con expected_hash correcto pasa');
    assert.strictEqual(w2.data.created, false);
    assert.strictEqual(typeof w2.data.hash, 'string', 'response trae nuevo hash');
    assert.notStrictEqual(w2.data.hash, read1.data.hash, 'hash cambia tras write');
    // verificar persistencia
    const read2 = await m.handleRead({ path: '/cas-ok.json' });
    assert.strictEqual(read2.data.content, 'v2');
    assert.strictEqual(read2.data.hash, w2.data.hash);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('handleWrite con expected_hash incorrecto devuelve CONFLICT_STATE', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    await m.handleWrite({ path: '/cas-conflict.json', content: 'original' });
    const result = await m.handleWrite({
      path: '/cas-conflict.json',
      content: 'should-not-persist',
      expected_hash: 'a'.repeat(64) // hash ficticio
    });
    assert.ok(isCanonicalError(result), 'response es error canonico');
    assert.strictEqual(result.status, 409);
    assert.strictEqual(result.error.code, 'CONFLICT_STATE');
    assert.strictEqual(result.error.details.expected_hash, 'a'.repeat(64));
    assert.strictEqual(typeof result.error.details.current_hash, 'string');
    // verificar que el archivo NO se sobrescribio
    const verify = await m.handleRead({ path: '/cas-conflict.json' });
    assert.strictEqual(verify.data.content, 'original');
    // metric registrada
    const conflictMetric = mocks.metricsCalls.find(c =>
      c[1] === 'filesystem.write.cas_conflict' && c[2]?.reason === 'hash_mismatch'
    );
    assert.ok(conflictMetric, 'metric cas_conflict registrada');
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('handleWrite sin expected_hash funciona como antes (silent allow)', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    await m.handleWrite({ path: '/cas-no-hash.json', content: 'a' });
    const result = await m.handleWrite({ path: '/cas-no-hash.json', content: 'b' });
    assert.ok(isCanonicalSuccess(result), 'write sobrescribe sin verificar');
    const verify = await m.handleRead({ path: '/cas-no-hash.json' });
    assert.strictEqual(verify.data.content, 'b');
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('handleWrite con expected_hash en archivo inexistente devuelve CONFLICT_STATE', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const result = await m.handleWrite({
      path: '/cas-missing.json',
      content: 'cualquier',
      expected_hash: 'b'.repeat(64)
    });
    assert.ok(isCanonicalError(result));
    assert.strictEqual(result.status, 409);
    assert.strictEqual(result.error.code, 'CONFLICT_STATE');
    assert.strictEqual(result.error.details.current_hash, null,
      'current_hash es null cuando archivo no existe');
    const conflictMetric = mocks.metricsCalls.find(c =>
      c[1] === 'filesystem.write.cas_conflict' && c[2]?.reason === 'file_missing'
    );
    assert.ok(conflictMetric);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  // ── handleServeFile (HTTP: sirve imágenes del storage) ──

  await testAsync('handleServeFile sin path → 400 INVALID_INPUT (shape gateway: data.error)', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.handleServeFile({ query: {} });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.data.error.code, 'INVALID_INPUT');
    await m.onUnload(); await cleanup(tmpDir);
  });

  await testAsync('handleServeFile a NO-imagen (json) → 403 (no expone datos del proyecto)', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.handleServeFile({ query: { path: '/pizzepos/recetas.json' } });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.data.error.code, 'PERMISSION_DENIED');
    await m.onUnload(); await cleanup(tmpDir);
  });

  await testAsync('handleServeFile round-trip: write png base64 → sirve body Buffer + content-type', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    await m.handleWrite({ path: '/img/p1.png', content: png1x1, encoding: 'base64' });
    const r = await m.handleServeFile({ query: { path: '/img/p1.png' } });
    assert.strictEqual(r.status, 200);
    assert.ok(Buffer.isBuffer(r.body), 'el body es un Buffer (binario)');
    assert.strictEqual(r.headers['Content-Type'], 'image/png');
    assert.strictEqual(r.body.toString('base64'), png1x1, 'los bytes coinciden con el original');
    await m.onUnload(); await cleanup(tmpDir);
  });

  await testAsync('handleServeFile imagen inexistente → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.handleServeFile({ query: { path: '/img/falta.jpg' } });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.data.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload(); await cleanup(tmpDir);
  });

  console.log('\nTodos los tests pasaron.');
})();

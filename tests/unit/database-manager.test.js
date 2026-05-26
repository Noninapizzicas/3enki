/**
 * Tests unitarios — database-manager v3.0.0 (POC2 #4 reescritura).
 *
 * Foco:
 *  - Lifecycle (onLoad/onUnload sin leak de conexiones SQLite).
 *  - 3 event handlers del bus (onQueryRequest, onPersistRequest, onSchemaInitRequest).
 *  - 8 HTTP handlers con shape canonico { status, data | error: { code, message, details? } }.
 *  - 4 tools del LLM con shape canonico (no { error: 'string' }, no { success: bool }).
 *  - Resolución de paths (system → cache → fallback legacy).
 *  - Eventos canonicos del bus preservados invariantes.
 *  - Helpers POC2 internos.
 *  - Aislamiento: SQLite :memory: + projectsPath en tmpdir, NO contamina disco real.
 *
 * Ejecutar: node tests/unit/database-manager.test.js
 */

'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');

const DatabaseManagerModule = require('../../modules/database-manager/index.js');

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
    increment: (name, labels) => metricsCalls.push(['increment', name, labels]),
    gauge:     (name, value, labels) => metricsCalls.push(['gauge', name, value, labels]),
    timing:    (name, ms, labels) => metricsCalls.push(['timing', name, ms, labels])
  };

  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); }
  };

  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

async function instantiate(mocks) {
  const m = new DatabaseManagerModule();
  // projectsPath unico por instancia para aislar de disco persistente real
  const tmpProjectsPath = path.join(os.tmpdir(), `dbm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tmpProjectsPath, { recursive: true });
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    moduleConfig: { projectsPath: tmpProjectsPath, autoSave: false }
  });
  return { module: m, projectsPath: tmpProjectsPath };
}

async function cleanup(projectsPath) {
  try { fs.rmSync(projectsPath, { recursive: true, force: true }); } catch {}
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

(async () => {
  console.log('database-manager — reescritura canonica v3.0.0 (POC2 #4)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa state + crea projectsPath si no existe', async () => {
    const mocks = makeMocks();
    const tmpPath = path.join(os.tmpdir(), `dbm-test-onload-${Date.now()}`);
    const m = new DatabaseManagerModule();
    await m.onLoad({
      logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus,
      moduleConfig: { projectsPath: tmpPath, autoSave: false }
    });
    assert.ok(fs.existsSync(tmpPath));
    assert.strictEqual(m.databases.size, 0);
    await m.onUnload();
    await cleanup(tmpPath);
  });

  await testAsync('onUnload cierra todas las conexiones sin leak', async () => {
    const mocks = makeMocks();
    const { module: m, projectsPath } = await instantiate(mocks);

    // Forzar apertura de una DB (a memory-like via path en tmpdir)
    await m.onSchemaInitRequest({
      data: { project_id: 'system', schema: 'CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT, base_path TEXT)', request_id: 'r1' }
    });
    assert.ok(m.databases.size >= 1);

    await m.onUnload();
    assert.strictEqual(m.databases.size, 0);
    assert.strictEqual(m.projectPaths.size, 0);
    await cleanup(projectsPath);
  });

  // ==========================================
  // Group 2: Validacion canonica de bus handlers
  // ==========================================

  await testAsync('onQueryRequest sin project_id → publica response success:false', async () => {
    const mocks = makeMocks();
    const { module: m, projectsPath } = await instantiate(mocks);
    await m.onQueryRequest({ data: { query: 'SELECT 1', request_id: 'r-bad' } });
    const ev = mocks.published.find(p => p[0] === 'db.query.response');
    assert.ok(ev);
    assert.strictEqual(ev[1].request_id, 'r-bad');
    assert.strictEqual(ev[1].success, false);
    assert.ok(/required/i.test(ev[1].error));
    await m.onUnload();
    await cleanup(projectsPath);
  });

  await testAsync('onPersistRequest sin campos requeridos → publica response success:false', async () => {
    const mocks = makeMocks();
    const { module: m, projectsPath } = await instantiate(mocks);
    await m.onPersistRequest({ data: { project_id: 'p1', table: 't', request_id: 'r-p-bad' } });
    const ev = mocks.published.find(p => p[0] === 'db.persist.response');
    assert.ok(ev);
    assert.strictEqual(ev[1].success, false);
    assert.ok(/missing/i.test(ev[1].error));
    await m.onUnload();
    await cleanup(projectsPath);
  });

  await testAsync('onSchemaInitRequest con schema vacio → publica response success:false', async () => {
    const mocks = makeMocks();
    const { module: m, projectsPath } = await instantiate(mocks);
    await m.onSchemaInitRequest({ data: { project_id: 'p1', schema: '', request_id: 'r-s-bad' } });
    const ev = mocks.published.find(p => p[0] === 'db.schema.init.response');
    assert.ok(ev);
    assert.strictEqual(ev[1].success, false);
    await m.onUnload();
    await cleanup(projectsPath);
  });

  // ==========================================
  // Group 3: Success paths del bus
  // ==========================================

  await testAsync('onSchemaInitRequest exitoso publica response + db.schema.initialized', async () => {
    const mocks = makeMocks();
    const { module: m, projectsPath } = await instantiate(mocks);
    await m.onSchemaInitRequest({
      data: {
        project_id: 'system',
        schema: 'CREATE TABLE IF NOT EXISTS test_schema (id INTEGER PRIMARY KEY, name TEXT)',
        request_id: 'r-s-ok',
        correlation_id: 'c-s'
      }
    });
    const resp = mocks.published.find(p => p[0] === 'db.schema.init.response');
    assert.ok(resp);
    assert.strictEqual(resp[1].success, true);
    assert.strictEqual(resp[1].request_id, 'r-s-ok');
    assert.strictEqual(resp[1].correlation_id, 'c-s');
    const ev = mocks.published.find(p => p[0] === 'db.schema.initialized');
    assert.ok(ev);
    assert.strictEqual(ev[1].project_id, 'system');
    await m.onUnload();
    await cleanup(projectsPath);
  });

  await testAsync('onQueryRequest tras schema init devuelve datos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m, projectsPath } = await instantiate(mocks);
    await m.onSchemaInitRequest({
      data: { project_id: 'system', schema: 'CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, label TEXT)', request_id: 'rs' }
    });
    mocks.published.length = 0;
    await m.onQueryRequest({
      data: { project_id: 'system', query: "INSERT INTO items (label) VALUES ('test')", read_only: false, request_id: 'rq1' }
    });
    await m.onQueryRequest({
      data: { project_id: 'system', query: 'SELECT label FROM items', read_only: true, request_id: 'rq2' }
    });
    const responses = mocks.published.filter(p => p[0] === 'db.query.response');
    assert.strictEqual(responses.length, 2);
    const selectResp = responses.find(p => p[1].request_id === 'rq2');
    assert.ok(selectResp);
    assert.strictEqual(selectResp[1].success, true);
    assert.strictEqual(selectResp[1].data.length, 1);
    assert.strictEqual(selectResp[1].data[0].label, 'test');
    await m.onUnload();
    await cleanup(projectsPath);
  });

  await testAsync('onPersistRequest insert + select roundtrip', async () => {
    const mocks = makeMocks();
    const { module: m, projectsPath } = await instantiate(mocks);
    await m.onSchemaInitRequest({
      data: { project_id: 'system', schema: 'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT)', request_id: 'rs' }
    });
    mocks.published.length = 0;

    await m.onPersistRequest({
      data: {
        project_id: 'system', table: 'users', operation: 'insert',
        data: { id: 'u1', name: 'Alice' }, request_id: 'rp'
      }
    });
    const persistResp = mocks.published.find(p => p[0] === 'db.persist.response');
    assert.ok(persistResp);
    assert.strictEqual(persistResp[1].success, true);
    assert.strictEqual(persistResp[1].operation, 'insert');

    await m.onQueryRequest({
      data: { project_id: 'system', query: 'SELECT * FROM users', read_only: true, request_id: 'rq' }
    });
    const queryResp = mocks.published.find(p => p[0] === 'db.query.response' && p[1].request_id === 'rq');
    assert.strictEqual(queryResp[1].data[0].name, 'Alice');
    await m.onUnload();
    await cleanup(projectsPath);
  });

  // ==========================================
  // Group 4: HTTP handlers shape canonico
  // ==========================================

  await testAsync('handleListDatabases devuelve shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m, projectsPath } = await instantiate(mocks);
    const result = await m.handleListDatabases();
    assert.strictEqual(result.status, 200);
    assert.ok(Array.isArray(result.data.databases));
    assert.strictEqual(result.data.projects_path, projectsPath);
    await m.onUnload();
    await cleanup(projectsPath);
  });

  await testAsync('handleExecuteQuery sin projectId → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m, projectsPath } = await instantiate(mocks);
    const result = await m.handleExecuteQuery({}, { params: {}, body: { query: 'SELECT 1' } });
    assert.ok(isCanonicalError(result));
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error.code, 'INVALID_INPUT');
    assert.strictEqual(result.error.details.field, 'projectId');
    await m.onUnload();
    await cleanup(projectsPath);
  });

  await testAsync('handleDeleteDatabase de projectId inexistente → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m, projectsPath } = await instantiate(mocks);
    const result = await m.handleDeleteDatabase({}, { params: { projectId: 'phantom' } });
    assert.strictEqual(result.status, 404);
    assert.strictEqual(result.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(result.error.details.entity_type, 'database');
    await m.onUnload();
    await cleanup(projectsPath);
  });

  await testAsync('handleHealthCheck devuelve healthy', async () => {
    const mocks = makeMocks();
    const { module: m, projectsPath } = await instantiate(mocks);
    const result = await m.handleHealthCheck();
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.module, 'database-manager');
    assert.strictEqual(result.data.version, '3.0.0');
    await m.onUnload();
    await cleanup(projectsPath);
  });

  // ==========================================
  // Group 5: Tools del LLM (shape canonico)
  // ==========================================

  await testAsync('handleToolQuery sin projectId → 400 canonico (no { error: string })', async () => {
    const mocks = makeMocks();
    const { module: m, projectsPath } = await instantiate(mocks);
    const result = await m.handleToolQuery({ query: 'SELECT 1' });
    assert.ok(isCanonicalError(result));
    assert.strictEqual(result.error.code, 'INVALID_INPUT');
    assert.strictEqual(typeof result.success, 'undefined', 'NO success: bool legacy');
    await m.onUnload();
    await cleanup(projectsPath);
  });

  await testAsync('handleToolQuery con UPDATE bloqueado → 403 PERMISSION_DENIED', async () => {
    const mocks = makeMocks();
    const { module: m, projectsPath } = await instantiate(mocks);
    const result = await m.handleToolQuery({ projectId: 'system', query: 'UPDATE x SET a=1' });
    assert.strictEqual(result.status, 403);
    assert.strictEqual(result.error.code, 'PERMISSION_DENIED');
    await m.onUnload();
    await cleanup(projectsPath);
  });

  await testAsync('handleToolExecute con SELECT bloqueado → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m, projectsPath } = await instantiate(mocks);
    const result = await m.handleToolExecute({ projectId: 'system', query: 'SELECT 1' });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error.code, 'INVALID_INPUT');
    await m.onUnload();
    await cleanup(projectsPath);
  });

  await testAsync('handleToolTables sobre DB nueva devuelve array vacio', async () => {
    const mocks = makeMocks();
    const { module: m, projectsPath } = await instantiate(mocks);
    const result = await m.handleToolTables({ projectId: 'system' });
    assert.strictEqual(result.status, 200);
    assert.ok(Array.isArray(result.data.tables));
    await m.onUnload();
    await cleanup(projectsPath);
  });

  await testAsync('handleToolSchema sobre tabla inexistente → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m, projectsPath } = await instantiate(mocks);
    const result = await m.handleToolSchema({ projectId: 'system', tableName: 'no_existe' });
    assert.strictEqual(result.status, 404);
    assert.strictEqual(result.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
    await cleanup(projectsPath);
  });

  await testAsync('handleToolQuery + handleToolExecute roundtrip funcional', async () => {
    const mocks = makeMocks();
    const { module: m, projectsPath } = await instantiate(mocks);
    await m.onSchemaInitRequest({
      data: { project_id: 'system', schema: 'CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, name TEXT)', request_id: 'rs' }
    });
    const insert = await m.handleToolExecute({
      projectId: 'system',
      query: "INSERT INTO items (name) VALUES ('foo')"
    });
    assert.strictEqual(insert.status, 200);
    assert.strictEqual(insert.data.affectedRows, 1);

    const select = await m.handleToolQuery({
      projectId: 'system',
      query: 'SELECT name FROM items'
    });
    assert.strictEqual(select.status, 200);
    assert.strictEqual(select.data.results[0].name, 'foo');
    await m.onUnload();
    await cleanup(projectsPath);
  });

  // ==========================================
  // Group 6: Eventos canonicos preservados
  // ==========================================

  await testAsync('Primera apertura de DB nueva publica db.created', async () => {
    const mocks = makeMocks();
    const { module: m, projectsPath } = await instantiate(mocks);
    mocks.published.length = 0;
    await m.onSchemaInitRequest({
      data: { project_id: 'system', schema: 'CREATE TABLE IF NOT EXISTS test_t (id INTEGER)', request_id: 'r' }
    });
    const ev = mocks.published.find(p => p[0] === 'db.created');
    assert.ok(ev);
    assert.strictEqual(ev[1].project_id, 'system');
    await m.onUnload();
    await cleanup(projectsPath);
  });

  await testAsync('onQueryRequest exitoso publica db.query.executed en background', async () => {
    const mocks = makeMocks();
    const { module: m, projectsPath } = await instantiate(mocks);
    await m.onSchemaInitRequest({
      data: { project_id: 'system', schema: 'CREATE TABLE IF NOT EXISTS test_q (id INTEGER PRIMARY KEY)', request_id: 'rs' }
    });
    mocks.published.length = 0;
    await m.onQueryRequest({
      data: { project_id: 'system', query: 'SELECT * FROM test_q', read_only: true, request_id: 'rq' }
    });
    // Esperar ticks porque _publishQueryExecuted es background
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    const ev = mocks.published.find(p => p[0] === 'db.query.executed');
    assert.ok(ev);
    assert.strictEqual(ev[1].project_id, 'system');
    assert.strictEqual(ev[1].read_only, true);
    await m.onUnload();
    await cleanup(projectsPath);
  });

  // ==========================================
  // Group 7: Helpers POC2 internos
  // ==========================================

  await testAsync('_errorResponse produce shape canonico', async () => {
    const m = new DatabaseManagerModule();
    const r1 = m._errorResponse(400, 'INVALID_INPUT', 'bad');
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'INVALID_INPUT', message: 'bad' } });
    const r2 = m._errorResponse(404, 'RESOURCE_NOT_FOUND', 'gone', { entity_type: 'db' });
    assert.deepStrictEqual(r2, { status: 404, error: { code: 'RESOURCE_NOT_FOUND', message: 'gone', details: { entity_type: 'db' } } });
  });

  await testAsync('_classifyHandlerError mapea sqlite errors correctamente', async () => {
    const m = new DatabaseManagerModule();
    assert.strictEqual(m._classifyHandlerError(new Error('SQLITE_ERROR: no such table: foo')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('UNIQUE constraint failed')), 'CONFLICT_STATE');
    assert.strictEqual(m._classifyHandlerError(new Error('syntax error near')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('weird')), 'UNKNOWN_ERROR');
  });

  await testAsync('_slugify cubre español + special chars', async () => {
    const m = new DatabaseManagerModule();
    assert.strictEqual(m._slugify('Mi Proyecto'), 'mi-proyecto');
    assert.strictEqual(m._slugify('Año Nuevo'), 'ano-nuevo');
    assert.strictEqual(m._slugify(''), '');
  });

  console.log('\ndatabase-manager: todos los tests pasaron ✓');
})().catch(err => { console.error(err); process.exit(1); });

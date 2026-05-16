/**
 * Tests unitarios — channel-manager v2.0.0 (POC2 #9 reescritura).
 *
 * Foco:
 *  - Lifecycle (onLoad inicializa schema + cache, onUnload limpia pendingDb sin leak).
 *  - Validacion canonica de UI/tool handlers (8) → { status, data | error: { code, message, details? } }.
 *  - CRUD: register/update/remove con eventos canonicos + correlation_id propagado.
 *  - Resolve cache hit/miss + bus handler onResolveRequest publicando .response.
 *  - Tools (resolve/list) con shape canonico.
 *  - Helpers POC2 internos.
 *  - Aislamiento: SQLite en memoria via sql.js, mock bus reactivo.
 *
 * Ejecutar: node tests/unit/channel-manager.test.js
 */

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

const ChannelManagerModule = require('../../modules/channel-manager/index.js');

// --------------------------------------------------
// Mock infra: bus reactivo + sql.js in-memory
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

  return { logs, published, metricsCalls, logger, metrics };
}

async function makeBusBackedBySqlJs(moduleRef, published) {
  const SQL = await initSqlJs();
  const db  = new SQL.Database();
  const subscribers = new Map();

  function runQuery(query, params) {
    const trimmed = query.trim();
    if (/^select/i.test(trimmed)) {
      const stmt = db.prepare(query);
      stmt.bind(params || []);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    }
    db.run(query, params || []);
    return [];
  }

  const eventBus = {
    subscribe: (event, handler) => {
      if (!subscribers.has(event)) subscribers.set(event, []);
      subscribers.get(event).push(handler);
      return () => {
        const list = subscribers.get(event) || [];
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      };
    },
    publish: async (event, payload) => {
      published.push([event, payload]);
      if (event === 'db.query.request') {
        const { correlation_id, query, params } = payload;
        try {
          const rows = runQuery(query, params);
          setImmediate(() => moduleRef.value.onDbResponse({
            data: { correlation_id, data: rows }
          }));
        } catch (err) {
          setImmediate(() => moduleRef.value.onDbResponse({
            data: { correlation_id, error: err.message }
          }));
        }
      } else if (event === 'db.schema.init.request') {
        const { correlation_id, schema } = payload;
        try {
          db.exec(schema);
          setImmediate(() => moduleRef.value.onDbResponse({
            data: { correlation_id, data: [] }
          }));
        } catch (err) {
          setImmediate(() => moduleRef.value.onDbResponse({
            data: { correlation_id, error: err.message }
          }));
        }
      }
    }
  };

  return { eventBus, db };
}

async function instantiate(mocks, opts = {}) {
  const moduleRef = { value: null };
  const { eventBus, db } = await makeBusBackedBySqlJs(moduleRef, mocks.published);
  const m = new ChannelManagerModule();
  moduleRef.value = m;
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus,
    moduleConfig: {
      db_project_id: 'system',
      table_name: 'channels',
      dbTimeout: 2000,
      ...(opts.config || {})
    }
  });
  return { module: m, db };
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
  console.log('channel-manager — reescritura canonica v2.0.0 (POC2 #9)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa schema + cache vacio', async () => {
    const mocks = makeMocks();
    const { module: m, db } = await instantiate(mocks);
    assert.strictEqual(m.dbReady, true);
    assert.strictEqual(m.cache.size, 0);
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    const names = (tables[0]?.values || []).map(r => r[0]);
    assert.ok(names.includes('channels'));
    await m.onUnload();
  });

  await testAsync('onUnload limpia pendingDbRequests sin leak', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let rejected = false;
    m.pendingDbRequests.set('leak-1', {
      resolve: () => {},
      reject: () => { rejected = true; },
      timeout: setTimeout(() => {}, 60000)
    });
    await m.onUnload();
    assert.strictEqual(m.pendingDbRequests.size, 0);
    assert.strictEqual(rejected, true);
    assert.strictEqual(m.dbReady, false);
    assert.strictEqual(m.cache.size, 0);
  });

  // ==========================================
  // Group 2: Validacion canonica de handlers
  // ==========================================

  await testAsync('handleRegister sin campos requeridos → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleRegister({ channel_type: 'telegram' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleRegister con channel_type invalido → 400 + allowed en details', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleRegister({
      channel_type: 'unknown', external_id: 'x', project_id: 'p'
    });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.deepStrictEqual(r.error.details.allowed, ['telegram','gmail','whatsapp','glovo','web']);
    await m.onUnload();
  });

  await testAsync('handleResolve sin params → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleResolve({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('handleResolve canal no registrado → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleResolve({ channel_type: 'telegram', external_id: 'noexist' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleListByProject sin project_id → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleListByProject({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('handleToolResolve sin params → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleToolResolve({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  // ==========================================
  // Group 3: CRUD register/update/remove
  // ==========================================

  await testAsync('register publica channel.registered con correlation_id + cache update', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;

    const r = await m.handleRegister({
      channel_type: 'telegram', external_id: 'mibot:1', project_id: 'noninapizza',
      purpose: 'facturas', label: 'Bot facturas'
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.binding.project_id, 'noninapizza');

    const events = publishedOf(mocks, 'channel.registered');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].channel_type, 'telegram');
    assert.strictEqual(events[0].project_id, 'noninapizza');
    assert.ok(events[0].correlation_id);
    assert.ok(events[0].timestamp);

    // Cache populated
    assert.strictEqual(m.cache.size, 1);
    assert.ok(m.cache.has('telegram:mibot:1'));
    await m.onUnload();
  });

  await testAsync('update publica channel.updated + actualiza cache', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleRegister({
      channel_type: 'telegram', external_id: 'mibot:2', project_id: 'p1', purpose: 'general'
    });
    mocks.published.length = 0;

    const r = await m.handleUpdate({
      channel_type: 'telegram', external_id: 'mibot:2',
      project_id: 'p2', label: 'updated'
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.binding.project_id, 'p2');
    const events = publishedOf(mocks, 'channel.updated');
    assert.strictEqual(events.length, 1);
    assert.ok(events[0].correlation_id);
    await m.onUnload();
  });

  await testAsync('update canal inexistente → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleUpdate({
      channel_type: 'telegram', external_id: 'noexist', label: 'x'
    });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('update con enabled:false → cache.delete del binding', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleRegister({
      channel_type: 'web', external_id: 'sess-1', project_id: 'p1'
    });
    assert.strictEqual(m.cache.size, 1);

    const r = await m.handleUpdate({
      channel_type: 'web', external_id: 'sess-1', enabled: false
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(m.cache.has('web:sess-1'), false);
    await m.onUnload();
  });

  await testAsync('remove publica channel.removed + cache.delete', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleRegister({
      channel_type: 'gmail', external_id: 'a@b.com', project_id: 'p1'
    });
    mocks.published.length = 0;

    const r = await m.handleRemove({ channel_type: 'gmail', external_id: 'a@b.com' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.removed, true);
    const events = publishedOf(mocks, 'channel.removed');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].project_id, 'p1');
    assert.strictEqual(m.cache.size, 0);
    await m.onUnload();
  });

  await testAsync('remove canal inexistente → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleRemove({ channel_type: 'telegram', external_id: 'noexist' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Resolve cache hit/miss
  // ==========================================

  await testAsync('resolve devuelve binding completo en cache hit', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleRegister({
      channel_type: 'telegram', external_id: 'mibot:42',
      project_id: 'noninapizza', purpose: 'pedidos',
      label: 'Bot pedidos', metadata: { lang: 'es' }
    });

    const r = await m.handleResolve({ channel_type: 'telegram', external_id: 'mibot:42' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.project_id, 'noninapizza');
    assert.strictEqual(r.data.purpose, 'pedidos');
    assert.strictEqual(r.data.label, 'Bot pedidos');
    assert.deepStrictEqual(r.data.metadata, { lang: 'es' });
    await m.onUnload();
  });

  await testAsync('handleList devuelve count + channels[]', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleRegister({ channel_type: 'telegram', external_id: 't1', project_id: 'p1' });
    await m.handleRegister({ channel_type: 'gmail',    external_id: 'g1@x.com', project_id: 'p2' });

    const r = await m.handleList({});
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.count, 2);
    assert.strictEqual(r.data.channels.length, 2);
    await m.onUnload();
  });

  await testAsync('handleListByProject filtra correctamente', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleRegister({ channel_type: 'telegram', external_id: 't1', project_id: 'p1' });
    await m.handleRegister({ channel_type: 'gmail',    external_id: 'g1@x.com', project_id: 'p2' });

    const r = await m.handleListByProject({ project_id: 'p1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.count, 1);
    assert.strictEqual(r.data.channels[0].project_id, 'p1');
    await m.onUnload();
  });

  // ==========================================
  // Group 5: Bus handler onResolveRequest
  // ==========================================

  await testAsync('onResolveRequest cache hit publica resolved + resolve.response success', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleRegister({
      channel_type: 'telegram', external_id: 'bot-x', project_id: 'projX', purpose: 'general'
    });
    mocks.published.length = 0;

    await m.onResolveRequest({
      data: {
        channel_type: 'telegram', external_id: 'bot-x',
        request_id: 'r1', correlation_id: 'cid-abc'
      }
    });

    const resolved = publishedOf(mocks, 'channel.resolved');
    const response = publishedOf(mocks, 'channel-manager.resolve.response');
    assert.strictEqual(resolved.length, 1);
    assert.strictEqual(resolved[0].project_id, 'projX');
    assert.strictEqual(resolved[0].correlation_id, 'cid-abc');
    assert.strictEqual(response.length, 1);
    assert.strictEqual(response[0].request_id, 'r1');
    assert.strictEqual(response[0].success, true);
    assert.strictEqual(response[0].found, true);
    assert.strictEqual(response[0].correlation_id, 'cid-abc');
    await m.onUnload();
  });

  await testAsync('onResolveRequest cache miss publica resolve.response found:false', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;

    await m.onResolveRequest({
      data: {
        channel_type: 'telegram', external_id: 'noexist',
        request_id: 'r2'
      }
    });

    const response = publishedOf(mocks, 'channel-manager.resolve.response');
    const resolved = publishedOf(mocks, 'channel.resolved');
    assert.strictEqual(resolved.length, 0);
    assert.strictEqual(response.length, 1);
    assert.strictEqual(response[0].found, false);
    assert.ok(response[0].correlation_id);
    await m.onUnload();
  });

  await testAsync('onResolveRequest sin request_id → no publica + warn', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;

    await m.onResolveRequest({ data: { channel_type: 'telegram', external_id: 'x' } });

    const responses = publishedOf(mocks, 'channel-manager.resolve.response');
    assert.strictEqual(responses.length, 0);
    const warns = mocks.logs.filter(l => l[0] === 'warn');
    assert.ok(warns.some(w => w[1].includes('invalid_payload')));
    await m.onUnload();
  });

  // ==========================================
  // Group 6: Tool handlers (LLM-invokable)
  // ==========================================

  await testAsync('handleToolResolve cache hit → 200 con found:true + binding', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleRegister({
      channel_type: 'whatsapp', external_id: '+34600000', project_id: 'pX'
    });
    const r = await m.handleToolResolve({ channel_type: 'whatsapp', external_id: '+34600000' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.found, true);
    assert.strictEqual(r.data.project_id, 'pX');
    await m.onUnload();
  });

  await testAsync('handleToolResolve cache miss → 200 found:false con message (no error)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleToolResolve({ channel_type: 'telegram', external_id: 'no' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.found, false);
    assert.ok(typeof r.data.message === 'string');
    await m.onUnload();
  });

  await testAsync('handleToolList devuelve count + channels[] proyectado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleRegister({ channel_type: 'telegram', external_id: 't1', project_id: 'p1' });
    const r = await m.handleToolList({});
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.count, 1);
    assert.strictEqual(r.data.channels[0].channel_type, 'telegram');
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
    assert.strictEqual(m._classifyHandlerError(new Error('Channel not found')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('already exists')), 'ALREADY_EXISTS');
    assert.strictEqual(m._classifyHandlerError(new Error('Unauthorized')), 'PERMISSION_DENIED');
    assert.strictEqual(m._classifyHandlerError(new Error('upstream timeout')), 'UPSTREAM_TIMEOUT');
    assert.strictEqual(m._classifyHandlerError(new Error('something exploded')), 'UNKNOWN_ERROR');
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
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'channel-manager.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})();

/**
 * Tests unitarios — conversacion__memory-user-profile (POC2 reescritura).
 *
 * Ejecutar: node tests/unit/conversacion__memory-user-profile.test.js
 */

'use strict';

const assert = require('assert');
const MemoryUserProfileModule = require('../../modules/conversacion/memory-user-profile/index.js');

function makeMocks(opts = {}) {
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

  // Fake DB: respond automaticamente al next tick para drenar promesas pendientes.
  // dbState: { tables: {projectId: { facts: [{user_id,fact,created_at}, ...] } } }
  const dbState = { tables: {} };
  const dbResponses = opts.dbResponses || null;
  let module = null;

  const eventBus = {
    publish: async (event, payload) => {
      published.push([event, payload]);
      if (event === 'db.query.request') {
        const request_id = payload.request_id;
        const project_id = payload.project_id;
        const q = payload.query;
        const params = payload.params || [];

        if (!dbState.tables[project_id]) dbState.tables[project_id] = { facts: [] };
        const tbl = dbState.tables[project_id];

        let response;
        if (dbResponses && dbResponses[q.split('\n')[0].trim()]) {
          response = dbResponses[q.split('\n')[0].trim()](params, tbl);
        } else if (/CREATE TABLE/i.test(q)) {
          response = { request_id, data: [] };
        } else if (/CREATE INDEX/i.test(q)) {
          response = { request_id, data: [] };
        } else if (/INSERT OR IGNORE/i.test(q)) {
          const [id, user_id, fact, source_message_id, conversation_id, created_at] = params;
          if (!tbl.facts.find(f => f.user_id === user_id && f.fact === fact)) {
            tbl.facts.push({ id, user_id, fact, source_message_id, conversation_id, created_at });
          }
          response = { request_id, data: [] };
        } else if (/SELECT fact FROM user_profile_facts/i.test(q)) {
          const [user_id, limit] = params;
          const rows = tbl.facts
            .filter(f => f.user_id === user_id)
            .sort((a, b) => a.created_at - b.created_at)
            .slice(0, limit)
            .map(f => ({ fact: f.fact }));
          response = { request_id, data: rows };
        } else {
          response = { request_id, data: [] };
        }

        // Drain async
        setImmediate(() => {
          if (module) module.onDbQueryResponse({ data: response });
        });
      }
    }
  };

  const setModule = (m) => { module = m; };
  return { logs, published, metricsCalls, logger, metrics, eventBus, dbState, setModule };
}

async function instantiate(mocks, opts = {}) {
  const m = new MemoryUserProfileModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    config: opts.config || {}
  });
  mocks.setModule(m);
  return { module: m };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

function makeMessageSaved(overrides = {}) {
  return {
    data: {
      project_id: overrides.project_id || 'proj-1',
      user_id: overrides.user_id || 'user-1',
      conversation_id: overrides.conversation_id || 'conv-1',
      message_id: overrides.message_id || 'msg-1',
      user_message: overrides.user_message || 'me llamo Juan',
      correlation_id: overrides.correlation_id || 'cid-1',
      ...overrides
    }
  };
}

(async () => {
  console.log('conversacion__memory-user-profile — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad inicializa estado limpio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'memory-user-profile');
    assert.strictEqual(m.version, '2.0.0');
    assert.strictEqual(m.pendingDb.size, 0);
    assert.strictEqual(m.schemaReady.size, 0);
    await m.onUnload();
  });

  await testAsync('onUnload cancela timers + rejecta pending', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let rejected = false;
    m.pendingDb.set('leak-1', {
      resolve: () => {},
      reject: () => { rejected = true; },
      timeout: setTimeout(() => {}, 60000)
    });
    await m.onUnload();
    assert.strictEqual(m.pendingDb.size, 0);
    assert.ok(rejected, 'pending rejected');
  });

  // Group 2: Bus handler — chat.message.saved happy path
  await testAsync('onMessageSaved extrae fact + persiste + emite chat.context.enriched', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onMessageSaved(makeMessageSaved({ user_message: 'Hola, me llamo Juan, vivo en Madrid' }));
    const evs = publishedOf(mocks, 'chat.context.enriched');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid-1');
    assert.strictEqual(evs[0].project_id, 'proj-1');
    assert.strictEqual(evs[0].source, 'memory-user-profile');
    assert.strictEqual(evs[0].priority, 100);
    assert.ok(evs[0].context_addition.includes('el usuario se llama Juan'));
    assert.ok(evs[0].context_addition.includes('el usuario vive en Madrid'));
    assert.ok(evs[0].timestamp);
    await m.onUnload();
  });

  await testAsync('mensajes sin facts NO publica chat.context.enriched', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onMessageSaved(makeMessageSaved({ user_message: 'hola que tal' }));
    assert.strictEqual(publishedOf(mocks, 'chat.context.enriched').length, 0);
    await m.onUnload();
  });

  // Group 3: Politica fail-silent
  await testAsync('payload incompleto NO publica nada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onMessageSaved({ data: { project_id: 'p1' } });
    assert.strictEqual(publishedOf(mocks, 'chat.context.enriched').length, 0);
    assert.strictEqual(publishedOf(mocks, 'db.query.request').length, 0);
    await m.onUnload();
  });

  await testAsync('config.enabled=false desactiva handler', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { enabled: false } });
    await m.onMessageSaved(makeMessageSaved());
    assert.strictEqual(publishedOf(mocks, 'chat.context.enriched').length, 0);
    await m.onUnload();
  });

  // Group 4: Heuristicas regex
  await testAsync('_extractFacts captura patrones es', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    // El regex no rompe en " y " — captura hasta separador (.,;!?\n).
    const facts = m._extractFacts('Hola, me llamo Ana. Soy de Bilbao. Tengo 30 años. Me gusta el café');
    assert.ok(facts.includes('el usuario se llama Ana'), 'me llamo capturado');
    assert.ok(facts.includes('el usuario es de Bilbao'), 'soy de capturado');
    assert.ok(facts.includes('el usuario tiene 30 años'), 'edad capturada');
    assert.ok(facts.some(f => f.startsWith('al usuario le gusta')), 'me gusta capturado');
    await m.onUnload();
  });

  await testAsync('_extractFacts deduplica facts identicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const facts = m._extractFacts('me llamo Ana. mi nombre es Ana');
    const llamaFacts = facts.filter(f => f.includes('se llama Ana'));
    assert.strictEqual(llamaFacts.length, 1);
    await m.onUnload();
  });

  await testAsync('_extractFacts con input no string devuelve []', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.deepStrictEqual(m._extractFacts(null), []);
    assert.deepStrictEqual(m._extractFacts(undefined), []);
    assert.deepStrictEqual(m._extractFacts(123), []);
    await m.onUnload();
  });

  // Group 5: Persistencia + acumulacion
  await testAsync('mensajes sucesivos acumulan facts del mismo user_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onMessageSaved(makeMessageSaved({ message_id: 'm1', user_message: 'me llamo Juan' }));
    await m.onMessageSaved(makeMessageSaved({ message_id: 'm2', user_message: 'vivo en Madrid' }));
    const evs = publishedOf(mocks, 'chat.context.enriched');
    assert.strictEqual(evs.length, 2);
    assert.ok(evs[1].context_addition.includes('Juan'));
    assert.ok(evs[1].context_addition.includes('Madrid'));
    assert.strictEqual(evs[1].metadata.fact_count, 2);
    await m.onUnload();
  });

  await testAsync('schema se asegura solo una vez por project_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onMessageSaved(makeMessageSaved({ message_id: 'm1' }));
    const createBefore = mocks.published.filter(p => p[0] === 'db.query.request' && /CREATE TABLE/i.test(p[1].query)).length;
    await m.onMessageSaved(makeMessageSaved({ message_id: 'm2', user_message: 'vivo en Madrid' }));
    const createAfter = mocks.published.filter(p => p[0] === 'db.query.request' && /CREATE TABLE/i.test(p[1].query)).length;
    assert.strictEqual(createBefore, createAfter, 'schema NO se reaplica');
    await m.onUnload();
  });

  // Group 6: db.query.response correlation
  await testAsync('onDbQueryResponse resuelve pending por request_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let resolved = false;
    m.pendingDb.set('rid-test', {
      resolve: (rows) => { resolved = rows; },
      reject: () => {},
      timeout: setTimeout(() => {}, 60000)
    });
    m.onDbQueryResponse({ data: { request_id: 'rid-test', data: [{ fact: 'x' }] } });
    assert.deepStrictEqual(resolved, [{ fact: 'x' }]);
    assert.strictEqual(m.pendingDb.size, 0);
    await m.onUnload();
  });

  await testAsync('onDbQueryResponse con error rejecta pending', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let rejected = null;
    m.pendingDb.set('rid-err', {
      resolve: () => {},
      reject: (e) => { rejected = e; },
      timeout: setTimeout(() => {}, 60000)
    });
    m.onDbQueryResponse({ data: { request_id: 'rid-err', error: 'db crashed' } });
    assert.ok(rejected instanceof Error);
    assert.strictEqual(rejected.message, 'db crashed');
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

  await testAsync('_classifyHandlerError mapea por mensaje', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.deepStrictEqual(m._classifyHandlerError(new Error('field is required')), { status: 400, code: 'INVALID_INPUT' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('not found')), { status: 404, code: 'RESOURCE_NOT_FOUND' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('db timeout')), { status: 504, code: 'TIMEOUT' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('boom')), { status: 500, code: 'INTERNAL_ERROR' });
    await m.onUnload();
  });

  await testAsync('_publicarEvento hereda correlation_id, project_id y agrega timestamp', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    const r = await m._publicarEvento('test.event', { foo: 1 }, { correlation_id: 'cid-z', project_id: 'p-z' });
    assert.strictEqual(r.correlation_id, 'cid-z');
    assert.strictEqual(r.project_id, 'p-z');
    assert.ok(r.timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError emite metric memory-user-profile.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'), 'subscribe');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'memory-user-profile.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });

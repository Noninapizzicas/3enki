/**
 * Tests unitarios — conversacion__memory-conversation-summary (POC2).
 *
 * Ejecutar: node tests/unit/conversacion__memory-conversation-summary.test.js
 */

'use strict';

const assert = require('assert');
const MemoryConversationSummaryModule = require('../../modules/conversacion/memory-conversation-summary/index.js');

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

  const dbState = { tables: { summaries: new Map(), messages: new Map() } };
  let module = null;

  const eventBus = {
    publish: async (event, payload) => {
      published.push([event, payload]);
      if (event === 'db.query.request') {
        const request_id = payload.request_id;
        const q = payload.query;
        const params = payload.params || [];
        let response = { request_id, data: [] };

        if (/CREATE TABLE/i.test(q) || /CREATE INDEX/i.test(q)) {
          response = { request_id, data: [] };
        } else if (/INSERT INTO conversation_summaries/i.test(q)) {
          const [conversation_id, user_id, summary, last_message_id, message_count_at_summary, updated_at] = params;
          dbState.tables.summaries.set(conversation_id, {
            conversation_id, user_id, summary, last_message_id, message_count_at_summary, updated_at
          });
          response = { request_id, data: [] };
        } else if (/SELECT summary, message_count_at_summary/i.test(q)) {
          const [conversation_id] = params;
          const row = dbState.tables.summaries.get(conversation_id);
          response = { request_id, data: row ? [row] : [] };
        } else if (/SELECT role, content, created_at/i.test(q)) {
          const [conversation_id] = params;
          response = { request_id, data: dbState.tables.messages.get(conversation_id) || [] };
        }

        setImmediate(() => {
          if (module) module.onDbQueryResponse({ data: response });
        });
      }
      if (event === 'llm.complete.request' && opts.llmReply) {
        const request_id = payload.request_id;
        setImmediate(() => {
          if (!module) return;
          if (opts.llmReply.fail) {
            module.onLlmFailed({ data: { request_id, error: { message: opts.llmReply.fail } } });
          } else {
            module.onLlmResponse({ data: { request_id, result: { content: opts.llmReply.content || 'resumen ok' } } });
          }
        });
      }
    }
  };

  const setModule = (m) => { module = m; };
  return { logs, published, metricsCalls, logger, metrics, eventBus, dbState, setModule };
}

async function instantiate(mocks, opts = {}) {
  const m = new MemoryConversationSummaryModule();
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

function makeMessage(overrides = {}) {
  return {
    data: {
      project_id: overrides.project_id || 'proj-1',
      user_id: overrides.user_id || 'user-1',
      conversation_id: overrides.conversation_id || 'conv-1',
      message_id: overrides.message_id || `msg-${Math.random()}`,
      user_message: overrides.user_message || 'hola',
      correlation_id: overrides.correlation_id || 'cid-1',
      ...overrides
    }
  };
}

(async () => {
  console.log('conversacion__memory-conversation-summary — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad inicializa estado limpio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'memory-conversation-summary');
    assert.strictEqual(m.version, '2.0.0');
    assert.strictEqual(m.pendingDb.size, 0);
    assert.strictEqual(m.pendingLlm.size, 0);
    assert.strictEqual(m.messageCounters.size, 0);
    assert.strictEqual(m.summaryInFlight.size, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia maps + cancela pendings', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let dbReject = false, llmReject = false;
    m.pendingDb.set('db1', {
      resolve: () => {}, reject: () => { dbReject = true; },
      timeout: setTimeout(() => {}, 60000)
    });
    m.pendingLlm.set('llm1', {
      resolve: () => {}, reject: () => { llmReject = true; },
      timeout: setTimeout(() => {}, 60000)
    });
    m.messageCounters.set('c1', 5);
    m.summaryInFlight.add('c1');
    await m.onUnload();
    assert.ok(dbReject && llmReject);
    assert.strictEqual(m.pendingDb.size, 0);
    assert.strictEqual(m.messageCounters.size, 0);
    assert.strictEqual(m.summaryInFlight.size, 0);
  });

  // Group 2: Bus handler — counter incrementing
  await testAsync('onMessageSaved incrementa counter por conversation_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { summarize_after_messages: 100 } });
    await m.onMessageSaved(makeMessage({ message_id: 'm1' }));
    await m.onMessageSaved(makeMessage({ message_id: 'm2' }));
    await m.onMessageSaved(makeMessage({ message_id: 'm3' }));
    assert.strictEqual(m.messageCounters.get('conv-1'), 3);
    await m.onUnload();
  });

  await testAsync('payload incompleto es ignorado silenciosamente', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onMessageSaved({ data: { project_id: 'p1', conversation_id: 'c1' } });
    assert.strictEqual(m.messageCounters.size, 0);
    assert.strictEqual(publishedOf(mocks, 'chat.context.enriched').length, 0);
    await m.onUnload();
  });

  await testAsync('config.enabled=false desactiva handler', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { enabled: false } });
    await m.onMessageSaved(makeMessage());
    assert.strictEqual(m.messageCounters.size, 0);
    await m.onUnload();
  });

  // Group 3: Summary trigger threshold
  await testAsync('threshold dispara summarize y persiste resumen', async () => {
    const mocks = makeMocks({ llmReply: { content: 'Resumen narrativo de la conversacion.' } });
    // pre-cargar mensajes en mock DB
    mocks.dbState.tables.messages.set('conv-1', [
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'que tal' }
    ]);
    const { module: m } = await instantiate(mocks, { config: { summarize_after_messages: 2 } });
    await m.onMessageSaved(makeMessage({ message_id: 'm1' }));
    await m.onMessageSaved(makeMessage({ message_id: 'm2' }));
    // esperar a que la promesa de summarize resuelva
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    assert.ok(mocks.dbState.tables.summaries.has('conv-1'), 'summary persisted');
    assert.ok(publishedOf(mocks, 'llm.complete.request').length === 1);
    const enriched = publishedOf(mocks, 'chat.context.enriched');
    assert.ok(enriched.length >= 1);
    assert.ok(enriched[enriched.length - 1].context_addition.includes('Resumen narrativo'));
    await m.onUnload();
  });

  await testAsync('summary existente publica chat.context.enriched en cada mensaje', async () => {
    const mocks = makeMocks();
    mocks.dbState.tables.summaries.set('conv-1', {
      conversation_id: 'conv-1', user_id: 'user-1', summary: 'previo', message_count_at_summary: 5
    });
    const { module: m } = await instantiate(mocks, { config: { summarize_after_messages: 100 } });
    await m.onMessageSaved(makeMessage({ message_id: 'm1' }));
    const evs = publishedOf(mocks, 'chat.context.enriched');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].priority, 200);
    assert.strictEqual(evs[0].source, 'memory-conversation-summary');
    assert.ok(evs[0].context_addition.includes('previo'));
    assert.strictEqual(evs[0].correlation_id, 'cid-1');
    assert.strictEqual(evs[0].project_id, 'proj-1');
    await m.onUnload();
  });

  // Group 4: LLM failure handling
  await testAsync('llm.complete.failed limpia summaryInFlight + emite metric error', async () => {
    const mocks = makeMocks({ llmReply: { fail: 'provider down' } });
    mocks.dbState.tables.messages.set('conv-1', [{ role: 'user', content: 'hola' }]);
    const { module: m } = await instantiate(mocks, { config: { summarize_after_messages: 1 } });
    await m.onMessageSaved(makeMessage({ message_id: 'm1' }));
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    assert.strictEqual(m.summaryInFlight.size, 0);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'memory-conversation-summary.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  // Group 5: Correlation
  await testAsync('onDbQueryResponse resuelve por request_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let resolved = null;
    m.pendingDb.set('rid-1', {
      resolve: (rows) => { resolved = rows; },
      reject: () => {},
      timeout: setTimeout(() => {}, 60000)
    });
    m.onDbQueryResponse({ data: { request_id: 'rid-1', data: [{ x: 1 }] } });
    assert.deepStrictEqual(resolved, [{ x: 1 }]);
    assert.strictEqual(m.pendingDb.size, 0);
    await m.onUnload();
  });

  await testAsync('onLlmResponse resuelve por request_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let resolved = null;
    m.pendingLlm.set('rid-llm', {
      resolve: (p) => { resolved = p; },
      reject: () => {},
      timeout: setTimeout(() => {}, 60000)
    });
    m.onLlmResponse({ data: { request_id: 'rid-llm', result: { content: 'hi' } } });
    assert.strictEqual(resolved.result.content, 'hi');
    await m.onUnload();
  });

  // Group 6: Schema idempotencia
  await testAsync('schema CREATE TABLE solo una vez por project_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { summarize_after_messages: 100 } });
    await m.onMessageSaved(makeMessage({ message_id: 'm1' }));
    const before = mocks.published.filter(p => p[0] === 'db.query.request' && /CREATE TABLE/i.test(p[1].query)).length;
    await m.onMessageSaved(makeMessage({ message_id: 'm2' }));
    const after = mocks.published.filter(p => p[0] === 'db.query.request' && /CREATE TABLE/i.test(p[1].query)).length;
    assert.strictEqual(before, after);
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
    assert.deepStrictEqual(m._classifyHandlerError(new Error('llm timeout')), { status: 504, code: 'TIMEOUT' });
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

  await testAsync('_handleHandlerError emite metric memory-conversation-summary.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'), 'subscribe');
    assert.strictEqual(r.status, 404);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'memory-conversation-summary.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });

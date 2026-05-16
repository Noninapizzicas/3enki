/**
 * Tests unitarios — conversacion__memory-rag (POC2).
 *
 * Ejecutar: node tests/unit/conversacion__memory-rag.test.js
 */

'use strict';

const assert = require('assert');
const MemoryRagModule = require('../../modules/conversacion/memory-rag/index.js');

function makeMocks(opts = {}) {
  const logs = [];
  const published = [];
  const metricsCalls = [];
  const dbState = { rag_messages: [] };
  let module = null;

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
    publish: async (event, payload) => {
      published.push([event, payload]);
      if (event === 'db.query.request') {
        const request_id = payload.request_id;
        const q = payload.query;
        const params = payload.params || [];
        let response = { request_id, data: [] };

        if (/CREATE TABLE/i.test(q) || /CREATE INDEX/i.test(q)) {
          response = { request_id, data: [] };
        } else if (/INSERT INTO rag_messages/i.test(q)) {
          const [id, conversation_id, user_id, role, content, vector, dimensions, model, provider, created_at] = params;
          dbState.rag_messages.push({ id, conversation_id, user_id, role, content, vector, dimensions, model, provider, created_at });
          response = { request_id, data: [] };
        } else if (/SELECT id, conversation_id/i.test(q)) {
          response = { request_id, data: dbState.rag_messages };
        }

        setImmediate(() => {
          if (module) module.onDbQueryResponse({ data: response });
        });
      }
      if (event === 'embedding.generate.request' && opts.embeddingReply !== false) {
        const request_id = payload.request_id;
        const reply = opts.embeddingReply;
        setImmediate(() => {
          if (!module) return;
          if (reply?.fail) {
            module.onEmbeddingFailed({ data: { request_id, error: { message: reply.fail } } });
          } else {
            const vector = (reply && reply.vector) || [1, 0, 0, 0];
            module.onEmbeddingResponse({
              data: { request_id, vector, dimensions: vector.length, model: 'mock', provider: 'mock' }
            });
          }
        });
      }
    }
  };

  const setModule = (m) => { module = m; };
  return { logs, published, metricsCalls, logger, metrics, eventBus, dbState, setModule };
}

async function instantiate(mocks, opts = {}) {
  const m = new MemoryRagModule();
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
      message_id: overrides.message_id || 'msg-1',
      user_message: overrides.user_message || 'hola que tal estas',
      correlation_id: overrides.correlation_id || 'cid-1',
      ...overrides
    }
  };
}

async function flush(times = 4) {
  for (let i = 0; i < times; i++) await new Promise(r => setImmediate(r));
}

(async () => {
  console.log('conversacion__memory-rag — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad inicializa estado limpio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'memory-rag');
    assert.strictEqual(m.version, '2.0.0');
    assert.strictEqual(m.pendingDb.size, 0);
    assert.strictEqual(m.pendingEmbeddings.size, 0);
    assert.strictEqual(m.vectorCache.size, 0);
    await m.onUnload();
  });

  await testAsync('onUnload cancela timers + rejecta pendings', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let dbR = false, emR = false;
    m.pendingDb.set('d', { resolve: () => {}, reject: () => { dbR = true; }, timeout: setTimeout(() => {}, 60000) });
    m.pendingEmbeddings.set('e', { resolve: () => {}, reject: () => { emR = true; }, timeout: setTimeout(() => {}, 60000) });
    m.vectorCache.set('k', []);
    await m.onUnload();
    assert.ok(dbR && emR);
    assert.strictEqual(m.vectorCache.size, 0);
  });

  // Group 2: Indexacion
  await testAsync('onMessageSaved indexa user_message y persiste vector', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onMessageSaved(makeMessage());
    await flush();
    assert.strictEqual(mocks.dbState.rag_messages.length, 1);
    assert.strictEqual(mocks.dbState.rag_messages[0].role, 'user');
    assert.strictEqual(mocks.dbState.rag_messages[0].content, 'hola que tal estas');
    const indexedMetric = mocks.metricsCalls.find(c => c[1] === 'memory-rag.indexed');
    assert.ok(indexedMetric);
    await m.onUnload();
  });

  await testAsync('onAiChatResponse indexa assistant_message', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onAiChatResponse({
      data: {
        project_id: 'p1', user_id: 'u1', conversation_id: 'c1',
        message_id_assistant: 'a1', assistant_message: 'respuesta del companero',
        correlation_id: 'cid'
      }
    });
    await flush();
    assert.strictEqual(mocks.dbState.rag_messages.length, 1);
    assert.strictEqual(mocks.dbState.rag_messages[0].role, 'assistant');
    await m.onUnload();
  });

  // Group 3: Politica fail-silent
  await testAsync('payload incompleto no indexa ni publica', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onMessageSaved({ data: { project_id: 'p1' } });
    await flush();
    assert.strictEqual(mocks.dbState.rag_messages.length, 0);
    await m.onUnload();
  });

  await testAsync('mensaje mas corto que skip_messages_shorter_than es ignorado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { skip_messages_shorter_than: 20 } });
    await m.onMessageSaved(makeMessage({ user_message: 'corto' }));
    await flush();
    assert.strictEqual(mocks.dbState.rag_messages.length, 0);
    await m.onUnload();
  });

  await testAsync('config.enabled=false desactiva handler', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { enabled: false } });
    await m.onMessageSaved(makeMessage());
    await flush();
    assert.strictEqual(mocks.dbState.rag_messages.length, 0);
    await m.onUnload();
  });

  // Group 4: Search semantico
  await testAsync('search devuelve top-K filtrado por similarity', async () => {
    const mocks = makeMocks({ embeddingReply: { vector: [1, 0, 0, 0] } });
    const { module: m } = await instantiate(mocks, { config: { top_k: 2, min_similarity: 0.5 } });
    // Pre-cargar 3 mensajes en cache (vectores: muy similar, similar, no similar)
    const bucket = m._getCacheBucket('proj-1', 'user-1');
    bucket.push({ message_id: 'm1', conversation_id: 'c1', role: 'user', content: 'muy similar', vector: [1, 0, 0, 0], created_at: 1 });
    bucket.push({ message_id: 'm2', conversation_id: 'c1', role: 'user', content: 'similar', vector: [0.9, 0.4, 0, 0], created_at: 2 });
    bucket.push({ message_id: 'm3', conversation_id: 'c1', role: 'user', content: 'no similar', vector: [0, 1, 0, 0], created_at: 3 });
    m.schemaReady.add('loaded:proj-1');

    await m.onMessageSaved(makeMessage({ message_id: 'newest' }));
    await flush();
    const enriched = publishedOf(mocks, 'chat.context.enriched');
    assert.strictEqual(enriched.length, 1);
    assert.strictEqual(enriched[0].metadata.matches, 2);
    assert.ok(enriched[0].context_addition.includes('muy similar'));
    assert.ok(enriched[0].correlation_id === 'cid-1');
    assert.ok(enriched[0].project_id === 'proj-1');
    await m.onUnload();
  });

  await testAsync('search vacio NO publica chat.context.enriched', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onMessageSaved(makeMessage());
    await flush();
    assert.strictEqual(publishedOf(mocks, 'chat.context.enriched').length, 0);
    await m.onUnload();
  });

  // Group 5: Embedding failure
  await testAsync('embedding failed no rompe handler + emite metric error', async () => {
    const mocks = makeMocks({ embeddingReply: { fail: 'gemini down' } });
    const { module: m } = await instantiate(mocks);
    await m.onMessageSaved(makeMessage());
    await flush();
    assert.strictEqual(mocks.dbState.rag_messages.length, 0);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'memory-rag.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  // Group 6: Vector serialization
  await testAsync('_vectorToBlob + _blobToVector preservan valores float32', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const v = [0.1, -0.5, 1.2, 100.0];
    const blob = m._vectorToBlob(v);
    const decoded = m._blobToVector(blob, 4);
    for (let i = 0; i < 4; i++) {
      assert.ok(Math.abs(decoded[i] - v[i]) < 1e-5);
    }
    await m.onUnload();
  });

  await testAsync('_cosineSimilarity calcula correctamente', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._cosineSimilarity([1, 0], [1, 0]), 1);
    assert.strictEqual(m._cosineSimilarity([1, 0], [0, 1]), 0);
    assert.ok(Math.abs(m._cosineSimilarity([1, 1], [1, 0]) - Math.SQRT1_2) < 1e-5);
    assert.strictEqual(m._cosineSimilarity([0, 0], [1, 1]), 0);
    assert.strictEqual(m._cosineSimilarity(null, [1]), 0);
    assert.strictEqual(m._cosineSimilarity([1, 2], [1]), 0);
    await m.onUnload();
  });

  await testAsync('_getCacheBucket aisla por (project_id, user_id)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const a = m._getCacheBucket('p1', 'u1');
    const b = m._getCacheBucket('p1', 'u2');
    const c = m._getCacheBucket('p2', 'u1');
    a.push({ message_id: 'a' });
    assert.strictEqual(a.length, 1);
    assert.strictEqual(b.length, 0);
    assert.strictEqual(c.length, 0);
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

  await testAsync('_classifyHandlerError mapea timeout/required/not found', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.deepStrictEqual(m._classifyHandlerError(new Error('field is required')), { status: 400, code: 'INVALID_INPUT' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('not found')), { status: 404, code: 'RESOURCE_NOT_FOUND' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('timeout')), { status: 504, code: 'UPSTREAM_TIMEOUT' });
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

  await testAsync('_handleHandlerError emite metric memory-rag.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'), 'subscribe');
    assert.strictEqual(r.status, 404);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'memory-rag.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });

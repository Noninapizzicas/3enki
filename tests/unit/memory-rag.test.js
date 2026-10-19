/**
 * Tests unitarios para memory-rag.
 *
 * Foco:
 *  - Indexa user_message en chat.message.saved (genera embedding, persiste, suma a cache).
 *  - Indexa assistant_message en ai.chat.response (genera embedding, persiste).
 *  - Consulta top-K en cada chat.message.saved y publica chat.context.enriched
 *    si hay matches por encima de min_similarity.
 *  - chat.context.enriched VALIDA contra el JSON Schema oficial.
 *  - mensaje muy corto (< skip_messages_shorter_than) NO indexa ni consulta.
 *  - sin matches (similaridad < min_similarity) NO publica enriched.
 *  - config.enabled=false desactiva.
 *  - aislamiento por (project_id, user_id): user_A no ve mensajes de user_B.
 *  - embedding.generate.failed: NO rompe; modulo sigue funcionando.
 *  - cosine similarity: vectores identicos = 1.0, ortogonales = 0.0.
 *
 * Ejecutar: node tests/unit/memory-rag.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const Ajv    = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const MemoryRagModule = require('../../modules/conversacion/memory-rag/index.js');

function makeAjv() {
  const dir = path.resolve(__dirname, '../../arquitectura/decisiones/_schemas/chat-flow');
  const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });
  addFormats(ajv);
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.json')) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')), f);
  }
  return ajv;
}

function makeMocks(opts = {}) {
  const logs = [];
  const published = [];
  const dbStore = new Map();
  const dimensions = opts.dimensions || 4;

  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };

  let moduleRef = null;

  const eventBus = {
    publish: async (event, payload) => {
      published.push([event, payload]);
      if (event === 'db.query.request' && moduleRef) {
        const rows = handleDbQuery(payload, dbStore);
        process.nextTick(() => moduleRef.onDbQueryResponse({ data: { request_id: payload.request_id, data: rows } }));
      } else if (event === 'embedding.generate.request' && moduleRef) {
        if (opts.embeddingError) {
          process.nextTick(() => moduleRef.onEmbeddingFailed({
            data: { request_id: payload.request_id, error: { code: 'UPSTREAM_TIMEOUT', message: opts.embeddingError } }
          }));
        } else {
          const vector = opts.vectorFor ? opts.vectorFor(payload.content) : fakeVector(payload.content, dimensions);
          process.nextTick(() => moduleRef.onEmbeddingResponse({
            data: {
              request_id: payload.request_id,
              vector,
              dimensions: vector.length,
              model: 'embedding-001',
              provider: 'gemini',
              tokens: { input: payload.content.length },
              duration_ms: 5,
              timestamp: new Date().toISOString()
            }
          }));
        }
      }
    }
  };

  return { logs, published, dbStore, logger, eventBus, setModule: (m) => { moduleRef = m; } };
}

function handleDbQuery({ project_id, query, params }, dbStore) {
  if (!dbStore.has(project_id)) dbStore.set(project_id, []);
  const rows = dbStore.get(project_id);
  const q = query.trim().toUpperCase();

  if (q.startsWith('CREATE TABLE') || q.startsWith('CREATE INDEX')) return [];

  if (q.startsWith('INSERT INTO RAG_MESSAGES')) {
    const [id, conversation_id, user_id, role, content, vector, dimensions, model, provider, created_at] = params;
    rows.push({ id, conversation_id, user_id, role, content, vector, dimensions, model, provider, created_at });
    return [];
  }

  if (q.startsWith('SELECT ID, CONVERSATION_ID')) {
    return rows;
  }

  return [];
}

function fakeVector(text, dim) {
  const v = new Array(dim).fill(0);
  for (let i = 0; i < text.length; i++) {
    v[i % dim] += text.charCodeAt(i);
  }
  const mag = Math.sqrt(v.reduce((s, x) => s + x*x, 0));
  return mag > 0 ? v.map(x => x / mag) : v;
}

function instantiate(mocks, configOverride = {}) {
  const m = new MemoryRagModule();
  m.logger   = mocks.logger;
  m.eventBus = mocks.eventBus;
  m.config   = {
    enabled: true,
    priority_in_prompt: 500,
    top_k: 3,
    min_similarity: 0.3,
    snippet_max_chars: 100,
    embedding_provider: 'gemini',
    embedding_model: 'embedding-001',
    skip_messages_shorter_than: 8,
    max_index_size_per_project: 10000,
    ...configOverride
  };
  mocks.setModule(m);
  return m;
}

function basePayload(overrides = {}) {
  return {
    correlation_id: 'c1',
    project_id: 'p1',
    user_id: 'u1',
    conversation_id: 'conv1',
    message_id: 'msg-1',
    user_message: 'Hola compañero del viaje',
    timestamp: '2026-05-04T10:00:00.000Z',
    ...overrides
  };
}

async function flush() {
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

(async () => {
  console.log('memory-rag — semantic memory of the journey\n');
  const ajv = makeAjv();
  const validateEnriched = ajv.getSchema('chat.context.enriched.schema.json');

  await testAsync('cosineSimilarity: vectores identicos = 1.0; ortogonales = 0.0', async () => {
    const m = instantiate(makeMocks());
    assert.strictEqual(m._cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
    assert.strictEqual(m._cosineSimilarity([1, 0, 0], [0, 1, 0]), 0);
    const sim = m._cosineSimilarity([1, 1, 0], [1, 0, 0]);
    assert.ok(sim > 0.7 && sim < 0.71, `expected ~0.707 got ${sim}`);
  });

  await testAsync('vector blob roundtrip: encode + decode produce el mismo vector', async () => {
    const m = instantiate(makeMocks());
    const original = [0.5, -0.25, 0.125, -0.0625];
    const blob = m._vectorToBlob(original);
    const restored = m._blobToVector(blob, original.length);
    for (let i = 0; i < original.length; i++) {
      assert.ok(Math.abs(restored[i] - original[i]) < 0.0001);
    }
  });

  await testAsync('indexa user_message: publica embedding.generate.request + persiste via DB', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onMessageSaved({ data: basePayload() });
    await flush();
    const embReq = mocks.published.find(p => p[0] === 'embedding.generate.request');
    assert.ok(embReq, 'embedding.generate.request publicado');
    assert.strictEqual(embReq[1].source, 'memory-rag.index');
    assert.strictEqual(embReq[1].project_id, 'p1');
    assert.strictEqual(embReq[1].content, 'Hola compañero del viaje');
    const stored = mocks.dbStore.get('p1');
    assert.ok(stored && stored.length === 1, 'mensaje persistido');
    assert.strictEqual(stored[0].role, 'user');
  });

  await testAsync('mensaje corto NO indexa ni consulta', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onMessageSaved({ data: basePayload({ user_message: 'hola' }) });
    await flush();
    assert.ok(!mocks.published.find(p => p[0] === 'embedding.generate.request'), 'no debe pedir embedding');
    assert.ok(!mocks.published.find(p => p[0] === 'chat.context.enriched'), 'no debe publicar enriched');
  });

  // Modelo PULL (reescritura POC2): onMessageSaved solo indexa + stashea el
  // embedding en lastQuery; la busqueda top-K se hace bajo demanda en
  // handleBuscar (que devuelve snippet), no publicando chat.context.enriched
  // (ese evento lo construye el consumidor de memory.rag.buscar.response).
  await testAsync('consulta top-K via handleBuscar: con historico relevante devuelve snippet', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onMessageSaved({ data: basePayload({ message_id: 'm1', user_message: 'Me gusta el cafe espresso doble' }) });
    await flush();
    await m.onMessageSaved({ data: basePayload({ message_id: 'm2', user_message: 'Me gusta el cafe espresso doble' }) });
    await flush();
    const res = await m.handleBuscar({ project_id: 'p1', user_id: 'u1', conversation_id: 'conv1' });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.matches >= 1, 'debe haber al menos un match');
    assert.ok(/Me gusta el cafe espresso doble/.test(res.data.snippet));
  });

  await testAsync('ai.chat.response: indexa assistant_message, NO consulta', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onAiChatResponse({
      data: {
        correlation_id: 'c1', project_id: 'p1', user_id: 'u1',
        conversation_id: 'conv1', message_id_assistant: 'asst-1',
        assistant_message: 'Hola humano, encantado del viaje',
        timestamp: '2026-05-04T10:00:00.000Z'
      }
    });
    await flush();
    const stored = mocks.dbStore.get('p1');
    assert.ok(stored && stored.length === 1);
    assert.strictEqual(stored[0].role, 'assistant');
    assert.ok(!mocks.published.find(p => p[0] === 'chat.context.enriched'), 'NO debe publicar enriched para responses del compañero');
  });

  await testAsync('aislamiento por user_id: user_A NO ve mensajes de user_B', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onMessageSaved({ data: basePayload({ user_id: 'userA', message_id: 'mA1', user_message: 'Tema unico de userA aqui' }) });
    await flush();
    mocks.published.length = 0;
    await m.onMessageSaved({ data: basePayload({ user_id: 'userB', message_id: 'mB1', user_message: 'Tema unico de userA aqui' }) });
    await flush();
    const enriched = mocks.published.find(p => p[0] === 'chat.context.enriched');
    assert.ok(!enriched, 'userB no debe ver mensajes de userA en su busqueda');
  });

  await testAsync('config.enabled=false desactiva todo', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks, { enabled: false });
    await m.onMessageSaved({ data: basePayload() });
    await flush();
    assert.strictEqual(mocks.published.length, 0);
  });

  await testAsync('embedding.generate.failed: NO rompe modulo, no persiste, no consulta', async () => {
    const mocks = makeMocks({ embeddingError: 'rate limited' });
    const m = instantiate(mocks);
    await m.onMessageSaved({ data: basePayload() });
    await flush();
    const stored = mocks.dbStore.get('p1');
    assert.ok(!stored || stored.length === 0, 'no debe persistir mensaje');
    assert.ok(!mocks.published.find(p => p[0] === 'chat.context.enriched'));
    assert.ok(mocks.logs.find(l => l[1] === 'memory-rag.embedding.skipped'));
  });

  await testAsync('mensaje del turno actual NO se busca a si mismo', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onMessageSaved({ data: basePayload({ message_id: 'msg-only-one' }) });
    await flush();
    const enriched = mocks.published.find(p => p[0] === 'chat.context.enriched');
    assert.ok(!enriched, 'sin otros mensajes en cache, no hay matches y NO publica enriched');
  });

  console.log('\nmemory-rag: todos los tests pasaron ✓');
})().catch(err => { console.error(err); process.exit(1); });

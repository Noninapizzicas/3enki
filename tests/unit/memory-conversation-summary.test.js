/**
 * Tests unitarios para memory-conversation-summary.
 *
 * Foco:
 *  - threshold trigger: cuando counter >= summarize_after_messages se
 *    dispara llm.complete.request.
 *  - dedup: si ya hay summary in-flight, no se dispara otro.
 *  - persistencia: el summary generado se persiste en SQLite mock.
 *  - en cada chat.message.saved con summary previo se publica
 *    chat.context.enriched con priority configurada.
 *  - chat.context.enriched VALIDA contra el JSON Schema oficial.
 *  - config.enabled=false desactiva el modulo (no publica nada).
 *  - sin user_message NO publica ni rompe.
 *  - LLM error NO rompe el modulo (logged, summary not stored).
 *
 * Ejecutar: node tests/unit/memory-conversation-summary.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const Ajv    = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const MemoryModule = require('../../modules/conversacion/memory-conversation-summary/index.js');

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
  const messages = opts.messages || [
    { role: 'user', content: 'Hola compañero', created_at: 1000 },
    { role: 'assistant', content: 'Hola', created_at: 2000 },
    { role: 'user', content: 'Cuentame de marketing', created_at: 3000 }
  ];

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
        const rows = handleDbQuery(payload, dbStore, messages);
        process.nextTick(() => moduleRef.onDbQueryResponse({ data: { request_id: payload.request_id, data: rows } }));
      } else if (event === 'llm.complete.request' && moduleRef) {
        if (opts.llmError) {
          process.nextTick(() => moduleRef.onLlmFailed({
            data: { request_id: payload.request_id, error: { code: 'UNKNOWN_ERROR', message: opts.llmError } }
          }));
        } else {
          const summary = opts.llmSummary || 'El usuario hablo de marketing y compañero respondio.';
          process.nextTick(() => moduleRef.onLlmResponse({
            data: { request_id: payload.request_id, result: { content: summary } }
          }));
        }
      }
    }
  };

  return { logs, published, dbStore, messages, logger, eventBus, setModule: (m) => { moduleRef = m; } };
}

function handleDbQuery({ project_id, query, params }, dbStore, messages) {
  if (!dbStore.has(project_id)) dbStore.set(project_id, new Map());
  const summaries = dbStore.get(project_id);
  const q = query.trim().toUpperCase();

  if (q.startsWith('CREATE TABLE') || q.startsWith('CREATE INDEX')) return [];

  if (q.startsWith('INSERT INTO CONVERSATION_SUMMARIES')) {
    const [conversation_id, user_id, summary, last_message_id, message_count_at_summary, updated_at] = params;
    summaries.set(conversation_id, { conversation_id, user_id, summary, last_message_id, message_count_at_summary, updated_at });
    return [];
  }

  if (q.startsWith('SELECT SUMMARY')) {
    const [conversation_id] = params;
    const row = summaries.get(conversation_id);
    return row ? [row] : [];
  }

  if (q.startsWith('SELECT ROLE')) {
    return messages;
  }

  return [];
}

function instantiate(mocks, configOverride = {}) {
  const m = new MemoryModule();
  m.logger   = mocks.logger;
  m.eventBus = mocks.eventBus;
  m.config   = {
    enabled: true,
    priority_in_prompt: 200,
    summarize_after_messages: 3,
    summary_max_chars: 200,
    llm_model: 'deepseek-chat',
    llm_provider: 'deepseek',
    llm_temperature: 0.3,
    llm_max_tokens: 200,
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
    user_message: 'Hola',
    timestamp: '2026-05-04T10:00:00.000Z',
    ...overrides
  };
}

async function flush() {
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

(async () => {
  console.log('memory-conversation-summary — narrative memory of the journey\n');
  const ajv = makeAjv();
  const validateEnriched = ajv.getSchema('chat.context.enriched.schema.json');

  await testAsync('threshold no alcanzado: NO dispara llm.complete.request', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks, { summarize_after_messages: 5 });
    await m.onMessageSaved({ data: basePayload() });
    await flush();
    assert.ok(!mocks.published.find(p => p[0] === 'llm.complete.request'), 'no debe pedir summary aun');
  });

  await testAsync('threshold alcanzado: dispara llm.complete.request y persiste summary', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks, { summarize_after_messages: 1 });
    await m.onMessageSaved({ data: basePayload({ message_id: 'msg-a' }) });
    await flush();
    await flush();
    const llmReq = mocks.published.find(p => p[0] === 'llm.complete.request');
    assert.ok(llmReq, 'debe haber pedido summary al LLM');
    assert.ok(llmReq[1].request_id, 'request_id presente');
    assert.strictEqual(llmReq[1].settings.model, 'deepseek-chat');
    const stored = mocks.dbStore.get('p1');
    assert.ok(stored && stored.has('conv1'), 'summary persistido en mock');
    const row = stored.get('conv1');
    assert.ok(row.summary && row.summary.length > 0);
  });

  await testAsync('summary previo: cada chat.message.saved publica chat.context.enriched', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks, { summarize_after_messages: 1 });
    await m.onMessageSaved({ data: basePayload({ message_id: 'msg-1' }) });
    await flush(); await flush();
    mocks.published.length = 0;
    await m.onMessageSaved({ data: basePayload({ message_id: 'msg-2' }) });
    await flush(); await flush();
    const enriched = mocks.published.find(p => p[0] === 'chat.context.enriched');
    assert.ok(enriched, 'chat.context.enriched publicado');
    assert.strictEqual(enriched[1].source, 'memory-conversation-summary');
    assert.strictEqual(enriched[1].priority, 200);
    assert.ok(/Resumen de la conversacion/.test(enriched[1].context_addition));
  });

  await testAsync('chat.context.enriched VALIDA contra el JSON Schema oficial', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks, { summarize_after_messages: 1 });
    await m.onMessageSaved({ data: basePayload({ message_id: 'msg-1' }) });
    await flush(); await flush();
    await m.onMessageSaved({ data: basePayload({ message_id: 'msg-2' }) });
    await flush(); await flush();
    const enriched = mocks.published.find(p => p[0] === 'chat.context.enriched');
    const ok = validateEnriched(enriched[1]);
    assert.ok(ok, `payload debe validar. errors: ${JSON.stringify(validateEnriched.errors)}`);
  });

  await testAsync('summary in-flight evita duplicar request al LLM', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks, { summarize_after_messages: 1 });
    m.summaryInFlight.add('conv1');
    await m.onMessageSaved({ data: basePayload({ message_id: 'msg-1' }) });
    await flush();
    assert.ok(!mocks.published.find(p => p[0] === 'llm.complete.request'), 'no debe pedir un segundo summary');
  });

  await testAsync('config.enabled=false desactiva el modulo (no publica nada)', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks, { enabled: false });
    await m.onMessageSaved({ data: basePayload() });
    await flush();
    assert.strictEqual(mocks.published.length, 0);
  });

  await testAsync('sin user_message NO publica ni rompe', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onMessageSaved({ data: basePayload({ user_message: undefined }) });
    await flush();
    assert.strictEqual(mocks.published.length, 0);
  });

  await testAsync('LLM error: NO rompe el modulo, summary NO se persiste', async () => {
    const mocks = makeMocks({ llmError: 'upstream timeout' });
    const m = instantiate(mocks, { summarize_after_messages: 1 });
    await m.onMessageSaved({ data: basePayload({ message_id: 'msg-fail' }) });
    await flush(); await flush();
    const stored = mocks.dbStore.get('p1');
    assert.ok(!stored || !stored.has('conv1'), 'no debe haber summary persistido');
    assert.ok(mocks.logs.find(l => l[1] === 'memory-conversation-summary.summarize.scheduling_failed'));
    assert.strictEqual(m.summaryInFlight.has('conv1'), false, 'flag liberado tras fallo');
  });

  await testAsync('aislamiento por conversation_id: dos conversaciones distintas tienen counters separados', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks, { summarize_after_messages: 5 });
    await m.onMessageSaved({ data: basePayload({ conversation_id: 'A', message_id: 'a1' }) });
    await m.onMessageSaved({ data: basePayload({ conversation_id: 'A', message_id: 'a2' }) });
    await m.onMessageSaved({ data: basePayload({ conversation_id: 'B', message_id: 'b1' }) });
    await flush();
    assert.strictEqual(m.messageCounters.get('A'), 2);
    assert.strictEqual(m.messageCounters.get('B'), 1);
  });

  console.log('\nmemory-conversation-summary: todos los tests pasaron ✓');
})().catch(err => { console.error(err); process.exit(1); });

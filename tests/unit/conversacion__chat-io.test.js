/**
 * Tests unitarios — chat-io v2.0.0 (POC2 #10 reescritura).
 *
 * Foco:
 *  - Lifecycle (onLoad, onUnload limpia pendingDb + knownConversations + schemaReady).
 *  - Validacion canonica de UI handlers (8) → { status, error: { code, message, details } }.
 *    Codes legacy (PROJECT_REQUIRED, CONVERSATION_REQUIRED, MESSAGE_ID_REQUIRED) viajan
 *    en error.details.kind como discriminator UI.
 *  - CRUD: create / list / load / delete / update_settings.
 *  - Send: persiste user message + chat.message.saved con shape chat-flow v1.0.0
 *    (correlation_id, user_id, channel, channel_context, message_id, ...).
 *  - onAiResponse: persiste assistant + chat.assistant.saved + MQTT push.
 *  - onAiFailed: traduce error.code a mensaje user-facing + persiste 'system' message.
 *  - context_stats / toggle_context.
 *  - Helpers POC2.
 *  - Aislamiento: SQLite en memoria via sql.js, mock bus reactivo.
 *
 * Ejecutar: node tests/unit/conversacion__chat-io.test.js
 */

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

const ChatIoModule = require('../../modules/conversacion/chat-io/index.js');

// --------------------------------------------------
// Mock infra
// --------------------------------------------------

const VALID_PROJECT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function makeMocks() {
  const logs = [];
  const published = [];
  const metricsCalls = [];
  const mqttPublished = [];

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

  const mqtt = {
    publish: (topic, payload, opts) => mqttPublished.push([topic, payload, opts])
  };

  return { logs, published, metricsCalls, mqttPublished, logger, metrics, mqtt };
}

async function makeBusBackedBySqlJs(moduleRef, published) {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  function runQuery(query, params) {
    const trimmed = query.trim();
    if (/^select|^pragma/i.test(trimmed)) {
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
    publish: async (event, payload) => {
      published.push([event, payload]);
      if (event === 'db.query.request') {
        const { request_id, query, params } = payload;
        try {
          const rows = runQuery(query, params);
          setImmediate(() => moduleRef.value.onDbQueryResponse({
            data: { request_id, data: rows }
          }));
        } catch (err) {
          setImmediate(() => moduleRef.value.onDbQueryResponse({
            data: { request_id, error: err.message }
          }));
        }
      }
    }
  };

  return { eventBus, db };
}

async function instantiate(mocks) {
  const moduleRef = { value: null };
  const { eventBus, db } = await makeBusBackedBySqlJs(moduleRef, mocks.published);
  const m = new ChatIoModule();
  moduleRef.value = m;
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus,
    mqtt: mocks.mqtt
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

async function createConversation(m, opts = {}) {
  const r = await m.handleCreate({
    project_id: VALID_PROJECT,
    title: opts.title || 'Test',
    context_window: opts.context_window
  });
  if (!r.data) throw new Error(`create failed: ${JSON.stringify(r)}`);
  return r.data.conversation_id;
}

// ==================================================
//                                                Tests
// ==================================================

(async () => {
  console.log('chat-io — reescritura canonica v2.0.0 (POC2 #10)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa state vacio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.pendingDb.size, 0);
    assert.strictEqual(m.knownConversations.size, 0);
    assert.strictEqual(m.schemaReady.size, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia pendingDb + knownConversations + schemaReady sin leak', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let rejected = false;
    m.pendingDb.set('leak-1', {
      resolve: () => {},
      reject: () => { rejected = true; },
      timeout: setTimeout(() => {}, 60000)
    });
    m.knownConversations.set('c1', VALID_PROJECT);
    m.schemaReady.add(VALID_PROJECT);

    await m.onUnload();
    assert.strictEqual(m.pendingDb.size, 0);
    assert.strictEqual(rejected, true);
    assert.strictEqual(m.knownConversations.size, 0);
    assert.strictEqual(m.schemaReady.size, 0);
  });

  // ==========================================
  // Group 2: Validacion canonica de handlers
  // ==========================================

  await testAsync('handleSend sin project_id → 400 VALIDATION_FAILED + kind=PROJECT_REQUIRED', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleSend({ message: 'hola' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'VALIDATION_FAILED');
    assert.strictEqual(r.error.details.kind, 'PROJECT_REQUIRED');
    await m.onUnload();
  });

  await testAsync('handleSend project_id no UUID → 400 VALIDATION_FAILED', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleSend({ project_id: 'not-uuid', conversation_id: 'x', message: 'hi' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('handleSend sin conversation_id → 400 + kind=CONVERSATION_REQUIRED', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleSend({ project_id: VALID_PROJECT, message: 'hi' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.details.kind, 'CONVERSATION_REQUIRED');
    await m.onUnload();
  });

  await testAsync('handleSend conversation no existe → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleSend({
      project_id: VALID_PROJECT,
      conversation_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      message: 'hi'
    });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleCreate sin project_id → 400 VALIDATION_FAILED', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreate({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('handleToggleContext sin message_id → 400 + kind=MESSAGE_ID_REQUIRED', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleToggleContext({ project_id: VALID_PROJECT, in_context: true });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.details.kind, 'MESSAGE_ID_REQUIRED');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: CRUD create/list/load/delete/update
  // ==========================================

  await testAsync('handleCreate devuelve conversation con shape canonico + 201', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreate({ project_id: VALID_PROJECT, title: 'Hola' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 201);
    assert.ok(r.data.conversation);
    assert.strictEqual(r.data.conversation.title, 'Hola');
    assert.strictEqual(r.data.conversation.context_window, 20);
    assert.ok(r.data.conversation_id);
    await m.onUnload();
  });

  await testAsync('handleList devuelve conversations[] + count', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await createConversation(m, { title: 'A' });
    await createConversation(m, { title: 'B' });
    const r = await m.handleList({ project_id: VALID_PROJECT });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.count, 2);
    assert.strictEqual(r.data.conversations.length, 2);
    await m.onUnload();
  });

  await testAsync('handleLoad devuelve conversation + messages[]', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const cid = await createConversation(m);
    await m.handleSend({ project_id: VALID_PROJECT, conversation_id: cid, message: 'hi' });

    const r = await m.handleLoad({ project_id: VALID_PROJECT, conversation_id: cid });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.conversation.id, cid);
    assert.strictEqual(r.data.messages.length, 1);
    assert.strictEqual(r.data.messages[0].role, 'user');
    assert.strictEqual(r.data.messages[0].content, 'hi');
    await m.onUnload();
  });

  await testAsync('handleDelete borra conversation + messages + cache', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const cid = await createConversation(m);
    await m.handleSend({ project_id: VALID_PROJECT, conversation_id: cid, message: 'hi' });

    const r = await m.handleDelete({ project_id: VALID_PROJECT, conversation_id: cid });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.deleted, true);
    assert.strictEqual(m.knownConversations.has(cid), false);

    const list = await m.handleList({ project_id: VALID_PROJECT });
    assert.strictEqual(list.data.count, 0);
    await m.onUnload();
  });

  await testAsync('handleUpdateSettings actualiza context_window + temperature', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const cid = await createConversation(m);
    const r = await m.handleUpdateSettings({
      project_id: VALID_PROJECT, conversation_id: cid,
      context_window: 50, temperature: 0.9
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.updated, true);
    const load = await m.handleLoad({ project_id: VALID_PROJECT, conversation_id: cid });
    assert.strictEqual(load.data.conversation.context_window, 50);
    assert.strictEqual(load.data.conversation.temperature, 0.9);
    await m.onUnload();
  });

  await testAsync('handleUpdateSettings sin cambios → updated:false changed:0', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const cid = await createConversation(m);
    const r = await m.handleUpdateSettings({ project_id: VALID_PROJECT, conversation_id: cid });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.updated, false);
    assert.strictEqual(r.data.changed, 0);
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Send + chat.message.saved canonical
  // ==========================================

  await testAsync('handleSend persiste user + publica chat.message.saved con shape chat-flow v1.0.0', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const cid = await createConversation(m);
    mocks.published.length = 0;

    const r = await m.handleSend({
      project_id: VALID_PROJECT, conversation_id: cid,
      message: 'hola companero',
      user_id: 'user-42',
      correlation_id: 'cid-abc',
      channel: 'telegram',
      channel_context: { chat_id: 12345 },
      attachments: [{ name: 'foo.png' }],
      intencion: 'consulta'
    });
    assert.strictEqual(r.status, 200);

    const events = publishedOf(mocks, 'chat.message.saved');
    assert.strictEqual(events.length, 1);
    const ev = events[0];
    assert.strictEqual(ev.correlation_id, 'cid-abc');
    assert.strictEqual(ev.conversation_id, cid);
    assert.strictEqual(ev.project_id, VALID_PROJECT);
    assert.strictEqual(ev.user_id, 'user-42');
    assert.strictEqual(ev.channel, 'telegram');
    assert.deepStrictEqual(ev.channel_context, { chat_id: 12345 });
    assert.strictEqual(ev.user_message, 'hola companero');
    assert.strictEqual(ev.intencion, 'consulta');
    assert.deepStrictEqual(ev.attachments, [{ name: 'foo.png' }]);
    assert.ok(ev.message_id);
    assert.ok(ev.timestamp);
    await m.onUnload();
  });

  await testAsync('handleSend sin correlation_id → genera uno nuevo', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const cid = await createConversation(m);
    mocks.published.length = 0;

    await m.handleSend({ project_id: VALID_PROJECT, conversation_id: cid, message: 'hi' });
    const ev = publishedOf(mocks, 'chat.message.saved')[0];
    assert.ok(ev.correlation_id);
    assert.strictEqual(ev.user_id, 'default');
    assert.strictEqual(ev.channel, 'web');
    await m.onUnload();
  });

  // ==========================================
  // Group 5: onAiResponse + onAiFailed
  // ==========================================

  await testAsync('onAiResponse persiste assistant + publica chat.assistant.saved + MQTT push', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const cid = await createConversation(m);
    mocks.published.length = 0;
    mocks.mqttPublished.length = 0;

    await m.onAiResponse({
      data: {
        project_id: VALID_PROJECT,
        conversation_id: cid,
        assistant_message: 'respuesta del companero',
        message_id_assistant: 'msg-x',
        tokens: { input: 10, output: 20, total: 30 },
        cost: { amount: 0.01, currency: 'USD' },
        channel: 'web',
        correlation_id: 'cid-resp'
      }
    });

    const saved = publishedOf(mocks, 'chat.assistant.saved');
    assert.strictEqual(saved.length, 1);
    assert.strictEqual(saved[0].assistant_message, 'respuesta del companero');
    assert.strictEqual(saved[0].correlation_id, 'cid-resp');
    assert.strictEqual(saved[0].message_id, 'msg-x');

    assert.strictEqual(mocks.mqttPublished.length, 1);
    assert.strictEqual(mocks.mqttPublished[0][0], `conversation/${cid}/message`);
    const mqttPayload = JSON.parse(mocks.mqttPublished[0][1]);
    assert.strictEqual(mqttPayload.role, 'assistant');
    assert.strictEqual(mqttPayload.content, 'respuesta del companero');
    await m.onUnload();
  });

  await testAsync('onAiResponse channel != web → no MQTT push (agnosticismo de canal)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const cid = await createConversation(m);
    mocks.mqttPublished.length = 0;

    await m.onAiResponse({
      data: {
        project_id: VALID_PROJECT,
        conversation_id: cid,
        assistant_message: 'hi',
        channel: 'telegram',
        correlation_id: 'c1'
      }
    });
    assert.strictEqual(mocks.mqttPublished.length, 0);
    await m.onUnload();
  });

  await testAsync('onAiResponse sin campos requeridos → warn + no publica', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;

    await m.onAiResponse({ data: { conversation_id: 'x' } });
    assert.strictEqual(publishedOf(mocks, 'chat.assistant.saved').length, 0);
    const warns = mocks.logs.filter(l => l[0] === 'warn');
    assert.ok(warns.some(w => w[1].includes('invalid_payload')));
    await m.onUnload();
  });

  await testAsync('onAiFailed traduce error.code a user message + persiste system message + MQTT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const cid = await createConversation(m);
    mocks.mqttPublished.length = 0;

    await m.onAiFailed({
      data: {
        project_id: VALID_PROJECT,
        conversation_id: cid,
        message_id: 'm1',
        error: { code: 'UPSTREAM_TIMEOUT', message: 'LLM timeout 30s' },
        channel: 'web',
        correlation_id: 'c1'
      }
    });
    assert.strictEqual(mocks.mqttPublished.length, 1);
    const payload = JSON.parse(mocks.mqttPublished[0][1]);
    assert.strictEqual(payload.role, 'system');
    assert.ok(/Tarde mas de la cuenta/.test(payload.content));
    assert.strictEqual(payload.metadata.error_code, 'UPSTREAM_TIMEOUT');

    const load = await m.handleLoad({ project_id: VALID_PROJECT, conversation_id: cid });
    const sysMsg = load.data.messages.find(msg => msg.role === 'system');
    assert.ok(sysMsg);
    assert.ok(/Tarde mas de la cuenta/.test(sysMsg.content));
    await m.onUnload();
  });

  await testAsync('onAiFailed code desconocido → mensaje fallback con el code', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const cid = await createConversation(m);
    mocks.mqttPublished.length = 0;

    await m.onAiFailed({
      data: {
        project_id: VALID_PROJECT,
        conversation_id: cid,
        error: { code: 'WEIRD_CODE', message: 'unexpected' },
        channel: 'web'
      }
    });
    assert.strictEqual(mocks.mqttPublished.length, 1);
    const content = JSON.parse(mocks.mqttPublished[0][1]).content;
    assert.ok(/WEIRD_CODE/.test(content));
    await m.onUnload();
  });

  // ==========================================
  // Group 6: context_stats + toggle_context
  // ==========================================

  await testAsync('handleContextStats devuelve total/active/manually_toggled/max/remaining', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const cid = await createConversation(m, { context_window: 5 });
    await m.handleSend({ project_id: VALID_PROJECT, conversation_id: cid, message: 'a' });
    await m.handleSend({ project_id: VALID_PROJECT, conversation_id: cid, message: 'b' });

    const r = await m.handleContextStats({ project_id: VALID_PROJECT, conversation_id: cid });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.total, 2);
    assert.strictEqual(r.data.active, 2);
    assert.strictEqual(r.data.max_context, 5);
    assert.strictEqual(r.data.remaining, 3);
    await m.onUnload();
  });

  await testAsync('handleToggleContext marca message in_context=0 + manually_toggled=1', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const cid = await createConversation(m);
    const sendR = await m.handleSend({
      project_id: VALID_PROJECT, conversation_id: cid, message: 'msg para toggle'
    });
    const messageId = sendR.data.message_id;

    const r = await m.handleToggleContext({
      project_id: VALID_PROJECT, message_id: messageId, in_context: false
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.in_context, false);
    assert.strictEqual(r.data.manually_toggled, true);
    await m.onUnload();
  });

  // ==========================================
  // Group 7: Helpers POC2 internos
  // ==========================================

  await testAsync('_errorResponse construye shape canonico { status, error: { code, message, details? } }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = m._errorResponse(400, 'VALIDATION_FAILED', 'msg', { field: 'x' });
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'VALIDATION_FAILED', message: 'msg', details: { field: 'x' } } });
    const r2 = m._errorResponse(500, 'INTERNAL_ERROR', 'oops');
    assert.deepStrictEqual(r2, { status: 500, error: { code: 'INTERNAL_ERROR', message: 'oops' } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea por mensaje a codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(new Error('Conversation not found')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'VALIDATION_FAILED');
    assert.strictEqual(m._classifyHandlerError(new Error('must be UUID')), 'VALIDATION_FAILED');
    assert.strictEqual(m._classifyHandlerError(new Error('upstream timeout')), 'UPSTREAM_UNAVAILABLE');
    assert.strictEqual(m._classifyHandlerError(new Error('something exploded')), 'INTERNAL_ERROR');
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
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'chat-io.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  await testAsync('_userMessageForErrorCode mapea codigos canonicos a mensajes legibles', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.ok(/Tarde mas de la cuenta/.test(m._userMessageForErrorCode('UPSTREAM_TIMEOUT')));
    assert.ok(/credenciales/.test(m._userMessageForErrorCode('CREDENTIAL_NOT_FOUND')));
    assert.ok(/desconocido|completar/.test(m._userMessageForErrorCode('NOT_IN_MAP', 'msg')));
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})();

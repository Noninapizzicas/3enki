/**
 * Tests unitarios para chat-io tras migracion B2 (chat-flow v1.0.0).
 *
 * Foco:
 *  - handleSend publica chat.message.saved con shape canonico (correlation_id,
 *    user_id, channel, channel_context, user_message en vez de message, etc.).
 *  - onAiResponse acepta shape canonico (assistant_message + message_id_assistant
 *    + tokens objeto).
 *  - onAiFailed mapea error codes canonicos a mensajes legibles al usuario.
 *  - El payload publicado VALIDA contra el schema chat-flow JSON Schema.
 *
 * Ejecutar: node tests/unit/chat-io.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const Ajv    = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const ChatIoModule = require('../../modules/conversacion/chat-io/index.js');

// ----------------------------------------------------------------- helpers

function makeAjv() {
  const dir = path.resolve(__dirname, '../../arquitectura/decisiones/_schemas/chat-flow');
  const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });
  addFormats(ajv);
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.json')) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')), f);
  }
  return ajv;
}

function makeMocks() {
  const logs = [];
  const published = [];
  const mqttPublished = [];
  const dbCalls = [];

  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };
  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); }
  };
  const mqtt = {
    publish: (topic, msg, opts) => { mqttPublished.push({ topic, msg, opts }); }
  };

  return { logs, published, mqttPublished, dbCalls, logger, eventBus, mqtt };
}

function instantiateAndStub(mocks) {
  const m = new ChatIoModule();
  m.logger   = mocks.logger;
  m.eventBus = mocks.eventBus;
  m.mqtt     = mocks.mqtt;
  // Stubs minimos para evitar dependencia real de DB
  m._ensureSchema = async () => {};
  m._validateConversation = async () => true;
  m._db = async (project_id, sql, params, returnRows) => {
    mocks.dbCalls.push({ sql: sql.trim().slice(0, 60), params });
    if (returnRows && /SELECT context_window/.test(sql)) {
      return [{ context_window: 30, temperature: 0.7, max_tokens: 2000 }];
    }
    return [];
  };
  m._applyContextFIFO = async () => {};
  return m;
}

async function testAsync(description, fn) {
  try {
    await fn();
    console.log(`✓ ${description}`);
  } catch (error) {
    console.error(`✗ ${description}`);
    console.error(`  ${error.message}`);
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  }
}

// ----------------------------------------------------------------- tests

(async () => {
  console.log('chat-io — B2 migracion chat-flow v1.0.0\n');

  const ajv = makeAjv();
  const validateMessageSaved = ajv.getSchema('chat.message.saved.schema.json');
  // Para validar uuid en project_id/conversation_id, usar uuids reales
  const uuid1 = '12345678-1234-4234-9234-123456789012';
  const uuid2 = '87654321-4321-4321-8321-210987654321';

  // ============================================================ B2.1 — handleSend publish

  await testAsync('handleSend publica chat.message.saved con shape canonico', async () => {
    const mocks = makeMocks();
    const m = instantiateAndStub(mocks);
    await m.handleSend({
      project_id: uuid1,
      conversation_id: uuid2,
      message: 'Hola compañero',
      page_id: 'recetas',
      context: { current_page: 'recetas', selected_id: 'r-1' },
      attachments: [{ type: 'pdf', ref: '/tmp/foo.pdf' }],
      intencion: 'consulta'
    });
    const ev = mocks.published.find(p => p[0] === 'chat.message.saved');
    assert.ok(ev, 'debe publicar chat.message.saved');
    const payload = ev[1];

    assert.strictEqual(payload.user_message, 'Hola compañero', 'campo user_message (no message)');
    assert.strictEqual(payload.user_id, 'default', 'user_id default single-user');
    assert.strictEqual(payload.channel, 'web', 'channel default web');
    assert.deepStrictEqual(payload.channel_context, {}, 'channel_context vacio');
    assert.ok(payload.correlation_id && payload.correlation_id.length > 0, 'correlation_id generado');
    assert.ok(payload.timestamp && payload.timestamp.includes('T'), 'timestamp ISO 8601');
    assert.ok(payload.message_id, 'message_id presente');
    assert.deepStrictEqual(payload.page_context, { current_page: 'recetas', selected_id: 'r-1' }, 'page_context preservado');
    assert.strictEqual(payload.message, undefined, 'campo message no debe existir (drift cerrado)');
    assert.strictEqual(payload.prompt, undefined, 'campo prompt no debe existir (drift cerrado)');
  });

  await testAsync('handleSend payload valida contra chat.message.saved schema', async () => {
    const mocks = makeMocks();
    const m = instantiateAndStub(mocks);
    await m.handleSend({
      project_id: uuid1,
      conversation_id: uuid2,
      message: 'test',
      page_id: 'chat'
    });
    const payload = mocks.published.find(p => p[0] === 'chat.message.saved')[1];
    const ok = validateMessageSaved(payload);
    assert.ok(ok, `payload debe validar contra schema. Errores: ${JSON.stringify(validateMessageSaved.errors)}`);
  });

  await testAsync('handleSend preserva correlation_id y user_id si vienen del caller', async () => {
    const mocks = makeMocks();
    const m = instantiateAndStub(mocks);
    await m.handleSend({
      project_id: uuid1,
      conversation_id: uuid2,
      message: 'Hola desde Telegram',
      correlation_id: 'corr-from-telegram-123',
      user_id: 'user-99',
      channel: 'telegram',
      channel_context: { chat_id: 12345, telegram_message_id: 99 }
    });
    const payload = mocks.published.find(p => p[0] === 'chat.message.saved')[1];
    assert.strictEqual(payload.correlation_id, 'corr-from-telegram-123');
    assert.strictEqual(payload.user_id, 'user-99');
    assert.strictEqual(payload.channel, 'telegram');
    assert.deepStrictEqual(payload.channel_context, { chat_id: 12345, telegram_message_id: 99 });
  });

  // ============================================================ B2.2 — onAiResponse

  await testAsync('onAiResponse acepta shape canonico (assistant_message + tokens objeto)', async () => {
    const mocks = makeMocks();
    const m = instantiateAndStub(mocks);
    await m.onAiResponse({
      project_id: uuid1,
      conversation_id: uuid2,
      message_id: 'm-user-1',
      message_id_assistant: 'm-assistant-1',
      assistant_message: 'Hola, dime',
      model: 'deepseek-chat',
      provider: 'deepseek',
      tokens: { input: 10, output: 5, total: 15 },
      cost: { amount: 0.0001, currency: 'USD' },
      duration_ms: 350,
      correlation_id: 'corr-1',
      channel: 'web',
      channel_context: {}
    });
    // No warn de shape_legacy
    const warnLegacy = mocks.logs.find(l => l[1] === 'chat-io.onAiResponse.shape_legacy');
    assert.ok(!warnLegacy, 'no debe loguear shape_legacy con shape canonico');
    // Persiste con message_id_assistant como id
    const insertCall = mocks.dbCalls.find(c => /INSERT INTO messages/.test(c.sql));
    assert.ok(insertCall);
    assert.strictEqual(insertCall.params[0], 'm-assistant-1', 'usa message_id_assistant como id de mensaje');
    assert.strictEqual(insertCall.params[2], 'Hola, dime', 'persiste assistant_message');
    assert.strictEqual(insertCall.params[3], 15, 'persiste tokens.total como int');
    // chat.assistant.saved con shape nuevo
    const savedEv = mocks.published.find(p => p[0] === 'chat.assistant.saved');
    assert.ok(savedEv);
    assert.strictEqual(savedEv[1].assistant_message, 'Hola, dime');
    assert.strictEqual(savedEv[1].correlation_id, 'corr-1');
  });

  await testAsync('onAiResponse con channel=telegram NO publica MQTT al frontend web', async () => {
    const mocks = makeMocks();
    const m = instantiateAndStub(mocks);
    await m.onAiResponse({
      project_id: uuid1,
      conversation_id: uuid2,
      assistant_message: 'Respuesta',
      tokens: { input: 1, output: 1, total: 2 },
      channel: 'telegram',           // <-- viene de telegram, no web
      channel_context: { chat_id: 99 }
    });
    assert.strictEqual(mocks.mqttPublished.length, 0, 'NO publica MQTT al frontend web — telegram-service lo hara');
  });

  // ============================================================ B2.3 — onAiFailed

  await testAsync('onAiFailed mapea UPSTREAM_TIMEOUT a mensaje legible al usuario', async () => {
    const mocks = makeMocks();
    const m = instantiateAndStub(mocks);
    await m.onAiFailed({
      project_id: uuid1,
      conversation_id: uuid2,
      message_id: 'm-user-1',
      error: { code: 'UPSTREAM_TIMEOUT', message: 'fetch aborted after 30s' },
      channel: 'web',
      channel_context: {}
    });
    const insertCall = mocks.dbCalls.find(c => /INSERT INTO messages/.test(c.sql));
    assert.ok(insertCall);
    assert.ok(/Tardé más de la cuenta/i.test(insertCall.params[2]), 'mensaje al usuario amigable');
    assert.ok(!/fetch aborted/.test(insertCall.params[2]), 'no expone mensaje tecnico interno');
    // MQTT push al frontend
    assert.strictEqual(mocks.mqttPublished.length, 1);
    const sent = JSON.parse(mocks.mqttPublished[0].msg);
    assert.strictEqual(sent.role, 'system');
    assert.strictEqual(sent.metadata.error_code, 'UPSTREAM_TIMEOUT');
  });

  await testAsync('onAiFailed con RESOURCE_NOT_FOUND avisa de credenciales', async () => {
    const mocks = makeMocks();
    const m = instantiateAndStub(mocks);
    await m.onAiFailed({
      project_id: uuid1,
      conversation_id: uuid2,
      message_id: 'm-user-1',
      error: { code: 'RESOURCE_NOT_FOUND', message: 'no api key for deepseek' },
      channel: 'web',
      channel_context: {}
    });
    const insertCall = mocks.dbCalls.find(c => /INSERT INTO messages/.test(c.sql));
    assert.ok(/credenciales/i.test(insertCall.params[2]));
  });

  await testAsync('onAiFailed con UPSTREAM_INVALID_RESPONSE indica al usuario que la conversacion es demasiado larga', async () => {
    const mocks = makeMocks();
    const m = instantiateAndStub(mocks);
    await m.onAiFailed({
      project_id: uuid1,
      conversation_id: uuid2,
      message_id: 'm-user-1',
      error: { code: 'UPSTREAM_INVALID_RESPONSE', message: 'context_length_exceeded' },
      channel: 'web',
      channel_context: {}
    });
    const insertCall = mocks.dbCalls.find(c => /INSERT INTO messages/.test(c.sql));
    assert.ok(insertCall);
    assert.ok(/demasiado larga|conversaci[oó]n.*larga/i.test(insertCall.params[2]), 'mensaje indica longitud excesiva');
    assert.ok(!/context_length_exceeded/.test(insertCall.params[2]), 'no expone mensaje tecnico interno');
    const sent = JSON.parse(mocks.mqttPublished[0].msg);
    assert.strictEqual(sent.metadata.error_code, 'UPSTREAM_INVALID_RESPONSE');
  });

  await testAsync('onAiFailed con codigo desconocido cae a fallback genérico', async () => {
    const mocks = makeMocks();
    const m = instantiateAndStub(mocks);
    await m.onAiFailed({
      project_id: uuid1,
      conversation_id: uuid2,
      message_id: 'm-user-1',
      error: { code: 'WEIRD_NEW_CODE', message: 'something' },
      channel: 'web',
      channel_context: {}
    });
    const insertCall = mocks.dbCalls.find(c => /INSERT INTO messages/.test(c.sql));
    assert.ok(/WEIRD_NEW_CODE/.test(insertCall.params[2]) || /no pude completar/i.test(insertCall.params[2]));
  });

  console.log('\nchat-io: todos los tests pasaron ✓');
})().catch(err => { console.error(err); process.exit(1); });

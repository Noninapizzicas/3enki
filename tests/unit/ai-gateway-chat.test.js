/**
 * Tests unitarios para ai-gateway tras migracion B4 (chat-flow v1.0.0).
 *
 * Foco:
 *  - onChatPromptReady acepta shape canonico (system_prompt + messages + canales).
 *  - On exito publica ai.chat.response con shape canonico:
 *      assistant_message, message_id_assistant (NUEVO uuid),
 *      tokens objeto {input,output,total}, duration_ms, timestamp,
 *      preserva correlation_id, conversation_id, project_id, user_id, channel, channel_context, message_id.
 *  - Payload ai.chat.response VALIDA contra schema oficial.
 *  - On error publica ai.chat.failed (NO ai.chat.response con error inyectado).
 *  - Mapeo canonico de errores: CREDENTIAL_NOT_FOUND, UPSTREAM_TIMEOUT, UPSTREAM_AUTH_FAILED,
 *    UPSTREAM_RATE_LIMITED, UPSTREAM_5XX, UPSTREAM_UNREACHABLE, INTERNAL_ERROR.
 *  - Payload ai.chat.failed VALIDA contra schema oficial.
 *
 * Ejecutar: node tests/unit/ai-gateway-chat.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const Ajv    = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const AiGatewayModule = require('../../modules/conversacion/ai-gateway/index.js');

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
  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };
  const eventBus = { publish: async (event, payload) => { published.push([event, payload]); } };
  return { logs, published, logger, eventBus };
}

function instantiate(mocks, { execute, executeError } = {}) {
  const m = new AiGatewayModule();
  m.logger   = mocks.logger;
  m.eventBus = mocks.eventBus;
  m.config   = { providers: {}, retry: {}, max_tool_iterations: 10 };
  // Stubs de internals (no DB, no network)
  m._getTools = () => [];
  m._executeLLM = async (...args) => {
    if (executeError) throw executeError;
    return execute || {
      content: 'hola humano',
      tool_calls_executed: [],
      iterations: 1,
      tokens: { input: 12, output: 8, total: 20 },
      cost: 0.0001,
      model: 'deepseek-chat',
      provider: 'deepseek',
      finish_reason: 'stop'
    };
  };
  return m;
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

(async () => {
  console.log('ai-gateway — B4 migracion chat-flow v1.0.0\n');
  const ajv = makeAjv();
  const validateResponse = ajv.getSchema('ai.chat.response.schema.json');
  const validateFailed   = ajv.getSchema('ai.chat.failed.schema.json');

  // Group 1 — onChatPromptReady SUCCESS path

  await testAsync('onChatPromptReady canonico → publica ai.chat.response canonico', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onChatPromptReady({
      correlation_id: 'corr-1',
      conversation_id: 'conv-1',
      project_id: 'proj-1',
      user_id: 'user-99',
      channel: 'telegram',
      channel_context: { chat_id: 12345 },
      message_id: 'm-user-1',
      system_prompt: 'BASE PROMPT\nmodulo=recetas\n',
      messages: [{ role: 'user', content: 'Hola compañero' }],
      timestamp: '2026-05-03T10:00:00.000Z',
      page_id: 'recetas',
      settings: { temperature: 0.7, max_tokens: 1000 }
    });
    const ev = mocks.published.find(p => p[0] === 'ai.chat.response');
    assert.ok(ev, 'ai.chat.response publicado');
    assert.ok(!mocks.published.find(p => p[0] === 'ai.chat.failed'), 'ai.chat.failed NO debe publicarse en success');
    const payload = ev[1];
    assert.strictEqual(payload.correlation_id, 'corr-1');
    assert.strictEqual(payload.conversation_id, 'conv-1');
    assert.strictEqual(payload.project_id, 'proj-1');
    assert.strictEqual(payload.user_id, 'user-99');
    assert.strictEqual(payload.channel, 'telegram');
    assert.deepStrictEqual(payload.channel_context, { chat_id: 12345 });
    assert.strictEqual(payload.message_id, 'm-user-1');
    assert.ok(payload.message_id_assistant && payload.message_id_assistant !== payload.message_id, 'message_id_assistant nuevo y distinto');
    assert.strictEqual(payload.assistant_message, 'hola humano');
    assert.strictEqual(payload.model, 'deepseek-chat');
    assert.strictEqual(payload.provider, 'deepseek');
    assert.deepStrictEqual(payload.tokens, { input: 12, output: 8, total: 20 });
    assert.ok(typeof payload.duration_ms === 'number' && payload.duration_ms >= 0);
    assert.ok(payload.timestamp);
    assert.strictEqual(payload.message, undefined, 'campo message LEGACY no debe existir');
    assert.strictEqual(payload.message_id_user, undefined, 'campo message_id_user LEGACY no debe existir');
    assert.strictEqual(payload.prompt, undefined, 'campo prompt LEGACY no debe existir');
  });

  await testAsync('ai.chat.response VALIDA contra el JSON Schema oficial', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onChatPromptReady({
      correlation_id: 'corr-validate',
      conversation_id: 'conv-x',
      project_id: 'proj-x',
      user_id: 'default',
      channel: 'web',
      channel_context: {},
      message_id: 'm-x',
      system_prompt: 'system',
      messages: [{ role: 'user', content: 'hola' }],
      timestamp: '2026-05-03T10:00:00.000Z'
    });
    const payload = mocks.published.find(p => p[0] === 'ai.chat.response')[1];
    const ok = validateResponse(payload);
    assert.ok(ok, `payload debe validar. errors: ${JSON.stringify(validateResponse.errors)}`);
  });

  await testAsync('onChatPromptReady sin conversation_id descarta payload silenciosamente con warn', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onChatPromptReady({ message_id: 'm-1', system_prompt: 'x', messages: [] });
    assert.strictEqual(mocks.published.length, 0, 'no publica nada');
    assert.ok(mocks.logs.find(l => l[1] === 'ai-gateway.onChatPromptReady.invalid_payload'));
  });

  // Group 2 — onChatPromptReady ERROR path

  await testAsync('on _executeLLM throw → publica ai.chat.failed (NO ai.chat.response)', async () => {
    const mocks = makeMocks();
    const err = new Error('credential resolve timeout: deepseek');
    const m = instantiate(mocks, { executeError: err });
    await m.onChatPromptReady({
      correlation_id: 'corr-err',
      conversation_id: 'conv-1',
      project_id: 'proj-1',
      user_id: 'u',
      channel: 'web',
      channel_context: {},
      message_id: 'm-err',
      system_prompt: 'x',
      messages: [{ role: 'user', content: 'hola' }],
      timestamp: '2026-05-03T10:00:00.000Z'
    });
    assert.ok(!mocks.published.find(p => p[0] === 'ai.chat.response'), 'NO debe publicar ai.chat.response');
    const ev = mocks.published.find(p => p[0] === 'ai.chat.failed');
    assert.ok(ev, 'ai.chat.failed publicado');
    const payload = ev[1];
    assert.strictEqual(payload.correlation_id, 'corr-err');
    assert.strictEqual(payload.error.code, 'CREDENTIAL_NOT_FOUND');
    assert.ok(/credential/i.test(payload.error.message));
    assert.strictEqual(payload.message_id, 'm-err');
    assert.strictEqual(payload.user_id, 'u');
    assert.strictEqual(payload.channel, 'web');
    assert.ok(typeof payload.duration_ms === 'number');
  });

  await testAsync('ai.chat.failed VALIDA contra el JSON Schema oficial', async () => {
    const mocks = makeMocks();
    const err = new Error('upstream 503 service unavailable');
    const m = instantiate(mocks, { executeError: err });
    await m.onChatPromptReady({
      correlation_id: 'corr-v',
      conversation_id: 'conv-v',
      user_id: 'default',
      channel: 'web',
      channel_context: {},
      message_id: 'm-v',
      system_prompt: 'x',
      messages: [{ role: 'user', content: 'hola' }],
      timestamp: '2026-05-03T10:00:00.000Z'
    });
    const payload = mocks.published.find(p => p[0] === 'ai.chat.failed')[1];
    const ok = validateFailed(payload);
    assert.ok(ok, `payload debe validar. errors: ${JSON.stringify(validateFailed.errors)}`);
  });

  await testAsync('clasificacion canonica de errores cubre los codigos esperados', async () => {
    const m = instantiate(makeMocks());
    const cases = [
      ['credential resolve timeout: deepseek', 'CREDENTIAL_NOT_FOUND'],
      ['No hay providers disponibles. Verifica las API keys', 'CREDENTIAL_NOT_FOUND'],
      ['ETIMEDOUT', 'UPSTREAM_TIMEOUT'],
      ['Request failed with 429 rate limit exceeded', 'UPSTREAM_RATE_LIMITED'],
      ['401 unauthorized: invalid api key', 'UPSTREAM_AUTH_FAILED'],
      ['Internal Server Error 500', 'UPSTREAM_5XX'],
      ['fetch failed: ECONNREFUSED', 'UPSTREAM_UNREACHABLE'],
      ['unexpected token < in JSON at position 0', 'UPSTREAM_INVALID_RESPONSE'],
      ['some weird unknown error', 'INTERNAL_ERROR']
    ];
    for (const [msg, expected] of cases) {
      const got = m._classifyError(new Error(msg)).code;
      assert.strictEqual(got, expected, `${msg} → esperaba ${expected}, fue ${got}`);
    }
  });

  console.log('\nai-gateway: todos los tests pasaron ✓');
})().catch(err => { console.error(err); process.exit(1); });

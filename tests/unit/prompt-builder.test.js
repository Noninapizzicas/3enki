/**
 * Tests unitarios para prompt-builder tras migracion B3 (chat-flow v1.0.0).
 *
 * Foco:
 *  - onMessageSaved acepta shape canonico de chat.message.saved.
 *  - publish chat.prompt.ready con shape canonico (system_prompt, no prompt;
 *    correlation_id, user_id, channel preservados).
 *  - onContextEnriched acumula contextos de memorias modulares por message_id.
 *  - Cuando onMessageSaved se ejecuta para un message_id con enrichments
 *    acumulados, los agrega al system prompt por priority y limpia.
 *  - Payload de chat.prompt.ready VALIDA contra el schema oficial.
 *
 * Ejecutar: node tests/unit/prompt-builder.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const Ajv    = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const PromptBuilderModule = require('../../modules/conversacion/prompt-builder/index.js');

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

function instantiateAndStub(mocks) {
  const m = new PromptBuilderModule();
  m.logger   = mocks.logger;
  m.eventBus = mocks.eventBus;
  // Stubs de las internals que dependen de FS / DB / cache
  m._resolveModule = (page_id) => 'recetas';
  m._resolvePromptContent = (id, mod) => ({ name: id || 'default', content: id ? `prompt user ${id}` : '' });
  m._buildSystemPrompt = ({ moduleName, promptObj, context }) =>
    `BASE PROMPT\nmodulo=${moduleName}\nprompt=${promptObj.content || '(none)'}\ncontext=${JSON.stringify(context)}`;
  m._db = async () => [];
  return m;
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

(async () => {
  console.log('prompt-builder — B3 migracion chat-flow v1.0.0\n');
  const ajv = makeAjv();
  const validatePromptReady = ajv.getSchema('chat.prompt.ready.schema.json');

  // Group 1 — onMessageSaved canonico

  await testAsync('onMessageSaved con shape canonico publica chat.prompt.ready canonico', async () => {
    const mocks = makeMocks();
    const m = instantiateAndStub(mocks);
    await m.onMessageSaved({
      correlation_id: 'corr-1',
      conversation_id: 'conv-1',
      project_id: 'proj-1',
      user_id: 'user-99',
      channel: 'telegram',
      channel_context: { chat_id: 12345 },
      message_id: 'm-user-1',
      user_message: 'Hola compañero',
      timestamp: '2026-05-03T10:00:00.000Z',
      page_id: 'recetas',
      page_context: { current_page: 'recetas' }
    });
    const ev = mocks.published.find(p => p[0] === 'chat.prompt.ready');
    assert.ok(ev);
    const payload = ev[1];
    assert.strictEqual(payload.correlation_id, 'corr-1');
    assert.strictEqual(payload.user_id, 'user-99');
    assert.strictEqual(payload.channel, 'telegram');
    assert.deepStrictEqual(payload.channel_context, { chat_id: 12345 });
    assert.ok(payload.system_prompt && /BASE PROMPT/.test(payload.system_prompt), 'system_prompt construido');
    assert.strictEqual(payload.message_id, 'm-user-1');
    assert.ok(Array.isArray(payload.messages));
    const lastMsg = payload.messages[payload.messages.length - 1];
    assert.strictEqual(lastMsg.role, 'user');
    assert.strictEqual(lastMsg.content, 'Hola compañero');
    assert.strictEqual(payload.message, undefined, 'campo message no debe existir');
    assert.strictEqual(payload.prompt, undefined, 'campo prompt no debe existir (se usa system_prompt)');
  });

  await testAsync('chat.prompt.ready VALIDA contra el JSON Schema oficial', async () => {
    const mocks = makeMocks();
    const m = instantiateAndStub(mocks);
    await m.onMessageSaved({
      correlation_id: 'corr-validate',
      conversation_id: 'conv-x',
      project_id: 'proj-x',
      user_id: 'default',
      channel: 'web',
      channel_context: {},
      message_id: 'm-x',
      user_message: 'test schema',
      timestamp: '2026-05-03T10:00:00.000Z',
      settings: { context_window: 30, temperature: 0.7, max_tokens: 1000 }
    });
    const payload = mocks.published.find(p => p[0] === 'chat.prompt.ready')[1];
    const ok = validatePromptReady(payload);
    assert.ok(ok, `payload chat.prompt.ready debe validar contra schema. errors: ${JSON.stringify(validatePromptReady.errors)}`);
  });

  // Group 2 — onContextEnriched + agregacion

  await testAsync('onContextEnriched acumula enrichments para message_id', async () => {
    const mocks = makeMocks();
    const m = instantiateAndStub(mocks);
    await m.onContextEnriched({
      correlation_id: 'corr-1', conversation_id: 'conv-1', message_id: 'm-1',
      source: 'memory-rag', context_addition: 'el usuario hablo del proyecto X la semana pasada',
      priority: 500, timestamp: '2026-05-03T10:00:00.000Z'
    });
    await m.onContextEnriched({
      correlation_id: 'corr-1', conversation_id: 'conv-1', message_id: 'm-1',
      source: 'memory-user-profile', context_addition: 'al usuario le gusta el espresso',
      priority: 100, timestamp: '2026-05-03T10:00:01.000Z'
    });
    assert.strictEqual(m._pendingEnrichments.size, 1);
    assert.strictEqual(m._pendingEnrichments.get('m-1').length, 2);
  });

  await testAsync('onMessageSaved agrega enrichments por priority en el system_prompt', async () => {
    const mocks = makeMocks();
    const m = instantiateAndStub(mocks);
    // Llegan enrichments ANTES del message saved (caso comun: memorias responden rapido)
    await m.onContextEnriched({
      message_id: 'm-1', source: 'memory-rag',
      context_addition: 'CONTEXTO RAG', priority: 500
    });
    await m.onContextEnriched({
      message_id: 'm-1', source: 'memory-user-profile',
      context_addition: 'PERFIL USUARIO', priority: 100
    });
    // Ahora llega el message_saved
    await m.onMessageSaved({
      correlation_id: 'c1', conversation_id: 'conv-1', project_id: 'p',
      user_id: 'default', channel: 'web', channel_context: {},
      message_id: 'm-1', user_message: 'hola', timestamp: '2026-05-03T10:00:00.000Z'
    });
    const sp = mocks.published.find(p => p[0] === 'chat.prompt.ready')[1].system_prompt;
    // Las enrichments aparecen en el system prompt por orden de priority (100 antes que 500)
    const idxPerfil = sp.indexOf('PERFIL USUARIO');
    const idxRag = sp.indexOf('CONTEXTO RAG');
    assert.ok(idxPerfil > 0, 'PERFIL USUARIO incluido');
    assert.ok(idxRag > 0, 'CONTEXTO RAG incluido');
    assert.ok(idxPerfil < idxRag, 'PERFIL (priority 100) debe ir antes que RAG (priority 500)');
    // Pendientes limpiados
    assert.strictEqual(m._pendingEnrichments.size, 0);
  });

  await testAsync('onContextEnriched con expires_at vencido se descarta al agregar', async () => {
    const mocks = makeMocks();
    const m = instantiateAndStub(mocks);
    const past = new Date(Date.now() - 60_000).toISOString();
    await m.onContextEnriched({
      message_id: 'm-1', source: 'memory-x', context_addition: 'EXPIRADO',
      priority: 100, expires_at: past
    });
    await m.onContextEnriched({
      message_id: 'm-1', source: 'memory-y', context_addition: 'VIVO',
      priority: 200
    });
    await m.onMessageSaved({
      correlation_id: 'c', conversation_id: 'conv-1', project_id: 'p',
      user_id: 'default', channel: 'web', channel_context: {},
      message_id: 'm-1', user_message: 'hola', timestamp: '2026-05-03T10:00:00.000Z'
    });
    const sp = mocks.published.find(p => p[0] === 'chat.prompt.ready')[1].system_prompt;
    assert.ok(!/EXPIRADO/.test(sp), 'enrichment expirado se descarta');
    assert.ok(/VIVO/.test(sp), 'enrichment vivo se incluye');
  });

  console.log('\nprompt-builder: todos los tests pasaron ✓');
})().catch(err => { console.error(err); process.exit(1); });

/**
 * Tests unitarios — prompt-builder v2.0.0 (POC2 #11 reescritura).
 *
 * Foco:
 *  - Lifecycle (onLoad escanea modulesDir + pide user prompts; onUnload
 *    limpia pendingDb + pendingEnrichments + caches sin leak).
 *  - Pipeline chat.message.saved → chat.prompt.ready con shape chat-flow v1.0.0
 *    (correlation_id, user_id, channel, channel_context, message_id, system_prompt,
 *    messages[]).
 *  - Cache de user prompts (prompt.list.response, prompt.created/updated/deleted).
 *  - Module prompts/contexts cargados del FS (base.prompt.json + prompt.json + context.json).
 *  - chat.context.enriched: acumula por message_id, agrega por priority en
 *    onMessageSaved, descarta enriquecidos expirados.
 *  - Helpers POC2.
 *  - Aislamiento: tmpdir para modulesDir, mock bus que responde db.query.
 *
 * Ejecutar: node tests/unit/conversacion__prompt-builder.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PromptBuilderModule = require('../../modules/conversacion/prompt-builder/index.js');

// --------------------------------------------------
// Mock infra
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

function makeTmpModulesDir() {
  const tmpDir = path.join(os.tmpdir(), `pbuilder-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

function writeBase(tmpDir, content) {
  const tmpPath = path.join(tmpDir, '_shared');
  fs.mkdirSync(tmpPath, { recursive: true });
  fs.writeFileSync(path.join(tmpPath, 'base.prompt.json'), JSON.stringify(content));
}

function writeModulePromptCtx(tmpDir, modulePath, prompt, ctx) {
  const tmpPath = path.join(tmpDir, modulePath);
  fs.mkdirSync(tmpPath, { recursive: true });
  if (prompt) fs.writeFileSync(path.join(tmpPath, 'prompt.json'),  JSON.stringify(prompt));
  if (ctx)    fs.writeFileSync(path.join(tmpPath, 'context.json'), JSON.stringify(ctx));
}

function makeBus(moduleRef, mocks) {
  return {
    publish: async (event, payload) => {
      mocks.published.push([event, payload]);
      // Mock db.query.request → respond with empty rows by default
      if (event === 'db.query.request') {
        const { request_id } = payload;
        setImmediate(() => moduleRef.value.onDbQueryResponse({
          data: { request_id, data: [] }
        }));
      }
    }
  };
}

async function instantiate(mocks, opts = {}) {
  const moduleRef = { value: null };
  const m = new PromptBuilderModule();
  moduleRef.value = m;
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: makeBus(moduleRef, mocks),
    moduleConfig: opts.moduleConfig || { modulesDir: opts.modulesDir }
  });
  return { module: m };
}

async function cleanup(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

// ==================================================
//                                                Tests
// ==================================================

(async () => {
  console.log('prompt-builder — reescritura canonica v2.0.0 (POC2 #11)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad escanea modulesDir vacio + publica prompt.list.request', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpModulesDir();
    const { module: m } = await instantiate(mocks, { modulesDir: tmpDir });

    const reqs = publishedOf(mocks, 'prompt.list.request');
    assert.strictEqual(reqs.length, 1);
    assert.ok(reqs[0].request_id);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('onLoad carga base.prompt.json + module prompts/contexts del FS', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpModulesDir();
    writeBase(tmpDir, { _type: 'base', role: 'companero' });
    writeModulePromptCtx(tmpDir, 'pizzepos/cocina', { _type: 'prompt', role: 'cocinero' }, { _type: 'ctx', stove: 'electric' });

    const { module: m } = await instantiate(mocks, { modulesDir: tmpDir });
    assert.ok(m._base);
    assert.strictEqual(m._base.role, 'companero');
    assert.strictEqual(m._modulePrompts.size, 1);
    assert.strictEqual(m._moduleContexts.size, 1);
    assert.ok(m._modulePrompts.has('pizzepos/cocina'));
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('onUnload limpia pendingDb + pendingEnrichments + caches sin leak', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpModulesDir();
    writeModulePromptCtx(tmpDir, 'mod1', { _type: 'prompt' }, null);
    const { module: m } = await instantiate(mocks, { modulesDir: tmpDir });

    let rejected = false;
    m.pendingDb.set('leak-1', {
      resolve: () => {},
      reject: () => { rejected = true; },
      timeout: setTimeout(() => {}, 60000)
    });
    m._pendingEnrichments.set('msg-1', [{ source: 'memo', context_addition: 'x', priority: 100, received_at: Date.now() }]);

    await m.onUnload();
    assert.strictEqual(m.pendingDb.size, 0);
    assert.strictEqual(rejected, true);
    assert.strictEqual(m._pendingEnrichments.size, 0);
    assert.strictEqual(m._modulePrompts.size, 0);
    assert.strictEqual(m._moduleContexts.size, 0);
    await cleanup(tmpDir);
  });

  // ==========================================
  // Group 2: Cache de user prompts
  // ==========================================

  await testAsync('onPromptListResponse hidrata cache cuando matches el listRequestId', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpModulesDir();
    const { module: m } = await instantiate(mocks, { modulesDir: tmpDir });
    const reqId = m._listRequestId;
    assert.ok(reqId);

    m.onPromptListResponse({
      data: { request_id: reqId, success: true, data: { prompts: [
        { id: 'p1', name: 'P1', content: 'foo' },
        { id: 'p2', name: 'P2', content: 'bar' }
      ] } }
    });
    assert.strictEqual(m._userPrompts.size, 2);
    assert.strictEqual(m._userPrompts.get('p1').content, 'foo');
    assert.strictEqual(m._listRequestId, null);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('onPromptListResponse ignora si request_id no matches (orphan response)', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpModulesDir();
    const { module: m } = await instantiate(mocks, { modulesDir: tmpDir });

    m.onPromptListResponse({
      data: { request_id: 'orphan', success: true, data: { prompts: [{ id: 'x', content: 'no' }] } }
    });
    assert.strictEqual(m._userPrompts.size, 0);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('onPromptUpserted (created/updated) anyade/actualiza el prompt en cache', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpModulesDir();
    const { module: m } = await instantiate(mocks, { modulesDir: tmpDir });
    m.onPromptUpserted({ data: { id: 'p1', name: 'A', content: 'v1' } });
    assert.strictEqual(m._userPrompts.get('p1').content, 'v1');
    m.onPromptUpserted({ data: { id: 'p1', name: 'A', content: 'v2' } });
    assert.strictEqual(m._userPrompts.get('p1').content, 'v2');
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('onPromptDeleted invalida la entrada de cache', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpModulesDir();
    const { module: m } = await instantiate(mocks, { modulesDir: tmpDir });
    m.onPromptUpserted({ data: { id: 'p1', name: 'A', content: 'v' } });
    assert.strictEqual(m._userPrompts.size, 1);
    m.onPromptDeleted({ data: { id: 'p1' } });
    assert.strictEqual(m._userPrompts.size, 0);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  // ==========================================
  // Group 3: Pipeline chat.message.saved → chat.prompt.ready
  // ==========================================

  await testAsync('onMessageSaved publica chat.prompt.ready con shape chat-flow v1.0.0 + correlation_id', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpModulesDir();
    const { module: m } = await instantiate(mocks, { modulesDir: tmpDir });
    mocks.published.length = 0;

    await m.onMessageSaved({
      data: {
        correlation_id: 'cid-abc',
        conversation_id: 'conv-1',
        project_id: 'proj-1',
        user_id: 'user-42',
        channel: 'telegram',
        channel_context: { chat_id: 99 },
        message_id: 'msg-1',
        user_message: 'hola companero',
        attachments: [{ name: 'foo.png' }],
        intencion: 'consulta'
      }
    });

    const ready = publishedOf(mocks, 'chat.prompt.ready');
    assert.strictEqual(ready.length, 1);
    const ev = ready[0];
    assert.strictEqual(ev.correlation_id, 'cid-abc');
    assert.strictEqual(ev.conversation_id, 'conv-1');
    assert.strictEqual(ev.project_id, 'proj-1');
    assert.strictEqual(ev.user_id, 'user-42');
    assert.strictEqual(ev.channel, 'telegram');
    assert.deepStrictEqual(ev.channel_context, { chat_id: 99 });
    assert.strictEqual(ev.message_id, 'msg-1');
    assert.ok(typeof ev.system_prompt === 'string');
    assert.ok(Array.isArray(ev.messages));
    assert.strictEqual(ev.messages.at(-1).role, 'user');
    assert.strictEqual(ev.messages.at(-1).content, 'hola companero');
    assert.strictEqual(ev.intencion, 'consulta');
    assert.deepStrictEqual(ev.attachments, [{ name: 'foo.png' }]);
    assert.ok(ev.timestamp);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('onMessageSaved sin user_id → publica con user_id=default', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpModulesDir();
    const { module: m } = await instantiate(mocks, { modulesDir: tmpDir });
    mocks.published.length = 0;

    await m.onMessageSaved({
      data: { conversation_id: 'c', project_id: 'p', message_id: 'm', user_message: 'hi' }
    });
    const ev = publishedOf(mocks, 'chat.prompt.ready')[0];
    assert.strictEqual(ev.user_id, 'default');
    assert.strictEqual(ev.channel, 'web');
    assert.deepStrictEqual(ev.channel_context, {});
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('onMessageSaved sin campos requeridos → no publica + warn', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpModulesDir();
    const { module: m } = await instantiate(mocks, { modulesDir: tmpDir });
    mocks.published.length = 0;

    await m.onMessageSaved({ data: { conversation_id: 'c' } });
    assert.strictEqual(publishedOf(mocks, 'chat.prompt.ready').length, 0);
    const warns = mocks.logs.filter(l => l[0] === 'warn');
    assert.ok(warns.some(w => w[1].includes('invalid_payload')));
    await m.onUnload();
    await cleanup(tmpDir);
  });

  // ==========================================
  // Group 4: System prompt build (base + modulo + user prompt)
  // ==========================================

  await testAsync('system_prompt incluye base + module ctx + user prompt cuando page_id matches', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpModulesDir();
    writeBase(tmpDir, { _type: 'base', role: 'companero' });
    writeModulePromptCtx(tmpDir, 'cocina', { _type: 'prompt', role: 'cocinero' }, { _type: 'ctx', stove: 'gas' });
    const { module: m } = await instantiate(mocks, { modulesDir: tmpDir });
    m.onPromptUpserted({ data: { id: 'up1', name: 'X', content: 'eres un asistente del usuario' } });
    mocks.published.length = 0;

    await m.onMessageSaved({
      data: {
        conversation_id: 'c', project_id: 'p', message_id: 'm',
        user_message: 'hola', page_id: 'cocina', prompt_id: 'up1'
      }
    });
    const ev = publishedOf(mocks, 'chat.prompt.ready')[0];
    assert.ok(/base/.test(ev.system_prompt));     // base.prompt.json
    assert.ok(/stove/.test(ev.system_prompt));    // module context
    assert.ok(/asistente del usuario/.test(ev.system_prompt)); // user prompt
    assert.ok(/CONTEXTO ACTIVO/.test(ev.system_prompt));
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('system_prompt cae a prompt.json del modulo si payload.prompt_id es null', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpModulesDir();
    writeModulePromptCtx(tmpDir, 'cocina', { _type: 'prompt', purpose: 'modulo-prompt-cocina' }, null);
    const { module: m } = await instantiate(mocks, { modulesDir: tmpDir });
    mocks.published.length = 0;

    await m.onMessageSaved({
      data: { conversation_id: 'c', project_id: 'p', message_id: 'm', user_message: 'hi', page_id: 'cocina' }
    });
    const ev = publishedOf(mocks, 'chat.prompt.ready')[0];
    assert.ok(/modulo-prompt-cocina/.test(ev.system_prompt));
    await m.onUnload();
    await cleanup(tmpDir);
  });

  // ==========================================
  // Group 5: chat.context.enriched (memorias modulares)
  // ==========================================

  await testAsync('onContextEnriched acumula por message_id; onMessageSaved agrega por priority y limpia', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpModulesDir();
    const { module: m } = await instantiate(mocks, { modulesDir: tmpDir });
    mocks.published.length = 0;

    // Memoria de perfil (priority 100)
    await m.onContextEnriched({
      data: { conversation_id: 'c', message_id: 'msg-1', source: 'profile', context_addition: 'es chef', priority: 100 }
    });
    // Memoria RAG (priority 500)
    await m.onContextEnriched({
      data: { conversation_id: 'c', message_id: 'msg-1', source: 'rag', context_addition: 'horno a 200C', priority: 500 }
    });
    assert.strictEqual(m._pendingEnrichments.get('msg-1').length, 2);

    await m.onMessageSaved({
      data: { conversation_id: 'c', project_id: 'p', message_id: 'msg-1', user_message: 'sirveme' }
    });

    const ev = publishedOf(mocks, 'chat.prompt.ready')[0];
    // Profile primero (priority menor) → aparece antes que rag en el text concatenado
    const idxProfile = ev.system_prompt.indexOf('[profile]');
    const idxRag = ev.system_prompt.indexOf('[rag]');
    assert.ok(idxProfile > -1 && idxRag > -1);
    assert.ok(idxProfile < idxRag, 'profile debe aparecer antes que rag (priority asc)');
    // Limpieza tras consumir
    assert.strictEqual(m._pendingEnrichments.has('msg-1'), false);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('onContextEnriched descarta enriquecimientos expirados (expires_at en el pasado)', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpModulesDir();
    const { module: m } = await instantiate(mocks, { modulesDir: tmpDir });
    mocks.published.length = 0;

    await m.onContextEnriched({
      data: {
        conversation_id: 'c', message_id: 'msg-1', source: 'memo',
        context_addition: 'expirado', priority: 100,
        expires_at: new Date(Date.now() - 1000).toISOString()
      }
    });
    await m.onMessageSaved({
      data: { conversation_id: 'c', project_id: 'p', message_id: 'msg-1', user_message: 'hi' }
    });
    const ev = publishedOf(mocks, 'chat.prompt.ready')[0];
    assert.ok(!/expirado/.test(ev.system_prompt));
    assert.ok(!/contexto adicional/.test(ev.system_prompt));
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('onContextEnriched sin campos requeridos → no acumula', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpModulesDir();
    const { module: m } = await instantiate(mocks, { modulesDir: tmpDir });

    await m.onContextEnriched({ data: { message_id: 'm' } }); // falta source/addition
    assert.strictEqual(m._pendingEnrichments.size, 0);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  // ==========================================
  // Group 6: _resolveModule (page_id → moduleName)
  // ==========================================

  await testAsync('_resolveModule encuentra modulo exacto', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpModulesDir();
    writeModulePromptCtx(tmpDir, 'cocina', { _type: 'prompt' }, null);
    const { module: m } = await instantiate(mocks, { modulesDir: tmpDir });
    assert.strictEqual(m._resolveModule('cocina'), 'cocina');
    assert.strictEqual(m._resolveModule(null), null);
    assert.strictEqual(m._resolveModule(''), null);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('_resolveModule encuentra modulo anidado por sufijo', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpModulesDir();
    writeModulePromptCtx(tmpDir, 'pizzepos/cocina', { _type: 'prompt' }, null);
    const { module: m } = await instantiate(mocks, { modulesDir: tmpDir });
    // page_id "cocina" debe matchear pizzepos/cocina por sufijo
    assert.strictEqual(m._resolveModule('cocina'), 'pizzepos/cocina');
    assert.strictEqual(m._resolveModule('pizzepos/cocina'), 'pizzepos/cocina');
    await m.onUnload();
    await cleanup(tmpDir);
  });

  // ==========================================
  // Group 7: Helpers POC2 internos
  // ==========================================

  await testAsync('_errorResponse construye shape canonico { status, error: { code, message, details? } }', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpModulesDir();
    const { module: m } = await instantiate(mocks, { modulesDir: tmpDir });
    const r1 = m._errorResponse(400, 'INVALID_INPUT', 'msg', { field: 'x' });
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { field: 'x' } } });
    const r2 = m._errorResponse(500, 'UNKNOWN_ERROR', 'oops');
    assert.deepStrictEqual(r2, { status: 500, error: { code: 'UNKNOWN_ERROR', message: 'oops' } });
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('_classifyHandlerError mapea por mensaje a codigos canonicos', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpModulesDir();
    const { module: m } = await instantiate(mocks, { modulesDir: tmpDir });
    assert.strictEqual(m._classifyHandlerError(new Error('Prompt not found')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('db timeout')), 'UPSTREAM_TIMEOUT');
    assert.strictEqual(m._classifyHandlerError(new Error('something exploded')), 'UNKNOWN_ERROR');
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('_publicarEvento hereda correlation_id si se pasa, genera uno nuevo si no', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpModulesDir();
    const { module: m } = await instantiate(mocks, { modulesDir: tmpDir });
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { foo: 1 }, { correlation_id: 'cid-inherit' });
    await m._publicarEvento('test.event', { bar: 2 });
    const evs = publishedOf(mocks, 'test.event');
    assert.strictEqual(evs.length, 2);
    assert.strictEqual(evs[0].correlation_id, 'cid-inherit');
    assert.notStrictEqual(evs[1].correlation_id, 'cid-inherit');
    assert.ok(evs[0].timestamp && evs[1].timestamp);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  await testAsync('_handleHandlerError mapea status segun code y registra metric', async () => {
    const mocks = makeMocks();
    const tmpDir = makeTmpModulesDir();
    const { module: m } = await instantiate(mocks, { modulesDir: tmpDir });
    const err = Object.assign(new Error('not found'), { _code: 'RESOURCE_NOT_FOUND', _details: { e: 1 } });
    const r = m._handleHandlerError('test.failed', err, 'kind');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'prompt-builder.errors');
    assert.ok(errMetric);
    await m.onUnload();
    await cleanup(tmpDir);
  });

  console.log('\nTodos los tests pasaron.');
})();

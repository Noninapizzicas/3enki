/**
 * Tests unitarios — credential-manager core canonico (post-descomposicion v2.0.0).
 *
 * Foco:
 *  - Lifecycle (onLoad/onUnload sin leak).
 *  - CRUD via UI handlers + HTTP handlers + bus events.
 *  - Resolucion cascada CUSTOM → CLIENT → PROJECT → GLOBAL → legacy.
 *  - Shape canonico de respuestas: { status, data | error: { code, message, details? } }.
 *  - error.code del catalogo (INVALID_INPUT, RESOURCE_NOT_FOUND, RESOURCE_NOT_FOUND, UNKNOWN_ERROR).
 *  - correlation_id propagado en publishes.
 *  - Persistencia .env atomica (tempfile + rename).
 *  - maskApiKey nunca expone valor completo.
 *  - Tool credential.list devuelve solo metadata, NUNCA api_key.
 *
 * Ejecutar: node tests/unit/credential-manager.test.js
 */

'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');

const CredentialManagerModule = require('../../modules/credential-manager/index.js');

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
    increment: (name, labels) => metricsCalls.push(['increment', name, labels]),
    gauge:     (name, value, labels) => metricsCalls.push(['gauge', name, value, labels]),
    timing:    (name, ms, labels) => metricsCalls.push(['timing', name, ms, labels])
  };

  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); }
  };

  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

async function instantiate(mocks, configOverride = {}) {
  const m = new CredentialManagerModule();
  // envFile unico por instancia para aislar de disco persistente
  const tmpEnv = path.join(os.tmpdir(), `cm-test-${Date.now()}-${Math.random().toString(36).slice(2)}.env`);
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    moduleConfig: { envFile: path.relative(path.resolve(__dirname, '../..'), tmpEnv), ...configOverride }
  });
  return { module: m, envFile: tmpEnv };
}

async function cleanup(envFile) {
  try { fs.unlinkSync(envFile); } catch {}
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

(async () => {
  console.log('credential-manager — core canonico v2.0.0 (post-descomposicion)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa estado vacio cuando .env no existe', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    assert.strictEqual(m.credentials.size, 0);
    assert.ok(fs.existsSync(envFile), 'envFile creado por onLoad');
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('onUnload limpia credentials sin leak', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    await m.handleUICreate({ provider: 'OPENAI', level: 'GLOBAL', api_key: 'sk-test-123456' });
    assert.strictEqual(m.credentials.size, 1);
    await m.onUnload();
    assert.strictEqual(m.credentials.size, 0);
    await cleanup(envFile);
  });

  // ==========================================
  // Group 2: Validacion canonica
  // ==========================================

  await testAsync('handleUIGet sin key → 400 INVALID_INPUT canonico', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    const result = await m.handleUIGet({});
    assert.ok(isCanonicalError(result));
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error.code, 'INVALID_INPUT');
    assert.strictEqual(result.error.details.field, 'key');
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('handleUIGet con key inexistente → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    const result = await m.handleUIGet({ key: 'NOPE_API_KEY_GLOBAL' });
    assert.ok(isCanonicalError(result));
    assert.strictEqual(result.status, 404);
    assert.strictEqual(result.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(result.error.details.entity_type, 'credential');
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('handleUICreate sin provider → 400 con field=provider', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    const result = await m.handleUICreate({ level: 'GLOBAL', api_key: 'x' });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error.code, 'INVALID_INPUT');
    assert.strictEqual(result.error.details.field, 'provider');
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('handleUICreate level invalido → 400 con field=level', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    const result = await m.handleUICreate({ provider: 'OPENAI', level: 'INVALID', api_key: 'x' });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error.code, 'INVALID_INPUT');
    assert.strictEqual(result.error.details.field, 'level');
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('handleUICreate level PROJECT sin identifier → 400 con field=identifier', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    const result = await m.handleUICreate({ provider: 'OPENAI', level: 'PROJECT', api_key: 'x' });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error.code, 'INVALID_INPUT');
    assert.strictEqual(result.error.details.field, 'identifier');
    await m.onUnload();
    await cleanup(envFile);
  });

  // ==========================================
  // Group 3: Success paths con shape canonico
  // ==========================================

  await testAsync('handleUICreate GLOBAL → 201 + publica credential.saved con correlation_id', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    const result = await m.handleUICreate({ provider: 'OPENAI', level: 'GLOBAL', api_key: 'sk-test-1234567890' });
    assert.strictEqual(result.status, 201);
    assert.strictEqual(result.data.created, true);
    assert.strictEqual(result.data.key, 'OPENAI_API_KEY_GLOBAL');

    const ev = mocks.published.find(p => p[0] === 'credential.saved');
    assert.ok(ev, 'credential.saved publicado');
    assert.ok(ev[1].correlation_id, 'correlation_id presente');
    assert.ok(ev[1].timestamp);
    assert.strictEqual(ev[1].provider, 'OPENAI');
    assert.strictEqual(ev[1].level, 'GLOBAL');

    assert.ok(mocks.metricsCalls.find(c => c[1] === 'credential-manager.created'));
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('handleUICreate PROJECT con identifier → 201 + key correcta', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    const result = await m.handleUICreate({ provider: 'GEMINI', level: 'PROJECT', identifier: 'proj-1', api_key: 'AIza-x-y-z' });
    assert.strictEqual(result.status, 201);
    assert.strictEqual(result.data.key, 'GEMINI_API_KEY_PROJECT_proj-1');
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('handleUICreate sobre key existente → 200 updated:true', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    await m.handleUICreate({ provider: 'OPENAI', level: 'GLOBAL', api_key: 'sk-old' });
    const result = await m.handleUICreate({ provider: 'OPENAI', level: 'GLOBAL', api_key: 'sk-new' });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.updated, true);
    assert.strictEqual(result.data.created, false);
    const ev = mocks.published.find(p => p[0] === 'credential.updated');
    assert.ok(ev);
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('handleUIDelete existente → 200 + publica credential.deleted', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    await m.handleUICreate({ provider: 'OPENAI', level: 'GLOBAL', api_key: 'sk-x-y-z' });
    mocks.published.length = 0;
    const result = await m.handleUIDelete({ key: 'OPENAI_API_KEY_GLOBAL' });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.deleted, true);
    const ev = mocks.published.find(p => p[0] === 'credential.deleted');
    assert.ok(ev);
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('handleUIList devuelve metadata (no api_key)', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    await m.handleUICreate({ provider: 'OPENAI', level: 'GLOBAL', api_key: 'sk-secret-12345' });
    const result = await m.handleUIList();
    assert.strictEqual(result.status, 200);
    const cred = result.data.credentials[0];
    assert.strictEqual(cred.provider, 'OPENAI');
    assert.ok(cred.preview);
    assert.ok(!('api_key' in cred), 'api_key NO se expone en list');
    assert.ok(!cred.preview.includes('sk-secret'), 'preview no contiene valor completo');
    await m.onUnload();
    await cleanup(envFile);
  });

  // ==========================================
  // Group 4: Resolucion cascada
  // ==========================================

  await testAsync('resolveCredential cascada: CUSTOM gana sobre CLIENT/PROJECT/GLOBAL', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    await m.handleUICreate({ provider: 'OPENAI', level: 'GLOBAL', api_key: 'global-key' });
    await m.handleUICreate({ provider: 'OPENAI', level: 'PROJECT', identifier: 'p1', api_key: 'project-key' });
    await m.handleUICreate({ provider: 'OPENAI', level: 'CLIENT', identifier: 'c1', api_key: 'client-key' });
    await m.handleUICreate({ provider: 'OPENAI', level: 'CUSTOM', identifier: 'u1', api_key: 'custom-key' });

    const result = m._resolveCredential('OPENAI', { customId: 'u1', clientId: 'c1', projectId: 'p1' });
    assert.strictEqual(result.found, true);
    assert.strictEqual(result.apiKey, 'custom-key');
    assert.strictEqual(result.resolvedFrom, 'CUSTOM');
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('resolveCredential cascada: PROJECT gana cuando no hay CUSTOM/CLIENT', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    await m.handleUICreate({ provider: 'OPENAI', level: 'GLOBAL', api_key: 'global-key' });
    await m.handleUICreate({ provider: 'OPENAI', level: 'PROJECT', identifier: 'p1', api_key: 'project-key' });

    const result = m._resolveCredential('OPENAI', { projectId: 'p1' });
    assert.strictEqual(result.apiKey, 'project-key');
    assert.strictEqual(result.resolvedFrom, 'PROJECT');
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('resolveCredential cae a GLOBAL cuando no hay nivel mas especifico', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    await m.handleUICreate({ provider: 'OPENAI', level: 'GLOBAL', api_key: 'global-key' });

    const result = m._resolveCredential('OPENAI', { projectId: 'no-existe' });
    assert.strictEqual(result.apiKey, 'global-key');
    assert.strictEqual(result.resolvedFrom, 'GLOBAL');
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('resolveCredential found:false si no hay credenciales', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    const result = m._resolveCredential('NOEXISTE', {});
    assert.strictEqual(result.found, false);
    assert.ok(Array.isArray(result.attempts));
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('onResolveRequest publica credential.resolve.response con success:true', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    await m.handleUICreate({ provider: 'GROQ', level: 'GLOBAL', api_key: 'gsk-1234567890' });
    mocks.published.length = 0;

    await m.onResolveRequest({
      data: { request_id: 'req-1', provider: 'GROQ' },
      correlation_id: 'c-1'
    });

    const ev = mocks.published.find(p => p[0] === 'credential.resolve.response');
    assert.ok(ev, 'response publicada');
    assert.strictEqual(ev[1].request_id, 'req-1');
    assert.strictEqual(ev[1].success, true);
    assert.strictEqual(ev[1].api_key, 'gsk-1234567890');
    assert.strictEqual(ev[1].resolved_from, 'GLOBAL');
    assert.strictEqual(ev[1].correlation_id, 'c-1');
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('onResolveRequest publica response con success:false si no hay credencial', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    await m.onResolveRequest({
      data: { request_id: 'req-2', provider: 'GHOST' },
      correlation_id: 'c-2'
    });
    const ev = mocks.published.find(p => p[0] === 'credential.resolve.response');
    assert.ok(ev);
    assert.strictEqual(ev[1].success, false);
    assert.ok(typeof ev[1].error === 'string');
    await m.onUnload();
    await cleanup(envFile);
  });

  // ==========================================
  // Group 5: Tool credential.list canonica
  // ==========================================

  await testAsync('handleToolCredentialList shape canonico { status, data } sin api_key', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    await m.handleUICreate({ provider: 'ANTHROPIC', level: 'GLOBAL', api_key: 'sk-ant-secret-key' });
    const result = await m.handleToolCredentialList({});
    assert.strictEqual(result.status, 200);
    assert.ok(Array.isArray(result.data.credentials));
    const cred = result.data.credentials[0];
    assert.ok(!('api_key' in cred), 'la tool NUNCA expone api_key al LLM');
    assert.ok(!cred.preview.includes('sk-ant-secret'), 'preview enmascara');
    assert.strictEqual(typeof result.success, 'undefined', 'NO success: bool legacy');
    await m.onUnload();
    await cleanup(envFile);
  });

  // ==========================================
  // Group 6: HTTP handlers delegan correctamente
  // ==========================================

  await testAsync('handleSaveCredential (HTTP) crea con shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    const result = await m.handleSaveCredential({
      body: { provider: 'DEEPSEEK', level: 'GLOBAL', api_key: 'sk-deepseek-1234' }
    });
    assert.strictEqual(result.status, 201);
    assert.strictEqual(result.data.created, true);
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('handleResolveCredential HTTP devuelve 404 RESOURCE_NOT_FOUND si no hay', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    const result = await m.handleResolveCredential({ body: { provider: 'GHOST' } });
    assert.strictEqual(result.status, 404);
    assert.strictEqual(result.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
    await cleanup(envFile);
  });

  // ==========================================
  // Group 7: Persistencia atomica .env
  // ==========================================

  await testAsync('saveEnvFile escribe atomico (tempfile + rename)', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    await m.handleUICreate({ provider: 'OPENAI', level: 'GLOBAL', api_key: 'sk-test-write' });
    const content = fs.readFileSync(envFile, 'utf-8');
    assert.ok(content.includes('OPENAI_API_KEY_GLOBAL=sk-test-write'));
    // Verificar que no quedaron tempfiles huerfanos
    const dir = path.dirname(envFile);
    const tmps = fs.readdirSync(dir).filter(f => f.startsWith(path.basename(envFile) + '.tmp.'));
    assert.strictEqual(tmps.length, 0, 'no debe quedar tempfile residual');
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('loadEnvFile carga credenciales existentes al arrancar', async () => {
    // Crear .env con credentials antes de instantiate
    const tmpEnv = path.join(os.tmpdir(), `cm-test-load-${Date.now()}.env`);
    fs.writeFileSync(tmpEnv, '# test\nOPENAI_API_KEY_GLOBAL=sk-preexisting\nGEMINI_API_KEY_PROJECT_p1=AIza-preexisting\n');
    const mocks = makeMocks();
    const m = new CredentialManagerModule();
    await m.onLoad({
      logger: mocks.logger,
      metrics: mocks.metrics,
      eventBus: mocks.eventBus,
      moduleConfig: { envFile: path.relative(path.resolve(__dirname, '../..'), tmpEnv) }
    });
    assert.strictEqual(m.credentials.size, 2);
    assert.strictEqual(m.credentials.get('OPENAI_API_KEY_GLOBAL'), 'sk-preexisting');
    await m.onUnload();
    await cleanup(tmpEnv);
  });

  // ==========================================
  // Group 8: Helpers internos
  // ==========================================

  await testAsync('_maskApiKey enmascara correctamente', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    assert.strictEqual(m._maskApiKey('sk-1234567890'), '*********7890');
    assert.strictEqual(m._maskApiKey('xy'), '**');
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('_buildKey + _parseKey roundtrip', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    const k = m._buildKey('OPENAI', 'PROJECT', 'p1');
    assert.strictEqual(k, 'OPENAI_API_KEY_PROJECT_p1');
    const parsed = m._parseKey(k);
    assert.strictEqual(parsed.provider, 'OPENAI');
    assert.strictEqual(parsed.level, 'PROJECT');
    assert.strictEqual(parsed.identifier, 'p1');
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('_parseKey reconoce formato legacy PROVIDER_API_KEY', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    const parsed = m._parseKey('OPENAI_API_KEY');
    assert.strictEqual(parsed.provider, 'OPENAI');
    assert.strictEqual(parsed.level, 'GLOBAL');
    assert.strictEqual(parsed.identifier, null);
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('_errorResponse + _classifyHandlerError producen shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    const r1 = m._errorResponse(400, 'INVALID_INPUT', 'bad');
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'INVALID_INPUT', message: 'bad' } });
    assert.strictEqual(m._classifyHandlerError(new Error('not found')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('weird')), 'UNKNOWN_ERROR');
    await m.onUnload();
    await cleanup(envFile);
  });

  // ==========================================
  // Group: invariante PROJECT-ONLY (providers por-tenant, p.ej. WhatsApp)
  // ==========================================

  await testAsync('META_WHATSAPP a nivel GLOBAL → 400 (provider por-proyecto, solo PROJECT)', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    const result = await m.handleUICreate({ provider: 'META_WHATSAPP', level: 'GLOBAL', api_key: 'tok' });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error.code, 'INVALID_INPUT');
    assert.strictEqual(result.error.details.field, 'level');
    assert.strictEqual(result.error.details.allowed_level, 'PROJECT');
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('META_WHATSAPP a nivel CLIENT/CUSTOM también rechazado (solo PROJECT)', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    const rC = await m.handleUICreate({ provider: 'META_WHATSAPP', level: 'CLIENT', identifier: 'c1', api_key: 'tok' });
    assert.strictEqual(rC.status, 400);
    const rU = await m.handleUICreate({ provider: 'META_WHATSAPP', level: 'CUSTOM', identifier: 'x', api_key: 'tok' });
    assert.strictEqual(rU.status, 400);
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('META_WHATSAPP a nivel PROJECT con identifier=slug → 201 key correcta', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    const result = await m.handleUICreate({ provider: 'META_WHATSAPP', level: 'PROJECT', identifier: 'nonina', api_key: 'tok-nonina' });
    assert.strictEqual(result.status, 201);
    assert.strictEqual(result.data.key, 'META_WHATSAPP_API_KEY_PROJECT_nonina');   // = lo que lee el bot
    await m.onUnload();
    await cleanup(envFile);
  });

  await testAsync('resolve project-only: SOLO PROJECT, sin caída a GLOBAL/legacy (aislamiento)', async () => {
    const mocks = makeMocks();
    const { module: m, envFile } = await instantiate(mocks);
    // El de nonina existe a nivel PROJECT; alguien coló además uno GLOBAL a mano en el store.
    m.credentials.set('META_WHATSAPP_API_KEY_PROJECT_nonina', 'tok-nonina');
    m.credentials.set('META_WHATSAPP_API_KEY_GLOBAL', 'tok-global-prohibido');
    // nonina resuelve su propio token PROJECT
    const rN = m._resolveCredential('META_WHATSAPP', { projectId: 'nonina' });
    assert.strictEqual(rN.found, true);
    assert.strictEqual(rN.resolvedFrom, 'PROJECT');
    assert.strictEqual(rN.apiKey, 'tok-nonina');
    // OTRO proyecto sin su PROJECT key → NO encuentra (no cae al global, ni al legacy)
    const rOtro = m._resolveCredential('META_WHATSAPP', { projectId: 'otra-tienda' });
    assert.strictEqual(rOtro.found, false, 'no debe usar el token global de otra tienda');
    // y sin projectId tampoco resuelve a global
    const rSin = m._resolveCredential('META_WHATSAPP', {});
    assert.strictEqual(rSin.found, false);
    await m.onUnload();
    await cleanup(envFile);
  });

  console.log('\ncredential-manager: todos los tests pasaron ✓');
})().catch(err => { console.error(err); process.exit(1); });

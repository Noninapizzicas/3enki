/**
 * Tests unitarios — conversacion/ai-gateway v2.0.0 (POC2 #8 reescritura).
 *
 * Foco:
 *  - Lifecycle (onLoad, onUnload limpia pendings sin leak).
 *  - LLM complete split: par llm.complete.response (success) +
 *    llm.complete.failed (canonical error code) — cierre del drift
 *    publish_response_con_success_flag / publish_response_con_error_inyectado.
 *  - correlation_id propagado en TODOS los publishes.
 *  - Bus handlers (credential.resolve.response/saved/deleted, fs.read.response).
 *  - Helpers POC2 internos.
 *  - Aislamiento: providers stub inyectados, sin HTTP/CLI real.
 *
 * NO cubre (ya tienen tests dedicados en otros archivos):
 *  - tests/unit/ai-gateway-poc.test.js (POC inicial)
 *  - tests/unit/ai-gateway-chat.test.js (chat-flow handler — ya canonico)
 *  - tests/unit/ai-gateway-embedding.test.js (embedding-flow handler — ya canonico)
 *
 * Ejecutar: node tests/unit/conversacion__ai-gateway.test.js
 */

'use strict';

const assert = require('assert');
const crypto = require('crypto');

const AiGatewayModule = require('../../modules/conversacion/ai-gateway/index.js');

// --------------------------------------------------
// Mock infra
// --------------------------------------------------

function makeMocks() {
  const logs = [];
  const published = [];

  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };

  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); }
  };

  return { logs, published, logger, eventBus };
}

class StubProvider {
  constructor(opts = {}) {
    this.name = opts.name || 'stub';
    this._failOnComplete = opts.failOnComplete;
    this._response = opts.response || {
      content: 'stub response',
      tokens: { input: 10, output: 20 },
      model: 'stub-model'
    };
  }
  setContext() {}
  supportsEmbeddings() { return false; }
  async isAvailable() { return true; }
  async chat(_payload) {
    if (this._failOnComplete) throw new Error(this._failOnComplete);
    return this._response;
  }
  async complete(_payload) {
    if (this._failOnComplete) throw new Error(this._failOnComplete);
    return this._response;
  }
}

async function instantiate(mocks, opts = {}) {
  const m = new AiGatewayModule();
  await m.onLoad({
    logger:   mocks.logger,
    eventBus: mocks.eventBus,
    moduleConfig: opts.config || { providers: {} },
    moduleLoader: opts.moduleLoader || null
  });
  // Inyectar providers stub (sustituye el _initializeProviders que skipea
  // todos por enabled=false).
  if (opts.providers) {
    for (const [name, p] of Object.entries(opts.providers)) {
      m.providers.set(name, p);
    }
  }
  return { module: m };
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
  console.log('conversacion/ai-gateway — reescritura canonica v2.0.0 (POC2 #8)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa providers vacio + version 2.0.0', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.version, '2.0.0');
    assert.strictEqual(m.providers.size, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia pendingCredentials + pendingFsReads sin leak', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let credRejected = false;
    let fsRejected = false;
    m.pendingCredentials.set('c1', {
      resolve: () => {},
      reject: () => { credRejected = true; },
      timeout: setTimeout(() => {}, 60000)
    });
    m.pendingFsReads.set('f1', {
      resolve: () => {},
      reject: () => { fsRejected = true; },
      timeout: setTimeout(() => {}, 60000)
    });
    await m.onUnload();
    assert.strictEqual(m.pendingCredentials.size, 0);
    assert.strictEqual(m.pendingFsReads.size, 0);
    // El monolito v1 solo hacia clearTimeout pero no rechazaba; v2 mantiene
    // ese contrato (clear sin reject — los callers tienen su propio timeout
    // como red de seguridad). Solo verificamos que el map quede vacio.
  });

  // ==========================================
  // Group 2: LLM complete split (success / failed)
  // ==========================================

  await testAsync('onLlmCompleteRequest sin request_id → no publica + warn', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onLlmCompleteRequest({ data: {} });
    assert.strictEqual(publishedOf(mocks, 'llm.complete.response').length, 0);
    assert.strictEqual(publishedOf(mocks, 'llm.complete.failed').length, 0);
    const warns = mocks.logs.filter(l => l[0] === 'warn');
    assert.ok(warns.some(w => w[1].includes('invalid_payload')));
    await m.onUnload();
  });

  await testAsync('onLlmCompleteRequest exito → llm.complete.response sin success flag + correlation_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    // Stub _executeLLM directamente (mas barato que mockear el agentic loop completo).
    m._executeLLM = async () => ({
      content: 'ok', tokens: { input: 5, output: 10 },
      model: 'stub-model', provider: 'stub', tool_calls_executed: [],
      iterations: 1, finish_reason: 'stop'
    });

    await m.onLlmCompleteRequest({
      data: { request_id: 'r1', correlation_id: 'cid-abc', messages: [] }
    });

    const ok = publishedOf(mocks, 'llm.complete.response');
    assert.strictEqual(ok.length, 1);
    assert.strictEqual(ok[0].request_id, 'r1');
    assert.strictEqual(ok[0].correlation_id, 'cid-abc');
    assert.strictEqual(ok[0].content, 'ok');
    assert.ok(typeof ok[0].duration_ms === 'number');
    assert.ok(ok[0].timestamp);
    // Drift cerrado: NO debe haber 'success' flag en el evento de exito.
    assert.strictEqual('success' in ok[0], false);
    // Y NO debe haberse publicado el .failed.
    assert.strictEqual(publishedOf(mocks, 'llm.complete.failed').length, 0);
    await m.onUnload();
  });

  await testAsync('onLlmCompleteRequest error → llm.complete.failed con error canonico { code, message }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._executeLLM = async () => { throw new Error('All LLM providers failed'); };

    await m.onLlmCompleteRequest({
      data: { request_id: 'r2', correlation_id: 'cid-def', messages: [] }
    });

    const failed = publishedOf(mocks, 'llm.complete.failed');
    assert.strictEqual(failed.length, 1);
    assert.strictEqual(failed[0].request_id, 'r2');
    assert.strictEqual(failed[0].correlation_id, 'cid-def');
    assert.ok(failed[0].error);
    assert.strictEqual(typeof failed[0].error.code, 'string');
    assert.strictEqual(typeof failed[0].error.message, 'string');
    assert.ok(typeof failed[0].duration_ms === 'number');
    // Drift cerrado: el .response NO debe publicarse cuando hubo error.
    assert.strictEqual(publishedOf(mocks, 'llm.complete.response').length, 0);
    await m.onUnload();
  });

  await testAsync('onLlmCompleteRequest sin correlation_id explicito → genera uno (no null)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._executeLLM = async () => ({ content: 'x', model: 'stub', provider: 'stub' });

    await m.onLlmCompleteRequest({ data: { request_id: 'r3', messages: [] } });

    const ok = publishedOf(mocks, 'llm.complete.response');
    assert.strictEqual(ok.length, 1);
    assert.ok(typeof ok[0].correlation_id === 'string');
    assert.ok(ok[0].correlation_id.length > 0);
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Bus handlers (credential / fs)
  // ==========================================

  await testAsync('onCredentialResponse resuelve pendingCredentials por request_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let resolvedWith = null;
    m.pendingCredentials.set('cred-1', {
      resolve: (v) => { resolvedWith = v; },
      reject: () => {},
      timeout: setTimeout(() => {}, 5000)
    });

    m.onCredentialResponse({ data: { request_id: 'cred-1', api_key: 'sk-test' } });

    assert.strictEqual(m.pendingCredentials.has('cred-1'), false);
    assert.ok(resolvedWith);
    await m.onUnload();
  });

  await testAsync('onCredentialSaved invalida cache del provider afectado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.credentialCache.set('openai', { apiKey: 'old', resolvedAt: Date.now() });

    m.onCredentialSaved({ data: { provider: 'openai' } });

    assert.strictEqual(m.credentialCache.has('openai'), false);
    await m.onUnload();
  });

  await testAsync('onCredentialDeleted invalida cache del provider afectado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.credentialCache.set('anthropic', { apiKey: 'foo', resolvedAt: Date.now() });

    m.onCredentialDeleted({ data: { provider: 'anthropic' } });

    assert.strictEqual(m.credentialCache.has('anthropic'), false);
    await m.onUnload();
  });

  await testAsync('onFsReadResponse resuelve pendingFsReads por request_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let resolved = null;
    m.pendingFsReads.set('fs-1', {
      resolve: (v) => { resolved = v; },
      reject: () => {},
      timeout: setTimeout(() => {}, 5000)
    });

    m.onFsReadResponse({ data: { request_id: 'fs-1', content: 'file body' } });

    assert.strictEqual(m.pendingFsReads.has('fs-1'), false);
    assert.ok(resolved);
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Helpers POC2 internos
  // ==========================================

  await testAsync('_errorResponse construye shape canonico { status, error: { code, message, details? } }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = m._errorResponse(400, 'VALIDATION_FAILED', 'msg', { field: 'x' });
    assert.deepStrictEqual(r1, {
      status: 400,
      error: { code: 'VALIDATION_FAILED', message: 'msg', details: { field: 'x' } }
    });
    const r2 = m._errorResponse(503, 'UPSTREAM_UNAVAILABLE', 'mqtt down');
    assert.deepStrictEqual(r2, {
      status: 503,
      error: { code: 'UPSTREAM_UNAVAILABLE', message: 'mqtt down' }
    });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea por mensaje a codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(new Error('Provider not found')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'VALIDATION_FAILED');
    assert.strictEqual(m._classifyHandlerError(new Error('Unauthorized')), 'AUTHORIZATION_REQUIRED');
    assert.strictEqual(m._classifyHandlerError(new Error('upstream not available')), 'UPSTREAM_UNAVAILABLE');
    assert.strictEqual(m._classifyHandlerError(new Error('something exploded')), 'INTERNAL_ERROR');
    await m.onUnload();
  });

  await testAsync('_classifyExecutionError preserva el mapeo del dominio LLM (auth/rate/timeout/...)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const auth = m._classifyExecutionError(new Error('credential not found'));
    assert.ok(auth.code, 'tiene code');
    assert.ok(typeof auth.message === 'string', 'tiene message');
    const tt = m._classifyExecutionError(new Error('request timed out'));
    assert.ok(tt.code);
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
    assert.ok(typeof evs[1].correlation_id === 'string' && evs[1].correlation_id.length > 0);
    assert.ok(evs[0].timestamp && evs[1].timestamp);
    await m.onUnload();
  });

  await testAsync('_publicarEvento NO sobreescribe correlation_id ya presente en el payload', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { correlation_id: 'cid-payload', foo: 1 });
    const evs = publishedOf(mocks, 'test.event');
    assert.strictEqual(evs[0].correlation_id, 'cid-payload');
    await m.onUnload();
  });

  // ==========================================
  // Group 5: Sanidad post-rewrite
  // ==========================================

  await testAsync('module.json v2.0.0 declara llm.complete.response + llm.complete.failed', async () => {
    const fs = require('fs');
    const path = require('path');
    const manifestPath = path.resolve(__dirname, '../../modules/conversacion/ai-gateway/module.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.strictEqual(manifest.version, '2.0.0');
    const publishNames = (manifest.publishes || []).map(p => typeof p === 'string' ? p : p.event);
    assert.ok(publishNames.includes('llm.complete.response'),
      `manifest.publishes debe incluir llm.complete.response. Tiene: ${publishNames.join(', ')}`);
    assert.ok(publishNames.includes('llm.complete.failed'),
      `manifest.publishes debe incluir llm.complete.failed (cierre del par). Tiene: ${publishNames.join(', ')}`);
  });

  await testAsync('module.json v2.0.0 declara tracing.propaga_correlation_id=true', async () => {
    const fs = require('fs');
    const path = require('path');
    const manifestPath = path.resolve(__dirname, '../../modules/conversacion/ai-gateway/module.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.strictEqual(manifest.observability?.tracing?.propaga_correlation_id, true);
  });

  console.log('\nTodos los tests pasaron.');
})();

/**
 * Tests unitarios para ai-gateway-poc (parcela 5/6 del POC).
 *
 * Cubre los 8 contratos arquitectonicos a traves de casos E2E con
 * mocks (fetch + bus + credential-manager).
 *
 * Ejecutar con: node tests/unit/ai-gateway-poc.test.js
 *               npm run test:ai-gateway-poc
 */

const assert = require('assert');
const path   = require('path');

const AiGateway    = require('../../modules/conversacion/ai-gateway-poc/index.js');
const moduleConfig = require('../../modules/conversacion/ai-gateway-poc/module.json').config;

// ----------------------------------------------------------------- helpers

function makeMocks() {
  const logs            = [];
  const metrics_calls   = [];
  const published       = [];
  let credentialHandler = null;

  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };

  const metrics = {
    histogram: (n, v, l) => metrics_calls.push(['histogram', n, v, l]),
    increment: (n, v, l) => metrics_calls.push(['increment', n, v, l])
  };

  // El bus simula tambien al credential-manager: cuando se publica
  // 'credential.resolve.request', responde inmediatamente con la api_key
  // que se haya configurado via setCredentialResponse().
  let credentialResponseValue = { api_key: 'sk-test-fake-key-1234' }; // default success
  const eventBus = {
    publish: async (event, payload) => {
      published.push([event, payload]);
      if (event === 'credential.resolve.request' && credentialHandler) {
        const resp = typeof credentialResponseValue === 'function'
          ? credentialResponseValue(payload)
          : credentialResponseValue;
        if (resp === '__no_response__') return; // simular que credential-manager no responde
        setImmediate(() => credentialHandler('credential.resolve.response', {
          request_id: payload.request_id,
          ...resp
        }));
      }
    }
  };

  return {
    logs, metrics_calls, published,
    logger, metrics, eventBus,
    setCredentialHandler: (h) => { credentialHandler = h; },
    setCredentialResponse: (v) => { credentialResponseValue = v; }
  };
}

function bindBusToModule(mocks, mod) {
  mocks.setCredentialHandler((event, payload) => {
    if (event === 'credential.resolve.response') return mod.onCredentialResponse(payload);
  });
}

function findResponse(published, request_id) {
  const r = published.find(p => p[0] === 'llm.complete.response' && p[1].request_id === request_id);
  return r ? r[1] : null;
}

function setFetch(handler) {
  global.fetch = handler;
}

function ok200Body(content = 'pong', model = 'deepseek-chat') {
  return {
    status: 200,
    text: async () => JSON.stringify({
      model,
      choices: [{ message: { content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }
    })
  };
}

function errResponse(status, body) {
  return {
    status,
    text: async () => typeof body === 'string' ? body : JSON.stringify(body)
  };
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
  console.log('ai-gateway-poc — smoke tests\n');

  // ============================================================ Group 1: validation

  await testAsync('VALIDATION_FAILED: payload sin request_id', async () => {
    const mocks = makeMocks();
    const m = new AiGateway();
    await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig });
    bindBusToModule(mocks, m);
    await m.onLlmCompleteRequest({ messages: [{ role: 'user', content: 'x' }] });
    const r = mocks.published.find(p => p[0] === 'llm.complete.response');
    assert.strictEqual(r[1].status, 400);
    assert.strictEqual(r[1].error.code, 'VALIDATION_FAILED');
    assert.strictEqual(r[1].error.details.field, 'request_id');
    assert.strictEqual(r[1].request_id, null);
    await m.onUnload();
  });

  await testAsync('VALIDATION_FAILED: payload sin messages', async () => {
    const mocks = makeMocks();
    const m = new AiGateway();
    await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig });
    bindBusToModule(mocks, m);
    await m.onLlmCompleteRequest({ request_id: 'r1' });
    const r = findResponse(mocks.published, 'r1');
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'VALIDATION_FAILED');
    assert.strictEqual(r.error.details.field, 'messages');
    await m.onUnload();
  });

  await testAsync('VALIDATION_FAILED: messages array vacio', async () => {
    const mocks = makeMocks();
    const m = new AiGateway();
    await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig });
    bindBusToModule(mocks, m);
    await m.onLlmCompleteRequest({ request_id: 'r1', messages: [] });
    const r = findResponse(mocks.published, 'r1');
    assert.strictEqual(r.error.code, 'VALIDATION_FAILED');
    assert.strictEqual(r.error.details.field, 'messages');
    await m.onUnload();
  });

  // ============================================================ Group 2: success path

  await testAsync('Success: shape canonico { request_id, status, data } sin error', async () => {
    setFetch(async () => ok200Body('pong'));
    const mocks = makeMocks();
    const m = new AiGateway();
    await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig });
    bindBusToModule(mocks, m);
    await m.onLlmCompleteRequest({ request_id: 'r2', messages: [{ role: 'user', content: 'ping' }] });
    const r = findResponse(mocks.published, 'r2');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.error, undefined, 'success no debe tener error');
    assert.strictEqual(r.data.provider, 'deepseek');
    assert.strictEqual(r.data.content, 'pong');
    assert.strictEqual(r.data.usage.total_tokens, 6);
    await m.onUnload();
  });

  await testAsync('Success: correlation_id se propaga en la response', async () => {
    setFetch(async () => ok200Body());
    const mocks = makeMocks();
    const m = new AiGateway();
    await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig });
    bindBusToModule(mocks, m);
    await m.onLlmCompleteRequest({
      request_id: 'r2b',
      messages: [{ role: 'user', content: 'ping' }],
      correlation_id: 'corr-abc'
    });
    const r = findResponse(mocks.published, 'r2b');
    assert.strictEqual(r.correlation_id, 'corr-abc', 'correlation_id debe propagarse');
    await m.onUnload();
  });

  // ============================================================ Group 3: cache

  await testAsync('Cache hit: 2a llamada no emite credential.resolve.request', async () => {
    setFetch(async () => ok200Body());
    const mocks = makeMocks();
    const m = new AiGateway();
    await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig });
    bindBusToModule(mocks, m);
    await m.onLlmCompleteRequest({ request_id: 'r3a', messages: [{ role: 'user', content: 'a' }], project_id: 'p1' });
    const credReqsBefore = mocks.published.filter(p => p[0] === 'credential.resolve.request').length;
    assert.strictEqual(credReqsBefore, 1, '1a llamada debe emitir credential.resolve.request');
    await m.onLlmCompleteRequest({ request_id: 'r3b', messages: [{ role: 'user', content: 'b' }], project_id: 'p1' });
    const credReqsAfter = mocks.published.filter(p => p[0] === 'credential.resolve.request').length;
    assert.strictEqual(credReqsAfter, 1, '2a llamada NO debe emitir credential.resolve.request (cache hit)');
    await m.onUnload();
  });

  await testAsync('Cache invalidation por credential.saved (provider+project)', async () => {
    setFetch(async () => ok200Body());
    const mocks = makeMocks();
    const m = new AiGateway();
    await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig });
    bindBusToModule(mocks, m);
    await m.onLlmCompleteRequest({ request_id: 'r4', messages: [{ role: 'user', content: 'a' }], project_id: 'p2' });
    assert.strictEqual(m.credentialCache.size, 1);
    await m.onCredentialSaved({ provider: 'deepseek', project_id: 'p2' });
    assert.strictEqual(m.credentialCache.size, 0, 'cache vacia tras invalidation por project');
    await m.onUnload();
  });

  await testAsync('Cache invalidation por credential.deleted sin project (todos)', async () => {
    setFetch(async () => ok200Body());
    const mocks = makeMocks();
    const m = new AiGateway();
    await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig });
    bindBusToModule(mocks, m);
    await m.onLlmCompleteRequest({ request_id: 'r5a', messages: [{ role: 'user', content: 'a' }], project_id: 'p1' });
    await m.onLlmCompleteRequest({ request_id: 'r5b', messages: [{ role: 'user', content: 'b' }], project_id: 'p2' });
    assert.strictEqual(m.credentialCache.size, 2);
    await m.onCredentialDeleted({ provider: 'deepseek' }); // sin project_id
    assert.strictEqual(m.credentialCache.size, 0, 'cache vacia tras delete sin project (todos los del provider)');
    await m.onUnload();
  });

  // ============================================================ Group 4: upstream error mapping

  await testAsync('Upstream 401 → UPSTREAM_AUTH_FAILED (status 503)', async () => {
    setFetch(async () => errResponse(401, { error: { message: 'Invalid API key' } }));
    const mocks = makeMocks();
    const m = new AiGateway();
    await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig });
    bindBusToModule(mocks, m);
    await m.onLlmCompleteRequest({ request_id: 'r6', messages: [{ role: 'user', content: 'x' }] });
    const r = findResponse(mocks.published, 'r6');
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.error.code, 'UPSTREAM_AUTH_FAILED');
    assert.strictEqual(r.error.details.upstream_status, 401);
    assert.strictEqual(r.data, undefined);
    await m.onUnload();
  });

  await testAsync('Upstream 429 → UPSTREAM_RATE_LIMITED (retryable=true)', async () => {
    setFetch(async () => errResponse(429, { error: { message: 'Rate limit' } }));
    const mocks = makeMocks();
    const m = new AiGateway();
    await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig });
    bindBusToModule(mocks, m);
    // Sobrescribe retry para test rapido (sin backoff real)
    moduleConfig.http_clients[0].retry = { max_attempts: 1, backoff_ms: 0, retryable_status: [429] };
    await m.onLlmCompleteRequest({ request_id: 'r7', messages: [{ role: 'user', content: 'x' }] });
    const r = findResponse(mocks.published, 'r7');
    assert.strictEqual(r.error.code, 'UPSTREAM_RATE_LIMITED');
    assert.strictEqual(r.error.details.retryable, true);
    await m.onUnload();
  });

  await testAsync('Upstream 500 → UPSTREAM_5XX', async () => {
    setFetch(async () => errResponse(500, { error: { message: 'oops' } }));
    const mocks = makeMocks();
    const m = new AiGateway();
    await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig });
    bindBusToModule(mocks, m);
    moduleConfig.http_clients[0].retry = { max_attempts: 1, backoff_ms: 0, retryable_status: [] };
    await m.onLlmCompleteRequest({ request_id: 'r8', messages: [{ role: 'user', content: 'x' }] });
    const r = findResponse(mocks.published, 'r8');
    assert.strictEqual(r.error.code, 'UPSTREAM_5XX');
    assert.strictEqual(r.error.details.upstream_status, 500);
    await m.onUnload();
  });

  await testAsync('Upstream 200 con JSON malformado → UPSTREAM_INVALID_RESPONSE', async () => {
    setFetch(async () => ({ status: 200, text: async () => '<<<not_json>>>' }));
    const mocks = makeMocks();
    const m = new AiGateway();
    await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig });
    bindBusToModule(mocks, m);
    moduleConfig.http_clients[0].retry = { max_attempts: 1, backoff_ms: 0, retryable_status: [] };
    await m.onLlmCompleteRequest({ request_id: 'r9', messages: [{ role: 'user', content: 'x' }] });
    const r = findResponse(mocks.published, 'r9');
    assert.strictEqual(r.error.code, 'UPSTREAM_INVALID_RESPONSE');
    assert.strictEqual(r.status, 502);
    await m.onUnload();
  });

  // ============================================================ Group 5: network/timeout

  await testAsync('Network error → UPSTREAM_UNREACHABLE', async () => {
    setFetch(async () => { const e = new Error('ECONNREFUSED'); e.name = 'TypeError'; throw e; });
    const mocks = makeMocks();
    const m = new AiGateway();
    await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig });
    bindBusToModule(mocks, m);
    moduleConfig.http_clients[0].retry = { max_attempts: 1, backoff_ms: 0, retryable_status: [] };
    await m.onLlmCompleteRequest({ request_id: 'r10', messages: [{ role: 'user', content: 'x' }] });
    const r = findResponse(mocks.published, 'r10');
    assert.strictEqual(r.error.code, 'UPSTREAM_UNREACHABLE');
    assert.strictEqual(r.status, 503);
    await m.onUnload();
  });

  await testAsync('Timeout (AbortError) → UPSTREAM_TIMEOUT (status 504)', async () => {
    setFetch(async () => { const e = new Error('aborted'); e.name = 'TimeoutError'; throw e; });
    const mocks = makeMocks();
    const m = new AiGateway();
    await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig });
    bindBusToModule(mocks, m);
    moduleConfig.http_clients[0].retry = { max_attempts: 1, backoff_ms: 0, retryable_status: [] };
    await m.onLlmCompleteRequest({ request_id: 'r11', messages: [{ role: 'user', content: 'x' }] });
    const r = findResponse(mocks.published, 'r11');
    assert.strictEqual(r.error.code, 'UPSTREAM_TIMEOUT');
    assert.strictEqual(r.status, 504);
    await m.onUnload();
  });

  // ============================================================ Group 6: credential failures

  await testAsync('Credential timeout (no respuesta del bus) → CREDENTIAL_NOT_FOUND', async () => {
    const mocks = makeMocks();
    mocks.setCredentialResponse('__no_response__');
    const m = new AiGateway();
    // Acelera el timeout para no esperar 5s
    const cfg = JSON.parse(JSON.stringify(moduleConfig));
    cfg.credential_resolve_timeout_ms = 50;
    await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig: cfg });
    bindBusToModule(mocks, m);
    await m.onLlmCompleteRequest({ request_id: 'r12', messages: [{ role: 'user', content: 'x' }] });
    const r = findResponse(mocks.published, 'r12');
    assert.strictEqual(r.error.code, 'CREDENTIAL_NOT_FOUND');
    assert.strictEqual(r.status, 503);
    await m.onUnload();
  });

  await testAsync('Credential rechazada → CREDENTIAL_NOT_FOUND', async () => {
    const mocks = makeMocks();
    mocks.setCredentialResponse({ error: 'no credentials configured' });
    const m = new AiGateway();
    await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig });
    bindBusToModule(mocks, m);
    await m.onLlmCompleteRequest({ request_id: 'r13', messages: [{ role: 'user', content: 'x' }] });
    const r = findResponse(mocks.published, 'r13');
    assert.strictEqual(r.error.code, 'CREDENTIAL_NOT_FOUND');
    await m.onUnload();
  });

  // ============================================================ Group 7: lifecycle

  await testAsync('onUnload limpia pendingCredentials timeouts', async () => {
    const mocks = makeMocks();
    mocks.setCredentialResponse('__no_response__'); // pendings quedan pendientes
    const m = new AiGateway();
    const cfg = JSON.parse(JSON.stringify(moduleConfig));
    cfg.credential_resolve_timeout_ms = 60000; // largo, no expira en el test
    await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig: cfg });
    bindBusToModule(mocks, m);

    // Disparar un request sin esperar la response. La promise se va a rechazar
    // en onUnload y la marcamos como handled para que Node no proteste.
    const p = m.onLlmCompleteRequest({ request_id: 'r14', messages: [{ role: 'user', content: 'x' }] })
      .catch(() => {});
    await new Promise(r => setImmediate(r));
    assert.strictEqual(m.pendingCredentials.size, 1);
    await m.onUnload();
    assert.strictEqual(m.pendingCredentials.size, 0);
    assert.strictEqual(m.credentialCache.size, 0);
    assert.strictEqual(m.providers.size, 0);
    await p;
  });

  // ============================================================ Group 8: disciplina

  await testAsync('Authorization header se redacta en logs', async () => {
    setFetch(async () => { const e = new Error('boom'); e.name = 'TypeError'; throw e; });
    const mocks = makeMocks();
    const m = new AiGateway();
    const cfg = JSON.parse(JSON.stringify(moduleConfig));
    cfg.http_clients[0].retry = { max_attempts: 1, backoff_ms: 0, retryable_status: [] };
    await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig: cfg });
    bindBusToModule(mocks, m);
    await m.onLlmCompleteRequest({ request_id: 'r15', messages: [{ role: 'user', content: 'x' }] });
    // Buscar log que loguea headers
    const logsWithHeaders = mocks.logs
      .map(([, , p]) => p)
      .filter(p => p && p.headers);
    assert.ok(logsWithHeaders.length > 0, 'debe haber al menos un log con headers');
    for (const p of logsWithHeaders) {
      assert.strictEqual(p.headers.Authorization, '[REDACTED]', 'Authorization debe estar redactado');
    }
    await m.onUnload();
  });

  console.log('\nai-gateway-poc: todos los tests pasaron ✓');
})().catch(err => { console.error(err); process.exit(1); });

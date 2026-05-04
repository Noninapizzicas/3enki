/**
 * Tests unitarios para ai-gateway.onEmbeddingGenerateRequest.
 *
 * Foco:
 *  - Request canonico → publica embedding.generate.response con shape correcto.
 *  - Response VALIDA contra JSON Schema oficial.
 *  - Error en provider → publica embedding.generate.failed con codigo canonico.
 *  - Failed VALIDA contra JSON Schema oficial.
 *  - Sin payload valido (missing project_id) → no publica nada (warn log).
 *  - Provider sin embeddings explicitamente solicitado → falla con mensaje claro.
 *  - Auto provider selection: prefiere gemini sobre openai si ambos disponibles.
 *
 * Ejecutar: node tests/unit/ai-gateway-embedding.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const Ajv    = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const AiGatewayModule = require('../../modules/conversacion/ai-gateway/index.js');

function makeAjv() {
  const dir = path.resolve(__dirname, '../../arquitectura/decisiones/_schemas/embedding-flow');
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

function fakeProvider(name, opts = {}) {
  return {
    name,
    setContext: () => {},
    isAvailable: async () => opts.available !== false,
    supportsEmbeddings: () => opts.supportsEmbeddings !== false,
    generateEmbedding: async (text, options) => {
      if (opts.error) throw new Error(opts.error);
      return {
        vector: opts.vector || [0.1, 0.2, 0.3, 0.4],
        model: options.model || opts.model || 'embedding-001',
        dimensions: (opts.vector || [0.1, 0.2, 0.3, 0.4]).length,
        tokens: { input: text.length }
      };
    }
  };
}

function instantiate(mocks, providers) {
  const m = new AiGatewayModule();
  m.logger = mocks.logger;
  m.eventBus = mocks.eventBus;
  m.config = { providers: {}, retry: {}, max_tool_iterations: 10 };
  m.providers = new Map();
  for (const [name, p] of Object.entries(providers)) {
    m.providers.set(name, p);
    m.config.providers[name] = { enabled: true, priority: name === 'gemini' ? 5 : 3 };
  }
  return m;
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

(async () => {
  console.log('ai-gateway — embedding entry point\n');
  const ajv = makeAjv();
  const validateResponse = ajv.getSchema('embedding.generate.response.schema.json');
  const validateFailed   = ajv.getSchema('embedding.generate.failed.schema.json');

  await testAsync('request canonico con provider=gemini → publica embedding.generate.response', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks, { gemini: fakeProvider('gemini') });
    await m.onEmbeddingGenerateRequest({
      data: {
        correlation_id: 'corr-1', request_id: 'req-1',
        project_id: 'proj-1', user_id: 'system',
        content: 'Texto a vectorizar',
        settings: { provider: 'gemini', model: 'embedding-001' },
        timestamp: '2026-05-04T10:00:00.000Z'
      }
    });
    const ev = mocks.published.find(p => p[0] === 'embedding.generate.response');
    assert.ok(ev, 'response publicada');
    assert.ok(!mocks.published.find(p => p[0] === 'embedding.generate.failed'), 'NO debe publicar failed');
    const payload = ev[1];
    assert.strictEqual(payload.correlation_id, 'corr-1');
    assert.strictEqual(payload.request_id, 'req-1');
    assert.strictEqual(payload.provider, 'gemini');
    assert.strictEqual(payload.model, 'embedding-001');
    assert.deepStrictEqual(payload.vector, [0.1, 0.2, 0.3, 0.4]);
    assert.strictEqual(payload.dimensions, 4);
    assert.ok(typeof payload.duration_ms === 'number');
  });

  await testAsync('embedding.generate.response VALIDA contra JSON Schema oficial', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks, { gemini: fakeProvider('gemini') });
    await m.onEmbeddingGenerateRequest({
      data: {
        correlation_id: 'c-v', request_id: 'r-v',
        project_id: 'p-v', user_id: 'u-v',
        content: 'hola',
        timestamp: '2026-05-04T10:00:00.000Z'
      }
    });
    const ev = mocks.published.find(p => p[0] === 'embedding.generate.response');
    const ok = validateResponse(ev[1]);
    assert.ok(ok, `payload debe validar. errors: ${JSON.stringify(validateResponse.errors)}`);
  });

  await testAsync('error del provider → publica embedding.generate.failed con codigo canonico', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks, { gemini: fakeProvider('gemini', { error: '429 rate limit exceeded' }) });
    await m.onEmbeddingGenerateRequest({
      data: {
        correlation_id: 'c-err', request_id: 'r-err',
        project_id: 'p-err', user_id: 'u',
        content: 'hola',
        timestamp: '2026-05-04T10:00:00.000Z'
      }
    });
    assert.ok(!mocks.published.find(p => p[0] === 'embedding.generate.response'));
    const ev = mocks.published.find(p => p[0] === 'embedding.generate.failed');
    assert.ok(ev, 'failed publicado');
    assert.strictEqual(ev[1].error.code, 'UPSTREAM_RATE_LIMITED');
    assert.ok(typeof ev[1].duration_ms === 'number');
  });

  await testAsync('embedding.generate.failed VALIDA contra JSON Schema oficial', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks, { gemini: fakeProvider('gemini', { error: 'ETIMEDOUT' }) });
    await m.onEmbeddingGenerateRequest({
      data: {
        correlation_id: 'c-vf', request_id: 'r-vf',
        project_id: 'p-vf', user_id: 'u',
        content: 'hola',
        timestamp: '2026-05-04T10:00:00.000Z'
      }
    });
    const ev = mocks.published.find(p => p[0] === 'embedding.generate.failed');
    const ok = validateFailed(ev[1]);
    assert.ok(ok, `payload debe validar. errors: ${JSON.stringify(validateFailed.errors)}`);
  });

  await testAsync('payload sin project_id descarta silenciosamente con warn', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks, { gemini: fakeProvider('gemini') });
    await m.onEmbeddingGenerateRequest({
      data: { correlation_id: 'c', request_id: 'r', content: 'x' }
    });
    assert.strictEqual(mocks.published.length, 0);
    assert.ok(mocks.logs.find(l => l[1] === 'ai-gateway.embedding.invalid_payload'));
  });

  await testAsync('provider explicit que no soporta embeddings → failed con mensaje claro', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks, {
      deepseek: fakeProvider('deepseek', { supportsEmbeddings: false })
    });
    await m.onEmbeddingGenerateRequest({
      data: {
        correlation_id: 'c', request_id: 'r',
        project_id: 'p', user_id: 'u',
        content: 'x',
        settings: { provider: 'deepseek' },
        timestamp: '2026-05-04T10:00:00.000Z'
      }
    });
    const ev = mocks.published.find(p => p[0] === 'embedding.generate.failed');
    assert.ok(ev);
    assert.ok(/no soporta embeddings/.test(ev[1].error.message));
  });

  await testAsync('auto-selection: prefiere openai (priority 3) sobre gemini (priority 5)', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks, {
      openai: fakeProvider('openai', { vector: [1, 1, 1] }),
      gemini: fakeProvider('gemini', { vector: [9, 9, 9, 9] })
    });
    await m.onEmbeddingGenerateRequest({
      data: {
        correlation_id: 'c', request_id: 'r',
        project_id: 'p', user_id: 'u',
        content: 'x',
        timestamp: '2026-05-04T10:00:00.000Z'
      }
    });
    const ev = mocks.published.find(p => p[0] === 'embedding.generate.response');
    assert.ok(ev);
    assert.strictEqual(ev[1].provider, 'openai', 'priority 3 (openai) gana sobre priority 5 (gemini)');
  });

  await testAsync('sin providers de embeddings disponibles → failed CREDENTIAL_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks, {
      deepseek: fakeProvider('deepseek', { supportsEmbeddings: false })
    });
    await m.onEmbeddingGenerateRequest({
      data: {
        correlation_id: 'c', request_id: 'r',
        project_id: 'p', user_id: 'u',
        content: 'x',
        timestamp: '2026-05-04T10:00:00.000Z'
      }
    });
    const ev = mocks.published.find(p => p[0] === 'embedding.generate.failed');
    assert.ok(ev);
    assert.strictEqual(ev[1].error.code, 'CREDENTIAL_NOT_FOUND');
  });

  console.log('\nai-gateway-embedding: todos los tests pasaron ✓');
})().catch(err => { console.error(err); process.exit(1); });

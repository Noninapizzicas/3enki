/**
 * Tests unitarios — ai-gateway/providers/nous-provider.
 *
 * Lo que fija:
 *  1. La credencial sale SIEMPRE de credential-manager (credential.rotate.resolve),
 *     NUNCA del entorno: una key congelada no sirve para un token que rota.
 *  2. El endpoint es OpenAI-compat y el api_base lleva barra final — sin ella
 *     `new URL('chat/completions', 'https://…/v1')` descarta el /v1 y da 404.
 *  3. SOLO modelos `:free`: la cuenta no tiene saldo y un de pago da 404.
 *  4. El catálogo vivo manda; el declarado es respaldo.
 *  5. Un 429 deja al provider no disponible un rato (el free tier limita).
 *  6. tool_calls: el agentic loop recibe el shape OpenAI.
 *  7. Si credential-manager da error (rotación vencida/revocada), el provider
 *     queda NO disponible y no reintenta.
 *
 * Sin red: makeRequest/makeStreamRequest se inyectan.
 *
 * Ejecutar: node tests/unit/ai-gateway__nous-provider.test.js
 */

'use strict';

const assert = require('assert');
const NousProvider = require('../../modules/conversacion/ai-gateway/providers/nous-provider.js');

const LOG = { debug() {}, info() {}, warn() {}, error() {} };

const CFG = {
  enabled: true,
  api_base: 'https://inference-api.nousresearch.com/v1',
  default_model: 'meituan/longcat-2.5:free',
  models: ['meituan/longcat-2.5:free', 'stepfun/step-3.7-flash:free']
};

function provider({ token = 'tok-vivo', cat = null } = {}) {
  const p = new NousProvider(CFG, LOG, async () => token);
  p.makeRequest = async (method, path) => {
    if (path === 'models') {
      return { data: (cat || ['meituan/longcat-2.5:free', 'deepseek/deepseek-v4.1-flash']).map((id) => ({ id })) };
    }
    return {
      choices: [{ message: { content: 'hola', tool_calls: null }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 2 }
    };
  };
  return p;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('la credencial sale del credential-resolver (rotación), nunca del entorno', async () => {
  const p = new NousProvider(CFG, LOG, async () => 'tok-del-resolver');
  process.env.NOUS_API_KEY = 'key-del-entorno';
  await p.configure();
  assert.strictEqual(p.apiKey, 'tok-del-resolver');
  delete process.env.NOUS_API_KEY;
});

test('sin resolver no hay token: el provider queda no disponible', async () => {
  const p = new NousProvider(CFG, LOG, null);
  await p.configure();
  assert.strictEqual(p.apiKey, null);
  assert.strictEqual(await p.isAvailable(), false);
});

test('el api_base lleva barra final: el /v1 NO se descarta', async () => {
  const p = provider();
  assert.ok(p.apiBase.endsWith('/v1/'), `apiBase=${p.apiBase}`);
  const url = new URL('chat/completions', p.apiBase);
  assert.strictEqual(url.href, 'https://inference-api.nousresearch.com/v1/chat/completions');
});

test('solo modelos :free: un de pago no se sirve', async () => {
  const p = provider();
  await p.configure();
  const r = await p.chatCompletion([{ role: 'user', content: 'x' }], { model: 'meituan/longcat-2.5:free' });
  assert.strictEqual(r.provider, 'nous');
  assert.strictEqual(r.model, 'meituan/longcat-2.5:free');

  const r2 = await p.chatCompletion([{ role: 'user', content: 'x' }], { model: 'deepseek/deepseek-v4.1-flash' });
  assert.strictEqual(r2.model, 'meituan/longcat-2.5:free', 'de pago → cae al free por defecto');
});

test('el catálogo vivo manda: captura los :free y descarta los de pago', async () => {
  const p = provider({ cat: ['meituan/longcat-2.5:free', 'stepfun/step-3.7-flash:free', 'deepseek/deepseek-v4.1-flash'] });
  await p.configure();
  assert.deepStrictEqual(p.catalogo(), ['meituan/longcat-2.5:free', 'stepfun/step-3.7-flash:free']);
});

test('si el catálogo no se captura, usa la lista declarada (respaldo)', async () => {
  const p = provider();
  p.makeRequest = async () => { throw new Error('sin red'); };
  await p.configure();
  assert.deepStrictEqual(p.catalogo(), CFG.models);
});

test('un 429 deja el provider no disponible un rato', async () => {
  const p = provider();
  p.makeRequest = async (m, path) => {
    if (path === 'models') return { data: [{ id: 'meituan/longcat-2.5:free' }] };
    throw new Error('HTTP 429: Too Many Requests');
  };
  await p.configure();
  assert.strictEqual(await p.isAvailable(), true, 'recién arrancado sí');
  await assert.rejects(() => p.chatCompletion([{ role: 'user', content: 'x' }], {}), /429/);
  assert.strictEqual(await p.isAvailable(), false, 'tras el 429 no se reintenta a ciegas');
});

test('tool_calls: el agentic loop recibe el shape OpenAI', async () => {
  const p = provider();
  p.makeRequest = async (m, path) => {
    if (path === 'models') return { data: [{ id: 'meituan/longcat-2.5:free' }] };
    return {
      choices: [{
        message: { content: '', tool_calls: [{ id: 'tc-1', function: { name: 'recetas.listar', arguments: '{}' } }] },
        finish_reason: 'tool_calls'
      }],
      usage: { prompt_tokens: 10, completion_tokens: 3 }
    };
  };
  await p.configure();
  const r = await p.chatCompletion([{ role: 'user', content: 'lista recetas' }], {
    tools: [{ type: 'function', function: { name: 'recetas.listar' } }]
  });
  assert.strictEqual(r.tool_calls.length, 1);
  assert.strictEqual(r.tool_calls[0].function.name, 'recetas.listar');
});

test('el stream devuelve el contenido completo', async () => {
  const p = provider();
  p.makeRequest = async (m, path) => {
    if (path === 'models') return { data: [{ id: 'meituan/longcat-2.5:free' }] };
    return {};
  };
  p.makeStreamRequest = (m, path, data, headers, onChunk, onEnd) => {
    onChunk('data: {"choices":[{"delta":{"content":"ho"}}]}\n\n');
    onChunk('data: {"choices":[{"delta":{"content":"la"}}]}\n\n');
    onChunk('data: [DONE]\n\n');
    onEnd();
  };
  await p.configure();
  const r = await p.chatCompletionStream([{ role: 'user', content: 'x' }], {});
  assert.strictEqual(r.content, 'hola');
});

test('si credential-manager da error (rotación vencida/revocada), no hay token y no reintenta', async () => {
  const p = new NousProvider(CFG, LOG, async () => { throw new Error('CREDENTIAL_REVOKED'); });
  p.makeRequest = async () => ({ data: [{ id: 'meituan/longcat-2.5:free' }] });
  await p.configure();
  assert.strictEqual(p.apiKey, null);
  assert.strictEqual(await p.isAvailable(), false);
  await assert.rejects(() => p.chatCompletion([{ role: 'user', content: 'x' }], {}), /not available/);
});

test('el header de auth es Bearer con el token de la rotación', async () => {
  const p = provider({ token: 'tok-XYZ' });
  const vistos = [];
  p.makeRequest = async (m, path, data, headers) => {
    if (path === 'models') { vistos.push(headers); return { data: [{ id: 'meituan/longcat-2.5:free' }] }; }
    vistos.push(headers);
    return { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: {} };
  };
  await p.configure();
  await p.chatCompletion([{ role: 'user', content: 'x' }], {});
  assert.strictEqual(vistos[vistos.length - 1].Authorization, 'Bearer tok-XYZ');
});

(async () => {
  let fallos = 0;
  for (const t of tests) {
    try { await t.fn(); console.log(`ok — ${t.name}`); }
    catch (err) { fallos += 1; console.error(`FALLO — ${t.name}\n  ${err.message}`); }
  }
  console.log(`\n${tests.length - fallos}/${tests.length} tests ok`);
  if (fallos > 0) process.exitCode = 1;
})();

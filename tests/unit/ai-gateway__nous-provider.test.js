'use strict';

/**
 * ai-gateway/providers/nous-provider — Nous Portal, la cuenta del dueño.
 *
 * Lo que fija este test:
 *   1. La credencial sale del STORE COMPARTIDO de Hermes, no de credential-manager.
 *   2. Enki NO refresca: el refresh del Portal rota el token, y dos refrescadores
 *      peleando revocan la cadena. Si el token vence, el provider queda NO disponible.
 *   3. SOLO modelos `:free`: la cuenta no tiene saldo.
 *   4. El catálogo vivo manda; el declarado es respaldo.
 *   5. Un 429 deja al provider no disponible un rato (el free tier limita).
 *   6. tool_calls: el agentic loop los recibe con el shape OpenAI.
 *
 * Sin red: makeRequest/makeStreamRequest se inyectan. Para el catálogo sí se hace
 * una petición real a /v1/models si existe el store (best-effort, no falla el test).
 *
 * Ejecutar: node tests/unit/ai-gateway__nous-provider.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const NousProvider = require('../../modules/conversacion/ai-gateway/providers/nous-provider.js');

const LOG = { debug() {}, info() {}, warn() {}, error() {} };

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// Store falso (mismo shape que ~/.hermes/shared/nous_auth.json)
function storeDir({ token = 'tok-vivo', expires = null, sinStore = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nous-'));
  if (!sinStore) {
    fs.writeFileSync(path.join(dir, 'nous_auth.json'), JSON.stringify({
      _schema: 1,
      access_token: token,
      refresh_token: 'rt-no-usar',
      client_id: 'hermes-cli',
      portal_base_url: 'https://portal.nousresearch.com',
      inference_base_url: 'https://inference-api.nousresearch.com/v1',
      expires_at: expires || new Date(Date.now() + 3600 * 1000).toISOString()
    }), { mode: 0o600 });
  }
  return dir;
}

const CFG = {
  enabled: true,
  api_base: 'https://inference-api.nousresearch.com/v1',
  default_model: 'meituan/longcat-2.5:free',
  models: ['meituan/longcat-2.5:free', 'stepfun/step-3.7-flash:free']
};

function provider(store, { catalogo = ['meituan/longcat-2.5:free'], sinCatalogo = false } = {}) {
  const dir = storeDir(store);
  const p = new NousProvider({ ...CFG, auth_store: path.join(dir, 'nous_auth.json') }, LOG, async () => null);
  p.makeRequest = async (method, pathReq) => {
    if (pathReq === 'models') {
      if (sinCatalogo) throw new Error('sin red');
      return { data: catalogo.map((id) => ({ id })) };
    }
    return { choices: [{ message: { content: 'hola', tool_calls: null }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2 } };
  };
  return p;
}

test('la credencial sale del store compartido de Hermes, no de credential-manager', async () => {
  const p = provider({ token: 'tok-del-store' });
  await p.configure();
  assert.strictEqual(p.token, 'tok-del-store');
  assert.ok(p.storePath.endsWith('nous_auth.json'));
});

test('sin store no hay token: el provider queda NO disponible, con el store en el log', async () => {
  const warns = [];
  const p = new NousProvider({ ...CFG, auth_store: path.join(storeDir({ sinStore: true }), 'nous_auth.json') },
    { debug() {}, info() {}, warn(...a) { warns.push(a); }, error() {} }, async () => null);
  await p.configure();
  assert.strictEqual(p.token, null);
  assert.strictEqual(await p.isAvailable(), false);
  assert.strictEqual(p.rateLimitedUntil, 0, 'sin token no es 429: es NO_TOKEN');
  assert.ok(warns.length > 0);
});

test('Enki NO refresca: un token vencido deja el provider no disponible (el refresh rota el token)', async () => {
  const p = provider({ token: 'tok-viejo', expires: new Date(Date.now() - 60000).toISOString() });
  await p.configure();
  assert.strictEqual(p.token, null, 'un token vencido no se usa');
  assert.strictEqual(await p.isAvailable(), false);
  assert.strictEqual(await p._refresh(), false, 'no hay refresh en Enki: lo hace Hermes');
});

test('solo modelos :free: un de pago no se sirve, aunque se pida', async () => {
  const p = provider({});
  await p.configure();
  const r = await p.chatCompletion([{ role: 'user', content: 'x' }], { model: 'meituan/longcat-2.5:free' });
  assert.strictEqual(r.provider, 'nous');
  assert.strictEqual(r.model, 'meituan/longcat-2.5:free');

  await assert.rejects(
    () => p.chatCompletion([{ role: 'user', content: 'x' }], { model: 'deepseek/deepseek-v4.1-flash' }),
    /no está entre los gratis/);
});

test('el catálogo vivo manda: lo captura y lo ofrece', async () => {
  const p = provider({}, { catalogo: ['meituan/longcat-2.5:free', 'stepfun/step-3.7-flash:free', 'deepseek/deepseek-v4.1-flash'] });
  await p.configure();
  assert.deepStrictEqual(p.catalogo(), ['meituan/longcat-2.5:free', 'stepfun/step-3.7-flash:free'],
    'los de pago NO entran: la cuenta no tiene saldo');
});

test('sin catálogo capturado, usa la lista declarada (respaldo)', async () => {
  const p = provider({}, { sinCatalogo: true });
  await p.configure();
  assert.deepStrictEqual(p.catalogo(), CFG.models);
});

test('un 429 deja el provider no disponible un rato (el free tier limita)', async () => {
  const p = provider({});
  p.makeRequest = async (m, pathReq) => {
    if (pathReq === 'models') return { data: [{ id: 'meituan/longcat-2.5:free' }] };
    throw new Error('HTTP 429: Too Many Requests');
  };
  await p.configure();
  assert.strictEqual(await p.isAvailable(), true, 'recién arrancado sí');
  await assert.rejects(() => p.chatCompletion([{ role: 'user', content: 'x' }], {}), /429/);
  assert.strictEqual(await p.isAvailable(), false, 'tras el 429 no se reintenta a ciegas');
});

test('tool_calls: el agentic loop recibe el shape OpenAI', async () => {
  const p = provider({});
  p.makeRequest = async (m, pathReq) => {
    if (pathReq === 'models') return { data: [{ id: 'meituan/longcat-2.5:free' }] };
    return {
      choices: [{
        message: { content: '', tool_calls: [{ id: 'tc-1', function: { name: 'recetas.listar', arguments: '{}' } }] },
        finish_reason: 'tool_calls'
      }],
      usage: { prompt_tokens: 10, completion_tokens: 3 }
    };
  };
  await p.configure();
  const r = await p.chatCompletion([{ role: 'user', content: 'lista recetas' }], { tools: [{ type: 'function', function: { name: 'recetas.listar' } }] });
  assert.strictEqual(r.tool_calls.length, 1);
  assert.strictEqual(r.tool_calls[0].function.name, 'recetas.listar');
});

test('el stream devuelve el contenido completo', async () => {
  const p = provider({});
  p.makeRequest = async (m, pathReq) => {
    if (pathReq === 'models') return { data: [{ id: 'meituan/longcat-2.5:free' }] };
    return {};
  };
  p.makeStreamRequest = (m, pathReq, data, headers, onChunk, onEnd, onError) => {
    onChunk('data: {"choices":[{"delta":{"content":"ho"}}]}\n\n');
    onChunk('data: {"choices":[{"delta":{"content":"la"}}]}\n\n');
    onChunk('data: [DONE]\n\n');
    onEnd();
  };
  await p.configure();
  const r = await p.chatCompletionStream([{ role: 'user', content: 'x' }], {});
  assert.strictEqual(r.content, 'hola');
});

test('el store compartido está donde el provider lo busca', () => {
  assert.ok(NousProvider.SHARED_STORE_CANDIDATES.includes('/home/admin/.hermes/shared/nous_auth.json'));
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

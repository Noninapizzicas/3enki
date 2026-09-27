'use strict';

/**
 * deepseek-anthropic__provider — "mismo idioma".
 *
 * deepseek hablando el protocolo NATIVO de Anthropic (tool_use estructurado), el mismo que
 * el provider `anthropic` (Claude). El provider es una subclase de AnthropicProvider que NO
 * sobreescribe nada del protocolo: hereda translateTools/convertMessages/parsing de tool_use
 * tal cual. Solo cambian endpoint, credencial (reusa la de 'deepseek') y nombres de modelo.
 *
 * Este test fija el contrato: es literalmente el mismo idioma (mismas funciones de protocolo),
 * con el cableado mínimo correcto (credencial bajo 'deepseek', no bajo 'deepseek-anthropic').
 *
 * Ejecutar: node tests/unit/deepseek-anthropic__provider.test.js
 */

const assert = require('assert');
const AnthropicProvider = require('../../modules/conversacion/ai-gateway/providers/anthropic-provider.js');
const DeepSeekAnthropicProvider = require('../../modules/conversacion/ai-gateway/providers/deepseek-anthropic-provider.js');

const CFG = {
  enabled: true,
  api_base: 'https://api.deepseek.com',
  default_model: 'deepseek-v4-flash',
  models: ['deepseek-v4-flash', 'deepseek-v4-pro']
};
const LOG = { debug(){}, info(){}, warn(){}, error(){} };

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('ES un AnthropicProvider (mismo idioma: hereda el protocolo)', () => {
  const p = new DeepSeekAnthropicProvider(CFG, LOG, null);
  assert.ok(p instanceof AnthropicProvider, 'debe heredar de AnthropicProvider');
});

test('NO sobreescribe el protocolo: translateTools/convertMessages son los de AnthropicProvider', () => {
  const p = new DeepSeekAnthropicProvider(CFG, LOG, null);
  assert.strictEqual(p.translateTools, AnthropicProvider.prototype.translateTools,
    'translateTools debe ser el heredado (sin override)');
  assert.strictEqual(p.convertMessages, AnthropicProvider.prototype.convertMessages,
    'convertMessages debe ser el heredado (sin override)');
});

test('identidad propia pero credencial redirigida a deepseek', () => {
  const p = new DeepSeekAnthropicProvider(CFG, LOG, null);
  assert.strictEqual(p.name, 'deepseek-anthropic', 'nombre propio para registro/UI');
  assert.strictEqual(p.credentialName, 'deepseek', 'reusa la API key de deepseek, no una nueva');
});

test('api_base es SOLO el host (sin /anthropic): el path absoluto descartaría el segmento', () => {
  const p = new DeepSeekAnthropicProvider(CFG, LOG, null);
  // new URL("/v1/messages", "https://api.deepseek.com/anthropic") perdería /anthropic -> 404.
  assert.strictEqual(p.config.api_base, 'https://api.deepseek.com');
  assert.ok(!/\/anthropic$/.test(p.config.api_base), 'el api_base NO debe terminar en /anthropic');
});

test('_anthropicPath antepone /anthropic al path absoluto del AnthropicProvider (fix del 404)', () => {
  const p = new DeepSeekAnthropicProvider(CFG, LOG, null);
  assert.strictEqual(p._anthropicPath('/v1/messages'), '/anthropic/v1/messages');
  // y new URL con base=host produce la URL correcta del endpoint compat
  assert.strictEqual(new (require('url').URL)(p._anthropicPath('/v1/messages'), p.config.api_base).href,
    'https://api.deepseek.com/anthropic/v1/messages');
});

test('_anthropicPath es idempotente (no duplica /anthropic)', () => {
  const p = new DeepSeekAnthropicProvider(CFG, LOG, null);
  assert.strictEqual(p._anthropicPath('/anthropic/v1/messages'), '/anthropic/v1/messages');
});

test('makeRequest/makeStreamRequest están overrideados en la subclase (no son los de base)', () => {
  const p = new DeepSeekAnthropicProvider(CFG, LOG, null);
  assert.notStrictEqual(p.makeRequest, AnthropicProvider.prototype.makeRequest,
    'makeRequest debe estar overrideado para anteponer /anthropic');
  assert.notStrictEqual(p.makeStreamRequest, AnthropicProvider.prototype.makeStreamRequest,
    'makeStreamRequest debe estar overrideado para anteponer /anthropic');
});

test('refreshApiKey resuelve la credencial bajo "deepseek" (no bajo this.name)', async () => {
  const visto = [];
  const resolver = async (provider) => { visto.push(provider); return 'sk-deepseek-xyz'; };
  const p = new DeepSeekAnthropicProvider(CFG, LOG, resolver);
  await p.refreshApiKey();
  assert.deepStrictEqual(visto, ['deepseek'], 'debe pedir la credencial de deepseek, no de deepseek-anthropic');
  assert.strictEqual(p.apiKey, 'sk-deepseek-xyz');
});

test('si el resolver no da key, cae al entorno (DEEPSEEK_API_KEY)', async () => {
  const prev = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'env-deepseek-key';
  try {
    const resolver = async () => null; // resolver vacío
    const p = new DeepSeekAnthropicProvider(CFG, LOG, resolver);
    await p.refreshApiKey();
    assert.strictEqual(p.apiKey, 'env-deepseek-key', 'cae al entorno cuando el resolver no da key');
  } finally {
    if (prev === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = prev;
  }
});

test('usa el header x-api-key heredado (soportado por el endpoint /anthropic)', () => {
  const p = new DeepSeekAnthropicProvider(CFG, LOG, null);
  // apiVersion heredada de AnthropicProvider; el endpoint la ignora pero es inocua
  assert.strictEqual(p.apiVersion, '2023-06-01', 'hereda anthropic-version (ignorada por deepseek, inocua)');
});

test('_coerceModel: modelo propio (v4-flash/v4-pro) se respeta', () => {
  const p = new DeepSeekAnthropicProvider(CFG, LOG, null);
  assert.strictEqual(p._coerceModel({ model: 'deepseek-v4-flash' }).model, 'deepseek-v4-flash');
  assert.strictEqual(p._coerceModel({ model: 'deepseek-v4-pro' }).model, 'deepseek-v4-pro');
});

test('_coerceModel: alias claude-* se respeta (el endpoint los mapea)', () => {
  const p = new DeepSeekAnthropicProvider(CFG, LOG, null);
  assert.strictEqual(p._coerceModel({ model: 'claude-sonnet-4-6' }).model, 'claude-sonnet-4-6');
});

test('_coerceModel: legacy del retirado OpenAI-compat (deepseek-chat/reasoner) -> default_model', () => {
  const p = new DeepSeekAnthropicProvider(CFG, LOG, null);
  // el endpoint /anthropic no acepta estos nombres -> caen a v4-flash (no rompen conversaciones viejas)
  assert.strictEqual(p._coerceModel({ model: 'deepseek-chat' }).model, 'deepseek-v4-flash');
  assert.strictEqual(p._coerceModel({ model: 'deepseek-reasoner' }).model, 'deepseek-v4-flash');
  assert.strictEqual(p._coerceModel({ model: 'deepseek-coder' }).model, 'deepseek-v4-flash');
});

test('_coerceModel: sin modelo no toca nada (deja que el default actue aguas abajo)', () => {
  const p = new DeepSeekAnthropicProvider(CFG, LOG, null);
  assert.strictEqual(p._coerceModel({}).model, undefined);
});

test('convertMessages: N tool_result consecutivos → UN solo user (no orphan tool_use)', () => {
  const p = new AnthropicProvider(CFG, LOG, null);
  const msgs = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'hola' },
    { role: 'assistant', content: '', tool_calls: [
      { id: 'call_A', type: 'function', function: { name: 'bus_publishAndWait', arguments: '{}' } },
      { id: 'call_B', type: 'function', function: { name: 'cajon_abrir', arguments: '{}' } }
    ] },
    { role: 'tool', tool_call_id: 'call_A', content: 'resA' },
    { role: 'tool', tool_call_id: 'call_B', content: 'resB' }
  ];
  const { messages } = p.convertMessages(msgs);
  // assistant con 2 tool_use seguido de UN user con 2 tool_result (no dos users)
  const asst = messages.find(m => m.role === 'assistant' && Array.isArray(m.content) && m.content.some(c => c.type === 'tool_use'));
  assert.ok(asst, 'debe haber un assistant con tool_use');
  const ids = asst.content.filter(c => c.type === 'tool_use').map(c => c.id);
  assert.deepStrictEqual(ids, ['call_A', 'call_B']);
  const idx = messages.indexOf(asst);
  const next = messages[idx + 1];
  assert.strictEqual(next.role, 'user', 'el siguiente debe ser UN user');
  const resultIds = next.content.filter(c => c.type === 'tool_result').map(c => c.tool_use_id);
  assert.deepStrictEqual(resultIds, ['call_A', 'call_B'], 'AMBOS tool_result en el mismo user');
  // no debe haber un SEGUNDO user de solo tool_result inmediatamente después
  const after = messages[idx + 2];
  assert.ok(!after || !(after.role === 'user' && Array.isArray(after.content) && after.content.every(c => c.type === 'tool_result')),
    'no debe quedar un user de tool_result suelto');
});

test('convertMessages: un solo tool_result sigue siendo un user (sin regresión)', () => {
  const p = new AnthropicProvider(CFG, LOG, null);
  const { messages } = p.convertMessages([
    { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'x', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: 'r1' }
  ]);
  const user = messages.find(m => m.role === 'user');
  assert.strictEqual(user.content.length, 1);
  assert.strictEqual(user.content[0].tool_use_id, 'c1');
});

test('convertMessages: no fusiona a través de un turno normal (user de texto entre medias)', () => {
  const p = new AnthropicProvider(CFG, LOG, null);
  const { messages } = p.convertMessages([
    { role: 'tool', tool_call_id: 'a', content: 'ra' },
    { role: 'user', content: 'texto normal' },
    { role: 'tool', tool_call_id: 'b', content: 'rb' }
  ]);
  const toolResultUsers = messages.filter(m => m.role === 'user' && Array.isArray(m.content) && m.content.every(c => c.type === 'tool_result'));
  assert.strictEqual(toolResultUsers.length, 2, 'separados por un user de texto → NO se fusionan');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[deepseek-anthropic__provider] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[deepseek-anthropic__provider] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

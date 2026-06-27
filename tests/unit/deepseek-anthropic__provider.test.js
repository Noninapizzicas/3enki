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

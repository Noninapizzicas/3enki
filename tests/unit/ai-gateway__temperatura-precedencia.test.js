'use strict';

/**
 * ai-gateway__temperatura-precedencia — la temperatura del turno por PRECEDENCIA.
 *
 * En _executeLLM, chatOptions.temperature se resuelve:
 *   settings.temperature (override humano, efimero)
 *     ?? blueprintCtx.child.temperatura (naturaleza DECLARADA de la pagina)
 *       ?? blueprintCtx.parent.temperatura (default del SUBSISTEMA)
 *         ?? 0.7 (fallback global)
 *
 * Asi la pagina creativa (carta-marketing 0.85) corre caliente y la exacta
 * (escandallo 0.2) fria SIN que el humano lo pida; y un override por mensaje
 * gana por encima cuando hace falta.
 *
 * Stub del provider: captura chatOptions.temperature y corta el loop (sin tools).
 * context.async_invocation=true evita los best-effort (sintonizador/propiocepcion/
 * conserje) — no tocan la temperatura. Ejecutar: node tests/unit/ai-gateway__temperatura-precedencia.test.js
 */

const assert = require('assert');
const AiGatewayModule = require('../../modules/conversacion/ai-gateway/index.js');

function instantiate({ pageTemp, parentTemp } = {}) {
  const captured = { temperature: undefined };
  const provider = {
    withRetry: async (fn) => fn(),
    chatCompletion: async (_messages, opts) => {
      captured.temperature = opts.temperature;
      return { content: 'ok', usage: { input_tokens: 1, output_tokens: 1 }, tool_calls: [], model: 'stub', finish_reason: 'stop' };
    }
  };

  const m = new AiGatewayModule();
  m.logger  = { debug(){}, info(){}, warn(){}, error(){} };
  m.eventBus = { publish: async () => {} };
  m.metrics  = { increment(){}, observe(){}, measure: async (_n, fn) => fn() };
  m.config   = { providers: {}, retry: {}, max_tool_iterations: 10 };

  m._selectProvider = async () => ({ name: 'stub', provider });
  m._getTools = () => [];
  m._resolveAttachments = async () => [];
  m._injectAttachmentsInMessages = (msgs) => msgs;

  m.conversationPageFoco = new Map();
  // Pagina 'pag': si pageTemp es undefined, el blueprint existe pero la CHILD NO
  // declara temperatura -> cae al padre (parentTemp) o al fallback. Si pageTemp es
  // null, la pagina no esta en el mapa (sin blueprint).
  m.blueprintModules = new Map();
  if (pageTemp !== null) {
    const child = {};
    if (pageTemp !== undefined) child.temperatura = pageTemp;
    const parent = {};
    if (parentTemp !== undefined) parent.temperatura = parentTemp;
    m.blueprintModules.set('pag', { child, parent, cajonesEnabled: false, systemPrompt: 'SP' });
  }

  return { m, captured };
}

async function runTurn(m, { pageId, settings }) {
  return m._executeLLM({
    system: null,
    messages: [{ role: 'user', content: 'hola' }],
    tools: [],
    settings: settings || {},
    attachments: [],
    project_id: 'p',
    user_id: 'u',
    conversation_id: 'c',
    correlation_id: 'k',
    page_id: pageId,
    context: { async_invocation: true } // salta sintonizador/propiocepcion/conserje
  });
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('pagina creativa declara 0.85 -> el turno corre a 0.85 (sin override)', async () => {
  const { m, captured } = instantiate({ pageTemp: 0.85 });
  await runTurn(m, { pageId: 'pag', settings: {} });
  assert.strictEqual(captured.temperature, 0.85);
});

test('override humano gana por encima de la temperatura de la pagina', async () => {
  const { m, captured } = instantiate({ pageTemp: 0.85 });
  await runTurn(m, { pageId: 'pag', settings: { temperature: 0.3 } });
  assert.strictEqual(captured.temperature, 0.3);
});

test('override humano 0 es respetado (no se confunde con ausente)', async () => {
  const { m, captured } = instantiate({ pageTemp: 0.85 });
  await runTurn(m, { pageId: 'pag', settings: { temperature: 0 } });
  assert.strictEqual(captured.temperature, 0, '0 es un valor valido, no debe caer al default');
});

test('child sin temperatura -> cae al default del SUBSISTEMA (parent)', async () => {
  const { m, captured } = instantiate({ pageTemp: undefined, parentTemp: 0.4 });
  await runTurn(m, { pageId: 'pag', settings: {} });
  assert.strictEqual(captured.temperature, 0.4, 'sin child.temperatura, manda parent.temperatura');
});

test('child gana al parent cuando ambos declaran', async () => {
  const { m, captured } = instantiate({ pageTemp: 0.85, parentTemp: 0.4 });
  await runTurn(m, { pageId: 'pag', settings: {} });
  assert.strictEqual(captured.temperature, 0.85, 'la pagina afina el default del subsistema');
});

test('ni child ni parent declaran -> fallback 0.7', async () => {
  const { m, captured } = instantiate({ pageTemp: undefined, parentTemp: undefined });
  await runTurn(m, { pageId: 'pag', settings: {} });
  assert.strictEqual(captured.temperature, 0.7);
});

test('sin pagina blueprint y sin override -> fallback 0.7', async () => {
  const { m, captured } = instantiate({ pageTemp: null }); // pagina no esta en el mapa
  await runTurn(m, { pageId: 'inexistente', settings: {} });
  assert.strictEqual(captured.temperature, 0.7);
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[ai-gateway__temperatura-precedencia] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[ai-gateway__temperatura-precedencia] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

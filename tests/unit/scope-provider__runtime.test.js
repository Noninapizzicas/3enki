'use strict';

/**
 * SCOPE PROVIDER — pieza 1 de la fusión LLM.
 * Reflejo puro: resuelve el provider por ámbito (cascada contexto>agente>skill>proyecto>default).
 */

const assert = require('assert');
const ScopeProvider = require('../../modules/scope-provider');

function nuevo() {
  const m = new ScopeProvider();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {}, timing() {}, gauge() {} };
  m.eventBus = { publish: async () => {} };
  m.moduleLoader = { toolsRegistry: new Map() };
  m.onLoad({ logger: m.logger, metrics: m.metrics, eventBus: m.eventBus, moduleLoader: m.moduleLoader });
  return m;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('onLoad registra scope_provider y default=ollama', () => {
  const m = nuevo();
  assert.ok(m.moduleLoader.toolsRegistry.has('scope_provider'), 'registra scope_provider');
  assert.strictEqual(m._defaultProvider(), 'ollama');
});

test('sin ámbito → default (GLOBAL/Ollama)', () => {
  const m = nuevo();
  const r = m._get({ scope: {} });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.provider, 'ollama');
  assert.strictEqual(r.data.resolvedFrom, 'default');
});

test('context explícito → prioridad máxima', () => {
  const m = nuevo();
  const r = m._get({ scope: { context: 'anthropic', project_id: 'x' } });
  assert.strictEqual(r.data.provider, 'anthropic');
  assert.strictEqual(r.data.resolvedFrom, 'context');
});

test('agent con regla → usa ESE provider', () => {
  const m = nuevo();
  m.cfg = { ...m.cfg, scope_rules: { agents: { esquematizador: { provider: 'deepseek', model: 'deepseek-v4-flash' } } } };
  m._ambitosCache = null;
  const r = m._get({ scope: { agent: 'esquematizador' } });
  assert.strictEqual(r.data.provider, 'deepseek');
  assert.strictEqual(r.data.resolvedFrom, 'agent');
});

test('agent sin regla → cae a default', () => {
  const m = nuevo();
  const r = m._get({ scope: { agent: 'no-existe' } });
  assert.strictEqual(r.data.resolvedFrom, 'default');
});

test('project con regla → usa ESE', () => {
  const m = nuevo();
  m.cfg = { ...m.cfg, scope_rules: { projects: { proyA: { provider: 'gemini' } } } };
  m._ambitosCache = null;
  const r = m._get({ scope: { project_id: 'proyA' } });
  assert.strictEqual(r.data.provider, 'gemini');
  assert.strictEqual(r.data.resolvedFrom, 'project');
});

test('handleGetTool 400 sin scope', async () => {
  const m = nuevo();
  const r = await m.handleGetTool({});
  assert.strictEqual(r.status, 400);
});

test('lista_scope agrupa ámbitos', () => {
  const m = nuevo();
  m.cfg = { ...m.cfg, scope_rules: { agents: { a: { provider: 'x' } }, skills: { s: { provider: 'y' } } } };
  m._ambitosCache = null;
  const r = m._listaScope();
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.count >= 2);
});

test('estado reporta default y totales', () => {
  const m = nuevo();
  const r = m._estado();
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.default_provider, 'ollama');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[scope-provider__runtime] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[scope-provider__runtime] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

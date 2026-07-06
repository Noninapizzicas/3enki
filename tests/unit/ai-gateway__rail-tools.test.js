'use strict';

/**
 * ai-gateway__rail-tools — las tools del RAIL VIVO (cúpula de estados) son UNIVERSALES:
 * entran en TODA conversación (blueprint, chat plano y página filtrada), para que el LLM
 * pueda ESCRIBIR el rumbo desde cualquier lado (el nervio ya lo LEE en todas).
 * Si estados no está registrado → [] (no-op seguro).
 *
 * Ejecutar: node tests/unit/ai-gateway__rail-tools.test.js
 */

const assert = require('assert');
const Mod = require('../../modules/conversacion/ai-gateway/index.js');

const RAIL = ['crear_lista', 'anadir_paso', 'completar_paso', 'ver_listas', 'borrar_lista'];

function gateway({ withRail = true } = {}) {
  const m = new Mod();
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  const registry = new Map();
  if (withRail) for (const n of RAIL) registry.set(n, { name: n, description: n + ' desc', parameters: { type: 'object' } });
  const all = [{ name: 'fs.read', description: '' }, { name: 'fs.write', description: '' }];
  if (withRail) for (const n of RAIL) all.push({ name: n, description: n + ' desc' });
  m.moduleLoader = { loadedModules: new Map(), toolsRegistry: registry, getToolsForAI: () => all };
  m.blueprintModules = new Map([['bp-page', { cajonesEnabled: false }], ['bp-cajones', { cajonesEnabled: true }]]);
  m.pagePrefixes = new Map(); // regular-page → sin prefijos; el rail pasa por GLOBAL_TOOLS
  return m;
}

const names = (arr) => new Set((arr || []).map(t => t.name));
const tests = [];
const test = (n, f) => tests.push({ n, f });

test('_railToolsFromRegistry devuelve las 4 tools del registry', () => {
  const m = gateway();
  const r = m._railToolsFromRegistry();
  assert.deepStrictEqual(r.map(t => t.name).sort(), [...RAIL].sort());
});

test('página BLUEPRINT (no-cajones): el rail entra junto a las universales', () => {
  const m = gateway();
  const got = names(m._getTools('bp-page'));
  for (const n of RAIL) assert.ok(got.has(n), `falta ${n} en blueprint`);
  assert.ok(got.has('bus.publish'), 'siguen las universales');
});

test('página BLUEPRINT con cajones: el rail entra junto a cajones+nav+universales', () => {
  const m = gateway();
  const got = names(m._getTools('bp-cajones'));
  for (const n of RAIL) assert.ok(got.has(n), `falta ${n} en blueprint-cajones`);
});

test('chat plano (page_id null): el rail está (return all)', () => {
  const m = gateway();
  const got = names(m._getTools(null));
  for (const n of RAIL) assert.ok(got.has(n), `falta ${n} en chat plano`);
});

test('página regular filtrada: el rail pasa por GLOBAL_TOOLS', () => {
  const m = gateway();
  const got = names(m._getTools('regular-page'));
  for (const n of RAIL) assert.ok(got.has(n), `falta ${n} en página filtrada`);
});

test('si estados NO está registrado → el rail es [] (no-op, no rompe ninguna rama)', () => {
  const m = gateway({ withRail: false });
  assert.deepStrictEqual(m._railToolsFromRegistry(), []);
  const got = names(m._getTools('bp-page'));
  assert.ok(got.has('bus.publish'), 'las universales siguen ahí');
  for (const n of RAIL) assert.ok(!got.has(n), `${n} no debería estar sin registrar`);
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`\n[ai-gateway__rail-tools] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`\n[ai-gateway__rail-tools] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}\n    ${e.message}`);
  process.exit(1);
})();

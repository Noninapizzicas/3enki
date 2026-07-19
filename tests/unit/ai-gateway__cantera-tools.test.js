'use strict';

/**
 * ai-gateway__cantera-tools — las tools de la CANTERA (buscar_skill/activar_skill) son
 * UNIVERSALES: una ORDEN explícita de búsqueda ("busca skill de marketing") debe alcanzar
 * TODA la biblioteca desde cualquier página, y el LLM invocar la que decida. La PRESENTACIÓN
 * proactiva se ciñe al nicho (el conserje, para no saturar); EJECUTAR es universal.
 * Regresión: antes buscar_skill (nombre sin punto, fuera de GLOBAL_TOOLS) era invisible en
 * toda página con page_id → el LLM se rendía a "no está en la cantera" aunque existiera.
 *
 * Ejecutar: node tests/unit/ai-gateway__cantera-tools.test.js
 */

const assert = require('assert');
const Mod = require('../../modules/conversacion/ai-gateway/index.js');

const CANTERA = ['buscar_skill', 'activar_skill'];

function gateway() {
  const m = new Mod();
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  // all = registro completo (lo que getToolsForAI devuelve): incluye las de cantera + una
  // tool de otro módulo que NO debe aparecer en una página ajena (control negativo).
  const all = [
    { name: 'fs.read', description: '' },
    { name: 'otromodulo.privada', description: 'no debe surgir en página ajena' },
  ];
  for (const n of CANTERA) all.push({ name: n, description: n + ' desc' });
  m.moduleLoader = { loadedModules: new Map(), toolsRegistry: new Map(), getToolsForAI: () => all };
  m.blueprintModules = new Map([['bp-page', { cajonesEnabled: false }], ['bp-cajones', { cajonesEnabled: true }]]);
  m.pagePrefixes = new Map(); // regular-page → sin prefijos: solo las globales pasan
  return m;
}

const names = (arr) => new Set((arr || []).map(t => t.name));
const tests = [];
const test = (n, f) => tests.push({ n, f });

test('página regular filtrada: buscar_skill/activar_skill pasan por GLOBAL_TOOLS', () => {
  const m = gateway();
  const got = names(m._getTools('regular-page'));
  for (const n of CANTERA) assert.ok(got.has(n), `falta ${n} en página filtrada`);
  assert.ok(!got.has('otromodulo.privada'), 'una tool de módulo ajeno NO aflora (la presentación se ciñe)');
});

test('página BLUEPRINT (no-cajones): la cantera entra junto a las universales', () => {
  const m = gateway();
  const got = names(m._getTools('bp-page'));
  for (const n of CANTERA) assert.ok(got.has(n), `falta ${n} en blueprint`);
});

test('página BLUEPRINT con cajones: la cantera entra junto a cajones+universales', () => {
  const m = gateway();
  const got = names(m._getTools('bp-cajones'));
  for (const n of CANTERA) assert.ok(got.has(n), `falta ${n} en blueprint-cajones`);
});

test('chat plano (page_id null): la cantera está (return all)', () => {
  const m = gateway();
  const got = names(m._getTools(null));
  for (const n of CANTERA) assert.ok(got.has(n), `falta ${n} en chat plano`);
});

(async () => {
  let ok = 0;
  for (const { n, f } of tests) {
    try { await f(); console.log('  ✓ ' + n); ok++; }
    catch (e) { console.log('  ✗ ' + n + '\n    ' + e.message); }
  }
  console.log(`[ai-gateway__cantera-tools] ${ok === tests.length ? 'OK' : 'FAIL'} ${ok}/${tests.length}`);
  process.exit(ok === tests.length ? 0 : 1);
})();

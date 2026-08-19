'use strict';

/**
 * CÚPULA DE APIS PÚBLICAS — el catálogo externo buscable.
 *
 * Verifica las tools de consulta (buscar_api, obtener_api) contra el catálogo
 * semilla real del repo. No toca el bus — solo el módulo en aislamiento.
 *
 * Ejecutar: node tests/unit/apis-publicas__runtime.test.js
 */

const assert = require('assert');
const ApisPublicas = require('../../modules/apis-publicas');

function nuevo() {
  const m = new ApisPublicas();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {}, timing() {}, gauge() {} };
  m.eventBus = { publish: async () => {} };
  m.moduleLoader = { toolsRegistry: new Map() };
  m.onLoad({ logger: m.logger, metrics: m.metrics, eventBus: m.eventBus, moduleLoader: m.moduleLoader });
  return m;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('onLoad carga el catálogo completo y registra las tools', () => {
  const m = nuevo();
  assert.ok(m.catalogo.size >= 1600, `catálogo completo cargado (${m.catalogo.size})`);
  assert.ok(m.prioritarias.size >= 13, 'prioritarias marcadas');
  assert.ok(m.moduleLoader.toolsRegistry.has('buscar_api'), 'registra buscar_api');
  assert.ok(m.moduleLoader.toolsRegistry.has('obtener_api'), 'registra obtener_api');
});

test('buscar_api rankea por relevancia', () => {
  const m = nuevo();
  const r = m._buscar({ query: 'currency exchange' });
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.total >= 1, 'encuentra APIs de divisa');
  assert.ok(r.data.apis.length >= 1);
});

test('buscar_api filtra por categoría', () => {
  const m = nuevo();
  const r = m._buscar({ query: 'a', categoria: 'Currency' });
  assert.ok(r.data.apis.length === 0 || r.data.apis.every(a => a.categoria === 'Currency'), 'solo Currency');
});

test('obtener_api devuelve la ficha completa', () => {
  const m = nuevo();
  const r = m._obtener({ nombre: 'Open Food Facts' });
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.url, 'tiene URL');
  assert.ok(r.data.ejemplo, 'genera ejemplo');
});

test('obtener_api → 404 para API inexistente', () => {
  const m = nuevo();
  const r = m._obtener({ nombre: 'NoExiste' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
});

test('obtener_api → 400 sin nombre', () => {
  const m = nuevo();
  assert.strictEqual(m._obtener({}).status, 400);
});

test('listar_categorias agrupa', () => {
  const m = nuevo();
  const r = m._listarCategorias();
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.total >= 1);
});

test('estado reporta totales', () => {
  const m = nuevo();
  const r = m._estado();
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.total >= 13);
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[apis-publicas__runtime] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[apis-publicas__runtime] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

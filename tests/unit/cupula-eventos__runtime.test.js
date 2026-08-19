'use strict';

/**
 * CÚPULA DE EVENTOS (runtime) — el contrato del bus servido al LLM.
 *
 * Verifica las 4 tools de consulta (evento_indice, evento_detalle, evento_buscar,
 * evento_fantasma) contra el escaneo real del repo. No toca el bus — solo el
 * módulo en aislamiento con un registry/escaneo sintético.
 *
 * Ejecutar: node tests/unit/cupula-eventos__runtime.test.js
 */

const assert = require('assert');
const CupulaEventos = require('../../modules/cupula-eventos');

function nuevo(opts = {}) {
  const m = new CupulaEventos();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {}, timing() {}, gauge() {} };
  m.eventBus = { publish: async () => {} };
  // Si opts.conRepo=true, escanea el repo real (solo indice/detalle, sin mutaciones)
  if (opts.conRepo) {
    m.onLoad({ logger: m.logger, metrics: m.metrics, eventBus: m.eventBus, moduleLoader: {} });
  } else {
    // Censo sintético mínimo para las proyecciones
    m.atendidos.set('estados.crear.request', ['modules/estados/module.json']);
    m.atendidos.set('a.pedido.creado', ['modules/pedidos/module.json']);
    m.conducidos.push({ evento: 'escandallo.costear.request', por: 'skill:test' });
    m.conducidos.push({ evento: 'fantasma.test.request', por: 'skill:test' }); // no atendido → fantasma
    m.publicados.push({ evento: 'a.pedido.creado', por: 'modules/pedidos/module.json' });
    m.censadoEn = '2026-08-19T00:00:00.000Z';
  }
  return m;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('onLoad construye censo con atendidos/conducidos/publicados', () => {
  const m = nuevo({ conRepo: true });
  assert.ok(m.atendidos.size > 0, 'atendidos > 0');
  assert.ok(m.conducidos.length >= 0);
  assert.ok(m.publicados.length >= 0);
  assert.ok(m.censadoEn, 'tiene timestamp de censado');
});

test('evento_indice resume el censo', () => {
  const m = nuevo();
  const { data } = m._indice();
  assert.ok(typeof data.atendidos === 'number');
  assert.ok(typeof data.conducidos === 'number');
  assert.ok(typeof data.publicados === 'number');
  assert.ok('rpc_fantasma' in data);
});

test('evento_detalle devuelve quién atiende un evento', () => {
  const m = nuevo();
  const r = m._detalle({ nombre: 'a.pedido.creado' });
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.atendido_por.includes('modules/pedidos/module.json'));
  assert.ok(r.data.publicado_por.length >= 1);
});

test('evento_detalle → 404 para evento inexistente', () => {
  const m = nuevo();
  const r = m._detalle({ nombre: 'no.existe.ejemplo' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
});

test('evento_detalle → 400 sin nombre', () => {
  const m = nuevo();
  assert.strictEqual(m._detalle({}).status, 400);
});

test('evento_buscar encuentra por palabra', () => {
  const m = nuevo();
  const r = m._buscar({ q: 'pedido' });
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.eventos.some(e => e.nombre.includes('pedido')));
});

test('evento_buscar respeta el límite', () => {
  const m = nuevo();
  const r = m._buscar({ q: 'a', topK: 2 });
  assert.ok(r.data.eventos.length <= 2);
});

test('evento_fantasma detecta los conducidos sin atender', () => {
  const m = nuevo();
  const { data } = m._fantasma();
  assert.ok(data.rpc_fantasma.some(x => x.evento === 'fantasma.test.request'), 'detecta el fantasma');
});

test('escaneo del repo NO lanza (robusto)', () => {
  const m = nuevo({ conRepo: true });
  assert.doesNotThrow(() => m._escanear());
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[cupula-eventos__runtime] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[cupula-eventos__runtime] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

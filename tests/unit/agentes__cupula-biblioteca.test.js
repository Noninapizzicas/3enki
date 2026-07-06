'use strict';

/**
 * agentes__cupula-biblioteca — CÚPULA DE AGENTES (tramo 1): la flota es una BIBLIOTECA
 * buscable. _loadAgents llena this.library con TODAS las definiciones (activas o no); solo
 * las enabled pasan a this.agents (invocables). buscar_agente encuentra el trabajador para
 * una tarea, esté activo o no. Gemela de buscar_skill (cantera).
 *
 * Ejecutar: node tests/unit/agentes__cupula-biblioteca.test.js
 */

const assert = require('assert');
const Mod = require('../../modules/conversacion/ai-agent-framework/index.js');

function fw() {
  const m = new Mod();
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  m.metrics = { increment() {} };
  m.eventBus = { published: [], publish(ev, data) { this.published.push({ ev, data }); } };
  m.moduleLoader = { toolsRegistry: new Map() };
  m._loadAgents(); // llena library + agents desde agents/*.json (los 29 reales)
  m._registerBuscarAgenteTool();
  return m;
}

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('la BIBLIOTECA conoce todas las definiciones (activas o no)', () => {
  const m = fw();
  assert.ok(m.library.size >= 25, `biblioteca demasiado pequeña: ${m.library.size}`);
});

test('hoy todas están aparcadas → agents (activos/invocables) vacío, pero buscables', () => {
  const m = fw();
  assert.strictEqual(m.agents.size, 0, 'ninguna debería estar activa (las 29 aparcadas)');
  // aún así la biblioteca las tiene, marcadas activo:false
  const alguna = [...m.library.values()][0];
  assert.strictEqual(alguna.activo, false);
});

test('buscar_agente encuentra el especialista por tokens (escandallo → escandallo-analyzer)', () => {
  const m = fw();
  const r = m._buscarAgente({ query: 'analizar escandallo' });
  const nombres = r.agentes.map(a => a.nombre);
  assert.ok(nombres.includes('escandallo-analyzer'), `no encontró escandallo-analyzer: ${nombres.join(',')}`);
  const esc = r.agentes.find(a => a.nombre === 'escandallo-analyzer');
  assert.strictEqual(esc.activo, false, 'lo encuentra aunque esté OFF');
});

test('buscar_agente respeta el filtro de dominio', () => {
  const m = fw();
  const r = m._buscarAgente({ query: 'factura', dominio: 'facturas' });
  assert.ok(r.agentes.length > 0, 'debería haber agentes de facturas');
  assert.ok(r.agentes.every(a => a.dominio === 'facturas'), 'todos del dominio facturas');
});

test('los OBSOLETOS no salen en la búsqueda', () => {
  const m = fw();
  const r = m._buscarAgente({ query: 'recipe estructurador ocr', limite: 30 });
  const nombres = r.agentes.map(a => a.nombre);
  assert.ok(!nombres.includes('recipe-structurer'), 'recipe-structurer es obsoleto, no debe salir');
  assert.ok(!nombres.includes('recipe-curator'), 'recipe-curator es obsoleto, no debe salir');
});

test('buscar_agente registra la tool en toolsRegistry', () => {
  const m = fw();
  assert.ok(m.moduleLoader.toolsRegistry.get('buscar_agente'), 'buscar_agente registrada');
});

test('onBuscarAgente publica buscar_agente.response {request_id, result}', async () => {
  const m = fw();
  await m.onBuscarAgente({ data: { request_id: 'r1', query: 'carta digital' } });
  const resp = m.eventBus.published.find(p => p.ev === 'buscar_agente.response');
  assert.ok(resp, 'publicó la response');
  assert.strictEqual(resp.data.request_id, 'r1');
  assert.ok(resp.data.result && Array.isArray(resp.data.result.agentes), 'result con agentes');
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`\n[agentes__cupula-biblioteca] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`\n[agentes__cupula-biblioteca] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}\n    ${e.message}`);
  process.exit(1);
})();

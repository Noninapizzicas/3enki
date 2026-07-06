'use strict';

/**
 * agentes__cupula-biblioteca — CÚPULA DE AGENTES: la flota es una BIBLIOTECA.
 *   TRAMO 1: _loadAgents llena this.library con TODAS las definiciones (activas o no); solo
 *     las enabled pasan a this.agents (invocables). buscar_agente encuentra el trabajador para
 *     una tarea, esté activo o no. Gemela de buscar_skill (cantera).
 *   TRAMO 2: activar_agente enciende un agente aparcado (overlay data/activaciones.json) →
 *     entra en this.agents y en invoke_agent EN CALIENTE. desactivar_agente lo revierte.
 *
 * Ejecutar: node tests/unit/agentes__cupula-biblioteca.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Mod = require('../../modules/conversacion/ai-agent-framework/index.js');

const _tmpFiles = [];
function fw() {
  const m = new Mod();
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  m.metrics = { increment() {} };
  m.eventBus = { published: [], publish(ev, data) { this.published.push({ ev, data }); } };
  m.moduleLoader = { toolsRegistry: new Map() };
  // overlay de activaciones en un tmp aislado (no ensuciar data/ real)
  const tmp = path.join(os.tmpdir(), `activaciones-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  m._activacionesFile = tmp; _tmpFiles.push(tmp);
  m._loadActivaciones();
  m._loadAgents(); // llena library + agents desde agents/*.json (los 29 reales)
  m._registerBuscarAgenteTool();
  m._registerActivarAgenteTool();
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

// ─── TRAMO 2 · activar / desactivar ─────────────────────────────────────────

test('activar_agente y desactivar_agente están registradas con confirmation:true', () => {
  const m = fw();
  const a = m.moduleLoader.toolsRegistry.get('activar_agente');
  const d = m.moduleLoader.toolsRegistry.get('desactivar_agente');
  assert.ok(a && a.confirmation === true, 'activar_agente confirmation:true');
  assert.ok(d && d.confirmation === true, 'desactivar_agente confirmation:true');
});

test('_activar enciende un agente aparcado → entra en this.agents y en invoke_agent (en caliente)', () => {
  const m = fw();
  assert.strictEqual(m.agents.has('escandallo-analyzer'), false, 'parte apagado');
  const r = m._activar({ nombre: 'escandallo-analyzer' });
  assert.strictEqual(r.activado, true);
  assert.strictEqual(m.agents.has('escandallo-analyzer'), true, 'ahora invocable');
  // invoke_agent re-registrada con el nuevo enum → lo incluye
  const invoke = m.moduleLoader.toolsRegistry.get('invoke_agent');
  assert.ok(invoke.parameters.properties.agent_name.enum.includes('escandallo-analyzer'), 'invoke_agent lo enumera');
  // buscar_agente ahora lo ve activo:true
  const found = m._buscarAgente({ query: 'escandallo' }).agentes.find(a => a.nombre === 'escandallo-analyzer');
  assert.strictEqual(found.activo, true);
});

test('_activar persiste el overlay y sobrevive a una recarga (semilla+crecido)', () => {
  const m = fw();
  m._activar({ nombre: 'escandallo-analyzer' });
  // un framework NUEVO apuntando al mismo overlay lo levanta encendido
  const m2 = new Mod();
  m2.logger = { info() {}, warn() {}, error() {}, debug() {} };
  m2.metrics = { increment() {} };
  m2.eventBus = { publish() {} };
  m2.moduleLoader = { toolsRegistry: new Map() };
  m2._activacionesFile = m._activacionesFile;
  m2._loadActivaciones();
  m2._loadAgents();
  assert.strictEqual(m2.agents.has('escandallo-analyzer'), true, 'el overlay revive el encendido');
});

test('_activar de un agente desconocido → 404', () => {
  const m = fw();
  const r = m._activar({ nombre: 'no-existe-jamas' });
  assert.strictEqual(r.status, 404);
  assert.deepStrictEqual(r.error.details.faltan, ['no-existe-jamas']);
});

test('_desactivar revierte el encendido por overlay (reversibilidad) → sale de this.agents', () => {
  const m = fw();
  m._activar({ nombre: 'escandallo-analyzer' });
  const r = m._desactivar({ nombre: 'escandallo-analyzer' });
  assert.strictEqual(r.desactivado, true);
  assert.strictEqual(m.agents.has('escandallo-analyzer'), false, 'ya no invocable');
  const invoke = m.moduleLoader.toolsRegistry.get('invoke_agent');
  assert.ok(!invoke.parameters.properties.agent_name.enum.includes('escandallo-analyzer'), 'invoke_agent ya no lo enumera');
});

test('_desactivar de algo no encendido por overlay → 404 (no había overlay)', () => {
  const m = fw();
  const r = m._desactivar({ nombre: 'escandallo-analyzer' });
  assert.strictEqual(r.status, 404);
});

test('onActivarAgente publica activar_agente.response con result', async () => {
  const m = fw();
  await m.onActivarAgente({ data: { request_id: 'a1', nombre: 'escandallo-analyzer' } });
  const resp = m.eventBus.published.find(p => p.ev === 'activar_agente.response');
  assert.ok(resp && resp.data.request_id === 'a1');
  assert.strictEqual(resp.data.result.activado, true);
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  for (const f of _tmpFiles) { try { fs.unlinkSync(f); } catch {} }
  if (fails.length === 0) { console.log(`\n[agentes__cupula-biblioteca] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`\n[agentes__cupula-biblioteca] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}\n    ${e.message}`);
  process.exit(1);
})();

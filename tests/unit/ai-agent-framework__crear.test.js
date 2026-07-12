'use strict';

/**
 * ai-agent-framework__crear — CÚPULA DE AGENTES (tramo 3): crear_agente.
 * Cierra la escalera buscar→activar→CREAR. _crear valida una definición, la escribe en
 * el dir CRECIDO (patrón semilla+crecido) y re-carga EN CALIENTE → el agente nace
 * INVOCABLE (this.agents) y BUSCABLE (this.library), sin reiniciar. El seam de la
 * autogestión: el sistema crea sus propios agentes.
 *
 * Ejecutar: node tests/unit/ai-agent-framework__crear.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Mod = require('../../modules/conversacion/ai-agent-framework/index.js');

const _tmp = [];
function fw() {
  const m = new Mod();
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  m.metrics = { increment() {} };
  m.eventBus = { published: [], publish(ev, data) { this.published.push({ ev, data }); } };
  m.moduleLoader = { toolsRegistry: new Map() };
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  m._activacionesFile = path.join(os.tmpdir(), `activaciones-${stamp}.json`);
  m._crecidoDir = path.join(os.tmpdir(), `agentes-crecido-${stamp}`);   // AISLADO — no ensucia data/ real
  _tmp.push(m._activacionesFile, m._crecidoDir);
  m._loadActivaciones();
  m._loadAgents();
  m._registerBuscarAgenteTool();
  m._registerActivarAgenteTool();
  m._registerCrearAgenteTool();
  return m;
}
function limpiar() { for (const p of _tmp) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} } }

const tests = [];
const test = (n, f) => tests.push({ n, f });

const DEF = {
  name: 'vinculador-imagenes-test',
  description: 'vincula imágenes de una tienda externa a los productos del catálogo en lote',
  prompt: 'Resuelve el caso AFIRMACION_EXTERNA: por cada producto sin imagen, act(faltan[0]) — halla la url, add_imagen(url_remota) — y re-evalúa hasta circuloCerrado.cerrado.',
  scope: ['pizzepos'],
  tools: ['leer_web', 'descargar_web']
};

test('crear → nace INVOCABLE (this.agents) con prompt inline como política', () => {
  const m = fw();
  const antes = m.agents.size;
  const r = m._crear(DEF);
  assert.strictEqual(r.creado, true);
  assert.strictEqual(r.invocable, true);
  assert.ok(m.agents.has(DEF.name), 'entra en agents (invocable)');
  assert.strictEqual(m.agents.get(DEF.name).prompt_text, DEF.prompt, 'el prompt inline es la política');
  assert.deepStrictEqual(m.agents.get(DEF.name).tools, ['leer_web', 'descargar_web']);
  assert.strictEqual(m.agents.size, antes + 1);
});

test('crear → BUSCABLE por buscar_agente al instante', () => {
  const m = fw();
  m._crear(DEF);
  const found = m._buscarAgente({ query: 'vincular imágenes catálogo' }).agentes.map(a => a.nombre);
  assert.ok(found.includes(DEF.name), 'el agente recién creado se halla en la biblioteca');
});

test('crecido PERSISTE: escrito en el dir, sobrevive a un _loadAgents', () => {
  const m = fw();
  m._crear(DEF);
  assert.ok(fs.existsSync(path.join(m._crecidoDir, DEF.name + '.json')), 'def escrito en el dir crecido');
  m._loadAgents();
  assert.ok(m.agents.has(DEF.name), 're-cargado desde el dir crecido');
  assert.strictEqual(m.library.get(DEF.name).crecido, true, 'marcado como crecido');
});

test('validación: sin name/description/prompt → error; name no-slug → error', () => {
  const m = fw();
  assert.strictEqual(m._crear({ description: 'x', prompt: 'y' }).status, 400, 'sin name');
  assert.strictEqual(m._crear({ name: 'a', prompt: 'y' }).status, 422, 'sin description');
  assert.strictEqual(m._crear({ name: 'a', description: 'x' }).status, 422, 'sin prompt (política)');
  assert.strictEqual(m._crear({ name: 'mal nombre!', description: 'x', prompt: 'y' }).status, 400, 'name no-slug');
});

test('no pisa un agente SEMILLA por nombre (409, aunque esté aparcado)', () => {
  const m = fw();
  const semilla = [...m.library.values()].find(a => !a.crecido);
  assert.ok(semilla, 'hay definiciones semilla en la biblioteca');
  const r = m._crear({ name: semilla.name, description: 'secuestro', prompt: 'x' });
  assert.strictEqual(r.status, 409, 'un crecido no puede robar el nombre de una semilla');
});

test('onCrearAgente responde correlado por request_id', async () => {
  const m = fw();
  await m.onCrearAgente({ data: { request_id: 'REQ-9', ...DEF, name: 'otro-agente-test' } });
  const resp = m.eventBus.published.find(p => p.ev === 'crear_agente.response');
  assert.ok(resp);
  assert.strictEqual(resp.data.request_id, 'REQ-9');
  assert.strictEqual(resp.data.result.creado, true);
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  limpiar();
  if (fails.length === 0) { console.log(`\n[ai-agent-framework__crear] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`\n[ai-agent-framework__crear] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}\n    ${e.message}`);
  process.exit(1);
})();

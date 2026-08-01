'use strict';

/**
 * estados · RAIL-PROTOCOLO — pasos con FORMA EJECUTABLE + invalidación del veredicto.
 *
 * El rail deja de ser una lista de intenciones y pasa a ser un protocolo paso a
 * paso: cada paso puede declarar {tool, input, verifica} — el LLM sabe EXACTAMENTE
 * qué tool usar, con qué input, y qué respuesta confirma que está hecho.
 *
 * Además fija el fix del veredicto STALE: cualquier mutación que reabra la lista
 * o cambie su objetivo INVALIDA ultima_evaluacion (el "CUMPLIDO" viejo no puede
 * congelar el rail — bug visto en Regalos pos_dashboard_hibrido).
 *
 * Ejecutar: node tests/unit/estados__rail-protocolo.test.js
 */

const assert = require('assert');
const EstadosReflejo = require('../../modules/estados');

function nuevo() {
  const r = new EstadosReflejo();
  const fs = new Map();
  r.logger = { info() {}, warn() {}, error() {}, debug() {} };
  r.metrics = { increment() {} };
  r.eventBus = { publish() {} };
  r._rpc = async (evento, payload) => {
    const key = `${payload.project_id}::${payload.path}`;
    if (evento === 'fs.read.request') return fs.has(key) ? { status: 200, content: fs.get(key) } : { status: 404 };
    if (evento === 'fs.write.request') { fs.set(key, payload.content); return { status: 200 }; }
    return null;
  };
  return r;
}

const PID = 'proj-protocolo';
const tests = [];
const test = (n, f) => tests.push({ n, f });

test('crear con pasos con FORMA ejecutable → se persisten {tool, input, verifica}', async () => {
  const r = nuevo();
  const c = await r._crear({ project_id: PID, nombre: 'Publicar POS', orden: 'estricto', pasos: [
    { texto: 'Construir dashboard', forma: { tool: 'fs.write', input: { path: '/www/pos/dashboard.html' }, verifica: 'status 200 y el archivo existe' } },
    { texto: 'Publicar index', forma: { tool: 'fs.write', input: '/www/pos/index.html', verifica: 'status 200' } },
    'sin forma (compatibilidad)'
  ] });
  assert.strictEqual(c.status, 201);
  const e = await r._estado({ project_id: PID, lista_id: 'publicar_pos' });
  const pasos = e.data.lista.pasos;
  assert.deepStrictEqual(pasos[0].forma, { tool: 'fs.write', input: { path: '/www/pos/dashboard.html' }, verifica: 'status 200 y el archivo existe' });
  assert.deepStrictEqual(pasos[1].forma, { tool: 'fs.write', input: '/www/pos/index.html', verifica: 'status 200' });
  assert.strictEqual(pasos[2].forma, undefined, 'paso string sigue sin forma (retrocompatible)');
});

test('anadir_paso con forma → persiste la forma', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'A' });
  const a = await r._anadir({ project_id: PID, lista_id: 'a', texto: 'x', forma: { tool: 'cobro.crear', verifica: 'status 200' } });
  assert.strictEqual(a.status, 200);
  const e = await r._estado({ project_id: PID, lista_id: 'a' });
  assert.deepStrictEqual(e.data.lista.pasos[0].forma, { tool: 'cobro.crear', verifica: 'status 200' });
});

test('veredicto satisfecho se INVALIDA al añadir un paso (fix STALE)', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'V' });
  const lista = (await r._estado({ project_id: PID, lista_id: 'v' })).data.lista;
  lista.ultima_evaluacion = { satisfecho: true, blocker: 'none', ts: 'x' };
  await r._guardar(PID, { activa: null, listas: { v: lista } });
  await r._anadir({ project_id: PID, lista_id: 'v', texto: 'paso nuevo' });
  const e = await r._estado({ project_id: PID, lista_id: 'v' });
  assert.strictEqual(e.data.lista.ultima_evaluacion, null, 'añadir paso debe invalidar el veredicto');
});

test('veredicto satisfecho se INVALIDA al fijar otro objetivo (fix STALE)', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'O' });
  const lista = (await r._estado({ project_id: PID, lista_id: 'o' })).data.lista;
  lista.ultima_evaluacion = { satisfecho: true, blocker: 'none', ts: 'x' };
  await r._guardar(PID, { activa: null, listas: { o: lista } });
  await r._fijarObjetivo({ project_id: PID, lista_id: 'o', objetivo: 'otro objetivo' });
  const e = await r._estado({ project_id: PID, lista_id: 'o' });
  assert.strictEqual(e.data.lista.ultima_evaluacion, null, 'cambiar objetivo debe invalidar el veredicto');
});

test('marcar un paso pendiente en lista completa → REABRE y el veredicto se invalida (fix STALE)', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'M', pasos: ['a', 'b'] });
  const e0 = await r._estado({ project_id: PID, lista_id: 'm' });
  const [p0, p1] = e0.data.lista.pasos;
  await r._marcar({ project_id: PID, lista_id: 'm', paso_id: p0.id, estado: 'hecho' });
  await r._marcar({ project_id: PID, lista_id: 'm', paso_id: p1.id, estado: 'hecho' });
  const e1 = await r._estado({ project_id: PID, lista_id: 'm' });
  assert.strictEqual(e1.data.lista.estado, 'completa');
  e1.data.lista.ultima_evaluacion = { satisfecho: true, blocker: 'none' };
  await r._guardar(PID, { activa: null, listas: { m: e1.data.lista } });
  // reabrir: volver el paso 1 a pendiente
  await r._marcar({ project_id: PID, lista_id: 'm', paso_id: p0.id, estado: 'pendiente' });
  const e2 = await r._estado({ project_id: PID, lista_id: 'm' });
  assert.strictEqual(e2.data.lista.estado, 'abierta', 'marcar pendiente reabre la lista');
  assert.strictEqual(e2.data.lista.ultima_evaluacion, null, 'reabrir invalida el veredicto');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { n, f } of tests) {
    try { await f(); passed++; }
    catch (err) { fails.push({ n, err }); }
  }
  if (fails.length === 0) { console.log(`\n[estados__rail-protocolo] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[estados__rail-protocolo] FAIL ${fails.length}/${tests.length}`);
  for (const { n, err } of fails) console.error(`  x ${n}\n    ${err.message}`);
  process.exit(1);
})();

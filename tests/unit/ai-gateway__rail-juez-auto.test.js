'use strict';

/**
 * ai-gateway__rail-juez-auto — EL TIRO AUTOMÁTICO del juez del rail (como DeerFlow:
 * evaluador post-run con safety caps). Fire-and-forget tras el turno real: si el rail
 * activo tiene objetivo, hace UNA llamada de juez y aplica el veredicto via estados.evaluar,
 * con caps (8 evals · para tras 2 no-progresos). Best-effort: nunca rompe el turno.
 *
 * Ejecutar: node tests/unit/ai-gateway__rail-juez-auto.test.js
 */

const assert = require('assert');
const Mod = require('../../modules/conversacion/ai-gateway/index.js');

function gw() {
  const m = new Mod();
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  m.config = {};
  return m;
}

// arnés: rail dado + provider que devuelve `verdict`; captura llamadas de juez y aplicaciones.
function armar(m, { rail, verdict }) {
  const calls = { juez: 0, aplicado: [] };
  m._leerRailActivo = async () => rail;
  m._selectProvider = async () => ({ provider: { chatCompletion: async () => { calls.juez++; return { content: JSON.stringify(verdict) }; } } });
  m._railEvaluar = async (pid, lid, v) => { calls.aplicado.push(v); return { status: 200, data: { satisfecho: v.satisfecho, blocker: v.satisfecho ? 'none' : v.blocker } }; };
  return calls;
}

const tests = [];
const test = (n, f) => tests.push({ n, f });

// ── helpers puros ──
test('_parseVeredicto: JSON plano, con fences, y dentro de texto', () => {
  const m = gw();
  assert.deepStrictEqual(m._parseVeredicto('{"satisfecho":true,"blocker":"none"}'), { satisfecho: true, blocker: 'none' });
  assert.ok(m._parseVeredicto('```json\n{"satisfecho":false,"blocker":"goal_not_met_yet"}\n```').blocker === 'goal_not_met_yet');
  assert.ok(m._parseVeredicto('Aquí va: {"satisfecho":true,"blocker":"none"} listo').satisfecho === true);
});

test('_parseVeredicto: rechaza no-JSON o sin satisfecho booleano', () => {
  const m = gw();
  assert.strictEqual(m._parseVeredicto('no soy json'), null);
  assert.strictEqual(m._parseVeredicto('{"blocker":"x"}'), null);
  assert.strictEqual(m._parseVeredicto(''), null);
});

test('_composeJuezInput: lleva objetivo, pasos y la conversación reciente (últimos 6)', () => {
  const m = gw();
  const rail = { nombre: 'R', orden: 'libre', objetivo: 'META X', pasos: [{ estado: 'hecho', texto: 'a' }, { estado: 'pendiente', texto: 'b' }] };
  const msgs = Array.from({ length: 9 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'm' + i }));
  const s = m._composeJuezInput(rail, msgs);
  assert.ok(s.includes('META X') && s.includes('[hecho] a') && s.includes('[pendiente] b'));
  assert.ok(s.includes('m8') && !s.includes('m2'), 'solo los últimos ~6');
});

// ── el tiro automático ──
test('sin objetivo → NO dispara el juez', async () => {
  const m = gw();
  const calls = armar(m, { rail: { nombre: 'R', orden: 'libre', pasos: [] }, verdict: { satisfecho: false, blocker: 'goal_not_met_yet' } });
  await m._evaluarRailAuto({ project_id: 'p', conversation_id: 'c' });
  assert.strictEqual(calls.juez, 0);
});

test('con objetivo → dispara el juez, aplica el veredicto, cuenta 1', async () => {
  const m = gw();
  const calls = armar(m, { rail: { id: 'l1', nombre: 'R', orden: 'libre', objetivo: 'X', pasos: [] }, verdict: { satisfecho: false, blocker: 'needs_user_input', razon: 'r' } });
  await m._evaluarRailAuto({ project_id: 'p', conversation_id: 'c' });
  assert.strictEqual(calls.juez, 1);
  assert.strictEqual(calls.aplicado.length, 1);
  assert.strictEqual(calls.aplicado[0].blocker, 'needs_user_input');
  assert.strictEqual(m._railEvalState.get('c').count, 1);
});

test('objetivo YA satisfecho → NO re-evalúa', async () => {
  const m = gw();
  const calls = armar(m, { rail: { id: 'l1', nombre: 'R', orden: 'libre', objetivo: 'X', pasos: [], ultima_evaluacion: { satisfecho: true } }, verdict: { satisfecho: true, blocker: 'none' } });
  await m._evaluarRailAuto({ project_id: 'p', conversation_id: 'c' });
  assert.strictEqual(calls.juez, 0);
});

test('SAFETY CAP: tras 8 evals no dispara más', async () => {
  const m = gw();
  const calls = armar(m, { rail: { id: 'l1', nombre: 'R', orden: 'libre', objetivo: 'X', pasos: [] }, verdict: { satisfecho: false, blocker: 'goal_not_met_yet' } });
  m._railEvalState.set('c', { count: 8, noProgress: 0, lastBlocker: 'goal_not_met_yet' });
  await m._evaluarRailAuto({ project_id: 'p', conversation_id: 'c' });
  assert.strictEqual(calls.juez, 0);
});

test('NO-PROGRESO: mismo blocker 2 veces seguidas → la 3ª ya no dispara (para tras 2)', async () => {
  const m = gw();
  const calls = armar(m, { rail: { id: 'l1', nombre: 'R', orden: 'libre', objetivo: 'X', pasos: [] }, verdict: { satisfecho: false, blocker: 'goal_not_met_yet' } });
  await m._evaluarRailAuto({ project_id: 'p', conversation_id: 'c' }); // count1, noProgress0 (lastBlocker null→ else)
  await m._evaluarRailAuto({ project_id: 'p', conversation_id: 'c' }); // count2, mismo blocker → noProgress1
  await m._evaluarRailAuto({ project_id: 'p', conversation_id: 'c' }); // count3, mismo → noProgress2
  const antes = calls.juez;
  await m._evaluarRailAuto({ project_id: 'p', conversation_id: 'c' }); // noProgress>=2 → skip
  assert.strictEqual(calls.juez, antes, 'la 4ª no dispara (cap de no-progreso)');
  assert.ok(m._railEvalState.get('c').noProgress >= 2);
});

test('progreso (blocker cambia) → resetea el contador de no-progreso', async () => {
  const m = gw();
  const rail = { id: 'l1', nombre: 'R', orden: 'libre', objetivo: 'X', pasos: [] };
  const calls = { juez: 0, aplicado: [] };
  m._leerRailActivo = async () => rail;
  m._railEvaluar = async (pid, lid, v) => ({ status: 200, data: { satisfecho: v.satisfecho, blocker: v.blocker } });
  let blocker = 'goal_not_met_yet';
  m._selectProvider = async () => ({ provider: { chatCompletion: async () => { calls.juez++; return { content: JSON.stringify({ satisfecho: false, blocker }) }; } } });
  await m._evaluarRailAuto({ project_id: 'p', conversation_id: 'c' });
  await m._evaluarRailAuto({ project_id: 'p', conversation_id: 'c' }); // noProgress1
  blocker = 'needs_user_input';                                       // el blocker CAMBIA → hay progreso
  await m._evaluarRailAuto({ project_id: 'p', conversation_id: 'c' });
  assert.strictEqual(m._railEvalState.get('c').noProgress, 0, 'cambio de blocker resetea no-progreso');
});

test('best-effort: si el juez lanza, no propaga (nunca rompe el turno)', async () => {
  const m = gw();
  m._leerRailActivo = async () => { throw new Error('boom'); };
  await m._evaluarRailAuto({ project_id: 'p', conversation_id: 'c' }); // no debe lanzar
  assert.ok(true);
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`\n[ai-gateway__rail-juez-auto] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`\n[ai-gateway__rail-juez-auto] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}\n    ${e.message}`);
  process.exit(1);
})();

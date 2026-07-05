'use strict';

/**
 * prisma-construccion__semillas — los tres bancos puros del hacer + su encaje con la cúpula.
 *   arquetipos-fabricacion : clasifica el ROL del elemento POR FORMA (universal a barco/coche/…).
 *   etapas-construccion    : la ESPINA (diseño→…→entrega) = plantilla de la cúpula de estados.
 *   organos-fabricacion    : arquetipo → órganos + universales + diff del plan.
 *
 * Ejecutar: node tests/unit/prisma-construccion__semillas.test.js
 */

const assert = require('assert');
const arq = require('../../modules/_shared/arquetipos-fabricacion');
const { OBRA, plantillaEtapas } = require('../../modules/_shared/etapas-construccion');
const org = require('../../modules/_shared/organos-fabricacion');
const EstadosReflejo = require('../../modules/estados');

const tests = [];
const test = (n, f) => tests.push({ n, f });

// ── arquetipos por la FORMA (universal a todo lo construido) ──
test('clasifica por forma: soporta→estructura, cierra/aisla→envolvente, conduce/energiza→sistema, reviste→acabado', () => {
  assert.strictEqual(arq.clasificar({ funcion: 'soporta' }), 'estructura');   // casco, chasis, patas
  assert.strictEqual(arq.clasificar({ funcion: 'cierra' }), 'envolvente');    // carrocería, tablero
  assert.strictEqual(arq.clasificar({ funcion: 'aisla' }), 'envolvente');     // panel de cámara de frío
  assert.strictEqual(arq.clasificar({ funcion: 'conduce' }), 'sistema');      // red / motor
  assert.strictEqual(arq.clasificar({ funcion: 'energiza' }), 'sistema');     // equipo frigorífico
  assert.strictEqual(arq.clasificar({ funcion: 'reviste' }), 'acabado');      // pintura, barniz
});

test('forma desconocida (o une/fija) → union por defecto', () => {
  assert.strictEqual(arq.clasificar({ funcion: 'une' }), 'union');
  assert.strictEqual(arq.clasificar({}), 'union');
});

test('arquetipo custom aprobado tiene prioridad sobre la semilla', () => {
  const extra = [{ id: 'movil', reglas: [{ funcion: 'conduce' }], organos: ['cinematica'] }];
  assert.strictEqual(arq.clasificar({ funcion: 'conduce' }, extra), 'movil'); // pisa a 'sistema'
});

test('los 5 arquetipos semilla existen', () => {
  assert.deepStrictEqual([...arq.SEMILLA_IDS].sort(), ['acabado', 'envolvente', 'estructura', 'sistema', 'union']);
});

// ── etapas = la espina universal (misma para barco/coche/silla/cámara/edificio) ──
test('la OBRA es orden estricto, 5 etapas, con freno en inspección y entrega', () => {
  assert.strictEqual(OBRA.orden, 'estricto');
  assert.strictEqual(OBRA.pasos.length, 5);
  const frenados = OBRA.pasos.filter(p => p.freno).map(p => p.clave);
  assert.deepStrictEqual(frenados, ['inspeccion', 'entrega']);
});

test('plantillaEtapas: default = OBRA universal; dominio con override gana', () => {
  assert.strictEqual(plantillaEtapas('edificacion'), OBRA); // sin override → la espina
  const custom = { nombre: 'Obra naval', orden: 'estricto', pasos: OBRA.pasos.concat([{ clave: 'botadura', texto: 'Botadura' }]) };
  assert.strictEqual(plantillaEtapas('naval', { naval: custom }), custom);
});

// ── órganos: universales + los del arquetipo, y el diff ──
test('organosDe([]) = solo universales; con estructura añade su cálculo/ensayo/inspección', () => {
  assert.deepStrictEqual(org.organosDe([]), ['normativa', 'planificacion', 'presupuesto', 'seguridad']);
  const e = org.organosDe(['estructura']);
  for (const o of ['calculo_estructural', 'ensayo_material', 'inspeccion', 'presupuesto', 'planificacion']) {
    assert.ok(e.includes(o), `falta ${o}`);
  }
});

test('organosDe une los órganos de varios arquetipos presentes (un barco: estructura+envolvente+sistema)', () => {
  const barco = org.organosDe(['estructura', 'envolvente', 'sistema']);
  for (const o of ['calculo_estructural', 'calculo_termico', 'estanqueidad', 'dimensionado', 'prueba_funcional']) {
    assert.ok(barco.includes(o), `falta ${o}`);
  }
});

test('diffPlan: encender lo nuevo, marcar lo sobrante (no lo apaga)', () => {
  const d = org.diffPlan(['presupuesto', 'calculo_estructural'], ['presupuesto']);
  assert.deepStrictEqual(d.encender, ['calculo_estructural']);
  assert.deepStrictEqual(d.innecesarios, []);
});

test('interruptorDe → canal universal organo-<id>', () => {
  assert.strictEqual(org.interruptorDe('calculo_estructural'), 'organo-calculo_estructural');
});

// ── el cierre: las etapas SON una plantilla de la cúpula de estados (el rail vivo) ──
test('estados.crear con las etapas de OBRA → rail estricto que ATASCA en inspección sin ensayo_ok', async () => {
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
  const PID = 'obra-1';
  await r._crear({ project_id: PID, nombre: 'Obra barco', orden: 'estricto', pasos: OBRA.pasos, activar: true });
  // diseño → avanza (sin freno)
  assert.strictEqual((await r._avanzar({ project_id: PID, lista_id: 'obra_barco' })).data.avanzado, true);
  // aprovisionamiento → avanza
  assert.strictEqual((await r._avanzar({ project_id: PID, lista_id: 'obra_barco' })).data.avanzado, true);
  // fabricación → avanza
  assert.strictEqual((await r._avanzar({ project_id: PID, lista_id: 'obra_barco' })).data.avanzado, true);
  // inspección → ATASCA sin ensayo_ok (no entregas sobre una obra sin certificar)
  const insp = await r._avanzar({ project_id: PID, lista_id: 'obra_barco' });
  assert.strictEqual(insp.data.atascado, true);
  assert.deepStrictEqual(insp.data.faltan, ['ensayo_ok']);
  // con el ensayo → avanza a entrega
  const ok = await r._avanzar({ project_id: PID, lista_id: 'obra_barco', entrega: { ensayo_ok: true } });
  assert.strictEqual(ok.data.avanzado, true);
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`\n[prisma-construccion__semillas] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`\n[prisma-construccion__semillas] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}\n    ${e.message}`);
  process.exit(1);
})();

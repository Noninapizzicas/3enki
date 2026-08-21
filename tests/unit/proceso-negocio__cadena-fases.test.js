/**
 * proceso-negocio__cadena-fases — la CADENA del proceso de proyecto.
 * node tests/unit/proceso-negocio__cadena-fases.test.js
 *
 * Lo que estos tests sujetan (bug verificado en vivo, 2026-08-21): cerrar la
 * FASE 2 empujaba 'verificar-en-vivo' (FASE 8) porque el siguiente paso se
 * decidía SIEMPRE por el progreso del plan — y el plan aún no existe en F2.
 * Con todos los faltan_por_* a cero se caía en la última rama, se saltaban
 * F3→F7 enteras y el gate de 'verificado' pasaba con "0 hojas verificadas".
 */
'use strict';
const assert = require('assert');
const ProcesoNegocio = require('../../modules/proceso-negocio');

const tests = [];
const test = (n, f) => tests.push({ n, f });

// Un proyecto simulado en disco: qué ficheros tiene esquemas/ y qué dice el plan.
function modulo({ ficheros = [], plan = '' } = {}) {
  const m = new ProcesoNegocio();
  m.eventBus = { publish: async () => {} };
  m._rpc = async (evt, p) => {
    if (evt === 'fs.list.request' && p.path === 'esquemas') return { files: ficheros };
    if (evt === 'fs.read.request' && p.path === 'esquemas/plan-construccion.md') return { content: plan };
    return {};
  };
  return m;
}

// Entregables de la FASE 2 completos (esquema + dos rondas + disección).
const ESQUEMAS_F2 = ['esquema.md', 'pasada-1-negocio.md', 'pasada-2-produccion.md', 'pasada-3-diseccion.md'];
// Un plano con su espina: una hoja que no existe en disco → queda por construir.
const PLAN = ['# Plan', '```json enki-plan', JSON.stringify({ hojas: [{ slug: 'taller-lamparas-inventado' }] }), '```'].join('\n');

test('FASE 2 cerrada → empuja la FASE 3 (PLASMA), no la FASE 8', async () => {
  const m = modulo({ ficheros: ESQUEMAS_F2 });
  const r = await m._completarFase({ project_id: 'p1', fase: 'esquematizado' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.siguiente, 'planificar-construccion');
  assert.notStrictEqual(r.data.siguiente, 'verificar-en-vivo');
  assert.strictEqual(r.data.fin, false);
});

test('FASE 3 cerrada (diseño OOP, aún sin plan) → sigue el mapa, no el ciclo por pieza', async () => {
  const m = modulo({ ficheros: ['diseno-oop.md'] });
  const r = await m._completarFase({ project_id: 'p2', fase: 'planificado' });
  assert.strictEqual(r.status, 200);
  assert.notStrictEqual(r.data.siguiente, 'verificar-en-vivo');
  assert.ok(/FASE 3b|ADAPTADOR/.test(m.pendientes.get('p2').mensaje), 'el empujón pide la traducción a Enki');
});

test("FASE 3b cerrada ('adaptado') → 200 y encadena (antes: 400 FASE_NO_MAPEADA)", async () => {
  const m = modulo({ ficheros: ['diseno-oop.md', 'plan-construccion.md'], plan: PLAN });
  const r = await m._completarFase({ project_id: 'p3', fase: 'adaptado' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.siguiente, 'construir-modulos');
});

test("FASE 3b sin el plano escrito → 409 (el gate nuevo frena)", async () => {
  const m = modulo({ ficheros: ['diseno-oop.md'] });
  const r = await m._completarFase({ project_id: 'p4', fase: 'adaptado' });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.data.error, 'FASE_INCOMPLETA');
});

test('con plan en disco, el CICLO POR PIEZA cuenta las hojas reales', async () => {
  const m = modulo({ ficheros: ['diseno-oop.md', 'plan-construccion.md'], plan: PLAN });
  const r = await m._completarFase({ project_id: 'p5', fase: 'adaptado' });
  assert.strictEqual(r.status, 200);
  // El plano tiene una hoja que no existe en disco → el ciclo la reclama.
  assert.strictEqual(r.data.progreso.total, 1);
  assert.strictEqual(r.data.progreso.faltan_por_construir, 1);
  assert.strictEqual(r.data.progreso.project_id, 'p5', 'el progreso se identifica (lo usa _verificado)');
});

test('una fase con gate de SISTEMA sigue verificando en disco, no el reporte', async () => {
  const m = modulo({ ficheros: ['plan-construccion.md'], plan: PLAN });
  const r = await m._completarFase({ project_id: 'p5b', fase: 'construido', resumen: { modulos: ['modulo-que-no-existe'] } });
  assert.strictEqual(r.status, 409, 'declarar construido un módulo inexistente no cuela');
});

test("'verificado' sin plan → 409 (antes pasaba con '0 hojas verificadas')", async () => {
  const m = modulo({ ficheros: [] });
  const r = await m._completarFase({ project_id: 'p6', fase: 'verificado' });
  assert.strictEqual(r.status, 409);
  assert.match(r.data.message, /nada que verificar/);
});

test("'completado' sin plan → 409", async () => {
  const m = modulo({ ficheros: [] });
  const r = await m._completarFase({ project_id: 'p7', fase: 'completado' });
  assert.strictEqual(r.status, 409);
  assert.match(r.data.message, /nada que declarar completado/);
});

test('el gate de la FASE 2 sigue frenando el trabajo a medias', async () => {
  const m = modulo({ ficheros: ['esquema.md'] });
  const r = await m._completarFase({ project_id: 'p8', fase: 'esquematizado' });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.data.error, 'FASE_INCOMPLETA');
});

test('la TOOL y el EVENTO dan el mismo resultado (una puerta, un verbo)', async () => {
  const via = f => modulo({ ficheros: ESQUEMAS_F2 })[f];
  const porTool   = await modulo({ ficheros: ESQUEMAS_F2 }).toolCompletarFase({ project_id: 'p9', fase: 'esquematizado' });
  const porEvento = await modulo({ ficheros: ESQUEMAS_F2 })._completarFase({ project_id: 'p9', fase: 'esquematizado' });
  assert.strictEqual(porTool.status, porEvento.status);
  assert.strictEqual(porTool.data.siguiente, porEvento.data.siguiente);
  // Y la tool ya no acepta trabajo inexistente: el gate también la gobierna.
  const toolSinTrabajo = await modulo({ ficheros: [] }).toolCompletarFase({ project_id: 'pA', fase: 'esquematizado' });
  assert.strictEqual(toolSinTrabajo.status, 409);
  assert.ok(typeof via === 'function');
});

test('fase inexistente → 400 FASE_NO_MAPEADA', async () => {
  const m = modulo({ ficheros: [] });
  const r = await m._completarFase({ project_id: 'pB', fase: 'inventada' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.data.error, 'FASE_NO_MAPEADA');
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`[proceso-negocio cadena] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`[proceso-negocio cadena] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}: ${e.message}`);
  process.exit(1);
})();

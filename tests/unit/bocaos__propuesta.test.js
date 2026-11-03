'use strict';

/**
 * bocaos/propuesta — A13 + A14 + A15 + A19 + A33 + M05.
 *
 * Lo que se vigila:
 *   1. se emite con los CUATRO números en el mismo orden y la capa/autor de la política dentro.
 *   2. una viva por pedido (A33): la segunda → 409 YA_HAY_UNA_VIVA.
 *   3. el acuse abre el reloj de DECISIÓN (10 s), distinto del de validez (20 s).
 *   4. el sí es del rider y es único: otro rider → 403; el segundo sí → 409 YA_NO_ESTA sin coste.
 *   5. las dos caducidades son distintas: sin acuse (falló el canal) ≠ sin respuesta (no dijo).
 *   6. una medida sin constar no se emite (no se rellena con 0).
 *
 * Ejecutar: node tests/unit/bocaos__propuesta.test.js
 */

const assert = require('assert');
const Propuesta = require('../../modules/bocaos/propuesta/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevo() {
  const publicados = [];
  const m = new Propuesta();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async () => null;
  return { m, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const PLAZA = 'plaza-malaga';
const POLITICA = {
  capa: 'tienda',
  version: 3,
  autor: 'tienda-paco',
  umbrales: { desvio_m: 800, espera_min: 4, retraso_min: 6, cobra_min_cents: 0 },
  ventana_s: 20
};
const MEDIDAS = { desvio_m: 312, espera_min: 2, retraso_min: 1, cobra_cents: 4 };

function emision(extra = {}) {
  return {
    project_id: PLAZA,
    plaza_id: PLAZA,
    pedido_id: 'ped-1',
    rider_id: 'rid-1',
    medidas: MEDIDAS,
    huella: 'huella-abc',
    politica: POLITICA,
    ...extra
  };
}

test('emitir: cuatro números, la vista y la capa de la política', async () => {
  const { m, eventos } = nuevo();
  const r = await m.onEmitirRequest({ request_id: 'p1', data: emision({ ahora: '2026-11-03T21:00:00.000Z' }) });

  assert.strictEqual(r.status, 201);
  const p = r.data.propuesta;
  assert.deepStrictEqual(Object.keys(p.medidas), ['desvio_m', 'espera_min', 'retraso_min', 'cobra_cents'], 'siempre el mismo orden');
  assert.strictEqual(p.expira_en, '2026-11-03T21:00:20.000Z', '20 s de la política (J02)');
  assert.strictEqual(p.politica.capa, 'tienda');
  assert.strictEqual(p.politica.version, 3);

  const hechos = eventos('bocaos.propuesta_emitida');
  assert.strictEqual(hechos.length, 1);
  assert.strictEqual(hechos[0].p.medidas.desvio_m, 312);
  assert.strictEqual(hechos[0].p.vista.umbrales.desvio_m, 800);
  assert.ok(/pasas a 312 m/.test(hechos[0].p.vista.frase));
  assert.ok(/versión 3/.test(hechos[0].p.vista.frase_umbrales));
});

test('A33: una propuesta viva por pedido', async () => {
  const { m, eventos } = nuevo();
  await m.onEmitirRequest({ request_id: 'p2', data: emision({ ahora: '2026-11-03T21:00:00.000Z' }) });
  const r = await m.onEmitirRequest({ request_id: 'p3', data: emision({ rider_id: 'rid-2', ahora: '2026-11-03T21:00:05.000Z' }) });

  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'YA_HAY_UNA_VIVA');
  assert.strictEqual(eventos('bocaos.propuesta_emitida').length, 1, 'no hay sorteo');
});

test('A15: el acuse abre el reloj de decisión (10 s), no el de validez', async () => {
  const { m, eventos } = nuevo();
  const e = await m.onEmitirRequest({ request_id: 'p4', data: emision({ ahora: '2026-11-03T21:00:00.000Z' }) });
  const id = e.data.propuesta.propuesta_id;

  const r = await m.onAcuseRequest({ request_id: 'p5', data: { project_id: PLAZA, propuesta_id: id, rider_id: 'rid-1', hora: '2026-11-03T21:00:04.000Z' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.propuesta.estado, 'ACUSADA');
  assert.strictEqual(r.data.propuesta.decision_expira_en, '2026-11-03T21:00:14.000Z');
  assert.strictEqual(eventos('bocaos.propuesta_acusada').length, 1);
});

test('A19/A14: el sí es del rider y es único; el segundo no cuesta nada', async () => {
  const { m, eventos } = nuevo();
  const e = await m.onEmitirRequest({ data: emision({ ahora: '2026-11-03T21:00:00.000Z' }) });
  const id = e.data.propuesta.propuesta_id;

  const otro = await m.onAceptarRequest({ request_id: 'p6', data: { project_id: PLAZA, propuesta_id: id, rider_id: 'rid-9' } });
  assert.strictEqual(otro.status, 403);

  const si = await m.onAceptarRequest({ request_id: 'p7', data: { project_id: PLAZA, propuesta_id: id, rider_id: 'rid-1', hora: '2026-11-03T21:00:08.000Z' } });
  assert.strictEqual(si.status, 200);
  assert.strictEqual(si.data.propuesta.estado, 'ACEPTADA');
  assert.strictEqual(si.data.propuesta.hora_aceptacion, '2026-11-03T21:00:08.000Z');

  const aceptadas = eventos('bocaos.propuesta_aceptada');
  assert.strictEqual(aceptadas.length, 1);
  assert.strictEqual(aceptadas[0].p.hora_aceptacion, '2026-11-03T21:00:08.000Z');

  const segundo = await m.onAceptarRequest({ request_id: 'p8', data: { project_id: PLAZA, propuesta_id: id, rider_id: 'rid-1', hora: '2026-11-03T21:00:09.000Z' } });
  assert.strictEqual(segundo.status, 409);
  assert.strictEqual(segundo.error.code, 'YA_NO_ESTA');
  assert.strictEqual(eventos('bocaos.propuesta_aceptada').length, 1);
});

test('A15: caducada SIN ACUSE (falló el canal) ≠ SIN RESPUESTA (no dijo)', async () => {
  const { m, eventos } = nuevo();

  // sin acuse
  const e1 = await m.onEmitirRequest({ data: emision({ ahora: '2026-11-03T21:00:00.000Z' }) });
  const temprano = await m.onCerrarRequest({ request_id: 'p9', data: { project_id: PLAZA, propuesta_id: e1.data.propuesta.propuesta_id, ahora: '2026-11-03T21:00:10.000Z' } });
  assert.strictEqual(temprano.status, 409);
  assert.strictEqual(temprano.error.code, 'AUN_VIVA', 'no se cierra antes de tiempo');

  const c1 = await m.onCerrarRequest({ request_id: 'p10', data: { project_id: PLAZA, propuesta_id: e1.data.propuesta.propuesta_id, ahora: '2026-11-03T21:00:21.000Z' } });
  assert.strictEqual(c1.status, 200);
  assert.strictEqual(c1.data.propuesta.desenlace, 'CADUCADA_SIN_ACUSE');
  assert.strictEqual(eventos('bocaos.propuesta_caducada_sin_acuse').length, 1);

  // con acuse, sin decisión
  const e2 = await m.onEmitirRequest({ data: emision({ pedido_id: 'ped-2', ahora: '2026-11-03T21:01:00.000Z' }) });
  await m.onAcuseRequest({ data: { project_id: PLAZA, propuesta_id: e2.data.propuesta.propuesta_id, rider_id: 'rid-1', hora: '2026-11-03T21:01:02.000Z' } });
  const c2 = await m.onCerrarRequest({ request_id: 'p11', data: { project_id: PLAZA, propuesta_id: e2.data.propuesta.propuesta_id, ahora: '2026-11-03T21:01:21.000Z' } });
  assert.strictEqual(c2.data.propuesta.desenlace, 'CADUCADA_SIN_RESPUESTA');
  assert.strictEqual(eventos('bocaos.propuesta_caducada_sin_respuesta').length, 1);
  assert.strictEqual(eventos('bocaos.propuesta_caducada_sin_acuse').length, 1, 'siguen siendo dos cosas distintas');
});

test('una medida sin constar no se emite: no se rellena con 0', async () => {
  const { m, eventos } = nuevo();
  const r = await m.onEmitirRequest({ request_id: 'p12', data: emision({ medidas: { desvio_m: 312, espera_min: 2, retraso_min: 1, cobra_cents: null } }) });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'MEDIDA_SIN_CONSTAR');
  assert.strictEqual(eventos('bocaos.propuesta_emitida').length, 0);
});

test('sin política no hay propuesta: la explicación necesita capa y autor', async () => {
  const { m } = nuevo();
  const r = await m.onEmitirRequest({ request_id: 'p13', data: emision({ politica: null }) });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'POLITICA_SIN_CONSTAR');
});

test('de: la viva por pedido | NO_HAY cuando ya tiene desenlace', async () => {
  const { m } = nuevo();
  const e = await m.onEmitirRequest({ data: emision({ ahora: '2026-11-03T21:00:00.000Z' }) });
  const id = e.data.propuesta.propuesta_id;

  const viva = await m.onDeRequest({ data: { project_id: PLAZA, pedido_id: 'ped-1' } });
  assert.strictEqual(viva.status, 200);
  assert.strictEqual(viva.data.propuesta.propuesta_id, id);

  await m.onRechazarRequest({ data: { project_id: PLAZA, propuesta_id: id, rider_id: 'rid-1', motivo: 'lejos' } });
  const despues = await m.onDeRequest({ data: { project_id: PLAZA, pedido_id: 'ped-1' } });
  assert.strictEqual(despues.status, 404);
  assert.strictEqual(despues.error.code, 'NO_HAY');
});

(async () => {
  let fallos = 0;
  for (const t of tests) {
    try { await t.fn(); console.log(`ok — ${t.name}`); }
    catch (err) { fallos += 1; console.error(`FALLO — ${t.name}\n  ${err.message}`); }
  }
  console.log(`\n${tests.length - fallos}/${tests.length} tests ok`);
  if (fallos > 0) process.exitCode = 1;
})();

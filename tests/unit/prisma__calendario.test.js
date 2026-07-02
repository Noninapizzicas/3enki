/**
 * Tests de prisma/calendario — la base compartida del tiempo. El motor (ventanas,
 * huecos, capacidad, guardas de reserva) es determinista y se prueba sin bus.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const PrismaCalendarioReflejo = require('../../modules/prisma/calendario/index.js');

// horario abierto todos los días 09:00–11:00 (para no depender del día de la semana).
const HOR_0911 = { L: [['09:00', '11:00']], M: [['09:00', '11:00']], X: [['09:00', '11:00']], J: [['09:00', '11:00']], V: [['09:00', '11:00']], S: [['09:00', '11:00']], D: [['09:00', '11:00']] };
const DIA = '2026-07-06';
const desde = `${DIA}T00:00`, hasta = `${DIA}T23:59`;

function conSilla(capacidad = 2) {
  const C = new PrismaCalendarioReflejo();
  C._setDisp({ project_id: 'p', recurso_tipos: [{ id: 'silla', capacidad }], horario: HOR_0911 });
  return C;
}

test('huecos: trocea la ventana por duración y muestra capacidad libre', () => {
  const C = conSilla(2);
  const r = C._huecosOp({ project_id: 'p', recurso_tipo: 'silla', desde, hasta, duracion_min: 60 });
  assert.equal(r.data.huecos.length, 2);                 // 09–10 y 10–11
  assert.equal(r.data.huecos[0].inicio, `${DIA}T09:00`);
  assert.equal(r.data.huecos[0].libres, 2);
});

test('una reserva ocupa UNA unidad de capacidad; el resto del hueco sigue libre', () => {
  const C = conSilla(2);
  const res = C._reservar({ project_id: 'p', recurso_tipo: 'silla', inicio: `${DIA}T09:00`, fin: `${DIA}T10:00` });
  assert.equal(res.status, 201);
  const h = C._huecosOp({ project_id: 'p', recurso_tipo: 'silla', desde, hasta, duracion_min: 60 });
  const nueve = h.data.huecos.find(x => x.inicio === `${DIA}T09:00`);
  assert.equal(nueve.libres, 1);                         // capacidad 2 − 1 reserva
});

test('capacidad agotada → 409 SIN_HUECO', () => {
  const C = conSilla(1);
  C._reservar({ project_id: 'p', recurso_tipo: 'silla', inicio: `${DIA}T09:00`, fin: `${DIA}T10:00` });
  const dup = C._reservar({ project_id: 'p', recurso_tipo: 'silla', inicio: `${DIA}T09:00`, fin: `${DIA}T10:00` });
  assert.equal(dup.status, 409);
  assert.equal(dup.error.code, 'SIN_HUECO');
});

test('cita fuera de horario → 412 FUERA_DE_HORARIO', () => {
  const C = conSilla(2);
  const r = C._reservar({ project_id: 'p', recurso_tipo: 'silla', inicio: `${DIA}T12:00`, fin: `${DIA}T13:00` });
  assert.equal(r.status, 412);
  assert.equal(r.error.code, 'FUERA_DE_HORARIO');
});

test('recurso desconocido → 404 RECURSO_DESCONOCIDO', () => {
  const C = conSilla(2);
  const r = C._reservar({ project_id: 'p', recurso_tipo: 'box', inicio: `${DIA}T09:00`, fin: `${DIA}T10:00` });
  assert.equal(r.status, 404);
  assert.equal(r.error.code, 'RECURSO_DESCONOCIDO');
});

test('bloquear un día → ese día sin huecos', () => {
  const C = conSilla(2);
  C._bloquearDia({ project_id: 'p', fecha: DIA, motivo: 'festivo' });
  const r = C._huecosOp({ project_id: 'p', recurso_tipo: 'silla', desde, hasta, duracion_min: 60 });
  assert.equal(r.data.huecos.length, 0);
});

test('alquiler (intervalo): fin abierto ocupa; devolver lo libera', () => {
  const C = new PrismaCalendarioReflejo();
  C._setDisp({ project_id: 'p', recurso_tipos: [{ id: 'maquina', capacidad: 1 }], horario: HOR_0911 });
  const a = C._reservar({ project_id: 'p', recurso_tipo: 'maquina', inicio: DIA, grano: 'intervalo' });   // sin horario ni fin
  assert.equal(a.status, 201);
  assert.equal(a.data.fin, null);
  const b = C._reservar({ project_id: 'p', recurso_tipo: 'maquina', inicio: DIA, grano: 'intervalo' });
  assert.equal(b.status, 409);                            // única unidad ocupada
  const dev = C._devolver({ project_id: 'p', reserva_id: a.data.id, fin: '2026-07-08' });
  assert.equal(dev.data.estado, 'devuelta');
  const c = C._reservar({ project_id: 'p', recurso_tipo: 'maquina', inicio: '2026-07-09', grano: 'intervalo' });
  assert.equal(c.status, 201);                            // liberada
});

test('cancelar libera el hueco', () => {
  const C = conSilla(1);
  const res = C._reservar({ project_id: 'p', recurso_tipo: 'silla', inicio: `${DIA}T09:00`, fin: `${DIA}T10:00` });
  C._cancelar({ project_id: 'p', reserva_id: res.data.id });
  const otra = C._reservar({ project_id: 'p', recurso_tipo: 'silla', inicio: `${DIA}T09:00`, fin: `${DIA}T10:00` });
  assert.equal(otra.status, 201);
});

test('persistencia: snapshot/hidratar restaura disponibilidad + reservas', () => {
  const A = conSilla(2);
  A._reservar({ project_id: 'p', recurso_tipo: 'silla', inicio: `${DIA}T09:00`, fin: `${DIA}T10:00` });
  const snap = A._persist._snapshot('p');
  assert.equal(snap.reservas.length, 1);
  const B = new PrismaCalendarioReflejo();
  B._persist._hidratar('p', snap);
  assert.equal(B._getDisp({ project_id: 'p' }).data.recurso_tipos[0].capacidad, 2);
  assert.equal(B._listReservas({ project_id: 'p' }).data.total, 1);
  A._persist.detener(); B._persist.detener();
});

test('feed .ics: una reserva → un VEVENT con sus horas; cancelada lleva STATUS:CANCELLED', () => {
  const C = conSilla(2);
  const a = C._reservar({ project_id: 'p', recurso_tipo: 'silla', inicio: `${DIA}T09:00`, fin: `${DIA}T10:00`, cliente: 'Ana' });
  C._reservar({ project_id: 'p', recurso_tipo: 'silla', inicio: `${DIA}T10:00`, fin: `${DIA}T11:00`, cliente: 'Leo' });
  C._cancelar({ project_id: 'p', reserva_id: a.data.id });
  const r = C._feedIcs({ project_id: 'p', _now: '2026-07-01T00:00:00.000Z' });
  assert.equal(r.status, 200);
  assert.ok(r.data.content_type.startsWith('text/calendar'));
  assert.equal((r.data.ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.ok(r.data.ics.includes('DTSTART:20260706T100000'));   // la cita de Leo
  assert.ok(r.data.ics.includes('STATUS:CANCELLED'));          // la de Ana, cancelada
  assert.ok(r.data.ics.includes('SUMMARY:silla · Leo'));   // etiqueta cae al id si no se da
});

test('feed .ics: alquiler por días (fecha sin hora) → evento de día completo', () => {
  const C = new PrismaCalendarioReflejo();
  C._setDisp({ project_id: 'p', recurso_tipos: [{ id: 'maquina', etiqueta: 'Máquina', capacidad: 1 }], horario: HOR_0911 });
  C._reservar({ project_id: 'p', recurso_tipo: 'maquina', inicio: DIA, grano: 'intervalo' });
  const r = C._feedIcs({ project_id: 'p', _now: '2026-07-01T00:00:00.000Z' });
  assert.ok(r.data.ics.includes('DTSTART;VALUE=DATE:20260706'));
});

test('feed_url provisiona un token secreto; la disponibilidad NO lo filtra', () => {
  const C = conSilla(1);
  const u = C._feedUrl({ project_id: 'p' });
  assert.equal(u.status, 200);
  assert.ok(u.data.token && u.data.token.length >= 16);
  assert.ok(u.data.path.includes(`token=${u.data.token}`));
  const disp = C._getDisp({ project_id: 'p' });
  assert.equal(disp.data.feed_token, undefined);            // el secreto no viaja en la lectura
});

test('GET del feed: sin token 401 · token malo 401 · token bueno 200 text/calendar · sin provisionar 404', async () => {
  const C = conSilla(1);
  C._reservar({ project_id: 'p', recurso_tipo: 'silla', inicio: `${DIA}T09:00`, fin: `${DIA}T10:00`, cliente: 'Ana' });
  const { token } = C._feedUrl({ project_id: 'p' }).data;

  const sin = await C.handleFeedIcs({ params: { project: 'p' }, query: {} }, null);
  assert.equal(sin.status, 401);
  const malo = await C.handleFeedIcs({ params: { project: 'p' }, query: { token: 'nope' } }, null);
  assert.equal(malo.status, 401);
  const bien = await C.handleFeedIcs({ params: { project: 'p' }, query: { token } }, null);
  assert.equal(bien.status, 200);
  assert.ok(bien._contentType.startsWith('text/calendar'));
  assert.ok(bien._raw.includes('BEGIN:VCALENDAR'));
  const noProv = await C.handleFeedIcs({ params: { project: 'q' }, query: { token: 'x' } }, null);
  assert.equal(noProv.status, 404);                         // proyecto sin feed provisionado
});

console.log('prisma__calendario: asserts definidos');

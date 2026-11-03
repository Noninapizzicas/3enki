'use strict';

/**
 * bocaos/contrato-puntual — A24 (el contrato nace de la aceptación, no de una asignación).
 *
 * Lo que se vigila:
 *   1. la aceptación libre CREA el contrato y el hecho sale con su precio (E03, el ya compuesto).
 *   2. crear sin aceptación → 409 SIN_ACEPTACION: no hay camino de pedido a rider sin el sí (A27).
 *   3. turno / jornada / duración → 422: sería otro negocio.
 *   4. se cierra con el HECHO de entrega, no con un reloj; y cerrar dos veces no duplica el hecho.
 *
 * Ejecutar: node tests/unit/bocaos__contrato-puntual.test.js
 */

const assert = require('assert');
const ContratoPuntual = require('../../modules/bocaos/contrato-puntual/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevo() {
  const publicados = [];
  const m = new ContratoPuntual();
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
const ACEPTADA = {
  project_id: PLAZA,
  plaza_id: PLAZA,
  pedido_id: 'ped-1',
  propuesta_id: 'prop-1',
  rider_id: 'rid-1',
  hora_aceptacion: '2026-11-03T21:01:00.000Z',
  medidas: { desvio_m: 312, espera_min: 2, retraso_min: 1, cobra_cents: 4 }
};

test('la aceptación libre crea el contrato y el hecho sale con su precio', async () => {
  const { m, eventos } = nuevo();
  const r = await m.onPropuestaAceptada({ data: ACEPTADA });

  assert.strictEqual(r.status, 201);
  const c = r.data.contrato;
  assert.ok(/^ct-/.test(c.contrato_id));
  assert.strictEqual(c.rider_id, 'rid-1');
  assert.strictEqual(c.hora_aceptacion, '2026-11-03T21:01:00.000Z');
  assert.strictEqual(c.precio_cents, 4, 'lee el número YA compuesto, no lo recalcula');

  const hechos = eventos('bocaos.contrato_creado');
  assert.strictEqual(hechos.length, 1);
  assert.strictEqual(hechos[0].p.contrato_id, c.contrato_id);
  assert.strictEqual(hechos[0].p.pedido_id, 'ped-1');
  assert.strictEqual(hechos[0].p.hora_aceptacion, '2026-11-03T21:01:00.000Z');
});

test('crear sin aceptación → 409 SIN_ACEPTACION (la asignación no existe)', async () => {
  const { m, eventos } = nuevo();
  const r = await m.onCrearRequest({ request_id: 'c1', data: { project_id: PLAZA, pedido_id: 'ped-9', rider_id: 'rid-1' } });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'SIN_ACEPTACION');
  assert.strictEqual(eventos('bocaos.contrato_creado').length, 0);
});

test('turno, jornada o duración → 422: es otro negocio', async () => {
  const { m } = nuevo();
  await m.onPropuestaAceptada({ data: { ...ACEPTADA, pedido_id: 'ped-2' } });
  // el contrato ya existe: se prueba la guarda en otro pedido con aceptación
  await m.onPropuestaAceptada({ data: { ...ACEPTADA, pedido_id: 'ped-3' } });
  const r = await m.onCrearRequest({ request_id: 'c2', data: { project_id: PLAZA, pedido_id: 'ped-3', turno: 'tarde' } });
  assert.strictEqual(r.status, 422);
  assert.strictEqual(r.error.code, 'CONTRATO_CON_DURACION');
});

test('se cierra con el hecho de entrega y no se publica dos veces', async () => {
  const { m, eventos } = nuevo();
  await m.onPropuestaAceptada({ data: ACEPTADA });

  await m.onHechoRepartoAnotado({ data: { project_id: PLAZA, pedido_id: 'ped-1', tipo: 'recogida', hora: '2026-11-03T21:12:00.000Z' } });
  assert.strictEqual(eventos('bocaos.contrato_cerrado').length, 0, 'recoger no cierra el contrato');

  await m.onHechoRepartoAnotado({ data: { project_id: PLAZA, pedido_id: 'ped-1', tipo: 'entrega', hora: '2026-11-03T21:27:00.000Z' } });
  const cerrados = eventos('bocaos.contrato_cerrado');
  assert.strictEqual(cerrados.length, 1);
  assert.strictEqual(cerrados[0].p.hora_cierre, '2026-11-03T21:27:00.000Z');
  assert.strictEqual(cerrados[0].p.motivo, 'hecho de entrega');

  await m.onHechoRepartoAnotado({ data: { project_id: PLAZA, pedido_id: 'ped-1', tipo: 'entrega', hora: '2026-11-03T21:28:00.000Z' } });
  assert.strictEqual(eventos('bocaos.contrato_cerrado').length, 1, 'idempotente');
});

test('de: el contrato de un pedido | NO_CONSTA', async () => {
  const { m } = nuevo();
  await m.onPropuestaAceptada({ data: ACEPTADA });
  const ok = await m.onDeRequest({ request_id: 'c3', data: { project_id: PLAZA, pedido_id: 'ped-1' } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.data.contrato.pedido_id, 'ped-1');

  const no = await m.onDeRequest({ request_id: 'c4', data: { project_id: PLAZA, pedido_id: 'ped-x' } });
  assert.strictEqual(no.status, 404);
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

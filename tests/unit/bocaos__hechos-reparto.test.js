'use strict';

/**
 * bocaos/hechos-reparto — F01 + F02 + F03 (los hechos, la prueba y el acta).
 *
 * Lo que se vigila:
 *   1. sin hora no hay hecho: 400 HORA_REQUERIDA (no es un hecho, es una impresión).
 *   2. el acta NO se inventa: sin entrega y sin prueba devuelve INCOMPLETA con lo que falta, y
 *      publica `acta_incompleta` (lo que impide adjudicar después).
 *   3. la FALTA de prueba se declara con motivo — y es un hecho distinto de no tener nada.
 *   4. completa: relojes con espera real (listo → recogida) y reparto (recogida → entrega).
 *   5. el reparto se abre con el contrato (A24) y el aviso repetido NO lo duplica.
 *
 * Ejecutar: node tests/unit/bocaos__hechos-reparto.test.js
 */

const assert = require('assert');
const HechosReparto = require('../../modules/bocaos/hechos-reparto/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevo() {
  const publicados = [];
  const m = new HechosReparto();
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

async function repartoAbierto() {
  const ctx = nuevo();
  await ctx.m.onContratoCreado({ data: { project_id: PLAZA, pedido_id: 'ped-1', plaza_id: PLAZA, contrato_id: 'ct-1', rider_id: 'rid-1', hora_contrato: '2026-11-03T21:01:00.000Z', hora_aceptacion: '2026-11-03T21:01:00.000Z' } });
  await ctx.m.onPedidoListo({ data: { project_id: PLAZA, pedido_id: 'ped-1', plaza_id: PLAZA, hora_listo: '2026-11-03T21:10:00.000Z' } });
  return ctx;
}

test('sin hora no hay hecho: 400 HORA_REQUERIDA', async () => {
  const { m, eventos } = await repartoAbierto();
  const r = await m.onAnotarRequest({ request_id: 'r1', data: { project_id: PLAZA, pedido_id: 'ped-1', tipo: 'recogida' } });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'HORA_REQUERIDA');
  assert.strictEqual(eventos('bocaos.hecho_reparto_anotado').length, 0);
});

test('el tipo es una lista cerrada', async () => {
  const { m } = await repartoAbierto();
  const r = await m.onAnotarRequest({ request_id: 'r2', data: { project_id: PLAZA, pedido_id: 'ped-1', tipo: 'vuelta', hora: '2026-11-03T21:12:00.000Z' } });
  assert.strictEqual(r.status, 400);
});

test('el acta sin entrega ni prueba devuelve INCOMPLETA con el nombre del que falta', async () => {
  const { m, eventos } = await repartoAbierto();
  await m.onAnotarRequest({ data: { project_id: PLAZA, pedido_id: 'ped-1', tipo: 'recogida', hora: '2026-11-03T21:12:00.000Z', autor: 'rid-1' } });

  const r = await m.onActaRequest({ request_id: 'r3', data: { project_id: PLAZA, pedido_id: 'ped-1' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.completa, false);
  assert.deepStrictEqual(r.data.faltan, ['entrega', 'prueba o su falta declarada']);

  const incompletas = eventos('bocaos.acta_incompleta');
  assert.strictEqual(incompletas.length, 1);
  assert.deepStrictEqual(incompletas[0].p.faltan, ['entrega', 'prueba o su falta declarada']);
});

test('la falta de prueba se DECLARA con motivo; sin motivo no es un hecho', async () => {
  const { m, eventos } = await repartoAbierto();

  const sinMotivo = await m.onPruebaRequest({ request_id: 'r4', data: { project_id: PLAZA, pedido_id: 'ped-1', falta: true } });
  assert.strictEqual(sinMotivo.status, 400);

  const pruebaVacia = await m.onPruebaRequest({ request_id: 'r5', data: { project_id: PLAZA, pedido_id: 'ped-1', tipo: 'foto' } });
  assert.strictEqual(pruebaVacia.status, 400, 'una prueba sin valor no prueba nada');

  const falta = await m.onPruebaRequest({ request_id: 'r6', data: { project_id: PLAZA, pedido_id: 'ped-1', falta: true, motivo: 'el cliente no abrió', autor: 'rid-1' } });
  assert.strictEqual(falta.status, 201);
  assert.strictEqual(falta.data.prueba.falta, true);

  const anotadas = eventos('bocaos.prueba_anotada');
  assert.strictEqual(anotadas.length, 1);
  assert.strictEqual(anotadas[0].p.prueba.motivo, 'el cliente no abrió');
});

test('acta completa: relojes con espera real y tiempo de reparto', async () => {
  const { m } = await repartoAbierto();
  await m.onAnotarRequest({ data: { project_id: PLAZA, pedido_id: 'ped-1', tipo: 'recogida', hora: '2026-11-03T21:12:00.000Z', autor: 'rid-1' } });
  await m.onAnotarRequest({ data: { project_id: PLAZA, pedido_id: 'ped-1', tipo: 'entrega', hora: '2026-11-03T21:27:00.000Z', autor: 'rid-1' } });
  await m.onPruebaRequest({ data: { project_id: PLAZA, pedido_id: 'ped-1', tipo: 'codigo', valor: '4821', autor: 'rid-1' } });

  const r = await m.onActaRequest({ request_id: 'r7', data: { project_id: PLAZA, pedido_id: 'ped-1' } });
  assert.strictEqual(r.data.completa, true);
  const relojes = r.data.acta.relojes;
  assert.strictEqual(relojes.aceptacion, '2026-11-03T21:01:00.000Z');
  assert.strictEqual(relojes.listo, '2026-11-03T21:10:00.000Z');
  assert.strictEqual(relojes.espera_min, 2, 'listo 21:10 → recogida 21:12');
  assert.strictEqual(relojes.reparto_min, 15);
  assert.strictEqual(relojes.total_min, 26);
  assert.strictEqual(r.data.acta.prueba.tipo, 'codigo');
});

test('el contrato NO duplica el reparto: un pedido, un reparto (idempotente)', async () => {
  const { m, eventos } = await repartoAbierto();
  await m.onContratoCreado({ data: { project_id: PLAZA, pedido_id: 'ped-1', plaza_id: PLAZA, contrato_id: 'ct-1', rider_id: 'rid-1', hora_contrato: '2026-11-03T21:01:00.000Z' } });

  await m.onAnotarRequest({ data: { project_id: PLAZA, pedido_id: 'ped-1', tipo: 'recogida', hora: '2026-11-03T21:12:00.000Z', autor: 'rid-1' } });
  const r = await m.onActaRequest({ data: { project_id: PLAZA, pedido_id: 'ped-1' } });

  assert.strictEqual(r.data.contrato_id, 'ct-1', 'el contrato completa el reparto');
  assert.strictEqual(r.data.hechos, 1, 'un solo reparto, un solo hecho');
  assert.strictEqual(eventos('bocaos.hecho_reparto_anotado').length, 1);
});

test('acta de un pedido sin reparto abierto → 404 NO_CONSTA', async () => {
  const { m } = nuevo();
  const r = await m.onActaRequest({ request_id: 'r8', data: { project_id: PLAZA, pedido_id: 'ped-9' } });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.code, 'NO_CONSTA');
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

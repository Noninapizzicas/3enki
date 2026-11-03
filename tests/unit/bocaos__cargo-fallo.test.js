'use strict';

/**
 * bocaos/cargo-fallo — G04.
 *
 * Lo que se vigila:
 *   1. SIN EVIDENCIA NO HAY CARGO: no nace deuda y se publica `cargo_sin_evidencia` con el motivo.
 *   2. SIN IMPORTE TAMBIÉN ES UNA DEUDA: `importe_centimos: null`, `importe_estado: NO_CONSTA` (Q28).
 *   3. NO SE DESCUENTA: la deuda no se compensa con un devengo (H06). Intentarlo es 409.
 *   4. Una deuda por (pedido, fila): el mismo fallo medido dos veces no debe dos veces.
 *   5. Anular exige autor y motivo; un cargo cobrado no se anula (se abre otro documento).
 *   6. El estado del cargo viaja en `bocaos.cargo_anotado` (anotado/anulado) y `disputa-fallo` y
 *      `liquidacion` lo ven.
 *
 * Ejecutar: node tests/unit/bocaos__cargo-fallo.test.js
 */

const assert = require('assert');
const CargoFallo = require('../../modules/bocaos/cargo-fallo/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const PEDIDO = 'ped-1';
const TIENDA = 'tienda-paco';
const RIDER = 'rd-1';

const EVIDENCIA = [
  { hecho: 'contrato', campo: 'hora_prometida', hora: '2026-11-03T14:00:00.000Z' },
  { hecho: 'acta', campo: 'relojes.listo', hora: '2026-11-03T14:20:00.000Z' }
];

function fallo(extra = {}) {
  return {
    pedido_id: PEDIDO,
    plaza_id: PLAZA,
    tienda_id: TIENDA,
    contrato_id: 'ct-1',
    rider_id: RIDER,
    traza_estado: 'CONFORME',
    evidencia: EVIDENCIA,
    filas: [{
      pedido_id: PEDIDO, plaza_id: PLAZA, contrato_id: 'ct-1',
      fila: 'n1_tienda', excedido: true, min: 20, limite_min: 8,
      deudor: { rol: 'tienda', parte_id: TIENDA },
      acreedor: { rol: 'rider', parte_id: RIDER },
      importe_centimos: null, importe_estado: 'NO_CONSTA',
      regla: 'G01 · N1 excedida'
    }],
    ...extra
  };
}

function nuevo() {
  const publicados = [];
  const m = new CargoFallo();
  m.name = 'cargo-fallo';
  m.plaza_id = PLAZA;
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async () => null;   // el store va por evento fs; aquí no hace falta
  return { m, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const anotar = (m, extra = {}) => m.onFalloMedido({ data: { project_id: PLAZA, ...fallo(extra) } });
const de = (m, extra = {}) => m.onDeRequest({ request_id: 'd', data: { project_id: PLAZA, ...extra } });
const anular = (m, extra = {}) => m.onAnularRequest({ request_id: 'a', data: { project_id: PLAZA, ...extra } });

test('con evidencia, la deuda nace entre dos partes con nombre', async () => {
  const { m, eventos } = nuevo();
  await anotar(m);

  const hechos = eventos('bocaos.cargo_anotado');
  assert.strictEqual(hechos.length, 1);
  const p = hechos[0].p;
  assert.ok(p.cargo_id.startsWith('cg-'));
  assert.deepStrictEqual(p.deudor, { rol: 'tienda', parte_id: TIENDA });
  assert.deepStrictEqual(p.acreedor, { rol: 'rider', parte_id: RIDER });
  assert.strictEqual(p.estado, 'ANOTADO');
  assert.strictEqual(p.transicion, 'anotado');
  assert.strictEqual(p.evidencia.length, 2, 'la evidencia viaja con el cargo');
  assert.strictEqual(p.minutos, 20);
});

test('sin importe también es una deuda: nace en NO_CONSTA, no en 0', async () => {
  const { m, eventos } = nuevo();
  await anotar(m);
  const p = eventos('bocaos.cargo_anotado')[0].p;
  assert.strictEqual(p.importe_centimos, null);
  assert.strictEqual(p.importe_estado, 'NO_CONSTA');

  const saldo = (await de(m, { pedido_id: PEDIDO })).data.saldo;
  assert.strictEqual(saldo.total_centimos, null);
  assert.strictEqual(saldo.total_estado, 'NO_CONSTA');
  assert.strictEqual(saldo.vivos, 1);
});

test('la deuda no se descuenta: ni retención ni compensación (H06)', async () => {
  const { m, eventos } = nuevo();
  await anotar(m);
  const p = eventos('bocaos.cargo_anotado')[0].p;
  assert.strictEqual(p.cobrado, false);
  assert.strictEqual(p.descontado, false);
  assert.strictEqual(p.retenido, false);

  const cargo_id = p.cargo_id;
  const r = await anular(m, { cargo_id, autor: 'sala', motivo: 'compensar', descontar: true });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'NO_DESCUENTO');
  assert.strictEqual((await de(m, { cargo_id })).data.cargo.estado, 'ANOTADO', 'sigue viva');
});

test('sin evidencia NO nace el cargo — y el intento se publica', async () => {
  const { m, eventos } = nuevo();
  await anotar(m, { evidencia: [] });
  assert.strictEqual(eventos('bocaos.cargo_anotado').length, 0, 'sin evidencia no hay deuda');
  const sin = eventos('bocaos.cargo_sin_evidencia');
  assert.strictEqual(sin.length, 1);
  assert.strictEqual(sin[0].p.deuda, false);
  assert.ok(sin[0].p.motivo.includes('sin evidencia'));
});

test('una traza en FALLA tampoco sostiene el cargo (G06)', async () => {
  const { m, eventos } = nuevo();
  await anotar(m, { traza_estado: 'FALLA' });
  assert.strictEqual(eventos('bocaos.cargo_anotado').length, 0);
  assert.ok(eventos('bocaos.cargo_sin_evidencia')[0].p.motivo.includes('FALLA'));
});

test('una fila sin dos partes no crea deuda: no es un cargo, es una no-adjudicación', async () => {
  const { m, eventos } = nuevo();
  await anotar(m, { filas: [{ fila: 'n3_entrega', excedido: true, min: 30, deudor: null, acreedor: null }] });
  assert.strictEqual(eventos('bocaos.cargo_anotado').length, 0);
  assert.strictEqual(eventos('bocaos.cargo_sin_evidencia').length, 0, 'no es un intento fallido: no hay cargo que intentar');
});

test('una deuda por pedido y fila: el mismo fallo medido dos veces no debe dos veces', async () => {
  const { m, eventos } = nuevo();
  await anotar(m);
  await anotar(m);
  assert.strictEqual(eventos('bocaos.cargo_anotado').length, 1);
  assert.strictEqual((await de(m, { pedido_id: PEDIDO })).data.cargos.length, 1);
});

test('anular exige autor y motivo; con los dos, la deuda se anula y se dice', async () => {
  const { m, eventos } = nuevo();
  await anotar(m);
  const cargo_id = eventos('bocaos.cargo_anotado')[0].p.cargo_id;

  assert.strictEqual((await anular(m, { cargo_id, motivo: 'sin autor' })).status, 400);
  assert.strictEqual((await anular(m, { cargo_id, autor: 'sala' })).status, 400);

  const ok = await anular(m, { cargo_id, autor: 'sala', motivo: 'la prueba era de otro pedido', hora: '2026-11-04T09:00:00.000Z' });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok));
  assert.strictEqual(ok.data.cargo.estado, 'ANULADO');
  assert.strictEqual(ok.data.cargo.anulado_por, 'sala');

  const hechos = eventos('bocaos.cargo_anotado');
  assert.strictEqual(hechos.length, 2, 'el estado viaja en el mismo hecho: anotado y anulado');
  assert.strictEqual(hechos[1].p.transicion, 'anulado');
  assert.strictEqual(hechos[1].p.estado, 'ANULADO');
  assert.strictEqual(hechos[1].p.motivo_anulacion, 'la prueba era de otro pedido');

  const saldo = (await de(m, { pedido_id: PEDIDO })).data.saldo;
  assert.strictEqual(saldo.anulados, 1);
  assert.strictEqual(saldo.vivos, 0);
});

test('anular dos veces es idempotente, no una segunda anulación', async () => {
  const { m, eventos } = nuevo();
  await anotar(m);
  const cargo_id = eventos('bocaos.cargo_anotado')[0].p.cargo_id;
  await anular(m, { cargo_id, autor: 'sala', motivo: 'x' });
  const otra = await anular(m, { cargo_id, autor: 'sala', motivo: 'y' });
  assert.strictEqual(otra.status, 200);
  assert.strictEqual(otra.data.idempotente, true);
  assert.strictEqual(eventos('bocaos.cargo_anotado').length, 2, 'un hecho por transición, no tres');
});

test('un cargo cobrado no se anula: se abre otro documento (H02)', async () => {
  const { m, eventos } = nuevo();
  await anotar(m);
  const cargo_id = eventos('bocaos.cargo_anotado')[0].p.cargo_id;
  const est = await m.estado(PLAZA);
  est.cargos[cargo_id].estado = 'COBRADO';
  const r = await anular(m, { cargo_id, autor: 'sala', motivo: 'tarde' });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'YA_COBRADO');
});

test('de: por parte, devuelve los cargos en los que está de un lado o del otro', async () => {
  const { m } = nuevo();
  await anotar(m, {
    pedido_id: 'ped-2',
    filas: [{ fila: 'n1_tienda', excedido: true, min: 12, deudor: { rol: 'tienda', parte_id: TIENDA }, acreedor: { rol: 'rider', parte_id: RIDER } }]
  });
  const delRider = (await de(m, { parte_id: RIDER })).data.cargos;
  assert.strictEqual(delRider.length, 1);
  const deLaTienda = (await de(m, { parte_id: TIENDA })).data.cargos;
  assert.strictEqual(deLaTienda.length, 1);
  const deOtro = (await de(m, { parte_id: 'rd-9' })).data.cargos;
  assert.strictEqual(deOtro.length, 0);
});

test('el custodio guarda su propio store: single-writer', () => {
  const { m } = nuevo();
  assert.strictEqual(m._path, '/bocaos/cargo-fallo.json');
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

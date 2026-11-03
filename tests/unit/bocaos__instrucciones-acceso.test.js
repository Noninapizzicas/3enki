'use strict';

/**
 * bocaos/instrucciones-acceso — F05 (InstruccionesAcceso).
 *
 * Lo que se vigila:
 *   1. Las ve el rider del CONTRATO VIVO, y sólo él: otro rider recibe 403.
 *   2. Contrato cerrado → NO_HAY, aunque el dato siga escrito.
 *   3. Sin contrato vivo → NO_HAY (no se muestran «por si acaso»).
 *   4. El contrato no se copia aquí: se pregunta al bus en cada lectura.
 *   5. El texto no viaja en el hecho: es dato personal del cliente del cliente.
 *
 * Ejecutar: node tests/unit/bocaos__instrucciones-acceso.test.js
 */

const assert = require('assert');
const InstruccionesAcceso = require('../../modules/bocaos/instrucciones-acceso/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const PEDIDO = 'ped-1001';
const RIDER = 'rid-1';

function nuevo({ contrato = { contrato_id: 'ct-1', pedido_id: PEDIDO, rider_id: RIDER, estado: 'VIVO', creado_en: '2026-11-03T10:00:00.000Z' } } = {}) {
  const publicados = [];
  const pedidas = [];
  const m = new InstruccionesAcceso();
  m.plaza_id = PLAZA;
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => {
    pedidas.push({ ev, payload });
    if (ev === 'contrato-puntual.de.request') {
      if (!contrato) return { status: 404, error: { code: 'NO_CONSTA' } };
      return { status: 200, data: { contrato } };
    }
    return null;
  };
  return { m, pedidas, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const anotar = (m, extra) => m.onAnotarRequest({ request_id: 'a', data: { project_id: PLAZA, pedido_id: PEDIDO, portal: '3', piso: '2ºB', texto: 'llamar al 3º', autor: 'cli-1', ...extra } });
const de = (m, extra) => m.onDeRequest({ request_id: 'd', data: { project_id: PLAZA, pedido_id: PEDIDO, rider_id: RIDER, ...extra } });

test('F05: se anotan y las ve el rider del contrato vivo', async () => {
  const { m, eventos } = nuevo();
  const a = await anotar(m);
  assert.strictEqual(a.status, 201, JSON.stringify(a.error || {}));
  assert.strictEqual(eventos('bocaos.instrucciones_anotadas').length, 1);

  const r = await de(m);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.no_hay, false);
  assert.deepStrictEqual(r.data.instrucciones, { portal: '3', piso: '2ºB', texto: 'llamar al 3º', anotada_en: r.data.instrucciones.anotada_en });
  assert.strictEqual(r.data.contrato_id, 'ct-1');
  assert.strictEqual(r.data.ventana.contrato, 'VIVO');
});

test('F05: el hecho NO lleva el texto (dato personal del cliente del cliente)', async () => {
  const { m, eventos } = nuevo();
  await anotar(m);
  const hecho = eventos('bocaos.instrucciones_anotadas')[0].p;
  assert.strictEqual(hecho.tiene_texto, true);
  assert.strictEqual(hecho.tiene_portal, true);
  assert.strictEqual(JSON.stringify(hecho).includes('llamar al 3º'), false, 'el texto no viaja en el bus');
});

test('F05: otro rider recibe 403 (y no se filtra el contenido)', async () => {
  const { m, eventos } = nuevo();
  await anotar(m);
  const r = await de(m, { rider_id: 'rid-otro' });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.error.code, 'FORBIDDEN');
  assert.strictEqual(r.data, undefined);
  assert.strictEqual(JSON.stringify(r).includes('llamar'), false, 'el rechazo no lleva las instrucciones');
  assert.strictEqual(eventos('instrucciones-acceso.de.failed').length, 1);
});

test('F05: contrato cerrado → NO_HAY, aunque el dato siga escrito', async () => {
  const { m } = nuevo();
  await anotar(m);
  await m.onContratoCerrado({ data: { project_id: PLAZA, plaza_id: PLAZA, pedido_id: PEDIDO, hora_cierre: '2026-11-03T10:30:00.000Z' } });

  const r = await de(m);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.no_hay, true);
  assert.ok(r.data.motivo.includes('contrato se cerró'), r.data.motivo);
});

test('F05: sin contrato vivo no se muestran', async () => {
  const { m } = nuevo({ contrato: null });
  await anotar(m);
  const r = await de(m);
  assert.strictEqual(r.data.no_hay, true);
  assert.ok(r.data.motivo.includes('sin contrato vivo'));

  // Un contrato CERRADO en el custodio del contrato tampoco abre la ventana.
  const { m: m2 } = nuevo({ contrato: { contrato_id: 'ct-1', rider_id: RIDER, estado: 'CERRADO' } });
  await anotar(m2);
  assert.strictEqual((await de(m2)).data.no_hay, true);
});

test('F05: sin instrucciones para ese pedido, NO_HAY', async () => {
  const { m } = nuevo();
  const r = await de(m);
  assert.strictEqual(r.data.no_hay, true);
  assert.ok(r.data.motivo.includes('no hay instrucciones'));
});

test('F05: sin texto, portal ni piso no hay instrucción que anotar', async () => {
  const { m, eventos } = nuevo();
  const r = await m.onAnotarRequest({ request_id: 'x', data: { project_id: PLAZA, pedido_id: PEDIDO } });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(eventos('bocaos.instrucciones_anotadas').length, 0);
});

test('F05: corregir añade — la anterior queda en el historial con su hora', async () => {
  const { m } = nuevo();
  await anotar(m, { texto: 'primera' });
  await anotar(m, { texto: 'segunda' });
  const r = await de(m);
  assert.strictEqual(r.data.instrucciones.texto, 'segunda');
  const guardado = (await m.estado(PLAZA)).instrucciones[PEDIDO];
  assert.strictEqual(guardado.historial.length, 1);
  assert.strictEqual(guardado.historial[0].texto, 'primera');
});

test('pide el contrato al bus en cada lectura (no guarda una copia)', async () => {
  const { m, pedidas } = nuevo();
  await anotar(m);
  await de(m);
  await de(m);
  assert.strictEqual(pedidas.filter((p) => p.ev === 'contrato-puntual.de.request').length, 2);
  const guardado = (await m.estado(PLAZA)).instrucciones[PEDIDO];
  assert.strictEqual(guardado.contrato_id, undefined, 'el contrato no se copia aquí');
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

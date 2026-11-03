'use strict';

/**
 * bocaos/contrato-tramos — E06 (ContratoTramos) · N02 (SimuladorTramos).
 *
 * Lo que se vigila:
 *   1. El contrato rige DESDE SU HORA: `vigente(parte, instante)` devuelve el tramo que estaba
 *      vivo en aquel instante, no el de hoy. Cambiar tramos no reescribe un cierre emitido.
 *   2. La forma es CERRADA: ni antigüedad, ni exclusividad, ni cuota mínima (Q34/Q35); lo que no
 *      está en la tabla no se guarda, y sin acta no hay contrato.
 *   3. Sin aceptación de la parte (I08) NO DEVENGA: se dice, no se finge.
 *   4. El simulador recalcula con los hechos de ESA parte, cuenta aparte lo que no consta y NO
 *      aplica: no emite ningún hecho de tramos.
 *   5. La tienda la contrata la PLAZA, no el nacional (Q42).
 *
 * Ejecutar: node tests/unit/bocaos__contrato-tramos.test.js
 */

const assert = require('assert');
const ContratoTramos = require('../../modules/bocaos/contrato-tramos/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const T1 = '2026-11-01T09:00:00.000Z';
const T2 = '2026-11-02T09:00:00.000Z';
const T3 = '2026-11-03T09:00:00.000Z';
const T4 = '2026-11-04T09:00:00.000Z';

function nuevo() {
  const publicados = [];
  const pedidas = [];
  const m = new ContratoTramos();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => { pedidas.push({ ev, payload }); return null; };
  return { m, pedidas, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const declarar = (m, extra) => m.onDeclararRequest({ request_id: 'q', data: {
  project_id: PLAZA, plaza_id: PLAZA, parte: 'rider', parte_id: 'rid-1',
  tramo: 2, desde: T1, autor: 'duena-plaza', acta: 'acta-1', ...extra
} });
const vigente = (m, extra) => m.onVigenteRequest({ request_id: 'v', data: { project_id: PLAZA, parte_id: 'rid-1', ...extra } });

test('sin contrato declarado: no consta, y se dice que no devenga', async () => {
  const { m } = nuevo();
  const r = await vigente(m, { instante: T1 });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.contrato, null);
  assert.strictEqual(r.data.no_consta, true);
  assert.strictEqual(r.data.devenga, false);
});

test('el tramo se declara con su tabla y sus céntimos por parte (rider 10 · tienda 20)', async () => {
  const { m, eventos } = nuevo();
  const rider = await declarar(m, { tramo: 2 });
  assert.strictEqual(rider.status, 201, JSON.stringify(rider.error || {}));
  assert.strictEqual(rider.data.contrato.tramo, 2);
  assert.strictEqual(rider.data.contrato.fijo_mensual_cents, 7900);
  assert.strictEqual(rider.data.contrato.cents_por_pedido, 10, 'al rider se le pagan 10 c€/pedido');

  const tienda = await declarar(m, { parte: 'tienda', parte_id: 'tienda-paco', tramo: 1 });
  assert.strictEqual(tienda.status, 201);
  assert.strictEqual(tienda.data.contrato.fijo_mensual_cents, 3900);
  assert.strictEqual(tienda.data.contrato.cents_por_pedido, 20, 'la tienda paga 20 c€/pedido');

  const hechos = eventos('bocaos.tramos_actualizados');
  assert.strictEqual(hechos.length, 2);
  assert.strictEqual(hechos[1].p.parte, 'tienda');
  assert.strictEqual(hechos[1].p.cents_por_pedido, 20);
});

test('vigencia: un cambio rige desde su hora y NO reescribe lo devengado antes', async () => {
  const { m } = nuevo();
  await declarar(m, { tramo: 1, desde: T1 });
  const cambio = await declarar(m, { tramo: 3, desde: T3 });
  assert.strictEqual(cambio.status, 201);
  assert.strictEqual(cambio.data.version, 2);

  const antes = (await vigente(m, { instante: T2 })).data;
  assert.strictEqual(antes.contrato.tramo, 1, 'en T2 regía el tramo 1');
  assert.strictEqual(antes.contrato.version, 1);
  assert.strictEqual(antes.contrato.desde, T1);

  const despues = (await vigente(m, { instante: T4 })).data;
  assert.strictEqual(despues.contrato.tramo, 3);
  assert.strictEqual(despues.contrato.version, 2);
});

test('vigencia hacia atrás: 409, el pasado no se reescribe', async () => {
  const { m } = nuevo();
  await declarar(m, { tramo: 3, desde: T3 });
  const r = await declarar(m, { tramo: 1, desde: T2 });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'VIGENCIA_RETROACTIVA');
  assert.strictEqual((await vigente(m, { instante: T4 })).data.contrato.tramo, 3);
});

test('la forma es cerrada: exclusividad, antigüedad o cuota mínima no tienen dónde ponerse', async () => {
  const { m, eventos } = nuevo();
  for (const extra of [{ exclusividad: true }, { antiguedad_meses: 6 }, { cuota_minima_cents: 5000 }, { prioridad: 1 }, { penalizacion: 300 }]) {
    const r = await declarar(m, extra);
    assert.strictEqual(r.status, 409, JSON.stringify(extra));
    assert.strictEqual(r.error.code, 'FORMA_CERRADA');
  }
  const quinto = await declarar(m, { descuento_por_volumen: 5 });
  assert.strictEqual(quinto.status, 409, 'un término que no está en la tabla tampoco');
  assert.strictEqual(eventos('bocaos.tramos_actualizados').length, 0, 'nada se escribió');
});

test('ningún tramo sin acta ni sin autor, y el tramo es 1·2·3', async () => {
  const { m, eventos } = nuevo();
  const sinActa = await declarar(m, { acta: null });
  assert.strictEqual(sinActa.status, 409);
  assert.strictEqual(sinActa.error.code, 'SIN_ACTA');

  const sinAutor = await m.onDeclararRequest({ request_id: 'x', data: { project_id: PLAZA, parte: 'rider', parte_id: 'rid-1', tramo: 2, acta: 'a', desde: T1 } });
  assert.strictEqual(sinAutor.status, 400);

  const malTramo = await declarar(m, { tramo: 4 });
  assert.strictEqual(malTramo.status, 400);
  assert.strictEqual(eventos('bocaos.tramos_actualizados').length, 0);
});

test('I08: sin aceptación de la parte el contrato no devenga; con ella, sí', async () => {
  const { m } = nuevo();
  await declarar(m, { tramo: 1, desde: T1 });
  const sin = (await vigente(m, { instante: T2 })).data;
  assert.strictEqual(sin.devenga, false);
  assert.ok(sin.motivo.includes('aceptación'), sin.motivo);

  await m.onTerminosAceptados({ data: { project_id: PLAZA, parte_id: 'rid-1', version: 3, hora: T2 } });
  const con = (await vigente(m, { instante: T3 })).data;
  assert.strictEqual(con.devenga, true);
  assert.strictEqual(con.contrato.aceptado_en, T2);
  assert.strictEqual(con.contrato.aceptado_version, '3');
});

test('Q42: el contratante de la tienda es la plaza; el nacional no firma tramos', async () => {
  const { m } = nuevo();
  const r = await declarar(m, { parte: 'tienda', parte_id: 'tienda-paco', unidad: 'nacional' });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'CONTRATO_ES_DE_LA_PLAZA');

  const ok = await declarar(m, { parte: 'tienda', parte_id: 'tienda-paco', tramo: 2 });
  assert.strictEqual(ok.status, 201);
  assert.strictEqual(ok.data.contrato.plaza_id, PLAZA, 'lo contrata la plaza, con su sello');
});

test('N02: el simulador recalcula con los hechos de ESA parte y NO aplica', async () => {
  const { m, eventos } = nuevo();
  await declarar(m, { tramo: 1, desde: T1, cents_por_pedido: 10 });
  const antes = eventos('bocaos.tramos_actualizados').length;

  const r = await m.onSimularRequest({ request_id: 's', data: {
    project_id: PLAZA, parte_id: 'rid-1', instante: T2,
    hechos: [
      { pedido_id: 'p1', entregado: true, cargos_centimos: 0 },
      { pedido_id: 'p2', entregado: true, cargos_centimos: 50 },
      { pedido_id: 'p3', entregado: false, cargos_centimos: 0 }
    ],
    alternativa: { tramo: 3 }
  } });

  assert.strictEqual(r.status, 200, JSON.stringify(r.error || {}));
  const s = r.data.simulacion;
  assert.strictEqual(s.aplicada, false, 'simula, no aplica');
  assert.strictEqual(s.base.tramo, 1);
  assert.strictEqual(s.alternativa.tramo, 3);
  assert.strictEqual(s.resumen.n, 3);
  assert.strictEqual(s.resumen.entregados, 2, 'el pedido sin entrega no cuenta como entregado');
  assert.strictEqual(s.resumen.por_pedido_antes_cents, 20 + 50 + 0);
  assert.strictEqual(s.resumen.por_pedido_ahora_cents, 20 + 50 + 0, 'los céntimos por pedido no cambian entre tramos 1 y 3');
  assert.strictEqual(s.resumen.fijo_ahora_cents, 14900, 'lo que cambia entre tramos es el fijo');
  assert.ok(s.limites.length >= 2);

  assert.strictEqual(eventos('bocaos.tramos_actualizados').length, antes, 'la simulación no escribe contrato');
  assert.strictEqual((await vigente(m, { instante: T2 })).data.contrato.tramo, 1, 'sigue rigiendo el tramo 1');

  const vacio = await m.onSimularRequest({ request_id: 's2', data: { project_id: PLAZA, parte_id: 'rid-1', hechos: [] } });
  assert.strictEqual(vacio.status, 400, 'sin hechos no se simula');
});

test('idempotencia: el mismo contrato dos veces no crea dos versiones', async () => {
  const { m } = nuevo();
  const a = await declarar(m, { contrato_id: 'tr-1', tramo: 1, desde: T1 });
  const b = await declarar(m, { contrato_id: 'tr-1', tramo: 3, desde: T1 });
  assert.strictEqual(a.status, 201);
  assert.strictEqual(b.status, 200);
  assert.strictEqual(b.data.idempotente, true);
  assert.strictEqual((await vigente(m, { instante: T2 })).data.contrato.tramo, 1);
});

test('un acta firmada con tramos entra por la misma puerta', async () => {
  const { m, eventos } = nuevo();
  await m.onActaAnotada({ data: {
    project_id: PLAZA, plaza_id: PLAZA, acta_id: 'acta-9', autor: 'duena',
    parte_id: 'tienda-paco', parte: 'tienda', desde: T1,
    tramos: { tramo: 2 }
  } });
  const r = (await vigente(m, { parte_id: 'tienda-paco', instante: T2 })).data;
  assert.strictEqual(r.contrato.tramo, 2);
  assert.strictEqual(r.contrato.acta, 'acta-9');
  assert.strictEqual(eventos('bocaos.tramos_actualizados').length, 1);

  // Un acta sin tramos no toca nada (y no revienta).
  await m.onActaAnotada({ data: { project_id: PLAZA, acta_id: 'acta-10', texto: 'otra cosa' } });
  assert.strictEqual(eventos('bocaos.tramos_actualizados').length, 1);
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

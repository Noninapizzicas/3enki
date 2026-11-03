'use strict';

/**
 * bocaos/liquidacion — H01 · H02 · H05 · E04 · E05 · A32 · H06. El único dinero de la plaza.
 *
 * Lo que se vigila:
 *   1. Se devenga por PEDIDO ACEPTADO y con la tarifa que estaba VIVA en la hora del hecho.
 *   2. DOS cifras: seguro y en duda (Q18). No se elige.
 *   3. El cierre es INMUTABLE y no incluye el canon: el segundo cierre no cambia el primero.
 *   4. La plaza NO retiene: un cargo no se descuenta y el reparto la pone sólo en su cuota.
 *   5. Lo que el diseño no tiene (la parte del fijo, la mora) sale NO_CONSTA, no inventado.
 *
 * Ejecutar: node tests/unit/bocaos__liquidacion.test.js
 */

const assert = require('assert');
const Liquidacion = require('../../modules/bocaos/liquidacion/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const T1 = '2026-11-02T09:00:00.000Z';   // lunes de la semana 45
const T2 = '2026-11-03T09:00:00.000Z';
const T3 = '2026-11-04T09:00:00.000Z';
const P1 = '2026-W45';

const CONTRATO = (extra = {}) => ({
  contrato_id: 'ct-ride-1', tramo: 2, version: 1,
  fijo_mensual_cents: 7900, cents_por_pedido: 10, devenga: true, ...extra
});

function nuevo({ contratos = {}, pedidos = {}, cancelados = {} } = {}) {
  const publicados = [];
  const pedidas = [];
  const m = new Liquidacion();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => {
    pedidas.push({ ev, payload });
    if (ev === 'contrato-tramos.vigente.request') {
      const c = contratos[payload.parte_id];
      if (!c) return { status: 200, data: { contrato: null, no_consta: true, devenga: false } };
      if (typeof c === 'function') return { status: 200, data: { contrato: c(payload.instante) } };
      return { status: 200, data: { contrato: c } };
    }
    if (ev === 'pedido-mercado.de.request') {
      const estado = cancelados[payload.pedido_id];
      if (!estado) return null;
      return { status: 200, data: { pedido: { pedido_id: payload.pedido_id, estado } } };
    }
    return null;
  };
  return { m, pedidas, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

async function conUnPedido({ rider = 'rider-ana', tienda = 'tienda-paco', hora = T1, precio = 450 } = {}) {
  const ctx = nuevo({
    contratos: {
      [rider]: CONTRATO({ cents_por_pedido: 10 }),
      [tienda]: CONTRATO({ contrato_id: 'ct-tie-1', fijo_mensual_cents: 3900, cents_por_pedido: 20 })
    }
  });
  await ctx.m.onContratoCreado({ data: {
    project_id: PLAZA, plaza_id: PLAZA, pedido_id: 'ped-1', contrato_id: 'cp-1',
    rider_id: rider, tienda_id: tienda, hora_aceptacion: hora, precio_cents: precio
  } });
  return ctx;
}

const cerrar = (m, extra) => m.onCerrarRequest({ request_id: 'c', data: { project_id: PLAZA, plaza_id: PLAZA, periodo: P1, cerrado_por: 'duena', ...extra } });

test('devenga por pedido ACEPTADO, con la tarifa viva en la hora del hecho (E04)', async () => {
  const { m, eventos } = await conUnPedido();
  await m.onContratoCreado({ data: {
    project_id: PLAZA, plaza_id: PLAZA, pedido_id: 'ped-2', contrato_id: 'cp-2',
    rider_id: 'rider-ana', tienda_id: 'tienda-paco', hora_aceptacion: T2, precio_cents: 500
  } });
  // La tarifa del rider sube a 12 c/pedido a partir de T2: lo de T1 se cobra como se pactó.
  const m2 = m;
  m2._rpc = ((orig) => async (ev, payload) => {
    if (ev === 'contrato-tramos.vigente.request' && payload.parte_id === 'rider-ana') {
      const cents = payload.instante >= T2 ? 12 : 10;
      return { status: 200, data: { contrato: CONTRATO({ cents_por_pedido: cents }) } };
    }
    if (ev === 'contrato-tramos.vigente.request') {
      return { status: 200, data: { contrato: CONTRATO({ contrato_id: 'ct-tie-1', fijo_mensual_cents: 3900, cents_por_pedido: 20 }) } };
    }
    if (ev === 'pedido-mercado.de.request') return { status: 200, data: { pedido: { estado: 'ENTREGADO' } } };
    return null;
  })(m2._rpc);

  const r = await cerrar(m2, { prorrateo: { dias_periodo: 7, dias_mes: 30 } });
  assert.strictEqual(r.status, 201, JSON.stringify(r.error || {}));
  const rider = r.data.cierre.partes.find((f) => f.parte_id === 'rider-ana');
  assert.strictEqual(rider.pedidos, 2);
  assert.strictEqual(rider.variable_seguro_centimos, 22, '10 c del de T1 + 12 c del de T2');
  assert.strictEqual(rider.detalle.length, 2);
  assert.strictEqual(eventos('bocaos.devengo_anotado').length, 2, 'un devengo por parte');
  assert.strictEqual(eventos('bocaos.ciclo_cerrado').length, 1);
});

test('DOS cifras: un pedido cancelado tras aceptar queda EN DUDA (Q18), no se elige', async () => {
  const ctx = nuevo({
    contratos: { 'rider-ana': CONTRATO() },
    cancelados: { 'ped-2': 'CANCELADO', 'ped-1': 'ENTREGADO' }
  });
  for (const [id, hora] of [['ped-1', T1], ['ped-2', T2]]) {
    await ctx.m.onContratoCreado({ data: {
      project_id: PLAZA, plaza_id: PLAZA, pedido_id: id, rider_id: 'rider-ana',
      hora_aceptacion: hora, precio_cents: 400
    } });
  }
  const r = await cerrar(ctx.m);
  assert.strictEqual(r.status, 201);
  const rider = r.data.cierre.partes.find((f) => f.parte_id === 'rider-ana');
  assert.strictEqual(rider.variable_seguro_centimos, 10, 'sólo el que no está en duda');
  assert.strictEqual(rider.variable_en_duda_centimos, 10);
  assert.strictEqual(rider.detalle.find((d) => d.pedido_id === 'ped-2').estado, 'en_duda');
  assert.strictEqual(rider.detalle.find((d) => d.pedido_id === 'ped-2').motivo.includes('Q18'), true);
});

test('sin contrato vigente aceptado no hay devengo (E06), y sin aceptación no hay pedido', async () => {
  const ctx = nuevo({ contratos: {} });
  await ctx.m.onContratoCreado({ data: {
    project_id: PLAZA, plaza_id: PLAZA, pedido_id: 'ped-1', rider_id: 'rider-ana',
    hora_aceptacion: T1, precio_cents: 400
  } });
  const r = await cerrar(ctx.m, { partes: ['rider-ana'] });
  const rider = r.data.cierre.partes.find((f) => f.parte_id === 'rider-ana');
  assert.strictEqual(rider.devenga, false);
  assert.ok(/E06|contrato/.test(rider.motivo));
  assert.strictEqual(rider.total_seguro_centimos, null, 'sin contrato no hay número');
  assert.strictEqual(r.data.cierre.avisos.length >= 1, true, 'el cierre avisa de la parte que no devenga');
});

test('la tienda del pedido se resuelve en el bus: sin ella su devengo desaparecería en silencio', async () => {
  const { m } = nuevo({
    contratos: {
      'rider-ana': CONTRATO({ cents_por_pedido: 10 }),
      'tienda-paco': CONTRATO({ contrato_id: 'ct-tie-1', fijo_mensual_cents: 3900, cents_por_pedido: 20 })
    }
  });
  // El hecho del contrato NO trae tienda_id (así lo emite `contrato-puntual`).
  await m.onContratoCreado({ data: {
    project_id: PLAZA, plaza_id: PLAZA, pedido_id: 'ped-1', rider_id: 'rider-ana',
    hora_aceptacion: T1, precio_cents: 450
  } });
  m._rpc = async (ev, payload) => {
    if (ev === 'pedido-mercado.de.request') {
      return { status: 200, data: { pedido: { pedido_id: payload.pedido_id, estado: 'ENTREGADO', tienda_id: 'tienda-paco' } } };
    }
    if (ev === 'contrato-tramos.vigente.request') {
      return { status: 200, data: { contrato: payload.parte_id === 'rider-ana'
        ? CONTRATO({ cents_por_pedido: 10 })
        : CONTRATO({ contrato_id: 'ct-tie-1', fijo_mensual_cents: 3900, cents_por_pedido: 20 }) } };
    }
    return null;
  };

  const r = await cerrar(m);
  assert.strictEqual(r.status, 201, JSON.stringify(r.error || {}));
  const tienda = r.data.cierre.partes.find((f) => f.parte_id === 'tienda-paco');
  assert.ok(tienda, 'la tienda del pedido tiene que devengar: es la que paga el tramo');
  assert.strictEqual(tienda.pedidos, 1);
  assert.strictEqual(tienda.variable_seguro_centimos, 20);
});

test('el fijo es mensual y el ciclo semanal: sin prorrateo declarado sale NO_CONSTA (Q26)', async () => {
  const { m } = await conUnPedido();
  const r = await cerrar(m);
  const tienda = r.data.cierre.partes.find((f) => f.parte_id === 'tienda-paco');
  assert.strictEqual(tienda.fijo_mensual_centimos, 3900);
  assert.strictEqual(tienda.fijo_estado, 'NO_CONSTA');
  assert.strictEqual(tienda.fijo_periodo_centimos, null, 'no se inventa la parte del fijo');
  assert.strictEqual(tienda.variable_seguro_centimos, 20, 'el variable sí se sabe');
  assert.strictEqual(tienda.total_seguro_centimos, null, 'ni un total a medias');
  assert.strictEqual(tienda.total_seguro_estado, 'NO_CONSTA');
  assert.ok(/Q26/.test(tienda.motivo_fijo));
  assert.ok(r.data.cierre.avisos.some((a) => /fijo/.test(a)), 'el cierre lo dice en voz alta');

  const conProrrateo = await cerrar(m, { periodo: P1 });
  assert.strictEqual(conProrrateo.status, 200, 'el segundo cierre es el primero');
});

test('con prorrateo DECLARADO el fijo se calcula con los números de quien cierra', async () => {
  const { m } = await conUnPedido();
  const r = await cerrar(m, { prorrateo: { dias_periodo: 7, dias_mes: 30 } });
  const tienda = r.data.cierre.partes.find((f) => f.parte_id === 'tienda-paco');
  assert.strictEqual(tienda.fijo_estado, 'PRORRATEADO');
  assert.strictEqual(tienda.fijo_periodo_centimos, 910, '3900 × 7/30 = 910');
  assert.strictEqual(tienda.total_seguro_centimos, 930, '20 c del pedido + 910 del fijo');
});

test('un cierre NO se reabre: el segundo cierre devuelve el primero, con su huella', async () => {
  const { m, eventos } = await conUnPedido();
  const a = await cerrar(m);
  const b = await cerrar(m);
  assert.strictEqual(a.status, 201);
  assert.strictEqual(b.status, 200);
  assert.strictEqual(b.data.idempotente, true);
  assert.strictEqual(b.data.cierre.cierre_id, a.data.cierre.cierre_id);
  assert.strictEqual(b.data.cierre.huella, a.data.cierre.huella);
  assert.strictEqual(eventos('bocaos.ciclo_cerrado').length, 1, 'un ciclo, un hecho');

  const abrir = await m.onAbrirRequest({ request_id: 'a', data: { project_id: PLAZA, periodo: P1 } });
  assert.strictEqual(abrir.status, 409);
  assert.strictEqual(abrir.error.code, 'PERIODO_CERRADO');
});

test('el ciclo cierra sin nacional: el canon no entra (H02, auditoría 4)', async () => {
  const { m } = await conUnPedido();
  const r = await cerrar(m);
  assert.strictEqual(r.data.cierre.incluye_canon, false);
  assert.strictEqual(r.data.cierre.canon.incluido, false);
  assert.strictEqual(r.data.cierre.estado, 'CERRADO');
});

test('A32: kilómetros ahorrados o porcentaje del ticket NO entran en el cierre', async () => {
  const { m, eventos } = await conUnPedido();
  for (const extra of [{ km_ahorrados: 12 }, { porcentaje_ticket: 0.1 }, { pedidos_enlazados: 3 }]) {
    const r = await cerrar(m, extra);
    assert.strictEqual(r.status, 409, JSON.stringify(extra));
    assert.strictEqual(r.error.code, 'NO_CAPTURA_DEL_AHORRO');
  }
  assert.strictEqual(eventos('bocaos.ciclo_cerrado').length, 0, 'no hay cierre con esa regla');
});

test('H06: un cargo NO se descuenta y el cierre lo dice con nombre', async () => {
  const { m, eventos } = await conUnPedido();
  await m.onCargoAnotado({ data: {
    project_id: PLAZA, cargo_id: 'cg-1', pedido_id: 'ped-1',
    deudor: { rol: 'rider', parte_id: 'rider-ana' }, acreedor: { rol: 'tienda', parte_id: 'tienda-paco' },
    importe_centimos: null, importe_estado: 'NO_CONSTA', estado: 'ANOTADO'
  } });

  const intento = await cerrar(m, { descontar_cargos: true });
  assert.strictEqual(intento.status, 409);
  assert.strictEqual(intento.error.code, 'NO_RETENCION');

  const r = await cerrar(m);
  assert.strictEqual(r.status, 201);
  assert.deepStrictEqual(r.data.cierre.cargos_descontados, []);
  assert.strictEqual(r.data.cierre.retencion, false);
  assert.strictEqual(r.data.cierre.cargos.length, 1);
  assert.strictEqual(r.data.cierre.cargos[0].descontado, false);
  assert.strictEqual(r.data.cierre.cargos[0].cobrable, false);
  const rider = r.data.cierre.partes.find((f) => f.parte_id === 'rider-ana');
  assert.strictEqual(rider.variable_seguro_centimos, 10, 'la deuda no toca el devengo');
  assert.strictEqual(eventos('bocaos.ciclo_cerrado')[0].p.retencion, false);
});

test('E05: el reparto pone a la plaza SÓLO en los cobros de su cuota', async () => {
  const { m } = await conUnPedido();
  await cerrar(m, { prorrateo: { dias_periodo: 7, dias_mes: 30 } });

  const sinNacional = await m.onCuentaRequest({ request_id: 'q', data: { project_id: PLAZA, periodo: P1 } });
  const r1 = sinNacional.data.reparto;
  assert.strictEqual(r1.cobros.length, 4, 'sin nacional no hay cobro del canon');
  assert.deepStrictEqual(r1.cobros.filter((c) => c.plaza_cobra).map((c) => c.n), [3, 4]);
  assert.strictEqual(r1.cobros[0].importe_centimos, 450, 'el precio íntegro del reparto va al rider');
  assert.strictEqual(r1.cobros[1].importe_estado, 'NO_CONSTA', 'la comida no la toca la plaza');

  const conNacional = await m.onCuentaRequest({ request_id: 'q2', data: { project_id: PLAZA, periodo: P1, hay_nacional: true } });
  const r2 = conNacional.data.reparto;
  assert.strictEqual(r2.cobros.length, 5);
  assert.strictEqual(r2.cobros[4].a, 'nacional');
  assert.strictEqual(r2.cobros[4].importe_estado, 'NO_CONSTA', 'el canon lo emite R26');
  assert.strictEqual(r2.retencion, false);
});

test('H05: sin escala declarada no hay mora; con ella, la suspensión no corta lo que está en vuelo', async () => {
  const { m } = await conUnPedido();
  await m.onCargoAnotado({ data: {
    project_id: PLAZA, cargo_id: 'cg-9', pedido_id: 'ped-1',
    deudor: { rol: 'rider', parte_id: 'rider-ana' }, acreedor: { rol: 'tienda', parte_id: 'tienda-paco' },
    importe_centimos: null, importe_estado: 'NO_CONSTA', estado: 'ANOTADO'
  } });
  await cerrar(m);

  const sin = await m.onCuentaRequest({ request_id: 'q', data: { project_id: PLAZA, periodo: P1, dias_impago: 40 } });
  assert.strictEqual(sin.data.mora.aplica, false);
  assert.strictEqual(sin.data.mora.estado, 'NO_CONSTA');

  const escala = { recordatorio_dias: 3, recargo_dias: 7, suspension_dias: 15, recargo_centimos: 500 };
  const bloqueada = await m.onCuentaRequest({ request_id: 'q2', data: {
    project_id: PLAZA, periodo: P1, dias_impago: 40, escala_mora: escala, en_vuelo: true
  } });
  const conDeuda = bloqueada.data.mora.por_parte[0];
  assert.strictEqual(conDeuda.paso, 'SUSPENSION_BLOQUEADA');
  assert.strictEqual(conDeuda.corta_pedidos_en_vuelo, undefined);
  assert.strictEqual(bloqueada.data.mora.ambito, 'esta plaza', 'la mora no se contagia de otra plaza');

  const limpia = await m.onCuentaRequest({ request_id: 'q3', data: {
    project_id: PLAZA, periodo: P1, dias_impago: 40, escala_mora: escala
  } });
  assert.strictEqual(limpia.data.mora.por_parte[0].paso, 'SUSPENSION');
  assert.strictEqual(limpia.data.mora.por_parte[0].corta_pedidos_en_vuelo, false);
});

test('el job del ciclo: sin horario declarado no se programa nada (Q26); con él, se pide una vez', async () => {
  const sin = nuevo();
  await sin.m.onProjectActivated({ data: { project_id: PLAZA } });
  assert.strictEqual(sin.eventos('scheduler.job.created').length, 0, 'la hora del ciclo no se inventa');

  const con = nuevo();
  await con.m.onProjectActivated({ data: { project_id: PLAZA, ciclo: { horario: '0 3 * * 1' } } });
  assert.strictEqual(con.eventos('scheduler.job.created').length, 1);
  assert.strictEqual(con.eventos('scheduler.job.created')[0].p.name, Liquidacion.JOB_CICLO);
  await con.m.onProjectActivated({ data: { project_id: PLAZA, ciclo: { horario: '0 3 * * 1' } } });
  assert.strictEqual(con.eventos('scheduler.job.created').length, 1, 'un job, no uno por arranque');
});

test('el disparo del scheduler cierra el periodo abierto y filtra por nombre de job', async () => {
  const { m, eventos } = await conUnPedido();
  await m.onAbrirRequest({ request_id: 'a', data: { project_id: PLAZA, periodo: '2026-W45' } });

  await m.onSchedulerJobTriggered({ data: { project_id: PLAZA, jobName: 'otro-job' } });
  assert.strictEqual(eventos('bocaos.ciclo_cerrado').length, 0, 'no es su job');

  await m.onSchedulerJobTriggered({ data: { project_id: PLAZA, jobName: 'bocaos.ciclo_semanal' } });
  assert.strictEqual(eventos('bocaos.ciclo_cerrado').length, 1);
  assert.strictEqual(eventos('bocaos.ciclo_cerrado')[0].p.periodo, '2026-W45');
});

test('de: sin cierre no hay devengo congelado, y se dice', async () => {
  const { m } = await conUnPedido();
  await m.onAbrirRequest({ request_id: 'a', data: { project_id: PLAZA, periodo: P1 } });
  const abierto = await m.onDeRequest({ request_id: 'd', data: { project_id: PLAZA, periodo: P1 } });
  assert.strictEqual(abierto.status, 200);
  assert.strictEqual(abierto.data.cierre, null);
  assert.ok(/NO_CONSTA/.test(abierto.data.devengo_estado));

  const parte = await m.onDeRequest({ request_id: 'd2', data: { project_id: PLAZA, periodo: P1, parte_id: 'rider-ana' } });
  assert.strictEqual(parte.status, 404, 'sin cierre no hay devengo de una parte');

  await cerrar(m);
  const cerrado = await m.onDeRequest({ request_id: 'd3', data: { project_id: PLAZA, periodo: P1, parte_id: 'rider-ana' } });
  assert.strictEqual(cerrado.status, 200);
  assert.strictEqual(cerrado.data.devengo.parte_id, 'rider-ana');
  assert.strictEqual(cerrado.data.estado, 'CERRADO');
});

test('la semana ISO es la clave del periodo', () => {
  const m = new Liquidacion();
  assert.strictEqual(m._periodoDe(T1), '2026-W45');
  assert.strictEqual(m._periodoDe('2026-11-08T23:00:00.000Z'), '2026-W45', 'el domingo sigue en la misma semana');
  assert.strictEqual(m._periodoDe('2026-11-09T00:00:00.000Z'), '2026-W46', 'el lunes abre otra');
  assert.strictEqual(m._periodoDe('2026-01-01T00:00:00.000Z'), '2026-W01');
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

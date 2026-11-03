'use strict';

/**
 * bocaos/cuenta-parte — Q01 + M01. La cuenta de una parte y la cartera del rider.
 *
 * Lo que se vigila:
 *   1. Cada importe apunta a un hecho; lo que no consta es NO_CONSTA, nunca 0.
 *   2. El cliente final no tiene cuenta.
 *   3. Una cartera por plaza: la de al lado no se ve desde aquí.
 *   4. Ganado / reclamado / pendiente: entregado sin prueba se RECLAMA, no se gana (Q30).
 *   5. El neto sólo existe si constan sus tres términos.
 *
 * Ejecutar: node tests/unit/bocaos__cuenta-parte.test.js
 */

const assert = require('assert');
const CuentaParte = require('../../modules/bocaos/cuenta-parte/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const PERIODO = '2026-W45';

const DEVENGO = {
  parte_id: 'rider-ana', parte: 'rider', contrato_id: 'ct-1', tramo: 2, version: 3,
  pedidos: 2, cents_por_pedido: 10,
  variable_seguro_centimos: 20, variable_en_duda_centimos: 10,
  fijo_mensual_centimos: 7900, fijo_periodo_centimos: 1843, fijo_estado: 'PRORRATEADO',
  total_seguro_centimos: 1863, total_seguro_estado: 'SUMA', devenga: true,
  detalle: [
    { pedido_id: 'ped-1', precio_cents: 450, estado: 'seguro' },
    { pedido_id: 'ped-2', precio_cents: 500, estado: 'seguro' }
  ]
};

function nuevo({ devengo = DEVENGO, cargos = [], doc = { documento_id: 'fc-1', total_centimos: 1863 }, recibo = null, actas = {} } = {}) {
  const publicados = [];
  const m = new CuentaParte();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => {
    if (ev === 'liquidacion.de.request') {
      if (!devengo || (payload.parte_id && payload.parte_id !== devengo.parte_id)) {
        return { status: 404, error: { code: 'PARTE_NO_CONSTA', message: 'esa parte no tiene devengo en ese cierre' } };
      }
      return { status: 200, data: { periodo: PERIODO, estado: 'CERRADO', devengo, cierre_id: 'li-1' } };
    }
    if (ev === 'cargo-fallo.de.request') return { status: 200, data: { cargos } };
    if (ev === 'factura-gestion.de.request') {
      if (!doc) return { status: 404, error: { code: 'PARTE_NO_CONSTA', message: 'sin documento' } };
      return { status: 200, data: { reconstruido: true, documento: doc } };
    }
    if (ev === 'pago.recibo.request') {
      if (!recibo) return { status: 404, error: { code: 'NO_CONSTA', message: 'la pasarela no da un cobro para ese documento' } };
      return { status: 200, data: { recibo } };
    }
    if (ev === 'hechos-reparto.acta.request') {
      const a = actas[payload.pedido_id];
      return a ? { status: 200, data: { acta: a } } : { status: 404, error: { code: 'NO_CONSTA' } };
    }
    return null;
  };
  return { m, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const ver = (m, extra) => m.onVerRequest({ request_id: 'v', data: { project_id: PLAZA, parte_id: 'rider-ana', periodo: PERIODO, ...extra } });

test('la cuenta dice devengado, facturado y deuda, cada uno con su hecho', async () => {
  const { m } = nuevo({
    cargos: [{
      cargo_id: 'cg-1', estado: 'ANOTADO', deudor: { parte_id: 'rider-ana' }, acreedor: { parte_id: 'tienda-paco' },
      importe_centimos: null, importe_estado: 'NO_CONSTA', evidencia: [{ hecho: 'espera_n1', minutos: 11 }]
    }]
  });
  const r = await ver(m);
  assert.strictEqual(r.status, 200);
  const d = r.data;
  assert.strictEqual(d.devengado.seguro_centimos, 1863);
  assert.strictEqual(d.devengado.en_duda_centimos, 10);
  assert.strictEqual(d.facturado.documento_id, 'fc-1');
  assert.strictEqual(d.facturado.importe_centimos, 1863);
  assert.strictEqual(d.tramo.tramo, 2, 'con la versión de tramos que estaba viva');
  assert.strictEqual(d.tramo.version, 3);
  assert.strictEqual(d.deuda.cargos.length, 1);
  assert.strictEqual(d.deuda.cargos[0].sentido, 'debe');
  assert.strictEqual(d.deuda.cargos[0].evidencia.length, 1);
  assert.strictEqual(d.deuda.total_estado, 'NO_CONSTA', 'el importe del cargo no consta: no se suma un cero');
});

test('lo que no consta es NO_CONSTA, nunca cero: el cobro sin pasarela que conteste', async () => {
  const { m } = nuevo();
  const d = (await ver(m)).data;
  assert.strictEqual(d.cobrado.importe_centimos, null);
  assert.strictEqual(d.cobrado.estado, 'NO_CONSTA');
  assert.strictEqual(d.saldo_centimos, null, 'sin cobro no hay saldo');
  assert.strictEqual(d.saldo_estado, 'NO_CONSTA');
  assert.strictEqual(d.pendiente_centimos, null);
});

test('con el cobro confirmado por la pasarela, saldo y pendiente cuadran', async () => {
  const { m } = nuevo({ recibo: { total_centimos: 1863, transaction_id: 'tx-1' } });
  const d = (await ver(m)).data;
  assert.strictEqual(d.cobrado.estado, 'CONFIRMADO_POR_PASARELA');
  assert.strictEqual(d.cobrado.fuente, 'pago-gateway');
  assert.strictEqual(d.saldo_centimos, 0);
  assert.strictEqual(d.pendiente_centimos, 0);
});

test('el cliente final no tiene cuenta (Q01)', async () => {
  const { m, eventos } = nuevo();
  const r = await ver(m, { parte: 'cliente' });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'NO_ES_PARTE');
  assert.strictEqual(eventos('cuenta-parte.ver.failed').length, 1);
});

test('la cuenta de una parte de otra plaza no se puede pedir desde aquí', async () => {
  const { m } = nuevo({ devengo: { ...DEVENGO, parte_id: 'rider-bea' } });
  const r = await ver(m);
  assert.strictEqual(r.status, 404, 'en esta plaza no tiene devengo');
  assert.ok(/esta plaza|devengo/.test(r.error.message));
});

test('la cartera separa ganado, reclamado y pendiente (Q30) y no estima nada', async () => {
  const { m } = nuevo({
    actas: {
      'ped-1': { completa: true, entrega: { hora: '2026-11-02T10:00:00Z' }, prueba: { falta: false, tipo: 'foto' } },
      'ped-2': { completa: false, entrega: { hora: '2026-11-03T10:00:00Z' }, prueba: { falta: true, motivo: 'sin cobertura' } }
    },
    cargos: []
  });
  const r = await m.onCarteraRequest({ request_id: 'c', data: { project_id: PLAZA, rider_id: 'rider-ana', periodo: PERIODO } });
  assert.strictEqual(r.status, 200);
  const c = r.data;
  assert.strictEqual(c.ganado_centimos, 450, 'sólo el que tiene prueba');
  assert.strictEqual(c.reclamado_centimos, 500, 'entregado sin prueba: reclamado, no ganado');
  assert.strictEqual(c.pendiente_centimos, 0);
  assert.strictEqual(c.cuota_centimos, 1863);
  assert.strictEqual(c.neto_centimos, 450 - 1863, 'neto = ganado − cuota − deudas');
  assert.strictEqual(c.neto_estado, 'SUMA');
  assert.strictEqual(c.cartera, 'esta plaza');
  assert.ok(/no hay propinas/.test(c.no_estima));
});

test('sin acta del reparto no se presume: el pedido no suma a nada', async () => {
  const { m } = nuevo({ actas: {} });
  const c = (await m.onCarteraRequest({ request_id: 'c', data: { project_id: PLAZA, rider_id: 'rider-ana', periodo: PERIODO } })).data;
  assert.strictEqual(c.ganado_centimos, null, 'sin acta no consta el ganado');
  assert.strictEqual(c.neto_centimos, null, 'sin un término no hay neto');
  assert.strictEqual(c.neto_estado, 'NO_CONSTA');
  assert.strictEqual(c.pedidos[0].clasificacion, 'SIN_ACTA');
});

test('un rider en otra plaza tiene su cartera en la suya, no aquí', async () => {
  const { m } = nuevo();
  const r = await m.onCarteraRequest({ request_id: 'c', data: { project_id: PLAZA, rider_id: 'rider-bea' } });
  assert.strictEqual(r.status, 404);
  assert.ok(/una cartera por plaza/.test(r.error.message));
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

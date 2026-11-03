'use strict';

/**
 * bocaos/cobro-gestion — H04. La cuota cobrada por el canal de la parte, sobre `pago-gateway`.
 *
 * Lo que se vigila:
 *   1. Cobra LO SUYO: documento de cuota de una parte (tienda/rider), con importe. Nada de comida.
 *   2. El canal lo declara la parte; sin canal no hay cobro, hay fallo con hueco.
 *   3. Un importe que no cuadra NO se da por cobrado.
 *   4. Un cobro fallido no toca el devengo.
 *   5. La vuelta: autor + motivo + sólo antes de liquidar; y no se devuelve dos veces.
 *
 * Ejecutar: node tests/unit/bocaos__cobro-gestion.test.js
 */

const assert = require('assert');
const CobroGestion = require('../../modules/bocaos/cobro-gestion/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const DOC = {
  documento_id: 'fc-aaaa111111',
  cierre_id: 'li-1',
  periodo: '2026-W45',
  plaza_id: PLAZA,
  parte_id: 'rider-ana',
  parte: 'rider',
  tipo: 'ORDINARIA',
  total_centimos: 1963,
  cobrable: true,
  lineas: [{ concepto: 'céntimos por pedido aceptado', importe_centimos: 1963 }]
};

function nuevo({ canal = 'transferencia', cierre = null, revertir = { status: 200, data: { monto_centimos: 1963, transaction_id: 'tx-1', via: 'reembolso' } } } = {}) {
  const publicados = [];
  const m = new CobroGestion();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => {
    if (ev === 'estado-parte.de.request') {
      if (!canal) return { status: 404, error: { code: 'NO_CONSTA' } };
      return { status: 200, data: { parte: { parte_id: payload.parte_id, canal_cobro: canal } } };
    }
    if (ev === 'liquidacion.de.request') {
      return { status: 200, data: { periodo: payload.periodo, cierre } };
    }
    if (ev === 'pago.revertir.request') return revertir;
    return null;
  };
  return { m, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const emitido = (m, extra) => m.onDocumentoEmitido({ data: { ...DOC, ...extra } });
const confirmar = (m, extra) => m.onPagoConfirmado({ data: { referencia: DOC.documento_id, monto_centimos: 1963, transaction_id: 'tx-1', ...extra } });

test('el documento de la cuota se cobra por el canal que la parte declaró', async () => {
  const { m, eventos } = nuevo({ canal: 'transferencia' });
  await emitido(m);
  const pedidos = eventos('pago.iniciar.request');
  assert.strictEqual(pedidos.length, 1);
  assert.strictEqual(pedidos[0].p.referencia, DOC.documento_id);
  assert.strictEqual(pedidos[0].p.monto_centimos, 1963);
  assert.strictEqual(pedidos[0].p.canal, 'transferencia', 'el canal es el que ella declaró (H04)');

  await confirmar(m);
  const c = eventos('bocaos.cobro_confirmado');
  assert.strictEqual(c.length, 1);
  assert.strictEqual(c[0].p.documento_id, DOC.documento_id);
  assert.strictEqual(c[0].p.estado, 'CONFIRMADO');
  assert.strictEqual(c[0].p.cambia_lo_devengado, false);
});

test('sin canal declarado no se elige por ella: fallo con hueco', async () => {
  const { m, eventos } = nuevo({ canal: null });
  await emitido(m);
  assert.strictEqual(eventos('pago.iniciar.request').length, 0);
  const f = eventos('bocaos.cobro_fallido');
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].p.code, 'SIN_CANAL');
  assert.strictEqual(f[0].p.hueco, 'canal_cobro');
});

test('el cliente final no tiene cuenta: un documento suyo no se cobra por aquí (H06)', async () => {
  const { m, eventos } = nuevo();
  await emitido(m, { parte: 'cliente' });
  assert.strictEqual(eventos('pago.iniciar.request').length, 0);
  assert.strictEqual(eventos('bocaos.cobro_fallido')[0].p.code, 'NO_ES_LA_CUOTA');
});

test('un documento incompleto (sin base) no se cobra, y se dice por qué', async () => {
  const { m, eventos } = nuevo();
  await emitido(m, { total_centimos: null, cobrable: false, motivo_no_cobrable: 'la parte del fijo no consta (Q26)' });
  assert.strictEqual(eventos('pago.iniciar.request').length, 0);
  const f = eventos('bocaos.cobro_fallido')[0].p;
  assert.strictEqual(f.code, 'DOCUMENTO_INCOMPLETO');
  assert.ok(/Q26/.test(f.motivo));
});

test('un importe que no cuadra NO se da por cobrado; y la discrepancia se ve', async () => {
  const { m, eventos } = nuevo();
  await emitido(m);
  await confirmar(m, { monto_centimos: 1000 });
  assert.strictEqual(eventos('bocaos.cobro_confirmado').length, 0, 'no se confirma lo que no cuadra');

  await m.onPagoImporteDiscrepante({ data: {
    referencia: DOC.documento_id, esperado_centimos: 1963, recibido_centimos: 1000
  } });
  const f = eventos('bocaos.cobro_fallido');
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].p.code, 'IMPORTE_DISCREPANTE');
  assert.strictEqual(f[0].p.esperado_centimos, 1963);
  assert.strictEqual(f[0].p.recibido_centimos, 1000);
});

test('un cobro fallido no toca el devengo; y el reembolso es transición del mismo cobro', async () => {
  const { m, eventos } = nuevo();
  await emitido(m);
  await m.onPagoRechazado({ data: { referencia: DOC.documento_id, code: 'TARJETA_RECHAZADA', monto_centimos: 1963 } });
  const f = eventos('bocaos.cobro_fallido')[0].p;
  assert.strictEqual(f.code, 'TARJETA_RECHAZADA');
  assert.strictEqual(f.cambia_lo_devengado, false);

  await confirmar(m);
  await m.onPagoReembolsado({ data: { referencia: DOC.documento_id, monto_centimos: 1963, completo: true, transaction_id: 'tx-1' } });
  const transiciones = eventos('bocaos.cobro_confirmado');
  assert.strictEqual(transiciones.length, 2);
  assert.strictEqual(transiciones[1].p.estado, 'REEMBOLSADO');
  assert.strictEqual(transiciones[1].p.documento_id, transiciones[0].p.documento_id, 'el mismo agregado, no un hecho nuevo');
});

test('un documento se cobra una vez aunque el hecho se repita', async () => {
  const { m, eventos } = nuevo();
  await emitido(m);
  await emitido(m);
  assert.strictEqual(eventos('pago.iniciar.request').length, 1);
});

test('revertir exige autor, motivo y un cobro que exista', async () => {
  const { m, eventos } = nuevo();
  await emitido(m);
  await confirmar(m);

  const sinAutor = await m.onRevertirRequest({ request_id: 'r1', data: { referencia: DOC.documento_id, motivo: 'x' } });
  assert.strictEqual(eventos('pago.revertir.response')[0].p.status, 403);
  assert.strictEqual(eventos('pago.revertir.response')[0].p.error.code, 'SIN_AUTOR');

  const sinMotivo = await m.onRevertirRequest({ request_id: 'r2', data: { referencia: DOC.documento_id, autor: 'duena' } });
  assert.strictEqual(eventos('pago.revertir.response')[1].p.error.code, 'INVALID_INPUT');
  assert.strictEqual(sinAutor, null, 'la op contesta en el bus, no por el return');
  assert.ok(sinMotivo === null);
});

test('no se revierte un cobro que no está cobrado, ni después de cerrar el ciclo', async () => {
  const sinCobro = nuevo();
  await emitido(sinCobro.m);
  await sinCobro.m.onRevertirRequest({ request_id: 'r', data: { referencia: DOC.documento_id, autor: 'duena', motivo: 'error' } });
  assert.strictEqual(sinCobro.eventos('pago.revertir.response')[0].p.error.code, 'NO_COBRADO');

  const cerrado = nuevo({ cierre: { cierre_id: 'li-1', estado: 'CERRADO' } });
  await emitido(cerrado.m);
  await confirmar(cerrado.m);
  await cerrado.m.onRevertirRequest({ request_id: 'r2', data: { referencia: DOC.documento_id, autor: 'duena', motivo: 'error' } });
  const r = cerrado.eventos('pago.revertir.response')[0].p;
  assert.strictEqual(r.error.code, 'CIERRE_CERRADO');
  assert.ok(/H02/.test(r.error.message));
});

test('la vuelta, antes de liquidar: se pide al órgano y se devuelve la constancia', async () => {
  const { m, eventos } = nuevo();
  await emitido(m);
  await confirmar(m);
  await m.onRevertirRequest({ request_id: 'r-origen', data: {
    referencia: DOC.documento_id, autor: 'duena', motivo: 'el dictamen compensa al rider'
  } });

  const resp = eventos('pago.revertir.response').slice(-1)[0].p;
  assert.strictEqual(resp.request_id, 'r-origen', 'la respuesta va con el request_id de quien pidió');
  assert.strictEqual(resp.status, 200);
  assert.strictEqual(resp.reemitido_por, 'cobro-gestion');

  const c = eventos('bocaos.cobro_confirmado').slice(-1)[0].p;
  assert.strictEqual(c.estado, 'REEMBOLSADO');
  assert.strictEqual(c.autor, 'duena');
  assert.strictEqual(c.motivo, 'el dictamen compensa al rider');
});

test('un timeout de la vuelta es ESTADO INCIERTO: no se da por hecha', async () => {
  const { m, eventos } = nuevo({ revertir: null });
  await emitido(m);
  await confirmar(m);
  await m.onRevertirRequest({ request_id: 'r', data: { referencia: DOC.documento_id, autor: 'duena', motivo: 'error' } });
  const resp = eventos('pago.revertir.response')[0].p;
  assert.strictEqual(resp.error.code, 'ESTADO_INCIERTO');
  assert.strictEqual(eventos('bocaos.cobro_confirmado').filter((x) => x.p.estado === 'REEMBOLSADO').length, 0);
});

test('no se muerde la cola: su propia reversión no se reenvía ni se re-anota', async () => {
  const { m, eventos } = nuevo();
  await emitido(m);
  await confirmar(m);
  const antes = eventos('bocaos.cobro_confirmado').length;
  await m.onPagoRevertirResponse({ data: { request_id: 'r', reemitido_por: 'cobro-gestion', status: 200 } });
  assert.strictEqual(eventos('bocaos.cobro_confirmado').length, antes);
  await m.onRevertirRequest({ request_id: 'r', data: { referencia: DOC.documento_id, via: 'cobro-gestion' } });
  assert.strictEqual(eventos('pago.revertir.response').length, 0, 'su propio reenvío no se reenvía');
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

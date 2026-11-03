'use strict';

/**
 * bocaos/accion-sancion — P03. La sanción con autor, motivo, plazo y acta; y sus límites.
 *
 * Lo que se vigila:
 *   1. Sin firmante → 403. Sin acta → 409. Sin motivo o sin plazo → 400.
 *   2. «Tasa de rechazo» no es una falta (A21).
 *   3. No corta pedidos en vuelo ni propuestas vivas, y no toca el dinero (H05/H06).
 *   4. Se revoca con motivo y autor: transición del mismo hecho, no borrado.
 *   5. Una sanción vencida sigue en el histórico.
 *
 * Ejecutar: node tests/unit/bocaos__accion-sancion.test.js
 */

const assert = require('assert');
const AccionSancion = require('../../modules/bocaos/accion-sancion/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const FUTURO = '2026-12-31T23:59:59.000Z';

function nuevo() {
  const publicados = [];
  const m = new AccionSancion();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async () => null;
  return { m, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const aplicar = (m, extra) => m.onAplicarRequest({
  request_id: 'a',
  data: {
    project_id: PLAZA, parte_id: 'rider-ana', motivo: 'no entregó el pedido y no dio aviso',
    plazo: FUTURO, acta: 'acta-7', firmante: { id: 'duena-plaza' }, ...extra
  }
});

test('aplica la sanción con su acta, su firmante y su alcance escrito', async () => {
  const { m, eventos } = nuevo();
  const r = await aplicar(m);
  assert.strictEqual(r.status, 201);
  const s = r.data.sancion;
  assert.strictEqual(s.acta, 'acta-7');
  assert.strictEqual(s.firmante, 'duena-plaza');
  assert.strictEqual(s.alcance.corta, 'entrada_de_pedidos_nuevos');
  assert.strictEqual(s.alcance.pedidos_en_vuelo, false);
  assert.strictEqual(s.alcance.toca_dinero, false);

  const h = eventos('bocaos.parte_sancionada')[0].p;
  assert.strictEqual(h.estado, 'ACTIVA');
  assert.strictEqual(h.transicion, 'aplicada');
  assert.strictEqual(h.alcance.propuestas_vivas, false);
});

test('sin firmante no hay sanción: 403 (P03)', async () => {
  const { m, eventos } = nuevo();
  const r = await aplicar(m, { firmante: null });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.error.code, 'SIN_FIRMANTE');
  assert.strictEqual(eventos('bocaos.parte_sancionada').length, 0);
});

test('sin acta tampoco: 409 SIN_ACTA', async () => {
  const { m } = nuevo();
  const r = await aplicar(m, { acta: null });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'SIN_ACTA');
});

test('sancionar por tasa de rechazo no tiene camino: rechazar es un derecho (A21)', async () => {
  const { m, eventos } = nuevo();
  const porCausa = await aplicar(m, { causa: 'tasa_rechazo' });
  assert.strictEqual(porCausa.status, 409);
  assert.strictEqual(porCausa.error.code, 'NO_ES_UNA_FALTA');

  const porTexto = await aplicar(m, { motivo: 'su tasa de rechazo es altísima' });
  assert.strictEqual(porTexto.status, 409);
  assert.strictEqual(porTexto.error.code, 'NO_ES_UNA_FALTA');
  assert.strictEqual(eventos('bocaos.parte_sancionada').length, 0);
});

test('no corta lo que está en vuelo, ni retira propuestas, ni toca el dinero (H05/H06)', async () => {
  const { m, eventos } = nuevo();
  for (const [extra, code] of [
    [{ cortar_en_vuelo: true }, 'NO_CORTA_LO_EN_VUELO'],
    [{ retirar_propuestas: true }, 'NO_RETIRA_PROPUESTAS'],
    [{ tocar_dinero: true }, 'NO_TOCA_EL_DINERO']
  ]) {
    const r = await aplicar(m, extra);
    assert.strictEqual(r.status, 409, JSON.stringify(extra));
    assert.strictEqual(r.error.code, code);
  }
  assert.strictEqual(eventos('bocaos.parte_sancionada').length, 0, 'no se aplica a medias');
});

test('sin plazo es un destierro: 400', async () => {
  const { m } = nuevo();
  const r = await aplicar(m, { plazo: null });
  assert.strictEqual(r.status, 400);
  assert.ok(/plazo/.test(r.error.message));
});

test('revocar deja rastro: transición del mismo hecho, no borrado', async () => {
  const { m, eventos } = nuevo();
  const s = (await aplicar(m)).data.sancion;
  const r = await m.onRevocarRequest({ request_id: 'r', data: {
    project_id: PLAZA, sancion_id: s.sancion_id, autor: 'duena-plaza', motivo: 'apareció la prueba de la entrega'
  } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.sancion.estado, 'REVOCADA');
  assert.strictEqual(r.data.sancion.revocada_por, 'duena-plaza');
  assert.strictEqual(r.data.sancion.motivo_revocacion, 'apareció la prueba de la entrega');

  const hechos = eventos('bocaos.parte_sancionada');
  assert.strictEqual(hechos.length, 2, 'sigue estando la de la aplicación');
  assert.strictEqual(hechos[1].p.transicion, 'revocada');
  assert.strictEqual(hechos[1].p.sancion_id, hechos[0].p.sancion_id, 'el mismo hecho, otra transición');
});

test('revocar sin autor o sin motivo no revoca', async () => {
  const { m } = nuevo();
  const s = (await aplicar(m)).data.sancion;
  const sinAutor = await m.onRevocarRequest({ request_id: 'r', data: { project_id: PLAZA, sancion_id: s.sancion_id, motivo: 'x' } });
  assert.strictEqual(sinAutor.status, 403);
  const sinMotivo = await m.onRevocarRequest({ request_id: 'r2', data: { project_id: PLAZA, sancion_id: s.sancion_id, autor: 'duena' } });
  assert.strictEqual(sinMotivo.status, 400);
});

test('un dictamen sólo revoca si NOMBRA la sanción', async () => {
  const { m, eventos } = nuevo();
  const s = (await aplicar(m)).data.sancion;

  await m.onDictamenFirmado({ data: { project_id: PLAZA, dictamen_id: 'dt-1', motivo: 'genérico' } });
  assert.strictEqual(eventos('bocaos.parte_sancionada').length, 1, 'un dictamen que no la nombra no es un indulto');

  await m.onDictamenFirmado({ data: {
    project_id: PLAZA, dictamen_id: 'dt-2', sancion_id: s.sancion_id,
    motivo: 'la sanción se aplicó con el acta equivocada', firmante: { id: 'sala-1' }
  } });
  const h = eventos('bocaos.parte_sancionada').slice(-1)[0].p;
  assert.strictEqual(h.estado, 'REVOCADA');
  assert.strictEqual(h.revocada_via, 'dictamen');
  assert.strictEqual(h.revocada_por, 'sala-1');
});

test('una sanción vencida no se borra: deja de estar vigente y sigue en el histórico', async () => {
  const { m } = nuevo();
  await aplicar(m, { plazo: '2026-01-02T00:00:00.000Z' });
  await aplicar(m, { motivo: 'otra cosa', plazo: FUTURO });
  const r = await m.onDeRequest({ request_id: 'd', data: { project_id: PLAZA, parte_id: 'rider-ana' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.sanciones.length, 2);
  assert.strictEqual(r.data.sanciones[0].estado_efectivo, 'VENCIDA');
  assert.strictEqual(r.data.sanciones[1].estado_efectivo, 'ACTIVA');
  assert.strictEqual(r.data.activa, true);
  assert.deepStrictEqual(r.data.limites, { pedidos_en_vuelo: false, propuestas_vivas: false, toca_dinero: false });
});

test('la misma sanción dos veces no son dos sanciones', async () => {
  const { m, eventos } = nuevo();
  const a = await aplicar(m);
  const b = await aplicar(m);
  assert.strictEqual(a.status, 201);
  assert.strictEqual(b.status, 200);
  assert.strictEqual(b.data.idempotente, true);
  assert.strictEqual(eventos('bocaos.parte_sancionada').length, 1);
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

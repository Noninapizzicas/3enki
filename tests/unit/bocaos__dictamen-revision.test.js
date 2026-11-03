'use strict';

/**
 * bocaos/dictamen-revision — O04. La firma humana del mercado.
 *
 * Lo que se vigila:
 *   1. Tres efectos permitidos; rehacer la propuesta es 422.
 *   2. Sin firmante no hay dictamen; sin motivo tampoco.
 *   3. La firma dice el ámbito: no firma quien no es de ahí, y el nacional no dictamina lo ajeno.
 *   4. Un caso ya dictaminado no se vuelve a firmar.
 *   5. Cambiar la regla no reescribe el pasado.
 *
 * Ejecutar: node tests/unit/bocaos__dictamen-revision.test.js
 */

const assert = require('assert');
const DictamenRevision = require('../../modules/bocaos/dictamen-revision/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const CASO = { caso_id: 'dp-1', tipo: 'disputa', parte_id: 'rider-ana', pedido_id: 'ped-1', ambito: 'plaza', traza: { cargo_id: 'cg-1' }, plazo: '2026-11-20T18:00:00.000Z' };

function nuevo() {
  const publicados = [];
  const m = new DictamenRevision();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async () => null;
  return { m, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const encolar = (m, extra) => m.onCasoEncolado({ data: { project_id: PLAZA, caso_id: CASO.caso_id, ...CASO, ...extra } });
const firmar = (m, extra) => m.onFirmarRequest({
  request_id: 'f',
  data: {
    project_id: PLAZA, caso_id: 'dp-1', efecto: 'compensar',
    motivo: 'el rider esperó 11 minutos sin culpa',
    firmante: { id: 'duena-plaza', ambito: 'plaza', rol: 'jefe' },
    importe_centimos: 300, a_quien: 'rider-ana',
    ...extra
  }
});

test('firma con efecto permitido, hora, firmante y lo que NO alcanza', async () => {
  const { m, eventos } = nuevo();
  await encolar(m);
  const r = await firmar(m);
  assert.strictEqual(r.status, 201);
  const d = r.data.dictamen;
  assert.strictEqual(d.efecto, 'compensar');
  assert.strictEqual(d.firmante.id, 'duena-plaza');
  assert.ok(d.firmado_en);
  assert.strictEqual(d.rehace_propuesta, false);
  assert.strictEqual(d.efecto_aplicado.toca_dinero, true);
  assert.strictEqual(d.efecto_aplicado.importe_centimos, 300);

  const h = eventos('bocaos.dictamen_firmado')[0].p;
  assert.strictEqual(h.efecto, 'compensar');
  assert.strictEqual(h.rehace_propuesta, false);
  assert.ok(h.no_alcanza.some((x) => /propuesta/.test(x)));
});

test('rehacer la propuesta no es un efecto: 422 (el humano no es un planificador)', async () => {
  const { m, eventos } = nuevo();
  await encolar(m);
  for (const efecto of ['rehacer_propuesta', 'rehacer', 'reasignar']) {
    const r = await firmar(m, { efecto });
    assert.strictEqual(r.status, 422, efecto);
    assert.strictEqual(r.error.code, 'EFECTO_PROHIBIDO');
  }
  const otro = await firmar(m, { efecto: 'lo_que_sea' });
  assert.strictEqual(otro.error.code, 'EFECTO_NO_DECLARADO');
  assert.strictEqual(eventos('bocaos.dictamen_firmado').length, 0);
});

test('sin firmante no hay dictamen; sin motivo, tampoco', async () => {
  const { m, eventos } = nuevo();
  await encolar(m);
  const sinFirmante = await firmar(m, { firmante: null });
  assert.strictEqual(sinFirmante.status, 403);
  assert.strictEqual(sinFirmante.error.code, 'SIN_FIRMANTE');

  const sinMotivo = await firmar(m, { motivo: ' ' });
  assert.strictEqual(sinMotivo.status, 400);
  assert.strictEqual(eventos('bocaos.dictamen_firmado').length, 0);
});

test('la firma dice el ámbito: ni el nacional dictamina una plaza, ni el dueño firma una tienda', async () => {
  const { m, eventos } = nuevo();
  await encolar(m);
  const nacional = await firmar(m, { firmante: { id: 'fed-1', ambito: 'nacional' } });
  assert.strictEqual(nacional.status, 403);
  assert.strictEqual(nacional.error.code, 'FIRMA_FUERA_DE_AMBITO');

  await encolar(m, { caso_id: 'dp-2', ambito: 'tienda' });
  const plazaEnTienda = await firmar(m, { caso_id: 'dp-2', firmante: { id: 'duena-plaza', ambito: 'plaza' } });
  assert.strictEqual(plazaEnTienda.status, 403);
  assert.strictEqual(eventos('bocaos.dictamen_firmado').length, 0);
});

test('un caso ya dictaminado no se vuelve a firmar con otro efecto', async () => {
  const { m, eventos } = nuevo();
  await encolar(m);
  assert.strictEqual((await firmar(m)).status, 201);
  const segundo = await firmar(m, { efecto: 'cambiar_regla_adelante', motivo: 'mejor así' });
  assert.strictEqual(segundo.status, 409);
  assert.strictEqual(segundo.error.code, 'YA_DICTAMINADO');
  assert.strictEqual(eventos('bocaos.dictamen_firmado').length, 1);
});

test('cambiar la regla es HACIA ADELANTE: no aplica a lo pasado y no reabre el cierre', async () => {
  const { m } = nuevo();
  await encolar(m);
  const r = await firmar(m, { efecto: 'cambiar_regla_adelante', regla: { espera_min: 3 }, desde: '2026-11-10T00:00:00.000Z' });
  assert.strictEqual(r.status, 201);
  const d = r.data.dictamen;
  assert.strictEqual(d.efecto_aplicado.aplica_a_lo_pasado, false);
  assert.strictEqual(d.efecto_aplicado.desde, '2026-11-10T00:00:00.000Z');
  assert.strictEqual(d.reabre_cierre, false);
  assert.strictEqual(d.efecto_aplicado.toca_dinero, false);
});

test('corregir un histórico deja nota para el periodo siguiente, no reescribe el cerrado', async () => {
  const { m } = nuevo();
  await encolar(m);
  const d = (await firmar(m, { efecto: 'corregir_historico', corrige: 'la espera N1 se midió con la hora de salida' })).data.dictamen;
  assert.strictEqual(d.efecto_aplicado.nota_en_periodo_siguiente, true);
  assert.strictEqual(d.reabre_cierre, false);
});

test('un caso que no está en esta revisión no se firma (O03)', async () => {
  const { m, eventos } = nuevo();
  const r = await firmar(m, { caso_id: 'dp-ajeno' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.code, 'CASO_NO_CONSTA');
  assert.strictEqual(eventos('bocaos.dictamen_firmado').length, 0);
});

test('de: el dictamen o el estado de revisión del caso', async () => {
  const { m } = nuevo();
  await encolar(m);
  const pendiente = await m.onDeRequest({ request_id: 'd', data: { project_id: PLAZA, caso_id: 'dp-1' } });
  assert.strictEqual(pendiente.data.estado, 'PENDIENTE');
  assert.strictEqual(pendiente.data.dictamen, null);

  const firmado = await firmar(m);
  const despues = await m.onDeRequest({ request_id: 'd2', data: { project_id: PLAZA, caso_id: 'dp-1' } });
  assert.strictEqual(despues.data.estado, 'DICTAMINADO');
  assert.strictEqual(despues.data.dictamen.dictamen_id, firmado.data.dictamen.dictamen_id);
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

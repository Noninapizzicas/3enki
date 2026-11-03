'use strict';

/**
 * bocaos/incidencia-reparto — F06.
 *
 * Lo que se vigila:
 *   1. Un caso se abre con relato LIBRE + autor + hora. Sin autor, 400: un caso anónimo no se contesta.
 *   2. NO clasifica: el hecho sale con tipo null, gravedad null y `clasificado: false` (eso es F07).
 *   3. NO crea deuda: `crea_deuda: false`. La deuda la crea G04 con evidencia.
 *   4. La traza se PIDE (acta a hechos-reparto) y crece con los hechos oídos, sin abrir otro caso.
 *   5. No escribe: el caso es un hecho del bus y su dueño es la cola.
 *
 * Ejecutar: node tests/unit/bocaos__incidencia-reparto.test.js
 */

const assert = require('assert');
const IncidenciaReparto = require('../../modules/bocaos/incidencia-reparto/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const PEDIDO = 'ped-1';
const RELATO = 'El cliente no bajaba y no encontraba el portal';
const HORA = '2026-11-03T13:55:00.000Z';

function nuevo({ acta = { status: 200, data: { completa: false, faltan: ['prueba o su falta declarada'] } } } = {}) {
  const publicados = [];
  const pedidas = [];
  const m = new IncidenciaReparto();
  m.name = 'incidencia-reparto';
  m.plaza_id = PLAZA;
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => { pedidas.push({ ev, payload }); return ev === 'hechos-reparto.acta.request' ? acta : null; };
  return { m, pedidas, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const abrir = (m, extra = {}) => m.onAbrirRequest({ request_id: 'a1', data: {
  project_id: PLAZA, plaza_id: PLAZA, pedido_id: PEDIDO, relato: RELATO, autor: 'rd-1', hora: HORA, ...extra
} });

test('abre el caso con relato, autor y hora, y lo publica como hecho', async () => {
  const { m, eventos } = nuevo();
  const r = await abrir(m);
  assert.strictEqual(r.status, 201, JSON.stringify(r));

  const hechos = eventos('bocaos.incidencia_abierta');
  assert.strictEqual(hechos.length, 1);
  const p = hechos[0].p;
  assert.strictEqual(p.pedido_id, PEDIDO);
  assert.strictEqual(p.relato, RELATO, 'el relato va tal cual: es de quien lo escribió');
  assert.strictEqual(p.autor, 'rd-1');
  assert.strictEqual(p.hora, HORA);
  assert.strictEqual(p.plaza_id, PLAZA);
  assert.ok(p.incidencia_id.startsWith('inc-'), p.incidencia_id);
});

test('NO clasifica: sin tipo, sin gravedad, `clasificado: false`', async () => {
  const { m, eventos } = nuevo();
  await abrir(m, { tipo: 'grave', gravedad: 'alta' });   // aunque lo manden, no se copia
  const p = eventos('bocaos.incidencia_abierta')[0].p;
  assert.strictEqual(p.tipo, null);
  assert.strictEqual(p.gravedad, null);
  assert.strictEqual(p.clasificado, false);
  assert.ok(p.sin_clasificar.includes('F07'));
});

test('la incidencia NO crea deuda: la crea G04 con evidencia', async () => {
  const { m, eventos } = nuevo();
  await abrir(m);
  assert.strictEqual(eventos('bocaos.incidencia_abierta')[0].p.crea_deuda, false);
});

test('relato sin autor: 400, no hay caso', async () => {
  const { m, eventos } = nuevo();
  const r = await m.onAbrirRequest({ request_id: 'x', data: { project_id: PLAZA, pedido_id: PEDIDO, relato: RELATO } });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'autor');
  assert.strictEqual(eventos('bocaos.incidencia_abierta').length, 0);
  assert.strictEqual(eventos('incidencia-reparto.abrir.failed').length, 1);
});

test('sin relato no se redacta uno por nadie: 400', async () => {
  const { m, eventos } = nuevo();
  const r = await m.onAbrirRequest({ request_id: 'x', data: { project_id: PLAZA, pedido_id: PEDIDO, autor: 'rd-1' } });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'relato');
  assert.strictEqual(eventos('bocaos.incidencia_abierta').length, 0);
});

test('la traza se PIDE al custodio del reparto y dice si el acta está incompleta', async () => {
  const { m, pedidas, eventos } = nuevo();
  await abrir(m);
  assert.ok(pedidas.some((x) => x.ev === 'hechos-reparto.acta.request' && x.payload.pedido_id === PEDIDO));
  const traza = eventos('bocaos.incidencia_abierta')[0].p.traza;
  assert.strictEqual(traza.acta.completa, false);
  assert.deepStrictEqual(traza.acta.faltan, ['prueba o su falta declarada']);
  assert.ok(traza.huecos.some((h) => h.includes('acta incompleta')));
});

test('la traza crece con la entrega posterior, sin abrir otro caso', async () => {
  const { m, eventos } = nuevo();
  const r1 = await abrir(m, { incidencia_id: 'inc-1' });
  assert.strictEqual(r1.status, 201);

  // La entrega llega después de abrir el caso.
  await m.onHechoRepartoAnotado({ data: {
    pedido_id: PEDIDO, plaza_id: PLAZA, tipo: 'entrega', hora: '2026-11-03T14:10:00.000Z', autor: 'rd-1'
  } });

  const r2 = await abrir(m, { incidencia_id: 'inc-1' });
  assert.strictEqual(r2.status, 200);
  assert.strictEqual(r2.data.idempotente, true);
  assert.strictEqual(r2.data.incidencia.traza.hechos.length, 1, 'la traza creció');
  assert.strictEqual(r2.data.incidencia.traza.hechos[0].tipo, 'entrega');
  assert.strictEqual(eventos('bocaos.incidencia_abierta').length, 1, 'un caso, un hecho');
});

test('un hecho del reparto NO abre un caso por su cuenta: eso sería decidir que algo no salió', async () => {
  const { m, eventos } = nuevo();
  await m.onHechoRepartoAnotado({ data: { pedido_id: PEDIDO, plaza_id: PLAZA, tipo: 'espera', hora: HORA } });
  assert.strictEqual(eventos('bocaos.incidencia_abierta').length, 0);
});

test('el autor puede ser un objeto de parte: el mismo dato, no otro', async () => {
  const { m, eventos } = nuevo();
  await abrir(m, { autor: { parte_id: 'rd-9', rol: 'rider' } });
  assert.strictEqual(eventos('bocaos.incidencia_abierta')[0].p.autor, 'rd-9');
});

test('no escribe: el caso es un hecho del bus', () => {
  const { m } = nuevo();
  assert.strictEqual(m._path, null);
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

'use strict';

/**
 * bocaos/hecho-listo — A01 (el hecho de listo, sellado por la plaza y desmentible).
 *
 * Lo que se vigila:
 *   1. el hecho sale al bus con TODO el dato dentro (hora, precio, punto, sello de la plaza).
 *   2. sin precio congelado NO hay hecho: A34, hueco nombrado, y no se publica pedido_listo.
 *   3. un pedido de otra plaza no entra: 403 PLAZA_AJENA (A35).
 *   4. dos anotaciones del mismo pedido → 409; corregir es DESMENTIR y las DOS horas quedan.
 *
 * Ejecutar: node tests/unit/bocaos__hecho-listo.test.js
 */

const assert = require('assert');
const HechoListo = require('../../modules/bocaos/hecho-listo/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevo(plaza = 'plaza-malaga') {
  const publicados = [];
  const m = new HechoListo();
  m.plaza_id = plaza;
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async () => null;
  return { m, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const PRECIO = { total_cents: 1850, reparto_cents: 450 };

function declaracion(extra = {}) {
  return {
    project_id: 'plaza-malaga',
    pedido_id: 'ped-1',
    plaza_id: 'plaza-malaga',
    tienda_id: 'tienda-paco',
    hora_listo: '2026-11-03T21:05:00.000Z',
    precio_congelado: PRECIO,
    punto: { lat: 36.72, lng: -4.42 },
    ...extra
  };
}

test('el hecho sale al bus con el dato dentro y con el sello de la plaza', async () => {
  const { m, eventos } = nuevo();
  const r = await m.onAnotarRequest({ request_id: 'e1', data: declaracion() });

  assert.strictEqual(r.status, 201);
  const hechos = eventos('bocaos.pedido_listo');
  assert.strictEqual(hechos.length, 1);
  const h = hechos[0].p;
  assert.strictEqual(h.pedido_id, 'ped-1');
  assert.strictEqual(h.plaza_id, 'plaza-malaga', 'el sello lo pone la plaza');
  assert.strictEqual(h.hora_listo, '2026-11-03T21:05:00.000Z');
  assert.deepStrictEqual(h.precio_congelado, PRECIO);
  assert.deepStrictEqual(h.punto, { lat: 36.72, lng: -4.42 });
  assert.ok(/^hl-/.test(h.hecho_id));
});

test('sin precio congelado no hay hecho: hueco nombrado y nada en el bus', async () => {
  const { m, eventos } = nuevo();
  const sinPrecio = declaracion();
  delete sinPrecio.precio_congelado;

  const r = await m.onAnotarRequest({ request_id: 'e2', data: sinPrecio });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'PRECIO_SIN_CONGELAR');
  assert.strictEqual(r.error.details.hueco, 'sin precio congelado');
  assert.strictEqual(eventos('bocaos.pedido_listo').length, 0);

  const de = await m.onDeRequest({ data: { project_id: 'plaza-malaga', pedido_id: 'ped-1' } });
  assert.strictEqual(de.status, 404, 'no hay hecho que consultar');
});

test('el hecho de otra plaza no entra → 403 PLAZA_AJENA', async () => {
  const { m, eventos } = nuevo('plaza-malaga');
  const r = await m.onAnotarRequest({ request_id: 'e3', data: declaracion({ plaza_id: 'plaza-sevilla' }) });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.error.code, 'PLAZA_AJENA');
  assert.strictEqual(eventos('bocaos.pedido_listo').length, 0);
});

test('la tienda declara dos veces → A01 dice 409 (no se corrige, se desmiente)', async () => {
  const { m, eventos } = nuevo();
  await m.onListoDeclarado({ data: declaracion() });
  const r = await m.onListoDeclarado({ data: declaracion({ hora_listo: '2026-11-03T21:40:00.000Z' }) });

  assert.strictEqual(eventos('bocaos.pedido_listo').length, 1);
  const de = await m.onDeRequest({ data: { project_id: 'plaza-malaga', pedido_id: 'ped-1' } });
  assert.strictEqual(de.data.hecho.hora_listo, '2026-11-03T21:05:00.000Z', 'la primera hora sigue vigente');
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'YA_ANOTADO');
});

test('desmentir: dos horas quedan, la nueva rige y el hecho se publica', async () => {
  const { m, eventos } = nuevo();
  await m.onListoDeclarado({ data: declaracion() });
  const r = await m.onDesmentirRequest({
    request_id: 'e4',
    data: { project_id: 'plaza-malaga', pedido_id: 'ped-1', hora_listo: '2026-11-03T21:15:00.000Z', motivo: 'se me fue la mano con la masa' }
  });

  assert.strictEqual(r.status, 200);
  const desmentidos = eventos('bocaos.hecho_desmentido');
  assert.strictEqual(desmentidos.length, 1);
  assert.strictEqual(desmentidos[0].p.hora_anterior, '2026-11-03T21:05:00.000Z');
  assert.strictEqual(desmentidos[0].p.hora_listo, '2026-11-03T21:15:00.000Z');
  assert.strictEqual(desmentidos[0].p.motivo, 'se me fue la mano con la masa');

  const de = await m.onDeRequest({ data: { project_id: 'plaza-malaga', pedido_id: 'ped-1' } });
  assert.strictEqual(de.data.hechos.length, 2, 'las dos horas quedan');
  const horas = de.data.hechos.map((h) => h.hora_listo);
  assert.deepStrictEqual(horas, ['2026-11-03T21:05:00.000Z', '2026-11-03T21:15:00.000Z']);
  assert.strictEqual(de.data.hecho.hora_listo, '2026-11-03T21:15:00.000Z', 'la nueva es la vigente');
});

test('desmentir sin hecho previo → 404 NO_CONSTA', async () => {
  const { m } = nuevo();
  const r = await m.onDesmentirRequest({ request_id: 'e5', data: { project_id: 'plaza-malaga', pedido_id: 'ped-9', hora_listo: '2026-11-03T21:15:00.000Z' } });
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

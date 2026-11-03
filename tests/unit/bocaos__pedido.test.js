'use strict';

/**
 * bocaos/pedido — C02 (estado con tabla cerrada) + C07 (cancelación con quién y hasta cuándo).
 *
 * Lo que se vigila:
 *   1. el pedido nace con precio congelado: sin precio no hay pedido (y se publica .failed).
 *   2. LISTO sin ACEPTADO → TRANSICION_NO_PERMITIDA. La tabla es cerrada.
 *   3. el ciclo entero: RECIBIDO → ACEPTADO → LISTO → EN_REPARTO → ENTREGADO, cada flecha con su hecho.
 *   4. la cancelación: el cliente ya no puede en LISTO; la plaza sí. Fuera de tabla → 409.
 *   5. sólo la tienda dueña acepta (rol y tienda_id), no «alguien con permiso».
 *
 * Ejecutar: node tests/unit/bocaos__pedido.test.js
 */

const assert = require('assert');
const Pedido = require('../../modules/bocaos/pedido/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevo() {
  const publicados = [];
  const m = new Pedido();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async () => null;
  return { m, eventos: (ev) => publicados.filter((x) => x.ev === ev), publicados };
}

const PLAZA = 'plaza-malaga';
const PRECIO = { total_cents: 1850, moneda: 'EUR', reparto_cents: 450 };

function pedidoBase(extra = {}) {
  return {
    project_id: PLAZA,
    pedido: {
      plaza_id: PLAZA,
      tienda_id: 'tienda-paco',
      cliente_id: 'cli-1',
      lineas: [{ sku: 'bocata', cantidad: 2 }],
      precio_congelado: PRECIO,
      oferta_reparto_cents: 450,
      punto: { lat: 36.72, lng: -4.42 },
      ...extra
    }
  };
}

test('el pedido nace con precio congelado y publica su hecho', async () => {
  const { m, eventos } = nuevo();
  const r = await m.onCrearRequest({ request_id: 'r1', data: pedidoBase() });

  assert.strictEqual(r.status, 201);
  assert.ok(/^ped-/.test(r.data.pedido_id), 'la plaza pone el id');
  assert.strictEqual(r.data.estado, 'RECIBIDO');

  const creados = eventos('bocaos.pedido_creado');
  assert.strictEqual(creados.length, 1);
  assert.strictEqual(creados[0].p.plaza_id, PLAZA);
  assert.deepStrictEqual(creados[0].p.precio_congelado, PRECIO);
  assert.strictEqual(creados[0].p.origen, 'pedido');
});

test('sin precio congelado no hay pedido y se publica pedido.crear.failed', async () => {
  const { m, eventos } = nuevo();
  const malo = pedidoBase();
  delete malo.pedido.precio_congelado;

  const r = await m.onCrearRequest({ request_id: 'r2', data: malo });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'PRECIO_SIN_CONGELAR');
  assert.strictEqual(eventos('bocaos.pedido_creado').length, 0, 'no nace ningún pedido');

  const fallos = eventos('pedido.crear.failed');
  assert.strictEqual(fallos.length, 1);
  assert.strictEqual(fallos[0].p.request_id, 'r2');
  assert.strictEqual(fallos[0].p.error.details.hueco, 'sin precio cerrado');
});

test('LISTO sin ACEPTADO → TRANSICION_NO_PERMITIDA (tabla cerrada)', async () => {
  const { m, eventos } = nuevo();
  const r = await m.onCrearRequest({ request_id: 'r3', data: pedidoBase() });

  await m.onListoDeclarado({ data: { project_id: PLAZA, pedido_id: r.data.pedido_id, hora_listo: '2026-11-03T12:00:00.000Z' } });

  const de = await m.onDeRequest({ data: { project_id: PLAZA, pedido_id: r.data.pedido_id } });
  assert.strictEqual(de.data.pedido.estado, 'RECIBIDO', 'la flecha se ignora: no se salta a LISTO');
  assert.strictEqual(eventos('bocaos.pedido_listo').length, 0, 'pedido no publica pedido_listo (eso es A01)');

  // y pedir la transición por la puerta explícita tampoco
  const err = m._transitar(de.data.pedido, 'LISTO', 'tienda', null, 'test');
  assert.strictEqual(err.status, 409);
  assert.strictEqual(err.error.code, 'TRANSICION_NO_PERMITIDA');
});

test('sólo la tienda dueña acepta: rol y tienda_id', async () => {
  const { m, eventos } = nuevo();
  const r = await m.onCrearRequest({ request_id: 'r4', data: pedidoBase() });
  const id = r.data.pedido_id;

  const porPlaza = await m.onAceptarRequest({ request_id: 'r5', data: { project_id: PLAZA, pedido_id: id, rol: 'plaza', tienda_id: 'tienda-paco' } });
  assert.strictEqual(porPlaza.status, 403);
  assert.strictEqual(eventos('bocaos.pedido_aceptado').length, 0);

  const otraTienda = await m.onAceptarRequest({ request_id: 'r6', data: { project_id: PLAZA, pedido_id: id, rol: 'tienda', tienda_id: 'tienda-otra' } });
  assert.strictEqual(otraTienda.status, 403);

  const bueno = await m.onAceptarRequest({ request_id: 'r7', data: { project_id: PLAZA, pedido_id: id, rol: 'tienda', tienda_id: 'tienda-paco' } });
  assert.strictEqual(bueno.status, 200);
  const hechos = eventos('bocaos.pedido_aceptado');
  assert.strictEqual(hechos.length, 1);
  assert.deepStrictEqual(hechos[0].p.precio_congelado, PRECIO, 'el precio viaja en el hecho');
});

test('ciclo completo: RECIBIDO → ACEPTADO → LISTO → EN_REPARTO → ENTREGADO', async () => {
  const { m } = nuevo();
  const r = await m.onCrearRequest({ request_id: 'c1', data: pedidoBase() });
  const id = r.data.pedido_id;

  await m.onAceptarRequest({ data: { project_id: PLAZA, pedido_id: id, rol: 'tienda', tienda_id: 'tienda-paco' } });
  await m.onListoDeclarado({ data: { project_id: PLAZA, pedido_id: id, hora_listo: '2026-11-03T12:00:00.000Z' } });
  await m.onContratoCreado({ data: { project_id: PLAZA, pedido_id: id, contrato_id: 'ct-1', rider_id: 'rid-1', hora_contrato: '2026-11-03T11:58:00.000Z' } });
  await m.onPruebaAnotada({ data: { project_id: PLAZA, pedido_id: id, prueba: { tipo: 'foto' }, hora: '2026-11-03T12:20:00.000Z' } });

  const de = await m.onDeRequest({ data: { project_id: PLAZA, pedido_id: id } });
  assert.strictEqual(de.data.pedido.estado, 'ENTREGADO');
  assert.deepStrictEqual(de.data.pedido.hechos.map((x) => x.estado), ['RECIBIDO', 'ACEPTADO', 'LISTO', 'EN_REPARTO', 'ENTREGADO']);
  assert.strictEqual(de.data.pedido.hora_listo, '2026-11-03T12:00:00.000Z');
  assert.strictEqual(de.data.pedido.rider_id, 'rid-1');

  // terminal: nadie lo saca de ENTREGADO
  const err = m._transitar(de.data.pedido, 'CANCELADO', 'plaza', null, 'test');
  assert.strictEqual(err.status, 409);
});

test('cancelación: el cliente ya no puede en LISTO, la plaza sí; fuera de tabla → 409', async () => {
  const { m, eventos } = nuevo();
  const r = await m.onCrearRequest({ request_id: 'x1', data: pedidoBase() });
  const id = r.data.pedido_id;
  await m.onAceptarRequest({ data: { project_id: PLAZA, pedido_id: id, rol: 'tienda', tienda_id: 'tienda-paco' } });
  await m.onListoDeclarado({ data: { project_id: PLAZA, pedido_id: id, hora_listo: '2026-11-03T12:00:00.000Z' } });

  const cliente = await m.onCancelarRequest({ request_id: 'x2', data: { project_id: PLAZA, pedido_id: id, rol: 'cliente' } });
  assert.strictEqual(cliente.status, 409);
  assert.strictEqual(cliente.error.code, 'CANCELACION_FUERA_DE_PLAZO');

  const rolRaro = await m.onCancelarRequest({ request_id: 'x3', data: { project_id: PLAZA, pedido_id: id, rol: 'rider' } });
  assert.strictEqual(rolRaro.status, 403);

  const plaza = await m.onCancelarRequest({ request_id: 'x4', data: { project_id: PLAZA, pedido_id: id, rol: 'plaza', motivo: 'tienda cerrada' } });
  assert.strictEqual(plaza.status, 200);
  const cancelados = eventos('bocaos.pedido_cancelado');
  assert.strictEqual(cancelados.length, 1);
  assert.strictEqual(cancelados[0].p.rol, 'plaza');
  assert.strictEqual(cancelados[0].p.motivo, 'tienda cerrada');
  assert.strictEqual(cancelados[0].p.estado, 'CANCELADO');
});

(async () => {
  let fallos = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`ok — ${t.name}`);
    } catch (err) {
      fallos += 1;
      console.error(`FALLO — ${t.name}\n  ${err.message}`);
    }
  }
  console.log(`\n${tests.length - fallos}/${tests.length} tests ok`);
  if (fallos > 0) process.exitCode = 1;
})();

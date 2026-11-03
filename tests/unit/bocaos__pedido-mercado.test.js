'use strict';

/**
 * bocaos/pedido-mercado — C02 (EstadoPedido) · C07 (Cancelación).
 *
 * Lo que se vigila:
 *   1. Nace del `pedido.creado` de pizzepos con EL MISMO id y el sello de la plaza; el pedido de
 *      recogida (sin entrega) no entra, y sin oferta o sin dirección tampoco: no se rellena.
 *   2. Sólo guarda el REPARTO: ni líneas, ni importe de comida, ni estado de cocina, ni pago.
 *   3. Tabla cerrada: LISTO sin ACEPTADO es TRANSICION_NO_PERMITIDA, y un terminal no se reabre.
 *   4. ENTREGADO sin prueba (o su falta declarada) es imposible.
 *   5. Cancelación con tabla de quién y hasta cuándo, y Q36: se anota, NO se cobra a nadie.
 *
 * Ejecutar: node tests/unit/bocaos__pedido-mercado.test.js
 */

const assert = require('assert');
const PedidoMercado = require('../../modules/bocaos/pedido-mercado/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const TIENDA = 'tienda-paco';
const PEDIDO = 'ped-1001';

function nuevo() {
  const publicados = [];
  const m = new PedidoMercado();
  m.plaza_id = PLAZA;
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async () => null;   // el fs no contesta: el estado vive en memoria
  return { m, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

// El pedido.creado de pizzepos, con el bloque `entrega` que añade la ADAPTAR de `pedidos`.
const pedidoCreado = (extra = {}) => ({
  pedido_id: PEDIDO, project_id: TIENDA, project_slug: TIENDA, cuenta_id: 'cta-1',
  total_centimos: 1850, items_count: 2, cliente_nombre: 'Ana',
  entrega: { direccion: { calle: 'Larios', numero: 3, cp: '29005' }, zona: 'centro', oferta_centimos: 450 },
  ...extra
});

const nacer = (m, extra) => m.onPedidoCreado({ data: pedidoCreado(extra) });
const de = (m, extra) => m.onDeRequest({ request_id: 'd', data: { project_id: PLAZA, pedido_id: PEDIDO, ...extra } });
const aceptar = (m, extra) => m.onAceptarRequest({ request_id: 'a', data: { project_id: PLAZA, pedido_id: PEDIDO, rol: 'tienda', tienda_id: TIENDA, ...extra } });

test('C02: nace del pedido.creado de pizzepos, con el mismo id y el sello de la plaza', async () => {
  const { m, eventos } = nuevo();
  await nacer(m);
  const creados = eventos('bocaos.pedido_creado');
  assert.strictEqual(creados.length, 1);
  assert.strictEqual(creados[0].p.pedido_id, PEDIDO, 'el id del pedido de la tienda es la clave de unión');
  assert.strictEqual(creados[0].p.plaza_id, PLAZA);
  assert.strictEqual(creados[0].p.tienda_id, TIENDA);
  assert.strictEqual(creados[0].p.oferta_centimos, 450);
  assert.strictEqual(creados[0].p.telefono_en_el_evento, false, 'el teléfono se queda en la tienda (D05)');

  const r = (await de(m)).data;
  assert.strictEqual(r.pedido.estado, 'RECIBIDO');
  assert.strictEqual(r.hechos.length, 1);
});

test('C02: sólo guarda el REPARTO — ni líneas, ni importe de comida, ni cocina, ni pago', async () => {
  const { m } = nuevo();
  await nacer(m);
  const p = (await de(m)).data.pedido;
  for (const ajeno of ['lineas', 'items', 'total_centimos', 'pago', 'estado_cocina', 'cuenta_id']) {
    assert.strictEqual(p[ajeno], undefined, `no guarda ${ajeno}: eso es de la tienda, no del mercado`);
  }
  assert.strictEqual(p.precio.oferta_centimos, 450);
  assert.strictEqual(p.direccion.calle, 'Larios');
});

test('el pedido de RECOGIDA no entra al mercado (sin bloque entrega no hay pedido que repartir)', async () => {
  const { m, eventos } = nuevo();
  await m.onPedidoCreado({ data: { pedido_id: 'ped-pickup', project_id: TIENDA, project_slug: TIENDA, total_centimos: 1200 } });
  assert.strictEqual(eventos('bocaos.pedido_creado').length, 0);
  assert.strictEqual((await de(m, { pedido_id: 'ped-pickup' })).status, 404, 'no consta: no se inventa');
});

test('sin oferta o sin dirección el pedido no nace, y el hueco se dice', async () => {
  const { m, eventos } = nuevo();
  await nacer(m, { entrega: { direccion: { calle: 'Larios' }, zona: 'centro' } });
  await nacer(m, { entrega: { zona: 'centro', oferta_centimos: 450 } });
  assert.strictEqual(eventos('bocaos.pedido_creado').length, 0);
  assert.strictEqual((await de(m)).status, 404);
});

test('C02/Q27: sólo la tienda dueña acepta; la plaza no opera el restaurante', async () => {
  const { m, eventos } = nuevo();
  await nacer(m);

  const plaza = await aceptar(m, { rol: 'plaza', tienda_id: null });
  assert.strictEqual(plaza.status, 403);
  assert.strictEqual((await de(m)).data.pedido.estado, 'RECIBIDO');

  const otra = await aceptar(m, { tienda_id: 'tienda-otra' });
  assert.strictEqual(otra.status, 403, 'la tienda no es la dueña de este pedido');

  const ok = await aceptar(m);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.data.estado, 'ACEPTADO');
  assert.strictEqual(eventos('bocaos.pedido_aceptado').length, 1);
  assert.strictEqual((await de(m)).data.pedido.estado, 'ACEPTADO');
});

test('tabla cerrada: LISTO sin ACEPTADO es TRANSICION_NO_PERMITIDA y no cambia nada', async () => {
  const { m } = nuevo();
  await nacer(m);
  // El hecho de listo llega sin aceptación: el pedido se queda como estaba.
  await m.onPedidoListo({ data: { pedido_id: PEDIDO, plaza_id: PLAZA, tienda_id: TIENDA, hora_listo: '2026-11-03T10:00:00.000Z' } });
  assert.strictEqual((await de(m)).data.pedido.estado, 'RECIBIDO', 'un pedido no puede estar listo sin que nadie lo aceptara');

  await aceptar(m);
  await m.onPedidoListo({ data: { pedido_id: PEDIDO, plaza_id: PLAZA, tienda_id: TIENDA, hora_listo: '2026-11-03T10:05:00.000Z' } });
  const p = (await de(m)).data.pedido;
  assert.strictEqual(p.estado, 'LISTO');
  assert.strictEqual(p.hora_listo, '2026-11-03T10:05:00.000Z');
});

test('ENTREGADO sin prueba es imposible: la entrega se anota, la prueba es la que entrega', async () => {
  const { m } = nuevo();
  await nacer(m);
  await aceptar(m);
  await m.onPedidoListo({ data: { pedido_id: PEDIDO, plaza_id: PLAZA, hora_listo: '2026-11-03T10:05:00.000Z' } });
  await m.onHechoRepartoAnotado({ data: { pedido_id: PEDIDO, plaza_id: PLAZA, tipo: 'recogida', hora: '2026-11-03T10:10:00.000Z', autor: 'rid-1' } });
  assert.strictEqual((await de(m)).data.pedido.estado, 'EN_REPARTO');

  await m.onHechoRepartoAnotado({ data: { pedido_id: PEDIDO, plaza_id: PLAZA, tipo: 'entrega', hora: '2026-11-03T10:25:00.000Z', autor: 'rid-1' } });
  assert.strictEqual((await de(m)).data.pedido.estado, 'EN_REPARTO', 'entregar sin prueba es una opinión, no un hecho');

  // El cierre del contrato tampoco entrega: deja el hueco nombrado.
  await m.onContratoCerrado({ data: { pedido_id: PEDIDO, plaza_id: PLAZA, hora_cierre: '2026-11-03T10:25:30.000Z' } });
  const trasCierre = (await de(m)).data.pedido;
  assert.strictEqual(trasCierre.estado, 'EN_REPARTO');

  await m.onPruebaAnotada({ data: { pedido_id: PEDIDO, plaza_id: PLAZA, prueba: { falta: false, tipo: 'codigo', valor: '4821', autor: 'rid-1' } } });
  const final = (await de(m)).data.pedido;
  assert.strictEqual(final.estado, 'ENTREGADO');
  assert.strictEqual(final.prueba.valor, '4821');
});

test('una prueba sin hecho de entrega no entrega el pedido', async () => {
  const { m } = nuevo();
  await nacer(m);
  await m.onPruebaAnotada({ data: { pedido_id: PEDIDO, plaza_id: PLAZA, prueba: { tipo: 'foto', valor: 'x.jpg' } } });
  assert.strictEqual((await de(m)).data.pedido.estado, 'RECIBIDO', 'no hay nada que probar si no consta la entrega');
});

test('C07: la tabla de cancelación es quién y hasta cuándo; y Q36: no se cobra a nadie', async () => {
  const { m, eventos } = nuevo();
  await nacer(m);

  // El cliente cancela mientras está RECIBIDO: sí.
  const cliente = await m.onCancelarRequest({ request_id: 'c', data: { project_id: PLAZA, pedido_id: PEDIDO, rol: 'cliente', motivo: 'me equivoqué' } });
  assert.strictEqual(cliente.status, 200);
  const hecho = eventos('bocaos.pedido_cancelado')[0].p;
  assert.strictEqual(hecho.estado, 'CANCELADO');
  assert.strictEqual(hecho.rol, 'cliente');
  assert.strictEqual(hecho.cobrado, false);
  assert.strictEqual(hecho.deuda_visible, true, 'la deuda queda visible; no se inventa un cargo (Q36)');

  // Un terminal no se reabre.
  const otra = await m.onCancelarRequest({ request_id: 'c2', data: { project_id: PLAZA, pedido_id: PEDIDO, rol: 'plaza' } });
  assert.strictEqual(otra.status, 409);
  assert.strictEqual(otra.error.code, 'CANCELACION_FUERA_DE_PLAZO');
});

test('C07: en EN_REPARTO ya no cancela nadie (la tabla se dice, no se interpreta)', async () => {
  const { m } = nuevo();
  await nacer(m);
  await aceptar(m);
  await m.onPedidoListo({ data: { pedido_id: PEDIDO, plaza_id: PLAZA, hora_listo: '2026-11-03T10:05:00.000Z' } });
  await m.onHechoRepartoAnotado({ data: { pedido_id: PEDIDO, plaza_id: PLAZA, tipo: 'recogida', hora: '2026-11-03T10:10:00.000Z', autor: 'rid-1' } });

  for (const rol of ['cliente', 'tienda', 'plaza']) {
    const r = await m.onCancelarRequest({ request_id: `x-${rol}`, data: { project_id: PLAZA, pedido_id: PEDIDO, rol } });
    assert.strictEqual(r.status, 409, rol);
  }
  const d = (await de(m)).data;
  assert.deepStrictEqual(d.cancelacion, { cliente: false, tienda: false, plaza: false, hasta: { cliente: 'RECIBIDO', tienda: 'ACEPTADO', plaza: 'LISTO' } });
});

test('pedido.cancelado de pizzepos se anota con su hora y no cobra', async () => {
  const { m, eventos } = nuevo();
  await nacer(m);
  await m.onPedidoCancelado({ data: { pedido_id: PEDIDO, project_id: TIENDA, motivo: 'la tienda cerró', hora: '2026-11-03T10:01:00.000Z' } });
  const p = (await de(m)).data.pedido;
  assert.strictEqual(p.estado, 'CANCELADO');
  assert.strictEqual(p.motivo_cancelacion, 'la tienda cerró');
  assert.strictEqual(eventos('bocaos.pedido_cancelado').length, 1);
});

test('rechazar: RECHAZADO con motivo, y la deuda queda visible sin cobrar', async () => {
  const { m, eventos } = nuevo();
  await nacer(m);
  const r = await m.onRechazarRequest({ request_id: 'r', data: { project_id: PLAZA, pedido_id: PEDIDO, rol: 'tienda', tienda_id: TIENDA, motivo: 'sin rider' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.estado, 'RECHAZADO');
  const hecho = eventos('bocaos.pedido_rechazado')[0].p;
  assert.strictEqual(hecho.motivo, 'sin rider');
  assert.strictEqual(hecho.cobrado, false);
});

test('idempotencia: el mismo pedido.creado no crea dos pedidos', async () => {
  const { m, eventos } = nuevo();
  await nacer(m);
  await nacer(m);
  assert.strictEqual(eventos('bocaos.pedido_creado').length, 1);
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

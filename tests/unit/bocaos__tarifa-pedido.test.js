'use strict';

/**
 * bocaos/tarifa-pedido — E01 · E02 · E03 · E07.
 *
 * Lo que se vigila:
 *   1. La oferta del cliente se CONGELA con el pedido y no la reforma nadie: después, 409.
 *   2. El precio SÓLO SUMA oferta + incentivo (sin redondeos, sin estimaciones, sin comisión).
 *   3. El incentivo lo sube la tienda con autor, y no puede bajar lo ya ofrecido.
 *   4. La subida exige AUTOR humano y tope autorizado; por encima del tope, 409.
 *   5. Q17: la subida se anota con la deuda VISIBLE y no se cobra a nadie.
 *   6. Sin oferta no hay precio: no se inventa un número.
 *
 * Ejecutar: node tests/unit/bocaos__tarifa-pedido.test.js
 */

const assert = require('assert');
const TarifaPedido = require('../../modules/bocaos/tarifa-pedido/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const TIENDA = 'tienda-paco';
const PEDIDO = 'ped-1001';

function nuevo({ tramo = { contrato_id: 'tr-1', parte: 'tienda', tramo: 2, cents_por_pedido: 20, fijo_mensual_cents: 7900, devenga: true } } = {}) {
  const publicados = [];
  const pedidas = [];
  const m = new TarifaPedido();
  m.plaza_id = PLAZA;
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => {
    pedidas.push({ ev, payload });
    if (ev === 'contrato-tramos.vigente.request') return { status: 200, data: { contrato: tramo } };
    return null;
  };
  return { m, pedidas, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const nacer = (m, extra = {}) => m.onPedidoCreado({ data: {
  pedido_id: PEDIDO, project_id: TIENDA, project_slug: TIENDA, plaza_id: PLAZA,
  entrega: { direccion: { calle: 'Larios' }, zona: 'centro', oferta_centimos: 450, ...extra }
} });
const de = (m) => m.onDeRequest({ request_id: 'd', data: { project_id: PLAZA, pedido_id: PEDIDO, tienda_id: TIENDA } });

test('E01/E03: la oferta del cliente se congela al nacer y el precio sólo suma', async () => {
  const { m, eventos } = nuevo();
  await nacer(m);
  const cerrados = eventos('bocaos.precio_cerrado');
  assert.strictEqual(cerrados.length, 1);
  assert.strictEqual(cerrados[0].p.oferta_centimos, 450);
  assert.strictEqual(cerrados[0].p.incentivo_centimos, 0);
  assert.strictEqual(cerrados[0].p.precio_centimos, 450);
  assert.strictEqual(cerrados[0].p.cerrado, true);

  const p = (await de(m)).data.precio;
  assert.strictEqual(p.precio_centimos, 450);
  assert.ok(p.regla.includes('sólo suma'), p.regla);
});

test('E01: la oferta congelada no se reforma — 409, y el número no cambia', async () => {
  const { m, eventos } = nuevo();
  await nacer(m);
  const r = await m.onOfertaRequest({ request_id: 'o', data: { project_id: PLAZA, pedido_id: PEDIDO, oferta_centimos: 100 } });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'OFERTA_CONGELADA');
  assert.strictEqual((await de(m)).data.precio.desglose.oferta_centimos, 450);
  assert.strictEqual(eventos('bocaos.precio_cerrado').length, 1);
});

test('E01: si el pedido llegó sin oferta, se puede estipular una vez; sin oferta no hay precio', async () => {
  const { m } = nuevo();
  await m.onPedidoCreado({ data: { pedido_id: PEDIDO, project_id: TIENDA, plaza_id: PLAZA, entrega: { direccion: { calle: 'Larios' } } } });
  const sinPrecio = await de(m);
  assert.strictEqual(sinPrecio.status, 404);
  assert.strictEqual(sinPrecio.error.details.hueco, 'sin oferta');

  const r = await m.onOfertaRequest({ request_id: 'o', data: { project_id: PLAZA, pedido_id: PEDIDO, oferta_centimos: 500, tienda_id: TIENDA } });
  assert.strictEqual(r.status, 201, JSON.stringify(r.error || {}));
  assert.strictEqual((await de(m)).data.precio.precio_centimos, 500);
});

test('E02: el incentivo de la tienda SUBE el precio, con autor y hora', async () => {
  const { m, eventos } = nuevo();
  await nacer(m);
  const r = await m.onIncentivoRequest({ request_id: 'i', data: { project_id: PLAZA, pedido_id: PEDIDO, incentivo_centimos: 50, autor: 'tienda-paco' } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.error || {}));
  assert.strictEqual(r.data.precio.precio_centimos, 500, '450 + 50: sólo suma');
  assert.strictEqual(r.data.precio.incentivo.autor, 'tienda-paco');

  const cerrados = eventos('bocaos.precio_cerrado');
  assert.strictEqual(cerrados.length, 2, 'el precio se vuelve a cerrar con el número nuevo');
  assert.strictEqual(cerrados[1].p.precio_centimos, 500);
});

test('E02: el incentivo no baja lo ya ofrecido y exige autor', async () => {
  const { m } = nuevo();
  await nacer(m);
  await m.onIncentivoRequest({ request_id: 'i', data: { project_id: PLAZA, pedido_id: PEDIDO, incentivo_centimos: 80, autor: 'tienda-paco' } });

  const baja = await m.onIncentivoRequest({ request_id: 'i2', data: { project_id: PLAZA, pedido_id: PEDIDO, incentivo_centimos: 10, autor: 'tienda-paco' } });
  assert.strictEqual(baja.status, 409);
  assert.strictEqual(baja.error.code, 'NO_BAJA');

  const sinAutor = await m.onIncentivoRequest({ request_id: 'i3', data: { project_id: PLAZA, pedido_id: PEDIDO, incentivo_centimos: 100 } });
  assert.strictEqual(sinAutor.status, 400, 'sin autor no hay acto');

  assert.strictEqual((await de(m)).data.precio.precio_centimos, 530);
});

test('E07/Q43: la subida exige AUTOR humano y TOPE autorizado', async () => {
  const { m } = nuevo();
  await nacer(m, { tope_centimos: 600 });

  const sinAutor = await m.onSubirRequest({ request_id: 's', data: { project_id: PLAZA, pedido_id: PEDIDO, importe_centimos: 500 } });
  assert.strictEqual(sinAutor.status, 403);
  assert.strictEqual(sinAutor.error.code, 'SIN_AUTOR');

  const automatica = await m.onSubirRequest({ request_id: 's', data: { project_id: PLAZA, pedido_id: PEDIDO, importe_centimos: 500, autor: 'sistema' } });
  assert.strictEqual(automatica.status, 403, 'el sistema no puede ser autor de una subida');

  const excedida = await m.onSubirRequest({ request_id: 's', data: { project_id: PLAZA, pedido_id: PEDIDO, importe_centimos: 700, autor: 'cliente' } });
  assert.strictEqual(excedida.status, 409);
  assert.strictEqual(excedida.error.code, 'TOPE_EXCEDIDO');

  const ok = await m.onSubirRequest({ request_id: 's', data: { project_id: PLAZA, pedido_id: PEDIDO, importe_centimos: 550, autor: 'cliente' } });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.error || {}));
  assert.strictEqual(ok.data.precio.precio_centimos, 550);
  assert.strictEqual(ok.data.deuda.cobrada, false, 'Q17: la deuda queda visible, no cobrada');
});

test('E07: sin tope autorizado no se paga más (y se dice el hueco)', async () => {
  const { m } = nuevo();
  await nacer(m);
  const r = await m.onSubirRequest({ request_id: 's', data: { project_id: PLAZA, pedido_id: PEDIDO, importe_centimos: 500, autor: 'duena' } });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'SIN_TOPE');
  assert.strictEqual(r.error.details.hueco, 'sin tope autorizado');
});

test('E07: la subida se anota como hecho con su escalón y su deuda visible', async () => {
  const { m, eventos } = nuevo();
  await nacer(m, { tope_centimos: 600 });
  await m.onSubirRequest({ request_id: 's', data: { project_id: PLAZA, pedido_id: PEDIDO, importe_centimos: 550, autor: 'cliente', hora: '2026-11-03T10:02:00.000Z' } });

  const subida = eventos('bocaos.oferta_subida');
  assert.strictEqual(subida.length, 1);
  const p = subida[0].p;
  assert.strictEqual(p.precio_antes_centimos, 450);
  assert.strictEqual(p.precio_ahora_centimos, 550);
  assert.strictEqual(p.escalon_centimos, 100);
  assert.strictEqual(p.tope_centimos, 600);
  assert.strictEqual(p.autor, 'cliente');
  assert.strictEqual(p.cobrado, false);
  assert.strictEqual(p.deuda_visible, true);
  assert.strictEqual(p.hora, '2026-11-03T10:02:00.000Z');
});

test('E03/E06: el tramo del contrato entra en el desglose y NO en el precio', async () => {
  const { m, pedidas } = nuevo();
  await nacer(m);
  const p = (await de(m)).data.precio;
  assert.strictEqual(p.desglose.tramo.tramo, 2);
  assert.strictEqual(p.desglose.tramo.cents_por_pedido, 20);
  assert.strictEqual(p.desglose.tramo.sumado_en_el_precio, false, 'el tramo lo liquida la plaza: no se le cobra dos veces al rider');
  assert.strictEqual(p.precio_centimos, 450, 'el precio sigue siendo oferta + incentivo');

  const t = pedidas.find((x) => x.ev === 'contrato-tramos.vigente.request');
  assert.ok(t, 'el tramo se PIDE al bus, no se copia');
  assert.strictEqual(t.payload.parte_id, TIENDA);
});

test('sin tramo declarado el precio sigue cerrándose (el tramo se dice que falta)', async () => {
  const { m, eventos } = nuevo({ tramo: null });
  await nacer(m);
  const p = (await de(m)).data.precio;
  assert.strictEqual(p.precio_centimos, 450);
  assert.strictEqual(p.desglose.tramo, null);
  assert.strictEqual(eventos('bocaos.precio_cerrado').length, 1);
});

test('idempotencia: el mismo pedido.creado no reabre la oferta', async () => {
  const { m, eventos } = nuevo();
  await nacer(m);
  await nacer(m, { oferta_centimos: 900 });
  assert.strictEqual(eventos('bocaos.precio_cerrado').length, 1);
  assert.strictEqual((await de(m)).data.precio.desglose.oferta_centimos, 450, 'la primera oferta es la que vale');
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

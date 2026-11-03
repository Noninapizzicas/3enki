'use strict';

/**
 * bocaos/entrada-listo — C04 → A01 (el paso ① del §7.1).
 *
 * Lo que se vigila:
 *   1. El «listo» de la cocina (cocina.pedido_listo, el evento REAL de pizzepos) se traduce en
 *      `bocaos.listo_declarado` con destino, hora y PRECIO DE REPARTO dentro. Sin precio no hay
 *      propuesta, así que sin precio no puede haber aviso.
 *   2. La hora es la que declaró la cocina (listo_at). No se adelanta ni se corrige: declarar tiene
 *      consecuencia (C04).
 *   3. Sin destino NO se inventa: se emite `bocaos.hueco_nombrado` con el dato que falta (A34) y el
 *      pedido no entra al enlace.
 *   4. Reintentar un pedido que no está en la tienda devuelve el fallo CON MOTIVO (nunca silencio).
 *   5. El puente no guarda nada: el que escribe el hecho es `hecho-listo`.
 *
 * Ejecutar: node tests/unit/bocaos__entrada-listo.test.js
 */

const assert = require('assert');
const EntradaListo = require('../../modules/bocaos/entrada-listo/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const TIENDA = 'tienda-paco';
const PEDIDO = 'ped-1';
const LISTO = '2026-11-03T13:40:00.000Z';

function nuevo({ pedido = {}, precio = null, pide = null } = {}) {
  const publicados = [];
  const pedidas = [];
  const m = new EntradaListo();
  m.name = 'entrada-listo';
  m.plaza_id = PLAZA;
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => {
    pedidas.push({ ev, payload });
    if (ev === 'pedido.get.request') {
      if (pide === 'error') return null;
      if (Object.keys(pedido).length === 0) return { status: 404, error: { code: 'RESOURCE_NOT_FOUND' } };
      return { status: 200, data: { pedido } };
    }
    if (ev === 'tarifa-pedido.de.request') {
      if (!precio) return { status: 404, error: { code: 'NO_CONSTA' } };
      return { status: 200, data: { precio } };
    }
    return null;
  };
  return { m, pedidas, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const PEDIDO_OK = {
  pedido_id: PEDIDO,
  project_slug: TIENDA,
  total_centimos: 2450,
  entrega: {
    direccion: { calle: 'Larios', numero: 3, cp: '29005' },
    destino: 'Calle Destino 9',
    punto: 'Pizzería Paco · Larios 3',
    zona: 'centro',
    punto_recogida: 'barra'
  }
};

const PRECIO_OK = {
  pedido_id: PEDIDO,
  plaza_id: PLAZA,
  precio_centimos: 450,
  desglose: { oferta_centimos: 450, incentivo_centimos: 0 },
  tope_centimos: 600,
  congelada_en: '2026-11-03T13:20:00.000Z'
};

const listo = (m, extra = {}) => m.onCocinaPedidoListo({ data: {
  pedido_id: PEDIDO, cuenta_id: 'cta-1', project_id: TIENDA, listo_at: LISTO, ...extra
} });

test('el «listo» de la cocina se convierte en el hecho de la plaza, con precio y destino dentro', async () => {
  const { m, eventos } = nuevo({ pedido: PEDIDO_OK, precio: PRECIO_OK });
  const r = await listo(m);

  assert.strictEqual(r.status, 201, JSON.stringify(r));
  const hechos = eventos('bocaos.listo_declarado');
  assert.strictEqual(hechos.length, 1, 'un aviso, un hecho');
  const p = hechos[0].p;

  assert.strictEqual(p.pedido_id, PEDIDO);
  assert.strictEqual(p.plaza_id, PLAZA, 'el sello de la plaza lo pone la plaza');
  assert.strictEqual(p.tienda_id, TIENDA);
  assert.strictEqual(p.hora_listo, LISTO, 'la hora es la que declaró la cocina');
  assert.strictEqual(p.destino, 'Calle Destino 9');
  assert.strictEqual(p.zona, 'centro');
  assert.strictEqual(p.punto, 'Pizzería Paco · Larios 3');
  assert.strictEqual(p.autor.rol, 'tienda');

  // Lo que el enlace necesita para poder proponer (A05…A12).
  assert.strictEqual(p.precio_congelado.total_cents, 2450, 'el importe de la comida, en céntimos');
  assert.strictEqual(p.precio_congelado.moneda, 'EUR');
  assert.strictEqual(p.precio_congelado.reparto_cents, 450, 'el precio de reparto cerrado (E03)');
  assert.strictEqual(p.precio_congelado.tope_centimos, 600);
  assert.strictEqual(p.precio_congelado.oferta_centimos, 450);

  // El par honesto del disparador: quien mira el bus sabe que el aviso salió.
  assert.strictEqual(eventos('entrada-listo.componer.response').length, 1);
  assert.strictEqual(eventos('entrada-listo.componer.failed').length, 0);
  assert.strictEqual(eventos('bocaos.hueco_nombrado').length, 0);
});

test('el pedido se PIDE a la tienda y el precio a su custodio: no se leen almacenes ajenos', async () => {
  const { m, pedidas } = nuevo({ pedido: PEDIDO_OK, precio: PRECIO_OK });
  await listo(m);
  assert.deepStrictEqual(pedidas.map((x) => x.ev), ['pedido.get.request', 'tarifa-pedido.de.request']);
  assert.strictEqual(pedidas[0].payload.pedido_id, PEDIDO);
  assert.strictEqual(pedidas[1].payload.project_id, PLAZA, 'la tarifa vive en la plaza');
});

test('sin destino: hueco nombrado y el pedido NO entra al enlace', async () => {
  const pedido = JSON.parse(JSON.stringify(PEDIDO_OK));
  delete pedido.entrega.destino;
  delete pedido.entrega.direccion;   // ni destino ni dirección: no hay a dónde ir
  const { m, eventos } = nuevo({ pedido, precio: PRECIO_OK });

  const r = await listo(m);
  assert.strictEqual(r.status, 409);
  assert.strictEqual(eventos('bocaos.listo_declarado').length, 0, 'sin destino no hay hecho de listo');
  const huecos = eventos('bocaos.hueco_nombrado');
  assert.strictEqual(huecos.length, 1);
  assert.strictEqual(huecos[0].p.hueco, 'sin destino de entrega');
  assert.strictEqual(huecos[0].p.pedido_id, PEDIDO);
  const fallos = eventos('entrada-listo.componer.failed');
  assert.strictEqual(fallos.length, 1);
  assert.strictEqual(fallos[0].p.error.details.field, 'destino', 'el fallo dice QUÉ falta');
});

test('sin precio cerrado no hay aviso: se nombra el hueco en vez de estimar un número', async () => {
  const { m, eventos } = nuevo({ pedido: PEDIDO_OK, precio: null });
  const r = await listo(m);
  assert.strictEqual(r.status, 409);
  assert.strictEqual(eventos('bocaos.listo_declarado').length, 0);
  assert.strictEqual(eventos('bocaos.hueco_nombrado')[0].p.hueco, 'sin precio de reparto cerrado (E03)');
});

test('sin total del pedido no se inventa el importe de la comida', async () => {
  const pedido = JSON.parse(JSON.stringify(PEDIDO_OK));
  delete pedido.total_centimos;
  const { m, eventos } = nuevo({ pedido, precio: PRECIO_OK });
  const r = await listo(m);
  assert.strictEqual(r.status, 409);
  assert.strictEqual(eventos('bocaos.hueco_nombrado')[0].p.hueco, 'sin total del pedido');
});

test('si el pedido trae el total en euros, se pasa a céntimos y se dice la moneda', async () => {
  const pedido = JSON.parse(JSON.stringify(PEDIDO_OK));
  delete pedido.total_centimos;
  pedido.total = 24.5;   // pizzepos guarda `total: total_centimos / 100`
  const { m, eventos } = nuevo({ pedido, precio: PRECIO_OK });
  await listo(m);
  assert.strictEqual(eventos('bocaos.listo_declarado')[0].p.precio_congelado.total_cents, 2450);
  assert.strictEqual(eventos('bocaos.listo_declarado')[0].p.precio_congelado.moneda, 'EUR');
});

test('sin hora de listo no hay hecho: es la hora que declaró la cocina o no es nada', async () => {
  const { m, eventos } = nuevo({ pedido: PEDIDO_OK, precio: PRECIO_OK });
  const r = await m.onCocinaPedidoListo({ data: { pedido_id: PEDIDO, project_id: TIENDA } });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(eventos('bocaos.listo_declarado').length, 0);
  assert.strictEqual(eventos('bocaos.hueco_nombrado')[0].p.hueco, 'sin hora de listo');
});

test('reintentar con un pedido que la tienda no tiene: fallo CON MOTIVO, nunca silencio', async () => {
  const { m, eventos } = nuevo({ pedido: {}, precio: PRECIO_OK });
  const r = await m.onReintentarRequest({ request_id: 'r1', data: { project_id: PLAZA, pedido_id: 'no-existe' } });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.code, 'HUECO');
  assert.strictEqual(r.error.details.hueco, 'sin pedido en la tienda (falta la adaptación `entrega` o el pedido no existe)');
  assert.strictEqual(eventos('entrada-listo.reintentar.failed').length, 1);
  assert.strictEqual(eventos('entrada-listo.reintentar.failed')[0].p.request_id, 'r1');
});

test('el pedido de pizzepos viene con `id`: el mismo dato, no otro pedido', async () => {
  const pedido = { ...JSON.parse(JSON.stringify(PEDIDO_OK)), id: PEDIDO };
  delete pedido.pedido_id;
  const { m, eventos } = nuevo({ pedido, precio: PRECIO_OK });
  const r = await listo(m);
  assert.strictEqual(r.status, 201);
  assert.strictEqual(eventos('bocaos.listo_declarado')[0].p.pedido_id, PEDIDO);
});

test('el puente no guarda estado: el hecho lo escribe su custodio', () => {
  const { m } = nuevo();
  assert.strictEqual(m._path, null, 'sin store: dos horas de listo serían dos verdades');
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

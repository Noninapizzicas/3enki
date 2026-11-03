'use strict';

/**
 * bocaos/panel-tienda — L01.
 *
 * Lo que se vigila:
 *   1. MISMO NÚMERO: la espera y la puntualidad del panel son las de `medida-cocina`, tal cual. Si el
 *      panel recalculara, habría una versión para el que paga y otra para el que sufre.
 *   2. QUÉ UMBRALES RIGEN: la tienda sabe si le aplican los suyos o el default de la plaza, con su
 *      capa, su versión y su autor.
 *   3. SIN SNAPSHOT NO HAY 0: los pedidos sin repartidor y las propuestas se dicen «sin snapshot», no
 *      un cero tranquilizador.
 *   4. UNA TIENDA NO VE EL PANEL DE OTRA: 403.
 *   5. Tienda sin histórico → «sin histórico», no 0.
 *
 * Ejecutar: node tests/unit/bocaos__panel-tienda.test.js
 */

const assert = require('assert');
const PanelTienda = require('../../modules/bocaos/panel-tienda/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const TIENDA = 'tienda-paco';

const MEDIDA = {
  tienda_id: TIENDA, estado: 'MEDIDA', n: 6, n_minimo: 5,
  p50_min: 2, p90_min: 9, espera_medida_min: 0.5, a_tiempo_pct: 16.7,
  tipo: 'distribucion', nota: null, estrellas: null,
  distribucion: [{ clave: 'a_tiempo', cuenta: 1, pct: 16.7 }, { clave: 'hasta_2', cuenta: 2, pct: 33.3 }]
};

const POLITICA = {
  capa: 'plaza', version: 2, autor: 'dueno-plaza', desde: '2026-11-01T09:00:00.000Z',
  acta: 'acta-2', fuente: 'declarada', tienda_id: null, ventana_s: 20,
  umbrales: { desvio_m: 800, espera_min: 4, retraso_min: 6, cobra_min_cents: 0 },
  esperas: { n1_tienda_min: 8, n2_portal_min: 5, n3_entrega_min: 10 }
};

function nuevo({ medida = MEDIDA, politica = POLITICA, cubre = { cubre: true, estado: 'PLAZA', plaza_id: PLAZA }, plaza = {} } = {}) {
  const publicados = [];
  const pedidas = [];
  const m = new PanelTienda();
  m.name = 'panel-tienda';
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => {
    pedidas.push({ ev, payload });
    if (ev === 'medida-cocina.medir.request') return medida ? { status: 200, data: { medida } } : null;
    if (ev === 'config-mercado.politica.request') return politica ? { status: 200, data: { politica } } : null;
    if (ev === 'frontera-plaza.cubre.request') return cubre ? { status: 200, data: cubre } : null;
    return null;
  };
  return { m, pedidas, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const ver = (m, extra = {}) => m.onVerRequest({ request_id: 'v1', data: {
  project_id: TIENDA, tienda_id: TIENDA, plaza_id: PLAZA,
  periodo: { desde: '2026-11-01T00:00:00.000Z', hasta: '2026-11-08T00:00:00.000Z' },
  zona: 'centro',
  hechos: [{ pedido_id: 'p1', hora_prometida: '2026-11-03T13:00:00.000Z', hora_listo: '2026-11-03T13:02:00.000Z' }],
  pedidos: [{ pedido_id: 'ped-1', rider_id: null }, { pedido_id: 'ped-2', rider_id: 'rd-1', contrato_id: 'ct-1' }],
  propuestas: [{ estado: 'aceptada' }, { estado: 'rechazada' }, { estado: 'aceptada' }],
  ...extra
} });

test('el panel enseña la espera y la puntualidad de medida-cocina: MISMO número', async () => {
  const { m } = nuevo();
  const r = await ver(m);
  assert.strictEqual(r.status, 200, JSON.stringify(r));
  const p = r.data.panel;

  assert.strictEqual(p.espera_medida_min, MEDIDA.espera_medida_min);
  assert.strictEqual(p.puntualidad.p50_min, MEDIDA.p50_min);
  assert.strictEqual(p.puntualidad.n, MEDIDA.n);
  assert.deepStrictEqual(p.puntualidad.distribucion, MEDIDA.distribucion, 'la distribución se devuelve tal cual');
  assert.strictEqual(p.version_amable, false, 'no hay versión amable');
});

test('la puntualidad NO se recalcula en el panel: se pide y se devuelve', async () => {
  const { m, pedidas } = nuevo();
  await ver(m);
  const ask = pedidas.find((x) => x.ev === 'medida-cocina.medir.request');
  assert.ok(ask, 'el panel pregunta a medida-cocina');
  assert.strictEqual(ask.payload.tienda_id, TIENDA);
  assert.strictEqual(ask.payload.hechos.length, 1, 'la serie viaja con la pregunta');
});

test('qué umbrales rige, con su capa y su autor: si son de la plaza, se dice', async () => {
  const { m } = nuevo();
  const p = (await ver(m)).data.panel;
  assert.strictEqual(p.umbrales.estado, 'VIGENTE');
  assert.strictEqual(p.umbrales.capa, 'plaza');
  assert.strictEqual(p.umbrales.es_suya, false);
  assert.ok(p.umbrales.nota.includes('default de la plaza'));
  assert.strictEqual(p.umbrales.umbrales.espera_min, 4);
  assert.strictEqual(p.umbrales.version, 2);
});

test('si la tienda declaró sus umbrales, el panel lo dice: es SU declaración la que rige', async () => {
  const { m } = nuevo({ politica: { ...POLITICA, capa: 'tienda', tienda_id: TIENDA, autor: 'paco', version: 1 } });
  const p = (await ver(m)).data.panel;
  assert.strictEqual(p.umbrales.es_suya, true);
  assert.ok(p.umbrales.nota.includes('TU declaración'));
});

test('sin snapshot de la plaza: «sin snapshot», no un 0', async () => {
  const { m } = nuevo();
  const p = (await ver(m, { pedidos: undefined, propuestas: undefined })).data.panel;
  assert.strictEqual(p.pedidos_sin_repartidor.estado, 'NO_CONSTA');
  assert.strictEqual(p.pedidos_sin_repartidor.cuenta, null);
  assert.strictEqual(p.propuestas.recibidas, null);
  assert.ok(p.huecos.some((h) => h.includes('sin snapshot')));
});

test('con snapshot: propuestas por desenlace y pedidos sin repartidor, contados', async () => {
  const { m } = nuevo();
  const p = (await ver(m)).data.panel;
  assert.strictEqual(p.propuestas.recibidas, 3);
  assert.deepStrictEqual(p.propuestas.desglose, { aceptada: 2, rechazada: 1 });
  assert.strictEqual(p.pedidos_sin_repartidor.cuenta, 1);
  assert.deepStrictEqual(p.pedidos_sin_repartidor.pedidos, ['ped-1']);
});

test('tienda sin histórico: «sin histórico», no 0', async () => {
  const { m } = nuevo({ medida: { ...MEDIDA, estado: 'NO_CONSTA', n: 0, distribucion: null, p50_min: null, espera_medida_min: null, hueco: 'sin histórico' } });
  const p = (await ver(m)).data.panel;
  assert.strictEqual(p.puntualidad.estado, 'NO_CONSTA');
  assert.strictEqual(p.puntualidad.hueco, 'sin histórico');
  assert.strictEqual(p.espera_medida_min, null, 'sin histórico no hay espera que enseñar');
});

test('sin cobertura declarada para la zona: se dice el hueco, no se supone que llega', async () => {
  const { m } = nuevo({ cubre: { cubre: null, estado: 'NO_CONSTA', motivo: 'la plaza no ha declarado cobertura', hueco: 'sin zona declarada' } });
  const p = (await ver(m)).data.panel;
  assert.strictEqual(p.cobertura.cubre, null);
  assert.strictEqual(p.cobertura.estado, 'NO_CONSTA');
});

test('una tienda no lee el panel de otra: 403', async () => {
  const { m, eventos } = nuevo();
  const r = await m.onVerRequest({ request_id: 'x', data: { project_id: 'tienda-otra', tienda_id: TIENDA, plaza_id: PLAZA } });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.error.code, 'TIENDA_AJENA');
  assert.strictEqual(eventos('panel-tienda.ver.failed').length, 1);
});

test('si el bus no contesta, el panel se compone igual y dice qué falta', async () => {
  const { m } = nuevo({ medida: null, politica: null, cubre: null });
  const p = (await ver(m)).data.panel;
  assert.strictEqual(p.puntualidad.estado, 'NO_CONSTA');
  assert.strictEqual(p.umbrales.estado, 'NO_CONSTA');
  assert.strictEqual(p.cobertura.estado, 'NO_CONSTA');
  assert.ok(p.huecos.length >= 3, 'los tres huecos, nombrados');
});

test('no escribe: es una vista, no un registro', () => {
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

'use strict';

/**
 * bocaos/foto-mercado — A02 compone, A03 congela con huella, A04 elige sin puntuar.
 *
 * Lo que se vigila:
 *   1. DOS composiciones del mismo instante dan LA MISMA HUELLA (reproducible, A29).
 *   2. el rider de otra plaza NO aparece (A35).
 *   3. el dato ausente NO descarta: entra con su lista de faltantes (A04); el estado pausado sí
 *      descarta, y la razón se dice.
 *   4. la foto alterada no reproduce su huella → 409 FOTO_ALTERADA.
 *   5. la foto se pide POR EL BUS a estado-parte / ruta-viva / config-mercado; lo que no contesta
 *      se nombra como hueco, no se inventa.
 *
 * Ejecutar: node tests/unit/bocaos__foto-mercado.test.js
 */

const assert = require('assert');
const FotoMercado = require('../../modules/bocaos/foto-mercado/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const POLITICA = {
  capa: 'tienda',
  version: 3,
  autor: 'tienda-paco',
  umbrales: { desvio_m: 800, espera_min: 4, retraso_min: 6, cobra_min_cents: 0 },
  ventana_s: 20,
  orden: 'declarado'
};

function nuevo({ riders, rutas, politica } = {}) {
  const publicados = [];
  const pedidas = [];
  const m = new FotoMercado();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  const respuestas = {
    'estado-parte.de.request': riders === undefined ? null : { status: 200, data: { riders } },
    'ruta-viva.de.request': rutas === undefined ? null : { status: 200, data: { rutas } },
    'config-mercado.politica.request': politica === undefined ? null : { status: 200, data: { politica } }
  };
  m._rpc = async (ev, payload) => { pedidas.push({ ev, payload }); return respuestas[ev] ?? null; };
  return { m, pedidas, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const PEDIDO = {
  pedido_id: 'ped-1',
  plaza_id: 'plaza-malaga',
  punto: { lat: 36.72, lng: -4.42 },
  zona: 'centro',
  hora_listo: '2026-11-03T21:05:00.000Z',
  precio_congelado: { total_cents: 1850, reparto_cents: 450 }
};

const RIDERS = [
  { rider_id: 'rid-1', plaza_id: 'plaza-malaga', estado: 'activo', zonas: ['centro'], capacidad: 2, coste: { eur_km: 0.25, eur_min: 0.1 } },
  { rider_id: 'rid-2', plaza_id: 'plaza-sevilla', estado: 'activo', zonas: ['centro'], capacidad: 2 }
];

const RUTAS = [
  { rider_id: 'rid-1', posicion: { lat: 36.721, lng: -4.421 }, paradas: [], promesas: {}, eta_tienda_min: 10 }
];

test('dos composiciones del mismo instante dan la misma huella y la foto se publica', async () => {
  const { m, eventos } = nuevo({ riders: RIDERS, rutas: RUTAS, politica: POLITICA });
  const d = { project_id: 'plaza-malaga', plaza_id: 'plaza-malaga', pedido: PEDIDO, instante: '2026-11-03T21:00:00.000Z' };

  const a = await m.onComponerRequest({ request_id: 'f1', data: d });
  const b = await m.onComponerRequest({ request_id: 'f2', data: d });

  assert.strictEqual(a.status, 200);
  assert.strictEqual(a.data.foto.huella, b.data.foto.huella, 'misma foto → misma huella');
  assert.strictEqual(a.data.foto.foto_id, b.data.foto.foto_id);

  const hechos = eventos('bocaos.foto_congelada');
  assert.strictEqual(hechos.length, 2);
  assert.strictEqual(hechos[0].p.huella, a.data.foto.huella);
  assert.strictEqual(hechos[0].p.plaza_id, 'plaza-malaga');
});

test('el rider de otra plaza no aparece (A35)', async () => {
  const { m } = nuevo({ riders: RIDERS, rutas: RUTAS, politica: POLITICA });
  const r = await m.onComponerRequest({ data: { project_id: 'plaza-malaga', pedido: PEDIDO, instante: '2026-11-03T21:00:00.000Z' } });
  const ids = r.data.foto.riders.map((x) => x.rider_id);
  assert.deepStrictEqual(ids, ['rid-1']);
});

test('sin módulos que contesten: la foto existe con sus huecos y el rider con sus faltantes', async () => {
  const { m } = nuevo({});
  const r = await m.onComponerRequest({ data: { project_id: 'plaza-malaga', pedido: PEDIDO, instante: '2026-11-03T21:00:00.000Z' } });

  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.foto.huecos, ['sin estado del parte', 'sin rutas vivas', 'sin política declarada (se usa default de la plaza)']);
  assert.deepStrictEqual(r.data.foto.politica.umbrales, { desvio_m: 800, espera_min: 4, retraso_min: 6, cobra_min_cents: 0 });
  assert.strictEqual(r.data.foto.politica.fuente, 'default-f0', 'no se finge acta');
});

test('elegibles: estado pausado descarta con razón; dato ausente entra con faltantes', async () => {
  const riders = [
    { rider_id: 'rid-1', plaza_id: 'plaza-malaga', estado: 'activo', zonas: ['centro'], capacidad: 2, coste: { eur_km: 0.25, eur_min: 0.1 } },
    { rider_id: 'rid-2', plaza_id: 'plaza-malaga', estado: 'pausado', zonas: ['centro'], capacidad: 1 },
    { rider_id: 'rid-3', plaza_id: 'plaza-malaga', estado: 'activo' },   // sin zonas, sin capacidad, sin coste
    { rider_id: 'rid-4', plaza_id: 'plaza-malaga', estado: 'activo', zonas: ['playa'], capacidad: 1 }
  ];
  const { m } = nuevo({ riders, rutas: [], politica: POLITICA });
  const foto = (await m.onComponerRequest({ data: { project_id: 'plaza-malaga', pedido: PEDIDO, instante: '2026-11-03T21:00:00.000Z' } })).data.foto;

  const r = await m.onElegiblesRequest({ request_id: 'f3', data: { project_id: 'plaza-malaga', foto } });
  const ids = r.data.candidatos.map((c) => c.rider_id);
  assert.deepStrictEqual(ids, ['rid-1', 'rid-3'], 'rid-3 entra sin datos: descartar es decidir');
  assert.deepStrictEqual(r.data.descartados.map((x) => x.razon), ['estado:pausado', 'fuera de zona:centro']);

  const r3 = r.data.candidatos.find((c) => c.rider_id === 'rid-3');
  assert.ok(r3.faltantes.includes('sin capacidad declarada'));
  assert.ok(r3.faltantes.includes('sin zonas declaradas'));
  assert.ok(r3.faltantes.includes('sin posición fresca'));
  assert.strictEqual(r3.orden, 2, 'el orden es el declarado, no el conveniente');
});

test('capacidad 0 descarta: no hay hueco que optimizar', async () => {
  const riders = [{ rider_id: 'rid-1', plaza_id: 'plaza-malaga', estado: 'activo', zonas: ['centro'], capacidad: 0, coste: { eur_km: 0.25, eur_min: 0.1 } }];
  const { m } = nuevo({ riders, rutas: [], politica: POLITICA });
  const foto = (await m.onComponerRequest({ data: { project_id: 'plaza-malaga', pedido: PEDIDO, instante: '2026-11-03T21:00:00.000Z' } })).data.foto;
  const r = await m.onElegiblesRequest({ data: { project_id: 'plaza-malaga', foto } });
  assert.strictEqual(r.data.candidatos.length, 0);
  assert.strictEqual(r.data.descartados[0].razon, 'sin capacidad');
});

test('la foto tocada no reproduce su huella → 409 FOTO_ALTERADA', async () => {
  const { m } = nuevo({ riders: RIDERS, rutas: RUTAS, politica: POLITICA });
  const foto = (await m.onComponerRequest({ data: { project_id: 'plaza-malaga', pedido: PEDIDO, instante: '2026-11-03T21:00:00.000Z' } })).data.foto;

  const ok = await m.onReproducirRequest({ request_id: 'f4', data: { foto } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.data.huella, foto.huella);

  const tocada = JSON.parse(JSON.stringify(foto));
  tocada.riders[0].eta_tienda_min = 1;   // alguien «arregla» la foto para que pase
  const mal = await m.onReproducirRequest({ request_id: 'f5', data: { foto: tocada } });
  assert.strictEqual(mal.status, 409);
  assert.strictEqual(mal.error.code, 'FOTO_ALTERADA');
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

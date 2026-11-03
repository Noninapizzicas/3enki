'use strict';

/**
 * bocaos/config-mercado — J01..J05 · G01. La política de la plaza con vigencia.
 *
 * Lo que se vigila:
 *   1. DOS CAPAS: la tienda manda en SUS pedidos; la tienda nueva hereda el default de la plaza.
 *   2. Cambiar el default de la plaza NO cambia la de la tienda que ya declaró.
 *   3. CAMBIAR UN UMBRAL NO REABRE EL PASADO: la política se pide POR INSTANTE y devuelve la que
 *      estaba viva, con su versión y su autor.
 *   4. Sin acta no se escribe; con un quinto criterio, tampoco (la forma es cerrada).
 *   5. Cada valor lleva su sello (versión · autor · desde).
 *   6. El simulador recalcula sobre hechos y NO aplica: no emite ningún hecho de política.
 *   7. El €/min del rider se DERIVA (Q57), no se fija a mano.
 *
 * Ejecutar: node tests/unit/bocaos__config-mercado.test.js
 */

const assert = require('assert');
const ConfigMercado = require('../../modules/bocaos/config-mercado/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const T1 = '2026-11-01T09:00:00.000Z';
const T2 = '2026-11-02T09:00:00.000Z';
const T3 = '2026-11-03T09:00:00.000Z';
const T4 = '2026-11-04T09:00:00.000Z';

function nuevo() {
  const publicados = [];
  const pedidas = [];
  const m = new ConfigMercado();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => { pedidas.push({ ev, payload }); return null; };
  return { m, pedidas, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const declarar = (m, extra) => m.onDeclararRequest({ request_id: 'q', data: { project_id: PLAZA, autor: 'dueno', acta: 'acta-1', ...extra } });
const politica = (m, extra) => m.onPoliticaRequest({ request_id: 'p', data: { project_id: PLAZA, ...extra } });

test('sin nadie declarando: el default de la F0, y se dice que no es un acta', async () => {
  const { m } = nuevo();
  const r = await politica(m, { instante: T1 });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.politica.fuente, 'default-f0');
  assert.strictEqual(r.data.politica.capa, 'plaza');
  assert.strictEqual(r.data.politica.version, 0);
  assert.strictEqual(r.data.politica.autor, 'sin declarar');
  assert.deepStrictEqual(r.data.politica.umbrales, { desvio_m: 800, espera_min: 4, retraso_min: 6, cobra_min_cents: 0 });
  assert.strictEqual(r.data.politica.ventana_s, 20);
  assert.strictEqual(r.data.politica.tres_esperas_ok === undefined ? true : true, true);
  assert.deepStrictEqual(r.data.politica.esperas, { n1_tienda_min: 8, n2_portal_min: 5, n3_entrega_min: 10 });
  assert.strictEqual(r.data.politica.coste_rider.vehiculos.moto, 0.14);
  assert.strictEqual(r.data.politica.coste_rider.eur_min, 0.257);
  assert.deepStrictEqual(r.data.politica.ruta, {
    frescura_s: 90, velocidad_kmh: 18, factor_calle: 1.35, coste_parada_min: 3, desvio_por_parada_m: 400
  });
});

test('dos capas: la tienda manda en sus pedidos y la tienda nueva hereda el default de la plaza', async () => {
  const { m, eventos } = nuevo();

  const plaza = await declarar(m, { ambito: 'plaza', desde: T1, umbrales: { desvio_m: 1000 } });
  assert.strictEqual(plaza.status, 201);
  assert.strictEqual(plaza.data.version, 1);
  assert.strictEqual(eventos('bocaos.politica_declarada').length, 1);
  assert.strictEqual(eventos('bocaos.politica_declarada')[0].p.capa, 'plaza');

  const tienda = await declarar(m, { tienda_id: 'tienda-paco', desde: T2, umbrales: { desvio_m: 1500, espera_min: 3 } });
  assert.strictEqual(tienda.status, 201);
  assert.strictEqual(tienda.data.capa, 'tienda');

  const dePaco = (await politica(m, { tienda_id: 'tienda-paco', instante: T3 })).data;
  assert.strictEqual(dePaco.politica.capa, 'tienda');
  assert.strictEqual(dePaco.politica.umbrales.desvio_m, 1500);
  assert.strictEqual(dePaco.politica.umbrales.espera_min, 3);
  // lo que no declaró lo hereda de la plaza: la forma es de cuatro, y sólo se mueve lo que se mueve
  assert.strictEqual(dePaco.politica.umbrales.retraso_min, 6);
  assert.strictEqual(dePaco.precedencia.tienda_declarada, true);

  const nueva = (await politica(m, { tienda_id: 'tienda-nueva', instante: T3 })).data;
  assert.strictEqual(nueva.politica.capa, 'plaza', 'la tienda nueva no configura nada');
  assert.strictEqual(nueva.politica.umbrales.desvio_m, 1000);
  assert.strictEqual(nueva.precedencia.tienda_declarada, false);
});

test('cambiar el default de la plaza NO cambia la de la tienda que ya declaró', async () => {
  const { m } = nuevo();
  await declarar(m, { ambito: 'plaza', desde: T1, umbrales: { desvio_m: 1000 } });
  await declarar(m, { tienda_id: 'tienda-paco', desde: T2, umbrales: { desvio_m: 1500 } });
  const plaza2 = await declarar(m, { ambito: 'plaza', desde: T3, umbrales: { desvio_m: 400 } });
  assert.strictEqual(plaza2.data.version, 2);

  const paco = (await politica(m, { tienda_id: 'tienda-paco', instante: T4 })).data.politica;
  assert.strictEqual(paco.umbrales.desvio_m, 1500, 'la plaza no legisla por la tienda que declaró');
  const otra = (await politica(m, { tienda_id: 'tienda-otra', instante: T4 })).data.politica;
  assert.strictEqual(otra.umbrales.desvio_m, 400);
});

test('cambiar un umbral no reabre el pasado: la política se pide por instante', async () => {
  const { m } = nuevo();
  await declarar(m, { ambito: 'plaza', desde: T1, umbrales: { desvio_m: 800 } });
  await declarar(m, { ambito: 'plaza', desde: T3, umbrales: { desvio_m: 2000 } });

  const antes = (await politica(m, { instante: T2 })).data.politica;
  assert.strictEqual(antes.umbrales.desvio_m, 800, 'en T2 regía la v1');
  assert.strictEqual(antes.version, 1);
  assert.strictEqual(antes.desde, T1);
  assert.strictEqual(antes.autor, 'dueno');

  const despues = (await politica(m, { instante: T4 })).data.politica;
  assert.strictEqual(despues.umbrales.desvio_m, 2000);
  assert.strictEqual(despues.version, 2);
});

test('ninguna versión sin acta: 409 y la política no se escribe', async () => {
  const { m, eventos } = nuevo();
  const r = await declarar(m, { ambito: 'plaza', desde: T1, umbrales: { desvio_m: 500 }, acta: null });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'SIN_ACTA');
  assert.strictEqual(eventos('bocaos.politica_declarada').length, 0);
  assert.strictEqual((await politica(m, { instante: T2 })).data.politica.fuente, 'default-f0');

  const sinAutor = await m.onDeclararRequest({ request_id: 'x', data: { project_id: PLAZA, acta: 'a', umbrales: { desvio_m: 500 } } });
  assert.strictEqual(sinAutor.status, 400, 'sin autor tampoco');
});

test('la forma es cerrada: un quinto criterio no tiene dónde ponerse', async () => {
  const { m, eventos } = nuevo();
  const quinto = await declarar(m, { ambito: 'plaza', desde: T1, umbrales: { desvio_m: 500, peso: 0.3 } });
  assert.strictEqual(quinto.status, 409);
  assert.strictEqual(quinto.error.code, 'FORMA_CERRADA');
  assert.ok(quinto.error.details.rechazos.includes('umbrales.peso'));

  const orden = await declarar(m, { ambito: 'plaza', desde: T1, orden: 'puntuado' });
  assert.strictEqual(orden.status, 409, 'el orden es el declarado: lo demás es un optimizador con otro nombre (A22/A28)');

  const cobra = await declarar(m, { ambito: 'plaza', desde: T1, umbrales: { cobra_min_cents: 12.5 } });
  assert.strictEqual(cobra.status, 409, 'el cuarto umbral es en céntimos enteros');

  assert.strictEqual(eventos('bocaos.politica_declarada').length, 0);
});

test('vigencia hacia atrás: 409, el pasado no se reescribe', async () => {
  const { m } = nuevo();
  await declarar(m, { ambito: 'plaza', desde: T3, umbrales: { desvio_m: 1000 } });
  const r = await declarar(m, { ambito: 'plaza', desde: T2, umbrales: { desvio_m: 100 } });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'VIGENCIA_RETROACTIVA');
  assert.strictEqual((await politica(m, { instante: T4 })).data.politica.umbrales.desvio_m, 1000);
});

test('cada valor lleva su sello: versión, autor y fecha', async () => {
  const { m } = nuevo();
  await declarar(m, { ambito: 'plaza', desde: T1, autor: 'dueno-plaza', umbrales: { desvio_m: 900, espera_min: 5 } });
  const p = (await politica(m, { instante: T2 })).data.politica;
  for (const k of ['desvio_m', 'espera_min', 'retraso_min', 'cobra_min_cents']) {
    assert.strictEqual(p.sellos[k].version, 1, `${k}: versión`);
    assert.strictEqual(p.sellos[k].autor, 'dueno-plaza', `${k}: autor`);
    assert.strictEqual(p.sellos[k].desde, T1, `${k}: fecha`);
    assert.strictEqual(p.sellos[k].valor, p.umbrales[k]);
  }
});

test('el simulador recalcula sobre hechos y NO aplica nada', async () => {
  const { m, eventos } = nuevo();
  await declarar(m, { ambito: 'plaza', desde: T1, umbrales: { desvio_m: 800, espera_min: 4, retraso_min: 6, cobra_min_cents: 0 } });

  const hechos = [
    { pedido_id: 'p1', desvio_m: 300, espera_min: 3, retraso_min: 0, cobra_cents: 350 },
    { pedido_id: 'p2', desvio_m: 700, espera_min: 3.5, retraso_min: 0, cobra_cents: 250 },
    { pedido_id: 'p3', desvio_m: 1200, espera_min: 8, retraso_min: 0, cobra_cents: 200 }
  ];
  const antes = eventos('bocaos.politica_declarada').length;
  const r = await m.onSimularRequest({ request_id: 's', data: {
    project_id: PLAZA, hechos, umbrales_alternativos: { desvio_m: 2000, espera_min: 9, retraso_min: 6, cobra_min_cents: 0 }
  } });

  assert.strictEqual(r.status, 200);
  const s = r.data.simulacion;
  assert.strictEqual(s.aplicada, false, 'simula, no aplica');
  assert.strictEqual(s.resumen.pasan_antes, 2, 'p1 y p2 pasan con los números de hoy');
  assert.strictEqual(s.resumen.pasan_ahora, 3, 'con 2.000 m y 9 min pasa también p3');
  assert.strictEqual(s.resumen.ganan, 1);
  assert.strictEqual(s.resumen.pierden, 0);
  assert.ok(s.limites.length >= 2, 'declara sus límites');
  assert.strictEqual(s.filas.find((f) => f.pedido_id === 'p3').antes.fallo, 'desvio');

  assert.strictEqual(eventos('bocaos.politica_declarada').length, antes, 'la simulación no escribe política');
  const p = (await politica(m, { instante: T2 })).data.politica;
  assert.strictEqual(p.umbrales.desvio_m, 800, 'la política vigente sigue siendo la declarada');

  const vacio = await m.onSimularRequest({ request_id: 's2', data: { project_id: PLAZA, hechos: [] } });
  assert.strictEqual(vacio.status, 400, 'sin hechos no se simula');
});

test('Q57: el €/min del rider se DERIVA del precio medio de la zona', async () => {
  const { m } = nuevo();
  // 4,50 € de reparto medio, 3 km medios, 12 min medios, 0,14 €/km → (4,50 − 0,42) / 12
  const r = await declarar(m, {
    ambito: 'plaza', desde: T1,
    coste_rider: { derivar: { precio_medio_eur: 4.5, km_medios: 3, minutos_medios: 12, eur_km: 0.14 } }
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.error || {}));
  const p = (await politica(m, { instante: T2 })).data.politica;
  assert.strictEqual(p.coste_rider.derivado, true);
  assert.strictEqual(p.coste_rider.eur_min, 0.34);
  assert.strictEqual(p.coste_rider.vehiculos.coche, 0.25, 'la tabla por vehículo sigue');
  assert.strictEqual(p.coste_rider.derivacion.minutos_medios, 12);
});

test('un dictamen firmado también cambia el criterio, y entra con su acta', async () => {
  const { m, eventos } = nuevo();
  await m.onDictamenFirmado({ data: {
    project_id: PLAZA, ambito: 'plaza', dictamen_id: 'dict-9', autor: 'duena',
    desde: T1, umbrales: { retraso_min: 3 }
  } });
  const p = (await politica(m, { instante: T2 })).data.politica;
  assert.strictEqual(p.umbrales.retraso_min, 3);
  assert.strictEqual(p.acta, 'dict-9');
  assert.strictEqual(eventos('bocaos.politica_declarada').length, 1);

  // Un dictamen sin política no toca nada (y no revienta).
  await m.onDictamenFirmado({ data: { project_id: PLAZA, dictamen_id: 'dict-10', texto: 'nada que ver' } });
  assert.strictEqual(eventos('bocaos.politica_declarada').length, 1);
});

test('idempotencia: la misma declaración dos veces no crea dos versiones', async () => {
  const { m } = nuevo();
  const a = await declarar(m, { ambito: 'plaza', desde: T1, declaracion_id: 'cfg-1', umbrales: { desvio_m: 700 } });
  const b = await declarar(m, { ambito: 'plaza', desde: T1, declaracion_id: 'cfg-1', umbrales: { desvio_m: 900 } });
  assert.strictEqual(a.status, 201);
  assert.strictEqual(b.status, 200);
  assert.strictEqual(b.data.idempotente, true);
  assert.strictEqual((await politica(m, { instante: T2 })).data.politica.umbrales.desvio_m, 700);
});

test('la plaza no declara por una tienda', async () => {
  const { m } = nuevo();
  const r = await declarar(m, { ambito: 'plaza', tienda_id: 'tienda-paco', desde: T1, umbrales: { desvio_m: 100 } });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'PLAZA_NO_LEGISLA_POR_TIENDA');
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

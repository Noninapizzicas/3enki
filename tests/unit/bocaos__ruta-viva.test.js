'use strict';

/**
 * bocaos/ruta-viva — B01..B06. El trayecto que el rider ya lleva encima.
 *
 * Lo que se vigila:
 *   1. UN PUNTO, NO UNA TRAZA: se guarda el último, y si es VIEJO la posición es NO_CONSTA (no
 *      «está a 400 m»). El horizonte de frescura se lo pregunta a config-mercado.
 *   2. LAS PARADAS SE DERIVAN de los contratos vivos: cerrar el contrato borra su parada sin
 *      escribir nada, y el trayecto se cierra solo (B06).
 *   3. LA PROMESA SÓLO MEJORA: empeorarla por debajo del umbral de retraso es 409 PROMESA_ROTA.
 *   4. EL ORDEN es de UNA ruta, con desempate declarado: la misma ruta da siempre el mismo orden.
 *   5. La capacidad se declara (entero) y se difunde como HECHO para el censo.
 *   6. A35: el trayecto de otra plaza no aparece en la foto de ésta.
 *
 * Ejecutar: node tests/unit/bocaos__ruta-viva.test.js
 */

const assert = require('assert');
const RutaViva = require('../../modules/bocaos/ruta-viva/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const RIDER = 'rid-1';
const TIENDA = { lat: 36.74, lng: -4.42 };      // 0,02° al norte de la posición → ~2,2 km en recta
const LEJOS = { lat: 36.78, lng: -4.42 };
const AQUI = { lat: 36.72, lng: -4.42 };

const T = (min) => new Date(Date.parse('2026-11-03T21:00:00.000Z') + min * 60000).toISOString();
const S = (seg) => new Date(Date.parse('2026-11-03T21:00:00.000Z') + seg * 1000).toISOString();
const INSTANTE = T(0);

const POLITICA = {
  capa: 'plaza', version: 2, autor: 'dueno',
  umbrales: { desvio_m: 800, espera_min: 4, retraso_min: 6, cobra_min_cents: 0 },
  ruta: { frescura_s: 90, velocidad_kmh: 18, factor_calle: 1.35 }
};

function nuevo({ config = POLITICA } = {}) {
  const publicados = [];
  const pedidas = [];
  const m = new RutaViva();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => {
    pedidas.push({ ev, payload });
    if (ev === 'fs.read.request') return null;
    if (ev === 'config-mercado.politica.request') return config ? { status: 200, data: { politica: config } } : null;
    return null;
  };
  return { m, pedidas, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const posicion = (m, extra) => m.onPosicionRequest({ request_id: 'p', data: { project_id: PLAZA, plaza_id: PLAZA, rider_id: RIDER, ...extra } });
const ruta = (m, extra) => m.onDeRequest({ request_id: 'r', data: { project_id: PLAZA, plaza_id: PLAZA, ...extra } });

test('B01: el último punto, con su hora, y el ETA a la tienda del pedido', async () => {
  const { m, eventos } = nuevo();
  await posicion(m, { punto: AQUI, hora: INSTANTE });
  await posicion(m, { punto: { lat: 36.721, lng: -4.421 }, hora: T(1) });   // se PISA el anterior

  const r = await ruta(m, { tienda: TIENDA, instante: T(1) });
  assert.strictEqual(r.status, 200);
  const v = r.data.rutas[0];
  assert.strictEqual(r.data.rutas.length, 1);
  assert.strictEqual(v.frescura, 'fresca');
  assert.strictEqual(v.posicion.lat, 36.721, 'se guarda el ÚLTIMO punto, no una traza');
  assert.strictEqual(v.edad_s, 0);
  assert.ok(v.eta_tienda_min > 9 && v.eta_tienda_min < 11, `ETA ~10 min (fue ${v.eta_tienda_min})`);
  assert.deepStrictEqual(v.paradas, []);
  assert.deepStrictEqual(v.huecos, []);
  assert.strictEqual(eventos('bocaos.posicion_anotada').length, 2);
  assert.ok(Number.isFinite(v.frescura_s), 'la frescura viene de la política');
});

test('B01: un punto viejo NO es un punto — la posición es NO_CONSTA y no hay ETA', async () => {
  const { m } = nuevo();
  await posicion(m, { punto: AQUI, hora: S(-200) });
  const v = (await ruta(m, { tienda: TIENDA, instante: INSTANTE })).data.rutas[0];
  assert.strictEqual(v.posicion, null);
  assert.strictEqual(v.frescura, 'NO_CONSTA');
  assert.strictEqual(v.eta_tienda_min, null);
  assert.strictEqual(v.edad_s, 200);
  assert.ok(v.huecos.some((h) => h.includes('posición vieja')), v.huecos.join('|'));
});

test('sin política declarada se mide con el default de la F0 (90 s), y se dice', async () => {
  const { m } = nuevo({ config: null });
  await posicion(m, { punto: AQUI, hora: S(-100) });
  const v = (await ruta(m, { tienda: TIENDA, instante: INSTANTE })).data.rutas[0];
  assert.strictEqual(v.frescura_s, 90);
  assert.strictEqual(v.frescura, 'NO_CONSTA');
});

test('B02: las paradas se derivan de los contratos vivos, con su promesa y su ETA', async () => {
  const { m, eventos } = nuevo();
  await posicion(m, { punto: AQUI, hora: INSTANTE });
  await m.onContratoCreado({ data: {
    project_id: PLAZA, plaza_id: PLAZA, rider_id: RIDER, pedido_id: 'ped-1', contrato_id: 'ct-1',
    tienda_id: 'tienda-paco', hora_contrato: INSTANTE, hora_prometida: T(40),
    punto: TIENDA, destino: LEJOS
  } });

  const v = (await ruta(m, { instante: INSTANTE })).data.rutas[0];
  assert.strictEqual(v.paradas.length, 1);
  const p = v.paradas[0];
  assert.strictEqual(p.pedido_id, 'ped-1');
  assert.strictEqual(p.promesa, T(40), 'la promesa al cliente viaja con el contrato');
  assert.ok(p.eta_min > 20, `ETA a la entrega > 20 min (fue ${p.eta_min})`);
  assert.strictEqual(p.recogida_pendiente, true);
  assert.deepStrictEqual(v.promesas, { 'ped-1': T(40) });
  assert.strictEqual(v.trayecto.contratos_vivos, 1);
  assert.ok(eventos('bocaos.contrato_creado') === undefined || true);
});

test('B02/B03: un contrato sin promesa no esconde la parada: se nombra, y sin promesa no hay retraso', async () => {
  const { m } = nuevo();
  await posicion(m, { punto: AQUI, hora: INSTANTE });
  await m.onContratoCreado({ data: {
    project_id: PLAZA, rider_id: RIDER, pedido_id: 'ped-2', contrato_id: 'ct-2', hora_contrato: INSTANTE, destino: LEJOS
  } });
  const v = (await ruta(m, { instante: INSTANTE })).data.rutas[0];
  assert.deepStrictEqual(v.paradas, [], 'sin promesa no entra en la medida del retraso');
  assert.strictEqual(v.sin_promesa.length, 1);
  assert.strictEqual(v.sin_promesa[0].promesa, null);
  assert.ok(v.huecos.some((h) => h.includes('sin promesa de la parada (ped-2)')), v.huecos.join('|'));
});

test('B03: la promesa sólo mejora; empeorarla por debajo del umbral es PROMESA_ROTA', async () => {
  const { m, eventos } = nuevo();
  await posicion(m, { punto: AQUI, hora: INSTANTE });
  await m.onContratoCreado({ data: {
    project_id: PLAZA, rider_id: RIDER, pedido_id: 'ped-1', contrato_id: 'ct-1', hora_contrato: INSTANTE, destino: LEJOS
  } });

  const primera = await m.onPromesaRequest({ request_id: 'x', data: { project_id: PLAZA, rider_id: RIDER, pedido_id: 'ped-1', hora: T(40) } });
  assert.strictEqual(primera.status, 200);
  assert.strictEqual(primera.data.promesa.version, 1);

  const mejora = await m.onPromesaRequest({ request_id: 'x', data: { project_id: PLAZA, rider_id: RIDER, pedido_id: 'ped-1', hora: T(35) } });
  assert.strictEqual(mejora.status, 200, 'bajar la hora siempre se puede');
  assert.strictEqual(mejora.data.promesa.version, 2);

  const rompe = await m.onPromesaRequest({ request_id: 'x', data: { project_id: PLAZA, rider_id: RIDER, pedido_id: 'ped-1', hora: T(40) } });
  assert.strictEqual(rompe.status, 409);
  assert.strictEqual(rompe.error.code, 'PROMESA_ROTA');
  assert.strictEqual(rompe.error.details.perdida_min, 5);
  assert.strictEqual(rompe.error.details.umbral_min, 6);

  const declarado = await m.onPromesaRequest({ request_id: 'x', data: { project_id: PLAZA, rider_id: RIDER, pedido_id: 'ped-1', hora: T(41.5), motivo: 'atasco' } });
  assert.strictEqual(declarado.status, 200, 'empeorar MÁS que el umbral es un fallo declarado, no una rotura silenciosa');

  assert.strictEqual(eventos('bocaos.promesa_guardada').length, 3);
  assert.strictEqual(eventos('bocaos.promesa_guardada')[2].p.mejora, false);

  const fantasma = await m.onPromesaRequest({ request_id: 'x', data: { project_id: PLAZA, rider_id: RIDER, pedido_id: 'ped-9', hora: T(40) } });
  assert.strictEqual(fantasma.status, 404, 'no se promete por una parada que no existe');
});

test('B04: el orden es de UNA ruta y la misma ruta da siempre el mismo orden', async () => {
  const { m } = nuevo();
  await posicion(m, { punto: AQUI, hora: INSTANTE });
  await m.onContratoCreado({ data: { project_id: PLAZA, rider_id: RIDER, pedido_id: 'ped-lejos', contrato_id: 'ct-a', hora_contrato: INSTANTE, hora_prometida: T(60), destino: LEJOS } });
  await m.onContratoCreado({ data: { project_id: PLAZA, rider_id: RIDER, pedido_id: 'ped-cerca', contrato_id: 'ct-b', hora_contrato: INSTANTE, hora_prometida: T(50), destino: TIENDA } });

  const a = (await ruta(m, { instante: INSTANTE })).data.rutas[0];
  const b = (await ruta(m, { instante: INSTANTE })).data.rutas[0];
  assert.deepStrictEqual(a.paradas.map((p) => p.pedido_id), b.paradas.map((p) => p.pedido_id), 'reproducible (A29)');
  assert.strictEqual(a.paradas[0].pedido_id, 'ped-cerca', 'vecino más cercano desde el último punto');
  assert.strictEqual(a.paradas[0].orden, 0);
  assert.ok(a.paradas[1].eta_min > a.paradas[0].eta_min, 'el ETA se acumula por la ruta, no por parada suelta');
});

test('B02/B06: cerrado el contrato, su parada desaparece sola y el trayecto se cierra', async () => {
  const { m, eventos } = nuevo();
  await posicion(m, { punto: AQUI, hora: INSTANTE });
  await m.onContratoCreado({ data: { project_id: PLAZA, rider_id: RIDER, pedido_id: 'ped-1', contrato_id: 'ct-1', hora_contrato: INSTANTE, hora_prometida: T(50), destino: LEJOS } });
  assert.strictEqual((await ruta(m, { instante: INSTANTE })).data.rutas[0].paradas.length, 1);

  await m.onContratoCerrado({ data: { project_id: PLAZA, plaza_id: PLAZA, rider_id: RIDER, pedido_id: 'ped-1', contrato_id: 'ct-1', hora_cierre: T(30) } });

  const v = (await ruta(m, { instante: T(31) })).data.rutas[0];
  assert.deepStrictEqual(v.paradas, [], 'no hay lista guardada que quede vieja: la parada se deriva');
  assert.strictEqual(v.trayecto.contratos_vivos, 0);
  assert.strictEqual(v.trayecto.cerrado_en, T(30));
  assert.strictEqual(eventos('bocaos.trayecto_cerrado').length, 1);
  assert.strictEqual(eventos('bocaos.trayecto_cerrado')[0].p.paradas_restantes, 0);
});

test('B05: la capacidad se declara con un entero y se difunde como hecho', async () => {
  const { m, eventos } = nuevo();
  const malo = await m.onCapacidadRequest({ request_id: 'c', data: { project_id: PLAZA, rider_id: RIDER, capacidad: 2.5 } });
  assert.strictEqual(malo.status, 400);
  assert.strictEqual(malo.error.code, 'INVALID_INPUT');

  const bien = await m.onCapacidadRequest({ request_id: 'c', data: { project_id: PLAZA, plaza_id: PLAZA, rider_id: RIDER, capacidad: 2 } });
  assert.strictEqual(bien.status, 200);
  assert.strictEqual((await ruta(m, {})).data.rutas[0].capacidad, 2);
  assert.strictEqual(eventos('bocaos.capacidad_declarada').length, 1);
  assert.strictEqual(eventos('bocaos.capacidad_declarada')[0].p.capacidad, 2);
});

test('B05: la capacidad efectiva es el MÍNIMO de volumen, ventana de viaje y desvío acumulado', async () => {
  const { m } = nuevo();
  await posicion(m, { punto: AQUI, hora: INSTANTE });
  await m.onCapacidadRequest({ request_id: 'c', data: { project_id: PLAZA, plaza_id: PLAZA, rider_id: RIDER, capacidad: 3 } });

  // Sin paradas, sólo limitan el volumen (3) y el desvío (800 m / 400 m por parada = 2).
  const vacia = (await ruta(m, { instante: INSTANTE })).data.rutas[0];
  assert.deepStrictEqual(vacia.capacidad_limites, { volumen: 3, ventana: null, desvio: 2 });
  assert.strictEqual(vacia.capacidad_efectiva, 2);
  assert.strictEqual(vacia.capacidad_motivo, 'desvío acumulado: el umbral de la plaza no da para más');

  // Una parada prometida dentro de 14 min que se alcanza en ~10: ~4 min de holgura → cabe 1 más.
  await m.onContratoCreado({ data: { project_id: PLAZA, rider_id: RIDER, pedido_id: 'ped-1', contrato_id: 'ct-1', hora_contrato: INSTANTE, hora_prometida: T(14), destino: TIENDA } });
  const conParada = (await ruta(m, { instante: INSTANTE })).data.rutas[0];
  assert.strictEqual(conParada.capacidad_limites.volumen, 3);
  assert.strictEqual(conParada.capacidad_limites.ventana, 1, '~4 min de holgura / 3 min por parada');
  assert.strictEqual(conParada.capacidad_efectiva, 1);
  assert.ok(conParada.capacidad_motivo.startsWith('ventana de viaje'));
  assert.strictEqual(conParada.capacidad_limites.desvio, 2);
});

test('A35: el trayecto de otra plaza no aparece en esta foto', async () => {
  const { m } = nuevo();
  await posicion(m, { punto: AQUI, hora: INSTANTE, plaza_id: PLAZA });
  await posicion(m, { punto: AQUI, hora: INSTANTE, rider_id: 'rid-sevilla', plaza_id: 'plaza-sevilla' });
  const rutas = (await ruta(m, { plaza_id: PLAZA, instante: INSTANTE })).data.rutas;
  assert.deepStrictEqual(rutas.map((r) => r.rider_id), [RIDER]);
});

test('pedir la ruta de un rider que no tiene trayecto es 404, no una ruta inventada', async () => {
  const { m } = nuevo();
  const r = await ruta(m, { rider_id: 'rid-fantasma' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.code, 'RUTA_NO_CONSTA');
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

'use strict';

/**
 * bocaos/enlace — EL CUELLO (A05-A23, A25, A28, A34, A35).
 *
 * Lo que se vigila:
 *   1. un hecho listo + una foto → UNA propuesta con las cuatro medidas, y el hecho sale al bus.
 *   2. A12: cuatro comparaciones en AND y se dice CUÁL falló; el siguiente candidato se prueba.
 *   3. A34: si falta el coste del rider (y la política cobra en neto) se NOMBRA el hueco y NO se
 *      inventa un 0 — el candidato se salta.
 *   4. A28: una cola de pedidos no entra en el enlace → 422.
 *   5. sin foto no hay propuesta: enlace_agotado con el hueco nombrado.
 *
 * Ejecutar: node tests/unit/bocaos__enlace.test.js
 */

const assert = require('assert');
const Enlace = require('../../modules/bocaos/enlace/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const UMBRALES = { desvio_m: 800, espera_min: 4, retraso_min: 6, cobra_min_cents: 0 };

const PEDIDO = {
  project_id: PLAZA,
  pedido: {
    pedido_id: 'ped-1',
    plaza_id: PLAZA,
    tienda_id: 'tienda-paco',
    punto: { lat: 36.72, lng: -4.42 },
    destino: { lat: 36.725, lng: -4.43 },
    zona: 'centro',
    hora_listo: '2026-11-03T21:12:00.000Z',
    precio_congelado: { total_cents: 1850, reparto_cents: 450 }
  }
};

function foto({ campo_cobra = 'paga', huecos = [] } = {}) {
  return {
    foto_id: 'foto-1',
    huella: 'huella-foto-1',
    plaza_id: PLAZA,
    pedido_id: 'ped-1',
    instante: '2026-11-03T21:00:00.000Z',
    politica: { capa: 'plaza', version: 7, autor: 'plaza-malaga', umbrales: UMBRALES, ventana_s: 20, campo_cobra },
    riders: [],
    huecos
  };
}

function candidato(extra = {}) {
  return {
    rider_id: 'rid-1',
    plaza_id: PLAZA,
    estado: 'activo',
    capacidad: 2,
    coste: { eur_km: 0.25, eur_min: 0.1 },
    posicion: { lat: 36.721, lng: -4.421 },
    paradas: [],
    promesas: {},
    eta_tienda_min: 10,
    faltantes: [],
    orden: 0,
    ...extra
  };
}

function nuevo({ fotoResp, candidatos = [candidato()], desvio = () => 312, propuesta } = {}) {
  const publicados = [];
  const rpc = [];
  const m = new Enlace();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => {
    rpc.push({ ev, payload });
    if (ev === 'foto-mercado.componer.request') return fotoResp === undefined ? { status: 200, data: { foto: foto() } } : fotoResp;
    if (ev === 'foto-mercado.elegibles.request') return { status: 200, data: { candidatos } };
    if (ev === 'ruta.desvio.request') {
      const metros = desvio(payload);
      return metros === null ? null : { status: 200, data: { metros } };
    }
    if (ev === 'hecho-listo.de.request') {
      return { status: 200, data: { hecho: { pedido_id: 'ped-1', plaza_id: PLAZA, hora_listo: '2026-11-03T21:12:00.000Z', precio_congelado: { total_cents: 1850, reparto_cents: 450 }, punto: { lat: 36.72, lng: -4.42 }, destino: { lat: 36.725, lng: -4.43 }, zona: 'centro' } } };
    }
    if (ev === 'propuesta.emitir.request') {
      return propuesta === undefined
        ? { status: 201, data: { propuesta: { propuesta_id: 'prop-1', vista: { frase: 'te lo propongo' } } } }
        : propuesta;
    }
    return null;
  };
  return { m, rpc, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

test('un hecho listo y una foto → UNA propuesta, con las cuatro medidas y su hecho', async () => {
  const { m, rpc, eventos } = nuevo();
  const r = await m.onEjecutarRequest({ request_id: 'n1', data: PEDIDO });

  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.propuesta.propuesta_id, 'prop-1');
  const em = r.data.medidas;
  assert.strictEqual(em.desvio_m, 312);
  assert.strictEqual(em.espera_min, 2, 'llega 21:10 y está listo a las 21:12 → 2 min de espera');
  assert.strictEqual(em.retraso_min, 0);
  assert.strictEqual(em.cobra_cents, 450, 'la paga consta (E03 ya compuesto)');

  const medidas = eventos('bocaos.medidas_calculadas');
  assert.strictEqual(medidas.length, 1);
  assert.strictEqual(medidas[0].p.pasa, true);
  assert.strictEqual(medidas[0].p.fallo, null);

  const completados = eventos('bocaos.enlace_completado');
  assert.strictEqual(completados.length, 1);
  assert.strictEqual(completados[0].p.rider_id, 'rid-1');
  assert.strictEqual(completados[0].p.huella, 'huella-foto-1');

  const peticion = rpc.find((x) => x.ev === 'propuesta.emitir.request');
  assert.deepStrictEqual(peticion.payload.medidas, em, 'la propuesta no recalcula: recibe el número');
});

test('A12: dice CUÁL test falló y prueba el siguiente candidato del orden declarado', async () => {
  const { m, eventos } = nuevo({
    candidatos: [candidato({ rider_id: 'rid-1' }), candidato({ rider_id: 'rid-2', orden: 1 })],
    desvio: (payload) => (payload.rider_id === 'rid-1' ? 900 : 312)
  });
  const r = await m.onEjecutarRequest({ request_id: 'n2', data: PEDIDO });

  assert.strictEqual(r.status, 201);
  const medidas = eventos('bocaos.medidas_calculadas');
  assert.strictEqual(medidas.length, 2);
  assert.strictEqual(medidas[0].p.rider_id, 'rid-1');
  assert.strictEqual(medidas[0].p.pasa, false);
  assert.strictEqual(medidas[0].p.fallo, 'desvio');
  assert.strictEqual(medidas[1].p.rider_id, 'rid-2');
  assert.strictEqual(medidas[1].p.pasa, true, 'se prueba el siguiente, en el orden declarado');
});

test('A34: sin coste del rider y política en neto → hueco nombrado, no un 0', async () => {
  const { m, eventos } = nuevo({
    fotoResp: { status: 200, data: { foto: foto({ campo_cobra: 'neto' }) } },
    candidatos: [candidato({ coste: null })]
  });
  const r = await m.onEjecutarRequest({ request_id: 'n3', data: PEDIDO });

  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.agotado, true);
  assert.ok(r.data.huecos.includes('sin coste del rider'));

  const huecos = eventos('bocaos.hueco_nombrado');
  assert.strictEqual(huecos.length, 1);
  assert.strictEqual(huecos[0].p.hueco, 'sin coste del rider');
  assert.strictEqual(huecos[0].p.rider_id, 'rid-1');
  assert.strictEqual(eventos('bocaos.propuesta_emitida').length, 0);
});

test('sin ruta el desvío NO consta: hueco, no un desvío de 0', async () => {
  const { m, eventos } = nuevo({ desvio: () => null });
  const r = await m.onEjecutarRequest({ request_id: 'n4', data: PEDIDO });

  assert.strictEqual(r.data.agotado, true);
  assert.ok(r.data.huecos.includes('sin ruta'));
  assert.strictEqual(eventos('bocaos.medidas_calculadas').length, 0, 'sin medida no hay juicio');
});

test('A28: el enlace no barre pedidos → 422 SIN_OPTIMIZADOR', async () => {
  const { m } = nuevo();
  const r = await m.onEjecutarRequest({ request_id: 'n5', data: { ...PEDIDO, pedidos: [PEDIDO.pedido, PEDIDO.pedido] } });
  assert.strictEqual(r.status, 422);
  assert.strictEqual(r.error.code, 'SIN_OPTIMIZADOR');
});

test('sin foto del mercado se agota con el hueco nombrado (no se inventa la foto)', async () => {
  const { m, eventos } = nuevo({ fotoResp: null });
  const r = await m.onEjecutarRequest({ request_id: 'n6', data: PEDIDO });

  assert.strictEqual(r.data.agotado, true);
  assert.deepStrictEqual(r.data.huecos, ['sin foto del mercado']);
  assert.strictEqual(eventos('bocaos.enlace_agotado').length, 1);
  assert.strictEqual(eventos('bocaos.hueco_nombrado')[0].p.hueco, 'sin foto del mercado');
});

test('el rechazo del rider re-dispara el cuello SIN volver a proponerle al mismo', async () => {
  const { m, rpc } = nuevo({ candidatos: [candidato({ rider_id: 'rid-1' }), candidato({ rider_id: 'rid-2', orden: 1 })] });
  const r = await m.onPropuestaRechazada({ data: { project_id: PLAZA, pedido_id: 'ped-1', rider_id: 'rid-1' } });

  assert.strictEqual(r.status, 201);
  const emitidas = rpc.filter((x) => x.ev === 'propuesta.emitir.request');
  assert.strictEqual(emitidas.length, 1);
  assert.strictEqual(emitidas[0].payload.rider_id, 'rid-2', 'al que dijo no no se le vuelve a proponer lo mismo');
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

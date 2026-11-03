'use strict';

/**
 * bocaos · PELDAÑO 0 — la plaza sola, un pedido de punta a punta, SOLO por eventos.
 *
 * Nueve islas conectadas a un bus de mentira. Ningún módulo conoce a otro: no hay un solo
 * require entre ellos y el bus es lo único que los une. Si la cadena pasa aquí, pasa por
 * eventos; si dependiera de una llamada directa, este test no existiría.
 *
 *   1. la tienda da de alta el pedido            → tienda-captura  → pedido.crear.request
 *   2. la plaza lo crea con precio congelado     → pedido          → bocaos.pedido_creado
 *   3. la tienda lo acepta                       → pedido          → bocaos.pedido_aceptado
 *   4. la tienda declara LISTO                   → tienda-hora-listo → bocaos.listo_declarado
 *   5. la plaza anota el HECHO con su sello      → hecho-listo     → bocaos.pedido_listo
 *   6. se compone el instante                    → foto-mercado    (pide estado y ruta al bus)
 *   7. se decide a quién (4 umbrales, en AND)    → enlace          → propuesta.emitir.request
 *   8. la propuesta y su ventana                 → propuesta
 *   9. el rider dice sí → contrato puntual       → contrato-puntual → bocaos.contrato_creado
 *  10. el reparto se mide (acta con relojes)     → hechos-reparto  → bocaos.prueba_anotada
 *
 * Los puertos que no son de este peldaño (estado-parte, ruta-viva, config-mercado, el canal del
 * rider) se contestan desde el bus como cualquier otro módulo: son puertos, no funciones.
 *
 * Ejecutar: node tests/unit/bocaos__peldano0-cadena.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TiendaCaptura = require('../../modules/bocaos/tienda-captura/index.js');
const Pedido = require('../../modules/bocaos/pedido/index.js');
const TiendaHoraListo = require('../../modules/bocaos/tienda-hora-listo/index.js');
const HechoListo = require('../../modules/bocaos/hecho-listo/index.js');
const FotoMercado = require('../../modules/bocaos/foto-mercado/index.js');
const Enlace = require('../../modules/bocaos/enlace/index.js');
const Propuesta = require('../../modules/bocaos/propuesta/index.js');
const ContratoPuntual = require('../../modules/bocaos/contrato-puntual/index.js');
const HechosReparto = require('../../modules/bocaos/hechos-reparto/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const TIENDA = 'tienda-paco';
const PRECIO = { total_cents: 1850, moneda: 'EUR', reparto_cents: 450 };

// La foto se compone con el reloj de verdad: el test no congela el mundo, lo sitúa.
// El pedido está listo dentro de 12 min; el rider llega en 10 → 2 min de espera.
const T0 = Date.now();
const T = (min) => new Date(T0 + min * 60000).toISOString();
const LISTO = T(12);
const ACUSE = T(0.1);
const SI = T(0.2);
const RECOGIDA = T(12);
const ENTREGA = T(27);

// ─── el bus: publica a TODOS los suscritos y guarda los hechos ───
function crearBus() {
  const subs = new Map();
  const publicados = [];
  let pendientes = [];
  return {
    publicados,
    eventos: (ev) => publicados.filter((x) => x.ev === ev),
    subscribe(ev, fn) {
      const a = subs.get(ev) || [];
      a.push(fn);
      subs.set(ev, a);
      return () => subs.set(ev, (subs.get(ev) || []).filter((f) => f !== fn));
    },
    publish(ev, payload) {
      const copia = JSON.parse(JSON.stringify(payload ?? {}));
      publicados.push({ ev, p: copia });
      for (const fn of subs.get(ev) || []) {
        // Despacho SÍNCRONO, como el bus de Enki: el handler empieza ya y lo que publique
        // se ve en el acto. El `await` del que llama es lo que deja correr los microtasks.
        try {
          const r = fn({ data: copia });
          if (r && typeof r.then === 'function') pendientes.push(r);
        } catch (err) {
          pendientes.push(Promise.reject(err));
        }
      }
    },
    async drenar() {
      for (let vueltas = 0; vueltas < 200 && pendientes.length > 0; vueltas += 1) {
        const lote = pendientes;
        pendientes = [];
        await Promise.all(lote);
      }
      if (pendientes.length > 0) throw new Error('el bus no se vacía: ¿un bucle de eventos?');
    }
  };
}

// ─── RPC sobre el mismo bus (request → response correlada), como en Enki ───
function crearRpc(bus) {
  let n = 0;
  return function rpc(ev, payload = {}) {
    const request_id = `rpc-${++n}`;
    const respuesta = ev.endsWith('.request') ? `${ev.slice(0, -8)}.response` : `${ev}.response`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { unsub(); resolve(null); }, 400);
      const unsub = bus.subscribe(respuesta, (e) => {
        if (e.data?.request_id !== request_id) return;
        clearTimeout(timer);
        unsub();
        resolve(e.data);
      });
      bus.publish(ev, { request_id, ...payload });
    });
  };
}

// ─── los puertos que no son de este peldaño, contestando por el bus ───
function puertos(bus, { riders, rutas, desvios = {} }) {
  bus.subscribe('fs.read.request', (e) => bus.publish('fs.read.response', { request_id: e.data.request_id, status: 404 }));
  bus.subscribe('fs.write.request', (e) => bus.publish('fs.write.response', { request_id: e.data.request_id, status: 200 }));
  bus.subscribe('estado-parte.de.request', (e) => bus.publish('estado-parte.de.response', { request_id: e.data.request_id, status: 200, data: { riders } }));
  bus.subscribe('ruta-viva.de.request', (e) => bus.publish('ruta-viva.de.response', { request_id: e.data.request_id, status: 200, data: { rutas } }));
  bus.subscribe('config-mercado.politica.request', (e) => bus.publish('config-mercado.politica.response', { request_id: e.data.request_id, status: 200, data: { politica: {
    capa: 'plaza', version: 7, autor: PLAZA,
    umbrales: { desvio_m: 800, espera_min: 4, retraso_min: 6, cobra_min_cents: 0 },
    ventana_s: 20, orden: 'declarado', campo_cobra: 'paga'
  } } }));
  bus.subscribe('ruta.desvio.request', (e) => {
    const metros = desvios[e.data.rider_id] ?? 312;
    bus.publish('ruta.desvio.response', { request_id: e.data.request_id, status: 200, data: { metros } });
  });
}

const RUTA_MODULOS = path.join(__dirname, '../../modules/bocaos');

function montar({ desvios } = {}) {
  const bus = crearBus();
  const rpc = crearRpc(bus);
  const modulos = {
    'tienda-captura': new TiendaCaptura(),
    pedido: new Pedido(),
    'tienda-hora-listo': new TiendaHoraListo(),
    'hecho-listo': new HechoListo(),
    'foto-mercado': new FotoMercado(),
    enlace: new Enlace(),
    propuesta: new Propuesta(),
    'contrato-puntual': new ContratoPuntual(),
    'hechos-reparto': new HechosReparto()
  };
  for (const [nombre, m] of Object.entries(modulos)) {
    m.name = nombre;
    m.eventBus = bus;
    m.logger = { info() {}, warn() {}, error() {} };
    m.metrics = { increment() {} };
    m._rpc = rpc;
    m.plaza_id = PLAZA;
  }
  // Cableado desde module.json, como hace el loader: si un handler declarado no existe, revienta.
  for (const [nombre, m] of Object.entries(modulos)) {
    const man = JSON.parse(fs.readFileSync(path.join(RUTA_MODULOS, nombre, 'module.json'), 'utf8'));
    for (const sub of man.subscribes) {
      const fn = m[sub.handler];
      if (typeof fn !== 'function') throw new Error(`${nombre}: el handler declarado ${sub.handler} no existe`);
      bus.subscribe(sub.event, fn.bind(m));
    }
  }
  puertos(bus, {
    riders: [
      { rider_id: 'rid-1', plaza_id: PLAZA, estado: 'activo', zonas: ['centro'], capacidad: 2, coste: { eur_km: 0.25, eur_min: 0.1 } },
      { rider_id: 'rid-2', plaza_id: PLAZA, estado: 'activo', zonas: ['centro'], capacidad: 2, coste: { eur_km: 0.25, eur_min: 0.1 } }
    ],
    rutas: [{ rider_id: 'rid-1', posicion: { lat: 36.721, lng: -4.421 }, paradas: [], promesas: {}, eta_tienda_min: 10 },
            { rider_id: 'rid-2', posicion: { lat: 36.73, lng: -4.44 }, paradas: [], promesas: {}, eta_tienda_min: 10 }],
    desvios
  });
  bus.publish('project.activated', { project_id: PLAZA });
  bus.publish('project.activated', { project_id: TIENDA });
  return { bus, modulos, rpc };
}

test('un pedido de punta a punta en una plaza: alta → listo → foto → propuesta → sí → acta', async () => {
  const { bus, modulos } = montar();
  await bus.drenar();
  const tc = modulos['tienda-captura'];
  const hl = modulos['tienda-hora-listo'];

  // 1 · la tienda da de alta (precio cerrado y oferta congelada)
  const alta = await tc.onAltaRequest({ request_id: 'q1', data: {
    project_id: TIENDA,
    plaza_id: PLAZA,
    tienda_id: TIENDA,
    cliente_id: 'cli-1',
    lineas: [{ sku: 'campero', cantidad: 1 }],
    precio_congelado: PRECIO,
    oferta_reparto_cents: 450,
    punto: { lat: 36.72, lng: -4.42 },
    destino: { lat: 36.725, lng: -4.43 },
    zona: 'centro'
  } });
  assert.strictEqual(alta.status, 201);
  const pedido_id = alta.data.pedido_id;

  // 2 · la plaza lo creó: el hecho está en el bus
  assert.strictEqual(bus.eventos('bocaos.pedido_creado').length, 1);
  assert.strictEqual(bus.eventos('bocaos.pedido_creado')[0].p.pedido_id, pedido_id);

  // 3 · la tienda lo acepta
  const pedido = modulos.pedido;
  const ok = await pedido.onAceptarRequest({ request_id: 'q2', data: { project_id: PLAZA, pedido_id, rol: 'tienda', tienda_id: TIENDA } });
  assert.strictEqual(ok.status, 200);

  // 4 · la tienda declara la hora de listo
  const decl = await hl.onDeclararRequest({ request_id: 'q3', data: { project_id: TIENDA, pedido_id, hora_listo: LISTO, autor: { rol: 'tienda', tienda_id: TIENDA }, precio_congelado: PRECIO } });
  assert.strictEqual(decl.status, 201, JSON.stringify(decl));
  await bus.drenar();   // la tienda declara → hecho-listo anota → enlace mide y propone

  // 5 · la plaza anotó el hecho con su sello, y el cuello arrancó
  const listos = bus.eventos('bocaos.pedido_listo');
  assert.strictEqual(listos.length, 1);
  assert.strictEqual(listos[0].p.plaza_id, PLAZA);

  const completados = bus.eventos('bocaos.enlace_completado');
  assert.strictEqual(completados.length, 1, 'el enlace decidió a quién');
  const propuesta_id = completados[0].p.propuesta_id;

  // El primero del orden declarado (rid-1) pasa: 312 m, 2 min, 0 min, 450 c€.
  const medidas = bus.eventos('bocaos.medidas_calculadas');
  assert.strictEqual(medidas.length, 1);
  assert.strictEqual(medidas[0].p.rider_id, 'rid-1');
  assert.strictEqual(medidas[0].p.pasa, true);
  assert.strictEqual(medidas[0].p.medidas.desvio_m, 312);
  assert.ok(Math.abs(medidas[0].p.medidas.espera_min - 2) < 0.1, `espera ~2 min (fue ${medidas[0].p.medidas.espera_min})`);

  const emitidas = bus.eventos('bocaos.propuesta_emitida');
  assert.strictEqual(emitidas.length, 1);
  assert.strictEqual(emitidas[0].p.propuesta_id, propuesta_id);
  assert.strictEqual(emitidas[0].p.medidas.desvio_m, 312);
  assert.ok(Math.abs(emitidas[0].p.medidas.espera_min - 2) < 0.1);
  assert.strictEqual(emitidas[0].p.medidas.retraso_min, 0);
  assert.strictEqual(emitidas[0].p.medidas.cobra_cents, 450);

  // 6 · el pedido quedó LISTO en la plaza
  const de = await pedido.onDeRequest({ request_id: 'q4', data: { project_id: PLAZA, pedido_id } });
  assert.strictEqual(de.data.pedido.estado, 'LISTO');

  // 7 · el canal entrega (puerto externo) y el rider acusa y dice SÍ
  bus.publish('bocaos.propuesta_entregada', { project_id: PLAZA, propuesta_id, hora: ACUSE });
  await bus.drenar();
  const acuse = await modulos.propuesta.onAcuseRequest({ request_id: 'q5', data: { project_id: PLAZA, propuesta_id, rider_id: 'rid-1', hora: ACUSE } });
  assert.strictEqual(acuse.status, 200);

  const si = await modulos.propuesta.onAceptarRequest({ request_id: 'q6', data: { project_id: PLAZA, propuesta_id, rider_id: 'rid-1', hora: SI } });
  assert.strictEqual(si.status, 200);
  await bus.drenar();

  // 8 · la aceptación hizo nacer el contrato puntual y el pedido entró EN_REPARTO
  const contratos = bus.eventos('bocaos.contrato_creado');
  assert.strictEqual(contratos.length, 1, 'hay contrato: el sí es el único constructor (A27)');
  assert.strictEqual(contratos[0].p.rider_id, 'rid-1');
  assert.strictEqual(contratos[0].p.hora_aceptacion, SI);

  const enReparto = await pedido.onDeRequest({ request_id: 'q7', data: { project_id: PLAZA, pedido_id } });
  assert.strictEqual(enReparto.data.pedido.estado, 'EN_REPARTO');

  // 9 · el reparto se mide: recogida, entrega y prueba
  const hr = modulos['hechos-reparto'];
  await hr.onAnotarRequest({ request_id: 'q8', data: { project_id: PLAZA, pedido_id, tipo: 'recogida', hora: RECOGIDA, autor: 'rid-1' } });
  await hr.onAnotarRequest({ request_id: 'q9', data: { project_id: PLAZA, pedido_id, tipo: 'entrega', hora: ENTREGA, autor: 'rid-1' } });
  await hr.onPruebaRequest({ request_id: 'q10', data: { project_id: PLAZA, pedido_id, tipo: 'codigo', valor: '4821', autor: 'rid-1' } });
  await bus.drenar();

  const acta = await hr.onActaRequest({ request_id: 'q11', data: { project_id: PLAZA, pedido_id } });
  assert.strictEqual(acta.data.completa, true);
  assert.strictEqual(acta.data.acta.relojes.espera_min, 0, 'la hora de listo llegó como hecho');
  assert.strictEqual(acta.data.acta.relojes.reparto_min, 15);

  // 10 · y el pedido quedó ENTREGADO con su prueba dentro
  const final = await pedido.onDeRequest({ request_id: 'q12', data: { project_id: PLAZA, pedido_id } });
  assert.strictEqual(final.data.pedido.estado, 'ENTREGADO');
  assert.strictEqual(final.data.pedido.prueba.tipo, 'codigo');
  assert.strictEqual(final.data.pedido.prueba.valor, '4821');
  assert.strictEqual(bus.eventos('bocaos.contrato_cerrado').length, 1, 'el contrato se cerró con el hecho de entrega');

  // La cadena entera, en hechos, en orden.
  const cadena = bus.publicados.map((x) => x.ev).filter((ev) => ev.startsWith('bocaos.'));
  for (const ev of ['bocaos.pedido_creado', 'bocaos.pedido_aceptado', 'bocaos.listo_declarado', 'bocaos.pedido_listo',
                    'bocaos.foto_congelada', 'bocaos.medidas_calculadas', 'bocaos.propuesta_emitida',
                    'bocaos.propuesta_acusada', 'bocaos.propuesta_aceptada', 'bocaos.contrato_creado',
                    'bocaos.hecho_reparto_anotado', 'bocaos.prueba_anotada', 'bocaos.contrato_cerrado']) {
    assert.ok(cadena.includes(ev), `falta el hecho ${ev} en la cadena`);
  }
});

test('el segundo rider solo entra si el primero no pasa el umbral', async () => {
  const { bus, modulos } = montar({ desvios: { 'rid-1': 1200, 'rid-2': 312 } });
  await bus.drenar();
  const tc = modulos['tienda-captura'];
  const alta = await tc.onAltaRequest({ request_id: 'w1', data: {
    project_id: TIENDA, plaza_id: PLAZA, tienda_id: TIENDA, cliente_id: 'cli-2',
    lineas: [{ sku: 'campero', cantidad: 1 }], precio_congelado: PRECIO, oferta_reparto_cents: 450,
    punto: { lat: 36.72, lng: -4.42 }, destino: { lat: 36.725, lng: -4.43 }, zona: 'centro'
  } });
  const pedido_id = alta.data.pedido_id;
  await modulos.pedido.onAceptarRequest({ request_id: 'w2', data: { project_id: PLAZA, pedido_id, rol: 'tienda', tienda_id: TIENDA } });

  // El primero (rid-1) mide 312 m, pero esta vez el puerto de ruta lo pone a 1.200 m: no pasa.
  const previo = bus.eventos('bocaos.medidas_calculadas');
  await modulos['tienda-hora-listo'].onDeclararRequest({ request_id: 'w3', data: { project_id: TIENDA, pedido_id, hora_listo: LISTO, autor: { rol: 'tienda', tienda_id: TIENDA }, precio_congelado: PRECIO } });
  await bus.drenar();

  const medidas = bus.eventos('bocaos.medidas_calculadas').slice(previo.length);
  const pasa = medidas.filter((x) => x.p.pasa);
  assert.strictEqual(pasa.length, 1);
  assert.strictEqual(pasa[0].p.rider_id, 'rid-2', 'el que no pasa el umbral no recibe propuesta; el siguiente sí');
  assert.strictEqual(bus.eventos('bocaos.enlace_completado')[0].p.rider_id, 'rid-2');
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

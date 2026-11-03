'use strict';

/**
 * bocaos · PELDAÑO 1 — la plaza, con CENSO, RUTA VIVA y POLÍTICA, y el enlace proponiendo de verdad.
 *
 * Doce islas sobre un bus de mentira y CERO puertos de mentira para las tres de este peldaño:
 * `estado-parte`, `ruta-viva` y `config-mercado` son módulos de verdad, cableados por su
 * module.json como los cablea el loader. Sólo se contestan desde el bus dos cosas que no son de
 * este peldaño: el reflejo `fs` y el puerto de ruta (`ruta.desvio`, que mide el desvío).
 *
 * Lo que este test demuestra, y no se puede demostrar con stubs:
 *
 *   1. La foto del mercado YA NO DEVUELVE HUECOS: hay censo, hay ruta viva y hay política.
 *   2. El enlace PROPONE: cuatro umbrales en AND sobre la foto y una propuesta emitida.
 *   3. La pausa la declara él; la sala recibe 403 y el rider deja de aparecer en `vigentes`.
 *   4. El contrato vivo pone «ocupado» y su cierre lo devuelve a «disponible» (I04).
 *   5. Las paradas de la ruta se derivan del contrato: cerrarlo las borra y cierra el trayecto (B02/B06).
 *   6. Cambiar un umbral DESPUÉS no reabre la decisión: la política se pide por instante y la
 *      foto congelada sigue reproduciendo su huella.
 *
 * Ejecutar: node tests/unit/bocaos__peldano1-cadena.test.js
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
const EstadoParte = require('../../modules/bocaos/estado-parte/index.js');
const RutaViva = require('../../modules/bocaos/ruta-viva/index.js');
const ConfigMercado = require('../../modules/bocaos/config-mercado/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const TIENDA = 'tienda-paco';
const RIDER = 'rid-1';
const PRECIO = { total_cents: 1850, moneda: 'EUR', reparto_cents: 450 };
const PUNTO = { lat: 36.72, lng: -4.42 };            // la tienda
const DESTINO = { lat: 36.725, lng: -4.43 };
// El rider está a 0,02° al norte: ~2,2 km en recta, ~3,0 km de calle, 10 min a 18 km/h.
const POSICION = { lat: 36.74, lng: -4.42 };

const T0 = Date.now();
const T = (min) => new Date(T0 + min * 60000).toISOString();
const LISTO = T(12);          // listo en 12 min; el rider llega en ~10 → ~2 min de espera
const ACUSE = T(0.1);
const SI = T(0.2);
const RECOGIDA = T(12);
const ENTREGA = T(27);
const PROMETIDA = T(40);

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
        try {
          const r = fn({ data: copia });
          if (r && typeof r.then === 'function') pendientes.push(r);
        } catch (err) {
          pendientes.push(Promise.reject(err));
        }
      }
    },
    async drenar() {
      for (let vueltas = 0; vueltas < 400 && pendientes.length > 0; vueltas += 1) {
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
      const timer = setTimeout(() => { unsub(); resolve({ status: 504, error: { code: 'SIN_RESPUESTA', message: ev } }); }, 800);
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

// ─── los puertos que NO son de este peldaño: el reflejo fs y la medida del desvío ───
function puertos(bus, { desvio = 312 } = {}) {
  const disco = new Map();
  bus.subscribe('fs.read.request', (e) => {
    const k = `${e.data.project_id}|${e.data.path}`;
    if (!disco.has(k)) return bus.publish('fs.read.response', { request_id: e.data.request_id, status: 404 });
    bus.publish('fs.read.response', { request_id: e.data.request_id, status: 200, content: disco.get(k) });
  });
  bus.subscribe('fs.write.request', (e) => {
    disco.set(`${e.data.project_id}|${e.data.path}`, e.data.content);
    bus.publish('fs.write.response', { request_id: e.data.request_id, status: 200 });
  });
  bus.subscribe('ruta.desvio.request', (e) => {
    bus.publish('ruta.desvio.response', { request_id: e.data.request_id, status: 200, data: { metros: desvio } });
  });
  return disco;
}

const RAIZ = path.join(__dirname, '../../modules/bocaos');

function montar(opciones = {}) {
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
    'hechos-reparto': new HechosReparto(),
    'estado-parte': new EstadoParte(),
    'ruta-viva': new RutaViva(),
    'config-mercado': new ConfigMercado()
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
    const man = JSON.parse(fs.readFileSync(path.join(RAIZ, nombre, 'module.json'), 'utf8'));
    for (const sub of man.subscribes) {
      const fn = m[sub.handler];
      if (typeof fn !== 'function') throw new Error(`${nombre}: el handler declarado ${sub.handler} no existe`);
      bus.subscribe(sub.event, fn.bind(m));
    }
  }
  puertos(bus, opciones);
  bus.publish('project.activated', { project_id: PLAZA });
  bus.publish('project.activated', { project_id: TIENDA });
  return { bus, modulos, rpc };
}

// La plaza y el censo, tal como los deja un día normal antes de que entre el primer pedido.
async function abrirPlaza(rpc) {
  const cfg = await rpc('config-mercado.declarar.request', {
    project_id: PLAZA, plaza_id: PLAZA, ambito: 'plaza', autor: 'duena-de-la-plaza', acta: 'acta-apertura',
    desde: T(-30), umbrales: { desvio_m: 800, espera_min: 4, retraso_min: 6, cobra_min_cents: 0 },
    ventana: { validez_s: 20, decision_s: 10, acuse_s: 5, tope_candidatos: 3 },
    ruta: { frescura_s: 90, velocidad_kmh: 18, factor_calle: 1.35 },
    coste_rider: { vehiculos: { moto: 0.14, coche: 0.25, bici: 0.02 }, eur_min: 0.257 }
  });
  assert.strictEqual(cfg.status, 201, JSON.stringify(cfg));

  const rid = await rpc('estado-parte.alta.request', {
    project_id: PLAZA, plaza_id: PLAZA, tipo: 'rider', rider_id: RIDER,
    zonas: ['centro'], vehiculo: 'moto', capacidad: 2
  });
  assert.strictEqual(rid.status, 201, JSON.stringify(rid));

  const pos = await rpc('ruta-viva.posicion.request', {
    project_id: PLAZA, plaza_id: PLAZA, rider_id: RIDER, punto: POSICION, hora: T(0)
  });
  assert.strictEqual(pos.status, 200, JSON.stringify(pos));
}

async function altaDePedido(rpc, modulos, cliente = 'cli-1') {
  const tc = modulos['tienda-captura'];
  const alta = await tc.onAltaRequest({ request_id: `alt-${cliente}`, data: {
    project_id: TIENDA, plaza_id: PLAZA, tienda_id: TIENDA, cliente_id: cliente,
    lineas: [{ sku: 'campero', cantidad: 1 }], precio_congelado: PRECIO, oferta_reparto_cents: 450,
    punto: PUNTO, destino: DESTINO, zona: 'centro'
  } });
  assert.strictEqual(alta.status, 201, JSON.stringify(alta));
  const pedido_id = alta.data.pedido_id;
  await rpc('pedido.aceptar.request', { project_id: PLAZA, pedido_id, rol: 'tienda', tienda_id: TIENDA });
  const decl = await modulos['tienda-hora-listo'].onDeclararRequest({ request_id: `lst-${cliente}`, data: {
    project_id: TIENDA, pedido_id, hora_listo: LISTO,
    autor: { rol: 'tienda', tienda_id: TIENDA }, precio_congelado: PRECIO
  } });
  assert.strictEqual(decl.status, 201, JSON.stringify(decl));
  return pedido_id;
}

test('el enlace PROPONE de verdad: foto sin huecos, censo, ruta viva y política reales', async () => {
  const { bus, modulos, rpc } = montar();
  await bus.drenar();
  await abrirPlaza(rpc);
  await bus.drenar();

  // La foto, tal cual la pide el enlace, ya no devuelve huecos.
  const foto = await rpc('foto-mercado.componer.request', {
    project_id: PLAZA, plaza_id: PLAZA,
    pedido: { pedido_id: 'ped-espia', plaza_id: PLAZA, punto: PUNTO, destino: DESTINO, zona: 'centro', hora_listo: LISTO, precio_congelado: PRECIO },
    instante: T(0)
  });
  assert.strictEqual(foto.status, 200);
  assert.deepStrictEqual(foto.data.foto.huecos, [], `la foto no puede tener huecos: ${foto.data.foto.huecos}`);
  assert.strictEqual(foto.data.foto.riders.length, 1);
  assert.strictEqual(foto.data.foto.riders[0].rider_id, RIDER);
  assert.deepStrictEqual(foto.data.foto.riders[0].faltantes, [], 'ni el rider tiene faltantes');
  assert.strictEqual(foto.data.foto.riders[0].capacidad, 2);
  assert.deepStrictEqual(foto.data.foto.riders[0].coste, { eur_km: 0.14, eur_min: 0.257 });
  assert.ok(foto.data.foto.riders[0].eta_tienda_min > 9, 'el ETA a la tienda viaja con la foto');
  assert.strictEqual(foto.data.foto.politica.capa, 'plaza');
  assert.strictEqual(foto.data.foto.politica.version, 1);
  assert.strictEqual(foto.data.foto.politica.autor, 'duena-de-la-plaza');

  // Y el cuello completo: pedido → listo → foto → propuesta.
  const pedido_id = await altaDePedido(rpc, modulos);
  await bus.drenar();

  const completados = bus.eventos('bocaos.enlace_completado');
  assert.strictEqual(completados.length, 1, 'el enlace decidió a quién proponer');
  assert.strictEqual(completados[0].p.rider_id, RIDER);
  assert.strictEqual(completados[0].p.medidas.desvio_m, 312);
  assert.ok(Math.abs(completados[0].p.medidas.espera_min - 2) < 0.6, `espera ~2 min (fue ${completados[0].p.medidas.espera_min})`);
  assert.strictEqual(completados[0].p.medidas.cobra_cents, 450);

  assert.strictEqual(bus.eventos('bocaos.propuesta_emitida').length, 1);
  assert.strictEqual(bus.eventos('bocaos.enlace_agotado').length, 0, 'no se agotó: propuso');
  assert.deepStrictEqual(bus.eventos('bocaos.foto_congelada')[0].p.huecos, []);

  const propuesta_id = completados[0].p.propuesta_id;
  assert.ok(propuesta_id);
  assert.strictEqual(pedido_id.length > 0, true);
});

test('la pausa la declara él: la sala recibe 403 y el rider sale de los vigentes', async () => {
  const { bus, rpc } = montar();
  await bus.drenar();
  await abrirPlaza(rpc);

  const sala = await rpc('estado-parte.declarar.request', {
    project_id: PLAZA, plaza_id: PLAZA, rider_id: RIDER, estado: 'en_pausa', rol: 'sala'
  });
  assert.strictEqual(sala.status, 403);
  assert.strictEqual(sala.error.code, 'PAUSA_NO_ES_SUYA');
  await bus.drenar();
  assert.strictEqual(bus.eventos('estado-parte.declarar.failed').length, 1, 'el rechazo también está en el bus');

  const vigentes1 = await rpc('estado-parte.vigentes.request', { project_id: PLAZA, plaza_id: PLAZA });
  assert.deepStrictEqual(vigentes1.data.riders.map((r) => r.rider_id), [RIDER]);

  const el = await rpc('estado-parte.declarar.request', {
    project_id: PLAZA, plaza_id: PLAZA, rider_id: RIDER, estado: 'en_pausa', rol: 'rider', motivo: 'comer'
  });
  assert.strictEqual(el.status, 200, JSON.stringify(el));

  const vigentes2 = await rpc('estado-parte.vigentes.request', { project_id: PLAZA, plaza_id: PLAZA });
  assert.deepStrictEqual(vigentes2.data.riders, []);
  assert.deepStrictEqual(vigentes2.data.ocultos, [{ parte_id: RIDER, tipo: 'rider', estado: 'en_pausa' }]);
  assert.strictEqual(bus.eventos('bocaos.estado_parte_declarado').filter((x) => x.p.estado === 'en_pausa').length, 1);

  // Y la pausa la levanta él, no la sala.
  const levantaSala = await rpc('estado-parte.declarar.request', {
    project_id: PLAZA, plaza_id: PLAZA, rider_id: RIDER, estado: 'disponible', rol: 'sala'
  });
  assert.strictEqual(levantaSala.status, 403);
  const levantaEl = await rpc('estado-parte.declarar.request', {
    project_id: PLAZA, plaza_id: PLAZA, rider_id: RIDER, estado: 'disponible', rol: 'rider'
  });
  assert.strictEqual(levantaEl.status, 200);
});

test('el contrato vivo pone «ocupado» y su cierre lo devuelve; las paradas se derivan y el trayecto se cierra', async () => {
  const { bus, modulos, rpc } = montar();
  await bus.drenar();
  await abrirPlaza(rpc);
  await bus.drenar();

  await altaDePedido(rpc, modulos, 'cli-7');
  await bus.drenar();
  const propuesta_id = bus.eventos('bocaos.enlace_completado')[0].p.propuesta_id;

  // El canal entrega, el rider acusa y dice SÍ.
  bus.publish('bocaos.propuesta_entregada', { project_id: PLAZA, propuesta_id, hora: ACUSE });
  await bus.drenar();
  assert.strictEqual((await rpc('propuesta.acuse.request', { project_id: PLAZA, propuesta_id, rider_id: RIDER, hora: ACUSE })).status, 200);
  assert.strictEqual((await rpc('propuesta.aceptar.request', { project_id: PLAZA, propuesta_id, rider_id: RIDER, hora: SI })).status, 200);
  await bus.drenar();

  // I04: «ocupado» lo pone el contrato vivo, no la sala.
  const parte = await rpc('estado-parte.de.request', { project_id: PLAZA, plaza_id: PLAZA, parte_id: RIDER });
  assert.strictEqual(parte.data.parte.estado, 'ocupado');
  assert.strictEqual(parte.data.parte.contratos_vivos, 1);
  assert.ok(parte.data.parte.autor.startsWith('contrato:'), parte.data.parte.autor);

  // B02: la parada del contrato está en la ruta viva; sin promesa, se nombra (no hay retraso que medir).
  const ruta1 = await rpc('ruta-viva.de.request', { project_id: PLAZA, plaza_id: PLAZA, rider_id: RIDER, instante: T(1) });
  const v1 = ruta1.data.rutas[0];
  assert.strictEqual(v1.trayecto.contratos_vivos, 1);
  assert.strictEqual(v1.sin_promesa.length, 1, 'el contrato aún no tiene promesa al cliente');
  assert.ok(v1.huecos.some((h) => h.includes('sin promesa')), v1.huecos.join('|'));

  // B03: la promesa se guarda y la parada pasa a contar.
  const prom = await rpc('ruta-viva.promesa.request', {
    project_id: PLAZA, plaza_id: PLAZA, rider_id: RIDER, pedido_id: v1.sin_promesa[0].pedido_id, hora: PROMETIDA
  });
  assert.strictEqual(prom.status, 200, JSON.stringify(prom));
  const ruta2 = await rpc('ruta-viva.de.request', { project_id: PLAZA, plaza_id: PLAZA, rider_id: RIDER, instante: T(1) });
  assert.strictEqual(ruta2.data.rutas[0].paradas.length, 1);
  assert.strictEqual(ruta2.data.rutas[0].paradas[0].promesa, PROMETIDA);
  assert.ok(ruta2.data.rutas[0].paradas[0].eta_min > 0, 'el ETA de la parada se calcula desde el último punto');

  // El reparto se mide y el contrato se cierra → sin parada viva, el trayecto se cierra (B06).
  const hr = modulos['hechos-reparto'];
  await hr.onAnotarRequest({ request_id: 'h1', data: { project_id: PLAZA, pedido_id: bus.eventos('bocaos.enlace_completado')[0].p.pedido_id, tipo: 'recogida', hora: RECOGIDA, autor: RIDER } });
  await hr.onAnotarRequest({ request_id: 'h2', data: { project_id: PLAZA, pedido_id: bus.eventos('bocaos.enlace_completado')[0].p.pedido_id, tipo: 'entrega', hora: ENTREGA, autor: RIDER } });
  await hr.onPruebaRequest({ request_id: 'h3', data: { project_id: PLAZA, pedido_id: bus.eventos('bocaos.enlace_completado')[0].p.pedido_id, tipo: 'codigo', valor: '4821', autor: RIDER } });
  await bus.drenar();

  assert.strictEqual(bus.eventos('bocaos.contrato_cerrado').length, 1);
  assert.strictEqual(bus.eventos('bocaos.trayecto_cerrado').length, 1);

  const despues = await rpc('estado-parte.de.request', { project_id: PLAZA, plaza_id: PLAZA, parte_id: RIDER });
  assert.strictEqual(despues.data.parte.estado, 'disponible', 'cerrado el contrato, vuelve a estar disponible');
  assert.strictEqual(despues.data.parte.contratos_vivos, 0);

  const ruta3 = await rpc('ruta-viva.de.request', { project_id: PLAZA, plaza_id: PLAZA, rider_id: RIDER, instante: T(28) });
  assert.deepStrictEqual(ruta3.data.rutas[0].paradas, [], 'la parada desapareció sola: no había lista guardada');
  assert.ok(ruta3.data.rutas[0].trayecto.cerrado_en);

  const vigentes = await rpc('estado-parte.vigentes.request', { project_id: PLAZA, plaza_id: PLAZA });
  assert.deepStrictEqual(vigentes.data.riders.map((r) => r.rider_id), [RIDER], 'vuelve al mercado');
});

test('cambiar un umbral después NO reabre lo decidido, y la foto sigue reproduciendo su huella', async () => {
  const { bus, modulos, rpc } = montar();
  await bus.drenar();
  await abrirPlaza(rpc);
  await bus.drenar();
  await altaDePedido(rpc, modulos, 'cli-9');
  await bus.drenar();

  const foto = bus.eventos('bocaos.foto_congelada')[0].p;
  assert.strictEqual(foto.politica.version, 1);

  // La dueña endurece el desvío DESPUÉS de decidir.
  const nueva = await rpc('config-mercado.declarar.request', {
    project_id: PLAZA, plaza_id: PLAZA, ambito: 'plaza', autor: 'duena-de-la-plaza', acta: 'acta-endurece',
    desde: T(1), umbrales: { desvio_m: 100 }
  });
  assert.strictEqual(nueva.status, 201, JSON.stringify(nueva));
  assert.strictEqual(nueva.data.version, 2);

  // La foto congelada se explica con los números que la juzgaron, no con los de hoy.
  const enAquelInstante = await rpc('config-mercado.politica.request', {
    project_id: PLAZA, plaza_id: PLAZA, instante: foto.instante
  });
  assert.strictEqual(enAquelInstante.data.politica.umbrales.desvio_m, 800, 'no se reabre el pasado');
  assert.strictEqual(enAquelInstante.data.politica.version, 1);

  const ahora = await rpc('config-mercado.politica.request', { project_id: PLAZA, plaza_id: PLAZA, instante: T(2) });
  assert.strictEqual(ahora.data.politica.umbrales.desvio_m, 100);

  const repro = await rpc('foto-mercado.reproducir.request', { project_id: PLAZA, foto: foto });
  assert.strictEqual(repro.status, 200, 'la huella sigue cuadrando: la decisión es reproducible (A29)');

  // Y el siguiente pedido ya se juzga con el umbral nuevo: 312 m también pasa, pero 100 m no.
  const segunda = await rpc('foto-mercado.componer.request', {
    project_id: PLAZA, plaza_id: PLAZA,
    pedido: { pedido_id: 'ped-otro', plaza_id: PLAZA, punto: PUNTO, destino: DESTINO, zona: 'centro', hora_listo: LISTO, precio_congelado: PRECIO },
    instante: T(2)
  });
  assert.strictEqual(segunda.data.foto.politica.umbrales.desvio_m, 100);
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

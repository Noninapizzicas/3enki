'use strict';

/**
 * bocaos · PELDAÑO 0 — la plaza sola, un pedido de punta a punta, SOLO por eventos.
 *
 * Diez islas conectadas a un bus de mentira. Ningún módulo conoce a otro: no hay un solo require
 * entre ellos y el bus es lo único que los une. Si la cadena pasa aquí, pasa por eventos.
 *
 * La cadena empieza donde empieza de verdad: en PIZZEPOS, no en un módulo de Bocaos.
 *
 *   1. la tienda publica `pedido.creado`         → pizzepos/pedidos (fake: el evento REAL)
 *   2. la plaza lo hace suyo con su sello        → pedido-mercado → bocaos.pedido_creado
 *      (y tarifa-pedido congela la oferta        → bocaos.precio_cerrado)
 *   3. la tienda lo acepta                       → pedido-mercado → bocaos.pedido_aceptado
 *   4. cocina marca listo                        → pizzepos/cocina (fake) → cocina.pedido_listo
 *   5. la plaza compone el hecho de listo        → entrada-listo (stub, hoja 23) → bocaos.listo_declarado
 *   6. la plaza anota el HECHO con su sello      → hecho-listo     → bocaos.pedido_listo
 *   7. se compone el instante                    → foto-mercado    (pide estado y ruta al bus)
 *   8. se decide a quién (4 umbrales, en AND)    → enlace          → propuesta.emitir.request
 *   9. la propuesta y su ventana                 → propuesta
 *  10. el rider dice sí → contrato puntual       → contrato-puntual → bocaos.contrato_creado
 *  11. el reparto se mide (acta con relojes)     → hechos-reparto  → bocaos.prueba_anotada
 *
 * `tienda-captura` y `tienda-hora-listo` NO existen: duplicaban `tienda-api` + `pedidos` y
 * `cocina.mark-ready`. Aquí se emiten sus eventos REALES, que es lo que el bus verá en producción.
 * El único puente que se sustituye es `entrada-listo` (hoja 23 del peldaño, todavía sin construir):
 * el arnés hace sus doce líneas y las deja a la vista.
 *
 * Los puertos que no son de este peldaño (estado-parte, ruta-viva, config-mercado, el canal del
 * rider) se contestan desde el bus como cualquier otro módulo: son puertos, no funciones.
 *
 * Ejecutar: node tests/unit/bocaos__peldano0-cadena.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PedidoMercado = require('../../modules/bocaos/pedido-mercado/index.js');
const TarifaPedido = require('../../modules/bocaos/tarifa-pedido/index.js');
const ContratoTramos = require('../../modules/bocaos/contrato-tramos/index.js');
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

// ─── PIZZEPOS DE MENTIRA: los cuatro eventos de la frontera, con su forma REAL ───
function pizzepos(bus) {
  const pedidos = new Map();
  bus.subscribe('pedido.get.request', (e) => {
    const p = pedidos.get(e.data.pedido_id);
    if (!p) {
      bus.publish('pedido.get.response', { request_id: e.data.request_id, status: 404, error: { code: 'RESOURCE_NOT_FOUND', message: 'sin pedido' } });
      return;
    }
    bus.publish('pedido.get.response', { request_id: e.data.request_id, status: 200, data: { pedido: p } });
  });
  return {
    // pedidos v3.6.0 · el alta de un pedido de domicilio (ADAPTAR: entrega + modo_consumo)
    creado(payload) {
      const pedido = {
        cuenta_id: 'cta-1',
        modo_consumo: 'domicilio',
        ...payload
      };
      pedidos.set(pedido.pedido_id, pedido);
      bus.publish('pedido.creado', pedido);
      return pedido;
    },
    // cocina v3.5.0 · cocina.mark-ready: lo pulsa una persona, con su hora y su dispositivo
    listo({ pedido_id, hora, dispositivo = 'horno-1' }) {
      const p = pedidos.get(pedido_id) || {};
      bus.publish('cocina.pedido_listo', {
        pedido_id,
        cuenta_id: p.cuenta_id || null,
        project_id: p.project_id || TIENDA,
        project_slug: p.project_slug || TIENDA,
        hora,
        dispositivo
      });
    },
    cancelado({ pedido_id, motivo }) {
      bus.publish('pedido.cancelado', { pedido_id, project_id: TIENDA, motivo, hora: T(1) });
    },
    pedidos
  };
}

// ─── entrada-listo (hoja 23 del peldaño, todavía NO construida) ───
// Doce líneas que el arnés pone en su lugar: el disparador es el evento REAL de pizzepos
// (cocina.pedido_listo), y el puente pide el total a pizzepos y el precio de reparto a
// tarifa-pedido para no inventar ninguno de los dos. Cuando la hoja exista, se monta ella.
function entradaListo(bus, rpc) {
  bus.subscribe('cocina.pedido_listo', async (e) => {
    const d = e.data;
    const pedido = (await rpc('pedido.get.request', { project_id: d.project_id, pedido_id: d.pedido_id }))?.data?.pedido || null;
    const precio = (await rpc('tarifa-pedido.de.request', { project_id: PLAZA, pedido_id: d.pedido_id }))?.data?.precio || null;
    if (!pedido || !precio) {
      bus.publish('bocaos.hueco_nombrado', {
        pedido_id: d.pedido_id, plaza_id: PLAZA,
        motivo: !pedido ? 'pizzepos no da el pedido' : 'sin precio de reparto cerrado (E03)',
        hueco: !pedido ? 'sin pedido' : 'sin precio'
      });
      return;
    }
    const entrega = pedido.entrega || {};
    bus.publish('bocaos.listo_declarado', {
      plaza_id: PLAZA,
      tienda_id: pedido.project_slug || TIENDA,
      pedido_id: d.pedido_id,
      hora_listo: d.hora,
      hora: d.hora,
      precio_congelado: {
        total_cents: pedido.total_centimos,
        moneda: 'EUR',
        reparto_cents: precio.precio_centimos
      },
      punto: entrega.punto || null,
      destino: entrega.destino || null,
      zona: entrega.zona || null,
      autor: { rol: 'tienda', tienda_id: pedido.project_slug || TIENDA }
    });
  });
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
    'pedido-mercado': new PedidoMercado(),
    'tarifa-pedido': new TarifaPedido(),
    'contrato-tramos': new ContratoTramos(),
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
  const pz = pizzepos(bus);
  entradaListo(bus, rpc);
  bus.publish('project.activated', { project_id: PLAZA });
  bus.publish('project.activated', { project_id: TIENDA });
  return { bus, modulos, rpc, pizzepos: pz };
}

// El alta tal como la hace la tienda: un pedido de domicilio con su oferta de reparto congelada.
const alta = (pz, cliente = 'cli-1', extra = {}) => pz.creado({
  pedido_id: `ped-${cliente}`,
  project_id: TIENDA,
  project_slug: TIENDA,
  total_centimos: PRECIO.total_cents,
  items_count: 1,
  cliente_nombre: 'Ana',
  entrega: {
    direccion: { calle: 'Larios', numero: 3, cp: '29005' },
    zona: 'centro',
    oferta_centimos: 450,
    punto: { lat: 36.72, lng: -4.42 },
    destino: { lat: 36.725, lng: -4.43 },
    ...extra
  }
});

test('un pedido de punta a punta en una plaza: pizzepos → mercado → listo → foto → propuesta → sí → acta', async () => {
  const { bus, modulos, pizzepos: pz } = montar();
  await bus.drenar();

  // 1 · la tienda publica pedido.creado (evento REAL de pizzepos, con su bloque entrega)
  const pedidoCreado = alta(pz, 'cli-1');
  const pedido_id = pedidoCreado.pedido_id;
  await bus.drenar();

  // 2 · la plaza lo hizo suyo, con el MISMO id y su sello, y congeló la oferta
  const creados = bus.eventos('bocaos.pedido_creado');
  assert.strictEqual(creados.length, 1);
  assert.strictEqual(creados[0].p.pedido_id, pedido_id);
  assert.strictEqual(creados[0].p.plaza_id, PLAZA);
  assert.strictEqual(creados[0].p.tienda_id, TIENDA);
  assert.strictEqual(creados[0].p.oferta_centimos, 450);

  const precios = bus.eventos('bocaos.precio_cerrado');
  assert.strictEqual(precios.length, 1, 'la oferta del cliente se congela con el pedido (E01)');
  assert.strictEqual(precios[0].p.precio_centimos, 450);

  // 3 · la tienda lo acepta
  const ok = await modulos['pedido-mercado'].onAceptarRequest({ request_id: 'q2', data: { project_id: PLAZA, pedido_id, rol: 'tienda', tienda_id: TIENDA } });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.error || {}));

  // 4-5 · cocina marca listo (evento REAL de pizzepos) y la plaza compone el hecho de listo
  pz.listo({ pedido_id, hora: LISTO });
  await bus.drenar();   // hecho-listo anota → enlace mide y propone

  assert.strictEqual(bus.eventos('bocaos.listo_declarado').length, 1, 'entrada-listo traduce el disparador de cocina');
  const listos = bus.eventos('bocaos.pedido_listo');
  assert.strictEqual(listos.length, 1);
  assert.strictEqual(listos[0].p.plaza_id, PLAZA);
  assert.strictEqual(listos[0].p.hora_listo, LISTO);

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
  assert.strictEqual(emitidas[0].p.medidas.cobra_cents, 450);

  // 6 · el pedido quedó LISTO en la plaza
  const de = await modulos['pedido-mercado'].onDeRequest({ request_id: 'q4', data: { project_id: PLAZA, pedido_id } });
  assert.strictEqual(de.data.pedido.estado, 'LISTO');

  // 7 · el canal entrega (puerto externo) y el rider acusa y dice SÍ
  bus.publish('bocaos.propuesta_entregada', { project_id: PLAZA, propuesta_id, hora: ACUSE });
  await bus.drenar();
  const acuse = await modulos.propuesta.onAcuseRequest({ request_id: 'q5', data: { project_id: PLAZA, propuesta_id, rider_id: 'rid-1', hora: ACUSE } });
  assert.strictEqual(acuse.status, 200);

  const si = await modulos.propuesta.onAceptarRequest({ request_id: 'q6', data: { project_id: PLAZA, propuesta_id, rider_id: 'rid-1', hora: SI } });
  assert.strictEqual(si.status, 200);
  await bus.drenar();

  // 8 · la aceptación hizo nacer el contrato puntual; la recogida pone el pedido EN_REPARTO
  const contratos = bus.eventos('bocaos.contrato_creado');
  assert.strictEqual(contratos.length, 1, 'hay contrato: el sí es el único constructor (A27)');
  assert.strictEqual(contratos[0].p.rider_id, 'rid-1');
  assert.strictEqual(contratos[0].p.hora_aceptacion, SI);

  const hr = modulos['hechos-reparto'];
  await hr.onAnotarRequest({ request_id: 'q8', data: { project_id: PLAZA, pedido_id, tipo: 'recogida', hora: RECOGIDA, autor: 'rid-1' } });
  await bus.drenar();
  const enReparto = await modulos['pedido-mercado'].onDeRequest({ request_id: 'q7', data: { project_id: PLAZA, pedido_id } });
  assert.strictEqual(enReparto.data.pedido.estado, 'EN_REPARTO', 'la recogida es el hecho que arranca el reparto');

  // 9 · el reparto se mide: entrega y prueba
  await hr.onAnotarRequest({ request_id: 'q9', data: { project_id: PLAZA, pedido_id, tipo: 'entrega', hora: ENTREGA, autor: 'rid-1' } });
  await hr.onPruebaRequest({ request_id: 'q10', data: { project_id: PLAZA, pedido_id, tipo: 'codigo', valor: '4821', autor: 'rid-1' } });
  await bus.drenar();

  const acta = await hr.onActaRequest({ request_id: 'q11', data: { project_id: PLAZA, pedido_id } });
  assert.strictEqual(acta.data.completa, true);
  assert.strictEqual(acta.data.acta.relojes.espera_min, 0, 'la hora de listo llegó como hecho');
  assert.strictEqual(acta.data.acta.relojes.reparto_min, 15);

  // 10 · y el pedido quedó ENTREGADO — la prueba es lo único que entrega
  const final = await modulos['pedido-mercado'].onDeRequest({ request_id: 'q12', data: { project_id: PLAZA, pedido_id } });
  assert.strictEqual(final.data.pedido.estado, 'ENTREGADO');
  assert.strictEqual(final.data.pedido.prueba.tipo, 'codigo');
  assert.strictEqual(final.data.pedido.prueba.valor, '4821');
  assert.strictEqual(bus.eventos('bocaos.contrato_cerrado').length, 1, 'el contrato se cerró con el hecho de entrega');

  // La cadena entera, en hechos, en orden.
  const cadena = bus.publicados.map((x) => x.ev).filter((ev) => ev.startsWith('bocaos.'));
  for (const ev of ['bocaos.pedido_creado', 'bocaos.precio_cerrado', 'bocaos.pedido_aceptado', 'bocaos.listo_declarado', 'bocaos.pedido_listo',
                    'bocaos.foto_congelada', 'bocaos.medidas_calculadas', 'bocaos.propuesta_emitida',
                    'bocaos.propuesta_acusada', 'bocaos.propuesta_aceptada', 'bocaos.contrato_creado',
                    'bocaos.hecho_reparto_anotado', 'bocaos.prueba_anotada', 'bocaos.contrato_cerrado']) {
    assert.ok(cadena.includes(ev), `falta el hecho ${ev} en la cadena`);
  }
});

test('el segundo rider solo entra si el primero no pasa el umbral', async () => {
  const { bus, modulos, pizzepos: pz } = montar({ desvios: { 'rid-1': 1200, 'rid-2': 312 } });
  await bus.drenar();
  const pedido = alta(pz, 'cli-2');
  const pedido_id = pedido.pedido_id;
  await bus.drenar();
  await modulos['pedido-mercado'].onAceptarRequest({ request_id: 'w2', data: { project_id: PLAZA, pedido_id, rol: 'tienda', tienda_id: TIENDA } });

  // El primero (rid-1) mide 1.200 m: no pasa. El segundo (rid-2) mide 312 m: pasa.
  const previo = bus.eventos('bocaos.medidas_calculadas');
  pz.listo({ pedido_id, hora: LISTO });
  await bus.drenar();

  const medidas = bus.eventos('bocaos.medidas_calculadas').slice(previo.length);
  const pasa = medidas.filter((x) => x.p.pasa);
  assert.strictEqual(pasa.length, 1);
  assert.strictEqual(pasa[0].p.rider_id, 'rid-2', 'el que no pasa el umbral no recibe propuesta; el siguiente sí');
  assert.strictEqual(bus.eventos('bocaos.enlace_completado')[0].p.rider_id, 'rid-2');
});

test('sin precio cerrado no hay propuesta: el hueco se nombra, no se inventa el número', async () => {
  const { bus, modulos, pizzepos: pz } = montar();
  await bus.drenar();
  // Un pedido de domicilio SIN oferta del cliente: pizzepos lo publica, pero el mercado no tiene
  // precio que congelar (E01), así que no hay propuesta para nadie.
  const pedido = pz.creado({
    pedido_id: 'ped-sin-oferta', project_id: TIENDA, project_slug: TIENDA,
    total_centimos: 1850, items_count: 1,
    entrega: { direccion: { calle: 'Larios', numero: 3 }, zona: 'centro', punto: { lat: 36.72, lng: -4.42 }, destino: { lat: 36.725, lng: -4.43 } }
  });
  await bus.drenar();

  assert.strictEqual(bus.eventos('bocaos.pedido_creado').length, 0, 'sin oferta el pedido del mercado no nace');
  assert.strictEqual(bus.eventos('bocaos.precio_cerrado').length, 0);

  pz.listo({ pedido_id: pedido.pedido_id, hora: LISTO });
  await bus.drenar();
  assert.strictEqual(bus.eventos('bocaos.propuesta_emitida').length, 0);
  const hueco = bus.eventos('bocaos.hueco_nombrado');
  assert.ok(hueco.length >= 1, 'sin precio, hueco nombrado (A34)');
  assert.strictEqual(modulos['pedido-mercado']._path, '/bocaos/pedido-mercado.json');
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

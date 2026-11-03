'use strict';

/**
 * bocaos · PELDAÑO 2 — la propuesta LLEGA al móvil, se ENTIENDE y tiene ESCALADA.
 *
 * Quince islas sobre un bus de mentira, con TODAS las de este peldaño reales: `canal-rider`
 * (transporte de mentira inyectado, sin token), `redaccion-propuesta` (sin LLM: plantilla) y
 * `escalada-enlace`. Sólo se contestan desde el bus dos cosas que no son de este peldaño: el
 * reflejo `fs` y el puerto de ruta (`ruta.desvio`).
 *
 * Lo que este test demuestra, y no se puede demostrar con stubs:
 *
 *   1. pedido → LISTO → foto → enlace → propuesta → CANAL → acuse → sí → CONTRATO, entero;
 *   2. la frase que ve el rider sale del micro-agente y sólo usa las cifras medidas;
 *   3. sin chat_id no hay entrega: el canal nombra el hueco y el CUSTODIO caduca sin acuse;
 *   4. la escalada sube la oferta dentro del tope autorizado y el enlace vuelve a medir con ella:
 *      el pedido que no tenía reparto acaba con contrato;
 *   5. sin tope autorizado no se paga más: escalada agotada, pedido sin reparto y cancelación.
 *
 * Ejecutar: node tests/unit/bocaos__peldano2-cadena.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PedidoMercado = require('../../modules/bocaos/pedido-mercado/index.js');
const TarifaPedido = require('../../modules/bocaos/tarifa-pedido/index.js');
const ContratoTramos = require('../../modules/bocaos/contrato-tramos/index.js');
const EntradaListo = require('../../modules/bocaos/entrada-listo/index.js');
const HechoListo = require('../../modules/bocaos/hecho-listo/index.js');
const FotoMercado = require('../../modules/bocaos/foto-mercado/index.js');
const Enlace = require('../../modules/bocaos/enlace/index.js');
const Propuesta = require('../../modules/bocaos/propuesta/index.js');
const ContratoPuntual = require('../../modules/bocaos/contrato-puntual/index.js');
const HechosReparto = require('../../modules/bocaos/hechos-reparto/index.js');
const EstadoParte = require('../../modules/bocaos/estado-parte/index.js');
const RutaViva = require('../../modules/bocaos/ruta-viva/index.js');
const ConfigMercado = require('../../modules/bocaos/config-mercado/index.js');
const CanalRider = require('../../modules/bocaos/canal-rider/index.js');
const RedaccionPropuesta = require('../../modules/bocaos/redaccion-propuesta/index.js');
const EscaladaEnlace = require('../../modules/bocaos/escalada-enlace/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const TIENDA = 'tienda-paco';
const RIDER = 'rid-1';
const CHAT = '5551234';
const PRECIO = { total_cents: 1850, moneda: 'EUR', reparto_cents: 450 };
const PUNTO = { lat: 36.72, lng: -4.42 };
const DESTINO = { lat: 36.725, lng: -4.43 };
const POSICION = { lat: 36.74, lng: -4.42 };

const T0 = Date.now();
const T = (min) => new Date(T0 + min * 60000).toISOString();
const LISTO = T(12);
const ACUSE = T(0.1);
const SI = T(0.2);

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

// Los puertos que NO son de este peldaño: el reflejo fs y la medida del desvío.
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
    const metros = typeof desvio === 'function' ? desvio(e.data) : desvio;
    bus.publish('ruta.desvio.response', { request_id: e.data.request_id, status: 200, data: { metros } });
  });
  return disco;
}

// ─── PIZZEPOS DE MENTIRA: los eventos REALES de la frontera (pedido.creado · cocina.pedido_listo) ───
function pizzepos(bus) {
  const pedidos = new Map();
  bus.subscribe('pedido.get.request', (e) => {
    const p = pedidos.get(e.data.pedido_id);
    if (!p) return bus.publish('pedido.get.response', { request_id: e.data.request_id, status: 404, error: { code: 'RESOURCE_NOT_FOUND', message: 'sin pedido' } });
    bus.publish('pedido.get.response', { request_id: e.data.request_id, status: 200, data: { pedido: p } });
  });
  return {
    creado(payload) {
      const pedido = { cuenta_id: 'cta-1', modo_consumo: 'domicilio', ...payload };
      pedidos.set(pedido.pedido_id, pedido);
      bus.publish('pedido.creado', pedido);
      return pedido;
    },
    listo({ pedido_id, hora, dispositivo = 'horno-1' }) {
      const p = pedidos.get(pedido_id) || {};
      bus.publish('cocina.pedido_listo', {
        pedido_id, cuenta_id: p.cuenta_id || null,
        project_id: p.project_id || TIENDA, project_slug: p.project_slug || TIENDA,
        hora, dispositivo
      });
    },
    pedidos
  };
}

// `entrada-listo` es la hoja de verdad: el arnés ya no la sustituye. El disparador es el evento
// REAL de pizzepos (cocina.pedido_listo) y el puente pide el total a la tienda y el precio de
// reparto a `tarifa-pedido`: no inventa ninguno de los dos.
const RAIZ = path.join(__dirname, '../../modules/bocaos');

function montar(opciones = {}) {
  const bus = crearBus();
  const rpc = crearRpc(bus);
  const enviados = [];

  const modulos = {
    'pedido-mercado': new PedidoMercado(),
    'tarifa-pedido': new TarifaPedido(),
    'contrato-tramos': new ContratoTramos(),
    'entrada-listo': new EntradaListo(),
    'hecho-listo': new HechoListo(),
    'foto-mercado': new FotoMercado(),
    enlace: new Enlace(),
    propuesta: new Propuesta(),
    'contrato-puntual': new ContratoPuntual(),
    'hechos-reparto': new HechosReparto(),
    'estado-parte': new EstadoParte(),
    'ruta-viva': new RutaViva(),
    'config-mercado': new ConfigMercado(),
    'canal-rider': new CanalRider(),
    'redaccion-propuesta': new RedaccionPropuesta(),
    'escalada-enlace': new EscaladaEnlace()
  };

  for (const [nombre, m] of Object.entries(modulos)) {
    m.name = nombre;
    m.eventBus = bus;
    m.logger = { info() {}, warn() {}, error() {} };
    m.metrics = { increment() {} };
    m._rpc = rpc;
    m.plaza_id = PLAZA;
  }

  // El móvil de mentira: apunta lo que se le manda y no habla con Telegram (sin token).
  modulos['canal-rider'].transporte = {
    enviar: async (msg) => { enviados.push(msg); return { ok: true, mensaje_id: enviados.length }; }
  };
  // Se espera la frase del micro-agente; si no llegara, el suelo de la propuesta.
  modulos['canal-rider'].espera_redaccion_ms = 5000;
  modulos['canal-rider'].bot = 'bocaos';

  // Cableado desde module.json, como hace el loader.
  for (const [nombre, m] of Object.entries(modulos)) {
    const man = JSON.parse(fs.readFileSync(path.join(RAIZ, nombre, 'module.json'), 'utf8'));
    for (const sub of man.subscribes) {
      const fn = m[sub.handler];
      if (typeof fn !== 'function') throw new Error(`${nombre}: el handler declarado ${sub.handler} no existe`);
      bus.subscribe(sub.event, fn.bind(m));
    }
  }

  puertos(bus, opciones);
  const pz = pizzepos(bus);
  modulos.__pizzepos = pz;   // el doble de pizzepos, para que el arnés pueda dar de alta
  modulos.__pizzepos_pub = (ev, p) => bus.publish(ev, p);
  bus.publish('project.activated', { project_id: PLAZA });
  bus.publish('project.activated', { project_id: TIENDA });
  return { bus, modulos, rpc, enviados };
}

async function abrirPlaza(rpc, { chat = CHAT, umbrales = {} } = {}) {
  const cfg = await rpc('config-mercado.declarar.request', {
    project_id: PLAZA, plaza_id: PLAZA, ambito: 'plaza', autor: 'duena-de-la-plaza', acta: 'acta-apertura',
    desde: T(-30),
    umbrales: { desvio_m: 800, espera_min: 4, retraso_min: 6, cobra_min_cents: 0, ...umbrales },
    ventana: { validez_s: 20, decision_s: 10, acuse_s: 5, tope_candidatos: 3 },
    ruta: { frescura_s: 90, velocidad_kmh: 18, factor_calle: 1.35 },
    coste_rider: { vehiculos: { moto: 0.14, coche: 0.25, bici: 0.02 }, eur_min: 0.257 }
  });
  assert.strictEqual(cfg.status, 201, JSON.stringify(cfg));

  const rid = await rpc('estado-parte.alta.request', {
    project_id: PLAZA, plaza_id: PLAZA, tipo: 'rider', rider_id: RIDER,
    zonas: ['centro'], vehiculo: 'moto', capacidad: 2, chat_id: chat
  });
  assert.strictEqual(rid.status, 201, JSON.stringify(rid));

  const pos = await rpc('ruta-viva.posicion.request', {
    project_id: PLAZA, plaza_id: PLAZA, rider_id: RIDER, punto: POSICION, hora: T(0)
  });
  assert.strictEqual(pos.status, 200, JSON.stringify(pos));
}

// El alta la hace PIZZEPOS (pedido.creado real, con su bloque entrega). El tope que el cliente
// autoriza al pedir viaja con la entrega y lo ANUNCIA su custodio — `tarifa-pedido`, que congela la
// oferta y el tope — como hecho `bocaos.tarifa`, que es lo que escucha la escalada. Antes lo emitía
// el `pedido` retirado; hoy lo emite la isla que custodia el número (cero emisores de mentira).
async function altaDePedido(rpc, modulos, cliente = 'cli-1', extra = {}) {
  const pz = modulos.__pizzepos;
  const { tope_reparto_cents, escalon_cents, ...resto } = extra;
  const pedido = pz.creado({
    pedido_id: `ped-${cliente}`,
    project_id: TIENDA, project_slug: TIENDA,
    total_centimos: PRECIO.total_cents, items_count: 1, cliente_nombre: 'Ana',
    entrega: {
      direccion: { calle: 'Larios', numero: 3, cp: '29005' }, zona: 'centro',
      oferta_centimos: 450, punto: PUNTO, destino: DESTINO,
      ...(tope_reparto_cents ? { tope_centimos: tope_reparto_cents } : {}),
      ...(Number.isInteger(escalon_cents) ? { escalon_centimos: escalon_cents } : {}),
      ...resto
    }
  });
  const pedido_id = pedido.pedido_id;
  const acogido = await rpc('pedido-mercado.aceptar.request', { project_id: PLAZA, pedido_id, rol: 'tienda', tienda_id: TIENDA });
  assert.strictEqual(acogido.status, 200, JSON.stringify(acogido));
  // Cocina marca listo (evento REAL) y entrada-listo compone el hecho de la plaza.
  pz.listo({ pedido_id, hora: LISTO });
  return pedido_id;
}

// ─────────────────────────────────────────────────────────────────────────────
test('la cadena entera: pedido → LISTO → foto → enlace → propuesta → móvil → acuse → sí → contrato', async () => {
  const { bus, modulos, rpc, enviados } = montar();
  await bus.drenar();
  await abrirPlaza(rpc);
  await bus.drenar();

  const pedido_id = await altaDePedido(rpc, modulos);
  await bus.drenar();

  // El cuello propuso y el micro-agente redactó.
  assert.strictEqual(bus.eventos('bocaos.enlace_completado').length, 1, 'el enlace propuso');
  assert.strictEqual(bus.eventos('bocaos.propuesta_emitida').length, 1);
  const redactada = bus.eventos('bocaos.propuesta_redactada');
  assert.strictEqual(redactada.length, 1, 'siempre hay frase');
  const propuesta_id = bus.eventos('bocaos.propuesta_emitida')[0].p.propuesta_id;
  assert.strictEqual(redactada[0].p.propuesta_id, propuesta_id);

  // Y llegó al móvil del rider correcto, con ESA frase (no con una inventada por el canal).
  const entregada = bus.eventos('bocaos.propuesta_entregada');
  assert.strictEqual(entregada.length, 1, 'la propuesta se entregó');
  assert.strictEqual(entregada[0].p.chat_id, CHAT);
  assert.strictEqual(entregada[0].p.propuesta_id, propuesta_id);
  assert.strictEqual(enviados.length, 1);
  assert.strictEqual(enviados[0].texto, redactada[0].p.frase, 'el móvil muestra la frase del micro-agente');
  assert.strictEqual(enviados[0].chat_id, CHAT);
  assert.strictEqual(bus.eventos('bocaos.propuesta_no_entregada').length, 0);

  // El acuse lo manda el móvil y lo escribe el CUSTODIO: arranca el reloj de decisión (Q42).
  // El móvil entra por la puerta del transporte, no publicando hechos del custodio.
  const rAcuse = await rpc('canal-rider.recibir.request', { project_id: PLAZA, plaza_id: PLAZA, propuesta_id, rider_id: RIDER, accion: 'acuse', hora: ACUSE });
  assert.strictEqual(rAcuse.status, 200, JSON.stringify(rAcuse));
  await bus.drenar();

  const acusada = await rpc('propuesta.de.request', { project_id: PLAZA, pedido_id });
  assert.strictEqual(acusada.status, 200);
  assert.strictEqual(acusada.data.propuesta.estado, 'ACUSADA');
  const reloj = Date.parse(acusada.data.propuesta.decision_expira_en) - Date.parse(acusada.data.propuesta.hora_acuse);
  assert.strictEqual(reloj, 10000, 'el acuse abre 10 s de decisión, no 20');

  // El sí también viene del móvil; el contrato lo construye el custodio del contrato (A24/A27).
  const rSi = await rpc('canal-rider.recibir.request', { project_id: PLAZA, plaza_id: PLAZA, propuesta_id, rider_id: RIDER, accion: 'aceptar', hora: SI });
  assert.strictEqual(rSi.status, 200, JSON.stringify(rSi));
  await bus.drenar();

  const hechosSi = bus.eventos('bocaos.propuesta_aceptada').filter((x) => x.p.origen === 'propuesta');
  assert.strictEqual(hechosSi.length, 1, 'un solo sí: el del custodio');
  assert.strictEqual(bus.eventos('bocaos.contrato_creado').length, 1, 'un solo contrato');
  const contrato = await rpc('contrato-puntual.de.request', { project_id: PLAZA, pedido_id });
  assert.strictEqual(contrato.status, 200);
  assert.strictEqual(contrato.data.contrato.estado, 'VIVO');
  assert.strictEqual(contrato.data.contrato.rider_id, RIDER);
  assert.strictEqual(contrato.data.contrato.precio_cents, 450);

  // El contrato NO mueve el pedido: lo mueve la RECOGIDA (el rider se lo lleva). El estado sigue
  // LISTO hasta que hay un hecho de recogida, y eso es lo que impide que un pedido «aparezca» en
  // la calle porque alguien firmó un contrato.
  const pedido = await rpc('pedido-mercado.de.request', { project_id: PLAZA, pedido_id });
  assert.strictEqual(pedido.data.pedido.estado, 'LISTO');

  const parte = await rpc('estado-parte.de.request', { project_id: PLAZA, plaza_id: PLAZA, parte_id: RIDER });
  assert.strictEqual(parte.data.parte.estado, 'ocupado', 'el contrato vivo pone «ocupado»');
});

test('la frase que ve el rider sólo usa las cifras medidas (312 m · 4,50 € · 10 s)', async () => {
  const { bus, modulos, rpc } = montar();
  await bus.drenar();
  await abrirPlaza(rpc);
  await bus.drenar();
  await altaDePedido(rpc, modulos);
  await bus.drenar();

  const r = bus.eventos('bocaos.propuesta_redactada')[0].p;
  assert.ok(r.frase.includes('312 m'), r.frase);
  assert.ok(r.frase.includes('4,50 €'), r.frase);
  assert.ok(r.frase.includes('10 s'), r.frase);
  assert.strictEqual(r.fuente, 'plantilla');
  assert.strictEqual(r.validador.ok, true);
  assert.deepStrictEqual(bus.eventos('bocaos.propuesta_redaccion_descartada'), []);

  // Y la propuesta que guarda el custodio lleva LOS MISMOS números (no hay dos verdades).
  const emitida = bus.eventos('bocaos.propuesta_emitida')[0].p;
  assert.strictEqual(emitida.medidas.desvio_m, 312);
  assert.strictEqual(emitida.medidas.cobra_cents, 450);
  assert.ok(r.frase.includes(String(emitida.medidas.desvio_m)));
});

test('sin chat_id no hay entrega: el canal nombra el hueco y el custodio caduca sin acuse', async () => {
  const { bus, modulos, rpc, enviados } = montar();
  await bus.drenar();
  await abrirPlaza(rpc, { chat: null });
  await bus.drenar();
  await altaDePedido(rpc, modulos);
  await bus.drenar();

  assert.strictEqual(enviados.length, 0, 'sin móvil no se manda nada');
  assert.strictEqual(bus.eventos('bocaos.propuesta_entregada').length, 0);
  const no = bus.eventos('bocaos.propuesta_no_entregada');
  assert.strictEqual(no.length, 1);
  assert.strictEqual(no[0].p.hueco, 'sin chat_id');

  // El canal NO decide: no caduca. El que cierra es `propuesta`, al oír que no se entregó (A15).
  const sinAcuse = bus.eventos('bocaos.propuesta_caducada_sin_acuse');
  assert.strictEqual(sinAcuse.length, 1);
  assert.strictEqual(sinAcuse[0].p.propuesta_id, no[0].p.propuesta_id);
  assert.ok(sinAcuse[0].p.motivo.includes('chat_id'), 'el motivo del canal viaja con el hecho');
});

test('la escalada sube la oferta dentro del tope y el enlace vuelve a medir: acaba con contrato', async () => {
  // 450 c€ no llega al mínimo del rider (500). El cliente autoriza hasta 600, escalón 100, ANTES
  // de que haga falta: el tope es una autorización que viaja con el pedido, no un rescate a mano.
  const { bus, modulos, rpc, enviados } = montar();
  await bus.drenar();
  await abrirPlaza(rpc, { umbrales: { cobra_min_cents: 500 } });
  await bus.drenar();

  // El cliente autoriza el tope AL PEDIR: viaja con el pedido y sale como bocaos.tarifa.
  const pedido_id = await altaDePedido(rpc, modulos, 'cli-1', { tope_reparto_cents: 600, escalon_cents: 100 });
  await bus.drenar();
  assert.strictEqual(bus.eventos('bocaos.tarifa').length, 1, 'el tope autorizado es un hecho del bus');
  assert.strictEqual(bus.eventos('bocaos.tarifa')[0].p.tope_cents, 600);

  // La cadena se sube sola: agotado → peldaño 1 (abrir) → agotado → peldaño 2 (550) → propone.
  assert.ok(bus.eventos('bocaos.enlace_agotado').length >= 1, 'el enlace se agotó de verdad');

  const peldanos = bus.eventos('bocaos.escalada_peldano');
  assert.deepStrictEqual(peldanos.map((x) => x.p.peldano), [1, 2], 'primero abre, después paga más');
  assert.strictEqual(peldanos[0].p.nuevo_tope, null, 'el peldaño 1 no paga más: abre el mercado');
  assert.strictEqual(peldanos[1].p.nuevo_tope, 550, '450 + 100, dentro del tope de 600');

  // Y el enlace, al reintentar, MIDE CON LA OFERTA NUEVA: ahora sí propone.
  const emitidas = bus.eventos('bocaos.propuesta_emitida');
  assert.strictEqual(emitidas.length, 1, 'la oferta escalada destraba el enlace');
  assert.strictEqual(emitidas[0].p.medidas.cobra_cents, 550);
  assert.strictEqual(emitidas[0].p.pedido_id, pedido_id);

  // La propuesta escalada llega al móvil como cualquier otra.
  assert.strictEqual(bus.eventos('bocaos.propuesta_entregada').length, 1, 'una entrega, no dos');
  assert.strictEqual(enviados.slice(-1)[0].texto.includes('5,50 €'), true, enviados.slice(-1)[0].texto);

  // Y el sí sigue siendo el único camino al contrato (A27).
  const propuesta_id = emitidas[0].p.propuesta_id;
  // El móvil entra por la puerta del transporte, no publicando hechos del custodio.
  const rAcuse = await rpc('canal-rider.recibir.request', { project_id: PLAZA, plaza_id: PLAZA, propuesta_id, rider_id: RIDER, accion: 'acuse', hora: ACUSE });
  assert.strictEqual(rAcuse.status, 200, JSON.stringify(rAcuse));
  const rSi = await rpc('canal-rider.recibir.request', { project_id: PLAZA, plaza_id: PLAZA, propuesta_id, rider_id: RIDER, accion: 'aceptar', hora: SI });
  assert.strictEqual(rSi.status, 200, JSON.stringify(rSi));
  await bus.drenar();
  assert.strictEqual(bus.eventos('bocaos.contrato_creado').length, 1, 'un solo contrato');
  const contrato = await rpc('contrato-puntual.de.request', { project_id: PLAZA, pedido_id });
  assert.strictEqual(contrato.data.contrato.precio_cents, 550, 'el contrato es al precio escalado');
});

test('sin tope autorizado no se paga más: escalada agotada, pedido sin reparto y cancelación explícita', async () => {
  // Nadie pasa el desvío: 900 m > 800. Sin tope, la escalada no puede comprar un rider.
  const { bus, modulos, rpc } = montar({ desvio: 900 });
  await bus.drenar();
  await abrirPlaza(rpc);
  await bus.drenar();

  const pedido_id = await altaDePedido(rpc, modulos);
  await bus.drenar();

  assert.strictEqual(bus.eventos('bocaos.propuesta_emitida').length, 0);
  assert.strictEqual(bus.eventos('bocaos.escalada_agotada').length, 1);
  const agotada = bus.eventos('bocaos.escalada_agotada')[0].p;
  assert.ok(agotada.motivo.includes('tope autorizado'), agotada.motivo);

  const sinReparto = bus.eventos('bocaos.pedido_sin_reparto');
  assert.strictEqual(sinReparto.length, 1, 'cancelación explícita, no silencio');
  assert.strictEqual(sinReparto[0].p.pedido_id, pedido_id);

  const pedido = await rpc('pedido-mercado.de.request', { project_id: PLAZA, pedido_id });
  assert.strictEqual(pedido.data.pedido.estado, 'CANCELADO', 'el pedido no se queda esperando un rider que no existe');

  // Y no se entrega nada a ningún móvil: no hubo propuesta que entregar.
  assert.strictEqual(bus.eventos('bocaos.propuesta_entregada').length, 0);
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

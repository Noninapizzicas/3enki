'use strict';

/**
 * bocaos · CADENA DEL GRUPO 2 — las ocho hojas nuevas, por el bus, con las islas de verdad.
 *
 * No hay dobles de los módulos nuevos: se montan sus `module.json` y se cablean como hace el loader.
 * Lo único de mentira es pizzepos (sus dos eventos reales) y el reflejo fs.
 *
 * El recorrido, que es el del negocio:
 *
 *   cocina.pedido_listo → entrada-listo (compone) → bocaos.listo_declarado → hecho-listo (anota)
 *   → bocaos.pedido_listo. Después: reparto anotado → regla-fallo mide → cargo-fallo anota la deuda
 *   SIN importe. Y alrededor: la incidencia (abrir → clasificar), el chat enmascarado, la medida de
 *   la cocina y el panel de la tienda con el mismo número.
 *
 * Ejecutar: node tests/unit/bocaos__grupo2-cadena.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PedidoMercado = require('../../modules/bocaos/pedido-mercado/index.js');
const TarifaPedido = require('../../modules/bocaos/tarifa-pedido/index.js');
const ContratoTramos = require('../../modules/bocaos/contrato-tramos/index.js');
const EntradaListo = require('../../modules/bocaos/entrada-listo/index.js');
const HechoListo = require('../../modules/bocaos/hecho-listo/index.js');
const HechosReparto = require('../../modules/bocaos/hechos-reparto/index.js');
const ContratoPuntual = require('../../modules/bocaos/contrato-puntual/index.js');
const ConfigMercado = require('../../modules/bocaos/config-mercado/index.js');
const IncidenciaReparto = require('../../modules/bocaos/incidencia-reparto/index.js');
const LecturaIncidencia = require('../../modules/bocaos/lectura-incidencia/index.js');
const ReglaFallo = require('../../modules/bocaos/regla-fallo/index.js');
const CargoFallo = require('../../modules/bocaos/cargo-fallo/index.js');
const MedidaCocina = require('../../modules/bocaos/medida-cocina/index.js');
const PanelTienda = require('../../modules/bocaos/panel-tienda/index.js');
const ChatEnmascarado = require('../../modules/bocaos/chat-enmascarado/index.js');
const FronteraPlaza = require('../../modules/bocaos/frontera-plaza/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const TIENDA = 'tienda-paco';
const RIDER = 'rid-1';
const PEDIDO = 'ped-g2';

const PROMETIDA = '2026-11-03T14:00:00.000Z';
const LISTO = '2026-11-03T14:20:00.000Z';
const RECOGIDA = '2026-11-03T14:26:00.000Z';
const ENTREGA = '2026-11-03T14:45:00.000Z';
const DESPUES = '2026-11-03T18:00:00.000Z';

// ─── el bus ───
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
        } catch (err) { pendientes.push(Promise.reject(err)); }
      }
    },
    async drenar() {
      for (let v = 0; v < 400 && pendientes.length > 0; v += 1) {
        const lote = pendientes;
        pendientes = [];
        await Promise.all(lote);
      }
      if (pendientes.length > 0) throw new Error('el bus no se vacía');
    }
  };
}

function crearRpc(bus) {
  let n = 0;
  return function rpc(ev, payload = {}) {
    const request_id = `rpc-${++n}`;
    const respuesta = ev.endsWith('.request') ? `${ev.slice(0, -8)}.response` : `${ev}.response`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { unsub(); resolve({ status: 504, error: { code: 'SIN_RESPUESTA', message: ev } }); }, 4000);
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

const RAIZ = path.join(__dirname, '../../modules/bocaos');

function montar() {
  const bus = crearBus();
  const rpc = crearRpc(bus);
  const enviados = [];

  const modulos = {
    'pedido-mercado': new PedidoMercado(),
    'tarifa-pedido': new TarifaPedido(),
    'contrato-tramos': new ContratoTramos(),
    'entrada-listo': new EntradaListo(),
    'hecho-listo': new HechoListo(),
    'hechos-reparto': new HechosReparto(),
    'contrato-puntual': new ContratoPuntual(),
    'config-mercado': new ConfigMercado(),
    'incidencia-reparto': new IncidenciaReparto(),
    'lectura-incidencia': new LecturaIncidencia(),
    'regla-fallo': new ReglaFallo(),
    'cargo-fallo': new CargoFallo(),
    'medida-cocina': new MedidaCocina(),
    'panel-tienda': new PanelTienda(),
    'chat-enmascarado': new ChatEnmascarado(),
    // La cobertura de la plaza: el panel la pide para decir si llega a la zona de la tienda (S01).
    'frontera-plaza': new FronteraPlaza()
  };

  for (const [nombre, m] of Object.entries(modulos)) {
    m.name = nombre;
    m.eventBus = bus;
    m.logger = { info() {}, warn() {}, error() {} };
    m.metrics = { increment() {} };
    m._rpc = rpc;
    m.plaza_id = PLAZA;
  }

  // Los puertos que no son de este grupo.
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

  // El móvil del rider, para el chat.
  bus.subscribe('estado-parte.de.request', (e) => {
    if (e.data.parte_id !== RIDER) return bus.publish('estado-parte.de.response', { request_id: e.data.request_id, status: 404 });
    bus.publish('estado-parte.de.response', {
      request_id: e.data.request_id, status: 200,
      data: { parte: { parte_id: RIDER, tipo: 'rider', estado: 'activo', chat_id: '777001', zonas: ['centro'], capacidad: 2 } }
    });
  });

  // La entrega al cliente: el canal de la TIENDA.
  bus.subscribe('whatsapp.enviar.request', (e) => {
    enviados.push({ canal: 'whatsapp', ...e.data });
    bus.publish('whatsapp.enviar.response', { request_id: e.data.request_id, status: 200, data: { message_id: 'wa-1' } });
  });
  bus.subscribe('telegram.send_message.request', (e) => {
    enviados.push({ canal: 'telegram', ...e.data });
    bus.publish('telegram.send_message.response', { request_id: e.data.request_id, status: 200, data: { message_id: 'tg-1' } });
  });

  // ─── PIZZEPOS: los dos eventos reales de la frontera ───
  const pedidos = new Map();
  bus.subscribe('pedido.get.request', (e) => {
    const p = pedidos.get(e.data.pedido_id);
    if (!p) return bus.publish('pedido.get.response', { request_id: e.data.request_id, status: 404, error: { code: 'RESOURCE_NOT_FOUND', message: 'sin pedido' } });
    bus.publish('pedido.get.response', { request_id: e.data.request_id, status: 200, data: { pedido: p } });
  });
  const pizzepos = {
    creado(payload) {
      const pedido = { cuenta_id: 'cta-1', modo_consumo: 'domicilio', tipo: 'tienda', ...payload };
      pedidos.set(pedido.pedido_id, pedido);
      bus.publish('pedido.creado', pedido);
      return pedido;
    },
    listo({ pedido_id, hora }) {
      const p = pedidos.get(pedido_id) || {};
      bus.publish('cocina.pedido_listo', {
        pedido_id, cuenta_id: p.cuenta_id || null,
        project_id: p.project_id || TIENDA, project_slug: p.project_slug || TIENDA,
        listo_at: hora, ref_display: 'P-1'
      });
    },
    pedidos
  };

  // Cableado desde module.json, como hace el loader.
  for (const [nombre, m] of Object.entries(modulos)) {
    const man = JSON.parse(fs.readFileSync(path.join(RAIZ, nombre, 'module.json'), 'utf8'));
    for (const sub of man.subscribes) {
      const fn = m[sub.handler];
      if (typeof fn !== 'function') throw new Error(`${nombre}: el handler declarado ${sub.handler} no existe`);
      bus.subscribe(sub.event, fn.bind(m));
    }
  }

  bus.publish('project.activated', { project_id: PLAZA });
  bus.publish('project.activated', { project_id: TIENDA });

  return { bus, rpc, modulos, enviados, pizzepos };
}

test('la cadena del grupo 2: listo → hecho → reparto → fallo → deuda, con las islas de verdad', async () => {
  const { bus, rpc, modulos, enviados, pizzepos } = montar();
  await bus.drenar();

  // 0 · la política de la plaza, con acta (la ventana de las tres esperas).
  const cfg = await rpc('config-mercado.declarar.request', {
    project_id: PLAZA, ambito: 'plaza', autor: 'dueno', acta: 'acta-1', desde: '2026-11-01T00:00:00.000Z',
    esperas: { n1_tienda_min: 8, n2_portal_min: 5, n3_entrega_min: 10 }
  });
  assert.strictEqual(cfg.status, 201, JSON.stringify(cfg));
  await bus.drenar();

  // 1 · pizzepos crea el pedido CON el bloque `entrega` (la adaptación) y su tope.
  pizzepos.creado({
    pedido_id: PEDIDO, project_id: TIENDA, project_slug: TIENDA, total_centimos: 1850, items_count: 2,
    entrega: {
      direccion: { calle: 'Larios', numero: 3, cp: '29005' }, zona: 'centro',
      oferta_centimos: 450, tope_centimos: 600, escalon_centimos: 100,
      punto: { lat: 36.72, lng: -4.42 }, destino: { lat: 36.725, lng: -4.43 },
      instrucciones: 'Portal verde, 2ºB'
    }
  });
  // El teléfono del cliente NO viaja en pedido.creado (anti-fraude/RGPD): vive en el pedido de la
  // tienda y sólo se puede pedir por `pedido.get`. Aquí se pone donde está de verdad.
  pizzepos.pedidos.get(PEDIDO).cliente_telefono = '+34 600 11 22 33';
  await bus.drenar();
  assert.strictEqual(bus.eventos('bocaos.pedido_creado').length, 1, 'el pedido del mercado nace');
  assert.strictEqual(bus.eventos('bocaos.tarifa').length, 1, 'el tope autorizado lo anuncia su custodio');

  const acogido = await rpc('pedido-mercado.aceptar.request', { project_id: PLAZA, pedido_id: PEDIDO, rol: 'tienda', tienda_id: TIENDA });
  assert.strictEqual(acogido.status, 200, JSON.stringify(acogido));
  await bus.drenar();

  // 2 · la cocina marca listo: el ÚNICO punto donde Bocaos escucha a la tienda.
  pizzepos.listo({ pedido_id: PEDIDO, hora: LISTO });
  await bus.drenar();

  const declarados = bus.eventos('bocaos.listo_declarado');
  assert.strictEqual(declarados.length, 1, 'entrada-listo declara el hecho');
  assert.strictEqual(declarados[0].p.precio_congelado.reparto_cents, 450, 'con el precio de reparto dentro');
  assert.strictEqual(declarados[0].p.hora_listo, LISTO, 'y con la hora que declaró la cocina');

  const listos = bus.eventos('bocaos.pedido_listo');
  assert.strictEqual(listos.length, 1, 'hecho-listo lo anota: el puente no guarda nada');
  assert.deepStrictEqual(listos[0].p.destino, { lat: 36.725, lng: -4.43 });
  // Las instrucciones de acceso NO se copian al hecho del reparto: son dato personal del cliente del
  // cliente y las custodia F05 (`instrucciones-acceso`), con ventana de contrato vivo. Duplicarlas
  // aquí sería una segunda copia sin ventana.
  assert.strictEqual(listos[0].p.instrucciones, undefined);

  // 3 · el rider dice sí (el hecho de la propuesta, que ya tiene su test) y nace el contrato.
  bus.publish('bocaos.propuesta_aceptada', {
    origen: 'propuesta', propuesta_id: 'pr-1', pedido_id: PEDIDO, plaza_id: PLAZA, rider_id: RIDER,
    hora_aceptacion: '2026-11-03T13:55:00.000Z', hora_prometida: PROMETIDA, medidas: { cobra_cents: 450 }
  });
  await bus.drenar();
  assert.strictEqual(bus.eventos('bocaos.contrato_creado').length, 1, 'hay contrato: hay reparto');

  // 3b · el chat enmascarado, con el contrato VIVO: el mensaje cruza y el número no.
  const contrato_id = bus.eventos('bocaos.contrato_creado')[0].p.contrato_id;
  const chat = await rpc('chat-enmascarado.entregar.request', {
    project_id: PLAZA, plaza_id: PLAZA, contrato_id,
    de: 'rider', texto: 'Bajo ahora, llámame al 600 11 22 33'
  });
  assert.strictEqual(chat.status, 200, JSON.stringify(chat));
  const alCliente = enviados.find((x) => x.canal === 'whatsapp');
  assert.ok(alCliente, 'el mensaje sale por el canal de la tienda');
  assert.ok(!/600\s?11\s?22\s?33/.test(alCliente.text), 'el número no cruza');

  // 4 · los hechos del reparto, con hora y con la prueba declarada.
  await rpc('hechos-reparto.anotar.request', { project_id: PLAZA, plaza_id: PLAZA, pedido_id: PEDIDO, tipo: 'recogida', hora: RECOGIDA, autor: RIDER });
  await rpc('hechos-reparto.prueba.request', { project_id: PLAZA, plaza_id: PLAZA, pedido_id: PEDIDO, falta: true, motivo: 'el cliente cogió el pedido en la puerta', autor: RIDER });
  await rpc('hechos-reparto.anotar.request', { project_id: PLAZA, plaza_id: PLAZA, pedido_id: PEDIDO, tipo: 'entrega', hora: ENTREGA, autor: RIDER });
  await bus.drenar();

  // 5 · regla-fallo mide: la cocina se pasó 20 min de los 8 de la ventana → falla N1.
  const evaluado = await rpc('regla-fallo.evaluar.request', { project_id: PLAZA, plaza_id: PLAZA, pedido_id: PEDIDO, instante: DESPUES });
  assert.strictEqual(evaluado.status, 200, JSON.stringify(evaluado));
  assert.strictEqual(evaluado.data.fallo.existe, true, 'con hechos con hora, el fallo existe');
  assert.strictEqual(evaluado.data.fallo.esperas.n1_tienda.min, 20);
  assert.strictEqual(evaluado.data.fallo.esperas.n2_portal.excedido, null, 'el portal no se puede medir y se dice');
  assert.strictEqual(evaluado.data.fallo.traza.estado, 'CONFORME');
  await bus.drenar();

  const medidos = bus.eventos('bocaos.fallo_medido');
  assert.strictEqual(medidos.length, 1);

  // 6 · cargo-fallo anota la deuda: con dos partes, con evidencia y SIN importe.
  const anotados = bus.eventos('bocaos.cargo_anotado');
  assert.strictEqual(anotados.length, 1, 'la deuda nace');
  const deuda = anotados[0].p;
  assert.deepStrictEqual(deuda.deudor, { rol: 'tienda', parte_id: TIENDA });
  assert.deepStrictEqual(deuda.acreedor, { rol: 'rider', parte_id: RIDER });
  assert.strictEqual(deuda.importe_centimos, null, 'Q28: la tabla no tiene importes');
  assert.strictEqual(deuda.importe_estado, 'NO_CONSTA');
  assert.strictEqual(deuda.evidencia.length, 2, 'la evidencia viaja con la deuda');
  assert.strictEqual(deuda.cobrado, false, 'la plaza no retiene');

  const saldo = await rpc('cargo-fallo.de.request', { project_id: PLAZA, pedido_id: PEDIDO });
  assert.strictEqual(saldo.data.saldo.total_estado, 'NO_CONSTA');

  // 7 · la incidencia: se abre sin clasificar y el borde la etiqueta.
  const abierta = await rpc('incidencia-reparto.abrir.request', {
    project_id: PLAZA, plaza_id: PLAZA, pedido_id: PEDIDO, relato: 'No encontraba el portal', autor: RIDER,
    hora: DESPUES
  });
  assert.strictEqual(abierta.status, 201, JSON.stringify(abierta));
  assert.strictEqual(abierta.data.incidencia.clasificado, false);
  await bus.drenar();
  assert.strictEqual(bus.eventos('bocaos.incidencia_abierta').length, 1);
  assert.strictEqual(bus.eventos('bocaos.fallo_medido').length, 1, 'el fallo ya estaba medido: no se duplica');

  modulos['lectura-incidencia'].llm = async () => 'no_encontraba_el_portal';
  const leida = await rpc('lectura-incidencia.clasificar.request', {
    project_id: PLAZA, plaza_id: PLAZA, incidencia_id: abierta.data.incidencia.incidencia_id,
    pedido_id: PEDIDO, relato: 'No encontraba el portal, el portero no estaba'
  });
  assert.strictEqual(leida.data.etiqueta, 'no_encontraba_el_portal');
  await bus.drenar();
  assert.strictEqual(bus.eventos('bocaos.incidencia_clasificada').length, 1);

  // 8 · la entrega cerró el contrato: el alias murió y el canal ya no entrega.
  const tarde = await rpc('chat-enmascarado.entregar.request', {
    project_id: PLAZA, plaza_id: PLAZA, contrato_id, de: 'cliente', texto: 'Gracias'
  });
  assert.strictEqual(tarde.status, 409, 'con el contrato cerrado el alias no resuelve');
  assert.strictEqual(tarde.error.details.hueco, 'alias muerto');

  // 9 · la medida de la cocina y el panel de la tienda: el MISMO número.
  const serie = [
    { pedido_id: 'x1', hora_prometida: PROMETIDA, hora_listo: LISTO },
    { pedido_id: 'x2', hora_prometida: '2026-11-03T20:00:00.000Z', hora_listo: '2026-11-03T20:02:00.000Z' },
    { pedido_id: 'x3', hora_prometida: '2026-11-03T21:00:00.000Z', hora_listo: '2026-11-03T21:01:00.000Z' },
    { pedido_id: 'x4', hora_prometida: '2026-11-03T22:00:00.000Z', hora_listo: '2026-11-03T22:00:00.000Z' },
    { pedido_id: 'x5', hora_prometida: '2026-11-03T23:00:00.000Z', hora_listo: '2026-11-03T23:03:00.000Z' }
  ];
  const medida = await rpc('medida-cocina.medir.request', { project_id: TIENDA, tienda_id: TIENDA, plaza_id: PLAZA, hechos: serie });
  assert.strictEqual(medida.data.medida.estado, 'MEDIDA');
  assert.strictEqual(medida.data.medida.nota, null, 'una distribución, no una nota');

  const panel = await rpc('panel-tienda.ver.request', {
    project_id: TIENDA, tienda_id: TIENDA, plaza_id: PLAZA, zona: 'centro', hechos: serie,
    pedidos: [{ pedido_id: PEDIDO, rider_id: RIDER, contrato_id: 'ct-1' }], propuestas: [{ estado: 'aceptada' }]
  });
  assert.strictEqual(panel.status, 200, JSON.stringify(panel));
  assert.strictEqual(panel.data.panel.espera_medida_min, medida.data.medida.espera_medida_min,
    'la tienda y el rider ven el mismo número: sale de la misma medida');
  assert.strictEqual(panel.data.panel.puntualidad.n, medida.data.medida.n);
  assert.strictEqual(panel.data.panel.version_amable, false);
  assert.strictEqual(panel.data.panel.umbrales.es_suya, false, 'la tienda no declaró: rige la plaza');
});

test('el grupo 2 no llama a ninguna isla: todo va por el bus', () => {
  const nuevos = ['entrada-listo', 'chat-enmascarado', 'medida-cocina', 'panel-tienda',
    'incidencia-reparto', 'lectura-incidencia', 'regla-fallo', 'cargo-fallo'];
  for (const dir of nuevos) {
    const src = fs.readFileSync(path.join(RAIZ, dir, 'index.js'), 'utf8');
    const requires = [...src.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]).filter((r) => r.startsWith('.'));
    for (const r of requires) assert.strictEqual(r, '../_bocaos', `${dir}: require ${r}`);
  }
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

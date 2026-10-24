/**
 * Tests unitarios — ESTADO DE SERVICIO (horario + interruptor del dueño).
 *
 * Cubre las tres piezas del mismo dato:
 *   1. _shared/horario-servicio.js    — la decisión, pura (sin I/O, con instante inyectado)
 *   2. pizzepos/pedidos               — la PUERTA: el pedido de tienda se frena aquí
 *   3. pizzepos/tienda-api            — el ESPEJO: la PWA pregunta y pinta
 *
 * Ejecutar: node tests/unit/pizzepos__servicio.test.js
 */

'use strict';

const assert = require('assert');

const { estadoServicio, mensajeCierre, partesEnZona } = require('../../modules/_shared/horario-servicio');
const LectorServicio = require('../../modules/_shared/lector-servicio');
const PedidosModule = require('../../modules/pizzepos/pedidos/index.js');
const TiendaApiModule = require('../../modules/pizzepos/tienda-api/index.js');

// --------------------------------------------------
// Mocks
// --------------------------------------------------

const CONFIG = {
  servicio: {
    zona_horaria: 'Europe/Madrid',
    horario: {
      lunes: [],
      martes: ['19:30-23:30'],
      miercoles: ['19:30-23:30'],
      jueves: ['19:30-23:30'],
      viernes: ['19:30-01:00'],
      sabado: ['13:00-16:00', '19:30-23:30'],
      domingo: ['19:30-23:30']
    },
    interruptor: { abierto: true },
    recogida: {
      direccion: 'Juan Carlo I, 49',
      ciudad: 'Lorca',
      maps_url: 'https://www.google.com/maps/search/?api=1&query=Juan+Carlo+I+49,+Lorca'
    }
  }
};

// Bus falso: responde las RPC que le pidas por nombre de evento.
function makeBus(handlers = {}) {
  const subs = new Map();
  return {
    published: [],
    subscribe(ev, fn) {
      if (!subs.has(ev)) subs.set(ev, new Set());
      subs.get(ev).add(fn);
      return () => subs.get(ev)?.delete(fn);
    },
    publish(ev, payload) {
      this.published.push([ev, payload]);
      const h = handlers[ev];
      if (h) {
        const res = typeof h === 'function' ? h(payload) : h;
        const responseEv = ev.endsWith('.request') ? ev.slice(0, -'.request'.length) + '.response' : `${ev}.response`;
        setImmediate(() => {
          for (const fn of subs.get(responseEv) || []) {
            fn({ data: { request_id: payload.request_id, ...res } });
          }
        });
      }
      return Promise.resolve();
    }
  };
}

const configBus = (cfg = CONFIG) => ({
  'fs.read.request': () => ({ status: 200, content: JSON.stringify(cfg) }),
  'fs.write.request': () => ({ status: 200 })
});

const logger = { debug() {}, info() {}, warn() {}, error() {} };
const metrics = { increment() {}, gauge() {}, timing() {} };

function pedidoValido(extra = {}) {
  return {
    project_slug: 'demo',
    items: [{ cantidad: 1, descripcion: 'Pizza Margarita' }],
    total_centimos: 950,
    canal_origen: 'web',
    cliente_nombre: 'Ana',
    ...extra
  };
}

// --------------------------------------------------
// 1. horario-servicio (puro)
// --------------------------------------------------

function testSinConfigNoCierraNada() {
  const e = estadoServicio(null, new Date('2026-10-24T17:00:00Z'));
  assert.strictEqual(e.abierto, true, 'sin config de servicio el negocio está abierto');
  assert.strictEqual(e.motivo, null);
  console.log('  ✓ sin bloque servicio → abierto (un fallo de config no cierra el negocio)');
}

function testHorarioDentroYFuera() {
  // 2026-10-24 (sábado) 18:30Z = 20:30 en Madrid (CEST) → dentro de 19:30-23:30
  const dentro = estadoServicio(CONFIG.servicio, new Date('2026-10-24T18:30:00Z'));
  assert.strictEqual(dentro.abierto, true);
  assert.strictEqual(dentro.franja_actual, '19:30-23:30');
  assert.strictEqual(dentro.ahora.hora, '20:30', 'la hora se resuelve en Europe/Madrid, no en UTC');

  // 17:00Z = 19:00 en Madrid → aún cerrado (abre 19:30)
  const fuera = estadoServicio(CONFIG.servicio, new Date('2026-10-24T17:00:00Z'));
  assert.strictEqual(fuera.abierto, false);
  assert.strictEqual(fuera.motivo, 'horario');
  assert.ok(fuera.proxima_apertura, 'fuera de horario dice cuándo abre');
  assert.strictEqual(fuera.proxima_apertura.desde, '19:30');
  console.log('  ✓ horario: dentro abre con su franja; fuera cierra y anuncia la próxima apertura');
}

function testDiaCerradoListaVacia() {
  // lunes 2026-10-26, 20:30 Madrid (19:30Z)
  const e = estadoServicio(CONFIG.servicio, new Date('2026-10-26T19:30:00Z'));
  assert.strictEqual(e.abierto, false);
  assert.strictEqual(e.motivo, 'horario');
  assert.strictEqual(e.proxima_apertura.fecha, '2026-10-27');
  console.log('  ✓ un día con lista vacía es un cierre escrito, no un olvido');
}

function testFranjaCruzaMedianoche() {
  // viernes 2026-10-23 22:30Z = sábado 00:30 en Madrid → sigue abierta la franja del viernes
  const e = estadoServicio(CONFIG.servicio, new Date('2026-10-23T22:30:00Z'));
  assert.strictEqual(e.abierto, true, 'la franja 19:30-01:00 cubre la madrugada siguiente');
  assert.strictEqual(e.franja_actual, '19:30-01:00');
  console.log('  ✓ franja que cruza medianoche (19:30-01:00) mantiene abierto a las 00:30');
}

function testExcepcionCerradoYFranjas() {
  const cerrado = {
    ...CONFIG.servicio,
    excepciones: [{ fecha: '2026-10-24', cerrado: true, motivo: 'Boda privada' }]
  };
  const e = estadoServicio(cerrado, new Date('2026-10-24T18:30:00Z'));
  assert.strictEqual(e.abierto, false);
  assert.strictEqual(e.motivo, 'excepcion');
  assert.strictEqual(e.motivo_texto, 'Boda privada');

  const tarde = {
    ...CONFIG.servicio,
    excepciones: [{ fecha: '2026-10-24', franjas: ['21:00-23:30'], motivo: 'Abrimos tarde' }]
  };
  const abierto = estadoServicio(tarde, new Date('2026-10-24T18:30:00Z'));
  assert.strictEqual(abierto.abierto, false, '20:30 no está en la franja excepcional 21:00-23:30');
  const despues = estadoServicio(tarde, new Date('2026-10-24T19:30:00Z'));  // 21:30 Madrid
  assert.strictEqual(despues.abierto, true);
  console.log('  ✓ excepciones: día cerrado y franjas distintas para una fecha concreta');
}

function testInterruptorMandaSobreHorario() {
  const cerrado = {
    ...CONFIG.servicio,
    interruptor: { abierto: false, motivo: 'saturacion', aviso: 'Estamos a tope, volvemos en un rato.' }
  };
  const e = estadoServicio(cerrado, new Date('2026-10-24T18:30:00Z'));  // dentro de horario
  assert.strictEqual(e.abierto, false, 'el dueño cierra aunque el horario diga abierto');
  assert.strictEqual(e.motivo, 'saturacion');
  assert.strictEqual(e.aviso, 'Estamos a tope, volvemos en un rato.');
  assert.ok(/a tope/.test(mensajeCierre(e)));
  console.log('  ✓ interruptor del dueño manda sobre el horario (saturación a las 20:30)');
}

function testInterruptorConHastaSeReabreSolo() {
  const conHasta = {
    ...CONFIG.servicio,
    interruptor: { abierto: false, motivo: 'saturacion', hasta: '2026-10-24T19:30:00Z' }
  };
  const antes = estadoServicio(conHasta, new Date('2026-10-24T19:00:00Z'));
  assert.strictEqual(antes.abierto, false, 'antes de `hasta` sigue cerrado');
  assert.ok(antes.proxima_apertura?.iso, 'declara la hora de reapertura');

  const despues = estadoServicio(conHasta, new Date('2026-10-24T19:45:00Z'));  // 21:45 Madrid
  assert.strictEqual(despues.abierto, true, 'pasado `hasta` se reabre solo: abrir cuando amaine');
  console.log('  ✓ `hasta` reabre solo; sin `hasta` el cierre es indefinido');
}

function testZonaHorariaNoEsLaDelServidor() {
  const p = partesEnZona(new Date('2026-07-01T22:30:00Z'), 'Europe/Madrid');
  assert.strictEqual(p.hora, '00:30', 'en verano Madrid va +2h: 22:30Z = 00:30 del día siguiente');
  assert.strictEqual(p.fecha, '2026-07-02');
  console.log('  ✓ el reloj se resuelve en la zona del negocio (UTC del servidor +2h en verano)');
}

// --------------------------------------------------
// 2. pedidos — la puerta
// --------------------------------------------------

function nuevoPedidos(cfg = CONFIG) {
  const bus = makeBus(configBus(cfg));
  const m = new PedidosModule();
  m.logger = logger;
  m.metrics = metrics;
  m.eventBus = bus;
  m.servicio = new LectorServicio({ eventBus: bus, logger, metrics, ttlMs: 0 });
  m._crearCuentaTienda = async () => {};
  m._publishPedidoCreado = async () => {};
  return { m, bus };
}

async function testPuertaCierraPorInterruptor() {
  const cfg = { servicio: { ...CONFIG.servicio, interruptor: { abierto: false, motivo: 'saturacion', aviso: 'Estamos a tope.' } } };
  const { m } = nuevoPedidos(cfg);
  const r = await m.handleCreatePedidoTienda(pedidoValido());
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'TIENDA_CERRADA');
  assert.strictEqual(r.error.details.motivo, 'saturacion');
  assert.strictEqual(m.pedidos.size, 0, 'no se crea ningún pedido');
  console.log('  ✓ pedidos: cierre por saturación → 409 TIENDA_CERRADA, sin pedido creado');
}

async function testPuertaCierraPorHorario() {
  // el horario se evalúa con el reloj REAL: se usa un proyecto cuyo horario no cubre "ahora"
  const ahora = partesEnZona(new Date(), 'Europe/Madrid');
  const dia = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'][ahora.dia_semana];
  const horario = { lunes: [], martes: [], miercoles: [], jueves: [], viernes: [], sabado: [], domingo: [] };
  horario[dia] = [];   // cerrado hoy, pase lo que pase
  const cfg = { servicio: { ...CONFIG.servicio, horario, interruptor: { abierto: true } } };
  const { m } = nuevoPedidos(cfg);
  const r = await m.handleCreatePedidoTienda(pedidoValido());
  assert.strictEqual(r.status, 412);
  assert.strictEqual(r.error.code, 'FUERA_DE_HORARIO');
  assert.strictEqual(m.pedidos.size, 0);
  console.log('  ✓ pedidos: fuera de horario → 412 FUERA_DE_HORARIO, sin pedido creado');
}

async function testPuertaAbiertaCreaPedido() {
  const cfg = { servicio: { zona_horaria: 'Europe/Madrid', interruptor: { abierto: true } } };  // sin horario
  const { m } = nuevoPedidos(cfg);
  const r = await m.handleCreatePedidoTienda(pedidoValido());
  assert.strictEqual(r.status, 201, 'sin horario y con interruptor abierto el pedido entra');
  assert.ok(r.data.pedido_id);
  assert.strictEqual(m.pedidos.size, 1);
  console.log('	✓ pedidos: abierto → 201 y el pedido se crea');
}

async function testSinLecturaDeConfigNoFrena() {
  const bus = makeBus({});   // fs.read no contesta → null
  const m = new PedidosModule();
  m.logger = logger; m.metrics = metrics; m.eventBus = bus;
  m.servicio = new LectorServicio({ eventBus: bus, logger, metrics, timeoutMs: 20, ttlMs: 0 });
  m._crearCuentaTienda = async () => {};
  m._publishPedidoCreado = async () => {};
  const r = await m.handleCreatePedidoTienda(pedidoValido());
  assert.strictEqual(r.status, 201, 'si no se puede leer la config, el pedido entra (degradación honesta)');
  console.log('  ✓ pedidos: config ilegible → no se frena nada (un timeout no cierra el negocio)');
}

async function testFicheroSinEnvoltorio() {
  // El fichero puede traer el bloque suelto (sin `servicio:` por encima): mismo dato.
  const suelto = { zona_horaria: 'Europe/Madrid', interruptor: { abierto: false, motivo: 'saturacion' } };
  const bus = makeBus({ 'fs.read.request': () => ({ status: 200, content: JSON.stringify(suelto) }) });
  const m = new PedidosModule();
  m.logger = logger; m.metrics = metrics; m.eventBus = bus;
  m.servicio = new LectorServicio({ eventBus: bus, logger, metrics, ttlMs: 0 });
  const r = await m.handleCreatePedidoTienda(pedidoValido());
  assert.strictEqual(r.status, 409, 'el bloque suelto se lee igual que el envuelto');
  console.log('  ✓ lector: acepta el bloque suelto y el envuelto en `servicio`');
}

async function testToolEstadoYSet() {
  const { m, bus } = nuevoPedidos();
  const estado = await m.handleEstadoServicio({ project_slug: 'demo' });
  assert.strictEqual(estado.status, 200);
  assert.strictEqual(typeof estado.data.abierto, 'boolean');
  assert.strictEqual(estado.data.recogida.direccion, 'Juan Carlo I, 49');
  assert.ok(estado.data.recogida.maps_url.includes('maps'));

  const sinSlug = await m.handleEstadoServicio({});
  assert.strictEqual(sinSlug.status, 400);

  const sinAbierto = await m.handleFijarServicio({ project_slug: 'demo' });
  assert.strictEqual(sinAbierto.status, 400, 'abierto es obligatorio');

  const ok = await m.handleFijarServicio({ project_slug: 'demo', abierto: false, motivo: 'saturacion' });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.data.abierto, false);
  assert.ok(bus.published.some(([ev]) => ev === 'servicio.cambiado'), 'publica servicio.cambiado');
  console.log('  ✓ pedidos: tools estado/set (el dueño cierra y se emite servicio.cambiado)');
}

// --------------------------------------------------
// 4. El contrato del comandero — el pill del header habla la MISMA puerta
// --------------------------------------------------

function testContratoDelComandero() {
  const fs = require('fs');
  const path = require('path');
  const manifest = require('../../modules/pizzepos/pedidos/module.json');

  // Misma derivación que core/modules/loader.js: domain = antes del primer punto.
  const claveUi = (nombre) => {
    const i = nombre.indexOf('.');
    return { domain: nombre.slice(0, i), action: nombre.slice(i + 1) };
  };

  const nombres = manifest.tools.map(t => t.name);
  assert.ok(nombres.includes('pedido.servicio.estado'), 'la tool de lectura existe');
  assert.ok(nombres.includes('pedido.servicio.set'), 'la tool de la tecla existe');
  assert.deepStrictEqual(claveUi('pedido.servicio.estado'), { domain: 'pedido', action: 'servicio.estado' });
  assert.deepStrictEqual(claveUi('pedido.servicio.set'), { domain: 'pedido', action: 'servicio.set' });

  const raiz = path.join(__dirname, '../..');
  const toggle = fs.readFileSync(
    path.join(raiz, 'frontend/src/lib/components/comandero/ServicioToggle.svelte'), 'utf8'
  );
  assert.ok(
    /mqttRequest<[^>]*>\('pedido', 'servicio\.estado'/.test(toggle),
    'el pill LEE por la puerta pedido/servicio.estado (no inventa otra)'
  );
  assert.ok(
    /mqttRequest<[^>]*>\('pedido', 'servicio\.set'/.test(toggle),
    'el pill ESCRIBE por la puerta pedido/servicio.set (no inventa otra)'
  );

  const cuentas = fs.readFileSync(
    path.join(raiz, 'frontend/src/lib/components/comandero/CuentasScreen.svelte'), 'utf8'
  );
  assert.ok(
    cuentas.includes('<ServicioToggle'),
    'el header del comandero monta el interruptor'
  );

  console.log('  ✓ comandero: el pill lee/escribe servicio.estado|set por la puerta pedido (misma tool, sin puerta nueva)');
}

// --------------------------------------------------
// 3. tienda-api — el espejo que lee la PWA
// --------------------------------------------------

function resFalsa() {
  const r = {
    headersSent: false,
    _status: null,
    _body: null,
    setHeader() {},
    status(s) { this._status = s; return { json: (b) => { this._body = b; return b; } }; }
  };
  return r;
}

async function testEstadoHttp() {
  const bus = makeBus(configBus());
  const t = new TiendaApiModule();
  t.logger = logger; t.metrics = metrics; t.eventBus = bus;
  t.servicio = new LectorServicio({ eventBus: bus, logger, metrics, ttlMs: 0 });

  const res = resFalsa();
  await t.handleEstadoGet({ params: { project: 'demo' } }, res);
  assert.strictEqual(res._status, 200);
  assert.strictEqual(res._body.data.project_slug, 'demo');
  assert.strictEqual(typeof res._body.data.abierto, 'boolean');
  assert.strictEqual(res._body.data.recogida.direccion, 'Juan Carlo I, 49');
  assert.strictEqual(typeof res._body.data.mensaje === 'string' || res._body.data.mensaje === null, true);

  const res400 = resFalsa();
  await t.handleEstadoGet({ params: {} }, res400);
  assert.strictEqual(res400._status, 400);
  console.log('  ✓ tienda-api: GET /tienda/estado/:project responde estado + recogida (y 400 sin slug)');
}

async function testEstadoHttpSinConfig() {
  const bus = makeBus({});   // fs.read mudo
  const t = new TiendaApiModule();
  t.logger = logger; t.metrics = metrics; t.eventBus = bus;
  t.servicio = new LectorServicio({ eventBus: bus, logger, metrics, timeoutMs: 20, ttlMs: 0 });
  const res = resFalsa();
  await t.handleEstadoGet({ params: { project: 'demo' } }, res);
  assert.strictEqual(res._status, 200);
  assert.strictEqual(res._body.data.abierto, true, 'sin config se informa abierto');
  assert.strictEqual(res._body.data.desactualizado, true);
  console.log('  ✓ tienda-api: sin config responde abierto y marcado desactualizado');
}

// --------------------------------------------------

(async () => {
  console.log('pizzepos__servicio — estado de servicio (horario + interruptor)');
  testSinConfigNoCierraNada();
  testHorarioDentroYFuera();
  testDiaCerradoListaVacia();
  testFranjaCruzaMedianoche();
  testExcepcionCerradoYFranjas();
  testInterruptorMandaSobreHorario();
  testInterruptorConHastaSeReabreSolo();
  testZonaHorariaNoEsLaDelServidor();
  await testPuertaCierraPorInterruptor();
  await testPuertaCierraPorHorario();
  await testPuertaAbiertaCreaPedido();
  await testSinLecturaDeConfigNoFrena();
  await testFicheroSinEnvoltorio();
  await testToolEstadoYSet();
  testContratoDelComandero();
  await testEstadoHttp();
  await testEstadoHttpSinConfig();
  console.log('pizzepos__servicio: OK');
})().catch(err => {
  console.error('pizzepos__servicio: FALLO');
  console.error(err);
  process.exit(1);
});

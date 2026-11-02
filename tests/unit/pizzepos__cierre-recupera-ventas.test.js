/**
 * Tests unitarios — el cierre de caja RESCATA las ventas del dia desde DISCO.
 *
 * Incidente real (01/11/2026, proyecto nonina): el POS registro 6 ventas por
 * 136,50 € y las dejo en `projects/nonina/persistencia/current/ventas.json`. El
 * proceso se reinicio a media tarde y a las 23:51 se cerro caja SIN `project_id`:
 * `ventasCache` estaba vacia, el cierre salio con 0 ventas y comparo el arqueo
 * (260) contra el fondo (250) → "sobrante 10 €" cuando la caja FALTABA 126,50 €
 * (esperado 250 + 136,50 = 386,50).
 *
 * Que se cubre:
 *   (1) memoria vacia + ventas.json en la carpeta del proyecto → el cierre las
 *       recupera, toma el project_id del FICHERO y el cuadre sale bien.
 *   (2) mismo caso pero con el archivo del dia (`persistencia/ventas/<fecha>.json`).
 *   (3) memoria vacia y nada en disco → cierre completado con aviso `sin_ventas`.
 *   (4) memoria con ventas → comportamiento de siempre, el disco NO se toca.
 *   (5) varias carpetas de proyecto con ventas del dia → elige la de mas ventas y
 *       declara la lista (`abierto.origen_ventas`), sin sumar negocios distintos.
 *   (6) reporte-cierre: `bots_por_proyecto` elige el bot por slug o UUID, y el
 *       mensaje avisa cuando el cierre no trae ventas.
 *
 * Ejecutar: node tests/unit/pizzepos__cierre-recupera-ventas.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const fsp    = require('fs').promises;
const os     = require('os');

const PersistenciaComanderoModule = require('../../modules/pizzepos/persistencia-comandero/index.js');
const ReporteCierreModule         = require('../../modules/pizzepos/reporte-cierre/index.js');

const FECHA = '2026-11-01';
const UUID_NONINA = '3b7795d7-2e63-4b8e-a5e3-f153c865f306';

// --------------------------------------------------
// Mocks (misma forma que pizzepos__persistencia-comandero.test.js)
// --------------------------------------------------

function makeMocks() {
  const logs         = [];
  const published    = [];
  const metricsCalls = [];

  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };
  const metrics = {
    increment: (n, l) => metricsCalls.push(['increment', n, l]),
    gauge:     (n, v, l) => metricsCalls.push(['gauge', n, v, l]),
    timing:    (n, ms, l) => metricsCalls.push(['timing', n, ms, l])
  };
  const eventBus = { publish: async (event, payload) => { published.push([event, payload]); } };

  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

const tmpDirs = [];
function makeTmpRoot() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cierre-rescate-'));
  tmpDirs.push(d);
  return d;
}
function cleanupTmp() {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

/** Instancia el custodio con data/ y projects/ dentro de un tmpdir propio. */
async function instantiate(mocks, opts = {}) {
  const root = opts.root || makeTmpRoot();
  const m    = new PersistenciaComanderoModule();

  const _onLoad = m.onLoad.bind(m);
  m.onLoad = async (core) => {
    const r = await _onLoad(core);
    m.projectsBasePath = path.join(root, 'projects');
    return r;
  };

  await m.onLoad({
    logger:   mocks.logger,
    metrics:  mocks.metrics,
    eventBus: mocks.eventBus,
    config: {
      data_dir:    path.join(root, 'data'),
      eventos_dir: path.join(root, 'data', 'eventos'),
      ventas_dir:  path.join(root, 'data', 'ventas'),
      current_dir: path.join(root, 'data', 'current'),
      backup_dir:  path.join(root, 'data', 'backups')
    }
  });
  await m._writeQueue;
  return { module: m, root };
}

// --------------------------------------------------
// Fixture: ventas del dia en disco
// --------------------------------------------------

let seq = 0;
function venta(total, { project_id = 'nonina', metodo = 'efectivo', cuenta } = {}) {
  seq += 1;
  return {
    venta_id:  `venta_test_${seq}`,
    timestamp: `${FECHA}T20:${String(seq % 60).padStart(2, '0')}:00.000Z`,
    project_id,
    cuenta: {
      cuenta_id: cuenta || `mesa_test_${seq}`,
      tipo:      'mesa',
      origen:    'Mesa',
      metadata:  { camarero: 'Ana' }
    },
    cobro: { cobro_id: `cobro_test_${seq}`, monto: total, propina: 0, monto_total: total, metodo_pago: metodo },
    pedidos: [],
    resumen: { subtotal: total, propina: 0, total_final: total }
  };
}

/** Las 6 ventas reales del incidente: suman exactamente 136,50 €. */
function ventasDelIncidente(project_id = 'nonina') {
  return [20, 25.5, 30, 18, 23, 20].map(t => venta(t, { project_id }));
}

async function escribirVentasProyecto(root, slug, ventas, { archivo = 'current', fecha = FECHA, project_id } = {}) {
  const dir = archivo === 'current'
    ? path.join(root, 'projects', slug, 'persistencia', 'current')
    : path.join(root, 'projects', slug, 'persistencia', 'ventas');
  await fsp.mkdir(dir, { recursive: true });
  const nombre = archivo === 'current' ? 'ventas.json' : `${fecha}.json`;
  await fsp.writeFile(path.join(dir, nombre), JSON.stringify({
    fecha,
    project_id: project_id || slug,
    ventas,
    resumen_dia: {}
  }, null, 2), 'utf-8');
  return path.join(dir, nombre);
}

// --------------------------------------------------
// Runner
// --------------------------------------------------

const pruebas = [];
function test(nombre, fn) { pruebas.push({ nombre, fn }); }

// ============================================================
// (1) memoria vacia + ventas.json del proyecto → rescate y cuadre real
// ============================================================
test('(1) memoria vacia → recupera 6 ventas del disco, project_id del fichero y faltante 126,50', async () => {
  const mocks = makeMocks();
  const { module: m, root } = await instantiate(mocks);

  // Estado tras el reinicio: cache vacia, jornada del dia, fondo 250 en el cajon.
  m.fechaJornada = FECHA;
  m.horaInicioJornada = `${FECHA}T09:00:00.000Z`;
  m.ventasCache = [];
  m.fondoInicialJornada = 250;

  // El disco SI tiene la verdad (lo que dejo el POS antes del reinicio).
  const fichero = await escribirVentasProyecto(root, 'nonina', ventasDelIncidente());
  mocks.published.length = 0;

  // Cierre a las 23:51 SIN project_id (el caso que fallo en vivo).
  const r = await m.handleCierreCaja({ arqueo: { efectivo: 260 }, correlation_id: 'cid-RESCATE' });

  assert.strictEqual(r.status, 200, 'el cierre se completa');
  assert.ok(r.data && r.data.cierre, 'devuelve el cierre');

  const cierre = r.data.cierre;
  assert.strictEqual(cierre.totales.total_ventas, 6, 'las 6 ventas del dia');
  assert.strictEqual(cierre.totales.total_ingresos, 136.5, 'total_ingresos = 136,50');
  assert.strictEqual(cierre.totales.por_metodo_pago.efectivo, 136.5, 'todo en efectivo');

  // Trazabilidad del rescate: se declara de donde salieron.
  assert.strictEqual(cierre.ventas_origen, 'disco-proyecto', 'ventas_origen de disco');
  assert.strictEqual(cierre.ventas_recuperadas, 6, 'ventas_recuperadas = 6');
  assert.strictEqual(cierre.project_id, 'nonina', 'project_id tomado del fichero');
  assert.strictEqual(cierre.project_id_origen, 'nonina', 'y declarado como origen');

  // El cuadre de verdad: fondo 250 + ventas 136,50 = esperado 386,50; contado 260.
  assert.strictEqual(cierre.fondo_inicial, 250);
  assert.strictEqual(cierre.esperado.efectivo, 386.5, 'esperado 386,50');
  assert.strictEqual(cierre.contado.efectivo, 260);
  assert.strictEqual(cierre.diferencia, -126.5, 'faltante de 126,50 (no sobrante de 10)');
  assert.strictEqual(cierre.estado, 'faltante');

  // No es un cierre "sin ventas": no hay aviso.
  assert.ok(!cierre.sin_ventas, 'no declara sin_ventas');
  assert.strictEqual(r.data.abierto.sin_ventas, undefined);

  // El evento caja.cerrada sale con el proyecto recuperado (para el bot correcto).
  const caja = mocks.published.filter(p => p[0] === 'caja.cerrada').map(p => p[1]);
  assert.strictEqual(caja.length, 1);
  assert.strictEqual(caja[0].project_id, 'nonina', 'el evento sale con el proyecto del fichero');
  assert.strictEqual(caja[0].correlation_id, 'cid-RESCATE');
  assert.strictEqual(caja[0].totales.total_ingresos, 136.5);
  assert.strictEqual(caja[0].cierre.ventas_origen, 'disco-proyecto');

  // Queda por escrito: el cierre por proyecto se guarda en su carpeta y en contabilidad.
  const cierreProy = JSON.parse(await fsp.readFile(
    path.join(root, 'projects', 'nonina', 'persistencia', 'ventas', `cierre_${FECHA}.json`), 'utf-8'));
  assert.strictEqual(cierreProy.ventas_origen, 'disco-proyecto');
  assert.strictEqual(cierreProy.ventas_recuperadas, 6);
  assert.strictEqual(cierreProy.project_id, 'nonina');

  const contab = JSON.parse(await fsp.readFile(
    path.join(root, 'projects', 'nonina', 'contabilidad', 'cierres', `cierre_${FECHA}.json`), 'utf-8'));
  assert.strictEqual(contab.ventas.length, 6, 'las ventas rescatadas acompañan al cierre contable');

  // El informe de texto tambien lo dice (no se disimula el reinicio).
  assert.ok(caja[0].informe.includes('Ventas recuperadas del disco (6)'), 'el informe declara el rescate');

  // Se registro el rescate en el log y en metricas.
  assert.ok(mocks.logs.some(l => l[1] === 'persistencia.cierre.ventas_rescatadas'),
    'log del rescate');
  assert.ok(mocks.metricsCalls.some(c => c[1] === 'persistencia.ventas.rescatadas_disco'),
    'metrica del rescate');
  assert.ok(fichero.endsWith(path.join('nonina', 'persistencia', 'current', 'ventas.json')));

  await m.onUnload();
});

// ============================================================
// (2) el archivo del dia tambien sirve de fuente
// ============================================================
test('(2) sin current/ventas.json pero con persistencia/ventas/<fecha>.json → tambien rescata', async () => {
  const mocks = makeMocks();
  const { module: m, root } = await instantiate(mocks);

  m.fechaJornada = FECHA;
  m.ventasCache = [];
  m.fondoInicialJornada = 250;
  await escribirVentasProyecto(root, 'nonina', ventasDelIncidente(), { archivo: 'dia' });

  const r = await m.handleCierreCaja({ arqueo: { efectivo: 260 } });
  assert.strictEqual(r.data.cierre.totales.total_ingresos, 136.5);
  assert.strictEqual(r.data.cierre.ventas_origen, 'disco-proyecto');
  assert.strictEqual(r.data.cierre.diferencia, -126.5);

  await m.onUnload();
});

// ============================================================
// (3) memoria vacia y nada en disco → cierre con aviso, sin romper
// ============================================================
test('(3) sin ventas ni en memoria ni en disco → cierra igual y avisa con sin_ventas', async () => {
  const mocks = makeMocks();
  const { module: m } = await instantiate(mocks);

  m.fechaJornada = FECHA;
  m.ventasCache = [];
  m.fondoInicialJornada = 250;
  mocks.published.length = 0;

  const r = await m.handleCierreCaja({ arqueo: { efectivo: 260 } });

  assert.strictEqual(r.status, 200, 'no bloquea el cierre: la caja tiene que poder cerrarse');
  const cierre = r.data.cierre;
  assert.strictEqual(cierre.totales.total_ventas, 0);
  assert.strictEqual(cierre.totales.total_ingresos, 0);
  assert.strictEqual(cierre.ventas_origen, 'memoria', 'nada que rescatar');
  assert.strictEqual(cierre.ventas_recuperadas, 0);

  // El aviso viaja en el cierre y en `abierto` (lo lee el reporte).
  assert.ok(typeof cierre.sin_ventas === 'string' && cierre.sin_ventas.length > 0);
  assert.ok(/ninguna venta/i.test(cierre.sin_ventas), 'texto claro sobre las ventas ausentes');
  assert.strictEqual(r.data.abierto.sin_ventas, cierre.sin_ventas);

  const caja = mocks.published.filter(p => p[0] === 'caja.cerrada').map(p => p[1]);
  assert.strictEqual(caja.length, 1, 'el evento se publica igual');
  assert.strictEqual(caja[0].abierto.sin_ventas, cierre.sin_ventas, 'el reporte recibe el aviso');
  assert.ok(caja[0].informe.includes('Sin ventas registradas'), 'el informe lo dice');

  await m.onUnload();
});

// ============================================================
// (4) memoria con ventas → no se toca el disco (comportamiento de siempre)
// ============================================================
test('(4) con ventas en memoria → no lee el disco y marca ventas_origen memoria', async () => {
  const mocks = makeMocks();
  const { module: m, root } = await instantiate(mocks);

  m.fechaJornada = FECHA;
  m.ventasCache = [venta(10, { cuenta: 'mesa_mem_1' }), venta(15.5, { cuenta: 'mesa_mem_2' })];
  m.fondoInicialJornada = 250;

  // Senuelo en disco con cifras distintas: si se leyera, el total cambiaria.
  await escribirVentasProyecto(root, 'nonina', ventasDelIncidente());

  const r = await m.handleCierreCaja({ arqueo: { efectivo: 260 }, project_id: 'nonina' });

  const cierre = r.data.cierre;
  assert.strictEqual(cierre.totales.total_ventas, 2, 'las de memoria, no las 6 del disco');
  assert.strictEqual(cierre.totales.total_ingresos, 25.5);
  assert.strictEqual(cierre.ventas_origen, 'memoria');
  assert.strictEqual(cierre.ventas_recuperadas, 0);
  assert.strictEqual(cierre.esperado.efectivo, 275.5, 'fondo 250 + 25,50');
  assert.ok(!cierre.sin_ventas, 'hay ventas: no hay aviso');
  assert.ok(!mocks.logs.some(l => l[1] === 'persistencia.cierre.ventas_rescatadas'), 'no rescata nada');

  await m.onUnload();
});

// ============================================================
// (5) varias carpetas con ventas del dia → la de mas ventas + lista declarada
// ============================================================
test('(5) varios proyectos con ventas del dia → elige la de mas ventas y declara la lista', async () => {
  const mocks = makeMocks();
  const { module: m, root } = await instantiate(mocks);

  m.fechaJornada = FECHA;
  m.ventasCache = [];
  m.fondoInicialJornada = 250;

  await escribirVentasProyecto(root, 'the-pirate', [venta(50, { project_id: 'the-pirate', cuenta: 'mesa_tp_1' })]);
  await escribirVentasProyecto(root, 'nonina', ventasDelIncidente());
  // Un tercer proyecto con ventas de OTRO dia: no debe entrar.
  await escribirVentasProyecto(root, 'otro-negocio', [venta(999, { project_id: 'otro-negocio', cuenta: 'mesa_o_1' })],
    { fecha: '2026-10-31' });

  const r = await m.handleCierreCaja({ arqueo: { efectivo: 260 } });
  const cierre = r.data.cierre;

  assert.strictEqual(cierre.project_id, 'nonina', 'gana la de mas ventas');
  assert.strictEqual(cierre.totales.total_ventas, 6);
  assert.strictEqual(cierre.totales.total_ingresos, 136.5, 'no se suman negocios distintos');
  assert.strictEqual(cierre.diferencia, -126.5);

  const lista = r.data.abierto.origen_ventas;
  assert.ok(Array.isArray(lista), 'declara la lista de candidatos');
  assert.strictEqual(lista.length, 2, 'solo los proyectos con ventas de la jornada');
  assert.deepStrictEqual(lista.map(c => c.project_id).sort(), ['nonina', 'the-pirate']);
  const nonina = lista.find(c => c.project_id === 'nonina');
  assert.strictEqual(nonina.elegido, true);
  assert.strictEqual(nonina.ventas, 6);
  assert.ok(!lista.some(c => c.project_id === 'otro-negocio'), 'el dia ajeno no entra');

  await m.onUnload();
});

// ============================================================
// (7) fichero global: solo vale lo del proyecto que se cierra
// ============================================================
test('(7) rescate desde el fichero global respeta el project_id y no mezcla negocios', async () => {
  const mocks = makeMocks();
  const { module: m, root } = await instantiate(mocks);

  m.fechaJornada = FECHA;
  m.fondoInicialJornada = 250;
  // Fichero global del dia (sin carpeta de proyecto): 2 ventas de nonina.
  await fsp.mkdir(path.join(root, 'data', 'current'), { recursive: true });
  await fsp.writeFile(path.join(root, 'data', 'current', 'ventas.json'), JSON.stringify({
    fecha: FECHA,
    ventas: [venta(10, { cuenta: 'mesa_g1' }), venta(15, { cuenta: 'mesa_g2' })],
    resumen_dia: {}
  }), 'utf-8');

  // Cierre de OTRO negocio: no puede llevarse las ventas de nonina.
  m.ventasCache = [];
  const ajeno = await m.handleCierreCaja({ arqueo: { efectivo: 260 }, project_id: 'the-pirate' });
  assert.strictEqual(ajeno.data.cierre.totales.total_ventas, 0, 'no mezcla las ventas de otro negocio');
  assert.ok(ajeno.data.cierre.sin_ventas, 'y lo declara');

  // Cierre del negocio que SÍ tiene las ventas en el global: se rescatan.
  m.ventasCache = [];
  const propio = await m.handleCierreCaja({ arqueo: { efectivo: 260 }, project_id: 'nonina' });
  assert.strictEqual(propio.data.cierre.totales.total_ventas, 2);
  assert.strictEqual(propio.data.cierre.totales.total_ingresos, 25);
  assert.strictEqual(propio.data.cierre.ventas_origen, 'disco');
  assert.strictEqual(propio.data.cierre.ventas_recuperadas, 2);

  await m.onUnload();
});

// ============================================================
// (6) reporte-cierre: bot por proyecto (slug o UUID) + aviso sin ventas
// ============================================================

function makeBus() {
  const published = [];
  return {
    published,
    subscribe: () => () => {},
    async publish(event, payload) { published.push({ event, payload }); },
    de(tipo) { return published.filter(p => p.event === tipo); }
  };
}

async function cargarReporte(config) {
  const bus = makeBus();
  const logs = [];
  const logger = { debug: () => {}, info: (e, d) => logs.push(['info', e, d]),
    warn: (e, d) => logs.push(['warn', e, d]), error: (e, d) => logs.push(['error', e, d]) };
  const mod = new ReporteCierreModule();
  await mod.onLoad({ logger, metrics: { increment: () => {} }, eventBus: bus, moduleConfig: config || {} });
  // Sin bridge: el vinculo no responde (es el caso real del incidente).
  mod._rpc = async () => null;
  return { mod, bus, logs };
}

function eventoCierre(overrides = {}) {
  const project_id = overrides.project_id || 'nonina';
  const cierre = Object.assign({
    cierre_id: 'cierre_test',
    project_id,
    fecha_jornada: FECHA,
    hora_cierre: `${FECHA}T23:51:00.000Z`,
    arqueo: { efectivo: 260 },
    diferencia: -126.5,
    estado: 'faltante',
    diferencia_esperado: 386.5
  }, overrides.cierre || {});

  return {
    event: 'caja.cerrada',
    metadata: { correlation_id: 'corr-1' },
    data: {
      fecha: FECHA,
      project_id,
      arqueo: cierre.arqueo,
      totales: Object.assign({
        total_ventas: 6,
        total_ingresos: 136.5,
        total_propinas: 0,
        por_metodo_pago: { efectivo: 136.5, tarjeta: 0, bizum: 0 },
        por_tipo_cuenta: { mesa: 136.5 },
        por_camarero: {}
      }, overrides.totales || {}),
      diferencia: cierre.diferencia,
      cierre,
      abierto: overrides.abierto || {}
    }
  };
}

test('(6a) bots_por_proyecto elige el bot por slug y por UUID; sin entrada, el de config', async () => {
  const { mod, bus } = await cargarReporte({
    bot_name: 'Generico_bot',
    chat_id: '-1001234567890',
    telegram_activo: true,
    bots_por_proyecto: { nonina: 'Pro_nonina_bot', 'the-pirate': 'Cierres_thepirate_bot', [UUID_NONINA]: 'Pro_nonina_bot' }
  });

  // Slug: el mapa manda aunque el bridge no conteste.
  await mod.onCajaCerrada(eventoCierre({ project_id: 'nonina' }));
  // Otro negocio, otro bot (la app es una sola).
  await mod.onCajaCerrada(eventoCierre({ project_id: 'the-pirate' }));
  // UUID del MISMO negocio (el bus usa las dos llaves).
  await mod.onCajaCerrada(eventoCierre({ project_id: UUID_NONINA }));
  // UUID que no esta en el mapa, pero con project_id_origen (slug) rescatado del disco.
  await mod.onCajaCerrada(eventoCierre({
    project_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    cierre: { project_id_origen: 'nonina' }
  }));
  // Proyecto sin entrada en el mapa → bot generico (nunca se queda sin reporte).
  await mod.onCajaCerrada(eventoCierre({ project_id: 'proyecto-desconocido' }));

  const bots = bus.de('telegram.send_message.request').map(x => x.payload.botName);
  assert.deepStrictEqual(bots, [
    'Pro_nonina_bot',
    'Cierres_thepirate_bot',
    'Pro_nonina_bot',
    'Pro_nonina_bot',
    'Generico_bot'
  ], 'cada cierre sale por el bot de SU proyecto');

  await mod.onUnload();
});

test('(6b) el mensaje avisa sin ventas y declara las ventas recuperadas del disco', async () => {
  const { mod, bus } = await cargarReporte({
    bot_name: 'Generico_bot',
    chat_id: '-1001234567890',
    bots_por_proyecto: { nonina: 'Pro_nonina_bot' }
  });

  // Cierre tras reinicio: ventas rescatadas del disco.
  await mod.onCajaCerrada(eventoCierre({
    cierre: { ventas_origen: 'disco-proyecto', ventas_recuperadas: 6 }
  }));
  let texto = bus.de('telegram.send_message.request')[0].payload.text;
  assert.ok(texto.includes('Ventas recuperadas del disco (6) — el sistema se había reiniciado'),
    `pie de rescate (fue: ${texto})`);
  assert.ok(!texto.includes('Sin ventas registradas'), 'con ventas no se avisa de lo contrario');

  // Cierre sin ventas: el aviso tiene que verse.
  await mod.onCajaCerrada(eventoCierre({
    project_id: 'the-pirate',
    totales: { total_ventas: 0, total_ingresos: 0, por_metodo_pago: {}, por_tipo_cuenta: {} },
    abierto: { sin_ventas: 'hay arqueo pero ninguna venta del dia: revisar antes de dar el cuadre por bueno' },
    cierre: { sin_ventas: 'hay arqueo pero ninguna venta del dia: revisar antes de dar el cuadre por bueno' }
  }));
  texto = bus.de('telegram.send_message.request')[1].payload.text;
  assert.ok(texto.includes('⚠️ Sin ventas registradas para ese día: el cuadre solo compara caja'),
    `aviso destacado de sin ventas (fue: ${texto})`);

  await mod.onUnload();
});

// ==========================================
// Ejecucion
// ==========================================

(async () => {
  console.log('pizzepos__cierre-recupera-ventas — el cierre rescata las ventas del dia del disco\n');
  let fallos = 0;

  for (const { nombre, fn } of pruebas) {
    try {
      await fn();
      console.log(`✓ ${nombre}`);
    } catch (err) {
      fallos++;
      console.error(`✗ ${nombre}`);
      console.error(`  ${err && err.message ? err.message : err}`);
      if (process.env.STACK && err && err.stack) console.error(err.stack);
    }
  }

  cleanupTmp();
  console.log('');
  if (fallos > 0) {
    console.error(`${fallos} prueba(s) fallida(s)`);
    process.exit(1);
  }
  console.log(`${pruebas.length} pruebas en verde`);
})();

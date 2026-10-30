/**
 * Tests unitarios — pizzepos/persistencia-comandero: FONDO INICIAL del día y
 * ARQUEO POR MÉTODO en el cierre de caja.
 *
 * Escenario de negocio: no hay turnos por camarero, la caja es del negocio.
 * La caja arranca con un fondo (calderilla) que NO es venta; al cerrar hay que
 * restarlo del contado para comparar contra lo esperado. El cierre es ciego
 * para quien lo teclea: el esperado solo aparece en el resultado/evento.
 *
 * Aislamiento: tmpdir + override de directorios via core.config (mismo patrón
 * que pizzepos__persistencia-comandero.test.js).
 *
 * Ejecutar: node tests/unit/pizzepos__cierre-fondo-inicial.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const PersistenciaComanderoModule = require('../../modules/pizzepos/persistencia-comandero/index.js');

// --------------------------------------------------
// Mocks (bus falso que captura lo publicado)
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

  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); }
  };

  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

const tmpDirs = [];
function makeTmpRoot() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'persist-fondo-'));
  tmpDirs.push(d);
  return d;
}
function cleanupTmp() {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

async function instantiate(mocks, opts = {}) {
  const root = opts.root || makeTmpRoot();
  const m    = new PersistenciaComanderoModule();

  // Override projectsBasePath para no contaminar el repo
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

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) {
    console.error(`✗ ${description}`);
    console.error(`  ${error.message}`);
    if (process.env.STACK) console.error(error.stack);
    cleanupTmp();
    process.exit(1);
  }
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

function isCanonicalSuccess(result) {
  return result && typeof result.status === 'number'
    && result.data && typeof result.data === 'object'
    && !('error' in result);
}

/**
 * Carga ventas en la caché del día. `_deduplicarVentas` cuenta por
 * cuenta.cuenta_id, así que cada venta lleva la suya.
 */
function cargarVentas(m, ventas) {
  for (const v of ventas) m.ventasCache.push(v);
}

function venta(id, total, metodo, projectId = 'p1') {
  return {
    venta_id:   `venta-${id}`,
    project_id: projectId,
    resumen:    { total_final: total, propina: 0 },
    cobro:      { metodo_pago: metodo, monto: total },
    cuenta:     { cuenta_id: `cuenta-${id}`, tipo: 'mesa', metadata: {} },
    pedidos:    []
  };
}

function leerJornada(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'data', 'current', 'jornada.json'), 'utf-8'));
}

// ==================================================
//                                                Tests
// ==================================================

(async () => {
  console.log('pizzepos/persistencia-comandero — fondo inicial + arqueo por método\n');

  // ------------------------------------------------------------------
  // (a) iniciar día con fondo 100 → jornada, salida y evento lo llevan
  // ------------------------------------------------------------------
  await testAsync('(a) iniciar día con fondo 100 lo persiste y lo publica en dia.iniciado', async () => {
    const mocks = makeMocks();
    const { module: m, root } = await instantiate(mocks);
    mocks.published.length = 0;

    const r = await m.handleIniciarDia({ fondo_inicial: 100, moneda: 'EUR' });
    assert.ok(isCanonicalSuccess(r), 'respuesta canónica');
    assert.strictEqual(r.data.fondo_inicial, 100);
    assert.strictEqual(r.data.moneda, 'EUR');
    assert.strictEqual(m.fondoInicialJornada, 100);

    await m._writeQueue;
    const jornada = leerJornada(root);
    assert.strictEqual(jornada.fondo_inicial, 100, 'jornada.json guarda fondo_inicial');
    assert.ok(jornada.fecha_jornada, 'jornada.json sigue guardando fecha_jornada');
    assert.ok(jornada.hora_inicio, 'jornada.json sigue guardando hora_inicio');

    const evs = publishedOf(mocks, 'dia.iniciado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].fondo_inicial, 100, 'el evento dia.iniciado lleva el fondo');
    assert.ok(evs[0].fecha && evs[0].hora_inicio);
    await m.onUnload();
  });

  await testAsync('(a-bis) acepta el payload anidado data.data (forma del bus)', async () => {
    const mocks = makeMocks();
    const { module: m, root } = await instantiate(mocks);

    const r = await m.handleIniciarDia({ data: { fondo_inicial: 75.5, moneda: 'EUR' } });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.fondo_inicial, 75.5);
    await m._writeQueue;
    assert.strictEqual(leerJornada(root).fondo_inicial, 75.5);
    await m.onUnload();
  });

  await testAsync('(a-ter) sin fondo declarado arranca a 0; fondo inválido → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    const ok = await m.handleIniciarDia();
    assert.ok(isCanonicalSuccess(ok));
    assert.strictEqual(ok.data.fondo_inicial, 0);

    const bad = await m.handleIniciarDia({ fondo_inicial: -10 });
    assert.strictEqual(bad.status, 400);
    assert.strictEqual(bad.error.code, 'INVALID_INPUT');
    assert.strictEqual(bad.error.details.field, 'fondo_inicial');

    const bad2 = await m.handleIniciarDia({ fondo_inicial: 'calderilla' });
    assert.strictEqual(bad2.status, 400);
    await m.onUnload();
  });

  // ------------------------------------------------------------------
  // (b) fondo 100 + 105 efectivo + 32 tarjeta; arqueo {205, 32} → cuadrado
  // ------------------------------------------------------------------
  await testAsync('(b) cierre con fondo 100: esperado efectivo 205, diferencia 0, cuadrado', async () => {
    const mocks = makeMocks();
    const { module: m, root } = await instantiate(mocks);

    await m.handleIniciarDia({ fondo_inicial: 100, moneda: 'EUR' });
    cargarVentas(m, [venta('v1', 105, 'efectivo'), venta('v2', 32, 'tarjeta')]);
    mocks.published.length = 0;

    const r = await m.handleCierreCaja({
      arqueo: { efectivo: 205, tarjeta: 32 }, project_id: 'p1', correlation_id: 'cid-CIERRE'
    });
    assert.ok(isCanonicalSuccess(r), 'cierre canónico');
    const c = r.data.cierre;

    assert.strictEqual(c.fondo_inicial, 100);
    assert.deepStrictEqual(c.retiradas, []);
    assert.deepStrictEqual(c.esperado, { efectivo: 205, tarjeta: 32, bizum: 0 });
    assert.deepStrictEqual(c.contado,  { efectivo: 205, tarjeta: 32, bizum: null });
    assert.deepStrictEqual(c.diferencias, { efectivo: 0, tarjeta: 0 });
    assert.strictEqual(c.diferencia, 0);
    assert.strictEqual(c.estado, 'cuadrado');

    // Campos previos intactos
    assert.deepStrictEqual(c.arqueo, { efectivo: 205, tarjeta: 32 });
    assert.ok(c.totales && c.totales.por_metodo_pago.efectivo === 105);
    assert.ok(Array.isArray(c.cuentas_cerradas_forzadas));
    assert.ok(c.desglose_productos, 'desglose_productos sigue presente');

    // Cierre persistido (global y de proyecto)
    const global = JSON.parse(fs.readFileSync(path.join(root, 'data', 'ventas', `cierre_${m.fechaJornada}.json`), 'utf-8'));
    assert.strictEqual(global.fondo_inicial, 100);
    assert.deepStrictEqual(global.esperado, { efectivo: 205, tarjeta: 32, bizum: 0 });
    await m.onUnload();
  });

  // ------------------------------------------------------------------
  // (c) mismo día, arqueo corto de 5 € en efectivo → faltante
  // ------------------------------------------------------------------
  await testAsync('(c) arqueo {efectivo:200} con esperado 205 → diferencia -5 y faltante', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.handleIniciarDia({ fondo_inicial: 100 });
    cargarVentas(m, [venta('v1', 105, 'efectivo'), venta('v2', 32, 'tarjeta')]);

    const r = await m.handleCierreCaja({ arqueo: { efectivo: 200 }, project_id: 'p1' });
    assert.ok(isCanonicalSuccess(r));
    const c = r.data.cierre;

    assert.strictEqual(c.esperado.efectivo, 205);
    assert.strictEqual(c.contado.efectivo, 200);
    assert.strictEqual(c.diferencia, -5);
    assert.strictEqual(c.estado, 'faltante');
    assert.strictEqual(c.diferencias.efectivo, -5);
    await m.onUnload();
  });

  // ------------------------------------------------------------------
  // (d) sin fondo (0): la diferencia sigue siendo contado - ventas
  // ------------------------------------------------------------------
  await testAsync('(d) sin fondo inicial la diferencia de efectivo es contado - ventas', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.handleIniciarDia(); // sin fondo → 0
    cargarVentas(m, [venta('v1', 105, 'efectivo'), venta('v2', 32, 'tarjeta')]);

    // Contado justo de las ventas en efectivo → cuadrado, como antes del cambio
    const exacto = await m.handleCierreCaja({ arqueo: { efectivo: 105 }, project_id: 'p1' });
    assert.ok(isCanonicalSuccess(exacto));
    assert.strictEqual(exacto.data.cierre.fondo_inicial, 0);
    assert.strictEqual(exacto.data.cierre.esperado.efectivo, 105);
    assert.strictEqual(exacto.data.cierre.diferencia, 0);
    assert.strictEqual(exacto.data.cierre.estado, 'cuadrado');

    // Y con 10 € de más sigue siendo sobrante por contado - ventas
    const mocks2 = makeMocks();
    const { module: m2 } = await instantiate(mocks2);
    await m2.handleIniciarDia();
    cargarVentas(m2, [venta('v1', 105, 'efectivo'), venta('v2', 32, 'tarjeta')]);
    const sobra = await m2.handleCierreCaja({ arqueo: { efectivo: 115 }, project_id: 'p1' });
    assert.strictEqual(sobra.data.cierre.diferencia, 10);
    assert.strictEqual(sobra.data.cierre.estado, 'sobrante');
    await m2.onUnload();
    await m.onUnload();
  });

  // ------------------------------------------------------------------
  // (e) arqueo sin tarjeta (null) → no se inventa diferencia de tarjeta
  // ------------------------------------------------------------------
  await testAsync('(e) arqueo sin tarjeta: contado.tarjeta null y sin diferencia de tarjeta', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.handleIniciarDia({ fondo_inicial: 100 });
    cargarVentas(m, [venta('v1', 105, 'efectivo'), venta('v2', 32, 'tarjeta')]);

    const r = await m.handleCierreCaja({ arqueo: { efectivo: 205 }, project_id: 'p1' });
    const c = r.data.cierre;

    assert.strictEqual(c.contado.tarjeta, null, 'no se inventa contado de tarjeta');
    assert.strictEqual(c.contado.bizum, null);
    assert.strictEqual('tarjeta' in c.diferencias, false, 'no se inventa diferencia de tarjeta');
    assert.strictEqual('bizum'   in c.diferencias, false);
    assert.strictEqual(c.esperado.tarjeta, 32, 'el esperado de tarjeta sí se calcula');
    assert.strictEqual(c.estado, 'cuadrado');
    await m.onUnload();
  });

  // ------------------------------------------------------------------
  // (f) el evento caja.cerrada lleva el cierre completo
  // ------------------------------------------------------------------
  await testAsync('(f) caja.cerrada publicado lleva esperado/contado/diferencias', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.handleIniciarDia({ fondo_inicial: 100, moneda: 'EUR' });
    cargarVentas(m, [venta('v1', 105, 'efectivo'), venta('v2', 32, 'tarjeta')]);
    mocks.published.length = 0;

    const r = await m.handleCierreCaja({
      arqueo: { efectivo: 205, tarjeta: 32 }, project_id: 'p1', correlation_id: 'cid-CIERRE'
    });
    assert.ok(isCanonicalSuccess(r));

    const evs = publishedOf(mocks, 'caja.cerrada');
    assert.strictEqual(evs.length, 1);
    const ev = evs[0];
    assert.strictEqual(ev.correlation_id, 'cid-CIERRE');
    assert.strictEqual(ev.project_id, 'p1');
    assert.strictEqual(ev.diferencia, 0);
    assert.ok(ev.cierre, 'el evento lleva el objeto cierre');
    assert.strictEqual(ev.cierre.fondo_inicial, 100);
    assert.deepStrictEqual(ev.cierre.esperado,   { efectivo: 205, tarjeta: 32, bizum: 0 });
    assert.deepStrictEqual(ev.cierre.contado,    { efectivo: 205, tarjeta: 32, bizum: null });
    assert.deepStrictEqual(ev.cierre.diferencias, { efectivo: 0, tarjeta: 0 });
    assert.ok(ev.informe.includes('INFORME DE CIERRE DE CAJA'));
    assert.ok(ev.informe.includes('Fondo inicial: 100.00 €'), 'el informe declara el fondo');
    assert.ok(ev.informe.includes('Efectivo esperado: 205.00 €'), 'el informe usa el esperado con fondo');
    await m.onUnload();
  });

  // ------------------------------------------------------------------
  // Retiradas (sangrías): salen del efectivo esperado
  // ------------------------------------------------------------------
  await testAsync('retiradas descuentan del efectivo esperado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.handleIniciarDia({ fondo_inicial: 100 });
    cargarVentas(m, [venta('v1', 105, 'efectivo')]);

    // Caja: 100 de fondo + 105 vendido - 60 retirados = 145 esperados en el cajón
    const r = await m.handleCierreCaja({
      arqueo: { efectivo: 145, retiradas: [{ importe: 60, motivo: 'sangria a caja fuerte' }] },
      project_id: 'p1'
    });
    const c = r.data.cierre;
    assert.strictEqual(c.esperado.efectivo, 145);
    assert.strictEqual(c.diferencia, 0);
    assert.strictEqual(c.estado, 'cuadrado');
    assert.deepStrictEqual(c.retiradas, [{ importe: 60, motivo: 'sangria a caja fuerte' }]);
    await m.onUnload();
  });

  // ------------------------------------------------------------------
  // Sin fondo y compatibilidad con total_contado antiguo
  // ------------------------------------------------------------------
  await testAsync('arqueo antiguo con total_contado sigue funcionando', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    cargarVentas(m, [venta('v1', 105, 'efectivo')]);
    const r = await m.handleCierreCaja({
      arqueo: { efectivo: 0, monedas: 0, total_contado: 105 }, project_id: 'p1'
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.cierre.contado.efectivo, 105);
    assert.strictEqual(r.data.cierre.diferencia, 0);
    await m.onUnload();
  });

  console.log('\nTodos los tests de fondo inicial + arqueo por método en verde.');
  cleanupTmp();
  process.exit(0);
})().catch(err => {
  console.error(err);
  cleanupTmp();
  process.exit(1);
});

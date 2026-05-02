/**
 * Tests unitarios para cocina-poc (parcela 5/6 del POC4).
 *
 * Cubre los 8 contratos via E2E con mocks (bus + fs real con tmpdir).
 * Foco: validar el patron HTTP-server canonico (/modules/cocina/<path>).
 *
 * Ejecutar: node tests/unit/cocina-poc.test.js
 *           npm run test:cocina-poc
 */

'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');

const CocinaModule    = require('../../modules/pizzepos/cocina-poc/index.js');
const moduleConfigBase = require('../../modules/pizzepos/cocina-poc/module.json').config;

// ----------------------------------------------------------------- helpers

function makeMocks() {
  const logs    = [];
  const metrics_calls = [];
  const published = [];

  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };
  const metrics = {
    increment: (n, v, l) => metrics_calls.push(['increment', n, v, l]),
    gauge:     (n, v, l) => metrics_calls.push(['gauge',     n, v, l]),
    timing:    (n, v, l) => metrics_calls.push(['timing',    n, v, l])
  };
  const eventBus = { publish: async (e, p) => { published.push([e, p]); } };

  return { logs, metrics_calls, published, logger, metrics, eventBus };
}

function makeTmpDataPath() {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'cocina-poc-'));
  return { tmpdir, dataPath: path.join(tmpdir, 'snapshot.json') };
}

async function loadModule(mocks, dataPath, overrides = {}) {
  const cfg = JSON.parse(JSON.stringify(moduleConfigBase));
  cfg.persistence.data_path  = dataPath;
  cfg.snapshot_debounce_ms   = overrides.snapshot_debounce_ms || 30;
  cfg.max_historial          = overrides.max_historial         || 50;
  cfg.max_pedidos_activos    = overrides.max_pedidos_activos   || 500;
  const m = new CocinaModule();
  await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig: cfg });
  return m;
}

function findEvent(published, name) {
  return published.find(p => p[0] === name);
}
function countEvents(published, name) {
  return published.filter(p => p[0] === name).length;
}

async function testAsync(description, fn) {
  try {
    await fn();
    console.log(`✓ ${description}`);
  } catch (error) {
    console.error(`✗ ${description}`);
    console.error(`  ${error.message}`);
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  }
}

// ----------------------------------------------------------------- tests

(async () => {
  console.log('cocina-poc — smoke tests\n');

  // ============================================================ Group 1: lifecycle

  await testAsync('onLoad lanza si pattern != json-file', async () => {
    const mocks = makeMocks();
    const { tmpdir, dataPath } = makeTmpDataPath();
    const cfg = JSON.parse(JSON.stringify(moduleConfigBase));
    cfg.persistence.pattern   = 'sqlite';
    cfg.persistence.data_path = dataPath;
    const m = new CocinaModule();
    let threw = false;
    try { await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig: cfg }); }
    catch (e) { threw = true; assert.ok(/json-file/.test(e.message)); }
    assert.ok(threw, 'onLoad debe lanzar con pattern incorrecto');
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  await testAsync('onLoad lanza si falta data_path', async () => {
    const mocks = makeMocks();
    const cfg = JSON.parse(JSON.stringify(moduleConfigBase));
    delete cfg.persistence.data_path;
    const m = new CocinaModule();
    let threw = false;
    try { await m.onLoad({ logger: mocks.logger, eventBus: mocks.eventBus, metrics: mocks.metrics, moduleConfig: cfg }); }
    catch (e) { threw = true; assert.ok(/data_path/.test(e.message)); }
    assert.ok(threw, 'onLoad debe lanzar sin data_path');
  });

  await testAsync('onLoad con ENOENT (primer arranque) sale limpio', async () => {
    const mocks = makeMocks();
    const { tmpdir, dataPath } = makeTmpDataPath();
    const m = await loadModule(mocks, dataPath);
    assert.strictEqual(m.pedidosActivos.size, 0);
    assert.strictEqual(m.historial.length, 0);
    const enoentLog = mocks.logs.find(l => l[1] === 'cocina.snapshot.read.enoent');
    assert.ok(enoentLog, 'debe loggear info ENOENT (no error)');
    await m.onUnload();
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  await testAsync('onUnload flushea snapshot pendiente sincronicamente', async () => {
    const mocks = makeMocks();
    const { tmpdir, dataPath } = makeTmpDataPath();
    const m = await loadModule(mocks, dataPath);
    await m.onPedidoEnviadoCocina({ pedido_id: 'P1', items: [{ id: 'I1', nombre: 'pizza' }] });
    // Cierra el modulo SIN esperar el debounce. El flush debe escribir igualmente.
    await m.onUnload();
    assert.ok(fs.existsSync(dataPath), 'snapshot debe existir tras onUnload (flush)');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    assert.ok(data.pedidos.P1, 'pedido P1 debe estar persistido');
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  // ============================================================ Group 2: persistencia + restart

  await testAsync('Restart-resilient: pedidos sobreviven al unload+load', async () => {
    const { tmpdir, dataPath } = makeTmpDataPath();
    {
      const mocks = makeMocks();
      const m = await loadModule(mocks, dataPath);
      await m.onPedidoEnviadoCocina({ pedido_id: 'P1', items: [{ id: 'I1', nombre: 'pizza' }] });
      await m.onPedidoEnviadoCocina({ pedido_id: 'P2', items: [{ id: 'I2', nombre: 'cola' }] });
      await m.onUnload();
    }
    {
      const mocks = makeMocks();
      const m = await loadModule(mocks, dataPath);
      assert.strictEqual(m.pedidosActivos.size, 2, '2 pedidos sobreviven');
      assert.ok(m.pedidosActivos.has('P1'));
      assert.ok(m.pedidosActivos.has('P2'));
      await m.onUnload();
    }
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  await testAsync('Snapshot corrupto graceful: arranca limpio sin crashear', async () => {
    const { tmpdir, dataPath } = makeTmpDataPath();
    fs.mkdirSync(path.dirname(dataPath), { recursive: true });
    fs.writeFileSync(dataPath, '<<<not_json>>>');
    const mocks = makeMocks();
    const m = await loadModule(mocks, dataPath);
    assert.strictEqual(m.pedidosActivos.size, 0, 'arranca limpio');
    const corruptLog = mocks.logs.find(l => l[1] === 'cocina.snapshot.read.error');
    assert.ok(corruptLog, 'debe loggear warn de error de parse');
    await m.onUnload();
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  // ============================================================ Group 3: subscribes (agregador de eventos)

  await testAsync('onPedidoEnviadoCocina añade pedido + emite metric', async () => {
    const mocks = makeMocks();
    const { tmpdir, dataPath } = makeTmpDataPath();
    const m = await loadModule(mocks, dataPath);
    await m.onPedidoEnviadoCocina({ pedido_id: 'P1', cuenta_id: 'C1', canal: 'mesa', items: [{ id: 'I1', nombre: 'pizza' }] });
    assert.strictEqual(m.pedidosActivos.size, 1);
    const p = m.pedidosActivos.get('P1');
    assert.strictEqual(p.canal, 'mesa');
    assert.strictEqual(p.items.length, 1);
    assert.strictEqual(p.items[0].estado, 'pendiente');
    const counter = mocks.metrics_calls.find(c => c[1] === 'cocina.pedido_recibido.total');
    assert.ok(counter, 'debe emitir cocina.pedido_recibido.total');
    await m.onUnload();
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  await testAsync('onPedidoCancelado elimina sin archivar', async () => {
    const mocks = makeMocks();
    const { tmpdir, dataPath } = makeTmpDataPath();
    const m = await loadModule(mocks, dataPath);
    await m.onPedidoEnviadoCocina({ pedido_id: 'P1', items: [{ id: 'I1', nombre: 'x' }] });
    await m.onPedidoCancelado({ pedido_id: 'P1' });
    assert.strictEqual(m.pedidosActivos.size, 0);
    assert.strictEqual(m.historial.length, 0, 'cancelado NO va al historial');
    await m.onUnload();
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  await testAsync('onCajaCerrada archiva activos + clear', async () => {
    const mocks = makeMocks();
    const { tmpdir, dataPath } = makeTmpDataPath();
    const m = await loadModule(mocks, dataPath);
    await m.onPedidoEnviadoCocina({ pedido_id: 'P1', items: [{ id: 'I1', nombre: 'x' }] });
    await m.onPedidoEnviadoCocina({ pedido_id: 'P2', items: [{ id: 'I2', nombre: 'y' }] });
    await m.onCajaCerrada({});
    assert.strictEqual(m.pedidosActivos.size, 0);
    assert.strictEqual(m.historial.length, 2);
    assert.strictEqual(m.historial[0].motivo_cierre, 'caja.cerrada');
    await m.onUnload();
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  await testAsync('onDiaIniciado idempotente: doble llamada no rompe', async () => {
    const mocks = makeMocks();
    const { tmpdir, dataPath } = makeTmpDataPath();
    const m = await loadModule(mocks, dataPath);
    await m.onDiaIniciado({});
    await m.onDiaIniciado({});
    assert.strictEqual(m.pedidosActivos.size, 0);
    await m.onUnload();
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  await testAsync('Capacity limit: rechaza pedido si max_pedidos_activos alcanzado', async () => {
    const mocks = makeMocks();
    const { tmpdir, dataPath } = makeTmpDataPath();
    const m = await loadModule(mocks, dataPath, { max_pedidos_activos: 2 });
    await m.onPedidoEnviadoCocina({ pedido_id: 'P1', items: [{ id: 'I1', nombre: 'a' }] });
    await m.onPedidoEnviadoCocina({ pedido_id: 'P2', items: [{ id: 'I2', nombre: 'b' }] });
    await m.onPedidoEnviadoCocina({ pedido_id: 'P3', items: [{ id: 'I3', nombre: 'c' }] });
    assert.strictEqual(m.pedidosActivos.size, 2, 'tercero rechazado por capacity');
    const rejectMetric = mocks.metrics_calls.find(c => c[1] === 'cocina.pedido.rejected');
    assert.ok(rejectMetric, 'debe emitir metric pedido.rejected');
    await m.onUnload();
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  // ============================================================ Group 4: HTTP handlers — shape canonico

  await testAsync('GET activos: shape canonico { status, data } sin error', async () => {
    const mocks = makeMocks();
    const { tmpdir, dataPath } = makeTmpDataPath();
    const m = await loadModule(mocks, dataPath);
    await m.onPedidoEnviadoCocina({ pedido_id: 'P1', items: [{ id: 'I1', nombre: 'x' }] });
    const r = await m.handleGetActivos({});
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.error, undefined);
    assert.strictEqual(r.data.total, 1);
    assert.strictEqual(r.data.pedidos[0].pedido_id, 'P1');
    await m.onUnload();
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  await testAsync('GET pedido inexistente: 404 RESOURCE_NOT_FOUND con entity_type/entity_id', async () => {
    const mocks = makeMocks();
    const { tmpdir, dataPath } = makeTmpDataPath();
    const m = await loadModule(mocks, dataPath);
    const r = await m.handleGetPedido({ params: { pedido_id: 'no_existe' } });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(r.error.details.entity_type, 'pedido');
    assert.strictEqual(r.error.details.entity_id, 'no_existe');
    assert.strictEqual(r.data, undefined, 'mutex con error');
    await m.onUnload();
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  await testAsync('GET pedido sin pedido_id: 400 VALIDATION_FAILED', async () => {
    const mocks = makeMocks();
    const { tmpdir, dataPath } = makeTmpDataPath();
    const m = await loadModule(mocks, dataPath);
    const r = await m.handleGetPedido({ params: {} });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'VALIDATION_FAILED');
    await m.onUnload();
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  await testAsync('GET historial devuelve array + max', async () => {
    const mocks = makeMocks();
    const { tmpdir, dataPath } = makeTmpDataPath();
    const m = await loadModule(mocks, dataPath);
    const r = await m.handleGetHistorial({});
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.data.historial));
    assert.strictEqual(r.data.max, 50);
    await m.onUnload();
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  // ============================================================ Group 5: preparar item — flujo de eventos

  await testAsync('Preparar item: emite item_preparando + item_preparado', async () => {
    const mocks = makeMocks();
    const { tmpdir, dataPath } = makeTmpDataPath();
    const m = await loadModule(mocks, dataPath);
    await m.onPedidoEnviadoCocina({ pedido_id: 'P1', items: [{ id: 'I1', nombre: 'pizza' }, { id: 'I2', nombre: 'cola' }] });

    mocks.published.length = 0;
    const r = await m.handlePrepararItem({ params: { item_id: 'I1' }, body: { pedido_id: 'P1' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.pedido_listo, false);
    assert.strictEqual(countEvents(mocks.published, 'cocina.item_preparando'), 1);
    assert.strictEqual(countEvents(mocks.published, 'cocina.item_preparado'), 1);
    assert.strictEqual(countEvents(mocks.published, 'cocina.pedido_listo'), 0);
    await m.onUnload();
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  await testAsync('Preparar ULTIMO item: emite pedido_listo + archiva en historial', async () => {
    const mocks = makeMocks();
    const { tmpdir, dataPath } = makeTmpDataPath();
    const m = await loadModule(mocks, dataPath);
    await m.onPedidoEnviadoCocina({ pedido_id: 'P1', items: [{ id: 'I1', nombre: 'pizza' }] });

    mocks.published.length = 0;
    const r = await m.handlePrepararItem({ params: { item_id: 'I1' }, body: { pedido_id: 'P1' } });
    assert.strictEqual(r.data.pedido_listo, true);
    assert.strictEqual(m.pedidosActivos.size, 0, 'pedido sale de activos');
    assert.strictEqual(m.historial.length, 1, 'pedido va al historial');
    assert.strictEqual(countEvents(mocks.published, 'cocina.pedido_listo'), 1);
    await m.onUnload();
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  await testAsync('Preparar item ya preparado: 409 CONFLICT', async () => {
    const mocks = makeMocks();
    const { tmpdir, dataPath } = makeTmpDataPath();
    const m = await loadModule(mocks, dataPath);
    await m.onPedidoEnviadoCocina({ pedido_id: 'P1', items: [{ id: 'I1', nombre: 'x' }, { id: 'I2', nombre: 'y' }] });
    await m.handlePrepararItem({ params: { item_id: 'I1' }, body: { pedido_id: 'P1' } });
    const r = await m.handlePrepararItem({ params: { item_id: 'I1' }, body: { pedido_id: 'P1' } });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'CONFLICT');
    await m.onUnload();
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  await testAsync('Preparar item de pedido inexistente: 404', async () => {
    const mocks = makeMocks();
    const { tmpdir, dataPath } = makeTmpDataPath();
    const m = await loadModule(mocks, dataPath);
    const r = await m.handlePrepararItem({ params: { item_id: 'I1' }, body: { pedido_id: 'no_existe' } });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(r.error.details.entity_type, 'pedido');
    await m.onUnload();
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  await testAsync('Preparar sin pedido_id en body: 400 VALIDATION_FAILED', async () => {
    const mocks = makeMocks();
    const { tmpdir, dataPath } = makeTmpDataPath();
    const m = await loadModule(mocks, dataPath);
    const r = await m.handlePrepararItem({ params: { item_id: 'I1' }, body: {} });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'VALIDATION_FAILED');
    await m.onUnload();
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  // ============================================================ Group 6: marcar pedido listo manual

  await testAsync('Marcar pedido listo manual: archiva incluso con items pendientes', async () => {
    const mocks = makeMocks();
    const { tmpdir, dataPath } = makeTmpDataPath();
    const m = await loadModule(mocks, dataPath);
    await m.onPedidoEnviadoCocina({ pedido_id: 'P1', items: [{ id: 'I1', nombre: 'a' }, { id: 'I2', nombre: 'b' }] });

    mocks.published.length = 0;
    const r = await m.handleMarcarListo({ params: { pedido_id: 'P1' }, body: {} });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(m.pedidosActivos.size, 0);
    assert.strictEqual(m.historial.length, 1);
    const ev = findEvent(mocks.published, 'cocina.pedido_listo');
    assert.ok(ev);
    assert.strictEqual(ev[1].via, 'manual');
    await m.onUnload();
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  // ============================================================ Group 7: correlation_id

  await testAsync('correlation_id se propaga del body al publish', async () => {
    const mocks = makeMocks();
    const { tmpdir, dataPath } = makeTmpDataPath();
    const m = await loadModule(mocks, dataPath);
    await m.onPedidoEnviadoCocina({ pedido_id: 'P1', items: [{ id: 'I1', nombre: 'x' }] });

    mocks.published.length = 0;
    await m.handlePrepararItem({ params: { item_id: 'I1' }, body: { pedido_id: 'P1', correlation_id: 'corr-xyz' } });
    const ev = findEvent(mocks.published, 'cocina.pedido_listo');
    assert.strictEqual(ev[1].correlation_id, 'corr-xyz', 'correlation_id propagado');
    await m.onUnload();
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  // ============================================================ Group 8: historial cap

  await testAsync('Historial respeta max_historial (FIFO)', async () => {
    const mocks = makeMocks();
    const { tmpdir, dataPath } = makeTmpDataPath();
    const m = await loadModule(mocks, dataPath, { max_historial: 3 });
    for (let i = 1; i <= 5; i++) {
      await m.onPedidoEnviadoCocina({ pedido_id: `P${i}`, items: [{ id: `I${i}`, nombre: 'x' }] });
      await m.handlePrepararItem({ params: { item_id: `I${i}` }, body: { pedido_id: `P${i}` } });
    }
    assert.strictEqual(m.historial.length, 3, 'cap respetado');
    // FIFO: los ultimos 3 (P3, P4, P5)
    assert.strictEqual(m.historial[0].pedido_id, 'P3');
    assert.strictEqual(m.historial[2].pedido_id, 'P5');
    await m.onUnload();
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  console.log('\ncocina-poc: todos los tests pasaron ✓');
})().catch(err => { console.error(err); process.exit(1); });

/**
 * Tests unitarios — pizzepos__cocina (POC2 reescritura).
 *
 * Ejecutar: node tests/unit/pizzepos__cocina.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');

// --------------------------------------------------
// Mock infra
// --------------------------------------------------

function makeMocks() {
  const logs = [];
  const published = [];
  const metricsCalls = [];
  const uiRegistered = [];

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
    publish: async (event, payload) => { published.push([event, payload]); },
    request: async () => ({ data: { dispositivos: [{ nombre: 'd1' }] } })
  };

  const uiHandler = {
    register: (domain, action, fn) => { uiRegistered.push([domain, action]); },
    unregister: () => {}
  };

  return { logs, published, metricsCalls, uiRegistered, logger, metrics, eventBus, uiHandler };
}

let TMP_ROOT;
let ORIG_CWD;

function setupTmpCwd() {
  ORIG_CWD = process.cwd();
  TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'cocina-test-'));
  process.chdir(TMP_ROOT);
  fs.mkdirSync(path.join(TMP_ROOT, 'data', 'current'), { recursive: true });
}

function teardownTmpCwd() {
  if (ORIG_CWD) process.chdir(ORIG_CWD);
  if (TMP_ROOT) {
    try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }
}

const CocinaModule = require('../../modules/pizzepos/cocina/index.js');

async function instantiate(mocks, opts = {}) {
  const m = new CocinaModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    uiHandler: mocks.uiHandler,
    config: opts.config || null
  });
  return { module: m };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

function isCanonicalError(result) {
  return result && typeof result.status === 'number'
    && result.error && typeof result.error === 'object'
    && typeof result.error.code === 'string'
    && typeof result.error.message === 'string'
    && !('data' in result);
}

function isCanonicalSuccess(result) {
  return result && typeof result.status === 'number'
    && result.data && typeof result.data === 'object'
    && !('error' in result);
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

function flushSnapshotTimer(m) {
  if (m._snapshotSaveTimer) {
    clearTimeout(m._snapshotSaveTimer);
    m._snapshotSaveTimer = null;
  }
}

function makePedidoEvent(overrides = {}) {
  return {
    metadata: { correlationId: 'cid-001' },
    data: {
      pedido_id: overrides.pedido_id || 'p-001',
      cuenta_id: overrides.cuenta_id || 'mesa_1',
      canal: overrides.canal || 'mesa',
      ref_display: overrides.ref_display || 'Mesa 1',
      project_id: overrides.project_id || 'proj-x',
      items: overrides.items || [
        { item_id: 'it-1', producto_id: 'pizza', nombre: 'Margarita', cantidad: 1, categoria: 'pizzas' }
      ],
      ...overrides
    }
  };
}

// ==================================================
//                                                Tests
// ==================================================

(async () => {
  setupTmpCwd();
  console.log('pizzepos__cocina — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa estado limpio + registra ui_handlers', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'cocina');
    assert.strictEqual(m.version, '3.2.0');
    assert.strictEqual(m.pedidosActivos.size, 0);
    assert.strictEqual(m.devices.size, 0);
    assert.strictEqual(m.historial.length, 0);
    assert.strictEqual(m.tiemposPreparacion.length, 0);
    assert.ok(mocks.uiRegistered.length === 12, `expected 12 ui_handlers, got ${mocks.uiRegistered.length}`);
    await m.onUnload();
  });

  await testAsync('onUnload limpia maps + cancela timer pendiente', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.pedidosActivos.set('p-1', { pedido_id: 'p-1', items: [], cuenta_id: 'c1' });
    m.devices.set('d-1', { device_id: 'd-1', color: '#fff' });
    m.cuentaNombres.set('c-1', 'X');
    m._saveSnapshotDebounced();
    assert.ok(m._snapshotSaveTimer, 'timer creado');
    await m.onUnload();
    assert.strictEqual(m.pedidosActivos.size, 0);
    assert.strictEqual(m.devices.size, 0);
    assert.strictEqual(m.cuentaNombres.size, 0);
    assert.strictEqual(m._snapshotSaveTimer, null);
  });

  await testAsync('onLoad restaura snapshot existente', async () => {
    const mocks = makeMocks();
    const snapshotPath = path.join(TMP_ROOT, 'data', 'current', 'cocina_snapshot.json');
    fs.writeFileSync(snapshotPath, JSON.stringify({
      _saved_at: new Date().toISOString(),
      pedidos: { 'p-restored': { pedido_id: 'p-restored', items: [], cuenta_id: 'c1' } }
    }));
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.pedidosActivos.size, 1);
    assert.ok(m.pedidosActivos.has('p-restored'));
    fs.unlinkSync(snapshotPath);
    await m.onUnload();
  });

  // ==========================================
  // Group 2: Validacion canonica
  // ==========================================

  await testAsync('handleGetPedido sin pedido devuelve 404 RESOURCE_NOT_FOUND canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetPedido({ pedido_id: 'no-existe' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(r.error.details.pedido_id, 'no-existe');
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'cocina.errors');
    assert.ok(errMetric, 'metric cocina.errors emitida');
    await m.onUnload();
  });

  await testAsync('handlePrepararItem sin item devuelve 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handlePrepararItem({ item_id: 'no-existe' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleMarcarListo sin pedido devuelve 404 canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleMarcarListo({ pedido_id: 'no-existe' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleUnregisterDevice sin device_id devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleUnregisterDevice({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleRegisterDevice con tipo_estacion invalido devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleRegisterDevice({ device_id: 'd1', tipo_estacion: 'bogus' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.deepStrictEqual(r.error.details.valid_types, ['general', 'horno']);
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Sistema de pases (general -> horno -> listo)
  // ==========================================

  await testAsync('flujo completo pase 0 (general) -> pase 1 (horno) -> listo + ticket + pedido_listo', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.onPedidoEnviadoCocina(makePedidoEvent({
      pedido_id: 'p-flow',
      items: [{ item_id: 'i-1', producto_id: 'pizza', nombre: 'Pepperoni', cantidad: 1, categoria: 'pizzas' }]
    }));
    flushSnapshotTimer(m);

    await m.handleRegisterDevice({ device_id: 'd-gen', nombre: 'Pase', tipo_estacion: 'general' });
    await m.handleRegisterDevice({ device_id: 'd-hor', nombre: 'Horno', tipo_estacion: 'horno', impresora: 'imp1' });

    // Tap 1 (general): pendiente -> preparando
    let r = await m.handlePrepararItem({ item_id: 'i-1', device_id: 'd-gen' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.item.estado, 'preparando');
    assert.strictEqual(r.data.item.pase, 0);
    assert.ok(publishedOf(mocks, 'cocina.item_preparando').length === 1);

    // Tap 2 (general): preparando -> avanzar a horno (auto_preparar)
    r = await m.handlePrepararItem({ item_id: 'i-1', device_id: 'd-gen' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.item.pase, 1);
    assert.strictEqual(r.data.item.estado, 'preparando'); // auto_preparar horno
    assert.strictEqual(r.data.avanzado, true);
    assert.ok(publishedOf(mocks, 'cocina.item_avanzado').length === 1);

    // Tap 3 (horno): pase 1 -> 2 -> ticket + listo + pedido_listo
    r = await m.handlePrepararItem({ item_id: 'i-1', device_id: 'd-hor' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.item.estado, 'listo');
    assert.strictEqual(r.data.pedido_completo, true);
    assert.ok(publishedOf(mocks, 'cocina.item_ticket').length === 1, 'ticket emitido por horno (imprime_al_completar)');
    assert.ok(publishedOf(mocks, 'cocina.item_preparado').length === 1);
    assert.ok(publishedOf(mocks, 'cocina.pedido_listo').length === 1);
    assert.strictEqual(m.pedidosActivos.size, 0);
    assert.strictEqual(m.historial.length, 1);

    flushSnapshotTimer(m);
    await m.onUnload();
  });

  await testAsync('item ya listo devuelve 409 CONFLICT_STATE', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.pedidosActivos.set('p-x', {
      pedido_id: 'p-x',
      cuenta_id: 'c-x',
      items: [{ item_id: 'i-x', estado: 'listo', pase: 2, nombre: 'X', cantidad: 1 }]
    });
    const r = await m.handlePrepararItem({ item_id: 'i-x' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'CONFLICT_STATE');
    flushSnapshotTimer(m);
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Devices
  // ==========================================

  await testAsync('register-device asigna color round-robin de la paleta', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = await m.handleRegisterDevice({ device_id: 'd1' });
    const r2 = await m.handleRegisterDevice({ device_id: 'd2' });
    assert.strictEqual(r1.status, 201);
    assert.strictEqual(r2.status, 201);
    assert.notStrictEqual(r1.data.color, r2.data.color);
    assert.ok(/^#[0-9a-f]{6}$/.test(r1.data.color));
    assert.ok(publishedOf(mocks, 'cocina.device_registered').length === 2);
    await m.onUnload();
  });

  await testAsync('re-register de device existente preserva color y emite cocina.device_updated', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = await m.handleRegisterDevice({ device_id: 'd1', nombre: 'Original' });
    const colorOriginal = r1.data.color;
    const r2 = await m.handleRegisterDevice({ device_id: 'd1', nombre: 'Updated', impresora: 'imp1' });
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r2.data.color, colorOriginal);
    assert.strictEqual(r2.data.nombre, 'Updated');
    assert.ok(publishedOf(mocks, 'cocina.device_updated').length === 1);
    await m.onUnload();
  });

  await testAsync('unregister-device emite cocina.device_unregistered con project_id top-level', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleRegisterDevice({ device_id: 'd1' });
    const r = await m.handleUnregisterDevice({ device_id: 'd1', project_id: 'proj-1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.removed, true);
    const evs = publishedOf(mocks, 'cocina.device_unregistered');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].project_id, 'proj-1');
    assert.ok(evs[0].timestamp);
    await m.onUnload();
  });

  await testAsync('list-station-types devuelve general + horno con comportamientos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleListTiposEstacion();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.tipos.length, 2);
    const horno = r.data.tipos.find(t => t.id === 'horno');
    assert.strictEqual(horno.comportamientos.imprime_al_completar, true);
    assert.strictEqual(horno.comportamientos.auto_preparar, true);
    await m.onUnload();
  });

  // ==========================================
  // Group 5: Pedidos lifecycle
  // ==========================================

  await testAsync('onPedidoEnviadoCocina almacena + emite periferico.display nuevo_pedido', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onPedidoEnviadoCocina(makePedidoEvent());
    flushSnapshotTimer(m);
    assert.strictEqual(m.pedidosActivos.size, 1);
    const dispEvs = publishedOf(mocks, 'periferico.display');
    assert.strictEqual(dispEvs.length, 1);
    assert.strictEqual(dispEvs[0].data.accion, 'nuevo_pedido');
    assert.strictEqual(dispEvs[0].project_id, 'proj-x');
    await m.onUnload();
  });

  await testAsync('onPedidoCancelado remueve pedido y emite metric', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onPedidoEnviadoCocina(makePedidoEvent({ pedido_id: 'p-cancel' }));
    flushSnapshotTimer(m);
    await m.onPedidoCancelado({ data: { pedido_id: 'p-cancel' } });
    flushSnapshotTimer(m);
    assert.strictEqual(m.pedidosActivos.size, 0);
    const cancelMetric = mocks.metricsCalls.find(c => c[1] === 'cocina.pedido_cancelado.total');
    assert.ok(cancelMetric);
    await m.onUnload();
  });

  await testAsync('handleMarcarListo marca todos los items y mueve a historial', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onPedidoEnviadoCocina(makePedidoEvent({
      pedido_id: 'p-bulk',
      items: [
        { item_id: 'i-1', nombre: 'A', cantidad: 1 },
        { item_id: 'i-2', nombre: 'B', cantidad: 1 }
      ]
    }));
    flushSnapshotTimer(m);
    const r = await m.handleMarcarListo({ pedido_id: 'p-bulk' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.estado, 'listo');
    assert.ok(r.data.items.every(i => i.estado === 'listo'));
    assert.strictEqual(m.pedidosActivos.size, 0);
    assert.strictEqual(m.historial.length, 1);
    flushSnapshotTimer(m);
    await m.onUnload();
  });

  // ==========================================
  // Group 6: Reset events + cuenta lifecycle
  // ==========================================

  await testAsync('onCajaCerrada limpia pedidosActivos + cuentaNombres + historial', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onPedidoEnviadoCocina(makePedidoEvent());
    flushSnapshotTimer(m);
    m.cuentaNombres.set('c-x', 'X');
    m.historial.push({ pedido_id: 'old' });
    await m.onCajaCerrada({ metadata: { correlationId: 'cid' } });
    flushSnapshotTimer(m);
    assert.strictEqual(m.pedidosActivos.size, 0);
    assert.strictEqual(m.cuentaNombres.size, 0);
    assert.strictEqual(m.historial.length, 0);
    await m.onUnload();
  });

  await testAsync('onCuentaActualizada propaga ref_display a pedidos activos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onPedidoEnviadoCocina(makePedidoEvent({ cuenta_id: 'c-1', ref_display: 'Mesa 1' }));
    flushSnapshotTimer(m);
    await m.onCuentaActualizada({ data: { cuenta_id: 'c-1', cambios: { ref_display: 'Mesa 1 (Juan)' } } });
    const pedido = Array.from(m.pedidosActivos.values())[0];
    assert.strictEqual(pedido.ref_display, 'Mesa 1 (Juan)');
    assert.strictEqual(m.cuentaNombres.get('c-1'), 'Mesa 1 (Juan)');
    await m.onUnload();
  });

  await testAsync('onCuentaEliminada limpia pedidos huerfanos de la cuenta', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onPedidoEnviadoCocina(makePedidoEvent({ pedido_id: 'p-1', cuenta_id: 'c-out' }));
    await m.onPedidoEnviadoCocina(makePedidoEvent({ pedido_id: 'p-2', cuenta_id: 'c-keep' }));
    flushSnapshotTimer(m);
    await m.onCuentaEliminada({ data: { cuenta_id: 'c-out' } });
    flushSnapshotTimer(m);
    assert.strictEqual(m.pedidosActivos.size, 1);
    assert.ok(m.pedidosActivos.has('p-2'));
    await m.onUnload();
  });

  await testAsync('handleHealthCheck devuelve estado canonico con counts', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealthCheck();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.status, 'healthy');
    assert.strictEqual(r.data.module, 'cocina');
    assert.strictEqual(r.data.version, '3.2.0');
    await m.onUnload();
  });

  // ==========================================
  // Group 7: Helpers POC2 + auxiliares + internos
  // ==========================================

  await testAsync('_errorResponse construye shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = m._errorResponse(400, 'INVALID_INPUT', 'msg', { field: 'x' });
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { field: 'x' } } });
    const r2 = m._errorResponse(500, 'UNKNOWN_ERROR', 'oops');
    assert.deepStrictEqual(r2, { status: 500, error: { code: 'UNKNOWN_ERROR', message: 'oops' } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea ENOENT/required/not found a codes canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const enoent = Object.assign(new Error('no file'), { code: 'ENOENT' });
    assert.deepStrictEqual(m._classifyHandlerError(enoent), { status: 404, code: 'RESOURCE_NOT_FOUND' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('field is required')), { status: 400, code: 'INVALID_INPUT' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('not found')), { status: 404, code: 'RESOURCE_NOT_FOUND' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('conflict estado')), { status: 409, code: 'CONFLICT_STATE' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('boom')), { status: 500, code: 'UNKNOWN_ERROR' });
    await m.onUnload();
  });

  await testAsync('_publicarEvento añade correlation_id, project_id top-level y timestamp', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    const enriched = await m._publicarEvento(
      'test.event',
      { foo: 1 },
      { correlation_id: 'cid-z', project_id: 'proj-z' }
    );
    assert.strictEqual(enriched.correlation_id, 'cid-z');
    assert.strictEqual(enriched.project_id, 'proj-z');
    assert.ok(enriched.timestamp);
    const evs = publishedOf(mocks, 'test.event');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].project_id, 'proj-z');
    await m.onUnload();
  });

  await testAsync('_handleHandlerError mapea status segun error y registra metric cocina.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const err = new Error('not found');
    const r = m._handleHandlerError('test.failed', err, 'op');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    const errMetric = mocks.metricsCalls.find(c => c[0] === 'increment' && c[1] === 'cocina.errors');
    assert.ok(errMetric, 'metric cocina.errors emitida');
    await m.onUnload();
  });

  await testAsync('_atomicWriteFile escribe via tmp + rename y limpia tmp en fallo', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const target = path.join(TMP_ROOT, 'data', 'current', 'atomic-test.json');
    await m._atomicWriteFile(target, JSON.stringify({ ok: true }));
    const data = JSON.parse(await fsp.readFile(target, 'utf8'));
    assert.strictEqual(data.ok, true);
    assert.ok(!fs.existsSync(`${target}.tmp`), 'tmp file removido');
    await m.onUnload();
  });

  await testAsync('_readJsonSafe devuelve null y log warn en parse error', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const broken = path.join(TMP_ROOT, 'data', 'current', 'broken.json');
    fs.writeFileSync(broken, 'not-json');
    const r = await m._readJsonSafe(broken);
    assert.strictEqual(r, null);
    const warn = mocks.logs.find(l => l[0] === 'warn' && l[1] === 'cocina.read_json.error');
    assert.ok(warn, 'log warn emitido');
    fs.unlinkSync(broken);
    await m.onUnload();
  });

  await testAsync('_detectCanalFromCuentaId reconoce prefijos largos y cortos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._detectCanalFromCuentaId('mesa_1'), 'mesa');
    assert.strictEqual(m._detectCanalFromCuentaId('M_42'), 'mesa');
    assert.strictEqual(m._detectCanalFromCuentaId('whatsapp_X'), 'whatsapp');
    assert.strictEqual(m._detectCanalFromCuentaId('W_9'), 'whatsapp');
    assert.strictEqual(m._detectCanalFromCuentaId('algo-raro'), null);
    assert.strictEqual(m._detectCanalFromCuentaId(null), null);
    await m.onUnload();
  });

  teardownTmpCwd();
  console.log('\nTodos los tests pasaron.');
})().catch(e => {
  teardownTmpCwd();
  console.error(e);
  process.exit(1);
});

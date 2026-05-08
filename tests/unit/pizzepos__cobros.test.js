/**
 * Tests unitarios — pizzepos__cobros (POC2).
 *
 * Ejecutar: node tests/unit/pizzepos__cobros.test.js
 */

'use strict';

const assert = require('assert');
const CobrosModule = require('../../modules/pizzepos/cobros/index.js');

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
    publish: async (e, p) => { published.push([e, p]); },
    request: async () => ({ data: { dispositivos: [{ nombre: 'caja-1' }] } })
  };
  const uiHandler = {
    register: (d, a, fn) => uiRegistered.push([d, a]),
    unregister: () => {}
  };
  return { logs, published, metricsCalls, uiRegistered, logger, metrics, eventBus, uiHandler };
}

async function instantiate(mocks) {
  const m = new CobrosModule();
  await m.onLoad({
    logger: mocks.logger, metrics: mocks.metrics,
    eventBus: mocks.eventBus, uiHandler: mocks.uiHandler,
    config: {}
  });
  return { module: m };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

function isCanonicalError(r) {
  return r && typeof r.status === 'number' && r.error
    && typeof r.error.code === 'string'
    && typeof r.error.message === 'string'
    && !('data' in r);
}

function isCanonicalSuccess(r) {
  return r && typeof r.status === 'number' && r.data && !('error' in r);
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

(async () => {
  console.log('pizzepos__cobros — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad inicializa estado limpio + registra ui_handlers', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'cobros');
    assert.strictEqual(m.version, '3.0.0');
    assert.strictEqual(m.cobros.size, 0);
    assert.ok(mocks.uiRegistered.length >= 8);
    await m.onUnload();
  });

  await testAsync('onUnload limpia maps', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.cobros.set('c1', { id: 'c1' });
    await m.onUnload();
    assert.strictEqual(m.cobros.size, 0);
  });

  // Group 2: Validacion canonica
  await testAsync('handleCreateCobro sin cuenta_id devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreateCobro({ monto: 10, metodo_pago: 'efectivo' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleCreateCobro con cuenta llevadoo_ devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreateCobro({ cuenta_id: 'llevadoo_x', monto: 10, metodo_pago: 'efectivo' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleCreateCobro con monto <= 0 devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreateCobro({ cuenta_id: 'mesa_1', monto: 0, metodo_pago: 'efectivo' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleCreateCobro con metodo_pago invalido devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreateCobro({ cuenta_id: 'mesa_1', monto: 10, metodo_pago: 'bitcoin' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleCreateCobro duplicado devuelve 409 ALREADY_EXISTS', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleCreateCobro({ cuenta_id: 'mesa_1', monto: 10, metodo_pago: 'efectivo' });
    const r = await m.handleCreateCobro({ cuenta_id: 'mesa_1', monto: 10, metodo_pago: 'efectivo' });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'ALREADY_EXISTS');
    await m.onUnload();
  });

  // Group 3: Crear cobro success por metodo
  await testAsync('handleCreateCobro efectivo con cambio insuficiente devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreateCobro({
      cuenta_id: 'mesa_1', monto: 20, metodo_pago: 'efectivo', monto_recibido: 10
    });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleCreateCobro efectivo calcula cambio correctamente', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreateCobro({
      cuenta_id: 'mesa_2', monto: 10, propina: 2, metodo_pago: 'efectivo', monto_recibido: 20
    });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.cambio, 8);
    assert.ok(publishedOf(mocks, 'cobro.iniciado').length === 1);
    await m.onUnload();
  });

  await testAsync('handleCreateCobro link_pago genera URL + expiracion', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreateCobro({
      cuenta_id: 'mesa_3', monto: 25, metodo_pago: 'link_pago'
    });
    assert.strictEqual(r.status, 201);
    assert.ok(r.data.link_url);
    assert.ok(r.data.expira_en);
    await m.onUnload();
  });

  await testAsync('handleCreateCobro qr genera qr_data + qr_url', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreateCobro({
      cuenta_id: 'mesa_4', monto: 25, metodo_pago: 'qr'
    });
    assert.strictEqual(r.status, 201);
    assert.ok(r.data.qr_data);
    assert.ok(r.data.qr_url);
    await m.onUnload();
  });

  // Group 4: Mixto
  await testAsync('handleCreateCobro mixto sin desglose devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreateCobro({
      cuenta_id: 'mesa_5', monto: 30, metodo_pago: 'mixto'
    });
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('handleCreateCobro mixto con suma incorrecta devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreateCobro({
      cuenta_id: 'mesa_6', monto: 30, metodo_pago: 'mixto',
      desglose: [{ metodo: 'efectivo', monto: 10 }, { metodo: 'tarjeta', monto: 15 }]
    });
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('handleCreateCobro mixto suma correcta acepta el cobro', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreateCobro({
      cuenta_id: 'mesa_7', monto: 30, metodo_pago: 'mixto',
      desglose: [{ metodo: 'efectivo', monto: 10 }, { metodo: 'tarjeta', monto: 20 }]
    });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.desglose.length, 2);
    await m.onUnload();
  });

  // Group 5: Confirmar / reembolsar
  await testAsync('handleConfirmarCobro confirma + publica cobro.procesado + abre cajon si efectivo', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const c = await m.handleCreateCobro({
      cuenta_id: 'mesa_8', monto: 10, metodo_pago: 'efectivo', monto_recibido: 10
    });
    const r = await m.handleConfirmarCobro({ id: c.data.id });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.estado, 'completado');
    assert.strictEqual(publishedOf(mocks, 'cobro.procesado').length, 1);
    assert.strictEqual(publishedOf(mocks, 'periferico.abrir-cajon').length, 1);
    await m.onUnload();
  });

  await testAsync('handleConfirmarCobro inexistente devuelve 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleConfirmarCobro({ id: 'no-existe' });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleConfirmarCobro ya completado devuelve 409 CONFLICT_STATE', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const c = await m.handleCreateCobro({
      cuenta_id: 'mesa_9', monto: 10, metodo_pago: 'tarjeta'
    });
    await m.handleConfirmarCobro({ id: c.data.id });
    const r = await m.handleConfirmarCobro({ id: c.data.id });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'CONFLICT_STATE');
    await m.onUnload();
  });

  await testAsync('handleReembolsarCobro reembolsa + publica cobro.reembolsado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const c = await m.handleCreateCobro({
      cuenta_id: 'mesa_10', monto: 25, metodo_pago: 'tarjeta'
    });
    await m.handleConfirmarCobro({ id: c.data.id });
    const r = await m.handleReembolsarCobro({ id: c.data.id, motivo: 'cliente cancelo' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.estado, 'reembolsado');
    assert.strictEqual(publishedOf(mocks, 'cobro.reembolsado').length, 1);
    await m.onUnload();
  });

  await testAsync('handleReembolsarCobro pendiente devuelve 409', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const c = await m.handleCreateCobro({
      cuenta_id: 'mesa_11', monto: 25, metodo_pago: 'tarjeta'
    });
    const r = await m.handleReembolsarCobro({ id: c.data.id });
    assert.strictEqual(r.status, 409);
    await m.onUnload();
  });

  // Group 6: Cuenta lifecycle + reset
  await testAsync('onCuentaCreada cachea ref_display', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCuentaCreada({ data: { cuenta_id: 'c1', ref_display: 'Mesa 1' } });
    assert.strictEqual(m.refDisplayCache.get('c1'), 'Mesa 1');
    await m.onUnload();
  });

  await testAsync('onCajaCerrada limpia cobros + cache', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.cobros.set('c1', {});
    m.refDisplayCache.set('cuenta_x', 'X');
    await m.onCajaCerrada({});
    assert.strictEqual(m.cobros.size, 0);
    assert.strictEqual(m.refDisplayCache.size, 0);
    await m.onUnload();
  });

  await testAsync('handleHealthCheck devuelve shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealthCheck();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.status, 'healthy');
    assert.strictEqual(r.data.version, '3.0.0');
    await m.onUnload();
  });

  await testAsync('handleGetMetodosPago devuelve lista de 7 metodos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetMetodosPago();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.metodos_disponibles.length, 7);
    await m.onUnload();
  });

  // Group 7: Helpers POC2
  await testAsync('_errorResponse construye shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._errorResponse(400, 'INVALID_INPUT', 'msg', { f: 'x' });
    assert.deepStrictEqual(r, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { f: 'x' } } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.deepStrictEqual(m._classifyHandlerError(new Error('field is required')), { status: 400, code: 'INVALID_INPUT' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('not found')), { status: 404, code: 'RESOURCE_NOT_FOUND' });
    await m.onUnload();
  });

  await testAsync('_publicarEvento añade correlation_id, project_id top-level y timestamp', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { foo: 1, project_id: 'p-z' }, { correlation_id: 'cid-z' });
    const ev = mocks.published[0][1];
    assert.strictEqual(ev.correlation_id, 'cid-z');
    assert.strictEqual(ev.project_id, 'p-z');
    assert.ok(ev.timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError emite metric cobros.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'));
    assert.strictEqual(r.status, 404);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'cobros.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });

/**
 * Tests unitarios — pizzepos__cuentas-canales (POC2).
 *
 * Tests del orquestador (delegacion a strategies). Las strategies se mockean
 * para no cargar sus dependencias (cuentas, schemas, etc).
 *
 * Ejecutar: node tests/unit/pizzepos__cuentas-canales.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

const STRATEGIES = ['mesa', 'telefono', 'llevar', 'glovo', 'whatsapp', 'llevadoo'];

// Mock strategies via require.cache antes de require el modulo
function makeMockStrategy(tipo, prefijo) {
  return class {
    constructor() {
      this.tipo = tipo;
      this.prefijo = prefijo;
      this.version = '1.0.0';
      this.cuentasActivas = 0;
      this.initCalled = false;
      this.cleanupCalled = false;
      this.cobrosProcesados = [];
    }
    async init() { this.initCalled = true; }
    async subscribeToEvents() {}
    registerUIHandlers() {}
    unregisterUIHandlers() {}
    cleanup() { this.cleanupCalled = true; }
    async onCobroProcesado(cuenta_id, correlationId, project_id) {
      this.cobrosProcesados.push({ cuenta_id, correlationId, project_id });
    }
    getHealth() { return { status: 'healthy', cuentas: this.cuentasActivas }; }
    getMetrics() { return { tipo: this.tipo, count: this.cuentasActivas }; }
    getCuentasActivas() { return this.cuentasActivas; }
  };
}

const PREFIJOS = {
  mesa: 'mesa_',
  telefono: 'tel_',
  llevar: 'llevar_',
  glovo: 'glovo_',
  whatsapp: 'wa_',
  llevadoo: 'llevadoo_'
};

for (const tipo of STRATEGIES) {
  const stratPath = path.resolve(__dirname, `../../modules/pizzepos/cuentas-canales/strategies/${tipo}.js`);
  require.cache[stratPath] = {
    exports: makeMockStrategy(tipo, PREFIJOS[tipo]),
    filename: stratPath, loaded: true, children: []
  };
}

const CuentasCanalesModule = require('../../modules/pizzepos/cuentas-canales/index.js');

function makeMocks() {
  const logs = [];
  const published = [];
  const metricsCalls = [];
  const subscriptions = [];
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
    subscribe: async (event, handler) => { subscriptions.push([event, handler]); }
  };
  const uiHandler = {
    register: (d, a) => uiRegistered.push([d, a]),
    unregister: () => {}
  };
  const moduleRegistry = {
    get: (name) => {
      if (name === 'cuentas') {
        return {
          instance: {
            handleCreateCuenta: async (data) => ({ status: 201, data: { id: 'c1', ...data } }),
            handleRenameCuenta: async (data) => ({ status: 200, data: { nombre_anterior: 'X', nombre_nuevo: data.nombre } })
          }
        };
      }
      return null;
    }
  };
  return { logs, published, metricsCalls, subscriptions, uiRegistered, logger, metrics, eventBus, uiHandler, moduleRegistry };
}

async function instantiate(mocks) {
  const m = new CuentasCanalesModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    uiHandler: mocks.uiHandler,
    moduleRegistry: mocks.moduleRegistry
  });
  return { module: m };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

function isCanonicalSuccess(r) {
  return r && typeof r.status === 'number' && r.data && !('error' in r);
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

(async () => {
  console.log('pizzepos__cuentas-canales — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad inicializa 6 strategies + suscribe cobro.procesado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'cuentas-canales');
    assert.strictEqual(m.version, '5.0.0');
    assert.strictEqual(Object.keys(m.strategies).length, 6);
    for (const s of Object.values(m.strategies)) {
      assert.ok(s.initCalled, `strategy ${s.tipo} init no llamado`);
    }
    assert.ok(mocks.subscriptions.some(s => s[0] === 'cobro.procesado'));
    await m.onUnload();
  });

  await testAsync('onUnload limpia interval + invoca cleanup en cada strategy', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.ok(m._resetInterval);
    await m.onUnload();
    assert.strictEqual(m._resetInterval, null);
    for (const s of Object.values(m.strategies)) {
      assert.ok(s.cleanupCalled);
    }
  });

  // Group 2: detectarCanal
  await testAsync('detectarCanal reconoce prefijos por strategy', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.detectarCanal('mesa_42').tipo, 'mesa');
    assert.strictEqual(m.detectarCanal('tel_911').tipo, 'telefono');
    assert.strictEqual(m.detectarCanal('llevar_1').tipo, 'llevar');
    assert.strictEqual(m.detectarCanal('glovo_x').tipo, 'glovo');
    assert.strictEqual(m.detectarCanal('wa_y').tipo, 'whatsapp');
    assert.strictEqual(m.detectarCanal('llevadoo_z').tipo, 'llevadoo');
    assert.strictEqual(m.detectarCanal('algo-raro'), null);
    assert.strictEqual(m.detectarCanal(null), null);
    await m.onUnload();
  });

  // Group 3: onCobroProcesado delega a strategy
  await testAsync('onCobroProcesado delega al strategy correcto por prefijo', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCobroProcesado({
      metadata: { correlationId: 'cid' },
      data: { cuenta_id: 'mesa_5', project_id: 'proj-1' }
    });
    assert.strictEqual(m.strategies.mesa.cobrosProcesados.length, 1);
    assert.strictEqual(m.strategies.mesa.cobrosProcesados[0].cuenta_id, 'mesa_5');
    assert.strictEqual(m.strategies.mesa.cobrosProcesados[0].project_id, 'proj-1');
    assert.strictEqual(m.strategies.telefono.cobrosProcesados.length, 0);
    await m.onUnload();
  });

  await testAsync('onCobroProcesado sin cuenta_id se ignora', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCobroProcesado({ data: {} });
    for (const s of Object.values(m.strategies)) {
      assert.strictEqual(s.cobrosProcesados.length, 0);
    }
    await m.onUnload();
  });

  await testAsync('onCobroProcesado sin canal reconocido se ignora', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCobroProcesado({ data: { cuenta_id: 'extraterrestre_42' } });
    for (const s of Object.values(m.strategies)) {
      assert.strictEqual(s.cobrosProcesados.length, 0);
    }
    await m.onUnload();
  });

  // Group 4: Publishers
  await testAsync('publishCuentaCerrada emite evento con project_id top-level + correlation_id + timestamp', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.publishCuentaCerrada({
      cuenta_id: 'mesa_5', tipo: 'mesa', project_id: 'proj-1', total: 25
    }, 'cid-cerrar');
    const evs = publishedOf(mocks, 'cuenta.cerrada');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].project_id, 'proj-1');
    assert.strictEqual(evs[0].correlation_id, 'cid-cerrar');
    assert.ok(evs[0].timestamp);
    await m.onUnload();
  });

  // Group 5: Delegation a cuentas
  await testAsync('crearCuentaViaCuentas delega a cuentas.handleCreateCuenta', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.crearCuentaViaCuentas({ project_id: 'proj-1', tipo: 'mesa' });
    assert.strictEqual(r.id, 'c1');
    assert.strictEqual(r.tipo, 'mesa');
    await m.onUnload();
  });

  await testAsync('renombrarCuentaViaCuentas devuelve resultado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.renombrarCuentaViaCuentas({ project_id: 'proj-1', id: 'c1', nombre: 'Nuevo' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.nombre_nuevo, 'Nuevo');
    await m.onUnload();
  });

  // Group 6: UI handlers agregados
  await testAsync('handleHealthCheck devuelve health de los 6 canales', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealthCheck();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.version, '5.0.0');
    assert.strictEqual(Object.keys(r.data.canales).length, 6);
    await m.onUnload();
  });

  await testAsync('handleGetMetrics devuelve metrics de los 6 canales', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetMetrics();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(Object.keys(r.data.canales).length, 6);
    await m.onUnload();
  });

  await testAsync('handleGetCanales lista 6 canales con prefijo + version', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetCanales();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.canales.length, 6);
    const tipos = r.data.canales.map(c => c.tipo).sort();
    assert.deepStrictEqual(tipos, ['glovo', 'llevadoo', 'llevar', 'mesa', 'telefono', 'whatsapp']);
    await m.onUnload();
  });

  // Group 7: Helpers POC2 + utilidades
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

  await testAsync('_handleHandlerError emite metric cuentas-canales.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'));
    assert.strictEqual(r.status, 404);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'cuentas-canales.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  await testAsync('trackTiempo + getPromedioTiempo calculan rolling avg', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.trackTiempo('test', 10);
    m.trackTiempo('test', 20);
    m.trackTiempo('test', 30);
    assert.strictEqual(m.getPromedioTiempo('test'), 20);
    await m.onUnload();
  });

  await testAsync('getFechaActual devuelve YYYYMMDD', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const fecha = m.getFechaActual();
    assert.match(fecha, /^\d{8}$/);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });

/**
 * Tests unitarios — gateway-manager v2.0.0 (POC2 #6 reescritura).
 *
 * Foco:
 *  - Lifecycle (onLoad arranca / sin MQTT no crashea, onUnload limpia).
 *  - Validacion canonica de UI handlers (4) → { status, data | error: { code, message, details? } }.
 *  - handleList con 4 tipos (tcp, ble, usb, cmd) y mix running/stopped.
 *  - handleStatus running vs no running con info canonica.
 *  - handleRestart success / sin MQTT / type invalido.
 *  - handleDiscover sin persistir gateway temporal.
 *  - 5 eventos canonicos (gateway.started, .stopped, .device_found, .error,
 *    + .device_lost declarado pero no emitido — es extension point).
 *  - Helpers POC2 internos.
 *  - Aislamiento: mock MQTT, no toca disco, no abre sockets.
 *
 * Ejecutar: node tests/unit/gateway-manager.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');

// Stub gateway classes para no depender de implementaciones reales (TCP, BLE, USB, CMD)
// Tienen el mismo shape que GatewayBase pero sin sockets ni serialport.
class StubGateway {
  constructor(type, config, deps, opts = {}) {
    this.type = type;
    this.config = config || {};
    this.mqtt = deps.mqtt;
    this.eventBus = deps.eventBus;
    this.logger = deps.logger;
    this.devices = new Map();
    this.metrics = { devices_found: 0, commands_processed: 0, errors: 0 };
    this.state = 'stopped';
    this.startedAt = null;
    this._opts = opts;
  }
  async start() {
    if (this._opts.failOnStart) throw new Error(this._opts.failOnStart);
    const ds = this._opts.devices || [];
    for (const d of ds) {
      this.devices.set(d.device_id, {
        type: d.type || 'unknown',
        capabilities: d.capabilities || ['imprimir'],
        state: 'online'
      });
      this.metrics.devices_found++;
    }
    this.state = 'running';
    this.startedAt = new Date().toISOString();
  }
  async stop() {
    if (this._opts.failOnStop) throw new Error('stop_failed');
    this.devices.clear();
    this.state = 'stopped';
  }
  async _discoverDevices() {
    if (this._opts.failOnDiscover) throw new Error(this._opts.failOnDiscover);
    return this._opts.discoverable || [];
  }
  getInfo() {
    return {
      type: this.type,
      state: this.state,
      started_at: this.startedAt,
      devices: Array.from(this.devices.entries()).map(([id, e]) => ({
        device_id: id, type: e.type, state: e.state, capabilities: e.capabilities
      })),
      devices_count: this.devices.size,
      metrics: { ...this.metrics }
    };
  }
}

// Patch require cache para sustituir las gateways reales con stubs ANTES de cargar el modulo.
const STUB_OPTS = {
  tcp: { devices: [{ device_id: 'tcp-printer-1', type: 'impresora-termica', capabilities: ['imprimir'] }] },
  ble: { devices: [] },
  usb: { devices: [] },
  cmd: { devices: [] }
};

function patchGatewayClasses() {
  const mod = path.resolve(__dirname, '../../modules/gateway-manager/gateways');
  for (const t of ['tcp', 'ble', 'usb', 'cmd']) {
    const mp = path.join(mod, `${t}.js`);
    delete require.cache[mp];
    require.cache[mp] = {
      id: mp,
      filename: mp,
      loaded: true,
      exports: class extends StubGateway {
        constructor(config, deps) { super(t, config, deps, STUB_OPTS[t] || {}); }
      }
    };
  }
  // Forzar recarga de index.js con los stubs en cache
  delete require.cache[path.resolve(__dirname, '../../modules/gateway-manager/index.js')];
}

function setStubOpts(type, opts) {
  STUB_OPTS[type] = opts;
  // Re-aplicar el cache con nuevos opts
  const mp = path.resolve(__dirname, `../../modules/gateway-manager/gateways/${type}.js`);
  require.cache[mp] = {
    id: mp,
    filename: mp,
    loaded: true,
    exports: class extends StubGateway {
      constructor(config, deps) { super(type, config, deps, STUB_OPTS[type] || {}); }
    }
  };
  delete require.cache[path.resolve(__dirname, '../../modules/gateway-manager/index.js')];
}

patchGatewayClasses();
const GatewayManagerModule = require('../../modules/gateway-manager/index.js');

// --------------------------------------------------
// Mock infra
// --------------------------------------------------

function makeMqttMock(connected = true) {
  return {
    isConnected: connected,
    publish: async () => {},
    subscribe: async () => {},
    on: () => {},
    removeListener: () => {}
  };
}

function makeMocks(mqttConnected = true) {
  const logs = [];
  const published = [];
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
    publish: async (event, payload) => { published.push([event, payload]); },
    mqtt: makeMqttMock(mqttConnected)
  };

  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

async function instantiate(mocks, gatewaysConfig = {}) {
  const m = new GatewayManagerModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    config: { 'gateway-manager': { gateways: gatewaysConfig } }
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

// ==================================================
//                                                Tests
// ==================================================

(async () => {
  console.log('gateway-manager — reescritura canonica v2.0.0 (POC2 #6)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad sin gateways enabled → no arranca ninguno + no crash', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, {});
    assert.strictEqual(m.gateways.size, 0);
    await m.onUnload();
  });

  await testAsync('onLoad con tcp.enabled → arranca tcp y publica gateway.started + device_found', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, {
      tcp: { enabled: true, manual_devices: [], autodiscovery: false }
    });
    assert.strictEqual(m.gateways.size, 1);
    assert.ok(m.gateways.has('tcp'));

    const started = publishedOf(mocks, 'gateway.started');
    assert.strictEqual(started.length, 1);
    assert.strictEqual(started[0].type, 'tcp');
    assert.strictEqual(started[0].devices_count, 1);
    assert.ok(started[0].correlation_id);
    assert.ok(started[0].timestamp);

    const found = publishedOf(mocks, 'gateway.device_found');
    assert.strictEqual(found.length, 1);
    assert.strictEqual(found[0].device_id, 'tcp-printer-1');
    assert.strictEqual(found[0].gateway_type, 'tcp');
    await m.onUnload();
  });

  await testAsync('onLoad sin MQTT conectado → warn + no arranca + no crash', async () => {
    const mocks = makeMocks(false);
    const { module: m } = await instantiate(mocks, { tcp: { enabled: true } });
    assert.strictEqual(m.gateways.size, 0);
    const warns = mocks.logs.filter(l => l[0] === 'warn');
    assert.ok(warns.some(w => w[1].includes('mqtt.not_available')));
    await m.onUnload();
  });

  await testAsync('onLoad merge de config legacy core.config.gateways funciona', async () => {
    const mocks = makeMocks();
    const m = new GatewayManagerModule();
    await m.onLoad({
      logger: mocks.logger,
      metrics: mocks.metrics,
      eventBus: mocks.eventBus,
      config: { gateways: { tcp: { enabled: true } } }
    });
    assert.strictEqual(m.gateways.size, 1);
    assert.ok(m.gateways.has('tcp'));
    await m.onUnload();
  });

  await testAsync('onUnload publica gateway.stopped por cada activo + clear gateways', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, {
      tcp: { enabled: true }, ble: { enabled: true }
    });
    assert.strictEqual(m.gateways.size, 2);
    mocks.published.length = 0;

    await m.onUnload();
    assert.strictEqual(m.gateways.size, 0);
    const stopped = publishedOf(mocks, 'gateway.stopped');
    assert.strictEqual(stopped.length, 2);
    const types = stopped.map(s => s.type).sort();
    assert.deepStrictEqual(types, ['ble', 'tcp']);
  });

  await testAsync('onLoad con gateway.start fail → publica gateway.error y no agrega al map', async () => {
    setStubOpts('cmd', { failOnStart: 'cmd_boom' });
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { cmd: { enabled: true } });
    assert.strictEqual(m.gateways.size, 0);
    const errors = publishedOf(mocks, 'gateway.error');
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].type, 'cmd');
    assert.ok(/cmd_boom/.test(errors[0].error));
    await m.onUnload();
    setStubOpts('cmd', { devices: [] }); // restore
  });

  // ==========================================
  // Group 2: Validacion canonica de UI handlers
  // ==========================================

  await testAsync('handleStatus sin type → 400 VALIDATION_FAILED canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleStatus({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'VALIDATION_FAILED');
    assert.deepStrictEqual(r.error.details.allowed, ['tcp', 'ble', 'usb', 'cmd']);
    await m.onUnload();
  });

  await testAsync('handleStatus con type invalido → 400 + allowed en details', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleStatus({ type: 'unknown' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'VALIDATION_FAILED');
    await m.onUnload();
  });

  await testAsync('handleRestart sin type → 400 VALIDATION_FAILED', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleRestart({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('handleRestart sin MQTT → 503 UPSTREAM_UNAVAILABLE', async () => {
    const mocks = makeMocks(true);
    const { module: m } = await instantiate(mocks, { tcp: { enabled: true } });
    // Cortar MQTT despues del onLoad
    mocks.eventBus.mqtt.isConnected = false;
    const r = await m.handleRestart({ type: 'tcp' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.error.code, 'UPSTREAM_UNAVAILABLE');
    await m.onUnload();
  });

  await testAsync('handleDiscover sin type → 400 VALIDATION_FAILED', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleDiscover({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('handleDiscover sin MQTT → 503 UPSTREAM_UNAVAILABLE', async () => {
    const mocks = makeMocks(false);
    const { module: m } = await instantiate(mocks);
    const r = await m.handleDiscover({ type: 'tcp' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 503);
    await m.onUnload();
  });

  // ==========================================
  // Group 3: handleList shape
  // ==========================================

  await testAsync('handleList devuelve 4 gateways (todos los tipos) con running/enabled', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, {
      tcp: { enabled: true }, ble: { enabled: false }
    });
    const r = await m.handleList();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.total_configured, 4);
    assert.strictEqual(r.data.active, 1);
    const tcp = r.data.gateways.find(g => g.type === 'tcp');
    const ble = r.data.gateways.find(g => g.type === 'ble');
    assert.strictEqual(tcp.running, true);
    assert.strictEqual(tcp.enabled, true);
    assert.strictEqual(ble.running, false);
    assert.strictEqual(ble.enabled, false);
    await m.onUnload();
  });

  // ==========================================
  // Group 4: handleStatus running vs stopped
  // ==========================================

  await testAsync('handleStatus running → devuelve getInfo() del gateway', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { tcp: { enabled: true } });
    const r = await m.handleStatus({ type: 'tcp' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.type, 'tcp');
    assert.strictEqual(r.data.state, 'running');
    assert.strictEqual(r.data.devices_count, 1);
    await m.onUnload();
  });

  await testAsync('handleStatus stopped → devuelve { type, running:false, enabled }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleStatus({ type: 'tcp' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.running, false);
    assert.strictEqual(r.data.enabled, false);
    await m.onUnload();
  });

  // ==========================================
  // Group 5: handleRestart success
  // ==========================================

  await testAsync('handleRestart de gateway running → 200 + restarted:true', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { tcp: { enabled: true } });
    const r = await m.handleRestart({ type: 'tcp' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.restarted, true);
    assert.strictEqual(r.data.type, 'tcp');
    assert.strictEqual(typeof r.data.devices, 'number');
    await m.onUnload();
  });

  await testAsync('handleRestart de tipo no enabled (no en this.gateways) → 200 si MQTT y tipo valido', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    // ble enabled=false en config — pero el tipo es valido y MQTT esta up
    const r = await m.handleRestart({ type: 'ble' });
    assert.strictEqual(r.status, 200);
    await m.onUnload();
  });

  // ==========================================
  // Group 6: handleDiscover sin persistir
  // ==========================================

  await testAsync('handleDiscover NO mete el gateway temporal en this.gateways', async () => {
    setStubOpts('usb', { discoverable: [{ device_id: 'usb1' }, { device_id: 'usb2' }] });
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const before = m.gateways.size;
    const r = await m.handleDiscover({ type: 'usb' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.count, 2);
    assert.strictEqual(m.gateways.size, before);
    await m.onUnload();
    setStubOpts('usb', { devices: [] });
  });

  // ==========================================
  // Group 7: Helpers POC2 internos
  // ==========================================

  await testAsync('_errorResponse construye shape canonico { status, error: { code, message, details? } }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = m._errorResponse(400, 'VALIDATION_FAILED', 'msg', { field: 'x' });
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'VALIDATION_FAILED', message: 'msg', details: { field: 'x' } } });
    const r2 = m._errorResponse(500, 'INTERNAL_ERROR', 'oops');
    assert.deepStrictEqual(r2, { status: 500, error: { code: 'INTERNAL_ERROR', message: 'oops' } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea por mensaje a codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(new Error('Gateway not found')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('type is required')), 'VALIDATION_FAILED');
    assert.strictEqual(m._classifyHandlerError(new Error('Type not supported: foo')), 'VALIDATION_FAILED');
    assert.strictEqual(m._classifyHandlerError(new Error('MQTT not available')), 'UPSTREAM_UNAVAILABLE');
    assert.strictEqual(m._classifyHandlerError(new Error('something exploded')), 'INTERNAL_ERROR');
    await m.onUnload();
  });

  await testAsync('_publicarEvento hereda correlation_id si se pasa, genera uno nuevo si no', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { foo: 1 }, { correlation_id: 'cid-inherit' });
    await m._publicarEvento('test.event', { bar: 2 });
    const evs = publishedOf(mocks, 'test.event');
    assert.strictEqual(evs.length, 2);
    assert.strictEqual(evs[0].correlation_id, 'cid-inherit');
    assert.notStrictEqual(evs[1].correlation_id, 'cid-inherit');
    assert.ok(typeof evs[1].correlation_id === 'string');
    assert.ok(evs[0].timestamp && evs[1].timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError mapea status segun code y registra metric', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const err = Object.assign(new Error('mqtt down'), { _code: 'UPSTREAM_UNAVAILABLE', _details: { upstream: 'mqtt' } });
    const r = m._handleHandlerError('test.failed', err, 'kind');
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.error.code, 'UPSTREAM_UNAVAILABLE');
    assert.deepStrictEqual(r.error.details, { upstream: 'mqtt' });
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'gateway-manager.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})();

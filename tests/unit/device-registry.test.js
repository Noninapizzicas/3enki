/**
 * Tests unitarios — device-registry (POC2 reescritura).
 * Ejecutar: node tests/unit/device-registry.test.js
 */

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const os     = require('os');
const path   = require('path');
const fs     = require('fs');

const DeviceRegistryModule = require('../../modules/device-registry/index.js');

// --------------------------------------------------
// Mock infra
// --------------------------------------------------

function makeMocks() {
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
    publish: async (event, payload) => { published.push([event, payload]); }
    // Sin .mqtt → modulo loguea warn 'mqtt.not_available' y no engancha listeners reales
  };

  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

async function instantiate(mocks, opts = {}) {
  const m = new DeviceRegistryModule();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devreg-test-'));
  await m.onLoad({
    logger:   mocks.logger,
    metrics:  mocks.metrics,
    eventBus: mocks.eventBus,
    config:   { 'device-registry': { data_path: tmpDir, heartbeat_timeout_ms: opts.heartbeat_timeout_ms ?? 60000 } }
  });
  return { module: m, tmpDir };
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
  console.log('device-registry — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa estado limpio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'device-registry');
    assert.strictEqual(m.version, '2.0.0');
    assert.strictEqual(m.devices.size, 0);
    assert.strictEqual(m._heartbeatTimers.size, 0);
    await m.onUnload();
  });

  await testAsync('onLoad marca todos los devices cargados como offline (la realidad MQTT manda)', async () => {
    const mocks = makeMocks();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devreg-pre-'));
    // Pre-poblar disco con un device "online"
    fs.writeFileSync(path.join(tmpDir, 'registry.json'), JSON.stringify({
      _version: '2.0.0',
      devices: [{
        device_id: 'pre-1', project_id: 'p1', name: 'pre', type: 'sensor',
        capabilities: ['status'], protocol: 'mqtt-native', state: 'online',
        last_seen: '2024-01-01T00:00:00Z', registered_at: '2024-01-01T00:00:00Z'
      }]
    }));
    const m = new DeviceRegistryModule();
    await m.onLoad({
      logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus,
      config: { 'device-registry': { data_path: tmpDir } }
    });
    assert.strictEqual(m.devices.get('pre-1').state, 'offline');
    assert.strictEqual(m.internalMetrics.online_current, 0);
    assert.strictEqual(m.internalMetrics.offline_current, 1);
    await m.onUnload();
  });

  await testAsync('onUnload limpia heartbeat timers + persiste + reset metricas', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._handleBirth('p1', 'dev-1', JSON.stringify({ name: 'a', type: 'sensor' }));
    assert.strictEqual(m.devices.size, 1);
    assert.strictEqual(m._heartbeatTimers.size, 1);
    await m.onUnload();
    assert.strictEqual(m.devices.size, 0);
    assert.strictEqual(m._heartbeatTimers.size, 0);
    assert.strictEqual(m.internalMetrics.registered_total, 0);
  });

  // ==========================================
  // Group 2: Validacion canonica de UI handlers
  // ==========================================

  await testAsync('handleGet: device_id ausente → 400 INVALID_INPUT canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGet({});
    assert.ok(isCanonicalError(r), `shape incorrecto: ${JSON.stringify(r)}`);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'device_id');
    await m.onUnload();
  });

  await testAsync('handleGet: device no existe → 404 RESOURCE_NOT_FOUND canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGet({ device_id: 'noexiste' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(r.error.details.entity_type, 'device');
    await m.onUnload();
  });

  await testAsync('handleRegister: device_id ausente → 400 INVALID_INPUT canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleRegister({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleUnregister: device_id ausente → 400 INVALID_INPUT canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleUnregister({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Bus handlers (subscribes)
  // ==========================================

  await testAsync('onDeviceRegister: registra y emite device.registered con project_id top-level + correlation_id propagado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const cid = crypto.randomUUID();

    await m.onDeviceRegister({
      data: {
        device_id: 'dev-100', project_id: 'proj-1', name: 'manual',
        type: 'sensor', capabilities: ['status'], correlation_id: cid
      }
    });

    assert.strictEqual(m.devices.size, 1);
    const evts = publishedOf(mocks, 'device.registered');
    assert.strictEqual(evts.length, 1);
    assert.strictEqual(evts[0].device_id, 'dev-100', 'device_id top-level');
    assert.strictEqual(evts[0].project_id, 'proj-1', 'project_id top-level');
    assert.strictEqual(evts[0].correlation_id, cid, 'correlation_id propagado');
    assert.ok(evts[0].timestamp);
    assert.strictEqual(evts[0].source, 'event');
    assert.strictEqual(evts[0].device.device_id, 'dev-100');
    await m.onUnload();
  });

  await testAsync('onDeviceRegister: device_id ausente → warn + metric, no crash', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onDeviceRegister({ data: { project_id: 'p1' } });
    const warns = mocks.logs.filter(l => l[0] === 'warn' && l[1].includes('missing_device_id'));
    assert.strictEqual(warns.length, 1);
    const errMetrics = mocks.metricsCalls.filter(c => c[0] === 'increment' && c[1] === 'device-registry.errors');
    assert.ok(errMetrics.length >= 1);
    await m.onUnload();
  });

  await testAsync('onDeviceUnregister: elimina y emite device.unregistered con correlation_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onDeviceRegister({ data: { device_id: 'dev-200', project_id: 'p1' } });
    mocks.published.length = 0;
    const cid = crypto.randomUUID();

    await m.onDeviceUnregister({ data: { device_id: 'dev-200', correlation_id: cid } });

    assert.strictEqual(m.devices.size, 0);
    const evts = publishedOf(mocks, 'device.unregistered');
    assert.strictEqual(evts.length, 1);
    assert.strictEqual(evts[0].device_id, 'dev-200');
    assert.strictEqual(evts[0].project_id, 'p1');
    assert.strictEqual(evts[0].correlation_id, cid);
    await m.onUnload();
  });

  await testAsync('onDeviceUnregister: device inexistente → no-op (no crash, no publish)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onDeviceUnregister({ data: { device_id: 'fantasma' } });
    assert.strictEqual(publishedOf(mocks, 'device.unregistered').length, 0);
    await m.onUnload();
  });

  // ==========================================
  // Group 4: MQTT handlers (birth / lwt / status)
  // ==========================================

  await testAsync('_handleBirth: device nuevo → device.registered + device.online (project_id top-level + correlation_id)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    m._handleBirth('proj-1', 'esp-A', JSON.stringify({
      name: 'esp32 alpha', type: 'print-proxy', capabilities: ['imprimir']
    }));

    const regs = publishedOf(mocks, 'device.registered');
    const ons  = publishedOf(mocks, 'device.online');
    assert.strictEqual(regs.length, 1);
    assert.strictEqual(ons.length, 1);

    assert.strictEqual(regs[0].device_id, 'esp-A');
    assert.strictEqual(regs[0].project_id, 'proj-1');
    assert.strictEqual(regs[0].source, 'birth');
    assert.ok(regs[0].correlation_id);
    assert.ok(regs[0].timestamp);
    assert.strictEqual(regs[0].device.type, 'print-proxy');

    assert.strictEqual(ons[0].device_id, 'esp-A');
    assert.strictEqual(ons[0].project_id, 'proj-1');
    assert.ok(ons[0].correlation_id);
    await m.onUnload();
  });

  await testAsync('_handleBirth: device ya registrado → solo device.online, NO re-publica device.registered', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    m._handleBirth('p1', 'esp-B', JSON.stringify({ name: 'b', type: 'sensor' }));
    mocks.published.length = 0;
    m._handleBirth('p1', 'esp-B', JSON.stringify({ name: 'b', type: 'sensor' }));

    assert.strictEqual(publishedOf(mocks, 'device.registered').length, 0);
    assert.strictEqual(publishedOf(mocks, 'device.online').length, 1);
    await m.onUnload();
  });

  await testAsync('_handleLwt: device existente y online → marca offline + emite device.offline con reason=lwt', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    m._handleBirth('p1', 'esp-C', JSON.stringify({ name: 'c', type: 'sensor' }));
    mocks.published.length = 0;

    m._handleLwt('p1', 'esp-C');

    const offs = publishedOf(mocks, 'device.offline');
    assert.strictEqual(offs.length, 1);
    assert.strictEqual(offs[0].device_id, 'esp-C');
    assert.strictEqual(offs[0].project_id, 'p1');
    assert.strictEqual(offs[0].reason, 'lwt');
    assert.ok(offs[0].correlation_id);
    assert.strictEqual(m.devices.get('esp-C').state, 'offline');
    assert.strictEqual(m._heartbeatTimers.has('esp-C'), false);
    await m.onUnload();
  });

  await testAsync('_handleLwt: device desconocido → no-op (no crash)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._handleLwt('p1', 'fantasma');
    assert.strictEqual(publishedOf(mocks, 'device.offline').length, 0);
    await m.onUnload();
  });

  await testAsync('_handleLwt: device ya offline → no re-publica device.offline (idempotente)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._handleBirth('p1', 'esp-D', JSON.stringify({ name: 'd' }));
    m._handleLwt('p1', 'esp-D');
    mocks.published.length = 0;
    m._handleLwt('p1', 'esp-D');
    assert.strictEqual(publishedOf(mocks, 'device.offline').length, 0);
    await m.onUnload();
  });

  await testAsync('_handleStatus: device desconocido → auto-registro (device.registered + device.online con source=status-autodiscovery)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    m._handleStatus('p1', 'auto-1', JSON.stringify({
      printer_ready: true, printer_name: 'EPSON', firmware: '3.5.0'
    }), 'mqtt-native');

    const regs = publishedOf(mocks, 'device.registered');
    assert.strictEqual(regs.length, 1);
    assert.strictEqual(regs[0].source, 'status-autodiscovery');
    assert.strictEqual(regs[0].project_id, 'p1');
    assert.strictEqual(regs[0].device.type, 'print-proxy', 'inferType debe detectar print-proxy por printer_ready');
    assert.ok(regs[0].device.capabilities.includes('imprimir'));
    assert.strictEqual(publishedOf(mocks, 'device.online').length, 1);
    await m.onUnload();
  });

  await testAsync('_handleStatus: device existente offline → emite device.online (transicion)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._handleBirth('p1', 'esp-E', JSON.stringify({ name: 'e', type: 'sensor' }));
    m._handleLwt('p1', 'esp-E');
    mocks.published.length = 0;

    m._handleStatus('p1', 'esp-E', JSON.stringify({ uptime_sec: 120 }), 'mqtt-native');

    const ons = publishedOf(mocks, 'device.online');
    assert.strictEqual(ons.length, 1);
    assert.strictEqual(ons[0].source, 'status');
    assert.strictEqual(m.devices.get('esp-E').state, 'online');
    await m.onUnload();
  });

  await testAsync('_handleStatus: device existente online sin cambios → NO emite device.online ni device.updated', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._handleBirth('p1', 'esp-F', JSON.stringify({ name: 'f', type: 'sensor', firmware: '1.0.0' }));
    mocks.published.length = 0;

    m._handleStatus('p1', 'esp-F', JSON.stringify({ firmware: '1.0.0' }), 'mqtt-native');

    assert.strictEqual(publishedOf(mocks, 'device.online').length, 0);
    assert.strictEqual(publishedOf(mocks, 'device.updated').length, 0);
    await m.onUnload();
  });

  await testAsync('_handleStatus: cambia firmware → emite device.updated con changes diff', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._handleBirth('p1', 'esp-G', JSON.stringify({ name: 'g', type: 'sensor', firmware: '1.0.0' }));
    mocks.published.length = 0;

    m._handleStatus('p1', 'esp-G', JSON.stringify({ firmware: '2.0.0', uptime_sec: 50 }), 'mqtt-native');

    const updates = publishedOf(mocks, 'device.updated');
    assert.strictEqual(updates.length, 1);
    assert.strictEqual(updates[0].device_id, 'esp-G');
    assert.strictEqual(updates[0].project_id, 'p1');
    assert.deepStrictEqual(updates[0].changes.firmware, { from: '1.0.0', to: '2.0.0' });
    assert.ok(updates[0].correlation_id);
    await m.onUnload();
  });

  await testAsync('_handleMqttMessage: enrutamiento por topic — birth, lwt, enki status, impresion status', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    m._handleMqttMessage('devices/p1/d-birth/birth', JSON.stringify({ name: 'b1', type: 'sensor' }));
    m._handleMqttMessage('enki/p1/status/d-enki', JSON.stringify({ uptime_sec: 1 }));
    m._handleMqttMessage('impresion/p1/status/d-impr', JSON.stringify({ printer_ready: true }));
    m._handleMqttMessage('devices/p1/d-birth/lwt', null);
    m._handleMqttMessage('topic/desconocido/x', null);

    assert.ok(m.devices.has('d-birth'));
    assert.ok(m.devices.has('d-enki'));
    assert.ok(m.devices.has('d-impr'));
    assert.strictEqual(m.devices.get('d-birth').state, 'offline');
    await m.onUnload();
  });

  await testAsync('_handleMqttMessage: payload JSON malformado → warn + null, no crash', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    m._handleMqttMessage('devices/p1/dx/birth', Buffer.from('not-json'));

    assert.strictEqual(m.devices.size, 0);
    const warns = mocks.logs.filter(l => l[0] === 'warn' && l[1].includes('parse_error'));
    assert.strictEqual(warns.length, 1);
    await m.onUnload();
  });

  // ==========================================
  // Group 5: Heartbeat timeout → device.offline
  // ==========================================

  await testAsync('Heartbeat timeout dispara device.offline con reason=heartbeat_timeout', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { heartbeat_timeout_ms: 30 });

    m._handleBirth('p1', 'esp-HB', JSON.stringify({ name: 'hb', type: 'sensor' }));
    assert.strictEqual(m.devices.get('esp-HB').state, 'online');
    mocks.published.length = 0;

    await new Promise(resolve => setTimeout(resolve, 80));

    const offs = publishedOf(mocks, 'device.offline');
    assert.strictEqual(offs.length, 1);
    assert.strictEqual(offs[0].device_id, 'esp-HB');
    assert.strictEqual(offs[0].project_id, 'p1');
    assert.strictEqual(offs[0].reason, 'heartbeat_timeout');
    assert.ok(offs[0].correlation_id);
    assert.strictEqual(m.devices.get('esp-HB').state, 'offline');
    await m.onUnload();
  });

  // ==========================================
  // Group 6: UI handlers exitosos + Public API
  // ==========================================

  await testAsync('handleList: filtros (type, state, project_id, online_only) componibles', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._handleBirth('p1', 'a', JSON.stringify({ type: 'sensor' }));
    m._handleBirth('p1', 'b', JSON.stringify({ type: 'print-proxy' }));
    m._handleBirth('p2', 'c', JSON.stringify({ type: 'sensor' }));
    m._handleLwt('p1', 'a'); // a → offline

    const all = await m.handleList({});
    assert.ok(isCanonicalSuccess(all));
    assert.strictEqual(all.data.total, 3);

    const onlyOnline = await m.handleList({ online_only: true });
    assert.strictEqual(onlyOnline.data.total, 2);
    assert.ok(onlyOnline.data.devices.every(d => d.state === 'online'));

    const onlyP1 = await m.handleList({ project_id: 'p1' });
    assert.strictEqual(onlyP1.data.total, 2);

    const onlySensors = await m.handleList({ type: 'sensor' });
    assert.strictEqual(onlySensors.data.total, 2);

    await m.onUnload();
  });

  await testAsync('handleGet: device existente → 200 con shape canonico { device }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._handleBirth('p1', 'dev-Q', JSON.stringify({ type: 'sensor' }));

    const r = await m.handleGet({ device_id: 'dev-Q' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.device.device_id, 'dev-Q');
    assert.strictEqual(r.data.device.project_id, 'p1');
    await m.onUnload();
  });

  await testAsync('handleStats: shape canonico con buckets by_type, by_protocol, by_state + metrics', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._handleBirth('p1', 'a', JSON.stringify({ type: 'sensor' }));
    m._handleBirth('p1', 'b', JSON.stringify({ type: 'sensor' }));
    m._handleBirth('p1', 'c', JSON.stringify({ type: 'print-proxy' }));

    const r = await m.handleStats();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.total, 3);
    assert.strictEqual(r.data.by_type.sensor, 2);
    assert.strictEqual(r.data.by_type['print-proxy'], 1);
    assert.strictEqual(r.data.by_state.online, 3);
    assert.strictEqual(r.data.by_state.offline, 0);
    assert.strictEqual(typeof r.data.metrics.registered_total, 'number');
    await m.onUnload();
  });

  await testAsync('handleRegister: 201 con device sanitizado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleRegister({ device_id: 'manual-1', project_id: 'p1', type: 'sensor' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.device.device_id, 'manual-1');
    await m.onUnload();
  });

  await testAsync('handleUnregister: 200 con removed=true / false', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleRegister({ device_id: 'manual-2', project_id: 'p1' });

    const r1 = await m.handleUnregister({ device_id: 'manual-2' });
    assert.ok(isCanonicalSuccess(r1));
    assert.strictEqual(r1.data.removed, true);

    const r2 = await m.handleUnregister({ device_id: 'fantasma' });
    assert.ok(isCanonicalSuccess(r2));
    assert.strictEqual(r2.data.removed, false);
    await m.onUnload();
  });

  await testAsync('Public API: getDevice / listDevices / isOnline funcionan para otros modulos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._handleBirth('p1', 'pub-1', JSON.stringify({ type: 'sensor', capabilities: ['display'] }));
    m._handleBirth('p2', 'pub-2', JSON.stringify({ type: 'print-proxy' }));
    m._handleLwt('p2', 'pub-2');

    assert.strictEqual(m.getDevice('pub-1').device_id, 'pub-1');
    assert.strictEqual(m.getDevice('noexiste'), null);
    assert.strictEqual(m.isOnline('pub-1'), true);
    assert.strictEqual(m.isOnline('pub-2'), false);
    assert.strictEqual(m.listDevices({ project_id: 'p1' }).length, 1);
    assert.strictEqual(m.listDevices({ capability: 'display' }).length, 1);
    await m.onUnload();
  });

  await testAsync('Persistencia atomica: tras mutaciones, _persistToDisk crea registry.json (write tmp + rename)', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    m._handleBirth('p1', 'persist-1', JSON.stringify({ type: 'sensor' }));
    await m._persistToDisk();

    const filePath = path.join(tmpDir, 'registry.json');
    assert.ok(fs.existsSync(filePath));
    const persisted = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.strictEqual(persisted._version, '2.0.0');
    assert.strictEqual(persisted.devices.length, 1);
    assert.strictEqual(persisted.devices[0].device_id, 'persist-1');
    assert.strictEqual(m._dirty, false, 'flag dirty se baja tras persistir');
    await m.onUnload();
  });

  await testAsync('_recalcMetrics emite gauges devices.online.current y devices.offline.current', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._handleBirth('p1', 'g-1', JSON.stringify({ type: 'sensor' }));
    m._handleBirth('p1', 'g-2', JSON.stringify({ type: 'sensor' }));
    m._handleLwt('p1', 'g-2');

    const onlineGauges  = mocks.metricsCalls.filter(c => c[0] === 'gauge' && c[1] === 'devices.online.current');
    const offlineGauges = mocks.metricsCalls.filter(c => c[0] === 'gauge' && c[1] === 'devices.offline.current');
    assert.ok(onlineGauges.length >= 1);
    assert.ok(offlineGauges.length >= 1);
    // El ultimo debe reflejar 1 online / 1 offline
    assert.strictEqual(onlineGauges[onlineGauges.length - 1][2],  1);
    assert.strictEqual(offlineGauges[offlineGauges.length - 1][2], 1);
    await m.onUnload();
  });

  // ==========================================
  // Group 7: Helpers POC2 internos
  // ==========================================

  await testAsync('_errorResponse construye shape canonico { status, error: { code, message, details? } }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = m._errorResponse(400, 'INVALID_INPUT', 'msg', { field: 'x' });
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { field: 'x' } } });
    const r2 = m._errorResponse(500, 'UNKNOWN_ERROR', 'oops');
    assert.deepStrictEqual(r2, { status: 500, error: { code: 'UNKNOWN_ERROR', message: 'oops' } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea por mensaje a codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(new Error('not found')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('unauthorized request')), 'PERMISSION_DENIED');
    assert.strictEqual(m._classifyHandlerError(new Error('already exists')), 'ALREADY_EXISTS');
    assert.strictEqual(m._classifyHandlerError(new Error('something exploded')), 'UNKNOWN_ERROR');
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
    assert.ok(typeof evs[1].correlation_id === 'string' && evs[1].correlation_id.length > 0);
    assert.ok(evs[0].timestamp && evs[1].timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError mapea status segun code y registra metric', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const err = Object.assign(new Error('not found'), { _code: 'RESOURCE_NOT_FOUND', _details: { e: 1 } });
    const r = m._handleHandlerError('test.failed', err, 'kind');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.deepStrictEqual(r.error.details, { e: 1 });
    const errMetrics = mocks.metricsCalls.filter(c => c[0] === 'increment' && c[1] === 'device-registry.errors');
    assert.ok(errMetrics.length >= 1);
    await m.onUnload();
  });

  await testAsync('_parsePayload: string JSON, Buffer JSON, object pass-through, malformado→null', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.deepStrictEqual(m._parsePayload('{"a":1}'), { a: 1 });
    assert.deepStrictEqual(m._parsePayload(Buffer.from('{"b":2}')), { b: 2 });
    assert.deepStrictEqual(m._parsePayload({ c: 3 }), { c: 3 });
    assert.strictEqual(m._parsePayload(Buffer.from('not-json'), 'birth'), null);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})();

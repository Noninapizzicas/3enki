/**
 * Tests unitarios — device-health (POC2 reescritura).
 * Ejecutar: node tests/unit/device-health.test.js
 */

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const os     = require('os');
const path   = require('path');
const fs     = require('fs');

const DeviceHealthModule = require('../../modules/device-health/index.js');

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
  };

  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

async function instantiate(mocks, opts = {}) {
  const m = new DeviceHealthModule();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhealth-test-'));
  await m.onLoad({
    logger:   mocks.logger,
    metrics:  mocks.metrics,
    eventBus: mocks.eventBus,
    config:   { 'device-health': {
      data_path:                 tmpDir,
      offline_threshold_min:     opts.offline_threshold_min     ?? 5,
      reconnect_loop_threshold:  opts.reconnect_loop_threshold  ?? 5,
      reconnect_loop_window_min: opts.reconnect_loop_window_min ?? 30,
      report_interval_min:       opts.report_interval_min       ?? 60
    } }
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
  console.log('device-health — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa estado limpio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'device-health');
    assert.strictEqual(m.version, '2.0.0');
    assert.strictEqual(m.deviceStates.size, 0);
    assert.strictEqual(m.alerts.length, 0);
    assert.strictEqual(m._offlineTimers.size, 0);
    assert.ok(m._reportTimer);
    await m.onUnload();
  });

  await testAsync('onUnload limpia timers + persiste + reset state runtime', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);

    await m.onDeviceOffline({ data: { device_id: 'dev-A', project_id: 'p1' } });
    assert.strictEqual(m._offlineTimers.size, 1);
    m._getOrCreateState('dev-A').last_online = '2024-01-01T00:00:00Z';
    m.alerts.push({ type: 'offline', device_id: 'dev-A', resolved: false });
    m.internalMetrics.alerts_total = 1;

    await m.onUnload();

    assert.strictEqual(m.deviceStates.size, 0);
    assert.strictEqual(m.alerts.length, 0);
    assert.strictEqual(m._offlineTimers.size, 0);
    assert.strictEqual(m.internalMetrics.alerts_total, 0);
    assert.strictEqual(m._reportTimer, null);

    const persisted = JSON.parse(fs.readFileSync(path.join(tmpDir, 'health-history.json'), 'utf8'));
    assert.strictEqual(persisted._version, '2.0.0');
    assert.ok(persisted.states['dev-A']);
    assert.strictEqual(persisted.alerts.length, 1);
  });

  await testAsync('onLoad rehidrata states y alerts desde disco', async () => {
    const mocks = makeMocks();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhealth-pre-'));
    fs.writeFileSync(path.join(tmpDir, 'health-history.json'), JSON.stringify({
      _version: '2.0.0',
      states: {
        'preload-1': {
          is_offline: false, last_online: '2024-01-01T00:00:00Z', last_offline: null,
          reconnections_24h: [], offline_periods: [], ota_history: []
        }
      },
      alerts: [{ type: 'offline', device_id: 'preload-1', message: 'x', resolved: false, timestamp: '2024-01-01T00:00:00Z' }]
    }));

    const m = new DeviceHealthModule();
    await m.onLoad({
      logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus,
      config: { 'device-health': { data_path: tmpDir } }
    });

    assert.strictEqual(m.deviceStates.size, 1);
    assert.strictEqual(m.alerts.length, 1);
    assert.strictEqual(m.deviceStates.get('preload-1').is_offline, false);
    await m.onUnload();
  });

  // ==========================================
  // Group 2: Validacion canonica de UI handlers
  // ==========================================

  await testAsync('handleDeviceHistory: device_id ausente → 400 INVALID_INPUT canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleDeviceHistory({});
    assert.ok(isCanonicalError(r), `shape incorrecto: ${JSON.stringify(r)}`);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'device_id');
    await m.onUnload();
  });

  await testAsync('handleDeviceHistory: device sin historial → 404 RESOURCE_NOT_FOUND canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleDeviceHistory({ device_id: 'fantasma' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(r.error.details.entity_type, 'device_health_state');
    await m.onUnload();
  });

  await testAsync('handleDashboard: sin devices → 200 con summary vacío + avg_uptime_pct=100', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleDashboard();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.summary.total, 0);
    assert.strictEqual(r.data.summary.avg_uptime_pct, 100);
    assert.deepStrictEqual(r.data.devices, []);
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Bus handlers + state transitions
  // ==========================================

  await testAsync('onDeviceOnline: crea state + actualiza last_online y reconnections_24h', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.onDeviceOnline({ data: { device_id: 'dev-1', project_id: 'p1' } });

    const s = m.deviceStates.get('dev-1');
    assert.ok(s);
    assert.strictEqual(s.is_offline, false);
    assert.ok(s.last_online);
    assert.strictEqual(s.reconnections_24h.length, 1);
    await m.onUnload();
  });

  await testAsync('onDeviceOffline: marca state offline + programa timer cancelable', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { offline_threshold_min: 99 });

    await m.onDeviceOffline({ data: { device_id: 'dev-2', project_id: 'p1' } });

    const s = m.deviceStates.get('dev-2');
    assert.strictEqual(s.is_offline, true);
    assert.ok(s.last_offline);
    assert.strictEqual(m._offlineTimers.has('dev-2'), true);

    await m.onDeviceOnline({ data: { device_id: 'dev-2', project_id: 'p1' } });
    assert.strictEqual(m._offlineTimers.has('dev-2'), false, 'volver online cancela el timer');
    await m.onUnload();
  });

  await testAsync('onDeviceOffline → onDeviceOnline registra offline_period', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { offline_threshold_min: 99 });

    await m.onDeviceOffline({ data: { device_id: 'dev-3' } });
    await new Promise(r => setTimeout(r, 5));
    await m.onDeviceOnline({ data: { device_id: 'dev-3' } });

    const s = m.deviceStates.get('dev-3');
    assert.strictEqual(s.offline_periods.length, 1);
    assert.ok(s.offline_periods[0].duration_ms > 0);
    assert.ok(s.offline_periods[0].from);
    assert.ok(s.offline_periods[0].to);
    await m.onUnload();
  });

  await testAsync('onDeviceOnline/Offline: device_id ausente → warn + metric, sin crash', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.onDeviceOnline({ data: {} });
    await m.onDeviceOffline({ data: {} });

    const warns = mocks.logs.filter(l => l[0] === 'warn' && /missing_device_id/.test(l[1]));
    assert.strictEqual(warns.length, 2);
    const errMetrics = mocks.metricsCalls.filter(c => c[0] === 'increment' && c[1] === 'device-health.errors');
    assert.ok(errMetrics.length >= 2);
    await m.onUnload();
  });

  await testAsync('onOtaFailed: emite health.alert.ota_failed con details + project_id top-level + correlation_id propagado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const cid = crypto.randomUUID();

    await m.onOtaFailed({ data: {
      device_id: 'dev-ota', project_id: 'p1',
      type: 'firmware', from: '1.0.0', to: '2.0.0', correlation_id: cid
    } });

    const alerts = publishedOf(mocks, 'health.alert.ota_failed');
    assert.strictEqual(alerts.length, 1);
    assert.strictEqual(alerts[0].device_id, 'dev-ota');
    assert.strictEqual(alerts[0].project_id, 'p1');
    assert.strictEqual(alerts[0].correlation_id, cid);
    assert.deepStrictEqual(alerts[0].details, { from: '1.0.0', to: '2.0.0', type: 'firmware' });
    assert.ok(alerts[0].timestamp);

    const s = m.deviceStates.get('dev-ota');
    assert.strictEqual(s.ota_history.length, 1);
    assert.strictEqual(s.ota_history[0].status, 'failed');
    await m.onUnload();
  });

  await testAsync('onOtaCompleted: registra historial sin emitir alerta', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.onOtaCompleted({ data: {
      device_id: 'dev-ota-ok', type: 'firmware', from: '1.0.0', to: '2.0.0'
    } });

    assert.strictEqual(publishedOf(mocks, 'health.alert.ota_failed').length, 0);
    const s = m.deviceStates.get('dev-ota-ok');
    assert.strictEqual(s.ota_history.length, 1);
    assert.strictEqual(s.ota_history[0].status, 'completed');
    await m.onUnload();
  });

  await testAsync('onOtaCompleted: ota_history capped a 20 (eviction FIFO sliding)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    for (let i = 0; i < 25; i++) {
      await m.onOtaCompleted({ data: { device_id: 'dev-cap', type: 'firmware', from: `${i}`, to: `${i+1}` } });
    }
    const s = m.deviceStates.get('dev-cap');
    assert.strictEqual(s.ota_history.length, 20);
    assert.strictEqual(s.ota_history[0].from, '5');
    assert.strictEqual(s.ota_history[19].from, '24');
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Reconnect-loop detection
  // ==========================================

  await testAsync('onDeviceOnline: reconnections >= threshold dentro de window → emite health.alert.reconnect_loop', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, {
      reconnect_loop_threshold: 3,
      reconnect_loop_window_min: 60
    });

    await m.onDeviceOnline({ data: { device_id: 'dev-loop', project_id: 'p1' } });
    await m.onDeviceOnline({ data: { device_id: 'dev-loop', project_id: 'p1' } });
    mocks.published.length = 0;
    await m.onDeviceOnline({ data: { device_id: 'dev-loop', project_id: 'p1' } });

    const alerts = publishedOf(mocks, 'health.alert.reconnect_loop');
    assert.strictEqual(alerts.length, 1);
    assert.strictEqual(alerts[0].device_id, 'dev-loop');
    assert.strictEqual(alerts[0].project_id, 'p1');
    assert.strictEqual(alerts[0].details.threshold, 3);
    assert.strictEqual(alerts[0].details.count, 3);
    assert.strictEqual(alerts[0].details.window_min, 60);
    await m.onUnload();
  });

  await testAsync('onDeviceOnline: reconnections fuera de window se descartan (no alert)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, {
      reconnect_loop_threshold: 3,
      reconnect_loop_window_min: 60
    });

    const state = m._getOrCreateState('dev-old');
    const oldTs = new Date(Date.now() - 90 * 60 * 1000).toISOString();
    state.reconnections_24h = [oldTs, oldTs];

    await m.onDeviceOnline({ data: { device_id: 'dev-old', project_id: 'p1' } });

    assert.strictEqual(publishedOf(mocks, 'health.alert.reconnect_loop').length, 0);
    await m.onUnload();
  });

  await testAsync('onDeviceOnline: reconnections >24h se purgan de reconnections_24h', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    const state = m._getOrCreateState('dev-purge');
    const veryOld = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    state.reconnections_24h = [veryOld, veryOld];

    await m.onDeviceOnline({ data: { device_id: 'dev-purge' } });

    const fresh = m.deviceStates.get('dev-purge').reconnections_24h;
    assert.strictEqual(fresh.length, 1);
    await m.onUnload();
  });

  // ==========================================
  // Group 5: Offline timer (alerta tras threshold)
  // ==========================================

  await testAsync('Offline > threshold → emite health.alert.offline (con timer corto)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { offline_threshold_min: 0.0005 });

    await m.onDeviceOffline({ data: { device_id: 'dev-off', project_id: 'p1', reason: 'lwt' } });
    await new Promise(r => setTimeout(r, 80));

    const alerts = publishedOf(mocks, 'health.alert.offline');
    assert.strictEqual(alerts.length, 1);
    assert.strictEqual(alerts[0].device_id, 'dev-off');
    assert.strictEqual(alerts[0].project_id, 'p1');
    assert.strictEqual(alerts[0].details.reason, 'lwt');
    assert.ok(alerts[0].correlation_id);
    await m.onUnload();
  });

  await testAsync('Offline + online antes del threshold → NO emite health.alert.offline', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { offline_threshold_min: 0.005 });

    await m.onDeviceOffline({ data: { device_id: 'dev-flap', project_id: 'p1' } });
    await new Promise(r => setTimeout(r, 30));
    await m.onDeviceOnline({ data: { device_id: 'dev-flap', project_id: 'p1' } });
    await new Promise(r => setTimeout(r, 350));

    assert.strictEqual(publishedOf(mocks, 'health.alert.offline').length, 0);
    await m.onUnload();
  });

  // ==========================================
  // Group 6: Dashboard / history / alerts UI + persistencia
  // ==========================================

  await testAsync('handleDashboard: calcula uptime% de devices online', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.onDeviceOnline({ data: { device_id: 'dev-up' } });

    const r = await m.handleDashboard();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.summary.total, 1);
    assert.strictEqual(r.data.summary.online, 1);
    assert.strictEqual(r.data.summary.offline, 0);
    assert.ok(r.data.devices[0].uptime_pct_24h >= 99);
    await m.onUnload();
  });

  await testAsync('handleDashboard: device offline → uptime descontado + consecutive_offline_min', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    const state = m._getOrCreateState('dev-down');
    state.is_offline   = true;
    state.last_offline = new Date(Date.now() - 6 * 60 * 1000).toISOString();

    const r = await m.handleDashboard();
    assert.strictEqual(r.data.summary.offline, 1);
    assert.strictEqual(r.data.devices[0].is_offline, true);
    assert.ok(r.data.devices[0].consecutive_offline_min >= 5);
    assert.ok(r.data.devices[0].uptime_pct_24h < 100);
    await m.onUnload();
  });

  await testAsync('handleDeviceHistory: devuelve shape canonico con todos los campos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onDeviceOnline({ data: { device_id: 'dev-hist' } });

    const r = await m.handleDeviceHistory({ device_id: 'dev-hist' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.device_id, 'dev-hist');
    assert.strictEqual(r.data.is_offline, false);
    assert.strictEqual(r.data.reconnections_24h, 1);
    assert.deepStrictEqual(r.data.offline_periods, []);
    assert.deepStrictEqual(r.data.ota_history, []);
    assert.deepStrictEqual(r.data.alerts, []);
    await m.onUnload();
  });

  await testAsync('handleAlerts: filtros componibles type / device_id / active_only / limit', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m._createAlert('offline', 'dev-A', 'p1', { message: 'A offline', details: {} });
    await m._createAlert('reconnect_loop', 'dev-B', 'p1', { message: 'B loop', details: {} });
    await m._createAlert('ota_failed', 'dev-A', 'p1', { message: 'A ota', details: {} });
    m.alerts[0].resolved = true;

    const all = await m.handleAlerts({});
    assert.strictEqual(all.data.total, 3);
    assert.strictEqual(all.data.active, 2);

    const onlyA = await m.handleAlerts({ device_id: 'dev-A' });
    assert.strictEqual(onlyA.data.total, 2);
    assert.ok(onlyA.data.alerts.every(a => a.device_id === 'dev-A'));

    const onlyOffline = await m.handleAlerts({ type: 'offline' });
    assert.strictEqual(onlyOffline.data.total, 1);

    const onlyActive = await m.handleAlerts({ active_only: true });
    assert.strictEqual(onlyActive.data.total, 2);
    assert.ok(onlyActive.data.alerts.every(a => !a.resolved));

    const capped = await m.handleAlerts({ limit: 1 });
    assert.strictEqual(capped.data.alerts.length, 1);
    await m.onUnload();
  });

  await testAsync('Alerts FIFO: > maxAlerts descarta los mas antiguos por pop()', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.maxAlerts = 5;

    for (let i = 0; i < 8; i++) {
      await m._createAlert('offline', `dev-${i}`, 'p1', { message: `m${i}`, details: {} });
    }
    assert.strictEqual(m.alerts.length, 5);
    assert.strictEqual(m.alerts[0].device_id, 'dev-7');
    assert.strictEqual(m.alerts[4].device_id, 'dev-3');
    await m.onUnload();
  });

  await testAsync('_createAlert: type fuera de KNOWN_ALERT_TYPES → warn + no publica + no cuenta', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m._createAlert('hacker_invented_type', 'dev-X', 'p1', { message: 'no debería publicar', details: {} });
    assert.strictEqual(m.alerts.length, 0);
    assert.strictEqual(mocks.published.filter(p => p[0].startsWith('health.alert')).length, 0);
    const warns = mocks.logs.filter(l => l[0] === 'warn' && /unknown_type/.test(l[1]));
    assert.strictEqual(warns.length, 1);
    await m.onUnload();
  });

  await testAsync('_publishReport: emite health.report con counts agregados + gauges de flota', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.onDeviceOnline({ data: { device_id: 'on-1' } });
    await m.onDeviceOnline({ data: { device_id: 'on-2' } });
    await m.onDeviceOffline({ data: { device_id: 'off-1' } });
    mocks.published.length = 0;
    mocks.metricsCalls.length = 0;

    await m._publishReport();

    const reports = publishedOf(mocks, 'health.report');
    assert.strictEqual(reports.length, 1);
    assert.strictEqual(reports[0].total_devices, 3);
    assert.strictEqual(reports[0].online, 2);
    assert.strictEqual(reports[0].offline, 1);
    assert.ok(reports[0].correlation_id);
    assert.ok(reports[0].timestamp);

    const onlineG  = mocks.metricsCalls.filter(c => c[0] === 'gauge' && c[1] === 'health.flota.online');
    const offlineG = mocks.metricsCalls.filter(c => c[0] === 'gauge' && c[1] === 'health.flota.offline');
    assert.ok(onlineG.length >= 1);
    assert.ok(offlineG.length >= 1);
    assert.strictEqual(onlineG[onlineG.length - 1][2], 2);
    assert.strictEqual(offlineG[offlineG.length - 1][2], 1);
    await m.onUnload();
  });

  await testAsync('Persistencia atomica: _saveHistory crea health-history.json (tmp+rename)', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);

    await m.onDeviceOnline({ data: { device_id: 'persist-1' } });
    await m._saveHistory();

    const filePath = path.join(tmpDir, 'health-history.json');
    assert.ok(fs.existsSync(filePath));
    const persisted = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.strictEqual(persisted._version, '2.0.0');
    assert.ok(persisted.states['persist-1']);
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
    assert.strictEqual(m._classifyHandlerError(new Error('already exists')), 'CONFLICT_STATE');
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
    const errMetrics = mocks.metricsCalls.filter(c => c[0] === 'increment' && c[1] === 'device-health.errors');
    assert.ok(errMetrics.length >= 1);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})();

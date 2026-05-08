/**
 * Tests unitarios — esp32-flasher (POC2).
 *
 * Ejecutar: node tests/unit/esp32-flasher.test.js
 */

'use strict';

const assert = require('assert');
const ESP32FlasherModule = require('../../modules/esp32-flasher/index.js');

function makeMocks(opts = {}) {
  const logs = [];
  const published = [];
  const metricsCalls = [];
  const mqttCalls = [];

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

  const mqtt = opts.mqttConnected !== false ? {
    isConnected: opts.mqttConnected !== false,
    on: () => {},
    removeListener: () => {},
    subscribe: async () => {},
    unsubscribe: async () => {},
    publish: async (topic, payload) => { mqttCalls.push([topic, payload]); }
  } : null;

  const eventBus = {
    publish: async (e, p) => { published.push([e, p]); },
    mqtt
  };

  return { logs, published, metricsCalls, mqttCalls, logger, metrics, eventBus };
}

async function instantiate(mocks) {
  const m = new ESP32FlasherModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
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
  console.log('esp32-flasher — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad inicializa estado limpio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'esp32-flasher');
    assert.strictEqual(m.version, '2.0.0');
    assert.strictEqual(m.activeFlashes.size, 0);
    assert.strictEqual(m.activeMonitors.size, 0);
    assert.strictEqual(m.flashHistory.length, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia maps + cancela procesos activos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const fakeProc = { killed: false, kill: function(_) { this.killed = true; } };
    m.activeFlashes.set('f1', { port: '/dev/ttyUSB0', process: fakeProc });
    m.activeMonitors.set('/dev/ttyUSB1', { process: { killed: false, kill: () => {} } });
    m.debugBuffers.set('dev1', { lines: ['x'], waiters: [() => {}] });
    await m.onUnload();
    assert.strictEqual(m.activeFlashes.size, 0);
    assert.strictEqual(m.activeMonitors.size, 0);
    assert.strictEqual(m.debugBuffers.size, 0);
  });

  await testAsync('onBuildCompleted guarda lastBuild para auto-suggest', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onBuildCompleted({
      data: {
        driver: 'mi-driver', board: 'esp32',
        binary_path: '/tmp/firmware.bin', binary_size: 12345
      }
    });
    assert.strictEqual(m.lastBuild.driver, 'mi-driver');
    assert.strictEqual(m.lastBuild.binary_path, '/tmp/firmware.bin');
    await m.onUnload();
  });

  // Group 2: Validacion canonica de handlers
  await testAsync('handleStart sin port devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleStart({ binary_path: '/tmp/x.bin' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'port');
    await m.onUnload();
  });

  await testAsync('handleStart sin binary_path devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleStart({ port: '/dev/ttyUSB0' });
    assert.strictEqual(r.error.details.field, 'binary_path');
    await m.onUnload();
  });

  await testAsync('handleStart con binary inexistente devuelve 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleStart({
      port: '/dev/ttyUSB0',
      binary_path: '/tmp/no-existe-' + Math.random() + '.bin'
    });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleCancel sin flash_id devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCancel({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('handleCancel con flash_id inexistente devuelve 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCancel({ flash_id: 'no-existe' });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleStatus con flash_id desconocido devuelve 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleStatus({ flash_id: 'fantasma' });
    assert.strictEqual(r.status, 404);
    await m.onUnload();
  });

  await testAsync('handleMonitorStart sin port devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleMonitorStart({});
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleMonitorStart con monitor activo devuelve 409 CONFLICT_STATE', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.activeMonitors.set('/dev/ttyUSB0', { process: { killed: false, kill: () => {} } });
    const r = await m.handleMonitorStart({ port: '/dev/ttyUSB0' });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'CONFLICT_STATE');
    await m.onUnload();
  });

  await testAsync('handleMonitorStop sin port devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleMonitorStop({});
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('handleMonitorStop sin monitor activo devuelve 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleMonitorStop({ port: '/dev/ttyUSB0' });
    assert.strictEqual(r.status, 404);
    await m.onUnload();
  });

  await testAsync('handleMonitorSend sin monitor devuelve 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleMonitorSend({ port: '/dev/ttyUSB0', data: 'hi' });
    assert.strictEqual(r.status, 404);
    await m.onUnload();
  });

  // Group 3: Status + history
  await testAsync('handleStatus sin filtro lista flashes activos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.activeFlashes.set('f1', {
      port: '/dev/ttyUSB0', method: 'esptool',
      started_at: new Date().toISOString(),
      progress: { stage: 'writing', percent: 50 }
    });
    const r = await m.handleStatus({});
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.count, 1);
    assert.strictEqual(r.data.active[0].flash_id, 'f1');
    await m.onUnload();
  });

  await testAsync('handleHistory devuelve historial con limit', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    for (let i = 0; i < 5; i++) {
      m._addHistory({
        flash_id: `f${i}`, port: '/dev/ttyUSB0', method: 'esptool',
        status: 'completed', timestamp: new Date().toISOString()
      });
    }
    const r = await m.handleHistory({ limit: 3 });
    assert.strictEqual(r.data.history.length, 3);
    assert.strictEqual(r.data.total, 5);
    await m.onUnload();
  });

  await testAsync('handleHistory filtra por port', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._addHistory({ flash_id: 'a', port: '/dev/ttyUSB0', status: 'completed' });
    m._addHistory({ flash_id: 'b', port: '/dev/ttyUSB1', status: 'completed' });
    const r = await m.handleHistory({ port: '/dev/ttyUSB0' });
    assert.strictEqual(r.data.history.length, 1);
    await m.onUnload();
  });

  // Group 4: Cancel publica flash.failed
  await testAsync('handleCancel kill proceso, mete entry en historial, publica flash.failed', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let killed = false;
    m.activeFlashes.set('f1', {
      flash_id: 'f1', port: '/dev/ttyUSB0', method: 'esptool',
      binary_path: '/tmp/x.bin',
      project_id: 'proj-flash',
      started_at: new Date().toISOString(),
      process: { killed: false, kill: function(_) { killed = true; this.killed = true; } }
    });
    const r = await m.handleCancel({ flash_id: 'f1' });
    assert.ok(killed);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.status, 'cancelled');
    assert.strictEqual(m.activeFlashes.size, 0);
    assert.strictEqual(m.flashHistory[0].status, 'cancelled');
    const failed = publishedOf(mocks, 'flash.failed');
    assert.strictEqual(failed.length, 1);
    assert.strictEqual(failed[0].project_id, 'proj-flash');
    assert.strictEqual(failed[0].error, 'cancelled');
    await m.onUnload();
  });

  // Group 5: Debug remoto MQTT
  await testAsync('handleDebugControl sin device devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleDebugControl({ project: 'p1' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleDebugControl publica MQTT y devuelve 200', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleDebugControl({ device: 'dev1', project: 'proj-1', enable: true });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.enable, true);
    assert.strictEqual(mocks.mqttCalls.length, 1);
    assert.strictEqual(mocks.mqttCalls[0][0], 'enki/proj-1/debug/dev1/control');
    await m.onUnload();
  });

  await testAsync('handleDebugControl sin MQTT devuelve 503 DEPENDENCY_UNAVAILABLE', async () => {
    const mocks = makeMocks({ mqttConnected: false });
    const { module: m } = await instantiate(mocks);
    const r = await m.handleDebugControl({ device: 'd', project: 'p', enable: true });
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.error.code, 'DEPENDENCY_UNAVAILABLE');
    await m.onUnload();
  });

  await testAsync('handleDebugStream con buffer pendiente devuelve inmediatamente', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.debugBuffers.set('dev1', { lines: ['linea1', 'linea2'], waiters: [] });
    const r = await m.handleDebugStream({ device: 'dev1' });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.data.lines, ['linea1', 'linea2']);
    assert.strictEqual(m.debugBuffers.get('dev1').lines.length, 0);
    await m.onUnload();
  });

  await testAsync('handleSerialRelay sin lines devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleSerialRelay({ port: 'cli' });
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('handleSerialRelay publica flash.serial_output por linea', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleSerialRelay({
      port: 'cli',
      device: 'dev1', project: 'proj-1',
      project_id: 'proj-1',
      lines: ['linea-a', 'linea-b']
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.relayed, 2);
    const evs = publishedOf(mocks, 'flash.serial_output');
    assert.strictEqual(evs.length, 2);
    assert.strictEqual(evs[0].project_id, 'proj-1');
    await m.onUnload();
  });

  // Group 6: Helpers internos
  await testAsync('_findPlatformioRoot encuentra platformio.ini subiendo el path', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    // Sin platformio.ini, devuelve null
    const result = m._findPlatformioRoot('/tmp/__no-existe__/sub/firmware.bin');
    assert.strictEqual(result, null);
    await m.onUnload();
  });

  await testAsync('_addHistory respeta max_history', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.config.max_history = 3;
    for (let i = 0; i < 5; i++) {
      m._addHistory({ flash_id: `f${i}` });
    }
    assert.strictEqual(m.flashHistory.length, 3);
    assert.strictEqual(m.flashHistory[0].flash_id, 'f4');
    await m.onUnload();
  });

  await testAsync('_generateId genera 12 chars hex', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const id = m._generateId();
    assert.match(id, /^[0-9a-f]{12}$/);
    await m.onUnload();
  });

  await testAsync('handleHealth devuelve shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealth();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.status, 'healthy');
    assert.strictEqual(r.data.version, '2.0.0');
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
    assert.deepStrictEqual(m._classifyHandlerError(new Error('timeout')), { status: 504, code: 'TIMEOUT' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('already in use')), { status: 409, code: 'CONFLICT_STATE' });
    assert.deepStrictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'EACCES' })), { status: 500, code: 'FILESYSTEM_ERROR' });
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

  await testAsync('_handleHandlerError emite metric esp32-flasher.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'));
    assert.strictEqual(r.status, 404);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'esp32-flasher.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });

/**
 * Tests unitarios — firmware-builder v2.0.0 (POC2 #20).
 *
 * Cobertura por capas (no por método):
 *  Group 1: Lifecycle (onLoad/onUnload sin leak).
 *  Group 2: Validación canónica de handlers (cada error path con código + status).
 *  Group 3: Success paths (respuestas con shape canónico { status, data }).
 *  Group 4: Tools shape (nunca devuelven valor pelado).
 *  Group 5: Driver scanner (detecta platformio.ini en tmpdir aislado).
 *  Group 6: handleBuild + activeBuilds + onUnload mata builds (mock spawn).
 *  Group 7: Helpers POC2 internos.
 *
 * Aislamiento: tmpdir único por instantiate() (firmware-builder-test-<rand>).
 *
 * Ejecutar: node tests/unit/firmware-builder.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const FirmwareBuilderModule = require('../../modules/firmware-builder/index.js');

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

function makeTmpFirmwareDir() {
  const dir = path.join(os.tmpdir(), `firmware-builder-test-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function rmDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

async function instantiate(mocks, opts = {}) {
  const tmpDir = opts.firmwarePath || makeTmpFirmwareDir();
  const m = new FirmwareBuilderModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    config: {
      'firmware-builder': {
        firmware_path: tmpDir,
        platformio_path: opts.platformio_path || '/nonexistent/platformio',
        build_timeout_ms: opts.build_timeout_ms || 60000,
        max_concurrent_builds: opts.max_concurrent_builds || 2
      }
    }
  });
  return { module: m, tmpDir };
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

function makePioDriverDir(tmpDir, driverName, opts = {}) {
  const drvPath = path.join(tmpDir, driverName);
  fs.mkdirSync(drvPath, { recursive: true });
  const board = opts.board || 'esp32-s3';
  const env = opts.env || board;
  fs.writeFileSync(path.join(drvPath, 'platformio.ini'),
    `[env:${env}]\nplatform = espressif32\nboard = ${board}\nframework = arduino\n`);
  if (opts.readme !== false) {
    fs.writeFileSync(path.join(drvPath, 'README.md'),
      `# ${driverName}\n\nDriver de prueba para tests unitarios.\n`);
  }
  if (opts.driverJson) {
    fs.writeFileSync(path.join(drvPath, 'driver.json'), JSON.stringify(opts.driverJson));
  }
  return drvPath;
}

// ==================================================
//                                                Tests
// ==================================================

(async () => {
  console.log('firmware-builder v2.0.0 — reescritura canonica (POC2 #20)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa estado limpio + gauges', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    assert.strictEqual(m.name, 'firmware-builder');
    assert.strictEqual(m.version, '2.0.0');
    assert.strictEqual(m.drivers.size, 0);
    assert.strictEqual(m.activeBuilds.size, 0);
    const gauges = mocks.metricsCalls.filter(c => c[0] === 'gauge');
    assert.ok(gauges.some(g => g[1] === 'firmware.drivers.count'));
    assert.ok(gauges.some(g => g[1] === 'firmware.active_builds.count'));
    await m.onUnload();
    rmDir(tmpDir);
  });

  await testAsync('onUnload limpia drivers Map + activeBuilds sin leak', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    makePioDriverDir(tmpDir, 'sample');
    await m.handleListDrivers();
    assert.strictEqual(m.drivers.size, 1);
    m.activeBuilds.set('fake-build', {
      started_at: new Date().toISOString(),
      log: [],
      process: { kill: () => {}, killed: false }
    });
    await m.onUnload();
    assert.strictEqual(m.drivers.size, 0);
    assert.strictEqual(m.activeBuilds.size, 0);
    rmDir(tmpDir);
  });

  await testAsync('onUnload mata builds activos con SIGTERM y loggea count una sola vez', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    let killCount = 0;
    m.activeBuilds.set('a', { started_at: new Date().toISOString(), log: [], process: { killed: false, kill: (sig) => { assert.strictEqual(sig, 'SIGTERM'); killCount++; } } });
    m.activeBuilds.set('b', { started_at: new Date().toISOString(), log: [], process: { killed: false, kill: () => { killCount++; } } });
    await m.onUnload();
    assert.strictEqual(killCount, 2);
    const killLogs = mocks.logs.filter(l => l[1] === 'firmware-builder.builds.killed_on_unload');
    assert.strictEqual(killLogs.length, 1, 'log debe ser post-loop, no per-iteración');
    assert.strictEqual(killLogs[0][2].count, 2);
    rmDir(tmpDir);
  });

  // ==========================================
  // Group 2: Validacion canonica de handlers
  // ==========================================

  await testAsync('handleBuild sin driver → 400 VALIDATION_FAILED canonico', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.handleBuild({});
    assert.ok(isCanonicalError(r), `expected canonical error, got ${JSON.stringify(r)}`);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'VALIDATION_FAILED');
    assert.strictEqual(r.error.details.field, 'driver');
    const incs = mocks.metricsCalls.filter(c => c[1] === 'firmware-builder.errors');
    assert.ok(incs.some(i => i[2].code === 'VALIDATION_FAILED'));
    await m.onUnload();
    rmDir(tmpDir);
  });

  await testAsync('handleBuild con driver inexistente → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.handleBuild({ driver: 'no-existe' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(r.error.details.entity_type, 'driver');
    assert.strictEqual(r.error.details.entity_id, 'no-existe');
    await m.onUnload();
    rmDir(tmpDir);
  });

  await testAsync('handleBuild con driver ya compilando → 409 CONFLICT_STATE', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    makePioDriverDir(tmpDir, 'sample');
    await m.handleListDrivers();
    m.activeBuilds.set('sample', { started_at: new Date().toISOString(), log: [], process: null });
    const r = await m.handleBuild({ driver: 'sample' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'CONFLICT_STATE');
    m.activeBuilds.clear();
    await m.onUnload();
    rmDir(tmpDir);
  });

  await testAsync('handleBuild con max concurrent alcanzado → 429 QUOTA_EXCEEDED', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks, { max_concurrent_builds: 1 });
    makePioDriverDir(tmpDir, 'd1');
    makePioDriverDir(tmpDir, 'd2');
    await m.handleListDrivers();
    m.activeBuilds.set('d1', { started_at: new Date().toISOString(), log: [], process: null });
    const r = await m.handleBuild({ driver: 'd2' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 429);
    assert.strictEqual(r.error.code, 'QUOTA_EXCEEDED');
    assert.strictEqual(r.error.details.max, 1);
    m.activeBuilds.clear();
    await m.onUnload();
    rmDir(tmpDir);
  });

  await testAsync('handleBuild con board no soportado → 400 VALIDATION_FAILED + valid list', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    makePioDriverDir(tmpDir, 'sample');
    await m.handleListDrivers();
    const r = await m.handleBuild({ driver: 'sample', board: 'pic18' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'VALIDATION_FAILED');
    assert.strictEqual(r.error.details.field, 'board');
    assert.ok(Array.isArray(r.error.details.valid));
    assert.ok(r.error.details.valid.includes('esp32dev'));
    await m.onUnload();
    rmDir(tmpDir);
  });

  await testAsync('handleBuildStatus con driver inexistente → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.handleBuildStatus({ driver: 'no-existe' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
    rmDir(tmpDir);
  });

  // ==========================================
  // Group 3: Success paths
  // ==========================================

  await testAsync('handleListBoards devuelve catalogo canonico { status: 200, data: { boards, total } }', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.handleListBoards();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(typeof r.data.total, 'number');
    assert.ok(r.data.total >= 5);
    assert.ok(r.data.boards.some(b => b.id === 'esp32dev'));
    assert.ok(r.data.boards.some(b => b.id === 'esp32-s3' && b.psram === true));
    await m.onUnload();
    rmDir(tmpDir);
  });

  await testAsync('handleListDrivers en tmpdir vacio → drivers: [], total: 0', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.handleListDrivers();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.total, 0);
    assert.deepStrictEqual(r.data.drivers, []);
    await m.onUnload();
    rmDir(tmpDir);
  });

  await testAsync('handleBuildStatus sin filtro → 200 con active_builds + count', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r = await m.handleBuildStatus({});
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.count, 0);
    assert.deepStrictEqual(r.data.active_builds, []);
    await m.onUnload();
    rmDir(tmpDir);
  });

  await testAsync('handleBuildStatus con driver conocido sin build → 200 status never', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    makePioDriverDir(tmpDir, 'sample');
    await m.handleListDrivers();
    const r = await m.handleBuildStatus({ driver: 'sample' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.driver, 'sample');
    assert.strictEqual(r.data.status, 'never');
    await m.onUnload();
    rmDir(tmpDir);
  });

  // ==========================================
  // Group 4: Tools shape (nunca valor pelado)
  // ==========================================

  await testAsync('todos los tool handlers devuelven shape canonico { status, data | error }', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    makePioDriverDir(tmpDir, 'sample');
    await m.handleListDrivers();

    const responses = [
      await m.handleListDrivers(),
      await m.handleListBoards(),
      await m.handleBuildStatus({}),
      await m.handleBuildStatus({ driver: 'sample' }),
      await m.handleBuild({}),
      await m.handleBuild({ driver: 'no-existe' })
    ];

    for (const r of responses) {
      assert.ok(typeof r.status === 'number', 'status debe ser numero');
      const ok = isCanonicalSuccess(r) || isCanonicalError(r);
      assert.ok(ok, `respuesta no canonica: ${JSON.stringify(r)}`);
    }
    await m.onUnload();
    rmDir(tmpDir);
  });

  // ==========================================
  // Group 5: Driver scanner
  // ==========================================

  await testAsync('_scanDrivers detecta subdirectorio con platformio.ini', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    makePioDriverDir(tmpDir, 'print-proxy', { board: 'esp32-s3', env: 'esp32-s3-devkit' });
    await m._scanDrivers();
    assert.strictEqual(m.drivers.size, 1);
    const drv = m.drivers.get('print-proxy');
    assert.strictEqual(drv.board, 'esp32-s3');
    assert.strictEqual(drv.buildEnv, 'esp32-s3-devkit');
    assert.ok(drv.description.length > 0);
    await m.onUnload();
    rmDir(tmpDir);
  });

  await testAsync('_scanDrivers ignora subdirectorios sin platformio.ini', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    fs.mkdirSync(path.join(tmpDir, 'no-pio'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'no-pio', 'README.md'), '# nothing here');
    await m._scanDrivers();
    assert.strictEqual(m.drivers.size, 0);
    await m.onUnload();
    rmDir(tmpDir);
  });

  await testAsync('_scanDrivers prioriza driver.json sobre README/platformio.ini para metadata', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    makePioDriverDir(tmpDir, 'gateway', {
      driverJson: { utility: 'WiFi Gateway', description: 'desc desde driver.json', capabilities: ['wifi', 'bt'] }
    });
    await m._scanDrivers();
    const drv = m.drivers.get('gateway');
    assert.strictEqual(drv.utility, 'WiFi Gateway');
    assert.strictEqual(drv.description, 'desc desde driver.json');
    assert.deepStrictEqual(drv.capabilities, ['wifi', 'bt']);
    await m.onUnload();
    rmDir(tmpDir);
  });

  await testAsync('_scanDrivers preserva last_build/last_build_status entre re-escaneos', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    makePioDriverDir(tmpDir, 'sample');
    await m._scanDrivers();
    const drv = m.drivers.get('sample');
    drv.last_build = '2026-04-30T12:00:00Z';
    drv.last_build_status = 'success';
    await m._scanDrivers();
    const drv2 = m.drivers.get('sample');
    assert.strictEqual(drv2.last_build, '2026-04-30T12:00:00Z');
    assert.strictEqual(drv2.last_build_status, 'success');
    await m.onUnload();
    rmDir(tmpDir);
  });

  // ==========================================
  // Group 6: handleBuild → activeBuilds + spawn (pseudo-mock)
  // ==========================================

  await testAsync('handleBuild con platformio inexistente publica firmware.build_failed con correlation_id', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks, { build_timeout_ms: 5000 });
    makePioDriverDir(tmpDir, 'sample');
    await m.handleListDrivers();

    const cid = 'cid-build-test-' + crypto.randomBytes(4).toString('hex');
    const r = await m.handleBuild({ driver: 'sample', correlation_id: cid });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 202);
    assert.strictEqual(r.data.status, 'building');
    assert.strictEqual(r.data.correlation_id, cid);

    // Esperar a que spawn falle (binario inexistente) y publish failed.
    await new Promise(res => setTimeout(res, 250));

    const started = publishedOf(mocks, 'firmware.build_started');
    const failed = publishedOf(mocks, 'firmware.build_failed');
    assert.ok(started.length >= 1, 'debe publicar firmware.build_started');
    assert.strictEqual(started[0].correlation_id, cid);
    assert.ok(started[0].timestamp);
    assert.ok(failed.length >= 1, 'debe publicar firmware.build_failed (spawn ENOENT)');
    assert.strictEqual(failed[0].correlation_id, cid);

    await m.onUnload();
    rmDir(tmpDir);
  });

  await testAsync('handleBuild sin correlation_id genera uno y lo propaga', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    makePioDriverDir(tmpDir, 'sample');
    await m.handleListDrivers();

    const r = await m.handleBuild({ driver: 'sample' });
    assert.ok(isCanonicalSuccess(r));
    assert.ok(typeof r.data.correlation_id === 'string');
    assert.ok(r.data.correlation_id.length > 0);

    await new Promise(res => setTimeout(res, 250));
    const started = publishedOf(mocks, 'firmware.build_started');
    assert.strictEqual(started[0].correlation_id, r.data.correlation_id);

    await m.onUnload();
    rmDir(tmpDir);
  });

  // ==========================================
  // Group 7: Helpers POC2
  // ==========================================

  await testAsync('_errorResponse construye shape canonico { status, error: { code, message, details? } }', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const r1 = m._errorResponse(400, 'VALIDATION_FAILED', 'msg', { field: 'x' });
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'VALIDATION_FAILED', message: 'msg', details: { field: 'x' } } });
    const r2 = m._errorResponse(500, 'INTERNAL_ERROR', 'oops');
    assert.deepStrictEqual(r2, { status: 500, error: { code: 'INTERNAL_ERROR', message: 'oops' } });
    await m.onUnload();
    rmDir(tmpDir);
  });

  await testAsync('_classifyHandlerError mapea por mensaje y errno a codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'ENOENT' })), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'EACCES' })), 'AUTHENTICATION_REQUIRED');
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'EEXIST' })), 'CONFLICT_STATE');
    assert.strictEqual(m._classifyHandlerError(new Error('Driver no encontrado')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'VALIDATION_FAILED');
    assert.strictEqual(m._classifyHandlerError(new Error('ya está compilando')), 'CONFLICT_STATE');
    assert.strictEqual(m._classifyHandlerError(new Error('máximo de builds')), 'QUOTA_EXCEEDED');
    assert.strictEqual(m._classifyHandlerError(new Error('something exploded')), 'INTERNAL_ERROR');
    await m.onUnload();
    rmDir(tmpDir);
  });

  await testAsync('_publicarEvento hereda correlation_id si se pasa, genera uno nuevo si no', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
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
    rmDir(tmpDir);
  });

  await testAsync('_handleHandlerError mapea status segun code y registra metric', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const err = Object.assign(new Error('not found'), { _code: 'RESOURCE_NOT_FOUND', _details: { e: 1 } });
    const r = m._handleHandlerError('test.failed', err, 'kind');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.deepStrictEqual(r.error.details, { e: 1 });
    const incs = mocks.metricsCalls.filter(c => c[1] === 'firmware-builder.errors');
    assert.ok(incs.some(i => i[2].kind === 'kind' && i[2].code === 'RESOURCE_NOT_FOUND'));
    await m.onUnload();
    rmDir(tmpDir);
  });

  await testAsync('_parseBoardFromIni extrae board y envName, tolera input vacio/no-string', async () => {
    const mocks = makeMocks();
    const { module: m, tmpDir } = await instantiate(mocks);
    const ini = '[env:foo]\nplatform = espressif32\nboard = esp32-s3\n';
    assert.deepStrictEqual(m._parseBoardFromIni(ini), { board: 'esp32-s3', envName: 'foo' });
    assert.deepStrictEqual(m._parseBoardFromIni(''), { board: null, envName: null });
    assert.deepStrictEqual(m._parseBoardFromIni(null), { board: null, envName: null });
    assert.deepStrictEqual(m._parseBoardFromIni('platform = espressif32'), { board: null, envName: null });
    await m.onUnload();
    rmDir(tmpDir);
  });

  console.log('\nTodos los tests pasaron.');
})();

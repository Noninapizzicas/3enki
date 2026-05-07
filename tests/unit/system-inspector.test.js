/**
 * Tests unitarios — system-inspector (POC2 reescritura, v2.0.0).
 *
 * Modulo dev-only que captura HTTP/MQTT/errores/logs en buffer circular y
 * persiste snapshot atomico a archivo JSON. NO publica al bus (recursion via
 * wildcards). Tests cubren: lifecycle, early-exit production, handlers HTTP
 * canonicos, buffer behavior, atomic file write, helpers POC2.
 *
 * Ejecutar: node tests/unit/system-inspector.test.js
 */

'use strict';

const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const SystemInspectorModule = require('../../modules/system-inspector/index.js');
const FileWriter            = require('../../modules/system-inspector/lib/file-writer.js');
const ConsoleBuffer         = require('../../modules/system-inspector/lib/console-buffer.js');

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
    // SIN .on / .subscribe — MqttInterceptor lo trata defensivamente.
  };

  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

function tmpFile(name = 'system-console.json') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sysinspector-test-'));
  return { dir, file: path.join(dir, name) };
}

async function instantiate(mocks, overrides = {}) {
  const m = new SystemInspectorModule();
  const { dir, file } = tmpFile();

  const moduleConfig = {
    buffer_size:       overrides.buffer_size       ?? 50,
    write_interval_ms: overrides.write_interval_ms ?? 99999,
    output_file:       overrides.output_file       ?? file,
    truncate_bodies:   overrides.truncate_bodies   ?? 200,
    force_in_production: overrides.force_in_production ?? false,
    capture: {
      http:       overrides.capture?.http       ?? false,
      mqtt:       overrides.capture?.mqtt       ?? false,
      errors:     overrides.capture?.errors     ?? false,
      logs:       overrides.capture?.logs       ?? false,
      validation: overrides.capture?.validation ?? false
    }
  };

  await m.onLoad({
    id:           'core-test',
    logger:       mocks.logger,
    metrics:      mocks.metrics,
    eventBus:     mocks.eventBus,
    moduleConfig
  });
  return { module: m, tmpDir: dir, tmpFile: file };
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

// ==================================================
//                                                Tests
// ==================================================

(async () => {
  console.log('system-inspector — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa estado limpio + buffer + version 2.0.0', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'system-inspector');
    assert.strictEqual(m.version, '2.0.0');
    assert.strictEqual(m.skipped, false);
    assert.ok(m.buffer, 'buffer debe estar inicializado');
    assert.ok(m.fileWriter, 'fileWriter debe estar inicializado');
    // Sin interceptores cuando capture.* esta off
    assert.strictEqual(m.httpInterceptor, null);
    assert.strictEqual(m.errorInterceptor, null);
    assert.strictEqual(m.mqttInterceptor, null);
    // Buffer arranca con la entrada de bienvenida
    assert.strictEqual(m.buffer.entries.length, 1);
    assert.strictEqual(m.buffer.entries[0].source, 'system-inspector');
    await m.onUnload();
  });

  await testAsync('onLoad early-exit en NODE_ENV=production sin force_in_production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const mocks = makeMocks();
      const { module: m } = await instantiate(mocks);
      assert.strictEqual(m.skipped, true);
      assert.strictEqual(m.buffer, null);
      assert.strictEqual(m.fileWriter, null);
      const skipLog = mocks.logs.find(l => l[0] === 'warn' && l[1] === 'system-inspector.skipped');
      assert.ok(skipLog, 'log de skip debe emitirse');
      assert.strictEqual(skipLog[2].reason, 'production environment');
      await m.onUnload();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  await testAsync('onLoad con NODE_ENV=production + force_in_production=true carga normal', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const mocks = makeMocks();
      const { module: m } = await instantiate(mocks, { force_in_production: true });
      assert.strictEqual(m.skipped, false);
      assert.ok(m.buffer);
      await m.onUnload();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  await testAsync('onUnload detiene fileWriter + limpia buffer + nullea componentes', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.buffer.error('test', 'sample error', {});
    assert.ok(m.buffer.entries.length >= 2);

    await m.onUnload();

    assert.strictEqual(m.buffer, null);
    assert.strictEqual(m.fileWriter, null);
    assert.strictEqual(m.httpInterceptor, null);
    assert.strictEqual(m.errorInterceptor, null);
    assert.strictEqual(m.mqttInterceptor, null);
  });

  await testAsync('onUnload tras skip (production) no revienta', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const mocks = makeMocks();
      const { module: m } = await instantiate(mocks);
      assert.strictEqual(m.skipped, true);
      // No debe lanzar aunque buffer / fileWriter sean null
      await m.onUnload();
      assert.strictEqual(m.buffer, null);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  // ==========================================
  // Group 2: HTTP handlers — shape canonico
  // ==========================================

  await testAsync('handleGetStatus: 200 con _meta + summary + recent_errors + console', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.buffer.error('mod-x', 'algo malo', { reason: 'test' });
    m.buffer.network('GET', '/api/foo', 200, 12);

    const r = await m.handleGetStatus({}, { correlationId: 'cid-1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.ok(r.data._meta);
    assert.strictEqual(r.data._meta.core_id, 'core-test');
    assert.ok(r.data.summary);
    assert.ok(Array.isArray(r.data.recent_errors));
    assert.ok(Array.isArray(r.data.console));
    assert.strictEqual(r.data.summary.errors, 1);
    assert.strictEqual(r.data.summary.network_requests, 1);

    // Counter de exito incrementado
    const incs = mocks.metricsCalls.filter(c => c[0] === 'increment' && c[1] === 'system-inspector.api.status.ok');
    assert.strictEqual(incs.length, 1);
    // Gauges actualizados
    const gauges = mocks.metricsCalls.filter(c => c[0] === 'gauge' && c[1] === 'system-inspector.buffer.size');
    assert.ok(gauges.length >= 1);
    await m.onUnload();
  });

  await testAsync('handleGetErrors: 200 con count + errors array', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.buffer.error('a', 'err1', {});
    m.buffer.error('b', 'err2', {});
    m.buffer.info('c', 'info', {});

    const r = await m.handleGetErrors({}, {});
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.count, 2);
    assert.strictEqual(r.data.errors.length, 2);
    assert.ok(r.data.generated_at);
    await m.onUnload();
  });

  await testAsync('handleGetNetwork: 200 con count + requests array', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.buffer.network('GET', '/a', 200, 10);
    m.buffer.network('POST', '/b', 500, 30);

    const r = await m.handleGetNetwork({}, {});
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.count, 2);
    assert.strictEqual(r.data.requests.length, 2);
    assert.ok(r.data.requests.some(req => req.path === '/b' && req.status === 500));
    await m.onUnload();
  });

  await testAsync('handleClear: 200 con entries_cleared + buffer vacio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.buffer.error('x', 'boom', {});
    m.buffer.network('GET', '/y', 200, 5);
    const before = m.buffer.entries.length;
    assert.ok(before >= 3);

    const r = await m.handleClear({}, { correlationId: 'cid-clear' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.success, true);
    assert.strictEqual(r.data.entries_cleared, before);
    assert.strictEqual(m.buffer.entries.length, 0);

    const warns = mocks.logs.filter(l => l[0] === 'warn' && l[1] === 'system-inspector.buffer.cleared');
    assert.strictEqual(warns.length, 1);
    assert.strictEqual(warns[0][2].correlation_id, 'cid-clear');
    await m.onUnload();
  });

  await testAsync('handlers devuelven 503 NOT_INITIALIZED cuando skipped (production sin force)', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const mocks = makeMocks();
      const { module: m } = await instantiate(mocks);
      assert.strictEqual(m.skipped, true);

      const r1 = await m.handleGetStatus({}, {});
      assert.ok(isCanonicalError(r1));
      assert.strictEqual(r1.status, 503);
      assert.strictEqual(r1.error.code, 'NOT_INITIALIZED');

      const r2 = await m.handleGetErrors({}, {});
      assert.strictEqual(r2.error.code, 'NOT_INITIALIZED');
      const r3 = await m.handleGetNetwork({}, {});
      assert.strictEqual(r3.error.code, 'NOT_INITIALIZED');
      const r4 = await m.handleClear({}, {});
      assert.strictEqual(r4.error.code, 'NOT_INITIALIZED');
      await m.onUnload();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  await testAsync('handler que tira: _handleHandlerError devuelve { status 500, error.code INTERNAL_ERROR }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    // Forzar throw en handler patcheando getFullState
    const original = m.buffer.getFullState.bind(m.buffer);
    m.buffer.getFullState = () => { throw new Error('explosion interna'); };

    const r = await m.handleGetStatus({}, { correlationId: 'cid-err' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 500);
    assert.strictEqual(r.error.code, 'INTERNAL_ERROR');
    const errLogs = mocks.logs.filter(l => l[0] === 'error' && l[1] === 'system-inspector.api.status.failed');
    assert.strictEqual(errLogs.length, 1);
    assert.strictEqual(errLogs[0][2].correlation_id, 'cid-err');

    m.buffer.getFullState = original;
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Buffer behavior (FIFO + getFullState)
  // ==========================================

  await testAsync('buffer.add respeta maxSize (FIFO con pop)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { buffer_size: 5 });
    // Welcome entry ya cuenta como 1
    for (let i = 0; i < 10; i++) {
      m.buffer.info('test', `entry ${i}`, {});
    }
    assert.strictEqual(m.buffer.entries.length, 5);
    // mas reciente al frente
    assert.ok(m.buffer.entries[0].message.includes('entry 9'));
    await m.onUnload();
  });

  await testAsync('buffer.getFullState incluye core_id + uptime + entries_count', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await new Promise(r => setTimeout(r, 5));
    const state = m.buffer.getFullState('core-test', m.startTime);
    assert.strictEqual(state._meta.core_id, 'core-test');
    assert.ok(state._meta.uptime_seconds >= 0);
    assert.strictEqual(state._meta.entries_count, m.buffer.entries.length);
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Atomic file write (lib/file-writer.js)
  // ==========================================

  await testAsync('FileWriter: tmp+rename atomico crea archivo JSON valido', async () => {
    const buffer = new ConsoleBuffer({ maxSize: 10, truncateAt: 100 });
    buffer.info('test', 'hola', {});
    const { dir, file } = tmpFile();
    const errors = [];

    const writer = new FileWriter({
      buffer,
      filePath:   file,
      intervalMs: 99999,
      coreId:     'core-fw',
      startTime:  Date.now(),
      onError:    (lvl, ev, p) => errors.push([lvl, ev, p])
    });
    writer.start();
    // start() ya hace primer write, esperar a que termine
    await new Promise(r => setTimeout(r, 30));
    writer.stop();
    await new Promise(r => setTimeout(r, 30));

    assert.ok(fs.existsSync(file));
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(json._meta.core_id, 'core-fw');
    assert.ok(Array.isArray(json.console));
    assert.strictEqual(errors.length, 0, 'no errores reportados');

    // Archivo .tmp debe haber sido renombrado y NO existir
    assert.strictEqual(fs.existsSync(`${file}.tmp`), false);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  await testAsync('FileWriter: error de I/O reporta via onError sin crashear', async () => {
    const buffer = new ConsoleBuffer({ maxSize: 10, truncateAt: 100 });
    const { dir, file } = tmpFile();
    const errors = [];

    const writer = new FileWriter({
      buffer,
      filePath:   file,
      intervalMs: 99999,
      coreId:     'core-fw-err',
      startTime:  Date.now(),
      onError:    (lvl, ev, p) => errors.push([lvl, ev, p])
    });

    // Forzar error en writeFile via monkey-patch
    const origWrite = fs.promises.writeFile;
    fs.promises.writeFile = async () => { throw new Error('EACCES forced'); };
    try {
      await writer._write();
    } finally {
      fs.promises.writeFile = origWrite;
    }

    assert.ok(errors.length >= 1, 'al menos un error reportado');
    const ev = errors[0];
    assert.strictEqual(ev[0], 'error');
    assert.strictEqual(ev[1], 'system-inspector.file_writer.write_failed');
    assert.match(ev[2].error, /EACCES forced/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await testAsync('FileWriter: errores repetidos con misma signature solo se reportan una vez', async () => {
    const buffer = new ConsoleBuffer({ maxSize: 10, truncateAt: 100 });
    const { dir, file } = tmpFile();
    const errors = [];
    const writer = new FileWriter({
      buffer,
      filePath:   file,
      intervalMs: 99999,
      coreId:     'core',
      startTime:  Date.now(),
      onError:    (lvl, ev, p) => errors.push([lvl, ev, p])
    });

    const origWrite = fs.promises.writeFile;
    fs.promises.writeFile = async () => { throw new Error('mismo mensaje'); };
    try {
      await writer._write();
      await writer._write();
      await writer._write();
    } finally {
      fs.promises.writeFile = origWrite;
    }

    const writeErrors = errors.filter(e => e[1].includes('file_writer'));
    assert.strictEqual(writeErrors.length, 1, `mismo error.message dedupea, hubo ${writeErrors.length}`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // ==========================================
  // Group 5: Invariante — modulo NO publica al bus (recursion)
  // ==========================================

  await testAsync('Invariante: tras flujo completo de handlers, eventBus.publish NUNCA se llama', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.buffer.error('x', 'err', {});
    m.buffer.network('GET', '/y', 200, 5);

    await m.handleGetStatus({}, {});
    await m.handleGetErrors({}, {});
    await m.handleGetNetwork({}, {});
    await m.handleClear({}, {});

    assert.strictEqual(mocks.published.length, 0, 'el modulo NO debe publicar al bus (recursion via wildcards)');
    await m.onUnload();
  });

  // ==========================================
  // Group 6: Logger proxy (lib decoupling)
  // ==========================================

  await testAsync('_buildLogProxy enruta al logger del modulo sin lanzar si nivel desconocido', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const proxy = m._buildLogProxy();

    proxy('error', 'system-inspector.lib.boom', { foo: 1 });
    proxy('debug', 'system-inspector.lib.dbg',  { foo: 2 });
    // nivel desconocido debe usar warn como fallback (definido en _buildLogProxy)
    proxy('quux',  'system-inspector.lib.unk',  { foo: 3 });

    const errs = mocks.logs.filter(l => l[1] === 'system-inspector.lib.boom');
    const dbgs = mocks.logs.filter(l => l[1] === 'system-inspector.lib.dbg');
    const warns = mocks.logs.filter(l => l[1] === 'system-inspector.lib.unk');
    assert.strictEqual(errs.length,  1);
    assert.strictEqual(dbgs.length,  1);
    assert.strictEqual(warns.length, 1);
    await m.onUnload();
  });

  await testAsync('_buildLogProxy nunca lanza aunque el logger reviente', async () => {
    const m = new SystemInspectorModule();
    m.logger = {
      error: () => { throw new Error('logger explotado'); },
      warn:  () => { throw new Error('logger explotado'); }
    };
    const proxy = m._buildLogProxy();
    // No debe propagar
    proxy('error', 'evento', {});
    proxy('warn',  'evento', {});
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
    assert.strictEqual(m._classifyHandlerError(new Error('not found')),         'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'VALIDATION_FAILED');
    assert.strictEqual(m._classifyHandlerError(new Error('unauthorized x')),    'AUTHORIZATION_REQUIRED');
    assert.strictEqual(m._classifyHandlerError(new Error('already exists')),    'CONFLICT');
    assert.strictEqual(m._classifyHandlerError(new Error('not initialized')),   'NOT_INITIALIZED');
    assert.strictEqual(m._classifyHandlerError(new Error('something exploded')), 'INTERNAL_ERROR');
    await m.onUnload();
  });

  await testAsync('_publicarEvento hereda correlation_id si se pasa, genera uno nuevo si no', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { foo: 1 }, { correlation_id: 'cid-inherit' });
    await m._publicarEvento('test.event', { bar: 2 });
    const evs = mocks.published.filter(p => p[0] === 'test.event').map(p => p[1]);
    assert.strictEqual(evs.length, 2);
    assert.strictEqual(evs[0].correlation_id, 'cid-inherit');
    assert.notStrictEqual(evs[1].correlation_id, 'cid-inherit');
    assert.ok(typeof evs[1].correlation_id === 'string' && evs[1].correlation_id.length > 0);
    assert.ok(evs[0].timestamp && evs[1].timestamp);
    await m.onUnload();
  });

  await testAsync('_publicarEvento es no-op cuando eventBus no tiene publish', async () => {
    const m = new SystemInspectorModule();
    m.logger = { info: () => {}, warn: () => {}, error: () => {} };
    m.eventBus = null;
    // No debe lanzar
    await m._publicarEvento('test.event', { foo: 1 });
  });

  await testAsync('_handleHandlerError mapea status segun code y registra metric en error', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    const e404 = Object.assign(new Error('not found'), { _code: 'RESOURCE_NOT_FOUND', _details: { e: 1 } });
    const r404 = m._handleHandlerError('test.failed', e404, 'kind', { correlationId: 'cid' });
    assert.strictEqual(r404.status, 404);
    assert.strictEqual(r404.error.code, 'RESOURCE_NOT_FOUND');
    assert.deepStrictEqual(r404.error.details, { e: 1 });

    const e503 = Object.assign(new Error('not initialized'), { _code: 'NOT_INITIALIZED' });
    const r503 = m._handleHandlerError('test.failed', e503, 'kind', {});
    assert.strictEqual(r503.status, 503);

    // Counter incrementado por cada error
    const incs = mocks.metricsCalls.filter(c =>
      c[0] === 'increment' && c[1] === 'system-inspector.errors.total'
    );
    assert.ok(incs.length >= 2);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})();

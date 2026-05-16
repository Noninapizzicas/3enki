/**
 * Tests unitarios — facturacion__fuentes (POC2 reescritura).
 *
 * Cubre 7 grupos:
 *   1. Lifecycle
 *   2. Validacion canonica de handlers
 *   3. Strategy dispatch (telegram subscribers)
 *   4. Gmail check (pull on-demand)
 *   5. UI handlers
 *   6. factura.entrada publish con correlation_id + project_id top-level
 *   7. Helpers POC2
 *
 * Ejecutar: node tests/unit/facturacion__fuentes.test.js
 */

'use strict';

const assert = require('assert');

const FuentesModule = require('../../modules/facturacion/fuentes/index.js');

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
    increment: (n, l) => metricsCalls.push(['increment', n, l])
  };

  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); }
  };

  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

async function instantiate(mocks, opts = {}) {
  const m = new FuentesModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    moduleConfig: opts.config || {}
  });
  if (opts.servicesMock) {
    m.services = { call: opts.servicesMock };
  }
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
  console.log('facturacion__fuentes — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa estado limpio + strategies registradas', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'fuentes');
    assert.strictEqual(m.version, '2.0.0');
    assert.ok(m.strategies.telegram);
    assert.ok(m.strategies.gmail);
    assert.strictEqual(m.projectConfigs.size, 0);
    await m.onUnload();
  });

  await testAsync('onLoad inyecta modulo en strategies via init()', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.strategies.telegram.modulo, m);
    assert.strictEqual(m.strategies.gmail.modulo, m);
    await m.onUnload();
  });

  await testAsync('onUnload limpia projectConfigs + strategies', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.projectConfigs.set('p1', { fuentes: {} });
    m.strategies.telegram.pendingDownloads.add('file-leak');
    await m.onUnload();
    assert.strictEqual(m.projectConfigs.size, 0);
    assert.strictEqual(m.strategies.telegram.pendingDownloads.size, 0);
  });

  // ==========================================
  // Group 2: Validacion canonica de handlers
  // ==========================================

  await testAsync('handleGetConfig sin proyecto devuelve 400 INVALID_INPUT canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetConfig({});
    assert.ok(isCanonicalError(r), 'shape canonico');
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleSaveConfig sin proyecto devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleSaveConfig({ fuentes: { telegram: { enabled: true } } });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleSaveConfig sin fuentes devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleSaveConfig({ proyecto: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleCheckGmail sin proyecto devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCheckGmail({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Strategy dispatch (telegram subscribers)
  // ==========================================

  await testAsync('onTelegramPhoto sin botName ni fileId no falla y no emite', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onTelegramPhoto({ data: {} });
    assert.strictEqual(publishedOf(mocks, 'factura.entrada').length, 0);
    await m.onUnload();
  });

  await testAsync('onTelegramPhoto con bot resuelto + descarga ok emite factura.entrada', async () => {
    const mocks = makeMocks();
    const servicesMock = async (modulo, action, params) => {
      if (modulo === 'channel-manager' && action === 'resolve') {
        return { data: { found: true, project_id: 'pizzepos-1' } };
      }
      if (modulo === 'telegram' && action === 'get_file') {
        return { data: { success: true, localPath: '/tmp/photo.jpg' } };
      }
      throw new Error(`unexpected service call: ${modulo}.${action}`);
    };
    const { module: m } = await instantiate(mocks, { servicesMock });
    await m.onTelegramPhoto({
      data: {
        botName: 'mi-bot', chatId: 123, from: { id: 1, username: 'u' },
        fileId: 'F1', caption: 'pdf', correlation_id: 'cid-photo'
      }
    });
    const ev = publishedOf(mocks, 'factura.entrada');
    assert.strictEqual(ev.length, 1);
    assert.strictEqual(ev[0].source, 'telegram');
    assert.strictEqual(ev[0].projectId, 'pizzepos-1');
    assert.strictEqual(ev[0].project_id, 'pizzepos-1');
    assert.strictEqual(ev[0].filePath, '/tmp/photo.jpg');
    assert.strictEqual(ev[0].correlation_id, 'cid-photo');
    assert.ok(ev[0].timestamp);
    assert.strictEqual(ev[0].origen.botName, 'mi-bot');
    await m.onUnload();
  });

  await testAsync('onTelegramPhoto bot sin proyecto -> log debug y no emite', async () => {
    const mocks = makeMocks();
    const servicesMock = async (modulo) => {
      if (modulo === 'channel-manager') return { data: { found: false } };
      throw new Error('no debe llamar a otros servicios');
    };
    const { module: m } = await instantiate(mocks, { servicesMock });
    await m.onTelegramPhoto({ data: { botName: 'unknown', fileId: 'F1' } });
    assert.strictEqual(publishedOf(mocks, 'factura.entrada').length, 0);
    assert.ok(mocks.logs.some(l => l[1] === 'fuentes.telegram.bot-sin-proyecto'));
    await m.onUnload();
  });

  await testAsync('onTelegramDocument filtra MIME no permitido sin emitir', async () => {
    const mocks = makeMocks();
    const servicesMock = async () => { throw new Error('no debe llamar'); };
    const { module: m } = await instantiate(mocks, { servicesMock });
    await m.onTelegramDocument({
      data: { botName: 'b', fileId: 'F2', mimeType: 'application/zip', fileName: 'x.zip' }
    });
    assert.strictEqual(publishedOf(mocks, 'factura.entrada').length, 0);
    assert.ok(mocks.logs.some(l => l[1] === 'fuentes.telegram.tipo-no-soportado'));
    await m.onUnload();
  });

  await testAsync('onTelegramDocument con PDF descarga y emite factura.entrada', async () => {
    const mocks = makeMocks();
    const servicesMock = async (modulo, action) => {
      if (modulo === 'channel-manager') return { data: { found: true, project_id: 'p2' } };
      if (modulo === 'telegram' && action === 'get_file') {
        return { data: { success: true, localPath: '/tmp/doc.pdf' } };
      }
      throw new Error(`unexpected: ${modulo}.${action}`);
    };
    const { module: m } = await instantiate(mocks, { servicesMock });
    await m.onTelegramDocument({
      data: {
        botName: 'b', chatId: 9, from: {},
        fileId: 'F3', fileName: 'factura.pdf', mimeType: 'application/pdf'
      }
    });
    const ev = publishedOf(mocks, 'factura.entrada');
    assert.strictEqual(ev.length, 1);
    assert.strictEqual(ev[0].filePath, '/tmp/doc.pdf');
    assert.strictEqual(ev[0].origen.fileName, 'factura.pdf');
    await m.onUnload();
  });

  await testAsync('dedup pendingDownloads: 2 eventos con mismo fileId -> 1 sola emision', async () => {
    const mocks = makeMocks();
    let resolveFirst;
    const firstReady = new Promise(r => { resolveFirst = r; });
    let calls = 0;
    const servicesMock = async (modulo, action) => {
      if (modulo === 'channel-manager') return { data: { found: true, project_id: 'p1' } };
      if (modulo === 'telegram' && action === 'get_file') {
        calls++;
        await firstReady;
        return { data: { success: true, localPath: '/tmp/p.jpg' } };
      }
      throw new Error('unexpected');
    };
    const { module: m } = await instantiate(mocks, { servicesMock });
    const p1 = m.onTelegramPhoto({ data: { botName: 'b', fileId: 'DUPE' } });
    const p2 = m.onTelegramPhoto({ data: { botName: 'b', fileId: 'DUPE' } });
    resolveFirst();
    await Promise.all([p1, p2]);
    assert.strictEqual(calls, 1, 'solo 1 descarga in-flight');
    assert.strictEqual(publishedOf(mocks, 'factura.entrada').length, 1);
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Gmail check (pull on-demand)
  // ==========================================

  await testAsync('checkAndProcess sin config retorna sin tocar gmail', async () => {
    const mocks = makeMocks();
    const servicesMock = async (modulo, action) => {
      if (modulo === 'local.project-config') return { data: { fuentes: {} } };
      throw new Error(`no debe llamar: ${modulo}.${action}`);
    };
    const { module: m } = await instantiate(mocks, { servicesMock });
    const r = await m.strategies.gmail.checkAndProcess('p1');
    assert.strictEqual(r.processed, 0);
    assert.ok(/no configurado/i.test(r.error));
    await m.onUnload();
  });

  await testAsync('checkAndProcess sin correos retorna processed=0 sin emitir', async () => {
    const mocks = makeMocks();
    const servicesMock = async (modulo, action) => {
      if (modulo === 'local.project-config') {
        return { data: { fuentes: { gmail: { enabled: true, account: 'x@y' } } } };
      }
      if (modulo === 'local.gmail' && action === 'search') {
        return { data: { messages: [] } };
      }
      throw new Error(`unexpected: ${modulo}.${action}`);
    };
    const { module: m } = await instantiate(mocks, { servicesMock });
    const r = await m.strategies.gmail.checkAndProcess('p1');
    assert.strictEqual(r.processed, 0);
    assert.strictEqual(r.errors, 0);
    assert.strictEqual(publishedOf(mocks, 'factura.entrada').length, 0);
    await m.onUnload();
  });

  // ==========================================
  // Group 5: UI handlers
  // ==========================================

  await testAsync('handleStatus devuelve shape canonico con strategies', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleStatus({});
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.strategies.telegram);
    assert.ok(r.data.strategies.gmail);
    assert.strictEqual(typeof r.data.projectConfigs, 'number');
    await m.onUnload();
  });

  await testAsync('handleGetConfig con proyecto sin cache lazy-load via service', async () => {
    const mocks = makeMocks();
    const servicesMock = async (modulo, action) => {
      if (modulo === 'local.project-config' && action === 'get') {
        return { data: { fuentes: { telegram: { enabled: true, botName: 'b' } } } };
      }
      throw new Error(`unexpected: ${modulo}.${action}`);
    };
    const { module: m } = await instantiate(mocks, { servicesMock });
    const r = await m.handleGetConfig({ proyecto: 'p1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.proyecto, 'p1');
    assert.deepStrictEqual(r.data.fuentes.telegram, { enabled: true, botName: 'b' });
    assert.ok(r.data.strategies.telegram.configured);
    assert.ok(!r.data.strategies.gmail.configured);
    await m.onUnload();
  });

  await testAsync('handleSaveConfig persiste via service y actualiza cache', async () => {
    const mocks = makeMocks();
    let savedPayload = null;
    const servicesMock = async (modulo, action, params) => {
      if (modulo === 'local.project-config' && action === 'set') {
        savedPayload = params;
        return { data: { ok: true } };
      }
      throw new Error(`unexpected: ${modulo}.${action}`);
    };
    const { module: m } = await instantiate(mocks, { servicesMock });
    const fuentes = { gmail: { enabled: true, account: 'x@y' } };
    const r = await m.handleSaveConfig({ proyecto: 'p1', fuentes });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.saved, true);
    assert.strictEqual(savedPayload.project_id, 'p1');
    assert.strictEqual(savedPayload.key, 'fuentes');
    assert.deepStrictEqual(savedPayload.value, fuentes);
    assert.deepStrictEqual(m.projectConfigs.get('p1').fuentes, fuentes);
    await m.onUnload();
  });

  await testAsync('handleHealth devuelve shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealth({});
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.module, 'fuentes');
    assert.strictEqual(r.data.version, '2.0.0');
    assert.ok(r.data.strategies);
    await m.onUnload();
  });

  // ==========================================
  // Group 6: factura.entrada publish con correlation_id + project_id top-level
  // ==========================================

  await testAsync('emitFacturaEntrada anyade correlation_id, project_id top-level y timestamp', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.emitFacturaEntrada({
      projectId: 'p1', filePath: '/tmp/x.jpg', source: 'telegram',
      origen: { botName: 'b' }, correlation_id: 'cid-9'
    });
    const ev = publishedOf(mocks, 'factura.entrada')[0];
    assert.strictEqual(ev.correlation_id, 'cid-9');
    assert.strictEqual(ev.project_id, 'p1');
    assert.strictEqual(ev.projectId, 'p1');
    assert.ok(ev.timestamp);
    assert.strictEqual(ev.source, 'telegram');
  });

  await testAsync('emitFacturaEntrada incrementa metric fuentes.factura.entrada.emitida', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.emitFacturaEntrada({
      projectId: 'p1', filePath: '/tmp/x.jpg', source: 'gmail',
      origen: {}, correlation_id: null
    });
    assert.ok(mocks.metricsCalls.some(c =>
      c[0] === 'increment' && c[1] === 'fuentes.factura.entrada.emitida' && c[2]?.source === 'gmail'
    ));
    await m.onUnload();
  });

  // ==========================================
  // Group 7: Helpers POC2
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
    assert.deepStrictEqual(m._classifyHandlerError(new Error('not found')), { status: 404, code: 'RESOURCE_NOT_FOUND' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('field is required')), { status: 400, code: 'INVALID_INPUT' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('timeout while calling api')), { status: 504, code: 'TIMEOUT' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('something exploded')), { status: 500, code: 'UNKNOWN_ERROR' });
    const enoent = Object.assign(new Error('file gone'), { code: 'ENOENT' });
    assert.deepStrictEqual(m._classifyHandlerError(enoent), { status: 404, code: 'RESOURCE_NOT_FOUND' });
    await m.onUnload();
  });

  await testAsync('_publicarEvento hereda correlation_id de payload, fallback a sourcePayload, anyade timestamp', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { foo: 1, correlation_id: 'cid-payload' }, { correlation_id: 'cid-source' });
    await m._publicarEvento('test.event', { bar: 2 }, { correlation_id: 'cid-source-only' });
    await m._publicarEvento('test.event', { baz: 3 });
    const evs = publishedOf(mocks, 'test.event');
    assert.strictEqual(evs[0].correlation_id, 'cid-payload');
    assert.strictEqual(evs[1].correlation_id, 'cid-source-only');
    assert.strictEqual(evs[2].correlation_id, null);
    assert.ok(evs[0].timestamp && evs[1].timestamp && evs[2].timestamp);
    await m.onUnload();
  });

  await testAsync('_publicarEvento promueve project_id top-level desde projectId', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { projectId: 'p7', foo: 1 });
    const ev = publishedOf(mocks, 'test.event')[0];
    assert.strictEqual(ev.project_id, 'p7');
    assert.strictEqual(ev.projectId, 'p7');
    await m.onUnload();
  });

  await testAsync('_handleHandlerError mapea status segun code, log estructurado y metric fuentes.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.failed', new Error('not found'), 'kind');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.ok(mocks.logs.some(l => l[0] === 'error' && l[1] === 'test.failed'));
    assert.ok(mocks.metricsCalls.some(c =>
      c[0] === 'increment' && c[1] === 'fuentes.errors' && c[2]?.code === 'RESOURCE_NOT_FOUND'
    ));
    await m.onUnload();
  });

  await testAsync('_validateRequiredFields tira INVALID_INPUT con campos faltantes', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.throws(
      () => m._validateRequiredFields({ a: 1 }, ['a', 'b', 'c']),
      err => /faltantes.*b.*c|faltantes.*c.*b/.test(err.message) && err._code === 'INVALID_INPUT'
    );
    assert.doesNotThrow(() => m._validateRequiredFields({ a: 1, b: 2 }, ['a', 'b']));
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})();

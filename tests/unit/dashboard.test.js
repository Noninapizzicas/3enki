/**
 * Tests unitarios — dashboard (POC2).
 *
 * Ejecutar: node tests/unit/dashboard.test.js
 */

'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');
const DashboardModule = require('../../modules/dashboard/index.js');

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

  const eventBus = new EventEmitter();
  eventBus.publish = async (event, payload) => { published.push([event, payload]); };

  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

function makeDiscoveryMock(cores = []) {
  const map = new Map();
  for (const c of cores) {
    map.set(c.core_id, {
      core_id: c.core_id,
      version: c.version || '1.0.0',
      host: c.host || 'localhost',
      port: c.port || 3000,
      started_at: c.started_at || (Date.now() - 60000),
      last_seen: c.last_seen || Date.now(),
      heartbeat_count: c.heartbeat_count || 10,
      is_alive: c.is_alive !== false,
      modules: c.modules || [],
      capabilities: c.capabilities || {}
    });
  }
  return { getActiveCores: () => map };
}

function makeSSEResponse() {
  const writes = [];
  const ended = [];
  return {
    writes, ended,
    write: (chunk) => writes.push(chunk),
    end: () => ended.push(true)
  };
}

async function instantiate(mocks, opts = {}) {
  const m = new DashboardModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    moduleConfig: opts.config || {}
  });
  if (opts.discovery !== false) {
    m.setDiscovery(opts.discovery || makeDiscoveryMock([]));
  }
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

(async () => {
  console.log('dashboard — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad inicializa estado limpio + suscribe al bus', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'dashboard');
    assert.strictEqual(m.version, '3.0.0');
    assert.strictEqual(m.logBuffer.length, 0);
    assert.strictEqual(m.eventBuffer.length, 0);
    assert.ok(m._busMessageHandler);
    await m.onUnload();
  });

  await testAsync('onUnload cierra SSE clients + limpia buffers', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const sse1 = makeSSEResponse();
    const sse2 = makeSSEResponse();
    m.sseClients.logs.add(sse1);
    m.sseClients.events.add(sse2);
    m.logBuffer.push({ x: 1 });
    m.eventBuffer.push({ y: 1 });
    await m.onUnload();
    assert.strictEqual(sse1.ended.length, 1);
    assert.strictEqual(sse2.ended.length, 1);
    assert.strictEqual(m.sseClients.logs.size, 0);
    assert.strictEqual(m.sseClients.events.size, 0);
    assert.strictEqual(m.logBuffer.length, 0);
    assert.strictEqual(m.eventBuffer.length, 0);
  });

  await testAsync('setDiscovery inyecta discovery en el modulo', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { discovery: false });
    assert.strictEqual(m.discovery, null);
    const disc = makeDiscoveryMock([{ core_id: 'a' }]);
    m.setDiscovery(disc);
    assert.strictEqual(m.discovery, disc);
    await m.onUnload();
  });

  // Group 2: Validacion canonica
  await testAsync('handleCores sin discovery devuelve 503 UPSTREAM_UNREACHABLE', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { discovery: false });
    const r = await m.handleCores();
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.error.code, 'UPSTREAM_UNREACHABLE');
    await m.onUnload();
  });

  await testAsync('handleCoreDetail sin id devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCoreDetail({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'id');
    await m.onUnload();
  });

  await testAsync('handleCoreDetail core inexistente devuelve 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCoreDetail({ params: { id: 'fantasma' } });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleCoreDetail sin discovery devuelve 503', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { discovery: false });
    const r = await m.handleCoreDetail({ params: { id: 'a' } });
    assert.strictEqual(r.status, 503);
    await m.onUnload();
  });

  // Group 3: Cores list + detail
  await testAsync('handleCores devuelve lista de cores con metadata', async () => {
    const mocks = makeMocks();
    const startedAt = Date.now() - 120000;
    const discovery = makeDiscoveryMock([
      { core_id: 'core-1', version: '2.0.0', host: 'h1', port: 3000, started_at: startedAt, heartbeat_count: 50, is_alive: true, modules: ['m1', 'm2'] },
      { core_id: 'core-2', version: '2.1.0', host: 'h2', port: 3001, started_at: startedAt, heartbeat_count: 30, is_alive: false }
    ]);
    const { module: m } = await instantiate(mocks, { discovery });
    const r = await m.handleCores();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.total, 2);
    assert.ok(r.data.cores[0].uptime_ms >= 100000);
    assert.deepStrictEqual(r.data.cores[0].modules, ['m1', 'm2']);
    await m.onUnload();
  });

  await testAsync('handleCoreDetail devuelve uptime_human formateado', async () => {
    const mocks = makeMocks();
    const startedAt = Date.now() - (3 * 24 * 60 * 60 * 1000); // 3 dias
    const discovery = makeDiscoveryMock([
      { core_id: 'core-1', started_at: startedAt }
    ]);
    const { module: m } = await instantiate(mocks, { discovery });
    const r = await m.handleCoreDetail({ params: { id: 'core-1' } });
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.uptime_human.startsWith('3d'));
    await m.onUnload();
  });

  // Group 4: Buffering desde el bus
  await testAsync('Bus message a /logs/ se almacena en logBuffer', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.eventBus.emit('message', 'core/abc/logs/info', { msg: 'log-line' });
    assert.strictEqual(m.logBuffer.length, 1);
    assert.strictEqual(m.logBuffer[0].topic, 'core/abc/logs/info');
    await m.onUnload();
  });

  await testAsync('Bus message a /events/ se almacena en eventBuffer', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.eventBus.emit('message', 'core/abc/events/foo', { evt: 'hi' });
    assert.strictEqual(m.eventBuffer.length, 1);
    await m.onUnload();
  });

  await testAsync('Buffer respeta max_buffer_size con FIFO', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { max_buffer_size: 3 } });
    for (let i = 0; i < 5; i++) {
      mocks.eventBus.emit('message', `core/x/logs/${i}`, { idx: i });
    }
    assert.strictEqual(m.logBuffer.length, 3);
    assert.strictEqual(m.logBuffer[0].topic, 'core/x/logs/2');
    assert.strictEqual(m.logBuffer[2].topic, 'core/x/logs/4');
    await m.onUnload();
  });

  await testAsync('Bus message a otros topics NO se almacena en buffers', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.eventBus.emit('message', 'core/abc/heartbeat', {});
    assert.strictEqual(m.logBuffer.length, 0);
    assert.strictEqual(m.eventBuffer.length, 0);
    await m.onUnload();
  });

  // Group 5: SSE streaming
  await testAsync('handleLogs devuelve SSE con buffer inicial', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.logBuffer.push({ id: 'log-1' }, { id: 'log-2' });
    const result = await m.handleLogs({});
    assert.strictEqual(result._responseType, 'sse');
    const sse = makeSSEResponse();
    const fakeReq = new EventEmitter();
    result.onConnect(sse);
    assert.strictEqual(m.sseClients.logs.size, 1);
    assert.strictEqual(sse.writes.length, 2);
    assert.ok(sse.writes[0].includes('log-1'));
    await m.onUnload();
  });

  await testAsync('handleEvents devuelve SSE con buffer inicial', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.eventBuffer.push({ id: 'evt-1' });
    const result = await m.handleEvents({});
    const sse = makeSSEResponse();
    result.onConnect(sse);
    assert.strictEqual(m.sseClients.events.size, 1);
    assert.strictEqual(sse.writes.length, 1);
    await m.onUnload();
  });

  await testAsync('Buffer push broadcastea a SSE clients conectados', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const sse = makeSSEResponse();
    m.sseClients.logs.add(sse);
    mocks.eventBus.emit('message', 'core/x/logs/info', { msg: 'broadcast-test' });
    assert.strictEqual(sse.writes.length, 1);
    assert.ok(sse.writes[0].includes('broadcast-test'));
    await m.onUnload();
  });

  await testAsync('Cliente SSE que falla en write se elimina del Set', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const badClient = { write: () => { throw new Error('disconnected'); } };
    m.sseClients.logs.add(badClient);
    mocks.eventBus.emit('message', 'core/x/logs/info', { msg: 'x' });
    assert.strictEqual(m.sseClients.logs.size, 0);
    await m.onUnload();
  });

  // Group 6: Metrics + health
  await testAsync('handleMetrics devuelve aggregate + cores info', async () => {
    const mocks = makeMocks();
    const startedAt = Date.now() - 60000;
    const discovery = makeDiscoveryMock([
      { core_id: 'c1', started_at: startedAt, heartbeat_count: 100, is_alive: true }
    ]);
    const { module: m } = await instantiate(mocks, { discovery });
    m.logBuffer.push({}, {});
    const r = await m.handleMetrics();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.aggregate.total_cores, 1);
    assert.strictEqual(r.data.aggregate.buffer_logs, 2);
    assert.ok(r.data.cores.c1);
    await m.onUnload();
  });

  await testAsync('handleHealth devuelve healthy cuando hay discovery', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealth();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.status, 'healthy');
    assert.strictEqual(r.data.discovery_available, true);
    await m.onUnload();
  });

  await testAsync('handleHealth devuelve degraded cuando NO hay discovery', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { discovery: false });
    const r = await m.handleHealth();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.status, 'degraded');
    assert.strictEqual(r.data.discovery_available, false);
    await m.onUnload();
  });

  await testAsync('_formatUptime devuelve formato humano correcto', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._formatUptime(30 * 1000), '30s');
    assert.strictEqual(m._formatUptime(90 * 1000), '1m 30s');
    assert.strictEqual(m._formatUptime(2 * 60 * 60 * 1000), '2h 0m');
    assert.strictEqual(m._formatUptime(2 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000), '2d 5h');
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
    assert.deepStrictEqual(m._classifyHandlerError(new Error('not available')), { status: 503, code: 'UPSTREAM_UNREACHABLE' });
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

  await testAsync('_handleHandlerError emite metric dashboard.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'));
    assert.strictEqual(r.status, 404);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'dashboard.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });

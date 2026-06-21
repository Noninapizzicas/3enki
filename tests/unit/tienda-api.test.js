/**
 * Tests unitarios — tienda-api (POC2).
 *
 * Ejecutar: node tests/unit/tienda-api.test.js
 */

'use strict';

const assert = require('assert');

const TiendaApiModule = require('../../modules/pizzepos/tienda-api/index.js');

function makeMocks() {
  const logs = [], published = [], metricsCalls = [];
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
  const m = new TiendaApiModule();
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus });
  if (Number.isInteger(opts.timeoutMs)) {
    m.config.pedido_wait_timeout_ms = opts.timeoutMs;
  }
  return { module: m };
}

function makeRes() {
  const state = { status: null, body: null, headers: {}, ended: false, headersSent: false };
  const res = {
    get headersSent() { return state.headersSent; },
    status(s) { state.status = s; return res; },
    json(b)   { state.body = b; state.headersSent = true; return res; },
    setHeader(k, v) { state.headers[k] = v; return res; },
    end()     { state.ended = true; state.headersSent = true; return res; }
  };
  return { res, state };
}

function validBody(overrides = {}) {
  return {
    items: [{ cantidad: 2, descripcion: 'Vape Cloud Nine Menta', precio_unitario_centimos: 1500 }],
    total_centimos: 3000,
    cliente_telefono: '34600000000',
    nombre_cliente: 'Juan',
    ...overrides
  };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log('tienda-api — POC2\n');

  // ===========================================================
  // Group 1: Lifecycle
  // ===========================================================

  await testAsync('onLoad asigna name, version, config desde module.json', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'tienda-api');
    assert.strictEqual(m.version, '1.0.0');
    assert.strictEqual(typeof m.config.pedido_wait_timeout_ms, 'number');
    assert.strictEqual(m.pendingRequests.size, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia pendingRequests + responde 503 a huérfanos + cancela timers', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { res: r1, state: s1 } = makeRes();
    const { res: r2, state: s2 } = makeRes();
    const t1 = setTimeout(() => {}, 60000);
    const t2 = setTimeout(() => {}, 60000);
    m.pendingRequests.set('req-1', { project_slug: 'vapers', res: r1, timeoutHandle: t1, started_at: Date.now(), correlation_id: 'c1' });
    m.pendingRequests.set('req-2', { project_slug: 'vapers', res: r2, timeoutHandle: t2, started_at: Date.now(), correlation_id: 'c2' });
    await m.onUnload();
    assert.strictEqual(m.pendingRequests.size, 0);
    assert.strictEqual(s1.status, 503);
    assert.strictEqual(s1.body.error.code, 'UPSTREAM_UNREACHABLE');
    assert.strictEqual(s2.status, 503);
  });

  // ===========================================================
  // Group 2: Validación canónica del body
  // ===========================================================

  await testAsync('POST sin project en path devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { res, state } = makeRes();
    await m.handlePedidoPost({ params: {}, body: validBody() }, res);
    assert.strictEqual(state.status, 400);
    assert.strictEqual(state.body.error.code, 'INVALID_INPUT');
    assert.strictEqual(state.body.error.details.field, 'project');
    await m.onUnload();
  });

  await testAsync('POST con body no-objeto devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { res, state } = makeRes();
    await m.handlePedidoPost({ params: { project: 'vapers' }, body: 'not-an-object' }, res);
    assert.strictEqual(state.status, 400);
    assert.strictEqual(state.body.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('POST sin items[] devuelve 400 INVALID_INPUT field=items', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { res, state } = makeRes();
    await m.handlePedidoPost({ params: { project: 'vapers' }, body: validBody({ items: undefined }) }, res);
    assert.strictEqual(state.status, 400);
    assert.strictEqual(state.body.error.details.field, 'items');
    await m.onUnload();
  });

  await testAsync('POST con items[] vacío devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { res, state } = makeRes();
    await m.handlePedidoPost({ params: { project: 'vapers' }, body: validBody({ items: [] }) }, res);
    assert.strictEqual(state.status, 400);
    assert.strictEqual(state.body.error.details.field, 'items');
    await m.onUnload();
  });

  await testAsync('POST con item.cantidad inválida (0) devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { res, state } = makeRes();
    const body = validBody({ items: [{ cantidad: 0, descripcion: 'x' }] });
    await m.handlePedidoPost({ params: { project: 'vapers' }, body }, res);
    assert.strictEqual(state.status, 400);
    assert.ok(state.body.error.details.field.includes('cantidad'));
    await m.onUnload();
  });

  await testAsync('POST con item.descripcion vacía devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { res, state } = makeRes();
    const body = validBody({ items: [{ cantidad: 1, descripcion: '   ' }] });
    await m.handlePedidoPost({ params: { project: 'vapers' }, body }, res);
    assert.strictEqual(state.status, 400);
    assert.ok(state.body.error.details.field.includes('descripcion'));
    await m.onUnload();
  });

  await testAsync('POST sin total_centimos devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { res, state } = makeRes();
    await m.handlePedidoPost({ params: { project: 'vapers' }, body: validBody({ total_centimos: undefined }) }, res);
    assert.strictEqual(state.status, 400);
    assert.strictEqual(state.body.error.details.field, 'total_centimos');
    await m.onUnload();
  });

  await testAsync('POST con mayor_edad_confirmado tipo erróneo devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { res, state } = makeRes();
    await m.handlePedidoPost({ params: { project: 'vapers' }, body: validBody({ mayor_edad_confirmado: 'yes' }) }, res);
    assert.strictEqual(state.status, 400);
    assert.strictEqual(state.body.error.details.field, 'mayor_edad_confirmado');
    await m.onUnload();
  });

  await testAsync('POST con expira_horas fuera de rango devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { res, state } = makeRes();
    await m.handlePedidoPost({ params: { project: 'vapers' }, body: validBody({ expira_horas: 9999 }) }, res);
    assert.strictEqual(state.status, 400);
    assert.strictEqual(state.body.error.details.field, 'expira_horas');
    await m.onUnload();
  });

  await testAsync('validacion fallida publica tienda.pedido.fallido con fase=validar', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { res } = makeRes();
    await m.handlePedidoPost({ params: { project: 'vapers' }, body: { items: [] } }, res);
    const fallidos = publishedOf(mocks, 'tienda.pedido.fallido');
    assert.strictEqual(fallidos.length, 1);
    assert.strictEqual(fallidos[0].fase, 'validar');
    assert.strictEqual(fallidos[0].project_slug, 'vapers');
    await m.onUnload();
  });

  // ===========================================================
  // Group 3: Success path end-to-end
  // ===========================================================

  await testAsync('POST válido publica pedido.crear-tienda con shape canónico y NO responde aún', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { res, state } = makeRes();
    await m.handlePedidoPost({ params: { project: 'vapers' }, body: validBody() }, res);
    assert.strictEqual(state.status, null, 'no debe responder al cliente hasta llegar response del bus');
    assert.strictEqual(m.pendingRequests.size, 1);
    const calls = publishedOf(mocks, 'pedido.crear-tienda');
    assert.strictEqual(calls.length, 1);
    const payload = calls[0];
    assert.ok(payload.request_id, 'request_id presente');
    assert.ok(payload.correlation_id, 'correlation_id presente');
    assert.strictEqual(payload.project_slug, 'vapers');
    assert.strictEqual(payload.canal_origen, 'web');
    assert.strictEqual(payload.cliente_telefono, '34600000000');
    assert.strictEqual(payload.total_centimos, 3000);
    assert.strictEqual(payload.items.length, 1);
    await m.onUnload();
  });

  await testAsync('response bus OK → handler responde 201 + pedido_id al cliente HTTP', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { res, state } = makeRes();
    await m.handlePedidoPost({ params: { project: 'vapers' }, body: validBody() }, res);
    const request_id = publishedOf(mocks, 'pedido.crear-tienda')[0].request_id;
    await m.onPedidoCrearTiendaResponse({ data: { request_id, result: { pedido_id: 'ped-abc-123', codigo_recogida: 'xyz' } } });
    assert.strictEqual(state.status, 201);
    assert.strictEqual(state.body.status, 201);
    assert.strictEqual(state.body.data.pedido_id, 'ped-abc-123');
    assert.strictEqual(state.body.data.codigo_recogida, 'xyz');
    assert.ok(state.body.data.correlation_id, 'correlation_id devuelto al cliente');
    assert.strictEqual(m.pendingRequests.size, 0, 'pending limpiado tras response');
    const completados = publishedOf(mocks, 'tienda.pedido.completado');
    assert.strictEqual(completados.length, 1);
    assert.strictEqual(completados[0].pedido_id, 'ped-abc-123');
    await m.onUnload();
  });

  await testAsync('CORS Access-Control-Allow-Origin: * presente en response success', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { res, state } = makeRes();
    await m.handlePedidoPost({ params: { project: 'vapers' }, body: validBody() }, res);
    const request_id = publishedOf(mocks, 'pedido.crear-tienda')[0].request_id;
    await m.onPedidoCrearTiendaResponse({ data: { request_id, result: { pedido_id: 'p' } } });
    assert.strictEqual(state.headers['Access-Control-Allow-Origin'], '*');
    await m.onUnload();
  });

  // ===========================================================
  // Group 4: Error path downstream
  // ===========================================================

  await testAsync('response bus con error → handler propaga code + status canónicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { res, state } = makeRes();
    await m.handlePedidoPost({ params: { project: 'vapers' }, body: validBody() }, res);
    const request_id = publishedOf(mocks, 'pedido.crear-tienda')[0].request_id;
    await m.onPedidoCrearTiendaResponse({ data: { request_id, error: { code: 'RESOURCE_NOT_FOUND', message: 'project no existe' } } });
    assert.strictEqual(state.status, 404);
    assert.strictEqual(state.body.error.code, 'RESOURCE_NOT_FOUND');
    const fallidos = publishedOf(mocks, 'tienda.pedido.fallido');
    assert.strictEqual(fallidos.length, 1);
    assert.strictEqual(fallidos[0].fase, 'bus_error');
    await m.onUnload();
  });

  await testAsync('response bus con CONFLICT_STATE → 409 propagado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { res, state } = makeRes();
    await m.handlePedidoPost({ params: { project: 'vapers' }, body: validBody() }, res);
    const request_id = publishedOf(mocks, 'pedido.crear-tienda')[0].request_id;
    await m.onPedidoCrearTiendaResponse({ data: { request_id, error: { code: 'CONFLICT_STATE', message: 'stock insuficiente' } } });
    assert.strictEqual(state.status, 409);
    assert.strictEqual(state.body.error.code, 'CONFLICT_STATE');
    await m.onUnload();
  });

  await testAsync('response sin request_id se ignora (defensive)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onPedidoCrearTiendaResponse({ data: { result: { pedido_id: 'x' } } });
    assert.strictEqual(m.pendingRequests.size, 0);
    await m.onUnload();
  });

  await testAsync('response con request_id desconocido se ignora (idempotente tras timeout)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onPedidoCrearTiendaResponse({ data: { request_id: 'ghost-id', result: { pedido_id: 'x' } } });
    assert.strictEqual(mocks.logs.filter(l => l[0] === 'error').length, 0);
    await m.onUnload();
  });

  // ===========================================================
  // Group 5: Timeout
  // ===========================================================

  await testAsync('timeout sin response del bus → 504 UPSTREAM_TIMEOUT + cleanup', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { timeoutMs: 30 });
    const { res, state } = makeRes();
    await m.handlePedidoPost({ params: { project: 'vapers' }, body: validBody() }, res);
    assert.strictEqual(m.pendingRequests.size, 1);
    await delay(70);
    assert.strictEqual(state.status, 504);
    assert.strictEqual(state.body.error.code, 'UPSTREAM_TIMEOUT');
    assert.ok(state.body.error.details.timeout_ms);
    assert.strictEqual(m.pendingRequests.size, 0, 'pending limpiado tras timeout');
    const fallidos = publishedOf(mocks, 'tienda.pedido.fallido');
    assert.ok(fallidos.some(f => f.fase === 'bus_timeout'));
    await m.onUnload();
  });

  await testAsync('response que llega tras timeout es ignorada (no doble write)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { timeoutMs: 30 });
    const { res, state } = makeRes();
    await m.handlePedidoPost({ params: { project: 'vapers' }, body: validBody() }, res);
    const request_id = publishedOf(mocks, 'pedido.crear-tienda')[0].request_id;
    await delay(70);
    assert.strictEqual(state.status, 504, 'ya respondido por timeout');
    await m.onPedidoCrearTiendaResponse({ data: { request_id, result: { pedido_id: 'late' } } });
    assert.strictEqual(state.status, 504, 'sigue siendo 504, no se sobrescribe');
    await m.onUnload();
  });

  // ===========================================================
  // Group 6: CORS preflight
  // ===========================================================

  await testAsync('OPTIONS responde 204 con headers CORS correctos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { res, state } = makeRes();
    await m.handlePedidoOptions({ params: { project: 'vapers' } }, res);
    assert.strictEqual(state.status, 204);
    assert.strictEqual(state.headers['Access-Control-Allow-Origin'], '*');
    assert.ok(state.headers['Access-Control-Allow-Methods'].includes('POST'));
    assert.ok(state.headers['Access-Control-Allow-Headers'].includes('Content-Type'));
    assert.ok(state.ended);
    await m.onUnload();
  });

  await testAsync('handleHealthCheck devuelve estado básico con requests_pendientes', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { res, state } = makeRes();
    m.pendingRequests.set('x', { project_slug: 'vapers', res: makeRes().res, timeoutHandle: setTimeout(() => {}, 60000), started_at: Date.now(), correlation_id: 'c' });
    await m.handleHealthCheck({}, res);
    assert.strictEqual(state.status, 200);
    assert.strictEqual(state.body.module, 'tienda-api');
    assert.strictEqual(state.body.requests_pendientes, 1);
    await m.onUnload();
  });

  // ===========================================================
  // Group 7: Helpers POC2 + dominio aislados
  // ===========================================================

  await testAsync('_validatePedidoBody acepta body mínimo válido', async () => {
    const m = new TiendaApiModule();
    const result = m._validatePedidoBody({ items: [{ cantidad: 1, descripcion: 'x' }], total_centimos: 100 });
    assert.strictEqual(result.ok, true);
  });

  await testAsync('_validatePedidoBody acepta opcionales bien tipados', async () => {
    const m = new TiendaApiModule();
    const result = m._validatePedidoBody({
      items: [{ cantidad: 1, descripcion: 'x' }],
      total_centimos: 100,
      cliente_telefono: '34600000000',
      nombre_cliente: 'Juan',
      mayor_edad_confirmado: true,
      expira_horas: 24,
      notas_generales: 'sin notas'
    });
    assert.strictEqual(result.ok, true);
  });

  await testAsync('_consumePending devuelve null para request_id desconocido', async () => {
    const m = new TiendaApiModule();
    assert.strictEqual(m._consumePending('ghost'), null);
  });

  await testAsync('_consumePending limpia el timer y borra el pending', async () => {
    const m = new TiendaApiModule();
    const t = setTimeout(() => {}, 60000);
    m.pendingRequests.set('req-x', { project_slug: 'vapers', timeoutHandle: t, started_at: Date.now(), correlation_id: 'c' });
    const p = m._consumePending('req-x');
    assert.ok(p);
    assert.strictEqual(m.pendingRequests.has('req-x'), false);
  });

  await testAsync('_respondToClient no escribe si headersSent ya = true', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { res, state } = makeRes();
    state.headersSent = true;
    m._respondToClient({ project_slug: 'vapers', res }, 200, { status: 200, data: {} });
    assert.strictEqual(state.status, null, 'no escribió status tras headersSent');
    const warns = mocks.logs.filter(l => l[0] === 'warn' && l[1] === 'tienda-api.response_after_headers_sent');
    assert.strictEqual(warns.length, 1);
    await m.onUnload();
  });

  await testAsync('hereda _errorResponse, _statusFromCode y _publicarEvento de BaseModule', async () => {
    const m = new TiendaApiModule();
    const r = m._errorResponse(400, 'INVALID_INPUT', 'msg', { field: 'x' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'x');
    assert.strictEqual(m._statusFromCode('UPSTREAM_TIMEOUT'), 504);
    assert.strictEqual(m._statusFromCode('PRECONDITION_FAILED'), 422);
    assert.strictEqual(typeof m._publicarEvento, 'function');
  });

  console.log('\n✓ tienda-api: todos los tests pasaron.');
})();

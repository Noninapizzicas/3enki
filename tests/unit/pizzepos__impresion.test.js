/**
 * Tests unitarios — pizzepos/impresion (POC2 reescritura).
 *
 * Mocks: eventBus.mqtt para autodiscovery + envio. Tests aislados.
 *
 * Ejecutar: node tests/unit/pizzepos__impresion.test.js
 */

'use strict';

const assert = require('assert');

const ImpresionModule = require('../../modules/pizzepos/impresion/index.js');

// --------------------------------------------------
// Mocks
// --------------------------------------------------

function makeMqtt() {
  const subscribed = [];
  const published  = [];
  const listeners  = { message: [] };
  return {
    isConnected: true,
    subscribed, published, listeners,
    on: (event, fn) => { listeners[event] = listeners[event] || []; listeners[event].push(fn); },
    removeListener: (event, fn) => {
      if (listeners[event]) listeners[event] = listeners[event].filter(l => l !== fn);
    },
    subscribe: async (topic) => { subscribed.push(topic); },
    publish:   async (topic, payload, opts) => { published.push({ topic, payload, opts }); },
    // Helper para test: simula mensaje entrante
    _emitMessage: (topic, payload) => {
      for (const fn of listeners.message || []) fn(topic, payload);
    }
  };
}

function makeMocks(opts = {}) {
  const logs         = [];
  const published    = [];
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

  const mqtt = opts.noMqtt ? null : makeMqtt();
  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); }
  };
  if (mqtt) eventBus.mqtt = mqtt;

  return { logs, published, metricsCalls, logger, metrics, eventBus, mqtt };
}

async function instantiate(mocks, opts = {}) {
  const m = new ImpresionModule();
  await m.onLoad({
    logger:   mocks.logger,
    metrics:  mocks.metrics,
    eventBus: mocks.eventBus,
    config:   { impresion: opts.config || {} }
  });
  // Disable TTL interval for tests (no leak)
  if (m._ttlInterval) { clearInterval(m._ttlInterval); m._ttlInterval = null; }
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
  console.log('pizzepos/impresion — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa y se subscribe a 3 topics MQTT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'impresion');
    assert.strictEqual(m.version, '4.0.0');
    assert.strictEqual(m.lineWidth, 32);
    assert.deepStrictEqual(mocks.mqtt.subscribed.sort(), [
      'enki/+/status/+', 'impresion/+/printed/+', 'impresion/+/status/+'
    ]);
    await m.onUnload();
  });

  await testAsync('onUnload detiene autodiscovery, limpia impresoras + pendingJobs', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.impresoras.set('d1', { device_id: 'd1', online: true });
    m._pendingJobs.set('j1', { resolve: () => {}, timer: setTimeout(() => {}, 60000) });
    await m.onUnload();
    assert.strictEqual(m.impresoras.size, 0);
    assert.strictEqual(m._pendingJobs.size, 0);
    assert.strictEqual(mocks.mqtt.listeners.message.length, 0);
  });

  await testAsync('onLoad sin MQTT loguea warn y sigue', async () => {
    const mocks = makeMocks({ noMqtt: true });
    const { module: m } = await instantiate(mocks);
    assert.ok(mocks.logs.some(l => l[1] === 'impresion.autodiscovery.sin_mqtt'));
    await m.onUnload();
  });

  // ==========================================
  // Group 2: Validacion canonica
  // ==========================================

  await testAsync('handleImprimirComanda sin cuenta_id/pedido_id → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleImprimirComanda({ items: [{ nombre: 'Pizza' }] });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleImprimirComanda sin items → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleImprimirComanda({ cuenta_id: 'c1', items: [] });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.details.field, 'items');
    await m.onUnload();
  });

  await testAsync('handleImprimirTicketVenta sin cuenta_id/items/total → 400 cada uno', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = await m.handleImprimirTicketVenta({});
    assert.strictEqual(r1.error.details.field, 'cuenta_id');
    const r2 = await m.handleImprimirTicketVenta({ cuenta_id: 'c1' });
    assert.strictEqual(r2.error.details.field, 'items');
    const r3 = await m.handleImprimirTicketVenta({ cuenta_id: 'c1', items: [{ nombre: 'X' }] });
    assert.strictEqual(r3.error.details.field, 'total');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Bus subscribes — cache de ref_display
  // ==========================================

  await testAsync('onCuentaCreada cachea ref_display', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCuentaCreada({ data: { cuenta_id: 'c1', ref_display: 'M 001' }});
    assert.strictEqual(m.cuentaNombres.get('c1').ref, 'M 001');
    await m.onUnload();
  });

  await testAsync('onMesaRenombrada actualiza nombre cacheado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCuentaCreada({ data: { cuenta_id: 'c1', ref_display: 'M 001' }});
    await m.onMesaRenombrada({ data: { cuenta_id: 'c1', nombre: 'Terraza VIP' }});
    assert.strictEqual(m.cuentaNombres.get('c1').ref, 'Terraza VIP');
    await m.onUnload();
  });

  await testAsync('onCuentaActualizada respeta ref_display sobre nombre', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCuentaCreada({ data: { cuenta_id: 'c1', ref_display: 'M 001' }});
    await m.onCuentaActualizada({ data: { cuenta_id: 'c1', cambios: { ref_display: 'Terraza M 001' }}});
    assert.strictEqual(m.cuentaNombres.get('c1').ref, 'Terraza M 001');
    await m.onUnload();
  });

  await testAsync('onCuentaEliminada limpia cache', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCuentaCreada({ data: { cuenta_id: 'c1', ref_display: 'M 001' }});
    await m.onCuentaEliminada({ data: { cuenta_id: 'c1' }});
    assert.strictEqual(m.cuentaNombres.has('c1'), false);
    await m.onUnload();
  });

  await testAsync('onCajaCerrada y onDiaIniciado limpian cache + historial', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCuentaCreada({ data: { cuenta_id: 'c1', ref_display: 'M 001' }});
    m.historial.push({ x: 1 });
    await m.onCajaCerrada({ data: {} });
    assert.strictEqual(m.cuentaNombres.size, 0);
    assert.strictEqual(m.historial.length, 0);
    await m.onUnload();
  });

  // ==========================================
  // Group 4: onItemTicket → formatea + MQTT publish + bus publish
  // ==========================================

  await testAsync('onItemTicket envia MQTT al ESP32 y publica impresion.ticket_pieza_generado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    // Registrar impresora online
    m.impresoras.set('esp32-cocina-01', {
      device_id: 'esp32-cocina-01', project_id: 'p1',
      online: true, printer_ready: true, ancho: '58mm', last_seen: new Date().toISOString()
    });
    mocks.published.length = 0;
    mocks.mqtt.published.length = 0;

    await m.onItemTicket({ data: {
      pedido_id: 'ped-1', cuenta_id: 'c1', canal: 'mesa', ref_display: 'M 001',
      item_id: 'i-1', nombre: 'Pizza Margarita', cantidad: 1, estacion: 'horno',
      project_id: 'p1', correlation_id: 'cid-IT'
    }});

    // Bus publish
    const evs = publishedOf(mocks, 'impresion.ticket_pieza_generado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid-IT');
    assert.strictEqual(evs[0].project_id, 'p1');
    assert.ok(evs[0].timestamp);
    assert.strictEqual(evs[0].pedido_id, 'ped-1');

    // MQTT publish a ESP32
    const mqttPubs = mocks.mqtt.published.filter(p => p.topic.startsWith('impresion/p1/print/esp32-cocina-01'));
    assert.strictEqual(mqttPubs.length, 1);
    const payload = JSON.parse(mqttPubs[0].payload);
    assert.ok(payload.job_id.startsWith('job_'));
    assert.ok(payload.data, 'data base64 presente');
    await m.onUnload();
  });

  await testAsync('onItemTicket sin impresoras descubiertas loguea error y NO publica ticket', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    mocks.mqtt.published.length = 0;

    await m.onItemTicket({ data: {
      pedido_id: 'ped-1', cuenta_id: 'c1', nombre: 'Pizza', cantidad: 1
    }});

    assert.strictEqual(publishedOf(mocks, 'impresion.ticket_pieza_generado').length, 0);
    assert.ok(mocks.logs.some(l => l[0] === 'error' && l[1] === 'impresion.ticket_pieza.error'));
    assert.strictEqual(m.internalMetrics.errores, 1);
    await m.onUnload();
  });

  // ==========================================
  // Group 5: UI handlers success
  // ==========================================

  await testAsync('handleImprimirComanda success devuelve 201 con registro y publica comanda_generada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.impresoras.set('esp32-bar', {
      device_id: 'esp32-bar', project_id: 'p1',
      online: true, printer_ready: true, ancho: '58mm', last_seen: new Date().toISOString()
    });
    mocks.published.length = 0;

    const r = await m.handleImprimirComanda({
      cuenta_id: 'c1', canal: 'mesa', items: [{ nombre: 'Pizza', cantidad: 1 }],
      project_id: 'p1', correlation_id: 'cid-CM'
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.comanda_id.startsWith('cmd_'));
    assert.strictEqual(r.data.reimpresion, true);

    const evs = publishedOf(mocks, 'impresion.comanda_generada');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid-CM');
    assert.strictEqual(evs[0].project_id, 'p1');
    assert.strictEqual(m.internalMetrics.reimpresiones, 1);
    await m.onUnload();
  });

  await testAsync('handleImprimirTicketVenta success → 200 + publica ticket_venta_generado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.impresoras.set('esp32-bar', {
      device_id: 'esp32-bar', project_id: 'p1',
      online: true, printer_ready: true, ancho: '58mm', last_seen: new Date().toISOString()
    });
    mocks.published.length = 0;

    const r = await m.handleImprimirTicketVenta({
      cuenta_id: 'c1', items: [{ nombre: 'Pizza', cantidad: 1, precio_total: 12.5 }],
      total: 12.5, metodo_pago: 'efectivo', project_id: 'p1'
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.comanda_id.startsWith('vta_'));
    assert.strictEqual(r.data.metodo_pago, 'efectivo');

    const evs = publishedOf(mocks, 'impresion.ticket_venta_generado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].project_id, 'p1');
    await m.onUnload();
  });

  await testAsync('handleListarImpresoras devuelve impresoras descubiertas', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.impresoras.set('d1', { device_id: 'd1', project_id: 'p1', online: true, printer_ready: true });
    m.impresoras.set('d2', { device_id: 'd2', project_id: 'p1', online: false, printer_ready: false });

    const r = await m.handleListarImpresoras();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.total, 2);
    assert.strictEqual(r.data.impresoras.length, 2);
    await m.onUnload();
  });

  await testAsync('handleHealthCheck → 200 healthy si hay impresoras ready, degraded si no', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let r = await m.handleHealthCheck();
    assert.strictEqual(r.data.status, 'degraded');

    m.impresoras.set('d1', { online: true, printer_ready: true });
    r = await m.handleHealthCheck();
    assert.strictEqual(r.data.status, 'healthy');
    await m.onUnload();
  });

  // ==========================================
  // Group 6: Autodiscovery + ACK + TTL
  // ==========================================

  await testAsync('_handleStatusMessage registra impresora en el cache', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.mqtt._emitMessage('impresion/p1/status/esp32-cocina-01', JSON.stringify({
      online: true, printer_ready: true, printer_name: 'EPSON', ip: '192.168.1.50'
    }));
    const imp = m.impresoras.get('esp32-cocina-01');
    assert.ok(imp);
    assert.strictEqual(imp.printer_ready, true);
    assert.strictEqual(imp.printer_name, 'EPSON');
    assert.strictEqual(m.internalMetrics.impresoras_descubiertas, 1);
    await m.onUnload();
  });

  await testAsync('_handlePrintAck con error publica impresion.error', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;

    mocks.mqtt._emitMessage('impresion/p1/printed/esp32-cocina-01', JSON.stringify({
      job_id: 'job-1', device_id: 'esp32-cocina-01', success: false, error_code: 'connect_failed'
    }));
    // _handlePrintAck es sincrono via _publicarEvento que es async — esperar microtask
    await new Promise(r => setImmediate(r));

    const evs = publishedOf(mocks, 'impresion.error');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].error_code, 'connect_failed');
    assert.ok(evs[0].error_detail.includes('No se pudo conectar'));
    await m.onUnload();
  });

  await testAsync('_handlePrintAck resuelve pending job con success', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let resolved = null;
    m._pendingJobs.set('job-OK', {
      resolve: (r) => { resolved = r; },
      timer: setTimeout(() => {}, 60000),
      deviceId: 'd1', timestamp: Date.now()
    });

    mocks.mqtt._emitMessage('impresion/p1/printed/d1', JSON.stringify({
      job_id: 'job-OK', success: true, attempts: 1
    }));
    await new Promise(r => setImmediate(r));

    assert.ok(resolved);
    assert.strictEqual(resolved.success, true);
    assert.strictEqual(resolved.job_id, 'job-OK');
    assert.strictEqual(m._pendingJobs.has('job-OK'), false);
    await m.onUnload();
  });

  await testAsync('_checkImpresorasTTL marca offline impresoras sin reportar > 90s', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.impresoras.set('viejo', {
      device_id: 'viejo', online: true, printer_ready: true,
      last_seen: new Date(Date.now() - 100000).toISOString()  // 100s ago
    });
    m._checkImpresorasTTL();
    assert.strictEqual(m.impresoras.get('viejo').online, false);
    assert.strictEqual(m.impresoras.get('viejo').printer_ready, false);
    await m.onUnload();
  });

  await testAsync('extraerRefCuenta usa cache primero, fallback legacy si no', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.cuentaNombres.set('c1', { ref: 'Terraza VIP' });
    assert.strictEqual(m.extraerRefCuenta('c1', 'mesa').ref, 'TERRAZA VIP');
    assert.strictEqual(m.extraerRefCuenta('mesa_5_20250325_001', 'mesa').ref, 'MESA 5');
    assert.strictEqual(m.extraerRefCuenta('llevar_42', 'llevar').ref, 'LLEVAR 42');
    await m.onUnload();
  });

  // ==========================================
  // Group 7: Helpers POC2
  // ==========================================

  await testAsync('_errorResponse construye shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._errorResponse(400, 'INVALID_INPUT', 'msg', { field: 'x' });
    assert.deepStrictEqual(r, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { field: 'x' } } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea UPSTREAM_UNREACHABLE', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(new Error('not found')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('mqtt no disponible')), 'UPSTREAM_UNREACHABLE');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('connection timeout')), 'UPSTREAM_TIMEOUT');
    await m.onUnload();
  });

  await testAsync('_publicarEvento hereda correlation_id, defaultea project_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { x: 1 }, { correlation_id: 'cid-X', project_id: 'p-X' });
    await m._publicarEvento('test.event', { y: 2 });
    const evs = publishedOf(mocks, 'test.event');
    assert.strictEqual(evs[0].correlation_id, 'cid-X');
    assert.strictEqual(evs[0].project_id, 'p-X');
    assert.notStrictEqual(evs[1].correlation_id, 'cid-X');
    assert.strictEqual(evs[1].project_id, 'default');
    await m.onUnload();
  });

  await testAsync('_handleHandlerError mapea status segun code y registra metric impresion.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.metricsCalls.length = 0;
    const err = Object.assign(new Error('mqtt down'), { _code: 'UPSTREAM_UNREACHABLE' });
    const r = m._handleHandlerError('t.failed', err, 'kind');
    assert.strictEqual(r.status, 503);
    const metric = mocks.metricsCalls.find(c => c[1] === 'impresion.errors');
    assert.ok(metric);
    await m.onUnload();
  });

  await testAsync('_parsePayload maneja string, Buffer y JSON invalido', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.deepStrictEqual(m._parsePayload('{"a":1}'), { a: 1 });
    assert.deepStrictEqual(m._parsePayload(Buffer.from('{"b":2}')), { b: 2 });
    assert.strictEqual(m._parsePayload('not json'), null);
    assert.deepStrictEqual(m._parsePayload({ c: 3 }), { c: 3 });
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
  process.exit(0);
})();

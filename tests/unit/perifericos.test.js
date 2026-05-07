/**
 * Tests unitarios — perifericos (POC2 reescritura).
 *
 * Mock del provider local.perifericos via require interception (Module._cache).
 * Todos los tests aislados — no escriben a disco real.
 *
 * Ejecutar: node tests/unit/perifericos.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const Module = require('module');

// --------------------------------------------------
// Mock provider — instala en require cache antes de cargar el modulo
// --------------------------------------------------

const PROVIDER_PATH = path.resolve(__dirname, '../../services/providers/local/perifericos');

let providerCalls;
let registryStore;
let providerInitFails = false;

function makeProviderMock() {
  providerCalls = [];
  registryStore = new Map();

  const registry = {
    listar:           () => Array.from(registryStore.values()),
    obtener:          (n) => registryStore.get(n) || null,
    actualizar:       (n, patch) => {
                        const existing = registryStore.get(n);
                        if (!existing) { const e = new Error(`dispositivo ${n} no encontrado`); throw e; }
                        const next = { ...existing, ...patch };
                        registryStore.set(n, next);
                        return next;
                      },
    actualizarEstado: (n, estado) => {
                        const e = registryStore.get(n);
                        if (e) { e.estado = estado; registryStore.set(n, e); }
                      }
  };

  return {
    name: 'local.perifericos.mock',
    async _initialize(opts) { providerCalls.push(['_initialize', opts]); if (providerInitFails) throw new Error('init fail'); },
    _getRegistry: () => registry,
    async register({ nombre, tipo, capacidades, transporte, metadata, _context }) {
      providerCalls.push(['register', { nombre, tipo, capacidades }]);
      if (!nombre) return { success: false, error: 'nombre requerido' };
      if (!transporte?.tipo) return { success: false, error: 'transporte.tipo requerido' };
      const dispositivo = { nombre, tipo: tipo || 'desconocido', capacidades: capacidades || [], transporte, metadata: metadata || {}, estado: 'offline' };
      registryStore.set(nombre, dispositivo);
      return { success: true, data: { dispositivo } };
    },
    async unregister({ nombre }) {
      providerCalls.push(['unregister', { nombre }]);
      const removed = registryStore.delete(nombre);
      return { success: true, data: { removed } };
    },
    async send({ destino, data, formato, opciones }) {
      providerCalls.push(['send', { destino, formato, opciones }]);
      const failKey = `__fail_${destino}`;
      if (this[failKey]) return { success: false, error: this[failKey] };
      return { success: true, data: { bytes: typeof data === 'string' ? data.length : (data?.length || 0) } };
    },
    async status({ nombre }) {
      providerCalls.push(['status', { nombre }]);
      const d = registryStore.get(nombre);
      if (!d) return { success: false, error: `dispositivo ${nombre} no encontrado` };
      return { success: true, data: { nombre, tipo: d.tipo, estado: d.estado, transporte: { conectado: d.estado === 'online' } } };
    },
    async list({ tipo, capacidad }) {
      providerCalls.push(['list', { tipo, capacidad }]);
      let dispositivos = Array.from(registryStore.values());
      if (tipo)      dispositivos = dispositivos.filter(d => d.tipo === tipo);
      if (capacidad) dispositivos = dispositivos.filter(d => Array.isArray(d.capacidades) && d.capacidades.includes(capacidad));
      return { success: true, data: { dispositivos, total: dispositivos.length } };
    },
    async discover({ metodo }) {
      providerCalls.push(['discover', { metodo }]);
      return { success: true, data: { metodo: metodo || 'activos', descubiertos: [] } };
    },

    // helpers para forzar fallo en send por destino
    setSendFail(destino, err) { this[`__fail_${destino}`] = err; },
    clearSendFails() { for (const k of Object.keys(this)) if (k.startsWith('__fail_')) delete this[k]; }
  };
}

let providerSingleton = makeProviderMock();
require.cache[require.resolve(PROVIDER_PATH)] = { exports: providerSingleton, id: PROVIDER_PATH, filename: PROVIDER_PATH, loaded: true };

// Forzar reload del modulo bajo test tras instalar mock
delete require.cache[require.resolve('../../modules/perifericos/index.js')];
const PerifericosModule = require('../../modules/perifericos/index.js');

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
    // sin .mqtt → autodiscovery no engancha listeners
  };

  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

async function instantiate(mocks, opts = {}) {
  // reset estado del mock entre instancias
  providerSingleton = makeProviderMock();
  require.cache[require.resolve(PROVIDER_PATH)].exports = providerSingleton;

  if (opts.providerInitFails) providerInitFails = true; else providerInitFails = false;

  const m = new PerifericosModule();
  if (opts.noProvider) {
    // monkeypatch _loadProvider para simular fallo de require del provider
    m._loadProvider = function () {
      this.logger.error('perifericos.provider.load_error', { error: 'forced' });
      this.metrics?.increment('perifericos.errors', { kind: 'provider_load', code: 'DEPENDENCY_UNAVAILABLE' });
      return null;
    };
  }

  await m.onLoad({
    logger:   mocks.logger,
    metrics:  mocks.metrics,
    eventBus: mocks.eventBus,
    config:   { perifericos: { dataPath: '/tmp/perifericos-test', descubrimiento: { esp32_auto: false } } }
  });
  return { module: m, provider: m.provider };
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
  console.log('perifericos — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa estado limpio y carga el provider', async () => {
    const mocks = makeMocks();
    const { module: m, provider } = await instantiate(mocks);
    assert.strictEqual(m.name, 'perifericos');
    assert.strictEqual(m.version, '2.0.0');
    assert.ok(provider, 'provider debe estar cargado');
    assert.deepStrictEqual(m.internalMetrics, { envios_total: 0, envios_ok: 0, envios_error: 0, registros_total: 0 });
    await m.onUnload();
  });

  await testAsync('onUnload resetea metricas y no deja listeners MQTT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.internalMetrics.envios_total = 99;
    await m.onUnload();
    assert.deepStrictEqual(m.internalMetrics, { envios_total: 0, envios_ok: 0, envios_error: 0, registros_total: 0 });
    assert.strictEqual(m._onMqttMessage, null);
  });

  await testAsync('onLoad sin provider sigue arrancando con warn (DEPENDENCY_UNAVAILABLE)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { noProvider: true });
    assert.strictEqual(m.provider, null);
    const r = await m.handleListar({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.error.code, 'DEPENDENCY_UNAVAILABLE');
    await m.onUnload();
  });

  // ==========================================
  // Group 2: Validacion canonica de UI handlers
  // ==========================================

  await testAsync('handleGet sin nombre devuelve 400 VALIDATION_FAILED canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGet({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'VALIDATION_FAILED');
    assert.deepStrictEqual(r.error.details, { field: 'nombre' });
    await m.onUnload();
  });

  await testAsync('handleRegistrar sin nombre devuelve 400 VALIDATION_FAILED', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleRegistrar({ transporte: { tipo: 'tcp' } });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'VALIDATION_FAILED');
    assert.strictEqual(r.error.details.field, 'nombre');
    await m.onUnload();
  });

  await testAsync('handleRegistrar sin transporte.tipo devuelve 400 VALIDATION_FAILED', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleRegistrar({ nombre: 'caja' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.details.field, 'transporte.tipo');
    await m.onUnload();
  });

  await testAsync('handleListarPorCapacidad sin capacidad devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleListarPorCapacidad({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'VALIDATION_FAILED');
    await m.onUnload();
  });

  await testAsync('handleTestDispositivo / handleEstado / handleDesregistrar sin nombre → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    for (const fn of ['handleTestDispositivo', 'handleEstado', 'handleDesregistrar']) {
      const r = await m[fn]({});
      assert.ok(isCanonicalError(r), `${fn} debe devolver shape canonico`);
      assert.strictEqual(r.error.code, 'VALIDATION_FAILED', `${fn} code`);
    }
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Bus handlers — success paths con publish enriquecido
  // ==========================================

  await testAsync('onImprimir success publica periferico.impreso con correlation_id + project_id + timestamp', async () => {
    const mocks = makeMocks();
    const { module: m, provider } = await instantiate(mocks);
    // pre-registrar dispositivo
    await provider.register({ nombre: 'caja', tipo: 'impresora', capacidades: ['imprimir'], transporte: { tipo: 'tcp' } });
    mocks.published.length = 0;

    await m.onImprimir({
      data: {
        destino: 'caja', data: 'HOLA', formato: 'escpos', opciones: { copias: 2 },
        project_id: 'proj-X', correlation_id: 'cid-42'
      }
    });

    const evs = publishedOf(mocks, 'periferico.impreso');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid-42');
    assert.strictEqual(evs[0].project_id, 'proj-X');
    assert.ok(evs[0].timestamp);
    assert.strictEqual(evs[0].destino, 'caja');
    assert.strictEqual(evs[0].copias, 2);
    assert.strictEqual(m.internalMetrics.envios_ok, 1);
    await m.onUnload();
  });

  await testAsync('onAbrirCajon success envia comando ESC/POS y publica cajon-abierto', async () => {
    const mocks = makeMocks();
    const { module: m, provider } = await instantiate(mocks);
    await provider.register({ nombre: 'caja', tipo: 'impresora', capacidades: ['abrir-cajon'], transporte: { tipo: 'tcp' } });
    mocks.published.length = 0;

    await m.onAbrirCajon({ data: { destino: 'caja', pin: 1, project_id: 'p1' } });

    const sendCalls = providerSingleton.__proto__ ? [] : null; // mock no usa proto, los calls van en providerCalls
    const sendCall = providerCalls.find(c => c[0] === 'send' && c[1].opciones?.tipo_capacidad === 'abrir-cajon');
    assert.ok(sendCall, 'provider.send debe ser invocado');

    const evs = publishedOf(mocks, 'periferico.cajon-abierto');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].pin, 1);
    assert.strictEqual(evs[0].project_id, 'p1');
    await m.onUnload();
  });

  await testAsync('onRegistrar success publica periferico.dispositivo.registrado con source=event', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;

    await m.onRegistrar({ data: {
      nombre: 'tv-cocina', tipo: 'display', capacidades: ['display'],
      transporte: { tipo: 'tcp' }, project_id: 'proj-K'
    }});

    const evs = publishedOf(mocks, 'periferico.dispositivo.registrado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].source, 'event');
    assert.strictEqual(evs[0].project_id, 'proj-K');
    assert.ok(evs[0].correlation_id);
    assert.strictEqual(m.internalMetrics.registros_total, 1);
    await m.onUnload();
  });

  await testAsync('onDesregistrar publica periferico.dispositivo.desregistrado solo si removed=true', async () => {
    const mocks = makeMocks();
    const { module: m, provider } = await instantiate(mocks);
    await provider.register({ nombre: 'caja', tipo: 'impresora', transporte: { tipo: 'tcp' } });
    mocks.published.length = 0;

    await m.onDesregistrar({ data: { nombre: 'caja' } });
    assert.strictEqual(publishedOf(mocks, 'periferico.dispositivo.desregistrado').length, 1);

    mocks.published.length = 0;
    await m.onDesregistrar({ data: { nombre: 'inexistente' } });
    // unregister sobre inexistente devuelve removed=false → NO publish
    assert.strictEqual(publishedOf(mocks, 'periferico.dispositivo.desregistrado').length, 0);
    await m.onUnload();
  });

  await testAsync('onListar publica periferico.listado con dispositivos del registry', async () => {
    const mocks = makeMocks();
    const { module: m, provider } = await instantiate(mocks);
    await provider.register({ nombre: 'caja', tipo: 'impresora', capacidades: ['imprimir'], transporte: { tipo: 'tcp' } });
    await provider.register({ nombre: 'tv', tipo: 'display', capacidades: ['display'], transporte: { tipo: 'tcp' } });
    mocks.published.length = 0;

    await m.onListar({ data: { capacidad: 'imprimir', project_id: 'p1', correlation_id: 'cid-list' } });
    const evs = publishedOf(mocks, 'periferico.listado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid-list');
    assert.strictEqual(evs[0].project_id, 'p1');
    assert.strictEqual(evs[0].total, 1);
    assert.strictEqual(evs[0].dispositivos[0].nombre, 'caja');
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Bus handlers — error paths con publish y telemetria
  // ==========================================

  await testAsync('onImprimir sin destino publica periferico.error con code VALIDATION_FAILED', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;

    await m.onImprimir({ data: { data: 'HOLA' } });

    const errs = publishedOf(mocks, 'periferico.error');
    assert.strictEqual(errs.length, 1);
    assert.strictEqual(errs[0].kind, 'imprimir');
    assert.strictEqual(errs[0].code, 'VALIDATION_FAILED');
    assert.ok(errs[0].correlation_id);
    assert.strictEqual(publishedOf(mocks, 'periferico.impreso').length, 0);
    await m.onUnload();
  });

  await testAsync('onImprimir cuando provider.send falla publica periferico.error y mete metric envios.error', async () => {
    const mocks = makeMocks();
    const { module: m, provider } = await instantiate(mocks);
    await provider.register({ nombre: 'caja', tipo: 'impresora', transporte: { tipo: 'tcp' } });
    provider.setSendFail('caja', 'connection refused');
    mocks.published.length = 0; mocks.metricsCalls.length = 0;

    await m.onImprimir({ data: { destino: 'caja', data: 'HOLA' } });

    const errs = publishedOf(mocks, 'periferico.error');
    assert.strictEqual(errs.length, 1);
    assert.strictEqual(errs[0].code, 'EXTERNAL_API_FAILED');
    assert.strictEqual(errs[0].message, 'connection refused');
    assert.strictEqual(m.internalMetrics.envios_error, 1);
    const errorMetric = mocks.metricsCalls.find(c => c[0] === 'increment' && c[1] === 'perifericos.envios.error');
    assert.ok(errorMetric, 'debe haber metric perifericos.envios.error');
    await m.onUnload();
  });

  await testAsync('onEstado sin nombre publica periferico.estado.respuesta con error embed', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;

    await m.onEstado({ data: {} });

    const evs = publishedOf(mocks, 'periferico.estado.respuesta');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].error.code, 'VALIDATION_FAILED');
    await m.onUnload();
  });

  // ==========================================
  // Group 5: UI handlers success/error con shape canonico
  // ==========================================

  await testAsync('handleGet existente devuelve 200 con shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m, provider } = await instantiate(mocks);
    await provider.register({ nombre: 'caja', tipo: 'impresora', transporte: { tipo: 'tcp' } });
    const r = await m.handleGet({ nombre: 'caja' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.nombre, 'caja');
    await m.onUnload();
  });

  await testAsync('handleGet inexistente devuelve 404 RESOURCE_NOT_FOUND con entity_type', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGet({ nombre: 'fantasma' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(r.error.details.entity_type, 'periferico');
    assert.strictEqual(r.error.details.entity_id, 'fantasma');
    await m.onUnload();
  });

  await testAsync('handleRegistrar success devuelve 201 + publica dispositivo.registrado source=ui', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    const r = await m.handleRegistrar({
      nombre: 'caja', tipo: 'impresora', transporte: { tipo: 'tcp', config: {} }, project_id: 'p1'
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 201);
    const evs = publishedOf(mocks, 'periferico.dispositivo.registrado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].source, 'ui');
    assert.strictEqual(evs[0].project_id, 'p1');
    await m.onUnload();
  });

  await testAsync('handleActualizar sobre nombre inexistente devuelve 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleActualizar({ nombre: 'fantasma', metadata: { x: 1 } });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleTestDispositivo cuando provider.send falla devuelve 502 EXTERNAL_API_FAILED', async () => {
    const mocks = makeMocks();
    const { module: m, provider } = await instantiate(mocks);
    await provider.register({ nombre: 'caja', tipo: 'impresora', transporte: { tipo: 'tcp' } });
    provider.setSendFail('caja', 'broker down');
    const r = await m.handleTestDispositivo({ nombre: 'caja' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 502);
    assert.strictEqual(r.error.code, 'EXTERNAL_API_FAILED');
    await m.onUnload();
  });

  await testAsync('handleListar devuelve 200 con dispositivos del registry', async () => {
    const mocks = makeMocks();
    const { module: m, provider } = await instantiate(mocks);
    await provider.register({ nombre: 'caja', tipo: 'impresora', capacidades: ['imprimir'], transporte: { tipo: 'tcp' } });
    const r = await m.handleListar({});
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.total, 1);
    await m.onUnload();
  });

  // ==========================================
  // Group 6: Auto-descubrimiento MQTT — _handleDiscoveryMessage
  // ==========================================

  await testAsync('_handleDiscoveryMessage parsea topic impresion/<proj>/status/<dev> y auto-registra', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    providerCalls.length = 0;

    const payload = JSON.stringify({
      device_id: 'esp32-cocina-01', tipo: 'impresora-termica',
      capacidades: ['imprimir'], firmware: '1.2.3'
    });
    await m._handleDiscoveryMessage('impresion/proj-A/status/esp32-cocina-01', payload);

    const regCall = providerCalls.find(c => c[0] === 'register');
    assert.ok(regCall, 'provider.register llamado');
    assert.strictEqual(regCall[1].nombre, 'esp32-cocina-01');
    const evs = publishedOf(mocks, 'periferico.dispositivo.registrado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].source, 'autodiscovery');
    assert.strictEqual(evs[0].project_id, 'proj-A');
    await m.onUnload();
  });

  await testAsync('_handleDiscoveryMessage idempotente: si ya existe, solo actualiza estado a online', async () => {
    const mocks = makeMocks();
    const { module: m, provider } = await instantiate(mocks);
    await provider.register({ nombre: 'esp32-bar-01', tipo: 'impresora', transporte: { tipo: 'esp32-proxy', config: {} } });
    mocks.published.length = 0; providerCalls.length = 0;

    const payload = JSON.stringify({ device_id: 'esp32-bar-01' });
    await m._handleDiscoveryMessage('enki/proj-B/status/esp32-bar-01', payload);

    assert.strictEqual(providerCalls.filter(c => c[0] === 'register').length, 0,
      'NO debe re-registrar dispositivo existente');
    assert.strictEqual(publishedOf(mocks, 'periferico.dispositivo.registrado').length, 0);
    await m.onUnload();
  });

  await testAsync('_handleDiscoveryMessage ignora topics que no matchean los 3 patrones', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    providerCalls.length = 0;
    await m._handleDiscoveryMessage('random/topic/foo', '{}');
    await m._handleDiscoveryMessage('devices/p1/d1/lwt', '{}');
    assert.strictEqual(providerCalls.filter(c => c[0] === 'register').length, 0);
    await m.onUnload();
  });

  await testAsync('_parsePayload maneja string, Buffer y JSON invalido sin throw', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.deepStrictEqual(m._parsePayload('{"a":1}'), { a: 1 });
    assert.deepStrictEqual(m._parsePayload(Buffer.from('{"b":2}')), { b: 2 });
    assert.strictEqual(m._parsePayload('not json'), null);
    assert.deepStrictEqual(m._parsePayload({ c: 3 }), { c: 3 });
    await m.onUnload();
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
    assert.strictEqual(m._classifyHandlerError(new Error('no encontrado')),     'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'VALIDATION_FAILED');
    assert.strictEqual(m._classifyHandlerError(new Error('forbidden access')),  'AUTHORIZATION_REQUIRED');
    assert.strictEqual(m._classifyHandlerError(new Error('already exists')),    'CONFLICT');
    assert.strictEqual(m._classifyHandlerError(new Error('something exploded')),'INTERNAL_ERROR');
    await m.onUnload();
  });

  await testAsync('_publicarEvento hereda correlation_id + project_id si se pasa, genera si no', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { foo: 1 }, { correlation_id: 'cid-X', project_id: 'p-X' });
    await m._publicarEvento('test.event', { bar: 2 });
    const evs = publishedOf(mocks, 'test.event');
    assert.strictEqual(evs.length, 2);
    assert.strictEqual(evs[0].correlation_id, 'cid-X');
    assert.strictEqual(evs[0].project_id, 'p-X');
    assert.notStrictEqual(evs[1].correlation_id, 'cid-X');
    assert.strictEqual(evs[1].project_id, 'default');
    assert.ok(typeof evs[1].correlation_id === 'string' && evs[1].correlation_id.length > 0);
    assert.ok(evs[0].timestamp && evs[1].timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError mapea status segun code y registra metric perifericos.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.metricsCalls.length = 0;
    const err = Object.assign(new Error('not found'), { _code: 'RESOURCE_NOT_FOUND', _details: { e: 1 } });
    const r = m._handleHandlerError('test.failed', err, 'kind');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.deepStrictEqual(r.error.details, { e: 1 });
    const errMetric = mocks.metricsCalls.find(c => c[0] === 'increment' && c[1] === 'perifericos.errors');
    assert.ok(errMetric, 'debe registrar metric perifericos.errors');
    assert.deepStrictEqual(errMetric[2], { kind: 'kind', code: 'RESOURCE_NOT_FOUND' });

    // Nuevos codes mapeados
    const r502 = m._handleHandlerError('t', new Error('x'), 'k');
    void r502;
    const r503 = m._handleHandlerError('t', Object.assign(new Error('x'), { _code: 'DEPENDENCY_UNAVAILABLE' }), 'k');
    assert.strictEqual(r503.status, 503);
    const rExt = m._handleHandlerError('t', Object.assign(new Error('x'), { _code: 'EXTERNAL_API_FAILED' }), 'k');
    assert.strictEqual(rExt.status, 502);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})();

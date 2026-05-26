/**
 * Tests unitarios — facturas (POC2 reescritura).
 *
 * Mocks: ServiceExecutor + InvoicePipeline + PipelineMetrics via require cache injection.
 * Tests aislados con tmpdir cuando se necesita filesystem real.
 *
 * Ejecutar: node tests/unit/facturas.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const fsp    = require('fs').promises;
const os     = require('os');

// --------------------------------------------------
// Mock infra — interceptar require ANTES de cargar el modulo
// --------------------------------------------------

const SERVICE_EXEC_PATH = require.resolve('../../core/service-executor');
const PIPELINE_PATH     = require.resolve('../../modules/facturas/pipeline/invoice-pipeline');
const METRICS_PATH      = require.resolve('../../modules/facturas/pipeline/pipeline-metrics');

let serviceCalls;
let serviceResponses;

class MockServiceExecutor {
  constructor(eventBus, logger) {
    this.eventBus = eventBus;
    this.logger   = logger;
  }
  async call(service, action, params, opts) {
    serviceCalls.push({ service, action, params, opts });
    const key      = `${service}/${action}`;
    const response = serviceResponses[key];
    if (response === undefined) return { success: true, data: {} };
    if (response instanceof Error) throw response;
    if (typeof response === 'function') return response(params);
    return response;
  }
}

let pipelineProcessImpl;

class MockInvoicePipeline {
  constructor(deps) { this.deps = deps; }
  async process(filePath, projectId, options) {
    if (typeof pipelineProcessImpl === 'function') {
      return pipelineProcessImpl(filePath, projectId, options);
    }
    return { success: true, facturaId: 'F-1', estructura: {}, metrics: { totalDuration: 100 } };
  }
}

let metricsRecords;
class MockPipelineMetrics {
  constructor(coreMetrics, logger) { this.coreMetrics = coreMetrics; this.logger = logger; }
  record(result)         { metricsRecords.push(result); }
  getDashboard()         { return { recent: metricsRecords.length, total: metricsRecords.length }; }
}

require.cache[SERVICE_EXEC_PATH] = { exports: MockServiceExecutor, id: SERVICE_EXEC_PATH, filename: SERVICE_EXEC_PATH, loaded: true };
require.cache[PIPELINE_PATH]     = { exports: MockInvoicePipeline, id: PIPELINE_PATH,     filename: PIPELINE_PATH,     loaded: true };
require.cache[METRICS_PATH]      = { exports: MockPipelineMetrics, id: METRICS_PATH,     filename: METRICS_PATH,     loaded: true };

delete require.cache[require.resolve('../../modules/facturas/index.js')];
const FacturasModule = require('../../modules/facturas/index.js');

// --------------------------------------------------
// Mock infra
// --------------------------------------------------

function makeMocks() {
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

  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); }
  };

  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

const tmpDirs = [];
function makeTmpFile(contents = 'pdf-bytes') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'facturas-test-'));
  tmpDirs.push(dir);
  const f = path.join(dir, 'sample.pdf');
  fs.writeFileSync(f, contents);
  return f;
}
function cleanupTmp() {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

async function instantiate(mocks) {
  serviceCalls       = [];
  serviceResponses   = {};
  metricsRecords     = [];
  pipelineProcessImpl = null;

  const m = new FacturasModule();
  await m.onLoad({
    logger:    mocks.logger,
    eventBus:  mocks.eventBus,
    metrics:   mocks.metrics,
    uiHandler: {}
  });
  return { module: m };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); cleanupTmp(); process.exit(1); }
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
  console.log('facturas — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa services + pipeline + pipelineMetrics', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'facturas');
    assert.strictEqual(m.version, '3.0.0');
    assert.ok(m.services);
    assert.ok(m.pipeline);
    assert.ok(m.pipelineMetrics);
    await m.onUnload();
  });

  await testAsync('onUnload libera referencias internas', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onUnload();
    assert.strictEqual(m.services, null);
    assert.strictEqual(m.pipeline, null);
    assert.strictEqual(m.pipelineMetrics, null);
  });

  // ==========================================
  // Group 2: Validacion canonica de UI handlers + tools
  // ==========================================

  await testAsync('handleProcesar / handleSubir / handleReprocesar / etc. sin args → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    for (const fn of ['handleProcesar', 'handleSubir', 'handleReprocesar', 'handleListar', 'handleObtener', 'handleActualizar', 'handleEstadisticas', 'handleExportar']) {
      const r = await m[fn]({});
      assert.ok(isCanonicalError(r), `${fn} debe devolver shape canonico`);
      assert.strictEqual(r.error.code, 'INVALID_INPUT', `${fn} code`);
    }
    await m.onUnload();
  });

  await testAsync('handleToolProcesar / handleToolListar / handleToolEstadisticas sin args → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual((await m.handleToolProcesar({})).error.code, 'INVALID_INPUT');
    assert.strictEqual((await m.handleToolListar({})).error.code, 'INVALID_INPUT');
    assert.strictEqual((await m.handleToolEstadisticas({})).error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleProcesar con archivo inexistente → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleProcesar({ proyecto: 'p1', filePath: '/no/existe.pdf' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Bus subscribes — onFacturaEntrada emite ciclo de eventos
  // ==========================================

  await testAsync('onFacturaEntrada con archivo valido emite recibida + procesada con correlation_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const f = makeTmpFile();
    pipelineProcessImpl = async () => ({ success: true, facturaId: 'F-99', estructura: {}, metrics: { totalDuration: 50 } });

    await m.onFacturaEntrada({ data: {
      projectId: 'p1', filePath: f, source: 'manual', project_id: 'p1', correlation_id: 'cid-AA'
    }});

    const recibidas = publishedOf(mocks, 'factura.recibida');
    const procesadas = publishedOf(mocks, 'factura.procesada');
    assert.strictEqual(recibidas.length, 1);
    assert.strictEqual(procesadas.length, 1);
    assert.strictEqual(recibidas[0].correlation_id, 'cid-AA');
    assert.strictEqual(recibidas[0].project_id, 'p1');
    assert.ok(recibidas[0].timestamp);
    assert.strictEqual(procesadas[0].factura_id, 'F-99');
    assert.strictEqual(metricsRecords.length, 1, 'pipelineMetrics.record llamado');
    await m.onUnload();
  });

  await testAsync('onFacturaEntrada con archivo inexistente loguea + emite factura.error y NO recibida', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.onFacturaEntrada({ data: { projectId: 'p1', filePath: '/no/existe.pdf', source: 'manual' } });

    assert.strictEqual(publishedOf(mocks, 'factura.recibida').length, 0);
    const errs = publishedOf(mocks, 'factura.error');
    assert.strictEqual(errs.length, 1);
    assert.strictEqual(errs[0].code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(errs[0].project_id, 'p1');
    await m.onUnload();
  });

  await testAsync('onFacturaEntrada cuando pipeline.process falla emite factura.error', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const f = makeTmpFile();
    pipelineProcessImpl = async () => { throw new Error('pipeline boom'); };

    await m.onFacturaEntrada({ data: { projectId: 'p1', filePath: f, source: 'manual' } });

    const errs = publishedOf(mocks, 'factura.error');
    assert.strictEqual(errs.length, 1);
    assert.strictEqual(errs[0].code, 'UNKNOWN_ERROR');
    assert.ok(errs[0].message.includes('pipeline boom'));
    await m.onUnload();
  });

  await testAsync('onFacturaEntrada con source=telegram envia notificacion fire-and-forget con UUID v4', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const f = makeTmpFile();
    pipelineProcessImpl = async () => ({ success: true, facturaId: 'F-1', estructura: { emisor: { nombre: 'ACME' }, totales: { total_factura: 99 }, factura: { numero: '001' } }, metrics: {} });

    await m.onFacturaEntrada({ data: { projectId: 'p1', filePath: f, source: 'telegram', origen: { botName: 'mibot', chatId: '123' } }});

    const tg = publishedOf(mocks, 'telegram.send_message.request');
    assert.strictEqual(tg.length, 1);
    assert.strictEqual(tg[0].botName, 'mibot');
    assert.strictEqual(tg[0].chatId, '123');
    assert.ok(tg[0].request_id, 'request_id presente');
    assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tg[0].request_id), 'UUID v4 format');
    assert.ok(tg[0].text.includes('ACME'));
    await m.onUnload();
  });

  // ==========================================
  // Group 4: UI handlers success con ServiceExecutor mockeado
  // ==========================================

  await testAsync('handleProcesar success devuelve 200 + data.success=true', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const f = makeTmpFile();
    pipelineProcessImpl = async () => ({ success: true, facturaId: 'F-1' });
    const r = await m.handleProcesar({ proyecto: 'p1', filePath: f });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.success, true);
    await m.onUnload();
  });

  await testAsync('handleProcesar duplicate → 409', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const f = makeTmpFile();
    pipelineProcessImpl = async () => ({ success: false, duplicate: true });
    const r = await m.handleProcesar({ proyecto: 'p1', filePath: f });
    assert.strictEqual(r.status, 409);
    await m.onUnload();
  });

  await testAsync('handleListar delega a local.facturas-db.listar via services', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    serviceResponses['local.facturas-db/listar'] = { data: { facturas: [{ id: 1 }], total: 1 } };
    const r = await m.handleListar({ proyecto: 'p1', estado: 'procesada' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.total, 1);
    const call = serviceCalls.find(c => c.service === 'local.facturas-db' && c.action === 'listar');
    assert.ok(call);
    assert.strictEqual(call.params.proyecto, 'p1');
    assert.strictEqual(call.params.estado, 'procesada');
    await m.onUnload();
  });

  await testAsync('handleObtener cuando services devuelve falsy → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    serviceResponses['local.facturas-db/obtener'] = { data: null };
    const r = await m.handleObtener({ proyecto: 'p1', id: 'X' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleEstadisticas adapta el shape para frontend', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    serviceResponses['local.facturas-db/estadisticas'] = {
      data: { general: { total: 5, pendientes: 1, procesadas: 3, errores: 1, exportadas: 0 }, porSource: [{ source: 'manual', count: 5 }] }
    };
    const r = await m.handleEstadisticas({ proyecto: 'p1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.total, 5);
    assert.strictEqual(r.data.procesadas, 3);
    assert.strictEqual(r.data.porSource.length, 1);
    await m.onUnload();
  });

  await testAsync('handleReprocesar con factura no encontrada → 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    serviceResponses['local.facturas-db/obtener'] = new Error('no existe');
    const r = await m.handleReprocesar({ proyecto: 'p1', id: 'X' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  // ==========================================
  // Group 5: handleExportar — CSV + publish factura.exportada
  // ==========================================

  await testAsync('handleExportar genera CSV fiscal y publica factura.exportada con project_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    const proyecto = 'test-export-' + Date.now();

    serviceResponses['local.facturas-db/exportar'] = { data: {
      facturas: [
        {
          'Fecha Factura': '2025-01-15', 'Nº Factura': 'F-001',
          'NIF Proveedor': 'B12345678', 'Proveedor': 'ACME S.L.',
          'Concepto': 'Servicios', 'Base Imponible': 100, '% IVA': 21, 'Cuota IVA': 21, 'Total': 121
        }
      ],
      total: 121, ids: [1], semana: '2025-W03'
    }};
    serviceResponses['local.facturas-db/marcarExportadas'] = { success: true };

    const r = await m.handleExportar({ proyecto, project_id: proyecto, correlation_id: 'cid-EXP' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.path.endsWith('.csv'));
    assert.strictEqual(r.data.mimeType, 'text/csv');

    const csvContent = await fsp.readFile(r.data.path, 'utf-8');
    assert.ok(csvContent.startsWith('﻿'), 'BOM al inicio');
    assert.ok(csvContent.includes('B12345678'));
    assert.ok(csvContent.includes('ACME S.L.'));

    const evs = publishedOf(mocks, 'factura.exportada');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].project_id, proyecto);
    assert.strictEqual(evs[0].correlation_id, 'cid-EXP');
    assert.strictEqual(evs[0].total, 121);

    const marcar = serviceCalls.find(c => c.action === 'marcarExportadas');
    assert.ok(marcar, 'services.marcarExportadas llamado');
    assert.deepStrictEqual(marcar.params.ids, [1]);

    try {
      const dir = path.join(process.cwd(), 'data/projects', proyecto);
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
    await m.onUnload();
  });

  // ==========================================
  // Group 6: Helpers internos
  // ==========================================

  await testAsync('_escapeCsv envuelve valores con ;,\\\",\\n y duplica comillas', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._escapeCsv('hola'), 'hola');
    assert.strictEqual(m._escapeCsv('a;b'), '"a;b"');
    assert.strictEqual(m._escapeCsv('a"b'), '"a""b"');
    assert.strictEqual(m._escapeCsv('a\nb'), '"a\nb"');
    assert.strictEqual(m._escapeCsv(123), '123');
    await m.onUnload();
  });

  await testAsync('_calcularSemanaISO devuelve formato YYYY-Www con padding', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const w = m._calcularSemanaISO(new Date('2025-01-15T00:00:00Z'));
    assert.ok(/^\d{4}-W\d{2}$/.test(w), `formato invalido: ${w}`);
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

  await testAsync('_classifyHandlerError mapea ENOENT/EACCES/EEXIST/timeout', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'ENOENT' })), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'EACCES' })), 'PERMISSION_DENIED');
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'EEXIST' })), 'ALREADY_EXISTS');
    assert.strictEqual(m._classifyHandlerError(new Error('connection timeout')), 'UPSTREAM_TIMEOUT');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('weird')), 'UNKNOWN_ERROR');
    await m.onUnload();
  });

  await testAsync('_publicarEvento hereda correlation_id + project_id, defaultea a "default"', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { x: 1 }, { correlation_id: 'cid-Z', project_id: 'p-Z' });
    await m._publicarEvento('test.event', { y: 2 });
    const evs = publishedOf(mocks, 'test.event');
    assert.strictEqual(evs[0].correlation_id, 'cid-Z');
    assert.strictEqual(evs[0].project_id, 'p-Z');
    assert.notStrictEqual(evs[1].correlation_id, 'cid-Z');
    assert.strictEqual(evs[1].project_id, 'default');
    assert.ok(evs[0].timestamp && evs[1].timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError mapea status y registra metric facturas.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.metricsCalls.length = 0;
    const err = Object.assign(new Error('not found'), { _code: 'RESOURCE_NOT_FOUND', _details: { e: 1 } });
    const r = m._handleHandlerError('t.failed', err, 'kind');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    const metric = mocks.metricsCalls.find(c => c[1] === 'facturas.errors');
    assert.ok(metric, 'metric facturas.errors');
    assert.deepStrictEqual(metric[2], { kind: 'kind', code: 'RESOURCE_NOT_FOUND' });
    await m.onUnload();
  });

  cleanupTmp();
  console.log('\nTodos los tests pasaron.');
})();

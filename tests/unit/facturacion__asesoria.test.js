/**
 * Tests unitarios — facturacion__asesoria (POC2 reescritura).
 *
 * Cubre 7 grupos:
 *   1. Lifecycle
 *   2. Validacion canonica
 *   3. handleGenerarPaquete (success + error path emite asesoria.paquete.error)
 *   4. handleHistorial + handleDescargar (path traversal seguro)
 *   5. handlePreview + tools
 *   6. CSV generation (separator, decimal, BOM, escaping, totales)
 *   7. Helpers POC2
 *
 * Ejecutar: node tests/unit/facturacion__asesoria.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const AsesoriaModule = require('../../modules/facturacion/asesoria/index.js');

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
    timing:    (n, ms, l) => metricsCalls.push(['timing', n, ms, l])
  };

  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); }
  };

  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

let _tmpRoot = null;
function setupTmpCwd() {
  _tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'asesoria-test-'));
  process.chdir(_tmpRoot);
}
function teardownTmpCwd(originalCwd) {
  process.chdir(originalCwd);
  if (_tmpRoot && fs.existsSync(_tmpRoot)) {
    fs.rmSync(_tmpRoot, { recursive: true, force: true });
  }
  _tmpRoot = null;
}

async function instantiate(mocks, opts = {}) {
  const m = new AsesoriaModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    moduleConfig: opts.config || undefined
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

const SAMPLE_FACTURAS = [
  {
    id: 'f1', factura_fecha: '2026-03-05', factura_numero: 'A-001',
    proveedor_nif: 'B12345678', proveedor_nombre: 'Proveedor Uno SL',
    concepto: 'Material', base_imponible: 100, tipo_iva: 21, cuota_iva: 21,
    total_factura: 121, metodo_pago: 'transferencia', nombre_archivo: 'f1.pdf',
    path_original: null
  },
  {
    id: 'f2', factura_fecha: '2026-03-15', factura_numero: 'B-002',
    proveedor_nif: 'A87654321', proveedor_nombre: 'Proveedor "Dos"; SA',
    concepto: 'Servicios; varios', base_imponible: 200, tipo_iva: 10, cuota_iva: 20,
    total_factura: 220, metodo_pago: 'tarjeta', nombre_archivo: 'f2.pdf'
  }
];

// ==================================================
//                                                Tests
// ==================================================

(async () => {
  const originalCwd = process.cwd();
  console.log('facturacion__asesoria — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa estado limpio + config defaults', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'asesoria');
    assert.strictEqual(m.version, '2.0.0');
    assert.strictEqual(m.config.csv.separator, ';');
    assert.strictEqual(m.config.csv.decimal, ',');
    assert.strictEqual(m.config.csv.bom, true);
    assert.strictEqual(m.config.timeouts.db, 30000);
    await m.onUnload();
  });

  await testAsync('onLoad permite override de config via moduleConfig', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, {
      config: { csv: { separator: ',', decimal: '.', bom: false } }
    });
    assert.strictEqual(m.config.csv.separator, ',');
    assert.strictEqual(m.config.csv.decimal, '.');
    assert.strictEqual(m.config.csv.bom, false);
    await m.onUnload();
  });

  // ==========================================
  // Group 2: Validacion canonica
  // ==========================================

  await testAsync('handleGenerarPaquete sin proyecto devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGenerarPaquete({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleHistorial sin proyecto devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHistorial({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleDescargar sin archivo devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleDescargar({ proyecto: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handlePreview sin proyecto devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handlePreview({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleToolGenerarPaquete sin projectId devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleToolGenerarPaquete({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: handleGenerarPaquete
  // ==========================================

  await testAsync('handleGenerarPaquete sin facturas emite asesoria.paquete.error con correlation_id + project_id', async () => {
    setupTmpCwd();
    try {
      const mocks = makeMocks();
      const servicesMock = async (mod, action) => {
        if (mod === 'local.facturas-db' && action === 'listar') return { data: { facturas: [] } };
        throw new Error(`unexpected: ${mod}.${action}`);
      };
      const { module: m } = await instantiate(mocks, { servicesMock });
      const r = await m.handleGenerarPaquete({ proyecto: 'p1', correlation_id: 'cid-1' });
      assert.ok(isCanonicalError(r));
      assert.strictEqual(r.status, 400);
      assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
      const errEvents = publishedOf(mocks, 'asesoria.paquete.error');
      assert.strictEqual(errEvents.length, 1);
      assert.strictEqual(errEvents[0].correlation_id, 'cid-1');
      assert.strictEqual(errEvents[0].project_id, 'p1');
      assert.ok(errEvents[0].timestamp);
      await m.onUnload();
    } finally { teardownTmpCwd(originalCwd); }
  });

  await testAsync('handleGenerarPaquete success emite asesoria.paquete.generado con correlation_id + project_id top-level', async () => {
    setupTmpCwd();
    try {
      const mocks = makeMocks();
      const servicesMock = async (mod, action, params) => {
        if (mod === 'local.facturas-db') return { data: { facturas: SAMPLE_FACTURAS } };
        if (mod === 'local.zip') {
          const outPath = path.resolve(params.output);
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, 'fake-zip-content');
          return { data: { success: true, files: params.files.length, size: 100 } };
        }
        throw new Error(`unexpected: ${mod}.${action}`);
      };
      const { module: m } = await instantiate(mocks, { servicesMock });
      const r = await m.handleGenerarPaquete({
        proyecto: 'p1', periodo: '2026-03', incluirOriginales: false,
        correlation_id: 'cid-ok'
      });
      assert.ok(isCanonicalSuccess(r), 'shape canonico exito');
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.data.facturas, 2);
      assert.strictEqual(r.data.periodo, '2026-03');
      assert.ok(r.data.contenido, 'base64 inline para descarga');
      assert.strictEqual(r.data.mimeType, 'application/zip');

      const okEvents = publishedOf(mocks, 'asesoria.paquete.generado');
      assert.strictEqual(okEvents.length, 1);
      assert.strictEqual(okEvents[0].correlation_id, 'cid-ok');
      assert.strictEqual(okEvents[0].project_id, 'p1');
      assert.strictEqual(okEvents[0].facturas, 2);
      assert.ok(okEvents[0].timestamp);
      assert.ok(typeof okEvents[0].duration_ms === 'number');
      await m.onUnload();
    } finally { teardownTmpCwd(originalCwd); }
  });

  await testAsync('handleGenerarPaquete con DB timeout emite asesoria.paquete.error', async () => {
    setupTmpCwd();
    try {
      const mocks = makeMocks();
      const servicesMock = async () => { throw new Error('timeout while calling db'); };
      const { module: m } = await instantiate(mocks, { servicesMock });
      const r = await m.handleGenerarPaquete({ proyecto: 'p2', correlation_id: 'cid-err' });
      assert.ok(isCanonicalError(r));
      assert.strictEqual(r.error.code, 'TIMEOUT');
      const errEvents = publishedOf(mocks, 'asesoria.paquete.error');
      assert.strictEqual(errEvents.length, 1);
      assert.strictEqual(errEvents[0].correlation_id, 'cid-err');
      await m.onUnload();
    } finally { teardownTmpCwd(originalCwd); }
  });

  await testAsync('handleGenerarPaquete success registra metric + timing', async () => {
    setupTmpCwd();
    try {
      const mocks = makeMocks();
      const servicesMock = async (mod, action, params) => {
        if (mod === 'local.facturas-db') return { data: { facturas: SAMPLE_FACTURAS } };
        if (mod === 'local.zip') {
          const outPath = path.resolve(params.output);
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, 'zip');
          return { data: { success: true, files: 2, size: 100 } };
        }
      };
      const { module: m } = await instantiate(mocks, { servicesMock });
      await m.handleGenerarPaquete({ proyecto: 'p1' });
      assert.ok(mocks.metricsCalls.some(c =>
        c[0] === 'increment' && c[1] === 'asesoria.paquetes.generados.total'
      ));
      assert.ok(mocks.metricsCalls.some(c =>
        c[0] === 'timing' && c[1] === 'asesoria.generacion.duration'
      ));
      await m.onUnload();
    } finally { teardownTmpCwd(originalCwd); }
  });

  // ==========================================
  // Group 4: handleHistorial + handleDescargar
  // ==========================================

  await testAsync('handleHistorial dir vacio devuelve total=0', async () => {
    setupTmpCwd();
    try {
      const mocks = makeMocks();
      const { module: m } = await instantiate(mocks);
      const r = await m.handleHistorial({ proyecto: 'p1' });
      assert.ok(isCanonicalSuccess(r));
      assert.strictEqual(r.data.total, 0);
      assert.deepStrictEqual(r.data.paquetes, []);
      await m.onUnload();
    } finally { teardownTmpCwd(originalCwd); }
  });

  await testAsync('handleHistorial lista solo .zip ordenados por fecha desc', async () => {
    setupTmpCwd();
    try {
      const mocks = makeMocks();
      const { module: m } = await instantiate(mocks);
      const dir = path.join(process.cwd(), 'data/projects/p1/storage/export/asesoria');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'old.zip'), 'a');
      fs.writeFileSync(path.join(dir, 'readme.txt'), 'should-skip');
      await new Promise(r => setTimeout(r, 20));
      fs.writeFileSync(path.join(dir, 'new.zip'), 'b');
      const r = await m.handleHistorial({ proyecto: 'p1' });
      assert.strictEqual(r.data.total, 2);
      assert.strictEqual(r.data.paquetes[0].nombre, 'new.zip');
      assert.strictEqual(r.data.paquetes[1].nombre, 'old.zip');
      await m.onUnload();
    } finally { teardownTmpCwd(originalCwd); }
  });

  await testAsync('handleDescargar archivo inexistente devuelve 404 RESOURCE_NOT_FOUND', async () => {
    setupTmpCwd();
    try {
      const mocks = makeMocks();
      const { module: m } = await instantiate(mocks);
      const r = await m.handleDescargar({ proyecto: 'p1', archivo: 'no-existe.zip' });
      assert.ok(isCanonicalError(r));
      assert.strictEqual(r.status, 404);
      assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
      await m.onUnload();
    } finally { teardownTmpCwd(originalCwd); }
  });

  await testAsync('handleDescargar con archivo legitimo devuelve base64 + mimeType', async () => {
    setupTmpCwd();
    try {
      const mocks = makeMocks();
      const { module: m } = await instantiate(mocks);
      const dir = path.join(process.cwd(), 'data/projects/p1/storage/export/asesoria');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'paquete.zip'), 'hola');
      const r = await m.handleDescargar({ proyecto: 'p1', archivo: 'paquete.zip' });
      assert.ok(isCanonicalSuccess(r));
      assert.strictEqual(r.data.nombre, 'paquete.zip');
      assert.strictEqual(r.data.mimeType, 'application/zip');
      assert.strictEqual(Buffer.from(r.data.contenido, 'base64').toString(), 'hola');
      await m.onUnload();
    } finally { teardownTmpCwd(originalCwd); }
  });

  await testAsync('handleDescargar con path traversal sanea via path.basename y devuelve 404', async () => {
    setupTmpCwd();
    try {
      const mocks = makeMocks();
      const { module: m } = await instantiate(mocks);
      const r = await m.handleDescargar({ proyecto: 'p1', archivo: '../../../etc/passwd' });
      assert.ok(isCanonicalError(r));
      assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
      await m.onUnload();
    } finally { teardownTmpCwd(originalCwd); }
  });

  // ==========================================
  // Group 5: handlePreview + tools
  // ==========================================

  await testAsync('handlePreview devuelve facturas + totales sin generar archivos', async () => {
    setupTmpCwd();
    try {
      const mocks = makeMocks();
      const servicesMock = async (mod, action) => {
        if (mod === 'local.facturas-db' && action === 'listar') {
          return { data: { facturas: SAMPLE_FACTURAS } };
        }
        throw new Error(`unexpected: ${mod}.${action}`);
      };
      const { module: m } = await instantiate(mocks, { servicesMock });
      const r = await m.handlePreview({ proyecto: 'p1' });
      assert.ok(isCanonicalSuccess(r));
      assert.strictEqual(r.data.facturas, 2);
      assert.strictEqual(r.data.totales.base, 300);
      assert.strictEqual(r.data.totales.iva, 41);
      assert.strictEqual(r.data.totales.total, 341);
      assert.strictEqual(r.data.desglose.length, 2);
      await m.onUnload();
    } finally { teardownTmpCwd(originalCwd); }
  });

  await testAsync('handleToolGenerarPaquete shape canonico con projectId valido', async () => {
    setupTmpCwd();
    try {
      const mocks = makeMocks();
      const servicesMock = async (mod, action, params) => {
        if (mod === 'local.facturas-db') return { data: { facturas: SAMPLE_FACTURAS } };
        if (mod === 'local.zip') {
          const outPath = path.resolve(params.output);
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, 'zip');
          return { data: { success: true, files: 2, size: 100 } };
        }
      };
      const { module: m } = await instantiate(mocks, { servicesMock });
      const r = await m.handleToolGenerarPaquete({ projectId: 'p1' });
      assert.ok(isCanonicalSuccess(r));
      assert.strictEqual(r.data.success, true);
      assert.strictEqual(r.data.facturas, 2);
      await m.onUnload();
    } finally { teardownTmpCwd(originalCwd); }
  });

  await testAsync('handleToolHistorial delega a handleHistorial con remap projectId->proyecto', async () => {
    setupTmpCwd();
    try {
      const mocks = makeMocks();
      const { module: m } = await instantiate(mocks);
      const r = await m.handleToolHistorial({ projectId: 'p1' });
      assert.ok(isCanonicalSuccess(r));
      assert.strictEqual(r.data.total, 0);
      await m.onUnload();
    } finally { teardownTmpCwd(originalCwd); }
  });

  // ==========================================
  // Group 6: CSV generation
  // ==========================================

  await testAsync('_generarCSV produce header + filas + TOTALES con separator ;', async () => {
    setupTmpCwd();
    try {
      const mocks = makeMocks();
      const { module: m } = await instantiate(mocks);
      const out = path.join(process.cwd(), 'test.csv');
      m._generarCSV(out, SAMPLE_FACTURAS);
      const content = fs.readFileSync(out, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      assert.ok(lines[0].startsWith('﻿Fecha;'), 'BOM + header con sep ;');
      assert.strictEqual(lines.length, 4);
      assert.ok(lines[lines.length - 1].includes('TOTALES'));
      await m.onUnload();
    } finally { teardownTmpCwd(originalCwd); }
  });

  await testAsync('_generarCSV escapa valores con ; / " / newline', async () => {
    setupTmpCwd();
    try {
      const mocks = makeMocks();
      const { module: m } = await instantiate(mocks);
      const out = path.join(process.cwd(), 'test.csv');
      m._generarCSV(out, SAMPLE_FACTURAS);
      const content = fs.readFileSync(out, 'utf-8');
      assert.ok(content.includes('"Proveedor ""Dos""; SA"'), 'escape de " y ;');
      await m.onUnload();
    } finally { teardownTmpCwd(originalCwd); }
  });

  await testAsync('_formatNumber usa decimal , canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._formatNumber(100), '100,00');
    assert.strictEqual(m._formatNumber(21.5), '21,50');
    assert.strictEqual(m._formatNumber(null), '');
    assert.strictEqual(m._formatNumber('abc'), '');
    await m.onUnload();
  });

  await testAsync('_calcularTotales suma base + iva + total', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const t = m._calcularTotales(SAMPLE_FACTURAS);
    assert.strictEqual(t.base, 300);
    assert.strictEqual(t.iva, 41);
    assert.strictEqual(t.total, 341);
    await m.onUnload();
  });

  await testAsync('_obtenerFacturasProcesadas filtra por periodo YYYY-MM y ordena asc', async () => {
    const mocks = makeMocks();
    const facturas = [
      { id: 'a', factura_fecha: '2026-04-01', total_factura: 1 },
      { id: 'b', factura_fecha: '2026-03-15', total_factura: 2 },
      { id: 'c', factura_fecha: '2026-03-05', total_factura: 3 }
    ];
    const servicesMock = async () => ({ data: { facturas } });
    const { module: m } = await instantiate(mocks, { servicesMock });
    const r = await m._obtenerFacturasProcesadas('p1', '2026-03');
    assert.strictEqual(r.length, 2);
    assert.strictEqual(r[0].id, 'c');
    assert.strictEqual(r[1].id, 'b');
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

  await testAsync('_classifyHandlerError mapea por _code y por mensaje', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const e1 = Object.assign(new Error('x'), { _code: 'INVALID_INPUT' });
    assert.deepStrictEqual(m._classifyHandlerError(e1), { status: 400, code: 'INVALID_INPUT' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('not found')), { status: 404, code: 'RESOURCE_NOT_FOUND' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('timeout')), { status: 504, code: 'TIMEOUT' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('boom')), { status: 500, code: 'INTERNAL_ERROR' });
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
    assert.ok(ev.timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError registra metric asesoria.errors con code', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._handleHandlerError('test.failed', new Error('not found'), 'kind');
    assert.ok(mocks.metricsCalls.some(c =>
      c[0] === 'increment' && c[1] === 'asesoria.errors' && c[2]?.code === 'RESOURCE_NOT_FOUND'
    ));
    await m.onUnload();
  });

  await testAsync('_validateRequiredFields tira INVALID_INPUT con campos faltantes', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.throws(
      () => m._validateRequiredFields({ a: 1 }, ['a', 'b']),
      err => /faltantes.*b/.test(err.message) && err._code === 'INVALID_INPUT'
    );
    assert.doesNotThrow(() => m._validateRequiredFields({ a: 1, b: 2 }, ['a', 'b']));
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})();

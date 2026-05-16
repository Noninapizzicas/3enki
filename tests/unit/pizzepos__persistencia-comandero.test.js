/**
 * Tests unitarios — pizzepos/persistencia-comandero (POC2 reescritura).
 *
 * Aislamiento: cada test usa tmpdir + override de directorios via core.config.
 *
 * Ejecutar: node tests/unit/pizzepos__persistencia-comandero.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const fsp    = require('fs').promises;
const os     = require('os');

const PersistenciaComanderoModule = require('../../modules/pizzepos/persistencia-comandero/index.js');

// --------------------------------------------------
// Mocks
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
function makeTmpRoot() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'persist-test-'));
  tmpDirs.push(d);
  return d;
}
function cleanupTmp() {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

async function instantiate(mocks, opts = {}) {
  const root = opts.root || makeTmpRoot();
  const m    = new PersistenciaComanderoModule();

  // Override projectsBasePath para no contaminar el repo
  const _onLoad = m.onLoad.bind(m);
  m.onLoad = async (core) => {
    const r = await _onLoad(core);
    m.projectsBasePath = path.join(root, 'projects');
    return r;
  };

  await m.onLoad({
    logger:   mocks.logger,
    metrics:  mocks.metrics,
    eventBus: mocks.eventBus,
    config: {
      data_dir:     path.join(root, 'data'),
      eventos_dir:  path.join(root, 'data', 'eventos'),
      ventas_dir:   path.join(root, 'data', 'ventas'),
      current_dir:  path.join(root, 'data', 'current'),
      backup_dir:   path.join(root, 'data', 'backups')
    }
  });
  // Esperar write queue post-onLoad
  await m._writeQueue;
  return { module: m, root };
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
  console.log('pizzepos/persistencia-comandero — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa caches vacias y crea jornada nueva si no hay archivo', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'persistencia-comandero');
    assert.strictEqual(m.version, '4.0.0');
    assert.strictEqual(m.eventosCache.length, 0);
    assert.strictEqual(m.ventasCache.length, 0);
    assert.strictEqual(m.cuentasActivasCache.size, 0);
    assert.ok(m.fechaJornada, 'fechaJornada inicializada');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(m.fechaJornada));
    await m.onUnload();
  });

  await testAsync('onUnload flush write queue y limpia caches', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.eventosCache.push({ x: 1 });
    m.cuentasActivasCache.set('c1', { id: 'c1' });
    await m.onUnload();
    assert.strictEqual(m.eventosCache.length, 0);
    assert.strictEqual(m.cuentasActivasCache.size, 0);
  });

  // ==========================================
  // Group 2: Validacion canonica
  // ==========================================

  await testAsync('handleCierreCaja sin arqueo → 400 INVALID_INPUT canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCierreCaja({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'arqueo');
    await m.onUnload();
  });

  await testAsync('handleGetEventosFecha / handleGetVentasFecha / handleCuadreCajaFecha sin fecha → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    for (const fn of ['handleGetEventosFecha', 'handleGetVentasFecha', 'handleCuadreCajaFecha']) {
      const r = await m[fn]({});
      assert.ok(isCanonicalError(r), `${fn} debe devolver shape canonico`);
      assert.strictEqual(r.error.code, 'INVALID_INPUT', `${fn} code`);
      assert.strictEqual(r.error.details.field, 'fecha', `${fn} details.field`);
    }
    await m.onUnload();
  });

  await testAsync('handleGetEventosFecha sobre fecha sin datos → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetEventosFecha({ fecha: '2099-01-01' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Event sourcing — onEvento persiste atomicamente
  // ==========================================

  await testAsync('onEvento agrega a cache y persiste atomicamente', async () => {
    const mocks = makeMocks();
    const { module: m, root } = await instantiate(mocks);
    await m.onEvento({ type: 'cobro.iniciado', data: { project_id: 'p1', cuenta_id: 'c1' }});
    await m._writeQueue;

    assert.strictEqual(m.eventosCache.length, 1);
    assert.strictEqual(m.eventosCache[0].event_type, 'cobro.iniciado');

    // Archivo escrito
    const archivo = path.join(root, 'data', 'current', 'eventos.json');
    const content = JSON.parse(await fsp.readFile(archivo, 'utf-8'));
    assert.strictEqual(content.total_eventos, 1);
    // Tmp NO debe quedar
    const tmpExists = await fsp.access(archivo + '.tmp').then(() => true).catch(() => false);
    assert.strictEqual(tmpExists, false);

    // Tambien escrito por proyecto
    const archProj = path.join(root, 'projects', 'p1', 'persistencia', 'current', 'eventos.json');
    const projContent = JSON.parse(await fsp.readFile(archProj, 'utf-8'));
    assert.strictEqual(projContent.total_eventos, 1);
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Cuenta lifecycle
  // ==========================================

  await testAsync('onCuentaCreada agrega a cache + persiste', async () => {
    const mocks = makeMocks();
    const { module: m, root } = await instantiate(mocks);
    await m.onCuentaCreada({ data: {
      cuenta_id: 'c1', project_id: 'p1', tipo: 'mesa',
      nombre: 'Mesa 5', total: 0, estado: 'pendiente'
    }});
    await m._writeQueue;
    assert.strictEqual(m.cuentasActivasCache.has('c1'), true);
    assert.strictEqual(m.cuentasActivasCache.get('c1').tipo, 'mesa');

    const archProj = path.join(root, 'projects', 'p1', 'persistencia', 'current', 'cuentas_activas.json');
    const projContent = JSON.parse(await fsp.readFile(archProj, 'utf-8'));
    assert.strictEqual(projContent.cuentas.c1.tipo, 'mesa');
    await m.onUnload();
  });

  await testAsync('onCuentaCerrada con cobro previo crea venta', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCuentaCreada({ data: { cuenta_id: 'c1', project_id: 'p1', tipo: 'mesa', total: 50 }});
    // Cobro previo registrado
    await m.onEvento({
      type: 'cobro.procesado',
      data: {
        project_id: 'p1', cuenta_id: 'c1', cobro_id: 'cob-1',
        monto: 50, propina: 5, monto_total: 55, metodo_pago: 'efectivo'
      }
    });
    // Pedido previo
    await m.onEvento({
      type: 'pedido.creado',
      data: { project_id: 'p1', cuenta_id: 'c1', pedido_id: 'p-1', items: [{ nombre: 'pizza', precio: 10, cantidad: 1 }], total: 10 }
    });
    await m._writeQueue;

    await m.onCuentaCerrada({ data: { cuenta_id: 'c1', tipo: 'mesa', total: 50, project_id: 'p1' }});
    await m._writeQueue;

    assert.strictEqual(m.ventasCache.length, 1);
    const venta = m.ventasCache[0];
    assert.strictEqual(venta.cuenta.cuenta_id, 'c1');
    assert.strictEqual(venta.cobro.metodo_pago, 'efectivo');
    assert.strictEqual(venta.resumen.total_final, 55);
    assert.strictEqual(m.cuentasActivasCache.has('c1'), false, 'cuenta eliminada del cache');
    await m.onUnload();
  });

  await testAsync('onCuentaCerrada llevadoo (cuenta_id "llevadoo_*") crea venta externa sin cobro', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCuentaCreada({ data: { cuenta_id: 'llevadoo_xyz', project_id: 'p1', tipo: 'llevadoo', origen: 'llevadoo', total: 30 }});
    await m._writeQueue;

    await m.onCuentaCerrada({ data: { cuenta_id: 'llevadoo_xyz', tipo: 'llevadoo', total: 30, project_id: 'p1', metadata: {}}});
    await m._writeQueue;

    assert.strictEqual(m.ventasCache.length, 1);
    assert.strictEqual(m.ventasCache[0].cobro.metodo_pago, 'externo_llevadoo');
    assert.strictEqual(m.ventasCache[0].resumen.total_final, 30);
    await m.onUnload();
  });

  await testAsync('onCuentaCerrada llevadoo cancelado NO crea venta', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCuentaCreada({ data: { cuenta_id: 'llevadoo_xyz', project_id: 'p1', tipo: 'llevadoo', total: 30 }});
    await m._writeQueue;

    await m.onCuentaCerrada({ data: {
      cuenta_id: 'llevadoo_xyz', tipo: 'llevadoo', total: 0,
      project_id: 'p1', metadata: { motivo: 'cancelado' }
    }});
    await m._writeQueue;
    assert.strictEqual(m.ventasCache.length, 0);
    await m.onUnload();
  });

  await testAsync('onCuentaActualizada actualiza campos parciales', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCuentaCreada({ data: { cuenta_id: 'c1', project_id: 'p1', tipo: 'mesa', total: 0 }});
    await m._writeQueue;

    await m.onCuentaActualizada({ data: {
      cuenta_id: 'c1', cambios: { items: 3, total: 25, pagado: false }
    }});
    await m._writeQueue;

    const cuenta = m.cuentasActivasCache.get('c1');
    assert.strictEqual(cuenta.items, 3);
    assert.strictEqual(cuenta.total, 25);
    assert.strictEqual(cuenta.pagado, false);
    await m.onUnload();
  });

  await testAsync('onMesaRenombrada actualiza datos_especificos.nombre', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCuentaCreada({ data: { cuenta_id: 'c1', project_id: 'p1', tipo: 'mesa' }});
    await m._writeQueue;

    await m.onMesaRenombrada({ data: { cuenta_id: 'c1', nombre: 'Terraza 3' }});
    await m._writeQueue;
    assert.strictEqual(m.cuentasActivasCache.get('c1').datos_especificos.nombre, 'Terraza 3');
    await m.onUnload();
  });

  // ==========================================
  // Group 5: Cierre de caja
  // ==========================================

  await testAsync('handleCierreCaja sin cuentas/ventas devuelve cierre cuadrado y publica caja.cerrada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;

    const r = await m.handleCierreCaja({
      arqueo: { efectivo: 0, monedas: 0, total_contado: 0 },
      project_id: 'p1', correlation_id: 'cid-CIERRE'
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.cierre.estado, 'cuadrado');
    assert.strictEqual(r.data.cierre.diferencia, 0);
    assert.ok(r.data.user_hint);

    const caja = publishedOf(mocks, 'caja.cerrada');
    assert.strictEqual(caja.length, 1);
    assert.strictEqual(caja[0].correlation_id, 'cid-CIERRE');
    assert.strictEqual(caja[0].project_id, 'p1');
    assert.ok(caja[0].timestamp);
    assert.ok(caja[0].informe.includes('INFORME DE CIERRE DE CAJA'));
    await m.onUnload();
  });

  await testAsync('handleCierreCaja con cuentas abiertas las cierra forzadas y emite eventos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCuentaCreada({ data: { cuenta_id: 'abierta-1', project_id: 'p1', tipo: 'mesa', total: 100 }});
    await m._writeQueue;
    mocks.published.length = 0;

    const r = await m.handleCierreCaja({
      arqueo: { efectivo: 0, total_contado: 0 }, project_id: 'p1'
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.cierre.cuentas_cerradas_forzadas.length, 1);
    assert.strictEqual(r.data.cierre.cuentas_cerradas_forzadas[0].cuenta_id, 'abierta-1');
    assert.strictEqual(m.cuentasActivasCache.has('abierta-1'), false);

    const forzadas = publishedOf(mocks, 'cuenta.cerrada_forzada');
    assert.strictEqual(forzadas.length, 1);
    assert.strictEqual(forzadas[0].motivo, 'cierre_de_caja');
    await m.onUnload();
  });

  await testAsync('handleIniciarDia limpia caches y emite dia.iniciado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCuentaCreada({ data: { cuenta_id: 'c1', project_id: 'p1', tipo: 'mesa' }});
    await m._writeQueue;
    mocks.published.length = 0;

    const r = await m.handleIniciarDia();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(m.eventosCache.length, 0);
    assert.strictEqual(m.ventasCache.length, 0);
    assert.strictEqual(m.cuentasActivasCache.size, 0);

    const evs = publishedOf(mocks, 'dia.iniciado');
    assert.strictEqual(evs.length, 1);
    assert.ok(evs[0].fecha);
    assert.ok(evs[0].hora_inicio);
    await m.onUnload();
  });

  // ==========================================
  // Group 6: Helpers internos — atomicWrite + readJsonSafe + agregaciones
  // ==========================================

  await testAsync('_atomicWriteFile escribe via .tmp + rename', async () => {
    const mocks = makeMocks();
    const { module: m, root } = await instantiate(mocks);
    const target = path.join(root, 'a.json');
    await m._atomicWriteFile(target, '{"x":1}');
    assert.strictEqual(await fsp.readFile(target, 'utf-8'), '{"x":1}');
    const tmpExists = await fsp.access(target + '.tmp').then(() => true).catch(() => false);
    assert.strictEqual(tmpExists, false);
    await m.onUnload();
  });

  await testAsync('_readJsonSafe ENOENT silencioso, JSON invalido warn+metric', async () => {
    const mocks = makeMocks();
    const { module: m, root } = await instantiate(mocks);
    mocks.logs.length = 0; mocks.metricsCalls.length = 0;

    const r1 = await m._readJsonSafe('/tmp/nonexistent-' + Date.now() + '.json', 'test');
    assert.strictEqual(r1, null);
    assert.strictEqual(mocks.logs.filter(l => l[0] === 'warn').length, 0, 'ENOENT NO debe loguear');

    const corrupt = path.join(root, 'corrupt.json');
    await fsp.writeFile(corrupt, 'not-json');
    const r2 = await m._readJsonSafe(corrupt, 'test_corrupt');
    assert.strictEqual(r2, null);
    assert.ok(mocks.logs.some(l => l[0] === 'warn' && l[1] === 'persistencia.read_error'));
    assert.ok(mocks.metricsCalls.some(c => c[1] === 'persistencia-comandero.errors'));
    await m.onUnload();
  });

  await testAsync('_calcularResumenDia agrega por metodo_pago + tipo_cuenta + camarero', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const ventas = [
      { resumen: { total_final: 10, propina: 1 }, cobro: { metodo_pago: 'efectivo' }, cuenta: { tipo: 'mesa', metadata: { camarero: 'A' }}},
      { resumen: { total_final: 20, propina: 2 }, cobro: { metodo_pago: 'tarjeta' },  cuenta: { tipo: 'mesa', metadata: { camarero: 'A' }}},
      { resumen: { total_final:  5, propina: 0 }, cobro: { metodo_pago: 'efectivo' }, cuenta: { tipo: 'llevar', metadata: {} }}
    ];
    const r = m._calcularResumenDia(ventas);
    assert.strictEqual(r.total_ventas, 3);
    assert.strictEqual(r.total_ingresos, 35);
    assert.strictEqual(r.total_propinas, 3);
    assert.strictEqual(r.por_metodo_pago.efectivo, 15);
    assert.strictEqual(r.por_metodo_pago.tarjeta, 20);
    assert.strictEqual(r.por_tipo_cuenta.mesa, 30);
    assert.strictEqual(r.por_tipo_cuenta.llevar, 5);
    assert.strictEqual(r.por_camarero.A, 30);
    await m.onUnload();
  });

  await testAsync('_calcularDesgloseProductos agrega por familia y producto', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const ventas = [{
      pedidos: [{
        items: [
          { nombre: 'Pizza Margarita', categoria: 'Pizzas', cantidad: 2, precio_unitario: 10 },
          { nombre: 'Coca-Cola',       categoria: 'Bebidas', cantidad: 1, precio_unitario: 3 },
          { nombre: 'Pizza Margarita', categoria: 'Pizzas', cantidad: 1, precio_total: 10 }
        ]
      }]
    }];
    const r = m._calcularDesgloseProductos(ventas);
    assert.strictEqual(r.totalUnidades, 4);
    assert.strictEqual(r.porFamilia.Pizzas.cantidad, 3);
    assert.strictEqual(r.porFamilia.Pizzas.importe, 30);
    assert.strictEqual(r.porFamilia.Bebidas.cantidad, 1);
    assert.strictEqual(r.porProducto['Pizza Margarita'].cantidad, 3);
    await m.onUnload();
  });

  await testAsync('_generarInformeCierre incluye encabezado + arqueo + estado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const cierre = {
      fecha_jornada: '2025-01-15',
      hora_inicio:   '2025-01-15T08:00:00Z',
      hora_cierre:   '2025-01-15T22:00:00Z',
      project_id:    'p1',
      arqueo:        { efectivo: 100, total_contado: 100 },
      diferencia:    0,
      estado:        'cuadrado',
      totales: { total_ventas: 0, total_ingresos: 0, total_propinas: 0,
        por_metodo_pago: { efectivo: 100 }, por_tipo_cuenta: {}, por_camarero: {} },
      cuentas_cerradas_forzadas: []
    };
    const informe = m._generarInformeCierre(cierre, []);
    assert.ok(informe.includes('INFORME DE CIERRE DE CAJA'));
    assert.ok(informe.includes('Proyecto: p1'));
    assert.ok(informe.includes('✅ Cuadrado'));
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

  await testAsync('_classifyHandlerError mapea ENOENT/EACCES/E*', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'ENOENT' })), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'EACCES' })), 'PERMISSION_DENIED');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'EIO' })), 'FILESYSTEM_ERROR');
    assert.strictEqual(m._classifyHandlerError(new Error('weird')), 'UNKNOWN_ERROR');
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

  await testAsync('_handleHandlerError mapea status y registra metric persistencia-comandero.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.metricsCalls.length = 0;
    const err = Object.assign(new Error('x'), { _code: 'FILESYSTEM_ERROR' });
    const r = m._handleHandlerError('t.failed', err, 'kind');
    assert.strictEqual(r.status, 500);
    const metric = mocks.metricsCalls.find(c => c[1] === 'persistencia-comandero.errors');
    assert.ok(metric);
    assert.deepStrictEqual(metric[2], { kind: 'kind', code: 'FILESYSTEM_ERROR' });
    await m.onUnload();
  });

  cleanupTmp();
  console.log('\nTodos los tests pasaron.');
  process.exit(0);
})();

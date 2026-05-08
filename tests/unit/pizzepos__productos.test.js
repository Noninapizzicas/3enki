/**
 * Tests unitarios — pizzepos__productos (POC2).
 *
 * Ejecutar: node tests/unit/pizzepos__productos.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ProductosModule = require('../../modules/pizzepos/productos/index.js');

let TMP_ROOT;

function setupTmp() {
  TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'productos-test-'));
}

function teardownTmp() {
  if (TMP_ROOT) {
    try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch (_) {}
  }
}

function makeMocks() {
  const logs = [];
  const published = [];
  const metricsCalls = [];
  const uiRegistered = [];
  const uiHandled = [];

  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };
  const metrics = {
    increment: (n, l) => metricsCalls.push(['increment', n, l]),
    gauge:     (n, v, l) => metricsCalls.push(['gauge', n, v, l]),
    timing:    (n, ms, l) => metricsCalls.push(['timing', n, ms, l]),
    getCounter: () => 0
  };
  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); }
  };
  const uiHandler = {
    register: (domain, action, fn) => uiRegistered.push([domain, action]),
    unregister: () => {},
    handle: async (domain, action, data) => {
      uiHandled.push([domain, action, data]);
      if (domain === 'ingredientes' && action === 'list') {
        return { status: 200, data: { ingredientes: [{ id: 'tomate' }] } };
      }
      return { status: 200, data: {} };
    }
  };
  return { logs, published, metricsCalls, uiRegistered, uiHandled, logger, metrics, eventBus, uiHandler };
}

async function instantiate(mocks, opts = {}) {
  const m = new ProductosModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    uiHandler: mocks.uiHandler,
    config: opts.config || {}
  });
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

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

(async () => {
  setupTmp();
  console.log('pizzepos__productos — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad inicializa estado limpio + registra ui_handlers', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'productos');
    assert.strictEqual(m.version, '3.0.0');
    assert.strictEqual(m.productosPerProject.size, 0);
    assert.strictEqual(m.categoriasPerProject.size, 0);
    assert.strictEqual(mocks.uiRegistered.length, 13);
    await m.onUnload();
  });

  await testAsync('onUnload limpia maps + cancela pending project requests', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let rejected = false;
    m.pendingProjectRequests.set('rid', {
      resolve: () => {},
      reject: () => { rejected = true; },
      timeout: setTimeout(() => {}, 60000)
    });
    m.getProductos('p1').set('prod1', { id: 'prod1' });
    await m.onUnload();
    assert.ok(rejected);
    assert.strictEqual(m.productosPerProject.size, 0);
    assert.strictEqual(m.pendingProjectRequests.size, 0);
  });

  // Group 2: Validacion canonica
  await testAsync('handleListProductos sin project_id devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleListProductos({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleGetProducto sin producto devuelve 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.getProductos('proj-1');  // crear bucket vacio para que resolveToActiveProject lo use
    m.getProductos('proj-1').set('p1', { id: 'p1', nombre: 'X' });
    const r = await m.handleGetProducto({ project_id: 'proj-1', id: 'no-existe' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleSearchProductos sin query devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleSearchProductos({ project_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'q');
    await m.onUnload();
  });

  await testAsync('handleUpdateProducto inexistente devuelve 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    // Mock resolveStoragePath no llama a project-manager si no hay path
    m.projectPaths.set('p1', path.join(TMP_ROOT, 'p1', 'storage', 'pizzepos'));
    const r = await m.handleUpdateProducto({ project_id: 'p1', id: 'no-existe', precio: 10 });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  // Group 3: List + Search + filters
  await testAsync('handleListProductos devuelve productos del proyecto', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const productos = m.getProductos('proj-1');
    productos.set('p1', { id: 'p1', nombre: 'Margarita', categoria: 'pizzas', activo: true });
    productos.set('p2', { id: 'p2', nombre: 'Coca', categoria: 'bebidas', activo: true });
    const r = await m.handleListProductos({ project_id: 'proj-1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.total, 2);
    await m.onUnload();
  });

  await testAsync('handleListProductos filtra por categoria', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const productos = m.getProductos('proj-1');
    productos.set('p1', { id: 'p1', nombre: 'A', categoria: 'pizzas', activo: true });
    productos.set('p2', { id: 'p2', nombre: 'B', categoria: 'bebidas', activo: true });
    const r = await m.handleListProductos({ project_id: 'proj-1', categoria: 'pizzas' });
    assert.strictEqual(r.data.total, 1);
    await m.onUnload();
  });

  await testAsync('handleSearchProductos busca por nombre o descripcion', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const productos = m.getProductos('proj-1');
    productos.set('p1', { id: 'p1', nombre: 'Margarita', activo: true });
    productos.set('p2', { id: 'p2', nombre: 'Pepperoni', descripcion: 'con queso margarita', activo: true });
    const r = await m.handleSearchProductos({ project_id: 'proj-1', q: 'margarita' });
    assert.strictEqual(r.data.total, 2);
    await m.onUnload();
  });

  // Group 4: Update + Delete + persist
  await testAsync('handleUpdateProducto cambia precio + emite producto.actualizado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const productos = m.getProductos('proj-1');
    productos.set('p1', { id: 'p1', nombre: 'Margarita', precio: 10, activo: true });
    m.projectPaths.set('proj-1', path.join(TMP_ROOT, 'proj-1', 'storage', 'pizzepos'));
    const r = await m.handleUpdateProducto({ project_id: 'proj-1', id: 'p1', precio: 12 });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.precio, 12);
    const evs = publishedOf(mocks, 'producto.actualizado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].project_id, 'proj-1');
    assert.ok(evs[0].timestamp);
    await m.onUnload();
  });

  await testAsync('handleDeleteProducto remueve + emite producto.eliminado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const productos = m.getProductos('proj-1');
    productos.set('p1', { id: 'p1', nombre: 'X', activo: true });
    m.projectPaths.set('proj-1', path.join(TMP_ROOT, 'proj-1', 'storage', 'pizzepos'));
    const r = await m.handleDeleteProducto({ project_id: 'proj-1', id: 'p1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(productos.size, 0);
    const evs = publishedOf(mocks, 'producto.eliminado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].motivo, 'manual');
    assert.strictEqual(evs[0].project_id, 'proj-1');
    await m.onUnload();
  });

  // Group 5: syncCatalogo flow
  await testAsync('syncCatalogo aplica nuevos productos + categorias', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const stats = await m.syncCatalogo('proj-1', 'menu-1', [
      { id: 'p1', nombre: 'A', categoria: 'pizzas', precio: 10 },
      { id: 'p2', nombre: 'B', categoria: 'bebidas', precio: 5 }
    ], [
      { id: 'pizzas', nombre: 'Pizzas', orden: 1 },
      { id: 'bebidas', nombre: 'Bebidas', orden: 2 }
    ], 'cid-sync');
    assert.strictEqual(stats.productos_nuevos, 2);
    assert.strictEqual(stats.categorias_nuevas, 2);
    const created = publishedOf(mocks, 'producto.creado');
    assert.strictEqual(created.length, 2);
    await m.onUnload();
  });

  await testAsync('syncCatalogo desactiva productos no presentes en menu', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.getProductos('proj-1').set('p1', { id: 'p1', nombre: 'A', activo: true });
    m.getProductos('proj-1').set('p2', { id: 'p2', nombre: 'B', activo: true });
    const stats = await m.syncCatalogo('proj-1', 'menu-2', [
      { id: 'p1', nombre: 'A', precio: 10 }
    ], [], 'cid-sync');
    assert.strictEqual(stats.productos_actualizados, 1);
    assert.strictEqual(stats.productos_desactivados, 1);
    assert.strictEqual(m.getProductos('proj-1').get('p2').activo, false);
    await m.onUnload();
  });

  // Group 6: applyCorrections + normalize
  await testAsync('applyCorrections actualiza campos por producto_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const productos = [{ id: 'p1', nombre: 'A', precio: 10 }];
    const out = m.applyCorrections(productos, [
      { producto_id: 'p1', campo: 'precio', valor_nuevo: 15 }
    ]);
    assert.strictEqual(out[0].precio, 15);
    await m.onUnload();
  });

  await testAsync('normalizeProductoPOS construye ingredientes_base con IDs', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const prod = { ingredientes: [{ nombre: 'Tomate', emoji: '🍅' }] };
    m.normalizeProductoPOS(prod);
    assert.ok(Array.isArray(prod.ingredientes_base));
    assert.strictEqual(prod.ingredientes_base[0].id, 'ing_tomate');
    await m.onUnload();
  });

  await testAsync('handleCartaCompleta sin proyectos cargados devuelve 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCartaCompleta({});
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleHealthCheck devuelve estado canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealthCheck();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.status, 'healthy');
    assert.strictEqual(r.data.version, '3.0.0');
    await m.onUnload();
  });

  // Group 7: Helpers POC2 + slugify
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
    assert.deepStrictEqual(m._classifyHandlerError(new Error('boom')), { status: 500, code: 'INTERNAL_ERROR' });
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

  await testAsync('_handleHandlerError emite metric productos.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'));
    assert.strictEqual(r.status, 404);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'productos.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  await testAsync('slugify normaliza acentos y caracteres especiales', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.slugify('Tomate fresco'), 'tomate_fresco');
    assert.strictEqual(m.slugify('Cebolla & Ajo'), 'cebolla_ajo');
    assert.strictEqual(m.slugify('jamón'), 'jamon');
    assert.strictEqual(m.slugify(''), 'sin_nombre');
    await m.onUnload();
  });

  await testAsync('resolveToActiveProject fallback al primer proyecto con datos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.getProductos('proj-A').set('p1', { id: 'p1' });
    const resolved = m.resolveToActiveProject('alias');
    assert.strictEqual(resolved, 'proj-A');
    await m.onUnload();
  });

  teardownTmp();
  console.log('\nTodos los tests pasaron.');
})().catch(e => {
  teardownTmp();
  console.error(e);
  process.exit(1);
});

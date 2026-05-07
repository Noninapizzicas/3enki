/**
 * Tests unitarios — pizzepos__carta-manager (POC2 reescritura).
 *
 * 5 helpers POC2: _errorResponse, _classifyHandlerError, _handleHandlerError,
 *   _publicarEvento, _emitCartaActualizada.
 *
 * Ejecutar: node tests/unit/pizzepos__carta-manager.test.js
 */

'use strict';

const assert = require('assert');

const CartaManagerModule = require('../../modules/pizzepos/carta-manager/index.js');

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
  };

  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

async function instantiate(mocks, opts = {}) {
  const m = new CartaManagerModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    moduleConfig: opts.config || {}
  });
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

function makeCartaBase(project_id = 'p1') {
  return {
    meta: { id: 'carta1', nombre: 'Carta Test', source: 'test', created_at: new Date().toISOString() },
    categorias: [{ id: 'pizzas', nombre: 'Pizzas', orden: 1 }],
    productos: []
  };
}

// ==================================================
//                                                Tests
// ==================================================

(async () => {
  console.log('pizzepos__carta-manager — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa estado limpio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.ok(m.name === 'carta-manager');
    assert.strictEqual(m.cartasPerProject.size, 0);
    assert.strictEqual(m.projectPaths.size, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia Maps sin leak', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.cartasPerProject.set('p1', new Map());
    m.projectPaths.set('p1', { featurePath: '/x', storagePath: '/x' });
    await m.onUnload();
    assert.strictEqual(m.cartasPerProject.size, 0);
    assert.strictEqual(m.projectPaths.size, 0);
  });

  // ==========================================
  // Group 2: Validación canónica de handlers
  // ==========================================

  await testAsync('toolGet sin carta_id devuelve 400 INVALID_INPUT canónico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolGet({ project_id: 'p1' });
    assert.ok(isCanonicalError(r), 'debe ser error canónico');
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    const warned = mocks.logs.some(l => l[0] === 'warn');
    assert.ok(warned, 'debe loggear warn');
    const metriced = mocks.metricsCalls.some(c => c[1] === 'carta-manager.error');
    assert.ok(metriced, 'debe emitir métrica');
    await m.onUnload();
  });

  await testAsync('toolList sin project_id devuelve 400 INVALID_INPUT canónico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolList({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('toolDelete sin carta_id devuelve 400 INVALID_INPUT canónico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolDelete({ project_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('toolDelete con carta_id con path traversal devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolDelete({ carta_id: '../etc/passwd', project_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: CRUD tools — in-memory operations
  // ==========================================

  await testAsync('toolSave crea carta nueva sin carta_id ni carta → éxito canónico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    // No hay paths de proyecto → saveCartaToDisk no hace nada (dir = null)
    const r = await m.toolSave({ nombre: 'Carta Verano', project_id: 'p1' });
    assert.ok(isCanonicalSuccess(r), `debe ser éxito: ${JSON.stringify(r)}`);
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.carta_id);
    assert.strictEqual(r.data.nombre, 'Carta Verano');
    // carta.actualizada emitida
    const evs = publishedOf(mocks, 'carta.actualizada');
    assert.strictEqual(evs.length, 1);
    assert.ok(evs[0].correlation_id, 'debe tener correlation_id');
    assert.ok(evs[0].timestamp, 'debe tener timestamp');
    await m.onUnload();
  });

  await testAsync('toolList devuelve cartas ordenadas por created_at desc', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.toolSave({ carta: { meta: { id: 'ca1', nombre: 'Carta A', created_at: '2026-01-01T00:00:00.000Z' }, categorias: [], productos: [] }, project_id: 'p1' });
    await m.toolSave({ carta: { meta: { id: 'cb1', nombre: 'Carta B', created_at: '2026-01-02T00:00:00.000Z' }, categorias: [], productos: [] }, project_id: 'p1' });
    const r = await m.toolList({ project_id: 'p1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.total, 2);
    assert.strictEqual(r.data.cartas.length, 2);
    assert.strictEqual(r.data.cartas[0].id, 'cb1', 'más reciente primero');
    await m.onUnload();
  });

  await testAsync('toolGet devuelve 404 RESOURCE_NOT_FOUND para carta inexistente', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolGet({ carta_id: 'no_existe', project_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('toolDelete elimina carta del Map y emite métrica', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const save = await m.toolSave({ nombre: 'Borrable', project_id: 'p1' });
    const carta_id = save.data.carta_id;
    mocks.metricsCalls.length = 0;
    const r = await m.toolDelete({ carta_id, project_id: 'p1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.carta_id, carta_id);
    assert.strictEqual(m.getCartas('p1').has(carta_id), false);
    const deleted = mocks.metricsCalls.some(c => c[1] === 'carta-manager.carta.deleted');
    assert.ok(deleted, 'debe emitir métrica de borrado');
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Productos y categorías
  // ==========================================

  await testAsync('toolAddCategory agrega categoría y emite carta.actualizada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const save = await m.toolSave({ nombre: 'C', project_id: 'p1' });
    const carta_id = save.data.carta_id;
    mocks.published.length = 0;
    const r = await m.toolAddCategory({ carta_id, project_id: 'p1', nombre: 'Pizzas' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.id, 'pizzas');
    const evs = publishedOf(mocks, 'carta.actualizada');
    assert.strictEqual(evs.length, 1);
    await m.onUnload();
  });

  await testAsync('toolAddCategory duplicada devuelve 409 ALREADY_EXISTS', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const save = await m.toolSave({ nombre: 'C', project_id: 'p1' });
    const carta_id = save.data.carta_id;
    await m.toolAddCategory({ carta_id, project_id: 'p1', nombre: 'Pizzas' });
    const r = await m.toolAddCategory({ carta_id, project_id: 'p1', nombre: 'Pizzas' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'ALREADY_EXISTS');
    await m.onUnload();
  });

  await testAsync('toolAddProduct agrega producto y emite carta.actualizada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const save = await m.toolSave({ nombre: 'C', project_id: 'p1' });
    const carta_id = save.data.carta_id;
    await m.toolAddCategory({ carta_id, project_id: 'p1', nombre: 'Pizzas' });
    mocks.published.length = 0;
    const r = await m.toolAddProduct({ carta_id, project_id: 'p1', nombre: 'Margarita', categoria: 'pizzas', precio: 12 });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.nombre, 'Margarita');
    assert.strictEqual(r.data.precio, 12);
    assert.strictEqual(publishedOf(mocks, 'carta.actualizada').length, 1);
    await m.onUnload();
  });

  await testAsync('toolAddProduct con categoría inexistente devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const save = await m.toolSave({ nombre: 'C', project_id: 'p1' });
    const carta_id = save.data.carta_id;
    const r = await m.toolAddProduct({ carta_id, project_id: 'p1', nombre: 'X', categoria: 'no_existe', precio: 5 });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('toolRemoveProduct elimina producto y emite carta.actualizada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const save = await m.toolSave({ nombre: 'C', project_id: 'p1' });
    const carta_id = save.data.carta_id;
    await m.toolAddCategory({ carta_id, project_id: 'p1', nombre: 'Pizzas' });
    await m.toolAddProduct({ carta_id, project_id: 'p1', nombre: 'Margarita', categoria: 'pizzas', precio: 12 });
    mocks.published.length = 0;
    const r = await m.toolRemoveProduct({ carta_id, project_id: 'p1', producto_id: 'pizzas_margarita' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.productos_restantes, 0);
    assert.strictEqual(publishedOf(mocks, 'carta.actualizada').length, 1);
    await m.onUnload();
  });

  await testAsync('toolUpdateProduct actualiza precio y emite carta.actualizada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const save = await m.toolSave({ nombre: 'C', project_id: 'p1' });
    const carta_id = save.data.carta_id;
    await m.toolAddCategory({ carta_id, project_id: 'p1', nombre: 'Pizzas' });
    await m.toolAddProduct({ carta_id, project_id: 'p1', nombre: 'Margarita', categoria: 'pizzas', precio: 12 });
    mocks.published.length = 0;
    const r = await m.toolUpdateProduct({ carta_id, project_id: 'p1', producto_id: 'pizzas_margarita', precio: 15 });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.precio, 15);
    assert.strictEqual(publishedOf(mocks, 'carta.actualizada').length, 1);
    await m.onUnload();
  });

  // ==========================================
  // Group 5: Precios, búsqueda y estadísticas
  // ==========================================

  await testAsync('toolUpdatePrices aplica porcentaje global y emite carta.actualizada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const save = await m.toolSave({ nombre: 'C', project_id: 'p1' });
    const carta_id = save.data.carta_id;
    await m.toolAddCategory({ carta_id, project_id: 'p1', nombre: 'Pizzas' });
    await m.toolAddProduct({ carta_id, project_id: 'p1', nombre: 'Margarita', categoria: 'pizzas', precio: 10 });
    mocks.published.length = 0;
    const r = await m.toolUpdatePrices({ carta_id, project_id: 'p1', porcentaje: 10 });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.productos_actualizados, 1);
    assert.strictEqual(r.data.cambios[0].nuevo, 11);
    assert.strictEqual(publishedOf(mocks, 'carta.actualizada').length, 1);
    await m.onUnload();
  });

  await testAsync('toolSearch encuentra por nombre de producto', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const save = await m.toolSave({ nombre: 'C', project_id: 'p1' });
    const carta_id = save.data.carta_id;
    await m.toolAddCategory({ carta_id, project_id: 'p1', nombre: 'Pizzas' });
    await m.toolAddProduct({ carta_id, project_id: 'p1', nombre: 'Margarita', categoria: 'pizzas', precio: 10 });
    const r = await m.toolSearch({ carta_id, project_id: 'p1', query: 'marg' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.resultados, 1);
    assert.strictEqual(r.data.productos[0].nombre, 'Margarita');
    await m.onUnload();
  });

  await testAsync('toolStats devuelve contadores correctos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const save = await m.toolSave({ nombre: 'C', project_id: 'p1' });
    const carta_id = save.data.carta_id;
    await m.toolAddCategory({ carta_id, project_id: 'p1', nombre: 'Pizzas' });
    await m.toolAddProduct({ carta_id, project_id: 'p1', nombre: 'Margarita', categoria: 'pizzas', precio: 10 });
    await m.toolAddProduct({ carta_id, project_id: 'p1', nombre: 'Napolitana', categoria: 'pizzas', precio: 12 });
    const r = await m.toolStats({ carta_id, project_id: 'p1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.total_productos, 2);
    assert.strictEqual(r.data.total_categorias, 1);
    assert.strictEqual(r.data.precio_min, 10);
    assert.strictEqual(r.data.precio_max, 12);
    await m.onUnload();
  });

  // ==========================================
  // Group 6: Bus handlers
  // ==========================================

  await testAsync('onCartaListarSolicitada emite carta.listada con correlation_id propagado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.toolSave({ nombre: 'X', project_id: 'p1' });
    mocks.published.length = 0;
    await m.onCartaListarSolicitada({ project_id: 'p1', request_id: 'req1', correlation_id: 'cid1' });
    const evs = publishedOf(mocks, 'carta.listada');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid1');
    assert.ok(evs[0].timestamp);
    assert.ok(Array.isArray(evs[0].cartas));
    assert.strictEqual(evs[0].total, 1);
    await m.onUnload();
  });

  await testAsync('onCartaBorrarSolicitada emite carta.borrada con correlation_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const save = await m.toolSave({ nombre: 'X', project_id: 'p1' });
    const carta_id = save.data.carta_id;
    mocks.published.length = 0;
    await m.onCartaBorrarSolicitada({ carta_id, project_id: 'p1', request_id: 'req1', correlation_id: 'cid2' });
    const evs = publishedOf(mocks, 'carta.borrada');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid2');
    await m.onUnload();
  });

  await testAsync('onCartaListarSolicitada emite carta.listar.fallida si project_id ausente', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m.onCartaListarSolicitada({ request_id: 'req1', correlation_id: 'cid3' });
    const evs = publishedOf(mocks, 'carta.listar.fallida');
    assert.strictEqual(evs.length, 1);
    assert.ok(evs[0].error && typeof evs[0].error === 'object', 'error debe ser objeto');
    assert.ok(evs[0].error.code, 'error debe tener code');
    assert.strictEqual(evs[0].correlation_id, 'cid3');
    await m.onUnload();
  });

  // ==========================================
  // Group 7: Helpers POC2 internos
  // ==========================================

  await testAsync('_errorResponse construye shape canónico { status, error: { code, message, details? } }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = m._errorResponse(400, 'INVALID_INPUT', 'msg', { field: 'x' });
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { field: 'x' } } });
    const r2 = m._errorResponse(500, 'UNKNOWN_ERROR', 'oops');
    assert.deepStrictEqual(r2, { status: 500, error: { code: 'UNKNOWN_ERROR', message: 'oops' } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea por mensaje a códigos canónicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(new Error('not found')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('no encontrada')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('Se requiere project_id')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('ya existe categoría')), 'ALREADY_EXISTS');
    assert.strictEqual(m._classifyHandlerError(new Error('something exploded')), 'UNKNOWN_ERROR');
    await m.onUnload();
  });

  await testAsync('_publicarEvento hereda correlation_id si se pasa, genera uno nuevo si no', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { foo: 1 }, { correlation_id: 'cid-inherit' });
    await m._publicarEvento('test.event', { bar: 2 });
    const evs = publishedOf(mocks, 'test.event');
    assert.strictEqual(evs.length, 2);
    assert.strictEqual(evs[0].correlation_id, 'cid-inherit');
    assert.notStrictEqual(evs[1].correlation_id, 'cid-inherit');
    assert.ok(typeof evs[1].correlation_id === 'string' && evs[1].correlation_id.length > 0);
    assert.ok(evs[0].timestamp && evs[1].timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError mapea status según code y registra metric', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const err = Object.assign(new Error('not found'), { _code: 'RESOURCE_NOT_FOUND', _details: { e: 1 } });
    const r = m._handleHandlerError('test.failed', err, 'kind');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.deepStrictEqual(r.error.details, { e: 1 });
    const metriced = mocks.metricsCalls.some(c => c[1] === 'carta-manager.error');
    assert.ok(metriced, 'debe emitir métrica');
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})();

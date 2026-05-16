/**
 * Tests unitarios — pizzepos/categorias (POC2 reescritura).
 *
 * Ejecutar: node tests/unit/pizzepos__categorias.test.js
 */

'use strict';

const assert = require('assert');

const CategoriasModule = require('../../modules/pizzepos/categorias/index.js');

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

async function instantiate(mocks) {
  const m = new CategoriasModule();
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus });
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
  console.log('pizzepos/categorias — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa map vacio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'categorias');
    assert.strictEqual(m.version, '3.0.0');
    assert.strictEqual(m.categoriasPerProject.size, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia categoriasPerProject', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._getCategorias('p1').set('cat-1', { id: 'cat-1' });
    await m.onUnload();
    assert.strictEqual(m.categoriasPerProject.size, 0);
  });

  // ==========================================
  // Group 2: Validacion canonica
  // ==========================================

  await testAsync('handleListCategorias sin project_id → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleListCategorias({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'project_id');
    await m.onUnload();
  });

  await testAsync('handleGetCategoria sin id → 400 (field=id)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetCategoria({ project_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.details.field, 'id');
    await m.onUnload();
  });

  await testAsync('handleCreateCategoria sin nombre → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreateCategoria({ project_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.details.field, 'nombre');
    await m.onUnload();
  });

  await testAsync('handleReorderCategorias sin orden array → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleReorderCategorias({ project_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.details.field, 'orden');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Bus subscribe — sync onCartaActualizada
  // ==========================================

  await testAsync('onCartaActualizada con categorias nuevas las crea + emite categoria.creada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;

    await m.onCartaActualizada({ data: {
      project_id: 'p1',
      correlation_id: 'cid-CA',
      categorias: [
        { id: 'cat-pizzas',   nombre: 'Pizzas',   emoji: '🍕' },
        { id: 'cat-bebidas',  nombre: 'Bebidas',  emoji: '🥤' }
      ]
    }});

    const evs = publishedOf(mocks, 'categoria.creada');
    assert.strictEqual(evs.length, 2);
    assert.strictEqual(evs[0].project_id, 'p1');
    assert.strictEqual(evs[0].correlation_id, 'cid-CA');
    assert.ok(evs[0].timestamp);
    assert.strictEqual(m._getCategorias('p1').size, 2);
    await m.onUnload();
  });

  await testAsync('onCartaActualizada con categorias existentes solo emite actualizada si hay cambios', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.onCartaActualizada({ data: {
      project_id: 'p1', categorias: [{ id: 'c1', nombre: 'A', emoji: '📋' }]
    }});
    mocks.published.length = 0;

    // Mismo nombre y emoji — NO debe publicar actualizada
    await m.onCartaActualizada({ data: {
      project_id: 'p1', categorias: [{ id: 'c1', nombre: 'A', emoji: '📋' }]
    }});
    assert.strictEqual(publishedOf(mocks, 'categoria.actualizada').length, 0);

    // Cambio de nombre — debe publicar actualizada con diff
    await m.onCartaActualizada({ data: {
      project_id: 'p1', correlation_id: 'cid-X',
      categorias: [{ id: 'c1', nombre: 'A renombrado', emoji: '📋' }]
    }});
    const evs = publishedOf(mocks, 'categoria.actualizada');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].cambios.nombre.anterior, 'A');
    assert.strictEqual(evs[0].cambios.nombre.nuevo, 'A renombrado');
    assert.strictEqual(evs[0].correlation_id, 'cid-X');
    await m.onUnload();
  });

  await testAsync('onCartaActualizada sin project_id loguea error y no crashea', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCartaActualizada({ data: { categorias: [{ id: 'c1', nombre: 'A' }] }});
    assert.ok(mocks.logs.some(l => l[0] === 'error' && l[1] === 'categorias.carta_actualizada.no_project_id'));
    assert.strictEqual(m.categoriasPerProject.size, 0);
    await m.onUnload();
  });

  await testAsync('onCartaActualizada sin categorias es no-op', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m.onCartaActualizada({ data: { project_id: 'p1', categorias: [] }});
    assert.strictEqual(mocks.published.length, 0);
    await m.onUnload();
  });

  // ==========================================
  // Group 4: UI handlers — CRUD success
  // ==========================================

  await testAsync('handleCreateCategoria crea categoria + emite categoria.creada con project_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;

    const r = await m.handleCreateCategoria({
      project_id: 'p1', nombre: 'Pizzas', emoji: '🍕', correlation_id: 'cid-CR'
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.id, 'cat_pizzas');
    assert.strictEqual(r.data.activa, true);
    assert.strictEqual(r.data.orden, 0);

    const evs = publishedOf(mocks, 'categoria.creada');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].project_id, 'p1');
    assert.strictEqual(evs[0].correlation_id, 'cid-CR');
    await m.onUnload();
  });

  await testAsync('handleCreateCategoria duplicada → 409 ALREADY_EXISTS', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleCreateCategoria({ project_id: 'p1', nombre: 'Pizzas' });
    const r = await m.handleCreateCategoria({ project_id: 'p1', nombre: 'Pizzas' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'ALREADY_EXISTS');
    await m.onUnload();
  });

  await testAsync('handleListCategorias devuelve activas ordenadas', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleCreateCategoria({ project_id: 'p1', nombre: 'B' });
    await m.handleCreateCategoria({ project_id: 'p1', nombre: 'A' });
    const r = await m.handleListCategorias({ project_id: 'p1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.total, 2);
    assert.strictEqual(r.data.categorias[0].nombre, 'B', 'orden 0 = primera creada');
    assert.strictEqual(r.data.categorias[1].nombre, 'A');
    await m.onUnload();
  });

  await testAsync('handleGetCategoria existente → 200, inexistente → 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const created = await m.handleCreateCategoria({ project_id: 'p1', nombre: 'Pizzas' });
    const r1 = await m.handleGetCategoria({ project_id: 'p1', id: created.data.id });
    assert.ok(isCanonicalSuccess(r1));
    assert.strictEqual(r1.data.nombre, 'Pizzas');

    const r2 = await m.handleGetCategoria({ project_id: 'p1', id: 'fantasma' });
    assert.ok(isCanonicalError(r2));
    assert.strictEqual(r2.status, 404);
    assert.strictEqual(r2.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleUpdateCategoria modifica + emite categoria.actualizada con diff', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const created = await m.handleCreateCategoria({ project_id: 'p1', nombre: 'Pizzas', emoji: '🍕' });
    mocks.published.length = 0;

    const r = await m.handleUpdateCategoria({
      project_id: 'p1', id: created.data.id, emoji: '🍕🍕'
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.emoji, '🍕🍕');

    const evs = publishedOf(mocks, 'categoria.actualizada');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].cambios.emoji.nuevo, '🍕🍕');
    await m.onUnload();
  });

  await testAsync('handleUpdateCategoria inexistente → 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleUpdateCategoria({ project_id: 'p1', id: 'fantasma', nombre: 'X' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    await m.onUnload();
  });

  await testAsync('handleReorderCategorias actualiza orden + emite categoria.orden_actualizado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const c1 = await m.handleCreateCategoria({ project_id: 'p1', nombre: 'A' });
    const c2 = await m.handleCreateCategoria({ project_id: 'p1', nombre: 'B' });
    mocks.published.length = 0;

    const r = await m.handleReorderCategorias({
      project_id: 'p1',
      orden: [
        { categoria_id: c2.data.id },
        { categoria_id: c1.data.id }
      ]
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.nuevo_orden.length, 2);

    const evs = publishedOf(mocks, 'categoria.orden_actualizado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].project_id, 'p1');

    // Ahora B debe ser primero
    const list = await m.handleListCategorias({ project_id: 'p1' });
    assert.strictEqual(list.data.categorias[0].id, c2.data.id);
    await m.onUnload();
  });

  await testAsync('handleHealthCheck → 200 con catalogo', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleCreateCategoria({ project_id: 'p1', nombre: 'A' });
    const r = await m.handleHealthCheck();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.status, 'healthy');
    assert.strictEqual(r.data.catalogo.total, 1);
    await m.onUnload();
  });

  // ==========================================
  // Group 5: Multi-tenant — proyectos aislados
  // ==========================================

  await testAsync('Multi-tenant — categorias de p1 NO aparecen en p2', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleCreateCategoria({ project_id: 'p1', nombre: 'Pizzas' });
    await m.handleCreateCategoria({ project_id: 'p2', nombre: 'Bebidas' });

    const list1 = await m.handleListCategorias({ project_id: 'p1' });
    const list2 = await m.handleListCategorias({ project_id: 'p2' });
    assert.strictEqual(list1.data.total, 1);
    assert.strictEqual(list2.data.total, 1);
    assert.strictEqual(list1.data.categorias[0].nombre, 'Pizzas');
    assert.strictEqual(list2.data.categorias[0].nombre, 'Bebidas');
    await m.onUnload();
  });

  // ==========================================
  // Group 6: Helpers internos — slugify
  // ==========================================

  await testAsync('_slugify normaliza acentos y espacios', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._slugify('Pizzas Vegetarianas'), 'pizzas_vegetarianas');
    assert.strictEqual(m._slugify('Café & Té'), 'cafe_te');
    assert.strictEqual(m._slugify('  Espacios   raros  '), 'espacios_raros');
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

  await testAsync('_classifyHandlerError mapea por mensaje', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(new Error('not found')),     'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('ya existe')),     'ALREADY_EXISTS');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('weird')),         'UNKNOWN_ERROR');
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

  await testAsync('_handleHandlerError mapea status y registra metric categorias.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.metricsCalls.length = 0;
    const err = Object.assign(new Error('ya existe'), { _code: 'ALREADY_EXISTS' });
    const r = m._handleHandlerError('t.failed', err, 'kind');
    assert.strictEqual(r.status, 409);
    const metric = mocks.metricsCalls.find(c => c[1] === 'categorias.errors');
    assert.ok(metric);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
  process.exit(0);
})();

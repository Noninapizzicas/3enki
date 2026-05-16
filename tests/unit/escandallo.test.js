/**
 * Tests unitarios — escandallo (POC2 reescritura).
 *
 * Mocks: EscandalloManager + EscandalloToolResultFormatter via require cache.
 *
 * Ejecutar: node tests/unit/escandallo.test.js
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

const MANAGER_PATH   = require.resolve('../../modules/escandallo/core/escandallo-manager');
const FORMATTER_PATH = require.resolve('../../modules/escandallo/core/tool-result-formatter');

let managerInstance;
function makeMockManager() {
  return {
    initialize: async () => {},
    close:      async () => {},
    getEscandallo:  async (id) => id === 'esc-known' ? { id, coste_total: 5 } : null,
    getHistory:     async (recetaId, limit) => recetaId === 'r-known' ? [{ timestamp: Date.now(), coste_porcion: 2.5, food_cost_porcentaje: 30 }] : [],
    getAlertas:     async (id) => id === 'esc-alert' ? [{ tipo: 'spike', descripcion: 'Subida 20%', fecha: Date.now(), leida: false }] : [],
    search:         async () => [{ nombre: 'Pasta', coste_porcion: 1.5, tiene_alerta: false }],
    searchAndRank:  async () => ({ count: 1, results: [{ nombre: 'Pasta', coste_porcion: 1.5, score: 0.8 }] })
  };
}

class MockEscandalloManager {
  constructor(_dbPath, _logger) {
    managerInstance = makeMockManager();
    return managerInstance;
  }
}

const FormatterMock = {
  formatSafely: (esc, _kind) => `=== ESCANDALLO ${esc.id} ===\nCoste total: ${esc.coste_total}€`
};

require.cache[MANAGER_PATH]   = { exports: MockEscandalloManager, id: MANAGER_PATH,   filename: MANAGER_PATH,   loaded: true };
require.cache[FORMATTER_PATH] = { exports: FormatterMock,         id: FORMATTER_PATH, filename: FORMATTER_PATH, loaded: true };

delete require.cache[require.resolve('../../modules/escandallo/index.js')];
const EscandalloModule = require('../../modules/escandallo/index.js');

// --------------------------------------------------
// Mocks runtime
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

  const moduleLoader = {
    toolsRegistry: new Map()
  };

  return { logs, published, metricsCalls, logger, metrics, eventBus, moduleLoader };
}

const tmpDirs = [];
function makeTmpProject() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'escandallo-test-'));
  tmpDirs.push(base);
  return base;
}
function cleanupTmp() {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

async function instantiate(mocks) {
  const m = new EscandalloModule();
  await m.onLoad({
    eventBus:     mocks.eventBus,
    logger:       mocks.logger,
    metrics:      mocks.metrics,
    moduleLoader: mocks.moduleLoader
  });
  return { module: m };
}

async function activateProject(m, base, projectId = 'p1') {
  await m.onProjectActivated({ data: {
    project_id: projectId,
    base_path:  base
  }});
}

async function writeRecetas(base, recetas, ingredientes = []) {
  const dir = path.join(base, 'storage', 'recetas');
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'recetas.json'),      JSON.stringify(recetas));
  await fsp.writeFile(path.join(dir, 'ingredientes.json'), JSON.stringify(ingredientes));
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
    && result.data !== undefined
    && !('error' in result);
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

// ==================================================
//                                                Tests
// ==================================================

(async () => {
  console.log('escandallo — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa Maps + registra 5 analyzer tools', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'escandallo');
    assert.strictEqual(m.version, '3.0.0');
    assert.strictEqual(m.cache.size, 0);
    assert.strictEqual(m.managers.size, 0);
    assert.strictEqual(mocks.moduleLoader.toolsRegistry.size, 5);
    assert.ok(mocks.moduleLoader.toolsRegistry.has('escandallo.obtener'));
    assert.ok(mocks.moduleLoader.toolsRegistry.has('escandallo.buscar_y_ordenar'));
    await m.onUnload();
  });

  await testAsync('onUnload cierra managers + limpia cache', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m._getManager('p1');
    assert.strictEqual(m.managers.size, 1);
    await m.onUnload();
    assert.strictEqual(m.managers.size, 0);
    assert.strictEqual(m.cache.size, 0);
  });

  // ==========================================
  // Group 2: Validacion canonica
  // ==========================================

  await testAsync('toolEscandalloReceta sin receta_id → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolEscandalloReceta({ project_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'receta_id');
    await m.onUnload();
  });

  await testAsync('toolEscandalloReceta sin project_id → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolEscandalloReceta({ receta_id: 'r-1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.details.field, 'project_id');
    await m.onUnload();
  });

  await testAsync('toolObtenerEscandallo sin args → 400 con shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolObtenerEscandallo({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Bus subscribes — cache invalidation
  // ==========================================

  await testAsync('onProjectActivated carga recetas/ingredientes en cache', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    await writeRecetas(base, [{ id: 'r-1', nombre: 'Pasta', porciones: 4, ingredientes: [] }]);
    const { module: m } = await instantiate(mocks);
    await activateProject(m, base);
    assert.ok(m.cache.has('p1'));
    assert.strictEqual(m.cache.get('p1').recetas.length, 1);
    await m.onUnload();
  });

  await testAsync('onRecetaCreada y onRecetaActualizada invalidan cache del proyecto', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.cache.set('p1', { recetas: [], ingredientes: [] });
    await m.onRecetaCreada({ data: { project_id: 'p1' }});
    assert.strictEqual(m.cache.has('p1'), false);

    m.cache.set('p1', { recetas: [], ingredientes: [] });
    await m.onRecetaActualizada({ data: { proyecto_id: 'p1' }});
    assert.strictEqual(m.cache.has('p1'), false);
    await m.onUnload();
  });

  await testAsync('onIngredientePrecioActualizado vacia TODO el cache', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.cache.set('p1', { recetas: [], ingredientes: [] });
    m.cache.set('p2', { recetas: [], ingredientes: [] });
    await m.onIngredientePrecioActualizado();
    assert.strictEqual(m.cache.size, 0);
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Tool escandallo.receta success + alerta
  // ==========================================

  await testAsync('toolEscandalloReceta calcula coste + emite escandallo.calculado', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    await writeRecetas(base, [{
      id: 'pasta', nombre: 'Pasta', categoria: 'pizzas', porciones: 4,
      ingredientes: [
        { nombre: 'Harina',     cantidad: 0.5, unidad: 'kg', precio_mercado: 1.2 },
        { nombre: 'Mozzarella', cantidad: 0.2, unidad: 'kg', precio_mercado: 4.0 }
      ]
    }]);
    const { module: m } = await instantiate(mocks);
    await activateProject(m, base);
    mocks.published.length = 0;

    const r = await m.toolEscandalloReceta({
      receta_id: 'pasta', project_id: 'p1', correlation_id: 'cid-EC'
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.coste_total, 5.2);
    assert.strictEqual(r.data.coste_porcion, 1.3);
    assert.strictEqual(r.data.desglose[0].nombre, 'Mozzarella');
    assert.ok(r.data.insights.length > 0);

    const evs = publishedOf(mocks, 'escandallo.calculado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid-EC');
    assert.strictEqual(evs[0].project_id, 'p1');
    await m.onUnload();
  });

  await testAsync('toolEscandalloReceta con food_cost > 35% emite escandallo.alerta', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    await writeRecetas(base, [{
      id: 'pasta', nombre: 'Pasta', categoria: 'pizzas', porciones: 1,
      ingredientes: [{ nombre: 'X', cantidad: 1, unidad: 'kg', precio_mercado: 5 }]
    }]);
    const { module: m } = await instantiate(mocks);
    await activateProject(m, base);
    mocks.published.length = 0;

    // precio_venta = 10, coste = 5 → food_cost = 50% (>35%, emite alerta)
    const r = await m.toolEscandalloReceta({
      receta_id: 'pasta', project_id: 'p1', precio_venta: 10
    });
    assert.ok(isCanonicalSuccess(r));
    const alertas = publishedOf(mocks, 'escandallo.alerta');
    assert.strictEqual(alertas.length, 1);
    assert.strictEqual(alertas[0].tipo, 'food_cost_alto');
    assert.strictEqual(alertas[0].food_cost, 50);
    await m.onUnload();
  });

  await testAsync('toolEscandalloReceta receta inexistente → 404', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    await writeRecetas(base, []);
    const { module: m } = await instantiate(mocks);
    await activateProject(m, base);
    const r = await m.toolEscandalloReceta({ receta_id: 'fantasma', project_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  // ==========================================
  // Group 5: Otros tools success
  // ==========================================

  await testAsync('toolEscandalloGlobal devuelve rankings + por_categoria', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    await writeRecetas(base, [
      { id: 'r1', nombre: 'A', categoria: 'pizzas',    porciones: 2, ingredientes: [{ nombre: 'X', precio_mercado: 4 }] },
      { id: 'r2', nombre: 'B', categoria: 'bebidas',   porciones: 1, ingredientes: [{ nombre: 'Y', precio_mercado: 2 }] }
    ], [{ nombre: 'X' }, { nombre: 'Y' }]);
    const { module: m } = await instantiate(mocks);
    await activateProject(m, base);

    const r = await m.toolEscandalloGlobal({ project_id: 'p1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.total_recetas, 2);
    assert.ok(r.data.por_categoria.pizzas);
    assert.ok(r.data.por_categoria.bebidas);
    await m.onUnload();
  });

  await testAsync('toolCompararPrecios genera comparativa + emite escandallo.comparativa', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    await writeRecetas(base, [], [
      { nombre: 'X', precio_mercado_kg: 10, precio_compra_kg: 7,  unidad_base: 'kg' },
      { nombre: 'Y', precio_mercado_kg: 5,  precio_compra_kg: null, unidad_base: 'kg' }
    ]);
    const { module: m } = await instantiate(mocks);
    await activateProject(m, base);
    mocks.published.length = 0;

    const r = await m.toolCompararPrecios({ project_id: 'p1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.con_precio_compra.length, 1);
    assert.strictEqual(r.data.con_precio_compra[0].diferencia, 3);
    assert.strictEqual(r.data.sin_precio_compra.length, 1);
    assert.ok(publishedOf(mocks, 'escandallo.comparativa').length === 1);
    await m.onUnload();
  });

  await testAsync('toolSimularPrecio devuelve simulaciones + precio_para_food_cost', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    await writeRecetas(base, [{
      id: 'r1', nombre: 'X', porciones: 1,
      ingredientes: [{ cantidad: 1, unidad: 'kg', precio_mercado: 5 }]
    }]);
    const { module: m } = await instantiate(mocks);
    await activateProject(m, base);

    const r = await m.toolSimularPrecio({
      receta_id: 'r1', project_id: 'p1', food_cost_objetivo: 25
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.coste_porcion, 5);
    assert.ok(r.data.simulaciones.length >= 4);
    assert.strictEqual(r.data.precio_para_food_cost.precio_venta_necesario, 20);
    await m.onUnload();
  });

  await testAsync('toolIngredienteImpacto sin matches → 404', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    await writeRecetas(base, [
      { id: 'r1', nombre: 'X', porciones: 1, ingredientes: [{ nombre: 'Tomate', precio_mercado: 1 }] }
    ], []);
    const { module: m } = await instantiate(mocks);
    await activateProject(m, base);

    const r = await m.toolIngredienteImpacto({
      ingrediente_nombre: 'fantasma', project_id: 'p1'
    });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    await m.onUnload();
  });

  await testAsync('toolFichaTecnica devuelve ficha completa con alergenos', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    await writeRecetas(base, [{
      id: 'r1', nombre: 'Pizza', categoria: 'pizzas', porciones: 4,
      ingredientes: [{ ingrediente_id: 'ing-q', nombre: 'Mozzarella', cantidad: 0.2, unidad: 'kg', precio_mercado: 4 }]
    }], [
      { id: 'ing-q', nombre: 'Mozzarella', alergenos: ['lacteos'] }
    ]);
    const { module: m } = await instantiate(mocks);
    await activateProject(m, base);

    const r = await m.toolFichaTecnica({ receta_id: 'r1', project_id: 'p1', precio_venta: 12 });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.nombre, 'Pizza');
    assert.deepStrictEqual(r.data.alergenos, ['lacteos']);
    assert.ok(r.data.margen);
    await m.onUnload();
  });

  // ==========================================
  // Group 6: Analyzer tools
  // ==========================================

  await testAsync('toolObtenerEscandallo via manager devuelve formatted data', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolObtenerEscandallo({ escandallo_id: 'esc-known', project_id: 'p1' });
    assert.ok(isCanonicalSuccess(r));
    assert.ok(typeof r.data === 'string');
    assert.ok(r.data.includes('esc-known'));
    await m.onUnload();
  });

  await testAsync('toolObtenerEscandallo not found → 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolObtenerEscandallo({ escandallo_id: 'fantasma', project_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    await m.onUnload();
  });

  await testAsync('toolObtenerHistorico devuelve formatted lines o 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = await m.toolObtenerHistorico({ receta_id: 'r-known', project_id: 'p1' });
    assert.ok(isCanonicalSuccess(r1));
    assert.ok(r1.data.includes('Total registros: 1'));

    const r2 = await m.toolObtenerHistorico({ receta_id: 'fantasma', project_id: 'p1' });
    assert.strictEqual(r2.status, 404);
    await m.onUnload();
  });

  await testAsync('toolObtenerAlertas devuelve formatted lines', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolObtenerAlertas({ escandallo_id: 'esc-alert', project_id: 'p1' });
    assert.ok(isCanonicalSuccess(r));
    assert.ok(r.data.includes('Total alertas: 1'));
    await m.onUnload();
  });

  await testAsync('toolBuscar devuelve resultados formateados', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolBuscar({ project_id: 'p1', coste_min: 0 });
    assert.ok(isCanonicalSuccess(r));
    assert.ok(r.data.includes('Resultados encontrados: 1'));
    await m.onUnload();
  });

  await testAsync('toolBuscarYOrdenar devuelve resultados con score', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.toolBuscarYOrdenar({ project_id: 'p1', rankBy: 'cost' });
    assert.ok(isCanonicalSuccess(r));
    assert.ok(r.data.includes('Resultados: 1'));
    await m.onUnload();
  });

  // ==========================================
  // Group 7: Helpers POC2 + internos
  // ==========================================

  await testAsync('_calcularEscandallo ordena ingredientes por precio descendente', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const esc = m._calcularEscandallo({
      porciones: 1,
      ingredientes: [
        { nombre: 'Cheap', cantidad: 1, unidad: 'kg', precio_mercado: 1 },
        { nombre: 'Expensive', cantidad: 1, unidad: 'kg', precio_mercado: 5 }
      ]
    });
    assert.strictEqual(esc.desglose[0].nombre, 'Expensive');
    assert.strictEqual(esc.desglose[1].nombre, 'Cheap');
    await m.onUnload();
  });

  await testAsync('_calcularMargen calcula food_cost_porcentaje + multiplicador', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const m1 = m._calcularMargen(2, 10);
    assert.strictEqual(m1.food_cost_porcentaje, 20);
    assert.strictEqual(m1.multiplicador, 5);
    assert.strictEqual(m._calcularMargen(2, 0), null);
    await m.onUnload();
  });

  await testAsync('_errorResponse construye shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._errorResponse(400, 'INVALID_INPUT', 'msg', { field: 'x' });
    assert.deepStrictEqual(r, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { field: 'x' } } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea ENOENT/required/E*', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'ENOENT' })), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'EIO' })), 'UNKNOWN_ERROR');
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

  await testAsync('_handleHandlerError mapea status y registra metric escandallo.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.metricsCalls.length = 0;
    const err = Object.assign(new Error('not found'), { _code: 'RESOURCE_NOT_FOUND' });
    const r = m._handleHandlerError('t.failed', err, 'kind');
    assert.strictEqual(r.status, 404);
    const metric = mocks.metricsCalls.find(c => c[1] === 'escandallo.errors');
    assert.ok(metric);
    await m.onUnload();
  });

  cleanupTmp();
  console.log('\nTodos los tests pasaron.');
  process.exit(0);
})();

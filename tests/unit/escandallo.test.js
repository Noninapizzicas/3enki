/**
 * Tests del modulo `escandallo` v4.0.0.
 *
 * 7 grupos POC2:
 *   1. Lifecycle
 *   2. Validacion canonica
 *   3. Success calcular (publish escandallo.calculado + escandallo.alerta.detectada AJV strict)
 *   4. Success comparativa (publish escandallo.comparativa.calculada AJV strict)
 *   5. Success simular/optimizar/impacto/ficha (puras + algoritmos)
 *   6. Bus handlers + obtener/listar/cache invalidation
 *   7. Helpers POC2 (_publicarEvento, _calcularEscandallo, _calcularMargen, _invalidateProjectCache)
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const Ajv    = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const EscandalloModule = require('../../modules/escandallo/index.js');

const SCHEMAS_DIR = path.resolve(__dirname, '../../arquitectura/decisiones/_schemas/subsistema-recetario');

function loadAjv() {
  const fs = require('fs');
  const ajv = new Ajv({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  for (const f of fs.readdirSync(SCHEMAS_DIR)) {
    if (!f.endsWith('.json')) continue;
    const schema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, f), 'utf-8'));
    ajv.addSchema(schema, f);
  }
  return ajv;
}

const ajv = loadAjv();
const validateCalculado          = ajv.getSchema('escandallo.calculado.schema.json');
const validateAlertaDetectada    = ajv.getSchema('escandallo.alerta.detectada.schema.json');
const validateComparativaCalcul  = ajv.getSchema('escandallo.comparativa.calculada.schema.json');
if (!validateCalculado || !validateAlertaDetectada || !validateComparativaCalcul) {
  throw new Error('Schemas oficiales escandallo.* no encontrados');
}

function makeMocks({ projectBasePath = '/tmp/proj-test', preexistingStore = null } = {}) {
  const logs = [], metricsCalls = [], published = [];
  const fsStore = new Map();
  if (preexistingStore) {
    fsStore.set(`${projectBasePath}/escandallo.json`, JSON.stringify(preexistingStore, null, 2));
  }

  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };
  const metrics = {
    increment: (n, v, labels) => metricsCalls.push(['increment', n, v, labels]),
    gauge:     (n, v, labels) => metricsCalls.push(['gauge',     n, v, labels]),
    timing:    (n, v, labels) => metricsCalls.push(['timing',    n, v, labels])
  };

  let mod = null;
  const eventBus = {
    publish: async (eventName, payload) => {
      published.push([eventName, payload]);
      if (eventName === 'fs.read.request') {
        const content = fsStore.has(payload.path) ? fsStore.get(payload.path) : null;
        const resp = content !== null
          ? { request_id: payload.request_id, content, path: payload.path }
          : { request_id: payload.request_id, error: { code: 'RESOURCE_NOT_FOUND', kind: 'enoent' }, path: payload.path };
        process.nextTick(() => mod && mod.onFsReadResponse({ data: resp }));
      }
      if (eventName === 'fs.write.request') {
        fsStore.set(payload.path, payload.content);
        process.nextTick(() => mod && mod.onFsWriteResponse({ data: { request_id: payload.request_id, path: payload.path } }));
      }
      if (eventName === 'project.get.request') {
        process.nextTick(() => mod && mod.onProjectGetResponse({ data: { request_id: payload.request_id, project_id: payload.project_id, base_path: projectBasePath } }));
      }
    }
  };

  const core = { logger, metrics, eventBus, config: {} };
  return { logs, metricsCalls, published, fsStore, logger, metrics, eventBus, core, setMod: (m) => { mod = m; } };
}

async function setupModule(opts = {}) {
  const mocks = makeMocks(opts);
  const mod = new EscandalloModule();
  mocks.setMod(mod);
  await mod.onLoad(mocks.core);
  if (opts.projectId) {
    mod.projectBasePaths.set(opts.projectId, opts.projectBasePath || '/tmp/proj-test');
  }
  return { mod, mocks };
}

const baseCalcParams = {
  project_id: 'p1',
  user_id:    'jefe',
  receta_id:  'rec_xyz',
  nombre:     'Tomate confitado',
  porciones:  4,
  ingredientes: [
    { nombre: 'tomate', cantidad: 1.0, unidad: 'kg' },
    { nombre: 'aceite', cantidad: 0.1, unidad: 'l' }
  ],
  precios_catalogo: { 'tomate': 2.5, 'aceite': 8.0 }
};

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function runTests() {
  let passed = 0, failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ok ${t.name}`);
      passed++;
    } catch (err) {
      console.log(`  FAIL ${t.name}`);
      console.log(`       ${err.message}`);
      if (err.stack) console.log(`       ${err.stack.split('\n').slice(1, 3).join('\n       ')}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) process.exit(1);
}

// ============================================================
// Group 1: Lifecycle
// ============================================================

test('Group 1 / onLoad inyecta deps + extiende BaseModule', async () => {
  const { mod, mocks } = await setupModule();
  assert.strictEqual(mod.logger,   mocks.logger);
  assert.strictEqual(mod.eventBus, mocks.eventBus);
  assert.strictEqual(mod.name, 'escandallo');
  assert.strictEqual(mod.version, '4.0.0');
  assert.strictEqual(typeof mod._errorResponse, 'function');
  assert.strictEqual(typeof mod._handleHandlerError, 'function');
  assert.strictEqual(typeof mod._classifyHandlerError, 'function');
  assert.strictEqual(typeof mod._statusFromCode, 'function');
});

test('Group 1 / onLoad loguea escandallo.loaded con storage json-per-project', async () => {
  const { mocks } = await setupModule();
  const loaded = mocks.logs.find(l => l[1] === 'escandallo.loaded');
  assert.ok(loaded);
  assert.strictEqual(loaded[2].version, '4.0.0');
  assert.strictEqual(loaded[2].storage, 'json-per-project');
});

test('Group 1 / onUnload limpia caches, queues y timers', async () => {
  const { mod } = await setupModule();
  mod.projectBasePaths.set('p1', '/tmp/p1');
  mod.snapshotCache.set('p1|r1', { snapshot: {}, ts: 1 });
  mod.pendingFs.set('r', { resolve: () => {}, reject: () => {}, timer: setTimeout(() => {}, 1e6) });
  mod.writeQueues.set('p1', Promise.resolve());
  await mod.onUnload();
  assert.strictEqual(mod.projectBasePaths.size, 0);
  assert.strictEqual(mod.snapshotCache.size, 0);
  assert.strictEqual(mod.pendingFs.size, 0);
  assert.strictEqual(mod.writeQueues.size, 0);
});

// ============================================================
// Group 2: Validacion canonica
// ============================================================

test('Group 2 / calcular sin project_id devuelve 400', async () => {
  const { mod } = await setupModule();
  const r = await mod.onCalcular({ ...baseCalcParams, project_id: undefined });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'project_id');
});

test('Group 2 / calcular con porciones=0 devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCalcular({ ...baseCalcParams, porciones: 0 });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'porciones');
});

test('Group 2 / calcular sin ingredientes devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCalcular({ ...baseCalcParams, ingredientes: [] });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'ingredientes');
});

test('Group 2 / comparar_precios sin precios_compra devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCompararPrecios({ project_id: 'p1', precios_catalogo: { x: 1 } });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'precios_compra');
});

test('Group 2 / simular_precio con coste_por_porcion negativo devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onSimularPrecio({ project_id: 'p1', receta_id: 'r1', coste_por_porcion: -1 });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'coste_por_porcion');
});

test('Group 2 / ingrediente_impacto sin recetas_afectadas devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onIngredienteImpacto({ project_id: 'p1', ingrediente_nombre: 'tomate', precio_actual: 2.5, recetas_afectadas: [] });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'recetas_afectadas');
});

test('Group 2 / obtener para receta inexistente devuelve 404 con entity_type recipe', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onObtener({ project_id: 'p1', receta_id: 'no-existe' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
  assert.strictEqual(r.error.details.entity_type, 'recipe');
});

// ============================================================
// Group 3: Success calcular + alerta
// ============================================================

test('Group 3 / calcular exitoso retorna 201 con coste_total, coste_por_porcion, coste_es_real', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCalcular(baseCalcParams);
  assert.strictEqual(r.status, 201);
  // 1 kg * 2.5 + 0.1 l * 8.0 = 2.5 + 0.8 = 3.3
  assert.ok(Math.abs(r.data.coste_total - 3.3) < 1e-9);
  assert.ok(Math.abs(r.data.coste_por_porcion - 0.825) < 1e-9);
  assert.strictEqual(r.data.coste_es_real, true);
  assert.strictEqual(r.data.food_cost_pct, null);
  assert.strictEqual(r.data.desglose.length, 2);
});

test('Group 3 / calcular publica escandallo.calculado con shape canonico AJV strict', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  await mod.onCalcular({ ...baseCalcParams, correlation_id: 'corr-c-1' });
  const ev = mocks.published.find(([n]) => n === 'escandallo.calculado');
  assert.ok(ev);
  const [, payload] = ev;
  if (!validateCalculado(payload)) {
    const msg = validateCalculado.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`payload no cumple schema: ${msg}\npayload: ${JSON.stringify(payload, null, 2)}`);
  }
  assert.strictEqual(payload.correlation_id, 'corr-c-1');
  assert.strictEqual(payload.user_id, 'jefe');
  assert.strictEqual(payload.coste_es_real, true);
  assert.ok(!('food_cost_pct' in payload), 'food_cost_pct no debe estar si no se paso precio_venta');
});

test('Group 3 / calcular con ingrediente sin precio: coste_es_real=false + ingredientes_sin_precio', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCalcular({
    ...baseCalcParams,
    ingredientes: [
      { nombre: 'tomate', cantidad: 1, unidad: 'kg' },
      { nombre: 'trufa-blanca', cantidad: 0.01, unidad: 'kg' }
    ],
    precios_catalogo: { 'tomate': 2.5 }
  });
  assert.strictEqual(r.data.coste_es_real, false);
  const ev = mocks.published.find(([n]) => n === 'escandallo.calculado');
  assert.deepStrictEqual(ev[1].ingredientes_sin_precio, ['trufa-blanca']);
});

test('Group 3 / calcular con PVP cruzando umbral publica escandallo.alerta.detectada AJV strict', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  // coste/porcion = 0.825; con PVP = 2.0 -> food_cost = 41.25% > 35%
  await mod.onCalcular({ ...baseCalcParams, precio_venta: 2.0, correlation_id: 'corr-al-1' });
  const ev = mocks.published.find(([n]) => n === 'escandallo.alerta.detectada');
  assert.ok(ev, 'esperaba publish escandallo.alerta.detectada');
  const [, payload] = ev;
  if (!validateAlertaDetectada(payload)) {
    const msg = validateAlertaDetectada.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`alerta no cumple schema: ${msg}\npayload: ${JSON.stringify(payload, null, 2)}`);
  }
  assert.strictEqual(payload.correlation_id, 'corr-al-1');
  assert.strictEqual(payload.tipo, 'food_cost_alto');
  assert.ok(payload.valor_observado > 35);
  assert.strictEqual(payload.umbral, 35);
});

test('Group 3 / calcular con PVP debajo del umbral NO publica alerta', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  await mod.onCalcular({ ...baseCalcParams, precio_venta: 10.0 });
  const ev = mocks.published.find(([n]) => n === 'escandallo.alerta.detectada');
  assert.ok(!ev, 'no debe publicar alerta cuando food_cost < umbral');
});

test('Group 3 / calcular persiste snapshot al fs y reemplaza si re-calcula la misma receta', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1', projectBasePath: '/tmp/p1-base' });
  await mod.onCalcular(baseCalcParams);
  await mod.onCalcular({
    ...baseCalcParams,
    ingredientes: [{ nombre: 'tomate', cantidad: 5, unidad: 'kg' }],
    precios_catalogo: { 'tomate': 2.5 }
  });

  const writes = mocks.published.filter(([n]) => n === 'fs.write.request');
  assert.ok(writes.length >= 2);
  assert.strictEqual(writes[0][1].path, '/tmp/p1-base/escandallo.json');

  const finalStore = JSON.parse(writes[writes.length - 1][1].content);
  assert.strictEqual(finalStore.snapshots.length, 1, 'el snapshot se reemplaza, no se duplica');
  assert.ok(Math.abs(finalStore.snapshots[0].coste_total - 12.5) < 1e-9);
});

// ============================================================
// Group 4: Success comparativa
// ============================================================

test('Group 4 / comparar_precios calcula delta_pct y publica con AJV strict', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCompararPrecios({
    project_id: 'p1', user_id: 'jefe', correlation_id: 'corr-cmp-1',
    precios_catalogo: { 'tomate': 2.0, 'aceite': 8.0, 'sal': 0.5 },
    precios_compra:   { 'tomate': 2.4, 'aceite': 7.0 }
  });
  assert.strictEqual(r.status, 201);
  const linea_tomate = r.data.lineas.find(l => l.ingrediente === 'tomate');
  assert.ok(Math.abs(linea_tomate.delta_pct - 20) < 1e-9);
  const linea_aceite = r.data.lineas.find(l => l.ingrediente === 'aceite');
  assert.ok(Math.abs(linea_aceite.delta_pct - (-12.5)) < 1e-9);
  const linea_sal = r.data.lineas.find(l => l.ingrediente === 'sal');
  assert.strictEqual(linea_sal.precio_compra, null);
  assert.strictEqual(linea_sal.delta_pct, null);
  assert.deepStrictEqual(r.data.ingredientes_sin_compra_real, ['sal']);

  const ev = mocks.published.find(([n]) => n === 'escandallo.comparativa.calculada');
  assert.ok(ev);
  if (!validateComparativaCalcul(ev[1])) {
    const msg = validateComparativaCalcul.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`comparativa no cumple schema: ${msg}\npayload: ${JSON.stringify(ev[1], null, 2)}`);
  }
  assert.strictEqual(ev[1].correlation_id, 'corr-cmp-1');
});

// ============================================================
// Group 5: Success simular/optimizar/impacto/ficha
// ============================================================

test('Group 5 / simular_precio sin lista usa defaults 2.5x..4x del coste', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onSimularPrecio({ project_id: 'p1', receta_id: 'r1', coste_por_porcion: 2.0 });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.simulaciones.length, 4);
  assert.strictEqual(r.data.simulaciones[0].precio_venta, 5.0);
  assert.strictEqual(r.data.simulaciones[3].precio_venta, 8.0);
});

test('Group 5 / simular_precio con food_cost_objetivo calcula PVP necesario', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onSimularPrecio({
    project_id: 'p1', receta_id: 'r1', coste_por_porcion: 5.0,
    food_cost_objetivo: 25
  });
  assert.strictEqual(r.data.pvp_objetivo, 20);
});

test('Group 5 / ingrediente_impacto calcula delta_total agregado', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onIngredienteImpacto({
    project_id: 'p1', ingrediente_nombre: 'tomate', precio_actual: 2.0, subida_pct: 10,
    recetas_afectadas: [
      { receta_id: 'r1', nombre: 'A', cantidad: 1, unidad: 'kg' },
      { receta_id: 'r2', nombre: 'B', cantidad: 5, unidad: 'kg' }
    ]
  });
  assert.ok(Math.abs(r.data.delta_total - 1.2) < 1e-9);
  assert.strictEqual(r.data.recetas_afectadas, 2);
});

test('Group 5 / optimizar filtra recetas food_cost > maximo y coste_alto > 1.5x medio', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onOptimizar({
    project_id: 'p1',
    calculos: [
      { receta_id: 'r1', nombre: 'A', coste_por_porcion: 5,  food_cost_pct: 40 },
      { receta_id: 'r2', nombre: 'B', coste_por_porcion: 2,  food_cost_pct: 25 },
      { receta_id: 'r3', nombre: 'C', coste_por_porcion: 10, food_cost_pct: 20 }
    ]
  });
  assert.strictEqual(r.data.recetas_food_cost_alto.total, 1);
  assert.strictEqual(r.data.recetas_food_cost_alto.items[0].receta_id, 'r1');
  assert.strictEqual(r.data.recetas_coste_alto.total, 1);
  assert.strictEqual(r.data.recetas_coste_alto.items[0].receta_id, 'r3');
});

test('Group 5 / ficha_tecnica incluye margen cuando se pasa precio_venta', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onFichaTecnica({
    project_id: 'p1', receta_id: 'r1', nombre: 'Tomate confitado', porciones: 4,
    calculo: { coste_total: 3.3, coste_por_porcion: 0.825 },
    precio_venta: 4.0
  });
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.margen);
  assert.ok(Math.abs(r.data.margen.food_cost_pct - 20.625) < 1e-9);
});

test('Group 5 / ficha_tecnica sin precio_venta no incluye margen', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onFichaTecnica({
    project_id: 'p1', receta_id: 'r1', nombre: 'A', porciones: 4,
    calculo: { coste_total: 3.3, coste_por_porcion: 0.825 }
  });
  assert.ok(!r.data.margen);
});

// ============================================================
// Group 6: Bus handlers + obtener/listar + cache invalidation
// ============================================================

test('Group 6 / onProjectActivated puebla cache de basePaths', async () => {
  const { mod } = await setupModule();
  mod.onProjectActivated({ data: { project_id: 'pX', base_path: '/var/pX' } });
  assert.strictEqual(mod.projectBasePaths.get('pX'), '/var/pX');
});

test('Group 6 / obtener despues de calcular devuelve snapshot persistido', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  await mod.onCalcular(baseCalcParams);
  const r = await mod.onObtener({ project_id: 'p1', receta_id: 'rec_xyz' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.receta_id, 'rec_xyz');
  assert.strictEqual(r.data.coste_es_real, true);
});

test('Group 6 / listar_alertas devuelve vacio cuando no hubo alertas', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onListarAlertas({ project_id: 'p1' });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.alertas, []);
});

test('Group 6 / listar_alertas filtra por tipo cuando se pasa', async () => {
  const { mod } = await setupModule({
    projectId: 'p1',
    preexistingStore: {
      _version: '4.0.0', _updated: null, snapshots: [], comparativas: [],
      alertas: [
        { id: 'a1', tipo: 'food_cost_alto', receta_id: 'r1', nombre: 'A', valor_observado: 40, umbral: 35, detalle: 'x', created_at: 'x' },
        { id: 'a2', tipo: 'margen_negativo', receta_id: 'r2', nombre: 'B', valor_observado: -1, umbral: 0, detalle: 'y', created_at: 'x' }
      ]
    }
  });
  const r = await mod.onListarAlertas({ project_id: 'p1', tipo: 'food_cost_alto' });
  assert.strictEqual(r.data.total, 1);
  assert.strictEqual(r.data.alertas[0].receta_id, 'r1');
});

test('Group 6 / onRecetaActualizada invalida cache del proyecto (no de otros)', async () => {
  const { mod } = await setupModule();
  mod.snapshotCache.set('p1|r1', { snapshot: {}, ts: 1 });
  mod.snapshotCache.set('p1|r2', { snapshot: {}, ts: 1 });
  mod.snapshotCache.set('p2|r1', { snapshot: {}, ts: 1 });
  mod.onRecetaActualizada({ data: { project_id: 'p1', receta_id: 'r1' } });
  assert.strictEqual(mod.snapshotCache.has('p1|r1'), false);
  assert.strictEqual(mod.snapshotCache.has('p1|r2'), false, 'p1 entero invalidado');
  assert.strictEqual(mod.snapshotCache.has('p2|r1'), true,  'p2 intacto');
});

test('Group 6 / onRecetaCreada acepta compat proyecto_id (drift heredado)', async () => {
  const { mod } = await setupModule();
  mod.snapshotCache.set('p1|r1', { snapshot: {}, ts: 1 });
  mod.onRecetaCreada({ data: { proyecto_id: 'p1', receta_id: 'r1' } });
  assert.strictEqual(mod.snapshotCache.has('p1|r1'), false);
});

test('Group 6 / onIngredientePrecioActualizado invalida cache entera', async () => {
  const { mod } = await setupModule();
  mod.snapshotCache.set('p1|r1', { snapshot: {}, ts: 1 });
  mod.snapshotCache.set('p2|r2', { snapshot: {}, ts: 1 });
  mod.onIngredientePrecioActualizado();
  assert.strictEqual(mod.snapshotCache.size, 0);
});

// ============================================================
// Group 7: Helpers POC2 + algoritmos
// ============================================================

test('Group 7 / _publicarEvento propaga correlation_id + anade project_id/user_id/timestamp', async () => {
  const { mod, mocks } = await setupModule();
  await mod._publicarEvento('test.ev', { project_id: 'p1', user_id: 'u1' }, { correlation_id: 'cc' });
  const ev = mocks.published.find(([n]) => n === 'test.ev');
  assert.strictEqual(ev[1].correlation_id, 'cc');
  assert.strictEqual(ev[1].project_id, 'p1');
  assert.strictEqual(ev[1].user_id, 'u1');
  assert.ok(ev[1].timestamp.match(/^\d{4}-\d{2}-\d{2}T/));
});

test('Group 7 / _calcularEscandallo computa coste linealmente', async () => {
  const { mod } = await setupModule();
  const r = mod._calcularEscandallo({
    ingredientes: [
      { nombre: 'a', cantidad: 2, unidad: 'kg' },
      { nombre: 'b', cantidad: 0.5, unidad: 'l' }
    ],
    precios_catalogo: { 'a': 3.0, 'b': 4.0 },
    porciones: 2
  });
  assert.strictEqual(r.coste_total, 8.0);
  assert.strictEqual(r.coste_por_porcion, 4.0);
  assert.strictEqual(r.coste_es_real, true);
});

test('Group 7 / _calcularEscandallo acepta precios_catalogo como objeto {precio_por_unidad}', async () => {
  const { mod } = await setupModule();
  const r = mod._calcularEscandallo({
    ingredientes: [{ nombre: 'a', cantidad: 2, unidad: 'kg' }],
    precios_catalogo: { 'a': { precio_por_unidad: 5.0, unidad: 'kg' } },
    porciones: 1
  });
  assert.strictEqual(r.coste_total, 10.0);
});

test('Group 7 / _calcularMargen retorna food_cost_pct, margen_euro, multiplicador', async () => {
  const { mod } = await setupModule();
  const r = mod._calcularMargen(2.0, 10.0);
  assert.strictEqual(r.food_cost_pct, 20);
  assert.strictEqual(r.margen_euro, 8);
  assert.strictEqual(r.multiplicador, 5);
});

test('Group 7 / _invalidateProjectCache solo borra keys del proyecto exacto', async () => {
  const { mod } = await setupModule();
  mod.snapshotCache.set('p1|r1', { ts: 1 });
  mod.snapshotCache.set('p1|r2', { ts: 1 });
  mod.snapshotCache.set('p10|r1', { ts: 1 });
  mod._invalidateProjectCache('p1');
  assert.strictEqual(mod.snapshotCache.has('p1|r1'), false);
  assert.strictEqual(mod.snapshotCache.has('p1|r2'), false);
  assert.strictEqual(mod.snapshotCache.has('p10|r1'), true, 'p10 NO debe afectarse');
});

test('Group 7 / _handleHandlerError respeta err._code = UPSTREAM_TIMEOUT y mapea a 504', async () => {
  const { mod } = await setupModule();
  const r = mod._handleHandlerError('test', Object.assign(new Error('x'), { _code: 'UPSTREAM_TIMEOUT' }), 'tool');
  assert.strictEqual(r.status, 504);
  assert.strictEqual(r.error.code, 'UPSTREAM_TIMEOUT');
});

runTests();

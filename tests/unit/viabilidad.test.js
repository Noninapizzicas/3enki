/**
 * Tests del modulo `viabilidad` v1.0.0.
 *
 * 7 grupos POC2:
 *   1. Lifecycle
 *   2. Validacion canonica
 *   3. Success evaluar con PVP (3 veredictos + AJV strict)
 *   4. Success evaluar sin PVP (sin_pvp_objetivo)
 *   5. Success obtener / listar
 *   6. Success descartar (publish evaluacion.descartada AJV strict + transicion estado)
 *   7. Helpers POC2 + algoritmo _calcularViabilidad (umbrales exactos)
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const Ajv    = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const ViabilidadModule = require('../../modules/viabilidad/index.js');

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
const validateCompletada = ajv.getSchema('viabilidad.evaluacion.completada.schema.json');
const validateDescartada = ajv.getSchema('viabilidad.evaluacion.descartada.schema.json');
if (!validateCompletada || !validateDescartada) {
  throw new Error('Schemas oficiales viabilidad.* no encontrados');
}

function makeMocks({ projectBasePath = '/tmp/proj-test', preexistingStore = null } = {}) {
  const logs = [], metricsCalls = [], published = [];
  const fsStore = new Map();
  if (preexistingStore) {
    fsStore.set(`${projectBasePath}/viabilidad.json`, JSON.stringify(preexistingStore, null, 2));
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
  const mod = new ViabilidadModule();
  mocks.setMod(mod);
  await mod.onLoad(mocks.core);
  if (opts.projectId) {
    mod.projectBasePaths.set(opts.projectId, opts.projectBasePath || '/tmp/proj-test');
  }
  return { mod, mocks };
}

const baseEvaluar = {
  project_id: 'p1',
  user_id:    'chef',
  nombre_idea: 'Postre con miso y chocolate',
  ingredientes_estimados: [
    { nombre: 'miso',     cantidad: 0.02, unidad: 'kg' },
    { nombre: 'chocolate',cantidad: 0.1,  unidad: 'kg' }
  ],
  porciones: 4,
  precios_catalogo: { 'miso': 25.0, 'chocolate': 15.0 }
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
  assert.strictEqual(mod.name, 'viabilidad');
  assert.strictEqual(mod.version, '1.0.0');
  assert.strictEqual(typeof mod._errorResponse, 'function');
  assert.strictEqual(typeof mod._handleHandlerError, 'function');
});

test('Group 1 / onLoad loguea viabilidad.loaded con storage json-per-project', async () => {
  const { mocks } = await setupModule();
  const loaded = mocks.logs.find(l => l[1] === 'viabilidad.loaded');
  assert.ok(loaded);
  assert.strictEqual(loaded[2].version, '1.0.0');
  assert.strictEqual(loaded[2].storage, 'json-per-project');
});

test('Group 1 / onUnload limpia caches y queues', async () => {
  const { mod } = await setupModule();
  mod.projectBasePaths.set('p1', '/tmp/p1');
  mod.pendingFs.set('r', { resolve: () => {}, reject: () => {}, timer: setTimeout(() => {}, 1e6) });
  mod.writeQueues.set('p1', Promise.resolve());
  await mod.onUnload();
  assert.strictEqual(mod.projectBasePaths.size, 0);
  assert.strictEqual(mod.pendingFs.size, 0);
  assert.strictEqual(mod.writeQueues.size, 0);
});

// ============================================================
// Group 2: Validacion canonica
// ============================================================

test('Group 2 / evaluar sin project_id devuelve 400', async () => {
  const { mod } = await setupModule();
  const r = await mod.onEvaluar({ ...baseEvaluar, project_id: undefined });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'project_id');
});

test('Group 2 / evaluar sin nombre_idea devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onEvaluar({ ...baseEvaluar, nombre_idea: '' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'nombre_idea');
});

test('Group 2 / evaluar con ingredientes vacios devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onEvaluar({ ...baseEvaluar, ingredientes_estimados: [] });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'ingredientes_estimados');
});

test('Group 2 / evaluar con porciones=0 devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onEvaluar({ ...baseEvaluar, porciones: 0 });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'porciones');
});

test('Group 2 / evaluar con precio_venta_objetivo<=0 devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onEvaluar({ ...baseEvaluar, precio_venta_objetivo: -1 });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'precio_venta_objetivo');
});

test('Group 2 / listar con veredicto invalido devuelve 400 con allowed', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onListar({ project_id: 'p1', veredicto: 'inventado' });
  assert.strictEqual(r.status, 400);
  assert.ok(r.error.details.allowed.includes('viable'));
});

test('Group 2 / descartar sin motivo devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onDescartar({ project_id: 'p1', expediente_id: 'x' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'motivo');
});

test('Group 2 / obtener para expediente inexistente devuelve 404 con entity_type viability-record', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onObtener({ project_id: 'p1', expediente_id: 'no-existe' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
  assert.strictEqual(r.error.details.entity_type, 'viability-record');
});

// ============================================================
// Group 3: Success evaluar con PVP (3 veredictos + AJV)
// ============================================================

test('Group 3 / evaluar viable: food_cost <= 30% retorna veredicto=viable', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  // coste = 0.02*25 + 0.1*15 = 0.5 + 1.5 = 2.0; /4 porc = 0.5/porcion
  // PVP=10 -> food_cost = 5% -> viable
  const r = await mod.onEvaluar({ ...baseEvaluar, precio_venta_objetivo: 10.0 });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.veredicto, 'viable');
  assert.ok(Math.abs(r.data.food_cost_pct - 5) < 1e-9);
  assert.strictEqual(r.data.coste_es_real, true);
});

test('Group 3 / evaluar con advertencias: 30% < food_cost <= 35%', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  // coste por porcion = 0.5; para food_cost=33% -> PVP = 0.5/0.33 ≈ 1.515
  const r = await mod.onEvaluar({ ...baseEvaluar, precio_venta_objetivo: 1.515 });
  assert.strictEqual(r.data.veredicto, 'viable_con_advertencias');
  assert.ok(r.data.food_cost_pct > 30 && r.data.food_cost_pct <= 35);
  assert.ok(r.data.advertencias.some(a => a.includes('food cost al limite')));
});

test('Group 3 / evaluar no viable: food_cost > 35%', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  // PVP=1 -> food_cost = 50% -> no viable
  const r = await mod.onEvaluar({ ...baseEvaluar, precio_venta_objetivo: 1.0 });
  assert.strictEqual(r.data.veredicto, 'no_viable_economicamente');
  assert.ok(r.data.food_cost_pct > 35);
});

test('Group 3 / evaluar publica viabilidad.evaluacion.completada con AJV strict', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  await mod.onEvaluar({ ...baseEvaluar, precio_venta_objetivo: 10.0, correlation_id: 'corr-e-1' });
  const ev = mocks.published.find(([n]) => n === 'viabilidad.evaluacion.completada');
  assert.ok(ev);
  const [, payload] = ev;
  if (!validateCompletada(payload)) {
    const msg = validateCompletada.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`payload no cumple schema: ${msg}\npayload: ${JSON.stringify(payload, null, 2)}`);
  }
  assert.strictEqual(payload.correlation_id, 'corr-e-1');
  assert.strictEqual(payload.user_id, 'chef');
  assert.strictEqual(payload.veredicto, 'viable');
  assert.strictEqual(payload.precio_venta_objetivo, 10.0);
});

test('Group 3 / evaluar con ingredientes sin precio: coste_es_real=false + advertencia', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onEvaluar({
    ...baseEvaluar,
    ingredientes_estimados: [
      { nombre: 'miso',  cantidad: 0.02, unidad: 'kg' },
      { nombre: 'wasabi-fresco', cantidad: 0.01, unidad: 'kg' }
    ],
    precios_catalogo: { 'miso': 25.0 },  // sin wasabi
    precio_venta_objetivo: 10.0
  });
  assert.strictEqual(r.data.coste_es_real, false);
  assert.ok(r.data.advertencias.some(a => a.includes('wasabi-fresco')));
});

// ============================================================
// Group 4: Success evaluar sin PVP
// ============================================================

test('Group 4 / evaluar sin precio_venta_objetivo retorna veredicto=sin_pvp_objetivo', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  const r = await mod.onEvaluar(baseEvaluar);  // sin precio_venta_objetivo
  assert.strictEqual(r.data.veredicto, 'sin_pvp_objetivo');
  assert.strictEqual(r.data.food_cost_pct, null);

  const ev = mocks.published.find(([n]) => n === 'viabilidad.evaluacion.completada');
  assert.ok(ev);
  if (!validateCompletada(ev[1])) throw new Error('publish no cumple AJV');
  assert.ok(!('food_cost_pct' in ev[1]), 'sin PVP no debe publicar food_cost_pct');
  assert.ok(!('precio_venta_objetivo' in ev[1]), 'sin PVP no debe publicar precio_venta_objetivo');
});

// ============================================================
// Group 5: Obtener / listar
// ============================================================

test('Group 5 / obtener expediente existente devuelve datos completos', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const c = await mod.onEvaluar({ ...baseEvaluar, precio_venta_objetivo: 10.0 });
  const r = await mod.onObtener({ project_id: 'p1', expediente_id: c.data.expediente_id });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.id, c.data.expediente_id);
  assert.strictEqual(r.data.veredicto, 'viable');
  assert.strictEqual(r.data.estado_expediente, 'evaluada');
});

test('Group 5 / listar filtra por veredicto', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  await mod.onEvaluar({ ...baseEvaluar, nombre_idea: 'Idea A', precio_venta_objetivo: 10.0 });
  await mod.onEvaluar({ ...baseEvaluar, nombre_idea: 'Idea B', precio_venta_objetivo: 1.0 });
  const r = await mod.onListar({ project_id: 'p1', veredicto: 'no_viable_economicamente' });
  assert.strictEqual(r.data.total, 1);
  assert.strictEqual(r.data.expedientes[0].nombre_idea, 'Idea B');
});

test('Group 5 / listar filtra por estado descartada', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const c1 = await mod.onEvaluar({ ...baseEvaluar, nombre_idea: 'A', precio_venta_objetivo: 10.0 });
  await mod.onEvaluar({ ...baseEvaluar, nombre_idea: 'B', precio_venta_objetivo: 10.0 });
  await mod.onDescartar({ project_id: 'p1', expediente_id: c1.data.expediente_id, motivo: 'No encaja' });
  const r = await mod.onListar({ project_id: 'p1', estado: 'descartada' });
  assert.strictEqual(r.data.total, 1);
  assert.strictEqual(r.data.expedientes[0].nombre_idea, 'A');
});

// ============================================================
// Group 6: Descartar
// ============================================================

test('Group 6 / descartar publica viabilidad.evaluacion.descartada con AJV strict', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  const c = await mod.onEvaluar({ ...baseEvaluar, precio_venta_objetivo: 10.0 });
  const r = await mod.onDescartar({
    project_id: 'p1', user_id: 'chef', correlation_id: 'corr-d-1',
    expediente_id: c.data.expediente_id,
    motivo: 'Cambio de estilo'
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.estado, 'descartada');

  const ev = mocks.published.find(([n]) => n === 'viabilidad.evaluacion.descartada');
  assert.ok(ev);
  if (!validateDescartada(ev[1])) {
    const msg = validateDescartada.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`descartada no cumple schema: ${msg}\n${JSON.stringify(ev[1], null, 2)}`);
  }
  assert.strictEqual(ev[1].correlation_id, 'corr-d-1');
  assert.strictEqual(ev[1].motivo, 'Cambio de estilo');
  assert.strictEqual(ev[1].veredicto_economico, 'viable', 'snapshot del veredicto al momento del descarte');
});

test('Group 6 / descartar expediente ya descartado devuelve 409 CONFLICT_STATE', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const c = await mod.onEvaluar({ ...baseEvaluar, precio_venta_objetivo: 10.0 });
  await mod.onDescartar({ project_id: 'p1', expediente_id: c.data.expediente_id, motivo: 'X' });
  const r = await mod.onDescartar({ project_id: 'p1', expediente_id: c.data.expediente_id, motivo: 'Y' });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'CONFLICT_STATE');
});

test('Group 6 / descartar persiste motivo_descarte y transiciona estado', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1', projectBasePath: '/tmp/p1-base' });
  const c = await mod.onEvaluar({ ...baseEvaluar, precio_venta_objetivo: 10.0 });
  await mod.onDescartar({ project_id: 'p1', expediente_id: c.data.expediente_id, motivo: 'reemplazo de ingrediente' });

  const writes = mocks.published.filter(([n]) => n === 'fs.write.request');
  const finalStore = JSON.parse(writes[writes.length - 1][1].content);
  assert.strictEqual(finalStore.expedientes[0].estado_expediente, 'descartada');
  assert.strictEqual(finalStore.expedientes[0].motivo_descarte, 'reemplazo de ingrediente');
});

// ============================================================
// Group 7: Helpers POC2 + algoritmo
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

test('Group 7 / _calcularViabilidad sin PVP devuelve sin_pvp_objetivo + food_cost_pct=null', async () => {
  const { mod } = await setupModule();
  const r = mod._calcularViabilidad({
    ingredientes: [{ nombre: 'x', cantidad: 1, unidad: 'kg' }],
    precios_catalogo: { x: 2 },
    porciones: 2,
    precio_venta_objetivo: null
  });
  assert.strictEqual(r.veredicto, 'sin_pvp_objetivo');
  assert.strictEqual(r.food_cost_pct, null);
  assert.strictEqual(r.coste_total, 2);
  assert.strictEqual(r.coste_por_porcion, 1);
});

test('Group 7 / _calcularViabilidad umbral exacto: food_cost=30% es viable', async () => {
  const { mod } = await setupModule();
  // coste/porcion=3, PVP=10 -> food_cost=30% (justo en umbral) -> viable (<=30)
  const r = mod._calcularViabilidad({
    ingredientes: [{ nombre: 'x', cantidad: 6, unidad: 'kg' }],
    precios_catalogo: { x: 1 },
    porciones: 2,
    precio_venta_objetivo: 10
  });
  assert.strictEqual(r.veredicto, 'viable');
  assert.strictEqual(r.food_cost_pct, 30);
});

test('Group 7 / _calcularViabilidad umbral exacto: food_cost=35% es viable_con_advertencias', async () => {
  const { mod } = await setupModule();
  // coste/porcion=3.5, PVP=10 -> food_cost=35% (justo en umbral_alerta) -> con_advertencias (<=35)
  const r = mod._calcularViabilidad({
    ingredientes: [{ nombre: 'x', cantidad: 7, unidad: 'kg' }],
    precios_catalogo: { x: 1 },
    porciones: 2,
    precio_venta_objetivo: 10
  });
  assert.strictEqual(r.veredicto, 'viable_con_advertencias');
  assert.strictEqual(r.food_cost_pct, 35);
});

test('Group 7 / _calcularViabilidad food_cost=35.01% es no_viable', async () => {
  const { mod } = await setupModule();
  const r = mod._calcularViabilidad({
    ingredientes: [{ nombre: 'x', cantidad: 7.002, unidad: 'kg' }],
    precios_catalogo: { x: 1 },
    porciones: 2,
    precio_venta_objetivo: 10
  });
  assert.strictEqual(r.veredicto, 'no_viable_economicamente');
  assert.ok(r.food_cost_pct > 35);
});

test('Group 7 / _calcularViabilidad acepta precios_catalogo como objeto {precio_por_unidad}', async () => {
  const { mod } = await setupModule();
  const r = mod._calcularViabilidad({
    ingredientes: [{ nombre: 'x', cantidad: 2, unidad: 'kg' }],
    precios_catalogo: { x: { precio_por_unidad: 3.0, unidad: 'kg' } },
    porciones: 1,
    precio_venta_objetivo: null
  });
  assert.strictEqual(r.coste_total, 6);
});

test('Group 7 / _handleHandlerError respeta err._code y mapea status canonico', async () => {
  const { mod } = await setupModule();
  const r = mod._handleHandlerError('test', Object.assign(new Error('x'), { _code: 'UPSTREAM_TIMEOUT' }), 'tool');
  assert.strictEqual(r.status, 504);
});

runTests();

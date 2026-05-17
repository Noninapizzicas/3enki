/**
 * Tests del modulo `mise-en-place` v1.0.0.
 *
 * 7 grupos POC2:
 *   1. Lifecycle
 *   2. Validacion canonica
 *   3. Success escalado (publish AJV strict)
 *   4. Success plan (publish AJV strict)
 *   5. Success compra (publish AJV strict + algoritmo de agregacion)
 *   6. Bus handlers + obtener/listar planes
 *   7. Helpers POC2 (_calcularEscalado, _agregarCompra, _publicarEvento)
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const Ajv    = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const MiseEnPlaceModule = require('../../modules/mise-en-place/index.js');

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
const validateEscalado = ajv.getSchema('produccion.escalado.calculado.schema.json');
const validatePlan     = ajv.getSchema('produccion.plan.publicado.schema.json');
const validateCompra   = ajv.getSchema('produccion.compra.calculada.schema.json');
if (!validateEscalado || !validatePlan || !validateCompra) {
  throw new Error('Schemas oficiales del subsistema no encontrados');
}

function makeMocks({ projectBasePath = '/tmp/proj-test', preexistingStore = null } = {}) {
  const logs = [], metricsCalls = [], published = [];
  const fsStore = new Map();
  if (preexistingStore) {
    fsStore.set(`${projectBasePath}/mise-en-place.json`, JSON.stringify(preexistingStore, null, 2));
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
  const mod = new MiseEnPlaceModule();
  mocks.setMod(mod);
  await mod.onLoad(mocks.core);
  if (opts.projectId) {
    mod.projectBasePaths.set(opts.projectId, opts.projectBasePath || '/tmp/proj-test');
  }
  return { mod, mocks };
}

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

test('Group 1 / onLoad inyecta dependencias y deja caches limpias', async () => {
  const { mod, mocks } = await setupModule();
  assert.strictEqual(mod.logger,   mocks.logger);
  assert.strictEqual(mod.metrics,  mocks.metrics);
  assert.strictEqual(mod.eventBus, mocks.eventBus);
  assert.strictEqual(mod.projectBasePaths.size, 0);
});

test('Group 1 / onLoad loguea mise-en-place.loaded con storage', async () => {
  const { mocks } = await setupModule();
  const loaded = mocks.logs.find(l => l[1] === 'mise-en-place.loaded');
  assert.ok(loaded);
  assert.strictEqual(loaded[2].storage, 'json-per-project');
});

test('Group 1 / onUnload limpia timers y caches', async () => {
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

test('Group 2 / escalado sin project_id devuelve 400', async () => {
  const { mod } = await setupModule();
  const r = await mod.onCalcularEscalado({ receta_id: 'r1', porciones_origen: 4, porciones_destino: 8, ingredientes: [{nombre:'x',cantidad:1,unidad:'kg'}] });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'project_id');
});

test('Group 2 / escalado con porciones_origen=0 devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCalcularEscalado({ project_id: 'p1', receta_id: 'r1', porciones_origen: 0, porciones_destino: 8, ingredientes: [{nombre:'x',cantidad:1,unidad:'kg'}] });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'porciones_origen');
});

test('Group 2 / escalado con ingredientes vacios devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCalcularEscalado({ project_id: 'p1', receta_id: 'r1', porciones_origen: 4, porciones_destino: 8, ingredientes: [] });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'ingredientes');
});

test('Group 2 / plan con franja invalida devuelve 400 con allowed', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onPublicarPlan({
    project_id: 'p1',
    horizonte_desde: '2026-05-17T00:00:00.000Z',
    horizonte_hasta: '2026-05-24T00:00:00.000Z',
    lineas: [{ receta_id: 'r1', porciones: 4, franja: 'almuerzo' }]
  });
  assert.strictEqual(r.status, 400);
  assert.ok(r.error.details.allowed.includes('cena'));
});

test('Group 2 / plan sin lineas devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onPublicarPlan({
    project_id: 'p1',
    horizonte_desde: '2026-05-17T00:00:00.000Z',
    horizonte_hasta: '2026-05-24T00:00:00.000Z',
    lineas: []
  });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'lineas');
});

test('Group 2 / compra con horizonte.tipo invalido devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCalcularCompra({
    project_id: 'p1',
    horizonte: { tipo: 'cuatrimestre' },
    recetas: [{ receta_id: 'r1', porciones: 4, ingredientes: [{nombre:'x',cantidad:1,unidad:'kg'}] }]
  });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'horizonte.tipo');
});

test('Group 2 / compra sin recetas devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCalcularCompra({
    project_id: 'p1', horizonte: { tipo: 'dia' }, recetas: []
  });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'recetas');
});

// ============================================================
// Group 3: Success escalado
// ============================================================

test('Group 3 / escalado exitoso retorna 201 con factor exacto y cantidades nuevas', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCalcularEscalado({
    project_id: 'p1', user_id: 'jefe', receta_id: 'rec_xyz',
    porciones_origen: 4, porciones_destino: 12,
    ingredientes: [
      { nombre: 'tomate', cantidad: 2.0, unidad: 'kg' },
      { nombre: 'aceite', cantidad: 0.1, unidad: 'l' }
    ]
  });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.factor, 3.0);
  assert.strictEqual(r.data.ingredientes_escalados[0].cantidad, 6.0);
  // 0.1 * 3 = 0.30000000000000004 (IEEE 754); tolerancia float
  assert.ok(Math.abs(r.data.ingredientes_escalados[1].cantidad - 0.3) < 1e-9);
});

test('Group 3 / escalado publica produccion.escalado.calculado con shape AJV strict', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  await mod.onCalcularEscalado({
    project_id: 'p1', user_id: 'jefe', correlation_id: 'corr-esc-1',
    receta_id: 'rec_xyz', porciones_origen: 4, porciones_destino: 12,
    ingredientes: [{ nombre: 'tomate', cantidad: 2, unidad: 'kg' }]
  });
  const ev = mocks.published.find(([n]) => n === 'produccion.escalado.calculado');
  assert.ok(ev);
  const [, payload] = ev;
  if (!validateEscalado(payload)) {
    const msg = validateEscalado.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`payload no cumple schema: ${msg}\npayload: ${JSON.stringify(payload, null, 2)}`);
  }
  assert.strictEqual(payload.correlation_id, 'corr-esc-1');
  assert.strictEqual(payload.factor, 3.0);
});

// ============================================================
// Group 4: Success plan
// ============================================================

test('Group 4 / plan publicado retorna 201 con plan_id generado y total_lineas', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onPublicarPlan({
    project_id: 'p1', user_id: 'jefe',
    horizonte_desde: '2026-05-17T00:00:00.000Z',
    horizonte_hasta: '2026-05-24T00:00:00.000Z',
    lineas: [
      { receta_id: 'r1', porciones: 24, franja: 'cena', dia: '2026-05-18' },
      { receta_id: 'r2', porciones: 12, franja: 'comida' }
    ]
  });
  assert.strictEqual(r.status, 201);
  assert.ok(r.data.plan_id.startsWith('plan_'));
  assert.strictEqual(r.data.total_lineas, 2);
});

test('Group 4 / plan con plan_id propio usa ese id (no genera)', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onPublicarPlan({
    project_id: 'p1', plan_id: 'plan-semana-20',
    horizonte_desde: '2026-05-17T00:00:00.000Z',
    horizonte_hasta: '2026-05-24T00:00:00.000Z',
    lineas: [{ receta_id: 'r1', porciones: 4, franja: 'comida' }]
  });
  assert.strictEqual(r.data.plan_id, 'plan-semana-20');
});

test('Group 4 / plan publica produccion.plan.publicado con shape AJV strict', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  await mod.onPublicarPlan({
    project_id: 'p1', user_id: 'jefe', correlation_id: 'corr-plan-1',
    horizonte_desde: '2026-05-17T00:00:00.000Z',
    horizonte_hasta: '2026-05-24T00:00:00.000Z',
    lineas: [{ receta_id: 'r1', porciones: 4, franja: 'all_day' }]
  });
  const ev = mocks.published.find(([n]) => n === 'produccion.plan.publicado');
  assert.ok(ev);
  const [, payload] = ev;
  if (!validatePlan(payload)) {
    const msg = validatePlan.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`payload no cumple schema: ${msg}\npayload: ${JSON.stringify(payload, null, 2)}`);
  }
  assert.strictEqual(payload.correlation_id, 'corr-plan-1');
  assert.strictEqual(payload.lineas[0].franja, 'all_day');
});

// ============================================================
// Group 5: Success compra
// ============================================================

test('Group 5 / compra agrega ingredientes con misma (nombre, unidad)', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCalcularCompra({
    project_id: 'p1', horizonte: { tipo: 'dia' },
    recetas: [
      { receta_id: 'r1', porciones: 4, ingredientes: [{ nombre: 'tomate', cantidad: 1, unidad: 'kg' }] },
      { receta_id: 'r2', porciones: 4, ingredientes: [{ nombre: 'Tomate', cantidad: 2, unidad: 'kg' }] }
    ]
  });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.items.length, 1);
  assert.strictEqual(r.data.items[0].cantidad_neta, 3);
  assert.strictEqual(r.data.items[0].unidad, 'kg');
  assert.strictEqual(r.data.items[0].ingrediente, 'tomate');  // primer aparece se preserva
});

test('Group 5 / compra NO agrega ingredientes con misma nombre pero distinta unidad', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCalcularCompra({
    project_id: 'p1', horizonte: { tipo: 'dia' },
    recetas: [
      { receta_id: 'r1', porciones: 4, ingredientes: [
        { nombre: 'aceite', cantidad: 0.1, unidad: 'l' },
        { nombre: 'aceite', cantidad: 100, unidad: 'ml' }
      ] }
    ]
  });
  assert.strictEqual(r.data.items.length, 2);
});

test('Group 5 / compra aplica merma_pct multiplicando la cantidad', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCalcularCompra({
    project_id: 'p1', horizonte: { tipo: 'evento' },
    recetas: [
      { receta_id: 'r1', porciones: 4, ingredientes: [{ nombre: 'tomate', cantidad: 10, unidad: 'kg', merma_pct: 20 }] }
    ]
  });
  // 10 * 1.20 = 12
  assert.strictEqual(r.data.items[0].cantidad_neta, 12);
  assert.strictEqual(r.data.items[0].merma_pct, 20);
});

test('Group 5 / compra publica produccion.compra.calculada con shape AJV strict', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  await mod.onCalcularCompra({
    project_id: 'p1', user_id: 'jefe', correlation_id: 'corr-com-1',
    horizonte: { tipo: 'semana', desde: '2026-05-17T00:00:00.000Z', hasta: '2026-05-24T00:00:00.000Z', etiqueta: 'semana 20' },
    recetas: [
      { receta_id: 'r1', porciones: 24, ingredientes: [{ nombre: 'tomate', cantidad: 12, unidad: 'kg' }] }
    ]
  });
  const ev = mocks.published.find(([n]) => n === 'produccion.compra.calculada');
  assert.ok(ev);
  const [, payload] = ev;
  if (!validateCompra(payload)) {
    const msg = validateCompra.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`payload no cumple schema: ${msg}\npayload: ${JSON.stringify(payload, null, 2)}`);
  }
  assert.strictEqual(payload.correlation_id, 'corr-com-1');
  assert.strictEqual(payload.horizonte.tipo, 'semana');
  assert.strictEqual(payload.recetas_consideradas.length, 1);
});

// ============================================================
// Group 6: Bus handlers + obtener/listar
// ============================================================

test('Group 6 / onProjectActivated puebla cache', async () => {
  const { mod } = await setupModule();
  mod.onProjectActivated({ data: { project_id: 'pX', base_path: '/var/pX' } });
  assert.strictEqual(mod.projectBasePaths.get('pX'), '/var/pX');
});

test('Group 6 / obtener plan existente devuelve plan completo', async () => {
  const { mod } = await setupModule({
    projectId: 'p1',
    preexistingStore: {
      _version: '1.0.0', _updated: null,
      planes: [{ id: 'plan_1', horizonte_desde: 'd', horizonte_hasta: 'h', lineas: [{receta_id:'r1',porciones:4,franja:'cena'}], created_at: 'x' }],
      escalados: [], compras: []
    }
  });
  const r = await mod.onObtenerPlan({ project_id: 'p1', plan_id: 'plan_1' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.id, 'plan_1');
  assert.strictEqual(r.data.lineas.length, 1);
});

test('Group 6 / obtener plan inexistente devuelve 404 con entity_type=production-plan', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onObtenerPlan({ project_id: 'p1', plan_id: 'no-existe' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.details.entity_type, 'production-plan');
});

test('Group 6 / listar planes devuelve resumen con total_lineas', async () => {
  const { mod } = await setupModule({
    projectId: 'p1',
    preexistingStore: {
      _version: '1.0.0', _updated: null,
      planes: [
        { id: 'p1', horizonte_desde: 'd', horizonte_hasta: 'h', lineas: [{receta_id:'r1',porciones:1,franja:'cena'}, {receta_id:'r2',porciones:2,franja:'comida'}], created_at: 'x' },
        { id: 'p2', horizonte_desde: 'd', horizonte_hasta: 'h', lineas: [{receta_id:'r3',porciones:3,franja:'desayuno'}], created_at: 'x' }
      ],
      escalados: [], compras: []
    }
  });
  const r = await mod.onListarPlanes({ project_id: 'p1' });
  assert.strictEqual(r.data.total, 2);
  assert.strictEqual(r.data.planes[0].total_lineas, 2);
  assert.strictEqual(r.data.planes[1].total_lineas, 1);
});

// ============================================================
// Group 7: Helpers POC2 + algoritmos
// ============================================================

test('Group 7 / _calcularEscalado factor exacto y escala cada cantidad', async () => {
  const { mod } = await setupModule();
  const r = mod._calcularEscalado(
    { porciones_origen: 4, ingredientes: [{ nombre: 'x', cantidad: 8, unidad: 'kg' }] },
    10
  );
  assert.strictEqual(r.factor, 2.5);
  assert.strictEqual(r.ingredientes_escalados[0].cantidad, 20);
});

test('Group 7 / _agregarCompra sin merma suma cantidades', async () => {
  const { mod } = await setupModule();
  const items = mod._agregarCompra([
    { receta_id: 'r1', porciones: 4, ingredientes: [{nombre:'tomate',cantidad:1,unidad:'kg'}] },
    { receta_id: 'r2', porciones: 4, ingredientes: [{nombre:'tomate',cantidad:2,unidad:'kg'}] }
  ]);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].cantidad_neta, 3);
});

test('Group 7 / _agregarCompra con merma_pct=10 multiplica por 1.10', async () => {
  const { mod } = await setupModule();
  const items = mod._agregarCompra([
    { receta_id: 'r1', porciones: 4, ingredientes: [{nombre:'tomate',cantidad:10,unidad:'kg',merma_pct:10}] }
  ]);
  assert.strictEqual(items[0].cantidad_neta, 11);
  assert.strictEqual(items[0].merma_pct, 10);
});

test('Group 7 / _publicarEvento propaga correlation_id + project_id + user_id + timestamp', async () => {
  const { mod, mocks } = await setupModule();
  await mod._publicarEvento('test.ev', { project_id: 'p1', user_id: 'u1' }, { correlation_id: 'cc' });
  const ev = mocks.published.find(([n]) => n === 'test.ev');
  assert.strictEqual(ev[1].correlation_id, 'cc');
  assert.strictEqual(ev[1].project_id, 'p1');
  assert.strictEqual(ev[1].user_id, 'u1');
  assert.ok(ev[1].timestamp.match(/^\d{4}-\d{2}-\d{2}T/));
});

runTests();

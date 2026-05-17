/**
 * Tests del modulo `recetas` v4.0.0 — aggregate root del subsistema-recetario.
 *
 * 7 grupos POC2:
 *   1. Lifecycle
 *   2. Validacion canonica
 *   3. Success crear (publish receta.creada AJV strict)
 *   4. Success actualizar / revertir (publish receta.actualizada AJV strict)
 *   5. Success cambiar_estado / eliminar (publish receta.estado.actualizada + receta.eliminada AJV strict)
 *   6. Ingredientes / catalogo / precios (publish ingrediente.precio.actualizado AJV strict) + analizar + migracion legacy
 *   7. Helpers POC2 (_publicarEvento, _normalizeIngredientes, _calcIncompleta, validacion de transiciones)
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const Ajv    = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const RecetasModule = require('../../modules/recetas/index.js');

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
const validateCreada       = ajv.getSchema('receta.creada.schema.json');
const validateActualizada  = ajv.getSchema('receta.actualizada.schema.json');
const validateEliminada    = ajv.getSchema('receta.eliminada.schema.json');
const validateEstadoActual = ajv.getSchema('receta.estado.actualizada.schema.json');
const validatePrecioActual = ajv.getSchema('ingrediente.precio.actualizado.schema.json');
if (!validateCreada || !validateActualizada || !validateEliminada || !validateEstadoActual || !validatePrecioActual) {
  throw new Error('Schemas oficiales receta.* / ingrediente.precio.actualizado no encontrados');
}

function makeMocks({ projectBasePath = '/tmp/proj-test', preexistingStore = null } = {}) {
  const logs = [], metricsCalls = [], published = [];
  const fsStore = new Map();
  if (preexistingStore) {
    fsStore.set(`${projectBasePath}/recetas.json`, JSON.stringify(preexistingStore, null, 2));
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
  const mod = new RecetasModule();
  mocks.setMod(mod);
  await mod.onLoad(mocks.core);
  if (opts.projectId) {
    mod.projectBasePaths.set(opts.projectId, opts.projectBasePath || '/tmp/proj-test');
  }
  return { mod, mocks };
}

const baseCrear = {
  project_id:   'p1',
  user_id:      'chef',
  nombre:       'Tomate confitado',
  descripcion:  'Confitar lentamente',
  ingredientes: [
    { nombre: 'tomate', cantidad: 1.0, unidad: 'kg' },
    { nombre: 'aceite', cantidad: 0.1, unidad: 'l' }
  ],
  instrucciones: ['Cortar', 'Confitar 4h a 80C'],
  porciones:    4,
  tiempo_min:   240,
  dificultad:   3
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
  assert.strictEqual(mod.name, 'recetas');
  assert.strictEqual(mod.version, '4.0.0');
  assert.strictEqual(typeof mod._errorResponse, 'function');
  assert.strictEqual(typeof mod._handleHandlerError, 'function');
});

test('Group 1 / onLoad loguea recetas.loaded con storage json-per-project', async () => {
  const { mocks } = await setupModule();
  const loaded = mocks.logs.find(l => l[1] === 'recetas.loaded');
  assert.ok(loaded);
  assert.strictEqual(loaded[2].version, '4.0.0');
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

test('Group 2 / crear sin project_id devuelve 400', async () => {
  const { mod } = await setupModule();
  const r = await mod.onCrear({ ...baseCrear, project_id: undefined });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'project_id');
});

test('Group 2 / crear sin nombre devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCrear({ ...baseCrear, nombre: '' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'nombre');
});

test('Group 2 / crear con fuente invalida devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCrear({ ...baseCrear, fuente: 'inventado' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'fuente');
});

test('Group 2 / listar con estado invalido devuelve 400 con allowed', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onListar({ project_id: 'p1', estado: 'invalido' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'estado');
  assert.ok(r.error.details.allowed.includes('en_servicio'));
});

test('Group 2 / cambiar_estado con target invalido devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCambiarEstado({ project_id: 'p1', receta_id: 'r', target_estado: 'pausada' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'target_estado');
});

test('Group 2 / actualizar_precio con precio_mercado negativo devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onActualizarPrecio({ project_id: 'p1', nombre: 'tomate', precio_mercado: -1 });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'precio_mercado');
});

test('Group 2 / obtener sin receta_id ni nombre devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onObtener({ project_id: 'p1' });
  assert.strictEqual(r.status, 400);
});

// ============================================================
// Group 3: Success crear
// ============================================================

test('Group 3 / crear receta completa retorna 201 con estado_operativo=en_servicio', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCrear(baseCrear);
  assert.strictEqual(r.status, 201);
  assert.ok(r.data.receta_id);
  assert.strictEqual(r.data.nombre, 'Tomate confitado');
  assert.strictEqual(r.data.version, 1);
  assert.strictEqual(r.data.estado_operativo, 'en_servicio');
  assert.strictEqual(r.data.incompleta, false);
});

test('Group 3 / crear receta incompleta arranca en estado_operativo=borrador', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  // Sin ingredientes ni instrucciones ni porciones (campos_para_completa)
  const r = await mod.onCrear({ project_id: 'p1', nombre: 'Idea suelta' });
  assert.strictEqual(r.data.estado_operativo, 'borrador');
  assert.strictEqual(r.data.incompleta, true);
  assert.ok(r.data.campos_pendientes.length > 0);
});

test('Group 3 / crear publica receta.creada con shape canonico AJV strict', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  await mod.onCrear({ ...baseCrear, correlation_id: 'corr-c-1' });
  const ev = mocks.published.find(([n]) => n === 'receta.creada');
  assert.ok(ev);
  const [, payload] = ev;
  if (!validateCreada(payload)) {
    const msg = validateCreada.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`payload no cumple schema: ${msg}\npayload: ${JSON.stringify(payload, null, 2)}`);
  }
  assert.strictEqual(payload.correlation_id, 'corr-c-1');
  assert.strictEqual(payload.user_id, 'chef');
  assert.strictEqual(payload.estado_operativo, 'en_servicio');
  assert.strictEqual(payload.version, 1);
});

test('Group 3 / crear receta duplicada devuelve 409 ALREADY_EXISTS', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  await mod.onCrear(baseCrear);
  const r = await mod.onCrear(baseCrear);
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'ALREADY_EXISTS');
});

// ============================================================
// Group 4: Success actualizar / revertir
// ============================================================

test('Group 4 / actualizar retorna 200 con cambios_aplicados + version++', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const c = await mod.onCrear(baseCrear);
  const r = await mod.onActualizar({
    project_id: 'p1', user_id: 'chef',
    receta_id: c.data.receta_id,
    cambios: { porciones: 8, descripcion: 'Confitado largo' }
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.version, 2);
  assert.deepStrictEqual(r.data.campos_actualizados.sort(), ['descripcion', 'porciones']);
});

test('Group 4 / actualizar publica receta.actualizada con AJV strict + campos_actualizados', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  const c = await mod.onCrear(baseCrear);
  await mod.onActualizar({
    project_id: 'p1', user_id: 'chef', correlation_id: 'corr-act-1',
    receta_id: c.data.receta_id,
    cambios: { porciones: 8 }
  });
  const ev = mocks.published.find(([n]) => n === 'receta.actualizada');
  assert.ok(ev);
  const [, payload] = ev;
  if (!validateActualizada(payload)) {
    const msg = validateActualizada.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`payload no cumple schema: ${msg}\npayload: ${JSON.stringify(payload, null, 2)}`);
  }
  assert.strictEqual(payload.correlation_id, 'corr-act-1');
  assert.strictEqual(payload.version, 2);
  assert.deepStrictEqual(payload.campos_actualizados, ['porciones']);
});

test('Group 4 / actualizar sin campos validos devuelve 400 (no afecta history)', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const c = await mod.onCrear(baseCrear);
  const r = await mod.onActualizar({ project_id: 'p1', receta_id: c.data.receta_id, cambios: { campo_inventado: 'x' } });
  assert.strictEqual(r.status, 400);
  // History no debe crecer en error path
  const ev = await mod.onHistorial({ project_id: 'p1', receta_id: c.data.receta_id });
  assert.strictEqual(ev.data.versiones_anteriores, 0);
});

test('Group 4 / revertir publica receta.actualizada con motivo=revertir', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  const c = await mod.onCrear(baseCrear);
  await mod.onActualizar({ project_id: 'p1', receta_id: c.data.receta_id, cambios: { porciones: 12 } });
  const rev = await mod.onRevertir({ project_id: 'p1', receta_id: c.data.receta_id, target_version: 1 });
  assert.strictEqual(rev.status, 200);
  assert.strictEqual(rev.data.revertida_a_version, 1);

  const evs = mocks.published.filter(([n]) => n === 'receta.actualizada');
  const evRev = evs.find(([, p]) => p.motivo === 'revertir');
  assert.ok(evRev);
  if (!validateActualizada(evRev[1])) throw new Error('revert payload no cumple AJV');
});

// ============================================================
// Group 5: cambiar_estado / eliminar
// ============================================================

test('Group 5 / eliminar publica AMBOS receta.estado.actualizada + receta.eliminada', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  const c = await mod.onCrear(baseCrear);
  const r = await mod.onEliminar({
    project_id: 'p1', user_id: 'chef', correlation_id: 'corr-el-1',
    receta_id: c.data.receta_id, motivo: 'duplicada'
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.estado_operativo, 'archivada');

  const evEstado = mocks.published.find(([n]) => n === 'receta.estado.actualizada');
  const evElim   = mocks.published.find(([n]) => n === 'receta.eliminada');
  assert.ok(evEstado, 'esperaba receta.estado.actualizada');
  assert.ok(evElim,   'esperaba receta.eliminada');

  if (!validateEstadoActual(evEstado[1])) {
    const msg = validateEstadoActual.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`estado.actualizada no cumple: ${msg}\n${JSON.stringify(evEstado[1], null, 2)}`);
  }
  if (!validateEliminada(evElim[1])) {
    const msg = validateEliminada.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`eliminada no cumple: ${msg}\n${JSON.stringify(evElim[1], null, 2)}`);
  }

  assert.strictEqual(evEstado[1].estado_anterior, 'en_servicio');
  assert.strictEqual(evEstado[1].estado_nuevo, 'archivada');
  assert.strictEqual(evEstado[1].motivo, 'duplicada');
  assert.strictEqual(evElim[1].motivo, 'duplicada');
});

test('Group 5 / cambiar_estado en_servicio -> borrador publica solo receta.estado.actualizada', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  const c = await mod.onCrear(baseCrear);
  const r = await mod.onCambiarEstado({
    project_id: 'p1', user_id: 'chef',
    receta_id: c.data.receta_id, target_estado: 'borrador'
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.estado_operativo, 'borrador');

  const evs = mocks.published.filter(([n]) => n === 'receta.estado.actualizada');
  assert.strictEqual(evs.length, 1);
  if (!validateEstadoActual(evs[0][1])) throw new Error('estado.actualizada no cumple AJV');

  const evElim = mocks.published.find(([n]) => n === 'receta.eliminada');
  assert.ok(!evElim, 'NO debe publicar receta.eliminada en transicion no-archivada');
});

test('Group 5 / cambiar_estado archivada -> en_servicio devuelve 422 PRECONDITION_FAILED', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const c = await mod.onCrear(baseCrear);
  await mod.onEliminar({ project_id: 'p1', receta_id: c.data.receta_id });
  const r = await mod.onCambiarEstado({
    project_id: 'p1', receta_id: c.data.receta_id, target_estado: 'en_servicio'
  });
  assert.strictEqual(r.status, 422);
  assert.strictEqual(r.error.code, 'PRECONDITION_FAILED');
  assert.strictEqual(r.error.details.kind, 'invalid_state_transition');
  assert.strictEqual(r.error.details.estado_anterior, 'archivada');
});

test('Group 5 / cambiar_estado al mismo estado devuelve 200 sin cambios', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const c = await mod.onCrear(baseCrear);
  const r = await mod.onCambiarEstado({
    project_id: 'p1', receta_id: c.data.receta_id, target_estado: 'en_servicio'
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.status, 'sin_cambios');
});

test('Group 5 / eliminar receta inexistente devuelve 404 con entity_type=recipe', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onEliminar({ project_id: 'p1', receta_id: 'no-existe' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.details.entity_type, 'recipe');
});

// ============================================================
// Group 6: Ingredientes / catalogo / precios / analizar / migracion legacy
// ============================================================

test('Group 6 / actualizar_precio publica ingrediente.precio.actualizado AJV strict', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  const r = await mod.onActualizarPrecio({
    project_id: 'p1', user_id: 'chef', correlation_id: 'corr-pr-1',
    nombre: 'tomate', precio_mercado: 2.5, unidad: 'kg', categoria: 'verdura', fuente: 'manual'
  });
  assert.strictEqual(r.status, 200);

  const ev = mocks.published.find(([n]) => n === 'ingrediente.precio.actualizado');
  assert.ok(ev);
  if (!validatePrecioActual(ev[1])) {
    const msg = validatePrecioActual.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`precio no cumple: ${msg}\n${JSON.stringify(ev[1], null, 2)}`);
  }
  assert.strictEqual(ev[1].correlation_id, 'corr-pr-1');
  assert.strictEqual(ev[1].nombre, 'tomate');
  assert.strictEqual(ev[1].precio_mercado, 2.5);
  assert.strictEqual(ev[1].unidad, 'kg');
});

test('Group 6 / actualizar_precio existente actualiza no duplica', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  await mod.onActualizarPrecio({ project_id: 'p1', nombre: 'tomate', precio_mercado: 2.0, unidad: 'kg' });
  await mod.onActualizarPrecio({ project_id: 'p1', nombre: 'tomate', precio_mercado: 2.5, unidad: 'kg' });
  const list = await mod.onIngredientes({ project_id: 'p1' });
  assert.strictEqual(list.data.total, 1);
  assert.strictEqual(list.data.ingredientes[0].precio_mercado, 2.5);
});

test('Group 6 / analizar con todos los precios devuelve coste_es_real=true', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  await mod.onActualizarPrecio({ project_id: 'p1', nombre: 'tomate', precio_mercado: 2.5, unidad: 'kg' });
  await mod.onActualizarPrecio({ project_id: 'p1', nombre: 'aceite', precio_mercado: 8.0, unidad: 'l' });
  const c = await mod.onCrear(baseCrear);
  const r = await mod.onAnalizar({ project_id: 'p1', receta_id: c.data.receta_id });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.coste_es_real, true);
  // 1*2.5 + 0.1*8 = 3.3 ; / 4 porciones = 0.825
  assert.ok(Math.abs(r.data.coste_total - 3.3) < 1e-9);
  assert.ok(Math.abs(r.data.coste_por_porcion - 0.825) < 1e-9);
});

test('Group 6 / analizar receta incompleta devuelve 422 PRECONDITION_FAILED', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const c = await mod.onCrear({ project_id: 'p1', nombre: 'Sin datos' });
  const r = await mod.onAnalizar({ project_id: 'p1', receta_id: c.data.receta_id });
  assert.strictEqual(r.status, 422);
  assert.strictEqual(r.error.code, 'PRECONDITION_FAILED');
  assert.strictEqual(r.error.details.kind, 'incomplete_recipe');
});

test('Group 6 / migracion lectura: estado activa->en_servicio + timestamps ms->ISO', async () => {
  const legacyStore = {
    _version: '3.0.0',
    _updated_at: 1714000000000,  // epoch ms legacy
    recetas: [{
      id: 'r1',
      nombre: 'Receta legacy',
      descripcion: '',
      ingredientes: [{ nombre: 'sal', cantidad: 0.01, unidad: 'kg' }],
      instrucciones: ['Cocer'],
      porciones: 2,
      tiempo_min: 30,
      dificultad: 1,
      categorias: [],
      etiquetas: [],
      fuente: 'manual',
      notas: '',
      version: 1,
      history: [],
      incompleta: false,
      campos_pendientes: [],
      estado: 'activa',                  // legacy
      created_at: 1714000000000,         // legacy epoch ms
      updated_at: 1714000000000
    }],
    ingredientes_catalogo: [{
      nombre: 'sal', categoria: null, unidad: 'kg', precio_mercado: 0.5,
      fuente: 'manual', created_at: 1714000000000, updated_at: 1714000000000
    }]
  };
  const { mod } = await setupModule({ projectId: 'p1', preexistingStore: legacyStore });

  const r = await mod.onObtener({ project_id: 'p1', receta_id: 'r1' });
  assert.strictEqual(r.data.estado_operativo, 'en_servicio');
  assert.ok(typeof r.data.created_at === 'string' && r.data.created_at.match(/^\d{4}-\d{2}-\d{2}T/));
  assert.ok(!('estado' in r.data), 'estado legacy debe haberse eliminado');

  const list = await mod.onIngredientes({ project_id: 'p1' });
  assert.ok(typeof list.data.ingredientes[0].created_at === 'string');
});

test('Group 6 / listar default solo en_servicio (no archivadas)', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const c1 = await mod.onCrear({ ...baseCrear, nombre: 'Receta A' });
  await mod.onCrear({ ...baseCrear, nombre: 'Receta B' });
  await mod.onEliminar({ project_id: 'p1', receta_id: c1.data.receta_id });
  const r = await mod.onListar({ project_id: 'p1' });
  assert.strictEqual(r.data.total, 1);
  assert.strictEqual(r.data.recetas[0].nombre, 'Receta B');
});

test('Group 6 / buscar texto matchea nombre, descripcion e ingredientes', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  await mod.onCrear({ ...baseCrear, nombre: 'Tomate confitado' });
  await mod.onCrear({ ...baseCrear, nombre: 'Pasta carbonara',
                       ingredientes: [{ nombre: 'huevo', cantidad: 2, unidad: 'ud' }] });
  const r = await mod.onBuscar({ project_id: 'p1', texto: 'huevo' });
  assert.strictEqual(r.data.total, 1);
  assert.strictEqual(r.data.resultados[0].nombre, 'Pasta carbonara');
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

test('Group 7 / _normalizeIngredientes acepta array de objetos', async () => {
  const { mod } = await setupModule();
  const r = mod._normalizeIngredientes([
    { nombre: 'tomate', cantidad: 1, unidad: 'kg' },
    { nombre: '', cantidad: 0, unidad: '' }  // descartado por nombre vacio
  ]);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].nombre, 'tomate');
});

test('Group 7 / _normalizeIngredientes parsea string libre con saltos/coma/punto-coma', async () => {
  const { mod } = await setupModule();
  const r = mod._normalizeIngredientes('tomate\naceite, sal; pimienta');
  assert.deepStrictEqual(r.map(i => i.nombre), ['tomate', 'aceite', 'sal', 'pimienta']);
});

test('Group 7 / _calcIncompleta marca pendientes si faltan ingredientes/porciones/instrucciones', async () => {
  const { mod } = await setupModule();
  const r = { ingredientes: [], porciones: null, instrucciones: [] };
  mod._calcIncompleta(r);
  assert.strictEqual(r.incompleta, true);
  assert.deepStrictEqual(r.campos_pendientes.sort(), ['ingredientes', 'instrucciones', 'porciones']);
});

test('Group 7 / _calcIncompleta sin campos_pendientes marca incompleta=false', async () => {
  const { mod } = await setupModule();
  const r = { ingredientes: [{ nombre: 'x', cantidad: 1, unidad: 'kg' }], porciones: 4, instrucciones: ['paso'] };
  mod._calcIncompleta(r);
  assert.strictEqual(r.incompleta, false);
  assert.deepStrictEqual(r.campos_pendientes, []);
});

test('Group 7 / _findRecetaByRefBuilder busca por id, nombre exacto, nombre parcial', async () => {
  const { mod } = await setupModule();
  const store = { recetas: [
    { id: 'abc-123', nombre: 'Tomate confitado' },
    { id: 'def-456', nombre: 'Pasta carbonara' }
  ] };
  const find = mod._findRecetaByRefBuilder(store);
  assert.strictEqual(find('abc-123').id, 'abc-123');
  assert.strictEqual(find('Tomate confitado').id, 'abc-123');
  assert.strictEqual(find('carbonara').id, 'def-456');
  assert.strictEqual(find('no-existe'), null);
});

test('Group 7 / _handleHandlerError respeta err._code y mapea status', async () => {
  const { mod } = await setupModule();
  const r1 = mod._handleHandlerError('test', Object.assign(new Error('x'), { _code: 'RESOURCE_NOT_FOUND' }), 'tool');
  assert.strictEqual(r1.status, 404);
  const r2 = mod._handleHandlerError('test', Object.assign(new Error('x'), { _code: 'UPSTREAM_TIMEOUT' }), 'tool');
  assert.strictEqual(r2.status, 504);
});

runTests();

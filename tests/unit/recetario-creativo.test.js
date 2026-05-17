/**
 * Tests del modulo `recetario-creativo` v1.0.0.
 *
 * 7 grupos POC2:
 *   1. Lifecycle
 *   2. Validacion canonica
 *   3. Success crear prototipo (publish + AJV strict)
 *   4. Success iterar (publish + AJV strict)
 *   5. Success evaluar alineacion + manifiesto (publish + AJV strict + algoritmo)
 *   6. Bus handlers (project + fs)
 *   7. Helpers POC2 (_publicarEvento, _calcularAlineacion)
 *
 * Aislamiento: eventBus mock con interceptor de fs.*.request. Sin filesystem real.
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const Ajv    = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const RecetarioCreativoModule = require('../../modules/recetario-creativo/index.js');

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
const validatePrototipoCreado     = ajv.getSchema('creativo.prototipo.creado.schema.json');
const validateIteracionRegistrada = ajv.getSchema('creativo.iteracion.registrada.schema.json');
const validateAlineacionValidada  = ajv.getSchema('creativo.alineacion.validada.schema.json');
if (!validatePrototipoCreado || !validateIteracionRegistrada || !validateAlineacionValidada) {
  throw new Error('Schemas oficiales del subsistema no encontrados');
}

function makeMocks({ projectBasePath = '/tmp/proj-test', preexistingStore = null } = {}) {
  const logs         = [];
  const metricsCalls = [];
  const published    = [];

  const fsStore = new Map();
  if (preexistingStore) {
    fsStore.set(`${projectBasePath}/recetario-creativo.json`, JSON.stringify(preexistingStore, null, 2));
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
  const mod = new RecetarioCreativoModule();
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
  assert.strictEqual(mod.pendingProject.size, 0);
  assert.strictEqual(mod.pendingFs.size, 0);
  assert.strictEqual(mod.writeQueues.size, 0);
});

test('Group 1 / onLoad loguea evento canonico .loaded con version y storage', async () => {
  const { mocks } = await setupModule();
  const loaded = mocks.logs.find(l => l[1] === 'recetario-creativo.loaded');
  assert.ok(loaded);
  assert.strictEqual(loaded[2].version, '1.0.0');
  assert.strictEqual(loaded[2].storage, 'json-per-project');
});

test('Group 1 / onUnload limpia timers, caches y queues', async () => {
  const { mod } = await setupModule();
  mod.projectBasePaths.set('p1', '/tmp/p1');
  mod.pendingFs.set('rf', { resolve: () => {}, reject: () => {}, timer: setTimeout(() => {}, 1e6) });
  mod.pendingProject.set('rp', { resolve: () => {}, reject: () => {}, timer: setTimeout(() => {}, 1e6) });
  mod.writeQueues.set('p1', Promise.resolve());
  await mod.onUnload();
  assert.strictEqual(mod.projectBasePaths.size, 0);
  assert.strictEqual(mod.pendingFs.size, 0);
  assert.strictEqual(mod.pendingProject.size, 0);
  assert.strictEqual(mod.writeQueues.size, 0);
});

// ============================================================
// Group 2: Validacion canonica
// ============================================================

test('Group 2 / crear prototipo sin project_id devuelve 400', async () => {
  const { mod } = await setupModule();
  const r = await mod.onCrearPrototipo({ nombre: 'X' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'project_id');
});

test('Group 2 / crear prototipo sin nombre devuelve 400 con field:nombre', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCrearPrototipo({ project_id: 'p1' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'nombre');
});

test('Group 2 / iterar sin anotacion devuelve 400', async () => {
  const { mod } = await setupModule({
    projectId: 'p1',
    preexistingStore: {
      _version: '1.0.0', _updated: null,
      manifiesto: { valores: [], prohibido: [], tradicion_referencia: '', notas_libres: '' },
      prototipos: [{ id: 'proto_1', nombre: 'X', tags_creativos: [], descripcion: '', receta_id_origen: null, estado: 'en_desarrollo', iteraciones: [], version: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: null }]
    }
  });
  const r = await mod.onIterar({ project_id: 'p1', prototipo_id: 'proto_1' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'anotacion');
});

test('Group 2 / iterar con resultado invalido devuelve 400 con allowed', async () => {
  const { mod } = await setupModule({
    projectId: 'p1',
    preexistingStore: {
      _version: '1.0.0', _updated: null,
      manifiesto: { valores: [], prohibido: [], tradicion_referencia: '', notas_libres: '' },
      prototipos: [{ id: 'proto_1', nombre: 'X', tags_creativos: [], descripcion: '', receta_id_origen: null, estado: 'en_desarrollo', iteraciones: [], version: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: null }]
    }
  });
  const r = await mod.onIterar({ project_id: 'p1', prototipo_id: 'proto_1', anotacion: 'X', resultado: 'invento' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'resultado');
  assert.ok(r.error.details.allowed.includes('aceptada'));
});

test('Group 2 / evaluar con objeto_tipo invalido devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onEvaluarAlineacion({ project_id: 'p1', objeto_tipo: 'menu' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'objeto_tipo');
});

test('Group 2 / evaluar objeto_tipo=receta sin nombre devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onEvaluarAlineacion({ project_id: 'p1', objeto_tipo: 'receta', receta_id: 'r1' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'nombre');
});

test('Group 2 / actualizar manifiesto sin manifiesto devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onActualizarManifiesto({ project_id: 'p1' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'manifiesto');
});

// ============================================================
// Group 3: Success crear prototipo
// ============================================================

test('Group 3 / crear prototipo exitoso retorna 201 con prototipo_id, nombre, version', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCrearPrototipo({
    project_id: 'p1', user_id: 'chef',
    nombre: 'Esferas de tomate huerta',
    tags_creativos: ['estacionalidad', 'esferificacion']
  });
  assert.strictEqual(r.status, 201);
  assert.ok(r.data.prototipo_id.startsWith('proto_'));
  assert.strictEqual(r.data.nombre, 'Esferas de tomate huerta');
  assert.strictEqual(r.data.version, 1);
});

test('Group 3 / crear prototipo publica creativo.prototipo.creado con shape canonico AJV strict', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  await mod.onCrearPrototipo({
    project_id:     'p1', user_id: 'chef',
    nombre:         'Confitar a baja temp',
    tags_creativos: ['kilometro-cero'],
    correlation_id: 'corr-abc'
  });
  const ev = mocks.published.find(([n]) => n === 'creativo.prototipo.creado');
  assert.ok(ev);
  const [, payload] = ev;
  if (!validatePrototipoCreado(payload)) {
    const msg = validatePrototipoCreado.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`payload no cumple schema: ${msg}\npayload: ${JSON.stringify(payload, null, 2)}`);
  }
  assert.strictEqual(payload.project_id, 'p1');
  assert.strictEqual(payload.user_id, 'chef');
  assert.strictEqual(payload.correlation_id, 'corr-abc');
  assert.ok(payload.prototipo_id.startsWith('proto_'));
  assert.deepStrictEqual(payload.tags_creativos, ['kilometro-cero']);
});

test('Group 3 / crear prototipo con receta_id_origen propaga al payload', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  await mod.onCrearPrototipo({
    project_id: 'p1', nombre: 'Variacion sobre receta clasica',
    receta_id_origen: 'rec_abc'
  });
  const ev = mocks.published.find(([n]) => n === 'creativo.prototipo.creado');
  assert.strictEqual(ev[1].receta_id_origen, 'rec_abc');
});

test('Group 3 / crear prototipo persiste al fs y gauge actualiza count', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1', projectBasePath: '/tmp/p1-base' });
  await mod.onCrearPrototipo({ project_id: 'p1', nombre: 'X' });
  const writeEv = mocks.published.find(([n]) => n === 'fs.write.request');
  assert.ok(writeEv);
  assert.strictEqual(writeEv[1].path, '/tmp/p1-base/recetario-creativo.json');
  const stored = JSON.parse(writeEv[1].content);
  assert.strictEqual(stored.prototipos.length, 1);
  assert.ok(stored.manifiesto, 'store inicial debe incluir manifiesto');

  const gauge = mocks.metricsCalls.find(c => c[0] === 'gauge' && c[1] === 'recetario-creativo.prototipos.count');
  assert.ok(gauge);
  assert.strictEqual(gauge[2], 1);
});

// ============================================================
// Group 4: Success iterar
// ============================================================

test('Group 4 / iterar exitoso retorna 200 con iter-1 y total_iteraciones=1', async () => {
  const { mod } = await setupModule({
    projectId: 'p1',
    preexistingStore: {
      _version: '1.0.0', _updated: null,
      manifiesto: { valores: [], prohibido: [], tradicion_referencia: '', notas_libres: '' },
      prototipos: [{ id: 'proto_1', nombre: 'X', tags_creativos: [], descripcion: '', receta_id_origen: null, estado: 'en_desarrollo', iteraciones: [], version: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: null }]
    }
  });
  const r = await mod.onIterar({
    project_id: 'p1', prototipo_id: 'proto_1',
    anotacion: 'Probamos con tomate raf, mejor perfil', resultado: 'aceptada'
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.iteracion_id, 'iter-1');
  assert.strictEqual(r.data.total_iteraciones, 1);
  assert.strictEqual(r.data.version, 2);
});

test('Group 4 / iterar publica creativo.iteracion.registrada con shape AJV strict', async () => {
  const { mod, mocks } = await setupModule({
    projectId: 'p1',
    preexistingStore: {
      _version: '1.0.0', _updated: null,
      manifiesto: { valores: [], prohibido: [], tradicion_referencia: '', notas_libres: '' },
      prototipos: [{ id: 'proto_1', nombre: 'X', tags_creativos: [], descripcion: '', receta_id_origen: null, estado: 'en_desarrollo', iteraciones: [], version: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: null }]
    }
  });
  await mod.onIterar({
    project_id: 'p1', prototipo_id: 'proto_1', user_id: 'chef',
    correlation_id: 'corr-it', anotacion: 'Mejor con sal de roca'
  });
  const ev = mocks.published.find(([n]) => n === 'creativo.iteracion.registrada');
  assert.ok(ev);
  const [, payload] = ev;
  if (!validateIteracionRegistrada(payload)) {
    const msg = validateIteracionRegistrada.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`payload no cumple schema: ${msg}\npayload: ${JSON.stringify(payload, null, 2)}`);
  }
  assert.strictEqual(payload.correlation_id, 'corr-it');
  assert.strictEqual(payload.iteracion_id, 'iter-1');
  assert.strictEqual(payload.resultado, 'indeterminada');  // default cuando no se especifica
});

test('Group 4 / iterar sobre prototipo inexistente devuelve 404 con entity_type', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onIterar({ project_id: 'p1', prototipo_id: 'no-existe', anotacion: 'X' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.details.entity_type, 'recipe-prototype');
});

test('Group 4 / iterar 3 veces sobre el mismo prototipo genera iter-1, iter-2, iter-3', async () => {
  const { mod } = await setupModule({
    projectId: 'p1',
    preexistingStore: {
      _version: '1.0.0', _updated: null,
      manifiesto: { valores: [], prohibido: [], tradicion_referencia: '', notas_libres: '' },
      prototipos: [{ id: 'proto_1', nombre: 'X', tags_creativos: [], descripcion: '', receta_id_origen: null, estado: 'en_desarrollo', iteraciones: [], version: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: null }]
    }
  });
  const r1 = await mod.onIterar({ project_id: 'p1', prototipo_id: 'proto_1', anotacion: 'a' });
  const r2 = await mod.onIterar({ project_id: 'p1', prototipo_id: 'proto_1', anotacion: 'b' });
  const r3 = await mod.onIterar({ project_id: 'p1', prototipo_id: 'proto_1', anotacion: 'c' });
  assert.strictEqual(r1.data.iteracion_id, 'iter-1');
  assert.strictEqual(r2.data.iteracion_id, 'iter-2');
  assert.strictEqual(r3.data.iteracion_id, 'iter-3');
  assert.strictEqual(r3.data.total_iteraciones, 3);
});

// ============================================================
// Group 5: Success evaluar alineacion + manifiesto
// ============================================================

test('Group 5 / actualizar manifiesto reemplaza valores presentes y preserva ausentes', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onActualizarManifiesto({
    project_id: 'p1',
    manifiesto: { valores: ['estacionalidad'], tradicion_referencia: 'mediterranea' }
  });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.manifiesto.valores, ['estacionalidad']);
  assert.strictEqual(r.data.manifiesto.tradicion_referencia, 'mediterranea');
  // prohibido y notas_libres permanecen (defaults)
  assert.deepStrictEqual(r.data.manifiesto.prohibido, []);
});

test('Group 5 / evaluar receta con valor en nombre devuelve score > base + resaltan', async () => {
  const { mod } = await setupModule({
    projectId: 'p1',
    preexistingStore: {
      _version: '1.0.0', _updated: null,
      manifiesto: { valores: ['estacionalidad', 'kilometro-cero'], prohibido: ['azucar-procesado'], tradicion_referencia: '', notas_libres: '' },
      prototipos: []
    }
  });
  const r = await mod.onEvaluarAlineacion({
    project_id: 'p1',
    objeto_tipo: 'receta',
    receta_id: 'rec_x',
    nombre: 'Tomate de estacionalidad con aceite',
    tags: ['kilometro-cero', 'verano']
  });
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.score > 50, `esperaba score > 50, fue ${r.data.score}`);
  assert.deepStrictEqual(r.data.resaltan.sort(), ['estacionalidad', 'kilometro-cero']);
  assert.deepStrictEqual(r.data.disuenan, []);
});

test('Group 5 / evaluar receta con prohibido en nombre devuelve score < base + disuenan', async () => {
  const { mod } = await setupModule({
    projectId: 'p1',
    preexistingStore: {
      _version: '1.0.0', _updated: null,
      manifiesto: { valores: [], prohibido: ['azucar-procesado'], tradicion_referencia: '', notas_libres: '' },
      prototipos: []
    }
  });
  const r = await mod.onEvaluarAlineacion({
    project_id: 'p1', objeto_tipo: 'receta',
    receta_id: 'rec_x',
    nombre: 'Postre con azucar-procesado y mantequilla',
    tags: []
  });
  assert.ok(r.data.score < 50);
  assert.deepStrictEqual(r.data.disuenan, ['azucar-procesado']);
});

test('Group 5 / evaluar score clamp a [0, 100]', async () => {
  const { mod } = await setupModule({
    projectId: 'p1',
    preexistingStore: {
      _version: '1.0.0', _updated: null,
      manifiesto: { valores: ['x', 'y', 'z', 'w', 'v', 'u', 't', 's'], prohibido: [], tradicion_referencia: '', notas_libres: '' },
      prototipos: []
    }
  });
  const r = await mod.onEvaluarAlineacion({
    project_id: 'p1', objeto_tipo: 'receta',
    receta_id: 'rec_x', nombre: 'x y z w v u t s', tags: []
  });
  assert.strictEqual(r.data.score, 100);
});

test('Group 5 / evaluar objeto_tipo=prototipo busca en store y publica AJV strict', async () => {
  const { mod, mocks } = await setupModule({
    projectId: 'p1',
    preexistingStore: {
      _version: '1.0.0', _updated: null,
      manifiesto: { valores: ['estacionalidad'], prohibido: [], tradicion_referencia: '', notas_libres: '' },
      prototipos: [{ id: 'proto_1', nombre: 'Tomate de estacionalidad', tags_creativos: ['estacionalidad'], descripcion: '', receta_id_origen: null, estado: 'en_desarrollo', iteraciones: [], version: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: null }]
    }
  });
  const r = await mod.onEvaluarAlineacion({
    project_id: 'p1', objeto_tipo: 'prototipo', prototipo_id: 'proto_1',
    user_id: 'chef', correlation_id: 'corr-al'
  });
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.score > 50);

  const ev = mocks.published.find(([n]) => n === 'creativo.alineacion.validada');
  assert.ok(ev);
  if (!validateAlineacionValidada(ev[1])) {
    const msg = validateAlineacionValidada.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`payload no cumple schema: ${msg}\npayload: ${JSON.stringify(ev[1], null, 2)}`);
  }
  assert.strictEqual(ev[1].objeto_tipo, 'prototipo');
  assert.strictEqual(ev[1].objeto_id, 'proto_1');
  assert.strictEqual(ev[1].correlation_id, 'corr-al');
});

test('Group 5 / evaluar prototipo inexistente devuelve 404 con entity_type', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onEvaluarAlineacion({ project_id: 'p1', objeto_tipo: 'prototipo', prototipo_id: 'no' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.details.entity_type, 'recipe-prototype');
});

// ============================================================
// Group 6: Bus handlers
// ============================================================

test('Group 6 / onProjectActivated puebla cache', async () => {
  const { mod } = await setupModule();
  mod.onProjectActivated({ data: { project_id: 'pX', base_path: '/var/pX' } });
  assert.strictEqual(mod.projectBasePaths.get('pX'), '/var/pX');
});

test('Group 6 / _basePathForProject sin cache dispara project.get.request y resuelve', async () => {
  const { mod } = await setupModule({ projectBasePath: '/tmp/p9-base' });
  const bp = await mod._basePathForProject('p9');
  assert.strictEqual(bp, '/tmp/p9-base');
});

test('Group 6 / onFsReadResponse con ENOENT resuelve null (store vacio)', async () => {
  const { mod } = await setupModule();
  const req_id = 'r1';
  const p = new Promise((resolve, reject) => mod.pendingFs.set(req_id, { resolve, reject, timer: setTimeout(() => reject(new Error('to')), 500) }));
  mod.onFsReadResponse({ data: { request_id: req_id, error: { code: 'RESOURCE_NOT_FOUND', kind: 'enoent' } } });
  assert.strictEqual(await p, null);
});

// ============================================================
// Group 7: Helpers POC2
// ============================================================

test('Group 7 / _publicarEvento propaga correlation_id del sourcePayload', async () => {
  const { mod, mocks } = await setupModule();
  await mod._publicarEvento('test.event', { project_id: 'p1', tecnica_id: 't1' }, { correlation_id: 'src-corr' });
  const ev = mocks.published.find(([n]) => n === 'test.event');
  assert.strictEqual(ev[1].correlation_id, 'src-corr');
});

test('Group 7 / _publicarEvento anade project_id, user_id, timestamp ISO 8601', async () => {
  const { mod, mocks } = await setupModule();
  await mod._publicarEvento('test.event.2', { project_id: 'p1', user_id: 'u1' }, null);
  const ev = mocks.published.find(([n]) => n === 'test.event.2');
  assert.strictEqual(ev[1].project_id, 'p1');
  assert.strictEqual(ev[1].user_id, 'u1');
  assert.ok(ev[1].timestamp.match(/^\d{4}-\d{2}-\d{2}T/));
});

test('Group 7 / _calcularAlineacion score base 50 sin coincidencias', async () => {
  const { mod } = await setupModule();
  const r = mod._calcularAlineacion(
    { nombre: 'plato neutro', tags: [] },
    { valores: ['estacionalidad'], prohibido: ['azucar'] }
  );
  assert.strictEqual(r.score, 50);
  assert.deepStrictEqual(r.resaltan, []);
  assert.deepStrictEqual(r.disuenan, []);
});

test('Group 7 / _calcularAlineacion +bonus por valor en tags (case-insensitive)', async () => {
  const { mod } = await setupModule();
  const r = mod._calcularAlineacion(
    { nombre: 'Plato X', tags: ['ESTACIONALIDAD'] },
    { valores: ['estacionalidad'], prohibido: [] }
  );
  assert.strictEqual(r.score, 60);  // 50 + 10
  assert.deepStrictEqual(r.resaltan, ['estacionalidad']);
});

test('Group 7 / _calcularAlineacion -penalty por prohibido detectado', async () => {
  const { mod } = await setupModule();
  const r = mod._calcularAlineacion(
    { nombre: 'Postre con AZUCAR procesado', tags: [] },
    { valores: [], prohibido: ['azucar'] }
  );
  assert.strictEqual(r.score, 25);  // 50 - 25
  assert.deepStrictEqual(r.disuenan, ['azucar']);
});

test('Group 7 / _calcularAlineacion clamp a 0 y 100', async () => {
  const { mod } = await setupModule();
  // Multiples valores -> debe topar a 100
  const arriba = mod._calcularAlineacion(
    { nombre: 'a b c d e f', tags: [] },
    { valores: ['a', 'b', 'c', 'd', 'e', 'f'], prohibido: [] }  // 50 + 60 = 110 → clamp 100
  );
  assert.strictEqual(arriba.score, 100);
  // Multiples prohibidos -> debe topar a 0
  const abajo = mod._calcularAlineacion(
    { nombre: 'x y z', tags: [] },
    { valores: [], prohibido: ['x', 'y', 'z'] }  // 50 - 75 = -25 → clamp 0
  );
  assert.strictEqual(abajo.score, 0);
});

runTests();

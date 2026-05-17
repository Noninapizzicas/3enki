/**
 * Tests del modulo `tecnicas` v1.0.0.
 *
 * Estructura por capas (7 grupos del canon POC2):
 *   1. Lifecycle              (onLoad / onUnload)
 *   2. Validacion canonica    (400 INVALID_INPUT)
 *   3. Success codificar      (publish + shape canonico AJV schema)
 *   4. Success actualizar     (publish + shape canonico AJV schema)
 *   5. Bus handlers           (project.activated, fs.read/write.response, project.get.response)
 *   6. Tools                  (listar, obtener, parametros + 404 + filtros)
 *   7. Helpers POC2           (_errorResponse, _classifyHandlerError, _publicarEvento)
 *
 * Aislamiento: eventBus mock con Map de publishes + interceptor de fs.*.request
 * que responde sincronamente con datos en memoria. Sin filesystem real.
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const Ajv    = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const TecnicasModule = require('../../modules/tecnicas/index.js');

const SCHEMAS_DIR = path.resolve(__dirname, '../../arquitectura/decisiones/_schemas/subsistema-recetario');

// ============================================================
// AJV strict loader — valida payloads contra los schemas oficiales del subsistema
// ============================================================

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

const ajv             = loadAjv();
const validateCreada      = ajv.getSchema('tecnica.creada.schema.json');
const validateActualizada = ajv.getSchema('tecnica.actualizada.schema.json');

if (!validateCreada || !validateActualizada) {
  throw new Error('Schemas oficiales del subsistema no encontrados — abortar tests');
}

// ============================================================
// Mocks
// ============================================================

function makeMocks({ projectBasePath = '/tmp/proj-test', preexistingTecnicas = [] } = {}) {
  const logs         = [];
  const metricsCalls = [];
  const published    = [];

  // estado del "filesystem" en memoria — keyed por absPath
  const fsStore = new Map();
  if (preexistingTecnicas.length > 0) {
    const absPath = `${projectBasePath}/tecnicas.json`;
    fsStore.set(absPath, JSON.stringify({
      _version: '1.0.0',
      _updated: '2026-05-17T00:00:00.000Z',
      tecnicas: preexistingTecnicas
    }, null, 2));
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

  // eventBus mock que intercepta fs.*.request y responde sincronamente
  let mod = null;
  const eventBus = {
    publish: async (eventName, payload) => {
      published.push([eventName, payload]);

      if (eventName === 'fs.read.request') {
        const content = fsStore.has(payload.path) ? fsStore.get(payload.path) : null;
        const responsePayload = content !== null
          ? { request_id: payload.request_id, content, path: payload.path }
          : { request_id: payload.request_id, error: { code: 'RESOURCE_NOT_FOUND', kind: 'enoent' }, path: payload.path };
        process.nextTick(() => mod && mod.onFsReadResponse({ data: responsePayload }));
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
  const mod = new TecnicasModule();
  mocks.setMod(mod);
  await mod.onLoad(mocks.core);
  // Pre-popular cache de basePath si lo pasaron
  if (opts.projectId && opts.projectBasePath) {
    mod.projectBasePaths.set(opts.projectId, opts.projectBasePath);
  } else if (opts.projectId) {
    mod.projectBasePaths.set(opts.projectId, opts.projectBasePath || '/tmp/proj-test');
  }
  return { mod, mocks };
}

// ============================================================
// Test runner sencillo
// ============================================================

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

test('Group 1 / onLoad loguea evento canonico tecnicas.loaded', async () => {
  const { mocks } = await setupModule();
  const loaded = mocks.logs.find(l => l[1] === 'tecnicas.loaded');
  assert.ok(loaded, 'esperaba log tecnicas.loaded');
  assert.strictEqual(loaded[2].version, '1.0.0');
  assert.strictEqual(loaded[2].storage, 'json-per-project');
});

test('Group 1 / onUnload limpia timers, caches y queues', async () => {
  const { mod } = await setupModule();
  mod.projectBasePaths.set('proj-x', '/tmp/x');
  mod.pendingFs.set('req-x',      { resolve: () => {}, reject: () => {}, timer: setTimeout(() => {}, 1e6) });
  mod.pendingProject.set('req-y', { resolve: () => {}, reject: () => {}, timer: setTimeout(() => {}, 1e6) });
  mod.writeQueues.set('proj-x', Promise.resolve());

  await mod.onUnload();

  assert.strictEqual(mod.projectBasePaths.size, 0);
  assert.strictEqual(mod.pendingFs.size, 0);
  assert.strictEqual(mod.pendingProject.size, 0);
  assert.strictEqual(mod.writeQueues.size, 0);
});

// ============================================================
// Group 2: Validacion canonica
// ============================================================

test('Group 2 / codificar sin project_id devuelve 400 INVALID_INPUT', async () => {
  const { mod } = await setupModule();
  const r = await mod.onCodificar({ nombre: 'X', categoria: 'Y' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
  assert.strictEqual(r.error.details.field, 'project_id');
});

test('Group 2 / codificar sin nombre devuelve 400 INVALID_INPUT con field:nombre', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCodificar({ project_id: 'p1', categoria: 'cocciones' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
  assert.strictEqual(r.error.details.field, 'nombre');
});

test('Group 2 / codificar sin categoria devuelve 400 con field:categoria', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCodificar({ project_id: 'p1', nombre: 'Esferificacion' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'categoria');
});

test('Group 2 / codificar con nombre >100 chars devuelve 400 con max', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const longName = 'x'.repeat(101);
  const r = await mod.onCodificar({ project_id: 'p1', nombre: longName, categoria: 'cocciones' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
  assert.strictEqual(r.error.details.field, 'nombre');
  assert.strictEqual(r.error.details.max, 100);
});

test('Group 2 / actualizar sin tecnica_id devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onActualizar({ project_id: 'p1', cambios: { nombre: 'X' } });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'tecnica_id');
});

test('Group 2 / actualizar con cambios vacio devuelve 400', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1', preexistingTecnicas: [
    { id: 'tec_1', nombre: 'X', categoria: 'Y', parametros: {}, instrucciones: '', materiales: [], version: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: null }
  ] });
  const r = await mod.onActualizar({ project_id: 'p1', tecnica_id: 'tec_1', cambios: {} });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
  assert.ok(r.error.details.allowed.includes('nombre'));
  void mocks;
});

// ============================================================
// Group 3: Success codificar (publica tecnica.creada con shape canonico AJV)
// ============================================================

test('Group 3 / codificar exitoso retorna 201 con tecnica_id, nombre, version', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCodificar({
    project_id: 'p1', user_id: 'chef',
    nombre: 'Esferificacion inversa', categoria: 'esferificaciones',
    parametros: { alginato_pct: 0.5 }, instrucciones: 'Mezclar...', materiales: ['jeringa']
  });
  assert.strictEqual(r.status, 201);
  assert.ok(r.data.tecnica_id.startsWith('tec_'));
  assert.strictEqual(r.data.nombre, 'Esferificacion inversa');
  assert.strictEqual(r.data.categoria, 'esferificaciones');
  assert.strictEqual(r.data.version, 1);
});

test('Group 3 / codificar publica tecnica.creada con shape canonico (AJV strict)', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  await mod.onCodificar({
    project_id:     'p1',
    user_id:        'chef',
    nombre:         'Confitar a baja temp',
    categoria:      'cocciones',
    correlation_id: 'corr-abc-123'
  });

  const ev = mocks.published.find(([n]) => n === 'tecnica.creada');
  assert.ok(ev, 'esperaba publish tecnica.creada');
  const [, payload] = ev;

  const isValid = validateCreada(payload);
  if (!isValid) {
    const msg = validateCreada.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`payload no cumple schema oficial: ${msg}\npayload: ${JSON.stringify(payload, null, 2)}`);
  }

  assert.strictEqual(payload.project_id, 'p1');
  assert.strictEqual(payload.user_id, 'chef');
  assert.strictEqual(payload.correlation_id, 'corr-abc-123');
  assert.strictEqual(payload.nombre, 'Confitar a baja temp');
  assert.strictEqual(payload.categoria, 'cocciones');
  assert.ok(payload.tecnica_id.startsWith('tec_'));
  assert.ok(payload.timestamp.match(/^\d{4}-\d{2}-\d{2}T/));
});

test('Group 3 / codificar persiste a fs.write.request con path canonico', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1', projectBasePath: '/tmp/p1-base' });
  await mod.onCodificar({ project_id: 'p1', nombre: 'X', categoria: 'Y' });

  const writeEv = mocks.published.find(([n]) => n === 'fs.write.request');
  assert.ok(writeEv, 'esperaba publish fs.write.request');
  const [, w] = writeEv;
  assert.strictEqual(w.path, '/tmp/p1-base/tecnicas.json');
  assert.strictEqual(w.encoding, 'utf8');
  assert.strictEqual(w.atomic, true);
  const stored = JSON.parse(w.content);
  assert.strictEqual(stored.tecnicas.length, 1);
  assert.strictEqual(stored.tecnicas[0].nombre, 'X');
});

test('Group 3 / codificar incrementa metric y gauge', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  await mod.onCodificar({ project_id: 'p1', nombre: 'X', categoria: 'Y' });

  const counter = mocks.metricsCalls.find(c => c[0] === 'increment' && c[1] === 'tecnicas.codificar.total');
  assert.ok(counter, 'esperaba metric tecnicas.codificar.total');
  const gauge = mocks.metricsCalls.find(c => c[0] === 'gauge' && c[1] === 'tecnicas.activas.count');
  assert.ok(gauge, 'esperaba gauge tecnicas.activas.count');
  assert.strictEqual(gauge[2], 1);
});

// ============================================================
// Group 4: Success actualizar
// ============================================================

test('Group 4 / actualizar exitoso retorna 200 con version incrementada y campos_actualizados', async () => {
  const { mod } = await setupModule({
    projectId: 'p1',
    preexistingTecnicas: [{
      id: 'tec_1', nombre: 'Confitar', categoria: 'cocciones',
      parametros: { temp_c: 80 }, instrucciones: '', materiales: [],
      version: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: null
    }]
  });
  const r = await mod.onActualizar({
    project_id: 'p1', tecnica_id: 'tec_1',
    cambios: { nombre: 'Confitar a 80C', parametros: { temp_c: 80, tiempo_min: 240 } }
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.tecnica_id, 'tec_1');
  assert.strictEqual(r.data.nombre, 'Confitar a 80C');
  assert.strictEqual(r.data.version, 2);
  assert.deepStrictEqual(r.data.campos_actualizados.sort(), ['nombre', 'parametros']);
});

test('Group 4 / actualizar publica tecnica.actualizada con shape canonico (AJV strict)', async () => {
  const { mod, mocks } = await setupModule({
    projectId: 'p1',
    preexistingTecnicas: [{
      id: 'tec_1', nombre: 'X', categoria: 'Y', parametros: {}, instrucciones: '', materiales: [],
      version: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: null
    }]
  });
  await mod.onActualizar({
    project_id: 'p1', tecnica_id: 'tec_1', user_id: 'chef',
    correlation_id: 'corr-upd-1', cambios: { categoria: 'Z' }
  });

  const ev = mocks.published.find(([n]) => n === 'tecnica.actualizada');
  assert.ok(ev, 'esperaba publish tecnica.actualizada');
  const [, payload] = ev;

  const isValid = validateActualizada(payload);
  if (!isValid) {
    const msg = validateActualizada.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`payload no cumple schema: ${msg}\npayload: ${JSON.stringify(payload, null, 2)}`);
  }
  assert.strictEqual(payload.correlation_id, 'corr-upd-1');
  assert.strictEqual(payload.tecnica_id, 'tec_1');
  assert.deepStrictEqual(payload.campos_actualizados, ['categoria']);
});

test('Group 4 / actualizar de tecnica inexistente devuelve 404 RESOURCE_NOT_FOUND', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onActualizar({ project_id: 'p1', tecnica_id: 'no-existe', cambios: { nombre: 'X' } });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
  assert.strictEqual(r.error.details.entity_type, 'culinary-technique');
  assert.strictEqual(r.error.details.entity_id, 'no-existe');
});

// ============================================================
// Group 5: Bus handlers (project + fs)
// ============================================================

test('Group 5 / onProjectActivated puebla cache de basePaths', async () => {
  const { mod } = await setupModule();
  mod.onProjectActivated({ data: { project_id: 'p9', base_path: '/var/projects/p9' } });
  assert.strictEqual(mod.projectBasePaths.get('p9'), '/var/projects/p9');
});

test('Group 5 / _basePathForProject resuelve via project.get.request si no esta en cache', async () => {
  const { mod } = await setupModule({ projectBasePath: '/tmp/p7-base' });
  // cache vacia, debe disparar project.get.request y recibir respuesta del mock
  const basePath = await mod._basePathForProject('p7');
  assert.strictEqual(basePath, '/tmp/p7-base');
  assert.strictEqual(mod.projectBasePaths.get('p7'), '/tmp/p7-base');
});

test('Group 5 / onFsReadResponse con archivo inexistente resuelve con null', async () => {
  const { mod } = await setupModule();
  const req_id = 'req-test-1';
  const p = new Promise((resolve, reject) => {
    mod.pendingFs.set(req_id, { resolve, reject, timer: setTimeout(() => reject(new Error('timeout')), 1000) });
  });
  mod.onFsReadResponse({ data: { request_id: req_id, error: { code: 'RESOURCE_NOT_FOUND', kind: 'enoent' } } });
  const result = await p;
  assert.strictEqual(result, null);
  assert.strictEqual(mod.pendingFs.size, 0);
});

test('Group 5 / onFsWriteResponse con error rechaza con _code propagado', async () => {
  const { mod } = await setupModule();
  const req_id = 'req-test-w';
  const p = new Promise((resolve, reject) => {
    mod.pendingFs.set(req_id, { resolve, reject, timer: setTimeout(() => reject(new Error('timeout')), 1000) });
  });
  mod.onFsWriteResponse({ data: { request_id: req_id, error: { code: 'UPSTREAM_INVALID_RESPONSE', message: 'disk full' } } });
  await assert.rejects(p, err => err._code === 'UPSTREAM_INVALID_RESPONSE');
});

// ============================================================
// Group 6: Tools (listar / obtener / parametros)
// ============================================================

test('Group 6 / listar devuelve todas las tecnicas del proyecto', async () => {
  const { mod } = await setupModule({
    projectId: 'p1',
    preexistingTecnicas: [
      { id: 'tec_a', nombre: 'A', categoria: 'cocciones',      parametros: {}, instrucciones: '', materiales: [], version: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: null },
      { id: 'tec_b', nombre: 'B', categoria: 'fermentaciones', parametros: {}, instrucciones: '', materiales: [], version: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: null }
    ]
  });
  const r = await mod.onListar({ project_id: 'p1' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.total, 2);
  assert.deepStrictEqual(r.data.tecnicas.map(t => t.nombre).sort(), ['A', 'B']);
});

test('Group 6 / listar con filtro categoria filtra correctamente', async () => {
  const { mod } = await setupModule({
    projectId: 'p1',
    preexistingTecnicas: [
      { id: 'tec_a', nombre: 'A', categoria: 'cocciones',      parametros: {}, instrucciones: '', materiales: [], version: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: null },
      { id: 'tec_b', nombre: 'B', categoria: 'fermentaciones', parametros: {}, instrucciones: '', materiales: [], version: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: null }
    ]
  });
  const r = await mod.onListar({ project_id: 'p1', categoria: 'cocciones' });
  assert.strictEqual(r.data.total, 1);
  assert.strictEqual(r.data.tecnicas[0].nombre, 'A');
});

test('Group 6 / obtener devuelve la tecnica completa', async () => {
  const { mod } = await setupModule({
    projectId: 'p1',
    preexistingTecnicas: [{
      id: 'tec_x', nombre: 'Marinada 24h', categoria: 'marinadas',
      parametros: { tiempo_h: 24 }, instrucciones: 'Sumergir y refrigerar', materiales: ['bolsa zip'],
      version: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: null
    }]
  });
  const r = await mod.onObtener({ project_id: 'p1', tecnica_id: 'tec_x' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.nombre, 'Marinada 24h');
  assert.deepStrictEqual(r.data.parametros, { tiempo_h: 24 });
});

test('Group 6 / obtener de id inexistente devuelve 404 con entity_type canonico', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onObtener({ project_id: 'p1', tecnica_id: 'no' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
  assert.strictEqual(r.error.details.entity_type, 'culinary-technique');
});

test('Group 6 / parametros devuelve solo nombre + parametros (sin instrucciones ni materiales)', async () => {
  const { mod } = await setupModule({
    projectId: 'p1',
    preexistingTecnicas: [{
      id: 'tec_p', nombre: 'X', categoria: 'Y',
      parametros: { ph: 4.5, temp_c: 60 }, instrucciones: 'long text...', materiales: ['mucho'],
      version: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: null
    }]
  });
  const r = await mod.onParametros({ project_id: 'p1', tecnica_id: 'tec_p' });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(Object.keys(r.data).sort(), ['nombre', 'parametros', 'tecnica_id']);
  assert.deepStrictEqual(r.data.parametros, { ph: 4.5, temp_c: 60 });
});

test('Group 6 / parametros de id inexistente devuelve 404', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onParametros({ project_id: 'p1', tecnica_id: 'no' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.details.entity_type, 'culinary-technique');
});

// ============================================================
// Group 7: Helpers POC2
// ============================================================

test('Group 7 / _errorResponse construye shape canonico { status, error: { code, message, details? } }', async () => {
  const { mod } = await setupModule();
  const r = mod._errorResponse(400, 'INVALID_INPUT', 'falta campo X', { field: 'X' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
  assert.strictEqual(r.error.message, 'falta campo X');
  assert.deepStrictEqual(r.error.details, { field: 'X' });
  assert.ok(!('data' in r), 'no debe llevar data');
});

test('Group 7 / _errorResponse sin details no incluye la clave details', async () => {
  const { mod } = await setupModule();
  const r = mod._errorResponse(500, 'UNKNOWN_ERROR', 'algo');
  assert.ok(!('details' in r.error), 'sin details no debe aparecer la clave');
});

test('Group 7 / _handleHandlerError respeta err._code y mapea a status canonico', async () => {
  const { mod } = await setupModule();
  // Patron POC2: el handler asigna err._code = '<CANONIC>' antes de throw;
  // _handleHandlerError lo respeta y mapea via _statusFromCode.
  const r404 = mod._handleHandlerError('test', Object.assign(new Error('x'), { _code: 'RESOURCE_NOT_FOUND' }), 'tool');
  assert.strictEqual(r404.status, 404);
  assert.strictEqual(r404.error.code, 'RESOURCE_NOT_FOUND');
  const r504 = mod._handleHandlerError('test', Object.assign(new Error('x'), { _code: 'UPSTREAM_TIMEOUT' }), 'tool');
  assert.strictEqual(r504.status, 504);
  const r503 = mod._handleHandlerError('test', Object.assign(new Error('x'), { _code: 'UPSTREAM_UNREACHABLE' }), 'tool');
  assert.strictEqual(r503.status, 503);
  // Sin _code -> heuristica por message
  const rUnknown = mod._handleHandlerError('test', new Error('algo raro'), 'tool');
  assert.strictEqual(rUnknown.status, 500);
  assert.strictEqual(rUnknown.error.code, 'UNKNOWN_ERROR');
});

test('Group 7 / _publicarEvento propaga correlation_id del sourcePayload', async () => {
  const { mod, mocks } = await setupModule();
  await mod._publicarEvento('test.evento', { project_id: 'p1', tecnica_id: 'tec_1' }, { correlation_id: 'corr-xyz' });
  const ev = mocks.published.find(([n]) => n === 'test.evento');
  assert.ok(ev);
  assert.strictEqual(ev[1].correlation_id, 'corr-xyz');
});

test('Group 7 / _publicarEvento genera correlation_id si no hay sourcePayload', async () => {
  const { mod, mocks } = await setupModule();
  await mod._publicarEvento('test.evento.2', { project_id: 'p1' }, null);
  const ev = mocks.published.find(([n]) => n === 'test.evento.2');
  assert.ok(ev);
  assert.ok(ev[1].correlation_id);
  assert.ok(ev[1].correlation_id.length >= 8, 'correlation_id deberia ser UUID');
});

test('Group 7 / _publicarEvento adjunta project_id, user_id, timestamp ISO 8601', async () => {
  const { mod, mocks } = await setupModule();
  await mod._publicarEvento('test.evento.3', { project_id: 'p1', user_id: 'u1' }, null);
  const ev = mocks.published.find(([n]) => n === 'test.evento.3');
  assert.strictEqual(ev[1].project_id, 'p1');
  assert.strictEqual(ev[1].user_id, 'u1');
  assert.ok(ev[1].timestamp.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/));
});

test('Group 7 / _publicarEvento usa DEFAULT_PROJECT_ID si payload+source no traen project_id', async () => {
  const { mod, mocks } = await setupModule();
  await mod._publicarEvento('test.evento.4', { tecnica_id: 'tec_x' }, null);
  const ev = mocks.published.find(([n]) => n === 'test.evento.4');
  assert.strictEqual(ev[1].project_id, 'default');
});

// ============================================================
// Run
// ============================================================

runTests();

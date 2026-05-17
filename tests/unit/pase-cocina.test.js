/**
 * Tests del modulo `pase-cocina` v1.0.0.
 *
 * 7 grupos POC2:
 *   1. Lifecycle
 *   2. Validacion canonica
 *   3. Success crear ficha (publish + AJV strict)
 *   4. Success incidencia (publish + AJV strict)
 *   5. Success sustitucion (publish + AJV strict)
 *   6. Bus handlers + obtener/listar
 *   7. Helpers POC2 (_publicarEvento, _generarId)
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const Ajv    = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const PaseCocinaModule = require('../../modules/pase-cocina/index.js');

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
const validateFichaCreada       = ajv.getSchema('pase.ficha.creada.schema.json');
const validateIncidenciaRegistr = ajv.getSchema('pase.incidencia.registrada.schema.json');
const validateSustitucionRegis  = ajv.getSchema('pase.sustitucion.registrada.schema.json');
if (!validateFichaCreada || !validateIncidenciaRegistr || !validateSustitucionRegis) {
  throw new Error('Schemas oficiales del subsistema no encontrados');
}

function makeMocks({ projectBasePath = '/tmp/proj-test', preexistingStore = null } = {}) {
  const logs         = [];
  const metricsCalls = [];
  const published    = [];

  const fsStore = new Map();
  if (preexistingStore) {
    fsStore.set(`${projectBasePath}/pase-cocina.json`, JSON.stringify(preexistingStore, null, 2));
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
  const mod = new PaseCocinaModule();
  mocks.setMod(mod);
  await mod.onLoad(mocks.core);
  if (opts.projectId) {
    mod.projectBasePaths.set(opts.projectId, opts.projectBasePath || '/tmp/proj-test');
  }
  return { mod, mocks };
}

function makeStoreWithFicha(extras = {}) {
  return {
    _version: '1.0.0', _updated: null,
    fichas: [{
      id: 'ficha_1',
      receta_id: 'rec_a',
      version_receta: 1,
      nombre: 'Tomate de la huerta',
      servicio: '2026-05-17-cena',
      estado: 'activa',
      incidencias: [],
      sustituciones: [],
      created_at: '2026-05-17T18:00:00.000Z',
      closed_at: null,
      ...extras
    }]
  };
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

test('Group 1 / onLoad loguea pase-cocina.loaded con storage json-per-project', async () => {
  const { mocks } = await setupModule();
  const loaded = mocks.logs.find(l => l[1] === 'pase-cocina.loaded');
  assert.ok(loaded);
  assert.strictEqual(loaded[2].storage, 'json-per-project');
});

test('Group 1 / onUnload limpia timers, caches y queues', async () => {
  const { mod } = await setupModule();
  mod.projectBasePaths.set('p1', '/tmp/p1');
  mod.pendingFs.set('rf', { resolve: () => {}, reject: () => {}, timer: setTimeout(() => {}, 1e6) });
  mod.writeQueues.set('p1', Promise.resolve());
  await mod.onUnload();
  assert.strictEqual(mod.projectBasePaths.size, 0);
  assert.strictEqual(mod.pendingFs.size, 0);
  assert.strictEqual(mod.writeQueues.size, 0);
});

// ============================================================
// Group 2: Validacion canonica
// ============================================================

test('Group 2 / crear ficha sin project_id devuelve 400', async () => {
  const { mod } = await setupModule();
  const r = await mod.onCrearFicha({ receta_id: 'r1', version_receta: 1, nombre: 'X', servicio: 'S' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'project_id');
});

test('Group 2 / crear ficha sin receta_id devuelve 400 con field:receta_id', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCrearFicha({ project_id: 'p1', version_receta: 1, nombre: 'X', servicio: 'S' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'receta_id');
});

test('Group 2 / crear ficha con version_receta=0 devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCrearFicha({ project_id: 'p1', receta_id: 'r1', version_receta: 0, nombre: 'X', servicio: 'S' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'version_receta');
});

test('Group 2 / incidencia con tipo invalido devuelve 400 con allowed', async () => {
  const { mod } = await setupModule({ projectId: 'p1', preexistingStore: makeStoreWithFicha() });
  const r = await mod.onRegistrarIncidencia({
    project_id: 'p1', ficha_pase_id: 'ficha_1',
    tipo: 'inventado', descripcion: 'X'
  });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'tipo');
  assert.ok(r.error.details.allowed.includes('rotura_genero'));
});

test('Group 2 / incidencia con severidad invalida devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1', preexistingStore: makeStoreWithFicha() });
  const r = await mod.onRegistrarIncidencia({
    project_id: 'p1', ficha_pase_id: 'ficha_1',
    tipo: 'rotura_genero', descripcion: 'X', severidad: 'mortal'
  });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'severidad');
});

test('Group 2 / sustitucion sin motivo devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1', preexistingStore: makeStoreWithFicha() });
  const r = await mod.onRegistrarSustitucion({
    project_id: 'p1', ficha_pase_id: 'ficha_1',
    ingrediente_original: 'albahaca', ingrediente_sustituto: 'cilantro'
  });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'motivo');
});

test('Group 2 / sustitucion con cantidad negativa devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1', preexistingStore: makeStoreWithFicha() });
  const r = await mod.onRegistrarSustitucion({
    project_id: 'p1', ficha_pase_id: 'ficha_1',
    ingrediente_original: 'X', ingrediente_sustituto: 'Y', motivo: 'falta',
    cantidad: -1
  });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'cantidad');
});

test('Group 2 / listar con estado invalido devuelve 400', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onListarFichas({ project_id: 'p1', estado: 'pausada' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'estado');
});

// ============================================================
// Group 3: Success crear ficha
// ============================================================

test('Group 3 / crear ficha exitoso retorna 201 con ficha_pase_id, receta_id, servicio, estado', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onCrearFicha({
    project_id: 'p1', user_id: 'cocinero',
    receta_id: 'rec_xyz', version_receta: 3,
    nombre: 'Tomate de la huerta con esferas',
    servicio: '2026-05-17-cena'
  });
  assert.strictEqual(r.status, 201);
  assert.ok(r.data.ficha_pase_id.startsWith('ficha_'));
  assert.strictEqual(r.data.receta_id, 'rec_xyz');
  assert.strictEqual(r.data.servicio, '2026-05-17-cena');
  assert.strictEqual(r.data.estado, 'activa');
});

test('Group 3 / crear ficha publica pase.ficha.creada con shape canonico AJV strict', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1' });
  await mod.onCrearFicha({
    project_id: 'p1', user_id: 'cocinero',
    receta_id: 'rec_xyz', version_receta: 3,
    nombre: 'Confitar tomate cherry',
    servicio: '2026-05-17-cena',
    correlation_id: 'corr-ficha-1'
  });
  const ev = mocks.published.find(([n]) => n === 'pase.ficha.creada');
  assert.ok(ev);
  const [, payload] = ev;
  if (!validateFichaCreada(payload)) {
    const msg = validateFichaCreada.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`payload no cumple schema: ${msg}\npayload: ${JSON.stringify(payload, null, 2)}`);
  }
  assert.strictEqual(payload.correlation_id, 'corr-ficha-1');
  assert.strictEqual(payload.receta_id, 'rec_xyz');
  assert.strictEqual(payload.version_receta, 3);
  assert.strictEqual(payload.servicio, '2026-05-17-cena');
  assert.ok(payload.ficha_pase_id.startsWith('ficha_'));
});

test('Group 3 / crear ficha persiste al fs en path canonico y actualiza gauge activas', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1', projectBasePath: '/tmp/p1-base' });
  await mod.onCrearFicha({
    project_id: 'p1', receta_id: 'r1', version_receta: 1,
    nombre: 'X', servicio: 'S'
  });
  const writeEv = mocks.published.find(([n]) => n === 'fs.write.request');
  assert.ok(writeEv);
  assert.strictEqual(writeEv[1].path, '/tmp/p1-base/pase-cocina.json');
  const stored = JSON.parse(writeEv[1].content);
  assert.strictEqual(stored.fichas.length, 1);
  assert.strictEqual(stored.fichas[0].estado, 'activa');

  const gauge = mocks.metricsCalls.find(c => c[0] === 'gauge' && c[1] === 'pase-cocina.fichas.activas.count');
  assert.ok(gauge);
  assert.strictEqual(gauge[2], 1);
});

// ============================================================
// Group 4: Success registrar incidencia
// ============================================================

test('Group 4 / registrar incidencia retorna 201 con incidencia_id y total_incidencias', async () => {
  const { mod } = await setupModule({ projectId: 'p1', preexistingStore: makeStoreWithFicha() });
  const r = await mod.onRegistrarIncidencia({
    project_id: 'p1', ficha_pase_id: 'ficha_1',
    tipo: 'rotura_genero', descripcion: 'Lote de tomate roto'
  });
  assert.strictEqual(r.status, 201);
  assert.ok(r.data.incidencia_id.startsWith('inc_'));
  assert.strictEqual(r.data.total_incidencias, 1);
});

test('Group 4 / registrar incidencia publica pase.incidencia.registrada con shape AJV strict', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1', preexistingStore: makeStoreWithFicha() });
  await mod.onRegistrarIncidencia({
    project_id: 'p1', user_id: 'cocinero', correlation_id: 'corr-inc-1',
    ficha_pase_id: 'ficha_1',
    tipo: 'queja_cliente', descripcion: 'Plato frio', severidad: 'alta'
  });
  const ev = mocks.published.find(([n]) => n === 'pase.incidencia.registrada');
  assert.ok(ev);
  const [, payload] = ev;
  if (!validateIncidenciaRegistr(payload)) {
    const msg = validateIncidenciaRegistr.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`payload no cumple schema: ${msg}\npayload: ${JSON.stringify(payload, null, 2)}`);
  }
  assert.strictEqual(payload.correlation_id, 'corr-inc-1');
  assert.strictEqual(payload.tipo, 'queja_cliente');
  assert.strictEqual(payload.severidad, 'alta');
  assert.strictEqual(payload.ficha_pase_id, 'ficha_1');
});

test('Group 4 / registrar incidencia sobre ficha inexistente devuelve 404 con entity_type', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onRegistrarIncidencia({
    project_id: 'p1', ficha_pase_id: 'no-existe',
    tipo: 'otro', descripcion: 'X'
  });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.details.entity_type, 'pass-card');
  assert.strictEqual(r.error.details.entity_id, 'no-existe');
});

test('Group 4 / registrar incidencia sin severidad usa default media', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1', preexistingStore: makeStoreWithFicha() });
  await mod.onRegistrarIncidencia({
    project_id: 'p1', ficha_pase_id: 'ficha_1',
    tipo: 'tiempo_excedido', descripcion: 'Tarda mucho'
  });
  const ev = mocks.published.find(([n]) => n === 'pase.incidencia.registrada');
  assert.strictEqual(ev[1].severidad, 'media');
});

// ============================================================
// Group 5: Success registrar sustitucion
// ============================================================

test('Group 5 / registrar sustitucion retorna 201 con total_sustituciones', async () => {
  const { mod } = await setupModule({ projectId: 'p1', preexistingStore: makeStoreWithFicha() });
  const r = await mod.onRegistrarSustitucion({
    project_id: 'p1', ficha_pase_id: 'ficha_1',
    ingrediente_original: 'albahaca', ingrediente_sustituto: 'cilantro',
    motivo: 'sin stock', cantidad: 0.05, unidad: 'kg'
  });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.total_sustituciones, 1);
});

test('Group 5 / registrar sustitucion publica pase.sustitucion.registrada con shape AJV strict', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1', preexistingStore: makeStoreWithFicha() });
  await mod.onRegistrarSustitucion({
    project_id: 'p1', user_id: 'cocinero', correlation_id: 'corr-sust-1',
    ficha_pase_id: 'ficha_1',
    ingrediente_original: 'albahaca', ingrediente_sustituto: 'cilantro',
    motivo: 'sin stock', cantidad: 0.05, unidad: 'kg'
  });
  const ev = mocks.published.find(([n]) => n === 'pase.sustitucion.registrada');
  assert.ok(ev);
  const [, payload] = ev;
  if (!validateSustitucionRegis(payload)) {
    const msg = validateSustitucionRegis.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`payload no cumple schema: ${msg}\npayload: ${JSON.stringify(payload, null, 2)}`);
  }
  assert.strictEqual(payload.correlation_id, 'corr-sust-1');
  assert.strictEqual(payload.ingrediente_original, 'albahaca');
  assert.strictEqual(payload.ingrediente_sustituto, 'cilantro');
  assert.strictEqual(payload.motivo, 'sin stock');
  assert.strictEqual(payload.cantidad, 0.05);
  assert.strictEqual(payload.unidad, 'kg');
});

test('Group 5 / sustitucion sin cantidad ni unidad publica payload sin esos campos (sigue AJV)', async () => {
  const { mod, mocks } = await setupModule({ projectId: 'p1', preexistingStore: makeStoreWithFicha() });
  await mod.onRegistrarSustitucion({
    project_id: 'p1', ficha_pase_id: 'ficha_1',
    ingrediente_original: 'X', ingrediente_sustituto: 'Y', motivo: 'Z'
  });
  const ev = mocks.published.find(([n]) => n === 'pase.sustitucion.registrada');
  assert.ok(ev);
  assert.ok(!('cantidad' in ev[1]));
  assert.ok(!('unidad' in ev[1]));
  if (!validateSustitucionRegis(ev[1])) {
    throw new Error(`payload sin cantidad/unidad no cumple AJV: ${validateSustitucionRegis.errors.map(e => e.message).join('; ')}`);
  }
});

// ============================================================
// Group 6: Bus handlers + obtener/listar
// ============================================================

test('Group 6 / onProjectActivated puebla cache', async () => {
  const { mod } = await setupModule();
  mod.onProjectActivated({ data: { project_id: 'pX', base_path: '/var/pX' } });
  assert.strictEqual(mod.projectBasePaths.get('pX'), '/var/pX');
});

test('Group 6 / onFsReadResponse con ENOENT resuelve null', async () => {
  const { mod } = await setupModule();
  const rid = 'r1';
  const p = new Promise((resolve, reject) => mod.pendingFs.set(rid, { resolve, reject, timer: setTimeout(() => reject(new Error('t')), 500) }));
  mod.onFsReadResponse({ data: { request_id: rid, error: { code: 'RESOURCE_NOT_FOUND', kind: 'enoent' } } });
  assert.strictEqual(await p, null);
});

test('Group 6 / obtener ficha existente devuelve la ficha completa', async () => {
  const { mod } = await setupModule({ projectId: 'p1', preexistingStore: makeStoreWithFicha() });
  const r = await mod.onObtenerFicha({ project_id: 'p1', ficha_pase_id: 'ficha_1' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.id, 'ficha_1');
  assert.strictEqual(r.data.nombre, 'Tomate de la huerta');
  assert.deepStrictEqual(r.data.incidencias, []);
});

test('Group 6 / obtener ficha inexistente devuelve 404 con entity_type', async () => {
  const { mod } = await setupModule({ projectId: 'p1' });
  const r = await mod.onObtenerFicha({ project_id: 'p1', ficha_pase_id: 'no' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.details.entity_type, 'pass-card');
});

test('Group 6 / listar fichas con filtro servicio filtra correctamente', async () => {
  const { mod } = await setupModule({
    projectId: 'p1',
    preexistingStore: {
      _version: '1.0.0', _updated: null,
      fichas: [
        { id: 'f1', receta_id: 'r1', version_receta: 1, nombre: 'A', servicio: 'cena', estado: 'activa', incidencias: [], sustituciones: [], created_at: 'x', closed_at: null },
        { id: 'f2', receta_id: 'r2', version_receta: 1, nombre: 'B', servicio: 'comida', estado: 'activa', incidencias: [], sustituciones: [], created_at: 'x', closed_at: null }
      ]
    }
  });
  const r = await mod.onListarFichas({ project_id: 'p1', servicio: 'cena' });
  assert.strictEqual(r.data.total, 1);
  assert.strictEqual(r.data.fichas[0].nombre, 'A');
});

test('Group 6 / listar fichas con filtro estado=cerrada filtra activas', async () => {
  const { mod } = await setupModule({
    projectId: 'p1',
    preexistingStore: {
      _version: '1.0.0', _updated: null,
      fichas: [
        { id: 'f1', receta_id: 'r1', version_receta: 1, nombre: 'A', servicio: 'cena', estado: 'activa',  incidencias: [], sustituciones: [], created_at: 'x', closed_at: null },
        { id: 'f2', receta_id: 'r2', version_receta: 1, nombre: 'B', servicio: 'cena', estado: 'cerrada', incidencias: [], sustituciones: [], created_at: 'x', closed_at: 'y' }
      ]
    }
  });
  const r = await mod.onListarFichas({ project_id: 'p1', estado: 'cerrada' });
  assert.strictEqual(r.data.total, 1);
  assert.strictEqual(r.data.fichas[0].id, 'f2');
});

// ============================================================
// Group 7: Helpers POC2
// ============================================================

test('Group 7 / _publicarEvento propaga correlation_id del sourcePayload', async () => {
  const { mod, mocks } = await setupModule();
  await mod._publicarEvento('test.event', { project_id: 'p1' }, { correlation_id: 'src-corr' });
  const ev = mocks.published.find(([n]) => n === 'test.event');
  assert.strictEqual(ev[1].correlation_id, 'src-corr');
});

test('Group 7 / _publicarEvento anade project_id, user_id, timestamp', async () => {
  const { mod, mocks } = await setupModule();
  await mod._publicarEvento('test.event.2', { project_id: 'p1', user_id: 'u1' }, null);
  const ev = mocks.published.find(([n]) => n === 'test.event.2');
  assert.strictEqual(ev[1].project_id, 'p1');
  assert.strictEqual(ev[1].user_id, 'u1');
  assert.ok(ev[1].timestamp.match(/^\d{4}-\d{2}-\d{2}T/));
});

test('Group 7 / _generarId con distintos prefijos respeta canon ficha_/inc_/sust_', async () => {
  const { mod } = await setupModule();
  assert.ok(mod._generarId('ficha').startsWith('ficha_'));
  assert.ok(mod._generarId('inc').startsWith('inc_'));
  assert.ok(mod._generarId('sust').startsWith('sust_'));
  // formato: prefix_<timestamp_13digitos>_<6_hex_chars>
  assert.match(mod._generarId('ficha'), /^ficha_\d{13}_[0-9a-f]{6}$/);
});

test('Group 7 / _handleHandlerError respeta err._code = UPSTREAM_TIMEOUT y mapea a 504', async () => {
  const { mod } = await setupModule();
  const r = mod._handleHandlerError('test', Object.assign(new Error('x'), { _code: 'UPSTREAM_TIMEOUT' }), 'tool');
  assert.strictEqual(r.status, 504);
  assert.strictEqual(r.error.code, 'UPSTREAM_TIMEOUT');
});

runTests();

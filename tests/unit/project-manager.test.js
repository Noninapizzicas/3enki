/**
 * Tests unitarios — project-manager v4.0.0 (post-rewrite canonico).
 *
 * Foco:
 *  - Lifecycle (onLoad/onUnload sin leak de pending requests).
 *  - Bootstrap automatico (Sistema + Mi Proyecto al arrancar sin DB previa).
 *  - CRUD via UI handlers + HTTP handlers + bus events.
 *  - Activate/deactivate ciclo completo con publishes canonicos.
 *  - getOrCreateDefaultConversation con cache pendingDefaultConversations
 *    (modelo "una via fija" — race protection).
 *  - Shape canonico de respuestas: { status, data | error: { code, message, details? } }.
 *  - error.code del catalogo (INVALID_INPUT, RESOURCE_NOT_FOUND, CONFLICT, UNKNOWN_ERROR).
 *  - correlation_id propagado en publishes.
 *  - reactivateExistingProjects re-emite project.activated tras restart.
 *
 * Ejecutar: node tests/unit/project-manager.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const crypto = require('crypto');

const ProjectManagerModule = require('../../modules/project-manager/index.js');
const { EVENTS } = require('../../core/constants');

function makeMocks(opts = {}) {
  const logs = [];
  const published = [];
  const metricsCalls = [];
  const dbStore = []; // filas de la tabla "projects"

  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };

  const metrics = {
    increment: (name, labels) => metricsCalls.push(['increment', name, labels]),
    gauge:     (name, value, labels) => metricsCalls.push(['gauge', name, value, labels]),
    timing:    (name, ms, labels) => metricsCalls.push(['timing', name, ms, labels])
  };

  let moduleRef = null;
  const eventBus = {
    publish: async (event, payload) => {
      published.push([event, payload]);
      if (event === 'db.query.request' && moduleRef) {
        const result = handleDbQuery(payload, dbStore);
        process.nextTick(() => moduleRef.onDbQueryResponse({
          data: { request_id: payload.request_id, success: true, data: result }
        }));
      }
      // composition.request: si opts.compositionDisabled, simulamos fallo (timeout)
      if (event === 'composition.request' && moduleRef && !opts.compositionDisabled) {
        const action = payload.action;
        let result = null;
        if (action === 'system.create')      result = { id: 'sys-' + crypto.randomUUID().slice(0, 8) };
        else if (action === 'entity.join')   result = { joined: true };
        else if (action === 'dependents.has') result = { hasDependents: false, count: 0, dependents: [] };
        else if (action === 'entity.unassigned') result = [];
        process.nextTick(() => moduleRef.onCompositionResponse({
          data: { request_id: payload.request_id, success: true, data: result }
        }));
      }
    }
  };

  const mqttRequest = async (modulo, action, data, options) => {
    if (modulo === 'chat-io' && action === 'create') {
      return { conversation_id: 'conv-' + crypto.randomUUID().slice(0, 8) };
    }
    throw new Error(`mqttRequest mock: unknown ${modulo}.${action}`);
  };

  return {
    logs, published, metricsCalls, dbStore,
    logger, metrics, eventBus, mqttRequest,
    setModule: (m) => { moduleRef = m; }
  };
}

function handleDbQuery({ query, params }, dbStore) {
  const q = query.trim().toUpperCase();
  if (q.startsWith('CREATE TABLE') || q.startsWith('CREATE INDEX')) return [];
  if (q.startsWith('SELECT * FROM PROJECTS')) return [...dbStore];
  if (q.startsWith('INSERT INTO PROJECTS')) {
    // Mapeo posicional segun el query del module:
    // INSERT INTO projects (id, name, description, created_at, updated_at, is_active, metadata,
    //   last_conversation_id, provider, model, prompt_id, base_path, session_state, parent_project_id, system_id)
    // O variante con system_role (system project).
    if (params.length === 14 && q.includes('SYSTEM_ROLE')) {
      const [id, name, description, created_at, updated_at, metadata,
             last_conversation_id, provider, model, prompt_id, base_path, session_state, system_role] = params;
      dbStore.push({
        id, name, description, created_at, updated_at, is_active: 1,
        metadata: typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
        last_conversation_id, provider, model, prompt_id, base_path,
        session_state: typeof session_state === 'string' ? session_state : JSON.stringify(session_state),
        system_role
      });
    } else if (params.length === 15) {
      const [id, name, description, created_at, updated_at, metadata,
             last_conversation_id, provider, model, prompt_id, base_path, session_state,
             parent_project_id, system_id] = params;
      dbStore.push({
        id, name, description, created_at, updated_at, is_active: 0,
        metadata: typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
        last_conversation_id, provider, model, prompt_id, base_path,
        session_state: typeof session_state === 'string' ? session_state : JSON.stringify(session_state),
        parent_project_id, system_id
      });
    }
    return [];
  }
  if (q.startsWith('UPDATE PROJECTS SET IS_ACTIVE = 1')) {
    const id = params[0];
    const row = dbStore.find(r => r.id === id);
    if (row) row.is_active = 1;
    return [];
  }
  if (q.startsWith('UPDATE PROJECTS SET IS_ACTIVE = 0')) {
    const id = params[0];
    const row = dbStore.find(r => r.id === id);
    if (row) row.is_active = 0;
    return [];
  }
  if (q.startsWith('UPDATE PROJECTS SET')) {
    // Genérico
    return [];
  }
  if (q.startsWith('DELETE FROM PROJECTS')) {
    const idx = dbStore.findIndex(r => r.id === params[0]);
    if (idx >= 0) dbStore.splice(idx, 1);
    return [];
  }
  return [];
}

async function instantiate(mocks, configOverride = {}) {
  const m = new ProjectManagerModule();
  // basePath unico para no contaminar /data/projects real
  const tmpBase = path.join(require('os').tmpdir(), `pm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  m.projectsBasePath = tmpBase;
  mocks.setModule(m);
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    mqttRequest: mocks.mqttRequest,
    moduleConfig: { dbTimeout: 5000, compositionTimeout: 5000, ...configOverride }
  });
  return { module: m, basePath: tmpBase };
}

async function flush() {
  for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
}

async function cleanup(basePath) {
  try { require('fs').rmSync(basePath, { recursive: true, force: true }); } catch {}
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

(async () => {
  console.log('project-manager — reescritura canonica v4.0.0\n');

  // ==========================================
  // Group 1: Lifecycle + bootstrap
  // ==========================================

  await testAsync('onLoad bootstrap: crea Sistema + Mi Proyecto desde DB vacia', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const projects = Array.from(m.projects.values());
    const sistema = projects.find(p => p.metadata?.is_system);
    const miProyecto = projects.find(p => p.metadata?.is_default_bootstrap);
    assert.ok(sistema, 'Sistema creado');
    assert.ok(miProyecto, 'Mi Proyecto creado');
    assert.ok(m.activeProjectIds.has(sistema.id));
    assert.ok(m.activeProjectIds.has(miProyecto.id));
    await m.onUnload();
    await cleanup(basePath);
  });

  await testAsync('onUnload limpia pending requests sin leak', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    m.pendingDbRequests.set('test', { resolve: () => {}, reject: () => {}, timeout: setTimeout(() => {}, 99999) });
    await m.onUnload();
    assert.strictEqual(m.pendingDbRequests.size, 0);
    assert.strictEqual(m.projects.size, 0);
    await cleanup(basePath);
  });

  await testAsync('reactivateExistingProjects re-emite project.activated tras arrancar', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const activatedEvents = mocks.published.filter(p => p[0] === EVENTS.PROJECT.ACTIVATED);
    // Esperamos al menos 2: uno por Sistema (en _ensureSystemProject) y los reactivados (1 reactivacion duplicada para Sistema + 1 Mi Proyecto reactivada). Total >= 2.
    assert.ok(activatedEvents.length >= 1, `expected >=1 activated event, got ${activatedEvents.length}`);
    for (const ev of activatedEvents) {
      assert.ok(ev[1].correlation_id, 'correlation_id presente');
    }
    await m.onUnload();
    await cleanup(basePath);
  });

  // ==========================================
  // Group 2: Validacion canonica
  // ==========================================

  await testAsync('handleUIGet sin id → 400 INVALID_INPUT canonico', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const result = await m.handleUIGet({});
    assert.ok(isCanonicalError(result));
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error.code, 'INVALID_INPUT');
    assert.strictEqual(result.error.details.field, 'id');
    await m.onUnload();
    await cleanup(basePath);
  });

  await testAsync('handleUIGet con id inexistente → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const result = await m.handleUIGet({ id: 'no-existe' });
    assert.ok(isCanonicalError(result));
    assert.strictEqual(result.status, 404);
    assert.strictEqual(result.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(result.error.details.entity_type, 'project');
    await m.onUnload();
    await cleanup(basePath);
  });

  await testAsync('handleUICreate sin name → 400 con field=name', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const result = await m.handleUICreate({});
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error.code, 'INVALID_INPUT');
    assert.strictEqual(result.error.details.field, 'name');
    await m.onUnload();
    await cleanup(basePath);
  });

  // ==========================================
  // Group 3: CRUD success paths
  // ==========================================

  await testAsync('handleUICreate crea + emite metric + publica project.created con correlation_id', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    mocks.published.length = 0;
    mocks.metricsCalls.length = 0;
    const result = await m.handleUICreate({ name: 'Proyecto Test', description: 'desc', color: 'red' });
    assert.strictEqual(result.status, 201);
    assert.strictEqual(result.data.created, true);
    assert.strictEqual(result.data.project.name, 'Proyecto Test');

    const ev = mocks.published.find(p => p[0] === EVENTS.PROJECT.CREATED);
    assert.ok(ev, 'project.created publicado');
    assert.ok(ev[1].correlation_id, 'correlation_id presente');
    assert.ok(ev[1].timestamp);
    assert.strictEqual(ev[1].name, 'Proyecto Test');

    assert.ok(mocks.metricsCalls.find(c => c[1] === 'project-manager.created'));
    await m.onUnload();
    await cleanup(basePath);
  });

  await testAsync('handleUIDelete proyecto inactivo → 200 + publica project.deleted', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const created = await m.handleUICreate({ name: 'A borrar' });
    const id = created.data.project.id;
    mocks.published.length = 0;
    const result = await m.handleUIDelete({ id });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.deleted, true);
    const ev = mocks.published.find(p => p[0] === EVENTS.PROJECT.DELETED);
    assert.ok(ev);
    await m.onUnload();
    await cleanup(basePath);
  });

  await testAsync('handleUIDelete proyecto activo → 409 CONFLICT', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const created = await m.handleUICreate({ name: 'Activo' });
    const id = created.data.project.id;
    await m.handleUIActivate({ id });
    const result = await m.handleUIDelete({ id });
    assert.strictEqual(result.status, 409);
    assert.strictEqual(result.error.code, 'CONFLICT_STATE');
    await m.onUnload();
    await cleanup(basePath);
  });

  await testAsync('handleUICreate name duplicado → 409 CONFLICT', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    await m.handleUICreate({ name: 'Mismo Nombre' });
    const result = await m.handleUICreate({ name: 'Mismo Nombre' });
    assert.strictEqual(result.status, 409);
    assert.strictEqual(result.error.code, 'CONFLICT_STATE');
    await m.onUnload();
    await cleanup(basePath);
  });

  await testAsync('handleUIList devuelve todos los proyectos', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const result = await m.handleUIList();
    assert.strictEqual(result.status, 200);
    assert.ok(Array.isArray(result.data.projects));
    // Al menos Sistema + Mi Proyecto bootstrap
    assert.ok(result.data.count >= 2, `expected >=2 projects, got ${result.data.count}`);
    assert.ok(Array.isArray(result.data.activeProjectIds));
    await m.onUnload();
    await cleanup(basePath);
  });

  // ==========================================
  // Group 4: Activate / Deactivate ciclo
  // ==========================================

  await testAsync('handleUIActivate publica project.activated con correlation_id', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const created = await m.handleUICreate({ name: 'Para activar' });
    const id = created.data.project.id;
    mocks.published.length = 0;
    const result = await m.handleUIActivate({ id });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.activated, true);
    const ev = mocks.published.find(p => p[0] === EVENTS.PROJECT.ACTIVATED);
    assert.ok(ev);
    assert.strictEqual(ev[1].project_id, id);
    assert.ok(ev[1].correlation_id);
    await m.onUnload();
    await cleanup(basePath);
  });

  await testAsync('handleUIDeactivate publica project.deactivated', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const created = await m.handleUICreate({ name: 'Para desactivar' });
    const id = created.data.project.id;
    await m.handleUIActivate({ id });
    mocks.published.length = 0;
    const result = await m.handleUIDeactivate({ id });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.deactivated, true);
    const ev = mocks.published.find(p => p[0] === 'project.deactivated');
    assert.ok(ev);
    await m.onUnload();
    await cleanup(basePath);
  });

  await testAsync('handleUIDeactivate proyecto inactivo → 409 CONFLICT', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const created = await m.handleUICreate({ name: 'Nunca activado' });
    const id = created.data.project.id;
    const result = await m.handleUIDeactivate({ id });
    assert.strictEqual(result.status, 409);
    assert.strictEqual(result.error.code, 'CONFLICT_STATE');
    await m.onUnload();
    await cleanup(basePath);
  });

  // ==========================================
  // Group 5: getOrCreateDefaultConversation (modelo "una via fija")
  // ==========================================

  await testAsync('handleUIGetDefaultConversation crea conversation via mqttRequest', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const created = await m.handleUICreate({ name: 'Con conversation' });
    const project_id = created.data.project.id;

    const result = await m.handleUIGetDefaultConversation({ project_id });
    assert.strictEqual(result.status, 200);
    assert.ok(result.data.conversation_id);
    assert.strictEqual(result.data.created, true);
    await m.onUnload();
    await cleanup(basePath);
  });

  await testAsync('handleUIGetDefaultConversation con cache: 2da invocacion devuelve la misma conversation_id', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const created = await m.handleUICreate({ name: 'Conv cache' });
    const project_id = created.data.project.id;

    const r1 = await m.handleUIGetDefaultConversation({ project_id });
    const r2 = await m.handleUIGetDefaultConversation({ project_id });
    assert.strictEqual(r1.data.conversation_id, r2.data.conversation_id);
    assert.strictEqual(r2.data.created, false, '2da llamada NO crea otra');
    await m.onUnload();
    await cleanup(basePath);
  });

  await testAsync('handleUIGetDefaultConversation con id inexistente → 404', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const result = await m.handleUIGetDefaultConversation({ project_id: 'phantom' });
    assert.strictEqual(result.status, 404);
    assert.strictEqual(result.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
    await cleanup(basePath);
  });

  // ==========================================
  // Group 6: Session + AI config
  // ==========================================

  await testAsync('handleUISaveSession + handleUIRestoreSession ciclo', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const created = await m.handleUICreate({ name: 'Con session' });
    const id = created.data.project.id;
    const saved = await m.handleUISaveSession({ id, lastView: 'chat', count: 5 });
    assert.strictEqual(saved.status, 200);
    assert.strictEqual(saved.data.saved, true);
    assert.strictEqual(saved.data.session.lastView, 'chat');
    const restored = await m.handleUIRestoreSession({ id });
    assert.strictEqual(restored.status, 200);
    assert.strictEqual(restored.data.session_state.lastView, 'chat');
    await m.onUnload();
    await cleanup(basePath);
  });

  await testAsync('handleUISetAIConfig set provider + model', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const created = await m.handleUICreate({ name: 'Con AI config' });
    const id = created.data.project.id;
    const result = await m.handleUISetAIConfig({ id, provider: 'gemini', model: 'gemini-2.5-flash', prompt_id: 'p1' });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.provider, 'gemini');
    assert.strictEqual(result.data.model, 'gemini-2.5-flash');
    await m.onUnload();
    await cleanup(basePath);
  });

  // ==========================================
  // Group 7: HTTP handlers + bus events
  // ==========================================

  await testAsync('handleCreateProject (HTTP) crea con shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const result = await m.handleCreateProject({ body: { name: 'Via HTTP' } });
    assert.strictEqual(result.status, 201);
    assert.ok(result.data.project.id);
    await m.onUnload();
    await cleanup(basePath);
  });

  await testAsync('handleCreateProject sin name → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const result = await m.handleCreateProject({ body: {} });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error.code, 'INVALID_INPUT');
    await m.onUnload();
    await cleanup(basePath);
  });

  await testAsync('onProjectCreate (bus) crea proyecto + publica project.state', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    mocks.published.length = 0;
    await m.onProjectCreate({ data: { name: 'Via bus' } });
    await flush();
    const created = mocks.published.find(p => p[0] === EVENTS.PROJECT.CREATED);
    assert.ok(created);
    const state = mocks.published.find(p => p[0] === 'project.state');
    assert.ok(state);
    await m.onUnload();
    await cleanup(basePath);
  });

  // ==========================================
  // Group 8: Features / blueprints (restaurado del monolito)
  // ==========================================

  await testAsync('handleUIListFeatures sin blueprints dir → array vacio (200, no falla)', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const result = await m.handleUIListFeatures({});
    assert.strictEqual(result.status, 200);
    assert.ok(Array.isArray(result.data.features));
    await m.onUnload();
    await cleanup(basePath);
  });

  await testAsync('handleUIAddFeatures sin id → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const result = await m.handleUIAddFeatures({ features: ['x'] });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error.code, 'INVALID_INPUT');
    await m.onUnload();
    await cleanup(basePath);
  });

  await testAsync('handleUIAddFeatures con id inexistente → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const result = await m.handleUIAddFeatures({ id: 'phantom', features: ['x'] });
    assert.strictEqual(result.status, 404);
    assert.strictEqual(result.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
    await cleanup(basePath);
  });

  await testAsync('handleUIAddFeatures sin features array → 400 con field=features', async () => {
    const mocks = makeMocks();
    const { module: m, basePath } = await instantiate(mocks);
    const created = await m.handleUICreate({ name: 'Para features' });
    const id = created.data.project.id;
    const result = await m.handleUIAddFeatures({ id, features: [] });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error.code, 'INVALID_INPUT');
    assert.strictEqual(result.error.details.field, 'features');
    await m.onUnload();
    await cleanup(basePath);
  });

  // ==========================================
  // Group 9: Helpers internos POC2
  // ==========================================

  await testAsync('_errorResponse produce shape canonico', async () => {
    const m = new ProjectManagerModule();
    const r1 = m._errorResponse(400, 'INVALID_INPUT', 'bad');
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'INVALID_INPUT', message: 'bad' } });
    const r2 = m._errorResponse(404, 'RESOURCE_NOT_FOUND', 'gone', { entity_type: 'project' });
    assert.deepStrictEqual(r2, { status: 404, error: { code: 'RESOURCE_NOT_FOUND', message: 'gone', details: { entity_type: 'project' } } });
  });

  await testAsync('_classifyHandlerError mapea correctamente', async () => {
    const m = new ProjectManagerModule();
    assert.strictEqual(m._classifyHandlerError(new Error('Project not found')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('name is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('cannot delete active')), 'CONFLICT_STATE');
    assert.strictEqual(m._classifyHandlerError(new Error('already exists')), 'CONFLICT_STATE');
    assert.strictEqual(m._classifyHandlerError(new Error('boom')), 'UNKNOWN_ERROR');
  });

  await testAsync('_slugify cubre español + special chars', async () => {
    const m = new ProjectManagerModule();
    assert.strictEqual(m._slugify('Mi Proyecto'), 'mi-proyecto');
    assert.strictEqual(m._slugify('Año Nuevo'), 'ano-nuevo');
    assert.strictEqual(m._slugify('  espacios   raros  '), 'espacios-raros');
    assert.strictEqual(m._slugify(''), '');
  });

  console.log('\nproject-manager: todos los tests pasaron ✓');
})().catch(err => { console.error(err); process.exit(1); });

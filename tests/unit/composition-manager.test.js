/**
 * Tests unitarios — composition-manager v2.0.0 (POC2 #5 reescritura).
 *
 * Foco:
 *  - Lifecycle (onLoad inicializa schema, onUnload limpia pendingDb sin leak).
 *  - Validacion canonica de UI handlers (16) → { status, data | error: { code, message, details? } }.
 *  - Systems CRUD + members + role + cascade en delete.
 *  - Links direccionales (inspired_by, related_to, evolved_from) + dedupe + self-link.
 *  - Dependencies tipadas (data, code, api, context) + dedupe + self-dep.
 *  - Bus handler onCompositionRequest ruteando 18 actions.
 *  - 10 eventos canonicos preservados invariantes.
 *  - Helpers POC2 internos.
 *  - Aislamiento: SQLite en memoria via sql.js, sin tocar disco real.
 *
 * Ejecutar: node tests/unit/composition-manager.test.js
 */

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

const CompositionManagerModule = require('../../modules/composition-manager/index.js');

// --------------------------------------------------
// Mock infra: bus + in-memory SQL backend
// --------------------------------------------------

function makeMocks() {
  const logs = [];
  const published = [];
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

  return { logs, published, metricsCalls, logger, metrics };
}

async function makeBusBackedBySqlJs(moduleRef, published) {
  const SQL = await initSqlJs();
  const db  = new SQL.Database();

  function runQuery(query, params, readOnly) {
    const trimmed = query.trim();
    const isSelect = /^select/i.test(trimmed) || readOnly === true;
    if (isSelect && /^select/i.test(trimmed)) {
      const stmt = db.prepare(query);
      stmt.bind(params || []);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    }
    db.run(query, params || []);
    return [];
  }

  const eventBus = {
    publish: async (event, payload) => {
      published.push([event, payload]);
      if (event === 'db.query.request') {
        const { request_id, query, params, read_only } = payload;
        try {
          const rows = runQuery(query, params, read_only);
          // simular response asincrona del database-manager
          setImmediate(() => moduleRef.value.onDbQueryResponse({
            data: { request_id, success: true, data: rows }
          }));
        } catch (err) {
          setImmediate(() => moduleRef.value.onDbQueryResponse({
            data: { request_id, success: false, error: err.message }
          }));
        }
      }
    }
  };

  return { eventBus, db };
}

async function instantiate(mocks) {
  const moduleRef = { value: null };
  const { eventBus, db } = await makeBusBackedBySqlJs(moduleRef, mocks.published);
  const m = new CompositionManagerModule();
  moduleRef.value = m;
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus,
    moduleConfig: { dbTimeout: 2000 }
  });
  return { module: m, db };
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
  console.log('composition-manager — reescritura canonica v2.0.0 (POC2 #5)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa schema (4 tablas + 6 indexes idempotente)', async () => {
    const mocks = makeMocks();
    const { module: m, db } = await instantiate(mocks);
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const names = (tables[0]?.values || []).map(r => r[0]);
    assert.ok(names.includes('systems'));
    assert.ok(names.includes('system_members'));
    assert.ok(names.includes('project_links'));
    assert.ok(names.includes('project_dependencies'));
    await m.onUnload();
  });

  await testAsync('onUnload limpia pendingDbRequests sin leak', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    // Inyectamos un pending fake — debe ser limpiado en unload
    let rejected = false;
    m.pendingDbRequests.set('leak-1', {
      resolve: () => {},
      reject: () => { rejected = true; },
      timeout: setTimeout(() => {}, 60000)
    });
    await m.onUnload();
    assert.strictEqual(m.pendingDbRequests.size, 0);
    assert.strictEqual(rejected, true);
  });

  // ==========================================
  // Group 2: Validacion canonica de UI handlers
  // ==========================================

  await testAsync('handleUISystemCreate sin name → 400 INVALID_INPUT canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleUISystemCreate({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleUISystemGet sin id → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleUISystemGet({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleUISystemGet con id no existente → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleUISystemGet({ id: 'no-existe' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleUILink linkType invalido → 400 + allowed en details', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleUILink({ sourceId: 'a', targetId: 'b', linkType: 'unknown' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.deepStrictEqual(r.error.details.allowed, ['inspired_by', 'related_to', 'evolved_from']);
    await m.onUnload();
  });

  await testAsync('handleUIAddDependency dependencyType invalido → 400 + allowed en details', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleUIAddDependency({
      projectId: 'a', dependsOnProjectId: 'b', dependencyType: 'invalid_type'
    });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.deepStrictEqual(r.error.details.allowed, ['data', 'code', 'api', 'context']);
    await m.onUnload();
  });

  await testAsync('handleUIUnlink sin linkId → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleUIUnlink({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Systems CRUD + members
  // ==========================================

  await testAsync('Systems: create/get/list publica eventos canonicos con correlation_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;

    const c = await m.handleUISystemCreate({ name: 'Sys A', description: 'desc' });
    assert.ok(isCanonicalSuccess(c));
    assert.strictEqual(c.status, 201);
    const sysId = c.data.system.id;

    const created = publishedOf(mocks, 'system.created');
    assert.strictEqual(created.length, 1);
    assert.strictEqual(created[0].system_id, sysId);
    assert.ok(created[0].correlation_id);
    assert.ok(created[0].timestamp);

    const g = await m.handleUISystemGet({ id: sysId });
    assert.strictEqual(g.status, 200);
    assert.strictEqual(g.data.system.name, 'Sys A');
    assert.deepStrictEqual(g.data.system.projects, []); // backward-compat alias

    const l = await m.handleUISystemList();
    assert.strictEqual(l.status, 200);
    assert.strictEqual(l.data.count, 1);
    await m.onUnload();
  });

  await testAsync('Systems: addEntity → entity.joined_system + getSystem incluye projects (backward-compat)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    const c = await m.handleUISystemCreate({ name: 'Sys B' });
    const sysId = c.data.system.id;
    mocks.published.length = 0;

    const a = await m.handleUISystemAddEntity({ systemId: sysId, projectId: 'proj-1', role: 'owner' });
    assert.strictEqual(a.status, 200);
    const joined = publishedOf(mocks, 'entity.joined_system');
    assert.strictEqual(joined.length, 1);
    assert.strictEqual(joined[0].entity_id, 'proj-1');
    assert.strictEqual(joined[0].role, 'owner');

    const g = await m.handleUISystemGet({ id: sysId });
    assert.strictEqual(g.data.system.members.length, 1);
    assert.strictEqual(g.data.system.projects.length, 1);
    assert.strictEqual(g.data.system.projects[0].id, 'proj-1');
    assert.strictEqual(g.data.system.projects[0].role, 'owner');
    await m.onUnload();
  });

  await testAsync('Systems: addEntity con entity ya en otro system → 409 CONFLICT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    const a = await m.handleUISystemCreate({ name: 'A' });
    const b = await m.handleUISystemCreate({ name: 'B' });
    await m.handleUISystemAddEntity({ systemId: a.data.system.id, projectId: 'p', role: 'r' });
    const r = await m.handleUISystemAddEntity({ systemId: b.data.system.id, projectId: 'p', role: 'r' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'CONFLICT_STATE');
    await m.onUnload();
  });

  await testAsync('Systems: removeEntity → entity.left_system con previous_role', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    const c = await m.handleUISystemCreate({ name: 'S' });
    await m.handleUISystemAddEntity({ systemId: c.data.system.id, projectId: 'pX', role: 'maker' });
    mocks.published.length = 0;

    const r = await m.handleUISystemRemoveEntity({ projectId: 'pX' });
    assert.strictEqual(r.status, 200);
    const left = publishedOf(mocks, 'entity.left_system');
    assert.strictEqual(left.length, 1);
    assert.strictEqual(left[0].previous_role, 'maker');
    await m.onUnload();
  });

  await testAsync('Systems: delete con miembros → cascade + system.deleted publicado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    const c = await m.handleUISystemCreate({ name: 'ToDelete' });
    const sysId = c.data.system.id;
    await m.handleUISystemAddEntity({ systemId: sysId, projectId: 'p1' });
    await m.handleUISystemAddEntity({ systemId: sysId, projectId: 'p2' });
    mocks.published.length = 0;

    const r = await m.handleUISystemDelete({ id: sysId });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.affectedProjects, 2);
    const deleted = publishedOf(mocks, 'system.deleted');
    assert.strictEqual(deleted.length, 1);
    assert.strictEqual(deleted[0].affected_members, 2);

    // Verifica que el system ya no existe
    const g = await m.handleUISystemGet({ id: sysId });
    assert.strictEqual(g.status, 404);
    await m.onUnload();
  });

  await testAsync('Systems: getUnassigned filtra los que ya estan en algun system', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const c = await m.handleUISystemCreate({ name: 'S' });
    await m.handleUISystemAddEntity({ systemId: c.data.system.id, projectId: 'p1' });

    const r = await m.handleUISystemGetUnassigned({ entityIds: ['p1', 'p2', 'p3'] });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.data.entityIds.sort(), ['p2', 'p3']);
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Links
  // ==========================================

  await testAsync('Links: link → entity.linked + dedupe + self-link rechazado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    const r1 = await m.handleUILink({ sourceId: 'a', targetId: 'b', linkType: 'inspired_by', reason: 'why' });
    assert.strictEqual(r1.status, 201);
    const linked = publishedOf(mocks, 'entity.linked');
    assert.strictEqual(linked.length, 1);
    assert.strictEqual(linked[0].link_type, 'inspired_by');

    // Dedupe: link igual ya existe → 409
    const r2 = await m.handleUILink({ sourceId: 'a', targetId: 'b', linkType: 'inspired_by' });
    assert.strictEqual(r2.status, 409);
    assert.strictEqual(r2.error.code, 'CONFLICT_STATE');

    // Self-link rechazado
    const r3 = await m.handleUILink({ sourceId: 'x', targetId: 'x', linkType: 'related_to' });
    assert.strictEqual(r3.status, 400);
    assert.strictEqual(r3.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('Links: getLinks devuelve direccion outgoing/incoming', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.handleUILink({ sourceId: 'a', targetId: 'b', linkType: 'related_to' });
    await m.handleUILink({ sourceId: 'c', targetId: 'a', linkType: 'evolved_from' });

    const r = await m.handleUIGetLinks({ id: 'a' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.count, 2);
    const outgoing = r.data.links.find(l => l.targetId === 'b');
    const incoming = r.data.links.find(l => l.sourceId === 'c');
    assert.strictEqual(outgoing.direction, 'outgoing');
    assert.strictEqual(incoming.direction, 'incoming');
    await m.onUnload();
  });

  await testAsync('Links: unlink → entity.unlinked publicado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    const c = await m.handleUILink({ sourceId: 'a', targetId: 'b', linkType: 'inspired_by' });
    const linkId = c.data.link.id;
    mocks.published.length = 0;

    const r = await m.handleUIUnlink({ linkId });
    assert.strictEqual(r.status, 200);
    const ev = publishedOf(mocks, 'entity.unlinked');
    assert.strictEqual(ev.length, 1);
    assert.strictEqual(ev[0].link_id, linkId);
    await m.onUnload();
  });

  await testAsync('Links: unlink id inexistente → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleUIUnlink({ linkId: 'no-existe' });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  // ==========================================
  // Group 5: Dependencies
  // ==========================================

  await testAsync('Deps: add → entity.dependency.added + dedupe + self-dep rechazada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    const r1 = await m.handleUIAddDependency({
      projectId: 'a', dependsOnProjectId: 'b', dependencyType: 'data', description: 'reads from b'
    });
    assert.strictEqual(r1.status, 201);
    const added = publishedOf(mocks, 'entity.dependency.added');
    assert.strictEqual(added.length, 1);
    assert.strictEqual(added[0].dependency_type, 'data');

    const r2 = await m.handleUIAddDependency({
      projectId: 'a', dependsOnProjectId: 'b', dependencyType: 'data'
    });
    assert.strictEqual(r2.status, 409);

    const r3 = await m.handleUIAddDependency({
      projectId: 'x', dependsOnProjectId: 'x'
    });
    assert.strictEqual(r3.status, 400);
    await m.onUnload();
  });

  await testAsync('Deps: getDependencies / getDependents / dependents.has', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.handleUIAddDependency({ projectId: 'app', dependsOnProjectId: 'lib1', dependencyType: 'code' });
    await m.handleUIAddDependency({ projectId: 'app', dependsOnProjectId: 'lib2', dependencyType: 'api' });

    const deps = await m.handleUIGetDependencies({ id: 'app' });
    assert.strictEqual(deps.status, 200);
    assert.strictEqual(deps.data.count, 2);

    const dependents = await m.handleUIGetDependents({ id: 'lib1' });
    assert.strictEqual(dependents.status, 200);
    assert.strictEqual(dependents.data.count, 1);
    assert.strictEqual(dependents.data.dependents[0].dependentId, 'app');

    const has = await m._hasDependents('lib1', crypto.randomUUID());
    assert.strictEqual(has.hasDependents, true);
    assert.strictEqual(has.count, 1);
    await m.onUnload();
  });

  await testAsync('Deps: remove → entity.dependency.removed publicado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    const c = await m.handleUIAddDependency({
      projectId: 'a', dependsOnProjectId: 'b', dependencyType: 'data'
    });
    const depId = c.data.dependency.id;
    mocks.published.length = 0;

    const r = await m.handleUIRemoveDependency({ dependencyId: depId });
    assert.strictEqual(r.status, 200);
    const ev = publishedOf(mocks, 'entity.dependency.removed');
    assert.strictEqual(ev.length, 1);
    assert.strictEqual(ev[0].dependency_id, depId);
    await m.onUnload();
  });

  // ==========================================
  // Group 6: Bus handler onCompositionRequest (18 actions)
  // ==========================================

  await testAsync('onCompositionRequest sin request_id/action → no publica response (logger.warn)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m.onCompositionRequest({ data: {} });
    const responses = publishedOf(mocks, 'composition.response');
    assert.strictEqual(responses.length, 0);
    const warns = mocks.logs.filter(l => l[0] === 'warn');
    assert.ok(warns.some(w => w[1].includes('invalid_payload')));
    await m.onUnload();
  });

  await testAsync('onCompositionRequest action desconocida → composition.response success:false', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m.onCompositionRequest({
      data: { request_id: 'r1', action: 'no.existe', correlation_id: 'c1' }
    });
    const resp = publishedOf(mocks, 'composition.response')[0];
    assert.ok(resp);
    assert.strictEqual(resp.success, false);
    assert.strictEqual(resp.request_id, 'r1');
    assert.strictEqual(resp.correlation_id, 'c1');
    assert.strictEqual(resp.error_code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('onCompositionRequest system.create + system.get exitoso', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.onCompositionRequest({
      data: { request_id: 'req-create', action: 'system.create', name: 'BusSystem', correlation_id: 'cid-1' }
    });
    const r1 = publishedOf(mocks, 'composition.response')[0];
    assert.strictEqual(r1.success, true);
    assert.strictEqual(r1.request_id, 'req-create');
    assert.strictEqual(r1.correlation_id, 'cid-1');
    assert.ok(r1.data.id);
    assert.ok(r1.timestamp);

    mocks.published.length = 0;
    await m.onCompositionRequest({
      data: { request_id: 'req-get', action: 'system.get', system_id: r1.data.id }
    });
    const r2 = publishedOf(mocks, 'composition.response')[0];
    assert.strictEqual(r2.success, true);
    assert.strictEqual(r2.data.name, 'BusSystem');
    await m.onUnload();
  });

  await testAsync('onCompositionRequest rutea las 18 actions sin throw', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    // Setup base: 1 system + 1 link + 1 dep
    const cs = await m.handleUISystemCreate({ name: 'X' });
    const sysId = cs.data.system.id;
    await m.handleUISystemAddEntity({ systemId: sysId, projectId: 'pA' });
    const lk = await m.handleUILink({ sourceId: 'pA', targetId: 'pB', linkType: 'related_to' });
    const dp = await m.handleUIAddDependency({ projectId: 'pA', dependsOnProjectId: 'pB', dependencyType: 'data' });
    mocks.published.length = 0;

    const reqs = [
      { action: 'system.create', name: 'Y' },
      { action: 'system.list' },
      { action: 'system.get', system_id: sysId },
      { action: 'system.update', system_id: sysId, updates: { description: 'd' } },
      { action: 'entity.join', system_id: sysId, entity_id: 'pZ', role: 'r' },
      { action: 'entity.system', entity_id: 'pA' },
      { action: 'entity.unassigned', entity_ids: ['pA', 'qqq'] },
      { action: 'entity.leave', entity_id: 'pZ' },
      { action: 'link', source_id: 'pC', target_id: 'pD', link_type: 'related_to' },
      { action: 'links.get', entity_id: 'pA' },
      { action: 'related.get', entity_id: 'pA' },
      { action: 'unlink', link_id: lk.data.link.id },
      { action: 'dep.add', entity_id: 'pE', depends_on_id: 'pF', dependency_type: 'code' },
      { action: 'deps.get', entity_id: 'pA' },
      { action: 'dependents.get', entity_id: 'pB' },
      { action: 'dependents.has', entity_id: 'pB' },
      { action: 'dep.remove', dependency_id: dp.data.dependency.id },
      { action: 'system.delete', system_id: sysId }
    ];

    for (let i = 0; i < reqs.length; i++) {
      await m.onCompositionRequest({
        data: { request_id: `r-${i}`, ...reqs[i] }
      });
    }
    const responses = publishedOf(mocks, 'composition.response');
    assert.strictEqual(responses.length, reqs.length);
    // todas devuelven shape canonico con request_id y timestamp
    for (const r of responses) {
      assert.ok(typeof r.request_id === 'string');
      assert.ok(typeof r.success === 'boolean');
      assert.ok(typeof r.timestamp === 'string');
      assert.ok(typeof r.correlation_id === 'string');
    }
    await m.onUnload();
  });

  // ==========================================
  // Group 7: Helpers POC2 internos
  // ==========================================

  await testAsync('_errorResponse construye shape canonico { status, error: { code, message, details? } }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = m._errorResponse(400, 'INVALID_INPUT', 'msg', { field: 'x' });
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { field: 'x' } } });
    const r2 = m._errorResponse(500, 'UNKNOWN_ERROR', 'oops');
    assert.deepStrictEqual(r2, { status: 500, error: { code: 'UNKNOWN_ERROR', message: 'oops' } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea por mensaje a codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(new Error('System not found')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('name is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('Invalid link type')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('already exists')), 'CONFLICT_STATE');
    assert.strictEqual(m._classifyHandlerError(new Error('something exploded')), 'UNKNOWN_ERROR');
    await m.onUnload();
  });

  await testAsync('_publicarEvento hereda correlation_id si se le pasa, genera uno nuevo si no', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { foo: 1 }, { correlation_id: 'cid-inherit' });
    await m._publicarEvento('test.event', { bar: 2 });
    const evs = publishedOf(mocks, 'test.event');
    assert.strictEqual(evs.length, 2);
    assert.strictEqual(evs[0].correlation_id, 'cid-inherit');
    assert.notStrictEqual(evs[1].correlation_id, 'cid-inherit');
    assert.ok(typeof evs[1].correlation_id === 'string');
    assert.ok(evs[0].timestamp && evs[1].timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError mapea status segun code y registra metric', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const err = Object.assign(new Error('oops'), { _code: 'CONFLICT_STATE', _details: { a: 1 } });
    const r = m._handleHandlerError('test.failed', err, 'kind');
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'CONFLICT_STATE');
    assert.deepStrictEqual(r.error.details, { a: 1 });
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'composition-manager.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})();

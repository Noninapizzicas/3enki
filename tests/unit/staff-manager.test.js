/**
 * Tests unitarios — staff-manager (POC2 reescritura).
 *
 * Mocks: EmployeeRegistry, SessionManager, NFCCard, sql.js via require cache.
 *
 * Ejecutar: node tests/unit/staff-manager.test.js
 */

'use strict';

const assert = require('assert');

// --------------------------------------------------
// Mock infra — interceptar require ANTES de cargar el modulo
// --------------------------------------------------

const REGISTRY_PATH = require.resolve('../../modules/staff-manager/lib/employee-registry');
const SESSION_PATH  = require.resolve('../../modules/staff-manager/lib/session-manager');
const NFC_PATH      = require.resolve('../../modules/staff-manager/lib/nfc-card');
const SQLJS_PATH    = require.resolve('sql.js');

let registryStore;
let registryShouldFailUpdate;

class MockEmployeeRegistry {
  constructor(opts) { this.opts = opts; }
  async initialize() {}
  async close() {}
  createEmployee({ name, role, pin }) {
    const id = `emp-${registryStore.size + 1}`;
    const emp = { id, name, role, pin: pin || null, active: true };
    registryStore.set(id, emp);
    return emp;
  }
  listEmployees({ active_only } = {}) {
    const all = Array.from(registryStore.values());
    return active_only ? all.filter(e => e.active) : all;
  }
  getEmployee(id) { return registryStore.get(id) || null; }
  updateEmployee(id, patch) {
    if (registryShouldFailUpdate) throw new Error('Empleado no encontrado');
    const e = registryStore.get(id);
    if (!e) throw new Error('Empleado no encontrado');
    Object.assign(e, patch);
    registryStore.set(id, e);
    return e;
  }
  deleteEmployee(id) {
    const e = registryStore.get(id);
    if (!e) return false;
    e.active = false;
    return true;
  }
}

let activeSessions, sessionsByEmployee, staleSessions, sessionsByDate;
let onSessionEventRef;
let managerCloseShouldReturn;

class MockSessionManager {
  constructor(opts) {
    this.opts            = opts;
    this.maxShiftHours   = opts.maxShiftHours;
    onSessionEventRef    = opts.onSessionEvent;
  }
  async initialize() {}
  async close() {}
  async tapIn({ employee_id, device_id }) {
    const session = { id: 's-1', employee_id, device_id, opened_at: '2025-01-15T08:00:00Z', state: 'open' };
    activeSessions.push(session);
    if (onSessionEventRef) await onSessionEventRef('tap_in', { session, employee_id });
    return { session, action: 'opened' };
  }
  async tapOut({ employee_id }) {
    const idx = activeSessions.findIndex(s => s.employee_id === employee_id);
    const session = idx >= 0 ? activeSessions.splice(idx, 1)[0] : null;
    if (session) {
      session.state = 'closed';
      session.closed_at = '2025-01-15T16:00:00Z';
      if (onSessionEventRef) await onSessionEventRef('tap_out', { session, employee_id });
    }
    return { session, action: 'closed' };
  }
  listActiveSessions() { return [...activeSessions]; }
  listSessionsByEmployee(eid) { return sessionsByEmployee.filter(s => s.employee_id === eid); }
  listSessionsByDate(_day) { return [...sessionsByDate]; }
  listStaleSessions() { return [...staleSessions]; }
  async managerClose(employee_id) {
    if (managerCloseShouldReturn === null) return null;
    const session = managerCloseShouldReturn || { id: 's-mc', employee_id, state: 'closed', close_reason: 'manager' };
    if (onSessionEventRef) await onSessionEventRef('manager_close', { session, employee_id });
    return session;
  }
}

const NFCCardMock = {
  generateEmployeeCard: (emp) => ({ kind: 'employee', employee_id: emp.id, name: emp.name }),
  generateCoreInfoTag: ({ core_id, endpoint, publicKeyPEM }) => ({ kind: 'core', core_id, endpoint, publicKeyPEM }),
  parsePayload: (raw) => {
    if (typeof raw === 'string') {
      if (raw === '__BAD__') throw new Error('payload invalido');
      return JSON.parse(raw);
    }
    return raw;
  },
  serialize: (p) => JSON.stringify(p),
  byteSize: (p) => JSON.stringify(p).length
};

const sqljsMock = async () => ({});

require.cache[REGISTRY_PATH] = { exports: MockEmployeeRegistry, id: REGISTRY_PATH, filename: REGISTRY_PATH, loaded: true };
require.cache[SESSION_PATH]  = { exports: MockSessionManager,   id: SESSION_PATH,  filename: SESSION_PATH,  loaded: true };
require.cache[NFC_PATH]      = { exports: NFCCardMock,          id: NFC_PATH,      filename: NFC_PATH,      loaded: true };
require.cache[SQLJS_PATH]    = { exports: sqljsMock,            id: SQLJS_PATH,    filename: SQLJS_PATH,    loaded: true };

delete require.cache[require.resolve('../../modules/staff-manager/index.js')];
const StaffManagerModule = require('../../modules/staff-manager/index.js');

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

  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

async function instantiate(mocks, opts = {}) {
  registryStore             = new Map();
  registryShouldFailUpdate  = false;
  activeSessions            = [];
  sessionsByEmployee        = [];
  sessionsByDate            = [];
  staleSessions             = [];
  managerCloseShouldReturn  = undefined;

  const m = new StaffManagerModule();
  const core = {
    logger:   mocks.logger,
    metrics:  mocks.metrics,
    eventBus: mocks.eventBus,
    config:   {
      staff: { dataPath: '/tmp/staff-test', maxShiftHours: opts.maxShiftHours ?? 16 },
      core:  { id: 'event-core-test' },
      http:  { host: '127.0.0.1' },
      mqtt:  { broker: { port: 1883 } }
    },
    moduleLoader: opts.moduleLoader
  };
  await m.onLoad(core);
  return { module: m, core };
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
  console.log('staff-manager — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa registry + sessions + lee config.staff', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { maxShiftHours: 12 });
    assert.strictEqual(m.name, 'staff-manager');
    assert.strictEqual(m.version, '2.1.0');
    assert.ok(m.registry);
    assert.ok(m.sessions);
    assert.strictEqual(m.maxShiftHours, 12);
    await m.onUnload();
  });

  await testAsync('onUnload limpia referencias y cierra sub-libs', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onUnload();
    assert.strictEqual(m.registry, null);
    assert.strictEqual(m.sessions, null);
    assert.strictEqual(m.core, null);
  });

  // ==========================================
  // Group 2: Validacion canonica
  // ==========================================

  await testAsync('handleEmployeeCreate sin name/role → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleEmployeeCreate({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.deepStrictEqual(r.error.details.fields, ['name', 'role']);
    await m.onUnload();
  });

  await testAsync('handlers que requieren id/employee_id sin args → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    for (const fn of ['handleEmployeeGet', 'handleEmployeeUpdate', 'handleEmployeeDelete', 'handleTapIn', 'handleTapOut', 'handleManagerClose', 'handleNfcEmployeeCard', 'handleNfcParse']) {
      const r = await m[fn]({});
      assert.ok(isCanonicalError(r), `${fn} debe devolver shape canonico`);
      assert.strictEqual(r.error.code, 'INVALID_INPUT', `${fn} code`);
    }
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Empleados CRUD success
  // ==========================================

  await testAsync('handleEmployeeCreate persiste y devuelve 201', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleEmployeeCreate({ name: 'Alice', role: 'cajero', pin: '1234' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.employee.name, 'Alice');
    assert.strictEqual(r.data.employee.active, true);
    await m.onUnload();
  });

  await testAsync('handleEmployeeGet existente → 200, inexistente → 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const created = await m.handleEmployeeCreate({ name: 'Bob', role: 'cocina' });
    const r1 = await m.handleEmployeeGet({ id: created.data.employee.id });
    assert.ok(isCanonicalSuccess(r1));
    assert.strictEqual(r1.data.employee.name, 'Bob');

    const r2 = await m.handleEmployeeGet({ id: 'fantasma' });
    assert.ok(isCanonicalError(r2));
    assert.strictEqual(r2.status, 404);
    assert.strictEqual(r2.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(r2.error.details.entity_type, 'employee');
    await m.onUnload();
  });

  await testAsync('handleEmployeeDelete inexistente → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleEmployeeDelete({ id: 'fantasma' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    await m.onUnload();
  });

  await testAsync('handleEmployeeUpdate cuando registry lanza "no encontrado" → 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    registryShouldFailUpdate = true;
    const r = await m.handleEmployeeUpdate({ id: 'X', name: 'Y' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Sesiones — tap_in/tap_out emiten via publish (NO emit)
  // ==========================================

  await testAsync('handleTapIn success emite staff.session.tap_in con correlation_id + project_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const created = await m.handleEmployeeCreate({ name: 'Alice', role: 'cajero' });
    mocks.published.length = 0;

    const r = await m.handleTapIn({ employee_id: created.data.employee.id, device_id: 'tab-1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);

    const evs = publishedOf(mocks, 'staff.session.tap_in');
    assert.strictEqual(evs.length, 1);
    assert.ok(evs[0].correlation_id);
    assert.strictEqual(evs[0].project_id, 'default');
    assert.ok(evs[0].timestamp);
    assert.strictEqual(evs[0].type, 'tap_in');
    assert.strictEqual(evs[0].module, 'staff-manager');

    assert.ok(mocks.metricsCalls.some(c => c[1] === 'staff.tap_in.count'));
    await m.onUnload();
  });

  await testAsync('handleTapIn empleado inexistente → 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleTapIn({ employee_id: 'fantasma' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleTapOut emite staff.session.tap_out + counter', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const created = await m.handleEmployeeCreate({ name: 'Alice', role: 'cajero' });
    await m.handleTapIn({ employee_id: created.data.employee.id });
    mocks.published.length = 0; mocks.metricsCalls.length = 0;

    await m.handleTapOut({ employee_id: created.data.employee.id });
    assert.strictEqual(publishedOf(mocks, 'staff.session.tap_out').length, 1);
    assert.ok(mocks.metricsCalls.some(c => c[1] === 'staff.tap_out.count'));
    await m.onUnload();
  });

  await testAsync('handleManagerClose sin sesion activa → 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    managerCloseShouldReturn = null;
    const r = await m.handleManagerClose({ employee_id: 'emp-1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    await m.onUnload();
  });

  await testAsync('handleManagerClose con sesion activa emite staff.session.manager_close', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    const r = await m.handleManagerClose({ employee_id: 'emp-1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(publishedOf(mocks, 'staff.session.manager_close').length, 1);
    assert.ok(mocks.metricsCalls.some(c => c[1] === 'staff.manager_close.count'));
    await m.onUnload();
  });

  // ==========================================
  // Group 5: NFC handlers
  // ==========================================

  await testAsync('handleNfcEmployeeCard devuelve payload + byte_size + fits flag', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const created = await m.handleEmployeeCreate({ name: 'Alice', role: 'cajero' });
    const r = await m.handleNfcEmployeeCard({ employee_id: created.data.employee.id });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.payload.kind, 'employee');
    assert.strictEqual(r.data.ntag215_capacity, 504);
    assert.strictEqual(typeof r.data.byte_size, 'number');
    assert.strictEqual(typeof r.data.fits, 'boolean');
    await m.onUnload();
  });

  await testAsync('handleNfcCoreTag sin response a security.public-key.request → 503 UPSTREAM_UNREACHABLE', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.publicKeyTimeoutMs = 30; // acelera el timeout para el test
    const r = await m.handleNfcCoreTag();
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.error.code, 'UPSTREAM_UNREACHABLE');
    // Confirma que el request salio por bus
    const reqs = publishedOf(mocks, 'security.public-key.request');
    assert.strictEqual(reqs.length, 1);
    assert.ok(reqs[0].request_id, 'el request lleva request_id');
    await m.onUnload();
  });

  await testAsync('handleNfcCoreTag recibe security.public-key.response → 200 con publicKeyPEM', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    // Auto-responde como lo haria security-p2p ante el request del bus
    mocks.eventBus.publish = async (event, payload) => {
      mocks.published.push([event, payload]);
      if (event === 'security.public-key.request') {
        setImmediate(() => m.onPublicKeyResponse({
          request_id: payload.request_id,
          public_key: '-----PEM-----',
          fingerprint: 'fp_dummy',
          has_keys: true
        }));
      }
    };
    const r = await m.handleNfcCoreTag();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.payload.publicKeyPEM, '-----PEM-----');
    assert.strictEqual(r.data.payload.endpoint, 'mqtt://127.0.0.1:1883');
    await m.onUnload();
  });

  await testAsync('handleNfcParse con raw invalido → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleNfcParse({ raw: '__BAD__' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleNfcParse con raw valido → 200 con parsed shape', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleNfcParse({ raw: '{"kind":"employee","name":"X"}' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.kind, 'employee');
    await m.onUnload();
  });

  // ==========================================
  // Group 6: Bus — _emitSessionEvent propaga via publish (NO emit)
  // ==========================================

  await testAsync('_emitSessionEvent llama eventBus.publish (NO emit) con shape enriquecido', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._emitSessionEvent('auto_timeout', { session: { id: 'X' }, employee_id: 'E' });
    const evs = publishedOf(mocks, 'staff.session.auto_timeout');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].type, 'auto_timeout');
    assert.strictEqual(evs[0].employee_id, 'E');
    assert.ok(evs[0].correlation_id);
    assert.ok(evs[0].timestamp);
    assert.ok(mocks.metricsCalls.some(c => c[1] === 'staff.auto_close.count'));
    await m.onUnload();
  });

  await testAsync('_emitSessionEvent es resiliente si eventBus.publish falla', async () => {
    const mocks = makeMocks();
    mocks.eventBus.publish = async () => { throw new Error('bus down'); };
    const { module: m } = await instantiate(mocks);
    await m._emitSessionEvent('tap_in', { employee_id: 'E' });
    assert.ok(mocks.logs.some(l => l[0] === 'error' && l[1] === 'staff-manager.publish_error'));
    await m.onUnload();
  });

  // ==========================================
  // Group 7: Helpers POC2
  // ==========================================

  await testAsync('_errorResponse construye shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._errorResponse(400, 'INVALID_INPUT', 'msg', { field: 'x' });
    assert.deepStrictEqual(r, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { field: 'x' } } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea por mensaje', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(new Error('not found')),         'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('no encontrado')),     'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('forbidden access')),  'PERMISSION_DENIED');
    assert.strictEqual(m._classifyHandlerError(new Error('weird')),             'UNKNOWN_ERROR');
    await m.onUnload();
  });

  await testAsync('_publicarEvento hereda correlation_id + project_id', async () => {
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

  await testAsync('_handleHandlerError mapea status segun code y registra metric', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.metricsCalls.length = 0;
    const err = Object.assign(new Error('no encontrado'), { _code: 'RESOURCE_NOT_FOUND' });
    const r = m._handleHandlerError('t.failed', err, 'kind');
    assert.strictEqual(r.status, 404);
    const metric = mocks.metricsCalls.find(c => c[1] === 'staff-manager.errors');
    assert.ok(metric);
    await m.onUnload();
  });

  await testAsync('_requestSecurityP2PPublicKey publica security.public-key.request y resuelve con la public_key cuando llega onPublicKeyResponse', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.eventBus.publish = async (event, payload) => {
      mocks.published.push([event, payload]);
      if (event === 'security.public-key.request') {
        setImmediate(() => m.onPublicKeyResponse({ request_id: payload.request_id, public_key: '-----PEM-X-----', has_keys: true }));
      }
    };
    const pk = await m._requestSecurityP2PPublicKey();
    assert.strictEqual(pk, '-----PEM-X-----');
    await m.onUnload();
  });

  await testAsync('_requestSecurityP2PPublicKey resuelve a null cuando expira el timeout', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.publicKeyTimeoutMs = 20;
    const pk = await m._requestSecurityP2PPublicKey();
    assert.strictEqual(pk, null);
    await m.onUnload();
  });

  await testAsync('onPublicKeyResponse con request_id desconocido es noop', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.onPublicKeyResponse({ request_id: 'no-existe', public_key: 'x' }); // no throw
    assert.strictEqual(m.pendingPublicKey.size, 0);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})();

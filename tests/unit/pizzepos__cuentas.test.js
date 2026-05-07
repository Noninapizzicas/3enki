/**
 * Tests unitarios — pizzepos/cuentas (POC2 reescritura).
 *
 * Aislamiento: tests con persistencia usan tmpdir + override de _turnoFile.
 *
 * Ejecutar: node tests/unit/pizzepos__cuentas.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const fsp    = require('fs').promises;
const os     = require('os');

const CuentasModule = require('../../modules/pizzepos/cuentas/index.js');

// --------------------------------------------------
// Mocks
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
    increment: (n, _v, l) => metricsCalls.push(['increment', n, l]),
    gauge:     (n, v, l) => metricsCalls.push(['gauge', n, v, l]),
    timing:    (n, ms, l) => metricsCalls.push(['timing', n, ms, l])
  };

  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); }
  };

  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

const tmpDirs = [];
function makeTmpDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cuentas-test-'));
  tmpDirs.push(d);
  return d;
}
function cleanupTmp() {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

async function instantiate(mocks, opts = {}) {
  const m = new CuentasModule();
  // override turno file BEFORE onLoad para no contaminar repo
  const turnoFile = opts.turnoFile || path.join(makeTmpDir(), 'contador_global.json');
  const _onLoad = m.onLoad.bind(m);
  m.onLoad = async (core) => {
    // Skip restauracion de cuentas_activas (override)
    m._restaurarDesdeArchivo = async () => {};
    // Override _loadTurno para leer del file de test, no del path por defecto
    m._loadTurno = async function () {
      this._turnoFile = turnoFile;
      const j = await this._readJsonSafe(this._turnoFile, 'turno_load');
      if (j) this._turno = j.turno ?? j.counter ?? 0;
      else this._turno = opts.startTurno || 0;
    };
    const r = await _onLoad(core);
    // Asegurar que _turnoFile no fue sobreescrito por el onLoad original
    m._turnoFile = turnoFile;
    return r;
  };

  await m.onLoad({
    logger:    mocks.logger,
    metrics:   mocks.metrics,
    eventBus:  mocks.eventBus
  });
  if (m._metricsInterval) { clearInterval(m._metricsInterval); m._metricsInterval = null; }
  return { module: m };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); cleanupTmp(); process.exit(1); }
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
  console.log('pizzepos/cuentas — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa Maps vacios y carga turno', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'cuentas');
    assert.strictEqual(m.version, '3.0.0');
    assert.strictEqual(m.cuentas.size, 0);
    assert.strictEqual(m._pendingTimeouts.size, 0);
    assert.strictEqual(m._alertaTimers.size, 0);
    assert.strictEqual(m._pedidosEnCocina.size, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia timers y Maps', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._pendingTimeouts.set('x', setTimeout(() => {}, 60000));
    m._alertaTimers.set('y', setTimeout(() => {}, 60000));
    m.cuentas.set('z', { id: 'z' });
    await m.onUnload();
    assert.strictEqual(m._pendingTimeouts.size, 0);
    assert.strictEqual(m._alertaTimers.size, 0);
    assert.strictEqual(m.cuentas.size, 0);
  });

  // ==========================================
  // Group 2: Validacion canonica de UI handlers
  // ==========================================

  await testAsync('handleCreateCuenta sin project_id → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreateCuenta({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'project_id');
    await m.onUnload();
  });

  await testAsync('handleGet/Delete/MarcarEntregado/Rename sin id → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    for (const fn of ['handleGetCuenta', 'handleDeleteCuenta', 'handleMarcarEntregado', 'handleRenameCuenta']) {
      const r = await m[fn]({});
      assert.ok(isCanonicalError(r), `${fn} debe devolver shape canonico`);
      assert.strictEqual(r.error.code, 'INVALID_INPUT', `${fn} code`);
    }
    await m.onUnload();
  });

  await testAsync('handleRenameCuenta con nombre vacio → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const c = await m.handleCreateCuenta({ project_id: 'p1', tipo: 'local' });
    const r = await m.handleRenameCuenta({ id: c.data.id, nombre: '   ' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.details.field, 'nombre');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: State machine — transiciones
  // ==========================================

  await testAsync('_transicionarEstado pendiente → con_pedido publica estado_cambiado y actualizada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const c = await m.handleCreateCuenta({ project_id: 'p1', tipo: 'local' });
    mocks.published.length = 0;
    const ok = await m._transicionarEstado(c.data.id, 'con_pedido', { correlation_id: 'cid-T' });
    assert.strictEqual(ok, true);
    const ev = publishedOf(mocks, 'cuenta.estado_cambiado');
    assert.strictEqual(ev.length, 1);
    assert.strictEqual(ev[0].estado_anterior, 'pendiente');
    assert.strictEqual(ev[0].estado_nuevo, 'con_pedido');
    assert.strictEqual(ev[0].correlation_id, 'cid-T');
    assert.strictEqual(ev[0].project_id, 'p1');
    assert.ok(publishedOf(mocks, 'cuenta.actualizada').length >= 1);
    await m.onUnload();
  });

  await testAsync('_transicionarEstado con transicion invalida loguea warn y devuelve false', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const c = await m.handleCreateCuenta({ project_id: 'p1', tipo: 'local' });
    // pendiente → cobrado NO esta en TRANSICIONES_VALIDAS
    const ok = await m._transicionarEstado(c.data.id, 'cobrado');
    assert.strictEqual(ok, false);
    assert.ok(mocks.logs.some(l => l[0] === 'warn' && l[1] === 'cuenta.transicion_invalida'));
    await m.onUnload();
  });

  await testAsync('re-entrada con_pedido → con_pedido es valida (mas items)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const c = await m.handleCreateCuenta({ project_id: 'p1', tipo: 'local' });
    await m._transicionarEstado(c.data.id, 'con_pedido');
    const ok = await m._transicionarEstado(c.data.id, 'con_pedido');
    assert.strictEqual(ok, true);
    await m.onUnload();
  });

  await testAsync('re-entrada con_pedido → pendiente cuando items=0 (regresion legitima)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const c = await m.handleCreateCuenta({ project_id: 'p1', tipo: 'local' });
    await m.onComanderoItemAgregado({ data: { cuenta_id: c.data.id, precio_total: 10, cantidad: 1 }});
    assert.strictEqual(m.cuentas.get(c.data.id).estado, 'con_pedido');
    await m.onComanderoItemEliminado({ data: { cuenta_id: c.data.id, precio_total: 10, cantidad: 1 }});
    assert.strictEqual(m.cuentas.get(c.data.id).estado, 'pendiente');
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Bus subscribes — flujo end-to-end
  // ==========================================

  await testAsync('onComanderoItemAgregado primer item transita a con_pedido + publica actualizada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const c = await m.handleCreateCuenta({ project_id: 'p1', tipo: 'local' });
    mocks.published.length = 0;
    await m.onComanderoItemAgregado({ data: { cuenta_id: c.data.id, precio_total: 12.5, cantidad: 2, correlation_id: 'cid-A' }});

    const cuenta = m.cuentas.get(c.data.id);
    assert.strictEqual(cuenta.items, 2);
    assert.strictEqual(cuenta.total, 12.5);
    assert.strictEqual(cuenta.estado, 'con_pedido');

    const ev = publishedOf(mocks, 'cuenta.estado_cambiado');
    assert.strictEqual(ev[0].estado_anterior, 'pendiente');
    assert.strictEqual(ev[0].estado_nuevo, 'con_pedido');
    assert.strictEqual(ev[0].correlation_id, 'cid-A');
    await m.onUnload();
  });

  await testAsync('onCocinaPedidoListo solo transita a listo cuando todos los pedidos terminan', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const c = await m.handleCreateCuenta({ project_id: 'p1', tipo: 'local' });
    await m.onComanderoItemAgregado({ data: { cuenta_id: c.data.id, precio_total: 10, cantidad: 1 }});
    await m.onComanderoEnviarCocina({ data: { cuenta_id: c.data.id, pedido_id: 'P1' }});
    await m.onComanderoEnviarCocina({ data: { cuenta_id: c.data.id, pedido_id: 'P2' }});
    assert.strictEqual(m.cuentas.get(c.data.id).estado, 'en_preparacion');

    // Solo P1 listo → sigue en_preparacion
    await m.onCocinaPedidoListo({ data: { cuenta_id: c.data.id, pedido_id: 'P1' }});
    assert.strictEqual(m.cuentas.get(c.data.id).estado, 'en_preparacion');

    // P2 listo → ahora si transita a listo
    await m.onCocinaPedidoListo({ data: { cuenta_id: c.data.id, pedido_id: 'P2' }});
    assert.strictEqual(m.cuentas.get(c.data.id).estado, 'listo');
    await m.onUnload();
  });

  await testAsync('onCobroProcesado idempotente — duplicado se ignora con warn', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const c = await m.handleCreateCuenta({ project_id: 'p1', tipo: 'local' });
    m.cuentas.get(c.data.id).pagado = true;
    mocks.logs.length = 0;

    await m.onCobroProcesado({ data: { cuenta_id: c.data.id }});
    assert.ok(mocks.logs.some(l => l[0] === 'warn' && l[1] === 'cobro.procesado.duplicado_ignorado'));
    await m.onUnload();
  });

  await testAsync('onCuentaExternaCerrada limpia Map + cancela pendingTimeout + publica eliminada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const c = await m.handleCreateCuenta({ project_id: 'p1', tipo: 'llevar' });
    m._pendingTimeouts.set(c.data.id, setTimeout(() => {}, 60000));
    m._alertaTimers.set(c.data.id, setTimeout(() => {}, 60000));
    mocks.published.length = 0;

    await m.onCuentaExternaCerrada({ data: { cuenta_id: c.data.id }});
    assert.strictEqual(m.cuentas.has(c.data.id), false);
    assert.strictEqual(m._pendingTimeouts.has(c.data.id), false);
    assert.strictEqual(m._alertaTimers.has(c.data.id), false);
    const ev = publishedOf(mocks, 'cuenta.eliminada');
    assert.strictEqual(ev.length, 1);
    assert.strictEqual(ev[0].motivo, 'cuenta_cerrada_canal');
    await m.onUnload();
  });

  await testAsync('cobro.procesado pago_externo (llevadoo) NO transita a cobrado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const c = await m.handleCreateCuenta({ project_id: 'p1', tipo: 'llevadoo' });
    await m.onCobroProcesado({ data: { cuenta_id: c.data.id }});
    assert.strictEqual(m.cuentas.get(c.data.id).estado, 'pendiente'); // no cambio
    assert.strictEqual(m.cuentas.get(c.data.id).pagado, true);
    await m.onUnload();
  });

  // ==========================================
  // Group 5: UI handlers — create/list/rename/marcar_entregado
  // ==========================================

  await testAsync('handleCreateCuenta success genera turno + ref_display + publica cuenta.creada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    const r = await m.handleCreateCuenta({
      project_id: 'p1', tipo: 'local', correlation_id: 'cid-CR'
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.estado, 'pendiente');
    assert.ok(r.data.ref_display.startsWith('M '), 'ref_display empieza con simbolo del tipo local=M');
    const ev = publishedOf(mocks, 'cuenta.creada');
    assert.strictEqual(ev.length, 1);
    assert.strictEqual(ev[0].correlation_id, 'cid-CR');
    assert.strictEqual(ev[0].project_id, 'p1');
    await m.onUnload();
  });

  await testAsync('handleCreateCuenta con pedido_inicial inyecta items + publica comandero.enviar_cocina', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    const r = await m.handleCreateCuenta({
      project_id: 'p1', tipo: 'glovo',
      pedido_inicial: { items: [{ cantidad: 2, precio: 10 }, { cantidad: 1, precio: 5 }], total: 25 }
    });
    assert.ok(isCanonicalSuccess(r));
    const cuenta = m.cuentas.get(r.data.id);
    assert.strictEqual(cuenta.items, 3);
    assert.strictEqual(cuenta.total, 25);
    const enviarCocina = publishedOf(mocks, 'comandero.enviar_cocina');
    assert.strictEqual(enviarCocina.length, 1);
    assert.strictEqual(enviarCocina[0].project_id, 'p1');
    assert.ok(enviarCocina[0].pedido_id.startsWith('ped_'));
    await m.onUnload();
  });

  await testAsync('handleListCuentas filtra por project_id/tipo/estado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleCreateCuenta({ project_id: 'p1', tipo: 'local' });
    await m.handleCreateCuenta({ project_id: 'p2', tipo: 'local' });
    await m.handleCreateCuenta({ project_id: 'p1', tipo: 'delivery' });
    const r = await m.handleListCuentas({ project_id: 'p1' });
    assert.strictEqual(r.data.total, 2);
    const r2 = await m.handleListCuentas({ project_id: 'p1', tipo: 'delivery' });
    assert.strictEqual(r2.data.total, 1);
    await m.onUnload();
  });

  await testAsync('handleMarcarEntregado en estado invalido → 409 CONFLICT_STATE', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const c = await m.handleCreateCuenta({ project_id: 'p1', tipo: 'local' });
    const r = await m.handleMarcarEntregado({ id: c.data.id });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'CONFLICT_STATE');
    assert.strictEqual(r.error.details.current_state, 'pendiente');
    await m.onUnload();
  });

  await testAsync('handleRenameCuenta preserva turno y regenera ref_display', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const c = await m.handleCreateCuenta({ project_id: 'p1', tipo: 'local' });
    const turnoOriginal = c.data.turno;
    const r = await m.handleRenameCuenta({ id: c.data.id, nombre: 'Mesa VIP' });
    assert.ok(isCanonicalSuccess(r));
    const cuenta = m.cuentas.get(c.data.id);
    assert.strictEqual(cuenta.turno, turnoOriginal);
    assert.ok(cuenta.ref_display.includes('Mesa VIP'));
    assert.ok(cuenta.ref_display.includes(`M ${String(turnoOriginal).padStart(3, '0')}`));
    await m.onUnload();
  });

  await testAsync('handleHealthCheck devuelve 200 con metricas internas', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealthCheck();
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.status, 'healthy');
    assert.strictEqual(typeof r.data.cuentas_activas, 'number');
    await m.onUnload();
  });

  // ==========================================
  // Group 6: Persistencia — turno + atomic write + read safe
  // ==========================================

  await testAsync('_atomicWriteFile escribe via .tmp + rename', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const dir    = makeTmpDir();
    const target = path.join(dir, 'a.json');
    await m._atomicWriteFile(target, '{"x":1}');
    const content = await fsp.readFile(target, 'utf-8');
    assert.strictEqual(content, '{"x":1}');
    const tmpExists = await fsp.access(target + '.tmp').then(() => true).catch(() => false);
    assert.strictEqual(tmpExists, false);
    await m.onUnload();
  });

  await testAsync('_loadTurno con archivo nuevo legacy "counter" lo migra a "turno"', async () => {
    const mocks = makeMocks();
    const dir = makeTmpDir();
    const turnoFile = path.join(dir, 'contador_global.json');
    await fsp.writeFile(turnoFile, JSON.stringify({ counter: 42 }));
    const { module: m } = await instantiate(mocks, { turnoFile });
    assert.strictEqual(m._turno, 42);
    await m.onUnload();
  });

  await testAsync('_loadTurno con archivo inexistente arranca en 0 sin warn', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._turno, 0);
    const warns = mocks.logs.filter(l => l[0] === 'warn' && /turno/.test(l[1]));
    assert.strictEqual(warns.length, 0);
    await m.onUnload();
  });

  await testAsync('_getNextTurno cicla 999 → 1 y debounces save', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._turno = 998;
    assert.strictEqual(m._getNextTurno(), 999);
    assert.strictEqual(m._getNextTurno(), 1);
    assert.ok(m._turnoSaveTimer);
    clearTimeout(m._turnoSaveTimer);
    m._turnoSaveTimer = null;
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

  await testAsync('_classifyHandlerError mapea ENOENT/conflict/timeout', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'ENOENT' })), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('already exists')), 'ALREADY_EXISTS');
    assert.strictEqual(m._classifyHandlerError(new Error('weird')), 'INTERNAL_ERROR');
    await m.onUnload();
  });

  await testAsync('_publicarEvento hereda correlation_id, defaultea project_id a "default"', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { x: 1 }, { correlation_id: 'cid-X' });
    await m._publicarEvento('test.event', { y: 2 });
    const evs = publishedOf(mocks, 'test.event');
    assert.strictEqual(evs[0].correlation_id, 'cid-X');
    assert.strictEqual(evs[0].project_id, 'default');
    assert.notStrictEqual(evs[1].correlation_id, 'cid-X');
    assert.ok(evs[0].timestamp && evs[1].timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError mapea status segun code y registra metric', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.metricsCalls.length = 0;
    const err = Object.assign(new Error('conflict state'), { _code: 'CONFLICT_STATE' });
    const r = m._handleHandlerError('t.failed', err, 'kind');
    assert.strictEqual(r.status, 409);
    const metric = mocks.metricsCalls.find(c => c[1] === 'pizzepos-cuentas.errors');
    assert.ok(metric, 'metric pizzepos-cuentas.errors registrada');
    await m.onUnload();
  });

  cleanupTmp();
  console.log('\nTodos los tests pasaron.');
  process.exit(0);
})();

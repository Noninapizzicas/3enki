/**
 * Tests unitarios — entrega-despacho (reflejo, despacho de pan P-E).
 *
 * Ejecutar: node tests/unit/entrega-despacho.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// --------------------------------------------------
// Mock infra
// --------------------------------------------------

function makeMocks() {
  const logs = [];
  const published = [];
  const metricsCalls = [];
  const uiRegistered = [];

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

  // eventBus que simula el contrato fs reflejo (read/write sobre el tmp cwd),
  // para que la persistencia de ConfigCustodio sea real en el test.
  const respHandlers = {}; // responseEvent -> [fn]
  const eventBus = {
    publish: async (event, payload) => {
      published.push([event, payload]);
      if (event.endsWith('.request')) {
        const respEvent = event.slice(0, -('.request'.length)) + '.response';
        const { request_id, path: ruta, project_id, content } = payload || {};
        let d = null;
        if (event === 'fs.read.request') {
          const full = path.join(process.cwd(), 'data', 'current', project_id, ruta);
          d = fs.existsSync(full)
            ? { status: 200, data: { content: fs.readFileSync(full, 'utf-8') } }
            : { status: 404, data: { content: undefined } };
        } else if (event === 'fs.write.request' && ruta && project_id) {
          const dir = path.join(process.cwd(), 'data', 'current', project_id);
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, ruta), content, 'utf-8');
          d = { status: 200, data: { ok: true } };
        }
        if (d && respHandlers[respEvent]) {
          for (const fn of respHandlers[respEvent]) {
            try { fn({ data: { ...d.data, request_id } }); } catch (_) {}
          }
        }
      }
    },
    subscribe: (evt, fn) => {
      (respHandlers[evt] = respHandlers[evt] || []).push(fn);
      return () => { respHandlers[evt] = (respHandlers[evt] || []).filter(f => f !== fn); };
    },
    request: async () => ({ data: {} })
  };

  const uiHandler = {
    register: (domain, action, fn) => { uiRegistered.push([domain, action]); },
    unregister: () => {}
  };

  return { logs, published, metricsCalls, uiRegistered, logger, metrics, eventBus, uiHandler };
}

let TMP_ROOT;
let ORIG_CWD;

function setupTmpCwd() {
  ORIG_CWD = process.cwd();
  TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'entrega-despacho-test-'));
  process.chdir(TMP_ROOT);
  fs.mkdirSync(path.join(TMP_ROOT, 'data', 'current'), { recursive: true });
}

function teardownTmpCwd() {
  if (ORIG_CWD) process.chdir(ORIG_CWD);
  if (TMP_ROOT) {
    try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }
}

const EntregaDespacho = require('../../modules/entrega-despacho/index.js');

async function instantiate(mocks, opts = {}) {
  const m = new EntregaDespacho();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    uiHandler: mocks.uiHandler,
    config: opts.config || null
  });
  return { module: m };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) {
    console.error(`✗ ${description}`);
    console.error(`  ${error.message}`);
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  }
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

function makeEvent(project_id, payload = {}, cid = 'cid-x') {
  return { metadata: { correlationId: cid }, data: { project_id, ...payload } };
}

function isCanonicalSuccess(result) {
  return result && typeof result.status === 'number'
    && result.data && typeof result.data === 'object'
    && !('error' in result);
}

// ==================================================
//                                                Tests
// ==================================================

(async () => {
  setupTmpCwd();
  console.log('entrega-despacho — reflejo P-E (configurable por proyecto)\n');

  // ==========================================
  // Group 1: Reglas default (política por declarar)
  // ==========================================
  await testAsync('default: reglas vacías (nulls) hasta que el dueño las puebla', async () => {
    const { module: m } = await instantiate(makeMocks());
    const r = await m.onReglasLeerRequest(makeEvent('proj-pan'));
    assert.ok(isCanonicalSuccess(r), 'debe ser éxito canónico');
    assert.strictEqual(r.data.reglas.esquema, 'entrega-despacho-v1');
    assert.strictEqual(r.data.reglas.reparto.activo, false);
    assert.strictEqual(r.data.reglas.reparto.radio_km, null);
    assert.strictEqual(r.data.reglas.estimacion.minutos_preparacion_base, null);
    assert.strictEqual(r.data.fuente, 'default');
  });

  // ==========================================
  // Group 2: estimación con política sin declarar
  // ==========================================
  await testAsync('tiempo.estimar: pendiente cuando la estimación no está declarada', async () => {
    const { module: m } = await instantiate(makeMocks());
    const r = await m.onTiempoEstimarRequest(makeEvent('proj-pan', { num_items: 2 }));
    assert.ok(isCanonicalSuccess(r), 'éxito honesto (no error)');
    assert.strictEqual(r.data.metodo, 'pendiente');
    assert.strictEqual(r.data.minutos_preparacion, null);
    assert.strictEqual(r.data.minutos_total, null);
  });

  // ==========================================
  // Group 3: actualizar reglas (single-writer) + estimación declarada
  // ==========================================
  await testAsync('reglas.actualizar: puebla política y persiste', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.onReglasActualizarRequest(makeEvent('proj-x', {
      cambios: {
        estimacion: { minutos_preparacion_base: 20, minutos_por_item: 4 },
        reparto: { activo: true, radio_km: 5, coste: 2.5, minutos_por_km: 3 }
      }
    }));
    assert.ok(isCanonicalSuccess(r), 'éxito canónico');
    assert.strictEqual(r.data.reglas.estimacion.minutos_preparacion_base, 20);
    // publicado evento de reglas actualizadas
    const evs = publishedOf(mocks, 'entrega-despacho.reglas.actualizadas');
    assert.strictEqual(evs.length, 1, 'publica el evento de reglas actualizadas');
  });

  await testAsync('tiempo.estimar: calcula con política declarada (preparación + entrega)', async () => {
    const { module: m } = await instantiate(makeMocks());
    await m.onReglasActualizarRequest(makeEvent('proj-x', {
      cambios: {
        estimacion: { minutos_preparacion_base: 20, minutos_por_item: 4 },
        reparto: { activo: true, minutos_por_km: 3 }
      }
    }));
    const r = await m.onTiempoEstimarRequest(makeEvent('proj-x', { num_items: 3, km: 2 }));
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.minutos_preparacion, 32);      // 20 + 4*3
    assert.strictEqual(r.data.minutos_entrega, 6);           // 3*2
    assert.strictEqual(r.data.minutos_total, 38);            // 32 + 6
    assert.strictEqual(r.data.metodo, 'declarado');
  });

  // ==========================================
  // Group 4: aislamiento por proyecto (configuración es por proyecto)
  // ==========================================
  await testAsync('reglas por proyecto: cada proyecto lee las suyas', async () => {
    const { module: m } = await instantiate(makeMocks());
    await m.onReglasActualizarRequest(makeEvent('proj-A', { cambios: { estimacion: { minutos_preparacion_base: 10, minutos_por_item: 2 } } }));
    const rA = await m.onReglasLeerRequest(makeEvent('proj-A'));
    const rB = await m.onReglasLeerRequest(makeEvent('proj-B'));
    assert.strictEqual(rA.data.reglas.estimacion.minutos_preparacion_base, 10);
    assert.strictEqual(rB.data.reglas.estimacion.minutos_preparacion_base, null, 'proj-B sigue sin declarar');
  });

  // ==========================================
  // Group 5: identidad fuera de la lógica
  // ==========================================
  await testAsync('la lógica no depende de la identidad del proyecto', async () => {
    const { module: m } = await instantiate(makeMocks());
    await m.onReglasActualizarRequest(makeEvent('proj-sin-identidad', { cambios: { estimacion: { minutos_preparacion_base: 15, minutos_por_item: 3 } } }));
    const r = await m.onTiempoEstimarRequest(makeEvent('proj-sin-identidad', { num_items: 2 }));
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.minutos_preparacion, 21);
    assert.strictEqual(r.data.metodo, 'declarado');
  });

  console.log('\nALL PASS');
  teardownTmpCwd();
  process.exit(0);
})();

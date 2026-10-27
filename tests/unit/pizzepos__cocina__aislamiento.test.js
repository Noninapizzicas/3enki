/**
 * Tests unitarios — cocina: aislamiento por proyecto (v3.5.0).
 *
 * El bug que estos tests cierran: `cocina.list-active` devolvía los pedidos de
 * TODOS los proyectos del core (singleton), así que la cocina de un negocio veía
 * —y podía marcar listo— el pedido de otro.
 *
 * Ejecutar: node tests/unit/pizzepos__cocina__aislamiento.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROY_A = '5d09cb49-35a0-409f-9e09-c57da93b84a8';
const PROY_B = '5d6d28eb-24e1-4205-ba18-5f45ebc2657b';

const PROYECTOS = [
  { id: PROY_A, slug: 'the-pirate', base_path: '/opt/enki/data/projects/the-pirate' },
  { id: PROY_B, slug: 'nonina',     base_path: '/opt/enki/data/projects/nonina' }
];

function makeMocks() {
  const logs = [];
  const published = [];
  const metricsCalls = [];
  const subs = new Map();

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

  // Bus de verdad en miniatura: subscribe/publish con respuesta al project.list.
  const eventBus = {
    subscribe(event, fn) {
      if (!subs.has(event)) subs.set(event, new Set());
      subs.get(event).add(fn);
      return () => subs.get(event).delete(fn);
    },
    publish: async (event, payload) => {
      published.push([event, payload]);
      if (event === 'project.list.request') {
        const resp = { request_id: payload.request_id, projects: PROYECTOS };
        setImmediate(() => {
          for (const fn of subs.get('project.list.response') || []) fn({ data: resp });
        });
      }
    },
    request: async () => ({ data: {} })
  };

  const uiHandler = { register: () => {}, unregister: () => {} };

  return { logs, published, metricsCalls, logger, metrics, eventBus, uiHandler };
}

const CocinaModule = require('../../modules/pizzepos/cocina/index.js');

let TMP_ROOT;
let ORIG_CWD;

function setupTmpCwd() {
  ORIG_CWD = process.cwd();
  TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'cocina-aislamiento-'));
  process.chdir(TMP_ROOT);
  fs.mkdirSync(path.join(TMP_ROOT, 'data', 'current'), { recursive: true });
}

function teardownTmpCwd() {
  if (ORIG_CWD) process.chdir(ORIG_CWD);
  if (TMP_ROOT) {
    try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }
}

async function instantiate(mocks) {
  const m = new CocinaModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    uiHandler: mocks.uiHandler,
    config: null
  });
  // El resolutor carga los slugs por RPC en onLoad; se espera aquí para que los
  // tests no dependan de una carrera.
  await m._proyectos.cargarSlugs();
  return m;
}

function flushSnapshotTimer(m) {
  if (m._snapshotSaveTimer) {
    clearTimeout(m._snapshotSaveTimer);
    m._snapshotSaveTimer = null;
  }
}

async function pedidoEnCocina(m, pedido_id, project_id, item_id) {
  await m.onPedidoEnviadoCocina({
    metadata: { correlationId: `cid-${pedido_id}` },
    data: {
      pedido_id,
      cuenta_id: `cuenta-${pedido_id}`,
      canal: 'mesa',
      ref_display: `Mesa ${pedido_id}`,
      project_id,
      items: [{ item_id: item_id || `${pedido_id}-i1`, producto_id: 'pizza', nombre: 'Margarita', cantidad: 1 }]
    }
  });
  flushSnapshotTimer(m);
}

function testAsync(description, fn) {
  try { return fn().then(() => { console.log(`✓ ${description}`); }); }
  catch (error) {
    console.error(`✗ ${description}`);
    console.error(`  ${error.message}`);
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  }
}

(async () => {
  setupTmpCwd();
  console.log('pizzepos__cocina — aislamiento por proyecto\n');

  await testAsync('list-active solo devuelve los pedidos del proyecto que pregunta', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    await pedidoEnCocina(m, 'p-pirate', PROY_A, 'i-pirate');
    await pedidoEnCocina(m, 'p-nonina', PROY_B, 'i-nonina');

    const r = await m.handleGetActivos({ project_id: PROY_A });
    assert.strictEqual(r.status, 200);
    const ids = r.data.pedidos.map(p => p.pedido_id);
    assert.deepStrictEqual(ids, ['p-pirate']);
    assert.strictEqual(r.data.total, 1);
    assert.strictEqual(r.data.items_pendientes, 1);

    const rB = await m.handleGetActivos({ project_id: PROY_B });
    assert.deepStrictEqual(rB.data.pedidos.map(p => p.pedido_id), ['p-nonina']);

    flushSnapshotTimer(m);
    await m.onUnload();
  });

  await testAsync('sin project_id sigue devolviendo todo (compatibilidad bus/agentes)', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    await pedidoEnCocina(m, 'p-pirate', PROY_A);
    await pedidoEnCocina(m, 'p-nonina', PROY_B);

    const r = await m.handleGetActivos();
    assert.strictEqual(r.data.total, 2);

    flushSnapshotTimer(m);
    await m.onUnload();
  });

  await testAsync('se pregunta con slug y se ve el pedido guardado con uuid', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    await pedidoEnCocina(m, 'p-pirate', PROY_A, 'i-pirate');
    await pedidoEnCocina(m, 'p-nonina', PROY_B, 'i-nonina');

    const r = await m.handleGetActivos({ project_id: 'the-pirate' });
    assert.deepStrictEqual(r.data.pedidos.map(p => p.pedido_id), ['p-pirate']);
    assert.deepStrictEqual(r.data.proyecto, { id: PROY_A, slug: 'the-pirate' });

    flushSnapshotTimer(m);
    await m.onUnload();
  });

  await testAsync('prepare-item de otra cocina devuelve 404 y NO toca el item ajeno', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    await pedidoEnCocina(m, 'p-nonina', PROY_B, 'i-nonina');

    const r = await m.handlePrepararItem({ item_id: 'i-nonina', project_id: PROY_A });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');

    const pedido = m.pedidosActivos.get('p-nonina');
    assert.strictEqual(pedido.items[0].estado, 'pendiente', 'el item de nonina sigue pendiente');

    // Y desde su propia cocina sí se puede.
    const ok = await m.handlePrepararItem({ item_id: 'i-nonina', project_id: PROY_B });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.data.item.estado, 'preparando');

    flushSnapshotTimer(m);
    await m.onUnload();
  });

  await testAsync('mark-ready de otra cocina devuelve 404 y no cierra el pedido ajeno', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    await pedidoEnCocina(m, 'p-nonina', PROY_B, 'i-nonina');

    const r = await m.handleMarcarListo({ pedido_id: 'p-nonina', project_id: PROY_A });
    assert.strictEqual(r.status, 404);
    assert.ok(m.pedidosActivos.has('p-nonina'), 'el pedido de nonina sigue en cocina');

    flushSnapshotTimer(m);
    await m.onUnload();
  });

  await testAsync('get de un pedido ajeno devuelve 404; el propio 200', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    await pedidoEnCocina(m, 'p-pirate', PROY_A, 'i-pirate');

    const ajeno = await m.handleGetPedido({ pedido_id: 'p-pirate', project_id: PROY_B });
    assert.strictEqual(ajeno.status, 404);
    const propio = await m.handleGetPedido({ pedido_id: 'p-pirate', project_id: PROY_A });
    assert.strictEqual(propio.status, 200);

    flushSnapshotTimer(m);
    await m.onUnload();
  });

  await testAsync('history se recorta al proyecto', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    await pedidoEnCocina(m, 'p-pirate', PROY_A, 'i-pirate');
    await pedidoEnCocina(m, 'p-nonina', PROY_B, 'i-nonina');
    await m.handleMarcarListo({ pedido_id: 'p-pirate', project_id: PROY_A });
    await m.handleMarcarListo({ pedido_id: 'p-nonina', project_id: PROY_B });
    flushSnapshotTimer(m);

    const r = await m.handleGetHistorial({ project_id: PROY_A });
    assert.strictEqual(r.data.total, 1);
    assert.strictEqual(r.data.pedidos[0].pedido_id, 'p-pirate');

    await m.onUnload();
  });

  await testAsync('el device pertenece al proyecto que lo registra (no se ve en el otro)', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    await m.handleRegisterDevice({ device_id: 'd-pirate', nombre: 'Estacion 1', project_id: PROY_A });
    await m.handleRegisterDevice({ device_id: 'd-nonina', nombre: 'Estacion 1', project_id: PROY_B });

    const a = await m.handleGetActivos({ project_id: PROY_A });
    assert.deepStrictEqual(a.data.devices.map(d => d.device_id), ['d-pirate']);
    const l = await m.handleListDevices({ project_id: PROY_B });
    assert.deepStrictEqual(l.data.devices.map(d => d.device_id), ['d-nonina']);

    await m.onUnload();
  });

  await testAsync('caja.cerrada de un proyecto no vacía la cocina del otro', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    await pedidoEnCocina(m, 'p-pirate', PROY_A, 'i-pirate');
    await pedidoEnCocina(m, 'p-nonina', PROY_B, 'i-nonina');

    await m.onCajaCerrada({ data: { project_id: PROY_B } });
    flushSnapshotTimer(m);

    assert.strictEqual(m.pedidosActivos.size, 1);
    assert.ok(m.pedidosActivos.has('p-pirate'), 'el pedido de the-pirate sobrevive al cierre de nonina');

    await m.onUnload();
  });

  await testAsync('un pedido sin project_id no se cuela y se avisa (no_silent_drops)', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    await pedidoEnCocina(m, 'p-huerfano', null);

    const r = await m.handleGetActivos({ project_id: PROY_A });
    assert.strictEqual(r.data.total, 0);
    const warn = mocks.logs.find(l => l[1] === 'cocina.sin_proyecto');
    assert.ok(warn, 'avisa del pedido sin proyecto');

    flushSnapshotTimer(m);
    await m.onUnload();
  });

  teardownTmpCwd();
  console.log('\n✅ cocina__aislamiento OK');
})();

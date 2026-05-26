/**
 * Tests unitarios — inventario (POC2).
 *
 * Ejecutar: node tests/unit/inventario.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');

const InventarioModule = require('../../modules/inventario/index.js');
const { SafeUpdate } = require('../../modules/inventario/services/safe-update');

let TMP_ROOT, ORIG_CWD;

function setupTmpCwd() {
  ORIG_CWD = process.cwd();
  TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-test-'));
  process.chdir(TMP_ROOT);
  fs.mkdirSync(path.join(TMP_ROOT, 'data', 'projects'), { recursive: true });
}

function teardownTmpCwd() {
  if (ORIG_CWD) process.chdir(ORIG_CWD);
  if (TMP_ROOT) {
    try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch (_) {}
  }
}

function makeMocks() {
  const logs = [], published = [], metricsCalls = [];
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
  const m = new InventarioModule();
  // Deshabilitar job de expiracion automatica para tests deterministas
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus });
  if (opts.disableExpirationTimer !== false && m.expirationTimer) {
    clearInterval(m.expirationTimer);
    m.expirationTimer = null;
  }
  return { module: m };
}

function setupProyectoVapers(productosInit = {}) {
  const dir = path.join(TMP_ROOT, 'data', 'projects', 'vapers');
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'config', 'project.json'),
    JSON.stringify({ name: 'Vapers', inventario: { reserva_expiracion_horas: 48 } })
  );
  fs.writeFileSync(
    path.join(dir, 'inventario.json'),
    JSON.stringify({
      productos: {
        'vape-A': { nombre: 'Cloud Nine Menta', stock_real: 10, stock_minimo: 2, reservas: [] },
        'vape-B': { nombre: 'Vampire Vape',     stock_real: 5,  stock_minimo: 1, reservas: [] },
        ...productosInit
      }
    }, null, 2)
  );
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

function isCanonicalError(r) {
  return r && typeof r.status === 'number' && r.error
    && typeof r.error.code === 'string' && typeof r.error.message === 'string' && !('data' in r);
}
function isCanonicalSuccess(r) {
  return r && typeof r.status === 'number' && r.data && !('error' in r);
}
function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

(async () => {
  setupTmpCwd();
  console.log('inventario — POC2\n');

  // ===========================================================
  // Group 1: Lifecycle
  // ===========================================================

  await testAsync('onLoad inicializa estado limpio + lee configs de proyectos', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'inventario');
    assert.strictEqual(m.version, '1.0.0');
    assert.strictEqual(m.projectExpiracionHoras.get('vapers'), 48);
    await m.onUnload();
  });

  await testAsync('onUnload limpia timer + estado', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const m = new InventarioModule();
    await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus });
    assert.ok(m.expirationTimer, 'timer activo tras onLoad');
    await m.onUnload();
    assert.strictEqual(m.expirationTimer, null);
    assert.strictEqual(m.projectExpiracionHoras.size, 0);
    assert.strictEqual(m.safeUpdate, null);
  });

  // ===========================================================
  // Group 2: consultar
  // ===========================================================

  await testAsync('consultar · devuelve stock_real, disponible, reservas_vivas', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleConsultar({ project_slug: 'vapers', producto_id: 'vape-A' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.stock_real, 10);
    assert.strictEqual(r.data.stock_disponible, 10);
    assert.strictEqual(r.data.reservas_vivas_count, 0);
    assert.strictEqual(r.data.nombre, 'Cloud Nine Menta');
    await m.onUnload();
  });

  await testAsync('consultar · producto inexistente devuelve 404', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleConsultar({ project_slug: 'vapers', producto_id: 'no-existe' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('consultar · sin project_slug devuelve 400 INVALID_INPUT', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleConsultar({ producto_id: 'vape-A' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  // ===========================================================
  // Group 3: reservar (success, conflict, idempotente)
  // ===========================================================

  await testAsync('reservar · success crea reserva + publica evento + decrementa disponible', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleReservar({ project_slug: 'vapers', producto_id: 'vape-A', cantidad: 3, pedido_id: 'ped-1', correlation_id: 'c1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.cantidad, 3);
    assert.strictEqual(r.data.stock_disponible_restante, 7);
    assert.ok(r.data.expira_at);

    const evs = publishedOf(mocks, 'inventario.reserva.creada');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].project_slug, 'vapers');
    assert.strictEqual(evs[0].producto_id, 'vape-A');
    assert.strictEqual(evs[0].cantidad, 3);
    assert.strictEqual(evs[0].correlation_id, 'c1');

    const cons = await m.handleConsultar({ project_slug: 'vapers', producto_id: 'vape-A' });
    assert.strictEqual(cons.data.stock_disponible, 7);
    assert.strictEqual(cons.data.stock_real, 10);
    assert.strictEqual(cons.data.reservas_vivas_count, 1);
    await m.onUnload();
  });

  await testAsync('reservar · sin stock devuelve 409 CONFLICT_STATE', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleReservar({ project_slug: 'vapers', producto_id: 'vape-B', cantidad: 5, pedido_id: 'ped-1' });
    const r = await m.handleReservar({ project_slug: 'vapers', producto_id: 'vape-B', cantidad: 1, pedido_id: 'ped-2' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'CONFLICT_STATE');
    assert.strictEqual(r.error.details.disponible, 0);
    await m.onUnload();
  });

  await testAsync('reservar · producto inexistente devuelve 404', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleReservar({ project_slug: 'vapers', producto_id: 'no', cantidad: 1, pedido_id: 'ped-1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    await m.onUnload();
  });

  await testAsync('reservar · idempotente devuelve la reserva existente sin duplicar', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = await m.handleReservar({ project_slug: 'vapers', producto_id: 'vape-A', cantidad: 2, pedido_id: 'ped-x' });
    assert.strictEqual(r1.status, 201);
    const r2 = await m.handleReservar({ project_slug: 'vapers', producto_id: 'vape-A', cantidad: 2, pedido_id: 'ped-x' });
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r2.data.idempotente, true);
    const cons = await m.handleConsultar({ project_slug: 'vapers', producto_id: 'vape-A' });
    assert.strictEqual(cons.data.reservas_vivas_count, 1, 'no debe duplicar');
    assert.strictEqual(cons.data.stock_disponible, 8);
    await m.onUnload();
  });

  await testAsync('reservar · 10 reservas concurrentes sobre el mismo item — NO sobre-reserva (cierra clase salmorejo)', async () => {
    setupProyectoVapers({
      'vape-X': { nombre: 'unico', stock_real: 5, stock_minimo: 1, reservas: [] }
    });
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    // 10 reservas concurrentes de 1 unidad. Solo 5 deben pasar; el resto CONFLICT_STATE.
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(m.handleReservar({ project_slug: 'vapers', producto_id: 'vape-X', cantidad: 1, pedido_id: `ped-${i}` }));
    }
    const results = await Promise.all(promises);
    const ok = results.filter(r => r.status === 201);
    const conflicts = results.filter(r => r.status === 409);
    assert.strictEqual(ok.length, 5, `esperaba 5 success, hubo ${ok.length}`);
    assert.strictEqual(conflicts.length, 5, `esperaba 5 conflict, hubo ${conflicts.length}`);
    const cons = await m.handleConsultar({ project_slug: 'vapers', producto_id: 'vape-X' });
    assert.strictEqual(cons.data.stock_disponible, 0);
    assert.strictEqual(cons.data.reservas_vivas_count, 5);
    await m.onUnload();
  });

  await testAsync('reservar · stock_minimo cruzado publica inventario.stock.bajo_minimo', async () => {
    setupProyectoVapers({
      'vape-Y': { nombre: 'casi vacio', stock_real: 5, stock_minimo: 2, reservas: [] }
    });
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    // Reservar 4 → disponible 1 → cruza bajo minimo (2)
    await m.handleReservar({ project_slug: 'vapers', producto_id: 'vape-Y', cantidad: 4, pedido_id: 'ped-1' });
    const evs = publishedOf(mocks, 'inventario.stock.bajo_minimo');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].stock_disponible, 1);
    assert.strictEqual(evs[0].stock_minimo, 2);
    await m.onUnload();
  });

  // ===========================================================
  // Group 4: confirmar / liberar
  // ===========================================================

  await testAsync('confirmar · decrementa stock_real + borra reserva + publica inventario.confirmado', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleReservar({ project_slug: 'vapers', producto_id: 'vape-A', cantidad: 3, pedido_id: 'ped-1' });
    mocks.published.length = 0;
    const r = await m.handleConfirmar({ project_slug: 'vapers', pedido_id: 'ped-1', correlation_id: 'c-conf' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.confirmaciones.length, 1);
    assert.strictEqual(r.data.confirmaciones[0].producto_id, 'vape-A');
    assert.strictEqual(r.data.confirmaciones[0].cantidad, 3);
    assert.strictEqual(r.data.confirmaciones[0].stock_real_restante, 7);

    const cons = await m.handleConsultar({ project_slug: 'vapers', producto_id: 'vape-A' });
    assert.strictEqual(cons.data.stock_real, 7);
    assert.strictEqual(cons.data.reservas_vivas_count, 0);

    const evs = publishedOf(mocks, 'inventario.confirmado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'c-conf');
    await m.onUnload();
  });

  await testAsync('confirmar · sin reservas (idempotente) devuelve 200 con array vacio', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleConfirmar({ project_slug: 'vapers', pedido_id: 'ped-fantasma' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.confirmaciones.length, 0);
    assert.strictEqual(r.data.idempotente, true);
    await m.onUnload();
  });

  await testAsync('liberar · borra reservas SIN decrementar stock_real', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleReservar({ project_slug: 'vapers', producto_id: 'vape-A', cantidad: 3, pedido_id: 'ped-1' });
    const r = await m.handleLiberar({ project_slug: 'vapers', pedido_id: 'ped-1', motivo: 'cancelado_test' });
    assert.ok(isCanonicalSuccess(r));
    const cons = await m.handleConsultar({ project_slug: 'vapers', producto_id: 'vape-A' });
    assert.strictEqual(cons.data.stock_real, 10, 'stock_real NO debe cambiar');
    assert.strictEqual(cons.data.stock_disponible, 10);
    const evs = publishedOf(mocks, 'inventario.reserva.liberada');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].motivo, 'cancelado_test');
    await m.onUnload();
  });

  // ===========================================================
  // Group 5: ajustar
  // ===========================================================

  await testAsync('ajustar · delta positivo (entrada) actualiza stock_real', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleAjustar({ project_slug: 'vapers', producto_id: 'vape-A', delta: 5, motivo: 'entrada_proveedor' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.stock_real, 15);
    const evs = publishedOf(mocks, 'inventario.ajustado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].delta, 5);
    assert.strictEqual(evs[0].motivo, 'entrada_proveedor');
    await m.onUnload();
  });

  await testAsync('ajustar · delta negativo que dejaria stock_real < 0 devuelve 409', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleAjustar({ project_slug: 'vapers', producto_id: 'vape-A', delta: -50, motivo: 'merma_test' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'CONFLICT_STATE');
    await m.onUnload();
  });

  await testAsync('ajustar · delta 0 devuelve 400 INVALID_INPUT', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleAjustar({ project_slug: 'vapers', producto_id: 'vape-A', delta: 0, motivo: 'x' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('ajustar · sin motivo devuelve 400', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleAjustar({ project_slug: 'vapers', producto_id: 'vape-A', delta: 1 });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  // ===========================================================
  // Group 6: Expiracion automatica
  // ===========================================================

  await testAsync('expirar · reservas vencidas se liberan + publican inventario.reserva.expirada', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    // Crear reserva manualmente con expira_at en el pasado
    const file = path.join(TMP_ROOT, 'data', 'projects', 'vapers', 'inventario.json');
    const store = JSON.parse(fs.readFileSync(file, 'utf8'));
    store.productos['vape-A'].reservas = [{
      pedido_id: 'ped-old', cantidad: 2,
      expira_at: new Date(Date.now() - 1000).toISOString(),
      created_at: new Date(Date.now() - 60000).toISOString()
    }];
    fs.writeFileSync(file, JSON.stringify(store, null, 2));

    const expiradas = await m._expirarReservasVencidas(Date.now());
    assert.strictEqual(expiradas.length, 1);
    assert.strictEqual(expiradas[0].pedido_id, 'ped-old');

    const evs = publishedOf(mocks, 'inventario.reserva.expirada');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].motivo, 'expirada');

    const cons = await m.handleConsultar({ project_slug: 'vapers', producto_id: 'vape-A' });
    assert.strictEqual(cons.data.reservas_vivas_count, 0);
    assert.strictEqual(cons.data.stock_disponible, 10);
    await m.onUnload();
  });

  await testAsync('expirar · no toca reservas vivas', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleReservar({ project_slug: 'vapers', producto_id: 'vape-A', cantidad: 2, pedido_id: 'ped-viva' });
    mocks.published.length = 0;
    const expiradas = await m._expirarReservasVencidas(Date.now());
    assert.strictEqual(expiradas.length, 0);
    assert.strictEqual(publishedOf(mocks, 'inventario.reserva.expirada').length, 0);
    const cons = await m.handleConsultar({ project_slug: 'vapers', producto_id: 'vape-A' });
    assert.strictEqual(cons.data.reservas_vivas_count, 1);
    await m.onUnload();
  });

  // ===========================================================
  // Group 7: estado_catalogo
  // ===========================================================

  await testAsync('estado_catalogo · devuelve array completo con disponibilidades', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleReservar({ project_slug: 'vapers', producto_id: 'vape-A', cantidad: 4, pedido_id: 'ped-1' });
    const r = await m.handleEstadoCatalogo({ project_slug: 'vapers' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.productos.length, 2);
    const a = r.data.productos.find(p => p.producto_id === 'vape-A');
    assert.strictEqual(a.stock_disponible, 6);
    assert.strictEqual(a.reservas_vivas_cantidad, 4);
    await m.onUnload();
  });

  await testAsync('estado_catalogo · proyecto sin inventario.json devuelve 404', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleEstadoCatalogo({ project_slug: 'no-existe' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    await m.onUnload();
  });

  // ===========================================================
  // Group 8: Subscribes bus (pedido.completado, pedido.cancelado)
  // ===========================================================

  await testAsync('onPedidoCompletado · tipo=tienda confirma reservas', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleReservar({ project_slug: 'vapers', producto_id: 'vape-A', cantidad: 2, pedido_id: 'ped-1' });
    mocks.published.length = 0;
    await m.onPedidoCompletado({ data: { tipo: 'tienda', project_slug: 'vapers', pedido_id: 'ped-1' } });
    const cons = await m.handleConsultar({ project_slug: 'vapers', producto_id: 'vape-A' });
    assert.strictEqual(cons.data.stock_real, 8);
    assert.strictEqual(cons.data.reservas_vivas_count, 0);
    await m.onUnload();
  });

  await testAsync('onPedidoCompletado · tipo!=tienda es ignorado', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleReservar({ project_slug: 'vapers', producto_id: 'vape-A', cantidad: 2, pedido_id: 'ped-1' });
    await m.onPedidoCompletado({ data: { tipo: 'pos', project_slug: 'vapers', pedido_id: 'ped-1' } });
    const cons = await m.handleConsultar({ project_slug: 'vapers', producto_id: 'vape-A' });
    assert.strictEqual(cons.data.stock_real, 10, 'POS no debe tocar el stock');
    assert.strictEqual(cons.data.reservas_vivas_count, 1);
    await m.onUnload();
  });

  await testAsync('onPedidoCancelado · libera reservas', async () => {
    setupProyectoVapers();
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleReservar({ project_slug: 'vapers', producto_id: 'vape-A', cantidad: 2, pedido_id: 'ped-c' });
    await m.onPedidoCancelado({ data: { tipo: 'tienda', project_slug: 'vapers', pedido_id: 'ped-c', motivo: 'test' } });
    const cons = await m.handleConsultar({ project_slug: 'vapers', producto_id: 'vape-A' });
    assert.strictEqual(cons.data.stock_real, 10);
    assert.strictEqual(cons.data.reservas_vivas_count, 0);
    await m.onUnload();
  });

  // ===========================================================
  // Group 9: SafeUpdate (servicio puro)
  // ===========================================================

  await testAsync('safeUpdate · crea archivo si no existe', async () => {
    const su = new SafeUpdate();
    const file = path.join(TMP_ROOT, 'safe-test-1.json');
    const result = await su.update(file, (snap) => {
      assert.strictEqual(snap, null);
      return { x: 1 };
    });
    assert.deepStrictEqual(result, { x: 1 });
    const raw = await fsp.readFile(file, 'utf8');
    assert.deepStrictEqual(JSON.parse(raw), { x: 1 });
  });

  await testAsync('safeUpdate · mutator que devuelve undefined es no-op', async () => {
    const su = new SafeUpdate();
    const file = path.join(TMP_ROOT, 'safe-test-2.json');
    await fsp.writeFile(file, JSON.stringify({ y: 2 }));
    const result = await su.update(file, () => undefined);
    assert.strictEqual(result, null);
    const raw = await fsp.readFile(file, 'utf8');
    assert.deepStrictEqual(JSON.parse(raw), { y: 2 }, 'archivo no debe cambiar');
  });

  await testAsync('safeUpdate · 50 updates concurrentes mantienen contador correcto', async () => {
    const su = new SafeUpdate();
    const file = path.join(TMP_ROOT, 'safe-test-3.json');
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(su.update(file, (snap) => {
        const s = snap || { n: 0 };
        s.n = (s.n || 0) + 1;
        return s;
      }));
    }
    await Promise.all(promises);
    const raw = await fsp.readFile(file, 'utf8');
    assert.strictEqual(JSON.parse(raw).n, 50, 'sin lock perderia updates; lock garantiza 50');
  });

  teardownTmpCwd();
  console.log('\nTodos los tests pasaron.');
})().catch(e => {
  teardownTmpCwd();
  console.error(e);
  process.exit(1);
});

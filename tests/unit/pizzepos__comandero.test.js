/**
 * Tests unitarios — pizzepos/comandero (POC2 reescritura).
 *
 * Aislamiento: tests con persistencia usan tmpdir + override de _bufferFile.
 *
 * Ejecutar: node tests/unit/pizzepos__comandero.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const fsp    = require('fs').promises;
const os     = require('os');

const ComanderoModule = require('../../modules/pizzepos/comandero/index.js');

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
    increment: (n, l) => metricsCalls.push(['increment', n, l]),
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
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'comandero-test-'));
  tmpDirs.push(d);
  return d;
}
function cleanupTmp() {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

async function instantiate(mocks, opts = {}) {
  const m = new ComanderoModule();
  // Override _bufferFile pre-onLoad para no contaminar el repo
  if (opts.bufferFile) m._bufferFile = opts.bufferFile;
  else m._bufferFile = path.join(makeTmpDir(), 'buffers.json');

  await m.onLoad({
    logger:   mocks.logger,
    metrics:  mocks.metrics,
    eventBus: mocks.eventBus
  });
  // Cancelar timer pendiente para tests deterministas
  if (m._saveTimer) { clearTimeout(m._saveTimer); m._saveTimer = null; }
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
  console.log('pizzepos/comandero — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa caches vacias', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'comandero');
    assert.strictEqual(m.version, '3.0.0');
    assert.strictEqual(m.pedidos.size, 0);
    assert.strictEqual(m.productosCache.size, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia caches y cancela timer', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.pedidos.set('c1', { items: [], notas: '', total: 0 });
    m.productosCache.set('p1', { precio: 10 });
    m._saveTimer = setTimeout(() => {}, 60000);
    await m.onUnload();
    assert.strictEqual(m.pedidos.size, 0);
    assert.strictEqual(m.productosCache.size, 0);
  });

  // ==========================================
  // Group 2: Validacion canonica
  // ==========================================

  await testAsync('handleGetPedido sin cuenta_id → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetPedido({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'cuenta_id');
    await m.onUnload();
  });

  await testAsync('handleRemoveItem con pedido inexistente → 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleRemoveItem({ cuenta_id: 'fantasma', item_id: 'i-1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleEnviarCocina sin items → 409 CONFLICT_STATE', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleEnviarCocina({ cuenta_id: 'c1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'CONFLICT_STATE');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Bus subscribes — cache + reset
  // ==========================================

  await testAsync('onCuentaCreada cachea ref_display', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCuentaCreada({ data: { cuenta_id: 'c1', ref_display: 'M 001' }});
    assert.strictEqual(m.refDisplayCache.get('c1'), 'M 001');
    await m.onUnload();
  });

  await testAsync('onCatalogoActualizado cachea productos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCatalogoActualizado({ data: { productos: [
      { id: 'p1', nombre: 'Pizza', precio: 10 },
      { id: 'p2', nombre: 'Cola',  precio: 3 }
    ]}});
    assert.strictEqual(m.productosCache.size, 2);
    assert.strictEqual(m.productosCache.get('p1').precio, 10);
    await m.onUnload();
  });

  await testAsync('onCartaActualizada cachea productos por carta_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCartaActualizada({ data: {
      meta: { id: 'carta-glovo' },
      productos: [{ id: 'p1', nombre: 'Pizza', precio: 13 }]
    }});
    const carta = m.cartasProductosCache.get('carta-glovo');
    assert.ok(carta);
    assert.strictEqual(carta.get('p1').precio, 13);
    await m.onUnload();
  });

  await testAsync('onCajaCerrada y onDiaIniciado vacian buffers', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.pedidos.set('c1', { items: [{ id: 'i-1' }], notas: '', total: 0 });
    await m.onCajaCerrada({ data: {} });
    assert.strictEqual(m.pedidos.size, 0);

    m.pedidos.set('c1', { items: [{ id: 'i-1' }], notas: '', total: 0 });
    await m.onDiaIniciado({ data: {} });
    assert.strictEqual(m.pedidos.size, 0);
    await m.onUnload();
  });

  // ==========================================
  // Group 4: UI handlers — add/remove/update
  // ==========================================

  await testAsync('handleAddItem añade item + publica comandero.item_agregado con project_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;

    const r = await m.handleAddItem({
      cuenta_id: 'mesa_5_xxx', producto_id: 'p1', nombre: 'Pizza', precio: 10, cantidad: 2,
      project_id: 'proj-X', correlation_id: 'cid-AI'
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.item.subtotal, 20);
    assert.strictEqual(r.data.pedido.total, 20);

    const evs = publishedOf(mocks, 'comandero.item_agregado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid-AI');
    assert.strictEqual(evs[0].project_id, 'proj-X');
    assert.strictEqual(evs[0].cantidad, 2);
    assert.strictEqual(evs[0].precio_total, 20);
    await m.onUnload();
  });

  await testAsync('handleAddItem aplica precio canonico desde cache', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.productosCache.set('p1', { nombre: 'Pizza', precio: 10 });

    const r = await m.handleAddItem({ cuenta_id: 'mesa_x', producto_id: 'p1', cantidad: 1 });
    assert.strictEqual(r.data.item.precio, 10);
    assert.strictEqual(r.data.item.nombre, 'Pizza');
    await m.onUnload();
  });

  await testAsync('handleRemoveItem elimina item + publica + actualiza total', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const added = await m.handleAddItem({ cuenta_id: 'c1', producto_id: 'p1', precio: 10, cantidad: 1 });
    mocks.published.length = 0;

    const r = await m.handleRemoveItem({ cuenta_id: 'c1', item_id: added.data.item.id });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.pedido.total, 0);
    const evs = publishedOf(mocks, 'comandero.item_eliminado');
    assert.strictEqual(evs.length, 1);
    await m.onUnload();
  });

  await testAsync('handleUpdateItem cambia cantidad + publica item_actualizado con diff', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const added = await m.handleAddItem({ cuenta_id: 'c1', producto_id: 'p1', precio: 10, cantidad: 1 });
    mocks.published.length = 0;

    const r = await m.handleUpdateItem({ cuenta_id: 'c1', item_id: added.data.item.id, cantidad: 3 });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.item.cantidad, 3);
    assert.strictEqual(r.data.item.subtotal, 30);

    const evs = publishedOf(mocks, 'comandero.item_actualizado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].diff_cantidad, 2);
    assert.strictEqual(evs[0].diff_precio, 20);
    await m.onUnload();
  });

  await testAsync('handleUpdateItem con cantidad 0 elimina item', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const added = await m.handleAddItem({ cuenta_id: 'c1', producto_id: 'p1', precio: 10, cantidad: 1 });
    mocks.published.length = 0;

    const r = await m.handleUpdateItem({ cuenta_id: 'c1', item_id: added.data.item.id, cantidad: 0 });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.pedido.items.length, 0);
    assert.strictEqual(publishedOf(mocks, 'comandero.item_eliminado').length, 1);
    await m.onUnload();
  });

  await testAsync('handleEnviarCocina marca items y publica comandero.enviar_cocina', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleAddItem({ cuenta_id: 'c1', producto_id: 'p1', precio: 10, cantidad: 1 });
    mocks.published.length = 0;

    const r = await m.handleEnviarCocina({ cuenta_id: 'c1', project_id: 'proj-Y', correlation_id: 'cid-EC' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.items_enviados, 1);
    assert.ok(r.data.pedido_id.startsWith('ped_'));

    const evs = publishedOf(mocks, 'comandero.enviar_cocina');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid-EC');
    assert.strictEqual(evs[0].project_id, 'proj-Y');
    assert.strictEqual(evs[0].items.length, 1);

    // Second send should fail (todos ya enviados)
    const r2 = await m.handleEnviarCocina({ cuenta_id: 'c1' });
    assert.ok(isCanonicalError(r2));
    assert.strictEqual(r2.status, 409);
    await m.onUnload();
  });

  // ==========================================
  // Group 5: Persistencia atomica + restore
  // ==========================================

  await testAsync('_atomicWriteFile escribe via .tmp + rename', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const dir = makeTmpDir();
    const target = path.join(dir, 'a.json');
    await m._atomicWriteFile(target, '{"x":1}');
    assert.strictEqual(await fsp.readFile(target, 'utf-8'), '{"x":1}');
    const tmpExists = await fsp.access(target + '.tmp').then(() => true).catch(() => false);
    assert.strictEqual(tmpExists, false);
    await m.onUnload();
  });

  await testAsync('restaurarBuffers desde archivo previo recupera items no enviados', async () => {
    const dir = makeTmpDir();
    const bufferFile = path.join(dir, 'buffers.json');
    await fsp.writeFile(bufferFile, JSON.stringify({
      buffers: {
        'c1': {
          items: [{ id: 'i-1', producto_id: 'p1', precio: 10, cantidad: 2, subtotal: 20 }],
          notas: 'test',
          total: 20
        }
      }
    }));

    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { bufferFile });
    assert.strictEqual(m.pedidos.size, 1);
    assert.strictEqual(m.pedidos.get('c1').items.length, 1);
    await m.onUnload();
  });

  await testAsync('restaurarBuffers con archivo inexistente arranca con buffers vacios', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.pedidos.size, 0);
    const warns = mocks.logs.filter(l => l[0] === 'warn' && /restaurar|read_error/.test(l[1]));
    assert.strictEqual(warns.length, 0, 'ENOENT NO debe loguear warn');
    await m.onUnload();
  });

  // ==========================================
  // Group 6: Helpers internos
  // ==========================================

  await testAsync('_detectarCanalCuenta detecta prefijos canonicos y legacy', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._detectarCanalCuenta('mesa_5_xxx'),     'mesa');
    assert.strictEqual(m._detectarCanalCuenta('M_xxx'),          'mesa');
    assert.strictEqual(m._detectarCanalCuenta('llevar_42_xxx'),  'llevar');
    assert.strictEqual(m._detectarCanalCuenta('llevadoo_xxx'),   'llevadoo');
    assert.strictEqual(m._detectarCanalCuenta('D_xxx'),          'llevadoo');
    assert.strictEqual(m._detectarCanalCuenta(null),             'mesa');
    await m.onUnload();
  });

  await testAsync('_resolverPrecioCanal usa carta del canal cuando existe', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    // Simular tarifas module + carta
    m._tarifasModule = { resolverCarta: (canal) => canal === 'glovo' ? 'carta-glovo' : null };
    m.cartasProductosCache.set('carta-glovo', new Map([['p1', { precio: 13 }]]));

    assert.strictEqual(m._resolverPrecioCanal('p1', 10, 'mesa'), 10, 'mesa usa precio base');
    assert.strictEqual(m._resolverPrecioCanal('p1', 10, 'glovo'), 13, 'glovo usa carta del canal');
    assert.strictEqual(m._resolverPrecioCanal('p999', 10, 'glovo'), 10, 'fallback a base si no en carta');
    await m.onUnload();
  });

  await testAsync('_calcularTotal suma subtotales', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._calcularTotal([{ subtotal: 10 }, { subtotal: 5.5 }]), 15.5);
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

  await testAsync('_classifyHandlerError mapea ENOENT/conflict/required', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'ENOENT' })), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('already sent conflict')), 'CONFLICT_STATE');
    assert.strictEqual(m._classifyHandlerError(new Error('weird')), 'INTERNAL_ERROR');
    await m.onUnload();
  });

  await testAsync('_publicarEvento hereda correlation_id, defaultea project_id', async () => {
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

  await testAsync('_handleHandlerError mapea status y registra metric comandero.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.metricsCalls.length = 0;
    const err = Object.assign(new Error('conflict'), { _code: 'CONFLICT_STATE' });
    const r = m._handleHandlerError('t.failed', err, 'kind');
    assert.strictEqual(r.status, 409);
    const metric = mocks.metricsCalls.find(c => c[1] === 'comandero.errors');
    assert.ok(metric);
    await m.onUnload();
  });

  cleanupTmp();
  console.log('\nTodos los tests pasaron.');
  process.exit(0);
})();

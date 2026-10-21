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
    const MANIFEST = require('../../modules/pizzepos/comandero/module.json');
    assert.strictEqual(m.version, MANIFEST.version);
    assert.strictEqual(m.pedidos.size, 0);
    assert.strictEqual(m.productosCache.size, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia caches y cancela timer', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.pedidos.set('c1', { items: [], notas: '', total: 0 });
    m._productosDe('default').set('p1', { precio: 10 });
    m.tarifasConfigPorProject.set('proj-x', { general: 'g', canales: { glovo: 'cg' } });
    m._saveTimer = setTimeout(() => {}, 60000);
    await m.onUnload();
    assert.strictEqual(m.pedidos.size, 0);
    assert.strictEqual(m.productosCache.size, 0);
    assert.strictEqual(m.tarifasConfigPorProject.size, 0);
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
    assert.strictEqual(m._productosDe('default').size, 2);
    assert.strictEqual(m._productosDe('default').get('p1').precio, 10);
    await m.onUnload();
  });

  // ── CACHE QUE NO SE PUDRE (v3.6.1) ─────────────────────────────────────────
  // El cache base era un Map plano SIN purga: catalogo.actualizado solo hacía .set(), así que
  // un producto retirado seguía cobrándose y los productos de otra carta se acumulaban
  // (el POS declaró 63 productos con una carta de 22).
  await testAsync('catalogo.actualizado REEMPLAZA el cache (no acumula productos retirados)', async () => {
    const { module: m } = await instantiate(makeMocks());
    await m.onCatalogoActualizado({ data: { project_id: 'pr', productos: [
      { id: 'p1', nombre: 'Pizza', precio: 10 },
      { id: 'p2', nombre: 'Vieja', precio: 5 }
    ]}});
    assert.strictEqual(m._productosDe('pr').size, 2);
    await m.onCatalogoActualizado({ data: { project_id: 'pr', productos: [
      { id: 'p1', nombre: 'Pizza', precio: 12 }
    ]}});
    assert.strictEqual(m._productosDe('pr').size, 1, 'el producto retirado no debe sobrevivir');
    assert.strictEqual(m._productosDe('pr').get('p2'), undefined);
    assert.strictEqual(m._productosDe('pr').get('p1').precio, 12);
    await m.onUnload();
  });

  await testAsync('catalogo.actualizado con productos:[] VACÍA el cache del proyecto (carta borrada)', async () => {
    const { module: m } = await instantiate(makeMocks());
    await m.onCatalogoActualizado({ data: { project_id: 'pr', productos: [
      { id: 'p1', nombre: 'Pizza', precio: 10 }
    ]}});
    assert.strictEqual(m._productosDe('pr').size, 1);
    await m.onCatalogoActualizado({ data: { project_id: 'pr', productos: [] } });
    assert.strictEqual(m.productosCache.get('pr').size, 0);
    await m.onUnload();
  });

  await testAsync('catalogo.actualizado sin array productos NO toca el cache (forma `catalogo` de producto-manager)', async () => {
    const { module: m } = await instantiate(makeMocks());
    await m.onCatalogoActualizado({ data: { project_id: 'pr', productos: [
      { id: 'p1', nombre: 'Pizza', precio: 10 }
    ]}});
    // producto-manager publica { project_id, catalogo:{...} } — 0 productos: si esto vaciara,
    // el POS cobraría 0 hasta la siguiente proyección.
    await m.onCatalogoActualizado({ data: { project_id: 'pr', catalogo: { productos: [] }, motivo: 'clonar' } });
    assert.strictEqual(m._productosDe('pr').size, 1, 'la señal cruda no debe vaciar el cache base');
    await m.onUnload();
  });

  await testAsync('el cache base esta AISLADO por proyecto (un proyecto no cobra con el catalogo de otro)', async () => {
    const { module: m } = await instantiate(makeMocks());
    await m.onCatalogoActualizado({ data: { project_id: 'A', productos: [
      { id: 'pizza_a', nombre: 'De A', precio: 10 }
    ]}});
    await m.onCatalogoActualizado({ data: { project_id: 'B', productos: [
      { id: 'pizza_b', nombre: 'De B', precio: 20 }
    ]}});
    assert.strictEqual(m._productosDe('A').size, 1);
    assert.strictEqual(m._productosDe('B').size, 1);
    assert.strictEqual(m._productosDe('A').get('pizza_b'), undefined);
    assert.strictEqual(m._totalProductosCache(), 2);
    await m.onUnload();
  });

  await testAsync('handleAddItem sin project_id usa el catalogo del proyecto por defecto', async () => {
    const { module: m } = await instantiate(makeMocks());
    await m.onCatalogoActualizado({ data: { project_id: 'default', productos: [
      { id: 'p1', nombre: 'Pizza', precio: 9.5 }
    ]}});
    const r = await m.handleAddItem({ cuenta_id: 'mesa_1', producto_id: 'p1', cantidad: 1 });
    assert.strictEqual(r.data.item.precio, 9.5);
    assert.strictEqual(r.data.item.nombre, 'Pizza');
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

  await testAsync('onTarifasConfigActualizada hidrata cache local por project_id (snapshot)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onTarifasConfigActualizada({ data: {
      project_id: 'proj-X',
      tipo: 'snapshot',
      config: {
        general: 'carta-base',
        canales: { glovo: 'carta-glovo', llevadoo: 'carta-delivery' },
        variantes: []
      }
    }});
    const cached = m.tarifasConfigPorProject.get('proj-X');
    assert.ok(cached);
    assert.strictEqual(cached.general, 'carta-base');
    assert.strictEqual(cached.canales.glovo, 'carta-glovo');
    assert.strictEqual(cached.canales.llevadoo, 'carta-delivery');
    await m.onUnload();
  });

  await testAsync('onTarifasConfigActualizada con cambio posterior hace full-replace', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.tarifasConfigPorProject.set('proj-X', {
      general: 'old',
      canales: { glovo: 'old-glovo', llevadoo: 'old-llev' }
    });
    await m.onTarifasConfigActualizada({ data: {
      project_id: 'proj-X',
      tipo: 'assign',
      config: { general: 'new', canales: { glovo: 'new-glovo' }, variantes: [] }
    }});
    const cached = m.tarifasConfigPorProject.get('proj-X');
    assert.strictEqual(cached.general, 'new');
    assert.deepStrictEqual(cached.canales, { glovo: 'new-glovo' }, 'full-replace: llevadoo eliminado');
    await m.onUnload();
  });

  await testAsync('onTarifasConfigActualizada sin project_id o sin config es no-op', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onTarifasConfigActualizada({ data: { tipo: 'snapshot' }});
    await m.onTarifasConfigActualizada({ data: { project_id: 'p1' }});
    assert.strictEqual(m.tarifasConfigPorProject.size, 0);
    await m.onUnload();
  });

  await testAsync('onLoad publica tarifas.config.solicitada para hidratar el cache', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const evs = publishedOf(mocks, 'tarifas.config.solicitada');
    assert.strictEqual(evs.length, 1, 'debe pedir snapshot al cargar');
    assert.ok(evs[0].correlation_id, 'lleva correlation_id');
    assert.ok(evs[0].timestamp, 'lleva timestamp');
    await m.onUnload();
  });

  // El hueco real NO es una carrera de suscripcion (el loader cablea antes de onLoad): es que en
  // arranque en frio tarifas todavia no existe y la peticion se queda sin respondedor. Por eso se
  // repite en los dos momentos deterministas. Sin timers.
  await testAsync('core.modules.loaded.all re-pide el snapshot (tarifas ya cargado)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(publishedOf(mocks, 'tarifas.config.solicitada').length, 1, 'onLoad ya pidio');

    await m.onCoreModulesLoadedAll();
    const evs = publishedOf(mocks, 'tarifas.config.solicitada');
    assert.strictEqual(evs.length, 2, 're-pide al cargar todos los modulos');
    assert.strictEqual(evs[1].tipo, 'snapshot');
    assert.ok(!evs[1].project_id, 'sin project_id = todos los proyectos conocidos');
    await m.onUnload();
  });

  await testAsync('project.activated re-pide el snapshot scopeado al proyecto', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    await m.onProjectActivado({ data: { project_id: 'proj-A' } });
    const evs = publishedOf(mocks, 'tarifas.config.solicitada');
    assert.strictEqual(evs.length, 2);
    assert.strictEqual(evs[1].project_id, 'proj-A', 'scopeado al proyecto que se activa');

    await m.onProjectActivado({ data: {} });          // sin project_id: no-op
    assert.strictEqual(publishedOf(mocks, 'tarifas.config.solicitada').length, 2, 'sin project_id no pide');
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
    m._productosDe('default').set('p1', { nombre: 'Pizza', precio: 10 });

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

  await testAsync('_resolverPrecioCanal usa cache local de tarifas (sin acceso directo al modulo)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    // Hidratamos el cache local como lo haria el evento tarifas.config.actualizada
    m.tarifasConfigPorProject.set('default', {
      general: null,
      canales: { glovo: 'carta-glovo' }
    });
    m.cartasProductosCache.set('carta-glovo', new Map([['p1', { precio: 13 }]]));

    assert.strictEqual(m._resolverPrecioCanal('p1', 10, 'mesa'), 10, 'mesa usa precio base');
    assert.strictEqual(m._resolverPrecioCanal('p1', 10, 'glovo'), 13, 'glovo usa carta del canal');
    assert.strictEqual(m._resolverPrecioCanal('p999', 10, 'glovo'), 10, 'fallback a base si producto no en carta');
    assert.strictEqual(m._resolverPrecioCanal('p1', 10, 'whatsapp'), 10, 'canal sin override + sin general → base');
    await m.onUnload();
  });

  await testAsync('_resolverPrecioCanal cae a general cuando canal sin override', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.tarifasConfigPorProject.set('default', {
      general: 'carta-base',
      canales: { glovo: 'carta-glovo' }
    });
    m.cartasProductosCache.set('carta-base',  new Map([['p1', { precio: 11 }]]));
    m.cartasProductosCache.set('carta-glovo', new Map([['p1', { precio: 13 }]]));

    assert.strictEqual(m._resolverPrecioCanal('p1', 10, 'glovo'),    13, 'override de canal');
    assert.strictEqual(m._resolverPrecioCanal('p1', 10, 'whatsapp'), 11, 'sin override usa general');
    await m.onUnload();
  });

  await testAsync('_resolverPrecioCanal sin cache de tarifas devuelve precio base (degrada gracioso)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.cartasProductosCache.set('carta-glovo', new Map([['p1', { precio: 13 }]]));
    // tarifasConfigPorProject sigue vacio
    assert.strictEqual(m._resolverPrecioCanal('p1', 10, 'glovo'), 10);
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
    assert.strictEqual(m._classifyHandlerError(new Error('weird')), 'UNKNOWN_ERROR');
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

  // ==========================================
  // Group: Guarda contra lineas mudas (v3.4.0)
  // ==========================================

  await testAsync('add-item SIN nombre ni producto_id -> 400 y NO entra al buffer (linea fantasma)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleAddItem({ cuenta_id: 'c1', precio: 11, cantidad: 1 });
    assert.ok(isCanonicalError(r), 'debe ser error canonico');
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    // No se creo linea fantasma en el buffer
    const buf = m.pedidos.get('c1');
    assert.ok(!buf || buf.items.length === 0, 'el buffer no debe tener items mudos');
    await m.onUnload();
  });

  await testAsync('add-item con producto_id pero sin nombre -> OK (usa producto_id como nombre)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleAddItem({ cuenta_id: 'c1', producto_id: 'pizza_x', precio: 11, cantidad: 1 });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.item.nombre, 'pizza_x');
    await m.onUnload();
  });

  await testAsync('add-item con nombre -> OK (camino feliz intacto)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleAddItem({ cuenta_id: 'c1', producto_id: 'p1', nombre: 'Bachata', precio: 11, cantidad: 1 });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.item.nombre, 'Bachata');
    assert.strictEqual(m.pedidos.get('c1').items.length, 1);
    await m.onUnload();
  });

  cleanupTmp();

  // Group: precio por canal (v3.5.0)
  await testAsync('carta.actualizada ENVUELTA ({carta}) hidrata cartasProductosCache', async () => {
    const { module: m } = await instantiate(makeMocks());
    await m.onCartaActualizada({ data: { project_id: 'p1', carta: { meta: { id: 'carta_glovo' }, productos: [{ id: 'queso', nombre: 'Queso', precio: 8.5, categoria: 'entrantes' }] } } });
    const cache = m.cartasProductosCache.get('carta_glovo');
    assert.ok(cache, 'la carta del canal debe quedar cacheada');
    assert.strictEqual(cache.get('queso').precio, 8.5);
  });

  await testAsync('el precio del canal se resuelve por carta y cae al base si el producto no está', async () => {
    const { module: m } = await instantiate(makeMocks());
    m.tarifasConfigPorProject.set('p1', { general: 'carta_general', canales: { glovo: 'carta_glovo' } });
    m.cartasProductosCache.set('carta_glovo', new Map([['queso', { nombre: 'Queso', precio: 8.5 }]]));
    m._productosDe('p1').set('queso', { nombre: 'Queso', precio: 6.5 });
    m._productosDe('p1').set('pan', { nombre: 'Pan', precio: 1 });
    assert.strictEqual(m._resolverPrecioCanal('queso', 6.5, 'glovo', 'p1'), 8.5);
    assert.strictEqual(m._resolverPrecioCanal('queso', 6.5, 'mesa', 'p1'), 6.5);
    assert.strictEqual(m._resolverPrecioCanal('pan', 1, 'glovo', 'p1'), 1);   // no está en la carta del canal
  });

  await testAsync('carta.get.response de la GENERAL rellena productosCache (tras restart)', async () => {
    const { module: m } = await instantiate(makeMocks());
    m.tarifasConfigPorProject.set('p1', { general: 'carta_general', canales: { glovo: 'carta_glovo' } });
    m._cartaGetPendientes.set('req-1', { project_id: 'p1', carta_id: 'carta_general' });
    await m.onCartaGetResponse({ data: { request_id: 'req-1', status: 200, data: { meta: { id: 'carta_general' }, productos: [{ id: 'queso', nombre: 'Queso', precio: 6.5, categoria: 'entrantes' }] } } });
    assert.strictEqual(m._productosDe('p1').get('queso').precio, 6.5);
    assert.strictEqual(m._productosDe('p1').get('queso').nombre, 'Queso');
  });

  await testAsync('carta.get.response de una carta de CANAL no toca productosCache', async () => {
    const { module: m } = await instantiate(makeMocks());
    m.tarifasConfigPorProject.set('p1', { general: 'carta_general', canales: { glovo: 'carta_glovo' } });
    m._cartaGetPendientes.set('req-2', { project_id: 'p1', carta_id: 'carta_glovo' });
    await m.onCartaGetResponse({ data: { request_id: 'req-2', status: 200, data: { meta: { id: 'carta_glovo' }, productos: [{ id: 'queso', nombre: 'Queso', precio: 8.5 }] } } });
    assert.strictEqual(m._productosDe('p1').get('queso'), undefined);
    assert.strictEqual(m.cartasProductosCache.get('carta_glovo').get('queso').precio, 8.5);
  });

  // ==========================================================
  // Group: UN SOLO TASADOR (v3.6.0) — el precio lo pone el servidor
  // ==========================================================

  // Carta mínima con la MISMA forma que la real: el delta del extra vive en opciones ELEGIR_VARIOS
  // (delta_precio_centimos), y los valores del grupo QUITAR no llevan precio (quitar es gratis).
  const CARTA_GEN = {
    meta: { id: 'carta_gen' },
    productos: [
      {
        id: 'margarita', nombre: 'Margarita', precio: 8,
        opciones: [
          { modo: 'QUITAR', valores: [{ id: 'tomate', etiqueta: 'Tomate' }, { id: 'mozzarella', etiqueta: 'Mozzarella' }] },
          { modo: 'ELEGIR_VARIOS', max: 5, valores: [
            { id: 'bacon', etiqueta: 'Bacon', delta_precio_centimos: 150 },
            { id: 'jamon_de_york', etiqueta: 'Jamón de york', delta_precio_centimos: 150 },
            { id: 'calabacin', etiqueta: 'Calabacín', delta_precio_centimos: 50 }
          ] }
        ]
      },
      { id: 'pepperoni', nombre: 'Pepperoni', precio: 10, opciones: [
        { modo: 'ELEGIR_VARIOS', max: 5, valores: [{ id: 'bacon', etiqueta: 'Bacon', delta_precio_centimos: 150 }] }
      ] }
    ]
  };

  async function conCarta(opts = {}) {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.tarifasConfigPorProject.set('p1', { general: 'carta_gen', canales: opts.canales || {} });
    await m.onCartaActualizada({ data: { project_id: 'p1', carta: CARTA_GEN } });
    if (opts.cartaCanal) await m.onCartaActualizada({ data: { project_id: 'p1', carta: opts.cartaCanal } });
    return { mocks, m };
  }

  await testAsync('_extrasDeCarta saca el delta de ELEGIR_VARIOS y no del grupo QUITAR', async () => {
    const { m } = await conCarta();
    const cat = m.cartasCompletas.get('carta_gen').ingredientes_catalogo;
    const bacon = cat.find(e => e.id === 'bacon');
    assert.ok(bacon, 'bacon debe estar en el catálogo derivado');
    assert.strictEqual(bacon.precio_extra, 1.5, 'céntimos → euros');
    assert.strictEqual(bacon.nombre, 'Bacon');
    assert.ok(!cat.find(e => e.id === 'tomate'), 'quitar es gratis: los valores QUITAR no son extras');
    await m.onUnload();
  });

  await testAsync('EL BUG DE HOY: en canal llevar el extra YA NO se cae del precio', async () => {
    const { m } = await conCarta();
    const r = await m.handleAddItem({
      project_id: 'p1', cuenta_id: 'llevar_1', producto_id: 'margarita', nombre: 'Margarita',
      precio: 8, cantidad: 1,
      variaciones: { ingredientes_quitar: [], ingredientes_anadir: [{ nombre: 'Bacon', cantidad: 1 }] }
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.item.precio, 9.5, '8 de base + 1,50 de bacon (antes devolvía 8,00)');
    assert.strictEqual(r.data.item.subtotal, 9.5);
    await m.onUnload();
  });

  await testAsync('el precio que manda el cliente se IGNORA: se re-tasa contra la carta', async () => {
    const { m } = await conCarta();
    const r = await m.handleAddItem({
      project_id: 'p1', cuenta_id: 'mesa_3', producto_id: 'margarita', nombre: 'Margarita',
      precio: 0.01, precio_canal_resuelto: true, cantidad: 1
    });
    assert.strictEqual(r.data.item.precio, 8, 'manda la carta, no el 0,01 del cliente');
    await m.onUnload();
  });

  await testAsync('la cantidad multiplica el unitario tasado, no el precio', async () => {
    const { m } = await conCarta();
    const r = await m.handleAddItem({
      project_id: 'p1', cuenta_id: 'llevar_2', producto_id: 'margarita', nombre: 'Margarita',
      precio: 8, cantidad: 3,
      variaciones: { ingredientes_quitar: [], ingredientes_anadir: [{ nombre: 'calabacín', cantidad: 1 }] }
    });
    assert.strictEqual(r.data.item.precio, 8.5);
    assert.strictEqual(r.data.item.subtotal, 25.5);
    assert.strictEqual(r.data.pedido.total, 25.5);
    await m.onUnload();
  });

  await testAsync('mitad y mitad: max(base) + extras de las dos mitades (nombres → ids)', async () => {
    const { m } = await conCarta();
    const r = await m.handleAddItem({
      project_id: 'p1', cuenta_id: 'mesa_4', producto_id: 'margarita', nombre: '½ Margarita + ½ Pepperoni',
      precio: 10, cantidad: 1, tipo: 'mitad_mitad',
      pizza_izquierda: { id: 'margarita', nombre: 'Margarita', anadir: [{ nombre: 'Bacon' }] },
      pizza_derecha:   { id: 'pepperoni', nombre: 'Pepperoni', anadir: [] }
    });
    assert.strictEqual(r.data.item.precio, 11.5, 'max(8,10)=10 + 1,50 de bacon en la mitad izquierda');
    await m.onUnload();
  });

  await testAsync('carta de CANAL: se tasa con el precio del canal, no con la general', async () => {
    const cartaGlovo = { meta: { id: 'carta_glovo' }, productos: [
      { id: 'margarita', nombre: 'Margarita', precio: 9.5, opciones: CARTA_GEN.productos[0].opciones }
    ] };
    const { m } = await conCarta({ canales: { glovo: 'carta_glovo' }, cartaCanal: cartaGlovo });
    const r = await m.handleAddItem({
      project_id: 'p1', cuenta_id: 'glovo_9', producto_id: 'margarita', nombre: 'Margarita',
      precio: 8, cantidad: 1,
      variaciones: { ingredientes_quitar: [], ingredientes_anadir: [{ nombre: 'Bacon' }] }
    });
    assert.strictEqual(r.data.item.precio, 11, '9,50 del canal + 1,50 (antes: 8,00 o 9,50 sin extras)');
    await m.onUnload();
  });

  await testAsync('fallback HONESTO: producto fuera de la carta se cobra como antes y se avisa', async () => {
    const { mocks, m } = await conCarta();
    const r = await m.handleAddItem({
      project_id: 'p1', cuenta_id: 'mesa_5', producto_id: 'porcion', nombre: 'Porción',
      precio: 3.5, cantidad: 1
    });
    assert.strictEqual(r.data.item.precio, 3.5, 'sin carta no se inventa precio: se usa el recibido');
    const avisos = mocks.logs.filter(l => l[1] === 'comandero.tasado.fallback');
    assert.strictEqual(avisos.length, 1, 'el fallback NO es silencioso');
    await m.onUnload();
  });

  await testAsync('cold start (sin carta cacheada) → fallback, no excepción', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.tarifasConfigPorProject.set('p1', { general: 'carta_gen', canales: {} });
    const r = await m.handleAddItem({
      project_id: 'p1', cuenta_id: 'llevar_3', producto_id: 'margarita', nombre: 'Margarita',
      precio: 8, cantidad: 1
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.item.precio, 8);
    assert.strictEqual(mocks.logs.filter(l => l[1] === 'comandero.tasado.fallback').length, 1);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
  process.exit(0);
})();

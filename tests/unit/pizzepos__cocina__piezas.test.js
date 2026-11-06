/**
 * Tests unitarios — cocina: LA COCINA TRABAJA PIEZAS (2 pizzas = 2 piezas, nunca "2x").
 *
 * Regla del negocio (the-pirate): dos pizzas iguales NO se agrupan en una linea "2x".
 * Son dos piezas fisicas, cada una se marca por separado y cada una lleva su ficha con
 * los ingredientes EN EL ORDEN DE LA CARTA (el orden en que se ponen sobre la masa).
 * El aviso de recogida solo sale cuando la cocina marca la ULTIMA pieza.
 *
 * Ejecutar: node tests/unit/pizzepos__cocina__piezas.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CocinaModule = require('../../modules/pizzepos/cocina/index.js');

// --------------------------------------------------
// Harness minimo
// --------------------------------------------------

function makeMocks() {
  const logs = [];
  const published = [];
  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };
  const metrics = { increment: () => {}, gauge: () => {}, timing: () => {} };
  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); },
    request: async () => ({ data: { dispositivos: [] } })
  };
  const uiHandler = { register: () => {}, unregister: () => {} };
  return { logs, published, logger, metrics, eventBus, uiHandler };
}

let TMP_ROOT;
let ORIG_CWD;

function setupTmpCwd() {
  ORIG_CWD = process.cwd();
  TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'cocina-piezas-'));
  process.chdir(TMP_ROOT);
  fs.mkdirSync(path.join(TMP_ROOT, 'data', 'current'), { recursive: true });
}

function teardownTmpCwd() {
  if (ORIG_CWD) process.chdir(ORIG_CWD);
  if (TMP_ROOT) { try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch (_) {} }
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
  return m;
}

function flushSnapshotTimer(m) {
  if (m._snapshotSaveTimer) { clearTimeout(m._snapshotSaveTimer); m._snapshotSaveTimer = null; }
}

function makePedidoEvent(overrides = {}) {
  return {
    metadata: { correlationId: 'cid-piezas' },
    data: {
      pedido_id: overrides.pedido_id || 'p-001',
      cuenta_id: overrides.cuenta_id || 'recogida_1',
      canal: overrides.canal || 'llevar',
      ref_display: overrides.ref_display || 'Paco',
      project_id: overrides.project_id || 'the-pirate',
      items: overrides.items || [],
      ...overrides
    }
  };
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

function isCanonicalSuccess(result) {
  return result && typeof result.status === 'number'
    && result.data && typeof result.data === 'object'
    && !('error' in result);
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

// --------------------------------------------------
// Tests
// --------------------------------------------------

(async () => {
  setupTmpCwd();
  console.log('cocina — piezas sin agrupar (the-pirate)\n');

  await testAsync('2x Milonga entra en cocina como DOS piezas con id propio', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);

    await m.onPedidoEnviadoCocina(makePedidoEvent({
      pedido_id: 'p-doble',
      items: [
        { item_id: 'it-mil', producto_id: 'milonga', nombre: 'Pizza de jamón York (Milonga)',
          cantidad: 2, categoria: 'pizzas',
          ingredientes_base: ['Tomate', 'Jamón de york', 'Mozzarella'] },
        { item_id: 'it-cola', producto_id: 'cola', nombre: 'Coca-Cola', cantidad: 1, categoria: 'bebidas' }
      ]
    }));

    const card = m.pedidosActivos.get('p-doble');
    assert.ok(card, 'el pedido entra en cocina');
    assert.strictEqual(card.items.length, 3, 'dos piezas de pizza + la bebida (nada agrupado)');

    const piezas = card.items.filter(i => i.producto_id === 'milonga');
    assert.deepStrictEqual(piezas.map(i => i.item_id), ['it-mil#1', 'it-mil#2'], 'un id por pieza');
    assert.deepStrictEqual(piezas.map(i => i.pieza), [{ n: 1, de: 2 }, { n: 2, de: 2 }]);
    assert.ok(piezas.every(i => i.cantidad === 1), 'cada pieza va de una en una');

    // ORDEN DE MONTAJE intacto: tal cual lo guarda la carta, sin ordenar ni deduplicar
    for (const p of piezas) {
      assert.deepStrictEqual(p.ingredientes_base, ['Tomate', 'Jamón de york', 'Mozzarella']);
    }

    // Lo que va de uno en uno no lleva marca de pieza
    const cola = card.items.find(i => i.producto_id === 'cola');
    assert.strictEqual(cola.pieza, undefined);
    assert.strictEqual(cola.cantidad, 1);

    flushSnapshotTimer(m);
    await m.onUnload();
  });

  await testAsync('el pedido NO se declara listo hasta la ULTIMA pieza (y el aviso sale UNA vez)', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);

    await m.onPedidoEnviadoCocina(makePedidoEvent({
      pedido_id: 'p-2pizzas',
      items: [{ item_id: 'it-mil', producto_id: 'milonga', nombre: 'Milonga', cantidad: 2, categoria: 'pizzas' }]
    }));
    flushSnapshotTimer(m);

    let r = await m.handlePrepararItem({ item_id: 'it-mil#1', done: true });
    assert.ok(isCanonicalSuccess(r), 'la primera pieza se marca');
    assert.strictEqual(r.data.pedido_completo, false, 'con una pieza fuera el pedido sigue vivo');
    assert.strictEqual(publishedOf(mocks, 'cocina.pedido_listo').length, 0, 'todavia NO hay aviso de recogida');

    r = await m.handlePrepararItem({ item_id: 'it-mil#2', done: true });
    assert.ok(isCanonicalSuccess(r), 'la segunda pieza se marca');
    assert.strictEqual(r.data.pedido_completo, true);
    assert.strictEqual(publishedOf(mocks, 'cocina.pedido_listo').length, 1, 'un solo aviso, al cerrar la ultima pieza');

    flushSnapshotTimer(m);
    await m.onUnload();
  });

  await testAsync('la pieza viaja con su marca en el ticket (para imprimirla en papel)', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);

    await m.onPedidoEnviadoCocina(makePedidoEvent({
      pedido_id: 'p-ticket',
      items: [{ item_id: 'it-mil', producto_id: 'milonga', nombre: 'Milonga', cantidad: 2, categoria: 'pizzas' }]
    }));
    flushSnapshotTimer(m);

    await m.handleRegisterDevice({ device_id: 'd-gen', nombre: 'Pase', tipo_estacion: 'general' });
    await m.handlePrepararItem({ item_id: 'it-mil#1', device_id: 'd-gen', done: true });
    const tickets = publishedOf(mocks, 'cocina.item_ticket');
    assert.strictEqual(tickets.length, 1, 'sale un ticket por pieza');
    assert.deepStrictEqual(tickets[0].pieza, { n: 1, de: 2 }, 'el ticket dice PIEZA 1/2');

    flushSnapshotTimer(m);
    await m.onUnload();
  });

  // Decisión del dueño (the pirate): las bebidas SALEN EN COCINA. No se sacan del
  // pedido de cocina ni se dan por hechas en barra: son una pieza más que alguien marca.
  // Consecuencia asumida: mientras la bebida no se marque, el pedido no se declara listo
  // y el cliente no recibe el aviso de recogida.
  await testAsync('la Coca-Cola es una PIEZA más: hasta que se marca, el pedido no está listo', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);

    await m.onPedidoEnviadoCocina(makePedidoEvent({
      pedido_id: 'p-cola',
      items: [
        { item_id: 'it-mil', producto_id: 'milonga', nombre: 'Milonga', cantidad: 1, categoria: 'pizzas' },
        { item_id: 'it-cola', producto_id: 'cola', nombre: 'Coca-Cola', cantidad: 1, categoria: 'bebidas' }
      ]
    }));
    flushSnapshotTimer(m);

    const card = m.pedidosActivos.get('p-cola');
    assert.strictEqual(card.items.length, 2, 'la bebida entra en cocina como una pieza más');
    assert.ok(card.items.some(i => i.producto_id === 'cola' && i.categoria === 'bebidas'),
      'la bebida no se filtra fuera de cocina');

    let r = await m.handlePrepararItem({ item_id: 'it-mil', done: true });
    assert.ok(isCanonicalSuccess(r), 'la pizza se marca');
    assert.strictEqual(r.data.pedido_completo, false, 'sin la bebida marcada el pedido no está listo');
    assert.strictEqual(publishedOf(mocks, 'cocina.pedido_listo').length, 0, 'todavía no hay aviso al cliente');

    r = await m.handlePrepararItem({ item_id: 'it-cola', done: true });
    assert.ok(isCanonicalSuccess(r), 'la bebida se marca en cocina');
    assert.strictEqual(r.data.pedido_completo, true, 'con la bebida marcada el pedido cierra');
    assert.strictEqual(publishedOf(mocks, 'cocina.pedido_listo').length, 1, 'el aviso sale al marcar la bebida');

    flushSnapshotTimer(m);
    await m.onUnload();
  });

  teardownTmpCwd();
  console.log('\nTodos los tests pasaron.');
})().catch(e => {
  teardownTmpCwd();
  console.error(e);
  process.exit(1);
});

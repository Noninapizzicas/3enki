/**
 * Tests unitarios — pizzepos__productos (v5.0.0 PROYECTOR SIN ESTADO).
 *
 * productos ya no tiene store: proyecta la carta activa (carta-manager) a POS al vuelo.
 * El mock del bus simula al carta-manager reflejo respondiendo carta.get/list.request.
 * Lo que se verifica son las GARANTÍAS de la solución:
 *   - proyección correcta (normaliza el drift categoria/categoria_id, ingredientes→_base),
 *   - sin acumulación (la proyección es pura: misma carta → mismo resultado),
 *   - sin leak cross-project (proyecto sin carta → vacío, NUNCA los datos de otro),
 *   - mutaciones delegan a carta-manager.
 *
 * Ejecutar: node tests/unit/pizzepos__productos.test.js
 */

'use strict';

const assert = require('assert');
const ProductosModule = require('../../modules/pizzepos/productos/index.js');

// Carta fixture con DRIFT deliberado: un producto con `categoria`+`ingredientes` (forma
// menu-generator vieja), otro con `categoria_id`+`ingredientes_base` (forma add_product).
// El proyector debe normalizar ambos a la misma forma POS.
function cartaFixture() {
  return {
    meta: { id: 'carta_nonina', nombre: 'Nonina', version: 6, estado: 'en_servicio' },
    categorias: [
      { id: 'hamburguesas', nombre: 'Hamburguesas', orden: 1 },
      { id: 'pizzicas', nombre: 'Pizzicas', orden: 2 }
    ],
    productos: [
      {
        id: 'hamburguesas_texas', nombre: 'TEXAS', precio: 15.5, categoria: 'hamburguesas',
        ingredientes: [
          { id: 'pan_brioche', nombre: 'Pan brioche', emoji: '🍞', familia: 'otro' },
          { id: 'bacon', nombre: 'Bacon', emoji: '🥓', familia: 'carne' }
        ]
      },
      {
        id: 'pizza_bachata', nombre: 'Pizza Bachata', precio: 10.5, categoria_id: 'pizzicas',
        ingredientes_base: [{ id: 'masa', nombre: 'Masa', emoji: '' }]
      },
      // producto inactivo: el proyector lo descarta
      { id: 'oculto', nombre: 'OCULTA', precio: 1, categoria: 'hamburguesas', activo: false }
    ]
  };
}

// Bus mock: simula el carta-manager reflejo respondiendo a los RPC del proyector.
// fixtures = { cartas: { <id>: carta }, listByProject: { <pid>: [{id,estado}] } }
function makeBus(fixtures = {}) {
  const handlers = new Map();
  const published = [];
  function emit(event, payload) {
    const fns = handlers.get(event);
    if (fns) for (const fn of [...fns]) setImmediate(() => fn({ data: payload }));
  }
  return {
    published,
    subscribe(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
      return () => handlers.get(event)?.delete(fn);
    },
    async publish(event, payload) {
      published.push([event, payload]);
      if (event === 'carta.get.request') {
        const carta = (fixtures.cartas || {})[payload.carta_id] || null;
        emit('carta.get.response', carta
          ? { request_id: payload.request_id, status: 200, data: carta }
          : { request_id: payload.request_id, status: 404, error: { code: 'RESOURCE_NOT_FOUND', message: 'no existe' } });
      } else if (event === 'carta.list.request') {
        const list = (fixtures.listByProject || {})[payload.project_id] || [];
        emit('carta.list.response', { request_id: payload.request_id, status: 200, data: list });
      } else if (event === 'carta.update_product.request') {
        emit('carta.update_product.response', { request_id: payload.request_id, status: 200, data: { carta_version: 7 } });
      } else if (event === 'carta.remove_product.request') {
        emit('carta.remove_product.response', { request_id: payload.request_id, status: 200, data: { producto_id: payload.producto_id } });
      }
    }
  };
}

function makeMocks(fixtures) {
  const logs = [];
  const metricsCalls = [];
  const uiHandled = [];
  const logger = { debug:()=>{}, info:()=>{}, warn:()=>{}, error:(e,p)=>logs.push(['error',e,p]) };
  const metrics = { increment:(n,l)=>metricsCalls.push(['inc',n,l]), gauge:()=>{}, timing:()=>{}, getCounter:()=>0 };
  const eventBus = makeBus(fixtures);
  const uiHandler = {
    register: () => {}, unregister: () => {},
    handle: async (domain, action, data) => {
      uiHandled.push([domain, action, data]);
      if (domain === 'ingredientes' && action === 'list') return { status: 200, data: { ingredientes: [{ id: 'tomate' }] } };
      return { status: 200, data: {} };
    }
  };
  return { logs, metricsCalls, uiHandled, logger, metrics, eventBus, uiHandler };
}

async function instantiate(mocks) {
  const m = new ProductosModule();
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus, uiHandler: mocks.uiHandler, config: {} });
  return m;
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

const isCanonicalError = (r) => r && typeof r.status === 'number' && r.error && typeof r.error.code === 'string' && !('data' in r);
const publishedOf = (mocks, name) => mocks.eventBus.published.filter(p => p[0] === name).map(p => p[1]);

(async () => {
  console.log('pizzepos__productos — v5.0.0 proyector sin estado\n');

  const fxNonina = { cartas: { carta_nonina: cartaFixture() }, listByProject: { 'proj-nonina': [{ id: 'carta_nonina', estado: 'en_servicio' }] } };

  // Group 1: Lifecycle
  await testAsync('onLoad: version 5.0.0, sin store, solo mapping', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    assert.strictEqual(m.name, 'productos');
    assert.strictEqual(m.version, '5.0.0');
    assert.strictEqual(m.productosPerProject, undefined);   // store ELIMINADO
    assert.strictEqual(m.mappingCanalesPerProject.size, 0);
    await m.onUnload();
  });

  // Group 2: Validación canónica
  await testAsync('handleListProductos sin project_id → 400 INVALID_INPUT', async () => {
    const m = await instantiate(makeMocks());
    const r = await m.handleListProductos({});
    assert.ok(isCanonicalError(r) && r.status === 400 && r.error.code === 'INVALID_INPUT');
  });

  await testAsync('handleCartaCompleta sin project_id → 400 INVALID_INPUT', async () => {
    const m = await instantiate(makeMocks());
    const r = await m.handleCartaCompleta({});
    assert.ok(isCanonicalError(r) && r.status === 400);
  });

  // Group 3: Proyección (la garantía central)
  await testAsync('carta_completa proyecta la carta activa: normaliza drift + ingredientes_base', async () => {
    const m = await instantiate(makeMocks(fxNonina));
    const r = await m.handleCartaCompleta({ project_id: 'proj-nonina' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.carta_id, 'carta_nonina');
    // 2 activos (el inactivo se descarta)
    assert.strictEqual(r.data.productos.length, 2);
    const texas = r.data.productos.find(p => p.id === 'hamburguesas_texas');
    const bachata = r.data.productos.find(p => p.id === 'pizza_bachata');
    // drift normalizado: ambos exponen categoria_id
    assert.strictEqual(texas.categoria_id, 'hamburguesas');
    assert.strictEqual(bachata.categoria_id, 'pizzicas');
    // ingredientes → ingredientes_base conservando id+familia
    assert.strictEqual(texas.ingredientes_base.length, 2);
    assert.strictEqual(texas.ingredientes_base[0].familia, 'otro');
    assert.strictEqual(texas.tiene_variaciones, true);
    // ingredientes (fuente única) inyectados
    assert.deepStrictEqual(r.data.ingredientes, [{ id: 'tomate' }]);
  });

  await testAsync('SIN ACUMULACIÓN: dos llamadas → mismo resultado (proyección pura)', async () => {
    const m = await instantiate(makeMocks(fxNonina));
    const r1 = await m.handleCartaCompleta({ project_id: 'proj-nonina' });
    const r2 = await m.handleCartaCompleta({ project_id: 'proj-nonina' });
    assert.strictEqual(r1.data.productos.length, 2);
    assert.strictEqual(r2.data.productos.length, 2);   // no 4: no hay store que acumule
  });

  await testAsync('list filtra por categoria_id sobre la proyección', async () => {
    const m = await instantiate(makeMocks(fxNonina));
    const r = await m.handleListProductos({ project_id: 'proj-nonina', categoria_id: 'pizzicas' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.productos.length, 1);
    assert.strictEqual(r.data.productos[0].id, 'pizza_bachata');
  });

  await testAsync('pizzas detecta por categoria_id "pizz*"', async () => {
    const m = await instantiate(makeMocks(fxNonina));
    const r = await m.handleListPizzas({ project_id: 'proj-nonina' });
    assert.strictEqual(r.data.pizzas.length, 1);
    assert.strictEqual(r.data.pizzas[0].id, 'pizza_bachata');
  });

  // Group 4: Aislamiento (el leak muere)
  await testAsync('SIN LEAK: proyecto sin carta → carta_completa 404, NO los datos de otro', async () => {
    // bus conoce la carta de nonina, pero pedimos proj-vacio (sin carta en su lista)
    const mocks = makeMocks(fxNonina);
    const m = await instantiate(mocks);
    const r = await m.handleCartaCompleta({ project_id: 'proj-vacio' });
    assert.ok(isCanonicalError(r) && r.status === 404);   // vacío, no hereda nonina
  });

  await testAsync('SIN LEAK: list de proyecto sin carta → array vacío', async () => {
    const m = await instantiate(makeMocks(fxNonina));
    const r = await m.handleListProductos({ project_id: 'proj-vacio' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.productos.length, 0);
  });

  // Group 5: Resolución de carta activa
  await testAsync('resuelve carta activa por tarifas.general si está fijado', async () => {
    const m = await instantiate(makeMocks(fxNonina));
    m.mappingCanalesPerProject.set('proj-nonina', { general: 'carta_nonina' });
    const cid = await m._resolverCartaActiva('proj-nonina');
    assert.strictEqual(cid, 'carta_nonina');
  });

  await testAsync('fallback a en_servicio vía carta.list cuando no hay general', async () => {
    const m = await instantiate(makeMocks(fxNonina));
    const cid = await m._resolverCartaActiva('proj-nonina');
    assert.strictEqual(cid, 'carta_nonina');   // de la list, estado en_servicio
  });

  // Group 6: Mutaciones delegan a carta-manager
  await testAsync('update producto DELEGA a carta.update_product.request', async () => {
    const mocks = makeMocks(fxNonina);
    const m = await instantiate(mocks);
    const r = await m.handleUpdateProducto({ project_id: 'proj-nonina', id: 'hamburguesas_texas', precio: 16 });
    assert.strictEqual(r.status, 200);
    const reqs = publishedOf(mocks, 'carta.update_product.request');
    assert.strictEqual(reqs.length, 1);
    assert.strictEqual(reqs[0].producto_id, 'hamburguesas_texas');
    assert.strictEqual(reqs[0].campos.precio, 16);
    assert.strictEqual(reqs[0].carta_id, 'carta_nonina');
  });

  await testAsync('delete producto DELEGA a carta.remove_product.request', async () => {
    const mocks = makeMocks(fxNonina);
    const m = await instantiate(mocks);
    const r = await m.handleDeleteProducto({ project_id: 'proj-nonina', id: 'pizza_bachata' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(publishedOf(mocks, 'carta.remove_product.request').length, 1);
  });

  // Group 7: Señal de refresco
  await testAsync('onCartaGenerada emite catalogo.actualizado (señal) con proyección lite', async () => {
    const mocks = makeMocks();
    const m = await instantiate(mocks);
    await m.onCartaGenerada({ data: { project_id: 'proj-nonina', carta: cartaFixture() } });
    const sig = publishedOf(mocks, 'catalogo.actualizado');
    assert.strictEqual(sig.length, 1);
    assert.strictEqual(sig[0].source, 'carta_change');
    assert.strictEqual(sig[0].productos.length, 2);   // solo activos, forma lite
  });

  // Group 8: slugify
  await testAsync('slugify determinista', async () => {
    const m = await instantiate(makeMocks());
    assert.strictEqual(m.slugify('Tomate fresco'), 'tomate_fresco');
    assert.strictEqual(m.slugify('jamón'), 'jamon');
    assert.strictEqual(m.slugify(''), 'sin_nombre');
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });

/**
 * Tests unitarios — pizzepos__variaciones (POC2).
 *
 * Ejecutar: node tests/unit/pizzepos__variaciones.test.js
 */

'use strict';

const assert = require('assert');
const VariacionesModule = require('../../modules/pizzepos/variaciones/index.js');

function makeMocks(opts = {}) {
  const logs = [];
  const published = [];
  const metricsCalls = [];
  const uiHandled = [];

  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };
  const metrics = {
    increment: (n, l) => metricsCalls.push(['increment', n, l]),
    gauge:     (n, v, l) => metricsCalls.push(['gauge', n, v, l]),
    timing:    (n, ms, l) => metricsCalls.push(['timing', n, ms, l]),
    getCounter: () => 0
  };
  const eventBus = { publish: async (e, p) => { published.push([e, p]); } };
  const uiHandler = {
    register: () => {},
    unregister: () => {},
    handle: async (domain, action, data) => {
      uiHandled.push([domain, action, data]);
      if (domain === 'ingredientes' && action === 'get_precio') {
        return { status: 200, data: { precio_extra: opts.precioExtra ?? 1.5 } };
      }
      if (domain === 'ingredientes' && action === 'get') {
        if (opts.ingredientesNoDisponibles && opts.ingredientesNoDisponibles.includes(data?.id)) {
          return { status: 200, data: { disponible: false } };
        }
        return { status: 200, data: { disponible: true } };
      }
      if (domain === 'productos' && action === 'carta_completa') {
        if (opts.cartaCompletaError) return { status: 503, error: { code: 'UPSTREAM_UNREACHABLE', message: 'productos down' } };
        return { status: 200, data: { productos: opts.cartaCompletaProductos || [] } };
      }
      return { status: 200, data: {} };
    }
  };
  return { logs, published, metricsCalls, uiHandled, logger, metrics, eventBus, uiHandler };
}

async function instantiate(mocks) {
  const m = new VariacionesModule();
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus, uiHandler: mocks.uiHandler });
  return { module: m };
}

function configureProducto(m, producto_id, overrides = {}) {
  m.configuraciones.set(producto_id, {
    producto_id,
    grupo: overrides.grupo || 'pizzas',
    precio_base: overrides.precio_base ?? 10,
    permite_quitar: overrides.permite_quitar || ['queso', 'tomate'],
    permite_anadir: overrides.permite_anadir ?? true,
    extras_sugeridos: overrides.extras_sugeridos || [],
    max_ingredientes_extra: overrides.max_ingredientes_extra ?? 5,
    ingredientes_base: overrides.ingredientes_base || ['queso', 'tomate', 'masa']
  });
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

function isCanonicalError(r) {
  return r && typeof r.status === 'number' && r.error
    && typeof r.error.code === 'string'
    && typeof r.error.message === 'string'
    && !('data' in r);
}

function isCanonicalSuccess(r) {
  return r && typeof r.status === 'number' && r.data && !('error' in r);
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

(async () => {
  console.log('pizzepos__variaciones — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad inicializa estado limpio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'variaciones');
    assert.strictEqual(m.version, '4.4.0');
    assert.strictEqual(m.configuraciones.size, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia configuraciones', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    configureProducto(m, 'p1');
    await m.onUnload();
    assert.strictEqual(m.configuraciones.size, 0);
  });

  // Group 2: Validacion canonica
  await testAsync('handleGetVariacionesProducto sin config devuelve 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetVariacionesProducto({ producto_id: 'no-existe' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleValidarVariacion sin producto_id devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleValidarVariacion({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleCalcularPrecio con producto inexistente devuelve 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCalcularPrecio({ producto_id: 'no-existe' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    await m.onUnload();
  });

  // Group 3: Validar variaciones permitidas
  await testAsync('validarVariacion con quitar permitido devuelve valida=true', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    configureProducto(m, 'p1');
    const r = await m.validarVariacion({
      producto_id: 'p1',
      ingredientes_quitar: ['queso'],
      ingredientes_anadir: []
    });
    assert.strictEqual(r.valida, true);
    assert.deepStrictEqual(r.ingredientes_finales, ['tomate', 'masa']);
    await m.onUnload();
  });

  await testAsync('validarVariacion con quitar no permitido devuelve rechazo', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    configureProducto(m, 'p1', { permite_quitar: ['queso'] });
    const r = await m.validarVariacion({
      producto_id: 'p1',
      ingredientes_quitar: ['masa'],
      ingredientes_anadir: []
    });
    assert.strictEqual(r.valida, false);
    assert.ok(r.motivo_rechazo.includes('masa'));
    await m.onUnload();
  });

  await testAsync('validarVariacion con anadir cuando no permite devuelve rechazo', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    configureProducto(m, 'p1', { permite_anadir: false });
    const r = await m.validarVariacion({
      producto_id: 'p1',
      ingredientes_quitar: [],
      ingredientes_anadir: [{ ingrediente_id: 'jamon', cantidad: 1 }]
    });
    assert.strictEqual(r.valida, false);
    await m.onUnload();
  });

  await testAsync('validarVariacion mas alla del max_ingredientes_extra devuelve rechazo', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    configureProducto(m, 'p1', { max_ingredientes_extra: 2 });
    const ingredientes_anadir = [
      { ingrediente_id: 'a', cantidad: 1 },
      { ingrediente_id: 'b', cantidad: 1 },
      { ingrediente_id: 'c', cantidad: 1 }
    ];
    const r = await m.validarVariacion({ producto_id: 'p1', ingredientes_quitar: [], ingredientes_anadir });
    assert.strictEqual(r.valida, false);
    assert.ok(r.motivo_rechazo.includes('Maximo') || r.motivo_rechazo.includes('Máximo'));
    await m.onUnload();
  });

  await testAsync('validarVariacion con ingrediente no disponible devuelve rechazo', async () => {
    const mocks = makeMocks({ ingredientesNoDisponibles: ['piña'] });
    const { module: m } = await instantiate(mocks);
    configureProducto(m, 'p1');
    const r = await m.validarVariacion({
      producto_id: 'p1',
      ingredientes_quitar: [],
      ingredientes_anadir: [{ ingrediente_id: 'piña', cantidad: 1 }]
    });
    assert.strictEqual(r.valida, false);
    assert.ok(r.motivo_rechazo.toLowerCase().includes('disponible'));
    await m.onUnload();
  });

  // Group 4: Calculo de precio
  await testAsync('calcularPrecioExtras suma precios via uiHandler', async () => {
    const mocks = makeMocks({ precioExtra: 2 });
    const { module: m } = await instantiate(mocks);
    configureProducto(m, 'p1');
    const config = m.configuraciones.get('p1');
    const total = await m.calcularPrecioExtras([
      { ingrediente_id: 'a', cantidad: 1 },
      { ingrediente_id: 'b', cantidad: 2 }
    ], config);
    assert.strictEqual(total, 6);
    await m.onUnload();
  });

  await testAsync('calcularPrecioExtras prioriza extras_sugeridos sobre uiHandler', async () => {
    const mocks = makeMocks({ precioExtra: 99 });
    const { module: m } = await instantiate(mocks);
    configureProducto(m, 'p1', {
      extras_sugeridos: [{ ingrediente_id: 'a', precio_extra: 0.5 }]
    });
    const config = m.configuraciones.get('p1');
    const total = await m.calcularPrecioExtras([
      { ingrediente_id: 'a', cantidad: 2 }
    ], config);
    assert.strictEqual(total, 1.0);
    await m.onUnload();
  });

  await testAsync('handleCalcularPrecio devuelve precio_total = base + extras', async () => {
    const mocks = makeMocks({ precioExtra: 2 });
    const { module: m } = await instantiate(mocks);
    configureProducto(m, 'p1', { precio_base: 10 });
    const r = await m.handleCalcularPrecio({
      producto_id: 'p1',
      ingredientes_anadir: [{ ingrediente_id: 'jamon', cantidad: 1 }]
    });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.precio_total, 12);
    await m.onUnload();
  });

  // Group 5: Bus subscribers
  await testAsync('onProductoCreado registra config si trae variaciones', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onProductoCreado({
      data: {
        producto_id: 'p1',
        categoria: 'pizzas',
        precio: 10,
        variaciones: { permite_quitar: ['queso'], permite_anadir: true, max_ingredientes_extra: 3 },
        ingredientes_base: [{ id: 'queso' }, { id: 'tomate' }]
      }
    });
    const config = m.configuraciones.get('p1');
    assert.ok(config);
    assert.strictEqual(config.precio_base, 10);
    assert.strictEqual(config.max_ingredientes_extra, 3);
    assert.deepStrictEqual(config.ingredientes_base, ['queso', 'tomate']);
    await m.onUnload();
  });

  await testAsync('onProductoCreado sin variaciones es ignorado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onProductoCreado({ data: { producto_id: 'p1', categoria: 'bebidas' } });
    assert.strictEqual(m.configuraciones.size, 0);
    await m.onUnload();
  });

  await testAsync('onProjectActivated WARM configura desde productos.carta_completa', async () => {
    const mocks = makeMocks({
      cartaCompletaProductos: [
        { id: 'hamburguesas_texas', categoria_id: 'hamburguesas', precio: 15.5,
          variaciones: { permite_quitar: ['bacon'], permite_anadir: true, max_ingredientes_extra: 3,
                         extras_sugeridos: [{ ingrediente_id: 'queso', precio_extra: 1 }] },
          ingredientes_base: [{ id: 'bacon' }, { id: 'queso' }] },
        { id: 'pizzas_margarita', categoria_id: 'pizzas', precio: 9 }   // sin variaciones → defaults
      ]
    });
    const { module: m } = await instantiate(mocks);
    await m.onProjectActivated({ data: { project_id: 'proj-nonina', correlation_id: 'cid-warm' } });
    assert.strictEqual(m.configuraciones.size, 2);
    const texas = m.configuraciones.get('hamburguesas_texas');
    assert.strictEqual(texas.permite_anadir, true);
    assert.strictEqual(texas.max_ingredientes_extra, 3);
    assert.deepStrictEqual(texas.extras_sugeridos, [{ ingrediente_id: 'queso', precio_extra: 1 }]);
    assert.deepStrictEqual(texas.ingredientes_base, ['bacon', 'queso']);
    const marga = m.configuraciones.get('pizzas_margarita');
    assert.strictEqual(marga.permite_anadir, true);              // default: SI se puede anadir salvo negacion explicita
    assert.strictEqual(marga.max_ingredientes_extra, 5);          // default
    // pidió la carta al reflejo de productos
    assert.ok(mocks.uiHandled.some(([d, a]) => d === 'productos' && a === 'carta_completa'));
    await m.onUnload();
  });

  await testAsync('onProjectActivated WARM es best-effort si productos no responde', async () => {
    const mocks = makeMocks({ cartaCompletaError: true });
    const { module: m } = await instantiate(mocks);
    await m.onProjectActivated({ data: { project_id: 'proj-nonina' } });
    assert.strictEqual(m.configuraciones.size, 0);                // no rompe; queda vacío
    await m.onUnload();
  });

  await testAsync('onComanderoItemAgregado con variacion valida emite variacion.validada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    configureProducto(m, 'p1');
    await m.onComanderoItemAgregado({
      metadata: { correlationId: 'cid-var' },
      data: {
        producto_id: 'p1',
        variaciones: { ingredientes_quitar: ['queso'], ingredientes_anadir: [] }
      }
    });
    const evs = publishedOf(mocks, 'variacion.validada');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid-var');
    assert.ok(evs[0].timestamp);
    await m.onUnload();
  });

  await testAsync('onComanderoItemAgregado con variacion invalida emite variacion.rechazada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    configureProducto(m, 'p1', { permite_quitar: ['queso'] });
    await m.onComanderoItemAgregado({
      data: {
        producto_id: 'p1',
        variaciones: { ingredientes_quitar: ['masa'], ingredientes_anadir: [] }
      }
    });
    const evs = publishedOf(mocks, 'variacion.rechazada');
    assert.strictEqual(evs.length, 1);
    await m.onUnload();
  });

  // Group 6: Handlers UI canonicos
  await testAsync('handleGetVariacionesProducto devuelve config canonical shape', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    configureProducto(m, 'p1');
    const r = await m.handleGetVariacionesProducto({ producto_id: 'p1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.producto_id, 'p1');
    await m.onUnload();
  });

  await testAsync('handleHealthCheck devuelve shape canonico healthy', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealthCheck();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.version, '4.4.0');
    await m.onUnload();
  });

  // Group 7: Helpers POC2
  await testAsync('_errorResponse construye shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._errorResponse(400, 'INVALID_INPUT', 'msg', { f: 'x' });
    assert.deepStrictEqual(r, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { f: 'x' } } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.deepStrictEqual(m._classifyHandlerError(new Error('field is required')), { status: 400, code: 'INVALID_INPUT' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('not found')), { status: 404, code: 'RESOURCE_NOT_FOUND' });
    await m.onUnload();
  });

  await testAsync('_publicarEvento añade correlation_id, project_id top-level y timestamp', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { foo: 1, project_id: 'p-z' }, { correlation_id: 'cid-z' });
    const ev = mocks.published[0][1];
    assert.strictEqual(ev.correlation_id, 'cid-z');
    assert.strictEqual(ev.project_id, 'p-z');
    assert.ok(ev.timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError emite metric variaciones.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'));
    assert.strictEqual(r.status, 404);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'variaciones.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });

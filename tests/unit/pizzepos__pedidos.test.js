/**
 * Tests unitarios — pizzepos__pedidos (POC2).
 *
 * Ejecutar: node tests/unit/pizzepos__pedidos.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PedidosModule = require('../../modules/pizzepos/pedidos/index.js');

let TMP_ROOT, ORIG_CWD;

function setupTmpCwd() {
  ORIG_CWD = process.cwd();
  TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'pedidos-test-'));
  process.chdir(TMP_ROOT);
  fs.mkdirSync(path.join(TMP_ROOT, 'data', 'current'), { recursive: true });
}

function teardownTmpCwd() {
  if (ORIG_CWD) process.chdir(ORIG_CWD);
  if (TMP_ROOT) {
    try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch (_) {}
  }
}

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
  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); }
  };
  const uiHandler = {
    register: (domain, action, fn) => uiRegistered.push([domain, action]),
    unregister: () => {}
  };
  return { logs, published, metricsCalls, uiRegistered, logger, metrics, eventBus, uiHandler };
}

async function instantiate(mocks, opts = {}) {
  const m = new PedidosModule();
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
  setupTmpCwd();
  console.log('pizzepos__pedidos — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad inicializa estado limpio sin tocar uiHandler (v1.2: el loader auto-wirea tools[])', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'pedidos');
    assert.strictEqual(m.version, '3.1.0');
    assert.strictEqual(m.pedidos.size, 0);
    assert.strictEqual(m.pedidosPorCuenta.size, 0);
    assert.strictEqual(m.pedidosPorProject.size, 0);
    assert.strictEqual(m.productosCache.size, 0);
    assert.strictEqual(mocks.uiRegistered.length, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia maps incluido pedidosPorProject', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.pedidos.set('p1', { items: [] });
    m.pedidosPorCuenta.set('c1', new Set());
    m.pedidosPorProject.set('vapers', new Set());
    m.productosCache.set('prod1', { precio: 10 });
    await m.onUnload();
    assert.strictEqual(m.pedidos.size, 0);
    assert.strictEqual(m.pedidosPorCuenta.size, 0);
    assert.strictEqual(m.pedidosPorProject.size, 0);
    assert.strictEqual(m.productosCache.size, 0);
  });

  // Group 2: Validacion canonica
  await testAsync('handleCreatePedido sin cuenta_id devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreatePedido({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleGetPedido sin pedido devuelve 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetPedido({ id: 'x' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleAgregarItem sin pedido devuelve 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleAgregarItem({ pedido_id: 'no', producto_id: 'p' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    await m.onUnload();
  });

  await testAsync('handleAgregarItem en estado en_cocina devuelve 409 CONFLICT_STATE', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const c = await m.handleCreatePedido({ cuenta_id: 'mesa_1' });
    const pedido_id = c.data.id;
    m.pedidos.get(pedido_id).estado = 'en_cocina';
    const r = await m.handleAgregarItem({ pedido_id, producto_id: 'p' });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'CONFLICT_STATE');
    await m.onUnload();
  });

  await testAsync('handleEnviarCocina con pedido vacio devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const c = await m.handleCreatePedido({ cuenta_id: 'mesa_1' });
    const r = await m.handleEnviarCocina({ id: c.data.id });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  // Group 3: Flujo completo (create → add-item → send-kitchen → complete)
  await testAsync('flujo completo: create → add-item → send-kitchen → complete', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.productosCache.set('pizza-margarita', { nombre: 'Margarita', precio: 10 });

    // create
    const c = await m.handleCreatePedido({ cuenta_id: 'mesa_1', project_id: 'proj-1' });
    assert.strictEqual(c.status, 201);
    const pedido_id = c.data.id;
    assert.strictEqual(c.data.canal, 'mesa');

    // add-item
    const a = await m.handleAgregarItem({ pedido_id, producto_id: 'pizza-margarita', cantidad: 2 });
    assert.strictEqual(a.status, 201);
    assert.strictEqual(a.data.total, 20);

    // send-kitchen
    const sk = await m.handleEnviarCocina({ id: pedido_id });
    assert.strictEqual(sk.status, 200);
    assert.strictEqual(sk.data.estado, 'en_cocina');

    // complete
    const cp = await m.handleCompletarPedido({ id: pedido_id });
    assert.strictEqual(cp.status, 200);
    assert.strictEqual(cp.data.estado, 'completado');

    // events publicados
    assert.strictEqual(publishedOf(mocks, 'pedido.creado').length, 1);
    assert.strictEqual(publishedOf(mocks, 'pedido.item_agregado').length, 1);
    assert.strictEqual(publishedOf(mocks, 'pedido.enviado_cocina').length, 1);
    assert.strictEqual(publishedOf(mocks, 'pedido.completado').length, 1);

    // project_id top-level en eventos
    assert.strictEqual(publishedOf(mocks, 'pedido.creado')[0].project_id, 'proj-1');
    assert.strictEqual(publishedOf(mocks, 'pedido.completado')[0].project_id, 'proj-1');

    await m.onUnload();
  });

  await testAsync('handleEnviarCocina ya en cocina devuelve 409', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.productosCache.set('p1', { precio: 5 });
    const c = await m.handleCreatePedido({ cuenta_id: 'mesa_1' });
    await m.handleAgregarItem({ pedido_id: c.data.id, producto_id: 'p1' });
    await m.handleEnviarCocina({ id: c.data.id });
    const r = await m.handleEnviarCocina({ id: c.data.id });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'CONFLICT_STATE');
    await m.onUnload();
  });

  // Group 4: Bridge comandero
  await testAsync('onComanderoEnviarCocina crea pedido formal + publica creado + enviado_cocina', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onComanderoEnviarCocina({
      metadata: { correlationId: 'cid-bridge' },
      data: {
        cuenta_id: 'M_42',
        items: [{ id: 'i1', producto_id: 'p1', nombre: 'X', cantidad: 1, precio: 10 }],
        total: 10,
        project_id: 'proj-bridge'
      }
    });
    assert.strictEqual(m.pedidos.size, 1);
    const creado = publishedOf(mocks, 'pedido.creado');
    const enviado = publishedOf(mocks, 'pedido.enviado_cocina');
    assert.strictEqual(creado.length, 1);
    assert.strictEqual(enviado.length, 1);
    assert.strictEqual(creado[0].correlation_id, 'cid-bridge');
    assert.strictEqual(creado[0].project_id, 'proj-bridge');
    await m.onUnload();
  });

  await testAsync('onComanderoEnviarCocina con datos incompletos no crea ni publica', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onComanderoEnviarCocina({ data: { cuenta_id: 'mesa_1' } });
    assert.strictEqual(m.pedidos.size, 0);
    assert.strictEqual(publishedOf(mocks, 'pedido.creado').length, 0);
    await m.onUnload();
  });

  // Group 5: Cache productos + cuenta lifecycle
  await testAsync('onCatalogoActualizado popula productosCache', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCatalogoActualizado({
      data: {
        productos: [
          { id: 'p1', nombre: 'A', precio: 10, categoria: 'pizzas' },
          { id: 'p2', nombre: 'B', precio: 5, categoria: 'bebidas' }
        ]
      }
    });
    assert.strictEqual(m.productosCache.size, 2);
    assert.strictEqual(m.productosCache.get('p1').precio, 10);
    await m.onUnload();
  });

  await testAsync('onProductoActualizado actualiza cache de un producto', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onProductoActualizado({ data: { id: 'p1', nombre: 'X', precio: 20, categoria: 'pizzas' } });
    assert.strictEqual(m.productosCache.get('p1').precio, 20);
    await m.onUnload();
  });

  await testAsync('onCajaCerrada limpia pedidos + emite gauge 0', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.pedidos.set('p1', {});
    m.pedidosPorCuenta.set('c1', new Set(['p1']));
    await m.onCajaCerrada({});
    assert.strictEqual(m.pedidos.size, 0);
    assert.strictEqual(m.pedidosPorCuenta.size, 0);
    await m.onUnload();
  });

  // Group 6: Update + Delete + Cancel
  await testAsync('handleActualizarItem cambia cantidad + recalcula total', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.productosCache.set('p1', { precio: 10 });
    const c = await m.handleCreatePedido({ cuenta_id: 'mesa_1' });
    const a = await m.handleAgregarItem({ pedido_id: c.data.id, producto_id: 'p1', cantidad: 1 });
    const item_id = a.data.item.item_id;
    const r = await m.handleActualizarItem({ pedido_id: c.data.id, item_id, cantidad: 3 });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.item.cantidad, 3);
    assert.strictEqual(r.data.total, 30);
    assert.strictEqual(publishedOf(mocks, 'pedido.item_actualizado').length, 1);
    await m.onUnload();
  });

  await testAsync('handleEliminarItem remueve item + recalcula total', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.productosCache.set('p1', { precio: 10 });
    const c = await m.handleCreatePedido({ cuenta_id: 'mesa_1' });
    const a = await m.handleAgregarItem({ pedido_id: c.data.id, producto_id: 'p1', cantidad: 1 });
    const r = await m.handleEliminarItem({ pedido_id: c.data.id, item_id: a.data.item.item_id });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.total, 0);
    assert.strictEqual(publishedOf(mocks, 'pedido.item_eliminado').length, 1);
    await m.onUnload();
  });

  await testAsync('handleCancelarPedido publica pedido.cancelado con motivo', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const c = await m.handleCreatePedido({ cuenta_id: 'mesa_1' });
    const r = await m.handleCancelarPedido({ id: c.data.id, motivo: 'cliente cancelo' });
    assert.strictEqual(r.status, 200);
    const evs = publishedOf(mocks, 'pedido.cancelado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].motivo, 'cliente cancelo');
    await m.onUnload();
  });

  await testAsync('handleHealthCheck devuelve estado canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealthCheck();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.status, 'healthy');
    assert.strictEqual(r.data.version, '3.1.0');
    await m.onUnload();
  });

  // Group 7: Helpers POC2 + auxiliar + internos
  await testAsync('_errorResponse construye shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = m._errorResponse(400, 'INVALID_INPUT', 'msg', { f: 'x' });
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { f: 'x' } } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.deepStrictEqual(m._classifyHandlerError(new Error('field is required')), { status: 400, code: 'INVALID_INPUT' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('not found')), { status: 404, code: 'RESOURCE_NOT_FOUND' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('ya esta')), { status: 409, code: 'CONFLICT_STATE' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('boom')), { status: 500, code: 'UNKNOWN_ERROR' });
    await m.onUnload();
  });

  await testAsync('_publicarEvento añade correlation_id, project_id top-level y timestamp', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    const r = await m._publicarEvento('test.event', { foo: 1 }, { correlation_id: 'cid-z', project_id: 'p-z' });
    assert.strictEqual(r.correlation_id, 'cid-z');
    assert.strictEqual(r.project_id, 'p-z');
    assert.ok(r.timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError emite metric pedidos.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'));
    assert.strictEqual(r.status, 404);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'pedidos.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  await testAsync('_detectarCanal reconoce prefijos largos y cortos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._detectarCanal('mesa_1'), 'mesa');
    assert.strictEqual(m._detectarCanal('M_42'), 'mesa');
    assert.strictEqual(m._detectarCanal('whatsapp_X'), 'whatsapp');
    assert.strictEqual(m._detectarCanal('W_9'), 'whatsapp');
    assert.strictEqual(m._detectarCanal('algo-raro'), null);
    assert.strictEqual(m._detectarCanal(null), null);
    await m.onUnload();
  });

  await testAsync('_calcularSubtotal suma precio_total de todos los items', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const subtotal = m._calcularSubtotal({
      items: [{ precio_total: 10 }, { precio_total: 5.5 }, { precio_total: 0 }]
    });
    assert.strictEqual(subtotal, 15.5);
    await m.onUnload();
  });

  // ===========================================================
  // Group: Tienda PWA (tipo='tienda', v3.1.0)
  // ===========================================================

  function validInputTienda(overrides = {}) {
    return {
      project_slug: 'vapers',
      items: [
        { cantidad: 2, descripcion: 'Cloud Nine 50ml Menta', precio_unitario_centimos: 1500 },
        { cantidad: 1, descripcion: 'Vampire Vape 30ml Tabaco', precio_unitario_centimos: 800 }
      ],
      total_centimos: 3800,
      canal_origen: 'whatsapp',
      cliente_telefono: '34600000000',
      palabra_clave: 'roj',
      expira_horas: 48,
      correlation_id: 'corr-test-1',
      ...overrides
    };
  }

  await testAsync('tienda · success crea pedido pendiente_recogida con codigo de 6 chars', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreatePedidoTienda(validInputTienda());
    assert.ok(isCanonicalSuccess(r), `shape: ${JSON.stringify(r)}`);
    assert.strictEqual(r.status, 201);
    assert.ok(r.data.pedido_id);
    assert.match(r.data.codigo_recogida, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.strictEqual(r.data.estado, 'pendiente_recogida');
    assert.strictEqual(r.data.total_centimos, 3800);
    assert.strictEqual(r.data.tipo, 'tienda');
    assert.ok(r.data.expira_at);
    assert.strictEqual(m.pedidos.size, 1);
    assert.strictEqual(m.pedidosPorProject.size, 1);
    assert.ok(m.pedidosPorProject.get('vapers').has(r.data.pedido_id));
    assert.strictEqual(m.pedidosPorCuenta.size, 0); // tienda NO indexa por cuenta
    await m.onUnload();
  });

  await testAsync('tienda · cuenta_id queda null en el shape persistido', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreatePedidoTienda(validInputTienda());
    const pedido = m.pedidos.get(r.data.pedido_id);
    assert.strictEqual(pedido.cuenta_id, null);
    assert.strictEqual(pedido.canal, null);
    assert.strictEqual(pedido.canal_origen, 'whatsapp');
    assert.strictEqual(pedido.project_slug, 'vapers');
    assert.strictEqual(pedido.tipo, 'tienda');
    await m.onUnload();
  });

  await testAsync('tienda · pedido.creado NO publica palabra_clave ni cliente_telefono (anti-fraude + RGPD)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreatePedidoTienda(validInputTienda());
    const evs = publishedOf(mocks, 'pedido.creado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].tipo, 'tienda');
    assert.strictEqual(evs[0].codigo_recogida, r.data.codigo_recogida);
    assert.strictEqual(evs[0].cuenta_id, null);
    assert.strictEqual(evs[0].canal_origen, 'whatsapp');
    assert.strictEqual(evs[0].project_slug, 'vapers');
    assert.strictEqual(evs[0].correlation_id, 'corr-test-1');
    assert.strictEqual(evs[0].palabra_clave, undefined, 'palabra_clave NO debe viajar en el evento');
    assert.strictEqual(evs[0].cliente_telefono, undefined, 'cliente_telefono NO debe viajar en el evento');
    // Pero SI se persisten en el shape interno (para que el dependiente las verifique al recoger)
    const pedido = m.pedidos.get(r.data.pedido_id);
    assert.strictEqual(pedido.palabra_clave, 'roj');
    assert.strictEqual(pedido.cliente_telefono, '34600000000');
    await m.onUnload();
  });

  await testAsync('tienda · sin project_slug devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreatePedidoTienda(validInputTienda({ project_slug: undefined }));
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'project_slug');
    await m.onUnload();
  });

  await testAsync('tienda · sin items devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreatePedidoTienda(validInputTienda({ items: [] }));
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'items');
    await m.onUnload();
  });

  await testAsync('tienda · total_centimos negativo devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreatePedidoTienda(validInputTienda({ total_centimos: -1 }));
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('tienda · canal_origen invalido devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreatePedidoTienda(validInputTienda({ canal_origen: 'telegram' }));
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'canal_origen');
    await m.onUnload();
  });

  await testAsync('tienda · palabra_clave 4 chars devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreatePedidoTienda(validInputTienda({ palabra_clave: 'rojo' }));
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'palabra_clave');
    await m.onUnload();
  });

  await testAsync('tienda · item.cantidad 0 devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreatePedidoTienda(validInputTienda({
      items: [{ cantidad: 0, descripcion: 'x' }]
    }));
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('tienda · expira_horas omitido aplica default 24h', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const before = Date.now();
    const r = await m.handleCreatePedidoTienda(validInputTienda({ expira_horas: undefined }));
    const expira = new Date(r.data.expira_at).getTime();
    const horas = (expira - before) / 3600_000;
    assert.ok(horas >= 23.9 && horas <= 24.1, `default 24h, got ${horas}h`);
    await m.onUnload();
  });

  await testAsync('tienda · codigo_recogida es unico vs pedidos existentes', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const codigos = new Set();
    for (let i = 0; i < 20; i++) {
      const r = await m.handleCreatePedidoTienda(validInputTienda());
      assert.ok(isCanonicalSuccess(r));
      assert.ok(!codigos.has(r.data.codigo_recogida), `colision en intento ${i}: ${r.data.codigo_recogida}`);
      codigos.add(r.data.codigo_recogida);
    }
    assert.strictEqual(m.pedidos.size, 20);
    await m.onUnload();
  });

  await testAsync('tienda · onCajaCerrada preserva pedidos tipo=tienda', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    // Crear 1 pedido tienda
    const rTienda = await m.handleCreatePedidoTienda(validInputTienda());
    // Crear 1 pedido pos
    const rPos = await m.handleCreatePedido({ cuenta_id: 'mesa_5' });
    assert.strictEqual(m.pedidos.size, 2);
    // Caja cerrada — solo limpia POS
    await m.onCajaCerrada({});
    assert.strictEqual(m.pedidos.size, 1, 'solo pedido tienda debe permanecer');
    assert.ok(m.pedidos.has(rTienda.data.pedido_id));
    assert.ok(!m.pedidos.has(rPos.data.id));
    await m.onUnload();
  });

  await testAsync('pedido.generar_codigo_recogida · devuelve codigo 6 chars sin ambiguos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGenerarCodigoRecogida({});
    assert.ok(isCanonicalSuccess(r));
    assert.match(r.data.codigo_recogida, /^[A-HJ-NP-Z2-9]{6}$/);
    await m.onUnload();
  });

  await testAsync('pedido.generar_codigo_recogida · longitud 8 personalizada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGenerarCodigoRecogida({ longitud: 8 });
    assert.ok(isCanonicalSuccess(r));
    assert.match(r.data.codigo_recogida, /^[A-HJ-NP-Z2-9]{8}$/);
    await m.onUnload();
  });

  await testAsync('pedido.generar_codigo_recogida · longitud 3 fuera de rango devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGenerarCodigoRecogida({ longitud: 3 });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('tienda · mayor_edad_confirmado=true se persiste + viaja en pedido.creado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreatePedidoTienda(validInputTienda({ mayor_edad_confirmado: true }));
    assert.ok(isCanonicalSuccess(r));
    const pedido = m.pedidos.get(r.data.pedido_id);
    assert.strictEqual(pedido.mayor_edad_confirmado, true);
    assert.ok(pedido.mayor_edad_confirmado_at, 'timestamp se asigna');
    const evs = publishedOf(mocks, 'pedido.creado');
    assert.strictEqual(evs[0].mayor_edad_confirmado, true);
    await m.onUnload();
  });

  await testAsync('tienda · mayor_edad_confirmado omitido queda null + NO viaja en pedido.creado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreatePedidoTienda(validInputTienda());
    const pedido = m.pedidos.get(r.data.pedido_id);
    assert.strictEqual(pedido.mayor_edad_confirmado, null);
    assert.strictEqual(pedido.mayor_edad_confirmado_at, null);
    const evs = publishedOf(mocks, 'pedido.creado');
    assert.strictEqual(evs[0].mayor_edad_confirmado, undefined, 'null no debe propagarse al evento (omit-if-null)');
    await m.onUnload();
  });

  await testAsync('compatibilidad POS · handleCreatePedido sigue funcionando idéntico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreatePedido({ cuenta_id: 'mesa_5', project_id: 'nonina' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.cuenta_id, 'mesa_5');
    assert.strictEqual(r.data.estado, 'borrador');
    assert.strictEqual(r.data.canal, 'mesa');
    // El pedido POS no tiene tipo en el shape persistido (legacy compat)
    assert.strictEqual(r.data.tipo, undefined);
    // El evento publicado tampoco lleva tipo si el pedido no lo tenia
    const evs = publishedOf(mocks, 'pedido.creado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].cuenta_id, 'mesa_5');
    assert.strictEqual(evs[0].tipo, undefined);
    assert.strictEqual(evs[0].codigo_recogida, undefined);
    await m.onUnload();
  });

  teardownTmpCwd();
  console.log('\nTodos los tests pasaron.');
})().catch(e => {
  teardownTmpCwd();
  console.error(e);
  process.exit(1);
});

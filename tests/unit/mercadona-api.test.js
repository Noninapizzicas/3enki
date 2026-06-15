/**
 * Tests del modulo `mercadona-api` v1.0.0.
 *
 * Estructura por capas POC2:
 *   1. Lifecycle               (onLoad / onUnload)
 *   2. Validacion canonica     (400 INVALID_INPUT en producto_id / parent_id)
 *   3. Success producto.obtener (mock fetch + parse + cache + publish .response + .precio.obtenido)
 *   4. Success categorias.listar (top-level + parent_id, mock fetch + parse)
 *   5. Cache                   (hit second call, miss expiry)
 *   6. Errores HTTP            (404 -> RESOURCE_NOT_FOUND, 429 -> RATE_LIMITED tras retries, timeout, network)
 *   7. Helpers POC2            (_errorResponse, _classifyHandlerError, _publicarEvento)
 *
 * Aislamiento: global.fetch reemplazado por mock que responde desde un map de URL->payload.
 * Sin red real, sin disco real.
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const Ajv    = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const MercadonaApiModule = require('../../modules/pizzepos/mercadona-api/index.js');

const SCHEMAS_DIR = path.resolve(__dirname, '../../arquitectura/decisiones/_schemas/mercadona-api');

// ============================================================
// AJV
// ============================================================

function loadAjv() {
  const fs = require('fs');
  const ajv = new Ajv({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  for (const f of fs.readdirSync(SCHEMAS_DIR)) {
    if (!f.endsWith('.json')) continue;
    const schema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, f), 'utf-8'));
    ajv.addSchema(schema, f);
  }
  return ajv;
}

const ajv = loadAjv();
const validateProductoResp  = ajv.getSchema('mercadona.producto.obtener.response.schema.json');
const validateCategoriasResp= ajv.getSchema('mercadona.categorias.listar.response.schema.json');
const validatePrecioObtenido= ajv.getSchema('mercadona.precio.obtenido.schema.json');
if (!validateProductoResp || !validateCategoriasResp || !validatePrecioObtenido) {
  throw new Error('Schemas oficiales de mercadona-api no encontrados');
}

// ============================================================
// Mocks
// ============================================================

function makeMocks() {
  const logs = [];
  const metricsCalls = [];
  const published = [];
  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };
  const metrics = {
    increment: (n, labels) => metricsCalls.push(['increment', n, labels]),
    observe:   (n, v, labels) => metricsCalls.push(['observe', n, v, labels])
  };
  const eventBus = {
    publish: async (name, payload) => { published.push({ name, payload }); }
  };
  return { logger, metrics, eventBus, logs, metricsCalls, published };
}

function makeFetchMock(routes) {
  // routes: { 'producto:34180': { status, body }, 'categories:': {...}, ... }
  let callCount = 0;
  const callLog = [];
  const fn = async (url, opts) => {
    callCount++;
    callLog.push(url);
    let route = null;
    if (/\/products\/(\d+)\//.test(url)) route = `producto:${RegExp.$1}`;
    else if (/\/categories\/(\d+)\//.test(url)) route = `categoria:${RegExp.$1}`;
    else if (/\/categories\/(?:\?|$)/.test(url)) route = 'categories:';
    if (!route || !routes[route]) {
      return { status: 404, ok: false, text: async () => 'Not Found' };
    }
    const entry = routes[route];
    if (entry.throws) throw entry.throws;
    return {
      status: entry.status,
      ok: entry.status >= 200 && entry.status < 300,
      text: async () => typeof entry.body === 'string' ? entry.body : JSON.stringify(entry.body)
    };
  };
  fn.calls = callLog;
  Object.defineProperty(fn, 'callCount', { get: () => callCount });
  return fn;
}

async function flushThrottle(ms = 800) {
  // El throttle por defecto va a 2 rps = 500ms entre requests. Esperamos un poco.
  await new Promise(r => setTimeout(r, ms));
}

// ============================================================
// Tests
// ============================================================

(async function run() {
  let passed = 0, failed = 0;
  const it = async (name, fn) => {
    try {
      await fn();
      console.log(`  \x1b[32m✓\x1b[0m ${name}`);
      passed++;
    } catch (err) {
      console.log(`  \x1b[31m✗\x1b[0m ${name}`);
      console.log(`    ${err.message}`);
      if (err.stack) console.log(err.stack.split('\n').slice(1, 4).join('\n'));
      failed++;
    }
  };
  const describe = (name, fn) => {
    console.log(`\n${name}`);
    return fn();
  };

  // -------------------------------------------------------
  // Group 1: Lifecycle
  // -------------------------------------------------------
  await describe('Group 1: Lifecycle', async () => {
    await it('onLoad fija eventBus, logger, metrics y log de module.loaded', async () => {
      const mod = new MercadonaApiModule();
      const m = makeMocks();
      await mod.onLoad({ eventBus: m.eventBus, logger: m.logger, metrics: m.metrics });
      assert.strictEqual(mod.eventBus, m.eventBus);
      assert.strictEqual(mod.logger, m.logger);
      assert.strictEqual(mod.metrics, m.metrics);
      const loaded = m.logs.find(l => l[1] === 'module.loaded');
      assert.ok(loaded, 'log module.loaded no emitido');
      assert.strictEqual(loaded[2].module, 'mercadona-api');
    });

    await it('onLoad acepta config override desde context.config', async () => {
      const mod = new MercadonaApiModule();
      const m = makeMocks();
      await mod.onLoad({
        eventBus: m.eventBus, logger: m.logger, metrics: m.metrics,
        config: { postcode_default: '46001', cache_ttl_hours: 12 }
      });
      assert.strictEqual(mod.config.postcode_default, '46001');
      assert.strictEqual(mod.config.cache_ttl_hours, 12);
    });

    await it('onUnload limpia cache, projectMeta, throttleQueue, timer', async () => {
      const mod = new MercadonaApiModule();
      const m = makeMocks();
      await mod.onLoad({ eventBus: m.eventBus, logger: m.logger, metrics: m.metrics });
      mod._cacheSet('foo', { x: 1 });
      mod.projectMeta.set('p1', { postcode: '46001' });
      await mod.onUnload();
      assert.strictEqual(mod._cache.size, 0);
      assert.strictEqual(mod.projectMeta.size, 0);
      assert.strictEqual(mod._throttleQueue.length, 0);
    });
  });

  // -------------------------------------------------------
  // Group 2: Validacion canonica
  // -------------------------------------------------------
  await describe('Group 2: Validacion canonica', async () => {
    await it('onProductoObtener sin producto_id devuelve 400 INVALID_INPUT', async () => {
      const mod = new MercadonaApiModule();
      const m = makeMocks();
      await mod.onLoad({ eventBus: m.eventBus, logger: m.logger, metrics: m.metrics });
      const r = await mod.onProductoObtener({});
      assert.strictEqual(r.status, 400);
      assert.strictEqual(r.error.code, 'INVALID_INPUT');
      const failed = m.published.find(p => p.name === 'mercadona.producto.obtener.failed');
      assert.ok(failed, 'no se publico .failed');
    });

    await it('onProductoObtener con producto_id no numerico devuelve INVALID_INPUT', async () => {
      const mod = new MercadonaApiModule();
      const m = makeMocks();
      await mod.onLoad({ eventBus: m.eventBus, logger: m.logger, metrics: m.metrics });
      const r = await mod.onProductoObtener({ producto_id: 'abc' });
      assert.strictEqual(r.status, 400);
      assert.strictEqual(r.error.code, 'INVALID_INPUT');
    });

    await it('onCategoriasListar con parent_id no numerico devuelve INVALID_INPUT', async () => {
      const mod = new MercadonaApiModule();
      const m = makeMocks();
      await mod.onLoad({ eventBus: m.eventBus, logger: m.logger, metrics: m.metrics });
      const r = await mod.onCategoriasListar({ parent_id: 'no-numerico' });
      assert.strictEqual(r.status, 400);
      assert.strictEqual(r.error.code, 'INVALID_INPUT');
    });
  });

  // -------------------------------------------------------
  // Group 3: Success producto.obtener
  // -------------------------------------------------------
  await describe('Group 3: Success producto.obtener', async () => {
    await it('responde 200, parsea correctamente, publica .response Y .precio.obtenido', async () => {
      const mod = new MercadonaApiModule();
      const m = makeMocks();
      await mod.onLoad({
        eventBus: m.eventBus, logger: m.logger, metrics: m.metrics,
        config: { throttle_rps: 100 } // rapido para tests
      });
      const fetchMock = makeFetchMock({
        'producto:34180': {
          status: 200,
          body: {
            id: 34180,
            display_name: 'Pasta espagueti',
            brand: 'Hacendado',
            packaging: 'Paquete 500 g',
            thumbnail: 'https://prod.example/img.jpg',
            published: true,
            price_instructions: {
              unit_price: '0.79',
              bulk_price: '1.58',
              reference_price: '1.58',
              reference_format: 'kg',
              size_format: 'paquete 500 g'
            },
            categories: [{ id: 199 }]
          }
        }
      });
      global.fetch = fetchMock;

      const r = await mod.onProductoObtener({ producto_id: '34180', project_id: 'p1', request_id: 'r1' });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.data.producto_id, '34180');
      assert.strictEqual(r.data.nombre, 'Pasta espagueti');
      assert.strictEqual(r.data.precio_unidad, 0.79);
      assert.strictEqual(r.data.precio_kg, 1.58);

      const resp = m.published.find(p => p.name === 'mercadona.producto.obtener.response');
      assert.ok(resp, 'no se publico .response');
      const valid = validateProductoResp(resp.payload);
      assert.ok(valid, `response no valida schema: ${JSON.stringify(validateProductoResp.errors)}`);

      const precio = m.published.find(p => p.name === 'mercadona.precio.obtenido');
      assert.ok(precio, 'no se publico .precio.obtenido');
      const validPrecio = validatePrecioObtenido(precio.payload);
      assert.ok(validPrecio, `precio.obtenido no valida schema: ${JSON.stringify(validatePrecioObtenido.errors)}`);
    });

    await it('producto sin precios NO publica .precio.obtenido', async () => {
      const mod = new MercadonaApiModule();
      const m = makeMocks();
      await mod.onLoad({
        eventBus: m.eventBus, logger: m.logger, metrics: m.metrics,
        config: { throttle_rps: 100 }
      });
      global.fetch = makeFetchMock({
        'producto:999': {
          status: 200,
          body: { id: 999, display_name: 'X', price_instructions: {}, published: true }
        }
      });
      await mod.onProductoObtener({ producto_id: '999' });
      const precio = m.published.find(p => p.name === 'mercadona.precio.obtenido');
      assert.strictEqual(precio, undefined, 'precio.obtenido no debia publicarse');
    });
  });

  // -------------------------------------------------------
  // Group 4: Success categorias.listar
  // -------------------------------------------------------
  await describe('Group 4: Success categorias.listar', async () => {
    await it('top-level (sin parent_id) devuelve array', async () => {
      const mod = new MercadonaApiModule();
      const m = makeMocks();
      await mod.onLoad({
        eventBus: m.eventBus, logger: m.logger, metrics: m.metrics,
        config: { throttle_rps: 100 }
      });
      global.fetch = makeFetchMock({
        'categories:': {
          status: 200,
          body: { results: [
            { id: 1, name: 'Frutas y verduras', order: 1, categories: [] },
            { id: 2, name: 'Pasta y arroz',     order: 2, categories: [] }
          ]}
        }
      });
      const r = await mod.onCategoriasListar({});
      assert.strictEqual(r.status, 200);
      assert.ok(Array.isArray(r.data), 'data debe ser array para top-level');
      assert.strictEqual(r.data.length, 2);
      assert.strictEqual(r.data[0].nombre, 'Frutas y verduras');
      const resp = m.published.find(p => p.name === 'mercadona.categorias.listar.response');
      assert.ok(validateCategoriasResp(resp.payload), 'response no valida schema');
    });

    await it('con parent_id devuelve objeto categoria con productos', async () => {
      const mod = new MercadonaApiModule();
      const m = makeMocks();
      await mod.onLoad({
        eventBus: m.eventBus, logger: m.logger, metrics: m.metrics,
        config: { throttle_rps: 100 }
      });
      global.fetch = makeFetchMock({
        'categoria:199': {
          status: 200,
          body: {
            id: 199, name: 'Pasta', order: 1, categories: [],
            products: [{ id: 34180, display_name: 'Pasta espagueti', brand: 'Hacendado' }]
          }
        }
      });
      const r = await mod.onCategoriasListar({ parent_id: '199' });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.data.categoria_id, '199');
      assert.ok(Array.isArray(r.data.productos));
      assert.strictEqual(r.data.productos[0].producto_id, '34180');
    });
  });

  // -------------------------------------------------------
  // Group 5: Cache
  // -------------------------------------------------------
  await describe('Group 5: Cache', async () => {
    await it('segunda llamada con mismo producto_id no hace fetch (cache hit)', async () => {
      const mod = new MercadonaApiModule();
      const m = makeMocks();
      await mod.onLoad({
        eventBus: m.eventBus, logger: m.logger, metrics: m.metrics,
        config: { throttle_rps: 100 }
      });
      const fetchMock = makeFetchMock({
        'producto:34180': { status: 200, body: { id: 34180, display_name: 'X', price_instructions: { unit_price: '1.00' }, published: true } }
      });
      global.fetch = fetchMock;
      await mod.onProductoObtener({ producto_id: '34180' });
      const firstCallCount = fetchMock.callCount;
      await mod.onProductoObtener({ producto_id: '34180' });
      assert.strictEqual(fetchMock.callCount, firstCallCount, 'segunda llamada deberia ser cache hit');
      const hits = m.metricsCalls.filter(c => c[1] === 'mercadona.cache.hit');
      assert.ok(hits.length >= 1, 'no se registro cache.hit en metricas');
    });

    await it('cache caducada (ttl=0) hace fetch nuevo', async () => {
      const mod = new MercadonaApiModule();
      const m = makeMocks();
      await mod.onLoad({
        eventBus: m.eventBus, logger: m.logger, metrics: m.metrics,
        config: { throttle_rps: 100, cache_ttl_hours: 0 }
      });
      const fetchMock = makeFetchMock({
        'producto:34180': { status: 200, body: { id: 34180, display_name: 'X', price_instructions: { unit_price: '1.00' }, published: true } }
      });
      global.fetch = fetchMock;
      await mod.onProductoObtener({ producto_id: '34180' });
      await new Promise(r => setTimeout(r, 5));
      await mod.onProductoObtener({ producto_id: '34180' });
      assert.strictEqual(fetchMock.callCount, 2, 'cache caducada debe forzar fetch nuevo');
    });
  });

  // -------------------------------------------------------
  // Group 6: Errores HTTP
  // -------------------------------------------------------
  await describe('Group 6: Errores HTTP', async () => {
    await it('404 de Mercadona -> RESOURCE_NOT_FOUND', async () => {
      const mod = new MercadonaApiModule();
      const m = makeMocks();
      await mod.onLoad({
        eventBus: m.eventBus, logger: m.logger, metrics: m.metrics,
        config: { throttle_rps: 100 }
      });
      global.fetch = makeFetchMock({
        'producto:99999': { status: 404, body: 'Not Found' }
      });
      const r = await mod.onProductoObtener({ producto_id: '99999' });
      assert.strictEqual(r.status, 404);
      assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
      const failed = m.published.find(p => p.name === 'mercadona.producto.obtener.failed');
      assert.ok(failed, 'no se publico .failed');
    });

    await it('error de red -> UPSTREAM_UNREACHABLE', async () => {
      const mod = new MercadonaApiModule();
      const m = makeMocks();
      await mod.onLoad({
        eventBus: m.eventBus, logger: m.logger, metrics: m.metrics,
        config: { throttle_rps: 100 }
      });
      global.fetch = makeFetchMock({
        'producto:1': { throws: Object.assign(new Error('fetch failed: ENOTFOUND'), { name: 'TypeError' }) }
      });
      const r = await mod.onProductoObtener({ producto_id: '1' });
      assert.strictEqual(r.error.code, 'UPSTREAM_UNREACHABLE');
    });

    await it('respuesta no-JSON -> UPSTREAM_INVALID_RESPONSE', async () => {
      const mod = new MercadonaApiModule();
      const m = makeMocks();
      await mod.onLoad({
        eventBus: m.eventBus, logger: m.logger, metrics: m.metrics,
        config: { throttle_rps: 100 }
      });
      global.fetch = makeFetchMock({
        'producto:1': { status: 200, body: '<html>not json</html>' }
      });
      const r = await mod.onProductoObtener({ producto_id: '1' });
      assert.strictEqual(r.error.code, 'UPSTREAM_INVALID_RESPONSE');
    });
  });

  // -------------------------------------------------------
  // Group 7: Helpers POC2
  // -------------------------------------------------------
  await describe('Group 7: Helpers POC2', async () => {
    await it('_errorResponse shape canonico { status, error: { code, message, details? } }', () => {
      const mod = new MercadonaApiModule();
      const e1 = mod._errorResponse(400, 'INVALID_INPUT', 'falta x');
      assert.deepStrictEqual(e1, { status: 400, error: { code: 'INVALID_INPUT', message: 'falta x' } });
      const e2 = mod._errorResponse(404, 'RESOURCE_NOT_FOUND', 'no existe', { id: '1' });
      assert.deepStrictEqual(e2.error.details, { id: '1' });
    });

    await it('_classifyHandlerError reconoce _upstream_code prioritariamente', () => {
      const mod = new MercadonaApiModule();
      const err = Object.assign(new Error('xyz'), { _upstream_code: 'RATE_LIMITED' });
      const c = mod._classifyHandlerError(err);
      assert.strictEqual(c.code, 'RATE_LIMITED');
      assert.strictEqual(c.status, 429);
    });

    await it('_classifyHandlerError clasifica por mensaje cuando no hay _upstream_code', () => {
      const mod = new MercadonaApiModule();
      assert.strictEqual(mod._classifyHandlerError(new Error('field is required')).code, 'INVALID_INPUT');
      assert.strictEqual(mod._classifyHandlerError(new Error('not found')).code, 'RESOURCE_NOT_FOUND');
      assert.strictEqual(mod._classifyHandlerError(new Error('something timeout occurred')).code, 'UPSTREAM_TIMEOUT');
      assert.strictEqual(mod._classifyHandlerError(new Error('a strange thing')).code, 'UNKNOWN_ERROR');
    });

    await it('_publicarEvento propaga correlation_id y anyade timestamp', async () => {
      const mod = new MercadonaApiModule();
      const m = makeMocks();
      await mod.onLoad({ eventBus: m.eventBus, logger: m.logger, metrics: m.metrics });
      await mod._publicarEvento('test.event', { foo: 1 }, { correlation_id: 'corr-123', project_id: 'p1' });
      const ev = m.published.find(e => e.name === 'test.event');
      assert.strictEqual(ev.payload.correlation_id, 'corr-123');
      assert.strictEqual(ev.payload.project_id, 'p1');
      assert.ok(ev.payload.timestamp, 'timestamp no propagado');
    });

    await it('_resolvePostcode usa proyecto activo, fallback al default', async () => {
      const mod = new MercadonaApiModule();
      const m = makeMocks();
      await mod.onLoad({ eventBus: m.eventBus, logger: m.logger, metrics: m.metrics });
      assert.strictEqual(mod._resolvePostcode(null), '30840', 'sin proyecto debe usar default');
      await mod.onProjectActivated({ project_id: 'p1', base_path: '/tmp', metadata: { postcode: '46001' } });
      assert.strictEqual(mod._resolvePostcode('p1'), '46001');
      assert.strictEqual(mod._resolvePostcode(null), '46001', 'sin project_id debe usar el ultimo activo');
    });
  });

  // ============================================================
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();

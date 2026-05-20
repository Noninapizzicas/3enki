/**
 * Tests unitarios — core/modules/loader.js runtime de tools_http[].
 *
 * Cubre la capacidad declarativa del v1.2: wrappers HTTP sin codigo JS.
 * El loader genera la closure handler a partir de la entry de tools_http[]:
 * resuelve credencial via bus → template url/headers/body → fetch → mapea
 * status HTTP a shape canonico → extrae response_path.
 *
 * Ejecutar: node tests/unit/core-module-loader-tools-http.test.js
 */

'use strict';

const assert = require('assert');
const ModuleLoader = require('../../core/modules/loader.js');

// ============================================================
// Mocks
// ============================================================

function makeMiniBus() {
  const subs = new Map();
  const published = [];
  return {
    published,
    subscribe(name, handler) {
      if (!subs.has(name)) subs.set(name, new Set());
      subs.get(name).add(handler);
      return () => subs.get(name)?.delete(handler);
    },
    async publish(name, data) {
      published.push([name, data]);
      const set = subs.get(name);
      if (!set) return;
      for (const h of [...set]) {
        try { await h(data); } catch (_) { /* swallow */ }
      }
    },
    listenerCount(name) { return subs.get(name)?.size || 0; }
  };
}

function makeMiniUiHandler() {
  const handlers = new Map();
  return {
    handlers,
    register(domain, action, handler) { handlers.set(`${domain}.${action}`, handler); },
    unregister(domain, action) { handlers.delete(`${domain}.${action}`); }
  };
}

/**
 * Mock de fetch que devuelve respuestas controladas y registra cada llamada.
 * Cada test setea el comportamiento via fetchMock.queue([{status, body, ...}, ...])
 * o fetchMock.handler = ({url, opts}) => ({status, body, headers}).
 */
function makeFetchMock() {
  const state = { calls: [], queue: [], handler: null };
  const fn = async function mockFetch(url, opts) {
    state.calls.push({ url, opts });
    const out = state.handler ? state.handler({ url, opts }) : state.queue.shift();
    if (!out) throw new Error(`mock fetch: no response queued for ${url}`);
    const responseBody = out.body !== undefined ? out.body : null;
    const headers = new Map(Object.entries(out.headers || { 'content-type': 'application/json' }));
    return {
      status: out.status || 200,
      statusText: out.statusText || 'OK',
      headers: { get: (k) => headers.get(k.toLowerCase()) || null },
      async json() { return typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody; },
      async text() { return typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody); }
    };
  };
  // Exponemos el state como propiedades en la fn — necesitamos un getter/setter
  // real sobre la fn para que `fetchMock.handler = ...` lo persista.
  Object.defineProperty(fn, 'calls',   { get: () => state.calls });
  Object.defineProperty(fn, 'queue',   { get: () => state.queue });
  Object.defineProperty(fn, 'handler', { get: () => state.handler, set: (h) => { state.handler = h; } });
  return fn;
}

function makeLoader({ bus, uiHandler, fetchImpl } = {}) {
  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  const loader = new ModuleLoader({
    core: { eventBus: bus || null, uiHandler: uiHandler || null },
    logger,
    modulesPath: '/tmp/__never_used_in_test__'
  });
  if (fetchImpl) loader._fetchImpl = fetchImpl;
  return loader;
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (err) {
    console.error(`✗ ${description}`); console.error(`  ${err.message}`);
    if (process.env.STACK) console.error(err.stack);
    process.exit(1);
  }
}

// Wrapper para credential-manager: cuando se publica credential.resolve.request,
// inmediatamente publica credential.resolve.response con el api_key dado.
function wireFakeCredentialManager(bus, credentials) {
  bus.subscribe('credential.resolve.request', async (event) => {
    const data = (event && typeof event === 'object' && 'data' in event) ? event.data : event;
    const { request_id, provider } = data || {};
    if (Object.prototype.hasOwnProperty.call(credentials, provider)) {
      await bus.publish('credential.resolve.response', {
        request_id, success: true, provider, api_key: credentials[provider], resolved_from: 'global'
      });
    } else {
      await bus.publish('credential.resolve.response', {
        request_id, success: false, provider, error: `provider ${provider} no encontrado`
      });
    }
  });
}

// ============================================================
// Tests
// ============================================================

(async () => {
  console.log('core/modules/loader — tools_http runtime (tools.contract v1.2)\n');

  // ---------- Group 1: Helpers puros ----------

  await testAsync('_renderTemplate: reemplaza {{x}} con encodeURIComponent y reporta consumed', async () => {
    const loader = makeLoader();
    const { rendered, consumed } = loader._renderTemplate('https://api.test/items/{{id}}/{{slug}}', { id: 42, slug: 'a b' });
    assert.strictEqual(rendered, 'https://api.test/items/42/a%20b');
    assert.deepStrictEqual(consumed.sort(), ['id', 'slug']);
  });

  await testAsync('_renderTemplate: token sin arg correspondiente queda sin sustituir', async () => {
    const loader = makeLoader();
    const { rendered, consumed } = loader._renderTemplate('https://api.test/{{missing}}', {});
    assert.strictEqual(rendered, 'https://api.test/{{missing}}');
    assert.deepStrictEqual(consumed, []);
  });

  await testAsync('_renderBodyTemplate: object con value exacto `{{x}}` sustituye con el arg crudo (preserva tipos)', async () => {
    const loader = makeLoader();
    const body = loader._renderBodyTemplate({ count: '{{n}}', name: 'fixed' }, { n: 42 });
    assert.strictEqual(body.count, 42, 'arg crudo preservado (no string)');
    assert.strictEqual(body.name, 'fixed');
  });

  await testAsync('_renderBodyTemplate: object con value `prefix-{{x}}-suffix` sustituye como string concatenado', async () => {
    const loader = makeLoader();
    const body = loader._renderBodyTemplate({ slug: 'item-{{id}}-v2' }, { id: 7 });
    assert.strictEqual(body.slug, 'item-7-v2');
  });

  await testAsync('_appendQuery: anyade query string preservando los params existentes', async () => {
    const loader = makeLoader();
    assert.strictEqual(loader._appendQuery('http://a.b/path', { x: 1 }), 'http://a.b/path?x=1');
    assert.strictEqual(loader._appendQuery('http://a.b/path?z=9', { x: 1 }), 'http://a.b/path?z=9&x=1');
    assert.strictEqual(loader._appendQuery('http://a.b/path', {}), 'http://a.b/path');
  });

  await testAsync('_extractResponsePath: navega dot-path con [N] para arrays', async () => {
    const loader = makeLoader();
    const obj = { data: { results: [{ text: 'first' }, { text: 'second' }] } };
    assert.strictEqual(loader._extractResponsePath(obj, 'data.results[0].text'), 'first');
    assert.strictEqual(loader._extractResponsePath(obj, 'data.results[1].text'), 'second');
    assert.strictEqual(loader._extractResponsePath(obj, 'data.missing'), undefined);
  });

  await testAsync('_mapHttpStatusToCanonCode: 4xx y 5xx mappean a codes canonicos', async () => {
    const loader = makeLoader();
    assert.strictEqual(loader._mapHttpStatusToCanonCode(400), 'INVALID_INPUT');
    assert.strictEqual(loader._mapHttpStatusToCanonCode(401), 'PERMISSION_DENIED');
    assert.strictEqual(loader._mapHttpStatusToCanonCode(404), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(loader._mapHttpStatusToCanonCode(409), 'CONFLICT_STATE');
    assert.strictEqual(loader._mapHttpStatusToCanonCode(429), 'RATE_LIMITED');
    assert.strictEqual(loader._mapHttpStatusToCanonCode(502), 'UPSTREAM_UNREACHABLE');
    assert.strictEqual(loader._mapHttpStatusToCanonCode(503), 'UPSTREAM_UNREACHABLE');
    assert.strictEqual(loader._mapHttpStatusToCanonCode(504), 'UPSTREAM_UNREACHABLE');
    assert.strictEqual(loader._mapHttpStatusToCanonCode(500), 'UPSTREAM_INVALID_RESPONSE');
  });

  // ---------- Group 2: registerToolsHttpForAI: 3 destinos ----------

  await testAsync('registerToolsHttpForAI: una tool produce los 3 destinos (registry + bus + ui)', async () => {
    const bus = makeMiniBus();
    const ui = makeMiniUiHandler();
    const fetchMock = makeFetchMock();
    fetchMock.queue.push({ status: 200, body: { ok: true } });
    const loader = makeLoader({ bus, uiHandler: ui, fetchImpl: fetchMock });

    loader.registerToolsHttpForAI('module-x', [{
      name: 'svc.fetch',
      description: 'fetch external',
      parameters: { type: 'object' },
      http: { method: 'GET', url: 'https://api.test/health' }
    }]);

    assert.ok(loader.toolsRegistry.has('svc.fetch'), 'destino 1: toolsRegistry');
    assert.strictEqual(bus.listenerCount('svc.fetch'), 1, 'destino 2: bus event');
    assert.ok(ui.handlers.has('svc.fetch'), 'destino 3: uiHandler');
    assert.ok(loader.toolsRegistry.get('svc.fetch').http, 'entry marcada como http:true');
  });

  // ---------- Group 3: Templating y query construction ----------

  await testAsync('GET con path templated consume args y NO los agrega al query', async () => {
    const bus = makeMiniBus();
    const fetchMock = makeFetchMock();
    fetchMock.queue.push({ status: 200, body: { id: 7, name: 'x' } });
    const loader = makeLoader({ bus, fetchImpl: fetchMock });

    loader.registerToolsHttpForAI('m', [{
      name: 'items.get',
      description: 'get item',
      parameters: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      http: { method: 'GET', url: 'https://api.test/items/{{id}}' }
    }]);

    const result = await loader.toolsRegistry.get('items.get').handler({ id: 7 });
    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(result.data, { id: 7, name: 'x' });
    assert.strictEqual(fetchMock.calls[0].url, 'https://api.test/items/7', 'no query trailing');
  });

  await testAsync('GET: args no consumidos por path van como query string', async () => {
    const bus = makeMiniBus();
    const fetchMock = makeFetchMock();
    fetchMock.queue.push({ status: 200, body: [] });
    const loader = makeLoader({ bus, fetchImpl: fetchMock });

    loader.registerToolsHttpForAI('m', [{
      name: 'items.search',
      description: 'search',
      parameters: { type: 'object' },
      http: { method: 'GET', url: 'https://api.test/search' }
    }]);

    await loader.toolsRegistry.get('items.search').handler({ q: 'hello world', limit: 10 });
    const url = fetchMock.calls[0].url;
    assert.ok(url.startsWith('https://api.test/search?'), `query appended (got ${url})`);
    assert.ok(url.includes('q=hello%20world'));
    assert.ok(url.includes('limit=10'));
  });

  await testAsync('POST con body_template templates el body como JSON', async () => {
    const bus = makeMiniBus();
    const fetchMock = makeFetchMock();
    fetchMock.queue.push({ status: 201, body: { created: true, id: 9 } });
    const loader = makeLoader({ bus, fetchImpl: fetchMock });

    loader.registerToolsHttpForAI('m', [{
      name: 'items.create',
      description: 'create',
      parameters: { type: 'object' },
      http: {
        method: 'POST',
        url: 'https://api.test/items',
        body_template: { name: '{{name}}', count: '{{count}}' }
      }
    }]);

    const result = await loader.toolsRegistry.get('items.create').handler({ name: 'foo', count: 3 });
    assert.strictEqual(result.status, 201);
    const sent = JSON.parse(fetchMock.calls[0].opts.body);
    assert.deepStrictEqual(sent, { name: 'foo', count: 3 }, 'count preserva tipo (number)');
    assert.strictEqual(fetchMock.calls[0].opts.headers['Content-Type'], 'application/json');
  });

  await testAsync('POST sin body_template envia los args sobrantes como JSON', async () => {
    const bus = makeMiniBus();
    const fetchMock = makeFetchMock();
    fetchMock.queue.push({ status: 200, body: { ok: true } });
    const loader = makeLoader({ bus, fetchImpl: fetchMock });

    loader.registerToolsHttpForAI('m', [{
      name: 'svc.send',
      description: 's',
      parameters: { type: 'object' },
      http: { method: 'POST', url: 'https://api.test/send' }
    }]);

    await loader.toolsRegistry.get('svc.send').handler({ a: 1, b: 'two' });
    const sent = JSON.parse(fetchMock.calls[0].opts.body);
    assert.deepStrictEqual(sent, { a: 1, b: 'two' });
  });

  // ---------- Group 4: Auth ----------

  await testAsync('auth_type=bearer publica credential.resolve.request y aplica Authorization: Bearer', async () => {
    const bus = makeMiniBus();
    wireFakeCredentialManager(bus, { 'openai_key': 'sk-test-abc' });
    const fetchMock = makeFetchMock();
    fetchMock.queue.push({ status: 200, body: { ok: true } });
    const loader = makeLoader({ bus, fetchImpl: fetchMock });

    loader.registerToolsHttpForAI('m', [{
      name: 'openai.complete',
      description: 'complete',
      parameters: { type: 'object' },
      http: { method: 'POST', url: 'https://api.openai.com/v1/complete', auth_type: 'bearer', credential_id: 'openai_key' }
    }]);

    const result = await loader.toolsRegistry.get('openai.complete').handler({ prompt: 'hi' });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(fetchMock.calls[0].opts.headers['Authorization'], 'Bearer sk-test-abc',
      'header bearer aplicado');
    // El payload publicado al bus para resolve no contiene la api_key
    const resolveReq = bus.published.find(p => p[0] === 'credential.resolve.request');
    assert.ok(resolveReq, 'credential.resolve.request publicado');
    assert.strictEqual(resolveReq[1].provider, 'openai_key');
    assert.ok(!('api_key' in resolveReq[1]), 'request NO lleva api_key');
  });

  await testAsync('auth_type=api_key_header aplica header configurable con default X-API-Key', async () => {
    const bus = makeMiniBus();
    wireFakeCredentialManager(bus, { 'svc_key': 'KEY123' });
    const fetchMock = makeFetchMock();
    fetchMock.queue.push({ status: 200, body: {} });
    fetchMock.queue.push({ status: 200, body: {} });
    const loader = makeLoader({ bus, fetchImpl: fetchMock });

    loader.registerToolsHttpForAI('m', [
      {
        name: 'svc1.call',
        description: 'd', parameters: { type: 'object' },
        http: { method: 'GET', url: 'https://api1.test/x', auth_type: 'api_key_header', credential_id: 'svc_key' }
      },
      {
        name: 'svc2.call',
        description: 'd', parameters: { type: 'object' },
        http: { method: 'GET', url: 'https://api2.test/x', auth_type: 'api_key_header', credential_id: 'svc_key', auth_header_name: 'X-Custom-Token' }
      }
    ]);

    await loader.toolsRegistry.get('svc1.call').handler({});
    await loader.toolsRegistry.get('svc2.call').handler({});
    assert.strictEqual(fetchMock.calls[0].opts.headers['X-API-Key'], 'KEY123');
    assert.strictEqual(fetchMock.calls[1].opts.headers['X-Custom-Token'], 'KEY123');
  });

  await testAsync('auth_type=api_key_query agrega el key al query string', async () => {
    const bus = makeMiniBus();
    wireFakeCredentialManager(bus, { 'pub_key': 'PUB456' });
    const fetchMock = makeFetchMock();
    fetchMock.queue.push({ status: 200, body: {} });
    const loader = makeLoader({ bus, fetchImpl: fetchMock });

    loader.registerToolsHttpForAI('m', [{
      name: 'svc.q',
      description: 'd', parameters: { type: 'object' },
      http: { method: 'GET', url: 'https://api.test/things', auth_type: 'api_key_query', credential_id: 'pub_key', auth_query_param_name: 'token' }
    }]);
    await loader.toolsRegistry.get('svc.q').handler({ q: 'x' });
    const url = fetchMock.calls[0].url;
    assert.ok(url.includes('token=PUB456'), `auth query (got ${url})`);
    assert.ok(url.includes('q=x'));
  });

  await testAsync('auth_type sin credential_id devuelve INVALID_INPUT canonico', async () => {
    const bus = makeMiniBus();
    const fetchMock = makeFetchMock();
    const loader = makeLoader({ bus, fetchImpl: fetchMock });
    loader.registerToolsHttpForAI('m', [{
      name: 'svc.bad',
      description: 'd', parameters: { type: 'object' },
      http: { method: 'GET', url: 'https://api.test', auth_type: 'bearer' }
    }]);
    const result = await loader.toolsRegistry.get('svc.bad').handler({});
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error.code, 'INVALID_INPUT');
    assert.strictEqual(fetchMock.calls.length, 0, 'no fetch sin credencial');
  });

  await testAsync('credential.resolve.response success:false → PERMISSION_DENIED y NO fetch', async () => {
    const bus = makeMiniBus();
    wireFakeCredentialManager(bus, {}); // ningun provider
    const fetchMock = makeFetchMock();
    const loader = makeLoader({ bus, fetchImpl: fetchMock });
    loader.registerToolsHttpForAI('m', [{
      name: 'svc.x',
      description: 'd', parameters: { type: 'object' },
      http: { method: 'GET', url: 'https://api.test', auth_type: 'bearer', credential_id: 'unknown' }
    }]);
    const result = await loader.toolsRegistry.get('svc.x').handler({});
    assert.strictEqual(result.error.code, 'PERMISSION_DENIED');
    assert.strictEqual(fetchMock.calls.length, 0, 'no fetch sin credencial resuelta');
  });

  // ---------- Group 5: Mapeo de status HTTP a errores canonicos ----------

  await testAsync('status 404 → RESOURCE_NOT_FOUND con upstream_status en details', async () => {
    const bus = makeMiniBus();
    const fetchMock = makeFetchMock();
    fetchMock.queue.push({ status: 404, body: { message: 'item not found' } });
    const loader = makeLoader({ bus, fetchImpl: fetchMock });
    loader.registerToolsHttpForAI('m', [{
      name: 'items.get',
      description: 'd', parameters: { type: 'object' },
      http: { method: 'GET', url: 'https://api.test/items/{{id}}' }
    }]);
    const r = await loader.toolsRegistry.get('items.get').handler({ id: 999 });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(r.error.details.upstream_status, 404);
    assert.strictEqual(r.error.message, 'item not found', 'usa upstream message si presente');
  });

  await testAsync('status 401 → PERMISSION_DENIED', async () => {
    const bus = makeMiniBus();
    const fetchMock = makeFetchMock();
    fetchMock.queue.push({ status: 401, body: {} });
    const loader = makeLoader({ bus, fetchImpl: fetchMock });
    loader.registerToolsHttpForAI('m', [{
      name: 's.x',
      description: 'd', parameters: { type: 'object' },
      http: { method: 'GET', url: 'https://api.test' }
    }]);
    const r = await loader.toolsRegistry.get('s.x').handler({});
    assert.strictEqual(r.error.code, 'PERMISSION_DENIED');
  });

  await testAsync('status 429 → RATE_LIMITED', async () => {
    const bus = makeMiniBus();
    const fetchMock = makeFetchMock();
    fetchMock.queue.push({ status: 429, body: { message: 'try again later' } });
    const loader = makeLoader({ bus, fetchImpl: fetchMock });
    loader.registerToolsHttpForAI('m', [{
      name: 's.x',
      description: 'd', parameters: { type: 'object' },
      http: { method: 'GET', url: 'https://api.test' }
    }]);
    const r = await loader.toolsRegistry.get('s.x').handler({});
    assert.strictEqual(r.error.code, 'RATE_LIMITED');
  });

  await testAsync('status 500 → UPSTREAM_INVALID_RESPONSE', async () => {
    const bus = makeMiniBus();
    const fetchMock = makeFetchMock();
    fetchMock.queue.push({ status: 500, body: 'oops' });
    const loader = makeLoader({ bus, fetchImpl: fetchMock });
    loader.registerToolsHttpForAI('m', [{
      name: 's.x',
      description: 'd', parameters: { type: 'object' },
      http: { method: 'GET', url: 'https://api.test' }
    }]);
    const r = await loader.toolsRegistry.get('s.x').handler({});
    assert.strictEqual(r.error.code, 'UPSTREAM_INVALID_RESPONSE');
  });

  // ---------- Group 6: response_path ----------

  await testAsync('response_path extrae subcampo del body parseado', async () => {
    const bus = makeMiniBus();
    const fetchMock = makeFetchMock();
    fetchMock.queue.push({ status: 200, body: { data: { results: [{ text: 'hola' }] } } });
    const loader = makeLoader({ bus, fetchImpl: fetchMock });
    loader.registerToolsHttpForAI('m', [{
      name: 's.x',
      description: 'd', parameters: { type: 'object' },
      http: { method: 'GET', url: 'https://api.test', response_path: 'data.results[0].text' }
    }]);
    const r = await loader.toolsRegistry.get('s.x').handler({});
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data, 'hola');
  });

  // ---------- Group 7: Network errors y timeout ----------

  await testAsync('AbortError de fetch → UPSTREAM_TIMEOUT', async () => {
    const bus = makeMiniBus();
    const fetchMock = makeFetchMock();
    fetchMock.handler = () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
    const loader = makeLoader({ bus, fetchImpl: fetchMock });
    loader.registerToolsHttpForAI('m', [{
      name: 's.x',
      description: 'd', parameters: { type: 'object' },
      http: { method: 'GET', url: 'https://api.test', timeout_ms: 100 }
    }]);
    const r = await loader.toolsRegistry.get('s.x').handler({});
    assert.strictEqual(r.error.code, 'UPSTREAM_TIMEOUT');
  });

  await testAsync('Network error generico de fetch → UPSTREAM_UNREACHABLE', async () => {
    const bus = makeMiniBus();
    const fetchMock = makeFetchMock();
    fetchMock.handler = () => { throw new Error('ECONNREFUSED'); };
    const loader = makeLoader({ bus, fetchImpl: fetchMock });
    loader.registerToolsHttpForAI('m', [{
      name: 's.x',
      description: 'd', parameters: { type: 'object' },
      http: { method: 'GET', url: 'https://api.test' }
    }]);
    const r = await loader.toolsRegistry.get('s.x').handler({});
    assert.strictEqual(r.error.code, 'UPSTREAM_UNREACHABLE');
  });

  // ---------- Group 8: Unregister ----------

  await testAsync('unregisterToolsForAI: limpia tools_http del registry, bus, uiHandler', async () => {
    const bus = makeMiniBus();
    const ui = makeMiniUiHandler();
    const fetchMock = makeFetchMock();
    const loader = makeLoader({ bus, uiHandler: ui, fetchImpl: fetchMock });
    loader.registerToolsHttpForAI('module-x', [{
      name: 'a.x',
      description: 'd', parameters: { type: 'object' },
      http: { method: 'GET', url: 'https://api.test' }
    }]);
    assert.ok(loader.toolsRegistry.has('a.x'));
    assert.strictEqual(bus.listenerCount('a.x'), 1);
    assert.ok(ui.handlers.has('a.x'));

    loader.unregisterToolsForAI('module-x');

    assert.strictEqual(loader.toolsRegistry.has('a.x'), false);
    assert.strictEqual(bus.listenerCount('a.x'), 0);
    assert.strictEqual(ui.handlers.has('a.x'), false);
  });

  console.log('\nTodos los tests pasaron.');
  process.exit(0);
})().catch(err => { console.error('FATAL', err); process.exit(1); });

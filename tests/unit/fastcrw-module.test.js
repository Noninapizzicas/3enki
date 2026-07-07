/**
 * Tests unitarios — modules/fastcrw (puente tools_http a crw-server).
 *
 * Valida el module.json REAL: alimenta sus tools_http al loader y ejerce las
 * closures (templating de body + response_path) contra un fetch mockeado. Pilla
 * typos en url/body_template/response_path que romperían el puente en runtime.
 *
 * Ejecutar: node tests/unit/fastcrw-module.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ModuleLoader = require('../../core/modules/loader.js');

// ---- Mocks mínimos (self-contained) ----
function makeMiniBus() {
  const subs = new Map();
  return {
    subscribe(name, handler) {
      if (!subs.has(name)) subs.set(name, new Set());
      subs.get(name).add(handler);
      return () => subs.get(name)?.delete(handler);
    },
    async publish() {},
    listenerCount(name) { return subs.get(name)?.size || 0; }
  };
}
function makeMiniUi() {
  const handlers = new Map();
  return { handlers, register(d, a, h) { handlers.set(`${d}.${a}`, h); }, unregister() {} };
}
function makeFetchMock() {
  const state = { calls: [], handler: null };
  const fn = async function (url, opts) {
    state.calls.push({ url, opts });
    const out = state.handler ? state.handler({ url, opts }) : { status: 200, body: {} };
    const headers = new Map(Object.entries(out.headers || { 'content-type': 'application/json' }));
    return {
      status: out.status || 200,
      statusText: 'OK',
      headers: { get: (k) => headers.get(k.toLowerCase()) || null },
      async json() { return out.body; },
      async text() { return JSON.stringify(out.body); }
    };
  };
  Object.defineProperty(fn, 'calls', { get: () => state.calls });
  Object.defineProperty(fn, 'handler', { get: () => state.handler, set: (h) => { state.handler = h; } });
  return fn;
}
function makeLoader(fetchImpl) {
  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  const loader = new ModuleLoader({ core: { eventBus: makeMiniBus(), uiHandler: makeMiniUi() }, logger, modulesPath: '/tmp/__nope__' });
  if (fetchImpl) loader._fetchImpl = fetchImpl;
  return loader;
}

const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'modules', 'fastcrw', 'module.json'), 'utf8')
);

async function test(desc, fn) {
  try { await fn(); console.log(`✓ ${desc}`); }
  catch (err) { console.error(`✗ ${desc}\n  ${err.message}`); if (process.env.STACK) console.error(err.stack); process.exit(1); }
}

(async () => {
  console.log('modules/fastcrw — puente tools_http a crw-server\n');

  await test('module.json declara las 4 tools_http esperadas', async () => {
    const names = MANIFEST.tools_http.map(t => t.name);
    assert.deepStrictEqual(names.sort(), ['fastcrw.extract', 'fastcrw.map', 'fastcrw.scrape', 'fastcrw.search']);
    assert.strictEqual(MANIFEST.name, 'fastcrw');
  });

  await test('las 4 tools se registran en toolsRegistry (destino de tools_http)', async () => {
    const loader = makeLoader();
    loader.registerToolsHttpForAI('fastcrw', MANIFEST.tools_http);
    for (const n of ['fastcrw.scrape', 'fastcrw.extract', 'fastcrw.search', 'fastcrw.map']) {
      assert.ok(loader.toolsRegistry.has(n), `falta ${n}`);
      assert.ok(loader.toolsRegistry.get(n).http, `${n} no marcada http:true`);
    }
  });

  await test('fastcrw.scrape → POST /v1/scrape {url, formats:[markdown]} y extrae data.markdown', async () => {
    const fetchMock = makeFetchMock();
    fetchMock.handler = () => ({ status: 200, body: { success: true, data: { markdown: '# Hola\ncontenido' } } });
    const loader = makeLoader(fetchMock);
    loader.registerToolsHttpForAI('fastcrw', MANIFEST.tools_http);

    const res = await loader.toolsRegistry.get('fastcrw.scrape').handler({ url: 'https://soysuper.com/p/x' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data, '# Hola\ncontenido', 'response_path data.markdown');
    assert.strictEqual(fetchMock.calls[0].url, 'http://localhost:3002/v1/scrape');
    const sent = JSON.parse(fetchMock.calls[0].opts.body);
    assert.deepStrictEqual(sent, { url: 'https://soysuper.com/p/x', formats: ['markdown'] });
  });

  await test('fastcrw.extract → pasa el schema como OBJETO crudo y extrae data.json', async () => {
    const fetchMock = makeFetchMock();
    const salida = { nombre: 'Mayonesa', precio: 16.94, cantidad: '3 kg', formato: 'garrafa' };
    fetchMock.handler = () => ({ status: 200, body: { success: true, data: { json: salida } } });
    const loader = makeLoader(fetchMock);
    loader.registerToolsHttpForAI('fastcrw', MANIFEST.tools_http);

    const schema = { type: 'object', properties: { nombre: { type: 'string' }, precio: { type: 'number' } } };
    const res = await loader.toolsRegistry.get('fastcrw.extract').handler({ url: 'https://soysuper.com/p/x', schema });
    assert.deepStrictEqual(res.data, salida, 'response_path data.json');
    const sent = JSON.parse(fetchMock.calls[0].opts.body);
    assert.deepStrictEqual(sent.formats, ['json']);
    assert.deepStrictEqual(sent.jsonSchema, schema, 'schema va en jsonSchema top-level (lo que exige crw-server), como objeto crudo');
  });

  await test('crw-server caído → UPSTREAM_UNREACHABLE (degrada honesto, sin reventar)', async () => {
    const fetchMock = makeFetchMock();
    fetchMock.handler = () => ({ status: 503, body: { error: 'searxng disabled' } });
    const loader = makeLoader(fetchMock);
    loader.registerToolsHttpForAI('fastcrw', MANIFEST.tools_http);

    const res = await loader.toolsRegistry.get('fastcrw.search').handler({ query: 'harina', limit: 3 });
    assert.strictEqual(res.status, 503);
    assert.ok(res.error && res.error.code === 'UPSTREAM_UNREACHABLE', `esperado UPSTREAM_UNREACHABLE, got ${JSON.stringify(res.error)}`);
  });

  console.log('\n✓ fastcrw: todas las aserciones pasan');
})();

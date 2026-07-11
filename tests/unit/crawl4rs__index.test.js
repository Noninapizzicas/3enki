'use strict';

/**
 * crawl4rs__index — el PUENTE bus↔HTTP a Crawl4RS. Simula el servicio (job-based)
 * overrideando _http: token → submit → poll → result. Verifica la proyección al bus,
 * el reintento tras 401, el fallo/timeout del job, y la DEGRADACIÓN honesta (interruptor
 * OFF / servicio caído → 503).
 *
 * Ejecutar: node tests/unit/crawl4rs__index.test.js
 */

const assert = require('assert');
const Mod = require('../../modules/crawl4rs');

function nuevo({ activo = true } = {}) {
  const m = new Mod();
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  m.metrics = { increment() {} };
  m.eventBus = { publish() {} };
  m.activo = activo;
  m._pollMs = 1;
  m._timeoutMs = 200;
  return m;
}

// servicio feliz: /auth/token → /crawl {id} → status done → result pages
function servicioFeliz(m, { pages } = {}) {
  m._http = async (method, path) => {
    if (path === '/auth/token') return { status: 200, body: { token: 'tok', token_type: 'Bearer' } };
    if (method === 'POST' && path === '/crawl') return { status: 202, body: { id: 'job1' } };
    if (path === '/crawl/job1/status') return { status: 200, body: { id: 'job1', state: 'done', completed: 1 } };
    if (path === '/crawl/job1/result') return { status: 200, body: { pages: pages || [{ url: 'https://x/y', fit_markdown: '# hola', extracted: { precio: 9 } }] } };
    return { status: 404, body: null };
  };
}

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('leer feliz → markdown + extracción proyectados al bus', async () => {
  const m = nuevo();
  servicioFeliz(m);
  const r = await m._leer({ url: 'https://x/y' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.markdown, '# hola');
  assert.deepStrictEqual(r.data.extraido, { precio: 9 });
  assert.strictEqual(r.data.total, 1);
});

test('GATE: interruptor OFF → 503 {degradado, motivo:apagado}, sin tocar el servicio', async () => {
  const m = nuevo({ activo: false });
  let tocado = false;
  m._http = async () => { tocado = true; return { status: 200, body: {} }; };
  const r = await m._leer({ url: 'https://x/y' });
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.error.details.motivo, 'apagado');
  assert.strictEqual(tocado, false, 'OFF ni siquiera llama al servicio');
});

test('sin url → INVALID_INPUT', async () => {
  const m = nuevo();
  const r = await m._leer({});
  assert.strictEqual(r.status, 400);
});

test('reintento tras 401: token caduca en submit → re-token y éxito', async () => {
  const m = nuevo();
  let submits = 0, tokens = 0;
  m._http = async (method, path) => {
    if (path === '/auth/token') { tokens++; return { status: 200, body: { token: 'tok' + tokens } }; }
    if (method === 'POST' && path === '/crawl') { submits++; return submits === 1 ? { status: 401, body: null } : { status: 202, body: { id: 'job1' } }; }
    if (path === '/crawl/job1/status') return { status: 200, body: { state: 'done' } };
    if (path === '/crawl/job1/result') return { status: 200, body: { pages: [{ url: 'u', fit_markdown: 'ok' }] } };
    return { status: 404, body: null };
  };
  const r = await m._leer({ url: 'https://x/y' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(tokens, 2, 're-pidió token tras el 401');
  assert.strictEqual(r.data.markdown, 'ok');
});

test('job failed → 502 con el error', async () => {
  const m = nuevo();
  m._http = async (method, path) => {
    if (path === '/auth/token') return { status: 200, body: { token: 't' } };
    if (method === 'POST' && path === '/crawl') return { status: 202, body: { id: 'j' } };
    if (path === '/crawl/j/status') return { status: 200, body: { state: 'failed', error: 'boom' } };
    return { status: 404, body: null };
  };
  const r = await m._leer({ url: 'https://x/y' });
  assert.strictEqual(r.status, 502);
  assert.strictEqual(r.error.details.error, 'boom');
});

test('job que nunca termina → 504 timeout', async () => {
  const m = nuevo();
  m._timeoutMs = 30;
  m._http = async (method, path) => {
    if (path === '/auth/token') return { status: 200, body: { token: 't' } };
    if (method === 'POST' && path === '/crawl') return { status: 202, body: { id: 'j' } };
    if (path.endsWith('/status')) return { status: 200, body: { state: 'running' } };
    return { status: 404, body: null };
  };
  const r = await m._leer({ url: 'https://x/y' });
  assert.strictEqual(r.status, 504);
});

test('servicio caído (fetch lanza) → 503 {motivo:sin_servicio}', async () => {
  const m = nuevo();
  m._http = async () => { throw new Error('ECONNREFUSED'); };
  const r = await m._leer({ url: 'https://x/y' });
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.error.details.motivo, 'sin_servicio');
});

test('rastrear pasa max_depth/max_pages al cuerpo del crawl', async () => {
  const m = nuevo();
  let enviado = null;
  m._http = async (method, path, body) => {
    if (path === '/auth/token') return { status: 200, body: { token: 't' } };
    if (method === 'POST' && path === '/crawl') { enviado = body; return { status: 202, body: { id: 'j' } }; }
    if (path === '/crawl/j/status') return { status: 200, body: { state: 'done' } };
    if (path === '/crawl/j/result') return { status: 200, body: { pages: [] } };
    return { status: 404, body: null };
  };
  await m._rastrear({ url: 'https://x', max_depth: 3, max_pages: 50, cross_domain: true });
  assert.strictEqual(enviado.max_depth, 3);
  assert.strictEqual(enviado.max_pages, 50);
  assert.strictEqual(enviado.cross_domain, true);
});

test('descargar: url de imagen → base64 + content_type + ext', async () => {
  const m = nuevo();
  m._fetchBinario = async (url) => ({ status: 200, content_type: 'image/jpeg', ext: 'jpg', bytes: 3, base64: 'AQID' });
  const r = await m._descargar({ url: 'https://i0.wp.com/x.jpg' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.base64, 'AQID');
  assert.strictEqual(r.data.ext, 'jpg');
  assert.strictEqual(r.data.content_type, 'image/jpeg');
});

test('descargar: OFF → 503 sin tocar la red', async () => {
  const m = nuevo({ activo: false });
  let tocado = false;
  m._fetchBinario = async () => { tocado = true; return { status: 200 }; };
  const r = await m._descargar({ url: 'https://x/y.jpg' });
  assert.strictEqual(r.status, 503);
  assert.strictEqual(tocado, false);
});

test('descargar: sin url → INVALID_INPUT; recurso enorme → 413; 404 upstream → error', async () => {
  const m = nuevo();
  assert.strictEqual((await m._descargar({})).status, 400);
  m._fetchBinario = async () => ({ status: 413 });
  assert.strictEqual((await m._descargar({ url: 'https://x/big.zip' })).status, 413);
  m._fetchBinario = async () => ({ status: 404 });
  assert.strictEqual((await m._descargar({ url: 'https://x/no.jpg' })).status, 404);
});

test('_extDe: content-type manda, la url respalda', () => {
  const m = nuevo();
  assert.strictEqual(m._extDe('image/png', 'https://x/a'), 'png');
  assert.strictEqual(m._extDe('application/octet-stream', 'https://x/a.webp?v=1'), 'webp');
  assert.strictEqual(m._extDe('', 'https://x/sinpista'), 'bin');
});

test('onInterruptorCambiado enciende/apaga en caliente', () => {
  const m = nuevo({ activo: false });
  m.onInterruptorCambiado({ data: { id: 'crawl4rs', enabled: true } });
  assert.strictEqual(m.activo, true);
  m.onInterruptorCambiado({ data: { id: 'crawl4rs', enabled: false } });
  assert.strictEqual(m.activo, false);
  m.onInterruptorCambiado({ data: { id: 'otro', enabled: true } });
  assert.strictEqual(m.activo, false);
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`\n[crawl4rs__index] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`\n[crawl4rs__index] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}\n    ${e.message}`);
  process.exit(1);
})();

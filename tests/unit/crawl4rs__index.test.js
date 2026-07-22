'use strict';

/**
 * crawl4rs__index — el ÓRGANO WEB de Enki sobre OBSCURA. Simula el navegador
 * overrideando los seams (_render / _buscarSearx / _fetchBinario). Verifica la
 * proyección al bus (leer/rastrear/mapear/buscar/descargar), el BFS de rastrear,
 * y la DEGRADACIÓN honesta (interruptor OFF / obscura caída / SearXNG caído → 503).
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
  m._timeoutMs = 200;
  return m;
}

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('leer feliz → markdown + extracción proyectados al bus', async () => {
  const m = nuevo();
  m._render = async (url) => ({ markdown: '# hola', extraido: { precio: 9 }, enlaces: [], final_url: url });
  const r = await m._leer({ url: 'https://x/y' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.markdown, '# hola');
  assert.deepStrictEqual(r.data.extraido, { precio: 9 });
  assert.strictEqual(r.data.total, 1);
});

test('GATE: interruptor OFF → 503 {degradado, motivo:apagado}, sin tocar obscura', async () => {
  const m = nuevo({ activo: false });
  let tocado = false;
  m._render = async () => { tocado = true; return {}; };
  const r = await m._leer({ url: 'https://x/y' });
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.error.details.motivo, 'apagado');
  assert.strictEqual(tocado, false, 'OFF ni siquiera abre el navegador');
});

test('sin url → INVALID_INPUT', async () => {
  const m = nuevo();
  assert.strictEqual((await m._leer({})).status, 400);
});

test('obscura caída (throw) → 503 {motivo:sin_navegador}', async () => {
  const m = nuevo();
  m._render = async () => { throw new Error('ECONNREFUSED :9222'); };
  const r = await m._leer({ url: 'https://x/y' });
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.error.details.motivo, 'sin_navegador');
});

test('render con {fallo} (nav/timeout) → 502', async () => {
  const m = nuevo();
  m._render = async () => ({ fallo: { tipo: 'nav', motivo: '404' } });
  const r = await m._leer({ url: 'https://x/y' });
  assert.strictEqual(r.status, 502);
});

test('rastrear: BFS por obscura, dedup + tope de páginas, mismo dominio por defecto', async () => {
  const m = nuevo();
  const visitadas = [];
  m._render = async (url) => {
    visitadas.push(url);
    // la raíz enlaza a 2 internas + 1 externa; las internas no enlazan a nada nuevo
    if (url === 'https://x/') return { markdown: 'raiz', enlaces: ['https://x/a', 'https://x/b', 'https://otro/c'], final_url: url };
    return { markdown: 'hoja', enlaces: ['https://x/'], final_url: url };
  };
  const r = await m._rastrear({ url: 'https://x/', max_depth: 1, max_pages: 10 });
  assert.strictEqual(r.status, 200);
  const urls = r.data.paginas.map((p) => p.url).sort();
  assert.deepStrictEqual(urls, ['https://x/', 'https://x/a', 'https://x/b'], 'visita raíz + 2 internas; la externa se descarta (mismo dominio)');
  assert.strictEqual(r.data.total, 3);
});

test('rastrear: max_pages acota', async () => {
  const m = nuevo();
  m._render = async (url) => ({ markdown: 'p', enlaces: ['https://x/1', 'https://x/2', 'https://x/3', 'https://x/4'], final_url: url });
  const r = await m._rastrear({ url: 'https://x/0', max_depth: 5, max_pages: 2 });
  assert.strictEqual(r.data.total, 2);
});

test('mapear: enlaces de una página', async () => {
  const m = nuevo();
  m._render = async (url) => ({ enlaces: ['https://x/a', 'https://x/b'], final_url: url });
  const r = await m._mapear({ url: 'https://x/' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.total, 2);
  assert.deepStrictEqual(r.data.enlaces, ['https://x/a', 'https://x/b']);
});

test('buscar: SearXNG → resultados proyectados', async () => {
  const m = nuevo();
  m._buscarSearx = async (q, limit) => {
    assert.strictEqual(q, 'pizza');
    assert.strictEqual(limit, 5);
    return [{ title: 'T', url: 'https://r', snippet: 's' }];
  };
  const r = await m._buscar({ query: 'pizza', limit: 5 });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.resultados, [{ titulo: 'T', url: 'https://r', resumen: 's' }]);
});

test('buscar: SearXNG caído → 503 {motivo:sin_busqueda}', async () => {
  const m = nuevo();
  m._buscarSearx = async () => { throw new Error('ECONNREFUSED :8080'); };
  const r = await m._buscar({ query: 'x' });
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.error.details.motivo, 'sin_busqueda');
});

test('descargar: url de imagen → base64 + content_type + ext', async () => {
  const m = nuevo();
  m._fetchBinario = async () => ({ status: 200, content_type: 'image/jpeg', ext: 'jpg', bytes: 3, base64: 'AQID' });
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

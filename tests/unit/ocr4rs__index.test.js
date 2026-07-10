'use strict';

/**
 * ocr4rs__index — el PUENTE bus↔HTTP a OCR4RS. Simula el motor overrideando _leerBytes
 * (la imagen del fs) y _postOcr (la respuesta del /ocr). Verifica: la proyección al bus
 * (texto + evidencia con sha256), el handoff del PDF digital (409 + ocr4rs.pdf.es_digital),
 * la degradación honesta (interruptor OFF / sin servicio / sin modelos → 503), el lote,
 * y el guard no-inventar (imagen inexistente → 404, formato raro → 415/422).
 *
 * Ejecutar: node tests/unit/ocr4rs__index.test.js
 */

const assert = require('assert');
const Mod = require('../../modules/ocr4rs');

function nuevo({ activo = true } = {}) {
  const m = new Mod();
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  m.metrics = { increment() {} };
  m._eventos = [];
  m.eventBus = { publish: (ev, d) => m._eventos.push({ ev, d }) };
  m.activo = activo;
  m._timeoutMs = 200;
  // por defecto: la imagen existe (bytes falsos) y el motor responde texto.
  m._leerBytes = async () => Buffer.from('imagen-falsa-bytes');
  return m;
}

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('leer feliz → texto + evidencia (sha256) proyectados al bus', async () => {
  const m = nuevo();
  m._postOcr = async () => ({ status: 200, body: { text: 'Total 47,20€', pages: [{ n: 0, text: 'Total 47,20€' }], source_kind: 'image' }, text: '' });
  const r = await m._leer({ project_id: 'p1', path: '/facturas/f.jpg' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.texto, 'Total 47,20€');
  assert.strictEqual(r.data.source_kind, 'image');
  assert.ok(/^[a-f0-9]{64}$/.test(r.data.evidencia.sha256), 'la evidencia lleva sha256 (dirección de vuelta)');
  assert.strictEqual(r.data.evidencia.path, '/facturas/f.jpg');
  assert.ok(m._eventos.some((e) => e.ev === 'ocr4rs.texto.extraido'), 'emite el evento de dominio');
});

test('PDF escaneado multipágina → texto agregado + paginas', async () => {
  const m = nuevo();
  m._postOcr = async () => ({ status: 200, body: { text: '', source_kind: 'scanned_pdf', pages: [{ n: 0, text: 'pág uno' }, { n: 1, text: 'pág dos' }] }, text: '' });
  const r = await m._leer({ project_id: 'p1', path: '/docs/escaneo.pdf' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.source_kind, 'scanned_pdf');
  assert.strictEqual(r.data.paginas.length, 2);
  assert.ok(r.data.texto.includes('pág uno') && r.data.texto.includes('pág dos'), 'agrega el texto de las páginas');
});

test('HANDOFF: PDF digital → 409 redirigido a crawl4rs + emite ocr4rs.pdf.es_digital', async () => {
  const m = nuevo();
  m._postOcr = async () => ({ status: 422, body: null, text: 'el PDF tiene capa de texto (es digital): usa crawl4rs' });
  const r = await m._leer({ project_id: 'p1', path: '/docs/digital.pdf' });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'ES_DIGITAL_USA_CRAWL4RS');
  assert.strictEqual(r.error.details.redirigido, 'crawl4rs');
  assert.ok(m._eventos.some((e) => e.ev === 'ocr4rs.pdf.es_digital'), 'emite el handoff al bus');
});

test('degrada: interruptor OFF → 503 apagado (no toca el motor)', async () => {
  const m = nuevo({ activo: false });
  let tocado = false;
  m._postOcr = async () => { tocado = true; return { status: 200, body: {} }; };
  const r = await m._leer({ project_id: 'p1', path: '/x.jpg' });
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.error.details.motivo, 'apagado');
  assert.ok(/interruptor/i.test(r.error.message), 'error fértil: prescribe encender el interruptor');
  assert.strictEqual(tocado, false, 'con OFF ni llama al motor');
});

test('degrada: servicio caído → 503 sin_servicio', async () => {
  const m = nuevo();
  m._postOcr = async () => { throw new Error('ECONNREFUSED'); };
  const r = await m._leer({ project_id: 'p1', path: '/x.jpg' });
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.error.details.motivo, 'sin_servicio');
});

test('degrada: motor sin modelos → 503 sin_modelos (prescripción)', async () => {
  const m = nuevo();
  m._postOcr = async () => ({ status: 503, body: null, text: 'faltan modelos' });
  const r = await m._leer({ project_id: 'p1', path: '/x.jpg' });
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.error.details.motivo, 'sin_modelos');
  assert.ok(/get-models|\.rten|models/i.test(r.error.message), 'prescribe montar los modelos');
});

test('guard: imagen inexistente → 404 (no inventa)', async () => {
  const m = nuevo();
  m._leerBytes = async () => null;
  const r = await m._leer({ project_id: 'p1', path: '/no-existe.jpg' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
});

test('guard: sin path → INVALID_INPUT', async () => {
  const m = nuevo();
  const r = await m._leer({ project_id: 'p1' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
});

test('formato no soportado → 415 IMAGEN_INVALIDA', async () => {
  const m = nuevo();
  m._postOcr = async () => ({ status: 415, body: null, text: 'filtro JBIG2 no soportado' });
  const r = await m._leer({ project_id: 'p1', path: '/x.tiff' });
  assert.strictEqual(r.status, 415);
  assert.strictEqual(r.error.code, 'IMAGEN_INVALIDA');
});

test('lote: mezcla de éxitos y fallidos — los fallidos no frenan el lote', async () => {
  const m = nuevo();
  m._maxLote = 50;
  m._leerBytes = async (pid, path) => (path === '/malo.jpg' ? null : Buffer.from('ok'));
  m._postOcr = async () => ({ status: 200, body: { text: 'txt', source_kind: 'image', pages: [] }, text: '' });
  const r = await m._leerLote({ project_id: 'p1', paths: ['/a.jpg', '/malo.jpg', '/b.jpg'] });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.resultados.length, 2);
  assert.strictEqual(r.data.fallidos.length, 1);
  assert.strictEqual(r.data.fallidos[0].path, '/malo.jpg');
});

(async () => {
  let ok = 0;
  for (const { n, f } of tests) {
    try { await f(); console.log(`✓ ${n}`); ok++; }
    catch (e) { console.error(`✗ ${n}\n  ${e.message}`); process.exit(1); }
  }
  console.log(`\n[ocr4rs__index] OK ${ok}/${tests.length}`);
})();

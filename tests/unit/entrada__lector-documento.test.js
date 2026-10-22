'use strict';

/**
 * entrada/lector-documento — el salto bytes → TEXTO (contrato § 'A · lector-documento').
 *
 * Lo que se vigila aquí, en el orden en que la vertical puede mentir:
 *   1. sin project_id NO se lee nada (400, sin hecho).
 *   2. una extensión que no sabemos leer NO se intenta (415, sin tocar OCR).
 *   3. el documento que no está en el storage del proyecto es 404 (no se inventa texto).
 *   4. un PDF REAL con capa de texto se lee con `pdftotext` (source_kind 'digital') — PDF
 *      generado de verdad con pdfkit y extraído con el binario real, no un mock.
 *   5. con el motor OCR caído (puerto muerto) → 502 MOTOR_OCR_NO_DISPONIBLE y NUNCA se
 *      publica `contabilidad.documento_leido`: el fallo no se disfraza de lectura.
 *
 * Ejecutar: node tests/unit/entrada__lector-documento.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFDocument = require('pdfkit');

const LectorDocumento = require('../../modules/contabilidad-entrada/lector-documento/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const TEXTO_FACTURA = [
  'FACTURA 2026-0042',
  'Proveedor Ejemplo SL - NIF B12345678',
  'Base imponible: 100,00 EUR',
  'IVA 21%: 21,00 EUR',
  'TOTAL A PAGAR: 121,00 EUR'
].join('\n');

// Bus de mentira: guarda lo publicado y no entrega nada por subscribe (el módulo lo tolera).
function busFalso() {
  const publicados = [];
  return {
    publicados,
    publish(ev, p) { publicados.push({ ev, p }); },
    subscribe() { return () => {}; }
  };
}

function nuevo() {
  const m = new LectorDocumento();
  const bus = busFalso();
  m.eventBus = bus;
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  return { m, bus };
}

const eventos = (bus, nombre) => bus.publicados.filter((x) => x.ev === nombre);

// Lee por el camino REAL de RPC (onLeerRequest) para ver también los efectos de bus.
async function leer(m, data) {
  // El bus real entrega request_id DENTRO de data (publish({request_id, ...payload})).
  const request_id = 'req-' + Math.random().toString(16).slice(2);
  const res = await m.onLeerRequest({ request_id, data: { request_id, ...data } });
  const respuesta = eventos(m.eventBus, 'lector-documento.leer.response').pop();
  assert.ok(respuesta, 'debe publicarse lector-documento.leer.response');
  assert.strictEqual(respuesta.p.request_id, request_id, 'la response va correlada');
  return { res, respuesta: respuesta.p, request_id };
}

// PDF real (pdfkit) en un tmpdir propio; se borra al final del proceso.
function pdfDePrueba() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lector-doc-test-'));
  const ruta = path.join(dir, 'factura.pdf');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const out = fs.createWriteStream(ruta);
    out.on('finish', () => resolve({ dir, ruta }));
    out.on('error', reject);
    doc.pipe(out);
    doc.fontSize(12);
    for (const linea of TEXTO_FACTURA.split('\n')) doc.text(linea);
    doc.end();
  });
}

test('sin project_id → 400 INVALID_INPUT y NO publica el hecho', async () => {
  const { m, bus } = nuevo();
  const { res } = await leer(m, { documento: { path: 'inbox/f.pdf' } });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.error.code, 'INVALID_INPUT');
  assert.strictEqual(eventos(bus, 'contabilidad.documento_leido').length, 0);
  assert.strictEqual(eventos(bus, 'clasificador-documento.clasificar.request').length, 0);
  assert.strictEqual(eventos(bus, 'lector-documento.leer.failed').length, 1);
});

test('extensión no soportada (.docx) → 415 FORMATO_NO_SOPORTADO sin leer bytes', async () => {
  const { m, bus } = nuevo();
  const { res } = await leer(m, {
    project_id: 'p1', documento: { path: 'inbox/contrato.docx', nombre: 'contrato.docx' }
  });
  assert.strictEqual(res.status, 415);
  assert.strictEqual(res.error.code, 'FORMATO_NO_SOPORTADO');
  assert.strictEqual(eventos(bus, 'contabilidad.documento_leido').length, 0);
});

test('documento que no está en el storage (fs.read nulo por bus) → 404', async () => {
  const { m, bus } = nuevo();
  m._rpc = async () => null;   // el reflejo fs no lo encuentra
  const { res } = await leer(m, { project_id: 'p1', documento: { path: 'inbox/no-existe.pdf' } });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.error.code, 'RESOURCE_NOT_FOUND');
  assert.strictEqual(eventos(bus, 'contabilidad.documento_leido').length, 0);
});

test('PDF digital REAL → pdftotext, source_kind digital, hecho + encadenado al clasificador', async () => {
  const { dir, ruta } = await pdfDePrueba();
  try {
    const { m, bus } = nuevo();
    const { res } = await leer(m, {
      project_id: 'p1',
      documento: { mime: 'application/pdf', nombre: 'factura.pdf' },
      ruta_absoluta: ruta
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.error));
    assert.strictEqual(res.data.source_kind, 'digital');
    assert.strictEqual(res.data.motor, 'pdftotext');
    assert.ok(/FACTURA 2026-0042/.test(res.data.texto), 'el texto debe salir del PDF real');
    assert.ok(res.data.evidencia.sha256 && res.data.evidencia.bytes > 0);
    assert.strictEqual(res.data.abierto.texto, null);
    assert.ok(Array.isArray(res.data.paginas) && res.data.paginas.length >= 1);

    const hecho = eventos(bus, 'contabilidad.documento_leido');
    assert.strictEqual(hecho.length, 1, 'un PDF leído publica el hecho una vez');
    assert.strictEqual(hecho[0].p.source_kind, 'digital');
    assert.strictEqual(hecho[0].p.motor, 'pdftotext');
    const enc = eventos(bus, 'clasificador-documento.clasificar.request');
    assert.strictEqual(enc.length, 1, 'la lectura encadena SIEMPRE al clasificador');
    assert.strictEqual(enc[0].p.texto, res.data.texto);
    assert.strictEqual(eventos(bus, 'lector-documento.leer.failed').length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('motor OCR caído (puerto muerto) → 502 y NO publica documento_leido', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lector-doc-ocr-'));
  const ruta = path.join(dir, 'escaneo.jpg');
  fs.writeFileSync(ruta, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]));
  try {
    const { m, bus } = nuevo();
    m._baseUrl = 'http://127.0.0.1:1';   // nadie escucha aquí
    m._timeoutOcrMs = 3000;
    const { res } = await leer(m, {
      project_id: 'p1', documento: { mime: 'image/jpeg', nombre: 'escaneo.jpg' }, ruta_absoluta: ruta
    });
    assert.strictEqual(res.status, 502);
    assert.strictEqual(res.error.code, 'MOTOR_OCR_NO_DISPONIBLE');
    assert.ok(res.error.details && res.error.details.abierto, 'el 502 declara abierto.texto');
    assert.strictEqual(eventos(bus, 'contabilidad.documento_leido').length, 0, 'caído NO es leído');
    assert.strictEqual(eventos(bus, 'clasificador-documento.clasificar.request').length, 0);
    assert.strictEqual(eventos(bus, 'lector-documento.leer.failed').length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[entrada__lector-documento] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[entrada__lector-documento] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

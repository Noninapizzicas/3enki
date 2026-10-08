/**
 * Tests unitarios para nichos/conversor-fuente (bloque J · interlocutor proveedor).
 *
 * Cubre la reconciliación con el esquema REAL de crawl4rs: la fuente devuelve
 * los campos en español (titulo, resumen), y antes el conversor solo miraba
 * title/content/snippet (esquema searxng en inglés) → titulo/contenido null.
 *
 * Ejecutar con: node tests/unit/nichos__conversor-fuente.test.js
 */

const assert = require('assert');
const ConversorFuente = require('../../modules/nichos/conversor-fuente');

function test(description, fn) {
  try {
    fn();
    console.log(`✓ ${description}`);
  } catch (error) {
    console.error(`✗ ${description}`);
    console.error(`  ${error.message}`);
    process.exit(1);
  }
}

const conv = new ConversorFuente();

// Ítem EXACTO devuelto por crawl4rs en vivo (esquema español).
const ITEM_CRAWL4RS = {
  titulo: 'Instalación placas solares Alicante - Autosolar',
  url: 'https://autosolar.es/instalacion-placas-solares-alicante',
  resumen: 'AutoSolar es una empresa líder en la instalación de placas solares.'
};

console.log('\n🧪 Running conversor-fuente Tests\n');

test('crawl4rs (esquema español titulo/resumen) → dato COMPLETO', () => {
  const r = conv._normalizar({ crudo: ITEM_CRAWL4RS, origen: 'searxng' });
  assert.strictEqual(r.status, 200);
  const d = r.data.dato_homogeneo;
  assert.strictEqual(d.titulo, ITEM_CRAWL4RS.titulo);
  assert.strictEqual(d.contenido, ITEM_CRAWL4RS.resumen);
  assert.strictEqual(d.url, ITEM_CRAWL4RS.url);
  assert.strictEqual(d.origen_desconocido, false);
});

test('searxng (esquema inglés title/snippet) sigue funcionando → dato COMPLETO', () => {
  const r = conv._normalizar({ crudo: { title: 'T', snippet: 'C', url: 'https://x' }, origen: 'searxng' });
  const d = r.data.dato_homogeneo;
  assert.strictEqual(d.titulo, 'T');
  assert.strictEqual(d.contenido, 'C');
});

test('origen desconocido → degradación honesta (marca, no falla)', () => {
  const r = conv._normalizar({ crudo: { foo: 'bar' }, origen: 'raro' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.dato_homogeneo.origen_desconocido, true);
});

test('sin crudo → 400 INVALID_INPUT', () => {
  const r = conv._normalizar({ origen: 'searxng' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
});

test('sin origen → 400 INVALID_INPUT', () => {
  const r = conv._normalizar({ crudo: ITEM_CRAWL4RS });
  assert.strictEqual(r.status, 400);
});

console.log('\n✅ Todos los tests del conversor-fuente pasaron');

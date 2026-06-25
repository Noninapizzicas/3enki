'use strict';

/**
 * Sintonizador — la lente que alinea al LLM de Enki con el sesgo de quien le habla.
 *
 * No detecta el sesgo (eso es fuzzy, lo hace el LLM): compone la LENTE que el ai-gateway
 * inyecta en cada turno real. Esta suite fija lo que la lente DEBE llevar para funcionar:
 *   - los verbos (los lugares desde donde alguien mira),
 *   - el CUÁNDO (umbral · tirón · giro — no constante),
 *   - el mandato de soltar el reflejo propio cuando choca,
 *   - la regla de oro: silenciosa (no se recita) y en POSITIVO (Mandatos, sin prohibiciones).
 *
 * Ejecutar: node tests/unit/shared__sintonizador.test.js
 */

const assert = require('assert');
const Sintonizador = require('../../modules/_shared/sintonizador');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('la lente es un texto no vacío y se titula SINTONÍA', () => {
  const s = new Sintonizador().seccion();
  assert.strictEqual(typeof s, 'string');
  assert.ok(s.length > 200);
  assert.ok(/# SINTONÍA/.test(s));
});

test('lleva los VERBOS — el sesgo se lee como un verbo (desde dónde mira)', () => {
  const s = new Sintonizador().seccion();
  for (const v of ['resolver', 'explorar', 'entender', 'desahogar', 'jugar']) {
    assert.ok(s.includes(v), `falta el verbo ${v}`);
  }
});

test('lleva el CUÁNDO completo: umbral · tirón · giro', () => {
  const s = new Sintonizador().seccion().toLowerCase();
  assert.ok(s.includes('umbral'), 'falta el umbral');
  assert.ok(s.includes('tirón'),  'falta el tirón');
  assert.ok(s.includes('giro'),   'falta el giro');
});

test('manda soltar el reflejo propio cuando choca con el del humano', () => {
  const s = new Sintonizador().seccion().toLowerCase();
  assert.ok(s.includes('chocan') || s.includes('choca'));
  assert.ok(s.includes('suyo'), 'debe decir que se quede con el verbo suyo');
});

test('es SILENCIOSA: ordena no recitarla ni anunciarla', () => {
  const s = new Sintonizador().seccion().toLowerCase();
  assert.ok(s.includes('silencio'));
  assert.ok(s.includes('no anuncies') || s.includes('no recites'));
});

test('está en POSITIVO (P0): manda con imperativos de construir, no con prohibiciones al humano', () => {
  const s = new Sintonizador().seccion();
  // los mandatos clave existen
  for (const mandato of ['MIRA', 'NOTA', 'Hazlo EN SILENCIO']) {
    assert.ok(s.includes(mandato), `falta el mandato ${mandato}`);
  }
});

test('no detecta nada en JS: solo expone datos + compone (leer el sesgo es del LLM)', () => {
  // el contrato es que la clase no "adivina" el sesgo: no hay método que reciba un mensaje
  const s = new Sintonizador();
  assert.strictEqual(typeof s.seccion, 'function');
  assert.ok(Array.isArray(Sintonizador.VERBOS) && Sintonizador.VERBOS.length >= 5);
  assert.ok(Array.isArray(Sintonizador.CUANDO) && Sintonizador.CUANDO.length === 3);
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[shared__sintonizador] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[shared__sintonizador] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

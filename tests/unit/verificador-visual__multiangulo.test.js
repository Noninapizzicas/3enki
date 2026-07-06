'use strict';

/**
 * verificador-visual__multiangulo — los ÁNGULOS NUEVOS (v1.1.0, cosechados del ui-test de
 * Browserbase). El cerebro _evaluarSnapshot gana dos severidades: motivos[] HARD (los de
 * siempre, bloquean) + avisos[] SOFT (responsive + a11y, surfaced, NO bloquean). Se prueba la
 * función PURA con snapshots sintéticos (sin navegador): que los avisos aparezcan por su ángulo,
 * y — INVARIANTE clave — que `ok` NO dependa de los avisos (el freno bloquea exactamente lo mismo).
 *
 * Ejecutar: node tests/unit/verificador-visual__multiangulo.test.js
 */

const assert = require('assert');
const Verificador = require('../../modules/verificador-visual/index.js');

const m = new Verificador();
m.config = { max_overflow_px: 4, min_text_len: 12, min_font_px: 10, contrast_min: 4.5 };

// snapshot base "sano" (desktop OK); se le inyecta el ángulo a probar.
const sano = () => ({ consoleErrors: [], pageErrors: [], scrollWidth: 1280, clientWidth: 1280, textLength: 200, imgRoto: 0 });

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('sano y sin ángulos nuevos → ok, sin motivos ni avisos', () => {
  const r = m._evaluarSnapshot(sano(), m.config);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.motivos, []);
  assert.deepStrictEqual(r.avisos, []);
});

test('RESPONSIVE: overflow en móvil → aviso overflow_movil (SOFT), ok sigue true', () => {
  const r = m._evaluarSnapshot({ ...sano(), movil: { scrollWidth: 520, clientWidth: 390 } }, m.config);
  assert.ok(r.avisos.includes('overflow_movil'));
  assert.strictEqual(r.ok, true, 'un aviso NO tumba el freno');
});

test('RESPONSIVE: móvil dentro de tolerancia → sin aviso', () => {
  const r = m._evaluarSnapshot({ ...sano(), movil: { scrollWidth: 392, clientWidth: 390 } }, m.config);
  assert.ok(!r.avisos.includes('overflow_movil'));
});

test('A11Y: imágenes sin alt → aviso img_sin_alt', () => {
  const r = m._evaluarSnapshot({ ...sano(), a11y: { imgSinAlt: 3, langAusente: false, textoIlegible: 0, contrasteBajo: 0 } }, m.config);
  assert.ok(r.avisos.includes('img_sin_alt'));
  assert.strictEqual(r.ok, true);
});

test('A11Y: sin lang → aviso lang_ausente', () => {
  const r = m._evaluarSnapshot({ ...sano(), a11y: { imgSinAlt: 0, langAusente: true, textoIlegible: 0, contrasteBajo: 0 } }, m.config);
  assert.ok(r.avisos.includes('lang_ausente'));
});

test('A11Y: fuentes ilegibles → aviso texto_ilegible', () => {
  const r = m._evaluarSnapshot({ ...sano(), a11y: { imgSinAlt: 0, langAusente: false, textoIlegible: 5, contrasteBajo: 0 } }, m.config);
  assert.ok(r.avisos.includes('texto_ilegible'));
});

test('A11Y: contraste bajo → aviso contraste_bajo', () => {
  const r = m._evaluarSnapshot({ ...sano(), a11y: { imgSinAlt: 0, langAusente: false, textoIlegible: 0, contrasteBajo: 2 } }, m.config);
  assert.ok(r.avisos.includes('contraste_bajo'));
});

test('INVARIANTE: un HARD (overflow desktop) tumba ok AUNQUE haya o no avisos', () => {
  const r = m._evaluarSnapshot({ ...sano(), scrollWidth: 3000, clientWidth: 1280, a11y: { imgSinAlt: 1, langAusente: true } }, m.config);
  assert.strictEqual(r.ok, false, 'el HARD manda');
  assert.ok(r.motivos.includes('overflow_horizontal'));
  assert.ok(r.avisos.includes('img_sin_alt') && r.avisos.includes('lang_ausente'), 'los SOFT conviven, no cambian ok');
});

test('INVARIANTE: SOLO avisos (a11y roto, render sano) → ok SIGUE true (no regresión del freno)', () => {
  const r = m._evaluarSnapshot({ ...sano(), movil: { scrollWidth: 600, clientWidth: 390 }, a11y: { imgSinAlt: 4, langAusente: true, textoIlegible: 3, contrasteBajo: 5 } }, m.config);
  assert.strictEqual(r.ok, true, 'carta con problemas de a11y/móvil pero render sano → el freno NO la bloquea (solo avisa)');
  assert.strictEqual(r.avisos.length, 5);
  assert.deepStrictEqual(r.motivos, []);
});

test('snapshot viejo (sin a11y ni movil) → avisos [] (retrocompatible)', () => {
  const r = m._evaluarSnapshot(sano(), m.config);
  assert.deepStrictEqual(r.avisos, []);
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`\n[verificador-visual__multiangulo] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`\n[verificador-visual__multiangulo] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}\n    ${e.message}`);
  process.exit(1);
})();

'use strict';

/**
 * MotorDeReconsolidacion — el árbitro plasticidad/rigidez (puro).
 *
 * Demuestra la homeostasis completa con el caso real de las pizzas:
 *   - sella INVARIANTES por repetición (lo constante: masa, queso; NO lo que varía: base, toppings).
 *   - refuerza lo que encaja.
 *   - ENFORCE una violación puntual → el arreglo Hip Hop (pizza sin masa = artefacto MAL).
 *   - RECONSOLIDA cuando la MISMA violación se repite → evolución (focaccias), el patrón cede.
 *   - n_toppings (escalar que varía) nunca es invariante.
 *
 * Ejecutar: node tests/unit/shared__motor-reconsolidacion.test.js
 */

const assert = require('assert');
const Motor = require('../../modules/_shared/motor-reconsolidacion');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const pizza = (masa, base, queso, top) => ({ tipo: 'pizza', tiene_masa: masa, tiene_base: base, tiene_queso: queso, n_toppings: top });

// sella un patrón de pizza con masa+queso siempre, base/toppings variando
function motorSellado(opts) {
  const m = new Motor(opts);
  m.observar('pizza', pizza(true, true, true, 2));
  m.observar('pizza', pizza(true, true, true, 1));
  const r = m.observar('pizza', pizza(true, false, true, 3));   // sin base → base NO invariante
  return { m, sellarResult: r };
}

test('sella los INVARIANTES por repetición — lo constante, no lo que varía', () => {
  const { sellarResult } = motorSellado();
  assert.strictEqual(sellarResult.tipo, 'sellar');
  assert.deepStrictEqual(sellarResult.invariantes, { tiene_masa: true, tiene_queso: true });
  // tiene_base varió (2/3) → NO invariante; n_toppings es escalar → nunca invariante
  assert.ok(!('tiene_base' in sellarResult.invariantes));
  assert.ok(!('n_toppings' in sellarResult.invariantes));
});

test('antes del umbral: solo observa (1 vez no es patrón)', () => {
  const m = new Motor();
  const r = m.observar('pizza', pizza(true, true, true, 2));
  assert.strictEqual(r.tipo, 'observado');
  assert.strictEqual(r.n, 1);
  assert.strictEqual(m.patron('pizza'), null);
});

test('refuerzo: una pizza que respeta los invariantes sube la confianza', () => {
  const { m } = motorSellado();
  const c0 = m.patron('pizza').confianza;
  const r = m.observar('pizza', pizza(true, true, true, 5));   // masa+queso ✓
  assert.strictEqual(r.tipo, 'refuerzo');
  assert.strictEqual(r.confianza, c0 + 1);
});

test('ENFORCE (el arreglo Hip Hop): pizza sin masa, 1 vez → el artefacto está MAL', () => {
  const { m } = motorSellado();
  const r = m.observar('pizza', pizza(false, true, true, 2));   // Hip Hop: sin masa
  assert.strictEqual(r.tipo, 'enforce');
  assert.deepStrictEqual(r.viola, [{ dim: 'tiene_masa', esperado: true, fue: false }]);
  // el patrón NO cede ante un one-off → sigue exigiendo masa
  assert.strictEqual(m.patron('pizza').invariantes.tiene_masa, true);
});

test('RECONSOLIDAR: la MISMA violación ×umbralReabrir → el método evolucionó (plasticidad)', () => {
  const { m } = motorSellado({ umbralReabrir: 3 });
  const r1 = m.observar('pizza', pizza(false, true, true, 1));  // focaccia 1 → enforce
  const r2 = m.observar('pizza', pizza(false, true, true, 2));  // focaccia 2 → enforce
  const r3 = m.observar('pizza', pizza(false, true, true, 0));  // focaccia 3 → reconsolida
  assert.strictEqual(r1.tipo, 'enforce');
  assert.strictEqual(r2.tipo, 'enforce');
  assert.strictEqual(r3.tipo, 'reconsolidar');
  // tras reconsolidar, tiene_masa ya NO es invariante (cedió ante la evolución repetida)
  assert.ok(!('tiene_masa' in m.patron('pizza').invariantes));
  // pero tiene_queso sigue (las focaccias también llevan queso)
  assert.strictEqual(m.patron('pizza').invariantes.tiene_queso, true);
});

test('histéresis: una violación aislada NO re-abre (no thrashing)', () => {
  const { m } = motorSellado({ umbralReabrir: 3 });
  m.observar('pizza', pizza(false, true, true, 2));     // 1 violación de masa
  m.observar('pizza', pizza(true, true, true, 2));      // vuelve a respetar → refuerzo
  // la violación quedó aislada → el invariante masa SIGUE en pie
  assert.strictEqual(m.patron('pizza').invariantes.tiene_masa, true);
});

test('ámbitos independientes: salsa no contamina pizza', () => {
  const m = new Motor();
  for (let i = 0; i < 3; i++) m.observar('salsa', { tipo: 'salsa', tiene_masa: false, tiene_base: false, tiene_queso: false, n_toppings: 0 });
  assert.ok(m.patron('salsa'));
  assert.strictEqual(m.patron('pizza'), null);   // pizza no recibió nada
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[shared__motor-reconsolidacion] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[shared__motor-reconsolidacion] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

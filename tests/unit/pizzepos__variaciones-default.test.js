'use strict';

/**
 * Regresión: un producto SIN bloque de reglas en la carta debe permitir SUMAR ingredientes.
 * El bug: _configurar marcaba permite_anadir:false por defecto (|| false) → el VariacionesPanel
 * del comandero ocultaba la sección "sumar" en TODA pizza (la carta de menu-generator no trae
 * `variaciones`). Fix v4.3.0: permite_anadir = v.permite_anadir !== false (default true).
 *
 * Ejecutar: node tests/unit/pizzepos__variaciones-default.test.js
 */

const assert = require('assert');
const Variaciones = require('../../modules/pizzepos/variaciones');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevo() { return new Variaciones(); }   // _configurar / handleGet (path configurado) no usan logger

test('producto SIN reglas → permite_anadir = true (default)', async () => {
  const m = nuevo();
  m._configurar('pizzicas_batucada', {
    categoria: 'pizzicas', precio: 10.5,
    ingredientes: [{ id: 'tomate' }, { id: 'mozzarella' }],   // como vienen de la carta (sin `variaciones`)
  });
  const r = await m.handleGetVariacionesProducto({ producto_id: 'pizzicas_batucada' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.permite_anadir, true, 'una carta sin reglas no debe bloquear "sumar"');
});

test('la carta SÍ puede negar explícitamente → permite_anadir = false', async () => {
  const m = nuevo();
  m._configurar('p_no', {
    categoria: 'bebidas', precio: 1.5,
    variaciones: { permite_anadir: false },
    ingredientes: [],
  });
  const r = await m.handleGetVariacionesProducto({ producto_id: 'p_no' });
  assert.strictEqual(r.data.permite_anadir, false, 'permite_anadir:false explícito se respeta');
});

test('la carta puede afirmar explícitamente → permite_anadir = true', async () => {
  const m = nuevo();
  m._configurar('p_si', { categoria: 'pizzicas', precio: 10, variaciones: { permite_anadir: true }, ingredientes: [] });
  const r = await m.handleGetVariacionesProducto({ producto_id: 'p_si' });
  assert.strictEqual(r.data.permite_anadir, true);
});

// ── runner ──
(async () => {
  let passed = 0, failed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; } catch (err) { failed++; fails.push({ name, err }); }
  }
  if (failed === 0) { console.log(`\n[pizzepos__variaciones-default] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[pizzepos__variaciones-default] FAIL ${failed}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

'use strict';

/**
 * Banco de pruebas: LLENAR el contrato `producto.opciones` desde un producto real (Batucada) y
 * cruzarlo con el MotorDeOpciones. Prueba que menu-generator podrá producir opciones válidas y
 * que el motor las evalúa/preica. Puro, sin bus/fs/frontend.
 *
 * Ejecutar: node tests/unit/shared__derivar-opciones.test.js
 */

const assert = require('assert');
const { derivarOpciones } = require('../../modules/_shared/derivar-opciones');
const { evaluarProducto } = require('../../modules/_shared/motor-opciones');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// Batucada real + una paleta de su familia (subconjunto con algún precio).
const batucada = {
  id: 'pizzicas_batucada', precio: 10.5,
  ingredientes: [
    { id: 'tomate', nombre: 'Tomate', emoji: '🍅' },
    { id: 'mozzarella', nombre: 'Mozzarella', emoji: '🧀' },
    { id: 'queso_azul', nombre: 'Queso azul', emoji: '🧀' },
    { id: 'mezcla_de_quesos', nombre: 'Mezcla de quesos', emoji: '🧀' },
    { id: 'nata', nombre: 'Nata', emoji: '🥛' },
  ],
};
const paleta = [
  { id: 'tomate', nombre: 'Tomate' },           // ya en Batucada → se resta
  { id: 'mozzarella', nombre: 'Mozzarella' },    // ya en Batucada → se resta
  { id: 'bacon', nombre: 'Bacon', precio_extra: 0.5 },
  { id: 'pollo', nombre: 'Pollo', precio_extra: 0.5 },
  { id: 'champinon', nombre: 'Champiñón' },       // sin precio → 0
  { id: 'maiz', nombre: 'Maíz', precio_extra: 0.3, disponible: false },
];

test('QUITAR = los 5 ingredientes del producto (delta 0)', () => {
  const ops = derivarOpciones(batucada, paleta);
  const sin = ops.find(o => o.modo === 'QUITAR');
  assert.ok(sin, 'falta la opción QUITAR');
  assert.strictEqual(sin.valores.length, 5);
  assert.ok(sin.valores.every(v => v.delta_precio_centimos === 0));
});

test('ELEGIR_VARIOS = paleta menos lo propio; precio_extra → céntimos', () => {
  const ops = derivarOpciones(batucada, paleta);
  const anadir = ops.find(o => o.modo === 'ELEGIR_VARIOS');
  assert.ok(anadir, 'falta la opción ELEGIR_VARIOS');
  // 6 en paleta − 2 que ya lleva (tomate, mozzarella) = 4
  assert.strictEqual(anadir.valores.length, 4);
  assert.strictEqual(anadir.valores.find(v => v.id === 'bacon').delta_precio_centimos, 50);
  assert.strictEqual(anadir.valores.find(v => v.id === 'champinon').delta_precio_centimos, 0);
  assert.strictEqual(anadir.valores.find(v => v.id === 'maiz').disponible, false);
});

test('producto sin paleta → solo QUITAR (no hay nada que añadir)', () => {
  const ops = derivarOpciones(batucada, []);
  assert.strictEqual(ops.length, 1);
  assert.strictEqual(ops[0].modo, 'QUITAR');
});

test('round-trip: derivar → el motor valida y precia (1050 + bacon + pollo = 1150)', () => {
  const prod = { precio_base_centimos: 1050, opciones: derivarOpciones(batucada, paleta) };
  const r = evaluarProducto(prod, { anadir: ['bacon', 'pollo'] });
  assert.strictEqual(r.valida, true);
  assert.strictEqual(r.precio_final_centimos, 1150);
});

test('round-trip: añadir un no-disponible (maíz) → el motor lo rechaza', () => {
  const prod = { precio_base_centimos: 1050, opciones: derivarOpciones(batucada, paleta) };
  const r = evaluarProducto(prod, { anadir: ['maiz'] });
  assert.strictEqual(r.valida, false);
});

// ── runner ──
let passed = 0, failed = 0; const fails = [];
for (const { name, fn } of tests) {
  try { fn(); passed++; } catch (err) { failed++; fails.push({ name, err }); }
}
if (failed === 0) { console.log(`\n[shared__derivar-opciones] OK ${passed}/${tests.length}`); process.exit(0); }
console.error(`\n[shared__derivar-opciones] FAIL ${failed}/${tests.length}`);
for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
process.exit(1);

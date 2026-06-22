'use strict';

/**
 * Banco de pruebas del subsistema `Opciones` (norte en CLAUDE.md "AVANZADILLA — Subsistema Opciones").
 *
 * Prueba el MotorDeOpciones GENÉRICO contra datos REALES de pizzepos (pizza Batucada de la carta
 * carta_carta1completa): modela su "quitar/sumar ingredientes" como Opciones (modos QUITAR +
 * ELEGIR_VARIOS) y verifica validación + precio. Sin bus, sin fs, sin frontend.
 *
 * Ejecutar: node tests/unit/shared__motor-opciones.test.js
 */

const assert = require('assert');
const { MODOS, evaluarOpcion, evaluarProducto } = require('../../modules/_shared/motor-opciones');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── Batucada real (precio 10,50 €), modelada como Producto con Opciones ──
// QUITAR: sus 5 ingredientes base (delta 0). ELEGIR_VARIOS: paleta de familia con precio.
const batucada = {
  id: 'pizzicas_batucada',
  precio_base_centimos: 1050,
  opciones: [
    {
      id: 'sin', etiqueta: 'Sin', modo: 'QUITAR',
      valores: [
        { id: 'tomate', etiqueta: 'Tomate', delta_precio_centimos: 0 },
        { id: 'mozzarella', etiqueta: 'Mozzarella', delta_precio_centimos: 0 },
        { id: 'queso_azul', etiqueta: 'Queso azul', delta_precio_centimos: 0 },
        { id: 'mezcla_de_quesos', etiqueta: 'Mezcla de quesos', delta_precio_centimos: 0 },
        { id: 'nata', etiqueta: 'Nata', delta_precio_centimos: 0 },
      ],
    },
    {
      id: 'anadir', etiqueta: 'Añadir ingredientes', modo: 'ELEGIR_VARIOS', min: 0, max: 5,
      valores: [
        { id: 'bacon', etiqueta: 'Bacon', delta_precio_centimos: 50 },
        { id: 'pollo', etiqueta: 'Pollo', delta_precio_centimos: 50 },
        { id: 'champinon', etiqueta: 'Champiñón', delta_precio_centimos: 40 },
        { id: 'pepperoni', etiqueta: 'Pepperoni', delta_precio_centimos: 60 },
        { id: 'maiz', etiqueta: 'Maíz', delta_precio_centimos: 30, disponible: false },
      ],
    },
  ],
};

// ── modos ──
test('motor: declara exactamente los 3 modos universales', () => {
  assert.deepStrictEqual([...MODOS].sort(), ['ELEGIR_UNO', 'ELEGIR_VARIOS', 'QUITAR']);
});

// ── producto sin tocar ──
test('Batucada sin selección → válida, precio base 1050', () => {
  const r = evaluarProducto(batucada, {});
  assert.strictEqual(r.valida, true);
  assert.strictEqual(r.precio_final_centimos, 1050);
});

// ── QUITAR ──
test('QUITAR un ingrediente de la base → válida, precio no cambia (1050)', () => {
  const r = evaluarProducto(batucada, { sin: ['tomate'] });
  assert.strictEqual(r.valida, true);
  assert.strictEqual(r.precio_final_centimos, 1050);
});

test('QUITAR un ingrediente que NO está en la base → inválida', () => {
  const r = evaluarProducto(batucada, { sin: ['piña'] });
  assert.strictEqual(r.valida, false);
  assert.ok(r.errores.some(m => /valor desconocido/.test(m)));
});

// ── ELEGIR_VARIOS (sumar) ──
test('SUMAR bacon+pollo → válida, precio 1050 + 50 + 50 = 1150', () => {
  const r = evaluarProducto(batucada, { anadir: ['bacon', 'pollo'] });
  assert.strictEqual(r.valida, true);
  assert.strictEqual(r.precio_final_centimos, 1150);
});

test('SUMAR un extra desconocido → inválida', () => {
  const r = evaluarProducto(batucada, { anadir: ['trufa_blanca'] });
  assert.strictEqual(r.valida, false);
});

test('SUMAR un extra NO disponible (maíz) → inválida', () => {
  const r = evaluarProducto(batucada, { anadir: ['maiz'] });
  assert.strictEqual(r.valida, false);
  assert.ok(r.errores.some(m => /no disponible/.test(m)));
});

test('SUMAR por encima del máximo (6 > max 5) → inválida', () => {
  const seis = { anadir: ['bacon', 'pollo', 'champinon', 'pepperoni', 'bacon', 'pollo'] };
  // dedup interno: bacon/pollo repetidos colapsan; forzamos 6 distintos válidos no hay → probamos el guard con max bajo
  const prod = JSON.parse(JSON.stringify(batucada));
  prod.opciones[1].max = 2;
  const r = evaluarProducto(prod, { anadir: ['bacon', 'pollo', 'champinon'] });
  assert.strictEqual(r.valida, false);
  assert.ok(r.errores.some(m => /máximo 2/.test(m)));
});

test('SUMAR ids repetidos se deduplican (bacon,bacon = un bacon, +50)', () => {
  const r = evaluarOpcion(batucada.opciones[1], ['bacon', 'bacon']);
  assert.strictEqual(r.valida, true);
  assert.strictEqual(r.deltaCentimos, 50);
});

// ── combinación quitar + sumar ──
test('QUITAR nata + SUMAR pepperoni → válida, 1050 + 60 = 1110', () => {
  const r = evaluarProducto(batucada, { sin: ['nata'], anadir: ['pepperoni'] });
  assert.strictEqual(r.valida, true);
  assert.strictEqual(r.precio_final_centimos, 1110);
});

// ── ELEGIR_UNO (variante obligatoria — generalidad: vale para "tamaño" de pizza o "talla" de pantalón) ──
test('ELEGIR_UNO requerido sin elegir → inválida; eligiendo uno → válida + su delta', () => {
  const tamano = {
    id: 'tamano', etiqueta: 'Tamaño', modo: 'ELEGIR_UNO', requerido: true,
    valores: [
      { id: 'mediana', etiqueta: 'Mediana', delta_precio_centimos: 0 },
      { id: 'familiar', etiqueta: 'Familiar', delta_precio_centimos: 400 },
    ],
  };
  assert.strictEqual(evaluarOpcion(tamano, []).valida, false);
  const r = evaluarOpcion(tamano, ['familiar']);
  assert.strictEqual(r.valida, true);
  assert.strictEqual(r.deltaCentimos, 400);
  // dos a la vez en ELEGIR_UNO → inválida
  assert.strictEqual(evaluarOpcion(tamano, ['mediana', 'familiar']).valida, false);
});

// ── runner ──
let passed = 0, failed = 0;
const fails = [];
for (const { name, fn } of tests) {
  try { fn(); passed++; }
  catch (err) { failed++; fails.push({ name, err }); }
}
if (failed === 0) {
  console.log(`\n[shared__motor-opciones] OK ${passed}/${tests.length}`);
  process.exit(0);
}
console.error(`\n[shared__motor-opciones] FAIL ${failed}/${tests.length}`);
for (const { name, err } of fails) { console.error(`  x ${name}\n    ${err.message}`); }
process.exit(1);

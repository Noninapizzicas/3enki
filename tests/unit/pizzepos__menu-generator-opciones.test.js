'use strict';

/**
 * Paso 3 del banco de pruebas Opciones: el reflejo de menu-generator (_proyectar) LLENA
 * producto.opciones al estructurar la carta. Así la carta NACE con opciones y variaciones ya no
 * tiene que derivarlas al vuelo.
 *
 * Ejecuta _proyectar directo (sin bus/fs) sobre una fuente JSON y cruza con el motor.
 * Ejecutar: node tests/unit/pizzepos__menu-generator-opciones.test.js
 */

const assert = require('assert');
const MenuGeneratorReflejo = require('../../modules/pizzepos/menu-generator');
const { evaluarProducto } = require('../../modules/_shared/motor-opciones');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const fuente = {
  categorias: [{ id: 'pizzicas', nombre: 'Pizzicas' }, { id: 'bebidas', nombre: 'Bebidas' }],
  productos: [
    { nombre: 'Batucada', categoria_id: 'pizzicas', precio: 10.5, ingredientes: [
      { nombre: 'Tomate', familia: 'verdura' }, { nombre: 'Mozzarella', familia: 'queso' },
      { nombre: 'Queso azul', familia: 'queso' }, { nombre: 'Mezcla de quesos', familia: 'queso' },
      { nombre: 'Nata', familia: 'salsa' },
    ] },
    { nombre: 'Country', categoria_id: 'pizzicas', precio: 11.5, ingredientes: [
      { nombre: 'Tomate', familia: 'verdura' }, { nombre: 'Salsa BBQ', familia: 'salsa' },
      { nombre: 'Nata', familia: 'salsa' }, { nombre: 'Pollo', familia: 'carne' },
      { nombre: 'Mezcla de quesos', familia: 'queso' }, { nombre: 'Cebolla', familia: 'verdura' },
      { nombre: 'Bacon', familia: 'carne' },
    ] },
    { nombre: 'Agua', categoria_id: 'bebidas', precio: 1, ingredientes: [] },
  ],
};

function proyectar() {
  return new MenuGeneratorReflejo()._proyectar(fuente, 'Test', 'carta_test');
}

test('la carta nace con producto.opciones (Batucada: QUITAR 5 + ELEGIR_VARIOS 4)', () => {
  const carta = proyectar();
  const bat = carta.productos.find(p => p.id === 'pizzicas_batucada');
  assert.ok(bat, 'falta el producto');
  assert.ok(Array.isArray(bat.opciones), 'el producto no nació con opciones');
  const sin = bat.opciones.find(o => o.modo === 'QUITAR');
  const anadir = bat.opciones.find(o => o.modo === 'ELEGIR_VARIOS');
  assert.strictEqual(sin.valores.length, 5);
  assert.strictEqual(anadir.valores.length, 4);   // paleta pizzicas (9) − propios (5)
});

test('producto sin ingredientes (Agua) → sin opciones', () => {
  const carta = proyectar();
  const agua = carta.productos.find(p => p.id === 'bebidas_agua');
  assert.ok(agua, 'falta Agua');
  assert.strictEqual(agua.opciones, undefined);
});

test('round-trip: las opciones que nacen validan/precian con el motor', () => {
  const carta = proyectar();
  const bat = carta.productos.find(p => p.id === 'pizzicas_batucada');
  const r = evaluarProducto({ precio_base_centimos: 1050, opciones: bat.opciones }, { anadir: ['bacon'] });
  assert.strictEqual(r.valida, true);
  assert.strictEqual(r.precio_final_centimos, 1050);   // precio_extra 0 hasta que se fijen
});

// ── runner ──
let passed = 0, failed = 0; const fails = [];
for (const { name, fn } of tests) {
  try { fn(); passed++; } catch (err) { failed++; fails.push({ name, err }); }
}
if (failed === 0) { console.log(`\n[pizzepos__menu-generator-opciones] OK ${passed}/${tests.length}`); process.exit(0); }
console.error(`\n[pizzepos__menu-generator-opciones] FAIL ${failed}/${tests.length}`);
for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
process.exit(1);

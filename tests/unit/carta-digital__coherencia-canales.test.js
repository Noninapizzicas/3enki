/**
 * Tests unitarios — scripts/coherencia-canales (comparador de los dos canales de la carta).
 *
 * El script NO re-implementa reglas: lee un bundle publicado, extrae su runtime y llama a las
 * funciones reales de la página. Se prueba contra un bundle de verdad generado por la plantilla
 * (no una maqueta ad-hoc), así que si la plantilla cambia de forma, el test lo nota.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { generateStaticHTML } = require('../../modules/pizzepos/carta-digital/static-template.js');

const SCRIPT = path.join(__dirname, '../../scripts/coherencia-canales.js');

function bundle({ conBebida }) {
  const carta = {
    categorias: [
      { id: 'pizzas', nombre: 'Pizzas', orden: 1 },
      { id: 'bebidas', nombre: 'Bebidas', orden: 2 },
    ],
    productos: [
      // pizza: su base usa dos ingredientes del catálogo (Mozzarella, Anchoas)
      { id: 'p1', nombre: 'Bachata', categoria: 'pizzas', precio: 9.5, alergenos: [], ingredientes: [{ nombre: 'Mozzarella', tipo: 'queso' }, { nombre: 'Anchoas', tipo: 'marisco' }] },
      // producto sin ingredientes propios: no es pizza
      ...(conBebida ? [{ id: 'b1', nombre: 'Coca-Cola', categoria: 'bebidas', precio: 1.5, alergenos: [], ingredientes: [] }] : []),
    ],
    catalogo_ingredientes: [
      { id: 'mozzarella', nombre: 'Mozzarella', emoji: '🧀', tipo: 'queso', grupos: ['pizzas'], precio_extra: 0.5 },
      { id: 'anchoas', nombre: 'Anchoas', emoji: '🐟', tipo: 'marisco', grupos: ['pizzas'], precio_extra: 1 },
      { id: 'bacon', nombre: 'Bacon', emoji: '🥓', tipo: 'carne', grupos: ['pizzas'], precio_extra: 1 },
    ],
    alergenos_leyenda: [],
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coherencia-'));
  const f = path.join(dir, 'carta.html');
  fs.writeFileSync(f, generateStaticHTML(carta, { nombre_negocio: 'Nonina', moneda: '€' }, {}));
  return f;
}

function run(file) {
  try {
    const out = execFileSync('node', [SCRIPT, file, '--json'], { encoding: 'utf8' });
    return { code: 0, json: JSON.parse(out) };
  } catch (e) {
    return { code: e.status, json: JSON.parse(e.stdout) };
  }
}

test('coherencia-canales — precio idéntico entre canales y base cobrada dos veces', () => {
  const r = run(bundle({ conBebida: false }));
  assert.strictEqual(r.code, 0, 'sin productos fuera de pizza el chequeo sale limpio');
  assert.deepStrictEqual(r.json.precioDistinto, [], 'una sola tabla de precios: cero discrepancias');
  const pizza = r.json.productos.find((p) => p.producto === 'Bachata');
  assert.strictEqual(pizza.b, 3, 'el constructor ofrece todo el catálogo');
  assert.strictEqual(pizza.a, 1, 'el detalle esconde los 2 ingredientes que la pizza ya lleva');
  const doble = r.json.baseCobradaOtraVez.find((p) => p.producto === 'Bachata');
  assert.deepStrictEqual(doble.ingredientes.map((i) => i.nombre), ['Mozzarella', 'Anchoas'], 'nombra lo que se cobra dos veces');
});

test('coherencia-canales — canta el producto no-pizza que ofrece ingredientes (sale 1)', () => {
  const r = run(bundle({ conBebida: true }));
  assert.strictEqual(r.code, 1, 'es una incoherencia real: bebida ofreciendo ingredientes');
  const fuera = r.json.ofrecenIngredientesSinPizza;
  assert.strictEqual(fuera.length, 1);
  assert.strictEqual(fuera[0].producto, 'Coca-Cola');
  assert.strictEqual(fuera[0].categoria, 'Bebidas', 'dice en qué categoría pasa');
  assert.strictEqual(fuera[0].ingredientes, 3, 'la bebida ofrece los 3 ingredientes del catálogo');
});

test('coherencia-canales — no escribe nada: la carta de entrada queda intacta', () => {
  const f = bundle({ conBebida: true });
  const antes = fs.readFileSync(f, 'utf8');
  run(f);
  assert.strictEqual(fs.readFileSync(f, 'utf8'), antes, 'el chequeo es de solo lectura');
});

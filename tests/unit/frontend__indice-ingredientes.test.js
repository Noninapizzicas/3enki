#!/usr/bin/env node
/**
 * Tests del índice de secciones por ingrediente principal (frontend, puro).
 *
 * transpila el .ts con esbuild (el módulo no tiene dependencias de runtime: su
 * único import es `import type`, que se borra) y lo ejecuta contra la carta real
 * de the-pirate para que el número que se pinta en pantalla sea el del dato.
 */
'use strict';

const assert  = require('assert');
const fs      = require('fs');
const path    = require('path');
const { execFileSync } = require('child_process');

const RAIZ      = path.resolve(__dirname, '../..');
const FUENTE    = path.join(RAIZ, 'frontend/src/lib/utils/indice-ingredientes.ts');
const SALIDA    = '/tmp/indice-ingredientes.test.cjs';
const ESBUILD   = path.join(RAIZ, 'frontend/node_modules/.bin/esbuild');

// La carta vive en data/ (gitignored): el test la busca en el worktree y, si no
// está, en el árbol desplegado. Sin carta, los tests de dato real se omiten en vez
// de fallar: la lógica pura se sigue probando igual.
const REL_CARTA = 'data/projects/the-pirate/storage/pizzepos/cartas/the-pirate-v4.json';
const CARTA     = [path.join(RAIZ, REL_CARTA), path.join('/opt/enki', REL_CARTA)]
  .find(p => fs.existsSync(p)) || null;

execFileSync(ESBUILD, [FUENTE, '--format=cjs', '--platform=node', `--outfile=${SALIDA}`], { stdio: 'pipe' });
const mod = require(SALIDA);

let pasados = 0;
function test(nombre, fn) {
  try { fn(); pasados++; console.log(`  ✓ ${nombre}`); }
  catch (e) { console.error(`  ✗ ${nombre}\n    ${e.message}`); process.exitCode = 1; }
}

console.log('indice-ingredientes');

// ---------- 1. Formas de ingrediente ----------
test('idDeIngrediente acepta objeto y string', () => {
  assert.strictEqual(mod.idDeIngrediente({ id: 'jamon_de_york', nombre: 'Jamón de york' }), 'jamon_de_york');
  assert.strictEqual(mod.idDeIngrediente('Jamón de York'), 'jamon_de_york');
  assert.strictEqual(mod.idDeIngrediente(null), null);
});

test('llevaIngrediente mira ingredientes e ingredientes_base', () => {
  assert.strictEqual(mod.llevaIngrediente({ ingredientes: [{ id: 'bacon' }] }, 'bacon'), true);
  assert.strictEqual(mod.llevaIngrediente({ ingredientes_base: ['Bacon'] }, 'bacon'), true);
  assert.strictEqual(mod.llevaIngrediente({ ingredientes: [] }, 'bacon'), false);
});

// ---------- 2. Reglas del índice ----------
test('sin productos → sin secciones', () => {
  assert.deepStrictEqual(mod.construirSeccionesIngredientes([]), []);
  assert.deepStrictEqual(mod.construirSeccionesIngredientes(undefined), []);
});

test('solo cuenta pizzas: un producto de otra categoría con el ingrediente no entra', () => {
  const secciones = mod.construirSeccionesIngredientes([
    { id: 'p1', categoria_id: 'pizzas',    ingredientes: [{ id: 'bacon', nombre: 'Bacon' }] },
    { id: 'b1', categoria_id: 'bebidas',   ingredientes: [{ id: 'bacon', nombre: 'Bacon' }] }
  ]);
  const bacon = secciones.find(s => s.ingrediente_id === 'bacon');
  assert.strictEqual(bacon.productos.length, 1);
  assert.strictEqual(bacon.productos[0].id, 'p1');
});

test('una pizza con dos principales aparece en las dos secciones', () => {
  const doble = { id: 'p2', categoria_id: 'pizzas', ingredientes: [{ id: 'jamon_de_york' }, { id: 'bacon' }] };
  const secciones = mod.construirSeccionesIngredientes([doble]);
  assert.deepStrictEqual(secciones.map(s => s.ingrediente_id).sort(), ['bacon', 'jamon_de_york']);
});

test('las secciones vacías no se pintan y se ordenan por tamaño', () => {
  const secciones = mod.construirSeccionesIngredientes([
    { id: 'a', categoria_id: 'pizzas', ingredientes: [{ id: 'bacon' }] },
    { id: 'b', categoria_id: 'pizzas', ingredientes: [{ id: 'bacon' }, { id: 'atun' }] },
    { id: 'c', categoria_id: 'pizzas', ingredientes: [{ id: 'atun' }, { id: 'ternera' }] }
  ]);
  const ids = secciones.map(s => s.ingrediente_id);
  assert.strictEqual(ids[0], 'bacon');            // 2 pizzas; empate con atún → orden declarado
  assert.strictEqual(ids[1], 'atun');             // 2 pizzas
  assert.strictEqual(ids[2], 'ternera');          // 1 pizza
  assert.ok(!ids.includes('pollo'));              // 0 pizzas → no existe la sección
});

// ---------- 3 y 4. Contra la carta real ----------
if (!CARTA) {
  console.log('  – sin carta en disco (data/ es gitignored): se omiten los tests contra el dato real');
} else {
test('carta the-pirate-v4: secciones que salen hoy', () => {
  const carta = JSON.parse(fs.readFileSync(CARTA, 'utf8'));
  const secciones = mod.construirSeccionesIngredientes(carta.productos);
  const resumen = secciones.map(s => `${s.ingrediente_id}=${s.productos.length}`);

  console.log(`    → ${resumen.join(' · ')}`);
  assert.deepStrictEqual(resumen, [
    'jamon_de_york=8', 'bacon=4', 'atun=2', 'ternera=1', 'anchoas=1'
  ]);

  // El nombre y el emoji salen del dato de la carta, no de una tabla paralela.
  const jamon = secciones.find(s => s.ingrediente_id === 'jamon_de_york');
  assert.strictEqual(jamon.nombre, 'Jamón de york');
  assert.strictEqual(jamon.emoji, '🥩');

  // Ninguna pizza se pierde ni se inventa: cada sección apunta a productos reales.
  const idsReales = new Set(carta.productos.map(p => p.id));
  for (const s of jamon.productos) assert.ok(idsReales.has(s.id), `${s.id} no está en la carta`);
});

test('carta the-pirate-v4: Milonga ya no duplica (renombrada, id intacto)', () => {
  const carta = JSON.parse(fs.readFileSync(CARTA, 'utf8'));
  const secciones = mod.construirSeccionesIngredientes(carta.productos);
  const jamon = secciones.find(s => s.ingrediente_id === 'jamon_de_york');
  const nombres = jamon.productos.map(p => p.nombre);
  assert.ok(nombres.includes('Pizza de jamón York (Milonga)'));
  assert.ok(!nombres.includes('Milonga'));
});

// ---------- 4. La forma que llega de VERDAD a pantalla ----------
// productos.carta_completa no entrega `ingredientes`: los proyecta como
// `ingredientes_base` (modules/pizzepos/productos/index.js:203). Si el índice solo
// mirase `ingredientes`, en el comandero real saldría vacío con la carta intacta.
test('carta the-pirate-v4 proyectada (ingredientes_base) da las mismas secciones', () => {
  const carta = JSON.parse(fs.readFileSync(CARTA, 'utf8'));
  const proyectada = carta.productos.map(p => ({
    id: p.id,
    nombre: p.nombre,
    categoria_id: p.categoria_id,
    precio: p.precio,
    ingredientes_base: (p.ingredientes || []).map(i => ({ id: i.id, nombre: i.nombre, emoji: i.emoji }))
  }));
  const resumen = mod.construirSeccionesIngredientes(proyectada)
    .map(s => `${s.ingrediente_id}=${s.productos.length}`);
  assert.deepStrictEqual(resumen, ['jamon_de_york=8', 'bacon=4', 'atun=2', 'ternera=1', 'anchoas=1']);
});

// ---------- 5. Hermanas del COMANDERO (el bloque que se abre al pulsar la pizza) ----------
// Misma regla que la carta digital, pero aquí sobre los productos proyectados.
test('hermanasDe: la Milonga lista las otras 7 con jamón, sin ella misma', () => {
  const carta = JSON.parse(fs.readFileSync(CARTA, 'utf8'));
  const proyectada = carta.productos.map(p => ({
    id: p.id, nombre: p.nombre, categoria_id: p.categoria_id, precio: p.precio,
    ingredientes_base: (p.ingredientes || []).map(i => ({ id: i.id, nombre: i.nombre, emoji: i.emoji }))
  }));
  const milonga = proyectada.find(p => p.id === 'pizzas_pizza_de_jamon_york');
  const h = mod.hermanasDe(milonga, proyectada);
  assert.ok(h, 'debe haber eje');
  assert.strictEqual(h.principal.id, 'jamon_de_york');
  assert.strictEqual(h.principal.nombre, 'Jamón de york');
  assert.strictEqual(h.hermanas.length, 7);
  assert.ok(!h.hermanas.some(q => q.id === milonga.id), 'no se lista a sí misma');
});
}

test('hermanasDe: una pizza sin principal compartido no inventa bloque', () => {
  const p = (id, ings) => ({ id, nombre: id, categoria_id: 'pizzas', precio: 10,
    ingredientes_base: ings.map(n => ({ id: n, nombre: n })) });
  const todos = [
    p('a', ['tomate', 'mozzarella', 'albahaca']),
    p('b', ['tomate', 'mozzarella', 'bacon']),
    p('c', ['tomate', 'mozzarella', 'nata'])
  ];
  assert.strictEqual(mod.hermanasDe(todos[0], todos), null);
});

test('hermanasDe: fuera del sector pizzas no hay hermanas', () => {
  const p = { id: 'x', nombre: 'x', categoria_id: 'bebidas', precio: 2, ingredientes_base: [{ id: 'cola', nombre: 'Cola' }] };
  assert.strictEqual(mod.hermanasDe(p, [p, { ...p, id: 'y' }]), null);
});

console.log(`\n${pasados} tests OK`);

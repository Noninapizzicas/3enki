/**
 * Cubre el fin del módulo `ingredientes` (retirado 2026-10-17) y su relevo.
 *
 *   - productos._proyectarCatalogoIngredientes emite `grupos` = las puertas/categorías
 *     donde aparece cada ingrediente. Es el filtro que ya leían carta-digital
 *     (static-template extrasForGroup) y el panel; antes lo emitía el módulo `ingredientes`,
 *     cuyo store nunca se alimentó → catálogo 0 → el pepinillo del bocata caía en la pizza.
 *   - El dominio UI `ingredientes` responde YA desde productos (rebind): mismos domain+action
 *     que el frontend, sin estado nuevo ni copia del catálogo.
 *
 * Sin bus: la proyección es pura y se prueba directa; los handlers se prueban inyectando
 * `_cartaActiva` (su única dependencia).
 *
 * Ejecutar: node tests/unit/pizzepos__productos-ingredientes.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const ProductosModule = require('../../modules/pizzepos/productos/index.js');

// Carta con el patrón que rompía: un extra que vive SOLO en otro portal (el pepinillo del
// bocata de El Fardel) y otro compartido por varias pizzas (champiñones en Puerto Seguro).
const CARTA = {
  meta: { id: 'c_the-pirate', version: 43, estado: 'en_servicio' },
  categorias: [
    { id: 'puerto-seguro', nombre: 'Puerto Seguro' },
    { id: 'el-fardel', nombre: 'El Fardel' }
  ],
  productos: [
    { id: 'p1', nombre: 'La de York', precio: 10, categoria_id: 'puerto-seguro', ingredientes_base: [
      { id: 'mozzarella', nombre: 'Mozzarella', familia: 'queso' },
      { id: 'champinones', nombre: 'Champiñones', familia: 'verdura', precio_extra: 0.5 },
      { id: 'masa_madre', nombre: 'Masa madre napolitana', familia: 'otro', precio_extra: 1, alergenos: ['gluten'] }
    ] },
    { id: 'p2', nombre: 'La de Atún', precio: 10.5, categoria_id: 'puerto-seguro', ingredientes_base: [
      { id: 'champinones', nombre: 'Champiñones', familia: 'verdura', precio_extra: 0.5 }
    ] },
    { id: 'b1', nombre: 'Bocata', precio: 6, categoria_id: 'el-fardel', ingredientes_base: [
      { id: 'pepinillo', nombre: 'Pepinillo agridulce', familia: 'verdura', precio_extra: 0.5 }
    ] }
  ]
};

const nuevo = () => {
  const m = new ProductosModule();
  m.logger = { debug() {}, info() {}, warn() {}, error() {} };
  return m;
};
const proyectar = (carta = CARTA) => nuevo()._proyectarCatalogoIngredientes(carta);
const byId = (cat, id) => cat.find(i => i.id === id);
// Filtro de la carta pública (static-template.extrasForGroup): grupos ∩ [catId, nombreCat].
const visibleEnPuerta = (cat, grpKeys) =>
  cat.filter(i => { const g = i.grupos || []; return !g.length || g.some(k => grpKeys.includes(k)); });

test('proyección: cada ingrediente lleva `grupos` = las puertas donde aparece', () => {
  const cat = proyectar();
  assert.deepStrictEqual(byId(cat, 'pepinillo').grupos, ['el-fardel']);    // solo el bocata
  assert.deepStrictEqual(byId(cat, 'champinones').grupos, ['puerto-seguro']); // 2 pizzas → 1 puerta
  assert.deepStrictEqual(byId(cat, 'mozzarella').grupos, ['puerto-seguro']);
});

test('proyección: un extra de otra puerta NO cae en la pizza (el bug del pepinillo)', () => {
  const cat = proyectar();
  const puerta = ['puerto-seguro', 'las pizzas'];   // = catGrpKeys(catId) en el template
  const visible = visibleEnPuerta(cat, puerta);
  assert.ok(visible.some(i => i.id === 'champinones'), 'el extra de la pizza debe verse');
  assert.ok(!visible.some(i => i.id === 'pepinillo'), 'el pepinillo del bocata NO debe ofrecerse en la pizza');
  // y el reverso: en el bocata sí aparece
  assert.ok(visibleEnPuerta(cat, ['el-fardel']).some(i => i.id === 'pepinillo'));
});

test('proyección: alérgenos del ingrediente pasan (hereda la capacidad del módulo retirado)', () => {
  const masa = byId(proyectar(), 'masa_madre');
  assert.deepStrictEqual(masa.alergenos, ['gluten']);
  assert.strictEqual(masa.es_alergeno, true);
});

test('rebind: ingredientes.list responde desde productos (mismos domain+action que el frontend)', async () => {
  const m = nuevo(); m._cartaActiva = async () => CARTA;
  const r = await m.handleIngredientesList({ project_id: 'x', grupo: 'puerto-seguro' });
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.ingredientes.some(i => i.id === 'champinones'));
  assert.ok(!r.data.ingredientes.some(i => i.id === 'pepinillo'), 'el filtro por grupo excluye la otra puerta');
});

test('rebind: sin project_id → INVALID_INPUT (no cae al proyecto activo global)', async () => {
  const m = nuevo(); m._cartaActiva = async () => CARTA;
  const r = await m.handleIngredientesList({});
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
});

test('rebind: ingredientes.health declara la fuente (proyección de la carta, sin store)', async () => {
  const m = nuevo(); m._cartaActiva = async () => CARTA;
  const r = await m.handleIngredientesHealth({ project_id: 'x' });
  assert.strictEqual(r.data.module, 'productos(ingredientes)');
  assert.strictEqual(r.data.catalogo.total, 4);
});

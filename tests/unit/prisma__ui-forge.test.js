/**
 * Tests de prisma/ui-forge — el RENDER del POS (primera salida del taller).
 *
 * renderPOS(catalogo, marca) → bundle HTML+JS. Determinista y sin IO: se testea aquí.
 * La escritura a www/ + verificador-visual + el enganche del cobro al bus = en vivo.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { renderPOS, _proyectarPOS } = require('../../modules/prisma/ui-forge/render-pos.js');

const CAT = {
  meta: { id: 'c', nombre: 'Nonina' },
  categorias: [{ id: 'pizzas', nombre: 'Pizzas', orden: 1 }, { id: 'bebidas', nombre: 'Bebidas', orden: 2 }],
  productos: [
    { id: 'p1', nombre: 'Margarita', categoria_id: 'pizzas', precio_base_centimos: 850,
      naturalezas: { origen: 'elaborado' }, ejes: { tiempo: 'ninguno' },
      restricciones: [{ tipo: 'verdad_obligatoria', regla: 'gluten' }],
      contrato: { opciones: [{ id: 'masa', etiqueta: 'Masa', modo: 'ELEGIR_UNO', valores: [
        { id: 'fina', etiqueta: 'fina', delta_precio: 0, disponible: true },
        { id: 'napo', etiqueta: 'napolitana', delta_precio: 0, disponible: true }] },
        { id: 'extra', etiqueta: 'Extras', modo: 'ELEGIR_VARIOS', valores: [
        { id: 'bufala', etiqueta: 'Búfala', delta_precio: 2, disponible: true }] }] } },
    { id: 'p2', nombre: 'Agua', categoria_id: 'bebidas', precio_base_centimos: 150,
      naturalezas: { origen: 'de_reventa' }, ejes: { tiempo: 'ninguno' }, contrato: { opciones: [] } },
    { id: 'p3', nombre: 'Catering', categoria_id: 'pizzas',
      naturalezas: { origen: 'elaborado', precio: 'rango_valoracion' }, ejes: { tiempo: 'cita' }, contrato: { opciones: [] } }
  ]
};

test('proyección POS — conserva opciones con modo + deltas en céntimos', () => {
  const v = _proyectarPOS(CAT);
  const p1 = v.productos.find(p => p.id === 'p1');
  assert.equal(p1.precio_centimos, 850);
  assert.equal(p1.opciones.length, 2);
  assert.equal(p1.opciones[0].modo, 'ELEGIR_UNO');
  assert.equal(p1.opciones[1].valores[0].delta_centimos, 200); // 2€ → 200
  const p3 = v.productos.find(p => p.id === 'p3');
  assert.equal(p3.precio_centimos, null);      // consultar
  assert.equal(p3.requiere_cita, true);
});

test('render — bundle con catálogo embebido, categorías y el OpcionesRenderer', () => {
  const html = renderPOS(CAT, null);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Nonina · POS/);
  assert.match(html, /const DATA =/);          // catálogo embebido
  assert.match(html, /abrirOpciones/);          // OpcionesRenderer presente
  assert.match(html, /ELEGIR_UNO/);             // dibuja por modo
  assert.match(html, /Cobrar/);
});

test('render — la marca tiñe el acento; sin marca, base teal', () => {
  assert.match(renderPOS(CAT, { visual: { colores: { primario: '#8b5cf6' } } }), /--accent:#8b5cf6/);
  assert.match(renderPOS(CAT, null), /--accent:#14b8a6/);
});

test('render — escapa contenido (no inyecta HTML ni rompe el DATA embebido)', () => {
  const html = renderPOS({ meta: { nombre: 'X' }, categorias: [], productos: [
    { id: 'h', nombre: '</script><b>x', categoria_id: null, naturalezas: {}, ejes: {}, contrato: { opciones: [] } }
  ] }, null);
  assert.doesNotMatch(html, /<\/script><b>x/);   // el </script> del dato no cierra el bloque real
  assert.match(html, /\\u003c\/script/);          // va escapado dentro del DATA
});

console.log('prisma__ui-forge: asserts definidos');

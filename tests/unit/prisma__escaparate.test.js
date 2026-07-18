/**
 * Tests de prisma/escaparate — cara cliente pública. Núcleo PURO _proyectarPublico:
 * PODA lo que el comerciante no ofrece (oculta valores disponible:false), presenta
 * precio de cara al público (fijo/consultar) y surfacea avisos_obligatorios. Sin bus.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const PrismaEscaparateReflejo = require('../../modules/prisma/escaparate/index.js');

const E = new PrismaEscaparateReflejo();

const PIZZA = {
  id: 'comida_bachata', nombre: 'Bachata', arquetipo: 'comestible', categoria_id: 'comida', precio_base_centimos: 950,
  identidad: { que_es: 'pizza artesanal' },
  restricciones: [{ tipo: 'verdad_obligatoria', regla: 'gluten, lactosa', no_negociable: true }],
  ejes: { tiempo: 'ninguno' },
  contrato: { opciones: [{ id: 'extras', etiqueta: 'Extras', sub_forma: 'añadido', modo: 'ELEGIR_VARIOS',
    valores: [{ id: 'bacon', etiqueta: 'Bacon', delta_precio: 1.5, disponible: true }, { id: 'trufa', etiqueta: 'Trufa', delta_precio: 3, disponible: false }] }] }
};
const SERVICIO = {
  id: 'serv_color', nombre: 'Color', arquetipo: 'servicio', categoria_id: 'serv',
  identidad: { que_es: 'tinte de pelo' },
  restricciones: [{ tipo: 'verdad_obligatoria', regla: 'prueba de alergia al tinte', no_negociable: true }],
  ejes: { tiempo: 'cita' }, naturalezas: { precio: 'rango_valoracion' },
  contrato: { opciones: [] }
};

test('poda pública — oculta los valores disponible:false (el cliente no ve la trufa)', () => {
  const v = E._productoPublico(PIZZA);
  const extras = v.opciones.find(o => o.id === 'extras');
  assert.equal(extras.valores.length, 1);
  assert.equal(extras.valores[0].id, 'bacon');
  assert.ok(!extras.valores.some(x => x.id === 'trufa'));
});

test('precio de cara al público — fijo cuando hay precio_base', () => {
  const v = E._productoPublico(PIZZA);
  assert.equal(v.precio.tipo, 'fijo');
  assert.equal(v.precio.eur, 9.5);
  assert.deepEqual(v.avisos_obligatorios, ['gluten, lactosa']);
  assert.equal(v.requiere_cita, false);
});

test('servicio — precio consultar (rango_valoracion) + requiere_cita', () => {
  const v = E._productoPublico(SERVICIO);
  assert.equal(v.precio.tipo, 'consultar');
  assert.equal(v.precio.motivo, 'valoración');
  assert.equal(v.requiere_cita, true);
  assert.deepEqual(v.avisos_obligatorios, ['prueba de alergia al tinte']);
});

test('opción sin valores ofrecibles se cae (nada que elegir)', () => {
  const p = { id: 'x', nombre: 'X', arquetipo: 'pieza', identidad: { que_es: 'algo' },
    contrato: { opciones: [{ id: 'col', etiqueta: 'Color', sub_forma: 'variante', modo: 'ELEGIR_UNO',
      valores: [{ id: 'rojo', etiqueta: 'Rojo', disponible: false }] }] } };
  const v = E._productoPublico(p);
  assert.equal(v.opciones.length, 0);
});

test('proyecta el catálogo — categorías ordenadas + productos públicos', () => {
  const cat = { meta: { id: 'c', nombre: 'Mi tienda' }, categorias: [{ id: 'serv', orden: 1 }, { id: 'comida', orden: 0 }], productos: [PIZZA, SERVICIO] };
  const r = E._proyectarPublico(cat);
  assert.equal(r.categorias[0].id, 'comida');
  assert.equal(r.productos.length, 2);
});

// ── RENDER del bundle (v0.2.0) — _renderBundle(publico, marca) → HTML ──
const PUBLICO_RENDER = {
  comercio: { nombre: 'Nonina' },
  categorias: [{ id: 'pizzas', nombre: 'Pizzas', orden: 1 }, { id: 'bebidas', nombre: 'Bebidas', orden: 2 }],
  productos: [
    { id: 'p1', nombre: 'Margarita', descripcion: 'Tomate y mozzarella', categoria_id: 'pizzas',
      origen: 'elaborado', precio: { tipo: 'fijo', eur: 8.5 },
      opciones: [{ etiqueta: 'Masa', valores: [{ etiqueta: 'fina' }, { etiqueta: 'napolitana' }] }],
      avisos_obligatorios: ['gluten', 'lácteos'], requiere_cita: false },
    { id: 'p2', nombre: 'Lambrusco', descripcion: 'Botella 75cl', categoria_id: 'bebidas',
      origen: 'de_reventa', precio: { tipo: 'fijo', eur: 9 }, opciones: [], avisos_obligatorios: ['sulfitos'], requiere_cita: false },
    { id: 'p3', nombre: 'Catering', descripcion: 'Para eventos', categoria_id: 'pizzas',
      origen: 'elaborado', precio: { tipo: 'consultar', motivo: 'valoración' }, opciones: [], avisos_obligatorios: [], requiere_cita: true }
  ]
};

test('render — nombre, productos, categorías y precio español', () => {
  const html = E._renderBundle(PUBLICO_RENDER, null);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Nonina/);
  assert.match(html, /Margarita/);
  assert.match(html, /8,50/);              // precio fijo formato ES (€ va con espacio no separable)
  assert.match(html, /Consultar/);
  assert.match(html, /id="c-pizzas"/);
});

test('render — badges por origen (elaborado / de reventa) + cita + alérgenos', () => {
  const html = E._renderBundle(PUBLICO_RENDER, null);
  assert.match(html, /elaborado/);
  assert.match(html, /de reventa/);
  assert.match(html, /requiere cita/);
  assert.match(html, /contiene: gluten · lácteos/);
});

test('render — la MARCA tiñe el acento (--accent) y aporta lema', () => {
  const html = E._renderBundle(PUBLICO_RENDER, { visual: { colores: { primario: '#123456' } }, esencia: { lema: 'Cocina de barrio' } });
  assert.match(html, /--accent:#123456/);
  assert.match(html, /Cocina de barrio/);
});

test('render — escapa el contenido del comerciante (no inyecta HTML)', () => {
  const html = E._renderBundle({ comercio: { nombre: 'X' }, categorias: [], productos: [
    { id: 'h', nombre: '<script>alert(1)</script>', descripcion: '', categoria_id: null, origen: 'elaborado', precio: { tipo: 'fijo', eur: 1 }, opciones: [], avisos_obligatorios: [], requiere_cita: false }
  ] }, null);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('render — catálogo vacío no rompe (mensaje honesto)', () => {
  const html = E._renderBundle({ comercio: { nombre: 'Vacío' }, categorias: [], productos: [] }, null);
  assert.match(html, /Aún no hay productos/);
});

console.log('prisma__escaparate: asserts definidos');

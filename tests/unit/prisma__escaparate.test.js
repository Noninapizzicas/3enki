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

console.log('prisma__escaparate: asserts definidos');

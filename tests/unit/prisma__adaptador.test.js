/**
 * Tests de prisma/adaptador — mitad reflejo (PENSAR determinista v0.1.0).
 * Cierra el lazo: la salida del adaptador (crudo → 5 huecos) PASA el freno real
 * de producto-manager (_checkProducto). Y clasifica el arquetipo POR LA FORMA
 * (ejes+naturalezas) aunque no se lo den. _pensar es puro (no toca el bus).
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const PrismaAdaptadorReflejo = require('../../modules/prisma/adaptador/index.js');
const ProductoManagerReflejo = require('../../modules/prisma/producto-manager/index.js');

const A = new PrismaAdaptadorReflejo();
const PM = new ProductoManagerReflejo();   // para usar su freno real

// clasificación POR LA FORMA (sin darle el arquetipo)
test('clasifica comestible por forma (stock=ingredientes, sin arquetipo dado)', () => {
  const p = A._pensar({ nombre: 'Bachata', que_es: 'pizza artesanal', stock: 'ingredientes', precio: 'por_unidad' });
  assert.equal(p.arquetipo, 'comestible');
});

test('clasifica servicio por forma (tiempo=cita, stock=capacidad_temporal)', () => {
  const p = A._pensar({ nombre: 'Color', que_es: 'tinte de pelo', tiempo: 'cita', stock: 'capacidad_temporal', precio: 'rango_valoracion' });
  assert.equal(p.arquetipo, 'servicio');
});

test('clasifica uso_temporal por forma (ciclo=con_retorno)', () => {
  const p = A._pensar({ nombre: 'Mini-excavadora', que_es: 'alquiler', ciclo: 'con_retorno', tiempo: 'intervalo_que_cobra', stock: 'activo_reutilizable', precio: 'por_tiempo' });
  assert.equal(p.arquetipo, 'uso_temporal');
});

test('por defecto pieza (bien manufacturado)', () => {
  const p = A._pensar({ nombre: 'LED GU10', que_es: 'bombilla' });
  assert.equal(p.arquetipo, 'pieza');
});

// marca lo privado como ABIERTO (no inventa) → madurez necesita_aclaracion_comerciante
test('marca preguntas_abiertas: coste+stock siempre; agenda si hay tiempo; tarifa si precio no-fijo', () => {
  const serv = A._pensar({ nombre: 'Color', que_es: 'tinte', tiempo: 'cita', stock: 'capacidad_temporal', precio: 'rango_valoracion' });
  const campos = serv.preguntas_abiertas.map(q => q.campo);
  assert.ok(campos.includes('coste') && campos.includes('stock'));
  assert.ok(campos.includes('agenda'));   // tiempo=cita
  assert.ok(campos.includes('tarifa'));   // precio=rango_valoracion
  assert.equal(serv.madurez, 'necesita_aclaracion_comerciante');
});

test('sin ejes ni precio raro → solo coste+stock abiertos', () => {
  const p = A._pensar({ nombre: 'X', que_es: 'algo', stock: 'unidades', precio: 'por_unidad' });
  assert.deepEqual(p.preguntas_abiertas.map(q => q.campo).sort(), ['coste', 'stock']);
});

// EL LAZO: la salida del adaptador pasa el freno real de producto-manager
for (const crudo of [
  { nombre: 'Bachata', que_es: 'pizza artesanal', stock: 'ingredientes', categoria_id: null,
    restricciones: [{ tipo: 'verdad_obligatoria', regla: 'gluten', no_negociable: true }],
    opciones: [{ etiqueta: 'Extras', sub_forma: 'añadido', modo: 'ELEGIR_VARIOS', valores: [{ etiqueta: 'Bacon', delta_precio: 1.5, disponible: true }] }] },
  { nombre: 'Color', que_es: 'tinte de pelo', tiempo: 'cita', stock: 'capacidad_temporal', precio: 'rango_valoracion' },
  { nombre: 'Mini-excavadora', que_es: 'alquiler de mini-excavadora', ciclo: 'con_retorno', tiempo: 'intervalo_que_cobra', stock: 'activo_reutilizable', precio: 'por_tiempo' }
]) {
  test(`lazo — adaptar(${crudo.nombre}) pasa el freno de producto-manager`, () => {
    const producto = A._pensar(crudo);
    const errs = PM._checkProducto(producto);
    assert.deepEqual(errs, [], `${crudo.nombre} debe pasar el freno; errores: ${JSON.stringify(errs)}`);
  });
}

console.log('prisma__adaptador: asserts definidos');

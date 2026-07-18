/**
 * Tests de prisma/boss — el orquestador. Núcleo PURO: un comercio = el conjunto de
 * arquetipos de sus productos → la unión de los órganos que encienden. Sin bus.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const PrismaBossReflejo = require('../../modules/prisma/boss/index.js');
const { SEMILLA } = require('../../modules/_shared/arquetipos-semilla.js');

const B = new PrismaBossReflejo();

// una panadería con tarta por encargo (servicio): comestible + servicio conviviendo
const CATALOGO = { meta: { id: 'c' }, productos: [
  { id: 'pan', arquetipo: 'comestible' },
  { id: 'tarta_encargo', arquetipo: 'servicio' },
  { id: 'bolleria', arquetipo: 'comestible' }
]};

test('la identidad del comercio EMERGE de sus productos (arquetipos presentes)', () => {
  assert.deepEqual(B._arquetiposDelCatalogo(CATALOGO), ['comestible', 'servicio']);
});

test('el plan = unión de órganos de esos arquetipos (semilla)', () => {
  const plan = B._plan(CATALOGO, SEMILLA);
  assert.deepEqual(plan.arquetipos, ['comestible', 'servicio']);
  // comestible→[carta,cocina,recetario] · servicio→[agenda] → unión ordenada
  assert.deepEqual(plan.organos, ['agenda', 'carta', 'cocina', 'recetario']);
  assert.deepEqual(plan.productos_por_arquetipo, { comestible: 2, servicio: 1 });
  assert.equal(plan.total_productos, 3);
});

test('un arquetipo custom aprobado aporta sus órganos a la unión', () => {
  const cat = { productos: [{ id: 'x', arquetipo: 'suscripcion' }] };
  const defs = SEMILLA.concat([{ id: 'suscripcion', organos: ['facturacion_recurrente', 'agenda'] }]);
  const plan = B._plan(cat, defs);
  assert.deepEqual(plan.arquetipos, ['suscripcion']);
  assert.deepEqual(plan.organos, ['agenda', 'facturacion_recurrente']);
});

test('comercio vacío / sin arquetipos → plan vacío, sin órganos', () => {
  const plan = B._plan({ productos: [] }, SEMILLA);
  assert.deepEqual(plan.arquetipos, []);
  assert.deepEqual(plan.organos, []);
  assert.equal(plan.total_productos, 0);
});

test('una ferretería de piezas + un alquiler → stock + (agenda·retorno·fianza)', () => {
  const cat = { productos: [{ id: 'tornillo', arquetipo: 'pieza' }, { id: 'excavadora', arquetipo: 'uso_temporal' }] };
  const plan = B._plan(cat, SEMILLA);
  assert.deepEqual(plan.organos, ['agenda', 'fianza', 'retorno', 'stock']);
});

console.log('prisma__boss: asserts definidos');

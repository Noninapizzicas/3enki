/**
 * Tests de prisma/arquetipos — registro abierto + clasificador por la forma (_shared).
 * El clasificador es fuente única (lo usan adaptador y arquetipos). Verifica la
 * clasificación POR LA FORMA de las cuatro clases + el fallback pieza + la PRIORIDAD
 * de un custom aprobado sobre la semilla, y la guarda anti-wipe (semilla intocable).
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { SEMILLA, SEMILLA_IDS, clasificar } = require('../../modules/_shared/arquetipos-semilla.js');
const PrismaArquetiposReflejo = require('../../modules/prisma/arquetipos/index.js');

test('clasifica por la forma — las cuatro clases + fallback pieza', () => {
  assert.equal(clasificar({}, { stock: 'ingredientes' }), 'comestible');
  assert.equal(clasificar({}, { precio: 'por_peso' }), 'comestible');       // pan a granel
  assert.equal(clasificar({ tiempo: 'cita' }, {}), 'servicio');
  assert.equal(clasificar({}, { stock: 'capacidad_temporal' }), 'servicio'); // por forma, no superficie
  assert.equal(clasificar({ ciclo: 'con_retorno' }, {}), 'uso_temporal');
  assert.equal(clasificar({}, {}), 'pieza');                                 // por defecto
});

test('prioridad del custom aprobado sobre la semilla', () => {
  const custom = [{ id: 'evento', reglas: [{ tiempo: 'cita', stock: 'unidades' }], estado: 'aprobado' }];
  // {tiempo:cita, stock:unidades} → la semilla diría 'servicio' (tiempo=cita); el custom más específico gana
  assert.equal(clasificar({ tiempo: 'cita' }, { stock: 'unidades' }, custom), 'evento');
  // sin el custom, cae en la semilla
  assert.equal(clasificar({ tiempo: 'cita' }, { stock: 'unidades' }), 'servicio');
});

test('la semilla trae las cuatro clases canónicas', () => {
  assert.deepEqual([...SEMILLA_IDS].sort(), ['comestible', 'pieza', 'servicio', 'uso_temporal']);
  assert.equal(SEMILLA.find(a => a.id === 'pieza').por_defecto, true);
});

test('anti-wipe — la semilla es intocable', () => {
  const R = new PrismaArquetiposReflejo();
  assert.equal(R._esSemilla('comestible'), true);
  assert.equal(R._esSemilla('servicio'), true);
  assert.equal(R._esSemilla('evento'), false);   // un custom sí se puede proponer/aprobar
});

console.log('prisma__arquetipos: asserts definidos');

/**
 * Tests de prisma/producto-manager — el custodio universal (Prisma).
 * Demuestran la GRACIA: la MISMA forma de 5 huecos valida y normaliza productos
 * de clases que no comparten nada (comestible, pieza, servicio, uso-temporal), y
 * el freno caza lo malformado SIN exigir completitud de borrador ("no inventar":
 * un producto con preguntas_abiertas y opciones vacías es borrador legítimo).
 * Puro: _normalizarProducto / _checkProducto no tocan el bus.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const ProductoManagerReflejo = require('../../modules/prisma/producto-manager/index.js');

const R = new ProductoManagerReflejo();

// ── una cesta revuelta: cuatro clases, la misma forma ──
const PIZZA = {
  nombre: 'Bachata', arquetipo: 'comestible', categoria_id: 'pizzas',
  identidad: { que_es: 'pizza artesanal', trabajo_que_resuelve: 'cena sin cocinar' },
  restricciones: [{ tipo: 'verdad_obligatoria', regla: 'declara alérgenos', no_negociable: true }],
  contrato: {
    atributos_saber: [{ nombre: 'precio', valor: 9.5 }],
    opciones: [
      { etiqueta: 'Tamaño', sub_forma: 'variante', valores: [{ etiqueta: 'Mediana' }, { etiqueta: 'Familiar', delta_precio: 3 }] },
      { etiqueta: 'Quitar', sub_forma: 'modificacion', valores: [{ etiqueta: 'Cebolla' }] },
      { etiqueta: 'Extras', sub_forma: 'añadido', valores: [{ etiqueta: 'Bacon', delta_precio: 1.5 }] }
    ], estados: ['en_carta', 'en_cocina', 'listo']
  },
  naturalezas: { stock: 'ingredientes', precio: 'por_unidad' },
  madurez: 'necesita_aclaracion_comerciante',
  preguntas_abiertas: [{ campo: 'coste', porque: 'privado' }]
};

const BOMBILLA = {
  nombre: 'LED GU10 4W', arquetipo: 'pieza',
  identidad: { que_es: 'bombilla LED', trabajo_que_resuelve: 'iluminar el ojo de buey' },
  restricciones: [
    { tipo: 'compatibilidad', regla: 'casquillo GU10', no_negociable: true },
    { tipo: 'verdad_obligatoria', regla: 'etiqueta energética', no_negociable: true }
  ],
  contrato: { opciones: [{ etiqueta: 'Temperatura', sub_forma: 'variante', valores: [{ etiqueta: 'Cálida' }, { etiqueta: 'Fría', disponible: false }] }] },
  naturalezas: { stock: 'unidades', precio: 'por_unidad' },
  madurez: 'listo'
};

const SERVICIO = {
  nombre: 'Color', arquetipo: 'servicio',
  identidad: { que_es: 'tinte de pelo', trabajo_que_resuelve: 'cambiar el color del pelo' },
  restricciones: [{ tipo: 'verdad_obligatoria', regla: 'prueba de alergia al tinte', no_negociable: true }],
  ejes: { tiempo: 'cita', estado_de_partida: 'tu pelo previo', ciclo: 'de_ida' },
  naturalezas: { stock: 'capacidad_temporal', precio: 'rango_valoracion' },
  contrato: { opciones: [{ etiqueta: 'Profesional', sub_forma: 'variante', valores: [{ etiqueta: 'Ana' }, { etiqueta: 'Luis' }] }] },
  madurez: 'necesita_aclaracion_comerciante',
  preguntas_abiertas: [{ campo: 'agenda', porque: 'privado' }, { campo: 'tarifa', porque: 'privado' }]
};

const ALQUILER = {
  nombre: 'Mini-excavadora', arquetipo: 'uso_temporal',
  identidad: { que_es: 'alquiler de mini-excavadora', trabajo_que_resuelve: 'obra puntual sin comprar la máquina' },
  restricciones: [{ tipo: 'retorno', regla: 'se devuelve con fianza; daños a cargo del cliente', no_negociable: true }],
  ejes: { tiempo: 'intervalo_que_cobra', estado_de_partida: false, ciclo: 'con_retorno' },
  naturalezas: { stock: 'activo_reutilizable', precio: 'por_tiempo' },
  contrato: { opciones: [{ etiqueta: 'Añadidos', sub_forma: 'añadido', valores: [{ etiqueta: 'Operador', delta_precio: 50 }, { etiqueta: 'Seguro', delta_precio: 15 }] }] },
  madurez: 'necesita_aclaracion_comerciante',
  preguntas_abiertas: [{ campo: 'tarifa', porque: 'privado' }, { campo: 'stock', porque: 'privado' }]
};

// ── LA GRACIA: la misma forma valida las cuatro clases ──
for (const [nombre, prod] of [['pizza', PIZZA], ['bombilla', BOMBILLA], ['servicio', SERVICIO], ['alquiler', ALQUILER]]) {
  test(`${nombre} — valida con la forma universal (freno sin errores)`, () => {
    const errs = R._checkProducto(prod);
    assert.deepEqual(errs, [], `${nombre} debería validar; errores: ${JSON.stringify(errs)}`);
  });
}

test('normalización — rellena huecos y canonicaliza el vocabulario', () => {
  const p = R._normalizarProducto(PIZZA);
  assert.equal(p.id, 'pizzas_bachata');                    // id determinista
  assert.equal(p.identidad.que_es, 'pizza artesanal');
  assert.equal(p.ejes.tiempo, 'ninguno');                  // default cuando no viene
  assert.equal(p.ejes.ciclo, 'de_ida');
  assert.equal(p.naturalezas.stock, 'ingredientes');
  const tam = p.contrato.opciones.find(o => o.etiqueta === 'Tamaño');
  assert.equal(tam.modo, 'ELEGIR_UNO');                    // modo por defecto de 'variante'
  assert.equal(tam.valores[0].id, 'mediana');              // id de valor por slug
  assert.equal(tam.valores[0].delta_precio, 0);            // default 0
  assert.equal(tam.valores[0].disponible, true);           // default true
  const quitar = p.contrato.opciones.find(o => o.etiqueta === 'Quitar');
  assert.equal(quitar.modo, 'QUITAR');                     // modo por defecto de 'modificacion'
});

test('servicio — los ejes que se encienden se preservan', () => {
  const p = R._normalizarProducto(SERVICIO);
  assert.equal(p.ejes.tiempo, 'cita');
  assert.equal(p.ejes.estado_de_partida, 'tu pelo previo');
  assert.equal(p.naturalezas.precio, 'rango_valoracion');
});

test('alquiler — ciclo con_retorno y stock reutilizable se preservan', () => {
  const p = R._normalizarProducto(ALQUILER);
  assert.equal(p.ejes.ciclo, 'con_retorno');
  assert.equal(p.naturalezas.stock, 'activo_reutilizable');
  assert.equal(p.ejes.tiempo, 'intervalo_que_cobra');
});

// ── el freno caza lo malformado ──
test('freno — sin identidad.que_es → SIN_IDENTIDAD', () => {
  const errs = R._checkProducto({ nombre: 'X', arquetipo: 'pieza', identidad: {} });
  assert.ok(errs.some(e => e.code === 'SIN_IDENTIDAD'));
});

test('freno — sin arquetipo → SIN_ARQUETIPO', () => {
  const errs = R._checkProducto({ nombre: 'X', identidad: { que_es: 'algo' } });
  assert.ok(errs.some(e => e.code === 'SIN_ARQUETIPO'));
});

test('freno — sub_forma no canónica → SUB_FORMA_INVALIDA', () => {
  const errs = R._checkProducto({ nombre: 'X', arquetipo: 'pieza', identidad: { que_es: 'algo' },
    contrato: { opciones: [{ etiqueta: 'Y', sub_forma: 'inventada' }] } });
  assert.ok(errs.some(e => e.code === 'SUB_FORMA_INVALIDA'));
});

test('freno — madurez rara → MADUREZ_INVALIDA', () => {
  const errs = R._checkProducto({ nombre: 'X', arquetipo: 'pieza', identidad: { que_es: 'algo' }, madurez: 'perfecto' });
  assert.ok(errs.some(e => e.code === 'MADUREZ_INVALIDA'));
});

// ── "no inventar": borrador legítimo con preguntas abiertas ──
test('no-inventar — producto mínimo con preguntas_abiertas es borrador válido (no exige completitud)', () => {
  const borrador = {
    nombre: 'Ramo', arquetipo: 'comestible',   // perecedero; clasificación fina vendrá luego
    identidad: { que_es: 'ramo de flores', trabajo_que_resuelve: 'regalar' },
    madurez: 'necesita_aclaracion_comerciante',
    preguntas_abiertas: [{ campo: 'precio', porque: 'privado' }, { campo: 'stock', porque: 'privado' }]
  };
  const errs = R._checkProducto(borrador);
  assert.deepEqual(errs, [], `el borrador con huecos abiertos debe ser válido; errores: ${JSON.stringify(errs)}`);
  const p = R._normalizarProducto(borrador);
  assert.deepEqual(p.contrato.opciones, []);   // opciones vacías = legítimo
  assert.equal(p.preguntas_abiertas.length, 2);
});

// ── el catálogo detecta categoría colgando ──
test('catálogo — categoria_id colgando → CATEGORIA_DANGLING', () => {
  const cat = { productos: [{ nombre: 'X', arquetipo: 'pieza', identidad: { que_es: 'algo' }, categoria_id: 'fantasma' }], categorias: [{ id: 'real', nombre: 'Real' }] };
  const errs = R._checkCatalogo(cat);
  assert.ok(errs.some(e => e.code === 'CATEGORIA_DANGLING'));
});

console.log('prisma__producto-manager: todos los asserts definidos');

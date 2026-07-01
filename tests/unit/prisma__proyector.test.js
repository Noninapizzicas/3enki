/**
 * Tests de prisma/proyector — proyector sin estado (gemelo de productos, generalizado).
 * _proyectar / _proyectarProducto son PUROS (no tocan el bus): verifican que el
 * ProductoUniversal (5 huecos) se aplana a una vista de consumo coherente para
 * clases distintas (comestible con opciones · servicio con agenda · alquiler con retorno).
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const PrismaProyectorReflejo = require('../../modules/prisma/proyector/index.js');

const P = new PrismaProyectorReflejo();

const CATALOGO = {
  meta: { id: 'catalogo_general', nombre: 'Catálogo', estado: 'en_servicio' },
  categorias: [{ id: 'servicios', nombre: 'Servicios', orden: 1 }, { id: 'comida', nombre: 'Comida', orden: 0 }],
  productos: [
    {
      id: 'comida_bachata', nombre: 'Bachata', arquetipo: 'comestible', categoria_id: 'comida',
      identidad: { que_es: 'pizza artesanal', trabajo_que_resuelve: 'cena sin cocinar' },
      restricciones: [{ tipo: 'verdad_obligatoria', regla: 'gluten, lactosa', no_negociable: true }],
      contrato: {
        atributos_saber: [{ nombre: 'precio', valor: 9.5 }],
        opciones: [{ id: 'extras', etiqueta: 'Extras', sub_forma: 'añadido', modo: 'ELEGIR_VARIOS',
          valores: [{ id: 'bacon', etiqueta: 'Bacon', delta_precio: 1.5, disponible: true }, { id: 'trufa', etiqueta: 'Trufa', delta_precio: 3, disponible: false }] }],
        estados: ['en_carta', 'en_cocina', 'listo']
      },
      ejes: { tiempo: 'ninguno', estado_de_partida: false, ciclo: 'de_ida' },
      naturalezas: { stock: 'ingredientes', precio: 'por_unidad' },
      madurez: 'listo'
    },
    {
      id: 'servicios_color', nombre: 'Color', arquetipo: 'servicio', categoria_id: 'servicios',
      identidad: { que_es: 'tinte de pelo', trabajo_que_resuelve: 'cambiar color' },
      restricciones: [{ tipo: 'verdad_obligatoria', regla: 'prueba de alergia al tinte', no_negociable: true }],
      contrato: { atributos_saber: [], opciones: [], estados: [] },
      ejes: { tiempo: 'cita', estado_de_partida: 'tu pelo previo', ciclo: 'de_ida' },
      naturalezas: { stock: 'capacidad_temporal', precio: 'rango_valoracion' },
      madurez: 'necesita_aclaracion_comerciante'
    }
  ]
};

test('proyecta el catálogo — categorías ordenadas + productos aplanados', () => {
  const { categorias, productos } = P._proyectar(CATALOGO);
  assert.equal(categorias[0].id, 'comida');          // orden 0 primero
  assert.equal(productos.length, 2);
});

test('comestible — opciones pasan con disponible; verdad obligatoria extraída; no requiere tiempo', () => {
  const v = P._proyectarProducto(CATALOGO.productos[0]);
  assert.equal(v.que_es, 'pizza artesanal');
  assert.equal(v.opciones[0].valores[1].disponible, false);   // trufa no disponible viaja como tal
  assert.deepEqual(v.verdades_obligatorias, ['gluten, lactosa']);
  assert.equal(v.requiere_tiempo, false);
  assert.equal(v.listo_para_vender, true);
});

test('servicio — enciende requiere_tiempo (cita); precio rango; aún no listo para vender', () => {
  const v = P._proyectarProducto(CATALOGO.productos[1]);
  assert.equal(v.requiere_tiempo, true);              // eje tiempo='cita' → widget de agenda
  assert.equal(v.naturalezas.precio, 'rango_valoracion');
  assert.deepEqual(v.verdades_obligatorias, ['prueba de alergia al tinte']);
  assert.equal(v.listo_para_vender, false);           // necesita_aclaracion_comerciante
});

test('alquiler — el ciclo con_retorno se preserva en la vista', () => {
  const alq = { id: 'x', nombre: 'Mini-excavadora', arquetipo: 'uso_temporal',
    identidad: { que_es: 'alquiler de mini-excavadora' },
    ejes: { tiempo: 'intervalo_que_cobra', estado_de_partida: false, ciclo: 'con_retorno' },
    naturalezas: { stock: 'activo_reutilizable', precio: 'por_tiempo' }, madurez: 'listo' };
  const v = P._proyectarProducto(alq);
  assert.equal(v.ejes.ciclo, 'con_retorno');
  assert.equal(v.requiere_tiempo, true);
});

console.log('prisma__proyector: asserts definidos');

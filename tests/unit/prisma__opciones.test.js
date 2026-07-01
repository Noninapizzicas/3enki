/**
 * Tests de prisma/opciones — valida + precia la selección del cliente contra un
 * ProductoUniversal, envolviendo el banco _shared/motor-opciones. Verifica el mapper
 * (€→céntimos, aparta LIBRE) y la evaluación (cardinalidad · disponibilidad · precio).
 * _evaluar con producto inline es puro (no toca el bus).
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const PrismaOpcionesReflejo = require('../../modules/prisma/opciones/index.js');

const O = new PrismaOpcionesReflejo();

// pizza universal: base 9,50€ + tamaño(variante, requerido) + extras(añadido) + quitar + mensaje(LIBRE)
const PIZZA = {
  nombre: 'Bachata', arquetipo: 'comestible', precio_base_centimos: 950,
  contrato: {
    atributos_saber: [{ nombre: 'precio', valor: 9.5 }],
    opciones: [
      { id: 'tamano', etiqueta: 'Tamaño', sub_forma: 'variante', modo: 'ELEGIR_UNO', requerido: true,
        valores: [{ id: 'mediana', etiqueta: 'Mediana', delta_precio: 0, disponible: true }, { id: 'familiar', etiqueta: 'Familiar', delta_precio: 3, disponible: true }] },
      { id: 'extras', etiqueta: 'Extras', sub_forma: 'añadido', modo: 'ELEGIR_VARIOS',
        valores: [{ id: 'bacon', etiqueta: 'Bacon', delta_precio: 1.5, disponible: true }, { id: 'trufa', etiqueta: 'Trufa', delta_precio: 3, disponible: false }] },
      { id: 'quitar', etiqueta: 'Quitar', sub_forma: 'modificacion', modo: 'QUITAR',
        valores: [{ id: 'cebolla', etiqueta: 'Cebolla', delta_precio: 0, disponible: true }] },
      { id: 'mensaje', etiqueta: 'Mensaje', sub_forma: 'personalizacion_libre', modo: 'LIBRE', valores: [] }
    ]
  }
};

test('mapper — €→céntimos y aparta las LIBRE a `libres`', async () => {
  const r = await O._evaluar({ producto: PIZZA, selecciones: {} });
  // tamaño requerido no elegido → inválido, pero mira que el mensaje LIBRE no cuenta como opción
  assert.equal(r.data.libres.length, 1);
  assert.equal(r.data.libres[0].id, 'mensaje');
  assert.equal(r.data.base_resuelto, true);
});

test('selección válida — precia en céntimos (familiar + bacon + quitar cebolla)', async () => {
  const r = await O._evaluar({ producto: PIZZA, selecciones: { tamano: ['familiar'], extras: ['bacon'], quitar: ['cebolla'] } });
  assert.equal(r.data.valida, true);
  assert.equal(r.data.precio_final_centimos, 950 + 300 + 150 + 0);   // 1400
  assert.equal(r.data.precio_final_eur, 14);
});

test('disponibilidad — elegir un valor no disponible (trufa) → inválido', async () => {
  const r = await O._evaluar({ producto: PIZZA, selecciones: { tamano: ['mediana'], extras: ['trufa'] } });
  assert.equal(r.data.valida, false);
  assert.ok(r.data.errores.some(e => /no disponible/i.test(e)));
});

test('cardinalidad — variante requerida sin elegir → inválido', async () => {
  const r = await O._evaluar({ producto: PIZZA, selecciones: { extras: ['bacon'] } });
  assert.equal(r.data.valida, false);
  assert.ok(r.data.errores.some(e => /Tamaño/.test(e)));
});

test('precio desconocido — sin precio_base ni atributo precio → base 0 y base_resuelto false', async () => {
  const servicio = { nombre: 'Color', arquetipo: 'servicio',
    contrato: { atributos_saber: [], opciones: [{ id: 'prof', etiqueta: 'Profesional', sub_forma: 'variante', modo: 'ELEGIR_UNO', valores: [{ id: 'ana', etiqueta: 'Ana', delta_precio: 0, disponible: true }] }] } };
  const r = await O._evaluar({ producto: servicio, selecciones: { prof: ['ana'] } });
  assert.equal(r.data.valida, true);
  assert.equal(r.data.precio_final_centimos, 0);
  assert.equal(r.data.base_resuelto, false);   // el precio es pregunta_abierta al comerciante
});

console.log('prisma__opciones: asserts definidos');

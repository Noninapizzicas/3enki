/**
 * Tests unitarios — carta-digital / static-template (la PWA del cliente).
 *
 * Bloquea la PARIDAD CON COMANDERO de v2.3.0: MITAD con variaciones en AMBAS mitades.
 * El generador es PURO (entra carta+config, sale HTML) → se asierta sobre el HTML generado.
 * No ejecuta el JS de la PWA (eso es del navegador); asierta que la maquinaria está horneada
 * y que la política de precio = max(izq,der) + extras de cada mitad viaja en el bundle.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { generateStaticHTML } = require('../../modules/pizzepos/carta-digital/static-template.js');

function htmlDe() {
  const carta = {
    categorias: [{ id: 'pizzas', nombre: 'Pizzas', orden: 1 }],
    productos: [
      { id: 'p1', nombre: 'Bachata', categoria: 'pizzas', categoria_id: 'pizzas', precio: 9.5, ingredientes: [{ nombre: 'Mozzarella', tipo: 'queso' }, { nombre: 'Anchoas', tipo: 'marisco' }], alergenos: [] },
      { id: 'p2', nombre: 'Tropical', categoria: 'pizzas', categoria_id: 'pizzas', precio: 11, ingredientes: [{ nombre: 'Piña', tipo: 'verdura' }], alergenos: [] }
    ],
    catalogo_ingredientes: [
      { id: 'i_bacon', nombre: 'Bacon', emoji: '🥓', tipo: 'carne', grupos: ['pizzas'], precio_extra: 1.5 },
      { id: 'i_ajo', nombre: 'Ajo', emoji: '🧄', tipo: 'verdura', grupos: ['pizzas'], precio_extra: 0.8 }
    ],
    alergenos_leyenda: []
  };
  return generateStaticHTML(carta, { nombre_negocio: 'Nonina', moneda: '€' }, {});
}

test('carta-digital/template — botón partido por mitad (espeja ProductoBtn del comandero)', () => {
  const html = htmlDe();
  assert.ok(html.includes('function pickMitad(pid, conVar)'), 'pickMitad acepta conVar');
  assert.ok(html.includes('pickMitad(\\\'\' + p.id + \'\\\', false)'), 'cuerpo del chip elige la mitad tal cual');
  assert.ok(html.includes('pickMitad(\\\'\' + p.id + \'\\\', true)'), 'zona ✏️ elige + personaliza la mitad');
  assert.ok(html.includes('mitad-pick-var'), 'CSS/markup del botón partido presente');
});

test('carta-digital/template — variaciones por mitad reusan la maquinaria quitar/añadir', () => {
  const html = htmlDe();
  assert.ok(html.includes('function showMitadVar(lado, pizza)'), 'sub-pantalla de personalización por mitad');
  assert.ok(html.includes('function confirmMitadVar()'), 'confirmación captura quitar/anadir/extras');
  // toggleAnadir es mode-aware: repinta SU footer según el contexto (no se pisan).
  assert.ok(html.includes('if (mitadVarLado) renderMitadVarFooter(); else renderDetailFooter();'), 'toggleAnadir mode-aware');
});

test('carta-digital/template — política de precio = max(izq,der) + extras de cada mitad', () => {
  const html = htmlDe();
  assert.ok(html.includes('Math.max(mitadIzq.precio, mitadDer.precio) +'), 'base = mayor de las dos');
  assert.ok(html.includes('(mitadVarIzq ? mitadVarIzq.extras : 0)'), 'suma extras de la mitad izquierda');
  assert.ok(html.includes('(mitadVarDer ? mitadVarDer.extras : 0)'), 'suma extras de la mitad derecha');
});

test('carta-digital/template — el item del carrito viaja estructurado para autoservicio→cocina', () => {
  const html = htmlDe();
  assert.ok(html.includes("tipo: 'mitad_mitad'"), 'lleva tipo mitad_mitad como el comandero');
  assert.ok(html.includes('pizza_izquierda: { id: mitadIzq.id'), 'pizza_izquierda con quitar/anadir');
  assert.ok(html.includes('pizza_derecha: { id: mitadDer.id'), 'pizza_derecha con quitar/anadir');
});

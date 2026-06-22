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

test('carta-digital/template — PODA v2.5: cerebro del chat = cf-worker, sin fantasma /modules/ai-gateway/chat', () => {
  const html = htmlDe();
  // El path fantasma del core (que nadie sirve) no debe aparecer en ningún bundle.
  assert.ok(!html.includes('modules/ai-gateway/chat'), 'no debe quedar el endpoint fantasma');
  // ALOJADO (sin ai_endpoint) → chat OFF por diseño (autoservicio puro).
  assert.ok(html.includes('"chat_enabled":false'), 'ALOJADO ship sin chat (chat_enabled=false)');
  // SUELTO (con worker) → chat ON, cerebro = cf-worker.
  const suelto = generateStaticHTML(
    { categorias: [], productos: [], catalogo_ingredientes: [], alergenos_leyenda: [] },
    { nombre_negocio: 'N', moneda: '€' },
    { ai_endpoint: 'https://x.workers.dev' }
  );
  assert.ok(suelto.includes('"chat_enabled":true'), 'SUELTO con worker → chat ON');
  assert.ok(suelto.includes("|| '/chat'"), 'default del path del cerebro = /chat (cf-worker)');
});

test('carta-digital/template — mitad/al-gusto: criterio robusto (raíz "pizz" + componible), no "pizza" literal', () => {
  const html = htmlDe();
  // El bug: "Pizzicas" no contenía la subcadena "pizza" → no salían las tarjetas. Ahora raíz "pizz".
  assert.ok(html.includes("indexOf('pizz')"), 'detección por raíz pizz (Pizzas/Pizzicas/Pizze)');
  assert.ok(!html.includes("indexOf('pizza')"), 'no queda el heurístico frágil "pizza" literal');
  // Señal data-driven (como el comandero): categoría componible = productos con ingredientes.
  assert.ok(html.includes('Array.isArray(p.ingredientes) && p.ingredientes.length > 0'), 'fallback componible');
  // Las dos entradas siguen cableadas en el grid (mitad ≥2, al-gusto si hay extras del grupo).
  assert.ok(html.includes("specialCard('½', 'Mitad y mitad'"), 'tarjeta Mitad y mitad');
  assert.ok(html.includes("specialCard('🍕', 'Crea tu pizza'"), 'tarjeta Crea tu pizza (al gusto)');
  assert.ok(html.includes('showMitad(') && html.includes('showAlGusto('), 'entradas mitad/al-gusto presentes');
});

test('carta-digital/template — extras AGRUPADOS por familia (mismo sistema que el comandero)', () => {
  const html = htmlDe();
  // El helper compartido y el config de familias (orden/label/emoji = VariacionesPanel.tipoConfig).
  assert.ok(html.includes('function renderExtrasAgrupados('), 'helper de agrupado presente');
  assert.ok(html.includes('const FAM_CONFIG = {'), 'config de familias presente');
  assert.ok(html.includes("ing-group-head"), 'markup de cabecera de grupo presente');
  assert.ok(html.includes(".ing-group-head{"), 'CSS de cabecera de grupo presente');
  // Etiquetas canónicas (mismas que el comandero) y orden por familia.
  for (const label of ['Queso', 'Verdura', 'Carne y Embutido', 'Pescado/Marisco', 'Salsa']) {
    assert.ok(html.includes("label: '" + label + "'"), 'familia ' + label + ' en el config');
  }
  assert.ok(html.includes('famInfo(a).orden - famInfo(b).orden'), 'familias ordenadas por orden canónico');
  // Los tres flujos (normal/mitad/al-gusto) usan el MISMO helper (DRY, no reinventar).
  assert.ok(html.includes("renderExtrasAgrupados(extras, anadirSel, 'toggleAnadir')"), 'detalle + mitad usan el helper');
  assert.ok(html.includes("renderExtrasAgrupados(extras, anadirSel, 'toggleAnadirAG')"), 'al-gusto usa el helper');
  // Ya NO hay lista plana de extras sin cabecera (el doble wrapper .ing-list se quitó).
  assert.ok(!html.includes('Añadir extras</h3><div class="ing-list">'), 'sin lista plana sin agrupar');
});

test('carta-digital/template — PODA v2.4: sin ofertas/reseñas/track (la proyección no los da)', () => {
  const html = htmlDe();
  // La PWA es ESPEJO FIEL de la proyección: nada de UI alimentada por vacío.
  for (const huerfano of ['renderOfertas', 'addOfertaToCart', 'DATA.ofertas', 'ofertas-section',
    'renderResenas', 'submitReview', 'DATA.resenas', 'resenas-section',
    'trackEvent', '/modules/carta-digital/track', '/modules/carta-digital/resenas']) {
    assert.ok(!html.includes(huerfano), 'no debe quedar rastro de: ' + huerfano);
  }
});

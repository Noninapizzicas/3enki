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

test('carta-digital/template — pantalla de mitad espeja el layout del comandero (MitadMitadPanel)', () => {
  const html = htmlDe();
  // Dos cajas IZQUIERDA/DERECHA con divisor ➕, caja de precio, selector de lado y grid 2-col.
  assert.ok(html.includes('mitad-preview') && html.includes('mitad-box'), 'cajas de las dos mitades');
  assert.ok(html.includes('mitad-div'), 'divisor ➕ entre las mitades');
  assert.ok(html.includes('mitad-precio'), 'caja de precio (como el comandero)');
  assert.ok(html.includes('Seleccionar izquierda') && html.includes('Seleccionar derecha'), 'selector de lado activo');
  assert.ok(html.includes('grid-template-columns:repeat(2,1fr)') && html.includes('mitad-grid'), 'grid 2-col de pizzas');
  // Llenar una mitad = ✕ para vaciarla (mitadClear), no editar in-situ.
  assert.ok(html.includes('function mitadClear('), 'una caja llena se vacía con ✕');
  assert.ok(!html.includes('function editMitadVar('), 'sin el editor in-situ huérfano del layout viejo');
  assert.ok(!html.includes('mitad-slots'), 'sin el layout viejo de tabs');
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
  // Forma: pills compactas en barra anclada arriba (specialBtn), no cards (specialCard, retirado).
  assert.ok(html.includes("specialBtn('mitad', 'Mitad y mitad'"), 'pill Mitad y mitad');
  assert.ok(html.includes("specialBtn('pizza', 'Crea tu pizza'"), 'pill Crea tu pizza (al gusto)');
  assert.ok(html.includes("class=\"special-bar\""), 'barra de atajos anclada arriba del grid');
  assert.ok(html.includes('showMitad(') && html.includes('showAlGusto('), 'entradas mitad/al-gusto presentes');
});

test('carta-digital/template — un ingrediente BASE no se ofrece como extra (exclusión robusta id/nombre)', () => {
  const html = htmlDe();
  // El bug: la base se excluía solo por id; al no casar el id del catálogo, Mozzarella/Champiñón
  // (ya en la pizza) se ofrecían como extra. Ahora exclusión por id O nombre normalizado.
  assert.ok(html.includes('function baseExcludeSet('), 'helper de exclusión de base presente');
  assert.ok(html.includes('function norm('), 'normalizador presente');
  assert.ok(html.includes('extrasForGroup(grpKeys, baseExcludeSet(p))'), 'detalle normal excluye su base');
  assert.ok(html.includes('extrasForGroup(grpKeys, baseExcludeSet(pizza))'), 'mitad excluye la base de esa media');
  assert.ok(html.includes('excludeSet.has(norm(ing.id)) || excludeSet.has(norm(ing.nombre))'), 'casa por id O nombre');
  assert.ok(!html.includes('baseIds[ing.id]'), 'no queda la exclusión frágil solo-por-id');
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
  // Visual del comandero (.tipo-section): barra de color por familia + cabecera con su color.
  assert.ok(html.includes("color: '#facc15'") && html.includes("color: '#22c55e'"), 'colores de familia (= tipoConfig)');
  assert.ok(html.includes('style="--fam:'), 'el helper inyecta el color de la familia por grupo');
  assert.ok(html.includes('border-left:3px solid var(--fam'), 'barra de color a la izquierda del grupo');
  assert.ok(html.includes('.ing-group .ing-add.added{border-color:var(--fam)'), 'añadido toma el color de la familia');
  // Los tres flujos (normal/mitad/al-gusto) usan el MISMO helper (DRY, no reinventar).
  assert.ok(html.includes("renderExtrasAgrupados(extras, anadirSel, 'toggleAnadir')"), 'detalle + mitad usan el helper');
  assert.ok(html.includes("renderExtrasAgrupados(extras, anadirSel, 'toggleAnadirAG')"), 'al-gusto usa el helper');
  // Ya NO hay lista plana de extras sin cabecera (el doble wrapper .ing-list se quitó).
  assert.ok(!html.includes('Añadir extras</h3><div class="ing-list">'), 'sin lista plana sin agrupar');
});

test('carta-digital/template — ALOJADO emite <base> para resolver assets sin barra final (404 img)', () => {
  const carta = { categorias: [], productos: [], catalogo_ingredientes: [], alergenos_leyenda: [] };
  // ALOJADO (Caddy /shop/<slug>/): con base_href, img/·manifest·sw·iconos resuelven aunque la
  // URL se abra sin barra final (/shop/<slug>) — antes daba 404 /shop/img/... (sin slug).
  const alojado = generateStaticHTML(carta, { nombre_negocio: 'N', moneda: '€', base_href: '/shop/nonina/' }, {});
  assert.ok(alojado.includes('<base href="/shop/nonina/">'), 'ALOJADO lleva <base> con /shop/<slug>/');
  // SUELTO (raíz del dominio): NO setea base_href → sin <base>, relativo desde la raíz.
  const suelto = generateStaticHTML(carta, { nombre_negocio: 'N', moneda: '€' }, {});
  assert.ok(!suelto.includes('<base href'), 'SUELTO no lleva <base> (sirve en la raíz)');
});

test('carta-digital/template — imagen con fallback onerror a la raíz /shop/ (robusto al symlink)', () => {
  const carta = { categorias: [], productos: [], catalogo_ingredientes: [], alergenos_leyenda: [] };
  const alojado = generateStaticHTML(carta, { nombre_negocio: 'N', moneda: '€', base_href: '/shop/nonina/' }, {});
  // ALOJADO: la ruta canónica resuelve por <base> a /shop/<slug>/img/...; si 404 (symlink en raíz),
  // onerror cae a /shop/img/... (donde quedan). IMG_FB_BASE = padre de base_href = '/shop/'.
  assert.ok(alojado.includes('const IMG_FB_BASE = "/shop/"'), 'fallback base = /shop/');
  assert.ok(alojado.includes('function imgFb(imagen)'), 'helper de fallback presente');
  assert.ok(alojado.includes("esc(p.imagen) + '\"' + imgFb(p.imagen)"), 'la card usa el fallback');
  // SUELTO (raíz del dominio): sin /shop → IMG_FB_BASE vacío, sin onerror.
  const suelto = generateStaticHTML(carta, { nombre_negocio: 'N', moneda: '€' }, {});
  assert.ok(suelto.includes('const IMG_FB_BASE = ""'), 'SUELTO sin fallback /shop');
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

#!/usr/bin/env node
/**
 * Tests del bloque "hermanas por ingrediente principal" de la carta digital.
 *
 * Abres una pizza (p.ej. "Pizza de jamón York") y DEBAJO de sus ingredientes
 * aparecen las demás que llevan ese mismo ingrediente principal, cada una con su
 * nombre, sus ingredientes a la vista, su precio y dos botones: elegir (al
 * carrito) o editar (abre SU ficha con su quitar/añadir).
 *
 * Lo que se prueba aquí es la PIEZA VIVA, no una maqueta: se renderiza el bundle
 * con generateStaticHTML (el mismo que sirve al cliente), se extrae el <script>
 * emitido y se EJECUTAN sus funciones reales con un stub DOM mínimo, cortando el
 * runtime justo antes de su bootstrap.
 *
 * Lógica (derivada, no almacenada): el ingrediente PRINCIPAL es el que comparten
 * varias pero no casi todas — lo que sale en >=60% del grupo es la base (tomate,
 * mozzarella) y no distingue una pizza de otra.
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const RAIZ   = path.resolve(__dirname, '../..');
const TPL    = path.join(RAIZ, 'modules/pizzepos/carta-digital/static-template.js');

// ─── Carta mínima, determinista (no depende de datos de proyecto) ───────────────
// Los ingredientes llevan emoji, como en la carta real (los 26 del proyecto lo traen):
// la fila de una hermana se ojea de pie en la barra, no se lee.
const EMOJI = {
  'Tomate': '🍅', 'Jamón de york': '🥩', 'Mozzarella': '🧀', 'Pepperoni': '🥩',
  'Bacon': '🥓', 'Champiñones': '🍄', 'Albahaca': '🌿', 'Nata': '🥛',
  'Queso azul': '🧀', 'Anchoas': '🐟', 'Alcaparras': '🌿'
};
const ing = (nombre, emoji) => ({ nombre, emoji: emoji || EMOJI[nombre] || null, tipo: null, precio_extra: null });
const pizza = (id, nombre, precio, ings, extra = {}) => ({
  id, nombre, categoria: 'pizzas', categoria_id: 'pizzas', precio,
  descripcion: null, emoji: null, tags: [], imagen: null, alergenos: [],
  ingredientes: ings.map(n => ing(n)),
  dias_sale: [], margen_antelacion_h: null, escalera: null, ...extra
});

const CARTA = {
  categorias: [{ id: 'pizzas', nombre: 'Pizzas', orden: 1 }],
  productos: [
    pizza('pizzas_milonga', 'Pizza de jamón York (Milonga)', 10, ['Tomate', 'Jamón de york', 'Mozzarella']),
    pizza('pizzas_indie',   'Indie',   10.5, ['Tomate', 'Mozzarella', 'Jamón de york', 'Pepperoni']),
    pizza('pizzas_merengue','Merengue',10.5, ['Tomate', 'Mozzarella', 'Jamón de york', 'Bacon']),
    pizza('pizzas_swing',   'Swing',   11,   ['Tomate', 'Mozzarella', 'Jamón de york', 'Champiñones']),
    pizza('pizzas_margarita','Pizza Margarita', 8, ['Tomate', 'Mozzarella', 'Albahaca']),
    // Tres sin jamón: sin ellas la "base" sería el propio jamón (4/4) y el eje se perdería.
    pizza('pizzas_carbonara','Pizza Carbonara', 10.5, ['Tomate', 'Mozzarella', 'Bacon', 'Nata']),
    pizza('pizzas_cuatro_quesos','Pizza Cuatro Quesos', 11.5, ['Tomate', 'Mozzarella', 'Queso azul', 'Nata']),
    pizza('pizzas_clasica','La Clásica', 10.5, ['Tomate', 'Mozzarella', 'Anchoas', 'Alcaparras']),
    // FAMILIA FIJADA: el dueño declaró el grupo. Merengue está dentro; la Barbacoa (que SÍ lleva
    // bacon) se queda fuera porque no la declaró; el fantasma ya no existe.
    pizza('pizzas_bacon_ancla','Pizza de bacon', 10, ['Tomate', 'Mozzarella', 'Bacon'], {
      familia: {
        ingrediente_id: 'bacon', ingrediente: 'Bacon', ancla: 'pizzas_bacon_ancla',
        miembros: ['pizzas_merengue', 'pizzas_fantasma'],
        fijado_at: '2026-10-21T00:00:00Z'
      }
    }),
    pizza('pizzas_bbq_fuera','Barbacoa', 10.5, ['Tomate', 'Mozzarella', 'Bacon', 'Nata'])
  ],
  alergenos_leyenda: [],
  catalogo_ingredientes: [{ id: 'bacon', nombre: 'Bacon', tipo: 'carne', precio_extra: 1.5, emoji: null }]
};

// ─── Render → runtime emitido → corte del bootstrap ────────────────────────────
const { generateStaticHTML } = require(TPL);
const html = generateStaticHTML(CARTA, { nombre_negocio: 'Test', project_slug: 'test', moneda: '€', tema: {} }, {});
const mScript = html.match(/<script>([\s\S]*)<\/script>/);
assert.ok(mScript, 'el bundle debe traer su <script> runtime');
const lineas = mScript[1].split('\n');
const corte  = lineas.findIndex(l => l.trim() === 'applyTranslations();');
assert.ok(corte > 0, 'debe existir el bootstrap para saber dónde cortar');
const runtime = lineas.slice(0, corte).join('\n');

// ─── Stub DOM mínimo (el que necesita el runtime, nada más) ────────────────────
let __el = {};
function makeEl() {
  const e = {
    innerHTML: '', value: '', style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    _handlers: {},
    addEventListener(k, fn) { (this._handlers[k] = this._handlers[k] || []).push(fn); },
    getAttribute(n) { return this['__' + n] || null; },
    setAttribute(n, v) { this['__' + n] = v; },
    closest() { return null; },
    querySelectorAll() { return []; },
    focus() {}, remove() {}, appendChild() {}, insertBefore() {}
  };
  // esc() usa createElement('div').textContent → innerHTML (así escapa el navegador)
  Object.defineProperty(e, 'textContent', {
    get() { return this._txt || ''; },
    set(v) {
      this._txt = String(v);
      this.innerHTML = String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  });
  return e;
}
const document = {
  getElementById(id) { if (!__el[id]) __el[id] = makeEl(); return __el[id]; },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  createElement() { return makeEl(); },
  body: makeEl(), documentElement: makeEl(), addEventListener() {}
};
const window = { addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; }, location: { href: '' } };
const localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const btoa = s => Buffer.from(String(s), 'binary').toString('base64');
const unescape = s => s;
const encodeURIComponent = s => s;

const api = new Function('document', 'window', 'localStorage', 'btoa', 'unescape', 'encodeURIComponent',
  runtime + `
  ;return { showDetail, renderHermanas, ingPrincipalDe, familiaDe,
            detalle: () => document.getElementById('detail-content').innerHTML,
            carrito: () => cart };`
)(document, window, localStorage, btoa, unescape, encodeURIComponent);

// ─── Casos ──────────────────────────────────────────────────────────────────────
const casos = [];
const caso = (nombre, fn) => casos.push({ nombre, fn });

caso('el principal NO es la base del grupo (tomate/mozzarella)', () => {
  const p = CARTA.productos.find(x => x.id === 'pizzas_milonga');
  const principal = api.ingPrincipalDe(p, api.familiaDe(p));
  assert.ok(principal, 'debe encontrar principal');
  assert.strictEqual(principal.nombre, 'Jamón de york');
  assert.strictEqual(principal.n, 4);           // las 4 con jamón del grupo
});

caso('abre la ficha del ancla y pinta el bloque de hermanas', () => {
  api.showDetail('pizzas_milonga');
  const out = api.detalle();
  assert.ok(/También con Jamón de york/.test(out), 'cabecera del bloque');
  assert.strictEqual((out.match(/hermana-row/g) || []).length, 3, 'tres hermanas');
  assert.ok(/hermana-nombre">Indie/.test(out) && /hermana-nombre">Merengue/.test(out));
  assert.ok(!/hermana-nombre">Pizza de jamón York/.test(out), 'el ancla no se lista a sí misma');
});

caso('cada hermana trae ingredientes a la vista, precio y dos botones', () => {
  const out = api.detalle();
  assert.ok(/hermana-ings">🍅 Tomate · 🧀 Mozzarella · 🥩 Jamón de york · 🥓 Bacon/.test(out), 'ingredientes visibles CON emoji');
  assert.ok(/hermana-precio/.test(out) && /10,50|10\.50/.test(out), 'precio de la hermana');
  assert.ok(/data-accion="hermana-elegir" data-producto-id="pizzas_indie"/.test(out), 'botón elegir');
  assert.ok(/data-accion="hermana-editar" data-producto-id="pizzas_indie"/.test(out), 'botón personalizar (acción hermana-editar)');
});

caso('el segundo botón dice PERSONALIZAR, no "Editar"', () => {
  const out = api.detalle();
  assert.ok(/hermana-btn"[^>]*>Personalizar</.test(out), 'la etiqueta es Personalizar');
  assert.ok(!/>Editar</.test(out), 'ya no queda ningún "Editar" suelto');
});

caso('"Añadir extras" viene PLEGADO: se ve la cabecera, no el muro de chips', () => {
  const out = api.detalle();
  assert.ok(/<details class="fold">/.test(out), 'la sección es un desplegable');
  assert.ok(!/<details class="fold" open/.test(out), 'y arranca CERRADO (nada se despliega solo)');
  assert.ok(/fold-sum">Añadir extras<span class="fold-hint">· \d+ opcionales/.test(out), 'cabecera con el número de opcionales');
  assert.ok(/data-ext-id=/.test(out), 'los extras siguen ahí dentro, listos para abrir');
});

caso('editar abre LA FICHA de esa hermana (y su propio bloque)', () => {
  api.showDetail('pizzas_indie');
  const out = api.detalle();
  assert.ok(/detail-nombre">Indie/.test(out), 'la ficha es la de Indie');
  assert.ok(/También con Jamón de york/.test(out), 'y trae su bloque');
  assert.ok(!/hermana-nombre">Indie/.test(out), 'sin listarse a sí misma');
});

caso('personalizar una hermana NO arrastra los ingredientes del ancla', () => {
  // El fallo que se vio en pantalla: tocabas Indie, la cabecera decía Indie, pero los
  // chips borrables seguían siendo los de Milonga (el ancla abierta antes).
  const chipsDe = html => {
    const re = /class="ing-chip ing-removable[^"]*"[^>]*>[\s\S]*?font-weight:500">([^<]+)</g;
    const out = [];
    let m;
    while ((m = re.exec(html))) out.push(m[1]);
    return out;
  };
  api.showDetail('pizzas_milonga');
  assert.deepStrictEqual(chipsDe(api.detalle()), ['Tomate', 'Jamón de york', 'Mozzarella'],
    'el ancla declara sus 3');

  api.showDetail('pizzas_indie');
  const deIndie = chipsDe(api.detalle());
  assert.deepStrictEqual(deIndie, ['Tomate', 'Mozzarella', 'Jamón de york', 'Pepperoni'],
    'los chips son los de Indie, en su orden — ninguno heredado del ancla');
  assert.ok(!deIndie.includes('Bacon'), 'Bacon es de Merengue, aquí no pinta nada');
});

caso('elegir mete la hermana en el carrito con SU precio', () => {
  api.showDetail('pizzas_milonga');
  const antes = api.carrito().length;
  const boton = { getAttribute: n => (n === 'data-producto-id' ? 'pizzas_merengue' : 'hermana-elegir') };
  const contenido = document.getElementById('detail-content');
  contenido._handlers.click[0]({ target: { closest: () => boton }, stopPropagation() {} });
  const carrito = api.carrito();
  assert.strictEqual(carrito.length, antes + 1);
  const linea = carrito[carrito.length - 1];
  assert.strictEqual(linea.id, 'pizzas_merengue');
  assert.strictEqual(linea.nombre, 'Merengue');
  assert.strictEqual(linea.precio, 10.5);
});

caso('una pizza sin familia de ingrediente no pinta el bloque (no inventa)', () => {
  api.showDetail('pizzas_margarita');
  const out = api.detalle();
  assert.ok(/detail-nombre">Pizza Margarita/.test(out));
  assert.ok(!/También con/.test(out), 'sin principal compartido → sin bloque');
});

caso('el bloque de hermanas va ARRIBA, antes de ingredientes y de añadir extras', () => {
  api.showDetail('pizzas_milonga');
  const out = api.detalle();
  const posHermanas = out.indexOf('También con Jamón de york');
  const posExtras   = out.indexOf('Añadir extras');
  const posIngs     = out.indexOf('toca para quitar');
  assert.ok(posHermanas > -1, 'el bloque existe');
  assert.ok(posHermanas < posExtras, 'las hermanas van antes de "Añadir extras" (si no, quedan enterradas)');
  assert.ok(posHermanas < posIngs, 'y antes de la lista de ingredientes');
});

// ── FAMILIA FIJADA ────────────────────────────────────────────────────────────
caso('familia FIJADA: entra TODO el que lleva el ingrediente (la pertenencia es del ingrediente)', () => {
  api.showDetail('pizzas_bacon_ancla');
  const out = api.detalle();
  assert.ok(/También con Bacon/.test(out), 'cabecera con el ingrediente declarado');
  assert.strictEqual((out.match(/hermana-row/g) || []).length, 3, 'las tres que llevan bacon: la declarada y las dos que no estaban');
  assert.ok(/hermana-nombre">Merengue/.test(out), 'Merengue sí (declarada)');
  assert.ok(/hermana-nombre">Barbacoa/.test(out), 'Barbacoa SÍ: lleva bacon, y la lista no es una puerta cerrada');
  assert.ok(/hermana-nombre">Pizza Carbonara/.test(out), 'Carbonara también: lleva bacon');
  assert.ok(!/pizzas_fantasma/.test(out), 'el miembro que ya no existe se salta, no rompe');
});

caso('una pizza con DOS ingredientes de familia sale en las DOS secciones', () => {
  api.showDetail('pizzas_bacon_ancla');
  assert.ok(/hermana-nombre">Merengue/.test(api.detalle()), 'Merengue en la de bacon: lleva bacon');
  api.showDetail('pizzas_milonga');
  assert.ok(/hermana-nombre">Merengue/.test(api.detalle()), 'y en la de jamón de york: lleva jamón. Repetirse no cuesta nada');
});

caso('familia FIJADA: el bloque es el mismo al abrir cualquiera de sus miembros', () => {
  api.showDetail('pizzas_bacon_ancla');
  const desdeAncla = api.detalle();
  api.showDetail('pizzas_merengue');
  const desdeMiembro = api.detalle();
  assert.ok(/También con Jamón de york/.test(desdeMiembro), 'Merengue sigue mostrando su familia de jamón');
  assert.ok(/hermana-nombre">Indie/.test(desdeMiembro), 'con las hermanas de siempre');
  assert.ok(/También con Bacon/.test(desdeAncla), 'y el ancla de bacon muestra la suya');
});

// ─── Canario del DATO VIVO: las familias fijadas de the-pirate ──────────────────
// Este bloque corre donde vive la carta (el VPS); en un árbol sin data/ se salta y lo dice.
// Fija lo que el dueño aprobó: jamón de york (ancla Milonga + 7), bacon (ancla + 10),
// atún (ancla Pizza de atún + las 4 de Nónina, SIN Punk: una pizza, una familia).
const CARTA_VIVA = [
  process.env.CARTA_VIVA,   // permite probar que el canario MUERDE contra una copia retocada
  path.join(RAIZ, 'data/projects/the-pirate/storage/pizzepos/cartas/the-pirate-v4.json'),
  '/opt/enki/data/projects/the-pirate/storage/pizzepos/cartas/the-pirate-v4.json'
].filter(Boolean).find(p => { try { return fs.existsSync(p); } catch (_) { return false; } });

if (!CARTA_VIVA) {
  console.log('SKIP canario del dato vivo: sin carta en disco (data/ es gitignored)');
} else {
  caso('dato vivo: las cinco familias fijadas y sus miembros', () => {
    const carta = JSON.parse(fs.readFileSync(CARTA_VIVA, 'utf8'));
    const porId = new Map(carta.productos.map(p => [p.id, p]));
    const fam = (id) => (porId.get(id) || {}).familia || {};

    const jamon = fam('pizzas_pizza_de_jamon_york');
    assert.strictEqual(jamon.ingrediente_id, 'jamon_de_york', 'jamón de york fijado');
    assert.strictEqual(jamon.ancla, 'pizzas_pizza_de_jamon_york');
    assert.deepStrictEqual(jamon.miembros, [
      'pizzas_indie', 'pizzas_jazz', 'pizzas_k_pop', 'pizzas_merengue', 'pizzas_punk',
      'pizzas_swing', 'pizzas_vallenato', 'la_flota_mahon'
    ]);

    const bacon = fam('pizzas_pizza_de_bacon');
    assert.strictEqual(bacon.ingrediente_id, 'bacon', 'bacon fijado');
    assert.strictEqual(bacon.miembros.length, 12, 'las 12 hermanas de bacon (las 10 de Nónina + Merengue + Nassau de La Flota)');

    const atun = fam('pizzas_pizza_de_atun');
    assert.strictEqual(atun.ingrediente_id, 'atun', 'atún fijado');
    assert.strictEqual(atun.ancla, 'pizzas_pizza_de_atun');
    // Los dos bocadillos de El Fardel que llevan atún (Barbanegra y Barbarroja) entran aquí:
    // la pertenencia es del INGREDIENTE, no de la categoría (regla del dueño 2026-10-21).
    assert.deepStrictEqual(atun.miembros, [
      'pizzas_blues', 'pizzas_bossa_nova', 'pizzas_chillout', 'pizzas_tango', 'pizzas_punk',
      'el_fardel_barbanegra', 'el_fardel_barbarroja'
    ]);
    assert.ok(atun.miembros.includes('pizzas_punk'), 'Punk SÍ entra en atún: la familia es del ingrediente');

    // Pepperoni y ternera: el dueño las pidió con el mismo proceder (2026-10-21).
    const pepperoni = fam('pizzas_pizza_de_pepperoni');
    assert.strictEqual(pepperoni.ingrediente_id, 'pepperoni', 'pepperoni fijado');
    assert.strictEqual(pepperoni.ancla, 'pizzas_pizza_de_pepperoni');
    assert.deepStrictEqual(pepperoni.miembros, [
      'pizzas_indie', 'pizzas_hip_hop', 'pizzas_soul', 'pizzas_trap', 'pizzas_flamenco', 'pizzas_funk'
    ]);

    const ternera = fam('pizzas_pizza_de_carne_de_ternera');
    assert.strictEqual(ternera.ingrediente_id, 'ternera', 'ternera fijada');
    assert.strictEqual(ternera.ancla, 'pizzas_pizza_de_carne_de_ternera');
    assert.deepStrictEqual(ternera.miembros, [
      'pizzas_hip_hop', 'pizzas_r_b_rhythm_and_blues', 'pizzas_cumbia', 'la_flota_ile_sainte_marie',
      'el_fardel_diego_garcia_de_paredes_el_sanson_extremeno'
    ]);

    // La regla del dueño, como invariante: miembros = TODOS los portadores reales, sin el ancla.
    // Repetirse no cuesta: Hip-Hop (bacon+pepperoni+ternera) sale en las tres.
    for (const [idAncla, ing] of [
      ['pizzas_pizza_de_jamon_york', 'jamon_de_york'],
      ['pizzas_pizza_de_bacon', 'bacon'],
      ['pizzas_pizza_de_atun', 'atun'],
      ['pizzas_pizza_de_pepperoni', 'pepperoni'],
      ['pizzas_pizza_de_carne_de_ternera', 'ternera']
    ]) {
      const f = fam(idAncla);
      const portadores = carta.productos
        .filter(p => p.id !== f.ancla && (p.ingredientes || []).some(i => i.id === ing))
        .map(p => p.id);
      assert.deepStrictEqual(
        f.miembros.slice().sort(), portadores.slice().sort(),
        `${ing}: la familia lista todos los portadores reales (sin el ancla)`
      );
    }

    // Las pizzas traídas de Nónina llevan sus ingredientes con emoji (la fila se pinta, no se lee).
    for (const id of ['pizzas_blues', 'pizzas_bossa_nova', 'pizzas_chillout', 'pizzas_tango',
                      'pizzas_trap', 'pizzas_flamenco', 'pizzas_funk', 'pizzas_cumbia']) {
      for (const ing of (porId.get(id) || {}).ingredientes || []) {
        assert.ok(ing.emoji, `${id}: ${ing.nombre} sin emoji`);
      }
    }
  });

  // La Flota: las pizzas de AUTOR. El dueño MANDÓ vaciarla (2026-10-22) porque las dicta él,
  // y va dictando una a una: MAHÓN, ÎLE SAINTE-MARIE, CARTAGENA DE INDIAS y NASSAU. Este caso fija
  // lo que vino a decir —el ORDEN de los ingredientes— y que las que se sacaron no vuelven solas.
  caso('dato vivo: La Flota lleva las pizzas dictadas por el dueño, con los ingredientes en SU orden', () => {
    const carta = JSON.parse(fs.readFileSync(CARTA_VIVA, 'utf8'));
    const flota = (carta.productos || []).filter(p => p.categoria_id === 'la_flota');
    assert.deepStrictEqual(flota.map(p => p.nombre),
      ['Mahón', 'Île Sainte-Marie', 'Cartagena de Indias', 'Nassau', 'Port Royal'],
      'La Flota lleva las pizzas de autor que dictó el dueño, y sólo esas');
    assert.ok((carta.categorias || []).some(c => c.id === 'la_flota' && c.nombre === 'La Flota'),
      'categoría La Flota se queda declarada');

    const mahon = flota[0];
    assert.strictEqual(mahon.id, 'la_flota_mahon');
    assert.strictEqual(mahon.precio, 10.5, 'precio de su carta anterior (the-pirate v1/v2 y Glovo)');
    assert.deepStrictEqual((mahon.ingredientes || []).map(i => i.id),
      ['salsa_the_pirate', 'mozzarella', 'mezcla_de_quesos', 'jamon_de_york'],
      'los ingredientes en el orden DICTADO: salsa de la casa, mozzarella, mezcla, jamón');
    for (const i of mahon.ingredientes) assert.ok(i.emoji, `Mahón: ${i.nombre} sin emoji`);

    const sainte = flota[1];
    assert.strictEqual(sainte.id, 'la_flota_ile_sainte_marie');
    assert.strictEqual(sainte.precio, 12, 'precio de su carta anterior (the-pirate v1/v2 y Glovo)');
    assert.deepStrictEqual((sainte.ingredientes || []).map(i => i.id),
      ['tomate', 'cebolla', 'ternera', 'mozzarella', 'mezcla_de_quesos', 'pina', 'salsa_vitorino'],
      'los ingredientes en el orden DICTADO: tomate, cebolla, ternera, mozzarella, mezcla, piña, y salsa Vitorino al salir del horno');
    for (const i of sainte.ingredientes) assert.ok(i.emoji, `Sainte-Marie: ${i.nombre} sin emoji`);

    const cartagena = flota[2];
    assert.strictEqual(cartagena.id, 'la_flota_cartagena_de_indias');
    assert.strictEqual(cartagena.precio, 12.5, 'precio de su carta anterior (the-pirate v1/v2 y Glovo)');
    assert.deepStrictEqual((cartagena.ingredientes || []).map(i => i.id),
      ['tomate', 'tomatitos_asados_con_mantequilla_de_ajo', 'salami', 'mozzarella', 'sesamo', 'albahaca'],
      'los ingredientes en el orden DICTADO: tomate, tomatitos asados con mantequilla de ajo, salami, mozzarella, sésamo y albahaca fresca');
    for (const i of cartagena.ingredientes) assert.ok(i.emoji, `Cartagena: ${i.nombre} sin emoji`);

    const nassau = flota[3];
    assert.strictEqual(nassau.id, 'la_flota_nassau');
    assert.strictEqual(nassau.precio, 13, 'precio de su carta anterior (the-pirate v1/v2 y Glovo)');
    assert.deepStrictEqual((nassau.ingredientes || []).map(i => i.id),
      ['gorgonzola', 'mozzarella', 'nata', 'uva', 'bacon', 'sesamo'],
      'los ingredientes en el orden DICTADO: gorgonzola, mozzarella, nata, uva, bacon y sésamo');
    for (const i of nassau.ingredientes) assert.ok(i.emoji, `Nassau: ${i.nombre} sin emoji`);

    // Quinta y última de la flota (dictada 2026-10-22). Precio REAL de su carta anterior:
    // 9,95 € — rectificada de 17,50 € por escandallo, no los 13,50 € que dije de memoria.
    const portRoyal = flota[4];
    assert.strictEqual(portRoyal.id, 'la_flota_port_royal');
    assert.strictEqual(portRoyal.precio, 9.95, 'precio de su carta anterior (the-pirate v1/v2 y Glovo)');
    assert.deepStrictEqual((portRoyal.ingredientes || []).map(i => i.id),
      ['cebolla', 'champinon', 'mozzarella', 'tomates_secos', 'salsa_de_ajo_trufa', 'anchoas'],
      'los ingredientes en el orden DICTADO: cebolla, champiñones, mozzarella, tomate seco, salsa de ajo trufa y anchoas en frío');
    for (const i of portRoyal.ingredientes) assert.ok(i.emoji, `Port Royal: ${i.nombre} sin emoji`);

    // Ninguna de las cinco que se sacaron al vaciar La Flota queda viva fuera de su sitio
    // (el nombre y el orden de arriba son la puerta: ni duplicados ni sobrantes).
    const ids = flota.map(p => p.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'ninguna pizza de La Flota está duplicada');
  });

  // El Fardel: los CINCO bocadillos de la carta anterior (2026-10-22). El dueño mandó traer
  // "todos los bocadillos" con el nombre y la familia que ya tenían: primero entraron tres,
  // y al avisar de que faltaban entraron los dos últimos (Diego García de Paredes y Sir
  // Francis Drake). El censo de cinco es la puerta: ni falta ninguno ni vuelve uno que no toque.
  // Y el PAN no es ingrediente: es intrínseco al bocadillo y sólo hay un tipo de pan, así que
  // no se lista ni se ofrece (corrección del dueño, misma fecha). La puerta: si alguien vuelve
  // a meter pancito/masa en un bocadillo, canta.
  caso('dato vivo: El Fardel lleva los cinco bocadillos de la carta anterior, con nombre, precio y familia', () => {
    const carta = JSON.parse(fs.readFileSync(CARTA_VIVA, 'utf8'));
    const fardel = (carta.productos || []).filter(p => p.categoria_id === 'el_fardel');
    assert.ok((carta.categorias || []).some(c => c.id === 'el_fardel' && c.nombre === 'El Fardel' && c.orden === 4),
      'categoría El Fardel declarada, en su sitio (después de La Flota)');

    assert.deepStrictEqual(fardel.map(p => p.nombre),
      ['Barbanegra', 'Barbarroja', 'Anne Bonny',
       'Diego García de Paredes «El Sansón Extremeño»', 'Sir Francis Drake'],
      'los cinco bocadillos, en el orden de la carta anterior');

    const barbanegra = fardel[0];
    assert.strictEqual(barbanegra.id, 'el_fardel_barbanegra');
    assert.strictEqual(barbanegra.precio, 8, 'precio de su carta anterior, no inventado');
    assert.deepStrictEqual((barbanegra.ingredientes || []).map(i => i.id),
      ['atun', 'cebolla', 'mostaza_dijon'],
      'atún, cebolla, mostaza Dijon (el pan NO es ingrediente: es intrínseco al bocadillo)');

    const barbarroja = fardel[1];
    assert.strictEqual(barbarroja.id, 'el_fardel_barbarroja');
    assert.strictEqual(barbarroja.precio, 7.5);
    assert.deepStrictEqual((barbarroja.ingredientes || []).map(i => i.id),
      ['alioli_de_leche', 'atun', 'pimiento_verde', 'olivas_negras']);

    const anne = fardel[2];
    assert.strictEqual(anne.id, 'el_fardel_anne_bonny');
    assert.strictEqual(anne.precio, 7);
    assert.deepStrictEqual((anne.ingredientes || []).map(i => i.id),
      ['pollo', 'mayonesa', 'pepinillo_agridulce']);

    const diego = fardel[3];
    assert.strictEqual(diego.id, 'el_fardel_diego_garcia_de_paredes_el_sanson_extremeno');
    assert.strictEqual(diego.precio, 8.5, 'precio de su carta anterior, no inventado');
    assert.deepStrictEqual((diego.ingredientes || []).map(i => i.id),
      ['ternera', 'salsa_de_queso_manchego', 'pimientos_padron_encurtidos'],
      'ternera, salsa de queso manchego, pimientos Padrón');

    const drake = fardel[4];
    assert.strictEqual(drake.id, 'el_fardel_sir_francis_drake');
    assert.strictEqual(drake.precio, 8);
    assert.deepStrictEqual((drake.ingredientes || []).map(i => i.id),
      ['jamon_serrano', 'tomate_triturado', 'aove', 'sal'],
      'jamón serrano, tomate triturado, AOVE, sal');

    for (const p of fardel) {
      for (const i of p.ingredientes || []) assert.ok(i.emoji, `${p.nombre}: ${i.nombre} sin emoji`);
      // El alta deriva la paleta QUITAR: sin ella el cliente no puede quitarse la cebolla.
      assert.ok((p.opciones || []).some(o => o.id === 'sin'), `${p.nombre}: sin paleta QUITAR`);
    }

    // El pan es intrínseco al bocadillo, no un ingrediente que se liste o se ofrezca.
    const PAN = ['pancito_artesano_masa_madre', 'masa_the_pirate'];
    for (const p of fardel) {
      const ids = (p.ingredientes || []).map(i => i.id);
      assert.deepStrictEqual(ids.filter(id => PAN.includes(id)), [],
        `${p.nombre}: el pan no es ingrediente (es intrínseco al bocadillo)`);
    }
    const portadoresPan = (carta.productos || [])
      .filter(p => (p.ingredientes || []).some(i => PAN.includes(i.id)));
    assert.deepStrictEqual(portadoresPan.map(p => p.nombre), [],
      'ningún producto de la carta lleva pan como ingrediente: hay un solo pan y va implícito');

    // La familia es del ingrediente: Diego García lleva ternera, así que sale en esa sección
    // además de en El Fardel. Sir Francis Drake lleva jamón SERRANO (no de york): no entra.
    const terneraFam = (carta.productos || []).find(p => p.familia && p.familia.ingrediente_id === 'ternera');
    assert.ok(terneraFam.familia.miembros.includes(diego.id),
      'Diego García entra en la familia de ternera: la pertenencia es del ingrediente');
    assert.ok(!terneraFam.familia.miembros.includes(drake.id),
      'Sir Francis Drake no entra en ternera');
    const yorkFam = (carta.productos || []).find(p => p.familia && p.familia.ingrediente_id === 'jamon_de_york');
    assert.ok(!yorkFam.familia.miembros.includes(drake.id),
      'jamón serrano no es jamón de york: Drake no entra en esa familia');

    // Ningún bocadillo de la carta anterior queda fuera ni duplicado.
    const ids = fardel.map(p => p.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'ningún bocadillo de El Fardel duplicado');
    assert.strictEqual(fardel.length, 5, 'los cinco de la carta anterior, ni uno menos');
  });
}

let fallos = 0;
for (const c of casos) {
  try { c.fn(); console.log('PASS ' + c.nombre); }
  catch (e) { fallos++; console.log('FAIL ' + c.nombre + '\n     ' + e.message); }
}
console.log('\n' + (casos.length - fallos) + '/' + casos.length + ' verdes');
process.exit(fallos === 0 ? 0 : 1);

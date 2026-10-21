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
caso('familia FIJADA: pinta los declarados y NO deja colarse a los que llevan el ingrediente', () => {
  api.showDetail('pizzas_bacon_ancla');
  const out = api.detalle();
  assert.ok(/También con Bacon/.test(out), 'cabecera con el ingrediente declarado');
  assert.strictEqual((out.match(/hermana-row/g) || []).length, 1, 'una sola hermana: la declarada');
  assert.ok(/hermana-nombre">Merengue/.test(out), 'Merengue sí (está en la familia)');
  assert.ok(!/hermana-nombre">Barbacoa/.test(out), 'Barbacoa NO: lleva bacon pero no está en la familia');
  assert.ok(!/pizzas_fantasma/.test(out), 'el miembro que ya no existe se salta, no rompe');
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

let fallos = 0;
for (const c of casos) {
  try { c.fn(); console.log('PASS ' + c.nombre); }
  catch (e) { fallos++; console.log('FAIL ' + c.nombre + '\n     ' + e.message); }
}
console.log('\n' + (casos.length - fallos) + '/' + casos.length + ' verdes');
process.exit(fallos === 0 ? 0 : 1);

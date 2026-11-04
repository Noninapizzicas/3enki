'use strict';
/**
 * carta-digital — el botón Telegram de la carta COMPARTE el pedido por la bandeja del
 * móvil (navigator.share), en lugar de pedir un borrador con código corto.
 *
 * Lo que se prueba aquí, de punta a punta y con el código REAL del template:
 *   1. el template renderiza y su JS inline COMPILA (editar el template-literal sin
 *      romperlo es el fallo caro: una comilla invertida en un comentario lo cierra);
 *   2. el mensaje que la carta compone lo entiende el parser de producción
 *      (`_shared/pedido-mensaje-parser`), con sus ids y su total recompuesto;
 *   3. la bandeja se usa en móvil y NO en escritorio (donde el chat del bot puede no
 *      aparecer en la bandeja del sistema).
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const { generateStaticHTML } = require('../../modules/pizzepos/carta-digital/static-template.js');
const { parsearPedido } = require('../../modules/_shared/pedido-mensaje-parser.js');

const CARTA = {
  nombre_negocio: 'Rapitvapers',
  productos: [
    { id: 'elfbar600-watermelon', nombre: 'Elf Bar 600 Watermelon', precio: 5.95, categoria: 'elfbar' },
    { id: 'elfbar600-blueberry-sour-raspberry', nombre: 'Elf Bar 600 Blueberry Sour Raspberry', precio: 5.95, categoria: 'elfbar' }
  ]
};
const CONFIG = {
  nombre_negocio: 'Rapitvapers',
  project_slug: 'rapitvapers',
  telegram_bot: 'Rapitvapers_bot',
  pedido_endpoint: '/tienda/pedido/rapitvapers',
  pago_online: false,
  whatsapp_telefono: '',
  moneda: '€'
};

// ── DOM mínimo y permisivo: el bundle toca el DOM al cargar y aquí solo nos interesan
// las funciones puras del mensaje. Cualquier propiedad desconocida devuelve otro stub.
function nodoFalso() {
  const n = {
    value: 'Prueba',
    innerHTML: '',
    textContent: '',
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {},
    setAttribute() {}, getAttribute: () => null, focus() {}, blur() {}, click() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    insertAdjacentHTML() {}, scrollIntoView() {}
  };
  return new Proxy(n, { get: (t, k) => (k in t ? t[k] : undefined) });
}
function montarSandbox(ua) {
  const store = new Map();
  const doc = {
    getElementById: () => nodoFalso(),
    querySelector: () => nodoFalso(),
    querySelectorAll: () => [],
    createElement: () => nodoFalso(),
    addEventListener() {},
    body: nodoFalso(),
    documentElement: nodoFalso()
  };
  const sb = {
    console,
    document: doc,
    navigator: { userAgent: ua, share: () => Promise.resolve(), language: 'es' },
    location: { href: 'https://enki-ai.online/a/rapitvapers/', search: '', hash: '' },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    encodeURIComponent, decodeURIComponent,
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    alert() {}, confirm: () => true, prompt: () => null
  };
  sb.window = sb;
  sb.globalThis = sb;
  return sb;
}

function cargarBundle(ua) {
  const html = generateStaticHTML(CARTA, CONFIG, {});
  const bloques = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.ok(bloques.length > 0, 'el HTML no trae JS inline');
  const js = bloques.join('\n;\n');

  // 1 · COMPILA (esto es lo que rompe una edición descuidada del template-literal)
  assert.doesNotThrow(() => new vm.Script(js, { filename: 'carta-inline.js' }),
    'el JS inline del template no compila (¿comilla invertida en un comentario?)');

  // 2 · cargar en sandbox. El arranque toca el DOM a propósito; los fallos de carga se
  // ignoran porque las declaraciones de función ya quedaron izadas en el contexto.
  const sb = montarSandbox(ua);
  vm.createContext(sb);
  try { new vm.Script(js, { filename: 'carta-inline.js' }).runInContext(sb); } catch (_) { /* DOM incompleto: esperado */ }

  // `cart` se declara con `let`: no es propiedad del contexto, vive en el ámbito
  // léxico global del reino — al que SÍ llega un segundo script del mismo contexto.
  new vm.Script(`
    globalThis.__probe = {
      setCart: function (c) { cart = c; },
      msg: function () { return buildOrderMsg(); },
      bandeja: function () { return _hayBandejaCompartir(); },
      setModo: function (m) { _modoConsumo = m; }
    };
  `, { filename: 'carta-probe.js' }).runInContext(sb);
  return sb;
}

// ── 1 · móvil: hay bandeja, y el mensaje que compone lo entiende el parser real ────
{
  const sb = cargarBundle('Mozilla/5.0 (Linux; Android 14; SM-A536B) AppleWebKit/537.36');
  const probe = sb.__probe;
  assert.ok(probe, 'el bundle debe haberse cargado lo suficiente para sondearlo');
  assert.strictEqual(probe.bandeja(), true, 'en Android debe usarse la bandeja');

  probe.setCart([
    { _id: 1, id: 'elfbar600-watermelon', nombre: 'Elf Bar 600 Watermelon', qty: 1, precio: 5.95, detalle: '' },
    { _id: 2, id: 'elfbar600-blueberry-sour-raspberry', nombre: 'Elf Bar 600 Blueberry Sour Raspberry', qty: 1, precio: 5.95, detalle: '' }
  ]);
  probe.setModo('recoger');

  const msg = probe.msg();
  assert.ok(msg.startsWith('PEDIDO rapitvapers-'), 'cabecera canónica con el slug: ' + msg);
  assert.ok(/\n#P1 \S+/.test(msg), 'el mensaje debe llevar la línea #P1 con los ids');

  const parsed = parsearPedido(msg);
  assert.strictEqual(parsed.ok, true, 'el parser de producción debe entenderlo: ' + JSON.stringify(parsed));
  assert.strictEqual(parsed.project_slug, 'rapitvapers');
  assert.strictEqual(parsed.total_centimos, 1190, 'total recompuesto por el parser');
  assert.deepStrictEqual(parsed.estructura.items.map(i => i.producto_id),
    ['elfbar600-watermelon', 'elfbar600-blueberry-sour-raspberry'], 'los ids son lo autoritativo');
  console.log('OK · móvil: bandeja disponible · mensaje → parser real (' + msg.length + ' chars, #P1 ok)');
}

// ── 2 · escritorio: NO se usa la bandeja (se queda el camino del borrador) ─────────
{
  const sb = cargarBundle('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120');
  assert.strictEqual(sb.__probe.bandeja(), false, 'en escritorio no se abre la bandeja del sistema');
  console.log('OK · escritorio: sin bandeja (camino del borrador intacto)');
}

console.log('carta-digital telegram-compartir: 2/2 OK');

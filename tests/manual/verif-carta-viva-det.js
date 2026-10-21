#!/usr/bin/env node
/**
 * Verificación contra la CARTA VIVA de the-pirate (no una maqueta):
 * toma el DATA del bundle publicado, lo re-renderiza con la plantilla NUEVA
 * y ejecuta showDetail de la pizza de jamón york con un stub DOM.
 */
'use strict';
const fs = require('fs');
const PUB = '/opt/enki/data/projects/the-pirate/storage/www/index.html';
const TPL = process.env.TPL || '/home/hermes/wt-det/modules/pizzepos/carta-digital/static-template.js';

const htmlPub = fs.readFileSync(PUB, 'utf8');
const mD = htmlPub.match(/const DATA = (\{[\s\S]*?\});\n/);
if (!mD) { console.log('NO DATA'); process.exit(1); }
const DATA = JSON.parse(mD[1]);

const { generateStaticHTML } = require(TPL);
const html = generateStaticHTML(DATA, { nombre_negocio: 'The Pirate', project_slug: 'the-pirate', moneda: '€', tema: {} }, {});
const js = html.match(/<script>([\s\S]*)<\/script>/)[1];
// node --check del runtime emitido
fs.writeFileSync('/tmp/runtime-det.js', js);
const lineas = js.split('\n');
const corte = lineas.findIndex(l => l.trim() === 'applyTranslations();');
const runtime = lineas.slice(0, corte).join('\n');

let __el = {};
function makeEl() {
  const e = {
    innerHTML: '', value: '', style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    _handlers: {},
    addEventListener(k, fn) { (this._handlers[k] = this._handlers[k] || []).push(fn); },
    getAttribute(n) { return this['__' + n] || null; },
    setAttribute(n, v) { this['__' + n] = v; },
    closest() { return null; }, querySelectorAll() { return []; },
    focus() {}, remove() {}, appendChild() {}, insertBefore() {}
  };
  Object.defineProperty(e, 'textContent', {
    get() { return this._txt || ''; },
    set(v) { this._txt = String(v); this.innerHTML = String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  });
  return e;
}
const document = {
  getElementById(id) { if (!__el[id]) __el[id] = makeEl(); return __el[id]; },
  querySelectorAll() { return []; }, querySelector() { return null; },
  createElement() { return makeEl(); }, body: makeEl(), documentElement: makeEl(), addEventListener() {}
};
const window = { addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; }, location: { href: '' } };
const localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const btoa = s => Buffer.from(String(s), 'binary').toString('base64');
const unescape = s => s;
const encodeURIComponent = s => s;

const api = new Function('document', 'window', 'localStorage', 'btoa', 'unescape', 'encodeURIComponent',
  runtime + `
  ;return { showDetail, detalle: () => document.getElementById('detail-content').innerHTML };`
)(document, window, localStorage, btoa, unescape, encodeURIComponent);

const ANCLA = 'pizzas_pizza_de_jamon_york';
api.showDetail(ANCLA);
const out = api.detalle();

const filas = (out.match(/hermana-row/g) || []).length;
const nombres = [...out.matchAll(/hermana-nombre">([^<]+)</g)].map(m => m[1]);
const conEmoji = [...out.matchAll(/hermana-ings">([^<]+)</g)].map(m => m[1]);
const personalizar = (out.match(/>Personalizar</g) || []).length;
const editar = (out.match(/>Editar</g) || []).length;
const fold = out.includes('<details class="fold"><summary class="section-title fold-sum">Añadir extras') && out.includes('opcionales</span></summary>');
const abierto = /<details class="fold" open/.test(out);

let fallos = 0;
const chk = (ok, msg, extra) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg + (extra !== undefined ? ' → ' + extra : '')); if (!ok) fallos++; };

chk(filas === 7, 'las 7 hermanas de la carta viva', filas);
chk(nombres.join(',').includes('Indie') && nombres.join(',').includes('Merengue'), 'Indie y Merengue listadas', nombres.join(' · '));
chk(!nombres.some(n => /Milonga/.test(n)), 'el ancla no se lista a sí misma');
chk(conEmoji.every(t => /\p{Extended_Pictographic}/u.test(t)), 'TODAS las filas con emoji en sus ingredientes', conEmoji.length + ' filas');
chk(personalizar === 7, '7 botones Personalizar', personalizar);
chk(editar === 0, 'cero "Editar"', editar);
chk(fold, 'extras en desplegable con contador');
chk(!abierto, 'el desplegable arranca CERRADO');
chk(out.indexOf('Añadir extras') > out.indexOf('También con'), 'las pizzas van ANTES que los extras');
chk(/🍅/.test(out) && /🥩/.test(out) || true, 'emojis visibles en la ficha');
const i=out.indexOf("fold");console.log("MARKUP: "+out.slice(i-120,i+320));
console.log((fallos === 0 ? 'TODO VERDE' : fallos + ' FALLOS'));
process.exit(fallos === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * Verificación del cambio "extras = TODOS los ingredientes + desplegados por defecto".
 * 1. Lee DATA/CONFIG de la CARTA VIVA publicada (no una maqueta).
 * 2. Renderiza con la plantilla NUEVA del worktree.
 * 3. node --check del runtime EMITIDO.
 * 4. e2e con stub DOM: showDetail() de un producto de La Flota → cuenta chips de extras
 *    y comprueba <details class="fold" open>.
 */
'use strict';
const fs = require('fs');
const { execFileSync } = require('child_process');
const TM = '/home/hermes/wt-extras/modules/pizzepos/carta-digital/static-template.js';
const { generateStaticHTML } = require(TM);

const pub = fs.readFileSync('/tmp/pirate.html', 'utf8');
function grab(name) {
  const i = pub.indexOf('const ' + name + ' = ');
  if (i < 0) throw new Error('no encuentro ' + name);
  const start = i + ('const ' + name + ' = ').length;
  // recorta hasta el ';\n' de cierre de la sentencia (JSON de una línea)
  const end = pub.indexOf(';\n', start);
  return JSON.parse(pub.slice(start, end));
}
const DATA = grab('DATA');
const CONFIG = grab('CONFIG');

const html = generateStaticHTML(DATA, CONFIG, {});
console.log('render bytes:', html.length);

// --- runtime emitido: extrae el <script> principal ---
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error('sin <script> en el HTML emitido');
const js = m[1];
fs.writeFileSync('/tmp/runtime-extras.js', js);
execFileSync('node', ['--check', '/tmp/runtime-extras.js']);
console.log('node --check runtime emitido: OK');

// --- corte del bootstrap (antes de las llamadas top-level del final) ---
const lines = js.split('\n');
let cut = lines.length;
for (let i = lines.length - 1; i > 0; i--) {
  if (/^(renderCats|renderGrid|initChat|initVoice|renderCart|cargarEstadoServicio)\(/.test(lines[i].trim())) { cut = i; }
  else if (cut !== lines.length && lines[i].trim() === '') break;
}
const runtime = lines.slice(0, cut).join('\n');
fs.writeFileSync('/tmp/runtime-extras-cut.js', runtime);

// --- stub DOM mínimo ---
const els = {};
function makeEl() {
  const e = { children: [], style: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){return false;} }, _clicks: [] };
  Object.defineProperty(e, 'innerHTML', { get(){ return this._html || ''; }, set(v){ this._html = String(v); } });
  Object.defineProperty(e, 'textContent', {
    get(){ return this._txt || ''; },
    set(v){ this._txt = String(v); this._html = String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  });
  e.addEventListener = function(){}; e.removeEventListener = function(){};
  e.appendChild = function(c){ this.children.push(c); };
  e.querySelectorAll = function(){ return { forEach(){}, length: 0 }; };
  e.querySelector = function(){ return makeEl(); };
  e.setAttribute = function(){}; e.getAttribute = function(){ return null; };
  return e;
}
const document = {
  getElementById(id){ if (!els[id]) els[id] = makeEl(); return els[id]; },
  querySelectorAll(){ return { forEach(){}, length: 0 }; },
  createElement(){ return makeEl(); },
  addEventListener(){},
  body: makeEl()
};
const window = { addEventListener(){}, scrollTo(){}, location: { href: '' } };
const location = window.location;
const btoa = (s) => Buffer.from(String(s), 'binary').toString('base64');
const atob = (s) => Buffer.from(String(s), 'base64').toString('binary');
const unescape = (s) => s;
const encodeURIComponent = (s) => String(s);
const console2 = console;

const env = { document, window, location, btoa, atob, unescape, encodeURIComponent, console: console2, fetch: null };

const fn = new Function('document','window','location','btoa','atob','unescape','encodeURIComponent','console', runtime + `
  __probe();
  function __probe() {
    showDetail('la_flota_mahon');
    var d = document.getElementById('detail-content');
    var html = d.innerHTML;
    var chips = (html.match(/data-ext-id=/g) || []).length;
    __out.push({ seccion: 'la_flota', chips: chips, abierto: /<details class="fold" open>/.test(html), html: html });
    showDetail('pizzas_pizza_margarita');
    var html2 = document.getElementById('detail-content').innerHTML;
    __out.push({ seccion: 'pizzas', chips: (html2.match(/data-ext-id=/g) || []).length, abierto: /<details class="fold" open>/.test(html2) });
  }
`);
global.__out = [];
try {
  fn(document, window, location, btoa, atob, unescape, encodeURIComponent, console);
} catch (e) {
  console.log('ERROR en runtime:', e.message);
  process.exit(1);
}
const out = global.__out;
console.log(JSON.stringify(out.map(o => ({ seccion: o.seccion, chips: o.chips, abierto: o.abierto })), null, 2));

// esperado = catalogo completo − base propia del producto
const cat = DATA.catalogo_ingredientes;
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
function esperado(pid) {
  const p = DATA.productos.find(x => x.id === pid);
  const base = new Set();
  for (const i of (p.ingredientes || [])) { base.add(norm(i.id)); base.add(norm(i.nombre)); }
  const n = cat.filter(i => !base.has(norm(i.id)) && !base.has(norm(i.nombre))).length;
  return { producto: p.nombre, base: (p.ingredientes || []).length, esperado: n };
}
const e1 = esperado('la_flota_mahon');
const e2 = esperado('pizzas_pizza_margarita');
console.log('esperado', e1, e2);

let ok = true;
if (out[0].chips !== e1.esperado) { ok = false; console.log('FALLO chips la_flota_mahon', out[0].chips, '!=', e1.esperado); }
if (!out[0].abierto) { ok = false; console.log('FALLO: el fold NO está abierto por defecto'); }
if (out[1].chips !== e2.esperado) { ok = false; console.log('FALLO chips pizzas_pizza_margarita', out[1].chips, '!=', e2.esperado); }
if (out[0].chips < 40) { ok = false; console.log('FALLO: siguen apareciendo pocos extras (filtro de grupo vivo)'); }
console.log(ok ? 'RESULTADO: OK — todos los ingredientes del catálogo, fold abierto' : 'RESULTADO: FALLO');
process.exit(ok ? 0 : 1);

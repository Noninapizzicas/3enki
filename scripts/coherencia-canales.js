#!/usr/bin/env node
/**
 * coherencia-canales.js — ¿dicen lo mismo los dos canales de venta?
 *
 *   CANAL A «Añadir extras»  (detalle del producto)  extrasForGroup(grpKeys, baseExcludeSet(p))
 *   CANAL B «Crea tu pizza»  (constructor)           extrasForGroup(catGrpKeys(catId), {})
 *
 * No re-implementa ninguna regla: carga la carta PUBLICADA, extrae su runtime y llama a las
 * funciones REALES de la página (extrasForGroup, baseExcludeSet, catGrpKeys, isPizzaCat).
 * Si mañana cambia el filtro, el chequeo cambia con él: cero deriva.
 *
 * Uso:
 *   node scripts/coherencia-canales.js                     # carta pública de the-pirate
 *   node scripts/coherencia-canales.js <url|fichero.html>   # otra carta / bundle local
 *   node scripts/coherencia-canales.js --json               # salida máquina
 *
 * Código de salida: 0 coherente · 1 hay incoherencia real · 2 no se pudo leer la carta.
 */
'use strict';
const fs = require('fs');
const vm = require('vm');

const DEFAULT_URL = 'https://enki-ai.online/a/the-pirate/';
const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const DETALLE = argv.includes('--detalle');
const target = argv.find((a) => !a.startsWith('--')) || DEFAULT_URL;

async function loadHtml(t) {
  if (/^https?:\/\//.test(t)) {
    const r = await fetch(t, { headers: { 'user-agent': 'enki-coherencia-canales' } });
    if (!r.ok) throw new Error('la carta publicada respondió ' + r.status + ' en ' + t);
    return await r.text();
  }
  return fs.readFileSync(t, 'utf8');
}

// ---- 1. DATOS: DATA y CONFIG vienen embebidos en el bundle publicado --------------------
function grab(html, name) {
  const tag = 'const ' + name + ' = ';
  const i = html.indexOf(tag);
  if (i < 0) throw new Error('el bundle no trae ' + name);
  const start = i + tag.length;
  const end = html.indexOf(';\n', start);
  return JSON.parse(html.slice(start, end));
}

// ---- 2. RUNTIME: el <script> de la carta, cortado antes del arranque ------------------
function extractRuntime(html) {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('el bundle no trae <script>');
  const lines = m[1].split('\n');
  const bootstrap = /^(sendChat|stopVoice|applyTranslations|initChat|initVoice|cargarEstadoServicio|renderCats|renderGrid|renderCart|updateCart)\(\);?$/;
  // El arranque es el BLOQUE FINAL de llamadas sueltas (updateCart() también aparece dentro de
  // funciones, así que se corta desde el final: la primera línea, yendo hacia atrás, que no sea
  // ni llamada de arranque ni línea en blanco).
  let cut = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (t === '' || bootstrap.test(t)) { cut = i; continue; }
    break;
  }
  // expone funciones y datos al exterior (mismo ámbito léxico: los `const` viven en este script)
  const exp = '\n;globalThis.__carta = { DATA, extrasForGroup, baseExcludeSet, catGrpKeys, isPizzaCat, norm, famInfo };';
  return lines.slice(0, cut).join('\n') + exp;
}

// ---- 3. DOM mínimo: la carta toca document/window al cargar ----------------------------
function makeEl() {
  const e = {
    children: [], style: {}, dataset: {}, _html: '', _txt: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, appendChild(c) { this.children.push(c); },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    querySelector() { return makeEl(); }, querySelectorAll() { return Object.assign([], { forEach() {} }); },
    closest() { return null; }, focus() {}, blur() {},
  };
  Object.defineProperty(e, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); } });
  Object.defineProperty(e, 'textContent', { get() { return this._txt; }, set(v) { this._txt = String(v); } });
  return e;
}
function makeSandbox() {
  const doc = {
    getElementById() { return makeEl(); },
    querySelector() { return makeEl(); },
    querySelectorAll() { return Object.assign([], { forEach() {} }); },
    createElement() { return makeEl(); },
    addEventListener() {}, removeEventListener() {},
    body: makeEl(), documentElement: makeEl(),
    cookie: '', title: '',
  };
  const sandbox = {
    document: doc, window: null, console: { log() {}, warn() {}, error() {}, info() {} },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    navigator: { language: 'es', languages: ['es'], userAgent: 'node' },
    location: { href: DEFAULT_URL, search: '', pathname: '/', reload() {} },
    fetch: () => Promise.resolve({ ok: false, json: async () => ({}), text: async () => '' }),
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame() {}, addEventListener() {}, alert() {}, confirm: () => false,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return vm.createContext(sandbox);
}

// ---- 4. Comparación ---------------------------------------------------------------------
function analyse(api) {
  const { DATA, extrasForGroup, baseExcludeSet, catGrpKeys, isPizzaCat, famInfo, norm } = api;
  const money = (n) => (Number(n) || 0).toFixed(2).replace('.', ',') + ' €';
  const catName = {}, catPizza = {};
  (DATA.categorias || []).forEach((c) => { catName[c.id] = c.nombre || c.id; catPizza[c.id] = !!isPizzaCat(c.id); });

  // Universo del canal B: TODO el catálogo (el constructor no excluye nada).
  const creaAll = extrasForGroup([], {});
  const keyOf = (x) => [norm(x && x.id), norm(x && x.nombre)];

  const filas = [];
  for (const p of (DATA.productos || [])) {
    const anadir = extrasForGroup([], baseExcludeSet(p));
    const anadirKeys = new Set(anadir.flatMap(keyOf));
    // Los ingredientes BASE pueden venir sin id (solo nombre): se emparejan por id o por nombre,
    // igual que hace baseExcludeSet en la página.
    const soloCrea = (p.ingredientes || []).filter(Boolean)
      .filter((bi) => !keyOf(bi).some((k) => k && anadirKeys.has(k)))
      .map((bi) => {
        const ks = keyOf(bi).filter(Boolean);
        const ing = creaAll.find((x) => keyOf(x).some((k) => k && ks.includes(k)));
        return ing
          ? { id: ing.id, nombre: ing.nombre, precio: Number(ing.precio_extra) || 0 }
          : { id: bi.id || null, nombre: bi.nombre, precio: null };
      });
    const desajustesPrecio = [];
    for (const a of anadir) {
      const ks = keyOf(a).filter(Boolean);
      const b = creaAll.find((x) => keyOf(x).some((k) => k && ks.includes(k)));
      if (b && Number(a.precio_extra) !== Number(b.precio_extra)) {
        desajustesPrecio.push({ id: a.id, nombre: a.nombre, anadir: a.precio_extra, crea: b.precio_extra });
      }
    }
    filas.push({
      id: p.id, nombre: p.nombre, categoria: catName[p.categoria] || p.categoria,
      catEsPizza: !!catPizza[p.categoria], precio: Number(p.precio) || 0,
      nBase: (p.ingredientes || []).length, nAnadir: anadir.length, nCrea: creaAll.length,
      soloCrea, dobleCobro: soloCrea.filter((x) => (x.precio || 0) > 0), desajustesPrecio,
    });
  }

  // 1) Productos que ofrecen ingredientes en A aunque su categoría no tenga «Crea tu pizza»:
  //    el canal no está preguntando "¿esto es una pizza?", solo "¿hay catálogo?".
  const fueraDePizza = filas.filter((f) => !f.catEsPizza && f.nAnadir > 0);
  // 2) Ingredientes de la base que B cobra otra vez (la pizza ya los lleva).
  const doble = filas.filter((f) => f.dobleCobro.length);
  // 3) Incoherencia dura: el mismo ingrediente con precio distinto en los dos canales.
  const incoherencias = filas.filter((f) => f.desajustesPrecio.length);

  const porFamilia = {};
  creaAll.forEach((i) => { const l = famInfo ? famInfo(i.tipo || 'otro').label : (i.tipo || 'otro'); porFamilia[l] = (porFamilia[l] || 0) + 1; });

  return {
    money, filas, catalogo: creaAll.length, porFamilia,
    ceros: creaAll.filter((i) => !i.precio_extra),
    fueraDePizza, doble, incoherencias,
    catsSinB: (DATA.categorias || []).filter((c) => !catPizza[c.id]).map((c) => c.nombre || c.id),
  };
}

// ---- 5. Informe --------------------------------------------------------------------------
function printReport(res, target) {
  const { filas, catalogo, porFamilia, ceros, fueraDePizza, doble, incoherencias, catsSinB, money } = res;
  const out = [];
  const L = (s) => out.push(s === undefined ? '' : s);

  L('CARTA: ' + target);
  L('Catálogo de ingredientes: ' + catalogo + '  (' + Object.entries(porFamilia).map(([k, v]) => k + ' ' + v).join(' · ') + ')');
  L('Categorías sin «Crea tu pizza»: ' + (catsSinB.length ? catsSinB.join(', ') : 'ninguna'));
  L();

  L('1) INGREDIENTES OFRECIDOS EN UN PRODUCTO QUE NO ES PIZZA  (A abre, B no existe)');
  if (!fueraDePizza.length) L('   ninguno');
  for (const f of fueraDePizza) {
    L('   ' + f.nombre.padEnd(40) + ' ' + money(f.precio).padStart(9) + '  · ' + f.categoria + ' → ' + f.nAnadir + ' ingredientes añadibles');
  }
  L();

  L('2) LO QUE LA PIZZA YA LLEVA Y EL CONSTRUCTOR COBRA OTRA VEZ');
  if (!doble.length) L('   ninguno');
  for (const f of doble) {
    const imp = f.dobleCobro.reduce((s, x) => s + x.precio, 0);
    L('   ' + f.nombre.padEnd(40) + ' ' + String(f.dobleCobro.length).padStart(2) + ' ingr.  +' + money(imp).padStart(8) + ' si los pidiera todos');
    L('      ' + f.dobleCobro.map((x) => x.nombre + ' ' + money(x.precio)).join(' · '));
  }
  L();

  L('3) PRECIO DEL MISMO INGREDIENTE EN LOS DOS CANALES');
  L(incoherencias.length
    ? '   ' + incoherencias.length + ' productos con precio distinto según el canal — INCOHERENCIA'
    : '   idéntico en los dos: una sola tabla de precios, sin discrepancias');
  L();

  L('A cero (no suman ticket): ' + (ceros.length ? ceros.map((c) => c.nombre).join(', ') : 'ninguno'));
  L();
  if (DETALLE) {
    L('Detalle por producto (A = añadir en el detalle · B = Crea tu pizza):');
    const w = Math.max(...filas.map((p) => p.nombre.length), 8);
    for (const f of filas) {
      L('   ' + f.nombre.padEnd(w) + '  A ' + String(f.nAnadir).padStart(2) + ' · B ' + String(f.nCrea).padStart(2) +
        ' · base ' + String(f.nBase).padStart(2) + (f.catEsPizza ? '' : '  [categoría sin B]'));
    }
    L();
  } else {
    L('Detalle producto a producto: añade --detalle');
    L();
  }
  const veredicto = !incoherencias.length && !fueraDePizza.length
    ? 'COHERENTE: precio único y los dos canales ofrecen lo mismo en el mismo sitio.'
    : 'INCOHERENTE: ' + fueraDePizza.length + ' productos ofrecen ingredientes donde el constructor no existe' +
      (incoherencias.length ? ' y ' + incoherencias.length + ' con precio distinto' : '') + '.';
  L(veredicto);
  process.stdout.write(out.join('\n') + '\n');
  return (!incoherencias.length && !fueraDePizza.length) ? 0 : 1;
}

(async () => {
  const html = await loadHtml(target);
  const runtime = extractRuntime(html);
  const ctx = makeSandbox();
  vm.runInContext(runtime, ctx, { filename: 'carta-runtime.js' });
  const api = ctx.__carta || ctx.globalThis.__carta;
  if (!api) throw new Error('el runtime no expuso las funciones de la carta');

  const res = analyse(api);
  if (AS_JSON) {
    const payload = {
      target,
      catalogo: res.catalogo,
      ceros: res.ceros.map((c) => c.nombre),
      precioDistinto: res.incoherencias.map((f) => ({ producto: f.nombre, ingredientes: f.desajustesPrecio })),
      ofrecenIngredientesSinPizza: res.fueraDePizza.map((f) => ({ producto: f.nombre, categoria: f.categoria, precio: f.precio, ingredientes: f.nAnadir })),
      baseCobradaOtraVez: res.doble.map((f) => ({ producto: f.nombre, ingredientes: f.dobleCobro })),
      productos: res.filas.map((f) => ({ producto: f.nombre, categoria: f.categoria, a: f.nAnadir, b: f.nCrea, base: f.nBase })),
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    process.exit((res.incoherencias.length || res.fueraDePizza.length) ? 1 : 0);
  }
  process.exit(printReport(res, target));
})().catch((e) => {
  console.error('ERROR: ' + e.message);
  process.exit(2);
});

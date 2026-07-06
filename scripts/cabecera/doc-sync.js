#!/usr/bin/env node
'use strict';

// doc-sync.js — el MOTOR de la cúpula de la cabecera (peldaño 3 de la escalera
// de determinismo aplicado al documento: lo que envejece se COMPUTA, no se escribe).
//
// Marcadores que resuelve dentro de las rebanadas:
//   {{version:modules/conserje}}      → version del module.json (o package.json) de esa ruta
//   {{tests:conserje__*}}             → nº de ficheros en tests/unit que casan el glob
//   {{count:modules/*/module.json}}   → nº de rutas que casan el glob desde la raíz
// Marcador irresoluble → queda VISIBLE como ⚠COMPUTADO_ROTO(...) y cuenta como error.
//
// Modos:
//   node scripts/cabecera/doc-sync.js --ensamblar   genera CLAUDE.md (fino) + CLAUDE.full.md
//   node scripts/cabecera/doc-sync.js --check       solo resuelve marcadores y reporta rotos
//
// La fuente de verdad es arquitectura/cabecera (rebanadas + _orden.json + _mandato.md).
// CLAUDE.md y CLAUDE.full.md son ARTEFACTOS: no se editan a mano.

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const CABECERA_DIR = path.join(ROOT, 'arquitectura', 'cabecera');
const TESTS_DIR = path.join(ROOT, 'tests', 'unit');

// ── frontmatter (subconjunto YAML: escalares + listas "- item") ─────────
function parseRebanada(texto) {
  const m = texto.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { front: null, body: texto };
  const front = {};
  let listaActual = null;
  for (const linea of m[1].split('\n')) {
    const item = linea.match(/^\s+-\s+(.*)$/);
    if (item && listaActual) { front[listaActual].push(item[1].trim()); continue; }
    const kv = linea.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, clave, valor] = kv;
    if (valor === '') { front[clave] = []; listaActual = clave; }
    else if (valor === '[]') { front[clave] = []; listaActual = null; }
    else { front[clave] = valor.trim(); listaActual = null; }
  }
  return { front, body: texto.slice(m[0].length).replace(/^\n+/, '') };
}

// ── glob → regex (soporta ** y *) ───────────────────────────────────────
const DOBLE = '\u0001'; // sentinel para ** (nunca aparece en un glob)
function globARegex(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .split('**').join(DOBLE)
    .replace(/\*/g, '[^/]*')
    .split(DOBLE).join('.*');
  return new RegExp(`^${esc}$`);
}

function caminar(dir, acc = []) {
  let entradas;
  try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entradas) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) caminar(p, acc);
    else acc.push(p);
  }
  return acc;
}

function contarGlob(glob) {
  // limita el paseo al prefijo estático del glob (barato)
  const prefijo = glob.split(/[*[]/)[0].replace(/\/[^/]*$/, '') || '.';
  const base = path.join(ROOT, prefijo);
  const re = globARegex(glob);
  const candidatos = fs.existsSync(base) && fs.statSync(base).isDirectory()
    ? caminar(base) : (fs.existsSync(base) ? [base] : []);
  return candidatos.filter((p) => re.test(path.relative(ROOT, p).split(path.sep).join('/'))).length;
}

// ── resolución de marcadores ─────────────────────────────────────────────
function resolverMarcadores(texto) {
  const rotos = [];
  const resuelto = texto.replace(/\{\{(version|tests|count):([^}]+)\}\}/g, (todo, tipo, arg) => {
    arg = arg.trim();
    try {
      if (tipo === 'version') {
        for (const manifiesto of ['module.json', 'package.json']) {
          const p = path.join(ROOT, arg, manifiesto);
          if (fs.existsSync(p)) {
            const v = JSON.parse(fs.readFileSync(p, 'utf8')).version;
            if (v) return v;
          }
        }
        throw new Error('sin module.json/package.json con version');
      }
      if (tipo === 'tests') {
        const re = globARegex(arg.endsWith('.test.js') ? arg : `${arg}.test.js`);
        const n = fs.readdirSync(TESTS_DIR).filter((f) => re.test(f)).length;
        if (n === 0) throw new Error('cero tests casan el glob');
        return String(n);
      }
      // count
      const n = contarGlob(arg);
      if (n === 0) throw new Error('cero rutas casan el glob');
      return String(n);
    } catch (err) {
      rotos.push({ marcador: todo, motivo: err.message });
      return `⚠COMPUTADO_ROTO(${tipo}:${arg})`;
    }
  });
  return { texto: resuelto, rotos };
}

// ── carga de la cúpula ───────────────────────────────────────────────────
function cargarOrden() {
  return JSON.parse(fs.readFileSync(path.join(CABECERA_DIR, '_orden.json'), 'utf8')).orden;
}

function cargarRebanadas() {
  return cargarOrden().map((archivo) => {
    const ruta = path.join(CABECERA_DIR, archivo);
    const { front, body } = parseRebanada(fs.readFileSync(ruta, 'utf8'));
    return { archivo, ruta, front, body };
  });
}

// ── ensamblado ───────────────────────────────────────────────────────────
const AVISO = (fuente) =>
  `<!-- GENERADO por scripts/cabecera/doc-sync.js — NO EDITAR A MANO.\n     La fuente de verdad vive en ${fuente}. -->\n\n`;

function catalogo(rebanadas) {
  const filas = rebanadas
    .filter((r) => !r.archivo.startsWith('_'))
    .map((r) => `| \`arquitectura/cabecera/${r.archivo}\` | ${r.front.dominio} | ${r.front.resumen} |`);
  return ['| rebanada | dominio | qué cubre |', '|---|---|---|', ...filas].join('\n');
}

function ensamblar() {
  const rebanadas = cargarRebanadas();
  const persona = rebanadas.find((r) => r.archivo === '_persona.md');
  if (!persona) { console.error('✗ falta _persona.md'); process.exit(1); }
  const mandato = fs.readFileSync(path.join(CABECERA_DIR, '_mandato.md'), 'utf8').trim();

  let totalRotos = [];

  // CLAUDE.md fino: persona + mandato + catálogo
  const fino = resolverMarcadores(
    [persona.body.trim(), '---', mandato, catalogo(rebanadas)].join('\n\n') + '\n'
  );
  totalRotos = totalRotos.concat(fino.rotos.map((x) => ({ ...x, archivo: 'CLAUDE.md' })));
  fs.writeFileSync(path.join(ROOT, 'CLAUDE.md'), AVISO('arquitectura/cabecera (rebanadas)') + fino.texto);

  // CLAUDE.full.md: todas las rebanadas en orden
  const cuerpos = rebanadas.map((r) => {
    const res = resolverMarcadores(r.body.trim());
    totalRotos = totalRotos.concat(res.rotos.map((x) => ({ ...x, archivo: r.archivo })));
    return res.texto;
  });
  fs.writeFileSync(
    path.join(ROOT, 'CLAUDE.full.md'),
    AVISO('arquitectura/cabecera (rebanadas)') + cuerpos.join('\n\n---\n\n') + '\n'
  );

  return { rebanadas: rebanadas.length, rotos: totalRotos };
}

function check() {
  const rebanadas = cargarRebanadas();
  let rotos = [];
  for (const r of rebanadas) {
    const res = resolverMarcadores(r.body);
    rotos = rotos.concat(res.rotos.map((x) => ({ ...x, archivo: r.archivo })));
  }
  return { rebanadas: rebanadas.length, rotos };
}

module.exports = { parseRebanada, globARegex, resolverMarcadores, cargarRebanadas, cargarOrden, contarGlob, ensamblar, check, CABECERA_DIR };

if (require.main === module) {
  const modo = process.argv.includes('--ensamblar') ? 'ensamblar' : 'check';
  const r = modo === 'ensamblar' ? ensamblar() : check();
  console.log(`✓ ${r.rebanadas} rebanadas · modo ${modo}`);
  if (r.rotos.length) {
    console.error(`✗ ${r.rotos.length} marcadores rotos:`);
    for (const x of r.rotos) console.error(`  - ${x.archivo || ''} ${x.marcador}: ${x.motivo}`);
    process.exit(1);
  }
  if (modo === 'ensamblar') console.log('✓ CLAUDE.md (fino) + CLAUDE.full.md regenerados');
}

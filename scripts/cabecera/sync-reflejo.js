#!/usr/bin/env node
'use strict';

// sync-reflejo.js — el REFLEJO de la skill `sincronizar-cabecera` (peldaño híbrido:
// lo determinista lo hace JS, la lectura semántica la hace el PRISMA de lentes LLM).
//
// El vigilante (validate-cabecera.js) mide TIMESTAMPS y GLOBS: caza que una fuente
// cambió sin tocar la rebanada. NO puede ver que la PROSA contradice al CÓDIGO (por eso
// una rebanada sellada `verificado:` describió código muerto). Este reflejo no juzga:
// ARMA EL EXPEDIENTE que el prisma juzgará — empareja, por el diff, cada rebanada tocada
// con sus secciones y con el código que cambió, más los comentarios de bloque y el
// trabajo_pendiente de los blueprints tocados. Función determinista: entra diff, sale
// material. El veredicto semántico (¿la prosa sigue siendo cierta?) lo pone la lente.
//
// Uso:
//   node scripts/cabecera/sync-reflejo.js --diff origin/main [--json]
//
// Salida (--json): { expedientes: [ { rebanada, secciones[], ficheros_tocados[],
//   blueprints[{path, pendientes[]}], comentarios_sospechosos[] } ], modo }

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ds = require('./doc-sync.js');

const ROOT = process.cwd();

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? (process.argv[i + 1] || true) : null;
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch { return ''; }
}

// Cabeceras de sección de una rebanada (## / ### TITULO) — el prisma empareja
// cada fichero tocado con la sección que lo describe (el reflejo no adivina cuál).
function seccionesDe(body) {
  const out = [];
  const re = /^(#{2,3})\s+(.+)$/gm;
  let m;
  while ((m = re.exec(body))) out.push({ nivel: m[1].length, titulo: m[2].trim() });
  return out;
}

// trabajo_pendiente de un blueprint tocado: los items `abierto`/`espera_*` son
// candidatos a estar SUPERADOS por el código nuevo (la lente `pendientes` lo juzga).
function pendientesDeBlueprint(rel) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    const tp = Array.isArray(j.trabajo_pendiente) ? j.trabajo_pendiente : [];
    return tp
      .filter((t) => t && t.estado && t.estado !== 'resuelto')
      .map((t) => ({ id: t.id, estado: t.estado, descripcion: t.descripcion }));
  } catch { return []; }
}

// Comentarios de bloque que pueden haberse quedado atrás del código de debajo.
// El reflejo NO juzga si mienten (eso es semántico) — solo señala los bloques de
// comentario en los ficheros TOCADOS para que la lente `comentarios` los lea contra
// el código adyacente. Heurística barata: bloques // … de ≥2 líneas o /* … */.
function comentariosDe(rel) {
  let txt = '';
  try { txt = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return []; }
  const out = [];
  const lineas = txt.split('\n');
  let bloque = null;
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (/^\s*\/\//.test(l)) {
      if (!bloque) bloque = { desde: i + 1, lineas: [] };
      bloque.lineas.push(l.trim());
    } else {
      if (bloque && bloque.lineas.length >= 2) out.push({ linea: bloque.desde, texto: bloque.lineas.join(' ').slice(0, 400) });
      bloque = null;
    }
  }
  if (bloque && bloque.lineas.length >= 2) out.push({ linea: bloque.desde, texto: bloque.lineas.join(' ').slice(0, 400) });
  // top-K por longitud (los comentarios largos cargan el porqué; los cortos rara vez derivan)
  return out.sort((a, b) => b.texto.length - a.texto.length).slice(0, 12);
}

function main() {
  const diffBase = arg('diff');
  if (!diffBase) {
    console.error('uso: sync-reflejo.js --diff <BASE> [--json]');
    process.exitCode = 2;
    return;
  }

  const cambiados = git(['diff', '--name-only', `${diffBase}...HEAD`]).split('\n').filter(Boolean);
  const rebanadas = ds.cargarRebanadas();

  const expedientes = [];
  for (const r of rebanadas) {
    const rel = `arquitectura/cabecera/${r.archivo}`;
    const fuentes = Array.isArray(r.front?.fuentes) ? r.front.fuentes : [];
    if (!fuentes.length) continue;

    const regexes = fuentes.map(ds.globARegex);
    const tocados = cambiados.filter((f) => regexes.some((re) => re.test(f)));
    if (!tocados.length) continue;                       // el diff no toca esta rebanada

    const blueprints = tocados
      .filter((f) => /\.blueprint\.json$/.test(f))
      .map((f) => ({ path: f, pendientes: pendientesDeBlueprint(f) }))
      .filter((b) => b.pendientes.length);

    const comentarios = tocados
      .filter((f) => /\.(js|ts|mjs|cjs)$/.test(f))
      .flatMap((f) => comentariosDe(f).map((c) => ({ fichero: f, ...c })));

    expedientes.push({
      rebanada: r.archivo,
      rebanada_path: rel,
      rebanada_tocada: cambiados.includes(rel),           // ¿ya se editó la rebanada en el PR?
      secciones: seccionesDe(r.body),
      ficheros_tocados: tocados,
      blueprints,
      comentarios_sospechosos: comentarios
    });
  }

  const salida = { modo: 'reflejo', base: diffBase, rebanadas_afectadas: expedientes.length, expedientes };
  if (arg('json')) {
    console.log(JSON.stringify(salida, null, 2));
  } else {
    console.log(`sync-reflejo: ${expedientes.length} rebanada(s) afectada(s) por ${cambiados.length} fichero(s) del diff`);
    for (const e of expedientes) {
      console.log(`\n▸ ${e.rebanada}${e.rebanada_tocada ? ' (ya tocada en el PR)' : ''}`);
      console.log(`  ficheros: ${e.ficheros_tocados.join(', ')}`);
      if (e.secciones.length) console.log(`  secciones: ${e.secciones.map((s) => s.titulo).join(' · ')}`);
      if (e.blueprints.length) console.log(`  blueprints con pendientes: ${e.blueprints.map((b) => `${b.path} [${b.pendientes.map((p) => p.id).join(',')}]`).join(' ; ')}`);
      if (e.comentarios_sospechosos.length) console.log(`  comentarios a revisar: ${e.comentarios_sospechosos.length}`);
    }
    console.log(expedientes.length ? '\n→ pasa el expediente al PRISMA (skill sincronizar-cabecera) para el veredicto semántico' : '→ nada que sincronizar');
  }
}

if (require.main === module) main();
module.exports = { main };

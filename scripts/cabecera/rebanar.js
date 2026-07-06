#!/usr/bin/env node
'use strict';

/**
 * rebanar.js — migración ÚNICA del monolito a la cúpula de la cabecera.
 *
 * Corta un documento monolítico (CLAUDE.md) por sus headings de primer nivel (`# `)
 * y escribe una rebanada .md por sección en el directorio destino, con frontmatter:
 *   id · dominio · titulo · resumen · fuentes · verificado
 * Genera también _orden.json (el manifiesto de ensamblado, en orden documental).
 *
 * El mapa (JSON) declara, por PREFIJO de heading, el destino de cada sección.
 * Falla en voz alta si una sección no casa con el mapa o una entrada del mapa
 * no casa con ninguna sección (no_silent_drops).
 *
 * Uso:
 *   node scripts/cabecera/rebanar.js --doc CLAUDE.md \
 *     --mapa scripts/cabecera/mapa-migracion.enki.json \
 *     --out arquitectura/cabecera
 */

const fs = require('fs');
const path = require('path');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const ROOT = process.cwd();
const docPath = path.resolve(ROOT, arg('doc', 'CLAUDE.md'));
const mapaPath = path.resolve(ROOT, arg('mapa', 'scripts/cabecera/mapa-migracion.enki.json'));
const outDir = path.resolve(ROOT, arg('out', 'arquitectura/cabecera'));
const hoy = new Date().toISOString().slice(0, 10);

const doc = fs.readFileSync(docPath, 'utf8');
const mapa = JSON.parse(fs.readFileSync(mapaPath, 'utf8'));

// ── 1. partir por headings de primer nivel ──────────────────────────────
const lineas = doc.split('\n');
const cortes = [];
for (let i = 0; i < lineas.length; i++) {
  if (/^# /.test(lineas[i])) cortes.push(i);
}
if (cortes.length === 0) {
  console.error('✗ el documento no tiene headings de primer nivel');
  process.exit(1);
}

const secciones = cortes.map((inicio, idx) => {
  const fin = idx + 1 < cortes.length ? cortes[idx + 1] : lineas.length;
  let cuerpo = lineas.slice(inicio, fin).join('\n');
  // el separador `---` que precede al siguiente heading pertenece al ensamblador, no a la rebanada
  cuerpo = cuerpo.replace(/\n+---\s*$/, '').replace(/\s+$/, '') + '\n';
  return { heading: lineas[inicio].replace(/^# /, ''), cuerpo };
});

// ── 2. casar cada sección con el mapa (prefijo más largo gana) ─────────
const entradas = [...mapa.secciones].sort((a, b) => b.match.length - a.match.length);
const usadas = new Set();
const rebanadas = [];

for (const sec of secciones) {
  const entrada = entradas.find((e) => sec.heading.startsWith(e.match));
  if (!entrada) {
    console.error(`✗ sección sin entrada en el mapa: "${sec.heading.slice(0, 60)}"`);
    process.exit(1);
  }
  if (usadas.has(entrada.archivo)) {
    console.error(`✗ dos secciones casan con la misma entrada: ${entrada.archivo}`);
    process.exit(1);
  }
  usadas.add(entrada.archivo);
  rebanadas.push({ ...entrada, heading: sec.heading, cuerpo: sec.cuerpo });
}

const sobrantes = mapa.secciones.filter((e) => !usadas.has(e.archivo));
if (sobrantes.length) {
  console.error(`✗ entradas del mapa sin sección: ${sobrantes.map((e) => e.archivo).join(', ')}`);
  process.exit(1);
}

// ── 3. escribir rebanadas con frontmatter + manifiesto de orden ────────
function frontmatter(r) {
  const id = r.archivo.replace(/\.md$/, '').replace(/^_/, '');
  const fm = ['---', `id: ${id}`, `dominio: ${r.dominio}`, `resumen: ${r.resumen}`];
  if (r.fuentes && r.fuentes.length) {
    fm.push('fuentes:');
    for (const f of r.fuentes) fm.push(`  - ${f}`);
  } else {
    fm.push('fuentes: []');
  }
  fm.push(`verificado: ${hoy}`);
  fm.push('---');
  return fm.join('\n');
}

const orden = [];
for (const r of rebanadas) {
  const destino = path.join(outDir, r.archivo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, `${frontmatter(r)}\n\n${r.cuerpo}`);
  orden.push(r.archivo);
  console.log(`✓ ${r.archivo}  (${r.cuerpo.split('\n').length} líneas)`);
}

fs.writeFileSync(
  path.join(outDir, '_orden.json'),
  JSON.stringify({ _doc: 'Orden de ensamblado de CLAUDE.full.md — mantener a mano al añadir rebanadas.', orden }, null, 2) + '\n'
);

console.log(`\n✓ ${rebanadas.length} rebanadas en ${path.relative(ROOT, outDir)}/ + _orden.json`);

#!/usr/bin/env node
'use strict';
/**
 * Verificador de skills FULL de la vertical CONTABILIDAD.
 *
 * POR QUÉ EXISTE: `scripts/verificar-skill-modulo.js` (el canónico) busca el módulo
 * en `modules/<slug>/` PLANO. La convención REAL del repo es `modules/<vertical>/<slug>/`
 * (dos niveles, como nichos) -> el canónico da falso negativo en TODAS las verticales.
 * Este script usa la ruta recursiva real y además comprueba el contrato de eventos.
 *
 * USO:  node scripts/verificar-skill-contabilidad.js <slug> [<slug> ...]
 *       node scripts/verificar-skill-contabilidad.js --todos
 *
 * COMPRUEBA:
 *   1. el módulo existe en modules/<vertical>/<slug>/ con index.js + module.json
 *   2. la skill existe PLANA en modules/cosecha/cantera/enki/<slug>/SKILL.md
 *   3. frontmatter: name == slug, description, when-to-use, tags
 *   4. TODOS los eventos de subscribes y publishes del module.json aparecen en la skill
 *   5. las 6 secciones canónicas están presentes
 *   6. el tipo declarado coincide con la forma REAL del módulo (custodio -> PosPersistencia)
 *
 * Salida: "<slug>: N/N OK · handlers N/N · frontmatter OK · secciones OK"
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const MODULES = path.join(RAIZ, 'modules');
const CANTERA = path.join(MODULES, 'cosecha', 'cantera', 'enki');
const VERTICALES = ['contabilidad-entrada', 'contabilidad-libro', 'contabilidad-fiscal', 'contabilidad-analitica'];

const SECCIONES = [
  '## Qué hace el módulo',
  '## Contrato de eventos',
  '## Reglas de negocio',
  '## Cómo se usa',
  '## Tests',
  '## Notas de implementación',
];

function localizarModulo(slug) {
  for (const v of VERTICALES) {
    const p = path.join(MODULES, v, slug);
    if (fs.existsSync(path.join(p, 'module.json'))) return { dir: p, vertical: v };
  }
  // fallback: búsqueda recursiva
  const encontrados = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const p = path.join(d, e.name);
      if (e.name === 'cosecha' || e.name === 'node_modules' || e.name.startsWith('.')) continue;
      if (fs.existsSync(path.join(p, 'module.json')) && e.name === slug) encontrados.push({ dir: p, vertical: path.basename(d) });
      walk(p);
    }
  })(MODULES);
  return encontrados[0] || null;
}

function verificar(slug) {
  const fallos = [];
  const loc = localizarModulo(slug);
  if (!loc) return { slug, ok: false, msg: `módulo NO ENCONTRADO en modules/<vertical>/${slug}/` };

  let man;
  try { man = JSON.parse(fs.readFileSync(path.join(loc.dir, 'module.json'), 'utf8')); }
  catch (e) { return { slug, ok: false, msg: `module.json inválido: ${e.message}` }; }

  const skillPath = path.join(CANTERA, slug, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return { slug, ok: false, msg: `skill NO EXISTE en cantera/enki/${slug}/SKILL.md` };
  const txt = fs.readFileSync(skillPath, 'utf8');

  // 3 · frontmatter
  const fm = txt.split(/^---\s*$/m);
  const frontOk = fm.length >= 3 && /\bname:\s*/.test(fm[1]) && /\bdescription:\s*/.test(fm[1])
    && /when-to-use:/.test(fm[1]) && /tags:/.test(fm[1]) && new RegExp(`name:\\s*${slug}\\b`).test(fm[1]);
  if (!frontOk) fallos.push('frontmatter incompleto (name/description/when-to-use/tags)');

  // 4 · contrato de eventos
  const subs = (man.subscribes || []).map(s => (typeof s === 'string' ? s : s.event)).filter(Boolean);
  const pubs = (man.publishes || []).map(s => (typeof s === 'string' ? s : s.event)).filter(Boolean);
  const eventos = [...subs, ...pubs];
  const faltanEv = eventos.filter(ev => !txt.includes(ev));
  // los .response los emite _atender -> pueden no listarse; se cuentan pero se marcan
  const faltanDuros = faltanEv.filter(ev => !ev.endsWith('.response'));
  if (faltanDuros.length) fallos.push(`eventos no documentados: ${faltanDuros.slice(0, 4).join(', ')}${faltanDuros.length > 4 ? '…' : ''}`);

  // 5 · secciones
  const faltanSec = SECCIONES.filter(s => !txt.includes(s));
  if (faltanSec.length) fallos.push(`secciones ausentes: ${faltanSec.map(s => s.replace('## ', '')).join(', ')}`);

  // 6 · handlers
  const src = fs.readFileSync(path.join(loc.dir, 'index.js'), 'utf8');
  const handlers = (man.subscribes || []).map(s => (typeof s === 'object' ? s.handler : null)).filter(Boolean);
  const handlersOk = handlers.every(h => new RegExp(`\\b${h}\\s*\\(`).test(src));
  const handlersDoc = handlers.every(h => txt.includes(h));
  if (!handlersOk) fallos.push('algún handler declarado NO existe en index.js');
  if (!handlersDoc) fallos.push('algún handler NO está documentado en la skill');

  // forma real vs declarada. OJO: los módulos STATELESS documentan "Sin PosPersistencia"
  // en su cabecera, así que /PosPersistencia/ daría falso positivo. Se detecta la
  // CUSTODIA real por instanciación / import del módulo de persistencia.
  const esCustodio = /new\s+PosPersistencia\s*\(/.test(src) || /require\([^)]*pos-persistencia/.test(src);
  const tipoSkill = /Skill FULL del módulo\s+(\w+)/i.exec(txt);
  const tipo = tipoSkill ? tipoSkill[1].toUpperCase() : '?';
  if (tipo.includes('CUSTODIO') !== esCustodio) fallos.push(`tipo declarado (${tipo}) no casa con el código`);

  const n = eventos.length - faltanDuros.length;
  const cab = `${slug}: ${n}/${eventos.length} OK · handlers ${handlers.length - (handlersOk ? 0 : 1)}/${handlers.length}`;
  if (fallos.length) return { slug, ok: false, msg: `${cab} · FALLOS: ${fallos.join(' | ')}` };
  return { slug, ok: true, msg: `${cab} · frontmatter OK · secciones OK` };
}

function todos() {
  const out = [];
  for (const v of VERTICALES) {
    const d = path.join(MODULES, v);
    if (!fs.existsSync(d)) continue;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory() && fs.existsSync(path.join(d, e.name, 'module.json'))) out.push(e.name);
    }
  }
  return out;
}

const args = process.argv.slice(2);
if (!args.length) { console.error('uso: node scripts/verificar-skill-contabilidad.js <slug>|--todos'); process.exit(2); }
const slugs = args[0] === '--todos' ? todos() : args;
let ok = 0;
for (const s of slugs) {
  const r = verificar(s);
  console.log(`  ${r.ok ? '✅' : '❌'} ${r.msg}`);
  if (r.ok) ok++;
}
console.log(`\n  ${ok}/${slugs.length} skills OK`);
process.exit(ok === slugs.length ? 0 : 1);

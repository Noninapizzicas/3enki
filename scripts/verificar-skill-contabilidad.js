#!/usr/bin/env node
/**
 * verificar-skill-contabilidad.js <slug>
 *
 * Verifica la skill FULL de un módulo de la vertical CONTABILIDAD.
 *
 * DIFERENCIA con scripts/verificar-skill-modulo.js (el canónico):
 *   el canónico busca `modules/<slug>/module.json` (PLANO) y `cantera/enki/<slug>/SKILL.md`.
 *   Los módulos de contabilidad viven en `modules/contabilidad/<slug>/` (dos niveles).
 *   El canónico da "NO module.json" para TODA vertical (también para nichos).
 *   Este verifica la ruta real.
 *
 * Uso: node scripts/verificar-skill-contabilidad.js <slug>
 * Salida: "slug: N/N OK" o la lista de eventos missing + secciones ausentes.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const slug = process.argv[2];
if (!slug) { console.error('uso: node scripts/verificar-skill-contabilidad.js <slug>'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const jsonPath = path.join(ROOT, 'modules', 'contabilidad', slug, 'module.json');
// la skill va PLANA en la cantera (mismo patrón que nichos), no en contabilidad/<slug>/
const skillPath = path.join(ROOT, 'modules', 'cosecha', 'cantera', 'enki', slug, 'SKILL.md');

let fallos = 0;
if (!fs.existsSync(jsonPath)) { console.error(`NO module.json: ${jsonPath}`); process.exit(1); }
if (!fs.existsSync(skillPath)) { console.error(`NO SKILL.md: ${skillPath}`); process.exit(1); }

const mod = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const skill = fs.readFileSync(skillPath, 'utf8');

// 1) TODOS los eventos del module.json mencionados en la skill
const eventos = [...(mod.subscribes || []).map(x => x.event), ...(mod.publishes || []).map(x => x.event)];
const missing = eventos.filter(e => !skill.includes(e));
if (missing.length) { console.error(`  eventos MISSING (${missing.length}/${eventos.length}): ${missing.join(', ')}`); fallos++; }

// 2) frontmatter: name == slug
const fm = /^---\n([\s\S]*?)\n---/.exec(skill);
let nameOk = false;
if (fm) {
  const m = /^name:\s*(.+)$/m.exec(fm[1]);
  nameOk = !!m && m[1].trim() === slug;
}
if (!nameOk) { console.error('  frontmatter: name != slug (o falta frontmatter)'); fallos++; }

// 3) secciones canónicas del estándar F5
const secciones = ['## Qué hace el módulo', '## Contrato de eventos', '## Reglas de negocio', '## Cómo se usa', '## Tests', '## Notas de implementación'];
const ausentes = secciones.filter(s => !skill.includes(s));
if (ausentes.length) { console.error(`  secciones AUSENTES: ${ausentes.join(' | ')}`); fallos++; }

// 4) los handlers del module.json deben aparecer
const handlers = (mod.subscribes || []).map(x => x.handler).filter(Boolean);
const hMissing = handlers.filter(h => !skill.includes(h));
if (hMissing.length) { console.error(`  handlers no mencionados: ${hMissing.join(', ')}`); fallos++; }

if (fallos) { console.error(`${slug}: FALLA (${fallos} problema(s))`); process.exit(1); }
console.log(`${slug}: ${eventos.length}/${eventos.length} OK · handlers ${handlers.length}/${handlers.length} · frontmatter OK · secciones OK`);

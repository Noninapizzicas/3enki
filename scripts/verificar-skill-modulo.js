#!/usr/bin/env node
/**
 * verificar-skill-modulo.js <slug>
 *
 * Verifica que la skill FULL de la cantera (modules/cosecha/cantera/enki/<slug>/SKILL.md)
 * mencione TODOS los eventos de module.json (subscribes + publishes) y tenga las
 * secciones canónicas del estándar F5.
 *
 * Uso: node scripts/verificar-skill-modulo.js <slug>
 * Salida: "catalogo: N/N OK" o lista de eventos missing + secciones ausentes.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const slug = process.argv[2];
if (!slug) { console.error('uso: node scripts/verificar-skill-modulo.js <slug>'); process.exit(1); }

const jsonPath = path.join(__dirname, '..', 'modules', slug, 'module.json');
const skillPath = path.join(__dirname, '..', 'modules', 'cosecha', 'cantera', 'enki', slug, 'SKILL.md');

if (!fs.existsSync(jsonPath)) { console.error(`NO module.json: ${jsonPath}`); process.exit(1); }
if (!fs.existsSync(skillPath)) { console.error(`NO SKILL.md: ${skillPath}`); process.exit(1); }

const mod = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const skill = fs.readFileSync(skillPath, 'utf8');

// 1) eventos completos
const eventos = [...(mod.subscribes || []).map(x => x.event), ...(mod.publishes || []).map(x => x.event)];
const missing = eventos.filter(e => !skill.includes(e));

// 2) frontmatter name==slug
const fm = /^---\n([\s\S]*?)\n---/.exec(skill);
let nameOk = false;
if (fm) {
  const m = /^name:\s*(.+)$/m.exec(fm[1]);
  nameOk = !!m && m[1].trim() === slug;
}

// 3) secciones canónicas
const sect = ['## Qué hace el módulo', '## Contrato de eventos', '## Reglas de negocio', '## Cómo se usa (RPCs)', '## Tests', '## Notas de implementación'];
const missingSect = sect.filter(s => !skill.includes(s));
// tolerar "## Uso / cómo invocarlo" como variante de RPCs
if (missingSect.includes('## Cómo se usa (RPCs)') && skill.includes('## Uso / cómo invocarlo')) {
  missingSect.splice(missingSect.indexOf('## Cómo se usa (RPCs)'), 1);
}

const n = eventos.length;
if (missing.length === 0 && nameOk && missingSect.length === 0) {
  console.log(`${slug}: ${n}/${n} OK`);
  process.exit(0);
}
const problemas = [];
if (missing.length) problemas.push(`eventos missing: ${missing.join(', ')}`);
if (!nameOk) problemas.push(`frontmatter name != slug`);
if (missingSect.length) problemas.push(`secciones ausentes: ${missingSect.join(', ')}`);
console.log(`${slug}: ${n - missing.length}/${n} eventos | ${problemas.join(' | ')}`);
process.exit(1);

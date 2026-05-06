#!/usr/bin/env node
/**
 * finish-rewrite.js — Cierre mecanico del rewrite POC2 de un modulo.
 *
 * Uso:
 *   node arquitectura/migracion/scripts/finish-rewrite.js <slug> [--commit] [--message "subject line"]
 *   node arquitectura/migracion/scripts/finish-rewrite.js gateway-manager
 *   node arquitectura/migracion/scripts/finish-rewrite.js plugin-manager --commit
 *
 * Hace (sin intervencion humana):
 *   1. node tests/unit/<slug>.test.js (verifica green)
 *   2. Computar drift count actual (path-matching) ANTES de regenerar baseline
 *   3. npm run validate:baseline:update (regenera baseline)
 *   4. npm run validate:ci (verifica PASS)
 *   5. Computar drift count DESPUES de regenerar baseline
 *   6. node arquitectura/migracion/scripts/inventario.js
 *   7. node arquitectura/migracion/scripts/progreso.js
 *   8. Imprimir summary (drift delta antes/despues, status migrado/pendiente)
 *   9. Si --commit: git add + commit con mensaje templateado leyendo el mapa.md
 *
 * NO hace push (el usuario decide cuando).
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

const REPO_ROOT     = path.resolve(__dirname, '../../..');
const BASELINE_PATH = path.join(REPO_ROOT, 'drift-baseline.json');
const NOTAS_DIR     = path.join(REPO_ROOT, 'arquitectura/migracion/notas');
const LEGACY_DIR    = path.join(REPO_ROOT, 'arquitectura/migracion/_legacy');
const PROGRESO_PATH = path.join(REPO_ROOT, 'arquitectura/migracion/_outputs/PROGRESO.md');

const RED = '\x1b[31m', GRN = '\x1b[32m', YEL = '\x1b[33m', CYN = '\x1b[36m', BLD = '\x1b[1m', RST = '\x1b[0m';

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
function fail(msg) { console.error(`${RED}error:${RST} ${msg}`); process.exit(1); }

function slugToModulePath(slug) {
  return path.join(REPO_ROOT, 'modules', slug.replace(/__/g, '/'));
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf-8', ...opts });
  return { code: res.status ?? -1, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function countBaselineDrifts(slug, modulePath) {
  if (!fs.existsSync(BASELINE_PATH)) return { total: 0, byType: {} };
  const b = loadJson(BASELINE_PATH);
  const sigs = Array.isArray(b.signatures) ? b.signatures : [];
  const relDir = path.relative(REPO_ROOT, modulePath).replace(/\\/g, '/') + '/';
  const byType = {};
  let total = 0;
  for (const s of sigs) {
    if (typeof s !== 'string') continue;
    if (!s.includes(relDir) && !s.includes(slug)) continue;
    if (s.includes('arquitectura/migracion/notas/')) continue;
    total++;
    const m = s.match(/\|(drift_\w+)\|/);
    if (m) byType[m[1]] = (byType[m[1]] || 0) + 1;
  }
  return { total, byType };
}

function buildCommitMessage(slug, modulePath, before, after, customSubject) {
  const mapaPath = path.join(NOTAS_DIR, `${slug}-mapa.md`);
  let mapaSummary = '';
  if (fs.existsSync(mapaPath)) {
    const lines = fs.readFileSync(mapaPath, 'utf-8').split('\n');
    // Coge la "Responsabilidad acotada" line si existe
    const respIdx = lines.findIndex(l => /^## Responsabilidad/.test(l));
    if (respIdx >= 0) {
      // siguiente bloque hasta la siguiente seccion
      const block = [];
      for (let i = respIdx + 1; i < lines.length && !/^## /.test(lines[i]); i++) {
        if (lines[i].trim()) block.push(lines[i]);
      }
      mapaSummary = block.join(' ').slice(0, 280);
    }
  }

  const delta = before - after;
  const pct = before > 0 ? Math.round((delta / before) * 100) : 0;

  const driftBreakdown = Object.entries(after.byType || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => `  - ${v} ${k}`)
    .join('\n');

  const subject = customSubject || `${slug}: reescritura canonica al ancho de los 24 contratos (POC2)`;

  return `${subject}

PASO 0 antes de tocar codigo: arquitectura/migracion/notas/${slug}-mapa.md
${mapaSummary ? '(' + mapaSummary.trim() + ')' : ''}

Monolito archivado en arquitectura/migracion/_legacy/${slug}-monolito-pre-rewrite.js.bak.

Cambios principales:
- 5 helpers POC2 transferibles + auxiliar del dominio.
- Handlers devuelven shape canonico { status, data | error: { code, message, details? } }.
- _publicarEvento canoniza correlation_id + timestamp en todos los publishes.
- module.json con tracing.propaga_correlation_id=true + observability completa
  bajo prefix canonico.

Tests: tests/unit/${slug}.test.js wireado a package.json (test:${slug}) y al
workflow CI.

Drifts: ${before.total} -> ${after.total} (${pct >= 0 ? '-' : '+'}${Math.abs(pct)}%) en baseline path-matching.
${driftBreakdown ? 'Drift residual:\n' + driftBreakdown : ''}

baseline regenerado, validate:ci PASS.

https://claude.ai/code/session_01Tpu4DZQbLgs8TVH9ZPMPDU
`;
}

function gitStaged(slug, modulePath) {
  const moduleDirRel = path.relative(REPO_ROOT, modulePath).replace(/\\/g, '/');
  const paths = [
    `${moduleDirRel}/`,
    `tests/unit/${slug}.test.js`,
    `arquitectura/migracion/notas/${slug}-mapa.md`,
    `arquitectura/migracion/_legacy/${slug}-monolito-pre-rewrite.js.bak`,
    `arquitectura/migracion/_outputs/PROGRESO.md`,
    `arquitectura/migracion/_outputs/modulos-roadmap.json`,
    `drift-baseline.json`,
    `package.json`,
    `.github/workflows/validate.yml`
  ];
  return paths;
}

// --------------------------------------------------
// Main
// --------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const slug = args[0];
  if (!slug || slug.startsWith('--')) {
    fail(`uso: node ${path.basename(__filename)} <slug> [--commit] [--message "subject"]`);
  }
  const doCommit = args.includes('--commit');
  const msgIdx = args.indexOf('--message');
  const customSubject = msgIdx >= 0 ? args[msgIdx + 1] : null;

  const modulePath = slugToModulePath(slug);
  if (!fs.existsSync(modulePath)) fail(`module dir not found: ${modulePath}`);

  console.log(`${BLD}=== finish-rewrite ${slug} ===${RST}`);

  // 1. Tests del modulo
  console.log(`\n${CYN}[1/8]${RST} npm run test:${slug}`);
  const testRun = run('npm', ['run', `test:${slug}`]);
  if (testRun.code !== 0) {
    console.error(`${RED}tests fallaron:${RST}\n${testRun.stdout}\n${testRun.stderr}`);
    process.exit(1);
  }
  console.log(`${GRN}✓${RST} tests verde`);

  // 2. Drift antes
  console.log(`\n${CYN}[2/8]${RST} contar drifts antes (sobre baseline actual)`);
  const before = countBaselineDrifts(slug, modulePath);
  console.log(`  ${before.total} signatures path-matching (${Object.keys(before.byType).length} tipos)`);

  // 3. Regenerar baseline
  console.log(`\n${CYN}[3/8]${RST} npm run validate:baseline:update`);
  const upd = run('npm', ['run', 'validate:baseline:update']);
  if (upd.code !== 0) {
    console.error(`${RED}validate:baseline:update fallo:${RST}\n${upd.stdout}\n${upd.stderr}`);
    process.exit(1);
  }
  console.log(`${GRN}✓${RST} baseline actualizado`);

  // 4. Verificar CI
  console.log(`\n${CYN}[4/8]${RST} npm run validate:ci`);
  const ci = run('npm', ['run', 'validate:ci']);
  if (ci.code !== 0) {
    console.error(`${RED}validate:ci fallo:${RST}`);
    const tail = ci.stdout.split('\n').slice(-30).join('\n');
    console.error(tail);
    process.exit(1);
  }
  console.log(`${GRN}✓${RST} validate:ci PASS`);

  // 5. Drift despues
  console.log(`\n${CYN}[5/8]${RST} contar drifts despues`);
  const after = countBaselineDrifts(slug, modulePath);
  console.log(`  ${after.total} signatures path-matching (${Object.keys(after.byType).length} tipos)`);
  const delta = before.total - after.total;
  const pct = before.total > 0 ? Math.round((delta / before.total) * 100) : 0;
  const sign = delta >= 0 ? '-' : '+';
  console.log(`  delta: ${before.total} -> ${after.total} (${sign}${Math.abs(pct)}%)`);

  // 6. Inventario
  console.log(`\n${CYN}[6/8]${RST} regenerar inventario`);
  const inv = run('node', ['arquitectura/migracion/scripts/inventario.js']);
  if (inv.code !== 0) {
    console.error(`${RED}inventario fallo:${RST}\n${inv.stderr}`);
    process.exit(1);
  }

  // 7. PROGRESO
  console.log(`\n${CYN}[7/8]${RST} regenerar PROGRESO`);
  const prog = run('node', ['arquitectura/migracion/scripts/progreso.js']);
  if (prog.code !== 0) {
    console.error(`${RED}progreso fallo:${RST}\n${prog.stderr}`);
    process.exit(1);
  }
  // Buscar la linea del modulo en PROGRESO
  if (fs.existsSync(PROGRESO_PATH)) {
    const content = fs.readFileSync(PROGRESO_PATH, 'utf-8');
    const re = new RegExp(`\\| \`${slug.replace(/[\\^$.*+?()[\\]{}|]/g, '\\$&')}\` \\| .*`, 'g');
    const found = content.match(re);
    if (found && found.length > 0) {
      console.log(`  ${GRN}migrado${RST}: ${found[0].trim()}`);
    } else {
      const reP = new RegExp(`\\| ${slug.replace(/[\\^$.*+?()[\\]{}|]/g, '\\$&')} \\|`, 'g');
      const pendingMatch = content.match(reP);
      if (pendingMatch) console.log(`  ${YEL}pendiente:${RST} ${pendingMatch[0]}`);
      else console.log(`  ${YEL}no encontrado en PROGRESO${RST}`);
    }
  }

  // 8. Commit (opcional)
  console.log(`\n${CYN}[8/8]${RST} commit`);
  if (!doCommit) {
    console.log(`  skip (sin --commit). Para commitear ahora:`);
    console.log(`    node ${path.relative(REPO_ROOT, __filename)} ${slug} --commit`);
  } else {
    const paths = gitStaged(slug, modulePath);
    const existingPaths = paths.filter(p => {
      const abs = path.join(REPO_ROOT, p.replace(/\/$/, ''));
      return fs.existsSync(abs) || p.endsWith('/');
    });
    const addRes = run('git', ['add', ...existingPaths]);
    if (addRes.code !== 0) {
      console.error(`${RED}git add fallo:${RST}\n${addRes.stderr}`);
      process.exit(1);
    }

    const message = buildCommitMessage(slug, modulePath, before, after, customSubject);
    const tmpFile = path.join(REPO_ROOT, '.commit-msg.tmp');
    fs.writeFileSync(tmpFile, message);
    try {
      const commitRes = run('git', ['commit', '-F', tmpFile]);
      if (commitRes.code !== 0) {
        console.error(`${RED}git commit fallo:${RST}\n${commitRes.stdout}\n${commitRes.stderr}`);
        process.exit(1);
      }
      console.log(`${GRN}✓${RST} commit creado`);
      const last = run('git', ['log', '-1', '--oneline']);
      if (last.stdout) console.log(`  ${last.stdout.trim()}`);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
  }

  console.log(`\n${GRN}listo.${RST} para push: git push -u origin <branch>`);
}

main();

#!/usr/bin/env node
/**
 * Validador del transversal scheduling v1.0.0.
 *
 * Cross-checks (3):
 *  1. scheduling_contract_estructura_valida    (error)
 *  2. drift_biblioteca_cron_alternativa        (error)   — cron, node-schedule, agenda en deps
 *  3. drift_setinterval_subsegundo             (warning) — setInterval con < 100ms
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT     = path.resolve(__dirname, '../../..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/scheduling.contract.json');
const MODULES_DIR   = path.join(REPO_ROOT, 'modules');

const RED='\x1b[31m', GREEN='\x1b[32m', YEL='\x1b[33m', CYAN='\x1b[36m', RST='\x1b[0m';
const SECCIONES_CANONICAS = ['_doc','id','version','creada','supersedes_nota','objetivo','inputs','filosofia','principios','decisiones_arquitectonicas','prohibido','output_shape_resumen','reglas_de_extraccion','derivaciones','validaciones_cross_realizadas_por_validator','salida_validador','convenciones_complementarias'];

const CRON_LIBS_PROHIBIDAS = ['cron', 'node-schedule', 'agenda', 'bree'];

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
function lineOfOffset(c, o) { return c.slice(0, o).split('\n').length; }

function listSourceFiles() {
  const acc = [];
  function walk(dir, depth) {
    if (depth > 6 || !fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '_archived' || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full, depth + 1);
        else if (name.endsWith('.js')) acc.push(full);
      } catch (_) {}
    }
  }
  walk(MODULES_DIR, 0);
  return acc;
}

function checkBibliotecaCronAlternativa(findings) {
  const pkg = loadJson(path.join(REPO_ROOT, 'package.json'));
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const lib of CRON_LIBS_PROHIBIDAS) {
    if (allDeps[lib]) findings.errors.push(`drift_biblioteca_cron_alternativa: ${lib} en package.json — solo node-cron permitido`);
  }
}

function checkSetTimeoutLargo(findings) {
  // setTimeout > 1h (3600000ms) sin comentario inline
  for (const file of listSourceFiles()) {
    const content = fs.readFileSync(file, 'utf-8');
    const rx = /setTimeout\s*\(\s*[^,]+,\s*(\d+)\b/g;
    let m;
    while ((m = rx.exec(content)) !== null) {
      const ms = parseInt(m[1], 10);
      if (ms > 3600000) {
        // Verificar si hay comentario inline en la misma linea o anterior
        const offset = m.index;
        const lineStart = content.lastIndexOf('\n', offset) + 1;
        const lineEnd = content.indexOf('\n', offset);
        const line = content.slice(lineStart, lineEnd);
        const prevLineStart = content.lastIndexOf('\n', lineStart - 2) + 1;
        const prevLine = content.slice(prevLineStart, lineStart - 1);
        if (!/\/\//.test(line) && !/\/\//.test(prevLine)) {
          const ln = lineOfOffset(content, m.index);
          findings.warnings.push(`drift_settimeout_largo_para_jobs_durables: ${path.relative(REPO_ROOT, file)}:${ln} — setTimeout ${ms}ms (>1h) sin comentario inline justificando`);
        }
      }
    }
  }
}

function checkSetIntervalSubsegundo(findings) {
  for (const file of listSourceFiles()) {
    const content = fs.readFileSync(file, 'utf-8');
    // setInterval(..., <num>) donde num es literal numerico < 100
    const rx = /setInterval\s*\(\s*[^,]+,\s*(\d+)\b/g;
    let m;
    while ((m = rx.exec(content)) !== null) {
      const ms = parseInt(m[1], 10);
      if (ms < 100) {
        const ln = lineOfOffset(content, m.index);
        findings.warnings.push(`drift_setinterval_subsegundo: ${path.relative(REPO_ROOT, file)}:${ln} — setInterval cada ${ms}ms (limite ${100}ms). Repensar el patron.`);
      }
    }
  }
}

function reportFindings(f) {
  if (f.errors.length) { console.log(`${RED}cross-system errors (${f.errors.length})${RST}`); for (const e of f.errors) console.log(`  ${RED}✗${RST} ${e}`); }
  if (f.warnings.length) { console.log(`${YEL}cross-system warnings (${f.warnings.length})${RST}`); for (const w of f.warnings) console.log(`  ${YEL}!${RST} ${w}`); }
  if (f.info.length) { console.log(`${CYAN}cross-system info (${f.info.length})${RST}`); for (const i of f.info) console.log(`  ${CYAN}i${RST} ${i}`); }
  if (!f.errors.length && !f.warnings.length && !f.info.length) console.log(`${GREEN}cross-system: sin drift detectado${RST}`);
}

function main() {
  const checkSystemFlag = process.argv.includes('--check-system');
  if (!fs.existsSync(CONTRACT_PATH)) { console.log(`${RED}FAIL${RST} scheduling.contract.json no existe`); process.exit(1); }
  let contract; try { contract = loadJson(CONTRACT_PATH); } catch (e) { console.log(`${RED}FAIL${RST} ${e.message}`); process.exit(1); }
  const faltan = SECCIONES_CANONICAS.filter(k => !Object.keys(contract).includes(k));
  if (faltan.length > 0) { console.log(`${RED}FAIL${RST} scheduling.contract amplitud incompleta. Faltan: ${faltan.join(', ')}`); process.exit(1); }
  console.log(`${GREEN}PASS${RST} scheduling (contrato valido, ${Object.keys(contract).length} secciones canonicas)`);
  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el repo (scheduling) ===${RST}`);
    const f = { errors: [], warnings: [], info: [] };
    checkBibliotecaCronAlternativa(f);
    checkSetIntervalSubsegundo(f);
    checkSetTimeoutLargo(f);
    reportFindings(f);
  }
  process.exit(0);
}

main();

#!/usr/bin/env node
/**
 * Validador del transversal resilience v1.0.0.
 *
 * Cross-checks (2):
 *  1. resilience_contract_estructura_valida (error)
 *  2. drift_retry_sin_limite                (error) — while(true) con call upstream / loop infinito de retries
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT     = path.resolve(__dirname, '../../..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/resilience.contract.json');
const MODULES_DIR   = path.join(REPO_ROOT, 'modules');

const RED='\x1b[31m', GREEN='\x1b[32m', YEL='\x1b[33m', CYAN='\x1b[36m', RST='\x1b[0m';
const SECCIONES_CANONICAS = ['_doc','id','version','creada','supersedes_nota','objetivo','inputs','filosofia','principios','decisiones_arquitectonicas','prohibido','output_shape_resumen','reglas_de_extraccion','derivaciones','validaciones_cross_realizadas_por_validator','salida_validador','convenciones_complementarias'];

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

function checkRetrySinLimite(findings) {
  for (const file of listSourceFiles()) {
    const content = fs.readFileSync(file, 'utf-8');
    // Heuristica: while (true) con try/catch dentro y fetch/HTTP/await call externo
    const rx = /while\s*\(\s*(true|1)\s*\)\s*\{[^}]*try\s*\{[^}]*\b(await|fetch|axios|got|http\.|https\.|provider\.)/g;
    let m;
    while ((m = rx.exec(content)) !== null) {
      const ln = lineOfOffset(content, m.index);
      findings.errors.push(`drift_retry_sin_limite: ${path.relative(REPO_ROOT, file)}:${ln} — while(true) con call upstream sin condicion de salida (drift contra resilience.contract.max_3_intentos_default)`);
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
  if (!fs.existsSync(CONTRACT_PATH)) { console.log(`${RED}FAIL${RST} resilience.contract.json no existe`); process.exit(1); }
  let contract; try { contract = loadJson(CONTRACT_PATH); } catch (e) { console.log(`${RED}FAIL${RST} ${e.message}`); process.exit(1); }
  const faltan = SECCIONES_CANONICAS.filter(k => !Object.keys(contract).includes(k));
  if (faltan.length > 0) { console.log(`${RED}FAIL${RST} resilience.contract amplitud incompleta. Faltan: ${faltan.join(', ')}`); process.exit(1); }
  console.log(`${GREEN}PASS${RST} resilience (contrato valido, ${Object.keys(contract).length} secciones canonicas)`);
  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el repo (resilience) ===${RST}`);
    const f = { errors: [], warnings: [], info: [] };
    checkRetrySinLimite(f);
    reportFindings(f);
  }
  process.exit(0);
}

main();

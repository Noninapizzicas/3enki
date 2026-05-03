#!/usr/bin/env node
/**
 * Validador del transversal versionado v1.0.0.
 *
 * Cross-checks (3):
 *  1. versionado_contract_estructura_valida (error)
 *  2. drift_version_format_no_semver        (error) — version no MAJOR.MINOR.PATCH
 *  3. drift_supersedes_nota_no_actualizada  (info)  — heuristica: contratos con version > 1.0.0 sin supersedes_nota detallado
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT     = path.resolve(__dirname, '../../..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/versionado.contract.json');

const RED='\x1b[31m', GREEN='\x1b[32m', YEL='\x1b[33m', CYAN='\x1b[36m', RST='\x1b[0m';
const SECCIONES_CANONICAS = ['_doc','id','version','creada','supersedes_nota','objetivo','inputs','filosofia','principios','decisiones_arquitectonicas','prohibido','output_shape_resumen','reglas_de_extraccion','derivaciones','validaciones_cross_realizadas_por_validator','salida_validador','convenciones_complementarias'];

const SEMVER_PURO_RX = /^\d+\.\d+\.\d+$/;

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

function listVersioned() {
  const items = [];
  // Contratos
  const contractDirs = [
    'arquitectura/decisiones/_contratos',
    'arquitectura/convenciones/_contratos',
    'arquitectura/auditoria/_contratos'
  ];
  for (const d of contractDirs) {
    const full = path.join(REPO_ROOT, d);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) {
      if (f.endsWith('.contract.json')) items.push({ kind: 'contract', file: path.join(full, f) });
    }
  }
  // module.json de cada modulo
  const modDir = path.join(REPO_ROOT, 'modules');
  if (fs.existsSync(modDir)) {
    function walk(dir, depth) {
      if (depth > 4) return;
      for (const name of fs.readdirSync(dir)) {
        if (name === 'node_modules' || name === '_archived' || name.startsWith('.')) continue;
        const full = path.join(dir, name);
        try {
          const stat = fs.statSync(full);
          if (stat.isDirectory()) {
            const mj = path.join(full, 'module.json');
            if (fs.existsSync(mj)) items.push({ kind: 'module', file: mj });
            else walk(full, depth + 1);
          }
        } catch (_) {}
      }
    }
    walk(modDir, 0);
  }
  // package.json del repo
  const pkg = path.join(REPO_ROOT, 'package.json');
  if (fs.existsSync(pkg)) items.push({ kind: 'repo', file: pkg });
  return items;
}

function checkSemverFormat(findings) {
  for (const { kind, file } of listVersioned()) {
    let j; try { j = loadJson(file); } catch (_) { continue; }
    const v = j.version;
    if (typeof v !== 'string') {
      findings.warnings.push(`drift_version_format_no_semver: ${path.relative(REPO_ROOT, file)} — version no presente o no es string`);
      continue;
    }
    if (!SEMVER_PURO_RX.test(v)) {
      findings.errors.push(`drift_version_format_no_semver: ${path.relative(REPO_ROOT, file)} — version "${v}" no cumple MAJOR.MINOR.PATCH`);
    }
  }
}

function checkSupersedesNota(findings) {
  for (const { kind, file } of listVersioned()) {
    if (kind !== 'contract') continue;  // solo contratos requieren supersedes_nota
    let j; try { j = loadJson(file); } catch (_) { continue; }
    const v = j.version;
    if (typeof v !== 'string') continue;
    // Si version > 1.0.0 y supersedes_nota es trivial ("Primera version" o ausente), es heuristica de drift
    if (v !== '1.0.0' && (!j.supersedes_nota || /^Primera versi(o|ó)n\.?$/i.test(j.supersedes_nota))) {
      findings.info.push(`drift_supersedes_nota_no_actualizada: ${path.relative(REPO_ROOT, file)} — version ${v} pero supersedes_nota trivial`);
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
  if (!fs.existsSync(CONTRACT_PATH)) { console.log(`${RED}FAIL${RST} versionado.contract.json no existe`); process.exit(1); }
  let contract; try { contract = loadJson(CONTRACT_PATH); } catch (e) { console.log(`${RED}FAIL${RST} ${e.message}`); process.exit(1); }
  const faltan = SECCIONES_CANONICAS.filter(k => !Object.keys(contract).includes(k));
  if (faltan.length > 0) { console.log(`${RED}FAIL${RST} versionado.contract amplitud incompleta. Faltan: ${faltan.join(', ')}`); process.exit(1); }
  console.log(`${GREEN}PASS${RST} versionado (contrato valido, ${Object.keys(contract).length} secciones canonicas)`);

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el repo (versionado) ===${RST}`);
    const f = { errors: [], warnings: [], info: [] };
    checkSemverFormat(f);
    checkSupersedesNota(f);
    reportFindings(f);
  }
  process.exit(0);
}

main();

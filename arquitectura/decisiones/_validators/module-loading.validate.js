#!/usr/bin/env node
/**
 * Validador del transversal module-loading v1.0.0.
 *
 * Cross-checks (5):
 *  1. module_loading_contract_estructura_valida (error)
 *  2. drift_modulo_sin_module_json              (warning) — subdir en modules/ sin manifest
 *  3. drift_modulo_sin_index_js                 (error)   — module.json sin index.js
 *  4. drift_require_directo_entre_modulos       (error)   — require('../<otroModulo>/...')
 *  5. drift_dependency_referencia_inexistente   (error)   — dependencies referencia modulo que no existe
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT     = path.resolve(__dirname, '../../..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/module-loading.contract.json');
const MODULES_DIR   = path.join(REPO_ROOT, 'modules');

const RED='\x1b[31m', GREEN='\x1b[32m', YEL='\x1b[33m', CYAN='\x1b[36m', RST='\x1b[0m';
const SECCIONES_CANONICAS = ['_doc','id','version','creada','supersedes_nota','objetivo','inputs','filosofia','principios','decisiones_arquitectonicas','prohibido','output_shape_resumen','reglas_de_extraccion','derivaciones','validaciones_cross_realizadas_por_validator','salida_validador','convenciones_complementarias'];

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
function lineOfOffset(c, o) { return c.slice(0, o).split('\n').length; }

function listModulesDirsAtLevel(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => {
    if (name.startsWith('_') || name.startsWith('.')) return false;
    try { return fs.statSync(path.join(dir, name)).isDirectory(); } catch (_) { return false; }
  }).map(name => path.join(dir, name));
}

function listModuleManifests() {
  const result = [];
  function tryAsModule(dir) {
    const mj = path.join(dir, 'module.json');
    const ij = path.join(dir, 'index.js');
    if (fs.existsSync(mj)) {
      try {
        const manifest = loadJson(mj);
        result.push({ dir, manifest, hasIndex: fs.existsSync(ij) });
        return true;
      } catch (_) { return true; }
    }
    return false;
  }
  for (const sub of listModulesDirsAtLevel(MODULES_DIR)) {
    if (!tryAsModule(sub)) {
      // Maybe nested (pizzepos/<modulo>/)
      for (const sub2 of listModulesDirsAtLevel(sub)) {
        tryAsModule(sub2);
      }
    }
  }
  return result;
}

function checkSinModuleJson(findings) {
  // Subdirectorios sin module.json (excluyendo prefix _ y carpetas auxiliares)
  function inspect(dir, depth) {
    if (depth > 2) return;
    for (const sub of listModulesDirsAtLevel(dir)) {
      const mj = path.join(sub, 'module.json');
      if (fs.existsSync(mj)) continue; // es modulo OK
      // No tiene module.json — verificar si tiene subdirectorios que sean modulos
      const hasNestedModules = listModulesDirsAtLevel(sub).some(s => fs.existsSync(path.join(s, 'module.json')));
      if (!hasNestedModules && depth === 0) {
        findings.warnings.push(`drift_modulo_sin_module_json: ${path.relative(REPO_ROOT, sub)} parece directorio de modulo sin module.json (renombrar con prefijo _ si es auxiliar)`);
      }
      if (hasNestedModules && depth < 1) inspect(sub, depth + 1);
    }
  }
  inspect(MODULES_DIR, 0);
}

function checkSinIndexJs(findings) {
  for (const { dir, hasIndex } of listModuleManifests()) {
    if (!hasIndex) {
      findings.errors.push(`drift_modulo_sin_index_js: ${path.relative(REPO_ROOT, dir)} tiene module.json pero no index.js`);
    }
  }
}

function checkRequireDirectoEntreModulos(findings) {
  const moduleNames = listModuleManifests().map(m => path.basename(m.dir));
  for (const { dir, manifest } of listModuleManifests()) {
    const idxFile = path.join(dir, 'index.js');
    if (!fs.existsSync(idxFile)) continue;
    const content = fs.readFileSync(idxFile, 'utf-8');
    // require('../<modulo>/...') o require('../../modules/<modulo>/...')
    const rx = /require\s*\(\s*['"`](\.\.\/(?:[^'"`/]+\/)*[^'"`]+|\.\.\/\.\.\/modules\/[^'"`]+)['"`]\s*\)/g;
    let m;
    while ((m = rx.exec(content)) !== null) {
      const requiredPath = m[1];
      // Determinar si apunta a otro modulo del repo
      const resolved = path.resolve(dir, requiredPath);
      if (resolved.startsWith(MODULES_DIR) && !resolved.startsWith(dir)) {
        const ln = lineOfOffset(content, m.index);
        findings.errors.push(`drift_require_directo_entre_modulos: ${path.relative(REPO_ROOT, idxFile)}:${ln} — require('${requiredPath}') apunta a otro modulo del repo`);
      }
    }
  }
}

function checkDependencyReferenciaInexistente(findings) {
  const manifests = listModuleManifests();
  const moduleNames = new Set(manifests.map(m => m.manifest.name).filter(Boolean));
  for (const { dir, manifest } of manifests) {
    const deps = manifest.dependencies || [];
    if (!Array.isArray(deps)) continue;
    for (const dep of deps) {
      if (!moduleNames.has(dep)) {
        findings.errors.push(`drift_dependency_referencia_inexistente: ${path.relative(REPO_ROOT, dir)}/module.json declara dependency "${dep}" que no existe en modules/`);
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
  if (!fs.existsSync(CONTRACT_PATH)) { console.log(`${RED}FAIL${RST} module-loading.contract.json no existe`); process.exit(1); }
  let contract; try { contract = loadJson(CONTRACT_PATH); } catch (e) { console.log(`${RED}FAIL${RST} ${e.message}`); process.exit(1); }
  const faltan = SECCIONES_CANONICAS.filter(k => !Object.keys(contract).includes(k));
  if (faltan.length > 0) { console.log(`${RED}FAIL${RST} module-loading.contract amplitud incompleta. Faltan: ${faltan.join(', ')}`); process.exit(1); }
  console.log(`${GREEN}PASS${RST} module-loading (contrato valido, ${Object.keys(contract).length} secciones canonicas)`);
  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el repo (module-loading) ===${RST}`);
    const f = { errors: [], warnings: [], info: [] };
    checkSinModuleJson(f);
    checkSinIndexJs(f);
    checkRequireDirectoEntreModulos(f);
    checkDependencyReferenciaInexistente(f);
    reportFindings(f);
  }
  process.exit(0);
}

main();

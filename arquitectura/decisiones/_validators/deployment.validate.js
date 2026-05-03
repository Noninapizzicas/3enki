#!/usr/bin/env node
/**
 * Validador del transversal deployment v1.0.0.
 *
 * Cross-checks (4):
 *  1. deployment_contract_estructura_valida   (error)
 *  2. drift_entry_point_distinto              (error) — package.json scripts.start no es 'node index.js'
 *  3. drift_node_version_inferior_a_18        (error) — engines.node < 18
 *  4. drift_dockerfile_committed_obligatorio  (warning)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT     = path.resolve(__dirname, '../../..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/deployment.contract.json');

const RED='\x1b[31m', GREEN='\x1b[32m', YEL='\x1b[33m', CYAN='\x1b[36m', RST='\x1b[0m';
const SECCIONES_CANONICAS = ['_doc','id','version','creada','supersedes_nota','objetivo','inputs','filosofia','principios','decisiones_arquitectonicas','prohibido','output_shape_resumen','reglas_de_extraccion','derivaciones','validaciones_cross_realizadas_por_validator','salida_validador','convenciones_complementarias'];

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

function checkEntryPoint(findings) {
  const pkg = loadJson(path.join(REPO_ROOT, 'package.json'));
  if (pkg.scripts?.start !== 'node index.js') {
    findings.errors.push(`drift_entry_point_distinto: package.json.scripts.start es "${pkg.scripts?.start}" — debe ser "node index.js"`);
  }
}

function checkNodeVersion(findings) {
  const pkg = loadJson(path.join(REPO_ROOT, 'package.json'));
  const engines = pkg.engines?.node;
  if (!engines) {
    findings.warnings.push(`drift_node_version_inferior_a_18: package.json.engines.node no declarado`);
    return;
  }
  const m = engines.match(/(\d+)/);
  if (m && parseInt(m[1], 10) < 18) {
    findings.errors.push(`drift_node_version_inferior_a_18: package.json.engines.node="${engines}" — minimo canonico es 18`);
  }
}

function checkDockerfile(findings) {
  if (fs.existsSync(path.join(REPO_ROOT, 'Dockerfile'))) {
    findings.warnings.push(`drift_dockerfile_committed_obligatorio: Dockerfile presente en raiz — el sistema no se distribuye como imagen Docker (deployment.contract.no_docker_no_orquestador)`);
  }
}

function checkConfigExample(findings) {
  if (!fs.existsSync(path.join(REPO_ROOT, 'config.example.json'))) {
    findings.warnings.push(`config.example.json ausente en raiz`);
  }
}

function checkInstallScripts(findings) {
  for (const s of ['scripts/install-termux.sh', 'scripts/install-linux.sh']) {
    if (!fs.existsSync(path.join(REPO_ROOT, s))) {
      findings.info.push(`script de instalacion ${s} ausente — deployment.contract.contract requiere ambos`);
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
  if (!fs.existsSync(CONTRACT_PATH)) { console.log(`${RED}FAIL${RST} deployment.contract.json no existe`); process.exit(1); }
  let contract; try { contract = loadJson(CONTRACT_PATH); } catch (e) { console.log(`${RED}FAIL${RST} ${e.message}`); process.exit(1); }
  const faltan = SECCIONES_CANONICAS.filter(k => !Object.keys(contract).includes(k));
  if (faltan.length > 0) { console.log(`${RED}FAIL${RST} deployment.contract amplitud incompleta. Faltan: ${faltan.join(', ')}`); process.exit(1); }
  console.log(`${GREEN}PASS${RST} deployment (contrato valido, ${Object.keys(contract).length} secciones canonicas)`);
  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el repo (deployment) ===${RST}`);
    const f = { errors: [], warnings: [], info: [] };
    checkEntryPoint(f);
    checkNodeVersion(f);
    checkDockerfile(f);
    checkConfigExample(f);
    checkInstallScripts(f);
    reportFindings(f);
  }
  process.exit(0);
}

main();

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

function checkModuloArchivoLogPersistente(findings) {
  const MODULES_DIR = path.join(REPO_ROOT, 'modules');
  if (!fs.existsSync(MODULES_DIR)) return;
  function walk(dir, depth) {
    if (depth > 5 || !fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '_archived' || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full, depth + 1);
        else if (name.endsWith('.js')) {
          const content = fs.readFileSync(full, 'utf-8');
          if (/fs\.createWriteStream\s*\([^)]*['"`][^'"`]*\.log['"`]/.test(content)) {
            findings.warnings.push(`drift_modulo_archivo_log_persistente: ${path.relative(REPO_ROOT, full)} — fs.createWriteStream sobre archivo .log (logs deben ir a stdout/stderr)`);
          }
        }
      } catch (_) {}
    }
  }
  walk(MODULES_DIR, 0);
}

function checkDockerCompose(findings) {
  for (const f of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']) {
    if (fs.existsSync(path.join(REPO_ROOT, f))) {
      findings.warnings.push(`drift_dockerfile_o_docker_compose_obligatorio: ${f} presente en raiz`);
    }
  }
}

function checkSpawnDeOtroModulo(findings) {
  const MODULES_DIR = path.join(REPO_ROOT, 'modules');
  if (!fs.existsSync(MODULES_DIR)) return;
  function walk(dir, depth) {
    if (depth > 5 || !fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '_archived' || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full, depth + 1);
        else if (name.endsWith('.js')) {
          const content = fs.readFileSync(full, 'utf-8');
          // child_process.spawn|exec|fork con primer arg que apunte a modules/
          const rx = /(?:child_process\.|cp\.)\s*(?:spawn|exec|fork)\s*\(\s*['"`][^'"`]*\bmodules\//g;
          let m;
          while ((m = rx.exec(content)) !== null) {
            const ln = content.slice(0, m.index).split('\n').length;
            findings.errors.push(`drift_modulo_spawn_de_otro_modulo: ${path.relative(REPO_ROOT, full)}:${ln} — child_process spawn de otro modulo (in-process via bus, no procesos separados)`);
          }
        }
      } catch (_) {}
    }
  }
  walk(MODULES_DIR, 0);
}

function checkSecretEnConfigJson(findings) {
  const cfg = path.join(REPO_ROOT, 'config.json');
  if (!fs.existsSync(cfg)) return;
  const content = fs.readFileSync(cfg, 'utf-8');
  const HARDCODED_KEYS = [
    /\bsk-[A-Za-z0-9]{32,}\b/,
    /\bsk-ant-api[0-9]{2}-[A-Za-z0-9_-]{40,}\b/,
    /\bAKIA[A-Z0-9]{16}\b/,
    /\bghp_[A-Za-z0-9]{36,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{50,}\b/
  ];
  for (const rx of HARDCODED_KEYS) {
    if (rx.test(content)) {
      findings.errors.push(`drift_secret_en_config_json_committed: config.json contiene patron de API key hardcoded`);
      break;
    }
  }
}

function checkInstallScriptsEjecutables(findings) {
  for (const s of ['scripts/install-termux.sh', 'scripts/install-linux.sh']) {
    const full = path.join(REPO_ROOT, s);
    if (!fs.existsSync(full)) continue;
    try {
      const stat = fs.statSync(full);
      if (!(stat.mode & 0o100)) {
        findings.info.push(`drift_install_script_no_ejecutable: ${s} sin bit ejecutable (chmod +x necesario para usuarios)`);
      }
    } catch (_) {}
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
    checkModuloArchivoLogPersistente(f);
    checkDockerCompose(f);
    checkSpawnDeOtroModulo(f);
    checkSecretEnConfigJson(f);
    checkInstallScriptsEjecutables(f);
    reportFindings(f);
  }
  process.exit(0);
}

main();

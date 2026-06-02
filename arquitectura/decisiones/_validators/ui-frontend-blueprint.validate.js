#!/usr/bin/env node
/**
 * Validador del contrato ui-frontend-blueprint v1.0.0.
 *
 * Uso:
 *   node ui-frontend-blueprint.validate.js                # valida contrato JSON + amplitud canonica
 *   node ui-frontend-blueprint.validate.js --check-system # adicional: cross-checks contra el repo
 *
 * Cross-checks (5):
 *   C1 blueprint_con_target_page_id_tiene_ruta_sveltekit       (warning)
 *      Cada blueprint con target_page_id declarado debe tener
 *      frontend/src/routes/[project_id]/<target_page_id>/+page.svelte.
 *      Excepcion: headless declarados.
 *
 *   C2 blueprint_con_target_page_id_tiene_modulo_frontend      (warning)
 *      Cada blueprint con target_page_id debe tener al menos un manifest
 *      en frontend/src/lib/modules/<X>/manifest.json cuyo routes incluya
 *      '/<target_page_id>' o cuyo id sea '<target_page_id>'.
 *      Excepcion: headless declarados.
 *
 *   C3 modulo_frontend_tiene_estructura_canonica               (error)
 *      Cada directorio en frontend/src/lib/modules/<X>/ debe contener
 *      manifest.json + index.ts + al menos un .svelte. Excepcion: archivos
 *      *.archived o *.legacy.
 *
 *   C4 manifest_frontend_declara_un_boton_workbar              (info)
 *      Cada manifest con zone='work-bar' o 'barra_modulos' declara UN solo
 *      boton (icon + label + order como campos primitivos, no arrays).
 *
 *   C5 blueprints_headless_no_tienen_modulo_frontend           (warning)
 *      Blueprints headless (sin target_page_id, ubicados en
 *      _agentes-blueprint/, o con id matchea 'agente-*') NO deben tener
 *      modulo frontend ni ruta SvelteKit asociados.
 *
 * Contrato: arquitectura/decisiones/_contratos/ui-frontend-blueprint.contract.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT             = path.resolve(__dirname, '../../..');
const CONTRACT_PATH         = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/ui-frontend-blueprint.contract.json');
const MODULES_DIR           = path.join(REPO_ROOT, 'modules');
const FRONTEND_ROUTES_DIR   = path.join(REPO_ROOT, 'frontend/src/routes/[project_id]');
const FRONTEND_LIB_MODULES  = path.join(REPO_ROOT, 'frontend/src/lib/modules');

const RED='\x1b[31m', GREEN='\x1b[32m', YEL='\x1b[33m', CYAN='\x1b[36m', RST='\x1b[0m';

const SECCIONES_CANONICAS = [
  '_doc', 'id', 'version', 'creada', 'supersedes_nota',
  'deriva_de', 'objetivo', 'inputs', 'filosofia', 'principios',
  'decisiones_arquitectonicas', 'prohibido', 'output_shape_resumen',
  'reglas_de_extraccion', 'derivaciones',
  'validaciones_cross_realizadas_por_validator', 'salida_validador',
  'convenciones_complementarias'
];

const ZONES_WORKBAR = new Set(['work-bar', 'barra_modulos']);

// ============================================================
// Helpers
// ============================================================

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function listDirs(dir) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
}

function listFiles(dir) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => e.name);
}

// Recorre modules/ recursivamente hasta encontrar module.json (skip _legacy y oculto)
function findAllModuleJsons(rootDir) {
  const found = [];
  function walk(dir) {
    if (!exists(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === '_legacy' || entry.name === 'node_modules' || entry.name === 'tests') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Si este directorio tiene module.json, lo recogemos pero seguimos bajando por si hay sub-modulos
        const candidate = path.join(full, 'module.json');
        if (exists(candidate)) {
          found.push(candidate);
        }
        walk(full);
      }
    }
  }
  walk(rootDir);
  return found;
}

// ============================================================
// Identificacion de blueprints y modulos frontend
// ============================================================

function findBlueprints() {
  const blueprints = [];
  for (const moduleJsonPath of findAllModuleJsons(MODULES_DIR)) {
    let manifest;
    try { manifest = loadJson(moduleJsonPath); } catch { continue; }

    if (!manifest.blueprint_driven) continue;

    const modulePath = path.dirname(moduleJsonPath);
    const slug       = manifest.name || path.basename(modulePath);
    const inAgentes  = modulePath.includes(path.sep + '_agentes-blueprint' + path.sep);
    const idAgente   = typeof slug === 'string' && slug.startsWith('agente-');
    const isHeadless = inAgentes || idAgente || !manifest.target_page_id;

    blueprints.push({
      slug,
      modulePath: path.relative(REPO_ROOT, modulePath),
      moduleJsonRel: path.relative(REPO_ROOT, moduleJsonPath),
      targetPageId: manifest.target_page_id || null,
      isHeadless
    });
  }
  return blueprints;
}

function findFrontendModules() {
  const modules = [];
  if (!exists(FRONTEND_LIB_MODULES)) return modules;

  for (const dirName of listDirs(FRONTEND_LIB_MODULES)) {
    const dirPath = path.join(FRONTEND_LIB_MODULES, dirName);
    const files   = listFiles(dirPath);

    // Detectar si el modulo esta archivado: si NO hay manifest.json activo pero hay manifest.json.archived
    const hasActiveManifest   = files.includes('manifest.json');
    const hasArchivedManifest = files.some(f => f === 'manifest.json.archived' || f.endsWith('.archived'));
    const hasIndex            = files.includes('index.ts') || files.includes('index.js');
    const svelteFiles         = files.filter(f => f.endsWith('.svelte'));

    let manifest = null;
    if (hasActiveManifest) {
      try { manifest = loadJson(path.join(dirPath, 'manifest.json')); } catch { /* ignore */ }
    }

    modules.push({
      slug: dirName,
      dirPath: path.relative(REPO_ROOT, dirPath),
      manifestRel: hasActiveManifest ? path.relative(REPO_ROOT, path.join(dirPath, 'manifest.json')) : null,
      hasActiveManifest,
      isArchived: !hasActiveManifest && hasArchivedManifest,
      hasIndex,
      svelteFiles,
      manifest
    });
  }
  return modules;
}

// ============================================================
// Schema validation del propio contrato
// ============================================================

function validateContractStructure(findings) {
  let contract;
  try {
    contract = loadJson(CONTRACT_PATH);
  } catch (err) {
    findings.push({ sev: 'error', id: 'ui_frontend_blueprint_contract_no_parseable', msg: `${path.relative(REPO_ROOT, CONTRACT_PATH)}: ${err.message}` });
    return false;
  }

  for (const seccion of SECCIONES_CANONICAS) {
    if (!(seccion in contract)) {
      findings.push({ sev: 'error', id: 'ui_frontend_blueprint_contract_seccion_faltante', msg: `${path.relative(REPO_ROOT, CONTRACT_PATH)}: falta seccion '${seccion}'` });
    }
  }

  if (contract.id !== 'ui-frontend-blueprint') {
    findings.push({ sev: 'error', id: 'ui_frontend_blueprint_contract_id_incorrecto', msg: `id debe ser 'ui-frontend-blueprint' (encontrado: '${contract.id}')` });
  }

  if (!Array.isArray(contract.principios) || contract.principios.length === 0) {
    findings.push({ sev: 'error', id: 'ui_frontend_blueprint_contract_principios_vacios', msg: 'principios[] debe tener al menos 1 elemento' });
  }

  return findings.filter(f => f.sev === 'error').length === 0;
}

// ============================================================
// Cross-checks contra el repo
// ============================================================

function checkC1_routesveltekit(blueprints, findings) {
  for (const bp of blueprints) {
    if (bp.isHeadless) continue;
    const expected = path.join(FRONTEND_ROUTES_DIR, bp.targetPageId, '+page.svelte');
    if (!exists(expected)) {
      findings.push({
        sev: 'warning',
        id: 'C1_blueprint_con_target_page_id_tiene_ruta_sveltekit',
        msg: `${bp.moduleJsonRel}: target_page_id='${bp.targetPageId}' pero no existe ${path.relative(REPO_ROOT, expected)}`
      });
    }
  }
}

function checkC2_modulofrontend(blueprints, frontendModules, findings) {
  for (const bp of blueprints) {
    if (bp.isHeadless) continue;

    const targetRoute = `/${bp.targetPageId}`;
    const match = frontendModules.find(fm => {
      if (!fm.manifest) return false;
      if (fm.manifest.id === bp.targetPageId) return true;
      const routes = Array.isArray(fm.manifest.routes) ? fm.manifest.routes : [];
      return routes.includes(targetRoute);
    });

    if (!match) {
      findings.push({
        sev: 'warning',
        id: 'C2_blueprint_con_target_page_id_tiene_modulo_frontend',
        msg: `${bp.moduleJsonRel}: target_page_id='${bp.targetPageId}' pero ningun manifest en frontend/src/lib/modules/ declara routes=['/${bp.targetPageId}'] ni id='${bp.targetPageId}'`
      });
    }
  }
}

function checkC3_estructura(frontendModules, findings) {
  for (const fm of frontendModules) {
    if (fm.isArchived) continue;

    // C3 solo aplica a modulos REGISTRADOS (con manifest activo).
    // Directorios sin manifest activo se asumen librerias internas o staging.
    if (!fm.hasActiveManifest) continue;

    if (!fm.hasIndex) {
      findings.push({
        sev: 'error',
        id: 'C3_modulo_frontend_tiene_estructura_canonica',
        msg: `${fm.dirPath}: tiene manifest.json pero falta index.ts (o index.js)`
      });
    }
    if (fm.svelteFiles.length === 0) {
      findings.push({
        sev: 'error',
        id: 'C3_modulo_frontend_tiene_estructura_canonica',
        msg: `${fm.dirPath}: tiene manifest.json pero no contiene ningun archivo .svelte`
      });
    }
  }
}

function checkC4_unboton(frontendModules, findings) {
  for (const fm of frontendModules) {
    if (!fm.manifest) continue;
    if (!ZONES_WORKBAR.has(fm.manifest.zone)) continue;

    const tieneIcon  = typeof fm.manifest.icon === 'string';
    const tieneLabel = typeof fm.manifest.label === 'string';
    const tieneOrder = typeof fm.manifest.order === 'number';

    if (!tieneIcon || !tieneLabel || !tieneOrder) {
      findings.push({
        sev: 'info',
        id: 'C4_manifest_frontend_declara_un_boton_workbar',
        msg: `${fm.manifestRel}: manifest con zone='${fm.manifest.zone}' deberia tener icon (string), label (string), order (number)`
      });
    }

    if (Array.isArray(fm.manifest.buttons) || Array.isArray(fm.manifest.panels) && fm.manifest.panels.length > 1) {
      findings.push({
        sev: 'info',
        id: 'C4_manifest_frontend_declara_un_boton_workbar',
        msg: `${fm.manifestRel}: declara multiples botones/paneles en un solo manifest --revision manual: si son varios recursos, separar en N modulos frontend`
      });
    }
  }
}

function checkC5_headless_sin_ui(blueprints, frontendModules, findings) {
  for (const bp of blueprints) {
    if (!bp.isHeadless) continue;

    // Si es headless por 'no tiene target_page_id', no podemos cruzar contra rutas
    // (no hay nombre canonico). Solo cruzamos contra modulos frontend con id matching slug.
    const moduleMatch = frontendModules.find(fm => fm.slug === bp.slug || (fm.manifest && fm.manifest.id === bp.slug));
    if (moduleMatch && !moduleMatch.isArchived) {
      findings.push({
        sev: 'warning',
        id: 'C5_blueprints_headless_no_tienen_modulo_frontend',
        msg: `${bp.moduleJsonRel}: declarado headless (en _agentes-blueprint/, agente-*, o sin target_page_id) pero existe modulo frontend ${moduleMatch.dirPath} --inconsistencia`
      });
    }

    // Si tiene target_page_id (raro en headless pero posible), cruzar tambien contra ruta
    if (bp.targetPageId) {
      const ruta = path.join(FRONTEND_ROUTES_DIR, bp.targetPageId, '+page.svelte');
      if (exists(ruta)) {
        findings.push({
          sev: 'warning',
          id: 'C5_blueprints_headless_no_tienen_modulo_frontend',
          msg: `${bp.moduleJsonRel}: declarado headless pero existe ruta ${path.relative(REPO_ROOT, ruta)} --inconsistencia`
        });
      }
    }
  }
}

// ============================================================
// Output
// ============================================================

// Simbolos canonicos del parser de validate-all.js:
//   error   -> ✗
//   warning -> !
//   info    -> i
function symFor(sev) {
  if (sev === 'error')   return '✗';
  if (sev === 'warning') return '!';
  return 'i';
}

function colorFor(sev) {
  if (sev === 'error')   return RED;
  if (sev === 'warning') return YEL;
  return CYAN;
}

function printFindings(findings) {
  if (findings.length === 0) {
    console.log(`${GREEN}[ui-frontend-blueprint] PASS sin findings${RST}`);
    return;
  }
  for (const f of findings) {
    const color = colorFor(f.sev);
    const sym   = symFor(f.sev);
    console.log(`  ${color}${sym}${RST} ${f.id}: ${f.msg}`);
  }
  const errors   = findings.filter(f => f.sev === 'error').length;
  const warnings = findings.filter(f => f.sev === 'warning').length;
  const infos    = findings.filter(f => f.sev === 'info').length;
  console.log(`${CYAN}[ui-frontend-blueprint]${RST} resumen: ${errors} errors, ${warnings} warnings, ${infos} infos`);
}

// ============================================================
// Main
// ============================================================

function main() {
  const checkSystem = process.argv.includes('--check-system');
  const findings = [];

  const schemaOk = validateContractStructure(findings);
  if (!schemaOk) {
    printFindings(findings);
    process.exit(1);
  }

  if (checkSystem) {
    const blueprints      = findBlueprints();
    const frontendModules = findFrontendModules();

    checkC1_routesveltekit(blueprints, findings);
    checkC2_modulofrontend(blueprints, frontendModules, findings);
    checkC3_estructura(frontendModules, findings);
    checkC4_unboton(frontendModules, findings);
    checkC5_headless_sin_ui(blueprints, frontendModules, findings);
  }

  printFindings(findings);

  const hasErrorOrWarning = findings.some(f => f.sev === 'error' || f.sev === 'warning');
  process.exit(hasErrorOrWarning ? 1 : 0);
}

main();

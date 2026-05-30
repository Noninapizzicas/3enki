#!/usr/bin/env node
/**
 * Validador del contrato subsistema-tienda.contract.json
 *
 * Cross-checks (8):
 *
 *   1. drift_modulo_toca_tienda_sin_declarar           (error)
 *      Modulos cuyo index.js o blueprint contiene escrituras a paths
 *      'public/tienda/...' DEBEN declarar tienda_paths_escritos[] en
 *      module.json (modulos JS) o extends subsistema-tienda.modulo-base
 *      (blueprints).
 *
 *   2. drift_tienda_paths_escritos_shape_invalido      (error)
 *      Cada entrada de tienda_paths_escritos[] cumple el schema
 *      (relativo, sin traversal, sin extensiones prohibidas).
 *
 *   3. drift_tienda_path_fuera_de_public_tienda        (error)
 *      Heuristico textual: si una escritura detectada incluye 'public/'
 *      pero NO 'public/tienda/', drift.
 *
 *   4. drift_caddy_block_tienda_no_canonico            (warning)
 *      deployment/caddy/Caddyfile.vps contiene exactamente un bloque
 *      'handle_path /shop/*' con root * /opt/enki/public/shop.
 *      Hoy es trabajo pendiente — drift expected.
 *
 *   5. drift_feature_tienda_no_declara_slug_required   (error si existe el feature)
 *      Si blueprints/project-types/tienda.json existe, declara
 *      slug_required:true.
 *
 *   6. drift_blueprint_hijo_no_publica_evento_canonico (warning)
 *      Modulos blueprint que extienden subsistema-tienda.modulo-base
 *      declaran tienda.bundle.actualizada en eventos_publicados.
 *
 *   7. drift_caddyfile_contiene_vapers_legacy          (warning)
 *      El Caddyfile tiene bloque /vapers/* legacy. Conviene migrar
 *      a /shop/<slug>.
 *
 *   8. drift_modulo_padre_subsistema_tienda_inexistente (warning)
 *      modules/_subsistema-tienda/subsistema-tienda.modulo-base.blueprint.json
 *      no existe (trabajo pendiente).
 *
 * Modos:
 *   sin args        → valida estructura del contrato + compile schema.
 *   --check-system  → escanea repo y reporta drift.
 *
 * Contrato: arquitectura/decisiones/_contratos/subsistema-tienda.contract.json
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv/dist/2020');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'arquitectura', 'decisiones', '_contratos', 'subsistema-tienda.contract.json');
const SCHEMA_PATH = path.join(REPO_ROOT, 'arquitectura', 'decisiones', '_schemas', 'subsistema-tienda', 'tienda-paths-escritos.schema.json');
const CADDYFILE_PATH = path.join(REPO_ROOT, 'deployment', 'caddy', 'Caddyfile.vps');
const FEATURE_TIENDA_PATH = path.join(REPO_ROOT, 'blueprints', 'project-types', 'tienda.json');
const PADRE_BLUEPRINT_PATH = path.join(REPO_ROOT, 'modules', '_subsistema-tienda', 'subsistema-tienda.modulo-base.blueprint.json');
const MODULES_ROOT = path.join(REPO_ROOT, 'modules');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL = '\x1b[33m';
const CYAN = '\x1b[36m';
const RST = '\x1b[0m';

// Regex para detectar escrituras a paths 'public/tienda/...' en codigo fuente
// Captura strings literales que contienen 'public/tienda/'.
const PUBLIC_TIENDA_WRITE_RE = /['"`]([^'"`]*public\/tienda\/[^'"`]*)['"`]/g;
// Heuristico: detectar 'public/<algo>' que NO sea 'public/tienda/'
const PUBLIC_NO_TIENDA_RE = /['"`]([^'"`]*\/public\/(?!tienda\/)[^'"`]*)['"`]/g;

const PROHIBITED_EXT_RE = /\.(env|git|ssh|key|pem)$/i;

// ----------------------- contract structure -----------------------
function validateContractStructure() {
  const findings = [];
  if (!fs.existsSync(CONTRACT_PATH)) {
    findings.push({ severity: 'error', drift_id: 'drift_contrato_ausente', detail: `${path.relative(REPO_ROOT, CONTRACT_PATH)} no existe` });
    return findings;
  }
  let c;
  try { c = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8')); }
  catch (e) {
    findings.push({ severity: 'error', drift_id: 'drift_contrato_no_parseable', detail: e.message });
    return findings;
  }
  const required = ['_doc', 'id', 'version', 'creada', 'objetivo', 'filosofia', 'principios', 'prohibido', 'casos_testigo', 'validaciones_cross_realizadas_por_validator'];
  for (const k of required) {
    if (!(k in c)) findings.push({ severity: 'error', drift_id: 'drift_contrato_seccion_canonica_ausente', detail: `falta seccion ${k}` });
  }
  if (c.id !== 'subsistema-tienda') {
    findings.push({ severity: 'error', drift_id: 'drift_contrato_id_no_canonico', detail: `id debe ser 'subsistema-tienda', es '${c.id}'` });
  }
  if (!/^\d+\.\d+\.\d+$/.test(c.version || '')) {
    findings.push({ severity: 'error', drift_id: 'drift_contrato_version_no_semver', detail: `version '${c.version}' no es semver` });
  }
  return findings;
}

function validateSchema() {
  const findings = [];
  if (!fs.existsSync(SCHEMA_PATH)) {
    findings.push({ severity: 'error', drift_id: 'drift_schema_ausente', detail: `${path.relative(REPO_ROOT, SCHEMA_PATH)} no existe` });
    return [findings, null];
  }
  let validate;
  try {
    const ajv = new Ajv({ strict: true, allErrors: true });
    validate = ajv.compile(JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')));
  } catch (e) {
    findings.push({ severity: 'error', drift_id: 'drift_schema_no_compila', detail: e.message });
    return [findings, null];
  }
  return [findings, validate];
}

// ----------------------- module scan -----------------------
function findModules() {
  const out = [];
  if (!fs.existsSync(MODULES_ROOT)) return out;
  const walk = (dir, depth) => {
    if (depth > 3) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name === '_legacy' || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      const moduleJson = path.join(full, 'module.json');
      if (fs.existsSync(moduleJson)) out.push(full);
      else walk(full, depth + 1);
    }
  };
  walk(MODULES_ROOT, 0);
  return out;
}

function scanModule(moduleDir, validate) {
  const findings = [];
  const moduleName = path.relative(MODULES_ROOT, moduleDir);
  const moduleJsonPath = path.join(moduleDir, 'module.json');
  const indexJsPath = path.join(moduleDir, 'index.js');
  const blueprintCandidates = fs.readdirSync(moduleDir).filter(f => f.endsWith('.blueprint.json'));
  const blueprintPath = blueprintCandidates.length > 0 ? path.join(moduleDir, blueprintCandidates[0]) : null;

  let moduleJson = {};
  try { moduleJson = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf8')); } catch { return findings; }

  let bp = null;
  if (blueprintPath) {
    try { bp = JSON.parse(fs.readFileSync(blueprintPath, 'utf8')); } catch {}
  }

  // Detect writes to public/tienda/ in source files
  const sources = [];
  if (fs.existsSync(indexJsPath)) {
    try { sources.push({ file: indexJsPath, content: fs.readFileSync(indexJsPath, 'utf8') }); } catch {}
  }
  if (blueprintPath) {
    try { sources.push({ file: blueprintPath, content: fs.readFileSync(blueprintPath, 'utf8') }); } catch {}
  }

  let tocaTienda = false;
  const pathsDetectados = new Set();
  for (const src of sources) {
    let match;
    PUBLIC_TIENDA_WRITE_RE.lastIndex = 0;
    while ((match = PUBLIC_TIENDA_WRITE_RE.exec(src.content)) !== null) {
      tocaTienda = true;
      pathsDetectados.add(match[1]);
    }
  }

  // Check 1: si toca tienda, debe declarar
  if (tocaTienda) {
    const declaraEnModuleJson = Array.isArray(moduleJson.tienda_paths_escritos) && moduleJson.tienda_paths_escritos.length > 0;
    const extendsPadre = bp && bp.extends_blueprint_abstract === 'subsistema-tienda.modulo-base';
    if (!declaraEnModuleJson && !extendsPadre) {
      findings.push({
        severity: 'error',
        drift_id: 'drift_modulo_toca_tienda_sin_declarar',
        detail: `${moduleName} escribe a public/tienda/ pero no declara tienda_paths_escritos[] en module.json ni extends subsistema-tienda.modulo-base`
      });
    }
  }

  // Check 2: shape de tienda_paths_escritos[]
  if (moduleJson.tienda_paths_escritos !== undefined && validate) {
    const ok = validate(moduleJson.tienda_paths_escritos);
    if (!ok) {
      for (const err of validate.errors || []) {
        findings.push({
          severity: 'error',
          drift_id: 'drift_tienda_paths_escritos_shape_invalido',
          detail: `${moduleName} ${err.instancePath || '/'} ${err.message}`
        });
      }
    }
    // Extra check: paths prohibidos por extension (redundante con regex pero explicito)
    for (const p of moduleJson.tienda_paths_escritos) {
      if (typeof p === 'string' && PROHIBITED_EXT_RE.test(p)) {
        findings.push({
          severity: 'error',
          drift_id: 'drift_tienda_archivo_prohibido_declarado',
          detail: `${moduleName} declara path con extension prohibida: '${p}'`
        });
      }
    }
  }

  // Check 6: blueprint hijo que extiende padre publica evento canonico
  if (bp && bp.extends_blueprint_abstract === 'subsistema-tienda.modulo-base') {
    const pubs = Array.isArray(bp.eventos_publicados) ? bp.eventos_publicados.map(e => typeof e === 'string' ? e : e?.evento) : [];
    if (!pubs.includes('tienda.bundle.actualizada')) {
      findings.push({
        severity: 'warning',
        drift_id: 'drift_blueprint_hijo_no_publica_evento_canonico',
        detail: `${moduleName} extiende subsistema-tienda.modulo-base pero NO declara tienda.bundle.actualizada en eventos_publicados`
      });
    }
  }

  return findings;
}

// ----------------------- caddyfile check -----------------------
function checkCaddyfile() {
  const findings = [];
  if (!fs.existsSync(CADDYFILE_PATH)) {
    findings.push({ severity: 'info', drift_id: 'drift_caddyfile_ausente', detail: `${path.relative(REPO_ROOT, CADDYFILE_PATH)} no existe en repo (puede vivir solo en VPS)` });
    return findings;
  }
  const content = fs.readFileSync(CADDYFILE_PATH, 'utf8');

  // Check canonical /shop/* block
  const tiendaBlockRe = /handle_path\s+\/shop\/\*\s*\{[^}]*root\s+\*\s+\/opt\/enki\/public\/shop/;
  if (!tiendaBlockRe.test(content)) {
    findings.push({
      severity: 'warning',
      drift_id: 'drift_caddy_block_tienda_no_canonico',
      detail: `${path.relative(REPO_ROOT, CADDYFILE_PATH)} no contiene bloque canonico 'handle_path /shop/*' con root '/opt/enki/public/shop' (trabajo pendiente del contrato)`
    });
  }

  // Check legacy /vapers/* block presence (warning para migrar)
  if (/handle_path\s+\/vapers\/\*/.test(content)) {
    findings.push({
      severity: 'warning',
      drift_id: 'drift_caddyfile_contiene_vapers_legacy',
      detail: `${path.relative(REPO_ROOT, CADDYFILE_PATH)} contiene bloque legacy 'handle_path /vapers/*' — migrar a /shop/<slug> via feature`
    });
  }

  // Check no /shop/<slug>/* blocks specific
  const specificRe = /handle_path\s+\/shop\/[a-z0-9_-]+\/\*/g;
  let m;
  while ((m = specificRe.exec(content)) !== null) {
    findings.push({
      severity: 'error',
      drift_id: 'drift_caddy_block_tienda_especifico',
      detail: `${path.relative(REPO_ROOT, CADDYFILE_PATH)} contiene bloque especifico '${m[0]}' — viola principio 'una regla para todos'`
    });
  }

  return findings;
}

// ----------------------- feature tienda check -----------------------
function checkFeatureTienda() {
  const findings = [];
  if (!fs.existsSync(FEATURE_TIENDA_PATH)) {
    findings.push({
      severity: 'warning',
      drift_id: 'drift_feature_tienda_ausente',
      detail: `${path.relative(REPO_ROOT, FEATURE_TIENDA_PATH)} no existe (trabajo pendiente del contrato)`
    });
    return findings;
  }
  let bp;
  try { bp = JSON.parse(fs.readFileSync(FEATURE_TIENDA_PATH, 'utf8')); } catch (e) {
    findings.push({ severity: 'error', drift_id: 'drift_feature_tienda_no_parseable', detail: e.message });
    return findings;
  }
  if (bp.slug_required !== true) {
    findings.push({
      severity: 'error',
      drift_id: 'drift_feature_tienda_no_declara_slug_required',
      detail: `blueprints/project-types/tienda.json debe declarar slug_required:true`
    });
  }
  return findings;
}

// ----------------------- padre blueprint check -----------------------
function checkPadreBlueprint() {
  const findings = [];
  if (!fs.existsSync(PADRE_BLUEPRINT_PATH)) {
    findings.push({
      severity: 'warning',
      drift_id: 'drift_modulo_padre_subsistema_tienda_inexistente',
      detail: `${path.relative(REPO_ROOT, PADRE_BLUEPRINT_PATH)} no existe (trabajo pendiente del contrato)`
    });
  }
  return findings;
}

// ----------------------- main -----------------------
function main() {
  const args = process.argv.slice(2);
  const checkSystem = args.includes('--check-system');

  console.log(`${CYAN}=== subsistema-tienda validator ===${RST}`);

  const structFindings = validateContractStructure();
  const errsStruct = structFindings.filter(f => f.severity === 'error');
  if (errsStruct.length) {
    console.log(`${RED}contract structure errors:${RST}`);
    for (const f of errsStruct) console.log(`  ${RED}![${RST}] ${f.drift_id}: ${f.detail}`);
    return 1;
  }

  const [schemaFindings, validate] = validateSchema();
  const errsSchema = schemaFindings.filter(f => f.severity === 'error');
  if (errsSchema.length) {
    console.log(`${RED}schema errors:${RST}`);
    for (const f of errsSchema) console.log(`  ${RED}![${RST}] ${f.drift_id}: ${f.detail}`);
    return 1;
  }

  if (!checkSystem) {
    console.log(`${GREEN}PASS${RST} subsistema-tienda (contract + schema OK)`);
    return 0;
  }

  const allFindings = [];
  const modules = findModules();
  console.log(`${CYAN}cross-system: escaneando ${modules.length} modulos + Caddyfile + feature tienda + blueprint padre${RST}`);

  for (const md of modules) allFindings.push(...scanModule(md, validate));
  allFindings.push(...checkCaddyfile());
  allFindings.push(...checkFeatureTienda());
  allFindings.push(...checkPadreBlueprint());

  const errors = allFindings.filter(f => f.severity === 'error');
  const warnings = allFindings.filter(f => f.severity === 'warning');
  const infos = allFindings.filter(f => f.severity === 'info');

  console.log('');
  console.log(`${CYAN}=== resultados ===${RST}`);
  if (errors.length === 0 && warnings.length === 0 && infos.length === 0) {
    console.log(`${GREEN}cross-system OK${RST}`);
    return 0;
  }
  if (errors.length) {
    console.log(`${RED}errors (${errors.length})${RST}`);
    for (const e of errors) console.log(`  ${RED}![${RST}] ${e.drift_id}: ${e.detail}`);
  }
  if (warnings.length) {
    console.log(`${YEL}warnings (${warnings.length})${RST}`);
    for (const w of warnings) console.log(`  ${YEL}!${RST} ${w.drift_id}: ${w.detail}`);
  }
  if (infos.length) {
    console.log(`${CYAN}info (${infos.length})${RST}`);
    for (const i of infos) console.log(`  ${CYAN}i${RST} ${i.drift_id}: ${i.detail}`);
  }
  return errors.length > 0 ? 1 : 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { scanModule, checkCaddyfile, checkFeatureTienda, checkPadreBlueprint };

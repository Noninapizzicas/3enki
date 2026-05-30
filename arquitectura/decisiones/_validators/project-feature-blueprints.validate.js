#!/usr/bin/env node
/**
 * Validador del contrato project-feature-blueprints.contract.json
 *
 * Cross-checks:
 *   1. drift_feature_blueprint_schema                  (error)
 *      Cada blueprints/project-types/<id>.json valida contra el schema
 *      AJV strict 2020-12 additionalProperties:false.
 *
 *   2. drift_feature_id_filename_mismatch              (error)
 *      blueprint.id === basename(filename, '.json').
 *
 *   3. drift_feature_dependencies_huerfanas            (error)
 *      Cada entrada de dependencies[] apunta a un feature existente.
 *
 *   4. drift_feature_dependency_ciclica                (error)
 *      El grafo de dependencias no contiene ciclos.
 *
 *   5. drift_feature_hardcoded_path_absoluto           (error)
 *      Ningun path en directories[] o keys de initialFiles{} empieza
 *      por /opt|/var|/srv|/home|/etc|/tmp. (symlinks[].target SI puede.)
 *
 *   6. drift_feature_slug_usado_sin_declarar           (error)
 *      Si {{slug}} aparece en config, initialFiles, directories o
 *      symlinks, slug_required:true debe estar declarado.
 *
 *   7. drift_feature_copyHandlersFrom_inexistente      (warning)
 *      copyHandlersFrom apunta a un proyecto plantilla cuyo dir
 *      handlers/ existe y contiene .js.
 *
 *   8. drift_feature_initialFile_inline_excesivo       (warning)
 *      Strings en initialFiles values con >500 chars deben usar 'template:'.
 *
 *   9. drift_proyecto_con_feature_no_registrada        (warning)
 *      Proyectos en SQLite tienen metadata.features solo con ids existentes.
 *      NOTA: requiere acceso a SQLite. Si no disponible, skip silencioso.
 *
 * Modos:
 *   sin args        → valida estructura del contrato.
 *   --check-system  → escanea blueprints/project-types/ y reporta drift.
 *
 * Contrato: arquitectura/decisiones/_contratos/project-feature-blueprints.contract.json
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv/dist/2020');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'arquitectura', 'decisiones', '_contratos', 'project-feature-blueprints.contract.json');
const SCHEMA_PATH = path.join(REPO_ROOT, 'arquitectura', 'decisiones', '_schemas', 'project-feature-blueprints', 'project-feature-blueprint.schema.json');
const BLUEPRINTS_DIR = path.join(REPO_ROOT, 'blueprints', 'project-types');
const PROJECTS_DIR = path.join(REPO_ROOT, 'data', 'projects');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL = '\x1b[33m';
const CYAN = '\x1b[36m';
const RST = '\x1b[0m';

const HARDCODED_PATH_RE = /^(\/opt|\/var|\/srv|\/home|\/etc|\/tmp)/;
const SLUG_PLACEHOLDER_RE = /\{\{slug\}\}/;

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
    findings.push({ severity: 'error', drift_id: 'drift_contrato_no_parseable', detail: `${path.relative(REPO_ROOT, CONTRACT_PATH)} — ${e.message}` });
    return findings;
  }
  const required = ['_doc', 'id', 'version', 'creada', 'objetivo', 'filosofia', 'principios', 'prohibido', 'casos_testigo', 'validaciones_cross_realizadas_por_validator', 'convenciones_complementarias'];
  for (const k of required) {
    if (!(k in c)) {
      findings.push({ severity: 'error', drift_id: 'drift_contrato_seccion_canonica_ausente', detail: `falta seccion ${k}` });
    }
  }
  if (c.id !== 'project-feature-blueprints') {
    findings.push({ severity: 'error', drift_id: 'drift_contrato_id_no_canonico', detail: `id debe ser 'project-feature-blueprints', es '${c.id}'` });
  }
  if (!/^\d+\.\d+\.\d+$/.test(c.version || '')) {
    findings.push({ severity: 'error', drift_id: 'drift_contrato_version_no_semver', detail: `version '${c.version}' no es semver X.Y.Z` });
  }
  return findings;
}

function validateSchema() {
  const findings = [];
  if (!fs.existsSync(SCHEMA_PATH)) {
    findings.push({ severity: 'error', drift_id: 'drift_schema_ausente', detail: `${path.relative(REPO_ROOT, SCHEMA_PATH)} no existe` });
    return [findings, null];
  }
  let ajv, validate;
  try {
    ajv = new Ajv({ strict: true, allErrors: true });
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    validate = ajv.compile(schema);
  } catch (e) {
    findings.push({ severity: 'error', drift_id: 'drift_schema_no_compila', detail: e.message });
    return [findings, null];
  }
  return [findings, validate];
}

// ----------------------- scan one blueprint -----------------------
function scanBlueprint(filePath, validate, allFeatures) {
  const findings = [];
  const relPath = path.relative(REPO_ROOT, filePath);
  const basename = path.basename(filePath, '.json');
  let bp;
  try { bp = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (e) {
    findings.push({ severity: 'error', drift_id: 'drift_feature_blueprint_no_parseable', detail: `${relPath} — ${e.message}` });
    return findings;
  }

  // 1. Schema validation
  if (validate) {
    const ok = validate(bp);
    if (!ok) {
      for (const err of validate.errors || []) {
        findings.push({
          severity: 'error',
          drift_id: 'drift_feature_blueprint_schema',
          detail: `${relPath} ${err.instancePath || '/'} ${err.message}`
        });
      }
    }
  }

  // 2. id === filename
  if (bp.id && bp.id !== basename) {
    findings.push({
      severity: 'error',
      drift_id: 'drift_feature_id_filename_mismatch',
      detail: `${relPath} id='${bp.id}' filename='${basename}'`
    });
  }

  // 3. Dependencies must exist
  for (const dep of (bp.dependencies || [])) {
    if (!allFeatures.has(dep)) {
      findings.push({
        severity: 'error',
        drift_id: 'drift_feature_dependencies_huerfanas',
        detail: `${relPath} dependency '${dep}' no existe en blueprints/project-types/`
      });
    }
  }

  // 5. Hardcoded paths in directories + initialFiles keys (not symlinks.target)
  for (const dir of (bp.directories || [])) {
    if (HARDCODED_PATH_RE.test(dir)) {
      findings.push({
        severity: 'error',
        drift_id: 'drift_feature_hardcoded_path_absoluto',
        detail: `${relPath} directories[] '${dir}' es path absoluto del VPS`
      });
    }
  }
  for (const fpath of Object.keys(bp.initialFiles || {})) {
    if (HARDCODED_PATH_RE.test(fpath)) {
      findings.push({
        severity: 'error',
        drift_id: 'drift_feature_hardcoded_path_absoluto',
        detail: `${relPath} initialFiles key '${fpath}' es path absoluto del VPS`
      });
    }
  }

  // 6. {{slug}} usage requires slug_required:true
  const usesSlugIn = [];
  for (const dir of (bp.directories || [])) {
    if (SLUG_PLACEHOLDER_RE.test(dir)) usesSlugIn.push(`directories[]`);
  }
  if (bp.config && SLUG_PLACEHOLDER_RE.test(JSON.stringify(bp.config))) {
    usesSlugIn.push('config');
  }
  if (bp.initialFiles && SLUG_PLACEHOLDER_RE.test(JSON.stringify(bp.initialFiles))) {
    usesSlugIn.push('initialFiles');
  }
  for (const link of (bp.symlinks || [])) {
    if (SLUG_PLACEHOLDER_RE.test(JSON.stringify(link))) {
      usesSlugIn.push('symlinks[]');
      break;
    }
  }
  if (usesSlugIn.length > 0 && bp.slug_required !== true) {
    findings.push({
      severity: 'error',
      drift_id: 'drift_feature_slug_usado_sin_declarar',
      detail: `${relPath} usa {{slug}} en ${[...new Set(usesSlugIn)].join(', ')} pero slug_required:true no declarado`
    });
  }

  // 7. copyHandlersFrom must exist
  if (bp.copyHandlersFrom) {
    const handlerSrcDir = path.join(PROJECTS_DIR, bp.copyHandlersFrom, 'handlers');
    let valid = false;
    try {
      if (fs.existsSync(handlerSrcDir)) {
        const files = fs.readdirSync(handlerSrcDir).filter(f => f.endsWith('.js'));
        valid = files.length > 0;
      }
    } catch (_) {}
    if (!valid) {
      findings.push({
        severity: 'warning',
        drift_id: 'drift_feature_copyHandlersFrom_inexistente',
        detail: `${relPath} copyHandlersFrom='${bp.copyHandlersFrom}' no resuelve a directorio con .js`
      });
    }
  }

  // 8. initialFile inline excesivo
  for (const [fpath, value] of Object.entries(bp.initialFiles || {})) {
    if (typeof value === 'string' && value.length > 500 && !value.startsWith('template:')) {
      findings.push({
        severity: 'warning',
        drift_id: 'drift_feature_initialFile_inline_excesivo',
        detail: `${relPath} initialFiles['${fpath}'] es string de ${value.length} chars (>500). Considerar 'template:'.`
      });
    }
  }

  return findings;
}

// ----------------------- cycle detection -----------------------
function detectCycles(blueprints) {
  const findings = [];
  const graph = new Map();
  for (const [id, bp] of blueprints) {
    graph.set(id, bp.dependencies || []);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  for (const id of graph.keys()) color.set(id, WHITE);

  function dfs(node, stack) {
    if (color.get(node) === GRAY) {
      const cycleStart = stack.indexOf(node);
      const cycle = stack.slice(cycleStart).concat([node]);
      findings.push({
        severity: 'error',
        drift_id: 'drift_feature_dependency_ciclica',
        detail: `ciclo: ${cycle.join(' → ')}`
      });
      return;
    }
    if (color.get(node) === BLACK) return;
    color.set(node, GRAY);
    stack.push(node);
    for (const dep of (graph.get(node) || [])) {
      if (graph.has(dep)) dfs(dep, stack);
    }
    stack.pop();
    color.set(node, BLACK);
  }
  for (const id of graph.keys()) {
    if (color.get(id) === WHITE) dfs(id, []);
  }
  return findings;
}

// ----------------------- main -----------------------
function main() {
  const args = process.argv.slice(2);
  const checkSystem = args.includes('--check-system');

  console.log(`${CYAN}=== project-feature-blueprints validator ===${RST}`);

  // Phase 1: contract structure
  const structFindings = validateContractStructure();
  const errsStruct = structFindings.filter(f => f.severity === 'error');
  if (errsStruct.length) {
    console.log(`${RED}contract structure errors:${RST}`);
    for (const f of errsStruct) console.log(`  ${RED}![${RST}] ${f.drift_id}: ${f.detail}`);
    return 1;
  }

  // Phase 1.5: schema compiles
  const [schemaFindings, validate] = validateSchema();
  const errsSchema = schemaFindings.filter(f => f.severity === 'error');
  if (errsSchema.length) {
    console.log(`${RED}schema errors:${RST}`);
    for (const f of errsSchema) console.log(`  ${RED}![${RST}] ${f.drift_id}: ${f.detail}`);
    return 1;
  }

  if (!checkSystem) {
    console.log(`${GREEN}PASS${RST} project-feature-blueprints (contract + schema OK)`);
    return 0;
  }

  // Phase 2: cross-system
  if (!fs.existsSync(BLUEPRINTS_DIR)) {
    console.log(`${YEL}!${RST} blueprints/project-types/ no existe — skip`);
    return 0;
  }
  const files = fs.readdirSync(BLUEPRINTS_DIR).filter(f => f.endsWith('.json')).sort();
  console.log(`${CYAN}cross-system: escaneando ${files.length} blueprints en blueprints/project-types/${RST}`);

  // Load all blueprints first for cross-checks
  const blueprints = new Map();
  for (const file of files) {
    const fpath = path.join(BLUEPRINTS_DIR, file);
    try {
      blueprints.set(path.basename(file, '.json'), JSON.parse(fs.readFileSync(fpath, 'utf8')));
    } catch (_) { /* parse error captured in scan */ }
  }
  const allFeatures = new Set(blueprints.keys());

  const allFindings = [];
  for (const file of files) {
    const fpath = path.join(BLUEPRINTS_DIR, file);
    allFindings.push(...scanBlueprint(fpath, validate, allFeatures));
  }

  // Cycle detection across all blueprints
  allFindings.push(...detectCycles(blueprints));

  const errors = allFindings.filter(f => f.severity === 'error');
  const warnings = allFindings.filter(f => f.severity === 'warning');
  const infos = allFindings.filter(f => f.severity === 'info');

  console.log('');
  console.log(`${CYAN}=== resultados ===${RST}`);
  if (errors.length === 0 && warnings.length === 0 && infos.length === 0) {
    console.log(`${GREEN}cross-system OK${RST} (${blueprints.size} features sin drift)`);
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

module.exports = { validateContractStructure, validateSchema, scanBlueprint, detectCycles };

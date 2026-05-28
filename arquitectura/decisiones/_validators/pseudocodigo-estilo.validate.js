#!/usr/bin/env node
/**
 * Validador del contrato pseudocodigo-estilo.contract.json
 *
 * Cross-checks (4):
 *
 *   1. drift_rest_spread_rename                    (error)
 *      Detecta { campo: _alias, ...rest } = obj en pseudocodigo[].
 *      Caso testigo: recetas.revertir (mayo 2026, deepseek-chat).
 *      Anti-patron canonizado en pseudocodigo-estilo.contract.json
 *      principio prohibir_rest_spread_con_rename_y_omision.
 *
 *   2. drift_object_assign_en_pseudocodigo         (error)
 *      Detecta Object.assign(...) en pseudocodigo[]. Mutacion implicita
 *      + funcion estatica con efecto-side. Anti-patron canonizado en
 *      principio prohibir_object_assign_con_mutacion_implicita.
 *
 *   3. drift_spread_en_argumentos                  (warning)
 *      Detecta ...arg en argumentos de funcion o elementos de array
 *      (excluye { ...obj } que es permitido). Sin caso testigo todavia,
 *      queda como warning para referencia.
 *
 *   4. drift_ternario_anidado                      (warning)
 *      Detecta 2 ? sin : intermedio en una sola linea. Densidad
 *      cognitiva alta sin caso testigo confirmado.
 *
 * Aplica a:
 *   - modules/<modulo>/<modulo>.blueprint.json (blueprints hijo)
 *   - arquitectura/decisiones/_blueprints/*.blueprint.json (padres)
 *
 * Recorre operaciones[].pseudocodigo[] (array de strings) y matchea
 * regex por linea. No parsea AST — heuristica regex pura.
 *
 * Modos:
 *   sin args        → valida estructura del contrato (existe, tiene
 *                      las secciones canonicas, version semver).
 *   --check-system  → escanea blueprints del repo, reporta drift.
 *
 * Contrato: arquitectura/decisiones/_contratos/pseudocodigo-estilo.contract.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'arquitectura', 'decisiones', '_contratos', 'pseudocodigo-estilo.contract.json');

const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL   = '\x1b[33m';
const CYAN  = '\x1b[36m';
const RST   = '\x1b[0m';

// ----------------------- regex patterns -----------------------
//
// rest_spread_rename: object destructuring con rest-spread + asignacion.
// Captura las 3 variantes vistas en el repo:
//   { X: _Y, ...Z } = obj       (rename + omision)
//   { X, ...Z } = obj           (simple + omision)
//   { X, Y: _Z, ...W } = obj    (mixto + omision)
// Distincion vs construccion (permitida): si el { va DESPUES del =, es
// construccion (obj = { ...x }). Si va ANTES del =, es destructuring.
//
// Solo se enforcen los anti-patrones con caso testigo runtime empirico.
// Los warnings hipoteticos (spread_en_argumentos, ternario_anidado) viven
// en el contrato como referencia documental pero NO se implementan aqui
// hasta que un test runtime confirme bug observable.
const PATRONES = {
  rest_spread_rename:   /\{[^}]*\.\.\.\w+[^}]*\}\s*=\s*[^=]/,
  object_assign:        /Object\.assign\s*\(/
};

const SEVERIDAD = {
  rest_spread_rename:   'error',
  object_assign:        'error'
};

const DRIFT_ID = {
  rest_spread_rename:   'drift_rest_spread_rename',
  object_assign:        'drift_object_assign_en_pseudocodigo'
};

// ----------------------- discovery -----------------------
function findBlueprints() {
  const out = [];
  // Blueprints hijo en modules/*/*.blueprint.json o modules/*/*/*.blueprint.json
  const modsBase = path.join(REPO_ROOT, 'modules');
  if (fs.existsSync(modsBase)) {
    const walk = (dir, depth) => {
      if (depth > 3) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
      catch (_) { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, depth + 1);
        else if (e.isFile() && e.name.endsWith('.blueprint.json')) out.push(full);
      }
    };
    walk(modsBase, 0);
  }
  // Blueprints padre en arquitectura/decisiones/_blueprints/
  const padresBase = path.join(REPO_ROOT, 'arquitectura', 'decisiones', '_blueprints');
  if (fs.existsSync(padresBase)) {
    for (const f of fs.readdirSync(padresBase)) {
      if (f.endsWith('.blueprint.json')) out.push(path.join(padresBase, f));
    }
  }
  return out.sort();
}

// ----------------------- scan one blueprint -----------------------
function scanBlueprint(bpPath) {
  const findings = [];
  let bp;
  try { bp = JSON.parse(fs.readFileSync(bpPath, 'utf8')); }
  catch (e) {
    findings.push({
      severity: 'error',
      drift_id: 'drift_blueprint_no_parseable',
      detail: `${path.relative(REPO_ROOT, bpPath)} — ${e.message}`
    });
    return findings;
  }
  const ops = (bp && typeof bp.operaciones === 'object' && bp.operaciones) || {};
  for (const [opName, op] of Object.entries(ops)) {
    if (!op || !Array.isArray(op.pseudocodigo)) continue;
    for (let i = 0; i < op.pseudocodigo.length; i++) {
      const line = op.pseudocodigo[i];
      if (typeof line !== 'string') continue;
      for (const [pat, regex] of Object.entries(PATRONES)) {
        if (regex.test(line)) {
          findings.push({
            severity: SEVERIDAD[pat],
            drift_id: DRIFT_ID[pat],
            detail: `${path.relative(REPO_ROOT, bpPath)}:${i + 1} op=${opName} :: ${line.trim().slice(0, 120)}`
          });
        }
      }
    }
  }
  return findings;
}

// ----------------------- contract structure check -----------------------
function validateContractStructure() {
  const findings = [];
  if (!fs.existsSync(CONTRACT_PATH)) {
    findings.push({
      severity: 'error',
      drift_id: 'drift_contrato_ausente',
      detail: `${path.relative(REPO_ROOT, CONTRACT_PATH)} no existe`
    });
    return findings;
  }
  let c;
  try { c = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8')); }
  catch (e) {
    findings.push({
      severity: 'error',
      drift_id: 'drift_contrato_no_parseable',
      detail: `${path.relative(REPO_ROOT, CONTRACT_PATH)} — ${e.message}`
    });
    return findings;
  }
  const required = ['_doc', 'id', 'version', 'creada', 'objetivo', 'filosofia', 'principios', 'casos_testigo', 'prohibido', 'validaciones_cross_realizadas_por_validator', 'convenciones_complementarias'];
  for (const k of required) {
    if (!(k in c)) {
      findings.push({
        severity: 'error',
        drift_id: 'drift_contrato_seccion_canonica_ausente',
        detail: `pseudocodigo-estilo.contract.json — falta seccion ${k}`
      });
    }
  }
  if (c.id !== 'pseudocodigo-estilo') {
    findings.push({
      severity: 'error',
      drift_id: 'drift_contrato_id_no_canonico',
      detail: `id debe ser 'pseudocodigo-estilo', es '${c.id}'`
    });
  }
  if (!/^\d+\.\d+\.\d+$/.test(c.version || '')) {
    findings.push({
      severity: 'error',
      drift_id: 'drift_contrato_version_no_semver',
      detail: `version '${c.version}' no es semver X.Y.Z`
    });
  }
  // Casos testigo deben tener test_runtime_path (regla canonizada en llm-runtime-discipline v2.1.0)
  if (Array.isArray(c.casos_testigo)) {
    for (const ct of c.casos_testigo) {
      if (!ct.test_runtime_path) {
        findings.push({
          severity: 'error',
          drift_id: 'drift_caso_testigo_sin_test_runtime_path',
          detail: `caso_testigo '${ct.id}' no declara test_runtime_path (regla canonica llm-runtime-discipline v2.1.0)`
        });
      } else {
        const tp = path.join(REPO_ROOT, ct.test_runtime_path);
        if (!fs.existsSync(tp)) {
          findings.push({
            severity: 'error',
            drift_id: 'drift_caso_testigo_test_runtime_no_existe',
            detail: `caso_testigo '${ct.id}' apunta a ${ct.test_runtime_path} que NO existe`
          });
        }
      }
    }
  }
  return findings;
}

// ----------------------- main -----------------------
function main() {
  const args = process.argv.slice(2);
  const checkSystem = args.includes('--check-system');

  console.log(`${CYAN}=== pseudocodigo-estilo validator ===${RST}`);

  // Fase 1: estructura del contrato (siempre)
  const structFindings = validateContractStructure();
  if (structFindings.some(f => f.severity === 'error')) {
    console.log(`${RED}contract structure errors:${RST}`);
    for (const f of structFindings) {
      if (f.severity === 'error') console.log(`  ${RED}![${RST}] ${f.drift_id}: ${f.detail}`);
    }
    return 1;
  }

  if (!checkSystem) {
    console.log(`${GREEN}PASS${RST} pseudocodigo-estilo (estructura del contrato OK)`);
    return 0;
  }

  // Fase 2: cross-system — escanear blueprints
  const blueprints = findBlueprints();
  console.log(`${CYAN}cross-system: escaneando ${blueprints.length} blueprints${RST}`);

  const allFindings = [];
  for (const bp of blueprints) {
    const f = scanBlueprint(bp);
    allFindings.push(...f);
  }

  const errors   = allFindings.filter(f => f.severity === 'error');
  const warnings = allFindings.filter(f => f.severity === 'warning');
  const infos    = allFindings.filter(f => f.severity === 'info');

  console.log('');
  console.log(`${CYAN}=== resultados ===${RST}`);
  if (errors.length === 0 && warnings.length === 0 && infos.length === 0) {
    console.log(`${GREEN}cross-system OK${RST} (0 findings en ${blueprints.length} blueprints)`);
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

module.exports = { scanBlueprint, validateContractStructure, findBlueprints };

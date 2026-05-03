#!/usr/bin/env node
/**
 * Validador del transversal testing v1.0.0.
 *
 * Cross-checks (8):
 *  1. testing_contract_estructura_valida           (error)
 *  2. drift_libreria_de_testing_en_package_json    (error) — Jest, Mocha, Tape, Vitest, Jasmine
 *  3. drift_libreria_de_mocking                    (error) — Sinon, proxyquire, rewire
 *  4. drift_test_skip_focus_xtest                  (error) — .skip, .only, xtest, xit
 *  5. drift_test_snapshot                          (error) — toMatchSnapshot, snapshotSerializer
 *  6. drift_test_sin_validacion_ajv                (warning) — test sin require de ajv en handlers canonicos
 *  7. drift_test_sin_npm_script                    (warning)
 *  8. drift_test_sin_step_ci                       (warning)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT     = path.resolve(__dirname, '../../..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/testing.contract.json');
const TESTS_UNIT    = path.join(REPO_ROOT, 'tests/unit');
const TESTS_INT     = path.join(REPO_ROOT, 'tests/integration');
const PACKAGE_JSON  = path.join(REPO_ROOT, 'package.json');
const WORKFLOW_YML  = path.join(REPO_ROOT, '.github/workflows/validate.yml');

const RED='\x1b[31m', GREEN='\x1b[32m', YEL='\x1b[33m', CYAN='\x1b[36m', RST='\x1b[0m';
const SECCIONES_CANONICAS = ['_doc','id','version','creada','supersedes_nota','objetivo','inputs','filosofia','principios','decisiones_arquitectonicas','prohibido','output_shape_resumen','reglas_de_extraccion','derivaciones','validaciones_cross_realizadas_por_validator','salida_validador','convenciones_complementarias'];

const TESTING_LIBS = ['jest','mocha','tape','vitest','jasmine','ava'];
const MOCKING_LIBS = ['sinon','proxyquire','rewire','jest-mock','testdouble'];

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
function lineOfOffset(c, o) { return c.slice(0, o).split('\n').length; }

function listTestFiles() {
  const acc = [];
  for (const dir of [TESTS_UNIT, TESTS_INT]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.test.js')) acc.push(path.join(dir, f));
    }
  }
  return acc;
}

function checkLibsTestingProhibidas(findings) {
  const pkg = loadJson(PACKAGE_JSON);
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const lib of TESTING_LIBS) {
    if (allDeps[lib]) findings.errors.push(`drift_libreria_de_testing_en_package_json: ${lib} esta en dependencies/devDependencies`);
  }
  for (const lib of MOCKING_LIBS) {
    if (allDeps[lib]) findings.errors.push(`drift_libreria_de_mocking: ${lib} esta en dependencies/devDependencies`);
  }
}

function checkSkipFocusXtest(findings) {
  for (const file of listTestFiles()) {
    const content = fs.readFileSync(file, 'utf-8');
    const rx = /\.(skip|only)\s*\(|\b(xtest|xit|fdescribe|fit)\s*\(/g;
    let m;
    while ((m = rx.exec(content)) !== null) {
      const ln = lineOfOffset(content, m.index);
      findings.errors.push(`drift_test_skip_focus_xtest: ${path.relative(REPO_ROOT, file)}:${ln} — ${m[0]}`);
    }
  }
}

function checkSnapshots(findings) {
  for (const file of listTestFiles()) {
    const content = fs.readFileSync(file, 'utf-8');
    const rx = /\.toMatchSnapshot|snapshotSerializer/g;
    let m;
    while ((m = rx.exec(content)) !== null) {
      const ln = lineOfOffset(content, m.index);
      findings.errors.push(`drift_test_snapshot: ${path.relative(REPO_ROOT, file)}:${ln} — snapshots prohibidos`);
    }
  }
}

function checkValidacionAjv(findings) {
  // Tests asociados a handlers canonicos (chat-flow, agent-flow, frontend) deben importar AJV
  const CANONICOS = ['chat-io','prompt-builder','ai-gateway-chat','memory-user-profile','ai-agent-framework'];
  for (const file of listTestFiles()) {
    const base = path.basename(file, '.test.js');
    if (!CANONICOS.includes(base)) continue;
    const content = fs.readFileSync(file, 'utf-8');
    if (!/require\s*\(\s*['"`]ajv/i.test(content) && !content.includes('Ajv')) {
      findings.warnings.push(`drift_test_sin_validacion_ajv: ${path.relative(REPO_ROOT, file)} — test de handler canonico sin AJV`);
    }
  }
}

function checkWiringPackageJson(findings) {
  const pkg = loadJson(PACKAGE_JSON);
  const scripts = pkg.scripts || {};
  for (const file of listTestFiles()) {
    if (!file.includes('/unit/')) continue; // integration no requiere npm script individual
    const base = path.basename(file, '.test.js');
    const expected = `test:${base}`;
    if (!scripts[expected]) {
      findings.warnings.push(`drift_test_sin_npm_script: ${base}.test.js sin script "${expected}" en package.json`);
    }
  }
}

function checkWiringWorkflow(findings) {
  if (!fs.existsSync(WORKFLOW_YML)) return;
  const yml = fs.readFileSync(WORKFLOW_YML, 'utf-8');
  const pkg = loadJson(PACKAGE_JSON);
  const scripts = pkg.scripts || {};
  for (const sName of Object.keys(scripts)) {
    if (!sName.startsWith('test:')) continue;
    if (sName === 'test:all') continue; // alias
    if (!yml.includes(`npm run ${sName}`)) {
      findings.warnings.push(`drift_test_sin_step_ci: npm script "${sName}" sin step en .github/workflows/validate.yml`);
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
  if (!fs.existsSync(CONTRACT_PATH)) { console.log(`${RED}FAIL${RST} testing.contract.json no existe`); process.exit(1); }
  let contract; try { contract = loadJson(CONTRACT_PATH); } catch (e) { console.log(`${RED}FAIL${RST} ${e.message}`); process.exit(1); }
  const faltan = SECCIONES_CANONICAS.filter(k => !Object.keys(contract).includes(k));
  if (faltan.length > 0) { console.log(`${RED}FAIL${RST} testing.contract amplitud incompleta. Faltan: ${faltan.join(', ')}`); process.exit(1); }
  console.log(`${GREEN}PASS${RST} testing (contrato valido, ${Object.keys(contract).length} secciones canonicas)`);

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el repo (testing) ===${RST}`);
    const f = { errors: [], warnings: [], info: [] };
    checkLibsTestingProhibidas(f);
    checkSkipFocusXtest(f);
    checkSnapshots(f);
    checkValidacionAjv(f);
    checkWiringPackageJson(f);
    checkWiringWorkflow(f);
    reportFindings(f);
  }
  process.exit(0);
}

main();

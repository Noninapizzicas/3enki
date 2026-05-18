#!/usr/bin/env node
/**
 * Validador del transversal documentation v1.0.0.
 *
 * Cross-checks (4):
 *  1. documentation_contract_estructura_valida    (error)
 *  2. drift_markdown_con_shape_estructurable      (warning) — *.md fuera de whitelist con patrones de shape
 *  3. drift_contrato_sin_validator                (warning)
 *  4. drift_claudemd_inflado                      (info)    — CLAUDE.md > 500 lineas
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT       = path.resolve(__dirname, '../../..');
const CONTRACT_PATH   = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/documentation.contract.json');
const CONTRATOS_DIRS  = [
  path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos'),
  path.join(REPO_ROOT, 'arquitectura/convenciones/_contratos'),
  path.join(REPO_ROOT, 'arquitectura/auditoria/_contratos')
];
const VALIDATORS_DIRS = [
  path.join(REPO_ROOT, 'arquitectura/decisiones/_validators'),
  path.join(REPO_ROOT, 'arquitectura/convenciones/_validators'),
  path.join(REPO_ROOT, 'arquitectura/auditoria/_validators')
];

const RED='\x1b[31m', GREEN='\x1b[32m', YEL='\x1b[33m', CYAN='\x1b[36m', RST='\x1b[0m';
const SECCIONES_CANONICAS = ['_doc','id','version','creada','supersedes_nota','objetivo','inputs','filosofia','principios','decisiones_arquitectonicas','prohibido','output_shape_resumen','reglas_de_extraccion','derivaciones','validaciones_cross_realizadas_por_validator','salida_validador','convenciones_complementarias'];

// Whitelist de markdowns permitidos. Cualquier otro con shape estructurable es drift.
const MARKDOWN_WHITELIST = new Set([
  'CLAUDE.md',
  'arquitectura/README.md',
  'README.md'
]);
const MARKDOWN_REGEX_README_MODULO = /^modules\/[^/]+\/README\.md$/;
const MARKDOWN_REGEX_PROMPT = /^modules\/.+\/prompt\.json$|prompts?\/.+\.md$|.*\.prompt\.md$/;
// Patrones de shape estructurable detectables en MD
const SHAPE_PATTERNS = [
  /^##\s*(Decisiones|Reglas|Eventos|Schemas?|Principios|Filosof|Prohibido|Convenciones)/im,
  /^\|\s*Evento\s*\|/m,  // tabla de eventos
  /^\|\s*Modulo\s*\|/m   // tabla de modulos
];

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

function findAllMarkdowns() {
  const acc = [];
  function walk(dir, depth) {
    if (depth > 6) return;
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '_archived' || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full, depth + 1);
        else if (name.endsWith('.md')) acc.push(full);
      } catch (_) {}
    }
  }
  walk(REPO_ROOT, 0);
  return acc;
}

function isWhitelisted(rel) {
  if (MARKDOWN_WHITELIST.has(rel)) return true;
  if (MARKDOWN_REGEX_README_MODULO.test(rel)) return true;
  // POC findings, design docs internos de modulos
  if (rel.endsWith('/POC_FINDINGS.md')) return true;
  if (rel.includes('/docs/')) return true;
  return false;
}

function checkMarkdownShape(findings) {
  for (const file of findAllMarkdowns()) {
    const rel = path.relative(REPO_ROOT, file);
    if (isWhitelisted(rel)) continue;
    const content = fs.readFileSync(file, 'utf-8');
    for (const rx of SHAPE_PATTERNS) {
      if (rx.test(content)) {
        findings.warnings.push(`drift_markdown_con_shape_estructurable: ${rel} contiene patron estructurable — considerar absorber a contrato JSON`);
        break;
      }
    }
  }
}

function checkContratoSinValidator(findings) {
  // Mapping <id>.contract.json ↔ <id>.validate.js
  const validators = new Set();
  for (const dir of VALIDATORS_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.validate.js')) validators.add(f.replace('.validate.js', ''));
    }
  }
  // Excepciones: contratos que no requieren validator propio (modulo-completo lo extrae diferentemente)
  const EXCLUDED = new Set(['modulo-completo','manifest-completo','eventos-emitidos','companero-viaje','extensibilidad-modular','modulos-blueprint-driven']);
  for (const dir of CONTRATOS_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.contract.json')) continue;
      const id = f.replace('.contract.json', '');
      if (EXCLUDED.has(id)) continue;
      if (!validators.has(id)) {
        findings.warnings.push(`drift_contrato_sin_validator: ${id} sin validator en _validators/${id}.validate.js`);
      }
    }
  }
}

function checkClaudemdInflado(findings) {
  const claudemd = path.join(REPO_ROOT, 'CLAUDE.md');
  if (!fs.existsSync(claudemd)) return;
  const lines = fs.readFileSync(claudemd, 'utf-8').split('\n').length;
  if (lines > 500) {
    findings.info.push(`drift_claudemd_inflado: CLAUDE.md tiene ${lines} lineas (limite preventivo 500) — revisar si duplica info de contratos`);
  }
}

const README_NAMES_PERMITIDOS = new Set(['README.md', 'POC_FINDINGS.md', 'prompt.md']);

function checkDesignDocPropio(findings) {
  const modDir = path.join(REPO_ROOT, 'modules');
  if (!fs.existsSync(modDir)) return;
  function walk(dir, depth) {
    if (depth > 4 || !fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '_archived' || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full, depth + 1);
        else if (name.endsWith('.md') && !README_NAMES_PERMITIDOS.has(name) && !name.endsWith('-system.md')) {
          findings.warnings.push(`drift_design_doc_propio_de_modulo: ${path.relative(REPO_ROOT, full)} — design docs internos prohibidos (decisiones a contratos cross-modulo o module.json)`);
        }
      } catch (_) {}
    }
  }
  walk(modDir, 0);
}

function checkContratosEnClaudemd(findings) {
  const claudemd = path.join(REPO_ROOT, 'CLAUDE.md');
  if (!fs.existsSync(claudemd)) return;
  const content = fs.readFileSync(claudemd, 'utf-8');
  const contratosDirs = [
    path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos'),
    path.join(REPO_ROOT, 'arquitectura/convenciones/_contratos')
  ];
  // Excepciones: contratos no transversales o sub-contratos que pueden vivir referenciados solo en su contexto
  const EXCLUDED = new Set(['companero-viaje','extensibilidad-modular']);
  for (const dir of contratosDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.contract.json')) continue;
      const id = f.replace('.contract.json', '');
      if (EXCLUDED.has(id)) continue;
      // Buscar el id como string en CLAUDE.md (case-insensitive, con o sin guiones)
      const idVariants = [id, id.replace(/-/g, ' '), id.replace(/-/g, '')];
      const referenced = idVariants.some(v => content.toLowerCase().includes(v.toLowerCase()));
      if (!referenced) {
        findings.warnings.push(`drift_contratos_sin_indice_en_claudemd: contrato "${id}" no aparece referenciado en CLAUDE.md (sesion futura no lo descubrira)`);
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
  if (!fs.existsSync(CONTRACT_PATH)) { console.log(`${RED}FAIL${RST} documentation.contract.json no existe`); process.exit(1); }
  let contract; try { contract = loadJson(CONTRACT_PATH); } catch (e) { console.log(`${RED}FAIL${RST} ${e.message}`); process.exit(1); }
  const faltan = SECCIONES_CANONICAS.filter(k => !Object.keys(contract).includes(k));
  if (faltan.length > 0) { console.log(`${RED}FAIL${RST} documentation.contract amplitud incompleta. Faltan: ${faltan.join(', ')}`); process.exit(1); }
  console.log(`${GREEN}PASS${RST} documentation (contrato valido, ${Object.keys(contract).length} secciones canonicas)`);

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el repo (documentation) ===${RST}`);
    const f = { errors: [], warnings: [], info: [] };
    checkMarkdownShape(f);
    checkContratoSinValidator(f);
    checkClaudemdInflado(f);
    checkDesignDocPropio(f);
    checkContratosEnClaudemd(f);
    reportFindings(f);
  }
  process.exit(0);
}

main();

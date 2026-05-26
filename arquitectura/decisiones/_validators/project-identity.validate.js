#!/usr/bin/env node
/**
 * Validador del transversal project-identity v1.0.0.
 *
 * Estructural:
 *  - project_identity_contract_estructura_valida   (error) — secciones canonicas presentes
 *
 * Cross-checks (5, mapeo directo a C1-C5 del contrato):
 *  - drift_slugify_fuera_de_project_manager                       (warning) — C1 / PROH1
 *  - drift_cache_de_slug_en_modulo                                (warning) — C2 / PROH2
 *  - drift_modulo_persistente_sin_subscribe_project_activated     (info)    — C3 / P1
 *  - drift_payload_event_proyecto_con_slug                        (error)   — C4 / PROH4
 *  - drift_project_get_request_fuera_de_pm                        (info)    — C5 / P3, PROH5
 *
 * Contrato: arquitectura/decisiones/_contratos/project-identity.contract.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT     = path.resolve(__dirname, '../../..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/project-identity.contract.json');
const MODULES_DIR   = path.join(REPO_ROOT, 'modules');
const PM_DIR_SEGMENT = 'project-manager';

const RED='\x1b[31m', GREEN='\x1b[32m', YEL='\x1b[33m', CYAN='\x1b[36m', RST='\x1b[0m';

const SECCIONES_CANONICAS = [
  '_doc','id','version','creada','supersedes_nota',
  'objetivo','inputs','filosofia','principios',
  'decisiones_arquitectonicas','prohibido',
  'output_shape_resumen','reglas_de_extraccion',
  'derivaciones','validaciones_cross_realizadas_por_validator',
  'salida_validador','convenciones_complementarias'
];

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
function lineOfOffset(c, o) { return c.slice(0, o).split('\n').length; }

function listSourceFiles({ excludeProjectManager = true } = {}) {
  const acc = [];
  function walk(dir, depth) {
    if (depth > 6 || !fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '_archived' || name === '_legacy' || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          if (excludeProjectManager && name === PM_DIR_SEGMENT) continue;
          walk(full, depth + 1);
        } else if (name.endsWith('.js')) acc.push(full);
      } catch (_) {}
    }
  }
  walk(MODULES_DIR, 0);
  return acc;
}

function listModuleJsons() {
  const acc = [];
  if (!fs.existsSync(MODULES_DIR)) return acc;
  function walk(dir, depth) {
    if (depth > 3 || !fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '_archived' || name === '_legacy' || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          const mj = path.join(full, 'module.json');
          if (fs.existsSync(mj)) acc.push(mj);
          else walk(full, depth + 1);
        }
      } catch (_) {}
    }
  }
  walk(MODULES_DIR, 0);
  return acc;
}

// C1 / PROH1
// Heuristica refinada: el contrato prohibe recomputar el slug del PROYECTO,
// no la slugificacion de otras entidades (categoria_id, ingrediente_id, etc.).
// Para acotar la senyal el hit cuenta como drift solo si las tres condiciones
// se cumplen:
//   (a) no es comentario,
//   (b) hay contexto de project en ventana de +-20 lineas
//       (base_path, project_id, projects.name, project.activated),
//   (c) la linea del hit asigna a una variable llamada `slug`/`projectDir`/
//       `projectPath`/`dbPath` o construye un path.join.
// La condicion (c) descarta `categoria_id = _slugify(nombre)` y similares,
// donde lo que se computa es un id de OTRA entidad aunque el handler reciba
// project_id como parametro.
function checkSlugifyFueraDePM(findings) {
  const projectContextRx = /\b(base_path|projectId|project_id|projects\.name|project\.activated)\b/;
  const slugUsageRx      = /\b(slug|projectDir|projectPath|projectsDir|dbPath)\b|path\.join/;
  for (const file of listSourceFiles()) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines   = content.split('\n');
    const rx = /\b_slugify\b|toLowerCase\s*\(\s*\)\s*\.\s*replace/g;
    let m;
    while ((m = rx.exec(content)) !== null) {
      const ln = lineOfOffset(content, m.index);
      const currentLine = lines[ln - 1] || '';
      if (/^\s*(\*|\/\/|\/\*)/.test(currentLine)) continue;
      if (!slugUsageRx.test(currentLine)) continue;
      const winStart = Math.max(0, ln - 21);
      const winEnd   = Math.min(lines.length, ln + 20);
      const window   = lines.slice(winStart, winEnd).join('\n');
      if (!projectContextRx.test(window)) continue;
      findings.warnings.push(`drift_slugify_fuera_de_project_manager: ${path.relative(REPO_ROOT, file)}:${ln} — recompute local de slug en contexto de project (project-identity.PROH1)`);
    }
  }
}

// C2 / PROH2
function checkCacheDeSlug(findings) {
  for (const file of listSourceFiles()) {
    const content = fs.readFileSync(file, 'utf-8');
    const rx = /\bprojectSlugs\b|\bslugCache\b|this\.slugs\s*=/g;
    let m;
    while ((m = rx.exec(content)) !== null) {
      const ln = lineOfOffset(content, m.index);
      findings.warnings.push(`drift_cache_de_slug_en_modulo: ${path.relative(REPO_ROOT, file)}:${ln} — cache de valor derivado donde base_path es autoritativo (project-identity.PROH2)`);
    }
  }
}

// C3 / P1
function checkModuloPersistenteSinSubscribeProjectActivated(findings) {
  for (const mj of listModuleJsons()) {
    if (mj.includes(`${path.sep}${PM_DIR_SEGMENT}${path.sep}`)) continue;
    let mod;
    try { mod = loadJson(mj); } catch (_) { continue; }
    const tools = mod.tools || [];
    const persistente = tools.some(t => /\.(crear|actualizar|eliminar)\b/i.test(t.name || ''));
    if (!persistente) continue;
    const rawSubs = mod.subscribes || mod.eventos_escuchados || [];
    const subs = Array.isArray(rawSubs)
      ? rawSubs.map(s => (typeof s === 'string' ? s : (s.event || s.name || s.evento || '')))
      : [];
    if (!subs.includes('project.activated')) {
      findings.info.push(`drift_modulo_persistente_sin_subscribe_project_activated: ${path.relative(REPO_ROOT, mj)} — tools .crear|.actualizar|.eliminar sin 'project.activated' en subscribes (project-identity.P1)`);
    }
  }
}

// C4 / PROH4
function checkPayloadEventProyectoConSlug(findings) {
  const PM_INDEX = path.join(MODULES_DIR, PM_DIR_SEGMENT, 'index.js');
  if (!fs.existsSync(PM_INDEX)) return;
  const content = fs.readFileSync(PM_INDEX, 'utf-8');
  const events = ['project\\.get\\.response','project\\.list\\.response','project\\.activated','project\\.created'];
  for (const evRx of events) {
    const eventName = evRx.replace(/\\\./g, '.');
    const rx = new RegExp(`['"]${evRx}['"]`, 'g');
    let m;
    while ((m = rx.exec(content)) !== null) {
      const startIdx = m.index;
      const tail = content.slice(startIdx, startIdx + 2000);
      const slugMatch = tail.match(/[\{,]\s*slug\s*:/);
      if (slugMatch) {
        const ln = lineOfOffset(content, startIdx + slugMatch.index);
        findings.errors.push(`drift_payload_event_proyecto_con_slug: ${path.relative(REPO_ROOT, PM_INDEX)}:${ln} — publish de ${eventName} con key 'slug' en payload (project-identity.PROH4)`);
      }
    }
  }
}

// C5 / P3, PROH5
function checkProjectGetRequestFueraDePM(findings) {
  for (const file of listSourceFiles()) {
    const content = fs.readFileSync(file, 'utf-8');
    const rx = /['"]project\.get\.request['"]/g;
    let m;
    while ((m = rx.exec(content)) !== null) {
      const ln = lineOfOffset(content, m.index);
      findings.info.push(`drift_project_get_request_fuera_de_pm: ${path.relative(REPO_ROOT, file)}:${ln} — uso de project.get.request fuera de project-manager (project-identity.P3, verificar si camino caliente)`);
    }
  }
}

function reportFindings(f) {
  if (f.errors.length)   { console.log(`${RED}cross-system errors (${f.errors.length})${RST}`);     for (const e of f.errors)   console.log(`  ${RED}✗${RST} ${e}`); }
  if (f.warnings.length) { console.log(`${YEL}cross-system warnings (${f.warnings.length})${RST}`); for (const w of f.warnings) console.log(`  ${YEL}!${RST} ${w}`); }
  if (f.info.length)     { console.log(`${CYAN}cross-system info (${f.info.length})${RST}`);        for (const i of f.info)     console.log(`  ${CYAN}i${RST} ${i}`); }
  if (!f.errors.length && !f.warnings.length && !f.info.length) console.log(`${GREEN}cross-system: sin drift detectado${RST}`);
}

function main() {
  const checkSystemFlag = process.argv.includes('--check-system');
  if (!fs.existsSync(CONTRACT_PATH)) { console.log(`${RED}FAIL${RST} project-identity.contract.json no existe`); process.exit(1); }
  let contract;
  try { contract = loadJson(CONTRACT_PATH); }
  catch (e) { console.log(`${RED}FAIL${RST} project-identity.contract.json: ${e.message}`); process.exit(1); }
  const faltan = SECCIONES_CANONICAS.filter(k => !Object.keys(contract).includes(k));
  if (faltan.length > 0) {
    console.log(`${RED}FAIL${RST} project-identity.contract amplitud incompleta. Faltan: ${faltan.join(', ')}`);
    process.exit(1);
  }
  console.log(`${GREEN}PASS${RST} project-identity (contrato valido, ${Object.keys(contract).length} secciones)`);
  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el repo (project-identity) ===${RST}`);
    const f = { errors: [], warnings: [], info: [] };
    checkSlugifyFueraDePM(f);
    checkCacheDeSlug(f);
    checkModuloPersistenteSinSubscribeProjectActivated(f);
    checkPayloadEventProyectoConSlug(f);
    checkProjectGetRequestFueraDePM(f);
    reportFindings(f);
  }
  process.exit(0);
}

main();

#!/usr/bin/env node
/**
 * Validador del transversal llm-runtime-discipline v1.0.0.
 *
 * Cross-checks (6) — declarados en
 * arquitectura/decisiones/_contratos/llm-runtime-discipline.contract.json
 *
 *   Estructurales (siempre corren):
 *     1. contrato_estructura_canonica           (error)
 *     2. cada_principio_tiene_anti_patron       (error)
 *     3. exactamente_10_principios              (warning)
 *
 *   Cross-system (solo con --check-system):
 *     4. padre_canonico_tiene_seccion_disciplina         (error)
 *     5. principios_padre_coinciden_con_contrato         (warning)
 *     6. hijos_extends_padre_con_disciplina              (warning)
 *
 * Patron coherente con scheduling.validate.js y
 * cajones-context-partitioning.validate.js (regex + walkers de fs sin
 * dependencias externas). El contrato es prosa estructurada, no schema AJV.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT     = path.resolve(__dirname, '../../..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/llm-runtime-discipline.contract.json');
const BLUEPRINTS_DIR = path.join(REPO_ROOT, 'arquitectura/decisiones/_blueprints');
const MODULES_DIR   = path.join(REPO_ROOT, 'modules');

const RED='\x1b[31m', GREEN='\x1b[32m', YEL='\x1b[33m', CYAN='\x1b[36m', RST='\x1b[0m';

const SECCIONES_CANONICAS = [
  '_doc','id','version','creada','supersedes_nota','objetivo','inputs','filosofia',
  'principios','decisiones_arquitectonicas','prohibido','output_shape_resumen',
  'reglas_de_extraccion','derivaciones','validaciones_cross_realizadas_por_validator',
  'salida_validador','convenciones_complementarias'
];

const SECCION_DISCIPLINA_KEY = 'disciplina_del_llm_runtime';
const EXPECTED_PRINCIPIO_COUNT = 10;

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

function findParentBlueprints() {
  if (!fs.existsSync(BLUEPRINTS_DIR)) return [];
  return fs.readdirSync(BLUEPRINTS_DIR)
    .filter(n => n.endsWith('.blueprint.json'))
    .map(n => path.join(BLUEPRINTS_DIR, n));
}

function findChildBlueprintsWithExtends() {
  const acc = [];
  function walk(dir, depth) {
    if (depth > 5 || !fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '_archived' || name === '_legacy' || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) { walk(full, depth + 1); continue; }
        if (!name.endsWith('.blueprint.json')) continue;
        const j = loadJson(full);
        // Hijos referencian al padre por extends_blueprint_abstract (id) o
        // por path absoluto (vivido via module.json.blueprint_parent_path).
        // Aqui usamos el id.
        if (j?.extends_blueprint_abstract) {
          acc.push({ path: full, child: j });
        }
      } catch (_) {}
    }
  }
  walk(MODULES_DIR, 0);
  return acc;
}

// Normaliza el id de un principio del padre. El padre usa keys con prefijo
// numerico ("1_enfoque_una_operacion"); el contrato usa keys planos
// ("enfoque_una_operacion"). Esta normalizacion permite el match cross.
function normalizePadreKey(k) {
  return String(k || '').replace(/^\d+_/, '');
}

function checkPadreCanonicoTieneSeccionDisciplina(findings, contract) {
  // Lista de padres a verificar: los que appear en derivaciones (rol espejea
  // la seccion) + cualquier *.modulo-base.blueprint.json del dir.
  const candidatos = new Set();
  for (const d of (contract.derivaciones || [])) {
    if (typeof d?.documento === 'string' && d.documento.endsWith('.blueprint.json')) {
      candidatos.add(path.join(REPO_ROOT, d.documento));
    }
  }
  for (const f of findParentBlueprints()) candidatos.add(f);
  if (candidatos.size === 0) {
    findings.warnings.push('padre_canonico_tiene_seccion_disciplina: no se encontraron blueprints padres candidatos');
    return { padresConSeccion: [] };
  }
  const padresConSeccion = [];
  for (const p of candidatos) {
    if (!fs.existsSync(p)) {
      findings.errors.push(`padre_canonico_tiene_seccion_disciplina: ${path.relative(REPO_ROOT, p)} no existe (declarado en derivaciones)`);
      continue;
    }
    let j;
    try { j = loadJson(p); } catch (e) {
      findings.errors.push(`padre_canonico_tiene_seccion_disciplina: ${path.relative(REPO_ROOT, p)} JSON invalido: ${e.message}`);
      continue;
    }
    const seccion = j[SECCION_DISCIPLINA_KEY];
    if (!seccion || typeof seccion !== 'object') {
      findings.errors.push(`padre_canonico_tiene_seccion_disciplina: ${path.relative(REPO_ROOT, p)} no tiene seccion '${SECCION_DISCIPLINA_KEY}'`);
      continue;
    }
    padresConSeccion.push({ pathStr: p, j, seccion });
  }
  return { padresConSeccion };
}

function checkPrincipiosPadreCoincidenConContrato(findings, contract, padresConSeccion) {
  const contratoPrincipios = contract.principios || [];
  if (contratoPrincipios.length === 0) return;
  for (const { pathStr, seccion } of padresConSeccion) {
    const padreKeys = Object.keys(seccion).filter(k => k !== '_descripcion');
    // Map padre id normalizado -> el bloque del padre.
    const padreNormMap = new Map();
    for (const k of padreKeys) {
      padreNormMap.set(normalizePadreKey(k), seccion[k]);
    }
    for (const principio of contratoPrincipios) {
      const id = principio.id;
      const matchPadre = padreNormMap.get(id);
      if (!matchPadre) {
        findings.warnings.push(
          `principios_padre_coinciden_con_contrato: ${path.relative(REPO_ROOT, pathStr)} no tiene principio '${id}' (presente en contrato)`
        );
        continue;
      }
      // Comparacion soft: el padre puede tener naming distinto en keys
      // (principio/regla, anti_patron) pero los textos clave coinciden.
      const padreRegla = matchPadre.principio || matchPadre.regla || '';
      const padreAntipat = matchPadre.anti_patron || '';
      const cReglaTrim = String(principio.regla || '').trim().slice(0, 50);
      const pReglaTrim = String(padreRegla).trim().slice(0, 50);
      if (cReglaTrim && pReglaTrim && cReglaTrim !== pReglaTrim) {
        findings.warnings.push(
          `principios_padre_coinciden_con_contrato: ${path.relative(REPO_ROOT, pathStr)} principio '${id}' diverge: contrato='${cReglaTrim}...' vs padre='${pReglaTrim}...'`
        );
      }
      if (principio.anti_patron && padreAntipat) {
        const cATrim = String(principio.anti_patron).trim().slice(0, 50);
        const pATrim = String(padreAntipat).trim().slice(0, 50);
        if (cATrim !== pATrim) {
          findings.warnings.push(
            `principios_padre_coinciden_con_contrato: ${path.relative(REPO_ROOT, pathStr)} anti_patron de '${id}' diverge: contrato='${cATrim}...' vs padre='${pATrim}...'`
          );
        }
      }
    }
  }
}

function checkHijosExtendsPadreConDisciplina(findings, padresConSeccion) {
  const padresPorId = new Map();
  for (const { j } of padresConSeccion) {
    if (j.id) padresPorId.set(j.id, true);
  }
  const hijos = findChildBlueprintsWithExtends();
  for (const { path: childPath, child } of hijos) {
    const parentId = child.extends_blueprint_abstract;
    if (typeof parentId !== 'string') continue;
    if (!padresPorId.has(parentId)) {
      findings.warnings.push(
        `hijos_extends_padre_con_disciplina: ${path.relative(REPO_ROOT, childPath)} extiende '${parentId}' que no aparece como padre con seccion disciplina en el repo`
      );
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
  if (!fs.existsSync(CONTRACT_PATH)) { console.log(`${RED}FAIL${RST} llm-runtime-discipline.contract.json no existe`); process.exit(1); }
  let contract; try { contract = loadJson(CONTRACT_PATH); } catch (e) { console.log(`${RED}FAIL${RST} ${e.message}`); process.exit(1); }

  // 1. contrato_estructura_canonica
  const faltan = SECCIONES_CANONICAS.filter(k => !Object.keys(contract).includes(k));
  if (faltan.length > 0) { console.log(`${RED}FAIL${RST} llm-runtime-discipline.contract amplitud incompleta. Faltan: ${faltan.join(', ')}`); process.exit(1); }

  // 2. cada_principio_tiene_anti_patron
  const sinAntipat = (contract.principios || [])
    .filter(p => !p.anti_patron || typeof p.anti_patron !== 'string' || p.anti_patron.trim().length === 0)
    .map(p => p.id || '(sin id)');
  if (sinAntipat.length > 0) {
    console.log(`${RED}FAIL${RST} llm-runtime-discipline.contract — principios sin anti_patron: ${sinAntipat.join(', ')}`);
    process.exit(1);
  }

  const count = (contract.principios || []).length;
  let warningSemilla = '';
  if (count !== EXPECTED_PRINCIPIO_COUNT) {
    // 3. exactamente_10_principios → warning (no bloquea PASS estructural)
    warningSemilla = ` (warning: principios=${count}, esperados=${EXPECTED_PRINCIPIO_COUNT})`;
  }
  console.log(`${GREEN}PASS${RST} llm-runtime-discipline (contrato valido, ${Object.keys(contract).length} secciones, ${count} principios con anti_patron${warningSemilla})`);

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el repo (llm-runtime-discipline) ===${RST}`);
    const f = { errors: [], warnings: [], info: [] };
    if (count !== EXPECTED_PRINCIPIO_COUNT) {
      f.warnings.push(`exactamente_10_principios: contrato tiene ${count} principios (esperados ${EXPECTED_PRINCIPIO_COUNT}). Bump mayor del contrato pendiente si la disciplina cambio.`);
    }
    const { padresConSeccion } = checkPadreCanonicoTieneSeccionDisciplina(f, contract);
    f.info.push(`padres con seccion ${SECCION_DISCIPLINA_KEY}: ${padresConSeccion.length}`);
    if (padresConSeccion.length > 0) {
      checkPrincipiosPadreCoincidenConContrato(f, contract, padresConSeccion);
      checkHijosExtendsPadreConDisciplina(f, padresConSeccion);
    }
    reportFindings(f);
    if (f.errors.length > 0) process.exit(2);
  }
  process.exit(0);
}

main();

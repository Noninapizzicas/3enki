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
// Bumped to 11 in contract v2.0.0 (2026-05-25) — anyadido principio
// read_modify_write_con_cas tras audit cross-blueprint del salmorejo.
const EXPECTED_PRINCIPIO_COUNT = 11;

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

// ============================================================================
// drift_blueprint_fs_read_a_storage_ajeno (cross-check estatico)
//
// Detecta uso de fs.read.request/fs.write.request a paths que NO estan
// declarados en el estado_persistente del propio blueprint.
//
// Heuristica verificada contra los 10 blueprints actuales: 0 findings esperados
// con la implementacion actual (smoke test 2026-05-24). Detalle:
// - extractDeclaredPaths recorre estado_persistente recursivamente y captura
//   strings que empiezan por '/' (los formatos son heterogeneos: paths_relativos,
//   paths_relativos_proyecto, archivo_destino, etc.).
// - templatePathToRegex normaliza placeholders <carta_id>, <timestamp>, etc.
// - 3 modos de match (declarado wins si CUALQUIERA pasa):
//   1. regex exacto contra template normalizado
//   2. prefijo: path usado es prefijo de algun declarado (cubre el patron
//      pseudocodigo `path: '/cartas/' + carta_id + '.json'`)
//   3. modulo built-in: paths que empiezan por 'modules/<modulo>/'
//
// Limitacion conocida (pendiente refinar): la heuristica NO detecta el caso
// "conflicto de propiedad" (dos modulos declaran el mismo path como propio).
// Ese es el anti-patron real cuando un blueprint declara archivo_destino
// apuntando al storage de otro modulo (escandallo declara /recetas.json,
// recetas tambien lo declara). Ver apuntes en cajones-frentes-abiertos-retomar.md
// para la fase de refinamiento.
// ============================================================================

function extractDeclaredPathsRecursive(node, acc = []) {
  if (node == null) return acc;
  if (typeof node === 'string') {
    const matches = node.match(/\/[\w\-/<>]+\.\w+|\/[\w\-/<>]+\/(?=[\s)<])|\/[\w\-/<>]+\/?$/g) || [];
    for (const m of matches) {
      const cleaned = m.replace(/[()]+$/, '').replace(/[.,;]+$/, '');
      if (cleaned.length > 1) acc.push(cleaned);
    }
    return acc;
  }
  if (Array.isArray(node)) {
    for (const v of node) extractDeclaredPathsRecursive(v, acc);
    return acc;
  }
  if (typeof node === 'object') {
    for (const k of Object.keys(node)) extractDeclaredPathsRecursive(node[k], acc);
  }
  return acc;
}

function templatePathToRegex(declaredPath) {
  let escaped = declaredPath.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  escaped = escaped.replace(/<[^>]+>/g, '[\\w.-]+');
  if (declaredPath.endsWith('/')) return new RegExp('^' + escaped);
  return new RegExp('^' + escaped + '$');
}

function extractUsedFsPaths(blueprint) {
  const usados = [];
  const ops = blueprint.operaciones || {};
  for (const [opName, opBody] of Object.entries(ops)) {
    const pseudo = opBody?.pseudocodigo;
    if (!Array.isArray(pseudo)) continue;
    for (const step of pseudo) {
      if (typeof step !== 'string') continue;
      const rx = /publishAndWait\s*\(\s*['"]fs\.(read|write)\.request['"][^)]*?path:\s*['"]([^'"]+)['"]/g;
      let m;
      while ((m = rx.exec(step)) !== null) {
        usados.push({ operacion: opName, fs_op: m[1], path: m[2] });
      }
    }
  }
  return usados;
}

function checkBlueprintsRespetanEstadoPersistente(findings) {
  // Localizar todos los blueprints hijos
  const blueprints = [];
  function walk(dir, depth) {
    if (depth > 6 || !fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '_archived' || name === '_legacy' || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full, depth + 1);
        else if (name.endsWith('.blueprint.json')) blueprints.push(full);
      } catch (_) {}
    }
  }
  walk(path.join(REPO_ROOT, 'modules'), 0);

  for (const bpPath of blueprints) {
    const moduleName = path.basename(path.dirname(bpPath));
    let bp;
    try { bp = loadJson(bpPath); } catch (_) { continue; }
    if (!bp || !bp.operaciones) continue;

    // Paths declarados (incluyendo archivo_destino si existe)
    const declarados = extractDeclaredPathsRecursive(bp.estado_persistente);
    if (declarados.length === 0) declarados.push('/' + moduleName + '.json');
    const matchers = declarados.map(p => ({ raw: p, regex: templatePathToRegex(p) }));

    const usados = extractUsedFsPaths(bp);
    for (const u of usados) {
      // (3) modulo built-in
      if (u.path.startsWith(`modules/pizzepos/${moduleName}/`)) continue;
      // (1) match exacto
      if (matchers.some(m => m.regex.test(u.path))) continue;
      // (2) match por prefijo
      const matchedPrefix = declarados.some(d => {
        const dPrefix = d.split('<')[0];
        return dPrefix.length > 1 && u.path.startsWith(dPrefix);
      });
      if (matchedPrefix) continue;
      findings.errors.push(
        `drift_blueprint_fs_read_a_storage_ajeno: ${path.relative(REPO_ROOT, bpPath)} operacion '${u.operacion}' invoca fs.${u.fs_op}.request path='${u.path}' fuera del estado_persistente declarado`
      );
    }
  }
}

// ============================================================================
// Cross-checks del mecanismo blueprint-subscribers-asincronos (frente 2.4)
//
// Anyadidos 2026-05-24 tras validar el patron en runtime. Protegen los
// declaraciones de eventos_que_escucho de blueprints contra typos y
// referencias fantasma. El mecanismo runtime ya tolera estos casos (log warn
// + skip), pero detectarlos estaticamente bloquea el error en CI antes de
// llegar a runtime.
// ============================================================================

function extractAsyncSubscribers(blueprint) {
  // Devuelve [{evento, handler_name}] normalizado para cada entry de
  // eventos_que_escucho. Soporta forma objeto {evento, handler} y string
  // simple (handler auto-derivado a '_on_<event_with_underscores>').
  const out = [];
  const arr = blueprint?.eventos_que_escucho;
  if (!Array.isArray(arr)) return out;
  for (const entry of arr) {
    if (typeof entry === 'string') {
      out.push({ evento: entry, handler_name: '_on_' + entry.replace(/\./g, '_') });
    } else if (entry && typeof entry === 'object' && typeof entry.evento === 'string' && typeof entry.handler === 'string') {
      out.push({ evento: entry.evento, handler_name: entry.handler });
    }
    // Entries invalidas se ignoran silenciosamente — los detectaria el
    // wire-up de ai-gateway con un warn, no es responsabilidad de este check.
  }
  return out;
}

function checkEventosQueEscuchoApuntaAHandlerExistente(findings) {
  // Para cada blueprint hijo con eventos_que_escucho, verificar que el
  // handler declarado existe en operaciones del propio blueprint. Sin esto,
  // ai-gateway al wireear emite warn y omite — pero detectarlo en CI antes
  // del deploy evita que el subscriber quede silencioso en produccion.
  function walk(dir, depth) {
    if (depth > 6 || !fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '_archived' || name === '_legacy' || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) { walk(full, depth + 1); continue; }
        if (!name.endsWith('.blueprint.json')) continue;
        let bp; try { bp = loadJson(full); } catch (_) { continue; }
        const subs = extractAsyncSubscribers(bp);
        if (subs.length === 0) continue;
        const ops = bp.operaciones || {};
        for (const { evento, handler_name } of subs) {
          if (!ops[handler_name]) {
            findings.errors.push(
              `eventos_que_escucho_apunta_a_handler_existente: ${path.relative(REPO_ROOT, full)} declara escuchar '${evento}' con handler '${handler_name}' pero la operacion no existe en operaciones[] (operaciones disponibles: ${Object.keys(ops).slice(0, 10).join(', ')}${Object.keys(ops).length > 10 ? ', ...' : ''})`
            );
          }
        }
      } catch (_) {}
    }
  }
  walk(path.join(REPO_ROOT, 'modules'), 0);
}

function collectAllPublishedEventsAcrossRepo() {
  // Recolecta todos los eventos publicados en el sistema: tanto los
  // declarados en blueprints (.blueprint.json::eventos_publicados) como los
  // declarados en modulos POC2 JS (module.json::events.publishes[].event o
  // module.json::publishes[]). Solo nombres canonicos (strings), no patterns.
  const pub = new Set();
  function walk(dir, depth) {
    if (depth > 6 || !fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '_archived' || name === '_legacy' || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) { walk(full, depth + 1); continue; }
        if (name === 'module.json') {
          let m; try { m = loadJson(full); } catch (_) { return; }
          // Forma POC2 actual: events.publishes[] con objetos {event: '...'}
          const ev1 = m?.events?.publishes;
          if (Array.isArray(ev1)) for (const e of ev1) {
            const en = typeof e === 'string' ? e : e?.event;
            if (typeof en === 'string') pub.add(en);
          }
          // Forma legacy: publishes[] top-level con strings
          if (Array.isArray(m?.publishes)) for (const e of m.publishes) {
            if (typeof e === 'string') pub.add(e);
          }
        } else if (name.endsWith('.blueprint.json')) {
          let bp; try { bp = loadJson(full); } catch (_) { return; }
          // Forma canonica blueprints: eventos_publicados[] con strings
          if (Array.isArray(bp?.eventos_publicados)) for (const e of bp.eventos_publicados) {
            if (typeof e === 'string') pub.add(e);
          }
        }
      } catch (_) {}
    }
  }
  walk(path.join(REPO_ROOT, 'modules'), 0);
  return pub;
}

function checkEventosQueEscuchoApuntaAEventoCanonico(findings) {
  // Para cada blueprint con eventos_que_escucho, verificar que el evento
  // declarado lo publica alguien del repo (blueprint o modulo POC2 JS).
  // Severidad warning (no error) porque algun evento podria venir de un
  // origen externo no escaneable (cron, channel-*, etc.).
  const todosLosPublicados = collectAllPublishedEventsAcrossRepo();
  function walk(dir, depth) {
    if (depth > 6 || !fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '_archived' || name === '_legacy' || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) { walk(full, depth + 1); continue; }
        if (!name.endsWith('.blueprint.json')) continue;
        let bp; try { bp = loadJson(full); } catch (_) { continue; }
        const subs = extractAsyncSubscribers(bp);
        for (const { evento } of subs) {
          if (!todosLosPublicados.has(evento)) {
            findings.warnings.push(
              `eventos_que_escucho_apunta_a_evento_canonico: ${path.relative(REPO_ROOT, full)} declara escuchar '${evento}' pero NINGUN blueprint ni module.json del repo lo publica (eventos_publicados / events.publishes). Posible typo o evento que viene de origen externo no escaneable.`
            );
          }
        }
      } catch (_) {}
    }
  }
  walk(path.join(REPO_ROOT, 'modules'), 0);
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
    // Cross-check estatico del anti-patron no_explorar_estado_ajeno
    checkBlueprintsRespetanEstadoPersistente(f);
    // Cross-checks del mecanismo blueprint-subscribers-asincronos (frente 2.4)
    checkEventosQueEscuchoApuntaAHandlerExistente(f);
    checkEventosQueEscuchoApuntaAEventoCanonico(f);
    reportFindings(f);
    if (f.errors.length > 0) process.exit(2);
  }
  process.exit(0);
}

main();

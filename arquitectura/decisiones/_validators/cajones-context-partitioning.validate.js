#!/usr/bin/env node
/**
 * Validador del transversal cajones-context-partitioning v1.0.0.
 *
 * Cross-checks (8 — los 10 declarados en el contrato menos los 2 que aplican
 * a tools de Fase 5 bis aun no implementadas: chat.cambiar_foco, page.related):
 *
 *   Estructurales (siempre corren):
 *     1. contrato_estructura_canonica                    (error)
 *     2. cada_principio_tiene_anti_patron                (error)
 *
 *   Cross-system (solo con --check-system):
 *     3. tools_canonicas_v1_registradas_en_ai_gateway    (error)
 *     4. blueprint_con_cajones_enabled_tiene_minimo_dos_operaciones  (warning)
 *     5. override_cajon_descripcion_apunta_a_operacion_existente     (error)
 *     6. ningun_modulo_invoca_cajon_tools_programaticamente          (error)
 *     7. ai_gateway_no_importa_cliente_de_embeddings_en_codigo_cajones (error)
 *     8. v1_no_extiende_cajones_a_chat_agentes_memorias               (warning)
 *
 * Contrato: arquitectura/decisiones/_contratos/cajones-context-partitioning.contract.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT     = path.resolve(__dirname, '../../..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/cajones-context-partitioning.contract.json');
const MODULES_DIR   = path.join(REPO_ROOT, 'modules');
const AI_GATEWAY_INDEX = path.join(REPO_ROOT, 'modules/conversacion/ai-gateway/index.js');

const RED='\x1b[31m', GREEN='\x1b[32m', YEL='\x1b[33m', CYAN='\x1b[36m', RST='\x1b[0m';

const SECCIONES_CANONICAS = [
  '_doc','id','version','creada','supersedes_nota','objetivo','inputs','filosofia',
  'principios','decisiones_arquitectonicas','prohibido','output_shape_resumen',
  'reglas_de_extraccion','derivaciones','validaciones_cross_realizadas_por_validator',
  'salida_validador','convenciones_complementarias'
];

const CAJONES_TOOLS_V1 = ['cajon.listar', 'cajon.abrir'];

// Embedding/vector-search libraries que ai-gateway NO debe importar en el codigo
// de cajones (decision: ranking simple sin modelo, prohibido embeddings_o_similarity_search).
const EMBEDDING_LIBS = [
  '@openai/embeddings',
  'openai-embeddings',
  '@xenova/transformers',
  'hnswlib-node',
  'faiss-node',
  'chromadb',
  'pinecone-client',
  '@pinecone-database/pinecone',
  'cosine-similarity'
];

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
function lineOfOffset(c, o) { return c.slice(0, o).split('\n').length; }

function findBlueprintFiles() {
  const acc = [];
  function walk(dir, depth) {
    if (depth > 6 || !fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '_archived' || name === '_legacy' || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full, depth + 1);
        else if (name.endsWith('.blueprint.json')) acc.push(full);
      } catch (_) {}
    }
  }
  walk(MODULES_DIR, 0);
  return acc;
}

function findManifestFiles() {
  const acc = [];
  function walk(dir, depth) {
    if (depth > 4 || !fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '_archived' || name === '_legacy' || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full, depth + 1);
        else if (name === 'module.json') acc.push(full);
      } catch (_) {}
    }
  }
  walk(MODULES_DIR, 0);
  return acc;
}

function checkToolsCanonicasRegistradasEnAiGateway(findings) {
  if (!fs.existsSync(AI_GATEWAY_INDEX)) {
    findings.errors.push(`tools_canonicas_v1_registradas_en_ai_gateway: ai-gateway/index.js no existe en ${path.relative(REPO_ROOT, AI_GATEWAY_INDEX)}`);
    return;
  }
  const content = fs.readFileSync(AI_GATEWAY_INDEX, 'utf-8');
  for (const tool of CAJONES_TOOLS_V1) {
    // Buscar declaracion: name: 'cajon.listar' o name: "cajon.abrir"
    const rx = new RegExp(`name:\\s*['"]${tool.replace('.', '\\.')}['"]`);
    if (!rx.test(content)) {
      findings.errors.push(`tools_canonicas_v1_registradas_en_ai_gateway: tool '${tool}' no declarada en ai-gateway/index.js (esperado name: '${tool}' en _getCajonesTools)`);
    }
  }
}

function checkBlueprintMinimoDosOperaciones(findings, blueprints) {
  for (const { manifestPath, manifest, childPath, child } of blueprints) {
    if (!manifest || (manifest.cajones_enabled !== true && child.cajones_enabled !== true)) continue;
    const ops = (child && typeof child.operaciones === 'object' && child.operaciones) || {};
    const count = Object.keys(ops).length;
    if (count < 2) {
      findings.warnings.push(
        `blueprint_con_cajones_enabled_tiene_minimo_dos_operaciones: ${path.relative(REPO_ROOT, manifestPath)} declara cajones_enabled pero su blueprint hijo (${path.relative(REPO_ROOT, childPath)}) tiene ${count} operacion(es). Con <2 el patron no aporta (no hay nada que elegir).`
      );
    }
  }
}

function checkOverrideCajonDescripcionApuntaAOperacionExistente(findings, blueprints) {
  for (const { childPath, child } of blueprints) {
    const ops = (child && typeof child.operaciones === 'object' && child.operaciones) || {};
    for (const [nombre, op] of Object.entries(ops)) {
      if (op && typeof op === 'object' && 'cajon_descripcion' in op) {
        const val = op.cajon_descripcion;
        if (typeof val !== 'string' || val.trim().length === 0) {
          findings.errors.push(
            `override_cajon_descripcion_invalida: ${path.relative(REPO_ROOT, childPath)} -> operaciones.${nombre}.cajon_descripcion no es string no vacio`
          );
        }
      }
    }
    // Detectar overrides al nivel del blueprint (mal lugar — deben ir en cada operacion)
    if (child && typeof child.cajon_descripcion === 'string') {
      findings.errors.push(
        `override_cajon_descripcion_apunta_a_operacion_existente: ${path.relative(REPO_ROOT, childPath)} declara cajon_descripcion a nivel raiz del blueprint (debe ir dentro de cada operacion del catalogo)`
      );
    }
  }
}

function checkNingunModuloInvocaCajonToolsProgramaticamente(findings) {
  // cajon.* solo se invocan via tool call del LLM. Ningun modulo del repo debe
  // publishearlas o invocarlas como evento/handler/tool desde codigo.
  // Excepcion: el propio ai-gateway las declara en _getCajonesTools y las
  // intercepta en _executeToolCall; tambien aparecen en logs/strings de tests.
  const ALLOWED_FILES = [
    'modules/conversacion/ai-gateway/index.js',
    'arquitectura/decisiones/_contratos/cajones-context-partitioning.contract.json',
    'arquitectura/decisiones/_validators/cajones-context-partitioning.validate.js'
  ];
  const allowedAbs = new Set(ALLOWED_FILES.map(f => path.join(REPO_ROOT, f)));

  function walk(dir, depth) {
    if (depth > 6 || !fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '_archived' || name === '_legacy' || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) { walk(full, depth + 1); continue; }
        if (!name.endsWith('.js')) continue;
        if (allowedAbs.has(full)) continue;
        if (full.includes('/__tests__/') || full.includes('/tests/')) continue; // tests pueden mencionarlas
        const content = fs.readFileSync(full, 'utf-8');
        // Patrones de invocacion programatica: publish('cajon.abrir' ...),
        // publishAndWait('cajon.abrir' ...), eventBus.publish('cajon.X' ...),
        // toolsRegistry.get('cajon.X'), uiHandler.register('cajon', 'X' ...)
        for (const tool of CAJONES_TOOLS_V1) {
          const escaped = tool.replace('.', '\\.');
          const patterns = [
            new RegExp(`publish(?:AndWait)?\\s*\\(\\s*['"]${escaped}['"]`),
            new RegExp(`eventBus\\.\\w+\\s*\\(\\s*['"]${escaped}['"]`),
            new RegExp(`toolsRegistry[\\.\\[]\\s*[gG]et\\s*\\(\\s*['"]${escaped}['"]`)
          ];
          for (const rx of patterns) {
            const m = content.match(rx);
            if (m) {
              const ln = lineOfOffset(content, content.indexOf(m[0]));
              findings.errors.push(
                `ningun_modulo_invoca_cajon_tools_programaticamente: ${path.relative(REPO_ROOT, full)}:${ln} invoca '${tool}' programaticamente (solo el LLM via tool call debe invocarla)`
              );
            }
          }
        }
      } catch (_) {}
    }
  }
  walk(path.join(REPO_ROOT, 'modules'), 0);
  walk(path.join(REPO_ROOT, 'core'), 0);
}

function checkAiGatewayNoImportaEmbeddings(findings) {
  if (!fs.existsSync(AI_GATEWAY_INDEX)) return;
  const content = fs.readFileSync(AI_GATEWAY_INDEX, 'utf-8');
  // Estamos buscando solo en el codigo de cajones (entre marcador de seccion
  // y el cierre antes de la siguiente seccion). Si no encontramos la seccion,
  // buscar en todo el archivo es overkill pero seguro.
  const cajonesStart = content.indexOf('cajones-context-partitioning');
  const cajonesBlock = cajonesStart >= 0 ? content.slice(cajonesStart) : content;
  for (const lib of EMBEDDING_LIBS) {
    const rx = new RegExp(`require\\s*\\(\\s*['"]${lib.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}['"]`);
    if (rx.test(cajonesBlock)) {
      findings.errors.push(
        `ai_gateway_no_importa_cliente_de_embeddings_en_codigo_cajones: ai-gateway/index.js importa '${lib}' — viola ranking_simple_sin_modelo del contrato`
      );
    }
  }
}

function checkV1NoExtiendeFueraDeBlueprints(findings) {
  // Modulos que NO deben consumir cajon.listar / cajon.abrir en v1
  const OUT_OF_SCOPE_DIRS = [
    'modules/conversacion/chat-io',
    'modules/conversacion/ai-agent-framework',
    'modules/conversacion/memory-user-profile',
    'modules/conversacion/memory-conversation-summary',
    'modules/conversacion/memory-rag'
  ];
  for (const rel of OUT_OF_SCOPE_DIRS) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    function walk(dir, depth) {
      if (depth > 4 || !fs.existsSync(dir)) return;
      for (const name of fs.readdirSync(dir)) {
        if (name === 'node_modules' || name === '_archived' || name === '_legacy' || name.startsWith('.')) continue;
        const full = path.join(dir, name);
        try {
          const stat = fs.statSync(full);
          if (stat.isDirectory()) { walk(full, depth + 1); continue; }
          if (!name.endsWith('.js') && name !== 'module.json') continue;
          const content = fs.readFileSync(full, 'utf-8');
          for (const tool of CAJONES_TOOLS_V1) {
            if (content.includes(`'${tool}'`) || content.includes(`"${tool}"`)) {
              findings.warnings.push(
                `v1_no_extiende_cajones_a_chat_agentes_memorias: ${path.relative(REPO_ROOT, full)} menciona '${tool}' — fuera del scope v1 (solo blueprints)`
              );
            }
          }
        } catch (_) {}
      }
    }
    walk(abs, 0);
  }
}

function loadBlueprints() {
  const result = [];
  // Necesitamos cruzar module.json (declara cajones_enabled) con el blueprint hijo
  const manifests = findManifestFiles();
  for (const manifestPath of manifests) {
    let manifest;
    try { manifest = loadJson(manifestPath); } catch (_) { continue; }
    if (!manifest?.blueprint_driven) continue;
    const moduleDir = path.dirname(manifestPath);
    let childPath = null;
    if (manifest.blueprint_path) {
      childPath = path.join(moduleDir, manifest.blueprint_path);
    } else {
      // Heuristica: <module_name>.blueprint.json en el mismo dir
      const bps = findBlueprintFiles().filter(p => path.dirname(p) === moduleDir);
      if (bps.length === 1) childPath = bps[0];
    }
    if (!childPath || !fs.existsSync(childPath)) continue;
    let child;
    try { child = loadJson(childPath); } catch (_) { continue; }
    result.push({ manifestPath, manifest, childPath, child });
  }
  return result;
}

function reportFindings(f) {
  if (f.errors.length) { console.log(`${RED}cross-system errors (${f.errors.length})${RST}`); for (const e of f.errors) console.log(`  ${RED}✗${RST} ${e}`); }
  if (f.warnings.length) { console.log(`${YEL}cross-system warnings (${f.warnings.length})${RST}`); for (const w of f.warnings) console.log(`  ${YEL}!${RST} ${w}`); }
  if (f.info.length) { console.log(`${CYAN}cross-system info (${f.info.length})${RST}`); for (const i of f.info) console.log(`  ${CYAN}i${RST} ${i}`); }
  if (!f.errors.length && !f.warnings.length && !f.info.length) console.log(`${GREEN}cross-system: sin drift detectado${RST}`);
}

function main() {
  const checkSystemFlag = process.argv.includes('--check-system');
  if (!fs.existsSync(CONTRACT_PATH)) { console.log(`${RED}FAIL${RST} cajones-context-partitioning.contract.json no existe`); process.exit(1); }
  let contract; try { contract = loadJson(CONTRACT_PATH); } catch (e) { console.log(`${RED}FAIL${RST} ${e.message}`); process.exit(1); }

  // 1. contrato_estructura_canonica
  const faltan = SECCIONES_CANONICAS.filter(k => !Object.keys(contract).includes(k));
  if (faltan.length > 0) { console.log(`${RED}FAIL${RST} cajones-context-partitioning.contract amplitud incompleta. Faltan: ${faltan.join(', ')}`); process.exit(1); }

  // 2. cada_principio_tiene_anti_patron
  const sinAntipat = (contract.principios || [])
    .filter(p => !p.anti_patron || typeof p.anti_patron !== 'string' || p.anti_patron.trim().length === 0)
    .map(p => p.id || '(sin id)');
  if (sinAntipat.length > 0) {
    console.log(`${RED}FAIL${RST} cajones-context-partitioning.contract — principios sin anti_patron: ${sinAntipat.join(', ')}`);
    process.exit(1);
  }

  console.log(`${GREEN}PASS${RST} cajones-context-partitioning (contrato valido, ${Object.keys(contract).length} secciones, ${contract.principios.length} principios con anti_patron)`);

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el repo (cajones-context-partitioning) ===${RST}`);
    const f = { errors: [], warnings: [], info: [] };
    const blueprints = loadBlueprints();
    f.info.push(`blueprints escaneados: ${blueprints.length}; con cajones_enabled: ${blueprints.filter(b => b.manifest.cajones_enabled === true || b.child.cajones_enabled === true).length}`);
    checkToolsCanonicasRegistradasEnAiGateway(f);
    checkBlueprintMinimoDosOperaciones(f, blueprints);
    checkOverrideCajonDescripcionApuntaAOperacionExistente(f, blueprints);
    checkNingunModuloInvocaCajonToolsProgramaticamente(f);
    checkAiGatewayNoImportaEmbeddings(f);
    checkV1NoExtiendeFueraDeBlueprints(f);
    reportFindings(f);
    if (f.errors.length > 0) process.exit(2); // distinto a schema FAIL para que validate-all lo distinga
  }
  process.exit(0);
}

main();

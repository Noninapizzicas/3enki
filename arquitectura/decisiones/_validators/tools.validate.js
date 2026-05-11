#!/usr/bin/env node
/**
 * Validador del contrato transversal tools v1.0.0.
 *
 * Uso:
 *   node tools.validate.js                # valida los 2 JSON Schemas estructuralmente
 *   node tools.validate.js --check-system # adicional: cross-checks contra modulos del repo
 *
 * Cross-checks (14):
 *   1. tools_schemas_compile_ok                            (error)   — los 2 schemas compilan AJV strict.
 *   2. drift_tool_name_sin_prefijo_de_modulo               (warning) — name fuera de patron <prefix>.<entity>.
 *   3. drift_tool_parameters_no_jsonschema_valido          (warning) — parameters no compila AJV.
 *   4. drift_tool_sin_handler_o_handler_inexistente        (warning) — handler no encontrado en codigo.
 *   5. drift_tool_handler_no_async                         (warning) — handler sin async.
 *   6. drift_tool_errores_conocidos_codigo_no_canonico     (warning) — codigo fuera del catalogo errors.json.
 *   7. drift_tool_errores_conocidos_vacio_handler_devuelve_error  (info) — handler emite error pero campo vacio/ausente.
 *   8. drift_tool_handler_acceso_directo_a_otros_modulos   (warning) — moduleLoader.getModule en handler.
 *   9. drift_dos_modulos_con_misma_tool_name               (error)   — colision de name cross-modulo.
 *  10. drift_tool_invoca_llm_directamente                  (warning) — llamada a APIs LLM externas en handler.
 *  11. drift_tool_invoke_agent_declarada_en_module_json    (error)   — meta-tool del sistema declarada por modulo.
 *  12. drift_tool_declaration_no_cumple_schema             (warning) — entry de tools[] no valida contra declaration schema.
 *  13. drift_tool_handler_que_devuelve_valor_pelado        (info)    — handler con returns no canonicos.
 *  14. drift_invocacion_directa_de_tool_fuera_del_framework (error) — toolsRegistry.handler(...) o moduleLoader.executeTool(...) fuera de core/ (v1.1).
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const Ajv  = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const REPO_ROOT      = path.resolve(__dirname, '../../..');
const SCHEMAS_DIR    = path.join(REPO_ROOT, 'arquitectura/decisiones/_schemas/tools');
const CONTRACT_PATH  = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/tools.contract.json');
const ERRORS_OUT     = path.join(REPO_ROOT, 'arquitectura/decisiones/_outputs/errors.json');
const MODULES_DIR    = path.join(REPO_ROOT, 'modules');

const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL   = '\x1b[33m';
const CYAN  = '\x1b[36m';
const RST   = '\x1b[0m';

const NAME_RE = /^[a-z0-9-]+\.[a-z0-9_]+(\.[a-z0-9_]+)*$/;
const LLM_HOSTS = [
  'api.openai.com',
  'api.anthropic.com',
  'api.deepseek.com',
  'api.groq.com',
  'generativelanguage.googleapis.com'
];

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

function compileSchemas() {
  const ajv = new Ajv({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  const schemas = {};
  for (const f of fs.readdirSync(SCHEMAS_DIR)) {
    if (!f.endsWith('.json')) continue;
    schemas[f] = loadJson(path.join(SCHEMAS_DIR, f));
  }
  for (const [f, s] of Object.entries(schemas)) ajv.addSchema(s, f);
  for (const f of Object.keys(schemas)) ajv.compile(schemas[f]);
  return { schemas, ajv };
}

function loadCanonicalErrorCodes() {
  if (!fs.existsSync(ERRORS_OUT)) return null;
  try {
    const data = loadJson(ERRORS_OUT);
    const codes = new Set();
    for (const k of Object.keys(data)) {
      if (k.startsWith('codes_') && Array.isArray(data[k])) {
        for (const e of data[k]) {
          if (typeof e === 'string') codes.add(e);
          else if (e && typeof e.code === 'string') codes.add(e.code);
        }
      }
    }
    return codes;
  } catch (_) { return null; }
}

function listModulesWithManifest() {
  const acc = [];
  function walk(dir, slug = '') {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    if (entries.some(e => e.isFile() && e.name === 'module.json')) {
      acc.push({ dir, slug });
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith('_') || e.name.startsWith('.') || e.name === 'node_modules') continue;
      walk(path.join(dir, e.name), slug ? `${slug}__${e.name}` : e.name);
    }
  }
  walk(MODULES_DIR);
  return acc;
}

function readManifest(dir) {
  const p = path.join(dir, 'module.json');
  try { return loadJson(p); } catch (_) { return null; }
}

function readSourceFiles(dir) {
  const acc = [];
  const idx = path.join(dir, 'index.js');
  if (fs.existsSync(idx)) acc.push(idx);
  for (const sub of ['lib', 'services', 'providers']) {
    const sd = path.join(dir, sub);
    if (fs.existsSync(sd)) walkJs(sd, acc);
  }
  return acc;
}

function walkJs(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    try {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walkJs(full, acc);
      else if (name.endsWith('.js')) acc.push(full);
    } catch (_) {}
  }
  return acc;
}

function lineOfOffset(content, offset) {
  return content.slice(0, offset).split('\n').length;
}

function findHandlerDef(sources, handlerName) {
  // Devuelve { file, line, isAsync } o null si no se encuentra.
  // Heuristicas: 'async <handler>(' | '<handler>: async (' | '<handler>(...) {'
  const patterns = [
    new RegExp(`(async\\s+)?${handlerName}\\s*\\(`, 'g'),
    new RegExp(`${handlerName}\\s*:\\s*(async\\s+)?function`, 'g'),
    new RegExp(`${handlerName}\\s*=\\s*(async\\s+)?\\(`, 'g')
  ];
  for (const file of sources) {
    let content;
    try { content = fs.readFileSync(file, 'utf-8'); } catch (_) { continue; }
    for (const re of patterns) {
      let m;
      while ((m = re.exec(content)) !== null) {
        // Excluir matches que sean llamadas a la fn (this.handler()) en lugar de defs
        const beforeStart = Math.max(0, m.index - 8);
        const before = content.slice(beforeStart, m.index);
        if (/\bthis\.\s*$/.test(before) || /\bawait\s+\S*$/.test(before)) continue;
        const isAsync = !!m[1] || /async/.test(m[0]);
        return { file, line: lineOfOffset(content, m.index), isAsync };
      }
    }
  }
  return null;
}

function handlerBody(file, startLine) {
  // Best-effort: lee 80 lineas tras la firma; suficiente para heuristicas.
  try {
    const lines = fs.readFileSync(file, 'utf-8').split('\n');
    return lines.slice(startLine - 1, startLine - 1 + 80).join('\n');
  } catch (_) { return ''; }
}

function tryCompileParameters(parameters, sharedAjv) {
  try {
    sharedAjv.compile(parameters);
    return true;
  } catch (_) {
    return false;
  }
}

// ---- Cross-checks ----

function gatherAllTools() {
  const out = []; // { slug, dir, manifest_tools }
  for (const { dir, slug } of listModulesWithManifest()) {
    const m = readManifest(dir);
    if (!m) continue;
    const tools = m.tools || [];
    if (!Array.isArray(tools) || tools.length === 0) continue;
    out.push({ slug, dir, language: m.language || 'en', tools });
  }
  return out;
}

function checkAll(findings) {
  const all = gatherAllTools();
  const errorCodes = loadCanonicalErrorCodes();
  const ajvForParameters = new Ajv({ strict: false });
  addFormats(ajvForParameters);

  // Cargar schema declaration para validar cada tool
  const { ajv: schemaAjv } = compileSchemas();
  const validateDecl = schemaAjv.getSchema('tool.declaration.schema.json');

  // Mapa global name -> [slug,...] para detectar colisiones
  const nameMap = new Map();

  for (const { slug, dir, tools } of all) {
    const sources = readSourceFiles(dir);

    for (const tool of tools) {
      // Si no es objeto, saltar (algunos modulos declaran strings — drift de otro tipo, no de tools.contract)
      if (typeof tool !== 'object' || tool === null) continue;

      const name = tool.name;
      if (typeof name !== 'string') continue;

      // 12. drift_tool_declaration_no_cumple_schema
      const ok = validateDecl(tool);
      if (!ok) {
        const errs = (validateDecl.errors || []).map(e => `${e.instancePath} ${e.message}`).join('; ');
        findings.warnings.push(`drift_tool_declaration_no_cumple_schema: ${slug} tool "${name}" — ${errs}`);
      }

      // 11. drift_tool_invoke_agent_declarada_en_module_json
      if (name === 'invoke_agent') {
        findings.errors.push(`drift_tool_invoke_agent_declarada_en_module_json: ${slug} declara invoke_agent en module.json — es meta-tool runtime de ai-gateway, NUNCA en module.json`);
      }

      // 2. drift_tool_name_sin_prefijo_de_modulo
      if (!NAME_RE.test(name)) {
        findings.warnings.push(`drift_tool_name_sin_prefijo_de_modulo: ${slug} tool "${name}" — no cumple <module-prefix>.<entity>(.verb)? en kebab-case`);
      }

      // Mapeo global para colision
      if (!nameMap.has(name)) nameMap.set(name, []);
      nameMap.get(name).push(slug);

      // 3. drift_tool_parameters_no_jsonschema_valido
      if (tool.parameters && typeof tool.parameters === 'object') {
        if (!tryCompileParameters(tool.parameters, ajvForParameters)) {
          findings.warnings.push(`drift_tool_parameters_no_jsonschema_valido: ${slug} tool "${name}" — parameters no compila como JSON Schema`);
        }
      }

      // 4 + 5. handler existe + async
      const handlerName = tool.handler;
      if (typeof handlerName === 'string' && handlerName.length > 0) {
        const def = findHandlerDef(sources, handlerName);
        if (!def) {
          findings.warnings.push(`drift_tool_sin_handler_o_handler_inexistente: ${slug} tool "${name}" — handler "${handlerName}" no encontrado en codigo`);
        } else {
          if (!def.isAsync) {
            const rel = path.relative(REPO_ROOT, def.file);
            findings.warnings.push(`drift_tool_handler_no_async: ${slug} tool "${name}" handler "${handlerName}" en ${rel}:${def.line} — falta async`);
          }
          // 8. drift_tool_handler_acceso_directo_a_otros_modulos
          const body = handlerBody(def.file, def.line);
          if (/\bmoduleLoader\.getModule\b/.test(body)) {
            const rel = path.relative(REPO_ROOT, def.file);
            findings.warnings.push(`drift_tool_handler_acceso_directo_a_otros_modulos: ${slug} tool "${name}" handler "${handlerName}" en ${rel}:${def.line} — usa moduleLoader.getModule (drift event-core)`);
          }
          // 10. drift_tool_invoca_llm_directamente
          for (const host of LLM_HOSTS) {
            if (body.includes(host)) {
              const rel = path.relative(REPO_ROOT, def.file);
              findings.warnings.push(`drift_tool_invoca_llm_directamente: ${slug} tool "${name}" handler "${handlerName}" en ${rel}:${def.line} — referencia ${host} (debe ir via llm.complete.request)`);
              break;
            }
          }
          // 13. drift_tool_handler_que_devuelve_valor_pelado (info, heuristica)
          // Buscar return statements en el body. Si todos son `return <valor>` sin objeto literal con status/data/error.
          const returnRe = /\breturn\s+([^;\n]+)/g;
          const returns = [];
          let rm;
          while ((rm = returnRe.exec(body)) !== null) returns.push(rm[1].trim());
          if (returns.length > 0) {
            const allCanonical = returns.every(r => /^\{/.test(r) && (/(status|data|error)/.test(r) || /\.{3}/.test(r)));
            if (!allCanonical) {
              const rel = path.relative(REPO_ROOT, def.file);
              findings.info.push(`drift_tool_handler_que_devuelve_valor_pelado: ${slug} tool "${name}" en ${rel}:${def.line} — algun return no parece shape canonico {status, data|error}`);
            }
          }
          // 7. drift_tool_errores_conocidos_vacio_handler_devuelve_error
          const erroresConocidos = Array.isArray(tool.errores_conocidos) ? tool.errores_conocidos : [];
          if (erroresConocidos.length === 0 && /\berror\s*:/.test(body)) {
            const rel = path.relative(REPO_ROOT, def.file);
            findings.info.push(`drift_tool_errores_conocidos_vacio_handler_devuelve_error: ${slug} tool "${name}" en ${rel}:${def.line} — errores_conocidos vacio pero handler tiene returns con campo error`);
          }
        }
      }

      // 6. drift_tool_errores_conocidos_codigo_no_canonico
      if (errorCodes && Array.isArray(tool.errores_conocidos)) {
        for (const code of tool.errores_conocidos) {
          if (typeof code !== 'string') continue;
          if (!errorCodes.has(code)) {
            findings.warnings.push(`drift_tool_errores_conocidos_codigo_no_canonico: ${slug} tool "${name}" — codigo "${code}" no esta en catalogo errors.json`);
          }
        }
      }
    }
  }

  // 9. drift_dos_modulos_con_misma_tool_name
  for (const [name, slugs] of nameMap) {
    const unique = [...new Set(slugs)];
    if (unique.length > 1) {
      findings.errors.push(`drift_dos_modulos_con_misma_tool_name: name "${name}" declarado por ${unique.length} modulos: ${unique.join(', ')}`);
    }
  }

  // 14. drift_invocacion_directa_de_tool_fuera_del_framework (v1.1)
  // Scan TODOS los *.js bajo modules/ buscando invocacion directa de tool handlers
  // fuera del bus canonico. La unica home valida de estos patrones es
  // core/modules/loader.js (framework). En modules/ es error.
  scanDirectToolInvocation(findings);
}

function scanDirectToolInvocation(findings) {
  // Recopila todos los *.js bajo modules/ (excluyendo _legacy, __tests__, node_modules).
  const filesToScan = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '_legacy' || entry.name === '__tests__' ||
            entry.name.startsWith('.')) continue;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        filesToScan.push(full);
      }
    }
  }
  walk(MODULES_DIR);

  // Patrones prohibidos. Cada match → drift error.
  const PROHIBITED = [
    {
      label: 'toolsRegistry.get(...).handler(',
      re: /\btoolsRegistry\s*\??\.\s*get\s*\([^)]*\)\s*\??\.\s*handler\s*\(/g
    },
    {
      label: 'moduleLoader.executeTool(',
      re: /\b_?moduleLoader\s*\??\.\s*executeTool\s*\(/g
    }
  ];

  for (const file of filesToScan) {
    let content;
    try { content = fs.readFileSync(file, 'utf-8'); } catch (_) { continue; }
    const rel = path.relative(REPO_ROOT, file);

    for (const { label, re } of PROHIBITED) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(content)) !== null) {
        const line = lineOfOffset(content, m.index);
        findings.errors.push(
          `drift_invocacion_directa_de_tool_fuera_del_framework: ${rel}:${line} — usa ${label}...) ` +
          `para invocar tool fuera del bus canonico. Refactor: publicar evento <toolName> con {request_id, ...args} ` +
          `y subscribir <toolName>.response correlacionado por request_id.`
        );
      }
    }
  }
}

// ---- Reporting ----

function reportFindings(findings) {
  if (findings.errors.length > 0) {
    console.log(`${RED}cross-system errors (${findings.errors.length})${RST}`);
    for (const e of findings.errors) console.log(`  ${RED}✗${RST} ${e}`);
  }
  if (findings.warnings.length > 0) {
    console.log(`${YEL}cross-system warnings (${findings.warnings.length})${RST}`);
    for (const w of findings.warnings) console.log(`  ${YEL}!${RST} ${w}`);
  }
  if (findings.info.length > 0) {
    console.log(`${CYAN}cross-system info (${findings.info.length})${RST}`);
    for (const i of findings.info) console.log(`  ${CYAN}i${RST} ${i}`);
  }
  if (findings.errors.length === 0 && findings.warnings.length === 0 && findings.info.length === 0) {
    console.log(`${GREEN}cross-system: sin drift detectado${RST}`);
  }
}

// ---- Main ----

function main() {
  const checkSystemFlag = process.argv.includes('--check-system');

  // 1. Compilar schemas (estructural)
  try {
    const { schemas } = compileSchemas();
    console.log(`${GREEN}PASS${RST} tools (${Object.keys(schemas).length} schemas compilan AJV strict)`);
  } catch (err) {
    console.log(`${RED}FAIL${RST} tools (schemas no compilan)`);
    console.log(`  ${err.message}`);
    process.exit(1);
  }

  // 2. Verificar contrato existe y JSON valido
  if (!fs.existsSync(CONTRACT_PATH)) {
    console.log(`${RED}FAIL${RST} tools.contract.json no existe`);
    process.exit(1);
  }
  try { loadJson(CONTRACT_PATH); }
  catch (e) {
    console.log(`${RED}FAIL${RST} tools.contract.json invalido (${e.message})`);
    process.exit(1);
  }

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra modulos del repo ===${RST}`);
    const findings = { errors: [], warnings: [], info: [] };
    checkAll(findings);
    reportFindings(findings);
  }

  process.exit(0);
}

main();

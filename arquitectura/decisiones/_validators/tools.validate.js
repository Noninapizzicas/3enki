#!/usr/bin/env node
/**
 * Validador del contrato transversal tools v1.2.0.
 *
 * Uso:
 *   node tools.validate.js                # valida los 3 JSON Schemas estructuralmente
 *   node tools.validate.js --check-system # adicional: cross-checks contra modulos del repo
 *
 * Cross-checks (18):
 *   1. tools_schemas_compile_ok                            (error)   — los 3 schemas compilan AJV strict.
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
 *  15. drift_modulo_con_uihandler_register_manual         (error)   — uiHandler.register() llamado en codigo de modulo (v1.2).
 *  16. drift_ui_handlers_con_shape_de_dispatch            (warning) — ui_handlers[i] con campo 'domain' o top-level 'uiActions'/'handlers' como dispatch (v1.2).
 *  17. drift_tool_http_sin_url_o_method                   (warning) — tools_http[i] no cumple tool.http.declaration.schema (v1.2).
 *  18. drift_dos_tools_con_misma_clave_ui_derivada        (error)   — colision en (domain, action) derivado del name (v1.2).
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

const NAME_RE = /^[a-z0-9-]+\.[a-z0-9_-]+(\.[a-z0-9_-]+)*$/;
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
  // Lee desde la firma del metodo y balancea llaves para extraer SOLO el cuerpo
  // del metodo actual (no se mete en el siguiente metodo de la clase).
  try {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    if (startLine < 1 || startLine > lines.length) return '';
    // Buscar la `{` que abre el cuerpo, a partir de startLine
    let idx = lines.slice(0, startLine - 1).join('\n').length + (startLine > 1 ? 1 : 0);
    while (idx < content.length && content[idx] !== '{') idx++;
    if (idx >= content.length) return lines.slice(startLine - 1, startLine + 79).join('\n');
    const start = idx;
    let depth = 1;
    idx++;
    while (idx < content.length && depth > 0) {
      const ch = content[idx];
      if (ch === '"' || ch === "'" || ch === '`') {
        const q = ch; idx++;
        while (idx < content.length && content[idx] !== q) {
          if (content[idx] === '\\') idx++;
          idx++;
        }
      } else if (ch === '/' && content[idx+1] === '/') {
        while (idx < content.length && content[idx] !== '\n') idx++;
      } else if (ch === '/' && content[idx+1] === '*') {
        idx += 2;
        while (idx < content.length-1 && !(content[idx]==='*' && content[idx+1]==='/')) idx++;
        idx += 2;
        continue;
      } else if (ch === '{') depth++;
      else if (ch === '}') depth--;
      idx++;
    }
    return content.slice(start, idx);
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

/**
 * Igual que gatherAllTools pero para module.json.tools_http[] (v1.2).
 * Devuelve solo modulos que declaran tools_http no vacio.
 */
function gatherAllToolsHttp() {
  const out = [];
  for (const { dir, slug } of listModulesWithManifest()) {
    const m = readManifest(dir);
    if (!m) continue;
    const toolsHttp = m.tools_http || [];
    if (!Array.isArray(toolsHttp) || toolsHttp.length === 0) continue;
    out.push({ slug, dir, language: m.language || 'en', tools_http: toolsHttp });
  }
  return out;
}

/**
 * Recoge para CADA modulo su manifest completo (para auditar ui_handlers,
 * uiActions, handlers como keys top-level — necesario para check 16).
 */
function gatherAllManifests() {
  const out = [];
  for (const { dir, slug } of listModulesWithManifest()) {
    const m = readManifest(dir);
    if (!m) continue;
    out.push({ slug, dir, manifest: m });
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
          // Acepta como retornos canonicos:
          //   - `return { status: ..., data|error: ... }` (literal, multilinea)
          //   - `return this._errorResponse(...)` (helper de BaseModule)
          //   - `return this._handleHandlerError(...)` (helper canonico)
          //   - `return this._buildErrorResponse(...)` / `_buildSuccessResponse(...)`
          //   - `return [await] this._withStore(...)` / `_readOnly(...)` (wrappers
          //     que devuelven el shape del mutator).
          // Parser balanceado: para cada `return ` captura hasta el `;` que
          // cierra el statement (respetando parens y braces internos).
          const returns = [];
          const returnStarts = [...body.matchAll(/\breturn\s+/g)];
          for (const rs of returnStarts) {
            let i = rs.index + rs[0].length;
            let parens = 0, braces = 0, brackets = 0;
            const start = i;
            while (i < body.length) {
              const ch = body[i];
              if (ch === '"' || ch === "'" || ch === '`') {
                const q = ch; i++;
                while (i < body.length && body[i] !== q) {
                  if (body[i] === '\\') i++;
                  i++;
                }
              } else if (ch === '(') parens++;
              else if (ch === ')') parens--;
              else if (ch === '{') braces++;
              else if (ch === '}') braces--;
              else if (ch === '[') brackets++;
              else if (ch === ']') brackets--;
              else if (ch === ';' && parens === 0 && braces === 0 && brackets === 0) break;
              i++;
            }
            returns.push(body.slice(start, i).trim());
          }
          if (returns.length > 0) {
            const isCanonical = (r) => {
              // Literal: empieza con `{` y contiene status/data/error/spread
              if (/^\{/.test(r) && (/\b(status|data|error)\s*:/.test(r) || /\.{3}/.test(r))) return true;
              // Helpers canonicos POC2/BaseModule
              if (/^(await\s+)?this\._(errorResponse|handleHandlerError|buildErrorResponse|buildSuccessResponse)\s*\(/.test(r)) return true;
              // Wrappers de store
              if (/^(await\s+)?this\._(withStore|readOnly)\s*\(/.test(r)) return true;
              // Wrappers RPC-over-bus: handlers `onToolXxx` que delegan en
              // un dispatcher que publica response al bus. El shape canonico
              // se cumple en el evento response, no en el return.
              if (/^(await\s+)?this\._(toolDispatch|uiAdapt|dispatch)\s*\(/.test(r)) return true;
              // Despacho dinamico: `return this[handlerName](params)` — el
              // shape canonico se cumple en el handler invocado.
              if (/^(await\s+)?this\[\w+\]\s*\(/.test(r)) return true;
              // Trust by default para helpers privados del modulo: asumimos
              // que `return this._<helper>(...)` devuelve canonico. Drifts
              // reales serian `return result` (variable suelta) o `return null`
              // o `return data.foo` — esos NO matchean `this._xxx(`.
              if (/^(await\s+)?this\._\w+\s*\(/.test(r)) return true;
              return false;
            };
            const allCanonical = returns.every(isCanonical);
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

  // 15. drift_modulo_con_uihandler_register_manual (v1.2)
  // Scan modules/*.js para llamadas uiHandler.register(). La unica home valida
  // de esa primitiva es core/ui/UIRequestHandler.js (define) y
  // core/modules/loader.js (la framework la invoca derivada de tools[]).
  // En modules/ es error: el modulo no declara handlers UI manualmente.
  scanManualUiHandlerRegister(findings);

  // 16. drift_ui_handlers_con_shape_de_dispatch (v1.2)
  // Scan manifests para detectar ui_handlers[] con shape de dispatch legacy
  // (campo 'domain' presente) o top-level 'uiActions'/'handlers' como aliases
  // del normalizeUIHandlers del loader (loader.js:879). v1.2 fuerza tools[]
  // como unico origen de dispatch — ui_handlers queda como surface metadata.
  scanLegacyUiHandlersShape(findings);

  // 17. drift_tool_http_sin_url_o_method (v1.2)
  // Validar cada entry de module.json.tools_http[] contra el schema canonico
  // tool.http.declaration.schema.json. Cross-check adicional: si auth_type
  // distinto de 'none' y credential_id ausente, warning.
  scanToolsHttpShape(findings, schemaAjv);

  // 18. drift_dos_tools_con_misma_clave_ui_derivada (v1.2)
  // Build map global derivedDomain.derivedAction -> [origenes]. Si una clave
  // tiene 2+ origenes (tools[] o tools_http[] de modulos distintos, o mezcla
  // tools+tools_http del mismo modulo), drift error: la segunda registracion
  // sobrescribe la primera con un warn en uiHandler.
  scanUiKeyCollisions(findings);
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

// ---- v1.2 cross-checks ----

function scanManualUiHandlerRegister(findings) {
  // Mismo walk que scanDirectToolInvocation: *.js bajo modules/, excluyendo
  // node_modules/, _legacy/, __tests__/, dirs ocultas.
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

  // Patron: (this.)?uiHandler.register(...)
  // No usamos uiHandler.unregister porque es legitimo en cleanup; solo register.
  const re = /\b(?:this\.)?uiHandler\s*\.\s*register\s*\(/g;

  for (const file of filesToScan) {
    let content;
    try { content = fs.readFileSync(file, 'utf-8'); } catch (_) { continue; }
    const rel = path.relative(REPO_ROOT, file);
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      const line = lineOfOffset(content, m.index);
      findings.errors.push(
        `drift_modulo_con_uihandler_register_manual: ${rel}:${line} — usa uiHandler.register(...) ` +
        `manualmente. tools.contract v1.2: el dispatch UI se deriva automaticamente de tools[]/tools_http[] ` +
        `en core/modules/loader.js::registerToolsForAI. Migracion: mover el handler a module.json.tools[] ` +
        `con name '<modulo>.<accion>' y handler apuntando al metodo. El loader lo registrara en uiHandler ` +
        `con domain/action derivados del name.`
      );
    }
  }
}

function scanLegacyUiHandlersShape(findings) {
  // ui_handlers[i] con campo 'domain' = shape de dispatch legacy.
  // top-level 'uiActions' o 'handlers' (aliases que normalizeUIHandlers acepta) = drift.
  for (const { slug, manifest } of gatherAllManifests()) {
    const ui = manifest.ui_handlers;
    if (Array.isArray(ui)) {
      ui.forEach((entry, idx) => {
        if (entry && typeof entry === 'object' && typeof entry.domain === 'string') {
          findings.warnings.push(
            `drift_ui_handlers_con_shape_de_dispatch: ${slug} ui_handlers[${idx}] tiene campo 'domain' ` +
            `(${entry.domain}). tools.contract v1.2 + frontend.contract v1.2: ui_handlers[] es solo surface ` +
            `metadata {type, zone, action, handler}. El dispatch se declara en tools[] (el loader deriva ` +
            `domain/action automaticamente del tool name).`
          );
        }
      });
    }
    // Aliases legacy top-level
    for (const alias of ['uiActions', 'handlers']) {
      const raw = manifest[alias];
      if (!Array.isArray(raw)) continue;
      const hasDispatchShape = raw.some(e => e && typeof e === 'object' &&
        typeof e.domain === 'string' && typeof e.action === 'string');
      if (hasDispatchShape) {
        findings.warnings.push(
          `drift_ui_handlers_con_shape_de_dispatch: ${slug} declara top-level '${alias}' con shape de dispatch ` +
          `{domain, action, handler}. tools.contract v1.2: migrar a module.json.tools[]. loader.normalizeUIHandlers ` +
          `(loader.js:879) sigue aceptando este alias como compat transitoria — eliminar tras migrar todos los modulos.`
        );
      }
    }
  }
}

function scanToolsHttpShape(findings, schemaAjv) {
  const validateHttp = schemaAjv.getSchema('tool.http.declaration.schema.json');
  if (!validateHttp) return; // schema no disponible en este AJV — abort silencioso

  for (const { slug, tools_http } of gatherAllToolsHttp()) {
    tools_http.forEach((entry, idx) => {
      if (typeof entry !== 'object' || entry === null) {
        findings.warnings.push(`drift_tool_http_sin_url_o_method: ${slug} tools_http[${idx}] — entry no es objeto`);
        return;
      }
      const ok = validateHttp(entry);
      if (!ok) {
        const errs = (validateHttp.errors || []).map(e => `${e.instancePath || '/'} ${e.message}`).join('; ');
        const name = entry.name || `<index ${idx}>`;
        findings.warnings.push(`drift_tool_http_sin_url_o_method: ${slug} tools_http "${name}" — ${errs}`);
      }
      // Cross-check security: si auth_type !== 'none' y credential_id ausente, warning especifico.
      const authType = entry.http && entry.http.auth_type;
      if (authType && authType !== 'none' && !entry.http.credential_id) {
        const name = entry.name || `<index ${idx}>`;
        findings.warnings.push(
          `drift_tool_http_sin_url_o_method: ${slug} tools_http "${name}" declara auth_type='${authType}' ` +
          `pero NO declara credential_id. security.contract: credenciales solo via credential-manager, ` +
          `nunca env vars ni inline.`
        );
      }
    });
  }
}

function scanUiKeyCollisions(findings) {
  // Build map global derivedDomain.derivedAction -> [origenes]
  // Mismo split que core/modules/loader.js::_deriveUiKeyFromToolName: primer punto.
  const uiKeyMap = new Map(); // 'domain.action' -> [{slug, source, name}]

  function addEntry(slug, source, name) {
    if (typeof name !== 'string' || name.length === 0) return;
    const firstDot = name.indexOf('.');
    if (firstDot < 1 || firstDot === name.length - 1) return; // mismo guard que el loader
    const domain = name.substring(0, firstDot);
    const action = name.substring(firstDot + 1);
    const key = `${domain}.${action}`;
    if (!uiKeyMap.has(key)) uiKeyMap.set(key, []);
    uiKeyMap.get(key).push({ slug, source, name });
  }

  for (const { slug, tools } of gatherAllTools()) {
    for (const tool of tools) {
      if (tool && typeof tool.name === 'string') addEntry(slug, 'tools[]', tool.name);
    }
  }
  for (const { slug, tools_http } of gatherAllToolsHttp()) {
    for (const entry of tools_http) {
      if (entry && typeof entry.name === 'string') addEntry(slug, 'tools_http[]', entry.name);
    }
  }

  for (const [key, origins] of uiKeyMap) {
    if (origins.length < 2) continue;
    // Si todas las origenes son del MISMO slug+source con el MISMO name, no es colision real
    // (puede pasar con manifests con duplicados — drift de otro tipo, no de este check).
    const distinct = [...new Set(origins.map(o => `${o.slug}:${o.source}:${o.name}`))];
    if (distinct.length < 2) continue;
    const desc = origins.map(o => `${o.slug} (${o.source}: "${o.name}")`).join(' vs ');
    findings.errors.push(
      `drift_dos_tools_con_misma_clave_ui_derivada: clave UI "${key}" producida por ${origins.length} fuentes: ${desc}. ` +
      `El segundo register en uiHandler sobrescribira el primero con warn 'ui.request.handler.overwrite'. ` +
      `Cada tool debe producir una clave (domain, action) unica cross-repo.`
    );
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

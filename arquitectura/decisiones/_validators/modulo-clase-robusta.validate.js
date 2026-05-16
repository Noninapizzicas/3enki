#!/usr/bin/env node
/**
 * Validador del contrato `modulo-clase-robusta` v1.0.0.
 *
 * Captura "cada modulo es UNA CLASE DISTINTA bajo OOP adaptado a event-core":
 * encapsulacion + herencia vertical de BaseModule + polimorfismo limitado.
 * NO composicion entre modulos, NO DI cross-modulo, NO herencia entre dominios.
 *
 * Cross-checks (14):
 *  1.  drift_modulo_no_extiende_basemodule              (error)
 *  2.  drift_modulo_extiende_otro_modulo                (error)
 *  3.  drift_constructor_sin_super                      (error)
 *  4.  drift_constructor_con_io                         (warning)
 *  5.  drift_campo_no_declarado_en_constructor          (warning)
 *  6.  drift_secciones_canonicas_faltantes              (warning)
 *  7.  drift_metodo_bus_sin_naming_canonico             (warning)
 *  8.  drift_metodo_http_sin_naming_canonico            (warning)
 *  9.  drift_subscribe_sin_handler_implementado         (error)
 *  10. drift_handler_publico_no_declarado_en_manifest   (warning)
 *  11. drift_polimorfismo_sin_super                     (warning)
 *  12. drift_publicacion_directa_sin_helper             (warning)
 *  13. drift_onunload_no_limpia_recursos_abiertos       (warning)
 *  14. drift_modulo_publica_estado_interno              (info)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT     = path.resolve(__dirname, '../../..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/modulo-clase-robusta.contract.json');
const MODULES_DIR   = path.join(REPO_ROOT, 'modules');

const RED='\x1b[31m', GREEN='\x1b[32m', YEL='\x1b[33m', CYAN='\x1b[36m', RST='\x1b[0m';

const SECCIONES_CANONICAS = [
  '_doc', 'id', 'version', 'creada', 'supersedes_nota', 'objetivo', 'inputs',
  'filosofia', 'principios', 'decisiones_arquitectonicas', 'prohibido',
  'output_shape_resumen', 'reglas_de_extraccion', 'derivaciones',
  'validaciones_cross_realizadas_por_validator', 'salida_validador',
  'convenciones_complementarias'
];

const BASE_INHERITED = new Set([
  '_errorResponse', '_classifyHandlerError', '_statusFromCode',
  '_handleHandlerError', '_publicarEvento', '_enrich'
]);

const SECCION_KEYWORDS = {
  lifecycle: /\b(lifecycle|ciclo de vida)\b/i,
  busApi:    /\bbus\s*api\b/i,
  httpApi:   /\b(http|ui)\s*(\/\s*ui\s*)?\s*api\b/i,
  dominio:   /\bdominio|protegid/i,
  privados:  /\bprivados|privates\b/i
};

// =========================================================================

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

function lineOf(content, idx) { return content.slice(0, idx).split('\n').length; }

function listModuleIndexes() {
  const out = [];
  function walk(dir, depth = 0) {
    if (depth > 3) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
    }
    const mj = path.join(dir, 'module.json');
    const ij = path.join(dir, 'index.js');
    if (fs.existsSync(mj) && fs.existsSync(ij)) {
      out.push({ dir, indexPath: ij, manifestPath: mj });
    }
  }
  if (fs.existsSync(MODULES_DIR)) walk(MODULES_DIR);
  return out;
}

// Extract balanced method (including its braces) from content. Returns null if not found.
function extractMethod(content, name) {
  const re = new RegExp(`(\\n\\s+)(static\\s+)?(async\\s+)?${name}\\s*\\(`);
  const m = content.match(re);
  if (!m) return null;
  const startIdx = m.index + m[1].length;
  let i = m.index + m[0].length;
  let parenDepth = 1;
  while (i < content.length && parenDepth > 0) {
    if (content[i] === '(') parenDepth++;
    else if (content[i] === ')') parenDepth--;
    i++;
  }
  while (i < content.length && /\s/.test(content[i])) i++;
  if (content[i] !== '{') return null;
  let braceDepth = 1;
  i++;
  const bodyStart = i;
  while (i < content.length && braceDepth > 0) {
    if (content[i] === '{') braceDepth++;
    else if (content[i] === '}') braceDepth--;
    i++;
  }
  return {
    startIdx,
    endIdx: i,
    bodyStart,
    bodyEnd: i - 1,
    text: content.slice(startIdx, i),
    body: content.slice(bodyStart, i - 1)
  };
}

// List all method names declared at class top-level. Heuristic robusta:
// busca desde la declaracion `class X extends Y {` hasta `module.exports`
// (o final del archivo) y detecta lineas con indent EXACTAMENTE igual al
// indent canonico de los members (normalmente 2). Esto evita confundirse
// con regex literals dentro de cuerpos de metodos.
function listClassMethods(content) {
  const classMatch = content.match(/class\s+(\w+)\s+extends\s+\w+\s*\{/);
  if (!classMatch) return [];
  const startScan = classMatch.index + classMatch[0].length;
  // Find module.exports or end of file as upper bound
  const exportIdx = content.indexOf('\nmodule.exports', startScan);
  const endScan = exportIdx > 0 ? exportIdx : content.length;
  const scanBody = content.slice(startScan, endScan);

  // Detect all candidate method-like lines, including their indent. Filtrar
  // PRIMERO las palabras-clave de control de flujo (if/for/while/...) para
  // que el conteo de indent no se contamine con cuerpos anidados.
  const NOISE = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'do', 'else', 'try']);
  const re = /^( +)(static\s+)?(async\s+)?(#?[_$A-Za-z][_$A-Za-z0-9]*)\s*\([^)]*\)\s*\{/gm;
  const candidates = [];
  let m;
  while ((m = re.exec(scanBody)) !== null) {
    if (NOISE.has(m[4])) continue;
    candidates.push({ indent: m[1].length, name: m[4] });
  }
  if (candidates.length === 0) return [];
  // Canonical class-member indent: the SMALLEST indent that appears at least once.
  // Class members can ONLY be at this indent; deeper indents are nested closures.
  const memberIndent = Math.min(...candidates.map(c => c.indent));

  const result = [];
  for (const c of candidates) {
    if (c.indent !== memberIndent) continue;
    result.push(c.name);
  }
  return result;
}

function getClassDecl(content) {
  const m = content.match(/class\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/);
  if (!m) return null;
  return { name: m[1], extendsWhat: m[2] || null, idx: m.index };
}

function isModuleClass(name) {
  return /Module$/.test(name) || /Gateway$/.test(name) || /^[A-Z]\w*$/.test(name);
}

function isPoc(slug) {
  return /-poc$/.test(slug) || /^_/.test(slug);
}

// =========================================================================
// Cross-checks
// =========================================================================

function checkExtiendeBaseModule(modules, findings) {
  for (const { dir, indexPath } of modules) {
    const slug = path.relative(MODULES_DIR, dir);
    if (isPoc(slug)) continue;
    const content = fs.readFileSync(indexPath, 'utf-8');
    const cls = getClassDecl(content);
    if (!cls) continue; // module without a main class (function-style legacy); skip
    if (!cls.extendsWhat) {
      findings.errors.push(`drift_modulo_no_extiende_basemodule: ${slug} — class ${cls.name} no extends`);
    } else if (cls.extendsWhat !== 'BaseModule') {
      findings.errors.push(`drift_modulo_extiende_otro_modulo: ${slug} — class ${cls.name} extends ${cls.extendsWhat} (solo BaseModule permitido)`);
    }
  }
}

function checkConstructorConSuper(modules, findings) {
  for (const { dir, indexPath } of modules) {
    const slug = path.relative(MODULES_DIR, dir);
    if (isPoc(slug)) continue;
    const content = fs.readFileSync(indexPath, 'utf-8');
    const cls = getClassDecl(content);
    if (!cls || cls.extendsWhat !== 'BaseModule') continue;
    const ctor = extractMethod(content, 'constructor');
    if (!ctor) {
      findings.warnings.push(`drift_constructor_sin_super: ${slug} — sin constructor explicito`);
      continue;
    }
    // First non-comment, non-whitespace statement should be super(...)
    const trimmed = ctor.body
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .trim();
    if (!/^super\s*\(/.test(trimmed)) {
      findings.errors.push(`drift_constructor_sin_super: ${slug} — constructor no llama super() como primera instruccion`);
    }
  }
}

function checkConstructorSinIO(modules, findings) {
  const IO_PATTERNS = [
    { re: /\bfs\.[a-z]+(?:Sync)?\s*\(/, label: 'fs.' },
    { re: /\bfetch\s*\(/, label: 'fetch(' },
    { re: /\bsetInterval\s*\(/, label: 'setInterval' },
    { re: /\bsetTimeout\s*\(/, label: 'setTimeout' },
    { re: /\bnew\s+Database\b/, label: 'new Database' },
    { re: /\bmqtt\.[a-z]+\s*\(/, label: 'mqtt.' },
    { re: /\brequire\s*\(\s*['"](?:http|https|net|dgram|child_process|sqlite3|better-sqlite3)['"]\s*\)/, label: 'require(net/http/db)' },
    { re: /\.connect\s*\(/, label: '.connect(' }
  ];
  for (const { dir, indexPath } of modules) {
    const slug = path.relative(MODULES_DIR, dir);
    if (isPoc(slug)) continue;
    const content = fs.readFileSync(indexPath, 'utf-8');
    const ctor = extractMethod(content, 'constructor');
    if (!ctor) continue;
    for (const { re, label } of IO_PATTERNS) {
      const m = ctor.body.match(re);
      if (m) {
        const ln = lineOf(content, ctor.bodyStart + m.index);
        findings.warnings.push(`drift_constructor_con_io: ${slug} ${path.relative(REPO_ROOT, indexPath)}:${ln} — constructor invoca ${label}`);
        break;
      }
    }
  }
}

function checkCampoNoDeclaradoEnConstructor(modules, findings) {
  for (const { dir, indexPath } of modules) {
    const slug = path.relative(MODULES_DIR, dir);
    if (isPoc(slug)) continue;
    const content = fs.readFileSync(indexPath, 'utf-8');
    const ctor = extractMethod(content, 'constructor');
    const onLoad = extractMethod(content, 'onLoad');
    if (!ctor) continue;
    const declared = new Set();
    const cap = (body) => {
      const re = /this\.(\w+)\s*=/g; let m;
      while ((m = re.exec(body)) !== null) declared.add(m[1]);
    };
    cap(ctor.body);
    if (onLoad) cap(onLoad.body);
    // Now find any `this.X = ...` outside ctor/onLoad
    const allMethods = ['constructor', 'onLoad', 'onUnload'];
    const otherBodies = [];
    // Crude: read whole class body and remove ctor + onLoad ranges
    const cls = getClassDecl(content);
    if (!cls) continue;
    let i = cls.idx + content.slice(cls.idx).indexOf('{');
    let depth = 1; i++;
    const cBStart = i;
    while (i < content.length && depth > 0) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') depth--;
      i++;
    }
    let rest = content.slice(cBStart, i - 1);
    // Remove constructor body
    if (ctor) rest = rest.replace(content.slice(ctor.bodyStart, ctor.bodyEnd), '');
    if (onLoad) rest = rest.replace(content.slice(onLoad.bodyStart, onLoad.bodyEnd), '');
    const re = /this\.(\w+)\s*=/g;
    let m;
    const undeclared = new Set();
    while ((m = re.exec(rest)) !== null) {
      if (!declared.has(m[1]) && m[1] !== 'logger' && m[1] !== 'metrics' && m[1] !== 'eventBus') {
        undeclared.add(m[1]);
      }
    }
    if (undeclared.size > 0) {
      findings.warnings.push(`drift_campo_no_declarado_en_constructor: ${slug} — campos asignados fuera de constructor/onLoad: ${[...undeclared].join(', ')}`);
    }
  }
}

function checkSeccionesCanonicas(modules, findings) {
  for (const { dir, indexPath } of modules) {
    const slug = path.relative(MODULES_DIR, dir);
    if (isPoc(slug)) continue;
    const content = fs.readFileSync(indexPath, 'utf-8');
    // Look at block comments only
    const banners = [...content.matchAll(/\/\/\s*=+[^=\n]+=+|\/\*[\s\S]*?\*\//g)].map(m => m[0]);
    const found = { lifecycle: false, busApi: false, httpApi: false, dominio: false, privados: false };
    for (const b of banners) {
      for (const key of Object.keys(SECCION_KEYWORDS)) {
        if (SECCION_KEYWORDS[key].test(b)) found[key] = true;
      }
    }
    const missing = Object.keys(found).filter(k => !found[k]);
    if (missing.length >= 3) {
      findings.warnings.push(`drift_secciones_canonicas_faltantes: ${slug} — ${missing.length}/5 secciones sin banner: ${missing.join(', ')}`);
    }
  }
}

function checkBusHandlersNaming(modules, findings) {
  for (const { dir, indexPath, manifestPath } of modules) {
    const slug = path.relative(MODULES_DIR, dir);
    if (isPoc(slug)) continue;
    let manifest;
    try { manifest = loadJson(manifestPath); } catch (_) { continue; }
    const subs = manifest?.events?.subscribes || [];
    for (const s of subs) {
      const handler = s.handler;
      if (!handler) continue;
      if (handler === 'onLoad' || handler === 'onUnload') continue;
      if (!/^on[A-Z]/.test(handler)) {
        findings.warnings.push(`drift_metodo_bus_sin_naming_canonico: ${slug}/module.json — subscribe handler "${handler}" no empieza con "on"`);
      }
    }
  }
}

function checkHttpHandlersNaming(modules, findings) {
  for (const { dir, indexPath, manifestPath } of modules) {
    const slug = path.relative(MODULES_DIR, dir);
    if (isPoc(slug)) continue;
    let manifest;
    try { manifest = loadJson(manifestPath); } catch (_) { continue; }
    const apis = manifest?.apis_http || manifest?.apis || [];
    for (const a of apis) {
      const handler = a.handler;
      if (!handler) continue;
      if (!/^handle[A-Z]/.test(handler)) {
        findings.warnings.push(`drift_metodo_http_sin_naming_canonico: ${slug}/module.json — api handler "${handler}" no empieza con "handle"`);
      }
    }
  }
}

function checkSubscribeSinHandler(modules, findings) {
  for (const { dir, indexPath, manifestPath } of modules) {
    const slug = path.relative(MODULES_DIR, dir);
    if (isPoc(slug)) continue;
    let manifest;
    try { manifest = loadJson(manifestPath); } catch (_) { continue; }
    const content = fs.readFileSync(indexPath, 'utf-8');
    const methods = new Set(listClassMethods(content));
    // Skip handlers with dotted notation (Class.method, Strategy/Pattern.method) — patrones de delegacion
    const isFlatHandler = (h) => h && !/[.\/]/.test(h);
    const subs = manifest?.events?.subscribes || [];
    for (const s of subs) {
      if (!isFlatHandler(s.handler)) continue;
      if (!methods.has(s.handler)) {
        findings.errors.push(`drift_subscribe_sin_handler_implementado: ${slug} — subscribe declara handler "${s.handler}" pero el metodo no existe en index.js`);
      }
    }
    const apis = manifest?.apis_http || manifest?.apis || [];
    for (const a of apis) {
      if (!isFlatHandler(a.handler)) continue;
      if (!methods.has(a.handler)) {
        findings.errors.push(`drift_subscribe_sin_handler_implementado: ${slug} — api_http declara handler "${a.handler}" pero el metodo no existe en index.js`);
      }
    }
  }
}

function checkHandlerSinDeclarar(modules, findings) {
  const CANONICOS = new Set(['onLoad', 'onUnload', 'handleHealthCheck']);
  for (const { dir, indexPath, manifestPath } of modules) {
    const slug = path.relative(MODULES_DIR, dir);
    if (isPoc(slug)) continue;
    let manifest;
    try { manifest = loadJson(manifestPath); } catch (_) { continue; }
    const content = fs.readFileSync(indexPath, 'utf-8');
    const methods = listClassMethods(content);
    const declared = new Set();
    for (const s of (manifest?.events?.subscribes || [])) if (s.handler) declared.add(s.handler);
    for (const a of (manifest?.apis_http || manifest?.apis || [])) if (a.handler) declared.add(a.handler);
    for (const t of (manifest?.tools || [])) {
      if (typeof t.handler === 'string') declared.add(t.handler);
      else if (t.handler?.method) declared.add(t.handler.method);
    }
    for (const u of (manifest?.ui_handlers || [])) if (u.handler) declared.add(u.handler);
    for (const m of methods) {
      if (CANONICOS.has(m)) continue;
      if (declared.has(m)) continue;
      if (/^(on|handle)[A-Z]/.test(m)) {
        findings.warnings.push(`drift_handler_publico_no_declarado_en_manifest: ${slug} — metodo "${m}" parece publico pero no aparece en module.json`);
      }
    }
  }
}

function checkPolimorfismoSinSuper(modules, findings) {
  const BASE_OVERRIDABLES = ['_errorResponse', '_classifyHandlerError', '_handleHandlerError', '_publicarEvento', '_statusFromCode'];
  for (const { dir, indexPath } of modules) {
    const slug = path.relative(MODULES_DIR, dir);
    if (isPoc(slug)) continue;
    const content = fs.readFileSync(indexPath, 'utf-8');
    for (const name of BASE_OVERRIDABLES) {
      const m = extractMethod(content, name);
      if (!m) continue;
      // Check if it calls super.<name>
      if (!new RegExp(`super\\.${name}\\s*\\(`).test(m.body)) {
        // Check explicit annotation
        if (/\/\/\s*NO\s+llama\s+super/i.test(content.slice(Math.max(0, m.startIdx - 200), m.startIdx))) continue;
        const ln = lineOf(content, m.startIdx);
        findings.warnings.push(`drift_polimorfismo_sin_super: ${slug} ${path.relative(REPO_ROOT, indexPath)}:${ln} — override de ${name}() no llama super.${name}(...)`);
      }
    }
  }
}

function checkPublicacionDirectaSinHelper(modules, findings) {
  for (const { dir, indexPath } of modules) {
    const slug = path.relative(MODULES_DIR, dir);
    if (isPoc(slug)) continue;
    const content = fs.readFileSync(indexPath, 'utf-8');
    const re = /this\.eventBus\.publish\s*\(/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      // Skip if it's inside _publicarEvento itself (rare in modules but check)
      // Look backwards a few lines for `_publicarEvento(` def
      const before = content.slice(Math.max(0, m.index - 500), m.index);
      if (/\b_publicarEvento\s*\(/.test(before) && !/\}\s*$/.test(before)) continue;
      const ln = lineOf(content, m.index);
      findings.warnings.push(`drift_publicacion_directa_sin_helper: ${slug} ${path.relative(REPO_ROOT, indexPath)}:${ln} — this.eventBus.publish() directo (usar _publicarEvento)`);
    }
  }
}

function checkOnUnloadLimpiaRecursos(modules, findings) {
  const OPENERS = [
    { re: /setInterval\s*\(/, label: 'setInterval', closer: /clearInterval\s*\(/ },
    { re: /setTimeout\s*\(/, label: 'setTimeout', closer: /clearTimeout\s*\(/ },
    { re: /new\s+Database\b/, label: 'new Database', closer: /\.close\s*\(/ }
  ];
  for (const { dir, indexPath } of modules) {
    const slug = path.relative(MODULES_DIR, dir);
    if (isPoc(slug)) continue;
    const content = fs.readFileSync(indexPath, 'utf-8');
    const onLoad = extractMethod(content, 'onLoad');
    const onUnload = extractMethod(content, 'onUnload');
    if (!onLoad) continue;
    for (const { re, label, closer } of OPENERS) {
      if (re.test(onLoad.body)) {
        if (!onUnload || !closer.test(onUnload.body)) {
          findings.warnings.push(`drift_onunload_no_limpia_recursos_abiertos: ${slug} — onLoad abre ${label} pero onUnload no lo cierra (${closer.source})`);
        }
      }
    }
  }
}

function checkPublicaEstadoInterno(modules, findings) {
  // Heuristic: look for _publicarEvento(..., this.<field>) or { ...this.<state> }
  const SUSPECT_FIELDS = ['cache', 'connection', 'config', 'pendingDb', 'state'];
  for (const { dir, indexPath } of modules) {
    const slug = path.relative(MODULES_DIR, dir);
    if (isPoc(slug)) continue;
    const content = fs.readFileSync(indexPath, 'utf-8');
    for (const f of SUSPECT_FIELDS) {
      const re = new RegExp(`_publicarEvento\\s*\\([^)]*this\\.${f}\\b`);
      const m = content.match(re);
      if (m) {
        const ln = lineOf(content, m.index);
        findings.info.push(`drift_modulo_publica_estado_interno: ${slug} ${path.relative(REPO_ROOT, indexPath)}:${ln} — payload contiene this.${f} (estado interno)`);
      }
    }
  }
}

// =========================================================================

function reportFindings(f) {
  if (f.errors.length) {
    console.log(`${RED}cross-system errors (${f.errors.length})${RST}`);
    for (const e of f.errors.slice(0, 20)) console.log(`  ${RED}✗${RST} ${e}`);
    if (f.errors.length > 20) console.log(`  ... y ${f.errors.length - 20} mas`);
  }
  if (f.warnings.length) {
    console.log(`${YEL}cross-system warnings (${f.warnings.length})${RST}`);
    for (const w of f.warnings.slice(0, 20)) console.log(`  ${YEL}!${RST} ${w}`);
    if (f.warnings.length > 20) console.log(`  ... y ${f.warnings.length - 20} mas`);
  }
  if (f.info.length) {
    console.log(`${CYAN}cross-system info (${f.info.length})${RST}`);
    for (const i of f.info.slice(0, 10)) console.log(`  ${CYAN}i${RST} ${i}`);
    if (f.info.length > 10) console.log(`  ... y ${f.info.length - 10} mas`);
  }
  if (!f.errors.length && !f.warnings.length && !f.info.length) {
    console.log(`${GREEN}cross-system: sin drift detectado${RST}`);
  }
}

function main() {
  const checkSystemFlag = process.argv.includes('--check-system');
  if (!fs.existsSync(CONTRACT_PATH)) {
    console.log(`${RED}FAIL${RST} modulo-clase-robusta.contract.json no existe`);
    process.exit(1);
  }
  let contract;
  try { contract = loadJson(CONTRACT_PATH); }
  catch (e) { console.log(`${RED}FAIL${RST} ${e.message}`); process.exit(1); }
  const faltan = SECCIONES_CANONICAS.filter(k => !Object.keys(contract).includes(k));
  if (faltan.length > 0) {
    console.log(`${RED}FAIL${RST} modulo-clase-robusta.contract amplitud incompleta. Faltan: ${faltan.join(', ')}`);
    process.exit(1);
  }
  console.log(`${GREEN}PASS${RST} modulo-clase-robusta (contrato valido, ${Object.keys(contract).length} secciones canonicas)`);

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el repo (modulo-clase-robusta) ===${RST}`);
    const f = { errors: [], warnings: [], info: [] };
    const modules = listModuleIndexes();
    checkExtiendeBaseModule(modules, f);
    checkConstructorConSuper(modules, f);
    checkConstructorSinIO(modules, f);
    checkCampoNoDeclaradoEnConstructor(modules, f);
    checkSeccionesCanonicas(modules, f);
    checkBusHandlersNaming(modules, f);
    checkHttpHandlersNaming(modules, f);
    checkSubscribeSinHandler(modules, f);
    checkHandlerSinDeclarar(modules, f);
    checkPolimorfismoSinSuper(modules, f);
    checkPublicacionDirectaSinHelper(modules, f);
    checkOnUnloadLimpiaRecursos(modules, f);
    checkPublicaEstadoInterno(modules, f);
    reportFindings(f);
  }
  process.exit(0);
}

main();

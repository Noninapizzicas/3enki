#!/usr/bin/env node
/**
 * Validador del sub-contrato llm-flow v1.0.0.
 *
 * Uso:
 *   node llm-flow.validate.js                # valida los 3 JSON Schemas estructuralmente (compilan AJV strict)
 *   node llm-flow.validate.js --check-system # adicional: cross-checks contra modulos del subsistema chat/agentes
 *
 * Cross-checks:
 *  1. llm_flow_schemas_compile_ok               (error)   — los 4 schemas (3 + common) compilan AJV strict
 *  2. drift_modulo_subsistema_sin_schema_ref    (warning) — modulo del subsistema publica/consume evento
 *                                                          llm.complete.* sin declarar request/response_schema_ref
 *  3. drift_publish_response_con_error_inyectado (warning) — codigo publica llm.complete.response con error como
 *                                                            campo (drift legacy del shape ad-hoc)
 *  4. drift_publish_response_con_success_flag    (warning) — codigo publica llm.complete.response con success: bool
 *                                                            (drift legacy)
 *  5. drift_publish_llm_generic_con_conversation_id (warning) — codigo publica llm.complete.* con conversation_id
 *                                                                (deberia usar chat_flow, no llm_generic)
 *  6. drift_evento_llm_fuera_del_catalogo        (warning) — modulo declara publish/subscribe a evento con prefijo
 *                                                            llm. fuera del catalogo de 3 eventos canonicos
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const Ajv  = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const REPO_ROOT      = path.resolve(__dirname, '../../..');
const SCHEMAS_DIR    = path.join(REPO_ROOT, 'arquitectura/decisiones/_schemas/llm-flow');
const CONTRACT_PATH  = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/llm-flow.contract.json');
const MODULES_DIR    = path.join(REPO_ROOT, 'modules');
const AUDITS_DIR     = path.join(REPO_ROOT, 'arquitectura/auditoria/_outputs/modulo-completo');

const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL   = '\x1b[33m';
const CYAN  = '\x1b[36m';
const RST   = '\x1b[0m';

const LLM_FLOW_EVENTS = [
  'llm.complete.request',
  'llm.complete.response',
  'llm.complete.failed'
];

const SUBSYSTEM_SLUGS = [
  'conversacion__ai-gateway',
  'conversacion__ai-agent-framework',
  'conversacion__memory-conversation-summary',
  'conversacion__memory-rag'
];

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

function compileAllSchemas() {
  const ajv = new Ajv({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  const schemas = {};
  for (const f of fs.readdirSync(SCHEMAS_DIR)) {
    if (!f.endsWith('.json')) continue;
    schemas[f] = loadJson(path.join(SCHEMAS_DIR, f));
  }
  for (const [f, s] of Object.entries(schemas)) ajv.addSchema(s, f);
  for (const f of Object.keys(schemas)) {
    if (f === '_common.schema.json') continue;
    ajv.compile(schemas[f]);
  }
  return { schemas, ajv };
}

function listAudits() {
  if (!fs.existsSync(AUDITS_DIR)) return [];
  return fs.readdirSync(AUDITS_DIR).filter(f => f.endsWith('.json')).map(f => path.join(AUDITS_DIR, f));
}

function modulePathFromSlug(slug) {
  return path.join(MODULES_DIR, slug.replace(/__/g, '/'));
}

function readManifest(slug) {
  const p = path.join(modulePathFromSlug(slug), 'module.json');
  if (!fs.existsSync(p)) return null;
  try { return loadJson(p); } catch (_) { return null; }
}

function listModuleSourceFiles(slug) {
  const acc = [];
  const dir = modulePathFromSlug(slug);
  if (!fs.existsSync(dir)) return acc;
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

// ---- Cross-checks ----

function checkSchemaRefDeclared(findings) {
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const manifest = readManifest(slug);
    if (!manifest) continue;

    const publishes  = manifest.events?.publishes  || manifest.publishes  || [];
    const subscribes = manifest.events?.subscribes || manifest.subscribes || [];

    for (const p of publishes) {
      const ev = typeof p === 'string' ? p : p.event;
      if (!LLM_FLOW_EVENTS.includes(ev)) continue;
      if (typeof p === 'string') {
        findings.warnings.push(`drift_modulo_subsistema_sin_schema_ref: ${slug} publica "${ev}" sin response_schema_ref/schema_ref en module.json`);
      } else if (!p.response_schema_ref && !p.schema_ref && !p.schema) {
        findings.warnings.push(`drift_modulo_subsistema_sin_schema_ref: ${slug} publica "${ev}" sin response_schema_ref/schema_ref en module.json`);
      }
    }
    for (const s of subscribes) {
      const ev = s.event;
      if (!LLM_FLOW_EVENTS.includes(ev)) continue;
      if (!s.request_schema_ref && !s.schema_ref) {
        findings.warnings.push(`drift_modulo_subsistema_sin_schema_ref: ${slug} consume "${ev}" sin request_schema_ref/schema_ref en module.json`);
      }
    }
  }
}

function checkPublishResponseConErrorInyectado(findings) {
  // Detectar publish('llm.complete.response', {...error...}) — drift legacy.
  for (const slug of SUBSYSTEM_SLUGS) {
    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf-8');
      // publish('llm.complete.response', { ... error ... }) — heuristica acotada al objeto literal mas cercano
      const re = /publish\s*\(\s*['"`]llm\.complete\.response['"`]\s*,\s*\{[^}]*\berror\b/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_publish_response_con_error_inyectado: ${slug} ${rel}:${ln} — publish "llm.complete.response" con campo 'error' (drift legacy, separar a llm.complete.failed)`);
      }
    }
  }
}

function checkPublishResponseConSuccessFlag(findings) {
  for (const slug of SUBSYSTEM_SLUGS) {
    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf-8');
      const re = /publish\s*\(\s*['"`]llm\.complete\.response['"`]\s*,\s*\{[^}]*\bsuccess\s*:/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_publish_response_con_success_flag: ${slug} ${rel}:${ln} — publish "llm.complete.response" con flag 'success:' (drift legacy, separar response/failed)`);
      }
    }
  }
}

function checkPublishLlmConConversationId(findings) {
  for (const slug of SUBSYSTEM_SLUGS) {
    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf-8');
      // publish('llm.complete.X', { ... conversation_id ... })
      const re = /publish\s*\(\s*['"`]llm\.complete\.\w+['"`]\s*,\s*\{[^}]*\bconversation_id\b/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_publish_llm_generic_con_conversation_id: ${slug} ${rel}:${ln} — publish llm.complete.* con conversation_id (deberia usar chat_flow, no llm_generic)`);
      }
    }
  }
}

function checkEventoLlmFueraDelCatalogo(findings) {
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const manifest = readManifest(slug);
    if (!manifest) continue;

    const publishes  = manifest.events?.publishes  || manifest.publishes  || [];
    const subscribes = manifest.events?.subscribes || manifest.subscribes || [];

    for (const p of publishes) {
      const ev = typeof p === 'string' ? p : p.event;
      if (typeof ev !== 'string') continue;
      if (!ev.startsWith('llm.')) continue;
      if (!LLM_FLOW_EVENTS.includes(ev)) {
        findings.warnings.push(`drift_evento_llm_fuera_del_catalogo: ${slug} publica "${ev}" — solo {llm.complete.request, llm.complete.response, llm.complete.failed} son canonicos`);
      }
    }
    for (const s of subscribes) {
      const ev = s.event;
      if (typeof ev !== 'string') continue;
      if (!ev.startsWith('llm.')) continue;
      if (!LLM_FLOW_EVENTS.includes(ev)) {
        findings.warnings.push(`drift_evento_llm_fuera_del_catalogo: ${slug} consume "${ev}" — solo {llm.complete.request, llm.complete.response, llm.complete.failed} son canonicos`);
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
    const { schemas } = compileAllSchemas();
    console.log(`${GREEN}PASS${RST} llm-flow (${Object.keys(schemas).length} schemas compilan AJV strict)`);
  } catch (err) {
    console.log(`${RED}FAIL${RST} llm-flow (schemas no compilan)`);
    console.log(`  ${err.message}`);
    process.exit(1);
  }

  // 2. Verificar que el contrato existe y es JSON valido
  if (!fs.existsSync(CONTRACT_PATH)) {
    console.log(`${RED}FAIL${RST} llm-flow.contract.json no existe`);
    process.exit(1);
  }
  try { loadJson(CONTRACT_PATH); }
  catch (e) {
    console.log(`${RED}FAIL${RST} llm-flow.contract.json invalido (${e.message})`);
    process.exit(1);
  }

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el subsistema chat/agentes ===${RST}`);
    const findings = { errors: [], warnings: [], info: [] };
    checkSchemaRefDeclared(findings);
    checkPublishResponseConErrorInyectado(findings);
    checkPublishResponseConSuccessFlag(findings);
    checkPublishLlmConConversationId(findings);
    checkEventoLlmFueraDelCatalogo(findings);
    reportFindings(findings);
  }

  process.exit(0);
}

main();

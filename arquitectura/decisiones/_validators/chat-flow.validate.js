#!/usr/bin/env node
/**
 * Validador del sub-contrato chat-flow v1.0.0.
 *
 * Uso:
 *   node chat-flow.validate.js                # valida los 5 JSON Schemas estructuralmente (compilan AJV strict)
 *   node chat-flow.validate.js --check-system # adicional: cross-checks contra modulos del subsistema chat
 *
 * Cross-checks (5):
 *  1. chat_flow_schemas_compile_ok               (error)   — los 6 schemas (5 + common) compilan
 *  2. drift_modulo_subsistema_sin_schema_ref     (warning) — modulo del subsistema publica/consume evento
 *                                                            chat_flow sin declarar request/response_schema_ref
 *  3. drift_uso_de_campo_polisemico_message      (warning) — codigo que aun usa el campo 'message:' en
 *                                                            publishes chat_flow (drift de renombrado)
 *  4. drift_uso_de_campo_fantasma_message_id_user (warning) — codigo que aun usa 'message_id_user'
 *  5. drift_publish_chat_flow_sin_correlation_id (warning) — publish a evento chat_flow sin correlation_id
 *                                                            en los campos visibles del audit
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const Ajv  = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const REPO_ROOT      = path.resolve(__dirname, '../../..');
const SCHEMAS_DIR    = path.join(REPO_ROOT, 'arquitectura/decisiones/_schemas/chat-flow');
const CONTRACT_PATH  = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/chat-flow.contract.json');
const MODULES_DIR    = path.join(REPO_ROOT, 'modules');
const AUDITS_DIR     = path.join(REPO_ROOT, 'arquitectura/auditoria/_outputs/modulo-completo');

const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL   = '\x1b[33m';
const CYAN  = '\x1b[36m';
const RST   = '\x1b[0m';

const CHAT_FLOW_EVENTS = [
  'chat.message.saved',
  'chat.context.enriched',
  'chat.prompt.ready',
  'ai.chat.response',
  'ai.chat.failed'
];

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

function compileAllSchemas() {
  const ajv = new Ajv({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  const schemas = {};
  for (const f of fs.readdirSync(SCHEMAS_DIR)) {
    if (!f.endsWith('.json')) continue;
    const s = loadJson(path.join(SCHEMAS_DIR, f));
    schemas[f] = s;
  }
  // Cargar primero, compilar despues (para resolver $refs entre schemas)
  for (const [f, s] of Object.entries(schemas)) ajv.addSchema(s, f);
  for (const f of Object.keys(schemas)) {
    if (f === '_common.schema.json') continue;  // common no se compila como root
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

    const publishes  = manifest.events?.publishes  || [];
    const subscribes = manifest.events?.subscribes || [];

    for (const p of publishes) {
      const ev = typeof p === 'string' ? p : p.event;
      if (!CHAT_FLOW_EVENTS.includes(ev)) continue;
      if (!p.response_schema_ref && !p.schema_ref && !p.schema) {
        findings.warnings.push(`drift_modulo_subsistema_sin_schema_ref: ${slug} publica "${ev}" sin response_schema_ref/schema_ref en module.json`);
      }
    }
    for (const s of subscribes) {
      const ev = s.event;
      if (!CHAT_FLOW_EVENTS.includes(ev)) continue;
      if (!s.request_schema_ref && !s.schema_ref) {
        findings.warnings.push(`drift_modulo_subsistema_sin_schema_ref: ${slug} consume "${ev}" sin request_schema_ref/schema_ref en module.json`);
      }
    }
  }
}

function checkUsoDeCampoPolisemico(findings) {
  // Detectar publish chat.* o ai.chat.* con field 'message:' literal en object literal
  // Heuristica: regex sobre source. Solo escaneamos modulos del subsistema chat.
  const SUBSYSTEM_SLUGS = ['conversacion__chat-io', 'conversacion__prompt-builder', 'conversacion__ai-gateway', 'conversacion__ai-agent-framework'];
  for (const slug of SUBSYSTEM_SLUGS) {
    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf-8');
      // publish('chat.X' o publish('ai.chat.X' seguido de objeto que contiene message:
      const re = /publish\s*\(\s*['"`](chat\.\w+|ai\.chat\.\w+)['"`]\s*,\s*\{[^}]*\bmessage\s*:/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_uso_de_campo_polisemico_message: ${slug} ${rel}:${ln} — publish "${m[1]}" con campo 'message:' (drift, usar user_message o assistant_message)`);
      }
    }
  }
}

function checkUsoDeCampoFantasma(findings) {
  const SUBSYSTEM_SLUGS = ['conversacion__chat-io', 'conversacion__prompt-builder', 'conversacion__ai-gateway', 'conversacion__ai-agent-framework'];
  for (const slug of SUBSYSTEM_SLUGS) {
    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf-8');
      const re = /\bmessage_id_user\b/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_uso_de_campo_fantasma_message_id_user: ${slug} ${rel}:${ln} — usar message_id (del usuario) y message_id_assistant (del compañero)`);
      }
    }
  }
}

function checkPublishSinCorrelationId(findings) {
  // Cruzar audit modulo-completo: publishes de eventos chat_flow cuyos campos_visibles NO incluyen correlation_id
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const publica = a.eventos?.publica || [];
    for (const p of publica) {
      const evName = p?.nombre?.valor || p?.nombre;
      if (typeof evName !== 'string' || !CHAT_FLOW_EVENTS.includes(evName)) continue;
      const fields = p.payload?.campos_visibles || [];
      if (!fields.includes('correlation_id')) {
        findings.warnings.push(`drift_publish_chat_flow_sin_correlation_id: ${slug} publica ${evName} en ${p.ubicacion || '?'} — payload.campos_visibles no incluye correlation_id`);
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
    console.log(`${GREEN}PASS${RST} chat-flow (${Object.keys(schemas).length} schemas compilan AJV strict)`);
  } catch (err) {
    console.log(`${RED}FAIL${RST} chat-flow (schemas no compilan)`);
    console.log(`  ${err.message}`);
    process.exit(1);
  }

  // 2. Verificar que el contrato existe y es valido JSON
  if (!fs.existsSync(CONTRACT_PATH)) {
    console.log(`${RED}FAIL${RST} chat-flow.contract.json no existe`);
    process.exit(1);
  }
  try { loadJson(CONTRACT_PATH); }
  catch (e) {
    console.log(`${RED}FAIL${RST} chat-flow.contract.json invalido (${e.message})`);
    process.exit(1);
  }

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el subsistema chat ===${RST}`);
    const findings = { errors: [], warnings: [], info: [] };
    checkSchemaRefDeclared(findings);
    checkUsoDeCampoPolisemico(findings);
    checkUsoDeCampoFantasma(findings);
    checkPublishSinCorrelationId(findings);
    reportFindings(findings);
  }

  process.exit(0);
}

main();

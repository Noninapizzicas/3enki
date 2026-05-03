#!/usr/bin/env node
/**
 * Validador del sub-contrato agent-flow v1.0.0.
 *
 * Uso:
 *   node agent-flow.validate.js                # valida los 3 JSON Schemas (compilan AJV strict)
 *   node agent-flow.validate.js --check-system # adicional: cross-checks contra modulos del subsistema agentes
 *
 * Cross-checks (5):
 *  1. agent_flow_schemas_compile_ok                      (error)   — los 4 schemas (3 + common) compilan
 *  2. drift_modulo_agent_flow_sin_schema_ref             (warning) — modulo del subsistema publica/consume evento
 *                                                                    agent_flow sin declarar schema_ref
 *  3. drift_uso_de_alias_agentName                       (warning) — codigo que aun usa 'agentName' (camelCase)
 *  4. drift_publish_agent_flow_sin_correlation_id        (warning) — publish de agent.execute.* sin correlation_id
 *  5. drift_agent_execute_response_con_campo_error       (error)   — publish('agent.execute.response', {...error...})
 *                                                                    rompe separacion success/failure
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const Ajv  = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const REPO_ROOT      = path.resolve(__dirname, '../../..');
const SCHEMAS_DIR    = path.join(REPO_ROOT, 'arquitectura/decisiones/_schemas/agent-flow');
const CONTRACT_PATH  = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/agent-flow.contract.json');
const MODULES_DIR    = path.join(REPO_ROOT, 'modules');
const AUDITS_DIR     = path.join(REPO_ROOT, 'arquitectura/auditoria/_outputs/modulo-completo');

const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL   = '\x1b[33m';
const CYAN  = '\x1b[36m';
const RST   = '\x1b[0m';

const AGENT_FLOW_EVENTS = [
  'agent.execute.request',
  'agent.execute.response',
  'agent.execute.failed',
  'agent.execute.progress'
];

// Modulos conocidos del subsistema agentes para los chequeos de codigo fuente
// (regex sobre el codigo de estos modulos). Otros modulos pueden publicar
// agent.execute.request — esos los detecta el cross-check de schema_ref.
const SUBSYSTEM_SLUGS = ['conversacion__ai-agent-framework'];

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

function walkJs(dir, acc) {
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
      if (!AGENT_FLOW_EVENTS.includes(ev)) continue;
      if (!p.response_schema_ref && !p.schema_ref && !p.schema) {
        findings.warnings.push(`drift_modulo_agent_flow_sin_schema_ref: ${slug} publica "${ev}" sin response_schema_ref/schema_ref en module.json`);
      }
    }
    for (const s of subscribes) {
      const ev = s.event;
      if (!AGENT_FLOW_EVENTS.includes(ev)) continue;
      if (!s.request_schema_ref && !s.schema_ref) {
        findings.warnings.push(`drift_modulo_agent_flow_sin_schema_ref: ${slug} consume "${ev}" sin request_schema_ref/schema_ref en module.json`);
      }
    }
  }
}

function checkUsoDeAliasAgentName(findings) {
  for (const slug of SUBSYSTEM_SLUGS) {
    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf-8');
      // Coincide 'agentName' como key literal o destructuring (no como substring de palabra mayor).
      const re = /\bagentName\b/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_uso_de_alias_agentName: ${slug} ${rel}:${ln} — usar agent_name (snake_case canonico) en lugar del alias camelCase`);
      }
    }
  }
}

function checkResponseConCampoError(findings) {
  for (const slug of SUBSYSTEM_SLUGS) {
    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf-8');
      // publish('agent.execute.response', { ... seguido de error: en el mismo objeto literal
      const re = /publish\s*\(\s*['"`]agent\.execute\.response['"`]\s*,\s*\{[^}]*\berror\s*:/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.errors.push(`drift_agent_execute_response_con_campo_error: ${slug} ${rel}:${ln} — agent.execute.response no debe contener 'error'. Usar agent.execute.failed para errores (no_silent_failures)`);
      }
    }
  }
}

function checkPublishSinCorrelationId(findings) {
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const publica = a.eventos?.publica || [];
    for (const p of publica) {
      const evName = p?.nombre?.valor || p?.nombre;
      if (typeof evName !== 'string' || !AGENT_FLOW_EVENTS.includes(evName)) continue;
      const fields = p.payload?.campos_visibles || [];
      if (!fields.includes('correlation_id')) {
        findings.warnings.push(`drift_publish_agent_flow_sin_correlation_id: ${slug} publica ${evName} en ${p.ubicacion || '?'} — payload.campos_visibles no incluye correlation_id`);
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

  // 1. Compilar schemas
  try {
    const { schemas } = compileAllSchemas();
    console.log(`${GREEN}PASS${RST} agent-flow (${Object.keys(schemas).length} schemas compilan AJV strict)`);
  } catch (err) {
    console.log(`${RED}FAIL${RST} agent-flow (schemas no compilan)`);
    console.log(`  ${err.message}`);
    process.exit(1);
  }

  // 2. Contrato existe + JSON valido
  if (!fs.existsSync(CONTRACT_PATH)) {
    console.log(`${RED}FAIL${RST} agent-flow.contract.json no existe`);
    process.exit(1);
  }
  try { loadJson(CONTRACT_PATH); }
  catch (e) {
    console.log(`${RED}FAIL${RST} agent-flow.contract.json invalido (${e.message})`);
    process.exit(1);
  }

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el subsistema agentes ===${RST}`);
    const findings = { errors: [], warnings: [], info: [] };
    checkSchemaRefDeclared(findings);
    checkUsoDeAliasAgentName(findings);
    checkResponseConCampoError(findings);
    checkPublishSinCorrelationId(findings);
    reportFindings(findings);
  }

  process.exit(0);
}

main();

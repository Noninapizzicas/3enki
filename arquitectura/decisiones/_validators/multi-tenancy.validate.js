#!/usr/bin/env node
/**
 * Validador del transversal multi-tenancy v1.0.0.
 *
 * Cross-checks (3 implementables hoy; los otros 2 requieren auditoria mas fina):
 *  1. multi_tenancy_contract_estructura_valida (error)
 *  2. drift_publish_dominio_sin_project_id    (warning)  — publishes en audits sin project_id
 *  3. drift_publish_atribuible_sin_user_id    (warning)  — publishes de atribucion humana sin user_id
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT     = path.resolve(__dirname, '../../..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/multi-tenancy.contract.json');
const AUDITS_DIR    = path.join(REPO_ROOT, 'arquitectura/auditoria/_outputs/modulo-completo');

const RED='\x1b[31m', GREEN='\x1b[32m', YEL='\x1b[33m', CYAN='\x1b[36m', RST='\x1b[0m';
const SECCIONES_CANONICAS = ['_doc','id','version','creada','supersedes_nota','objetivo','inputs','filosofia','principios','decisiones_arquitectonicas','prohibido','output_shape_resumen','reglas_de_extraccion','derivaciones','validaciones_cross_realizadas_por_validator','salida_validador','convenciones_complementarias'];

// Eventos cross-tenant (lista cerrada, no requieren project_id)
const EVENTOS_CROSS_TENANT = new Set([
  'system.health', 'system.metric', 'system.alert',
  'cluster.node.joined', 'cluster.node.left',
  'broker.connected', 'broker.disconnected',
  'module.loaded', 'module.unloaded',
  'db.query.request', 'db.query.response',
  'credential.resolve.request', 'credential.resolve.response',
  'fs.read.request', 'fs.read.response',
  'fs.write.request', 'fs.write.response'
]);

// Eventos de atribucion humana (requieren user_id)
const EVENTOS_ATRIBUCION = new Set([
  'chat.message.saved',
  'agent.execute.request',
  'agent.execute.response',
  'agent.execute.failed',
  'ai.chat.response',
  'ai.chat.failed'
]);

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

function listAudits() {
  if (!fs.existsSync(AUDITS_DIR)) return [];
  return fs.readdirSync(AUDITS_DIR).filter(f => f.endsWith('.json')).map(f => path.join(AUDITS_DIR, f));
}

function checkPublishesScope(findings) {
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const publica = a.eventos?.publica || [];
    for (const p of publica) {
      const evName = p?.nombre?.valor || p?.nombre;
      if (typeof evName !== 'string') continue;
      const fields = p.payload?.campos_visibles || [];

      // Si no es cross-tenant explicito y es de dominio (no system.*, no cluster.*, no infra.*), debe llevar project_id
      // Prefijos de infra (cross-tenant por naturaleza): system, cluster, broker, module, db,
      // credential, fs, http, plugin (los plugins son globales — no project-scoped),
      // gateway (gateways operan a nivel device).
      const isInfra = /^(system|cluster|broker|module|db|credential|fs|http|plugin|gateway)\./.test(evName);
      const isCrossTenant = EVENTOS_CROSS_TENANT.has(evName) || isInfra;
      if (!isCrossTenant && !fields.includes('project_id')) {
        findings.warnings.push(`drift_publish_dominio_sin_project_id: ${slug} publica ${evName} en ${p.ubicacion || '?'} — sin project_id en campos_visibles`);
      }

      // Si es evento de atribucion humana, debe llevar user_id
      if (EVENTOS_ATRIBUCION.has(evName) && !fields.includes('user_id')) {
        findings.warnings.push(`drift_publish_atribuible_sin_user_id: ${slug} publica ${evName} en ${p.ubicacion || '?'} — sin user_id en campos_visibles`);
      }
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
  if (!fs.existsSync(CONTRACT_PATH)) { console.log(`${RED}FAIL${RST} multi-tenancy.contract.json no existe`); process.exit(1); }
  let contract; try { contract = loadJson(CONTRACT_PATH); } catch (e) { console.log(`${RED}FAIL${RST} ${e.message}`); process.exit(1); }
  const faltan = SECCIONES_CANONICAS.filter(k => !Object.keys(contract).includes(k));
  if (faltan.length > 0) { console.log(`${RED}FAIL${RST} multi-tenancy.contract amplitud incompleta. Faltan: ${faltan.join(', ')}`); process.exit(1); }
  console.log(`${GREEN}PASS${RST} multi-tenancy (contrato valido, ${Object.keys(contract).length} secciones canonicas)`);

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el repo (multi-tenancy) ===${RST}`);
    const f = { errors: [], warnings: [], info: [] };
    checkPublishesScope(f);
    reportFindings(f);
  }
  process.exit(0);
}

main();

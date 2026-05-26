#!/usr/bin/env node
/**
 * Validador del sub-contrato subsistema-recetario v1.0.0.
 *
 * Uso:
 *   node subsistema-recetario.validate.js                # valida schemas + estructura del contrato
 *   node subsistema-recetario.validate.js --check-system # adicional: cross-checks contra modulos del subsistema
 *
 * Cross-checks (10):
 *  1. subsistema_recetario_schemas_compile_ok            (error)   — los 20 schemas compilan AJV strict
 *  2. subsistema_recetario_catalogo_coincide_con_schemas (error)   — catalogo del contrato = archivos en _schemas
 *  3. drift_modulo_subsistema_sin_schema_ref             (warning) — modulo del subsistema publica/consume sin schema_ref
 *  4. drift_publish_subsistema_sin_correlation_id        (warning) — publish sin correlation_id en campos_visibles
 *  5. drift_publish_subsistema_sin_project_id            (warning) — publish con 'proyecto_id' en vez de 'project_id'
 *  6. drift_evento_subsistema_no_canonizado              (error)   — modulo emite evento del namespace fuera del catalogo
 *  7. drift_recetas_consume_eventos_de_satelites         (error)   — recetas se suscribe a eventos de satelites
 *  8. drift_satelite_publica_evento_de_recetas           (error)   — satelite publica receta.*
 *  9. drift_doble_escritura_recetas_json                 (error)   — modulo no-recetas escribe en recetas.json
 * 10. drift_frontend_con_logica_de_dominio               (warning) — heuristica sobre frontend-recetario
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const Ajv  = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const REPO_ROOT      = path.resolve(__dirname, '../../..');
const SCHEMAS_DIR    = path.join(REPO_ROOT, 'arquitectura/decisiones/_schemas/subsistema-recetario');
const CONTRACT_PATH  = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/subsistema-recetario.contract.json');
const MODULES_DIR    = path.join(REPO_ROOT, 'modules');
const AUDITS_DIR     = path.join(REPO_ROOT, 'arquitectura/auditoria/_outputs/modulo-completo');

const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL   = '\x1b[33m';
const CYAN  = '\x1b[36m';
const RST   = '\x1b[0m';

const SUBSYSTEM_NAMESPACES = ['receta.', 'ingrediente.', 'escandallo.', 'tecnica.', 'creativo.', 'produccion.', 'pase.'];

// Slugs canonicos del subsistema. El validator usa el listado del contrato (tipos_canonicos_de_modulo_del_subsistema)
// pero define aqui un fallback robusto.
const SUBSYSTEM_SLUGS_DEFAULT = ['recetas', 'escandallo', 'tecnicas', 'recetario-creativo', 'mise-en-place', 'pase-cocina', 'frontend-recetario'];

const SATELITE_SLUGS = ['escandallo', 'tecnicas', 'recetario-creativo', 'mise-en-place', 'pase-cocina', 'frontend-recetario'];

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

function listSchemaFiles() {
  if (!fs.existsSync(SCHEMAS_DIR)) return [];
  return fs.readdirSync(SCHEMAS_DIR).filter(f => f.endsWith('.json'));
}

function compileAllSchemas() {
  const ajv = new Ajv({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  const schemas = {};
  for (const f of listSchemaFiles()) {
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

function eventNameFromSchemaFile(filename) {
  return filename.replace(/\.schema\.json$/, '');
}

function isSubsystemNamespace(event) {
  return SUBSYSTEM_NAMESPACES.some(ns => event.startsWith(ns));
}

// ---- Cross-checks ----

function checkCatalogVsSchemas(contract, schemaFiles, findings) {
  const catalogEvents = new Set((contract.eventos || []).map(e => e.name));
  const schemaEvents  = new Set(schemaFiles.filter(f => f !== '_common.schema.json').map(eventNameFromSchemaFile));

  for (const e of catalogEvents) {
    if (!schemaEvents.has(e)) {
      findings.errors.push(`subsistema_recetario_catalogo_coincide_con_schemas: evento "${e}" en catalogo pero falta schema en _schemas/subsistema-recetario/`);
    }
  }
  for (const e of schemaEvents) {
    if (!catalogEvents.has(e)) {
      findings.errors.push(`subsistema_recetario_catalogo_coincide_con_schemas: schema "${e}.schema.json" sin entrada en eventos[] del contrato`);
    }
  }
}

function checkSchemaRefDeclared(contract, findings) {
  const catalogEvents = new Set((contract.eventos || []).map(e => e.name));
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    if (!SUBSYSTEM_SLUGS_DEFAULT.includes(slug)) continue;
    const manifest = readManifest(slug);
    if (!manifest) continue;

    const publishes  = manifest.events?.publishes  || [];
    const subscribes = manifest.events?.subscribes || [];

    for (const p of publishes) {
      const ev = typeof p === 'string' ? p : p.event;
      if (!catalogEvents.has(ev)) continue;
      if (!p.response_schema_ref && !p.schema_ref && !p.schema) {
        findings.warnings.push(`drift_modulo_subsistema_sin_schema_ref: ${slug} publica "${ev}" sin response_schema_ref/schema_ref en module.json`);
      }
    }
    for (const s of subscribes) {
      const ev = s.event;
      if (!catalogEvents.has(ev)) continue;
      if (!s.request_schema_ref && !s.schema_ref) {
        findings.warnings.push(`drift_modulo_subsistema_sin_schema_ref: ${slug} consume "${ev}" sin request_schema_ref/schema_ref en module.json`);
      }
    }
  }
}

function checkPublishSinCorrelationId(contract, findings) {
  const catalogEvents = new Set((contract.eventos || []).map(e => e.name));
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    if (!SUBSYSTEM_SLUGS_DEFAULT.includes(slug)) continue;
    const publica = a.eventos?.publica || [];
    for (const p of publica) {
      const evName = p?.nombre?.valor || p?.nombre;
      if (typeof evName !== 'string' || !catalogEvents.has(evName)) continue;
      const fields = p.payload?.campos_visibles || [];
      if (!fields.includes('correlation_id')) {
        findings.warnings.push(`drift_publish_subsistema_sin_correlation_id: ${slug} publica ${evName} en ${p.ubicacion || '?'} — payload.campos_visibles no incluye correlation_id`);
      }
    }
  }
}

function checkPublishSinProjectId(contract, findings) {
  const catalogEvents = new Set((contract.eventos || []).map(e => e.name));
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    if (!SUBSYSTEM_SLUGS_DEFAULT.includes(slug)) continue;
    const publica = a.eventos?.publica || [];
    for (const p of publica) {
      const evName = p?.nombre?.valor || p?.nombre;
      if (typeof evName !== 'string' || !catalogEvents.has(evName)) continue;
      const fields = p.payload?.campos_visibles || [];
      const hasProyectoEs = fields.includes('proyecto_id');
      const hasProjectEn  = fields.includes('project_id');
      if (hasProyectoEs && !hasProjectEn) {
        findings.warnings.push(`drift_publish_subsistema_sin_project_id: ${slug} publica ${evName} en ${p.ubicacion || '?'} — usa 'proyecto_id' (es); canonico es 'project_id'`);
      }
    }
  }
}

function checkEventoNoCanonizado(contract, findings) {
  const catalogEvents = new Set((contract.eventos || []).map(e => e.name));
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    if (!SUBSYSTEM_SLUGS_DEFAULT.includes(slug)) continue;
    const publica = a.eventos?.publica || [];
    for (const p of publica) {
      const evName = p?.nombre?.valor || p?.nombre;
      if (typeof evName !== 'string') continue;
      // ignorar patrones dinamicos
      if (p?.nombre?.tipo === 'dynamic_template') continue;
      if (!isSubsystemNamespace(evName)) continue;
      if (!catalogEvents.has(evName)) {
        findings.errors.push(`drift_evento_subsistema_no_canonizado: ${slug} publica "${evName}" en ${p.ubicacion || '?'} — namespace del subsistema-recetario pero no esta en el catalogo del contrato`);
      }
    }
  }
}

function checkRecetasConsumeSatelites(findings) {
  const manifest = readManifest('recetas');
  if (!manifest) return;
  const subscribes = manifest.events?.subscribes || [];
  const SATELLITE_PREFIXES = ['escandallo.', 'mise.', 'pase.', 'creativo.', 'tecnica.', 'produccion.'];
  for (const s of subscribes) {
    const ev = s.event;
    if (typeof ev !== 'string') continue;
    if (SATELLITE_PREFIXES.some(p => ev.startsWith(p))) {
      findings.errors.push(`drift_recetas_consume_eventos_de_satelites: recetas declara subscribe a "${ev}" — rompe principio de aggregate root unidireccional`);
    }
  }
}

function checkSatelitePublicaRecetas(findings) {
  const FORBIDDEN_FROM_SATELLITES = /^(receta\.|ingrediente\.precio\.)/;
  for (const slug of SATELITE_SLUGS) {
    // facturas se permite emitir ingrediente.precio.actualizado pero no esta en SATELITE_SLUGS del subsistema
    const manifest = readManifest(slug);
    if (!manifest) continue;
    const publishes = manifest.events?.publishes || [];
    for (const p of publishes) {
      const ev = typeof p === 'string' ? p : p.event;
      if (typeof ev !== 'string') continue;
      if (FORBIDDEN_FROM_SATELLITES.test(ev)) {
        findings.errors.push(`drift_satelite_publica_evento_de_recetas: ${slug} declara publish de "${ev}" — exclusivo de recetas (o facturas para ingrediente.precio.actualizado)`);
      }
    }
  }
}

function checkDobleEscrituraRecetasJson(findings) {
  for (const slug of SATELITE_SLUGS) {
    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf-8');
      // Buscar fs.write.request publicando con path que matchee recetas.json
      const re = /publish\s*\(\s*['"`]fs\.write\.request['"`]\s*,\s*\{[^}]*\brecetas\.json\b/gs;
      let m;
      while ((m = re.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.errors.push(`drift_doble_escritura_recetas_json: ${slug} ${rel}:${ln} — fs.write.request con path matching recetas.json (escritura del dato canonico desde modulo no autoritativo)`);
      }
    }
  }
}

function checkFrontendConLogicaDeDominio(findings) {
  const slug = 'frontend-recetario';
  const dir = modulePathFromSlug(slug);
  if (!fs.existsSync(dir)) return; // modulo aun no existe
  for (const file of listModuleSourceFiles(slug)) {
    const content = fs.readFileSync(file, 'utf-8');
    const heuristicPatterns = [
      /\bfunction\s+(calcular|computar|escalar|foodCost|calcFoodCost|calcCoste|computeCoste)\w*/g,
      /\b(precio_mercado\s*\*\s*cantidad|cantidad\s*\*\s*precio_mercado)\b/g
    ];
    for (const re of heuristicPatterns) {
      let m;
      while ((m = re.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_frontend_con_logica_de_dominio: ${slug} ${rel}:${ln} — patron sospechoso de calculo de dominio (heuristica): "${m[0]}"`);
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
  let schemaCount = 0;
  try {
    const { schemas } = compileAllSchemas();
    schemaCount = Object.keys(schemas).length;
    console.log(`${GREEN}PASS${RST} subsistema-recetario (${schemaCount} schemas compilan AJV strict)`);
  } catch (err) {
    console.log(`${RED}FAIL${RST} subsistema-recetario (schemas no compilan)`);
    console.log(`  ${err.message}`);
    process.exit(1);
  }

  // 2. Verificar contrato existe y es valido JSON
  if (!fs.existsSync(CONTRACT_PATH)) {
    console.log(`${RED}FAIL${RST} subsistema-recetario.contract.json no existe`);
    process.exit(1);
  }
  let contract;
  try { contract = loadJson(CONTRACT_PATH); }
  catch (e) {
    console.log(`${RED}FAIL${RST} subsistema-recetario.contract.json invalido (${e.message})`);
    process.exit(1);
  }

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el subsistema-recetario ===${RST}`);
    const findings = { errors: [], warnings: [], info: [] };
    checkCatalogVsSchemas(contract, listSchemaFiles(), findings);
    checkSchemaRefDeclared(contract, findings);
    checkPublishSinCorrelationId(contract, findings);
    checkPublishSinProjectId(contract, findings);
    checkEventoNoCanonizado(contract, findings);
    checkRecetasConsumeSatelites(findings);
    checkSatelitePublicaRecetas(findings);
    checkDobleEscrituraRecetasJson(findings);
    checkFrontendConLogicaDeDominio(findings);
    reportFindings(findings);
  }

  process.exit(0);
}

main();

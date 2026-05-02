#!/usr/bin/env node
/**
 * Validador de la convención persistence v1.0.0.
 *
 * Uso:
 *   node persistence.validate.js                # valida _outputs/persistence.json estructuralmente
 *   node persistence.validate.js --check-system # adicional: cross-checks contra módulos del repo
 *
 * Cross-checks (11):
 *   1. persistence_json_estructura_valida          (error)   — schema
 *   2. drift_undeclared_persistence_pattern        (warning) — audit detecta IO pero module.json no declara pattern
 *   3. drift_non_atomic_write                      (warning) — fs.writeFile sobre archivo final sin tempFile
 *   4. drift_secrets_in_plain_storage              (ERROR)   — payload con campos sensibles en write
 *   5. drift_cross_module_persistence_access       (warning) — paths que pertenecen a otro módulo
 *   6. drift_silent_io_failure                     (warning) — catch alrededor de I/O sin log+metric
 *   7. drift_schema_drift_undeclared               (warning) — CREATE TABLE sin declarar en manifest
 *   8. drift_unbounded_growth_no_eviction          (warning) — leak_potencial sin TTL/eviction
 *   9. drift_enoent_treated_as_error               (info)    — onLoad sin discriminar ENOENT
 *  10. drift_hard_coupled_to_external_module       (warning) — mqttRequest sin chequear .error
 *  11. module_persistence_audit_completeness       (info)    — audit incompleto
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const Ajv  = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const REPO_ROOT      = path.resolve(__dirname, '../../..');
const SCHEMA_PATH    = path.join(REPO_ROOT, 'arquitectura/decisiones/_schemas/persistence.schema.json');
const OUTPUT_PATH    = path.join(REPO_ROOT, 'arquitectura/decisiones/_outputs/persistence.json');
const MODULES_DIR    = path.join(REPO_ROOT, 'modules');
const AUDITS_DIR     = path.join(REPO_ROOT, 'arquitectura/auditoria/_outputs/modulo-completo');

const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL   = '\x1b[33m';
const CYAN  = '\x1b[36m';
const RST   = '\x1b[0m';

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function listAudits() {
  if (!fs.existsSync(AUDITS_DIR)) return [];
  return fs.readdirSync(AUDITS_DIR).filter(f => f.endsWith('.json')).map(f => path.join(AUDITS_DIR, f));
}

function modulePathFromSlug(slug) {
  return path.join(MODULES_DIR, slug.replace(/__/g, '/'));
}

function readModuleManifest(slug) {
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
  for (const sub of ['lib', 'services']) {
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

function validateOutput(persistence) {
  const schema = loadJson(SCHEMA_PATH);
  const ajv    = new Ajv({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const ok = validate(persistence);
  return { ok, errors: validate.errors || [] };
}

// ---- Helpers ----

function modulePersistsState(audit) {
  const estado = audit.estado || {};
  const persistencia = estado.persistencia || {};
  const archivos = persistencia.archivos || [];
  const tablas   = persistencia.sqlite_tablas || [];
  const memoria  = estado.memoria || [];
  return archivos.length > 0 || tablas.length > 0 || memoria.length > 0;
}

function manifestPersistencePattern(manifest) {
  return manifest && manifest.config && manifest.config.persistence
    ? manifest.config.persistence.pattern || null
    : null;
}

// ---- Cross-checks ----

function checkUndeclaredPattern(persistence, findings) {
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    if (!modulePersistsState(a)) continue;
    const manifest = readModuleManifest(slug);
    const pattern  = manifestPersistencePattern(manifest);
    if (!pattern) {
      findings.warnings.push(`drift_undeclared_persistence_pattern: ${slug} — persiste estado (archivos/tablas/memoria) pero NO declara config.persistence.pattern en module.json`);
    }
  }
}

function checkNonAtomicWrite(persistence, findings) {
  // patrón regex del output
  const reSrc = persistence.detection_patterns.non_atomic_write_regex;
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    const manifest = readModuleManifest(slug);
    const pattern  = manifestPersistencePattern(manifest);
    // Solo módulos que usan json-file* (o detectan archivos) son candidatos
    const usesJsonFile = pattern === 'json-file' || pattern === 'json-file-per-project';
    const hasFiles     = (a.estado?.persistencia?.archivos || []).length > 0;
    if (!usesJsonFile && !hasFiles) continue;

    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf8');
      const re = new RegExp(reSrc, 'g');
      let m;
      while ((m = re.exec(content)) !== null) {
        const target = (m[2] || '').trim();
        // Heurística: si el path destino termina en .tmp, .new, .swp NO es drift
        if (/\.(tmp|new|swp)['"`]?\s*$/.test(target)) continue;
        if (/\b(tmp|tempPath|temp)\b/i.test(target)) continue;
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_non_atomic_write: ${slug} ${rel}:${ln} — fs.writeFile sobre ${target || 'archivo final'} sin tempFile+rename`);
      }
    }
  }
}

function checkSecretsInPlainStorage(persistence, findings) {
  const sensitive = persistence.detection_patterns.secret_in_persistence_field_names;
  // Detectar fs.writeFile o appendFile o INSERT/UPDATE con payload literal con keys sensibles
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      // Para cada operación de write, buscar 5 líneas atrás cualquier clave sensible literal
      const reWrite = /fs\.(promises\.)?(writeFile|appendFile)\s*\(/g;
      let m;
      while ((m = reWrite.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        const ctxStart = Math.max(0, ln - 8);
        const ctx = lines.slice(ctxStart, ln + 1).join('\n');
        for (const sf of sensitive) {
          // detectar object literal con esa key sin enmascarar
          const reField = new RegExp(`['"\`]?\\b${sf}\\b['"\`]?\\s*:\\s*([^,}\\s][^,}]*)`, 'i');
          const fm = reField.exec(ctx);
          if (fm) {
            const value = fm[1].trim();
            // Si el valor parece ya enmascarado (***, '[REDACTED]', '<secret>') no es drift
            if (/^['"`]?(\*+|\[REDACTED\]|<.*>|''|"")['"`]?$/.test(value)) continue;
            const rel = path.relative(REPO_ROOT, file);
            findings.errors.push(`drift_secrets_in_plain_storage: ${slug} ${rel}:${ln} — write con campo sensible "${sf}" sin enmascarar (riesgo de seguridad)`);
            break;
          }
        }
      }
    }
  }
}

function checkCrossModulePersistenceAccess(persistence, findings) {
  // Mapear cada módulo a su data_path (si declarado)
  const ownerByPath = new Map();
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    const manifest = readModuleManifest(slug);
    const dp = manifest?.config?.persistence?.data_path || manifest?.config?.data_path;
    if (dp && typeof dp === 'string') {
      ownerByPath.set(dp.replace(/^\.\//, '').replace(/\/$/, ''), slug);
    }
  }

  const indicators = persistence.detection_patterns.cross_module_path_indicators;

  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf8');
      // Busca strings literales con prefijos que pertenecen a OTROS módulos
      for (const [ownerPath, ownerSlug] of ownerByPath.entries()) {
        if (ownerSlug === slug) continue;
        const re = new RegExp(`['"\`]${ownerPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\\\/][^'"\`]*['"\`]`, 'g');
        let m;
        while ((m = re.exec(content)) !== null) {
          const ln = lineOfOffset(content, m.index);
          const rel = path.relative(REPO_ROOT, file);
          findings.warnings.push(`drift_cross_module_persistence_access: ${slug} ${rel}:${ln} — accede a path de "${ownerSlug}" (${ownerPath})`);
        }
      }
      // Heurística adicional: imports de modules/<otro>/...
      const reImport = /require\s*\(\s*['"`](?:\.\.\/)+modules\/([^\/'"`]+)/g;
      let im;
      while ((im = reImport.exec(content)) !== null) {
        const otherSlug = im[1];
        if (otherSlug === slug.split('__')[0]) continue;
        const ln = lineOfOffset(content, im.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_cross_module_persistence_access: ${slug} ${rel}:${ln} — require directo de modules/${otherSlug} (acceso cross-módulo)`);
      }
    }
  }
}

function checkSilentIoFailure(persistence, findings) {
  const reEmpty = /catch\s*\([^)]*\)\s*\{\s*\}/g;
  // Heurística: catch que NO menciona this.logger ni this.metrics, en proximidad de fs.* o db.*
  const reCatch = /catch\s*\(([^)]*)\)\s*\{([^}]*)\}/gs;

  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf8');

      // catches vacíos
      const re1 = new RegExp(reEmpty.source, 'g');
      let m;
      while ((m = re1.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        // ¿Este catch envuelve I/O? Mira 10 líneas hacia atrás (try block).
        const before = content.slice(Math.max(0, m.index - 600), m.index);
        if (/fs\.(promises\.)?(read|write|append|stat|access|rename)|\.run\s*\(|\.exec\s*\(|sqlite/i.test(before)) {
          const rel = path.relative(REPO_ROOT, file);
          findings.warnings.push(`drift_silent_io_failure: ${slug} ${rel}:${ln} — catch vacío alrededor de I/O`);
        }
      }

      // catches con cuerpo pero sin logger ni metrics
      const re2 = new RegExp(reCatch.source, 'gs');
      while ((m = re2.exec(content)) !== null) {
        const body = m[2] || '';
        if (body.trim().length === 0) continue; // ya cubierto arriba
        if (/this\.logger\.(debug|info|warn|error)/.test(body)) continue;
        // ¿este catch envuelve I/O?
        const before = content.slice(Math.max(0, m.index - 600), m.index);
        if (!/fs\.(promises\.)?(read|write|append|stat|access|rename)|\.run\s*\(|\.exec\s*\(|sqlite/i.test(before)) continue;
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_silent_io_failure: ${slug} ${rel}:${ln} — catch sin this.logger en bloque que envuelve I/O`);
      }
    }
  }
}

function checkSchemaDriftUndeclared(persistence, findings) {
  const keywords = persistence.detection_patterns.schema_drift_keywords;
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    const manifest = readModuleManifest(slug);
    const pattern  = manifestPersistencePattern(manifest);
    const declaredTables = (manifest?.config?.persistence?.tables || []).map(t => (t.name || '').toLowerCase());

    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf8');
      for (const kw of keywords) {
        const re = new RegExp(`${kw}\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(\\w+)`, 'gi');
        let m;
        while ((m = re.exec(content)) !== null) {
          const tableName = (m[1] || '').toLowerCase();
          if (!tableName) continue;
          if (declaredTables.includes(tableName)) continue;
          const ln = lineOfOffset(content, m.index);
          const rel = path.relative(REPO_ROOT, file);
          if (pattern === 'sqlite' || (a.estado?.persistencia?.sqlite_tablas || []).length > 0) {
            findings.warnings.push(`drift_schema_drift_undeclared: ${slug} ${rel}:${ln} — ${kw} ${tableName} sin declarar en module.json.config.persistence.tables`);
          }
        }
      }
    }
  }
}

function checkUnboundedGrowth(persistence, findings) {
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    const memoria = a.estado?.memoria || [];
    const manifest = readModuleManifest(slug);
    const eviction = manifest?.config?.persistence?.eviction_strategy;
    for (const m of memoria) {
      if (m.leak_potencial === true) {
        if (!eviction) {
          findings.warnings.push(`drift_unbounded_growth_no_eviction: ${slug} — campo "${m.nombre || m.campo || '?'}" con leak_potencial=true sin eviction_strategy declarada`);
        }
      }
    }
  }
}

function checkEnoentTreatedAsError(persistence, findings) {
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf8');
      // Buscar onLoad y dentro fs.readFile sin manejar ENOENT específicamente
      const reOnLoad = /onLoad\s*\([^)]*\)\s*\{/g;
      let mm;
      while ((mm = reOnLoad.exec(content)) !== null) {
        // tomar 100 líneas siguientes como bloque aproximado
        const blockStart = mm.index;
        const blockEnd = content.indexOf('\n  }\n', blockStart) > 0 ? content.indexOf('\n  }\n', blockStart) : blockStart + 4000;
        const block = content.slice(blockStart, blockEnd);
        if (!/fs\.(promises\.)?readFile/.test(block)) continue;
        // ¿Algún catch en el bloque maneja ENOENT?
        if (/err\.code\s*===\s*['"`]ENOENT['"`]|code:\s*['"`]ENOENT['"`]/.test(block)) continue;
        // Si sólo hay logger.error/throw, drift
        if (/logger\.error|throw\s+/.test(block)) {
          const ln = lineOfOffset(content, blockStart);
          const rel = path.relative(REPO_ROOT, file);
          findings.info.push(`drift_enoent_treated_as_error: ${slug} ${rel}:${ln} — onLoad lee archivo sin discriminar ENOENT (heurística)`);
        }
      }
    }
  }
}

function checkHardCoupledExternal(persistence, findings) {
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      const re = /(const|let|var)\s+(\w+)\s*=\s*await\s+(?:this\.)?mqttRequest\s*\(/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        const varName = m[2];
        const ln = lineOfOffset(content, m.index);
        // Mira 10 líneas siguientes a la asignación: ¿se chequea varName.error?
        const after = lines.slice(ln, Math.min(lines.length, ln + 12)).join('\n');
        const reCheck = new RegExp(`${varName}\\.error|!\\s*${varName}\\.data`);
        if (!reCheck.test(after)) {
          const rel = path.relative(REPO_ROOT, file);
          findings.warnings.push(`drift_hard_coupled_to_external_module: ${slug} ${rel}:${ln} — await mqttRequest asignado a "${varName}" sin chequear .error en proximidad`);
        }
      }
    }
  }
}

function checkAuditCompleteness(persistence, findings) {
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    const persistencia = a.estado?.persistencia;
    const memoria      = a.estado?.memoria;
    const issues = [];
    if (persistencia === undefined) issues.push('estado.persistencia ausente');
    else {
      if (!Array.isArray(persistencia.archivos))      issues.push('estado.persistencia.archivos no es array');
      if (!Array.isArray(persistencia.sqlite_tablas)) issues.push('estado.persistencia.sqlite_tablas no es array');
    }
    if (!Array.isArray(memoria)) issues.push('estado.memoria no es array');
    if (issues.length > 0) {
      findings.info.push(`module_persistence_audit_completeness: ${slug} — ${issues.join('; ')}`);
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

  if (!fs.existsSync(OUTPUT_PATH)) {
    console.error(`${RED}FAIL${RST} no existe ${OUTPUT_PATH}`);
    process.exit(1);
  }
  let persistence;
  try { persistence = loadJson(OUTPUT_PATH); }
  catch (e) {
    console.error(`${RED}FAIL${RST} persistence.json inválido (${e.message})`);
    process.exit(1);
  }

  const { ok, errors: validationErrors } = validateOutput(persistence);
  if (!ok) {
    console.log(`${RED}FAIL${RST} persistence (schema)`);
    for (const e of validationErrors) {
      console.log(`  ${RED}schema${RST}  ${e.instancePath || '/'} ${e.message} (${JSON.stringify(e.params)})`);
    }
    process.exit(1);
  }
  console.log(`${GREEN}PASS${RST} persistence (schema)`);

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el sistema ===${RST}`);
    const findings = { errors: [], warnings: [], info: [] };
    checkUndeclaredPattern(persistence, findings);
    checkNonAtomicWrite(persistence, findings);
    checkSecretsInPlainStorage(persistence, findings);
    checkCrossModulePersistenceAccess(persistence, findings);
    checkSilentIoFailure(persistence, findings);
    checkSchemaDriftUndeclared(persistence, findings);
    checkUnboundedGrowth(persistence, findings);
    checkEnoentTreatedAsError(persistence, findings);
    checkHardCoupledExternal(persistence, findings);
    checkAuditCompleteness(persistence, findings);
    reportFindings(findings);
  }

  process.exit(0);
}

main();

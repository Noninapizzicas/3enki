#!/usr/bin/env node
/**
 * Validador de la convención http v1.0.0.
 *
 * Uso:
 *   node http.validate.js                # valida _outputs/http.json estructuralmente
 *   node http.validate.js --check-system # adicional: cross-checks contra módulos del repo
 *
 * Cross-checks (12):
 *   1. http_json_estructura_valida                  (error)   — schema
 *   2. drift_intra_core_http_call                   (ERROR)   — fetch a localhost/127.0.0.1
 *   3. drift_module_owns_http_listener              (warning) — http.createServer fuera de core/
 *   4. drift_non_canonical_routing                  (warning) — rutas fuera /modules/<slug>/ o con verbo
 *   5. drift_fetch_without_timeout                  (warning) — fetch sin signal/timeout
 *   6. drift_secret_in_url_query_param              (ERROR)   — token en query string
 *   7. drift_authorization_header_logged            (warning) — log de headers sin redactar
 *   8. drift_no_telemetry_on_http_handler           (warning) — handler sin logger/metrics
 *   9. drift_no_telemetry_on_http_client_call       (warning) — fetch sin logger/metrics
 *  10. drift_external_error_propagated_raw          (warning) — return error.message del upstream
 *  11. drift_auth_undeclared                        (info)    — apis sin auth_required
 *  12. module_http_audit_completeness               (info)    — audit incompleto
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const Ajv  = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const REPO_ROOT      = path.resolve(__dirname, '../../..');
const SCHEMA_PATH    = path.join(REPO_ROOT, 'arquitectura/decisiones/_schemas/http.schema.json');
const OUTPUT_PATH    = path.join(REPO_ROOT, 'arquitectura/decisiones/_outputs/http.json');
const MODULES_DIR    = path.join(REPO_ROOT, 'modules');
const AUDITS_DIR     = path.join(REPO_ROOT, 'arquitectura/auditoria/_outputs/modulo-completo');
const CORE_DIR       = path.join(REPO_ROOT, 'core');

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

function validateOutput(http) {
  const schema = loadJson(SCHEMA_PATH);
  const ajv    = new Ajv({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const ok = validate(http);
  return { ok, errors: validate.errors || [] };
}

// ---- Cross-checks ----

function checkIntraCoreHttpCall(http, findings) {
  const reSrc = http.detection_patterns.localhost_target_regex;
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf8');
      const re = new RegExp(reSrc, 'g');
      let m;
      while ((m = re.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.errors.push(`drift_intra_core_http_call: ${slug} ${rel}:${ln} — llamada HTTP a ${m[3]} (debería ser MQTT)`);
      }
    }
  }
}

function checkModuleOwnsListener(http, findings) {
  const reSrc = http.detection_patterns.module_owns_listener_regex;
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf8');
      const re = new RegExp(reSrc, 'g');
      let m;
      while ((m = re.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_module_owns_http_listener: ${slug} ${rel}:${ln} — ${m[1]} (solo gateway central debería levantar listeners)`);
      }
    }
  }
}

function checkNonCanonicalRouting(http, findings) {
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    const apis = a.apis_http || [];
    for (const api of apis) {
      const ruta = api.ruta || api.path || '';
      if (!ruta) continue;
      const expectedPrefix = `/modules/${slug.replace(/__/g, '/')}`;
      if (!ruta.startsWith(`/modules/`)) {
        findings.warnings.push(`drift_non_canonical_routing: ${slug} ruta="${ruta}" — no empieza por /modules/<slug>/`);
        continue;
      }
      // verbo en path: detectar palabras imperativas comunes
      const verboEnPath = /\b(crear|eliminar|borrar|actualizar|modificar|insertar|update|delete|create|remove)\b/i;
      if (verboEnPath.test(ruta)) {
        findings.warnings.push(`drift_non_canonical_routing: ${slug} ruta="${ruta}" — contiene verbo imperativo (debe usarse el método HTTP)`);
      }
    }
  }
}

function checkFetchWithoutTimeout(http, findings) {
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf8');
      // Buscar fetch( y verificar que en las siguientes ~12 líneas aparece signal/timeout/AbortSignal
      const re = /\bfetch\s*\(/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        const lines = content.split('\n');
        const block = lines.slice(ln - 1, Math.min(lines.length, ln + 12)).join('\n');
        if (/\b(signal|timeout|AbortSignal|setTimeout)\b/.test(block)) continue;
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_fetch_without_timeout: ${slug} ${rel}:${ln} — fetch sin signal/timeout/AbortSignal en proximidad`);
      }
    }
  }
}

function checkSecretInQueryParam(http, findings) {
  const keys = http.detection_patterns.secret_in_query_param_keys;
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf8');
      // URLs con query params que matcheen keys sensibles + valor con interpolación
      for (const k of keys) {
        const re = new RegExp(`[?&]${k}=\\$\\{`, 'g');
        let m;
        while ((m = re.exec(content)) !== null) {
          const ln = lineOfOffset(content, m.index);
          const rel = path.relative(REPO_ROOT, file);
          findings.errors.push(`drift_secret_in_url_query_param: ${slug} ${rel}:${ln} — query param "${k}" con interpolación de variable (riesgo seguridad — usar header)`);
        }
      }
    }
  }
}

function checkAuthorizationHeaderLogged(http, findings) {
  const reSrc = http.detection_patterns.authorization_header_log_regex;
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf8');
      const re = new RegExp(reSrc, 'g');
      let m;
      while ((m = re.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        // Heurística: si en la línea hay "redact" o "sanitize" o "_redactHeaders", no es drift
        const lineText = content.split('\n')[ln - 1] || '';
        if (/redact|sanitize|_redactHeaders/i.test(lineText)) continue;
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_authorization_header_logged: ${slug} ${rel}:${ln} — logger con headers sin redactar visible`);
      }
    }
  }
}

function checkNoTelemetryOnHandler(http, findings) {
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    const apis = a.apis_http || [];
    if (apis.length === 0) continue;
    const files = listModuleSourceFiles(slug);
    for (const api of apis) {
      const handlerName = api.handler || api.handler_name || api.method;
      if (!handlerName || typeof handlerName !== 'string') continue;
      // Buscar la definición del handler en código y revisar 30 líneas siguientes
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        const re = new RegExp(`\\b${handlerName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*\\(`, 'g');
        const m = re.exec(content);
        if (!m) continue;
        const ln = lineOfOffset(content, m.index);
        const lines = content.split('\n');
        const block = lines.slice(ln - 1, Math.min(lines.length, ln + 40)).join('\n');
        const hasLogger  = /this\.logger\.(debug|info|warn|error)/.test(block);
        const hasMetrics = /this\.metrics\.\w+/.test(block);
        if (!hasLogger || !hasMetrics) {
          const rel = path.relative(REPO_ROOT, file);
          findings.warnings.push(`drift_no_telemetry_on_http_handler: ${slug} ${rel}:${ln} — handler "${handlerName}" sin ${!hasLogger?'logger':''}${!hasLogger&&!hasMetrics?' ni ':''}${!hasMetrics?'metrics':''} en proximidad`);
        }
        break;
      }
    }
  }
}

function checkNoTelemetryOnClientCall(http, findings) {
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf8');
      const re = /\bfetch\s*\(/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        const lines = content.split('\n');
        // Buscar logger/metrics en ±10 líneas
        const start = Math.max(0, ln - 10);
        const end   = Math.min(lines.length, ln + 12);
        const block = lines.slice(start, end).join('\n');
        const hasLogger  = /this\.logger\.(debug|info|warn|error)/.test(block);
        const hasMetrics = /this\.metrics\.\w+/.test(block);
        if (!hasLogger || !hasMetrics) {
          const rel = path.relative(REPO_ROOT, file);
          findings.warnings.push(`drift_no_telemetry_on_http_client_call: ${slug} ${rel}:${ln} — fetch sin ${!hasLogger?'logger':''}${!hasLogger&&!hasMetrics?' ni ':''}${!hasMetrics?'metrics':''} en proximidad`);
        }
      }
    }
  }
}

function checkExternalErrorPropagatedRaw(http, findings) {
  const indicators = http.detection_patterns.unmapped_upstream_error_indicators;
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    for (const file of listModuleSourceFiles(slug)) {
      const content = fs.readFileSync(file, 'utf8');
      // Solo aplica a ficheros con fetch o http.request
      if (!/\bfetch\s*\(|http\.request/.test(content)) continue;
      // Buscar return con uno de los indicators
      for (const ind of indicators) {
        const safeInd = ind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`return\\s*\\{[^}]*\\b${safeInd}\\b`, 'g');
        let m;
        while ((m = re.exec(content)) !== null) {
          const ln = lineOfOffset(content, m.index);
          const rel = path.relative(REPO_ROOT, file);
          findings.warnings.push(`drift_external_error_propagated_raw: ${slug} ${rel}:${ln} — return propaga "${ind}" del upstream sin mapeo a UPSTREAM_*`);
        }
      }
    }
  }
}

function checkAuthUndeclared(http, findings) {
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    const manifest = readModuleManifest(slug);
    const apisManifest = manifest?.apis || manifest?.config?.apis || [];
    if (!Array.isArray(apisManifest) || apisManifest.length === 0) continue;
    let undeclared = 0;
    for (const api of apisManifest) {
      if (!api.auth_required) undeclared++;
    }
    if (undeclared > 0) {
      findings.info.push(`drift_auth_undeclared: ${slug} — ${undeclared}/${apisManifest.length} apis sin auth_required en module.json`);
    }
  }
}

function checkAuditCompleteness(http, findings) {
  for (const ap of listAudits()) {
    let a; try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo; if (!slug) continue;
    const manifest = readModuleManifest(slug);
    const apisManifest = manifest?.apis || manifest?.config?.apis || [];
    const apisAudit = a.apis_http || [];
    if (Array.isArray(apisManifest) && apisManifest.length > 0 && apisAudit.length === 0) {
      findings.info.push(`module_http_audit_completeness: ${slug} — manifest declara ${apisManifest.length} apis pero audit.apis_http vacío`);
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
  let http;
  try { http = loadJson(OUTPUT_PATH); }
  catch (e) {
    console.error(`${RED}FAIL${RST} http.json inválido (${e.message})`);
    process.exit(1);
  }

  const { ok, errors: validationErrors } = validateOutput(http);
  if (!ok) {
    console.log(`${RED}FAIL${RST} http (schema)`);
    for (const e of validationErrors) {
      console.log(`  ${RED}schema${RST}  ${e.instancePath || '/'} ${e.message} (${JSON.stringify(e.params)})`);
    }
    process.exit(1);
  }
  console.log(`${GREEN}PASS${RST} http (schema)`);

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el sistema ===${RST}`);
    const findings = { errors: [], warnings: [], info: [] };
    checkIntraCoreHttpCall(http, findings);
    checkModuleOwnsListener(http, findings);
    checkNonCanonicalRouting(http, findings);
    checkFetchWithoutTimeout(http, findings);
    checkSecretInQueryParam(http, findings);
    checkAuthorizationHeaderLogged(http, findings);
    checkNoTelemetryOnHandler(http, findings);
    checkNoTelemetryOnClientCall(http, findings);
    checkExternalErrorPropagatedRaw(http, findings);
    checkAuthUndeclared(http, findings);
    checkAuditCompleteness(http, findings);
    reportFindings(findings);
  }

  process.exit(0);
}

main();

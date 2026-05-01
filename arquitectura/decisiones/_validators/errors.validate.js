#!/usr/bin/env node
/**
 * Validador de la convención errors v1.0.0.
 *
 * Uso:
 *   node errors.validate.js                # valida _outputs/errors.json estructuralmente
 *   node errors.validate.js --check-system # adicional: cross-checks contra módulos del repo
 *
 * Cross-checks (12):
 *   1. errors_json_estructura_valida           (error)   — schema
 *   2. drift_respuesta_no_canonica             (warning) — { ok }, { success }, { result }
 *   3. drift_inventar_status_no_canonico       (warning) — status fuera lista canónica
 *   4. drift_inventar_error_code               (warning) — códigos no en lista canónica
 *   5. drift_respuesta_con_stack_trace         (ERROR)   — stack en respuesta
 *   6. drift_error_sin_log                     (warning) — return error sin this.logger.X
 *   7. drift_error_sin_metric                  (warning) — return error sin metrics.increment
 *   8. drift_mensaje_de_error_con_secreto      (ERROR)   — leak credenciales
 *   9. drift_error_como_string_suelto          (warning) — error: 'string'
 *  10. drift_swallow_error_silently            (warning) — catch vacío
 *  11. drift_instruccion_en_message            (info)    — heurística imperativos
 *  12. module_errors_audit_completeness        (info)    — auditoría incompleta
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const Ajv  = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const REPO_ROOT      = path.resolve(__dirname, '../../..');
const SCHEMA_PATH    = path.join(REPO_ROOT, 'arquitectura/decisiones/_schemas/errors.schema.json');
const OUTPUT_PATH    = path.join(REPO_ROOT, 'arquitectura/decisiones/_outputs/errors.json');
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

function validateOutput(errors) {
  const schema = loadJson(SCHEMA_PATH);
  const ajv    = new Ajv({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const ok = validate(errors);
  return { ok, errors: validate.errors || [] };
}

// ---- Cross-checks ----

function checkRespuestaNoCanonica(errs, findings) {
  const nonCanonical = errs.detection_patterns.non_canonical_response_keys;
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const files = listModuleSourceFiles(slug);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      for (const key of nonCanonical) {
        const re = new RegExp(`return\\s*\\{\\s*${key}\\s*:`, 'g');
        let m;
        while ((m = re.exec(content)) !== null) {
          const ln = lineOfOffset(content, m.index);
          const rel = path.relative(REPO_ROOT, file);
          findings.warnings.push(`drift_respuesta_no_canonica: ${slug} ${rel}:${ln} — return con clave "${key}" (no canónica)`);
        }
      }
    }
  }
}

function checkStatusNoCanonico(errs, findings) {
  const validStatusCodes = new Set(errs.status_codes.map(s => s.code));
  const re = /return\s*\{[^}]*status\s*:\s*(\d+)/g;
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const files = listModuleSourceFiles(slug);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const reFresh = new RegExp(re.source, 'g');
      let m;
      while ((m = reFresh.exec(content)) !== null) {
        const status = parseInt(m[1]);
        if (!validStatusCodes.has(status)) {
          const ln = lineOfOffset(content, m.index);
          const rel = path.relative(REPO_ROOT, file);
          findings.warnings.push(`drift_inventar_status_no_canonico: ${slug} ${rel}:${ln} — status ${status} fuera de la lista canónica`);
        }
      }
    }
  }
}

function checkInventarErrorCode(errs, findings) {
  const validCodes = new Set([
    ...errs.codes_domain.map(c => c.code),
    ...errs.codes_infrastructure.map(c => c.code)
  ]);
  // Detectar code: 'XXX' o code: "XXX"
  const re = /\bcode\s*:\s*['"`]([A-Z][A-Z_]+[A-Z])['"`]/g;
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const files = listModuleSourceFiles(slug);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const reFresh = new RegExp(re.source, 'g');
      let m;
      while ((m = reFresh.exec(content)) !== null) {
        const code = m[1];
        if (!validCodes.has(code)) {
          const ln = lineOfOffset(content, m.index);
          const rel = path.relative(REPO_ROOT, file);
          findings.warnings.push(`drift_inventar_error_code: ${slug} ${rel}:${ln} — código "${code}" no en lista canónica`);
        }
      }
    }
  }
}

function checkRespuestaConStackTrace(errs, findings) {
  const indicators = errs.detection_patterns.stack_in_response_indicators;
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const files = listModuleSourceFiles(slug);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('//')) continue;
        for (const ind of indicators) {
          if (line.includes(ind)) {
            // Verificar que estamos en un return de respuesta (no en un log)
            const before = lines.slice(Math.max(0, i - 5), i).join('\n');
            if (/this\.logger/.test(before)) continue;
            const rel = path.relative(REPO_ROOT, file);
            findings.errors.push(`drift_respuesta_con_stack_trace: ${slug} ${rel}:${i+1} — "${ind}" en respuesta (riesgo de seguridad)`);
          }
        }
      }
    }
  }
}

function findReturnsWithError(content) {
  // Find all "return { status: 4xx/5xx, error: ..." positions
  const re = /return\s*\{[^}]*status\s*:\s*([45]\d{2})/g;
  const results = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    results.push({ offset: m.index, status: parseInt(m[1]) });
  }
  return results;
}

function checkErrorSinLog(errs, findings) {
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const files = listModuleSourceFiles(slug);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      const returns = findReturnsWithError(content);
      for (const ret of returns) {
        const ln = lineOfOffset(content, ret.offset);
        // Check 10 previous lines for this.logger
        const startLn = Math.max(0, ln - 10);
        const previousLines = lines.slice(startLn, ln).join('\n');
        if (!/this\.logger\.(?:debug|info|warn|error)/.test(previousLines)) {
          const rel = path.relative(REPO_ROOT, file);
          findings.warnings.push(`drift_error_sin_log: ${slug} ${rel}:${ln} — return { status: ${ret.status}, ... } sin this.logger en proximidad`);
        }
      }
    }
  }
}

function checkErrorSinMetric(errs, findings) {
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const files = listModuleSourceFiles(slug);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      const returns = findReturnsWithError(content);
      for (const ret of returns) {
        const ln = lineOfOffset(content, ret.offset);
        const startLn = Math.max(0, ln - 10);
        const previousLines = lines.slice(startLn, ln).join('\n');
        if (!/this\.metrics\.\w+\(\s*[`'"][^`'"]*\.errors/.test(previousLines)) {
          const rel = path.relative(REPO_ROOT, file);
          findings.warnings.push(`drift_error_sin_metric: ${slug} ${rel}:${ln} — return { status: ${ret.status}, ... } sin this.metrics.<X>(...errors...) en proximidad`);
        }
      }
    }
  }
}

function checkMensajeConSecreto(errs, findings) {
  const sensitiveFields = errs.detection_patterns.sensitive_field_names;
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const files = listModuleSourceFiles(slug);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      // Look for error: { ... } and check details/message for sensitive substrings
      const re = /error\s*:\s*\{[^}]*(?:message|details)\s*:\s*([^,}]+)/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        const valuePart = m[1];
        for (const sf of sensitiveFields) {
          // Substring search, case-insensitive for word boundary
          const sfRe = new RegExp(`\\b${sf}\\b`, 'i');
          if (sfRe.test(valuePart)) {
            const ln = lineOfOffset(content, m.index);
            const rel = path.relative(REPO_ROOT, file);
            findings.errors.push(`drift_mensaje_de_error_con_secreto: ${slug} ${rel}:${ln} — campo sensible "${sf}" en error.message/details`);
            break;
          }
        }
      }
    }
  }
}

function checkErrorComoStringSuelto(errs, findings) {
  // Detectar "error: 'string'" o "error: \"string\"" o "error: variable_string" donde NO sea objeto
  const re = /error\s*:\s*['"`][^'"`]+['"`]\s*[,}]/g;
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const files = listModuleSourceFiles(slug);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const reFresh = new RegExp(re.source, 'g');
      let m;
      while ((m = reFresh.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_error_como_string_suelto: ${slug} ${rel}:${ln} — error como string en lugar de { code, message }`);
      }
    }
  }
}

function checkSwallowErrorSilently(errs, findings) {
  // Catch vacío o catch que solo retorna default
  const reCatchEmpty = /catch\s*\([^)]*\)\s*\{\s*\}/g;
  const reCatchDefault = /catch\s*\([^)]*\)\s*\{\s*return\s+(null|undefined|\[\]|\{\})\s*;?\s*\}/g;
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const files = listModuleSourceFiles(slug);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const reEmpty = new RegExp(reCatchEmpty.source, 'g');
      const reDefault = new RegExp(reCatchDefault.source, 'g');
      let m;
      while ((m = reEmpty.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_swallow_error_silently: ${slug} ${rel}:${ln} — catch vacío`);
      }
      while ((m = reDefault.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_swallow_error_silently: ${slug} ${rel}:${ln} — catch que devuelve default sin log`);
      }
    }
  }
}

function checkInstruccionEnMessage(errs, findings) {
  const imperativeWords = errs.detection_patterns.prohibited_imperative_message_words;
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const files = listModuleSourceFiles(slug);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const re = /message\s*:\s*['"`]([^'"`]+)['"`]/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        const msg = m[1].toLowerCase();
        for (const word of imperativeWords) {
          const wordLower = word.toLowerCase();
          // Word boundary search
          const wordRe = new RegExp(`\\b${wordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          if (wordRe.test(msg)) {
            const ln = lineOfOffset(content, m.index);
            const rel = path.relative(REPO_ROOT, file);
            findings.info.push(`drift_instruccion_en_message: ${slug} ${rel}:${ln} — message contiene imperativo "${word}"`);
            break;
          }
        }
      }
    }
  }
}

function checkAuditCompleteness(errs, findings) {
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const tools = a.tools || [];
    const uiHandlers = a.ui_handlers || [];
    let issues = [];
    for (const t of tools) {
      if (!Array.isArray(t.errores_conocidos)) {
        issues.push(`tool "${t.name}" sin errores_conocidos array`);
      }
    }
    for (const uh of uiHandlers) {
      if (!Array.isArray(uh.codigos_error)) {
        issues.push(`ui_handler "${uh.action}" sin codigos_error array`);
      }
    }
    if (issues.length > 0) {
      findings.info.push(`module_errors_audit_completeness: ${slug} — ${issues.length} tools/handlers sin documentar errores`);
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
  let errors;
  try { errors = loadJson(OUTPUT_PATH); }
  catch (e) {
    console.error(`${RED}FAIL${RST} errors.json inválido (${e.message})`);
    process.exit(1);
  }

  const { ok, errors: validationErrors } = validateOutput(errors);
  if (!ok) {
    console.log(`${RED}FAIL${RST} errors (schema)`);
    for (const e of validationErrors) {
      console.log(`  ${RED}schema${RST}  ${e.instancePath || '/'} ${e.message} (${JSON.stringify(e.params)})`);
    }
    process.exit(1);
  }
  console.log(`${GREEN}PASS${RST} errors (schema)`);

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el sistema ===${RST}`);
    const findings = { errors: [], warnings: [], info: [] };
    checkRespuestaNoCanonica(errors, findings);
    checkStatusNoCanonico(errors, findings);
    checkInventarErrorCode(errors, findings);
    checkRespuestaConStackTrace(errors, findings);
    checkErrorSinLog(errors, findings);
    checkErrorSinMetric(errors, findings);
    checkMensajeConSecreto(errors, findings);
    checkErrorComoStringSuelto(errors, findings);
    checkSwallowErrorSilently(errors, findings);
    checkInstruccionEnMessage(errors, findings);
    checkAuditCompleteness(errors, findings);
    reportFindings(findings);
  }

  process.exit(0);
}

main();

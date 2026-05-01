#!/usr/bin/env node
/**
 * Validador de la convención observability v1.0.0.
 *
 * Uso:
 *   node observability.validate.js                # valida _outputs/observability.json estructuralmente
 *   node observability.validate.js --check-system # adicional: cross-checks contra módulos del repo
 *
 * Cross-checks (10):
 *   1. observability_json_estructura_valida (error)
 *   2. drift_console_log_directo            (warning) — console.log/error/warn/info/debug
 *   3. drift_logger_propio_instanciado      (warning) — pino/winston/bunyan/debug/log4js/...
 *   4. drift_secrets_en_payload_log         (ERROR)   — campos sensibles en logger args
 *   5. drift_mensaje_sin_estructura         (warning) — template literal o concat en identifier
 *   6. drift_metrica_sin_prefix_modulo      (warning) — métrica sin prefix this.name
 *   7. drift_correlation_id_no_propagado    (warning) — handlers sin propagar
 *   8. drift_severity_invertida             (info)    — heurística por sufijo del identifier
 *   9. drift_log_spam_en_bucle              (warning) — logger dentro de bucles
 *  10. drift_nombre_log_metric_critico      (info)    — identifiers crípticos
 *  11. module_observability_audit_completeness (info)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const Ajv  = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const REPO_ROOT      = path.resolve(__dirname, '../../..');
const SCHEMA_PATH    = path.join(REPO_ROOT, 'arquitectura/decisiones/_schemas/observability.schema.json');
const OUTPUT_PATH    = path.join(REPO_ROOT, 'arquitectura/decisiones/_outputs/observability.json');
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

function validateOutput(observability) {
  const schema = loadJson(SCHEMA_PATH);
  const ajv    = new Ajv({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const ok = validate(observability);
  return { ok, errors: validate.errors || [] };
}

// ---- Cross-checks ----

function checkConsoleLogDirecto(obs, findings) {
  const re = new RegExp(obs.detection_patterns.console_log_regex, 'g');
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
        const reFresh = new RegExp(obs.detection_patterns.console_log_regex);
        if (reFresh.test(line)) {
          const rel = path.relative(REPO_ROOT, file);
          findings.warnings.push(`drift_console_log_directo: ${slug} ${rel}:${i+1} — ${line.trim().slice(0, 100)}`);
        }
      }
    }
  }
}

function checkLoggerPropioInstanciado(obs, findings) {
  const prohibited = obs.detection_patterns.prohibited_logger_imports;
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const files = listModuleSourceFiles(slug);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      for (const pkg of prohibited) {
        const re = new RegExp(`require\\s*\\(\\s*['"\`]${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]\\s*\\)`, 'g');
        let m;
        while ((m = re.exec(content)) !== null) {
          const ln = lineOfOffset(content, m.index);
          const rel = path.relative(REPO_ROOT, file);
          findings.warnings.push(`drift_logger_propio_instanciado: ${slug} ${rel}:${ln} — require('${pkg}')`);
        }
      }
    }
  }
}

function checkSecretsEnPayloadLog(obs, findings) {
  const sensitiveFields = obs.detection_patterns.sensitive_field_names;
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const files = listModuleSourceFiles(slug);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      // Buscar this.logger.X(...) y inspeccionar el segundo argumento
      const re = /this\.logger\.\w+\s*\(\s*['"`][^'"`]*['"`]\s*,\s*\{([^}]*)\}/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        const fieldsBlock = m[1];
        for (const sf of sensitiveFields) {
          // Buscar la key en el bloque (con : o , o whitespace)
          const fieldRe = new RegExp(`(?:^|[\\s,{])${sf}\\s*:`);
          if (fieldRe.test(fieldsBlock)) {
            const ln = lineOfOffset(content, m.index);
            const rel = path.relative(REPO_ROOT, file);
            findings.errors.push(`drift_secrets_en_payload_log: ${slug} ${rel}:${ln} — campo sensible "${sf}" en log payload`);
          }
        }
      }
    }
  }
}

function checkMensajeSinEstructura(obs, findings) {
  const reTpl = new RegExp(obs.detection_patterns.template_literal_in_logger_regex, 'g');
  const reConcat = new RegExp(obs.detection_patterns.concat_in_logger_regex, 'g');
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const files = listModuleSourceFiles(slug);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const reTplFresh = new RegExp(obs.detection_patterns.template_literal_in_logger_regex, 'g');
      const reConcatFresh = new RegExp(obs.detection_patterns.concat_in_logger_regex, 'g');
      let m;
      while ((m = reTplFresh.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_mensaje_sin_estructura: ${slug} ${rel}:${ln} — template literal con variable como identifier`);
      }
      while ((m = reConcatFresh.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_mensaje_sin_estructura: ${slug} ${rel}:${ln} — concatenación con + en identifier`);
      }
    }
  }
}

function checkMetricaSinPrefixModulo(obs, findings) {
  // this.metrics.<increment|gauge|timing>(name, ...)
  const re = /this\.metrics\.(?:increment|gauge|timing)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    // Para slugs anidados (pizzepos__cocina), el prefix esperado es "cocina" o el this.name real
    // Heurística: tomar la última parte del slug
    const expectedPrefix = slug.split('__').pop();
    const files = listModuleSourceFiles(slug);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const reFresh = new RegExp(re.source, 'g');
      let m;
      while ((m = reFresh.exec(content)) !== null) {
        const metricName = m[1];
        const firstSegment = metricName.split('.')[0];
        // Aceptar prefijos similares (firmware-builder → firmware, system-inspector → system, etc.)
        const slugPrefixes = [expectedPrefix, expectedPrefix.split('-')[0], slug.split('__')[0]];
        if (!slugPrefixes.some(p => firstSegment === p || firstSegment.startsWith(p))) {
          const ln = lineOfOffset(content, m.index);
          const rel = path.relative(REPO_ROOT, file);
          findings.warnings.push(`drift_metrica_sin_prefix_modulo: ${slug} ${rel}:${ln} — métrica "${metricName}" no empieza con prefijo del módulo`);
        }
      }
    }
  }
}

function checkCorrelationIdNoPropagado(obs, findings) {
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const propaga = a.observabilidad?.tracing?.propaga_correlation_id;
    const subscribes = a.eventos?.subscribes || [];
    if (subscribes.length > 0 && propaga === false) {
      findings.warnings.push(`drift_correlation_id_no_propagado: ${slug} — tiene ${subscribes.length} subscribes pero tracing.propaga_correlation_id=false`);
    }
  }
}

function checkSeverityInvertida(obs, findings) {
  const successSuffixes = /\.(created|completed|succeeded|started|loaded|saved|published|finished)$/;
  const failureSuffixes = /\.(failed|error|timeout|rejected|cancelled|crashed|aborted)$/;
  const re = /this\.logger\.(\w+)\s*\(\s*['"`]([^'"`]+)['"`]/g;
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
        const level = m[1];
        const identifier = m[2];
        if (successSuffixes.test(identifier) && (level === 'error' || level === 'warn')) {
          const ln = lineOfOffset(content, m.index);
          const rel = path.relative(REPO_ROOT, file);
          findings.info.push(`drift_severity_invertida: ${slug} ${rel}:${ln} — "${identifier}" sugiere éxito pero level=${level}`);
        }
        if (failureSuffixes.test(identifier) && (level === 'info' || level === 'debug')) {
          const ln = lineOfOffset(content, m.index);
          const rel = path.relative(REPO_ROOT, file);
          findings.info.push(`drift_severity_invertida: ${slug} ${rel}:${ln} — "${identifier}" sugiere fallo pero level=${level}`);
        }
      }
    }
  }
}

function checkLogSpamEnBucle(obs, findings) {
  // Heurística aproximada: detectar 'forEach' o 'for (' o '.map(' seguido en la misma línea o siguiente por this.logger
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
        const isLoopStart = /\b(forEach|\.map\s*\(|for\s*\(|while\s*\()/.test(line) && !line.trim().startsWith('//');
        if (!isLoopStart) continue;
        // Look at next 5 lines for this.logger
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          if (/this\.logger\.\w+/.test(lines[j])) {
            const rel = path.relative(REPO_ROOT, file);
            findings.warnings.push(`drift_log_spam_en_bucle: ${slug} ${rel}:${i+1} — bucle con this.logger en línea ${j+1}`);
            break;
          }
        }
      }
    }
  }
}

function checkNombreCritico(obs, findings) {
  const re = /this\.(logger|metrics)\.\w+\s*\(\s*['"`]([^'"`]+)['"`]/g;
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
        const target = m[1];
        const name = m[2];
        // Heurística: name debe tener ≥10 chars, ≥2 partes, al menos una parte con ≥6 chars
        const parts = name.split('.');
        const isLongEnough = name.length >= 10;
        const hasEnoughParts = parts.length >= 2;
        const hasDescriptivePart = parts.some(p => p.length >= 6);
        if (!isLongEnough || !hasEnoughParts || !hasDescriptivePart) {
          const ln = lineOfOffset(content, m.index);
          const rel = path.relative(REPO_ROOT, file);
          findings.info.push(`drift_nombre_log_metric_critico: ${slug} ${rel}:${ln} — ${target} "${name}" demasiado corto/abreviado`);
        }
      }
    }
  }
}

function checkAuditCompleteness(obs, findings) {
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const obsAudit = a.observabilidad;
    if (!obsAudit) {
      findings.info.push(`module_observability_audit_completeness: ${slug} — observabilidad ausente en audit`);
      continue;
    }
    if (!obsAudit.logger || obsAudit.logger.estilo === undefined) {
      findings.info.push(`module_observability_audit_completeness: ${slug} — observabilidad.logger.estilo ausente`);
    }
    if (!Array.isArray(obsAudit.metricas_emitidas)) {
      findings.info.push(`module_observability_audit_completeness: ${slug} — observabilidad.metricas_emitidas no es array`);
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
  let observability;
  try { observability = loadJson(OUTPUT_PATH); }
  catch (e) {
    console.error(`${RED}FAIL${RST} observability.json inválido (${e.message})`);
    process.exit(1);
  }

  const { ok, errors } = validateOutput(observability);
  if (!ok) {
    console.log(`${RED}FAIL${RST} observability (schema)`);
    for (const e of errors) {
      console.log(`  ${RED}schema${RST}  ${e.instancePath || '/'} ${e.message} (${JSON.stringify(e.params)})`);
    }
    process.exit(1);
  }
  console.log(`${GREEN}PASS${RST} observability (schema)`);

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el sistema ===${RST}`);
    const findings = { errors: [], warnings: [], info: [] };
    checkConsoleLogDirecto(observability, findings);
    checkLoggerPropioInstanciado(observability, findings);
    checkSecretsEnPayloadLog(observability, findings);
    checkMensajeSinEstructura(observability, findings);
    checkMetricaSinPrefixModulo(observability, findings);
    checkCorrelationIdNoPropagado(observability, findings);
    checkSeverityInvertida(observability, findings);
    checkLogSpamEnBucle(observability, findings);
    checkNombreCritico(observability, findings);
    checkAuditCompleteness(observability, findings);
    reportFindings(findings);
  }

  process.exit(0);
}

main();

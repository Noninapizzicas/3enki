#!/usr/bin/env node
/**
 * Validador de la convención lifecycle v1.0.0.
 *
 * Uso:
 *   node lifecycle.validate.js                # valida _outputs/lifecycle.json estructuralmente
 *   node lifecycle.validate.js --check-system # adicional: cross-checks contra módulos del repo
 *
 * Cross-checks que ejecuta con --check-system:
 *  1. lifecycle_json_estructura_valida (error)            — schema validation
 *  2. drift_signature_no_canonica (warning)               — métodos prohibidos en lugar de onLoad/onUnload
 *  3. drift_missing_onUnload_with_reservations (warning)  — onLoad reserva pero onUnload no libera
 *  4. drift_module_scope_state (warning)                  — let/var fuera de la clase
 *  5. drift_core_internal_access (warning)                — acceso a core._X
 *  6. drift_directly_require_other_module (warning)       — require('../otro-modulo')
 *  7. drift_cross_module_config_access (warning)          — core.config['otro-modulo']
 *  8. drift_silent_catch_in_onLoad (warning)              — catch vacío en onLoad
 *  9. drift_module_publishes_own_state_machine (warning)  — module.X.ready emitido por el módulo
 * 10. module_lifecycle_audit_completeness (info)          — auditoría tiene los campos lifecycle
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const Ajv  = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const REPO_ROOT      = path.resolve(__dirname, '../../..');
const SCHEMA_PATH    = path.join(REPO_ROOT, 'arquitectura/decisiones/_schemas/lifecycle.schema.json');
const OUTPUT_PATH    = path.join(REPO_ROOT, 'arquitectura/decisiones/_outputs/lifecycle.json');
const MODULES_DIR    = path.join(REPO_ROOT, 'modules');
const AUDITS_DIR     = path.join(REPO_ROOT, 'arquitectura/auditoria/_outputs/modulo-completo');

const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL   = '\x1b[33m';
const CYAN  = '\x1b[36m';
const RST   = '\x1b[0m';

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// -------- Listing helpers --------

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

// -------- Schema --------

function validateOutput(lifecycle) {
  const schema = loadJson(SCHEMA_PATH);
  const ajv    = new Ajv({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const ok = validate(lifecycle);
  return { ok, errors: validate.errors || [] };
}

// -------- Cross-checks --------

function checkSignatureNoCanonica(lifecycle, findings) {
  const prohibited = lifecycle.detection_patterns.prohibited_signatures;
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const files = listModuleSourceFiles(slug);
    for (const file of files) {
      if (!file.endsWith('index.js')) continue;
      const content = fs.readFileSync(file, 'utf8');
      // Detectar definiciones de método prohibidos: regex "async <name>(" o "<name>("
      for (const proh of prohibited) {
        const re = new RegExp(`(?:async\\s+)?${proh}\\s*\\(`, 'g');
        let m;
        while ((m = re.exec(content)) !== null) {
          // Filtrar ocurrencias dentro de comentarios o strings (heurística simple)
          const lineStart = content.lastIndexOf('\n', m.index) + 1;
          const lineSoFar = content.slice(lineStart, m.index);
          if (/^\s*(\/\/|\*|['"`])/.test(lineSoFar)) continue;
          // Filtrar si NO está al nivel de método de clase (heurística: precedido por } o , o whitespace al inicio de línea)
          const ln = lineOfOffset(content, m.index);
          const rel = path.relative(REPO_ROOT, file);
          findings.warnings.push(`drift_signature_no_canonica: ${slug} ${rel}:${ln} — método prohibido "${proh}" (usar onLoad/onUnload)`);
          break; // un match por archivo basta para este verbo
        }
      }
    }
  }
}

function checkMissingOnUnloadWithReservations(lifecycle, findings) {
  const reservationKeys = lifecycle.detection_patterns.reservation_keywords;
  const releaseKeys = lifecycle.detection_patterns.release_keywords;
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const onLoadActions = a.lifecycle?.onLoad?.acciones || [];
    const onUnloadActions = a.lifecycle?.onUnload?.acciones || [];
    const estadoNoLimpiado = a.lifecycle?.onUnload?.estado_no_limpiado || [];

    if (estadoNoLimpiado.length > 0) {
      findings.warnings.push(`drift_missing_onUnload_with_reservations: ${slug} — estado_no_limpiado=${JSON.stringify(estadoNoLimpiado)}`);
      continue;
    }

    const hasReservation = onLoadActions.some(action =>
      reservationKeys.some(kw => action.toLowerCase().includes(kw.toLowerCase()))
    );
    if (!hasReservation) continue;

    const hasRelease = onUnloadActions.some(action =>
      releaseKeys.some(kw => action.toLowerCase().includes(kw.toLowerCase()))
    );
    if (!hasRelease) {
      findings.warnings.push(`drift_missing_onUnload_with_reservations: ${slug} — onLoad reserva pero onUnload no libera (acciones onLoad: ${onLoadActions.length}, onUnload: ${onUnloadActions.length})`);
    }
  }
}

function checkModuleScopeState(lifecycle, findings) {
  const re = new RegExp(lifecycle.detection_patterns.module_scope_state_regex, 'gm');
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const files = listModuleSourceFiles(slug);
    for (const file of files) {
      if (!file.endsWith('index.js')) continue;
      const content = fs.readFileSync(file, 'utf8');
      const reFresh = new RegExp(lifecycle.detection_patterns.module_scope_state_regex, 'gm');
      let m;
      while ((m = reFresh.exec(content)) !== null) {
        const ln = lineOfOffset(content, m.index);
        // Verificar que está antes de la primera class (heurística)
        const classMatch = content.indexOf('class ');
        if (classMatch === -1 || m.index < classMatch) {
          const rel = path.relative(REPO_ROOT, file);
          const lineContent = content.split('\n')[ln - 1];
          findings.warnings.push(`drift_module_scope_state: ${slug} ${rel}:${ln} — ${lineContent.trim().slice(0, 100)}`);
        }
      }
    }
  }
}

function checkCoreInternalAccess(lifecycle, findings) {
  const forbidden = lifecycle.detection_patterns.forbidden_core_internals;
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
        for (const fb of forbidden) {
          if (line.includes(fb)) {
            const rel = path.relative(REPO_ROOT, file);
            findings.warnings.push(`drift_core_internal_access: ${slug} ${rel}:${i+1} — accede a "${fb}"`);
          }
        }
      }
    }
  }
}

function checkDirectlyRequireOtherModule(lifecycle, findings) {
  // Regex para require('../algo') o require('../../modules/algo')
  const re = /require\s*\(\s*['"`](\.\.[^'"`]+)['"`]\s*\)/g;
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
        const requirePath = m[1];
        // Filtrar imports legítimos: lib/, core/, ../core/
        if (/\/(core|lib)\//.test(requirePath) || requirePath.endsWith('/core') || requirePath.endsWith('/lib')) continue;
        // Excepción: modules/_shared/* y modules/_template/* (carpetas con prefijo
        // `_` por convención del loader — código compartido, no módulos runtime).
        if (/(^|\/)_shared\//.test(requirePath) || /(^|\/)_template\//.test(requirePath)) continue;
        // Detectar imports a otros módulos
        if (/modules\//.test(requirePath) || /^\.\.\/[^.]/.test(requirePath)) {
          const ln = lineOfOffset(content, m.index);
          const rel = path.relative(REPO_ROOT, file);
          findings.warnings.push(`drift_directly_require_other_module: ${slug} ${rel}:${ln} — require('${requirePath}')`);
        }
      }
    }
  }
}

function checkCrossModuleConfigAccess(lifecycle, findings) {
  // core.config['otro-modulo'] o core.config.otroModulo
  const re = /core\.config\s*\[\s*['"`]([^'"`]+)['"`]\s*\]/g;
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const ownName = slug.split('__').pop(); // p.ej. pizzepos__cocina → cocina
    const files = listModuleSourceFiles(slug);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const reFresh = new RegExp(re.source, 'g');
      let m;
      while ((m = reFresh.exec(content)) !== null) {
        const accessed = m[1];
        if (accessed === ownName || accessed === slug) continue; // su propio config OK
        const ln = lineOfOffset(content, m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_cross_module_config_access: ${slug} ${rel}:${ln} — accede a config de "${accessed}"`);
      }
    }
  }
}

function checkSilentCatchInOnLoad(lifecycle, findings) {
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const files = listModuleSourceFiles(slug);
    for (const file of files) {
      if (!file.endsWith('index.js')) continue;
      const content = fs.readFileSync(file, 'utf8');
      // Buscar el bloque async onLoad
      const onLoadMatch = content.match(/async\s+onLoad\s*\([^)]*\)\s*\{/);
      if (!onLoadMatch) continue;
      const onLoadStart = onLoadMatch.index + onLoadMatch[0].length;
      // Hallar el cierre del método (heurística: contar llaves desde onLoadStart)
      let depth = 1;
      let i = onLoadStart;
      while (i < content.length && depth > 0) {
        if (content[i] === '{') depth++;
        else if (content[i] === '}') depth--;
        i++;
      }
      const onLoadBody = content.slice(onLoadStart, i);
      const re = new RegExp(lifecycle.detection_patterns.silent_catch_in_load_regex, 'g');
      let m;
      while ((m = re.exec(onLoadBody)) !== null) {
        const ln = lineOfOffset(content, onLoadStart + m.index);
        const rel = path.relative(REPO_ROOT, file);
        findings.warnings.push(`drift_silent_catch_in_onLoad: ${slug} ${rel}:${ln} — catch vacío en onLoad`);
      }
    }
  }
}

function checkModulePublishesOwnStateMachine(lifecycle, findings) {
  const re = new RegExp(lifecycle.detection_patterns.state_machine_event_pattern);
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const publicas = a.eventos?.publica || [];
    for (const ev of publicas) {
      if (ev.nombre?.tipo !== 'literal') continue;
      const name = ev.nombre.valor;
      if (!name) continue;
      if (re.test(name)) {
        findings.warnings.push(`drift_module_publishes_own_state_machine: ${slug} — evento "${name}" usurpa el rol del core ${ev.ubicacion || ''}`);
      }
    }
  }
}

function checkModuleLifecycleAuditCompleteness(lifecycle, findings) {
  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (_) { continue; }
    const slug = a._meta?.modulo;
    if (!slug) continue;
    const onLoadActions = a.lifecycle?.onLoad?.acciones;
    const onUnloadActions = a.lifecycle?.onUnload?.acciones;
    if (!Array.isArray(onLoadActions) || !Array.isArray(onUnloadActions)) {
      findings.info.push(`module_lifecycle_audit_completeness: ${slug} — auditoría incompleta (lifecycle.onLoad.acciones o onUnload.acciones falta)`);
    }
  }
}

// -------- Reporting --------

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

// -------- Main --------

function main() {
  const checkSystemFlag = process.argv.includes('--check-system');

  if (!fs.existsSync(OUTPUT_PATH)) {
    console.error(`${RED}FAIL${RST} no existe ${OUTPUT_PATH}`);
    process.exit(1);
  }
  let lifecycle;
  try { lifecycle = loadJson(OUTPUT_PATH); }
  catch (e) {
    console.error(`${RED}FAIL${RST} lifecycle.json inválido (${e.message})`);
    process.exit(1);
  }

  const { ok, errors } = validateOutput(lifecycle);
  if (!ok) {
    console.log(`${RED}FAIL${RST} lifecycle (schema)`);
    for (const e of errors) {
      console.log(`  ${RED}schema${RST}  ${e.instancePath || '/'} ${e.message} (${JSON.stringify(e.params)})`);
    }
    process.exit(1);
  }
  console.log(`${GREEN}PASS${RST} lifecycle (schema)`);

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el sistema ===${RST}`);
    const findings = { errors: [], warnings: [], info: [] };
    checkSignatureNoCanonica(lifecycle, findings);
    checkMissingOnUnloadWithReservations(lifecycle, findings);
    checkModuleScopeState(lifecycle, findings);
    checkCoreInternalAccess(lifecycle, findings);
    checkDirectlyRequireOtherModule(lifecycle, findings);
    checkCrossModuleConfigAccess(lifecycle, findings);
    checkSilentCatchInOnLoad(lifecycle, findings);
    checkModulePublishesOwnStateMachine(lifecycle, findings);
    checkModuleLifecycleAuditCompleteness(lifecycle, findings);
    reportFindings(findings);
  }

  process.exit(0);
}

main();

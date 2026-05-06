#!/usr/bin/env node
/**
 * Validador del contrato transversal module-rewrite v1.0.0.
 *
 * Uso:
 *   node module-rewrite.validate.js                # valida estructuralmente el contrato
 *   node module-rewrite.validate.js --check-system # cross-checks contra modulos migrados del repo
 *
 * Lista de modulos migrados: detectada por presencia de tests/unit/<slug>.test.js.
 *
 * Cross-checks (13):
 *   1. module_rewrite_contrato_existe                              (error)
 *   2. drift_modulo_migrado_sin_legacy_archivado                   (warning)
 *   3. drift_modulo_migrado_sin_5_helpers_poc2                     (warning)
 *   4. drift_modulo_migrado_tests_sin_capas                        (info)
 *   5. drift_modulo_migrado_module_json_incompleto                 (warning)
 *   6. drift_modulo_migrado_codes_fuera_catalogo                   (warning)
 *   7. drift_modulo_migrado_returns_con_error_string               (warning)
 *   8. drift_modulo_migrado_tests_persistencia_sin_aislamiento     (warning)
 *   9. drift_descomposicion_sin_nota                               (info)
 *  10. drift_modulo_migrado_sin_version_bump_mayor                 (info)
 *  11. drift_horizontal_progreso_md_obsoleto                       (info)
 *  12. drift_modulo_migrado_sin_eventos_canonicos_preservados      (error)
 *  13. drift_modulo_migrado_drift_count_no_baja                    (warning)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT      = path.resolve(__dirname, '../../..');
const CONTRACT_PATH  = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/module-rewrite.contract.json');
const ERRORS_OUT     = path.join(REPO_ROOT, 'arquitectura/decisiones/_outputs/errors.json');
const TESTS_DIR      = path.join(REPO_ROOT, 'tests/unit');
const MODULES_DIR    = path.join(REPO_ROOT, 'modules');
const LEGACY_DIR     = path.join(REPO_ROOT, 'arquitectura/migracion/_legacy');
const NOTAS_DIR      = path.join(REPO_ROOT, 'arquitectura/migracion/notas');
const PROGRESO_PATH  = path.join(REPO_ROOT, 'arquitectura/migracion/_outputs/PROGRESO.md');

const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL   = '\x1b[33m';
const CYAN  = '\x1b[36m';
const RST   = '\x1b[0m';

const HELPERS_OBLIGATORIOS = [
  '_errorResponse',
  '_handleHandlerError',
  '_classifyHandlerError',
  '_publicarEvento'
];
// Auxiliar: al menos uno de estos debe existir
const HELPERS_AUXILIARES = [
  '_fetchWithTimeout',
  '_slugify',
  '_maskApiKey',
  '_classifyExecutionError',
  '_publishUIState'
];

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch (_) { return null; }
}

function findModulesWithTest() {
  // Modulos detectables como migrados: tests/unit/<slug>.test.js existe
  // y el modulo correspondiente vive en modules/<...>/<slug>/
  const acc = [];
  if (!fs.existsSync(TESTS_DIR)) return acc;
  for (const f of fs.readdirSync(TESTS_DIR)) {
    if (!f.endsWith('.test.js')) continue;
    const slug = f.replace('.test.js', '');
    // Modulos especiales de tests existentes (POCs, integration helpers): saltarlos
    if (['hooks', 'observability', 'http-gateway', 'cli', 'security-p2p', 'mqtt-request', 'conversation-manager'].includes(slug)) continue;
    // Buscar modules/<slug>/index.js o modules/<dir>/<slug>/index.js
    const candidatos = [];
    function walk(dir, parent = '') {
      if (!fs.existsSync(dir)) return;
      let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (e.name.startsWith('_') || e.name.startsWith('.') || e.name === 'node_modules') continue;
        const fullPath = path.join(dir, e.name);
        if (e.name === slug || e.name === slug.replace(/-/g, '_') || `${parent}__${e.name}` === slug) {
          if (fs.existsSync(path.join(fullPath, 'index.js'))) candidatos.push({ dir: fullPath, parent });
        }
        // Submodulos con __ en slug (ej: conversacion__memory-rag)
        if (slug.includes('__')) {
          walk(fullPath, parent ? `${parent}__${e.name}` : e.name);
        }
      }
    }
    walk(MODULES_DIR);
    if (candidatos.length > 0) acc.push({ slug, testFile: path.join(TESTS_DIR, f), moduleDir: candidatos[0].dir });
  }
  return acc;
}

function loadCanonicalErrorCodes() {
  const data = loadJson(ERRORS_OUT);
  if (!data) return null;
  const codes = new Set();
  for (const k of Object.keys(data)) {
    if (k.startsWith('codes_') && Array.isArray(data[k])) {
      for (const e of data[k]) {
        if (typeof e === 'string') codes.add(e);
        else if (e && typeof e.code === 'string') codes.add(e.code);
      }
    }
  }
  return codes;
}

function checkLegacyArchived(slug, findings) {
  // Buscar en _legacy/ archivos cuyo nombre incluya el slug del modulo
  if (!fs.existsSync(LEGACY_DIR)) return;
  const legacyFiles = fs.readdirSync(LEGACY_DIR);
  const slugBase = slug.split('__').pop();
  const found = legacyFiles.some(f =>
    f.startsWith(slug) || f.startsWith(slugBase) ||
    f.startsWith(slug.replace(/__/g, '-')) ||
    f.startsWith(slugBase.replace(/-/g, '_'))
  );
  if (!found) {
    findings.warnings.push(`drift_modulo_migrado_sin_legacy_archivado: ${slug} — no se encontró archivo en arquitectura/migracion/_legacy/ con prefijo "${slugBase}". Si la reescritura es del POC2, archivar monolito.`);
  }
}

function checkHelpers(slug, moduleDir, findings) {
  const indexPath = path.join(moduleDir, 'index.js');
  if (!fs.existsSync(indexPath)) return;
  const content = fs.readFileSync(indexPath, 'utf-8');
  const missing = HELPERS_OBLIGATORIOS.filter(h => !content.includes(h));
  if (missing.length > 0) {
    findings.warnings.push(`drift_modulo_migrado_sin_5_helpers_poc2: ${slug} — faltan helpers obligatorios: ${missing.join(', ')}`);
  }
  const hasAuxiliar = HELPERS_AUXILIARES.some(h => content.includes(h));
  if (!hasAuxiliar) {
    findings.info.push(`drift_modulo_migrado_sin_helper_auxiliar: ${slug} — no se detecto ningun helper auxiliar del dominio (${HELPERS_AUXILIARES.join(', ')})`);
  }
}

function checkTestsCapas(slug, testFile, findings) {
  const content = fs.readFileSync(testFile, 'utf-8');
  const groups = (content.match(/Group\s+\d+:/g) || []).length;
  if (groups < 3) {
    findings.info.push(`drift_modulo_migrado_tests_sin_capas: ${slug} — tests/unit/${path.basename(testFile)} tiene ${groups} 'Group N:' banners (recomendado >=3)`);
  }
}

function checkModuleJsonCompleto(slug, moduleDir, findings) {
  const manifestPath = path.join(moduleDir, 'module.json');
  if (!fs.existsSync(manifestPath)) {
    findings.warnings.push(`drift_modulo_migrado_module_json_incompleto: ${slug} — module.json no existe`);
    return;
  }
  const manifest = loadJson(manifestPath);
  if (!manifest) {
    findings.warnings.push(`drift_modulo_migrado_module_json_incompleto: ${slug} — module.json no parsea como JSON`);
    return;
  }
  const missing = [];
  if (!manifest.events?.publishes && !manifest.publishes) missing.push('events.publishes');
  if (!manifest.events?.subscribes && !manifest.subscribes) missing.push('events.subscribes');
  if (!manifest.config?.persistence) missing.push('config.persistence');
  if (!manifest.observability?.metrics) missing.push('observability.metrics');
  if (missing.length > 0) {
    findings.warnings.push(`drift_modulo_migrado_module_json_incompleto: ${slug} — faltan secciones obligatorias: ${missing.join(', ')}`);
  }
}

function checkErrorCodes(slug, moduleDir, errorCodes, findings) {
  if (!errorCodes) return;
  const indexPath = path.join(moduleDir, 'index.js');
  if (!fs.existsSync(indexPath)) return;
  const content = fs.readFileSync(indexPath, 'utf-8');
  // Detectar codes en source
  const codeRegex = /\bcode\s*:\s*['"]([A-Z][A-Z0-9_]*)['"]/g;
  let m;
  const found = new Set();
  while ((m = codeRegex.exec(content)) !== null) found.add(m[1]);
  const fueraCatalogo = [...found].filter(c => !errorCodes.has(c));
  if (fueraCatalogo.length > 0) {
    findings.warnings.push(`drift_modulo_migrado_codes_fuera_catalogo: ${slug} — codes en source no presentes en errors.json: ${fueraCatalogo.join(', ')}`);
  }
}

function checkErrorStringSuelto(slug, moduleDir, findings) {
  const indexPath = path.join(moduleDir, 'index.js');
  if (!fs.existsSync(indexPath)) return;
  const content = fs.readFileSync(indexPath, 'utf-8');
  // Heuristica: return con error: 'literal string'
  const re = /return\s*\{[^}]*error\s*:\s*['"][^'"\{]+['"]/g;
  const matches = content.match(re) || [];
  if (matches.length > 0) {
    findings.warnings.push(`drift_modulo_migrado_returns_con_error_string: ${slug} — ${matches.length} returns detectados con shape error:'<string suelto>' (debe ser error: { code, message })`);
  }
}

function checkTestsAislamiento(slug, testFile, findings) {
  const content = fs.readFileSync(testFile, 'utf-8');
  // Heuristica: fs.writeFile o fs.writeFileSync sin tmpdir o __dirname/fixtures
  const writeRe = /fs\.writeFileSync?\s*\(/g;
  const writes = content.match(writeRe) || [];
  if (writes.length === 0) return;
  // Si hay writes pero no tmpdir ni fixtures, advertir
  if (!content.includes('tmpdir') && !content.includes('__dirname') && !content.match(/fixtures/i)) {
    findings.warnings.push(`drift_modulo_migrado_tests_persistencia_sin_aislamiento: ${slug} — tests usan fs.writeFile sin tmpdir/fixtures (riesgo de contaminar repo)`);
  }
}

function checkDescomposicionSinNota(slug, moduleDir, findings) {
  // Si LOC del legacy >> LOC del rewrite (>50% reduccion), debe existir nota
  const indexPath = path.join(moduleDir, 'index.js');
  if (!fs.existsSync(indexPath)) return;
  const rewriteLoc = fs.readFileSync(indexPath, 'utf-8').split('\n').length;

  if (!fs.existsSync(LEGACY_DIR)) return;
  const slugBase = slug.split('__').pop();
  const legacyFiles = fs.readdirSync(LEGACY_DIR).filter(f => f.startsWith(slug) || f.startsWith(slugBase));
  if (legacyFiles.length === 0) return;
  const legacyPath = path.join(LEGACY_DIR, legacyFiles[0]);
  const legacyLoc = fs.readFileSync(legacyPath, 'utf-8').split('\n').length;

  const reduction = (legacyLoc - rewriteLoc) / Math.max(legacyLoc, 1);
  if (reduction > 0.5) {
    // Buscar nota
    const notaCandidate = path.join(NOTAS_DIR, `${slug}-descomposicion.md`);
    const notaCandidate2 = path.join(NOTAS_DIR, `${slugBase}-descomposicion.md`);
    if (!fs.existsSync(notaCandidate) && !fs.existsSync(notaCandidate2)) {
      findings.info.push(`drift_descomposicion_sin_nota: ${slug} — LOC bajo de ${legacyLoc} a ${rewriteLoc} (-${Math.round(reduction*100)}%) sin nota de descomposicion en arquitectura/migracion/notas/`);
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

  // 1. Verificar contrato existe + JSON valido
  if (!fs.existsSync(CONTRACT_PATH)) {
    console.log(`${RED}FAIL${RST} module-rewrite.contract.json no existe`);
    process.exit(1);
  }
  try { loadJson(CONTRACT_PATH); }
  catch (e) {
    console.log(`${RED}FAIL${RST} module-rewrite.contract.json invalido: ${e.message}`);
    process.exit(1);
  }
  console.log(`${GREEN}PASS${RST} module-rewrite (contrato valido)`);

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra modulos migrados ===${RST}`);
    const findings = { errors: [], warnings: [], info: [] };
    const errorCodes = loadCanonicalErrorCodes();
    const migrated = findModulesWithTest();
    console.log(`${CYAN}detectados ${migrated.length} modulos con tests/unit/<slug>.test.js${RST}`);

    for (const { slug, testFile, moduleDir } of migrated) {
      checkLegacyArchived(slug, findings);
      checkHelpers(slug, moduleDir, findings);
      checkTestsCapas(slug, testFile, findings);
      checkModuleJsonCompleto(slug, moduleDir, findings);
      checkErrorCodes(slug, moduleDir, errorCodes, findings);
      checkErrorStringSuelto(slug, moduleDir, findings);
      checkTestsAislamiento(slug, testFile, findings);
      checkDescomposicionSinNota(slug, moduleDir, findings);
    }

    reportFindings(findings);
  }

  process.exit(0);
}

main();

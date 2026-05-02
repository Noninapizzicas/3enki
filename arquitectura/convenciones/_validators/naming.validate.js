#!/usr/bin/env node
/**
 * Validador de la convención naming v1.0.0.
 *
 * Uso:
 *   node naming.validate.js                # valida _outputs/naming.json estructuralmente
 *   node naming.validate.js --check-system # adicional: cross-checks contra módulos del repo
 *
 * Cross-checks que ejecuta con --check-system:
 *  1. Cada modules/<x>/module.json tiene campo `language` ∈ {es, en}.
 *  2. Para cada modulo-completo audit, eventos.publica[*].nombre.tipo='literal':
 *     - el nombre cumple el regex de form
 *     - es ASCII puro (sin tildes/ñ)
 *     - el último segmento (verbo) está en verbs_lifecycle del idioma del módulo,
 *       O es uno compuesto del verbs_compound_allowed.
 *  3. El idioma declarado en module.json es coherente con directory_hint_words (warning).
 *  4. Si module.language='es', no hay verbos EN en sus eventos (cross-mix); viceversa para 'en'.
 *
 * El validador imprime PASS si naming.json es estructuralmente válido.
 * Los cross-checks se reportan como warnings/findings detallados — drift del sistema, no fallos del contrato.
 */

const fs   = require('fs');
const path = require('path');
const Ajv  = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const REPO_ROOT      = path.resolve(__dirname, '../../..');
const SCHEMA_PATH    = path.join(REPO_ROOT, 'arquitectura/convenciones/_schemas/naming.schema.json');
const OUTPUT_PATH    = path.join(REPO_ROOT, 'arquitectura/convenciones/_outputs/naming.json');
const MODULES_DIR    = path.join(REPO_ROOT, 'modules');
const AUDITS_DIR     = path.join(REPO_ROOT, 'arquitectura/auditoria/_outputs/modulo-completo');

const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL   = '\x1b[33m';
const CYAN  = '\x1b[36m';
const RST   = '\x1b[0m';

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function listModuleManifests() {
  if (!fs.existsSync(MODULES_DIR)) return [];
  return fs.readdirSync(MODULES_DIR)
    .map(name => path.join(MODULES_DIR, name, 'module.json'))
    .filter(p => fs.existsSync(p));
}

function listAudits() {
  if (!fs.existsSync(AUDITS_DIR)) return [];
  return fs.readdirSync(AUDITS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(AUDITS_DIR, f));
}

function isAsciiPure(s) {
  return /^[\x20-\x7E]*$/.test(s);
}

function hasAccentsOrTildeN(s) {
  return /[áéíóúÁÉÍÓÚñÑüÜ]/.test(s);
}

function inferLanguageFromDirName(dirName, naming) {
  const slug = dirName.toLowerCase();
  const esHits = naming.languages.es.directory_hint_words.filter(w => slug.includes(w)).length;
  const enHits = naming.languages.en.directory_hint_words.filter(w => slug.includes(w)).length;
  if (esHits > enHits) return 'es';
  if (enHits > esHits) return 'en';
  return null;
}

function validateOutput(naming) {
  const schema = loadJson(SCHEMA_PATH);
  const ajv    = new Ajv({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const ok = validate(naming);
  return { ok, errors: validate.errors || [] };
}

function checkSystem(naming) {
  const findings = { errors: [], warnings: [], info: [] };

  // 1. module.json declara language
  const manifests = listModuleManifests();
  for (const mp of manifests) {
    const slug = path.basename(path.dirname(mp));
    let m;
    try { m = loadJson(mp); } catch (e) {
      findings.errors.push(`${slug}: module.json inválido (${e.message})`);
      continue;
    }
    if (!m.language) {
      findings.warnings.push(`${slug}: module.json no declara campo \`language\` (drift conocido — pendiente migración).`);
      continue;
    }
    if (!naming.rules.languages_canonical.includes(m.language)) {
      findings.errors.push(`${slug}: module.json.language="${m.language}" no es ∈ {${naming.rules.languages_canonical.join(', ')}}.`);
      continue;
    }
    // Heurística directorio
    const inferred = inferLanguageFromDirName(slug, naming);
    if (inferred && inferred !== m.language) {
      findings.warnings.push(`${slug}: nombre del directorio sugiere idioma "${inferred}" pero module.json declara "${m.language}". Posible mismatch (puede ser legítimo si es término de industria).`);
    }
  }

  // 2. Cross-check eventos contra audits
  const audits = listAudits();
  const formRegex = new RegExp(naming.rules.form_regex);

  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (e) {
      findings.errors.push(`audit ${path.basename(ap)}: JSON inválido (${e.message})`);
      continue;
    }
    const slug    = a._meta?.modulo || path.basename(ap, '.json');
    const mp      = path.join(MODULES_DIR, slug, 'module.json');
    let modLang   = null;
    if (fs.existsSync(mp)) {
      try { modLang = loadJson(mp).language || null; } catch (_) {}
    }

    const publicas = a.eventos?.publica || [];
    for (const ev of publicas) {
      if (ev.nombre?.tipo !== 'literal') continue;
      const evName = ev.nombre.valor;
      if (!evName || typeof evName !== 'string') continue;

      // ASCII puro
      if (!isAsciiPure(evName) || hasAccentsOrTildeN(evName)) {
        findings.errors.push(`${slug}: evento "${evName}" contiene caracteres no-ASCII en ${ev.ubicacion}.`);
        continue;
      }
      // Forma
      if (!formRegex.test(evName)) {
        findings.warnings.push(`${slug}: evento "${evName}" no cumple form_regex en ${ev.ubicacion}.`);
        continue;
      }
      // Verbo
      if (modLang) {
        const langBlock = naming.languages[modLang];
        if (!langBlock) {
          findings.errors.push(`${slug}: idioma "${modLang}" no tiene bloque en naming.json.`);
          continue;
        }
        const segments = evName.split('.');
        const lastSeg  = segments[segments.length - 1];
        const verbAtomic   = langBlock.verbs_lifecycle.includes(lastSeg);
        const verbCompound = langBlock.verbs_compound_allowed.includes(lastSeg);
        if (!verbAtomic && !verbCompound) {
          findings.warnings.push(`${slug}: evento "${evName}" verbo "${lastSeg}" no está en verbs_lifecycle ni verbs_compound_allowed de "${modLang}".`);
        }
        // Cross-mix detection
        const otherLang = modLang === 'es' ? 'en' : 'es';
        const otherBlock = naming.languages[otherLang];
        if (otherBlock.verbs_lifecycle.includes(lastSeg)) {
          findings.warnings.push(`${slug}: evento "${evName}" usa verbo "${lastSeg}" del idioma "${otherLang}" pero module.language="${modLang}" (cross-mix).`);
        }
      } else {
        // No language declared — solo check forma + ASCII (ya hechos arriba)
      }
    }
  }

  return findings;
}

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
  if (findings.errors.length === 0 && findings.warnings.length === 0) {
    console.log(`${GREEN}cross-system: sin drift detectado${RST}`);
  }
}

function main() {
  const checkSystemFlag = process.argv.includes('--check-system');

  if (!fs.existsSync(OUTPUT_PATH)) {
    console.error(`${RED}FAIL${RST} no existe ${OUTPUT_PATH}`);
    process.exit(1);
  }
  let naming;
  try {
    naming = loadJson(OUTPUT_PATH);
  } catch (e) {
    console.error(`${RED}FAIL${RST} naming.json inválido (${e.message})`);
    process.exit(1);
  }

  const { ok, errors } = validateOutput(naming);
  if (!ok) {
    console.log(`${RED}FAIL${RST} naming`);
    for (const e of errors) {
      console.log(`  ${RED}schema${RST}  ${e.instancePath || '/'} ${e.message} (${JSON.stringify(e.params)})`);
    }
    process.exit(1);
  }
  console.log(`${GREEN}PASS${RST} naming (schema)`);

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el sistema ===${RST}`);
    const findings = checkSystem(naming);
    reportFindings(findings);
  }

  process.exit(0);
}

main();

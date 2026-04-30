#!/usr/bin/env node
/**
 * Validador del glosario v1.0.0.
 *
 * Uso:
 *   node glossary.validate.js                # valida _outputs/glossary.json estructuralmente
 *   node glossary.validate.js --check-system # adicional: cross-checks contra módulos del repo
 *
 * Cross-checks que ejecuta con --check-system:
 *  1. ids únicos en glossary.json.
 *  2. Cada concepto tiene al menos uno de {es, en} no-null.
 *  3. Las formas canónicas son ASCII puras (sin tildes ni ñ).
 *  4. Para cada módulo con auditoría modulo-completo y module.json.language declarado:
 *     si un evento publicado contiene un segmento que coincide con la forma canónica
 *     de un concepto del glosario en CUALQUIER idioma, ese segmento DEBE ser la forma
 *     canónica del idioma del módulo.
 *  5. Si module.language='es' y un evento usa una entidad cuyo concepto del glosario
 *     solo tiene forma 'en', se reporta info (uso de término EN en módulo ES).
 *
 * Imprime PASS/FAIL del estado estructural. Cross-checks como findings detallados.
 */

const fs   = require('fs');
const path = require('path');
const Ajv  = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const REPO_ROOT      = path.resolve(__dirname, '../../..');
const SCHEMA_PATH    = path.join(REPO_ROOT, 'arquitectura/convenciones/_schemas/glossary.schema.json');
const OUTPUT_PATH    = path.join(REPO_ROOT, 'arquitectura/convenciones/_outputs/glossary.json');
const NAMING_PATH    = path.join(REPO_ROOT, 'arquitectura/convenciones/_outputs/naming.json');
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

function hasAccentsOrTildeN(s) {
  return /[áéíóúÁÉÍÓÚñÑüÜ]/.test(s);
}

function isAsciiPure(s) {
  return /^[\x20-\x7E]*$/.test(s);
}

function validateOutput(glossary) {
  const schema = loadJson(SCHEMA_PATH);
  const ajv    = new Ajv({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const ok = validate(glossary);
  return { ok, errors: validate.errors || [] };
}

function structuralChecks(glossary) {
  const errors = [];

  // ids únicos
  const ids = glossary.concepts.map(c => c.id);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`id duplicado: "${id}"`);
    seen.add(id);
  }

  // al menos uno de {es, en} no-null (anyOf en schema, pero verificamos también null explícito)
  for (const c of glossary.concepts) {
    if (!c.es && !c.en) {
      errors.push(`concepto "${c.id}" no tiene forma 'es' ni 'en'.`);
    }
  }

  // ASCII puro
  for (const c of glossary.concepts) {
    if (c.es && (!isAsciiPure(c.es) || hasAccentsOrTildeN(c.es))) {
      errors.push(`concepto "${c.id}".es="${c.es}" contiene caracteres no-ASCII.`);
    }
    if (c.en && (!isAsciiPure(c.en) || hasAccentsOrTildeN(c.en))) {
      errors.push(`concepto "${c.id}".en="${c.en}" contiene caracteres no-ASCII.`);
    }
  }

  return errors;
}

function buildLookups(glossary) {
  // entityForm → { id, lang, concept }
  const esByForm = new Map();
  const enByForm = new Map();
  for (const c of glossary.concepts) {
    if (c.es) esByForm.set(c.es, c);
    if (c.en) enByForm.set(c.en, c);
  }
  return { esByForm, enByForm };
}

function checkSystem(glossary) {
  const findings = { errors: [], warnings: [], info: [] };
  const { esByForm, enByForm } = buildLookups(glossary);

  const audits = listAudits();
  for (const ap of audits) {
    let a;
    try { a = loadJson(ap); } catch (e) {
      findings.errors.push(`audit ${path.basename(ap)}: JSON inválido (${e.message})`);
      continue;
    }
    const slug = a._meta?.modulo || path.basename(ap, '.json');
    const mp   = path.join(MODULES_DIR, slug, 'module.json');
    let modLang = null;
    if (fs.existsSync(mp)) {
      try { modLang = loadJson(mp).language || null; } catch (_) {}
    }
    if (!modLang) continue;  // sin idioma declarado, no podemos cruzar

    const publicas = a.eventos?.publica || [];
    for (const ev of publicas) {
      if (ev.nombre?.tipo !== 'literal') continue;
      const evName = ev.nombre.valor;
      if (!evName || typeof evName !== 'string') continue;

      const segments = evName.split('.');
      // entity es el segmento del medio si hay 3 partes, o el segmento prefix si hay 2
      // Para detección de drift de glosario: chequeamos cada segmento que NO sea verbo
      // contra todas las formas canónicas conocidas.
      for (const seg of segments) {
        const matchEn = enByForm.get(seg);
        const matchEs = esByForm.get(seg);

        // Si el segmento está como forma EN de algún concepto pero el módulo es ES:
        if (matchEn && modLang === 'es' && matchEn.es && matchEn.es !== seg) {
          findings.warnings.push(`${slug}: evento "${evName}" usa "${seg}" (forma EN del concepto "${matchEn.id}") pero el módulo es ES — esperaba "${matchEn.es}". Ubicación: ${ev.ubicacion}`);
        }
        // Si el segmento está como forma ES pero el módulo es EN:
        if (matchEs && modLang === 'en' && matchEs.en && matchEs.en !== seg) {
          findings.warnings.push(`${slug}: evento "${evName}" usa "${seg}" (forma ES del concepto "${matchEs.id}") pero el módulo es EN — esperaba "${matchEs.en}". Ubicación: ${ev.ubicacion}`);
        }
        // Si un módulo es ES pero usa una entidad cuyo concepto solo tiene forma EN:
        if (matchEn && !matchEn.es && modLang === 'es') {
          findings.info.push(`${slug}: evento "${evName}" usa "${seg}" del concepto "${matchEn.id}" que solo tiene forma EN. Aceptable solo si el concepto es industria-EN (IoT/AI). Ubicación: ${ev.ubicacion}`);
        }
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
  if (findings.errors.length === 0 && findings.warnings.length === 0 && findings.info.length === 0) {
    console.log(`${GREEN}cross-system: sin drift detectado${RST}`);
  }
}

function main() {
  const checkSystemFlag = process.argv.includes('--check-system');

  if (!fs.existsSync(OUTPUT_PATH)) {
    console.error(`${RED}FAIL${RST} no existe ${OUTPUT_PATH}`);
    process.exit(1);
  }
  let glossary;
  try {
    glossary = loadJson(OUTPUT_PATH);
  } catch (e) {
    console.error(`${RED}FAIL${RST} glossary.json inválido (${e.message})`);
    process.exit(1);
  }

  const { ok, errors } = validateOutput(glossary);
  if (!ok) {
    console.log(`${RED}FAIL${RST} glossary (schema)`);
    for (const e of errors) {
      console.log(`  ${RED}schema${RST}  ${e.instancePath || '/'} ${e.message} (${JSON.stringify(e.params)})`);
    }
    process.exit(1);
  }

  const structErrs = structuralChecks(glossary);
  if (structErrs.length > 0) {
    console.log(`${RED}FAIL${RST} glossary (structural checks)`);
    for (const e of structErrs) console.log(`  ${RED}struct${RST}  ${e}`);
    process.exit(1);
  }
  console.log(`${GREEN}PASS${RST} glossary (schema + structural)`);

  if (checkSystemFlag) {
    console.log('');
    console.log(`${CYAN}=== cross-checks contra el sistema ===${RST}`);
    const findings = checkSystem(glossary);
    reportFindings(findings);
  }

  process.exit(0);
}

main();

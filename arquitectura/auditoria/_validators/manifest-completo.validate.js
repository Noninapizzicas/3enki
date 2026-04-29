#!/usr/bin/env node
/**
 * Validador de la parcela manifest-completo v2.0.0.
 *
 * Uso:
 *   node manifest-completo.validate.js <slug>
 *   node manifest-completo.validate.js --all
 *
 * <slug> es el nombre del módulo con '/' reemplazado por '__'.
 *   Ej: recetas, conversacion__chat-io, pizzepos__cobros
 *
 * Carga el output de arquitectura/auditoria/_outputs/manifest-completo/<slug>.json,
 * lo valida contra el JSON Schema, y ejecuta los checks cruzados del contrato.
 *
 * Exit code 0 = todo OK. Exit code 1 = al menos un fallo.
 */

const fs   = require('fs');
const path = require('path');
const Ajv  = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const REPO_ROOT     = path.resolve(__dirname, '../../..');
const SCHEMA_PATH   = path.join(REPO_ROOT, 'arquitectura/auditoria/_schemas/manifest-completo.schema.json');
const CONTRACT_PATH = path.join(REPO_ROOT, 'arquitectura/auditoria/_contratos/manifest-completo.contract.json');
const OUTPUTS_DIR   = path.join(REPO_ROOT, 'arquitectura/auditoria/_outputs/manifest-completo');
const CONFIG_PATH   = path.join(REPO_ROOT, 'config.json');

const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL   = '\x1b[33m';
const DIM   = '\x1b[2m';
const RST   = '\x1b[0m';

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function listOutputs() {
  if (!fs.existsSync(OUTPUTS_DIR)) return [];
  return fs.readdirSync(OUTPUTS_DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
}

function moduloFromSlug(slug) {
  return slug.replace(/__/g, '/');
}

function ubicacionFromModulo(modulo) {
  return `modules/${modulo}`;
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Uso: node manifest-completo.validate.js <slug> | --all');
    process.exit(2);
  }

  const slugs = arg === '--all' ? listOutputs() : [arg];
  if (slugs.length === 0) {
    console.error(`${YEL}No hay outputs en ${OUTPUTS_DIR}${RST}`);
    process.exit(2);
  }

  const ajv = new Ajv({ strict: true, strictRequired: false, allErrors: true });
  addFormats(ajv);
  const schema   = loadJson(SCHEMA_PATH);
  const contract = loadJson(CONTRACT_PATH);
  const config   = loadJson(CONFIG_PATH);
  const validate = ajv.compile(schema);

  let totalFailed = 0;

  for (const slug of slugs) {
    const result = validateOne(slug, validate, contract, config);
    if (!result.ok) totalFailed++;
    printResult(slug, result);
  }

  if (slugs.length > 1) {
    const passed = slugs.length - totalFailed;
    const color  = totalFailed === 0 ? GREEN : RED;
    console.log(`\n${color}${passed}/${slugs.length} pasan${RST}`);
  }

  process.exit(totalFailed === 0 ? 0 : 1);
}

function validateOne(slug, validate, contract, config) {
  const outPath = path.join(OUTPUTS_DIR, `${slug}.json`);
  if (!fs.existsSync(outPath)) {
    return { ok: false, schemaErrors: [`Output no existe: ${outPath}`], crossErrors: [], warnings: [] };
  }

  let output;
  try {
    output = loadJson(outPath);
  } catch (e) {
    return { ok: false, schemaErrors: [`JSON no parseable: ${e.message}`], crossErrors: [], warnings: [] };
  }

  // 1. JSON Schema
  const schemaOk      = validate(output);
  const schemaErrors  = schemaOk ? [] : validate.errors.map(e => `${e.instancePath || '/'} ${e.message} (${JSON.stringify(e.params)})`);

  // 2. Cross-checks (solo si pasa schema y NO es output de error)
  const crossErrors = [];
  const warnings    = [];

  if (schemaOk && !output.error) {
    const modulo    = moduloFromSlug(slug);
    const ubicacion = ubicacionFromModulo(modulo);
    const mjPath    = path.join(REPO_ROOT, ubicacion, 'module.json');

    if (fs.existsSync(mjPath)) {
      const mjRaw = fs.readFileSync(mjPath, 'utf8');
      let mj;
      try { mj = JSON.parse(mjRaw); } catch (_) { mj = null; }

      // Check: bytes
      const bytesReales = Buffer.byteLength(mjRaw, 'utf8');
      if (Math.abs(output.quirks.module_json_bytes - bytesReales) > 1) {
        crossErrors.push(`quirks.module_json_bytes=${output.quirks.module_json_bytes} ≠ wc -c real=${bytesReales}`);
      }

      // Check: cada eventos.publica[].event aparece literal
      for (const ev of output.eventos.publica) {
        if (!mjRaw.includes(`"${ev.event}"`)) {
          crossErrors.push(`eventos.publica[].event="${ev.event}" no aparece literal en module.json`);
        }
      }

      // Check: cada tools[].name aparece literal
      for (const t of output.tools) {
        if (!mjRaw.includes(`"${t.name}"`)) {
          crossErrors.push(`tools[].name="${t.name}" no aparece literal en module.json`);
        }
      }

      // Check: ui_handlers.campo_origen
      if (mj) {
        const hasUiHandlers = Array.isArray(mj.ui_handlers);
        const hasHandlers   = Array.isArray(mj.handlers);
        const expected      = hasUiHandlers ? 'ui_handlers' : (hasHandlers ? 'handlers' : null);
        if (output.ui_handlers.campo_origen !== expected) {
          crossErrors.push(`ui_handlers.campo_origen="${output.ui_handlers.campo_origen}" ≠ esperado=${expected}`);
        }
      }

      // Check: outliers
      if (mj) {
        const canonica = new Set(contract.lista_canonica_keys_top_level);
        const realKeys = Object.keys(mj).filter(k => !canonica.has(k));
        const claimed  = new Set(output.outliers_capturados.campos_no_canonicos);
        const missing  = realKeys.filter(k => !claimed.has(k));
        const extra    = [...claimed].filter(k => !realKeys.includes(k));
        if (missing.length > 0) crossErrors.push(`outliers no reportados: ${missing.join(', ')}`);
        if (extra.length > 0)   crossErrors.push(`outliers reportados pero no presentes en module.json: ${extra.join(', ')}`);
      }

      // Check: identidad.name === module.json.name
      if (mj && output.identidad.name !== mj.name) {
        crossErrors.push(`identidad.name="${output.identidad.name}" ≠ module.json.name="${mj.name}"`);
      }
    } else {
      warnings.push(`module.json no encontrado en ${mjPath} (¿módulo borrado?)`);
    }

    // Check: habilitado_en_config
    const enabledList  = config.modules?.enabled  || [];
    const disabledList = config.modules?.disabled || [];
    const name         = output.identidad.name;
    if (output.estado_en_sistema.habilitado_en_config !== enabledList.includes(name)) {
      crossErrors.push(`estado_en_sistema.habilitado_en_config no concuerda con config.modules.enabled.includes("${name}")`);
    }
    if (output.estado_en_sistema.en_disabled_de_config !== disabledList.includes(name)) {
      crossErrors.push(`estado_en_sistema.en_disabled_de_config no concuerda con config.modules.disabled.includes("${name}")`);
    }

    // Check: estado_modulo derivación
    let expectedEstado;
    if (!fs.existsSync(path.join(REPO_ROOT, ubicacion, 'module.json'))) {
      expectedEstado = 'fantasma';
    } else if (disabledList.includes(name)) {
      expectedEstado = 'dormido_por_diseno';
    } else if (enabledList.includes(name)) {
      expectedEstado = 'vivo';
    } else {
      expectedEstado = 'candidato_a_retirada';
    }
    if (output.estado_en_sistema.estado_modulo !== expectedEstado) {
      crossErrors.push(`estado_modulo="${output.estado_en_sistema.estado_modulo}" ≠ derivado=${expectedEstado}`);
    }

    // Check: version_archivada.existe ⇒ ubicacion existe
    if (output.version_archivada.existe) {
      if (!output.version_archivada.ubicacion) {
        crossErrors.push(`version_archivada.existe=true pero ubicacion=null`);
      } else {
        const archivedPath = path.join(REPO_ROOT, output.version_archivada.ubicacion);
        if (!fs.existsSync(archivedPath)) {
          crossErrors.push(`version_archivada.ubicacion="${output.version_archivada.ubicacion}" no existe`);
        }
      }
    }
  }

  return {
    ok: schemaErrors.length === 0 && crossErrors.length === 0,
    schemaErrors,
    crossErrors,
    warnings
  };
}

function printResult(slug, r) {
  const tag = r.ok ? `${GREEN}PASS${RST}` : `${RED}FAIL${RST}`;
  console.log(`${tag} ${slug}`);
  for (const e of r.schemaErrors) console.log(`  ${RED}schema${RST}  ${e}`);
  for (const e of r.crossErrors)  console.log(`  ${RED}cross${RST}   ${e}`);
  for (const w of r.warnings)     console.log(`  ${YEL}warn${RST}    ${w}`);
}

main();

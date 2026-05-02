#!/usr/bin/env node
/**
 * Validador de la parcela eventos-emitidos v1.0.0.
 *
 * Uso:
 *   node eventos-emitidos.validate.js <slug>
 *   node eventos-emitidos.validate.js --all
 *
 * Carga el output de arquitectura/auditoria/_outputs/eventos-emitidos/<slug>.json,
 * lo valida contra el JSON Schema, y ejecuta checks cruzados que incluyen:
 *
 *  - cada ubicacion reportada contiene literalmente '.publish(' (anti-invención)
 *  - publishes_count_total === len(eventos_emitidos)
 *  - manifest_referencia apunta a un archivo existente
 *  - publishes_declarados_en_manifest coincide con manifest leído independientemente
 *  - distribución por canal suma al total
 *  - cada snippet contiene literalmente '.publish('
 */

const fs   = require('fs');
const path = require('path');
const Ajv  = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const REPO_ROOT     = path.resolve(__dirname, '../../..');
const SCHEMA_PATH   = path.join(REPO_ROOT, 'arquitectura/auditoria/_schemas/eventos-emitidos.schema.json');
const OUTPUTS_DIR   = path.join(REPO_ROOT, 'arquitectura/auditoria/_outputs/eventos-emitidos');

const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL   = '\x1b[33m';
const RST   = '\x1b[0m';

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function listOutputs() {
  if (!fs.existsSync(OUTPUTS_DIR)) return [];
  return fs.readdirSync(OUTPUTS_DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
}

function readLine(filePath, lineNum) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  if (lineNum < 1 || lineNum > lines.length) return null;
  return lines[lineNum - 1];
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Uso: node eventos-emitidos.validate.js <slug> | --all');
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
  const validate = ajv.compile(schema);

  let totalFailed = 0;
  for (const slug of slugs) {
    const result = validateOne(slug, validate);
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

function validateOne(slug, validate) {
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
  const schemaOk     = validate(output);
  const schemaErrors = schemaOk ? [] : validate.errors.map(e => `${e.instancePath || '/'} ${e.message} (${JSON.stringify(e.params)})`);

  const crossErrors = [];
  const warnings    = [];

  if (!schemaOk) return { ok: false, schemaErrors, crossErrors, warnings };

  // 2. Cross-checks
  const events = output.eventos_emitidos;

  // 2.1 publishes_count_total === len(eventos_emitidos)
  if (output.quirks.publishes_count_total !== events.length) {
    crossErrors.push(`quirks.publishes_count_total=${output.quirks.publishes_count_total} ≠ eventos_emitidos.length=${events.length}`);
  }

  // 2.2 indices consecutivos 1..N
  for (let i = 0; i < events.length; i++) {
    if (events[i].indice !== i + 1) {
      crossErrors.push(`eventos_emitidos[${i}].indice=${events[i].indice} ≠ esperado ${i + 1}`);
      break;
    }
  }

  // 2.3 cada ubicacion contiene literalmente '.publish(' — anti-invención
  for (const ev of events) {
    const [filePath, lineStr] = ev.ubicacion.split(':');
    const lineNum = parseInt(lineStr, 10);
    const fullPath = path.join(REPO_ROOT, filePath);
    const lineContent = readLine(fullPath, lineNum);
    if (lineContent === null) {
      crossErrors.push(`eventos_emitidos[${ev.indice}].ubicacion="${ev.ubicacion}": archivo o línea no existe`);
    } else if (!lineContent.includes('.publish(')) {
      crossErrors.push(`eventos_emitidos[${ev.indice}].ubicacion="${ev.ubicacion}": la línea no contiene '.publish('. Línea: ${lineContent.trim().slice(0, 80)}`);
    }
  }

  // 2.4 cada snippet contiene '.publish('
  for (const ev of events) {
    if (!ev.snippet.includes('.publish(')) {
      crossErrors.push(`eventos_emitidos[${ev.indice}].snippet no contiene '.publish('`);
    }
  }

  // 2.5 distribución por canal suma al total
  const c = output.patrones_observados.publishes_por_canal;
  if (c.eventBus + c.mqtt_directo + c.otro !== events.length) {
    crossErrors.push(`publishes_por_canal suma=${c.eventBus + c.mqtt_directo + c.otro} ≠ events.length=${events.length}`);
  }

  // 2.6 manifest_referencia apunta a archivo existente
  const manifestPath = path.join(REPO_ROOT, output._meta.manifest_referencia);
  if (!fs.existsSync(manifestPath)) {
    crossErrors.push(`manifest_referencia="${output._meta.manifest_referencia}" no existe`);
  } else {
    let manifest;
    try { manifest = loadJson(manifestPath); } catch (_) { manifest = null; }
    if (manifest) {
      if (manifest._meta && manifest._meta.modulo !== output._meta.modulo) {
        crossErrors.push(`manifest_referencia._meta.modulo="${manifest._meta.modulo}" ≠ output._meta.modulo="${output._meta.modulo}"`);
      }
      if (manifest.eventos && Array.isArray(manifest.eventos.publica)) {
        const declaradosReal = manifest.eventos.publica.map(e => e.event).sort();
        const declaradosOutput = [...output.consistencia_con_manifest.publishes_declarados_en_manifest].sort();
        if (JSON.stringify(declaradosReal) !== JSON.stringify(declaradosOutput)) {
          crossErrors.push(`publishes_declarados_en_manifest no coincide con manifest real. Real=${JSON.stringify(declaradosReal)} Output=${JSON.stringify(declaradosOutput)}`);
        }
      }
    }
  }

  // 2.7 literales_unicos_emitidos coincide con set de eventos_emitidos[].nombre.valor donde tipo=literal
  const literalesReal = [...new Set(events.filter(e => e.nombre.tipo === 'literal').map(e => e.nombre.valor))].sort();
  const literalesClaim = [...output.consistencia_con_manifest.literales_unicos_emitidos].sort();
  if (JSON.stringify(literalesReal) !== JSON.stringify(literalesClaim)) {
    crossErrors.push(`literales_unicos_emitidos derivado=${JSON.stringify(literalesReal)} ≠ reportado=${JSON.stringify(literalesClaim)}`);
  }

  // 2.8 publishes_dinamicos = count donde tipo!=literal
  const dinReal = events.filter(e => e.nombre.tipo !== 'literal').length;
  if (output.patrones_observados.publishes_dinamicos !== dinReal) {
    crossErrors.push(`publishes_dinamicos reportado=${output.patrones_observados.publishes_dinamicos} ≠ derivado=${dinReal}`);
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

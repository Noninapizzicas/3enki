#!/usr/bin/env node
/**
 * Validador de la parcela modulo-completo v1.0.0.
 *
 * Uso:
 *   node modulo-completo.validate.js <slug>
 *   node modulo-completo.validate.js --all
 *
 * Carga el output, valida contra el JSON Schema, y ejecuta 13 checks cruzados:
 *  - manifest_referencia coincide
 *  - cada eventos.publica[].ubicacion contiene literalmente '.publish('
 *  - cada eventos.subscribes[].handler_ubicacion contiene el nombre del handler
 *  - cada tools[].handler_ubicacion contiene el nombre del método
 *  - cada estado.memoria[].ubicacion_init contiene 'this.<campo>'
 *  - cada sqlite_tablas[].ubicacion_create contiene 'CREATE TABLE'
 *  - cada todos[].ubicacion contiene el tipo (TODO/FIXME/XXX/HACK)
 *  - publica_declarados_no_emitidos = (manifest.publica - publica_literales)
 *  - publica_emitidos_no_declarados = (publica_literales - manifest.publica)
 *  - metricas_fisicas.lineas_index_js coincide con wc -l real (±1)
 *  - ultimo_commit.sha existe en git log si != null
 *  - version_archivada.existe=true => ubicacion existe
 *  - distribución por canal = len(eventos.publica)
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Ajv  = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const REPO_ROOT     = path.resolve(__dirname, '../../..');
const SCHEMA_PATH   = path.join(REPO_ROOT, 'arquitectura/auditoria/_schemas/modulo-completo.schema.json');
const OUTPUTS_DIR   = path.join(REPO_ROOT, 'arquitectura/auditoria/_outputs/modulo-completo');

const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL   = '\x1b[33m';
const RST   = '\x1b[0m';

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

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

function shaExists(sha) {
  try {
    execSync(`git -C "${REPO_ROOT}" cat-file -e ${sha}`, { stdio: 'pipe' });
    return true;
  } catch (_) { return false; }
}

function setEqual(a, b) {
  const sa = [...new Set(a)].sort();
  const sb = [...new Set(b)].sort();
  return JSON.stringify(sa) === JSON.stringify(sb);
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Uso: node modulo-completo.validate.js <slug> | --all');
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
  try { output = loadJson(outPath); }
  catch (e) { return { ok: false, schemaErrors: [`JSON no parseable: ${e.message}`], crossErrors: [], warnings: [] }; }

  const schemaOk     = validate(output);
  const schemaErrors = schemaOk ? [] : validate.errors.map(e => `${e.instancePath || '/'} ${e.message} (${JSON.stringify(e.params)})`);

  const crossErrors = [];
  const warnings    = [];

  if (!schemaOk) return { ok: false, schemaErrors, crossErrors, warnings };

  // 1. manifest_referencia
  const manifestPath = path.join(REPO_ROOT, output._meta.manifest_referencia);
  let manifest = null;
  if (!fs.existsSync(manifestPath)) {
    crossErrors.push(`manifest_referencia="${output._meta.manifest_referencia}" no existe`);
  } else {
    try { manifest = loadJson(manifestPath); } catch (_) { manifest = null; }
    if (manifest && manifest._meta && manifest._meta.modulo !== output._meta.modulo) {
      crossErrors.push(`manifest._meta.modulo="${manifest._meta.modulo}" ≠ output._meta.modulo="${output._meta.modulo}"`);
    }
  }

  // 2. cada eventos.publica[].ubicacion contiene '.publish('
  for (const ev of output.eventos.publica) {
    const [filePath, lineStr] = ev.ubicacion.split(':');
    const lineNum = parseInt(lineStr, 10);
    const line = readLine(path.join(REPO_ROOT, filePath), lineNum);
    if (line === null) {
      crossErrors.push(`eventos.publica ubicacion="${ev.ubicacion}": archivo o línea no existe`);
    } else if (!line.includes('.publish(')) {
      crossErrors.push(`eventos.publica ubicacion="${ev.ubicacion}" NO contiene '.publish('. Línea: ${line.trim().slice(0, 80)}`);
    }
  }

  // 3. cada eventos.subscribes[].handler_ubicacion contiene el handler como identificador (si no es null)
  for (const sub of output.eventos.subscribes) {
    if (sub.handler && sub.handler_ubicacion) {
      const [filePath, lineStr] = sub.handler_ubicacion.split(':');
      const lineNum = parseInt(lineStr, 10);
      const line = readLine(path.join(REPO_ROOT, filePath), lineNum);
      if (line === null) {
        crossErrors.push(`subscribes handler_ubicacion="${sub.handler_ubicacion}": archivo/línea no existe`);
      } else if (!line.includes(sub.handler)) {
        crossErrors.push(`subscribes handler_ubicacion="${sub.handler_ubicacion}" NO contiene handler "${sub.handler}"`);
      }
    }
  }

  // 4. tools[].handler_ubicacion contiene el método
  for (const t of output.tools) {
    if (t.handler_metodo && t.handler_ubicacion) {
      const [filePath, lineStr] = t.handler_ubicacion.split(':');
      const lineNum = parseInt(lineStr, 10);
      const line = readLine(path.join(REPO_ROOT, filePath), lineNum);
      if (line === null) {
        crossErrors.push(`tools handler_ubicacion="${t.handler_ubicacion}": archivo/línea no existe`);
      } else if (!line.includes(t.handler_metodo)) {
        crossErrors.push(`tools handler_ubicacion="${t.handler_ubicacion}" NO contiene método "${t.handler_metodo}"`);
      }
    }
  }

  // 5. estado.memoria[].ubicacion_init contiene 'this.<campo>'
  for (const m of output.estado.memoria) {
    const [filePath, lineStr] = m.ubicacion_init.split(':');
    const lineNum = parseInt(lineStr, 10);
    const line = readLine(path.join(REPO_ROOT, filePath), lineNum);
    if (line === null) {
      crossErrors.push(`estado.memoria ubicacion_init="${m.ubicacion_init}": archivo/línea no existe`);
    } else if (!line.includes(`this.${m.campo.replace(/^this\./, '')}`)) {
      crossErrors.push(`estado.memoria ubicacion_init="${m.ubicacion_init}" NO contiene 'this.${m.campo}'`);
    }
  }

  // 6. sqlite_tablas[].ubicacion_create contiene 'CREATE TABLE'
  for (const t of output.estado.persistencia.sqlite_tablas) {
    const [filePath, lineStr] = t.ubicacion_create.split(':');
    const lineNum = parseInt(lineStr, 10);
    const line = readLine(path.join(REPO_ROOT, filePath), lineNum);
    if (line === null) {
      crossErrors.push(`sqlite_tablas ubicacion_create="${t.ubicacion_create}": archivo/línea no existe`);
    } else if (!/create\s+table/i.test(line)) {
      crossErrors.push(`sqlite_tablas ubicacion_create="${t.ubicacion_create}" NO contiene 'CREATE TABLE'`);
    }
  }

  // 7. todos[].ubicacion contiene el tipo
  for (const todo of output.codigo_intencion.todos) {
    const [filePath, lineStr] = todo.ubicacion.split(':');
    const lineNum = parseInt(lineStr, 10);
    const line = readLine(path.join(REPO_ROOT, filePath), lineNum);
    if (line === null) {
      crossErrors.push(`todos ubicacion="${todo.ubicacion}": archivo/línea no existe`);
    } else if (!line.toLowerCase().includes(todo.tipo.toLowerCase())) {
      crossErrors.push(`todos ubicacion="${todo.ubicacion}" NO contiene tipo "${todo.tipo}"`);
    }
  }

  // 8 & 9. consistencia derivada
  if (manifest && manifest.eventos && Array.isArray(manifest.eventos.publica)) {
    const declaredManifest = manifest.eventos.publica.map(e => e.event);
    const literalesEnCodigo = output.eventos.consistencia_con_manifest.publica_literales_en_codigo;
    const declaredNotEmitted = declaredManifest.filter(e => !literalesEnCodigo.includes(e));
    const emittedNotDeclared = literalesEnCodigo.filter(e => !declaredManifest.includes(e));
    const claimedDecNotEm = output.eventos.consistencia_con_manifest.publica_declarados_no_emitidos;
    const claimedEmNotDec = output.eventos.consistencia_con_manifest.publica_emitidos_no_declarados;
    if (!setEqual(declaredNotEmitted, claimedDecNotEm)) {
      crossErrors.push(`publica_declarados_no_emitidos derivado=${JSON.stringify(declaredNotEmitted)} ≠ reportado=${JSON.stringify(claimedDecNotEm)}`);
    }
    if (!setEqual(emittedNotDeclared, claimedEmNotDec)) {
      crossErrors.push(`publica_emitidos_no_declarados derivado=${JSON.stringify(emittedNotDeclared)} ≠ reportado=${JSON.stringify(claimedEmNotDec)}`);
    }
    // publica_declarados_en_manifest debe coincidir con manifest real
    if (!setEqual(declaredManifest, output.eventos.consistencia_con_manifest.publica_declarados_en_manifest)) {
      crossErrors.push(`publica_declarados_en_manifest no coincide con manifest real`);
    }
    // publica_literales_en_codigo coincide con set de eventos.publica[].nombre.valor donde tipo=literal
    const literalesDerivados = [...new Set(output.eventos.publica.filter(e => e.nombre.tipo === 'literal').map(e => e.nombre.valor))];
    if (!setEqual(literalesDerivados, literalesEnCodigo)) {
      crossErrors.push(`publica_literales_en_codigo derivado=${JSON.stringify(literalesDerivados)} ≠ reportado=${JSON.stringify(literalesEnCodigo)}`);
    }
  }

  // 10. metricas_fisicas.lineas_index_js
  const indexPath = path.join(REPO_ROOT, output._meta.ubicacion, 'index.js');
  if (fs.existsSync(indexPath)) {
    const real = fs.readFileSync(indexPath, 'utf8').split('\n').length;
    const reported = output.metricas_fisicas.lineas_index_js;
    if (Math.abs(reported - real) > 1) {
      crossErrors.push(`metricas_fisicas.lineas_index_js=${reported} difiere de wc -l real=${real} (>1)`);
    }
  }

  // 11. ultimo_commit.sha existe en git
  if (output.metricas_fisicas.ultimo_commit && output.metricas_fisicas.ultimo_commit.sha) {
    if (!shaExists(output.metricas_fisicas.ultimo_commit.sha)) {
      crossErrors.push(`ultimo_commit.sha="${output.metricas_fisicas.ultimo_commit.sha}" no existe en git log`);
    }
  }

  // 12. version_archivada.existe ⇒ ubicacion existe
  if (output.version_archivada.existe) {
    if (!output.version_archivada.ubicacion) {
      crossErrors.push(`version_archivada.existe=true pero ubicacion=null`);
    } else if (!fs.existsSync(path.join(REPO_ROOT, output.version_archivada.ubicacion))) {
      crossErrors.push(`version_archivada.ubicacion="${output.version_archivada.ubicacion}" no existe`);
    }
  }

  // 13. distribución por canal
  const canales = { eventBus: 0, mqtt_directo: 0, otro: 0 };
  for (const ev of output.eventos.publica) canales[ev.canal.tipo]++;
  if (canales.eventBus + canales.mqtt_directo + canales.otro !== output.eventos.publica.length) {
    crossErrors.push(`distribución de canales no suma a len(eventos.publica)`);
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

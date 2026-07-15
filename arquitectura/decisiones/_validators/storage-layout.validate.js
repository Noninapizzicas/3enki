#!/usr/bin/env node
/**
 * Validador del transversal storage-layout v1.0.0.
 *
 * Estructural:
 *  - storage_layout_contract_estructura_valida              (error) — secciones canonicas presentes
 *  - storage_layout_schema_module_persistence_config_valido (error) — schema AJV strict cargado
 *
 * Cross-checks (mapeo directo al contrato):
 *  - drift_path_con_prefijo_sintetico                       (error) — emisor publica fs.*.request con path /storage/, /projects/, /data/ o /<vertical-propio>/
 *  - drift_module_persistente_sin_data_path                 (error) — modulo persiste pero module.json no declara config.persistence.{data_path, scope}
 *  - drift_data_path_invalido                               (error) — data_path no matchea schema (kebab-case, sin variables, sin slashes)
 *  - drift_module_json_con_slug_en_paths                    (error) — config.persistence.* contiene {slug}/{base_path}/{name}/{project_id}
 *  - drift_feature_blueprint_directorio_fuera_namespace     (error) — blueprints/project-types/<f>.json declara directorios fuera de storage/<f.id>/
 *  - drift_archivo_inicial_en_storage_raiz                  (error) — initialFiles con clave 'storage/<file>.<ext>' sin subdirectorio
 *  - drift_bypass_filesystem                                (warning) — modulo (no whitelisted) usa require('fs') con writeFile/readFile/mkdir/unlink directos
 *
 * Output: arquitectura/decisiones/_outputs/storage-layout.json
 *
 * Contrato: arquitectura/decisiones/_contratos/storage-layout.contract.json
 * Schema: arquitectura/decisiones/_schemas/storage-layout/persistence-config.schema.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT     = path.resolve(__dirname, '../../..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/storage-layout.contract.json');
const SCHEMA_PATH   = path.join(REPO_ROOT, 'arquitectura/decisiones/_schemas/storage-layout/persistence-config.schema.json');
const MODULES_DIR   = path.join(REPO_ROOT, 'modules');
const PROJECT_TYPES_DIR = path.join(REPO_ROOT, 'blueprints/project-types');
const OUTPUT_PATH   = path.join(REPO_ROOT, 'arquitectura/decisiones/_outputs/storage-layout.json');

const RED='\x1b[31m', GREEN='\x1b[32m', YEL='\x1b[33m', CYAN='\x1b[36m', GRY='\x1b[90m', RST='\x1b[0m';

const SECCIONES_CANONICAS = [
  '_doc','id','version','creada','supersedes_nota',
  'objetivo','inputs','filosofia','principios',
  'decisiones_arquitectonicas','prohibido',
  'output_shape_resumen','reglas_de_extraccion',
  'derivaciones','validaciones_cross_realizadas_por_validator',
  'salida_validador','convenciones_complementarias'
];

// Modulos exentos del cross-check drift_bypass_filesystem.
// Son los que TIENEN que tocar fs directamente por rol canonico.
const FS_WHITELIST_MODULES = new Set([
  'filesystem',          // ES filesystem
  'database-manager',    // duenyo de sqlite
  'project-manager',     // crea/borra directorios de proyecto
  'log-manager',         // append-only logs
  'firmware-manager',    // operaciones de firmware en disco
  'firmware-builder',    // builds en disco
  'esp32-flasher',       // serial port + bin
  'esp32-dev',           // tooling esp32
  'system-inspector',    // introspeccion del filesystem
  'credential-manager',  // master.key persistencia
  'certificate-authority', // certificados PKI
  'invitaciones'         // invitaciones emitidas + estado (cadena de delegacion)
]);

// Verticales conocidos (subdirectorios de modules/ que agrupan modulos).
// Cualquier nombre que empiece con _ se considera meta-directorio (no vertical).
function isVerticalDir(name) {
  return /^[a-z][a-z0-9-]*$/.test(name) && !name.startsWith('_');
}

const FS_REQUEST_REGEX = /fs\.(write|read|edit|delete|list|append|move|copy|mkdir|info|stats|search)\.request/;
const PATH_SINTETICO_REGEX = /["']path["']\s*:\s*["']\/(storage|projects|data)\//;
const SLUG_VAR_REGEX = /\{(slug|base_path|name|project_id)\}/;

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function lineOfOffset(content, offset) {
  return content.slice(0, offset).split('\n').length;
}

// Lista modules/**/module.json con metadata de ubicacion (vertical si aplica).
function listModuleJsons() {
  const acc = [];
  if (!fs.existsSync(MODULES_DIR)) return acc;
  for (const name of fs.readdirSync(MODULES_DIR)) {
    if (name === 'node_modules' || name === '_archived' || name === '_legacy' || name.startsWith('.')) continue;
    const full = path.join(MODULES_DIR, name);
    try {
      const stat = fs.statSync(full);
      if (!stat.isDirectory()) continue;
      // Nivel 1: modules/<X>/module.json
      const mj1 = path.join(full, 'module.json');
      if (fs.existsSync(mj1)) {
        acc.push({ module_json: mj1, dir: full, name, vertical: null });
      }
      // Nivel 2: modules/<vertical>/<modulo>/module.json
      if (isVerticalDir(name) || name.startsWith('_')) {
        for (const child of fs.readdirSync(full)) {
          if (child === 'node_modules' || child.startsWith('_') || child.startsWith('.')) continue;
          const childFull = path.join(full, child);
          try {
            if (!fs.statSync(childFull).isDirectory()) continue;
            const mj2 = path.join(childFull, 'module.json');
            if (fs.existsSync(mj2)) {
              acc.push({
                module_json: mj2,
                dir: childFull,
                name: child,
                vertical: isVerticalDir(name) ? name : null
              });
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  }
  return acc;
}

// Detecta si el modulo publica fs.*.request: mira index.js + cualquier *.blueprint.json en su dir.
function modulePersists(mod) {
  const candidates = [];
  const idx = path.join(mod.dir, 'index.js');
  if (fs.existsSync(idx)) candidates.push(idx);
  for (const f of fs.readdirSync(mod.dir)) {
    if (f.endsWith('.blueprint.json')) candidates.push(path.join(mod.dir, f));
  }
  for (const f of candidates) {
    try {
      const content = fs.readFileSync(f, 'utf-8');
      if (FS_REQUEST_REGEX.test(content)) return { persiste: true, evidence_file: f };
    } catch (_) {}
  }
  return { persiste: false, evidence_file: null };
}

// === RUN ===

function run({ checkSystem = false } = {}) {
  const findings = { error: [], warning: [], info: [] };

  // ------- ESTRUCTURAL -------
  let contract;
  try {
    contract = loadJson(CONTRACT_PATH);
  } catch (e) {
    findings.error.push({
      id: 'storage_layout_contract_estructura_valida',
      file: CONTRACT_PATH,
      detail: `No se puede leer/parsear el contrato: ${e.message}`
    });
    return finalize(findings, null, checkSystem);
  }

  for (const sec of SECCIONES_CANONICAS) {
    if (!(sec in contract)) {
      findings.error.push({
        id: 'storage_layout_contract_estructura_valida',
        file: 'storage-layout.contract.json',
        detail: `Falta seccion canonica: ${sec}`
      });
    }
  }

  // Schema AJV draft 2020-12 (si esta disponible)
  let schemaValidator = null;
  try {
    const Ajv2020 = require('ajv/dist/2020');
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    const schema = loadJson(SCHEMA_PATH);
    schemaValidator = ajv.compile(schema);
  } catch (e) {
    findings.warning.push({
      id: 'storage_layout_schema_module_persistence_config_valido',
      file: SCHEMA_PATH,
      detail: `AJV no disponible o schema invalido (${e.message}); cross-checks de data_path se hacen con regex.`
    });
  }

  if (!checkSystem) return finalize(findings, contract, false);

  // ------- CROSS-SYSTEM -------
  const modules = listModuleJsons();
  const persistencePerModule = [];
  const featuresReport = [];

  // 1. Per-modulo: detectar persistencia + verificar declaracion
  for (const mod of modules) {
    let manifest;
    try { manifest = loadJson(mod.module_json); }
    catch (e) {
      findings.error.push({
        id: 'storage_layout_contract_estructura_valida',
        file: path.relative(REPO_ROOT, mod.module_json),
        detail: `No se puede leer/parsear module.json: ${e.message}`
      });
      continue;
    }
    const { persiste, evidence_file } = modulePersists(mod);
    const declared = manifest.config?.persistence || null;
    const declared_data_path = declared?.data_path || null;
    const declared_scope = declared?.scope || null;

    persistencePerModule.push({
      name: mod.name,
      ubicacion: path.relative(REPO_ROOT, mod.dir),
      vertical: mod.vertical,
      persiste,
      evidence_file: evidence_file ? path.relative(REPO_ROOT, evidence_file) : null,
      scope: declared_scope,
      data_path: declared_data_path,
      declarado_completo: persiste ? !!(declared_data_path && declared_scope) : null
    });

    if (persiste && (!declared_data_path || !declared_scope)) {
      findings.error.push({
        id: 'drift_module_persistente_sin_data_path',
        file: path.relative(REPO_ROOT, mod.module_json),
        detail: `Modulo ${mod.name} publica fs.*.request (evidencia: ${path.relative(REPO_ROOT, evidence_file)}) pero su module.json no declara config.persistence.{data_path, scope}. Falta: ${[!declared_data_path && 'data_path', !declared_scope && 'scope'].filter(Boolean).join(', ')}.`
      });
    }

    // Validar data_path con schema AJV — SOLO si el modulo persiste via filesystem.
    // Modulos que declaran config.persistence con otro patron (sqlite via database-manager,
    // in-memory, append-only-log gobernado por log-manager) NO caen bajo storage-layout.
    if (persiste && declared && schemaValidator) {
      const ok = schemaValidator(declared);
      if (!ok) {
        for (const err of schemaValidator.errors || []) {
          findings.error.push({
            id: 'drift_data_path_invalido',
            file: path.relative(REPO_ROOT, mod.module_json),
            detail: `config.persistence ${err.instancePath || '(root)'} ${err.message} (valor: ${JSON.stringify(declared[err.instancePath?.slice(1) || ''] ?? declared)})`
          });
        }
      }
    }

    // Variables {slug}/{base_path}/etc — aplica a CUALQUIER modulo que declare paths,
    // persista via fs o no. project-identity.PROH1 las prohibe globalmente.
    if (declared) {
      const serialized = JSON.stringify(declared);
      if (SLUG_VAR_REGEX.test(serialized)) {
        const m = serialized.match(SLUG_VAR_REGEX);
        findings.error.push({
          id: 'drift_module_json_con_slug_en_paths',
          file: path.relative(REPO_ROOT, mod.module_json),
          detail: `config.persistence contiene variable prohibida ${m[0]} (base_path es autoritativo, recomponer paths localmente es antipatron — ver project-identity.PROH1).`
        });
      }
    }

    // bypass_filesystem en index.js (warning)
    if (!FS_WHITELIST_MODULES.has(mod.name)) {
      const idx = path.join(mod.dir, 'index.js');
      if (fs.existsSync(idx)) {
        try {
          const src = fs.readFileSync(idx, 'utf-8');
          const fsRequireMatch = src.match(/require\s*\(\s*['"]fs['"]\s*\)/);
          if (fsRequireMatch) {
            const opMatch = src.match(/fs\.(promises\.)?(writeFile|readFile|mkdir|unlink|rmdir|appendFile|rename|copyFile)/);
            if (opMatch) {
              findings.warning.push({
                id: 'drift_bypass_filesystem',
                file: path.relative(REPO_ROOT, idx) + ':' + lineOfOffset(src, opMatch.index),
                detail: `Modulo ${mod.name} usa fs.${opMatch[2]} directo. Si es path canonico del proyecto, debe publicar fs.*.request al bus. Si es helper interno (tests, mocks, scratch), añadir a FS_WHITELIST_MODULES o documentar la excepcion.`
              });
            }
          }
        } catch (_) {}
      }
    }
  }

  // 2. Per-archivo: scan paths sinteticos en blueprints y JS de modulos
  function* walkRepo(dir, depth = 0) {
    if (depth > 6 || !fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '_archived' || name === '_legacy' || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) yield* walkRepo(full, depth + 1);
        else if (name.endsWith('.blueprint.json') || (name.endsWith('.js') && !name.endsWith('.test.js'))) {
          yield full;
        }
      } catch (_) {}
    }
  }

  for (const f of walkRepo(MODULES_DIR)) {
    let content;
    try { content = fs.readFileSync(f, 'utf-8'); } catch (_) { continue; }
    let m;
    const re = /["']path["']\s*:\s*["']\/(storage|projects|data)\/[^"']*["']/g;
    while ((m = re.exec(content)) !== null) {
      // Ignorar si esta dentro de comentario JS (heuristica simple)
      const lineStart = content.lastIndexOf('\n', m.index) + 1;
      const lineText = content.slice(lineStart, content.indexOf('\n', m.index));
      if (/^\s*(\/\/|\*|#)/.test(lineText)) continue;
      findings.error.push({
        id: 'drift_path_con_prefijo_sintetico',
        file: path.relative(REPO_ROOT, f) + ':' + lineOfOffset(content, m.index),
        detail: `Path con prefijo sintetico ${m[0]}. /storage/, /projects/, /data/ los compone filesystem desde base_path + data_path. Pasar path relativo al data_path del modulo.`
      });
    }
  }

  // 3. Feature-blueprints: namespace y archivos sueltos
  if (fs.existsSync(PROJECT_TYPES_DIR)) {
    for (const fname of fs.readdirSync(PROJECT_TYPES_DIR)) {
      if (!fname.endsWith('.json')) continue;
      const full = path.join(PROJECT_TYPES_DIR, fname);
      let feature;
      try { feature = loadJson(full); }
      catch (e) {
        findings.error.push({
          id: 'drift_feature_blueprint_directorio_fuera_namespace',
          file: path.relative(REPO_ROOT, full),
          detail: `No se puede parsear feature blueprint: ${e.message}`
        });
        continue;
      }
      const namespace = feature.id;
      const namespacePrefix = `storage/${namespace}/`;
      const featureReport = {
        id: namespace,
        file: path.relative(REPO_ROOT, full),
        directorios: feature.directories || [],
        archivos_iniciales: Object.keys(feature.initialFiles || {}),
        cumple_namespace: true,
        drifts: []
      };

      // directories
      for (const d of feature.directories || []) {
        if (d.startsWith('config/') || d.startsWith('db/') || d.startsWith('handlers/')) continue;
        if (!d.startsWith(namespacePrefix)) {
          featureReport.cumple_namespace = false;
          featureReport.drifts.push(`directorio fuera de namespace: ${d}`);
          findings.error.push({
            id: 'drift_feature_blueprint_directorio_fuera_namespace',
            file: path.relative(REPO_ROOT, full),
            detail: `Feature '${namespace}' declara directorio '${d}' fuera de '${namespacePrefix}'. Mover a '${namespacePrefix}${d.replace(/^storage\//, '')}'.`
          });
        }
      }
      // initialFiles
      for (const k of Object.keys(feature.initialFiles || {})) {
        if (k.startsWith('config/') || k.startsWith('db/')) continue;
        // archivo suelto en storage/ raiz
        if (/^storage\/[^/]+\.[^/]+$/.test(k)) {
          featureReport.cumple_namespace = false;
          featureReport.drifts.push(`archivo suelto en storage/ raiz: ${k}`);
          findings.error.push({
            id: 'drift_archivo_inicial_en_storage_raiz',
            file: path.relative(REPO_ROOT, full),
            detail: `Feature '${namespace}' declara initialFile '${k}' directamente en storage/. Mover dentro del namespace: 'storage/${namespace}/${k.replace(/^storage\//, '')}'.`
          });
        } else if (k.startsWith('storage/') && !k.startsWith(namespacePrefix)) {
          featureReport.cumple_namespace = false;
          featureReport.drifts.push(`initialFile fuera de namespace: ${k}`);
          findings.error.push({
            id: 'drift_feature_blueprint_directorio_fuera_namespace',
            file: path.relative(REPO_ROOT, full),
            detail: `Feature '${namespace}' declara initialFile '${k}' fuera de '${namespacePrefix}'.`
          });
        }
      }
      featuresReport.push(featureReport);
    }
  }

  return finalize(findings, contract, true, { modulos: persistencePerModule, features: featuresReport });
}

function finalize(findings, contract, checkSystem, extra = null) {
  const totalErr  = findings.error.length;
  const totalWarn = findings.warning.length;
  const totalInfo = findings.info.length;

  const banner = `== storage-layout ==`;
  if (totalErr === 0 && totalWarn === 0) {
    console.log(`${GREEN}${banner} PASS${RST} (${checkSystem ? 'cross-system' : 'structural-only'})`);
  } else {
    console.log(totalErr > 0 ? `${RED}${banner} FAIL${RST}` : `${YEL}${banner} WARN${RST}`);
  }

  function dump(level, color) {
    if (!findings[level].length) return;
    // Simbolo canonico por severidad: lo lee scripts/validate-all.js (parseFindings).
    const sym = level === 'error' ? '✗' : level === 'warning' ? '!' : 'i';
    console.log(`\n${color}[${level}]${RST} ${findings[level].length} finding${findings[level].length===1?'':'s'}:`);
    for (const f of findings[level]) {
      // Linea UNICA en el formato de la casa: "<sym> <drift_id>: <detalle>".
      // Antes eran 3 lineas con vineta '•' que el harness no sabia parsear
      // (findings=0 + exit!=0 => se contaba como SCHEMA FAIL). Ahora se integra
      // al flujo normal (comparacion contra baseline).
      console.log(`  ${color}${sym}${RST} ${f.id}: ${GRY}${f.file}${RST} — ${f.detail}`);
    }
  }
  dump('error', RED);
  dump('warning', YEL);
  dump('info', CYAN);

  // Output JSON
  if (extra) {
    try {
      fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
      const out = {
        _meta: {
          schema_version: '1.0.0',
          generated_at: new Date().toISOString(),
          contract_version: contract?.version || 'unknown'
        },
        modulos: extra.modulos,
        features: extra.features,
        prefijos_prohibidos: ['/storage/', '/projects/', '/data/']
      };
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2));
      console.log(`\n${GRY}Output: ${path.relative(REPO_ROOT, OUTPUT_PATH)}${RST}`);
    } catch (e) {
      console.log(`${YEL}Output write failed: ${e.message}${RST}`);
    }
  }

  console.log(`\nTotal: ${totalErr} error, ${totalWarn} warning, ${totalInfo} info`);
  return totalErr === 0 ? 0 : 1;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const checkSystem = args.includes('--check-system');
  process.exit(run({ checkSystem }));
}

module.exports = { run };

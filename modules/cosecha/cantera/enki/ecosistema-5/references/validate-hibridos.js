#!/usr/bin/env node
/**
 * validate-hibridos.js — GATE del ecosistema-5
 *
 * Verifica que toda pieza cumple las leyes del ecosistema antes de desplegar.
 *
 * Uso:
 *   node validate-hibridos.js              -> verificar todo
 *   node validate-hibridos.js --module X   -> solo un modulo
 *   node validate-hibridos.js --fix        -> auto-corregir lo posible
 *   node validate-hibridos.js --ci         -> exit code 1 si falla
 *
 * Leyes que enforcea:
 *   1. REPARTO:  modulo suscrito -> handler; blueprint tools solo bus.*
 *   2. ANTICOLISION: subscribes XOR eventos_que_escucho
 *   3. PERSISTENCIA: solo custodios escriben fs
 *   4. CONTRATO:   schema con description en cada campo
 *   5. PERSPECTIVA-C: tools:[] + reflejo hidrata/persiste
 *   6. EMISION:    toda operacion que guarda emite evento
 */

const fs = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────────────────────────────
const ROOT = process.cwd();
const VIOLATIONS = [];
const FIXES = [];
const args = process.argv.slice(2);
const ONLY_MODULE = parseArg('--module');
const MODE_FIX = args.includes('--fix');
const MODE_CI = args.includes('--ci');

// ── Colores ─────────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

// ── Utilidades ──────────────────────────────────────────────────────────────
function parseArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

function glob(pattern) {
  const { execSync } = require('child_process');
  try {
    return execSync(`find ${ROOT}/modules -name '${pattern}' -not -path '*/node_modules/*'`, {
      encoding: 'utf-8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function readJSON(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch {
    return null;
  }
}

function readFile(filepath) {
  try {
    return fs.readFileSync(filepath, 'utf-8');
  } catch {
    return null;
  }
}

function violation(code, message, filepath) {
  VIOLATIONS.push({ code, message, filepath });
  const label = filepath ? ` ${C.dim}(${path.relative(ROOT, filepath)})${C.reset}` : '';
  console.log(`  ${C.red}[${code}]${C.reset} ${message}${label}`);
}

function pass(message) {
  console.log(`  ${C.green}[OK]${C.reset} ${message}`);
}

function fix(code, message, fn) {
  FIXES.push({ code, message, fn });
}

// ── Ley 1: REPARTO ─────────────────────────────────────────────────────────
function checkReparto() {
  console.log(`\n${C.bold}[1/6] REPARTO${C.reset}`);

  const manifests = glob('module.json');
  let checked = 0;

  for (const mf of manifests) {
    const moduleDir = path.dirname(mf);
    const manifest = readJSON(mf);
    if (!manifest) continue;

    // Saltar si no es modulo hibrido
    if (!manifest.subscribes && !manifest.blueprint_driven) continue;
    if (ONLY_MODULE && !mf.includes(ONLY_MODULE)) continue;

    checked++;

    // 1a. Todo modulo suscrito a <mod>.<op>.request tiene handler
    if (manifest.subscribes) {
      for (const event of manifest.subscribes) {
        if (!event.endsWith('.request')) continue;
        const indexFile = path.join(moduleDir, 'index.js');
        const indexContent = readFile(indexFile);
        if (!indexContent) {
          violation('REPARTO-001', `Sin index.js para evento ${event}`, indexFile);
          continue;
        }
        // Busca on<Op>Request o _atender
        const opName = event.split('.').slice(1, -1).join('');
        const handlerPattern = new RegExp(`on${opName}Request|_atender.*['"]${opName}['"]`, 'i');
        if (!handlerPattern.test(indexContent)) {
          violation('REPARTO-002', `Evento ${event} no tiene handler on${opName}Request`, indexFile);
          if (MODE_FIX) {
            fix('REPARTO-002', `Añadir handler para ${event}`, () => {
              // Solo reportamos, la reparacion es manual
            });
          }
        } else {
          pass(`${event} -> handler presente`);
        }
      }
    }

    // 1b. Blueprint tools solo bus.* y cajon.*
    if (manifest.blueprint_driven) {
      const bpFile = manifest.blueprint_path
        ? path.resolve(moduleDir, manifest.blueprint_path)
        : path.join(moduleDir, `${path.basename(moduleDir)}.blueprint.json`);

      const blueprint = readJSON(bpFile);
      if (blueprint && blueprint.operaciones) {
        for (const [opName, opDef] of Object.entries(blueprint.operaciones)) {
          if (opDef.tools) {
            const forbidden = opDef.tools.filter(
              (t) => !t.startsWith('bus.') && !t.startsWith('cajon.')
            );
            if (forbidden.length > 0) {
              violation(
                'REPARTO-003',
                `Operacion ${opName} usa tools no permitidas: ${forbidden.join(', ')}. Solo bus.* y cajon.*`,
                bpFile
              );
            } else {
              pass(`${opName}: tools permitidas`);
            }
          }
        }
      }
    }
  }

  if (checked === 0) {
    console.log(`  ${C.yellow}[SKIP]${C.reset} No se encontraron modulos para verificar`);
  }
}

// ── Ley 2: ANTI-COLISION ────────────────────────────────────────────────────
function checkAntiColision() {
  console.log(`\n${C.bold}[2/6] ANTI-COLISION${C.reset}`);

  const manifests = glob('module.json');
  let checked = 0;

  for (const mf of manifests) {
    const manifest = readJSON(mf);
    if (!manifest) continue;
    if (!manifest.subscribes && !manifest.blueprint_driven) continue;
    if (ONLY_MODULE && !mf.includes(ONLY_MODULE)) continue;

    checked++;
    const moduleDir = path.dirname(mf);

    // Leer blueprint para eventos_que_escucho
    const bpFile = manifest.blueprint_path
      ? path.resolve(moduleDir, manifest.blueprint_path)
      : path.join(moduleDir, `${path.basename(moduleDir)}.blueprint.json`);

    const blueprint = readJSON(bpFile);
    const escuchados = (blueprint && blueprint.eventos_que_escucho) || [];

    // Colision: el mismo evento en subscribes Y en eventos_que_escucho
    if (manifest.subscribes && escuchados.length > 0) {
      for (const evt of escuchados) {
        if (manifest.subscribes.includes(evt)) {
          violation(
            'ANTICOLISION-001',
            `Evento "${evt}" esta en manifest.subscribes Y en blueprint.eventos_que_escucho. Un cajon que delega NO anade aqui.`,
            mf
          );
        }
      }
    }

    if (manifest.subscribes && escuchados.length === 0) {
      pass(`${path.basename(moduleDir)}: sin colisiones (sin escuchados)`);
    }
  }

  if (checked === 0) {
    console.log(`  ${C.yellow}[SKIP]${C.reset} No se encontraron modulos`);
  }
}

// ── Ley 3: PERSISTENCIA DELEGADA ────────────────────────────────────────────
function checkPersistencia() {
  console.log(`\n${C.bold}[3/6] PERSISTENCIA DELEGADA${C.reset}`);

  const manifests = glob('module.json');
  let checked = 0;

  for (const mf of manifests) {
    const manifest = readJSON(mf);
    if (!manifest) continue;
    if (ONLY_MODULE && !mf.includes(ONLY_MODULE)) continue;

    const moduleDir = path.dirname(mf);
    const indexFile = path.join(moduleDir, 'index.js');
    const indexContent = readFile(indexFile);
    if (!indexContent) continue;

    checked++;

    // Buscar fs.write directos en modulos blueprint (NO custodios)
    if (manifest.blueprint_driven) {
      const fsWrites = indexContent.match(/fs\.write|fs\.writeFile|fs\.writeFileSync|_rpc\(.*fs\.write/g);
      if (fsWrites && fsWrites.length > 0) {
        violation(
          'PERSISTENCIA-001',
          `Modulo blueprint (${path.basename(moduleDir)}) escribe fs directamente. Debe delegar al reflejo.`,
          indexFile
        );
      } else {
        pass(`${path.basename(moduleDir)}: sin fs.write directo`);
      }
    }
  }

  if (checked === 0) {
    console.log(`  ${C.yellow}[SKIP]${C.reset}`);
  }
}

// ── Ley 4: CONTRATO ─────────────────────────────────────────────────────────
function checkContrato() {
  console.log(`\n${C.bold}[4/6] CONTRATO${C.reset}`);

  // Buscar schemas JSON
  const schemas = glob('*.schema.json');
  let checked = 0;

  for (const schemaFile of schemas) {
    const schema = readJSON(schemaFile);
    if (!schema) continue;
    if (ONLY_MODULE && !schemaFile.includes(ONLY_MODULE)) continue;

    checked++;

    // Verificar que cada propiedad tiene description
    const checkDescriptions = (obj, path_str = '') => {
      if (!obj || typeof obj !== 'object') return;

      if (obj.type === 'object' && obj.properties) {
        for (const [key, prop] of Object.entries(obj.properties)) {
          const propPath = path_str ? `${path_str}.${key}` : key;
          if (!prop.description && !prop.enum) {
            violation(
              'CONTRATO-001',
              `Campo "${propPath}" sin description. Description instruye al LLM.`,
              schemaFile
            );
          }
          if (prop.type === 'object' || prop.properties) {
            checkDescriptions(prop, propPath);
          }
          if (prop.type === 'array' && prop.items) {
            checkDescriptions(prop.items, `${propPath}[]`);
          }
        }
      }

      // if/then
      if (obj.if) checkDescriptions(obj.if, `${path_str}.if`);
      if (obj.then) checkDescriptions(obj.then, `${path_str}.then`);
      if (obj.else) checkDescriptions(obj.else, `${path_str}.else`);
    };

    checkDescriptions(schema);
  }

  if (checked === 0) {
    console.log(`  ${C.yellow}[SKIP]${C.reset} No se encontraron schemas`);
  }
}

// ── Ley 5: PERSPECTIVA-C ────────────────────────────────────────────────────
function checkPerspectivaC() {
  console.log(`\n${C.bold}[5/6] PERSPECTIVA-C${C.reset}`);

  const manifests = glob('module.json');
  let checked = 0;

  for (const mf of manifests) {
    const manifest = readJSON(mf);
    if (!manifest) continue;
    if (ONLY_MODULE && !mf.includes(ONLY_MODULE)) continue;

    const moduleDir = path.dirname(mf);

    // Buscar agents/ directorio
    const agentsDir = path.join(moduleDir, 'agents');
    if (!fs.existsSync(agentsDir)) continue;

    const agentFiles = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.json'));

    for (const agentFile of agentFiles) {
      checked++;
      const agentPath = path.join(agentsDir, agentFile);
      const agent = readJSON(agentPath);
      if (!agent) continue;

      // 5a. tools debe ser []
      if (agent.tools && agent.tools.length > 0) {
        violation(
          'PERSPECTIVAC-001',
          `Agente "${agentFile}" tiene tools (${agent.tools.length}). Un perspectiva-c debe tener tools:[].`,
          agentPath
        );
      } else {
        pass(`${agentFile}: tools:[]`);
      }

      // 5b. Debe haber un reflejo que hidrata y persiste
      const indexFile = path.join(moduleDir, 'index.js');
      const indexContent = readFile(indexFile);
      const agentName = agentFile.replace('.json', '');
      if (indexContent) {
        const hasHydrate = indexContent.includes(`${agentName}`) || indexContent.includes('agent.execute');
        if (!hasHydrate) {
          violation(
            'PERSPECTIVAC-002',
            `Agente "${agentFile}" sin reflejo que lo invoque en index.js. El reflejo debe HIDRATAR y PERSISTIR.`,
            indexFile
          );
        }
      }
    }
  }

  if (checked === 0) {
    console.log(`  ${C.yellow}[SKIP]${C.reset} No se encontraron agentes perspectiva-c`);
  }
}

// ── Ley 6: EMISION ──────────────────────────────────────────────────────────
function checkEmision() {
  console.log(`\n${C.bold}[6/6] EMISION${C.reset}`);

  const manifests = glob('module.json');
  let checked = 0;

  for (const mf of manifests) {
    const manifest = readJSON(mf);
    if (!manifest) continue;
    if (ONLY_MODULE && !mf.includes(ONLY_MODULE)) continue;

    const moduleDir = path.dirname(mf);
    const indexFile = path.join(moduleDir, 'index.js');
    const indexContent = readFile(indexFile);
    if (!indexContent) continue;

    checked++;

    // Buscar patrones de guardado sin emision
    const hasPersist = /\.save\.request|\.write\.request|fs\.write|_editarJson|_persistir/.test(
      indexContent
    );
    const hasEmit = /eventBus\.publish|publish\(|\.emit\(/.test(indexContent);

    if (hasPersist && !hasEmit) {
      violation(
        'EMISION-001',
        `Modulo "${path.basename(moduleDir)}" persiste pero no emite evento de dominio. Toda persistencia debe emitir.`,
        indexFile
      );
    } else if (hasPersist && hasEmit) {
      pass(`${path.basename(moduleDir)}: persiste y emite`);
    } else {
      pass(`${path.basename(moduleDir)}: sin persistencia`);
    }
  }

  if (checked === 0) {
    console.log(`  ${C.yellow}[SKIP]${C.reset}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
function main() {
  console.log(`${C.bold}\n╔══════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}║   ecosistema-5 — validate-hibridos.js       ║${C.reset}`);
  console.log(`${C.bold}║   GATE de validacion                        ║${C.reset}`);
  console.log(`${C.bold}╚══════════════════════════════════════════════╝${C.reset}\n`);

  const start = Date.now();

  checkReparto();
  checkAntiColision();
  checkPersistencia();
  checkContrato();
  checkPerspectivaC();
  checkEmision();

  const elapsed = Date.now() - start;

  // Resumen
  console.log(`\n${C.bold}${'─'.repeat(50)}${C.reset}`);

  if (VIOLATIONS.length === 0) {
    console.log(`\n  ${C.green}${C.bold}PASS${C.reset} — ecosistema-5: todas las leyes cumplidas${C.reset}`);
    console.log(`  ${C.dim}(${elapsed}ms)${C.reset}\n`);
    if (MODE_CI) process.exit(0);
  } else {
    console.log(
      `\n  ${C.red}${C.bold}FAIL${C.reset} — ${VIOLATIONS.length} violacion(es) encontradas${C.reset}`
    );
    console.log(`  ${C.dim}(${elapsed}ms)${C.reset}\n`);

    if (MODE_FIX && FIXES.length > 0) {
      console.log(`  ${C.yellow}${FIXES.length} correccion(es) disponibles (revisar manualmente)${C.reset}\n`);
    }

    if (MODE_CI) process.exit(1);
  }
}

main();

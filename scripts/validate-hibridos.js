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
    // 2enki: subscribes = [{event, handler, description}] (objetos). Compat con strings sueltos.
    if (manifest.subscribes) {
      for (const sub of manifest.subscribes) {
        const event = typeof sub === 'string' ? sub : (sub && sub.event);
        const handler = typeof sub === 'string' ? null : (sub && sub.handler);
        if (!event || !event.endsWith('.request')) continue;
        const indexFile = path.join(moduleDir, 'index.js');
        const indexContent = readFile(indexFile);
        if (!indexContent) {
          violation('REPARTO-001', `Sin index.js para evento ${event}`, indexFile);
          continue;
        }
        // el handler DECLARADO (2enki) debe existir en index.js; si no se declara, se deriva on<Op>Request
        const opName = event.split('.').slice(1, -1).join('');
        const ok = handler
          ? new RegExp(`(^|[^\\w])${handler}\\b`).test(indexContent)
          : new RegExp(`on${opName}Request|_atender.*['"]${opName}['"]`, 'i').test(indexContent);
        if (!ok) {
          violation('REPARTO-002', `Evento ${event} sin handler ${handler || 'on' + opName + 'Request'} en index.js`, indexFile);
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
    // 2enki: subscribes = objetos {event,...}; normalizamos a nombres.
    const subEvents = (manifest.subscribes || []).map((s) => (typeof s === 'string' ? s : s && s.event)).filter(Boolean);
    if (subEvents.length > 0 && escuchados.length > 0) {
      for (const evt of escuchados) {
        if (subEvents.includes(evt)) {
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

    // Buscar fs.write DIRECTOS de node en modulos blueprint (NO custodios).
    // La delegacion por bus (_rpc('fs.write.request')) es EXACTAMENTE lo que la ley
    // pide (delegar al custodio filesystem) — NO es escritura directa, no es violacion.
    if (manifest.blueprint_driven) {
      const fsWrites = indexContent.match(/\bfs\.(promises\.)?writeFile(Sync)?\s*\(/g);
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

  // Un schema es CONTRATO de VALIDAR solo si vive en un modulo blueprint_driven
  // (la fase VALIDAR solo existe en blueprints). Los schemas de SALIDA/estado de
  // modulos deterministas (p.ej. system-inspector/status) no instruyen a ningun LLM.
  const esContratoValidar = (schemaFile) => {
    let dir = path.dirname(schemaFile);
    for (let i = 0; i < 6; i++) {
      const mf = path.join(dir, 'module.json');
      if (fs.existsSync(mf)) {
        const m = readJSON(mf);
        return !!(m && m.blueprint_driven);
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return false;
  };

  // Un campo INSTRUYE/CONSTRINE (necesita description) si acota la forma: enum, rangos,
  // patron, formato, o es un objeto/array con forma propia. Un free-text de paso
  // ({type:string} o array de strings sin mas) es passthrough y no instruye a nadie.
  const instruye = (prop) => {
    if (!prop || typeof prop !== 'object') return false;
    const acotadores = ['enum', 'const', 'minLength', 'maxLength', 'minimum', 'maximum',
      'exclusiveMinimum', 'exclusiveMaximum', 'pattern', 'format'];
    if (acotadores.some((k) => k in prop)) return true;
    if (prop.properties || prop.required) return true;
    if (prop.type === 'array' && prop.items &&
        (prop.items.properties || prop.items.required)) return true;
    return false;
  };

  for (const schemaFile of schemas) {
    const schema = readJSON(schemaFile);
    if (!schema) continue;
    if (ONLY_MODULE && !schemaFile.includes(ONLY_MODULE)) continue;
    if (!esContratoValidar(schemaFile)) continue;

    checked++;

    // Verificar que cada campo QUE CONSTRINE tiene description
    const checkDescriptions = (obj, path_str = '') => {
      if (!obj || typeof obj !== 'object') return;

      if (obj.type === 'object' && obj.properties) {
        for (const [key, prop] of Object.entries(obj.properties)) {
          const propPath = path_str ? `${path_str}.${key}` : key;
          if (instruye(prop) && !prop.description && !prop.enum) {
            violation(
              'CONTRATO-001',
              `Campo "${propPath}" acota la forma pero no tiene description. Description instruye al LLM.`,
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

  // La ley aplica SOLO a agentes DECLARADOS perspectiva-c. Un agente normal (voltagent,
  // domain-agent con herramientas) DEBE tener tools — no es un perspectiva-c. La marca:
  // metadata.perspectiva_c === true, metadata.type === 'perspectiva-c', o la propia
  // description se declara "perspectiva C" (funcion pura sin herramientas).
  const esPerspectivaC = (agent) => {
    const m = agent.metadata || {};
    if (m.perspectiva_c === true || m.type === 'perspectiva-c') return true;
    const texto = `${agent.description || ''} ${agent.systemPrompt || agent.system_prompt || ''}`;
    return /perspectiva[\s_-]?c\b/i.test(texto);
  };

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
      const agentPath = path.join(agentsDir, agentFile);
      const agent = readJSON(agentPath);
      if (!agent) continue;
      if (!esPerspectivaC(agent)) continue; // agente normal — la ley no le aplica

      checked++;

      // 5a. Un perspectiva-c DEBE tener tools:[] (su fuerza es no poder mentir ni cargar/guardar)
      if (agent.tools && agent.tools.length > 0) {
        violation(
          'PERSPECTIVAC-001',
          `Agente "${agentFile}" se declara perspectiva-c pero tiene tools (${agent.tools.length}). Debe tener tools:[].`,
          agentPath
        );
      } else {
        pass(`${agentFile}: perspectiva-c con tools:[]`);
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

    // GUARDA = persistencia LOCAL (el modulo es el custodio del dato). fs.write directo,
    // fs.write.request (el filesystem como brazo de disco del custodio), o helpers propios.
    // NO cuenta la delegacion de dominio (<otro>.save.request / <otro>.write.request): ahi
    // el que emite es el custodio destino, no el que delega (p.ej. menu-generator -> carta).
    const hasPersist = /fs\.write|_editarJson|_persistir/.test(indexContent);
    // EMITE: cubre optional-chaining (eventBus?.publish?.(), .emit?.()) y el idioma nativo
    // castellano (publicar()) ademas de publish/emit directos.
    const hasEmit = /(publish|publicar|emit|emitir)\w*\s*(\?\.)?\s*\(/.test(indexContent);

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

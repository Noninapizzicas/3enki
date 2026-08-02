#!/usr/bin/env node
/**
 * clasificador-forma.js — agente-perspectiva-c aplicado al diseccionador
 *
 * Ciclo (patrón perspectiva-C):
 *   1. REFLEJO (lector):   module.json + index.js → resumen estructurado
 *   2. AGENTE (tools:[]):  resumen + tabla de formas → clasificación
 *   3. REFLEJO (escritor): escribe forma_diseccionador en module.json
 *
 * El agente es REFLEJO PURO en v1 (reglas deterministas).
 * Los casos ambiguos se marcan para resolución LLM (futuro).
 *
 * Uso:
 *   node clasificador-forma.js                          # todo modules/
 *   node clasificador-forma.js --module prisma          # solo prisma/*
 *   node clasificador-forma.js --module conversor       # uno
 *   node clasificador-forma.js --dry-run                # no escribe
 *   node clasificador-forma.js --verbose                # muestra resumen
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');  // 3enki/
const MODULES = path.join(ROOT, 'modules');
const args = process.argv.slice(2);
const ONLY_MODULE = parseArg('--module');
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

// ── Formas del diseccionador ──────────────────────────────────────────────
const FORMAS = {
  REFLEJO:       'reflejo',
  MICRO_AGENTE:  'micro-agente',
  CUSTODIO:      'custodio',
  CONVERSOR:     'conversor',
  PUENTE:        'puente',
};

// Invariantes por forma (tabla de verdad del diseccionador) — ordenadas por PRIORIDAD
const INVARIANTES = [
  {
    forma: FORMAS.CONVERSOR,
    desc: 'Sin estado, sin red, sin persistencia. Solo transforma unidades.',
    prioridad: 1,  // más alta — si el nombre y los hechos cuadran
    checks: (m) =>
      m.nombre_contiene.conversor &&
      !m.tiene_blueprint &&
      !m.tiene_agents &&
      !m.tiene_fs_write &&
      !m.tiene_llm_calls &&
      !m.tiene_store_propio,
  },
  {
    forma: FORMAS.CUSTODIO,
    desc: 'Único escritor de un store. Dueño de una ruta de datos.',
    prioridad: 2,
    checks: (m) =>
      m.tiene_store_propio &&
      (m.tiene_fs_write || m.eventos_escucha_rpc >= 5) &&
      !m.tiene_blueprint &&
      !m.tiene_agents,
  },
  {
    forma: FORMAS.MICRO_AGENTE,
    desc: 'Reflejo hidrata + LLM transforma + reflejo persiste. tools:[].',
    prioridad: 3,
    checks: (m) =>
      (m.tiene_blueprint || m.tiene_llm_calls) &&
      !m.tiene_fs_write_directo,
  },
  {
    forma: FORMAS.PUENTE,
    desc: 'Sin store propio. Solo escucha eventos ajenos y delega.',
    prioridad: 4,
    checks: (m) =>
      (m.nombre_contiene.puente || m.eventos_escucha_total > 0) &&
      !m.tiene_blueprint &&
      !m.tiene_fs_write &&
      !m.tiene_llm_calls &&
      !m.tiene_store_propio,
  },
  {
    forma: FORMAS.REFLEJO,
    desc: 'Cálculo determinista. Sin LLM, sin agents, sin blueprint.',
    prioridad: 5,
    checks: (m) =>
      !m.tiene_blueprint &&
      !m.tiene_agents &&
      !m.tiene_llm_calls &&
      !m.tiene_fs_write_directo,
  },
];

// ── Utilidades ────────────────────────────────────────────────────────────
function parseArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

function readJSON(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch { return null; }
}

function readFile(filepath) {
  try { return fs.readFileSync(filepath, 'utf-8'); } catch { return null; }
}

function glob(pattern, base) {
  const { execSync } = require('child_process');
  try {
    return execSync(`find ${base || MODULES} -name '${pattern}' -not -path '*/node_modules/*'`, { encoding: 'utf-8' })
      .trim().split('\n').filter(Boolean);
  } catch { return []; }
}

const C = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m',
  bold: '\x1b[1m', dim: '\x1b[2m',
};

// ── REFLEJO 1: LECTOR ────────────────────────────────────────────────────
function resumirModulo(mfPath) {
  const dir = path.dirname(mfPath);
  const manifest = readJSON(mfPath);
  if (!manifest) return null;

  const indexFile = path.join(dir, 'index.js');
  const indexContent = readFile(indexFile);

  const blueprintFile = manifest.blueprint_path
    ? path.resolve(dir, manifest.blueprint_path)
    : path.join(dir, `${manifest.name?.split('/').pop() || path.basename(dir)}.blueprint.json`);
  const blueprint = readJSON(blueprintFile);

  const agentsDir = path.join(dir, 'agents');
  const tieneAgents = fs.existsSync(agentsDir);
  const agentFiles = tieneAgents
    ? fs.readdirSync(agentsDir).filter(f => f.endsWith('.json'))
    : [];

  const subscribes = manifest.subscribes || [];
  const publishes = manifest.publishes || [];

  // Detectar patrones en index.js
  const idx = indexContent || '';
  const tieneFsWrite = /fs\.(promises\.)?writeFileSync?\s*\(/.test(idx);
  const tieneFsWriteDirecto = tieneFsWrite && !/_rpc\(|bus\.|eventBus/.test(idx);
  const tieneLlmCalls = /llm\.complete|_rpc\(.*llm/.test(idx);
  const tieneRpcSalientes = /_rpc\(/.test(idx);
  const eventosEscucha = subscribes.filter(s => {
    const evt = typeof s === 'string' ? s : (s && s.event);
    return evt && evt.endsWith('.request');
  }).length;

  // Detectar store propio del módulo (CUSTODIO)
  const tieneStorePropio = !!(
    manifest.config?.persistence?.data_path ||
    manifest.config?.persistence?.scope === 'project' ||
    manifest.config?.persistence?.pattern
  );

  // Contar TODOS los eventos escuchados (no solo .request — puentes escuchan eventos de dominio)
  const totalEventosEscucha = subscribes.length;

  // Nombre del módulo para heurísticas de forma
  const moduleName = manifest.name || path.basename(dir);

  return {
    name: moduleName,
    dir: path.relative(ROOT, dir),
    moduleJson: path.relative(ROOT, mfPath),
    tiene_blueprint: manifest.blueprint_driven === true || !!blueprint,
    tiene_agents: tieneAgents,
    agentes: agentFiles,
    tiene_fs_write: tieneFsWrite,
    tiene_fs_write_directo: tieneFsWriteDirecto,
    tiene_llm_calls: tieneLlmCalls,
    tiene_rpc_salientes: tieneRpcSalientes,
    tiene_store_propio: tieneStorePropio,
    eventos_escucha_rpc: eventosEscucha,
    eventos_escucha_total: totalEventosEscucha,
    eventos_propios: publishes.length,
    blueprint_driven: manifest.blueprint_driven === true,
    cajones_enabled: manifest.cajones_enabled === true,
    nombre_contiene: {
      conversor: moduleName.includes('conversor'),
      puente: moduleName.includes('puente'),
      manager: moduleName.includes('manager'),
      coste: moduleName.includes('coste'),
    },
    forma_actual: manifest.forma_diseccionador || null,
  };
}

// ── AGENTE 2: CLASIFICADOR (reflejo puro v1) ─────────────────────────────
function clasificar(resumen) {
  const m = resumen;
  const trazas = [];

  // Recorrer invariantes por prioridad (array ordenado de más específico a menos)
  for (const inv of INVARIANTES) {
    const ok = inv.checks(m);
    trazas.push(`  ${ok ? '✓' : '✗'} ${inv.forma}: ${inv.desc}`);
    if (ok) {
      return { forma: inv.forma, confianza: 'alta', traza: trazas };
    }
  }

  return { forma: null, confianza: 'baja', traza: trazas };
}

// ── REFLEJO 3: ESCRITOR ──────────────────────────────────────────────────
function escribirForma(mfPath, forma, dryRun) {
  const manifest = readJSON(mfPath);
  if (!manifest) return { ok: false, error: 'no_parse' };

  const actual = manifest.forma_diseccionador;
  if (actual === forma) return { ok: true, sin_cambio: true, anterior: actual };

  if (dryRun) return { ok: true, dry_run: true, anterior: actual, nuevo: forma };

  manifest.forma_diseccionador = forma;
  if (!manifest._v_diseccion) {
    manifest._v_diseccion = '0.1.0';
  }
  fs.writeFileSync(mfPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  return { ok: true, anterior: actual, nuevo: forma };
}

// ── Main ──────────────────────────────────────────────────────────────────
function main() {
  console.log(`${C.bold}\n╔══════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}║   clasificador-forma.js                     ║${C.reset}`);
  console.log(`${C.bold}║   agente-perspectiva-c × diseccionador      ║${C.reset}`);
  console.log(`${C.bold}╚══════════════════════════════════════════════╝${C.reset}`);
  if (DRY_RUN) console.log(`  ${C.yellow}⚠  MODO DRY-RUN — no se escribe nada${C.reset}\n`);

  const manifests = glob('module.json');
  let total = 0, clasificados = 0, sinCambio = 0, escritos = 0, errores = 0;
  const stats = {};

  for (const mf of manifests) {
    const rel = path.relative(MODULES, mf);
    if (ONLY_MODULE && !rel.includes(ONLY_MODULE)) continue;

    total++;
    const resumen = resumirModulo(mf);
    if (!resumen) { errores++; continue; }

    const { forma, confianza, traza, empate } = clasificar(resumen);

    if (VERBOSE) {
      console.log(`\n${C.cyan}── ${resumen.name} ──${C.reset}`);
      console.log(`  dir: ${resumen.dir}`);
      console.log(`  blueprint: ${resumen.tiene_blueprint} · agents: ${resumen.tiene_agents} · llm: ${resumen.tiene_llm_calls}`);
      console.log(`  fs_write: ${resumen.tiene_fs_write} (directo: ${resumen.tiene_fs_write_directo})`);
      console.log(`  store: ${resumen.tiene_store_propio} · escucha: ${resumen.eventos_escucha_total} (rpc: ${resumen.eventos_escucha_rpc})`);
      console.log(`  publica: ${resumen.eventos_propios} · nombre: ${resumen.name}`);
      console.log(`  forma_actual: ${resumen.forma_actual || '—'}`);
      console.log(traza.join('\n'));
    }

    if (!forma) {
      if (VERBOSE) console.log(`  ${C.red}→ NO CLASIFICABLE${C.reset}`);
      stats[resumen.name] = { forma: null, confianza };
      continue;
    }

    clasificados++;
    stats[resumen.name] = { forma, confianza };
    const resultado = escribirForma(mf, forma, DRY_RUN);

    if (resultado.sin_cambio) {
      sinCambio++;
      if (VERBOSE) console.log(`  ${C.dim}→ ${forma} (sin cambio)${C.reset}`);
    } else if (resultado.dry_run) {
      if (VERBOSE) console.log(`  ${C.yellow}→ [DRY] ${resultado.anterior || '—'} → ${forma}${C.reset}`);
      escritos++;
    } else {
      escritos++;
      if (VERBOSE) console.log(`  ${C.green}→ ${resultado.anterior || '—'} → ${forma}${C.reset}`);
    }
  }

  // Resumen
  console.log(`\n${C.bold}${'─'.repeat(50)}${C.reset}`);
  console.log(`\n  ${C.bold}Total módulos:${C.reset} ${total}`);
  console.log(`  ${C.bold}Clasificados:${C.reset}  ${clasificados}`);
  console.log(`  ${C.bold}Sin cambio:${C.reset}   ${sinCambio}`);
  console.log(`  ${C.bold}Escritos:${C.reset}     ${escritos}${DRY_RUN ? ' (DRY)' : ''}`);
  console.log(`  ${C.bold}Errores:${C.reset}      ${errores}`);

  // Distribución de formas
  const dist = {};
  for (const [name, s] of Object.entries(stats)) {
    if (s.forma) dist[s.forma] = (dist[s.forma] || 0) + 1;
  }
  if (Object.keys(dist).length > 0) {
    console.log(`\n  ${C.bold}Distribución:${C.reset}`);
    for (const [forma, count] of Object.entries(dist).sort()) {
      console.log(`    ${forma}: ${count}`);
    }
  }

  console.log();
}

main();

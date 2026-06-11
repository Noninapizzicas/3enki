#!/usr/bin/env node
/**
 * validate-hibridos — gate del Patrón Módulo Híbrido.
 *
 * Un módulo HÍBRIDO = blueprint_driven:true + index.js (reflejo JS). Verifica
 * los invariantes del patrón para que la dualidad no se rompa al replicarla:
 *
 *   1. ANTI-COLISIÓN: un evento NO puede estar a la vez en module.json.subscribes
 *      (lo sirve el reflejo) y en el blueprint.eventos_que_escucho (lo serviría
 *      un turno LLM sintético). Si lo está, responderían los dos → carrera.
 *   2. HANDLERS EXISTEN: cada subscribes[].handler debe ser un método de la clase
 *      del reflejo (que index.js exporta).
 *   3. (info) reflejo extiende ModuloHibridoReflejo — recomendado, no obligatorio.
 *
 * Salida: lista cada híbrido con PASS/FAIL. Exit 1 si algún invariante falla.
 * Pensado para validate:ci. Uso: node scripts/validate-hibridos.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MODULES_DIR = path.join(ROOT, 'modules');

function findModuleJsons(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findModuleJsons(full, out);
    else if (entry.name === 'module.json') out.push(full);
  }
  return out;
}

function eventsFromSubscribes(manifest) {
  return (manifest.subscribes || [])
    .map(s => (typeof s === 'string' ? s : s && s.event))
    .filter(Boolean);
}

function eventsFromBlueprint(bp) {
  return (bp && Array.isArray(bp.eventos_que_escucho) ? bp.eventos_que_escucho : [])
    .map(e => (typeof e === 'string' ? e : e && e.evento))
    .filter(Boolean);
}

function methodsOf(instance) {
  const out = new Set();
  let proto = Object.getPrototypeOf(instance);
  while (proto && proto !== Object.prototype) {
    for (const k of Object.getOwnPropertyNames(proto)) {
      if (typeof instance[k] === 'function') out.add(k);
    }
    proto = Object.getPrototypeOf(proto);
  }
  return out;
}

let failures = 0;
let hybridCount = 0;

for (const moduleJsonPath of findModuleJsons(MODULES_DIR)) {
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf-8')); } catch (_) { continue; }
  if (manifest.blueprint_driven !== true) continue;

  const modDir = path.dirname(moduleJsonPath);
  const indexPath = path.join(modDir, 'index.js');
  if (!fs.existsSync(indexPath)) continue;   // blueprint puro, no es híbrido

  hybridCount++;
  const name = manifest.name || path.basename(modDir);
  const problems = [];

  // — 1. anti-colisión —
  const subEvents = new Set(eventsFromSubscribes(manifest));
  let bp = null;
  if (manifest.blueprint_path) {
    try { bp = JSON.parse(fs.readFileSync(path.join(modDir, manifest.blueprint_path), 'utf-8')); } catch (_) {}
  }
  const bpEvents = new Set(eventsFromBlueprint(bp));
  for (const ev of subEvents) {
    if (bpEvents.has(ev)) problems.push(`COLISIÓN: '${ev}' está en subscribes (reflejo) Y en blueprint.eventos_que_escucho (turno LLM). Quita uno.`);
  }

  // — 2. handlers existen —
  let instance = null;
  try {
    const Klass = require(indexPath);
    instance = new Klass();
  } catch (err) {
    problems.push(`no se pudo instanciar index.js: ${err.message}`);
  }
  if (instance) {
    const methods = methodsOf(instance);
    for (const s of (manifest.subscribes || [])) {
      const h = typeof s === 'object' ? s.handler : null;
      if (h && !methods.has(h)) problems.push(`handler ausente: subscribes declara '${h}' pero la clase no lo tiene.`);
    }
    // — 3. (info) extiende la base —
    if (!methods.has('_atender') || !methods.has('_rpc')) {
      console.log(`  · ${name}: (info) no extiende ModuloHibridoReflejo — recomendado para no duplicar fontanería.`);
    }
  }

  if (problems.length === 0) {
    console.log(`✓ ${name} (híbrido) — OK`);
  } else {
    failures++;
    console.log(`✗ ${name} (híbrido) — ${problems.length} problema(s):`);
    for (const p of problems) console.log(`    - ${p}`);
  }
}

console.log(`\nhíbridos: ${hybridCount} · fallos: ${failures}`);
process.exit(failures > 0 ? 1 : 0);

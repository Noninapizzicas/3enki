#!/usr/bin/env node
/**
 * inventario.js — Genera el roadmap de migracion de modulos.
 *
 * Lee:
 *  - modules/<...>/module.json (todos los modulos del repo)
 *  - drift-baseline.json (signatures por validator)
 *  - arquitectura/auditoria/_outputs/modulo-completo/<slug>.json (auditorias por modulo)
 *
 * Genera:
 *  - arquitectura/migracion/_outputs/modulos-roadmap.json
 *
 * Cada modulo se clasifica en una de 4 capas (core/infra/dominio/tooling)
 * y se ordena por dependency depth (los mas profundos sin dependencies
 * uphill primero — se reescriben antes para no contaminar la cascada).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT      = path.resolve(__dirname, '../../..');
const MODULES_DIR    = path.join(REPO_ROOT, 'modules');
const BASELINE_PATH  = path.join(REPO_ROOT, 'drift-baseline.json');
const AUDITS_DIR     = path.join(REPO_ROOT, 'arquitectura/auditoria/_outputs/modulo-completo');
const OUT_PATH       = path.join(REPO_ROOT, 'arquitectura/migracion/_outputs/modulos-roadmap.json');

// Clasificacion por nombre/path. Cada modulo se asigna a UNA capa.
const CORE_SLUGS = new Set([
  'conversacion__chat-io',
  'conversacion__prompt-builder',
  'conversacion__ai-gateway',
  'conversacion__ai-agent-framework',
  'conversacion__memory-user-profile',
  'conversacion__memory-conversation-summary',
  'conversacion__memory-rag',
  'conversacion__agent-observer',
  'project-manager',
  'database-manager',
  'credential-manager',
  'channel-manager',
  'scheduler',
  'composition-manager',
  'plugin-manager',
  'gateway-manager',
  'http-gateway',
  'mqtt-broker',
  'broker-client'
]);

const INFRA_SLUGS = new Set([
  'telegram-service',
  'filesystem',
  'security-p2p',
  'certificate-authority',
  'system-inspector',
  'firmware-builder',
  'firmware-manager',
  'firmware-discovery',
  'firmware-flasher',
  'device-registry',
  'device-shadow',
  'device-health',
  'device-detector',
  'esp32-dev',
  'metricas',
  'observabilidad',
  'shell-kernel',
  'code-executor',
  'context-manager',
  'prompt-manager',
  'persistencia',
  'conversation-export',
  'pdf-viewer',
  'pdf-extractor',
  'data-store',
  'channel-web',
  'state-engine'
]);

const TOOLING_SLUGS = new Set([
  'admin-panel',
  'scratch-designer',
  'ui-designer',
  'ui-renderer',
  'design-gallery',
  'context-manager-ui',
  'system-prompt-editor',
  'app-shell',
  'icon-mapper',
  'preview-server',
  'web-server',
  'mqtt-monitor'
]);

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch (_) { return null; }
}

function discoverModules() {
  const acc = [];
  function walk(dir, slug = '') {
    if (!fs.existsSync(dir)) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    if (entries.some(e => e.isFile() && e.name === 'module.json')) {
      acc.push({ dir, slug });
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith('_') || e.name.startsWith('.') || e.name === 'node_modules') continue;
      walk(path.join(dir, e.name), slug ? `${slug}__${e.name}` : e.name);
    }
  }
  walk(MODULES_DIR);
  return acc;
}

function countLines(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  try {
    return fs.readFileSync(filePath, 'utf-8').split('\n').length;
  } catch (_) { return 0; }
}

function classify(slug) {
  if (CORE_SLUGS.has(slug)) return 'core';
  if (INFRA_SLUGS.has(slug)) return 'infra';
  if (TOOLING_SLUGS.has(slug)) return 'tooling';
  // Dominio = todo lo demas (pizzepos__*, facturas__*, recetas, llevadoo, etc.)
  return 'dominio';
}

function loadDriftBaseline() {
  const b = loadJson(BASELINE_PATH);
  if (!b || !Array.isArray(b.signatures)) return [];
  return b.signatures;
}

function countDriftsForModule(signatures, slug, dir) {
  // Heuristica: signatures son strings 'validator|drift_id|detail'.
  // El detail suele incluir slug o ruta del modulo. Buscamos coincidencias.
  const slugDots = slug.replace(/__/g, '/');
  const slugAlt = slug.replace(/__/g, '-');
  const relDir = path.relative(REPO_ROOT, dir);
  let count = 0;
  for (const sig of signatures) {
    if (typeof sig !== 'string') continue;
    if (sig.includes(slug) || sig.includes(slugDots) || sig.includes(slugAlt) || sig.includes(relDir)) count++;
  }
  return count;
}

function dependenciesUpstream(manifest) {
  // Modulos de los que este depende (declarados explicitamente).
  const deps = manifest.dependencies;
  if (!deps) return [];
  if (Array.isArray(deps)) return deps.filter(d => typeof d === 'string');
  if (deps.modules && Array.isArray(deps.modules)) return deps.modules.filter(d => typeof d === 'string');
  return [];
}

function declaredEvents(manifest) {
  const ev = manifest.events || manifest;
  const publishes = ev.publishes || [];
  const subscribes = ev.subscribes || [];
  const pubCount = Array.isArray(publishes) ? publishes.length : 0;
  const subCount = Array.isArray(subscribes) ? subscribes.length : 0;
  return { publishes: pubCount, subscribes: subCount };
}

function declaredTools(manifest) {
  const t = manifest.tools;
  if (!Array.isArray(t)) return 0;
  return t.length;
}

function declaredAgents(dir) {
  const agentsDir = path.join(dir, 'agents');
  if (!fs.existsSync(agentsDir)) return 0;
  try {
    return fs.readdirSync(agentsDir).filter(f => f.endsWith('.json')).length;
  } catch (_) { return 0; }
}

function main() {
  const modules = discoverModules();
  const signatures = loadDriftBaseline();

  const inventory = [];
  for (const { dir, slug } of modules) {
    const manifestPath = path.join(dir, 'module.json');
    const manifest = loadJson(manifestPath);
    if (!manifest) continue;

    const indexPath = path.join(dir, 'index.js');
    const loc = countLines(indexPath);
    const drifts = countDriftsForModule(signatures, slug, dir);
    const layer = classify(slug);
    const events = declaredEvents(manifest);
    const tools = declaredTools(manifest);
    const agents = declaredAgents(dir);
    const deps = dependenciesUpstream(manifest);
    const language = manifest.language || 'unknown';
    const version = manifest.version || '0.0.0';

    inventory.push({
      slug,
      path: path.relative(REPO_ROOT, dir),
      layer,
      language,
      version,
      loc,
      drifts,
      events_publishes: events.publishes,
      events_subscribes: events.subscribes,
      tools,
      agents,
      dependencies: deps
    });
  }

  // Ordenar por capa (core → infra → dominio → tooling) y dentro de cada
  // capa por (a) menos dependencias upstream primero, (b) mas drifts primero
  // (los mas drifteados son donde se aprende mas patron de migracion al
  // arrancar, y donde mas valor da el cierre).
  const layerOrder = { core: 0, infra: 1, dominio: 2, tooling: 3 };
  inventory.sort((a, b) => {
    if (layerOrder[a.layer] !== layerOrder[b.layer]) return layerOrder[a.layer] - layerOrder[b.layer];
    if (a.dependencies.length !== b.dependencies.length) return a.dependencies.length - b.dependencies.length;
    return b.drifts - a.drifts;
  });

  // Asignar orden_migracion (1 a N)
  inventory.forEach((m, i) => { m.orden_migracion = i + 1; });

  const totals = {
    total_modulos: inventory.length,
    por_capa: {
      core: inventory.filter(m => m.layer === 'core').length,
      infra: inventory.filter(m => m.layer === 'infra').length,
      dominio: inventory.filter(m => m.layer === 'dominio').length,
      tooling: inventory.filter(m => m.layer === 'tooling').length
    },
    drifts_total: inventory.reduce((acc, m) => acc + m.drifts, 0),
    loc_total: inventory.reduce((acc, m) => acc + m.loc, 0),
    tools_total: inventory.reduce((acc, m) => acc + m.tools, 0),
    agents_total: inventory.reduce((acc, m) => acc + m.agents, 0)
  };

  const output = {
    _doc: 'Inventario priorizado de los modulos del repo. Cada modulo lleva su capa (core/infra/dominio/tooling), drift count, dependencias upstream, y orden_migracion sugerido. La fase horizontal de reescritura sigue este orden — los mas profundos (core sin dependencies uphill) primero, los mas perifericos (tooling) al final. Regenerable con: node arquitectura/migracion/scripts/inventario.js',
    generated_at: new Date().toISOString(),
    contratos_transversales_aplicables: 24,
    totals,
    layers: {
      core: 'Nucleo del subsistema chat/agentes + servicios criticos. Reescribir primero — su drift contamina la cascada downstream.',
      infra: 'Infraestructura compartida (filesystem, telegram, devices, security). Sin dependencies hacia dominio.',
      dominio: 'Logica de negocio (pizzepos, facturas, recetas, viabilidad). Cuerpo principal de los 73 modulos.',
      tooling: 'Herramientas de admin/diseno/UI helpers. Reescribir al final — sin impacto operativo critico.'
    },
    modulos: inventory
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`OK roadmap generado: ${path.relative(REPO_ROOT, OUT_PATH)}`);
  console.log(`  total: ${totals.total_modulos} modulos`);
  console.log(`  por capa: core=${totals.por_capa.core} infra=${totals.por_capa.infra} dominio=${totals.por_capa.dominio} tooling=${totals.por_capa.tooling}`);
  console.log(`  drifts totales (heuristica): ${totals.drifts_total}`);
  console.log(`  loc totales: ${totals.loc_total}`);
}

main();

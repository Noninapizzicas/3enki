#!/usr/bin/env node
/**
 * build-graph.js — Extrae el grafo de eventos de 2enki desde los module.json.
 * Nodos = modulos. Aristas dirigidas = eventos (publisher -> subscriber).
 * Fuente de verdad: modules/**\/module.json -> events.publishes / events.subscribes.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MODULES_DIR = path.join(ROOT, 'modules');

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, acc);
    } else if (entry.name === 'module.json') {
      acc.push(full);
    }
  }
  return acc;
}

function subsystemOf(relPath) {
  const parts = relPath.split('/');
  if (parts.length > 1) return parts[0]; // pizzepos, conversacion, facturacion
  return 'core';                          // top-level modules
}

const manifests = walk(MODULES_DIR);
const nodes = [];
const nodeById = new Map();
const events = new Map(); // event -> { publishers:Set, subscribers:Set }

function ev(name) {
  if (!events.has(name)) events.set(name, { publishers: new Set(), subscribers: new Set() });
  return events.get(name);
}

for (const mfPath of manifests) {
  let mf;
  try { mf = JSON.parse(fs.readFileSync(mfPath, 'utf8')); }
  catch (e) { console.warn('skip (bad json):', mfPath); continue; }

  const rel = path.relative(MODULES_DIR, path.dirname(mfPath));
  const id = mf.name || rel;
  if (mf.name === '_template' || rel === '_template') continue;
  if (nodeById.has(id)) continue; // dedupe by name

  const subsystem = subsystemOf(rel);
  const publishes = ((mf.events && mf.events.publishes) || []).map(p => typeof p === 'string' ? p : p.event).filter(Boolean);
  const subscribes = ((mf.events && mf.events.subscribes) || []).map(s => typeof s === 'string' ? s : s.event).filter(Boolean);

  const node = {
    id, label: id, path: rel, subsystem,
    version: mf.version || null,
    description: (mf.description || '').slice(0, 280),
    publishes, subscribes,
    tools: (mf.tools || []).map(t => t.name).filter(Boolean),
    ui_handlers: (mf.ui_handlers || []).length,
    blueprint_driven: !!mf.blueprint_driven
  };
  nodes.push(node);
  nodeById.set(id, node);

  publishes.forEach(e => ev(e).publishers.add(id));
  subscribes.forEach(e => ev(e).subscribers.add(id));
}

// Directed edges publisher -> subscriber per shared event
const edgeMap = new Map();
for (const [name, { publishers, subscribers }] of events) {
  for (const src of publishers) {
    for (const dst of subscribers) {
      if (src === dst) continue;
      const key = src + ' → ' + dst;
      if (!edgeMap.has(key)) edgeMap.set(key, { source: src, target: dst, events: new Set() });
      edgeMap.get(key).events.add(name);
    }
  }
}
const edges = [...edgeMap.values()].map(e => ({ source: e.source, target: e.target, events: [...e.events], weight: e.events.size }));

// Degree stats
for (const n of nodes) { n.out = 0; n.in = 0; }
const idx = Object.fromEntries(nodes.map(n => [n.id, n]));
for (const e of edges) { if (idx[e.source]) idx[e.source].out += e.weight; if (idx[e.target]) idx[e.target].in += e.weight; }

// Dangling events
const danglingEvents = [];
for (const [name, { publishers, subscribers }] of events) {
  if (publishers.size === 0 && subscribers.size > 0) danglingEvents.push({ event: name, kind: 'no_publisher', modules: [...subscribers] });
  if (subscribers.size === 0 && publishers.size > 0) danglingEvents.push({ event: name, kind: 'no_subscriber', modules: [...publishers] });
}

const subsystems = [...new Set(nodes.map(n => n.subsystem))].sort();

const graph = {
  _meta: {
    generated_at: new Date().toISOString(),
    source: 'modules/**/module.json',
    modules: nodes.length, events: events.size, edges: edges.length, subsystems
  },
  nodes: nodes.sort((a, b) => (b.in + b.out) - (a.in + a.out)),
  edges,
  events: [...events.entries()].map(([name, v]) => ({ name, publishers: [...v.publishers], subscribers: [...v.subscribers] })).sort((a, b) => a.name.localeCompare(b.name)),
  dangling: danglingEvents.sort((a, b) => a.event.localeCompare(b.event))
};

fs.writeFileSync(path.join(__dirname, 'graph.json'), JSON.stringify(graph, null, 2));
// Embed as a plain script so index.html opens over file:// without fetch/CORS.
fs.writeFileSync(path.join(__dirname, 'graph-data.js'), 'window.GRAPH = ' + JSON.stringify(graph) + ';\n');
console.log(`modules=${nodes.length} events=${events.size} edges=${edges.length} subsystems=${subsystems.length} dangling=${danglingEvents.length}`);

const hubs = [...nodes].sort((a, b) => (b.in + b.out) - (a.in + a.out)).slice(0, 12);
console.log('\nTop hubs (in+out event-degree):');
for (const h of hubs) console.log(`  ${String(h.in + h.out).padStart(4)}  ${h.subsystem}/${h.id}  (in ${h.in} / out ${h.out})`);

// ---- Markdown insights report ----
const bySub = {};
for (const n of nodes) (bySub[n.subsystem] ||= []).push(n);
const crossEdges = edges.filter(e => idx[e.source].subsystem !== idx[e.target].subsystem)
  .sort((a, b) => b.weight - a.weight);
const sinks = nodes.filter(n => n.out === 0 && n.in > 0).sort((a, b) => b.in - a.in); // consume, no emite por bus
const sources = nodes.filter(n => n.in === 0 && n.out > 0).sort((a, b) => b.out - a.out); // emite, nadie escucha (declarado)
const md = [];
md.push('# 2enki — Grafo de eventos · informe\n');
md.push(`> Generado ${graph._meta.generated_at} desde \`modules/**/module.json\`.\n`);
md.push(`**${nodes.length}** módulos · **${events.size}** eventos distintos · **${edges.length}** aristas declaradas · **${subsystems.length}** subsistemas.\n`);
md.push('Abre `graph/index.html` para la vista interactiva.\n');

md.push('\n## Subsistemas\n');
md.push('| Subsistema | Módulos | Eventos publicados | Eventos escuchados |');
md.push('|---|--:|--:|--:|');
for (const s of subsystems) {
  const ms = bySub[s];
  const pub = new Set(), sub = new Set();
  ms.forEach(m => { m.publishes.forEach(e => pub.add(e)); m.subscribes.forEach(e => sub.add(e)); });
  md.push(`| ${s} | ${ms.length} | ${pub.size} | ${sub.size} |`);
}

md.push('\n## God nodes (mayor grado de eventos)\n');
md.push('Concentran el acoplamiento del sistema: tocarlos propaga.\n');
md.push('| Módulo | Subsistema | in | out | grado |');
md.push('|---|---|--:|--:|--:|');
for (const h of hubs) md.push(`| \`${h.id}\` | ${h.subsystem} | ${h.in} | ${h.out} | **${h.in + h.out}** |`);

md.push('\n## Conexiones entre subsistemas (cruces)\n');
md.push('Las fronteras donde un subsistema habla con otro — los puntos de integración a vigilar.\n');
md.push('| Origen | → | Destino | Eventos |');
md.push('|---|:-:|---|---|');
for (const e of crossEdges.slice(0, 20))
  md.push(`| \`${e.source}\` (${idx[e.source].subsystem}) | → | \`${e.target}\` (${idx[e.target].subsystem}) | ${e.events.slice(0,3).map(x=>'`'+x+'`').join(', ')}${e.events.length>3?` +${e.events.length-3}`:''} |`);

md.push('\n## Sumideros puros (escuchan, no emiten por bus)\n');
md.push('Finales de cadena: proyectores, displays, persistencia.\n');
md.push(sinks.slice(0, 12).map(n => `- \`${n.id}\` (${n.subsystem}) — escucha ${n.in}`).join('\n') || '_ninguno_');

md.push('\n\n## Fuentes puras (emiten, sin subscriptor declarado)\n');
md.push('Emisores cuyos eventos nadie declara escuchar en su manifest. Muchos se consumen por bus crudo (propiocepción), RPC request/response o `ui_handlers` — no es necesariamente un fallo, pero conviene revisarlos.\n');
md.push(sources.slice(0, 15).map(n => `- \`${n.id}\` (${n.subsystem}) — publica ${n.out}`).join('\n') || '_ninguna_');

md.push('\n\n## Eventos colgantes\n');
md.push(`Hay **${danglingEvents.length}** eventos sin par declarado en manifests (${danglingEvents.filter(d=>d.kind==='no_subscriber').length} sin subscriptor · ${danglingEvents.filter(d=>d.kind==='no_publisher').length} sin publisher). Esperable: el bus admite suscripción cruda (\`mqtt.on('message')\`), RPC \`*.request/*.response\` y wiring por \`ui_handlers\` que no aparecen como \`events.subscribes\`. El grafo dibuja solo las aristas declaradas explícitamente.\n`);

md.push('\n---\n_Reconstruir: `node graph/build-graph.js`_\n');
fs.writeFileSync(path.join(__dirname, 'REPORT.md'), md.join('\n'));
console.log('\nwrote graph.json, graph-data.js, REPORT.md');

#!/usr/bin/env node
'use strict';

/**
 * enki-portal — conexión al Enki vivo por la PUERTA GUARDADA (Portal MCP) vía MQTT/WSS.
 *
 * Camino: ui/request/portal/{health|list_tools|call} → modules/portal → GUARD → executeTool().
 * Los dos interruptores del portal ('Portal MCP' y 'Portal MCP · escritura') los manda el
 * dueño desde la UI de Enki — este helper los LEE y traduce sus negativas a mensajes claros.
 *
 * Transporte: wss://<host>/mqtt (443) — el MQTT crudo (1883) está bloqueado en cloud aislado.
 *
 * ENV:
 *   ENKI_BROKER / AUDIT_BROKER   default wss://enki-ai.online/mqtt
 *   ENKI_RPC_TIMEOUT             ms por RPC (default 15000)
 *
 * Uso:
 *   node enki-portal.js health
 *   node enki-portal.js tools [filtro-regex]
 *   node enki-portal.js call <tool> ['{"k":"v"}'] [--project <uuid>] [--confirmado]
 */

const crypto = require('crypto');

let mqtt;
try { mqtt = require('mqtt'); }
catch (_) {
  console.error('falta la dependencia "mqtt". Exporta NODE_PATH al node_modules del repo:');
  console.error('  NODE_PATH=<ruta>/2enki/node_modules node ' + (process.argv[1] || 'enki-portal.js') + ' ...');
  process.exit(2);
}

const BROKER  = process.env.ENKI_BROKER || process.env.AUDIT_BROKER || 'wss://enki-ai.online/mqtt';
const TIMEOUT = Number(process.env.ENKI_RPC_TIMEOUT) || 15000;

// Abre UNA conexión, entrega un rpc() y cierra al terminar fn (o al fallar).
async function withConnection(fn) {
  const c = mqtt.connect(BROKER, { clientId: 'enki-portal-' + Date.now(), connectTimeout: 8000, reconnectPeriod: 0 });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('connect timeout ' + BROKER)), 8000);
    c.on('connect', () => { clearTimeout(t); res(); });
    c.on('error', (e) => { clearTimeout(t); rej(e); });
  });
  console.error('[conectado ' + BROKER + ']');

  const pending = new Map();
  c.on('message', (topic, payload) => {
    if (!topic.startsWith('ui/response/')) return;
    let m; try { m = JSON.parse(payload.toString()); } catch (_) { return; }
    const p = pending.get(m.request_id);
    if (!p) return;
    pending.delete(m.request_id); clearTimeout(p.t); p.res(m);
  });

  const rpc = (action, data = {}) => new Promise((res, rej) => {
    const request_id = crypto.randomUUID();
    const respTopic = 'ui/response/' + request_id;
    const t = setTimeout(() => { pending.delete(request_id); rej(new Error('timeout portal/' + action)); }, TIMEOUT);
    pending.set(request_id, { res, t });
    c.subscribe(respTopic, (e) => {
      if (e) { clearTimeout(t); pending.delete(request_id); rej(e); return; }
      c.publish('ui/request/portal/' + action, JSON.stringify({ request_id, data }), { qos: 1 });
    });
  });

  try { return await fn(rpc); }
  finally { try { c.end(true); } catch (_) {} }
}

// Traduce las negativas del guard a "qué botón/freno lo paró" — sin buscar otro camino.
function explicarGuard(r) {
  const code = r && r.error && r.error.code;
  const msg = (r && r.error && r.error.message) || '';
  if (r && r.status === 503) return "puerta CERRADA — interruptor 'Portal MCP' OFF: pide al dueño encenderlo (UI → Interruptores)";
  if (code === 'PERMISSION_DENIED') return "el guard la paró (scope/mode) — si es una mutación, el botón 'Portal MCP · escritura' está OFF";
  if (code === 'NEEDS_CONFIRMATION') return 'la tool exige confirmación — reintenta con --confirmado SOLO tras visto bueno humano';
  if (code === 'INVALID_INPUT' && /write_sin_proyecto|project_id/.test(msg)) return 'mutación en scope=project sin proyecto — añade --project <uuid>';
  if (code === 'RESOURCE_NOT_FOUND') return "la tool no existe en el registry — mira el catálogo con 'tools'";
  return null;
}

function out(obj) { process.stdout.write(JSON.stringify(obj, null, 1) + '\n'); }

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv.shift();

  if (cmd === 'health') {
    await withConnection(async (rpc) => {
      const r = await rpc('health', {});
      out(r);
      const d = r.data || {};
      console.error('[puerta ' + (d.activo ? 'ABIERTA' : 'CERRADA') + ' · mode=' + d.mode + ' · scope=' + d.scope +
        (d.project_id ? ' · project=' + d.project_id : '') + ']');
      console.error(d.activo
        ? (d.write ? '[escritura ON — mutaciones permitidas dentro del scope]' : '[escritura OFF — solo lectura]')
        : "[interruptor 'Portal MCP' OFF — pide al dueño encenderlo]");
    });
    return;
  }

  if (cmd === 'tools') {
    const filtro = argv[0] ? new RegExp(argv[0], 'i') : null;
    await withConnection(async (rpc) => {
      const r = await rpc('list_tools', {});
      const d = r.data || {};
      if (d.cerrado) { console.error("[puerta CERRADA — interruptor 'Portal MCP' OFF]"); process.exit(3); }
      const tools = (d.tools || []).filter(t => !filtro || filtro.test(t.name));
      tools.forEach(t => console.log(t.name + (t.description ? '  — ' + String(t.description).slice(0, 90) : '')));
      console.error('[' + tools.length + (filtro ? '/' + d.total : '') + ' tools · mode=' + d.mode + ' · scope=' + d.scope + ']');
    });
    return;
  }

  if (cmd === 'call') {
    const tool = argv.shift();
    if (!tool) { console.error('uso: call <tool> [json] [--project <uuid>] [--confirmado]'); process.exit(2); }
    let args = {};
    let project_id = null;
    let confirmado = false;
    while (argv.length) {
      const a = argv.shift();
      if (a === '--project') project_id = argv.shift();
      else if (a === '--confirmado') confirmado = true;
      else args = JSON.parse(a);
    }
    await withConnection(async (rpc) => {
      const data = { tool, args };
      if (project_id) data.project_id = project_id;
      if (confirmado) data.confirmado = true;
      const r = await rpc('call', data);
      out(r);
      const porQue = explicarGuard(r);
      if (porQue) { console.error('[guard] ' + porQue); process.exit(3); }
    });
    return;
  }

  console.error('comandos: health · tools [filtro] · call <tool> [json] [--project <uuid>] [--confirmado]');
  process.exit(2);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });

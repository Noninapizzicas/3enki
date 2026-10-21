#!/usr/bin/env node
'use strict';

/**
 * enki-mcp-server — bridge MCP (stdio) ↔ Enki (MQTT).
 *
 * Un agente externo (Claude Code, Cursor) lanza este proceso como servidor MCP por stdio.
 * El bridge NO toca el core: habla con el módulo `portal` por el bus (ui/request/portal/*),
 * que es quien aplica el GUARD (interruptor 'portal-mcp', scope, mode, allowlist, audit).
 *
 *   MCP tools/list  → ui/request/portal/list_tools  → catálogo guardado
 *   MCP tools/call  → ui/request/portal/call        → ejecuta tras el guard
 *
 * Si el portal está apagado (interruptor OFF), tools/list llega vacío y tools/call da 503.
 *
 * Protocolo: JSON-RPC 2.0 por stdio, mensajes delimitados por '\n'. Logs SOLO a stderr
 * (stdout es el canal MCP — no se puede contaminar).
 *
 * Variables de entorno:
 *   ENKI_BROKER_URL    broker MQTT de Enki (default mqtt://localhost:1883)
 *   ENKI_PROJECT       project_id para scope (se inyecta en cada call; el portal lo re-valida)
 *   ENKI_PORTAL_TIMEOUT  ms de espera por respuesta del portal (default 8000)
 *
 * Registro en Claude Code:
 *   claude mcp add enki -- node /ruta/2enki/mcp/enki-mcp-server.js
 *   (con env: ENKI_BROKER_URL, ENKI_PROJECT)
 */

const crypto = require('crypto');
let mqtt;
try { mqtt = require('mqtt'); }
catch (_) { log('FATAL: falta la dependencia "mqtt" (instálala en el repo de Enki).'); process.exit(1); }

const BROKER = process.env.ENKI_BROKER_URL || 'mqtt://localhost:1883';
const PROJECT = process.env.ENKI_PROJECT || null;
const TIMEOUT = Number(process.env.ENKI_PORTAL_TIMEOUT) || 8000;
const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'enki', version: '0.1.0' };

function log(...a) { process.stderr.write('[enki-mcp] ' + a.join(' ') + '\n'); }
function send(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }
function reply(id, result) { send({ jsonrpc: '2.0', id, result }); }
function replyErr(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }); }

// ── MQTT: una conexión, RPC correlado por request_id contra el portal ──
const pending = new Map();
const client = mqtt.connect(BROKER, { reconnectPeriod: 2000, connectTimeout: 8000 });

client.on('connect', () => { log('conectado al broker', BROKER); client.subscribe('ui/response/#'); });
client.on('error', (e) => log('mqtt error:', e.message));
client.on('message', (topic, payload) => {
  if (!topic.startsWith('ui/response/')) return;
  let msg; try { msg = JSON.parse(payload.toString()); } catch (_) { return; }
  const p = pending.get(msg.request_id);
  if (!p) return;
  pending.delete(msg.request_id);
  clearTimeout(p.timer);
  p.resolve(msg);
});

function portalRpc(action, data) {
  const request_id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(request_id); reject(new Error('portal timeout (' + action + ')')); }, TIMEOUT);
    pending.set(request_id, { resolve, reject, timer });
    client.publish(`ui/request/portal/${action}`, JSON.stringify({ request_id, data: data || {} }), { qos: 1 });
  });
}

// ── MCP handlers ──
async function onInitialize(id, params) {
  const pv = (params && params.protocolVersion) || PROTOCOL_VERSION;
  reply(id, { protocolVersion: pv, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO });
}

async function onToolsList(id) {
  try {
    const resp = await portalRpc('list_tools', {});
    const tools = ((resp && resp.data && resp.data.tools) || []).map(t => ({
      name: t.name,
      description: t.description || t.name,
      inputSchema: t.parameters && typeof t.parameters === 'object'
        ? t.parameters
        : { type: 'object', properties: {} }
    }));
    reply(id, { tools });
  } catch (e) {
    replyErr(id, -32000, 'portal list_tools: ' + e.message);
  }
}

async function onToolsCall(id, params) {
  const name = params && params.name;
  const args = (params && params.arguments) || {};
  if (!name) return replyErr(id, -32602, 'falta params.name');
  try {
    const resp = await portalRpc('call', { tool: name, args, project_id: PROJECT, confirmado: args.__confirmado === true });
    const ok = resp && resp.success !== false && (resp.status === undefined || resp.status < 400);
    const body = ok ? (resp.data && resp.data.result !== undefined ? resp.data.result : resp.data) : (resp && resp.error) || resp;
    reply(id, {
      content: [{ type: 'text', text: typeof body === 'string' ? body : JSON.stringify(body, null, 2) }],
      isError: !ok
    });
  } catch (e) {
    reply(id, { content: [{ type: 'text', text: 'portal call error: ' + e.message }], isError: true });
  }
}

// ── stdio JSON-RPC loop (mensajes delimitados por '\n') ──
let buf = '';
process.stdin.on('data', (chunk) => {
  buf += chunk.toString('utf8');
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (line) handleLine(line);
  }
});
process.stdin.on('end', () => process.exit(0));

async function handleLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }            // ruido no-JSON: ignora
  const { id, method, params } = msg;
  // notificaciones (sin id): no se responden
  if (id === undefined || id === null) {
    // notifications/initialized, notifications/cancelled, etc. — nada que devolver
    return;
  }
  switch (method) {
    case 'initialize':   return onInitialize(id, params);
    case 'tools/list':   return onToolsList(id);
    case 'tools/call':   return onToolsCall(id, params);
    case 'ping':         return reply(id, {});
    default:             return replyErr(id, -32601, 'método no soportado: ' + method);
  }
}

log('enki-mcp-server listo (broker', BROKER + (PROJECT ? ', project ' + PROJECT : '') + ')');

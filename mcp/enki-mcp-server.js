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
const SERVER_INFO = { name: 'enki', version: '0.2.0' };

// ── REJA (piloto mundo-chat sin 460 tools) ─────────────────────────
// ENKI_REJA_ABIERTA   = 'true' (default) | 'false' → modo reja
// ENKI_REJA_PROYECTOS = csv de project_ids a los que aplica (vacío = todos)
// ENKI_REJA_GLOBALES  = csv de tools que se MANTIENEN con la reja
const REJA_ABIERTA = (process.env.ENKI_REJA_ABIERTA ?? 'true') !== 'false';
const REJA_PROYECTOS = (process.env.ENKI_REJA_PROYECTOS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const REJA_GLOBALES_DEFAULT = 'buscar_capacidad,detalle_capacidad,fs.read,fs.write,fs.list,fs.search,fs.info,leer_web,leer_imagen,crear_lista,anadir_paso,completar_paso,ver_listas,fijar_objetivo,evaluar_rail';
const REJA_GLOBALES = (process.env.ENKI_REJA_GLOBALES || REJA_GLOBALES_DEFAULT)
  .split(',').map(s => s.trim()).filter(Boolean);

// tools/list no lleva project_id en MCP: la reja global decide por el
// scope del proceso (ENKI_PROJECT). Por-call se decide con el project_id
// real que viaja en los args (rejaCerradaPara).
function rejaCerradaPara(projectId) {
  if (REJA_ABIERTA) return false;
  if (REJA_PROYECTOS.length === 0) return true;
  return !!projectId && REJA_PROYECTOS.includes(projectId);
}
function rejaCerradaGlobal() { return rejaCerradaPara(PROJECT); }

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

// ui.request — UNA tool genérica de invocación (dominio + accion + args).
// El LLM la llama con el catálogo compacto del system prompt; el server
// la traduce a la tool real del portal (ruta directa v3 / bus fallback).
const UI_REQUEST_TOOL = {
  name: 'ui.request',
  description: 'Ejecuta UNA capacidad de Enki por dominio+accion (ej. {dominio:"mercadona", accion:"categorias_listar"}). El CATALOGO DE CAPACIDADES (seccion del system prompt) lista los nombres por dominio; usa buscar_capacidad para rankear por significado del turno y detalle_capacidad para ver el contrato (args) de una antes de llamarla.',
  inputSchema: {
    type: 'object',
    properties: {
      dominio: { type: 'string', description: 'Dominio de la capacidad (prefijo antes del punto, ej: mercadona, productos, escandallo, fs)' },
      accion: { type: 'string', description: 'Accion de la capacidad (ej: categorias_listar, get, costear)' },
      args: { type: 'object', description: 'Argumentos de la capacidad. OBLIGATORIO project_id en mutaciones.' },
      project_id: { type: 'string', description: 'ID del proyecto activo (obligatorio en mutaciones)' }
    },
    required: ['dominio', 'accion']
  }
};

async function onToolsList(id) {
  try {
    const resp = await portalRpc('list_tools', {});
    const all = ((resp && resp.data && resp.data.tools) || []).map(t => ({
      name: t.name,
      description: t.description || t.name,
      inputSchema: t.parameters && typeof t.parameters === 'object'
        ? t.parameters
        : { type: 'object', properties: {} }
    }));

    if (!rejaCerradaGlobal()) {
      reply(id, { tools: all });
      return;
    }

    // REJA CERRADA: ui.request + globales (schema completo). El catálogo
    // completo (name+desc por dominio) lo inyecta el hermes-relay en el
    // system prompt — el LLM ejecuta con ui.request y abre el cajón con
    // buscar_capacidad / detalle_capacidad.
    const byName = new Map(all.map(t => [t.name, t]));
    const tools = [UI_REQUEST_TOOL];
    for (const g of REJA_GLOBALES) {
      const t = byName.get(g);
      if (t) tools.push(t);
    }
    log('reja cerrada: ' + tools.length + ' tools servidas (antes ' + all.length + ')');
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
    const callProject = args.project_id || PROJECT;

    if (name === 'ui.request') {
      return await onUiRequest(id, args, callProject);
    }

    // REJA por-call: si el proyecto de ESTA llamada está en modo reja,
    // solo globales + ui.request pueden ejecutarse directamente.
    if (rejaCerradaPara(callProject) && !REJA_GLOBALES.includes(name)) {
      return replyErr(id, -32001,
        `reja cerrada para este proyecto: '${name}' no está en las globales. ` +
        `Usa ui.request {dominio, accion, args} con el catálogo del system, o buscar_capacidad para encontrarla.`);
    }

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

// ui.request — UNA tool genérica: {dominio, accion, args} → tool real del portal.
async function onUiRequest(id, args, callProject) {
  const { dominio, accion } = args;
  if (typeof dominio !== 'string' || !dominio || typeof accion !== 'string' || !accion) {
    return replyErr(id, -32602, 'ui.request requiere {dominio: string, accion: string, args?: object}');
  }
  const toolName = `${dominio}.${accion}`;
  if (toolName === 'ui.request') {
    return replyErr(id, -32602, 'anti-loop: ui.request no puede invocarse a sí misma');
  }
  const callArgs = {
    ...(args.args && typeof args.args === 'object' ? args.args : {}),
    project_id: callProject
  };
  try {
    const resp = await portalRpc('call', {
      tool: toolName,
      args: callArgs,
      project_id: callProject,
      confirmado: callArgs.__confirmado === true || args.__confirmado === true
    });
    const ok = resp && resp.success !== false && (resp.status === undefined || resp.status < 400);
    const body = ok
      ? (resp.data && resp.data.result !== undefined ? resp.data.result : resp.data)
      : (resp && resp.error) || resp;
    if (!ok) {
      const code = (body && (body.code || body.error?.code)) || 'ERROR';
      const msg = (body && (body.message || body.error?.message)) || JSON.stringify(body);
      if (code === 'TOOL_NOT_FOUND' || code === 'RESOURCE_NOT_FOUND' || /not found|no encontrada/i.test(msg)) {
        return reply(id, { content: [{ type: 'text', text:
          `ui.request: '${toolName}' no está en el catálogo. Usa buscar_capacidad para rankear por significado o detalle_capacidad para ver el contrato de una que sí exista.` }], isError: true });
      }
      return reply(id, { content: [{ type: 'text', text: `ui.request ${toolName} falló: ${msg}` }], isError: true });
    }
    reply(id, { content: [{ type: 'text', text: typeof body === 'string' ? body : JSON.stringify(body, null, 2) }] });
  } catch (e) {
    reply(id, { content: [{ type: 'text', text: 'ui.request error: ' + e.message }], isError: true });
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

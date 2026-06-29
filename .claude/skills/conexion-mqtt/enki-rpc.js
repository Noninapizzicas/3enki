#!/usr/bin/env node
'use strict';

/**
 * enki-rpc — conexión MQTT a Enki vivo + RPC ui/request → ui/response.
 *
 * Transporte: wss://enki-ai.online/mqtt (MQTT sobre WebSocket Secure, puerto 443).
 *   El MQTT crudo (1883/8883) suele estar BLOQUEADO en entornos cloud aislados;
 *   solo sale 443. Por eso wss/443 es el camino vivo (= AUDIT_BROKER de los helpers).
 *
 * Patrón RPC (lo que hace el frontend):
 *   publish  ui/request/{domain}/{action}   { request_id, data }
 *   listen   ui/response/{request_id}
 *
 * UNA conexión abierta para varias llamadas: withConnection() conecta una vez,
 * ejecuta la secuencia de RPCs y cierra al final. Así "llegas al proyecto y la
 * conversación" sin reconectar por paso.
 *
 * ENV:
 *   ENKI_BROKER / AUDIT_BROKER   default wss://enki-ai.online/mqtt
 *   ENKI_RPC_TIMEOUT             ms por RPC (default 12000)
 *
 * Dep: mqtt (npm). Si no resuelve, exporta NODE_PATH al node_modules del repo:
 *   NODE_PATH=/ruta/2enki/node_modules node enki-rpc.js ...
 *
 * Uso:
 *   node enki-rpc.js rpc  <domain> <action> ['{"k":"v"}']     # RPC genérico (one-shot)
 *   node enki-rpc.js projects                                  # lista proyectos (id · name · updatedAt)
 *   node enki-rpc.js project <nombre|id>                       # resuelve un proyecto → su id
 *   node enki-rpc.js convs <proyecto>                          # lista conversaciones del proyecto
 *   node enki-rpc.js reach <proyecto> [titulo|latest]          # proyecto → conversación → CARGA (1 conexión)
 *
 * <proyecto> acepta nombre (case-insensitive, slug-tolerante) o UUID.
 */

const crypto = require('crypto');

let mqtt;
try { mqtt = require('mqtt'); }
catch (_) {
  console.error('falta la dependencia "mqtt". Exporta NODE_PATH al node_modules del repo:');
  console.error('  NODE_PATH=<ruta>/2enki/node_modules node ' + (process.argv[1] || 'enki-rpc.js') + ' ...');
  process.exit(2);
}

const BROKER  = process.env.ENKI_BROKER || process.env.AUDIT_BROKER || 'wss://enki-ai.online/mqtt';
const TIMEOUT = Number(process.env.ENKI_RPC_TIMEOUT) || 12000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Abre UNA conexión, entrega un rpc() y cierra al terminar fn (o al fallar).
async function withConnection(fn) {
  const c = mqtt.connect(BROKER, { clientId: 'enki-rpc-' + Date.now(), connectTimeout: 8000, reconnectPeriod: 0 });
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

  const rpc = (domain, action, data = {}) => new Promise((res, rej) => {
    const request_id = crypto.randomUUID();
    const respTopic = 'ui/response/' + request_id;
    const t = setTimeout(() => { pending.delete(request_id); rej(new Error('timeout ' + domain + '/' + action)); }, TIMEOUT);
    pending.set(request_id, { res, t });
    c.subscribe(respTopic, (e) => {
      if (e) { clearTimeout(t); pending.delete(request_id); rej(e); return; }
      c.publish('ui/request/' + domain + '/' + action, JSON.stringify({ request_id, data }), { qos: 1 });
    });
  });

  try { return await fn(rpc); }
  finally { try { c.end(true); } catch (_) {} }
}

// Resuelve <proyecto> (nombre|slug|uuid) a su id consultando project/list.
async function resolveProject(rpc, ref) {
  if (UUID_RE.test(ref)) return ref;
  const r = await rpc('project', 'list', {});
  const list = (r && r.data && r.data.projects) || [];
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const want = norm(ref);
  const hit = list.find(p => norm(p.name) === want || norm(p.slug) === want)
           || list.find(p => norm(p.name).includes(want) || norm(p.slug).includes(want));
  if (!hit) throw new Error('proyecto no encontrado: "' + ref + '". Disponibles: ' + list.map(p => p.name).join(', '));
  return hit.id;
}

function out(obj) { process.stdout.write(JSON.stringify(obj, null, 1) + '\n'); }

async function main() {
  const [, , cmd, a, b, c] = process.argv;

  if (cmd === 'rpc') {
    if (!a || !b) { console.error('uso: rpc <domain> <action> [json]'); process.exit(2); }
    const data = c ? JSON.parse(c) : {};
    await withConnection(async (rpc) => out(await rpc(a, b, data)));
    return;
  }

  if (cmd === 'projects') {
    await withConnection(async (rpc) => {
      const r = await rpc('project', 'list', {});
      const list = ((r && r.data && r.data.projects) || [])
        .map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))
        .sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt)));
      list.forEach(p => console.log(String(p.updatedAt).slice(0, 19), p.id, p.name));
    });
    return;
  }

  if (cmd === 'project') {
    if (!a) { console.error('uso: project <nombre|id>'); process.exit(2); }
    await withConnection(async (rpc) => console.log(await resolveProject(rpc, a)));
    return;
  }

  if (cmd === 'convs') {
    if (!a) { console.error('uso: convs <proyecto>'); process.exit(2); }
    await withConnection(async (rpc) => {
      const pid = await resolveProject(rpc, a);
      const r = await rpc('conversation', 'list', { project_id: pid, limit: 20 });
      const cs = ((r && r.data && r.data.conversations) || [])
        .sort((x, y) => String(y.updated_at).localeCompare(String(x.updated_at)));
      if (!cs.length) { console.log('(sin conversaciones) project=' + pid); return; }
      cs.forEach(cv => console.log(String(cv.updated_at).slice(0, 19), cv.id, 'msgs=' + (cv.message_count ?? '?'), JSON.stringify(cv.title || '')));
    });
    return;
  }

  if (cmd === 'reach') {
    if (!a) { console.error('uso: reach <proyecto> [titulo|latest]'); process.exit(2); }
    const target = b || 'latest';
    await withConnection(async (rpc) => {
      const pid = await resolveProject(rpc, a);
      const lr = await rpc('conversation', 'list', { project_id: pid, limit: 50 });
      const cs = ((lr && lr.data && lr.data.conversations) || [])
        .sort((x, y) => String(y.updated_at).localeCompare(String(x.updated_at)));
      if (!cs.length) throw new Error('proyecto ' + pid + ' sin conversaciones');
      const conv = (target === 'latest')
        ? cs[0]
        : (cs.find(cv => String(cv.title || '').toLowerCase() === target.toLowerCase()) || cs[0]);
      const loaded = await rpc('conversation', 'load', { project_id: pid, conversation_id: conv.id });
      out({ project_id: pid, conversation_id: conv.id, title: conv.title,
            messages: (loaded && loaded.data && loaded.data.messages) || [] });
    });
    return;
  }

  console.error('comandos: rpc · projects · project · convs · reach');
  process.exit(2);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });

#!/usr/bin/env node
/**
 * crear-proyecto-limpio.js — crea un proyecto NUEVO limpio en Enki vivo + conversación
 * con nombre + envía el guión del negocio al LLM. La vía correcta para VALIDAR el
 * proceso de proyecto (F0-F7) sin contaminación: el proyecto nace de cero y el chat
 * debe encadenar las fases solo, sin intervención manual.
 *
 * Lección 2026-08 (Paco): un proyecto depurado a mano NO sirve como referencia —
 * "funcionó" demuestra el arreglo manual, no el flujo. Validar SIEMPRE en proyecto
 * nuevo creado por este script.
 *
 * Requiere: mqtt (npm) en NODE_PATH. Broker: wss://enki-ai.online/mqtt (443) o
 * mqtt://localhost:1883 si estás en el VPS.
 *
 * Uso:
 *   NODE_PATH=~/3enki/node_modules node crear-proyecto-limpio.js \
 *     "Nombre del Proyecto" "Título de la conversación" "archivo-guion.md"
 *
 * El guión se lee del archivo indicado (mejor que pasarlo inline — puede ser largo).
 * Los payloads siguen el contrato del frontend (frontend/src/lib/stores/):
 *   project/create        { name, description, color, icon, workspaceType }
 *   conversation/create   { project_id, title }
 *   conversation/send     { project_id, page_id, conversation_id, context, settings,
 *                           prompt, attachments, intencion, message }  (9 campos)
 */
'use strict';

const fs = require('fs');
const crypto = require('crypto');
const mqtt = require('mqtt');

const [nombre, titulo, guionFile] = process.argv.slice(2);
if (!nombre || !titulo || !guionFile) {
  console.error('Uso: node crear-proyecto-limpio.js "<nombre>" "<título conv>" "<archivo guión>"');
  process.exit(2);
}
const guion = fs.readFileSync(guionFile, 'utf8');

const BROKER = process.env.ENKI_BROKER || 'wss://enki-ai.online/mqtt';
const TIMEOUT = 240000; // la respuesta de IA puede tardar (tools)

function connect() {
  return new Promise((resolve, reject) => {
    const c = mqtt.connect(BROKER, { clientId: 'hermes-proyecto-' + Date.now(), connectTimeout: 8000, reconnectPeriod: 0 });
    const t = setTimeout(() => reject(new Error('connect timeout')), 8000);
    c.on('connect', () => { clearTimeout(t); resolve(c); });
    c.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}

async function main() {
  const c = await connect();
  console.error('[conectado ' + BROKER + ']');
  const pending = new Map();
  c.on('message', (topic, payload) => {
    if (!topic.startsWith('ui/response/')) return;
    let m; try { m = JSON.parse(payload.toString()); } catch { return; }
    const p = pending.get(m.request_id);
    if (!p) return;
    pending.delete(m.request_id); clearTimeout(p.t); p.res(m);
  });

  const rpc = (domain, action, data = {}, timeout = TIMEOUT) => new Promise((res, rej) => {
    const request_id = crypto.randomUUID();
    const respTopic = 'ui/response/' + request_id;
    const t = setTimeout(() => { pending.delete(request_id); rej(new Error('timeout ' + domain + '/' + action)); }, timeout);
    pending.set(request_id, { res, t });
    c.subscribe(respTopic, (e) => {
      if (e) { clearTimeout(t); pending.delete(request_id); rej(e); return; }
      c.publish('ui/request/' + domain + '/' + action, JSON.stringify({ request_id, data }), { qos: 1 });
    });
  });

  // 1 · Crear el proyecto
  const r1 = await rpc('project', 'create', {
    name: nombre,
    description: guion.slice(0, 2000), // la descripción es corta; el guión completo va en el mensaje
    color: 'orange',
    icon: '🥖',
    workspaceType: 'general'
  });
  const project = r1.data && (r1.data.project || r1.data);
  const projectId = (project && (project.id || project.project_id)) || (r1.data && r1.data.id);
  if (!projectId) { console.error('NO SE OBTUVO project_id:', JSON.stringify(r1).slice(0, 500)); c.end(); process.exit(1); }
  console.error('[project_id:', projectId + ']');

  // 2 · Crear la conversación (con nombre de fase, ej: "F0 — Identidad del negocio")
  const r2 = await rpc('conversation', 'create', { project_id: projectId, title: titulo });
  const conversationId = r2.data && (r2.data.conversation_id || r2.data.id);
  if (!conversationId) { console.error('NO conversation_id:', JSON.stringify(r2).slice(0, 500)); c.end(); process.exit(1); }
  console.error('[conversation_id:', conversationId + ']');

  // 3 · Enviar el guión completo (contrato de 9 campos del frontend)
  const r3 = await rpc('conversation', 'send', {
    project_id: projectId,
    page_id: '',
    conversation_id: conversationId,
    context: {},
    settings: {},
    prompt: null,
    attachments: [],
    intencion: null,
    message: guion
  }, 240000);

  console.log('=== SEND ===');
  console.log(JSON.stringify(r3, null, 2).slice(0, 1500));
  console.error('[project_id:', projectId, '| conversation_id:', conversationId + ']');

  c.end();
  process.exit(0);
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });

#!/usr/bin/env node
/**
 * alta-proyecto-con-bot.js — Crea un proyecto nuevo, guarda la credencial del
 * bot de Telegram y lo vincula al proyecto. Todo por eventos (carril UI).
 *
 * Uso:
 *   node scripts/audit-helpers/alta-proyecto-con-bot.js <nombre> <botToken>
 *
 * Pasos (por el carril UI canónico ui/request/<dominio>/<accion>):
 *   1. project/create  → crea el proyecto, devuelve project_id
 *   2. credential/create → guarda la credencial TELEGRAM_API_KEY_BOT_<botName>
 *   3. telegram/bridge vincular → vincula botName a project_id
 */

'use strict';
const mqtt = require('mqtt');
const crypto = require('crypto');

const BROKER = process.env.AUDIT_BROKER || 'mqtt://localhost:1883';
const nombre = process.argv[2];
const token = process.argv[3];
const projectIdArg = process.argv[4] || ''; // opcional: project_id si ya existe
const botName = process.argv[5] || token.split(':')[0] || nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-');

if (!nombre || !token) {
  console.error('Uso: node alta-proyecto-con-bot.js "<nombre>" "<token>"');
  process.exit(2);
}

function uiRequest(c, domain, action, data, timeoutMs = 10000) {
  const requestId = crypto.randomUUID();
  const responseTopic = `ui/response/${requestId}`;
  const requestTopic = `ui/request/${domain}/${action}`;
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; c.removeListener('message', onMessage); c.unsubscribe(responseTopic); reject(new Error(`timeout en ${domain}/${action}`)); } }, timeoutMs);
    const onMessage = (topic, message) => {
      if (topic !== responseTopic) return;
      try {
        const env = JSON.parse(message.toString());
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        c.removeListener('message', onMessage);
        c.unsubscribe(responseTopic);
        resolve(env);
      } catch (_) {}
    };
    c.subscribe(responseTopic);
    c.publish(requestTopic, JSON.stringify({ request_id: requestId, data }));
  });
}

(async () => {
  const c = mqtt.connect(BROKER, { clientId: 'alta-' + Date.now(), connectTimeout: 8000, reconnectPeriod: 0 });
  await new Promise(r => c.on('connect', r));
  console.log('conectado a', BROKER);

  // 1. Crear proyecto (o usar el project_id pasado si ya existe)
  let pid = projectIdArg;
  if (!pid) {
    console.log('\n[1/3] creando proyecto', nombre, '...');
    const createResp = await uiRequest(c, 'project', 'create', { name: nombre });
    pid = createResp?.data?.project_id || createResp?.data?.id || createResp?.data?.project?.id;
    if (!pid) { console.error('FALLO crear:', JSON.stringify(createResp)); process.exit(1); }
    console.log('  project_id:', pid);
  } else {
    console.log('\n[1/3] proyecto ya existe, usando project_id', pid);
  }

  // 2. Guardar credencial del bot (provider=TELEGRAM, level=BOT, identifier=botName)
  console.log('[2/3] guardando credencial', botName, '...');
  const credResp = await uiRequest(c, 'credential', 'create', {
    provider: 'TELEGRAM',
    level: 'BOT',
    identifier: botName,
    api_key: token,
  });
  console.log('  credencial:', credResp?.status === 200 ? 'OK' : JSON.stringify(credResp?.error || credResp));

  // 3. Vincular bot al proyecto (por carril de eventos del bus, no UI)
  console.log('[3/3] vinculando bot', botName, 'a proyecto', pid, '...');
  const vincReqId = crypto.randomUUID();
  const vincResult = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ timeout: true }), 8000);
    const onMsg = (t, m) => {
      if (t === 'telegram.bridge.vincular.response') {
        try { const e = JSON.parse(m.toString()); if ((e.correlation_id === vincReqId || e.request_id === vincReqId) && !(e.correlation_id && e.request_id && e.correlation_id !== e.request_id)) { clearTimeout(timer); c.removeListener('message', onMsg); resolve(e); } } catch (_) {}
      }
    };
    c.subscribe('telegram.bridge.vincular.response');
    c.on('message', onMsg);
    c.publish('telegram.bridge.vincular.request', JSON.stringify({ data: { project_id: pid, botName }, correlation_id: vincReqId }));
  });
  console.log('  vínculo:', vincResult?.timeout ? 'timeout (sin response)' : JSON.stringify(vincResult));

  console.log('\nProyecto creado con bot. project_id =', pid, '· botName =', botName);
  c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });

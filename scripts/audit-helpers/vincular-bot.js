#!/usr/bin/env node
/** Vincular un bot de Telegram a un proyecto por el evento de bus. */
'use strict';
const mqtt = require('mqtt');
const crypto = require('crypto');

const BROKER = process.env.AUDIT_BROKER || 'mqtt://localhost:1883';
const projectId = process.argv[2];
const botName = process.argv[3];
if (!projectId || !botName) { console.error('uso: vincular-bot.js <project_id> <botName>'); process.exit(2); }

(async () => {
  const c = mqtt.connect(BROKER, { clientId: 'vin-' + Date.now(), connectTimeout: 8000, reconnectPeriod: 0 });
  await new Promise(r => c.on('connect', r));
  console.log('conectado a', BROKER);

  const reqId = crypto.randomUUID();
  const result = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ timeout: true }), 8000);
    const onMsg = (t, m) => {
      if (t === 'telegram.bridge.vincular.response') {
        try {
          const e = JSON.parse(m.toString());
          // aceptar si correlaciona con nuestro request
          if (e.correlation_id === reqId || e.request_id === reqId || (e.data && (e.data.project_id === projectId || e.data.botName === botName))) {
            clearTimeout(timer); c.removeListener('message', onMsg); resolve(e);
          }
        } catch (_) {}
      }
    };
    c.subscribe('telegram.bridge.vincular.response');
    c.on('message', onMsg);
    c.publish('telegram.bridge.vincular.request', JSON.stringify({ data: { project_id: projectId, botName }, correlation_id: reqId, project_id: projectId }));
  });

  console.log('RESULT:', JSON.stringify(result));
  c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });

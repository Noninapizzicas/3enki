#!/usr/bin/env node
/**
 * create-conversation — crea una conversación nueva y devuelve su id por stdout.
 *
 * Uso:
 *   node scripts/audit-helpers/create-conversation.js <project_id|name> <title>
 *
 * Imprime SOLO el conversation_id (para capturar fácil: CONV=$(node ...))
 */
'use strict';
const mqtt = require('mqtt');
const crypto = require('crypto');

const arg = process.argv[2];
const title = process.argv[3] || `audit-${Date.now()}`;
if (!arg) { console.error('Uso: create-conversation.js <project_id|name> [title]'); process.exit(2); }

const BROKER = process.env.AUDIT_BROKER || 'wss://enki-ai.online/mqtt';
const buildTopic = (et) => { const p=et.split('.'); return 'core/*/events/'+p[0]+(p.length>1?'/'+p.slice(1).join('/'):''); };
const subTopic   = (et) => { const p=et.split('.'); return 'core/+/events/'+p[0]+(p.length>1?'/'+p.slice(1).join('/'):''); };
const env = (et,d) => ({ event_id: crypto.randomUUID(), event_type: et, timestamp: new Date().toISOString(), source: { core_id: 'audit-helper' }, data: d, metadata: {} });
const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

(async () => {
  const c = mqtt.connect(BROKER, { clientId: 'cc-'+Date.now(), connectTimeout: 8000, reconnectPeriod: 0 });
  const projectId = await new Promise((resolve, reject) => {
    if (isUuid(arg)) return resolve(arg);
    const r = crypto.randomUUID();
    c.on('connect', () => c.subscribe(subTopic('project.list.response'), () => c.publish(buildTopic('project.list.request'), JSON.stringify(env('project.list.request', { request_id: r })))));
    c.on('message', (t, m) => {
      try {
        const d = JSON.parse(m.toString()).data || {};
        if (d.request_id !== r) return;
        const p = (d.projects || []).find(x => (x.name||'').toLowerCase() === arg.toLowerCase());
        p ? resolve(p.id) : reject(new Error(`proyecto "${arg}" no encontrado`));
      } catch {}
    });
    setTimeout(() => reject(new Error('timeout')), 8000);
  });
  const reqId = crypto.randomUUID();
  await new Promise(r => c.subscribe('ui/response/'+reqId, r));
  c.publish('ui/request/conversation/create', JSON.stringify({
    request_id: reqId,
    data: { project_id: projectId, title, user_id: 'default' }
  }));
  c.on('message', (t, m) => {
    if (t !== 'ui/response/'+reqId) return;
    try {
      const d = JSON.parse(m.toString());
      const convId = d.data?.conversation_id;
      if (convId) { console.log(convId); c.end(true); process.exit(0); }
    } catch {}
  });
  setTimeout(() => process.exit(1), 10000);
})();

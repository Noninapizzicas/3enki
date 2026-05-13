#!/usr/bin/env node
/**
 * list-conversations — lista las conversaciones de un proyecto, más recientes primero.
 *
 * Uso:
 *   node scripts/audit-helpers/list-conversations.js <project_id|name> [limit]
 */
'use strict';
const mqtt = require('mqtt');
const crypto = require('crypto');

const arg = process.argv[2];
const limit = parseInt(process.argv[3] || '10', 10);
if (!arg) { console.error('Uso: list-conversations.js <project_id|name> [limit]'); process.exit(2); }

const BROKER = process.env.AUDIT_BROKER || 'wss://enki-ai.online/mqtt';
const buildTopic = (et) => { const p=et.split('.'); return 'core/*/events/'+p[0]+(p.length>1?'/'+p.slice(1).join('/'):''); };
const subTopic   = (et) => { const p=et.split('.'); return 'core/+/events/'+p[0]+(p.length>1?'/'+p.slice(1).join('/'):''); };
const env = (et,d) => ({ event_id: crypto.randomUUID(), event_type: et, timestamp: new Date().toISOString(), source: { core_id: 'audit-helper' }, data: d, metadata: {} });
const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

(async () => {
  const c = mqtt.connect(BROKER, { clientId: 'lc-'+Date.now(), connectTimeout: 8000, reconnectPeriod: 0 });
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
  const r2 = crypto.randomUUID();
  await new Promise(r => c.subscribe(subTopic('db.query.response'), r));
  c.publish(buildTopic('db.query.request'), JSON.stringify(env('db.query.request', {
    project_id: projectId,
    query: 'SELECT id, title, created_at, updated_at FROM conversations WHERE project_id = ? ORDER BY updated_at DESC LIMIT ?',
    params: [projectId, limit],
    read_only: true, request_id: r2
  })));
  c.on('message', (t, m) => {
    try {
      const d = JSON.parse(m.toString()).data || {};
      if (d.request_id !== r2) return;
      for (const r of (d.data || [])) {
        const ts = new Date(parseInt(String(r.updated_at).split('.')[0])).toISOString();
        console.log(`${r.id}  ${ts}  ${r.title || ''}`);
      }
      c.end(true);
      process.exit(0);
    } catch {}
  });
  setTimeout(() => process.exit(1), 12000);
})();

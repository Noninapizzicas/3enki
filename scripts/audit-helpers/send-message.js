#!/usr/bin/env node
/**
 * send-message — envía 1 mensaje a una conversación y espera la respuesta.
 *
 * Imprime la respuesta del assistant y, en la última línea, una resumen
 * machine-readable: `--META {"tools":["recetas.listar:ok"],"duration_ms":7820,"length":1244}`
 *
 * Uso:
 *   node scripts/audit-helpers/send-message.js <project_id> <conv_id> <page_id> "mensaje" [wait_ms]
 */
'use strict';
const mqtt = require('mqtt');
const crypto = require('crypto');

const [, , projectId, convId, pageId, message, waitArg] = process.argv;
if (!message) { console.error('Uso: send-message.js <project_id> <conv_id> <page_id> "mensaje" [wait_ms]'); process.exit(2); }
const WAIT_MS = parseInt(waitArg || '90000', 10);

const BROKER = process.env.AUDIT_BROKER || 'wss://enki-ai.online/mqtt';

(async () => {
  const c = mqtt.connect(BROKER, { clientId: 'sm-'+Date.now(), connectTimeout: 8000, reconnectPeriod: 0 });
  await new Promise(r => c.on('connect', r));
  await new Promise(r => c.subscribe(['core/+/events/chat/assistant/saved','core/+/events/ai/chat/failed'], r));
  const t0 = Date.now();
  c.publish('ui/request/conversation/send', JSON.stringify({
    request_id: crypto.randomUUID(),
    data: { project_id: projectId, conversation_id: convId, message, user_id: 'default', channel: 'web', page_id: pageId }
  }));
  const result = await new Promise((resolve) => {
    const onMsg = (topic, msg) => {
      let p; try { p = JSON.parse(msg.toString()); } catch { return; }
      const d = p.data || p;
      if (d.conversation_id !== convId) return;
      const et = p.event_type || topic.split('events/').pop().replace(/\//g,'.');
      if (et === 'chat.assistant.saved' && p.source?.module_id !== 'chat-io' && d.assistant_message) {
        let tools = [];
        try { const md = typeof d.metadata === 'string' ? JSON.parse(d.metadata) : d.metadata; tools = (md?.tool_calls || []).map(t => (t.name||t.tool)+':'+(t.status||t.result_status||'?')); } catch {}
        resolve({ text: d.assistant_message, tools, failed: false });
      }
      if (et === 'ai.chat.failed') {
        resolve({ text: `[FAIL ${d.error?.code}] ${d.error?.message?.slice(0,200)}`, tools: [], failed: true });
      }
    };
    c.on('message', onMsg);
    setTimeout(() => resolve({ text: '[TIMEOUT]', tools: [], failed: true, timeout: true }), WAIT_MS);
  });
  const dur = Date.now() - t0;
  console.log(result.text);
  console.log(`--META ${JSON.stringify({ tools: result.tools, duration_ms: dur, length: result.text.length, failed: result.failed, timeout: result.timeout || false })}`);
  c.end(true);
  process.exit(0);
})();

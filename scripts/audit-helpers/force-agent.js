#!/usr/bin/env node
/**
 * force-agent — fuerza la ejecución de un agente vía agent.execute.request.
 *
 * Imprime los eventos del flow (progress/response/failed) y al final una
 * línea META con resumen machine-readable.
 *
 * Uso:
 *   node scripts/audit-helpers/force-agent.js <project_id> <conv_id> <agent_name> "task" [wait_ms]
 */
'use strict';
const mqtt = require('mqtt');
const crypto = require('crypto');

const [, , projectId, convId, agentName, task, waitArg] = process.argv;
if (!task) { console.error('Uso: force-agent.js <project_id> <conv_id> <agent_name> "task" [wait_ms]'); process.exit(2); }
const WAIT_MS = parseInt(waitArg || '120000', 10);

const BROKER = process.env.AUDIT_BROKER || 'wss://enki-ai.online/mqtt';
const buildTopic = (et) => { const p=et.split('.'); return 'core/*/events/'+p[0]+(p.length>1?'/'+p.slice(1).join('/'):''); };
const subTopic   = (et) => { const p=et.split('.'); return 'core/+/events/'+p[0]+(p.length>1?'/'+p.slice(1).join('/'):''); };
const env = (et,d) => ({ event_id: crypto.randomUUID(), event_type: et, timestamp: new Date().toISOString(), source: { core_id: 'audit-helper', module_id: 'audit-helper' }, data: d, metadata: {} });

(async () => {
  const c = mqtt.connect(BROKER, { clientId: 'fa-'+Date.now(), connectTimeout: 8000, reconnectPeriod: 0 });
  await new Promise(r => c.on('connect', r));
  await new Promise(r => c.subscribe(['core/+/events/agent/execute/#'], r));
  const REQ_ID = crypto.randomUUID();
  const CORR_ID = crypto.randomUUID();
  const t0 = Date.now();
  c.publish(buildTopic('agent.execute.request'), JSON.stringify(env('agent.execute.request', {
    correlation_id: CORR_ID, request_id: REQ_ID, user_id: 'default',
    agent_name: agentName,
    project_id: projectId, conversation_id: convId,
    channel: 'web', channel_context: {},
    task, context: { conversation_id: convId, project_id: projectId },
    timestamp: new Date().toISOString()
  })));
  const result = await new Promise((resolve) => {
    let content = null; let toolsExecuted = []; let progressSteps = [];
    c.on('message', (topic, msg) => {
      let p; try { p = JSON.parse(msg.toString()); } catch { return; }
      const d = p.data || p;
      if (d.request_id !== REQ_ID && d.correlation_id !== CORR_ID) return;
      const et = p.event_type || topic.split('events/').pop().replace(/\//g,'.');
      if (et === 'agent.execute.progress') {
        progressSteps.push({ t: Date.now()-t0, step: d.step || '?' });
      }
      if (et === 'agent.execute.response') {
        content = d.content || '';
        toolsExecuted = (d.tool_calls_executed || []).map(t => (t.name||t.tool)+':'+(t.result_status||t.status||'?'));
        resolve({ status: 'response', content, tools: toolsExecuted, duration_ms: d.duration_ms ?? (Date.now()-t0) });
      }
      if (et === 'agent.execute.failed') {
        resolve({ status: 'failed', error: d.error || {}, duration_ms: d.duration_ms ?? (Date.now()-t0), progress: progressSteps });
      }
    });
    setTimeout(() => resolve({ status: 'timeout', duration_ms: WAIT_MS, progress: progressSteps }), WAIT_MS);
  });
  if (result.status === 'response') {
    console.log(result.content);
    console.log(`--META ${JSON.stringify({ status: 'response', tools: result.tools, duration_ms: result.duration_ms, length: result.content.length })}`);
  } else if (result.status === 'failed') {
    console.log(`[FAILED] ${result.error?.code || '?'}: ${result.error?.message || ''}`);
    console.log(`--META ${JSON.stringify({ status: 'failed', error: result.error, duration_ms: result.duration_ms })}`);
  } else {
    console.log('[TIMEOUT]');
    console.log(`--META ${JSON.stringify({ status: 'timeout', duration_ms: result.duration_ms })}`);
  }
  c.end(true);
  process.exit(0);
})();

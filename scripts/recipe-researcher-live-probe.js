/**
 * Live probe: inyecta una conversacion en el VPS via WSS y captura todo
 * el flujo de chat/agentes durante 90s.
 *
 * Uso:
 *   PROJECT_NAME=Paco \
 *     node scripts/recipe-researcher-live-probe.js
 *
 *   # o con ID directo:
 *   PROJECT_ID=<uuid> node scripts/recipe-researcher-live-probe.js
 *
 * Variables opcionales:
 *   USER_ID               default: claude-probe-<short-uuid>
 *   CONVERSATION_ID       default: uuid v4 nuevo
 *   USER_MESSAGE          default: prompt de receta
 *   WAIT_MS               default: 90000
 *   BROKER_URL            default: wss://enki-ai.online/mqtt
 *   CHANNEL               default: web
 *
 * Topics canonicos del bus event-core:
 *   publicar (broadcast):  core/* /events/<domain>/<action>
 *   suscribir (any core):  core/+/events/<domain>/<action>
 *
 * Payload va envuelto en envelope:
 *   { event_id, event_type, timestamp, source:{core_id}, data:{...}, metadata }
 */

const mqtt = require('mqtt');
const crypto = require('crypto');

const BROKER_URL = process.env.BROKER_URL || 'wss://enki-ai.online/mqtt';
const PROJECT_NAME = process.env.PROJECT_NAME;
let PROJECT_ID = process.env.PROJECT_ID;
const USER_ID = process.env.USER_ID || ('claude-probe-' + crypto.randomUUID().slice(0, 8));
const CONVERSATION_ID = process.env.CONVERSATION_ID || crypto.randomUUID();
const CHANNEL = process.env.CHANNEL || 'web';
const USER_MESSAGE = process.env.USER_MESSAGE
  || "Investiga la receta 'magra con tomate' y proponme 3 variantes diferentes con sus ingredientes y pasos.";
const WAIT_MS = parseInt(process.env.WAIT_MS || '90000', 10);
const PROBE_CORE_ID = 'claude-probe';

if (!PROJECT_NAME && !PROJECT_ID) {
  console.error('FALTAN: PROJECT_NAME o PROJECT_ID.');
  process.exit(2);
}

function buildTopic(eventType) {
  const parts = eventType.split('.');
  return 'core/*/events/' + parts[0] + (parts.length > 1 ? '/' + parts.slice(1).join('/') : '');
}
function subTopic(eventType) {
  const parts = eventType.split('.');
  return 'core/+/events/' + parts[0] + (parts.length > 1 ? '/' + parts.slice(1).join('/') : '');
}
function makeEnvelope(eventType, data) {
  return {
    event_id: crypto.randomUUID(),
    event_type: eventType,
    timestamp: new Date().toISOString(),
    source: { core_id: PROBE_CORE_ID },
    data,
    metadata: {}
  };
}

const TOPICS_TO_LISTEN = [
  'chat.message.saved',
  'chat.context.enriched',
  'chat.prompt.ready',
  'chat.assistant.saved',
  'ai.chat.response',
  'ai.chat.failed',
  'agent.execute.request',
  'agent.execute.response',
  'agent.execute.failed',
  'agent.execute.progress',
  'llm.complete.request',
  'llm.complete.response',
  'llm.complete.failed'
];

const trace = [];
const correlation_id = crypto.randomUUID();
const message_id = crypto.randomUUID();
const t0 = Date.now();
const ms = () => (Date.now() - t0).toString().padStart(6, ' ') + 'ms';

function summarise(eventType, data) {
  const out = {};
  for (const k of ['conversation_id', 'correlation_id', 'message_id', 'request_id', 'agent_name']) {
    if (data?.[k]) out[k] = data[k];
  }
  if (data?.user_message) out.user_message = data.user_message.slice(0, 100);
  if (data?.assistant_message) out.assistant_message = (data.assistant_message || '').slice(0, 200) + ((data.assistant_message || '').length > 200 ? '…' : '');
  if (data?.content) out.content_preview = (data.content || '').slice(0, 150);
  if (data?.error?.code) out.error_code = data.error.code;
  if (data?.error?.message) out.error_message = data.error.message;
  if (data?.tool_calls_executed) out.tools_executed = data.tool_calls_executed.map(t => t.name || t.tool || '?').join(',');
  if (data?.task) out.task = (data.task || '').slice(0, 80);
  if (data?.metadata?.author) out.author = data.metadata.author;
  if (data?.provider) out.provider = data.provider;
  return out;
}

const client = mqtt.connect(BROKER_URL, {
  clientId: 'claude-probe-' + Date.now(),
  connectTimeout: 8000,
  reconnectPeriod: 0
});

client.on('error', e => console.error('mqtt error:', e.message));

client.on('connect', () => {
  console.log('[' + ms() + '] connected to ' + BROKER_URL);
  if (PROJECT_NAME && !PROJECT_ID) {
    resolveProjectId().then(startListening).catch(err => {
      console.error('FATAL resolving project:', err.message);
      process.exit(1);
    });
  } else {
    startListening();
  }
});

function resolveProjectId() {
  return new Promise((resolve, reject) => {
    const reqId = crypto.randomUUID();
    const respTopic = subTopic('project.list.response');
    const handler = (topic, msg) => {
      try {
        const env = JSON.parse(msg.toString());
        const d = env.data || env;
        if (d.request_id !== reqId) return;
        const match = (d.projects || []).find(p =>
          p.name === PROJECT_NAME || p.name?.toLowerCase() === PROJECT_NAME.toLowerCase());
        client.removeListener('message', handler);
        client.unsubscribe(respTopic);
        if (!match) return reject(new Error('project "' + PROJECT_NAME + '" not found in ' + d.count + ' projects'));
        PROJECT_ID = match.id;
        console.log('[' + ms() + '] resolved PROJECT_NAME=' + PROJECT_NAME + ' → PROJECT_ID=' + PROJECT_ID);
        resolve();
      } catch (e) { /* ignore */ }
    };
    client.on('message', handler);
    client.subscribe(respTopic, (err) => {
      if (err) return reject(err);
      const env = makeEnvelope('project.list.request', { request_id: reqId });
      client.publish(buildTopic('project.list.request'), JSON.stringify(env));
      setTimeout(() => reject(new Error('timeout resolving project_id')), 6000);
    });
  });
}

const uiRequestId = crypto.randomUUID();
const uiResponseTopic = 'ui/response/' + uiRequestId;
const startedAtMs = Date.now();

function startListening() {
  console.log('  conversation_id = ' + CONVERSATION_ID);
  console.log('  correlation_id  = ' + correlation_id);
  console.log('  ui_request_id   = ' + uiRequestId);
  console.log('  user_id         = ' + USER_ID);
  console.log('  project_id      = ' + PROJECT_ID);
  console.log();
  const subs = [...TOPICS_TO_LISTEN.map(subTopic), uiResponseTopic];
  client.subscribe(subs, (err) => {
    if (err) { console.error('subscribe failed:', err.message); process.exit(1); }
    console.log('[' + ms() + '] subscribed to ' + subs.length + ' topics (incl. ui/response)');
    publishMessage();
  });
}

function publishMessage() {
  // Topic real del UI handler: chat-io.handleSend persiste y luego publica chat.message.saved
  const uiTopic = 'ui/request/conversation/send';
  const uiPayload = {
    request_id: uiRequestId,
    data: {
      project_id: PROJECT_ID,
      conversation_id: CONVERSATION_ID,
      message: USER_MESSAGE,
      user_id: USER_ID,
      channel: CHANNEL,
      correlation_id
    }
  };
  console.log('[' + ms() + '] PUBLISH ' + uiTopic);
  console.log('  message: ' + USER_MESSAGE);
  console.log();
  client.publish(uiTopic, JSON.stringify(uiPayload), { qos: 1 });
  console.log('[' + ms() + '] listening ' + (WAIT_MS / 1000) + 's for downstream events…');
  console.log();
  setTimeout(finish, WAIT_MS);
}

function dbQueryNewMessages() {
  return new Promise((resolve) => {
    const reqId = crypto.randomUUID();
    const respTopic = subTopic('db.query.response');
    const handler = (topic, msg) => {
      try {
        const env = JSON.parse(msg.toString());
        const d = env.data || env;
        if (d.request_id !== reqId) return;
        client.removeListener('message', handler);
        client.unsubscribe(respTopic);
        resolve(d.success ? (d.data || []) : []);
      } catch { /* ignore */ }
    };
    client.on('message', handler);
    client.subscribe(respTopic, () => {
      const env = makeEnvelope('db.query.request', {
        project_id: PROJECT_ID,
        query: 'SELECT id, role, content, in_context, tokens, metadata, created_at FROM messages WHERE conversation_id = ? AND created_at >= ? ORDER BY created_at',
        params: [CONVERSATION_ID, startedAtMs - 1000],
        read_only: true,
        request_id: reqId
      });
      client.publish(buildTopic('db.query.request'), JSON.stringify(env));
      setTimeout(() => { client.removeListener('message', handler); resolve([]); }, 5000);
    });
  });
}

client.on('message', (topic, msg) => {
  // ui/response/<request_id> is plain JSON, no envelope
  if (topic === uiResponseTopic) {
    try {
      const r = JSON.parse(msg.toString());
      console.log('[' + ms() + '] ← ui/response (success=' + r.success + ')');
      if (r.error) console.log('    error: ' + JSON.stringify(r.error));
      if (r.data) {
        const keep = {};
        for (const k of ['message_id', 'conversation_id', 'persisted', 'created_at']) if (r.data[k]) keep[k] = r.data[k];
        if (Object.keys(keep).length) console.log('    data: ' + JSON.stringify(keep));
      }
    } catch {}
    return;
  }
  let env;
  try { env = JSON.parse(msg.toString()); } catch { return; }
  const eventType = env.event_type || topic.split('events/').pop().replace(/\//g, '.');
  const data = env.data || env;

  // skip our own publish echo
  if (env.source?.core_id === PROBE_CORE_ID && eventType === 'chat.message.saved') return;

  // filter to our conversation only
  const cid = data.conversation_id;
  const corr = data.correlation_id;
  if (cid && cid !== CONVERSATION_ID) return;
  if (!cid && corr && corr !== correlation_id) return;

  const entry = { t: ms(), event: eventType, summary: summarise(eventType, data) };
  trace.push(entry);
  console.log('[' + entry.t + '] ← ' + eventType);
  for (const [k, v] of Object.entries(entry.summary)) {
    if (typeof v === 'object') console.log('    ' + k + ': ' + JSON.stringify(v));
    else console.log('    ' + k + ': ' + v);
  }
});

async function finish() {
  console.log();
  console.log('=== RESUMEN (' + trace.length + ' eventos en esta conversación) ===');
  const counts = {};
  for (const e of trace) counts[e.event] = (counts[e.event] || 0) + 1;
  for (const [t, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log('  ' + n + '\t' + t);
  }
  console.log();

  console.log('=== MENSAJES PERSISTIDOS EN BD durante este test ===');
  try {
    const rows = await dbQueryNewMessages();
    console.log('  total: ' + rows.length);
    rows.forEach((r, i) => {
      const ts = new Date(parseInt(String(r.created_at).split('.')[0])).toISOString();
      let preview = (r.content || '').slice(0, 200);
      if ((r.content || '').length > 200) preview += '… (+' + (r.content.length - 200) + ' chars)';
      console.log('  [' + i + '] ' + ts + ' role=' + r.role + ' tokens=' + (r.tokens || '-'));
      console.log('      ' + preview);
      if (r.metadata) {
        try {
          const md = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
          if (md && Object.keys(md).length) console.log('      metadata: ' + JSON.stringify(md).slice(0, 300));
        } catch {}
      }
    });
  } catch (err) {
    console.log('  query failed:', err.message);
  }

  console.log();
  const tieneAgente = trace.some(e => e.event === 'agent.execute.request' && e.summary?.agent_name === 'recipe-researcher');
  const tieneAssistant = trace.some(e => e.event === 'chat.assistant.saved' || e.event === 'ai.chat.response');
  const tieneError = trace.some(e => e.event === 'ai.chat.failed' || e.event === 'agent.execute.failed' || e.event === 'llm.complete.failed');
  console.log('=== ANÁLISIS ===');
  console.log('  recipe-researcher invocado: ' + (tieneAgente ? 'SÍ' : 'NO'));
  console.log('  respuesta del LLM         : ' + (tieneAssistant ? 'SÍ' : 'NO'));
  console.log('  algún failed              : ' + (tieneError ? 'SÍ' : 'NO'));
  console.log();
  console.log('Frontend:  https://enki-ai.online → ' + (PROJECT_NAME || PROJECT_ID) + ' → conv ' + CONVERSATION_ID);
  client.end(true);
  process.exit(0);
}

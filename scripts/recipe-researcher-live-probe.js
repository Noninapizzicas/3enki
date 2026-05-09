/**
 * Live probe: inyecta una conversacion en el VPS via WSS y captura todo
 * el flujo de chat/agentes durante 90s.
 *
 * Uso:
 *   PROJECT_ID=... USER_ID=... CONVERSATION_ID=... \
 *     node scripts/recipe-researcher-live-probe.js
 *
 * Variables opcionales:
 *   USER_MESSAGE          texto a enviar (default: prompt de receta)
 *   WAIT_MS               tiempo de escucha post-publish (default: 90000)
 *   BROKER_URL            wss del broker (default: wss://enki-ai.online/mqtt)
 *   CHANNEL               default "web"
 *
 * Estrategia: solo flujo natural, no fuerza al agente. Si el LLM principal
 * no invoca al recipe-researcher, eso ya es señal util.
 */

const mqtt = require('mqtt');
const crypto = require('crypto');

const BROKER_URL = process.env.BROKER_URL || 'wss://enki-ai.online/mqtt';
const PROJECT_ID = process.env.PROJECT_ID;
const USER_ID = process.env.USER_ID;
const CONVERSATION_ID = process.env.CONVERSATION_ID || crypto.randomUUID();
const CHANNEL = process.env.CHANNEL || 'web';
const USER_MESSAGE = process.env.USER_MESSAGE
  || "Investiga la receta 'magra con tomate' y proponme 3 variantes diferentes con sus ingredientes y pasos.";
const WAIT_MS = parseInt(process.env.WAIT_MS || '90000', 10);

if (!PROJECT_ID || !USER_ID) {
  console.error('FALTAN: PROJECT_ID y USER_ID son obligatorios.');
  console.error('Uso: PROJECT_ID=... USER_ID=... [CONVERSATION_ID=...] node scripts/recipe-researcher-live-probe.js');
  process.exit(2);
}

const TOPICS = [
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

function pickRelevant(topic, payload) {
  // Filtra eventos del bus que no son de NUESTRA conversación
  const cid = payload?.conversation_id;
  const corr = payload?.correlation_id;
  if (cid && cid !== CONVERSATION_ID) return false;
  if (!cid && corr && corr !== correlation_id) return false;
  return true;
}

function summarise(topic, payload) {
  const keys = Object.keys(payload || {});
  const out = {};
  for (const k of ['conversation_id', 'correlation_id', 'message_id', 'request_id', 'agent_name']) {
    if (payload?.[k]) out[k] = payload[k];
  }
  if (payload?.user_message) out.user_message = payload.user_message.slice(0, 100) + (payload.user_message.length > 100 ? '…' : '');
  if (payload?.assistant_message) out.assistant_message = (payload.assistant_message || '').slice(0, 200) + ((payload.assistant_message || '').length > 200 ? '…' : '');
  if (payload?.error?.code) out.error_code = payload.error.code;
  if (payload?.tool_calls_executed) out.tools_executed = payload.tool_calls_executed.map(t => t.name || t.tool || '?').join(',');
  if (payload?.task) out.task = (payload.task || '').slice(0, 80);
  if (payload?.metadata?.author) out.author = payload.metadata.author;
  out._all_keys = keys;
  return out;
}

const client = mqtt.connect(BROKER_URL, {
  clientId: 'claude-probe-' + Date.now(),
  connectTimeout: 8000,
  reconnectPeriod: 0
});

client.on('connect', () => {
  console.log('[' + ms() + '] connected to ' + BROKER_URL);
  console.log('  conversation_id = ' + CONVERSATION_ID);
  console.log('  correlation_id  = ' + correlation_id);
  console.log('  user_id         = ' + USER_ID);
  console.log('  project_id      = ' + PROJECT_ID);
  console.log();
  client.subscribe(TOPICS, (err) => {
    if (err) { console.error('subscribe failed:', err.message); process.exit(1); }
    console.log('[' + ms() + '] subscribed to ' + TOPICS.length + ' topics');
    publishMessage();
  });
});

function publishMessage() {
  const payload = {
    correlation_id,
    conversation_id: CONVERSATION_ID,
    project_id: PROJECT_ID,
    user_id: USER_ID,
    channel: CHANNEL,
    channel_context: { source: 'claude-live-probe' },
    message_id,
    user_message: USER_MESSAGE,
    timestamp: new Date().toISOString()
  };
  console.log('[' + ms() + '] PUBLISH chat.message.saved');
  console.log('  user_message: ' + USER_MESSAGE);
  console.log();
  client.publish('chat.message.saved', JSON.stringify(payload), { qos: 0 }, (err) => {
    if (err) console.error('publish err:', err.message);
  });
  console.log('[' + ms() + '] listening ' + (WAIT_MS / 1000) + 's for downstream events…');
  console.log();
  setTimeout(finish, WAIT_MS);
}

client.on('message', (topic, msg) => {
  let payload;
  try { payload = JSON.parse(msg.toString()); } catch { payload = { _raw: msg.toString().slice(0, 100) }; }
  if (!pickRelevant(topic, payload)) return;
  const entry = { t: ms(), topic, summary: summarise(topic, payload) };
  trace.push(entry);
  console.log('[' + entry.t + '] ← ' + topic);
  for (const [k, v] of Object.entries(entry.summary)) {
    if (k === '_all_keys') continue;
    if (typeof v === 'object') console.log('    ' + k + ': ' + JSON.stringify(v));
    else console.log('    ' + k + ': ' + v);
  }
});

client.on('error', e => console.error('mqtt error:', e.message));

function finish() {
  console.log();
  console.log('=== RESUMEN (' + trace.length + ' eventos relevantes para esta conversación) ===');
  const counts = {};
  for (const e of trace) counts[e.topic] = (counts[e.topic] || 0) + 1;
  for (const [t, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log('  ' + n + '\\t' + t);
  }
  console.log();
  console.log('=== ANÁLISIS ===');
  const tieneAgente = trace.some(e => e.topic === 'agent.execute.request' && e.summary?.agent_name === 'recipe-researcher');
  const tieneAssistant = trace.some(e => e.topic === 'chat.assistant.saved' || e.topic === 'ai.chat.response');
  const tieneError = trace.some(e => e.topic === 'ai.chat.failed' || e.topic === 'agent.execute.failed' || e.topic === 'llm.complete.failed');
  console.log('  recipe-researcher invocado: ' + (tieneAgente ? 'SÍ' : 'NO'));
  console.log('  respuesta del LLM         : ' + (tieneAssistant ? 'SÍ' : 'NO'));
  console.log('  algún failed              : ' + (tieneError ? 'SÍ' : 'NO'));
  console.log();
  console.log('Para ver la conversación persistida:');
  console.log('  https://enki-ai.online → abre conversation_id = ' + CONVERSATION_ID);
  client.end(true);
  process.exit(0);
}

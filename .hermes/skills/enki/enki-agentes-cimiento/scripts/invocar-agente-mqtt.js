#!/usr/bin/env node
/**
 * invocar-agente-mqtt.js — invoca un agente de Enki por MQTT y captura el
 * veredicto del CIMIENTO v3 (agent.execute.response con verificado / failed).
 *
 * Uso:
 *   node invocar-agente-mqtt.js <agent_name> <project_id> "<task>" [--timeout-seg 300]
 *
 * Requisitos: el paquete mqtt de /opt/enki/node_modules (o NODE_PATH a él).
 * Ejemplo:
 *   node invocar-agente-mqtt.js escribir-skills c "Escribe la SKILL de planes-y-tiers"
 *
 * CLAVE (pitfall): el bus Enki exige el EventEnvelope canónico y DESCARTARÁ el
 * evento si source.core_id === 'core-a' (anti-loop). Por eso usamos 'hermes-cli'.
 * Publicar el payload directo (sin envelope) NO llega — verificado empíricamente.
 */
const mqtt = require('/opt/enki/node_modules/mqtt');
const crypto = require('crypto');

const [agent_name, project_id, task] = process.argv.slice(2);
const timeoutSeg = (parseInt(process.argv.find((a, i) => process.argv[i - 1] === '--timeout-seg'), 10) || 300) * 1000;

if (!agent_name || !project_id || !task) {
  console.error('Uso: node invocar-agente-mqtt.js <agent_name> <project_id> "<task>" [--timeout-seg 300]');
  process.exit(1);
}

const BROKER = 'mqtt://127.0.0.1:1883';
const CORE = 'core-a';
const request_id = 'cli-' + Date.now();
const client = mqtt.connect(BROKER, { connectTimeout: 5000 });
const started = Date.now();

const timeout = setTimeout(() => {
  console.log(`\n⏰ TIMEOUT (${Math.round((Date.now() - started) / 1000)}s) — sin response/failed`);
  client.end(true);
  process.exit(2);
}, timeoutSeg);

client.on('connect', () => {
  client.subscribe([
    `core/${CORE}/events/agent/execute/response`,
    `core/${CORE}/events/agent/execute/failed`,
    `core/${CORE}/events/agent/execute/progress`,
  ], () => {
    console.log(`📡 request_id=${request_id} · agente=${agent_name} · proyecto=${project_id}`);
    const envelope = {
      event_id: crypto.randomUUID(),
      event_type: 'agent.execute.request',
      timestamp: new Date().toISOString(),
      source: { core_id: 'hermes-cli', module_id: 'hermes' },   // ≠ core-a o se ignora
      data: { request_id, agent_name, project_id, user_id: 'default', task, context: {} },
      metadata: { origen: 'invocar-agente-mqtt.js' }
    };
    client.publish(`core/${CORE}/events/agent/execute/request`, JSON.stringify(envelope), { qos: 1 });
    console.log('🚀 PUBLICADO agent.execute.request');
  });
});

client.on('message', (topic, msg) => {
  let d;
  try { d = JSON.parse(msg.toString()); } catch { return; }
  const rel = topic.replace(`core/${CORE}/events/`, '');
  const data = d.data !== undefined ? d.data : d;

  if (rel.includes('progress')) {
    console.log(`   ⏳ [${Math.round((Date.now() - started) / 1000)}s] ${data.step || data.message || ''}`);
    return;
  }
  if (rel.includes('response') || rel.includes('failed')) {
    if (data.request_id && data.request_id !== request_id) return;
    clearTimeout(timeout);
    console.log(`\n📦 ${rel.includes('failed') ? 'FAILED' : 'RESPONSE'} (${Math.round((Date.now() - started) / 1000)}s)`);
    console.log(JSON.stringify(data, null, 1).slice(0, 2000));
    if (data.verificado !== undefined) {
      console.log(`\n🎯 VEREDICTO: verificado=${data.verificado} · motivo=${(data.veredicto || {}).motivo}`);
      if (data.veredicto && data.veredicto.reglas) {
        for (const r of data.veredicto.reglas) console.log(`   · ${r.regla}: ${r.ok ? 'OK' : 'FALLA'} — ${r.detalle}`);
      }
    }
    if (data.error) console.log(`   error: ${data.error.code} — ${data.error.message}`);
    if (data.pasos) console.log(`   bitácora: ${data.pasos.length} pasos`);
    client.end(true);
    process.exit(data.verificado === true ? 0 : 1);
  }
});

client.on('error', e => { console.error('MQTT ERROR:', e.message); clearTimeout(timeout); process.exit(3); });

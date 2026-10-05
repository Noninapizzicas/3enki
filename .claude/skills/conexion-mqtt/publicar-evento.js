#!/usr/bin/env node
/**
 * publicar-evento.js — publica un EVENTO de dominio al bus real de Enki.
 * topic: core/+/events/<evento>   (el mismo que usa el eventbus al hacer publish)
 * Uso: node publicar-evento.js <evento> '<json>'
 */
const mqtt = require('mqtt');
const BROKER = process.env.ENKI_BROKER || 'wss://enki-ai.online/mqtt';
const [evento, datosJson] = process.argv.slice(2);
if (!evento) { console.error('uso: node publicar-evento.js <evento> \'<json>\''); process.exit(1); }

const datos = datosJson ? JSON.parse(datosJson) : {};
// El envelope que espera el bus: exige `source.core_id` ANIDADO (no plano)
// y los 5 campos requeridos: event_id · event_type · timestamp · source · data.
const envelope = {
  event_type: evento,
  event_id: require('crypto').randomUUID(),
  timestamp: new Date().toISOString(),
  source: { core_id: 'external' },      // ← 'external' = proceso externo; ANIDADO
  data: datos
};
const topic = 'core/*/events/' + evento;
const c = mqtt.connect(BROKER, { clientId: 'enki-pub-' + Date.now(), connectTimeout: 8000, reconnectPeriod: 0 });
c.on('connect', () => {
  c.publish(topic, JSON.stringify(envelope), { qos: 1 }, (err) => {
    console.log('publicado en', topic, err ? '❌ ' + err.message : '✅');
    setTimeout(() => { c.end(true); process.exit(err ? 1 : 0); }, 700);
  });
});
c.on('error', (e) => { console.error('error mqtt:', e.message); process.exit(1); });
setTimeout(() => { console.error('timeout'); process.exit(1); }, 10000);

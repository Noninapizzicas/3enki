#!/usr/bin/env node
/**
 * VERIFICAR UN MÓDULO DE ENKI EN VIVO — patrón de 2 clients MQTT.
 *
 * Client A (anónimo) PUBLICAR el request (sus publishes pasan el bus-guard).
 * Client B (observe con enki:cert:<b64 del ca-cert>) SUSCRIBIR a core/# y
 * capturar la respuesta filtrando por request_id.
 *
 * Claves (resueltas en vivo, 2026-08-06):
 *  - El core PUBLICAR las respuestas en `core/*/events/<evento>` — el `*` es
 *    LITERAL en el topic. Suscribirse a `core/#` (o `core/*/events/#`).
 *  - Passwords planos NO valen; solo `enki:token:<jws>` o `enki:cert:<b64pem>`.
 *
 * Uso:
 *   node verificar-modulo-enki.js <event_type_request> <topic_con_/ > <payload_json>
 *   node verificar-modulo-enki.js pipeline.obtener.request pipeline/obtener/request \
 *     '{"request_id":"x1","nombre":"construir-modulos"}'
 */
const mqtt = require('/opt/enki/node_modules/mqtt');
const crypto = require('crypto');
const fs = require('fs');

const [eventType, topicSlash, payloadJson] = process.argv.slice(2);
if (!eventType || !topicSlash || !payloadJson) {
  console.error('uso: verificar-modulo-enki.js <event_type> <topic_con_slashes> <payload_json>');
  process.exit(2);
}
const payload = JSON.parse(payloadJson);
const request_id = payload.request_id || ('verif-' + Date.now());
payload.request_id = request_id;
const timeoutMs = Number(process.env.TIMEOUT_MS || 15000);

const sub = mqtt.connect('mqtt://127.0.0.1:1883', {
  connectTimeout: 5000, username: 'enki',
  password: `enki:cert:${fs.readFileSync('/opt/enki/data/ca/ca-cert.pem').toString('base64')}`
});
const pub = mqtt.connect('mqtt://127.0.0.1:1883', { connectTimeout: 5000 });

let subListo = false, pubListo = false;
const disparar = () => {
  if (subListo && pubListo) {
    const envelope = {
      event_id: crypto.randomUUID(), event_type: eventType,
      timestamp: new Date().toISOString(),
      source: { core_id: 'hermes-cli', module_id: 'hermes' }, // NUNCA core-a
      data: payload
    };
    console.log(`📤 publish ${eventType} → core/core-a/events/${topicSlash}`);
    pub.publish(`core/core-a/events/${topicSlash}`, JSON.stringify(envelope), { qos: 1 });
    setTimeout(() => pub.end(true), 4000);
  }
};

sub.on('connect', () => {
  sub.subscribe('core/#', (err) => {
    if (err) { console.error('SUB ERROR:', err.message); process.exit(2); }
    console.log('📡 observe suscrito a core/#');
    subListo = true; disparar();
  });
});
pub.on('connect', () => { pubListo = true; disparar(); });

const to = setTimeout(() => {
  console.log('⏰ TIMEOUT — el módulo no respondió (¿cargado? ¿topic/event_type correctos?)');
  console.log('   → verificar en el log: grep "' + eventType + '" /opt/enki/data/logs/current.jsonl | tail');
  sub.end(true); process.exit(1);
}, timeoutMs);

sub.on('message', (topic, msg) => {
  let d; try { d = JSON.parse(msg.toString()); } catch { return; }
  const data = d.data !== undefined ? d.data : d;
  const et = d.event_type || topic.split('/').pop();
  if (data.request_id === request_id && et.startsWith(eventType.replace(/\.request$/, ''))) {
    clearTimeout(to);
    console.log(`✅ RESPUESTA REAL (topic ${topic}, event_type ${et}):`);
    console.log(JSON.stringify(data, null, 2));
    sub.end(true); process.exit(0);
  }
});

sub.on('error', e => { console.error('SUB ERROR:', e.message); process.exit(3); });
pub.on('error', e => { console.error('PUB ERROR:', e.message); process.exit(3); });

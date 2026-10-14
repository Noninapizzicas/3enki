#!/usr/bin/env node
/**
 * publicar-evento.js — publica un EVENTO DE DOMINIO en el bus de Enki.
 *
 * Topic: core (comodin) events <dominio> <evento>  — el mismo que usa el bus al hacer broadcast
 * Envelope canonico: { event_id, event_type, timestamp, source:{core_id}, data }
 *
 * Uso:
 *   node publicar-evento.js <event_type> '<json_data>' [project_id]
 * Ej:
 *   node publicar-evento.js contabilidad.hecho_recibido '{"hecho":{...}}' <pid>
 */
'use strict';
const crypto = require('crypto');

const EVENT = process.argv[2];
const DATA = JSON.parse(process.argv[3] || '{}');
const PROJ = process.argv[4] || null;
if (!EVENT) { console.error('falta el event_type'); process.exit(1); }

const BROKER = process.env.ENKI_BROKER || 'wss://enki-ai.online/mqtt';
const mqtt = require('mqtt');
const client = mqtt.connect(BROKER, { connectTimeout: 10000 });

const topic = `core/*/events/${EVENT}`;
const envelope = {
  event_id: crypto.randomUUID(),
  event_type: EVENT,
  timestamp: new Date().toISOString(),
  source: { core_id: 'external' },
  data: { project_id: PROJ, ...DATA }
};

client.on('connect', async () => {
  console.log(`[conectado] publicando en ${topic}`);
  await client.publishAsync(topic, JSON.stringify(envelope), { qos: 1 });
  console.log(JSON.stringify(envelope, null, 2));
  setTimeout(() => { client.end(); process.exit(0); }, 1200);
});
client.on('error', (e) => { console.error('MQTT error:', e.message); process.exit(1); });

#!/usr/bin/env node
/**
 * probar-rpc-bus.js — prueba si un módulo PREGUNTA responde POR EL BUS.
 * Publica <slug>.<op>.request al bus y escucha <slug>.<op>.response.
 */
'use strict';
const crypto = require('crypto');
const mqtt = require('mqtt');

const DOM = process.argv[2];   // ej: normalizador-hecho
const OP  = process.argv[3];   // ej: entrar
const DATA = JSON.parse(process.argv[4] || '{}');

const BROKER = process.env.ENKI_BROKER || 'wss://enki-ai.online/mqtt';
const client = mqtt.connect(BROKER, { connectTimeout: 10000 });

const reqEvent = `${DOM}.${OP}.request`;
const resEvent = `${DOM}.${OP}.response`;
// El topic convierte los PUNTOS en BARRAS: <dom>.<op>.request → core/*/events/<dom>/<op>/request
const aBarras = (ev) => { const p = ev.split('.'); return `core/*/events/${p[0]}/${p.slice(1).join('/')}`; };
const reqTopic = aBarras(reqEvent);
const resTopic = aBarras(resEvent).replace('core/*/', 'core/+/');

const requestId = crypto.randomUUID();

client.on('connect', async () => {
  await client.subscribeAsync(resTopic, { qos: 1 });
  console.log(`[conectado] pido ${reqEvent} → espero ${resEvent}`);
  await client.publishAsync(reqTopic, JSON.stringify({
    event_id: crypto.randomUUID(),
    event_type: reqEvent,
    timestamp: new Date().toISOString(),
    source: { core_id: 'external' },
    data: { request_id: requestId, ...DATA }
  }), { qos: 1 });

  const t = setTimeout(() => { console.log('❌ TIMEOUT — nadie respondió por el bus'); client.end(); process.exit(1); }, 8000);
  client.on('message', (topic, msg) => {
    clearTimeout(t);
    console.log(`✅ RESPUESTA por el bus  (${topic}):`);
    try { console.log(JSON.stringify(JSON.parse(msg.toString()).data, null, 2).slice(0, 900)); }
    catch { console.log(msg.toString().slice(0, 900)); }
    client.end(); process.exit(0);
  });
});
client.on('error', (e) => { console.error('MQTT error:', e.message); process.exit(1); });

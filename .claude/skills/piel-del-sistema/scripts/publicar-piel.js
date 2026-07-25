#!/usr/bin/env node
/**
 * publicar-piel.js — REFLEJO de piel-del-sistema, Fase 4.
 *
 * Recibe un string HTML y lo escribe en www/index.html del proyecto.
 *
 * Tres modos:
 *   MQTT  → escribe vía fs.write RPC (Enki vivo)
 *   LOCAL → escribe en disco
 *   STDOUT → escupe el HTML por stdout (para que el runner decida)
 *
 * Uso:
 *   cat index.html | node publicar-piel.js <project_id>        # vía MQTT
 *   cat index.html | node publicar-piel.js --local <dir>       # vía fs
 *   cat index.html | node publicar-piel.js --stdout            # solo stdout
 *   node publicar-piel.js --check <project_id>                 # test de conexión
 */

'use strict';

const MODE = process.argv[2];
const ARG  = process.argv[3];

// ── MODO LOCAL ──
function publicarLocal(html, dir) {
  const fs = require('fs');
  const path = require('path');
  const outDir = path.resolve(dir || '.', 'www');
  const outFile = path.join(outDir, 'index.html');

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, html, 'utf-8');

  const stat = fs.statSync(outFile);
  return { ok: true, path: outFile, bytes: stat.size };
}

// ── MODO MQTT ──
async function publicarMqtt(html, projectId) {
  let mqtt;
  try { mqtt = require('mqtt'); }
  catch { return { ok: false, error: 'mqtt no disponible' }; }

  const BROKER = process.env.ENKI_BROKER || 'wss://enki-ai.online/mqtt';
  const client = mqtt.connect(BROKER, { connectTimeout: 10000 });

  await new Promise(r => client.on('connect', r));

  const requestId = require('crypto').randomUUID();
  const topic = 'ui/request/fs/write';
  const respTopic = `ui/response/${requestId}`;

  const result = await new Promise((res, rej) => {
    const t = setTimeout(() => { client.unsubscribe(respTopic); res({ ok: false, error: 'timeout' }); }, 15000);

    client.subscribe(respTopic, () => {
      client.on('message', (t, m) => {
        if (t === respTopic) {
          clearTimeout(t);
          client.unsubscribe(respTopic);
          try { res(JSON.parse(m.toString())); }
          catch { res({ ok: false, error: 'respuesta inválida' }); }
        }
      });
      client.publish(topic, JSON.stringify({
        request_id: requestId,
        data: { path: `/www/index.html`, content: html, project_id: projectId }
      }));
    });
  });

  client.end();
  return result;
}

// ── CHECK ──
async function check(projectId) {
  let mqtt;
  try { mqtt = require('mqtt'); }
  catch { console.log('mqtt no disponible'); return; }

  const BROKER = process.env.ENKI_BROKER || 'wss://enki-ai.online/mqtt';
  const client = mqtt.connect(BROKER, { connectTimeout: 10000 });
  await new Promise(r => client.on('connect', r));

  const requestId = require('crypto').randomUUID();
  const topic = 'ui/request/fs/write';
  const respTopic = `ui/response/${requestId}`;

  const testContent = 'ok';
  const result = await new Promise((res) => {
    const t = setTimeout(() => { client.unsubscribe(respTopic); res({ ok: false, error: 'timeout' }); }, 10000);
    client.subscribe(respTopic, () => {
      client.on('message', (t, m) => {
        if (t === respTopic) {
          clearTimeout(t);
          client.unsubscribe(respTopic);
          try { res(JSON.parse(m.toString())); }
          catch { res({ ok: false, error: 'respuesta inválida' }); }
        }
      });
      client.publish(topic, JSON.stringify({
        request_id: requestId,
        data: { path: `/www/piel-check.txt`, content: testContent, project_id: projectId }
      }));
    });
  });

  client.end();
  console.log('fs.write:', result.status === 200 || result.status === 201 ? '✅ OK' : '❌ FALLÓ', result);
}

// ── MAIN ──
let html = '';
process.stdin.on('data', c => html += c);
process.stdin.on('end', async () => {
  if (MODE === '--check') {
    await check(ARG);
    return;
  }

  if (MODE === '--stdout') {
    process.stdout.write(html);
    return;
  }

  if (MODE === '--local') {
    const r = publicarLocal(html, ARG);
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  if (MODE && !MODE.startsWith('--')) {
    const r = await publicarMqtt(html, MODE);
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  // Sin modo: auto-detectar
  if (process.env.PROJECT_ID) {
    const r = await publicarMqtt(html, process.env.PROJECT_ID);
    console.log(JSON.stringify(r, null, 2));
  } else {
    const r = publicarLocal(html, '.');
    console.log(JSON.stringify(r, null, 2));
  }
});

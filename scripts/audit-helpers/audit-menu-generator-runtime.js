#!/usr/bin/env node
/**
 * audit-menu-generator-runtime — Fase 7b de la migracion menu-generator blueprint v8.0.0
 *
 * End-to-end contra VPS (wss://enki-ai.online/mqtt). Crea conversacion en
 * page=menu-generator, pide generar carta desde texto, captura eventos clave
 * del bus, verifica persistencia via carta-manager.save y reporta.
 *
 * Uso:
 *   node scripts/audit-helpers/audit-menu-generator-runtime.js
 *
 * Variables de entorno:
 *   AUDIT_BROKER       URL del broker MQTT (default wss://enki-ai.online/mqtt)
 *   AUDIT_PROJECT_ID   UUID del proyecto donde crear la conversacion
 *   AUDIT_PROVIDER     provider LLM (default deepseek)
 *   AUDIT_MODEL        modelo LLM (default deepseek-chat)
 *   AUDIT_TIMEOUT_MS   timeout total (default 90000)
 *
 * NOTA estado 2026-05-25: la primera ejecucion contra el VPS detecto que
 * el endpoint ui/request/conversation/create devuelve UNKNOWN_ERROR por
 * /opt/enki/db inexistente (SQLite path roto en infraestructura VPS, no
 * en el modulo menu-generator). El bus y el llm-flow funcionan; la
 * creacion de conversacion bloquea por sqlite. Re-ejecutar este audit
 * cuando VPS este sano.
 */
'use strict';
const mqtt = require('mqtt');
const crypto = require('crypto');

const BROKER = process.env.AUDIT_BROKER || 'wss://enki-ai.online/mqtt';
const PROJECT_ID = process.env.AUDIT_PROJECT_ID || '3e0082d4-35b5-47f6-b2ad-f2f22e1a4108'; // Sistema
const PAGE_ID = 'menu-generator';
const PROVIDER = process.env.AUDIT_PROVIDER || 'deepseek';
const MODEL = process.env.AUDIT_MODEL || 'deepseek-chat';
const TIMEOUT_MS = parseInt(process.env.AUDIT_TIMEOUT_MS || '90000', 10);

const TEST_NAME = `SmokeBlueprintV8_${Date.now()}`;
const TEST_TEXT = `Carta de prueba ${TEST_NAME}.

ENTRANTES
- Aceitunas marinadas con piel de naranja 3.50
- Huevos rotos con jamon y trufa 8.00

PIZZAS
- Margarita: tomate, mozzarella, albahaca 10.00
- Diavola: tomate, mozzarella, salame picante 12.50
`;

const buildTopic = (et) => { const p = et.split('.'); return 'core/*/events/' + p[0] + (p.length > 1 ? '/' + p.slice(1).join('/') : ''); };
const subTopic = (et) => { const p = et.split('.'); return 'core/+/events/' + p[0] + (p.length > 1 ? '/' + p.slice(1).join('/') : ''); };
const env = (et, d) => ({ event_id: crypto.randomUUID(), event_type: et, timestamp: new Date().toISOString(), source: { core_id: 'audit-menu-generator' }, data: d, metadata: {} });

const CORRELATION_ID = crypto.randomUUID();

const captured = {
  menu_progress: [],
  menu_failed: [],
  carta_generar_terminada: [],
  carta_save_request_legacy: [],
  carta_actualizada: [],
  carta_generar_iniciada: [],
  carta_generar_fallida: [],
  ai_chat_response: null,
  ai_chat_failed: null,
  chat_assistant_saved: null,
  tool_calls_invocados: []
};

let convId = null;
let userMsgId = crypto.randomUUID();
let sendReqId = crypto.randomUUID();

function ts() { return new Date().toISOString().slice(11, 23); }
function log(emoji, msg) { console.log(`[${ts()}] ${emoji} ${msg}`); }

(async () => {
  const c = mqtt.connect(BROKER, {
    clientId: 'audit-mg-' + Date.now(),
    connectTimeout: 8000,
    reconnectPeriod: 0,
    protocolVersion: 4
  });

  await new Promise((res, rej) => { c.on('connect', res); c.on('error', rej); setTimeout(() => rej(new Error('connect timeout')), 10000); });
  log('OK', `conectado a ${BROKER}`);

  // Subscribe a TODOS los eventos relevantes ANTES de publicar nada.
  const subs = [
    'menu.generation.progress',
    'menu.generation.failed',
    'carta.generar.terminada',         // canonico v8.1+ (fire-and-forget)
    'carta-manager.save.request',      // legacy v8.0 (RPC roto — detectar si VPS desactualizado)
    'carta.actualizada',
    'carta.generar.iniciada',
    'carta.generar.fallida',
    'ai.chat.response',
    'ai.chat.failed',
    'chat.assistant.saved'
  ];
  await Promise.all(subs.map(et => new Promise((res) => c.subscribe(subTopic(et), () => res()))));
  log('OK', `subscribed a ${subs.length} eventos del bus`);

  const createReqId = crypto.randomUUID();
  const createTopic = 'ui/response/' + createReqId;
  await new Promise((res) => c.subscribe(createTopic, () => res()));

  c.on('message', (topic, msg) => {
    let payload;
    try { payload = JSON.parse(msg.toString()); } catch { return; }

    // UI response (creacion conversacion)
    if (topic === createTopic) {
      if (payload.data && payload.data.conversation_id && !convId) {
        convId = payload.data.conversation_id;
        log('OK', `conversation_id capturada: ${convId}`);
      }
      return;
    }

    const ev = payload.event_type;
    const data = payload.data || {};

    if (ev === 'menu.generation.progress') { captured.menu_progress.push(data); log('->', `menu.generation.progress step=${data.step}`); }
    else if (ev === 'menu.generation.failed') { captured.menu_failed.push(data); log('X', `menu.generation.failed: ${JSON.stringify(data.error)}`); }
    else if (ev === 'carta.generar.terminada') { captured.carta_generar_terminada.push(data); log('->', `carta.generar.terminada (project=${data.project_id?.slice(0,8)}, carta=${data.carta?.meta?.nombre})`); }
    else if (ev === 'carta-manager.save.request') { captured.carta_save_request_legacy.push(data); log('!!', `LEGACY carta-manager.save.request — VPS sigue corriendo blueprint v8.0.0, no v8.1.0`); }
    else if (ev === 'carta.actualizada') { captured.carta_actualizada.push(data); log('OK', `carta.actualizada id=${data.id || data.carta?.meta?.id}`); }
    else if (ev === 'carta.generar.iniciada') { captured.carta_generar_iniciada.push(data); log('->', `carta.generar.iniciada`); }
    else if (ev === 'carta.generar.fallida') { captured.carta_generar_fallida.push(data); log('X', `carta.generar.fallida: ${JSON.stringify(data.error)}`); }
    else if (ev === 'ai.chat.response') {
      if (data.conversation_id === convId || !convId) {
        captured.ai_chat_response = data;
        const tools = data.tool_calls || [];
        captured.tool_calls_invocados = tools.map(t => t.function?.name || t.name || '?');
        log('OK', `ai.chat.response tools=[${captured.tool_calls_invocados.join(',')}]`);
      }
    }
    else if (ev === 'ai.chat.failed') {
      if (data.conversation_id === convId || !convId) {
        captured.ai_chat_failed = data;
        log('X', `ai.chat.failed: ${JSON.stringify(data.error)}`);
      }
    }
    else if (ev === 'chat.assistant.saved') {
      if (data.conversation_id === convId) {
        captured.chat_assistant_saved = data;
        log('OK', `chat.assistant.saved (${(data.content || '').length} chars)`);
      }
    }
  });

  // STEP 1: crear conversacion via UI direct
  log('--', 'STEP 1: crear conversacion');
  c.publish('ui/request/conversation/create', JSON.stringify({
    request_id: createReqId,
    data: {
      project_id: PROJECT_ID,
      title: `audit-menu-gen-${TEST_NAME}`,
      user_id: 'audit-test'
    }
  }));

  // Esperar conv_id
  await new Promise((res, rej) => {
    const start = Date.now();
    const i = setInterval(() => {
      if (convId) { clearInterval(i); res(); }
      else if (Date.now() - start > 10000) { clearInterval(i); rej(new Error('timeout esperando conversation_id')); }
    }, 100);
  });

  // STEP 2: enviar mensaje pidiendo generar carta
  log('--', 'STEP 2: enviar mensaje (genera carta...)');
  const userMessage = `Genera una carta llamada "${TEST_NAME}" desde este texto:\n\n${TEST_TEXT}`;
  c.publish('ui/request/conversation/send', JSON.stringify({
    request_id: sendReqId,
    data: {
      conversation_id: convId,
      project_id: PROJECT_ID,
      user_id: 'audit-test',
      message_id: userMsgId,
      message: userMessage,
      page_id: PAGE_ID,
      correlation_id: CORRELATION_ID,
      settings: { provider: PROVIDER, model: MODEL }
    }
  }));

  // STEP 3: esperar respuesta o timeout
  log('--', `STEP 3: esperando respuesta del LLM (timeout ${TIMEOUT_MS}ms)...`);
  await new Promise((res) => {
    const start = Date.now();
    const i = setInterval(() => {
      const done = captured.chat_assistant_saved || captured.ai_chat_failed;
      const timedOut = Date.now() - start > TIMEOUT_MS;
      if (done || timedOut) { clearInterval(i); res(); }
    }, 500);
  });

  // Espera adicional 5s para capturar eventos eventual-consistency
  await new Promise(r => setTimeout(r, 5000));

  c.end();

  // STEP 4: reporte
  console.log('\n=================== REPORTE ===================');
  console.log(`Test: ${TEST_NAME}`);
  console.log(`Project: ${PROJECT_ID.slice(0, 8)}`);
  console.log(`Conv: ${convId?.slice(0, 8)}`);
  console.log(`Provider: ${PROVIDER}/${MODEL}`);
  console.log('');
  console.log('Eventos capturados:');
  console.log(`  menu.generation.progress: ${captured.menu_progress.length}`);
  console.log(`  menu.generation.failed: ${captured.menu_failed.length}`);
  console.log(`  carta.generar.terminada: ${captured.carta_generar_terminada.length}`);
  console.log(`  carta-manager.save.request (LEGACY v8.0): ${captured.carta_save_request_legacy.length}`);
  console.log(`  carta.actualizada: ${captured.carta_actualizada.length}`);
  console.log(`  carta.generar.iniciada: ${captured.carta_generar_iniciada.length}`);
  console.log(`  carta.generar.fallida: ${captured.carta_generar_fallida.length}`);
  console.log(`  chat.assistant.saved: ${captured.chat_assistant_saved ? 'SI' : 'NO'}`);
  console.log(`  ai.chat.failed: ${captured.ai_chat_failed ? 'SI' : 'NO'}`);
  console.log('');
  console.log(`Tools invocadas por LLM: [${captured.tool_calls_invocados.join(', ')}]`);
  const firstEvent = captured.carta_generar_terminada[0] || captured.carta_save_request_legacy[0];
  if (firstEvent) {
    console.log('');
    console.log('Primera carta emitida:');
    console.log(`  carta.meta.nombre: ${firstEvent.carta?.meta?.nombre}`);
    console.log(`  carta.categorias: ${firstEvent.carta?.categorias?.length || 0}`);
    console.log(`  carta.productos: ${firstEvent.carta?.productos?.length || 0}`);
    if (firstEvent.carta?.productos?.[0]) {
      const p = firstEvent.carta.productos[0];
      console.log(`  primer producto: ${p.nombre} (cat=${p.categoria}, precio=${p.precio}, ingredientes=${p.ingredientes?.length || 0})`);
    }
  }
  if (captured.carta_actualizada[0]) {
    console.log('');
    console.log(`Carta persistida: id=${captured.carta_actualizada[0].id || captured.carta_actualizada[0].carta?.meta?.id}`);
  }

  // Verificacion
  const passed = [];
  const failed = [];
  const check = (cond, label) => cond ? passed.push(label) : failed.push(label);

  check(captured.menu_progress.length >= 1, 'publica menu.generation.progress (step structuring)');
  check(captured.carta_generar_terminada.length >= 1, 'publica carta.generar.terminada fire-and-forget (v8.1 canonico)');
  check(captured.carta_save_request_legacy.length === 0, 'NO publica carta-manager.save.request legacy (RPC roto)');
  check(captured.carta_actualizada.length >= 1, 'persistencia confirmada via carta.actualizada (carta-manager._on_carta_generar_terminada reacciono)');
  check(!captured.ai_chat_failed, 'ai.chat NO falla');
  check(!captured.menu_failed.length, 'menu.generation NO falla');
  check(!captured.carta_generar_fallida.length, 'carta.generar NO falla');
  if (firstEvent) {
    const c = firstEvent.carta;
    check(c?.meta?.nombre === TEST_NAME || (c?.meta?.nombre || '').includes(TEST_NAME), `carta.meta.nombre = "${TEST_NAME}"`);
    check((c?.categorias?.length || 0) >= 1, 'carta.categorias[] >= 1');
    check((c?.productos?.length || 0) >= 1, 'carta.productos[] >= 1');
  }

  console.log('\n=================== CHECKS ===================');
  for (const p of passed) console.log(`  OK  ${p}`);
  for (const f of failed) console.log(`  XX  ${f}`);
  console.log(`\nTotal: ${passed.length} OK, ${failed.length} FAIL`);

  process.exit(failed.length === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL:', e.message); process.exit(2); });

#!/usr/bin/env node
/**
 * recetas-update-via-llm.js — Test end-to-end de las 3 operaciones
 * migradas a fs.edit en v1.5.0 (actualizar, revertir, _aplicar_coste_calculado).
 *
 * No prueba que el LLM publique los patches LITERALMENTE — prueba que el
 * resultado final del store es el esperado. La pregunta "el LLM tomo
 * libertad creativa con el shape de los patches?" es ortogonal: si el
 * resultado es correcto, infra+blueprint funcionan independientemente
 * de si la ruta exacta fue 3 patches o composicion mental.
 *
 * Flujo:
 *   1. Reset store con 2 recetas semilla.
 *   2. Crear conversacion en "Mi Proyecto" con page_id=recetas.
 *   3. Chat: "actualiza la receta R1, cambia porciones a 6 y dificultad a 3".
 *      Verifica: R1.porciones=6, R1.dificultad=3, R1.version=2,
 *                R1.history[0] tiene snapshot v1, R2 intacta.
 *   4. Chat: "revierte la receta R1 a la version 1".
 *      Verifica: R1.porciones=valor_v1, R1.dificultad=valor_v1,
 *                R1.version=3, R1.history tiene 2 snapshots, R2 intacta.
 *   5. Publish escandallo.coste.calculado para R2 con coste_total=3.5.
 *      Espera receta.actualizada con origen=escandallo.coste.calculado.
 *      Verifica: R2.coste_total=3.5, R2.version inchanged, R1 intacta.
 *
 * Uso:
 *   node tests/runtime-cases/recetas-update-via-llm.js \
 *     [--project-id <uuid>] [--broker wss://enki-ai.online/mqtt]
 *     [--provider <name>] [--model <id>] [--page-id recetas]
 *     [--turn-timeout-ms 90000]
 */

'use strict';

const mqtt   = require('mqtt');
const crypto = require('crypto');

const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
}
const PROJECT_ID = flag('project-id', '00939fa3-5ba7-40ab-803b-e6c21ea06359');
const BROKER     = flag('broker', 'wss://enki-ai.online/mqtt');
const PAGE_ID    = flag('page-id', 'recetas');
const PROVIDER   = flag('provider', null);
const MODEL      = flag('model', null);
const TURN_TIMEOUT_MS = parseInt(flag('turn-timeout-ms', '90000'), 10);
const PATH_STORE = '/recetas.json';

const R1_ID = 'cccccccc-1111-4cce-8111-cccccccccccc';
const R2_ID = 'dddddddd-2222-4ddd-8222-dddddddddddd';
const NOW0  = '2026-05-27T00:00:00.000Z';

const RECETA_R1 = {
  id: R1_ID,
  nombre: 'Pasta carbonara',
  descripcion: 'Pasta italiana clasica',
  ingredientes: [
    { nombre: 'spaghetti', cantidad: 200, unidad: 'g' },
    { nombre: 'huevos',    cantidad: 2,   unidad: 'unidades' },
    { nombre: 'panceta',   cantidad: 80,  unidad: 'g' }
  ],
  instrucciones: ['Cocer la pasta', 'Batir huevos', 'Mezclar'],
  porciones: 2,
  tiempo_min: 20,
  dificultad: 2,
  estado_operativo: 'en_servicio',
  fuente: 'manual',
  categorias: ['italiana'],
  etiquetas: ['rapida'],
  version: 1,
  history: [],
  campos_pendientes: [],
  incompleta: false,
  created_at: NOW0,
  updated_at: NOW0
};

const RECETA_R2 = {
  id: R2_ID,
  nombre: 'Ensalada cesar',
  descripcion: 'Clasica ensalada con pollo',
  ingredientes: [
    { nombre: 'lechuga romana', cantidad: 1, unidad: 'unidad' },
    { nombre: 'pollo',          cantidad: 150, unidad: 'g' }
  ],
  instrucciones: ['Lavar lechuga', 'Asar pollo', 'Mezclar'],
  porciones: 1,
  tiempo_min: 15,
  dificultad: 1,
  estado_operativo: 'en_servicio',
  fuente: 'manual',
  categorias: ['ensaladas'],
  etiquetas: [],
  version: 1,
  history: [],
  campos_pendientes: [],
  incompleta: false,
  created_at: NOW0,
  updated_at: NOW0
};

const STORE_INICIAL = {
  _version: '1.0',
  _updated_at: NOW0,
  recetas: [RECETA_R1, RECETA_R2],
  ingredientes_catalogo: []
};

const pending = new Map();
let client;

function publish(eventType, data) {
  const topic = 'core/*/events/' + eventType.replace(/\./g, '/');
  client.publish(topic, JSON.stringify({
    event_id: crypto.randomUUID(),
    event_type: eventType,
    timestamp: new Date().toISOString(),
    source: { core_id: 'test-recetas-update-via-llm' },
    data,
    metadata: {}
  }));
}

function request(eventType, data, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const responseEvent = eventType.endsWith('.request')
      ? eventType.slice(0, -'.request'.length) + '.response'
      : eventType + '.response';
    const timeout = setTimeout(() => {
      if (pending.has(requestId)) {
        pending.delete(requestId);
        reject(new Error(`Timeout waiting for ${responseEvent} (${timeoutMs}ms)`));
      }
    }, timeoutMs);
    pending.set(requestId, {
      resolve: (v) => { clearTimeout(timeout); resolve(v); },
      reject:  (e) => { clearTimeout(timeout); reject(e); }
    });
    publish(eventType, { ...data, request_id: requestId, project_id: PROJECT_ID });
  });
}

let failures = [];
function assert(cond, label) {
  if (cond) console.log('  ' + String.fromCharCode(10003) + ' ' + label);
  else { console.log('  ' + String.fromCharCode(10007) + ' ' + label); failures.push(label); }
}
function info(line) { console.log('  ' + String.fromCharCode(8226) + ' ' + line); }

async function readStore() {
  const r = await request('fs.read.request', { path: PATH_STORE });
  return { content: r.content, hash: r.hash, parsed: JSON.parse(r.content) };
}

async function resetStore() {
  await request('fs.write.request', {
    path: PATH_STORE,
    content: JSON.stringify(STORE_INICIAL, null, 2),
    encoding: 'utf-8'
  });
}

function createConversation(title) {
  return new Promise((resolve, reject) => {
    const reqId = crypto.randomUUID();
    const handler = (topic, msg) => {
      try {
        const env = JSON.parse(msg.toString());
        if (env.request_id !== reqId && (env.data || {}).request_id !== reqId) return;
        client.removeListener('message', handler);
        const convId = (env.data && env.data.conversation_id) || env.conversation_id;
        if (convId) resolve(convId);
        else reject(new Error('no conversation_id in response: ' + JSON.stringify(env).slice(0, 300)));
      } catch (_) {}
    };
    client.subscribe('ui/response/' + reqId, () => {
      client.on('message', handler);
      client.publish('ui/request/conversation/create', JSON.stringify({
        request_id: reqId,
        data: { project_id: PROJECT_ID, title, user_id: 'default', page_id: PAGE_ID }
      }));
    });
    setTimeout(() => reject(new Error('createConversation timeout')), 15000);
  });
}

function sendMessage(convId, message) {
  return new Promise((resolve, reject) => {
    const reqId = crypto.randomUUID();
    let savedPayload = null;
    const handler = (topic, msg) => {
      try {
        const env = JSON.parse(msg.toString());
        const data = env.data || {};
        if (topic.endsWith('ai/chat/failed') && data.conversation_id === convId) {
          client.removeListener('message', handler);
          reject(new Error('ai.chat.failed: ' + JSON.stringify(data).slice(0, 300)));
          return;
        }
        if (topic.endsWith('chat/assistant/saved') && data.conversation_id === convId) {
          savedPayload = data;
          client.removeListener('message', handler);
          resolve(savedPayload);
        }
      } catch (_) {}
    };
    client.subscribe(['core/+/events/chat/assistant/saved', 'core/+/events/ai/chat/failed'], () => {
      client.on('message', handler);
      const settings = {};
      if (PROVIDER) settings.provider = PROVIDER;
      if (MODEL) settings.model = MODEL;
      client.publish('ui/request/conversation/send', JSON.stringify({
        request_id: reqId,
        data: {
          project_id: PROJECT_ID,
          conversation_id: convId,
          message,
          user_id: 'default',
          channel: 'web',
          page_id: PAGE_ID,
          settings
        }
      }));
    });
    setTimeout(() => {
      client.removeListener('message', handler);
      reject(new Error(`sendMessage timeout (${TURN_TIMEOUT_MS}ms)`));
    }, TURN_TIMEOUT_MS);
  });
}

function waitForEvent(eventType, predicate, timeoutMs) {
  return new Promise((resolve, reject) => {
    const sub = 'core/+/events/' + eventType.replace(/\./g, '/');
    const handler = (topic, msg) => {
      try {
        const env = JSON.parse(msg.toString());
        if (env.event_type !== eventType) return;
        if (!predicate || predicate(env.data || {})) {
          client.removeListener('message', handler);
          resolve(env.data || {});
        }
      } catch (_) {}
    };
    client.subscribe(sub, () => client.on('message', handler));
    setTimeout(() => {
      client.removeListener('message', handler);
      reject(new Error(`waitForEvent ${eventType} timeout (${timeoutMs}ms)`));
    }, timeoutMs);
  });
}

async function main() {
  console.log('=== Test: recetas-update-via-llm ===');
  console.log('PROJECT_ID:', PROJECT_ID);
  console.log('PAGE_ID:   ', PAGE_ID);
  console.log('PROVIDER:  ', PROVIDER || '(default)');
  console.log('MODEL:     ', MODEL || '(default)');
  console.log('');

  client = mqtt.connect(BROKER, {
    clientId: 'test-recetas-llm-' + Date.now(),
    connectTimeout: 8000,
    reconnectPeriod: 0
  });
  await new Promise((res, rej) => {
    client.on('connect', res);
    client.on('error', rej);
    setTimeout(() => rej(new Error('mqtt connect timeout')), 10000);
  });
  client.subscribe('core/+/events/fs/+/response');
  client.on('message', (topic, msg) => {
    try {
      const envelope = JSON.parse(msg.toString());
      const data = envelope.data || {};
      const reqId = data.request_id;
      if (!reqId || !pending.has(reqId)) return;
      const { resolve, reject } = pending.get(reqId);
      pending.delete(reqId);
      if (data.error) reject(data.error);
      else resolve(data);
    } catch (_) {}
  });

  try {
    // ============================================================
    // PASO 1 — Reset + crear conversacion
    // ============================================================
    console.log('PASO 1 — Reset store + crear conversacion');
    await resetStore();
    info('store reseteado a 2 recetas semilla');
    const convId = await createConversation('audit-recetas-fs-edit-' + Date.now());
    info('conversation_id: ' + convId);
    console.log('');

    // ============================================================
    // PASO 2 — actualizar
    // ============================================================
    console.log('PASO 2 — actualizar via chat');
    const msg1 = `Actualiza la receta con id ${R1_ID}. Cambia porciones a 6 y dificultad a 3. No toques nada mas.`;
    info('msg: ' + msg1);
    const t0 = Date.now();
    const resp1 = await sendMessage(convId, msg1);
    info(`turno completo en ${((Date.now()-t0)/1000).toFixed(1)}s`);

    let s = await readStore();
    const r1_v2 = s.parsed.recetas.find(r => r.id === R1_ID);
    const r2_intact_a = s.parsed.recetas.find(r => r.id === R2_ID);

    assert(r1_v2 && r1_v2.porciones === 6, `R1.porciones === 6 (real: ${r1_v2 && r1_v2.porciones})`);
    assert(r1_v2 && r1_v2.dificultad === 3, `R1.dificultad === 3 (real: ${r1_v2 && r1_v2.dificultad})`);
    assert(r1_v2 && r1_v2.version === 2, `R1.version === 2 (real: ${r1_v2 && r1_v2.version})`);
    assert(r1_v2 && Array.isArray(r1_v2.history) && r1_v2.history.length === 1,
      `R1.history tiene 1 snapshot (real: ${r1_v2 && r1_v2.history && r1_v2.history.length})`);
    if (r1_v2 && r1_v2.history && r1_v2.history[0]) {
      assert(r1_v2.history[0].porciones === 2, `R1.history[0].porciones === 2 (valor previo)`);
      assert(r1_v2.history[0].dificultad === 2, `R1.history[0].dificultad === 2 (valor previo)`);
    }
    assert(r1_v2 && r1_v2.nombre === RECETA_R1.nombre, 'R1.nombre intacto (no en cambios)');
    assert(r1_v2 && Array.isArray(r1_v2.ingredientes) && r1_v2.ingredientes.length === RECETA_R1.ingredientes.length,
      'R1.ingredientes intactos (no en cambios)');
    assert(r2_intact_a && r2_intact_a.version === 1, 'R2.version === 1 (no se toca)');
    assert(r2_intact_a && r2_intact_a.porciones === RECETA_R2.porciones, 'R2.porciones intacto');
    assert(s.parsed.recetas.length === 2, 'siguen 2 recetas en el store');
    console.log('');

    // ============================================================
    // PASO 3 — revertir
    // ============================================================
    console.log('PASO 3 — revertir via chat');
    const msg2 = `Revierte la receta con id ${R1_ID} a la version 1.`;
    info('msg: ' + msg2);
    const t1 = Date.now();
    await sendMessage(convId, msg2);
    info(`turno completo en ${((Date.now()-t1)/1000).toFixed(1)}s`);

    s = await readStore();
    const r1_v3 = s.parsed.recetas.find(r => r.id === R1_ID);
    const r2_intact_b = s.parsed.recetas.find(r => r.id === R2_ID);

    assert(r1_v3 && r1_v3.version === 3, `R1.version === 3 tras revertir (real: ${r1_v3 && r1_v3.version})`);
    assert(r1_v3 && r1_v3.porciones === 2, `R1.porciones === 2 (revertido al v1) (real: ${r1_v3 && r1_v3.porciones})`);
    assert(r1_v3 && r1_v3.dificultad === 2, `R1.dificultad === 2 (revertido al v1) (real: ${r1_v3 && r1_v3.dificultad})`);
    assert(r1_v3 && Array.isArray(r1_v3.history) && r1_v3.history.length === 2,
      `R1.history tiene 2 snapshots (real: ${r1_v3 && r1_v3.history && r1_v3.history.length})`);
    assert(r2_intact_b && r2_intact_b.version === 1 && r2_intact_b.porciones === RECETA_R2.porciones,
      'R2 intacta tras revertir');
    console.log('');

    // ============================================================
    // PASO 4 — _aplicar_coste_calculado via evento directo
    // ============================================================
    console.log('PASO 4 — _aplicar_coste_calculado via evento escandallo.coste.calculado');
    const corrId = crypto.randomUUID();
    const evento_coste = {
      receta_id: R2_ID,
      project_id: PROJECT_ID,
      coste_total: 3.5,
      coste_porcion: 3.5,
      coste_actualizado_at: new Date().toISOString(),
      postcode_usado: '28001',
      fuentes_precios: { 'lechuga romana': 'mercadona', 'pollo': 'mercadona' },
      ingredientes_detalle: [
        { nombre: 'lechuga romana', cantidad: 1, unidad: 'unidad', precio_unitario: 1.5, coste: 1.5 },
        { nombre: 'pollo',          cantidad: 150, unidad: 'g',  precio_unitario: 0.013, coste: 2.0 }
      ],
      ingredientes_sin_precio: [],
      correlation_id: corrId,
      timestamp: new Date().toISOString()
    };

    info('publicando escandallo.coste.calculado para R2 (coste_total=3.5)');
    const waitReceta = waitForEvent(
      'receta.actualizada',
      (d) => d.receta_id === R2_ID && d.origen === 'escandallo.coste.calculado',
      45000
    );
    publish('escandallo.coste.calculado', evento_coste);
    let actualizadaEvent;
    try {
      actualizadaEvent = await waitReceta;
      info('receta.actualizada recibida: campos_actualizados=' + JSON.stringify(actualizadaEvent.campos_actualizados));
    } catch (err) {
      console.log('  ' + String.fromCharCode(10007) + ' receta.actualizada NO llego (timeout 45s)');
      failures.push('_aplicar_coste_calculado no publica receta.actualizada: ' + err.message);
    }

    s = await readStore();
    const r2_con_coste = s.parsed.recetas.find(r => r.id === R2_ID);
    const r1_intact_c = s.parsed.recetas.find(r => r.id === R1_ID);

    assert(r2_con_coste && r2_con_coste.coste_total === 3.5,
      `R2.coste_total === 3.5 (real: ${r2_con_coste && r2_con_coste.coste_total})`);
    assert(r2_con_coste && r2_con_coste.coste_porcion === 3.5,
      `R2.coste_porcion === 3.5 (real: ${r2_con_coste && r2_con_coste.coste_porcion})`);
    assert(r2_con_coste && r2_con_coste.version === 1,
      `R2.version NO se bumpea (real: ${r2_con_coste && r2_con_coste.version})`);
    assert(r2_con_coste && r2_con_coste.porciones === RECETA_R2.porciones,
      'R2 campos no-coste intactos (porciones)');
    assert(r1_intact_c && r1_intact_c.version === 3 && r1_intact_c.porciones === 2,
      'R1 intacta tras aplicar coste a R2 (sigue en estado del revertir)');
    console.log('');

    // ============================================================
    // RESULTADO
    // ============================================================
    if (failures.length === 0) {
      console.log('=== PASS — actualizar + revertir + _aplicar_coste_calculado end-to-end ===');
      console.log('Las 3 operaciones migradas a fs.edit producen el resultado esperado');
      console.log('vista desde el bus + chat real. Las recetas no-modificadas estan intactas.');
      process.exit(0);
    } else {
      console.log('=== FAIL — alguna operacion no produce el resultado esperado ===');
      for (const f of failures) console.log('  - ' + f);
      console.log('');
      console.log('Estado final del store:');
      const finalS = await readStore();
      console.log(JSON.stringify(finalS.parsed, null, 2).slice(0, 2000));
      process.exit(1);
    }
  } catch (err) {
    console.log('');
    console.log('=== ERROR INESPERADO ===');
    console.log(err && err.message ? err.message : JSON.stringify(err));
    if (err && err.stack) console.log(err.stack);
    process.exit(2);
  } finally {
    client.end();
  }
}

main();

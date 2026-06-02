#!/usr/bin/env node
/**
 * viabilidad-evaluar-con-caminos.js — Test end-to-end de la feature "caminos"
 * del blueprint viabilidad v1.2.0 (paso 4b: generar 0-3 caminos al evaluar).
 *
 * El blueprint es LLM-runtime: evaluar se invoca via chat (page_id=viabilidad)
 * y el LLM lee el blueprint, delega el coste a escandallo, construye el
 * expediente con caminos y publica viabilidad.evaluacion.completada. Este test
 * NO prueba el texto literal de los caminos (lo redacta el LLM por caso) —
 * prueba la DISCIPLINA del paso 4b:
 *
 *   Caso 1 (margen apretado): pvp bajo -> veredicto con advertencias / no_viable
 *     y caminos.length >= 1, cada camino { titulo, prompt } con el prompt
 *     mencionando el nombre del producto (datos del expediente, no vacio).
 *   Caso 2 (rentable redondo): pvp alto -> veredicto viable y caminos = []
 *     (no_inventes_datos: no rellenar por rellenar).
 *   Caso 3 (por receta_id sin nombre): nombre_idea se resuelve via
 *     recetas.obtener (no inventado) -> expediente.input.nombre === nombre real.
 *
 * Cross-check transversal: el evento viabilidad.evaluacion.completada publicado
 * NO incluye el campo caminos (viven solo en el expediente persistido).
 *
 * Uso:
 *   node tests/runtime-cases/viabilidad-evaluar-con-caminos.js \
 *     [--project-id <uuid>] [--broker wss://enki-ai.online/mqtt]
 *     [--provider <name>] [--model <id>] [--page-id viabilidad]
 *     [--turn-timeout-ms 120000]
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
const PAGE_ID    = flag('page-id', 'viabilidad');
const PROVIDER   = flag('provider', null);
const MODEL      = flag('model', null);
const TURN_TIMEOUT_MS = parseInt(flag('turn-timeout-ms', '120000'), 10);

const PATH_VIABILIDAD = '/viabilidad.json';
const PATH_RECETAS    = '/recetas.json';

// Receta semilla para el caso 3 (evaluar por receta_id sin pasar nombre).
const RECETA_ID = 'eeeeeeee-3333-4eee-8333-eeeeeeeeeeee';
const RECETA_NOMBRE = 'Croqueta de prueba';
const NOW0 = '2026-06-01T00:00:00.000Z';

const RECETA_SEMILLA = {
  id: RECETA_ID,
  nombre: RECETA_NOMBRE,
  descripcion: 'Receta semilla para test de viabilidad',
  ingredientes: [
    { nombre: 'harina',  cantidad: 100, unidad: 'g' },
    { nombre: 'leche',   cantidad: 200, unidad: 'ml' },
    { nombre: 'jamon',   cantidad: 80,  unidad: 'g' }
  ],
  instrucciones: ['Hacer bechamel', 'Anadir jamon', 'Formar y freir'],
  porciones: 4,
  tiempo_min: 40,
  dificultad: 2,
  estado_operativo: 'en_servicio',
  fuente: 'manual',
  categorias: ['tapas'],
  etiquetas: [],
  version: 1,
  history: [],
  campos_pendientes: [],
  incompleta: false,
  created_at: NOW0,
  updated_at: NOW0
};

const STORE_RECETAS = {
  _version: '1.0',
  _updated_at: NOW0,
  recetas: [RECETA_SEMILLA],
  ingredientes_catalogo: []
};

const STORE_VIABILIDAD_VACIO = {
  _version: '1.0',
  _updated_at: NOW0,
  expedientes: []
};

const pending = new Map();
let client;

// Captura de TODOS los viabilidad.evaluacion.completada para el cross-check
// (el evento de dominio NO debe llevar caminos).
const capturedCompletadas = [];

function publish(eventType, data) {
  const topic = 'core/*/events/' + eventType.replace(/\./g, '/');
  client.publish(topic, JSON.stringify({
    event_id: crypto.randomUUID(),
    event_type: eventType,
    timestamp: new Date().toISOString(),
    source: { core_id: 'test-viabilidad-caminos' },
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

async function readStore(path) {
  const r = await request('fs.read.request', { path });
  return { content: r.content, hash: r.hash, parsed: JSON.parse(r.content) };
}

async function writeStore(path, obj) {
  await request('fs.write.request', {
    path,
    content: JSON.stringify(obj, null, 2),
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
          client.removeListener('message', handler);
          resolve(data);
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

// Lee el expediente mas reciente del store de viabilidad (mayor fecha_evaluacion).
async function ultimoExpediente() {
  const s = await readStore(PATH_VIABILIDAD);
  const exps = Array.isArray(s.parsed.expedientes) ? s.parsed.expedientes : [];
  if (exps.length === 0) return null;
  return exps.slice().sort((a, b) =>
    String(b.fecha_evaluacion || '').localeCompare(String(a.fecha_evaluacion || ''))
  )[0];
}

function caminosValidos(caminos) {
  if (!Array.isArray(caminos)) return false;
  return caminos.every(c =>
    c && typeof c.titulo === 'string' && c.titulo.length > 0 &&
    typeof c.prompt === 'string' && c.prompt.length > 0
  );
}

function eventoDelExpediente(expedienteId) {
  return capturedCompletadas.find(d => d.expediente_id === expedienteId);
}

async function main() {
  console.log('=== Test: viabilidad-evaluar-con-caminos ===');
  console.log('PROJECT_ID:', PROJECT_ID);
  console.log('PAGE_ID:   ', PAGE_ID);
  console.log('PROVIDER:  ', PROVIDER || '(default)');
  console.log('MODEL:     ', MODEL || '(default)');
  console.log('');

  client = mqtt.connect(BROKER, {
    clientId: 'test-viabilidad-caminos-' + Date.now(),
    connectTimeout: 8000,
    reconnectPeriod: 0
  });
  await new Promise((res, rej) => {
    client.on('connect', res);
    client.on('error', rej);
    setTimeout(() => rej(new Error('mqtt connect timeout')), 10000);
  });

  // fs.*.response (request/response correlado por request_id).
  client.subscribe('core/+/events/fs/+/response');
  // viabilidad.evaluacion.completada (captura para el cross-check del evento).
  client.subscribe('core/+/events/viabilidad/evaluacion/completada');
  client.on('message', (topic, msg) => {
    try {
      const envelope = JSON.parse(msg.toString());
      const data = envelope.data || {};
      if (envelope.event_type === 'viabilidad.evaluacion.completada') {
        capturedCompletadas.push(data);
        return;
      }
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
    // PASO 0 — Reset stores + conversacion
    // ============================================================
    console.log('PASO 0 — Reset stores + crear conversacion');
    await writeStore(PATH_VIABILIDAD, STORE_VIABILIDAD_VACIO);
    await writeStore(PATH_RECETAS, STORE_RECETAS);
    info('viabilidad.json vacio; recetas.json con 1 receta semilla (' + RECETA_NOMBRE + ')');
    const convId = await createConversation('runtime-viabilidad-caminos-' + Date.now());
    info('conversation_id: ' + convId);
    console.log('');

    // ============================================================
    // CASO 1 — margen apretado -> caminos >= 1
    // ============================================================
    console.log('CASO 1 — margen apretado (pvp bajo) -> espera caminos >= 1');
    const msg1 = `Evalua la viabilidad de un producto llamado "Tarta artesana" con estos ingredientes: ` +
      `200 g de chocolate, 4 huevos, 150 g de mantequilla, 100 g de harina. Son 8 porciones. ` +
      `El PVP objetivo es 2 euros por porcion.`;
    info('msg: ' + msg1);
    let t0 = Date.now();
    await sendMessage(convId, msg1);
    info(`turno completo en ${((Date.now()-t0)/1000).toFixed(1)}s`);

    const exp1 = await ultimoExpediente();
    assert(!!exp1, 'CASO1: se persistio un expediente');
    if (exp1) {
      info('veredicto: ' + exp1.veredicto + ' | food_cost_pct: ' + exp1.food_cost_pct +
        ' | caminos: ' + (Array.isArray(exp1.caminos) ? exp1.caminos.length : 'n/a'));
      assert(['viable_con_advertencias', 'no_viable_economicamente'].includes(exp1.veredicto),
        `CASO1: veredicto apretado/no_viable (real: ${exp1.veredicto})`);
      assert(Array.isArray(exp1.caminos) && exp1.caminos.length >= 1 && exp1.caminos.length <= 3,
        `CASO1: 1-3 caminos (real: ${Array.isArray(exp1.caminos) ? exp1.caminos.length : 'n/a'})`);
      assert(caminosValidos(exp1.caminos), 'CASO1: cada camino tiene { titulo, prompt } no vacios');
      if (caminosValidos(exp1.caminos) && exp1.caminos.length > 0) {
        const mencionaNombre = exp1.caminos.some(c => c.prompt.includes('Tarta artesana'));
        assert(mencionaNombre, 'CASO1: algun prompt menciona el nombre del producto (datos del expediente)');
      }
      // Cross-check: el evento publicado NO lleva caminos.
      const ev1 = eventoDelExpediente(exp1.id);
      assert(!!ev1, 'CASO1: se publico viabilidad.evaluacion.completada para el expediente');
      if (ev1) assert(!('caminos' in ev1), 'CASO1: el evento de dominio NO incluye caminos (canonico)');
    }
    console.log('');

    // ============================================================
    // CASO 2 — rentable redondo -> caminos = []
    // ============================================================
    console.log('CASO 2 — rentable redondo (pvp alto) -> espera caminos = []');
    const msg2 = `Evalua la viabilidad de un producto llamado "Agua de grifo embotellada" con estos ingredientes: ` +
      `500 ml de agua. Es 1 porcion. El PVP objetivo es 25 euros.`;
    info('msg: ' + msg2);
    t0 = Date.now();
    await sendMessage(convId, msg2);
    info(`turno completo en ${((Date.now()-t0)/1000).toFixed(1)}s`);

    const exp2 = await ultimoExpediente();
    assert(!!exp2 && exp2.id !== (exp1 && exp1.id), 'CASO2: se persistio un expediente nuevo');
    if (exp2) {
      info('veredicto: ' + exp2.veredicto + ' | food_cost_pct: ' + exp2.food_cost_pct +
        ' | caminos: ' + (Array.isArray(exp2.caminos) ? exp2.caminos.length : 'n/a'));
      assert(exp2.veredicto === 'viable', `CASO2: veredicto viable (real: ${exp2.veredicto})`);
      assert(Array.isArray(exp2.caminos) && exp2.caminos.length === 0,
        `CASO2: caminos = [] (no inventados) (real: ${Array.isArray(exp2.caminos) ? exp2.caminos.length : 'n/a'})`);
      const ev2 = eventoDelExpediente(exp2.id);
      if (ev2) assert(!('caminos' in ev2), 'CASO2: el evento de dominio NO incluye caminos (canonico)');
    }
    console.log('');

    // ============================================================
    // CASO 3 — por receta_id sin nombre -> nombre resuelto via recetas.obtener
    // ============================================================
    console.log('CASO 3 — evaluar por receta_id SIN nombre -> nombre real (no inventado)');
    const msg3 = `Evalua la viabilidad de la receta con id ${RECETA_ID}. ` +
      `El PVP objetivo es 6 euros por porcion. No te invento ningun nombre: usa el de la receta.`;
    info('msg: ' + msg3);
    t0 = Date.now();
    await sendMessage(convId, msg3);
    info(`turno completo en ${((Date.now()-t0)/1000).toFixed(1)}s`);

    const exp3 = await ultimoExpediente();
    assert(!!exp3 && exp3.id !== (exp2 && exp2.id), 'CASO3: se persistio un expediente nuevo');
    if (exp3) {
      info('input.nombre: ' + (exp3.input && exp3.input.nombre) +
        ' | input.receta_id: ' + (exp3.input && exp3.input.receta_id));
      assert(exp3.input && exp3.input.nombre === RECETA_NOMBRE,
        `CASO3: input.nombre === "${RECETA_NOMBRE}" (resuelto via recetas.obtener) (real: ${exp3.input && exp3.input.nombre})`);
      assert(exp3.input && exp3.input.receta_id === RECETA_ID,
        'CASO3: input.receta_id preservado');
      assert(Array.isArray(exp3.caminos) && exp3.caminos.length <= 3,
        `CASO3: caminos en rango 0-3 (real: ${Array.isArray(exp3.caminos) ? exp3.caminos.length : 'n/a'})`);
      const ev3 = eventoDelExpediente(exp3.id);
      if (ev3) {
        assert(ev3.nombre_idea === RECETA_NOMBRE,
          `CASO3: el evento lleva nombre_idea real (real: ${ev3.nombre_idea})`);
        assert(!('caminos' in ev3), 'CASO3: el evento de dominio NO incluye caminos (canonico)');
      }
    }
    console.log('');

    // ============================================================
    // RESULTADO
    // ============================================================
    if (failures.length === 0) {
      console.log('=== PASS — caminos generados con disciplina del paso 4b ===');
      console.log('Margen apretado -> 1-3 caminos con datos del expediente; rentable -> [];');
      console.log('por receta_id -> nombre resuelto via recetas.obtener; evento de dominio canonico (sin caminos).');
      process.exit(0);
    } else {
      console.log('=== FAIL — la disciplina del paso 4b no se cumple en algun caso ===');
      for (const f of failures) console.log('  - ' + f);
      console.log('');
      console.log('Estado final del store de viabilidad:');
      const finalS = await readStore(PATH_VIABILIDAD);
      console.log(JSON.stringify(finalS.parsed, null, 2).slice(0, 2500));
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

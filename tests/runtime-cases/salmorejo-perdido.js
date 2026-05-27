#!/usr/bin/env node
/**
 * salmorejo-perdido.js — Test de runtime del caso testigo "salmorejo perdido"
 * (audit cross-blueprint 2026-05-25). Verifica que fs.edit con JSON Patch
 * 'op:add' cierra el bug de raiz: el caller declara la intencion del patch,
 * filesystem aplica deterministicamente, las entradas existentes nunca se
 * pierden.
 *
 * Flujo:
 *   1. Resetea /recetas.json a estado conocido (2 recetas semilla).
 *   2. fs.read para obtener el hash actual.
 *   3. fs.edit con { op:'add', path:'/recetas/-', value: <receta nueva> }
 *      + expected_hash. Equivale al safeUpdate canonico pero declarativo.
 *   4. fs.read post-edit, verifica:
 *      a. Hay 3 recetas (2 originales + 1 nueva).
 *      b. Las 2 originales estan intactas (mismos ids).
 *      c. La nueva esta en el array.
 *
 * Si FAILS, exit 1 con detalle. Si PASS, exit 0. El test es ejecutable
 * standalone y reproducible.
 *
 * Uso:
 *   node tests/runtime-cases/salmorejo-perdido.js \
 *     [--project-id <uuid>] [--broker wss://enki-ai.online/mqtt]
 *
 *   project-id default: el de "Mi Proyecto" hardcoded abajo. Si quieres
 *   correr contra otro proyecto, pasalo via flag.
 *
 * Caso testigo en arquitectura/decisiones/_contratos/llm-runtime-discipline.contract.json
 *   ("read_modify_write_con_cas" — caso salmorejo).
 */

'use strict';

const mqtt   = require('mqtt');
const crypto = require('crypto');

// ----------------------- argv parsing -----------------------
const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
}
const PROJECT_ID = flag('project-id', '00939fa3-5ba7-40ab-803b-e6c21ea06359'); // Mi Proyecto
const BROKER     = flag('broker', 'wss://enki-ai.online/mqtt');
const PATH_STORE = '/recetas.json';

// ----------------------- semillas -----------------------
const RECETA_SEMILLA_A = {
  id: '11111111-1111-4111-8111-111111111111',
  nombre: 'Salmorejo cordobes',
  ingredientes: [
    { nombre: 'tomate maduro', cantidad: 500, unidad: 'g' },
    { nombre: 'pan',           cantidad: 100, unidad: 'g' },
    { nombre: 'ajo',           cantidad: 1,   unidad: 'diente' },
    { nombre: 'aceite oliva',  cantidad: 80,  unidad: 'ml' },
    { nombre: 'sal',           cantidad: 1,   unidad: 'pizca' }
  ],
  estado_operativo: 'en_servicio',
  created_at: '2026-05-27T00:00:00.000Z',
  updated_at: '2026-05-27T00:00:00.000Z'
};
const RECETA_SEMILLA_B = {
  id: '22222222-2222-4222-8222-222222222222',
  nombre: 'Gazpacho andaluz',
  ingredientes: [
    { nombre: 'tomate',  cantidad: 600, unidad: 'g' },
    { nombre: 'pepino',  cantidad: 1,   unidad: 'unidad' },
    { nombre: 'pimiento', cantidad: 1,  unidad: 'unidad' },
    { nombre: 'aceite oliva', cantidad: 60, unidad: 'ml' },
    { nombre: 'vinagre', cantidad: 15,  unidad: 'ml' }
  ],
  estado_operativo: 'en_servicio',
  created_at: '2026-05-27T00:00:00.000Z',
  updated_at: '2026-05-27T00:00:00.000Z'
};
const RECETA_NUEVA = {
  id: '33333333-3333-4333-8333-333333333333',
  nombre: 'Tortilla francesa',
  ingredientes: [
    { nombre: 'huevos',       cantidad: 3,  unidad: 'unidades' },
    { nombre: 'sal',          cantidad: 1,  unidad: 'pizca' },
    { nombre: 'aceite oliva', cantidad: 10, unidad: 'ml' }
  ],
  estado_operativo: 'en_servicio',
  created_at: '2026-05-27T00:00:00.000Z',
  updated_at: '2026-05-27T00:00:00.000Z'
};
const STORE_INICIAL = {
  _version: '1.0',
  _updated_at: '2026-05-27T00:00:00.000Z',
  recetas: [RECETA_SEMILLA_A, RECETA_SEMILLA_B],
  ingredientes_catalogo: []
};

// ----------------------- mqtt helpers -----------------------
const pending = new Map();
let client;

function publish(eventType, data) {
  const topic = 'core/*/events/' + eventType.replace(/\./g, '/');
  client.publish(topic, JSON.stringify({
    event_id: crypto.randomUUID(),
    event_type: eventType,
    timestamp: new Date().toISOString(),
    source: { core_id: 'test-salmorejo-perdido' },
    data,
    metadata: {}
  }));
}

function request(eventType, data, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const responseEvent = eventType.endsWith('.request')
      ? eventType.slice(0, -'.request'.length) + '.response'
      : eventType + '.response';
    pending.set(requestId, { resolve, reject });
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

// ----------------------- assertions -----------------------
let failures = [];
function assert(cond, label) {
  if (cond) {
    console.log('  ✓ ' + label);
  } else {
    console.log('  ✗ ' + label);
    failures.push(label);
  }
}
function fail(label, detail) {
  console.log('  ✗ ' + label + (detail ? ': ' + detail : ''));
  failures.push(label + (detail ? ': ' + detail : ''));
}

// ----------------------- test flow -----------------------
async function main() {
  console.log('=== Test: salmorejo-perdido ===');
  console.log('PROJECT_ID:', PROJECT_ID);
  console.log('PATH_STORE:', PATH_STORE);
  console.log('BROKER:    ', BROKER);
  console.log('');

  // Conectar
  client = mqtt.connect(BROKER, {
    clientId: 'test-salmorejo-' + Date.now(),
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
    // -------- PASO 1: resetear store --------
    console.log('Paso 1: resetear store a estado semilla (2 recetas)');
    const seedContent = JSON.stringify(STORE_INICIAL, null, 2);
    const writeRes = await request('fs.write.request', {
      path: PATH_STORE,
      content: seedContent,
      encoding: 'utf-8'
    });
    assert(writeRes && (writeRes.size > 0), 'fs.write resetea el store');
    console.log('');

    // -------- PASO 2: fs.read para hash --------
    console.log('Paso 2: fs.read para obtener hash actual');
    const readRes = await request('fs.read.request', { path: PATH_STORE });
    assert(readRes && readRes.content, 'fs.read devuelve content');
    assert(readRes && typeof readRes.hash === 'string', 'fs.read devuelve hash');
    const parsed = JSON.parse(readRes.content);
    assert(Array.isArray(parsed.recetas) && parsed.recetas.length === 2,
      `store inicial tiene 2 recetas (real: ${parsed.recetas?.length || 0})`);
    const expectedHash = readRes.hash;
    console.log('  expected_hash:', expectedHash.slice(0, 16) + '...');
    console.log('');

    // -------- PASO 3: fs.edit con op:add --------
    console.log('Paso 3: fs.edit con { op:add, path:/recetas/-, value:RECETA_NUEVA }');
    const editRes = await request('fs.edit.request', {
      path: PATH_STORE,
      patches: [
        { op: 'add', path: '/recetas/-', value: RECETA_NUEVA }
      ],
      expected_hash: expectedHash
    });
    assert(editRes && editRes.patches_applied === 1, 'fs.edit aplica 1 patch');
    assert(editRes && typeof editRes.hash === 'string' && editRes.hash !== expectedHash,
      'fs.edit devuelve hash nuevo distinto del previo');
    console.log('');

    // -------- PASO 4: verificar resultado --------
    console.log('Paso 4: fs.read final + verificar integridad');
    const finalRes = await request('fs.read.request', { path: PATH_STORE });
    const finalDoc = JSON.parse(finalRes.content);
    const recetas = finalDoc.recetas || [];

    assert(recetas.length === 3,
      `total recetas debe ser 3 (real: ${recetas.length})`);

    const idsFinales = recetas.map(r => r.id);
    assert(idsFinales.includes(RECETA_SEMILLA_A.id),
      `salmorejo cordobes preservado (id ${RECETA_SEMILLA_A.id})`);
    assert(idsFinales.includes(RECETA_SEMILLA_B.id),
      `gazpacho andaluz preservado (id ${RECETA_SEMILLA_B.id})`);
    assert(idsFinales.includes(RECETA_NUEVA.id),
      `tortilla francesa anyadida (id ${RECETA_NUEVA.id})`);

    // Verifica que las semillas estan INTACTAS (no solo presentes)
    const recetaA = recetas.find(r => r.id === RECETA_SEMILLA_A.id);
    const recetaB = recetas.find(r => r.id === RECETA_SEMILLA_B.id);
    const recetaC = recetas.find(r => r.id === RECETA_NUEVA.id);

    assert(recetaA && recetaA.nombre === RECETA_SEMILLA_A.nombre,
      'salmorejo cordobes: nombre intacto');
    assert(recetaA && Array.isArray(recetaA.ingredientes) && recetaA.ingredientes.length === RECETA_SEMILLA_A.ingredientes.length,
      `salmorejo cordobes: ingredientes intactos (${recetaA?.ingredientes?.length}/${RECETA_SEMILLA_A.ingredientes.length})`);
    assert(recetaB && recetaB.nombre === RECETA_SEMILLA_B.nombre,
      'gazpacho andaluz: nombre intacto');
    assert(recetaC && recetaC.nombre === RECETA_NUEVA.nombre,
      'tortilla francesa: nombre correcto');

    // Verifica que la nueva esta al final (op:add path:/-)
    assert(recetas[recetas.length - 1].id === RECETA_NUEVA.id,
      'tortilla francesa esta en la ultima posicion');

    console.log('');
    // -------- RESULTADO --------
    if (failures.length === 0) {
      console.log('=== PASS — caso testigo salmorejo-perdido cerrado ===');
      console.log('Las 2 recetas semilla se preservaron + la nueva se anyadio.');
      console.log('fs.edit con JSON Patch op:add evita el bug raiz.');
      process.exit(0);
    } else {
      console.log('=== FAIL — caso testigo NO esta cerrado ===');
      console.log('Fallos detectados:');
      for (const f of failures) console.log('  - ' + f);
      console.log('');
      console.log('Estado final del store:');
      console.log(JSON.stringify(finalDoc, null, 2).slice(0, 1500));
      process.exit(1);
    }
  } catch (err) {
    console.log('');
    console.log('=== ERROR INESPERADO ===');
    console.log(err && err.message ? err.message : err);
    if (err && err.stack) console.log(err.stack);
    process.exit(2);
  } finally {
    client.end();
  }
}

main();

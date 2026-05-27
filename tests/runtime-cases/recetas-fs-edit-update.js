#!/usr/bin/env node
/**
 * recetas-fs-edit-update.js — Test de runtime de los 3 patrones de patch
 * usados por las operaciones migradas a fs.edit en recetas.blueprint.json
 * (v1.4.0).
 *
 * Cubre los shapes de:
 *   - cambiar_estado: 4 patches (test id + replace estado_operativo +
 *     replace updated_at + replace _updated_at).
 *   - actualizar_precio rama A: 2 patches (add a /ingredientes_catalogo/- +
 *     replace _updated_at).
 *   - actualizar_precio rama B: 3 patches (test nombre + replace item
 *     completo + replace _updated_at).
 *
 * Es deterministico — bypassa el LLM, ejerce solo fs.edit. Si pasa,
 * los patches del blueprint son estructuralmente correctos. La
 * verificacion de que el LLM publica esos patches es separada
 * (case testigo end-to-end).
 *
 * Uso:
 *   node tests/runtime-cases/recetas-fs-edit-update.js \
 *     [--project-id <uuid>] [--broker wss://enki-ai.online/mqtt]
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
const PATH_STORE = '/recetas.json';

const RECETA_A = {
  id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  nombre: 'Receta A',
  ingredientes: [{ nombre: 'sal', cantidad: 1, unidad: 'pizca' }],
  estado_operativo: 'borrador',
  created_at: '2026-05-27T00:00:00.000Z',
  updated_at: '2026-05-27T00:00:00.000Z'
};
const RECETA_B = {
  id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
  nombre: 'Receta B',
  ingredientes: [{ nombre: 'agua', cantidad: 100, unidad: 'ml' }],
  estado_operativo: 'en_servicio',
  created_at: '2026-05-27T00:00:00.000Z',
  updated_at: '2026-05-27T00:00:00.000Z'
};
const ING_EXISTENTE = {
  nombre: 'Tomate',
  categoria: 'verdura',
  unidad: 'kg',
  precio_mercado: 2.0,
  fuente: 'manual',
  created_at: '2026-05-27T00:00:00.000Z',
  updated_at: '2026-05-27T00:00:00.000Z'
};
const STORE_INICIAL = {
  _version: '1.0',
  _updated_at: '2026-05-27T00:00:00.000Z',
  recetas: [RECETA_A, RECETA_B],
  ingredientes_catalogo: [ING_EXISTENTE]
};

const pending = new Map();
let client;

function publish(eventType, data) {
  const topic = 'core/*/events/' + eventType.replace(/\./g, '/');
  client.publish(topic, JSON.stringify({
    event_id: crypto.randomUUID(),
    event_type: eventType,
    timestamp: new Date().toISOString(),
    source: { core_id: 'test-recetas-fs-edit-update' },
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

async function main() {
  console.log('=== Test: recetas-fs-edit-update ===');
  console.log('PROJECT_ID:', PROJECT_ID);
  console.log('PATH_STORE:', PATH_STORE);
  console.log('BROKER:    ', BROKER);
  console.log('');

  client = mqtt.connect(BROKER, {
    clientId: 'test-recetas-fs-edit-' + Date.now(),
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
    // CASO 1 — cambiar_estado (4 patches, UPDATE 1-campo)
    // ============================================================
    console.log('CASO 1 — cambiar_estado: borrador -> en_servicio en Receta A');
    await resetStore();
    let s = await readStore();
    assert(s.parsed.recetas.length === 2, 'estado inicial: 2 recetas');
    const idx0 = s.parsed.recetas.findIndex(r => r.id === RECETA_A.id);
    assert(idx0 === 0, 'Receta A esta en idx 0');

    const now1 = new Date().toISOString();
    const res1 = await request('fs.edit.request', {
      path: PATH_STORE,
      patches: [
        { op: 'test',    path: `/recetas/${idx0}/id`,               value: RECETA_A.id },
        { op: 'replace', path: `/recetas/${idx0}/estado_operativo`, value: 'en_servicio' },
        { op: 'replace', path: `/recetas/${idx0}/updated_at`,       value: now1 },
        { op: 'replace', path: '/_updated_at',                      value: now1 }
      ],
      expected_hash: s.hash
    });
    assert(res1.patches_applied === 4, `fs.edit aplica 4 patches (real: ${res1.patches_applied})`);

    s = await readStore();
    assert(s.parsed.recetas.length === 2, 'sigue habiendo 2 recetas');
    const rA = s.parsed.recetas.find(r => r.id === RECETA_A.id);
    const rB = s.parsed.recetas.find(r => r.id === RECETA_B.id);
    assert(rA && rA.estado_operativo === 'en_servicio', 'Receta A pasa a en_servicio');
    assert(rA && rA.updated_at === now1, 'Receta A.updated_at actualizado');
    assert(rB && rB.estado_operativo === 'en_servicio' && rB.updated_at === RECETA_B.updated_at,
      'Receta B intacta (no se toca updated_at de la otra)');
    assert(s.parsed._updated_at === now1, '_updated_at del store actualizado');
    assert(s.parsed.ingredientes_catalogo.length === 1, 'catalogo no se toca');
    console.log('');

    // ============================================================
    // CASO 2 — actualizar_precio RAMA A (add nuevo ingrediente)
    // ============================================================
    console.log('CASO 2 — actualizar_precio rama A: add nuevo "Cebolla" al catalogo');
    await resetStore();
    s = await readStore();
    assert(s.parsed.ingredientes_catalogo.length === 1, 'estado inicial: 1 ingrediente');

    const now2 = new Date().toISOString();
    const cebolla = {
      nombre: 'Cebolla',
      categoria: 'verdura',
      unidad: 'kg',
      precio_mercado: 1.5,
      fuente: 'manual',
      created_at: now2, updated_at: now2
    };
    const res2 = await request('fs.edit.request', {
      path: PATH_STORE,
      patches: [
        { op: 'add',     path: '/ingredientes_catalogo/-', value: cebolla },
        { op: 'replace', path: '/_updated_at',             value: now2 }
      ],
      expected_hash: s.hash
    });
    assert(res2.patches_applied === 2, `fs.edit aplica 2 patches (real: ${res2.patches_applied})`);

    s = await readStore();
    assert(s.parsed.ingredientes_catalogo.length === 2, 'catalogo tiene 2 ingredientes');
    const tomateIntacto = s.parsed.ingredientes_catalogo.find(i => i.nombre === 'Tomate');
    const cebollaNueva  = s.parsed.ingredientes_catalogo.find(i => i.nombre === 'Cebolla');
    assert(tomateIntacto && tomateIntacto.precio_mercado === 2.0, 'Tomate preservado intacto');
    assert(cebollaNueva && cebollaNueva.precio_mercado === 1.5, 'Cebolla anyadida con precio correcto');
    assert(s.parsed.recetas.length === 2, 'recetas no se tocan');
    assert(s.parsed._updated_at === now2, '_updated_at actualizado');
    console.log('');

    // ============================================================
    // CASO 3 — actualizar_precio RAMA B (test + replace item existente)
    // ============================================================
    console.log('CASO 3 — actualizar_precio rama B: cambiar precio de Tomate (existente)');
    await resetStore();
    s = await readStore();
    const idxTomate = s.parsed.ingredientes_catalogo.findIndex(i => i.nombre.toLowerCase() === 'tomate');
    assert(idxTomate === 0, 'Tomate esta en idx 0');

    const now3 = new Date().toISOString();
    const tomateActualizado = {
      ...ING_EXISTENTE,
      precio_mercado: 2.5,
      updated_at: now3
    };
    const res3 = await request('fs.edit.request', {
      path: PATH_STORE,
      patches: [
        { op: 'test',    path: `/ingredientes_catalogo/${idxTomate}/nombre`, value: 'Tomate' },
        { op: 'replace', path: `/ingredientes_catalogo/${idxTomate}`,        value: tomateActualizado },
        { op: 'replace', path: '/_updated_at',                                value: now3 }
      ],
      expected_hash: s.hash
    });
    assert(res3.patches_applied === 3, `fs.edit aplica 3 patches (real: ${res3.patches_applied})`);

    s = await readStore();
    assert(s.parsed.ingredientes_catalogo.length === 1, 'sigue habiendo 1 ingrediente (sustitucion, no append)');
    const tomateNuevo = s.parsed.ingredientes_catalogo[0];
    assert(tomateNuevo.nombre === 'Tomate', 'sigue siendo Tomate');
    assert(tomateNuevo.precio_mercado === 2.5, 'precio actualizado a 2.5');
    assert(tomateNuevo.updated_at === now3, 'updated_at del item actualizado');
    assert(tomateNuevo.created_at === ING_EXISTENTE.created_at, 'created_at PRESERVADO (no sobreescrito)');
    assert(s.parsed.recetas.length === 2, 'recetas no se tocan');
    console.log('');

    // ============================================================
    // CASO 4 — op:test falla cuando el valor no coincide (race guard)
    // ============================================================
    console.log('CASO 4 — op:test guarda race: falla si el id no coincide');
    await resetStore();
    s = await readStore();
    let testFailed = false;
    try {
      await request('fs.edit.request', {
        path: PATH_STORE,
        patches: [
          { op: 'test',    path: '/recetas/0/id', value: 'id-equivocado' },
          { op: 'replace', path: '/recetas/0/estado_operativo', value: 'archivada' }
        ],
        expected_hash: s.hash
      });
    } catch (err) {
      testFailed = true;
      console.log('  ' + String.fromCharCode(10003) + ' fs.edit rechaza patch con test failed (error:', (err.code || err.message || JSON.stringify(err)).toString().slice(0, 80), ')');
    }
    assert(testFailed, 'op:test bloquea cuando el valor difiere');
    s = await readStore();
    assert(s.parsed.recetas[0].estado_operativo === RECETA_A.estado_operativo,
      'estado original preservado tras test fallido (atomicidad)');
    console.log('');

    // ============================================================
    // RESULTADO
    // ============================================================
    if (failures.length === 0) {
      console.log('=== PASS — 3 patrones de patch (cambiar_estado + actualizar_precio A + actualizar_precio B) validados ===');
      console.log('Patches del blueprint son estructuralmente correctos contra fs.edit del VPS.');
      process.exit(0);
    } else {
      console.log('=== FAIL — algun patron de patch no se aplica como esperado ===');
      for (const f of failures) console.log('  - ' + f);
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

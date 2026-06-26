'use strict';

/**
 * propiocepcion — verificación end-to-end del reflejo + el contrato del nervio.
 *
 * La propiocepción tiene DOS mitades: el reflejo (este módulo, escucha el bus crudo
 * y bufferiza por proyecto) y el nervio (ai-gateway, lee la rebanada vía RPC de bus
 * y la inyecta en el turno). Esta suite comprueba que el reflejo funciona y que la
 * forma que devuelve handleLeer encaja con lo que el nervio espera tras el desempaquetado
 * del loader ({status,data} -> data -> .eventos).
 *
 * Ejecutar: node tests/unit/propiocepcion.test.js
 */

const assert = require('assert');
const { EventEmitter } = require('events');
const Propiocepcion = require('../../modules/propiocepcion');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevoModulo(overrides = {}) {
  const mqtt = new EventEmitter();
  const publicados = [];
  const eventBus = {
    mqtt,
    publish: (event, payload) => { publicados.push({ event, payload }); },
    subscribe: () => () => {}
  };
  const m = new Propiocepcion();
  const context = {
    logger: { info() {}, warn() {}, error() {} },
    metrics: { increment() {}, gauge() {} },
    eventBus,
    uiHandler: null,
    moduleConfig: {
      scope_modulos: ['escandallo', 'recetas'],
      modulos_blueprint: ['recetas'],
      buffer_max: 3,
      flush_interval_ms: 10_000_000, // no dispara durante el test
      archivo_path: '/_propiocepcion.json',
      ...overrides
    }
  };
  return { m, context, mqtt, publicados };
}

// emite un evento por el bus crudo como lo haría EventBus -> MQTT (envelope JSON)
function emitir(mqtt, eventType, data, ts) {
  const envelope = {
    event_type: eventType,
    timestamp: ts || new Date().toISOString(),
    source: { core_id: 'test' },
    data
  };
  mqtt.emit('message', `core/test/events/${eventType.replace(/\./g, '/')}`, JSON.stringify(envelope));
}

test('captura un evento del scope con project_id y lo bufferiza', async () => {
  const { m, context, mqtt } = nuevoModulo();
  await m.onLoad(context);
  emitir(mqtt, 'escandallo.coste.calculado', { project_id: 'p1', receta_id: 'masa', coste_unidad: 1.45 });
  const buf = m.buffers.get('p1');
  assert.ok(Array.isArray(buf) && buf.length === 1, 'no bufferizó el evento');
  assert.strictEqual(buf[0].modulo, 'escandallo');
  assert.ok(/1\.45/.test(buf[0].resumen), `resumen sin coste: ${buf[0].resumen}`);
  await m.onUnload();
});

test('tipo: reflejo (no-blueprint) vs consciente (blueprint)', async () => {
  const { m, context, mqtt } = nuevoModulo();
  await m.onLoad(context);
  emitir(mqtt, 'escandallo.coste.calculado', { project_id: 'p1', receta_id: 'masa', coste_unidad: 1 });
  emitir(mqtt, 'recetas.creada', { project_id: 'p1', nombre: 'Margarita' });
  const buf = m.buffers.get('p1');
  assert.strictEqual(buf[0].tipo, 'reflejo', 'escandallo no es blueprint => reflejo');
  assert.strictEqual(buf[1].tipo, 'consciente', 'recetas es blueprint => consciente');
  await m.onUnload();
});

test('ignora eventos FUERA del scope (no es su mundo)', async () => {
  const { m, context, mqtt } = nuevoModulo();
  await m.onLoad(context);
  emitir(mqtt, 'cobro.procesado', { project_id: 'p1', monto: 10 });
  assert.strictEqual(m.buffers.has('p1'), false, 'capturó un evento fuera de scope');
  await m.onUnload();
});

test('ignora eventos del scope SIN project_id (no hay propiocepción sin proyecto)', async () => {
  const { m, context, mqtt } = nuevoModulo();
  await m.onLoad(context);
  emitir(mqtt, 'escandallo.coste.calculado', { receta_id: 'masa', coste_unidad: 1 });
  assert.strictEqual(m.buffers.size, 0, 'capturó un evento sin project_id');
  await m.onUnload();
});

test('el buffer está ACOTADO (bufferMax): tira lo más viejo', async () => {
  const { m, context, mqtt } = nuevoModulo({ buffer_max: 3 });
  await m.onLoad(context);
  for (let i = 0; i < 5; i++) {
    emitir(mqtt, 'escandallo.coste.calculado', { project_id: 'p1', receta_id: `r${i}`, coste_unidad: i }, `2026-01-01T00:00:0${i}.000Z`);
  }
  const buf = m.buffers.get('p1');
  assert.strictEqual(buf.length, 3, 'no respetó bufferMax');
  assert.strictEqual(buf[0].datos_clave.receta_id, 'r2', 'no tiró los más viejos');
  await m.onUnload();
});

test('handleLeer devuelve la rebanada {status:200, data:{eventos}}', async () => {
  const { m, context, mqtt } = nuevoModulo();
  await m.onLoad(context);
  emitir(mqtt, 'escandallo.coste.calculado', { project_id: 'p1', receta_id: 'masa', coste_unidad: 1 });
  const res = await m.handleLeer({ project_id: 'p1' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.project_id, 'p1');
  assert.strictEqual(res.data.total, 1);
  assert.strictEqual(res.data.eventos.length, 1);
  await m.onUnload();
});

test('handleLeer filtra por desde_ts (solo lo NUEVO)', async () => {
  const { m, context, mqtt } = nuevoModulo();
  await m.onLoad(context);
  emitir(mqtt, 'escandallo.coste.calculado', { project_id: 'p1', receta_id: 'viejo', coste_unidad: 1 }, '2026-01-01T00:00:00.000Z');
  emitir(mqtt, 'escandallo.coste.calculado', { project_id: 'p1', receta_id: 'nuevo', coste_unidad: 2 }, '2026-01-01T00:00:05.000Z');
  const res = await m.handleLeer({ project_id: 'p1', desde_ts: '2026-01-01T00:00:02.000Z' });
  assert.strictEqual(res.data.eventos.length, 1, 'no filtró por desde_ts');
  assert.strictEqual(res.data.eventos[0].datos_clave.receta_id, 'nuevo');
  await m.onUnload();
});

test('handleLeer sin project_id -> 400 INVALID_INPUT', async () => {
  const { m, context } = nuevoModulo();
  await m.onLoad(context);
  const res = await m.handleLeer({});
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.error.code, 'INVALID_INPUT');
  await m.onUnload();
});

test('CONTRATO DEL NERVIO: tras el desempaquetado del loader, payload.eventos existe', async () => {
  // Reproduce la cadena real: handleLeer -> {status,data}; el loader (_wireToolBusSubscription)
  // desempaqueta status/data -> result = data y publica {request_id, result}; el nervio
  // (_leerPropiocepcion) lee payload = data.result y luego payload.eventos.
  const { m, context, mqtt } = nuevoModulo();
  await m.onLoad(context);
  emitir(mqtt, 'recetas.creada', { project_id: 'p1', nombre: 'Margarita' });
  const handlerResult = await m.handleLeer({ project_id: 'p1', limite: 10 });
  // --- desempaquetado del loader ---
  let result = handlerResult;
  if ('status' in result && 'data' in result && result.status >= 200 && result.status < 400) result = result.data;
  // --- lectura del nervio ---
  const eventos = result?.data?.eventos || result?.eventos || [];
  assert.ok(Array.isArray(eventos) && eventos.length === 1, 'el nervio no vería los eventos');
  await m.onUnload();
});

test('flush publica fs.write.request (persistencia por proyecto)', async () => {
  const { m, context, mqtt, publicados } = nuevoModulo();
  await m.onLoad(context);
  emitir(mqtt, 'recetas.creada', { project_id: 'p1', nombre: 'Margarita' });
  await m._flushDirty();
  const w = publicados.find(p => p.event === 'fs.write.request');
  assert.ok(w, 'no publicó fs.write.request');
  assert.strictEqual(w.payload.project_id, 'p1');
  assert.strictEqual(w.payload.path, '/_propiocepcion.json');
  const parsed = JSON.parse(w.payload.content);
  assert.ok(Array.isArray(parsed.eventos) && parsed.eventos.length === 1);
  await m.onUnload();
});

test('restaura desde disco (fs.read.response) sin pisar lo capturado en vivo', async () => {
  const { m, context, mqtt } = nuevoModulo();
  await m.onLoad(context);
  // simula activación del proyecto -> emite fs.read.request y registra el pending
  await m.onProjectActivated({ data: { project_id: 'p1' } });
  const pendingId = Array.from(m.pendingFsReads.keys())[0];
  assert.ok(pendingId, 'no registró el fs.read pendiente');
  // mientras se "leía" disco, llega un evento en vivo
  emitir(mqtt, 'recetas.creada', { project_id: 'p1', nombre: 'EnVivo' });
  // llega la respuesta del fs con un evento histórico
  const historico = { ts: '2025-01-01T00:00:00.000Z', modulo: 'recetas', tipo: 'consciente', evento: 'recetas.creada', resumen: 'creo receta "Historico"', datos_clave: {}, correlation_id: null };
  m.onFsReadResponse({ data: { request_id: pendingId, status: 200, content: JSON.stringify({ eventos: [historico] }) } });
  const buf = m.buffers.get('p1');
  assert.strictEqual(buf.length, 2, 'no fusionó histórico + vivo');
  assert.strictEqual(buf[0].resumen, 'creo receta "Historico"', 'el histórico va primero (prepend)');
  assert.strictEqual(buf[1].datos_clave.nombre, 'EnVivo', 'lo capturado en vivo va después');
  await m.onUnload();
});

test('handleHealthCheck reporta capturando + scope', async () => {
  const { m, context } = nuevoModulo();
  await m.onLoad(context);
  const res = await m.handleHealthCheck();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.capturando, true);
  assert.ok(res.data.scope.includes('escandallo'));
  await m.onUnload();
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[propiocepcion] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[propiocepcion] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

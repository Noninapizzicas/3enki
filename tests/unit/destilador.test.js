/**
 * Tests unitarios — destilador (el MINERO del lazo de aprendizaje, paso 1).
 *
 * Verifica la mineria: trazas por correlation_id -> firma -> cluster ->
 * candidata al cruzar el umbral. La traza la cierra la INACTIVIDAD (la ventana),
 * no el sufijo del evento (un .response intermedio no es fin de resolucion).
 *
 * Ejecutar: node tests/unit/destilador.test.js
 */
'use strict';

const assert = require('assert');
const Destilador = require('../../modules/destilador');

// ==========================================
// Test harness minimo
// ==========================================

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

/**
 * Fake bus: captura on('message') (como mqtt crudo) y permite inyectar eventos
 * con la forma del envelope canonico. publish() acumula en `published`.
 */
function fakeBus() {
  const listeners = [];
  const published = [];
  const mqtt = {
    on: (ev, fn) => { if (ev === 'message') listeners.push(fn); },
    removeListener: () => {}
  };
  return {
    mqtt,
    publish: (event, data) => published.push({ event, data }),
    subscribe: () => () => {},
    published,
    inject(eventType, data) {
      const env = {
        event_type: eventType, event_id: 'e' + Math.random(),
        data, timestamp: new Date().toISOString()
      };
      const topic = `core/x/events/${eventType.replace(/\./g, '/')}`;
      listeners.forEach(fn => fn(topic, JSON.stringify(env)));
    }
  };
}

const noopLogger = { info() {}, warn() {}, error() {} };
const noopMetrics = { increment() {}, gauge() {} };

async function nuevoMinero(bus, overrides = {}) {
  const mod = new Destilador();
  await mod.onLoad({
    logger: noopLogger, metrics: noopMetrics, eventBus: bus,
    moduleConfig: {
      umbral_recurrencia: 3, ventana_traza_ms: 50,
      scope_modulos: ['escandallo', 'recetas'], flush_interval_ms: 999999,
      ...overrides
    }
  });
  return mod;
}

const P = 'proj-nonina';

// ==========================================
// Tests
// ==========================================

test('una resolucion correlacionada repetida >= umbral emite UNA candidata', async () => {
  const bus = fakeBus();
  const mod = await nuevoMinero(bus);
  for (let i = 0; i < 3; i++) {
    const corr = 'cA' + i;
    bus.inject('escandallo.calcular.request', { project_id: P, correlation_id: corr, receta_id: 'r' + i });
    bus.inject('recetas.obtener.response', { project_id: P, correlation_id: corr, receta_id: 'r' + i });
    bus.inject('escandallo.calcular.response', { project_id: P, correlation_id: corr, coste_unidad: 1.2 });
  }
  await new Promise(r => setTimeout(r, 80));
  mod._tick(); // cierra trazas inactivas

  const cands = bus.published.filter(p => p.event === 'aprendizaje.candidata.detectada');
  assert.strictEqual(cands.length, 1, 'debe emitir exactamente 1 candidata');
  assert.strictEqual(cands[0].data.ocurrencias, 3);
  assert.strictEqual(cands[0].data.project_id, P);
  // firma fiel: cadena causal completa, sin truncar en el .response intermedio
  assert.deepStrictEqual(cands[0].data.secuencia,
    ['escandallo.calcular', 'recetas.obtener', 'escandallo.calcular']);
  await mod.onUnload();
});

test('un patron sub-umbral NO emite pero queda en clusters', async () => {
  const bus = fakeBus();
  const mod = await nuevoMinero(bus);
  for (let i = 0; i < 2; i++) {
    bus.inject('recetas.creada', { project_id: P, correlation_id: 'cB' + i, nombre: 'pizza' + i });
  }
  await new Promise(r => setTimeout(r, 80));
  mod._tick();

  const cands = bus.published.filter(p => p.event === 'aprendizaje.candidata.detectada');
  assert.strictEqual(cands.length, 0, 'sub-umbral no debe emitir');
  const list = await mod.handleListarClusters({ project_id: P });
  assert.ok(list.data.clusters.some(c => c.ocurrencias === 2 && !c.emitida),
    'el patron sub-umbral debe estar visible en clusters, sin emitir');
  await mod.onUnload();
});

test('eventos fuera del scope se ignoran', async () => {
  const bus = fakeBus();
  const mod = await nuevoMinero(bus);
  for (let i = 0; i < 5; i++) {
    bus.inject('cobro.procesado', { project_id: P, correlation_id: 'cZ' + i, monto: 9 });
  }
  await new Promise(r => setTimeout(r, 80));
  mod._tick();
  const list = await mod.handleListarClusters({ project_id: P });
  assert.strictEqual(list.data.total, 0, 'cobro no esta en scope -> 0 clusters');
  await mod.onUnload();
});

test('eventos sin project_id no forman cluster', async () => {
  const bus = fakeBus();
  const mod = await nuevoMinero(bus);
  for (let i = 0; i < 4; i++) {
    bus.inject('escandallo.calcular.response', { correlation_id: 'cN' + i, coste_unidad: 1 });
  }
  await new Promise(r => setTimeout(r, 80));
  mod._tick();
  const cands = bus.published.filter(p => p.event === 'aprendizaje.candidata.detectada');
  assert.strictEqual(cands.length, 0, 'sin project_id no hay propiocepcion por proyecto');
  await mod.onUnload();
});

test('emite una sola vez aunque la firma siga repitiendose', async () => {
  const bus = fakeBus();
  const mod = await nuevoMinero(bus);
  for (let i = 0; i < 5; i++) { // 5 > umbral 3
    bus.inject('recetas.creada', { project_id: P, correlation_id: 'cM' + i, nombre: 'x' + i });
  }
  await new Promise(r => setTimeout(r, 80));
  mod._tick();
  const cands = bus.published.filter(p => p.event === 'aprendizaje.candidata.detectada');
  assert.strictEqual(cands.length, 1, 'la candidata se emite una vez, no en cada ocurrencia');
  assert.strictEqual(cands[0].data.ocurrencias, 3, 'emite al cruzar el umbral');
  await mod.onUnload();
});

test('handleListarClusters valida project_id', async () => {
  const bus = fakeBus();
  const mod = await nuevoMinero(bus);
  const res = await mod.handleListarClusters({});
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.error.code, 'INVALID_INPUT');
  await mod.onUnload();
});

// ==========================================
// Runner
// ==========================================

(async () => {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log(`  ✅ ${name}`); passed++; }
    catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); failed++; }
  }
  console.log(`\n  destilador: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();

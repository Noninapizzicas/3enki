/**
 * Tests unitarios — interruptores (registro central de on/off) + conserje
 * (que registra su botón y reacciona en caliente).
 *
 * Ejecutar: node tests/unit/interruptores.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Interruptores = require('../../modules/interruptores');
const Conserje = require('../../modules/conserje');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function fakeBus() {
  const published = [];
  const handlers = new Map();          // eventType -> [fn]  (subscribe lógico)
  const mqttHandlers = [];             // mqtt.on('message')
  return {
    published,
    publish: (event, data) => {
      published.push({ event, data });
      const hs = handlers.get(event) || [];
      hs.forEach(h => h({ data }));
    },
    subscribe: (event, h) => { const hs = handlers.get(event) || []; hs.push(h); handlers.set(event, hs); return () => {}; },
    mqtt: { on: (ev, fn) => { if (ev === 'message') mqttHandlers.push(fn); }, removeListener: () => {} },
    inject: (eventType, data) => {
      const env = { event_type: eventType, event_id: 'e' + Math.random(), data, timestamp: new Date().toISOString() };
      const topic = `core/x/events/${eventType.replace(/\./g, '/')}`;
      mqttHandlers.forEach(fn => fn(topic, JSON.stringify(env)));
    }
  };
}
const noop = { info() {}, warn() {}, error() {} };
const noopM = { increment() {}, gauge() {} };

test('registrar añade el interruptor; listar lo devuelve con su default', async () => {
  const bus = fakeBus();
  const tmp = path.join(os.tmpdir(), 'int-' + Date.now() + '.json');
  const mod = new Interruptores();
  await mod.onLoad({ logger: noop, metrics: noopM, eventBus: bus, moduleConfig: { estados_path: tmp } });
  mod.onRegistrar({ data: { id: 'conserje', label: 'Conserje', grupo: 'aprendizaje', default: false } });
  const res = await mod.handleListar();
  assert.strictEqual(res.data.total, 1);
  assert.strictEqual(res.data.toggles[0].id, 'conserje');
  assert.strictEqual(res.data.toggles[0].estado, false);
  await mod.onUnload();
});

test('set persiste y emite interruptor.cambiado', async () => {
  const bus = fakeBus();
  const tmp = path.join(os.tmpdir(), 'int-' + Date.now() + '-b.json');
  const mod = new Interruptores();
  await mod.onLoad({ logger: noop, metrics: noopM, eventBus: bus, moduleConfig: { estados_path: tmp } });
  mod.onRegistrar({ data: { id: 'conserje', default: false } });
  await mod.handleSet({ id: 'conserje', enabled: true });
  assert.ok(bus.published.some(p => p.event === 'interruptor.cambiado' && p.data.id === 'conserje' && p.data.enabled === true));
  assert.ok(fs.existsSync(tmp), 'persiste el estado');
  assert.strictEqual(JSON.parse(fs.readFileSync(tmp, 'utf-8')).estados.conserje, true);
  fs.rmSync(tmp, { force: true });
  await mod.onUnload();
});

test('el estado persistido manda sobre el default al re-registrar', async () => {
  const tmp = path.join(os.tmpdir(), 'int-' + Date.now() + '-c.json');
  fs.writeFileSync(tmp, JSON.stringify({ estados: { conserje: true } }));
  const bus = fakeBus();
  const mod = new Interruptores();
  await mod.onLoad({ logger: noop, metrics: noopM, eventBus: bus, moduleConfig: { estados_path: tmp } });
  mod.onRegistrar({ data: { id: 'conserje', default: false } }); // default false, pero persistido true
  const res = await mod.handleListar();
  assert.strictEqual(res.data.toggles[0].estado, true, 'no pisa lo que el humano dejó');
  fs.rmSync(tmp, { force: true });
  await mod.onUnload();
});

// ── conserje ──

async function nuevoConserje(bus) {
  const mod = new Conserje();
  await mod.onLoad({ logger: noop, metrics: noopM, eventBus: bus, moduleConfig: { tick_ms: 999999, enabled_default: false } });
  return mod;
}

test('conserje registra su botón en el panel al cargar', async () => {
  const bus = fakeBus();
  const mod = await nuevoConserje(bus);
  assert.ok(bus.published.some(p => p.event === 'interruptor.registrar' && p.data.id === 'conserje'));
  await mod.onUnload();
});

test('conserje deriva INTENCIÓN: marca tocada vacía -> intentada', async () => {
  const bus = fakeBus();
  const mod = await nuevoConserje(bus);
  bus.inject('carta-marketing.get_perfil.response', { project_id: 'P', onboarding_completado: false });
  const est = mod.estados.get('P');
  assert.ok(est.intentadas.has('marca'), 'la toca vacía -> intención');
  assert.ok(!est.usadas.has('marca'));
  await mod.onUnload();
});

test('conserje APAGADO no empuja; ENCENDIDO empuja el desbloqueo de marca', async () => {
  const bus = fakeBus();
  const mod = await nuevoConserje(bus);
  bus.inject('carta-marketing.get_perfil.response', { project_id: 'P', onboarding_completado: false });

  // apagado por defecto -> tick no emite
  mod._tick();
  assert.strictEqual(bus.published.filter(p => p.event === 'conserje.empujon').length, 0);

  // el panel lo enciende en caliente
  bus.inject('carta-marketing.get_perfil.response', { project_id: 'P', onboarding_completado: false }); // re-dirty
  mod.onInterruptorCambiado({ data: { id: 'conserje', enabled: true } });
  mod._tick();
  const emp = bus.published.filter(p => p.event === 'conserje.empujon');
  assert.strictEqual(emp.length, 1, 'al encender, empuja');
  assert.strictEqual(emp[0].data.recurso, 'marca');
  assert.strictEqual(emp[0].data.tipo, 'desbloqueo');
  assert.strictEqual(emp[0].data.accion_sugerida, 'carta-marketing.completar_onboarding');
  await mod.onUnload();
});

test('conserje respeta el cooldown (no agobia)', async () => {
  const bus = fakeBus();
  const mod = await nuevoConserje(bus);
  mod.onInterruptorCambiado({ data: { id: 'conserje', enabled: true } });
  bus.inject('carta-marketing.get_perfil.response', { project_id: 'P', onboarding_completado: false });
  mod._tick();
  bus.inject('carta-marketing.get_perfil.response', { project_id: 'P', onboarding_completado: false });
  mod._tick();
  assert.strictEqual(bus.published.filter(p => p.event === 'conserje.empujon').length, 1, 'cooldown: solo 1 empujón');
  await mod.onUnload();
});

test('conserje: el empujón pendiente se lee UNA vez (consume-on-read, para el nervio)', async () => {
  const bus = fakeBus();
  const mod = await nuevoConserje(bus);
  mod.onInterruptorCambiado({ data: { id: 'conserje', enabled: true } });
  bus.inject('carta-marketing.get_perfil.response', { project_id: 'P', onboarding_completado: false });
  mod._tick();
  // primera lectura: trae el empujón
  const r1 = await mod.handleEmpujonPendiente({ project_id: 'P' });
  assert.ok(r1.data.empujon, 'la primera lectura trae el empujón');
  assert.strictEqual(r1.data.empujon.recurso, 'marca');
  // segunda lectura: ya consumido -> null (se ofrece una sola vez)
  const r2 = await mod.handleEmpujonPendiente({ project_id: 'P' });
  assert.strictEqual(r2.data.empujon, null, 'consume-on-read: no se repite');
  await mod.onUnload();
});

test('conserje: sin proyecto, empujon_pendiente devuelve null sin romper', async () => {
  const bus = fakeBus();
  const mod = await nuevoConserje(bus);
  const r = await mod.handleEmpujonPendiente({});
  assert.strictEqual(r.data.empujon, null);
  await mod.onUnload();
});

test('ai-gateway expone el nervio del conserje (_leerEmpujon + _composeEmpujonSection)', async () => {
  const A = require('../../modules/conversacion/ai-gateway/index.js');
  assert.strictEqual(typeof A.prototype._leerEmpujon, 'function');
  assert.strictEqual(typeof A.prototype._composeEmpujonSection, 'function');
  const sec = A.prototype._composeEmpujonSection({ mensaje: 'completa tu marca' });
  assert.ok(/conserje/i.test(sec) && /completa tu marca/.test(sec));
  assert.ok(/una vez|UNA vez/i.test(sec), 'instruye ofrecer una sola vez');
});

test('conserje: marca rellenada -> usada, sale de la brecha', async () => {
  const bus = fakeBus();
  const mod = await nuevoConserje(bus);
  bus.inject('carta-marketing.get_perfil.response', { project_id: 'P', onboarding_completado: true, esencia: { nombre: 'Nonina' } });
  const est = mod.estados.get('P');
  assert.ok(est.usadas.has('marca'));
  assert.ok(!est.intentadas.has('marca'));
  await mod.onUnload();
});

(async () => {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log(`  ✅ ${name}`); passed++; }
    catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); failed++; }
  }
  console.log(`\n  interruptores + conserje: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();

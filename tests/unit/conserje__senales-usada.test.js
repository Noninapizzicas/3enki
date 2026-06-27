'use strict';

/**
 * conserje · señales de USO de diseno/digital (v0.3.0).
 *
 * Antes, diseno/digital no tenían señal: su estado `usada` nunca se observaba y
 * el conserje los ofrecía cada cooldown para siempre, ya construidos. Esta suite
 * fija que dos eventos de dominio autocontenidos marcan la capacidad como usada
 * y la sacan de la brecha (deja de ofrecerse).
 *
 * Ejecutar: node tests/unit/conserje__senales-usada.test.js
 */

const assert = require('assert');
const { EventEmitter } = require('events');
const Conserje = require('../../modules/conserje');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function nuevoModulo() {
  const mqtt = new EventEmitter();
  const eventBus = { mqtt, publish() {}, subscribe: () => () => {} };
  const m = new Conserje();
  await m.onLoad({
    logger: { info() {}, warn() {}, error() {} },
    metrics: { increment() {}, gauge() {} },
    eventBus,
    moduleConfig: { enabled_default: true, tick_ms: 10_000_000 } // activo, sin tick automático
  });
  return { m, mqtt };
}

function emitir(mqtt, eventType, data) {
  const envelope = { event_type: eventType, timestamp: new Date().toISOString(), source: { core_id: 't' }, data };
  mqtt.emit('message', `core/t/events/${eventType.replace(/\./g, '/')}`, JSON.stringify(envelope));
}

test('carta.html.generada marca diseno USADA', async () => {
  const { m, mqtt } = await nuevoModulo();
  emitir(mqtt, 'carta.html.generada', { project_id: 'p1', carta_id: 'c1', filename: 'c1__x.html' });
  assert.ok(m.estados.get('p1').usadas.has('diseno'), 'diseno no quedó usada');
  await m.onUnload();
});

test('cartadigital.publicado marca digital USADA', async () => {
  const { m, mqtt } = await nuevoModulo();
  emitir(mqtt, 'cartadigital.publicado', { project_id: 'p1', slug: 'pizzeria', productos: 12 });
  assert.ok(m.estados.get('p1').usadas.has('digital'), 'digital no quedó usada');
  await m.onUnload();
});

test('regresión: escandallo.coste.calculado sigue marcando escandallo usada', async () => {
  const { m, mqtt } = await nuevoModulo();
  emitir(mqtt, 'escandallo.coste.calculado', { project_id: 'p1', receta_id: 'masa', coste_unidad: 1.2 });
  assert.ok(m.estados.get('p1').usadas.has('escandallo'));
  await m.onUnload();
});

test('una capacidad usada SALE de la brecha (deja de ofrecerse)', async () => {
  const { m, mqtt } = await nuevoModulo();
  emitir(mqtt, 'carta.html.generada', { project_id: 'p1', carta_id: 'c1', filename: 'c1__x.html' });
  const res = await m.handleBrecha({ project_id: 'p1' });
  const ofreceDiseno = res.data.brecha.some(i => i.id === 'diseno');
  assert.strictEqual(ofreceDiseno, false, 'diseno seguía en la brecha tras construirse (nag perpetuo)');
  await m.onUnload();
});

test('sin project_id no marca nada (no hay capacidad sin proyecto)', async () => {
  const { m, mqtt } = await nuevoModulo();
  emitir(mqtt, 'carta.html.generada', { carta_id: 'c1', filename: 'c1__x.html' });
  assert.strictEqual(m.estados.size, 0);
  await m.onUnload();
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[conserje__senales-usada] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[conserje__senales-usada] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

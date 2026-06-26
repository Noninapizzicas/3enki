'use strict';

/**
 * ai-gateway · interruptor de la SINTONÍA — on/off en el panel central.
 *
 * La lente de sintonía se inyecta al frente de cada turno real (this.sintoniaActiva).
 * Esta suite fija el contrato del botón, igual que conserje:
 *   - ON por defecto (preserva el comportamiento previo: hoy siempre se inyectaba),
 *   - registra 'sintonizador' en el panel (grupo 'chat', default true),
 *   - onInterruptorCambiado enciende/apaga en caliente y solo reacciona a su id,
 *   - onSolicitarRegistro re-registra (cura la carrera de arranque).
 *
 * Ejecutar: node tests/unit/ai-gateway__sintonia-interruptor.test.js
 */

const assert = require('assert');
const AiGateway = require('../../modules/conversacion/ai-gateway');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevoModulo() {
  const m = new AiGateway();
  const publicados = [];
  m.eventBus = { publish: (event, payload) => publicados.push({ event, payload }) };
  m.logger = { warn() {}, info() {} };
  return { m, publicados };
}

test('ON por defecto (preserva el comportamiento previo: siempre se inyectaba)', () => {
  const { m } = nuevoModulo();
  assert.strictEqual(m.sintoniaActiva, true);
});

test('_registrarBotonSintonia publica interruptor.registrar id=sintonizador grupo=chat default=true', () => {
  const { m, publicados } = nuevoModulo();
  m._registrarBotonSintonia();
  const reg = publicados.find(p => p.event === 'interruptor.registrar');
  assert.ok(reg, 'no publicó interruptor.registrar');
  assert.strictEqual(reg.payload.id, 'sintonizador');
  assert.strictEqual(reg.payload.grupo, 'chat');
  assert.strictEqual(reg.payload.default, true);
  assert.ok(reg.payload.label && reg.payload.label.length > 0);
});

test('onInterruptorCambiado apaga y enciende en caliente (su id)', () => {
  const { m } = nuevoModulo();
  m.onInterruptorCambiado({ data: { id: 'sintonizador', enabled: false } });
  assert.strictEqual(m.sintoniaActiva, false);
  m.onInterruptorCambiado({ data: { id: 'sintonizador', enabled: true } });
  assert.strictEqual(m.sintoniaActiva, true);
});

test('onInterruptorCambiado ignora otros ids (no toca la sintonía)', () => {
  const { m } = nuevoModulo();
  m.onInterruptorCambiado({ data: { id: 'conserje', enabled: false } });
  assert.strictEqual(m.sintoniaActiva, true);
});

test('acepta el evento sin envoltorio .data (tolerante a la forma del bus)', () => {
  const { m } = nuevoModulo();
  m.onInterruptorCambiado({ id: 'sintonizador', enabled: false });
  assert.strictEqual(m.sintoniaActiva, false);
});

test('onSolicitarRegistro re-registra el botón (carrera de arranque)', () => {
  const { m, publicados } = nuevoModulo();
  m.onSolicitarRegistro();
  const regs = publicados.filter(p => p.event === 'interruptor.registrar' && p.payload.id === 'sintonizador');
  assert.strictEqual(regs.length, 1);
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[ai-gateway__sintonia-interruptor] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[ai-gateway__sintonia-interruptor] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

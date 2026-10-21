/**
 * Tests unitarios — motor-encadenamiento (REFLEJO del taller 3D, F4 TANDA 3).
 *
 * Sin bus real: instancia el reflejo con eventBus stub que captura ambos sentidos
 * (publish normal + subscribe para _rpc) y verifica la proyección _alTerminar:
 *   - con siguiente lista → encadena disparando ciclo-impresion.iniciar.request
 *   - sin siguiente (NULO) → emite cola_vacia (impresora ociosa)
 *   - CERO juicio: nunca decide SI imprimir, solo encadena la cabecera lista
 *
 * Ejecutar: node modules/motor-encadenamiento/tests/unit/motor-encadenamiento.test.js
 */

'use strict';

const assert = require('assert');

const MotorEncadenamiento = require('../../index.js');

function makeMocks() {
  const published = [];
  const handlers = {};
  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  const metrics = { increment: () => {} };
  // subscribe SÍNCRONO para que _rpc reciba el unsubscribe devuelto de inmediato.
  const respond = (ev, payload) => {
    const respEv = ev.replace('.request', '.response');
    const handler = handlers[respEv];
    if (handler) handler({ data: { request_id: payload.request_id, status: 200, data: { siguiente: null } } });
    else throw new Error(`sin response simulada para ${respEv}`);
  };
  const eventBus = {
    publish: async (event, payload) => {
      published.push([event, payload]);
      if (event.endsWith('.request')) respond(event, payload); // auto-responde RPC
    },
    subscribe: (event, handler) => { handlers[event] = handler; return () => {}; }
  };
  return { published, handlers, logger, metrics, eventBus };
}

async function setup() {
  const mocks = makeMocks();
  const m = new MotorEncadenamiento();
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus });
  return { m, ...mocks };
}

const PID = '3d';

(async () => {
  // ── 1. con siguiente lista (input.siguiente) → encadena el ciclo ──
  {
    const { m, published } = await setup();
    const siguiente = { id: 'tarea_2', modelo_id: 'mod_b', archivo_id: 'arc_2' };
    const r = await m._alTerminar({ project_id: PID, tarea_id: 'tarea_1', siguiente });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.encadenada, true, 'encadena la siguiente');
    // dispara ciclo-impresion.iniciar.request
    const inicio = published.find(p => p[0] === 'ciclo-impresion.iniciar.request');
    assert.ok(inicio, 'dispara ciclo-impresion.iniciar.request');
    assert.strictEqual(inicio[1].modelo_id, 'mod_b');
    assert.strictEqual(inicio[1].tarea_id, 'tarea_2');
    // NO emite cola_vacia
    assert.ok(!published.some(p => p[0] === 'cola_vacia'), 'no cola_vacia si hay siguiente');
  }
  console.log('✓ motor-encadenamiento: encadena la siguiente lista disparando el ciclo');

  // ── 2. sin siguiente (NULO) → emite cola_vacia (impresora ociosa) ──
  {
    const { m, published } = await setup();
    const r = await m._alTerminar({ project_id: PID, tarea_id: 'tarea_1', siguiente: null });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.encadenada, false);
    assert.strictEqual(r.data.cola_vacia, true);
    const vacia = published.find(p => p[0] === 'cola_vacia');
    assert.ok(vacia, 'emite cola_vacia');
    // NO dispara el ciclo
    assert.ok(!published.some(p => p[0].startsWith('ciclo-impresion.')), 'no dispara ciclo');
  }
  console.log('✓ motor-encadenamiento: sin siguiente emite cola_vacia');

  // ── 3. delega a la cola por RPC cuando no llega input.siguiente ──
  {
    const { m, handlers } = await setup();
    const siguiente = { id: 'tarea_x', modelo_id: 'mod_x', archivo_id: 'arc_x' };
    // simular la respuesta de la cola cuando el motor hace _rpc('cola.siguiente.request')
    const _publishReal = (ev, payload) => {
      const respEv = ev.replace('.request', '.response');
      const handler = handlers[respEv];
      if (handler) handler({ data: { request_id: payload.request_id, status: 200, data: { siguiente } } });
    };
    m.eventBus.publish = _publishReal;
    const r = await m._alTerminar({ project_id: PID, tarea_id: 'tarea_1' });
    assert.strictEqual(r.data.encadenada, true, 'encadena lo que la cola devuelve como siguiente');
    assert.strictEqual(r.data.pieza.modelo_id, 'mod_x');
  }
  console.log('✓ motor-encadenamiento: delega la siguiente a la cola por RPC');

  // ── 4. CERO juicio: la cola ofreció NULO → no decide SI imprimir, avisa ociosa ──
  {
    const { m, published } = await setup();
    const r = await m._alTerminar({ project_id: PID, siguiente: { siguiente: null } });
    // el motor no inventa una siguiente: respeta el NULO de la cola
    assert.strictEqual(r.data.encadenada, false);
    assert.strictEqual(r.data.cola_vacia, true);
    assert.ok(published.some(p => p[0] === 'cola_vacia'), 'avisa impresora ociosa, no decide');
  }
  console.log('✓ motor-encadenamiento: CERO juicio (respeta NULO de la cola)');

  // ── 5. validaciones ──
  {
    const { m } = await setup();
    const noPid = await m._alTerminar({ tarea_id: 't' });
    assert.strictEqual(noPid.status, 400, 'exige project_id');
  }
  console.log('✓ motor-encadenamiento: validaciones');

  console.log('\n✅ TODOS LOS TESTS DE MOTOR-ENCADENAMIENTO PASAN');
})().catch((err) => { console.error('✗ TEST FALLÓ:', err); process.exit(1); });

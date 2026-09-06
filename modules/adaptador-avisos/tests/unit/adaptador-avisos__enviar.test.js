'use strict';

/**
 * adaptador-avisos — REFLEJO _enviar (la proyeccion principal del PUENTE).
 *
 * El adaptador es un PUENTE: sin store, escucha el evento de aviso, construye
 * el mensaje (CONVERSOR interno _construirMensaje) y lo envia por el canal del
 * dueno (telegram-bridge) con ack. Esta suite fija el contrato:
 *   - aviso valido + canal confirma (ok:true) → status 200, enviado:true.
 *   - aviso valido + canal NO confirma → 502 CANAL_NO_CONFIRMO (nadie da por
 *     hecho el envio sin ok:true explicito).
 *   - sin project_id → INVALID_INPUT (400).
 *   - tipo no reconocido → INVALID_INPUT (400).
 *   - _construirMensaje genera el template correcto por tipo (4.1).
 *   - _tiposAviso enumera los 5 tipos (4.3).
 *   - aviso.solicitar (fire-and-forget) emite adaptador-avisos.enviar.failed
 *     cuando el canal no confirma (todo flujo cierra su circulo).
 *
 * Sin bus real: _enviar se invoca directa con un eventBus fake que simula el
 * ack de telegram.send_message.response correlado por request_id.
 * Ejecutar: node /tmp/adaptador-avisos/tests/unit/adaptador-avisos__enviar.test.js
 */

const assert = require('assert');
const AdaptadorAvisos = require('../../index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// eventBus fake: correlaciona telegram.send_message.request → response.
function fakeBus({ ackOk = true } = {}) {
  const subs = new Map();
  return {
    publish(ev, d) {
      if (ev === 'telegram.send_message.request') {
        const handlers = subs.get('telegram.send_message.response') || [];
        for (const h of handlers) h({ data: { request_id: d.request_id, ok: ackOk } });
      }
    },
    subscribe(ev, fn) {
      if (!subs.has(ev)) subs.set(ev, []);
      subs.get(ev).push(fn);
      return () => { subs.set(ev, (subs.get(ev) || []).filter(f => f !== fn)); };
    }
  };
}

function nuevoReflejo(opts) {
  const m = new AdaptadorAvisos();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m.eventBus = fakeBus(opts);
  return m;
}

test('aviso valido + canal confirma → status 200, enviado:true', async () => {
  const m = nuevoReflejo({ ackOk: true });
  const r = await m._enviar({ project_id: 'proj-1', tipo: 'terminado', nombre: 'Soporte' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.enviado, true);
  assert.strictEqual(r.data.tipo, 'terminado');
  assert.ok(r.data.aviso_id, 'genera aviso_id');
});

test('aviso valido + canal NO confirma → 502 CANAL_NO_CONFIRMO', async () => {
  const m = nuevoReflejo({ ackOk: false });
  const r = await m._enviar({ project_id: 'proj-1', tipo: 'fallo', nombre: 'Caja' });
  assert.strictEqual(r.status, 502);
  assert.strictEqual(r.error.code, 'CANAL_NO_CONFIRMO');
});

test('sin project_id → INVALID_INPUT (400)', async () => {
  const m = nuevoReflejo();
  const r = await m._enviar({ tipo: 'terminado' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
});

test('tipo no reconocido → INVALID_INPUT (400)', async () => {
  const m = nuevoReflejo();
  const r = await m._enviar({ project_id: 'proj-1', tipo: 'explosion' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
});

test('canal no soportado → INVALID_INPUT (400)', async () => {
  const m = nuevoReflejo();
  const r = await m._enviar({ project_id: 'proj-1', tipo: 'terminado', canal: 'discord' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
});

test('_construirMensaje genera template por tipo (4.1)', () => {
  const m = nuevoReflejo();
  const msg = m._construirMensaje('cambio_filamento', { nombre: 'Engranaje', material: 'PLA' });
  assert.ok(msg.includes('Cambia el filamento'), 'titulo del tipo');
  assert.ok(msg.includes('Pieza: Engranaje'), 'nombre de la pieza');
  assert.ok(msg.includes('Material: PLA'), 'material');
  // dato ausente → se omite del mensaje (nunca se inventa un valor)
  const msg2 = m._construirMensaje('cola_vacia', {});
  assert.ok(msg2.includes('Cola de impresion vacia'));
  assert.ok(!msg2.includes('Pieza:'), 'sin nombre no inventa pieza');
  assert.ok(!msg2.includes('Material:'), 'sin material no inventa material');
});

test('_tiposAviso enumera los 5 tipos (4.3)', () => {
  const m = nuevoReflejo();
  const tipos = m._tiposAviso();
  assert.deepStrictEqual(tipos, ['terminado', 'cambio_filamento', 'fallo', 'cola_vacia', 'filamento_bajo']);
});

test('aviso.solicitar con canal que no confirma → emite enviar.failed', async () => {
  const m = nuevoReflejo({ ackOk: false });
  let failed = null;
  const origPublish = m.eventBus.publish.bind(m.eventBus);
  m.eventBus.publish = (ev, d) => {
    if (ev === 'adaptador-avisos.enviar.failed') failed = d;
    return origPublish(ev, d);
  };
  const r = await m.onAvisoSolicitar({ data: { project_id: 'proj-1', tipo: 'fallo' } });
  assert.ok(r.status >= 400, 'el envio fallo');
  assert.ok(failed, 'emite adaptador-avisos.enviar.failed');
  assert.strictEqual(failed.tipo, 'fallo');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[adaptador-avisos__enviar] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[adaptador-avisos__enviar] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

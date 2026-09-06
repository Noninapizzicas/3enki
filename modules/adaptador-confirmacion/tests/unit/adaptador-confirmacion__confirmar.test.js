'use strict';

/**
 * adaptador-confirmacion — REFLEJO _confirmar + _interpretarConfirmacion
 * (las proyecciones del PUENTE).
 *
 * El adaptador es un PUENTE: sin store, recibe la confirmacion del dueno por
 * el puerto 'confirmar(tipo) → ok' (RPC) y por el canal del dueno
 * (telegram.callback.received), la interpreta (CONVERSOR interno
 * _interpretarConfirmacion, pieza 12.2) y la entrega al sistema publicando
 * adaptador-confirmacion.confirmacion_recibida. Esta suite fija el contrato:
 *   - confirmar valido + canal confirma (ok:true) → status 200, pedida:true.
 *   - confirmar valido + canal NO confirma → 502 CANAL_NO_CONFIRMO (nadie da
 *     por hecho el envio sin ok:true explicito).
 *   - sin project_id → INVALID_INPUT (400).
 *   - tipo no reconocido → INVALID_INPUT (400).
 *   - _interpretarConfirmacion mapea boton → tipo (12.2): retirar, filamento,
 *     reanudar, aprobar, rechazar.
 *   - _interpretarConfirmacion con texto no reconocido → 400
 *     CONFIRMACION_NO_RECONOCIDA (pide aclaracion, no inventa).
 *   - telegram.callback.received (fire-and-forget) publica
 *     adaptador-confirmacion.confirmacion_recibida con el tipo interpretado.
 *   - telegram.callback.received con tipo no reconocido → emite
 *     adaptador-confirmacion.confirmar.failed (todo flujo cierra su circulo).
 *
 * Sin bus real: _confirmar se invoca directa con un eventBus fake que simula
 * el ack de telegram.send_message.response correlado por request_id.
 * Ejecutar: node /tmp/adaptador-confirmacion/tests/unit/adaptador-confirmacion__confirmar.test.js
 */

const assert = require('assert');
const AdaptadorConfirmacion = require('../../index.js');

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
  const m = new AdaptadorConfirmacion();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m.eventBus = fakeBus(opts);
  return m;
}

test('confirmar valido + canal confirma → status 200, pedida:true', async () => {
  const m = nuevoReflejo({ ackOk: true });
  const r = await m._confirmar({ project_id: 'proj-1', tipo: 'pieza_retirada', nombre: 'Soporte' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.pedida, true);
  assert.strictEqual(r.data.tipo, 'pieza_retirada');
  assert.ok(r.data.confirmacion_id, 'genera confirmacion_id');
});

test('confirmar valido + canal NO confirma → 502 CANAL_NO_CONFIRMO', async () => {
  const m = nuevoReflejo({ ackOk: false });
  const r = await m._confirmar({ project_id: 'proj-1', tipo: 'filamento_cambiado' });
  assert.strictEqual(r.status, 502);
  assert.strictEqual(r.error.code, 'CANAL_NO_CONFIRMO');
});

test('sin project_id → INVALID_INPUT (400)', async () => {
  const m = nuevoReflejo();
  const r = await m._confirmar({ tipo: 'pieza_retirada' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
});

test('tipo no reconocido → INVALID_INPUT (400)', async () => {
  const m = nuevoReflejo();
  const r = await m._confirmar({ project_id: 'proj-1', tipo: 'explosion' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
});

test('canal no soportado → INVALID_INPUT (400)', async () => {
  const m = nuevoReflejo();
  const r = await m._confirmar({ project_id: 'proj-1', tipo: 'pieza_retirada', canal: 'discord' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
});

test('_interpretarConfirmacion mapea boton → tipo (12.2)', () => {
  const m = nuevoReflejo();
  assert.strictEqual(m._interpretarConfirmacion({ callback_data: 'pieza_retirada' }).data.tipo, 'pieza_retirada');
  assert.strictEqual(m._interpretarConfirmacion({ callback_data: 'filamento_cambiado' }).data.tipo, 'filamento_cambiado');
  assert.strictEqual(m._interpretarConfirmacion({ callback_data: 'reanudar_ciclo' }).data.tipo, 'reanudar_ciclo');
  assert.strictEqual(m._interpretarConfirmacion({ callback_data: 'modelo_aprobado' }).data.tipo, 'modelo_aprobado');
  assert.strictEqual(m._interpretarConfirmacion({ callback_data: 'modelo_rechazado' }).data.tipo, 'modelo_rechazado');
  // respuesta libre del dueno (texto) tambien se interpreta
  assert.strictEqual(m._interpretarConfirmacion({ text: 'retirar' }).data.tipo, 'pieza_retirada');
  assert.strictEqual(m._interpretarConfirmacion({ text: 'Aprobar' }).data.tipo, 'modelo_aprobado');
});

test('_interpretarConfirmacion con texto no reconocido → 400 CONFIRMACION_NO_RECONOCIDA', () => {
  const m = nuevoReflejo();
  const r = m._interpretarConfirmacion({ callback_data: 'no_se_que_es_esto' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'CONFIRMACION_NO_RECONOCIDA');
});

test('_tiposConfirmacion enumera los 5 tipos (12.2)', () => {
  const m = nuevoReflejo();
  assert.deepStrictEqual(m._tiposConfirmacion(), ['pieza_retirada', 'filamento_cambiado', 'reanudar_ciclo', 'modelo_aprobado', 'modelo_rechazado']);
});

test('telegram.callback.received valido → publica confirmacion_recibida', async () => {
  const m = nuevoReflejo();
  let recibida = null;
  const origPublish = m.eventBus.publish.bind(m.eventBus);
  m.eventBus.publish = (ev, d) => {
    if (ev === 'adaptador-confirmacion.confirmacion_recibida') recibida = d;
    return origPublish(ev, d);
  };
  const r = await m.onTelegramCallbackReceived({ data: { project_id: 'proj-1', callback_data: 'pieza_retirada', pieza_id: 'p-1' } });
  assert.strictEqual(r.status, 200);
  assert.ok(recibida, 'publica adaptador-confirmacion.confirmacion_recibida');
  assert.strictEqual(recibida.tipo, 'pieza_retirada');
  assert.strictEqual(recibida.contexto.pieza_id, 'p-1');
});

test('telegram.callback.received no reconocido → emite confirmar.failed', async () => {
  const m = nuevoReflejo();
  let failed = null;
  const origPublish = m.eventBus.publish.bind(m.eventBus);
  m.eventBus.publish = (ev, d) => {
    if (ev === 'adaptador-confirmacion.confirmar.failed') failed = d;
    return origPublish(ev, d);
  };
  const r = await m.onTelegramCallbackReceived({ data: { project_id: 'proj-1', callback_data: 'basura' } });
  assert.ok(r.status >= 400, 'la confirmacion no se reconocio');
  assert.ok(failed, 'emite adaptador-confirmacion.confirmar.failed');
  assert.strictEqual(failed.tipo, 'no_reconocida');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[adaptador-confirmacion__confirmar] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[adaptador-confirmacion__confirmar] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

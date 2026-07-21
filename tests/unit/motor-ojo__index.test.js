'use strict';

/**
 * motor-ojo__index — el PUENTE bus↔HTTP al primer órgano sensorial (render).
 * Simula el servicio enki-sense overrideando _motorCall. Verifica la proyección
 * al bus, la validación (tipo/fuente), la degradación honesta (interruptor OFF /
 * motor caído → 503), el 422 cuando el motor no puede, y que OFF ni toca el motor.
 *
 * Ejecutar: node tests/unit/motor-ojo__index.test.js
 */

const assert = require('assert');
const Mod = require('../../modules/motor-ojo');

function nuevo() {
  const m = new Mod();
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  m.metrics = { increment() {} };
  m.eventBus = { publish() {} };
  m._timeoutMs = 200;
  return m;
}

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('render feliz → {base64, ext, tipo} proyectado al bus', async () => {
  const m = nuevo();
  let visto;
  m._motorCall = async (path, payload) => { visto = { path, payload }; return { status: 200, body: { base64: 'QUJD', ext: 'pdf' } }; };
  const r = await m._render({ tipo: 'pdf', fuente: '# carta' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(visto.path, '/render');
  assert.strictEqual(visto.payload.tipo, 'pdf');
  assert.strictEqual(r.data.base64, 'QUJD');
  assert.strictEqual(r.data.ext, 'pdf');
});

test('SIN BOTÓN: renderiza sin ningún interruptor (nace operativo)', async () => {
  const m = nuevo();
  assert.strictEqual('activo' in m, false, 'no existe el concepto de activo/botón');
  assert.strictEqual(typeof m._guard, 'undefined', 'no hay _guard de interruptor');
  m._motorCall = async () => ({ status: 200, body: { base64: 'QQ==', ext: 'png' } });
  const r = await m._render({ tipo: 'imagen', fuente: '<svg/>' });
  assert.strictEqual(r.status, 200, 'opera desde el minuto 1, sin encender nada');
});

test('motor caído (throw) → 503 sin_motor', async () => {
  const m = nuevo();
  m._motorCall = async () => { throw new Error('ECONNREFUSED'); };
  const r = await m._render({ tipo: 'pdf', fuente: 'x' });
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.error.details.motivo, 'sin_motor');
});

test('el motor no puede (responde {fallo}) → 422 RENDER_FALLIDO, no inventa bytes', async () => {
  const m = nuevo();
  m._motorCall = async () => ({ status: 200, body: { fallo: { tipo: 'error', motivo: 'SVG malformado' } } });
  const r = await m._render({ tipo: 'svg', fuente: '<svg' });
  assert.strictEqual(r.status, 422);
  assert.strictEqual(r.error.code, 'RENDER_FALLIDO');
});

test('validaciones: tipo ausente/ inválido → 400; fuente vacía → 400', async () => {
  const m = nuevo();
  m._motorCall = async () => ({ status: 200, body: { base64: 'x' } });
  assert.strictEqual((await m._render({ fuente: 'x' })).status, 400);
  assert.strictEqual((await m._render({ tipo: 'gif', fuente: 'x' })).status, 400);
  assert.strictEqual((await m._render({ tipo: 'pdf', fuente: '' })).status, 400);
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`\n[motor-ojo__index] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`\n[motor-ojo__index] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}\n    ${e.message}`);
  process.exit(1);
})();

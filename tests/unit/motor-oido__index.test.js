'use strict';

/**
 * motor-oido__index — el PUENTE bus↔HTTP al 3er órgano sensorial (transcribir).
 * Simula el servicio overrideando _motorCall. Verifica la proyección, la
 * validación, la degradación honesta (sin_motor), y que nace SIN botón.
 *
 * Ejecutar: node tests/unit/motor-oido__index.test.js
 */

const assert = require('assert');
const Mod = require('../../modules/motor-oido');

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

test('SIN BOTÓN: transcribe sin ningún interruptor (nace operativo)', async () => {
  const m = nuevo();
  assert.strictEqual('activo' in m, false);
  assert.strictEqual(typeof m._guard, 'undefined');
  m._motorCall = async () => ({ status: 200, body: { texto: 'hola mundo', idioma: 'es', confianza: 0.9 } });
  const r = await m._transcribir({ audio_base64: 'UklGRg==' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.texto, 'hola mundo');
  assert.strictEqual(r.data.idioma, 'es');
});

test('normaliza el idioma pasado (es-ES → es)', async () => {
  const m = nuevo();
  let visto;
  m._motorCall = async (p, payload) => { visto = payload; return { status: 200, body: { texto: 'x' } }; };
  await m._transcribir({ audio_base64: 'AAAA', idioma: 'es-ES' });
  assert.strictEqual(visto.idioma, 'es');
});

test('motor caído (throw) → 503 sin_motor', async () => {
  const m = nuevo();
  m._motorCall = async () => { throw new Error('ECONNREFUSED'); };
  const r = await m._transcribir({ audio_base64: 'AAAA' });
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.error.details.motivo, 'sin_motor');
});

test('el motor falla ({fallo}) → 502 TRANSCRIPCION_FALLIDA', async () => {
  const m = nuevo();
  m._motorCall = async () => ({ status: 200, body: { fallo: { tipo: 'error', motivo: 'audio corrupto' } } });
  const r = await m._transcribir({ audio_base64: 'AAAA' });
  assert.strictEqual(r.status, 502);
  assert.strictEqual(r.error.code, 'TRANSCRIPCION_FALLIDA');
});

test('sin audio_base64 → 400', async () => {
  const m = nuevo();
  m._motorCall = async () => ({ status: 200, body: { texto: 'x' } });
  assert.strictEqual((await m._transcribir({})).status, 400);
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`\n[motor-oido__index] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`\n[motor-oido__index] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}\n    ${e.message}`);
  process.exit(1);
})();

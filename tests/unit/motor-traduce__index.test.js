'use strict';

/**
 * motor-traduce__index — el PUENTE bus↔HTTP al 2º órgano sensorial (traducir).
 * Simula el servicio overrideando _motorCall. Verifica la proyección, la
 * normalización de idioma, el passthrough de==a, el 422 par no soportado, la
 * degradación honesta (sin_motor), y que nace SIN botón (operativo ya).
 *
 * Ejecutar: node tests/unit/motor-traduce__index.test.js
 */

const assert = require('assert');
const Mod = require('../../modules/motor-traduce');

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

test('SIN BOTÓN: traduce sin ningún interruptor (nace operativo)', async () => {
  const m = nuevo();
  assert.strictEqual('activo' in m, false);
  assert.strictEqual(typeof m._guard, 'undefined');
  m._motorCall = async () => ({ status: 200, body: { texto_traducido: 'Hello' } });
  const r = await m._traducir({ texto: 'Hola', de: 'es', a: 'en' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.texto_traducido, 'Hello');
});

test('normaliza códigos de idioma (es-ES → es, EN → en)', async () => {
  const m = nuevo();
  let visto;
  m._motorCall = async (path, payload) => { visto = payload; return { status: 200, body: { texto_traducido: 'x' } }; };
  await m._traducir({ texto: 'Hola', de: 'es-ES', a: 'EN' });
  assert.strictEqual(visto.de, 'es');
  assert.strictEqual(visto.a, 'en');
});

test('de == a → passthrough sin tocar el motor', async () => {
  const m = nuevo();
  let tocado = false;
  m._motorCall = async () => { tocado = true; return { status: 200, body: {} }; };
  const r = await m._traducir({ texto: 'Hola', de: 'es', a: 'es-ES' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.texto_traducido, 'Hola');
  assert.strictEqual(r.data.sin_cambio, true);
  assert.strictEqual(tocado, false);
});

test('par no soportado → 422 PAR_NO_SOPORTADO (no inventa traducción)', async () => {
  const m = nuevo();
  m._motorCall = async () => ({ status: 200, body: { fallo: { tipo: 'par_no_soportado', motivo: 'no hay modelo es→ja' } } });
  const r = await m._traducir({ texto: 'Hola', de: 'es', a: 'ja' });
  assert.strictEqual(r.status, 422);
  assert.strictEqual(r.error.code, 'PAR_NO_SOPORTADO');
});

test('motor caído (throw) → 503 sin_motor', async () => {
  const m = nuevo();
  m._motorCall = async () => { throw new Error('ECONNREFUSED'); };
  const r = await m._traducir({ texto: 'Hola', de: 'es', a: 'en' });
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.error.details.motivo, 'sin_motor');
});

test('validaciones: falta texto/de/a → 400', async () => {
  const m = nuevo();
  m._motorCall = async () => ({ status: 200, body: { texto_traducido: 'x' } });
  assert.strictEqual((await m._traducir({ de: 'es', a: 'en' })).status, 400);
  assert.strictEqual((await m._traducir({ texto: 'h', a: 'en' })).status, 400);
  assert.strictEqual((await m._traducir({ texto: 'h', de: 'es' })).status, 400);
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`\n[motor-traduce__index] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`\n[motor-traduce__index] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}\n    ${e.message}`);
  process.exit(1);
})();

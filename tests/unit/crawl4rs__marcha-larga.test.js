'use strict';

/**
 * crawl4rs__marcha-larga — la MARCHA LARGA sobre OBSCURA (login → sesión).
 * Simula el navegador overrideando los seams (_ejecutarLogin / _render). Verifica:
 *   - entrar: login en obscura → captura storageState, devuelve un sesion_id handle.
 *   - abrir: reusa la sesión por sesion_id → _render con el storageState inyectado
 *     (+ interceptar → JSON de la API interna).
 *   - el storageState (secreto) nunca sale al bus; el LLM solo maneja el handle.
 *   - degradación honesta (interruptor OFF, obscura caída → 503 sin_navegador).
 *   - sesión caducada / desconocida → 409; login fallido → 502; validaciones.
 *
 * Ejecutar: node tests/unit/crawl4rs__marcha-larga.test.js
 */

const assert = require('assert');
const Mod = require('../../modules/crawl4rs');

function nuevo({ activo = true } = {}) {
  const m = new Mod();
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  m.metrics = { increment() {} };
  m.eventBus = { publish() {} };
  m.activo = activo;
  m._timeoutMs = 200;
  return m;
}

const PASOS = [
  { tipo: 'fill', selector: "input[name='email']", valor: 'yo@ej.com' },
  { tipo: 'fill', selector: "input[name='password']", valor: 'secreto' },
  { tipo: 'click', selector: "button[type='submit']" },
  { tipo: 'wait', selector: 'a.cuenta' }
];
const STORAGE = { cookies: [{ name: 'sid', value: 'abc' }], origins: [] };

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('entrar feliz → sesion_id handle (NO devuelve el storageState)', async () => {
  const m = nuevo();
  let visto;
  m._ejecutarLogin = async (url, pasos) => { visto = { url, pasos }; return { storageState: STORAGE, final_url: 'https://x/my-account' }; };
  const r = await m._entrar({ url: 'https://x/login', pasos: PASOS });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(visto.url, 'https://x/login');
  assert.deepStrictEqual(visto.pasos, PASOS, 'reenvía el guion tal cual');
  assert.ok(r.data.sesion_id.startsWith('ses_'), 'devuelve un handle');
  assert.strictEqual(r.data.final_url, 'https://x/my-account');
  assert.strictEqual(JSON.stringify(r.data).includes('abc'), false, 'el storageState NUNCA sale al bus');
});

test('abrir reusa la sesión por sesion_id e intercepta el JSON de la API', async () => {
  const m = nuevo();
  m._ejecutarLogin = async () => ({ storageState: STORAGE, final_url: 'u' });
  m._render = async (url, opts) => {
    assert.deepStrictEqual(opts.storageState, STORAGE, 'inyecta el storageState guardado');
    assert.deepStrictEqual(opts.interceptar, { contiene: ['/api/'] });
    return { html: '<b>ok</b>', final_url: url, status: 200, intercepted: [{ url: 'https://x/api/precios', status: 200, json: { precio: 9 } }] };
  };
  const ent = await m._entrar({ url: 'https://x/login', pasos: PASOS });
  const r = await m._abrir({ url: 'https://x/catalogo', sesion_id: ent.data.sesion_id, interceptar: { contiene: ['/api/'] } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.html, '<b>ok</b>');
  assert.deepStrictEqual(r.data.intercepted[0].json, { precio: 9 });
});

test('GATE: interruptor OFF → 503 apagado, sin tocar el navegador', async () => {
  const m = nuevo({ activo: false });
  let tocado = false;
  m._ejecutarLogin = async () => { tocado = true; return {}; };
  const r = await m._entrar({ url: 'https://x/login', pasos: PASOS });
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.error.details.motivo, 'apagado');
  assert.strictEqual(tocado, false);
});

test('obscura caída (throw) → 503 sin_navegador', async () => {
  const m = nuevo();
  m._ejecutarLogin = async () => { throw new Error('ECONNREFUSED'); };
  const r = await m._entrar({ url: 'https://x/login', pasos: PASOS });
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.error.details.motivo, 'sin_navegador');
});

test('login fallido ({fallo}) → 502 LOGIN_FALLIDO, sin sesión', async () => {
  const m = nuevo();
  m._ejecutarLogin = async () => ({ fallo: { tipo: 'error', motivo: 'selector no encontrado' } });
  const r = await m._entrar({ url: 'https://x/login', pasos: PASOS });
  assert.strictEqual(r.status, 502);
  assert.strictEqual(r.error.code, 'LOGIN_FALLIDO');
  assert.strictEqual(m._sesiones.size, 0, 'no guarda sesión si el login no cuajó');
});

test('abrir con sesion_id desconocido → 409 SESION_DESCONOCIDA', async () => {
  const m = nuevo();
  m._render = async () => { throw new Error('no debería llamar'); };
  const r = await m._abrir({ url: 'https://x/y', sesion_id: 'ses_inexistente' });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'SESION_DESCONOCIDA');
});

test('sesión caducada (TTL) → 409', async () => {
  const m = nuevo();
  m._sesionTtlMs = 5;
  m._ejecutarLogin = async () => ({ storageState: STORAGE, final_url: 'u' });
  const ent = await m._entrar({ url: 'https://x/login', pasos: PASOS });
  await new Promise((r) => setTimeout(r, 10));
  const r = await m._abrir({ url: 'https://x/y', sesion_id: ent.data.sesion_id });
  assert.strictEqual(r.status, 409);
});

test('validaciones: entrar sin pasos → 400; abrir sin sesion_id → 400', async () => {
  const m = nuevo();
  assert.strictEqual((await m._entrar({ url: 'https://x/login' })).status, 400);
  assert.strictEqual((await m._entrar({ url: 'https://x/login', pasos: [] })).status, 400);
  assert.strictEqual((await m._abrir({ url: 'https://x/y' })).status, 400);
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`\n[crawl4rs__marcha-larga] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`\n[crawl4rs__marcha-larga] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}\n    ${e.message}`);
  process.exit(1);
})();

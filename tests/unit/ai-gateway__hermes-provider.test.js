'use strict';

/**
 * ai-gateway__hermes-provider — el agente Hermes como trabajador GOBERNADO de Enki.
 *
 * El gobierno manda: interruptor 'hermes-agente' OFF → Hermes no existe para Enki
 * (ni auto-fallback ni selección explícita), aunque haya key y config enabled.
 * La memoria viaja en X-Hermes-Session-Key, scoped al proyecto por defecto.
 * Cada delegación (o intento) pasa por el audit del hermes-switch.
 *
 * Ejecutar: node tests/unit/ai-gateway__hermes-provider.test.js
 */

const assert = require('assert');
const HermesProvider = require('../../modules/conversacion/ai-gateway/providers/hermes-provider.js');
const hermesSwitch = require('../../modules/conversacion/ai-gateway/providers/hermes-switch.js');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

function prov(extra = {}) {
  const p = new HermesProvider(
    { enabled: true, api_base: 'http://127.0.0.1:8642', default_model: 'hermes-agent', ...extra },
    noopLogger
  );
  return p;
}

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('interruptor OFF → no disponible (aunque haya key y enabled)', async () => {
  hermesSwitch.setOn(false);
  const p = prov();
  p.apiKey = 'secreto';
  assert.strictEqual(await p.isAvailable(), false);
});

test('interruptor ON + key + enabled → disponible', async () => {
  hermesSwitch.setOn(true);
  const p = prov();
  p.apiKey = 'secreto';
  assert.strictEqual(await p.isAvailable(), true);
  hermesSwitch.setOn(false);
});

test('interruptor ON pero SIN key → no disponible (la key de Hermes es obligatoria)', async () => {
  hermesSwitch.setOn(true);
  delete process.env.HERMES_API_KEY;
  const p = prov();
  assert.strictEqual(await p.isAvailable(), false);
  hermesSwitch.setOn(false);
});

test('key desde env HERMES_API_KEY (fallback sin credential-manager)', async () => {
  hermesSwitch.setOn(true);
  process.env.HERMES_API_KEY = 'desde-env';
  const p = prov();
  assert.strictEqual(await p.isAvailable(), true);
  assert.strictEqual(p.apiKey, 'desde-env');
  delete process.env.HERMES_API_KEY;
  hermesSwitch.setOn(false);
});

test('session key: options.hermes_session_key manda', () => {
  const p = prov();
  assert.strictEqual(p._sessionKey({ hermes_session_key: 'mi-hilo' }), 'mi-hilo');
});

test('session key: proyecto actual → enki:<project_id> (memoria POR proyecto)', () => {
  const p = prov();
  p.setContext({ projectId: 'pizzeria' });
  assert.strictEqual(p._sessionKey({}), 'enki:pizzeria');
});

test('session key: sin proyecto ni option → config.session_key o enki:sistema', () => {
  const p = prov();
  assert.strictEqual(p._sessionKey({}), 'enki:sistema');
  const p2 = prov({ session_key: 'enki:global' });
  assert.strictEqual(p2._sessionKey({}), 'enki:global');
});

test('api_base default local (127.0.0.1:8642) desde config', () => {
  const p = prov();
  assert.strictEqual(p._apiBase(), 'http://127.0.0.1:8642');
});

test('chatCompletion con interruptor OFF → rechaza SIN tocar la red', async () => {
  hermesSwitch.setOn(false);
  const p = prov();
  p.apiKey = 'secreto';
  await assert.rejects(
    () => p.chatCompletion([{ role: 'user', content: 'hola' }]),
    /no disponible/
  );
});

test('audit: setAudit captura payload y un emisor que lanza NO rompe', () => {
  const capturados = [];
  hermesSwitch.setAudit((d) => capturados.push(d));
  hermesSwitch.audit({ ok: true, modo: 'chat' });
  assert.strictEqual(capturados.length, 1);
  assert.strictEqual(capturados[0].ok, true);

  hermesSwitch.setAudit(() => { throw new Error('emisor roto'); });
  assert.doesNotThrow(() => hermesSwitch.audit({ ok: false }));
  hermesSwitch.setAudit(null);
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`\n[ai-gateway__hermes-provider] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`\n[ai-gateway__hermes-provider] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}\n    ${e.message}`);
  process.exit(1);
})();

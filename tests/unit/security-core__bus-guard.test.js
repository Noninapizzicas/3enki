'use strict';

/**
 * BusGuard — la puerta guardada del broker.
 *
 * Verifica la escalera off→observe→enforce con un verifier y un getMode inyectados
 * (sin deps, sin broker real): que 'off' es abierto (retrocompatible), que 'observe'
 * audita pero PERMITE (aprende sin romper), y que 'enforce' bloquea al anónimo en los
 * dominios sensibles y rechaza la credencial inválida en CONNECT — con degradación honesta
 * si el verifier de certificate-authority se cae.
 *
 * Ejecutar: node tests/unit/security-core__bus-guard.test.js
 */

const assert = require('assert');
const BusGuard = require('../../core/broker/bus-guard');
const { policyPorDefecto, _dominioDeTopic } = require('../../core/broker/bus-guard');

function test(desc, fn) {
  try { fn(); console.log(`✓ ${desc}`); }
  catch (err) { console.error(`✗ ${desc}\n  ${err.message}`); process.exit(1); }
}
async function atest(desc, fn) {
  try { await fn(); console.log(`✓ ${desc}`); }
  catch (err) { console.error(`✗ ${desc}\n  ${err.message}`); process.exit(1); }
}

// Helpers: callbacks sincronizados a promesa para las firmas aedes.
const authP = (g, client, pass) => new Promise((res) => g.authenticate(client, 'u', pass, (err, ok) => res({ err, ok })));
const pubP = (g, client, topic) => new Promise((res) => g.authorizePublish(client, { topic }, (err) => res({ err })));
const subP = (g, client, topic) => new Promise((res) => g.authorizeSubscribe(client, { topic }, (err, sub) => res({ err, sub })));

// credencial cert válida = 'enki:cert:<base64(PEM)>' — el verifier fake la resuelve por contenido.
const credCert = (pem) => 'enki:cert:' + Buffer.from(pem, 'utf8').toString('base64');
const verifierFake = (pem) => {
  if (pem === 'PEM-VALIDO') return { valid: true, type: 'device', identifier: 'esp32-01' };
  return { valid: false, error: 'not signed by this CA' };
};

console.log('BusGuard — el bus como puerta guardada\n');

(async () => {
  // ── _dominioDeTopic: extrae el dominio del topic ──
  test('_dominioDeTopic: ui/request/<dominio>/<accion> → dominio', () => {
    assert.strictEqual(_dominioDeTopic('ui/request/credential/list'), 'credential');
    assert.strictEqual(_dominioDeTopic('ui/request/pizzepos/pedidos'), 'pizzepos');
    assert.strictEqual(_dominioDeTopic('core/core-a/events/x'), 'core');
  });

  // ── policyPorDefecto: el anónimo no toca lo sensible ──
  test('policy: anónimo + dominio sensible (credential) → DENY', () => {
    const v = policyPorDefecto({ anonymous: true }, 'ui/request/credential/list', 'publish');
    assert.strictEqual(v.allow, false);
    assert.strictEqual(v.reason, 'anonymous-sensitive-domain');
  });
  test('policy: anónimo + dominio normal (pizzepos) → ALLOW', () => {
    assert.strictEqual(policyPorDefecto({ anonymous: true }, 'ui/request/pizzepos/pedidos').allow, true);
  });
  test('policy: identidad válida + dominio sensible → ALLOW (tiene identidad)', () => {
    assert.strictEqual(policyPorDefecto({ anonymous: false, valid: true }, 'ui/request/credential/list').allow, true);
  });

  // ── off: abierto y retrocompatible ──
  await atest('off: authenticate SIEMPRE pasa y no exige credencial', async () => {
    const g = new BusGuard({ verifier: verifierFake, getMode: () => 'off' });
    const client = {};
    const r = await authP(g, client, null);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.err, null);
  });
  await atest('off: authorizePublish a dominio sensible pasa (broker abierto = hoy)', async () => {
    const g = new BusGuard({ getMode: () => 'off' });
    const r = await pubP(g, { id: 'x' }, 'ui/request/credential/delete');
    assert.strictEqual(r.err, null);
  });

  // ── observe: sella identidad, audita, pero PERMITE ──
  await atest('observe: anónimo a dominio sensible → PERMITE (aprende sin romper) y cuenta', async () => {
    const g = new BusGuard({ verifier: verifierFake, getMode: () => 'observe' });
    const client = {};
    await authP(g, client, null);
    assert.strictEqual(client.enkiIdentity.anonymous, true);
    const r = await pubP(g, client, 'ui/request/credential/list');
    assert.strictEqual(r.err, null, 'observe nunca bloquea');
    assert.strictEqual(g.stats.publish_denied, 1, 'pero lo auditó');
  });
  await atest('observe: credencial válida sella identidad (type/identifier)', async () => {
    const g = new BusGuard({ verifier: verifierFake, getMode: () => 'observe' });
    const client = {};
    await authP(g, client, credCert('PEM-VALIDO'));
    assert.strictEqual(client.enkiIdentity.valid, true);
    assert.strictEqual(client.enkiIdentity.identifier, 'esp32-01');
    assert.strictEqual(g.stats.authenticated, 1);
  });

  // ── enforce: bloquea de verdad ──
  await atest('enforce: anónimo a dominio sensible → BLOQUEA publish', async () => {
    const g = new BusGuard({ verifier: verifierFake, getMode: () => 'enforce' });
    const client = {};
    await authP(g, client, null);
    const r = await pubP(g, client, 'ui/request/credential/delete');
    assert.ok(r.err, 'enforce bloquea al anónimo en lo sensible');
    assert.strictEqual(r.err.returnCode, 4);
  });
  await atest('enforce: anónimo a dominio NORMAL → pasa (no rompe a los clientes legítimos aún sin cert)', async () => {
    const g = new BusGuard({ verifier: verifierFake, getMode: () => 'enforce' });
    const client = {};
    await authP(g, client, null);
    const r = await pubP(g, client, 'ui/request/pizzepos/pedidos');
    assert.strictEqual(r.err, null);
  });
  await atest('enforce: credencial PRESENTE pero inválida → rechaza el CONNECT (returnCode 4)', async () => {
    const g = new BusGuard({ verifier: verifierFake, getMode: () => 'enforce' });
    const r = await authP(g, {}, credCert('PEM-FALSO'));
    assert.ok(r.err, 'no entra');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.err.returnCode, 4);
  });
  await atest('enforce: credencial válida entra y luego toca dominio sensible OK', async () => {
    const g = new BusGuard({ verifier: verifierFake, getMode: () => 'enforce' });
    const client = {};
    const a = await authP(g, client, credCert('PEM-VALIDO'));
    assert.strictEqual(a.ok, true);
    const r = await pubP(g, client, 'ui/request/credential/list');
    assert.strictEqual(r.err, null, 'la identidad válida sí toca lo sensible');
  });

  // ── degradación honesta: verifier caído no cierra el bus ──
  await atest('enforce: verifier caído (throw) → NO rechaza el CONNECT (degrada a observe) y cuenta', async () => {
    const verifierCaido = () => { throw new Error('certificate-authority down'); };
    const g = new BusGuard({ verifier: verifierCaido, getMode: () => 'enforce' });
    const r = await authP(g, {}, credCert('PEM-VALIDO'));
    assert.strictEqual(r.ok, true, 'la seguridad no se paga con una caída total del bus');
    assert.strictEqual(g.stats.verifier_unavailable, 1);
  });

  // ── trusted: el núcleo (clientId interno) pasa lo sensible durante la migración ──
  await atest('enforce: clientId confiable (el core) → sella trusted y toca dominio sensible OK', async () => {
    const g = new BusGuard({ verifier: verifierFake, getMode: () => 'enforce', trustedClientIds: ['core-a'] });
    const client = { id: 'core-a' };
    await authP(g, client, null);
    assert.strictEqual(client.enkiIdentity.trusted, true);
    const r = await pubP(g, client, 'ui/request/credential/delete');
    assert.strictEqual(r.err, null, 'el núcleo no se bloquea a sí mismo');
  });

  // ── el propio broker (client null) nunca se restringe ──
  await atest('enforce: publish del núcleo (client=null) siempre pasa', async () => {
    const g = new BusGuard({ verifier: verifierFake, getMode: () => 'enforce' });
    const r = await pubP(g, null, 'ui/request/credential/delete');
    assert.strictEqual(r.err, null);
  });

  // ── subscribe simétrico ──
  await atest('enforce: subscribe anónimo a dominio sensible → negado (sub=null)', async () => {
    const g = new BusGuard({ verifier: verifierFake, getMode: () => 'enforce' });
    const client = {};
    await authP(g, client, null);
    const r = await subP(g, client, 'ui/request/security-core/estado');
    assert.strictEqual(r.sub, null);
  });

  console.log('\n✓ BusGuard: la escalera off→observe→enforce sostiene — off retrocompatible, observe aprende, enforce cierra con degradación honesta');
})();

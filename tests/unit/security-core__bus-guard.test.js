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
const crypto = require('crypto');
const BusGuard = require('../../core/broker/bus-guard');
const { policyPorDefecto, _dominioDeTopic } = require('../../core/broker/bus-guard');
const enkiToken = require('../../core/broker/enki-token');

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

// Par de claves REAL (RSA-2048): la pubkey PEM hace de "cert" (stand-in), la privada firma el token.
// El verifier fake acepta esa pubkey como "firmada por la CA" y rechaza cualquier otra.
function nuevaIdentidad(type, identifier) {
  const kp = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  return { certPem: kp.publicKey, privateKeyPem: kp.privateKey, type, identifier };
}
const ID_DEVICE = nuevaIdentidad('device', 'esp32-01');   // identidad legítima (la CA la reconoce)
const ID_INTRUSO = nuevaIdentidad('device', 'intruso');   // clave real pero cert NO firmado por la CA

const verifierFake = (certPem) => {
  if (certPem === ID_DEVICE.certPem) return { valid: true, type: ID_DEVICE.type, scope: 'nonina', identifier: ID_DEVICE.identifier };
  return { valid: false, error: 'not signed by this CA' };
};
// token firmado válido (fresco) de la identidad legítima
const credToken = (id = ID_DEVICE, iatSeconds = null) =>
  enkiToken.mint({ certPem: id.certPem, privateKeyPem: id.privateKeyPem, iatSeconds });
// cert desnudo (replayable) — ya NO debe dar identidad válida
const credCert = () => 'enki:cert:' + Buffer.from(ID_DEVICE.certPem, 'utf8').toString('base64');

console.log('BusGuard — el bus como puerta guardada\n');

(async () => {
  // ── _dominioDeTopic: extrae el dominio del topic ──
  test('_dominioDeTopic: ui/request/<dominio>/<accion> → dominio', () => {
    assert.strictEqual(_dominioDeTopic('ui/request/credential/list'), 'credential');
    assert.strictEqual(_dominioDeTopic('ui/request/pizzepos/pedidos'), 'pizzepos');
    assert.strictEqual(_dominioDeTopic('core/core-a/events/x'), 'x'); // events/<dominio> → el dominio real
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

  // ── BYPASS cerrado: la puerta interna (eventos de dominio con punto) también se guarda ──
  test('_dominioDeTopic: evento de dominio con punto (credential.create.request) → credential', () => {
    assert.strictEqual(_dominioDeTopic('credential.create.request'), 'credential');
    assert.strictEqual(_dominioDeTopic('credential-manager.request'), 'credential-manager');
  });
  test('policy: anónimo publica DIRECTO a credential.create.request → DENY (bypass cerrado)', () => {
    const v = policyPorDefecto({ anonymous: true }, 'credential.create.request', 'publish');
    assert.strictEqual(v.allow, false, 'la puerta interna no puede quedar abierta');
  });
  await atest('enforce: anónimo publica al evento de dominio con punto → BLOQUEADO', async () => {
    const g = new BusGuard({ verifier: verifierFake, getMode: () => 'enforce' });
    const client = {};
    await authP(g, client, null);
    const r = await pubP(g, client, 'credential.create.request');
    assert.ok(r.err, 'el bypass por topic de dominio queda cerrado');
  });

  // ── multi-core: la puerta interna real es core/<id>/events/<dominio>/... ──
  test('_dominioDeTopic: bus interno multi-core core/<id>/events/<dominio> → dominio (P0 cerrado)', () => {
    assert.strictEqual(_dominioDeTopic('core/core-a/events/credential/resolve/request'), 'credential');
    assert.strictEqual(_dominioDeTopic('core/core-b/events/pizzepos/pedidos/create'), 'pizzepos');
    assert.strictEqual(_dominioDeTopic('core/core-a/status'), 'status');
  });
  await atest('enforce: anónimo publica core/<id>/events/credential/... → BLOQUEADO (bypass multi-core cerrado)', async () => {
    const g = new BusGuard({ verifier: verifierFake, getMode: () => 'enforce' });
    const client = {};
    await authP(g, client, null);
    const r = await pubP(g, client, 'core/core-a/events/credential/resolve/request');
    assert.ok(r.err, 'la puerta interna del bus multi-core queda cerrada');
  });

  // ── firehose de lectura: el anónimo no cosecha por comodín ──
  test('policy: anónimo subscribe a comodín (ui/response/#, core/+/events/#, #) → DENY', () => {
    assert.strictEqual(policyPorDefecto({ anonymous: true }, 'ui/response/#', 'subscribe').allow, false);
    assert.strictEqual(policyPorDefecto({ anonymous: true }, 'core/+/events/#', 'subscribe').allow, false);
    assert.strictEqual(policyPorDefecto({ anonymous: true }, '#', 'subscribe').allow, false);
  });
  test('policy: identidad válida SÍ puede subscribe por comodín (peer/cliente con cert)', () => {
    assert.strictEqual(policyPorDefecto({ anonymous: false, valid: true }, 'core/+/events/#', 'subscribe').allow, true);
  });
  await atest('enforce: anónimo subscribe ui/response/# → negado (no cosecha respuestas RPC)', async () => {
    const g = new BusGuard({ verifier: verifierFake, getMode: () => 'enforce' });
    const client = {};
    await authP(g, client, null);
    const r = await subP(g, client, 'ui/response/#');
    assert.strictEqual(r.sub, null, 'el firehose de lectura queda cerrado');
  });

  // ── el core robusto al cambio de peldaño (conectó en off, sigue vivo al subir a enforce) ──
  await atest('enforce: core conectado en off (identidad stale anónima) → NO se bloquea (trusted por clientId en authorize)', async () => {
    const g = new BusGuard({ verifier: verifierFake, getMode: () => 'enforce', trustedClientIds: ['core-a'] });
    // simula: se conectó en off → enkiIdentity anónima sellada, nunca trusted
    const client = { id: 'core-a', enkiIdentity: { anonymous: true, credencialPresente: false } };
    const r = await pubP(g, client, 'credential.create.request');
    assert.strictEqual(r.err, null, 'el núcleo no se bloquea a sí mismo al cambiar de peldaño');
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
  await atest('observe: token firmado válido sella identidad (type/scope/identifier)', async () => {
    const g = new BusGuard({ verifier: verifierFake, getMode: () => 'observe' });
    const client = {};
    await authP(g, client, credToken());
    assert.strictEqual(client.enkiIdentity.valid, true);
    assert.strictEqual(client.enkiIdentity.identifier, 'esp32-01');
    assert.strictEqual(client.enkiIdentity.scope, 'nonina', 'el guard sella el scope (proyecto) del cert');
    assert.strictEqual(g.stats.authenticated, 1);
  });

  // ── token firmado: las 4 pruebas (CA · posesión · frescura · no-replay) ──
  await atest('token: cert DESNUDO (enki:cert) ya NO da identidad válida (replayable)', async () => {
    const g = new BusGuard({ verifier: verifierFake, getMode: () => 'enforce' });
    const r = await authP(g, {}, credCert());
    assert.ok(r.err, 'el cert público no prueba posesión → no entra en enforce');
  });
  await atest('token: firma que NO corresponde a la clave del cert → rechazado (posesión falla)', async () => {
    const g = new BusGuard({ verifier: verifierFake, getMode: () => 'enforce' });
    // mintea con la clave del INTRUSO pero pega el cert legítimo → la firma no valida contra ese cert
    const forjado = enkiToken.mint({ certPem: ID_DEVICE.certPem, privateKeyPem: ID_INTRUSO.privateKeyPem });
    const r = await authP(g, {}, forjado);
    assert.ok(r.err, 'sin la clave privada del cert no se entra');
  });
  await atest('token: replay (mismo jti dos veces) → el segundo se rechaza', async () => {
    const g = new BusGuard({ verifier: verifierFake, getMode: () => 'enforce' });
    const tok = credToken();
    const a = await authP(g, {}, tok);
    assert.strictEqual(a.ok, true, 'primer uso entra');
    const b = await authP(g, {}, tok);   // mismo token → mismo jti
    assert.ok(b.err, 'el replay se bloquea');
    assert.strictEqual(g.stats.replayed, 1);
  });
  await atest('token: fuera de ventana (iat viejo) → rechazado', async () => {
    const g = new BusGuard({ verifier: verifierFake, getMode: () => 'enforce', tokenWindowSec: 30 });
    const viejo = credToken(ID_DEVICE, Math.floor(Date.now() / 1000) - 120); // 2 min atrás
    const r = await authP(g, {}, viejo);
    assert.ok(r.err, 'un token viejo no vale (anti-replay por ventana)');
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
  await atest('enforce: token de cert NO firmado por la CA → rechaza el CONNECT (returnCode 4)', async () => {
    const g = new BusGuard({ verifier: verifierFake, getMode: () => 'enforce' });
    const r = await authP(g, {}, credToken(ID_INTRUSO));   // clave real, pero cert no lo firmó la CA
    assert.ok(r.err, 'no entra');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.err.returnCode, 4);
  });
  await atest('enforce: token válido entra y luego toca dominio sensible OK', async () => {
    const g = new BusGuard({ verifier: verifierFake, getMode: () => 'enforce' });
    const client = {};
    const a = await authP(g, client, credToken());
    assert.strictEqual(a.ok, true);
    const r = await pubP(g, client, 'ui/request/credential/list');
    assert.strictEqual(r.err, null, 'la identidad válida sí toca lo sensible');
  });

  // ── degradación honesta: verifier caído no cierra el bus ──
  await atest('enforce: verifier caído (throw) → NO rechaza el CONNECT (degrada a observe) y cuenta', async () => {
    const verifierCaido = () => { throw new Error('certificate-authority down'); };
    const g = new BusGuard({ verifier: verifierCaido, getMode: () => 'enforce' });
    const r = await authP(g, {}, credToken());
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

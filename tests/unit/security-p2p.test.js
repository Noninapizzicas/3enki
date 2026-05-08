/**
 * Tests unitarios — security-p2p (POC2).
 *
 * Mocks KeyManager + SecureEnvelope + CryptoHandshake para evitar dependencias
 * de crypto real. Foco en orquestador + helpers POC2 + LRU eviction.
 *
 * Ejecutar: node tests/unit/security-p2p.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

const KEY_MANAGER_PATH = path.resolve(__dirname, '../../modules/security-p2p/key-manager.js');
const SECURE_ENVELOPE_PATH = path.resolve(__dirname, '../../modules/security-p2p/secure-envelope.js');
const HANDSHAKE_PATH = path.resolve(__dirname, '../../modules/security-p2p/crypto-handshake.js');

// Mocks
class MockKeyManager {
  constructor() {
    this.publicKey = '-----BEGIN PUBLIC KEY-----\nFAKE\n-----END PUBLIC KEY-----';
    this.fingerprint = 'sha256-fake-fingerprint';
    this.peers = new Map();
  }
  async generateKeyPair() { return true; }
  getPublicKey() { return this.publicKey; }
  getFingerprint() { return this.fingerprint; }
  trustPeer(public_key, opts) {
    this.peers.set(public_key, { public_key, name: opts?.name, trusted_at: new Date().toISOString() });
  }
  untrustPeer(public_key) {
    return this.peers.delete(public_key);
  }
  listTrustedPeers() {
    return Array.from(this.peers.values());
  }
  computeSharedSecret(public_key) {
    return Buffer.from(`shared-${public_key}`);
  }
}

const MockSecureEnvelope = {
  encrypt(envelope, secret) { return { __encrypted: true, payload: envelope, secret_used: secret.toString() }; },
  decrypt(envelope, secret) {
    if (envelope.secret_used !== secret.toString()) throw new Error('wrong secret');
    return envelope.payload;
  },
  isEncrypted(envelope) { return !!envelope?.__encrypted; }
};

class MockCryptoHandshake {
  constructor() {
    this.requestsHandled = 0;
    this.responsesHandled = 0;
  }
  handleHandshakeRequest() { this.requestsHandled++; }
  handleHandshakeResponse() { this.responsesHandled++; }
}

require.cache[KEY_MANAGER_PATH] = { exports: MockKeyManager, filename: KEY_MANAGER_PATH, loaded: true, children: [] };
require.cache[SECURE_ENVELOPE_PATH] = { exports: MockSecureEnvelope, filename: SECURE_ENVELOPE_PATH, loaded: true, children: [] };
require.cache[HANDSHAKE_PATH] = { exports: MockCryptoHandshake, filename: HANDSHAKE_PATH, loaded: true, children: [] };

const SecurityP2PModule = require('../../modules/security-p2p/index.js');

function makeMocks() {
  const logs = [];
  const published = [];
  const metricsCalls = [];
  const hooksRegistered = [];
  const mqttSubscribed = [];
  const mqttMessageListeners = [];
  const uiRegistered = [];

  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };
  const metrics = {
    increment: (n, l) => metricsCalls.push(['increment', n, l]),
    gauge:     (n, v, l) => metricsCalls.push(['gauge', n, v, l]),
    timing:    (n, ms, l) => metricsCalls.push(['timing', n, ms, l])
  };
  const eventBus = { publish: async (e, p) => { published.push([e, p]); } };
  const hooks = {
    register: (event, handler) => hooksRegistered.push([event, handler]),
    unregister: (event, handler) => {
      const idx = hooksRegistered.findIndex(h => h[0] === event && h[1] === handler);
      if (idx >= 0) hooksRegistered.splice(idx, 1);
    }
  };
  const mqtt = {
    subscribe: async (topic) => { mqttSubscribed.push(topic); },
    unsubscribe: async () => {},
    on: (event, handler) => { if (event === 'message') mqttMessageListeners.push(handler); },
    removeListener: (event, handler) => {
      if (event !== 'message') return;
      const idx = mqttMessageListeners.indexOf(handler);
      if (idx >= 0) mqttMessageListeners.splice(idx, 1);
    }
  };
  const uiHandler = {
    register: (d, a, fn) => uiRegistered.push([d, a, fn]),
    unregister: (d, a) => {
      const idx = uiRegistered.findIndex(h => h[0] === d && h[1] === a);
      if (idx >= 0) uiRegistered.splice(idx, 1);
    }
  };
  return { logs, published, metricsCalls, hooksRegistered, mqttSubscribed, mqttMessageListeners, uiRegistered, logger, metrics, eventBus, hooks, mqtt, uiHandler };
}

async function instantiate(mocks, config = {}) {
  const m = new SecurityP2PModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    hooks: mocks.hooks,
    mqtt: mocks.mqtt,
    uiHandler: mocks.uiHandler,
    moduleConfig: config
  });
  return { module: m };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

function isCanonicalError(r) {
  return r && typeof r.status === 'number' && r.error
    && typeof r.error.code === 'string'
    && typeof r.error.message === 'string'
    && !('data' in r);
}

function isCanonicalSuccess(r) {
  return r && typeof r.status === 'number' && r.data && !('error' in r);
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

(async () => {
  console.log('security-p2p — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad genera keypair + registra hooks + suscribe MQTT + UI handlers', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'security-p2p');
    assert.strictEqual(m.version, '2.0.0');
    assert.ok(m.keyManager);
    assert.strictEqual(mocks.hooksRegistered.length, 2);
    const hookEvents = mocks.hooksRegistered.map(h => h[0]);
    assert.ok(hookEvents.includes('beforeEventPublish'));
    assert.ok(hookEvents.includes('afterEventReceive'));
    assert.strictEqual(mocks.mqttSubscribed.length, 2);
    assert.strictEqual(mocks.uiRegistered.length, 6);
    await m.onUnload();
  });

  await testAsync('onUnload desregistra hooks + UI + limpia _sharedSecrets', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._sharedSecrets.set('peer1', Buffer.from('s1'));
    await m.onUnload();
    assert.strictEqual(mocks.hooksRegistered.length, 0);
    assert.strictEqual(m._sharedSecrets.size, 0);
    assert.strictEqual(m.cryptoHandshake, null);
  });

  // Group 2: Validacion canonica
  await testAsync('handleTrustPeer sin public_key devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleTrustPeer({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'public_key');
    await m.onUnload();
  });

  await testAsync('handleRevokePeer sin public_key devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleRevokePeer({ body: {} });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  // Group 3: Trust + revoke flow
  await testAsync('handleTrustPeer registra peer + computa shared secret + emite evento', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleTrustPeer({
      body: {
        public_key: 'pk-1',
        name: 'peer-uno',
        correlation_id: 'cid-trust',
        project_id: 'proj-1'
      }
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.trusted, true);
    assert.strictEqual(r.data.peer_count, 1);
    assert.ok(m._sharedSecrets.has('pk-1'));

    const evs = publishedOf(mocks, 'security.peer.trusted');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid-trust');
    assert.strictEqual(evs[0].project_id, 'proj-1');
    assert.strictEqual(evs[0].name, 'peer-uno');
    await m.onUnload();
  });

  await testAsync('handleRevokePeer borra peer + shared secret + emite evento', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleTrustPeer({ body: { public_key: 'pk-1' } });
    const r = await m.handleRevokePeer({
      body: { public_key: 'pk-1', correlation_id: 'cid-rev', project_id: 'proj-x' }
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.revoked, true);
    assert.strictEqual(m._sharedSecrets.size, 0);

    const evs = publishedOf(mocks, 'security.peer.revoked');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].public_key, 'pk-1');
    await m.onUnload();
  });

  await testAsync('handleRevokePeer no existente devuelve revoked=false', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleRevokePeer({ body: { public_key: 'no-existe' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.revoked, false);
    await m.onUnload();
  });

  await testAsync('handleListTrustedPeers redacta public_key (40 chars)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const fullKey = 'a'.repeat(100);
    await m.handleTrustPeer({ body: { public_key: fullKey, name: 'peer' } });
    const r = await m.handleListTrustedPeers();
    assert.ok(r.data.peers[0].public_key.endsWith('...'));
    assert.ok(r.data.peers[0].public_key.length === 43); // 40 + '...'
    await m.onUnload();
  });

  // Group 4: LRU eviction
  await testAsync('_trackSharedSecret evicta el mas antiguo cuando excede max', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { max_shared_secrets: 3 });
    m._trackSharedSecret('pk-1', Buffer.from('s1'));
    m._trackSharedSecret('pk-2', Buffer.from('s2'));
    m._trackSharedSecret('pk-3', Buffer.from('s3'));
    m._trackSharedSecret('pk-4', Buffer.from('s4'));
    assert.strictEqual(m._sharedSecrets.size, 3);
    assert.ok(!m._sharedSecrets.has('pk-1'), 'pk-1 evictado (mas antiguo)');
    assert.ok(m._sharedSecrets.has('pk-4'));
    const evictMetric = mocks.metricsCalls.find(c => c[1] === 'security-p2p.shared_secrets_evicted');
    assert.ok(evictMetric);
    await m.onUnload();
  });

  await testAsync('_trackSharedSecret refresca posicion (LRU touch)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { max_shared_secrets: 2 });
    m._trackSharedSecret('pk-1', Buffer.from('s1'));
    m._trackSharedSecret('pk-2', Buffer.from('s2'));
    m._trackSharedSecret('pk-1', Buffer.from('s1-refresh'));  // refresca pk-1
    m._trackSharedSecret('pk-3', Buffer.from('s3'));  // ahora evicta pk-2 (no pk-1)
    assert.ok(m._sharedSecrets.has('pk-1'));
    assert.ok(!m._sharedSecrets.has('pk-2'));
    assert.ok(m._sharedSecrets.has('pk-3'));
    await m.onUnload();
  });

  // Group 5: Hooks de cifrado
  await testAsync('hookBeforeEventPublish cifra envelope si hay peer + secret', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleTrustPeer({ body: { public_key: 'pk-1' } });
    const ctx = { eventType: 'foo.bar', envelope: { msg: 'plaintext' } };
    const result = await m.hookBeforeEventPublish(ctx);
    assert.strictEqual(result.envelope.__encrypted, true);
    assert.strictEqual(m.stats.events_encrypted, 1);
    await m.onUnload();
  });

  await testAsync('hookBeforeEventPublish NO cifra system.* events', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleTrustPeer({ body: { public_key: 'pk-1' } });
    const ctx = { eventType: 'system.health', envelope: { msg: 'sys' } };
    const result = await m.hookBeforeEventPublish(ctx);
    assert.strictEqual(result.envelope.msg, 'sys');
    assert.ok(!result.envelope.__encrypted);
    assert.strictEqual(m.stats.events_encrypted, 0);
    await m.onUnload();
  });

  await testAsync('hookBeforeEventPublish sin peers trusted devuelve envelope sin cifrar', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const ctx = { eventType: 'foo.bar', envelope: { msg: 'x' } };
    const result = await m.hookBeforeEventPublish(ctx);
    assert.ok(!result.envelope.__encrypted);
    await m.onUnload();
  });

  await testAsync('hookAfterEventReceive descifra envelope con secret correcto', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleTrustPeer({ body: { public_key: 'pk-1' } });
    const sharedSecret = m._sharedSecrets.get('pk-1');

    const encryptedEnvelope = MockSecureEnvelope.encrypt({ msg: 'secret' }, sharedSecret);
    const ctx = { envelope: encryptedEnvelope };
    const result = await m.hookAfterEventReceive(ctx);
    assert.strictEqual(result.envelope.msg, 'secret');
    assert.strictEqual(m.stats.events_decrypted, 1);
    await m.onUnload();
  });

  await testAsync('hookAfterEventReceive sin secret pasa context sin cambios', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const encryptedEnvelope = { __encrypted: true, payload: 'x', secret_used: 'unknown' };
    const ctx = { envelope: encryptedEnvelope };
    const result = await m.hookAfterEventReceive(ctx);
    assert.ok(result.envelope.__encrypted, 'sigue cifrado');
    assert.strictEqual(m.stats.decryption_errors, 1);
    await m.onUnload();
  });

  await testAsync('hookAfterEventReceive con envelope no cifrado pasa context inalterado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const ctx = { envelope: { msg: 'plain' } };
    const result = await m.hookAfterEventReceive(ctx);
    assert.strictEqual(result.envelope.msg, 'plain');
    await m.onUnload();
  });

  // Group 6: MQTT handshake routing
  await testAsync('_handleMqttMessage delega a cryptoHandshake.request', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._handleMqttMessage('core/peer1/security/handshake/request/abc', Buffer.from('{}'));
    assert.strictEqual(m.cryptoHandshake.requestsHandled, 1);
    await m.onUnload();
  });

  await testAsync('_handleMqttMessage delega a cryptoHandshake.response', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._handleMqttMessage('core/peer1/security/handshake/response/abc', Buffer.from('{}'));
    assert.strictEqual(m.cryptoHandshake.responsesHandled, 1);
    await m.onUnload();
  });

  await testAsync('_handleMqttMessage ignora topics no relacionados', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m._handleMqttMessage('core/peer1/other/topic', Buffer.from('{}'));
    assert.strictEqual(m.cryptoHandshake.requestsHandled, 0);
    assert.strictEqual(m.cryptoHandshake.responsesHandled, 0);
    await m.onUnload();
  });

  // UI status + health
  await testAsync('handleStatus devuelve fingerprint + stats + cache size', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleTrustPeer({ body: { public_key: 'pk-1' } });
    const r = await m.handleStatus();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.module, 'security-p2p');
    assert.strictEqual(r.data.trusted_peers, 1);
    assert.strictEqual(r.data.shared_secrets_cached, 1);
    await m.onUnload();
  });

  await testAsync('handleHealthCheck devuelve healthy + has_keys=true', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealthCheck();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.status, 'healthy');
    assert.strictEqual(r.data.has_keys, true);
    assert.strictEqual(r.data.version, '2.0.0');
    await m.onUnload();
  });

  await testAsync('handleGetPublicKey devuelve PEM + fingerprint', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetPublicKey();
    assert.ok(isCanonicalSuccess(r));
    assert.ok(r.data.public_key.includes('PUBLIC KEY'));
    assert.ok(r.data.fingerprint);
    await m.onUnload();
  });

  // Group 7: Helpers POC2
  await testAsync('_errorResponse construye shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._errorResponse(400, 'INVALID_INPUT', 'msg', { f: 'x' });
    assert.deepStrictEqual(r, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { f: 'x' } } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.deepStrictEqual(m._classifyHandlerError(new Error('field is required')), { status: 400, code: 'INVALID_INPUT' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('not found')), { status: 404, code: 'RESOURCE_NOT_FOUND' });
    await m.onUnload();
  });

  await testAsync('_publicarEvento añade correlation_id, project_id top-level y timestamp', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { foo: 1, project_id: 'p-z' }, { correlation_id: 'cid-z' });
    const ev = mocks.published[0][1];
    assert.strictEqual(ev.correlation_id, 'cid-z');
    assert.strictEqual(ev.project_id, 'p-z');
    assert.ok(ev.timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError emite metric security-p2p.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'));
    assert.strictEqual(r.status, 404);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'security-p2p.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });

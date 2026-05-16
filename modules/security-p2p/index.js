/**
 * Security P2P Module v2.0.0 — POC2 canonico.
 *
 * Modulo de seguridad Zero Trust P2P para Event Core. Cifra/descifra eventos
 * entre cores usando X25519 + AES-256-GCM. Se integra al core via hooks
 * (beforeEventPublish, afterEventReceive) para cifrado transparente sin
 * modificar otros modulos.
 *
 * Publishes (canonicos): security.peer.trusted, security.peer.revoked,
 * security.handshake.timeout, security.handshake.failed.
 *
 * MQTT subscribes: core/+/security/handshake/{request,response}/# (delegado a
 * CryptoHandshake).
 */

'use strict';

const KeyManager = require('./key-manager');
const SecureEnvelope = require('./secure-envelope');
const CryptoHandshake = require('./crypto-handshake');

const BaseModule = require('../_shared/base-module');
const MAX_SHARED_SECRETS_DEFAULT = 100;
const UI_ACTIONS = ['status', 'public-key', 'trust-peer', 'revoke-peer', 'trusted-peers', 'health'];

class SecurityP2PModule extends BaseModule {
  constructor() {
    super();
    this.name = 'security-p2p';
    this.version = '2.0.0';

    this.keyManager = new KeyManager();
    this.encryptionEnabled = true;
    this.maxSharedSecrets = MAX_SHARED_SECRETS_DEFAULT;

    this._sharedSecrets = new Map();

    this.stats = {
      events_encrypted: 0,
      events_decrypted: 0,
      encryption_errors: 0,
      decryption_errors: 0
    };

    this.core = null;
    this.cryptoHandshake = null;

    this._coreHooks = null;
    this._mqttClient = null;
    this._beforePublishHandler = null;
    this._afterReceiveHandler = null;
    this._mqttMessageHandler = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.core = core;
    this.eventBus = core.eventBus || null;
    this.logger = core.logger;
    this.metrics = core.metrics;

    const config = core.moduleConfig || core.config || {};
    this.maxSharedSecrets = config.max_shared_secrets || MAX_SHARED_SECRETS_DEFAULT;

    await this.keyManager.generateKeyPair();
    this.cryptoHandshake = new CryptoHandshake(core, this.keyManager);

    if (core.hooks) {
      this._coreHooks = core.hooks;
      this._beforePublishHandler = this.hookBeforeEventPublish.bind(this);
      this._afterReceiveHandler = this.hookAfterEventReceive.bind(this);
      core.hooks.register('beforeEventPublish', this._beforePublishHandler);
      core.hooks.register('afterEventReceive', this._afterReceiveHandler);
    }

    if (core.mqtt?.subscribe) {
      this._mqttClient = core.mqtt;
      await core.mqtt.subscribe('core/+/security/handshake/request/#');
      await core.mqtt.subscribe('core/+/security/handshake/response/#');
      this._mqttMessageHandler = this._handleMqttMessage.bind(this);
      core.mqtt.on('message', this._mqttMessageHandler);
    }

    if (core.uiHandler) {
      this._registerUIHandlers(core.uiHandler);
    }

    this.logger?.info?.('module.loaded', {
      module: this.name,
      version: this.version,
      fingerprint: this.keyManager.getFingerprint()
    });
  }

  async onUnload() {
    if (this._coreHooks) {
      try {
        if (typeof this._coreHooks.unregister === 'function') {
          this._coreHooks.unregister('beforeEventPublish', this._beforePublishHandler);
          this._coreHooks.unregister('afterEventReceive', this._afterReceiveHandler);
        }
      } catch (_) { /* ignore */ }
      this._coreHooks = null;
    }

    if (this._mqttClient && this._mqttMessageHandler) {
      try {
        if (typeof this._mqttClient.removeListener === 'function') {
          this._mqttClient.removeListener('message', this._mqttMessageHandler);
        }
        if (typeof this._mqttClient.unsubscribe === 'function') {
          await this._mqttClient.unsubscribe('core/+/security/handshake/request/#');
          await this._mqttClient.unsubscribe('core/+/security/handshake/response/#');
        }
      } catch (_) { /* ignore */ }
      this._mqttClient = null;
      this._mqttMessageHandler = null;
    }

    if (this.core?.uiHandler) {
      for (const action of UI_ACTIONS) {
        try { this.core.uiHandler.unregister('security-p2p', action); } catch (_) { /* ignore */ }
      }
    }

    this._sharedSecrets.clear();
    this.cryptoHandshake = null;

    this.logger?.info?.('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Helpers POC2
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details !== undefined) error.details = details;
    return { status, error };
  }

  _classifyHandlerError(err) {
    const msg = err?.message || String(err);
    const code = err?.code;
    if (code === 'ENOENT') return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/required|invalid|missing|requerido/i.test(msg)) return { status: 400, code: 'INVALID_INPUT' };
    if (/not found|no encontrado/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    return { status: 500, code: 'UNKNOWN_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'handler') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('security-p2p.errors', { code, kind });
    return this._errorResponse(status, code, err?.message || 'Error interno');
  }

  async _publicarEvento(name, payload, sourcePayload) {
    if (!this.eventBus) {
      if (this.core?.emit) this.core.emit(name, payload || {});
      return payload;
    }
    const correlation_id =
      payload?.correlation_id ||
      sourcePayload?.correlation_id ||
      sourcePayload?.metadata?.correlationId ||
      null;
    const project_id =
      payload?.project_id ??
      sourcePayload?.project_id ??
      null;
    const enriched = {
      ...payload,
      correlation_id,
      timestamp: payload?.timestamp || new Date().toISOString()
    };
    if (project_id !== null && project_id !== undefined) enriched.project_id = project_id;
    try {
      await this.eventBus.publish(name, enriched);
    } catch (err) {
      this.logger?.warn?.('security-p2p.publish.failed', {
        event: name, error_message: err.message
      });
    }
    return enriched;
  }

  // ==========================================
  // Eviction de _sharedSecrets (LRU simple)
  // ==========================================

  _trackSharedSecret(public_key, sharedSecret) {
    // Si ya existe, lo movemos al final (LRU)
    if (this._sharedSecrets.has(public_key)) {
      this._sharedSecrets.delete(public_key);
    }
    this._sharedSecrets.set(public_key, sharedSecret);

    // Eviction: si excede el limite, borrar el mas antiguo (primer entry del Map)
    while (this._sharedSecrets.size > this.maxSharedSecrets) {
      const oldestKey = this._sharedSecrets.keys().next().value;
      this._sharedSecrets.delete(oldestKey);
      this.metrics?.increment?.('security-p2p.shared_secrets_evicted');
      this.logger?.debug?.('security-p2p.shared_secret.evicted', {
        public_key: oldestKey?.substring(0, 16),
        cache_size: this._sharedSecrets.size,
        max: this.maxSharedSecrets
      });
    }
  }

  // ==========================================
  // Hooks — Cifrado transparente de eventos
  // ==========================================

  async hookBeforeEventPublish(context) {
    if (!context || !context.envelope) return context;
    if (!this.encryptionEnabled) return context;
    if (context.eventType && context.eventType.startsWith('system.')) return context;

    const trustedPeers = this.keyManager.listTrustedPeers();
    if (trustedPeers.length === 0) return context;

    try {
      let sharedSecret = null;
      for (const peer of trustedPeers) {
        sharedSecret = this._sharedSecrets.get(peer.public_key);
        if (sharedSecret) break;
      }
      if (!sharedSecret) return context;

      const encryptedEnvelope = SecureEnvelope.encrypt(context.envelope, sharedSecret);
      this.stats.events_encrypted++;
      this.metrics?.increment?.('security-p2p.events_encrypted');

      return { ...context, envelope: encryptedEnvelope };
    } catch (error) {
      this.stats.encryption_errors++;
      this.metrics?.increment?.('security-p2p.encryption_errors');
      this.logger?.warn?.('security-p2p.encrypt.failed', {
        event_type: context.eventType,
        error_message: error.message
      });
      return context;
    }
  }

  async hookAfterEventReceive(context) {
    if (!context || !context.envelope) return context;
    if (!SecureEnvelope.isEncrypted(context.envelope)) return context;

    try {
      for (const [, secret] of this._sharedSecrets) {
        try {
          const decryptedEnvelope = SecureEnvelope.decrypt(context.envelope, secret);
          this.stats.events_decrypted++;
          this.metrics?.increment?.('security-p2p.events_decrypted');
          return { ...context, envelope: decryptedEnvelope };
        } catch {
          continue;
        }
      }
      this.stats.decryption_errors++;
      this.metrics?.increment?.('security-p2p.decryption_errors');
      this.logger?.warn?.('security-p2p.decrypt.no_secret_match', {});
      return context;
    } catch (error) {
      this.stats.decryption_errors++;
      this.metrics?.increment?.('security-p2p.decryption_errors');
      this.logger?.warn?.('security-p2p.decrypt.failed', {
        error_message: error.message
      });
      return context;
    }
  }

  // ==========================================
  // UI Handlers (canonical shape)
  // ==========================================

  async handleStatus() {
    try {
      return {
        status: 200,
        data: {
          module: this.name,
          version: this.version,
          encryption_enabled: this.encryptionEnabled,
          fingerprint: this.keyManager.getFingerprint(),
          trusted_peers: this.keyManager.listTrustedPeers().length,
          shared_secrets_cached: this._sharedSecrets.size,
          stats: this.stats
        }
      };
    } catch (err) {
      return this._handleHandlerError('security-p2p.status.error', err);
    }
  }

  async handleGetPublicKey() {
    try {
      return {
        status: 200,
        data: {
          public_key: this.keyManager.getPublicKey(),
          fingerprint: this.keyManager.getFingerprint()
        }
      };
    } catch (err) {
      return this._handleHandlerError('security-p2p.public_key.error', err);
    }
  }

  // Handler del par request/response del bus. Reemplaza el acceso directo
  // moduleLoader.loadedModules.get('security-p2p').keyManager.getPublicKey()
  // que cualquier modulo solia hacer para obtener la clave publica del core.
  async onPublicKeyRequest(event) {
    const source = event?.data || event || {};
    const { request_id, correlation_id } = source;
    try {
      const public_key  = this.keyManager?.getPublicKey?.() || null;
      const fingerprint = this.keyManager?.getFingerprint?.() || null;
      await this._publicarEvento('security.public-key.response', {
        request_id,
        correlation_id,
        public_key,
        fingerprint,
        has_keys: !!public_key
      }, source);
    } catch (err) {
      this.logger?.error?.('security-p2p.public_key_request.failed', {
        request_id,
        error_message: err?.message || String(err)
      });
      this.metrics?.increment?.('security-p2p.errors', { code: 'UNKNOWN_ERROR', kind: 'public_key_request' });
      await this._publicarEvento('security.public-key.response', {
        request_id,
        correlation_id,
        public_key: null,
        fingerprint: null,
        has_keys: false,
        error: { code: 'UNKNOWN_ERROR', message: err?.message || 'Error obteniendo clave publica' }
      }, source);
    }
  }

  async handleTrustPeer(input) {
    try {
      const body = input?.body || input || {};
      const { public_key, name, project_id, correlation_id } = body;

      if (!public_key) {
        this.metrics?.increment?.('security-p2p.errors', { code: 'INVALID_INPUT', kind: 'trust-peer' });
        this.logger?.warn?.('security-p2p.trust.missing', { field: 'public_key' });
        return this._errorResponse(400, 'INVALID_INPUT', 'public_key required', { field: 'public_key' });
      }

      this.keyManager.trustPeer(public_key, { name });

      try {
        const sharedSecret = this.keyManager.computeSharedSecret(public_key);
        this._trackSharedSecret(public_key, sharedSecret);
      } catch (err) {
        this.logger?.debug?.('security-p2p.trust.no_shared_secret', {
          error_message: err.message
        });
      }

      await this._publicarEvento('security.peer.trusted', {
        public_key, name: name || null,
        fingerprint: this.keyManager.getFingerprint()
      }, { correlation_id, project_id });

      return {
        status: 200,
        data: {
          trusted: true,
          fingerprint: this.keyManager.getFingerprint(),
          peer_count: this.keyManager.listTrustedPeers().length
        }
      };
    } catch (err) {
      return this._handleHandlerError('security-p2p.trust.error', err);
    }
  }

  async handleRevokePeer(input) {
    try {
      const body = input?.body || input || {};
      const { public_key, project_id, correlation_id } = body;

      if (!public_key) {
        this.metrics?.increment?.('security-p2p.errors', { code: 'INVALID_INPUT', kind: 'revoke-peer' });
        this.logger?.warn?.('security-p2p.revoke.missing', { field: 'public_key' });
        return this._errorResponse(400, 'INVALID_INPUT', 'public_key required', { field: 'public_key' });
      }

      const removed = this.keyManager.untrustPeer(public_key);
      this._sharedSecrets.delete(public_key);

      if (removed) {
        await this._publicarEvento('security.peer.revoked', {
          public_key
        }, { correlation_id, project_id });
      }

      return { status: 200, data: { revoked: removed } };
    } catch (err) {
      return this._handleHandlerError('security-p2p.revoke.error', err);
    }
  }

  async handleListTrustedPeers() {
    try {
      return {
        status: 200,
        data: {
          peers: this.keyManager.listTrustedPeers().map(p => ({
            public_key: p.public_key.substring(0, 40) + '...',
            name: p.name,
            trusted_at: p.trusted_at
          }))
        }
      };
    } catch (err) {
      return this._handleHandlerError('security-p2p.list_peers.error', err);
    }
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        module: this.name,
        version: this.version,
        status: 'healthy',
        has_keys: !!this.keyManager.getPublicKey(),
        encryption_enabled: this.encryptionEnabled,
        trusted_peers: this.keyManager.listTrustedPeers().length,
        shared_secrets_cached: this._sharedSecrets.size
      }
    };
  }

  // ==========================================
  // Internal
  // ==========================================

  _registerUIHandlers(uiHandler) {
    uiHandler.register('security-p2p', 'status', this.handleStatus.bind(this));
    uiHandler.register('security-p2p', 'public-key', this.handleGetPublicKey.bind(this));
    uiHandler.register('security-p2p', 'trust-peer', this.handleTrustPeer.bind(this));
    uiHandler.register('security-p2p', 'revoke-peer', this.handleRevokePeer.bind(this));
    uiHandler.register('security-p2p', 'trusted-peers', this.handleListTrustedPeers.bind(this));
    uiHandler.register('security-p2p', 'health', this.handleHealthCheck.bind(this));
  }

  _handleMqttMessage(topic, message) {
    try {
      if (topic.includes('/security/handshake/request/')) {
        this.cryptoHandshake.handleHandshakeRequest(topic, message);
      } else if (topic.includes('/security/handshake/response/')) {
        this.cryptoHandshake.handleHandshakeResponse(topic, message);
      }
    } catch (err) {
      this.logger?.warn?.('security-p2p.mqtt.handler_error', {
        topic, error_message: err.message
      });
      this.metrics?.increment?.('security-p2p.errors', { code: 'MQTT_HANDLER', kind: 'mqtt' });
    }
  }
}

module.exports = SecurityP2PModule;

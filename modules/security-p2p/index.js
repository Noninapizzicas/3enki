/**
 * Security P2P Module
 *
 * Módulo de seguridad P2P con:
 * - Cifrado end-to-end de eventos (AES-256-GCM)
 * - Key exchange via X25519 Diffie-Hellman
 * - Trust management (capability-based)
 * - Hooks para interceptar eventos (beforeEventPublish, afterEventReceive)
 *
 * @example
 * const SecurityModule = require('./modules/security-p2p');
 * const security = new SecurityModule();
 * await security.onLoad(core);
 */

const KeyManager = require('./key-manager');
const SecureEnvelope = require('./secure-envelope');

class SecurityP2PModule {
  constructor() {
    this.core = null;
    this.keyManager = new KeyManager();
    this.encryptionEnabled = true;
    this.peerSecrets = new Map(); // peerPublicKey -> sharedSecret (Buffer)

    this.stats = {
      events_encrypted: 0,
      events_decrypted: 0,
      encryption_errors: 0,
      decryption_errors: 0,
      trusted_peers: 0
    };
  }

  /**
   * Lifecycle: onLoad
   *
   * @param {Object} core - Core instance
   */
  async onLoad(core) {
    this.core = core;

    const logger = core.logger;
    if (logger) {
      logger.info('security-p2p.module.loading', {
        module: 'security-p2p',
        version: '1.0.0'
      });
    }

    // Generar par de claves
    await this.keyManager.generateKeyPair();

    const fingerprint = this.keyManager.getFingerprint();
    if (logger) {
      logger.info('security-p2p.keypair.generated', {
        fingerprint,
        algorithm: 'x25519'
      });
    }

    // Registrar hooks
    if (core.hooks) {
      // Hook: Cifrar eventos antes de publicar
      core.hooks.register('beforeEventPublish', async (context) => {
        return await this.hookBeforeEventPublish(context);
      });

      // Hook: Descifrar eventos después de recibir
      core.hooks.register('afterEventReceive', async (context) => {
        return await this.hookAfterEventReceive(context);
      });

      if (logger) {
        logger.debug('security-p2p.hooks.registered', {
          hooks: ['beforeEventPublish', 'afterEventReceive']
        });
      }
    }

    if (logger) {
      logger.info('security-p2p.module.loaded', {
        fingerprint,
        encryption_enabled: this.encryptionEnabled
      });
    }

    if (core.metrics) {
      core.metrics.increment('security-p2p.module.loaded');
    }
  }

  /**
   * Lifecycle: onUnload
   */
  async onUnload() {
    if (this.core && this.core.logger) {
      this.core.logger.info('security-p2p.module.unloading', {
        stats: this.stats
      });
    }

    // Limpiar secrets de memoria
    this.peerSecrets.clear();
  }

  /**
   * Hook: beforeEventPublish
   * Cifra eventos salientes si hay peers confiables
   *
   * @param {Object} context - Hook context
   * @returns {Object} Modified context o null para bloquear
   */
  async hookBeforeEventPublish(context) {
    if (!this.encryptionEnabled) {
      return context;
    }

    // No cifrar eventos del sistema (logs, métricas, etc)
    if (context.eventType.startsWith('system.') ||
        context.eventType.startsWith('core.')) {
      return context;
    }

    const logger = this.core?.logger;

    try {
      // Si hay peers confiables, cifrar el envelope
      const trustedPeers = this.keyManager.listTrustedPeers();

      if (trustedPeers.length > 0 && context.envelope) {
        // Por ahora, usar el primer peer confiable
        // TODO: Implementar broadcast cifrado a múltiples peers
        const firstPeer = trustedPeers[0];
        const sharedSecret = this.peerSecrets.get(firstPeer.public_key);

        if (sharedSecret) {
          context.envelope = SecureEnvelope.encrypt(context.envelope, sharedSecret);
          this.stats.events_encrypted++;

          if (logger) {
            logger.debug('security-p2p.event.encrypted', {
              event_type: context.eventType,
              peer_fingerprint: firstPeer.public_key.substring(0, 16)
            });
          }
        }
      }

      return context;

    } catch (error) {
      this.stats.encryption_errors++;

      if (logger) {
        logger.error('security-p2p.encryption.failed', {
          event_type: context.eventType,
          error: error.message
        }, error);
      }

      // En caso de error, retornar context sin cifrar
      return context;
    }
  }

  /**
   * Hook: afterEventReceive
   * Descifra eventos entrantes si están cifrados
   *
   * @param {Object} context - Hook context
   * @returns {Object} Modified context
   */
  async hookAfterEventReceive(context) {
    if (!this.encryptionEnabled) {
      return context;
    }

    const logger = this.core?.logger;

    try {
      if (context.envelope && SecureEnvelope.isEncrypted(context.envelope)) {
        // Buscar shared secret del peer que envió el evento
        // Por ahora, intentar con todos los peers conocidos
        let decrypted = false;

        for (const [peerPublicKey, sharedSecret] of this.peerSecrets.entries()) {
          try {
            context.envelope = SecureEnvelope.decrypt(context.envelope, sharedSecret);
            this.stats.events_decrypted++;
            decrypted = true;

            if (logger) {
              logger.debug('security-p2p.event.decrypted', {
                event_type: context.envelope.event_type,
                peer_fingerprint: peerPublicKey.substring(0, 16)
              });
            }

            break;
          } catch (error) {
            // Continuar con el siguiente peer
            continue;
          }
        }

        if (!decrypted) {
          this.stats.decryption_errors++;

          if (logger) {
            logger.warn('security-p2p.decryption.failed', {
              event_id: context.envelope.event_id,
              reason: 'no_valid_key'
            });
          }

          // Bloquear evento si no se pudo descifrar
          return null;
        }
      }

      return context;

    } catch (error) {
      this.stats.decryption_errors++;

      if (logger) {
        logger.error('security-p2p.decryption.error', {
          error: error.message
        }, error);
      }

      // Bloquear evento en caso de error
      return null;
    }
  }

  /**
   * API: GET /status
   * Retorna estado del módulo de seguridad
   *
   * @param {Object} req - Request
   * @returns {Promise<Object>} Response
   */
  async handleStatus(req) {
    const trustedPeers = this.keyManager.listTrustedPeers();

    return {
      module: 'security-p2p',
      version: '1.0.0',
      encryption_enabled: this.encryptionEnabled,
      fingerprint: this.keyManager.getFingerprint(),
      trusted_peers: trustedPeers.length,
      stats: this.stats
    };
  }

  /**
   * API: GET /public-key
   * Retorna la clave pública de este core
   *
   * @param {Object} req - Request
   * @returns {Promise<Object>} Response
   */
  async handlePublicKey(req) {
    return {
      public_key: this.keyManager.getPublicKey(),
      fingerprint: this.keyManager.getFingerprint(),
      algorithm: 'x25519'
    };
  }

  /**
   * API: POST /trust-peer
   * Agrega un peer a la lista de confianza
   *
   * Body: { public_key: string, name?: string }
   *
   * @param {Object} req - Request
   * @returns {Promise<Object>} Response
   */
  async handleTrustPeer(req) {
    const { public_key, name } = req.body || {};

    if (!public_key) {
      throw new Error('public_key is required');
    }

    try {
      // Decodificar public key de base64 a PEM
      const peerPublicKeyPEM = Buffer.from(public_key, 'base64').toString('utf8');

      // Computar shared secret
      const sharedSecret = this.keyManager.computeSharedSecret(peerPublicKeyPEM);

      // Guardar shared secret
      this.peerSecrets.set(public_key, sharedSecret);

      // Agregar a trusted peers
      this.keyManager.trustPeer(public_key, { name: name || 'unknown' });

      this.stats.trusted_peers = this.keyManager.listTrustedPeers().length;

      if (this.core?.logger) {
        this.core.logger.info('security-p2p.peer.trusted', {
          peer_name: name || 'unknown',
          peer_fingerprint: public_key.substring(0, 16)
        });
      }

      if (this.core?.metrics) {
        this.core.metrics.increment('security-p2p.peers.trusted');
      }

      return {
        success: true,
        peer: {
          public_key,
          name: name || 'unknown',
          trusted_at: Date.now()
        }
      };

    } catch (error) {
      if (this.core?.logger) {
        this.core.logger.error('security-p2p.trust.failed', {
          error: error.message
        }, error);
      }

      throw new Error(`Failed to trust peer: ${error.message}`);
    }
  }

  /**
   * API: POST /untrust-peer
   * Remueve un peer de la lista de confianza
   *
   * Body: { public_key: string }
   *
   * @param {Object} req - Request
   * @returns {Promise<Object>} Response
   */
  async handleUntrustPeer(req) {
    const { public_key } = req.body || {};

    if (!public_key) {
      throw new Error('public_key is required');
    }

    const removed = this.keyManager.untrustPeer(public_key);
    this.peerSecrets.delete(public_key);

    this.stats.trusted_peers = this.keyManager.listTrustedPeers().length;

    if (this.core?.logger) {
      this.core.logger.info('security-p2p.peer.untrusted', {
        peer_fingerprint: public_key.substring(0, 16),
        removed
      });
    }

    return {
      success: removed,
      public_key
    };
  }

  /**
   * API: GET /peers
   * Lista todos los peers confiables
   *
   * @param {Object} req - Request
   * @returns {Promise<Object>} Response
   */
  async handlePeers(req) {
    const trustedPeers = this.keyManager.listTrustedPeers();

    return {
      total: trustedPeers.length,
      peers: trustedPeers.map(peer => ({
        ...peer,
        fingerprint: peer.public_key.substring(0, 16)
      }))
    };
  }

  /**
   * Habilita/deshabilita cifrado
   *
   * @param {boolean} enabled - true para habilitar
   */
  setEncryptionEnabled(enabled) {
    this.encryptionEnabled = enabled;

    if (this.core?.logger) {
      this.core.logger.info('security-p2p.encryption.toggled', {
        enabled
      });
    }
  }

  /**
   * Obtiene estadísticas del módulo
   *
   * @returns {Object} Stats
   */
  getStats() {
    return { ...this.stats };
  }
}

module.exports = SecurityP2PModule;

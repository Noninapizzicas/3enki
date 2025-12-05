/**
 * Módulo Security P2P
 * Peer-to-peer security layer with E2EE, key exchange, and node authentication
 */

const crypto = require('crypto');

class SecurityP2P {
  constructor() {
    this.name = 'security-p2p';
    this.version = '1.0.0';

    // Estado
    this.keypair = null;
    this.keyId = null;
    this.sessions = new Map(); // peer_id -> { sessionId, sharedKey, establishedAt, expiresAt, peerPublicKey }
    this.trustedPeers = new Map(); // peer_id -> { publicKey, authenticatedAt, metadata }
    this.pendingRequests = new Map(); // request_id -> { resolve, reject, timeout }

    // Dependencias (inyectadas)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.config = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = core.config || {};

    this.logger.info('modulo.loading', { module: this.name });

    // Generar keypair inicial
    await this.generateKeypair();

    // Suscribirse a eventos
    await this.subscribeToEvents();

    // Iniciar limpieza de sesiones expiradas
    this.startSessionCleanup();

    this.logger.info('modulo.loaded', { module: this.name, key_id: this.keyId });
  }

  async onUnload() {
    this.logger.info('modulo.unloading', { module: this.name });

    // Limpiar timers
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Terminar todas las sesiones
    for (const [peerId] of this.sessions) {
      await this.terminateSession(peerId);
    }
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe('security.keypair.get.request', this.onGetKeypairRequest.bind(this));
    await this.eventBus.subscribe('security.encrypt.request', this.onEncryptRequest.bind(this));
    await this.eventBus.subscribe('security.decrypt.request', this.onDecryptRequest.bind(this));
    await this.eventBus.subscribe('security.session.create.request', this.onCreateSessionRequest.bind(this));
    await this.eventBus.subscribe('security.peer.verify.request', this.onVerifyPeerRequest.bind(this));
  }

  async onGetKeypairRequest(event) {
    const { request_id } = event.payload;
    const correlationId = event.correlation_id;

    this.logger.info('keypair.get.request.received', {
      request_id,
      correlation_id
    });

    await this.eventBus.publish('security.keypair.get.response', {
      request_id,
      success: true,
      public_key: this.keypair.publicKey,
      key_id: this.keyId
    }, { correlationId });
  }

  async onEncryptRequest(event) {
    const { request_id, peer_id, data } = event.payload;
    const correlationId = event.correlation_id;

    this.logger.info('encrypt.request.received', {
      request_id,
      peer_id,
      correlation_id
    });

    try {
      const result = await this.encryptForPeer(peer_id, data, correlationId);

      await this.eventBus.publish('security.encrypt.response', {
        request_id,
        success: true,
        encrypted_data: result.encryptedData,
        iv: result.iv,
        session_id: result.sessionId
      }, { correlationId });

    } catch (error) {
      this.logger.error('encrypt.request.error', {
        request_id,
        peer_id,
        error: error.message,
        correlation_id
      });

      await this.eventBus.publish('security.encrypt.response', {
        request_id,
        success: false,
        error: error.message
      }, { correlationId });
    }
  }

  async onDecryptRequest(event) {
    const { request_id, peer_id, encrypted_data, iv } = event.payload;
    const correlationId = event.correlation_id;

    this.logger.info('decrypt.request.received', {
      request_id,
      peer_id,
      correlation_id
    });

    try {
      const result = await this.decryptFromPeer(peer_id, encrypted_data, iv, correlationId);

      await this.eventBus.publish('security.decrypt.response', {
        request_id,
        success: true,
        decrypted_data: result.decryptedData,
        session_id: result.sessionId
      }, { correlationId });

    } catch (error) {
      this.logger.error('decrypt.request.error', {
        request_id,
        peer_id,
        error: error.message,
        correlation_id
      });

      await this.eventBus.publish('security.decrypt.response', {
        request_id,
        success: false,
        error: error.message
      }, { correlationId });
    }
  }

  async onCreateSessionRequest(event) {
    const { request_id, peer_id, peer_public_key, metadata } = event.payload;
    const correlationId = event.correlation_id;

    this.logger.info('session.create.request.received', {
      request_id,
      peer_id,
      correlation_id
    });

    try {
      const session = await this.createSession(peer_id, peer_public_key, metadata, correlationId);

      await this.eventBus.publish('security.session.create.response', {
        request_id,
        success: true,
        session_id: session.sessionId,
        peer_id: session.peerId,
        established_at: session.establishedAt,
        expires_at: session.expiresAt
      }, { correlationId });

    } catch (error) {
      this.logger.error('session.create.request.error', {
        request_id,
        peer_id,
        error: error.message,
        correlation_id
      });

      await this.eventBus.publish('security.session.create.response', {
        request_id,
        success: false,
        error: error.message
      }, { correlationId });
    }
  }

  async onVerifyPeerRequest(event) {
    const { request_id, peer_id, public_key, signature, challenge } = event.payload;
    const correlationId = event.correlation_id;

    this.logger.info('peer.verify.request.received', {
      request_id,
      peer_id,
      correlation_id
    });

    try {
      const verified = await this.verifyPeer(peer_id, public_key, signature, challenge, correlationId);

      await this.eventBus.publish('security.peer.verify.response', {
        request_id,
        success: true,
        verified,
        peer_id
      }, { correlationId });

    } catch (error) {
      this.logger.error('peer.verify.request.error', {
        request_id,
        peer_id,
        error: error.message,
        correlation_id
      });

      await this.eventBus.publish('security.peer.verify.response', {
        request_id,
        success: false,
        verified: false,
        error: error.message
      }, { correlationId });
    }
  }

  // ==========================================
  // Core Cryptographic Operations
  // ==========================================

  async generateKeypair() {
    const startTime = Date.now();

    this.logger.info('keypair.generating');

    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: this.config.keyLength || 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    this.keypair = { publicKey, privateKey };
    this.keyId = `key_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    const duration = Date.now() - startTime;

    // REMOVED (migrate-to-event-metrics): this.metrics.increment('security.keypair.generated.total');
    // → Counter extracted from events
    // REMOVED: this.metrics.timing('security.keypair.generate.duration', duration);

    await this.eventBus.publish('security.keypair.generated', {
      key_id: this.keyId,
      algorithm: this.config.keyAlgorithm || 'RSA-OAEP',
      key_length: this.config.keyLength || 2048,
      generated_at: new Date().toISOString()
    });

    this.logger.info('keypair.generated', {
      key_id: this.keyId,
      duration
    });

    return this.keypair;
  }

  async createSession(peerId, peerPublicKey, metadata, correlationId) {
    const startTime = Date.now();

    this.logger.info('session.creating', {
      peer_id: peerId,
      correlation_id: correlationId
    });

    // Generar clave compartida (AES-256 para mensajes)
    const sharedKey = crypto.randomBytes(32); // 256 bits

    const sessionId = `session_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const establishedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + (this.config.sessionExpiryMs || 3600000)).toISOString();

    const session = {
      sessionId,
      peerId,
      sharedKey,
      peerPublicKey,
      establishedAt,
      expiresAt,
      metadata
    };

    this.sessions.set(peerId, session);

    const duration = Date.now() - startTime;

    // REMOVED (migrate-to-event-metrics): this.metrics.increment('security.session.established.total');
    // → Counter extracted from events
    // REMOVED: this.metrics.gauge('security.sessions.active.count', this.sessions.size);
    // REMOVED: this.metrics.timing('security.session.create.duration', duration);

    await this.eventBus.publish('security.session.established', {
      session_id: sessionId,
      peer_id: peerId,
      established_at: establishedAt,
      expires_at: expiresAt
    }, { correlationId });

    this.logger.info('session.established', {
      session_id: sessionId,
      peer_id: peerId,
      duration,
      correlation_id: correlationId
    });

    return session;
  }

  async terminateSession(peerId, reason = 'manual', correlationId) {
    const session = this.sessions.get(peerId);

    if (!session) {
      throw new Error(`Session not found for peer: ${peerId}`);
    }

    this.sessions.delete(peerId);

    // REMOVED (migrate-to-event-metrics): this.metrics.increment('security.session.terminated.total');
    // → Counter extracted from events
    // REMOVED: this.metrics.gauge('security.sessions.active.count', this.sessions.size);

    await this.eventBus.publish('security.session.terminated', {
      session_id: session.sessionId,
      peer_id: peerId,
      reason,
      terminated_at: new Date().toISOString()
    }, { correlationId });

    this.logger.info('session.terminated', {
      session_id: session.sessionId,
      peer_id: peerId,
      reason,
      correlation_id: correlationId
    });

    return { success: true, peer_id: peerId };
  }

  async encryptForPeer(peerId, data, correlationId) {
    const startTime = Date.now();
    const session = this.sessions.get(peerId);

    if (!session) {
      throw new Error(`No active session with peer: ${peerId}`);
    }

    // Usar AES-256-GCM con la clave compartida
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', session.sharedKey, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    const encryptedData = `${encrypted}:${authTag}`;

    const duration = Date.now() - startTime;

    // REMOVED (migrate-to-event-metrics): this.metrics.increment('security.message.encrypted.total');
    // → Counter extracted from events
    // REMOVED: this.metrics.timing('security.encrypt.duration', duration);

    await this.eventBus.publish('security.message.encrypted', {
      session_id: session.sessionId,
      peer_id: peerId,
      data_size: Buffer.byteLength(data, 'utf8'),
      encrypted_at: new Date().toISOString()
    }, { correlationId });

    this.logger.info('message.encrypted', {
      session_id: session.sessionId,
      peer_id: peerId,
      data_size: Buffer.byteLength(data, 'utf8'),
      duration,
      correlation_id: correlationId
    });

    return {
      encryptedData,
      iv: iv.toString('hex'),
      sessionId: session.sessionId
    };
  }

  async decryptFromPeer(peerId, encryptedData, ivHex, correlationId) {
    const startTime = Date.now();
    const session = this.sessions.get(peerId);

    if (!session) {
      throw new Error(`No active session with peer: ${peerId}`);
    }

    try {
      const [encrypted, authTagHex] = encryptedData.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', session.sharedKey, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      const duration = Date.now() - startTime;

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('security.message.decrypted.total');
    // → Counter extracted from events
      // REMOVED: this.metrics.timing('security.decrypt.duration', duration);

      await this.eventBus.publish('security.message.decrypted', {
        session_id: session.sessionId,
        peer_id: peerId,
        data_size: Buffer.byteLength(decrypted, 'utf8'),
        decrypted_at: new Date().toISOString()
      }, { correlationId });

      this.logger.info('message.decrypted', {
        session_id: session.sessionId,
        peer_id: peerId,
        data_size: Buffer.byteLength(decrypted, 'utf8'),
        duration,
        correlation_id: correlationId
      });

      return {
        decryptedData: decrypted,
        sessionId: session.sessionId
      };

    } catch (error) {
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('security.decrypt.failed.total');
    // → Counter extracted from events

      this.logger.error('message.decrypt.failed', {
        peer_id: peerId,
        error: error.message,
        correlation_id: correlationId
      });

      throw new Error('Decryption failed: Invalid data or authentication tag');
    }
  }

  async verifyPeer(peerId, publicKey, signature, challenge, correlationId) {
    this.logger.info('peer.verifying', {
      peer_id: peerId,
      correlation_id: correlationId
    });

    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(challenge);
      verify.end();

      const verified = verify.verify(publicKey, signature, 'hex');

      if (verified) {
        const publicKeyHash = crypto.createHash('sha256').update(publicKey).digest('hex');

        this.trustedPeers.set(peerId, {
          publicKey,
          publicKeyHash,
          authenticatedAt: new Date().toISOString()
        });

        // REMOVED (migrate-to-event-metrics): this.metrics.increment('security.peer.authenticated.total');
    // → Counter extracted from events
        // REMOVED: this.metrics.gauge('security.peers.trusted.count', this.trustedPeers.size);

        await this.eventBus.publish('security.peer.authenticated', {
          peer_id: peerId,
          public_key_hash: publicKeyHash,
          authenticated_at: new Date().toISOString()
        }, { correlationId });

        this.logger.info('peer.authenticated', {
          peer_id: peerId,
          correlation_id: correlationId
        });
      } else {
        // REMOVED (migrate-to-event-metrics): this.metrics.increment('security.verify.failed.total');
    // → Counter extracted from events

        this.logger.warn('peer.verification.failed', {
          peer_id: peerId,
          correlation_id: correlationId
        });
      }

      return verified;

    } catch (error) {
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('security.verify.failed.total');
    // → Counter extracted from events

      this.logger.error('peer.verify.error', {
        peer_id: peerId,
        error: error.message,
        correlation_id: correlationId
      });

      throw error;
    }
  }

  async revokePeer(peerId, reason, correlationId) {
    const peer = this.trustedPeers.get(peerId);

    if (!peer) {
      throw new Error(`Peer not found: ${peerId}`);
    }

    this.trustedPeers.delete(peerId);

    // Terminar sesión activa si existe
    if (this.sessions.has(peerId)) {
      await this.terminateSession(peerId, reason, correlationId);
    }

    // REMOVED (migrate-to-event-metrics): this.metrics.increment('security.peer.revoked.total');
    // → Counter extracted from events
    // REMOVED: this.metrics.gauge('security.peers.trusted.count', this.trustedPeers.size);

    await this.eventBus.publish('security.peer.revoked', {
      peer_id: peerId,
      reason,
      revoked_at: new Date().toISOString()
    }, { correlationId });

    this.logger.info('peer.revoked', {
      peer_id: peerId,
      reason,
      correlation_id: correlationId
    });

    return { success: true, peer_id: peerId };
  }

  // ==========================================
  // Session Management
  // ==========================================

  startSessionCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();

      for (const [peerId, session] of this.sessions.entries()) {
        const expiresAt = new Date(session.expiresAt).getTime();

        if (now > expiresAt) {
          this.logger.info('session.expired', {
            session_id: session.sessionId,
            peer_id: peerId
          });

          this.terminateSession(peerId, 'expired').catch(err => {
            this.logger.error('session.cleanup.error', {
              peer_id: peerId,
              error: err.message
            });
          });
        }
      }
    }, 60000); // Check every minute
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleGetKeypair(req, context) {
    this.logger.info('keypair.get.start', {
      correlation_id: context.correlationId
    });

    return {
      status: 200,
      data: {
        success: true,
        public_key: this.keypair.publicKey,
        algorithm: this.config.keyAlgorithm || 'RSA-OAEP',
        key_id: this.keyId,
        created_at: new Date().toISOString()
      }
    };
  }

  async handleGenerateKeypair(req, context) {
    const startTime = Date.now();

    this.logger.info('keypair.generate.start', {
      correlation_id: context.correlationId
    });

    try {
      await this.generateKeypair();

      this.logger.info('keypair.generated.http', {
        key_id: this.keyId,
        duration: Date.now() - startTime,
        correlation_id: context.correlationId
      });

      return {
        status: 201,
        data: {
          success: true,
          public_key: this.keypair.publicKey,
          algorithm: this.config.keyAlgorithm || 'RSA-OAEP',
          key_id: this.keyId,
          created_at: new Date().toISOString()
        }
      };

    } catch (error) {
      this.logger.error('keypair.generate.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: { success: false, error: error.message }
      };
    }
  }

  async handleCreateSession(req, context) {
    const startTime = Date.now();
    const { peer_id, peer_public_key, metadata } = context.body;

    this.logger.info('session.create.start', {
      peer_id,
      correlation_id: context.correlationId
    });

    try {
      const session = await this.createSession(peer_id, peer_public_key, metadata, context.correlationId);

      this.logger.info('session.created.http', {
        session_id: session.sessionId,
        peer_id,
        duration: Date.now() - startTime,
        correlation_id: context.correlationId
      });

      return {
        status: 201,
        data: {
          success: true,
          session_id: session.sessionId,
          peer_id: session.peerId,
          established_at: session.establishedAt,
          expires_at: session.expiresAt
        }
      };

    } catch (error) {
      this.logger.error('session.create.error', {
        peer_id,
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: { success: false, error: error.message }
      };
    }
  }

  async handleListSessions(req, context) {
    const sessions = Array.from(this.sessions.values()).map(s => ({
      session_id: s.sessionId,
      peer_id: s.peerId,
      established_at: s.establishedAt,
      expires_at: s.expiresAt
    }));

    return {
      status: 200,
      data: {
        success: true,
        sessions,
        count: sessions.length
      }
    };
  }

  async handleTerminateSession(req, context) {
    const peerId = context.params.peer_id;

    this.logger.info('session.terminate.start', {
      peer_id: peerId,
      correlation_id: context.correlationId
    });

    try {
      await this.terminateSession(peerId, 'manual', context.correlationId);

      return {
        status: 200,
        data: {
          success: true,
          peer_id: peerId,
          message: 'Session terminated successfully'
        }
      };

    } catch (error) {
      this.logger.error('session.terminate.error', {
        peer_id: peerId,
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 404,
        data: { success: false, error: error.message }
      };
    }
  }

  async handleEncrypt(req, context) {
    const startTime = Date.now();
    const { peer_id, data } = context.body;

    this.logger.info('encrypt.start', {
      peer_id,
      correlation_id: context.correlationId
    });

    try {
      const result = await this.encryptForPeer(peer_id, data, context.correlationId);

      this.logger.info('encrypted.http', {
        peer_id,
        duration: Date.now() - startTime,
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: {
          success: true,
          encrypted_data: result.encryptedData,
          iv: result.iv,
          session_id: result.sessionId
        }
      };

    } catch (error) {
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('security.encrypt.failed.total');
    // → Counter extracted from events

      this.logger.error('encrypt.error', {
        peer_id,
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 400,
        data: { success: false, error: error.message }
      };
    }
  }

  async handleDecrypt(req, context) {
    const startTime = Date.now();
    const { peer_id, encrypted_data, iv } = context.body;

    this.logger.info('decrypt.start', {
      peer_id,
      correlation_id: context.correlationId
    });

    try {
      const result = await this.decryptFromPeer(peer_id, encrypted_data, iv, context.correlationId);

      this.logger.info('decrypted.http', {
        peer_id,
        duration: Date.now() - startTime,
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: {
          success: true,
          decrypted_data: result.decryptedData,
          session_id: result.sessionId
        }
      };

    } catch (error) {
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('security.decrypt.failed.total');
    // → Counter extracted from events

      this.logger.error('decrypt.error', {
        peer_id,
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 400,
        data: { success: false, error: error.message }
      };
    }
  }

  async handleVerifyPeer(req, context) {
    const { peer_id, public_key, signature, challenge } = context.body;

    this.logger.info('peer.verify.start', {
      peer_id,
      correlation_id: context.correlationId
    });

    try {
      const verified = await this.verifyPeer(peer_id, public_key, signature, challenge, context.correlationId);

      return {
        status: 200,
        data: {
          success: true,
          verified,
          peer_id
        }
      };

    } catch (error) {
      this.logger.error('peer.verify.error', {
        peer_id,
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 400,
        data: { success: false, verified: false, error: error.message }
      };
    }
  }

  async handleRevokePeer(req, context) {
    const peerId = context.params.peer_id;

    this.logger.info('peer.revoke.start', {
      peer_id: peerId,
      correlation_id: context.correlationId
    });

    try {
      await this.revokePeer(peerId, 'manual', context.correlationId);

      return {
        status: 200,
        data: {
          success: true,
          peer_id: peerId,
          message: 'Peer revoked successfully'
        }
      };

    } catch (error) {
      this.logger.error('peer.revoke.error', {
        peer_id: peerId,
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 404,
        data: { success: false, error: error.message }
      };
    }
  }

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      data: {
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: this.version,
        active_sessions: this.sessions.size,
        trusted_peers: this.trustedPeers.size,
        key_id: this.keyId
      }
    };
  }

  async handleGetMetrics(req, context) {
    return {
      status: 200,
      data: {
        counters: {
          'security.keypair.generated.total': this.metrics.getCounter('security.keypair.generated.total') || 0,
          'security.session.established.total': this.metrics.getCounter('security.session.established.total') || 0,
          'security.session.terminated.total': this.metrics.getCounter('security.session.terminated.total') || 0,
          'security.message.encrypted.total': this.metrics.getCounter('security.message.encrypted.total') || 0,
          'security.message.decrypted.total': this.metrics.getCounter('security.message.decrypted.total') || 0,
          'security.peer.authenticated.total': this.metrics.getCounter('security.peer.authenticated.total') || 0,
          'security.peer.revoked.total': this.metrics.getCounter('security.peer.revoked.total') || 0
        },
        gauges: {
          'security.sessions.active.count': this.sessions.size,
          'security.peers.trusted.count': this.trustedPeers.size
        }
      }
    };
  }
}

module.exports = SecurityP2P;

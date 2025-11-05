/**
 * KeyManager - Gestión de claves X25519 para P2P encryption
 *
 * Usa Node.js crypto para generar pares de claves X25519 (Curve25519).
 * Almacena claves en memoria (puede extenderse a filesystem).
 *
 * @example
 * const keyManager = new KeyManager();
 * await keyManager.generateKeyPair();
 * const publicKey = keyManager.getPublicKey();
 */

const crypto = require('crypto');

class KeyManager {
  constructor() {
    this.privateKey = null;
    this.publicKey = null;
    this.trustedPeers = new Map(); // peerPublicKey -> { trusted_at, metadata }
  }

  /**
   * Genera un nuevo par de claves X25519
   *
   * @returns {Promise<void>}
   */
  async generateKeyPair() {
    return new Promise((resolve, reject) => {
      // Generar par de claves usando Diffie-Hellman con Curve25519
      crypto.generateKeyPair('x25519', {
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      }, (err, publicKey, privateKey) => {
        if (err) {
          reject(err);
        } else {
          this.publicKey = publicKey;
          this.privateKey = privateKey;
          resolve();
        }
      });
    });
  }

  /**
   * Obtiene la clave pública en formato base64
   *
   * @returns {string} Public key base64
   */
  getPublicKey() {
    if (!this.publicKey) {
      throw new Error('No key pair generated. Call generateKeyPair() first.');
    }
    return Buffer.from(this.publicKey).toString('base64');
  }

  /**
   * Obtiene la clave pública en formato PEM
   *
   * @returns {string} Public key PEM
   */
  getPublicKeyPEM() {
    if (!this.publicKey) {
      throw new Error('No key pair generated');
    }
    return this.publicKey;
  }

  /**
   * Computa shared secret con la clave pública de un peer
   *
   * @param {string} peerPublicKeyPEM - Clave pública del peer en PEM
   * @returns {Buffer} Shared secret
   */
  computeSharedSecret(peerPublicKeyPEM) {
    if (!this.privateKey) {
      throw new Error('No private key available');
    }

    try {
      const privateKeyObj = crypto.createPrivateKey(this.privateKey);
      const publicKeyObj = crypto.createPublicKey(peerPublicKeyPEM);

      // Diffie-Hellman key exchange
      const sharedSecret = crypto.diffieHellman({
        privateKey: privateKeyObj,
        publicKey: publicKeyObj
      });

      return sharedSecret;
    } catch (error) {
      throw new Error(`Failed to compute shared secret: ${error.message}`);
    }
  }

  /**
   * Agrega un peer a la lista de confianza
   *
   * @param {string} peerPublicKey - Public key del peer (base64)
   * @param {Object} metadata - Metadata adicional (nombre, etc)
   */
  trustPeer(peerPublicKey, metadata = {}) {
    this.trustedPeers.set(peerPublicKey, {
      trusted_at: Date.now(),
      ...metadata
    });
  }

  /**
   * Remueve un peer de la lista de confianza
   *
   * @param {string} peerPublicKey - Public key del peer
   * @returns {boolean} true si fue removido
   */
  untrustPeer(peerPublicKey) {
    return this.trustedPeers.delete(peerPublicKey);
  }

  /**
   * Verifica si un peer es confiable
   *
   * @param {string} peerPublicKey - Public key del peer
   * @returns {boolean}
   */
  isTrusted(peerPublicKey) {
    return this.trustedPeers.has(peerPublicKey);
  }

  /**
   * Lista todos los peers confiables
   *
   * @returns {Array<Object>} Array de peers
   */
  listTrustedPeers() {
    const peers = [];
    for (const [publicKey, data] of this.trustedPeers.entries()) {
      peers.push({
        public_key: publicKey,
        ...data
      });
    }
    return peers;
  }

  /**
   * Exporta estado para persistencia
   *
   * @returns {Object} State object
   */
  exportState() {
    return {
      public_key: this.publicKey,
      private_key: this.privateKey,
      trusted_peers: Array.from(this.trustedPeers.entries())
    };
  }

  /**
   * Importa estado desde persistencia
   *
   * @param {Object} state - State object
   */
  importState(state) {
    this.publicKey = state.public_key;
    this.privateKey = state.private_key;
    this.trustedPeers = new Map(state.trusted_peers || []);
  }

  /**
   * Genera un fingerprint de la clave pública
   *
   * @returns {string} SHA-256 hash de la public key (primeros 16 chars)
   */
  getFingerprint() {
    if (!this.publicKey) {
      throw new Error('No public key available');
    }

    const hash = crypto.createHash('sha256');
    hash.update(this.publicKey);
    return hash.digest('hex').substring(0, 16);
  }
}

module.exports = KeyManager;

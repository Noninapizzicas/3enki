/**
 * SecureEnvelope - Cifrado/descifrado de event envelopes
 *
 * Usa AES-256-GCM para cifrar el payload de eventos.
 * El shared secret (de X25519 DH) se usa como clave.
 *
 * @example
 * const envelope = SecureEnvelope.encrypt(event, sharedSecret);
 * const decrypted = SecureEnvelope.decrypt(envelope, sharedSecret);
 */

const crypto = require('crypto');

class SecureEnvelope {
  /**
   * Cifra un event envelope
   *
   * @param {Object} event - Event envelope original
   * @param {Buffer} sharedSecret - Shared secret (32 bytes)
   * @returns {Object} Encrypted envelope
   */
  static encrypt(event, sharedSecret) {
    if (!sharedSecret || sharedSecret.length < 32) {
      throw new Error('Invalid shared secret');
    }

    // Generar IV aleatorio (12 bytes para GCM)
    const iv = crypto.randomBytes(12);

    // Derivar clave de 32 bytes del shared secret usando HKDF
    const key = crypto.hkdfSync('sha256', sharedSecret, Buffer.alloc(0), 'event-core-encryption', 32);

    // Cifrar el data field del envelope
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const plaintext = JSON.stringify(event.data);
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    // Obtener authentication tag
    const authTag = cipher.getAuthTag();

    // Retornar envelope modificado
    return {
      ...event,
      data: null, // Limpiar data original
      encrypted: {
        ciphertext: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        auth_tag: authTag.toString('base64'),
        algorithm: 'aes-256-gcm'
      },
      security: {
        encrypted: true,
        version: '1.0'
      }
    };
  }

  /**
   * Descifra un event envelope
   *
   * @param {Object} envelope - Encrypted envelope
   * @param {Buffer} sharedSecret - Shared secret (32 bytes)
   * @returns {Object} Decrypted envelope
   */
  static decrypt(envelope, sharedSecret) {
    if (!envelope.encrypted) {
      throw new Error('Envelope is not encrypted');
    }

    if (!sharedSecret || sharedSecret.length < 32) {
      throw new Error('Invalid shared secret');
    }

    try {
      // Derivar misma clave
      const key = crypto.hkdfSync('sha256', sharedSecret, Buffer.alloc(0), 'event-core-encryption', 32);

      const iv = Buffer.from(envelope.encrypted.iv, 'base64');
      const authTag = Buffer.from(envelope.encrypted.auth_tag, 'base64');
      const ciphertext = Buffer.from(envelope.encrypted.ciphertext, 'base64');

      // Descifrar
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(ciphertext);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      const data = JSON.parse(decrypted.toString('utf8'));

      // Retornar envelope con data descifrado
      const result = { ...envelope };
      result.data = data;
      delete result.encrypted; // Limpiar metadata de cifrado
      result.security = {
        ...result.security,
        decrypted: true
      };

      return result;

    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Verifica si un envelope está cifrado
   *
   * @param {Object} envelope - Event envelope
   * @returns {boolean}
   */
  static isEncrypted(envelope) {
    return !!(envelope.encrypted && envelope.security?.encrypted);
  }

  /**
   * Firma un envelope (HMAC-SHA256)
   *
   * @param {Object} envelope - Event envelope
   * @param {Buffer} sharedSecret - Shared secret
   * @returns {Object} Envelope con firma
   */
  static sign(envelope, sharedSecret) {
    const payload = JSON.stringify({
      event_id: envelope.event_id,
      event_type: envelope.event_type,
      timestamp: envelope.timestamp,
      data: envelope.data
    });

    const hmac = crypto.createHmac('sha256', sharedSecret);
    hmac.update(payload);
    const signature = hmac.digest('base64');

    return {
      ...envelope,
      security: {
        ...envelope.security,
        signature,
        signature_algorithm: 'hmac-sha256'
      }
    };
  }

  /**
   * Verifica la firma de un envelope
   *
   * @param {Object} envelope - Signed envelope
   * @param {Buffer} sharedSecret - Shared secret
   * @returns {boolean} true si la firma es válida
   */
  static verify(envelope, sharedSecret) {
    if (!envelope.security?.signature) {
      return false;
    }

    const payload = JSON.stringify({
      event_id: envelope.event_id,
      event_type: envelope.event_type,
      timestamp: envelope.timestamp,
      data: envelope.data
    });

    const hmac = crypto.createHmac('sha256', sharedSecret);
    hmac.update(payload);
    const expectedSignature = hmac.digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(envelope.security.signature, 'base64'),
      Buffer.from(expectedSignature, 'base64')
    );
  }
}

module.exports = SecureEnvelope;

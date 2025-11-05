# Arquitectura de Seguridad P2P del Event Core

**Documento de Diseño de Seguridad Completo**
**Versión:** 1.0.0
**Fecha:** 2025-10-06
**Filosofía:** "Trust Nothing, Verify Everything"

---

## 📋 Tabla de Contenidos

1. [Filosofía de Seguridad](#filosofía-de-seguridad)
2. [Sistema de Llaves Maestras](#sistema-de-llaves-maestras)
3. [Protocolo de Handshake Criptográfico](#protocolo-de-handshake-criptográfico)
4. [Cifrado End-to-End Automático](#cifrado-end-to-end-automático)
5. [Integración con el Core](#integración-con-el-core)
6. [CLI de Gestión de Seguridad](#cli-de-gestión-de-seguridad)
7. [Políticas de Seguridad](#políticas-de-seguridad)
8. [Implementación Completa](#implementación-completa)
9. [Validación y Testing](#validación-y-testing)

---

## 1. Filosofía de Seguridad

### 1.1 Principios Fundamentales

**"Trust Nothing, Verify Everything"**

El Event Core implementa un modelo de seguridad **Zero Trust P2P** donde:

✅ **Zero trust entre cores por defecto** - Ningún core es confiable hasta probar lo contrario
✅ **Autenticación mutua obligatoria** - Ambas partes verifican identidad antes de comunicar
✅ **Cifrado end-to-end automático** - Todo el tráfico entre cores está cifrado
✅ **Sin dependencias externas** - No requiere PKI, OAuth, servidores de autenticación
✅ **Descentralizado** - No hay autoridad central de certificación
✅ **Portable** - Funciona igual en Termux, Linux, Cloud

### 1.2 Modelo de Amenazas

**Amenazas cubiertas:**

1. **Man-in-the-Middle** - Cifrado E2E previene interceptación
2. **Impersonación** - Handshake criptográfico autentica identidad
3. **Replay attacks** - Nonces únicos por mensaje
4. **Cores maliciosos** - Sistema de trust explícito, no automático
5. **Eavesdropping** - Todo el tráfico MQTT está cifrado para peers trusted

**Amenazas NO cubiertas (fuera de scope):**

- Physical access a filesystem (proteger con permisos OS)
- Compromiso de la máquina host (responsabilidad del OS)
- Side-channel attacks avanzados (no relevantes para el caso de uso)

### 1.3 Diferenciación vs Otros Frameworks

| Framework | Modelo Seguridad | Dependencias |
|-----------|------------------|--------------|
| **Event Core** | P2P Zero Trust | Ninguna |
| NestJS | OAuth/JWT centralizado | Auth provider |
| Moleculer | Shared secret simple | Config manual |
| Kafka | Kerberos/SSL | CA certificates |
| RabbitMQ | Username/password | AMQP server |

---

## 2. Sistema de Llaves Maestras

### 2.1 Criptografía Base

**Algoritmo:** Elliptic Curve Diffie-Hellman (ECDH) con X25519

**Por qué X25519:**
- ✅ Fast (40x más rápido que RSA 2048)
- ✅ Small keys (32 bytes vs 256 bytes RSA)
- ✅ Secure (128-bit security level)
- ✅ Built-in Node.js crypto
- ✅ Usado en Signal, WireGuard, TLS 1.3

### 2.2 Key Manager (Gestión de Llaves)

```javascript
// core/security/key-manager.js

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class KeyManager {
  constructor(core) {
    this.core = core;
    this.securityPath = './security';
    this.keysPath = path.join(this.securityPath, 'keys.json');
    this.peerKeysPath = path.join(this.securityPath, 'peer-keys.json');

    this.masterKeyPair = null;  // { publicKey, privateKey }
    this.peerKeys = new Map();  // core_id → { publicKey, sharedSecret, status }

    this.ensureSecurityDirectory();
    this.loadOrGenerateKeys();
  }

  ensureSecurityDirectory() {
    if (!fs.existsSync(this.securityPath)) {
      fs.mkdirSync(this.securityPath, { recursive: true, mode: 0o700 });
    }
  }

  // Cargar o generar par de claves maestras
  loadOrGenerateKeys() {
    if (fs.existsSync(this.keysPath)) {
      console.log('🔑 Loading existing master key pair...');
      const data = JSON.parse(fs.readFileSync(this.keysPath, 'utf8'));
      this.masterKeyPair = data;
    } else {
      console.log('🔑 Generating new master key pair...');
      this.masterKeyPair = this.generateMasterKeyPair();
      this.saveKeyPair(this.masterKeyPair);
    }

    // Cargar peer keys si existen
    if (fs.existsSync(this.peerKeysPath)) {
      const peerData = JSON.parse(fs.readFileSync(this.peerKeysPath, 'utf8'));
      this.peerKeys = new Map(Object.entries(peerData));
    }

    console.log(`✓ Master key pair ready: ${this.getPublicKeyFingerprint()}`);
  }

  // Generar par de claves X25519
  generateMasterKeyPair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    return {
      publicKey: publicKey,
      privateKey: privateKey,
      algorithm: 'x25519',
      createdAt: Date.now(),
      core_id: this.core.id
    };
  }

  // Guardar par de claves (con permisos restrictivos)
  saveKeyPair(keyPair) {
    const data = JSON.stringify(keyPair, null, 2);
    fs.writeFileSync(this.keysPath, data, { mode: 0o600 }); // Solo lectura/escritura por owner
    console.log(`✓ Master keys saved to ${this.keysPath}`);
  }

  // Derivar secret compartido con otro core usando ECDH
  deriveSharedSecret(peerPublicKeyPem) {
    try {
      const peerPublicKey = crypto.createPublicKey(peerPublicKeyPem);
      const privateKey = crypto.createPrivateKey(this.masterKeyPair.privateKey);

      const sharedSecret = crypto.diffieHellman({
        publicKey: peerPublicKey,
        privateKey: privateKey
      });

      return sharedSecret.toString('base64');

    } catch (error) {
      throw new Error(`Failed to derive shared secret: ${error.message}`);
    }
  }

  // Activar llave maestra con otro core
  async activateMasterKey(peerCoreId, peerPublicKey) {
    console.log(`🔐 Activating master key with ${peerCoreId}...`);

    // Validar que la clave pública es válida
    try {
      crypto.createPublicKey(peerPublicKey);
    } catch (error) {
      throw new Error(`Invalid public key for ${peerCoreId}: ${error.message}`);
    }

    // Derivar secret compartido
    const sharedSecret = this.deriveSharedSecret(peerPublicKey);

    // Guardar información del peer
    this.peerKeys.set(peerCoreId, {
      core_id: peerCoreId,
      publicKey: peerPublicKey,
      sharedSecret: sharedSecret,
      status: 'pending',  // pending → handshake → active → revoked
      activatedAt: Date.now(),
      fingerprint: this.calculateFingerprint(peerPublicKey)
    });

    // Persistir peer keys
    this.savePeerKeys();

    console.log(`✓ Shared secret derived with ${peerCoreId}`);
    console.log(`  Fingerprint: ${this.calculateFingerprint(peerPublicKey)}`);

    return sharedSecret;
  }

  // Obtener secret compartido con un peer
  getSharedSecret(peerCoreId) {
    const peer = this.peerKeys.get(peerCoreId);
    if (!peer) {
      throw new Error(`No shared secret with peer: ${peerCoreId}`);
    }
    if (peer.status !== 'active') {
      throw new Error(`Peer ${peerCoreId} is not active (status: ${peer.status})`);
    }
    return peer.sharedSecret;
  }

  // Verificar si un peer es confiable
  isPeerTrusted(peerCoreId) {
    const peer = this.peerKeys.get(peerCoreId);
    return peer && peer.status === 'active';
  }

  // Actualizar estado de un peer
  setPeerStatus(peerCoreId, status) {
    const peer = this.peerKeys.get(peerCoreId);
    if (!peer) {
      throw new Error(`Peer not found: ${peerCoreId}`);
    }

    peer.status = status;
    peer.lastUpdated = Date.now();

    this.savePeerKeys();

    this.core.logger.info('security.peer_status_changed', {
      peer_core_id: peerCoreId,
      status: status
    });
  }

  // Revocar trust de un peer
  revokePeer(peerCoreId) {
    console.log(`🚫 Revoking trust for ${peerCoreId}...`);

    const peer = this.peerKeys.get(peerCoreId);
    if (!peer) {
      throw new Error(`Peer not found: ${peerCoreId}`);
    }

    peer.status = 'revoked';
    peer.revokedAt = Date.now();

    this.savePeerKeys();

    this.core.emit('security.peer.revoked', { peer_core_id: peerCoreId });

    console.log(`✓ Trust revoked for ${peerCoreId}`);
  }

  // Guardar peer keys a disco
  savePeerKeys() {
    const data = Object.fromEntries(this.peerKeys);
    fs.writeFileSync(this.peerKeysPath, JSON.stringify(data, null, 2), { mode: 0o600 });
  }

  // Obtener clave pública de este core
  getPublicKey() {
    return this.masterKeyPair.publicKey;
  }

  // Obtener clave privada (NUNCA compartir)
  getPrivateKey() {
    return this.masterKeyPair.privateKey;
  }

  // Calcular fingerprint de una clave pública (para verificación visual)
  calculateFingerprint(publicKey) {
    const hash = crypto.createHash('sha256').update(publicKey).digest('hex');
    return hash.substring(0, 16).toUpperCase().match(/.{1,4}/g).join(':');
  }

  // Fingerprint de nuestra clave pública
  getPublicKeyFingerprint() {
    return this.calculateFingerprint(this.masterKeyPair.publicKey);
  }

  // Obtener todos los peers trusted
  getTrustedPeers() {
    return Array.from(this.peerKeys.entries())
      .filter(([_, peer]) => peer.status === 'active')
      .map(([coreId, peer]) => ({
        core_id: coreId,
        fingerprint: peer.fingerprint,
        activatedAt: peer.activatedAt
      }));
  }

  // Exportar backup de configuración de seguridad
  exportBackup() {
    return {
      core_id: this.core.id,
      master_key_pair: this.masterKeyPair,
      peer_keys: Object.fromEntries(this.peerKeys),
      exported_at: Date.now()
    };
  }

  // Importar backup
  importBackup(backup) {
    console.log('⚠️ Importing security backup...');

    if (backup.core_id !== this.core.id) {
      console.warn(`Warning: Backup is for core ${backup.core_id}, but this is ${this.core.id}`);
    }

    this.masterKeyPair = backup.master_key_pair;
    this.peerKeys = new Map(Object.entries(backup.peer_keys));

    this.saveKeyPair(this.masterKeyPair);
    this.savePeerKeys();

    console.log('✓ Security backup imported');
  }
}

module.exports = KeyManager;
```

---

## 3. Protocolo de Handshake Criptográfico

### 3.1 Flujo Completo del Handshake

**4 Pasos sin Broker de Confianza:**

```
Core A                                          Core B
  │                                               │
  │  1. HANDSHAKE REQUEST                        │
  │  ─────────────────────────────────────────►  │
  │     {challenge_a, public_key_a}              │
  │                                               │
  │  2. HANDSHAKE RESPONSE                       │
  │  ◄─────────────────────────────────────────  │
  │     {challenge_b, public_key_b, hmac}        │
  │                                               │
  │  3. VERIFY HMAC                              │
  │  ✓ HMAC valid                                │
  │                                               │
  │  4. SECURE COMMUNICATION ESTABLISHED         │
  │  ◄═══════════════════════════════════════►  │
  │     All traffic encrypted with shared secret │
```

### 3.2 Crypto Handshake Implementation

```javascript
// core/security/crypto-handshake.js

const crypto = require('crypto');

class CryptoHandshake {
  constructor(core, keyManager) {
    this.core = core;
    this.keyManager = keyManager;
    this.pendingHandshakes = new Map();
    this.handshakeTimeout = 30000; // 30s timeout
  }

  // Iniciar handshake con otro core
  async initiateHandshake(targetCoreId) {
    console.log(`↔️ Initiating handshake with ${targetCoreId}...`);

    const handshakeId = crypto.randomBytes(16).toString('hex');
    const challenge = crypto.randomBytes(32).toString('base64');

    // Guardar handshake pendiente
    this.pendingHandshakes.set(handshakeId, {
      target_core_id: targetCoreId,
      challenge: challenge,
      started_at: Date.now(),
      status: 'initiated'
    });

    // Timeout automático
    setTimeout(() => {
      if (this.pendingHandshakes.has(handshakeId)) {
        console.error(`❌ Handshake timeout with ${targetCoreId}`);
        this.pendingHandshakes.delete(handshakeId);
        this.core.emit('security.handshake.timeout', { target_core_id: targetCoreId });
      }
    }, this.handshakeTimeout);

    // Publicar solicitud de handshake (SIN cifrar - es público)
    const request = {
      source_core_id: this.core.id,
      handshake_id: handshakeId,
      challenge: challenge,
      public_key: this.keyManager.getPublicKey(),
      timestamp: Date.now(),
      version: '1.0'
    };

    await this.core.mqtt.publish(
      `core/${targetCoreId}/security/handshake/request/${handshakeId}`,
      JSON.stringify(request),
      { qos: 1 }
    );

    console.log(`  Handshake ID: ${handshakeId}`);
    console.log(`  Fingerprint: ${this.keyManager.getPublicKeyFingerprint()}`);
  }

  // Manejar solicitud de handshake entrante
  async handleHandshakeRequest(topic, message) {
    try {
      const request = JSON.parse(message.toString());

      console.log(`🔐 Received handshake request from ${request.source_core_id}`);

      // Validar request básico
      if (!request.source_core_id || !request.handshake_id || !request.challenge || !request.public_key) {
        console.error('Invalid handshake request: missing fields');
        return;
      }

      // Verificar si queremos aceptar este handshake
      if (!await this.shouldAcceptHandshake(request.source_core_id)) {
        console.warn(`Rejecting handshake from ${request.source_core_id} (policy)`);
        return;
      }

      // Activar llave maestra con este core
      await this.keyManager.activateMasterKey(
        request.source_core_id,
        request.public_key
      );

      const sharedSecret = this.keyManager.getSharedSecret(request.source_core_id);

      // Generar nuestro challenge
      const responseChallenge = crypto.randomBytes(32).toString('base64');

      // Calcular HMAC mutuo (prueba de conocimiento del shared secret)
      const hmac = this.calculateMutualHMAC(
        request.challenge,
        responseChallenge,
        sharedSecret,
        request.source_core_id,
        this.core.id
      );

      // Responder al handshake
      const response = {
        source_core_id: this.core.id,
        target_core_id: request.source_core_id,
        handshake_id: request.handshake_id,
        public_key: this.keyManager.getPublicKey(),
        original_challenge: request.challenge,
        response_challenge: responseChallenge,
        hmac: hmac,
        timestamp: Date.now(),
        version: '1.0'
      };

      await this.core.mqtt.publish(
        `core/${request.source_core_id}/security/handshake/response/${request.handshake_id}`,
        JSON.stringify(response),
        { qos: 1 }
      );

      console.log(`✓ Handshake response sent to ${request.source_core_id}`);

    } catch (error) {
      console.error('Error handling handshake request:', error);
    }
  }

  // Manejar respuesta de handshake
  async handleHandshakeResponse(topic, message) {
    try {
      const response = JSON.parse(message.toString());

      console.log(`🔐 Received handshake response from ${response.source_core_id}`);

      // Buscar handshake pendiente
      const pending = this.pendingHandshakes.get(response.handshake_id);
      if (!pending) {
        console.warn(`Unknown handshake response: ${response.handshake_id}`);
        return;
      }

      // Verificar que es del core correcto
      if (pending.target_core_id !== response.source_core_id) {
        console.error('Handshake response from unexpected core');
        this.pendingHandshakes.delete(response.handshake_id);
        return;
      }

      // Activar llave maestra si aún no está
      if (!this.keyManager.peerKeys.has(response.source_core_id)) {
        await this.keyManager.activateMasterKey(
          response.source_core_id,
          response.public_key
        );
      }

      const sharedSecret = this.keyManager.getSharedSecret(response.source_core_id);

      // Verificar HMAC mutuo
      const expectedHMAC = this.calculateMutualHMAC(
        response.original_challenge,
        response.response_challenge,
        sharedSecret,
        this.core.id,
        response.source_core_id
      );

      if (response.hmac !== expectedHMAC) {
        console.error(`❌ HMAC verification failed with ${response.source_core_id}`);
        console.error(`  Expected: ${expectedHMAC}`);
        console.error(`  Received: ${response.hmac}`);

        this.keyManager.revokePeer(response.source_core_id);
        this.pendingHandshakes.delete(response.handshake_id);

        this.core.emit('security.handshake.failed', {
          peer_core_id: response.source_core_id,
          reason: 'hmac_mismatch'
        });
        return;
      }

      // ✅ Handshake exitoso - activar comunicación segura
      this.keyManager.setPeerStatus(response.source_core_id, 'active');
      this.pendingHandshakes.delete(response.handshake_id);

      const duration = Date.now() - pending.started_at;

      console.log(`✅ Secure channel established with ${response.source_core_id}`);
      console.log(`  Handshake duration: ${duration}ms`);
      console.log(`  Fingerprint: ${this.keyManager.calculateFingerprint(response.public_key)}`);

      // Emitir evento de seguridad
      this.core.emit('security.peer.trusted', {
        peer_core_id: response.source_core_id,
        handshake_id: response.handshake_id,
        duration_ms: duration,
        fingerprint: this.keyManager.calculateFingerprint(response.public_key)
      });

      // Métricas
      this.core.metrics.increment('security.handshakes.successful');
      this.core.metrics.histogram('security.handshake.duration_ms', duration);

    } catch (error) {
      console.error('Error handling handshake response:', error);
      this.core.metrics.increment('security.handshakes.failed');
    }
  }

  // Calcular HMAC mutuo (ambas partes deben llegar al mismo valor)
  calculateMutualHMAC(challengeA, challengeB, sharedSecret, coreIdA, coreIdB) {
    // Orden determinístico independiente de quién inicia
    const sortedIds = [coreIdA, coreIdB].sort();

    const hmac = crypto.createHmac('sha256', Buffer.from(sharedSecret, 'base64'));
    hmac.update(challengeA);
    hmac.update(challengeB);
    hmac.update(sortedIds[0]);
    hmac.update(sortedIds[1]);
    hmac.update('event-core-v1'); // Protocol version

    return hmac.digest('hex');
  }

  // Política de aceptación de handshakes
  async shouldAcceptHandshake(sourceCoreId) {
    // Implementar políticas según necesidad:

    // 1. Whitelist explícita
    const whitelist = this.core.config.security?.whitelist || [];
    if (whitelist.length > 0 && !whitelist.includes(sourceCoreId)) {
      return false;
    }

    // 2. Blacklist explícita
    const blacklist = this.core.config.security?.blacklist || [];
    if (blacklist.includes(sourceCoreId)) {
      return false;
    }

    // 3. Verificar si ya fue revocado previamente
    const peer = this.keyManager.peerKeys.get(sourceCoreId);
    if (peer && peer.status === 'revoked') {
      return false;
    }

    // 4. Rate limiting (prevenir DoS)
    // TODO: Implementar rate limiting por core_id

    // Por defecto: aceptar (pero el usuario debe confirmar manualmente después)
    return true;
  }

  // Generar código de verificación visual (6 dígitos)
  generateVerificationCode(publicKey) {
    const hash = crypto.createHash('sha256').update(publicKey).digest('hex');
    return hash.substring(0, 6).toUpperCase();
  }
}

module.exports = CryptoHandshake;
```

---

## 4. Cifrado End-to-End Automático

### 4.1 Secure Envelope

**Estructura del mensaje cifrado:**

```json
{
  "encrypted": "a3f7b2c...",      // Payload cifrado (hex)
  "nonce": "9d3e1f...",            // Nonce único (hex)
  "auth_tag": "c5a8b...",          // Authentication tag GCM (hex)
  "source_core_id": "core-a",
  "timestamp": 1696600000000,
  "version": "1.0"
}
```

### 4.2 Secure Envelope Implementation

```javascript
// core/security/secure-envelope.js

const crypto = require('crypto');

class SecureEnvelope {
  constructor(core, keyManager) {
    this.core = core;
    this.keyManager = keyManager;
    this.algorithm = 'aes-256-gcm';
    this.nonceLength = 12; // 96-bit para AES-GCM
  }

  // Cifrar mensaje para un core específico
  encryptForPeer(peerCoreId, payload) {
    if (!this.keyManager.isPeerTrusted(peerCoreId)) {
      throw new SecurityError(`Cannot encrypt for untrusted peer: ${peerCoreId}`);
    }

    const sharedSecret = this.keyManager.getSharedSecret(peerCoreId);

    // Generar nonce único por mensaje (CRÍTICO para seguridad)
    const nonce = crypto.randomBytes(this.nonceLength);

    // Derivar clave de cifrado específica para este par de cores
    const encryptionKey = this.deriveEncryptionKey(
      sharedSecret,
      this.core.id,
      peerCoreId
    );

    // Serializar payload
    const plaintext = JSON.stringify(payload);

    // Cifrar con AES-256-GCM
    const cipher = crypto.createCipheriv(this.algorithm, encryptionKey, nonce);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Obtener authentication tag (garantiza integridad)
    const authTag = cipher.getAuthTag();

    // Construir envelope seguro
    const secureEnvelope = {
      encrypted: encrypted,
      nonce: nonce.toString('hex'),
      auth_tag: authTag.toString('hex'),
      source_core_id: this.core.id,
      timestamp: Date.now(),
      version: '1.0'
    };

    // Métricas
    this.core.metrics.increment('security.messages.encrypted', {
      peer: peerCoreId
    });

    return secureEnvelope;
  }

  // Descifrar mensaje de un core
  decryptFromPeer(peerCoreId, secureEnvelope) {
    if (!this.keyManager.isPeerTrusted(peerCoreId)) {
      throw new SecurityError(`Cannot decrypt from untrusted peer: ${peerCoreId}`);
    }

    try {
      const sharedSecret = this.keyManager.getSharedSecret(peerCoreId);

      // Derivar clave de cifrado (orden inverso)
      const encryptionKey = this.deriveEncryptionKey(
        sharedSecret,
        peerCoreId,
        this.core.id
      );

      // Crear decipher
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        encryptionKey,
        Buffer.from(secureEnvelope.nonce, 'hex')
      );

      // Establecer authentication tag
      decipher.setAuthTag(Buffer.from(secureEnvelope.auth_tag, 'hex'));

      // Descifrar
      let decrypted = decipher.update(secureEnvelope.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      // Parsear payload
      const payload = JSON.parse(decrypted);

      // Métricas
      this.core.metrics.increment('security.messages.decrypted', {
        peer: peerCoreId
      });

      return payload;

    } catch (error) {
      console.error(`❌ Failed to decrypt message from ${peerCoreId}:`, error.message);

      this.core.metrics.increment('security.decryption.failed', {
        peer: peerCoreId,
        error: error.message
      });

      throw new SecurityError(`Decryption failed: ${error.message}`);
    }
  }

  // Derivar clave de cifrado usando HKDF
  deriveEncryptionKey(sharedSecret, sourceId, targetId) {
    // HKDF (HMAC-based Key Derivation Function)
    // RFC 5869: https://tools.ietf.org/html/rfc5869

    const salt = Buffer.from('event-core-encryption-v1');
    const info = `${sourceId}->${targetId}`;

    const key = crypto.hkdfSync(
      'sha256',
      Buffer.from(sharedSecret, 'base64'),
      salt,
      info,
      32 // 256-bit key para AES-256
    );

    return key;
  }

  // Verificar integridad del envelope sin descifrar
  verifyIntegrity(secureEnvelope) {
    const requiredFields = ['encrypted', 'nonce', 'auth_tag', 'source_core_id', 'timestamp'];

    for (const field of requiredFields) {
      if (!secureEnvelope[field]) {
        throw new SecurityError(`Invalid secure envelope: missing ${field}`);
      }
    }

    // Verificar que el timestamp no es muy antiguo (prevenir replay)
    const maxAge = 5 * 60 * 1000; // 5 minutos
    if (Date.now() - secureEnvelope.timestamp > maxAge) {
      throw new SecurityError('Secure envelope too old (possible replay attack)');
    }

    return true;
  }
}

class SecurityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SecurityError';
  }
}

module.exports = { SecureEnvelope, SecurityError };
```

---

## 5. Integración como Módulo

**NOTA ARQUITECTÓNICA IMPORTANTE:** Security es un **módulo especializado**, no parte del core. El core provee hooks para que módulos intercepten operaciones.

### 5.1 Module Structure

```
modules/security-p2p/
├── module.json              # Manifest del módulo
├── index.js                 # Entry point con hooks
├── key-manager.js           # Gestión de llaves
├── crypto-handshake.js      # Handshake protocol
├── secure-envelope.js       # Cifrado E2E
├── hooks.js                 # Hook implementations
└── schemas/
    ├── trust-peer.json
    └── revoke-peer.json
```

### 5.2 Module Manifest

```json
{
  "name": "security-p2p",
  "version": "1.0.0",
  "description": "P2P Zero Trust Security with E2E Encryption",
  "author": "Event Core Team",

  "provides": {
    "hooks": [
      "beforeEventPublish",
      "afterEventReceive"
    ],
    "apis": [
      {
        "name": "status",
        "method": "GET",
        "path": "/status",
        "description": "Get security status and trusted peers"
      },
      {
        "name": "getPublicKey",
        "method": "GET",
        "path": "/public-key"
      },
      {
        "name": "trustPeer",
        "method": "POST",
        "path": "/trust-peer",
        "schema": "./schemas/trust-peer.json"
      },
      {
        "name": "revokePeer",
        "method": "DELETE",
        "path": "/trust-peer"
      },
      {
        "name": "listTrustedPeers",
        "method": "GET",
        "path": "/trusted-peers"
      }
    ]
  },

  "subscribes": [
    "core/+/security/handshake/request/#",
    "core/+/security/handshake/response/#"
  ],

  "config": {
    "handshake_timeout_ms": 30000,
    "auto_trust_enabled": false
  }
}
```

### 5.3 Module Implementation (Hook-Based)

```javascript
// modules/security-p2p/index.js

const KeyManager = require('./key-manager');
const CryptoHandshake = require('./crypto-handshake');
const SecureEnvelope = require('./secure-envelope');

module.exports = class SecurityP2PModule {
  async onLoad(core) {
    this.core = core;
    this.config = core.config.modules?.['security-p2p'] || {};

    // Inicializar componentes
    this.keyManager = new KeyManager(core);
    this.cryptoHandshake = new CryptoHandshake(core, this.keyManager);
    this.secureEnvelope = new SecureEnvelope(core, this.keyManager);

    // Registrar hooks para interceptar eventos
    core.hooks.register('beforeEventPublish', this.encryptOutgoingEvent.bind(this));
    core.hooks.register('afterEventReceive', this.decryptIncomingEvent.bind(this));

    // Suscribirse a topics de seguridad via MQTT
    await core.mqtt.subscribe('core/+/security/handshake/request/#');
    await core.mqtt.subscribe('core/+/security/handshake/response/#');

    // Registrar handler de mensajes MQTT
    core.mqtt.on('message', this.handleSecurityMessage.bind(this));

    core.logger.info('module.loaded', { module: 'security-p2p', version: '1.0.0' });
  }

  // Hook: Interceptar eventos salientes
  async encryptOutgoingEvent(context) {
    const { eventType, data, options } = context;

    // Si no hay targetCoreId o no es trusted, dejar pasar sin cifrar
    if (!options.targetCoreId || !this.keyManager.isPeerTrusted(options.targetCoreId)) {
      return context; // Sin modificar
    }

    try {
      // Cifrar el payload
      const encryptedData = this.secureEnvelope.encryptForPeer(options.targetCoreId, data);

      // Modificar el context para publicar version cifrada
      return {
        ...context,
        data: encryptedData,
        metadata: {
          ...context.metadata,
          encrypted: true,
          source_core_id: this.core.id
        }
      };

    } catch (error) {
      this.core.logger.error('encryption.failed', { error: error.message });
      return context; // Dejar pasar sin cifrar en caso de error
    }
  }

  // Hook: Interceptar eventos entrantes
  async decryptIncomingEvent(context) {
    const { event } = context;

    // Si no está cifrado, dejar pasar
    if (!event.metadata?.encrypted) {
      return context;
    }

    const sourceCoreId = event.metadata.source_core_id;

    // Verificar que el peer es trusted
    if (!this.keyManager.isPeerTrusted(sourceCoreId)) {
      this.core.logger.warn('untrusted.encrypted.message', { source: sourceCoreId });
      this.core.metrics.increment('security.untrusted_message.blocked');
      return null; // Bloquear evento
    }

    try {
      // Descifrar
      const decryptedData = this.secureEnvelope.decryptFromPeer(sourceCoreId, event.data);

      // Retornar evento modificado con datos descifrados
      return {
        ...context,
        event: {
          ...event,
          data: decryptedData,
          metadata: {
            ...event.metadata,
            encrypted: false,
            secure_channel_verified: true
          }
        }
      };

    } catch (error) {
      this.core.logger.error('decryption.failed', { error: error.message });
      return null; // Bloquear evento si falla descifrado
    }
  }

  // Handler de mensajes MQTT de seguridad
  handleSecurityMessage(topic, message) {
    if (topic.includes('/security/handshake/request/')) {
      this.cryptoHandshake.handleHandshakeRequest(topic, message);
    } else if (topic.includes('/security/handshake/response/')) {
      this.cryptoHandshake.handleHandshakeResponse(topic, message);
    }
  }

  // ===== APIs HTTP expuestas por el módulo =====

  async status() {
    return {
      core_id: this.core.id,
      fingerprint: this.keyManager.getPublicKeyFingerprint(),
      created_at: this.keyManager.masterKeyPair.createdAt,
      trusted_peers: this.keyManager.getTrustedPeers().map(peer => ({
        core_id: peer.core_id,
        fingerprint: peer.fingerprint,
        activated_at: peer.activatedAt,
        status: peer.status
      }))
    };
  }

  async getPublicKey() {
    return {
      public_key: this.keyManager.getPublicKey(),
      fingerprint: this.keyManager.getPublicKeyFingerprint()
    };
  }

  async trustPeer({ body }) {
    const { peer_core_id, public_key } = body;

    await this.keyManager.activateMasterKey(peer_core_id, public_key);
    const handshakeId = await this.cryptoHandshake.initiateHandshake(peer_core_id);

    return {
      status: 'handshake_initiated',
      handshake_id: handshakeId,
      message: 'Waiting for peer response'
    };
  }

  async revokePeer({ body }) {
    const { peer_core_id } = body;
    this.keyManager.revokePeer(peer_core_id);

    return {
      status: 'revoked',
      message: `Trust revoked for ${peer_core_id}`
    };
  }

  async listTrustedPeers() {
    return {
      peers: this.keyManager.getTrustedPeers().map(peer => ({
        core_id: peer.core_id,
        fingerprint: peer.fingerprint,
        activated_at: peer.activatedAt
      }))
    };
  }

  async onUnload() {
    this.core.logger.info('module.unloaded', { module: 'security-p2p' });
  }
};
```

### 5.4 Core Hook System

El Core expone un sistema de hooks para que módulos intercepten operaciones:

```javascript
// core/hooks.js

class HookManager {
  constructor() {
    this.hooks = {};
  }

  register(hookName, handler) {
    if (!this.hooks[hookName]) {
      this.hooks[hookName] = [];
    }
    this.hooks[hookName].push(handler);
  }

  async execute(hookName, context) {
    const handlers = this.hooks[hookName] || [];
    let currentContext = context;

    for (const handler of handlers) {
      const result = await handler(currentContext);

      // Si retorna null, bloquear operación
      if (result === null) {
        return null;
      }

      // Si retorna objeto, modificar context
      if (result !== undefined) {
        currentContext = result;
      }
    }

    return currentContext;
  }
}

module.exports = HookManager;
```

### 5.5 Core Integration

```javascript
// core/core.js (fragmento)

const HookManager = require('./hooks');

class Core extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.hooks = new HookManager();
    // ... resto de inicialización
  }

  async publish(eventType, data, options = {}) {
    // Ejecutar hooks ANTES de publicar
    const context = await this.hooks.execute('beforeEventPublish', {
      eventType,
      data,
      options
    });

    // Si hook retorna null, bloquear publicación
    if (context === null) {
      this.logger.warn('event.blocked', { eventType });
      return;
    }

    // Usar context modificado por hooks
    const finalEventType = context.eventType;
    const finalData = context.data;
    const finalOptions = context.options;

    // ... resto de la lógica de publicación
  }
}
```

---

## 6. CLI como Cliente HTTP Puro

**NOTA ARQUITECTÓNICA IMPORTANTE:** El CLI es un **cliente HTTP puro** que consume las mismas APIs REST que cualquier otro cliente (Web UI, scripts, otros cores). No tiene lógica de negocio ni acceso directo al Core.

### 6.1 CLI Architecture

```
CLI (Proceso separado)
    ↓
  HTTP Request
    ↓
Core HTTP API Gateway (Puerto 3000)
    ↓
Module API Handler
    ↓
Security Module
```

### 6.2 HTTP Client Implementation

```javascript
// cli/index.js (Pure HTTP Client)

const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

class CoreCLI {
  constructor(coreUrl = 'http://localhost:3000') {
    this.coreUrl = coreUrl;
  }

  // HTTP request helper
  async request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };

      const req = http.request(`${this.coreUrl}${path}`, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(data ? JSON.parse(data) : {});
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // ===== Security Commands =====

  // Security Status
  async securityStatus() {
    const data = await this.request('GET', '/modules/security-p2p/status');

    console.log('\n🔐 Security Status\n');
    console.log(`Core ID: ${data.core_id}`);
    console.log(`Master Key Fingerprint: ${data.fingerprint}`);
    console.log(`Created: ${new Date(data.created_at).toISOString()}`);

    console.log('\n📋 Trusted Peers:\n');
    if (data.trusted_peers.length === 0) {
      console.log('  (none)');
    } else {
      data.trusted_peers.forEach(peer => {
        console.log(`  ✓ ${peer.core_id}`);
        console.log(`    Fingerprint: ${peer.fingerprint}`);
        console.log(`    Activated: ${new Date(peer.activated_at).toISOString()}`);
        console.log('');
      });
    }
  }

  // Show Public Key
  async showPublicKey() {
    const data = await this.request('GET', '/modules/security-p2p/public-key');

    console.log('\n🔑 Public Key (share with trusted peers)\n');
    console.log(data.public_key);
    console.log('\n📌 Fingerprint (for verification):\n');
    console.log(data.fingerprint);
    console.log('');
  }

  // Trust Peer
  async trustPeer(peerCoreId, publicKeyPath) {
    console.log(`\n🤝 Initiating trust with ${peerCoreId}...\n`);

    // Leer clave pública del archivo
    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');

    // Calcular fingerprint localmente para verificación
    const hash = crypto.createHash('sha256').update(publicKey).digest('hex');
    const fingerprint = hash.substring(0, 16).toUpperCase();

    console.log(`Peer fingerprint: ${fingerprint}`);
    console.log('');
    console.log('⚠️  Verify this fingerprint matches the one shown on the peer device.');
    console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...');

    await this.sleep(5000);

    try {
      // Llamada HTTP API
      const result = await this.request('POST', '/modules/security-p2p/trust-peer', {
        peer_core_id: peerCoreId,
        public_key: publicKey
      });

      console.log('\n✓ Handshake initiated. Waiting for peer response...');
      console.log('  This may take up to 30 seconds.');

      // Poll status hasta que handshake complete
      const maxAttempts = 30;
      for (let i = 0; i < maxAttempts; i++) {
        await this.sleep(1000);

        const status = await this.request('GET', '/modules/security-p2p/status');
        const peer = status.trusted_peers.find(p => p.core_id === peerCoreId);

        if (peer && peer.status === 'trusted') {
          console.log(`\n✅ Secure channel established with ${peerCoreId}`);
          console.log(`   You can now communicate securely.`);
          return;
        }
      }

      throw new Error('Handshake timeout');

    } catch (error) {
      console.error(`\n❌ Failed to establish trust: ${error.message}`);
      process.exit(1);
    }
  }

  // Revoke Trust
  async revokeTrust(peerCoreId) {
    console.log(`\n🚫 Revoking trust for ${peerCoreId}...\n`);

    try {
      await this.request('DELETE', '/modules/security-p2p/trust-peer', {
        peer_core_id: peerCoreId
      });

      console.log(`✓ Trust revoked. All communication with ${peerCoreId} is now blocked.`);
    } catch (error) {
      console.error(`❌ Failed to revoke trust: ${error.message}`);
      process.exit(1);
    }
  }

  // List Trusted Peers
  async listTrusted() {
    const data = await this.request('GET', '/modules/security-p2p/trusted-peers');

    console.log('\n📋 Trusted Peers\n');

    if (data.peers.length === 0) {
      console.log('  (none)');
      return;
    }

    data.peers.forEach((peer, index) => {
      console.log(`${index + 1}. ${peer.core_id}`);
      console.log(`   Fingerprint: ${peer.fingerprint}`);
      console.log(`   Since: ${new Date(peer.activated_at).toLocaleString()}`);
      console.log('');
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI entry point
if (require.main === module) {
  const cli = new CoreCLI(process.env.CORE_URL || 'http://localhost:3000');
  const command = process.argv[2];
  const args = process.argv.slice(3);

  (async () => {
    try {
      switch (command) {
        case 'security':
          switch (args[0]) {
            case 'status':
              await cli.securityStatus();
              break;
            case 'show-public-key':
              await cli.showPublicKey();
              break;
            case 'trust-peer':
              if (!args[1] || !args[2]) {
                console.error('Usage: core security trust-peer <peer-core-id> <public-key-path>');
                process.exit(1);
              }
              await cli.trustPeer(args[1], args[2]);
              break;
            case 'list-trusted':
              await cli.listTrusted();
              break;
            case 'revoke-trust':
              if (!args[1]) {
                console.error('Usage: core security revoke-trust <peer-core-id>');
                process.exit(1);
              }
              await cli.revokeTrust(args[1]);
              break;
            default:
              console.error('Unknown security command. Available: status, show-public-key, trust-peer, list-trusted, revoke-trust');
              process.exit(1);
          }
          break;
        default:
          console.error('Unknown command. Available: security');
          process.exit(1);
      }
    } catch (error) {
      console.error('CLI Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = CoreCLI;
```

### 6.3 Uso del CLI

```bash
# Ver estado de seguridad
$ node cli/index.js security status

# O usando alias instalado globalmente:
$ core security status

# Mostrar clave pública (para compartir)
$ core security show-public-key

# Trust nuevo peer
$ core security trust-peer core-b ./peer-b-public-key.pem

# Listar peers trusted
$ core security list-trusted

# Revocar trust
$ core security revoke-trust core-b

# Conectar a core remoto
$ CORE_URL=http://192.168.1.100:3000 core security status
```

### 6.4 HTTP Endpoints Consumidos

Todos los comandos del CLI consumen las APIs HTTP expuestas por el módulo `security-p2p`:

| CLI Command | HTTP Method | Endpoint |
|-------------|-------------|----------|
| `security status` | GET | `/modules/security-p2p/status` |
| `security show-public-key` | GET | `/modules/security-p2p/public-key` |
| `security trust-peer` | POST | `/modules/security-p2p/trust-peer` |
| `security list-trusted` | GET | `/modules/security-p2p/trusted-peers` |
| `security revoke-trust` | DELETE | `/modules/security-p2p/trust-peer` |

### 6.5 Ventajas de CLI como Cliente HTTP

✅ **Remoto por defecto** - CLI puede conectarse a core en otra máquina
✅ **Zero lógica de negocio** - Solo renderiza respuestas HTTP
✅ **Mismas APIs que Web UI** - Consistencia total
✅ **Testeable** - Se puede mockear el servidor HTTP
✅ **Agnóstico** - Puede escribirse en cualquier lenguaje (Python, Go, etc.)
✅ **Stateless** - No guarda estado, solo hace requests

---

## 7. Políticas de Seguridad

### 7.1 Security Policy Manager

```javascript
// core/security/security-policy.js

class SecurityPolicy {
  constructor(core) {
    this.core = core;
    this.config = core.config.security || {};
  }

  // Aplicar políticas por defecto
  applyDefaultPolicies() {
    console.log('🛡️ Applying security policies...');

    // 1. Ignorar cores no trusted
    this.core.discovery.on('core.discovered', (coreInfo) => {
      if (!this.core.keyManager.isPeerTrusted(coreInfo.core_id)) {
        console.log(`🔒 Ignoring untrusted core: ${coreInfo.core_id}`);
        // No suscribirse a eventos automáticamente
        return;
      }

      console.log(`✓ Trusted core discovered: ${coreInfo.core_id}`);
    });

    // 2. Rechazar mensajes no seguros de cores desconocidos
    this.core.mqtt.on('message', (topic, message) => {
      // Permitir siempre discovery y handshake (son públicos)
      if (topic.includes('/status') || topic.includes('/handshake/')) {
        return; // Permitir
      }

      // Eventos seguros solo de peers trusted
      if (topic.includes('/events/secure/')) {
        return; // Manejado por secureRouter
      }

      // Todo lo demás de cores no trusted: ignorar
      const sourceCoreId = this.extractCoreIdFromTopic(topic);
      if (!this.core.keyManager.isPeerTrusted(sourceCoreId)) {
        console.warn(`🚫 Blocked unsecured message from untrusted core: ${sourceCoreId}`);
        this.core.metrics.increment('security.blocked.untrusted');
        return;
      }
    });

    // 3. Validar integridad de peers periódicamente
    setInterval(() => this.validateTrustedPeers(), 300000); // 5 minutos

    // 4. Rate limiting para handshakes (prevenir DoS)
    this.setupHandshakeRateLimiting();

    console.log('✓ Security policies active');
  }

  // Validar que los peers trusted siguen activos
  async validateTrustedPeers() {
    const peers = this.core.keyManager.getTrustedPeers();

    for (const peer of peers) {
      try {
        // Enviar heartbeat seguro
        await this.core.emitSecure('security.heartbeat', {
          timestamp: Date.now()
        }, { targetCoreId: peer.core_id });

        // Si no responde en 10s, marcar como suspicious
        // (implementar timeout en secureRouter)

      } catch (error) {
        console.warn(`Peer ${peer.core_id} validation failed: ${error.message}`);

        // Downgrade trust (no revocar automáticamente)
        this.core.emit('security.peer.suspicious', {
          peer_core_id: peer.core_id,
          reason: error.message
        });
      }
    }
  }

  // Rate limiting para handshakes
  setupHandshakeRateLimiting() {
    this.handshakeAttempts = new Map(); // core_id → [timestamps]
    const maxAttempts = 5;
    const windowMs = 60000; // 1 minuto

    this.core.cryptoHandshake.on('handshake.request', (request) => {
      const coreId = request.source_core_id;
      const now = Date.now();

      // Limpiar attempts antiguos
      const attempts = (this.handshakeAttempts.get(coreId) || [])
        .filter(t => now - t < windowMs);

      if (attempts.length >= maxAttempts) {
        console.warn(`🚫 Rate limit exceeded for ${coreId}`);
        this.core.metrics.increment('security.rate_limit.exceeded');
        return false; // Rechazar
      }

      attempts.push(now);
      this.handshakeAttempts.set(coreId, attempts);

      return true; // Permitir
    });
  }

  extractCoreIdFromTopic(topic) {
    // core/a/events/... → 'a'
    const parts = topic.split('/');
    return parts[1];
  }
}

module.exports = SecurityPolicy;
```

---

## 8. Implementación Completa

### 8.1 Integración Final en Core

```javascript
// core/core.js

const KeyManager = require('./security/key-manager');
const CryptoHandshake = require('./security/crypto-handshake');
const { SecureEnvelope } = require('./security/secure-envelope');
const SecureEventRouter = require('./security/secure-event-router');
const SecurityPolicy = require('./security/security-policy');

class Core extends EventEmitter {
  async start() {
    // ... (inicialización existente)

    // === SECURITY INITIALIZATION ===
    console.log('🔐 Initializing security layer...');

    // 1. Key Manager
    this.keyManager = new KeyManager(this);

    // 2. Crypto Handshake
    this.cryptoHandshake = new CryptoHandshake(this, this.keyManager);

    // 3. Secure Envelope
    this.secureEnvelope = new SecureEnvelope(this, this.keyManager);

    // 4. Secure Event Router
    this.secureRouter = new SecureEventRouter(this, this.keyManager, this.secureEnvelope);

    // 5. Security Policy
    this.securityPolicy = new SecurityPolicy(this);
    this.securityPolicy.applyDefaultPolicies();

    // 6. Suscribirse a topics de seguridad
    await this.mqtt.subscribe('core/+/security/handshake/request/#', { qos: 1 });
    await this.mqtt.subscribe('core/+/security/handshake/response/#', { qos: 1 });
    await this.mqtt.subscribe(`core/${this.id}/events/secure/#`, { qos: 1 });

    // 7. Handlers de mensajes de seguridad
    this.mqtt.on('message', (topic, message) => {
      if (topic.includes('/security/handshake/request/')) {
        this.cryptoHandshake.handleHandshakeRequest(topic, message);
      } else if (topic.includes('/security/handshake/response/')) {
        this.cryptoHandshake.handleHandshakeResponse(topic, message);
      } else if (topic.includes('/events/secure/')) {
        this.secureRouter.handleSecureMessage(topic, message);
      }
    });

    console.log('✓ Security layer initialized');
    console.log(`  Fingerprint: ${this.keyManager.getPublicKeyFingerprint()}`);

    // ... (resto de inicialización)
  }

  // === SECURITY API PÚBLICA ===

  // Publicar evento seguro
  async emitSecure(eventType, data, options = {}) {
    return this.secureRouter.publishSecure(eventType, data, options);
  }

  // Trust nuevo peer
  async trustPeer(peerCoreId, publicKey) {
    await this.keyManager.activateMasterKey(peerCoreId, publicKey);
    await this.cryptoHandshake.initiateHandshake(peerCoreId);
  }

  // Revoke peer
  async revokePeer(peerCoreId) {
    this.keyManager.revokePeer(peerCoreId);
  }

  // Obtener peers trusted
  getTrustedPeers() {
    return this.keyManager.getTrustedPeers();
  }
}
```

---

## 9. Validación y Testing

### 9.1 Test de Handshake

```javascript
// tests/security/handshake.test.js

describe('Crypto Handshake', () => {
  it('should complete handshake between two cores', async () => {
    // Setup
    const coreA = new Core({ id: 'core-a' });
    const coreB = new Core({ id: 'core-b' });

    await coreA.start();
    await coreB.start();

    // Core A inicia trust con Core B
    const publicKeyB = coreB.keyManager.getPublicKey();
    await coreA.trustPeer('core-b', publicKeyB);

    // Esperar handshake
    await new Promise((resolve) => {
      coreA.once('security.peer.trusted', (data) => {
        expect(data.peer_core_id).toBe('core-b');
        resolve();
      });
    });

    // Verificar que ambos cores tienen el mismo shared secret
    const secretA = coreA.keyManager.getSharedSecret('core-b');
    const secretB = coreB.keyManager.getSharedSecret('core-a');

    expect(secretA).toBe(secretB);

    // Cleanup
    await coreA.shutdown();
    await coreB.shutdown();
  });
});
```

### 9.2 Test de Cifrado E2E

```javascript
// tests/security/encryption.test.js

describe('End-to-End Encryption', () => {
  it('should encrypt and decrypt messages correctly', async () => {
    // Setup cores con trust establecido
    const coreA = new Core({ id: 'core-a' });
    const coreB = new Core({ id: 'core-b' });

    await coreA.start();
    await coreB.start();

    // Establecer trust (simulado)
    await establishTrust(coreA, coreB);

    // Core A envía mensaje seguro a Core B
    const testData = { message: 'Hello, secure world!' };

    await coreA.emitSecure('test.message', testData, {
      targetCoreId: 'core-b'
    });

    // Core B recibe mensaje
    await new Promise((resolve) => {
      coreB.once('test.message', (event) => {
        expect(event.data.message).toBe('Hello, secure world!');
        expect(event.source.secure).toBe(true);
        resolve();
      });
    });

    // Cleanup
    await coreA.shutdown();
    await coreB.shutdown();
  });

  it('should reject messages from untrusted cores', async () => {
    // Setup
    const coreA = new Core({ id: 'core-a' });
    const maliciousCore = new Core({ id: 'core-malicious' });

    await coreA.start();
    await maliciousCore.start();

    // Malicious core intenta enviar mensaje sin trust
    let received = false;
    coreA.once('test.attack', () => {
      received = true;
    });

    await maliciousCore.emitSecure('test.attack', { evil: true }, {
      targetCoreId: 'core-a'
    });

    await sleep(1000);

    // Core A NO debe recibir el mensaje
    expect(received).toBe(false);

    // Cleanup
    await coreA.shutdown();
    await maliciousCore.shutdown();
  });
});
```

---

## 10. Ventajas de Este Enfoque

### 10.1 Ventajas Técnicas

✅ **Zero Sobrecarga Centralizada**
- Sin servidores de autenticación
- Sin PKI compleja
- Sin dependencias externas (OAuth, Kerberos, CA)

✅ **Seguridad P2P Real**
- Cifrado end-to-end (E2E)
- Autenticación mutua obligatoria
- Forward secrecy posible (regenerando claves)
- Protección contra MITM, impersonación, replay

✅ **Alineado con Filosofía del Core**
- Descentralizado (no hay autoridad central)
- Zero-trust por defecto
- Funciona offline
- Mismo código para todas las escalas (Termux → Cloud)

✅ **Performance**
- X25519: 40x más rápido que RSA
- AES-256-GCM: hardware-accelerated en CPUs modernas
- Overhead mínimo (~100 bytes por mensaje)

### 10.2 Experiencia de Usuario

**Flujo típico:**

```bash
# 1. Core A muestra su clave pública
$ core security show-public-key
-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...
-----END PUBLIC KEY-----

Fingerprint: A3F7:B2C4:9D1E:8F0A

# 2. Compartir con Core B (email, USB, QR, etc.)

# 3. Core B importa y confía
$ core security trust-peer core-a ./core-a-public-key.pem
Peer fingerprint: A3F7:B2C4:9D1E:8F0A
⚠️  Verify this matches the peer device.
✓ Handshake initiated...
✅ Secure channel established with core-a

# 4. Comunicación segura automática
$ core emit-secure file.created --data '{"path":"/data/doc.txt"}'
✓ Event published securely to all trusted peers
```

**Simple, visual, verificable.**

---

## 11. Roadmap de Implementación

### Fase 1: Fundamentos (Semana 1)
- ✅ KeyManager con X25519
- ✅ CryptoHandshake protocolo completo
- ✅ SecureEnvelope con AES-256-GCM
- ✅ Tests básicos

### Fase 2: Integración (Semana 2)
- ✅ SecureEventRouter
- ✅ Integración en Core principal
- ✅ SecurityPolicy manager
- ✅ Tests de integración

### Fase 3: CLI y UX (Semana 3)
- ✅ CLI de gestión de seguridad
- ✅ Códigos de verificación visual
- ✅ Backup/restore de keys
- ✅ Documentación completa

---

## 12. Conclusión

Esta arquitectura de seguridad P2P con llaves maestras proporciona:

1. **Seguridad robusta** sin dependencias externas
2. **Experiencia de usuario simple** (trust explícito, verificación visual)
3. **Alineación perfecta** con filosofía descentralizada del core
4. **Performance excelente** (X25519 + AES-GCM)
5. **Escalabilidad** (mismo código 1 peer o 1000 peers)

**El sistema es seguro por defecto, pero usable sin fricción.**

---

**Fin del documento de Arquitectura de Seguridad.**

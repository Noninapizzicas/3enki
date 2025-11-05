# Security como Módulo - Refactorización Arquitectónica

**Documento de Refactorización**
**Versión:** 1.0.0
**Fecha:** 2025-10-06
**Objetivo:** Convertir seguridad de componente core a módulo especializado

---

## 🎯 Cambio Arquitectónico

### **ANTES** (Incorrecto)
```
Core
├── core/security/      ← Dentro del core
│   ├── key-manager.js
│   ├── crypto-handshake.js
│   ├── secure-envelope.js
│   └── secure-event-router.js
└── core/core.js        ← Core conoce Security
```

### **DESPUÉS** (Correcto)
```
Core                    ← Minimalista, solo infra
└── Hooks              ← Puntos de extensión

modules/security-p2p/   ← Módulo especializado
├── module.json
├── index.js
├── key-manager.js
├── crypto-handshake.js
├── secure-envelope.js
└── hooks.js           ← Usa hooks del core
```

---

## 🔄 Transformaciones Necesarias

### 1. Integración con el Core → Hooks

**Antes (Líneas 966-1016 de SECURITY_ARCHITECTURE.md):**
```javascript
// core/core.js
class Core extends EventEmitter {
  async start() {
    // Inicializar sistema de seguridad
    this.keyManager = new KeyManager(this);
    this.cryptoHandshake = new CryptoHandshake(this, this.keyManager);
    this.secureEnvelope = new SecureEnvelope(this, this.keyManager);
    this.secureRouter = new SecureEventRouter(this, this.keyManager, this.secureEnvelope);

    // Suscribirse a topics de seguridad
    await this.mqtt.subscribe('core/+/security/handshake/request/#');
    // ...
  }

  async emitSecure(eventType, data, options = {}) {
    return this.secureRouter.publishSecure(eventType, data, options);
  }
}
```

**Después (Hook-based):**
```javascript
// modules/security-p2p/index.js

module.exports = class SecurityP2PModule {
  async onLoad(core) {
    this.core = core;
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

    console.log('🔐 Security P2P module loaded');
  }

  // Hook: Interceptar eventos salientes
  async encryptOutgoingEvent(context) {
    const { eventType, data, options } = context;

    // Si no hay targetCoreId o no es trusted, dejar pasar sin cifrar
    if (!options.targetCoreId || !this.keyManager.isPeerTrusted(options.targetCoreId)) {
      return context; // Sin modificar
    }

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
      console.warn(`Received encrypted message from untrusted peer: ${sourceCoreId}`);
      return null; // Bloquear evento
    }

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
  }

  // Handler de mensajes MQTT de seguridad
  handleSecurityMessage(topic, message) {
    if (topic.includes('/security/handshake/request/')) {
      this.cryptoHandshake.handleHandshakeRequest(topic, message);
    } else if (topic.includes('/security/handshake/response/')) {
      this.cryptoHandshake.handleHandshakeResponse(topic, message);
    }
  }

  // APIs expuestas por el módulo
  async trustPeer(peerCoreId, publicKey) {
    await this.keyManager.activateMasterKey(peerCoreId, publicKey);
    await this.cryptoHandshake.initiateHandshake(peerCoreId);
  }

  async revokePeer(peerCoreId) {
    this.keyManager.revokePeer(peerCoreId);
  }

  getTrustedPeers() {
    return this.keyManager.getTrustedPeers();
  }

  getPublicKey() {
    return this.keyManager.getPublicKey();
  }

  getPublicKeyFingerprint() {
    return this.keyManager.getPublicKeyFingerprint();
  }

  async onUnload() {
    console.log('🔓 Security P2P module unloaded');
  }
};
```

---

### 2. CLI Commands → HTTP API Client

**Antes (Líneas 1024-1199):**
```javascript
// cli/commands/security.js
class SecurityCommands {
  constructor(core) {
    this.core = core;  // ← CLI tiene acceso directo al Core
  }

  async status() {
    console.log(`Core ID: ${this.core.id}`);
    console.log(`Master Key Fingerprint: ${this.core.keyManager.getPublicKeyFingerprint()}`);
    // ...
  }

  async trustPeer(peerCoreId, publicKeyPath) {
    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    await this.core.trustPeer(peerCoreId, publicKey);  // ← Llamada directa
  }
}
```

**Después (HTTP Client):**
```javascript
// cli/index.js (Pure HTTP Client)

const http = require('http');
const fs = require('fs');

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
            resolve(JSON.parse(data));
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

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
    const crypto = require('crypto');
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
              await cli.trustPeer(args[1], args[2]);
              break;
            case 'list-trusted':
              await cli.listTrusted();
              break;
            case 'revoke-trust':
              await cli.revokeTrust(args[1]);
              break;
            default:
              console.error('Unknown security command');
              process.exit(1);
          }
          break;
        default:
          console.error('Unknown command');
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

---

### 3. Module Manifest

**modules/security-p2p/module.json:**
```json
{
  "name": "security-p2p",
  "version": "1.0.0",
  "description": "P2P Zero Trust Security with E2E Encryption",
  "author": "Event Core Team",
  "license": "MIT",

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
        "path": "/public-key",
        "description": "Get core's public key for sharing"
      },
      {
        "name": "trustPeer",
        "method": "POST",
        "path": "/trust-peer",
        "description": "Initiate handshake with a peer",
        "schema": "./schemas/trust-peer.json"
      },
      {
        "name": "revokePeer",
        "method": "DELETE",
        "path": "/trust-peer",
        "description": "Revoke trust for a peer",
        "schema": "./schemas/revoke-peer.json"
      },
      {
        "name": "listTrustedPeers",
        "method": "GET",
        "path": "/trusted-peers",
        "description": "List all trusted peers"
      }
    ]
  },

  "subscribes": [
    "core/+/security/handshake/request/#",
    "core/+/security/handshake/response/#"
  ],

  "dependencies": [],

  "config": {
    "handshake_timeout_ms": 30000,
    "key_rotation_enabled": false,
    "auto_trust_enabled": false
  }
}
```

---

## 📋 APIs HTTP Expuestas

### Base URL
```
http://localhost:3000/modules/security-p2p
```

### Endpoints

#### 1. GET /status
Obtener estado de seguridad y peers trusted.

**Response:**
```json
{
  "core_id": "core-a",
  "fingerprint": "A1B2C3D4E5F6G7H8",
  "created_at": "2025-10-06T10:00:00Z",
  "trusted_peers": [
    {
      "core_id": "core-b",
      "fingerprint": "9I8J7K6L5M4N3O2P",
      "activated_at": "2025-10-06T10:05:00Z",
      "status": "trusted"
    }
  ]
}
```

#### 2. GET /public-key
Obtener clave pública del core.

**Response:**
```json
{
  "public_key": "-----BEGIN PUBLIC KEY-----\n...",
  "fingerprint": "A1B2C3D4E5F6G7H8"
}
```

#### 3. POST /trust-peer
Iniciar handshake con un peer.

**Request:**
```json
{
  "peer_core_id": "core-b",
  "public_key": "-----BEGIN PUBLIC KEY-----\n..."
}
```

**Response:**
```json
{
  "status": "handshake_initiated",
  "handshake_id": "uuid-1234",
  "message": "Waiting for peer response"
}
```

#### 4. DELETE /trust-peer
Revocar trust a un peer.

**Request:**
```json
{
  "peer_core_id": "core-b"
}
```

**Response:**
```json
{
  "status": "revoked",
  "message": "Trust revoked for core-b"
}
```

#### 5. GET /trusted-peers
Listar todos los peers trusted.

**Response:**
```json
{
  "peers": [
    {
      "core_id": "core-b",
      "fingerprint": "9I8J7K6L5M4N3O2P",
      "activated_at": "2025-10-06T10:05:00Z"
    }
  ]
}
```

---

## 🔧 Cambios en el Core

### Hooks System

El Core debe exponer un sistema de hooks para que los módulos intercepten operaciones:

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

### Core Integration

```javascript
// core/core.js

class Core extends EventEmitter {
  constructor(config) {
    super();
    this.hooks = new HookManager();
    // ...
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
      this.logger.warn('Event blocked by hook', { eventType });
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

## ✅ Beneficios de esta Refactorización

1. **Core Minimalista** - Security no contamina el core
2. **Hot-Reload** - Security puede actualizarse sin reiniciar el core
3. **Opcional** - Proyectos simples pueden no cargar security
4. **CLI Remoto** - CLI puede conectarse a core en otra máquina
5. **Testeable** - Security module se puede probar aisladamente
6. **Composable** - Otros módulos pueden agregar hooks de security

---

## 🎯 Checklist de Implementación

- [ ] Crear `modules/security-p2p/` directory
- [ ] Mover código de `core/security/` a `modules/security-p2p/`
- [ ] Implementar HookManager en el core
- [ ] Refactorizar SecurityModule para usar hooks
- [ ] Implementar APIs HTTP en el módulo
- [ ] Refactorizar CLI a HTTP client puro
- [ ] Actualizar tests
- [ ] Actualizar documentación

---

**Este documento sirve como guía para refactorizar SECURITY_ARCHITECTURE.md**

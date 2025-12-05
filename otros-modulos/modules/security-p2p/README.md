# Módulo Security P2P

**Capa de seguridad peer-to-peer con E2EE, intercambio de claves y autenticación de nodos**

## 🔐 Características

- **Cifrado End-to-End (E2E)**: AES-256-GCM para mensajes
- **Intercambio de Claves**: RSA-2048 para establecer sesiones seguras
- **Autenticación de Peers**: Verificación mediante firma digital
- **Gestión de Sesiones**: Sesiones con expiración automática
- **Lista de Confianza**: Registro de peers autenticados

---

## 🎯 Arquitectura de Seguridad

```
┌──────────────┐                    ┌──────────────┐
│   Node A     │                    │   Node B     │
│              │                    │              │
│  RSA KeyPair │◄──── Handshake ───►│  RSA KeyPair │
│              │                    │              │
│  Session Key │◄─── AES-256-GCM ──►│  Session Key │
│              │                    │              │
└──────────────┘                    └──────────────┘
```

**Flujo de establecimiento de sesión:**
1. Node A obtiene public key de Node B
2. Node A crea session con shared key AES-256
3. Messages se cifran con AES-256-GCM usando shared key
4. Authentication tags garantizan integridad

---

## 📦 Eventos Publicados

### `security.keypair.generated`
Keypair RSA generado para el nodo.

```json
{
  "event_type": "security.keypair.generated",
  "payload": {
    "key_id": "key_1234567890_abc123",
    "algorithm": "RSA-OAEP",
    "key_length": 2048,
    "generated_at": "2024-01-15T10:30:00.000Z"
  }
}
```

### `security.session.established`
Sesión segura establecida con peer.

```json
{
  "event_type": "security.session.established",
  "payload": {
    "session_id": "session_1234567890_abc123",
    "peer_id": "peer_node_123",
    "established_at": "2024-01-15T10:30:00.000Z",
    "expires_at": "2024-01-15T11:30:00.000Z"
  }
}
```

### `security.session.terminated`
Sesión terminada.

```json
{
  "event_type": "security.session.terminated",
  "payload": {
    "session_id": "session_1234567890_abc123",
    "peer_id": "peer_node_123",
    "reason": "expired",
    "terminated_at": "2024-01-15T11:30:00.000Z"
  }
}
```

### `security.message.encrypted`
Mensaje cifrado exitosamente.

```json
{
  "event_type": "security.message.encrypted",
  "payload": {
    "session_id": "session_1234567890_abc123",
    "peer_id": "peer_node_123",
    "data_size": 150,
    "encrypted_at": "2024-01-15T10:35:00.000Z"
  }
}
```

### `security.message.decrypted`
Mensaje descifrado exitosamente.

```json
{
  "event_type": "security.message.decrypted",
  "payload": {
    "session_id": "session_1234567890_abc123",
    "peer_id": "peer_node_123",
    "data_size": 150,
    "decrypted_at": "2024-01-15T10:35:01.000Z"
  }
}
```

### `security.peer.authenticated`
Peer autenticado exitosamente.

```json
{
  "event_type": "security.peer.authenticated",
  "payload": {
    "peer_id": "peer_node_123",
    "public_key_hash": "sha256_hash_of_public_key",
    "authenticated_at": "2024-01-15T10:30:00.000Z"
  }
}
```

### `security.peer.revoked`
Acceso de peer revocado.

```json
{
  "event_type": "security.peer.revoked",
  "payload": {
    "peer_id": "peer_node_123",
    "reason": "manual",
    "revoked_at": "2024-01-15T12:00:00.000Z"
  }
}
```

---

## 📡 Eventos Suscritos

### `security.keypair.get.request`
Obtener public key del nodo.

```json
{
  "request_id": "req_123",
  "correlation_id": "uuid"
}
```

### `security.encrypt.request`
Cifrar datos para peer.

```json
{
  "peer_id": "peer_node_123",
  "data": "Hello, World!",
  "request_id": "req_456",
  "correlation_id": "uuid"
}
```

### `security.decrypt.request`
Descifrar datos de peer.

```json
{
  "peer_id": "peer_node_123",
  "encrypted_data": "encrypted_hex_string:auth_tag",
  "iv": "initialization_vector_hex",
  "request_id": "req_789",
  "correlation_id": "uuid"
}
```

### `security.session.create.request`
Crear sesión segura con peer.

```json
{
  "peer_id": "peer_node_123",
  "peer_public_key": "-----BEGIN PUBLIC KEY-----\n...",
  "metadata": { "protocol_version": "1.0" },
  "request_id": "req_101",
  "correlation_id": "uuid"
}
```

### `security.peer.verify.request`
Verificar identidad de peer.

```json
{
  "peer_id": "peer_node_123",
  "public_key": "-----BEGIN PUBLIC KEY-----\n...",
  "signature": "signature_hex",
  "challenge": "random_challenge_string",
  "request_id": "req_202",
  "correlation_id": "uuid"
}
```

---

## 🔌 APIs HTTP

| Método | Path | Descripción |
|--------|------|-------------|
| GET | `/keypair` | Obtener public key del nodo |
| POST | `/keypair/generate` | Generar nuevo keypair |
| POST | `/sessions` | Crear sesión con peer |
| GET | `/sessions` | Listar sesiones activas |
| DELETE | `/sessions/:peer_id` | Terminar sesión |
| POST | `/encrypt` | Cifrar datos para peer |
| POST | `/decrypt` | Descifrar datos de peer |
| POST | `/peers/verify` | Verificar peer |
| POST | `/peers/:peer_id/revoke` | Revocar acceso peer |
| GET | `/health` | Health check |
| GET | `/metrics` | Métricas |

---

## 🧪 Ejemplos de Uso

### Obtener public key del nodo
```bash
curl http://localhost:3000/modules/security-p2p/keypair
```

**Respuesta:**
```json
{
  "success": true,
  "public_key": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhk...",
  "algorithm": "RSA-OAEP",
  "key_id": "key_1234567890_abc123",
  "created_at": "2024-01-15T10:00:00.000Z"
}
```

### Crear sesión con peer
```bash
curl -X POST http://localhost:3000/modules/security-p2p/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "peer_id": "peer_node_123",
    "peer_public_key": "-----BEGIN PUBLIC KEY-----\nMIIBIjAN...",
    "metadata": {
      "protocol_version": "1.0"
    }
  }'
```

**Respuesta:**
```json
{
  "success": true,
  "session_id": "session_1234567890_abc123",
  "peer_id": "peer_node_123",
  "established_at": "2024-01-15T10:30:00.000Z",
  "expires_at": "2024-01-15T11:30:00.000Z"
}
```

### Cifrar mensaje para peer
```bash
curl -X POST http://localhost:3000/modules/security-p2p/encrypt \
  -H "Content-Type: application/json" \
  -d '{
    "peer_id": "peer_node_123",
    "data": "Hello, secure world!"
  }'
```

**Respuesta:**
```json
{
  "success": true,
  "encrypted_data": "a1b2c3d4e5f6....:auth_tag_hex",
  "iv": "1a2b3c4d5e6f7g8h",
  "session_id": "session_1234567890_abc123"
}
```

### Descifrar mensaje de peer
```bash
curl -X POST http://localhost:3000/modules/security-p2p/decrypt \
  -H "Content-Type: application/json" \
  -d '{
    "peer_id": "peer_node_123",
    "encrypted_data": "a1b2c3d4e5f6....:auth_tag_hex",
    "iv": "1a2b3c4d5e6f7g8h"
  }'
```

**Respuesta:**
```json
{
  "success": true,
  "decrypted_data": "Hello, secure world!",
  "session_id": "session_1234567890_abc123"
}
```

### Verificar peer (autenticación)
```bash
curl -X POST http://localhost:3000/modules/security-p2p/peers/verify \
  -H "Content-Type: application/json" \
  -d '{
    "peer_id": "peer_node_123",
    "public_key": "-----BEGIN PUBLIC KEY-----\nMIIBIjAN...",
    "signature": "signature_hex_from_peer",
    "challenge": "random_challenge_sent_to_peer"
  }'
```

**Respuesta:**
```json
{
  "success": true,
  "verified": true,
  "peer_id": "peer_node_123"
}
```

### Listar sesiones activas
```bash
curl http://localhost:3000/modules/security-p2p/sessions
```

**Respuesta:**
```json
{
  "success": true,
  "sessions": [
    {
      "session_id": "session_1234567890_abc123",
      "peer_id": "peer_node_123",
      "established_at": "2024-01-15T10:30:00.000Z",
      "expires_at": "2024-01-15T11:30:00.000Z"
    }
  ],
  "count": 1
}
```

### Terminar sesión
```bash
curl -X DELETE http://localhost:3000/modules/security-p2p/sessions/peer_node_123
```

### Revocar peer
```bash
curl -X POST http://localhost:3000/modules/security-p2p/peers/peer_node_123/revoke
```

---

## 🔄 Uso desde Otros Módulos (Event-Driven)

### Crear sesión vía eventos
```javascript
// En otro módulo
async createSecureSession(peerId, peerPublicKey, correlationId) {
  const requestId = `session_${Date.now()}`;

  const responsePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

    const unsubscribe = this.eventBus.on('security.session.create.response', (event) => {
      if (event.payload.request_id === requestId) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(event.payload);
      }
    });
  });

  await this.eventBus.publish('security.session.create.request', {
    peer_id: peerId,
    peer_public_key: peerPublicKey,
    request_id: requestId,
    correlation_id: correlationId
  });

  const response = await responsePromise;

  if (!response.success) {
    throw new Error(response.error);
  }

  return {
    sessionId: response.session_id,
    establishedAt: response.established_at,
    expiresAt: response.expires_at
  };
}
```

### Cifrar mensaje vía eventos
```javascript
async encryptMessage(peerId, data, correlationId) {
  const requestId = `encrypt_${Date.now()}`;

  const responsePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

    const unsubscribe = this.eventBus.on('security.encrypt.response', (event) => {
      if (event.payload.request_id === requestId) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(event.payload);
      }
    });
  });

  await this.eventBus.publish('security.encrypt.request', {
    peer_id: peerId,
    data,
    request_id: requestId,
    correlation_id: correlationId
  });

  const response = await responsePromise;

  if (!response.success) {
    throw new Error(response.error);
  }

  return {
    encryptedData: response.encrypted_data,
    iv: response.iv,
    sessionId: response.session_id
  };
}
```

---

## 📊 Métricas

### Counters
- `security.keypair.generated.total` - Keypairs generados
- `security.session.established.total` - Sesiones establecidas
- `security.session.terminated.total` - Sesiones terminadas
- `security.message.encrypted.total` - Mensajes cifrados
- `security.message.decrypted.total` - Mensajes descifrados
- `security.peer.authenticated.total` - Peers autenticados
- `security.peer.revoked.total` - Peers revocados
- `security.encrypt.failed.total` - Fallos de cifrado
- `security.decrypt.failed.total` - Fallos de descifrado
- `security.verify.failed.total` - Fallos de verificación

### Gauges
- `security.sessions.active.count` - Sesiones activas
- `security.peers.trusted.count` - Peers de confianza

### Timings
- `security.encrypt.duration` - Tiempo de cifrado
- `security.decrypt.duration` - Tiempo de descifrado
- `security.keypair.generate.duration` - Tiempo de generación de keypair
- `security.session.create.duration` - Tiempo de creación de sesión

---

## ⚙️ Configuración

```json
{
  "keyAlgorithm": "RSA-OAEP",
  "keyLength": 2048,
  "hashAlgorithm": "SHA-256",
  "sessionExpiryMs": 3600000,
  "maxSessionsPerPeer": 5,
  "enableAutoRotation": false,
  "rotationIntervalMs": 86400000
}
```

| Config | Descripción | Default |
|--------|-------------|---------|
| `keyAlgorithm` | Algoritmo de clave asimétrica | `RSA-OAEP` |
| `keyLength` | Longitud de clave RSA | `2048` |
| `hashAlgorithm` | Algoritmo de hash | `SHA-256` |
| `sessionExpiryMs` | Expiración de sesión (ms) | `3600000` (1h) |
| `maxSessionsPerPeer` | Max sesiones por peer | `5` |
| `enableAutoRotation` | Auto-rotación de claves | `false` |
| `rotationIntervalMs` | Intervalo de rotación | `86400000` (24h) |

---

## 🔒 Detalles Técnicos

### Algoritmos Utilizados

- **Keypair**: RSA-2048 (configurable)
- **Mensaje Encryption**: AES-256-GCM
- **Hash**: SHA-256
- **Signatures**: RSA-SHA256

### Estructura de Mensaje Cifrado

```
encrypted_data = encrypted_hex:auth_tag_hex
iv = initialization_vector_hex
```

### Expiración de Sesiones

Las sesiones se limpian automáticamente cada 60 segundos. Cuando una sesión expira:
1. Se elimina de `sessions` Map
2. Se publica evento `security.session.terminated`
3. Se actualizan métricas

---

## 🎯 Casos de Uso

1. **Chat P2P Cifrado** - Mensajería end-to-end entre nodos
2. **File Transfer Seguro** - Transferencia de archivos cifrados
3. **Distributed Authentication** - Verificación de identidad entre peers
4. **Blockchain/DLT** - Firma y verificación de transacciones
5. **IoT Secure Mesh** - Red mesh con comunicación cifrada

---

## 🛡️ Garantías de Seguridad

- ✅ **Confidencialidad**: AES-256-GCM cifrado simétrico
- ✅ **Integridad**: Authentication tags GCM
- ✅ **Autenticación**: RSA signatures para verificar peers
- ✅ **Forward Secrecy**: Shared keys únicas por sesión
- ✅ **Session Expiry**: Prevención de sesiones infinitas

---

## ⚠️ Consideraciones

1. **Private Keys**: El módulo mantiene private keys en memoria. En producción, considerar HSM o key vaults.
2. **Session Storage**: Sessions en memoria se pierden al reiniciar. Considerar persistencia si necesario.
3. **Key Rotation**: Actualmente manual. `enableAutoRotation` disponible para futuras versiones.
4. **Peer Discovery**: Este módulo NO maneja discovery. Integrar con módulo de networking/DHT.

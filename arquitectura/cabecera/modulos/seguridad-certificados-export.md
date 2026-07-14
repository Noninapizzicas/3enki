---
id: modulos/seguridad-certificados-export
dominio: sistema
resumen: security-p2p (X25519/ECDH, handshake, SecureEnvelope), certificate-authority (CA, mTLS, P12), conversation-export.
fuentes:
  - modules/security-p2p/**
  - modules/certificate-authority/**
  - modules/conversation-export/**
verificado: 2026-07-14
---

# MÓDULOS — SEGURIDAD P2P, CERTIFICADOS, EXPORT

> **Novedad (2026-07-14) — certificate-authority pasa de emitir certs a regir identidad del bus.**
> Superficie nueva: `issueFromPublicKey` + handler `enroll` (el cliente genera su clave, la CA solo
> firma su pública — la privada nunca sale del cliente); SAN de **4 partes** `urn:eventcore:<type>:<scope>:<identifier>`
> (scope = project_id | 'system', parser retrocompatible); `signInvitation` + handler `sign-invitation`
> (la CA raíz firma invitaciones — R1 de la cadena de delegación). security-p2p: el evento
> `security.peer.revoked` ahora incluye `core_id` (para el peer-trust del guard). El detalle vive en
> `sistema-nervioso/bus-guardado.md` (el bus como puerta guardada) e `invitaciones.md` (la delegación).

## SECURITY-P2P (v2.0.0)

```
INTERFAZ SecurityP2PContract {
  encrypt(envelope: Object, sharedSecret: Buffer): Promise<Object>
  decrypt(encryptedEnvelope: Object, sharedSecret: Buffer): Promise<Object>
  initiateHandshake(targetCoreId: String): Promise<String>
  trustPeer(publicKey: String, metadata?: Object): Promise<Boolean>
  revokePeer(publicKey: String): Promise<Boolean>
  listTrustedPeers(): Promise<Array<Peer>>
  getStatus(): Promise<{encryption_enabled, fingerprint, peers_count, shared_secrets}>
}

CLASE SecurityP2PModule HEREDA BaseModule IMPLEMENTA SecurityP2PContract {
  ATRIBUTOS {
    name: String = 'security-p2p'
    version: String = '2.0.0'
    keyManager: KeyManager
    cryptoHandshake: CryptoHandshake
    encryptionEnabled: Boolean
    _sharedSecrets: Map<publicKey, Buffer>
    maxSharedSecrets: Integer (default 100)
    stats: {events_encrypted, events_decrypted, encryption_errors, decryption_errors}
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA keyManager
      GENERA key pair X25519
      CREA CryptoHandshake instance
      REGISTRA hooks beforeEventPublish, afterEventReceive
      SUSCRIBE core/+/security/handshake/request/# y response/#
      LOG module.loaded

    async onUnload(): Promise<Void>
      DESREGISTRA hooks
      DESUSCRIBE MQTT topics
      LIMPIA _sharedSecrets
      LIMPIA cryptoHandshake

    async hookBeforeEventPublish(context: Object): Promise<Object>
      SI !encryptionEnabled OR sin trusted peers: RETORNA context
      OBTIENE shared secret DEL trusted peer
      ENCRIPTA context.envelope via SecureEnvelope
      stats.events_encrypted++
      RETORNA {context, envelope: encrypted}

    async hookAfterEventReceive(context: Object): Promise<Object>
      SI !SecureEnvelope.isEncrypted(context.envelope): RETORNA context
      ITERA _sharedSecrets: INTENTA decrypt
      SI exito: stats.events_decrypted++, RETORNA decrypted
      SI fallo en todos: stats.decryption_errors++, LOG warn
      RETORNA context

    async handleTrustPeer(input: {body: {public_key, name?, project_id?, correlation_id}}): Promise<Response>
      VALIDA public_key
      INVOCA keyManager.trustPeer(public_key, {name})
      CALCULA shared secret via ECDH
      CREA _trackSharedSecret(public_key, sharedSecret)
      EMITE security.peer.trusted
      RETORNA {status: 200, trusted: true, fingerprint, peer_count}

    async handleRevokePeer(input: {body: {public_key, project_id?, correlation_id}}): Promise<Response>
      VALIDA public_key
      ELIMINA DE keyManager
      ELIMINA DE _sharedSecrets
      SI exito: EMITE security.peer.revoked
      RETORNA {status: 200, revoked: true}

    async handleListTrustedPeers(): Promise<Response>
      OBTIENE peers = keyManager.listTrustedPeers()
      RETORNA {status: 200, data: {peers[]}}

    async handleStatus(): Promise<Response>
      RETORNA {status: 200, data: {encryption_enabled, fingerprint, trusted_peers_count, shared_secrets_cached, stats}}

    async handleGetPublicKey(): Promise<Response>
      RETORNA {status: 200, data: {public_key, fingerprint}}

    async onPublicKeyRequest(event: Event): Promise<Void>
      EXTRAE request_id, correlation_id
      EMITE security.public-key.response CON public_key, fingerprint

    _trackSharedSecret(publicKey: String, sharedSecret: Buffer): Void
      SI ya existe: ELIMINA y reanade (LRU)
      AGREGA a _sharedSecrets
      MIENTRAS size > maxSharedSecrets: ELIMINA oldest (eviction LRU)

    EVENTOS_PUBLISHES {
      'security.peer.trusted': {public_key, name, fingerprint}
      'security.peer.revoked': {public_key}
      'security.public-key.response': {request_id, correlation_id, public_key, fingerprint, has_keys}
      'security.handshake.timeout': {target_core_id}
      'security.handshake.failed': {peer_core_id, reason}
    }

    EVENTOS_SUBSCRIBES {
      'security.public-key.request': onPublicKeyRequest
      'core/+/security/handshake/request/#': cryptoHandshake.handleHandshakeRequest
      'core/+/security/handshake/response/#': cryptoHandshake.handleHandshakeResponse
    }
  }
}

CLASE KeyManager {
  ATRIBUTOS {
    publicKey: String (X25519, base64)
    privateKey: Buffer (secreto, nunca serializado)
    trustedPeers: Map<publicKey, {name?, trusted_at}>
  }

  METODOS {
    async generateKeyPair(): Promise<Void>
      GENERA X25519 key pair
      GUARDA public y private

    trustPeer(publicKey: String, metadata?: Object): Void
      AGREGA a trustedPeers

    untrustPeer(publicKey: String): Boolean
      ELIMINA DE trustedPeers SI existe

    listTrustedPeers(): Array<{public_key, name, trusted_at}>
      RETORNA peers array

    computeSharedSecret(peerPublicKey: String): Buffer
      ECDH: ECDH(privateKey, peerPublicKey) via crypto.diffieHellman o similar
      RETORNA shared secret (32 bytes)

    getFingerprint(): String (SHA-256 hex del public key)
    getPublicKey(): String (base64)
}

CLASE CryptoHandshake {
  ATRIBUTOS {
    core: EventCore
    keyManager: KeyManager
    pendingHandshakes: Map<handshakeId, {target_core_id, challenge, started_at, status}>
    handshakeTimeout: Integer (ms, default 30000)
  }

  METODOS {
    async initiateHandshake(targetCoreId: String): Promise<String>
      GENERA handshakeId
      GENERA challenge (32 bytes random, base64)
      GUARDA pending handshake
      PUBLICA core/{targetCoreId}/security/handshake/request/{handshakeId}
        CON {source_core_id, handshake_id, challenge, public_key, version}
      SETEA timeout: SI no response EN 30s, EMITE security.handshake.timeout
      RETORNA handshakeId

    async handleHandshakeRequest(topic: String, message: Buffer): Promise<Void>
      PARSEA JSON message
      VALIDA request.source_core_id, handshake_id, challenge, public_key
      VALIDA shouldAcceptHandshake(source_core_id) via whitelist/blacklist
      CALCULA shared secret: ECDH(keyManager.privateKey, request.public_key)
      MARCA peer como trusted
      GENERA responseChallenge (32 bytes random, base64)
      CALCULA HMAC mutuo: HMAC-SHA256(challenge_A + challenge_B + sorted_cores)
      PUBLICA core/{source_core_id}/security/handshake/response/{handshakeId}
        CON {source_core_id, target_core_id, original_challenge, response_challenge, hmac, public_key, version}
      EMITE security.handshake.accepted

    async handleHandshakeResponse(topic: String, message: Buffer): Promise<Void>
      PARSEA JSON message
      OBTIENE pending = pendingHandshakes[handshakeId]
      SI !pending O target_core_id != response.source_core_id: RETORNA
      CALCULA shared secret: ECDH(keyManager.privateKey, response.public_key)
      VERIFICA HMAC mutuo: expectedHMAC == response.hmac
      SI HMAC falla: EMITE security.handshake.failed, RETORNA
      MARCA peer como trusted
      ELIMINA DE pendingHandshakes
      EMITE security.peer.trusted CON duration_ms

    calculateMutualHMAC(challengeA: String, challengeB: String, sharedSecret: Buffer, coreIdA: String, coreIdB: String): String
      sortedIds = [coreIdA, coreIdB].sort()
      RETORNA HMAC-SHA256(challengeA + challengeB + sortedIds[0] + sortedIds[1] + 'event-core-v1')

    async shouldAcceptHandshake(sourceCoreId: String): Promise<Boolean>
      SI whitelist defined Y sourceCoreId NOT IN whitelist: RETORNA false
      SI blacklist defined Y sourceCoreId IN blacklist: RETORNA false
      RETORNA true
}

CLASE SecureEnvelope ESTATICO {
  METODOS {
    static encrypt(envelope: Object, sharedSecret: Buffer): Object
      GENERA nonce (12 bytes random)
      CREA cipher AES-256-GCM CON sharedSecret
      SERIALIZA envelope a JSON
      ENCRIPTA JSON CON nonce
      RETORNA {_encrypted: true, _version: 1, nonce (hex), ciphertext (hex), tag (hex)}

    static decrypt(encryptedEnvelope: Object, sharedSecret: Buffer): Object
      VALIDA _encrypted, _version
      EXTRAE nonce (hex → Buffer)
      EXTRAE ciphertext (hex → Buffer)
      EXTRAE tag (hex → Buffer)
      CREA decipher AES-256-GCM CON sharedSecret + nonce
      DESENCRIPTA ciphertext
      VERIFICA tag
      PARSEA JSON
      RETORNA decrypted envelope

    static isEncrypted(envelope: Object): Boolean
      RETORNA envelope?._encrypted === true
}
```

## CERTIFICATE-AUTHORITY (v2.0.0)

```
INTERFAZ CertificateAuthorityContract {
  issueCertificate(data: {commonName, type, identifier, organization?, email?, validityDays?, passphrase?}): Promise<{serialNumber, certificate, privateKey, p12, fingerprint, metadata}>
  revokeCertificate(serialNumber: String, reason?: String): Promise<{revoked, serialNumber, reason}>
  renewCertificate(serialNumber: String, overrides?: Object): Promise<{serialNumber, certificate, metadata}>
  verifyCertificate(certificatePem: String): Promise<{valid, serialNumber?, type?, identifier?, commonName?, error?}>
  listCertificates(filters?: Object): Promise<Array<CertificateMetadata>>
  getCACertificate(): Promise<String>
  getCRL(): Promise<Array<{serialNumber, revokedAt, reason}>>
}

CLASE CertificateAuthorityModule HEREDA BaseModule IMPLEMENTA CertificateAuthorityContract {
  ATRIBUTOS {
    name: String = 'certificate-authority'
    version: String = '2.0.0'
    caManager: CAManager
    mtlsMiddleware: MTLSMiddleware
    _mtlsHookHandler: Function
    stats: {certificates_issued, certificates_revoked, certificates_renewed, verification_requests}
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA CAManager CON storagePath, ca_cn, ca_org, ca_validity_days, cert_validity_days, key_size
      INVOCA caManager.initialize()
      INICIALIZA MTLSMiddleware CON caManager, mode, certHeader, excludePaths, allowUnauthenticated
      SI config.mtls_enabled: REGISTRA hook beforeRequest
      LOG module.loaded

    async onUnload(): Promise<Void>
      DESREGISTRA hook beforeRequest SI existe
      LIMPIA caManager, mtlsMiddleware

    async handleIssueCertificate(input: {body: {commonName, type, identifier, organization?, email?, validityDays?, passphrase?, project_id?, correlation_id}}): Promise<Response>
      VALIDA commonName, type, identifier
      VALIDA type EN ['client', 'device']
      result = await caManager.issueCertificate({...})
      stats.certificates_issued++
      EMITE certificate.issued
      RETORNA {status: 201, data: {serialNumber, fingerprint, metadata, certificate, hasP12}}

    async handleRevokeCertificate(input: {body: {serialNumber, reason?, project_id?, correlation_id}}): Promise<Response>
      VALIDA serialNumber
      result = caManager.revokeCertificate(serialNumber, reason)
      SI !result.revoked: RETORNA {status: 409, error: {code: CONFLICT_STATE, message: ...}}
      stats.certificates_revoked++
      EMITE certificate.revoked
      RETORNA {status: 200, data: result}

    async handleRenewCertificate(input: {body: {serialNumber, passphrase?, validityDays?, project_id?, correlation_id}}): Promise<Response>
      VALIDA serialNumber
      result = await caManager.renewCertificate(serialNumber, {passphrase, validityDays})
      stats.certificates_renewed++
      EMITE certificate.renewed
      RETORNA {status: 200, data: {serialNumber, previousSerialNumber, fingerprint, metadata}}

    async handleListCertificates(input: {query: {type?, status?, identifier?}}): Promise<Response>
      certs = caManager.listCertificates({type, status, identifier})
      RETORNA {status: 200, data: {certificates: certs, total: certs.length}}

    async handleVerifyCertificate(input: {body: {certificate}}): Promise<Response>
      VALIDA certificate (PEM)
      result = caManager.verifyCertificate(certificate)
      stats.verification_requests++
      RETORNA {status: 200, data: result}

    async handleGetCACert(): Promise<Response>
      cert = caManager.getCACertificate()
      RETORNA {status: 200, data: {certificate: cert, instructions: {...}}}

    async handleGetCRL(): Promise<Response>
      crl = caManager.getCRL()
      RETORNA {status: 200, data: {revoked: crl, updated: now}}

    async handleDownloadP12(input: {query: {serialNumber}}): Promise<Response>
      p12 = caManager.getP12Bundle(serialNumber)
      SI !p12: RETORNA {status: 404, error: {...}}
      RETORNA {status: 200, data: {serialNumber, bundle: base64, contentType: application/x-pkcs12, filename}}

    async handleGetNginxConfig(): Promise<Response>
      config = mtlsMiddleware.getNginxConfig()
      RETORNA {status: 200, data: {config}}

    async handleStatus(): Promise<Response>
      RETORNA {status: 200, data: {module, version, ca: caManager.getStats(), mtls: mtlsMiddleware.getStats(), stats}}

    async handleHealthCheck(): Promise<Response>
      caStats = caManager.getStats()
      RETORNA {status: 200, data: {module, status: healthy|degraded, ca_initialized, active_certificates, expiring_soon, mtls_stats}}

    EVENTOS_PUBLISHES {
      'certificate.issued': {serialNumber, type, identifier, commonName, fingerprint}
      'certificate.revoked': {serialNumber, reason}
      'certificate.renewed': {oldSerialNumber, newSerialNumber}
    }

    EVENTOS_SUBSCRIBES {
      (ninguno — solo handlers síncronos)
    }
  }
}

CLASE CAManager {
  ATRIBUTOS {
    storagePath: String (default: data/ca)
    caKeyPath: String
    caCertPath: String
    crlPath: String
    certsPath: String
    caKey: forge.PrivateKey (secreto)
    caCert: forge.Certificate (X.509 auto-firmado)
    crl: Array<{serialNumber, revokedAt, reason}>
    config: {ca_cn, ca_org, ca_validity_days, cert_validity_days, key_size}
  }

  METODOS {
    async initialize(): Promise<{created, loaded, serialNumber?}>
      CREA directorios storagePath, certsPath
      CARGA CRL DE crlPath SI existe
      SI ca-key.pem + ca-cert.pem existen:
        CARGA private key + certificate from PEM
        RETORNA {created: false, loaded: true}
      SINO:
        INVOCA _generateCA()

    _generateCA(): {created, loaded, serialNumber}
      GENERA RSA 2048 key pair
      CREA certificate X.509:
        serialNumber = random hex
        validity = [now, now + ca_validity_days]
        subject/issuer = {CN: ca_cn, O: ca_org}
        extensions: basicConstraints (CA=true, critical), keyUsage, subjectKeyIdentifier
        firma auto: cert.sign(caKey, SHA-256)
      PERSISTE ca-key.pem (mode 0o600), ca-cert.pem (mode 0o644)
      RETORNA {created: true, loaded: true, serialNumber}

    async issueCertificate(options: {commonName, type, identifier, organization?, email?, validityDays?, passphrase?}): Promise<{serialNumber, certificate, privateKey, p12, fingerprint, metadata}>
      VALIDA commonName, identifier
      VALIDA type EN ['client', 'device']
      GENERA RSA 2048 key pair PARA cliente
      CREA certificate X.509:
        serialNumber = random hex
        subject = {CN: commonName, OU: tipo, O: organization?, emailAddress: email?}
        issuer = caSubject (nuestra CA)
        validity = [now, now + validityDays]
        extensions: basicConstraints (CA=false), keyUsage (digitalSignature, keyEncipherment), extKeyUsage (clientAuth), subjectAltName (urn:eventcore:type:identifier)
        firma: cert.sign(caKey, SHA-256)
      CALCULA fingerprint = SHA-256(DER).toHex().split(':')
      metadata = {serialNumber, type, identifier, commonName, organization, email, fingerprint, issuedAt, expiresAt, status: 'active'}
      p12 = _createP12Bundle(cert, privateKey, passphrase)
      PERSISTE cert.pem, key.pem (0o600), metadata.json, bundle.p12
      RETORNA {serialNumber, certificate (PEM), privateKey (PEM), p12 (Buffer), fingerprint, metadata}

    revokeCertificate(serialNumber: String, reason?: String): {revoked, error?, serialNumber, reason, revokedAt?}
      CARGA metadata.json DEL certDir
      SI !exists: RETORNA {revoked: false, error: 'Certificate not found'}
      SI status == 'revoked': RETORNA {revoked: false, error: 'Already revoked'}
      ACTUALIZA metadata: status = 'revoked', revokedAt = now, revokeReason = reason
      AGREGA a CRL: {serialNumber, revokedAt, reason}
      PERSISTE metadata + CRL
      ELIMINA key.pem y bundle.p12 por seguridad
      RETORNA {revoked: true, serialNumber, reason, revokedAt}

    verifyCertificate(certificatePem: String): {valid, serialNumber?, type?, identifier?, commonName?, expiresAt?, error?}
      PARSEA certificatePem via forge
      VALIDA firma contra caCert
      VALIDA NOT EN CRL
      VALIDA NOT expired
      SI metadata.json existe:
        SI status == 'revoked': RETORNA {valid: false, error: 'Revoked', serialNumber}
        RETORNA {valid: true, serialNumber, type, identifier, commonName, expiresAt}
      SINO:
        EXTRAE info from certificate
        RETORNA {valid: true, serialNumber, type, identifier, commonName, expiresAt}

    listCertificates(filters?: {type?, status?, identifier?}): Array<CertificateMetadata>
      LEE certsPath
      PARA cada directorio (serialNumber):
        CARGA metadata.json
        RECALCULA status SI active Y now > expiresAt: MARCA expired
        APLICA filters
        AGREGA a lista
      ORDENA POR issuedAt DESC
      RETORNA lista

    renewCertificate(serialNumber: String, overrides?: Object): Promise<{serialNumber, certificate, metadata, previousSerialNumber}>
      CARGA oldMetadata
      newCert = await issueCertificate({commonName: old, type: old, identifier: old, ...overrides})
      revokeCertificate(serialNumber, 'superseded')
      RETORNA {serialNumber: new, previousSerialNumber: old, ...newCert}

    getP12Bundle(serialNumber: String): Buffer|Null
      RETORNA fs.readFileSync(certsPath/{serialNumber}/bundle.p12) SI existe

    getCACertificate(): String (PEM)
    getCRL(): Array<CRL entries>
    getStats(): {total, active, revoked, expired, by_type, expiring_soon, crl_entries, ca_initialized}

    _generateSerialNumber(): String (hex, 32 chars)
    _verifySignature(cert): Boolean (cert.verify(caCert))
    _parseCertificateInfo(cert): {type, identifier, commonName}
    _createP12Bundle(cert, privateKey, passphrase): Buffer (PKCS#12 real, importable en navegadores/Android/iOS)
    _saveCRL(): Void
  }
}

CLASE MTLSMiddleware {
  ATRIBUTOS {
    caManager: CAManager
    mode: String ('native' | 'proxy', default 'proxy')
    certHeader: String (default 'x-client-cert')
    excludePaths: Array<String>
    allowUnauthenticated: Boolean
    stats: {authenticated, rejected, bypassed, errors}
  }

  METODOS {
    async authenticate(context: {path, headers}): Promise<Object|Null>
      SI _isExcludedPath(path): RETORNA context, stats.bypassed++
      
      clientCert = null
      SI mode == 'proxy':
        certHeader → decodeURIComponent → clientCert
      SINO SI mode == 'native':
        context._tlsCertificate → clientCert
      
      SI !clientCert:
        SI allowUnauthenticated:
          RETORNA {context, auth: {authenticated: false, method: 'none'}}
        SINO:
          stats.rejected++
          RETORNA null (bloquea request)
      
      verification = caManager.verifyCertificate(clientCert)
      SI !verification.valid:
        stats.rejected++
        RETORNA null
      
      stats.authenticated++
      RETORNA {context, auth: {authenticated: true, method: 'mtls', type, identifier, commonName, serialNumber, expiresAt}}

    getTLSOptions(): {requestCert, rejectUnauthorized, ca}
      RETORNA opciones para tls.createServer / https.createServer CON nuestra CA

    getNginxConfig(): String
      RETORNA snippet de config nginx CON ssl_client_certificate, ssl_verify_client, proxy_set_header X-Client-Cert

    getStats(): {authenticated, rejected, bypassed, errors}
    _isExcludedPath(path): Boolean
}
```

## CONVERSATION-EXPORT (v2.0.0)

```
INTERFAZ ConversationExportContract {
  listSessions(projectId: String, limit?: Integer): Promise<Array<Session>>
  getSession(projectId: String, sessionId: String, verbose?: Boolean): Promise<SessionExport>
  getLatestSession(projectId: String, verbose?: Boolean): Promise<SessionExport>
  getActivityBuffer(): Array<ActivityEntry>
  healthCheck(): Promise<{module, version, token_configured, activity_buffer}>
}

CLASE ConversationExportModule HEREDA BaseModule IMPLEMENTA ConversationExportContract {
  ATRIBUTOS {
    name: String = 'conversation-export'
    version: String = '2.0.0'
    config: Object
    token: String (auth token)
    activityBuffer: Array<ActivityEntry> (ring buffer, max 1000)
    pendingDbRequests: Map<requestId, {resolve, reject, timeout}>
    pendingAgentRequests: Map<requestId, {agent_name, task, conversation_id, project_id, user_id, correlation_id, started_at}>
    _agentExecTableEnsured: Set<projectId>
    _subscriptions: {activity, agentFailed, agentCompleted, dbResponse, agentReq, agentRes, agentFail, invokeAgent, invokeAgentRes}
  }

  METODOS {
    async onLoad(context: EventCore): Promise<Void>
      INICIALIZA config, token FROM context
      SI NO token: LOG warn 'Auth token not configured'
      SUSCRIBE activity.logged → _bufferActivity
      SUSCRIBE agent.failed → enriquece + buffer
      SUSCRIBE agent.completed → enriquece + buffer
      SUSCRIBE agent.execute.request → onAgentExecuteRequest
      SUSCRIBE agent.execute.response → onAgentExecuteResponse
      SUSCRIBE agent.execute.failed → onAgentExecuteFailed
      SUSCRIBE invoke_agent → onInvokeAgentRequest (LEGACY)
      SUSCRIBE invoke_agent.response → onInvokeAgentResponse (LEGACY)
      SUSCRIBE db.query.response → _onDbQueryResponse
      LOG module.loaded

    async onUnload(): Promise<Void>
      DESUSCRIBE todos los handlers
      LIMPIA pendingDbRequests (reject all)
      LIMPIA pendingAgentRequests
      LIMPIA activityBuffer

    _checkAuth(req: {query?, headers?}): Error|Null
      SI NO token: RETORNA Error('Auth token not configured', 503)
      provided = req.query?.token || req.headers?.['x-token'] || req.headers?.authorization?.replace(/Bearer\s+/, '')
      SI NO provided: RETORNA Error('Missing token', 401)
      SI provided != token: RETORNA Error('Invalid token', 403)
      RETORNA null

    async handleListSessions(req: {params: {project_id}, query: {limit?}}): Promise<Response>
      authErr = _checkAuth(req)
      SI authErr: RETORNA error response
      projectId = req.params.project_id
      SI !projectId: RETORNA 400 INVALID_INPUT
      limit = parseInt(req.query?.limit) || 20
      sessions = await _loadSessionsFromDB(projectId, limit)
      RETORNA {status: 200, data: {project_id, count: sessions.length, sessions}}

    async handleGetSession(req: {params: {session_id}, query: {project_id, verbose?}}): Promise<Response>
      authErr = _checkAuth(req)
      SI authErr: RETORNA error response
      SI !sessionId || !projectId: RETORNA 400
      verbose = req.query.verbose === 'true'
      data = await _buildSessionExport(projectId, sessionId, verbose)
      RETORNA {status: 200, data}

    async handleGetLatest(req: {params: {project_id}, query: {verbose?}}): Promise<Response>
      authErr = _checkAuth(req)
      SI authErr: RETORNA error response
      sessions = await _loadSessionsFromDB(projectId, 1)
      SI !sessions: RETORNA 404 RESOURCE_NOT_FOUND
      data = await _buildSessionExport(projectId, sessions[0].id, verbose)
      RETORNA {status: 200, data}

    async handleHealth(): Promise<Response>
      RETORNA {status: 200, data: {module, version, token_configured, activity_buffer: length}}

    _bufferActivity(entry: ActivityEntry): Void
      activityBuffer.push(entry)
      MIENTRAS size > 1000: ELIMINA first (FIFO)

    _filterActivityBuffer(timeWindow?: {start, end}): Array<ActivityEntry>
      SI !timeWindow: RETORNA copy de todo
      FILTRA por timestamp DENTRO del rango

    async _queryDB(projectId, query, params, correlationId): Promise<Array>
      requestId = UUID
      CREA promise CON timeout (default 8000ms)
      PUBLICA db.query.request {project_id, query, params, read_only: true, request_id, correlation_id}
      ESPERA response via pendingDbRequests
      RETORNA rows

    async _writeDB(projectId, query, params, correlationId): Promise<Array>
      (igual a _queryDB pero read_only: false)

    async _ensureAgentExecutionsTable(projectId, correlationId): Promise<Void>
      SI projectId YA EN _agentExecTableEnsured: RETORNA
      CREATE TABLE IF NOT EXISTS agent_executions (...)
      CREATE INDEX IF NOT EXISTS idx_agent_exec_conv (...)
      AGREGA projectId a _agentExecTableEnsured

    async onAgentExecuteRequest(event): Void
      pendingAgentRequests.set(requestId, {agent_name, task, conversation_id, project_id, user_id, started_at: now})

    async onAgentExecuteResponse(event): Void
      OBTIENE pending buffered
      ASEGURA tabla via _ensureAgentExecutionsTable
      INSERT OR REPLACE INTO agent_executions (...valores canonicos...)
      stats.agent_executions.persisted++

    async onAgentExecuteFailed(event): Void
      (similar a response pero status='failed')

    async onInvokeAgentRequest(event): Void (LEGACY)
      (similar pero sin duplicar SI entrada canonica existe)

    async onInvokeAgentResponse(event): Void (LEGACY)
      (normaliza shape legacy al schema de agent_executions)

    async _loadSessionsFromDB(projectId, limit): Promise<Array>
      rows = await _queryDB(projectId, SELECT conversations ORDER BY updated_at DESC LIMIT ?, [limit])
      RETORNA rows || []

    async _loadMessagesFromDB(projectId, sessionId): Promise<Array>
      rows = await _queryDB(projectId, SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at, [sessionId])
      RETORNA rows || []

    async _loadAgentExecutions(projectId, sessionId): Promise<Array>
      rows = await _queryDB(projectId, SELECT FROM agent_executions WHERE conversation_id=? ORDER BY started_at, [sessionId])
      PARSEA JSON fields (result, tokens, cost, error)
      RETORNA mapped array

    async _loadConversationMetadata(projectId, sessionId): Promise<Object|Null>
      rows = await _queryDB(projectId, SELECT metadata FROM conversations WHERE id=? LIMIT 1, [sessionId])
      PARSEA SI string
      RETORNA metadata || null

    async _loadLogsForSession(sessionId, timeWindow): Promise<Array>
      LEE archivos EN ./data/logs/sessions
      FILTRA por sessionId match
      PARSEA líneas JSON
      FILTRA por timeWindow SI provided
      RETORNA logs

    async _buildSessionExport(projectId, sessionId, verbose, correlationId): Promise<SessionExport>
      [messages, agentExecutions, conversationMeta] = await Promise.all([
        _loadMessagesFromDB(...),
        _loadAgentExecutions(...),
        _loadConversationMetadata(...)
      ])
      timeWindow = [first_msg.timestamp - 60s, last_msg.timestamp + 5min]
      systemLogs = await _loadLogsForSession(sessionId, timeWindow)
      activity = _filterActivityBuffer(timeWindow)
      timeline = _buildTimeline(messages, systemLogs, activity, agentExecutions, verbose)
      summary = _buildSummary(messages, timeline, agentExecutions, conversationMeta)
      RETORNA {_format, _generated_at, project_id, session_id, conversation_state, summary, timeline, agent_executions?, messages_raw?}

    _buildTimeline(messages, systemLogs, activity, agentExecutions, verbose): Array<TimelineItem>
      items = []
      PARA cada message: agrega {_type: 'message', ts, role, content, tokens, cost, attachments?, metadata?}
      PARA cada activity: (SI !verbose Y type==internal: skip), agrega {_type: classified_type, ts, module, action, outcome, ctx?}
      PARA cada agentExec: agrega {_type: 'agent_execution', ts, agent_name, task, status, duration_ms, result_summary?, error?}
      PARA cada systemLog: (SI !verbose Y level!=error|warn: skip), agrega {_type: 'system_log', ts, level, module, event, data?}
      ORDENA items POR ts ASC
      RETORNA items

    _buildSummary(messages, timeline, agentExecutions, conversationMeta): Summary
      counts = {messages, user_messages, assistant_messages, tool_calls, agent_executions, agent_completed, agent_failed, errors}
      tokens = suma de todos los tokens
      cost = suma de todos los costs
      RETORNA {counts, tokens, cost, conversation_state, active_agent, started_at, ended_at, duration_ms}

    _classifyActivity(entry): String ('message'|'tool_call'|'tool_response'|'agent_event'|'error'|'module_action'|'internal_log')
      (clasifica por entry.type + entry.action + entry.outcome)

    EVENTOS_PUBLISHES {
      (ninguno directo — solo publica en respuesta a requests)
    }

    EVENTOS_SUBSCRIBES {
      'activity.logged': _bufferActivity
      'agent.failed': onAgentFailed
      'agent.completed': onAgentCompleted
      'agent.execute.request': onAgentExecuteRequest
      'agent.execute.response': onAgentExecuteResponse
      'agent.execute.failed': onAgentExecuteFailed
      'invoke_agent': onInvokeAgentRequest (LEGACY)
      'invoke_agent.response': onInvokeAgentResponse (LEGACY)
      'db.query.response': _onDbQueryResponse
    }
  }
}

CLASE SessionExport {
  ATRIBUTOS {
    _format: String = 'conversation-export-v2'
    _generated_at: String (ISO)
    _hint_llm: String
    project_id: String
    session_id: String
    conversation_state: String
    summary: Summary
    timeline: Array<TimelineItem>
    agent_executions?: Array<AgentExecution>
    messages_raw?: Array<Message>
  }
}

CLASE TimelineItem {
  ATRIBUTOS {
    _type: String (message|tool_call|tool_response|agent_execution|system_log|agent_event|error|module_action|internal_log)
    ts: String (ISO) | Integer (ms)
    [específicos por tipo]
  }
}

CLASE AgentExecution {
  ATRIBUTOS {
    id: String (UUID)
    request_id: String
    correlation_id: String
    conversation_id: String
    project_id: String
    user_id: String
    agent_name: String
    task: String
    status: String (success|failed)
    provider: String|Null
    model: String|Null
    tokens: {input?, output?}|Null
    cost: Number|Null
    duration_ms: Integer|Null
    iterations: Integer|Null
    finish_reason: String|Null
    result: Any|Null
    error: Any|Null
    started_at: Integer (ms)
    completed_at: Integer|Null
  }
}
```

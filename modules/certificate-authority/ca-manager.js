/**
 * CA Manager - Autoridad Certificadora propia
 *
 * Gestiona una CA raíz auto-firmada para emitir certificados cliente X.509.
 * Soporta dos casos de uso:
 *   1. Certificados para clientes del portal de facturación
 *   2. Certificados para dispositivos de trabajo
 *
 * Genera certificados X.509 reales (ASN.1/DER) y bundles PKCS#12 reales
 * usando node-forge. Compatible con navegadores, nginx, Android, iOS, etc.
 *
 * Algoritmo: RSA 2048 + SHA-256 (compatible con todos los navegadores)
 */

const crypto = require('crypto');
const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

class CAManager {
  // ── SAN de 4 partes (scope): urn:eventcore:<type>:<scope>:<identifier> ──
  // scope = <project_id> | 'system'. RETROCOMPATIBLE: un SAN viejo de 3 (type:identifier) → scope='system'.
  static _buildSan(type, scope, identifier) {
    return `urn:eventcore:${type}:${scope || 'system'}:${identifier}`;
  }
  static _parseSan(value) {
    const parts = String(value).replace('urn:eventcore:', '').split(':');
    if (parts.length >= 3) {                 // nuevo: type:scope:identifier
      return { type: parts[0], scope: parts[1], identifier: parts.slice(2).join(':') };
    }
    if (parts.length === 2) {                // viejo: type:identifier → scope system
      return { type: parts[0], scope: 'system', identifier: parts[1] };
    }
    return { type: 'client', scope: 'system', identifier: 'unknown' };
  }
  constructor(options = {}) {
    this.storagePath = options.storagePath || path.join(process.cwd(), 'data', 'ca');
    this.caKeyPath = path.join(this.storagePath, 'ca-key.pem');
    this.caCertPath = path.join(this.storagePath, 'ca-cert.pem');
    this.crlPath = path.join(this.storagePath, 'crl.json');
    this.certsPath = path.join(this.storagePath, 'certs');
    this.bootstrapPath = path.join(this.storagePath, 'admin-bootstrap.json');   // R2: raíz del system-admin

    this.caKey = null;   // forge private key object
    this.caCert = null;  // forge certificate object
    this.crl = []; // Certificate Revocation List

    // Configuración por defecto
    this.config = {
      ca_cn: options.ca_cn || 'Event Core Internal CA',
      ca_org: options.ca_org || 'Event Core',
      ca_validity_days: options.ca_validity_days || 3650, // 10 años
      cert_validity_days: options.cert_validity_days || 365, // 1 año
      key_size: options.key_size || 2048
    };
  }

  /**
   * Inicializa la CA - carga existente o genera nueva
   */
  async initialize() {
    // Crear directorios
    fs.mkdirSync(this.storagePath, { recursive: true });
    fs.mkdirSync(this.certsPath, { recursive: true });

    // Cargar CRL
    if (fs.existsSync(this.crlPath)) {
      this.crl = JSON.parse(fs.readFileSync(this.crlPath, 'utf8'));
    }

    // Intentar cargar CA existente
    if (fs.existsSync(this.caKeyPath) && fs.existsSync(this.caCertPath)) {
      const keyPem = fs.readFileSync(this.caKeyPath, 'utf8');
      const certPem = fs.readFileSync(this.caCertPath, 'utf8');
      this.caKey = forge.pki.privateKeyFromPem(keyPem);
      this.caCert = forge.pki.certificateFromPem(certPem);
      return { created: false, loaded: true };
    }

    // Generar nueva CA
    return this._generateCA();
  }

  // ── R2 · bootstrap del system-admin ──────────────────────────────────────
  // El admin del sistema es la RAÍZ de la cadena — no lo invita nadie. Su identidad nace de un
  // código de un solo uso que la CA emite en el PRIMER arranque; el dueño lo reclama desde su
  // navegador (genera su clave, nunca sale) y recibe un cert admin:system:root.

  /** En el primer arranque crea el código de bootstrap. Devuelve {created, token?}. */
  ensureBootstrap() {
    if (fs.existsSync(this.bootstrapPath)) {
      const st = JSON.parse(fs.readFileSync(this.bootstrapPath, 'utf8'));
      return { created: false, claimed: !!st.claimed };
    }
    const token = crypto.randomBytes(24).toString('base64url');
    fs.writeFileSync(this.bootstrapPath, JSON.stringify({ claimed: false, token, created_at: new Date().toISOString() }, null, 2), { mode: 0o600 });
    return { created: true, token, claimed: false };
  }

  /** Estado del bootstrap (sin revelar el token). */
  getBootstrapStatus() {
    if (!fs.existsSync(this.bootstrapPath)) return { exists: false, claimed: false };
    const st = JSON.parse(fs.readFileSync(this.bootstrapPath, 'utf8'));
    return { exists: true, claimed: !!st.claimed, claimed_at: st.claimed_at || null };
  }

  /**
   * Reclama la identidad del system-admin con el código de bootstrap (un solo uso).
   * Firma la clave PÚBLICA del dueño → cert admin:system:root, role system-admin. Quema el código.
   * @returns {Object} { serialNumber, certificate, fingerprint, metadata }
   */
  claimAdmin({ bootstrapToken, publicKeyPem, commonName }) {
    if (!fs.existsSync(this.bootstrapPath)) throw new Error('bootstrap no inicializado');
    const st = JSON.parse(fs.readFileSync(this.bootstrapPath, 'utf8'));
    if (st.claimed) throw new Error('el admin del sistema ya fue reclamado');
    if (!bootstrapToken || bootstrapToken !== st.token) throw new Error('código de bootstrap inválido');
    if (!publicKeyPem) throw new Error('publicKeyPem required');

    const result = this.issueFromPublicKey({
      publicKeyPem, type: 'client', scope: 'system', role: 'system-admin',
      identifier: 'root', commonName: commonName || 'System Admin'
    });

    // quema el código (un solo uso) — conserva el registro para auditoría
    fs.writeFileSync(this.bootstrapPath, JSON.stringify({
      claimed: true, claimed_at: new Date().toISOString(), serialNumber: result.serialNumber
    }, null, 2), { mode: 0o600 });

    return result;
  }

  /**
   * Genera el par de claves y certificado raíz de la CA
   * @private
   */
  _generateCA() {
    const keys = forge.pki.rsa.generateKeyPair(this.config.key_size);
    const cert = forge.pki.createCertificate();

    cert.publicKey = keys.publicKey;
    cert.serialNumber = this._generateSerialNumber();

    const notBefore = new Date();
    const notAfter = new Date();
    notAfter.setDate(notAfter.getDate() + this.config.ca_validity_days);

    cert.validity.notBefore = notBefore;
    cert.validity.notAfter = notAfter;

    const attrs = [
      { name: 'commonName', value: this.config.ca_cn },
      { name: 'organizationName', value: this.config.ca_org }
    ];

    cert.setSubject(attrs);
    cert.setIssuer(attrs); // Auto-firmado

    cert.setExtensions([
      { name: 'basicConstraints', cA: true, critical: true },
      { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
      { name: 'subjectKeyIdentifier' }
    ]);

    // Auto-firmar
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const certPem = forge.pki.certificateToPem(cert);
    const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

    // Guardar en disco
    fs.writeFileSync(this.caKeyPath, keyPem, { mode: 0o600 });
    fs.writeFileSync(this.caCertPath, certPem, { mode: 0o644 });

    this.caKey = keys.privateKey;
    this.caCert = cert;

    return { created: true, loaded: true, serialNumber: cert.serialNumber };
  }

  /**
   * Emite un certificado cliente firmado por la CA
   *
   * @param {Object} options
   * @param {string} options.commonName - Nombre del titular (ej: "Cliente: Pizzería Roma")
   * @param {string} options.type - Tipo: 'client' | 'device'
   * @param {string} options.identifier - ID único (projectId o deviceId)
   * @param {string} [options.organization] - Organización
   * @param {string} [options.email] - Email del titular
   * @param {number} [options.validityDays] - Días de validez (default: config)
   * @param {string} [options.passphrase] - Contraseña para el .p12
   * @returns {Object} { serialNumber, certificate, privateKey, p12, fingerprint, metadata }
   */
  async issueCertificate(options = {}) {
    if (!this.caKey || !this.caCert) {
      throw new Error('CA not initialized. Call initialize() first.');
    }

    const {
      commonName,
      type = 'client',
      identifier,
      scope = 'system',      // <project_id> | 'system' — atado a un proyecto o global
      organization,
      email,
      validityDays = this.config.cert_validity_days,
      passphrase = ''
    } = options;

    if (!commonName) throw new Error('commonName is required');
    if (!identifier) throw new Error('identifier is required');
    if (!['client', 'device'].includes(type)) {
      throw new Error('type must be "client" or "device"');
    }

    // Generar par de claves para el cliente
    const keys = forge.pki.rsa.generateKeyPair(this.config.key_size);

    const cert = forge.pki.createCertificate();
    const serialNumber = this._generateSerialNumber();

    cert.publicKey = keys.publicKey;
    cert.serialNumber = serialNumber;

    const notBefore = new Date();
    const notAfter = new Date();
    notAfter.setDate(notAfter.getDate() + validityDays);

    cert.validity.notBefore = notBefore;
    cert.validity.notAfter = notAfter;

    // Subject del certificado
    const subjectAttrs = [
      { name: 'commonName', value: commonName },
      { name: 'organizationalUnitName', value: type === 'client' ? 'Portal Clientes' : 'Dispositivos' }
    ];
    if (organization) {
      subjectAttrs.push({ name: 'organizationName', value: organization });
    }
    if (email) {
      subjectAttrs.push({ name: 'emailAddress', value: email });
    }

    cert.setSubject(subjectAttrs);

    // Issuer = nuestra CA
    cert.setIssuer(this.caCert.subject.attributes);

    // Extensiones del certificado cliente
    const extensions = [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
      { name: 'extKeyUsage', clientAuth: true },
      { name: 'subjectKeyIdentifier' },
      { name: 'authorityKeyIdentifier', keyIdentifier: true }
    ];

    // Guardar tipo e identifier como extensión personalizada en subjectAltName
    // Usamos uniformResourceIdentifier para codificar type:identifier
    extensions.push({
      name: 'subjectAltName',
      altNames: [
        { type: 6, value: CAManager._buildSan(type, scope, identifier) }
      ]
    });

    cert.setExtensions(extensions);

    // Firmar con la clave de la CA
    cert.sign(this.caKey, forge.md.sha256.create());

    const certificate = forge.pki.certificateToPem(cert);
    const privateKey = forge.pki.privateKeyToPem(keys.privateKey);

    // Generar fingerprint SHA-256 del certificado DER
    const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const fingerprint = forge.md.sha256.create().update(certDer).digest().toHex()
      .toUpperCase()
      .match(/.{2}/g)
      .join(':');

    // Crear PKCS#12 bundle real
    const p12Data = this._createP12Bundle(cert, keys.privateKey, passphrase);

    // Guardar metadata del certificado
    const metadata = {
      serialNumber,
      type,
      scope,
      identifier,
      commonName,
      organization: organization || null,
      email: email || null,
      fingerprint,
      issuedAt: notBefore.toISOString(),
      expiresAt: notAfter.toISOString(),
      status: 'active',
      revokedAt: null
    };

    // Persistir
    const certDir = path.join(this.certsPath, serialNumber);
    fs.mkdirSync(certDir, { recursive: true });
    fs.writeFileSync(path.join(certDir, 'cert.pem'), certificate);
    fs.writeFileSync(path.join(certDir, 'key.pem'), privateKey, { mode: 0o600 });
    fs.writeFileSync(path.join(certDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    if (p12Data) {
      fs.writeFileSync(path.join(certDir, 'bundle.p12'), p12Data);
    }

    return {
      serialNumber,
      certificate,
      privateKey,
      p12: p12Data,
      fingerprint,
      metadata
    };
  }

  /**
   * Emite un certificado firmando una CLAVE PÚBLICA provista por el cliente.
   *
   * A diferencia de issueCertificate (que genera el par y devuelve la privada), aquí la clave
   * privada NUNCA existe en el servidor: el cliente (browser vía WebCrypto, device, peer core) la
   * generó y guardó; solo manda su pubkey. Base del paso 2 (token firmado): el cert prueba QUIÉN es,
   * y la firma del token prueba que POSEE la privada. No hay .p12 ni key.pem que guardar/filtrar.
   *
   * @param {Object} options
   * @param {string} options.publicKeyPem - Clave pública del cliente (SPKI PEM, la que exporta WebCrypto)
   * @param {string} options.commonName
   * @param {string} options.type - 'client' | 'device'
   * @param {string} options.identifier
   * @param {string} [options.organization]
   * @param {string} [options.email]
   * @param {number} [options.validityDays]
   * @returns {Object} { serialNumber, certificate, fingerprint, metadata }  (SIN privateKey ni p12)
   */
  issueFromPublicKey(options = {}) {
    if (!this.caKey || !this.caCert) throw new Error('CA not initialized. Call initialize() first.');
    const {
      publicKeyPem, commonName, type = 'client', identifier, scope = 'system',
      role = null,           // rol-del-bus (project-admin/member/device/...) — hoy en metadata,
                             // graduará al SAN en Fase 2 (política). El guard lo lee vía verify.
      organization, email, validityDays = this.config.cert_validity_days
    } = options;

    if (!publicKeyPem) throw new Error('publicKeyPem is required');
    if (!commonName) throw new Error('commonName is required');
    if (!identifier) throw new Error('identifier is required');
    if (!['client', 'device'].includes(type)) throw new Error('type must be "client" or "device"');

    let publicKey;
    try { publicKey = forge.pki.publicKeyFromPem(publicKeyPem); }
    catch (e) { throw new Error('invalid publicKeyPem: ' + e.message); }

    const cert = forge.pki.createCertificate();
    const serialNumber = this._generateSerialNumber();
    cert.publicKey = publicKey;
    cert.serialNumber = serialNumber;

    const notBefore = new Date();
    const notAfter = new Date();
    notAfter.setDate(notAfter.getDate() + validityDays);
    cert.validity.notBefore = notBefore;
    cert.validity.notAfter = notAfter;

    const subjectAttrs = [
      { name: 'commonName', value: commonName },
      { name: 'organizationalUnitName', value: type === 'client' ? 'Portal Clientes' : 'Dispositivos' }
    ];
    if (organization) subjectAttrs.push({ name: 'organizationName', value: organization });
    if (email) subjectAttrs.push({ name: 'emailAddress', value: email });
    cert.setSubject(subjectAttrs);
    cert.setIssuer(this.caCert.subject.attributes);

    cert.setExtensions([
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
      { name: 'extKeyUsage', clientAuth: true },
      { name: 'subjectKeyIdentifier' },
      { name: 'authorityKeyIdentifier', keyIdentifier: true },
      { name: 'subjectAltName', altNames: [{ type: 6, value: CAManager._buildSan(type, scope, identifier) }] }
    ]);

    cert.sign(this.caKey, forge.md.sha256.create());

    const certificate = forge.pki.certificateToPem(cert);
    const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const fingerprint = forge.md.sha256.create().update(certDer).digest().toHex()
      .toUpperCase().match(/.{2}/g).join(':');

    const metadata = {
      serialNumber, type, scope, role: role || null, identifier, commonName,
      organization: organization || null, email: email || null, fingerprint,
      issuedAt: notBefore.toISOString(), expiresAt: notAfter.toISOString(),
      status: 'active', revokedAt: null, keyOrigin: 'client'   // marca: la privada vive en el cliente
    };

    const certDir = path.join(this.certsPath, serialNumber);
    fs.mkdirSync(certDir, { recursive: true });
    fs.writeFileSync(path.join(certDir, 'cert.pem'), certificate);
    fs.writeFileSync(path.join(certDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    // NO se escribe key.pem ni bundle.p12 — el servidor no conoce la privada.

    return { serialNumber, certificate, fingerprint, metadata };
  }

  /**
   * Revoca un certificado por número de serie
   *
   * @param {string} serialNumber
   * @param {string} [reason] - Motivo de revocación
   * @returns {Object} { revoked, serialNumber, reason }
   */
  revokeCertificate(serialNumber, reason = 'unspecified') {
    const certDir = path.join(this.certsPath, serialNumber);
    const metadataPath = path.join(certDir, 'metadata.json');

    if (!fs.existsSync(metadataPath)) {
      return { revoked: false, error: 'Certificate not found' };
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

    if (metadata.status === 'revoked') {
      return { revoked: false, error: 'Certificate already revoked' };
    }

    // Actualizar metadata
    metadata.status = 'revoked';
    metadata.revokedAt = new Date().toISOString();
    metadata.revokeReason = reason;
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    // Añadir a CRL
    this.crl.push({
      serialNumber,
      revokedAt: metadata.revokedAt,
      reason
    });
    this._saveCRL();

    // Eliminar clave privada por seguridad
    const keyPath = path.join(certDir, 'key.pem');
    if (fs.existsSync(keyPath)) {
      fs.unlinkSync(keyPath);
    }
    const p12Path = path.join(certDir, 'bundle.p12');
    if (fs.existsSync(p12Path)) {
      fs.unlinkSync(p12Path);
    }

    return {
      revoked: true,
      serialNumber,
      reason,
      revokedAt: metadata.revokedAt
    };
  }

  /**
   * Verifica si un certificado es válido (no revocado, no expirado)
   *
   * @param {string} certificatePem - Certificado en formato PEM
   * @returns {Object} { valid, serialNumber, type, identifier, error? }
   */
  verifyCertificate(certificatePem) {
    try {
      // Parsear el certificado X.509
      const cert = forge.pki.certificateFromPem(certificatePem);
      const serialNumber = cert.serialNumber;

      if (!cert) {
        return { valid: false, error: 'Cannot parse certificate' };
      }

      // Verificar que fue firmado por nuestra CA
      const isSignedByCA = this._verifySignature(cert);
      if (!isSignedByCA) {
        return { valid: false, error: 'Not signed by this CA' };
      }

      // Verificar que no está en la CRL
      const isRevoked = this.crl.some(entry =>
        entry.serialNumber === serialNumber
      );
      if (isRevoked) {
        return { valid: false, error: 'Certificate revoked', serialNumber };
      }

      // Verificar expiración desde el propio certificado
      const now = new Date();
      if (now > cert.validity.notAfter) {
        return { valid: false, error: 'Certificate expired', serialNumber };
      }
      if (now < cert.validity.notBefore) {
        return { valid: false, error: 'Certificate not yet valid', serialNumber };
      }

      // Verificar contra metadata si existe (puede tener status revoked por otros medios)
      const metadataPath = path.join(this.certsPath, serialNumber, 'metadata.json');
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

        if (metadata.status === 'revoked') {
          return { valid: false, error: 'Certificate revoked', serialNumber };
        }

        return {
          valid: true,
          serialNumber,
          type: metadata.type,
          scope: metadata.scope || 'system',
          role: metadata.role || null,
          identifier: metadata.identifier,
          commonName: metadata.commonName,
          expiresAt: metadata.expiresAt
        };
      }

      // Sin metadata local — extraer info del propio certificado (SAN)
      const certInfo = this._parseCertificateInfo(cert);
      return {
        valid: true,
        serialNumber,
        type: certInfo.type,
        scope: certInfo.scope || 'system',
        identifier: certInfo.identifier,
        commonName: certInfo.commonName,
        expiresAt: cert.validity.notAfter.toISOString()
      };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Lista todos los certificados emitidos
   *
   * @param {Object} [filters]
   * @param {string} [filters.type] - 'client' | 'device'
   * @param {string} [filters.status] - 'active' | 'revoked' | 'expired'
   * @param {string} [filters.identifier] - Filtrar por identifier
   * @returns {Array} Lista de certificados
   */
  listCertificates(filters = {}) {
    if (!fs.existsSync(this.certsPath)) return [];

    const dirs = fs.readdirSync(this.certsPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    const certs = [];
    const now = new Date();

    for (const dir of dirs) {
      const metadataPath = path.join(this.certsPath, dir, 'metadata.json');
      if (!fs.existsSync(metadataPath)) continue;

      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

      // Calcular estado real (puede haber expirado desde la última vez)
      if (metadata.status === 'active' && new Date(metadata.expiresAt) < now) {
        metadata.status = 'expired';
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      }

      // Aplicar filtros
      if (filters.type && metadata.type !== filters.type) continue;
      if (filters.status && metadata.status !== filters.status) continue;
      if (filters.identifier && metadata.identifier !== filters.identifier) continue;

      certs.push(metadata);
    }

    return certs.sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));
  }

  /**
   * Firma una cadena canónica con la clave RAÍZ de la CA (R1: la CA es la autoridad del sistema).
   * Usado para sellar invitaciones del admin del sistema — verificable con el cert público de la CA
   * (node crypto.verify('RSA-SHA256', ...)). NO produce un certificado: firma bytes arbitrarios, así
   * que no sirve para forjar certs (esos se firman sobre el TBSCertificate DER, no sobre este string).
   *
   * @param {string} canonical - la cadena a firmar
   * @returns {string} firma en base64
   */
  signInvitation(canonical) {
    if (!this.caKey) throw new Error('CA not initialized');
    if (typeof canonical !== 'string' || !canonical) throw new Error('canonical (string) required');
    const md = forge.md.sha256.create();
    md.update(canonical, 'utf8');
    const sig = this.caKey.sign(md);              // RSASSA-PKCS1-v1_5 + SHA-256 (== node RSA-SHA256)
    return Buffer.from(sig, 'binary').toString('base64');
  }

  /**
   * Obtiene el certificado raíz de la CA (para instalar en clientes/dispositivos)
   * @returns {string} CA certificate PEM
   */
  getCACertificate() {
    if (!this.caCert) throw new Error('CA not initialized');
    return forge.pki.certificateToPem(this.caCert);
  }

  /**
   * Obtiene la CRL actual
   * @returns {Array}
   */
  getCRL() {
    return [...this.crl];
  }

  /**
   * Renueva un certificado (revoca el anterior, emite uno nuevo)
   *
   * @param {string} serialNumber - Número de serie del certificado a renovar
   * @param {Object} [overrides] - Opciones para el nuevo certificado
   * @returns {Object} Nuevo certificado
   */
  async renewCertificate(serialNumber, overrides = {}) {
    const metadataPath = path.join(this.certsPath, serialNumber, 'metadata.json');
    if (!fs.existsSync(metadataPath)) {
      throw new Error('Certificate not found');
    }

    const oldMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

    // Emitir nuevo certificado con los mismos datos
    const newCert = await this.issueCertificate({
      commonName: overrides.commonName || oldMetadata.commonName,
      type: oldMetadata.type,
      identifier: oldMetadata.identifier,
      organization: overrides.organization || oldMetadata.organization,
      email: overrides.email || oldMetadata.email,
      validityDays: overrides.validityDays || this.config.cert_validity_days,
      passphrase: overrides.passphrase || ''
    });

    // Revocar el anterior
    this.revokeCertificate(serialNumber, 'superseded');

    return {
      ...newCert,
      previousSerialNumber: serialNumber
    };
  }

  /**
   * Obtiene el bundle .p12 de un certificado existente
   *
   * @param {string} serialNumber
   * @returns {Buffer|null}
   */
  getP12Bundle(serialNumber) {
    const p12Path = path.join(this.certsPath, serialNumber, 'bundle.p12');
    if (!fs.existsSync(p12Path)) return null;
    return fs.readFileSync(p12Path);
  }

  /**
   * Estadísticas de la CA
   */
  getStats() {
    const certs = this.listCertificates();
    const active = certs.filter(c => c.status === 'active');
    const revoked = certs.filter(c => c.status === 'revoked');
    const expired = certs.filter(c => c.status === 'expired');
    const clients = certs.filter(c => c.type === 'client');
    const devices = certs.filter(c => c.type === 'device');

    // Certificados próximos a expirar (30 días)
    const now = new Date();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const expiringSoon = active.filter(c => {
      const expires = new Date(c.expiresAt);
      return (expires - now) < thirtyDays;
    });

    return {
      total: certs.length,
      active: active.length,
      revoked: revoked.length,
      expired: expired.length,
      by_type: {
        client: clients.length,
        device: devices.length
      },
      expiring_soon: expiringSoon.length,
      crl_entries: this.crl.length,
      ca_initialized: !!this.caCert
    };
  }

  // ==========================================
  // Internal helpers
  // ==========================================

  /**
   * Genera número de serie hexadecimal único
   * @private
   */
  _generateSerialNumber() {
    // Lowercase para compatibilidad con node-forge (que normaliza a lowercase)
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Verifica que un certificado fue firmado por nuestra CA
   * @param {Object} cert - forge certificate object
   * @returns {boolean}
   * @private
   */
  _verifySignature(cert) {
    try {
      return this.caCert.verify(cert);
    } catch {
      return false;
    }
  }

  /**
   * Extrae tipo e identifier del certificado X.509
   * @param {Object} cert - forge certificate object
   * @returns {Object} { type, identifier, commonName }
   * @private
   */
  _parseCertificateInfo(cert) {
    const cn = cert.subject.getField('CN');
    const commonName = cn ? cn.value : 'unknown';

    let parsed = { type: 'client', scope: 'system', identifier: 'unknown' };
    const sanExt = cert.getExtension('subjectAltName');
    if (sanExt && sanExt.altNames) {
      for (const alt of sanExt.altNames) {
        if (alt.type === 6 && alt.value.startsWith('urn:eventcore:')) {
          parsed = CAManager._parseSan(alt.value);
        }
      }
    }
    return { ...parsed, commonName };
  }

  /**
   * Crea un bundle PKCS#12 real (certificado + clave privada + CA cert)
   * Importable en navegadores, Android, iOS, Windows, macOS.
   *
   * @param {Object} cert - forge certificate object
   * @param {Object} privateKey - forge private key object
   * @param {string} passphrase - Contraseña para proteger el P12
   * @returns {Buffer} P12 binary data
   * @private
   */
  _createP12Bundle(cert, privateKey, passphrase) {
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
      privateKey,
      [cert, this.caCert],
      passphrase || '',
      {
        algorithm: '3des',
        friendlyName: cert.subject.getField('CN')?.value || 'Event Core Certificate'
      }
    );

    const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
    return Buffer.from(p12Der, 'binary');
  }

  /**
   * Guarda la CRL en disco
   * @private
   */
  _saveCRL() {
    fs.writeFileSync(this.crlPath, JSON.stringify(this.crl, null, 2));
  }
}

module.exports = CAManager;

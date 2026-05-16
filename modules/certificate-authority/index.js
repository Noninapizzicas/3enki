/**
 * Certificate Authority Module v2.0.0 — POC2 canonico.
 *
 * Modulo de Autoridad Certificadora interna para Event Core. Emite, revoca y
 * verifica certificados X.509 cliente. Hook beforeRequest para autenticacion
 * mTLS transparente cuando config.mtls_enabled.
 *
 * Casos de uso:
 *   1. Certificados para clientes del portal de facturacion
 *   2. Certificados para dispositivos de trabajo
 *
 * Publishes (canonicos): certificate.issued, certificate.revoked,
 * certificate.renewed, certificate.expired (todos con correlation_id +
 * timestamp via _publicarEvento).
 */

'use strict';

const CAManager = require('./ca-manager');
const MTLSMiddleware = require('./mtls-middleware');

const BaseModule = require('../_shared/base-module');
class CertificateAuthorityModule extends BaseModule {
  constructor() {
    super();
    this.name = 'certificate-authority';
    this.version = '2.0.0';

    this.caManager = null;
    this.mtlsMiddleware = null;
    this._mtlsHookHandler = null;
    this._coreHooks = null;

    this.stats = {
      certificates_issued: 0,
      certificates_revoked: 0,
      certificates_renewed: 0,
      verification_requests: 0
    };

    this.core = null;
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

    this.caManager = new CAManager({
      storagePath: config.storagePath,
      ca_cn: config.ca_cn,
      ca_org: config.ca_org,
      ca_validity_days: config.ca_validity_days,
      cert_validity_days: config.cert_validity_days,
      key_size: config.key_size
    });

    const result = await this.caManager.initialize();

    this.mtlsMiddleware = new MTLSMiddleware({
      caManager: this.caManager,
      logger: this.logger,
      metrics: this.metrics,
      mode: config.mtls_mode || 'proxy',
      certHeader: config.cert_header || 'x-client-cert',
      excludePaths: config.exclude_paths || [
        '/health', '/ready', '/stats',
        '/modules/certificate-authority/ca-cert',
        '/modules/certificate-authority/status'
      ],
      allowUnauthenticated: config.allow_unauthenticated !== false
    });

    if (core.hooks && config.mtls_enabled) {
      this._coreHooks = core.hooks;
      this._mtlsHookHandler = this.mtlsMiddleware.authenticate.bind(this.mtlsMiddleware);
      core.hooks.register('beforeRequest', this._mtlsHookHandler);
    }

    this.logger?.info?.('module.loaded', {
      module: this.name,
      version: this.version,
      ca_created: result.created,
      ca_loaded: result.loaded,
      mtls_enabled: !!config.mtls_enabled,
      mtls_mode: config.mtls_mode || 'proxy'
    });
  }

  async onUnload() {
    if (this._coreHooks && this._mtlsHookHandler && typeof this._coreHooks.unregister === 'function') {
      try { this._coreHooks.unregister('beforeRequest', this._mtlsHookHandler); } catch (_) { /* ignore */ }
    }
    this._coreHooks = null;
    this._mtlsHookHandler = null;
    this.caManager = null;
    this.mtlsMiddleware = null;
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
    if (code === 'EACCES' || code === 'EPERM') return { status: 500, code: 'FILESYSTEM_ERROR' };
    if (/required|invalid|missing|requerido/i.test(msg)) return { status: 400, code: 'INVALID_INPUT' };
    if (/not found|no encontrado|revoked|expired/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/already|conflict/i.test(msg)) return { status: 409, code: 'CONFLICT_STATE' };
    return { status: 500, code: 'UNKNOWN_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'handler') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('certificate-authority.errors', { code, kind });
    return this._errorResponse(status, code, err?.message || 'Error interno');
  }

  async _publicarEvento(name, payload, sourcePayload) {
    if (!this.eventBus) {
      // Fallback al core.emit legacy si no hay eventBus
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
      this.logger?.warn?.('certificate-authority.publish.failed', {
        event: name, error_message: err.message
      });
    }
    return enriched;
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
          ca: this.caManager.getStats(),
          mtls: this.mtlsMiddleware.getStats(),
          stats: this.stats
        }
      };
    } catch (err) {
      return this._handleHandlerError('certificate-authority.status.error', err);
    }
  }

  async handleGetCACert() {
    try {
      const cert = this.caManager.getCACertificate();
      return {
        status: 200,
        data: {
          certificate: cert,
          instructions: {
            browser: 'Importar como "Autoridad de certificacion" en Configuracion > Certificados',
            windows: 'Doble click > Instalar certificado > Almacen: Entidades de certificacion raiz de confianza',
            macos: 'Abrir con Acceso a Llaveros > Anadir a "Sistema" > Confiar siempre',
            linux: 'Copiar a /usr/local/share/ca-certificates/ y ejecutar update-ca-certificates',
            android: 'Configuracion > Seguridad > Instalar desde almacenamiento',
            ios: 'Enviar por email > Instalar perfil > Configuracion > General > Gestion de perfiles'
          }
        }
      };
    } catch (err) {
      return this._handleHandlerError('certificate-authority.ca_cert.error', err);
    }
  }

  async handleIssueCertificate(input) {
    try {
      // Acepta { body: {...} } (legacy HTTP) o el data plano (UI bus).
      const body = input?.body || input || {};
      const {
        commonName, type, identifier, organization, email,
        validityDays, passphrase, project_id, correlation_id
      } = body;

      if (!commonName || !type || !identifier) {
        this.metrics?.increment?.('certificate-authority.errors', { code: 'INVALID_INPUT', kind: 'issue' });
        this.logger?.warn?.('certificate-authority.issue.missing', {
          missing: ['commonName', 'type', 'identifier'].filter(f => !body[f])
        });
        return this._errorResponse(400, 'INVALID_INPUT',
          'Required fields: commonName, type (client|device), identifier',
          { required: ['commonName', 'type', 'identifier'] });
      }

      const result = await this.caManager.issueCertificate({
        commonName, type, identifier, organization, email, validityDays, passphrase
      });

      this.stats.certificates_issued++;
      this.metrics?.increment?.('certificate-authority.certificates_issued');

      await this._publicarEvento('certificate.issued', {
        serialNumber: result.serialNumber,
        type, identifier, commonName,
        fingerprint: result.fingerprint
      }, { correlation_id, project_id });

      this.logger?.info?.('certificate.issued', {
        serialNumber: result.serialNumber, type, identifier, commonName
      });

      return {
        status: 201,
        data: {
          serialNumber: result.serialNumber,
          fingerprint: result.fingerprint,
          metadata: result.metadata,
          certificate: result.certificate,
          hasP12: !!result.p12
        }
      };
    } catch (err) {
      return this._handleHandlerError('certificate-authority.issue.error', err);
    }
  }

  async handleRevokeCertificate(input) {
    try {
      const body = input?.body || input || {};
      const { serialNumber, reason, project_id, correlation_id } = body;

      if (!serialNumber) {
        this.metrics?.increment?.('certificate-authority.errors', { code: 'INVALID_INPUT', kind: 'revoke' });
        this.logger?.warn?.('certificate-authority.revoke.missing', { field: 'serialNumber' });
        return this._errorResponse(400, 'INVALID_INPUT', 'serialNumber is required', { field: 'serialNumber' });
      }

      const result = this.caManager.revokeCertificate(serialNumber, reason);

      if (!result.revoked) {
        this.metrics?.increment?.('certificate-authority.errors', { code: 'CONFLICT_STATE', kind: 'revoke' });
        this.logger?.warn?.('certificate-authority.revoke.failed', { serialNumber, reason });
        return this._errorResponse(409, 'CONFLICT_STATE',
          result.error || 'Certificate could not be revoked',
          { serialNumber, reason: result.reason });
      }

      this.stats.certificates_revoked++;
      this.metrics?.increment?.('certificate-authority.certificates_revoked');

      await this._publicarEvento('certificate.revoked', {
        serialNumber, reason: reason || 'unspecified'
      }, { correlation_id, project_id });

      this.logger?.info?.('certificate.revoked', { serialNumber, reason });

      return { status: 200, data: result };
    } catch (err) {
      return this._handleHandlerError('certificate-authority.revoke.error', err);
    }
  }

  async handleRenewCertificate(input) {
    try {
      const body = input?.body || input || {};
      const { serialNumber, passphrase, validityDays, project_id, correlation_id } = body;

      if (!serialNumber) {
        this.metrics?.increment?.('certificate-authority.errors', { code: 'INVALID_INPUT', kind: 'renew' });
        return this._errorResponse(400, 'INVALID_INPUT', 'serialNumber is required', { field: 'serialNumber' });
      }

      const result = await this.caManager.renewCertificate(serialNumber, { passphrase, validityDays });

      this.stats.certificates_renewed++;
      this.metrics?.increment?.('certificate-authority.certificates_renewed');

      await this._publicarEvento('certificate.renewed', {
        oldSerialNumber: serialNumber,
        newSerialNumber: result.serialNumber
      }, { correlation_id, project_id });

      this.logger?.info?.('certificate.renewed', {
        old: serialNumber, new: result.serialNumber
      });

      return {
        status: 200,
        data: {
          serialNumber: result.serialNumber,
          previousSerialNumber: result.previousSerialNumber,
          fingerprint: result.fingerprint,
          metadata: result.metadata
        }
      };
    } catch (err) {
      return this._handleHandlerError('certificate-authority.renew.error', err);
    }
  }

  async handleListCertificates(input) {
    try {
      const query = input?.query || input || {};
      const filters = {};
      if (query.type) filters.type = query.type;
      if (query.status) filters.status = query.status;
      if (query.identifier) filters.identifier = query.identifier;

      const certs = this.caManager.listCertificates(filters);

      return {
        status: 200,
        data: { certificates: certs, total: certs.length, filters }
      };
    } catch (err) {
      return this._handleHandlerError('certificate-authority.list.error', err);
    }
  }

  async handleVerifyCertificate(input) {
    try {
      const body = input?.body || input || {};
      const { certificate } = body;

      if (!certificate) {
        this.metrics?.increment?.('certificate-authority.errors', { code: 'INVALID_INPUT', kind: 'verify' });
        return this._errorResponse(400, 'INVALID_INPUT',
          'certificate (PEM) is required',
          { field: 'certificate' });
      }

      this.stats.verification_requests++;
      this.metrics?.increment?.('certificate-authority.verification_requests');
      const result = this.caManager.verifyCertificate(certificate);

      return { status: 200, data: result };
    } catch (err) {
      return this._handleHandlerError('certificate-authority.verify.error', err);
    }
  }

  async handleGetCRL() {
    try {
      return {
        status: 200,
        data: {
          revoked: this.caManager.getCRL(),
          updated: new Date().toISOString()
        }
      };
    } catch (err) {
      return this._handleHandlerError('certificate-authority.crl.error', err);
    }
  }

  async handleDownloadP12(input) {
    try {
      const query = input?.query || input || {};
      const { serialNumber } = query;

      if (!serialNumber) {
        return this._errorResponse(400, 'INVALID_INPUT',
          'serialNumber is required', { field: 'serialNumber' });
      }

      const p12 = this.caManager.getP12Bundle(serialNumber);

      if (!p12) {
        this.metrics?.increment?.('certificate-authority.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'download-p12' });
        this.logger?.warn?.('certificate-authority.download_p12.not_found', { serialNumber });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
          'P12 bundle not found (may have been revoked)',
          { serialNumber });
      }

      return {
        status: 200,
        data: {
          serialNumber,
          bundle: p12.toString('base64'),
          contentType: 'application/x-pkcs12',
          filename: `certificate-${serialNumber.substring(0, 8)}.p12`
        }
      };
    } catch (err) {
      return this._handleHandlerError('certificate-authority.download_p12.error', err);
    }
  }

  async handleGetNginxConfig() {
    try {
      return {
        status: 200,
        data: { config: this.mtlsMiddleware.getNginxConfig() }
      };
    } catch (err) {
      return this._handleHandlerError('certificate-authority.nginx_config.error', err);
    }
  }

  async handleHealthCheck() {
    try {
      const caStats = this.caManager.getStats();
      return {
        status: 200,
        data: {
          module: this.name,
          status: caStats.ca_initialized ? 'healthy' : 'degraded',
          version: this.version,
          ca_initialized: caStats.ca_initialized,
          active_certificates: caStats.active,
          expiring_soon: caStats.expiring_soon,
          mtls_stats: this.mtlsMiddleware.getStats()
        }
      };
    } catch (err) {
      return this._handleHandlerError('certificate-authority.health.error', err);
    }
  }
}

module.exports = CertificateAuthorityModule;

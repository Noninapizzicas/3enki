/**
 * Tests unitarios — certificate-authority (POC2).
 *
 * Mocks CAManager + MTLSMiddleware via require.cache para evitar dependencias
 * de OpenSSL/forge. Foco en el orquestador.
 *
 * Ejecutar: node tests/unit/certificate-authority.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

const CA_MANAGER_PATH = path.resolve(__dirname, '../../modules/certificate-authority/ca-manager.js');
const MTLS_PATH = path.resolve(__dirname, '../../modules/certificate-authority/mtls-middleware.js');

class MockCAManager {
  constructor(opts) {
    this.opts = opts;
    this.certs = new Map();
    this.crl = [];
    this.initialized = false;
  }
  async initialize() {
    this.initialized = true;
    return { created: true, loaded: false };
  }
  getStats() {
    return {
      ca_initialized: this.initialized,
      active: this.certs.size,
      revoked: this.crl.length,
      expiring_soon: 0
    };
  }
  getCACertificate() { return '-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----'; }
  async issueCertificate(opts) {
    const serialNumber = `serial-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fingerprint = `fp-${serialNumber}`;
    const cert = { serialNumber, fingerprint, certificate: 'PEM', metadata: opts, p12: Buffer.from('p12-bytes') };
    this.certs.set(serialNumber, cert);
    return cert;
  }
  revokeCertificate(serialNumber, reason) {
    if (!this.certs.has(serialNumber)) {
      return { revoked: false, error: 'Certificate not found', reason };
    }
    this.crl.push({ serialNumber, reason, at: Date.now() });
    return { revoked: true, serialNumber, reason };
  }
  async renewCertificate(serialNumber) {
    if (!this.certs.has(serialNumber)) throw new Error('not found');
    const newCert = await this.issueCertificate({ commonName: 'renewed' });
    return { ...newCert, previousSerialNumber: serialNumber };
  }
  listCertificates(filters) {
    const all = Array.from(this.certs.values());
    if (filters?.type) return all.filter(c => c.metadata?.type === filters.type);
    return all;
  }
  verifyCertificate(pem) {
    return { valid: true, certificate: 'parsed' };
  }
  getCRL() { return this.crl; }
  getP12Bundle(serialNumber) {
    const cert = this.certs.get(serialNumber);
    return cert?.p12 || null;
  }
}

class MockMTLSMiddleware {
  constructor(opts) {
    this.opts = opts;
    this.stats = { authenticated: 0, rejected: 0, bypassed: 0, errors: 0 };
  }
  authenticate(req, res, next) { return next?.(); }
  getStats() { return this.stats; }
  getNginxConfig() { return 'server { ssl_verify_client on; }'; }
}

require.cache[CA_MANAGER_PATH] = { exports: MockCAManager, filename: CA_MANAGER_PATH, loaded: true, children: [] };
require.cache[MTLS_PATH] = { exports: MockMTLSMiddleware, filename: MTLS_PATH, loaded: true, children: [] };

const CertificateAuthorityModule = require('../../modules/certificate-authority/index.js');

function makeMocks() {
  const logs = [];
  const published = [];
  const metricsCalls = [];
  const hooksRegistered = [];

  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };
  const metrics = {
    increment: (n, l) => metricsCalls.push(['increment', n, l]),
    gauge:     (n, v, l) => metricsCalls.push(['gauge', n, v, l]),
    timing:    (n, ms, l) => metricsCalls.push(['timing', n, ms, l])
  };
  const eventBus = { publish: async (e, p) => { published.push([e, p]); } };
  const hooks = {
    register: (event, handler) => hooksRegistered.push([event, handler]),
    unregister: (event, handler) => {
      const idx = hooksRegistered.findIndex(h => h[0] === event && h[1] === handler);
      if (idx >= 0) hooksRegistered.splice(idx, 1);
    }
  };
  return { logs, published, metricsCalls, hooksRegistered, logger, metrics, eventBus, hooks };
}

async function instantiate(mocks, config = {}) {
  const m = new CertificateAuthorityModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    hooks: mocks.hooks,
    moduleConfig: config
  });
  return { module: m };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

function isCanonicalError(r) {
  return r && typeof r.status === 'number' && r.error
    && typeof r.error.code === 'string'
    && typeof r.error.message === 'string'
    && !('data' in r);
}

function isCanonicalSuccess(r) {
  return r && typeof r.status === 'number' && r.data && !('error' in r);
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

(async () => {
  console.log('certificate-authority — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad inicializa CAManager + mtlsMiddleware', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'certificate-authority');
    assert.strictEqual(m.version, '2.0.0');
    assert.ok(m.caManager);
    assert.strictEqual(m.caManager.initialized, true);
    assert.ok(m.mtlsMiddleware);
    await m.onUnload();
  });

  await testAsync('onLoad registra hook beforeRequest si mtls_enabled', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { mtls_enabled: true });
    assert.strictEqual(mocks.hooksRegistered.length, 1);
    assert.strictEqual(mocks.hooksRegistered[0][0], 'beforeRequest');
    await m.onUnload();
    assert.strictEqual(mocks.hooksRegistered.length, 0);
  });

  await testAsync('onLoad NO registra hook si mtls_enabled false', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { mtls_enabled: false });
    assert.strictEqual(mocks.hooksRegistered.length, 0);
    await m.onUnload();
  });

  await testAsync('onUnload libera caManager + mtlsMiddleware', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onUnload();
    assert.strictEqual(m.caManager, null);
    assert.strictEqual(m.mtlsMiddleware, null);
  });

  // Group 2: Validacion canonica
  await testAsync('handleIssueCertificate sin commonName devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleIssueCertificate({ body: { type: 'client', identifier: 'i1' } });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.deepStrictEqual(r.error.details.required, ['commonName', 'type', 'identifier']);
    await m.onUnload();
  });

  await testAsync('handleIssueCertificate sin type devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleIssueCertificate({ commonName: 'x', identifier: 'i' });
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('handleRevokeCertificate sin serialNumber devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleRevokeCertificate({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.details.field, 'serialNumber');
    await m.onUnload();
  });

  await testAsync('handleRenewCertificate sin serialNumber devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleRenewCertificate({ body: {} });
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('handleVerifyCertificate sin certificate devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleVerifyCertificate({});
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.details.field, 'certificate');
    await m.onUnload();
  });

  await testAsync('handleDownloadP12 sin serialNumber devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleDownloadP12({});
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  // Group 3: Issue + revoke + renew flow
  await testAsync('handleIssueCertificate emite certificate.issued + actualiza stats', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleIssueCertificate({
      body: {
        commonName: 'cliente-test',
        type: 'client',
        identifier: 'cli-1',
        correlation_id: 'cid-issue',
        project_id: 'proj-ca'
      }
    });
    assert.strictEqual(r.status, 201);
    assert.ok(r.data.serialNumber);
    assert.strictEqual(m.stats.certificates_issued, 1);

    const evs = publishedOf(mocks, 'certificate.issued');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid-issue');
    assert.strictEqual(evs[0].project_id, 'proj-ca');
    assert.strictEqual(evs[0].type, 'client');
    await m.onUnload();
  });

  await testAsync('handleRevokeCertificate inexistente devuelve 409 CONFLICT_STATE', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleRevokeCertificate({ body: { serialNumber: 'no-existe' } });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'CONFLICT_STATE');
    await m.onUnload();
  });

  await testAsync('handleRevokeCertificate existente revoca + emite certificate.revoked', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const issued = await m.handleIssueCertificate({
      body: { commonName: 'x', type: 'device', identifier: 'd1' }
    });
    const sn = issued.data.serialNumber;

    const r = await m.handleRevokeCertificate({
      body: { serialNumber: sn, reason: 'compromised' }
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(m.stats.certificates_revoked, 1);
    const evs = publishedOf(mocks, 'certificate.revoked');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].reason, 'compromised');
    await m.onUnload();
  });

  await testAsync('handleRenewCertificate emite certificate.renewed con old + new SN', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const issued = await m.handleIssueCertificate({
      body: { commonName: 'x', type: 'client', identifier: 'i' }
    });
    const r = await m.handleRenewCertificate({
      body: { serialNumber: issued.data.serialNumber }
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(m.stats.certificates_renewed, 1);
    const evs = publishedOf(mocks, 'certificate.renewed');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].oldSerialNumber, issued.data.serialNumber);
    assert.notStrictEqual(evs[0].newSerialNumber, issued.data.serialNumber);
    await m.onUnload();
  });

  await testAsync('handleRenewCertificate inexistente devuelve 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleRenewCertificate({
      body: { serialNumber: 'fantasma' }
    });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  // Group 4: List + verify + CRL
  await testAsync('handleListCertificates devuelve lista vacia inicial', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleListCertificates({});
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.total, 0);
    await m.onUnload();
  });

  await testAsync('handleListCertificates filtra por type', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleIssueCertificate({ body: { commonName: 'a', type: 'client', identifier: 'a' } });
    await m.handleIssueCertificate({ body: { commonName: 'b', type: 'device', identifier: 'b' } });
    const r = await m.handleListCertificates({ query: { type: 'client' } });
    assert.strictEqual(r.data.total, 1);
    await m.onUnload();
  });

  await testAsync('handleVerifyCertificate incrementa contador de verifications', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleVerifyCertificate({ body: { certificate: 'PEM' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(m.stats.verification_requests, 1);
    await m.onUnload();
  });

  await testAsync('handleGetCRL devuelve lista de revocados', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const issued = await m.handleIssueCertificate({ body: { commonName: 'x', type: 'client', identifier: 'i' } });
    await m.handleRevokeCertificate({ body: { serialNumber: issued.data.serialNumber, reason: 'lost' } });
    const r = await m.handleGetCRL();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.revoked.length, 1);
    await m.onUnload();
  });

  // Group 5: P12 + CA cert + nginx
  await testAsync('handleDownloadP12 inexistente devuelve 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleDownloadP12({ query: { serialNumber: 'fantasma' } });
    assert.strictEqual(r.status, 404);
    await m.onUnload();
  });

  await testAsync('handleDownloadP12 existente devuelve base64 + filename', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const issued = await m.handleIssueCertificate({ body: { commonName: 'x', type: 'client', identifier: 'i' } });
    const r = await m.handleDownloadP12({ query: { serialNumber: issued.data.serialNumber } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.contentType, 'application/x-pkcs12');
    assert.ok(r.data.bundle);
    assert.ok(r.data.filename.endsWith('.p12'));
    await m.onUnload();
  });

  await testAsync('handleGetCACert devuelve PEM + instructions', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetCACert();
    assert.ok(isCanonicalSuccess(r));
    assert.ok(r.data.certificate.includes('CERTIFICATE'));
    assert.ok(r.data.instructions.browser);
    await m.onUnload();
  });

  await testAsync('handleGetNginxConfig devuelve config string', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetNginxConfig();
    assert.ok(isCanonicalSuccess(r));
    assert.ok(r.data.config.includes('ssl_verify_client'));
    await m.onUnload();
  });

  // Group 6: Status + health
  await testAsync('handleStatus devuelve module + ca + mtls + stats', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleStatus();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.module, 'certificate-authority');
    assert.ok(r.data.ca);
    assert.ok(r.data.mtls);
    assert.ok(r.data.stats);
    await m.onUnload();
  });

  await testAsync('handleHealthCheck devuelve healthy con CA inicializada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealthCheck();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.status, 'healthy');
    assert.strictEqual(r.data.version, '2.0.0');
    await m.onUnload();
  });

  // Group 7: Helpers POC2
  await testAsync('_errorResponse construye shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._errorResponse(400, 'INVALID_INPUT', 'msg', { f: 'x' });
    assert.deepStrictEqual(r, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { f: 'x' } } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.deepStrictEqual(m._classifyHandlerError(new Error('field is required')), { status: 400, code: 'INVALID_INPUT' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('not found')), { status: 404, code: 'RESOURCE_NOT_FOUND' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('already exists')), { status: 409, code: 'CONFLICT_STATE' });
    await m.onUnload();
  });

  await testAsync('_publicarEvento añade correlation_id, project_id top-level y timestamp', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { foo: 1, project_id: 'p-z' }, { correlation_id: 'cid-z' });
    const ev = mocks.published[0][1];
    assert.strictEqual(ev.correlation_id, 'cid-z');
    assert.strictEqual(ev.project_id, 'p-z');
    assert.ok(ev.timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError emite metric certificate-authority.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'));
    assert.strictEqual(r.status, 404);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'certificate-authority.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });

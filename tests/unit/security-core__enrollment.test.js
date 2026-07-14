'use strict';

/**
 * Paso 2 (backend) — el loop completo del token firmado con cripto REAL:
 *   1. el cliente genera su par (la privada NUNCA sale de él)
 *   2. la CA firma su clave pública → cert (issueFromPublicKey)
 *   3. el cliente mintea un token firmado con su privada
 *   4. el guard lo verifica con el verifier REAL (certificate-authority.verifyCertificate)
 *
 * Prueba de raíz: un cert de OTRA CA no pasa; manipular el token lo invalida; el identifier
 * del SAN llega sellado. Usa node-forge de verdad (vía CAManager), sin mocks de cripto.
 *
 * Ejecutar: node tests/unit/security-core__enrollment.test.js
 */

const assert = require('assert');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');

// node-forge es dependencia de la CA; en local sin `npm install` no está. Degradación honesta:
// saltamos con aviso (en CI, con deps instaladas, corre completo). Los tests del guard/token
// (sin forge) prueban el núcleo cripto igual.
let CAManager;
try { require.resolve('node-forge'); CAManager = require('../../modules/certificate-authority/ca-manager'); }
catch { console.log('⏭  security-core__enrollment: node-forge ausente (local sin npm install) — se corre en CI\n'); process.exit(0); }

const BusGuard = require('../../core/broker/bus-guard');
const enkiToken = require('../../core/broker/enki-token');

async function atest(desc, fn) {
  try { await fn(); console.log(`✓ ${desc}`); }
  catch (err) { console.error(`✗ ${desc}\n  ${err.message}`); process.exit(1); }
}
const authP = (g, client, pass) => new Promise((res) => g.authenticate(client, 'u', pass, (err, ok) => res({ err, ok })));

// cliente: par RSA-2048 (la privada se queda aquí), pubkey en SPKI PEM (lo que exporta WebCrypto)
function clienteKeypair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
}
function tmpDir(tag) {
  const d = path.join(os.tmpdir(), `enki-ca-test-${tag}-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

console.log('Paso 2 (backend) — enrolamiento + token firmado con cripto real\n');

(async () => {
  const ca = new CAManager({ storagePath: tmpDir('ca'), ca_cn: 'Enki Test CA' });
  await ca.initialize();
  // verifier REAL: envuelve certificate-authority.verifyCertificate
  const verifier = (pem) => { const v = ca.verifyCertificate(pem); return { valid: v.valid, type: v.type, identifier: v.identifier, error: v.error }; };

  await atest('enroll: la CA firma la pubkey del cliente → cert (sin devolver privada)', async () => {
    const kp = clienteKeypair();
    const r = ca.issueFromPublicKey({ publicKeyPem: kp.publicKey, commonName: 'ESP32 Cocina', type: 'device', identifier: 'esp32-01' });
    assert.ok(r.certificate.includes('BEGIN CERTIFICATE'));
    assert.ok(!('privateKey' in r) && !('p12' in r), 'la privada nunca sale del servidor');
    const v = ca.verifyCertificate(r.certificate);
    assert.strictEqual(v.valid, true);
    assert.strictEqual(v.identifier, 'esp32-01');
    assert.strictEqual(v.type, 'device');
  });

  await atest('LOOP COMPLETO: enroll (scopeado a proyecto) → mint → guard sella type/scope/identifier', async () => {
    const kp = clienteKeypair();
    const cert = ca.issueFromPublicKey({ publicKeyPem: kp.publicKey, commonName: 'Portal Roma', type: 'client', identifier: 'roma', scope: 'nonina' }).certificate;
    const token = enkiToken.mint({ certPem: cert, privateKeyPem: kp.privateKey, sub: 'roma' });

    const g = new BusGuard({ verifier, getMode: () => 'enforce' });
    const client = {};
    const r = await authP(g, client, token);
    assert.strictEqual(r.ok, true, 'entra con token firmado por su clave, cert firmado por la CA');
    assert.strictEqual(client.enkiIdentity.valid, true);
    assert.strictEqual(client.enkiIdentity.identifier, 'roma');
    assert.strictEqual(client.enkiIdentity.type, 'client');
    assert.strictEqual(client.enkiIdentity.scope, 'nonina', 'el cert atado al proyecto sella project=nonina');
  });

  await atest('scope por defecto = system (cert sin proyecto → global)', async () => {
    const kp = clienteKeypair();
    const cert = ca.issueFromPublicKey({ publicKeyPem: kp.publicKey, commonName: 'Core', type: 'device', identifier: 'core-a' }).certificate;
    const v = ca.verifyCertificate(cert);
    assert.strictEqual(v.scope, 'system', 'sin scope explícito → system (cruza proyectos)');
  });

  await atest('cert de OTRA CA → el guard lo rechaza (firma no valida contra nuestra CA)', async () => {
    const otraCA = new CAManager({ storagePath: tmpDir('rogue'), ca_cn: 'CA Impostora' });
    await otraCA.initialize();
    const kp = clienteKeypair();
    const certRogue = otraCA.issueFromPublicKey({ publicKeyPem: kp.publicKey, commonName: 'x', type: 'client', identifier: 'atacante' }).certificate;
    const token = enkiToken.mint({ certPem: certRogue, privateKeyPem: kp.privateKey });

    const g = new BusGuard({ verifier, getMode: () => 'enforce' });
    const r = await authP(g, {}, token);
    assert.ok(r.err, 'un cert de otra CA no entra, aunque la firma del token sea válida');
  });

  await atest('token con cert legítimo pero firmado por OTRA clave → rechazado (no posee la privada)', async () => {
    const legit = clienteKeypair();
    const cert = ca.issueFromPublicKey({ publicKeyPem: legit.publicKey, commonName: 'y', type: 'device', identifier: 'esp32-02' }).certificate;
    const intruso = clienteKeypair();
    // el intruso roba el cert (público) pero firma con SU clave → la firma no valida contra el cert
    const token = enkiToken.mint({ certPem: cert, privateKeyPem: intruso.privateKey });

    const g = new BusGuard({ verifier, getMode: () => 'enforce' });
    const r = await authP(g, {}, token);
    assert.ok(r.err, 'robar el cert público no basta: hay que poseer la privada');
  });

  await atest('R1: la CA raíz firma una invitación y su cert público la verifica (invitaciones)', async () => {
    const banco = require('../../modules/_shared/invitaciones');
    const { inv, canonical } = banco.construir({
      autoridad: { scope: 'system', role: 'system-admin' },
      grant: { accion: 'crear-proyecto', project: null, role: 'project-admin' },
      limites: { expira_at: new Date(Date.now() + 7 * 864e5).toISOString() }
    });
    const firma = ca.signInvitation(canonical);           // firma forge con la clave raíz
    const firmada = banco.sellar(inv, firma);
    // verificar con node crypto contra el cert PÚBLICO de la CA
    const caCertPem = ca.getCACertificate();
    const verificarFirma = (c, f) => crypto.verify('RSA-SHA256', Buffer.from(c, 'utf8'), crypto.createPublicKey(caCertPem), Buffer.from(f, 'base64'));
    const v = banco.verificar(firmada, { verificarFirma });
    assert.deepStrictEqual(v, { valida: true, faltan: [] }, 'la firma forge de la CA valida con node crypto');
    // y una manipulación del grant la tumba
    firmada.otorga.role = 'system-admin';
    assert.strictEqual(banco.verificar(firmada, { verificarFirma }).valida, false);
  });

  console.log('\n✓ Paso 2 backend: la clave nunca sale del cliente; el guard prueba CA + posesión de raíz; la CA firma invitaciones (R1)');
})();

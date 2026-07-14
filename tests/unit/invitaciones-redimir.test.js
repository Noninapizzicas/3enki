'use strict';

/**
 * invitaciones — REDENCIÓN (3c): el portador usa la invitación → proyecto + cert scopeado.
 *
 * Cierra el círculo con firma REAL (una clave RSA hace de CA — sin forge, corre en local):
 * emitir firma con la clave "CA"; redimir verifica contra su cert público, resuelve project+role,
 * llama a project-manager.create (si crear-proyecto) y a certificate-authority.enroll, y consume
 * un uso. Prueba: crear vs unirse, scope/role que llegan al cert, usos, revocada, código ilegible.
 *
 * Ejecutar: node tests/unit/invitaciones-redimir.test.js
 */

const assert = require('assert');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');
const InvitacionesModule = require('../../modules/invitaciones');

async function atest(desc, fn) { try { await fn(); console.log(`✓ ${desc}`); } catch (e) { console.error(`✗ ${desc}\n  ${e.message}`); process.exit(1); } }

// La "CA" del test: par RSA real. Firma invitaciones y su pubkey PEM hace de cert público.
const CA = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });

function tmpDir() { const d = path.join(os.tmpdir(), `enki-inv-red-${crypto.randomBytes(4).toString('hex')}`); fs.mkdirSync(d, { recursive: true }); return d; }

// core fake: enruta mqttRequest a la "CA" real + project-manager + enroll (captura payloads)
function fakeCore() {
  const calls = [];
  return {
    calls,
    ctx: {
      eventBus: { publish() {} },
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      metrics: { increment() {} },
      moduleConfig: { data_dir: tmpDir() },
      mqttRequest: async (domain, action, payload) => {
        calls.push({ domain, action, payload });
        if (domain === 'certificate-authority' && action === 'sign-invitation') {
          const sig = crypto.sign('RSA-SHA256', Buffer.from(payload.canonical, 'utf8'), CA.privateKey).toString('base64');
          return { data: { signature: sig } };
        }
        if (domain === 'certificate-authority' && action === 'ca-cert') {
          return { data: { certificate: CA.publicKey } };            // pubkey PEM hace de cert público
        }
        if (domain === 'project-manager' && action === 'create') {
          return { data: { project: { id: 'nueva-tienda' } } };
        }
        if (domain === 'certificate-authority' && action === 'enroll') {
          return { data: { certificate: '-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----', metadata: { scope: payload.scope, role: payload.role } } };
        }
        throw new Error(`mqttRequest inesperado: ${domain}/${action}`);
      }
    }
  };
}
const clientePub = () => crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } }).publicKey;
const enrollDe = (core) => core.calls.find(c => c.domain === 'certificate-authority' && c.action === 'enroll');

console.log('invitaciones — redención (3c): el círculo se cierra\n');

(async () => {
  await atest('crear-proyecto: redimir crea el proyecto y emite cert scope=nuevoProyecto role=project-admin', async () => {
    const core = fakeCore(); const mod = new InvitacionesModule(); await mod.onLoad(core.ctx);
    const em = await mod.handleEmitir({ body: { accion: 'crear-proyecto', dias: 7 } });
    const r = await mod.handleRedimir({ body: { codigo: em.data.codigo, publicKeyPem: clientePub(), identifier: 'ana', nombre_proyecto: 'Nueva Tienda' } });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.project, 'nueva-tienda', 'usó el proyecto que creó project-manager');
    assert.strictEqual(r.data.role, 'project-admin');
    assert.ok(core.calls.some(c => c.domain === 'project-manager' && c.action === 'create'), 'creó el proyecto');
    const en = enrollDe(core);
    assert.strictEqual(en.payload.scope, 'nueva-tienda');
    assert.strictEqual(en.payload.role, 'project-admin');
    assert.strictEqual(r.data.usos_restantes, 0);
  });

  await atest('unirse-proyecto: redimir NO crea proyecto y emite cert scope=nonina role=member', async () => {
    const core = fakeCore(); const mod = new InvitacionesModule(); await mod.onLoad(core.ctx);
    const em = await mod.handleEmitir({ body: { accion: 'unirse-proyecto', project: 'nonina', role: 'member' } });
    const r = await mod.handleRedimir({ body: { codigo: em.data.codigo, publicKeyPem: clientePub(), identifier: 'pepe' } });
    assert.strictEqual(r.data.project, 'nonina');
    assert.strictEqual(r.data.role, 'member');
    assert.ok(!core.calls.some(c => c.domain === 'project-manager'), 'no crea proyecto al unirse');
    assert.strictEqual(enrollDe(core).payload.scope, 'nonina');
  });

  await atest('usos: segunda redención de una invitación de 1 uso → 403 (sin usos)', async () => {
    const core = fakeCore(); const mod = new InvitacionesModule(); await mod.onLoad(core.ctx);
    const em = await mod.handleEmitir({ body: { accion: 'unirse-proyecto', project: 'nonina', role: 'member', usos_max: 1 } });
    await mod.handleRedimir({ body: { codigo: em.data.codigo, publicKeyPem: clientePub() } });
    const r2 = await mod.handleRedimir({ body: { codigo: em.data.codigo, publicKeyPem: clientePub() } });
    assert.strictEqual(r2.status, 403);
    assert.ok(JSON.stringify(r2.error).match(/usos/), 'nombra que no quedan usos');
  });

  await atest('revocada: redimir una revocada → 403', async () => {
    const core = fakeCore(); const mod = new InvitacionesModule(); await mod.onLoad(core.ctx);
    const em = await mod.handleEmitir({ body: { accion: 'crear-proyecto' } });
    await mod.handleRevocar({ body: { id: em.data.invitacion.id } });
    const r = await mod.handleRedimir({ body: { codigo: em.data.codigo, publicKeyPem: clientePub(), nombre_proyecto: 'X' } });
    assert.strictEqual(r.status, 403);
  });

  await atest('crear-proyecto sin nombre_proyecto → 400', async () => {
    const core = fakeCore(); const mod = new InvitacionesModule(); await mod.onLoad(core.ctx);
    const em = await mod.handleEmitir({ body: { accion: 'crear-proyecto' } });
    const r = await mod.handleRedimir({ body: { codigo: em.data.codigo, publicKeyPem: clientePub() } });
    assert.strictEqual(r.status, 400);
  });

  await atest('código de invitación desconocido → 404', async () => {
    const core = fakeCore(); const mod = new InvitacionesModule(); await mod.onLoad(core.ctx);
    const falso = 'enki-inv:' + Buffer.from(JSON.stringify({ id: 'inv_falso' }), 'utf8').toString('base64url');
    const r = await mod.handleRedimir({ body: { codigo: falso, publicKeyPem: clientePub() } });
    assert.strictEqual(r.status, 404);
  });

  console.log('\n✓ invitaciones (redención): la invitación se convierte en proyecto + cert scopeado; usos y revocación cierran');
})();

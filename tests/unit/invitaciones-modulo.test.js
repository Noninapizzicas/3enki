'use strict';

/**
 * invitaciones (módulo) — emitir/listar/revocar del admin del sistema.
 *
 * Verifica el cerebro: emitir arma la invitación (monotonía del banco), la firma vía la CA
 * (mqttRequest fake), la persiste y entrega un código copiable; listar refleja el estado;
 * revocar la marca. Store en dir temporal, sin CA real (la firma se stubea).
 *
 * Ejecutar: node tests/unit/invitaciones-modulo.test.js
 */

const assert = require('assert');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');
const InvitacionesModule = require('../../modules/invitaciones');

async function atest(desc, fn) { try { await fn(); console.log(`✓ ${desc}`); } catch (e) { console.error(`✗ ${desc}\n  ${e.message}`); process.exit(1); } }

function tmpDir() {
  const d = path.join(os.tmpdir(), `enki-inv-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function fakeCore(signature = 'FAKE_SIG') {
  const published = [];
  return {
    published,
    ctx: {
      eventBus: { publish: (ev, p) => published.push({ ev, p }) },
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      metrics: { increment() {} },
      moduleConfig: { data_dir: tmpDir() },
      mqttRequest: async (domain, action, payload) => {
        assert.strictEqual(domain, 'certificate-authority');
        assert.strictEqual(action, 'sign-invitation');
        assert.ok(payload.canonical, 'firma sobre el canonical');
        return { status: 200, data: { signature } };
      }
    }
  };
}

console.log('invitaciones (módulo) — emitir/listar/revocar\n');

(async () => {
  await atest('emitir: crea invitación de proyecto firmada por la CA + código copiable', async () => {
    const core = fakeCore('SIG123');
    const mod = new InvitacionesModule();
    await mod.onLoad(core.ctx);
    const r = await mod.handleEmitir({ body: { accion: 'crear-proyecto', dias: 7 } });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.invitacion.otorga.accion, 'crear-proyecto');
    assert.strictEqual(r.data.invitacion.otorga.role, 'project-admin');
    assert.strictEqual(r.data.invitacion.firma, 'SIG123', 'lleva la firma de la CA');
    assert.ok(r.data.codigo.startsWith('enki-inv:'), 'código copiable para entregar');
    assert.strictEqual(r.data.estado, 'activa');
    assert.ok(core.published.some(p => p.ev === 'invitacion.emitida'));
  });

  await atest('emitir: unirse a proyecto existente (project + role)', async () => {
    const core = fakeCore();
    const mod = new InvitacionesModule();
    await mod.onLoad(core.ctx);
    const r = await mod.handleEmitir({ body: { accion: 'unirse-proyecto', project: 'nonina', role: 'member' } });
    assert.strictEqual(r.data.invitacion.otorga.project, 'nonina');
    assert.strictEqual(r.data.invitacion.otorga.role, 'member');
  });

  await atest('listar: refleja las emitidas y su estado', async () => {
    const core = fakeCore();
    const mod = new InvitacionesModule();
    await mod.onLoad(core.ctx);
    await mod.handleEmitir({ body: { accion: 'crear-proyecto' } });
    await mod.handleEmitir({ body: { accion: 'unirse-proyecto', project: 'nonina', role: 'member' } });
    const r = await mod.handleListar({});
    assert.strictEqual(r.data.total, 2);
    assert.ok(r.data.invitaciones.every(i => i.estado === 'activa'));
  });

  await atest('revocar: marca la invitación como revocada', async () => {
    const core = fakeCore();
    const mod = new InvitacionesModule();
    await mod.onLoad(core.ctx);
    const em = await mod.handleEmitir({ body: { accion: 'crear-proyecto' } });
    const id = em.data.invitacion.id;
    const r = await mod.handleRevocar({ body: { id } });
    assert.strictEqual(r.data.revocada, true);
    const lista = await mod.handleListar({});
    assert.strictEqual(lista.data.invitaciones[0].estado, 'revocada');
    assert.ok(core.published.some(p => p.ev === 'invitacion.revocada'));
  });

  await atest('revocar: id inexistente → 404', async () => {
    const core = fakeCore();
    const mod = new InvitacionesModule();
    await mod.onLoad(core.ctx);
    const r = await mod.handleRevocar({ body: { id: 'inv_noexiste' } });
    assert.strictEqual(r.status, 404);
  });

  await atest('persistencia: las emitidas sobreviven a recargar el módulo', async () => {
    const dir = tmpDir();
    const core1 = fakeCore(); core1.ctx.moduleConfig.data_dir = dir;
    const m1 = new InvitacionesModule(); await m1.onLoad(core1.ctx);
    await m1.handleEmitir({ body: { accion: 'crear-proyecto' } });
    const core2 = fakeCore(); core2.ctx.moduleConfig.data_dir = dir;
    const m2 = new InvitacionesModule(); await m2.onLoad(core2.ctx);
    const r = await m2.handleListar({});
    assert.strictEqual(r.data.total, 1, 'se releyó del disco');
  });

  console.log('\n✓ invitaciones (módulo): el admin del sistema emite, lista y revoca; la CA firma');
})();

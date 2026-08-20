'use strict';
const assert = require('assert');
const Portal = require('../../modules/portal');

function nuevo() {
  const m = new Portal();
  m.logger = { info(){}, warn(){}, error(){} };
  m.metrics = { increment(){} };
  m.eventBus = { publish: () => {} };
  // tool con confirmation:true
  const toolDef = {
    name: 'crear_skill',
    description: 'crea una skill en la cantera',
    confirmation: true,
    handler: async () => ({ status: 200, data: { creada: true } })
  };
  m.moduleLoader = {
    getTool: (name) => name === 'crear_skill' ? toolDef : null,
    executeTool: async () => ({ status: 200, data: { creada: true } })
  };
  m.config = { portal_enabled_default: true, mode: 'write', scope: 'system' };
  m.activo = true; m.activoWrite = true; m.mode = 'write'; m.scope = 'system'; m.projectId = null;
  return m;
}

(async () => {
  const m = nuevo();
  const publicado = [];
  m.eventBus = { publish: (topic, d) => publicado.push({ topic, d }) };

  // tool con confirmation sin confirmado → 409 + publica evento
  const r = await m.handleCall({ tool: 'crear_skill', args: { nombre: 'x' } });
  assert.strictEqual(r.status, 409, '409 NEEDS_CONFIRMATION');
  assert.strictEqual(r.error.code, 'NEEDS_CONFIRMATION');
  // el evento de confirmación pendiente se publica
  const ev = publicado.find(p => p.topic === 'portal.confirmation.pendiente');
  assert.ok(ev, 'publica portal.confirmation.pendiente');
  assert.strictEqual(ev.d.tool, 'crear_skill');
  assert.ok(ev.d.description.includes('cantera'));
  assert.ok(ev.d.args && ev.d.args.nombre === 'x');

  // tool con confirmado:true → NO publica evento, ejecuta (200)
  publicado.length = 0;
  const r2 = await m.handleCall({ tool: 'crear_skill', args: { nombre: 'X' }, confirmado: true });
  assert.strictEqual(r2.status, 200, 'con confirmado:true ejecuta');
  const ev2 = publicado.find(p => p.topic === 'portal.confirmation.pendiente');
  assert.ok(!ev2, 'NO publica evento con confirmado:true');

  console.log('[portal-confirmacion] OK — 409 + portal.confirmation.pendiente, y sin evento con confirmado:true');
})();

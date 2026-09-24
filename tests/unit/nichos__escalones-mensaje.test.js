/**
 * Test unitario — nichos/escalones-mensaje (G2, reflejo stateless)
 *
 * Cubre: clasificar pulso → escalon PULSO (informativo, no interrumpe); alerta →
 * ALERTA (interrumpe); decision → DECISION (exige accion); cadencia declarada del
 * perfil de supervision aplicada; tipo no clasificable → failed; project.activated
 * registra el context; y la exactitud de subscribes ↔ handlers / publishes.
 *
 * Ejecutar: node tests/unit/nichos__escalones-mensaje.test.js
 */

'use strict';
const assert = require('assert');
const ModuleLoader = require('../../core/modules/loader.js');

function makeMiniBus() {
  const subs = new Map();
  const published = [];
  return {
    published,
    subscribe(name, handler) {
      if (!subs.has(name)) subs.set(name, new Set());
      subs.get(name).add(handler);
      return () => subs.get(name)?.delete(handler);
    },
    async publish(name, data) {
      published.push([name, data]);
      const set = subs.get(name);
      if (!set) return;
      for (const h of [...set]) { try { await h(data); } catch (_) {} }
    },
    listenerCount(name) { return subs.get(name)?.size || 0; }
  };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (err) {
    console.error(`✗ ${description}`);
    console.error(`  ${err.message}`);
    if (process.env.STACK) console.error(err.stack);
    process.exit(1);
  }
}

const LOG = { debug(){}, info(){}, warn(){}, error(){} };
const METRICS = { increment(){}, gauge(){} };

(async () => {
  console.log('nichos/escalones-mensaje — reflejo stateless (G2)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'escalones-mensaje');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._clasificarTipo, 'function', 'proyección pura presente');

  await testAsync('clasificar pulso → escalon PULSO (informativo, no interrumpe)', async () => {
    const res = await instance.onClasificarRequest({ data: { project_id: 'n1', tipo: 'pulso', mensaje: 'todo ok', request_id: 'C1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.escalon, 'PULSO');
    assert.strictEqual(res.data.prioridad, 1);
    assert.strictEqual(res.data.interrumpe, false);
    assert.strictEqual(res.data.exige_accion, false);
    assert.ok(bus.published.some(([n]) => n === 'nichos.escalon.clasificado'), 'publica nichos.escalon.clasificado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.escalon.clasificar.response' && v.request_id === 'C1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('clasificar alerta → escalon ALERTA (interrumpe, no exige accion)', async () => {
    const res = await instance.onClasificarRequest({ data: { project_id: 'n1', tipo: 'alerta', mensaje: 'sangria', request_id: 'C2' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.escalon, 'ALERTA');
    assert.strictEqual(res.data.interrumpe, true);
    assert.strictEqual(res.data.exige_accion, false);
  });

  await testAsync('clasificar decision → escalon DECISION (exige accion del dueño)', async () => {
    const res = await instance.onClasificarRequest({ data: { project_id: 'n1', tipo: 'decision', mensaje: 'aprueba?', request_id: 'C3' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.escalon, 'DECISION');
    assert.strictEqual(res.data.interrumpe, true);
    assert.strictEqual(res.data.exige_accion, true);
  });

  await testAsync('cadencia declarada del perfil de supervision (H2) aplicada', async () => {
    const res = await instance.onClasificarRequest({ data: { project_id: 'n1', tipo: 'pulso', perfil_supervision: { cadencia_pulso: 'semanal' }, request_id: 'C4' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.cadencia, 'semanal');
    assert.strictEqual(res.data.regla, 'duro');
  });

  await testAsync('clasificar tipo no clasificable → failed', async () => {
    const res = await instance.onClasificarRequest({ data: { project_id: 'n1', tipo: 'consulta', request_id: 'C5' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
    assert.ok(bus.published.some(([n]) => n === 'nichos.escalon.clasificar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('project.activated registra el project_id y se usa de contexto', async () => {
    const r = await instance.onProjectActivated({ data: { project_id: 'p7' } });
    assert.strictEqual(r.status, 200);
    const res = await instance.onClasificarRequest({ data: { tipo: 'alerta', request_id: 'C6' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.project_id, 'p7');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja G2', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), [
      'nichos.escalon.clasificar.request',
      'project.activated'
    ].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.escalon.clasificado', 'nichos.escalon.clasificar.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

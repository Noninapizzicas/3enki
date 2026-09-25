/**
 * Test unitario — nichos/canal-distribucion (E4, puente stateless)
 *
 * Cubre: entrega de la solución al pagador por su canal → nichos.entrega.enviada;
 * .response correlado; sin canal → failed; sin solución → failed; sin pagador →
 * failed; project.activated registra el context; y la exactitud de subscribes ↔
 * handlers / publishes.
 *
 * Ejecutar: node tests/unit/nichos__canal-distribucion.test.js
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
  console.log('nichos/canal-distribucion — puente stateless (E4)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'canal-distribucion');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._emitirEntrega, 'function', 'proyección pura presente');

  await testAsync('emitir entrega: solución al pagador por su canal → publica nichos.entrega.enviada', async () => {
    const res = await instance.onEnviarRequest({ data: {
      project_id: 'n1',
      solucion: { id: 'sol-n1', nombre: 'Landing nicho' },
      canal: 'email',
      pagador: 'cliente a',
      request_id: 'E1'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.entrega.pagador, 'cliente a');
    assert.strictEqual(res.data.entrega.canal, 'email');
    assert.strictEqual(res.data.entrega.solucion_id, 'sol-n1');
    assert.strictEqual(res.data.entrega.entregada, true);
    assert.ok(bus.published.some(([n]) => n === 'nichos.entrega.enviada'), 'publica nichos.entrega.enviada');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.entrega.enviar.response' && v.request_id === 'E1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('emitir entrega: sin canal → failed', async () => {
    const res = await instance.onEnviarRequest({ data: { project_id: 'n1', solucion: { id: 'x' }, pagador: 'cliente a', request_id: 'E2' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
    assert.ok(bus.published.some(([n]) => n === 'nichos.entrega.enviar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('emitir entrega: sin solución → failed', async () => {
    const res = await instance.onEnviarRequest({ data: { project_id: 'n1', canal: 'email', pagador: 'cliente a', request_id: 'E3' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
  });

  await testAsync('emitir entrega: sin pagador → failed', async () => {
    const res = await instance.onEnviarRequest({ data: { project_id: 'n1', solucion: { id: 'x' }, canal: 'email', request_id: 'E4' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
  });

  await testAsync('project.activated registra el project_id y se usa de contexto', async () => {
    const r = await instance.onProjectActivated({ data: { project_id: 'p7' } });
    assert.strictEqual(r.status, 200);
    const res = await instance.onEnviarRequest({ data: { solucion: { id: 's7' }, canal: 'telegram', pagador: 'cliente c', request_id: 'E5' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.project_id, 'p7');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja E4', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), [
      'nichos.entrega.enviar.request',
      'project.activated'
    ].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.entrega.enviada', 'nichos.entrega.enviar.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

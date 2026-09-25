/**
 * Test unitario — nichos/canal-supervision (G1, puente stateless)
 *
 * Cubre: carga real del loader, RPC conectar → nichos.canal.conectado, reemplazar →
 * nichos.canal.reemplazado, RPC enviar por .response (éxito con canal conectado),
 * par determinista nichos.canal.envio_fallido cuando no hay canal o no está conectado,
 * y que el manifest coincide con la hoja G1.
 *
 * Ejecutar: node tests/unit/nichos__canal-supervision.test.js
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
  console.log('nichos/canal-supervision — puente stateless (G1)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'canal-supervision');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._enviar, 'function', 'proyección _enviar presente');

  await testAsync('conectar canal + publica nichos.canal.conectado', async () => {
    const res = await instance.onConectarRequest({ data: { canal: 'telegram', config: { tipo: 'telegram' }, request_id: 'C1' } });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.conectado === true);
    assert.ok(bus.published.some(([n]) => n === 'nichos.canal.conectado'), 'publica nichos.canal.conectado');
  });

  await testAsync('RPC enviar + responde por .response (éxito)', async () => {
    const res = await instance.onEnviarRequest({ data: { tipo: 'decision', titulo: 'Gate', cuerpo: 'aprueba?', request_id: 'E1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.canal, 'telegram', 'enruta hacia el canal conectado');
    assert.strictEqual(res.data.entregado, true);
    assert.strictEqual(res.data.escalon, 'decision');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.canal.enviar.response' && v.request_id === 'E1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
    assert.ok(bus.published.some(([n]) => n === 'nichos.canal.enviado'), 'publica nichos.canal.enviado');
    assert.ok(!bus.published.some(([n]) => n === 'nichos.canal.envio_fallido'), 'éxito NO dispara el par de fallo');
  });

  await testAsync('enviar sin titulo ni cuerpo → nichos.canal.envio_fallido', async () => {
    const res = await instance.onEnviarRequest({ data: { request_id: 'E2' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
    assert.ok(bus.published.some(([n]) => n === 'nichos.canal.envio_fallido'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('enviar sin ninguna fuente conectada → par de fallo', async () => {
    const CanalSupervision = require('../../modules/nichos/canal-supervision/index.js');
    const solo = new CanalSupervision();
    solo.logger = LOG; solo.metrics = METRICS; solo.eventBus = bus;
    const res = await solo.onEnviarRequest({ data: { titulo: 'x', request_id: 'E3' } });
    assert.strictEqual(res.status, 404);
    assert.ok(res.error.code === 'RESOURCE_NOT_FOUND', 'código canónico');
  });

  await testAsync('reemplazar canal conectado → nichos.canal.reemplazado', async () => {
    const res = await instance.onReemplazarRequest({ data: { canal: 'telegram', por: 'whatsapp', request_id: 'R1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.de, 'telegram');
    assert.strictEqual(res.data.a, 'whatsapp');
    assert.ok(bus.published.some(([n]) => n === 'nichos.canal.reemplazado'), 'publica nichos.canal.reemplazado');
    // Ahora enviar enruta hacia el nuevo canal activo (whatsapp)
    const en = await instance.onEnviarRequest({ data: { titulo: 'hola', request_id: 'E4' } });
    assert.strictEqual(en.data.canal, 'whatsapp', 'el canal reemplazado queda activo');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja G1', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event), [
      'nichos.canal.conectar.request',
      'nichos.canal.reemplazar.request',
      'nichos.canal.enviar.request'
    ]);
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, [
      'nichos.canal.conectado',
      'nichos.canal.enviado',
      'nichos.canal.envio_fallido',
      'nichos.canal.reemplazado'
    ].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

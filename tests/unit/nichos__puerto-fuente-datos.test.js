/**
 * Test unitario — nichos/puerto-fuente-datos (J1, puente stateless)
 *
 * Cubre: carga real del loader, RPC consultar (éxito con fuente conectada), fallo con su
 * par determinista nichos.fuente.consultar.failed, conectar → nichos.fuente.conectada,
 * reemplazar → nichos.fuente.reemplazada, y que el manifest coincide con la hoja J1.
 *
 * Ejecutar: node tests/unit/nichos__puerto-fuente-datos.test.js
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
  console.log('nichos/puerto-fuente-datos — puente stateless (J1)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'puerto-fuente-datos');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._consultar, 'function', 'proyección _consultar presente');

  await testAsync('conectar fuente + publica nichos.fuente.conectada', async () => {
    const res = await instance.onConectarRequest({ data: { fuente: 'buscador', config: { tipo: 'search-engine' }, request_id: 'C1' } });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.conectada === true);
    assert.ok(bus.published.some(([n]) => n === 'nichos.fuente.conectada'), 'publica nichos.fuente.conectada');
  });

  await testAsync('RPC consultar + responde por .response (éxito)', async () => {
    const res = await instance.onConsultarRequest({ data: { nicho: 'salsa picante', request_id: 'S1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.dataset_bruto.semilla, 'salsa picante', 'DatasetBruto con la semilla del nicho');
    assert.strictEqual(res.data.fuente, 'buscador', 'enruta hacia la fuente conectada');
    assert.ok(typeof res.data.rate.por_minuto === 'number', 'rate presente');
    assert.ok(typeof res.data.coste.creditos === 'number', 'coste presente');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.fuente.consultar.response' && v.request_id === 'S1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
    assert.ok(!bus.published.some(([n]) => n === 'nichos.fuente.consultar.failed'), 'éxito NO dispara el par de fallo');
  });

  await testAsync('consultar fuente no conectada → nichos.fuente.consultar.failed', async () => {
    const res = await instance.onConsultarRequest({ data: { nicho: 'cerveza artesanal', fuente: 'comunidad', request_id: 'S2' } });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.error.code, 'RESOURCE_NOT_FOUND');
    assert.ok(bus.published.some(([n]) => n === 'nichos.fuente.consultar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('consultar sin ninguna fuente conectada → par de fallo', async () => {
    const PuertoFuenteDatos = require('../../modules/nichos/puerto-fuente-datos/index.js');
    const solo = new PuertoFuenteDatos();
    solo.logger = LOG; solo.metrics = METRICS; solo.eventBus = bus;
    const res = await solo.onConsultarRequest({ data: { nicho: 'n', request_id: 'S3' } });
    assert.strictEqual(res.status, 404);
    assert.ok(res.error.code === 'RESOURCE_NOT_FOUND', 'código canónico');
  });

  await testAsync('reemplazar fuente conectada → nichos.fuente.reemplazada', async () => {
    const res = await instance.onReemplazarRequest({ data: { fuente: 'buscador', por: 'api', request_id: 'R1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.de, 'buscador');
    assert.strictEqual(res.data.a, 'api');
    assert.ok(bus.published.some(([n]) => n === 'nichos.fuente.reemplazada'), 'publica nichos.fuente.reemplazada');
    // Ahora consultar enruta hacia la nueva fuente activa (api)
    const q = await instance.onConsultarRequest({ data: { nicho: 'salsa', request_id: 'S4' } });
    assert.strictEqual(q.data.fuente, 'api', 'la fuente reemplazada queda activa');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja J1', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event), [
      'nichos.fuente.consultar.request',
      'nichos.fuente.conectar.request',
      'nichos.fuente.reemplazar.request'
    ]);
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, [
      'nichos.fuente.consultar.failed',
      'nichos.fuente.conectada',
      'nichos.fuente.reemplazada'
    ].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

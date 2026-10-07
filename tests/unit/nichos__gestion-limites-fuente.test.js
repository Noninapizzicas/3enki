/**
 * Test unitario — nichos/gestion-limites-fuente (J3, reflejo stateless)
 *
 * Cubre: carga real del loader, RPC dosificar (permite bajo limite, encola al
 * superar, deniega con cola llena), par de fallo si falta el límite, RPC encolar con
 * par de fallo, y que cada flujo cierra su círculo con su par de fallo.
 *
 * Ejecutar: node tests/unit/nichos__gestion-limites-fuente.test.js
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
  console.log('nichos/gestion-limites-fuente — reflejo stateless (J3)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'gestion-limites-fuente');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');

  await testAsync('dosificar: permite la consulta bajo el limite', async () => {
    const res = await instance.onDosificarRequest({ data: { fuente: 'buscador', limite: 10, consultas_hechas: 3, request_id: 'D1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.decision, 'PERMITIR');
    assert.strictEqual(res.data.permitido, true);
    assert.strictEqual(res.data.pendientes_hasta_limite, 7);
    assert.ok(bus.published.some(([n]) => n === 'nichos.fuente.dosificado'), 'publica nichos.fuente.dosificado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.fuente.dosificar.response' && v.request_id === 'D1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('dosificar: encola al superar / igualar el limite', async () => {
    const res = await instance.onDosificarRequest({ data: { fuente: 'scraping', limite: 5, consultas_hechas: 5, cola_ocupada: 1, request_id: 'D2' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.decision, 'ENCOLAR');
    assert.strictEqual(res.data.permitido, false);
  });

  await testAsync('dosificar: deniega cuando ademas la cola esta llena', async () => {
    const res = await instance.onDosificarRequest({ data: { fuente: 'api', limite: 2, consultas_hechas: 5, cola_ocupada: 100, max_cola: 100, request_id: 'D3' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.decision, 'DENEGAR');
    assert.strictEqual(res.data.permitido, false);
  });

  await testAsync('dosificar: par de fallo si falta el limite declarado', async () => {
    const res = await instance.onDosificarRequest({ data: { fuente: 'comunidad', consultas_hechas: 2, request_id: 'D4' } });
    assert.strictEqual(res.status, 422);
    assert.strictEqual(res.error.code, 'LIMITE_FALTANTE');
    assert.ok(bus.published.some(([n]) => n === 'nichos.fuente.dosificar.failed'), 'cierra el circulo con el par de fallo');
  });

  await testAsync('encolar: añade la consulta al final de la cola', async () => {
    const res = await instance.onEncolarRequest({ data: { fuente: 'buscador', solicitud: { nicho: 'salsa picante' }, cola: [{ id: 'a' }], request_id: 'E1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.posicion, 2);
    assert.strictEqual(res.data.total_en_cola, 2);
    assert.strictEqual(res.data.cola.length, 2);
    assert.ok(bus.published.some(([n]) => n === 'nichos.fuente.encolado'), 'publica nichos.fuente.encolado');
  });

  await testAsync('encolar: deniega con par de fallo si la cola esta llena', async () => {
    const res = await instance.onEncolarRequest({ data: { fuente: 'api', solicitud: { nicho: 'x' }, cola: Array(100).fill({ id: 'p' }), max_cola: 100, request_id: 'E2' } });
    assert.strictEqual(res.status, 429);
    assert.strictEqual(res.error.code, 'COLA_LLENA');
    assert.ok(bus.published.some(([n]) => n === 'nichos.fuente.encolar.failed'), 'cierra el circulo con el par de fallo');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja J3', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), ['nichos.fuente.dosificar.request', 'nichos.fuente.encolar.request'].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, [
      'nichos.fuente.dosificado',
      'nichos.fuente.dosificar.failed',
      'nichos.fuente.encolado',
      'nichos.fuente.encolar.failed'
    ].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

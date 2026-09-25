/**
 * Test unitario — nichos/imputacion-costes (F2, reflejo)
 *
 * Cubre: agregar costes (construccion + operacion + fuentes) → CosteProyecto
 * con desglose + total, publica nichos.coste_imputado; fuentes como array (del
 * coste-fuente J4); proyección pura determinista; payload inválido (partida
 * negativa) → failed; y la exactitud de subscribes ↔ handlers / publishes.
 *
 * Ejecutar: node tests/unit/nichos__imputacion-costes.test.js
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
  console.log('nichos/imputacion-costes — reflejo (F2)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'imputacion-costes');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(instance._persist, undefined, 'reflejo: sin PosPersistencia (stateless)');

  await testAsync('agregar: costes (construccion+operacion+fuentes) → CosteProyecto y publica nichos.coste_imputado', async () => {
    const res = await instance.onAgregarRequest({ data: {
      project_id: 'p1',
      costes: { construccion: 500, operacion: 120, fuentes: 7.5 },
      request_id: 'A1'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.imputado, true);
    assert.strictEqual(res.data.coste_proyecto.construccion, 500);
    assert.strictEqual(res.data.coste_proyecto.operacion, 120);
    assert.strictEqual(res.data.coste_proyecto.fuentes, 7.5);
    assert.strictEqual(res.data.coste_total, 627.5);
    assert.ok(bus.published.some(([n]) => n === 'nichos.coste_imputado'), 'publica nichos.coste_imputado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.coste.agregar.response' && v.request_id === 'A1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('agregar: fuentes como array (del coste-fuente J4) se suma', async () => {
    const res = await instance.onAgregarRequest({ data: {
      project_id: 'p1',
      costes: { construccion: 200, operacion: 50, fuentes: [{ coste: 1 }, { coste: 0.5 }, { coste: 6 }] }
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.coste_proyecto.fuentes, 7.5);
    assert.strictEqual(res.data.coste_total, 257.5);
  });

  await testAsync('calcularCosteProyecto: proyección pura determinista (desglose + total)', () => {
    const cp = instance._calcularCosteProyecto('p1', { construccion: 100, operacion: 25, fuentes: 5 });
    assert.strictEqual(cp.coste_total, 130);
    assert.strictEqual(cp.esquema, 'nichos-coste-proyecto-v1');
  });

  await testAsync('agregar: partida negativa → nichos.coste.agregar.failed', async () => {
    const res = await instance.onAgregarRequest({ data: { project_id: 'p2', costes: { construccion: 500, operacion: -10, fuentes: 5 }, request_id: 'A2' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'COSTE_INVALIDO');
    assert.ok(bus.published.some(([n]) => n === 'nichos.coste.agregar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('agregar: sin costes → failed', async () => {
    const res = await instance.onAgregarRequest({ data: { project_id: 'p2', request_id: 'A3' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
    assert.ok(bus.published.some(([n]) => n === 'nichos.coste.agregar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja F2', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event), ['nichos.coste.agregar.request']);
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.coste_imputado', 'nichos.coste.agregar.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

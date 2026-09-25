/**
 * Test unitario — nichos/coste-fuente (J4, reflejo)
 *
 * Cubre: costear un set de fuentes → coste por tipo + total imputable, publica
 * nichos.fuente_costea_imputado; proyección pura determinista de coste por
 * tipo de fuente (consulta/scraping/api); coste_unitario override; payload
 * inválido (sin fuentes / tipo inválido) → failed; y la exactitud de
 * subscribes ↔ handlers / publishes.
 *
 * Ejecutar: node tests/unit/nichos__coste-fuente.test.js
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
  console.log('nichos/coste-fuente — reflejo (J4)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'coste-fuente');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(instance._persist, undefined, 'reflejo: sin PosPersistencia (stateless)');

  await testAsync('costear: set de fuentes → coste por tipo + total, publica nichos.fuente_costea_imputado', async () => {
    const res = await instance.onCostearRequest({ data: {
      project_id: 'p1',
      fuentes: [
        { fuente: 'google', tipo: 'consulta', consultas: 100 },
        { fuente: 'scraper-web', tipo: 'scraping', consultas: 10 },
        { fuente: 'api-cc', tipo: 'api', consultas: 200 }
      ],
      request_id: 'C1'
    } });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.costeado, true);
    assert.strictEqual(res.data.fuentes_costeadas.length, 3);
    // 100*0.01, 10*0.05, 200*0.03
    assert.strictEqual(res.data.fuentes_costeadas[0].coste, 1);
    assert.strictEqual(res.data.fuentes_costeadas[1].coste, 0.5);
    assert.strictEqual(res.data.fuentes_costeadas[2].coste, 6);
    assert.strictEqual(res.data.coste_total, 7.5);
    assert.ok(bus.published.some(([n]) => n === 'nichos.fuente_costea_imputado'), 'publica nichos.fuente_costea_imputado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.fuente.costear.response' && v.request_id === 'C1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('calcularCoste: proyección pura determinista con override de coste_unitario', () => {
    const c = instance._calcularCoste('p1', { fuente: 'api-premium', tipo: 'api', consultas: 10, coste_unitario: 0.1 });
    assert.strictEqual(c.tipo, 'api');
    assert.strictEqual(c.coste_unitario, 0.1);
    assert.strictEqual(c.coste, 1);
    // por defecto por tipo
    const sc = instance._calcularCoste('p1', { fuente: 'scraper', tipo: 'scraping', consultas: 4 });
    assert.strictEqual(sc.coste_unitario, 0.05);
    assert.strictEqual(sc.coste, 0.2);
  });

  await testAsync('agregarAProyecto: sumatoria imputable que alimenta F2', () => {
    const res = instance._agregarAProyecto('p1', [{ coste: 1 }, { coste: 0.5 }, { coste: 6 }]);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.coste_fuentes, 7.5);
  });

  await testAsync('costear: sin fuentes → nichos.fuente.costear.failed', async () => {
    const res = await instance.onCostearRequest({ data: { project_id: 'p2', fuentes: [], request_id: 'C2' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'SIN_FUENTES');
    assert.ok(bus.published.some(([n]) => n === 'nichos.fuente.costear.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('costear: tipo de fuente no costable → failed', async () => {
    const res = await instance.onCostearRequest({ data: { project_id: 'p2', fuentes: [{ fuente: 'x', tipo: 'telefono', consultas: 5 }], request_id: 'C3' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'FUENTE_NO_COSTABLE');
    assert.ok(bus.published.some(([n]) => n === 'nichos.fuente.costear.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja J4', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event), ['nichos.fuente.costear.request']);
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.fuente_costea_imputado', 'nichos.fuente.costear.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

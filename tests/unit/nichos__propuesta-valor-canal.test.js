/**
 * Test unitario — nichos/propuesta-valor-canal (I2, micro-agente fuzzy)
 *
 * Cubre: carga real del loader, RPC proponer (éxito con LLM, fallback reflejo
 * sin LLM, nicho vacío → failed, nicho sin identidad → failed), y la exactitud
 * de subscribes ↔ handlers / publishes de la hoja I2.
 *
 * Ejecutar: node tests/unit/nichos__propuesta-valor-canal.test.js
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

const LLM_OK = { status: 200, data: { content: JSON.stringify({
  copy: 'Pan artesano de masa madre, recien horneado para tu barrio.',
  posicionamiento: 'Calidad local y precio honesto frente a la bollería industrial.',
  promesa: 'Pan de verdad, todos los dias.',
  canal_target: 'barrio de Salamanca'
}) } };

(async () => {
  console.log('nichos/propuesta-valor-canal — micro-agente (I2)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'propuesta-valor-canal');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');

  await testAsync('RPC proponer (éxito con LLM) → publica nichos.copy_propuesto', async () => {
    instance._rpc = async () => LLM_OK;
    const res = await instance.onProponerRequest({ data: { project_id: 'p1', nicho: { producto: 'pan artesano', audiencia: 'barrio', territorio: 'Salamanca' }, request_id: 'R1' } });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.copy.includes('Pan artesano'), 'copy del LLM');
    assert.strictEqual(res.data.fuente, 'fuzzy');
    assert.ok(bus.published.some(([n]) => n === 'nichos.copy_propuesto'), 'publica nichos.copy_propuesto');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.copy.proponer.response' && v.request_id === 'R1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('fallback reflejo cuando el LLM no responde → plantilla determinista', async () => {
    instance._rpc = async () => ({ status: 500, data: {} });
    const res = await instance.onProponerRequest({ data: { project_id: 'p2', nicho: { producto: 'queso curado', audiencia: 'gourmets' }, request_id: 'R2' } });
    assert.strictEqual(res.status, 200, 'no rompe el pipeline si el LLM cae');
    assert.strictEqual(res.data.fuente, 'reflejo');
    assert.ok(res.data.copy.toLowerCase().includes('queso curado'), 'copy armado de los datos del nicho');
    assert.ok(res.data.promesa, 'tiene promesa');
  });

  await testAsync('nicho vacío → nichos.copy.proponer.failed', async () => {
    const res = await instance.onProponerRequest({ data: { project_id: 'p3', request_id: 'R3' } });
    assert.strictEqual(res.status, 400);
    assert.ok(bus.published.some(([n]) => n === 'nichos.copy.proponer.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('nicho sin identidad (sin producto ni audiencia) → failed', async () => {
    const res = await instance.onProponerRequest({ data: { project_id: 'p3', nicho: { territorio: 'x' }, request_id: 'R4' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'NICHO_SIN_IDENTIDAD');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja I2', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), ['nichos.copy.proponer.request', 'project.activated'].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.copy.proponer.failed', 'nichos.copy_propuesto'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

/**
 * Test unitario — nichos/vista-portafolio (K1, custodio con persistencia)
 *
 * Cubre: guardar cruza la salud → publica nichos.vista_portafolio; leer
 * devuelve el DashboardJefe; onSaludActualizada re-agrega la vista tras un
 * evento de F3; lectura sin guardar previo devuelve vacío; project.activated
 * restaura; y la exactitud de subscribes ↔ handlers / publishes de la hoja K1.
 *
 * Ejecutar: node tests/unit/nichos__vista-portafolio.test.js
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
  console.log('nichos/vista-portafolio — custodio con persistencia (K1)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'vista-portafolio');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._persist, 'object', 'custodio: tiene PosPersistencia');
  assert.strictEqual(typeof instance.onProjectActivated, 'function', 'custodio: restaura en project.activated');

  await testAsync('guardar: cruza la salud de un nicho → publica nichos.vista_portafolio', async () => {
    const res = await instance.onGuardarRequest({ data: { project_id: 'p1', nicho: 'pan-artesano', salud_extra: 'GENERA', request_id: 'V1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.vista.total_nichos, 1);
    assert.strictEqual(res.data.vista.en_caja, 1);
    assert.strictEqual(res.data.vista.salud.GENERA, 1);
    assert.ok(bus.published.some(([n]) => n === 'nichos.vista_portafolio'), 'publica nichos.vista_portafolio');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.vista.guardar.response' && v.request_id === 'V1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('guardar: agrega mas nichos y cruza SANGRA/NEUTRO', async () => {
    await instance.onGuardarRequest({ data: { project_id: 'p1', nicho: 'queso', salud_extra: 'SANGRA' } });
    const res = await instance.onGuardarRequest({ data: { project_id: 'p1', nicho: 'salsa', salud_extra: 'NEUTRO' } });
    assert.strictEqual(res.data.vista.total_nichos, 3);
    assert.strictEqual(res.data.vista.salud.SANGRA, 1);
    assert.strictEqual(res.data.vista.salud.NEUTRO, 1);
  });

  await testAsync('leer: devuelve el DashboardJefe (no muta)', async () => {
    const res = await instance.onLeerRequest({ data: { project_id: 'p1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.dashboard_jefe, true);
    assert.strictEqual(res.data.vista.salud.GENERA, 1);
  });

  await testAsync('onSaludActualizada: re-agrega la vista tras un evento de F3', async () => {
    const res = await instance.onSaludActualizada({ data: { project_id: 'p1', nicho: 'pan-artesano', salud: 'SANGRA' } });
    assert.strictEqual(res.status, 200);
    const leida = await instance.onLeerRequest({ data: { project_id: 'p1' } });
    assert.strictEqual(leida.data.vista.salud.GENERA, 0, 'la salud de pan-artesano paso a SANGRA');
    assert.strictEqual(leida.data.vista.salud.SANGRA, 2);
  });

  await testAsync('leer sin guardar previo → vista vacía (total 0)', async () => {
    const res = await instance.onLeerRequest({ data: { project_id: 'pX' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.vista.total_nichos, 0);
  });

  await testAsync('project.activated restaura la vista de otro proyecto', async () => {
    instance._vistas.set('n9', { esquema: 'nichos-vista-portafolio-v1', total_nichos: 2, en_caja: 1, salud: { GENERA: 1, SANGRA: 0, NEUTRO: 1 }, por_estado: { a: 'GENERA', b: 'NEUTRO' } });
    await instance.onProjectActivated({ data: { project_id: 'n9' } });
    const res = await instance.onLeerRequest({ data: { project_id: 'n9' } });
    assert.strictEqual(res.data.vista.total_nichos, 2, 'vista restaurada');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja K1', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), [
      'nichos.salud.actualizada',
      'nichos.vista.guardar.request',
      'nichos.vista.leer.request',
      'project.activated'
    ].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.vista.guardar.failed', 'nichos.vista_portafolio'].sort());
    assert.strictEqual(typeof instance._agregarSalud, 'function', 'proyección _agregarSalud presente');
    assert.strictEqual(typeof instance._leer, 'function', 'proyección _leer presente');
  });

  console.log('\nTodos los tests pasaron.');
})();

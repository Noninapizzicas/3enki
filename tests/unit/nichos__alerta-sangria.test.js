/**
 * Test unitario — nichos/alerta-sangria (F4, puente stateless)
 *
 * Cubre: cuadro que cruza el techo → cruza_techo:true + emite
 * nichos.alerta.sangria con SolicitudDecision; cuadro bajo techo → no cruza y NO
 * emite; sin techo válido → failed; sin canal → failed; project.activated
 * registra el context; y la exactitud de subscribes ↔ handlers / publishes.
 *
 * Ejecutar: node tests/unit/nichos__alerta-sangria.test.js
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
  console.log('nichos/alerta-sangria — puente stateless (F4)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'alerta-sangria');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._emitirDecision, 'function', 'proyección pura presente');

  await testAsync('monitorear: cruza el techo → emite nichos.alerta.sangria con SolicitudDecision', async () => {
    const res = await instance.onMonitorearRequest({ data: {
      project_id: 'n1',
      cuadro: { estado: 'SANGRA', perdida_eur: 400 },
      techo_perdida_eur: 300,
      canal: 'telegram',
      pagador: 'cliente a',
      request_id: 'M1'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.cruza_techo, true);
    assert.ok(res.data.decision, 'arma la SolicitudDecision al cruzar');
    assert.strictEqual(res.data.decision.estado, 'PENDIENTE');
    assert.strictEqual(res.data.decision.decision_esperada, 'MANTENER_A_PERDIDA|MATA_PROYECTO');
    assert.ok(bus.published.some(([n]) => n === 'nichos.alerta.sangria'), 'publica nichos.alerta.sangria');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.alerta.monitorear.response' && v.request_id === 'M1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('monitorear: NO cruza el techo → no emite alerta', async () => {
    const before = bus.published.filter(([n]) => n === 'nichos.alerta.sangria').length;
    const res = await instance.onMonitorearRequest({ data: {
      project_id: 'n1',
      cuadro: { estado: 'NEUTRO', perdida_eur: 50 },
      techo_perdida_eur: 300,
      canal: 'telegram',
      request_id: 'M2'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.cruza_techo, false);
    assert.strictEqual(res.data.decision, undefined, 'no arma decisión sin cruce');
    const after = bus.published.filter(([n]) => n === 'nichos.alerta.sangria').length;
    assert.strictEqual(after, before, 'sin cruce NO publica la alerta');
  });

  await testAsync('monitorear: sin techo válido → failed', async () => {
    const res = await instance.onMonitorearRequest({ data: { project_id: 'n1', cuadro: { perdida_eur: 5 }, canal: 'telegram', request_id: 'M3' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
    assert.ok(bus.published.some(([n]) => n === 'nichos.alerta.monitorear.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('monitorear: sin canal → failed', async () => {
    const res = await instance.onMonitorearRequest({ data: { project_id: 'n1', cuadro: { perdida_eur: 9 }, techo_perdida_eur: 300, request_id: 'M4' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
  });

  await testAsync('project.activated registra el project_id y se usa de contexto', async () => {
    const r = await instance.onProjectActivated({ data: { project_id: 'p7' } });
    assert.strictEqual(r.status, 200);
    const res = await instance.onMonitorearRequest({ data: { cuadro: { perdida_eur: 500 }, techo_perdida_eur: 300, canal: 'telegram', request_id: 'M5' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.project_id, 'p7');
    assert.strictEqual(res.data.cruza_techo, true);
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja F4', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), [
      'nichos.alerta.monitorear.request',
      'project.activated'
    ].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.alerta.monitorear.failed', 'nichos.alerta.sangria'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

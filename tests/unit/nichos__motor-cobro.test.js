/**
 * Test unitario — nichos/motor-cobro (E3, reflejo stateless)
 *
 * Cubre: cobro EFECTIVO (transferencia) → nichos.cobro.ejecutado; cobro
 * COMPROMETIDO (suscripcion) → tipo COMPROMETIDO; importe <= 0 → failed;
 * plataforma no declarada → failed; pagador vacío → failed; project.activated
 * registra el project_id; y la exactitud de subscribes ↔ handlers / publishes.
 *
 * Ejecutar: node tests/unit/nichos__motor-cobro.test.js
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
  console.log('nichos/motor-cobro — reflejo stateless (E3)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'motor-cobro');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._distinguirEfectivoDePromesa, 'function', 'proyección pura presente');

  await testAsync('ejecutar: cobro EFECTIVO (transferencia) → publica nichos.cobro.ejecutado', async () => {
    const res = await instance.onEjecutarRequest({ data: { project_id: 'n1', importe: 120, pagador: 'cliente a', plataforma: 'transferencia', request_id: 'R1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.cobro.tipo, 'EFECTIVO');
    assert.strictEqual(res.data.cobro.importe, 120);
    assert.strictEqual(res.data.cobro.registrado_por, 'MOTOR_COBRO');
    assert.ok(bus.published.some(([n]) => n === 'nichos.cobro.ejecutado'), 'publica nichos.cobro.ejecutado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.motor-cobro.ejecutar.response' && v.request_id === 'R1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('ejecutar: cobro COMPROMETIDO (suscripción) → tipo COMPROMETIDO', async () => {
    const res = await instance.onEjecutarRequest({ data: { project_id: 'n1', importe: 20, pagador: 'cliente b', plataforma: 'suscripcion', request_id: 'R2' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.cobro.tipo, 'COMPROMETIDO');
  });

  await testAsync('ejecutar: importe <= 0 → failed', async () => {
    const res = await instance.onEjecutarRequest({ data: { project_id: 'n1', importe: 0, pagador: 'cliente a', plataforma: 'stripe', request_id: 'R3' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
    assert.ok(bus.published.some(([n]) => n === 'nichos.cobro.ejecutar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('ejecutar: plataforma no declarada → failed', async () => {
    const res = await instance.onEjecutarRequest({ data: { project_id: 'n1', importe: 50, pagador: 'cliente a', plataforma: 'bitcoin', request_id: 'R4' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
  });

  await testAsync('ejecutar: pagador vacío → failed', async () => {
    const res = await instance.onEjecutarRequest({ data: { project_id: 'n1', importe: 50, pagador: '  ', plataforma: 'efectivo', request_id: 'R5' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
  });

  await testAsync('project.activated registra el project_id', async () => {
    const res = await instance.onProjectActivated({ data: { project_id: 'p7' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(instance.project_id, 'p7');
    // sin project_id explícito usa el contexto
    const cobro = await instance.onEjecutarRequest({ data: { importe: 10, pagador: 'cliente c', plataforma: 'efectivo', request_id: 'R6' } });
    assert.strictEqual(cobro.status, 200);
    assert.strictEqual(cobro.data.project_id, 'p7');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja E3', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), [
      'nichos.motor-cobro.ejecutar.request',
      'project.activated'
    ].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.cobro.ejecutado', 'nichos.cobro.ejecutar.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

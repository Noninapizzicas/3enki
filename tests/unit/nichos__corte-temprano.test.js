/**
 * Test unitario — nichos/corte-temprano (C6, reflejo determinista stateless)
 *
 * Cubre: carga real del loader, RPC evaluar (NO_VIABLE → corte DURO, NUNCA
 * pasa a construccion; VIABLE → pasa con control; PUENTE → pendiente, no corta
 * ni avanza solo), veredicto vacío → failed, y que cada flujo cierra su círculo.
 *
 * Ejecutar: node tests/unit/nichos__corte-temprano.test.js
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
  console.log('nichos/corte-temprano — reflejo determinista stateless (C6)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'corte-temprano');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.ok(!instance._persist, 'reflejo stateless: sin PosPersistencia');

  await testAsync('NO_VIABLE → corte DURO: no pasa a construcción, se emite CORTADO', async () => {
    const res = await instance.onEvaluarRequest({ data: {
      project_id: 'p1', request_id: 'C1',
      veredicto: { veredicto: 'NO_VIABLE', confianza: 0.85, motivo: 'demanda por debajo del umbral', candidato: 'salsa-picante' },
      nicho: 'salsa-picante'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.pasa_a_construccion, false, 'NO_VIABLE no avanza');
    assert.strictEqual(res.data.cortado, true);
    assert.strictEqual(res.data.decision, 'CORTADO');
    assert.ok(bus.published.some(([n]) => n === 'nichos.corte.aplicado'), 'publica nichos.corte.aplicado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.corte.evaluar.response' && v.request_id === 'C1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('VIABLE → pasa a construcción con control (no se corta)', async () => {
    const res = await instance.onEvaluarRequest({ data: { project_id: 'p2', veredicto: { veredicto: 'VIABLE', confianza: 0.8, candidato: 'queso-artesanal' } } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.pasa_a_construccion, true);
    assert.strictEqual(res.data.cortado, false);
    assert.strictEqual(res.data.decision, 'PASA_A_CONSTRUCCION');
  });

  await testAsync('PUENTE → pendiente: ni corta ni avanza solo (espera decisión humana)', async () => {
    const res = await instance.onEvaluarRequest({ data: { project_id: 'p3', veredicto: { veredicto: 'PUENTE', motivo: 'sin criterio' } } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.decision, 'PENDIENTE_DECISION');
    assert.strictEqual(res.data.cortado, false, 'no corta solo');
    assert.strictEqual(res.data.pasa_a_construccion, null, 'no avanza solo: espera D2/K2');
  });

  await testAsync('veredicto vacío → nichos.corte.evaluar.failed', async () => {
    const res = await instance.onEvaluarRequest({ data: { project_id: 'p4', veredicto: null, request_id: 'C4' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'VEREDICTO_INVALIDO');
    assert.ok(bus.published.some(([n]) => n === 'nichos.corte.evaluar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja C6', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event), ['nichos.corte.evaluar.request']);
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.corte.aplicado', 'nichos.corte.evaluar.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

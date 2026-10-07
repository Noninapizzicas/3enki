/**
 * Test unitario — nichos/normalizacion-semilla (A2, micro-agente fuzzy)
 *
 * Cubre: carga real del loader, RPC normalizar (éxito con LLM, fallback reflejo
 * sin LLM, semilla vacía → failed), y que cada flujo cierra su círculo con su
 * par de fallo.
 *
 * Ejecutar: node tests/unit/nichos__normalizacion-semilla.test.js
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

// Stub de _rpc que devuelve un llm.complete válido.
const LLM_OK = { status: 200, data: { content: JSON.stringify({ intenciones: [
  { tipo: 'producto', producto: 'salsa picante artesanal', audiencia: 'restaurantes', lugar: null, confianza: 0.9 },
  { tipo: 'producto', producto: 'salsa picante de exportacion', audiencia: null, lugar: 'mercado exterior', confianza: 0.6 }
] }) } };

(async () => {
  console.log('nichos/normalizacion-semilla — micro-agente (A2)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'normalizacion-semilla');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');

  await testAsync('RPC normalizar + publica nichos.semilla.normalizada (éxito con LLM)', async () => {
    instance._rpc = async () => LLM_OK;
    const res = await instance.onNormalizarRequest({ data: { project_id: 'p1', semilla: 'quiero vender salsa picante a restaurantes', request_id: 'R1' } });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data.intenciones) && res.data.intenciones.length === 2, '2 intenciones desambiguadas');
    assert.strictEqual(res.data.intenciones[0].confianza, 0.9);
    // flujo cierra el círculo: evento de dominio + response correlado
    assert.ok(bus.published.some(([n]) => n === 'nichos.semilla.normalizada'), 'publica nichos.semilla.normalizada');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.semilla.normalizar.response' && v.request_id === 'R1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('fallback reflejo cuando el LLM no responde', async () => {
    instance._rpc = async () => ({ status: 500, data: {} });
    const res = await instance.onNormalizarRequest({ data: { project_id: 'p2', semilla: 'crear cerveza artesanal en madrid', request_id: 'R2' } });
    assert.strictEqual(res.status, 200, 'no rompe el pipeline si el LLM cae');
    assert.ok(res.data.intenciones.length >= 1, 'reflejo garantiza >= 1 intención');
    assert.strictEqual(res.data.intenciones[0].lugar, 'madrid', 'señal de territorio detectada por reglas');
  });

  await testAsync('semilla vacía → nichos.semilla.normalizar.failed', async () => {
    instance._rpc = async () => LLM_OK;
    const res = await instance.onNormalizarRequest({ data: { project_id: 'p3', semilla: '   ', request_id: 'R3' } });
    assert.strictEqual(res.status, 400);
    assert.ok(bus.published.some(([n]) => n === 'nichos.semilla.normalizar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja A2', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event), ['nichos.semilla.normalizar.request']);
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.semilla.normalizada', 'nichos.semilla.normalizar.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

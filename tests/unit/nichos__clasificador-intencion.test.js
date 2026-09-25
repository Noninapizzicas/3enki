/**
 * Test unitario — nichos/clasificador-intencion (G3, micro-agente fuzzy)
 *
 * Cubre: carga real del loader, RPC clasificar (éxito con LLM, fallback reflejo
 * sin LLM, mensaje vacío → failed), los tres tipos, y la exactitud de
 * subscribes ↔ handlers / publishes de la hoja G3.
 *
 * Ejecutar: node tests/unit/nichos__clasificador-intencion.test.js
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

const LLM_DECISION = { status: 200, data: { content: JSON.stringify({ tipo: 'DECISION', confianza: 0.9, motivo: 'responde al gate' }) } };
const LLM_SEMILLA = { status: 200, data: { content: '{\n"tipo": "SEMILLA",\n"confianza": 0.8\n}' } };

(async () => {
  console.log('nichos/clasificador-intencion — micro-agente (G3)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'clasificador-intencion');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');

  await testAsync('RPC clasificar (SEMILLA por fuzzy) + publica nichos.intencion.clasificada', async () => {
    instance._rpc = async () => LLM_SEMILLA;
    const res = await instance.onClasificarRequest({ data: { project_id: 'p1', mensaje: 'vender pan artesano', request_id: 'R1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.tipo, 'SEMILLA');
    assert.strictEqual(res.data.confianza, 0.8);
    assert.ok(bus.published.some(([n]) => n === 'nichos.intencion.clasificada'), 'publica nichos.intencion.clasificada');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.intencion.clasificar.response' && v.request_id === 'R1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('RPC clasificar (DECISION por fuzzy) → tipo DECISION', async () => {
    instance._rpc = async () => LLM_DECISION;
    const res = await instance.onClasificarRequest({ data: { project_id: 'p1', mensaje: 'si, apruebo operar el nicho', request_id: 'R2' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.tipo, 'DECISION');
  });

  await testAsync('fallback reflejo cuando el LLM no responde → clase por reglas (DECISION)', async () => {
    instance._rpc = async () => ({ status: 500, data: {} });
    const res = await instance.onClasificarRequest({ data: { project_id: 'p2', mensaje: 'adelante, cobra ese cliente', request_id: 'R3' } });
    assert.strictEqual(res.status, 200, 'no rompe el canal si el LLM cae');
    assert.strictEqual(res.data.tipo, 'DECISION', 'marcador de decision detectado por reglas');
    assert.strictEqual(res.data.senales[0].fuente, 'reflejo');
  });

  await testAsync('fallback reflejo: pregunta → CONSULTA', async () => {
    instance._rpc = async () => null;
    const res = await instance.onClasificarRequest({ data: { project_id: 'p2', mensaje: '¿cómo va el pipeline?', request_id: 'R4' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.tipo, 'CONSULTA');
  });

  await testAsync('mensaje vacío → nichos.intencion.clasificar.failed', async () => {
    instance._rpc = async () => LLM_DECISION;
    const res = await instance.onClasificarRequest({ data: { project_id: 'p3', mensaje: '   ', request_id: 'R5' } });
    assert.strictEqual(res.status, 400);
    assert.ok(bus.published.some(([n]) => n === 'nichos.intencion.clasificar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja G3', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), ['nichos.intencion.clasificar.request', 'project.activated'].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.intencion.clasificada', 'nichos.intencion.clasificar.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

/**
 * Test unitario — nichos/sondeo-territorio (B1, micro-agente fuzzy)
 *
 * Cubre: carga real del loader, RPC sondear (éxito con LLM, fallback reflejo
 * sin LLM, territorio vacío → failed), y que cada flujo cierra su círculo con
 * su par de fallo.
 *
 * Ejecutar: node tests/unit/nichos__sondeo-territorio.test.js
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

// Stub de _rpc para llm.complete que devuelve candidatos con señal de demanda.
const LLM_OK = { status: 200, data: { content: JSON.stringify({ candidatos: [
  { producto: 'salsa picante artesanal para hostelería', audiencia: 'restaurantes', lugar: 'madrid', senal_de_demanda: 0.9, fuente: 'stub' },
  { producto: 'envases para salsa artesanal', audiencia: 'productores', lugar: null, senal_de_demanda: 0.5, fuente: 'stub' }
] }) } };

// Stub de _rpc para puerto-fuente-datos: consulta → dataset con trozos que apoyan la demanda.
async function rpcStub(evento, payload) {
  if (evento === 'nichos.fuente.consultar.request') {
    return { status: 200, data: { fuente: 'stub', dataset: ['bares buscan salsa picante artesanal', 'distribuidores de condimentos'] } };
  }
  if (evento === 'llm.complete.request') return LLM_OK;
  return null;
}

(async () => {
  console.log('nichos/sondeo-territorio — micro-agente (B1)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'sondeo-territorio');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');

  await testAsync('RPC sondear + produce candidatos/señales (éxito)', async () => {
    instance._rpc = rpcStub;
    const res = await instance.onSondearRequest({ data: { project_id: 'p1', territorio: { producto: 'salsa picante', audiencia: 'restaurantes' }, request_id: 'R1' } });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data.candidatos) && res.data.candidatos.length === 2, '2 candidatos con señal de demanda');
    assert.ok(res.data.candidatos.every(c => c.senal_de_demanda > 0), 'todo candidato tiene señal de demanda (>0)');
    assert.ok(Array.isArray(res.data.barrido) && res.data.barrido.length === 1, '1 fuente barrida');
    // flujo cierra el círculo: evento de dominio + response correlado
    assert.ok(bus.published.some(([n]) => n === 'nichos.territorio.sondeado'), 'publica nichos.territorio.sondeado');
    const canEvts = bus.published.filter(([n]) => n === 'nichos.candidato.encontrado');
    assert.strictEqual(canEvts.length, 2, 'publica 1 nichos.candidato.encontrado por candidato');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.territorio.sondear.response' && v.request_id === 'R1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('fallback reflejo de heurística cuando el LLM no devuelve candidatos', async () => {
    instance._rpc = async (evento, payload) => {
      if (evento === 'nichos.fuente.consultar.request') {
        return { status: 200, data: { fuente: 'stub', dataset: ['restaurantes buscan salsa artesanal'] } };
      }
      if (evento === 'llm.complete.request') return { status: 500, data: {} };
      return null;
    };
    const res = await instance.onSondearRequest({ data: { project_id: 'p2', territorio: { producto: 'salsa picante', audiencia: 'restaurantes' } } });
    assert.strictEqual(res.status, 200, 'no rompe el pipeline si el LLM cae');
    assert.ok(res.data.candidatos.length >= 1, 'heurística reflejo deriva >= 1 candidato');
    assert.strictEqual(res.data.candidatos[0].producto, 'salsa picante', 'candidato derivado del territorio');
  });

  await testAsync('territorio vacío → nichos.territorio.sondear.failed', async () => {
    instance._rpc = rpcStub;
    const res = await instance.onSondearRequest({ data: { project_id: 'p3', territorio: null, request_id: 'R3' } });
    assert.strictEqual(res.status, 400);
    assert.ok(bus.published.some(([n]) => n === 'nichos.territorio.sondear.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja B1', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event), ['nichos.territorio.sondear.request']);
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.candidato.encontrado', 'nichos.territorio.sondear.failed', 'nichos.territorio.sondeado'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

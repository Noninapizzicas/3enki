/**
 * Test unitario — nichos/camino-encontrar-construir (C4, micro-agente hibrido)
 *
 * Cubre: carga real del loader, RPC decidir (ENCONTRAR si hay demanda real +
 * capacidades existentes; CONSTRUIR si falta capacidad; fallback reflejo sin LLM;
 * nicho vacio → failed), y el riesgo ALTO → sube SolicitudDecision
 * (nichos.gate.solicitado) y NO decide solo. Cada flujo cierra su circulo.
 *
 * Ejecutar: node tests/unit/nichos__camino-encontrar-construir.test.js
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

const LLM_ENCONTRAR = { status: 200, data: { content: JSON.stringify({ camino: 'ENCONTRAR', riesgo: 0.2, motivo: 'demanda real y capacidades existentes' }) } };
const NICH0 = { producto: 'salsa picante', audiencia: 'restaurantes' };

(async () => {
  console.log('nichos/camino-encontrar-construir — micro-agente hibrido (C4)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'camino-encontrar-construir');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');

  await testAsync('decidir: ENCONTRAR con demanda real + capacidades existentes (éxito con LLM)', async () => {
    instance._rpc = async (evento) => (evento === 'llm.complete.request' ? LLM_ENCONTRAR : null);
    const res = await instance.onDecidirRequest({ data: {
      project_id: 'p1', nicho: NICH0,
      veredicto: 'VIABLE',
      capacidades: { capacidades_disponibles: [{ nombre: 'landing' }], capacidades_faltantes: [] },
      riesgo: 0.1, request_id: 'D1'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.camino, 'ENCONTRAR');
    assert.strictEqual(res.data.riesgo_alto, false, 'riesgo bajo no sube decision');
    assert.ok(bus.published.some(([n]) => n === 'nichos.camino.decidido'), 'publica nichos.camino.decidido');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.camino.decidir.response' && v.request_id === 'D1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('fallback reflejo: demanda real pero falta capacidad → CONSTRUIR (aunque el LLM caiga)', async () => {
    instance._rpc = async (evento) => (evento === 'llm.complete.request' ? { status: 500, data: {} } : null);
    const res = await instance.onDecidirRequest({ data: {
      project_id: 'p2', nicho: NICH0, veredicto: 'VIABLE',
      capacidades: { capacidades_disponibles: [], capacidades_faltantes: [{ nombre: 'landing-market' }] }
    } });
    assert.strictEqual(res.status, 200, 'no rompe el pipeline si el LLM cae');
    assert.strictEqual(res.data.camino, 'CONSTRUIR', 'falta capacidad → se construye');
    assert.ok(res.data.motivo.trim(), 'lleva motivo');
  });

  await testAsync('riesgo ALTO → sube SolicitudDecision (nichos.gate.solicitado) y NO decide solo', async () => {
    instance._rpc = rpcNull;
    const res = await instance.onDecidirRequest({ data: {
      project_id: 'p3', nicho: NICH0,
      capacidades: { capacidades_disponibles: [], capacidades_faltantes: [] }, riesgo: 0.9
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.riesgo_alto, true, 'riesgo alto marcado');
    const gate = bus.published.find(([n]) => n === 'nichos.gate.solicitado');
    assert.ok(gate, 'emite la SolicitudDecision');
    assert.strictEqual(gate[1].tipo, 'CAMINO_CONSTRUIR_ALTO_RIESGO');
    assert.strictEqual(gate[1].estado, 'PENDIENTE', 'queda PENDIENTE, no la resuelve el sistema');
  });

  await testAsync('sin datos suficientes → PUENTE honesto (no asume)', async () => {
    instance._rpc = rpcNull;
    const res = await instance.onDecidirRequest({ data: { project_id: 'p4', nicho: NICH0 } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.camino, 'PUENTE', 'sin datos no decide por defecto');
    assert.strictEqual(res.data.riesgo_alto, true, 'PUENTE cuenta como riesgo alto → sube decision');
  });

  await testAsync('nicho vacio → nichos.camino.decidir.failed', async () => {
    instance._rpc = rpcNull;
    const res = await instance.onDecidirRequest({ data: { project_id: 'p5', nicho: null, request_id: 'D5' } });
    assert.strictEqual(res.status, 400);
    assert.ok(bus.published.some(([n]) => n === 'nichos.camino.decidir.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja C4', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event), ['nichos.camino.decidir.request']);
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.camino.decidido', 'nichos.camino.decidir.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

async function rpcNull() { return null; }

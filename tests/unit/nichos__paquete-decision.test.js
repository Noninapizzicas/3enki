/**
 * Test unitario — nichos/paquete-decision (H1, micro-agente hibrido)
 *
 * Cubre: carga real del loader, RPC construir (exito con LLM, fallback reflejo
 * sin LLM, nicho vacio → failed), que el paquete SIEMPRE produce datos
 * ESTRUCTURADOS (nicho, evidencia, riesgo, alternativa, sintesis), jamas un
 * texto suelto, y que cada flujo cierra su circulo con su par de fallo.
 *
 * Ejecutar: node tests/unit/nichos__paquete-decision.test.js
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

// Stub de _rpc para llm.complete que devuelve la sintesis (JSON).
const LLM_OK = { status: 200, data: { content: JSON.stringify({
  sintesis: 'Se propone operar el nicho: hay demanda y competencia moderada; el riesgo de precios estrechos exige un angulo de especializacion; la alternativa es construir la capacidad de fabricacion propia.'
}) } };

(async () => {
  console.log('nichos/paquete-decision — micro-agente hibrido (H1)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'paquete-decision');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');

  await testAsync('RPC construir + produce un paquete estructurado (éxito con LLM)', async () => {
    instance._rpc = async (evento) => {
      if (evento === 'llm.complete.request') return LLM_OK;
      return null;
    };
    const res = await instance.onConstruirRequest({
      data: {
        project_id: 'p1',
        nicho: { producto: 'salsa picante artesanal', tipo: 'producto', id: 'n1' },
        evidencia: ['demanda de 1er orden alta', 'competencia moderada'],
        riesgo: ['precios estrechos'],
        alternativa: ['construir la capacidad de fabricacion propia'],
        request_id: 'R1'
      }
    });
    assert.strictEqual(res.status, 200);
    const data = res.data;
    // El paquete produce datos ESTRUCTURADOS, jamas un texto suelto:
    assert.strictEqual(data.nicho, 'salsa picante artesanal', 'nicho del paquete');
    assert.strictEqual(data.tipo_nicho, 'producto');
    assert.deepStrictEqual(data.evidencia, ['demanda de 1er orden alta', 'competencia moderada'], 'evidencia normalizada');
    assert.deepStrictEqual(data.riesgo, ['precios estrechos'], 'riesgo normalizado');
    assert.deepStrictEqual(data.alternativa, ['construir la capacidad de fabricacion propia'], 'alternativa normalizada');
    assert.ok(typeof data.sintesis === 'string' && data.sintesis.trim(), 'sintesis presente');
    assert.strictEqual(data.autocxplicado, true);
    assert.strictEqual(data.construido, true);
    // flujo cierra el circulo: evento de dominio + response correlado
    assert.ok(bus.published.some(([n]) => n === 'nichos.paquete_construido'), 'publica nichos.paquete_construido');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.paquete.construir.response' && v.request_id === 'R1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('fallback reflejo de sintesis cuando el LLM no responde', async () => {
    instance._rpc = async (evento) => {
      if (evento === 'llm.complete.request') return { status: 500, data: {} };
      return null;
    };
    const res = await instance.onConstruirRequest({
      data: { project_id: 'p2', nicho: { producto: 'salsa picante', id: 'n2' }, evidencia: ['hay demanda'] }
    });
    assert.strictEqual(res.status, 200, 'no rompe el pipeline si el LLM cae');
    assert.ok(res.data.sintesis && res.data.sintesis.trim(), 'sintesis reflejo deriva un resumen autocxplicado');
    assert.ok(res.data.sintesis.includes('Se propone operar el nicho "salsa picante"'), 'sintesis autocxplicada del nicho');
    // sigue siendo estructurado: el fallback NUNCA suelta un texto a secas
    assert.ok(Array.isArray(res.data.evidencia) && res.data.riesgo && res.data.alternativa, 'mantiene la celula estructurada');
  });

  await testAsync('nicho vacio → nichos.paquete.construir.failed', async () => {
    const res = await instance.onConstruirRequest({ data: { project_id: 'p3', nicho: null, request_id: 'R3' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'NICHO_INVALIDO');
    assert.ok(bus.published.some(([n]) => n === 'nichos.paquete.construir.failed'), 'cierra el circulo con el par de fallo');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja H1', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event), ['nichos.paquete.construir.request']);
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.paquete.construir.failed', 'nichos.paquete_construido'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

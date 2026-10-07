/**
 * Test unitario — nichos/estudio-competencia (E1, micro-agente hibrido)
 *
 * Cubre: carga real del loader, RPC analizar (exito con LLM, fallback reflejo
 * sin LLM, nicho vacio → failed), que el estudio SIEMPRE produce datos
 * ESTRUCTURADOS (competidores, metricas, conclusion_diferenciacion), jamas un
 * texto suelto, y que cada flujo cierra su circulo con su par de fallo.
 *
 * Ejecutar: node tests/unit/nichos__estudio-competencia.test.js
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

// Stub de _rpc para llm.complete que devuelve una conclusion (parrafo).
const LLM_OK = { status: 200, data: { content: JSON.stringify({
  conclusion: 'Hay varios competidores de salsa picante artesanal; un angulo de especializacion por barrio permite entrar sin competir de frente.'
}) } };

// Stub de _rpc para puerto-fuente-datos: consulta → dataset con competidores.
async function rpcStub(evento, payload) {
  if (evento === 'nichos.fuente.consultar.request') {
    return { status: 200, data: {
      fuente: 'stub',
      dataset: [
        { nombre: 'La Botana', intensidad: 0.8, fortaleza: 'volumen' },
        { nombre: 'Salsa Roja', intensidad: 0.6, fortaleza: 'precio' }
      ]
    } };
  }
  if (evento === 'llm.complete.request') return LLM_OK;
  return null;
}

(async () => {
  console.log('nichos/estudio-competencia — micro-agente hibrido (E1)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'estudio-competencia');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');

  await testAsync('RPC analizar + produce un estudio estructurado (éxito con LLM)', async () => {
    instance._rpc = rpcStub;
    const res = await instance.onAnalizarRequest({ data: { project_id: 'p1', nicho: { producto: 'salsa picante artesanal', id: 'n1' }, request_id: 'R1' } });
    assert.strictEqual(res.status, 200);
    const data = res.data;
    // El estudio produce datos ESTRUCTURADOS, jamas un texto suelto:
    assert.ok(Array.isArray(data.competidores) && data.competidores.length > 0, 'competidores no vacio');
    assert.strictEqual(data.competidores[0].nombre, 'La Botana', 'competidor normalizado');
    assert.ok(data.metricas && typeof data.metricas === 'object', 'metricas es objeto estructurado');
    assert.strictEqual(typeof data.metricas.competidores_observados, 'number', 'competidores_observados numerico');
    assert.strictEqual(typeof data.metricas.grado_competencia, 'number', 'grado_competencia numerico');
    assert.strictEqual(typeof data.metricas.saturado, 'boolean', 'saturado booleano');
    assert.strictEqual(typeof data.conclusion_diferenciacion, 'string', 'conclusion_diferenciacion es string');
    // flujo cierra el circulo: evento de dominio + response correlado
    assert.ok(bus.published.some(([n]) => n === 'nichos.competencia.analizado'), 'publica nichos.competencia.analizado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.competencia.analizar.response' && v.request_id === 'R1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('fallback reflejo de conclusion cuando el LLM no responde', async () => {
    instance._rpc = async (evento) => {
      if (evento === 'nichos.fuente.consultar.request') {
        return { status: 200, data: { fuente: 'stub', dataset: [{ nombre: 'La Botana', intensidad: 0.8 }] } };
      }
      if (evento === 'llm.complete.request') return { status: 500, data: {} };
      return null;
    };
    const res = await instance.onAnalizarRequest({ data: { project_id: 'p2', nicho: { producto: 'salsa picante', id: 'n2' } } });
    assert.strictEqual(res.status, 200, 'no rompe el pipeline si el LLM cae');
    assert.ok(res.data.conclusion_diferenciacion && res.data.conclusion_diferenciacion.trim(), 'conclusion reflejo deriva un parrafo');
    // sigue siendo estructurado: el fallback NUNCA suelta un texto a secas
    assert.ok(Array.isArray(res.data.competidores) && res.data.metricas, 'mantiene datos estructurados');
  });

  await testAsync('nicho vacio → nichos.competencia.analizar.failed', async () => {
    instance._rpc = rpcStub;
    const res = await instance.onAnalizarRequest({ data: { project_id: 'p3', nicho: null, request_id: 'R3' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'NICHO_INVALIDO');
    assert.ok(bus.published.some(([n]) => n === 'nichos.competencia.analizar.failed'), 'cierra el circulo con el par de fallo');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja E1', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event), ['nichos.competencia.analizar.request']);
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.competencia.analizado', 'nichos.competencia.analizar.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

/**
 * Test unitario — nichos/estudio-demanda (C1, micro-agente hibrido)
 *
 * Cubre: carga real del loader, RPC medir (exito con LLM, fallback reflejo
 * sin LLM, candidato vacio → failed), que el estudio SIEMPRE produce datos
 * ESTRUCTURADOS (demanda_1er_orden, disposicion_pagar, senales), NUNCA un
 * texto suelto, y que cada flujo cierra su circulo con su par de fallo.
 *
 * Ejecutar: node tests/unit/nichos__estudio-demanda.test.js
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

// Stub de _rpc para llm.complete que devuelve una conclusion de mercado (parrafo).
const LLM_OK = { status: 200, data: { content: JSON.stringify({
  conclusion: 'El mercado busca principalmente restaurantes que buscan salsa picante artesanal. La demanda de 1er orden es alta y la disposicion a pagar entre 35 y 80 EUR sostiene la viabilidad del nicho.'
}) } };

// Stub de _rpc para puerto-fuente-datos: consulta → dataset con trozos que apoyan la demanda.
async function rpcStub(evento, payload) {
  if (evento === 'nichos.fuente.consultar.request') {
    return { status: 200, data: {
      fuente: 'stub',
      dataset: ['bares buscan salsa picante artesanal a 45 EUR', 'distribuidores de condimentos a 60 EUR']
    } };
  }
  if (evento === 'llm.complete.request') return LLM_OK;
  return null;
}

(async () => {
  console.log('nichos/estudio-demanda — micro-agente hibrido (C1)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'estudio-demanda');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');

  await testAsync('RPC medir + produce un estudio estructurado (éxito con LLM)', async () => {
    instance._rpc = rpcStub;
    const res = await instance.onMedirRequest({ data: { project_id: 'p1', candidato: { producto: 'salsa picante', audiencia: 'restaurantes' }, request_id: 'R1' } });
    assert.strictEqual(res.status, 200);
    const data = res.data;
    // El estudio produce datos ESTRUCTURADOS, jamas un texto suelto:
    assert.ok(data.demanda_1er_orden && typeof data.demanda_1er_orden === 'object', 'demanda_1er_orden es objeto estructurado');
    assert.strictEqual(typeof data.demanda_1er_orden.fuerza_demanda, 'number', 'fuerza_demanda numerica');
    assert.ok(Array.isArray(data.demanda_1er_orden.quienes_buscan) && data.demanda_1er_orden.quienes_buscan.length, 'quienes_buscan no vacio');
    assert.strictEqual(typeof data.demanda_1er_orden.volumen_busqueda, 'number', 'volumen_busqueda numerico');
    assert.ok(data.disposicion_pagar && typeof data.disposicion_pagar === 'object', 'disposicion_pagar es objeto estructurado');
    assert.strictEqual(typeof data.disposicion_pagar.precio_medio_eur, 'number', 'precio_medio_eur numerico');
    assert.strictEqual(typeof data.disposicion_pagar.rango_min_eur, 'number', 'rango_min numerico');
    assert.strictEqual(typeof data.disposicion_pagar.rango_max_eur, 'number', 'rango_max numerico');
    assert.strictEqual(data.disposicion_pagar.moneda, 'EUR', 'moneda EUR');
    assert.ok(Array.isArray(data.senales) && data.senales.length, 'senales no vacio');
    assert.strictEqual(typeof data.conclusion_mercado, 'string', 'conclusion_mercado es string');
    assert.ok(data.disposicion_pagar.rango_max_eur >= data.disposicion_pagar.rango_min_eur, 'rango no invertido');
    // evidencia de precio: el stub incluye precios en el dataset → rango mayor que cotas base
    assert.ok(data.disposicion_pagar.precio_medio_eur > 45, 'usa precios de la evidencia (>45: pico del dataset)');
    // flujo cierra el circulo: evento de dominio + response correlado
    assert.ok(bus.published.some(([n]) => n === 'nichos.estudio.medido'), 'publica nichos.estudio.medido');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.estudio.medir.response' && v.request_id === 'R1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('fallback reflejo de conclusion cuando el LLM no responde', async () => {
    instance._rpc = async (evento) => {
      if (evento === 'nichos.fuente.consultar.request') {
        return { status: 200, data: { fuente: 'stub', dataset: ['restaurantes buscan salsa artesanal'] } };
      }
      if (evento === 'llm.complete.request') return { status: 500, data: {} };
      return null;
    };
    const res = await instance.onMedirRequest({ data: { project_id: 'p2', candidato: { producto: 'salsa picante', audiencia: 'restaurantes' } } });
    assert.strictEqual(res.status, 200, 'no rompe el pipeline si el LLM cae');
    assert.ok(res.data.conclusion_mercado && res.data.conclusion_mercado.trim(), 'conclusion reflejo deriva un parrafo');
    // sigue siendo estructurado: el fallback NUNCA suelta un texto a secas
    assert.ok(res.data.demanda_1er_orden && res.data.disposicion_pagar, 'mantiene datos estructurados');
  });

  await testAsync('candidato vacio → nichos.estudio.medir.failed', async () => {
    instance._rpc = rpcStub;
    const res = await instance.onMedirRequest({ data: { project_id: 'p3', candidato: null, request_id: 'R3' } });
    assert.strictEqual(res.status, 400);
    assert.ok(bus.published.some(([n]) => n === 'nichos.estudio.medir.failed'), 'cierra el circulo con el par de fallo');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja C1', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event), ['nichos.estudio.medir.request']);
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.estudio.medido', 'nichos.estudio.medir.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

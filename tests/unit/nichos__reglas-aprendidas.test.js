/**
 * Test unitario — nichos/reglas-aprendidas (C7, micro-agente fuzzy)
 *
 * Cubre: carga real del loader, RPC recalibrar (éxito con LLM, fallback reflejo
 * sin LLM, resultado no interpretable → failed), fire-and-forget desde
 * nichos.salud.actualizada (GENERA -> COBRO recalibra) y nichos.cobro_registrado
 * (solo EFECTIVO recalibra; COMPROMETIDO es promesa y no aprende), y que cada
 * flujo cierra su círculo con su par de fallo.
 *
 * Ejecutar: node tests/unit/nichos__reglas-aprendidas.test.js
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

const UMBRAL = { project_id: 'n1', umbral_ingresos: 200, minimos_demanda: { numero_busquedas: 500, contactos_semana: 25 } };

const LLM_COBRO = { status: 200, data: { content: JSON.stringify({ delta: { umbral_ingresos: 15 }, minimos_demanda: {}, confianza: 0.8 }) } };
const LLM_SANGRA = { status: 200, data: { content: JSON.stringify({ delta: { umbral_ingresos: -20 }, minimos_demanda: {}, confianza: 0.7 }) } };

(async () => {
  console.log('nichos/reglas-aprendidas — micro-agente (C7)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'reglas-aprendidas');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(instance._persist, undefined, 'micro-agente: sin PosPersistencia (stateless)');

  await testAsync('recalibrar COBRÓ con LLM → recalibra y publica nichos.umbral.recalibrado', async () => {
    instance._rpc = async () => LLM_COBRO;
    const res = await instance.onRecalibrarRequest({ data: {
      project_id: 'n1', umbral: UMBRAL, resultados_real: 'COBRO', metricas: { importe: 300 }, request_id: 'R1'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.recelibrado, true);
    assert.strictEqual(res.data.delta.umbral_ingresos, 15);
    assert.strictEqual(res.data.umbral_refinado.umbral_ingresos, 215, '200+15');
    assert.strictEqual(res.data.umbral_refinado.recalibrado_por, 'SISTEMA_C7');
    assert.ok(bus.published.some(([n]) => n === 'nichos.umbral.recalibrado'), 'publica nichos.umbral.recalibrado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.reglas.recalibrar.response' && v.request_id === 'R1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('fallback reflejo cuando el LLM no responde (SANGRA → delta negativo)', async () => {
    instance._rpc = async () => ({ status: 500, data: {} });
    const res = await instance.onRecalibrarRequest({ data: {
      project_id: 'n2', umbral: { project_id: 'n2', umbral_ingresos: 300, minimos_demanda: {} }, resultados_real: 'SANGRA', metricas: { ingresos: 100 }
    } });
    assert.strictEqual(res.status, 200, 'no rompe el pipeline si el LLM cae');
    assert.strictEqual(res.data.resultado_real, 'SANGRA');
    assert.ok(res.data.delta.umbral_ingresos < 0, 'el reflejo baja el umbral al sangrar');
    assert.ok(res.data.umbral_refinado.umbral_ingresos < 300, 'el umbral refinado es menor al vigente');
  });

  await testAsync('recalibrar resultado no interpretable → nichos.reglas.recalibrar.failed', async () => {
    instance._rpc = async () => LLM_COBRO;
    const res = await instance.onRecalibrarRequest({ data: { project_id: 'n3', umbral: UMBRAL, resultados_real: 'QUIZAS', request_id: 'R2' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'RESULTADO_INTERPRETABLE');
    assert.ok(bus.published.some(([n]) => n === 'nichos.reglas.recalibrar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('fire-and-forget nichos.salud.actualizada: GENERA → aprende COBRÓ y recalibra', async () => {
    instance._rpc = async () => LLM_COBRO;
    const res = await instance.onSaludActualizada({ data: {
      project_id: 'n4', estado: 'GENERA', ingresos: 400, coste_total: 200, umbral: { project_id: 'n4', umbral_ingresos: 500 }
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.resultado_real, 'COBRO');
    assert.ok(bus.published.some(([n]) => n === 'nichos.umbral.recalibrado'), 'publica nichos.umbral.recalibrado');
    assert.ok(instance._umbrales.get('n4').umbral_ingresos > 500, 'memoriza el umbral refinado');
  });

  await testAsync('fire-and-forget nichos.cobro_registrado: EFECTIVO aprende; COMPROMETIDO es promesa y no', async () => {
    instance._rpc = async () => LLM_COBRO;
    const ef = await instance.onCobroRegistrado({ data: { project_id: 'n5', cobro: { importe: 250, tipo: 'EFECTIVO' } } });
    assert.strictEqual(ef.status, 200);
    assert.strictEqual(ef.data.resultado_real, 'COBRO');
    const prom = await instance.onCobroRegistrado({ data: { project_id: 'n5', cobro: { importe: 100, tipo: 'COMPROMETIDO' } } });
    assert.strictEqual(prom, null, 'un cobro comprometido (promesa) no recalibra por sí solo');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja C7', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), [
      'nichos.reglas.recalibrar.request',
      'nichos.salud.actualizada',
      'nichos.cobro_registrado'
    ].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.umbral.recalibrado', 'nichos.reglas.recalibrar.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

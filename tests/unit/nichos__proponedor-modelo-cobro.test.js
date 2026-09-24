/**
 * Test unitario — nichos/proponedor-modelo-cobro (D4, micro-agente hibrido)
 *
 * Cubre: carga real del loader, RPC proponer (exito con LLM, fallback reflejo
 * sin LLM, nicho vacio → failed), que la propuesta SIEMPRE produce datos
 * ESTRUCTURADOS (modelo, precio, razon, provisional), jamas un texto suelto,
 * y que cada flujo cierra su circulo con su par de fallo.
 *
 * Ejecutar: node tests/unit/nichos__proponedor-modelo-cobro.test.js
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

// Stub de _rpc para llm.complete que devuelve el modelo (JSON).
const LLM_OK = { status: 200, data: { content: JSON.stringify({
  modelo: 'empresa',
  razon: 'vende a restaurantes por volumen mensual',
  precio_sugerido_eur: 45
}) } };

(async () => {
  console.log('nichos/proponedor-modelo-cobro — micro-agente hibrido (D4)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'proponedor-modelo-cobro');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');

  await testAsync('RPC proponer + produce una propuesta estructurada (éxito con LLM)', async () => {
    instance._rpc = async (evento) => {
      if (evento === 'llm.complete.request') return LLM_OK;
      return null;
    };
    const res = await instance.onProponerRequest({
      data: {
        project_id: 'p1',
        nicho: { servicio: 'formacion a restaurantes', audiencia: 'restaurantes', id: 'n1' },
        competencia: { disposicion_pagar: { precio_medio_eur: 45 } },
        request_id: 'R1'
      }
    });
    assert.strictEqual(res.status, 200);
    const data = res.data;
    // La propuesta produce datos ESTRUCTURADOS, jamas un texto suelto:
    assert.strictEqual(data.modelo, 'empresa', 'modelo del LLM validado');
    assert.ok(Array.isArray(data.opciones) && data.opciones.length === 4, 'opciones declaradas presentes');
    assert.ok(typeof data.razon === 'string' && data.razon.trim(), 'razon presente');
    // al venir precio del LLM/evidencia → NO es provisional
    assert.strictEqual(data.provisional, false, 'con precio no es provisional');
    // flujo cierra el circulo: evento de dominio + response correlado
    assert.ok(bus.published.some(([n]) => n === 'nichos.modelo_cobro.propuesto'), 'publica nichos.modelo_cobro.propuesto');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.modelo_cobro.proponer.response' && v.request_id === 'R1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('fallback reflejo de propuesta cuando el LLM no responde', async () => {
    instance._rpc = async (evento) => {
      if (evento === 'llm.complete.request') return { status: 500, data: {} };
      return null;
    };
    const res = await instance.onProponerRequest({ data: { project_id: 'p2', nicho: { producto: 'salsa picante', id: 'n2' } } });
    assert.strictEqual(res.status, 200, 'no rompe el pipeline si el LLM cae');
    assert.ok(res.data.modelo && ['suscripcion', 'empresa', 'transaccional', 'abierto'].includes(res.data.modelo), 'modelo valido en fallback');
    assert.ok(typeof res.data.razon === 'string' && res.data.razon.trim(), 'razon reflejo deriva una propuesta');
    // sin evidencia de disposicion a pagar → provisional
    assert.strictEqual(res.data.provisional, true, 'sin precio queda provisional (lo confirma el gate)');
  });

  await testAsync('nicho vacio → nichos.modelo_cobro.proponer.failed', async () => {
    const res = await instance.onProponerRequest({ data: { project_id: 'p3', nicho: null, request_id: 'R3' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'NICHO_INVALIDO');
    assert.ok(bus.published.some(([n]) => n === 'nichos.modelo_cobro.proponer.failed'), 'cierra el circulo con el par de fallo');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja D4', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event), ['nichos.modelo_cobro.proponer.request']);
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.modelo_cobro.proponer.failed', 'nichos.modelo_cobro.propuesto'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

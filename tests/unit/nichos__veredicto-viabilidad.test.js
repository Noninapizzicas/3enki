/**
 * Test unitario — nichos/veredicto-viabilidad (C3, micro-agente hibrido)
 *
 * Cubre: carga real del loader, RPC evaluar (exito con LLM, fallback reflejo
 * sin LLM, estudio vacio → failed, sin criterio → PUENTE honesto), que el
 * corte DURO NO_VIABLE->CORTADO NO se aplica aqui (solo se emite el veredicto),
 * y que cada flujo cierra su circulo con su par de fallo.
 *
 * Ejecutar: node tests/unit/nichos__veredicto-viabilidad.test.js
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

// Stub de _rpc para llm.complete que devuelve un veredicto asistido.
const LLM_OK = { status: 200, data: { content: JSON.stringify({
  veredicto: 'VIABLE', confianza: 0.85, motivo: 'la demanda alcanza el umbral de ingresos con solvencia'
}) } };

const CANDIDATO = { producto: 'salsa picante', audiencia: 'restaurantes' };
// Estudio ya medido por C1 (demanda_1er_orden alta + disposicion a pagar).
const ESTUDIO = {
  candidato: CANDIDATO,
  demanda_1er_orden: { quienes_buscan: ['restaurantes'], fuerza_demanda: 0.9, volumen_busqueda: 120, fuentes: ['stub'] },
  disposicion_pagar: { moneda: 'EUR', rango_min_eur: 35, rango_max_eur: 80, precio_medio_eur: 50 }
};
// Criterio declarado por C2 (umbral via K3).
const CRITERIO = { umbral_ingresos: 75, minimos_demanda: { numero_busquedas: 50, contactos_semana: 10 }, tipo: 'estandar' };

(async () => {
  console.log('nichos/veredicto-viabilidad — micro-agente hibrido (C3)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'veredicto-viabilidad');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');

  await testAsync('RPC evaluar + veredicto VIABLE (éxito con LLM, estudio>=umbral)', async () => {
    instance._rpc = async (evento) => (evento === 'llm.complete.request' ? LLM_OK : null);
    const res = await instance.onEvaluarRequest({ data: { project_id: 'p1', estudio: ESTUDIO, criterio: CRITERIO, request_id: 'R1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.veredicto, 'VIABLE', 'estudio>=umbral → VIABLE');
    assert.ok(res.data.motivo && res.data.motivo.trim(), 'lleva motivo');
    assert.ok(typeof res.data.confianza === 'number', 'confianza numerica');
    assert.ok(bus.published.some(([n]) => n === 'nichos.veredicto.emitido'), 'publica nichos.veredicto.emitido');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.veredicto.evaluar.response' && v.request_id === 'R1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('fallback reflejo: estudio < umbral → NO_VIABLE aunque el LLM caiga', async () => {
    instance._rpc = async (evento) => (evento === 'llm.complete.request' ? { status: 500, data: {} } : null);
    const res = await instance.onEvaluarRequest({ data: { project_id: 'p2', estudio: { ...ESTUDIO, demanda_1er_orden: { ...ESTUDIO.demanda_1er_orden, volumen_busqueda: 5, fuerza_demanda: 0.1 } }, criterio: CRITERIO } });
    assert.strictEqual(res.status, 200, 'no rompe el embudo si el LLM cae');
    assert.strictEqual(res.data.veredicto, 'NO_VIABLE', 'demanda por debajo del umbral');
    // El corte DURO NO lo aplica este agente: se limita a emitir el veredicto.
    assert.ok(!res.data.cortado, 'el corte lo aplica C6, no el agente');
  });

  await testAsync('sin criterio declarado → PUENTE honesto (no asume viable)', async () => {
    instance._rpc = rpcNull;
    const res = await instance.onEvaluarRequest({ data: { project_id: 'p3', estudio: ESTUDIO, criterio: {} } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.veredicto, 'PUENTE', 'sin criterio no se asume viable');
    assert.ok(JSON.stringify(res.data.motivo).toLowerCase().includes('criterio'), 'motivo explica la falta de criterio');
  });

  await testAsync('estudio vacio → nichos.veredicto.evaluar.failed', async () => {
    instance._rpc = rpcNull;
    const res = await instance.onEvaluarRequest({ data: { project_id: 'p4', estudio: null, criterio: CRITERIO, request_id: 'R4' } });
    assert.strictEqual(res.status, 400);
    assert.ok(bus.published.some(([n]) => n === 'nichos.veredicto.evaluar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('LLM devuelve un veredicto válido alternativo cuando la fuerza es media y cumple', async () => {
    instance._rpc = async (evento) => {
      if (evento === 'llm.complete.request') return { status: 200, data: { content: JSON.stringify({ veredicto: 'PUENTE', confianza: 0.6, motivo: 'fuerza intermedia, confirmar antes' }) } };
      return null;
    };
    const res = await instance.onEvaluarRequest({ data: { project_id: 'p5', estudio: { ...ESTUDIO, demanda_1er_orden: { ...ESTUDIO.demanda_1er_orden, fuerza_demanda: 0.5 } }, criterio: CRITERIO } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.veredicto, 'PUENTE', 'el juicio asistido gana cuando el reflejo no es concluyente');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja C3', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event), ['nichos.veredicto.evaluar.request']);
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.veredicto.emitido', 'nichos.veredicto.evaluar.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

// stub _rpc que devuelve null (sin respuesta de fuentes/LLM) — fuerza el reflejo.
async function rpcNull() { return null; }

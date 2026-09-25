/**
 * Test unitario — nichos/batch-validacion (C5, reflejo stateless)
 *
 * Cubre: carga real del loader, RPC programar (procesa un lote en paralelo via
 * estudio-demanda C1 + veredicto-viabilidad C3 por item → List<Veredicto>),
 * la proyección _repartir (distribución justa determinista en N grupos paralelos),
 * fallos por item que no rompen el lote, y el par de fallo con lote vacío.
 *
 * Ejecutar: node tests/unit/nichos__batch-validacion.test.js
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

const CRITERIO = { umbral_ingresos: 75, minimos_demanda: { numero_busquedas: 50 } };

// Stub de _rpc: estudio.medir → dataset de apoyo; veredicto.evaluar → VIABLE.
async function rpcStub(evento, payload) {
  const cand = payload?.candidato || {};
  if (evento === 'nichos.estudio.medir.request') {
    return { status: 200, data: {
      project_id: payload.project_id, candidato: cand,
      demanda_1er_orden: { quienes_buscan: [cand.audiencia || 'x'], fuerza_demanda: 0.9, volumen_busqueda: 120 },
      disposicion_pagar: { moneda: 'EUR', rango_min_eur: 35, rango_max_eur: 80, precio_medio_eur: 50 }
    } };
  }
  if (evento === 'nichos.veredicto.evaluar.request') {
    return { status: 200, data: { veredicto: 'VIABLE', confianza: 0.8, motivo: 'alcanza umbral' } };
  }
  return null;
}

(async () => {
  console.log('nichos/batch-validacion — reflejo stateless (C5)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'batch-validacion');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.ok(!instance._persist, 'reflejo stateless: sin PosPersistencia');

  await testAsync('RPC programar + ejecuta el lote en paralelo → List<Veredicto>', async () => {
    instance._rpc = rpcStub;
    // mide cuándo se resuelven los RPC para confirmar paralelismo (no en serie)
    const lote = [
      { producto: 'salsa picante', audiencia: 'restaurantes' },
      { producto: 'queso artesanal', audiencia: 'delis' },
      { producto: 'vino natural', audiencia: 'bares' },
      { producto: 'cafe especial', audiencia: 'cafeterias' }
    ];
    const res = await instance.onProgramarRequest({ data: { project_id: 'p1', lote, criterio: CRITERIO, paralelismo: 4, request_id: 'B1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ejecutado, true);
    assert.strictEqual(res.data.total, 4);
    assert.strictEqual(res.data.veredictos.length, 4, 'un veredicto por item del lote');
    assert.ok(res.data.veredictos.every(v => v.status === 'exito' && v.veredicto === 'VIABLE'), 'cada item devuelve su veredicto');
    assert.strictEqual(res.data.fallidos, 0);
    assert.ok(res.data.lote_en_ejecucion.grupos.length === 4, 'repartido en 4 grupos paralelos');
    assert.ok(bus.published.some(([n]) => n === 'nichos.batch.lote_ejecutado'), 'publica nichos.batch.lote_ejecutado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.batch.programar.response' && v.request_id === 'B1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('fallo por item (estudio falla) no rompe el lote → se marca fallido', async () => {
    instance._rpc = async (evento, payload) => {
      const cand = payload?.candidato || {};
      if (evento === 'nichos.estudio.medir.request') {
        // un item falla el estudio, los demas ok
        if (cand.producto === 'roto') return { status: 422, error: { code: 'SIN_DATOS' } };
        return { status: 200, data: { demanda_1er_orden: { fuerza_demanda: 0.9, volumen_busqueda: 100 }, disposicion_pagar: { precio_medio_eur: 50 } } };
      }
      if (evento === 'nichos.veredicto.evaluar.request') {
        return { status: 200, data: { veredicto: 'VIABLE', confianza: 0.8, motivo: 'ok' } };
      }
      return null;
    };
    const res = await instance.onProgramarRequest({ data: { project_id: 'p2', lote: [{ producto: 'bueno' }, { producto: 'roto' }, { producto: 'otro' }], criterio: CRITERIO, paralelismo: 3 } });
    assert.strictEqual(res.status, 200, 'el lote no se rompe por un item');
    assert.strictEqual(res.data.fallidos, 1, 'un item marcado fallido');
    assert.strictEqual(res.data.veredictos.length, 2, 'los otros items se validaron');
  });

  await testAsync('proyección _repartir: distribución justa determinista', () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const g3 = instance._repartir(items, 3);
    assert.strictEqual(g3.length, 3, '3 grupos paralelos');
    assert.deepStrictEqual(g3.map(g => g.length).sort(), [2, 2, 3], 'distribución lo más equitativa posible');
    assert.strictEqual(g3[0][0], 1, 'mantiene el orden (primer item al grupo 0)');
    assert.strictEqual(g3[1][0], 2);
    assert.strictEqual(g3[2][0], 3);
    const g2 = instance._repartir([1, 2], 5);
    assert.strictEqual(g2.length, 2, 'no genera grupos vacíos');
  });

  await testAsync('lote vacío → nichos.batch.programar.failed', async () => {
    instance._rpc = rpcStub;
    const res = await instance.onProgramarRequest({ data: { project_id: 'p3', lote: [], request_id: 'B3' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'LOTE_VACIO');
    assert.ok(bus.published.some(([n]) => n === 'nichos.batch.programar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja C5', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event), ['nichos.batch.programar.request']);
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.batch.lote_ejecutado', 'nichos.batch.programar.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

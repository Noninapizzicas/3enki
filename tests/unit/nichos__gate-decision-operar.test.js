/**
 * Test unitario — nichos/gate-decision-operar (E2, puente stateless)
 *
 * Cubre: carga real del loader, RPC solicitar → nichos.gate.solicitado (paquete
 * cerrado con competencia/modelo/costo/proyeccion), par determinista
 * nichos.gate.solicitar.failed cuando falta nicho, y que el manifest coincide con
 * la hoja E2.
 *
 * Ejecutar: node tests/unit/nichos__gate-decision-operar.test.js
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

(async () => {
  console.log('nichos/gate-decision-operar — puente stateless (E2)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'gate-decision-operar');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._armarPaquete, 'function', 'proyección _armarPaquete presente');

  await testAsync('solicitar decision → nichos.gate.solicitado (paquete cerrado)', async () => {
    const res = await instance.onSolicitarRequest({
      data: {
        project_id: 'p1', request_id: 'G1',
        nicho: { producto: 'impresion 3d de joyeria', id: 'n1' },
        competencia: { conclusion_diferenciacion: 'competencia moderada, angulo de especializacion' },
        modelo_cobro: { modelo: 'transaccional', precio_sugerido_eur: 45 },
        costo: { total_eur: 120 },
        proyeccion: { flujo_mensual_eur: 180 }
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.tipo, 'gate_operar');
    assert.strictEqual(res.data.estado, 'PENDIENTE');
    assert.strictEqual(res.data.nicho, 'impresion 3d de joyeria');
    assert.strictEqual(res.data.paquete_cerrado, true);
    assert.strictEqual(res.data.decision_esperada, 'APRUEBA|RECHAZA');
    assert.strictEqual(res.data.competencia.conclusion_diferenciacion, 'competencia moderada, angulo de especializacion');
    assert.strictEqual(res.data.modelo_cobro.modelo, 'transaccional');
    assert.strictEqual(res.data.proyeccion.flujo_mensual_eur, 180);
    assert.ok(bus.published.some(([n]) => n === 'nichos.gate.solicitado'), 'publica nichos.gate.solicitado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.gate.solicitar.response' && v.request_id === 'G1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
    assert.ok(!bus.published.some(([n]) => n === 'nichos.gate.solicitar.failed'), 'éxito NO dispara el par de fallo');
  });

  await testAsync('solicitar sin celula → paquete con huecos null (no fabrica números)', async () => {
    const res = await instance.onSolicitarRequest({
      data: { request_id: 'G2', nicho: { producto: 'salsa picante', id: 'n2' } }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.paquete_cerrado, true);
    assert.strictEqual(res.data.competencia.conclusion_diferenciacion, null, 'no inventa competencia');
    assert.strictEqual(res.data.modelo_cobro.modelo, null, 'no inventa modelo');
  });

  await testAsync('solicitar sin nicho → nichos.gate.solicitar.failed', async () => {
    const res = await instance.onSolicitarRequest({ data: { request_id: 'G3', costo: {} } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'NICHO_INVALIDO');
    assert.ok(bus.published.some(([n]) => n === 'nichos.gate.solicitar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja E2', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event), [
      'nichos.gate.solicitar.request'
    ]);
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, [
      'nichos.gate.solicitar.failed',
      'nichos.gate.solicitado'
    ].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

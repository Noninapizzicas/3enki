/**
 * Test unitario — nichos/pulso-avance (L5, reflejo stateless)
 *
 * Cubre: calcular % de avance por etapa (SEMILLA→EN_CAJA), emitir pulso escalonado
 * por RPC (nichos.pulso_emitido), proyecto activado, consumir nichos.pipeline.avanzado
 * y nichos.salud.actualizada (fire-and-forget), par de fallo con etapa no reconocida,
 * y que el manifest coincide con la hoja L5.
 *
 * Ejecutar: node tests/unit/nichos__pulso-avance.test.js
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
  console.log('nichos/pulso-avance — reflejo stateless (L5)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'pulso-avance');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  instance.project_id = 'p1';
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._calcularProgreso, 'function', 'proyección _calcularProgreso presente');
  assert.strictEqual(typeof instance._emitirEscalon, 'function', 'proyección _emitirEscalon presente');
  assert.strictEqual(instance._persist, undefined, 'reflejo stateless: sin PosPersistencia');

  await testAsync('calcular progreso: SEMILLA=5 → VALIDANDO=35 → CONSTRUIDO=70 → EN_CAJA=100', async () => {
    const mapa = { SEMILLA: 5, BUSCADO: 15, VALIDANDO: 35, VALIDADO: 55, CONSTRUIDO: 70, OPERANDO: 85, COBRANDO: 93, EN_CAJA: 100 };
    for (const [etapa, esperado] of Object.entries(mapa)) {
      const res = instance.toolCalcularProgreso({ project_id: 'p1', nicho: 'n1', etapa });
      assert.strictEqual(res.status, 200, `${etapa} ok`);
      assert.strictEqual(res.data.avance, esperado, `${etapa} → ${esperado}%`);
    }
    const terminal = instance.toolCalcularProgreso({ project_id: 'p1', nicho: 'n1', etapa: 'EN_CAJA' });
    assert.strictEqual(terminal.data.terminal, true, 'EN_CAJA es terminal');
  });

  await testAsync('emitir pulso por RPC → nichos.pulso_emitido + .response correlado', async () => {
    const res = await instance.onEmitirRequest({ data: { project_id: 'p1', nicho: 'n2', etapa: 'VALIDANDO', request_id: 'E1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.avance, 35);
    assert.strictEqual(res.data.escalon, 'PULSO');
    assert.strictEqual(res.data.emitido, true);
    assert.ok(bus.published.some(([n]) => n === 'nichos.pulso_emitido'), 'publica nichos.pulso_emitido');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.pulso.emitir.response' && v.request_id === 'E1');
    assert.ok(respEvt, 'publica .response correlado');
  });

  await testAsync('consumir nichos.pipeline.avanzado (fire-and-forget) → emite pulso de avance', async () => {
    const res = await instance.onPipelineAvanzado({ data: { project_id: 'p1', nicho: 'n3', estado: 'CONSTRUIDO' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.avance, 70);
    assert.ok(bus.published.some(([n]) => n === 'nichos.pulso_emitido'), 'publica nichos.pulso_emitido');
  });

  await testAsync('consumir nichos.salud.actualizada (COBRÓ) → pulso de cierre EN_CAJA', async () => {
    const res = await instance.onSaludActualizada({ data: { project_id: 'p1', nicho: 'n4', resultado: 'COBRO' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.etapa, 'EN_CAJA');
    assert.strictEqual(res.data.avance, 100);
    assert.strictEqual(res.data.tipo, 'cierre');
  });

  await testAsync('emitir: etapa no reconocida → 400 + nichos.pulso.emitir.failed', async () => {
    const res = await instance.onEmitirRequest({ data: { project_id: 'p1', nicho: 'n5', etapa: 'RARO', request_id: 'E2' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
    assert.ok(bus.published.some(([n]) => n === 'nichos.pulso.emitir.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('proyecto activado registra el project activo', async () => {
    await instance.onProjectActivated({ data: { project_id: 'p10' } });
    assert.strictEqual(instance.project_id, 'p10');
    const res = instance.toolCalcularProgreso({ nicho: 'n6', etapa: 'SEMILLA' });
    assert.strictEqual(res.status, 200, 'usa el project activo');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja L5', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), [
      'nichos.pulso.emitir.request',
      'nichos.pipeline.avanzado',
      'nichos.salud.actualizada',
      'project.activated'
    ].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.pulso_emitido', 'nichos.pulso.emitir.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

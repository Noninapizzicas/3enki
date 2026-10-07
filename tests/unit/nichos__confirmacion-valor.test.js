/**
 * Test unitario — nichos/confirmacion-valor (I3, custodio con persistencia)
 *
 * Cubre: ingesta reflejo estructura el feedback; el custodio guarda y publica
 * nichos.feedback_recibido; consulta por nicho; feedback inválido → failed;
 * proyect.activated restaura; y la exactitud de subscribes ↔ handlers /
 * publishes de la hoja I3.
 *
 * Ejecutar: node tests/unit/nichos__confirmacion-valor.test.js
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
  console.log('nichos/confirmacion-valor — custodio con persistencia (I3)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'confirmacion-valor');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._persist, 'object', 'custodio: tiene PosPersistencia');
  assert.strictEqual(typeof instance.onProjectActivated, 'function', 'custodio: restaura en project.activated');

  await testAsync('ingestar: estructura el feedback crudo → valor_recibido + puntuacion', async () => {
    const res = await instance.onIngestarRequest({ data: { project_id: 'p1', nicho: 'pan-artesano', feedback_crudo: { puntuacion: 5, comentario: 'excelente pan' }, request_id: 'C1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.valor_recibido, 'alto', 'puntuacion 5 → valor alto');
    assert.strictEqual(res.data.puntuacion, 5);
    assert.strictEqual(res.data.estructurado, true);
  });

  await testAsync('guardar: persiste el feedback + publica nichos.feedback_recibido', async () => {
    const res = await instance.onGuardarRequest({ data: { project_id: 'p1', nicho: 'pan-artesano', feedback: { valor_recibido: 'alto', puntuacion: 5, comentario: 'excelente pan' }, request_id: 'C2' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.confirmado, true);
    assert.strictEqual(res.data.total, 1);
    assert.ok(bus.published.some(([n]) => n === 'nichos.feedback_recibido'), 'publica nichos.feedback_recibido');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.feedback.guardar.response' && v.request_id === 'C2');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('guardar con feedback crudo embebido → lo estructura y guarda', async () => {
    const res = await instance.onGuardarRequest({ data: { project_id: 'p1', nicho: 'queso', feedback: { feedback_crudo: { nota: 2 } }, request_id: 'C3' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.valor_recibido, 'bajo', 'nota 2 → valor bajo');
    assert.strictEqual(res.data.total, 1, 'nicho nuevo: primer feedback');
  });

  await testAsync('consultar: devuelve el feedback de un nicho (no muta)', async () => {
    const res = await instance.onConsultarRequest({ data: { project_id: 'p1', nicho: 'pan-artesano' } });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data.feedback) && res.data.feedback.length === 1, '1 confirmacion');
  });

  await testAsync('feedback inválido → nichos.feedback.guardar.failed', async () => {
    const res = await instance.onIngestarRequest({ data: { project_id: 'p2', nicho: 'x', feedback_crudo: {} } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
    assert.ok(bus.published.some(([n]) => n === 'nichos.feedback.guardar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('project.activated restaura el store de feedback de otro proyecto', async () => {
    instance._feedback.set('n9', new Map([['nicho-a', [{ nicho: 'nicho-a', valor_recibido: 'medio', puntuacion: 3, comentario: 'ok', recibido_el: 'x' }]]]));
    await instance.onProjectActivated({ data: { project_id: 'n9' } });
    const res = await instance.onConsultarRequest({ data: { project_id: 'n9', nicho: 'nicho-a' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.feedback[0].valor_recibido, 'medio', 'store restaurado');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja I3', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), [
      'nichos.feedback.guardar.request',
      'nichos.feedback.ingestar.request',
      'project.activated'
    ].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.feedback.guardar.failed', 'nichos.feedback_recibido'].sort());
    assert.strictEqual(typeof instance._consultar, 'function', 'proyección _consultar presente');
  });

  console.log('\nTodos los tests pasaron.');
})();

/**
 * Test unitario — nichos/historial-nicho (L4, custodio con persistencia)
 *
 * Cubre: el pipeline (single-writer) anade una entrada append-only → publica
 * nichos.historial_actualizado; la inmutabilidad (re-append no muta lo previo);
 * second-writer rechazado (403); consultar por nicho; estado inválido → failed;
 * project.activated restaura; y la exactitud de subscribes ↔ handlers /
 * publishes de la hoja L4.
 *
 * Ejecutar: node tests/unit/nichos__historial-nicho.test.js
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
  console.log('nichos/historial-nicho — custodio con persistencia (L4)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'historial-nicho');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._persist, 'object', 'custodio: tiene PosPersistencia');
  assert.strictEqual(typeof instance.onProjectActivated, 'function', 'custodio: restaura en project.activated');

  await testAsync('append: el PIPELINE anade entrada → publica nichos.historial_actualizado', async () => {
    const res = await instance.onAppendRequest({ data: { project_id: 'p1', nicho: 'pan-artesano', rol: 'PIPELINE', estado: 'VALIDADO', decision: 'aprueba', request_id: 'H1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.estado_anadido, undefined); // shape por entrada
    assert.strictEqual(res.data.anadido, true);
    assert.strictEqual(res.data.entrada.estado, 'VALIDADO');
    assert.ok(bus.published.some(([n]) => n === 'nichos.historial_actualizado'), 'publica nichos.historial_actualizado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.historial.append.response' && v.request_id === 'H1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('append: inmutabilidad — la 1ª entrada no se muta al anadir la 2ª', async () => {
    await instance.onAppendRequest({ data: { project_id: 'p1', nicho: 'pan-artesano', rol: 'PIPELINE', estado: 'OPERANDO', request_id: 'H2' } });
    const res = await instance.onConsultarRequest({ data: { project_id: 'p1', nicho: 'pan-artesano' } });
    assert.strictEqual(res.data.historial.length, 2, 'dos entradas append-only');
    assert.strictEqual(res.data.historial[0].estado, 'VALIDADO', 'la primera queda intacta');
    assert.strictEqual(res.data.historial[1].estado, 'OPERANDO');
    assert.ok(res.data.historial[0].en_el <= res.data.historial[1].en_el, 'orden temporal');
  });

  await testAsync('append: second-writer != PIPELINE → rechazado + par de fallo', async () => {
    const res = await instance.onAppendRequest({ data: { project_id: 'p1', nicho: 'pan-artesano', rol: 'CANAL', estado: 'X', request_id: 'H3' } });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.error.code, 'PERMISSION_DENIED');
    assert.ok(bus.published.some(([n]) => n === 'nichos.historial.append.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('append: estado vacío → failed', async () => {
    const res = await instance.onAppendRequest({ data: { project_id: 'p1', nicho: 'x', rol: 'PIPELINE', request_id: 'H4' } });
    assert.strictEqual(res.status, 400);
  });

  await testAsync('consultar: devuelve el historial de un nicho (no muta)', async () => {
    const res = await instance.onConsultarRequest({ data: { project_id: 'p1', nicho: 'pan-artesano' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.historial.length, 2);
  });

  await testAsync('project.activated restaura el historial de otro proyecto', async () => {
    instance._historial.set('n9', new Map([['a', [{ nicho: 'a', estado: 'CORTADO', en_el: 'x' }]]]));
    await instance.onProjectActivated({ data: { project_id: 'n9' } });
    const res = await instance.onConsultarRequest({ data: { project_id: 'n9', nicho: 'a' } });
    assert.strictEqual(res.data.historial[0].estado, 'CORTADO', 'historial restaurado');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja L4', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), ['nichos.historial.append.request', 'project.activated'].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.historial.append.failed', 'nichos.historial_actualizado'].sort());
    assert.strictEqual(typeof instance._consultar, 'function', 'proyección _consultar presente');
  });

  console.log('\nTodos los tests pasaron.');
})();

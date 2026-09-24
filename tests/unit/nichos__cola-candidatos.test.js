/**
 * Test unitario — nichos/cola-candidatos (L2, custodio con persistencia)
 *
 * Cubre: carga real del loader, RPC encolar (éxito → publica nichos.candidato_encolado),
 * tomar lotes FIFO (solo batch-validacion C5, guard de consumidor; second-writer
 * rechazado), fire-and-forget de nichos.candidato.encontrado, y el par de fallo
 * cuando la cola está llena o el payload es inválido.
 *
 * Ejecutar: node tests/unit/nichos__cola-candidatos.test.js
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
  console.log('nichos/cola-candidatos — custodio con persistencia (L2)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'cola-candidatos');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._persist, 'object', 'custodio: tiene PosPersistencia');
  assert.strictEqual(typeof instance.onProjectActivated, 'function', 'custodio: restaura en project.activated');

  await testAsync('encolar: encola un candidato → éxito + publica nichos.candidato_encolado', async () => {
    const res = await instance.onEncolarRequest({ data: {
      project_id: 'p1',
      candidato: { nombre: 'salsa picante', audiencia: 'restaurantes', fuente: 'google' },
      request_id: 'E1'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.encolado, true);
    assert.strictEqual(res.data.numero_en_cola, 1);
    assert.strictEqual(res.data.candidato.estado, 'EN_COLA');
    assert.ok(bus.published.some(([n]) => n === 'nichos.candidato_encolado'), 'publica nichos.candidato_encolado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.candidato.encolar.response' && v.request_id === 'E1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('encolar varios candidatos (FIFO) + tomar lotes solo por batch-validacion', async () => {
    for (const n of ['queso', 'vino', 'cafe']) {
      await instance.onEncolarRequest({ data: { project_id: 'p1', candidato: { nombre: n } } });
    }
    const len = await instance._longitud({ project_id: 'p1' });
    assert.strictEqual(len.data.numero_en_cola, 4, '4 candidatos en cola');

    // second-writer: un consumidor no autorizado NUNCA puede tomar.
    const rechazado = await instance.onTomarRequest({ data: { project_id: 'p1', consumidor: 'ORQUESTADOR', n: 2 } });
    assert.strictEqual(rechazado.status, 403);
    assert.strictEqual(rechazado.error.code, 'PERMISSION_DENIED');

    // solo batch-validacion toma el lote FIFO (los primeros 2).
    const lote = await instance.onTomarRequest({ data: { project_id: 'p1', consumidor: 'BATCH_VALIDACION', n: 2, request_id: 'T1' } });
    assert.strictEqual(lote.status, 200);
    assert.strictEqual(lote.data.tomados, 2);
    assert.strictEqual(lote.data.restantes, 2);
    assert.strictEqual(lote.data.lote[0].nombre, 'salsa picante', 'FIFO: el encolado primero sale primero');
    assert.strictEqual(lote.data.lote[1].nombre, 'queso');
    assert.ok(bus.published.some(([n]) => n === 'nichos.candidato_tomado'), 'publica nichos.candidato_tomado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.candidato.tomar.response' && v.request_id === 'T1');
    assert.ok(respEvt, 'publica tomar.response correlado');
  });

  await testAsync('fire-and-forget nichos.candidato.encontrado → auto-encola', async () => {
    const res = await instance.onCandidatoEncontrado({ data: { project_id: 'p1', candidato: { nombre: 'trufas' } } });
    assert.strictEqual(res.status, 200);
    const len = await instance._longitud({ project_id: 'p1' });
    assert.strictEqual(len.data.numero_en_cola, 3, 'se encolo el encontrado');
  });

  await testAsync('cola llena → rechaza el encolado + nichos.candidato.encolar.failed', async () => {
    instance._colas.get('p1').tamano_max = 3; // fija tope actual (3 en cola)
    const res = await instance.onEncolarRequest({ data: { project_id: 'p1', candidato: { nombre: 'extra' }, request_id: 'E2' } });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.error.code, 'COLA_LLENA');
    assert.ok(bus.published.some(([n]) => n === 'nichos.candidato.encolar.failed'), 'cierra el círculo con el par de fallo');
    delete instance._colas.get('p1').tamano_max;
  });

  await testAsync('encolar: candidato inválido → failed', async () => {
    const res = await instance.onEncolarRequest({ data: { project_id: 'p1', candidato: null, request_id: 'E3' } });
    assert.strictEqual(res.status, 400);
    assert.ok(bus.published.some(([n]) => n === 'nichos.candidato.encolar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('project.activated restaura la cola de otro proyecto + per-proyecto', async () => {
    // limpia p1 y arma p9 con estado restaurado
    instance._colas.set('p9', { esquema: 'nichos-cola-candidatos-v1', candidatos: [{ nombre: 'restaurado', estado: 'EN_COLA' }] });
    await instance.onProjectActivated({ data: { project_id: 'p9' } });
    await instance._persist.marcarDirty && Promise.resolve();
    const res = await instance._longitud({ project_id: 'p9' });
    assert.strictEqual(res.data.numero_en_cola, 1, 'cola restaurada');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja L2', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), [
      'nichos.candidato.encolar.request',
      'nichos.candidato.tomar.request',
      'nichos.candidato.encontrado',
      'project.activated'
    ].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.candidato_encolado', 'nichos.candidato_tomado', 'nichos.candidato.encolar.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

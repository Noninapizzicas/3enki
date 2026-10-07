/**
 * Test unitario — nichos/perfil-limite-busqueda (B3, custodio con persistencia)
 *
 * Cubre: carga real del loader, RPC declarar (éxito del DUEÑO → persiste y publica
 * nichos.limite.declarado), RPC leer (devuelve lo guardado), y el par de fallo
 * cuando no es el DUEÑO o el payload es inválido (second-writer rechazado). Que
 * cada flujo cierra su círculo con su par de fallo.
 *
 * Ejecutar: node tests/unit/nichos__perfil-limite-busqueda.test.js
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
  console.log('nichos/perfil-limite-busqueda — custodio con persistencia (B3)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'perfil-limite-busqueda');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._persist, 'object', 'custodio: tiene PosPersistencia');
  assert.strictEqual(typeof instance.onProjectActivated, 'function', 'custodio: restaura en project.activated');

  await testAsync('declarar: el DUEÑO declara los límites → éxito y publica nichos.limite.declarado', async () => {
    const res = await instance.onDeclararRequest({ data: {
      project_id: 'p1',
      rol: 'DUEÑO',
      limites: {
        alcance: { geografia: 'España', mercado: 'B2B' },
        exclusions_base: ['moda', 'ropa'],
        profundidad: 2,
        max_territorios: 10,
        max_candidatos: 25,
        limite_consulta_fuente: 5,
        reglas: [{ tipo: 'producto', valor: 'imprenta', motivo: 'margen bajo' }]
      },
      request_id: 'D1'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.declarado, true);
    assert.strictEqual(res.data.limites.alcance.geografia, 'España');
    assert.strictEqual(res.data.limites.profundidad, 2);
    assert.strictEqual(res.data.limites.max_territorios, 10);
    assert.strictEqual(res.data.limites.exclusions_base.length, 2);
    assert.strictEqual(res.data.limites.reglas[0].valor, 'imprenta');
    assert.ok(bus.published.some(([n]) => n === 'nichos.limite.declarado'), 'publica nichos.limite.declarado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.limite.declarar.response' && v.request_id === 'D1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('declarar: el DUEÑO actualiza un subset -> el resto se conserva (merge conservador)', async () => {
    const res = await instance.onDeclararRequest({ data: { project_id: 'p1', rol: 'DUEÑO', limites: { profundidad: 3 }, request_id: 'D2' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.limites.profundidad, 3, 'profundidad actualizada');
    assert.strictEqual(res.data.limites.alcance.geografia, 'España', 'alcance anterior conservado');
    assert.strictEqual(res.data.limites.max_territorios, 10, 'max_territorios anterior conservado');
  });

  await testAsync('leer: devuelve lo guardado (no muta)', async () => {
    const res = await instance.onLeerRequest({ data: { project_id: 'p1', request_id: 'L1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.limites.profundidad, 3);
    assert.strictEqual(res.data.limites.alcance.mercado, 'B2B');
    assert.strictEqual(res.data.limites.reglas.length, 1);
  });

  await testAsync('declarar: second-writer no DUEÑO → rechazado + nichos.limite.declarar.failed', async () => {
    const res = await instance.onDeclararRequest({ data: { project_id: 'p1', rol: 'ANALISTA', limites: { profundidad: 1 }, request_id: 'D3' } });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.error.code, 'PERMISSION_DENIED');
    assert.ok(bus.published.some(([n]) => n === 'nichos.limite.declarar.failed'), 'cierra el círculo con el par de fallo');
    const leido = await instance.onLeerRequest({ data: { project_id: 'p1' } });
    assert.strictEqual(leido.data.limites.profundidad, 3, 'la escritura rechazada NO se aplica');
  });

  await testAsync('declarar: payload inválido (sin limites) → failed', async () => {
    const res = await instance.onDeclararRequest({ data: { project_id: 'p1', rol: 'DUEÑO', request_id: 'D4' } });
    assert.strictEqual(res.status, 400);
    assert.ok(bus.published.some(([n]) => n === 'nichos.limite.declarar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('declarar: profundidad fuera de rango → failed', async () => {
    const res = await instance.onDeclararRequest({ data: { project_id: 'p1', rol: 'DUEÑO', limites: { profundidad: 9 }, request_id: 'D5' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
  });

  await testAsync('declarar: proyecto sin límites escribe uno nuevo (alcance obligatorio mínimo)', async () => {
    const res = await instance.onDeclararRequest({ data: { project_id: 'p9', rol: 'DUEÑO', limites: { alcance: { geografia: 'Madrid' } }, request_id: 'D6' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.limites.alcance.geografia, 'Madrid');
  });

  await testAsync('project.activated restaura el perfil de otro proyecto (persistencia onProjectActivated)', async () => {
    // simula la hidratación que haría PosPersistencia.restaurar
    instance._limites.set('p9', { esquema: 'nichos-limites-busqueda-v1', alcance: { geografia: 'Madrid' }, exclusions_base: [], profundidad: 1 });
    await instance.onProjectActivated({ data: { project_id: 'p9' } });
    const res = await instance.onLeerRequest({ data: { project_id: 'p9' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.limites.alcance.geografia, 'Madrid', 'perfil restaurado');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja B3', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), [
      'nichos.limite.leer.request',
      'nichos.limite.declarar.request',
      'project.activated'
    ].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.limite.declarado', 'nichos.limite.declarar.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

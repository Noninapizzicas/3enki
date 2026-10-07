/**
 * Test unitario — nichos/perfil-supervision (H2, custodio con persistencia)
 *
 * Cubre: el DUEÑO declara cadencia + límites → publica nichos.supervision.declarado;
 * leer devuelve el perfil (no muta); second-writer rechazado (403); cadencia no
 * permitida → failed; límites vacíos → failed; project.activated restaura; y la
 * exactitud de subscribes ↔ handlers / publishes.
 *
 * Ejecutar: node tests/unit/nichos__perfil-supervision.test.js
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
  console.log('nichos/perfil-supervision — custodio con persistencia (H2)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'perfil-supervision');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._persist, 'object', 'custodio: tiene PosPersistencia');
  assert.strictEqual(typeof instance.onProjectActivated, 'function', 'custodio: restaura en project.activated');

  await testAsync('declarar: el DUEÑO declara cadencia + límites → publica nichos.supervision.declarado', async () => {
    const res = await instance.onDeclararRequest({ data: {
      project_id: 'n1',
      rol: 'DUEÑO',
      perfil: { cadencia_pulso: 'semanal', limites: { max_alertas_dia: 3, techo_perdida_eur: 300 } },
      request_id: 'D1'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.declarado, true);
    assert.strictEqual(res.data.perfil.cadencia_pulso, 'semanal');
    assert.strictEqual(res.data.perfil.limites.techo_perdida_eur, 300);
    assert.ok(bus.published.some(([n]) => n === 'nichos.supervision.declarado'), 'publica nichos.supervision.declarado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.supervision.declarar.response' && v.request_id === 'D1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('leer: devuelve el perfil de supervisión (no muta)', async () => {
    const res = await instance.onLeerRequest({ data: { project_id: 'n1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.perfil.cadencia_pulso, 'semanal');
    assert.strictEqual(res.data.perfil.limites.max_alertas_dia, 3);
  });

  await testAsync('leerPerfil: alias para G1 devuelve el perfil', () => {
    const p = instance.leerPerfil('n1');
    assert.strictEqual(p.cadencia_pulso, 'semanal');
  });

  await testAsync('declarar: merge conservador del dueño preserva el resto', async () => {
    const res = await instance.onDeclararRequest({ data: {
      project_id: 'n1',
      rol: 'DUEÑO',
      perfil: { cadencia_pulso: 'diaria' },
      request_id: 'D2'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.perfil.cadencia_pulso, 'diaria');
    assert.strictEqual(res.data.perfil.limites.max_alertas_dia, 3, 'límites preservados por merge');
  });

  await testAsync('declarar: second-writer != DUEÑO → rechazado + par de fallo', async () => {
    const res = await instance.onDeclararRequest({ data: { project_id: 'n1', rol: 'MONITOR', perfil: { cadencia_pulso: 'diaria' }, request_id: 'D3' } });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.error.code, 'PERMISSION_DENIED');
    assert.ok(bus.published.some(([n]) => n === 'nichos.supervision.declarar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('declarar: cadencia no permitida → failed', async () => {
    const res = await instance.onDeclararRequest({ data: { project_id: 'n1', rol: 'DUEÑO', perfil: { cadencia_pulso: 'minutal' }, request_id: 'D4' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
  });

  await testAsync('declarar: límites vacíos → failed', async () => {
    const res = await instance.onDeclararRequest({ data: { project_id: 'n1', rol: 'DUEÑO', perfil: { limites: {} }, request_id: 'D5' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
  });

  await testAsync('project.activated restaura el perfil de otro proyecto', async () => {
    instance._perfiles.set('n9', { esquema: 'nichos-perfil-supervision-v1', cadencia_pulso: 'tiempo_real', limites: { max_alertas_dia: 5, techo_perdida_eur: 150 }, updated_at: 'x', declarado_por: 'DUEÑO' });
    await instance.onProjectActivated({ data: { project_id: 'n9' } });
    const res = await instance.onLeerRequest({ data: { project_id: 'n9' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.perfil.cadencia_pulso, 'tiempo_real', 'perfil restaurado');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja H2', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), [
      'nichos.supervision.declarar.request',
      'nichos.supervision.leer.request',
      'project.activated'
    ].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.supervision.declarado', 'nichos.supervision.declarar.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

/**
 * Test unitario — nichos/perfil-cobro-entrega (I1, custodio con persistencia)
 *
 * Cubre: el CONSTRUCTOR declara el contrato de cobro/entrega → publica
 * nichos.perfil.declarado; leer devuelve el perfil (no muta); second-writer
 * rechazado (403); contrato inválido (plataforma no permitida) → failed; la
 * exactitud de subscribes ↔ handlers / publishes; y project.activated restaura.
 *
 * Ejecutar: node tests/unit/nichos__perfil-cobro-entrega.test.js
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
  console.log('nichos/perfil-cobro-entrega — custodio con persistencia (I1)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'perfil-cobro-entrega');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._persist, 'object', 'custodio: tiene PosPersistencia');
  assert.strictEqual(typeof instance.onProjectActivated, 'function', 'custodio: restaura en project.activated');

  await testAsync('declarar: el CONSTRUCTOR declara el contrato → publica nichos.perfil.declarado', async () => {
    const res = await instance.onDeclararRequest({ data: {
      project_id: 'n1',
      rol: 'CONSTRUCTOR',
      contrato: { pagador: 'cliente a', plataforma_cobro: 'transferencia', forma_entrega: 'digital', precio: 120, periodidad_none: 1 },
      request_id: 'D1'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.declarado, true);
    assert.strictEqual(res.data.perfil.contrato.plataforma_cobro, 'transferencia');
    assert.strictEqual(res.data.perfil.contrato.forma_entrega, 'digital');
    assert.strictEqual(res.data.perfil.contrato.precio, 120);
    assert.ok(bus.published.some(([n]) => n === 'nichos.perfil.declarado'), 'publica nichos.perfil.declarado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.perfil.declarar.response' && v.request_id === 'D1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('leer: devuelve el perfil de cobro/entrega (no muta)', async () => {
    const res = await instance.onLeerRequest({ data: { project_id: 'n1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.perfil.contrato.plataforma_cobro, 'transferencia');
    assert.strictEqual(res.data.perfil.contrato.precio, 120);
  });

  await testAsync('perfilPagador: alias para E3/E4 devuelve el contrato', () => {
    const p = instance.perfilPagador('n1');
    assert.ok(p && p.contrato, 'devuelve perfil con contrato');
    assert.strictEqual(p.contrato.forma_entrega, 'digital');
  });

  await testAsync('declarar: el DUEÑO ajusta el contrato (merge conservador)', async () => {
    const res = await instance.onDeclararRequest({ data: {
      project_id: 'n1',
      rol: 'DUEÑO',
      contrato: { plataforma_cobro: 'stripe', precio: 150 },
      request_id: 'D2'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.perfil.contrato.plataforma_cobro, 'stripe');
    assert.strictEqual(res.data.perfil.contrato.precio, 150);
    assert.strictEqual(res.data.perfil.contrato.forma_entrega, 'digital', 'forma preservada por merge');
    assert.strictEqual(res.data.perfil.declarado_por, 'DUEÑO');
  });

  await testAsync('declarar: second-writer != CONSTRUCTOR/DUEÑO → rechazado + par de fallo', async () => {
    const res = await instance.onDeclararRequest({ data: { project_id: 'n1', rol: 'ANALISTA', contrato: { plataforma_cobro: 'stripe' }, request_id: 'D3' } });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.error.code, 'PERMISSION_DENIED');
    assert.ok(bus.published.some(([n]) => n === 'nichos.perfil.declarar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('declarar: contrato inválido (plataforma no permitida) → failed', async () => {
    const res = await instance.onDeclararRequest({ data: { project_id: 'n1', rol: 'CONSTRUCTOR', contrato: { plataforma_cobro: 'bitcoin' }, request_id: 'D4' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
    assert.ok(bus.published.some(([n]) => n === 'nichos.perfil.declarar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('declarar: contrato inválido (forma_entrega no permitida) → failed', async () => {
    const res = await instance.onDeclararRequest({ data: { project_id: 'n1', rol: 'CONSTRUCTOR', contrato: { plataforma_cobro: 'efectivo', forma_entrega: 'teletransporte' }, request_id: 'D5' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
  });

  await testAsync('project.activated restaura el perfil de otro proyecto', async () => {
    instance._perfiles.set('n9', { esquema: 'nichos-perfil-cobro-entrega-v1', pagador: 'cliente n9', contrato: { plataforma_cobro: 'efectivo', forma_entrega: 'fisico', precio: 40, periodicidad: null, canal_entrega: null, condiciones: [] }, updated_at: 'x', declarado_por: 'CONSTRUCTOR' });
    await instance.onProjectActivated({ data: { project_id: 'n9' } });
    const res = await instance.onLeerRequest({ data: { project_id: 'n9' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.perfil.contrato.forma_entrega, 'fisico', 'perfil restaurado');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja I1', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), [
      'nichos.perfil.declarar.request',
      'nichos.perfil.leer.request',
      'project.activated'
    ].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.perfil.declarado', 'nichos.perfil.declarar.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

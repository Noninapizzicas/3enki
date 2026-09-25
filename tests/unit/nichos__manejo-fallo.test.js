/**
 * Test unitario — nichos/manejo-fallo (L3, puente stateless)
 *
 * Cubre: reintento mecánico del DUEÑO del ciclo (RPC), que el reintento agota el
 * max [ABIERTO] y deriva a puente humano, que un fallo no reintentable deriva
 * directo a humano, que maneja nichos.canal.envio_fallido (fire-and-forget),
 * y que el manifest coincide con la hoja L3.
 *
 * Ejecutar: node tests/unit/nichos__manejo-fallo.test.js
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
  console.log('nichos/manejo-fallo — puente stateless (L3)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'manejo-fallo');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  instance.project_id = 'p1';
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._reintentarMecanico, 'function', 'proyección _reintentarMecanico presente');
  assert.strictEqual(typeof instance._derivarASinAlternativa, 'function', 'proyección _derivarASinAlternativa presente');

  await testAsync('fallo reintentable → reintento mecánico (intento 1) + nichos.fallo_manejado', async () => {
    const res = await instance.onManejarRequest({ data: {
      project_id: 'p1',
      fallo: { id: 'f1', nicho: 'n1', codigo: 'UPSTREAM_TIMEOUT', mensaje: 'timeout al sondear' },
      request_id: 'R1'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.reintentado, true);
    assert.strictEqual(res.data.intento, 1);
    assert.strictEqual(res.data.resolucion, 'REINTENTO_MECANICO');
    assert.ok(bus.published.some(([n]) => n === 'nichos.fallo_manejado'), 'publica nichos.fallo_manejado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.fallo.manejar.response' && v.request_id === 'R1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
    assert.ok(!bus.published.some(([n]) => n === 'nichos.puente_solicitado'), 'reintento NO escala a humano');
  });

  await testAsync('reintentos hasta agotar el max → deriva a puente humano (puente_solicitado)', async () => {
    instance._intentos.set('f1', 3); // f1 ya agotó el max (3) → este escala a humano
    const res = await instance.onManejarRequest({ data: { project_id: 'p1', fallo: { id: 'f1', nicho: 'n1', codigo: 'UPSTREAM_TIMEOUT', mensaje: 'timeout al sondear' }, request_id: 'R2' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.reintentado, false);
    assert.strictEqual(res.data.resolucion, 'PUENTE_HUMANO');
    assert.ok(res.data.escalado_humano === true);
    assert.ok(bus.published.some(([n]) => n === 'nichos.puente_solicitado'), 'escala a puente humano por evento');
    const humana = bus.published.find(([n]) => n === 'nichos.puente_solicitado');
    assert.strictEqual(humana[1].estado, 'PENDIENTE', 'paquete cerrado en PENDIENTE');
    assert.strictEqual(humana[1].paquete_cerrado, true, 'paquete cerrado');
    assert.ok(bus.published.some(([n]) => n === 'nichos.fallo_manejado'), 'aún publica nichos.fallo_manejado con escalado_humano');
  });

  await testAsync('fallo NO reintentable → deriva DIRECTO a humano sin reintento', async () => {
    const res = await instance.onManejarRequest({ data: { project_id: 'p1', fallo: { id: 'f2', nicho: 'n2', codigo: 'PERMISSION_DENIED', mensaje: 'sin permiso de acceso' }, request_id: 'R3' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.reintentado, false);
    assert.strictEqual(res.data.resolucion, 'PUENTE_HUMANO');
    assert.strictEqual(res.data.intento, undefined, 'no gasta reintento');
    assert.ok(bus.published.some(([n]) => n === 'nichos.puente_solicitado'), 'escala a humano');
  });

  await testAsync('maneja nichos.canal.envio_fallido (fire-and-forget) → nichos.fallo_manejado', async () => {
    const res = await instance.onEnvioFallido({ data: {
      project_id: 'p1',
      fallo: { id: 'f3', nicho: 'n3' },
      code: 'UPSTREAM_UNREACHABLE',
      mensaje: 'canal no disponible'
    } });
    assert.strictEqual(res.status, 200);
    assert.ok(bus.published.some(([n]) => n === 'nichos.fallo_manejado'), 'publica nichos.fallo_manejado');
  });

  await testAsync('manejar: fallo faltante → 400 + nichos.fallo.manejar.failed', async () => {
    const res = await instance.onManejarRequest({ data: { project_id: 'p1', request_id: 'R4' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
    assert.ok(bus.published.some(([n]) => n === 'nichos.fallo.manejar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja L3', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), [
      'nichos.fallo.manejar.request',
      'nichos.canal.envio_fallido',
      'project.activated'
    ].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, [
      'nichos.fallo_manejado',
      'nichos.puente_solicitado',
      'nichos.fallo.manejar.failed'
    ].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

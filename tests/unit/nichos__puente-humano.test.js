/**
 * Test unitario — nichos/puente-humano (D2, puente stateless)
 *
 * Cubre: carga real del loader, RPC solicitar → nichos.puente_solicitado (paquete
 * cerrado de dudas), par determinista nichos.puente.solicitar.failed cuando falta
 * nicho o problema, y que el manifest coincide con la hoja D2.
 *
 * Ejecutar: node tests/unit/nichos__puente-humano.test.js
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
  console.log('nichos/puente-humano — puente stateless (D2)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'puente-humano');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._detectarBloqueo, 'function', 'proyección _detectarBloqueo presente');

  await testAsync('solicitar bloqueo → nichos.puente_solicitado (paquete cerrado)', async () => {
    const res = await instance.onSolicitarRequest({
      data: {
        project_id: 'p1', request_id: 'D1',
        nicho: { producto: 'impresion 3d de joyeria', id: 'n1' },
        problema: 'no hay capacidad de fabricacion ni alternativa conocida para construir',
        dudas: ['¿construyo la capacidad?', '¿la compro?' ]
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.tipo, 'puente_humano');
    assert.strictEqual(res.data.nicho, 'impresion 3d de joyeria');
    assert.strictEqual(res.data.estado, 'PENDIENTE');
    assert.strictEqual(res.data.paquete_cerrado, true);
    assert.strictEqual(res.data.problema, 'no hay capacidad de fabricacion ni alternativa conocida para construir');
    assert.deepStrictEqual(res.data.dudas, ['¿construyo la capacidad?', '¿la compro?']);
    assert.ok(bus.published.some(([n]) => n === 'nichos.puente_solicitado'), 'publica nichos.puente_solicitado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.puente.solicitar.response' && v.request_id === 'D1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
    assert.ok(!bus.published.some(([n]) => n === 'nichos.puente.solicitar.failed'), 'éxito NO dispara el par de fallo');
  });

  await testAsync('solicitar sin dudas → dudas por defecto', async () => {
    const res = await instance.onSolicitarRequest({
      data: {
        request_id: 'D2',
        nicho: { producto: 'conservas', id: 'n2' },
        problema: 'no hay alternativa para el modelo de cobro'
      }
    });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.data.dudas, ['decide sobre este bloqueo'], 'duda por defecto presente');
  });

  await testAsync('solicitar sin problema → nichos.puente.solicitar.failed', async () => {
    const res = await instance.onSolicitarRequest({
      data: { request_id: 'D3', nicho: { producto: 'x' }, problema: '   ' }
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'PROBLEMA_INVALIDO');
    assert.ok(bus.published.some(([n]) => n === 'nichos.puente.solicitar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('solicitar sin nicho → nichos.puente.solicitar.failed', async () => {
    const res = await instance.onSolicitarRequest({
      data: { request_id: 'D4', problema: 'no hay nada que resolver' }
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'NICHO_INVALIDO');
    assert.ok(bus.published.some(([n]) => n === 'nichos.puente.solicitar.failed'));
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja D2', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event), [
      'nichos.puente.solicitar.request'
    ]);
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, [
      'nichos.puente.solicitar.failed',
      'nichos.puente_solicitado'
    ].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

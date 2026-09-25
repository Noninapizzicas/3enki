/**
 * Test unitario — nichos/ajustador-umbrales (K3, custodio)
 *
 * El JEFE retunea en caliente el criterio/umbral de validación: cubre retunear
 * (éxito del DUEÑO → custodia en store, recalcula y publica nichos.umbral_ajustado),
 * el guard single-writer (rol != DUEÑO → 403 + par de fallo), umbral fuera de
 * rango (400 + failed), la propagación a criterio-viabilidad (publica el evento
 * de recalibrado) y la persistencia per-proyecto (PosPersistencia + onUnload flush
 * + project.activated restaura).
 *
 * Ejecutar: node tests/unit/nichos__ajustador-umbrales.test.js
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
  console.log('nichos/ajustador-umbrales — custodio (K3)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'ajustador-umbrales');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._persist, 'object', 'custodio: tiene PosPersistencia');
  assert.strictEqual(typeof instance.onProjectActivated, 'function', 'custodio: restaura en project.activated');

  await testAsync('retunear: el DUEÑO ajusta el umbral → éxito + publica nichos.umbral_ajustado', async () => {
    const res = await instance.onRetunearRequest({ data: {
      project_id: 'p1',
      rol: 'DUEÑO',
      nuevo_umbral: { umbral_ingresos: 180, minimos_demanda: { numero_busquedas: 600, contactos_semana: 30 }, disposicion_a_pagar: 45 },
      request_id: 'R1'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.aplicado, true);
    assert.strictEqual(res.data.umbral.umbral_ingresos, 180);
    assert.strictEqual(res.data.umbral.ajustado_por, 'DUEÑO');
    assert.ok(bus.published.some(([n]) => n === 'nichos.umbral_ajustado'), 'propaga el evento de recalibrado');
    const pub = bus.published.find(([n, v]) => n === 'nichos.umbral_ajustado' && v.project_id === 'p1');
    assert.ok(pub && pub[1].nuevo_umbral === 180 && pub[1].aplicado === true, 'payload del umbral_ajustado correcto');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.umbral.retunear.response' && v.request_id === 'R1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
    assert.ok(!bus.published.some(([n]) => n === 'nichos.umbral.retunear.failed'), 'éxito NO dispara el par de fallo');
  });

  await testAsync('retunear: el DUEÑO ajusta un subset -> el resto se conserva (merge) + propaga delta', async () => {
    const res = await instance.onRetunearRequest({ data: { project_id: 'p1', rol: 'DUEÑO', nuevo_umbral: { umbral_ingresos: 200 }, request_id: 'R2' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.umbral.umbral_ingresos, 200, 'umbral actualizado');
    assert.strictEqual(res.data.umbral.minimos_demanda.numero_busquedas, 600, 'mínimos anteriores conservados');
    assert.strictEqual(res.data.umbral.disposicion_a_pagar, 45, 'disposición anterior conservada');
    assert.strictEqual(res.data.delta.umbral_ingresos, 20, 'delta 200-180');
  });

  await testAsync('leer: devuelve el umbral ajustado guardado (no muta)', async () => {
    const res = await instance.toolLeer({ project_id: 'p1' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.umbral.umbral_ingresos, 200);
    assert.strictEqual(res.data.umbral.minimos_demanda.contactos_semana, 30);
  });

  await testAsync('retunear: second-writer no DUEÑO → 403 + nichos.umbral.retunear.failed', async () => {
    const res = await instance.onRetunearRequest({ data: { project_id: 'p1', rol: 'ADMIN', nuevo_umbral: { umbral_ingresos: 150 }, request_id: 'R3' } });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.error.code, 'PERMISSION_DENIED');
    assert.ok(bus.published.some(([n]) => n === 'nichos.umbral.retunear.failed'), 'cierra el círculo con el par de fallo');
    const leido = await instance.toolLeer({ project_id: 'p1' });
    assert.strictEqual(leido.data.umbral.umbral_ingresos, 200, 'la escritura rechazada NO se aplica');
  });

  await testAsync('retunear: umbral fuera de rango base (999) → 400 + failed', async () => {
    const res = await instance.onRetunearRequest({ data: { project_id: 'p1', rol: 'DUEÑO', nuevo_umbral: { umbral_ingresos: 999 }, request_id: 'R4' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
    assert.ok(bus.published.some(([n]) => n === 'nichos.umbral.retunear.failed'), 'par de fallo');
  });

  await testAsync('retunear: payload sin nuevo_umbral → 400 + failed', async () => {
    const res = await instance.onRetunearRequest({ data: { project_id: 'p1', rol: 'DUEÑO', request_id: 'R5' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
  });

  await testAsync('persistencia: onUnload hace flush y project.activated restaura otro proyecto', async () => {
    // simula la hidratación que haría PosPersistencia.restaurar
    instance._umbrales.set('p9', { esquema: 'nichos-ajustador-umbrales-v1', umbral_ingresos: 90, minimos_demanda: { numero_busquedas: 300, contactos_semana: 12 }, disposicion_a_pagar: 20, anterior: null, ajustado_por: 'DUEÑO', aplicado: true, updated_at: new Date().toISOString() });
    await instance.onProjectActivated({ data: { project_id: 'p9' } });
    const res = await instance.toolLeer({ project_id: 'p9' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.umbral.umbral_ingresos, 90, 'umbral restaurado');
    // onUnload no lanza
    await instance.onUnload();
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja K3', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), [
      'nichos.umbral.retunear.request',
      'project.activated'
    ].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.umbral_ajustado', 'nichos.umbral.retunear.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

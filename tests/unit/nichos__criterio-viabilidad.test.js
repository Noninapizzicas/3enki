/**
 * Test unitario — nichos/criterio-viabilidad (C2, custodio con persistencia)
 *
 * Pieza CENTRAL del eslabón limitante: cubre declarar umbral (éxito del DUEÑO →
 * persiste y publica nichos.criterio.declarado), leer (devuelve lo guardado),
 * retunear en caliente via bucle C7->C2 (nichos.umbral.recalibrado → refina y
 * publica nichos.criterio.recalibrado), el par de fallo si input inválido
 * (second-writer no DUEÑO / delta inválido) y la persistencia entre proyectos
 * (project.activated restaura). Que cada flujo cierra su círculo con su par.
 *
 * Ejecutar: node tests/unit/nichos__criterio-viabilidad.test.js
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
  console.log('nichos/criterio-viabilidad — custodio con persistencia (C2)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'criterio-viabilidad');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._persist, 'object', 'custodio: tiene PosPersistencia');
  assert.strictEqual(typeof instance.onProjectActivated, 'function', 'custodio: restaura en project.activated');
  assert.strictEqual(typeof instance.onUmbralRecalibrado, 'function', 'custodio: maneja el bucle C7->C2 recalibrado');

  await testAsync('declarar: el DUEÑO declara el criterio/umbral → éxito y publica nichos.criterio.declarado', async () => {
    const res = await instance.onDeclararRequest({ data: {
      project_id: 'p1',
      rol: 'DUEÑO',
      criterio: {
        umbral_ingresos: 150,
        minimos_demanda: { numero_busquedas: 500, contactos_semana: 25 },
        disposicion_a_pagar: 40,
        tipo: 'estandar'
      },
      request_id: 'D1'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.declarado, true);
    assert.strictEqual(res.data.criterio.umbral_ingresos, 150);
    assert.strictEqual(res.data.criterio.minimos_demanda.numero_busquedas, 500);
    assert.strictEqual(res.data.criterio.minimos_demanda.contactos_semana, 25);
    assert.strictEqual(res.data.criterio.disposicion_a_pagar, 40);
    assert.strictEqual(res.data.criterio.tipo, 'estandar');
    assert.strictEqual(res.data.criterio.recalibrado_por, 'DUEÑO');
    assert.ok(bus.published.some(([n]) => n === 'nichos.criterio.declarado'), 'publica nichos.criterio.declarado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.criterio.declarar.response' && v.request_id === 'D1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('declarar: el DUEÑO actualiza un subset -> el resto se conserva (merge conservador)', async () => {
    const res = await instance.onDeclararRequest({ data: { project_id: 'p1', rol: 'DUEÑO', criterio: { umbral_ingresos: 200 }, request_id: 'D2' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.criterio.umbral_ingresos, 200, 'umbral actualizado');
    assert.strictEqual(res.data.criterio.minimos_demanda.numero_busquedas, 500, 'mínimos anteriores conservados');
    assert.strictEqual(res.data.criterio.disposicion_a_pagar, 40, 'disposición anterior conservada');
  });

  await testAsync('leer: devuelve lo guardado (no muta)', async () => {
    const res = await instance.onLeerRequest({ data: { project_id: 'p1', request_id: 'L1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.criterio.umbral_ingresos, 200);
    assert.strictEqual(res.data.criterio.minimos_demanda.contactos_semana, 25);
    assert.strictEqual(res.data.criterio.tipo, 'estandar');
  });

  await testAsync('leerVigente: alias para el veredicto (C3) devuelve el umbral', () => {
    const vigente = instance.leerVigente('p1');
    assert.strictEqual(vigente.umbral_ingresos, 200);
  });

  await testAsync('recalibrar: bucle C7->C2 consume nichos.umbral.recalibrado y refina en caliente', async () => {
    // delta positivo: el sistema sube el umbral tras un COBRÓ
    const res = await instance.onUmbralRecalibrado({ data: { project_id: 'p1', delta: { umbral_ingresos: 50 }, resultado_real: 'COBRO' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.recalibrado, true);
    assert.strictEqual(res.data.criterio.umbral_ingresos, 250, 'umbral refinado (200+50)');
    assert.strictEqual(res.data.criterio.recalibrado_por, 'SISTEMA_C7');
    assert.ok(bus.published.some(([n]) => n === 'nichos.criterio.recalibrado'), 'publica nichos.criterio.recalibrado');
  });

  await testAsync('recalibrar: el siguiente lote lee el umbral refinado', async () => {
    const res = await instance.onLeerRequest({ data: { project_id: 'p1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.criterio.umbral_ingresos, 250, 'el lote evalúa contra el umbral refinado');
  });

  await testAsync('declarar: second-writer no DUEÑO → rechazado + nichos.criterio.declarar.failed', async () => {
    const res = await instance.onDeclararRequest({ data: { project_id: 'p1', rol: 'ANALISTA', criterio: { umbral_ingresos: 100 }, request_id: 'D3' } });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.error.code, 'PERMISSION_DENIED');
    assert.ok(bus.published.some(([n]) => n === 'nichos.criterio.declarar.failed'), 'cierra el círculo con el par de fallo');
    const leido = await instance.onLeerRequest({ data: { project_id: 'p1' } });
    assert.strictEqual(leido.data.criterio.umbral_ingresos, 250, 'la escritura rechazada NO se aplica');
  });

  await testAsync('declarar: payload inválido (sin criterio) → failed', async () => {
    const res = await instance.onDeclararRequest({ data: { project_id: 'p1', rol: 'DUEÑO', request_id: 'D4' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
    assert.ok(bus.published.some(([n]) => n === 'nichos.criterio.declarar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('declarar: umbral_ingresos inválido (<=0) → failed', async () => {
    const res = await instance.onDeclararRequest({ data: { project_id: 'p1', rol: 'DUEÑO', criterio: { umbral_ingresos: 0 }, request_id: 'D5' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
  });

  await testAsync('declarar: tipo no permitido → failed', async () => {
    const res = await instance.onDeclararRequest({ data: { project_id: 'p1', rol: 'DUEÑO', criterio: { tipo: 'lujo' }, request_id: 'D6' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
  });

  await testAsync('recalibrar: delta inválido → rechazado + nichos.criterio.recalibrar.failed', async () => {
    const res = await instance.onUmbralRecalibrado({ data: { project_id: 'p1', delta: { umbral_ingresos: 0 } } });
    assert.strictEqual(res.status, 400);
    assert.ok(bus.published.some(([n]) => n === 'nichos.criterio.recalibrar.failed'), 'cierra el círculo con el par de fallo');
    const leido = await instance.onLeerRequest({ data: { project_id: 'p1' } });
    assert.strictEqual(leido.data.criterio.umbral_ingresos, 250, 'la recalibración rechazada NO se aplica');
  });

  await testAsync('declarar: proyecto sin criterio escribe uno nuevo (umbral dentro del rango base 50-300)', async () => {
    const res = await instance.onDeclararRequest({ data: { project_id: 'p9', rol: 'DUEÑO', criterio: { umbral_ingresos: 80, minimos_demanda: { contactos_semana: 10 }, disposicion_a_pagar: 20, tipo: 'marginal' }, request_id: 'D7' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.criterio.umbral_ingresos, 80);
    assert.strictEqual(res.data.criterio.tipo, 'marginal');
  });

  await testAsync('project.activated restaura el criterio de otro proyecto (persistencia onProjectActivated)', async () => {
    // simula la hidratación que haría PosPersistencia.restaurar
    instance._criterios.set('p9', { esquema: 'nichos-criterio-viabilidad-v1', umbral_ingresos: 80, minimos_demanda: { numero_busquedas: 300, contactos_semana: 10 }, disposicion_a_pagar: 20, tipo: 'marginal' });
    await instance.onProjectActivated({ data: { project_id: 'p9' } });
    const res = await instance.onLeerRequest({ data: { project_id: 'p9' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.criterio.umbral_ingresos, 80, 'criterio restaurado');
    assert.strictEqual(res.data.criterio.tipo, 'marginal');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja C2', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), [
      'nichos.criterio.leer.request',
      'nichos.criterio.declarar.request',
      'nichos.umbral.recalibrado',
      'project.activated'
    ].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.criterio.declarado', 'nichos.criterio.recalibrado', 'nichos.criterio.declarar.failed', 'nichos.criterio.recalibrar.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

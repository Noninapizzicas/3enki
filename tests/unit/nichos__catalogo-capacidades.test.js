/**
 * Test unitario — nichos/catalogo-capacidades (D3, custodio con persistencia)
 *
 * Cubre: carga real del loader, RPC declarar (éxito del CONSTRUCTOR → crea la
 * capacidad → publica nichos.capacidad.faltante_declarado), la INVARIANTE
 * "lo que falta se crea" (no deja hueco), RPC consultar (devuelve disponibles y
 * faltantes), y el par de fallo cuando no es escritor o el payload es inválido.
 * Que cada flujo cierra su círculo con su par de fallo.
 *
 * Ejecutar: node tests/unit/nichos__catalogo-capacidades.test.js
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
  console.log('nichos/catalogo-capacidades — custodio con persistencia (D3)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'catalogo-capacidades');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._persist, 'object', 'custodio: tiene PosPersistencia');
  assert.strictEqual(typeof instance.onProjectActivated, 'function', 'custodio: restaura en project.activated');

  await testAsync('declarar: el CONSTRUCTOR declara una capacidad faltante → se crea + publica', async () => {
    const res = await instance.onDeclararRequest({ data: {
      project_id: 'p1',
      rol: 'CONSTRUCTOR',
      capacidad: 'landing-market',
      estado: 'faltante',
      descripcion: 'landing de captura para el nicho',
      nicho: 'salsa-picante',
      request_id: 'C1'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.creado, true, 'capacidad creada (invariante: lo que falta se crea)');
    assert.strictEqual(res.data.capacidad.nombre, 'landing-market');
    assert.strictEqual(res.data.capacidad.estado, 'faltante');
    assert.ok(bus.published.some(([n]) => n === 'nichos.capacidad.faltante_declarado'), 'publica nichos.capacidad.faltante_declarado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.capacidad.declarar.response' && v.request_id === 'C1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('declarar: repetir la misma capacidad NO crea un duplicado (actualiza estado)', async () => {
    const res = await instance.onDeclararRequest({ data: { project_id: 'p1', rol: 'CONSTRUCTOR', capacidad: 'landing-market', estado: 'existente' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.creado, false, 'no se crea duplicado');
    assert.strictEqual(res.data.capacidad.estado, 'existente', 'se actualiza el estado');
  });

  await testAsync('consultar: devuelve capacidades disponibles y faltantes (no muta)', async () => {
    const res = await instance.onConsultarRequest({ data: { project_id: 'p1', nicho: 'salsa-picante', request_id: 'Q1' } });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.capacidades_disponibles.some(c => c.nombre === 'landing-market'), 'disponible tras actualizar estado');
    assert.strictEqual(res.data.capacidades.length, 1, 'una sola entrada en el catalogo');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.capacidad.consultar.response' && v.request_id === 'Q1');
    assert.ok(respEvt, 'publica consultar.response correlado');
  });

  await testAsync('declarar: el DUEÑO tambien puede declarar una capacidad faltante', async () => {
    const res = await instance.onDeclararRequest({ data: { project_id: 'p1', rol: 'DUEÑO', capacidad: 'pipeline-cobro', estado: 'faltante', nicho: 'salsa-picante' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.creado, true);
    assert.strictEqual(res.data.capacidad.nombre, 'pipeline-cobro');
  });

  await testAsync('declarar: second-writer (rol no valido) → rechazado + nichos.capacidad.declarar.failed', async () => {
    const res = await instance.onDeclararRequest({ data: { project_id: 'p1', rol: 'ANALISTA', capacidad: 'x', request_id: 'C2' } });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.error.code, 'PERMISSION_DENIED');
    assert.ok(bus.published.some(([n]) => n === 'nichos.capacidad.declarar.failed'), 'cierra el círculo con el par de fallo');
    const leida = await instance.onConsultarRequest({ data: { project_id: 'p1' } });
    assert.ok(!leida.data.capacidades.some(c => c.nombre === 'x'), 'la escritura rechazada NO se aplica');
  });

  await testAsync('declarar: payload inválido (sin capacidad) → failed', async () => {
    const res = await instance.onDeclararRequest({ data: { project_id: 'p1', rol: 'CONSTRUCTOR', request_id: 'C3' } });
    assert.strictEqual(res.status, 400);
    assert.ok(bus.published.some(([n]) => n === 'nichos.capacidad.declarar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('project.activated restaura el catalogo de otro proyecto + invariante per-proyecto', async () => {
    instance._catalogos.set('p9', { esquema: 'nichos-capacidades-v1', capacidades: [{ nombre: 'seguimiento', estado: 'existente', updated_at: 'x' }] });
    await instance.onProjectActivated({ data: { project_id: 'p9' } });
    const res = await instance.onConsultarRequest({ data: { project_id: 'p9' } });
    assert.ok(res.data.capacidades_disponibles.some(c => c.nombre === 'seguimiento'), 'catalogo restaurado');
    // per-proyecto: p1 no ve la capacidad de p9
    const resP1 = await instance.onConsultarRequest({ data: { project_id: 'p1' } });
    assert.ok(!resP1.data.capacidades.some(c => c.nombre === 'seguimiento'), 'los proyectos no comparten capacidades');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja D3', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), [
      'nichos.capacidad.consultar.request',
      'nichos.capacidad.declarar.request',
      'project.activated'
    ].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.capacidad.faltante_declarado', 'nichos.capacidad.declarar.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

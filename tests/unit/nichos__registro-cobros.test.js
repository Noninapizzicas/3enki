/**
 * Test unitario — nichos/registro-cobros (F1, custodio con persistencia)
 *
 * Cubre: el MOTOR_COBRO asienta un cobro EFECTIVO (append-only) → publica
 * nichos.cobro_registrado; asiento COMPROMETIDO se apila sin sobrescribir el
 * anterior; consultar devuelve el historial (no muta); fire-and-forget desde
 * nichos.cobro.ejecutado (E3->F1); second-writer rechazado (403); payload
 * inválido → failed; y la exactitud de subscribes ↔ handlers / publishes.
 *
 * Ejecutar: node tests/unit/nichos__registro-cobros.test.js
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
  console.log('nichos/registro-cobros — custodio con persistencia (F1)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'registro-cobros');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._persist, 'object', 'custodio: tiene PosPersistencia');
  assert.strictEqual(typeof instance.onProjectActivated, 'function', 'custodio: restaura en project.activated');

  await testAsync('registrar: el MOTOR_COBRO asienta un cobro EFECTIVO → append y publica nichos.cobro_registrado', async () => {
    const res = await instance.onRegistrarRequest({ data: {
      project_id: 'p1',
      rol: 'MOTOR_COBRO',
      cobro: { importe: 120, tipo: 'EFECTIVO', pagador: 'cliente a' },
      request_id: 'R1'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.registrado, true);
    assert.strictEqual(res.data.cobro.tipo, 'EFECTIVO');
    assert.strictEqual(res.data.cobro.importe, 120);
    assert.ok(bus.published.some(([n]) => n === 'nichos.cobro_registrado'), 'publica nichos.cobro_registrado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.cobro.registrar.response' && v.request_id === 'R1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('append-only: un COMPROMETIDO se apila, no sobrescribe el EFECTIVO previo', async () => {
    const res = await instance.onRegistrarRequest({ data: {
      project_id: 'p1',
      rol: 'MOTOR_COBRO',
      cobro: { importe: 60, tipo: 'COMPROMETIDO', pagador: 'cliente b' },
      request_id: 'R2'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.cobro.tipo, 'COMPROMETIDO');
    assert.strictEqual(res.data.cobro.id, 'p1-c2', 'segundo asiento con secuencia 2');
    const cons = await instance.onConsultarRequest({ data: { project_id: 'p1' } });
    assert.strictEqual(cons.status, 200);
    assert.strictEqual(cons.data.historial.cobros.length, 2, '2 cobros asentados (nada se sobrescribe)');
    assert.strictEqual(cons.data.historial.cobros[0].tipo, 'EFECTIVO');
    assert.strictEqual(cons.data.historial.cobros[1].tipo, 'COMPROMETIDO');
  });

  await testAsync('consultar: devuelve el historial append-only (no muta)', async () => {
    const res = await instance.onConsultarRequest({ data: { project_id: 'p1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.historial.cobros.length, 2);
    assert.strictEqual(res.data.historial.cobros[0].importe, 120);
  });

  await testAsync('fire-and-forget: nichos.cobro.ejecutado (E3->F1) asienta y publica nichos.cobro_registrado', async () => {
    const res = await instance.onCobroEjecutado({ data: {
      project_id: 'p1',
      duenyo: 'MOTOR_COBRO',
      cobro: { importe: 30, tipo: 'EFECTIVO' }
    } });
    assert.strictEqual(res.status, 200);
    assert.ok(bus.published.some(([n]) => n === 'nichos.cobro_registrado'), 'publica nichos.cobro_registrado');
    const cons = await instance.onConsultarRequest({ data: { project_id: 'p1' } });
    assert.strictEqual(cons.data.historial.cobros.length, 3);
  });

  await testAsync('registrar: second-writer != MOTOR_COBRO → rechazado + nichos.cobro.registrar.failed', async () => {
    const res = await instance.onRegistrarRequest({ data: { project_id: 'p1', rol: 'ANALISTA', cobro: { importe: 50, tipo: 'EFECTIVO' }, request_id: 'R3' } });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.error.code, 'PERMISSION_DENIED');
    assert.ok(bus.published.some(([n]) => n === 'nichos.cobro.registrar.failed'), 'cierra el círculo con el par de fallo');
    const cons = await instance.onConsultarRequest({ data: { project_id: 'p1' } });
    assert.strictEqual(cons.data.historial.cobros.length, 3, 'la escritura rechazada NO se aplica');
  });

  await testAsync('registrar: payload inválido (importe <=0) → failed', async () => {
    const res = await instance.onRegistrarRequest({ data: { project_id: 'p1', rol: 'MOTOR_COBRO', cobro: { importe: 0, tipo: 'EFECTIVO' }, request_id: 'R4' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
    assert.ok(bus.published.some(([n]) => n === 'nichos.cobro.registrar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('registrar: tipo de cobro no permitido → failed', async () => {
    const res = await instance.onRegistrarRequest({ data: { project_id: 'p1', rol: 'MOTOR_COBRO', cobro: { importe: 10, tipo: 'PENDIENTE' }, request_id: 'R5' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
  });

  await testAsync('historialCobros: alias para F3 devuelve el historial plano', () => {
    const hist = instance.historialCobros('p1');
    assert.strictEqual(hist.length, 3);
  });

  await testAsync('project.activated restaura el historial de otro proyecto', async () => {
    instance._historiales.set('p9', { esquema: 'nichos-registro-cobros-v1', cobros: [{ id: 'p9-c1', importe: 90, tipo: 'COMPROMETIDO', pagador: null }] });
    await instance.onProjectActivated({ data: { project_id: 'p9' } });
    const res = await instance.onConsultarRequest({ data: { project_id: 'p9' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.historial.cobros.length, 1, 'historial restaurado');
    assert.strictEqual(res.data.historial.cobros[0].tipo, 'COMPROMETIDO');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja F1', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), [
      'nichos.cobro.registrar.request',
      'nichos.cobro.ejecutado',
      'nichos.cobro.consultar.request',
      'project.activated'
    ].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.cobro_registrado', 'nichos.cobro.registrar.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

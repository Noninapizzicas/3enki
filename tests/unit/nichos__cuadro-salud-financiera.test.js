/**
 * Test unitario — nichos/cuadro-salud-financiera (F3, custodio con persistencia)
 *
 * Cubre: SISTEMA_SALUD actualiza con cobros+coste → estado GENERA, publica
 * nichos.salud.actualizada + nichos.cuadro.flujo_a_caja; estado SANGRA sobre el
 * techo; estado NEUTRO (coste == ingresos); leer (no muta); second-writer
 * rechazado (403); payload inválido → failed; proyección pura _calcularEstado;
 * y la exactitud de subscribes ↔ handlers / publishes.
 *
 * Ejecutar: node tests/unit/nichos__cuadro-salud-financiera.test.js
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
  console.log('nichos/cuadro-salud-financiera — custodio con persistencia (F3)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'cuadro-salud-financiera');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._persist, 'object', 'custodio: tiene PosPersistencia');
  assert.strictEqual(typeof instance.onProjectActivated, 'function', 'custodio: restaura en project.activated');

  await testAsync('actualizar: cobros > coste → GENERA y publica salud actualizada + flujo a caja', async () => {
    const res = await instance.onActualizarRequest({ data: {
      project_id: 'p1',
      rol: 'SISTEMA_SALUD',
      cobros: [{ importe: 300 }, { importe: 200 }],
      coste_total: 400,
      request_id: 'A1'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.estado, 'GENERA');
    assert.strictEqual(res.data.cuadro.ingresos, 500);
    assert.strictEqual(res.data.cuadro.coste_total, 400);
    assert.strictEqual(res.data.cuadro.flujo_a_caja, 100);
    assert.ok(bus.published.some(([n]) => n === 'nichos.salud.actualizada'), 'publica nichos.salud.actualizada');
    assert.ok(bus.published.some(([n]) => n === 'nichos.cuadro.flujo_a_caja'), 'publica nichos.cuadro.flujo_a_caja');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.salud.actualizar.response' && v.request_id === 'A1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('actualizar: coste sobre el techo y > ingresos → SANGRA', async () => {
    const res = await instance.onActualizarRequest({ data: {
      project_id: 'p2',
      rol: 'SISTEMA_SALUD',
      cobros: [{ importe: 200 }],
      coste_total: 1200
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.estado, 'SANGRA');
    assert.strictEqual(res.data.cuadro.flujo_a_caja, -1000);
  });

  await testAsync('actualizar: coste == ingresos (sin cruzar techo) → NEUTRO', async () => {
    const res = await instance.onActualizarRequest({ data: {
      project_id: 'p3',
      rol: 'SISTEMA_SALUD',
      cobros: [{ importe: 150 }],
      coste_total: 150
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.estado, 'NEUTRO');
  });

  await testAsync('leer: devuelve el cuadro (no muta)', async () => {
    const res = await instance.onLeerRequest({ data: { project_id: 'p1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.cuadro.estado, 'GENERA');
    assert.strictEqual(res.data.cuadro.ingresos, 500);
  });

  await testAsync('estadoDe: alias para C7/K1 devuelve el estado', () => {
    assert.strictEqual(instance.estadoDe('p1'), 'GENERA');
    assert.strictEqual(instance.estadoDe('p2'), 'SANGRA');
  });

  await testAsync('calcularEstado: proyección pura determinista (medida de hechos)', () => {
    assert.strictEqual(instance._calcularEstado(300, 100), 'GENERA');
    assert.strictEqual(instance._calcularEstado(100, 1200), 'SANGRA');
    assert.strictEqual(instance._calcularEstado(100, 100), 'NEUTRO');
    assert.strictEqual(instance._calcularEstado(0, 0), 'NEUTRO');
  });

  await testAsync('actualizar: second-writer != SISTEMA_SALUD → rechazado + nichos.salud.actualizar.failed', async () => {
    const res = await instance.onActualizarRequest({ data: { project_id: 'p1', rol: 'ANALISTA', cobros: [], coste_total: 10, request_id: 'A2' } });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.error.code, 'PERMISSION_DENIED');
    assert.ok(bus.published.some(([n]) => n === 'nichos.salud.actualizar.failed'), 'cierra el círculo con el par de fallo');
    const leido = await instance.onLeerRequest({ data: { project_id: 'p1' } });
    assert.strictEqual(leido.data.cuadro.ingresos, 500, 'la escritura rechazada NO se aplica');
  });

  await testAsync('actualizar: coste inválido (negativo) → failed', async () => {
    const res = await instance.onActualizarRequest({ data: { project_id: 'p1', rol: 'SISTEMA_SALUD', cobros: [], coste_total: -5, request_id: 'A3' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'COSTE_INVALIDO');
    assert.ok(bus.published.some(([n]) => n === 'nichos.salud.actualizar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('project.activated restaura el cuadro de otro proyecto', async () => {
    instance._cuadros.set('p9', { esquema: 'nichos-cuadro-salud-v1', estado: 'GENERA', ingresos: 800, coste_total: 300, flujo_a_caja: 500, techo_sangria: 1000, periodo: 'semana' });
    await instance.onProjectActivated({ data: { project_id: 'p9' } });
    const res = await instance.onLeerRequest({ data: { project_id: 'p9' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.cuadro.estado, 'GENERA', 'cuadro restaurado');
    assert.strictEqual(res.data.cuadro.coste_total, 300);
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja F3', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), [
      'nichos.salud.actualizar.request',
      'nichos.cuadro.leer.request',
      'nichos.cobro_registrado',
      'nichos.coste_imputado',
      'project.activated'
    ].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.salud.actualizada', 'nichos.cuadro.flujo_a_caja', 'nichos.salud.actualizar.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

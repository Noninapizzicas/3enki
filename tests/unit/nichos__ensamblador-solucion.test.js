/**
 * Test unitario — nichos/ensamblador-solucion (D1, micro-agente fuzzy)
 *
 * Cubre: RPC construir (éxito con LLM -> solicitud + montaje, fallback reflejo
 * sin LLM, sin capacidades -> failed, falta capacidad esencial -> failed),
 * fire-and-forget desde nichos.camino.decidido (solo CONSTRUIR ensambla), y la
 * exactitud de subscribes ↔ handlers / publishes.
 *
 * Ejecutar: node tests/unit/nichos__ensamblador-solucion.test.js
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

const CAPACIDADES = [
  { id: 'web-checkout', descripcion: 'Checkout web de pago' },
  { id: 'email-delivery', descripcion: 'Entrega por email' },
  { id: 'captura-leads', descripcion: 'Captura de leads' }
];

const NICHOS = { producto: 'suscripcion de informes', audiencia: 'agentes inmobiliarios' };

const LLM_OK = { status: 200, data: { content: JSON.stringify({
  especificacion: {
    nombre: 'Suscripción de informes inmobiliarios',
    descripcion: 'Informes + cobro',
    capacidades: [
      { id: 'captura-leads', rol: 'captura' },
      { id: 'email-delivery', rol: 'entrega' },
      { id: 'web-checkout', rol: 'cobro' }
    ],
    faltante: null
  }
}) } };

(async () => {
  console.log('nichos/ensamblador-solucion — micro-agente (D1)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'ensamblador-solucion');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(instance._persist, undefined, 'micro-agente: sin PosPersistencia (stateless)');

  await testAsync('construir con LLM → especificación + montaje y publica nichos.solucion.construida', async () => {
    instance._rpc = async () => LLM_OK;
    const res = await instance.onConstruirRequest({ data: {
      project_id: 'p1', nicho: NICHOS, capacidades: CAPACIDADES, request_id: 'C1'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.construida, true);
    assert.strictEqual(res.data.especificacion.nombre, 'Suscripción de informes inmobiliarios');
    assert.strictEqual(res.data.especificacion.capacidades.length, 3);
    assert.strictEqual(res.data.solucion.operativa, true);
    assert.strictEqual(res.data.solucion.piezas.length, 3);
    // usa SOLO capacidades del catálogo
    assert.deepStrictEqual(res.data.solucion.piezas.map(p => p.id).sort(),
      ['captura-leads', 'email-delivery', 'web-checkout'].sort());
    assert.ok(bus.published.some(([n]) => n === 'nichos.solucion.construida'), 'publica nichos.solucion.construida');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.solucion.construir.response' && v.request_id === 'C1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('fallback reflejo cuando el LLM no responde (monta sobre capacidades reales)', async () => {
    instance._rpc = async () => ({ status: 500, data: {} });
    const res = await instance.onConstruirRequest({ data: {
      project_id: 'p2', nicho: { nombre: 'Nicho test' }, capacidades: CAPACIDADES
    } });
    assert.strictEqual(res.status, 200, 'no rompe el pipeline si el LLM cae');
    assert.strictEqual(res.data.construida, true);
    assert.ok(res.data.solucion.piezas.length >= 1, 'reflejo garantiza un ensamblaje con 1+ pieza');
  });

  await testAsync('sin capacidades → la especificación no es componible → nichos.solucion.construir.failed', async () => {
    instance._rpc = async () => LLM_OK;
    const res = await instance.onConstruirRequest({ data: {
      project_id: 'p3', nicho: NICHOS, capacidades: [], request_id: 'C2'
    } });
    assert.strictEqual(res.status, 502);
    assert.strictEqual(res.error.code, 'SIN_ESPECIFICACION');
    assert.ok(bus.published.some(([n]) => n === 'nichos.solucion.construir.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('falta capacidad esencial de entrega/cobro sin declarar faltante → no se monta a medias -> failed', async () => {
    // especificación incompleta: solo captura, sin rol esencial y sin faltante declarado
    instance._rpc = async () => ({ status: 200, data: { content: JSON.stringify({
      especificacion: { nombre: 'x', descripcion: 'x', capacidades: [{ id: 'captura-leads', rol: 'captura' }], faltante: null }
    }) } });
    const res = await instance.onConstruirRequest({ data: { project_id: 'p6', nicho: NICHOS, capacidades: [{ id: 'captura-leads', descripcion: 'Captura' }], request_id: 'C4' } });
    // sin rol de entrega/cobro y sin faltante declarado -> no se monta a medias (INVARIANTE)
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'FALTA_CAPACIDAD_ESENCIAL');
    assert.ok(bus.published.some(([n]) => n === 'nichos.solucion.construir.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('nicho inválido (sin object) → failed', async () => {
    instance._rpc = async () => LLM_OK;
    const res = await instance.onConstruirRequest({ data: { project_id: 'p4', nicho: null, capacidades: CAPACIDADES, request_id: 'C3' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
    assert.ok(bus.published.some(([n]) => n === 'nichos.solucion.construir.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('fire-and-forget nichos.camino.decidido: CONSTRUIR ensambla; ENCONTRAR no', async () => {
    instance._rpc = async () => LLM_OK;
    const con = await instance.onCaminoDecidido({ data: { project_id: 'p5', nicho: NICHOS, capacidades: CAPACIDADES, camino: 'CONSTRUIR' } });
    assert.strictEqual(con.status, 200);
    assert.ok(bus.published.some(([n]) => n === 'nichos.solucion.construida'), 'publica nichos.solucion.construida');
    const buscar = await instance.onCaminoDecidido({ data: { project_id: 'p5', nicho: NICHOS, camino: 'ENCONTRAR' } });
    assert.strictEqual(buscar, null, 'ENCONTRAR no pide ensamblaje');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja D1', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), [
      'nichos.solucion.construir.request',
      'nichos.camino.decidido'
    ].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.solucion.construida', 'nichos.solucion.construir.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

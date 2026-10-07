/**
 * Test unitario — nichos/cola-decisiones-gate (K2, custodio con persistencia)
 *
 * Cubre: encolar por RPC → publica nichos.gate_encolado; auto-encolar por
 * fire-and-forget (nichos.gate.solicitado / puente/alerta); resolver FIFO → 
 * publica nichos.gate_resuelto y nichos.decision.resuelta; resolver sin cola →
 * failed; second-rol != DUEÑO → rechazado; listar; project.activated restaura;
 * y la exactitud de subscribes ↔ handlers / publishes de la hoja K2.
 *
 * Ejecutar: node tests/unit/nichos__cola-decisiones-gate.test.js
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
  console.log('nichos/cola-decisiones-gate — custodio con persistencia (K2)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'cola-decisiones-gate');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._persist, 'object', 'custodio: tiene PosPersistencia');
  assert.strictEqual(typeof instance.onProjectActivated, 'function', 'custodio: restaura en project.activated');

  await testAsync('encolar por RPC → publica nichos.gate_encolado', async () => {
    const res = await instance.onEncolarRequest({ data: { project_id: 'p1', solicitud: { tipo: 'GATE_OPERAR', nicho: 'pan-artesano', descripcion: '¿operamos?' }, request_id: 'K1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.encolado, true);
    assert.strictEqual(res.data.posicion, 1);
    assert.ok(bus.published.some(([n]) => n === 'nichos.gate_encolado'), 'publica nichos.gate_encolado');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.gate.encolar.response' && v.request_id === 'K1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('auto-encolar por fire-and-forget (nichos.puente_solicitado)', async () => {
    const res = await instance.onSolicitudRecibida({ data: { project_id: 'p1', nicho: 'queso', descripcion: 'construye a mano' }, event: 'nichos.puente_solicitado' });
    assert.strictEqual(res.status, 200);
    const l = await instance.onListarRequest({ data: { project_id: 'p1' } });
    assert.strictEqual(l.data.numero_en_cola, 2);
    assert.strictEqual(l.data.solicitudes[1].tipo, 'PUENTE_HUMANO', 'tipo inferido del evento');
  });

  await testAsync('resolver FIFO → publica nichos.gate_resuelto y nichos.decision.resuelta', async () => {
    const res = await instance.onResolverRequest({ data: { project_id: 'p1', rol: 'DUEÑO', resolucion: 'APRUEBA', request_id: 'K2' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.solicitud.nicho, 'pan-artesano', 'FIFO: la mas antigua primero');
    assert.strictEqual(res.data.resolucion, 'APRUEBA');
    assert.ok(bus.published.some(([n]) => n === 'nichos.gate_resuelto'), 'publica nichos.gate_resuelto');
    assert.ok(bus.published.some(([n]) => n === 'nichos.decision.resuelta'), 'publica nichos.decision.resuelta');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.gate.resolver.response' && v.request_id === 'K2');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('resolver: rol != DUEÑO → rechazado + par de fallo', async () => {
    const res = await instance.onResolverRequest({ data: { project_id: 'p1', rol: 'MONITOR', resolucion: 'APRUEBA' } });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.error.code, 'PERMISSION_DENIED');
  });

  await testAsync('resolver: resolución inválida → failed', async () => {
    const res = await instance.onResolverRequest({ data: { project_id: 'p1', rol: 'DUEÑO', resolucion: 'QUIZAS' } });
    assert.strictEqual(res.status, 400);
    assert.ok(bus.published.some(([n]) => n === 'nichos.gate.encolar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('resolver con cola vacía → failed (COLA_VACIA)', async () => {
    const res = await instance.onResolverRequest({ data: { project_id: 'pV', rol: 'DUEÑO', resolucion: 'APRUEBA' } });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.error.code, 'COLA_VACIA');
  });

  await testAsync('HIDRATACIÓN: resolver tras reinicio hidrata del disco (no COLA_VACIA)', async () => {
    // Bug real medido en vivo (1-oct-2026): tras reiniciar enki el store en
    // MEMORIA está vacío y la persistencia solo restaura en project.activated.
    // Resolver la primera decisión devolvía COLA_VACIA aunque el DISCO tuviera
    // solicitudes (2 en disco, 0 en memoria). La proyección debe HIDRATAR antes
    // de resolver (y de listar): el disco manda, la memoria es caché.
    const pid = 'preinicio';
    assert.ok(!instance._colas.has(pid), 'arranca con memoria vacía (simula reinicio)');
    const orig = instance._persist.restaurar.bind(instance._persist);
    instance._persist.restaurar = async (p) => {
      if (p === pid) {
        instance._colas.set(p, { esquema: 'nichos-cola-decisiones-gate-v1', solicitudes: [
          { id: 'd1', tipo: 'GATE_OPERAR', nicho: 'pan-del-disco', solicitado_en: 't' }
        ] });
      }
      return orig(p);
    };
    const res = await instance.onResolverRequest({ data: { project_id: pid, rol: 'DUEÑO', resolucion: 'APRUEBA' } });
    assert.strictEqual(res.status, 200, 'resuelve la solicitud del disco, no COLA_VACIA');
    assert.strictEqual(res.data.solicitud.nicho, 'pan-del-disco');
    instance._persist.restaurar = orig;
  });

  await testAsync('PÉRDIDA DE IDENTIDAD: nicho OBJETO sin nicho_id → nicho_id STRING (nunca objeto)', async () => {
    // Bug real medido en vivo (30-sep-2026): camino-encontrar-construir publica la
    // solicitud con la OPCIÓN DE NICHO completa (objeto) y sin nicho_id. `nicho_id ||
    // nicho` heredaba el OBJETO entero -> el pipeline no podía casar el nicho con su
    // máquina (misma clase que el '[object Object]' del pipeline). Debe salir string.
    const res = await instance.onEncolarRequest({ data: {
      project_id: 'pobj', tipo: 'CAMINO_CONSTRUIR_ALTO_RIESGO',
      solicitud: { tipo: 'CAMINO_CONSTRUIR_ALTO_RIESGO', nicho: { producto: 'Instalación de placas solares', audiencia: 'empresas' } },
      request_id: 'OBJ1'
    } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(typeof res.data.solicitud.nicho_id, 'string', 'nicho_id es STRING, no objeto');
    assert.ok(res.data.solicitud.nicho_id.length > 0, 'nicho_id no vacío');

    // Y al resolver, el nicho_id del evento también es string (el pipeline lo necesita).
    const r2 = await instance.onResolverRequest({ data: { project_id: 'pobj', rol: 'DUEÑO', resolucion: 'APRUEBA', request_id: 'OBJ2' } });
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(typeof r2.data.nicho_id, 'string', 'nicho_id string también al resolver');
  });

  await testAsync('listar: devuelve la cola (no muta)', async () => {
    const res = await instance.onListarRequest({ data: { project_id: 'p1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.numero_en_cola, 1, 'quedó solo queso tras resolver pan-artesano');
    assert.strictEqual(res.data.solicitudes[0].nicho, 'queso');
  });

  await testAsync('project.activated restaura la cola de otro proyecto', async () => {
    instance._colas.set('n9', { esquema: 'nichos-cola-decisiones-gate-v1', solicitudes: [{ id: 's1', tipo: 'ALERTA_SANGRIA', nicho: 'x', solicitado_en: 't' }] });
    await instance.onProjectActivated({ data: { project_id: 'n9' } });
    const res = await instance.onListarRequest({ data: { project_id: 'n9' } });
    assert.strictEqual(res.data.numero_en_cola, 1, 'cola restaurada');
    assert.strictEqual(res.data.solicitudes[0].tipo, 'ALERTA_SANGRIA');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja K2', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), [
      'nichos.alerta.sangria',
      'nichos.gate.encolar.request',
      'nichos.gate.resolver.request',
      'nichos.gate.solicitado',
      'nichos.puente_solicitado',
      'project.activated'
    ].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, [
      'nichos.decision.resuelta',
      'nichos.gate.encolar.failed',
      'nichos.gate_encolado',
      'nichos.gate_resuelto'
    ].sort());
    assert.strictEqual(typeof instance._encolar, 'function', 'proyección _encolar presente');
    assert.strictEqual(typeof instance._resolverSiguiente, 'function', 'proyección _resolverSiguiente presente');
    assert.strictEqual(typeof instance._listar, 'function', 'proyección _listar presente');
  });

  console.log('\nTodos los tests pasaron.');
})();

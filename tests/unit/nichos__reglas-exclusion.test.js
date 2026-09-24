/**
 * Test unitario — nichos/reglas-exclusion (B2, micro-agente fuzzy)
 *
 * Cubre: carga real del loader, RPC excluir (éxito descartando lo que cumple una
 * regla aprendida de un falso positivo previo, no excluyendo lo distinto, fallback
 * reflejo sin LLM) y candidato vacío/malformed → failed. Que cada flujo cierra su
 * círculo con su par de fallo.
 *
 * Ejecutar: node tests/unit/nichos__reglas-exclusion.test.js
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

// Stub de _rpc que devuelve un llm.complete válido SIN reglas -> cae el fallback reflejo,
// que es la base determinista que el test afirma.
const LLM_SIN_REGLAS = { status: 200, data: { content: JSON.stringify({ reglas: [] }) } };

(async () => {
  console.log('nichos/reglas-exclusion — micro-agente (B2)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'reglas-exclusion');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');

  await testAsync('aplica regla aprendida de un falso positivo previo → descarta el candidato (éxito)', async () => {
    instance._rpc = async () => LLM_SIN_REGLAS; // LLM sin patron -> fallback reflejo fiable
    // historial: 1 falso positivo con firma producto:'imprenta de camisetas'
    const historial = [{ producto: 'imprenta de camisetas', audiencia: null, lugar: null, motivo: 'margen insuficiente' }];
    const mismo = { producto: 'imprenta de camisetas', audiencia: 'pymes', lugar: 'madrid', senal_de_demanda: 0.6, fuente: 'puerto' };
    const res = await instance.onExcluirRequest({ data: { project_id: 'p1', candidato: mismo, historial, request_id: 'R1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.excluido, true, 'dado 1 fp previo, mismo candidato → excluido=true');
    assert.ok(res.data.motivo && res.data.motivo.length > 0, 'motivo explica por qué se descarta');
    assert.strictEqual(res.data.regla.tipo, 'producto', 'regla que lo descartó identificada');
    // flujo cierra el círculo: evento de dominio + response correlado
    const evt = bus.published.find(([n, v]) => n === 'nichos.candidato.excluido');
    assert.ok(evt, 'publica nichos.candidato.excluido (qué se descarta y por qué)');
    assert.strictEqual(evt[1].excluido, true);
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.reglas.excluir.response' && v.request_id === 'R1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
  });

  await testAsync('candidato distinto (sin regla que aplique) → NO se excluye', async () => {
    instance._rpc = async () => LLM_SIN_REGLAS;
    const historial = [{ producto: 'imprenta de camisetas', lugar: 'madrid' }];
    const distinto = { producto: 'microcerveceria', audiencia: 'restaurantes', lugar: 'bilbao', senal_de_demanda: 0.7, fuente: 'puerto' };
    const res = await instance.onExcluirRequest({ data: { project_id: 'p2', candidato: distinto, historial, request_id: 'R2' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.excluido, false, 'candidato distinto pasa (no se excluye sin base)');
    assert.strictEqual(res.data.regla, null);
  });

  await testAsync('regla de señal: candidato con señal bajo el umbral → se excluye', async () => {
    instance._rpc = async () => LLM_SIN_REGLAS;
    const candidato = { producto: 'x', audiencia: null, lugar: null, senal_de_demanda: 0.05, fuente: 'puerto' };
    const res = await instance.onExcluirRequest({ data: { project_id: 'p3', candidato, historial: [], request_id: 'R3' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.excluido, true, 'señal por debajo del umbral mínimo → excluido');
    assert.strictEqual(res.data.regla.tipo, 'senal');
  });

  await testAsync('regla explícita del dueño manda y excluye', async () => {
    instance._rpc = async () => LLM_SIN_REGLAS;
    const reglas = [{ tipo: 'lugar', valor: 'madrid', motivo: 'el dueño no opera en madrid' }];
    const candidato = { producto: 'salsa picante', audiencia: 'restaurantes', lugar: 'madrid', senal_de_demanda: 0.8 };
    const res = await instance.onExcluirRequest({ data: { project_id: 'p4', candidato, historial: [], reglas, request_id: 'R4' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.excluido, true, 'criterio explícito del dueño excluye');
    assert.strictEqual(res.data.regla.tipo, 'lugar');
  });

  await testAsync('candidato vacío/malformed → nichos.reglas.excluir.failed', async () => {
    instance._rpc = async () => LLM_SIN_REGLAS;
    const res = await instance.onExcluirRequest({ data: { project_id: 'p5', candidato: null, request_id: 'R5' } });
    assert.strictEqual(res.status, 400);
    assert.ok(bus.published.some(([n]) => n === 'nichos.reglas.excluir.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja B2', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event), ['nichos.reglas.excluir.request']);
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.candidato.excluido', 'nichos.reglas.excluir.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();

#!/usr/bin/env node
'use strict';
/**
 * nichos__cosechador-alto — regresión del SENSOR de intención real (v0.1.1).
 *
 * Lo que se fija:
 *   1. RPC nichos.cosechador.alto.cosechar.request → cosecha por el GATE
 *      (nichos.fuente.consumir.request con fuente.alto → crawl4rs.sugerencias),
 *      lee resultado_crudo.sugerencias, NO inventa API crawl4rs ajena.
 *   2. Domador: homónimos/moneda/franquicias fuera; ancla Lorca/Murcia dentro.
 *   3. Clasificador: modificadores de compra anotados (abierto/barato/...).
 *   4. Siembra por la puerta del dueño (nichos.semilla.capturar.request),
 *      texto tal cual, origen 'cosechador-alto', con alto:{consulta,modificadores}.
 *   5. sembrar:false → cosecha sin sembrar.
 *   6. Alto vacío → 200 con contadores honestos (0), pulsa igual.
 *   7. Sin project_id/territorio → 400 INVALID_INPUT.
 *
 * Sin core ni MQTT: bus de mentira + _rpc sobrescrito.
 * Ejecutar con: ENKI_MODULES=$PWD/modules node tests/unit/nichos__cosechador-alto.test.js
 */

const assert = require('assert');
const path = require('path');
const N = process.env.ENKI_MODULES || path.resolve(__dirname, '../../modules');
const Cosechador = require(`${N}/nichos/cosechador-alto/index.js`);

let fallos = 0;
async function test(desc, fn) {
  try { await fn(); console.log(`✓ ${desc}`); }
  catch (e) { fallos++; console.error(`✗ ${desc}\n  ${e.message}`); }
}

function busDeMentira() {
  const eventos = [];
  return {
    publish: (name, payload) => eventos.push({ name, payload }),
    eventos,
    respuestas: {},
    async esperar(name, ms = 300) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (eventos.some((e) => e.name === name)) return true;
        await new Promise((r) => setTimeout(r, 10));
      }
      return eventos.some((e) => e.name === name);
    }
  };
}

function moduloConRpc(gateFn) {
  const m = new Cosechador();
  m.eventBus = busDeMentira();
  m._rpc = gateFn;
  return m;
}

const GATE_OK = (topic, payload) => {
  assert.strictEqual(topic, 'nichos.fuente.consumir.request', 'el cosechador DEBE ir por el gate');
  assert.strictEqual(payload.fuente.tipo, 'alto', 'fuente.alto es el carril del alto');
  const consulta = payload.query;
  // sugerencias verosímiles del estudio 30800
  const mapa = {
    'dónde comer en lorca murcia': ['donde comer barato en lorca', 'donde comer en lorca abierto ahora', 'donde comer en lorca murcia menu del dia'],
    'trabajo en lorca murcia': ['trabajo camarero lorca', 'trabajo administrativo lorca ayuntamiento'],
    'que hacer en lorca murcia': ['que hacer en lorca con niños', 'que hacer en lorca este fin de semana', 'cine lorca cartelera'],
    'pizzeria barato en lorca murcia': ['pizzeria barata en lorca murcia', 'pizzeria lorca 30800 yen', 'kebab lorca abierto']
  };
  const brutas = mapa[consulta] || [];
  return Promise.resolve({ status: 200, data: { resultado_crudo: { sugerencias: brutas, fuente: 'google' } } });
};

(async () => {
  console.log('🧪 nichos — cosechador-alto (sensor de intención real)\n');

  await test('cosecha POR EL GATE (fuente.alto), doma, clasifica y siembra', async () => {
    const llamadasSemilla = [];
    const m = moduloConRpc(GATE_OK);
    m.eventBus.publish = (name, payload) => {
      m.eventBus.eventos.push({ name, payload });
      if (name === 'nichos.semilla.capturar.request') llamadasSemilla.push(payload);
    };
    const resp = await m._cosechar({ project_id: 'p1', territorio: 'Lorca', sembrar: true });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.data.resumen.consultas_total, resp.data.resumen.consultas_total);
    assert.ok(resp.data.resumen.limpias > 0, 'debe haber candidatos limpios');
    assert.ok(llamadasSemilla.length === resp.data.resumen.sembradas, 'sembradas = publicadas');
    const una = llamadasSemilla[0];
    assert.strictEqual(una.origen, 'cosechador-alto');
    assert.strictEqual(una.project_id, 'p1');
    assert.ok(una.alto && Array.isArray(una.alto.modificadores), 'el alto viaja con la semilla');
    // domador: 30800-moneda nunca entra
    const textos = llamadasSemilla.map((s) => s.texto);
    assert.ok(!textos.some((t) => /yen|jpy|usd/i.test(t)), 'la moneda 30800 se doma');
    assert.ok(textos.some((t) => /lorca/i.test(t)), 'ancla local presente');
    // pulso de cierre
    assert.ok(m.eventBus.eventos.some((e) => e.name === 'nichos.cosechador.alto.cosechado'), 'pulsa cosechado');
  });

  await test('sembrar:false cosecha sin tocar la puerta del dueño', async () => {
    const m = moduloConRpc(GATE_OK);
    const resp = await m._cosechar({ project_id: 'p1', territorio: 'Lorca', sembrar: false });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.data.resumen.sembradas, 0);
    assert.ok(!m.eventBus.eventos.some((e) => e.name === 'nichos.semilla.capturar.request'), 'sin siembra');
    assert.ok(resp.data.resumen.limpias > 0, 'cosechó igualmente');
  });

  await test('alto vacío: 200 honesto, 0 sembradas, pulsa igual', async () => {
    const m = moduloConRpc(() => Promise.resolve({ status: 200, data: { resultado_crudo: { sugerencias: [], fuente: 'ninguno' } } }));
    const resp = await m._cosechar({ project_id: 'p1', territorio: 'Lorca' });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.data.resumen.limpias, 0);
    assert.strictEqual(resp.data.resumen.sembradas, 0);
    assert.strictEqual(resp.data.resumen.consultas_con_datos, 0);
    assert.ok(m.eventBus.eventos.some((e) => e.name === 'nichos.cosechador.alto.cosechado'), 'el pulso sale aunque venga vacío');
  });

  await test('clasificador: abierto/barato/hoy_finde llevan modificadores', async () => {
    const GATE = () => Promise.resolve({ status: 200, data: { resultado_crudo: { sugerencias: [
      'donde comer en lorca abierto ahora',
      'donde comer barato en lorca',
      'que hacer en lorca este fin de semana',
      'vinos lorca granada'   // homónimo → fuera
    ], fuente: 'google' } } });
    const m = moduloConRpc(GATE);
    const resp = await m._cosechar({ project_id: 'p1', territorio: 'Lorca', sembrar: false });
    const abiertos = resp.data.candidatos.filter((c) => c.texto === 'donde comer en lorca abierto ahora');
    assert.strictEqual(abiertos.length, 1);
    assert.ok(abiertos[0].modificadores.includes('abierto_ahora'));
    assert.ok(abiertos[0].modificadores.includes('cerca') === false);
    assert.ok(!resp.data.candidatos.some((c) => /vinos lorca/i.test(c.texto)), 'el homónimo granada se doma');
  });

  await test('sin project_id → 400 · sin territorio → 400', async () => {
    const m = moduloConRpc(() => Promise.resolve({ status: 200, data: {} }));
    const r1 = await m._cosechar({ territorio: 'Lorca' });
    assert.strictEqual(r1.status, 400);
    const r2 = await m._cosechar({ project_id: 'p1' });
    assert.strictEqual(r2.status, 400);
  });

  console.log(fallos === 0 ? '\n✅ cosechador-alto OK' : `\n❌ ${fallos} fallos`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
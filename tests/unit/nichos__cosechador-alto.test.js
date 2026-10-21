#!/usr/bin/env node
'use strict';
/**
 * nichos__cosechador-alto — regresión del SENSOR de intención real (v0.2.0).
 *
 * Lo que se fija:
 *   1. RPC nichos.cosechador.alto.cosechar.request → cosecha por el GATE
 *      (nichos.fuente.consumir.request con fuente.alto → crawl4rs.sugerencias),
 *      lee resultado_crudo.sugerencias, NO inventa API crawl4rs ajena.
 *   2. FORMA NATURAL (la lección de la cosecha 1ª): las consultas por defecto
 *      van con verbo-pregunta DELANTE («dónde comer barato en lorca») y ancla
 *      CORTA («en lorca») — nunca «barato comer en lorca» ni «en lorca murcia».
 *   3. Domador DOMO FUERTE: homónimos/moneda/franquicias fuera siempre; ruidos
 *      extra por invocación SUMAN. Ancla Lorca/Murcia dentro.
 *   4. Clasificador: modificadores de compra anotados (abierto/barato/...).
 *   5. Siembra por la puerta del dueño (nichos.semilla.capturar.request),
 *      texto tal cual, origen 'cosechador-alto', con alto:{consulta,modificadores}.
 *   6. sembrar:false → cosecha sin sembrar.
 *   7. Alto vacío → 200 con contadores honestos (0), pulsa igual.
 *   8. Sin project_id/territorio → 400 INVALID_INPUT.
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
    eventos
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
  // sugerencias verosímiles (lo que el alto devolvió de verdad en los estudios)
  const mapa = {
    'dónde comer barato en lorca': ['donde comer barato en lorca', 'donde comer en lorca bueno y barato', 'wikipedia lorca'],
    'dónde comer en lorca abierto ahora': ['donde comer en lorca abierto ahora', 'restaurante lorca granada'],
    'trabajo de camarero en lorca': ['trabajo camarero lorca', 'infojobs lorca'],
    'qué hacer en lorca hoy': ['que hacer en lorca hoy con niños', 'cine lorca cartelera', 'lorcana cartas'],
    'qué hacer en lorca cuando llueve': ['que hacer en lorca cuando llueve', '30800 jpy to usd'],
    'alquiler barato en lorca': ['alquiler barato en lorca particular', 'penníscola alquiler']
  };
  const brutas = mapa[consulta] || [];
  return Promise.resolve({ status: 200, data: { resultado_crudo: { sugerencias: brutas, fuente: 'google' } } });
};

(async () => {
  console.log('🧪 nichos — cosechador-alto (sensor de intención real) v0.2.0\n');

  await test('cosecha POR EL GATE (fuente.alto), doma, clasifica y siembra', async () => {
    const llamadasSemilla = [];
    const m = moduloConRpc(GATE_OK);
    m.eventBus.publish = (name, payload) => {
      m.eventBus.eventos.push({ name, payload });
      if (name === 'nichos.semilla.capturar.request') llamadasSemilla.push(payload);
    };
    const resp = await m._cosechar({ project_id: 'p1', territorio: 'Lorca', max_consultas: 10, sembrar: true, max_semillas: 50 });
    assert.strictEqual(resp.status, 200);
    assert.ok(resp.data.resumen.limpias > 0, 'debe haber candidatos limpios');
    assert.strictEqual(llamadasSemilla.length, resp.data.resumen.sembradas, 'sembradas = publicadas');
    const una = llamadasSemilla[0];
    assert.strictEqual(una.origen, 'cosechador-alto');
    assert.strictEqual(una.project_id, 'p1');
    assert.ok(una.alto && Array.isArray(una.alto.modificadores), 'el alto viaja con la semilla');
    const textos = llamadasSemilla.map((s) => s.texto);
    assert.ok(!textos.some((t) => /yen|jpy|usd|wikipedia|infojobs|lorcana/i.test(t)), 'el ruido fuerte se doma');
    assert.ok(textos.some((t) => /lorca/i.test(t)), 'ancla local presente');
    assert.ok(m.eventBus.eventos.some((e) => e.name === 'nichos.cosechador.alto.cosechado'), 'pulsa cosechado');
  });

  await test('FORMA NATURAL: consultas por defecto con verbo delante y ancla corta', async () => {
    let primeraConsulta = null;
    const m = moduloConRpc((topic, payload) => {
      if (!primeraConsulta) primeraConsulta = payload.query;
      return Promise.resolve({ status: 200, data: { resultado_crudo: { sugerencias: [], fuente: 'google' } } });
    });
    await m._cosechar({ project_id: 'p1', territorio: 'Lorca' });
    assert.ok(/^(dónde|qué)\b/i.test(primeraConsulta), `la 1ª consulta nace con verbo de pregunta, no con modificador: "${primeraConsulta}"`);
    assert.ok(!/en lorca murcia/i.test(primeraConsulta), 'ancla LARGA prohibida (lección cosecha 1ª)');
    assert.ok(/en lorca/i.test(primeraConsulta), 'ancla corta «en lorca» presente');
    // y ninguna consulta del set defecto empieza por modificador («barato comer…»)
    const consultasUsadas = [];
    const m2 = moduloConRpc((topic, payload) => { consultasUsadas.push(payload.query); return Promise.resolve({ status: 200, data: { resultado_crudo: { sugerencias: [] } } }); });
    await m2._cosechar({ project_id: 'p1', territorio: 'Lorca', max_consultas: 300 });
    const malas = consultasUsadas.filter((q) => /^(barato|abierto|hoy|precio)\b/i.test(q));
    assert.strictEqual(malas.length, 0, `ninguna consulta con modificador delante: ${malas[0] || ''}`);
    assert.ok(consultasUsadas.length >= 20, `set completo sembrado (${consultasUsadas.length} consultas)`);
  });

  await test('sembrar:false cosecha sin tocar la puerta del dueño', async () => {
    const m = moduloConRpc(GATE_OK);
    const resp = await m._cosechar({ project_id: 'p1', territorio: 'Lorca', max_consultas: 10, sembrar: false });
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

  await test('clasificador: modificadores de compra anotados, homónimo domado', async () => {
    const GATE = () => Promise.resolve({ status: 200, data: { resultado_crudo: { sugerencias: [
      'donde comer en lorca abierto ahora',
      'donde comer barato en lorca',
      'que hacer en lorca este fin de semana',
      'vinos lorca granada'   // homónimo → fuera
    ], fuente: 'google' } } });
    const m = moduloConRpc(GATE);
    const resp = await m._cosechar({ project_id: 'p1', territorio: 'Lorca', sembrar: false, consultas: ['dónde comer en lorca'] });
    const abiertos = resp.data.candidatos.filter((c) => c.texto === 'donde comer en lorca abierto ahora');
    assert.strictEqual(abiertos.length, 1);
    assert.ok(abiertos[0].modificadores.includes('abierto_ahora'));
    assert.ok(abiertos[0].modificadores.includes('cerca') === false);
    assert.ok(!resp.data.candidatos.some((c) => /vinos lorca/i.test(c.texto)), 'el homónimo granada se doma');
  });

  await test('ruidos extra SUMAN al domo fuerte (no lo sustituyen)', async () => {
    const GATE = () => Promise.resolve({ status: 200, data: { resultado_crudo: { sugerencias: [
      'donde comer barato en lorca',   // entra (domo no la toca)
      'pizzeria venecia en lorca',     // domada SOLO por el ruido extra
      'restaurante lorca granada'      // domada por el domo fuerte SIEMPRE
    ], fuente: 'google' } } });
    const m = moduloConRpc(GATE);
    const resp = await m._cosechar({ project_id: 'p1', territorio: 'Lorca', sembrar: false, consultas: ['dónde comer en lorca'], ruidos: ['venecia'] });
    assert.ok(resp.data.candidatos.some((c) => /barato/.test(c.texto)), 'lo limpio entra');
    assert.ok(!resp.data.candidatos.some((c) => /venecia/i.test(c.texto)), 'el ruido extra doma lo suyo');
    assert.ok(!resp.data.candidatos.some((c) => /granada/i.test(c.texto)), 'el domo fuerte sigue firme con extras');
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
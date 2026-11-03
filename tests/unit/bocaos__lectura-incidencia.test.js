'use strict';

/**
 * bocaos/lectura-incidencia — F07.
 *
 * Lo que se vigila:
 *   1. LISTA CERRADA: cinco etiquetas. Una etiqueta inventada por el modelo se rechaza y se dice cuál.
 *   2. NO ES JUEZ: la respuesta y el hecho dicen `es_juez: false` y `dice_si_hubo_fallo: false`.
 *   3. SI SE CAE, EL CASO SIGUE: sin modelo, con el modelo caído o tardando → `lectura_ambigua` y
 *      `sigue_su_curso: true`. Nunca una incidencia bloqueada por el borde.
 *   4. El relato no se reescribe ni se recorta en el hecho: sólo se lee.
 *
 * Ejecutar: node tests/unit/bocaos__lectura-incidencia.test.js
 */

const assert = require('assert');
const LecturaIncidencia = require('../../modules/bocaos/lectura-incidencia/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const RELATO = 'No encontraba el portal, el portero no estaba y no sabía qué hacer.';

function nuevo({ llm = null, timeout = 150 } = {}) {
  const publicados = [];
  const m = new LecturaIncidencia();
  m.name = 'lectura-incidencia';
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m.llm = llm;
  m.llm_timeout_ms = timeout;
  return { m, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const clasificar = (m, extra = {}) => m.onClasificarRequest({ request_id: 'c1', data: {
  project_id: PLAZA, plaza_id: PLAZA, pedido_id: 'ped-1', incidencia_id: 'inc-1', relato: RELATO, ...extra
} });

test('lee el relato y devuelve una etiqueta de la lista cerrada', async () => {
  const { m, eventos } = nuevo({ llm: async () => 'no_encontraba_el_portal' });
  const r = await clasificar(m);
  assert.strictEqual(r.status, 200, JSON.stringify(r));
  assert.strictEqual(r.data.etiqueta, 'no_encontraba_el_portal');
  assert.strictEqual(r.data.clasificado, true);
  assert.strictEqual(r.data.es_juez, false);

  const hechos = eventos('bocaos.incidencia_clasificada');
  assert.strictEqual(hechos.length, 1);
  assert.strictEqual(hechos[0].p.etiqueta, 'no_encontraba_el_portal');
  assert.strictEqual(hechos[0].p.dice_si_hubo_fallo, false, 'el fallo lo mide G02 con hechos, no este agente');
});

test('normaliza lo que devuelve el modelo: «No encontraba el portal» es la misma etiqueta', async () => {
  const { m } = nuevo({ llm: async () => 'No encontraba el portal' });
  assert.strictEqual((await clasificar(m)).data.etiqueta, 'no_encontraba_el_portal');
});

test('una etiqueta que NO está en la lista se rechaza: un campo nuevo no se inventa', async () => {
  const { m, eventos } = nuevo({ llm: async () => 'el_rider_llegó_tarde' });
  const r = await clasificar(m);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.etiqueta, null, 'no se inventa una etiqueta');
  assert.strictEqual(r.data.clasificado, false);
  assert.strictEqual(r.data.sigue_su_curso, true, 'el caso sigue en la cola');

  const ambigua = eventos('bocaos.lectura_ambigua');
  assert.strictEqual(ambigua.length, 1);
  assert.strictEqual(ambigua[0].p.etiqueta_rechazada, 'el_rider_llego_tarde');
  assert.deepStrictEqual(ambigua[0].p.etiquetas_permitidas, LecturaIncidencia.ETIQUETAS);
  assert.strictEqual(eventos('bocaos.incidencia_clasificada').length, 0);
});

test('sin modelo: la incidencia entra sin clasificar y el centro no se entera', async () => {
  const { m, eventos } = nuevo({ llm: null });
  const r = await clasificar(m);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.etiqueta, null);
  assert.strictEqual(r.data.sigue_su_curso, true);
  assert.strictEqual(eventos('bocaos.lectura_ambigua').length, 1);
  assert.ok(eventos('bocaos.lectura_ambigua')[0].p.motivo.includes('sin lectura'));
});

test('si el modelo se cae, la lectura se descarta y el caso sigue', async () => {
  const { m, eventos } = nuevo({ llm: async () => { throw new Error('503 del proveedor'); } });
  const r = await clasificar(m);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.etiqueta, null);
  assert.ok(eventos('bocaos.lectura_ambigua')[0].p.motivo.includes('503'));
  assert.strictEqual(r.data.sigue_su_curso, true);
});

test('si el modelo tarda, no se espera más de lo que hay para leer', async () => {
  const { m, eventos } = nuevo({ timeout: 60, llm: () => new Promise((res) => setTimeout(() => res('otro'), 400)) });
  const r = await clasificar(m);
  assert.strictEqual(r.data.etiqueta, null);
  assert.ok(eventos('bocaos.lectura_ambigua')[0].p.motivo.includes('tardó'));
});

test('devuelve campos junto a la etiqueta, y dice cuáles se rechazaron', async () => {
  const { m, eventos } = nuevo({ llm: async () => ({ etiqueta: 'direccion_incorrecta', campos: { campo: 'direccion', culpable: 'rider' } }) });
  const r = await clasificar(m);
  assert.strictEqual(r.data.etiqueta, 'direccion_incorrecta');
  assert.deepStrictEqual(r.data.campos, { campo: 'direccion' });
  assert.deepStrictEqual(eventos('bocaos.incidencia_clasificada')[0].p.campos_rechazados, ['culpable'],
    'un campo que no está en el vocabulario tampoco entra');
});

test('sin relato no hay nada que leer: 400', async () => {
  const { m, eventos } = nuevo({ llm: async () => 'otro' });
  const r = await m.onClasificarRequest({ request_id: 'x', data: { project_id: PLAZA, incidencia_id: 'inc-1' } });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'relato');
  assert.strictEqual(eventos('lectura-incidencia.clasificar.failed').length, 1);
});

test('la lista es la del diseño, ni una etiqueta más', () => {
  assert.deepStrictEqual(LecturaIncidencia.ETIQUETAS, [
    'no_encontraba_el_portal', 'el_cliente_no_bajaba', 'el_local_no_estaba_listo', 'direccion_incorrecta', 'otro'
  ]);
});

test('no escribe: lee y devuelve', () => {
  const { m } = nuevo();
  assert.strictEqual(m._path, null);
});

(async () => {
  let fallos = 0;
  for (const t of tests) {
    try { await t.fn(); console.log(`ok — ${t.name}`); }
    catch (err) { fallos += 1; console.error(`FALLO — ${t.name}\n  ${err.message}`); }
  }
  console.log(`\n${tests.length - fallos}/${tests.length} tests ok`);
  if (fallos > 0) process.exitCode = 1;
})();

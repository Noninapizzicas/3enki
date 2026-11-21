'use strict';

/**
 * instagram-bridge · C1 · ClasificadorDePeticion (MICRO-AGENTE)
 *
 * **Bajo el umbral se devuelven DOS candidatas y se pregunta: no se elige.**
 * Esta suite fija:
 *
 *   - con senal clara, decide una capacidad y no pregunta;
 *   - con senal floja o empatada, `capacidad` es null, `candidatas` tiene DOS y
 *     hay una pregunta: el puente no adivina la intencion;
 *   - nunca devuelve una candidata ni cinco: dos;
 *   - una averia declarada («se ha roto») manda sobre la capacidad que se rompio;
 *   - sin peticion no hay clasificacion (y no se inventa una capacidad);
 *   - el juicio es opcional: sin el decide la tabla; si lanza, miente, devuelve
 *     una promesa o una capacidad que no existe, manda la tabla. Nunca lanza.
 *
 * Ejecutar: node modules/instagram-bridge/tests/clasificador.test.js
 */

const assert = require('assert');

const c1 = require('../puente/clasificador');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const es_pregunta = (t) => typeof t === 'string' && t.includes('¿') && t.includes('?');

// ---------------------------------------------------------------------------
// 1 · LA REGLA
// ---------------------------------------------------------------------------

test('bajo_el_umbral_devuelve_dos_candidatas_y_pregunta', () => {
  // «mira a ver si ha salido y contesta»: dos verbos de dos capacidades, uno
  // cada uno. La tabla no puede elegir sin riesgo, y no elige.
  const r = c1.clasificar('mira a ver si ha salido y contesta');

  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.decidida, false, 'con senal empatada NO se decide');
  assert.strictEqual(r.elegida, false);
  assert.strictEqual(r.capacidad, null, 'no se elige: la capacidad queda vacia');
  assert.strictEqual(r.pregunta === null, false, 'hay que preguntar');

  // DOS candidatas, ni una ni cinco.
  assert.ok(Array.isArray(r.candidatas));
  assert.strictEqual(r.candidatas.length, 2);
  assert.deepStrictEqual(r.candidatas.map((c) => c.capacidad).sort(), ['mirar', 'responder']);
  assert.strictEqual(r.motivo, 'empate');

  // La pregunta es una pregunta, en el idioma del dueno, y nombra las dos.
  assert.ok(es_pregunta(r.pregunta), `la pregunta no lo parece: ${r.pregunta}`);
  assert.ok(r.pregunta.includes(c1.DESCRIPCIONES.mirar), 'la pregunta tiene que nombrar la primera candidata');
  assert.ok(r.pregunta.includes(c1.DESCRIPCIONES.responder), 'y la segunda');

  // Con senal por debajo del umbral: mismas dos candidatas y tambien pregunta.
  const flojo = c1.clasificar('haz lo de ayer');
  assert.strictEqual(flojo.decidida, false);
  assert.strictEqual(flojo.candidatas.length, 2);
  assert.ok(es_pregunta(flojo.pregunta));
  assert.strictEqual(flojo.capacidad, null);

  // Sin ninguna palabra de la tabla tampoco se elige: se pregunta y se declara.
  const mudo = c1.clasificar('blablabla');
  assert.strictEqual(mudo.decidida, false);
  assert.strictEqual(mudo.candidatas.length, 2);
  assert.strictEqual(mudo.motivo, 'sin_senal');
  assert.strictEqual(mudo.abierto.clasificacion !== null, true);
});

test('con_senal_clara_decide_y_no_pregunta', () => {
  const r = c1.clasificar('publica el texto que te mande ayer');
  assert.strictEqual(r.decidida, true);
  assert.strictEqual(r.capacidad, 'publicar');
  assert.strictEqual(r.pregunta, null);
  assert.strictEqual(r.elegida, true);

  const resp = c1.clasificar('contesta a los mensajes de hoy');
  assert.strictEqual(resp.capacidad, 'responder');

  const mirar = c1.clasificar('mira como va la cuenta');
  assert.strictEqual(mirar.capacidad, 'mirar');

  const demo = c1.clasificar('ensaya la receta de publicar');
  assert.strictEqual(demo.capacidad, 'demostrar', 'ensayar manda sobre la palabra publicar');
});

test('una_averia_declarada_manda_sobre_la_capacidad_que_se_rompio', () => {
  // El dueno nombra publicar (subir fotos) pero lo que declara es una averia.
  // Publicar cuando algo esta roto es el error caro; arreglar de mas, no.
  const r = c1.clasificar('se ha roto lo de subir fotos');
  assert.strictEqual(r.decidida, true);
  assert.strictEqual(r.capacidad, 'reparar');
  assert.strictEqual(r.regla, 'sintoma');
  assert.ok(r.abierto.sintoma !== null);
});

test('sin_peticion_no_hay_clasificacion_y_no_se_inventa_capacidad', () => {
  for (const vacia of [undefined, null, '', '   ', 42, {}]) {
    const r = c1.clasificar(vacia);
    assert.strictEqual(r.ok, false, `deberia rechazar ${JSON.stringify(vacia)}`);
    assert.strictEqual(r.capacidad, null);
    assert.strictEqual(r.pregunta, null);
    assert.deepStrictEqual(r.candidatas, []);
    assert.strictEqual(r.motivo, 'sin_peticion');
  }
});

// ---------------------------------------------------------------------------
// 2 · EL JUICIO ES OPCIONAL (y no puede romper nada)
// ---------------------------------------------------------------------------

test('el_juicio_es_opcional_y_su_fallo_no_rompe_la_tabla', () => {
  // Sin juicio: decide la tabla.
  assert.strictEqual(c1.clasificar('mira como va la cuenta').capacidad, 'mirar');

  // Un juicio que corrige dentro de las cinco se acepta y se declara la via.
  const corregido = c1.clasificar('haz lo de ayer', { juicio: () => 'publicar' });
  assert.strictEqual(corregido.capacidad, 'publicar');
  assert.strictEqual(corregido.via, 'juicio');

  // Un juicio que lanza: manda la tabla, no se propaga el error.
  const lanza = c1.clasificar('haz lo de ayer', { juicio: () => { throw new Error('el modelo se cayo'); } });
  assert.strictEqual(lanza.decidida, false);
  assert.strictEqual(lanza.via, 'juicio_invalido_se_usa_la_tabla');

  // Una promesa no se espera: la boca contesta ya.
  const promesa = c1.clasificar('haz lo de ayer', { juicio: () => Promise.resolve('publicar') });
  assert.strictEqual(promesa.decidida, false);

  // Una capacidad que no existe se descarta: no hay sexta capacidad.
  const inventada = c1.clasificar('haz lo de ayer', { juicio: () => ({ capacidad: 'bailar' }) });
  assert.strictEqual(inventada.decidida, false);
  assert.strictEqual(inventada.capacidad, null);

  // Basura: tambien manda la tabla.
  const basura = c1.clasificar('haz lo de ayer', { juicio: () => 7 });
  assert.strictEqual(basura.decidida, false);

  // Pero el juicio NO manda sobre el sintoma: la averia esta escrita.
  const conSintoma = c1.clasificar('se ha roto lo de subir fotos', { juicio: () => 'publicar' });
  assert.strictEqual(conSintoma.capacidad, 'reparar');
});

test('las_cinco_capacidades_estan_declaradas_y_se_describen', () => {
  assert.deepStrictEqual(c1.CAPACIDADES, ['publicar', 'responder', 'mirar', 'demostrar', 'reparar']);
  const d = c1.describir();
  assert.strictEqual(d.candidatas_bajo_el_umbral, 2);
  assert.strictEqual(d.regla, 'bajo el umbral se devuelven dos candidatas y se pregunta; no se elige');
  assert.strictEqual(d.capacidades.length, 5);
  for (const { capacidad, descripcion } of d.capacidades) {
    assert.ok(c1.CAPACIDADES.includes(capacidad));
    assert.ok(typeof descripcion === 'string' && descripcion.length > 3, `sin descripcion: ${capacidad}`);
  }
});

test('el_ranking_es_estable_entre_llamadas_iguales', () => {
  // Un clasificador cuyo resultado cambia entre dos llamadas no se puede auditar.
  const a = c1.clasificar('mira a ver si ha salido y contesta');
  const b = c1.clasificar('mira a ver si ha salido y contesta');
  assert.deepStrictEqual(a.candidatas, b.candidatas);
  assert.strictEqual(a.pregunta, b.pregunta);

  // Y el empate se rompe por el ORDEN DECLARADO, no por azar: «cambio» es de
  // mirar y de reparar, asi que la primera candidata es la que va antes en la
  // tabla (mirar), siempre.
  const empate = c1.clasificar('cambio');
  assert.strictEqual(empate.decidida, false);
  assert.deepStrictEqual(empate.candidatas.map((c) => c.capacidad), ['mirar', 'reparar']);
  assert.ok(c1.CAPACIDADES.indexOf(empate.candidatas[0].capacidad) < c1.CAPACIDADES.indexOf(empate.candidatas[1].capacidad));
});

test('es_peticion_de_solo_contesta_que_si_cuando_la_capacidad_esta_clara', () => {
  assert.strictEqual(c1.es_peticion_de('publica esto', 'publicar'), true);
  assert.strictEqual(c1.es_peticion_de('publica esto', 'mirar'), false);
  // Dudosa: no es (claramente) de ninguna. No se fuerza.
  assert.strictEqual(c1.es_peticion_de('mira a ver si ha salido y contesta', 'mirar'), false);
});

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log(`  ok  ${name}`); }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[instagram-bridge__clasificador] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__clasificador] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

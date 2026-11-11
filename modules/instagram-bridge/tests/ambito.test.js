'use strict';

/**
 * instagram-bridge · P2 · FiltroDeAmbito (REFLEJO)
 *
 * Toda lectura se filtra por ambito y la comprobacion ocurre ANTES DE DEVOLVER.
 * Esta suite fija:
 *   - dos proyectos no se mezclan en un informe: un informe = un ambito.
 *   - pedir varios proyectos en una sola coleccion devuelve vacio (la union es
 *     la mezcla que el diseno prohibe); para varios se usa `repartir`, que
 *     entrega un informe por ambito.
 *   - un ambito sin proyecto no significa "todo": se falla cerrado.
 *   - un dato sin sello no pertenece a ningun ambito y se cuenta como huerfano.
 *   - cuenta y aparato afinan la lectura dentro del mismo proyecto.
 *   - `comprobar_antes_de_devolver` rechaza la entrega entera si se cuela un
 *     dato ajeno o un huerfano (no se devuelve "casi todo").
 *
 * Ejecutar: node modules/instagram-bridge/tests/ambito.test.js
 */

const assert = require('assert');
const { sellar } = require('../core/sello');
const {
  filtrar, pertenece, revisar, repartir, describir_ambito,
  ambitos_presentes, comprobar_antes_de_devolver
} = require('../core/ambito');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const MOMENTO = '2026-11-11T12:00:00Z';

function dato(proyecto, cuenta, contenido) {
  const r = sellar(Object.assign({ almacen: 'retratos' }, contenido || {}), {
    proyecto, cuenta, aparato: 'movil-1', momento: MOMENTO, quien: 'dueno'
  });
  assert.strictEqual(r.ok, true, `no se pudo sellar el fixture de ${proyecto}`);
  return r.dato;
}

const A1 = dato('proy-a', '@taller_a', { id: 'a-1', seguidores: 10 });
const A2 = dato('proy-a', '@taller_a', { id: 'a-2', seguidores: 20 });
const A3 = dato('proy-a', '@taller_b', { id: 'a-3', seguidores: 30 });
const B1 = dato('proy-b', '@taller_c', { id: 'b-1', seguidores: 40 });
const B2 = dato('proy-b', '@taller_c', { id: 'b-2', seguidores: 50 });
const MEZCLA = [A1, A2, A3, B1, B2];

test('dos_proyectos_no_se_mezclan_en_un_informe', () => {
  // Un ambito, un informe.
  const soloA = filtrar(MEZCLA, 'proy-a');
  assert.strictEqual(soloA.length, 3);
  assert.deepStrictEqual(Array.from(new Set(soloA.map((d) => d.sello.proyecto))), ['proy-a']);

  const soloB = filtrar(MEZCLA, { proyecto: 'proy-b' });
  assert.strictEqual(soloB.length, 2);
  assert.deepStrictEqual(Array.from(new Set(soloB.map((d) => d.sello.proyecto))), ['proy-b']);

  // Varios ambitos: informes separados, jamas una coleccion mezclada.
  const informes = repartir(MEZCLA, ['proy-a', 'proy-b']);
  assert.strictEqual(informes.length, 2);
  for (const informe of informes) {
    const proyectos = Array.from(new Set(informe.datos.map((d) => d.sello.proyecto)));
    assert.strictEqual(proyectos.length, 1, 'un informe tiene un solo proyecto');
    assert.strictEqual(proyectos[0], informe.proyecto);
  }
  assert.deepStrictEqual(informes[0].datos.map((d) => d.id), ['a-1', 'a-2', 'a-3']);
  assert.deepStrictEqual(informes[1].datos.map((d) => d.id), ['b-1', 'b-2']);

  // El atajo peligroso no existe: dos proyectos en UNA coleccion no devuelve nada.
  assert.deepStrictEqual(filtrar(MEZCLA, { proyectos: ['proy-a', 'proy-b'] }), []);
});

test('pedir_varios_ambitos_en_un_solo_filtro_se_nombra', () => {
  const desc = describir_ambito({ proyectos: ['proy-a', 'proy-b'] });
  assert.strictEqual(desc.ok, false);
  assert.strictEqual(desc.motivo, 'ambito_multiple_en_un_solo_informe');
  const r = revisar(MEZCLA, { proyectos: ['proy-a', 'proy-b'] });
  assert.deepStrictEqual(r.datos, []);
  assert.strictEqual(r.motivo, 'ambito_multiple_en_un_solo_informe');
});

test('sin_ambito_no_se_devuelve_nada', () => {
  assert.deepStrictEqual(filtrar(MEZCLA, {}), []);
  assert.deepStrictEqual(filtrar(MEZCLA, undefined), []);
  assert.deepStrictEqual(filtrar(MEZCLA, { cuenta: '@taller_a' }), [], 'la cuenta sin proyecto no es ambito');
  const r = revisar(MEZCLA, {});
  assert.deepStrictEqual(r.datos, []);
  assert.strictEqual(r.motivo, 'ambito_sin_proyecto');
});

test('un_dato_sin_sello_no_pertenece_a_ningun_ambito', () => {
  const huerfano = { id: 'x', seguidores: 99 };
  assert.strictEqual(pertenece(huerfano, 'proy-a'), false);
  const r = revisar([A1, huerfano, B1], 'proy-a');
  assert.deepStrictEqual(r.datos.map((d) => d.id), ['a-1']);
  assert.strictEqual(r.huerfanos.length, 1, 'el huerfano se cuenta aparte');
  assert.strictEqual(r.ajenos.length, 1, 'el de B es ajeno, no huerfano');
});

test('cuenta_y_aparato_afinan_dentro_del_mismo_proyecto', () => {
  const deTallerB = filtrar(MEZCLA, { proyecto: 'proy-a', cuenta: '@taller_b' });
  assert.deepStrictEqual(deTallerB.map((d) => d.id), ['a-3']);
  const conOtroAparato = filtrar(MEZCLA, { proyecto: 'proy-a', aparato: 'movil-9' });
  assert.deepStrictEqual(conOtroAparato, []);
});

test('pertenece_es_la_pregunta_minima_y_es_exacta', () => {
  assert.strictEqual(pertenece(A1, 'proy-a'), true);
  assert.strictEqual(pertenece(A1, 'proy-b'), false);
  assert.strictEqual(pertenece(B1, 'proy-a'), false);
  // El ambito por cuenta se compara tal cual: no se normaliza el handle.
  assert.strictEqual(pertenece(A1, { proyecto: 'proy-a', cuenta: '@TALLER_A' }), false);
});

test('comprobar_antes_de_devolver_rechaza_una_entrega_mezclada', () => {
  const limpia = comprobar_antes_de_devolver(filtrar(MEZCLA, 'proy-a'), 'proy-a');
  assert.strictEqual(limpia.ok, true);

  const sucia = comprobar_antes_de_devolver([A1, B1], 'proy-a');
  assert.strictEqual(sucia.ok, false);
  assert.strictEqual(sucia.motivo, 'ambito_ajeno');
  assert.strictEqual(sucia.ajenos.length, 1);
  assert.strictEqual(sucia.ajenos[0].id, 'b-1');

  const conHuerfano = comprobar_antes_de_devolver([A1, { id: 'sin-sello' }], 'proy-a');
  assert.strictEqual(conHuerfano.ok, false);
  assert.strictEqual(conHuerfano.huerfanos.length, 1);

  // Tambien acepta la forma { datos: [] } de una respuesta ya montada.
  assert.strictEqual(comprobar_antes_de_devolver({ datos: [A1] }, 'proy-a').ok, true);
  assert.strictEqual(comprobar_antes_de_devolver({ datos: [A1, B1] }, 'proy-a').ok, false);
});

test('ambitos_presentes_dice_que_hay_sin_devolverlo_junto', () => {
  assert.deepStrictEqual(ambitos_presentes(MEZCLA), ['proy-a', 'proy-b']);
  assert.deepStrictEqual(ambitos_presentes([]), []);
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log(`  ok  ${name}`); }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[instagram-bridge__ambito] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__ambito] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

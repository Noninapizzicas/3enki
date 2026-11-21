'use strict';

/**
 * instagram-bridge · F1 · DeclaradorDeRotura (REFLEJO)
 *
 * Lo que esta suite fija:
 *   - **DOS evidencias independientes del mismo sintoma son ROTURA; UNA es
 *     SOSPECHA.** Ni una basta (una pantalla a medio cargar no retira una receta
 *     de todos los proyectos) ni hacen falta tres.
 *   - **La misma evidencia repetida no cuenta dos veces**: el bus reintenta y el
 *     movil reenvia; copiar una evidencia no la convierte en dos.
 *   - Dos sintomas distintos en el mismo paso, vistos una vez cada uno, son DOS
 *     sospechas: no se suman para llegar a dos y declarar una rotura que nadie vio
 *     dos veces.
 *   - Una evidencia que no se puede leer (sin paso, sin instante, sin testigo, con
 *     un tipo que no esta en la lista) se DESCARTA y se nombra: no cuenta ni a
 *     favor ni en contra.
 *   - La declaracion es pura: no toca la receta, no escribe y el mismo payload da
 *     siempre lo mismo.
 *
 * Ejecutar: node modules/instagram-bridge/tests/rotura.test.js
 */

const assert = require('assert');

const rotura = require('../recetas/rotura');
const forma = require('../core/forma-receta');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M1 = '2026-11-11T12:00:00Z';
const M2 = '2026-11-12T08:00:00Z';
const M3 = '2026-11-13T10:15:00Z';

function receta(extra) {
  return Object.assign({
    plataforma: 'instagram',
    capacidad: 'publicar',
    precondicion: { descripcion: 'app abierta en inicio', ancla: { nombre_visible: 'Crear', tipo: 'boton' } },
    pasos: [
      {
        ancla_esperada: { nombre_visible: 'Crear', tipo: 'boton' },
        accion: { tipo: 'tocar' },
        consecuencia_esperada: { descripcion: 'se abre el selector' },
        espera_maxima: 1500
      },
      {
        ancla_esperada: { nombre_visible: 'Siguiente', tipo: 'boton' },
        accion: { tipo: 'tocar' },
        consecuencia_esperada: { descripcion: 'pide el pie de foto' },
        espera_maxima: 1500
      },
      {
        ancla_esperada: { nombre_visible: 'Compartir', tipo: 'boton' },
        accion: { tipo: 'tocar' },
        consecuencia_esperada: { descripcion: 'queda publicada', ancla: { nombre_visible: 'Publicado', tipo: 'texto' } },
        espera_maxima: 2000
      }
    ],
    postcondicion: { descripcion: 'la pieza queda publicada', ancla: { nombre_visible: 'Publicado', tipo: 'texto' } },
    techo: 6000
  }, extra || {});
}

function evidencia(extra) {
  return Object.assign({
    evidencia_id: 'ev-1',
    paso: 3,
    tipo: 'ancla_ausente',
    ancla: { nombre_visible: 'Compartir', tipo: 'boton' },
    observado_en: M1,
    quien: 'dueno'
  }, extra || {});
}

// ---------------------------------------------------------------------------
// 1 · LA REGLA DEL BLOQUE: dos son rotura, una es sospecha
// ---------------------------------------------------------------------------

test('dos_evidencias_son_rotura_una_es_sospecha', () => {
  const r = receta();

  // UNA evidencia: sospecha. No se retira nada, solo se pide una segunda mirada.
  const una = rotura.declarar(r, [evidencia()]);
  assert.strictEqual(una.ok, true);
  assert.strictEqual(una.veredicto, 'sospecha');
  assert.strictEqual(una.rotura, false, 'una sola evidencia NO es una rotura');
  assert.strictEqual(una.sospecha, true);
  assert.deepStrictEqual(una.pasos_rotos, []);
  assert.deepStrictEqual(una.pasos_sospechosos, [3]);
  assert.strictEqual(una.consideradas, 1);
  assert.ok(una.resumen.includes('Sospecha'), una.resumen);

  // DOS evidencias independientes del MISMO sintoma: rotura.
  const dos = rotura.declarar(r, [
    evidencia(),
    evidencia({ evidencia_id: 'ev-2', observado_en: M2, quien: 'agente' })
  ]);
  assert.strictEqual(dos.ok, true);
  assert.strictEqual(dos.veredicto, 'rotura');
  assert.strictEqual(dos.rotura, true, 'dos evidencias independientes son rotura');
  assert.strictEqual(dos.sospecha, false);
  assert.deepStrictEqual(dos.pasos_rotos, [3]);
  assert.strictEqual(dos.pasos[2].veredicto, 'rotura');
  assert.strictEqual(dos.pasos[2].sintomas.length, 1);
  assert.strictEqual(dos.pasos[2].sintomas[0].evidencias, 2);
  assert.deepStrictEqual(dos.pasos[2].sintomas[0].testigos, ['dueno', 'agente']);
  assert.ok(dos.resumen.includes('Rotura'), dos.resumen);

  // El atajo dice lo mismo (una sola fuente de verdad para el umbral).
  assert.strictEqual(rotura.es_rotura(r, [evidencia()]), false);
  assert.strictEqual(rotura.es_rotura(r, [evidencia(), evidencia({ evidencia_id: 'ev-2', observado_en: M2 })]), true);
});

test('la_misma_evidencia_repetida_no_cuenta_dos_veces', () => {
  const r = receta();

  // El mismo evidencia_id dos veces: es UNA evidencia reenviada, no dos.
  const repetida = rotura.declarar(r, [evidencia(), evidencia({ observado_en: M3 })]);
  assert.strictEqual(repetida.veredicto, 'sospecha');
  assert.strictEqual(repetida.consideradas, 1);
  assert.strictEqual(repetida.repetidas.length, 1);
  assert.strictEqual(repetida.repetidas[0].evidencia_id, 'ev-1');

  // Sin id, el mismo ojo en el mismo instante tambien es la misma observacion.
  const sinId = rotura.declarar(r, [
    evidencia({ evidencia_id: undefined }),
    evidencia({ evidencia_id: null })
  ]);
  assert.strictEqual(sinId.veredicto, 'sospecha');
  assert.strictEqual(sinId.consideradas, 1);

  // ... pero el mismo ojo en OTRO momento es otra evidencia (volvio a fallar).
  const otroMomento = rotura.declarar(r, [
    evidencia({ evidencia_id: undefined }),
    evidencia({ evidencia_id: null, observado_en: M2 })
  ]);
  assert.strictEqual(otroMomento.veredicto, 'rotura');
});

test('dos_sintomas_distintos_en_el_mismo_paso_son_dos_sospechas', () => {
  const d = rotura.declarar(receta(), [
    evidencia({ evidencia_id: 'ev-a', paso: 3, tipo: 'ancla_ausente', ancla: { nombre_visible: 'Compartir', tipo: 'boton' } }),
    evidencia({ evidencia_id: 'ev-b', paso: 3, tipo: 'accion_sin_efecto', ancla: { nombre_visible: 'Siguiente', tipo: 'boton' } })
  ]);

  assert.strictEqual(d.veredicto, 'sospecha', 'dos cosas distintas vistas una vez no son una rotura vista dos veces');
  assert.strictEqual(d.pasos[2].sintomas.length, 2);
  assert.deepStrictEqual(d.pasos[2].sintomas.map((s) => s.evidencias), [1, 1]);
  assert.strictEqual(d.pasos[2].veredicto, 'sospecha');
});

test('sin_evidencia_no_es_ni_rotura_ni_sospecha', () => {
  for (const vacio of [undefined, null, []]) {
    const d = rotura.declarar(receta(), vacio);
    assert.strictEqual(d.ok, true);
    assert.strictEqual(d.veredicto, 'sin_evidencia');
    assert.strictEqual(d.rotura, false);
    assert.strictEqual(d.sospecha, false);
    assert.strictEqual(d.motivo, rotura.MOTIVOS.SIN_EVIDENCIA);
    assert.deepStrictEqual(d.pasos_rotos, []);
  }
});

// ---------------------------------------------------------------------------
// 2 · lo que no se puede contar se descarta y se nombra
// ---------------------------------------------------------------------------

test('una_evidencia_ilegible_se_descarta_y_se_nombra_su_motivo', () => {
  const d = rotura.declarar(receta(), [
    evidencia(),
    evidencia({ evidencia_id: 'ev-2', observado_en: M2 }),        // esta si cuenta
    evidencia({ evidencia_id: 'ev-3', paso: 9 }),                  // paso que no existe
    evidencia({ evidencia_id: 'ev-4', tipo: 'se_cayo_el_wifi' }),  // sintoma no declarado
    evidencia({ evidencia_id: 'ev-5', observado_en: 'ayer' }),     // instante invalido
    evidencia({ evidencia_id: 'ev-6', quien: undefined }),         // sin testigo
    evidencia({ evidencia_id: 'ev-7', quien: 'un_primo' }),        // testigo no declarado
    'esto no es una evidencia'                                     // ni objeto
  ]);

  assert.strictEqual(d.ok, true);
  assert.strictEqual(d.veredicto, 'rotura', 'las dos validas siguen contando');
  assert.strictEqual(d.consideradas, 2);
  assert.strictEqual(d.descartadas.length, 6);
  const motivos = d.descartadas.map((x) => x.motivo);
  assert.ok(motivos.includes(rotura.MOTIVOS.PASO_FUERA_DE_LA_RECETA));
  assert.ok(motivos.includes(rotura.MOTIVOS.TIPO_NO_DECLARADO));
  assert.ok(motivos.includes(rotura.MOTIVOS.MOMENTO_INVALIDO));
  assert.ok(motivos.includes(rotura.MOTIVOS.SIN_TESTIGO));
  assert.ok(motivos.includes(rotura.MOTIVOS.TESTIGO_NO_DECLARADO));
  assert.ok(motivos.includes(rotura.MOTIVOS.ENTRADA_INVALIDA));
});

test('no_se_declara_rotura_sobre_una_receta_que_no_tiene_forma', () => {
  const d = rotura.declarar({ capacidad: 'publicar', pasos: [] }, [evidencia()]);
  assert.strictEqual(d.ok, false);
  assert.strictEqual(d.motivo, rotura.MOTIVOS.DEFECTO_DE_FORMA);
  assert.ok(Array.isArray(d.defectos) && d.defectos.length > 0);
});

// ---------------------------------------------------------------------------
// 3 · pura: ni toca la receta ni inventa estado
// ---------------------------------------------------------------------------

test('la_declaracion_es_pura_y_repetible', () => {
  const r = receta();
  const antes = JSON.stringify(r);
  const evidencias = [evidencia(), evidencia({ evidencia_id: 'ev-2', observado_en: M2 })];

  const a = rotura.declarar(r, evidencias);
  const b = rotura.declarar(r, evidencias);

  assert.strictEqual(JSON.stringify(r), antes, 'la receta de entrada no se toca');
  assert.deepStrictEqual(a, b, 'el mismo payload produce la misma declaracion');
  assert.ok(forma.validar(r).ok, 'la receta sigue siendo valida despues de declarar');
});

test('la_firma_de_la_misma_rotura_coincide_vista_desde_dos_proyectos', () => {
  const r = receta();
  const desdeA = rotura.declarar(r, [
    evidencia({ evidencia_id: 'a-1', cuenta: 'taller_a' }),
    evidencia({ evidencia_id: 'a-2', observado_en: M2, cuenta: 'taller_a' })
  ]);
  const desdeB = rotura.declarar(r, [
    evidencia({ evidencia_id: 'b-1', cuenta: 'obrador_b', quien: 'agente' }),
    evidencia({ evidencia_id: 'b-2', observado_en: M3, cuenta: 'obrador_b' })
  ]);

  assert.strictEqual(rotura.firma(desdeA), rotura.firma(desdeB), 'la misma rotura tiene la misma firma');
  assert.strictEqual(rotura.firma(rotura.declarar(r, [evidencia()])), null, 'una sospecha no tiene firma de rotura');
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__rotura] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__rotura] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.stack || err.message}`);
  process.exit(1);
})();

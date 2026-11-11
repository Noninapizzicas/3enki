'use strict';

/**
 * instagram-bridge · C4 · NarradorDeResultado (MICRO-AGENTE)
 *
 * **Nunca dice «hecho» sin veredicto `ocurrio`** — y, mas alla de la letra, ni
 * siquiera entonces si falta la evidencia. Esta suite fija:
 *
 *   - `no_ocurrio`, `sin_veredicto`, `fallo`, un veredicto ausente y un veredicto
 *     inventado: la frase NO contiene «hecho» ni «hecha»;
 *   - `ocurrio` SIN evidencia tampoco: la frase lo dice y no lo da por bueno;
 *   - `ocurrio` CON evidencia es el unico caso que dice «Hecho», y lo dice una vez;
 *   - el seguro: si una plantilla declarada dijera «hecho» sin prueba, se
 *     sustituye por la honesta (la regla se comprueba, no se promete);
 *   - el render lo hace el modulo REAL `contabilidad-analitica/
 *     puente-lenguaje-dueno`: la frase es exactamente la que ese modulo produce
 *     con las plantillas declaradas (no hay una segunda traduccion aqui);
 *   - un fallo se cuenta con R2 (que ha pasado y que hace falta), sin tecnicos;
 *   - sin descripcion no se inventa una: se declara el hueco;
 *   - sin resultado no lanza: contesta que no hay nada que contar.
 *
 * Ejecutar: node modules/instagram-bridge/tests/narrador.test.js
 */

const assert = require('assert');

const c4 = require('../puente/narrador');
const traductor = require('../puente/traductor');
const PuenteLenguajeDueno = require('../../contabilidad-analitica/puente-lenguaje-dueno');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PROYECTO = 'taller-ceramica';
const DICE_TERMINADO = /\bhech[oa]s?\b/i;

function resultado(extra = {}) {
  return Object.assign({
    veredicto: 'ocurrio',
    que: 'la pieza en la cuenta',
    capacidad: 'publicar',
    evidencia_id: 'ev_2026_11_11_01',
    proyecto: PROYECTO
  }, extra);
}

// ---------------------------------------------------------------------------
// 1 · LA REGLA
// ---------------------------------------------------------------------------

test('nunca_dice_hecho_sin_veredicto_ocurrio', () => {
  // Los casos en los que NO puede decirlo. Ni «hecho», ni «hecha», ni de paso.
  const sinDerecho = [
    { veredicto: 'no_ocurrio' },
    { veredicto: 'sin_veredicto' },
    { veredicto: 'fallo' },
    { veredicto: undefined },
    { veredicto: 'casi' },
    { veredicto: 'OCURRIO_PERDON' }
  ];

  for (const caso of sinDerecho) {
    const r = c4.narrar(resultado(caso));
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.dice_hecho, false, `no deberia decir hecho: ${JSON.stringify(caso)}`);
    assert.strictEqual(DICE_TERMINADO.test(r.frase), false, `la frase dice "hecho": ${r.frase}`);
    assert.strictEqual(c4.dice_terminado(r.frase), false);
    assert.ok(typeof r.frase === 'string' && r.frase.length > 10);
  }

  // `ocurrio` SIN evidencia: tampoco. Paso, pero no lo puede sostener.
  const sinPrueba = c4.narrar(resultado({ evidencia_id: null }));
  assert.strictEqual(sinPrueba.dice_hecho, false);
  assert.strictEqual(sinPrueba.motivo, 'ocurrio_sin_evidencia');
  assert.strictEqual(DICE_TERMINADO.test(sinPrueba.frase), false);
  assert.ok(sinPrueba.frase.includes('no tengo la prueba'), sinPrueba.frase);
  assert.ok(/la pieza en la cuenta/i.test(sinPrueba.frase), 'la frase dice de que habla');

  // Una evidencia vacia no es una evidencia.
  const evidenciaVacia = c4.narrar(resultado({ evidencia_id: '   ' }));
  assert.strictEqual(evidenciaVacia.dice_hecho, false);
  assert.strictEqual(DICE_TERMINADO.test(evidenciaVacia.frase), false);

  // `ocurrio` CON evidencia: el unico caso. Y lo dice una sola vez.
  const conPrueba = c4.narrar(resultado());
  assert.strictEqual(conPrueba.dice_hecho, true);
  assert.ok(conPrueba.frase.startsWith('Hecho: '), conPrueba.frase);
  assert.strictEqual((conPrueba.frase.match(DICE_TERMINADO) || []).length, 1);
  assert.ok(/lo confirma la comprobacion/i.test(conPrueba.frase), 'la frase dice en que se apoya');
  assert.strictEqual(conPrueba.evidencia_id, 'ev_2026_11_11_01');
});

test('el_seguro_sustituye_una_plantilla_que_dice_hecho_sin_prueba', () => {
  // Una plantilla declarada (por el dueno, por un proyecto) que miente: la regla
  // no depende de que nadie escriba bien una plantilla.
  const r = c4.narrar(
    resultado({ evidencia_id: null }),
    { plantillas: { sin_prueba: 'Hecho: {que}. Ya esta.' } }
  );

  assert.strictEqual(r.dice_hecho, false);
  assert.strictEqual(r.motivo, 'plantilla_decia_terminado_sin_prueba');
  assert.strictEqual(DICE_TERMINADO.test(r.frase), false, `se colo: ${r.frase}`);
  assert.ok(r.abierto.plantilla !== null);

  // Y con evidencia, la plantilla buena se usa tal cual (no se toca lo que vale).
  const bueno = c4.narrar(resultado(), { plantillas: { hecho: 'Quedo asi: {que}.' } });
  assert.strictEqual(bueno.dice_hecho, true);
  assert.strictEqual(bueno.frase, 'Quedo asi: la pieza en la cuenta.');
});

test('la_frase_la_viste_el_modulo_real_puente_lenguaje_dueno', () => {
  // El mapeo no se declara: se comprueba. La misma cifra y las mismas plantillas
  // en el modulo REAL tienen que dar exactamente la misma frase.
  const real = new PuenteLenguajeDueno();
  const esperado = real.toolACifra({
    project_id: PROYECTO,
    clave: 'hecho',
    cifra: { que: 'la pieza en la cuenta', capacidad: 'publicar', veredicto: 'ocurrio' },
    plantillas: c4.PLANTILLAS
  });

  const r = c4.narrar(resultado());
  assert.strictEqual(esperado.status, 200);
  assert.strictEqual(esperado.data.traducido, true);
  assert.strictEqual(r.frase, esperado.data.frase);
  assert.strictEqual(r.plantilla_usada, esperado.data.plantilla_usada);
  assert.strictEqual(r.plantilla_usada, c4.PLANTILLAS.hecho);

  // Y el modulo real sigue siendo el que no inventa frase sin plantilla: si el
  // puente no tuviera plantilla, la narracion no se la inventaria.
  const sinPlantilla = real.toolACifra({ project_id: PROYECTO, clave: 'inexistente', cifra: { que: 'x' }, plantillas: {} });
  assert.strictEqual(sinPlantilla.data.frase, null);
});

test('un_fallo_se_cuenta_con_el_traductor_y_sin_tecnicos', () => {
  const fallo = { codigo: 'sesion_caida', detalle: 'Timeout 30000 en el selector .btn-login', pantalla: 'inicio' };
  const r = c4.narrar(resultado({ veredicto: 'fallo', fallo, evidencia_id: null, que: 'la pieza' }));

  assert.strictEqual(r.dice_hecho, false);
  assert.strictEqual(r.motivo, 'traducido');
  assert.strictEqual(r.frase, traductor.traducir(fallo).frase);
  assert.deepStrictEqual(r.hace_falta, traductor.traducir(fallo).hace_falta);
  // Ni pantallas, ni botones, ni tecnicos: lo comprueba el seguro de R2.
  assert.strictEqual(traductor.revisar(r.frase).limpia, true, r.frase);
});

test('sin_descripcion_no_se_inventa_una', () => {
  const r = c4.narrar({ veredicto: 'ocurrio', evidencia_id: 'ev_1', proyecto: PROYECTO });
  assert.strictEqual(r.dice_hecho, false, 'sin saber que paso no se puede decir hecho');
  assert.strictEqual(r.motivo, 'sin_dato_que_contar');
  assert.strictEqual(DICE_TERMINADO.test(r.frase), false);
  assert.ok(r.abierto.que !== null);
  assert.strictEqual(r.frase, c4.PLANTILLAS.sin_dato);
});

test('sin_proyecto_se_narra_pero_se_declara_el_hueco', () => {
  const r = c4.narrar({ veredicto: 'no_ocurrio', que: 'la respuesta a Maria', evidencia_id: null });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.proyecto, null);
  assert.ok(r.abierto.proyecto !== null, 'el proyecto que no llego se nombra');
  assert.strictEqual(DICE_TERMINADO.test(r.frase), false);
});

test('sin_resultado_no_lanza_y_dice_que_no_hay_nada_que_contar', () => {
  for (const nada of [null, undefined, 42, 'publicado']) {
    const r = c4.narrar(nada);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.motivo, 'sin_resultado');
    assert.strictEqual(r.dice_hecho, false);
    assert.strictEqual(r.frase, null);
  }

  // Un resultado vacio no lanza: cae en la frase del hueco.
  const vacio = c4.narrar({});
  assert.strictEqual(vacio.ok, true);
  assert.strictEqual(vacio.dice_hecho, false);
});

test('los_veredictos_y_la_regla_estan_declarados', () => {
  assert.deepStrictEqual(c4.VEREDICTOS, ['ocurrio', 'no_ocurrio', 'sin_veredicto', 'fallo']);
  const d = c4.describir();
  assert.strictEqual(d.regla, 'nunca dice hecho sin veredicto ocurrio y sin evidencia');
  assert.strictEqual(d.mapeo, 'contabilidad-analitica/puente-lenguaje-dueno (a_cifra, mitad refleja real)');
  assert.deepStrictEqual(d.verbos_prohibidos_sin_prueba, ['hecho', 'hecha', 'hechos', 'hechas']);
  assert.ok(d.plantillas.includes('hecho'));
  assert.ok(d.plantillas.includes('sin_prueba'));
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__narrador] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__narrador] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

'use strict';

/**
 * instagram-bridge · A4.3 · EnsayoEnSeco (REFLEJO)
 *
 * El ensayo recorre la receta SIN TOCAR NADA y dice si sirve hoy. Esta suite fija
 * lo que no se puede relajar:
 *   - un ancla que no esta es una falta CON SU NUMERO DE PASO, no un fallo generico;
 *   - `no_se` (mirada parcial, postcondicion sin ancla) NO es apto;
 *   - el ensayo no muta el hecho ni la receta: no tiene efectos;
 *   - sin hecho no se ensaya (no se inventa una mirada).
 *
 * Ejecutar: node modules/instagram-bridge/tests/ensayo.test.js
 */

const assert = require('assert');

const ensayo = require('../recetas/ensayo');
const forma = require('../core/forma-receta');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M1 = '2026-11-11T12:00:00Z';

function nodo(id, tipo, nombre) {
  return { id, tipo, nombre_visible: nombre };
}

function hecho(nodos, extra) {
  return Object.assign({
    sello: { proyecto: 'proy-a', cuenta: 'taller_a', aparato: 'movil-1', momento: M1, quien: 'dueno' },
    pantalla: 'inicio',
    mirada: 'completa',
    nodos,
    cuenta_visible: 'taller_a'
  }, extra || {});
}

function paso(ancla, tipo) {
  return {
    ancla_esperada: { nombre_visible: ancla, tipo: tipo || 'boton' },
    accion: { tipo: 'tocar' },
    consecuencia_esperada: { descripcion: `despues de ${ancla} la pantalla cambia` },
    espera_maxima: 1500
  };
}

/** Receta de 3 pasos: Crear -> Siguiente -> Compartir. */
function receta(extraPasos, extra) {
  return Object.assign({
    plataforma: 'instagram',
    capacidad: 'publicar',
    precondicion: { descripcion: 'app abierta en inicio' },
    pasos: extraPasos || [paso('Crear'), paso('Siguiente'), paso('Compartir')],
    postcondicion: { descripcion: 'queda publicado', ancla: { nombre_visible: 'Publicado', tipo: 'texto' } },
    techo: 9000
  }, extra || {});
}

// ---------------------------------------------------------------------------
// 1 · ancla ausente -> falta con su NUMERO DE PASO
// ---------------------------------------------------------------------------

test('ancla_ausente_es_falta_con_su_numero_de_paso', () => {
  // El paso 2 ("Siguiente") ya no esta en pantalla; el 1 y el 3 si.
  const h = hecho([
    nodo('n1', 'boton', 'Crear'),
    nodo('n2', 'texto', 'Nueva publicacion'),
    nodo('n3', 'boton', 'Compartir')
  ]);

  const r = ensayo.ensayar(receta(), h);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.apto, false, 'si falta un ancla, la receta no es apta');
  assert.strictEqual(r.motivo, 'ensayo_no_apto');
  assert.strictEqual(r.pasos, 3);

  // Una falta, y es del paso 2: ni "fallo generico" ni "hay algo que falla".
  assert.strictEqual(r.faltas.length, 1);
  const falta = r.faltas[0];
  assert.strictEqual(falta.paso, 2, 'la falta lleva SU numero de paso');
  assert.strictEqual(falta.motivo, 'ancla_ausente');
  assert.deepStrictEqual(falta.ancla, { nombre_visible: 'Siguiente', tipo: 'boton' });

  // La falta se puede contar y nombrar, que es para lo que existe (C4 cuenta
  // faltas por paso y motivo).
  assert.strictEqual(typeof falta.paso, 'number');
  assert.ok(falta.paso >= 1 && falta.paso <= r.pasos);
  assert.strictEqual(r.faltas.filter((f) => f.paso === 1).length, 0, 'el paso 1 estaba y no se acusa');

  // Y el ensayo no ha tocado nada: ni el hecho ni la receta.
  const antesHecho = JSON.stringify(h);
  const antesReceta = JSON.stringify(receta());
  ensayo.ensayar(receta(), h);
  assert.strictEqual(JSON.stringify(h), antesHecho);
  assert.strictEqual(JSON.stringify(receta()), antesReceta);
});

test('si_estan_todas_las_anclas_es_apto', () => {
  const h = hecho([
    nodo('n1', 'boton', 'Crear'),
    nodo('n2', 'boton', 'Siguiente'),
    nodo('n3', 'boton', 'Compartir')
  ]);
  const r = ensayo.ensayar(receta(), h);
  assert.strictEqual(r.apto, true, JSON.stringify(r.faltas));
  assert.deepStrictEqual(r.faltas, []);
  assert.strictEqual(r.motivo, null);
  // La postcondicion todavia no esta: eso es lo normal ANTES de ejecutar y no es
  // un defecto (el defecto seria no tener con que comprobarla).
  assert.strictEqual(r.alcanzabilidad, 'no');
  assert.strictEqual(r.hecho.mirada, 'completa');
});

test('las_faltas_se_acumulan_todas_con_su_paso', () => {
  const h = hecho([nodo('n1', 'boton', 'Crear')]);
  const r = ensayo.ensayar(receta(), h);
  assert.strictEqual(r.apto, false);
  assert.deepStrictEqual(r.faltas.map((f) => f.paso), [2, 3], 'cada paso que falta se nombra');
  assert.ok(r.faltas.every((f) => f.motivo === 'ancla_ausente'));
});

// ---------------------------------------------------------------------------
// 2 · no_se no es apto
// ---------------------------------------------------------------------------

test('una_mirada_parcial_no_es_apta_y_los_pasos_se_numeran', () => {
  const h = hecho([nodo('n1', 'boton', 'Crear'), nodo('n2', 'boton', 'Siguiente'), nodo('n3', 'boton', 'Compartir')], {
    mirada: 'parcial',
    motivo_sin_mirada: 'una notificacion tapaba media pantalla'
  });

  const r = ensayo.ensayar(receta(), h);
  assert.strictEqual(r.apto, false, 'no_se no es apto: ante duda no se ensaya como bueno');
  // Aunque las tres anclas "esten", no se pueden afirmar: una falta por paso, y
  // ademas la postcondicion tampoco se puede comprobar (tambien numerada).
  assert.deepStrictEqual(r.faltas.map((f) => f.paso), [1, 2, 3, 3]);
  assert.deepStrictEqual(
    r.faltas.map((f) => f.motivo),
    ['no_se_puede_afirmar', 'no_se_puede_afirmar', 'no_se_puede_afirmar', 'postcondicion_no_verificable']
  );
  assert.strictEqual(r.faltas.every((f) => f.motivo !== 'ancla_ausente'), true, 'no se disfraza de ausencia');
  assert.strictEqual(r.alcanzabilidad, 'no_se');
});

test('una_postcondicion_sin_ancla_no_se_puede_comprobar_y_no_es_apta', () => {
  const h = hecho([nodo('n1', 'boton', 'Crear'), nodo('n2', 'boton', 'Siguiente'), nodo('n3', 'boton', 'Compartir')]);
  const sinAncla = receta(null, { postcondicion: { descripcion: 'queda publicado' } });

  assert.strictEqual(ensayo.alcanzabilidad(sinAncla.postcondicion, h), 'no_se');
  const r = ensayo.ensayar(sinAncla, h);
  assert.strictEqual(r.apto, false, 'sin nada que mirar al final, el ensayo no puede decir que sirve');
  const falta = r.faltas.find((f) => f.motivo === 'postcondicion_no_verificable');
  assert.ok(falta);
  assert.strictEqual(falta.paso, 3, 'se imputa al ultimo paso, que es donde se notaria');
});

test('la_alcanzabilidad_distingue_no_de_no_se', () => {
  const conAncla = receta();
  const sinPublicado = hecho([nodo('n1', 'boton', 'Crear')]);
  const conPublicado = hecho([nodo('n1', 'boton', 'Crear'), nodo('n9', 'texto', 'Publicado')]);

  assert.strictEqual(ensayo.alcanzabilidad(conAncla.postcondicion, sinPublicado), 'no');
  assert.strictEqual(ensayo.alcanzabilidad(conAncla.postcondicion, conPublicado), 'si');
  assert.strictEqual(ensayo.alcanzabilidad({ descripcion: 'sin ancla' }, conPublicado), 'no_se');
  assert.strictEqual(
    ensayo.alcanzabilidad(conAncla.postcondicion, hecho([nodo('n9', 'texto', 'Publicado')], { mirada: 'parcial', motivo_sin_mirada: 'x' })),
    'no_se'
  );
});

// ---------------------------------------------------------------------------
// 3 · bordes
// ---------------------------------------------------------------------------

test('sin_hecho_no_se_ensaya', () => {
  assert.strictEqual(ensayo.ensayar(receta(), null).motivo, 'sin_hecho');
  assert.strictEqual(ensayo.ensayar(receta(), {}).motivo, 'sin_hecho');
  assert.strictEqual(ensayo.ensayar(receta(), { nodos: [] }).motivo, 'sin_hecho', 'un hecho sin mirada no es un hecho');
});

test('una_receta_invalida_no_se_ensaya', () => {
  const rota = receta();
  delete rota.postcondicion;
  const r = ensayo.ensayar(rota, hecho([nodo('n1', 'boton', 'Crear')]));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'defecto_de_forma');
  assert.ok(r.defectos.some((d) => d.parte === 'postcondicion' && d.paso === 3));
});

test('el_ensayo_compara_etiquetas_sin_inventar_palabras', () => {
  // Cosmetico: mayusculas, acentos y espacios de mas dan igual.
  assert.strictEqual(ensayo.normalizar_etiqueta('  Siguiente  '), 'siguiente');
  assert.strictEqual(ensayo.normalizar_etiqueta('PUBLICACIÓN'), 'publicacion');
  // Pero no se quitan palabras: "Siguiente paso" no es "Siguiente".
  const h = hecho([nodo('n1', 'boton', 'Crear'), nodo('n2', 'boton', 'Siguiente paso'), nodo('n3', 'boton', 'Compartir')]);
  const r = ensayo.ensayar(receta(), h);
  assert.strictEqual(r.apto, false);
  assert.strictEqual(r.faltas[0].paso, 2);
  assert.strictEqual(r.faltas[0].motivo, 'ancla_ausente');

  // Un nodo sin nombre visible no sirve de ancla: no se adivina por el id.
  const sinNombre = hecho([nodo('n1', 'boton', 'Crear'), { id: 'btn-siguiente', tipo: 'boton' }, nodo('n3', 'boton', 'Compartir')]);
  assert.strictEqual(ensayo.ensayar(receta(), sinNombre).faltas[0].paso, 2);
});

test('el_ensayo_es_determinista', () => {
  const h = hecho([nodo('n1', 'boton', 'Crear'), nodo('n3', 'boton', 'Compartir')]);
  const a = ensayo.ensayar(receta(), h);
  const b = ensayo.ensayar(receta(), h);
  assert.deepStrictEqual(a, b, 'mismo hecho y misma receta, mismo ensayo');
  assert.deepStrictEqual(a.faltas, ensayo.faltas(forma.validar(receta()).receta, h));
});

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

let passed = 0; const fails = [];
for (const { name, fn } of tests) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (err) { fails.push({ name, err }); }
}
if (fails.length === 0) { console.log(`\n[instagram-bridge__ensayo] OK ${passed}/${tests.length}`); process.exit(0); }
console.error(`\n[instagram-bridge__ensayo] FAIL ${fails.length}/${tests.length}`);
for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
process.exit(1);

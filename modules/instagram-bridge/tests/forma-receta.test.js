'use strict';

/**
 * instagram-bridge · A4.1 · FormaDeReceta (REFLEJO)
 *
 * Una receta son cuatro partes (precondicion, pasos, postcondicion, techo) y
 * cada paso son otras cuatro (ancla_esperada, accion, consecuencia_esperada,
 * espera_maxima). Esta suite fija lo que no se puede relajar:
 *   - una receta SIN POSTCONDICION se rechaza, y el defecto dice en que PASO se
 *     nota (no "receta invalida" a secas);
 *   - el validador NO rellena huecos: los nombra;
 *   - el tipo de accion es una lista cerrada (espejo de A3);
 *   - un techo que no cabe se rechaza nombrando el paso donde se agota;
 *   - validar no muta la entrada y devuelve la receta normalizada y congelada.
 *
 * Ejecutar: node modules/instagram-bridge/tests/forma-receta.test.js
 */

const assert = require('assert');

const forma = require('../core/forma-receta');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ---- receta de referencia (publicar en Instagram, 3 pasos) ----------------

function paso(ancla, extra) {
  return Object.assign({
    ancla_esperada: { nombre_visible: ancla, tipo: 'boton' },
    accion: { tipo: 'tocar' },
    consecuencia_esperada: { descripcion: `despues de ${ancla} la pantalla cambia` },
    espera_maxima: 1500
  }, extra || {});
}

function receta(extra) {
  return Object.assign({
    plataforma: 'instagram',
    capacidad: 'publicar',
    precondicion: { descripcion: 'la app esta abierta en inicio', ancla: { nombre_visible: 'Crear', tipo: 'boton' } },
    pasos: [paso('Crear'), paso('Siguiente'), paso('Compartir')],
    postcondicion: { descripcion: 'la pieza queda publicada', ancla: { nombre_visible: 'Publicado', tipo: 'texto' } },
    techo: 12000
  }, extra || {});
}

// ---------------------------------------------------------------------------
// 1 · receta sin postcondicion -> rechazada con el PASO que falla
// ---------------------------------------------------------------------------

test('receta_sin_postcondicion_es_rechazada_con_paso', () => {
  const sinPost = receta();
  delete sinPost.postcondicion;

  const r = forma.validar(sinPost);
  assert.strictEqual(r.ok, false, 'una receta sin postcondicion no es una receta');
  assert.strictEqual(r.motivo, 'defecto_de_forma');
  assert.strictEqual(r.receta, undefined, 'un rechazo no devuelve receta');

  const defecto = r.defectos.find((d) => d.parte === 'postcondicion');
  assert.ok(defecto, 'el defecto dice QUE parte falta');
  assert.strictEqual(defecto.motivo, 'falta');
  // Se imputa al ultimo paso: es donde se notaria que no hay nada que comprobar.
  assert.strictEqual(defecto.paso, 3, 'el defecto dice en que PASO se nota');
  assert.strictEqual(defecto.paso, sinPost.pasos.length);

  // Y no es un "fallo generico": el defecto lleva paso + parte + motivo.
  assert.strictEqual(typeof defecto.paso, 'number');
  assert.strictEqual(typeof defecto.parte, 'string');
  assert.strictEqual(typeof defecto.motivo, 'string');

  // El predicado explicito dice lo mismo, para quien no quiera mirar defectos.
  assert.strictEqual(forma.tiene_postcondicion(sinPost), false);
  assert.strictEqual(forma.tiene_postcondicion(receta()), true);

  // Una postcondicion vacia es tan inexistente como ausente.
  const vacia = receta({ postcondicion: { descripcion: '   ' } });
  const rv = forma.validar(vacia);
  assert.strictEqual(rv.ok, false);
  assert.strictEqual(rv.defectos.find((d) => d.parte === 'postcondicion').paso, 3);
});

// ---------------------------------------------------------------------------
// 2 · las cuatro partes y las cuatro de cada paso
// ---------------------------------------------------------------------------

test('faltan_las_cuatro_partes_y_se_nombran_todas', () => {
  const vacia = { plataforma: 'instagram', capacidad: 'publicar' };
  const r = forma.validar(vacia);
  assert.strictEqual(r.ok, false);

  const partes = new Set(r.defectos.map((d) => d.parte));
  for (const parte of forma.PARTES) {
    assert.ok(partes.has(parte), `el rechazo nombra la parte que falta: ${parte}`);
  }
  // Sin pasos, los defectos de receta van al paso 0 (no son de un paso).
  assert.ok(r.defectos.some((d) => d.parte === 'pasos' && d.paso === 0));
});

test('cada_paso_declara_sus_cuatro_partes', () => {
  const rota = receta();
  delete rota.pasos[1].ancla_esperada;
  delete rota.pasos[1].consecuencia_esperada;
  rota.pasos[1].espera_maxima = null;

  const r = forma.validar(rota);
  assert.strictEqual(r.ok, false);

  const delSegundo = r.defectos.filter((d) => d.paso === 2).map((d) => d.parte).sort();
  assert.deepStrictEqual(delSegundo, ['ancla_esperada', 'consecuencia_esperada', 'espera_maxima']);
  // Los pasos 1 y 3 estaban bien y no aparecen: el defecto senala, no difama.
  assert.strictEqual(r.defectos.filter((d) => d.paso === 1).length, 0);
  assert.strictEqual(r.defectos.filter((d) => d.paso === 3 && d.parte !== 'postcondicion').length, 0);
});

test('el_validador_no_rellena_huecos_ni_adivina_acciones', () => {
  // Accion que A3 no sabe ejecutar: no se convierte en "tocar".
  const accionRara = receta();
  accionRara.pasos[0].accion = { tipo: 'deslizar_con_dos_dedos' };
  const r1 = forma.validar(accionRara);
  assert.strictEqual(r1.ok, false);
  assert.deepStrictEqual(forma.validar(accionRara).defectos[0], {
    paso: 1, parte: 'accion', motivo: 'invalido', campo: 'tipo', valor: 'deslizar_con_dos_dedos'
  });
  assert.strictEqual(forma.ACCIONES.includes('deslizar_con_dos_dedos'), false);

  // Escribir sin texto es un hueco, no un texto vacio por defecto.
  const sinTexto = receta();
  sinTexto.pasos[0].accion = { tipo: 'escribir' };
  const r2 = forma.validar(sinTexto);
  assert.strictEqual(r2.ok, false);
  assert.ok(r2.defectos.some((d) => d.paso === 1 && d.parte === 'accion' && d.campo === 'texto'));

  // Direccion fuera de la lista cerrada.
  const malaDireccion = receta();
  malaDireccion.pasos[0].accion = { tipo: 'desplazar', direccion: 'diagonal' };
  assert.ok(forma.validar(malaDireccion).defectos.some((d) => d.campo === 'direccion'));

  // Y las acciones validas de verdad lo son.
  const buena = receta();
  buena.pasos[0].accion = { tipo: 'escribir', texto: 'hola mundo' };
  buena.pasos[1].accion = { tipo: 'desplazar', direccion: 'abajo', distancia: 600 };
  buena.pasos[2].accion = { tipo: 'esperar', ventana_ms: 900 };
  assert.strictEqual(forma.validar(buena).ok, true, JSON.stringify(forma.validar(buena).defectos));
});

// ---------------------------------------------------------------------------
// 3 · el techo tiene que caber
// ---------------------------------------------------------------------------

test('un_techo_que_no_cabe_se_rechaza_nombrando_el_paso', () => {
  // 3 pasos de 1500 ms = 4500 necesarios; techo de 3000 se agota en el paso 3.
  const corto = receta({ techo: 3000 });
  const r = forma.validar(corto);
  assert.strictEqual(r.ok, false);
  const d = r.defectos.find((x) => x.parte === 'techo');
  assert.strictEqual(d.motivo, 'techo_insuficiente');
  assert.strictEqual(d.paso, 3, 'el presupuesto se agota en el paso 3');
  assert.strictEqual(d.necesita_ms, 4500);
  assert.strictEqual(d.techo, 3000);

  assert.strictEqual(forma.coste_declarado_ms(corto), 4500);
  // Justo el coste declarado si cabe.
  assert.strictEqual(forma.validar(receta({ techo: 4500 })).ok, true);
});

// ---------------------------------------------------------------------------
// 4 · validar no muta y devuelve la receta congelada
// ---------------------------------------------------------------------------

test('validar_no_muta_la_entrada_y_congela_la_receta', () => {
  const original = receta({ nota_interna: 'esto no es una parte de la receta' });
  const antes = JSON.stringify(original);

  const r = forma.validar(original);
  assert.strictEqual(r.ok, true, JSON.stringify(r.defectos));
  assert.strictEqual(JSON.stringify(original), antes, 'validar no toca la entrada');

  // La receta validada lleva las seis partes y NADA mas: la nota se queda fuera.
  assert.deepStrictEqual(Object.keys(r.receta).sort(), [
    'capacidad', 'pasos', 'plataforma', 'postcondicion', 'precondicion', 'techo'
  ]);
  assert.strictEqual(r.receta.pasos.length, 3);
  assert.deepStrictEqual(Object.keys(r.receta.pasos[0]).sort(), [...forma.PARTES_DE_PASO].sort());

  // Congelada: una receta validada no se retoca por el camino.
  assert.strictEqual(Object.isFrozen(r.receta), true);
  assert.strictEqual(Object.isFrozen(r.receta.pasos), true);
  assert.strictEqual(Object.isFrozen(r.receta.pasos[0]), true);
  assert.throws(() => { 'use strict'; r.receta.techo = 1; }, /read only|Cannot assign/i);

  // Y la plataforma por defecto es la unica del puente.
  const sinPlataforma = receta();
  delete sinPlataforma.plataforma;
  assert.strictEqual(forma.validar(sinPlataforma).receta.plataforma, 'instagram');
  assert.strictEqual(forma.validar(receta({ plataforma: 'tiktok' })).ok, false);
});

test('la_firma_distingue_dos_recetas_distintas', () => {
  assert.strictEqual(forma.firma(receta()), forma.firma(receta()));

  const otra = receta();
  otra.pasos[2].espera_maxima = 900;
  otra.techo = 12000;
  assert.notStrictEqual(forma.firma(otra), forma.firma(receta()));
  // Una receta invalida no tiene firma: no se puede comparar lo que no existe.
  assert.strictEqual(forma.firma({}), null);
});

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

let passed = 0; const fails = [];
for (const { name, fn } of tests) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (err) { fails.push({ name, err }); }
}
if (fails.length === 0) { console.log(`\n[instagram-bridge__forma-receta] OK ${passed}/${tests.length}`); process.exit(0); }
console.error(`\n[instagram-bridge__forma-receta] FAIL ${fails.length}/${tests.length}`);
for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
process.exit(1);

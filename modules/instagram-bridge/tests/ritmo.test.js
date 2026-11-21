'use strict';

/**
 * instagram-bridge · G1 · PerfilDeRitmo (REFLEJO)
 *
 * El ritmo no es una sensacion: es una tabla. Esta suite fija lo que la tabla
 * tiene que cumplir para que el regulador (G6) pueda apoyarse en ella:
 *   - publicar cuesta mas que leer y el pulso es el MINIMO de todos;
 *   - una accion sin precio no se cobra como cero: se nombra;
 *   - el techo sale de la conservaduria, y sin dato la cuenta arranca en el
 *     MAXIMO CONSERVADOR (fallar cerrado);
 *   - publicaciones_al_dia se calcula del techo, no se declara aparte;
 *   - nada de esto lee el reloj: el mismo payload da el mismo resultado.
 *
 * Ejecutar: node modules/instagram-bridge/tests/ritmo.test.js
 */

const assert = require('assert');

const ritmo = require('../core/ritmo');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M1 = '2026-11-11T10:00:00Z';
const M2 = '2026-11-11T10:30:00Z';

// ---------------------------------------------------------------------------
// 1 · la tabla de costes: publicar > leer > pulso, y el pulso es el minimo
// ---------------------------------------------------------------------------

test('publicar_cuesta_mas_que_leer_y_el_pulso_es_minimo', () => {
  const coste_publicar = ritmo.coste_de('publicar');
  const coste_leer = ritmo.coste_de('leer');
  const coste_pulso = ritmo.coste_de('pulso');

  assert.strictEqual(typeof coste_publicar, 'number');
  assert.strictEqual(typeof coste_leer, 'number');
  assert.strictEqual(typeof coste_pulso, 'number');

  assert.ok(coste_publicar > coste_leer, `publicar (${coste_publicar}) tiene que costar mas que leer (${coste_leer})`);
  assert.ok(coste_leer > coste_pulso, `leer (${coste_leer}) tiene que costar mas que el pulso (${coste_pulso})`);

  // El pulso es el minimo de la tabla, y es 1: un pulso que costara como una
  // publicacion no se haria nunca, y sin pulso no se sabe si la app responde.
  assert.strictEqual(coste_pulso, 1);
  assert.strictEqual(coste_pulso, ritmo.coste_minimo(), 'el pulso TIENE que ser el minimo');
  assert.strictEqual(coste_publicar, ritmo.coste_maximo(), 'publicar tiene que ser lo mas caro');

  for (const accion of ritmo.ACCIONES) {
    const c = ritmo.coste_de(accion);
    assert.ok(c > 0, `${accion} no puede costar 0: un coste nulo es una accion gratis`);
    assert.strictEqual(Number.isInteger(c), true, `${accion} tiene que costar un entero`);
    assert.ok(coste_pulso <= c, `el pulso no puede costar mas que ${accion}`);
  }

  // Publicar tambien es lo que mas espera pide: es la unica que la plataforma
  // castiga por si sola.
  assert.ok(
    ritmo.espera_minima_de('publicar') > ritmo.espera_minima_de('leer'),
    'tras publicar se espera mas que tras leer'
  );
  assert.strictEqual(ritmo.espera_minima_de('pulso'), 0, 'el pulso no abre espera');
});

test('una_accion_sin_precio_no_se_cobra_como_cero', () => {
  assert.strictEqual(ritmo.coste_de('teleportar'), null);
  assert.strictEqual(ritmo.coste_de(undefined), null);
  assert.strictEqual(ritmo.coste_de(null), null);
  assert.strictEqual(ritmo.es_accion('publicar'), true);
  assert.strictEqual(ritmo.es_accion('Publicar'), false, 'la tabla es cerrada y sensible a mayusculas');

  const lote = ritmo.coste_de_lote(['publicar', 'teleportar', 'leer']);
  assert.strictEqual(lote.ok, false, 'un lote con una accion desconocida no es regulable');
  assert.strictEqual(lote.motivo, 'accion_desconocida');
  assert.deepStrictEqual(lote.desconocidas, ['teleportar']);
  assert.strictEqual(lote.coste, ritmo.coste_de('publicar') + ritmo.coste_de('leer'),
    'la desconocida NO suma, pero tampoco resta: no se regala presupuesto');

  const bueno = ritmo.coste_de_lote(['publicar', 'leer', 'pulso']);
  assert.strictEqual(bueno.ok, true);
  assert.deepStrictEqual(bueno.por_familia, { publicacion: 12, lectura: 2, pulso: 1 });
});

// ---------------------------------------------------------------------------
// 2 · el techo sale de la conservaduria; sin dato, el maximo conservador
// ---------------------------------------------------------------------------

test('sin_conservaduria_el_perfil_es_el_maximo_conservador', () => {
  for (const sinDato of [undefined, null, '', 'no-es-un-numero', NaN]) {
    const p = ritmo.perfil(sinDato);
    assert.strictEqual(p.nombre, 'maximo_conservador', `sin dato (${String(sinDato)}) se arranca conservador`);
    assert.strictEqual(p.conservaduria, ritmo.CONSERVADURIA_MAXIMA);
    assert.strictEqual(p.techo_diario, 20, 'el techo mas bajo de la tabla');
    assert.strictEqual(p.pausa_minima_minutos, 30);
  }

  // La conservaduria se recorta, y el perfil dice que la recorto.
  assert.strictEqual(ritmo.perfil(500).conservaduria, 100);
  assert.strictEqual(ritmo.perfil(500).ajustada, true);
  assert.strictEqual(ritmo.perfil(-40).conservaduria, ritmo.CONSERVADURIA_MINIMA);
  assert.strictEqual(ritmo.perfil(120).ajustada, true);
  assert.strictEqual(ritmo.perfil(100).ajustada, false);

  // Escalones, con sus fronteras.
  assert.strictEqual(ritmo.perfil(100).nombre, 'maximo_conservador');
  assert.strictEqual(ritmo.perfil(75).nombre, 'maximo_conservador');
  assert.strictEqual(ritmo.perfil(74).nombre, 'conservador');
  assert.strictEqual(ritmo.perfil(50).nombre, 'conservador');
  assert.strictEqual(ritmo.perfil(49).nombre, 'normal');
  assert.strictEqual(ritmo.perfil(25).nombre, 'normal');
  assert.strictEqual(ritmo.perfil(24).nombre, 'confiado');
  assert.strictEqual(ritmo.perfil(ritmo.CONSERVADURIA_MINIMA).nombre, 'confiado');

  // Mas conservador = menos techo y mas pausa. Siempre. Sin excepciones.
  const orden = [100, 60, 30, 10].map((c) => ritmo.perfil(c));
  for (let i = 1; i < orden.length; i += 1) {
    assert.ok(orden[i].techo_diario > orden[i - 1].techo_diario, 'menos conservador = mas techo');
    assert.ok(orden[i].pausa_minima_minutos < orden[i - 1].pausa_minima_minutos, 'menos conservador = menos pausa');
  }
});

test('publicaciones_al_dia_se_calcula_del_techo_y_no_se_declara_aparte', () => {
  for (const conservaduria of [100, 60, 30, 10]) {
    const p = ritmo.perfil(conservaduria);
    assert.strictEqual(
      p.publicaciones_al_dia,
      Math.floor(p.techo_diario / p.coste_publicar),
      `el perfil ${p.nombre} tiene que poder decir cuantas publicaciones caben`
    );
  }
  // La cuenta nueva puede publicar UNA cosa al dia y leer un poco. Ni dos.
  assert.strictEqual(ritmo.perfil_de_cuenta_nueva().publicaciones_al_dia, 1);
  assert.ok(ritmo.perfil(10).publicaciones_al_dia > 1, 'una cuenta que ha tolerado mucho puede publicar mas');
});

test('cabe_dice_lo_que_queda_y_no_redondea_a_favor', () => {
  const r = ritmo.cabe(12, 10, 20);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.cabe, false, '12 en un restante de 10 no cabe');
  assert.strictEqual(r.restante, 10);

  assert.strictEqual(ritmo.cabe(12, 8, 20).cabe, true, '12 en un restante de 12 SI cabe');
  assert.strictEqual(ritmo.cabe(12, 9, 20).cabe, false, '12 en un restante de 11 no cabe');
  assert.strictEqual(ritmo.cabe('no-numero', 0, 20).ok, false, 'un coste ilegible no cabe: no se adivina');
});

// ---------------------------------------------------------------------------
// 3 · el tiempo no se lee: se calcula sobre el instante que llega
// ---------------------------------------------------------------------------

test('el_tiempo_se_calcula_sobre_el_instante_que_llega', () => {
  assert.strictEqual(ritmo.desplazar(M1, 30), M2);
  assert.strictEqual(ritmo.desplazar(M1, 0), M1);
  assert.strictEqual(ritmo.desplazar('no-es-un-instante', 30), null);
  assert.strictEqual(ritmo.desplazar(M1, 'no-numero'), null);

  assert.strictEqual(ritmo.antes_de(M1, M2), true);
  assert.strictEqual(ritmo.antes_de(M2, M1), false);
  assert.strictEqual(ritmo.antes_de(M1, M1), false, 'un instante no es anterior a si mismo');
  assert.strictEqual(ritmo.antes_de('basura', M2), false, 'con instantes invalidos no se afirma nada');

  assert.strictEqual(ritmo.minutos_entre(M1, M2), 30);
  assert.strictEqual(ritmo.minutos_entre(M2, M1), -30);
  assert.strictEqual(ritmo.minutos_entre(M1, 'basura'), null);

  assert.strictEqual(ritmo.mas_tarde(M1, M2), M2);
  assert.strictEqual(ritmo.mas_pronto(M1, M2), M1);
  assert.strictEqual(ritmo.mas_tarde(M1, null), M1);
  assert.strictEqual(ritmo.mas_tarde(null, null), null);
});

test('el_reflejo_no_lee_el_reloj', () => {
  const original = Date.now;
  Date.now = () => { throw new Error('G1 no puede leer el reloj'); };
  try {
    const p = ritmo.perfil(80); // maximo conservador: pausa 30 min
    const lote = ritmo.coste_de_lote(['publicar', 'leer']);
    const fin = ritmo.desplazar(M1, p.pausa_minima_minutos);
    assert.strictEqual(p.pausa_minima_minutos, 30);
    assert.strictEqual(fin, '2026-11-11T10:30:00Z');
    assert.strictEqual(typeof lote.coste, 'number');
  } finally {
    Date.now = original;
  }

  // Y el mismo payload da el mismo resultado, dos veces.
  const a = JSON.stringify(ritmo.perfil(63));
  const b = JSON.stringify(ritmo.perfil(63));
  assert.strictEqual(a, b);
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__ritmo] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__ritmo] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

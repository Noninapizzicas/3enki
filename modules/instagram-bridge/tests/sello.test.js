'use strict';

/**
 * instagram-bridge · P1 · SelloDeProyecto (REFLEJO)
 *
 * El sello se pone en el NACIMIENTO: un dato sin sello no entra en ningun
 * almacen, y el custodio lo rechaza con motivo `sin_sello`. Esta suite fija:
 *   - dato sin sello → ningun almacen lo acepta (ni el privado ni el comun) y
 *     ninguna lectura lo devuelve.
 *   - sellar pone el quinteto completo y NO muta el original; el sello nace
 *     congelado (el sello no se reescribe).
 *   - sin `momento` no hay sello: el reloj lo trae quien llama, no la pieza.
 *   - sellar dos veces con el mismo sello es idempotente (el bus reintenta);
 *     con otro sello se rechaza: es una reescritura del origen.
 *   - un sello roto se rechaza, no se "arregla".
 *   - `anadir_historia` conserva el sello de nacimiento y deja el cambio en la
 *     historia (traspaso B4): se puede reconstruir de quien fue cada cosa.
 *
 * Ejecutar: node modules/instagram-bridge/tests/sello.test.js
 */

const assert = require('assert');
const sello = require('../core/sello');
const { comprobar, sellar, anadir_historia, vigente } = sello;

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const MOMENTO = '2026-11-11T12:00:00Z';

function ambito(opts = {}) {
  return Object.assign({
    proyecto: 'proy-a',
    cuenta: '@taller_a',
    aparato: 'movil-1',
    momento: MOMENTO,
    quien: 'dueno'
  }, opts);
}

// Almacen minimo con la regla del custodio: sin sello no se guarda.
function almacen() {
  const datos = [];
  return {
    datos,
    persistir(dato) {
      const c = comprobar(dato);
      if (!c.ok) return { ok: false, guardado: false, motivo: c.motivo, faltan: c.faltan };
      datos.push(dato);
      return { ok: true, guardado: true };
    }
  };
}

test('dato_sin_sello_no_entra_en_ningun_almacen', () => {
  const privado = almacen();
  const comun = almacen();
  const huerfano = { pantalla: 'perfil', seguidores: 12 };

  for (const a of [privado, comun]) {
    const r = a.persistir(huerfano);
    assert.strictEqual(r.ok, false, 'el almacen rechaza el huerfano');
    assert.strictEqual(r.guardado, false);
    assert.strictEqual(r.motivo, 'sin_sello');
    assert.ok(r.faltan.includes('proyecto') && r.faltan.includes('momento'), 'dice que falta');
    assert.strictEqual(a.datos.length, 0, 'no ha entrado nada');
  }

  // Tampoco sale en una lectura: sin sello no pertenece a ningun ambito.
  assert.strictEqual(comprobar(huerfano).estado, 'huerfano');
  assert.strictEqual(comprobar(huerfano).ok, false);
});

test('sellar_pone_el_quinteto_y_no_muta_el_original', () => {
  const original = { pantalla: 'perfil', seguidores: 12 };
  const r = sellar(original, ambito());
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(Object.keys(r.sello).sort(), ['aparato', 'cuenta', 'momento', 'proyecto', 'quien']);
  assert.strictEqual(r.dato.sello.proyecto, 'proy-a');
  assert.strictEqual(r.dato.pantalla, 'perfil', 'el contenido no se toca');
  assert.strictEqual(original.sello, undefined, 'el original no se muta');
  assert.strictEqual(comprobar(r.dato).estado, 'sellado');
});

test('el_sello_nace_congelado', () => {
  const { sello: s } = sellar({ a: 1 }, ambito());
  assert.ok(Object.isFrozen(s), 'el sello esta congelado');
  assert.throws(() => { s.proyecto = 'proy-b'; }, TypeError, 'no se puede reescribir el sello');
});

test('sin_momento_no_hay_sello', () => {
  const a = ambito();
  delete a.momento;
  const r = sellar({ a: 1 }, a);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'sin_sello');
  assert.ok(r.faltan.includes('momento'), 'el hueco se nombra');
});

test('quien_tiene_que_ser_declarado', () => {
  const r = sellar({ a: 1 }, ambito({ quien: 'cualquiera' }));
  assert.strictEqual(r.ok, false);
  assert.ok(r.invalidos.includes('quien'), 'quien no declarado es invalido, no se acepta');
});

test('sellar_dos_veces_es_idempotente_y_no_reescribe', () => {
  const primero = sellar({ a: 1 }, ambito());
  const otraVez = sellar(primero.dato, ambito());
  assert.strictEqual(otraVez.ok, true);
  assert.strictEqual(otraVez.idempotente, true);

  const reescritura = sellar(primero.dato, ambito({ proyecto: 'proy-b' }));
  assert.strictEqual(reescritura.ok, false);
  assert.strictEqual(reescritura.motivo, 'sello_ya_presente');
  assert.strictEqual(primero.dato.sello.proyecto, 'proy-a', 'el sello sigue siendo el de nacimiento');
});

test('un_sello_roto_se_rechaza_no_se_arregla', () => {
  const roto = { a: 1, sello: { proyecto: 'proy-a' } };
  const r = sellar(roto, ambito());
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'sello_invalido');
  assert.ok(r.faltan.includes('cuenta') && r.faltan.includes('momento'), 'dice que falta del sello roto');
});

test('anadir_historia_conserva_el_sello_de_nacimiento', () => {
  const nacido = sellar({ pieza: 'cartel' }, ambito()).dato;
  const traspaso = anadir_historia(nacido, {
    a: ambito({ proyecto: 'proy-b' }),
    motivo: 'traspaso de la cuenta al proyecto B',
    momento: '2026-11-12T08:00:00Z',
    quien: 'dueno'
  });

  assert.strictEqual(traspaso.ok, true);
  assert.strictEqual(traspaso.dato.sello.proyecto, 'proy-a', 'el original no cambia');
  assert.strictEqual(traspaso.historia_sello.length, 1);
  assert.strictEqual(traspaso.historia_sello[0].secuencia, 1);
  assert.strictEqual(traspaso.historia_sello[0].de.proyecto, 'proy-a');
  assert.strictEqual(traspaso.historia_sello[0].a.proyecto, 'proy-b');
  assert.strictEqual(vigente(traspaso.dato).proyecto, 'proy-b', 'el vigente es el destino');

  // Una segunda historia no pisa la primera.
  const segunda = anadir_historia(traspaso.dato, {
    a: ambito({ proyecto: 'proy-c' }),
    motivo: 'segundo traspaso',
    momento: '2026-11-13T08:00:00Z',
    quien: 'dueno'
  });
  assert.strictEqual(segunda.historia_sello.length, 2);
  assert.strictEqual(segunda.historia_sello[1].secuencia, 2);
  assert.strictEqual(segunda.historia_sello[0].a.proyecto, 'proy-b', 'la historia no se reescribe');
  assert.strictEqual(vigente(segunda.dato).proyecto, 'proy-c');
});

test('anadir_historia_exige_motivo_momento_y_quien', () => {
  const nacido = sellar({ pieza: 'cartel' }, ambito()).dato;
  const r = anadir_historia(nacido, { a: ambito({ proyecto: 'proy-b' }) });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'cambio_de_sello_incompleto');
  assert.deepStrictEqual(r.faltan.sort(), ['momento', 'motivo', 'quien']);
});

test('no_hay_historia_sobre_un_dato_sin_sello', () => {
  const r = anadir_historia({ pieza: 'cartel' }, {
    motivo: 'traspaso', momento: MOMENTO, quien: 'dueno'
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'sin_sello');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log(`  ok  ${name}`); }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[instagram-bridge__sello] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__sello] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

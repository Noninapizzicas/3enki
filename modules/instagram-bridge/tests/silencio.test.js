'use strict';

/**
 * instagram-bridge · N5 · SilencioElegido (REFLEJO)
 *
 * La regla del bloque, fijada aqui:
 *
 *   **una QUEJA no se silencia, se escala.**
 *
 * Se prueba por las dos puertas que tiene la decision:
 *   - por CLASE: `clase: 'queja'` → `escalar`, y `silencio: true` en la peticion
 *     no cambia nada (no hay parametro que compre el silencio);
 *   - por TEXTO: una queja mal clasificada como `consulta` tambien se escala, y
 *     se devuelve la reclasificacion. Es la puerta que de verdad protege,
 *     porque los clasificadores se equivocan.
 *
 * Ademas: lo ininteligible no se calla, el spam si, un agradecimiento puede
 * callarse, y una clase desconocida se responde (el defecto seguro no es
 * callar).
 *
 * Ejecutar: node modules/instagram-bridge/tests/silencio.test.js
 */

const assert = require('assert');

const n5 = require('../operacion/silencio');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ---------------------------------------------------------------------------
// 1 · LA REGLA
// ---------------------------------------------------------------------------

test('una_queja_no_se_silencia_se_escala', () => {
  // --- por clase ----------------------------------------------------------
  const porClase = n5.decidir({ clase: 'queja', texto: 'El pedido llego roto', silencio: true });
  assert.strictEqual(porClase.ok, true);
  assert.strictEqual(porClase.decision, 'escalar');
  assert.strictEqual(porClase.silencio, false);
  assert.strictEqual(porClase.puede_silenciar, false);
  assert.strictEqual(porClase.escala_a, 'persona');
  assert.strictEqual(porClase.motivo, 'una_queja_no_se_silencia');
  assert.strictEqual(porClase.revisar, true, 'una persona tiene que mirarlo');

  // Ni con la peticion pidiendo silencio, ni con repeticiones, ni con politica.
  const insistente = n5.decidir({ clase: 'queja', texto: 'esto es una estafa', silencio: true, repeticiones: 20 });
  assert.strictEqual(insistente.decision, 'escalar');
  assert.strictEqual(insistente.silencio, false);

  // --- por texto, aunque la clase diga otra cosa -------------------------
  const malClasificada = n5.decidir({ clase: 'consulta', texto: 'Me habeis cobrado dos veces, quiero una devolucion' });
  assert.strictEqual(malClasificada.decision, 'escalar');
  assert.strictEqual(malClasificada.silencio, false);
  assert.strictEqual(malClasificada.reclasificacion, 'queja');
  assert.strictEqual(malClasificada.motivo, 'queja_no_declarada_como_queja');
  assert.ok(malClasificada.motivos.includes('una_queja_no_se_silencia'));

  // Y con el lexico en mayusculas y con tildes.
  const conTildes = n5.decidir({ clase: 'spam', texto: 'ESTO ES UNA RECLAMACIÓN, PÉSIMO SERVICIO' });
  assert.strictEqual(conTildes.decision, 'escalar');
  assert.strictEqual(conTildes.silencio, false);

  // El texto se mira siempre: sin clase, con texto de queja, se escala.
  const sinClase = n5.decidir({ texto: 'no funciona y no me devolveis el dinero' });
  assert.strictEqual(sinClase.decision, 'escalar');
});

// ---------------------------------------------------------------------------
// 2 · cuando callar si es la respuesta
// ---------------------------------------------------------------------------

test('el_spam_se_puede_callar', () => {
  const r = n5.decidir({ clase: 'spam', texto: 'Compra seguidores, link in bio' });
  assert.strictEqual(r.decision, 'silencio');
  assert.strictEqual(r.silencio, true);
  assert.strictEqual(r.puede_silenciar, true);
  assert.strictEqual(r.motivo, 'spam');
  assert.strictEqual(n5.es_silencio(r), true);

  const repetido = n5.decidir({ clase: 'spam', texto: 'sorteo', repeticiones: 5 });
  assert.strictEqual(repetido.decision, 'silencio');
  assert.strictEqual(repetido.motivo, 'spam_repetido');
});

test('un_agradecimiento_no_pide_respuesta_pero_se_puede_contestar', () => {
  const r = n5.decidir({ clase: 'agradecimiento', texto: 'Muchas gracias!' });
  assert.strictEqual(r.decision, 'silencio');
  assert.strictEqual(r.motivo, 'no_hace_falta_contestar');

  const politica = n5.decidir({ clase: 'agradecimiento' }, { politica: { silencio_en_agradecimiento: false } });
  assert.strictEqual(politica.decision, 'responder');

  const exige = n5.decidir({ clase: 'agradecimiento', exige_respuesta: true });
  assert.strictEqual(exige.decision, 'responder');
});

// ---------------------------------------------------------------------------
// 3 · lo que no se calla nunca
// ---------------------------------------------------------------------------

test('lo_ininteligible_no_se_calla_se_escala', () => {
  for (const peticion of [
    { clase: 'ininteligible', texto: 'asdkjhqwr' },
    { clase: 'consulta', delicado: true, texto: 'hola' }
  ]) {
    const r = n5.decidir(peticion);
    assert.strictEqual(r.decision, 'escalar');
    assert.strictEqual(r.silencio, false);
    assert.strictEqual(r.escala_a, 'persona');
  }
});

test('una_consulta_o_un_pedido_se_responden', () => {
  for (const clase of ['consulta', 'pedido']) {
    const r = n5.decidir({ clase, texto: 'cuanto cuesta?' });
    assert.strictEqual(r.decision, 'responder');
    assert.strictEqual(r.silencio, false);
    assert.strictEqual(r.motivo, 'espera_respuesta');
  }
});

test('una_clase_desconocida_se_responde_por_defecto', () => {
  const r = n5.decidir({ clase: 'lo_que_sea', texto: 'hola' });
  assert.strictEqual(r.decision, 'responder', 'callar por defecto pierde personas');
  assert.strictEqual(r.silencio, false);
  assert.strictEqual(r.revisar, true);

  const vacia = n5.decidir({});
  assert.strictEqual(vacia.decision, 'responder');

  const nada = n5.decidir(null);
  assert.strictEqual(nada.ok, false);
  assert.strictEqual(nada.motivo, 'entrada_invalida');
});

// ---------------------------------------------------------------------------
// 4 · reflejo puro
// ---------------------------------------------------------------------------

test('la_misma_entrada_da_siempre_la_misma_decision', () => {
  const peticion = { clase: 'consulta', texto: 'me han cobrado dos veces' };
  const a = n5.decidir(peticion);
  const b = n5.decidir(peticion);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(peticion.decision, undefined, 'no muta la peticion');

  // Sin reloj: si el momento no viene, no se inventa.
  assert.strictEqual(n5.decidir({ clase: 'spam' }).decidido_en, undefined);
});

test('el_lexico_de_queja_es_el_mismo_que_usa_la_bandeja', () => {
  assert.strictEqual(n5.es_queja('quiero poner una reclamacion'), true);
  assert.strictEqual(n5.es_queja('todo perfecto, gracias'), false);
  assert.strictEqual(n5.es_queja(undefined), false);
  assert.ok(Array.isArray(n5.QUEJA));
  assert.ok(n5.QUEJA.includes('estafa'));
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__silencio] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__silencio] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

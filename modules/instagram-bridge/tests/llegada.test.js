'use strict';

/**
 * instagram-bridge · N2 · ClasificadorDeLlegada (MICRO-AGENTE)
 *
 * La regla del bloque, fijada aqui:
 *
 *   **un mensaje ININTELIGIBLE es delicado, no ruido** (no se descarta: se
 *   escala a persona).
 *
 * Se prueba con los cuatro modos de no entender nada — vacio, solo emojis,
 * teclado machacado, solo simbolos — y en los cuatro se exige lo mismo:
 * `delicado: true`, `destino: 'escalar'`, `se_descarta: false`. El fallo que
 * esta suite existe para impedir es el silencioso: devolver `spam` o
 * `archivar` porque el texto no se parece a nada conocido.
 *
 * Y la otra mitad del contrato: sin LLM funciona, y con un LLM que falla
 * tambien. El juicio no puede bajar dos suelos: lo ilegible y la queja.
 *
 * Ejecutar: node modules/instagram-bridge/tests/llegada.test.js
 */

const assert = require('assert');

const n2 = require('../operacion/llegada');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ---------------------------------------------------------------------------
// 1 · LA REGLA
// ---------------------------------------------------------------------------

test('mensaje_ininteligible_es_delicial_no_ruido', () => {
  const casos = [
    { texto: '', que: 'vacio' },
    { texto: '   \n  ', que: 'solo espacios' },
    { texto: '😀😀😀😀😀', que: 'solo emojis' },
    { texto: '!!!???...', que: 'solo signos' },
    { texto: 'asdkjhqwr zxcvbnm', que: 'teclado' },
    { texto: 'qwrtyp lmnbvc', que: 'teclado 2' }
  ];

  for (const c of casos) {
    const r = n2.clasificar(c.texto);
    assert.strictEqual(r.ok, true, `${c.que}: clasificar no falla`);
    assert.strictEqual(r.clase, 'ininteligible', `${c.que}: no se entiende`);
    assert.strictEqual(r.delicado, true, `${c.que}: es delicado`);
    assert.strictEqual(r.destino, 'escalar', `${c.que}: se escala, no se archiva`);
    assert.strictEqual(r.escala_a, 'persona');
    assert.strictEqual(r.requiere_persona, true);
    assert.strictEqual(r.se_descarta, false, `${c.que}: NO se descarta`);
    assert.strictEqual(r.se_archiva, false);
    assert.strictEqual(r.via, 'tabla');
    assert.ok(r.motivo, `${c.que}: el motivo se nombra`);
  }

  // Un objeto sin texto tambien es una llegada: no se pierde.
  const sinTexto = n2.clasificar({ remitente: 'maria.ceramica', tipo: 'dm' });
  assert.strictEqual(sinTexto.clase, 'ininteligible');
  assert.strictEqual(sinTexto.se_descarta, false);

  // Y `null` tampoco revienta.
  const nada = n2.clasificar(null);
  assert.strictEqual(nada.ok, true);
  assert.strictEqual(nada.clase, 'ininteligible');
  assert.strictEqual(nada.delicado, true);
});

// ---------------------------------------------------------------------------
// 2 · la tabla cerrada, sin LLM
// ---------------------------------------------------------------------------

test('sin_llm_clasifica_con_la_tabla', () => {
  const casos = [
    ['Hola, cuanto cuesta el envio?', 'pedido'],
    ['Me interesa, me lo llevo', 'pedido'],
    ['Esto es una estafa, me habeis cobrado dos veces', 'queja'],
    ['El pedido llego roto, quiero una devolucion', 'queja'],
    ['Muchas gracias, genial', 'agradecimiento'],
    ['Hola, teneis el horario de apertura?', 'consulta'],
    ['Compra seguidores barato, link in bio', 'spam'],
    ['Gana dinero desde casa sin invertir', 'spam']
  ];
  for (const [texto, esperada] of casos) {
    const r = n2.clasificar(texto);
    assert.strictEqual(r.clase, esperada, `"${texto}" -> ${esperada}`);
    assert.strictEqual(r.via, 'tabla');
  }
});

test('una_consulta_normal_no_se_confunde_con_spam', () => {
  // "gratis" es una senal debil: sola no es spam, y el pedido manda.
  const r = n2.clasificar('Hola, haceis envios gratis?');
  assert.strictEqual(r.clase, 'pedido');
  assert.strictEqual(r.destino, 'responder');
});

test('un_idioma_que_no_esta_en_el_lexico_no_es_ininteligible', () => {
  // No entender el idioma no es lo mismo que no poder leer: se contesta.
  const r = n2.clasificar('Bonjour, je voudrais connaitre le prix');
  assert.notStrictEqual(r.clase, 'ininteligible');
  assert.strictEqual(r.destino, 'responder');
});

// ---------------------------------------------------------------------------
// 3 · el juicio es opcional y no manda
// ---------------------------------------------------------------------------

test('un_juicio_valido_afina_la_clase', () => {
  const juicio = () => ({ clase: 'pedido', confianza: 0.91, motivo: 'pide catalogo' });
  const r = n2.clasificar('Tengo una duda sobre lo que teneis', { juicio });
  assert.strictEqual(r.clase, 'pedido');
  assert.strictEqual(r.via, 'juicio');
  assert.strictEqual(r.confianza, 0.91);
  assert.strictEqual(r.ok, true);
});

test('un_juicio_que_falla_no_rompe_nada', () => {
  const revienta = () => { throw new Error('sin cuota'); };
  const r = n2.clasificar('Hola, cuanto cuesta?', { juicio: revienta });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.clase, 'pedido');
  assert.strictEqual(r.via, 'tabla');
  assert.ok(r.avisos.includes('juicio_invalido_se_usa_la_tabla'));

  const basura = () => ({ clase: 'lo_que_sea' });
  const r2 = n2.clasificar('Hola, cuanto cuesta?', { juicio: basura });
  assert.strictEqual(r2.clase, 'pedido');
  assert.strictEqual(r2.via, 'tabla');

  // Una promesa no cabe en una pieza pura: se ignora y se sigue.
  const asincrono = () => Promise.resolve({ clase: 'pedido' });
  const r3 = n2.clasificar('Hola, cuanto cuesta?', { juicio: asincrono });
  assert.strictEqual(r3.via, 'tabla');
  assert.strictEqual(r3.clase, 'pedido');
});

test('el_juicio_no_puede_bajar_lo_ilegible_ni_una_queja', () => {
  // 1 · ilegible: ni se pregunta. Un modelo no hace legible lo que no lo es.
  let llamado = 0;
  const juicio = () => { llamado += 1; return { clase: 'consulta' }; };
  const ilegible = n2.clasificar('asdkjhqwr zxcvbnm', { juicio });
  assert.strictEqual(llamado, 0, 'no se pregunta por un texto ilegible');
  assert.strictEqual(ilegible.clase, 'ininteligible');
  assert.strictEqual(ilegible.delicado, true);
  assert.ok(ilegible.avisos.includes('juicio_descartado_texto_ilegible'));

  // 2 · queja: el juicio puede decir "spam", pero la queja es un suelo.
  const juicioMalo = () => ({ clase: 'spam' });
  const queja = n2.clasificar('Me habeis cobrado dos veces, esto es una estafa', { juicio: juicioMalo });
  assert.strictEqual(queja.clase, 'queja');
  assert.strictEqual(queja.delicado, true);
  assert.strictEqual(queja.destino, 'escalar');
  assert.strictEqual(queja.se_descarta, false);
  assert.ok(queja.avisos.includes('juicio_no_puede_bajar_una_queja'));
});

test('el_juicio_puede_subir_la_delicadeza', () => {
  // Clase normal, pero el juicio detecta algo delicado: va a una persona.
  const juicio = () => ({ clase: 'consulta', delicado: true, motivo: 'menciona salud' });
  const r = n2.clasificar('Hola, teneis el horario?', { juicio });
  assert.strictEqual(r.clase, 'consulta');
  assert.strictEqual(r.delicado, true);
  assert.strictEqual(r.destino, 'escalar');
  assert.strictEqual(r.se_descarta, false);
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__llegada] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__llegada] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

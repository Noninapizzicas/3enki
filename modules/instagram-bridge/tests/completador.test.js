'use strict';

/**
 * instagram-bridge · C2 · CompletadorDePeticion (MICRO-AGENTE)
 *
 * **Una respuesta que NO ENCAJA se repregunta UNA VEZ, y despues se rinde con lo
 * que tenga.** Esta suite fija:
 *
 *   - la primera respuesta que no encaja provoca UNA repregunta (y se dice por
 *     que no encajaba);
 *   - la segunda que no encaja ya no repregunta: se rinde, devuelve lo que tiene
 *     con lo que falta nombrado, y para. No hay tercera;
 *   - una respuesta que encaja avanza a la siguiente pregunta, y al final la
 *     peticion queda completa;
 *   - lo que no encaja NO se guarda: un «no se» no se convierte en el texto de
 *     la pieza;
 *   - los datos que llegan con la peticion se validan igual que una respuesta;
 *   - el estado que entra no se muta (se puede guardar entre dos mensajes);
 *   - una capacidad que no existe no abre estado; y nada de esto lanza.
 *
 * Ejecutar: node modules/instagram-bridge/tests/completador.test.js
 */

const assert = require('assert');

const c2 = require('../puente/completador');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function abrir(capacidad = 'publicar', datos = {}) {
  const r = c2.nueva(capacidad, 'publica esto', datos);
  assert.strictEqual(r.ok, true, r.motivo);
  return r.estado;
}

// ---------------------------------------------------------------------------
// 1 · LA REGLA
// ---------------------------------------------------------------------------

test('una_respuesta_que_no_encaja_se_repregunta_una_vez', () => {
  const estado = abrir();

  // Primera pregunta: la pieza (lo que se publica).
  const primera = c2.siguiente_pregunta(estado);
  assert.strictEqual(primera.campo, 'pieza');
  assert.ok(primera.pregunta.includes('?'));

  // Respuesta que NO encaja: «no se» no es un texto que se pueda publicar.
  const uno = c2.recibir(estado, 'no se');
  assert.strictEqual(uno.ok, true);
  assert.strictEqual(uno.encaja, false);
  assert.strictEqual(uno.repreguntar, true, 'la primera vez se repregunta');
  assert.strictEqual(uno.se_rinde, false);
  assert.strictEqual(uno.motivo, 'no_encaja_se_repregunta_una_vez');
  assert.strictEqual(uno.causa, 'respuesta_es_una_no_respuesta');
  assert.strictEqual(uno.pregunta.campo, 'pieza');
  assert.strictEqual(uno.pregunta.repreguntas, 1);
  // Se repregunta lo MISMO, en otra forma: no se cambia de tema.
  assert.ok(uno.pregunta.pregunta.includes('¿Que quieres que publique?'));

  // Segunda respuesta que tampoco encaja: NO hay segunda repregunta. Se rinde.
  const dos = c2.recibir(uno.estado, 'da igual');
  assert.strictEqual(dos.encaja, false);
  assert.strictEqual(dos.repreguntar, false, 'no se repregunta dos veces');
  assert.strictEqual(dos.se_rinde, true);
  assert.strictEqual(dos.pregunta, null);
  assert.strictEqual(dos.motivo, 'no_encaja_y_no_insisto');

  // Se rinde CON lo que tenga: lo que falta, nombrado, y nada inventado.
  assert.ok(dos.con_lo_que_tengo);
  assert.deepStrictEqual(dos.con_lo_que_tengo.faltan, ['pieza', 'cuenta']);
  assert.deepStrictEqual(dos.con_lo_que_tengo.respuestas, {});
  assert.strictEqual(dos.con_lo_que_tengo.descartados.length, 1);
  assert.ok(dos.con_lo_que_tengo.nota.includes('no llego el dato'));

  // Y no hay bucle: por muchas veces que se insista, sigue rindiendose sin
  // volver a preguntar (la cuenta de repreguntas no crece).
  const tres = c2.recibir(dos.estado, 'nada');
  assert.strictEqual(tres.se_rinde, true);
  assert.strictEqual(tres.repreguntar, false);
  assert.deepStrictEqual(tres.estado.repreguntas, { pieza: 1 });
});

test('una_respuesta_que_encaja_avanza_y_al_final_la_peticion_queda_completa', () => {
  const estado = abrir();
  let r = c2.recibir(estado, 'Hoy abrimos hasta las 20h.');
  assert.strictEqual(r.encaja, true);
  assert.strictEqual(r.completa, false);
  assert.strictEqual(r.pregunta.campo, 'cuenta');
  assert.strictEqual(r.estado.respuestas.pieza, 'Hoy abrimos hasta las 20h.');

  r = c2.recibir(r.estado, '@taller_a');
  assert.strictEqual(r.encaja, true);
  assert.strictEqual(r.completa, true);
  assert.strictEqual(r.pregunta, null);
  assert.strictEqual(c2.esta_completa(r.estado), true);
  assert.deepStrictEqual(r.estado.respuestas, {
    pieza: 'Hoy abrimos hasta las 20h.',
    cuenta: '@taller_a'
  });

  // Una peticion completa no se reabre con una respuesta suelta.
  const extra = c2.recibir(r.estado, 'otra cosa');
  assert.strictEqual(extra.motivo, 'ya_completa');
  assert.strictEqual(extra.completa, true);
  assert.strictEqual(extra.encaja, false);
});

test('lo_que_no_encaja_no_se_guarda', () => {
  const estado = abrir('responder');
  const uno = c2.recibir(estado, '');
  assert.strictEqual(uno.encaja, false);
  assert.strictEqual(uno.causa, 'respuesta_vacia');
  assert.deepStrictEqual(uno.estado.respuestas, {}, 'un hueco no se guarda como dato');

  // Un dato con la forma equivocada tampoco: la cuenta no es una frase.
  const dos = c2.recibir(estado, 'la de mi hermana que me escribio ayer por la tarde preguntando por el pedido de las tazas');
  assert.strictEqual(dos.encaja, false);
  assert.strictEqual(dos.causa, 'hilo_improbable');

  const tres = c2.recibir(abrir('mirar'), 'la de ceramica de mi hermana');
  assert.strictEqual(tres.encaja, false);
  assert.strictEqual(tres.causa, 'cuenta_improbable');

  // Y una no-respuesta con la forma correcta de un texto corto sigue siendo no.
  const cuatro = c2.recibir(abrir('mirar'), 'ninguna');
  assert.strictEqual(cuatro.encaja, false);
});

test('los_datos_que_llegan_con_la_peticion_se_validan_igual', () => {
  // Un dato bueno entra sin preguntar y se pregunta solo lo que falta.
  const conCuenta = c2.nueva('mirar', 'mira la cuenta', { cuenta: '@taller_a' });
  assert.strictEqual(conCuenta.ok, true);
  assert.deepStrictEqual(conCuenta.estado.faltan, []);
  assert.strictEqual(c2.esta_completa(conCuenta.estado), true);

  // Un dato mal formado NO entra por la puerta de atras: se pide otra vez.
  const malo = c2.nueva('mirar', 'mira la cuenta', { cuenta: 'no se' });
  assert.deepStrictEqual(malo.estado.faltan, ['cuenta']);
  assert.strictEqual(malo.estado.descartados.length, 1);
  assert.strictEqual(malo.estado.descartados[0].motivo, 'respuesta_es_una_no_respuesta');
});

test('el_estado_que_entra_no_se_muta', () => {
  const estado = abrir();
  const copia = JSON.parse(JSON.stringify(estado));
  c2.recibir(estado, 'Hoy abrimos hasta las 20h.');
  assert.deepStrictEqual(estado, copia, 'el estado de entrada no se toca');
});

test('una_capacidad_que_no_existe_no_abre_estado', () => {
  const r = c2.nueva('bailar', 'bailame algo');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'capacidad_desconocida');
  assert.deepStrictEqual(r.admitidas, ['publicar', 'responder', 'mirar', 'demostrar', 'reparar']);
  assert.strictEqual(r.estado, undefined);

  // Recibir con un estado que no es un estado tampoco lanza: se rinde diciendo.
  const roto = c2.recibir(null, 'hola');
  assert.strictEqual(roto.ok, false);
  assert.strictEqual(roto.motivo, 'sin_estado');
  assert.strictEqual(roto.se_rinde, true);
});

test('los_campos_por_capacidad_son_los_declarados_y_se_describen', () => {
  const d = c2.describir();
  assert.strictEqual(d.repreguntas_por_campo, 1);
  assert.strictEqual(d.regla, 'una respuesta que no encaja se repregunta una vez; despues se rinde con lo que tenga');
  assert.deepStrictEqual(d.campos.publicar, ['pieza', 'cuenta']);
  assert.deepStrictEqual(d.campos.responder, ['hilo', 'texto']);
  assert.deepStrictEqual(d.campos.mirar, ['cuenta']);
  assert.deepStrictEqual(d.campos.demostrar, ['cuenta', 'capacidad_a_probar']);
  assert.deepStrictEqual(d.campos.reparar, ['sintoma', 'cuenta']);

  // Demostrar: la capacidad a probar se normaliza a una de las cinco (el dueno
  // puede decir «contestar» y se guarda «responder»).
  const demo = abrir('demostrar', { cuenta: '@taller_a' });
  const r = c2.recibir(demo, 'contestar');
  assert.strictEqual(r.encaja, true);
  assert.strictEqual(r.estado.respuestas.capacidad_a_probar, 'responder');
  assert.strictEqual(r.completa, true);

  // Y una capacidad inventada en la respuesta no cuela.
  const inventada = c2.recibir(abrir('demostrar', { cuenta: '@taller_a' }), 'bailar');
  assert.strictEqual(inventada.encaja, false);
  assert.strictEqual(inventada.causa, 'capacidad_inexistente');
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__completador] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__completador] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

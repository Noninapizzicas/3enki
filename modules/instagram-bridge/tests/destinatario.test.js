'use strict';

/**
 * instagram-bridge · S1 · DestinatarioPrevio (REFLEJO)
 *
 * **Solo se responde a quien escribio primero.** Esta suite fija:
 *
 *   - sin mensaje previo NO hay envio (la conversacion vacia se rechaza);
 *   - si abrimos nosotros la conversacion, tampoco: que despues nos contesten
 *     no convierte en legitimo el primer mensaje;
 *   - se contesta al autor del mensaje previo, no a un tercero del hilo;
 *   - se contesta en el mismo hilo y del mismo tipo (un comentario no se
 *     contesta por mensaje directo: eso es abrir otra conversacion);
 *   - se comprueba en CADA envio, no al configurar la cuenta;
 *   - un mensaje previo borrado no es una conversacion.
 *
 * Ejecutar: node modules/instagram-bridge/tests/destinatario.test.js
 */

const assert = require('assert');

const s1 = require('../puente/destinatario');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const CUENTA = 'taller_a';

function dm(opts = {}) {
  return Object.assign({
    cuenta: CUENTA,
    tipo: 'dm',
    hilo_id: 'dm-77',
    mensajes: [
      { id: 'm-1', autor: 'maria.ceramica', direccion: 'entrante', momento: '2026-11-11T09:00:00Z', texto: '¿Queda plaza?' }
    ]
  }, opts);
}

function destinatario(opts = {}) {
  return Object.assign({ remitente: 'maria.ceramica', tipo: 'dm', hilo_id: 'dm-77' }, opts);
}

// ---------------------------------------------------------------------------
// 1 · LA REGLA
// ---------------------------------------------------------------------------

test('si_no_hay_mensaje_previo_no_hay_envio', () => {
  // --- conversacion vacia: no hay a que contestar ------------------------
  const vacia = s1.comprobar(destinatario(), dm({ mensajes: [] }));
  assert.strictEqual(vacia.ok, false);
  assert.strictEqual(vacia.legitimo, false);
  assert.strictEqual(vacia.motivo, 'sin_mensaje_previo');
  assert.strictEqual(vacia.regla, 'no se abre conversacion: sin mensaje previo no hay envio');

  // --- solo hablamos nosotros: la conversacion la abrimos nosotros ------
  const soloNuestro = s1.comprobar(destinatario(), dm({
    mensajes: [
      { id: 'm-1', autor: CUENTA, direccion: 'saliente', momento: '2026-11-11T09:00:00Z', texto: 'Hola!' }
    ]
  }));
  assert.strictEqual(soloNuestro.ok, false);
  assert.strictEqual(soloNuestro.motivo, 'abrimos_nosotros_la_conversacion');

  // --- nos contestaron, pero el primero fue nuestro ---------------------
  // Este es el caso que la regla existe para cerrar: ya hay mensaje entrante,
  // pero la conversacion la abrimos nosotros. No se contesta.
  const nosContestaron = s1.comprobar(destinatario(), dm({
    mensajes: [
      { id: 'm-0', autor: CUENTA, direccion: 'saliente', momento: '2026-11-11T08:00:00Z' },
      { id: 'm-1', autor: 'maria.ceramica', direccion: 'entrante', momento: '2026-11-11T09:00:00Z' }
    ]
  }));
  assert.strictEqual(nosContestaron.ok, false);
  assert.strictEqual(nosContestaron.motivo, 'abrimos_nosotros_la_conversacion');
  assert.strictEqual(nosContestaron.primer_mensaje, 'm-0');

  // --- escribio otra persona en el hilo, pero no el destinatario --------
  const tercero = s1.comprobar(destinatario({ remitente: 'pedro.otro' }), dm());
  assert.strictEqual(tercero.ok, false);
  assert.strictEqual(tercero.motivo, 'destinatario_no_es_el_autor');
  assert.deepStrictEqual(tercero.autores, ['maria.ceramica']);

  // --- mismo hilo obligatorio -------------------------------------------
  const otroHilo = s1.comprobar(destinatario({ hilo_id: 'dm-99' }), dm());
  assert.strictEqual(otroHilo.ok, false);
  assert.strictEqual(otroHilo.motivo, 'hilo_distinto');
  assert.strictEqual(otroHilo.hilo_pedido, 'dm-99');

  // Un comentario no se contesta por mensaje directo: seria abrir otra
  // conversacion con la misma persona, y eso es la puerta de atras.
  const tipoCambiado = s1.comprobar(destinatario({ tipo: 'dm' }), dm({ tipo: 'comentario', hilo_id: 'dm-77' }));
  assert.strictEqual(tipoCambiado.ok, false);
  assert.strictEqual(tipoCambiado.motivo, 'hilo_distinto');

  // --- el caso legitimo --------------------------------------------------
  const bueno = s1.comprobar(destinatario(), dm());
  assert.strictEqual(bueno.ok, true, bueno.motivo);
  assert.strictEqual(bueno.estado, 'legitimo');
  assert.strictEqual(bueno.legitimo, true);
  assert.strictEqual(bueno.destinatario, 'maria.ceramica');
  // Y viene con la PRUEBA: sin ella el envio no se puede justificar despues.
  assert.strictEqual(bueno.prueba.mensaje_previo, 'm-1');
  assert.strictEqual(bueno.prueba.momento, '2026-11-11T09:00:00Z');
  assert.strictEqual(bueno.prueba.abierto_por, 'tercero');
  assert.strictEqual(s1.hay_envio(destinatario(), dm()), true);
  assert.strictEqual(s1.hay_envio(destinatario(), dm({ mensajes: [] })), false);
});

// ---------------------------------------------------------------------------
// 2 · detalles que deciden en la realidad
// ---------------------------------------------------------------------------

test('se_mira_el_ultimo_mensaje_y_da_igual_la_arroba_o_las_mayusculas', () => {
  // @Maria.Ceramica es la misma persona que maria.ceramica.
  const conArroba = s1.comprobar(destinatario({ remitente: '@Maria.Ceramica' }), dm());
  assert.strictEqual(conArroba.ok, true, conArroba.motivo);
  assert.strictEqual(conArroba.destinatario, 'maria.ceramica');

  // Si el ultimo mensaje suyo se borro, ya no hay conversacion que contestar.
  const anulado = s1.comprobar(destinatario(), dm({
    mensajes: [
      { id: 'm-1', autor: 'maria.ceramica', direccion: 'entrante', momento: '2026-11-11T09:00:00Z' },
      { id: 'm-2', autor: 'maria.ceramica', direccion: 'entrante', momento: '2026-11-11T10:00:00Z', anulado: true }
    ]
  }));
  assert.strictEqual(anulado.ok, false);
  assert.strictEqual(anulado.motivo, 'mensaje_previo_anulado');
  assert.strictEqual(anulado.mensaje, 'm-2');

  // Un hilo largo: cuenta el ultimo mensaje SUYO, no el primero.
  const largo = s1.comprobar(destinatario(), dm({
    mensajes: [
      { id: 'm-1', autor: 'maria.ceramica', direccion: 'entrante', momento: '2026-11-11T09:00:00Z' },
      { id: 'm-2', autor: CUENTA, direccion: 'saliente', momento: '2026-11-11T09:30:00Z' },
      { id: 'm-3', autor: 'maria.ceramica', direccion: 'entrante', momento: '2026-11-11T10:00:00Z' }
    ]
  }));
  assert.strictEqual(largo.ok, true);
  assert.strictEqual(largo.prueba.mensaje_previo, 'm-3');

  // Sin `direccion` se mira el autor: si no es nuestra cuenta, es previo.
  const sinDireccion = s1.comprobar(destinatario(), dm({
    mensajes: [{ id: 'm-1', autor: 'maria.ceramica', momento: '2026-11-11T09:00:00Z' }]
  }));
  assert.strictEqual(sinDireccion.ok, true);
  assert.strictEqual(s1.es_respuesta({ autor: 'maria.ceramica' }, CUENTA), true);
  assert.strictEqual(s1.es_respuesta({ autor: CUENTA }, CUENTA), false);
  // La duda no se resuelve a favor de responder.
  assert.strictEqual(s1.es_respuesta({ texto: 'hola' }, CUENTA), false);
  assert.strictEqual(s1.es_respuesta(null, CUENTA), false);

  // mismo_hilo es consultable suelto y compara id Y tipo.
  assert.strictEqual(s1.mismo_hilo({ tipo: 'dm', hilo_id: 'dm-77' }, { tipo: 'dm', hilo_id: 'dm-77' }), true);
  assert.strictEqual(s1.mismo_hilo({ tipo: 'dm', hilo_id: 'dm-77' }, { tipo: 'comentario', hilo_id: 'dm-77' }), false);
  assert.strictEqual(s1.mismo_hilo({ tipo: 'dm', hilo_id: 'dm-77' }, { tipo: 'dm' }), false);
});

// ---------------------------------------------------------------------------
// 3 · se comprueba en cada envio, no al configurar
// ---------------------------------------------------------------------------

test('la_regla_se_comprueba_en_cada_envio_no_una_vez', () => {
  // Misma cuenta, misma persona, dos conversaciones distintas: la primera vale
  // y la segunda no. Si la regla se hubiera comprobado "al configurar", la
  // segunda pasaria por arrastre.
  const primera = s1.comprobar(destinatario({ hilo_id: 'dm-77' }), dm());
  assert.strictEqual(primera.ok, true);

  const segunda = s1.comprobar(destinatario({ hilo_id: 'dm-78' }), dm({ hilo_id: 'dm-78', mensajes: [] }));
  assert.strictEqual(segunda.ok, false);
  assert.strictEqual(segunda.motivo, 'sin_mensaje_previo');

  // Entradas rotas: se nombran, no se revientan.
  const sinDestinatario = s1.comprobar({}, dm());
  assert.strictEqual(sinDestinatario.motivo, 'sin_destinatario');
  const sinConversacion = s1.comprobar(destinatario(), { tipo: 'dm', hilo_id: 'dm-77' });
  assert.strictEqual(sinConversacion.motivo, 'sin_conversacion');
  assert.deepStrictEqual(sinConversacion.faltan, ['conversacion.mensajes']);
  const tipoRaro = s1.comprobar(destinatario({ tipo: 'email' }), dm());
  assert.strictEqual(tipoRaro.motivo, 'tipo_de_hilo_desconocido');
  const nulos = s1.comprobar(null, null);
  assert.strictEqual(nulos.motivo, 'entrada_invalida');

  // La regla es una sola frase, y esta escrita.
  assert.strictEqual(s1.describir().regla, 'solo se responde a quien escribio primero');
  assert.deepStrictEqual(s1.TIPOS_DE_HILO, ['comentario', 'dm']);
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__destinatario] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__destinatario] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

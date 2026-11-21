'use strict';

/**
 * instagram-bridge · N3 · RedactorDeBorrador (MICRO-AGENTE)
 *
 * La regla del bloque, fijada aqui:
 *
 *   **un borrador NUNCA envia y NUNCA persiste.**
 *
 * Se fija de tres formas, porque un comentario no es una garantia:
 *   1. por el RESULTADO: `se_envia:false`, `se_persiste:false`, `envio:null`,
 *      `persistencia:null`, `destino:'revision_humana'`;
 *   2. por la SUPERFICIE: el modulo no exporta `enviar`, `guardar` ni nada que
 *      se parezca, y el objeto devuelto tampoco;
 *   3. por el CODIGO: se lee el fuente y se comprueba que no importa `fs`,
 *      `path`, ningun puerto de envio, ni `http`/`fetch`. No tiene con que
 *      enviar ni con que guardar.
 *
 * Ademas: sin voz no redacta (modo lectura), los vetos de la ficha se respetan,
 * y un mensaje ininteligible no se responde con texto inventado.
 *
 * Ejecutar: node modules/instagram-bridge/tests/borrador.test.js
 */

const assert = require('assert');
const fs = require('fs');

const n3 = require('../operacion/borrador');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const VOZ = {
  tono: 'cercano',
  declarada_por: 'proyecto',
  autorizacion_id: 'aut-voz-1',
  vocabulario: ['taller', 'pieza'],
  lo_que_nunca_dice: [],
  limites_de_tema: []
};

function peticion(opts = {}) {
  return Object.assign({
    mensaje: { texto: 'Hola, cuanto cuesta el envio?', remitente: 'maria.ceramica' },
    clase: 'pedido',
    voz: VOZ
  }, opts);
}

// ---------------------------------------------------------------------------
// 1 · LA REGLA
// ---------------------------------------------------------------------------

test('borrador_nunca_envia_y_nunca_persiste', () => {
  const r = n3.redactar(peticion());

  // --- 1 · el resultado ---------------------------------------------------
  assert.strictEqual(r.ok, true);
  assert.strictEqual(typeof r.texto, 'string');
  assert.ok(r.texto.length > 0);
  assert.strictEqual(r.se_envia, false);
  assert.strictEqual(r.se_persiste, false);
  assert.strictEqual(r.envio, null, 'no hay puerto de envio en la respuesta');
  assert.strictEqual(r.persistencia, null, 'no hay almacen en la respuesta');
  assert.strictEqual(r.no_envia, true);
  assert.strictEqual(r.no_persiste, true);
  assert.strictEqual(r.destino, 'revision_humana');
  assert.strictEqual(r.requiere_revision, true);

  // --- 2 · la superficie --------------------------------------------------
  assert.strictEqual(n3.NO_ENVIA, true);
  assert.strictEqual(n3.NO_PERSISTE, true);
  for (const nombre of ['enviar', 'guardar', 'persistir', 'publicar', 'mano', 'cliente']) {
    assert.strictEqual(typeof n3[nombre], 'undefined', `el modulo no expone ${nombre}`);
    assert.strictEqual(typeof r[nombre], 'undefined', `el borrador no trae ${nombre}`);
  }

  // --- 3 · el codigo ------------------------------------------------------
  const fuente = fs.readFileSync(require.resolve('../operacion/borrador'), 'utf8');
  assert.ok(!/require\(\s*['"](?:node:)?fs['"]\s*\)/.test(fuente), 'no importa fs');
  assert.ok(!/require\(\s*['"](?:node:)?path['"]\s*\)/.test(fuente), 'no importa path');
  assert.ok(!/require\(\s*['"](?:node:)?https?['"]\s*\)/.test(fuente), 'no importa http');
  assert.ok(!/require\(\s*['"][^'"]*(?:envio|mano|publicar|cartero)[^'"]*['"]\s*\)/.test(fuente), 'no importa un puerto de envio');
  assert.ok(!/\bfetch\s*\(/.test(fuente), 'no llama a la red');
  assert.ok(!/\b(?:writeFile|createWriteStream|appendFile)\b/.test(fuente), 'no escribe ficheros');

  // El texto es un valor de retorno, no una accion: dos llamadas seguidas con
  // la misma entrada devuelven lo mismo (nada se acumula en ningun sitio).
  const r2 = n3.redactar(peticion());
  assert.strictEqual(r2.texto, r.texto);
});

// ---------------------------------------------------------------------------
// 2 · sin voz no hay borrador
// ---------------------------------------------------------------------------

test('sin_voz_no_redacta_y_se_queda_en_lectura', () => {
  for (const voz of [undefined, null, {}, { tono: 'cercano' }]) {
    const r = n3.redactar(peticion({ voz }));
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.motivo, 'sin_voz');
    assert.strictEqual(r.redacta, false);
    assert.strictEqual(r.texto, null);
    assert.strictEqual(r.modo, 'lectura');
    assert.strictEqual(r.se_envia, false);
    assert.strictEqual(r.se_persiste, false);
  }
});

test('una_voz_que_no_declara_el_proyecto_no_redacta', () => {
  const r = n3.redactar(peticion({ voz: Object.assign({}, VOZ, { declarada_por: 'agente' }) }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'voz_no_declarada_por_el_proyecto');
  assert.strictEqual(r.texto, null);

  const sinAut = n3.redactar(peticion({ voz: Object.assign({}, VOZ, { autorizacion_id: undefined }) }));
  assert.strictEqual(sinAut.ok, false);
  assert.strictEqual(sinAut.motivo, 'sin_autorizacion');
});

test('la_ficha_entera_tambien_sirve', () => {
  const r = n3.redactar({
    mensaje: { texto: 'Hola, teneis horario?' },
    clase: 'consulta',
    ficha: { cuenta: 'taller_a', voz: VOZ }
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.se_envia, false);
});

// ---------------------------------------------------------------------------
// 3 · los vetos de la voz son vetos
// ---------------------------------------------------------------------------

test('lo_que_nunca_dice_se_respeta_o_no_se_redacta', () => {
  const veto = Object.assign({}, VOZ, { lo_que_nunca_dice: ['gracias'] });

  // El registro cercano se apoya en "gracias": sin poder decirlo, no hay texto.
  const sinSalida = n3.redactar(peticion({ voz: veto, clase: 'consulta' }));
  assert.strictEqual(sinSalida.ok, false);
  assert.strictEqual(sinSalida.motivo, 'sin_redaccion');
  assert.strictEqual(sinSalida.texto, null, 'no se devuelve un "casi"');
  assert.ok(sinSalida.violaciones.some((v) => v.motivo === 'dice_lo_que_nunca_dice'));

  // El registro directo tiene variantes sin la palabra vetada: se usa esa.
  const directo = n3.redactar(peticion({ voz: Object.assign({}, veto, { tono: 'directo' }), clase: 'consulta' }));
  assert.strictEqual(directo.ok, true);
  assert.strictEqual(/gracias/i.test(directo.texto), false, 'el veto se cumple en el texto');
  assert.strictEqual(directo.se_envia, false);
});

test('los_limites_de_tema_se_comprueban', () => {
  const voz = Object.assign({}, VOZ, { limites_de_tema: ['politica'] });
  const rev = n3.revisar('Hola, hablamos de politica y del precio.', voz);
  assert.strictEqual(rev.ok, false);
  assert.ok(rev.violaciones.some((v) => v.motivo === 'tema_fuera_de_limite'));

  const limpio = n3.revisar('Hola, cuentame un poco mas.', voz);
  assert.strictEqual(limpio.ok, true);
});

// ---------------------------------------------------------------------------
// 4 · lo que no se redacta
// ---------------------------------------------------------------------------

test('un_mensaje_ininteligible_no_se_responde_inventando', () => {
  const r = n3.redactar(peticion({ clase: 'ininteligible', mensaje: { texto: 'asdkjhqwr zxcvbnm' } }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'mensaje_ininteligible');
  assert.strictEqual(r.texto, null);
  assert.strictEqual(r.requiere_persona, true);
  assert.strictEqual(r.escala_a, 'persona');
  assert.strictEqual(r.se_envia, false);
  assert.strictEqual(r.se_persiste, false);
});

test('el_spam_no_se_contesta', () => {
  const r = n3.redactar(peticion({ clase: 'spam', mensaje: { texto: 'Compra seguidores' } }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.redacta, false);
  assert.strictEqual(r.texto, null);
});

test('una_queja_no_lleva_humor_y_nombra_a_una_persona', () => {
  const r = n3.redactar(peticion({
    clase: 'queja',
    mensaje: { texto: 'El pedido llego roto, quiero una devolucion' },
    voz: Object.assign({}, VOZ, { tono: 'divertido' })
  }));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.tono_aplicado, 'cercano', 'con una queja no se hace humor');
  assert.ok(r.avisos.includes('queja_sin_humor'));
  assert.ok(/persona/.test(r.texto), 'la queja la mira una persona');
  assert.strictEqual(r.se_envia, false);
});

// ---------------------------------------------------------------------------
// 5 · juicio opcional
// ---------------------------------------------------------------------------

test('un_juicio_valido_se_usa_si_respeta_la_voz', () => {
  const juicio = () => 'Hola, dime que necesitas y lo miramos.';
  const r = n3.redactar(peticion({ clase: 'consulta' }), { juicio });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.via, 'juicio');
  assert.strictEqual(r.texto, 'Hola, dime que necesitas y lo miramos.');
  assert.strictEqual(r.se_envia, false);
});

test('un_juicio_que_incumple_la_voz_o_revienta_se_descarta', () => {
  const veto = Object.assign({}, VOZ, { lo_que_nunca_dice: ['descuento'] });
  const proponeVeto = () => 'Hola, te hago un descuento.';
  const r = n3.redactar(peticion({ voz: veto, clase: 'consulta' }), { juicio: proponeVeto });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.via, 'tabla');
  assert.ok(r.avisos.includes('juicio_descartado_por_la_voz'));
  assert.strictEqual(/descuento/i.test(r.texto), false);

  const revienta = () => { throw new Error('sin cuota'); };
  const r2 = n3.redactar(peticion({ clase: 'consulta' }), { juicio: revienta });
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(r2.via, 'tabla');
  assert.ok(r2.avisos.includes('juicio_descartado_por_la_voz'));
});

test('sin_llm_redacta_igual', () => {
  const r = n3.redactar(peticion({ clase: 'consulta' }));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.via, 'tabla');
  assert.ok(r.texto.length > 0);
  assert.strictEqual(r.se_envia, false);
  assert.strictEqual(r.se_persiste, false);
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__borrador] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__borrador] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

'use strict';

/**
 * instagram-bridge · bloque 9 · Q2 · PuertaDeConfirmacion (CUSTODIO, logica pura)
 *
 * Lo que esta suite no deja pasar:
 *   - **un si viejo es un no**: si la respuesta llega despues de `caduca_en`, la
 *     pregunta se cierra como caducada y `autoriza` es false, aunque el dueno
 *     haya dicho que si;
 *   - **el silencio no es si**: `vencer()` cierra lo que nadie contesto con
 *     `respuesta: null`, y no hay ninguna rama que lo convierta en autorizada;
 *   - **el silencio nunca se anota como autorizacion**: el registro (Q5) rechaza
 *     la via `silencio` por su nombre, y rechaza un si que llego tarde;
 *   - **solo una persona contesta**, con referencia, y **una vez**.
 *
 * Ejecutar: node modules/instagram-bridge/tests/puerta.test.js
 */

const assert = require('assert');

const puerta = require('../autonomia/puerta');
const autorizaciones = require('../autonomia/autorizaciones');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M0 = '2026-11-11T12:00:00Z';
const M1 = '2026-11-11T12:05:00Z';   // dentro de la ventana de 15 min
const M2 = '2026-11-11T12:30:00Z';   // fuera
const M3 = '2026-11-11T14:00:00Z';   // muy fuera

function pregunta(extra = {}) {
  return Object.assign({
    proyecto: 'proy-a',
    cuenta: '@taller_a',
    accion: 'publicar',
    rol: 'agente',
    aparato: 'movil-1',
    quien: 'agente',
    momento: M0,
    nivel_al_conceder: 'permiso',
    motivo: 'el puente quiere publicar el carrusel de la semana'
  }, extra);
}

function respuesta(confirmacion_id, extra = {}) {
  return Object.assign({
    confirmacion_id,
    decision: 'si',
    quien: 'dueno',
    momento: M1,
    referencia: 'telegram:msg-991'
  }, extra);
}

function abrir(extra = {}) {
  const r = puerta.pedir(puerta.estado_vacio(), pregunta(extra));
  assert.strictEqual(r.ok, true, r.motivo);
  return r;
}

// ---------------------------------------------------------------------------
// 1 · la caducidad y el silencio
// ---------------------------------------------------------------------------

test('un_si_viejo_es_un_no_y_el_silencio_no_es_si', () => {
  // ---- un si, pero tarde -------------------------------------------------
  const p = abrir();
  const tarde = puerta.responder(p.estado, respuesta(p.confirmacion_id, { momento: M2 }));

  assert.strictEqual(tarde.ok, true, 'la respuesta es valida: lo que no vale es su edad');
  assert.strictEqual(tarde.autoriza, false, 'un si viejo es un no');
  assert.strictEqual(tarde.motivo, puerta.MOTIVOS.SI_CADUCADO);
  assert.strictEqual(tarde.confirmacion.estado, 'caducada');
  assert.strictEqual(tarde.confirmacion.respuesta, null, 'no se guarda como respuesta');
  assert.strictEqual(tarde.autorizacion, undefined);

  // ---- el silencio -------------------------------------------------------
  const p2 = abrir({ accion: 'comentar', cuenta: '@taller_b' });
  const silencio = puerta.responder(p2.estado, {
    confirmacion_id: p2.confirmacion_id, silencio: true, quien: 'dueno', momento: M1, referencia: 'x'
  });
  assert.strictEqual(silencio.ok, false);
  assert.strictEqual(silencio.motivo, puerta.MOTIVOS.SILENCIO_NO_ES_SI);
  assert.strictEqual(silencio.estado, undefined, 'no se escribe nada');

  // Sin decision tampoco: no hay "si por defecto".
  const sinDecision = puerta.responder(p2.estado, { confirmacion_id: p2.confirmacion_id, quien: 'dueno', momento: M1, referencia: 'x' });
  assert.strictEqual(sinDecision.ok, false);
  assert.strictEqual(sinDecision.motivo, puerta.MOTIVOS.RESPUESTA_NO_DECLARADA);

  // ---- vencer: lo que nadie contesto ------------------------------------
  const vencido = puerta.vencer(p2.estado, { momento: M2 });
  assert.strictEqual(vencido.ok, true);
  assert.deepStrictEqual(vencido.caducadas, [p2.confirmacion_id]);
  assert.strictEqual(vencido.autoriza, false);
  const cerrada = vencido.estado.confirmaciones[0];
  assert.strictEqual(cerrada.estado, 'caducada');
  assert.strictEqual(cerrada.respuesta, null);
  assert.strictEqual(cerrada.historia[cerrada.historia.length - 1].motivo, 'silencio');

  // Y no se puede "rescatar" despues: ya no esta pendiente.
  const rescate = puerta.responder(vencido.estado, respuesta(p2.confirmacion_id, { momento: M1 }));
  assert.strictEqual(rescate.autoriza, false);
  assert.strictEqual(rescate.motivo, puerta.MOTIVOS.YA_RESUELTA);
});

test('el_silencio_nunca_se_anota_como_autorizacion', () => {
  // 1) la puerta: diez preguntas sin respuesta no producen ni una autorizada.
  let estado = puerta.estado_vacio();
  const ids = [];
  for (let i = 0; i < 10; i += 1) {
    const r = puerta.pedir(estado, pregunta({ accion: i % 2 === 0 ? 'publicar' : 'comentar', cuenta: `@cuenta_${i}` }));
    assert.strictEqual(r.ok, true, r.motivo);
    estado = r.estado;
    ids.push(r.confirmacion_id);
  }
  const v = puerta.vencer(estado, { momento: M3 });
  assert.strictEqual(v.cuantas, 10);
  assert.strictEqual(v.estado.confirmaciones.filter((c) => c.estado === 'autorizada').length, 0);
  assert.strictEqual(v.estado.confirmaciones.filter((c) => c.respuesta !== null).length, 0);
  assert.strictEqual(puerta.auditar(v.estado).ok, true, 'el estado es coherente: silencio, no si');

  // 2) el registro: la via 'silencio' se rechaza con nombre y apellidos.
  const libro = autorizaciones.estado_vacio();
  const porSilencio = autorizaciones.anotar(libro, {
    proyecto: 'proy-a', cuenta: 'taller_a', accion: 'publicar', rol: 'agente',
    nivel_al_conceder: 'permiso', via: 'silencio', quien: 'dueno',
    referencia: 'nadie contesto', confirmacion_id: ids[0],
    respuesta_momento: M1, momento: M1, aparato: 'movil-1'
  });
  assert.strictEqual(porSilencio.ok, false);
  assert.strictEqual(porSilencio.motivo, 'el_silencio_no_se_anota_como_autorizacion');

  // 3) el registro: un si que llego tarde tampoco entra (doble comprobacion).
  const tarde = autorizaciones.anotar(libro, {
    proyecto: 'proy-a', cuenta: 'taller_a', accion: 'publicar', rol: 'agente',
    nivel_al_conceder: 'permiso', via: 'puerta', quien: 'dueno',
    referencia: 'telegram:msg-1', confirmacion_id: ids[0],
    // Se concede en M0, caduca en M1 y la respuesta no llega hasta M2: tarde.
    respuesta_momento: M2, momento: M0, aparato: 'movil-1',
    caduca_en: M1
  });
  assert.strictEqual(tarde.ok, false);
  assert.strictEqual(tarde.motivo, 'si_caducado_es_no');

  // 4) y la via 'historial' tampoco es una via.
  const porHistorial = autorizaciones.anotar(libro, {
    proyecto: 'proy-a', cuenta: 'taller_a', accion: 'publicar', rol: 'agente',
    nivel_al_conceder: 'permiso', via: 'historial', quien: 'dueno',
    referencia: 'siempre lo hemos hecho', confirmacion_id: ids[1],
    respuesta_momento: M1, momento: M1, aparato: 'movil-1'
  });
  assert.strictEqual(porHistorial.ok, false);
  assert.strictEqual(porHistorial.motivo, 'el_historial_no_autoriza');
});

test('la_via_del_si_es_la_que_declara_el_canal_pero_solo_puerta_o_canal', () => {
  const p = abrir();
  const r = puerta.responder(p.estado, respuesta(p.confirmacion_id, { via: 'telegram' }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, puerta.MOTIVOS.VIA_INVALIDA);

  const ok = puerta.responder(p.estado, respuesta(p.confirmacion_id, { via: 'canal' }));
  assert.strictEqual(ok.autoriza, true);
  assert.strictEqual(ok.autorizacion.via, 'canal');
});

// ---------------------------------------------------------------------------
// 2 · quien contesta
// ---------------------------------------------------------------------------

test('solo_una_persona_contesta_y_hace_falta_referencia', () => {
  const p = abrir();

  for (const quien of ['agente', 'sistema', 'root', undefined]) {
    const r = puerta.responder(p.estado, respuesta(p.confirmacion_id, { quien }));
    assert.strictEqual(r.ok, false, `${quien} no puede contestar`);
    assert.strictEqual(r.motivo, puerta.MOTIVOS.EXIGE_PERSONA);
    assert.strictEqual(r.estado, undefined, 'y no se escribe nada');
  }

  const sinRef = puerta.responder(p.estado, respuesta(p.confirmacion_id, { referencia: '  ' }));
  assert.strictEqual(sinRef.ok, false);
  assert.strictEqual(sinRef.motivo, puerta.MOTIVOS.SIN_REFERENCIA);

  // Una falta no consume la pregunta: el dueno puede contestar bien despues.
  const bien = puerta.responder(p.estado, respuesta(p.confirmacion_id));
  assert.strictEqual(bien.autoriza, true);
});

test('responder_no_puede_adelantarse_a_la_pregunta', () => {
  const p = abrir();
  const antes = puerta.responder(p.estado, respuesta(p.confirmacion_id, { momento: '2026-11-11T11:59:00Z' }));
  assert.strictEqual(antes.ok, false);
  assert.strictEqual(antes.motivo, puerta.MOTIVOS.ANTES_DE_PREGUNTAR);
});

test('una_respuesta_a_una_pregunta_que_no_existe_no_crea_nada', () => {
  const libro = puerta.estado_vacio();
  const r = puerta.responder(libro, respuesta('cf-inventada'));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, puerta.MOTIVOS.CONFIRMACION_DESCONOCIDA);
  assert.strictEqual(r.estado, undefined);
  assert.strictEqual(libro.confirmaciones.length, 0);
});

// ---------------------------------------------------------------------------
// 3 · una vez
// ---------------------------------------------------------------------------

test('una_pregunta_se_contesta_una_vez', () => {
  const p = abrir();
  const primera = puerta.responder(p.estado, respuesta(p.confirmacion_id));
  assert.strictEqual(primera.autoriza, true);

  // El mismo si reenviado (o el boton pulsado dos veces) no vuelve a autorizar.
  const segunda = puerta.responder(primera.estado, respuesta(p.confirmacion_id));
  assert.strictEqual(segunda.ok, true);
  assert.strictEqual(segunda.autoriza, false);
  assert.strictEqual(segunda.motivo, puerta.MOTIVOS.YA_RESUELTA);
  assert.strictEqual(segunda.estado, null, 'no se reescribe nada');

  // Y un "no" despues de un "si" tampoco cambia la historia.
  const tarde = puerta.responder(primera.estado, respuesta(p.confirmacion_id, { decision: 'no' }));
  assert.strictEqual(tarde.autoriza, false);
  assert.strictEqual(tarde.confirmacion.estado, 'autorizada');
});

test('un_no_cierra_la_pregunta_y_no_autoriza', () => {
  const p = abrir();
  const no = puerta.responder(p.estado, respuesta(p.confirmacion_id, { decision: 'no' }));
  assert.strictEqual(no.ok, true);
  assert.strictEqual(no.autoriza, false);
  assert.strictEqual(no.motivo, puerta.MOTIVOS.RESPUESTA_NO);
  assert.strictEqual(no.confirmacion.estado, 'denegada');
  assert.strictEqual(no.autorizacion, undefined);
  assert.strictEqual(puerta.auditar(no.estado).ok, true);
});

// ---------------------------------------------------------------------------
// 4 · la caducidad se declara, no se supone
// ---------------------------------------------------------------------------

test('la_caducidad_es_obligatoria_y_tiene_techo', () => {
  // Por defecto: 15 minutos desde el momento inyectado.
  const p = abrir();
  assert.strictEqual(p.caduca_en, '2026-11-11T12:15:00Z');
  assert.strictEqual(p.confirmacion.ttl_segundos, 900);

  // Se puede pedir mas, pero no mas de una hora.
  const largo = abrir({ cuenta: '@taller_b', ttl_segundos: 99999 });
  assert.strictEqual(largo.caduca_en, '2026-11-11T13:00:00Z', 'techo de 1 h');

  // Una caducidad anterior a la pregunta no vale.
  const malo = puerta.pedir(puerta.estado_vacio(), pregunta({ caduca_en: '2026-11-11T11:00:00Z' }));
  assert.strictEqual(malo.ok, false);
  assert.strictEqual(malo.motivo, puerta.MOTIVOS.CADUCIDAD_INVALIDA);

  // Ni una caducidad inventada (no instante).
  const basura = puerta.pedir(puerta.estado_vacio(), pregunta({ caduca_en: 'mañana' }));
  assert.strictEqual(basura.ok, false);
  assert.strictEqual(basura.motivo, puerta.MOTIVOS.CADUCIDAD_INVALIDA);
});

test('el_nivel_conservador_no_pide_permiso', () => {
  const r = puerta.pedir(puerta.estado_vacio(), pregunta({ nivel_al_conceder: 'borrador' }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, puerta.MOTIVOS.NIVEL_CONSERVADOR);
  assert.strictEqual(puerta.pedir(puerta.estado_vacio(), pregunta({ nivel_al_conceder: undefined })).ok, false);
});

// ---------------------------------------------------------------------------
// 5 · una pregunta viva por huella
// ---------------------------------------------------------------------------

test('no_se_abren_dos_preguntas_para_la_misma_huella', () => {
  const p = abrir();
  const otra = puerta.pedir(p.estado, pregunta({ motivo: 'otra vez lo mismo' }));

  assert.strictEqual(otra.ok, true);
  assert.strictEqual(otra.pedida, false);
  assert.strictEqual(otra.reutilizada, true);
  assert.strictEqual(otra.confirmacion_id, p.confirmacion_id);
  assert.strictEqual(otra.estado, null, 'no se escribe una segunda pregunta');
  assert.strictEqual(otra.motivo, puerta.MOTIVOS.YA_HAY_PENDIENTE);

  // Para otra accion si se abre otra: son cosas distintas.
  const distinta = puerta.pedir(p.estado, pregunta({ accion: 'comentar' }));
  assert.strictEqual(distinta.pedida, true);
  assert.notStrictEqual(distinta.confirmacion_id, p.confirmacion_id);
});

test('el_fallo_del_canal_no_resuelve_la_pregunta', () => {
  const p = abrir();
  const intento = puerta.marcar_intento(p.estado, { confirmacion_id: p.confirmacion_id, momento: M1, error: 'canal_no_confirmo' });

  assert.strictEqual(intento.ok, true);
  assert.strictEqual(intento.confirmacion.estado, 'pendiente', 'un fallo de envio no cierra nada');
  assert.strictEqual(intento.confirmacion.intentos, 1);
  assert.strictEqual(intento.confirmacion.ultimo_error, 'canal_no_confirmo');
  assert.strictEqual(intento.confirmacion.respuesta, null);

  // Y sigue siendo contestable.
  const r = puerta.responder(intento.estado, respuesta(p.confirmacion_id));
  assert.strictEqual(r.autoriza, true);
});

// ---------------------------------------------------------------------------
// 6 · la auditoria
// ---------------------------------------------------------------------------

test('la_auditoria_detecta_un_silencio_anotado_como_si', () => {
  const p = abrir();
  const autorizada = puerta.responder(p.estado, respuesta(p.confirmacion_id));

  // Un libro sano pasa.
  assert.strictEqual(puerta.auditar(autorizada.estado).ok, true);

  // Alguien escribe a mano una caducada "con un si dentro". El auditor lo ve.
  const falso = JSON.parse(JSON.stringify(autorizada.estado));
  falso.confirmaciones[0].estado = 'caducada';
  falso.confirmaciones[0].respuesta = { decision: 'si', quien: 'dueno', momento: M1, referencia: 'x', via: 'puerta' };
  const audit = puerta.auditar(falso);
  assert.strictEqual(audit.ok, false);
  assert.ok(audit.problemas.some((x) => x.motivo === 'silencio_anotado_como_si'), JSON.stringify(audit.problemas));

  // Y sin respuesta tambien: una autorizada sin si es el mismo agujero.
  const sinSi = JSON.parse(JSON.stringify(autorizada.estado));
  sinSi.confirmaciones[0].respuesta = null;
  assert.strictEqual(puerta.auditar(sinSi).ok, false);

  // Un si que llego tarde tampoco pasa la auditoria del fichero.
  const tarde = JSON.parse(JSON.stringify(autorizada.estado));
  tarde.confirmaciones[0].respuesta.momento = M3;
  assert.ok(puerta.auditar(tarde).problemas.some((x) => x.motivo === puerta.MOTIVOS.SI_CADUCADO));
});

test('el_esquema_se_declara_y_una_cosa_que_no_es_el_esquema_no_vale', () => {
  assert.strictEqual(puerta.es_estado(puerta.estado_vacio()), true);
  assert.strictEqual(puerta.es_estado({}), false);
  assert.strictEqual(puerta.es_estado({ esquema: 'otra-cosa', revision: 0, secuencia: 0, confirmaciones: [] }), false);
  assert.strictEqual(puerta.auditar({}).ok, false);
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__puerta] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__puerta] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

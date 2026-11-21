'use strict';

/**
 * instagram-bridge · bloque 9 · Q6 · PoliticaDeAutonomia (REFLEJO)
 *
 * La sintesis. Dos tests son el corazon del bloque:
 *
 *   el_historial_no_sube_la_autonomia_por_si_solo
 *     Un historial impecable no asciende nada: ni convierte `borrador` en
 *     `permiso`, ni rellena el hueco de una autorizacion. Si pudiera, el sistema
 *     se estaria concediendo permisos a si mismo: bastaria portarse bien unas
 *     cuantas veces. El historial solo puede BAJAR un escalon.
 *
 *   no_se_puede_conseguir_permiso_por_una_via_y_ejecutar_por_otra
 *     Un si conseguido para una accion no sirve para otra, ni para otra cuenta,
 *     ni para otro rol, ni para otra casilla, ni despues de gastado, ni despues
 *     de caducado. Y la autorizacion que llega por el payload no vale: solo la
 *     que esta en el registro.
 *
 * Ejecutar: node modules/instagram-bridge/tests/politica.test.js
 */

const assert = require('assert');

const politica = require('../autonomia/politica');
const puerta = require('../autonomia/puerta');
const autorizaciones = require('../autonomia/autorizaciones');
const nivel = require('../autonomia/nivel');
const casillas = require('../core/casillas');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M0 = '2026-11-11T12:00:00Z';
const M1 = '2026-11-11T12:05:00Z';
const M2 = '2026-11-11T12:10:00Z';
const M3 = '2026-11-11T14:00:00Z';

const DECL_PERMISO = { cuenta: '@taller_a', proyecto: 'proy-a', nivel: 'permiso', quien: 'dueno', momento: M0 };
const DECL_EJECUTAR = { cuenta: '@taller_a', proyecto: 'proy-a', nivel: 'ejecutar', quien: 'dueno', momento: M0 };
const DECL_BORRADOR = { cuenta: '@taller_a', proyecto: 'proy-a', nivel: 'borrador', quien: 'dueno', momento: M0 };

// ---------------------------------------------------------------------------
// utilidades: un permiso de verdad, conseguido por la puerta y anotado en el libro
// ---------------------------------------------------------------------------

function permisoDeVerdad(extra = {}) {
  const p = puerta.pedir(puerta.estado_vacio(), Object.assign({
    proyecto: 'proy-a', cuenta: '@taller_a', accion: 'publicar', rol: 'agente',
    aparato: 'movil-1', quien: 'agente', momento: M0, nivel_al_conceder: 'permiso'
  }, extra));
  assert.strictEqual(p.ok, true, p.motivo);

  const r = puerta.responder(p.estado, {
    confirmacion_id: p.confirmacion_id, decision: 'si', quien: 'dueno',
    momento: M1, referencia: 'telegram:msg-1', via: 'puerta'
  });
  assert.strictEqual(r.autoriza, true, r.motivo);

  const a = autorizaciones.anotar(autorizaciones.estado_vacio(), r.autorizacion);
  assert.strictEqual(a.ok, true, a.motivo);

  // Lo que la sintesis ve cuando el borde lee del registro.
  return {
    autorizacion: Object.assign({}, a.autorizacion, { procedencia: 'registro_autorizaciones' }),
    libro: a.estado,
    confirmacion: p.confirmacion_id
  };
}

function pedir(extra = {}) {
  return Object.assign({
    proyecto: 'proy-a',
    cuenta: '@taller_a',
    rol: 'agente',
    accion: 'publicar',
    nivel: DECL_PERMISO,
    momento: M1
  }, extra);
}

// ---------------------------------------------------------------------------
// 1 · EL HISTORIAL INFORMA, NO AUTORIZA
// ---------------------------------------------------------------------------

test('el_historial_no_sube_la_autonomia_por_si_solo', () => {
  const exitos = [];
  for (let i = 0; i < 50; i += 1) {
    exitos.push({ tipo: 'exito', momento: `2026-11-11T11:${String(i).padStart(2, '0')}:00Z` });
  }
  const cancelaciones = exitos.map((e) => ({ tipo: 'cancelacion', momento: e.momento }));

  // ---- 1 · borrador + un historial impecable sigue siendo borrador --------
  const borrador = politica.decidir(pedir({ nivel: DECL_BORRADOR, historial: exitos.concat(cancelaciones) }));
  assert.strictEqual(borrador.dictamen, 'borrador', 'el historial no asciende el nivel');
  assert.strictEqual(borrador.nivel, 'borrador');
  assert.strictEqual(borrador.presion_del_historial, 0, 'un buen historial no aprieta... y no asciende');

  // ---- 2 · permiso + historial impecable sigue pidiendo permiso -----------
  const permiso = politica.decidir(pedir({ historial: exitos }));
  assert.strictEqual(permiso.dictamen, 'permiso');
  assert.strictEqual(permiso.motivo, politica.MOTIVOS.NIVEL_PIDE_PERMISO);
  assert.strictEqual(permiso.autorizacion_id, null);

  // ---- 3 · un historial que "sugiere" un nivel se ignora -----------------
  const sugiere = politica.decidir(pedir({
    nivel: DECL_BORRADOR,
    historial: { nivel: 'ejecutar', autoriza: true }
  }));
  assert.strictEqual(sugiere.dictamen, 'borrador');
  assert.ok(sugiere.porque.some((x) => x.paso === 'historial' && x.motivo === politica.MOTIVOS.HISTORIAL_NO_AUTORIZA),
    JSON.stringify(sugiere.porque));

  // Un asiento que se presenta como permiso tampoco.
  const asientoPermiso = politica.decidir(pedir({
    historial: [{ tipo: 'autorizacion', autoriza: true, accion: 'publicar', momento: M0 }]
  }));
  assert.strictEqual(asientoPermiso.dictamen, 'permiso', 'un asiento no es una autorizacion');
  assert.ok(asientoPermiso.porque.some((x) => x.motivo === politica.MOTIVOS.HISTORIAL_NO_AUTORIZA));

  // ---- 4 · el historial SI puede bajar un escalon ------------------------
  const conFallo = politica.decidir(pedir({
    nivel: DECL_EJECUTAR,
    historial: [{ tipo: 'fallo', momento: M0 }]
  }));
  assert.strictEqual(conFallo.dictamen, 'permiso', 'el historial aprieta');
  assert.strictEqual(conFallo.motivo, politica.MOTIVOS.HISTORIAL_PIDE_CAUTELA);
  assert.strictEqual(conFallo.presion_del_historial, 1);

  // Pero solo uno: no puede llevar a `borrador` ni a `no`.
  const muchosFallos = politica.decidir(pedir({
    nivel: DECL_EJECUTAR,
    historial: Array.from({ length: 20 }, () => ({ tipo: 'castigo_firme', momento: M0 }))
  }));
  assert.strictEqual(muchosFallos.dictamen, 'permiso', 'el historial baja uno, no hunde');

  // ---- 5 · un historial limpio no baja lo que el dueno declaro ----------
  const limpio = politica.decidir(pedir({ nivel: DECL_EJECUTAR, historial: exitos }));
  assert.strictEqual(limpio.dictamen, 'ejecutar');
  assert.strictEqual(limpio.motivo, politica.MOTIVOS.NIVEL_EJECUTA);

  // ---- 6 · la presion nunca es negativa ---------------------------------
  for (const h of [undefined, null, [], exitos, cancelaciones, [{ tipo: 'fallo' }], 'mucho', { tipo: 'exito' }]) {
    const p = politica.presion_del_historial(h, M1);
    assert.ok(p.presion === 0 || p.presion === 1, `presion ${p.presion} no es 0 ni 1`);
    assert.ok(p.peso >= 0);
  }

  // Y un fallo viejo no aprieta para siempre.
  const viejo = politica.presion_del_historial([{ tipo: 'fallo', momento: '2026-11-01T00:00:00Z' }], M1);
  assert.strictEqual(viejo.presion, 0, 'lo de hace un mes no dice nada del rato de ahora');
});

test('un_buen_historial_no_sustituye_a_una_autorizacion_que_falta', () => {
  // El caso mas tentador: la cuenta lleva 200 publicaciones sin un solo fallo.
  // Aun asi, en nivel `permiso`, sin si no se publica.
  const exitos = Array.from({ length: 200 }, (_, i) => ({ tipo: 'exito', momento: `2026-11-11T10:${String(i % 60).padStart(2, '0')}:00Z` }));
  const d = politica.decidir(pedir({ historial: exitos }));

  assert.strictEqual(d.dictamen, 'permiso');
  assert.ok(d.porque.some((x) => x.paso === 'autorizacion' && x.resultado === 'ninguna'));
  assert.strictEqual(d.autorizacion_id, null, 'el historial no produce un id de autorizacion');

  // Y con autorizacion, si publica: lo que cambia es el si, no el historial.
  const { autorizacion } = permisoDeVerdad();
  const conSi = politica.decidir(pedir({ historial: [], autorizacion }));
  assert.strictEqual(conSi.dictamen, 'ejecutar');
});

// ---------------------------------------------------------------------------
// 2 · LAS DOS VIAS
// ---------------------------------------------------------------------------

test('no_se_puede_conseguir_permiso_por_una_via_y_ejecutar_por_otra', () => {
  const { autorizacion, libro } = permisoDeVerdad();
  assert.strictEqual(autorizacion.accion, 'publicar');

  // La buena: el permiso es de publicar, en taller_a, en proy-a, para el agente.
  const buena = politica.decidir(pedir({ autorizacion }));
  assert.strictEqual(buena.dictamen, 'ejecutar');
  assert.strictEqual(buena.motivo, politica.MOTIVOS.AUTORIZACION_PRESENTE);
  assert.strictEqual(buena.autorizacion_id, autorizacion.autorizacion_id);
  assert.strictEqual(buena.exige_ventana, true, 'publicar es irreversible: ventana de 120 s');
  assert.strictEqual(buena.ventana_segundos, 120);

  // ---- via 1: el mismo si para OTRA accion ------------------------------
  const otraAccion = politica.decidir(pedir({ accion: 'comentar', autorizacion }));
  assert.strictEqual(otraAccion.dictamen, 'no');
  assert.strictEqual(otraAccion.motivo, politica.MOTIVOS.PERMISO_DE_OTRA_ACCION);

  // ---- via 2: el mismo si en OTRA cuenta -------------------------------
  // Se declara nivel para las dos cuentas a proposito: lo unico que cambia es
  // de quien es el permiso, no la autonomia.
  const otraCuenta = politica.decidir(pedir({
    cuenta: '@taller_b',
    nivel: [{ cuenta: '@taller_a', proyecto: 'proy-a', nivel: 'permiso', quien: 'dueno', momento: M0 },
      { cuenta: '@taller_b', proyecto: 'proy-a', nivel: 'permiso', quien: 'dueno', momento: M0 }],
    autorizacion
  }));
  assert.strictEqual(otraCuenta.dictamen, 'no');
  assert.strictEqual(otraCuenta.motivo, politica.MOTIVOS.PERMISO_DE_OTRA_CUENTA);

  // ---- via 3: el mismo si para OTRO rol --------------------------------
  const otroRol = politica.decidir(pedir({ rol: 'dueno', autorizacion }));
  assert.strictEqual(otroRol.dictamen, 'no');
  assert.strictEqual(otroRol.motivo, politica.MOTIVOS.PERMISO_DE_OTRO_ROL);

  // ---- via 4: el mismo si en OTRO proyecto -----------------------------
  const otroProy = politica.decidir(pedir({
    proyecto: 'proy-b',
    nivel: [{ proyecto: 'proy-a', cuenta: '@taller_a', nivel: 'permiso', quien: 'dueno', momento: M0 },
      { proyecto: 'proy-b', cuenta: '@taller_a', nivel: 'permiso', quien: 'dueno', momento: M0 }],
    autorizacion
  }));
  assert.strictEqual(otroProy.dictamen, 'no');
  assert.strictEqual(otroProy.motivo, politica.MOTIVOS.PERMISO_DE_OTRO_PROYECTO);

  // ---- via 5: el si era de una casilla mas blanda ----------------------
  const blanda = Object.assign({}, autorizacion, { casilla: { reversibilidad: 'reversible', visibilidad: 'privada', ventana_segundos: 0 } });
  const conCasillaBlanda = politica.decidir(pedir({ autorizacion: blanda }));
  assert.strictEqual(conCasillaBlanda.dictamen, 'no');
  assert.strictEqual(conCasillaBlanda.motivo, politica.MOTIVOS.PERMISO_DE_OTRA_CASILLA);

  // ---- via 6: huella tocada --------------------------------------------
  const tocada = Object.assign({}, autorizacion, { huella: 'f'.repeat(32) });
  const conHuellaTocada = politica.decidir(pedir({ autorizacion: tocada }));
  assert.strictEqual(conHuellaTocada.dictamen, 'no');
  assert.strictEqual(conHuellaTocada.motivo, politica.MOTIVOS.HUELLA_NO_CORRESPONDE);

  // ---- via 7: el si ya caduco ------------------------------------------
  const caduco = politica.decidir(pedir({ momento: M3, autorizacion }));
  assert.strictEqual(caduco.dictamen, 'no');
  assert.strictEqual(caduco.motivo, politica.MOTIVOS.PERMISO_CADUCADO);

  // ---- via 8: el si ya se gasto ----------------------------------------
  const gasto = autorizaciones.consumir(libro, {
    autorizacion_id: autorizacion.autorizacion_id, momento: M1,
    accion: 'publicar', cuenta: '@taller_a', proyecto: 'proy-a', rol: 'agente', quien: 'agente'
  });
  assert.strictEqual(gasto.ok, true, gasto.motivo);
  const gastada = autorizaciones.consultar(gasto.estado, { autorizacion_id: autorizacion.autorizacion_id, momento: M2 });
  const conGastada = politica.decidir(pedir({
    autorizacion: Object.assign({}, gastada.autorizacion, { procedencia: 'registro_autorizaciones' })
  }));
  assert.strictEqual(conGastada.dictamen, 'no');
  assert.strictEqual(conGastada.motivo, politica.MOTIVOS.PERMISO_YA_GASTADO);

  // Y el registro, por su lado, tampoco deja gastarla dos veces.
  const segundoGasto = autorizaciones.consumir(gasto.estado, {
    autorizacion_id: autorizacion.autorizacion_id, momento: M1,
    accion: 'publicar', cuenta: '@taller_a', proyecto: 'proy-a', rol: 'agente', quien: 'agente'
  });
  assert.strictEqual(segundoGasto.ok, false);
  assert.strictEqual(segundoGasto.motivo, 'autorizacion_ya_consumida');

  // ---- via 9: el si llego por el silencio (o por el historial) ---------
  for (const via of ['silencio', 'historial', 'costumbre']) {
    const porVia = politica.decidir(pedir({ autorizacion: Object.assign({}, autorizacion, { via }) }));
    assert.strictEqual(porVia.dictamen, 'no', `via ${via}`);
    assert.strictEqual(porVia.motivo, politica.MOTIVOS.AUTORIZACION_POR_VIA_INVALIDA);
  }

  // ---- via 10: la autorizacion viene del payload, no del registro ------
  const sinProcedencia = politica.decidir(pedir({ autorizacion: Object.assign({}, autorizacion, { procedencia: undefined }) }));
  assert.strictEqual(sinProcedencia.dictamen, 'no');
  assert.strictEqual(sinProcedencia.motivo, politica.MOTIVOS.AUTORIZACION_SIN_PROCEDENCIA);

  // ---- via 11: el si lo dio el sistema ---------------------------------
  const porSistema = politica.decidir(pedir({ autorizacion: Object.assign({}, autorizacion, { quien: 'sistema' }) }));
  assert.strictEqual(porSistema.dictamen, 'no');
  assert.strictEqual(porSistema.motivo, politica.MOTIVOS.AUTORIZACION_SIN_PERSONA);

  // ---- via 12: un permiso concedido en el nivel conservador ------------
  const enBorrador = politica.decidir(pedir({
    autorizacion: Object.assign({}, autorizacion, { nivel_al_conceder: 'borrador' })
  }));
  assert.strictEqual(enBorrador.dictamen, 'no');
  assert.strictEqual(enBorrador.motivo, politica.MOTIVOS.PERMISO_DE_NIVEL_CONSERVADOR);

  // ---- via 13: el nivel de hoy es mas conservador ----------------------
  const cuentaRebajada = politica.decidir(pedir({ nivel: DECL_BORRADOR, autorizacion }));
  assert.strictEqual(cuentaRebajada.dictamen, 'borrador', 'con la cuenta en borrador no se ejecuta ni con un si');
  const cuentaPermiso = politica.decidir(pedir({
    nivel: { cuenta: 'taller_a', proyecto: 'proy-a', nivel: 'permiso', quien: 'agente', momento: M0 },
    autorizacion
  }));
  assert.strictEqual(cuentaPermiso.dictamen, 'borrador', 'un nivel declarado por el agente es el conservador');
  assert.strictEqual(cuentaPermiso.nivel_origen, 'rebajado');
  assert.strictEqual(cuentaPermiso.nivel_declarado, 'permiso', 'se ve el intento y no se aplica');

  // ---- y el registro tambien rechaza el gasto cruzado ------------------
  const cruzado = autorizaciones.consumir(libro, {
    autorizacion_id: autorizacion.autorizacion_id, momento: M1,
    accion: 'comentar', cuenta: '@taller_a', proyecto: 'proy-a', rol: 'agente', quien: 'agente'
  });
  assert.strictEqual(cruzado.ok, false);
  assert.strictEqual(cruzado.motivo, 'permiso_de_otra_accion');

  // Dos comprobaciones independientes para el mismo ataque: la sintesis y el
  // libro. Ninguna de las dos se fia de la otra.
});

test('un_si_de_publicar_no_autoriza_un_comentario_ni_al_reves', () => {
  // La version corta del ataque, con las dos direcciones.
  const publicar = permisoDeVerdad();
  const comentar = permisoDeVerdad({ accion: 'comentar' });

  assert.strictEqual(politica.decidir(pedir({ accion: 'comentar', autorizacion: publicar.autorizacion })).dictamen, 'no');
  assert.strictEqual(politica.decidir(pedir({ accion: 'publicar', autorizacion: comentar.autorizacion })).dictamen, 'no');
  assert.strictEqual(politica.decidir(pedir({ accion: 'comentar', autorizacion: comentar.autorizacion })).dictamen, 'ejecutar');
});

// ---------------------------------------------------------------------------
// 3 · el orden y las demas reglas
// ---------------------------------------------------------------------------

test('el_orden_de_la_sintesis_es_fijo', () => {
  const { autorizacion } = permisoDeVerdad();
  const d = politica.decidir(pedir({ autorizacion }));
  const pasos = d.porque.map((x) => x.paso);
  assert.deepStrictEqual(pasos, ['casilla', 'rol', 'nivel', 'historial', 'autorizacion', 'ventana', 'veredicto']);
  assert.deepStrictEqual(politica.describir().orden, ['casilla', 'rol', 'nivel', 'historial', 'autorizacion', 'ventana']);

  // El veredicto coincide con el ultimo paso del recorrido.
  const ultimo = d.porque[d.porque.length - 1];
  assert.strictEqual(ultimo.paso, 'veredicto');
  assert.strictEqual(ultimo.resultado, d.dictamen);
  assert.strictEqual(ultimo.motivo, d.motivo);
});

test('el_sistema_no_toca_el_mundo', () => {
  for (const accion of ['publicar', 'comentar', 'seguir', 'borrar', 'responder']) {
    const d = politica.decidir(pedir({ rol: 'sistema', accion, nivel: DECL_EJECUTAR }));
    assert.strictEqual(d.dictamen, 'no', `${accion}: el sistema no toca el mundo`);
    assert.strictEqual(d.motivo, politica.MOTIVOS.SISTEMA_NO_TOCA_EL_MUNDO);
  }

  // Observar si puede: si no, el puente no podria ni mirar.
  for (const accion of ['pulso', 'leer']) {
    const d = politica.decidir(pedir({ rol: 'sistema', accion, nivel: DECL_BORRADOR }));
    assert.strictEqual(d.dictamen, 'ejecutar', `${accion}: el sistema observa`);
    assert.strictEqual(d.motivo, politica.MOTIVOS.SISTEMA_SOLO_OBSERVA);
    assert.strictEqual(d.exige_ventana, false);
  }
});

test('una_accion_inocua_se_permite_hasta_en_borrador', () => {
  for (const accion of ['pulso', 'leer']) {
    const d = politica.decidir(pedir({ accion, nivel: DECL_BORRADOR }));
    assert.strictEqual(d.dictamen, 'ejecutar', `${accion} no cambia nada`);
    assert.strictEqual(d.inocua, true);
    assert.strictEqual(d.exige_ventana, false);
  }

  // Un borrador de verdad no escribe.
  for (const accion of ['publicar', 'comentar', 'seguir']) {
    const d = politica.decidir(pedir({ accion, nivel: DECL_BORRADOR }));
    assert.strictEqual(d.dictamen, 'borrador', accion);
  }
});

test('el_dueno_juega_con_su_nivel_y_el_agente_con_el_suyo', () => {
  // En nivel ejecutar, el agente publica con ventana.
  const agente = politica.decidir(pedir({ nivel: DECL_EJECUTAR }));
  assert.strictEqual(agente.dictamen, 'ejecutar');
  assert.strictEqual(agente.exige_ventana, true);

  // El dueno tambien, y con la misma ventana: la casilla no cambia por quien sea.
  const dueno = politica.decidir(pedir({ rol: 'dueno', nivel: DECL_EJECUTAR }));
  assert.strictEqual(dueno.dictamen, 'ejecutar');
  assert.strictEqual(dueno.ventana_segundos, 120);

  // Sin rol no se decide nada.
  const sinRol = politica.decidir(pedir({ rol: undefined }));
  assert.strictEqual(sinRol.dictamen, 'no');
  assert.strictEqual(sinRol.motivo, politica.MOTIVOS.ROL_DESCONOCIDO);
});

test('sin_ambito_no_hay_decision', () => {
  const sinProyecto = politica.decidir({ cuenta: 'a', rol: 'agente', accion: 'publicar', nivel: DECL_EJECUTAR, momento: M1 });
  assert.strictEqual(sinProyecto.dictamen, 'no');
  assert.strictEqual(sinProyecto.motivo, politica.MOTIVOS.AMBITO_INCOMPLETO);
  assert.deepStrictEqual(sinProyecto.faltan, ['proyecto']);

  const sinCuenta = politica.decidir({ proyecto: 'p', rol: 'agente', accion: 'publicar', nivel: DECL_EJECUTAR, momento: M1 });
  assert.strictEqual(sinCuenta.dictamen, 'no');
  assert.deepStrictEqual(sinCuenta.faltan, ['cuenta']);

  const nada = politica.decidir();
  assert.strictEqual(nada.dictamen, 'no');
});

test('la_casilla_manda_sobre_la_autorizacion_y_sobre_el_rol', () => {
  const { autorizacion } = permisoDeVerdad();

  // Sin casilla no hay permiso que valga, ni del dueno ni con autorizacion.
  const sinCasilla = politica.decidir(pedir({ accion: 'volar', rol: 'dueno', autorizacion }));
  assert.strictEqual(sinCasilla.dictamen, 'no');
  assert.strictEqual(sinCasilla.motivo, casillas.MOTIVOS.ACCION_SIN_CASILLA);

  // Y una casilla traida por el que pide se rechaza antes de mirar el rol.
  const conCasillaFalsa = politica.decidir(pedir({
    casilla: { reversibilidad: 'reversible', visibilidad: 'privada' }
  }));
  assert.strictEqual(conCasillaFalsa.dictamen, 'no');
  assert.strictEqual(conCasillaFalsa.motivo, casillas.MOTIVOS.CASILLA_AJENA);
});

test('el_dictamen_siempre_es_uno_de_los_cuatro', () => {
  const casos = [
    { nivel: DECL_BORRADOR }, { nivel: DECL_PERMISO }, { nivel: DECL_EJECUTAR },
    { nivel: undefined }, { nivel: 'ejecutar' }, { rol: 'sistema' }, { rol: 'nadie' },
    { accion: 'volar' }, { accion: 'leer' }, { accion: 'borrar' }
  ];
  for (const caso of casos) {
    const d = politica.decidir(pedir(caso));
    assert.ok(politica.DICTAMENES.includes(d.dictamen), `${JSON.stringify(caso)} da ${d.dictamen}`);
    assert.strictEqual(d.ok, true, 'la sintesis siempre contesta');
    assert.ok(Array.isArray(d.porque) && d.porque.length > 0, 'y siempre dice por que');
    if (d.dictamen === 'ejecutar' && d.casilla.reversibilidad === 'irreversible') {
      assert.strictEqual(d.exige_ventana, true, 'lo irreversible ejecutado exige ventana');
    }
  }
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__politica] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__politica] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

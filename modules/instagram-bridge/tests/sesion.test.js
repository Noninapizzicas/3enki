'use strict';

/**
 * instagram-bridge · bloque 8 · D2 (caida y reautenticacion), H1 (aparato
 * ausente) y H3 (modo degradado).
 *
 * Esta suite fija lo que el pulso no puede relajar:
 *   - **lo reversible vuelve con su paso; lo irreversible va a revision** (y lo
 *     que no se sabe cae del lado caro). El paso se conserva tal cual: numero,
 *     ancla y accion.
 *   - **la reautenticacion es siempre humana**: el sistema detecta la caida, no
 *     la repara. Sin `dueno` y sin `autorizacion_id` no hay vuelta.
 *   - **una revision no se cierra por reautenticar**: la sesion puede volver y la
 *     duda sobre si el paso ocurrio seguir pendiente.
 *   - **el aviso de aparato ausente exige acuse REAL**: enviarlo no lo cierra, un
 *     recordatorio no es un acuse, y el sistema no acusa.
 *   - **sin plataforma solo sobrevive lo ya traido**: se lee la cache y se dice
 *     que es viejo; lo nuevo no se inventa y no se publica.
 *   - el custodio escribe single-writer y de forma atomica, y un fichero roto NO
 *     se sobrescribe.
 *
 * Ejecutar: node modules/instagram-bridge/tests/sesion.test.js
 */

const assert = require('assert');
const fsp = require('fs/promises');
const path = require('path');

const caida = require('../sesion/caida');
const ausente = require('../sesion/ausente');
const degradado = require('../sesion/degradado');
const { crear, TOPICS } = require('../sesion');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M1 = '2026-11-11T12:00:00Z';
const M2 = '2026-11-11T12:05:00Z';
const M3 = '2026-11-11T12:30:00Z';

function caida_de(opts = {}) {
  return Object.assign({
    cuenta: '@taller_a',
    proyecto: 'proy-a',
    aparato: 'movil-1',
    motivo: 'la plataforma pide volver a entrar',
    momento: M1,
    quien: 'sistema',
    operacion_id: 'op-0001'
  }, opts);
}

function un_paso(consecuencia) {
  return {
    numero: 3,
    ancla: { tipo: 'boton', nombre: 'Compartir' },
    accion: 'tocar',
    consecuencia
  };
}

function aviso_de(opts = {}) {
  return Object.assign({
    cuenta: '@taller_a',
    proyecto: 'proy-a',
    aparato: 'movil-1',
    motivo: 'el movil no responde ni aparece en la red',
    momento: M1,
    quien: 'sistema',
    canal: 'telegram',
    operacion_id: 'op-0001'
  }, opts);
}

function cache_de(entradas) {
  return { traido_en: M1, entradas };
}

// ---------------------------------------------------------------------------
// 1 · D2 · lo reversible vuelve con su paso y lo irreversible a revision
// ---------------------------------------------------------------------------

test('lo_reversible_vuelve_con_su_paso_y_lo_irreversible_a_revision', () => {
  const vacio = caida.estado_vacio();

  // (a) El paso no toco el mundo: el trabajo VUELVE CON SU PASO, intacto.
  const reversible = caida.registrar_caida(vacio, caida_de({ paso: un_paso('ninguna') }));
  assert.strictEqual(reversible.ok, true, reversible.motivo);
  assert.strictEqual(reversible.desenlace, 'vuelve_con_su_paso');
  assert.strictEqual(reversible.trabajo.estado, 'en_cola');
  assert.strictEqual(reversible.trabajo.revision, undefined, 'sin revision no hay nada que mirar');
  assert.deepStrictEqual(
    reversible.trabajo.paso,
    { numero: 3, ancla: { tipo: 'boton', nombre: 'Compartir' }, accion: 'tocar' },
    'el paso vuelve TAL CUAL: numero, ancla y accion'
  );
  assert.strictEqual(reversible.trabajo.operacion_id, 'op-0001');
  assert.strictEqual(reversible.asiento.estado, 'reauth_pendiente');
  assert.strictEqual(reversible.asiento.reautenticacion.exige, 'persona');
  assert.strictEqual(reversible.asiento.reautenticacion.autorizada, false);
  assert.strictEqual(reversible.requiere_acuse, false, 'reversible no necesita revision');
  assert.strictEqual(caida.auditar(reversible.estado).ok, true);

  // (b) El paso pudo tocar el mundo: REVISION, y se dice que hace falta.
  const posible = caida.registrar_caida(vacio, caida_de({ paso: un_paso('posible') }));
  assert.strictEqual(posible.ok, true, posible.motivo);
  assert.strictEqual(posible.desenlace, 'revision');
  assert.strictEqual(posible.trabajo.estado, 'en_revision');
  assert.strictEqual(posible.trabajo.revision.motivo, 'consecuencia_posible');
  assert.match(posible.trabajo.revision.que_hace_falta, /persona/);
  assert.deepStrictEqual(posible.trabajo.paso, {
    numero: 3,
    ancla: { tipo: 'boton', nombre: 'Compartir' },
    accion: 'tocar'
  }, 'en revision tambien se conserva el paso: la persona necesita saber cual fue');
  assert.strictEqual(posible.requiere_acuse, true);
  assert.strictEqual(caida.auditar(posible.estado).ok, true);

  // (c) No se sabe si lo toco: tambien revision (el lado caro).
  const incierta = caida.registrar_caida(vacio, caida_de({ paso: un_paso('incierta') }));
  assert.strictEqual(incierta.desenlace, 'revision');
  assert.strictEqual(incierta.trabajo.estado, 'en_revision');
  assert.strictEqual(incierta.trabajo.revision.motivo, 'consecuencia_incierta');
  assert.strictEqual(incierta.trabajo.consecuencia, 'incierta');

  // (d) Una consecuencia NO declarada no se supone reversible: por defecto
  // incierta -> revision, y se dice de donde salio el valor.
  const sin_declarar = caida.registrar_caida(vacio, caida_de({ paso: { numero: 1 } }));
  assert.strictEqual(sin_declarar.desenlace, 'revision', 'sin declarar no se asume reversible');
  assert.strictEqual(sin_declarar.trabajo.consecuencia, 'incierta');
  assert.strictEqual(sin_declarar.trabajo.consecuencia_origen, 'por_defecto');
  assert.strictEqual(sin_declarar.asiento.caida.consecuencia_origen, 'por_defecto');
  const inventada = caida.registrar_caida(vacio, caida_de({ consecuencia: 'seguro_que_no' }));
  assert.strictEqual(inventada.trabajo.consecuencia_origen, 'invalida');
  assert.strictEqual(inventada.desenlace, 'revision');

  // (e) Sin trabajo en vuelo no hay destino inventado.
  const sin_trabajo = caida.registrar_caida(vacio, caida_de({ operacion_id: undefined }));
  assert.strictEqual(sin_trabajo.ok, true);
  assert.strictEqual(sin_trabajo.desenlace, 'sin_trabajo_en_vuelo');
  assert.strictEqual(sin_trabajo.trabajo, null);
  assert.strictEqual(sin_trabajo.asiento.estado, 'reauth_pendiente');

  // (f) La tabla de desenlaces es cerrada y solo 'ninguna' es reversible.
  assert.strictEqual(caida.desenlace_de('ninguna'), 'vuelve_con_su_paso');
  for (const consecuencia of ['posible', 'incierta', 'lo_que_sea', undefined]) {
    assert.strictEqual(caida.desenlace_de(consecuencia), 'revision', `'${consecuencia}' va a revision`);
  }

  // (g) Un segundo registro de la MISMA cuenta actualiza el asiento y conserva la
  // historia: no se abren dos sesiones para una cuenta.
  const segunda = caida.registrar_caida(reversible.estado, caida_de({ momento: M2, paso: un_paso('ninguna') }));
  assert.strictEqual(segunda.ok, true, segunda.motivo);
  assert.strictEqual(segunda.estado.cuentas.length, 1, 'una cuenta, un asiento');
  assert.strictEqual(segunda.asiento.historia.length, 2);
  assert.strictEqual(segunda.asiento.historia[0].momento, M1);
  assert.ok(segunda.asiento.sello, 'el asiento conserva su sello de nacimiento');

  // (h) Una entrada incompleta no se guarda y nombra el hueco.
  const incompleta = caida.registrar_caida(vacio, { cuenta: '@taller_a', proyecto: 'proy-a' });
  assert.strictEqual(incompleta.ok, false);
  assert.strictEqual(incompleta.motivo, 'entrada_incompleta');
  for (const campo of ['aparato', 'momento', 'quien', 'motivo']) {
    assert.ok(incompleta.faltan.includes(campo), `el rechazo nombra '${campo}'`);
  }
});

// ---------------------------------------------------------------------------
// 2 · H3 · sin plataforma solo sobrevive lo ya traido
// ---------------------------------------------------------------------------

test('sin_plataforma_solo_sobrevive_lo_ya_traido', () => {
  const entrada = degradado.entrar({ motivo: 'la plataforma no contesta', momento: M1 });
  assert.strictEqual(entrada.ok, true, entrada.motivo);
  const modo = entrada.modo;
  assert.strictEqual(degradado.es_modo(modo), true);
  assert.strictEqual(modo.modo, 'degradado');
  assert.strictEqual(modo.solo_lo_ya_traido, true);
  assert.strictEqual(modo.fresco, false);
  assert.strictEqual(modo.sin_plataforma, true);
  assert.deepStrictEqual(modo.permite.slice().sort(), degradado.ACCIONES_DE_LECTURA.slice().sort());

  // Nada nuevo: publicar, comentar, escribir un DM, seguir... todo prohibido.
  for (const accion of ['publicar', 'comentar', 'responder_dm', 'subir_historia', 'editar_perfil']) {
    const r = degradado.permite(modo, accion);
    assert.strictEqual(r.ok, false, `${accion} no se permite en degradado`);
    assert.strictEqual(r.permitida, false);
    assert.strictEqual(r.motivo, 'nada_nuevo_sin_plataforma');
    assert.match(r.porque, /lo ya traido/);
  }
  // Forzarlo no cambia nada: el `forzar` se ignora y se dice.
  const forzado = degradado.permite(modo, 'publicar', { forzar: true });
  assert.strictEqual(forzado.permitida, false);
  assert.strictEqual(forzado.forzado, true);

  // Lo que si sobrevive: leer lo traido.
  const lectura = degradado.permite(modo, 'leer_cache');
  assert.strictEqual(lectura.ok, true);
  assert.strictEqual(lectura.permitida, true);
  assert.strictEqual(lectura.origen, 'cache');
  assert.strictEqual(lectura.fresco, false);

  // Una accion que no esta en ninguna lista se prohibe (lista cerrada).
  const rara = degradado.permite(modo, 'accion_inventada');
  assert.strictEqual(rara.permitida, false);

  // Leer lo ya traido: se sirve, marcado como viejo.
  const cache = cache_de([
    { clave: 'perfil:taller_a', datos: { seguidores: 120, publicaciones: 8 }, traido_en: M1 },
    { clave: 'comentarios:ultimos', datos: [], traido_en: M1 }
  ]);
  const perfil = degradado.leer(modo, { cache, consulta: 'perfil:taller_a' });
  assert.strictEqual(perfil.ok, true, perfil.motivo);
  assert.deepStrictEqual(perfil.datos, { seguidores: 120, publicaciones: 8 });
  assert.strictEqual(perfil.origen, 'cache');
  assert.strictEqual(perfil.fresco, false, 'nunca se presenta como fresco');
  assert.strictEqual(perfil.traido_en, M1, 'se dice de cuando es');
  assert.match(perfil.aviso, /no se ha consultado la plataforma/);

  // Una lista vacia en la cache ES un dato (se pregunto y no habia).
  const vacio = degradado.leer(modo, { cache, consulta: 'comentarios:ultimos' });
  assert.strictEqual(vacio.ok, true);
  assert.deepStrictEqual(vacio.datos, []);
  assert.strictEqual(vacio.vacio, true);
  assert.match(vacio.aviso, /no habia/);

  // Una clave que NO esta en la cache no se rellena con []: es un hueco.
  const hueco = degradado.leer(modo, { cache, consulta: 'perfil:otro_proyecto' });
  assert.strictEqual(hueco.ok, false);
  assert.strictEqual(hueco.motivo, 'no_esta_en_la_cache');
  assert.strictEqual(hueco.datos, undefined, 'un hueco no se convierte en lista vacia');
  assert.match(hueco.que_hace_falta, /cuando vuelva la plataforma/);

  // Traer algo nuevo estando degradado se rechaza aunque se pida.
  const traer = degradado.leer(modo, { cache, consulta: 'perfil:taller_a', traer: true });
  assert.strictEqual(traer.ok, false);
  assert.strictEqual(traer.motivo, 'nada_nuevo_sin_plataforma');

  // Un modo desconocido no se asume benigno.
  assert.strictEqual(degradado.permite({}, 'publicar').permitida, false);
  assert.strictEqual(degradado.leer({ modo: 'inventado' }, { cache, consulta: 'x' }).ok, false);
  // Entrar sin motivo ni momento no se inventa.
  assert.strictEqual(degradado.entrar({}).ok, false);

  // Y al volver, la plataforma manda otra vez.
  const vuelta = degradado.volver({ momento: M2 });
  assert.strictEqual(vuelta.ok, true);
  assert.strictEqual(vuelta.modo.modo, 'normal');
  assert.strictEqual(degradado.permite(vuelta.modo, 'publicar').permitida, true);
});

// ---------------------------------------------------------------------------
// 3 · H1 · el aviso exige acuse REAL, no fire-and-forget
// ---------------------------------------------------------------------------

test('el_aviso_de_aparato_ausente_exige_acuse_real_no_fire_and_forget', () => {
  const vacio = ausente.estado_vacio();

  const enviado = ausente.avisar(vacio, aviso_de());
  assert.strictEqual(enviado.ok, true, enviado.motivo);
  assert.strictEqual(enviado.creado, true);
  assert.strictEqual(enviado.aviso.estado, 'pendiente_de_acuse');
  assert.strictEqual(enviado.aviso.canal, 'telegram');
  assert.strictEqual(enviado.aviso.notificado_en, M1);
  assert.match(enviado.aviso.que_hace_falta, /persona/);
  // Las tres senales que impiden leerlo como fire-and-forget:
  assert.strictEqual(enviado.cerrado, false, 'enviarlo NO lo cierra');
  assert.strictEqual(enviado.requiere_acuse, true);
  assert.strictEqual(enviado.estado_del_aviso, 'pendiente_de_acuse');
  assert.strictEqual(enviado.aviso.acuse, null);
  assert.strictEqual(ausente.auditar(enviado.estado).ok, true);

  // El aviso sigue pendiente y aparece como tal: nadie puede decir que se cerro.
  const pendientes = ausente.pendientes(enviado.estado, { proyecto: 'proy-a' });
  assert.strictEqual(pendientes.ok, true);
  assert.strictEqual(pendientes.total, 1);
  assert.strictEqual(pendientes.pendientes[0].aviso_id, enviado.aviso_id);
  assert.strictEqual(pendientes.exige_acuse, true);
  let resumen = ausente.resumen(enviado.estado, { proyecto: 'proy-a' });
  assert.strictEqual(resumen.pendientes, 1);
  assert.strictEqual(resumen.acusados, 0);
  assert.strictEqual(resumen.todo_acusado, false);

  // Un recordatorio (volver a avisar) NO es un acuse.
  const recordado = ausente.avisar(enviado.estado, aviso_de({ momento: M2 }));
  assert.strictEqual(recordado.ok, true);
  assert.strictEqual(recordado.recordatorio, true);
  assert.strictEqual(recordado.creado, false);
  assert.strictEqual(recordado.cerrado, false, 'recordar no cierra');
  assert.strictEqual(recordado.requiere_acuse, true);
  assert.strictEqual(recordado.aviso.estado, 'pendiente_de_acuse');
  assert.strictEqual(recordado.aviso.recordatorios, 1);
  assert.strictEqual(recordado.aviso.acuse, null);
  assert.strictEqual(recordado.estado.avisos.length, 1, 'el recordatorio no duplica el aviso');
  resumen = ausente.resumen(recordado.estado, { proyecto: 'proy-a' });
  assert.strictEqual(resumen.pendientes, 1, 'recordar deja el aviso pendiente');

  // El sistema NO acusa: el acuse es de quien tiene el aparato en la mano.
  const porSistema = ausente.acusar(recordado.estado, {
    aviso_id: enviado.aviso_id, momento: M2, quien: 'sistema', referencia: 'auto:enviado'
  });
  assert.strictEqual(porSistema.ok, false);
  assert.strictEqual(porSistema.motivo, 'acuse_no_humano');
  assert.match(porSistema.que_hace_falta, /persona/);
  const porAgente = ausente.acusar(recordado.estado, {
    aviso_id: enviado.aviso_id, momento: M2, quien: 'agente', referencia: 'lo he visto'
  });
  assert.strictEqual(porAgente.motivo, 'acuse_no_humano');

  // Un acuse sin referencia es "lo he visto" sin constancia: no vale.
  const sinReferencia = ausente.acusar(recordado.estado, {
    aviso_id: enviado.aviso_id, momento: M2, quien: 'dueno'
  });
  assert.strictEqual(sinReferencia.ok, false);
  assert.strictEqual(sinReferencia.motivo, 'entrada_incompleta');
  assert.ok(sinReferencia.faltan.includes('referencia'));

  // Un acuse de las tripas (sin motivo) tampoco se inventa.
  const sinMotivo = ausente.avisar(vacio, { cuenta: '@taller_a', proyecto: 'proy-a', aparato: 'movil-1', momento: M1, quien: 'sistema' });
  assert.strictEqual(sinMotivo.ok, false);
  assert.strictEqual(sinMotivo.motivo, 'entrada_incompleta');

  // El acuse REAL: persona, momento y referencia. Ahora si se cierra.
  const real = ausente.acusar(recordado.estado, {
    aviso_id: enviado.aviso_id,
    momento: M3,
    quien: 'dueno',
    referencia: 'telegram:mensaje:4711',
    canal: 'telegram'
  });
  assert.strictEqual(real.ok, true, real.motivo);
  assert.strictEqual(real.cerrado, true);
  assert.strictEqual(real.requiere_acuse, false);
  assert.strictEqual(real.aviso.estado, 'acusado');
  assert.strictEqual(real.acuse.quien, 'dueno');
  assert.strictEqual(real.acuse.momento, M3);
  assert.strictEqual(real.acuse.referencia, 'telegram:mensaje:4711');
  assert.strictEqual(real.aviso.recordatorios, 1, 'el historial de recordatorios se conserva');
  assert.strictEqual(ausente.auditar(real.estado).ok, true);

  resumen = ausente.resumen(real.estado, { proyecto: 'proy-a' });
  assert.strictEqual(resumen.pendientes, 0);
  assert.strictEqual(resumen.acusados, 1);
  assert.strictEqual(resumen.todo_acusado, true);

  // Acusar dos veces es idempotente y no reescribe el acuse original.
  const repetido = ausente.acusar(real.estado, {
    aviso_id: enviado.aviso_id, momento: M3, quien: 'dueno', referencia: 'otra:cosa'
  });
  assert.strictEqual(repetido.ok, true);
  assert.strictEqual(repetido.repetido, true);
  assert.strictEqual(repetido.acuse.referencia, 'telegram:mensaje:4711');

  // Y un aviso ya acusado no se reabre por un reintento del sistema.
  const reintento = ausente.avisar(real.estado, aviso_de({ momento: M3 }));
  assert.strictEqual(reintento.ok, true);
  assert.strictEqual(reintento.cerrado, true);
  assert.strictEqual(reintento.reabrir_exige_persona, true);
  assert.strictEqual(reintento.recordatorio, false);
  assert.strictEqual(reintento.estado.avisos[0].recordatorios, 1);

  // El aviso es por proyecto: sin proyecto no se lista (P2).
  assert.strictEqual(ausente.pendientes(real.estado, {}).ok, false);
  assert.strictEqual(ausente.resumen(real.estado, {}).motivo, 'ambito_incompleto');
  assert.strictEqual(ausente.resumen(real.estado, { proyecto: 'proy-b' }).total, 0, 'no mezcla proyectos');
});

// ---------------------------------------------------------------------------
// 4 · D2 · la reautenticacion es siempre humana
// ---------------------------------------------------------------------------

test('la_reautenticacion_es_siempre_humana', async () => {
  const con_caida = caida.registrar_caida(caida.estado_vacio(), caida_de({ paso: un_paso('ninguna') }));
  assert.strictEqual(con_caida.ok, true, con_caida.motivo);

  // Sin autorizacion_id no hay vuelta, ni siquiera del dueno.
  const sinPermiso = caida.reanudar(con_caida.estado, { cuenta: '@taller_a', momento: M2, quien: 'dueno' });
  assert.strictEqual(sinPermiso.ok, false);
  assert.strictEqual(sinPermiso.motivo, 'entrada_incompleta');
  assert.ok(sinPermiso.faltan.includes('autorizacion_id'));

  // El agente y el sistema no abren sesion: el puente no teclea contrasenas.
  for (const quien of ['agente', 'sistema']) {
    const r = caida.reanudar(con_caida.estado, {
      cuenta: '@taller_a', momento: M2, quien, autorizacion_id: 'aut-1'
    });
    assert.strictEqual(r.ok, false, `${quien} no reautentica`);
    assert.strictEqual(r.motivo, 'reauth_exige_persona');
    assert.match(r.que_hace_falta, /persona/);
  }

  // Una cuenta que no esta en el almacen no se reautentica a ciegas.
  const desconocida = caida.reanudar(con_caida.estado, {
    cuenta: '@otra_cuenta', momento: M2, quien: 'dueno', autorizacion_id: 'aut-1'
  });
  assert.strictEqual(desconocida.motivo, 'cuenta_desconocida');

  // El dueno, con autorizacion, si. Y queda registrado quien y cuando.
  const vuelta = caida.reanudar(con_caida.estado, {
    cuenta: '@taller_a', momento: M2, quien: 'dueno', autorizacion_id: 'aut-0007'
  });
  assert.strictEqual(vuelta.ok, true, vuelta.motivo);
  assert.strictEqual(vuelta.asiento.estado, 'operativa');
  assert.strictEqual(vuelta.asiento.reautenticacion.autorizada, true);
  assert.strictEqual(vuelta.asiento.reautenticacion.autorizada_por, 'dueno');
  assert.strictEqual(vuelta.asiento.reautenticacion.autorizada_en, M2);
  assert.strictEqual(vuelta.asiento.reautenticacion.autorizacion_id, 'aut-0007');
  assert.strictEqual(vuelta.asiento.reautenticacion.exige, 'persona');
  assert.strictEqual(caida.auditar(vuelta.estado).ok, true);

  // El trabajo reversible sigue esperando en la cola, con su paso.
  assert.strictEqual(vuelta.trabajo.estado, 'en_cola');
  assert.strictEqual(vuelta.trabajo.paso.numero, 3);

  // Una sesion ya operativa no se "reautentica" otra vez.
  const otraVez = caida.reanudar(vuelta.estado, {
    cuenta: '@taller_a', momento: M3, quien: 'dueno', autorizacion_id: 'aut-0008'
  });
  assert.strictEqual(otraVez.ok, false);
  assert.strictEqual(otraVez.motivo, 'ya_operativa');

  // Un asiento con reautenticacion autorizada por el sistema no pasa auditoria:
  // la regla no depende de que el codigo la respete.
  const adulterado = JSON.parse(JSON.stringify(vuelta.estado));
  adulterado.cuentas[0].reautenticacion.autorizada_por = 'sistema';
  const auditoria = caida.auditar(adulterado);
  assert.strictEqual(auditoria.ok, false);
  assert.ok(auditoria.problemas.some((p) => p.motivo === 'reauth_autorizada_por_sistema'));
});

// ---------------------------------------------------------------------------
// 5 · D2 · una revision NO se cierra por reautenticar
// ---------------------------------------------------------------------------

test('una_revision_no_se_cierra_por_reautenticar', () => {
  const con_revision = caida.registrar_caida(caida.estado_vacio(), caida_de({ paso: un_paso('incierta') }));
  assert.strictEqual(con_revision.desenlace, 'revision');

  const vuelta = caida.reanudar(con_revision.estado, {
    cuenta: '@taller_a', momento: M2, quien: 'dueno', autorizacion_id: 'aut-1'
  });
  assert.strictEqual(vuelta.ok, true, vuelta.motivo);
  assert.strictEqual(vuelta.asiento.estado, 'operativa', 'la sesion si vuelve');
  assert.strictEqual(vuelta.trabajo_queda_en_revision, true);
  assert.strictEqual(vuelta.trabajo.estado, 'en_revision', 'pero la duda NO se cierra');
  assert.strictEqual(vuelta.trabajo.revision.motivo, 'consecuencia_incierta');
  assert.match(vuelta.aviso, /revision/);
  assert.strictEqual(caida.auditar(vuelta.estado).ok, true);

  // Si la sesion vuelve a caer, la revision pendiente NO se pisa con la nueva
  // caida (aunque la nueva sea reversible).
  const otraCaida = caida.registrar_caida(vuelta.estado, caida_de({ momento: M3, paso: un_paso('ninguna') }));
  assert.strictEqual(otraCaida.ok, true);
  assert.strictEqual(otraCaida.trabajo.estado, 'en_revision', 'lo irreversible no se cierra por cansancio');
  assert.strictEqual(otraCaida.trabajo.origen, 'revision_pendiente');

  // Una caida nueva SIN datos de paso tampoco cierra la revision pendiente.
  const sinDatos = caida.registrar_caida(vuelta.estado, caida_de({ momento: M3, operacion_id: undefined }));
  assert.strictEqual(sinDatos.ok, true, sinDatos.motivo);
  assert.strictEqual(sinDatos.desenlace, 'revision', 'el desenlace es el del trabajo, no el de la caida');
  assert.strictEqual(sinDatos.trabajo.estado, 'en_revision', 'sin datos de paso la revision sigue');
  assert.strictEqual(caida.auditar(sinDatos.estado).ok, true);

  // Resolver la revision exige persona y autorizacion.
  const sinPersona = caida.resolver_revision(otraCaida.estado, {
    cuenta: '@taller_a', momento: M3, quien: 'agente', autorizacion_id: 'aut-2',
    decision: 'volver_a_cola', motivo: 'parece que si'
  });
  assert.strictEqual(sinPersona.motivo, 'reauth_exige_persona');
  const sinDecision = caida.resolver_revision(otraCaida.estado, {
    cuenta: '@taller_a', momento: M3, quien: 'dueno', autorizacion_id: 'aut-2', motivo: 'revisado'
  });
  assert.strictEqual(sinDecision.motivo, 'decision_no_declarada');

  // Con persona y decision: vuelve a la cola CON SU PASO.
  const resuelta = caida.resolver_revision(otraCaida.estado, {
    cuenta: '@taller_a', momento: M3, quien: 'dueno', autorizacion_id: 'aut-2',
    decision: 'volver_a_cola', motivo: 'el paso 3 no llego a publicarse'
  });
  assert.strictEqual(resuelta.ok, true, resuelta.motivo);
  assert.strictEqual(resuelta.trabajo.estado, 'en_cola');
  assert.strictEqual(resuelta.trabajo.paso.numero, 3);
  assert.strictEqual(resuelta.trabajo.revision_resuelta.decision, 'volver_a_cola');
  assert.strictEqual(resuelta.trabajo.revision_resuelta.quien, 'dueno');
  assert.strictEqual(caida.auditar(resuelta.estado).ok, true);

  // Y sin revision no hay nada que resolver.
  const nada = caida.resolver_revision(resuelta.estado, {
    cuenta: '@taller_a', momento: M3, quien: 'dueno', autorizacion_id: 'aut-3',
    decision: 'volver_a_cola', motivo: 'otra vez'
  });
  assert.strictEqual(nada.ok, false);
  assert.strictEqual(nada.motivo, 'sin_revision');

  // Descartar tambien existe, y deja el motivo escrito.
  const otra = caida.registrar_caida(caida.estado_vacio(), caida_de({ cuenta: '@taller_b', paso: un_paso('posible') }));
  const descartada = caida.resolver_revision(otra.estado, {
    cuenta: '@taller_b', momento: M3, quien: 'dueno', autorizacion_id: 'aut-4',
    decision: 'descartar', motivo: 'la publicacion salio duplicada en la cuenta'
  });
  assert.strictEqual(descartada.ok, true, descartada.motivo);
  assert.strictEqual(descartada.trabajo.estado, 'descartado');
  assert.strictEqual(descartada.trabajo.revision_resuelta.decision, 'descartar');
  assert.strictEqual(caida.auditar(descartada.estado).ok, true);
});

// ---------------------------------------------------------------------------
// 6 · el custodio: single-writer, atomico, y un fichero roto no se pisa
// ---------------------------------------------------------------------------

test('el_custodio_escribe_atomico_y_no_pisa_un_fichero_roto', async () => {
  const dir = await fsp.mkdtemp(path.join(require('os').tmpdir(), 'enki-sesion-'));
  try {
    const custodio = crear({ directorio: dir });
    const r = await custodio.registrar_caida(caida_de({ paso: un_paso('ninguna') }));
    assert.strictEqual(r.ok, true, r.motivo);

    // El fichero existe, es del esquema y no quedan temporales.
    const ruta = path.join(dir, 'sesion.json');
    const datos = JSON.parse(await fsp.readFile(ruta, 'utf8'));
    assert.strictEqual(datos.esquema, 'sesion-cuentas-v1');
    assert.strictEqual(datos.cuentas.length, 1);
    assert.strictEqual(datos.revision, 1);
    const restos = (await fsp.readdir(dir)).filter((f) => f.includes('.tmp'));
    assert.deepStrictEqual(restos, [], 'no queda ningun temporal: la escritura fue atomica');
    // Y el acuse de un aviso va a SU fichero, no al de sesion.
    const aviso = await custodio.avisar(aviso_de());
    assert.strictEqual(aviso.ok, true, aviso.motivo);
    assert.ok((await fsp.readdir(dir)).includes('ausente.json'));
    const sesionTrasAviso = JSON.parse(await fsp.readFile(ruta, 'utf8'));
    assert.strictEqual(sesionTrasAviso.revision, 1, 'avisar no reescribe el almacen de sesion');

    // Dos escrituras simultaneas no se pisan: el single-writer las serializa.
    const [a, b] = await Promise.all([
      custodio.registrar_caida(caida_de({ cuenta: '@taller_b', momento: M2 })),
      custodio.registrar_caida(caida_de({ cuenta: '@taller_c', momento: M3 }))
    ]);
    assert.strictEqual(a.ok, true, a.motivo);
    assert.strictEqual(b.ok, true, b.motivo);
    const final = JSON.parse(await fsp.readFile(ruta, 'utf8'));
    assert.strictEqual(final.cuentas.length, 3, 'las dos escrituras llegaron');
    assert.strictEqual(final.revision, 3);

    // Un fichero roto NO se repara a ciegas: se nombra y se deja intacto.
    const roto = '{ esto no es json';
    await fsp.writeFile(ruta, roto, 'utf8');
    const segundo = crear({ directorio: dir });
    const carga = await segundo.cargar();
    assert.strictEqual(carga.ok, false);
    assert.strictEqual(carga.sesion, 'sesion_ilegible');
    const rechazo = await segundo.registrar_caida(caida_de({ cuenta: '@taller_d' }));
    assert.strictEqual(rechazo.ok, false);
    assert.strictEqual(rechazo.motivo, 'sin_sesion');
    assert.strictEqual(await fsp.readFile(ruta, 'utf8'), roto, 'el fichero roto no se machaca');

    // Y el otro almacen sigue siendo independiente (cada uno con su candado).
    assert.strictEqual((await segundo.foto()).avisos.avisos.length, 1);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 7 · auditoria: lo que no puede colarse
// ---------------------------------------------------------------------------

test('la_auditoria_rechaza_asientos_sin_sello_y_secretos', () => {
  const con_caida = caida.registrar_caida(caida.estado_vacio(), caida_de({ paso: un_paso('ninguna') }));

  // Sin sello no pasa.
  const sinSello = JSON.parse(JSON.stringify(con_caida.estado));
  delete sinSello.cuentas[0].sello;
  const a1 = caida.auditar(sinSello);
  assert.strictEqual(a1.ok, false);
  assert.ok(a1.problemas.some((p) => p.motivo === 'sin_sello'));

  // Un estado que no se declara, tampoco.
  const malEstado = JSON.parse(JSON.stringify(con_caida.estado));
  malEstado.cuentas[0].estado = 'mirando';
  assert.ok(caida.auditar(malEstado).problemas.some((p) => p.motivo === 'estado_no_declarado'));

  // Una revision sin "que hace falta" no es una revision: es un cajon.
  const revisionMuda = JSON.parse(JSON.stringify(caida.registrar_caida(caida.estado_vacio(), caida_de({ paso: un_paso('posible') })).estado));
  delete revisionMuda.cuentas[0].trabajo.revision.que_hace_falta;
  assert.ok(caida.auditar(revisionMuda).problemas.some((p) => p.motivo === 'revision_sin_que_hace_falta'));

  // Ningun secreto entra al almacen (V1), y el rechazo dice en que ruta venia.
  const conSecreto = caida.registrar_caida(caida.estado_vacio(), caida_de({
    nota: 'la contrasena es hunter2',
    password: 'hunter2'
  }));
  assert.strictEqual(conSecreto.ok, false);
  assert.strictEqual(conSecreto.motivo, 'secreto_recibido');
  assert.ok(conSecreto.rutas.length > 0);
  assert.strictEqual(conSecreto.guardado, false);

  // Lo mismo en los avisos: un acuse no puede traer una credencial.
  const conSecretoAviso = ausente.avisar(ausente.estado_vacio(), aviso_de({ api_key: 'sk-live-abcdefghijklmnop' }));
  assert.strictEqual(conSecretoAviso.ok, false);
  assert.strictEqual(conSecretoAviso.motivo, 'secreto_recibido');

  // Un aviso acusado por el sistema (adulterado) no pasa la auditoria.
  const aviso = ausente.avisar(ausente.estado_vacio(), aviso_de());
  const acuse = ausente.acusar(aviso.estado, { aviso_id: aviso.aviso_id, momento: M2, quien: 'dueno', referencia: 'tg:1' });
  const adulterado = JSON.parse(JSON.stringify(acuse.estado));
  adulterado.avisos[0].acuse.quien = 'sistema';
  assert.ok(ausente.auditar(adulterado).problemas.some((p) => p.motivo === 'acuse_no_humano'));

  // Y un aviso pendiente con acuse a medias no se puede leer como cerrado.
  const pendienteConAcuse = JSON.parse(JSON.stringify(aviso.estado));
  pendienteConAcuse.avisos[0].acuse = { quien: 'dueno', momento: M2, referencia: 'tg:1' };
  assert.ok(ausente.auditar(pendienteConAcuse).problemas.some((p) => p.motivo === 'pendiente_con_acuse'));
});

// ---------------------------------------------------------------------------
// 8 · el almacen del repo nace vacio y sin sesiones inventadas
// ---------------------------------------------------------------------------

test('el_fichero_del_repo_nace_vacio_y_sin_sesiones_inventadas', async () => {
  const dir = path.resolve(__dirname, '../../../storage/instagram-bridge');

  const sesion = JSON.parse(await fsp.readFile(path.join(dir, 'sesion.json'), 'utf8'));
  assert.strictEqual(sesion.esquema, 'sesion-cuentas-v1');
  assert.deepStrictEqual(sesion.cuentas, [], 'el almacen del repo nace vacio');
  assert.strictEqual(caida.auditar(sesion).ok, true);

  const avisos = JSON.parse(await fsp.readFile(path.join(dir, 'ausente.json'), 'utf8'));
  assert.strictEqual(avisos.esquema, 'aparato-ausente-v1');
  assert.deepStrictEqual(avisos.avisos, [], 'sin avisos inventados');
  assert.strictEqual(ausente.auditar(avisos).ok, true);

  // Los topics del contrato son los que el modulo declara en module.json.
  const manifiesto = JSON.parse(await fsp.readFile(path.resolve(__dirname, '../sesion/module.json'), 'utf8'));
  const declarados = manifiesto.subscribes.map((s) => s.event).sort();
  const enCodigo = Object.values(TOPICS).map((t) => `${t}.request`).sort();
  assert.deepStrictEqual(declarados, enCodigo, 'module.json y index.js declaran los mismos topics');
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__sesion] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__sesion] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();

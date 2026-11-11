'use strict';

/**
 * puerta — Q2 · PuertaDeConfirmacion · CUSTODIO (logica pura; el IO en index.js).
 *
 * La unica puerta por la que un "si" del dueno puede entrar al sistema. No hay
 * atajo: el canal del dueno (adaptador-confirmacion) y el RPC de respuesta
 * desembocan los dos en `responder()`, y `responder()` aplica las mismas
 * comprobaciones a los dos. Una segunda puerta seria una segunda forma de
 * conseguir permiso, que es exactamente el agujero que este bloque cierra.
 *
 * LAS TRES REGLAS QUE DEFINEN LA PUERTA:
 *
 *   1. **El si y su caducidad.** Toda pregunta nace con `caduca_en` (por
 *      defecto 15 min; techo 1 h). Una respuesta que llega despues de la
 *      caducidad NO es un si: se marca `caducada` y el veredicto es
 *      `si_caducado_es_no`. Un si viejo es un no, y se dice con esas palabras.
 *
 *   2. **El silencio no es si.** `vencer()` pasa a `caducada` todo lo que nadie
 *      contesto, con `respuesta: null`. No hay ningun camino de codigo que
 *      convierta una pregunta sin respuesta en `autorizada`; `auditar()` lo
 *      vuelve a comprobar sobre el fichero.
 *
 *   3. **Solo una persona contesta.** `quien` tiene que ser `dueno`, y hace falta
 *      una `referencia` (el mensaje, el boton, lo que sea que pruebe que la
 *      respuesta existio). El agente y el sistema reciben
 *      `confirmacion_exige_persona`: un si sin persona es un si inventado.
 *
 * Y una cuarta, de higiene: **una pregunta se contesta una vez**. Reintentar el
 * si no vuelve a autorizar (`ya_resuelta` con `autoriza: false`): si no, un
 * mensaje reenviado valdria por dos acciones.
 *
 * Puro: sin IO, sin reloj. `momento` siempre viene en la entrada.
 */

const { es_objeto, es_instante, texto_no_vacio, clonar, crear_sello, validar_sello, QUIENES } = require('../core/formas');
const casillas = require('../core/casillas');
const ritmo = require('../core/ritmo');
const noSecretos = require('../core/no-secretos');

const ESQUEMA = 'confirmaciones-v1';
const ALMACEN = 'confirmaciones';

const TTL_POR_DEFECTO_SEGUNDOS = 900;
const TTL_MAXIMO_SEGUNDOS = 3600;

const ESTADOS = Object.freeze(['pendiente', 'autorizada', 'denegada', 'caducada', 'fallida']);
const DECISIONES = Object.freeze(['si', 'no']);

// De donde viene la respuesta. Las dos son validas y las dos acaban en
// `responder()`; lo que no entra es una respuesta sin canal.
const VIAS = Object.freeze(['puerta', 'canal']);

const MOTIVOS = Object.freeze({
  ENTRADA_INVALIDA: 'entrada_invalida',
  ESQUEMA_DESCONOCIDO: 'esquema_desconocido',
  SECRETO_RECIBIDO: 'secreto_recibido',
  ENTRADA_INCOMPLETA: 'entrada_incompleta',
  ACCION_SIN_CASILLA: 'accion_sin_casilla',
  NIVEL_NO_DECLARADO: 'nivel_no_declarado',
  NIVEL_CONSERVADOR: 'nivel_conservador_no_pide_permiso',
  CADUCIDAD_INVALIDA: 'caducidad_invalida',
  YA_HAY_PENDIENTE: 'ya_hay_confirmacion_pendiente',
  CONFIRMACION_DESCONOCIDA: 'confirmacion_desconocida',
  YA_RESUELTA: 'ya_resuelta',
  EXIGE_PERSONA: 'confirmacion_exige_persona',
  SIN_REFERENCIA: 'respuesta_sin_referencia',
  RESPUESTA_NO_DECLARADA: 'respuesta_no_declarada',
  SILENCIO_NO_ES_SI: 'el_silencio_no_es_si',
  SI_CADUCADO: 'si_caducado_es_no',
  ANTES_DE_PREGUNTAR: 'momento_anterior_a_la_pregunta',
  RESPUESTA_NO: 'respuesta_no',
  VIA_INVALIDA: 'via_invalida'
});

// ---------------------------------------------------------------------------
// estado
// ---------------------------------------------------------------------------

function estado_vacio() {
  return {
    esquema: ESQUEMA,
    almacen: ALMACEN,
    revision: 0,
    secuencia: 0,
    actualizado: null,
    confirmaciones: []
  };
}

function es_estado(estado) {
  return es_objeto(estado)
    && estado.esquema === ESQUEMA
    && Number.isFinite(Number(estado.revision))
    && Number.isFinite(Number(estado.secuencia))
    && Array.isArray(estado.confirmaciones);
}

function _siguiente(estado, cambios) {
  return Object.assign(clonar(estado), cambios, {
    revision: Number(estado.revision) + 1,
    secuencia: Number(estado.secuencia) + 1,
    actualizado: cambios.actualizado || estado.actualizado
  });
}

function _fallo(motivo, faltan, invalidos, extra) {
  return Object.assign({ ok: false, motivo, faltan: faltan || [], invalidos: invalidos || [] }, extra || {});
}

function _id_de(momento, huella) {
  const crypto = require('crypto');
  return `cf-${crypto.createHash('sha256').update(`${momento}|${huella}`, 'utf8').digest('hex').slice(0, 12)}`;
}

function _buscar(estado, confirmacion_id) {
  if (!es_estado(estado) || !texto_no_vacio(confirmacion_id)) return null;
  return estado.confirmaciones.find((c) => c && c.confirmacion_id === String(confirmacion_id)) || null;
}

// ---------------------------------------------------------------------------
// pedir
// ---------------------------------------------------------------------------

/**
 * Abre una pregunta al dueno. Nace SIEMPRE con caducidad: no existe la pregunta
 * eterna, porque una pregunta eterna es un permiso latente.
 *
 * Si ya hay una pregunta viva para la misma huella, NO se abre otra: se devuelve
 * la que hay (`reutilizada: true`). Dos preguntas iguales abiertas a la vez son
 * dos oportunidades de que un si se cruce con el trabajo equivocado.
 *
 * @param {object} estado
 * @param {{proyecto:string, cuenta:string, accion:string, rol:string, aparato:string,
 *          quien:string, momento:string, motivo?:string, ttl_segundos?:number,
 *          caduca_en?:string, nivel_al_conceder:string, confirmacion_id?:string,
 *          canal?:string}} entrada
 */
function pedir(estado, entrada) {
  if (!es_estado(estado)) return _fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const e = es_objeto(entrada) ? entrada : {};

  const hallazgos = noSecretos.detectar_secreto(e);
  if (hallazgos.length > 0) return _fallo(MOTIVOS.SECRETO_RECIBIDO, [], [], { hallazgos });

  const faltan = [];
  if (!texto_no_vacio(e.proyecto)) faltan.push('proyecto');
  if (!texto_no_vacio(e.cuenta)) faltan.push('cuenta');
  if (!texto_no_vacio(e.accion)) faltan.push('accion');
  if (!texto_no_vacio(e.rol)) faltan.push('rol');
  if (!texto_no_vacio(e.aparato)) faltan.push('aparato');
  if (!texto_no_vacio(e.quien)) faltan.push('quien');
  if (!es_instante(e.momento)) faltan.push('momento');
  if (!texto_no_vacio(e.nivel_al_conceder)) faltan.push('nivel_al_conceder');
  if (faltan.length > 0) return _fallo(MOTIVOS.ENTRADA_INCOMPLETA, faltan, []);

  const v = casillas.validar({ accion: e.accion, casilla: e.casilla });
  if (!v.ok) return _fallo(v.motivo, v.faltan || [], v.invalidos || []);

  if (!['permiso', 'ejecutar'].includes(String(e.nivel_al_conceder))) {
    return _fallo(MOTIVOS.NIVEL_CONSERVADOR, [], ['nivel_al_conceder'], { nivel_al_conceder: e.nivel_al_conceder });
  }

  const proyecto = String(e.proyecto).trim();
  const cuenta = casillas.normalizar_cuenta(e.cuenta);
  const rol = String(e.rol).trim();
  const huella = casillas.huella({ proyecto, cuenta, accion: v.accion, rol });
  if (!huella) return _fallo(MOTIVOS.ACCION_SIN_CASILLA, [], ['accion']);

  // Caducidad: la que traigan o la de por defecto; con techo en los dos casos.
  let caduca_en = e.caduca_en;
  if (caduca_en === undefined || caduca_en === null) {
    const pedidos = Number(e.ttl_segundos);
    const ttl = Number.isFinite(pedidos) && pedidos > 0
      ? Math.min(TTL_MAXIMO_SEGUNDOS, pedidos)
      : TTL_POR_DEFECTO_SEGUNDOS;
    caduca_en = ritmo.desplazar(e.momento, ttl / 60);
  }
  if (!es_instante(caduca_en)) return _fallo(MOTIVOS.CADUCIDAD_INVALIDA, [], ['caduca_en'], { caduca_en });
  if (!ritmo.antes_de(e.momento, caduca_en)) {
    return _fallo(MOTIVOS.CADUCIDAD_INVALIDA, [], ['caduca_en'], { pedida_en: e.momento, caduca_en });
  }
  const segundos = Math.round((Date.parse(caduca_en) - Date.parse(e.momento)) / 1000);
  if (segundos > TTL_MAXIMO_SEGUNDOS) {
    return _fallo(MOTIVOS.CADUCIDAD_INVALIDA, [], ['caduca_en'],
      { caduca_en, segundos, tope_segundos: TTL_MAXIMO_SEGUNDOS });
  }

  // Una pregunta viva por huella. Se devuelve la que hay y no se escribe nada.
  const viva = estado.confirmaciones.find((c) => c && c.estado === 'pendiente' && c.huella === huella);
  if (viva) {
    return {
      ok: true,
      estado: null,
      confirmacion: clonar(viva),
      confirmacion_id: viva.confirmacion_id,
      pedida: false,
      reutilizada: true,
      motivo: MOTIVOS.YA_HAY_PENDIENTE,
      caduca_en: viva.caduca_en
    };
  }

  const sello = crear_sello({
    proyecto,
    cuenta,
    aparato: e.aparato,
    momento: e.momento,
    quien: e.quien
  });
  if (!sello.ok) return _fallo('sin_sello', sello.faltan, sello.invalidos);

  const confirmacion_id = texto_no_vacio(e.confirmacion_id)
    ? String(e.confirmacion_id).trim()
    : _id_de(e.momento, huella);

  if (_buscar(estado, confirmacion_id)) {
    return _fallo(MOTIVOS.YA_HAY_PENDIENTE, [], ['confirmacion_id'], { confirmacion_id });
  }

  const confirmacion = {
    confirmacion_id,
    proyecto,
    cuenta,
    accion: v.accion,
    rol,
    huella,
    casilla: clonar(v.casilla),
    nivel_al_conceder: String(e.nivel_al_conceder),
    motivo: texto_no_vacio(e.motivo)
      ? String(e.motivo).trim()
      : `el puente quiere ${v.accion} en ${cuenta} y necesita un si`,
    pedida_en: e.momento,
    caduca_en,
    ttl_segundos: segundos,
    estado: 'pendiente',
    respuesta: null,
    canal: texto_no_vacio(e.canal) ? String(e.canal).trim() : 'adaptador-confirmacion',
    intentos: 0,
    ultimo_intento: null,
    ultimo_error: null,
    sello: sello.sello,
    historia: [{ tipo: 'pedida', momento: e.momento, quien: String(e.quien), canal: texto_no_vacio(e.canal) ? String(e.canal) : 'adaptador-confirmacion' }]
  };

  const nuevo = _siguiente(estado, {
    confirmaciones: estado.confirmaciones.concat([confirmacion]),
    actualizado: e.momento
  });

  return {
    ok: true,
    estado: nuevo,
    confirmacion: clonar(confirmacion),
    confirmacion_id,
    pedida: true,
    reutilizada: false,
    caduca_en
  };
}

/**
 * Anota un intento fallido de preguntar por el canal (el adaptador no pudo
 * entregar el mensaje). NO resuelve nada: la pregunta sigue pendiente hasta que
 * una persona contesta o caduca.
 *
 * `momento` es OPCIONAL a proposito: cuando el canal no contesta ni dice cuando
 * fallo, no hay momento que apuntar y no se inventa uno (nada de poner
 * `pedida_en` y hacer pasar la pregunta por el fallo). Se anota el intento y se
 * queda `ultimo_intento: null`.
 */
function marcar_intento(estado, entrada) {
  if (!es_estado(estado)) return _fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const e = es_objeto(entrada) ? entrada : {};
  if (!texto_no_vacio(e.confirmacion_id)) return _fallo(MOTIVOS.ENTRADA_INVALIDA, ['confirmacion_id'], []);
  if (e.momento !== undefined && e.momento !== null && !es_instante(e.momento)) {
    return _fallo(MOTIVOS.ENTRADA_INVALIDA, [], ['momento']);
  }
  const momento = es_instante(e.momento) ? e.momento : null;

  const i = estado.confirmaciones.findIndex((c) => c && c.confirmacion_id === String(e.confirmacion_id));
  if (i === -1) return _fallo(MOTIVOS.CONFIRMACION_DESCONOCIDA, [], ['confirmacion_id']);
  const previa = estado.confirmaciones[i];
  if (previa.estado !== 'pendiente') {
    return { ok: true, estado: null, confirmacion: clonar(previa), anotado: false, motivo: MOTIVOS.YA_RESUELTA };
  }

  const error = texto_no_vacio(e.error) ? String(e.error).trim() : 'no_se_pudo_preguntar';
  const actualizada = Object.assign(clonar(previa), {
    intentos: (Number(previa.intentos) || 0) + 1,
    ultimo_intento: momento,
    ultimo_error: error,
    historia: (previa.historia || []).concat([
      { tipo: 'intento_fallido', momento, error }
    ])
  });

  const confirmaciones = estado.confirmaciones.slice();
  confirmaciones[i] = actualizada;

  return {
    ok: true,
    estado: _siguiente(estado, { confirmaciones, actualizado: momento }),
    confirmacion: clonar(actualizada),
    anotado: true
  };
}

// ---------------------------------------------------------------------------
// responder
// ---------------------------------------------------------------------------

/**
 * La respuesta del dueno. UNICA entrada de un si, venga del canal o del RPC.
 *
 * @param {object} estado
 * @param {{confirmacion_id:string, decision:'si'|'no', quien:string,
 *          momento:string, referencia:string, via?:'puerta'|'canal',
 *          silencio?:boolean}} entrada
 */
function responder(estado, entrada) {
  if (!es_estado(estado)) return _fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const e = es_objeto(entrada) ? entrada : {};

  if (!texto_no_vacio(e.confirmacion_id)) return _fallo(MOTIVOS.ENTRADA_INVALIDA, ['confirmacion_id'], []);

  const i = estado.confirmaciones.findIndex((c) => c && c.confirmacion_id === String(e.confirmacion_id));
  if (i === -1) {
    // Una respuesta a una pregunta que no existe NO crea nada. Jamas.
    return _fallo(MOTIVOS.CONFIRMACION_DESCONOCIDA, [], ['confirmacion_id'], { confirmacion_id: e.confirmacion_id });
  }
  const previa = estado.confirmaciones[i];

  // Un segundo si no vuelve a autorizar: la pregunta ya se contesto.
  if (previa.estado !== 'pendiente') {
    return {
      ok: true,
      estado: null,
      confirmacion: clonar(previa),
      autoriza: false,
      motivo: MOTIVOS.YA_RESUELTA,
      estado_previo: previa.estado
    };
  }

  // El silencio no es un si: si no hay decision, no hay respuesta.
  if (e.silencio === true) return _fallo(MOTIVOS.SILENCIO_NO_ES_SI, [], ['decision'], { silencio: true });
  if (!DECISIONES.includes(String(e.decision))) {
    return _fallo(MOTIVOS.RESPUESTA_NO_DECLARADA, ['decision'], [], { decision: e.decision === undefined ? null : e.decision });
  }

  if (!QUIENES.includes(String(e.quien)) || String(e.quien) !== 'dueno') {
    return _fallo(MOTIVOS.EXIGE_PERSONA, [], ['quien'], { quien: e.quien === undefined ? null : e.quien });
  }
  if (!texto_no_vacio(e.referencia)) return _fallo(MOTIVOS.SIN_REFERENCIA, ['referencia'], []);
  if (!es_instante(e.momento)) return _fallo(MOTIVOS.ENTRADA_INVALIDA, ['momento'], []);

  const via = texto_no_vacio(e.via) ? String(e.via) : 'puerta';
  if (!VIAS.includes(via)) return _fallo(MOTIVOS.VIA_INVALIDA, [], ['via'], { via, permitidas: VIAS.slice() });

  if (ritmo.antes_de(e.momento, previa.pedida_en)) {
    return _fallo(MOTIVOS.ANTES_DE_PREGUNTAR, [], ['momento'],
      { pedida_en: previa.pedida_en, momento: e.momento });
  }

  // ---- un si viejo es un no ---------------------------------------------
  if (ritmo.antes_de(previa.caduca_en, e.momento)) {
    const caducada = Object.assign(clonar(previa), {
      estado: 'caducada',
      respuesta: null,
      historia: (previa.historia || []).concat([
        { tipo: 'caducada', momento: e.momento, motivo: MOTIVOS.SI_CADUCADO, caduca_en: previa.caduca_en }
      ])
    });
    const confirmaciones = estado.confirmaciones.slice();
    confirmaciones[i] = caducada;
    return {
      ok: true,
      estado: _siguiente(estado, { confirmaciones, actualizado: e.momento }),
      confirmacion: clonar(caducada),
      autoriza: false,
      motivo: MOTIVOS.SI_CADUCADO,
      caduca_en: previa.caduca_en,
      respuesta_momento: e.momento,
      nota: 'la respuesta llego despues de la caducidad: cuenta como no'
    };
  }

  const decision = String(e.decision);
  const respuesta = {
    decision,
    quien: String(e.quien),
    momento: e.momento,
    referencia: String(e.referencia).trim(),
    via
  };

  const resuelta = Object.assign(clonar(previa), {
    estado: decision === 'si' ? 'autorizada' : 'denegada',
    respuesta,
    historia: (previa.historia || []).concat([
      { tipo: decision === 'si' ? 'autorizada' : 'denegada', momento: e.momento, quien: String(e.quien), via }
    ])
  });

  const confirmaciones = estado.confirmaciones.slice();
  confirmaciones[i] = resuelta;
  const nuevo = _siguiente(estado, { confirmaciones, actualizado: e.momento });

  if (decision === 'no') {
    return {
      ok: true,
      estado: nuevo,
      confirmacion: clonar(resuelta),
      autoriza: false,
      motivo: MOTIVOS.RESPUESTA_NO
    };
  }

  // El paquete listo para Q5. La puerta no lo anota: lo anota el custodio de
  // autorizaciones, y solo si esto es un si de verdad.
  return {
    ok: true,
    estado: nuevo,
    confirmacion: clonar(resuelta),
    autoriza: true,
    autorizacion: {
      proyecto: resuelta.proyecto,
      cuenta: resuelta.cuenta,
      accion: resuelta.accion,
      rol: resuelta.rol,
      huella: resuelta.huella,
      casilla: clonar(resuelta.casilla),
      nivel_al_conceder: resuelta.nivel_al_conceder,
      via,
      quien: 'dueno',
      referencia: respuesta.referencia,
      confirmacion_id: resuelta.confirmacion_id,
      respuesta_momento: e.momento,
      momento: e.momento,
      aparato: resuelta.sello ? resuelta.sello.aparato : null,
      caduca_en: resuelta.caduca_en
    }
  };
}

// ---------------------------------------------------------------------------
// vencer (el silencio)
// ---------------------------------------------------------------------------

/**
 * Pasa a `caducada` toda pregunta que nadie contesto antes de su caducidad.
 *
 * Esta funcion es la prueba literal de la regla: recorre lo pendiente, escribe
 * `caducada` y `respuesta: null`, y devuelve `autoriza: false`. No hay ninguna
 * rama que escriba `autorizada` con una pregunta sin respuesta.
 */
function vencer(estado, entrada) {
  if (!es_estado(estado)) return _fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const e = es_objeto(entrada) ? entrada : {};
  if (!es_instante(e.momento)) return _fallo(MOTIVOS.ENTRADA_INVALIDA, ['momento'], []);

  const caducadas = [];
  const confirmaciones = estado.confirmaciones.map((c) => {
    if (!c || c.estado !== 'pendiente') return c;
    if (!ritmo.antes_de(e.momento, c.caduca_en)) {
      caducadas.push(c.confirmacion_id);
      return Object.assign(clonar(c), {
        estado: 'caducada',
        respuesta: null,
        historia: (c.historia || []).concat([
          { tipo: 'caducada', momento: e.momento, motivo: 'silencio', caduca_en: c.caduca_en }
        ])
      });
    }
    return c;
  });

  if (caducadas.length === 0) {
    return { ok: true, estado: null, caducadas: [], cuantas: 0, autoriza: false };
  }

  return {
    ok: true,
    estado: _siguiente(estado, { confirmaciones, actualizado: e.momento }),
    caducadas,
    cuantas: caducadas.length,
    autoriza: false,
    motivo: 'el_silencio_no_es_si'
  };
}

// ---------------------------------------------------------------------------
// lecturas
// ---------------------------------------------------------------------------

function consultar(estado, consulta) {
  if (!es_estado(estado)) return _fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const c = es_objeto(consulta) ? consulta : {};
  if (!texto_no_vacio(c.confirmacion_id)) return _fallo(MOTIVOS.ENTRADA_INVALIDA, ['confirmacion_id'], []);
  const confirmacion = _buscar(estado, c.confirmacion_id);
  if (!confirmacion) return _fallo(MOTIVOS.CONFIRMACION_DESCONOCIDA, [], ['confirmacion_id'], { confirmacion_id: c.confirmacion_id });
  return { ok: true, confirmacion: clonar(confirmacion), confirmacion_id: confirmacion.confirmacion_id };
}

function pendientes(estado, filtro) {
  if (!es_estado(estado)) return _fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const f = es_objeto(filtro) ? filtro : {};
  const proyecto = texto_no_vacio(f.proyecto) ? String(f.proyecto).trim() : null;
  const cuenta = texto_no_vacio(f.cuenta) ? casillas.normalizar_cuenta(f.cuenta) : null;
  const momento = es_instante(f.momento) ? f.momento : null;

  const filas = estado.confirmaciones.filter((c) => {
    if (!c || c.estado !== 'pendiente') return false;
    if (proyecto && c.proyecto !== proyecto) return false;
    if (cuenta && c.cuenta !== cuenta) return false;
    if (momento && !ritmo.antes_de(momento, c.caduca_en)) return false; // ya no esta viva
    return true;
  });

  return { ok: true, confirmaciones: filas.map(clonar), total: filas.length, proyecto, cuenta };
}

// ---------------------------------------------------------------------------
// auditoria
// ---------------------------------------------------------------------------

function auditar(estado) {
  const problemas = [];
  if (!es_estado(estado)) {
    return { ok: false, problemas: [{ ruta: '(raiz)', motivo: MOTIVOS.ESQUEMA_DESCONOCIDO }] };
  }

  for (const h of noSecretos.detectar_secreto(estado)) {
    problemas.push({ ruta: h.ruta, motivo: 'secreto', familia: h.familia });
  }

  const vistos = new Set();
  estado.confirmaciones.forEach((c, i) => {
    const ruta = `confirmaciones[${i}]`;
    if (!es_objeto(c)) {
      problemas.push({ ruta, motivo: 'confirmacion_no_es_objeto' });
      return;
    }
    if (!validar_sello(c.sello).ok) problemas.push({ ruta: `${ruta}.sello`, motivo: 'sin_sello' });
    if (!texto_no_vacio(c.confirmacion_id)) {
      problemas.push({ ruta: `${ruta}.confirmacion_id`, motivo: 'sin_confirmacion_id' });
    } else {
      if (vistos.has(c.confirmacion_id)) problemas.push({ ruta: `${ruta}.confirmacion_id`, motivo: 'confirmacion_duplicada' });
      vistos.add(c.confirmacion_id);
    }

    if (!ESTADOS.includes(String(c.estado))) {
      problemas.push({ ruta: `${ruta}.estado`, motivo: 'estado_no_declarado', valor: c.estado });
    }
    if (!es_instante(c.pedida_en)) problemas.push({ ruta: `${ruta}.pedida_en`, motivo: 'sin_momento' });
    if (!es_instante(c.caduca_en)) {
      problemas.push({ ruta: `${ruta}.caduca_en`, motivo: MOTIVOS.CADUCIDAD_INVALIDA });
    } else if (es_instante(c.pedida_en)) {
      const segundos = (Date.parse(c.caduca_en) - Date.parse(c.pedida_en)) / 1000;
      if (!(segundos > 0)) problemas.push({ ruta: `${ruta}.caduca_en`, motivo: MOTIVOS.CADUCIDAD_INVALIDA });
      if (segundos > TTL_MAXIMO_SEGUNDOS) {
        problemas.push({ ruta: `${ruta}.caduca_en`, motivo: MOTIVOS.CADUCIDAD_INVALIDA, segundos });
      }
    }

    const huella = casillas.huella({ proyecto: c.proyecto, cuenta: c.cuenta, accion: c.accion, rol: c.rol });
    if (huella === null) problemas.push({ ruta: `${ruta}.accion`, motivo: MOTIVOS.ACCION_SIN_CASILLA, valor: c.accion });
    else if (huella !== c.huella) problemas.push({ ruta: `${ruta}.huella`, motivo: 'huella_no_corresponde' });

    if (c.estado === 'pendiente' && c.respuesta !== null && c.respuesta !== undefined) {
      problemas.push({ ruta: `${ruta}.respuesta`, motivo: 'pendiente_con_respuesta' });
    }
    if (c.estado === 'autorizada') {
      const r = c.respuesta;
      if (!es_objeto(r) || r.decision !== 'si') {
        problemas.push({ ruta: `${ruta}.respuesta`, motivo: 'autorizada_sin_si' });
      } else {
        if (r.quien !== 'dueno') problemas.push({ ruta: `${ruta}.respuesta.quien`, motivo: MOTIVOS.EXIGE_PERSONA, valor: r.quien });
        if (!texto_no_vacio(r.referencia)) problemas.push({ ruta: `${ruta}.respuesta.referencia`, motivo: MOTIVOS.SIN_REFERENCIA });
        if (!es_instante(r.momento)) problemas.push({ ruta: `${ruta}.respuesta.momento`, motivo: 'sin_momento' });
        if (!VIAS.includes(String(r.via))) problemas.push({ ruta: `${ruta}.respuesta.via`, motivo: MOTIVOS.VIA_INVALIDA, valor: r.via });
        if (es_instante(r.momento) && es_instante(c.caduca_en) && ritmo.antes_de(c.caduca_en, r.momento)) {
          problemas.push({ ruta: `${ruta}.respuesta.momento`, motivo: MOTIVOS.SI_CADUCADO });
        }
      }
    }
    if (c.estado === 'caducada') {
      const r = c.respuesta;
      if (es_objeto(r) && r.decision === 'si') {
        problemas.push({ ruta: `${ruta}.respuesta`, motivo: 'silencio_anotado_como_si' });
      }
    }
    if (c.estado === 'denegada') {
      const r = c.respuesta;
      if (!es_objeto(r) || r.decision !== 'no') problemas.push({ ruta: `${ruta}.respuesta`, motivo: 'denegada_sin_no' });
    }
  });

  return { ok: problemas.length === 0, problemas };
}

function describir() {
  return {
    esquema: ESQUEMA,
    estados: ESTADOS.slice(),
    vias: VIAS.slice(),
    ttl_por_defecto_segundos: TTL_POR_DEFECTO_SEGUNDOS,
    ttl_maximo_segundos: TTL_MAXIMO_SEGUNDOS,
    regla: 'un si viejo es un no; el silencio no es si'
  };
}

module.exports = {
  MOTIVOS,
  ESQUEMA,
  ALMACEN,
  ESTADOS,
  DECISIONES,
  VIAS,
  TTL_POR_DEFECTO_SEGUNDOS,
  TTL_MAXIMO_SEGUNDOS,
  estado_vacio,
  es_estado,
  pedir,
  marcar_intento,
  responder,
  vencer,
  consultar,
  pendientes,
  auditar,
  describir
};

module.exports.PuertaDeConfirmacion = Object.freeze({
  estado_vacio,
  es_estado,
  pedir,
  marcar_intento,
  responder,
  vencer,
  consultar,
  pendientes,
  auditar
});

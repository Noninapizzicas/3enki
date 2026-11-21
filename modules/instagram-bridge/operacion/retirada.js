'use strict';

/**
 * retirada — L3 · RetiradaDePublicacion · PUENTE.
 *
 * Retirar, corregir o borrar algo ya publicado. Las tres son la misma cosa vista
 * desde fuera: **lo que ya se vio, no se des-ve**. Se pueden restaurar los
 * pixels, no la notificacion que ya salio, ni lo que alguien ya leyo.
 *
 * LA REGLA DEL BLOQUE, Y COMO SE HACE EJECUTABLE:
 *   **retirar pasa por PERMISO aunque el nivel declarado sea «ejecutar»**. Un
 *   nivel alto es una autorizacion para OPERAR (publicar, contestar, leer), no
 *   un cheque en blanco para DESHACER: el dueno que dejo el puente en «ejecutar»
 *   no estaba diciendo "y si algo salio mal, borralo tu mismo sin preguntarme".
 *   Aqui eso no es un comentario: **antes de preguntar a Q6 se le pone TECHO al
 *   nivel (`nivel_con_techo`)**, y el techo es `permiso`. Q6 sigue decidiendo
 *   (casilla, rol, historial, autorizacion, ventana), pero ya no puede decir
 *   "adelante" por la via del nivel: la unica forma de que el dictamen sea
 *   `ejecutar` es que haya una autorizacion real de una persona.
 *
 *   Un techo no es una segunda politica: no inventa reglas ni firma permisos,
 *   solo IMPIDE que el nivel declarado compre una accion que no es de su orden.
 *   Si Q6 dice que no, es que no.
 *
 * LOS PASOS, EN ESTE ORDEN (el orden es la mitad de la pieza):
 *   1. **Forma.** Pieza publicada con su sello de cuenta y su referencia. Sin
 *      sello no hay a que retirar: no se retira lo que no se sabe de quien es.
 *   2. **Permiso (Q6, con techo).** Sin dictamen `ejecutar` no se toca nada.
 *   3. **Respaldo de lo que habia, ANTES.** Despues de retirar ya no se podra
 *      mirar: o se guarda antes, o se pierde. Si el respaldo no se puede
 *      guardar, NO SE RETIRA. Quedarse sin la prueba de lo que habia es peor
 *      que no haber retirado: lo primero se arregla publicando otra vez, lo
 *      segundo no se arregla nunca.
 *   4. **La mano.** Se compone la orden y se le entrega a `mano.ejecutar`. Este
 *      modulo no ejecuta: no tiene receta, no tiene aparato, no sabe pulsar.
 *   5. **Verificacion.** "Ya no esta" es una consecuencia OBSERVABLE, no una
 *      suposicion: la afirma el verificador (O), no la mano.
 *   6. **Evidencia del resultado (O3).** Con su veredicto y con el `ancla` que
 *      apunta al respaldo. Si el registro falla, se dice: la retirada ocurrio y
 *      su registro no, y eso el dueno tiene que saberlo.
 *
 * A5, TAL CUAL: si el paso de la mano falla, **no se reintenta**. Un reintento
 * a ciegas de algo que cambio el mundo es como se publica dos veces y como se
 * borra lo que no era. Se va a `revision`: una persona mira, y decide.
 *
 * LO QUE ESTA PIEZA NO HACE: no concede permisos (Q6), no ejecuta (la mano), no
 * verifica (O), no guarda (O3 y el respaldo). Compone. Si falta un puerto,
 * devuelve `sin_puerto` nombrando cual: un puente sin mano que dice "hecho" es
 * una mentira con buena sintaxis.
 *
 * Sin reloj propio (`momento` entra en la orden) y sin estado: no recuerda nada
 * entre llamadas.
 */

const crypto = require('crypto');

const { es_objeto, es_instante, texto_no_vacio, clonar, validar_sello_de_cuenta } = require('../core/formas');

const OPERACIONES = Object.freeze(['retirar', 'corregir', 'borrar']);

/**
 * Toda operacion de esta pieza cae en la MISMA casilla: `borrar`. Retirar del
 * feed, corregir lo publicado y borrar son las tres irreversibles y visibles,
 * porque la notificacion ya salio en las tres. La casilla no se elige por el
 * verbo que use el dueno, sino por lo que ya paso en el mundo.
 */
const ACCION_DE_CASILLA = Object.freeze({ retirar: 'borrar', corregir: 'borrar', borrar: 'borrar' });

const VEREDICTOS = Object.freeze(['retirada', 'no_retirada', 'revision']);

// El techo. Ni el dueno ni el nivel pueden saltarselo: es la regla del bloque.
const ESCALERA = Object.freeze(['borrador', 'permiso', 'ejecutar']);
const TECHO = 'permiso';

const MOTIVOS = Object.freeze({
  ENTRADA_INVALIDA: 'entrada_invalida',
  OPERACION_DESCONOCIDA: 'operacion_desconocida',
  SIN_PIEZA: 'sin_pieza',
  SIN_REFERENCIA: 'sin_referencia',
  SIN_SELLO_DE_CUENTA: 'sin_sello_de_cuenta',
  PROYECTO_AJENO: 'proyecto_ajeno',
  SIN_MOMENTO: 'sin_momento',
  SIN_CAMBIO: 'sin_cambio',
  SIN_PUERTO: 'sin_puerto',
  PERMISO_NO_CONSULTABLE: 'permiso_no_consultable',
  EXIGE_PERMISO: 'retirada_exige_permiso',
  NIVEL_BORRADOR: 'nivel_conservador_no_retira',
  PERMISO_DENEGADO: 'permiso_denegado',
  SIN_RESPALDO: 'sin_respaldo_previo',
  PASO_FALLIDO: 'paso_fallido',
  SIN_VERIFICADOR: 'sin_verificador',
  NO_SE_OBSERVO: 'no_se_observo_que_ya_no_esta',
  EVIDENCIA_NO_GUARDADA: 'evidencia_no_guardada'
});

// ---------------------------------------------------------------------------
// techo del nivel
// ---------------------------------------------------------------------------

/**
 * Rebaja el nivel declarado al techo de la retirada. Acepta la forma corta
 * (`'ejecutar'`) y la declaracion de Q3 (`{nivel, quien, vigente_hasta}`); los
 * demas campos se copian tal cual, porque la declaracion la valida Q6 y no
 * nosotros. Aqui solo se BAJA el nivel: nunca se sube.
 *
 * La forma corta no trae declarante ni cuenta, y Q3 no admite ninguna de las
 * dos ausencias. Se le ponen el rol de quien firma la ORDEN (`declarante`) y el
 * ambito de la pieza: no se inventa un dueno ni una cuenta. Si el que firma es
 * el agente, Q3 lo rebaja solo, y esa rebaja es la correcta. Una declaracion
 * completa NUNCA se reescribe: si viene con otra cuenta, Q3 la rechaza, y eso
 * es asunto suyo, no nuestro.
 *
 * @param {*} declaracion
 * @param {'dueno'|'agente'|'sistema'} [declarante]
 * @param {{cuenta?:string, proyecto?:string}} [ambito]
 * @returns {object} declaracion con `nivel <= 'permiso'`
 */
function nivel_con_techo(declaracion, declarante, ambito) {
  const objeto = es_objeto(declaracion);
  const d = objeto ? Object.assign({}, declaracion) : { nivel: declaracion };
  const a = es_objeto(ambito) ? ambito : {};
  if (!objeto && texto_no_vacio(declarante)) d.quien = String(declarante).trim();
  if (d.cuenta === undefined && texto_no_vacio(a.cuenta)) d.cuenta = String(a.cuenta).trim();
  if (d.proyecto === undefined && texto_no_vacio(a.proyecto)) d.proyecto = String(a.proyecto).trim();
  const declarado = ESCALERA.includes(String(d.nivel)) ? String(d.nivel) : 'borrador';
  const indice = Math.min(ESCALERA.indexOf(declarado), ESCALERA.indexOf(TECHO));
  return Object.assign(d, { nivel: ESCALERA[indice] });
}

// ---------------------------------------------------------------------------
// utilidades
// ---------------------------------------------------------------------------

function no_retirada(motivo, extra) {
  return Object.assign({
    ok: false,
    estado: 'no_retirada',
    veredicto: 'no_retirada',
    motivo,
    reintentable: false,
    retirada: false
  }, extra || {});
}

function a_revision(motivo, extra) {
  return Object.assign({
    ok: false,
    estado: 'revision',
    veredicto: 'revision',
    motivo,
    reintentable: false,
    paso_a_revision: true,
    retirada: false
  }, extra || {});
}

function id_de(pieza) {
  if (!es_objeto(pieza)) return null;
  for (const campo of ['referencia', 'publicacion_id', 'media_id', 'id']) {
    if (texto_no_vacio(pieza[campo])) return String(pieza[campo]).trim();
  }
  return null;
}

/** `request_id` valido para O3 (solo [A-Za-z0-9_-], maximo 120). */
function request_id_de(prefijo, momento, huella) {
  const hash = crypto.createHash('sha256').update(`${prefijo}|${momento}|${huella}`, 'utf8').digest('hex').slice(0, 16);
  return `${prefijo}-${hash}`;
}

function nivel_de(declaracion) {
  if (declaracion === undefined || declaracion === null) return null;
  if (es_objeto(declaracion)) return declaracion.nivel === undefined ? null : declaracion.nivel;
  return declaracion;
}

// ---------------------------------------------------------------------------
// la clase
// ---------------------------------------------------------------------------

class RetiradaDePublicacion {
  /**
   * @param {{permiso?:object, respaldo?:object, evidencia?:object, mano?:object,
   *          verificador?:object}} [puertos]
   *   `permiso`     Q6:  `decidir(peticion)`.
   *   `respaldo`    el estado de lo publicado, ANTES: `conservar(snapshot)`.
   *   `mano`        A3:  `ejecutar(accion)`.
   *   `verificador` O:   `comprobar(postcondicion)`.
   *   `evidencia`   O3:  `guardar(entrada)`.
   */
  constructor(puertos = {}) {
    const p = es_objeto(puertos) ? puertos : {};
    this.permiso = p.permiso || null;
    this.respaldo = p.respaldo || null;
    this.mano = p.mano || null;
    this.verificador = p.verificador || null;
    this.evidencia = p.evidencia || null;
  }

  /** ¿Estan los puertos sin los que una retirada no se puede ni empezar? */
  faltan_puertos() {
    const faltan = [];
    if (!this.permiso || typeof this.permiso.decidir !== 'function') faltan.push('permiso');
    if (!this.respaldo || typeof this.respaldo.conservar !== 'function') faltan.push('respaldo');
    if (!this.mano || typeof this.mano.ejecutar !== 'function') faltan.push('mano');
    if (!this.evidencia || typeof this.evidencia.guardar !== 'function') faltan.push('evidencia');
    return faltan;
  }

  retirar(orden) { return this._ejecutar('retirar', orden); }

  corregir(orden) { return this._ejecutar('corregir', orden); }

  borrar(orden) { return this._ejecutar('borrar', orden); }

  /**
   * El unico camino. Las tres operaciones hacen exactamente los mismos pasos
   * con distinto verbo: si `corregir` se saltara un paso, seria la puerta de
   * atras de `retirar`.
   */
  async _ejecutar(operacion, orden) {
    const pasos = [];
    const anota = (nombre, resultado, motivo) => pasos.push({
      paso: pasos.length + 1,
      nombre,
      resultado,
      motivo: motivo === undefined ? null : motivo
    });

    // ---- 0 · forma -------------------------------------------------------
    if (!OPERACIONES.includes(operacion)) {
      return no_retirada(MOTIVOS.OPERACION_DESCONOCIDA, { operacion, admitidas: OPERACIONES.slice(), pasos });
    }
    const o = es_objeto(orden) ? orden : {};
    const pieza = es_objeto(o.pieza) ? o.pieza : (es_objeto(o.pieza_publicada) ? o.pieza_publicada : null);
    if (!pieza) return no_retirada(MOTIVOS.SIN_PIEZA, { faltan: ['pieza'], pasos });

    const referencia = id_de(pieza);
    if (!referencia) return no_retirada(MOTIVOS.SIN_REFERENCIA, { faltan: ['referencia'], pasos });

    const v = validar_sello_de_cuenta(pieza.sello);
    if (!v.ok) {
      return no_retirada(MOTIVOS.SIN_SELLO_DE_CUENTA, {
        faltan: v.faltan.map((f) => `sello.${f}`),
        invalidos: v.invalidos.map((f) => `sello.${f}`),
        pasos
      });
    }
    const sello = pieza.sello;

    if (texto_no_vacio(pieza.proyecto) && String(pieza.proyecto).trim() !== String(sello.proyecto).trim()) {
      // P2/P3: una pieza no se retira desde un proyecto que no es el suyo.
      return no_retirada(MOTIVOS.PROYECTO_AJENO, { proyecto: pieza.proyecto, sello_proyecto: sello.proyecto, pasos });
    }

    if (!es_instante(o.momento)) return no_retirada(MOTIVOS.SIN_MOMENTO, { faltan: ['momento'], pasos });

    const cambio = o.cambio === undefined ? null : o.cambio;
    if (operacion === 'corregir' && (cambio === null || cambio === '' || (es_objeto(cambio) && Object.keys(cambio).length === 0))) {
      return no_retirada(MOTIVOS.SIN_CAMBIO, { faltan: ['cambio'], pasos });
    }

    const faltan = this.faltan_puertos();
    if (faltan.length > 0) return no_retirada(MOTIVOS.SIN_PUERTO, { faltan, pasos });

    anota('forma', 'ocurrio');

    // ---- 1 · permiso, con techo -----------------------------------------
    const accion = ACCION_DE_CASILLA[operacion];
    const declarado = o.nivel === undefined ? null : o.nivel;
    const rol = texto_no_vacio(o.rol) ? String(o.rol).trim() : 'agente';
    const conTecho = nivel_con_techo(declarado === null ? 'borrador' : declarado, rol, {
      cuenta: String(sello.cuenta).trim(),
      proyecto: String(sello.proyecto).trim()
    });

    const peticion = {
      proyecto: String(sello.proyecto).trim(),
      cuenta: String(sello.cuenta).trim(),
      rol,
      accion,
      nivel: conTecho,
      momento: o.momento
    };
    if (o.historial !== undefined) peticion.historial = o.historial;
    if (o.autorizacion !== undefined && o.autorizacion !== null) peticion.autorizacion = o.autorizacion;

    let q6;
    try {
      q6 = await this.permiso.decidir(peticion);
    } catch (err) {
      return no_retirada(MOTIVOS.PERMISO_NO_CONSULTABLE, { detalle: err && err.message, pasos });
    }
    if (!es_objeto(q6) || q6.ok !== true) {
      return no_retirada(MOTIVOS.PERMISO_NO_CONSULTABLE, { motivo_de_q6: es_objeto(q6) ? q6.motivo : null, pasos });
    }

    const techo = {
      nivel_declarado: nivel_de(declarado),
      nivel_efectivo: conTecho.nivel,
      rebajado: String(nivel_de(declarado)) !== conTecho.nivel
    };

    if (q6.dictamen !== 'ejecutar') {
      anota('permiso', q6.dictamen, q6.motivo);
      const motivo = q6.dictamen === 'permiso' ? MOTIVOS.EXIGE_PERMISO
        : (q6.dictamen === 'borrador' ? MOTIVOS.NIVEL_BORRADOR : MOTIVOS.PERMISO_DENEGADO);
      return no_retirada(motivo, {
        dictamen: q6.dictamen,
        motivo_de_q6: q6.motivo,
        falta: q6.dictamen === 'permiso'
          ? (peticion.autorizacion === undefined ? 'autorizacion' : (q6.motivo || 'autorizacion_valida'))
          : null,
        techo,
        exige_ventana: q6.exige_ventana === true,
        porque: q6.porque || null,
        pasos
      });
    }
    anota('permiso', 'ejecutar', q6.motivo);

    // ---- 2 · respaldo de lo que habia, ANTES -----------------------------
    const request_id = texto_no_vacio(o.request_id)
      ? String(o.request_id).trim()
      : request_id_de('ret', o.momento, `${sello.proyecto}|${sello.cuenta}|${referencia}`);

    const snapshot = {
      referencia,
      proyecto: sello.proyecto,
      cuenta: sello.cuenta,
      sello,
      momento: o.momento,
      publicado_en: pieza.publicado_en === undefined ? null : pieza.publicado_en,
      texto: pieza.texto === undefined ? null : pieza.texto,
      adjuntos: Array.isArray(pieza.adjuntos) ? clonar(pieza.adjuntos) : [],
      operacion,
      cambio: cambio === null ? null : clonar(cambio),
      respaldo_id: request_id_de('resp', o.momento, referencia)
    };

    let r_respaldo;
    try {
      r_respaldo = await this.respaldo.conservar(snapshot);
    } catch (err) {
      anota('respaldo', 'no_se_sabe', 'excepcion_del_puerto');
      return no_retirada(MOTIVOS.SIN_RESPALDO, {
        detalle: err && err.message,
        regla: 'sin la prueba de lo que habia, no se retira: despues ya no se podra mirar',
        techo,
        pasos
      });
    }
    if (!es_objeto(r_respaldo) || r_respaldo.ok !== true) {
      anota('respaldo', 'no_ocurrio', es_objeto(r_respaldo) ? r_respaldo.motivo : null);
      return no_retirada(MOTIVOS.SIN_RESPALDO, {
        motivo_del_respaldo: es_objeto(r_respaldo) ? r_respaldo.motivo : null,
        regla: 'sin la prueba de lo que habia, no se retira: despues ya no se podra mirar',
        techo,
        pasos
      });
    }
    const respaldo_id = texto_no_vacio(r_respaldo.respaldo_id) ? String(r_respaldo.respaldo_id) : snapshot.respaldo_id;
    anota('respaldo', 'ocurrio');

    // ---- 3 · la mano -----------------------------------------------------
    const accion_de_la_mano = {
      accion,
      operacion,
      proyecto: sello.proyecto,
      cuenta: sello.cuenta,
      sello,
      referencia,
      postcondicion: 'ya_no_esta',
      momento: o.momento
    };
    if (cambio !== null) accion_de_la_mano.cambio = cambio;

    let r_mano;
    try {
      r_mano = await this.mano.ejecutar(accion_de_la_mano);
    } catch (err) {
      anota('mano', 'no_se_sabe', 'excepcion_del_puerto');
      return a_revision(MOTIVOS.PASO_FALLIDO, {
        detalle: err && err.message,
        consecuencia: 'incierta',
        regla: 'no se reintenta un paso que cambio el mundo',
        techo,
        respaldo_id,
        pasos
      });
    }
    if (!es_objeto(r_mano) || r_mano.ok !== true) {
      anota('mano', 'no_ocurrio', es_objeto(r_mano) ? r_mano.motivo : null);
      return a_revision(MOTIVOS.PASO_FALLIDO, {
        motivo_de_la_mano: es_objeto(r_mano) ? r_mano.motivo : null,
        consecuencia: 'incierta',
        regla: 'no se reintenta un paso que cambio el mundo',
        techo,
        respaldo_id,
        pasos
      });
    }
    anota('mano', 'ocurrio');

    // ---- 4 · verificacion (O) -------------------------------------------
    if (!this.verificador || typeof this.verificador.comprobar !== 'function') {
      anota('verificacion', 'no_se_sabe', MOTIVOS.SIN_VERIFICADOR);
      return a_revision(MOTIVOS.SIN_VERIFICADOR, {
        consecuencia: 'sin_verificar',
        que_haria_falta: ['verificador'],
        techo,
        respaldo_id,
        pasos
      });
    }

    let verificacion;
    try {
      verificacion = await this.verificador.comprobar({
        postcondicion: 'ya_no_esta',
        referencia,
        proyecto: sello.proyecto,
        cuenta: sello.cuenta,
        momento: o.momento
      });
    } catch (err) {
      anota('verificacion', 'no_se_sabe', err && err.message);
      return a_revision(MOTIVOS.NO_SE_OBSERVO, { consecuencia: 'incierta', techo, respaldo_id, pasos });
    }
    if (!es_objeto(verificacion) || verificacion.ok !== true || verificacion.observado !== true) {
      anota('verificacion', 'no_ocurrio', es_objeto(verificacion) ? verificacion.motivo : null);
      return a_revision(MOTIVOS.NO_SE_OBSERVO, {
        consecuencia: 'incierta',
        verificacion: es_objeto(verificacion) ? verificacion : null,
        techo,
        respaldo_id,
        pasos
      });
    }
    anota('verificacion', 'ocurrio');

    // ---- 5 · evidencia del resultado (O3) -------------------------------
    const final = {
      request_id,
      sello,
      proyecto: sello.proyecto,
      agente: 'retirada',
      tarea: `${operacion} de ${referencia}`,
      momento: o.momento,
      veredicto: 'ocurrio',
      pasos: [{
        paso: 1,
        resultado: 'ocurrio',
        // El ancla apunta al respaldo: la prueba de lo que habia queda a un
        // salto, no en la memoria de nadie.
        prueba: { nodo_id: referencia, ancla: respaldo_id, cuenta: sello.cuenta }
      }]
    };
    let r_final;
    try {
      r_final = await this.evidencia.guardar(final);
    } catch (err) {
      r_final = { ok: false, motivo: MOTIVOS.EVIDENCIA_NO_GUARDADA, detalle: err && err.message };
    }
    const evidencia_ok = es_objeto(r_final) && r_final.ok === true;
    anota('evidencia', evidencia_ok ? 'ocurrio' : 'no_ocurrio', evidencia_ok ? null : ((r_final && r_final.motivo) || null));

    return {
      ok: true,
      estado: 'retirada',
      veredicto: 'retirada',
      retirada: true,
      operacion,
      accion_casilla: accion,
      proyecto: sello.proyecto,
      cuenta: sello.cuenta,
      referencia,
      autorizacion_id: q6.autorizacion_id === undefined ? null : q6.autorizacion_id,
      techo,
      exige_ventana: q6.exige_ventana === true,
      ventana_segundos: q6.ventana_segundos === undefined ? null : q6.ventana_segundos,
      respaldo_id,
      evidencia: {
        request_id,
        guardada: evidencia_ok,
        motivo: evidencia_ok ? null : MOTIVOS.EVIDENCIA_NO_GUARDADA
      },
      advertencia: evidencia_ok ? null : 'la retirada ocurrio y su registro no: se dice, no se esconde',
      reintentable: false,
      porque: q6.porque || null,
      pasos
    };
  }
}

/** Factory: la forma comoda para el modulo y para las pruebas. */
function crear(puertos) {
  return new RetiradaDePublicacion(puertos);
}

function describir() {
  return {
    operaciones: OPERACIONES.slice(),
    veredictos: VEREDICTOS.slice(),
    casilla: clonar(ACCION_DE_CASILLA),
    orden_de_pasos: ['forma', 'permiso', 'respaldo', 'mano', 'verificacion', 'evidencia'],
    techo_de_nivel: TECHO,
    regla: 'retirar pasa por permiso aunque el nivel declarado sea ejecutar',
    no_reintenta: true
  };
}

module.exports = {
  OPERACIONES,
  ACCION_DE_CASILLA,
  VEREDICTOS,
  ESCALERA,
  TECHO,
  MOTIVOS,
  nivel_con_techo,
  RetiradaDePublicacion,
  crear,
  describir
};

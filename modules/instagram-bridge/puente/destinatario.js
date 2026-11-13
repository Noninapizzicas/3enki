'use strict';

/**
 * destinatario — S1 · DestinatarioPrevio · REFLEJO.
 *
 * **Solo se responde a quien escribio primero.** No se abre conversacion nunca:
 * ni un saludo, ni un "te sigo", ni un mensaje a la persona que dio me gusta.
 * Un puente que puede iniciar conversacion es un canal de publicidad con la
 * cuenta del dueno, y eso no es lo que el dueno presto.
 *
 * POR QUE SE COMPRUEBA EN CADA ENVIO Y NO AL CONFIGURAR:
 * una regla que se comprueba una vez, cuando se da de alta la cuenta, no es una
 * regla: es una intencion. Entre el alta y el envio numero mil hay mil
 * ocasiones de que la conversacion cambie (se borre el mensaje, cambie el
 * hilo, se escriba desde otra cuenta). Aqui se mira la conversacion que se va a
 * contestar, en el momento de contestar.
 *
 * LAS TRES COMPROBACIONES, EN ESTE ORDEN:
 *   1. **Hay conversacion.** Sin hilo no hay a que contestar. Un destinatario
 *      suelto es una intencion de escribir a alguien, no una respuesta.
 *   2. **La abrio la otra persona.** El primer mensaje del hilo tiene que ser
 *      entrante. Si el primero es nuestro, abrimos nosotros la conversacion, y
 *      eso esta prohibido aunque despues nos hayan contestado: la respuesta que
 *      llega despues no convierte en legitimo el primer mensaje.
 *   3. **Se contesta a quien escribio, en el mismo hilo.** El destinatario tiene
 *      que ser el autor del mensaje previo (no un tercero del hilo), y el envio
 *      tiene que ir al mismo hilo y del mismo tipo (un comentario se contesta en
 *      su comentario; un mensaje directo, en su conversacion).
 *
 * LO QUE ESTA PIEZA NO HACE: no decide si el texto es apropiado (eso es S2), no
 * comprueba ritmo (G6) ni permisos (Q6), y no envia. Devuelve legitimo o
 * invalido, con el motivo nombrado y la prueba del mensaje previo, para que el
 * envio pueda auditarse despues: "se respondio a X, que escribio el <id> a las
 * <momento>". Sin esa prueba, un envio no se puede justificar.
 *
 * Puro: sin IO, sin reloj, sin estado global. El `momento` de la comprobacion,
 * si se quiere comparar, viene en la entrada.
 */

const { es_objeto, texto_no_vacio } = require('../core/formas');

const TIPOS_DE_HILO = Object.freeze(['comentario', 'dm']);

const MOTIVOS = Object.freeze({
  ENTRADA_INVALIDA: 'entrada_invalida',
  SIN_DESTINATARIO: 'sin_destinatario',
  SIN_CONVERSACION: 'sin_conversacion',
  SIN_MENSAJE_PREVIO: 'sin_mensaje_previo',
  ABRIMOS_NOSOTROS_LA_CONVERSACION: 'abrimos_nosotros_la_conversacion',
  DESTINATARIO_NO_ES_EL_AUTOR: 'destinatario_no_es_el_autor',
  HILO_DISTINTO: 'hilo_distinto',
  TIPO_DE_HILO_DESCONOCIDO: 'tipo_de_hilo_desconocido',
  MENSAJE_PREVIO_ANULADO: 'mensaje_previo_anulado'
});

// ---------------------------------------------------------------------------
// utilidades
// ---------------------------------------------------------------------------

function normalizar_handle(v) {
  if (!texto_no_vacio(v)) return null;
  return String(v).trim().replace(/^@+/, '').toLowerCase();
}

function id_de_hilo(destinatario) {
  if (!es_objeto(destinatario)) return null;
  if (texto_no_vacio(destinatario.hilo_id)) return String(destinatario.hilo_id).trim();
  if (texto_no_vacio(destinatario.conversacion_id)) return String(destinatario.conversacion_id).trim();
  return null;
}

function tipo_de(destinatario) {
  if (!es_objeto(destinatario)) return null;
  const tipo = texto_no_vacio(destinatario.tipo) ? String(destinatario.tipo).trim() : null;
  return tipo && TIPOS_DE_HILO.includes(tipo) ? tipo : null;
}

/** Los mensajes del hilo, en orden de llegada (el contrato: `mensajes`). */
function mensajes_de(conversacion) {
  if (!es_objeto(conversacion) || !Array.isArray(conversacion.mensajes)) return null;
  return conversacion.mensajes.filter(es_objeto);
}

/**
 * ¿Este mensaje lo escribio otra persona? Se acepta `direccion: 'entrante'` o,
 * si no viene, un `autor` distinto de la cuenta propia. La duda NO se resuelve
 * a favor de responder: sin direccion clara y sin autor conocido, no es previo.
 */
function es_respuesta(mensaje, cuenta) {
  if (!es_objeto(mensaje)) return false;
  if (String(mensaje.direccion) === 'entrante') return true;
  if (String(mensaje.direccion) === 'saliente') return false;
  if (!texto_no_vacio(cuenta)) return false;
  if (!texto_no_vacio(mensaje.autor)) return false;
  return normalizar_handle(mensaje.autor) !== normalizar_handle(cuenta);
}

/**
 * ¿El envio va al mismo hilo del que se recibio el mensaje?
 * Mismo id y mismo tipo: contestar un comentario por mensaje directo es abrir
 * otra conversacion con la misma persona, que es la puerta de atras de S1.
 */
function mismo_hilo(destinatario, conversacion) {
  const d = es_objeto(destinatario) ? destinatario : {};
  const c = es_objeto(conversacion) ? conversacion : {};
  const id_d = id_de_hilo(d);
  const id_c = texto_no_vacio(c.hilo_id) ? String(c.hilo_id).trim()
    : (texto_no_vacio(c.conversacion_id) ? String(c.conversacion_id).trim() : null);
  if (!id_d || !id_c || id_d !== id_c) return false;
  const t_d = tipo_de(d);
  const t_c = texto_no_vacio(c.tipo) ? String(c.tipo).trim() : null;
  if (!t_d || !t_c) return false;
  return t_d === t_c;
}

function invalido(motivo, extra) {
  return Object.assign({ ok: false, estado: 'invalido', legitimo: false, motivo }, extra || {});
}

// ---------------------------------------------------------------------------
// comprobar
// ---------------------------------------------------------------------------

/**
 * La comprobacion que se hace antes de CADA envio.
 *
 * @param {{remitente:string, tipo:'comentario'|'dm', hilo_id?:string,
 *          conversacion_id?:string, momento?:string}} destinatario
 * @param {{cuenta?:string, tipo?:string, hilo_id?:string, conversacion_id?:string,
 *          mensajes?:Array<{id?:string, autor?:string, direccion?:'entrante'|'saliente',
 *          momento?:string, texto?:string, anulado?:boolean}>}} conversacion
 * @returns {{ok:boolean, estado:'legitimo'|'invalido', legitimo:boolean, motivo?:string,
 *            prueba?:object, destinatario?:string, hilo?:object}}
 */
function comprobar(destinatario, conversacion) {
  if (!es_objeto(destinatario) || !es_objeto(conversacion)) {
    return invalido(MOTIVOS.ENTRADA_INVALIDA, { faltan: [!es_objeto(destinatario) ? 'destinatario' : null, !es_objeto(conversacion) ? 'conversacion' : null].filter(Boolean) });
  }

  const handle = normalizar_handle(destinatario.remitente || destinatario.cuenta || destinatario.handle);
  if (!handle) return invalido(MOTIVOS.SIN_DESTINATARIO, { faltan: ['remitente'] });

  // Un tipo declarado y desconocido NO se sustituye por el de la conversacion:
  // seria aceptar una orden que dice "por email" contestando por mensaje directo.
  const tipo_declarado = texto_no_vacio(destinatario.tipo) ? String(destinatario.tipo).trim() : null;
  if (tipo_declarado !== null && !TIPOS_DE_HILO.includes(tipo_declarado)) {
    return invalido(MOTIVOS.TIPO_DE_HILO_DESCONOCIDO, { declarado: tipo_declarado });
  }
  const tipo = tipo_declarado || (texto_no_vacio(conversacion.tipo) ? String(conversacion.tipo).trim() : null);
  if (!tipo || !TIPOS_DE_HILO.includes(tipo)) {
    return invalido(MOTIVOS.TIPO_DE_HILO_DESCONOCIDO, { declarado: destinatario.tipo === undefined ? null : destinatario.tipo });
  }

  const mensajes = mensajes_de(conversacion);
  if (mensajes === null) return invalido(MOTIVOS.SIN_CONVERSACION, { faltan: ['conversacion.mensajes'] });

  // ---- 2 · la abrio la otra persona --------------------------------------
  const cuenta = texto_no_vacio(conversacion.cuenta) ? conversacion.cuenta : null;
  if (mensajes.length > 0 && !es_respuesta(mensajes[0], cuenta)) {
    return invalido(MOTIVOS.ABRIMOS_NOSOTROS_LA_CONVERSACION, {
      primer_mensaje: mensajes[0].id === undefined ? null : mensajes[0].id
    });
  }

  // ---- 1 · hay mensaje previo de esa persona -----------------------------
  const previos = mensajes.filter((m) => es_respuesta(m, cuenta));
  if (previos.length === 0) {
    return invalido(MOTIVOS.SIN_MENSAJE_PREVIO, {
      regla: 'no se abre conversacion: sin mensaje previo no hay envio'
    });
  }

  const del_destinatario = previos.filter((m) => normalizar_handle(m.autor) === handle);
  if (del_destinatario.length === 0) {
    return invalido(MOTIVOS.DESTINATARIO_NO_ES_EL_AUTOR, {
      autores: previos.map((m) => (texto_no_vacio(m.autor) ? String(m.autor) : null)).filter(Boolean)
    });
  }

  const ultimo = del_destinatario[del_destinatario.length - 1];
  if (ultimo.anulado === true) {
    // El mensaje se borro: ya no hay conversacion que contestar.
    return invalido(MOTIVOS.MENSAJE_PREVIO_ANULADO, { mensaje: ultimo.id === undefined ? null : ultimo.id });
  }

  // ---- 3 · mismo hilo ----------------------------------------------------
  if (!mismo_hilo(destinatario, conversacion)) {
    return invalido(MOTIVOS.HILO_DISTINTO, {
      hilo_pedido: id_de_hilo(destinatario),
      hilo_de_la_conversacion: texto_no_vacio(conversacion.hilo_id) ? String(conversacion.hilo_id) : (conversacion.conversacion_id || null)
    });
  }

  return {
    ok: true,
    estado: 'legitimo',
    legitimo: true,
    destinatario: handle,
    hilo: { tipo, id: id_de_hilo(destinatario) },
    prueba: {
      mensaje_previo: ultimo.id === undefined ? null : ultimo.id,
      momento: texto_no_vacio(ultimo.momento) ? ultimo.momento : null,
      autor: normalizar_handle(ultimo.autor),
      abierto_por: 'tercero'
    }
  };
}

/** Azucar: la pregunta que se hace antes de enviar, en una linea. */
function hay_envio(destinatario, conversacion) {
  return comprobar(destinatario, conversacion).ok === true;
}

function describir() {
  return {
    regla: 'solo se responde a quien escribio primero',
    se_comprueba: 'antes de cada envio',
    prohibido: ['abrir_conversacion', 'escribir_primero', 'contestar_en_otro_hilo'],
    tipos_de_hilo: TIPOS_DE_HILO.slice()
  };
}

module.exports = {
  TIPOS_DE_HILO,
  MOTIVOS,
  es_respuesta,
  mismo_hilo,
  comprobar,
  hay_envio,
  describir
};

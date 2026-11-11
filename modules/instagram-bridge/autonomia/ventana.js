'use strict';

/**
 * ventana — Q4 · VentanaDeArrepentimiento · REFLEJO.
 *
 * Lo irreversible no tiene inversa, pero casi siempre tiene un RATO. La ventana
 * es ese rato: el hueco entre "decidido" y "hecho" en el que una persona todavia
 * puede decir que no sin consecuencias. Publicar espera 120 s; borrar, 180.
 *
 * TRES REGLAS QUE NO SE NEGOCIAN:
 *
 *   1. **La ventana se abre con el momento INYECTADO**, nunca con Date.now().
 *      Aqui no hay reloj: `abrir()` recibe cuando se decidio y calcula su
 *      `cierra_en` sumando los segundos de la casilla. Dos llamadas con el mismo
 *      momento dan la misma ventana, siempre.
 *
 *   2. **La ventana no se acorta por peticion.** Quien pide puede pedir MAS rato
 *      (si el momento es delicado), nunca menos: el valor efectivo es el maximo
 *      entre lo declarado en la casilla y lo pedido, con un tope duro. Acortarla
 *      es exactamente "tener menos cuidado", que es lo unico que esta pieza
 *      existe para impedir.
 *
 *   3. **Cancelar NO es fallar.** Una cancelacion es un exito del sistema: la
 *      persona ejercio el rato que se le dio. Se registra como `cancelacion`, y
 *      `es_fallo` es `false`. Confundir las dos cosas llenaria el historial de
 *      fallos que no lo son y acabaria pidiendo permisos por miedo. Solo lo que
 *      la plataforma rechaza es un fallo; lo que una persona para a tiempo es
 *      una cancelacion.
 *
 * Sin casilla no hay ventana: la accion ya no se ejecuta por Q1, y una ventana
 * para algo que no va a pasar es una mentira con forma de objeto.
 *
 * Puro: sin IO, sin reloj, sin estado global. La ventana viaja con la operacion.
 */

const { es_objeto, es_instante, texto_no_vacio, clonar } = require('../core/formas');
const casillas = require('../core/casillas');
const ritmo = require('../core/ritmo');

// Tope duro: por mucho que se pida, nadie tiene dos horas para arrepentirse de
// un comentario. Si no se cierra, el trabajo se queda colgado y la cuenta
// ocupada.
const VENTANA_MAXIMA_SEGUNDOS = 600;

const ESTADOS = Object.freeze(['abierta', 'cancelada', 'consumada']);
const RESULTADOS = Object.freeze(['cancelacion', 'consumada', 'abierta']);

const MOTIVOS = Object.freeze({
  ENTRADA_INVALIDA: 'entrada_invalida',
  ACCION_SIN_CASILLA: 'accion_sin_casilla',
  SIN_MOMENTO: 'sin_momento',
  VENTANA_CERRADA: 'ventana_cerrada',
  YA_CANCELADA: 'ya_cancelada',
  SIN_MOTIVO: 'cancelacion_sin_motivo',
  SIN_QUIEN: 'cancelacion_sin_quien',
  AUN_ABIERTA: 'aun_en_ventana'
});

/**
 * Abre la ventana de una accion.
 *
 * @param {{accion:string, momento:string, segundos?:number, operacion_id?:string,
 *          proyecto?:string, cuenta?:string, rol?:string, trabajo_id?:string}} entrada
 * @returns {{ok:boolean, ventana?:object, motivo?:string, faltan?:string[]}}
 */
function abrir(entrada) {
  const e = es_objeto(entrada) ? entrada : {};
  if (!es_instante(e.momento)) return { ok: false, motivo: MOTIVOS.SIN_MOMENTO, faltan: ['momento'] };

  const v = casillas.validar({ accion: e.accion });
  if (!v.ok) return { ok: false, motivo: v.motivo === casillas.MOTIVOS.ACCION_SIN_CASILLA ? MOTIVOS.ACCION_SIN_CASILLA : v.motivo, faltan: v.faltan };

  const declarados = Number(v.casilla.ventana_segundos) || 0;
  const pedidos = Number(e.segundos);
  const segundos = Math.min(
    VENTANA_MAXIMA_SEGUNDOS,
    Math.max(declarados, Number.isFinite(pedidos) ? Math.max(0, pedidos) : 0)
  );

  const cierra_en = ritmo.desplazar(e.momento, segundos / 60);

  return {
    ok: true,
    ventana: {
      ventana_id: _id(e),
      operacion_id: texto_no_vacio(e.operacion_id) ? String(e.operacion_id).trim() : null,
      trabajo_id: texto_no_vacio(e.trabajo_id) ? String(e.trabajo_id).trim() : null,
      proyecto: texto_no_vacio(e.proyecto) ? String(e.proyecto).trim() : null,
      cuenta: texto_no_vacio(e.cuenta) ? casillas.normalizar_cuenta(e.cuenta) : null,
      rol: texto_no_vacio(e.rol) ? String(e.rol).trim() : null,
      accion: v.accion,
      casilla: clonar(v.casilla),
      abierta_en: e.momento,
      segundos,
      segundos_declarados: declarados,
      alargada: segundos > declarados,
      cierra_en,
      exigida: v.casilla.reversibilidad === 'irreversible',
      estado: 'abierta',
      cancelada_en: null,
      cancelacion: null
    },
    porque: {
      declarados,
      pedidos: Number.isFinite(pedidos) ? pedidos : null,
      tope: VENTANA_MAXIMA_SEGUNDOS,
      regla: 'nunca menos de lo declarado'
    }
  };
}

function _id(e) {
  const partes = [
    texto_no_vacio(e.operacion_id) ? String(e.operacion_id).trim() : '',
    texto_no_vacio(e.trabajo_id) ? String(e.trabajo_id).trim() : '',
    String(e.accion || '').trim(),
    String(e.momento || '')
  ].join('|');
  const crypto = require('crypto');
  return `vt-${crypto.createHash('sha256').update(partes, 'utf8').digest('hex').slice(0, 12)}`;
}

/**
 * Estado de la ventana en un momento dado.
 *
 * @param {object} ventana
 * @param {string} momento  momento inyectado
 * @returns {'abierta'|'cancelada'|'consumada'|'desconocida'}
 */
function estado(ventana, momento) {
  if (!es_objeto(ventana)) return 'desconocida';
  if (ventana.cancelada_en !== null && ventana.cancelada_en !== undefined) return 'cancelada';
  if (!es_instante(momento) || !es_instante(ventana.cierra_en)) return 'desconocida';
  return ritmo.antes_de(momento, ventana.cierra_en) ? 'abierta' : 'consumada';
}

/** Segundos que le quedan (0 si ya cerro o no vale). */
function restante(ventana, momento) {
  if (!es_objeto(ventana) || !es_instante(momento) || !es_instante(ventana.cierra_en)) return 0;
  if (!ritmo.antes_de(momento, ventana.cierra_en)) return 0;
  // Milisegundos a mano: `minutos_entre` redondea y una ventana de 20 s daria 0.
  const quedan = Date.parse(ventana.cierra_en) - Date.parse(momento);
  return quedan > 0 ? Math.round(quedan / 1000) : 0;
}

/**
 * Cancela la ventana: la persona se arrepiente a tiempo.
 *
 * Devuelve `resultado: 'cancelacion'` y `es_fallo: false`. Ese `es_fallo` es la
 * razon de ser del fichero: el historial del puente tiene que poder distinguir
 * "no se hizo porque alguien dijo que no" de "no se pudo hacer".
 *
 * @param {object} ventana
 * @param {{momento:string, quien:string, motivo:string}} entrada
 */
function cancelar(ventana, entrada) {
  const e = es_objeto(entrada) ? entrada : {};
  if (!es_objeto(ventana)) return { ok: false, motivo: MOTIVOS.ENTRADA_INVALIDA, faltan: ['ventana'] };
  if (!es_instante(e.momento)) return { ok: false, motivo: MOTIVOS.SIN_MOMENTO, faltan: ['momento'] };
  if (!texto_no_vacio(e.quien)) return { ok: false, motivo: MOTIVOS.SIN_QUIEN, faltan: ['quien'] };
  if (!texto_no_vacio(e.motivo)) return { ok: false, motivo: MOTIVOS.SIN_MOTIVO, faltan: ['motivo'] };

  const ahora = estado(ventana, e.momento);
  if (ahora === 'cancelada') {
    return {
      ok: false,
      motivo: MOTIVOS.YA_CANCELADA,
      resultado: 'cancelacion',
      es_fallo: false,
      ventana: clonar(ventana)
    };
  }
  if (ahora !== 'abierta') {
    // Llego tarde. NO es un fallo del puente ni de la persona: es una ventana
    // que se cerro. La accion ya es irreversible y se dice tal cual.
    return {
      ok: false,
      motivo: MOTIVOS.VENTANA_CERRADA,
      resultado: 'consumada',
      es_fallo: false,
      ventana: clonar(ventana),
      nota: 'la ventana ya cerro: no hay nada que cancelar y tampoco hay fallo'
    };
  }

  const cancelada = clonar(ventana);
  cancelada.estado = 'cancelada';
  cancelada.cancelada_en = e.momento;
  cancelada.cancelacion = {
    quien: String(e.quien).trim(),
    momento: e.momento,
    motivo: String(e.motivo).trim()
  };

  return {
    ok: true,
    ventana: cancelada,
    resultado: 'cancelacion',
    es_fallo: false,
    accion: ventana.accion
  };
}

/**
 * Cierra la ventana por el lado del si: solo cuando ya paso el rato. Cerrar
 * antes seria ejecutar sin dar tiempo a arrepentirse, que es justo lo que la
 * ventana impide (el que tiene prisa espera, no adelanta).
 */
function consumar(ventana, entrada) {
  const e = es_objeto(entrada) ? entrada : {};
  if (!es_objeto(ventana)) return { ok: false, motivo: MOTIVOS.ENTRADA_INVALIDA, faltan: ['ventana'] };
  if (!es_instante(e.momento)) return { ok: false, motivo: MOTIVOS.SIN_MOMENTO, faltan: ['momento'] };

  const ahora = estado(ventana, e.momento);
  if (ahora === 'cancelada') {
    return { ok: false, motivo: MOTIVOS.YA_CANCELADA, resultado: 'cancelacion', es_fallo: false, ventana: clonar(ventana) };
  }
  if (ahora === 'abierta') {
    return {
      ok: false,
      motivo: MOTIVOS.AUN_ABIERTA,
      resultado: 'abierta',
      es_fallo: false,
      ventana: clonar(ventana),
      restante: restante(ventana, e.momento)
    };
  }
  if (ahora !== 'consumada') return { ok: false, motivo: MOTIVOS.ENTRADA_INVALIDA, resultado: 'abierta', es_fallo: false };

  const cerrada = clonar(ventana);
  cerrada.estado = 'consumada';
  cerrada.consumada_en = e.momento;
  return { ok: true, ventana: cerrada, resultado: 'consumada', es_fallo: false };
}

/**
 * El veredicto de la ventana, en una linea: que paso y si cuenta como fallo.
 * Es lo que se apunta en el historial.
 */
function resultado_de(ventana, momento) {
  const ahora = estado(ventana, momento);
  if (ahora === 'cancelada') {
    return { resultado: 'cancelacion', es_fallo: false, motivo: ventana.cancelacion && ventana.cancelacion.motivo };
  }
  if (ahora === 'consumada') return { resultado: 'consumada', es_fallo: false };
  if (ahora === 'abierta') return { resultado: 'abierta', es_fallo: false, restante: restante(ventana, momento) };
  return { resultado: 'desconocida', es_fallo: false };
}

function es_fallo(ventana, momento) {
  return resultado_de(ventana, momento).es_fallo === true;
}

function describir() {
  return {
    estados: ESTADOS.slice(),
    resultados: RESULTADOS.slice(),
    tope_segundos: VENTANA_MAXIMA_SEGUNDOS,
    regla: 'la ventana no se acorta; cancelar no es fallar'
  };
}

module.exports = {
  MOTIVOS,
  ESTADOS,
  RESULTADOS,
  VENTANA_MAXIMA_SEGUNDOS,
  abrir,
  estado,
  restante,
  cancelar,
  consumar,
  resultado_de,
  es_fallo,
  describir
};

module.exports.VentanaDeArrepentimiento = Object.freeze({
  abrir,
  estado,
  restante,
  cancelar,
  consumar,
  resultado_de,
  es_fallo
});

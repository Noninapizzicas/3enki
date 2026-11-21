'use strict';

/**
 * ritmo — G1 · PerfilDeRitmo · REFLEJO.
 *
 * Una cuenta no se quema por publicar mucho: se quema por publicar mucho DE
 * GOLPE. Este reflejo pone precio a cada tipo de accion para que el regulador
 * (G6) pueda decir "hoy ya no cabe" sin opinar. Publicar cuesta mas que leer;
 * el pulso —comprobar que la app responde— es el minimo, porque un pulso que
 * costara como una publicacion no se haria nunca.
 *
 * Reglas que esta pieza hace ejecutables:
 *   - El precio es una TABLA CERRADA. Una accion que no esta en la tabla no
 *     tiene precio, y lo que no tiene precio no se regula: se devuelve
 *     `null`/`desconocida` en vez de un numero plausible. Un coste inventado
 *     es peor que un rechazo.
 *   - El techo NO es una constante global: sale de la conservaduria de la
 *     cuenta (G5). Una cuenta nueva llega con la conservaduria maxima, y con
 *     ella el techo mas bajo. Aqui no hay "perfil por defecto comodo".
 *   - El presupuesto se mide en unidades de coste, no en acciones sueltas: asi
 *     una publicacion y cinco pulsos no se pueden confundir.
 *   - `publicaciones_al_dia` se CALCULA del techo y del coste de publicar; no se
 *     declara aparte, porque una tabla que dice dos cosas distintas sobre el
 *     mismo techo acaba mintiendo.
 *
 * Puro: sin reloj, sin red, sin estado. La espera se mide SIEMPRE contra un
 * instante que trae quien llama (`desplazar`/`antes_de` no leen el reloj).
 */

const { es_objeto, es_instante, texto_no_vacio } = require('./formas');

const CODIGOS = Object.freeze({
  ACCION_DESCONOCIDA: 'accion_desconocida',
  LOTE_INVALIDO: 'lote_invalido',
  SIN_INSTANTE: 'sin_instante'
});

// ---------------------------------------------------------------------------
// La tabla de costes (G1). Un solo sitio: si el precio cambia, cambia aqui y
// todo lo que regula se entera.
//
//   coste        unidades de presupuesto que consume la accion
//   espera_min   minutos minimos antes de la SIGUIENTE accion
//   familia      agrupacion para informes (no para regular)
//
// `publicar` es la accion cara (12) y la que mas espera pide (20 min): es la
// unica que la plataforma castiga por si sola. `pulso` es el minimo (1, sin
// espera): no publica nada, solo dice "sigo aqui".
// ---------------------------------------------------------------------------

const TABLA = Object.freeze({
  pulso: Object.freeze({ coste: 1, espera_min: 0, familia: 'pulso' }),
  leer: Object.freeze({ coste: 2, espera_min: 1, familia: 'lectura' }),
  seguir: Object.freeze({ coste: 4, espera_min: 3, familia: 'escritura_social' }),
  comentar: Object.freeze({ coste: 6, espera_min: 3, familia: 'escritura_social' }),
  responder: Object.freeze({ coste: 6, espera_min: 2, familia: 'mensaje' }),
  publicar: Object.freeze({ coste: 12, espera_min: 20, familia: 'publicacion' })
});

const ACCIONES = Object.freeze(Object.keys(TABLA));

const ACCION_MINIMA = 'pulso';
const ACCION_CARA = 'publicar';

// Conservaduria: 100 = maximo conservador (cuenta nueva), 10 = ya ha tolerado
// bastante. Nunca llega a 0: ninguna cuenta se queda sin freno.
const CONSERVADURIA_MAXIMA = 100;
const CONSERVADURIA_MINIMA = 10;

// Escalones del perfil. Se recorre de mas conservador a menos y gana el primero
// cuyo `desde` alcanza la conservaduria: 100..75 maximo_conservador, 74..50
// conservador, 49..25 normal, 24..0 confiado.
const ESCALONES = Object.freeze([
  Object.freeze({ nombre: 'maximo_conservador', desde: 75, techo_diario: 20, pausa_minima_minutos: 30 }),
  Object.freeze({ nombre: 'conservador', desde: 50, techo_diario: 40, pausa_minima_minutos: 20 }),
  Object.freeze({ nombre: 'normal', desde: 25, techo_diario: 70, pausa_minima_minutos: 10 }),
  Object.freeze({ nombre: 'confiado', desde: 0, techo_diario: 120, pausa_minima_minutos: 5 })
]);

// ---- consultas de la tabla ------------------------------------------------

function es_accion(accion) {
  return typeof accion === 'string' && Object.prototype.hasOwnProperty.call(TABLA, accion);
}

/** Coste de una accion, o `null` si no esta en la tabla. Nunca adivina. */
function coste_de(accion) {
  return es_accion(accion) ? TABLA[accion].coste : null;
}

/** Espera minima tras una accion (minutos), o `null` si la accion no existe. */
function espera_minima_de(accion) {
  return es_accion(accion) ? TABLA[accion].espera_min : null;
}

function familia_de(accion) {
  return es_accion(accion) ? TABLA[accion].familia : null;
}

function coste_minimo() {
  return Math.min(...ACCIONES.map((a) => TABLA[a].coste));
}

function coste_maximo() {
  return Math.max(...ACCIONES.map((a) => TABLA[a].coste));
}

/**
 * Coste de un lote. Una accion desconocida no se cuenta como cero (eso seria
 * regalar presupuesto): se devuelve listada en `desconocidas` y el lote queda
 * marcado como no regulable.
 *
 * @param {string[]} acciones
 * @returns {{ok:boolean, coste:number, acciones:number, desconocidas:string[], por_familia:object, motivo?:string}}
 */
function coste_de_lote(acciones) {
  if (!Array.isArray(acciones)) {
    return { ok: false, motivo: CODIGOS.LOTE_INVALIDO, coste: 0, acciones: 0, desconocidas: [], por_familia: {} };
  }
  const desconocidas = [];
  const por_familia = {};
  let coste = 0;
  for (const accion of acciones) {
    const c = coste_de(accion);
    if (c === null) {
      desconocidas.push(typeof accion === 'string' ? accion : String(accion));
      continue;
    }
    coste += c;
    const fam = familia_de(accion);
    por_familia[fam] = (por_familia[fam] || 0) + c;
  }
  return {
    ok: desconocidas.length === 0,
    motivo: desconocidas.length === 0 ? null : CODIGOS.ACCION_DESCONOCIDA,
    coste,
    acciones: acciones.length,
    desconocidas,
    por_familia
  };
}

// ---- conservaduria y perfil ----------------------------------------------

/**
 * Conservaduria valida. Sin dato (o con uno que no es un numero) devuelve la
 * MAXIMA: fallar cerrado en el ritmo es arrancar conservador, no arrancar
 * comodo. Se recorta a [MINIMA, MAXIMA].
 */
function normalizar_conservaduria(valor) {
  if (valor === undefined || valor === null || valor === '') return CONSERVADURIA_MAXIMA;
  const n = Number(valor);
  if (!Number.isFinite(n)) return CONSERVADURIA_MAXIMA;
  return Math.min(CONSERVADURIA_MAXIMA, Math.max(CONSERVADURIA_MINIMA, Math.round(n)));
}

function escalon_de(conservaduria) {
  const c = normalizar_conservaduria(conservaduria);
  for (const escalon of ESCALONES) {
    if (c >= escalon.desde) return escalon;
  }
  return ESCALONES[ESCALONES.length - 1];
}

/**
 * Perfil de ritmo de una cuenta.
 *
 * @param {number|string} conservaduria 0..100 (100 = maximo conservador)
 * @returns {{ok:boolean, nombre:string, conservaduria:number, techo_diario:number,
 *            pausa_minima_minutos:number, publicaciones_al_dia:number,
 *            coste_publicar:number, normalizada:number}}
 */
function perfil(conservaduria) {
  const c = normalizar_conservaduria(conservaduria);
  const escalon = escalon_de(c);
  const pedida = Number(conservaduria);
  return {
    ok: true,
    nombre: escalon.nombre,
    conservaduria: c,
    // `ajustada` dice si hubo que recortar lo pedido: un perfil que se pinta
    // distinto del pedido sin decirlo es el sitio donde se pierde un freno.
    ajustada: !(Number.isFinite(pedida) && Math.round(pedida) === c),
    techo_diario: escalon.techo_diario,
    pausa_minima_minutos: escalon.pausa_minima_minutos,
    coste_publicar: TABLA[ACCION_CARA].coste,
    // Calculado, no declarado: cuantas publicaciones caben en el techo.
    publicaciones_al_dia: Math.floor(escalon.techo_diario / TABLA[ACCION_CARA].coste)
  };
}

function perfil_de_cuenta_nueva() {
  return perfil(CONSERVADURIA_MAXIMA);
}

/**
 * ¿Cabe este coste en lo que queda? Sirve para el paso `techo` de G6 y para
 * contestar sin escribir nada.
 *
 * @param {number} coste
 * @param {number} gastado
 * @param {number} techo
 * @returns {{ok:boolean, cabe:boolean, coste:number, gastado:number, techo:number, restante:number}}
 */
function cabe(coste, gastado, techo) {
  const c = Number.isFinite(Number(coste)) ? Number(coste) : null;
  const g = Number.isFinite(Number(gastado)) ? Number(gastado) : 0;
  const t = Number.isFinite(Number(techo)) ? Number(techo) : 0;
  if (c === null) return { ok: false, cabe: false, coste: null, gastado: g, techo: t, restante: t - g };
  return { ok: true, cabe: c <= t - g, coste: c, gastado: g, techo: t, restante: t - g };
}

// ---- tiempo (sin reloj) ---------------------------------------------------

function _ms(instante) {
  if (!es_instante(instante)) return null;
  const ms = Date.parse(instante);
  return Number.isFinite(ms) ? ms : null;
}

function instante_de(ms) {
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().replace(/\.000Z$/, 'Z');
}

/**
 * Instante desplazado N minutos. NO lee el reloj: suma sobre el instante que
 * le dan. Devuelve `null` si el instante no es un instante.
 */
function desplazar(instante, minutos) {
  const ms = _ms(instante);
  const n = Number(minutos);
  if (ms === null || !Number.isFinite(n)) return null;
  return instante_de(ms + n * 60000);
}

/** ¿`a` es anterior a `b`? Con instantes invalidos la respuesta es `false`. */
function antes_de(a, b) {
  const ma = _ms(a);
  const mb = _ms(b);
  if (ma === null || mb === null) return false;
  return ma < mb;
}

/** Minutos entre dos instantes (positivo si `b` es posterior). `null` si no valen. */
function minutos_entre(a, b) {
  const ma = _ms(a);
  const mb = _ms(b);
  if (ma === null || mb === null) return null;
  return Math.round((mb - ma) / 60000);
}

/** Instante mas tardio de los dos validos (o el que valga, o `null`). */
function mas_tarde(a, b) {
  const ma = _ms(a);
  const mb = _ms(b);
  if (ma === null) return mb === null ? null : instante_de(mb);
  if (mb === null) return instante_de(ma);
  return instante_de(Math.max(ma, mb));
}

/** Instante mas temprano de los dos validos (o el que valga, o `null`). */
function mas_pronto(a, b) {
  const ma = _ms(a);
  const mb = _ms(b);
  if (ma === null) return mb === null ? null : instante_de(mb);
  if (mb === null) return instante_de(ma);
  return instante_de(Math.min(ma, mb));
}

/** Descripcion legible de la tabla, para informes y para que el dueno la lea. */
function describir() {
  return ACCIONES.map((accion) => ({
    accion,
    coste: TABLA[accion].coste,
    espera_min: TABLA[accion].espera_min,
    familia: TABLA[accion].familia
  }));
}

module.exports = {
  CODIGOS,
  TABLA,
  ACCIONES,
  ACCION_MINIMA,
  ACCION_CARA,
  ESCALONES,
  CONSERVADURIA_MAXIMA,
  CONSERVADURIA_MINIMA,
  es_accion,
  coste_de,
  espera_minima_de,
  familia_de,
  coste_minimo,
  coste_maximo,
  coste_de_lote,
  normalizar_conservaduria,
  escalon_de,
  perfil,
  perfil_de_cuenta_nueva,
  cabe,
  instante_de,
  desplazar,
  antes_de,
  minutos_entre,
  mas_tarde,
  mas_pronto,
  describir
};

// Vista "clase" para quien prefiera el nombre del diseno (G1 · PerfilDeRitmo).
module.exports.PerfilDeRitmo = Object.freeze({
  acciones: () => ACCIONES.slice(),
  coste_de,
  espera_minima_de,
  coste_de_lote,
  perfil,
  perfil_de_cuenta_nueva,
  cabe,
  desplazar,
  antes_de
});

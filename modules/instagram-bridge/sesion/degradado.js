'use strict';

/**
 * degradado — H3 · ModoDegradado · REFLEJO PURO (sin estado, sin IO, sin red).
 *
 * Cuando la plataforma no contesta (sin red, plataforma caida, cuenta en
 * revision) el puente NO se apaga: sigue sirviendo lo que ya trajo. Lo que no
 * puede es traer nada nuevo ni tocar nada.
 *
 * # La regla
 *
 * ```text
 * sin plataforma solo sobrevive LO YA TRAIDO:
 *   leer lo cacheado  -> si, y se dice que es viejo
 *   publicar/comentar -> no, nunca
 *   inventar el dato  -> no: si no esta en la cache, no esta
 * ```
 *
 * Un `leer` de una clave que no esta en la cache NO devuelve una lista vacia
 * "porque no hay nada": devuelve `no_esta_en_la_cache`. Una lista vacia es un
 * dato (ya se pregunto y no habia); una clave ausente es un hueco, y un hueco
 * rellenado con `[]` es la primera mentira comoda del modo degradado.
 *
 * # Lo que esta pieza NO hace
 *
 * No escribe, no publica, no consulta: decide y lee lo que le dan. La cache la
 * trajo otro cuando habia plataforma; aqui solo se comprueba que lo que se sirve
 * estaba ya, y se marca `fresco: false` para que nadie lo confunda con una
 * lectura de ahora.
 *
 * Puro: sin reloj (el `momento` entra en `entrar`), sin red, sin estado global.
 *
 * Ver plan-construccion.md (bloque 8, H3) y diseno-oop.md "ModoDegradado".
 */

const { es_objeto, es_instante, texto_no_vacio, clonar } = require('../core/formas');

const MODOS = Object.freeze(['normal', 'degradado']);

// Acciones que solo necesitan lo ya traido. Lista CERRADA: lo que no este aqui
// no es lectura.
const ACCIONES_DE_LECTURA = Object.freeze([
  'leer_cache',
  'consultar_guardado',
  'listar_traido',
  'ver_ultimo_estado'
]);

// Acciones que escriben en la plataforma. En degradado, prohibidas sin excepcion.
const ACCIONES_DE_PLATAFORMA = Object.freeze([
  'publicar',
  'comentar',
  'responder_dm',
  'enviar_dm',
  'seguir',
  'dejar_de_seguir',
  'dar_me_gusta',
  'subir_historia',
  'editar_perfil',
  'borrar',
  'programar',
  'etiquetar',
  'compartir'
]);

const MOTIVOS = Object.freeze({
  MODO_DESCONOCIDO: 'modo_desconocido',
  ENTRADA_INCOMPLETA: 'entrada_incompleta',
  ACCION_NO_DECLARADA: 'accion_no_declarada',
  NADA_NUEVO_SIN_PLATAFORMA: 'nada_nuevo_sin_plataforma',
  NO_ESTA_EN_LA_CACHE: 'no_esta_en_la_cache',
  CACHE_INVALIDA: 'cache_invalida',
  CONSULTA_INCOMPLETA: 'consulta_incompleta'
});

function fallo(motivo, extra) {
  return Object.assign({ ok: false, motivo }, extra || {});
}

function es_modo(x) {
  return es_objeto(x) && MODOS.includes(x.modo);
}

// ---- entrar ---------------------------------------------------------------

/**
 * Entra en modo degradado. Devuelve el MODO (un valor que viaja con cada
 * llamada), no un estado global: dos operaciones del mismo puente pueden estar
 * una degradada y otra no, y un booleano en un modulo las confundiria.
 *
 * @param {{motivo:string, momento:string, plataforma?:string}} opciones
 */
function entrar(opciones) {
  const o = es_objeto(opciones) ? opciones : {};
  const faltan = [];
  if (!texto_no_vacio(o.motivo)) faltan.push('motivo');
  if (!es_instante(o.momento)) faltan.push('momento');
  if (faltan.length > 0) return fallo(MOTIVOS.ENTRADA_INCOMPLETA, { faltan, invalidos: [] });

  return {
    ok: true,
    modo: {
      modo: 'degradado',
      desde: o.momento,
      motivo: String(o.motivo).trim(),
      plataforma: texto_no_vacio(o.plataforma) ? String(o.plataforma).trim().toLowerCase() : 'instagram',
      // Lo unico que sobrevive.
      permite: ACCIONES_DE_LECTURA.slice(),
      // Lo que no se hace hasta que vuelva la plataforma.
      prohibe: ACCIONES_DE_PLATAFORMA.slice(),
      solo_lo_ya_traido: true,
      fresco: false,
      sin_plataforma: true
    }
  };
}

// ---- decidir --------------------------------------------------------------

/**
 * ¿Se puede hacer esta accion en este modo?
 *
 * - En normal, todo lo declarado se puede.
 * - En degradado, solo lectura de lo traido.
 * - Una accion que no esta en ninguna de las dos listas se PROHIBE (lista
 *   cerrada: lo desconocido no se asume inocente).
 */
function permite(modo, accion, opciones) {
  const o = es_objeto(opciones) ? opciones : {};

  if (!es_modo(modo)) return fallo(MOTIVOS.MODO_DESCONOCIDO, { permitida: false, accion });
  if (!texto_no_vacio(accion)) return fallo(MOTIVOS.ACCION_NO_DECLARADA, { permitida: false, accion });

  const nombre = String(accion).trim().toLowerCase();
  const es_lectura = ACCIONES_DE_LECTURA.includes(nombre);
  const es_de_plataforma = ACCIONES_DE_PLATAFORMA.includes(nombre);

  if (modo.modo === 'normal') {
    if (!es_lectura && !es_de_plataforma) {
      return fallo(MOTIVOS.ACCION_NO_DECLARADA, { permitida: false, accion: nombre });
    }
    return { ok: true, permitida: true, accion: nombre, motivo: 'modo_normal', origen: es_lectura ? 'plataforma_o_cache' : 'plataforma' };
  }

  if (es_lectura) {
    return {
      ok: true,
      permitida: true,
      accion: nombre,
      motivo: 'lectura_de_lo_ya_traido',
      origen: 'cache',
      fresco: false,
      aviso: 'lo que se lea es de antes: no se ha consultado la plataforma'
    };
  }

  return {
    ok: false,
    permitida: false,
    accion: nombre,
    motivo: MOTIVOS.NADA_NUEVO_SIN_PLATAFORMA,
    porque: 'sin plataforma solo sobrevive lo ya traido: no se publica, no se comenta, no se escribe',
    // Un `traer: true` (o cualquier intento de forzar) NO cambia la respuesta.
    forzado: o.forzar === true || o.traer === true
  };
}

// ---- leer lo traido -------------------------------------------------------

/**
 * Lee de la cache. La cache es lo que se trajo cuando habia plataforma:
 *
 *   {traido_en: '<instante>', entradas: [{clave, datos, traido_en}]}
 *
 * Si la clave no esta, NO se devuelve `[]`: se devuelve `no_esta_en_la_cache`.
 * Si esta, se devuelve con `origen: 'cache'` y `fresco: false`.
 *
 * @param {object} modo
 * @param {{cache:object, consulta:string, traer?:boolean}} peticion
 */
function leer(modo, peticion) {
  const p = es_objeto(peticion) ? peticion : {};

  if (!es_modo(modo)) return fallo(MOTIVOS.MODO_DESCONOCIDO);
  if (!texto_no_vacio(p.consulta)) return fallo(MOTIVOS.CONSULTA_INCOMPLETA, { faltan: ['consulta'] });

  if (!es_objeto(p.cache) || !Array.isArray(p.cache.entradas)) {
    return fallo(MOTIVOS.CACHE_INVALIDA, { que_hace_falta: 'una cache con entradas traidas antes de degradar' });
  }

  const consulta = String(p.consulta).trim();

  // Traer algo nuevo esta prohibido en degradado, aunque lo pidan explicitamente.
  if (modo.modo === 'degradado' && (p.traer === true || p.forzar === true)) {
    return fallo(MOTIVOS.NADA_NUEVO_SIN_PLATAFORMA, {
      consulta,
      origen: null,
      que_hace_falta: 'esperar a que vuelva la plataforma: en degradado no se trae nada nuevo'
    });
  }

  const entrada = p.cache.entradas.find((e) => es_objeto(e) && e.clave === consulta);

  if (!entrada) {
    return fallo(MOTIVOS.NO_ESTA_EN_LA_CACHE, {
      consulta,
      que_hace_falta: 'traerlo cuando vuelva la plataforma; ahora mismo no hay dato que dar',
      origen: null,
      // Nada de `datos: []`: una clave ausente no es una lista vacia.
      datos: undefined
    });
  }

  const datos = clonar(entrada.datos);
  const vacio = Array.isArray(datos) && datos.length === 0;

  return {
    ok: true,
    consulta,
    datos,
    vacio,
    origen: 'cache',
    fresco: false,
    traido_en: entrada.traido_en || p.cache.traido_en || null,
    aviso: vacio
      ? 'lo traido para esta clave estaba vacio: se pregunto y no habia (no es un hueco)'
      : 'dato ya traido: no se ha consultado la plataforma'
  };
}

// ---- volver ---------------------------------------------------------------

/** Volver a normal es un hecho del mundo (la plataforma contesta), no una promesa. */
function volver(opciones) {
  const o = es_objeto(opciones) ? opciones : {};
  if (!es_instante(o.momento)) return fallo(MOTIVOS.ENTRADA_INCOMPLETA, { faltan: ['momento'], invalidos: [] });
  return {
    ok: true,
    modo: {
      modo: 'normal',
      desde: o.momento,
      motivo: texto_no_vacio(o.motivo) ? String(o.motivo).trim() : 'la plataforma contesta',
      permite: ACCIONES_DE_LECTURA.concat(ACCIONES_DE_PLATAFORMA),
      prohibe: [],
      solo_lo_ya_traido: false,
      fresco: true,
      sin_plataforma: false
    }
  };
}

module.exports = {
  MODOS,
  ACCIONES_DE_LECTURA,
  ACCIONES_DE_PLATAFORMA,
  MOTIVOS,
  es_modo,
  entrar,
  permite,
  leer,
  volver
};

module.exports.ModoDegradado = Object.freeze({
  entrar,
  permite,
  leer,
  volver
});

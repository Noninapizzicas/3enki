'use strict';

/**
 * recorte — M3 · RecorteDePrivacidad · REFLEJO.
 *
 * Minimiza ANTES de guardar, no despues. Es la unica forma de que la frase del
 * diseno sea verdad: **lo que no se guardo no hay que borrarlo**. Borrar despues
 * exige acordarse de todo lo que se guardo, en todos los sitios donde se guardo,
 * y hacerlo bien cada vez; no guardar exige una sola decision, tomada aqui, una
 * vez, antes de que el dato exista en disco.
 *
 * QUE SE CONSERVA, Y POR QUE:
 *   - lo necesario para RESPONDER: el texto del mensaje, quien lo mando (el
 *     handle visible), en que conversacion y en que momento;
 *   - lo necesario para NO REPETIR: el id del mensaje y el de la conversacion,
 *     para saber que ya se contesto sin volver a contestarlo;
 *   - el sello (P1), que es nuestro, no de la persona.
 * Nada mas. `CAMPOS_QUE_SE_CONSERVAN` es una lista CERRADA: un campo que no
 * este en ella se descarta aunque parezca inofensivo, y se nombra en
 * `descartado` con su motivo. Un recorte que se salta campos "porque no
 * parecen sensibles" es un censo de clientes creciendo de uno en uno.
 *
 * LO QUE NUNCA SE HACE AQUI:
 *   - **No se reescribe el texto del mensaje.** Recortar el texto seria cambiar
 *     lo que la persona dijo, y ademas rompe la respuesta (se contestaria a algo
 *     que no dijo). Si el texto trae un correo o un telefono, se deja tal cual y
 *     se ANOTA en `avisos` para que una persona decida; no se censura en
 *     silencio.
 *   - **No se inventa un identificador nuevo** para sustituir al de la persona.
 *     Se guarda el handle tal cual o no se guarda la pieza.
 *   - **No se recorta el sello.**
 *
 * UN RECORTE NO DEJA LA PIEZA INSERVIBLE: si al recortar se pierde el contexto
 * necesario para responder (sin texto y sin remitente, o sin conversacion), se
 * dice con `puede_responder: false` y `faltan` nombra el hueco. El recorte no
 * convierte una pieza buena en basura silenciosamente.
 *
 * `auditar` es el test permanente: recibe un retrato ya guardado y devuelve la
 * lista de EXCESOS. Sirve igual para lo que se guardo con una version anterior
 * de la tabla, que es justo lo que se quiere detectar.
 *
 * Puro: sin IO, sin reloj, sin estado global. No conoce el bus ni el disco.
 */

const { es_objeto, texto_no_vacio, clonar } = require('./formas');

const ESQUEMA = 'hecho-recortado-v1';

const MOTIVOS = Object.freeze({
  ENTRADA_INVALIDA: 'entrada_invalida',
  IDENTIFICADOR_DE_TERCERO: 'identificador_de_tercero',
  DATO_SENSIBLE: 'dato_sensible',
  HISTORIAL: 'historial',
  NO_NECESARIO_PARA_RESPONDER: 'no_necesario_para_responder',
  FUERA_DE_LA_LISTA: 'fuera_de_la_lista',
  TERCERO_SIN_IDENTIFICADOR: 'tercero_sin_identificador',
  MOTIVO_NO_ADMITIDO: 'motivo_no_admitido',
  NADA_QUE_OLVIDAR: 'no_habia_nada'
});

/**
 * La lista cerrada. `texto` y `remitente` son los dos unicos datos de la
 * persona que se conservan, y se conservan porque sin ellos no hay respuesta.
 */
const CAMPOS_QUE_SE_CONSERVAN = Object.freeze([
  'sello',
  'cuenta',
  'plataforma',
  'conversacion_id',
  'mensaje_id',
  'remitente',
  'texto',
  'momento',
  'tipo'
]);

// Campos del sobre del recorte (no son datos de nadie: son la cuenta de lo que
// se hizo). `auditar` los conoce para no confundirlos con excesos.
const CAMPOS_DEL_SOBRE = Object.freeze(['esquema', 'faltan', 'conservado', 'descartado', 'avisos', 'puede_responder']);

/**
 * Motivos por los que un campo NO se conserva. Es una tabla CERRADA por nombre
 * exacto y se aplica de arriba abajo (el primer acierto manda): asi el motivo
 * que se informa es el grave, no el generico.
 */
const CAMPOS_DESCARTADOS = Object.freeze({
  // identificadores de terceros
  correo: MOTIVOS.IDENTIFICADOR_DE_TERCERO,
  email: MOTIVOS.IDENTIFICADOR_DE_TERCERO,
  correo_electronico: MOTIVOS.IDENTIFICADOR_DE_TERCERO,
  telefono: MOTIVOS.IDENTIFICADOR_DE_TERCERO,
  tlf: MOTIVOS.IDENTIFICADOR_DE_TERCERO,
  movil: MOTIVOS.IDENTIFICADOR_DE_TERCERO,
  whatsapp: MOTIVOS.IDENTIFICADOR_DE_TERCERO,
  dni: MOTIVOS.IDENTIFICADOR_DE_TERCERO,
  nie: MOTIVOS.IDENTIFICADOR_DE_TERCERO,
  pasaporte: MOTIVOS.IDENTIFICADOR_DE_TERCERO,
  iban: MOTIVOS.IDENTIFICADOR_DE_TERCERO,
  tarjeta: MOTIVOS.IDENTIFICADOR_DE_TERCERO,
  direccion: MOTIVOS.IDENTIFICADOR_DE_TERCERO,
  ip: MOTIVOS.IDENTIFICADOR_DE_TERCERO,
  ubicacion: MOTIVOS.IDENTIFICADOR_DE_TERCERO,
  seguidores: MOTIVOS.IDENTIFICADOR_DE_TERCERO,
  // datos sensibles
  nombre_completo: MOTIVOS.DATO_SENSIBLE,
  fecha_nacimiento: MOTIVOS.DATO_SENSIBLE,
  genero: MOTIVOS.DATO_SENSIBLE,
  religion: MOTIVOS.DATO_SENSIBLE,
  salud: MOTIVOS.DATO_SENSIBLE,
  diagnostico: MOTIVOS.DATO_SENSIBLE,
  biometria: MOTIVOS.DATO_SENSIBLE,
  // historial: no se construye memoria de la persona
  historial: MOTIVOS.HISTORIAL,
  historial_de_mensajes: MOTIVOS.HISTORIAL,
  mensajes_anteriores: MOTIVOS.HISTORIAL,
  compras: MOTIVOS.HISTORIAL
});

/** Formas de dato que delatan un identificador, miren en el campo que miren. */
const FORMAS_DE_DATO = Object.freeze([
  { motivo: MOTIVOS.IDENTIFICADOR_DE_TERCERO, re: /[^\s@]+@[^\s@]+\.[A-Za-z]{2,}/, nombre: 'correo' },
  { motivo: MOTIVOS.IDENTIFICADOR_DE_TERCERO, re: /(?:\+?\d[\s.-]?){9,}/, nombre: 'telefono' },
  { motivo: MOTIVOS.IDENTIFICADOR_DE_TERCERO, re: /\b\d{8}[A-Za-z]\b/, nombre: 'dni' },
  { motivo: MOTIVOS.IDENTIFICADOR_DE_TERCERO, re: /\bES\d{2}[\s]?(?:\d{4}[\s]?){5}\b/i, nombre: 'iban' },
  { motivo: MOTIVOS.DATO_SENSIBLE, re: /\b(?:\d[ -]?){13,16}\b/, nombre: 'tarjeta' }
]);

/**
 * Campos que NO se escanean buscando formas de identificador, porque su valor
 * es un identificador nuestro o un instante: `2026-11-11 12:00:00` tiene diez
 * digitos y se parece a un telefono, y un `mensaje_id` puede ser un numero
 * largo. Escanearlos daria un exceso falso en cada auditoria, y una alarma que
 * salta siempre se acaba ignorando.
 */
const SIN_ESCANEO_DE_FORMAS = Object.freeze([
  'momento',
  'mensaje_id',
  'conversacion_id',
  'cuenta',
  'plataforma',
  'tipo',
  'sello'
]);

/**
 * Motivos por los que SI se conserva algo de un tercero. Lista cerrada y corta:
 * responder y no repetir. Cualquier otro motivo ("marketing", "analisis",
 * "segmentacion") es un censo con otro nombre y se rechaza.
 */
const MOTIVOS_PARA_CONSERVAR = Object.freeze(['responder', 'no_repetir']);

// ---------------------------------------------------------------------------
// utilidades
// ---------------------------------------------------------------------------

function texto_de(v) {
  return typeof v === 'string' ? v : null;
}

function motivo_del_campo(campo) {
  if (Object.prototype.hasOwnProperty.call(CAMPOS_DESCARTADOS, campo)) return CAMPOS_DESCARTADOS[campo];
  return MOTIVOS.FUERA_DE_LA_LISTA;
}

/** Busca formas de identificador dentro de un valor string. No lo modifica. */
function formas_en(valor) {
  if (typeof valor !== 'string' || valor.trim() === '') return [];
  const out = [];
  for (const f of FORMAS_DE_DATO) {
    if (f.re.test(valor)) out.push(f.nombre);
  }
  return out;
}

// ---------------------------------------------------------------------------
// recortar
// ---------------------------------------------------------------------------

/**
 * Recorta un hecho visible antes de guardarlo.
 *
 * @param {object} hecho  el hecho tal como llega (puede traer de todo)
 * @param {{campos_extra?:string[]}} [opts]
 *   `campos_extra` existe para un unico caso: una pieza que necesita un campo
 *   adicional declarado por el proyecto que la origina. Se anota igualmente en
 *   `conservado` para que la auditoria lo vea; no es una puerta para colar
 *   campos a escondidas.
 * @returns {{ok:boolean, motivo?:string, hecho?:object, faltan:string[]}}
 */
function recortar(hecho, opts) {
  if (!es_objeto(hecho)) {
    return { ok: false, motivo: MOTIVOS.ENTRADA_INVALIDA, faltan: ['hecho'] };
  }
  const o = es_objeto(opts) ? opts : {};
  const extra = Array.isArray(o.campos_extra) ? o.campos_extra.filter(texto_no_vacio) : [];
  const permitidos = CAMPOS_QUE_SE_CONSERVAN.concat(extra);

  const conservado = [];
  const descartado = [];
  const avisos = [];

  const salida = { esquema: ESQUEMA };
  for (const campo of Object.keys(hecho)) {
    if (permitidos.includes(campo)) {
      salida[campo] = clonar(hecho[campo]);
      conservado.push(campo);

      // El texto no se reescribe: se ANOTA lo que trae, sin copiar el valor.
      if (campo === 'texto') {
        const formas = formas_en(hecho.texto);
        for (const forma of formas) avisos.push({ campo, forma, motivo: 'dato_en_el_mensaje' });
      }
      continue;
    }
    descartado.push({ campo, motivo: motivo_del_campo(campo) });
  }

  // Un dato ausente se nombra (I5): nunca se rellena con el plausible.
  const faltan = [];
  if (!texto_no_vacio(salida.cuenta)) faltan.push('cuenta');
  if (!texto_no_vacio(salida.remitente)) faltan.push('remitente');
  if (!texto_no_vacio(salida.conversacion_id)) faltan.push('conversacion_id');
  if (!texto_no_vacio(salida.texto)) faltan.push('texto');

  salida.conservado = conservado;
  salida.descartado = descartado;
  salida.avisos = avisos;
  salida.faltan = faltan;
  salida.puede_responder = faltan.length === 0;

  return { ok: true, hecho: salida, faltan };
}

// ---------------------------------------------------------------------------
// conservar
// ---------------------------------------------------------------------------

/**
 * Decide si el dato de un tercero se puede conservar y por que.
 *
 * El "por que" no es decorativo: sin motivo, conservar es costumbre; y la
 * costumbre es como se acaba teniendo una base de datos de personas.
 *
 * @param {{remitente?:string, conversacion_id?:string}} tercero
 * @param {string} motivo  'responder' | 'no_repetir'
 */
function conservar(tercero, motivo) {
  const t = es_objeto(tercero) ? tercero : {};
  if (!texto_no_vacio(t.remitente)) {
    return { ok: false, conservar: false, motivo: MOTIVOS.TERCERO_SIN_IDENTIFICADOR };
  }
  if (!texto_no_vacio(motivo) || !MOTIVOS_PARA_CONSERVAR.includes(String(motivo).trim())) {
    return { ok: false, conservar: false, motivo: MOTIVOS.MOTIVO_NO_ADMITIDO, admitidos: MOTIVOS_PARA_CONSERVAR.slice() };
  }
  return { ok: true, conservar: true, motivo: String(motivo).trim(), campos: ['remitente', 'texto', 'conversacion_id', 'mensaje_id'] };
}

// ---------------------------------------------------------------------------
// auditar
// ---------------------------------------------------------------------------

/**
 * Test permanente sobre un retrato ya guardado: devuelve la lista de EXCESOS.
 *
 * Detecta tres cosas, de la mas grave a la mas tonta:
 *   1. un campo que esta en la tabla de descartes (correo, telefono, historial);
 *   2. un valor con forma de identificador en cualquier campo salvo `texto`
 *      (el texto es el mensaje: ahi un correo es lo que la persona escribio);
 *   3. un campo que no esta ni en la lista de lo que se conserva ni en el sobre
 *      del recorte: alguien lo metio por otra via, y eso tambien es un exceso.
 *
 * @returns {{ok:boolean, excesos:Array<{campo:string, motivo:string, forma?:string}>}}
 */
function auditar(retrato) {
  if (!es_objeto(retrato)) {
    return { ok: false, excesos: [{ campo: 'retrato', motivo: MOTIVOS.ENTRADA_INVALIDA }] };
  }
  const excesos = [];
  for (const campo of Object.keys(retrato)) {
    if (CAMPOS_DEL_SOBRE.includes(campo)) continue;

    const motivo = motivo_del_campo(campo);
    if (motivo !== MOTIVOS.FUERA_DE_LA_LISTA) {
      excesos.push({ campo, motivo });
      continue;
    }
    if (!CAMPOS_QUE_SE_CONSERVAN.includes(campo)) {
      excesos.push({ campo, motivo: MOTIVOS.FUERA_DE_LA_LISTA });
      continue;
    }
    if (campo === 'texto') continue;
    if (SIN_ESCANEO_DE_FORMAS.includes(campo)) continue;

    const formas = formas_en(retrato[campo]);
    for (const forma of formas) excesos.push({ campo, motivo: MOTIVOS.IDENTIFICADOR_DE_TERCERO, forma });
  }
  return { ok: excesos.length === 0, excesos };
}

// ---------------------------------------------------------------------------
// olvidar
// ---------------------------------------------------------------------------

/**
 * Borra los datos de un tercero de un retrato. En un retrato YA recortado no
 * hay nada que borrar, y se dice con `habia_algo: false` en vez de fingir un
 * borrado: esa es exactamente la prueba de que la minimizacion previa funciona.
 *
 * @param {object} retrato
 * @param {{remitente?:string}} [tercero]  sin tercero, se olvida a quien haya
 * @param {string} motivo
 */
function olvidar(retrato, tercero, motivo) {
  if (!es_objeto(retrato)) {
    return { ok: false, motivo: MOTIVOS.ENTRADA_INVALIDA, faltan: ['retrato'] };
  }
  if (!texto_no_vacio(motivo)) {
    return { ok: false, motivo: MOTIVOS.MOTIVO_NO_ADMITIDO, admitidos: MOTIVOS_PARA_CONSERVAR.slice() };
  }
  const t = es_objeto(tercero) ? tercero : {};
  const objetivo = texto_no_vacio(t.remitente) ? String(t.remitente).trim() : null;

  if (objetivo !== null && texto_no_vacio(retrato.remitente) && String(retrato.remitente).trim() !== objetivo) {
    // Se pide olvidar a alguien que no esta en este retrato: no se toca nada.
    return { ok: true, habia_algo: false, motivo: MOTIVOS.NADA_QUE_OLVIDAR, retrato: clonar(retrato) };
  }

  const BORRABLES = ['remitente', 'texto', 'conversacion_id', 'mensaje_id'];
  const presente = BORRABLES.filter((c) => retrato[c] !== undefined && retrato[c] !== null);
  if (presente.length === 0) {
    return { ok: true, habia_algo: false, motivo: MOTIVOS.NADA_QUE_OLVIDAR, retrato: clonar(retrato) };
  }

  const siguiente = clonar(retrato);
  for (const campo of presente) delete siguiente[campo];
  siguiente.olvidado = { motivo, momento: texto_de(retrato.momento) };
  return {
    ok: true,
    habia_algo: true,
    borrados: presente,
    motivo: 'olvidado',
    retrato: siguiente
  };
}

/** Azucar para quien solo quiere saber si la pieza recortada se puede usar. */
function puede_responder(hecho) {
  return es_objeto(hecho) && hecho.puede_responder === true;
}

function describir() {
  return {
    se_conserva: CAMPOS_QUE_SE_CONSERVAN.slice(),
    motivos_para_conservar: MOTIVOS_PARA_CONSERVAR.slice(),
    regla: 'lo que no se guardo no hay que borrarlo',
    momento: 'el recorte se hace antes de escribir, no despues'
  };
}

module.exports = {
  ESQUEMA,
  MOTIVOS,
  CAMPOS_QUE_SE_CONSERVAN,
  CAMPOS_DESCARTADOS,
  SIN_ESCANEO_DE_FORMAS,
  MOTIVOS_PARA_CONSERVAR,
  recortar,
  conservar,
  auditar,
  olvidar,
  puede_responder,
  describir
};

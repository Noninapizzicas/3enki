'use strict';

/**
 * silencio — N5 · SilencioElegido · REFLEJO.
 *
 * Cuando NO contestar es la respuesta. No es un descarte: es una decision con
 * motivo. La diferencia se ve en lo que se guarda: un descarte no deja rastro y
 * una decision de silencio se puede explicar manana.
 *
 * LA REGLA DEL BLOQUE:
 *   **una QUEJA no se silencia, se escala.**
 *
 * Se hace ejecutable en dos capas, porque una sola no basta:
 *   1. **Por clase.** Si la clasificacion de llegada (N2) ya dijo `queja`, la
 *      decision es `escalar` y no hay parametro que la cambie.
 *   2. **Por texto**, aunque la clase diga otra cosa. Un mensaje clasificado
 *      como `consulta` que dice "me habeis cobrado dos veces" es una queja mal
 *      clasificada, y silenciarla por la clase seria obedecer al error. Aqui se
 *      mira el texto con el mismo lexico y, si aparece, se escala y se devuelve
 *      `reclasificacion: 'queja'` para que la bandeja lo corrija.
 *
 *   La segunda capa es la que de verdad protege: los clasificadores se
 *   equivocan, y el silencio es la unica decision que no se puede deshacer
 *   (nadie sabe que pregunto lo que no se contesto).
 *
 * CUANDO SI ES LEGITIMO CALLAR:
 *   - `spam` — contestar alimenta al bot y confirma que el buzon esta vivo.
 *   - `agradecimiento` — "gracias" no pide nada. Se puede callar; si el dueno
 *     quiere contestar siempre, `politica.silencio_en_agradecimiento: false`.
 *   - `ininteligible` NO se calla: es delicado y se escala a una persona.
 *     Callar lo que no se entiende es tirarlo con otro nombre.
 *   - `delicado: true` tampoco: gana el escalado.
 *
 * Un mensaje desconocido se RESPONDE (`clase_desconocida_se_responde`). El
 * defecto seguro no es callar: es contestar. Silenciar por defecto convierte
 * cualquier fallo del clasificador en una persona ignorada.
 *
 * Puro: sin IO, sin reloj, sin estado. `momento`, si viene, se copia; no se
 * genera. El mismo payload da siempre la misma decision.
 */

const { es_objeto, texto_no_vacio } = require('../core/formas');

const DECISIONES = Object.freeze(['responder', 'silencio', 'escalar']);
const CLASES = Object.freeze(['consulta', 'pedido', 'queja', 'agradecimiento', 'spam', 'ininteligible']);

const MOTIVOS = Object.freeze({
  UNA_QUEJA_NO_SE_SILENCIA: 'una_queja_no_se_silencia',
  QUEJA_NO_DECLARADA: 'queja_no_declarada_como_queja',
  MENSAJE_DELICADO: 'mensaje_delicado_no_se_silencia',
  ININTELIGIBLE: 'ininteligible_se_escala_a_persona',
  SPAM: 'spam',
  SPAM_REPETIDO: 'spam_repetido',
  NO_HACE_FALTA_CONTESTAR: 'no_hace_falta_contestar',
  ESPERA_RESPUESTA: 'espera_respuesta',
  PIDIO_RESPUESTA: 'pidio_respuesta',
  CLASE_DESCONOCIDA: 'clase_desconocida_se_responde',
  ENTRADA_INVALIDA: 'entrada_invalida'
});

/**
 * Lexico de queja. Lista CERRADA y en minusculas sin tildes; el texto se
 * normaliza antes de buscarla. No pretende ser un analisis de sentimiento: es
 * el minimo que impide que una reclamacion se caiga por un typo en la clase.
 */
const QUEJA = Object.freeze([
  'queja', 'quejas', 'reclamacion', 'reclamaciones', 'reclamo', 'reclamar',
  'estafa', 'estafado', 'estafada', 'estafadores', 'fraude', 'timo',
  'engaño', 'engano', 'engañado', 'engañada', 'publicidad engañosa',
  'defectuoso', 'defectuosa', 'roto', 'rota', 'averia', 'averiado', 'averiada',
  'no funciona', 'no me funciona', 'no va', 'no va bien',
  'devolucion', 'devolver', 'reembolso', 'devolvedme',
  'pesimo', 'pesima', 'fatal', 'vergonzoso', 'vergonzosa', 'inaceptable',
  'me han cobrado', 'cobro indebido', 'me habeis cobrado', 'me han cobrado dos veces',
  'no ha llegado', 'no llego', 'retraso', 'retrasado',
  'malisimo', 'malisima', 'decepcion', 'decepcionado', 'decepcionada',
  'denuncia', 'abusivo', 'abusiva', 'indignado', 'indignada', 'chapuza',
  'una verguenza', 'esto es una verguenza'
]);

const TEXTO_QUEJA = QUEJA.map((f) => ` ${f} `);

/** Normaliza a palabras separadas por un espacio, sin tildes ni signos. */
function normalizar(texto) {
  if (typeof texto !== 'string') return '';
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contiene_frase(normalizado, frases) {
  if (!normalizado) return false;
  const acotado = ` ${normalizado} `;
  return frases.some((f) => acotado.includes(f));
}

/**
 * ¿El texto es una queja? Se exporta porque N1 lo usa como segunda capa al
 * guardar un silencio: la regla no puede depender de que este modulo se llame.
 */
function es_queja(texto) {
  return contiene_frase(normalizar(texto), TEXTO_QUEJA);
}

function decision_de(decision, motivo, motivos, extra) {
  return Object.assign({
    ok: true,
    decision,
    silencio: decision === 'silencio',
    puede_silenciar: decision === 'silencio',
    escala_a: decision === 'escalar' ? 'persona' : null,
    motivo,
    motivos: motivos && motivos.length ? motivos : [motivo],
    revisar: false,
    reclasificacion: null,
    nota: null
  }, extra || {});
}

/**
 * Decide si se contesta, se calla o se escala.
 *
 * @param {{clase?:string, texto?:string, delicado?:boolean, repeticiones?:number,
 *          exige_respuesta?:boolean, motivo?:string}} peticion
 * @param {{politica?:{silencio_en_agradecimiento?:boolean}}} [opciones]
 * @returns {object} siempre `ok:true` (una decision, no un fallo) salvo entrada nula
 */
function decidir(peticion, opciones) {
  const o = es_objeto(opciones) ? opciones : {};
  const politica = es_objeto(o.politica) ? o.politica : {};

  const p = es_objeto(peticion) ? peticion : (typeof peticion === 'string' ? { texto: peticion } : null);
  if (!p) return { ok: false, motivo: MOTIVOS.ENTRADA_INVALIDA, decision: null, silencio: false, puede_silenciar: false };

  const clase = texto_no_vacio(p.clase) ? String(p.clase).trim() : null;
  const texto = typeof p.texto === 'string' ? p.texto : '';
  const delicado = p.delicado === true;
  const repeticiones = Number.isFinite(p.repeticiones) ? Number(p.repeticiones) : 0;

  const base = { clase, silencio_propuesto: p.silencio === true, repeticiones };

  // ---- 1 · la queja declarada -------------------------------------------
  if (clase === 'queja') {
    return decision_de('escalar', MOTIVOS.UNA_QUEJA_NO_SE_SILENCIA, [MOTIVOS.UNA_QUEJA_NO_SE_SILENCIA], Object.assign({}, base, {
      revisar: true,
      nota: 'Una queja no se silencia: se escala a una persona, con su texto y su fecha.'
    }));
  }

  // ---- 2 · la queja que el clasificador no vio --------------------------
  if (es_queja(texto)) {
    return decision_de('escalar', MOTIVOS.QUEJA_NO_DECLARADA, [MOTIVOS.UNA_QUEJA_NO_SE_SILENCIA, MOTIVOS.QUEJA_NO_DECLARADA], Object.assign({}, base, {
      reclasificacion: 'queja',
      revisar: true,
      nota: 'El texto es una queja aunque la clase diga otra cosa: se escala y se corrige la clase.'
    }));
  }

  // ---- 3 · lo delicado no se calla --------------------------------------
  if (delicado || clase === 'ininteligible') {
    return decision_de('escalar', clase === 'ininteligible' ? MOTIVOS.ININTELIGIBLE : MOTIVOS.MENSAJE_DELICADO,
      [clase === 'ininteligible' ? MOTIVOS.ININTELIGIBLE : MOTIVOS.MENSAJE_DELICADO], Object.assign({}, base, {
        revisar: true,
        nota: 'No se entiende (o es delicado): callarlo seria tirarlo. Va a una persona.'
      }));
  }

  // ---- 4 · spam: el unico silencio comodo -------------------------------
  if (clase === 'spam') {
    const motivo = repeticiones >= 3 ? MOTIVOS.SPAM_REPETIDO : MOTIVOS.SPAM;
    return decision_de('silencio', motivo, [motivo], Object.assign({}, base, {
      nota: 'Contestar a spam confirma que el buzon esta vivo.'
    }));
  }

  // ---- 5 · agradecimiento: no pide nada ---------------------------------
  if (clase === 'agradecimiento') {
    if (p.exige_respuesta === true) {
      return decision_de('responder', MOTIVOS.PIDIO_RESPUESTA, [MOTIVOS.PIDIO_RESPUESTA], Object.assign({}, base, {}));
    }
    if (politica.silencio_en_agradecimiento === false) {
      return decision_de('responder', MOTIVOS.ESPERA_RESPUESTA, [MOTIVOS.ESPERA_RESPUESTA], Object.assign({}, base, {
        nota: 'La politica del proyecto contesta siempre los agradecimientos.'
      }));
    }
    return decision_de('silencio', MOTIVOS.NO_HACE_FALTA_CONTESTAR, [MOTIVOS.NO_HACE_FALTA_CONTESTAR], Object.assign({}, base, {
      nota: 'Un agradecimiento no pide respuesta: no contestar tambien es contestar.'
    }));
  }

  // ---- 6 · consulta / pedido: esperan respuesta -------------------------
  if (clase === 'consulta' || clase === 'pedido') {
    return decision_de('responder', MOTIVOS.ESPERA_RESPUESTA, [MOTIVOS.ESPERA_RESPUESTA], Object.assign({}, base, {}));
  }

  // ---- 7 · no se sabe que es: se responde -------------------------------
  return decision_de('responder', MOTIVOS.CLASE_DESCONOCIDA, [MOTIVOS.CLASE_DESCONOCIDA], Object.assign({}, base, {
    revisar: true,
    nota: 'Sin clase reconocible, el defecto seguro es contestar; callar por defecto pierde personas.'
  }));
}

function es_silencio(decision) {
  return es_objeto(decision) && decision.decision === 'silencio' && decision.silencio === true;
}

module.exports = {
  DECISIONES,
  CLASES,
  MOTIVOS,
  QUEJA,
  normalizar,
  es_queja,
  decidir,
  es_silencio
};

module.exports.SilencioElegido = Object.freeze({
  decidir,
  es_queja,
  es_silencio,
  MOTIVOS
});

'use strict';

/**
 * llegada — N2 · ClasificadorDeLlegada · MICRO-AGENTE.
 *
 * Clasifica lo que llega: consulta, pedido, queja, agradecimiento, spam o
 * ininteligible. De esa clase dependen tres cosas caras — si se contesta, si se
 * calla y si sube a una persona — asi que aqui hay una regla que manda sobre
 * todas las demas:
 *
 *   **un mensaje ININTELIGIBLE es delicado, no ruido.**
 *
 *   No se descarta: se escala a una persona. El razonamiento es corto: no se
 *   puede decidir que un mensaje no importa sin haberlo entendido. "No lo
 *   entiendo" y "no dice nada" son cosas distintas, y el codigo las confunde
 *   con una facilidad que asusta. Un mensaje en un idioma que no esta en el
 *   lexico, un audio transcrito fatal, un texto lleno de simbolos: todos son
 *   personas que escribieron. El unico que se puede archivar sin leer es el
 *   spam que se reconoce por su forma.
 *
 * MICRO-AGENTE SIN LLM OBLIGATORIO. El juicio se puede inyectar
 * (`opciones.juicio`), pero NUNCA es necesario:
 *   - sin juicio, decide una TABLA CERRADA de lexico y forma;
 *   - si el juicio lanza, tarda (promesa), devuelve una clase que no existe o
 *     devuelve basura, se cae a la tabla y se sigue;
 *   - si ni siquiera se puede leer el texto, ni se pregunta: la tabla manda.
 *     Un texto ilegible no se vuelve legible porque lo mire un modelo.
 *
 *   Esta pieza no puede fallar por no haber LLM. Nunca lanza: si algo se rompe
 *   dentro, devuelve `ininteligible` delicado con `via: 'fallback'`. Un
 *   clasificador que se cae y pierde el mensaje es peor que uno que se
 *   equivoca.
 *
 * Puro: sin IO, sin red, sin reloj, sin estado. El juicio, si se inyecta, es
 * una funcion sincrona del llamante; este modulo no la busca ni la configura.
 */

const { es_objeto, texto_no_vacio } = require('../core/formas');
const { normalizar, QUEJA } = require('./silencio');

const CLASES = Object.freeze(['consulta', 'pedido', 'queja', 'agradecimiento', 'spam', 'ininteligible']);
const DESTINOS = Object.freeze(['responder', 'escalar', 'archivar']);

const MOTIVOS = Object.freeze({
  TEXTO_VACIO: 'texto_vacio',
  SIN_LETRAS: 'sin_letras',
  SIN_PALABRAS: 'sin_palabras',
  SIMBOLOS: 'demasiados_simbolos',
  LEXICO_DE_QUEJA: 'lexico_de_queja',
  LEXICO_DE_PEDIDO: 'lexico_de_pedido',
  LEXICO_DE_AGRADECIMIENTO: 'lexico_de_agradecimiento',
  LEXICO_DE_CONSULTA: 'lexico_de_consulta',
  SPAM_FUERTE: 'spam_por_senal_fuerte',
  SPAM_ACUMULADO: 'spam_por_varias_senales',
  SIN_SENAL_CLARA: 'sin_senal_clara',
  JUICIO: 'juicio',
  JUICIO_DESCARTADO: 'juicio_descartado_texto_ilegible',
  JUICIO_NO_BAJA_QUEJA: 'juicio_no_puede_bajar_una_queja',
  JUICIO_INVALIDO: 'juicio_invalido_se_usa_la_tabla',
  FALLO_DE_CLASIFICACION: 'fallo_de_clasificacion'
});

// ---------------------------------------------------------------------------
// lexicos (listas cerradas)
// ---------------------------------------------------------------------------

const PEDIDO = Object.freeze([
  'quiero', 'queria', 'querria', 'necesito', 'necesitamos', 'me interesa', 'nos interesa',
  'encargar', 'encargo', 'pedido', 'pedir', 'comprar', 'compra', 'adquirir',
  'reservar', 'reserva', 'disponible', 'disponibilidad', 'stock', 'talla', 'tallas',
  'precio', 'precios', 'cuanto cuesta', 'cuanto vale', 'cuanto son', 'presupuesto',
  'envio', 'enviais', 'haceis envios', 'plazo', 'plazos', 'pago', 'pagar', 'factura',
  'me lo llevo', 'lo quiero'
]);

const AGRADECIMIENTO = Object.freeze([
  'gracias', 'mil gracias', 'muchas gracias', 'agradecido', 'agradecida',
  'encantado', 'encantada', 'genial', 'perfecto', 'perfecta', 'maravilloso',
  'maravillosa', 'muy amable'
]);

const CONSULTA = Object.freeze([
  'pregunta', 'preguntar', 'duda', 'dudas', 'como', 'cuando', 'donde', 'quien',
  'por que', 'porque', 'horario', 'horarios', 'abris', 'abren', 'abierto',
  'informacion', 'saber', 'consulta', 'me podeis decir', 'se puede', 'hay'
]);

// Senales de spam que por si solas bastan (no aparecen en una conversacion normal).
const SPAM_FUERTE = Object.freeze([
  'compra seguidores', 'comprar seguidores', 'gana seguidores', 'gana dinero',
  'ganar dinero', 'hazte rico', 'inversion garantizada', 'multiplica tu dinero',
  'criptomoneda', 'criptomonedas', 'sorteo', 'sorteos', 'te sigo', 'follow back',
  'link in bio', 'promocionate', 'publicidad para tu negocio', 'bot de telegram',
  'gana dinero desde casa', 'trabaja desde casa sin invertir'
]);

// Senales debiles: una no es spam, dos ya lo parecen.
const SPAM_DEBIL = Object.freeze([
  'gratis', 'descuento', 'descuentos', 'oferta', 'ofertas', 'promo', 'promocion',
  'haz clic', 'haz click', 'click aqui', 'solo hoy', 'ultimas plazas', 'no te lo pierdas'
]);

const URL_RE = /(?:https?:\/\/|www\.)\S+/i;

function palabras_de(normalizado) {
  return normalizado ? normalizado.split(' ') : [];
}

function contiene(normalizado, frases) {
  if (!normalizado) return false;
  const acotado = ` ${normalizado} `;
  return frases.some((f) => acotado.includes(` ${f} `));
}

function contar_vocales(normalizado) {
  const m = normalizado.match(/[aeiou]/g);
  return m ? m.length : 0;
}

/**
 * ¿Se puede leer? Devuelve el primer motivo por el que NO, o null.
 * Es deliberadamente conservador: un texto raro pero con letras y vocales NO es
 * ininteligible (sera una consulta en otro idioma, y se contesta).
 */
function motivo_ilegible(texto) {
  if (typeof texto !== 'string' || texto.trim() === '') return MOTIVOS.TEXTO_VACIO;
  const n = normalizar(texto);
  const letras = (n.match(/[a-z]/g) || []).length;
  if (letras === 0) return MOTIVOS.SIN_LETRAS;

  // Proporcion de simbolos sobre el original (los emojis cuentan como simbolo).
  const sin_espacios = String(texto).replace(/\s+/g, '');
  const alfanumericos = (sin_espacios.match(/[0-9A-Za-z\u00C0-\u024F]/g) || []).length;
  if (sin_espacios.length >= 10 && alfanumericos / sin_espacios.length < 0.35) return MOTIVOS.SIMBOLOS;

  if (letras >= 4 && contar_vocales(n) === 0) return MOTIVOS.SIN_PALABRAS;
  // Texto largo con casi ninguna vocal: no es otro idioma, es una cadena de
  // teclas. Los idiomas con palabras sin vocales son cortas ("krk", "prst").
  if (letras >= 8 && contar_vocales(n) / letras < 0.15) return MOTIVOS.SIN_PALABRAS;

  const palabras = palabras_de(n).filter((p) => /[a-z]/.test(p));
  if (palabras.length > 0) {
    const con_vocal = palabras.filter((p) => /[aeiou]/.test(p) || p.length <= 3);
    if (con_vocal.length === 0) return MOTIVOS.SIN_PALABRAS;
  }

  return null;
}

function senales_de_spam(texto, normalizado) {
  const senales = [];
  if (contiene(normalizado, SPAM_FUERTE)) senales.push(MOTIVOS.SPAM_FUERTE);
  const debiles = SPAM_DEBIL.filter((f) => ` ${normalizado} `.includes(` ${f} `));
  if (debiles.length >= 2) senales.push(MOTIVOS.SPAM_ACUMULADO);
  const url = URL_RE.test(String(texto));
  const menciones = (String(texto).match(/@[A-Za-z0-9._]{2,}/g) || []).length;
  const hashtags = (String(texto).match(/#[^\s#]+/g) || []).length;
  if (url && (debiles.length >= 1 || hashtags >= 3)) senales.push(MOTIVOS.SPAM_ACUMULADO);
  if (menciones >= 3 && url) senales.push(MOTIVOS.SPAM_ACUMULADO);
  if (hashtags >= 8) senales.push(MOTIVOS.SPAM_ACUMULADO);
  return Array.from(new Set(senales));
}

// ---------------------------------------------------------------------------
// la tabla cerrada
// ---------------------------------------------------------------------------

/**
 * Clasificacion determinista. Orden de precedencia, y por que:
 *   1. queja — si hay lexico de queja, gana aunque el resto sea ruido: el coste
 *      de equivocarse (silenciar una reclamacion) es el mas alto.
 *   2. ininteligible — no se puede clasificar lo que no se lee.
 *   3. spam — solo por forma reconocible; nunca por "me suena raro".
 *   4. pedido, 5. agradecimiento, 6. consulta.
 *   7. sin senal clara → consulta (se responde; callar por defecto pierde gente).
 */
function por_tabla(texto) {
  const ilegible = motivo_ilegible(texto);
  if (ilegible) {
    return { clase: 'ininteligible', motivo: ilegible, motivos: [ilegible] };
  }

  const n = normalizar(texto);

  if (contiene(n, QUEJA)) return { clase: 'queja', motivo: MOTIVOS.LEXICO_DE_QUEJA, motivos: [MOTIVOS.LEXICO_DE_QUEJA] };

  const spam = senales_de_spam(texto, n);
  if (spam.length) return { clase: 'spam', motivo: spam[0], motivos: spam };

  if (contiene(n, PEDIDO)) return { clase: 'pedido', motivo: MOTIVOS.LEXICO_DE_PEDIDO, motivos: [MOTIVOS.LEXICO_DE_PEDIDO] };
  // Consulta antes que agradecimiento: "gracias, ¿me dices el horario?" pide
  // una respuesta; quedarse con el "gracias" y callar seria oir la mitad.
  if (contiene(n, CONSULTA)) return { clase: 'consulta', motivo: MOTIVOS.LEXICO_DE_CONSULTA, motivos: [MOTIVOS.LEXICO_DE_CONSULTA] };
  if (contiene(n, AGRADECIMIENTO)) return { clase: 'agradecimiento', motivo: MOTIVOS.LEXICO_DE_AGRADECIMIENTO, motivos: [MOTIVOS.LEXICO_DE_AGRADECIMIENTO] };

  return { clase: 'consulta', motivo: MOTIVOS.SIN_SENAL_CLARA, motivos: [MOTIVOS.SIN_SENAL_CLARA] };
}

// ---------------------------------------------------------------------------
// el juicio (opcional) y sus limites
// ---------------------------------------------------------------------------

function pedir_juicio(juicio, peticion) {
  if (typeof juicio !== 'function') return { ok: false, motivo: MOTIVOS.JUICIO_INVALIDO };
  let r;
  try {
    r = juicio(peticion);
  } catch (err) {
    return { ok: false, motivo: MOTIVOS.JUICIO_INVALIDO, detalle: err && err.message };
  }
  // Sincrono a proposito: un juicio que devuelve una promesa no cabe en una
  // pieza pura, y esperarlo convertiria el clasificador en IO.
  if (r && typeof r.then === 'function') return { ok: false, motivo: MOTIVOS.JUICIO_INVALIDO, detalle: 'juicio_asincrono' };
  const clase = typeof r === 'string' ? r : (es_objeto(r) ? r.clase : null);
  if (!texto_no_vacio(clase) || !CLASES.includes(String(clase).trim())) {
    return { ok: false, motivo: MOTIVOS.JUICIO_INVALIDO };
  }
  return {
    ok: true,
    clase: String(clase).trim(),
    motivo: es_objeto(r) && texto_no_vacio(r.motivo) ? String(r.motivo).trim() : MOTIVOS.JUICIO,
    delicado: es_objeto(r) && r.delicado === true,
    confianza: es_objeto(r) && Number.isFinite(r.confianza) ? Number(r.confianza) : null
  };
}

/**
 * Aplica las reglas duras a una clase, venga de la tabla o del juicio. El
 * juicio puede afinar la clase; NO puede ablandar estas tres:
 *   - queja → delicada y escalada;
 *   - ininteligible → delicada, escalada y NO descartable;
 *   - spam → archivada (y solo spam puede archivarse).
 */
function armar(clase, extra) {
  const c = CLASES.includes(clase) ? clase : 'ininteligible';
  const delicado = c === 'queja' || c === 'ininteligible';
  const destino = delicado ? 'escalar' : (c === 'spam' ? 'archivar' : 'responder');
  const base = {
    ok: true,
    clase: c,
    delicado,
    destino,
    escala_a: delicado ? 'persona' : null,
    requiere_persona: delicado,
    se_responde: destino === 'responder',
    se_archiva: destino === 'archivar',
    // "Descartar" es la unica cosa que la regla prohibe a lo ininteligible.
    se_descarta: destino === 'archivar',
    revisar: delicado,
    motivos: [],
    via: 'tabla',
    confianza: null
  };
  return Object.assign(base, extra || {});
}

// ---------------------------------------------------------------------------
// la pieza
// ---------------------------------------------------------------------------

function leer_entrada(entrada) {
  if (typeof entrada === 'string') return { texto: entrada, remitente: null, tipo: 'dm' };
  if (!es_objeto(entrada)) return { texto: '', remitente: null, tipo: 'dm' };
  const texto = typeof entrada.texto === 'string' ? entrada.texto
    : (typeof entrada.mensaje === 'string' ? entrada.mensaje : '');
  return {
    texto,
    remitente: texto_no_vacio(entrada.remitente) ? String(entrada.remitente).trim() : null,
    tipo: texto_no_vacio(entrada.tipo) ? String(entrada.tipo).trim() : 'dm'
  };
}

/**
 * Clasifica lo que llega. No lanza NUNCA y no falla por no haber LLM.
 *
 * @param {string|{texto?:string, mensaje?:string, remitente?:string, tipo?:string}} entrada
 * @param {{juicio?:Function}} [opciones] juicio sincrono opcional
 * @returns {object} {ok, clase, delicado, destino, ...}
 */
function clasificar(entrada, opciones) {
  let leido;
  try {
    leido = leer_entrada(entrada);
    const o = es_objeto(opciones) ? opciones : {};
    const tabla = por_tabla(leido.texto);

    // Dos suelos que el juicio no puede bajar: lo que no se lee y lo que es
    // una queja. Un modelo puede afinar entre consulta/pedido/spam; no puede
    // convertir una reclamacion en otra cosa.
    if (tabla.clase === 'queja') {
      return armar('queja', {
        motivos: tabla.motivos,
        motivo: tabla.motivo,
        via: 'tabla',
        texto: leido.texto,
        remitente: leido.remitente,
        tipo: leido.tipo,
        avisos: o.juicio ? [MOTIVOS.JUICIO_NO_BAJA_QUEJA] : []
      });
    }

    // Un texto ilegible no se pregunta a nadie: no hay nada que preguntar.
    if (tabla.clase === 'ininteligible') {
      const r = armar('ininteligible', {
        motivos: tabla.motivos,
        motivo: tabla.motivo,
        via: 'tabla',
        texto: leido.texto,
        remitente: leido.remitente,
        tipo: leido.tipo,
        avisos: o.juicio ? [MOTIVOS.JUICIO_DESCARTADO] : []
      });
      return r;
    }

    if (o.juicio) {
      const j = pedir_juicio(o.juicio, {
        texto: leido.texto,
        remitente: leido.remitente,
        tipo: leido.tipo,
        clases: CLASES.slice()
      });
      if (j.ok) {
        const r = armar(j.clase, {
          motivos: [j.motivo],
          motivo: j.motivo,
          via: 'juicio',
          confianza: j.confianza,
          delicado_sugerido: j.delicado,
          texto: leido.texto,
          remitente: leido.remitente,
          tipo: leido.tipo,
          avisos: []
        });
        // El juicio puede SUBIR la delicadeza, nunca bajarla: si dice que el
        // mensaje necesita a una persona, va a una persona aunque su clase no
        // lo diga. Y nada de lo delicado se archiva.
        if (j.delicado && !r.delicado) {
          r.delicado = true;
          r.destino = 'escalar';
          r.escala_a = 'persona';
          r.requiere_persona = true;
          r.se_responde = false;
          r.se_archiva = false;
          r.se_descarta = false;
          r.revisar = true;
        }
        return r;
      }
      const r = armar(tabla.clase, {
        motivos: tabla.motivos.concat([MOTIVOS.JUICIO_INVALIDO]),
        motivo: tabla.motivo,
        via: 'tabla',
        texto: leido.texto,
        remitente: leido.remitente,
        tipo: leido.tipo,
        avisos: [MOTIVOS.JUICIO_INVALIDO]
      });
      return r;
    }

    return armar(tabla.clase, {
      motivos: tabla.motivos,
      motivo: tabla.motivo,
      via: 'tabla',
      texto: leido.texto,
      remitente: leido.remitente,
      tipo: leido.tipo,
      avisos: []
    });
  } catch (err) {
    // Ultimo suelo: si algo se rompe, el mensaje NO se pierde ni se descarta.
    return armar('ininteligible', {
      motivo: MOTIVOS.FALLO_DE_CLASIFICACION,
      motivos: [MOTIVOS.FALLO_DE_CLASIFICACION],
      via: 'fallback',
      detalle: err && err.message,
      texto: leido ? leido.texto : '',
      remitente: leido ? leido.remitente : null,
      tipo: leido ? leido.tipo : 'dm',
      avisos: [MOTIVOS.FALLO_DE_CLASIFICACION]
    });
  }
}

module.exports = {
  CLASES,
  DESTINOS,
  MOTIVOS,
  PEDIDO,
  AGRADECIMIENTO,
  CONSULTA,
  SPAM_FUERTE,
  SPAM_DEBIL,
  motivo_ilegible,
  por_tabla,
  armar,
  clasificar
};

module.exports.ClasificadorDeLlegada = Object.freeze({
  clasificar,
  por_tabla,
  CLASES,
  MOTIVOS
});

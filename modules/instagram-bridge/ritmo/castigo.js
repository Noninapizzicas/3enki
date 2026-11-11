'use strict';

/**
 * castigo — G2 · LectorDeCastigo · MICRO-AGENTE.
 *
 * Lee la senal de castigo de la plataforma y la CLASIFICA. No mira la pantalla
 * (eso es el observador) y no decide si se para o no (eso es G6): su unico
 * trabajo es decir en que clase cae lo que ya se ha visto.
 *
 * Tres clases, y nada mas:
 *   firme   — la plataforma ha dicho que no, con palabras: limite de uso,
 *             accion bloqueada, cuenta restringida. Se puede parar, y se para
 *             hasta el FIN que la senal declare.
 *   dudosa  — hay algo raro pero no se puede confirmar: texto ambiguo, error
 *             desconocido, mirada parcial, senal que se contradice. BAJA el
 *             ritmo; NO para.
 *   ausente — no hay senal. No es una buena noticia: es la ausencia de dato.
 *
 * La regla que sostiene todo lo demas: **la duda se resuelve como dudosa**.
 * Un texto que no se reconoce no se lee como "no pasa nada"; se lee como
 * "podria estar pasando algo", y esa lectura solo cuesta ritmo. Lo contrario
 * —leer la duda como permiso— es como se quema una cuenta un martes por la
 * tarde sin que nadie sepa por que.
 *
 * Sin LLM funciona igual: las reglas cubren las senales conocidas y lo que no
 * cubren cae en `dudosa` por construccion. Si hay clasificador disponible
 * (`opciones.clasificador`), su juicio se acepta SOLO si es valido, y nunca
 * puede BORRAR una senal firme que esta escrita en el texto: lo que la
 * plataforma dijo, escrito esta.
 *
 * Puro: sin red, sin reloj. El `momento` entra por parametro y el fin se
 * calcula sobre el.
 */

const { es_objeto, es_instante, texto_no_vacio } = require('../core/formas');
const ritmo = require('../core/ritmo');

const CLASES = Object.freeze(['firme', 'dudosa', 'ausente']);

const FAMILIAS = Object.freeze([
  'bloqueo_de_cuenta',
  'restriccion_de_accion',
  'limite_de_uso',
  'senal_ambigua',
  'error_desconocido',
  'sin_senal'
]);

// ---------------------------------------------------------------------------
// La tabla de patrones. `clase` es lo que la frase PRUEBA, no lo que sugiere.
// Se evalua en orden: primero los firmes (de mas grave a menos), despues los
// ambiguos. Un texto puede casar con varios; gana el primero de la lista.
// ---------------------------------------------------------------------------
const REGLAS = Object.freeze([
  {
    familia: 'bloqueo_de_cuenta',
    clase: 'firme',
    // "Tu cuenta ha sido suspendida" (sujeto primero) y "hemos restringido tu
    // cuenta" (verbo primero): la plataforma no siempre escribe igual.
    patron: /(cuenta|account)[^.]{0,40}(suspendid|bloquead|restringid|desactivad|disabled|suspended|restricted)|(suspendid|bloquead|restringid|desactivad)[^.]{0,30}(cuenta|account)|checkpoint_required|challenge_required/
  },
  {
    familia: 'restriccion_de_accion',
    clase: 'firme',
    // "Accion bloqueada", "no podemos realizar esta accion ahora"
    patron: /accion[^.]{0,30}(bloquead|restringid|no permitida|not allowed)|(action|activity)[^.]{0,30}(blocked|not allowed)|no podemos (realizar|procesar|completar) (esta|tu)/
  },
  {
    familia: 'limite_de_uso',
    clase: 'firme',
    // "Intenta de nuevo mas tarde", "demasiadas solicitudes", "rate limit"
    patron: /(intenta|intentalo|intentelo|vuelve)[^.]{0,25}(de nuevo |lo )?(mas tarde|luego)|demasiad[oa]s (solicitudes|acciones|intentos|peticiones)|rate.?limit|too many requests|espera \d+ (segundo|minuto|hora)/
  },
  {
    familia: 'senal_ambigua',
    clase: 'dudosa',
    // "Algo ha ido mal", "vuelve a intentarlo", avisos sin sujeto
    patron: /algo (ha ido mal|salio mal|no va bien)|vuelve a intentarlo|ha ocurrido un error|se ha producido un error|revisa tu actividad|aviso de seguridad|advertencia/
  },
  {
    familia: 'error_desconocido',
    clase: 'dudosa',
    // Un error sin familia no es "nada": es una incognita
    patron: /error( desconocido| inesperado| interno)?|no se pudo (completar|cargar|enviar)|fallo (de red|temporal)|try again later/
  }
]);

// Fin declarado cuando la senal NO dice cuanto dura. No es el mismo para todo:
// una senal firme sin plazo se respeta un dia; una duda, unas horas.
const FIN_POR_DEFECTO_HORAS = Object.freeze({ firme: 24, dudosa: 6 });

// Un plazo declarado mas largo que esto se respeta pero se marca: por encima de
// un mes, el "fin" es una forma educada de decir "para siempre".
const MAXIMO_DECLARADO_HORAS = 24 * 30;

const CODIGOS = Object.freeze({
  SIN_SENAL: 'sin_senal',
  SIN_MOMENTO: 'sin_momento',
  CLASIFICADOR_INVALIDO: 'clasificador_invalido'
});

// ---- utilidades -----------------------------------------------------------

function normalizar_texto(texto) {
  if (typeof texto !== 'string') return '';
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes: "acción" y "accion" son la misma senal
    .replace(/\s+/g, ' ')
    .trim();
}

/** Todo el texto observable de una senal, en una sola cadena normalizada. */
function texto_de(senal) {
  if (typeof senal === 'string') return normalizar_texto(senal);
  if (!es_objeto(senal)) return '';
  const partes = [];
  if (texto_no_vacio(senal.texto)) partes.push(senal.texto);
  if (Array.isArray(senal.indicios)) {
    for (const indicio of senal.indicios) if (texto_no_vacio(indicio)) partes.push(indicio);
  }
  if (texto_no_vacio(senal.pantalla)) partes.push(senal.pantalla);
  return normalizar_texto(partes.join(' . '));
}

// ---- fin declarado --------------------------------------------------------

const UNIDADES_MINUTOS = Object.freeze({
  segundo: 1 / 60,
  segundos: 1 / 60,
  minuto: 1,
  minutos: 1,
  hora: 60,
  horas: 60,
  dia: 1440,
  dias: 1440,
  semana: 10080,
  semanas: 10080
});

/**
 * Minutos declarados en el texto ("en 5 minutos", "durante 24 horas", "1 dia").
 * `null` si no hay plazo escrito. Se toma el PRIMER plazo: si la senal dice
 * "espera 5 minutos" y luego "en 24 horas", el que manda es el corto.
 */
function minutos_declarados(texto) {
  const plano = normalizar_texto(texto);
  if (!plano) return null;
  const m = plano.match(/(\d{1,4})\s*(segundos?|minutos?|horas?|dias?|semanas?)/);
  if (!m) return null;
  const cantidad = Number(m[1]);
  const unidad = m[2];
  const factor = UNIDADES_MINUTOS[unidad];
  if (!Number.isFinite(cantidad) || !Number.isFinite(factor)) return null;
  return Math.round(cantidad * factor);
}

/**
 * Fin declarado de la presion. SIEMPRE hay fin cuando la clase es firme o
 * dudosa: si la senal no lo dice, lo pone esta pieza y lo dice (`fin_origen`).
 *
 * @param {*} senal
 * @param {'firme'|'dudosa'|'ausente'} clase
 * @param {string} momento instante ISO
 * @returns {{fin:string|null, fin_origen:string|null, minutos:number|null, tope:boolean}}
 */
function fin_de(senal, clase, momento) {
  if (!es_instante(momento) || clase === 'ausente') {
    return { fin: null, fin_origen: null, minutos: null, tope: false };
  }

  // 1 · la senal trae el fin explicito
  if (es_objeto(senal) && es_instante(senal.hasta) && ritmo.antes_de(momento, senal.hasta)) {
    const minutos = ritmo.minutos_entre(momento, senal.hasta);
    return { fin: senal.hasta, fin_origen: 'senal', minutos, tope: minutos !== null && minutos > MAXIMO_DECLARADO_HORAS * 60 };
  }

  // 2 · el plazo esta escrito en el texto
  const declarados = minutos_declarados(texto_de(senal));
  if (declarados !== null && declarados > 0) {
    const minutos = Math.min(declarados, MAXIMO_DECLARADO_HORAS * 60);
    return {
      fin: ritmo.desplazar(momento, minutos),
      fin_origen: 'texto',
      minutos,
      tope: minutos < declarados
    };
  }

  // 3 · la senal no dice nada: lo declara el puente, y se sabe cual
  const horas = FIN_POR_DEFECTO_HORAS[clase] || FIN_POR_DEFECTO_HORAS.dudosa;
  return {
    fin: ritmo.desplazar(momento, horas * 60),
    fin_origen: 'por_defecto',
    minutos: horas * 60,
    tope: false
  };
}

// ---- clasificacion --------------------------------------------------------

/**
 * Evalua las reglas. Devuelve la clase y las reglas que casaron (la evidencia;
 * sin ella, "creo que hay castigo" no es un juicio, es una corazonada).
 */
function por_reglas(senal) {
  const plano = texto_de(senal);
  const casadas = [];
  if (!plano) {
    const parcial = es_objeto(senal) && senal.mirada === 'parcial';
    return {
      clase: parcial ? 'dudosa' : 'ausente',
      familia: parcial ? 'senal_ambigua' : 'sin_senal',
      evidencia: [],
      motivo: parcial
        ? 'mirada parcial sin texto: no se puede afirmar que no haya castigo'
        : 'no hay senal observada'
    };
  }
  for (const regla of REGLAS) {
    if (regla.patron.test(plano)) casadas.push({ familia: regla.familia, clase: regla.clase });
  }
  if (casadas.length === 0) {
    return {
      clase: 'dudosa',
      familia: 'senal_ambigua',
      evidencia: [],
      motivo: 'hay texto pero ninguna regla lo reconoce: la duda se resuelve como dudosa'
    };
  }
  const firme = casadas.find((c) => c.clase === 'firme');
  const elegida = firme || casadas[0];
  return {
    clase: elegida.clase,
    familia: elegida.familia,
    evidencia: casadas,
    motivo: firme
      ? `la senal dice explicitamente que no (${elegida.familia})`
      : `la senal es ambigua (${elegida.familia}); se lee como dudosa`
  };
}

function _clasificador_valido(j) {
  return es_objeto(j)
    && CLASES.includes(String(j.clase))
    && (j.familia === undefined || FAMILIAS.includes(String(j.familia)));
}

/**
 * Juzga una senal ya observada.
 *
 * @param {*} senal  `{texto?, indicios?:string[], mirada?:'completa'|'parcial', hasta?:instante, momento?:instante}`
 *                   o directamente el texto
 * @param {{momento?:string, clasificador?:(senal:*) => (object|null)}} [opciones]
 * @returns {{ok:boolean, clase:string, familia:string, fin:string|null,
 *            fin_origen:string|null, confianza:number, origen:string,
 *            evidencia:object[], motivo:string, llm:string}}
 */
function juzgar(senal, opciones = {}) {
  const o = es_objeto(opciones) ? opciones : {};
  const momento = es_instante(o.momento) ? o.momento
    : (es_objeto(senal) && es_instante(senal.momento) ? senal.momento : null);

  const reglas = por_reglas(senal);
  let clase = reglas.clase;
  let familia = reglas.familia;
  let evidencia = reglas.evidencia;
  let origen = 'reglas';
  let motivo = reglas.motivo;
  let llm = 'no_oferta';
  let confianza = clase === 'firme' ? 0.9 : (clase === 'dudosa' ? 0.5 : 0.99);

  // El clasificador es opcional y NUNCA puede empeorar la prudencia.
  if (typeof o.clasificador === 'function') {
    let salida = null;
    try {
      salida = o.clasificador(senal);
    } catch (err) {
      salida = null;
      llm = 'fallo';
    }
    if (_clasificador_valido(salida)) {
      const propuesta = String(salida.clase);
      const firmeEscrita = reglas.evidencia.some((c) => c.clase === 'firme');
      // Lo que la plataforma escribio no lo borra un modelo.
      if (firmeEscrita && propuesta === 'ausente') {
        llm = 'rechazado';
        motivo = `${motivo} (el clasificador propuso 'ausente' y hay senal firme escrita: se descarta)`;
      } else {
        clase = propuesta;
        if (salida.familia !== undefined) familia = String(salida.familia);
        if (Number.isFinite(Number(salida.confianza))) confianza = Math.min(1, Math.max(0, Number(salida.confianza)));
        origen = 'llm';
        llm = llm === 'fallo' ? 'fallo' : 'usado';
        motivo = texto_no_vacio(salida.motivo) ? String(salida.motivo) : motivo;
        if (Array.isArray(salida.evidencia)) evidencia = salida.evidencia;
      }
    } else if (llm !== 'fallo') {
      llm = 'rechazado';
    }
  }

  if (!es_instante(momento) && clase !== 'ausente') {
    // Sin instante no se puede declarar un fin, y sin fin no hay castigo que
    // respetar sin volverlo eterno: se devuelve el juicio con el hueco nombrado.
    return {
      ok: false,
      motivo: CODIGOS.SIN_MOMENTO,
      faltan: ['momento'],
      clase,
      familia,
      fin: null,
      fin_origen: null,
      confianza,
      origen,
      evidencia,
      llm,
      detalle: motivo
    };
  }

  const plazo = fin_de(senal, clase, momento);

  return {
    ok: true,
    clase,
    familia,
    fin: plazo.fin,
    fin_origen: plazo.fin_origen,
    minutos: plazo.minutos,
    tope: plazo.tope,
    confianza,
    origen,
    llm,
    evidencia,
    motivo,
    momento: momento || null
  };
}

/** ¿Esta clase autoriza a PARAR? Solo la firme. (G6 lo usa; no decide por su cuenta.) */
function es_parada(juicio) {
  return es_objeto(juicio) && juicio.clase === 'firme';
}

/** ¿Esta clase obliga a BAJAR el ritmo sin parar? */
function obliga_a_bajar(juicio) {
  return es_objeto(juicio) && juicio.clase === 'dudosa';
}

/** La presion que consume G6: solo lo que el regulador necesita saber. */
function presion_de(juicio) {
  const j = es_objeto(juicio) ? juicio : {};
  return {
    clase: CLASES.includes(String(j.clase)) ? String(j.clase) : 'dudosa',
    familia: j.familia || 'senal_ambigua',
    fin: es_instante(j.fin) ? j.fin : null,
    fin_origen: j.fin_origen || null
  };
}

/** Tabla de patrones en claro, para leerla y para probarla. */
function patrones() {
  return REGLAS.map((r) => ({ familia: r.familia, clase: r.clase, fuente: r.patron.source }));
}

module.exports = {
  CLASES,
  FAMILIAS,
  REGLAS,
  FIN_POR_DEFECTO_HORAS,
  MAXIMO_DECLARADO_HORAS,
  CODIGOS,
  normalizar_texto,
  texto_de,
  minutos_declarados,
  fin_de,
  por_reglas,
  juzgar,
  es_parada,
  obliga_a_bajar,
  presion_de,
  patrones
};

// Vista "clase" para quien prefiera el nombre del diseno (G2 · LectorDeCastigo).
module.exports.LectorDeCastigo = Object.freeze({
  juzgar,
  por_reglas,
  fin_de,
  es_parada,
  obliga_a_bajar,
  presion_de
});

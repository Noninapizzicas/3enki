'use strict';

/**
 * alcance — S2 · DetectorDeFueraDeAlcance · REFLEJO (reglas, no LLM).
 *
 * El puente hace UNA cosa: operar la cuenta de un proyecto. Todo lo que sea
 * CRECIMIENTO —conseguir seguidores, escribir a mucha gente, gustar en masa,
 * "un poquito de cada"— esta fuera de alcance, y se rechaza **nombrando la
 * frontera**, no con un error del sistema: "esto no lo hago porque solo contesto
 * a quien me escribio".
 *
 * SE DETECTA POR FORMA, NO POR TAMANO. "Manda el mismo texto a diez cuentas" es
 * pequeno y es exactamente el mismo patron que "manda el mismo texto a diez mil":
 * lo que lo hace fuera de alcance no es el numero, es que el mensaje no es una
 * respuesta a nadie. Diez cuentas distintas con el mismo texto son diez envios
 * que nadie pidio.
 *
 * LA REGLA QUE PROTEGE AL USUARIO LEGITIMO:
 *   - repetir SU PROPIO mensaje no es volumen: si la misma cuenta nos escribe
 *     tres veces, es una persona insistiendo, y se le contesta;
 *   - contestar a diez personas con diez respuestas distintas es el trabajo
 *     normal del puente, y no se toca;
 *   - solo cuenta el patron de MUCHAS CUENTAS DISTINTAS con EL MISMO texto.
 * Por eso se cuentan cuentas distintas (no mensajes), y por eso el texto se
 * compara normalizado y por parecido, no por identidad de bytes: "Hola! Te
 * cuento..." y "hola, te cuento" son el mismo texto enviado dos veces.
 *
 * NO SE NEGOCIA. No hay "una version pequena" de mandar el mismo mensaje a
 * veinte cuentas: la version pequena es el mismo patron por otra puerta. La
 * respuesta es la frontera y el motivo, y ninguna propuesta alternativa.
 *
 * Puro: sin IO, sin reloj, sin red, sin estado global, sin LLM. La forma
 * declara `micro-agente`, pero lo que hay aqui son reglas deterministas: un
 * clasificador que a veces dice que si a mandar el mismo texto a diez cuentas no
 * es un detector, es una moneda.
 */

const { es_objeto, texto_no_vacio } = require('../core/formas');

/** Tres cuentas distintas con el mismo texto ya es un envio en serie. */
const UMBRAL_CUENTAS_DISTINTAS = 3;
/** Veinte destinatarios en una peticion ya es volumen, diga lo que diga el texto. */
const UMBRAL_DESTINATARIOS = 20;
/** Dos textos con este parecido (Jaccard de palabras) son "el mismo texto". */
const UMBRAL_PARECIDO = 0.85;
/** Un texto mas corto que esto no se compara por parecido: "ok" y "ok" no es un patron. */
const MINIMO_PALABRAS_PARA_PARECIDO = 4;

const MOTIVOS = Object.freeze({
  ENTRADA_INVALIDA: 'entrada_invalida',
  CONSEGUIR_SEGUIDORES: 'conseguir_seguidores',
  ESCRIBIR_A_MUCHOS: 'escribir_a_muchos',
  GUSTAR_EN_MASA: 'gustar_en_masa',
  UN_POCO_DE_CADA: 'un_poquito_de_cada',
  MISMO_TEXTO_A_VARIAS_CUENTAS: 'mismo_texto_a_varias_cuentas',
  VOLUMEN: 'volumen',
  FUERA_DE_ALCANCE: 'fuera_de_alcance'
});

/**
 * Tabla CERRADA de patrones de forma. Es una lista de frases, no una heuristica
 * difusa: cada patron esta aqui porque es una peticion de crecimiento escrita
 * con esas palabras o con sus equivalentes directos.
 *
 * EL ORDEN ES PARTE DE LA TABLA: se recorre de arriba abajo y manda el primero
 * que acierta, asi que el patron MAS ESPECIFICO va antes. "Un poquito de cada a
 * todos" es, a la vez, "un poquito de cada" y "a todos": lo primero dice mejor
 * que pasa (volumen pequeno repetido), y es lo que se le contesta al dueno.
 */
const PATRONES = Object.freeze([
  {
    motivo: MOTIVOS.CONSEGUIR_SEGUIDORES,
    re: /\b(conseguir|ganar|subir|aumentar|multiplicar)\s+(seguidores|fans|audiencia|alcance)\b|\bmas\s+seguidores\b|\bcrecer\s+(la\s+)?cuenta\b/i,
    frontera: 'no consigo seguidores: opero una cuenta que ya tiene su publico'
  },
  {
    motivo: MOTIVOS.UN_POCO_DE_CADA,
    re: /\bun\s+poquit(?:o|ito)\s+de\s+cada\b|\bun\s+poco\s+de\s+cada(\s+uno)?\b|\ba\s+cada\s+uno\s+un\s+poco\b|\bpoquit(?:o|ito)\s+a\s+poquit(?:o|ito)\b|\bde\s+uno\s+en\s+uno\s+a\s+todos\b/i,
    frontera: 'el volumen pequeno repetido es el mismo patron por otra puerta'
  },
  {
    motivo: MOTIVOS.GUSTAR_EN_MASA,
    re: /\b(?:dar|da|dale|poner|pon|ponle|dejar|deja)\s+(?:me\s+gusta|likes?)\b[^.?!]{0,40}\b(?:todos|todas|muchos|muchas|varias|cientos|miles)\b|\bseguir\s+a\s+(?:todos|muchos|cientos|miles)\b|\bfollow\s*(?:back|for\s*follow)\b|\bf4f\b/i,
    frontera: 'no doy me gusta ni sigo en masa: eso es crecimiento, no operacion'
  },
  {
    motivo: MOTIVOS.ESCRIBIR_A_MUCHOS,
    re: /\b(?:mand\w*|envi\w*|escrib\w*|contact\w*|difund\w*)\b[^.?!]{0,40}\b(?:a\s+)?(?:todos|todas|muchos|muchas|cientos|miles|mis\s+contactos|la\s+lista|mi\s+lista)\b|\b(?:hacer|mandar|enviar|montar)\s+(?:spam|difusion|mailing)\b|\b(?:el\s+mismo|la\s+misma)\s+(?:mensaje|texto|comentario)\s+a\b/i,
    frontera: 'no escribo a quien no me ha escrito primero'
  }
]);

// ---------------------------------------------------------------------------
// utilidades puras
// ---------------------------------------------------------------------------

function normalizar_texto(texto) {
  if (!texto_no_vacio(texto)) return '';
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function palabras(texto) {
  const n = normalizar_texto(texto);
  return n === '' ? [] : n.split(' ');
}

/**
 * Parecido entre dos textos: Jaccard sobre el conjunto de palabras. Determinista,
 * sin dependencias y suficiente para el caso real (el mismo mensaje con otra
 * puntuacion, otro saludo o una palabra cambiada).
 */
function parecido(a, b) {
  const pa = palabras(a);
  const pb = palabras(b);
  if (pa.length < MINIMO_PALABRAS_PARA_PARECIDO || pb.length < MINIMO_PALABRAS_PARA_PARECIDO) return 0;
  const sa = new Set(pa);
  const sb = new Set(pb);
  let comunes = 0;
  for (const p of sa) if (sb.has(p)) comunes += 1;
  const union = sa.size + sb.size - comunes;
  return union === 0 ? 0 : comunes / union;
}

function mismo_texto(a, b) {
  const na = normalizar_texto(a);
  const nb = normalizar_texto(b);
  if (na === '' || nb === '') return false;
  if (na === nb) return true;
  return parecido(a, b) >= UMBRAL_PARECIDO;
}

function normalizar_cuenta(v) {
  if (!texto_no_vacio(v)) return null;
  return String(v).trim().replace(/^@+/, '').toLowerCase();
}

// ---------------------------------------------------------------------------
// volumen pequeno repetido
// ---------------------------------------------------------------------------

/**
 * EL PATRON QUE SE BUSCA, en una funcion: cuentas DISTINTAS que reciben el MISMO
 * texto. Repetir el mensaje de una misma cuenta no cuenta (es una persona
 * insistiendo); repetir el nuestro a la misma cuenta tampoco.
 *
 * @param {{texto:string, cuenta_propia?:string,
 *          destinatarios:Array<{cuenta?:string, texto?:string}>}} envio
 * @returns {{fuera:boolean, motivo?:string, cuentas_distintas:number,
 *            con_el_mismo_texto:number, texto_repetido?:string}}
 */
function es_volumen_pequeno_repetido(envio) {
  const e = es_objeto(envio) ? envio : {};
  const propia = normalizar_cuenta(e.cuenta_propia);
  const lista = Array.isArray(e.destinatarios) ? e.destinatarios.filter(es_objeto) : [];
  const texto = texto_vacio(e.texto) ? null : String(e.texto);

  // Cuentas distintas (una persona que aparece cinco veces es UNA persona).
  const cuentas = new Set();
  for (const d of lista) {
    const c = normalizar_cuenta(d.cuenta);
    if (!c || c === propia) continue;
    cuentas.add(c);
  }

  // Cada destinatario con su texto: el global si no trae el suyo.
  const textos = lista
    .filter((d) => normalizar_cuenta(d.cuenta) && normalizar_cuenta(d.cuenta) !== propia)
    .map((d) => ({ cuenta: normalizar_cuenta(d.cuenta), texto: texto_vacio(d.texto) ? texto : String(d.texto) }))
    .filter((d) => d.texto !== null && normalizar_texto(d.texto) !== '');

  // Agrupa por texto: la primera cuenta que lo mando es la referencia.
  const grupos = [];
  for (const d of textos) {
    let g = grupos.find((x) => mismo_texto(x.texto, d.texto));
    if (!g) {
      g = { texto: d.texto, cuentas: new Set() };
      grupos.push(g);
    }
    g.cuentas.add(d.cuenta);
  }

  let mayor = null;
  for (const g of grupos) if (!mayor || g.cuentas.size > mayor.cuentas.size) mayor = g;

  const repetido = mayor ? mayor.cuentas.size : 0;
  const fuera = repetido >= UMBRAL_CUENTAS_DISTINTAS;

  return {
    fuera,
    motivo: fuera ? MOTIVOS.MISMO_TEXTO_A_VARIAS_CUENTAS : null,
    cuentas_distintas: cuentas.size,
    con_el_mismo_texto: repetido,
    texto_repetido: fuera ? mayor.texto : null,
    umbral: UMBRAL_CUENTAS_DISTINTAS
  };
}

function texto_vacio(v) {
  return !texto_no_vacio(v);
}

// ---------------------------------------------------------------------------
// frases de frontera
// ---------------------------------------------------------------------------

const FRASES = Object.freeze({
  [MOTIVOS.CONSEGUIR_SEGUIDORES]: 'Esto no lo hago: no consigo seguidores. Opero una cuenta que ya tiene su publico.',
  [MOTIVOS.ESCRIBIR_A_MUCHOS]: 'Esto no lo hago: solo contesto a quien me ha escrito primero, y no escribo a listas.',
  [MOTIVOS.GUSTAR_EN_MASA]: 'Esto no lo hago: no doy me gusta ni sigo en masa. Eso es crecimiento, no operacion.',
  [MOTIVOS.UN_POCO_DE_CADA]: 'Esto no lo hago: un poquito a cada uno es el mismo envio en serie con otro nombre.',
  [MOTIVOS.MISMO_TEXTO_A_VARIAS_CUENTAS]: 'Esto no lo hago: el mismo mensaje a varias cuentas no es una respuesta, es un envio en serie.',
  [MOTIVOS.VOLUMEN]: 'Esto no lo hago: no mando mensajes en volumen. Solo contesto a quien me ha escrito primero.',
  [MOTIVOS.FUERA_DE_ALCANCE]: 'Esto no lo hago: esta fuera de lo que hago con esta cuenta.'
});

/** La frase que se le dice al dueno. Nombra la frontera; no es un error tecnico. */
function responder_frontera(peticion) {
  const motivo = es_objeto(peticion) && texto_no_vacio(peticion.motivo)
    ? String(peticion.motivo).trim()
    : (es_objeto(peticion) && texto_no_vacio(peticion.motivo_del_patron) ? String(peticion.motivo_del_patron).trim() : null);
  if (motivo && FRASES[motivo]) return FRASES[motivo];
  return FRASES[MOTIVOS.FUERA_DE_ALCANCE];
}

function fuera(motivo, extra) {
  return Object.assign({
    ok: true,
    estado: 'fuera',
    dentro: false,
    motivo,
    frase: FRASES[motivo] || FRASES[MOTIVOS.FUERA_DE_ALCANCE],
    negociable: false
  }, extra || {});
}

function dentro(extra) {
  return Object.assign({ ok: true, estado: 'dentro', dentro: true, motivo: null }, extra || {});
}

// ---------------------------------------------------------------------------
// detectar
// ---------------------------------------------------------------------------

/**
 * ¿Esta peticion es la operacion de una cuenta, o es crecimiento?
 *
 * Acepta las dos formas reales:
 *   - una PETICION en lenguaje del dueno: `{texto}` — se mira la forma;
 *   - un ENVIO preparado: `{texto, destinatarios:[...]}` — se mira ademas si es
 *     el mismo texto a muchas cuentas distintas.
 *
 * @param {{texto?:string, destinatarios?:Array, destinatario?:string,
 *          cuenta_propia?:string}} peticion
 * @param {{rol?:string}} [interlocutor]
 */
function detectar(peticion, interlocutor) {
  const p = es_objeto(peticion) ? peticion : {};
  const texto = texto_no_vacio(p.texto) ? String(p.texto) : (texto_no_vacio(p.peticion) ? String(p.peticion) : null);
  const quien = es_objeto(interlocutor) && texto_no_vacio(interlocutor.rol) ? String(interlocutor.rol) : null;

  // ---- 1 · la forma de la peticion --------------------------------------
  for (const patron of PATRONES) {
    if (texto !== null && patron.re.test(texto)) {
      // Un dueno puede PEDIR cualquier cosa; lo que no puede es que el puente lo
      // haga. La frontera se nombra igual, y por eso el motivo no cambia con el
      // rol: lo que cambia es a quien se le dice.
      return fuera(patron.motivo, { patron: patron.re.source, frontera: patron.frontera, rol: quien });
    }
  }

  // ---- 2 · el envio preparado -------------------------------------------
  const destinatarios = Array.isArray(p.destinatarios) ? p.destinatarios : null;
  if (destinatarios !== null) {
    if (destinatarios.length >= UMBRAL_DESTINATARIOS) {
      return fuera(MOTIVOS.VOLUMEN, { destinatarios: destinatarios.length, umbral: UMBRAL_DESTINATARIOS });
    }
    const volumen = es_volumen_pequeno_repetido({
      texto: texto,
      cuenta_propia: p.cuenta_propia,
      destinatarios
    });
    if (volumen.fuera) {
      return fuera(MOTIVOS.MISMO_TEXTO_A_VARIAS_CUENTAS, {
        cuentas_distintas: volumen.cuentas_distintas,
        con_el_mismo_texto: volumen.con_el_mismo_texto,
        umbral: volumen.umbral
      });
    }
    return dentro({ cuentas_distintas: volumen.cuentas_distintas, con_el_mismo_texto: volumen.con_el_mismo_texto });
  }

  // ---- 3 · sin texto no hay nada que detectar ---------------------------
  if (texto === null) {
    return { ok: false, estado: 'invalido', dentro: false, motivo: MOTIVOS.ENTRADA_INVALIDA, faltan: ['texto'] };
  }

  return dentro();
}

/** Azucar: ¿se puede hacer esto? (la pregunta que hace el borde antes de actuar). */
function esta_dentro(peticion, interlocutor) {
  return detectar(peticion, interlocutor).dentro === true;
}

function describir() {
  return {
    umbral_cuentas_distintas: UMBRAL_CUENTAS_DISTINTAS,
    umbral_destinatarios: UMBRAL_DESTINATARIOS,
    umbral_parecido: UMBRAL_PARECIDO,
    se_detecta_por: 'forma de la peticion, no por tamano',
    protege: 'repetir el propio mensaje no es volumen',
    patrones: PATRONES.map((p) => ({ motivo: p.motivo, frontera: p.frontera })),
    negociable: false
  };
}

module.exports = {
  UMBRAL_CUENTAS_DISTINTAS,
  UMBRAL_DESTINATARIOS,
  UMBRAL_PARECIDO,
  MOTIVOS,
  PATRONES,
  FRASES,
  normalizar_texto,
  parecido,
  mismo_texto,
  es_volumen_pequeno_repetido,
  responder_frontera,
  detectar,
  esta_dentro,
  describir
};

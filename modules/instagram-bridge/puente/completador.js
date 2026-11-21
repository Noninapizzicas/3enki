'use strict';

/**
 * completador — C2 · CompletadorDePeticion · MICRO-AGENTE.
 *
 * Cuando la boca ya sabe QUE se pide, casi nunca sabe TODO lo que hace falta:
 * «publica esto» no dice en que cuenta, «contesta» no dice a quien ni que.
 * Esta pieza completa lo que falta PREGUNTANDO, un dato cada vez, en el idioma
 * del dueno, y se para.
 *
 * LA REGLA DEL BLOQUE, Y POR QUE EXISTE:
 *   **una respuesta que NO ENCAJA se repregunta UNA VEZ, y luego se rinde con lo
 *   que tenga.**
 *   No se insiste en bucle. Un completador que repregunta hasta que el dueno
 *   escriba lo que el espera no es un asistente: es un formulario con mala
 *   educacion. Y rendirse tampoco es fallar: se devuelve lo que se tiene, lo que
 *   falta con su nombre y la decision de seguir o parar en manos del dueno.
 *   Insistir por tercera vez es la unica salida que no existe aqui.
 *
 * POR QUE UNA SOLA VEZ Y NO DOS:
 *   la primera respuesta rara suele ser prisa, un dedazo o una pregunta distinta
 *   a la que se hizo; la segunda ya es informacion: o el dueno no sabe el dato, o
 *   no quiere darlo, o la pregunta esta mal hecha. En los tres casos volver a
 *   preguntar no arregla nada y gasta la paciencia que hace falta para lo caro.
 *
 * QUE CUENTA COMO «NO ENCAJA» (y es la mitad del oficio):
 *   vacio, «no se», «da igual», «nada», un signo suelto, o un dato que no tiene
 *   la forma del campo (una cuenta que no parece una cuenta, una capacidad que no
 *   existe). Lo que no encaja NO se guarda: guardar un «no se» como texto de la
 *   pieza es como se publica un «no se».
 *
 * MICRO-AGENTE SIN LLM OBLIGATORIO: aqui no hay juicio que inyectar, y no hace
 * falta. Completar un hueco es una decision determinista: el campo tiene una
 * forma, la respuesta la tiene o no la tiene. Un modelo aqui solo añadiria una
 * forma de equivocarse. Nunca lanza.
 *
 * Puro: sin IO, sin red, sin reloj, sin estado global. El estado lo lleva quien
 * llama (es un objeto plano y serializable: se puede guardar entre dos mensajes).
 */

const { CAPACIDADES, normalizar } = require('./clasificador');

// Los huecos de cada capacidad, en el orden en que se preguntan: primero lo que
// no se puede deducir de nada (que se quiere), despues el donde.
const CAMPOS = Object.freeze({
  publicar: Object.freeze([
    Object.freeze({ campo: 'pieza', tipo: 'texto', pregunta: '¿Que quieres que publique? Mandame el texto tal cual.' }),
    Object.freeze({ campo: 'cuenta', tipo: 'cuenta', pregunta: '¿En que cuenta lo publico?' })
  ]),
  responder: Object.freeze([
    Object.freeze({ campo: 'hilo', tipo: 'hilo', pregunta: '¿A que conversacion contesto? Dime de quien es.' }),
    Object.freeze({ campo: 'texto', tipo: 'texto', pregunta: '¿Que le digo?' })
  ]),
  mirar: Object.freeze([
    Object.freeze({ campo: 'cuenta', tipo: 'cuenta', pregunta: '¿Que cuenta miro?' })
  ]),
  demostrar: Object.freeze([
    Object.freeze({ campo: 'cuenta', tipo: 'cuenta', pregunta: '¿En que cuenta lo pruebo?' }),
    Object.freeze({ campo: 'capacidad_a_probar', tipo: 'capacidad', pregunta: '¿Que quieres que pruebe: publicar, contestar, mirar o reparar?' })
  ]),
  reparar: Object.freeze([
    Object.freeze({ campo: 'sintoma', tipo: 'texto', pregunta: '¿Que ha dejado de funcionar? Cuentamelo como lo has visto.' }),
    Object.freeze({ campo: 'cuenta', tipo: 'cuenta', pregunta: '¿En que cuenta pasa?' })
  ])
});

const MOTIVOS = Object.freeze({
  CAPACIDAD_DESCONOCIDA: 'capacidad_desconocida',
  SIN_ESTADO: 'sin_estado',
  YA_COMPLETA: 'ya_completa',
  ENCAJA: 'encaja',
  NO_ENCAJA_SE_REPREGUNTA_UNA_VEZ: 'no_encaja_se_repregunta_una_vez',
  NO_ENCAJA_Y_NO_INSISTO: 'no_encaja_y_no_insisto',
  RESPUESTA_VACIA: 'respuesta_vacia',
  RESPUESTA_ES_UNA_NO_RESPUESTA: 'respuesta_es_una_no_respuesta',
  CUENTA_IMPROBABLE: 'cuenta_improbable',
  CAPACIDAD_INEXISTENTE: 'capacidad_inexistente',
  HILO_IMPROBABLE: 'hilo_improbable',
  TEXTO_DEMASIADO_CORTO: 'texto_demasiado_corto'
});

// Maximo de repreguntas por campo. Uno. Esta constante es la regla del bloque.
const REPREGUNTAS_POR_CAMPO = 1;

// Una no-respuesta es una respuesta, pero no un dato.
const NO_RESPUESTAS = Object.freeze([
  'no se', 'no lo se', 'no sabe', 'no tengo', 'da igual', 'me da igual', 'nada',
  'ninguno', 'ninguna', 'lo que tu veas', 'lo que sea', 'tu mismo', 'no', 'nan',
  'na', 'ns', 'nse', 'nose', '?', '??', '...', 'x', 'xx'
]);

const RE_CUENTA = /^@?[a-z0-9._]{2,30}$/i;

// ---------------------------------------------------------------------------
// validacion por tipo de campo
// ---------------------------------------------------------------------------

/**
 * ¿La respuesta tiene la forma del campo? Devuelve { encaja, motivo }.
 * No guarda nada y no lanza: un validador que se cae deja al dueno sin pregunta.
 */
function validar(tipo, respuesta) {
  const cruda = typeof respuesta === 'string' ? respuesta : (respuesta == null ? '' : String(respuesta));
  const limpia = cruda.trim();

  if (limpia === '') return { encaja: false, motivo: MOTIVOS.RESPUESTA_VACIA };
  if (NO_RESPUESTAS.includes(normalizar(limpia))) {
    return { encaja: false, motivo: MOTIVOS.RESPUESTA_ES_UNA_NO_RESPUESTA };
  }

  switch (tipo) {
    case 'capacidad': {
      const n = normalizar(limpia);
      const hallada = CAPACIDADES.find((c) => n.indexOf(c) !== -1 || (c === 'responder' && n.indexOf('contest') !== -1));
      return hallada ? { encaja: true, valor: hallada } : { encaja: false, motivo: MOTIVOS.CAPACIDAD_INEXISTENTE };
    }
    case 'cuenta': {
      // Una cuenta se nombra en una palabra (@taller_a, taller.a). Una frase
      // entera aqui es una no-respuesta disfrazada: se repregunta.
      if (/\s/.test(limpia)) return { encaja: false, motivo: MOTIVOS.CUENTA_IMPROBABLE };
      return RE_CUENTA.test(limpia)
        ? { encaja: true, valor: limpia }
        : { encaja: false, motivo: MOTIVOS.CUENTA_IMPROBABLE };
    }
    case 'hilo': {
      // Un hilo se nombra por la persona o por su identificador: basta con algo
      // que no sea una frase entera. Se guarda tal cual lo dijo el dueno.
      return normalizar(limpia).replace(/\s+/g, ' ').split(' ').length <= 8
        ? { encaja: true, valor: limpia }
        : { encaja: false, motivo: MOTIVOS.HILO_IMPROBABLE };
    }
    case 'texto':
    default: {
      const letras = normalizar(limpia).replace(/ /g, '');
      return letras.length >= 3
        ? { encaja: true, valor: limpia }
        : { encaja: false, motivo: MOTIVOS.TEXTO_DEMASIADO_CORTO };
    }
  }
}

// ---------------------------------------------------------------------------
// estado
// ---------------------------------------------------------------------------

function campos_de(capacidad) {
  return CAMPOS[capacidad] || null;
}

function campo_actual(estado) {
  if (!estado || !Array.isArray(estado.faltan) || estado.faltan.length === 0) return null;
  return estado.faltan[0];
}

function definicion(estado, campo) {
  const lista = campos_de(estado && estado.capacidad) || [];
  return lista.find((c) => c.campo === campo) || null;
}

function esta_completa(estado) {
  return !!estado && Array.isArray(estado.faltan) && estado.faltan.length === 0;
}

/**
 * Abre una peticion nueva: que capacidad, que ya trae el dueno y que falta.
 * Los datos que llegan con la peticion se validan igual que una respuesta: un
 * dato mal formado no entra por la puerta de atras de los parametros.
 *
 * @param {string} capacidad una de las cinco.
 * @param {string} peticion lo que dijo el dueno (se conserva para el narrador).
 * @param {object} [datos] lo que ya sabemos (cuenta, pieza, texto...).
 */
function nueva(capacidad, peticion, datos = {}) {
  const lista = campos_de(capacidad);
  if (!lista) {
    return { ok: false, motivo: MOTIVOS.CAPACIDAD_DESCONOCIDA, admitidas: CAPACIDADES.slice() };
  }

  const respuestas = {};
  const faltan = [];
  const descartados = [];

  for (const def of lista) {
    const crudo = datos && datos[def.campo];
    if (crudo === undefined || crudo === null || crudo === '') { faltan.push(def.campo); continue; }
    const v = validar(def.tipo, crudo);
    if (v.encaja) respuestas[def.campo] = v.valor;
    else { faltan.push(def.campo); descartados.push({ campo: def.campo, motivo: v.motivo }); }
  }

  return {
    ok: true,
    estado: {
      capacidad,
      peticion: typeof peticion === 'string' ? peticion : '',
      campos: lista.map((d) => d.campo),
      respuestas,
      faltan,
      repreguntas: {},
      descartados
    }
  };
}

/** La pregunta que toca ahora (o null si ya no falta nada). */
function siguiente_pregunta(estado) {
  const campo = campo_actual(estado);
  if (!campo) return null;
  const def = definicion(estado, campo);
  return {
    campo,
    tipo: def ? def.tipo : 'texto',
    pregunta: def ? def.pregunta : `¿Me das ${campo}?`,
    repreguntas: (estado.repreguntas && estado.repreguntas[campo]) || 0
  };
}

/** Repreguntar es pedir lo mismo de otra forma, no mas alto. */
function reformular(campo, def) {
  const base = def ? def.pregunta : `¿Me das ${campo}?`;
  return `No te he entendido. ${base} Con una frase corta me vale.`;
}

// ---------------------------------------------------------------------------
// C2 · recibir una respuesta
// ---------------------------------------------------------------------------

/**
 * Recibe la respuesta a la pregunta en curso.
 *
 * @param {object} estado el que devolvio `nueva` o el `recibir` anterior.
 * @param {string} respuesta lo que escribio el dueno.
 * @returns {{
 *   ok:boolean, encaja:boolean, campo:string|null, motivo:string|null,
 *   repreguntar:boolean, se_rinde:boolean, completa:boolean,
 *   pregunta:object|null, estado:object, con_lo_que_tengo?:object
 * }}
 */
function recibir(estado, respuesta) {
  if (!estado || typeof estado !== 'object' || !campos_de(estado.capacidad)) {
    return {
      ok: false, encaja: false, campo: null, motivo: MOTIVOS.SIN_ESTADO,
      repreguntar: false, se_rinde: true, completa: false, pregunta: null, estado: null
    };
  }

  // Copia: el estado que entra no se muta (quien llama puede estar guardandolo).
  const siguiente = {
    capacidad: estado.capacidad,
    peticion: estado.peticion || '',
    campos: Array.isArray(estado.campos) ? estado.campos.slice() : [],
    respuestas: Object.assign({}, estado.respuestas),
    faltan: Array.isArray(estado.faltan) ? estado.faltan.slice() : [],
    repreguntas: Object.assign({}, estado.repreguntas),
    descartados: Array.isArray(estado.descartados) ? estado.descartados.slice() : []
  };

  const campo = campo_actual(siguiente);
  if (!campo) {
    return {
      ok: true, encaja: false, campo: null, motivo: MOTIVOS.YA_COMPLETA,
      repreguntar: false, se_rinde: false, completa: true, pregunta: null, estado: siguiente
    };
  }

  const def = definicion(siguiente, campo);
  const v = validar(def ? def.tipo : 'texto', respuesta);

  if (v.encaja) {
    siguiente.respuestas[campo] = v.valor;
    siguiente.faltan = siguiente.faltan.filter((c) => c !== campo);
    siguiente.repreguntas[campo] = siguiente.repreguntas[campo] || 0;
    const completa = esta_completa(siguiente);
    return {
      ok: true, encaja: true, campo, motivo: MOTIVOS.ENCAJA,
      repreguntar: false, se_rinde: false, completa,
      pregunta: completa ? null : siguiente_pregunta(siguiente),
      estado: siguiente
    };
  }

  // No encaja. Se repregunta UNA VEZ; a la segunda, se rinde con lo que tenga.
  const intentos = siguiente.repreguntas[campo] || 0;
  if (intentos < REPREGUNTAS_POR_CAMPO) {
    siguiente.repreguntas[campo] = intentos + 1;
    return {
      ok: true, encaja: false, campo, motivo: MOTIVOS.NO_ENCAJA_SE_REPREGUNTA_UNA_VEZ,
      repreguntar: true, se_rinde: false, completa: false,
      causa: v.motivo,
      pregunta: { campo, tipo: def ? def.tipo : 'texto', pregunta: reformular(campo, def), repreguntas: intentos + 1 },
      estado: siguiente
    };
  }

  // Ya se repregunto una vez. No se insiste: se rinde y se dice que falta.
  siguiente.descartados = siguiente.descartados.concat([{ campo, motivo: v.motivo }]);
  return {
    ok: true, encaja: false, campo, motivo: MOTIVOS.NO_ENCAJA_Y_NO_INSISTO,
    repreguntar: false, se_rinde: true, completa: false,
    causa: v.motivo,
    pregunta: null,
    estado: siguiente,
    con_lo_que_tengo: {
      capacidad: siguiente.capacidad,
      respuestas: Object.assign({}, siguiente.respuestas),
      faltan: siguiente.faltan.slice(),
      descartados: siguiente.descartados.slice(),
      nota: 'se pregunto dos veces y no llego el dato: se para aqui, con lo que hay'
    }
  };
}

/** Azucar para el borde: ¿se puede operar ya con este estado? */
function esta_lista(estado) {
  return esta_completa(estado);
}

function describir() {
  return {
    regla: 'una respuesta que no encaja se repregunta una vez; despues se rinde con lo que tenga',
    repreguntas_por_campo: REPREGUNTAS_POR_CAMPO,
    campos: Object.keys(CAMPOS).reduce((acc, c) => {
      acc[c] = CAMPOS[c].map((d) => d.campo);
      return acc;
    }, {})
  };
}

module.exports = {
  CAMPOS,
  MOTIVOS,
  REPREGUNTAS_POR_CAMPO,
  NO_RESPUESTAS,
  validar,
  nueva,
  siguiente_pregunta,
  recibir,
  esta_completa,
  esta_lista,
  describir
};

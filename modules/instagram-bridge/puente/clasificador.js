'use strict';

/**
 * clasificador — C1 · ClasificadorDePeticion · MICRO-AGENTE.
 *
 * La BOCA del puente: lo que el dueno pide llega en su idioma y hay que saber
 * que capacidad de las cinco se esta pidiendo.
 *
 *   publicar  · sacar algo a la cuenta (pieza, historia, reel...)
 *   responder · contestar a quien escribio primero
 *   mirar     · decir como esta la cuenta (retrato con fecha, que ha cambiado)
 *   demostrar · probar que una receta sigue sirviendo
 *   reparar   · arreglar lo que ha dejado de funcionar
 *
 * LA REGLA DEL BLOQUE, Y POR QUE EXISTE:
 *   **bajo el umbral se devuelven DOS CANDIDATAS y se pregunta. No se elige.**
 *   Elegir mal aqui no es un error de tono: es publicar cuando el dueno pedia
 *   mirar, o contestar en una cuenta cuando pedia un retrato. Un clasificador
 *   que adivina acierta mucho y falla en lo caro, y en un puente que opera la
 *   cuenta de otra persona lo caro es irreversible. Asi que con poca senal se
 *   devuelven las DOS mas probables, con sus puntos, y una pregunta corta: el
 *   dueno desempata en una linea, el puente no inventa una intencion.
 *
 * POR QUE DOS Y NO UNA NI CINCO:
 *   una seria elegir disfrazado de duda (la primera de la lista siempre parece
 *   la respuesta); cinco es devolverle al dueno el trabajo que venia a delegar.
 *   Dos es la pregunta que se contesta sin pensar.
 *
 * MICRO-AGENTE SIN LLM OBLIGATORIO. La tabla de lexico decide siempre por si
 * sola. El juicio se puede inyectar (`opciones.juicio`), es sincrono, y solo
 * puede ELEGIR entre las cinco capacidades: si lanza, devuelve una capacidad
 * que no existe, devuelve una promesa o devuelve basura, manda la tabla. Un
 * clasificador que se cae deja al dueno sin boca. Nunca lanza.
 *
 * Puro: sin IO, sin red, sin reloj, sin estado global.
 */

const CAPACIDADES = Object.freeze(['publicar', 'responder', 'mirar', 'demostrar', 'reparar']);

// El idioma del dueno, por capacidad: se usa para la pregunta y para el narrador.
const DESCRIPCIONES = Object.freeze({
  publicar: 'sacar algo a la cuenta',
  responder: 'contestar a quien te escribio',
  mirar: 'mirar como esta la cuenta',
  demostrar: 'probar que lo que se hacer sigue funcionando',
  reparar: 'arreglar algo que ha dejado de funcionar'
});

/**
 * Lexico DECLARADO. `fuerte` son los verbos que nombran la capacidad sin rodeos
 * (peso 2); `debil` son los sustantivos que la rodean (peso 1). Un termino es
 * una RAIZ: se compara contra el principio de cada palabra, asi que «public» casa
 * con publica, publicar, publicacion y publicando sin listar las cuatro.
 *
 * Los solapes son a proposito y son el corazon de la pieza: «prueba» esta en
 * demostrar y «cambio» en mirar y en reparar, porque el dueno usa esas palabras
 * para las tres cosas. Cuando el solape empata, se pregunta.
 */
const LEXICO = Object.freeze({
  publicar: Object.freeze({
    fuerte: ['public', 'poste', 'sub', 'cuelg', 'colg', 'program'],
    debil: ['post', 'historia', 'storie', 'reel', 'carrusel', 'foto', 'video', 'pieza', 'contenido', 'calendario']
  }),
  responder: Object.freeze({
    fuerte: ['contest', 'respond', 'replic'],
    debil: ['mensaje', 'dm', 'comentario', 'bandeja', 'escrib', 'pregunta', 'hilo', 'conversacion']
  }),
  mirar: Object.freeze({
    fuerte: ['mira', 'revis', 'leer', 'lee', 'retrato', 'estado', 'como va'],
    debil: ['cuenta', 'seguidor', 'ultima', 'cambio', 'resumen', 'novedad', 'ayer']
  }),
  demostrar: Object.freeze({
    fuerte: ['ensay', 'prueba', 'probar', 'demostr', 'comprobar', 'verificar'],
    debil: ['funciona', 'receta', 'apto', 'test']
  }),
  reparar: Object.freeze({
    fuerte: ['rotura', 'arregl', 'repar', 'fall', 'rompi', 'roto', 'dejo de'],
    debil: ['cambio', 'plataforma', 'ya no', 'error', 'deja de']
  })
});

const PESO_FUERTE = 2;
const PESO_DEBIL = 1;

// Umbral: la capacidad ganadora tiene que sumar al menos esto...
const UMBRAL = 2;
// ...y sacarle esto a la segunda. Con margen 1, un empate (2-2) se pregunta.
const MARGEN = 1;

const MOTIVOS = Object.freeze({
  SIN_PETICION: 'sin_peticion',
  BAJO_EL_UMBRAL: 'bajo_el_umbral',
  EMPATE: 'empate',
  SIN_SENAL: 'sin_senal',
  JUICIO_INVALIDO: 'juicio_invalido_se_usa_la_tabla',
  JUICIO: 'juicio'
});

// ---------------------------------------------------------------------------
// utilidades deterministas
// ---------------------------------------------------------------------------

/** Minusculas, sin tildes, espacios colapsados. El dueno no escribe para un parser. */
function normalizar(texto) {
  if (typeof texto !== 'string') return '';
  return texto
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function palabras(texto) {
  const t = normalizar(texto);
  return t ? t.split(' ') : [];
}

function es_texto(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/** Una raiz de una palabra casa por el principio (public → publicar); una frase, entera. */
function casa_palabra(palabra, termino) {
  if (!palabra || !termino) return false;
  return palabra.indexOf(termino) === 0;
}

function casa_frase(texto_normalizado, termino) {
  if (!texto_normalizado || !termino) return false;
  return texto_normalizado.indexOf(termino) !== -1;
}


/**
 * Puntos por capacidad, con las senales que los producen. Se cuenta cada termino
 * UNA vez por capacidad: repetir «publica publica publica» no es pedir mas.
 */
function puntuar(peticion) {
  const texto = normalizar(peticion);
  const tokens = texto ? texto.split(' ') : [];
  const puntos = {};
  const senales = [];

  for (const capacidad of CAPACIDADES) {
    let total = 0;
    const delaLexico = LEXICO[capacidad];
    for (const [grupo, terminos] of [['fuerte', delaLexico.fuerte], ['debil', delaLexico.debil]]) {
      const peso = grupo === 'fuerte' ? PESO_FUERTE : PESO_DEBIL;
      for (const termino of terminos) {
        const encontrado = termino.indexOf(' ') !== -1
          ? casa_frase(texto, termino)
          : tokens.some((tok) => casa_palabra(tok, termino));
        if (!encontrado) continue;
        total += peso;
        senales.push({ capacidad, termino, peso });
      }
    }
    puntos[capacidad] = total;
  }

  return { puntos, senales };
}

/**
 * Ranking estable: puntos de mas a menos y, en caso de empate, el ORDEN
 * DECLARADO de las capacidades. Un clasificador cuyo resultado cambia entre dos
 * llamadas iguales no se puede auditar.
 */
function ranking(puntos) {
  return CAPACIDADES
    .map((capacidad, i) => ({ capacidad, puntos: puntos[capacidad], orden: i }))
    .sort((a, b) => (b.puntos - a.puntos) || (a.orden - b.orden))
    .map(({ capacidad, puntos: p }) => ({ capacidad, puntos: p }));
}

function pregunta_entre(a, b) {
  return `No lo tengo claro: ¿${DESCRIPCIONES[a]} o ${DESCRIPCIONES[b]}? Dime cual.`;
}

// ---------------------------------------------------------------------------
// C1 · clasificar
// ---------------------------------------------------------------------------

/**
 * Clasifica una peticion del dueno en una de las cinco capacidades.
 *
 * @param {string} peticion lo que dice el dueno, tal cual.
 * @param {{juicio?:Function, umbral?:number, margen?:number}} [opciones]
 * @returns {{
 *   ok:boolean, capacidad:string|null, elegida:boolean, decidida:boolean,
 *   candidatas:Array<{capacidad:string,puntos:number}>, pregunta:string|null,
 *   puntos:object, senales:Array, umbral:number, margen:number,
 *   motivo:string|null, abierto:object, via:string
 * }}
 */
function clasificar(peticion, opciones = {}) {
  if (!es_texto(peticion)) {
    return {
      ok: false,
      capacidad: null,
      elegida: false,
      decidida: false,
      candidatas: [],
      pregunta: null,
      puntos: {},
      senales: [],
      umbral: UMBRAL,
      margen: MARGEN,
      motivo: MOTIVOS.SIN_PETICION,
      abierto: { peticion: 'no llego ninguna peticion: sin ella no hay nada que clasificar' },
      via: 'tabla'
    };
  }

  const umbral = Number.isFinite(opciones.umbral) ? opciones.umbral : UMBRAL;
  const margen = Number.isFinite(opciones.margen) ? opciones.margen : MARGEN;

  const { puntos, senales } = puntuar(peticion);
  const orden = ranking(puntos);
  const primero = orden[0];
  const segundo = orden[1];

  // La tabla decide sola. El juicio solo puede ratificar o corregir DENTRO de la
  // tabla: nunca elige algo que no sea una de las cinco capacidades.
  let via = 'tabla';
  let juicio = null;
  if (typeof opciones.juicio === 'function') {
    const juzgada = _juicio_seguro(opciones.juicio, peticion, orden);
    if (juzgada.capacidad !== null) {
      via = MOTIVOS.JUICIO;
      juicio = juzgada.capacidad;
    } else if (juzgada.motivo) {
      juicio = null;
      via = MOTIVOS.JUICIO_INVALIDO;
    }
  }

  const claro = primero.puntos >= umbral && (primero.puntos - segundo.puntos) >= margen;
  const sintoma = senales.some((s) => s.capacidad === 'reparar' && s.peso === PESO_FUERTE);

  let capacidad = null;
  let regla = null;
  if (sintoma && puntos.reparar >= umbral) {
    // Regla del sintoma: «se ha roto», «dejo de», «ya no» no son una tarea, son
    // una averia declarada. Aunque el dueno nombre la capacidad que se rompio
    // («lo de subir fotos»), lo que pide es que vuelva a funcionar. Y si se
    // equivoca, arreglar de mas no publica nada; publicar de mas, si. Por eso
    // manda sobre el margen de la tabla y sobre el juicio: la averia esta escrita
    // en la peticion, la intencion solo se supone.
    capacidad = 'reparar';
    regla = 'sintoma';
  } else if (claro) {
    capacidad = primero.capacidad;
  } else if (juicio !== null) {
    capacidad = juicio;
  }

  if (capacidad !== null) {
    const candidatas = [{ capacidad, puntos: puntos[capacidad] }]
      .concat(orden.filter((c) => c.capacidad !== capacidad))
      .slice(0, 2);
    return {
      ok: true,
      capacidad,
      elegida: true,
      decidida: true,
      // Aunque decida, devuelve las dos primeras: la segunda es la duda que el
      // dueno tiene derecho a ver si la capacidad elegida le sorprende.
      candidatas,
      pregunta: null,
      puntos,
      senales,
      umbral,
      margen,
      motivo: null,
      regla,
      via,
      abierto: {
        juicio: juicio === null ? null : 'el juicio ratifico o corrigio la tabla dentro de las cinco capacidades',
        sintoma: regla === 'sintoma'
          ? 'la peticion declara una averia: manda el sintoma sobre la capacidad que se rompio'
          : null
      }
    };
  }

  // Bajo el umbral: DOS candidatas y una pregunta. NO se elige.
  const motivo = primero.puntos === 0
    ? MOTIVOS.SIN_SENAL
    : (primero.puntos === segundo.puntos ? MOTIVOS.EMPATE : MOTIVOS.BAJO_EL_UMBRAL);

  return {
    ok: true,
    capacidad: null,
    elegida: false,
    decidida: false,
    candidatas: [primero, segundo],
    pregunta: pregunta_entre(primero.capacidad, segundo.capacidad),
    puntos,
    senales,
    umbral,
    margen,
    motivo,
    via,
    abierto: {
      clasificacion: motivo === MOTIVOS.SIN_SENAL
        ? 'la peticion no trae ninguna palabra de la tabla: se ofrecen las dos primeras por orden declarado y se pregunta'
        : 'la senal no basta para elegir sin riesgo: se ofrecen las dos mas probables y se pregunta'
    }
  };
}

/**
 * El juicio, encerrado en su caja: sincrono, solo ratifica una de las cinco, y
 * cualquier cosa rara se trata como si no hubiera juicio. No propaga el error.
 */
function _juicio_seguro(juicio, peticion, orden) {
  let salida;
  try {
    salida = juicio({ peticion, capacidades: CAPACIDADES.slice(), candidatas: orden.slice(0, 2).map((c) => c.capacidad) });
  } catch (err) {
    return { capacidad: null, motivo: MOTIVOS.JUICIO_INVALIDO };
  }
  // Una promesa no se espera: la boca contesta ya, no cuando el modelo quiera.
  if (salida && typeof salida.then === 'function') return { capacidad: null, motivo: MOTIVOS.JUICIO_INVALIDO };
  const capacidad = typeof salida === 'string' ? salida : (salida && typeof salida === 'object' ? salida.capacidad : null);
  if (typeof capacidad !== 'string' || !CAPACIDADES.includes(capacidad)) {
    return { capacidad: null, motivo: MOTIVOS.JUICIO_INVALIDO };
  }
  return { capacidad, motivo: null };
}

/** Azucar: ¿la peticion es (claramente) de esta capacidad? */
function es_peticion_de(peticion, capacidad) {
  const r = clasificar(peticion);
  return r.decidida === true && r.capacidad === capacidad;
}

function describir() {
  return {
    regla: 'bajo el umbral se devuelven dos candidatas y se pregunta; no se elige',
    capacidades: CAPACIDADES.map((c) => ({ capacidad: c, descripcion: DESCRIPCIONES[c] })),
    umbral: UMBRAL,
    margen: MARGEN,
    candidatas_bajo_el_umbral: 2
  };
}

module.exports = {
  CAPACIDADES,
  DESCRIPCIONES,
  LEXICO,
  UMBRAL,
  MARGEN,
  MOTIVOS,
  normalizar,
  palabras,
  puntuar,
  ranking,
  clasificar,
  es_peticion_de,
  describir
};

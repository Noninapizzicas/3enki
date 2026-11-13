'use strict';

/**
 * traductor — R2 · TraductorDeFallo · MICRO-AGENTE.
 *
 * Cuando algo no sale, el puente sabe muchisimo: el codigo, el paso, el ancla, el
 * nodo que no aparecio, el mensaje del otro lado. Nada de eso le sirve al dueno.
 * El dueno necesita dos cosas y en este orden:
 *
 *   1. **que ha pasado**, en una frase que pueda repetir en voz alta;
 *   2. **que hace falta** para salir de ahi.
 *
 * LA REGLA DEL BLOQUE, Y POR QUE EXISTE:
 *   **al dueno NO se le nombran pantallas, ni botones, ni terminos tecnicos.**
 *   Nombrar la pantalla de publicar o el boton de compartir parece preciso y es
 *   lo contrario: le pide que traduzca. Y un dueno que tiene que traducir el
 *   error de su puente ya no tiene un puente, tiene otro trabajo. Peor: «no
 *   encuentro el boton Compartir» le hace creer que el arreglo esta en su dedo,
 *   cuando el problema es que la otra parte cambio algo.
 *
 *   Por eso esta pieza **no repite el mensaje tecnico**: no lo limpia, no lo
 *   cita entre comillas y no lo resume. Lo sustituye por la unica frase que
 *   aporta: que se necesita. Un mensaje tecnico citado es un mensaje tecnico.
 *
 * LO QUE SI DICE: `hace_falta`. Es la diferencia entre una excusa y un parte.
 * «No ha salido» sin mas deja al dueno donde estaba; «hace falta que la cuenta
 * vuelva a entrar» le dice si puede hacer algo el o hay que esperar.
 *
 * MICRO-AGENTE SIN LLM OBLIGATORIO: la tabla cerrada traduce. Un codigo que no
 * esta en la tabla NO se inventa: cae en la frase honesta («no tengo una
 * explicacion que puedas usar») con lo que hace falta. Nunca lanza.
 *
 * `revisar()` es el seguro, no la promesa: comprueba una frase contra las listas
 * de pantallas, botones y tecnicismos, y la propia pieza lo usa antes de
 * devolver nada. Una regla que solo vive en un comentario no es una regla.
 *
 * Puro: sin IO, sin red, sin reloj, sin estado global.
 */

const { PANTALLAS } = require('../core/formas');

// Lo que no se le nombra al dueno. Las pantallas son las del puente (la misma
// lista cerrada de `HechoVisible`: si aparece una nueva, se añade aqui y el
// seguro la caza sola).
const PANTALLAS_PROHIBIDAS = Object.freeze(PANTALLAS.filter((p) => p !== 'desconocida').concat(['bandeja', 'ajustes', 'menu de cuenta']));

const BOTONES_PROHIBIDOS = Object.freeze([
  'boton', 'botones', 'icono', 'menu', 'pestana', 'desplegable', 'compartir',
  'siguiente', 'atras', 'cancelar', 'aceptar', 'confirmar', 'desliza', 'toca',
  'pulsa', 'click', 'clic', 'arrastra', 'scroll', 'checkbox', 'toggle'
]);

const TECNICISMOS = Object.freeze([
  'dom', 'selector', 'xpath', 'api', 'endpoint', 'timeout', 'null', 'undefined',
  'json', 'http', 'https', 'token', 'cookie', 'css', 'html', 'javascript',
  'payload', 'instancia', 'stack', 'trace', 'exception', 'excepcion', 'webhook',
  'query', 'regex', 'url', 'uuid', 'status', 'code', 'log', 'bug', 'error',
  'servidor', 'base de datos', 'deploy', 'commit', 'script', 'modulo', 'evento',
  'parametro', 'respuesta', 'request', 'response', 'nullpointer', 'excepcion'
]);

// Palabras de dos letras: solo cuentan como palabra entera (si no, «admin»
// contaria como «dm»).
const CORTAS = new Set(['dm', 'id', 'js', 'ok', 'ui', 'ux', 'pk', 'fk']);

/**
 * Tabla cerrada: codigo → lo que el dueno entiende y lo que hace falta.
 * Ni una frase nombra pantalla, boton ni tecnicismo: lo comprueba `revisar`.
 */
const TABLA = Object.freeze({
  sin_puerto: Object.freeze({
    frase: 'No he podido terminar: me falta una pieza para hacerlo.',
    hace_falta: ['que lo mire una persona']
  }),
  no_ocurrio: Object.freeze({
    frase: 'No ha llegado a pasar.',
    hace_falta: []
  }),
  sin_evidencia: Object.freeze({
    frase: 'No tengo la prueba de que haya pasado, asi que no te lo doy por bueno.',
    hace_falta: []
  }),
  sin_receta: Object.freeze({
    frase: 'Esto todavia no se hacerlo.',
    hace_falta: ['que alguien me lo muestre una vez']
  }),
  rotura: Object.freeze({
    frase: 'Lo que sabia hacer para esto ha dejado de servir.',
    hace_falta: ['que una persona lo mire conmigo en la cuenta']
  }),
  plataforma_cambio: Object.freeze({
    frase: 'Algo de la otra parte ha cambiado y lo que sabia hacer ya no encaja.',
    hace_falta: ['que una persona lo mire conmigo en la cuenta']
  }),
  receta_retirada: Object.freeze({
    frase: 'He retirado lo que sabia hacer para esto, porque ya no funcionaba.',
    hace_falta: ['que una persona lo mire conmigo en la cuenta']
  }),
  limite_de_ritmo: Object.freeze({
    frase: 'He parado a proposito: mas ritmo pondria en riesgo la cuenta.',
    hace_falta: ['esperar un rato antes de seguir']
  }),
  sin_permiso: Object.freeze({
    frase: 'No lo he intentado sin tu permiso.',
    hace_falta: ['tu permiso para seguir']
  }),
  sin_autorizacion: Object.freeze({
    frase: 'Esto pide tu permiso y no lo tengo.',
    hace_falta: ['tu permiso para seguir']
  }),
  fuera_de_alcance: Object.freeze({
    frase: 'Esto no lo hago: solo contesto a quien me escribio primero.',
    hace_falta: ['que me lo pidas dentro de lo que esta cuenta puede hacer']
  }),
  sesion_caida: Object.freeze({
    frase: 'La cuenta ha dejado de entrar sola.',
    hace_falta: ['que la cuenta vuelva a entrar']
  }),
  sin_red: Object.freeze({
    frase: 'No hay conexion, y sin ella no llego a la cuenta.',
    hace_falta: ['que vuelva la conexion']
  }),
  tiempo_agotado: Object.freeze({
    frase: 'Se ha acabado el tiempo antes de terminar.',
    hace_falta: ['volver a intentarlo con mas tiempo, o que lo mire una persona']
  }),
  pieza_rechazada: Object.freeze({
    frase: 'Lo que me diste no cabe en la cuenta tal como esta.',
    hace_falta: ['que me des el texto mas corto o la foto con otra medida']
  }),
  sin_voz: Object.freeze({
    frase: 'No tengo tu voz declarada para esta cuenta, y no me la voy a inventar.',
    hace_falta: ['que me digas como quieres que hable esta cuenta']
  }),
  ininteligible: Object.freeze({
    frase: 'No he entendido lo que llego, y no voy a decidir por el.',
    hace_falta: ['que lo mire una persona']
  }),
  sin_datos: Object.freeze({
    frase: 'Me faltan datos para poder hacerlo, y no los voy a suponer.',
    hace_falta: ['que me des el dato que falta']
  })
});

const SIN_TRADUCCION = Object.freeze({
  frase: 'No ha salido, y no tengo una explicacion que puedas usar.',
  hace_falta: ['que una persona lo mire']
});

const MOTIVOS = Object.freeze({
  TRADUCIDO: 'traducido',
  CODIGO_SIN_TRADUCCION: 'codigo_sin_traduccion',
  SIN_CODIGO: 'sin_codigo',
  TECNICO_OCULTO: 'mensaje_tecnico_oculto',
  FRASE_CORREGIDA: 'frase_corregida_por_el_seguro'
});

// ---------------------------------------------------------------------------
// el seguro
// ---------------------------------------------------------------------------

function _tokens(texto) {
  return String(texto || '')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function _casa(tokens, termino) {
  if (termino.indexOf(' ') !== -1) {
    return (' ' + tokens.join(' ') + ' ').indexOf(' ' + termino + ' ') !== -1;
  }
  if (CORTAS.has(termino)) return tokens.indexOf(termino) !== -1;
  if (termino.length <= 3) return tokens.indexOf(termino) !== -1;
  // Raiz: «boton» caza «botones», «pantalla» caza «pantallas».
  return tokens.some((t) => t.indexOf(termino) === 0);
}

/**
 * ¿La frase se le puede decir al dueno? Devuelve lo que sobra, por su nombre
 * (pantalla, boton o tecnicismo), sin repetir la frase entera.
 */
function revisar(frase) {
  const tokens = _tokens(frase);
  const encontrados = [];
  for (const t of PANTALLAS_PROHIBIDAS) if (_casa(tokens, t)) encontrados.push({ tipo: 'pantalla', termino: t });
  for (const t of BOTONES_PROHIBIDOS) if (_casa(tokens, t)) encontrados.push({ tipo: 'boton', termino: t });
  for (const t of TECNICISMOS) if (_casa(tokens, t)) encontrados.push({ tipo: 'tecnicismo', termino: t });
  return { limpia: encontrados.length === 0, encontrados };
}

// ---------------------------------------------------------------------------
// R2 · traducir
// ---------------------------------------------------------------------------

// Un codigo es una etiqueta, no una frase: si lo que llega es prosa tecnica
// («Error 500 en el selector .btn-share») NO es un codigo y no se repite.
const RE_CODIGO = /^[a-zA-Z0-9_.:-]{1,48}$/;

function _codigo(fallo) {
  if (typeof fallo === 'string') {
    const t = fallo.trim();
    return RE_CODIGO.test(t) ? t : null;
  }
  if (!fallo || typeof fallo !== 'object') return null;
  for (const campo of ['codigo', 'code', 'motivo', 'causa', 'tipo']) {
    const v = fallo[campo];
    if (typeof v === 'string' && RE_CODIGO.test(v.trim())) return v.trim();
  }
  return null;
}

/**
 * Traduce un fallo al idioma del dueno.
 *
 * @param {object|string} fallo el fallo tal cual (con su codigo, su detalle tecnico,
 *   su pantalla, su ancla...). TODO eso se queda aqui: no sale en la respuesta.
 * @returns {{ok:boolean, frase:string, hace_falta:string[], para_el_dueno:boolean,
 *   motivo:string, codigo:string|null, tecnico_oculto:boolean, revisada:object}}
 */
function traducir(fallo) {
  const codigo = _codigo(fallo);
  const entrada = codigo !== null && TABLA[codigo] ? TABLA[codigo] : null;

  const motivo = entrada ? MOTIVOS.TRADUCIDO
    : (codigo === null ? MOTIVOS.SIN_CODIGO : MOTIVOS.CODIGO_SIN_TRADUCCION);

  let frase = entrada ? entrada.frase : SIN_TRADUCCION.frase;
  let hace_falta = (entrada ? entrada.hace_falta : SIN_TRADUCCION.hace_falta).slice();
  const abierto = {};

  // El seguro: si una plantilla (o un cambio futuro) nombrara lo que no se
  // nombra, se sustituye por la frase honesta. Nada de «casi limpio».
  const revision = revisar(frase);
  if (!revision.limpia) {
    frase = SIN_TRADUCCION.frase;
    hace_falta = SIN_TRADUCCION.hace_falta.slice();
    abierto.frase = MOTIVOS.FRASE_CORREGIDA;
  }

  const revisionFalta = revisar(hace_falta.join('. '));
  if (!revisionFalta.limpia) {
    hace_falta = SIN_TRADUCCION.hace_falta.slice();
    abierto.hace_falta = MOTIVOS.FRASE_CORREGIDA;
  }

  return {
    ok: true,
    frase,
    hace_falta,
    para_el_dueno: true,
    codigo,
    motivo,
    // Se declara que el detalle tecnico SE QUEDO AQUI: no se limpio ni se cito.
    tecnico_oculto: _hay_tecnico(fallo),
    revisada: revisar(frase),
    abierto
  };
}

function _hay_tecnico(fallo) {
  if (!fallo || typeof fallo !== 'object') return false;
  return ['detalle', 'pantalla', 'ancla', 'mensaje', 'stack', 'error', 'nodo', 'paso'].some((c) => fallo[c] !== undefined && fallo[c] !== null);
}

/** La pregunta que el dueno hace de verdad: ¿y ahora que hago? */
function que_hace_falta(fallo) {
  return traducir(fallo).hace_falta;
}

function describir() {
  return {
    regla: 'al dueno no se le nombran pantallas, ni botones, ni terminos tecnicos; se le dice que hace falta',
    codigos: Object.keys(TABLA),
    prohibidos: {
      pantallas: PANTALLAS_PROHIBIDAS.slice(),
      botones: BOTONES_PROHIBIDOS.slice(),
      tecnicismos: TECNICISMOS.slice()
    },
    no_repite_el_mensaje_tecnico: true
  };
}

module.exports = {
  TABLA,
  PANTALLAS_PROHIBIDAS,
  BOTONES_PROHIBIDOS,
  TECNICISMOS,
  MOTIVOS,
  revisar,
  traducir,
  que_hace_falta,
  describir
};

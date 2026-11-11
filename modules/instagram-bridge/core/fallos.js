'use strict';

/**
 * fallos — R1 · TaxonomiaDeFallos · REFLEJO.
 *
 * Seis familias CERRADAS para nombrar un fallo. Sin taxonomia todo fallo se
 * trata igual y ninguno se arregla: la escalera (A5) no sabe si reintentar, el
 * traductor (R2) no sabe que contar y el regulador (G6) no distingue un fallo
 * de un freno.
 *
 * La regla que esta pieza existe para no romper:
 *
 *   `limite_alcanzado` NO es un error: es un INPUT del regulador (G2/G6).
 *
 * Cuando la plataforma frena no hay nada averiado: hay una senal de castigo que
 * el regulador tiene que leer. Tratarla como averia es como un puente se cae
 * cada dos semanas: el sistema reintenta, cuenta fallo, empeora el castigo y
 * vuelve a reintentar. Por eso la familia esta declarada con `es_error: false`,
 * `reintentable: false` y `que_hace_el_sistema: 'regular'`, y `remedio()` nunca
 * devuelve un remedio de error para ella.
 *
 * Reglas de esta libreria:
 *   - Reflejo puro: sin IO, sin reloj, sin red, sin estado global, sin LLM.
 *   - Los CODIGOS son CONTRATO (snake_case): no cambian aunque cambie el texto
 *     de la descripcion. Viajan como `familia_fallo` en el topic D7.
 *   - Un fallo que no encaja en ninguna familia se clasifica como `interfaz`
 *     (conservador: parar antes que insistir) y se marca `conservador: true`
 *     para que quien lea sepa que no se reconocio, no que se comprobo.
 *   - Cada familia declara remedio y dueno: la taxonomia no solo nombra, dice a
 *     quien le toca y que se hace. Nombrar sin dueno es archivar.
 *
 * Ver diseno-oop.md (R1, bloque CONTRATO · R) y plan-construccion.md bloque 4.
 * El espejo en Rust es `crate/src/contrato/fallo.rs`; `tests/fallos.test.js`
 * LEE ese fichero y falla si las dos orillas divergen.
 */

// ---- vocabulario cerrado de remedios -------------------------------------

/**
 * Que puede hacer el sistema ante una familia. Cerrado: si aparece un remedio
 * que no esta aqui, es que se esta improvisando (A5: tres peldaños, ni uno mas).
 *
 * `regular` no es un remedio de error: es la entrega de la senal al regulador.
 */
const REMEDIOS = Object.freeze([
  'reintentar',
  'volver',
  'escalar',
  'pedir_persona',
  'declarar_rotura',
  'esperar',
  'preguntar',
  'regular'
]);

const REMEDIOS_DE_ERROR = Object.freeze(REMEDIOS.filter((r) => r !== 'regular'));

const POR_QUE_DEL_REMEDIO = Object.freeze({
  reintentar: 'un intento mas, y solo si el mundo no cambio',
  volver: 'volver atras y deshacer en orden inverso',
  escalar: 'terminar y llevar el caso a una persona con la evidencia',
  pedir_persona: 'hace falta una persona delante (abrir sesion, desbloquear)',
  declarar_rotura: 'declarar que la receta o la interfaz ya no sirve, con evidencia',
  esperar: 'no tocar nada hasta que pase el freno',
  preguntar: 'preguntar el dato que falta, una vez por hueco',
  regular: 'entregar la senal al regulador (G6): no cuenta como averia'
});

// ---- las seis familias ----------------------------------------------------

/**
 * Las seis familias, en el orden del diseno. Cada una:
 *   codigo               contrato estable (snake_case)
 *   descripcion          para el humano (puede cambiar; el codigo no)
 *   que_hace_el_sistema  reintentar | volver | escalar | pedir_persona |
 *                        declarar_rotura | esperar | preguntar | regular
 *   dueno                clase responsable (la que puede arreglarlo)
 *   reintentable         si A5 puede darle un segundo intento
 *   es_error             si cuenta como averia. Solo `limite_alcanzado` es false.
 *
 * Ojo: el diseno escribe las familias con tildes (`sesión`, `límite_alcanzado`);
 * los codigos van sin tildes porque son identificadores, no prosa.
 */
const FAMILIAS = Object.freeze([
  Object.freeze({
    codigo: 'sesion',
    descripcion: 'La sesion de la cuenta se cayo o la plataforma pide volver a entrar.',
    que_hace_el_sistema: 'pedir_persona',
    dueno: 'CaidaYReautenticacion',
    reintentable: false,
    es_error: true,
    por_que:
      'Solo una persona abre sesion (B2, V1). Reintentar sin sesion es contar averia y empeorar: ' +
      'el puente no teclea credenciales ni las guarda.'
  }),
  Object.freeze({
    codigo: 'aparato',
    descripcion: 'El aparato no esta, esta bloqueado o lo tiene una persona en la mano.',
    que_hace_el_sistema: 'escalar',
    dueno: 'AparatoAusente',
    reintentable: false,
    es_error: true,
    por_que:
      'El trabajo no se pierde: queda en cola. Pero nadie lo desbloquea desde el cerebro; ' +
      'hace falta decirlo al dueno y que alguien coja el aparato (H1).'
  }),
  Object.freeze({
    codigo: 'interfaz',
    descripcion: 'La pantalla ya no es la que la receta esperaba: el ancla no aparece.',
    que_hace_el_sistema: 'declarar_rotura',
    dueno: 'DeclaradorDeRotura',
    reintentable: false,
    es_error: true,
    por_que:
      'Es el cajon conservador: lo que no encaja en ninguna otra familia cae aqui hasta que se ' +
      'demuestre otra cosa. Insistir contra una pantalla que cambio es como se publica dos veces.'
  }),
  Object.freeze({
    codigo: 'plataforma',
    descripcion: 'La plataforma no dio la consecuencia y el mundo no cambio.',
    que_hace_el_sistema: 'reintentar',
    dueno: 'EscaleraDeRecuperacion',
    reintentable: true,
    es_error: true,
    por_que:
      'Un paso que no movio nada se puede repetir UNA vez (A5). Si movio algo, no: eso es como se ' +
      'publica dos veces. El techo de intentos lo pone la escalera, no esta taxonomia.'
  }),
  Object.freeze({
    codigo: 'dato_que_falta',
    descripcion: 'Falta un dato para poder hacerlo: cuenta, pieza, texto o destinatario.',
    que_hace_el_sistema: 'preguntar',
    dueno: 'CompletadorDePeticion',
    reintentable: false,
    es_error: true,
    por_que:
      'El hueco se nombra y se pregunta una vez por hueco (C2). Nunca se rellena solo: un dato ' +
      'plausible inventado es peor que un dato que falta.'
  }),
  Object.freeze({
    codigo: 'limite_alcanzado',
    descripcion:
      'La plataforma freno: cuota, espera obligatoria o castigo. No es un error: es un input del regulador.',
    que_hace_el_sistema: 'regular',
    dueno: 'LectorDeCastigo',
    reintentable: false,
    es_error: false,
    por_que:
      'Es una senal de castigo, no una averia. Va al regulador (G6) como input y alli se decide ' +
      'esperar o bajar el ritmo. Reintentar aqui es empeorar el castigo y contar una averia que no existe.'
  })
]);

const CODIGOS = Object.freeze(FAMILIAS.map((f) => f.codigo));

// ---- tabla declarada motivo -> familia ------------------------------------

/**
 * Motivos que ya nombra el contrato de puertos y del bus (plan de obra,
 * secciones 3 y 4). Es una tabla DECLARADA, no una heuristica: si el motivo no
 * esta aqui, se clasifica conservadoramente como `interfaz`.
 *
 * No es contrato: puede crecer sin romper nada. Los codigos de familia si son
 * contrato y no se tocan. Rust no la espeja: alli el aparato manda
 * `familia_fallo` ya resuelta en el topic D7.
 */
const POR_MOTIVO = Object.freeze({
  sesion_muerta: 'sesion',
  credencial_caducada: 'sesion',
  aparato_ausente: 'aparato',
  app_no_instalada: 'aparato',
  sin_permiso_de_compartir: 'aparato',
  cuenta_no_coincide: 'aparato',
  sin_receta: 'interfaz',
  ensayo_no_apto: 'interfaz',
  nodo_no_escribible: 'interfaz',
  gesto_rechazado: 'interfaz',
  techo_agotado: 'plataforma',
  canal_caido: 'plataforma',
  no_llego: 'plataforma',
  paso_fallido: 'plataforma',
  sin_mensaje: 'dato_que_falta',
  sin_cuenta: 'dato_que_falta',
  sin_ficha: 'dato_que_falta',
  sin_sello: 'dato_que_falta',
  limite_alcanzado: 'limite_alcanzado',
  castigo: 'limite_alcanzado',
  cuota_agotada: 'limite_alcanzado'
});

// Indice interno (congelado): codigo -> descriptor.
const POR_CODIGO = Object.freeze(
  FAMILIAS.reduce((acc, f) => {
    acc[f.codigo] = f;
    return acc;
  }, {})
);

// ---- utilidades -----------------------------------------------------------

function es_objeto(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Normaliza la entrada: acepta el codigo, un motivo conocido, o el sobre del
 * bus/aparato ({familia_fallo, familia, codigo, motivo}). Devuelve el codigo de
 * familia o null si no hay forma de saberlo.
 */
function codigo_de_entrada(fallo) {
  if (typeof fallo === 'string') {
    if (POR_CODIGO[fallo]) return fallo;
    if (POR_MOTIVO[fallo]) return POR_MOTIVO[fallo];
    return null;
  }
  if (!es_objeto(fallo)) return null;

  for (const campo of ['familia', 'familia_fallo', 'codigo']) {
    const v = fallo[campo];
    if (typeof v === 'string' && POR_CODIGO[v]) return v;
  }
  const motivo = fallo.motivo;
  if (typeof motivo === 'string') {
    if (POR_CODIGO[motivo]) return motivo;
    if (POR_MOTIVO[motivo]) return POR_MOTIVO[motivo];
  }
  return null;
}

function motivo_de(fallo) {
  if (es_objeto(fallo) && typeof fallo.motivo === 'string' && fallo.motivo.trim() !== '') return fallo.motivo;
  if (typeof fallo === 'string' && fallo.trim() !== '') return fallo;
  return null;
}

// ---- API ------------------------------------------------------------------

function codigos() {
  return CODIGOS.slice();
}

function listar() {
  return FAMILIAS.slice();
}

/** Descriptor de una familia (o null). Acepta codigo o motivo conocido. */
function familia(fallo) {
  const codigo = codigo_de_entrada(fallo);
  return codigo ? POR_CODIGO[codigo] : null;
}

function es_familia(valor) {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(POR_CODIGO, valor);
}

/**
 * Clasifica un fallo. SIEMPRE devuelve una familia: la desconocida cae en
 * `interfaz` con `conservador: true` (parar antes que insistir).
 *
 * Un sobre con `ok: true` no es un fallo y no se clasifica: devolver una familia
 * ahi seria convertir un exito en averia (o una averia en exito, peor).
 *
 * @param {string|object} fallo codigo, motivo, o {familia_fallo, motivo, ok}
 * @returns {object} FalloClasificado congelado
 */
function clasificar(fallo) {
  if (es_objeto(fallo) && fallo.ok === true) {
    return Object.freeze({
      clasificado: false,
      familia: null,
      codigo: null,
      descripcion: null,
      que_hace_el_sistema: null,
      dueno: null,
      reintentable: false,
      es_error: false,
      va_al_regulador: false,
      conservador: false,
      motivo: 'no_es_fallo'
    });
  }

  const reconocido = codigo_de_entrada(fallo);
  const descriptor = reconocido ? POR_CODIGO[reconocido] : POR_CODIGO.interfaz;

  return Object.freeze({
    clasificado: true,
    familia: descriptor.codigo,
    codigo: descriptor.codigo,
    descripcion: descriptor.descripcion,
    que_hace_el_sistema: descriptor.que_hace_el_sistema,
    dueno: descriptor.dueno,
    reintentable: descriptor.reintentable,
    es_error: descriptor.es_error,
    va_al_regulador: !descriptor.es_error,
    conservador: reconocido === null,
    motivo: motivo_de(fallo)
  });
}

/** Remedio declarado para una familia (o null si no es una familia). */
function remedio(fallo) {
  const d = familia(fallo);
  return d ? d.que_hace_el_sistema : null;
}

/** Clase responsable de arreglarlo (o null). */
function dueno(fallo) {
  const d = familia(fallo);
  return d ? d.dueno : null;
}

/** Un fallo desconocido se trata como error: conservador es parar. */
function es_error(fallo) {
  const d = familia(fallo);
  return d ? d.es_error : true;
}

function es_reintentable(fallo) {
  const d = familia(fallo);
  return d ? d.reintentable : false;
}

function va_al_regulador(fallo) {
  const d = familia(fallo);
  return d ? !d.es_error : false;
}

/**
 * La regla del bloque, en una funcion: si el fallo es un freno de la
 * plataforma, devuelve la senal para el regulador; si es cualquier otra cosa
 * (o no se sabe), devuelve null y el fallo sigue su camino de error.
 *
 * @param {string|object} fallo
 * @returns {object|null} SenalDeCastigo para G2/G6, o null
 */
function senal_de_regulador(fallo) {
  const c = clasificar(fallo);
  if (!c.clasificado || c.es_error) return null;
  return Object.freeze({
    es_senal: true,
    familia: c.familia,
    que_hace_el_sistema: c.que_hace_el_sistema,
    es_error: false,
    va_al_regulador: true,
    motivo: c.motivo
  });
}

/** El motivo esta en la tabla declarada? Devuelve el codigo de familia o null. */
function familia_de_motivo(motivo) {
  if (typeof motivo !== 'string') return null;
  return POR_MOTIVO[motivo] || null;
}

module.exports = {
  FAMILIAS,
  CODIGOS,
  REMEDIOS,
  REMEDIOS_DE_ERROR,
  POR_QUE_DEL_REMEDIO,
  POR_MOTIVO,
  codigos,
  listar,
  familia,
  es_familia,
  clasificar,
  remedio,
  dueno,
  es_error,
  es_reintentable,
  va_al_regulador,
  senal_de_regulador,
  familia_de_motivo
};

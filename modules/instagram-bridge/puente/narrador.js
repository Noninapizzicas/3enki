'use strict';

/**
 * narrador — C4 · NarradorDeResultado · MICRO-AGENTE.
 *
 * El puente hace cosas en la cuenta de otra persona; cuando termina, se lo
 * cuenta al dueno en SU idioma. No es un log con buenas palabras: es la unica
 * version que el dueno va a leer, y de ella depende que se fie.
 *
 * LA REGLA DEL BLOQUE, Y POR QUE EXISTE:
 *   **nunca dice «hecho» sin veredicto `ocurrio`.**
 *   Ni con «casi seguro», ni con «la orden salio bien», ni con «no hubo error».
 *   Que la mano obedeciera no es que la cosa pasara; que la peticion no fallara
 *   no es que la publicacion este. Un puente que dice «hecho» de mas obliga al
 *   dueno a comprobarlo todo, y entonces el puente no sirve para nada: solo
 *   añade una capa entre el y su cuenta.
 *
 * Y SE QUEDA CORTO A PROPOSITO: aunque el veredicto sea `ocurrio`, si no viene
 * `evidencia_id` tampoco dice «hecho». Dice que paso, que no lo puede sostener y
 * que no lo da por bueno. El techo de esta pieza es la evidencia, no el veredicto
 * (bloque 6: sin prueba no hay hecho).
 *
 * EL MAPEO NO SE INVENTA AQUI. Las frases se montan con el modulo REAL
 * `contabilidad-analitica/puente-lenguaje-dueno` (mitad refleja, Q2): se le pasan
 * las PLANTILLAS declaradas por este puente y el, que es quien sabe vestir una
 * cifra en el idioma del dueno, devuelve la frase. Si no hay plantilla, devuelve
 * `frase: null` en vez de inventar lengua, y aqui se declara el hueco. Lo que no
 * se hace es duplicar el render: duplicarlo seria tener dos traducciones y, antes
 * o despues, dos verdades.
 *
 * MICRO-AGENTE SIN LLM OBLIGATORIO: narrar es determinista (veredicto + plantilla
 * + render). No hay juicio que inyectar y no hace falta. Nunca lanza.
 *
 * Puro: sin IO, sin red, sin reloj, sin estado global.
 */

const PuenteLenguajeDueno = require('../../contabilidad-analitica/puente-lenguaje-dueno');
const traductor = require('./traductor');

const VEREDICTOS = Object.freeze(['ocurrio', 'no_ocurrio', 'sin_veredicto', 'fallo']);

/**
 * Las plantillas DEL PUENTE, declaradas. `{que}` es la cosa, en palabras del
 * dueno. La clave `hecho` es la unica que puede decir «hecho», y solo se usa
 * cuando hay veredicto `ocurrio` Y evidencia.
 */
const PLANTILLAS = Object.freeze({
  hecho: 'Hecho: {que}. Lo confirma la comprobacion, no mi palabra.',
  sin_prueba: '{que}: ha pasado, pero no tengo la prueba que lo sostenga, asi que no te lo doy por bueno.',
  no_ocurrio: 'No ha pasado: {que}. No lo cuento como terminado.',
  sin_veredicto: 'No lo se todavia: lo que he visto de {que} no dice si paso o no.',
  fallo: 'No se ha podido: {que}.',
  sin_dato: 'No tengo con que contartelo: no me ha llegado ni lo que paso ni lo que se hizo.'
});

// El unico verbo que esta pieza tiene prohibido decir sin prueba.
const RE_TERMINADO = /\bhech[oa]s?\b/i;

// Instancia unica de la mitad refleja real. No necesita onLoad: su proyeccion
// `a_cifra` es pura (solo valida, casa plantilla y renderiza).
let _puente = null;
function puente() {
  if (_puente === null) _puente = new PuenteLenguajeDueno();
  return _puente;
}

const MOTIVOS = Object.freeze({
  SIN_RESULTADO: 'sin_resultado',
  SIN_PROYECTO: 'sin_proyecto_declarado',
  SIN_VEREDICTO: 'sin_veredicto',
  OCURRIO_SIN_EVIDENCIA: 'ocurrio_sin_evidencia',
  SIN_PLANTILLA: 'sin_plantilla_para_el_resultado',
  SIN_DATO: 'sin_dato_que_contar',
  PLANTILLA_PROHIBIDA: 'plantilla_decia_terminado_sin_prueba',
  TRADUCIDO: 'traducido'
});

/**
 * Narra un resultado.
 *
 * @param {object} resultado
 *   {veredicto:'ocurrio'|'no_ocurrio'|'sin_veredicto'|'fallo', que, capacidad,
 *    evidencia_id, fallo?, proyecto?}
 * @param {object} [opciones] {proyecto} para cuando el proyecto no viene en el resultado.
 */
function narrar(resultado, opciones = {}) {
  if (!resultado || typeof resultado !== 'object') {
    return {
      ok: false, dice_hecho: false, veredicto: null, frase: null, clave: null,
      plantilla_usada: null, proyecto: null, evidencia_id: null,
      motivo: MOTIVOS.SIN_RESULTADO,
      abierto: { resultado: 'no llego ningun resultado: no hay nada que contar' }
    };
  }

  const proyecto = _proyecto(resultado, opciones);
  const veredicto = _veredicto(resultado.veredicto);
  const evidencia_id = _texto(resultado.evidencia_id);
  const que = _texto(resultado.que) || _texto(resultado.descripcion) || _texto(resultado.capacidad);
  const capacidad = _texto(resultado.capacidad);

  // Las plantillas son DECLARABLES (el dueno, o su proyecto, puede tener las
  // suyas): se mezclan con las del puente sin perder ninguna clave.
  const plantillas = Object.assign({}, PLANTILLAS, _objeto(opciones.plantillas));

  // Un fallo se cuenta con R2 (el fallo, en el idioma del dueno), no con una
  // plantilla de resultado: el dueno necesita saber QUE HACE FALTA, no un codigo.
  if (veredicto === 'fallo' && resultado.fallo) {
    const t = traductor.traducir(resultado.fallo);
    return {
      ok: true,
      dice_hecho: false,
      veredicto,
      frase: t.frase,
      clave: 'fallo',
      plantilla_usada: null,
      proyecto,
      capacidad,
      evidencia_id,
      motivo: MOTIVOS.TRADUCIDO,
      hace_falta: t.hace_falta.slice(),
      abierto: {
        proyecto: proyecto === null ? 'no llego el proyecto: la frase no se ha sellado' : null
      }
    };
  }

  if (que === null) {
    return {
      ok: true,
      dice_hecho: false,
      veredicto,
      frase: PLANTILLAS.sin_dato,
      clave: 'sin_dato',
      plantilla_usada: PLANTILLAS.sin_dato,
      proyecto,
      capacidad,
      evidencia_id,
      motivo: MOTIVOS.SIN_DATO,
      abierto: { que: 'no llego la descripcion de lo que paso: se dice el hueco, no se rellena' }
    };
  }

  // El unico caso en que esta pieza puede decir «hecho»: paso Y hay prueba.
  const dice_hecho = veredicto === 'ocurrio' && evidencia_id !== null;
  const clave = dice_hecho
    ? 'hecho'
    : (veredicto === 'ocurrio' ? 'sin_prueba' : veredicto);

  const motivo = dice_hecho
    ? MOTIVOS.TRADUCIDO
    : (veredicto === 'ocurrio' ? MOTIVOS.OCURRIO_SIN_EVIDENCIA
      : (veredicto === 'sin_veredicto' ? MOTIVOS.SIN_VEREDICTO : MOTIVOS.TRADUCIDO));

  // El render lo hace el modulo REAL: le pasamos las plantillas declaradas y la
  // cifra (la cosa) en el idioma del dueno.
  const render = puente().toolACifra({
    project_id: proyecto === null ? SIN_PROYECTO : proyecto,
    clave,
    cifra: { que, capacidad: capacidad || '', veredicto },
    plantillas
  });

  let frase = render && render.status === 200 && render.data ? render.data.frase : null;
  let motivoFinal = motivo;
  let abierto = {
    proyecto: proyecto === null
      ? 'no llego el proyecto: se narra con el ambito declarado como no declarado, no se inventa uno'
      : null,
    plantilla: null
  };

  if (frase === null) {
    // El puente real no inventa lengua cuando falta plantilla; aqui tampoco.
    frase = PLANTILLAS.sin_dato;
    motivoFinal = MOTIVOS.SIN_PLANTILLA;
    abierto.plantilla = 'no habia plantilla declarada para este resultado: se dice el hueco';
  }

  // El seguro, no la promesa: si una plantilla dijera «hecho» sin prueba, se
  // sustituye por la que no lo dice. Una regla que solo vive en un comentario
  // no es una regla.
  if (!dice_hecho && RE_TERMINADO.test(frase)) {
    frase = veredicto === 'ocurrio' ? PLANTILLAS.sin_prueba : PLANTILLAS[veredicto] || PLANTILLAS.sin_veredicto;
    frase = frase.replace('{que}', que);
    motivoFinal = MOTIVOS.PLANTILLA_PROHIBIDA;
    abierto.plantilla = 'la plantilla decia terminado sin prueba: se ha sustituido por la honesta';
  }

  // Se lee en voz alta: empieza por mayuscula. Es tipografia, no contenido.
  frase = frase.charAt(0).toUpperCase() + frase.slice(1);

  return {
    ok: true,
    dice_hecho,
    veredicto,
    frase,
    clave,
    plantilla_usada: dice_hecho ? plantillas.hecho : plantillas[clave] || null,
    proyecto,
    capacidad,
    evidencia_id,
    motivo: motivoFinal,
    abierto
  };
}

/** El verbo prohibido sin prueba, comprobable desde fuera (tests y auditoria). */
function dice_terminado(frase) {
  return RE_TERMINADO.test(String(frase || ''));
}

function _proyecto(resultado, opciones) {
  const candidatos = [
    opciones.proyecto,
    resultado.proyecto,
    resultado.project_id,
    resultado.sello && resultado.sello.proyecto
  ];
  for (const c of candidatos) if (_texto(c) !== null) return _texto(c);
  return null;
}

function _veredicto(v) {
  const n = _texto(v);
  if (n === null) return 'sin_veredicto';
  const limpio = n.toLowerCase().replace(/\s+/g, '_');
  return VEREDICTOS.includes(limpio) ? limpio : 'sin_veredicto';
}

function _objeto(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function _texto(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

// Proyecto declarado como NO declarado: el puente real exige un ambito, y
// mentir con uno inventado seria peor que decir que no lo hay.
const SIN_PROYECTO = 'proyecto_no_declarado';

function describir() {
  return {
    regla: 'nunca dice hecho sin veredicto ocurrio y sin evidencia',
    veredictos: VEREDICTOS.slice(),
    plantillas: Object.keys(PLANTILLAS),
    mapeo: 'contabilidad-analitica/puente-lenguaje-dueno (a_cifra, mitad refleja real)',
    verbos_prohibidos_sin_prueba: ['hecho', 'hecha', 'hechos', 'hechas']
  };
}

module.exports = {
  VEREDICTOS,
  PLANTILLAS,
  MOTIVOS,
  narrar,
  dice_terminado,
  describir
};

'use strict';

/**
 * sello — P1 · SelloDeProyecto · REFLEJO.
 *
 * Todo dato nace con dueno: proyecto, cuenta, aparato, momento y quien lo
 * pidio. El sello se pone EN EL NACIMIENTO, no en el destino: un dato sin sello
 * no entra en ningun almacen y los custodios lo rechazan con motivo `sin_sello`.
 *
 * Reglas que esta pieza hace ejecutables (diseno-oop.md, P1):
 *   - El sello no se reescribe. `anadir_historia` anade un cambio de sello
 *     (traspaso, B4) y deja el original intacto: asi se puede reconstruir de
 *     quien fue cada cosa y cuando.
 *   - Un sello roto no se "arregla" por comodidad: se rechaza. Reescribirlo en
 *     silencio es perder la unica prueba de origen que tiene el dato.
 *   - Volver a sellar con el MISMO sello es idempotente (el bus reintenta); con
 *     otro sello es un intento de reescritura y se rechaza.
 *
 * Puro: sin reloj (el `momento` lo trae el ambito), sin red, sin estado.
 */

const {
  CAMPOS_SELLO,
  es_objeto,
  es_instante,
  texto_no_vacio,
  clonar,
  crear_sello,
  validar_sello
} = require('./formas');

const CODIGOS = Object.freeze({
  SIN_DATO: 'sin_dato',
  SIN_SELLO: 'sin_sello',
  SELLO_YA_PRESENTE: 'sello_ya_presente',
  SELLO_INVALIDO: 'sello_invalido',
  CAMBIO_INCOMPLETO: 'cambio_de_sello_incompleto',
  YA_HAY_HISTORIA: 'historia_no_es_lista'
});

function sello_de(dato) {
  return es_objeto(dato) && es_objeto(dato.sello) ? dato.sello : null;
}

function mismo_sello(a, b) {
  if (!es_objeto(a) || !es_objeto(b)) return false;
  return CAMPOS_SELLO.every((campo) => String(a[campo]) === String(b[campo]));
}

/**
 * Comprueba si un dato esta sellado. Devuelve `estado: 'sellado' | 'huerfano'`
 * y, cuando es huerfano, el motivo y los campos que faltan.
 *
 * @param {*} dato
 * @returns {{estado:string, ok:boolean, sello?:object, motivo?:string, faltan?:string[], invalidos?:string[]}}
 */
function comprobar(dato) {
  if (dato === undefined || dato === null) {
    return { estado: 'huerfano', ok: false, motivo: CODIGOS.SIN_DATO, faltan: ['dato'], invalidos: [] };
  }
  if (!es_objeto(dato)) {
    return { estado: 'huerfano', ok: false, motivo: CODIGOS.SIN_DATO, faltan: ['dato'], invalidos: ['dato'] };
  }
  if (dato.sello === undefined || dato.sello === null) {
    return { estado: 'huerfano', ok: false, motivo: CODIGOS.SIN_SELLO, faltan: CAMPOS_SELLO.slice(), invalidos: [] };
  }
  const v = validar_sello(dato.sello);
  if (!v.ok) {
    return { estado: 'huerfano', ok: false, motivo: CODIGOS.SIN_SELLO, faltan: v.faltan, invalidos: v.invalidos };
  }
  return { estado: 'sellado', ok: true, sello: dato.sello };
}

function es_sellado(dato) {
  return comprobar(dato).ok;
}

/**
 * Sella un dato con el ambito recibido. No muta el original: devuelve una copia
 * con el sello congelado.
 *
 * @param {object} dato
 * @param {{proyecto:string, cuenta:string, aparato:string, momento:string, quien:string}} ambito
 * @returns {{ok:boolean, dato?:object, sello?:object, motivo?:string, faltan?:string[], invalidos?:string[], idempotente?:boolean}}
 */
function sellar(dato, ambito) {
  if (!es_objeto(dato)) {
    return { ok: false, motivo: CODIGOS.SIN_DATO, faltan: ['dato'], invalidos: [] };
  }

  const nuevo = crear_sello(ambito);

  // Ya venia sellado: mismo sello = reintento del bus (idempotente);
  // otro sello = reescritura del origen, que es justo lo que no se hace.
  const previo = comprobar(dato);
  if (previo.estado === 'sellado') {
    if (nuevo.ok && mismo_sello(previo.sello, nuevo.sello)) {
      return { ok: true, dato, sello: previo.sello, idempotente: true };
    }
    return { ok: false, motivo: CODIGOS.SELLO_YA_PRESENTE, sello_existente: previo.sello };
  }

  // Trae un sello roto: no se sobrescribe, se rechaza y se dice que falla.
  if (dato.sello !== undefined && dato.sello !== null) {
    return {
      ok: false,
      motivo: CODIGOS.SELLO_INVALIDO,
      sello_existente: dato.sello,
      faltan: previo.faltan || [],
      invalidos: previo.invalidos || []
    };
  }

  if (!nuevo.ok) {
    return { ok: false, motivo: CODIGOS.SIN_SELLO, faltan: nuevo.faltan, invalidos: nuevo.invalidos };
  }

  const sellado = Object.assign({}, dato, { sello: nuevo.sello });
  return { ok: true, dato: sellado, sello: nuevo.sello };
}

/**
 * Sello vigente de un dato. Normalmente es el del nacimiento; si hubo traspaso
 * (historia de sello), el vigente es el ultimo destino. El original NUNCA se
 * borra: la historia es la que dice que paso.
 */
function vigente(dato) {
  const sello = sello_de(dato);
  if (!sello) return null;
  const historia = Array.isArray(dato.historia_sello) ? dato.historia_sello : [];
  for (let i = historia.length - 1; i >= 0; i -= 1) {
    const paso = historia[i];
    if (es_objeto(paso) && validar_sello(paso.a).ok) return paso.a;
  }
  return sello;
}

/**
 * Anade un cambio de sello al dato (traspaso de proyecto, recuenta de aparato).
 * El sello de nacimiento queda intacto; el cambio vive en `historia_sello`.
 *
 * Un cambio exige motivo, momento y quien: sin esos tres no es historia, es una
 * edicion silenciosa.
 *
 * @param {object} dato
 * @param {{de?:object, a?:object, motivo:string, momento:string, quien:string}} cambio
 */
function anadir_historia(dato, cambio) {
  const c = comprobar(dato);
  if (!c.ok) {
    return { ok: false, motivo: c.motivo || CODIGOS.SIN_SELLO, faltan: c.faltan || [], invalidos: c.invalidos || [] };
  }
  if (!es_objeto(cambio)) {
    return { ok: false, motivo: CODIGOS.CAMBIO_INCOMPLETO, faltan: ['cambio'], invalidos: [] };
  }
  if (dato.historia_sello !== undefined && !Array.isArray(dato.historia_sello)) {
    return { ok: false, motivo: CODIGOS.YA_HAY_HISTORIA, faltan: ['historia_sello'], invalidos: ['historia_sello'] };
  }

  const faltan = [];
  const invalidos = [];
  if (!texto_no_vacio(cambio.motivo)) faltan.push('motivo');
  if (!es_instante(cambio.momento)) faltan.push('momento');
  if (!texto_no_vacio(cambio.quien)) faltan.push('quien');

  const de = cambio.de === undefined ? c.sello : cambio.de;
  const a = cambio.a === undefined ? c.sello : cambio.a;
  const vde = validar_sello(de);
  const va = validar_sello(a);
  if (!vde.ok) {
    faltan.push(...vde.faltan.map((f) => `de.${f}`));
    invalidos.push(...vde.invalidos.map((f) => `de.${f}`));
  }
  if (!va.ok) {
    faltan.push(...va.faltan.map((f) => `a.${f}`));
    invalidos.push(...va.invalidos.map((f) => `a.${f}`));
  }
  if (faltan.length || invalidos.length) {
    return { ok: false, motivo: CODIGOS.CAMBIO_INCOMPLETO, faltan, invalidos };
  }

  const historia = (Array.isArray(dato.historia_sello) ? dato.historia_sello : []).slice();
  const paso = Object.freeze({
    secuencia: historia.length + 1,
    de: Object.freeze(clonar(de)),
    a: Object.freeze(clonar(a)),
    motivo: String(cambio.motivo).trim(),
    momento: String(cambio.momento),
    quien: String(cambio.quien).trim()
  });
  historia.push(paso);

  const nuevo = Object.assign({}, dato, { historia_sello: Object.freeze(historia) });
  return { ok: true, dato: nuevo, paso, historia_sello: historia };
}

module.exports = {
  CODIGOS,
  sellar,
  comprobar,
  es_sellado,
  vigente,
  anadir_historia,
  sello_de,
  mismo_sello
};

// Vista "clase" para quien prefiera el nombre del diseno (P1 · SelloDeProyecto).
module.exports.SelloDeProyecto = Object.freeze({
  sellar,
  comprobar,
  anadir_historia,
  vigente,
  es_sellado,
  sello_de
});

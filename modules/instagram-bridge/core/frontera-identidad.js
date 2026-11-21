'use strict';

/**
 * frontera-identidad — T2 · FronteraSinIdentidad · REFLEJO.
 *
 * El puente no tiene identidad publica propia: no se presenta, no se anuncia y no
 * firma. Nunca hay una cuenta del puente publicando por los proyectos, ni una
 * firma suya en el contenido. La atribucion es SIEMPRE del proyecto (E2).
 *
 * Reglas que esta pieza hace ejecutables (diseno-oop.md, T2):
 *   - **Auditable sobre lo publicado y sobre el padron ENTERO.** No basta con
 *     revisar las piezas: si en el indice de duenos aparece una cuenta sin
 *     proyecto, la grieta esta en el alta y hay que verla antes de publicar.
 *   - **Una cuenta sin proyecto dueno NO es una cuenta del sistema: es un FALLO
 *     DE ALTA.** La distincion importa: una cuenta del sistema seria una
 *     identidad del puente (prohibida); un asiento sin dueno es un alta a medias
 *     (`cuenta_sin_proyecto_dueno`), que se corrige, no se tolera.
 *   - **`vetar` no negocia.** Una firma del puente se rechaza siempre; no hay
 *     parametro que la admita "solo para esta pieza".
 *   - **Un dato sin atribucion no esta limpio.** No se puede declarar "no hay
 *     firma del puente" sobre algo que no se sabe de quien es.
 *
 * Puro: sin IO, sin reloj, sin red, sin estado global.
 */

const { es_objeto, texto_no_vacio, clonar } = require('./formas');
const { comprobar: comprobar_sello, vigente } = require('./sello');

const CODIGOS = Object.freeze({
  FIRMA_DEL_PUENTE: 'firma_del_puente',
  CUENTA_DEL_SISTEMA: 'cuenta_del_sistema',
  CUENTA_SIN_PROYECTO_DUENO: 'cuenta_sin_proyecto_dueno',
  SIN_ATRIBUCION: 'sin_atribucion',
  SIN_FIRMA: 'sin_firma',
  SIN_PADRON: 'sin_padron',
  ASIENTO_ILEGIBLE: 'asiento_ilegible',
  NO_CUENTA_NADA: 'no_cuenta_nada'
});

const NOMBRES_DEL_PUENTE = Object.freeze([
  'puente',
  'bridge',
  'instagram-bridge',
  'instagram_bridge',
  'sistema',
  'enki'
]);

function es_nombre_del_puente(valor) {
  if (typeof valor !== 'string') return false;
  return NOMBRES_DEL_PUENTE.includes(valor.trim().toLowerCase());
}

/**
 * ¿Esta firma es del puente? Acepta un nombre suelto o el sobre de una firma
 * ({actor|autor|firmante|proyecto|cuenta|nombre}) y los marcadores booleanos
 * `firma_del_puente` / `firmado_por_el_puente`.
 */
function es_firma_del_puente(firma) {
  if (typeof firma === 'string') return es_nombre_del_puente(firma);
  if (!es_objeto(firma)) return false;
  if (firma.firma_del_puente === true || firma.firmado_por_el_puente === true) return true;
  for (const campo of ['actor', 'autor', 'firmante', 'proyecto', 'cuenta', 'nombre']) {
    if (es_nombre_del_puente(firma[campo])) return true;
  }
  return false;
}

/** Veto ejecutable: una firma del puente se rechaza, sin excepciones. */
function vetar(firma) {
  if (firma === undefined || firma === null || (typeof firma === 'string' && firma.trim() === '')) {
    return { ok: false, motivo: CODIGOS.SIN_FIRMA, faltan: ['firma'] };
  }
  if (es_firma_del_puente(firma)) {
    return {
      ok: false,
      motivo: CODIGOS.FIRMA_DEL_PUENTE,
      veto: es_objeto(firma) ? clonar(firma) : String(firma),
      pista: 'el puente no tiene identidad publica: lo publicado se atribuye al proyecto dueno (E2)'
    };
  }
  return { ok: true, motivo: CODIGOS.NO_CUENTA_NADA, firma: es_objeto(firma) ? clonar(firma) : String(firma) };
}

/**
 * La atribucion de un elemento publicado: la que lleva dentro (`item.atribucion`)
 * o el propio elemento cuando YA es una atribucion suelta. Una pieza con sello
 * pero sin atribucion NO cuenta: el sello dice de quien es, pero no que se haya
 * atribuido, y T2 no puede declarar limpio lo que no sabe de quien es.
 */
function atribucion_de(item) {
  if (!es_objeto(item)) return null;
  if (es_objeto(item.atribucion)) return item.atribucion;
  const parece_atribucion =
    texto_no_vacio(item.proyecto) &&
    (item.cuenta !== undefined ||
      item.autor !== undefined ||
      item.firmado_por_el_puente !== undefined ||
      item.sello_de_cuenta !== undefined);
  return parece_atribucion ? item : null;
}

/** Proyecto de una atribucion o de una pieza con atribucion/sello (o null). */
function proyecto_de(item) {
  if (!es_objeto(item)) return null;
  const a = es_objeto(item.atribucion) ? item.atribucion : item;
  if (texto_no_vacio(a.proyecto)) return String(a.proyecto).trim();
  const c = comprobar_sello(item);
  if (c.ok) {
    const s = vigente(item) || c.sello;
    if (texto_no_vacio(s.proyecto)) return String(s.proyecto).trim();
  }
  return null;
}

/** Cuenta de una atribucion (handle) o null. */
function cuenta_de(item) {
  if (!es_objeto(item)) return null;
  const a = es_objeto(item.atribucion) ? item.atribucion : item;
  return texto_no_vacio(a.cuenta) ? String(a.cuenta).trim() : null;
}

/**
 * Audita lo publicado (o una lista de atribuciones). Limpio exige que TODO este
 * atribuido a un proyecto y que ninguna firma sea del puente.
 *
 * @param {object[]|{piezas:object[],atribuciones?:object[]}} publicado
 */
function auditar(publicado) {
  const lista = Array.isArray(publicado)
    ? publicado
    : (es_objeto(publicado) && Array.isArray(publicado.piezas) ? publicado.piezas
      : (es_objeto(publicado) && Array.isArray(publicado.atribuciones) ? publicado.atribuciones : null));
  if (lista === null) {
    return { ok: false, limpio: false, motivo: CODIGOS.SIN_ATRIBUCION, total: 0, hallazgos: [] };
  }

  const hallazgos = [];
  lista.forEach((item, indice) => {
    const a = atribucion_de(item);
    const cuenta = a && texto_no_vacio(a.cuenta) ? String(a.cuenta).trim() : null;
    if (!a) {
      hallazgos.push({ indice, motivo: CODIGOS.SIN_ATRIBUCION, proyecto: null, cuenta });
      return;
    }
    const proyecto = texto_no_vacio(a.proyecto) ? String(a.proyecto).trim() : null;
    if (!proyecto) {
      hallazgos.push({ indice, motivo: CODIGOS.SIN_ATRIBUCION, proyecto: null, cuenta });
      return;
    }
    if (es_firma_del_puente(a) || a.firmado_por_el_puente === true) {
      hallazgos.push({ indice, motivo: CODIGOS.FIRMA_DEL_PUENTE, proyecto, cuenta });
      return;
    }
    if (cuenta && es_nombre_del_puente(cuenta)) {
      hallazgos.push({ indice, motivo: CODIGOS.CUENTA_DEL_SISTEMA, proyecto, cuenta });
    }
  });

  const firmas = hallazgos.filter((h) => h.motivo === CODIGOS.FIRMA_DEL_PUENTE);
  const sin_atribucion = hallazgos.filter((h) => h.motivo === CODIGOS.SIN_ATRIBUCION);
  return {
    ok: hallazgos.length === 0,
    limpio: hallazgos.length === 0,
    total: lista.length,
    hallazgos,
    firmas,
    sin_atribucion
  };
}

/**
 * ¿Hay una cuenta del sistema en el padron? Y, mas importante, ¿hay alguna cuenta
 * sin proyecto dueno? Lo segundo NO es una cuenta del sistema: es un fallo de
 * alta, y se devuelve aparte para que no se disfrace de prohibicion.
 *
 * @param {object|object[]} padron estado del padron ({asientos:[]}) o lista de asientos
 * @returns {{ok:boolean, hay:boolean, cuentas:object[], fallos_de_alta:object[], asientos:number}}
 */
function hay_cuenta_del_sistema(padron) {
  const asientos = Array.isArray(padron)
    ? padron
    : (es_objeto(padron) && Array.isArray(padron.asientos) ? padron.asientos : null);
  if (asientos === null) {
    return { ok: false, hay: false, motivo: CODIGOS.SIN_PADRON, cuentas: [], fallos_de_alta: [], asientos: 0 };
  }

  const cuentas = [];
  const fallos = [];
  asientos.forEach((asiento, indice) => {
    if (!es_objeto(asiento)) {
      fallos.push({ indice, motivo: CODIGOS.ASIENTO_ILEGIBLE });
      return;
    }
    const proyecto = texto_no_vacio(asiento.proyecto) ? String(asiento.proyecto).trim() : '';
    const cuenta = texto_no_vacio(asiento.cuenta) ? String(asiento.cuenta).trim() : '';

    if (!proyecto) {
      fallos.push({
        indice,
        cuenta,
        motivo: CODIGOS.CUENTA_SIN_PROYECTO_DUENO,
        pista: 'un asiento sin proyecto dueno es un alta a medias, no una cuenta del sistema'
      });
      return;
    }
    if (es_nombre_del_puente(proyecto) || es_nombre_del_puente(cuenta)) {
      cuentas.push({ indice, cuenta, proyecto, motivo: CODIGOS.CUENTA_DEL_SISTEMA });
    }
  });

  return {
    ok: cuentas.length === 0 && fallos.length === 0,
    hay: cuentas.length > 0,
    cuentas,
    fallos_de_alta: fallos,
    asientos: asientos.length
  };
}

/** La auditoria del padron entero (nombre del diseno: `auditar(padron)` en T2). */
function auditar_padron(padron) {
  return hay_cuenta_del_sistema(padron);
}

module.exports = {
  CODIGOS,
  NOMBRES_DEL_PUENTE,
  es_nombre_del_puente,
  es_firma_del_puente,
  vetar,
  atribucion_de,
  proyecto_de,
  cuenta_de,
  auditar,
  hay_cuenta_del_sistema,
  auditar_padron
};

// Vista "clase" para quien prefiera el nombre del diseno (T2 · FronteraSinIdentidad).
module.exports.FronteraSinIdentidad = Object.freeze({
  auditar,
  vetar,
  hay_cuenta_del_sistema,
  auditar_padron,
  es_firma_del_puente
});

'use strict';

/**
 * nivel — Q3 · NivelDeAutonomia · REFLEJO.
 *
 * Cuanto puede hacer el puente en una cuenta SIN preguntar. Tres niveles, y el
 * orden importa porque es una escalera de conservaduria:
 *
 *   borrador   no escribe en el mundo. Observa y prepara. (EL CONSERVADOR)
 *   permiso    escribe, pero cada accion que no sea inocua necesita un si.
 *   ejecutar   escribe solo, con la ventana de arrepentimiento delante.
 *
 * REGLA DURA: **sin nivel declarado, el nivel es el CONSERVADOR (borrador)**. No
 * hay "nivel por defecto razonable" ni herencia del proyecto ni memoria de la
 * ultima vez. El silencio no concede autonomia, igual que el silencio no concede
 * permisos (Q2). Un nivel desconocido tampoco asciende: cae al conservador.
 *
 * DOS REGLAS MAS, que son las que evitan el auto-permiso:
 *
 *   1. **Una declaracion sin declarante no es una declaracion.** Un nivel suelto
 *      ('ejecutar' como string) no tiene quien lo firme, asi que se lee como no
 *      declarado. Declarar el nivel de una cuenta es un acto del DUENO: si firma
 *      `agente` o `sistema`, la declaracion existe pero NO se aplica (se
 *      devuelve el conservador y se conserva `declarado` para que se vea el
 *      intento). Si el sistema pudiera subirse el nivel, la autonomia seria una
 *      comedia.
 *   2. **El nivel es de UNA cuenta y de UN proyecto.** Una declaracion de
 *      `@otra` no vale para esta cuenta, y una de otro proyecto tampoco. Pedir
 *      prestado el nivel de una cuenta con buena fama es la version Q3 del
 *      ataque de las dos vias.
 *
 * Puro: sin IO, sin reloj, sin estado global. La caducidad de una declaracion,
 * si la hay, se evalua contra el `momento` inyectado en la consulta.
 *
 * Lo que NO hace este fichero: guardar el nivel. Guardarlo es del padron o del
 * contrato del proyecto (bloque 2). Q3 lee la declaracion que le dan y dice cual
 * es el nivel EFECTIVO; nunca la escribe ni la inventa.
 */

const { es_objeto, es_instante, texto_no_vacio, QUIENES } = require('../core/formas');
const { normalizar_cuenta } = require('../core/casillas');
const ritmo = require('../core/ritmo');

// De mas conservador a menos. El indice es la posicion en la escalera.
const NIVELES = Object.freeze(['borrador', 'permiso', 'ejecutar']);
const CONSERVADOR = 'borrador';
const MAXIMO = 'ejecutar';

const MOTIVOS = Object.freeze({
  SIN_NIVEL_DECLARADO: 'sin_nivel_declarado',
  NIVEL_DESCONOCIDO: 'nivel_desconocido',
  NIVEL_SIN_DECLARANTE: 'nivel_sin_declarante',
  NIVEL_NO_LO_DECLARA_EL_DUENO: 'nivel_no_lo_declara_el_dueno',
  NIVEL_DE_OTRA_CUENTA: 'nivel_de_otra_cuenta',
  NIVEL_DE_OTRO_PROYECTO: 'nivel_de_otro_proyecto',
  DECLARACION_CADUCADA: 'declaracion_caducada',
  DECLARACION_SIN_MOMENTO: 'declaracion_sin_momento'
});

function es_nivel(v) {
  return typeof v === 'string' && NIVELES.includes(v);
}

/** Posicion en la escalera (0 = conservador). -1 si no es un nivel. */
function indice(nivel) {
  return es_nivel(nivel) ? NIVELES.indexOf(nivel) : -1;
}

/** -1 si `a` es mas conservador, 1 si `b` lo es, 0 si empatan. `null` si no valen. */
function comparar(a, b) {
  const ia = indice(a);
  const ib = indice(b);
  if (ia === -1 || ib === -1) return null;
  if (ia < ib) return -1;
  if (ia > ib) return 1;
  return 0;
}

/** El mas conservador de los dos; si uno no vale, gana el otro; si ninguno, el conservador. */
function mas_conservador(a, b) {
  const ia = indice(a);
  const ib = indice(b);
  if (ia === -1 && ib === -1) return CONSERVADOR;
  if (ia === -1) return NIVELES[ib];
  if (ib === -1) return NIVELES[ia];
  return NIVELES[Math.min(ia, ib)];
}

/** Un escalon MAS conservador. Nunca sube y nunca baja del suelo. */
function bajar(nivel, pasos = 1) {
  const i = indice(nivel);
  if (i === -1) return CONSERVADOR;
  const n = Math.max(0, i - Math.abs(Number(pasos) || 1));
  return NIVELES[n];
}

/** Un escalon MENOS conservador. Q6 no lo usa para el historial (a proposito). */
function subir(nivel, pasos = 1) {
  const i = indice(nivel);
  if (i === -1) return CONSERVADOR;
  const n = Math.min(NIVELES.length - 1, i + Math.abs(Number(pasos) || 1));
  return NIVELES[n];
}

/** El nivel, o el conservador si lo que llega no es un nivel. Fail closed. */
function techo(nivel) {
  return es_nivel(nivel) ? nivel : CONSERVADOR;
}

// ---------------------------------------------------------------------------
// declaraciones
// ---------------------------------------------------------------------------

/** Normaliza las tres formas que puede traer una declaracion. */
function _lista(declaracion) {
  if (Array.isArray(declaracion)) return declaracion.filter((d) => es_objeto(d));
  if (!es_objeto(declaracion)) return [];
  if (Array.isArray(declaracion.niveles)) return declaracion.niveles.filter((d) => es_objeto(d));
  if (declaracion.cuenta !== undefined || declaracion.nivel !== undefined) return [declaracion];
  return [];
}

/**
 * La declaracion que habla de ESTA cuenta. Si la unica que hay es de otra cuenta
 * se devuelve igualmente: el que llama necesita poder decir "esto no es tuyo"
 * en vez de "no hay nada", que son dos cosas distintas.
 */
function _declaracion_de(declaracion, cuenta, proyecto) {
  const candidatas = _lista(declaracion).filter((d) => normalizar_cuenta(d.cuenta) === cuenta);
  if (candidatas.length === 0) return null;
  if (texto_no_vacio(proyecto)) {
    // Gana la declaracion EXACTA del proyecto; si no la hay, vale la general
    // (la que no declara proyecto). Una cuenta puede tener varias.
    const exacta = candidatas.find((d) => texto_no_vacio(d.proyecto) && String(d.proyecto).trim() === String(proyecto).trim());
    if (exacta) return exacta;
    const general = candidatas.find((d) => !texto_no_vacio(d.proyecto));
    if (general) return general;
  }
  return candidatas[0];
}

/** Cualquier declaracion, para poder diagnosticar 'es de otra cuenta'. */
function _primera(declaracion) {
  const candidatas = _lista(declaracion);
  return candidatas.length > 0 ? candidatas[0] : null;
}

/**
 * Nivel efectivo de una cuenta.
 *
 * @param {*} declaracion  declaracion suelta, lista de declaraciones o `{niveles:[...]}`
 * @param {{cuenta:string, proyecto?:string, momento?:string}} consulta
 * @returns {{ok:boolean, nivel:string, origen:string, motivo:string|null, declarado:string|null, cuenta:string, proyecto:string|null}}
 *   `origen`: 'declarado' (se aplica tal cual) | 'sin_declarar' (no habia nada)
 *   | 'rebajado' (habia declaracion pero no se puede aplicar; `declarado` dice cual era)
 */
function resolver(declaracion, consulta) {
  const c = es_objeto(consulta) ? consulta : {};
  const cuenta = normalizar_cuenta(c.cuenta);
  const proyecto = texto_no_vacio(c.proyecto) ? String(c.proyecto).trim() : null;

  const sin = (motivo, extra) => Object.assign({
    ok: true,
    nivel: CONSERVADOR,
    origen: 'sin_declarar',
    motivo,
    declarado: null,
    cuenta,
    proyecto
  }, extra || {});

  if (!cuenta) return sin(MOTIVOS.SIN_NIVEL_DECLARADO, { faltan: ['cuenta'] });

  const d = _declaracion_de(declaracion, cuenta, proyecto);
  if (!d) {
    // Hay declaracion, pero es de otra cuenta: existe y no vale.
    if (_primera(declaracion)) return sin(MOTIVOS.NIVEL_DE_OTRA_CUENTA, { declarado: _primera(declaracion).nivel });
    return sin(MOTIVOS.SIN_NIVEL_DECLARADO);
  }

  if (texto_no_vacio(d.proyecto) && proyecto && String(d.proyecto).trim() !== proyecto) {
    return sin(MOTIVOS.NIVEL_DE_OTRO_PROYECTO);
  }

  // Declaracion caducada: se evalua contra el momento inyectado, nunca contra
  // un reloj de dentro.
  if (d.vigente_hasta !== undefined && d.vigente_hasta !== null) {
    if (!es_instante(d.vigente_hasta)) return sin(MOTIVOS.NIVEL_DESCONOCIDO, { declarado: d.nivel });
    if (texto_no_vacio(c.momento) === false) return sin(MOTIVOS.DECLARACION_SIN_MOMENTO, { declarado: d.nivel });
    if (!ritmo.antes_de(c.momento, d.vigente_hasta)) {
      return sin(MOTIVOS.DECLARACION_CADUCADA, { declarado: d.nivel });
    }
  }

  if (!es_nivel(d.nivel)) return sin(MOTIVOS.NIVEL_DESCONOCIDO, { declarado: d.nivel === undefined ? null : d.nivel });

  // Una declaracion sin declarante no es una declaracion.
  if (d.quien === undefined || d.quien === null) {
    return sin(MOTIVOS.NIVEL_SIN_DECLARANTE, { declarado: d.nivel });
  }
  if (!QUIENES.includes(String(d.quien))) {
    return sin(MOTIVOS.NIVEL_SIN_DECLARANTE, { declarado: d.nivel });
  }

  // Solo el dueno sube la autonomia. El agente y el sistema pueden declarar,
  // pero su declaracion no se aplica: se devuelve el conservador y se conserva
  // lo declarado para que la auditoria vea el intento.
  if (String(d.quien) !== 'dueno') {
    return {
      ok: true,
      nivel: CONSERVADOR,
      origen: 'rebajado',
      motivo: MOTIVOS.NIVEL_NO_LO_DECLARA_EL_DUENO,
      declarado: d.nivel,
      cuenta,
      proyecto
    };
  }

  return {
    ok: true,
    nivel: d.nivel,
    origen: 'declarado',
    motivo: null,
    declarado: d.nivel,
    cuenta,
    proyecto,
    desde: es_instante(d.momento) ? d.momento : null
  };
}

/** Declaracion bien formada (para validar en el borde antes de creerla). */
function validar_declaracion(declaracion) {
  const d = es_objeto(declaracion) ? declaracion : {};
  const faltan = [];
  const invalidos = [];
  if (!texto_no_vacio(d.cuenta)) faltan.push('cuenta');
  if (!texto_no_vacio(d.nivel)) faltan.push('nivel');
  if (!texto_no_vacio(d.quien)) faltan.push('quien');
  if (!es_instante(d.momento)) faltan.push('momento');
  if (texto_no_vacio(d.nivel) && !es_nivel(d.nivel)) invalidos.push('nivel');
  if (texto_no_vacio(d.quien) && !QUIENES.includes(String(d.quien))) invalidos.push('quien');
  return { ok: faltan.length === 0 && invalidos.length === 0, faltan, invalidos };
}

function describir() {
  return {
    niveles: NIVELES.slice(),
    conservador: CONSERVADOR,
    regla: 'sin nivel declarado, el conservador',
    declarante: 'dueno'
  };
}

module.exports = {
  MOTIVOS,
  NIVELES,
  CONSERVADOR,
  MAXIMO,
  es_nivel,
  indice,
  comparar,
  mas_conservador,
  bajar,
  subir,
  techo,
  resolver,
  validar_declaracion,
  describir
};

module.exports.NivelDeAutonomia = Object.freeze({
  NIVELES,
  CONSERVADOR,
  es_nivel,
  indice,
  comparar,
  mas_conservador,
  bajar,
  techo,
  resolver,
  validar_declaracion
});

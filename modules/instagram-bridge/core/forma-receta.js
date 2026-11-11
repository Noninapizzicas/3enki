'use strict';

/**
 * forma-receta — A4.1 · FormaDeReceta · REFLEJO.
 *
 * Una receta dice como se hace UNA cosa en UNA plataforma: que tiene que haber
 * antes (precondicion), que se hace paso a paso (pasos), que tiene que quedar al
 * final (postcondicion) y cuanto tiempo puede costar en total (techo). Cuatro
 * partes, ni tres ni cinco. Una receta sin postcondicion no es una receta: es
 * una lista de deseos que nadie puede comprobar al terminar.
 *
 * Cada paso declara sus cuatro partes: ancla_esperada, accion,
 * consecuencia_esperada y espera_maxima. Un paso sin ancla no se puede ejecutar
 * (no se sabe donde tocar) y un paso sin consecuencia no se puede vigilar (no se
 * sabe si ocurrio).
 *
 * Reglas que esta pieza hace ejecutables (diseno-oop.md, A4.1):
 *   - **Valida o rechaza, nunca rellena.** No hay valores por defecto para un
 *     hueco: un hueco se nombra. Rellenarlo con lo plausible es como una receta
 *     rota acaba pareciendo buena.
 *   - **Cada defecto lleva su numero de paso y la parte que falta.** Un rechazo
 *     que solo dice "receta invalida" obliga a adivinar cual de los ocho pasos
 *     esta mal. La tabla de imputacion es esta, y no se improvisa:
 *       precondicion -> paso 1 (se comprueba antes del primero)
 *       pasos        -> el paso concreto (1..N)
 *       postcondicion-> paso N (es lo que tiene que producir el ultimo paso)
 *       techo        -> el paso donde se agota el presupuesto, o 0 si es de la
 *                       receta entera
 *     `paso: 0` significa "no es de un paso, es de la receta"; nunca se usa para
 *     tapar un defecto que si tiene paso.
 *   - **El techo tiene que caber.** Si la suma de las esperas maximas de los
 *     pasos supera el techo, la receta se rechaza nombrando el paso donde se
 *     agota: un techo que no cabe es una receta que se cortara a mitad.
 *   - **El tipo de accion es una lista cerrada**, espejo de lo que A3 sabe
 *     ejecutar (`tocar`, `escribir`, `desplazar`, `esperar`). Una accion que A3
 *     no sabe hacer no es una receta: es una intencion.
 *
 * Puro: sin reloj, sin red, sin IO, sin estado global. Todo entra por argumento
 * y todo lo que decide sale por el valor devuelto.
 *
 * Ver plan-construccion.md seccion 8 (bloque 3) y diseno-oop.md "A4.1".
 */

const { es_objeto, texto_no_vacio, clonar, PLATAFORMAS, validar_ancla } = require('./formas');

const PLATAFORMA_POR_DEFECTO = 'instagram';

const PARTES = Object.freeze(['precondicion', 'pasos', 'postcondicion', 'techo']);
const PARTES_DE_PASO = Object.freeze(['ancla_esperada', 'accion', 'consecuencia_esperada', 'espera_maxima']);

// Espejo de A3 (`escribir`, `tocar`, `desplazar`, `esperar`). Si A3 aprende una
// accion nueva, esta lista se amplia en el mismo commit; no antes.
const ACCIONES = Object.freeze(['tocar', 'escribir', 'desplazar', 'esperar']);
const DIRECCIONES = Object.freeze(['arriba', 'abajo', 'izquierda', 'derecha']);

// Motivos de defecto. Nombres estables y sin tildes: viajan en payloads y en
// informes, y se cuentan por motivo (C4 cuenta las faltas por paso y por motivo).
const MOTIVOS = Object.freeze({
  FALTA: 'falta',
  INVALIDO: 'invalido',
  NO_ES_LISTA: 'no_es_lista',
  SIN_PASOS: 'sin_pasos',
  NO_ES_OBJETO: 'no_es_objeto',
  TECHO_INSUFICIENTE: 'techo_insuficiente'
});

function defecto(paso, parte, motivo, extra) {
  return Object.assign(
    { paso: Number.isInteger(paso) ? paso : 0, parte, motivo },
    extra || {}
  );
}

// ---- partes de un paso -----------------------------------------------------

/**
 * Normaliza una parte descriptiva (precondicion / postcondicion /
 * consecuencia): acepta el texto suelto o el objeto `{descripcion, ancla}`.
 * No rellena: si no hay descripcion, devuelve null y el validador dira cual es
 * el hueco.
 */
function descripcion_de(valor) {
  if (texto_no_vacio(valor)) return { descripcion: String(valor).trim(), ancla: null };
  if (!es_objeto(valor)) return null;
  if (!texto_no_vacio(valor.descripcion)) return null;
  return {
    descripcion: String(valor.descripcion).trim(),
    ancla: valor.ancla === undefined ? null : clonar(valor.ancla)
  };
}

function validar_descripcion(valor, paso, parte, defectos) {
  const d = descripcion_de(valor);
  if (!d) {
    defectos.push(defecto(paso, parte, MOTIVOS.FALTA, { campo: 'descripcion' }));
    return null;
  }
  if (d.ancla !== null) {
    const a = validar_ancla(d.ancla);
    if (!a.ok) {
      defectos.push(defecto(paso, parte, a.faltan.length ? MOTIVOS.FALTA : MOTIVOS.INVALIDO, {
        campo: 'ancla',
        faltan: a.faltan,
        invalidos: a.invalidos
      }));
      return null;
    }
    d.ancla = Object.freeze({
      nombre_visible: String(d.ancla.nombre_visible).trim(),
      tipo: String(d.ancla.tipo).trim()
    });
  }
  return Object.freeze(d);
}

/**
 * Valida la accion de un paso contra la lista cerrada de A3.
 * Devuelve la accion normalizada o null (con el defecto ya anotado).
 */
function validar_accion(accion, paso, defectos) {
  if (!es_objeto(accion)) {
    defectos.push(defecto(paso, 'accion', MOTIVOS.FALTA, { campo: 'tipo' }));
    return null;
  }
  const tipo = texto_no_vacio(accion.tipo) ? String(accion.tipo).trim().toLowerCase() : null;
  if (!tipo) {
    defectos.push(defecto(paso, 'accion', MOTIVOS.FALTA, { campo: 'tipo' }));
    return null;
  }
  if (!ACCIONES.includes(tipo)) {
    defectos.push(defecto(paso, 'accion', MOTIVOS.INVALIDO, { campo: 'tipo', valor: tipo }));
    return null;
  }

  const out = { tipo };
  if (tipo === 'escribir') {
    if (!texto_no_vacio(accion.texto)) {
      defectos.push(defecto(paso, 'accion', MOTIVOS.FALTA, { campo: 'texto' }));
      return null;
    }
    out.texto = String(accion.texto);
  }
  if (tipo === 'desplazar') {
    const direccion = texto_no_vacio(accion.direccion) ? String(accion.direccion).trim().toLowerCase() : null;
    if (!direccion) {
      defectos.push(defecto(paso, 'accion', MOTIVOS.FALTA, { campo: 'direccion' }));
      return null;
    }
    if (!DIRECCIONES.includes(direccion)) {
      defectos.push(defecto(paso, 'accion', MOTIVOS.INVALIDO, { campo: 'direccion', valor: direccion }));
      return null;
    }
    out.direccion = direccion;
    if (accion.distancia !== undefined && accion.distancia !== null) {
      if (!Number.isFinite(accion.distancia) || accion.distancia <= 0) {
        defectos.push(defecto(paso, 'accion', MOTIVOS.INVALIDO, { campo: 'distancia' }));
        return null;
      }
      out.distancia = Number(accion.distancia);
    }
  }
  if (tipo === 'esperar') {
    const ventana = accion.ventana_ms;
    if (!Number.isInteger(ventana) || ventana <= 0) {
      defectos.push(defecto(paso, 'accion', MOTIVOS.INVALIDO, { campo: 'ventana_ms' }));
      return null;
    }
    out.ventana_ms = ventana;
  }
  return Object.freeze(out);
}

/**
 * Valida un paso. `numero` es el numero de paso 1..N; un paso suelto sin numero
 * se valida con 0 y se dice en el defecto.
 *
 * @param {object} paso
 * @param {number} [numero]
 * @returns {{ok:boolean, numero:number, paso?:object, defectos:object[]}}
 */
function validar_paso(paso, numero) {
  const n = Number.isInteger(numero) && numero > 0 ? numero : 0;
  const defectos = [];

  if (!es_objeto(paso)) {
    return { ok: false, numero: n, defectos: [defecto(n, 'paso', MOTIVOS.NO_ES_OBJETO)] };
  }

  // 1 · ancla_esperada. Sin ancla no se sabe donde tocar.
  const ancla = validar_ancla(paso.ancla_esperada);
  if (!ancla.ok) {
    defectos.push(defecto(n, 'ancla_esperada', ancla.faltan.length ? MOTIVOS.FALTA : MOTIVOS.INVALIDO, {
      faltan: ancla.faltan,
      invalidos: ancla.invalidos
    }));
  }

  // 2 · accion. Sin accion no hay paso, solo una observacion.
  const accion = validar_accion(paso.accion, n, defectos);

  // 3 · consecuencia_esperada. Sin consecuencia no se puede vigilar el paso.
  const consecuencia = validar_descripcion(paso.consecuencia_esperada, n, 'consecuencia_esperada', defectos);

  // 4 · espera_maxima. Sin techo por paso, un paso colgado cuelga la receta.
  const espera = paso.espera_maxima;
  if (espera === undefined || espera === null) {
    defectos.push(defecto(n, 'espera_maxima', MOTIVOS.FALTA));
  } else if (!Number.isInteger(espera) || espera <= 0) {
    defectos.push(defecto(n, 'espera_maxima', MOTIVOS.INVALIDO, { valor: espera }));
  }

  if (defectos.length) return { ok: false, numero: n, defectos };

  return {
    ok: true,
    numero: n,
    defectos: [],
    paso: Object.freeze({
      ancla_esperada: Object.freeze({
        nombre_visible: String(paso.ancla_esperada.nombre_visible).trim(),
        tipo: String(paso.ancla_esperada.tipo).trim()
      }),
      accion,
      consecuencia_esperada: consecuencia,
      espera_maxima: espera
    })
  };
}

// ---- la receta entera ------------------------------------------------------

/** ¿La receta declara que tiene que quedar al final? (si | no) */
function tiene_postcondicion(receta) {
  if (!es_objeto(receta)) return false;
  return descripcion_de(receta.postcondicion) !== null;
}

/**
 * Valida las cuatro partes y las cuatro partes de cada paso.
 *
 * @param {object} receta
 * @returns {{ok:boolean, motivo?:string, receta?:object, defectos:object[]}}
 *   `ok:true` devuelve la receta NORMALIZADA (solo las partes declaradas, sin
 *   campos de mas) y congelada: lo que se publica es exactamente lo que se
 *   valido. `ok:false` devuelve `defectos` con paso, parte y motivo.
 */
function validar(receta) {
  if (!es_objeto(receta)) {
    return { ok: false, motivo: 'defecto_de_forma', defectos: [defecto(0, 'receta', MOTIVOS.NO_ES_OBJETO)] };
  }

  const defectos = [];

  // plataforma y capacidad: la clave del catalogo (A4.4). Sin clave, la receta
  // no se puede resolver (A2) ni versionar.
  const plataforma = texto_no_vacio(receta.plataforma)
    ? String(receta.plataforma).trim().toLowerCase()
    : PLATAFORMA_POR_DEFECTO;
  if (!PLATAFORMAS.includes(plataforma)) {
    defectos.push(defecto(0, 'plataforma', MOTIVOS.INVALIDO, { valor: plataforma }));
  }
  const capacidad = texto_no_vacio(receta.capacidad) ? String(receta.capacidad).trim() : null;
  if (!capacidad) defectos.push(defecto(0, 'capacidad', MOTIVOS.FALTA));

  // pasos primero: el numero de paso de los demas defectos depende de cuantos hay.
  let pasos = [];
  if (receta.pasos === undefined || receta.pasos === null) {
    defectos.push(defecto(0, 'pasos', MOTIVOS.FALTA));
  } else if (!Array.isArray(receta.pasos)) {
    defectos.push(defecto(0, 'pasos', MOTIVOS.NO_ES_LISTA));
  } else if (receta.pasos.length === 0) {
    defectos.push(defecto(0, 'pasos', MOTIVOS.SIN_PASOS));
  } else {
    receta.pasos.forEach((paso, i) => {
      const v = validar_paso(paso, i + 1);
      if (v.ok) pasos.push(v.paso);
      else defectos.push(...v.defectos);
    });
  }

  const ultimo = pasos.length || (Array.isArray(receta.pasos) ? receta.pasos.length : 0);

  // precondicion: se comprueba antes del paso 1.
  const precondicion = validar_descripcion(receta.precondicion, pasos.length ? 1 : 0, 'precondicion', defectos);

  // postcondicion: es lo que tiene que producir el ULTIMO paso. Si falta, el
  // defecto se imputa a ese paso: es donde se va a notar.
  const postcondicion = validar_descripcion(receta.postcondicion, ultimo, 'postcondicion', defectos);

  // techo total.
  const techo = receta.techo;
  if (techo === undefined || techo === null) {
    defectos.push(defecto(0, 'techo', MOTIVOS.FALTA));
  } else if (!Number.isInteger(techo) || techo <= 0) {
    defectos.push(defecto(0, 'techo', MOTIVOS.INVALIDO, { valor: techo }));
  } else if (pasos.length) {
    // El techo tiene que caber: se acumula paso a paso y se nombra el primero
    // donde se agota el presupuesto.
    let acumulado = 0;
    let agotado = 0;
    for (let i = 0; i < pasos.length && agotado === 0; i += 1) {
      acumulado += pasos[i].espera_maxima;
      if (acumulado > techo) agotado = i + 1;
    }
    if (agotado !== 0) {
      defectos.push(defecto(agotado, 'techo', MOTIVOS.TECHO_INSUFICIENTE, {
        techo,
        necesita_ms: acumulado
      }));
    }
  }

  if (defectos.length) return { ok: false, motivo: 'defecto_de_forma', defectos };

  const limpia = Object.freeze({
    plataforma,
    capacidad,
    precondicion,
    pasos: Object.freeze(pasos),
    postcondicion,
    techo
  });
  return { ok: true, receta: limpia, defectos: [] };
}

function es_receta(v) {
  return validar(v).ok;
}

/** Presupuesto declarado de los pasos (suma de esperas maximas). */
function coste_declarado_ms(receta) {
  if (!es_objeto(receta) || !Array.isArray(receta.pasos)) return 0;
  return receta.pasos.reduce((total, paso) => {
    const e = es_objeto(paso) ? paso.espera_maxima : 0;
    return total + (Number.isInteger(e) && e > 0 ? e : 0);
  }, 0);
}

/** Firma de forma: sirve para saber si dos recetas son la MISMA receta. */
function firma(receta) {
  const v = validar(receta);
  if (!v.ok) return null;
  return JSON.stringify(v.receta);
}

module.exports = {
  PLATAFORMA_POR_DEFECTO,
  PARTES,
  PARTES_DE_PASO,
  ACCIONES,
  DIRECCIONES,
  MOTIVOS,
  descripcion_de,
  validar_paso,
  tiene_postcondicion,
  validar,
  es_receta,
  coste_declarado_ms,
  firma
};

// Vista "clase" para quien prefiera el nombre del diseno (A4.1 · FormaDeReceta).
module.exports.FormaDeReceta = Object.freeze({
  validar,
  validar_paso,
  tiene_postcondicion,
  es_receta,
  coste_declarado_ms
});

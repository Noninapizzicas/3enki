'use strict';

/**
 * MotorDeOpciones — núcleo GENÉRICO de configuración de producto (subsistema `Opciones`).
 *
 * Banco de pruebas del norte documentado en CLAUDE.md ("AVANZADILLA — Subsistema Opciones").
 * Puro: sin bus, sin fs, sin frontend, sin dominio. Valida una selección contra las reglas de
 * cada opción (por su `modo`) y precia sumando los deltas. Dinero en CÉNTIMOS enteros (coherente
 * con _shared/pedido-tasador.js). "variaciones" (hostelería) = este motor con modos QUITAR+ELEGIR_VARIOS.
 *
 * Modelo (ver CLAUDE.md para el contrato JSON):
 *   Producto { precio_base_centimos, opciones: [Opcion] }
 *   Opcion   { id, etiqueta, modo, requerido?, min?, max?, valores: [Valor] }
 *   Valor    { id, etiqueta, delta_precio_centimos, disponible? }
 *   Seleccion = Map<opcion_id, Array<valor_id>>
 *
 * Patrón: Strategy por `modo` (REGLAS) + Composite (evaluarProducto agrega N opciones).
 */

const MODOS = ['ELEGIR_UNO', 'ELEGIR_VARIOS', 'QUITAR'];

function _delta(opcion, valorIds) {
  let d = 0;
  for (const id of valorIds) {
    const v = opcion.valores.find(x => x.id === id);
    if (v && Number.isInteger(v.delta_precio_centimos)) d += v.delta_precio_centimos;
  }
  return d;
}

// Guarda compartida: todo valor elegido pertenece a la opción y está disponible.
function _pertenecenYDisponibles(opcion, valorIds) {
  for (const id of valorIds) {
    const v = opcion.valores.find(x => x.id === id);
    if (!v) return { ok: false, motivo: `valor desconocido en «${opcion.etiqueta}»: ${id}` };
    if (v.disponible === false) return { ok: false, motivo: `no disponible: ${v.etiqueta || id}` };
  }
  return { ok: true };
}

// Strategy: una regla por modo. Cada una valida cardinalidad + pertenencia y precia.
const REGLAS = {
  ELEGIR_UNO(opcion, valorIds) {
    const n = valorIds.length;
    if (opcion.requerido && n !== 1) return { valida: false, motivo: `elige una opción de «${opcion.etiqueta}»`, deltaCentimos: 0 };
    if (!opcion.requerido && n > 1) return { valida: false, motivo: `solo una en «${opcion.etiqueta}»`, deltaCentimos: 0 };
    const p = _pertenecenYDisponibles(opcion, valorIds);
    if (!p.ok) return { valida: false, motivo: p.motivo, deltaCentimos: 0 };
    return { valida: true, motivo: null, deltaCentimos: _delta(opcion, valorIds) };
  },

  ELEGIR_VARIOS(opcion, valorIds) {
    const n = valorIds.length;
    const min = Number.isInteger(opcion.min) ? opcion.min : 0;
    const max = Number.isInteger(opcion.max) ? opcion.max : Infinity;
    if (n < min) return { valida: false, motivo: `mínimo ${min} en «${opcion.etiqueta}»`, deltaCentimos: 0 };
    if (n > max) return { valida: false, motivo: `máximo ${max} en «${opcion.etiqueta}»`, deltaCentimos: 0 };
    const p = _pertenecenYDisponibles(opcion, valorIds);
    if (!p.ok) return { valida: false, motivo: p.motivo, deltaCentimos: 0 };
    return { valida: true, motivo: null, deltaCentimos: _delta(opcion, valorIds) };
  },

  QUITAR(opcion, valorIds) {
    // Solo se puede quitar lo que pertenece a la opción (la base); delta normalmente 0.
    const p = _pertenecenYDisponibles(opcion, valorIds);
    if (!p.ok) return { valida: false, motivo: p.motivo, deltaCentimos: 0 };
    return { valida: true, motivo: null, deltaCentimos: _delta(opcion, valorIds) };
  },
};

/** Evalúa UNA opción contra su selección → { valida, motivo, deltaCentimos }. */
function evaluarOpcion(opcion, valorIds = []) {
  if (!opcion || !opcion.modo) return { valida: false, motivo: 'opción sin modo', deltaCentimos: 0 };
  const regla = REGLAS[opcion.modo];
  if (!regla) return { valida: false, motivo: `modo desconocido: ${opcion.modo}`, deltaCentimos: 0 };
  if (!Array.isArray(opcion.valores)) return { valida: false, motivo: `«${opcion.etiqueta}» sin valores`, deltaCentimos: 0 };
  const unicos = [...new Set(valorIds || [])];
  return regla(opcion, unicos);
}

/**
 * Composite: evalúa TODAS las opciones del producto contra la selección del cliente.
 * @param producto    { precio_base_centimos, opciones: [Opcion] }
 * @param selecciones { [opcion_id]: Array<valor_id> }
 * @returns { valida, errores: [String], precio_final_centimos }
 */
function evaluarProducto(producto, selecciones = {}) {
  const errores = [];
  let extra = 0;
  const opciones = Array.isArray(producto && producto.opciones) ? producto.opciones : [];
  for (const o of opciones) {
    const r = evaluarOpcion(o, selecciones[o.id] || []);
    if (!r.valida) errores.push(r.motivo);
    else extra += r.deltaCentimos;
  }
  const base = Number.isInteger(producto && producto.precio_base_centimos) ? producto.precio_base_centimos : 0;
  return { valida: errores.length === 0, errores, precio_final_centimos: base + extra };
}

module.exports = { MODOS, evaluarOpcion, evaluarProducto };

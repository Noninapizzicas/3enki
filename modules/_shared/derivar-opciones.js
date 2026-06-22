'use strict';

/**
 * derivarOpciones — produce `producto.opciones` (subsistema Opciones) desde un producto y la paleta
 * de su familia/categoría. Determinista y puro. Lo usa menu-generator para LLENAR el contrato, y
 * variaciones para derivar al vuelo cuando la carta aún no trae `opciones` (compat).
 *
 * Mapea el dominio comida a los modos universales (ver CLAUDE.md "AVANZADILLA — Subsistema Opciones"):
 *   QUITAR        ← los ingredientes del propio producto (delta 0)
 *   ELEGIR_VARIOS ← la paleta de su familia menos lo que ya lleva (delta = precio_extra → céntimos)
 *
 * Dinero en CÉNTIMOS enteros (coherente con motor-opciones / pedido-tasador).
 */

function _centimos(euros) {
  const n = Number(euros);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/**
 * @param producto { ingredientes: [{id,nombre,emoji?}] }
 * @param paleta   [{id,nombre,emoji?,precio_extra?,disponible?}]  ingredientes que se pueden añadir
 * @param opts     { maxExtras?: int }
 * @returns Array<Opcion>  (vacío si el producto no admite quitar ni añadir)
 */
function derivarOpciones(producto, paleta = [], opts = {}) {
  const max = Number.isInteger(opts.maxExtras) ? opts.maxExtras : 10;
  const propios = (producto && Array.isArray(producto.ingredientes)) ? producto.ingredientes : [];
  const propiosIds = new Set(propios.map(i => i && i.id).filter(Boolean));
  const opciones = [];

  // QUITAR — los ingredientes del producto (se pueden quitar, sin coste).
  const quitables = propios.filter(i => i && i.id);
  if (quitables.length) {
    opciones.push({
      id: 'sin', etiqueta: 'Sin', modo: 'QUITAR',
      valores: quitables.map(i => ({
        id: i.id, etiqueta: i.nombre || i.id,
        ...(i.emoji ? { emoji: i.emoji } : {}),
        delta_precio_centimos: 0,
      })),
    });
  }

  // ELEGIR_VARIOS — la paleta de la familia menos lo que el producto ya lleva.
  const addables = (Array.isArray(paleta) ? paleta : []).filter(p => p && p.id && !propiosIds.has(p.id));
  if (addables.length) {
    opciones.push({
      id: 'anadir', etiqueta: 'Añadir', modo: 'ELEGIR_VARIOS', min: 0, max,
      valores: addables.map(p => ({
        id: p.id, etiqueta: p.nombre || p.id,
        ...(p.emoji ? { emoji: p.emoji } : {}),
        ref: p.id,
        delta_precio_centimos: _centimos(p.precio_extra),
        ...(p.disponible === false ? { disponible: false } : {}),
      })),
    });
  }

  return opciones;
}

module.exports = { derivarOpciones, _centimos };

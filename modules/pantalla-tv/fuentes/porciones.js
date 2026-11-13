'use strict';

/**
 * BLOQUE porciones — lo que hay HOY al corte y a cuánto el trozo.
 *
 * Su identidad: el mostrador de hoy. Su forma: franja.
 * Fuente: el módulo porciones (NO construido todavía) a través del documento
 * que este constructor recibe en `datos.porciones`.
 *
 * CONTRATO que el módulo porciones tendrá que cumplir — esto es TODO lo que la
 * pantalla le pide, no más:
 *
 *   {
 *     "fecha": "2026-11-11",
 *     "precio_porcion": 3.00,
 *     "pizzas": [ { "producto_id": "la_flota_mahon", "nombre": "Mahón", "imagen": "..." } ],
 *     "bundle": { "cada": 4, "precio": 10.50 }
 *   }
 *
 * Sin fuente, o con fecha de otro día, devuelve CERO piezas y la franja se
 * colapsa. Un dato de ayer no es un dato: es una mentira con fecha.
 */

const { euros } = require('../contrato');

module.exports = {
  id: 'porciones',
  cadencia: 'tanda',
  forma: 'franja',

  piezas(ctx) {
    const d = ctx.porciones;
    if (!d) return [];
    if (d.fecha !== ctx.hoy) return [];              // dato de ayer = no hay dato

    const precio = euros(d.precio_porcion);
    const pizzas = Array.isArray(d.pizzas) ? d.pizzas : [];
    if (!precio || !pizzas.length) return [];

    return pizzas.map((p, i) => ({
      id: `porciones.${p.producto_id || i}`,
      bloque: this.id, forma: 'franja', cadencia: 'tanda',
      titulo: p.nombre || 'Porción',
      precio,
      imagen: p.imagen || null,
      etiquetas: [],
      datos: { producto_id: p.producto_id || null, bundle: d.bundle || null, fecha: d.fecha }
    }));
  },

  /** El hueco declarado, para que el cableado sepa qué le falta (y no lo tape). */
  requiere: 'módulo porciones (documento porciones.json del proyecto)'
};

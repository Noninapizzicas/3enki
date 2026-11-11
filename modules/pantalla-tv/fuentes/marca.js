'use strict';

/**
 * BLOQUE marca — su identidad es el sello. Su forma: cabecera, a los dos lados.
 * Fuente: marca.json (esencia + visual). No copia nada: lo lee.
 * Cadencia: fijo (no rota).
 */

module.exports = {
  id: 'marca',
  cadencia: 'fijo',
  forma: 'cabecera',

  piezas(ctx) {
    const b = ctx.proyeccion.branding || {};
    if (!b.nombre) return [];
    const logo = ctx.logo_url || b.logo || null;
    return [
      {
        id: 'marca.logo.izq', bloque: this.id, forma: 'cabecera', posicion: 'izq', cadencia: 'fijo',
        titulo: b.nombre, imagen: logo, datos: { tipo: 'logo' }
      },
      {
        id: 'marca.logo.der', bloque: this.id, forma: 'cabecera', posicion: 'der', cadencia: 'fijo',
        titulo: b.nombre, imagen: logo, datos: { tipo: 'logo', espejo: true }
      }
    ];
  }
};

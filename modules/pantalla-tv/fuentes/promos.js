'use strict';

/**
 * BLOQUE promos — la oferta con fecha. Su forma: cifra o ficha.
 *
 * Fuente: carta-marketing (documento promos.json del proyecto), que este
 * constructor recibe en `datos.promos`.
 *
 * Contrato mínimo:
 *   { "promos": [ { "id", "titulo", "texto", "desde", "hasta", "precio"?, "imagen"? } ] }
 *
 * Una promo fuera de fecha no entra: la pantalla no anuncia lo que ya pasó ni
 * lo que aún no empieza.
 */

const { euros } = require('../contrato');

module.exports = {
  id: 'promos',
  cadencia: 'tanda',
  forma: 'cifra',

  piezas(ctx) {
    const d = ctx.promos;
    if (!d) return [];
    const hoy = ctx.hoy;
    const vigentes = (Array.isArray(d.promos) ? d.promos : []).filter(p =>
      (!p.desde || p.desde <= hoy) && (!p.hasta || p.hasta >= hoy)
    );
    return vigentes.map(p => ({
      id: `promos.${p.id}`, bloque: this.id, forma: p.precio ? 'cifra' : 'ficha', cadencia: 'tanda',
      titulo: p.titulo, subtitulo: p.texto || null,
      precio: p.precio ? euros(p.precio) : null,
      imagen: p.imagen || null, etiquetas: [],
      datos: { desde: p.desde || null, hasta: p.hasta || null, promo: true }
    }));
  },

  requiere: 'carta-marketing (documento promos.json del proyecto)'
};

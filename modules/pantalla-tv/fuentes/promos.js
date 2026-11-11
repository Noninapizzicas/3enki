'use strict';

/**
 * BLOQUE promos — la oferta con fecha. Su forma: cifra o ficha.
 *
 * Fuente: carta-marketing, que la escribe en DOS documentos y este bloque funde
 * en uno (lo hace `desdeDocumentos`, antes de construir):
 *
 *   copy.json  → lo que el dueño redactó para la carta: { promos: [{ titulo, texto }] }
 *   promos.json → la oferta con ventana: { promos: [{ id, titulo, texto, desde, hasta, precio?, imagen? }] }
 *
 * Contrato que consume `piezas()` (datos.promos):
 *   { "promos": [ { "id", "titulo", "texto", "desde", "hasta", "precio"?, "imagen"? } ] }
 *
 * Una promo fuera de fecha no entra: la pantalla no anuncia lo que ya pasó ni
 * lo que aún no empieza. Y sin ninguna de las dos fuentes no se inventa nada:
 * `datos.promos` llega null y la zona se colapsa.
 */

const { euros } = require('../contrato');

/** Clave de identidad de una promo: el título, sin acentos ni adornos. */
const clave = (titulo) => String(titulo || '').trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Dos documentos → una lista. Se funden por clave de título: la ficha CON
 * ventana (promos.json) manda sobre el texto suelto del mismo título
 * (copy.json); las que solo existen como texto entran sin ventana — se leen
 * siempre, porque el propio texto dice cuándo valen. Nada → null.
 */
function desdeDocumentos(copy, doc) {
  const deCopy = (copy && Array.isArray(copy.promos) ? copy.promos : [])
    .filter(p => p && p.titulo)
    .map(p => ({ id: clave(p.titulo), titulo: p.titulo, texto: p.texto || null }));
  const deDoc = (doc && Array.isArray(doc.promos) ? doc.promos : [])
    .filter(p => p && p.titulo)
    .map(p => ({ ...p, id: p.id || clave(p.titulo) }));

  const porTitulo = new Map();
  for (const p of deCopy) porTitulo.set(clave(p.titulo), p);
  for (const p of deDoc) {
    const k = clave(p.titulo);
    porTitulo.set(k, { ...(porTitulo.get(k) || {}), ...p });
  }
  const lista = [...porTitulo.values()];
  return lista.length ? { promos: lista } : null;
}

module.exports = {
  id: 'promos',
  cadencia: 'tanda',
  forma: 'cifra',
  desdeDocumentos,

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

  requiere: 'carta-marketing (copy.json del proyecto — promos escritas por el dueño)'
};

'use strict';

/**
 * BLOQUE promos — la oferta que marketing ha APROBADO para la quincena.
 *
 * Hacen falta DOS documentos. Con uno solo no entra nada: la pantalla no
 * redacta promociones ni las da por buenas, solo obedece a lo que ya lo está.
 *
 *   1. LA OFERTA — pizzepos/promos.json (la redacta carta-marketing)
 *      { "promos": [ { "id", "titulo", "texto", "desde", "hasta", "precio"?, "imagen"? } ] }
 *
 *   2. LA APROBACIÓN — prisma/marketing/marketing-calendar.json (la firma el dueño)
 *      { "entradas": [ { "id", "titulo", "canal_id", "fecha", "estado" } ] }
 *
 * Las tres condiciones de la aprobación, y la cuarta de la oferta:
 *   a) la entrada está APROBADA: estado 'programado' o 'ejecutado'.
 *      Una entrada en 'borrador' es una idea, y una idea no se anuncia.
 *   b) la entrada es de ESTE canal: canal_id === cableado.promos.canal_id.
 *      Lo que se aprueba para Instagram no sale en la tele del escaparate.
 *   c) su fecha cae dentro de la QUINCENA VIGENTE (día 1-15 o 16-fin del mes
 *      de hoy): el plan se aprueba por quincenas, no por siempre.
 *   d) la ventana propia de la oferta (desde/hasta) cubre hoy.
 *
 * Emparejamiento oferta ↔ aprobación: por `id` si la oferta lo trae, si no por
 * título normalizado. El título de la oferta manda para pintar; la fecha de la
 * entrada se conserva como `aprobada_en`.
 *
 * Lo que falta y se dice en voz alta: el P&L (viabilidad) todavía evalúa PLATOS
 * (food cost, margen), no ofertas — no hay veredicto económico sobre un descuento.
 * Cuando exista, entra aquí como quinta condición. Mientras tanto la puerta es
 * marketing + dueño, y no nos la inventamos.
 */

const { euros } = require('../contrato');

/** El día de hoy ('YYYY-MM-DD') → la quincena que lo contiene: 1-15 o 16-fin. */
function quincenaDe(hoy) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(hoy || ''));
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const mm = String(mes).padStart(2, '0');
  return dia <= 15
    ? { inicio: `${anio}-${mm}-01`, fin: `${anio}-${mm}-15` }
    : { inicio: `${anio}-${mm}-16`, fin: `${anio}-${mm}-${String(ultimo).padStart(2, '0')}` };
}

/** Clave de identidad: el título sin acentos ni adornos. */
const clave = (titulo) => String(titulo || '').trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const ESTADOS_APROBADA = ['programado', 'ejecutado'];

/** ¿Esta entrada del calendario autoriza una promo hoy, en este canal? */
function entradaAprobada(entrada, quincena, canal) {
  if (!entrada || !ESTADOS_APROBADA.includes(entrada.estado)) return false;
  if (!canal) return false;                       // sin canal declarado no hay nada aprobado para la pantalla
  if (entrada.canal_id !== canal) return false;
  if (!entrada.fecha || !quincena) return false;
  return entrada.fecha >= quincena.inicio && entrada.fecha <= quincena.fin;
}

/**
 * Oferta + calendario → la lista que la pantalla puede anunciar.
 * Devuelve null si no queda ninguna (la zona se colapsa: no se pinta un hueco).
 */
function desdeAprobadas(calendario, doc, hoy, canal) {
  const ofertas = (doc && Array.isArray(doc.promos) ? doc.promos : []).filter(p => p && p.titulo);
  if (!ofertas.length) return null;

  const quincena = quincenaDe(hoy);
  const entradas = (calendario && Array.isArray(calendario.entradas) ? calendario.entradas : [])
    .filter(e => entradaAprobada(e, quincena, canal));

  const aprobadas = [];
  for (const oferta of ofertas) {
    const k = clave(oferta.titulo);
    const entrada = entradas.find(e =>
      (oferta.id && e.id === oferta.id) || clave(e.titulo) === k);
    if (!entrada) continue;                       // sin aprobación no se anuncia
    aprobadas.push({
      ...oferta,
      id: oferta.id || k,
      aprobada_en: entrada.fecha,
      aprobada_por: entrada.responsable || null
    });
  }
  return aprobadas.length
    ? { promos: aprobadas, quincena: quincena ? `${quincena.inicio}..${quincena.fin}` : null }
    : null;
}

module.exports = {
  id: 'promos',
  cadencia: 'tanda',
  forma: 'cifra',
  quincenaDe,
  desdeAprobadas,

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
      datos: { desde: p.desde || null, hasta: p.hasta || null, aprobada_en: p.aprobada_en || null, promo: true }
    }));
  },

  requiere: 'marketing: promos.json (la oferta) + marketing-calendar (la aprobación de la quincena en el canal declarado)'
};

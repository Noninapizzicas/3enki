'use strict';

/**
 * Proyección PURA de la carta pública — la misma forma para los dos consumidores:
 *   - el REFLEJO (index.js) trae carta/marca/contenido/config por RPC del bus y llama aquí.
 *   - el EXPORT CLI (export-cli.js) lee esos 4 de disco y llama aquí.
 *
 * Una sola fuente de verdad de la FORMA pública: branding (marca) + productos (carta + imágenes
 * de contenido) + categorías + opciones del canal. Sin efectos: entra dato, sale dato.
 */

/**
 * @param {Object} carta      carta del canal (categorías/productos/precios) — obligatoria
 * @param {Object|null} marca perfil de marca (esencia/visual/voz/negocio)
 * @param {Object} contenido  mapa { [product_id]: { imagenes:[{url,principal,alt}], descripcion } }
 * @param {Object} config     config del canal { dominio_publico, opciones_visualizacion }
 * @returns {Object} { branding, dominio_publico, opciones, categorias, productos, generado_at }
 */
function proyectarCartaPublica(carta, marca, contenido, config) {
  const cont = contenido || {};
  const cfg = config || {};

  const categorias = (Array.isArray(carta.categorias) ? carta.categorias : [])
    .filter(c => c.activa !== false)
    .sort((a, b) => (a.orden || 0) - (b.orden || 0));

  const productos = (Array.isArray(carta.productos) ? carta.productos : []).map(p => {
    const c = cont[p.id] || {};
    const imgs = Array.isArray(c.imagenes) ? c.imagenes : [];
    const principal = imgs.find(im => im.principal) || imgs[0] || null;
    return {
      id: p.id,
      nombre: p.nombre,
      precio: (p.precio ?? p.precio_base ?? 0),
      categoria: p.categoria || p.categoria_id || null,
      categoria_id: p.categoria_id || p.categoria || null,
      descripcion: c.descripcion || p.descripcion || '',
      imagen: principal ? principal.url : null,
      imagenes: imgs,
      ingredientes: Array.isArray(p.ingredientes) ? p.ingredientes : (p.ingredientes_base || [])
    };
  });

  const branding = marca ? {
    nombre: marca.esencia?.nombre || null,
    lema: marca.esencia?.lema || null,
    colores: marca.visual?.colores || {},
    tipografias: marca.visual?.tipografias || {},
    logo: marca.visual?.logo || null,
    voz: marca.voz || {},
    negocio: marca.negocio || {}
  } : null;

  return {
    branding,
    dominio_publico: cfg.dominio_publico || null,
    opciones: cfg.opciones_visualizacion || {},
    categorias,
    productos,
    generado_at: new Date().toISOString()
  };
}

module.exports = { proyectarCartaPublica };

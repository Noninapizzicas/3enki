/**
 * prisma/escaparate — REFLEJO JS SIN ESTADO: la cara CLIENTE PÚBLICA de Prisma.
 *
 * Gemelo generalizado de pizzepos/carta-digital. Proyecta el ProductoUniversal del
 * catálogo activo a la vista PÚBLICA. Se diferencia de prisma/proyector (vista interna,
 * POS) en que PODA lo que el comerciante NO ofrece:
 *   - oculta los valores de opción disponible:false (el cliente no ve lo que no puede pedir)
 *   - presenta el precio de cara al público (fijo € · o 'consultar' si rango_valoracion/desconocido)
 *   - surfacea los avisos_obligatorios (restricciones verdad_obligatoria: alérgenos/etiqueta/seguridad)
 *   - marca requiere_cita si el eje tiempo lo pide (el PWA enciende el widget de fecha)
 *
 * La generación del bundle HTML/PWA (como carta-digital static-template) es follow-up
 * (verificación en vivo). Domain 'escaparate.*'. Ver prisma.md.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class PrismaEscaparateReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'escaparate';
    this.version = 'reflejo-0.1.0';
  }

  onPublicoRequest(e) { return this._atender(e, 'publico', 'escaparate.publico.response', d => this._publico(d)); }

  // ── núcleo PURO: catálogo → vista pública ──
  _proyectarPublico(catalogo) {
    const cats = Array.isArray(catalogo && catalogo.categorias) ? catalogo.categorias : [];
    const categorias = cats.slice().sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const productos = (Array.isArray(catalogo && catalogo.productos) ? catalogo.productos : [])
      .map(p => this._productoPublico(p))
      .filter(Boolean);
    return { categorias, productos };
  }

  _precioPublico(p) {
    if (Number.isInteger(p.precio_base_centimos)) return { tipo: 'fijo', centimos: p.precio_base_centimos, eur: p.precio_base_centimos / 100 };
    const attrs = (p.contrato && Array.isArray(p.contrato.atributos_saber)) ? p.contrato.atributos_saber : (Array.isArray(p.atributos) ? p.atributos : []);
    const precio = attrs.find(a => a && String(a.nombre).toLowerCase() === 'precio');
    if (precio && typeof precio.valor === 'number') return { tipo: 'fijo', centimos: Math.round(precio.valor * 100), eur: precio.valor };
    const nat = p.naturalezas || {};
    return { tipo: 'consultar', motivo: nat.precio === 'rango_valoracion' ? 'valoración' : 'sin_precio' };
  }

  // opciones de cara al público: SOLO valores disponibles (oculta lo que el comerciante no ofrece).
  // Una opción sin ningún valor ofrecible se cae (nada que elegir); las LIBRE se conservan (texto).
  _opcionesPublicas(p) {
    const ops = (p.contrato && Array.isArray(p.contrato.opciones)) ? p.contrato.opciones : (Array.isArray(p.opciones) ? p.opciones : []);
    const out = [];
    for (const o of ops) {
      const esLibre = o.modo === 'LIBRE' || o.sub_forma === 'personalizacion_libre';
      const valores = (Array.isArray(o.valores) ? o.valores : []).filter(v => v && v.disponible !== false)
        .map(v => ({ id: v.id, etiqueta: v.etiqueta, delta_precio: (typeof v.delta_precio === 'number' ? v.delta_precio : 0) }));
      if (!esLibre && valores.length === 0) continue;   // nada que ofrecer → no se pinta
      out.push({ id: o.id, etiqueta: o.etiqueta, sub_forma: o.sub_forma, modo: o.modo, valores });
    }
    return out;
  }

  _productoPublico(p) {
    if (!p || (!p.nombre && !(p.identidad && p.identidad.que_es))) return null;
    const idn = p.identidad || {};
    const restr = Array.isArray(p.restricciones) ? p.restricciones : [];
    const ejes = p.ejes || {};
    return {
      id: p.id,
      nombre: p.nombre || idn.que_es,
      descripcion: idn.que_es || '',
      arquetipo: p.arquetipo || null,
      categoria_id: p.categoria_id || null,
      precio: this._precioPublico(p),
      opciones: this._opcionesPublicas(p),
      avisos_obligatorios: restr.filter(r => r && r.tipo === 'verdad_obligatoria').map(r => r.regla),
      requiere_cita: !!(ejes.tiempo && ejes.tiempo !== 'ninguno')
    };
  }

  // ── resolución del catálogo activo (via producto-manager) ──
  async _catalogoActivo(project_id, catalogo_id) {
    const cid = catalogo_id || await this._catalogoEnServicio(project_id);
    if (!cid) return null;
    const g = await this._rpc('catalogo.get.request', { project_id, catalogo_id: cid });
    return (g && g.status === 200 && g.data) ? g.data : null;
  }
  async _catalogoEnServicio(project_id) {
    const l = await this._rpc('catalogo.list.request', { project_id });
    if (!l || l.status !== 200 || !Array.isArray(l.data) || l.data.length === 0) return null;
    const enServicio = l.data.find(c => c.estado === 'en_servicio');
    return enServicio ? enServicio.id : (l.data.find(c => c.estado !== 'archivado') || l.data[0]).id;
  }

  async _publico(input) {
    if (!input.project_id) return this._invalid('project_id');
    const cat = await this._catalogoActivo(input.project_id, input.catalogo_id);
    if (!cat) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'no hay catálogo activo', { project_id: input.project_id });
    const { categorias, productos } = this._proyectarPublico(cat);
    return { status: 200, data: {
      project_id: input.project_id, catalogo_id: cat?.meta?.id || input.catalogo_id || null,
      comercio: { nombre: (cat.meta && cat.meta.nombre) || 'Catálogo' },
      categorias, productos, total_productos: productos.length
    } };
  }

  // señal de refresco
  async onCatalogoCambiado(event) {
    const d = event && (event.data || event.payload || event) || {};
    const project_id = d.project_id || (d.catalogo && d.catalogo.project_id);
    if (!project_id) return;
    this.eventBus.publish('escaparate.actualizado', { project_id, catalogo_id: (d.catalogo && d.catalogo.meta && d.catalogo.meta.id) || null, source: 'catalogo_change', timestamp: new Date().toISOString() });
    this.metrics?.increment?.('escaparate.actualizado.total');
  }
}

module.exports = PrismaEscaparateReflejo;

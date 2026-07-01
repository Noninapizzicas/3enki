/**
 * prisma/proyector — REFLEJO JS SIN ESTADO (gemelo de pizzepos/productos, generalizado).
 *
 * COPIADO del patrón de productos v5 (proyector sin estado): vista == proyectar(catalogo_activo)
 * SIEMPRE. No tiene store; lee el ProductoUniversal via catalogo.get/list.request (producto-manager)
 * y lo APLANA a una vista de consumo al vuelo. Reacciona a catalogo.{actualizado,editado,borrado}
 * re-emitiendo la señal vista.actualizada (sin sincronizar nada). Domain propio 'vista.*' para no
 * pisar catalogo.* (que posee producto-manager, el único writer).
 *
 * Ver arquitectura/decisiones/propuestas/prisma.md.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class PrismaProyectorReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'proyector';
    this.version = 'reflejo-0.1.0';
  }

  // ── handlers RPC (una línea) ──
  onVistaCompletaRequest(e)  { return this._atender(e, 'completa', 'vista.completa.response', d => this._completa(d)); }
  onVistaProductosRequest(e) { return this._atender(e, 'productos', 'vista.productos.response', d => this._productos(d)); }
  onVistaProductoRequest(e)  { return this._atender(e, 'producto', 'vista.producto.response', d => this._producto(d)); }
  onVistaBuscarRequest(e)    { return this._atender(e, 'buscar', 'vista.buscar.response', d => this._buscar(d)); }

  // ==========================================
  // Resolución del catálogo activo (via producto-manager reflejo)
  // ==========================================
  async _catalogoActivo(project_id, catalogo_id) {
    const cid = catalogo_id || await this._catalogoEnServicio(project_id);
    if (!cid) return null;
    const r = await this._rpc('catalogo.get.request', { project_id, catalogo_id: cid });
    if (!r || r.status !== 200 || !r.data) return null;
    return r.data;
  }

  async _catalogoEnServicio(project_id) {
    const r = await this._rpc('catalogo.list.request', { project_id });
    if (!r || r.status !== 200 || !Array.isArray(r.data)) return null;
    const list = r.data;
    const enServicio = list.find(c => c.estado === 'en_servicio');
    if (enServicio) return enServicio.id;
    const activo = list.find(c => c.estado !== 'archivado');
    return (activo || list[0])?.id || null;
  }

  // ==========================================
  // Proyección catálogo → vista (función PURA, sin guardar)
  // ==========================================
  _proyectar(catalogo) {
    const cats = Array.isArray(catalogo?.categorias) ? catalogo.categorias : [];
    const categorias = cats.slice().sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const productos = (Array.isArray(catalogo?.productos) ? catalogo.productos : []).map(p => this._proyectarProducto(p));
    return { categorias, productos };
  }

  // Un ProductoUniversal (5 huecos) → vista de consumo. Aplana lo que una vista/escaparate necesita
  // para pintar: qué es, precio, opciones (con disponible), las verdades obligatorias (alérgenos/etiqueta)
  // extraídas de restricciones, y los ejes/naturalezas para que la vista sepa si necesita agenda/tiempo.
  _proyectarProducto(p) {
    const idn = p.identidad || {};
    const restr = Array.isArray(p.restricciones) ? p.restricciones : [];
    const out = {
      id: p.id,
      nombre: p.nombre,
      que_es: idn.que_es || p.nombre || '',
      arquetipo: p.arquetipo || null,
      categoria_id: p.categoria_id || null,
      atributos: (p.contrato && Array.isArray(p.contrato.atributos_saber)) ? p.contrato.atributos_saber : [],
      opciones: (p.contrato && Array.isArray(p.contrato.opciones)) ? p.contrato.opciones : [],
      estados: (p.contrato && Array.isArray(p.contrato.estados)) ? p.contrato.estados : [],
      // las verdades que hay que decir fieles (alérgenos, etiqueta energética, seguridad)
      verdades_obligatorias: restr.filter(r => r && r.tipo === 'verdad_obligatoria').map(r => r.regla),
      ejes: p.ejes || { tiempo: 'ninguno', estado_de_partida: false, ciclo: 'de_ida' },
      naturalezas: p.naturalezas || { stock: 'unidades', precio: 'por_unidad' },
      madurez: p.madurez || 'necesita_revision',
      listo_para_vender: p.madurez === 'listo'   // hint: con preguntas abiertas aún no está listo
    };
    if (p.precio_base_centimos !== undefined) out.precio_base_centimos = p.precio_base_centimos;
    // agenda/tiempo: la vista enciende su widget de fecha/cita si el eje está encendido
    out.requiere_tiempo = (out.ejes.tiempo && out.ejes.tiempo !== 'ninguno');
    return out;
  }

  // ==========================================
  // Handlers (todos proyectan el catálogo activo — sin store, sin leak)
  // ==========================================
  async _completa(input) {
    if (!input.project_id) return this._invalid('project_id');
    const cat = await this._catalogoActivo(input.project_id, input.catalogo_id);
    if (!cat) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'no hay catálogo activo', { project_id: input.project_id });
    const { categorias, productos } = this._proyectar(cat);
    return { status: 200, data: {
      project_id: input.project_id, catalogo_id: cat?.meta?.id || input.catalogo_id || null,
      categorias, productos, total_categorias: categorias.length, total_productos: productos.length
    } };
  }

  async _productos(input) {
    if (!input.project_id) return this._invalid('project_id');
    const cat = await this._catalogoActivo(input.project_id, input.catalogo_id);
    let productos = cat ? this._proyectar(cat).productos : [];
    if (input.categoria_id) productos = productos.filter(p => p.categoria_id === input.categoria_id);
    if (input.arquetipo) productos = productos.filter(p => p.arquetipo === input.arquetipo);
    return { status: 200, data: { project_id: input.project_id, productos, total: productos.length } };
  }

  async _producto(input) {
    if (!input.project_id || !input.producto_id) return this._invalid('producto_id');
    const cat = await this._catalogoActivo(input.project_id, input.catalogo_id);
    if (!cat) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'no hay catálogo activo', { project_id: input.project_id });
    const raw = (Array.isArray(cat.productos) ? cat.productos : []).find(p => p.id === input.producto_id);
    if (!raw) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'producto no existe en el catálogo activo', { entity_type: 'producto', id: input.producto_id });
    return { status: 200, data: this._proyectarProducto(raw) };
  }

  async _buscar(input) {
    if (!input.project_id || !input.query) return this._invalid('query');
    const q = String(input.query).toLowerCase().trim();
    const cat = await this._catalogoActivo(input.project_id, input.catalogo_id);
    const productos = (cat ? this._proyectar(cat).productos : []).filter(p =>
      String(p.nombre || '').toLowerCase().includes(q) || String(p.que_es || '').toLowerCase().includes(q));
    return { status: 200, data: { project_id: input.project_id, query: input.query, productos, total: productos.length } };
  }

  // ==========================================
  // Eventos de catálogo — SEÑAL de refresco (sin store que sincronizar)
  // ==========================================
  async onCatalogoActualizado(event) {
    const d = event?.data || event?.payload || event || {};
    const cat = d.catalogo || d;
    const project_id = d.project_id || cat?.project_id;
    if (!project_id || !cat?.meta?.id) return;
    return this._emitVista(project_id, cat, 'catalogo_change');
  }

  async onCatalogoBorrado(event) {
    const d = event?.data || event?.payload || event || {};
    const project_id = d.project_id || (d.catalogo && d.catalogo.project_id);
    if (!project_id) return;
    const activo = await this._catalogoActivo(project_id);
    if (activo) return this._emitVista(project_id, activo, 'catalogo_borrado');
    this.eventBus.publish('vista.actualizada', { project_id, catalogo_id: d.catalogo?.meta?.id || null, source: 'catalogo_borrado', productos: [], timestamp: new Date().toISOString() });
  }

  async onProjectActivated(event) {
    const d = event?.data || event || {};
    if (!d.project_id) return;
    try {
      const cat = await this._catalogoActivo(d.project_id);
      if (cat) await this._emitVista(d.project_id, cat, 'project_activated');
    } catch (_) { /* warm best-effort */ }
  }

  // Emite vista.actualizada con la proyección lite (el consumidor re-pull vista.completa).
  async _emitVista(project_id, catalogo, source) {
    const { productos } = this._proyectar(catalogo);
    this.eventBus.publish('vista.actualizada', {
      project_id, catalogo_id: catalogo?.meta?.id || null, source,
      productos: productos.map(p => ({ id: p.id, nombre: p.nombre, arquetipo: p.arquetipo, listo_para_vender: p.listo_para_vender })),
      timestamp: new Date().toISOString()
    });
    this.metrics?.increment?.('vista.actualizada.total');
  }
}

module.exports = PrismaProyectorReflejo;

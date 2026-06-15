/**
 * contenido — REFLEJO JS. Base de ENRIQUECIMIENTO AUDIOVISUAL por producto (módulo híbrido).
 *
 * Base COMPARTIDA: la beben los canales de PRESENTACIÓN (carta-digital, carta-design) — el POS
 * NO la toca (pizzepos sigue lean, sin imágenes en su carta). Igual que marca/recetas: una base
 * plana por proyecto de la que beben varios, servida por su reflejo.
 *
 * HOY: imágenes de producto. La ESTRUCTURA reserva descripcion · audio · video · interaccion
 * para añadirlos sin reestructurar (op set = deep-merge genérico, la puerta extensible).
 *
 * Las imágenes son FICHEROS (en /pizzepos/contenido/imagenes/); el store guarda solo la
 * REFERENCIA (url/path) + metadatos. Igual que el resto: el dato pesado vive como fichero,
 * el JSON solo apunta.
 *
 * Norma del reflejo: cada op devuelve un objeto FRESCO { status, data }.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const STORE_PATH = '/pizzepos/contenido.json';
const IMG_DIR = '/pizzepos/contenido/imagenes/';
const nowISO = () => new Date().toISOString();

// Deep-merge por sección (un parche parcial no pisa el resto). Igual que marca.update_perfil.
function deepMerge(base, parche) {
  if (parche === null || typeof parche !== 'object' || Array.isArray(parche)) return parche;
  const out = Array.isArray(base) ? [] : { ...(base && typeof base === 'object' ? base : {}) };
  for (const k of Object.keys(parche)) {
    out[k] = (base && k in base) ? deepMerge(base[k], parche[k]) : parche[k];
  }
  return out;
}

// Estructura canónica del enriquecimiento de UN producto. Reserva todas las categorías
// audiovisuales; hoy solo se rellena 'imagenes'. Añadir audio/video real = rellenar su campo.
function productoVacio() {
  return { imagenes: [], descripcion: '', audio: [], video: [], interaccion: {} };
}

class ContenidoReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'contenido';
    this.version = 'reflejo-1.0.0';
  }

  // ── handlers RPC (una línea) ──
  onGetRequest(e) { return this._atender(e, 'get', 'contenido.get.response', d => this._get(d)); }
  onAddImagenRequest(e) { return this._atender(e, 'add_imagen', 'contenido.add_imagen.response', d => this._addImagen(d)); }
  onQuitarImagenRequest(e) { return this._atender(e, 'quitar_imagen', 'contenido.quitar_imagen.response', d => this._quitarImagen(d)); }
  onSetRequest(e) { return this._atender(e, 'set', 'contenido.set.response', d => this._set(d)); }

  // ── fs helpers (contrato real: éxito={content}/{...}; error={error}) ──
  async _read(project_id, p) {
    const r = await this._rpc('fs.read.request', { project_id, path: p });
    if (!r) return { status: 503 };
    if (r.error) return { status: r.error.code === 'RESOURCE_NOT_FOUND' ? 404 : 502, error: r.error };
    if (typeof r.content === 'string') return { status: 200, content: r.content };
    return { status: 404 };
  }
  async _write(project_id, p, content, encoding) {
    const r = await this._rpc('fs.write.request', { project_id, path: p, content, encoding: encoding || 'utf-8', atomic: true });
    if (!r) return { status: 503 };
    if (r.error) return { status: 502, error: r.error };
    return { status: 200 };
  }
  async _delete(project_id, p) {
    const r = await this._rpc('fs.delete.request', { project_id, path: p });
    if (!r) return { status: 503 };
    if (r.error) return { status: r.error.code === 'RESOURCE_NOT_FOUND' ? 404 : 502, error: r.error };
    return { status: 200 };
  }

  async _leerStore(project_id) {
    const r = await this._read(project_id, STORE_PATH);
    if (r.status === 404) return { _version: '1.0', _updated_at: null, productos: {} };
    if (r.status >= 400) return null;
    try { const s = JSON.parse(r.content); if (!s.productos) s.productos = {}; return s; } catch (_) { return null; }
  }
  async _guardarStore(project_id, store) {
    store._updated_at = nowISO();
    return this._write(project_id, STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  }

  // ── ops ──

  // Lee el enriquecimiento de un producto (o de todos si no se pasa product_id).
  async _get(input) {
    if (!input.project_id) return this._invalid('project_id');
    const store = await this._leerStore(input.project_id);
    if (!store) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'contenido.json no legible');
    if (input.product_id) return { status: 200, data: store.productos[input.product_id] || productoVacio() };
    return { status: 200, data: store.productos };
  }

  // Añade una imagen a un producto. content = base64 del fichero; ext = extensión.
  // Escribe el FICHERO y guarda la REFERENCIA. La primera imagen es principal por defecto.
  async _addImagen(input) {
    if (!input.project_id || !input.product_id) return this._invalid('product_id');
    if (!input.content || !input.ext) return this._invalid('content|ext');
    const store = await this._leerStore(input.project_id);
    if (!store) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'contenido.json no legible');

    const imagen_id = crypto.randomUUID().slice(0, 8);
    const ext = String(input.ext).replace(/[^a-z0-9]/gi, '').toLowerCase();
    const url = IMG_DIR + input.product_id + '__' + imagen_id + '.' + ext;
    const w = await this._write(input.project_id, url, input.content, 'base64');
    if (w.status >= 400) return w;

    if (!store.productos[input.product_id]) store.productos[input.product_id] = productoVacio();
    const prod = store.productos[input.product_id];
    if (!Array.isArray(prod.imagenes)) prod.imagenes = [];
    const principal = input.principal === true || prod.imagenes.length === 0;
    if (principal) for (const im of prod.imagenes) im.principal = false;
    const imagen = { id: imagen_id, url, alt: input.alt || '', principal };
    prod.imagenes.push(imagen);

    const g = await this._guardarStore(input.project_id, store);
    if (g.status >= 400) return g;
    this._emitir(input, input.product_id, 'imagen_add');
    return { status: 201, data: imagen };
  }

  // Quita una imagen (referencia + fichero). Si era la principal y quedan, promueve la primera.
  async _quitarImagen(input) {
    if (!input.project_id || !input.product_id || !input.imagen_id) return this._invalid('imagen_id');
    const store = await this._leerStore(input.project_id);
    if (!store) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'contenido.json no legible');
    const prod = store.productos[input.product_id];
    if (!prod || !Array.isArray(prod.imagenes)) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'producto sin imágenes', { product_id: input.product_id });
    const idx = prod.imagenes.findIndex(im => im.id === input.imagen_id);
    if (idx < 0) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'imagen no existe', { imagen_id: input.imagen_id });
    const [removed] = prod.imagenes.splice(idx, 1);
    if (removed.principal && prod.imagenes.length > 0) prod.imagenes[0].principal = true;
    if (removed.url) { try { await this._delete(input.project_id, removed.url); } catch (_) { /* best-effort */ } }

    const g = await this._guardarStore(input.project_id, store);
    if (g.status >= 400) return g;
    this._emitir(input, input.product_id, 'imagen_quitar');
    return { status: 200, data: { product_id: input.product_id, imagen_id: input.imagen_id, eliminada: true } };
  }

  // PUERTA EXTENSIBLE: deep-merge de un parche en el producto. Para descripcion/audio/video/
  // interaccion (lo que se añada mañana) sin op nueva. Las imágenes van por add/quitar (lista).
  async _set(input) {
    if (!input.project_id || !input.product_id) return this._invalid('product_id');
    if (!input.parche || typeof input.parche !== 'object' || Array.isArray(input.parche)) return this._invalid('parche');
    const store = await this._leerStore(input.project_id);
    if (!store) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'contenido.json no legible');
    const base = store.productos[input.product_id] || productoVacio();
    store.productos[input.product_id] = deepMerge(base, input.parche);
    const g = await this._guardarStore(input.project_id, store);
    if (g.status >= 400) return g;
    this._emitir(input, input.product_id, 'set');
    return { status: 200, data: store.productos[input.product_id] };
  }

  _emitir(input, product_id, tipo) {
    this.eventBus.publish('contenido.actualizado', {
      project_id: input.project_id, product_id, tipo,
      correlation_id: input.correlation_id || crypto.randomUUID(), timestamp: nowISO()
    });
  }
}

module.exports = ContenidoReflejo;

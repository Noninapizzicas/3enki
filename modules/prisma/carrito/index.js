/**
 * prisma/carrito — REFLEJO JS: el BUFFER de venta universal.
 *
 * Copiado y generalizado de pizzepos/comandero. Un carrito por cuenta_id: añadir/
 * quitar/actualizar ítems. CAMBIO clave vs comandero: cada ítem se TASA con
 * prisma/opciones (opciones.evaluar: producto + selección → precio_final_centimos)
 * en vez del precio por canal de pizza; dinero en CÉNTIMOS. SIN los ganchos de
 * cocina (enviar_cocina/estaciones = órgano del arquetipo hostelería). Es la
 * entrada del flujo de venta: carrito → (cuenta) → cobro.
 *
 * v0.1 en memoria (persistencia = follow-up). Ver prisma.md.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

class PrismaCarritoReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'carrito';
    this.version = 'reflejo-0.1.0';
    this.carritos = new Map();   // cuenta_id → { items:[], total_centimos }
  }

  onGetRequest(e)        { return this._atender(e, 'get', 'carrito.get.response', d => this._get(d)); }
  onAddItemRequest(e)    { return this._atender(e, 'add_item', 'carrito.add_item.response', d => this._addItem(d)); }
  onRemoveItemRequest(e) { return this._atender(e, 'remove_item', 'carrito.remove_item.response', d => this._removeItem(d)); }
  onUpdateItemRequest(e) { return this._atender(e, 'update_item', 'carrito.update_item.response', d => this._updateItem(d)); }
  onVaciarRequest(e)     { return this._atender(e, 'vaciar', 'carrito.vaciar.response', d => this._vaciar(d)); }
  onListRequest(e)       { return this._atender(e, 'list', 'carrito.list.response', d => this._list(d)); }

  _buffer(cuenta_id) {
    let b = this.carritos.get(cuenta_id);
    if (!b) { b = { items: [], total_centimos: 0 }; this.carritos.set(cuenta_id, b); }
    return b;
  }
  _calcularTotal(items) { return items.reduce((s, i) => s + (i.subtotal_centimos || 0), 0); }

  // precio del ítem: inline (precio_unitario_centimos) o tasado via opciones.evaluar.
  async _precioItem(input) {
    if (typeof input.precio_unitario_centimos === 'number') {
      return { centimos: Math.round(input.precio_unitario_centimos) };
    }
    const r = await this._rpc('opciones.evaluar.request', {
      project_id: input.project_id, catalogo_id: input.catalogo_id,
      producto_id: input.producto_id, producto: input.producto, selecciones: input.selecciones || {}
    });
    if (!r || r.status !== 200 || !r.data) return { error: this._errorResponse(502, 'UPSTREAM_UNREACHABLE', 'opciones no responde') };
    if (r.data.valida === false) return { error: this._errorResponse(409, 'CONFLICT_STATE', 'selección inválida', { errores: r.data.errores }) };
    return { centimos: r.data.precio_final_centimos, libres: r.data.libres };
  }

  async _addItem(input) {
    if (!input.cuenta_id) return this._invalid('cuenta_id');
    if (!input.producto_id && !input.nombre && !input.producto) return this._invalid('producto_id|nombre');
    const precio = await this._precioItem(input);
    if (precio.error) return precio.error;
    const cantidad = (typeof input.cantidad === 'number' && input.cantidad > 0) ? Math.floor(input.cantidad) : 1;
    const item = {
      id: crypto.randomUUID(),
      producto_id: input.producto_id || null,
      nombre: input.nombre || input.producto_id || 'ítem',
      cantidad,
      selecciones: input.selecciones || {},
      precio_unitario_centimos: precio.centimos,
      subtotal_centimos: precio.centimos * cantidad,
      ...(precio.libres && precio.libres.length ? { libres: precio.libres } : {}),
      notas: input.notas || '',
      created_at: nowISO()
    };
    const b = this._buffer(input.cuenta_id);
    b.items.push(item);
    b.total_centimos = this._calcularTotal(b.items);
    this.eventBus?.publish('carrito.item_agregado', { cuenta_id: input.cuenta_id, item_id: item.id, producto_id: item.producto_id, subtotal_centimos: item.subtotal_centimos, total_centimos: b.total_centimos, project_id: input.project_id, correlation_id: input.correlation_id, timestamp: nowISO() });
    return { status: 201, data: { item, carrito: { cuenta_id: input.cuenta_id, items: b.items, total_centimos: b.total_centimos } } };
  }

  async _removeItem(input) {
    if (!input.cuenta_id || !input.item_id) return this._invalid('item_id');
    const b = this.carritos.get(input.cuenta_id);
    if (!b) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'carrito no existe', { entity_type: 'carrito', id: input.cuenta_id });
    const idx = b.items.findIndex(i => i.id === input.item_id);
    if (idx < 0) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'ítem no existe en el carrito', { entity_type: 'item', id: input.item_id });
    b.items.splice(idx, 1);
    b.total_centimos = this._calcularTotal(b.items);
    this.eventBus?.publish('carrito.item_eliminado', { cuenta_id: input.cuenta_id, item_id: input.item_id, total_centimos: b.total_centimos, project_id: input.project_id, timestamp: nowISO() });
    return { status: 200, data: { carrito: { cuenta_id: input.cuenta_id, items: b.items, total_centimos: b.total_centimos } } };
  }

  async _updateItem(input) {
    if (!input.cuenta_id || !input.item_id) return this._invalid('item_id');
    if (typeof input.cantidad !== 'number' || input.cantidad < 0) return this._invalid('cantidad');
    if (input.cantidad === 0) return this._removeItem(input);
    const b = this.carritos.get(input.cuenta_id);
    if (!b) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'carrito no existe', { entity_type: 'carrito', id: input.cuenta_id });
    const item = b.items.find(i => i.id === input.item_id);
    if (!item) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'ítem no existe en el carrito', { entity_type: 'item', id: input.item_id });
    item.cantidad = Math.floor(input.cantidad);
    item.subtotal_centimos = item.precio_unitario_centimos * item.cantidad;
    b.total_centimos = this._calcularTotal(b.items);
    this.eventBus?.publish('carrito.item_actualizado', { cuenta_id: input.cuenta_id, item_id: input.item_id, cantidad: item.cantidad, total_centimos: b.total_centimos, project_id: input.project_id, timestamp: nowISO() });
    return { status: 200, data: { item, carrito: { cuenta_id: input.cuenta_id, items: b.items, total_centimos: b.total_centimos } } };
  }

  _get(input) {
    if (!input.cuenta_id) return this._invalid('cuenta_id');
    const b = this.carritos.get(input.cuenta_id) || { items: [], total_centimos: 0 };
    return { status: 200, data: { cuenta_id: input.cuenta_id, items: b.items, total_centimos: b.total_centimos } };
  }

  _vaciar(input) {
    if (!input.cuenta_id) return this._invalid('cuenta_id');
    this.carritos.delete(input.cuenta_id);
    this.eventBus?.publish('carrito.vaciado', { cuenta_id: input.cuenta_id, project_id: input.project_id, timestamp: nowISO() });
    return { status: 200, data: { cuenta_id: input.cuenta_id, vaciado: true } };
  }

  _list() {
    const out = [];
    for (const [cuenta_id, b] of this.carritos) out.push({ cuenta_id, items: b.items.length, total_centimos: b.total_centimos });
    return { status: 200, data: { carritos: out, total: out.length } };
  }
}

module.exports = PrismaCarritoReflejo;

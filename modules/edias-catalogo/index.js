'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

/**
 * edias-catalogo — REFLEJO JS (mitad determinista del módulo híbrido).
 * CRUD de piezas del taller: pieza_id, plano_id, material_id, gramos, tiempo_maquina.
 * El PRECIO NO vive aquí — edias-costeo lo calcula con la tarifa del material.
 * Reflejo puro: aritmética y persistencia, sin turno LLM.
 */

class EdiasCatalogoReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'edias-catalogo';
    this.version = '0.1.0';
    this._piezas = new Map(); // pieza_id -> { id, nombre, plano_id, material_id, gramos, tiempo_maquina, activa }
  }

  // ── handlers RPC (una línea) ──
  onListarRequest(e)   { return this._atender(e, 'listar',  'edias.catalogo.listar.response',  d => this._listar(d)); }
  onCrearRequest(e)    { return this._atender(e, 'crear',   'edias.catalogo.crear.response',   d => this._crear(d)); }
  onObtenerRequest(e)  { return this._atender(e, 'obtener', 'edias.catalogo.obtener.response', d => this._obtener(d)); }
  onActualizarRequest(e){ return this._atender(e, 'actualizar', 'edias.catalogo.actualizar.response', d => this._actualizar(d)); }
  onEliminarRequest(e) { return this._atender(e, 'eliminar','edias.catalogo.eliminar.response',d => this._eliminar(d)); }

  // ── CRUD ──
  async _listar(input) {
    const solo_activas = input.solo_activas === true;
    const items = Array.from(this._piezas.values())
      .filter(p => !solo_activas || p.activa)
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    return { status: 200, data: { piezas: items, total: items.length } };
  }

  async _crear(input) {
    const { pieza_id, nombre, plano_id, material_id } = input;
    if (!pieza_id) return this._invalid('pieza_id');
    if (this._piezas.has(pieza_id)) {
      return this._errorResponse(409, 'CONFLICT_STATE', 'pieza ya existe', { entity_type: 'pieza', id: pieza_id });
    }
    const gramos = (typeof input.gramos === 'number' && input.gramos > 0) ? input.gramos : null;
    const tiempo_maquina = (typeof input.tiempo_maquina === 'number' && input.tiempo_maquina >= 0) ? input.tiempo_maquina : 0;
    const pieza = { id: pieza_id, pieza_id, nombre, plano_id, material_id, gramos, tiempo_maquina, activa: true };
    this._piezas.set(pieza_id, pieza);
    this.metrics?.increment('edias-catalogo.reflejo.served', { op: 'crear' });
    return { status: 200, data: pieza };
  }

  async _obtener(input) {
    if (!input.pieza_id) return this._invalid('pieza_id');
    const p = this._piezas.get(input.pieza_id);
    if (!p) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'pieza no encontrada', { entity_type: 'pieza', id: input.pieza_id });
    return { status: 200, data: p };
  }

  async _actualizar(input) {
    if (!input.pieza_id) return this._invalid('pieza_id');
    const p = this._piezas.get(input.pieza_id);
    if (!p) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'pieza no encontrada', { entity_type: 'pieza', id: input.pieza_id });
    const patch = { ...p };
    if (input.nombre !== undefined) patch.nombre = input.nombre;
    if (input.plano_id !== undefined) patch.plano_id = input.plano_id;
    if (input.material_id !== undefined) patch.material_id = input.material_id;
    if (input.gramos !== undefined) patch.gramos = (typeof input.gramos === 'number' && input.gramos > 0) ? input.gramos : null;
    if (input.tiempo_maquina !== undefined) patch.tiempo_maquina = (typeof input.tiempo_maquina === 'number' && input.tiempo_maquina >= 0) ? input.tiempo_maquina : 0;
    if (input.activa !== undefined) patch.activa = !!input.activa;
    this._piezas.set(input.pieza_id, patch);
    return { status: 200, data: patch };
  }

  async _eliminar(input) {
    if (!input.pieza_id) return this._invalid('pieza_id');
    if (!this._piezas.has(input.pieza_id)) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'pieza no encontrada', { entity_type: 'pieza', id: input.pieza_id });
    }
    this._piezas.delete(input.pieza_id);
    return { status: 200, data: { pieza_id: input.pieza_id, eliminada: true } };
  }
}

module.exports = EdiasCatalogoReflejo;

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

/**
 * edias-plano — REFLEJO JS (mitad determinista del módulo híbrido).
 * El plano nace del CLIENTE: Hermes valida el DXF con dxf_parse y pasa el
 * resultado (entidades/capas/ok) al registrar. Este módulo NO hace cross-module:
 * solo persiste el plano + su validación. Reflejo puro, sin turno LLM.
 */

class EdiasPlanoReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'edias-plano';
    this.version = '0.1.0';
    this._planos = new Map(); // plano_id -> { plano_id, nombre, archivo_dxf, validacion, piezas, ts }
  }

  // ── handlers RPC (una línea) ──
  onRegistrarRequest(e) { return this._atender(e, 'registrar', 'edias.plano.registrar.response', d => this._registrar(d)); }
  onListarRequest(e)    { return this._atender(e, 'listar',    'edias.plano.listar.response',    d => this._listar(d)); }
  onObtenerRequest(e)   { return this._atender(e, 'obtener',   'edias.plano.obtener.response',   d => this._obtener(d)); }
  onEliminarRequest(e)  { return this._atender(e, 'eliminar',  'edias.plano.eliminar.response',  d => this._eliminar(d)); }

  // ── registrar un plano (con su validación DXF ya hecha por el cliente) ──
  async _registrar(input) {
    const { plano_id, nombre, archivo_dxf, validacion, piezas } = input;
    if (!plano_id) return this._invalid('plano_id');
    if (!nombre) return this._invalid('nombre');
    if (this._planos.has(plano_id)) {
      return this._errorResponse(409, 'CONFLICT_STATE', 'plano_duplicado', { plano_id });
    }
    // La validación DXF la aporta el cliente (dxf_parse). Si no llega, el plano
    // queda pendiente de validación — nunca se inventa.
    const v = (validacion && typeof validacion === 'object') ? validacion : { ok: false, pendiente: true };
    const plano = {
      plano_id,
      nombre,
      archivo_dxf: archivo_dxf || null,
      validacion: v,
      piezas: Array.isArray(piezas) ? piezas : [],
      ts: Date.now(),
    };
    this._planos.set(plano_id, plano);
    this.metrics?.increment('edias-plano.reflejo.served', { op: 'registrar' });
    return { status: 200, data: plano };
  }

  // ── listar planos ──
  async _listar(input) {
    const solo_validos = input?.solo_validos === true;
    const planos = [...this._planos.values()]
      .filter(p => !solo_validos || p.validacion?.ok === true)
      .sort((a, b) => b.ts - a.ts);
    return { status: 200, data: { planos, total: planos.length } };
  }

  // ── obtener un plano ──
  async _obtener(input) {
    const { plano_id } = input;
    if (!plano_id) return this._invalid('plano_id');
    const plano = this._planos.get(plano_id);
    if (!plano) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'plano_no_encontrado', { plano_id });
    return { status: 200, data: plano };
  }

  // ── eliminar un plano ──
  async _eliminar(input) {
    const { plano_id } = input;
    if (!plano_id) return this._invalid('plano_id');
    if (!this._planos.has(plano_id)) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'plano_no_encontrado', { plano_id });
    }
    this._planos.delete(plano_id);
    this.metrics?.increment('edias-plano.reflejo.served', { op: 'eliminar' });
    return { status: 200, data: { eliminado: true, plano_id } };
  }
}

module.exports = EdiasPlanoReflejo;

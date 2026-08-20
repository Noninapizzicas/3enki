'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

/**
 * edias-costeo — REFLEJO JS (mitad determinista del módulo híbrido).
 * El CORAZÓN del costeo de piezas: coste_pieza = (tarifa × gramos) + tiempo_maquina.
 * Aritmética pura, sin turno LLM. El freno _validar rechaza el PRECIO_INVENTADO
 * (coste que no cuadra con tarifa×gramos+tiempo) y exige tarifa real (SIN_TARIFA).
 * Espejo del freno anti-invento de escandallo pizzepos.
 */

class EdiasCosteoReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'edias-costeo';
    this.version = '0.1.0';
    this._historial = []; // [{ pieza_id, cantidad, coste_unitario, coste_total, ts }]
  }

  // ── handlers RPC (una línea) ──
  onCostearRequest(e)  { return this._atender(e, 'costear',  'edias.costeo.costear.response',  d => this._costear(d)); }
  onValidarRequest(e)  { return this._atender(e, 'validar',  'edias.costeo.validar.response',  d => this._validar(d)); }
  onListarRequest(e)   { return this._atender(e, 'listar',   'edias.costeo.listar.response',   d => this._listar(d)); }

  // ── coste_pieza = (tarifa × gramos) + tiempo_maquina ──
  async _costear(input) {
    const { pieza_id, material_id, gramos, tiempo_maquina, tarifa_por_gramo } = input;
    if (!pieza_id) return this._invalid('pieza_id');
    if (typeof gramos !== 'number' || gramos <= 0) {
      return this._errorResponse(422, 'PRECONDITION_FAILED', 'sin_gramos', { pieza_id });
    }
    if (typeof tarifa_por_gramo !== 'number' || tarifa_por_gramo < 0) {
      return this._errorResponse(422, 'PRECONDITION_FAILED', 'sin_tarifa', { pieza_id, material_id });
    }
    const t = (typeof tiempo_maquina === 'number' && tiempo_maquina >= 0) ? tiempo_maquina : 0;
    const coste_material = this._round(tarifa_por_gramo * gramos, 6);
    const coste_unitario = this._round(coste_material + t, 6);
    const cantidad = (typeof input.cantidad === 'number' && input.cantidad >= 1) ? input.cantidad : 1;
    const coste_total = this._round(coste_unitario * cantidad, 2);
    const res = { pieza_id, material_id, gramos, tiempo_maquina: t, tarifa_por_gramo, cantidad, coste_material, coste_unitario, coste_total };
    this._historial.unshift({ ...res, ts: Date.now() });
    if (this._historial.length > 50) this._historial.pop();
    this.metrics?.increment('edias-costeo.reflejo.served', { op: 'costear' });
    return { status: 200, data: res };
  }

  // ── EL FRENO anti-invento (espejo de escandallo) ──
  async _validar(input) {
    const { pieza_id, gramos, tiempo_maquina, tarifa_por_gramo, coste_propuesto } = input;
    if (typeof tarifa_por_gramo !== 'number' || tarifa_por_gramo < 0) {
      return { status: 200, data: { valid: false, errors: [{ code: 'SIN_TARIFA', message: 'sin_tarifa — declara tarifa real o deja sin_precio' }] } };
    }
    if (typeof gramos !== 'number' || gramos <= 0) {
      return { status: 200, data: { valid: false, errors: [{ code: 'SIN_GRAMOS', message: 'sin_gramos — la pieza necesita gramos para costear' }] } };
    }
    const t = (typeof tiempo_maquina === 'number' && tiempo_maquina >= 0) ? tiempo_maquina : 0;
    const correcto = this._round((tarifa_por_gramo * gramos) + t, 6);
    if (typeof coste_propuesto === 'number' && Math.abs(coste_propuesto - correcto) > 0.001) {
      return { status: 200, data: { valid: false, errors: [{ code: 'PRECIO_INVENTADO', message: `coste_propuesto ${coste_propuesto} ≠ tarifa×gramos+tiempo ${correcto}` }] } };
    }
    this.metrics?.increment('edias-costeo.reflejo.served', { op: 'validar', veredicto: 'valido' });
    return { status: 200, data: { valid: true, errors: [] } };
  }

  // ── últimas valoraciones ──
  async _listar(input) {
    const limit = (typeof input.limit === 'number' && input.limit > 0) ? input.limit : 20;
    return { status: 200, data: { costes: this._historial.slice(0, limit), total: this._historial.length } };
  }
}

module.exports = EdiasCosteoReflejo;

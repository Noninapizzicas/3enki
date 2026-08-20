'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

/**
 * edias-materiales — REFLEJO JS (mitad determinista del módulo híbrido).
 * Catálogo de materiales de taller con tarifa por gramo (config por admin)
 * y stock de bobinas. El coste_material es aritmética pura (tarifa × gramos)
 * → reflejo, sin turno LLM. El freno _validar rechaza el precio inventado
 * (sin_tarifa honesto, nunca un número maquillado).
 */

class EdiasMaterialesReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'edias-materiales';
    this.version = '0.1.0';
    this._materiales = new Map(); // material_id -> { id, nombre, tarifa_por_gramo, stock_g, taller }
  }

  // ── handlers RPC (una línea) ──
  onTarifaRequest(e) {
    return this._atender(e, 'tarifa', 'edias.material.tarifa.response', d => this._tarifa(d));
  }
  onRegistrarRequest(e) {
    return this._atender(e, 'registrar', 'edias.material.registrar.response', d => this._registrar(d));
  }
  onValidarRequest(e) {
    return this._atender(e, 'validar', 'edias.material.validar.response', d => this._validar(d));
  }

  // ── coste_material = tarifa/g × gramos ──
  async _tarifa(input) {
    if (!input.material_id) return this._invalid('material_id');
    const m = this._materiales.get(input.material_id);
    if (!m) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'material no encontrado', { entity_type: 'material', id: input.material_id });
    if (typeof m.tarifa_por_gramo !== 'number') return this._errorResponse(422, 'PRECONDITION_FAILED', 'sin_tarifa', { material_id: input.material_id });
    const gramos = (typeof input.gramos === 'number' && input.gramos > 0) ? input.gramos : 1;
    const coste_material = this._round(m.tarifa_por_gramo * gramos, 6);
    this.metrics?.increment('edias-materiales.reflejo.served', { op: 'tarifa' });
    return { status: 200, data: { material_id: input.material_id, gramos, tarifa_por_gramo: m.tarifa_por_gramo, coste_material } };
  }

  // ── alta de material con tarifa (admin) ──
  async _registrar(input) {
    const { material_id, nombre, tarifa_por_gramo, taller } = input;
    if (!material_id) return this._invalid('material_id');
    if (typeof tarifa_por_gramo !== 'number' || tarifa_por_gramo < 0) {
      return this._errorResponse(422, 'PRECONDITION_FAILED', 'sin_tarifa', { material_id });
    }
    const stock_g = (typeof input.stock_g === 'number' && input.stock_g >= 0) ? input.stock_g : 0;
    this._materiales.set(material_id, { id: material_id, nombre, tarifa_por_gramo, stock_g, taller });
    this.metrics?.increment('edias-materiales.reflejo.served', { op: 'registrar' });
    return { status: 200, data: { material_id, registrado: true, tarifa_por_gramo, stock_g } };
  }

  // ── EL FRENO anti-invento ──
  async _validar(input) {
    const { material_id, gramos, coste_propuesto } = input;
    const m = this._materiales.get(material_id);
    if (!m) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'material no encontrado', { material_id });
    if (typeof m.tarifa_por_gramo !== 'number') {
      return { status: 200, data: { valid: false, errors: [{ code: 'SIN_TARIFA', message: 'sin_tarifa — declara tarifa o deja sin_precio' }] } };
    }
    const g = (typeof gramos === 'number' && gramos > 0) ? gramos : 1;
    const correcto = this._round(m.tarifa_por_gramo * g, 6);
    if (typeof coste_propuesto === 'number' && Math.abs(coste_propuesto - correcto) > 0.001) {
      return { status: 200, data: { valid: false, errors: [{ code: 'PRECIO_INVENTADO', message: `coste_propuesto ${coste_propuesto} ≠ tarifa×gramos ${correcto}` }] } };
    }
    this.metrics?.increment('edias-materiales.reflejo.served', { op: 'validar', veredicto: 'valido' });
    return { status: 200, data: { valid: true, errors: [] } };
  }
}

module.exports = EdiasMaterialesRefle;
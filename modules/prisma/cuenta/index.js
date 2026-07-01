/**
 * prisma/cuenta — REFLEJO JS: el TICKET/cuenta (envoltorio del flujo de venta).
 *
 * Generalizado de pizzepos/cuentas. Ata carrito↔cobro bajo un ticket con su ciclo:
 * abierta → cobrada → cerrada. Estados GENÉRICOS (sin en_preparacion/listo/entregado
 * de hostelería — esos los añade el órgano cocina). Reacciona a cobro.procesado para
 * marcar la cuenta pagada. v0.1 en memoria. Ver prisma.md.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();

class PrismaCuentaReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cuenta';
    this.version = 'reflejo-0.2.0';
    this.cuentas = new Map();   // cuenta_id → cuenta
    this._seq = 0;
    this._persist = new PosPersistencia({
      modulo: this, file: 'cuenta.json',
      snapshot: (pid) => ({ seq: this._seq, cuentas: [...this.cuentas.values()].filter(c => c.project_id === pid) }),
      hidratar: (pid, data) => { if (typeof data.seq === 'number') this._seq = Math.max(this._seq, data.seq); for (const c of (data.cuentas || [])) this.cuentas.set(c.id, c); }
    });
  }

  async onUnload() { await this._persist.flush(); this._persist.detener(); return super.onUnload(); }
  onProjectActivated(e) { const d = (e && (e.data || e)) || {}; return this._persist.restaurar(d.project_id); }

  onCrearRequest(e) { return this._atender(e, 'crear', 'cuenta.crear.response', d => this._crear(d)); }
  onGetRequest(e)   { return this._atender(e, 'get', 'cuenta.get.response', d => this._get(d)); }
  onListRequest(e)  { return this._atender(e, 'list', 'cuenta.list.response', d => this._list(d)); }
  onCerrarRequest(e){ return this._atender(e, 'cerrar', 'cuenta.cerrar.response', d => this._cerrar(d)); }

  _crear(input) {
    const id = input.cuenta_id || crypto.randomUUID();
    const existe = this.cuentas.get(id);
    if (existe) return { status: 200, data: existe };   // idempotente
    const ref = input.nombre || ('T-' + String(++this._seq).padStart(3, '0'));
    const cuenta = {
      id, project_id: input.project_id || null,
      estado: 'abierta', ref_display: ref, tipo: input.tipo || 'general', nombre: input.nombre || null,
      pagada: false, total_centimos: 0, created_at: nowISO(), updated_at: nowISO()
    };
    this.cuentas.set(id, cuenta);
    this._persist.marcarDirty(cuenta.project_id);
    this.eventBus?.publish('cuenta.creada', { cuenta_id: id, project_id: cuenta.project_id, ref_display: ref, tipo: cuenta.tipo, correlation_id: input.correlation_id, timestamp: nowISO() });
    return { status: 201, data: cuenta };
  }

  _get(input) {
    if (!input.cuenta_id) return this._invalid('cuenta_id');
    const c = this.cuentas.get(input.cuenta_id);
    if (!c) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'cuenta no existe', { entity_type: 'cuenta', id: input.cuenta_id });
    return { status: 200, data: c };
  }

  _list(input) {
    let out = [...this.cuentas.values()];
    if (input && input.estado) out = out.filter(c => c.estado === input.estado);
    return { status: 200, data: { cuentas: out, total: out.length } };
  }

  _cerrar(input) {
    if (!input.cuenta_id) return this._invalid('cuenta_id');
    const c = this.cuentas.get(input.cuenta_id);
    if (!c) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'cuenta no existe', { entity_type: 'cuenta', id: input.cuenta_id });
    c.estado = 'cerrada';
    c.updated_at = nowISO();
    this._persist.marcarDirty(c.project_id);
    this.eventBus?.publish('cuenta.cerrada', { cuenta_id: c.id, project_id: c.project_id, total_centimos: c.total_centimos, pagada: c.pagada, timestamp: nowISO() });
    return { status: 200, data: c };
  }

  // señal: un cobro se completó → la cuenta queda pagada.
  onCobroProcesado(event) {
    const d = event && (event.data || event.payload || event) || {};
    if (!d.cuenta_id) return;
    const c = this.cuentas.get(d.cuenta_id);
    if (!c) return;   // una cuenta que este módulo no conoce (p.ej. de otro vertical): no-op
    c.pagada = true;
    c.total_centimos = (typeof d.monto_total_centimos === 'number') ? d.monto_total_centimos : c.total_centimos;
    c.estado = 'cobrada';
    c.updated_at = nowISO();
    this._persist.marcarDirty(c.project_id);
    this.eventBus?.publish('cuenta.cerrada', { cuenta_id: c.id, project_id: c.project_id, total_centimos: c.total_centimos, pagada: true, timestamp: nowISO() });
  }
}

module.exports = PrismaCuentaReflejo;

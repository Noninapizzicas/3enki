/**
 * contabilidad-entrada/cuenta-proveedor — REFLEJO STATELESS (N3, hoja del plan).
 *
 * Mayor AUXILIAR del tercero: cada factura de compra viva y su saldo, DERIVADO del diario.
 * No calcula la cifra por su cuenta (eso es mayor-balanza): RECIBE los saldos (o los sube por
 * EVENTO a mayor-balanza.saldos.request) y AISLA los del TERCERO pedido.
 *
 * Honestidad (invariante 13): sin tercero declarado no se inventa una cuenta; sin saldos no se
 * inventa un saldo (0 no es "no hay deuda" — es "no se sabe": se declara en `abierto`).
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia. PREGUNTA (saldo / facturas_vivas) → sin ui_handler.
 * Ver hoja N3 del plan-construccion y diseno-oop.md (CLASE CuentaProveedor).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class CuentaProveedor extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cuenta-proveedor';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC: saldo (PREGUNTA → sin ui_handler) ──
  onSaldoRequest(e) {
    return this._atender(e, 'saldo', 'cuenta-proveedor.saldo.response', async (d) => {
      const res = await this._saldo(d);
      if (res.status !== 200) this.eventBus?.publish('cuenta-proveedor.saldo.failed', res);
      return res;
    });
  }

  // ── handler RPC: facturas_vivas (PREGUNTA → sin ui_handler) ──
  onFacturasVivasRequest(e) {
    return this._atender(e, 'facturas_vivas', 'cuenta-proveedor.facturas_vivas.response', async (d) => {
      const res = await this._facturas_vivas(d);
      if (res.status !== 200) this.eventBus?.publish('cuenta-proveedor.facturas_vivas.failed', res);
      return res;
    });
  }

  // ── handlers de dominio (fire-and-forget): el libro/la ficha cambiaron → se observa ──
  onAsientoAsentado(e) {
    const d = (e && (e.data || e)) || {};
    this._vistos = this._vistos || [];
    if (d.asiento) this._vistos.push(d.asiento);
    if (this._vistos.length > 1000) this._vistos.shift();
  }

  onTerceroActualizado(e) {
    const d = (e && (e.data || e)) || {};
    this._terceros = this._terceros || new Map();
    const t = d.tercero || d.nif || d.tercero_id;
    if (t != null) this._terceros.set(String(t), d);
  }

  // ══════════════════════════════════════════════════════════════════════
  // saldo(tercero) → saldo del tercero (mayor auxiliar derivado)
  // ══════════════════════════════════════════════════════════════════════
  async _saldo(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const tercero = this._tercero(input);
    if (!tercero) return this._invalid('tercero');

    const { saldos, fuente } = await this._saldosDe(input, tercero);
    const mias = saldos.filter((s) => this._esDelTercero(s, tercero));

    let saldo = 0, debe = 0, haber = 0;
    for (const s of mias) {
      debe += this._num(s.debe);
      haber += this._num(s.haber);
      saldo += this._num(s.saldo != null ? s.saldo : (Number(s.debe || 0) - Number(s.haber || 0)));
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'cuenta-proveedor',
        tercero,
        fuente: fuente || null,
        saldo: this._round(saldo, 2),
        debe: this._round(debe, 2),
        haber: this._round(haber, 2),
        num_cuentas: mias.length,
        tiene_datos: mias.length > 0,
        abierto: {
          fuente: fuente ? null : 'no se recibieron saldos (ni declarados ni de mayor-balanza): el saldo del tercero no se inventa',
          tercero: mias.length ? null : 'no hay saldos de este tercero en el mayor: 0 no es "sin deuda", es "desconocido"'
        }
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // facturas_vivas(tercero) → facturas de compra vivas del tercero
  // ══════════════════════════════════════════════════════════════════════
  async _facturas_vivas(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const tercero = this._tercero(input);
    if (!tercero) return this._invalid('tercero');

    const { saldos, fuente } = await this._saldosDe(input, tercero);
    const vivas = saldos
      .filter((s) => this._esDelTercero(s, tercero) && s.factura != null)
      .map((s) => ({
        factura: String(s.factura),
        cuenta: s.cuenta != null ? String(s.cuenta) : null,
        fecha: s.fecha != null ? String(s.fecha) : null,
        vencimiento: s.vencimiento != null ? String(s.vencimiento) : null,
        saldo: this._round(this._num(s.saldo != null ? s.saldo : (Number(s.debe || 0) - Number(s.haber || 0))), 2),
        vencida: s.vencimiento != null ? (String(s.vencimiento) < String(input.fecha || new Date().toISOString().slice(0, 10))) : null
      }));

    const total = this._round(vivas.reduce((t, f) => t + f.saldo, 0), 2);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'cuenta-proveedor',
        tercero,
        fuente: fuente || null,
        facturas: vivas,
        total_facturas: vivas.length,
        total_pendiente: total,
        abierto: {
          fuente: fuente ? null : 'no se recibieron saldos (ni declarados ni de mayor-balanza): no hay facturas que mostrar'
        }
      }
    };
  }

  _tercero(input) {
    return input.tercero != null ? String(input.tercero).trim()
      : (input.proveedor != null ? String(input.proveedor).trim()
      : (input.nif != null ? String(input.nif).trim() : ''));
  }

  async _saldosDe(input, tercero) {
    if (Array.isArray(input.saldos)) return { saldos: input.saldos, fuente: 'declarado' };
    const resp = await this._rpc('mayor-balanza.saldos.request', {
      project_id: input.project_id || this.project_id,
      tercero, fecha: input.fecha, ejercicio: input.ejercicio
    }, { timeout_ms: 800 });
    if (resp && Array.isArray(resp.saldos)) return { saldos: resp.saldos, fuente: 'mayor-balanza' };
    return { saldos: [], fuente: null };
  }

  _esDelTercero(s, tercero) {
    if (!s || typeof s !== 'object') return false;
    const t = s.tercero != null ? String(s.tercero) : (s.proveedor != null ? String(s.proveedor) : (s.nif != null ? String(s.nif) : null));
    return t != null && t === tercero;
  }

  _num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

  // ── Tools ──
  toolSaldo(params) { return this._saldo(params); }
  toolFacturasVivas(params) { return this._facturas_vivas(params); }
}

module.exports = CuentaProveedor;

/**
 * contabilidad-entrada/estado-cuenta-proveedor — REFLEJO STATELESS (N4, hoja del plan).
 *
 * EXTRACTO CONFRONTABLE con el proveedor: el documento de conciliacion de saldos que se le
 * envia para que confirme que su cuenta y la nuestra dicen lo mismo. Derivacion determinista.
 *
 * No calcula el saldo por su cuenta (eso es `cuenta-proveedor` N3): SUBE por EVENTO a
 * `cuenta-proveedor.saldo.request` y ARMA el extracto (cabecera + movimientos + saldo de
 * cierre). Tambien observa el HECHO `contabilidad.asiento_asentado` (B2) para tener la
 * ventana del libro.
 *
 * Honestidad (invariante 13): sin tercero declarado no se inventa una cuenta; sin saldo no
 * se inventa un extracto (0 no es "sin deuda", es "desconocido"): queda declarado en `abierto`.
 * El extracto NO afirma cuadre: solo declara NUESTRO saldo; la confrontacion la hace el proveedor.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. PREGUNTA (extracto) → sin ui_handler.
 * Ver hoja N4 del plan-construccion y diseno-oop.md (CLASE EstadoCuentaProveedor).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class EstadoCuentaProveedor extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'estado-cuenta-proveedor';
    this.version = 'reflejo-0.1.0';
    this._vistos = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onExtractoRequest(e) {
    return this._atender(e, 'extracto', 'estado-cuenta-proveedor.extracto.response', async (d) => {
      const res = await this._extracto(d);
      // Reflejo: deriva el extracto; no escribe → no hay hecho de dominio que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('estado-cuenta-proveedor.extracto.failed', res);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): el libro cambio → se observa (ventana acotada) ──
  onAsientoAsentado(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id || this.project_id;
    if (!pid) return;
    let arr = this._vistos.get(pid);
    if (!arr) { arr = []; this._vistos.set(pid, arr); }
    if (d.asiento) arr.push(d.asiento);
    if (arr.length > 1000) arr.shift();
  }

  // ══════════════════════════════════════════════════════════════════════
  // extracto(tercero) → documento confrontable con el proveedor
  // ══════════════════════════════════════════════════════════════════════
  async _extracto(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const tercero = this._tercero(input);
    if (!tercero) return this._invalid('tercero');

    const { saldo, facturas, fuente } = await this._deCuentaProveedor(input, tercero);
    const movimientos = this._movimientosDe(input, facturas);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'estado-cuenta-proveedor',
        tercero,
        fuente: fuente || null,
        desde: input.desde != null ? String(input.desde) : null,
        hasta: input.hasta != null ? String(input.hasta) : null,
        cabecera: {
          proveedor: input.nombre != null ? String(input.nombre) : tercero,
          nif: input.nif != null ? String(input.nif) : null,
          emitido_en: new Date().toISOString()
        },
        movimientos,
        total_movimientos: movimientos.length,
        saldo_cierre: saldo != null ? this._round(saldo, 2) : null,
        saldo_firma: 'DEBE - HABER',
        confrontable: true,
        // El extracto NO afirma que cuadre: solo publica NUESTRO saldo; confronta el proveedor.
        cuadra: null,
        abierto: {
          fuente: fuente ? null : 'no se obtuvo el saldo de cuenta-proveedor (ni declarado): el extracto no se inventa',
          saldo: saldo == null ? 'el saldo de cierre es desconocido (0 no es "sin deuda")' : null,
          movimientos: movimientos.length ? null : 'no hay movimientos en el periodo declarado'
        }
      }
    };
  }

  // SUBE por EVENTO a cuenta-proveedor (N3); acepta tambien saldos/saldo declarados en el input.
  async _deCuentaProveedor(input, tercero) {
    if (input.saldo != null || Array.isArray(input.facturas)) {
      return {
        saldo: this._num(input.saldo != null ? input.saldo : input.saldo_cierre),
        facturas: Array.isArray(input.facturas) ? input.facturas : [],
        fuente: 'declarado'
      };
    }
    const resp = await this._rpc('cuenta-proveedor.saldo.request', {
      project_id: input.project_id || this.project_id, tercero, fecha: input.hasta, ejercicio: input.ejercicio
    }, { timeout_ms: 3000 });
    const d = resp && (resp.data || resp);
    if (!d || d.status === 404) return { saldo: null, facturas: [], fuente: null };
    return {
      saldo: this._num(d.saldo != null ? d.saldo : d.saldo_cierre),
      facturas: Array.isArray(d.facturas) ? d.facturas : [],
      fuente: 'cuenta-proveedor'
    };
  }

  _movimientosDe(input, facturas) {
    const explicitos = Array.isArray(input.movimientos) ? input.movimientos : null;
    if (explicitos) {
      return explicitos.map((m) => ({
        fecha: m.fecha != null ? String(m.fecha) : null,
        factura: m.factura != null ? String(m.factura) : null,
        concepto: m.concepto != null ? String(m.concepto) : (m.descripcion != null ? String(m.descripcion) : null),
        debe: this._round(this._num(m.debe) || 0, 2),
        haber: this._round(this._num(m.haber) || 0, 2),
        saldo: this._num(m.saldo)
      }));
    }
    return facturas.map((f) => ({
      fecha: f.fecha != null ? String(f.fecha) : null,
      factura: f.factura != null ? String(f.factura) : null,
      concepto: null,
      debe: f.saldo != null && Number(f.saldo) >= 0 ? this._round(Math.abs(this._num(f.saldo)), 2) : 0,
      haber: f.saldo != null && Number(f.saldo) < 0 ? this._round(Math.abs(this._num(f.saldo)), 2) : 0,
      saldo: this._num(f.saldo)
    }));
  }

  _tercero(input) {
    return input.tercero != null ? String(input.tercero).trim()
      : (input.proveedor != null ? String(input.proveedor).trim()
      : (input.nif != null ? String(input.nif).trim() : ''));
  }

  _num(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolExtracto(params) { return this._extracto(params); }
}

module.exports = EstadoCuentaProveedor;

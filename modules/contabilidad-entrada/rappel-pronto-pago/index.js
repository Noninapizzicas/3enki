/**
 * contabilidad-entrada/rappel-pronto-pago — REFLEJO STATELESS (N7, hoja del plan).
 *
 * DESCUENTOS / RAPPELS / ANTICIPOS que AJUSTAN EL COSTE REAL de la compra a lo realmente
 * pagado. Determinista: mismas condiciones declaradas → mismo ajuste.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ ESTA HOJA ERA UN ESCRITOR MUDO EN EL INTENTO ANTERIOR.
 * Su `ajustar` calculaba el rappel y NO lo anunciaba → la cadena se cortaba: el ajuste del
 * coste no llegaba nunca al libro. R2/plan N7 se corrige aqui: cuando el ajuste ESCRIBE el
 * coste, la hoja SUBE por EVENTO `escritor-diario.asentar.request` (B2, single-writer del
 * libro) — el ajuste del coste NO se queda en el aire, se anuncia y B2 lo asienta.
 * NO escribe el libro ella misma (respeta el single-writer): lo que hace es ANUNCIARLO.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * No calcula el saldo del proveedor (eso es `cuenta-proveedor` N3): SUBE por EVENTO a
 * `cuenta-proveedor.saldo.request` para leer lo pendiente y saber si el rappel/anticipo ya
 * se cobro/pago. Observa el HECHO `contabilidad.asiento_asentado` (B2) para tener la ventana.
 *
 * Honestidad (invariante 13): sin importe base NO se estima el ajuste; sin cuentas
 * declaradas NO se inventa el apunte del coste (el calculo se declara, el asiento queda
 * `abierto`). Un ajuste negativo no se "arregla": se declara.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. PREGUNTA (ajustar) → sin ui_handler.
 * Ver hoja N7 del plan-construccion y diseno-oop.md (CLASE RappelProntoPago).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class RappelProntoPago extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'rappel-pronto-pago';
    this.version = 'reflejo-0.1.0';
    this._vistos = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onAjustarRequest(e) {
    return this._atender(e, 'ajustar', 'rappel-pronto-pago.ajustar.response', async (d) => {
      const res = await this._ajustar(d);
      if (res.status !== 200) {
        this.eventBus?.publish('rappel-pronto-pago.ajustar.failed', res);
      } else {
        // R2/plan N7 · NO MUDO: el ajuste del coste ESCRIBE → se ANUNCIA.
        // El libro lo escribe B2 (single-writer); aqui se SUBE el asiento del ajuste por EVENTO.
        this._subirAsientoDelAjuste(res, d);
      }
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
  // ajustar(compra) → descuentos/rappels/anticipos → coste real de la compra
  // ══════════════════════════════════════════════════════════════════════
  async _ajustar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const compra = input.compra && typeof input.compra === 'object' ? input.compra : input;
    const costeBase = this._num(input.importe_base != null ? input.importe_base
      : (compra.importe_base != null ? compra.importe_base : compra.importe));
    if (costeBase == null) return this._invalid('importe_base');

    const descuento = this._round(this._num(input.descuento != null ? input.descuento : compra.descuento) || 0, 2);
    const prontoPagoPct = this._num(input.pronto_pago_pct != null ? input.pronto_pago_pct : (input.descuento_pronto_pago_pct != null ? input.descuento_pronto_pago_pct : compra.pronto_pago_pct)) || 0;
    const rappelPct = this._num(input.rappel_pct != null ? input.rappel_pct : (input.rappel != null && typeof input.rappel === 'object' ? input.rappel.pct : compra.rappel_pct)) || 0;
    const anticipos = this._round(this._num(input.anticipos != null ? input.anticipos : compra.anticipos) || 0, 2);

    const prontoPago = this._round(costeBase * prontoPagoPct / 100, 2);
    const rappel = this._round(costeBase * rappelPct / 100, 2);
    const ajusteTotal = this._round(descuento + prontoPago + rappel + anticipos, 2);
    const costeReal = this._round(costeBase - ajusteTotal, 2);

    // Lo pendiente del proveedor (lo SUBE por EVENTO a cuenta-proveedor N3): best-effort.
    const { saldo, fuente } = await this._saldoProveedor(input, compra);

    const ajustes = [
      { concepto: 'descuento', importe: descuento },
      { concepto: 'pronto_pago', pct: prontoPagoPct, importe: prontoPago },
      { concepto: 'rappel', pct: rappelPct, importe: rappel },
      { concepto: 'anticipos', importe: anticipos }
    ];

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'rappel-pronto-pago',
        tercero: this._tercero(input, compra),
        factura: input.factura != null ? String(input.factura) : (compra.factura != null ? String(compra.factura) : null),
        coste_base: costeBase,
        ajustes,
        ajuste_total: ajusteTotal,
        coste_real: costeReal,
        saldo_proveedor: saldo,
        fuente_saldo: fuente || null,
        formula: 'COSTE_REAL = COSTE_BASE - (DESCUENTO + PRONTO_PAGO + RAPPEL + ANTICIPOS)',
        determinista: true,
        ajusta_coste: ajusteTotal !== 0,
        abierto: {
          saldo: saldo == null ? 'no se obtuvo el saldo del proveedor (ni declarado ni de cuenta-proveedor): el pendiente no se inventa' : null,
          ajuste: ajusteTotal < 0 ? 'el ajuste es NEGATIVO: no se corrige, se declara (posible error de datos)' : null
        }
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════════════════════
  // R2 / plan N7 — LA CORRECCION DEL "ESCRITOR MUDO":
  // El ajuste del coste ESCRIBE → SUBE por EVENTO el asiento a escritor-diario (B2, single-writer).
  // Sin cuentas declaradas NO se inventa el apunte: se queda declarado en `abierto` (no silencio).
  // ══════════════════════════════════════════════════════════════════════════════════════
  _subirAsientoDelAjuste(res, d) {
    const data = res.data || {};
    if (!data.ajusta_coste) return;              // sin ajuste no hay nada que asentar (no es mudo: no hay hecho)
    const asiento = this._construirAsiento(data, d || {});
    if (!asiento) {
      // No se inventa el apunte: se declara el hueco (no se queda en silencio).
      this.logger?.info(`${this.name}.ajuste.sin_cuentas`, {
        project_id: data.project_id, factura: data.factura, ajuste_total: data.ajuste_total
      });
      return;
    }
    try {
      this.eventBus?.publish('escritor-diario.asentar.request', {
        project_id: data.project_id,
        asiento,
        origen: 'rappel-pronto-pago',
        correlation_id: d && d.correlation_id
      });
    } catch (_) { /* best-effort */ }
  }

  _construirAsiento(data, input) {
    if (input.asiento && Array.isArray(input.asiento.lineas)) return input.asiento;
    const cuentas = input.cuentas && typeof input.cuentas === 'object' ? input.cuentas : null;
    if (!cuentas || !cuentas.debe || !cuentas.haber) return null;  // sin cuentas declaradas NO se inventa
    const ajuste = Math.abs(data.ajuste_total);
    if (!(ajuste > 0)) return null;
    return {
      fecha: input.fecha || new Date().toISOString().slice(0, 10),
      referencia: `RAPPEL-${data.factura || data.tercero || 's/f'}`,
      lineas: [
        { cuenta: String(cuentas.debe), debe: ajuste, haber: 0, concepto: 'ajuste del coste (rappel/pronto pago)' },
        { cuenta: String(cuentas.haber), debe: 0, haber: ajuste, concepto: 'proveedor: menor coste de la compra' }
      ]
    };
  }

  async _saldoProveedor(input, compra) {
    if (input.saldo_proveedor != null || input.saldo != null) {
      return { saldo: this._num(input.saldo_proveedor != null ? input.saldo_proveedor : input.saldo), fuente: 'declarado' };
    }
    const tercero = this._tercero(input, compra);
    if (!tercero) return { saldo: null, fuente: null };
    const resp = await this._rpc('cuenta-proveedor.saldo.request', {
      project_id: input.project_id || this.project_id, tercero, ejercicio: input.ejercicio
    }, { timeout_ms: 3000 });
    const d = resp && (resp.data || resp);
    if (!d || d.status === 404) return { saldo: null, fuente: null };
    return { saldo: this._num(d.saldo), fuente: 'cuenta-proveedor' };
  }

  _tercero(input, compra) {
    const t = input.tercero != null ? input.tercero : (input.proveedor != null ? input.proveedor
      : (input.nif != null ? input.nif : (compra && (compra.tercero != null ? compra.tercero : compra.proveedor))));
    return t != null ? String(t).trim() : null;
  }

  _num(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolAjustar(params) { return this._ajustar(params); }
}

module.exports = RappelProntoPago;

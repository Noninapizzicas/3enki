/**
 * contabilidad-entrada/factura-rectificativa — REFLEJO STATELESS (O2, hoja del plan).
 *
 * Correccion comercial POSTERIOR a la emision (abono / devolucion / descuento) que NO BORRA
 * NADA. Una rectificacion es OTRA factura, jamas una edicion de la original (append-only del
 * libro O1). Esta hoja CALCULA la rectificativa a partir de la factura original.
 *
 * ESCUCHA `contabilidad.factura_emitida` (O1 emision-factura-venta) para tener a mano las
 * facturas que se pueden rectificar; su registro es un DERIVADO en memoria, no un hecho.
 *
 * Invariantes:
 *  - Dato ausente = desconocido: sin factura original o sin importe a rectificar NO se inventa
 *    la rectificativa; queda ABIERTA (se declara, no se estima).
 *  - LA POLARIDAD ES FIJA: la rectificativa CORRIGE (signo negativo). No se suma al original.
 *  - NO escribe, NO persiste: solo calcula. La emision de la rectificativa la hace O1 (se SUBE
 *    por EVENTO `emision-factura-venta.emitir.request`) y el asiento, escritor-diario (B2).
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. RPC PREGUNTA → sin ui_handler.
 * Ver hoja O2 del plan-construccion y diseno-oop.md (CLASE FacturaRectificativa).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const TIPOS = new Set(['abono', 'devolucion', 'descuento', 'anulacion']);

class FacturaRectificativa extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'factura-rectificativa';
    this.version = 'reflejo-0.1.0';
    // Derivado en memoria: project_id -> Map<factura_id, factura emitida>
    this._emitidas = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (PREGUNTA → sin ui_handler) ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'factura-rectificativa.calcular.response', async (d) => {
      const res = this._calcular(d);
      // Reflejo: calcula y declara; no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('factura-rectificativa.calcular.failed', res);
      else this._encadenar(res, d);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): una factura quedo emitida (O1) ──
  onFacturaEmitida(e) {
    const d = (e && (e.data || e)) || {};
    try {
      const pid = d.project_id || this.project_id;
      if (!pid) return;
      const factura = d.factura || null;
      if (!factura) return;
      const id = this._idFactura(factura);
      if (!id) return;
      this._almacen(pid).set(id, factura);
    } catch (err) {
      this.logger?.error(`${this.name}.factura_emitida.error`, { error: err.message });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // calcular(rectificacion) → rectificativa derivada de la factura original
  // ══════════════════════════════════════════════════════════════════════
  _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const original = input.factura || this._buscarOriginal(pid, input);
    if (!original) return this._invalid('factura');

    const tipo = this._tipo(input.tipo);
    const baseOriginal = this._num(original.base);
    const ivaOriginal = this._num(original.impuestos != null ? original.impuestos : original.iva);
    const totalOriginal = this._num(original.total);

    // La rectificacion puede ser PARCIAL (declarada) o TOTAL (la del original). No se estima si no hay nada.
    const base = this._num(input.base) != null ? this._num(input.base) : baseOriginal;
    const iva = this._num(input.iva) != null ? this._num(input.iva)
      : (baseOriginal && ivaOriginal != null && this._num(input.base) != null
        ? this._round(ivaOriginal * (base / baseOriginal), 2)
        : ivaOriginal);
    const total = this._num(input.total) != null ? this._num(input.total)
      : (base != null && iva != null ? this._round(base + iva, 2) : totalOriginal);

    if (total == null && base == null) {
      // Sin original ni importe declarado no hay rectificativa: se declara ABIERTO.
      return {
        status: 200,
        data: {
          project_id: pid, original_id: this._idFactura(original), tipo,
          rectificativa: null, calculada: false,
          abierto: { importe: 'no hay factura original con importes ni importe a rectificar declarado: no se inventa la rectificativa' }
        }
      };
    }

    // LA POLARIDAD: la rectificativa CORRIGE — signo negativo respecto al original.
    const rectificativa = {
      tipo,
      original_id: this._idFactura(original),
      original_serie: original.serie != null ? String(original.serie) : null,
      original_numero: original.numero != null ? original.numero : null,
      base: base != null ? this._round(-Math.abs(base), 2) : null,
      iva: iva != null ? this._round(-Math.abs(iva), 2) : null,
      total: total != null ? this._round(-Math.abs(total), 2) : null,
      signo: -1,
      motivo: input.motivo != null ? String(input.motivo) : null,
      asiento: original.asiento || null,
      en: new Date().toISOString()
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        original_id: rectificativa.original_id,
        tipo,
        rectificativa,
        calculada: true,
        // La rectificacion NUNCA borra: es OTRA factura (O1 la emitira por su camino).
        borra_original: false,
        determinista: true,
        abierto: {
          motivo: rectificativa.motivo ? null : 'la rectificativa no declara motivo (se anota el hueco, no se inventa)',
          original: this._idFactura(original) ? null : 'la factura original no declara identificador'
        }
      }
    };
  }

  // SUBE (best-effort) la rectificativa a emitir (O1) y su asiento (B2). No inventa nada.
  _encadenar(res, d) {
    const r = res.data.rectificativa;
    if (!r) return;
    const pid = res.data.project_id;
    try {
      this.eventBus?.publish('emision-factura-venta.emitir.request', {
        project_id: pid,
        factura: {
          rectificativa: true,
          rectifica_a: r.original_id,
          tipo: r.tipo,
          base: r.base, impuestos: r.iva, total: r.total,
          motivo: r.motivo
        },
        origen: 'factura-rectificativa',
        correlation_id: d.correlation_id
      });
      this.eventBus?.publish('escritor-diario.asentar.request', {
        project_id: pid, asiento: r.asiento, origen: 'factura-rectificativa', correlation_id: d.correlation_id
      });
    } catch (_) { /* best-effort */ }
  }

  _buscarOriginal(pid, input) {
    const m = this._emitidas.get(pid);
    if (!m) return null;
    const id = input.factura_id != null ? String(input.factura_id) : null;
    if (id) return m.get(id) || null;
    const serie = input.serie != null ? String(input.serie) : null;
    const numero = input.numero != null ? String(input.numero) : null;
    if (serie && numero) {
      for (const f of m.values()) {
        if (String(f.serie) === serie && String(f.numero) === numero) return f;
      }
    }
    return null;
  }

  _idFactura(f) {
    if (!f || typeof f !== 'object') return null;
    if (f.id != null) return String(f.id);
    if (f.documento_id != null) return String(f.documento_id);
    if (f.serie != null && f.numero != null) return `${f.serie}-${f.numero}`;
    return null;
  }

  _almacen(pid) {
    let m = this._emitidas.get(pid);
    if (!m) { m = new Map(); this._emitidas.set(pid, m); }
    return m;
  }

  _tipo(raw) {
    const t = String(raw || 'abono').toLowerCase().trim();
    return TIPOS.has(t) ? t : 'abono';
  }

  _num(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = FacturaRectificativa;

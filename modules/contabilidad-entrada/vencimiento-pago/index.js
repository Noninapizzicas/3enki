/**
 * contabilidad-entrada/vencimiento-pago — REFLEJO STATELESS (N6, hoja del plan).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * FECHA DE VENCIMIENTO por factura desde la POLITICA DECLARADA. Alimenta E5 y K2.
 * ══════════════════════════════════════════════════════════════════════════════════════
 * No inventa la politica de cobro/pago: la toma de la condicion declarada del tercero
 * (maestro-terceros, subida por EVENTO best-effort) o de la politica declarada en el
 * input. Calcula fecha_vencimiento = fecha_factura + dias de la politica. Determinista.
 *
 * Honestidad (invariante 13): sin fecha de factura NO se calcula el vencimiento; sin
 * politica declarada NO se inventan los dias — se declara ABIERTO (fecha_vencimiento:null).
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia. PREGUNTA (calcular) → sin ui_handler.
 * Ver hoja N6 del plan-construccion y diseno-oop.md (CLASE VencimientoPago).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class VencimientoPago extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'vencimiento-pago';
    this.version = 'reflejo-0.1.0';
    // Politica/facturas observadas por proyecto (memoria acotada, no store).
    this._politicas = new Map(); // project_id -> { dias, condicion }
    this._facturas = new Map();  // project_id -> [factura]
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'vencimiento-pago.calcular.response', async (d) => {
      const res = await this._calcular(d);
      if (res.status !== 200) this.eventBus?.publish('vencimiento-pago.calcular.failed', res);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): el libro cambio → se observa (ventana acotada) ──
  // De cada asiento se puede deducir una factura con su fecha y su tercero; no se reescribe.
  onAsientoAsentado(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id || this.project_id;
    if (!pid || !d.asiento) return;
    const lista = this._facturas.get(pid) || [];
    lista.push(d.asiento);
    if (lista.length > 1000) lista.shift();
    this._facturas.set(pid, lista);
  }

  // ── handler de dominio (fire-and-forget): se fijo un criterio → hay politica de plazo ──
  onCriterioFijado(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id || this.project_id;
    if (!pid) return;
    const p = this._politicas.get(pid) || {};
    const dias = this._num(d.dias_pago ?? d.dias ?? d.plazo ?? (d.criterio && d.criterio.dias) ?? (d.politica && d.politica.dias));
    if (dias != null) p.dias = dias;
    if (d.condicion != null) p.condicion = String(d.condicion);
    this._politicas.set(pid, p);
  }

  // ══════════════════════════════════════════════════════════════════════
  // _calcular(input) → { status, data }  ·  fecha de vencimiento por politica
  // ══════════════════════════════════════════════════════════════════════
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const factura = input.factura && typeof input.factura === 'object' ? input.factura : input;
    const fecha = this._fecha(factura.fecha_factura ?? factura.fecha ?? input.fecha_factura ?? input.fecha);
    if (!fecha) {
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'vencimiento-pago',
          fecha_factura: null,
          fecha_vencimiento: null,
          senal_presente: false,
          abierto: { fecha: 'no llego la fecha de la factura: el vencimiento no se inventa' }
        }
      };
    }

    // La politica: declarada en el input, de la condicion del tercero (best-effort), o del criterio.
    const politica = await this._politicaDe(input, factura, pid);
    if (politica.dias == null) {
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'vencimiento-pago',
          fecha_factura: fecha,
          fecha_vencimiento: null,
          senal_presente: false,
          abierto: { politica: 'no se declaro la politica de plazo (dias): el vencimiento no se inventa' }
        }
      };
    }

    const fecha_vencimiento = this._sumaDias(fecha, politica.dias);
    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'vencimiento-pago',
        fecha_factura: fecha,
        dias_politica: politica.dias,
        condicion: politica.condicion || null,
        fuente_politica: politica.fuente,
        fecha_vencimiento,
        determinista: true,
        formula: 'fecha_vencimiento = fecha_factura + dias de la politica DECLARADA',
        abierto: { condicion: politica.condicion ? null : 'la politica no declaro su condicion (se anota el hueco, no se inventa)' }
      }
    };
  }

  // Resuelve los DIAS de la politica: input → maestro-terceros (best-effort) → criterio observado.
  async _politicaDe(input, factura, pid) {
    const directos = this._num(input.dias ?? input.dias_pago ?? factura.dias ?? factura.plazo);
    if (directos != null) return { dias: directos, condicion: input.condicion ? String(input.condicion) : null, fuente: 'declarado' };

    const nif = factura.nif ?? factura.tercero_nif ?? input.nif;
    if (nif != null) {
      const r = await this._rpc('maestro-terceros.ficha.request', { project_id: pid, nif: String(nif) }, { timeout_ms: 800 });
      const ficha = r && (r.ficha || (r.data && r.data.ficha));
      const cond = ficha && (ficha.condiciones || ficha);
      const dias = cond && this._num(cond.dias_pago ?? cond.dias ?? cond.plazo);
      if (dias != null) return { dias, condicion: cond.condicion != null ? String(cond.condicion) : null, fuente: 'maestro-terceros' };
    }

    const obs = this._politicas.get(pid);
    if (obs && obs.dias != null) return { dias: obs.dias, condicion: obs.condicion || null, fuente: 'criterio_fijado' };
    return { dias: null, condicion: null, fuente: null };
  }

  // Suma dias a una fecha ISO (YYYY-MM-DD), en UTC para no depender del huso.
  _sumaDias(fechaISO, dias) {
    const [y, m, d] = String(fechaISO).split('-').map(Number);
    if (!y || !m || !d) return null;
    const base = Date.UTC(y, m - 1, d);
    const venc = new Date(base + Math.trunc(dias) * 86400000);
    return venc.toISOString().slice(0, 10);
  }

  _fecha(v) {
    if (v === undefined || v === null || v === '') return null;
    const s = String(v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = VencimientoPago;

/**
 * contabilidad-fiscal/retenciones — REFLEJO STATELESS (D4, hoja del plan).
 *
 * Retenciones PRACTICADAS y SOPORTADAS calculadas desde los asientos (via el mayor). Determinista.
 *   · practicadas = retenciones que EL NEGOCIO practica a otros (salida: cuenta 4751).
 *   · soportadas  = retenciones que a EL NEGOCIO le practican (entrada: cuenta 473).
 * No calcula la cifra por su cuenta (eso es mayor-balanza): RECIBE los saldos (o los sube por EVENTO)
 * y AISLA las cuentas de retencion.
 *
 * Honestidad: sin saldos no se inventan retenciones; la naturaleza (practicada/soportada) sale de la
 * cuenta declarada o de su prefijo (475 → practicada, 473 → soportada); lo que no se puede clasificar
 * NO se cuenta: se declara en `abierto` con su saldo.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia. PREGUNTA (calcular) → sin ui_handler.
 * Ver hoja D4 del plan-construccion y diseno-oop.md (CLASE Retenciones).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class Retenciones extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'retenciones';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea). CLASE PREGUNTA → sin ui_handler ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'retenciones.calcular.response', async (d) => {
      const res = await this._calcular(d);
      if (res.status !== 200) this.eventBus?.publish('retenciones.calcular.failed', res);
      return res;
    });
  }

  // ── handler de dominio: el libro cambio → se observa (ventana acotada) ──
  onAsientoAsentado(e) {
    const d = (e && (e.data || e)) || {};
    this._vistos = this._vistos || [];
    if (d.asiento) this._vistos.push(d.asiento);
    if (this._vistos.length > 1000) this._vistos.shift();
  }

  // ══════════════════════════════════════════════════════════════════════
  // calcular(saldos) → { practicadas, soportadas, detalle }
  // ══════════════════════════════════════════════════════════════════════
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const { saldos, fuente } = await this._saldosDe(input);

    let practicadas = 0, soportadas = 0;
    const detalle = [];
    const noClasificables = [];

    for (const s of saldos) {
      const cuenta = s && s.cuenta != null ? String(s.cuenta) : null;
      const naturaleza = this._naturaleza(s, cuenta);
      if (!naturaleza) { if (this._esRetencion(s, cuenta)) noClasificables.push({ cuenta, saldo: this._saldo(s) }); continue; }
      const saldo = Math.abs(this._saldo(s));
      if (naturaleza === 'practicada') practicadas += saldo;
      else soportadas += saldo;
      detalle.push({ cuenta, naturaleza, saldo: this._round(saldo, 2) });
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'retenciones',
        fuente: fuente || null,
        practicadas: this._round(practicadas, 2),
        soportadas: this._round(soportadas, 2),
        neto: this._round(practicadas - soportadas, 2),
        num_cuentas: detalle.length,
        detalle,
        determinista: true,
        abierto: {
          fuente: fuente ? null : 'no se recibieron saldos (ni declarados ni de mayor-balanza): las retenciones no se inventan',
          clasificacion: noClasificables.length
            ? `${noClasificables.length} cuenta(s) de retencion sin naturaleza declarada ni prefijo reconocible (4751 practicada / 473 soportada): no se suman`
            : null
        }
      }
    };
  }

  async _saldosDe(input) {
    if (Array.isArray(input.saldos)) return { saldos: input.saldos, fuente: 'declarado' };
    const resp = await this._rpc('mayor-balanza.saldos.request', {
      project_id: input.project_id || this.project_id,
      fecha: input.fecha, ejercicio: input.ejercicio
    }, { timeout_ms: 800 });
    if (resp && Array.isArray(resp.saldos)) return { saldos: resp.saldos, fuente: 'mayor-balanza' };
    return { saldos: [], fuente: null };
  }

  _esRetencion(s, cuenta) {
    const decl = s && (s.tipo || s.naturaleza_retencion);
    if (decl && /retenc/i.test(String(decl))) return true;
    const c = String(cuenta || '');
    return c.startsWith('473') || c.startsWith('475') || c.startsWith('4715') || c.includes('ret');
  }

  _naturaleza(s, cuenta) {
    const decl = s && (s.naturaleza_retencion || s.tipo);
    if (decl) {
      const v = String(decl).toLowerCase();
      if (v.includes('practic')) return 'practicada';
      if (v.includes('soport')) return 'soportada';
    }
    const c = String(cuenta || '');
    if (c.startsWith('475')) return 'practicada';
    if (c.startsWith('473')) return 'soportada';
    return null;
  }

  _saldo(s) {
    const n = Number(s && (s.saldo != null ? s.saldo : (Number(s.debe || 0) - Number(s.haber || 0))));
    return Number.isFinite(n) ? n : 0;
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = Retenciones;

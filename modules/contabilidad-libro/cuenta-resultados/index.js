/**
 * contabilidad-libro/cuenta-resultados — REFLEJO STATELESS (C2, hoja del plan).
 *
 * Ingresos / gastos / resultado DERIVADO del mayor. Determinista.
 * No calcula la cifra por cuenta (eso es mayor-balanza): RECIBE los saldos (o los sube por EVENTO)
 * y los AGREGA en ingresos y gastos del periodo; el resultado es ingresos − gastos.
 *
 * Honestidad (invariante 13): solo cuenta como ingreso/gasto lo CLASIFICABLE (masa declarada o
 * grupo 6/7 del PGC). Lo inclasificable NO se suma a ciegas: se declara en `abierto`.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia. PREGUNTA (calcular) → sin ui_handler.
 * Ver hoja C2 del plan-construccion y diseno-oop.md (CLASE CuentaResultados).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class CuentaResultados extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cuenta-resultados';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea). CLASE PREGUNTA → sin ui_handler ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'cuenta-resultados.calcular.response', async (d) => {
      const res = await this._calcular(d);
      if (res.status !== 200) this.eventBus?.publish('cuenta-resultados.calcular.failed', res);
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
  // calcular(saldos) → { ingresos, gastos, resultado }
  // ══════════════════════════════════════════════════════════════════════
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const { saldos, fuente } = await this._saldosDe(input);

    let ingresos = 0, gastos = 0;
    const lineas = [];
    const noClasificables = [];

    for (const s of saldos) {
      const cuenta = s && s.cuenta != null ? String(s.cuenta) : null;
      // Convencion DECLARADA: saldo entrante = DEBE − HABER (firmado). Ingresos son acreedores
      // (natural = haber−debe = −raw); gastos son deudores (natural = debe−haber = raw).
      const raw = this._round(this._num(s && (s.saldo != null ? s.saldo : (Number(s.debe || 0) - Number(s.haber || 0)))), 2);
      const grupo = this._grupo(s, cuenta);
      if (grupo === 'ingreso') { ingresos += -raw; lineas.push({ cuenta, saldo: raw, grupo, natural: this._round(-raw, 2) }); }
      else if (grupo === 'gasto') { gastos += raw; lineas.push({ cuenta, saldo: raw, grupo, natural: this._round(raw, 2) }); }
      else noClasificables.push({ cuenta, saldo: raw });
    }

    ingresos = this._round(ingresos, 2);
    gastos = this._round(gastos, 2);
    const resultado = this._round(ingresos - gastos, 2);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'cuenta-resultados',
        fuente: fuente || null,
        ingresos,
        gastos,
        resultado,
        total_cuentas: saldos.length,
        determinista: true,
        lineas,
        abierto: {
          fuente: fuente ? null : 'no se recibieron saldos (ni declarados ni de mayor-balanza): el resultado no se inventa',
          clasificacion: noClasificables.length
            ? `${noClasificables.length} cuenta(s) fuera de grupo 6/7 y sin masa declarada: no se suman al resultado`
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

  _grupo(s, cuenta) {
    const declarada = s && (s.grupo || s.masa);
    if (declarada) {
      const g = String(declarada).toLowerCase().trim();
      if (g === 'ingreso' || g === 'gasto') return g;
    }
    const c = String(cuenta || '');
    if (c[0] === '7') return 'ingreso';
    if (c[0] === '6') return 'gasto';
    return 'desconocido';
  }

  _num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = CuentaResultados;

/**
 * contabilidad-libro/cuenta-resultados — REFLEJO STATELESS (C2, hoja del plan).
 *
 * Deriva la CUENTA DE RESULTADOS (ingresos / gastos / resultado) del MAYOR.
 * NO recalcula los asientos: parte del mayor-balanza (B3) y solo CLASIFICA.
 *
 * La ley entra como DATO: el sentido de las cuentas de resultado (qué prefijo es
 * ingreso y qué prefijo es gasto) es DECLARABLE (`reglas`); sin declararlas se usa
 * la composición por defecto sobre grupos estándar. Nada se cablea de forma rígida.
 *
 * Determinista: mismo mayor → misma cuenta de resultados. El resultado SUMA de
 * ingresos − gastos (un resultado negativo es una pérdida declarada, no un error).
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja C2 del plan-construccion y diseno-oop.md (CLASE CuentaResultados).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Clasificación por defecto (declarable). Prefijo de cuenta → naturaleza de resultado.
const REGLAS_DEFECTO = [
  { prefijo: '7', grupo: 'INGRESO' },
  { prefijo: '6', grupo: 'GASTO' }
];

class CuentaResultados extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cuenta-resultados';
    this.version = 'reflejo-0.1.0';
    // espejo en memoria de los asientos (fallback si mayor-balanza no responde)
    this._espejo = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── fire-and-forget: el diario publicó un asiento → se refleja la muestra (no decide) ──
  onAsientoRegistrado(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id;
    const asiento = d.asiento;
    if (!pid || !asiento || typeof asiento !== 'object') return null;
    const clave = asiento.clave_natural != null ? String(asiento.clave_natural)
      : (asiento.numero != null ? String(asiento.numero) : null);
    if (!clave) return null;
    const m = this._espejoDe(pid);
    m.set(clave, asiento);
    return null;
  }

  // ── handler RPC (una línea, delega a _atender) ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'cuenta-resultados.calcular.response', async (d) => {
      const res = await this._calcular(d);
      if (res.status !== 200) this.eventBus?.publish('cuenta-resultados.calcular.failed', res);
      return res;
    });
  }

  // ── RESULTADOS: ingresos/gastos/resultado derivado del mayor (clasifica, no recalcula) ──
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const { mayor, fuente } = await this._mayor(pid, input);
    const reglas = this._reglas(input.reglas);

    const ingresos = [];
    const gastos = [];
    const otro = [];
    for (const linea of mayor) {
      const grupo = this._grupoDe(linea.cuenta, reglas);
      const item = { cuenta: linea.cuenta, saldo: linea.saldo, debe: linea.debe, haber: linea.haber };
      if (grupo === 'INGRESO') ingresos.push(item);
      else if (grupo === 'GASTO') gastos.push(item);
      else otro.push(item);
    }

    // Ingresos por naturaleza acreedora (saldo negativo → positivo); gastos deudores.
    const total_ingresos = this._round(-ingresos.reduce((s, x) => s + x.saldo, 0), 2);
    const total_gastos = this._round(gastos.reduce((s, x) => s + x.saldo, 0), 2);
    const resultado = this._round(total_ingresos - total_gastos, 2);

    return {
      status: 200,
      data: {
        project_id: pid,
        ejercicio: input.ejercicio != null ? input.ejercicio : null,
        fuente,
        total_ingresos,
        total_gastos,
        resultado,
        // El resultado negativo es una pérdida declarada, no un error.
        signo: resultado > 0 ? 'BENEFICIO' : (resultado < 0 ? 'PERDIDA' : 'NULO'),
        detalle: { ingresos, gastos, otro }
      }
    };
  }

  // Pide el mayor a mayor-balanza POR EVENTO; si no responde, lo deriva del espejo.
  async _mayor(pid, input = {}) {
    const r = await this._rpc('mayor-balanza.saldos.request',
      { project_id: pid, ejercicio: input.ejercicio ?? null }, { timeout_ms: 4000 });
    if (r && r.status === 200 && r.data && Array.isArray(r.data.mayor)) {
      return { mayor: r.data.mayor, fuente: 'mayor-balanza' };
    }
    return { mayor: this._derivarMayor(pid), fuente: 'espejo' };
  }

  _derivarMayor(pid) {
    const por = new Map();
    for (const a of this._espejoDe(pid).values()) {
      if (!a || !Array.isArray(a.apuntes)) continue;
      for (const ap of a.apuntes) {
        if (!ap || ap.cuenta == null) continue;
        const cuenta = String(ap.cuenta);
        const debe = this._num(ap.debe);
        const haber = this._num(ap.haber);
        if (debe === null || haber === null) continue;
        let s = por.get(cuenta);
        if (!s) { s = { cuenta, debe: 0, haber: 0 }; por.set(cuenta, s); }
        s.debe = this._round(s.debe + debe, 2);
        s.haber = this._round(s.haber + haber, 2);
      }
    }
    return [...por.values()].sort((x, y) => x.cuenta.localeCompare(y.cuenta)).map(s => {
      const saldo = this._round(s.debe - s.haber, 2);
      return {
        cuenta: s.cuenta, debe: s.debe, haber: s.haber, saldo,
        saldo_deudor: saldo > 0 ? saldo : 0,
        saldo_acreedor: saldo < 0 ? this._round(-saldo, 2) : 0
      };
    });
  }

  // Reglas declarables; sin declarar → las de defecto.
  _reglas(raw) {
    if (!Array.isArray(raw)) return REGLAS_DEFECTO;
    const reglas = raw
      .filter(r => r && r.prefijo != null && r.grupo != null)
      .map(r => ({ prefijo: String(r.prefijo), grupo: String(r.grupo).toUpperCase() }));
    return reglas.length ? reglas : REGLAS_DEFECTO;
  }

  // Clasifica por el prefijo MÁS LARGO que casa (determinista).
  _grupoDe(cuenta, reglas) {
    const codigo = String(cuenta);
    let mejor = null;
    for (const r of reglas) {
      if (codigo.startsWith(r.prefijo) && (!mejor || r.prefijo.length > mejor.prefijo.length)) mejor = r;
    }
    return mejor ? mejor.grupo : 'OTRO';
  }

  _espejoDe(pid) {
    let m = this._espejo.get(pid);
    if (!m) { m = new Map(); this._espejo.set(pid, m); }
    return m;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = CuentaResultados;

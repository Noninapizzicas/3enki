/**
 * contabilidad-libro/saldo-tesoreria — REFLEJO STATELESS (E4, hoja del plan).
 *
 * Posicion real de DINERO por cuenta. Derivacion determinista.
 * El dinero vive en cuentas (grupo 5 del PGC): aqui se agrupa el saldo del mayor POR cuenta
 * bancaria. Que cuentas existen y su MONEDA lo DECLARA maestro-cuentas-bancarias (E11) — este
 * reflejo NO adivina la moneda: la recibe del hecho `contabilidad.cuenta_bancaria_declarada`,
 * y si no esta declarada lo dice en `abierto`.
 *
 * Honestidad (invariante 13): sin saldos no se inventa una posicion; sin moneda declarada no se
 * asume EUR; si hay varias monedas, el total se declara como NO agregable.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia. PREGUNTA (calcular) → sin ui_handler.
 * Ver hoja E4 del plan-construccion y diseno-oop.md (CLASE SaldoTesoreria).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class SaldoTesoreria extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'saldo-tesoreria';
    this.version = 'reflejo-0.1.0';
    // Monedas de cuenta DECLARADAS por el hecho E11 (no adivinadas).
    this._monedas = new Map();           // project_id -> Map<cuenta_id, {moneda, cuenta}>
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea). CLASE PREGUNTA → sin ui_handler ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'saldo-tesoreria.calcular.response', async (d) => {
      const res = await this._calcular(d);
      if (res.status !== 200) this.eventBus?.publish('saldo-tesoreria.calcular.failed', res);
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

  // ── handler de dominio: E11 declaro una cuenta bancaria y su moneda → se registra ──
  onCuentaBancariaDeclarada(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id;
    if (!pid || d.cuenta_id == null) return;
    let m = this._monedas.get(pid);
    if (!m) { m = new Map(); this._monedas.set(pid, m); }
    m.set(String(d.cuenta_id), { moneda: d.moneda || (d.cuenta && d.cuenta.moneda) || null, cuenta: d.cuenta || null });
  }

  // ══════════════════════════════════════════════════════════════════════
  // calcular(saldos) → { posicion, por_cuenta }
  // ══════════════════════════════════════════════════════════════════════
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const { saldos, fuente } = await this._saldosDe(input);
    const monedas = this._monedas.get(pid) || new Map();

    // Solo el dinero: cuentas de tesoreria (grupo 5 declarado, o prefijo 57x si no hay declaracion).
    const porCuenta = new Map();
    const noDinero = [];
    for (const s of saldos) {
      const cuenta = s && s.cuenta != null ? String(s.cuenta) : null;
      if (!this._esDinero(s, cuenta)) { noDinero.push({ cuenta }); continue; }
      const saldo = this._round(this._num(s && (s.saldo != null ? s.saldo : (Number(s.debe || 0) - Number(s.haber || 0)))), 2);
      const acc = porCuenta.get(cuenta) || { cuenta, saldo: 0 };
      acc.saldo = this._round(acc.saldo + saldo, 2);
      porCuenta.set(cuenta, acc);
    }

    const cuentas = [...porCuenta.values()].map((c) => {
      const decl = monedas.get(c.cuenta) || null;
      return { cuenta: c.cuenta, saldo: c.saldo, moneda: decl ? decl.moneda : null, declarada: !!decl };
    });

    const sinMoneda = cuentas.filter((c) => c.moneda == null);
    const monedasDistintas = [...new Set(cuentas.map((c) => c.moneda).filter((m) => m != null))];
    const agregable = sinMoneda.length === 0 && monedasDistintas.length <= 1 && cuentas.length > 0;
    const posicion = agregable ? this._round(cuentas.reduce((t, c) => t + c.saldo, 0), 2) : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'saldo-tesoreria',
        fuente: fuente || null,
        posicion,                       // null si no es agregable (varias monedas o moneda sin declarar)
        moneda: monedasDistintas.length === 1 ? monedasDistintas[0] : null,
        agregable,
        monedas: monedasDistintas,
        cuentas,
        total_cuentas: cuentas.length,
        determinista: true,
        abierto: {
          fuente: fuente ? null : 'no se recibieron saldos (ni declarados ni de mayor-balanza): la posicion no se inventa',
          moneda: sinMoneda.length
            ? `${sinMoneda.length} cuenta(s) sin moneda declarada (E11): NO se asume EUR ni se agrega a ciegas`
            : null,
          mezcla_monedas: monedasDistintas.length > 1
            ? 'hay mas de una moneda: el total no es agregable sin tipo de cambio declarado'
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

  // Dinero = masa/grupo declarado 'tesoreria' o 'activo' con naturaleza declarada, o prefijo 57x.
  _esDinero(s, cuenta) {
    const declarado = s && (s.masa || s.grupo);
    if (declarado) {
      const g = String(declarado).toLowerCase().trim();
      if (g === 'tesoreria' || g === 'dinero') return true;
    }
    if (s && s.tesoreria === true) return true;
    const c = String(cuenta || '');
    return c.startsWith('57');
  }

  _num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = SaldoTesoreria;

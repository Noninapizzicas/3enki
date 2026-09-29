/**
 * contabilidad-libro/balance-situacion — REFLEJO STATELESS (C1, hoja del plan).
 *
 * Deriva el BALANCE DE SITUACIÓN (activo / pasivo / patrimonio) del MAYOR.
 * NO recalcula los asientos: parte del mayor-balanza (B3) y solo CLASIFICA.
 *
 * Invariante 1 (la partida doble cuadra): ACTIVO = PASIVO + PATRIMONIO. Un descuadre
 * NO es un estado del balance: es un ERROR — se declara (`cuadra:false`), no se matiza.
 *
 * La ley entra como DATO: la clasificación de cuentas por prefijo es DECLARABLE
 * (`reglas`); sin declararlas se usa la composición por defecto sobre grupos estándar.
 * Nada se cablea en el código de forma rígida.
 *
 * Invariante 2 (el asiento original no se borra): el balance no reescribe asientos.
 * Determinista: mismo mayor → mismo balance.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja C1 del plan-construccion y diseno-oop.md (CLASE BalanceSituacion).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Clasificación por defecto (declarable). Prefijo de cuenta → grupo del balance.
const REGLAS_DEFECTO = [
  { prefijo: '1', grupo: 'ACTIVO' },
  { prefijo: '2', grupo: 'ACTIVO' },
  { prefijo: '3', grupo: 'PATRIMONIO' },
  { prefijo: '4', grupo: 'PASIVO' },
  { prefijo: '5', grupo: 'PATRIMONIO' }
];

class BalanceSituacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'balance-situacion';
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
    return this._atender(e, 'calcular', 'balance-situacion.calcular.response', async (d) => {
      const res = await this._calcular(d);
      if (res.status !== 200) this.eventBus?.publish('balance-situacion.calcular.failed', res);
      return res;
    });
  }

  // ── BALANCE: activo/pasivo/patrimonio derivado del mayor (clasifica, no recalcula) ──
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const { mayor, fuente } = await this._mayor(pid, input);
    const reglas = this._reglas(input.reglas);

    const buckets = { ACTIVO: [], PASIVO: [], PATRIMONIO: [], OTRO: [] };
    for (const linea of mayor) {
      const grupo = this._grupoDe(linea.cuenta, reglas);
      buckets[grupo].push({
        cuenta: linea.cuenta,
        saldo: linea.saldo,
        saldo_deudor: linea.saldo_deudor,
        saldo_acreedor: linea.saldo_acreedor
      });
    }

    // Activo = suma de saldos deudores netos; pasivo/patrimonio = saldos acreedores netos.
    const activo = this._round(buckets.ACTIVO.reduce((s, x) => s + x.saldo, 0), 2);
    const pasivo = this._round(-buckets.PASIVO.reduce((s, x) => s + x.saldo, 0), 2);
    const patrimonio = this._round(-buckets.PATRIMONIO.reduce((s, x) => s + x.saldo, 0), 2);
    const pasivo_patrimonio = this._round(pasivo + patrimonio, 2);
    const descuadre = this._round(activo - pasivo_patrimonio, 2);
    // Invariante 1: el descuadre ES un error, no un estado → se declara.
    const cuadra = Math.abs(descuadre) < 0.01;

    return {
      status: 200,
      data: {
        project_id: pid,
        ejercicio: input.ejercicio != null ? input.ejercicio : null,
        fuente,
        activo,
        pasivo,
        patrimonio,
        pasivo_patrimonio,
        descuadre,
        cuadra,
        // Se declara el descuadre; el balance no lo esconde ni lo cuadra por el usuario.
        aviso: cuadra ? null : 'ACTIVO != PASIVO + PATRIMONIO: descuadre declarado (error, no estado)',
        detalle: {
          activo: buckets.ACTIVO,
          pasivo: buckets.PASIVO,
          patrimonio: buckets.PATRIMONIO,
          otro: buckets.OTRO
        }
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

  // Derivación mínima del mayor desde el espejo (fallback, mismo cálculo puro).
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

module.exports = BalanceSituacion;

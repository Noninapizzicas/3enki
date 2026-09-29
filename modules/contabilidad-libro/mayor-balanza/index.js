/**
 * contabilidad-libro/mayor-balanza — REFLEJO STATELESS (B3, hoja del plan).
 *
 * Deriva el MAYOR (saldos por cuenta) y la BALANZA (sumas y saldos) del diario.
 * NO muta nada: es cálculo puro desde los asientos. El almacén de los asientos es
 * escritor-diario (B2); aquí solo se proyecta.
 *
 * El diario llega por DOS vías, ninguna es un `require` cruzado:
 *   - `contabilidad.asiento_registrado` (fire-and-forget): se ACUMULA la muestra
 *     del asiento en memoria (los hechos registrados se reflejan).
 *   - `mayor-balanza.saldos.request` / `.balanza.request`: se PIDE el diario a
 *     escritor-diario POR EVENTO (RPC `escritor-diario.*`) y, si no responde, se
 *     derivan los saldos de los asientos acumulados. Se declara de dónde salió.
 *
 * Invariante 2 (el asiento original no se borra): el mayor no reescribe asientos;
 * solo suma debe/haber por cuenta. Determinista: mismo diario → mismo mayor.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja B3 del plan-construccion y diseno-oop.md (CLASE MayorBalanza).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class MayorBalanza extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'mayor-balanza';
    this.version = 'reflejo-0.1.0';
    // espejo en memoria de los asientos registrados: project_id -> Map<numero|clave, asiento>
    this._espejo = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── fire-and-forget: el diario publicó un asiento → se refleja la muestra (no muta el libro) ──
  onAsientoRegistrado(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id;
    const asiento = d.asiento;
    if (!pid || !asiento || typeof asiento !== 'object') return null;
    // Idempotente: un hecho = un asiento; el mismo numero/clave no se duplica en el espejo.
    const clave = asiento.clave_natural != null ? String(asiento.clave_natural)
      : (asiento.numero != null ? String(asiento.numero) : null);
    if (!clave) return null;
    const m = this._espejoDe(pid);
    m.set(clave, asiento);
    this.logger?.debug('mayor-balanza.asiento.reflejado', { project_id: pid, clave });
    return this._saldos({ project_id: pid });
  }

  // ── handlers RPC (una línea, delegan a _atender) ──
  onSaldosRequest(e) {
    return this._atender(e, 'saldos', 'mayor-balanza.saldos.response', async (d) => {
      const res = await this._saldos(d);
      if (res.status !== 200) this.eventBus?.publish('mayor-balanza.saldos.failed', res);
      return res;
    });
  }

  onBalanzaRequest(e) {
    return this._atender(e, 'balanza', 'mayor-balanza.balanza.response', async (d) => {
      const res = await this._balanza(d);
      if (res.status !== 200) this.eventBus?.publish('mayor-balanza.balanza.failed', res);
      return res;
    });
  }

  // ── MAYOR: saldos por cuenta derivados del diario (cálculo puro, no muta) ──
  async _saldos(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const { asientos, fuente } = await this._diario(pid, input);
    const por_cuenta = new Map();
    for (const a of asientos) {
      if (!a || !Array.isArray(a.apuntes)) continue;
      for (const ap of a.apuntes) {
        if (!ap || ap.cuenta == null) continue;
        const cuenta = String(ap.cuenta);
        const debe = this._num(ap.debe);
        const haber = this._num(ap.haber);
        if (debe === null || haber === null) continue;
        let s = por_cuenta.get(cuenta);
        if (!s) { s = { cuenta, debe: 0, haber: 0, movimientos: 0 }; por_cuenta.set(cuenta, s); }
        s.debe = this._round(s.debe + debe, 2);
        s.haber = this._round(s.haber + haber, 2);
        s.movimientos += 1;
      }
    }

    // Orden determinista por código de cuenta.
    const mayores = [...por_cuenta.values()]
      .sort((x, y) => x.cuenta.localeCompare(y.cuenta))
      .map(s => {
        const saldo = this._round(s.debe - s.haber, 2);
        return {
          cuenta: s.cuenta,
          debe: s.debe,
          haber: s.haber,
          saldo,
          saldo_deudor: saldo > 0 ? saldo : 0,
          saldo_acreedor: saldo < 0 ? this._round(-saldo, 2) : 0,
          movimientos: s.movimientos
        };
      });

    return {
      status: 200,
      data: {
        project_id: pid,
        ejercicio: input.ejercicio != null ? input.ejercicio : null,
        fuente,
        total_cuentas: mayores.length,
        suma_debe: this._round(mayores.reduce((s, m) => s + m.debe, 0), 2),
        suma_haber: this._round(mayores.reduce((s, m) => s + m.haber, 0), 2),
        mayor: mayores
      }
    };
  }

  // ── BALANZA: sumas y saldos (misma derivación, más los descuadres declarados) ──
  async _balanza(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const res = await this._saldos(input);
    if (res.status !== 200) return res;
    const s = res.data;

    // La balanza no es un estado del libro: es una proyección del mayor.
    const descuadre_sumas = this._round(s.suma_debe - s.suma_haber, 2);
    const total_deudor = this._round(s.mayor.reduce((x, m) => x + m.saldo_deudor, 0), 2);
    const total_acreedor = this._round(s.mayor.reduce((x, m) => x + m.saldo_acreedor, 0), 2);
    const descuadre_saldos = this._round(total_deudor - total_acreedor, 2);
    // La partida doble cuadra: si no, se DECLARA el descuadre; no se matiza.
    const cuadra = Math.abs(descuadre_sumas) < 0.01 && Math.abs(descuadre_saldos) < 0.01;

    return {
      status: 200,
      data: {
        project_id: pid,
        ejercicio: s.ejercicio,
        fuente: s.fuente,
        num_cuentas: s.total_cuentas,
        suma_debe: s.suma_debe,
        suma_haber: s.suma_haber,
        total_saldo_deudor: total_deudor,
        total_saldo_acreedor: total_acreedor,
        descuadre_sumas,
        descuadre_saldos,
        cuadra,
        // Si no cuadra, se declara el descuadre; la balanza no lo esconde.
        aviso: cuadra ? null : 'la balanza no cuadra: se declara el descuadre, no se matiza',
        lineas: s.mayor
      }
    };
  }

  // Pide el diario a escritor-diario POR EVENTO; si no responde, usa el espejo.
  async _diario(pid, input = {}) {
    const r = await this._rpc('escritor-diario.asientos.request',
      { project_id: pid, ejercicio: input.ejercicio ?? null }, { timeout_ms: 4000 });
    const asientos = r && r.data && Array.isArray(r.data.asientos) ? r.data.asientos
      : (r && Array.isArray(r) ? r : null);
    if (asientos) return { asientos, fuente: 'diario' };
    return { asientos: [...this._espejoDe(pid).values()], fuente: 'espejo' };
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
  toolSaldos(params) { return this._saldos(params); }
  toolBalanza(params) { return this._balanza(params); }
}

module.exports = MayorBalanza;

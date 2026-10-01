/**
 * contabilidad-libro/mayor-balanza — REFLEJO STATELESS (B3, hoja del plan).
 *
 * Saldos por CUENTA y BALANZA de comprobacion DERIVADOS del diario. Calculo
 * DETERMINISTA (mismo diario → mismos saldos); un test lo afirma.
 *
 * La hoja ESCUCHA `contabilidad.asiento_asentado` (B2 escritor-diario) y va
 * acumulando su DERIVADO en memoria (el mayor): no escribe el libro, lo LEE.
 * La escritura del diario es de escritor-diario; aqui solo se DERIVA.
 *
 * Invariantes:
 *  - Dato ausente = desconocido: una linea sin cuenta NO se imputa a una cuenta inventada;
 *    se conserva como suma `sin_cuenta` y se declara en `abierto`.
 *  - Debe/Haber se conservan SEPARADOS y se deriva el saldo por cuenta.
 *  - NO escribe, NO persiste, NO muta el diario: solo calcula. Su acumulado es un DERIVADO.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * RPC saldos/balanza son CLASE PREGUNTA → sin ui_handler.
 * Ver hoja B3 del plan-construccion y diseno-oop.md (CLASE MayorBalanza).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class MayorBalanza extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'mayor-balanza';
    this.version = 'reflejo-0.1.0';
    // Derivado en memoria: project_id -> Map<cuenta, {debe, haber, movimientos}>
    this._mayores = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC (PREGUNTA → sin ui_handler) ──
  onSaldosRequest(e) {
    return this._atender(e, 'saldos', 'mayor-balanza.saldos.response', async (d) => {
      const res = this._saldos(d);
      if (res.status !== 200) this.eventBus?.publish('mayor-balanza.saldos.failed', res);
      return res;
    });
  }

  onBalanzaRequest(e) {
    return this._atender(e, 'balanza', 'mayor-balanza.balanza.response', async (d) => {
      const res = this._balanza(d);
      if (res.status !== 200) this.eventBus?.publish('mayor-balanza.balanza.failed', res);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): un asiento quedo en el libro (B2) ──
  // Deriva y acumula; NO publica response (no es RPC).
  onAsientoAsentado(e) {
    const d = (e && (e.data || e)) || {};
    try {
      const pid = d.project_id || this.project_id;
      if (!pid) return;
      const asiento = d.asiento || null;
      if (!asiento) return;
      this._acumular(pid, asiento);
    } catch (err) {
      this.logger?.error(`${this.name}.asiento_asentado.error`, { error: err.message });
    }
  }

  // Acumula un asiento en el mayor derivado (solo lectura del diario).
  _acumular(pid, asiento) {
    const lineas = Array.isArray(asiento.lineas) ? asiento.lineas : [];
    const mayor = this._mayor(pid);
    for (const l of lineas) {
      if (!l || typeof l !== 'object') continue;
      const cuenta = l.cuenta != null ? String(l.cuenta) : null;
      const clave = cuenta || '(sin_cuenta)';
      const acc = mayor.get(clave) || { cuenta, debe: 0, haber: 0, movimientos: 0 };
      acc.debe = this._round(acc.debe + this._num(l.debe), 2);
      acc.haber = this._round(acc.haber + this._num(l.haber), 2);
      acc.movimientos += 1;
      mayor.set(clave, acc);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // saldos(filtro?) → saldos por cuenta derivados del diario
  // ══════════════════════════════════════════════════════════════════════
  _saldos(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const mayor = this._mayores.get(pid);
    let cuentas = mayor ? [...mayor.values()] : [];

    const prefijo = input.prefijo != null ? String(input.prefijo).trim() : '';
    const cuenta = input.cuenta != null ? String(input.cuenta).trim() : '';
    if (prefijo) cuentas = cuentas.filter((c) => c.cuenta && c.cuenta.startsWith(prefijo));
    if (cuenta) cuentas = cuentas.filter((c) => c.cuenta === cuenta);

    const saldos = cuentas.map((c) => ({
      cuenta: c.cuenta,
      debe: c.debe,
      haber: c.haber,
      saldo: this._round(c.debe - c.haber, 2),
      movimientos: c.movimientos
    }));

    const totalDebe = this._round(saldos.reduce((a, s) => a + s.debe, 0), 2);
    const totalHaber = this._round(saldos.reduce((a, s) => a + s.haber, 0), 2);
    const sinCuenta = mayor ? (mayor.get('(sin_cuenta)') || null) : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        saldos,
        num_cuentas: saldos.length,
        total_debe: totalDebe,
        total_haber: totalHaber,
        cuadra: Math.abs(this._round(totalDebe - totalHaber, 2)) <= 0.005,
        determinista: true,
        abierto: {
          mayor: saldos.length ? null : 'no hay asientos derivados todavia (el mayor esta vacio; no se inventa)',
          sin_cuenta: sinCuenta
            ? `hay ${sinCuenta.movimientos} movimiento(s) sin cuenta declarada (se agrupan aparte, no se imputan a una cuenta inventada)`
            : null
        }
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // balanza() → balanza de comprobacion (sumas y saldos por cuenta)
  // ══════════════════════════════════════════════════════════════════════
  _balanza(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const base = this._saldos({ project_id: pid });
    const filas = base.data.saldos.map((s) => ({
      cuenta: s.cuenta,
      suma_debe: s.debe,
      suma_haber: s.haber,
      saldo_deudor: s.saldo > 0 ? s.saldo : 0,
      saldo_acreedor: s.saldo < 0 ? this._round(-s.saldo, 2) : 0
    }));

    return {
      status: 200,
      data: {
        project_id: pid,
        balanza: filas,
        num_cuentas: filas.length,
        total_debe: base.data.total_debe,
        total_haber: base.data.total_haber,
        // La balanza CUADRA cuando las sumas de debe y haber coinciden (la partida doble lo garantiza).
        cuadra: base.data.cuadra,
        determinista: true,
        abierto: base.data.abierto
      }
    };
  }

  _mayor(pid) {
    let m = this._mayores.get(pid);
    if (!m) { m = new Map(); this._mayores.set(pid, m); }
    return m;
  }

  _num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  // ── Tools ──
  toolSaldos(params) { return this._saldos(params); }
  toolBalanza(params) { return this._balanza(params); }
}

module.exports = MayorBalanza;

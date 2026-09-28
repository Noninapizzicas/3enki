/**
 * contabilidad/mayor-balanza — REFLEJO STATELESS (B3, hoja del plan).
 *
 * LOS SALDOS SE DERIVAN DEL DIARIO. Nunca un almacen paralelo: este modulo NO
 * muta nada — recibe el diario (por EVENTO o en el payload) y calcula saldos,
 * balanza (sumas y saldos) y movimientos por cuenta. Determinista: mismas
 * entradas → mismo mayor (un test lo afirma). "El asiento original no se borra":
 * la balanza refleja la suma de TODO lo asentado.
 *
 * REFLEJO (patron real, stateless): sin PosPersistencia ni project.activated.
 * Cada op entra objeto, sale objeto. El diario lo da escritor-diario (B2) por
 * EVENTO `contabilidad.diario.leer.request` si no viene en el payload (contrato
 * TOLERANTE: si no responde, se DECLARA la dependencia no disponible y NUNCA se
 * emite un mayor inventado). Emisor/par de fallo: exito publica
 * contabilidad.balanza_calculada; error su par determinista.
 * NO REUTILIZA: derivacion del diario propia; ningun modulo del inventario lleva
 * mayor/balanza.
 *
 * Ver hoja B3 del diseno-oop y bloque `mayor-balanza` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class MayorBalanza extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'mayor-balanza';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless: sin store que persistir. El diario llega por payload o por EVENTO.
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC ──
  onSaldoRequest(e) {
    return this._atender(e, 'saldo', 'contabilidad.mayor.saldo.response', async (d) => {
      const res = await this._saldoPorCuenta(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.mayor.saldo.failed', res);
      return res;
    });
  }

  onBalanzaRequest(e) {
    return this._atender(e, 'balanza', 'contabilidad.mayor.balanza.response', async (d) => {
      const res = await this._balanza(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.balanza_calculada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.mayor.balanza.failed', res);
      }
      return res;
    });
  }

  onMovimientosRequest(e) {
    return this._atender(e, 'movimientos', 'contabilidad.mayor.movimientos.response', async (d) => {
      const res = await this._movimientosDe(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.mayor.movimientos.failed', res);
      return res;
    });
  }

  // ── proyecciones puras (deterministas) ──

  // El diario llega en el payload o se LEE de escritor-diario (B2) por EVENTO.
  // Sin diario NO se inventa: se declara la dependencia.
  async _diarioDe(pid, input) {
    const enPayload = (input && (input.diario || input.asientos)) || null;
    if (Array.isArray(enPayload)) return enPayload;
    if (enPayload && Array.isArray(enPayload.diario)) return enPayload.diario;
    const resp = await this._rpc('contabilidad.diario.leer.request', { project_id: pid }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200) return null;
    return (resp.data && (resp.data.diario || resp.data.asientos)) || [];
  }

  _enPeriodo(asiento, periodo) {
    if (!periodo) return true;
    return String(asiento.periodo || '') === String(periodo)
      || String(asiento.fecha_operacion || '').startsWith(String(periodo));
  }

  // saldoPorCuenta(periodo) -> Map<IdCuenta, Importe> (derivado; no muta).
  async _saldoPorCuenta(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const diario = await this._diarioDe(pid, input);
    if (diario === null) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'escritor-diario (B2) no respondio: no se deriva un mayor sin diario', {
          dependencia: 'escritor-diario', accion: 'NO_CALCULAR_PUBLICAR_FALLO'
        });
    }

    const periodo = (input && input.periodo) || null;
    const saldos = {};
    for (const asiento of diario) {
      if (!this._enPeriodo(asiento, periodo)) continue;
      const apuntes = Array.isArray(asiento.apuntes) ? asiento.apuntes : [];
      for (const a of apuntes) {
        const cuenta = a && a.cuenta;
        if (!cuenta) continue;
        const debe = Number(a.debe) || 0;
        const haber = Number(a.haber) || 0;
        if (!saldos[cuenta]) saldos[cuenta] = { cuenta, debe: 0, haber: 0, saldo: 0 };
        saldos[cuenta].debe = this._round(saldos[cuenta].debe + debe, 2);
        saldos[cuenta].haber = this._round(saldos[cuenta].haber + haber, 2);
        saldos[cuenta].saldo = this._round(saldos[cuenta].debe - saldos[cuenta].haber, 2);
      }
    }

    const lista = Object.values(saldos);
    return {
      status: 200,
      data: {
        project_id: pid,
        periodo,
        saldos: lista,
        por_cuenta: lista.reduce((acc, s) => { acc[s.cuenta] = s.saldo; return acc; }, {}),
        n_cuentas: lista.length,
        derivado_del_diario: true,
        determinista: true
      }
    };
  }

  // balanza(periodo) -> Balanza {sumas y saldos} (derivada; no muta).
  async _balanza(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const saldo = await this._saldoPorCuenta(input);
    if (saldo.status !== 200) return saldo;

    const lineas = saldo.data.saldos.map((s) => ({
      cuenta: s.cuenta,
      suma_debe: s.debe,
      suma_haber: s.haber,
      saldo_deudor: s.saldo > 0 ? s.saldo : 0,
      saldo_acreedor: s.saldo < 0 ? this._round(-s.saldo, 2) : 0
    }));

    const totalDebe = this._round(lineas.reduce((t, l) => t + l.suma_debe, 0), 2);
    const totalHaber = this._round(lineas.reduce((t, l) => t + l.suma_haber, 0), 2);
    const cuadra = Math.abs(totalDebe - totalHaber) < 0.005;

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo: saldo.data.periodo,
        balanza: {
          lineas,
          total_debe: totalDebe,
          total_haber: totalHaber,
          total_saldo_deudor: this._round(lineas.reduce((t, l) => t + l.saldo_deudor, 0), 2),
          total_saldo_acreedor: this._round(lineas.reduce((t, l) => t + l.saldo_acreedor, 0), 2),
          cuadra
        },
        n_cuentas: lineas.length,
        derivado_del_diario: true,
        determinista: true,
        nota: 'la balanza refleja la suma de TODO lo asentado: el asiento original no se borra'
      }
    };
  }

  // movimientosDe(cuenta, periodo) -> List<Apunte> (derivado; no muta).
  async _movimientosDe(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const cuenta = input && (input.cuenta || input.id_cuenta);
    if (!cuenta) return this._invalid('cuenta');

    const diario = await this._diarioDe(pid, input);
    if (diario === null) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'escritor-diario (B2) no respondio: no se derivan movimientos sin diario', {
          dependencia: 'escritor-diario', accion: 'NO_CALCULAR_PUBLICAR_FALLO'
        });
    }

    const periodo = (input && input.periodo) || null;
    const movimientos = [];
    for (const asiento of diario) {
      if (!this._enPeriodo(asiento, periodo)) continue;
      const apuntes = Array.isArray(asiento.apuntes) ? asiento.apuntes : [];
      for (const a of apuntes) {
        if (!a || a.cuenta !== cuenta) continue;
        movimientos.push({
          asiento_id: asiento.id,
          clave_natural: asiento.clave_natural,
          tipo: asiento.tipo,
          fecha_operacion: asiento.fecha_operacion || null,
          debe: this._round(Number(a.debe) || 0, 2),
          haber: this._round(Number(a.haber) || 0, 2)
        });
      }
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        cuenta,
        periodo,
        movimientos,
        n: movimientos.length,
        derivado_del_diario: true
      }
    };
  }

  // ── Tools ──
  toolSaldoPorCuenta(params) { return this._saldoPorCuenta(params); }
  toolBalanza(params) { return this._balanza(params); }
  toolMovimientosDe(params) { return this._movimientosDe(params); }
}

module.exports = MayorBalanza;

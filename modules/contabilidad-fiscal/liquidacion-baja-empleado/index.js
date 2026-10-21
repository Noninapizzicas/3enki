/**
 * contabilidad-fiscal/liquidacion-baja-empleado — REFLEJO STATELESS (G10, hoja del plan).
 *
 * CIERRE DE LA CUENTA DEL TRABAJADOR: finiquito + indemnizacion de la baja, para que NO
 * quede un acreedor abierto. Determinista: mismos conceptos declarados → mismo finiquito.
 *
 * No calcula la nomina ordinaria (eso es `lineas-nomina`/`recibo-nomina`): aqui se LIQUIDA
 * la relacion (salario pendiente + vacaciones no disfrutadas + indemnizacion − retenciones
 * IRPF/SS − anticipos = NETO a pagar). SUBE por EVENTO a `cuenta-proveedor.saldo.request`
 * para leer lo que aun se le debe al trabajador y comprobar que la liquidacion lo CIERRA.
 * Quien ESCRIBE el libro es escritor-diario (B2, single-writer): esta hoja solo SUBE el
 * asiento por EVENTO `escritor-diario.asentar.request` si su construccion se puede hacer
 * (cuentas declaradas); si no, lo declara y NO inventa el apunte.
 *
 * Honestidad (invariante 13): sin salario_dia (o sin dias) NO se estima la indemnizacion;
 * lo no declarado queda en `abierto`. Un acreedor que NO se cierra con la liquidacion NO se
 * finge cerrado: se declara el remanente.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. PREGUNTA (liquidar) → sin ui_handler.
 * Ver hoja G10 del plan-construccion y diseno-oop.md (CLASE LiquidacionBajaEmpleado).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const EPSILON = 0.005;

class LiquidacionBajaEmpleado extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'liquidacion-baja-empleado';
    this.version = 'reflejo-0.1.0';
    this._vistos = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onLiquidarRequest(e) {
    return this._atender(e, 'liquidar', 'liquidacion-baja-empleado.liquidar.response', async (d) => {
      const res = await this._liquidar(d);
      // Reflejo: liquida; no escribe el libro (lo hace B2) → no hay hecho de dominio que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('liquidacion-baja-empleado.liquidar.failed', res);
      else this._subirAsiento(res, d);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): se recibio una nomina (G5 puerto-nomina) ──
  onNominaRecibida(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id || this.project_id;
    if (!pid) return;
    let arr = this._vistos.get(pid);
    if (!arr) { arr = []; this._vistos.set(pid, arr); }
    if (d.nomina) arr.push(d.nomina);
    if (arr.length > 1000) arr.shift();
  }

  // ══════════════════════════════════════════════════════════════════════
  // liquidar(empleado) → finiquito/indemnizacion y cierre de la cuenta
  // ══════════════════════════════════════════════════════════════════════
  async _liquidar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const empleado = input.empleado != null ? String(input.empleado).trim()
      : (input.tercero != null ? String(input.tercero).trim()
      : (input.trabajador != null ? String(input.trabajador).trim() : ''));
    if (!empleado) return this._invalid('empleado');

    const salarioDia = this._num(input.salario_dia);
    const dias = this._num(input.dias);
    const diasVacaciones = this._num(input.dias_vacaciones);
    const anios = this._num(input.anios);
    const diasPorAnio = this._num(input.dias_por_anio != null ? input.dias_por_anio : input.dias_indemnizacion);

    // Salario pendiente: declarado, o derivado de los dias si hay salario_dia.
    let salarioPendiente = this._num(input.salario_pendiente);
    if (salarioPendiente == null && salarioDia != null && dias != null) salarioPendiente = this._round(salarioDia * dias, 2);

    // Vacaciones no disfrutadas.
    let vacaciones = this._num(input.vacaciones);
    if (vacaciones == null && salarioDia != null && diasVacaciones != null) vacaciones = this._round(salarioDia * diasVacaciones, 2);

    // Indemnizacion: declarada, o derivada de anios × dias_por_anio × salario_dia.
    let indemnizacion = this._num(input.indemnizacion);
    if (indemnizacion == null && salarioDia != null && anios != null && diasPorAnio != null) {
      indemnizacion = this._round(anios * diasPorAnio * salarioDia, 2);
    }

    const conceptos = [
      { concepto: 'salario_pendiente', importe: salarioPendiente },
      { concepto: 'vacaciones_no_disfrutadas', importe: vacaciones },
      { concepto: 'indemnizacion', importe: indemnizacion }
    ];
    const ausentes = conceptos.filter((c) => c.importe == null).map((c) => c.concepto);
    const bruto = this._round(conceptos.reduce((t, c) => t + (c.importe || 0), 0), 2);

    const irpfPct = this._num(input.irpf_pct) || 0;
    const ssPct = this._num(input.ss_pct) || 0;
    const retencionIrpf = this._round(bruto * irpfPct / 100, 2);
    const retencionSs = this._round(bruto * ssPct / 100, 2);
    const anticipos = this._round(this._num(input.anticipos) || 0, 2);
    const neto = this._round(bruto - retencionIrpf - retencionSs - anticipos, 2);

    // Lo que aun se le debe (acreedor): se LEE de cuenta-proveedor por EVENTO (best-effort).
    const { saldo, fuente } = await this._saldoTrabajador(input, empleado);
    const remanente = saldo != null ? this._round(saldo - neto, 2) : null;
    const cierra = remanente != null ? Math.abs(remanente) <= EPSILON : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'liquidacion-baja-empleado',
        empleado,
        fecha_baja: input.fecha_baja != null ? String(input.fecha_baja) : null,
        conceptos,
        bruto,
        retencion_irpf: retencionIrpf,
        retencion_ss: retencionSs,
        anticipos,
        neto_pagar: neto,
        saldo_trabajador: saldo,
        fuente_saldo: fuente || null,
        remanente,
        cierra_cuenta: cierra,
        formula: 'BRUTO - IRPF - SS - ANTICIPOS = NETO_A_PAGAR',
        determinista: true,
        abierto: {
          conceptos_ausentes: ausentes.length ? `${ausentes.join(', ')} sin declarar (ni importe ni datos para derivarlos): no se estiman` : null,
          saldo: saldo == null ? 'no se obtuvo el saldo del trabajador (ni declarado ni de cuenta-proveedor): no se puede afirmar que la cuenta se cierre' : null,
          remanente: (remanente != null && !cierra && remanente > 0) ? 'el acreedor NO se cierra con esta liquidacion: queda remanente (no se finge cerrado)' : null
        }
      }
    };
  }

  // SUBE por EVENTO el asiento SOLO si se puede construir (cuentas declaradas). Quien escribe
  // el libro es B2 (single-writer): esta hoja no lo toca.
  _subirAsiento(res, d) {
    const asiento = this._construirAsiento(res.data, d);
    if (!asiento) return;
    try {
      this.eventBus?.publish('escritor-diario.asentar.request', {
        project_id: res.data.project_id,
        asiento,
        origen: 'liquidacion-baja-empleado',
        correlation_id: d && d.correlation_id
      });
    } catch (_) { /* best-effort */ }
  }

  _construirAsiento(data, input) {
    const lineas = Array.isArray(input.asiento && input.asiento.lineas) ? input.asiento.lineas : null;
    if (lineas) return input.asiento;               // el llamante ya declara el asiento: no se re-inventa
    const cuentas = input.cuentas && typeof input.cuentas === 'object' ? input.cuentas : null;
    if (!cuentas || !cuentas.debe || !cuentas.haber) return null;  // sin cuentas declaradas NO se inventa el apunte
    if (!(data.bruto > 0)) return null;
    return {
      fecha: data.fecha_baja || new Date().toISOString().slice(0, 10),
      referencia: `LIQ-${data.empleado}`,
      lineas: [
        { cuenta: String(cuentas.debe), debe: data.bruto, haber: 0, concepto: 'liquidacion baja empleado' },
        { cuenta: String(cuentas.haber), debe: 0, haber: this._round(data.bruto - data.retencion_irpf - data.retencion_ss, 2), concepto: 'neto acreedor trabajador' }
      ].filter((l) => l.debe > 0 || l.haber > 0)
    };
  }

  async _saldoTrabajador(input, empleado) {
    if (input.saldo_trabajador != null) return { saldo: this._num(input.saldo_trabajador), fuente: 'declarado' };
    const resp = await this._rpc('cuenta-proveedor.saldo.request', {
      project_id: input.project_id || this.project_id, tercero: empleado, ejercicio: input.ejercicio
    }, { timeout_ms: 3000 });
    const d = resp && (resp.data || resp);
    if (!d || d.status === 404) return { saldo: null, fuente: null };
    return { saldo: this._num(d.saldo), fuente: 'cuenta-proveedor' };
  }

  _num(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolLiquidar(params) { return this._liquidar(params); }
}

module.exports = LiquidacionBajaEmpleado;

/**
 * contabilidad-fiscal/liquidacion-baja-empleado — REFLEJO STATELESS (G10, hoja del plan).
 *
 * CIERRE DE LA CUENTA DEL TRABAJADOR (finiquito / indemnizacion) PARA QUE NO QUEDE UN ACREEDOR
 * ABIERTO. El diseno lo dice literal: `liquidar(...):Asiento`, con `empleado:Empleado`.
 * Calculo PURO, determinista: mismos conceptos declarados → misma liquidacion.
 *
 * ESTE MODULO NO DECIDE: no decide la indemnizacion, no decide los dias de vacaciones, no decide
 * si procede un finiquito. TODOS los conceptos llegan DECLARADOS (importe + signo), y el reflejo
 * los agrega. La indemnizacion/el finiquito son DATO: el derecho lo declara quien sabe (la ley, el
 * convenio, el acuerdo) — aqui no se cablea ninguna formula legal.
 *
 * LA CUENTA SE CIERRA CONTRA LO ENTREGADO A CUENTA: el saldo de anticipos pendientes se trae de
 * pagos-a-cuenta-empleado (G8) POR EVENTO (o declarado), y se RESTA del bruto de liquidacion.
 * Asi la cuenta del trabajador queda a cero y no hay acreedor abierto.
 *
 * AISLAMIENTO PERSONA↔PERSONA (invariante dura): si la consulta la hace una PERSONA distinta del
 * titular, se consulta a acceso-nomina (G7) POR EVENTO y, si NO autoriza, se DENIEGA (403).
 *
 * Invariante: dato ausente = desconocido. Un concepto sin importe queda `null` y se declara en
 * `faltantes`; jamas se rellena con 0 ni se estima una indemnizacion.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja G10 del plan-construccion y diseno-oop.md (CLASE LiquidacionBajaEmpleado).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class LiquidacionBajaEmpleado extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'liquidacion-baja-empleado';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onLiquidarRequest(e) {
    return this._atender(e, 'liquidar', 'liquidacion-baja-empleado.liquidar.response', async (d) => {
      const res = await this._liquidar(d);
      if (res.status !== 200) this.eventBus?.publish('liquidacion-baja-empleado.liquidar.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: liquidar(conceptos declarados, anticipos) → Asiento de cierre ──
  async _liquidar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const empleado = input.empleado != null ? String(input.empleado) : null;

    // AISLAMIENTO PERSONA↔PERSONA: si pregunta una persona distinta del titular, G7 decide.
    const aislamiento = await this._aislamiento(pid, input, empleado);
    if (aislamiento && aislamiento.permitido === false) {
      return this._errorResponse(403, 'AISLAMIENTO_PERSONA',
        'la nomina es dato personal: sin encargo declarado no se ve la de otro (aislamiento persona-a-persona)',
        { quien: aislamiento.quien, empleado: aislamiento.empleado, alcance: aislamiento.alcance });
    }

    const faltantes = [];

    // 1) Los CONCEPTOS de liquidacion, TODOS declarados (el modulo no decide ninguno).
    const raw = this._conceptosRaw(input);
    const conceptos = raw.map((c, i) => {
      const obj = (c && typeof c === 'object') ? c : { concepto: c, importe: null };
      const importe = this._num(obj.importe);
      if (importe === null) faltantes.push(`conceptos[${i}].importe`);
      return {
        concepto: obj.concepto != null ? String(obj.concepto) : null,
        importe,
        signo: this._signo(obj.signo),           // declara si suma o resta (no se supone legal)
        clase: obj.clase != null ? String(obj.clase) : null
      };
    });
    if (conceptos.length === 0) faltantes.push('conceptos');

    // Los conceptos que no vengan sueltos se admiten tambien en campos con nombre declarado.
    for (const campo of ['indemnizacion', 'vacaciones', 'pagas_extra', 'finiquito']) {
      const v = input[campo] !== undefined && input[campo] !== null && typeof input[campo] === 'object'
        ? this._num(input[campo].importe) : this._num(input[campo]);
      if (v !== null) {
        conceptos.push({ concepto: campo, importe: v, signo: this._signo((input[campo] && input[campo].signo) || 1), clase: 'declarado' });
      }
    }

    const completos = conceptos.filter((c) => c.importe !== null);
    const bruto_liquidacion = conceptos.length > 0 && completos.length === conceptos.length
      ? this._round(completos.reduce((s, c) => s + c.importe * c.signo, 0), 2) : null;

    // 2) SALDO PENDIENTE de pagos a cuenta (G8) POR EVENTO — o declarado. Resta del bruto.
    const anticipos = await this._anticipos(pid, input, empleado);
    if (anticipos.pendiente === null && anticipos.pedido) faltantes.push('anticipos_pendientes');

    // 3) TOTAL a liquidar = bruto declarado − anticipos pendientes. Sin piezas → [ABIERTO].
    const neto_liquidacion = (bruto_liquidacion !== null && anticipos.pendiente !== null)
      ? this._round(bruto_liquidacion - anticipos.pendiente, 2) : null;

    // 4) El asiento de cierre: partidas declaradas (rol + cuenta declarable) + la del anticipo.
    const partidas = conceptos
      .filter((c) => c.importe !== null)
      .map((c) => ({ concepto: c.concepto, cuenta: null, rol: 'liquidacion', importe: c.importe, signo: c.signo }));
    if (anticipos.pendiente !== null && anticipos.pendiente !== 0) {
      partidas.push({ concepto: 'anticipos_pendientes', cuenta: null, rol: 'anticipo_a_descontar', importe: -anticipos.pendiente, signo: -1 });
    }
    const suma_debe = this._round(partidas.filter((p) => p.importe > 0).reduce((s, p) => s + p.importe, 0), 2);
    const suma_haber = this._round(partidas.filter((p) => p.importe < 0).reduce((s, p) => s + Math.abs(p.importe), 0), 2);
    const completa = faltantes.length === 0;

    return {
      status: 200,
      data: {
        project_id: pid,
        empleado,
        fecha_baja: input.fecha_baja != null ? String(input.fecha_baja) : (input.fecha != null ? String(input.fecha) : null),
        conceptos,
        bruto_liquidacion,
        anticipos,
        neto_liquidacion,
        asiento: {
          clase: 'liquidacion_baja',
          empleado,
          partidas,
          total_debe: suma_debe,
          total_haber: suma_haber,
          // La cuenta del trabajador queda cerrada: no queda acreedor abierto.
          acreedor_cerrado: completa && neto_liquidacion !== null,
          // Las cuentas son DECLARABLES: aqui no se cablea ningun numero del PGC.
          cuentas_cableadas: false
        },
        // El modulo NO decide la indemnizacion ni el derecho: solo agrega lo declarado.
        decide: false,
        aplica_declarado: true,
        calculo_puro: true,
        faltantes,
        abierto: faltantes.length > 0,
        motivo: faltantes.length > 0
          ? `hay piezas declaradas incompletas: ${faltantes.join(', ')} (nada se estima)`
          : null
      }
    };
  }

  _conceptosRaw(input = {}) {
    if (Array.isArray(input.conceptos)) return input.conceptos;
    if (input.concepto !== undefined && input.concepto !== null) return [input.concepto];
    return [];
  }

  // Los ANTICIPOS pendientes: declarados en la peticion, o pedidos a pagos-a-cuenta-empleado (G8) POR EVENTO.
  async _anticipos(pid, input = {}, empleado) {
    const declarado = this._num(
      input.anticipos_pendientes != null ? input.anticipos_pendientes
        : (input.anticipos && !Array.isArray(input.anticipos) ? input.anticipos.importe : undefined)
    );
    if (declarado !== null) return { pendiente: declarado, origen: 'declarado' };
    if (Array.isArray(input.anticipos)) {
      const arr = input.anticipos.map((a) => this._num(a && (a.importe != null ? a.importe : a))).filter((n) => n !== null);
      return { pendiente: this._round(arr.reduce((s, n) => s + n, 0), 2), origen: 'declarado' };
    }

    const r = await this._rpc('pagos-a-cuenta-empleado.impacto.request',
      { project_id: pid, empleado, recibo: input.recibo, quien: input.quien }, { timeout_ms: 4000 });
    const d = r && r.data ? r.data : null;
    if (d && d.saldo_pendiente !== undefined && d.saldo_pendiente !== null) {
      // Lo ENTREGADO a cuenta es lo que ya se pago de mas: el pendiente por devengar es el anticipo.
      const entregado = this._num(d.anticipos_total);
      return { pendiente: entregado !== null ? entregado : this._num(d.saldo_pendiente), origen: 'pagos-a-cuenta-empleado', saldo: this._num(d.saldo_pendiente) };
    }
    return { pendiente: null, origen: null, pedido: true };
  }

  // G7 POR EVENTO: la nomina es dato personal; no hay puerta lateral.
  async _aislamiento(pid, input, empleado) {
    const quien = input.quien != null ? String(input.quien) : (input.persona != null ? String(input.persona) : null);
    if (!quien) return { aplicado: false, motivo: 'sin sujeto declarado (consulta del sistema)' };
    if (empleado !== null && quien === empleado) {
      return { aplicado: true, quien, empleado, es_propia: true, permitido: true, motivo: 'cada uno ve la suya (eje persona)' };
    }
    const r = await this._rpc('acceso-nomina.autorizar.request', { project_id: pid, quien, empleado }, { timeout_ms: 4000 });
    const d = r && r.data ? r.data : null;
    if (!d) {
      return { aplicado: true, quien, empleado, es_propia: false, permitido: false,
        motivo: 'G7 no respondio: sin autorizacion declarada no se sirve la nomina de otro' };
    }
    return { aplicado: true, quien, empleado, es_propia: !!d.es_propia, alcance: d.alcance, permitido: d.permitido === true, motivo: d.motivo || null };
  }

  _signo(raw) {
    if (raw === undefined || raw === null || raw === '') return 1;
    if (typeof raw === 'number') return raw < 0 ? -1 : 1;
    const s = String(raw).trim().toLowerCase();
    if (s === '-1' || s === '-' || s === 'negativo' || s === 'deduccion' || s === 'debe') return -1;
    return 1;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolLiquidar(params) { return this._liquidar(params); }
}

module.exports = LiquidacionBajaEmpleado;

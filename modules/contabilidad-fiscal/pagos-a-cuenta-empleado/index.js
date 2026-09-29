/**
 * contabilidad-fiscal/pagos-a-cuenta-empleado — REFLEJO STATELESS (G8, hoja del plan).
 *
 * ANTICIPOS / ENTREGAS A CUENTA Y SU IMPACTO EN EL NETO Y EL IRPF. No todo es sueldo fijo.
 * El diseno lo dice literal: `impacto(n:ReciboNomina):Cuantía`, con `anticipos:Set<Anticipo>`.
 * Calculo PURO, determinista: mismo neto declarado + mismos anticipos → mismo saldo pendiente.
 *
 * ESTE MODULO NO DECIDE: no aprueba el anticipo, no lo paga y no recalcula el IRPF. Deriva el
 * IMPACTO declarado: cuanto se entrego a cuenta y que SALDO PENDIENTE queda sobre el neto del
 * recibo. El neto se COPIA del recibo (lo calculo el sistema externo).
 *
 * LO QUE IMPACTA ES DECLARABLE: que concepto sufre el pago a cuenta (`concepto_pago_a_cuenta`:
 * por defecto el neto) y la NATURALEZA de cada anticipo (anticipo / entrega / retribucion_flexible)
 * los declara el negocio. Cero tipos cableados.
 *
 * AISLAMIENTO PERSONA↔PERSONA (invariante dura): si la consulta la hace una PERSONA (`quien`
 * distinta del titular), se consulta a acceso-nomina (G7) POR EVENTO y, si NO autoriza, se
 * DENIEGA (403) — la nomina es dato personal y este reflejo no es una puerta lateral.
 *
 * Invariante: dato ausente = desconocido. Un anticipo sin importe queda `null` y se declara; sin
 * el neto del recibo, el saldo pendiente queda `[ABIERTO]` — no se estima.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja G8 del plan-construccion y diseno-oop.md (CLASE PagosACuentaEmpleado).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class PagosACuentaEmpleado extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'pagos-a-cuenta-empleado';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onImpactoRequest(e) {
    return this._atender(e, 'impacto', 'pagos-a-cuenta-empleado.impacto.response', async (d) => {
      const res = await this._impacto(d);
      if (res.status !== 200) this.eventBus?.publish('pagos-a-cuenta-empleado.impacto.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: impacto(neto del recibo, anticipos) → Cuantía (saldo pendiente) ──
  async _impacto(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const { recibo, recibos, origen_recibo } = await this._recibos(pid, input);
    const titular = this._titular(recibo, recibos, input);

    // AISLAMIENTO PERSONA↔PERSONA: si pregunta una persona distinta del titular, G7 decide.
    const aislamiento = await this._aislamiento(pid, input, titular);
    if (aislamiento && aislamiento.permitido === false) {
      return this._errorResponse(403, 'AISLAMIENTO_PERSONA',
        'la nomina es dato personal: sin encargo declarado no se ve la de otro (aislamiento persona-a-persona)',
        { quien: aislamiento.quien, empleado: aislamiento.empleado, alcance: aislamiento.alcance });
    }

    const faltantes = [];

    // 1) El NETO del recibo (o la suma de los recibos del periodo) — COPIADO, no calculado aqui.
    const netos = [];
    for (const r of recibos) {
      const n = this._num(r.neto);
      if (n === null) faltantes.push(`recibo(${r.clave_natural != null ? r.clave_natural : '?'}).neto`);
      else netos.push(n);
    }
    const neto_total = recibos.length > 0 && netos.length === recibos.length
      ? this._round(netos.reduce((s, n) => s + n, 0), 2)
      : (recibos.length === 0 ? null : null);
    if (recibos.length === 0) faltantes.push('recibo');

    // 2) Los ANTICIPOS declarados, tal cual: importe + su NATURALEZA declarada (cero tipos cableados).
    const raw_anticipos = Array.isArray(input.anticipos) ? input.anticipos
      : (input.anticipo ? [input.anticipo] : []);
    const anticipos = raw_anticipos.map((a, i) => {
      const obj = (a && typeof a === 'object') ? a : { importe: a };
      const importe = this._num(obj.importe);
      if (importe === null) faltantes.push(`anticipos[${i}].importe`);
      return {
        id: obj.id != null ? String(obj.id) : null,
        importe,
        naturaleza: obj.naturaleza != null ? String(obj.naturaleza) : (obj.tipo != null ? String(obj.tipo) : null),
        concepto: obj.concepto != null ? String(obj.concepto) : null,
        fecha: obj.fecha != null ? String(obj.fecha) : null,
        aprobado: obj.aprobado === true ? true : (obj.aprobado === false ? false : null)
      };
    });
    const con_importe = anticipos.filter((a) => a.importe !== null);
    const anticipos_total = anticipos.length === 0 ? 0
      : (con_importe.length === anticipos.length ? this._round(con_importe.reduce((s, a) => s + a.importe, 0), 2) : null);

    // 3) El SALDO PENDIENTE = neto − anticipos. Sin una de las dos piezas → [ABIERTO] (nada se estima).
    const completo = neto_total !== null && anticipos_total !== null;
    const saldo_pendiente = completo ? this._round(neto_total - anticipos_total, 2) : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        empleado: titular,
        periodo: input.periodo != null ? String(input.periodo) : (recibo ? recibo.periodo : null),
        origen_recibo,
        concepto_pago_a_cuenta: input.concepto_pago_a_cuenta != null ? String(input.concepto_pago_a_cuenta) : 'neto',
        // La NATURALEZA del anticipo es declarable: se declara de donde salio (no hay catalogo propio).
        naturaleza_origen: anticipos.some((a) => a.naturaleza !== null) ? 'declarada' : null,
        tipos_cableados: false,
        neto_total,
        anticipos,
        anticipos_total,
        saldo_pendiente,
        // Un saldo negativo se DECLARA (se entrego mas de lo devengado), no se recorta.
        excede_neto: saldo_pendiente !== null ? saldo_pendiente < 0 : null,
        // El modulo NO aprueba ni paga: lo declara.
        decide: false,
        paga: false,
        calculo_puro: true,
        aislamiento,
        faltantes,
        abierto: faltantes.length > 0,
        motivo: faltantes.length > 0
          ? `hay piezas declaradas incompletas: ${faltantes.join(', ')} (nada se estima)`
          : null
      }
    };
  }

  // Los recibos: declarados (recibo o lista) o pedidos a recibo-nomina (G1) POR EVENTO.
  async _recibos(pid, input = {}) {
    if (Array.isArray(input.recibos)) return { recibo: input.recibos[0] || null, recibos: input.recibos, origen_recibo: 'declarado' };
    const declarado = input.recibo || input.nomina || null;
    if (declarado && typeof declarado === 'object') return { recibo: declarado, recibos: [declarado], origen_recibo: 'declarado' };

    const clave = input.clave_natural != null ? String(input.clave_natural) : null;
    if (clave || (input.empleado != null && input.periodo != null)) {
      const r = await this._rpc('recibo-nomina.dar_forma.request', {
        project_id: pid, clave_natural: clave, empleado: input.empleado, periodo: input.periodo
      }, { timeout_ms: 4000 });
      const rec = r && r.data ? r.data.recibo : null;
      if (rec) return { recibo: rec, recibos: [rec], origen_recibo: 'recibo-nomina' };
    }
    return { recibo: null, recibos: [], origen_recibo: null };
  }

  _titular(recibo, recibos, input) {
    if (recibo && recibo.empleado != null) return String(recibo.empleado);
    const enLista = recibos.find((r) => r && r.empleado != null);
    if (enLista) return String(enLista.empleado);
    return input.empleado != null ? String(input.empleado) : null;
  }

  // Consulta a acceso-nomina (G7) POR EVENTO: no es una puerta lateral a la nomina de otro.
  async _aislamiento(pid, input, titular) {
    const quien = input.quien != null ? String(input.quien) : (input.persona != null ? String(input.persona) : null);
    // Sin sujeto declarado (consulta del sistema/negocio) no hay aislamiento que aplicar aqui.
    if (!quien) return { aplicado: false, motivo: 'sin sujeto declarado (consulta del sistema)' };
    if (titular !== null && quien === titular) {
      return { aplicado: true, quien, empleado: titular, es_propia: true, permitido: true, motivo: 'cada uno ve la suya (eje persona)' };
    }
    const r = await this._rpc('acceso-nomina.autorizar.request',
      { project_id: pid, quien, empleado: titular }, { timeout_ms: 4000 });
    const d = r && r.data ? r.data : null;
    if (!d) {
      // Sin respuesta de G7 NO se concede de buena fe: la nomina es dato personal.
      return { aplicado: true, quien, empleado: titular, es_propia: false, permitido: false,
        motivo: 'G7 no respondio: sin autorizacion declarada no se sirve la nomina de otro' };
    }
    return { aplicado: true, quien, empleado: titular, es_propia: !!d.es_propia, alcance: d.alcance, permitido: d.permitido === true, motivo: d.motivo || null };
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolImpacto(params) { return this._impacto(params); }
}

module.exports = PagosACuentaEmpleado;

/**
 * contabilidad/periodificacion — REFLEJO STATELESS (C3, hoja del plan).
 *
 * DEVENGO vs CAJA: imputa cada hecho a su PERIODO con el CRITERIO DECLARADO
 * (nunca cableado) y CONSERVA las DOS fechas (fecha_operacion != fecha_valor).
 * No elige ni adivina: si no hay criterio declarado, no se inventa el periodo —
 * el hecho va a cola de declaracion de criterio (K9 cola-declaraciones-criterio,
 * por EVENTO). Determinista: mismo hecho + mismo criterio → mismo periodo.
 *
 * REFLEJO (patron real, stateless): sin PosPersistencia ni project.activated.
 * Cada op entra objeto, sale objeto. La dependencia con la cola de criterios
 * (K9) es por EVENTO `contabilidad.criterio.leer.request` (contrato TOLERANTE:
 * si no responde, el periodo queda PENDIENTE_DE_CRITERIO, no inventado).
 * Emisor/par de fallo: exito publica contabilidad.periodo_imputado; error su par
 * determinista. NO REUTILIZA: la periodificacion con dos fechas y criterio
 * declarable es propia de la vertical.
 *
 * Ver hoja C3 del diseno-oop y bloque `periodificacion` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Criterios de imputacion DECLARABLES (el sistema no los asume).
const CRITERIOS = ['DEVEGO', 'CAJA', 'FECHA_OPERACION', 'FECHA_VALOR'];

class Periodificacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'periodificacion';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless: sin store que persistir (el criterio vive en K9).
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC ──
  onImputarRequest(e) {
    return this._atender(e, 'imputar', 'contabilidad.periodo.imputar.response', async (d) => {
      const res = await this._imputarPeriodo(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.periodo_imputado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.periodo.imputar.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras (deterministas) ──
  _norm(v) { return (v === undefined || v === null || v === '') ? null : String(v); }

  // conservarFechas(hecho) -> (fechaOperacion, fechaValor). NUNCA se colapsan.
  _conservarFechas(hecho) {
    const f = hecho || {};
    const fechaOperacion = this._norm(f.fecha_operacion || f.fechaOperacion || f.fecha);
    const fechaValor = this._norm(f.fecha_valor || f.fechaValor || f.fecha_operacion || f.fechaOperacion || f.fecha);
    return {
      fecha_operacion: fechaOperacion,
      fecha_valor: fechaValor,
      colapsadas: fechaOperacion === fechaValor,
      conservadas: fechaOperacion !== null || fechaValor !== null
    };
  }

  // El criterio lo DECLARA el negocio/asesor; se lee dela cola (K9) por EVENTO.
  async _criterioDe(pid, input) {
    const enPayload = (input && (input.criterio || input.criterio_periodo)) || null;
    if (enPayload) return { criterio: String(enPayload).toUpperCase(), origen: 'PAYLOAD' };
    const resp = await this._rpc('contabilidad.criterio.leer.request', {
      project_id: pid, criterio: 'periodificacion'
    }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200) return null;
    const valor = (resp.data && (resp.data.criterio || resp.data.valor)) || null;
    return valor ? { criterio: String(valor).toUpperCase(), origen: 'K9' } : null;
  }

  // imputarPeriodo(hecho) -> IdPeriodo (con el criterio declarado; nunca inventado).
  async _imputarPeriodo(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const hecho = (input && (input.hecho || input.hecho_normalizado)) || null;
    if (!hecho || typeof hecho !== 'object') return this._invalid('hecho');

    const fechas = this._conservarFechas(hecho);
    if (!fechas.conservadas) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'el hecho no trae fechas: no se inventa el periodo', {
          senal: 'SIN_FECHAS'
        });
    }

    const declarado = await this._criterioDe(pid, input);
    if (!declarado) {
      // Sin criterio NO se elige ni se adivina: el hecho va a cola (K9).
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'el criterio de periodificacion no esta declarado (K9): no se elige ni se adivina', {
          senal: 'CRITERIO_NO_DECLARADO',
          accion: 'el hecho va a cola de declaracion de criterio',
          fechas
        });
    }

    const criterio = declarado.criterio;
    if (!CRITERIOS.includes(criterio)) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        `criterio de periodificacion no declarable: ${criterio}`, {
          criterios_declarables: CRITERIOS, senal: 'CRITERIO_NO_DECLARABLE'
        });
    }

    // DEVEGNO -> fecha_operacion; CAJA -> fecha_valor (una misma fecha por defecto).
    const fechaBase = (criterio === 'CAJA' || criterio === 'FECHA_VALOR')
      ? (fechas.fecha_valor || fechas.fecha_operacion)
      : (fechas.fecha_operacion || fechas.fecha_valor);

    const periodo = fechaBase ? String(fechaBase).slice(0, 7) : null;   // YYYY-MM
    if (!periodo) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'no se pudo derivar el periodo de las fechas del hecho', { fechas, criterio });
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo,
        criterio,
        criterio_origen: declarado.origen,
        fecha_operacion: fechas.fecha_operacion,
        fecha_valor: fechas.fecha_valor,
        fechas_conservadas: true,
        fecha_imputada: fechaBase,
        determinista: true,
        nota: 'se conservan las DOS fechas (operacion != valor); el criterio lo declara el negocio'
      }
    };
  }

  // ── Tools ──
  toolImputarPeriodo(params) { return this._imputarPeriodo(params); }
  toolConservarFechas(params) { return this._conservarFechas(params.hecho || params); }
}

module.exports = Periodificacion;

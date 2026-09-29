/**
 * contabilidad-libro/periodificacion — REFLEJO STATELESS (C3, hoja del plan).
 *
 * Imputa cada hecho a su PERIODO con el CRITERIO DECLARADO (devengo vs caja).
 * Los criterios son PARÁMETROS DECLARABLES, no constantes cableadas: sin criterio
 * declarado no se elige — se declara `elegido:false` y se conservan ambas fechas.
 *
 * Invariante (C3): CONSERVA la fecha de operación y la fecha valor; NO elige por su
 * cuenta. Se puede pedir la imputación por devengo (fecha_operacion) o por caja
 * (fecha_valor) declarándolo; si no se declara, no se decide en silencio.
 *
 * Determinista: mismo hecho + mismo criterio → mismo periodo. No muta el hecho.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja C3 del plan-construccion y diseno-oop.md (CLASE Periodificacion).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Criterios declarables conocidos (el DATO, no la constante). Se puede declarar otro.
const CRITERIOS = { DEVENGO: 'fecha_operacion', CAJA: 'fecha_valor' };
// Unidad de cierre por defecto (declarable): el periodo al que se imputa.
const UNIDAD_DEFECTO = 'mes';

class Periodificacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'periodificacion';
    this.version = 'reflejo-0.1.0';
    // espejo en memoria de los hechos (fallback si no viene el hecho en el payload)
    this._espejo = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── fire-and-forget: el diario registró un asiento → se refleja la muestra del hecho ──
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
  onImputarRequest(e) {
    return this._atender(e, 'imputar', 'periodificacion.imputar.response', async (d) => {
      const res = this._imputar(d);
      if (res.status !== 200) this.eventBus?.publish('periodificacion.imputar.failed', res);
      return res;
    });
  }

  // ── IMPUTAR: cada hecho a su periodo con el criterio declarado (CONSERVA ambas fechas) ──
  _imputar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // El hecho puede venir en el payload; si no, se toma del espejo por su clave.
    let hecho = input.hecho || input.asiento || null;
    if (!hecho && input.clave_natural != null) hecho = this._espejoDe(pid).get(String(input.clave_natural)) || null;
    if (!hecho || typeof hecho !== 'object') return this._invalid('hecho');

    // ── CONSERVA las dos fechas; no elige. ──
    const fecha_operacion = this._fecha(
      input.fecha_operacion ?? hecho.fecha_operacion ?? hecho.fecha ?? null);
    const fecha_valor = this._fecha(
      input.fecha_valor ?? hecho.fecha_valor ?? hecho.fecha ?? null);

    // ── El CRITERIO es declarable (devengo|caja|declarado a mano). Sin criterio → no elige. ──
    const criterio = input.criterio != null ? String(input.criterio).toUpperCase() : null;
    const unidad = input.unidad_cierre != null ? String(input.unidad_cierre) : UNIDAD_DEFECTO;
    const campo = criterio && CRITERIOS[criterio] ? CRITERIOS[criterio]
      : (input.campo_fecha != null ? String(input.campo_fecha) : null);

    let elegido = false;
    let fecha_imputada = null;
    if (campo === 'fecha_operacion') { fecha_imputada = fecha_operacion; elegido = fecha_operacion != null; }
    else if (campo === 'fecha_valor') { fecha_imputada = fecha_valor; elegido = fecha_valor != null; }

    const periodo = elegido ? this._periodo(fecha_imputada, unidad) : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        clave_natural: hecho.clave_natural != null ? String(hecho.clave_natural) : null,
        // Se CONSERVAN las dos fechas aunque se elija una para imputar.
        fecha_operacion,
        fecha_valor,
        criterio: criterio,
        unidad_cierre: unidad,
        campo_fecha: campo,
        // Sin criterio declarado no se elige: se declara el [ABIERTO].
        elegido,
        fecha_imputada: elegido ? fecha_imputada : null,
        periodo,
        abierto: elegido ? [] : ['criterio'],
        motivo: elegido ? `imputado por ${criterio}` : 'sin criterio declarado: no se elige (devengo vs caja es una decisión, no un default)'
      }
    };
  }

  // Periodo determinista (YYYY-MM para mes, YYYY para año, YYYY-MM-DD para dia).
  _periodo(fecha, unidad) {
    if (!fecha) return null;
    const s = String(fecha).slice(0, 10);
    if (unidad === 'anio' || unidad === 'ejercicio') return s.slice(0, 4);
    if (unidad === 'dia') return s;
    return s.slice(0, 7);   // mes (defecto)
  }

  // Normaliza una fecha a ISO YYYY-MM-DD; inválida → null (no se estima).
  _fecha(v) {
    if (v === undefined || v === null || v === '') return null;
    const s = String(v);
    const t = Date.parse(s);
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : s;
  }

  _espejoDe(pid) {
    let m = this._espejo.get(pid);
    if (!m) { m = new Map(); this._espejo.set(pid, m); }
    return m;
  }

  // ── Tools ──
  toolImputar(params) { return this._imputar(params); }
}

module.exports = Periodificacion;

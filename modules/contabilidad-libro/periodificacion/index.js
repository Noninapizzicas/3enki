/**
 * contabilidad-libro/periodificacion — REFLEJO STATELESS (C3, hoja del plan).
 *
 * Imputa cada hecho a su PERIODO con el criterio DECLARADO; CONSERVA fecha operación y fecha valor.
 * No estima el periodo: lo deriva del hecho y del criterio declarado. Sin criterio, el hecho NO se
 * imputa a un periodo inventado: queda `periodo:null` y se declara ABIERTO.
 *
 * Invariantes:
 *  - El CRITERIO de imputación es DECLARABLE: `fecha_operacion` (por defecto — el día en que ocurrió),
 *    `fecha_valor` o un `criterio` con `mes_corte` (mes de cierre, p.ej. 12 = año natural). No se cablea
 *    un criterio de negocio: entra como dato.
 *  - Se CONSERVAN SIEMPRE ambas fechas (fecha_operacion y fecha_valor): no se pierde ninguna.
 *  - Sin `fecha_operacion` → `periodo:null` (dato ausente = desconocido), no un periodo por defecto.
 *  - El periodo se expresa como `AAAA-MM` (o `AAAA` con `granularidad:'anual'`), recortado al `mes_corte`.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. RPC PREGUNTA → sin ui_handler.
 * Ver hoja C3 del plan-construccion y diseno-oop.md (CLASE Periodificacion).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

function esFecha(v) {
  if (v == null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

class Periodificacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'periodificacion';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onImputarRequest(e) {
    return this._atender(e, 'imputar', 'periodificacion.imputar.response', async (d) => {
      const res = this._imputar(d);
      // PREGUNTA: no escribe → no hay hecho que anunciar (R2). Su cara es el bus.
      if (res.status !== 200) this.eventBus?.publish('periodificacion.imputar.failed', res);
      else if (res.data && res.data.criterio_declarado === false) {
        this._subirPeticionCriterio(res.data.project_id);
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // imputar(hecho) → periodo, conservando fecha operación y fecha valor
  // ══════════════════════════════════════════════════════════════════════
  _imputar(input = {}) {
    const pid = input.project_id || this.project_id || null;

    const hecho = input.hecho && typeof input.hecho === 'object' ? input.hecho
      : (input.elemento && typeof input.elemento === 'object' ? input.elemento : null);
    if (!hecho) return this._invalid('hecho');

    // Las dos fechas SIEMPRE se conservan; admiten variantes de nombre.
    const fOperacion = this._fecha(input.fecha_operacion != null ? input.fecha_operacion
      : (hecho.fecha_operacion != null ? hecho.fecha_operacion : hecho.fecha));
    const fValor = this._fecha(input.fecha_valor != null ? input.fecha_valor : hecho.fecha_valor);

    // Criterio DECLARABLE: qué fecha gobierna el periodo + mes de corte.
    const criterio = input.criterio && typeof input.criterio === 'object' ? input.criterio : null;
    const por = this._por(input, criterio);              // 'operacion' | 'valor'
    const gran = input.granularidad != null ? String(input.granularidad) : 'mensual';
    const mesCorte = this._mesCorte(input.mes_corte != null ? input.mes_corte : (criterio ? criterio.mes_corte : null));

    const fechaGobierna = por === 'valor' ? fValor : fOperacion;

    // Sin la fecha que gobierna el periodo NO se inventa uno: se declara ABIERTO.
    if (!fechaGobierna) {
      return {
        status: 200,
        data: {
          project_id: pid,
          fecha_operacion: fOperacion ? fOperacion.toISOString() : null,
          fecha_valor: fValor ? fValor.toISOString() : null,
          periodo: null,
          por,
          granularidad: gran,
          mes_corte: mesCorte,
          criterio_declarado: Boolean(criterio),
          abierto: {
            periodo: `no hay fecha de ${por === 'valor' ? 'valor' : 'operación'}: el periodo no se estima`
          }
        }
      };
    }

    const periodo = this._periodo(fechaGobierna, gran, mesCorte);

    return {
      status: 200,
      data: {
        project_id: pid,
        // Se CONSERVA todo: la fecha operación y la fecha valor viajan siempre.
        fecha_operacion: fOperacion ? fOperacion.toISOString() : null,
        fecha_valor: fValor ? fValor.toISOString() : null,
        periodo,
        por,
        granularidad: gran,
        mes_corte: mesCorte,
        criterio_declarado: Boolean(criterio),
        abierto: {
          criterio: criterio ? null : 'no se declaró `criterio`: se imputa por fecha de operación',
          fecha_valor: fValor ? null : 'el hecho no trae fecha valor (se conserva como null)'
        }
      }
    };
  }

  // Criterio por defecto: fecha de OPERACIÓN (el día en que ocurrió). Declarable a 'valor'.
  _por(input = {}, criterio = null) {
    const raw = input.por != null ? input.por : (criterio && criterio.por != null ? criterio.por : null);
    const v = raw != null ? String(raw).toLowerCase().trim() : '';
    return v === 'valor' ? 'valor' : 'operacion';
  }

  // Mes de corte: 1..12. Ausente o inválido → 12 (año natural), declarado como tal.
  _mesCorte(raw) {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 1 && n <= 12 ? n : 12;
  }

  // Periodo AAAA-MM (mensual) o AAAA (anual), ajustado por el mes de corte del ejercicio.
  _periodo(fecha, granularidad, mesCorte) {
    const d = new Date(fecha);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;               // 1..12
    // Ejercicio: si el mes es anterior al mes de corte, pertenece al ejercicio anterior.
    const anioEjercicio = m >= mesCorte ? y : y - 1;
    if (String(granularidad).toLowerCase() === 'anual') return `${anioEjercicio}`;
    return `${y}-${String(m).padStart(2, '0')}`;
  }

  _fecha(v) {
    if (v == null || v === '') return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // Peticion best-effort a la cola declarativa cuando falta el criterio de imputacion.
  _subirPeticionCriterio(pid) {
    try {
      if (pid) this._rpc('cola-declaraciones-criterio.fijar.request', {
        project_id: pid,
        clave: 'periodo',
        origen: 'periodificacion'
      }, { timeout_ms: 2000 });
    } catch (_) { /* best-effort */ }
  }

  // ── Tools ──
  toolImputar(params) { return this._imputar(params); }
}

module.exports = Periodificacion;

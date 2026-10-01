/**
 * contabilidad-analitica/comparador-periodos — REFLEJO STATELESS (J9, hoja del plan).
 *
 * Ejercicio vs ejercicio, mes vs mes, real vs presupuesto. REUTILIZA J3 (presupuesto) y J4
 * (desviacion), NO los duplica: sube `presupuesto.objetivo.request` para traer la cifra
 * objetivo y `desviacion.calcular.request` para medir el real contra ella — o usa lo
 * DECLARADO. Este modulo COMPARA lo que ambos devuelven; no fija objetivos ni calcula
 * desviaciones por su cuenta.
 *
 * Invariante (13): dato ausente = desconocido. Si falta uno de los dos lados de la
 * comparacion (objetivo o real), la comparacion queda `abierta` — NO se rellena con un cero:
 * una comparacion contra un cero inventado es una desviacion falsa.
 *
 * ESCUCHA (R3): el plan declara escucha de `contabilidad.presupuesto_fijado` (presupuesto J3,
 * emitido) y `contabilidad.ejercicio_cerrado` (cierre-ejercicio C4). C4 AUN NO existe en el
 * repo → la escucha de ejercicio_cerrado NO se declara (cadena colgada). Ver nota en el _doc.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. PREGUNTA → sin ui_handler.
 * Ver hoja J9 del plan-construccion y diseno-oop.md (CLASE ComparadorPeriodos).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class ComparadorPeriodos extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'comparador-periodos';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onCompararRequest(e) {
    return this._atender(e, 'comparar', 'comparador-periodos.comparar.response', async (d) => {
      const res = await this._comparar(d);
      // Reflejo: compara; no escribe estado → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('comparador-periodos.comparar.failed', res);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): un objetivo quedo fijado → se observa ──
  // Observar NO es escribir: solo se guarda en memoria (ventana acotada) para la proxima comparacion.
  onPresupuestoFijado(e) {
    const d = (e && (e.data || e)) || {};
    this._objetivos = this._objetivos || [];
    this._objetivos.push({ project_id: d.project_id || null, dimension: d.dimension || null, periodo: d.periodo || null, importe: d.importe != null ? d.importe : null, estado: d.estado || null });
    if (this._objetivos.length > 1000) this._objetivos.shift();
  }

  // ══════════════════════════════════════════════════════════════════════
  // _comparar(input) → { status, data }  ·  compara dos lados (REUTILIZA J3/J4)
  // ══════════════════════════════════════════════════════════════════════
  async _comparar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const dimension = input.dimension != null ? String(input.dimension) : null;
    const modo = this._modo(input);

    // Lado A (base): el periodo de referencia. Declarado, o pedido por EVENTO.
    const a = await this._lado(input, 'a', pid);
    // Lado B (contraste): el otro periodo / el objetivo.
    const b = await this._lado(input, 'b', pid);

    const ia = this._num(a && a.importe);
    const ib = this._num(b && b.importe);
    const comparables = ia !== null && ib !== null;
    const diferencia = comparables ? this._round(ib - ia, 2) : null;
    const variacion_pct = (comparables && ia !== 0) ? this._round((ib - ia) / Math.abs(ia), 4) : null;

    // REUTILIZA J4 (desviacion) para el real vs presupuesto: NO lo recalcula aqui.
    let desviacion = null;
    if (modo === 'real_vs_presupuesto' && comparables) {
      const resp = await this._rpc('desviacion.calcular.request', {
        project_id: pid, dimension, objetivo: ia, real: ib, periodo: b && b.periodo
      }, { timeout_ms: 800 });
      desviacion = (resp && (resp.data || resp)) || null;
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'comparador-periodos',
        modo,
        dimension,
        a, b,
        comparable: comparables,
        diferencia,
        variacion_pct,
        // La desviacion la calcula J4; aqui solo se REUTILIZA (no se duplica).
        desviacion,
        reutiliza: ['presupuesto.objetivo (J3)', 'desviacion.calcular (J4)'],
        abierto: {
          a: (a && a.importe != null) ? null : 'el lado base no declaro su importe (no se rellena con cero)',
          b: (b && b.importe != null) ? null : 'el lado de contraste no declaro su importe (no se rellena con cero)',
          comparacion: comparables ? null : 'faltan datos de un lado: la comparacion queda abierta (no se inventa)'
        }
      }
    };
  }

  // Trae un lado de la comparacion: declarado, o pedido por EVENTO (J3 objetivos / J4).
  async _lado(input, cual, pid) {
    const declarado = (input[cual] && typeof input[cual] === 'object') ? input[cual] : null;
    if (declarado) return this._norm(declarado, cual);

    // Objetivo (presupuesto J3) si viene por ese campo o si el modo es real-vs-presupuesto.
    const objetivos = (input.objetivos && typeof input.objetivos === 'object') ? input.objetivos : null;
    if (objetivos && objetivos[cual] && typeof objetivos[cual] === 'object') return this._norm(objetivos[cual], cual);

    // Sube best-effort la lectura del objetivo al presupuesto (J3).
    const resp = await this._rpc('presupuesto.objetivo.request', {
      project_id: pid, dimension: input.dimension, periodo: input[`periodo_${cual}`] || input.periodo
    }, { timeout_ms: 800 });
    const d = (resp && (resp.data || resp)) || null;
    const objetivo = d && (d.objetivo || d);
    if (objetivo && objetivo.importe != null) {
      return this._norm({ periodo: objetivo.periodo, importe: objetivo.importe, origen: 'presupuesto' }, cual);
    }
    return this._norm(declarado, cual);
  }

  _norm(lado, cual) {
    if (!lado) return { lado: cual, periodo: null, importe: null, origen: null, etiqueta: null };
    return {
      lado: cual,
      periodo: lado.periodo != null ? String(lado.periodo) : null,
      importe: this._num(lado.importe),
      origen: lado.origen != null ? String(lado.origen) : null,
      etiqueta: lado.etiqueta != null ? String(lado.etiqueta) : null
    };
  }

  _modo(input) {
    const m = input.modo != null ? String(input.modo).toLowerCase().trim() : '';
    if (m === 'real_vs_presupuesto' || m === 'presupuesto') return 'real_vs_presupuesto';
    if (m === 'ejercicio' || m === 'ejercicio_vs_ejercicio') return 'ejercicio_vs_ejercicio';
    if (m === 'mes' || m === 'mes_vs_mes') return 'mes_vs_mes';
    // Por defecto: comparacion de periodos genericos (se declara; no se asume presupuesto).
    return 'periodo_vs_periodo';
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolComparar(params) { return this._comparar(params); }
}

module.exports = ComparadorPeriodos;

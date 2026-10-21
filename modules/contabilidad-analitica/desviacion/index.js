/**
 * contabilidad-analitica/desviacion — REFLEJO STATELESS (J4, hoja del plan).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * Real vs PRESUPUESTO. Dispara aviso SI se sale del umbral DECLARADO. Determinista.
 * ══════════════════════════════════════════════════════════════════════════════════════
 * No calcula el real (eso es margen-analitico) ni fija el objetivo (eso es presupuesto):
 * RECIBE ambas cifras (o las sube por EVENTO) y las COMPARA. La desviacion es
 * real − presupuesto, y el aviso solo se produce si el umbral declarado se rebasa.
 *
 * Honestidad (invariante 13): sin AMBAS cifras (real y presupuesto) NO se inventa la
 * desviacion: se declara ABIERTO. Sin umbral declarado NO se decide si "se sale": se
 * declara (la desviacion se calcula, pero nadie ha dicho que sea inaceptable).
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia. PREGUNTA (calcular) → sin ui_handler.
 * Ver hoja J4 del plan-construccion y diseno-oop.md (CLASE Desviacion).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class Desviacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'desviacion';
    this.version = 'reflejo-0.1.0';
    // Ultima senal observada por proyecto (memoria acotada, no store).
    this._senales = new Map(); // project_id -> { real, objetivo, umbral, concepto }
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'desviacion.calcular.response', async (d) => {
      const res = await this._calcular(d);
      if (res.status !== 200) this.eventBus?.publish('desviacion.calcular.failed', res);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): se fijo el presupuesto → hay objetivo ──
  onPresupuestoFijado(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id || this.project_id;
    if (!pid) return;
    const s = this._senales.get(pid) || {};
    s.objetivo = this._num(d.importe ?? d.objetivo ?? d.total ?? (d.presupuesto && d.presupuesto.importe));
    s.umbral = this._num(d.umbral ?? d.tolerancia ?? (d.presupuesto && d.presupuesto.umbral));
    s.concepto = d.concepto != null ? String(d.concepto) : s.concepto;
    this._senales.set(pid, s);
  }

  // ── handler de dominio (fire-and-forget): el libro cambio → se observa (ventana acotada) ──
  onAsientoAsentado(e) {
    const d = (e && (e.data || e)) || {};
    if (d.asiento) {
      this._vistos = this._vistos || new Map();
      const pid = d.project_id || this.project_id || '_';
      const lista = this._vistos.get(pid) || [];
      lista.push(d.asiento);
      if (lista.length > 1000) lista.shift();
      this._vistos.set(pid, lista);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // _calcular(input) → { status, data }  ·  real vs presupuesto + umbral
  // ══════════════════════════════════════════════════════════════════════
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const obs = this._senales.get(pid) || {};

    // El REAL: declarado, o subido por EVENTO al margen-analitico (best-effort).
    let real = this._num(input.real ?? input.importe_real ?? input.total);
    let fuente_real = real != null ? 'declarado' : null;
    if (real == null) {
      const r = await this._rpc('margen-analitico.calcular.request', {
        project_id: pid, concepto: input.concepto, periodo: input.periodo
      }, { timeout_ms: 800 });
      const v = r && this._num(r.margen ?? r.total ?? r.importe);
      if (v != null) { real = v; fuente_real = 'margen-analitico'; }
    }

    // El OBJETIVO (presupuesto): declarado, o el observado del evento.
    let presupuesto = this._num(input.presupuesto ?? input.objetivo ?? input.importe_presupuestado);
    let fuente_obj = presupuesto != null ? 'declarado' : null;
    if (presupuesto == null) {
      const r = await this._rpc('presupuesto.objetivo.request', {
        project_id: pid, concepto: input.concepto, periodo: input.periodo
      }, { timeout_ms: 800 });
      const v = r && this._num(r.importe ?? r.objetivo ?? r.total);
      if (v != null) { presupuesto = v; fuente_obj = 'presupuesto'; }
      else if (obs.objetivo != null) { presupuesto = obs.objetivo; fuente_obj = 'observado'; }
    }

    // El UMBRAL declarado (tolerancia). Sin el NO se decide "se sale".
    const umbral = this._num(input.umbral ?? input.tolerancia ?? obs.umbral);

    const hayAmbas = real != null && presupuesto != null;
    if (!hayAmbas) {
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'desviacion',
          real: real != null ? real : null,
          presupuesto: presupuesto != null ? presupuesto : null,
          desviacion: null,
          dentro_umbral: null,
          senal_presente: false,
          abierto: {
            real: real != null ? null : 'no llego el real (ni declarado ni de margen-analitico)',
            presupuesto: presupuesto != null ? null : 'no llego el presupuesto (ni declarado ni de presupuesto)',
            nota: 'faltan cifras: la desviacion no se inventa'
          }
        }
      };
    }

    const desviacion = this._round(real - presupuesto, 2);
    const relativa = presupuesto !== 0 ? this._round(desviacion / Math.abs(presupuesto), 4) : null;
    const hayUmbral = umbral != null;
    const desviacion_abs = Math.abs(desviacion);
    // Se sale si la desviacion ABSOLUTA supera el umbral declarado.
    const fuera_umbral = hayUmbral ? desviacion_abs > Math.abs(umbral) : null;

    const data = {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'desviacion',
        concepto: input.concepto != null ? String(input.concepto) : null,
        real,
        presupuesto,
        desviacion,
        desviacion_abs,
        desviacion_relativa: relativa,
        umbral: hayUmbral ? umbral : null,
        fuera_umbral,
        dentro_umbral: fuera_umbral == null ? null : !fuera_umbral,
        fuente: { real: fuente_real, presupuesto: fuente_obj },
        senal_presente: true,
        formula: 'desviacion = real - presupuesto; se sale si |desviacion| > |umbral| declarado',
        abierto: {
          umbral: hayUmbral ? null : 'no se declaró umbral: se calcula la desviacion pero no se decide si es inaceptable'
        }
      }
    };

    // Dispara aviso SOLO si se sale del umbral DECLARADO.
    if (fuera_umbral === true) {
      this.eventBus?.publish('motor-avisos.producir.request', {
        project_id: pid,
        tipo: 'presupuesto',
        severidad: 'warn',
        titulo: `Desviacion fuera de umbral: ${desviacion}`,
        detalle: `real=${real} vs presupuesto=${presupuesto} (umbral ${umbral})`,
        origen: 'desviacion',
        ref: input.concepto != null ? String(input.concepto) : null,
        correlation_id: input.correlation_id
      });
    }

    return data;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = Desviacion;

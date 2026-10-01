/**
 * contabilidad-entrada/tasa-cobertura-entrada — REFLEJO STATELESS (P4, hoja del plan).
 *
 * La PROPORCION de hechos que entran SIN intervencion vs los que caen a cola. Es la vista
 * de TASA de la metrica unica: LEE la metrica (`completitud-cobertura` A12) y calcula la
 * tasa — NO la recalcula, NO cuenta hechos por su cuenta, NO escribe nada.
 *
 * Los dos sucesos que la alimentan (por EVENTO, no por computo propio):
 *   contabilidad.hecho_recibido    → un hecho entro
 *   contabilidad.excepcion_encolada → un hecho cayo a cola (necesito intervencion)
 * Se observan en memoria (ventana acotada) para poder contrastar con la metrica declarada;
 * el calculo FINO sale de la metrica unica, no de este contador de conveniencia.
 *
 * Invariante (13): dato ausente = desconocido. Sin metrica NO se inventa una tasa: se
 * declara INDETERMINADA — una tasa de cobertura fabricada es una mentira sobre el proceso.
 *
 * ESCUCHA (R3): el plan declara escucha de `contabilidad.hecho_recibido`
 * (puerto-evento-vertical A1) y `contabilidad.excepcion_encolada` (encolado-excepcion, que
 * SI existe en el repo) → ambos emisores existen → SI se declaran.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. PREGUNTA → sin ui_handler.
 * Ver hoja P4 del plan-construccion y diseno-oop.md (CLASE TasaCoberturaEntrada).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class TasaCoberturaEntrada extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'tasa-cobertura-entrada';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'tasa-cobertura-entrada.calcular.response', async (d) => {
      const res = await this._calcular(d);
      // Reflejo: calcula la tasa; no escribe estado → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('tasa-cobertura-entrada.calcular.failed', res);
      return res;
    });
  }

  // ── handlers de dominio (fire-and-forget): observan los dos sucesos de la tasa ──
  // Observar NO es escribir: solo se cuenta en memoria para contrastar con la metrica unica.
  onHechoRecibido(e) {
    const d = (e && (e.data || e)) || {};
    this._obs = this._obs || [];
    this._obs.push({ tipo: 'entrado', project_id: d.project_id || null, en: new Date().toISOString() });
    if (this._obs.length > 2000) this._obs.shift();
  }

  onExcepcionEncolada(e) {
    const d = (e && (e.data || e)) || {};
    this._obs = this._obs || [];
    this._obs.push({ tipo: 'encolado', project_id: d.project_id || null, motivo: d.motivo || null, en: new Date().toISOString() });
    if (this._obs.length > 2000) this._obs.shift();
  }

  // ══════════════════════════════════════════════════════════════════════
  // _calcular(input) → { status, data }  ·  la TASA (lee la metrica, no la recalcula)
  // ══════════════════════════════════════════════════════════════════════
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // LEE la metrica unica: declarada, o pedida por EVENTO a completitud-cobertura.
    const { metrica, fuente } = await this._metricaDe(input);

    const entrados = this._num(metrica && (metrica.entrados != null ? metrica.entrados : metrica.llegados));
    const encolados = this._num(metrica && (metrica.encolados != null ? metrica.encolados : metrica.excepciones));
    const totalDeclarado = this._num(metrica && metrica.total);

    const hayDatos = (entrados !== null || encolados !== null || totalDeclarado !== null);
    const total = (entrados !== null && encolados !== null) ? entrados + encolados
      : (totalDeclarado !== null ? totalDeclarado : null);

    // La TASA: entrados SIN intervencion / total. Sin total > 0 → indeterminada (no se inventa).
    const sin_intervencion = (entrados !== null) ? entrados : null;
    const con_intervencion = (encolados !== null) ? encolados : null;
    const tasa = (total !== null && total > 0 && sin_intervencion !== null)
      ? this._round(sin_intervencion / total, 4) : null;
    const tasa_intervencion = (total !== null && total > 0 && con_intervencion !== null)
      ? this._round(con_intervencion / total, 4) : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'tasa-cobertura-entrada',
        fuente: fuente || null,
        // La metrica unica tal cual se LEYO (no se recalcula).
        metrica: metrica ? {
          entrados: sin_intervencion, encolados: con_intervencion, total,
          esperados: this._num(metrica.esperados), llegados: this._num(metrica.llegados)
        } : null,
        // La TASA de cobertura de entrada: sin intervencion / total.
        tasa: tasa !== null ? tasa : 'INDETERMINADA',
        tasa_intervencion,
        entrados: sin_intervencion,
        encolados: con_intervencion,
        total,
        // NO se recalcula la metrica ni se cuentan hechos por cuenta propia.
        recalcula_metrica: false,
        observados_en_memoria: this._obs ? this._obs.length : 0,
        abierto: {
          metrica: hayDatos ? null : 'no llego la metrica de cobertura (ni declarada ni de completitud-cobertura): la tasa queda INDETERMINADA (no se inventa)',
          total: (hayDatos && (total === null || total === 0))
            ? 'la metrica no declara un total > 0: la tasa no es calculable (no se finge)'
            : null
        }
      }
    };
  }

  // Trae la metrica unica: declarada, o pedida por EVENTO a completitud-cobertura (PREGUNTA).
  async _metricaDe(input) {
    const directa = (input.metrica && typeof input.metrica === 'object') ? input.metrica
      : ((input.cobertura && typeof input.cobertura === 'object') ? input.cobertura : null);
    if (directa) return { metrica: directa, fuente: 'declarado' };

    const resp = await this._rpc('completitud-cobertura.medir.request', {
      project_id: input.project_id || this.project_id,
      ejercicio: input.ejercicio, desde: input.desde, hasta: input.hasta
    }, { timeout_ms: 800 });
    const d = (resp && (resp.data || resp)) || null;
    if (d && (d.metrica || d.entrados != null || d.llegados != null || d.total != null)) {
      return { metrica: d.metrica || d, fuente: 'completitud-cobertura' };
    }
    return { metrica: null, fuente: null };
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = TasaCoberturaEntrada;

/**
 * contabilidad-analitica/valor-neto-contable — REFLEJO STATELESS (F4, hoja del plan).
 *
 * VALOR NETO CONTABLE del inmovilizado: COSTE − AMORTIZACION ACUMULADA. Determinista,
 * al balance.
 *
 * No calcula las cuotas por su cuenta (eso es `plan-amortizacion`, al que SUBE por EVENTO
 * `plan-amortizacion.cuota_del_periodo.request`): RECIBE las cuotas/la amortizacion
 * acumulada y las RESTA del coste. La cuota que genera `plan-amortizacion` llega tambien
 * como HECHO (`contabilidad.cuota_amortizacion_generada`) y se observa (ventana acotada).
 *
 * Honestidad (invariante 13): sin coste NO se inventa el valor (dato ausente = desconocido);
 * sin cuotas ni amortizacion acumulada declaradas, el VNC se declara ABIERTO (no se asume
 * que la amortizacion sea 0). Nunca un VNC negativo se "arregla": se declara tal cual
 * (podria senalar un error de datos — se declara en `abierto`).
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. PREGUNTA (calcular) → sin ui_handler.
 * Ver hoja F4 del plan-construccion y diseno-oop.md (CLASE ValorNetoContable).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class ValorNetoContable extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'valor-neto-contable';
    this.version = 'reflejo-0.1.0';
    // Derivado en memoria: project_id -> [cuotas amortizacion observadas]
    this._cuotas = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'valor-neto-contable.calcular.response', async (d) => {
      const res = await this._calcular(d);
      // Reflejo: calcula; no escribe → no hay hecho de dominio que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('valor-neto-contable.calcular.failed', res);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): se genero una cuota de amortizacion (B3) ──
  onCuotaAmortizacionGenerada(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id || this.project_id;
    if (!pid) return;
    const cuota = d.cuota && typeof d.cuota === 'object' ? d.cuota : d;
    let arr = this._cuotas.get(pid);
    if (!arr) { arr = []; this._cuotas.set(pid, arr); }
    arr.push(cuota);
    if (arr.length > 1000) arr.shift();
  }

  // ══════════════════════════════════════════════════════════════════════
  // calcular(activo) → valor neto contable = coste − amortizacion acumulada
  // ══════════════════════════════════════════════════════════════════════
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const activo = input.activo && typeof input.activo === 'object' ? input.activo : input;
    const coste = this._num(input.coste != null ? input.coste : activo.coste);
    if (coste == null) {
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'valor-neto-contable',
          valor_neto_contable: null,
          abierto: { coste: 'el activo no declara coste: el valor neto contable no se inventa' }
        }
      };
    }

    // La amortizacion acumulada puede venir declarada, o derivarse de las cuotas declaradas,
    // o pedirse a plan-amortizacion (B3) por EVENTO. Si no hay ninguna fuente → no se asume 0.
    let acumulada = this._num(input.amortizacion_acumulada != null ? input.amortizacion_acumulada : activo.amortizacion_acumulada);
    let fuente = acumulada != null ? 'declarado' : null;

    if (acumulada == null) {
      const cuotas = Array.isArray(input.cuotas) ? input.cuotas
        : (Array.isArray(activo.cuotas) ? activo.cuotas : null);
      if (cuotas) {
        acumulada = this._round(cuotas.reduce((t, c) => t + this._num(c && (c.cuota != null ? c.cuota : c.importe)) || 0, 0), 2);
        fuente = 'cuotas_declaradas';
      } else if (this._cuotas.get(pid) && this._cuotas.get(pid).length) {
        acumulada = this._round(this._cuotas.get(pid).reduce((t, c) => t + this._num(c.cuota != null ? c.cuota : c.importe) || 0, 0), 2);
        fuente = 'cuota_amortizacion_generada';
      } else {
        const resp = await this._rpc('plan-amortizacion.cuota_del_periodo.request', {
          project_id: pid, activo_id: input.activo_id || activo.id, periodo: input.periodo
        }, { timeout_ms: 3000 });
        const r = resp && resp.data ? resp.data : resp;
        const a = this._num(r && (r.amortizacion_acumulada != null ? r.amortizacion_acumulada : r.acumulada));
        if (a != null) { acumulada = a; fuente = 'plan-amortizacion'; }
      }
    }

    if (acumulada == null) {
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'valor-neto-contable',
          coste,
          amortizacion_acumulada: null,
          valor_neto_contable: null,
          determinista: true,
          abierto: {
            amortizacion: 'no hay amortizacion acumulada (ni declarada, ni de cuotas, ni de plan-amortizacion): no se asume 0'
          }
        }
      };
    }

    const vnc = this._round(coste - acumulada, 2);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'valor-neto-contable',
        activo_id: input.activo_id != null ? String(input.activo_id) : (activo.id != null ? String(activo.id) : null),
        coste,
        amortizacion_acumulada: acumulada,
        valor_neto_contable: vnc,
        fuente,
        formula: 'COSTE - AMORTIZACION_ACUMULADA',
        determinista: true,
        abierto: {
          negativo: vnc < 0 ? 'el valor neto contable es NEGATIVO: no se corrige, se declara (posible error de datos)' : null,
          sobre_amortizacion: acumulada > coste ? 'la amortizacion acumulada supera el coste' : null
        }
      }
    };
  }

  _num(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = ValorNetoContable;

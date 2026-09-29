/**
 * contabilidad-analitica/valor-neto-contable — REFLEJO STATELESS (F4, hoja del plan).
 *
 * VALOR NETO CONTABLE = COSTE − AMORTIZACION ACUMULADA. Calculo PURO, determinista: misma
 * entrada → mismo valor. Es el valor que va al BALANCE.
 *
 * ATRIBUTOS del diseno: `coste:ParametroDeclarable` y `amort_acumulada:PlanAmortizacion`.
 *   - El COSTE es un PARAMETRO DECLARABLE: entra declarado en la peticion (o con la ficha del
 *     activo). El reflejo NUNCA lo estima.
 *   - La AMORTIZACION ACUMULADA se agrega de las CUOTAS del plan (plan-amortizacion F2) POR
 *     EVENTO — suma pura de lo que la tabla ya declaro, sin interpretar ninguna cuota.
 *
 * Ni el coste ni la acumulada se estiman: si falta uno de los dos, el valor neto queda
 * `[ABIERTO]` (`vnc:null`) y se declara cual falta — jamas se rellena con 0 ni con un default.
 *
 * Invariantes:
 *  - DETERMINISTA: mismo coste + misma acumulada → mismo VNC (una sola respuesta correcta).
 *  - Dato ausente = desconocido: sin coste O sin acumulada → `vnc:null` y `abierto:true`.
 *    Un valor neto NEGATIVO no se corrige ni se recorta: se declara tal cual (es senal de que
 *    la amortizacion acumulada excede el coste — un dato del negocio, no algo que el reflejo tape).
 *  - NO escribe, NO persiste, NO muta: las cuotas son de F2.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja F4 del plan-construccion y diseno-oop.md (CLASE ValorNetoContable).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class ValorNetoContable extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'valor-neto-contable';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'valor-neto-contable.calcular.response', async (d) => {
      const res = await this._calcular(d);
      if (res.status !== 200) this.eventBus?.publish('valor-neto-contable.calcular.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: calcular(activo, fecha) → Cuantía (VNC) ──
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const id_activo = input.id_activo != null ? String(input.id_activo).trim()
      : (input.activo && input.activo.id_activo != null ? String(input.activo.id_activo) : null);
    const fecha = input.fecha != null ? String(input.fecha) : null;

    // 1) La AMORTIZACION ACUMULADA: agregada del plan (F2) POR EVENTO, o de cuotas declaradas.
    const { acumulada, fuente_amortizacion } = await this._amortizacion(pid, id_activo, input, fecha);

    // 2) El COSTE: ParametroDeclarable — declarado en la peticion (o con la ficha del activo).
    const { coste, fuente_coste } = this._coste(input);

    // 3) El VNC solo existe con las dos piezas. Sin una de ellas, `[ABIERTO]` (nada se estima).
    const faltan = [];
    if (coste === null) faltan.push('coste');
    if (acumulada === null) faltan.push('amortizacion_acumulada');

    const vnc = faltan.length === 0 ? this._round(coste - acumulada, 2) : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        id_activo,
        fecha,
        vnc,
        coste,
        amortizacion_acumulada: acumulada,
        fuente_coste,
        fuente_amortizacion,
        abierto: faltan.length > 0,
        faltan,
        motivo: faltan.length > 0
          ? `no se estima el valor neto: falta ${faltan.join(' y ')}`
          : null,
        // Un VNC negativo se DECLARA, no se recorta: senal de acumulada > coste.
        negativo: vnc !== null ? vnc < 0 : null
      }
    };
  }

  // El COSTE es ParametroDeclarable: declarado en la peticion (o con la ficha del activo).
  _coste(input = {}) {
    const declarado = this._num(input.coste);
    if (declarado !== null) return { coste: declarado, fuente_coste: 'declarado' };

    const enActivo = this._num(input.activo && input.activo.valor);
    if (enActivo !== null) return { coste: enActivo, fuente_coste: 'activo_declarado' };

    // Sin coste declarado NO se estima (jamas se lee por una puerta que no sea de lectura).
    return { coste: null, fuente_coste: null };
  }

  // La amortizacion acumulada: cuotas declaradas o agregadas del plan (F2) POR EVENTO.
  async _amortizacion(pid, id_activo, input, fecha) {
    const declarada = this._num(
      input.amortizacion_acumulada != null ? input.amortizacion_acumulada : input.amort_acumulada
    );
    if (declarada !== null) return { acumulada: declarada, fuente_amortizacion: 'declarada' };

    // Cuotas declaradas en la peticion: se AGREGAN (suma pura, sin interpretar ninguna cuota).
    if (Array.isArray(input.cuotas)) {
      return { acumulada: this._round(this._suma(input.cuotas), 2), fuente_amortizacion: 'cuotas_declaradas' };
    }

    if (!id_activo) return { acumulada: null, fuente_amortizacion: null };
    const r = await this._rpc('plan-amortizacion.cuota_del_periodo.request',
      { project_id: pid, id_activo, periodo: input.periodo, hasta: fecha }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;

    // La tabla puede llegar como lista de cuotas (se agrega) o como acumulada ya declarada.
    if (data && Array.isArray(data.cuotas)) {
      return { acumulada: this._round(this._suma(data.cuotas), 2), fuente_amortizacion: 'plan-amortizacion' };
    }
    const acumulada = data ? this._num(data.acumulada) : null;
    if (acumulada !== null) return { acumulada, fuente_amortizacion: 'plan-amortizacion' };
    return { acumulada: null, fuente_amortizacion: null };
  }

  _suma(cuotas) {
    return cuotas.reduce((s, c) => s + (this._num(c && (c.importe != null ? c.importe : c.cuota)) || 0), 0);
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = ValorNetoContable;

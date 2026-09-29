/**
 * contabilidad-analitica/desviacion — REFLEJO STATELESS (J4, hoja del plan).
 *
 * REAL VS PRESUPUESTO: la desviacion de lo que ha pasado contra lo que el JEFE declaro. Calculo
 * PURO y determinista: el real − el objetivo, y el signo declarado (DESVIACION_POSITIVA si el real
 * va por encima del objetivo, NEGATIVA si por debajo, NULA si coinciden).
 *
 * ATRIBUTOS del diseno: `real`, `presupuesto:Presupuesto`, `umbral:Umbral`.
 *   METODOS: calcular(d, periodo):Delta.
 *   REGLA: real vs presupuesto → dispara aviso SI se sale del umbral declarado. Determinista.
 *
 * EL PRESUPUESTO NO SE DUPLICA: el objetivo sale de `presupuesto` (J3) POR EVENTO
 * (`presupuesto.objetivo.request`, best-effort) o declarado en la peticion. Este modulo NO guarda
 * objetivos ni los infiere — solo los RESTA contra el real. El real sale declarado en la peticion
 * o de `margen-analitico` (J2) POR EVENTO. Aqui no se recalcula el margen ni el resultado.
 *
 * EL UMBRAL ES DECLARABLE: sin umbral declarado (ni en la peticion ni en el objetivo de J3) NO se
 * afirma que haya que avisar — `avisa:false` con el motivo declarado. Cero porcentajes cableados:
 * un umbral inventado dispararia avisos que el jefe no pidio.
 *
 * Invariantes:
 *  - DETERMINISTA: mismo real + mismo objetivo + mismo umbral → misma desviacion.
 *  - Dato ausente = desconocido: sin real o sin objetivo declarado → `desviacion:null`, `abierto:true`
 *    (no se computa contra 0: un objetivo 0 no declarado no es un objetivo 0).
 *  - LEY/PARAMETRO COMO DATO: el objetivo y el umbral son datos declarados; cero constantes.
 *  - NO escribe, NO persiste: la desviacion es un DERIVADO.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Emite `contabilidad.desviacion` cuando hay que avisar (lo consume `motor-avisos` K2).
 * Ver hoja J4 del plan-construccion y diseno-oop.md (CLASE Desviacion).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class Desviacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'desviacion';
    this.version = 'reflejo-0.1.0';
    // Espejo en memoria de lo que el JEFE declaro (contabilidad.presupuesto_fijado): es solo una
    // SENAL para poder atender una peticion sin volver a preguntar; no es parcela ni persistencia.
    this._objetivos = new Map(); // project_id → Map<clave, Objetivo>
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'desviacion.calcular.response', async (d) => {
      const res = await this._calcular(d);
      if (res.status !== 200) {
        this.eventBus?.publish('desviacion.calcular.failed', res);
      } else if (res.data.avisa && res.data.aviso) {
        // Exito CON aviso → evento de dominio (lo consume motor-avisos K2).
        this.eventBus?.publish('contabilidad.desviacion', {
          project_id: res.data.project_id,
          desviacion: res.data.desviacion,
          dimension: res.data.dimension,
          periodo: res.data.periodo,
          umbral: res.data.umbral,
          aviso: res.data.aviso,
          correlation_id: d.correlation_id
        });
      }
      return res;
    });
  }

  // ── fire-and-forget: el JEFE fijo un objetivo → se refleja como señal (no se persiste) ──
  onPresupuestoFijado(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id;
    if (!pid) return null;
    const o = d.objetivo || d;
    const clave = o.clave || (o.periodo != null && o.dimension != null ? `${o.periodo}|${o.dimension}` : null);
    if (!clave) return null;
    let m = this._objetivos.get(pid);
    if (!m) { m = new Map(); this._objetivos.set(pid, m); }
    m.set(String(clave), {
      clave: String(clave),
      dimension: o.dimension ?? null,
      periodo: o.periodo != null ? String(o.periodo) : null,
      valor: this._num(o.valor),
      umbral: this._num(o.umbral)
    });
    return null;
  }

  // ── proyeccion determinista: calcular(d, periodo) → Delta ──
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const dimension = this._clave(input.dimension != null ? input.dimension : (input.centro ?? input.linea ?? input.producto));
    const periodo = input.periodo != null ? String(input.periodo).trim() : null;

    // 1) El OBJETIVO: declarado en la peticion o traido de presupuesto (J3) POR EVENTO. NO se duplica.
    const { objetivo, fuente_objetivo } = await this._objetivo(pid, dimension, periodo, input);

    // 2) El REAL: declarado en la peticion o derivado de margen-analitico (J2) POR EVENTO.
    const { real, fuente_real } = await this._real(pid, dimension, periodo, input);

    // 3) El UMBRAL: declarado en la peticion o con el objetivo de J3. Sin umbral NO se avisa.
    const umbral = this._umbral(input, objetivo);

    // Sin real o sin objetivo declarado NO se computa nada: 0 seria una cifra que nadie declaro.
    if (real === null || objetivo === null) {
      const faltan = [];
      if (real === null) faltan.push('real');
      if (objetivo === null) faltan.push('objetivo');
      return {
        status: 200,
        data: {
          project_id: pid, dimension, periodo,
          fuente_objetivo, fuente_real,
          objetivo, real, umbral,
          desviacion: null, desviacion_relativa: null, signo: null,
          avisa: false, aviso: null,
          abierto: true, faltan,
          motivo: 'no se computa desviacion: falta ' + faltan.join(' y ')
            + ' (no se mide contra un 0 que nadie declaro)'
        }
      };
    }

    const delta = this._round(real - objetivo, 2);
    const signo = delta > 0 ? 'DESVIACION_POSITIVA' : (delta < 0 ? 'DESVIACION_NEGATIVA' : 'NULA');
    const relativa = objetivo !== 0 ? this._round(delta / Math.abs(objetivo), 4) : null;

    // 4) El AVISO: solo si hay umbral DECLARADO y la desviacion se sale (en valor absoluto).
    //    Sin umbral no se afirma que haya que avisar (el jefe no ha fijado cuando).
    let avisa = false;
    let aviso = null;
    if (umbral !== null) {
      avisa = Math.abs(delta) > umbral;
      if (avisa) {
        aviso = {
          tipo: 'DESVIACION',
          dimension, periodo,
          real, objetivo, umbral,
          desviacion: delta,
          signo,
          // El destino lo declara el jefe; aqui no se inventa quien actua (Q70 [ABIERTO]).
          destino: input.destino != null ? String(input.destino) : null,
          destino_declarado: input.destino != null && String(input.destino).trim().length > 0,
          emitido_en: new Date().toISOString()
        };
      }
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        dimension,
        periodo,
        fuente_objetivo,
        fuente_real,
        objetivo,
        real,
        umbral,
        umbral_declarado: umbral !== null,
        // Delta: real − objetivo. Una sola respuesta correcta.
        desviacion: delta,
        desviacion_relativa: relativa,
        signo,
        avisa,
        aviso,
        abierto: false,
        faltan: umbral === null ? ['umbral'] : [],
        motivo: umbral === null
          ? 'la desviacion se mide, pero no se avisa: no hay umbral declarado por el jefe'
          : null
      }
    };
  }

  // El objetivo: dato declarado o de J3 (presupuesto) POR EVENTO. Nunca se infiere.
  async _objetivo(pid, dimension, periodo, input = {}) {
    const decl = this._num(input.objetivo);
    if (decl !== null) return { objetivo: decl, fuente_objetivo: 'declarado' };
    if (input.presupuesto && typeof input.presupuesto === 'object' && dimension && periodo) {
      const k = `${periodo}|${dimension}`;
      if (input.presupuesto[k] != null) {
        return { objetivo: this._num(input.presupuesto[k]), fuente_objetivo: 'declarado' };
      }
    }
    if (dimension && periodo) {
      const espejo = this._objetivos.get(pid);
      const o = espejo ? espejo.get(`${periodo}|${dimension}`) : null;
      if (o && o.valor !== null) return { objetivo: o.valor, fuente_objetivo: 'presupuesto_fijado' };
    }
    const r = await this._rpc('presupuesto.objetivo.request',
      { project_id: pid, dimension, periodo }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    const valor = data && data.objetivo ? this._num(data.objetivo.valor) : (data ? this._num(data.valor) : null);
    if (valor !== null) return { objetivo: valor, fuente_objetivo: 'presupuesto' };
    return { objetivo: null, fuente_objetivo: null };
  }

  // El real: dato declarado o de margen-analitico (J2) POR EVENTO. Aqui NO se recalcula el margen.
  async _real(pid, dimension, periodo, input = {}) {
    const decl = this._num(input.real != null ? input.real : input.margen);
    if (decl !== null) return { real: decl, fuente_real: 'declarado' };
    const r = await this._rpc('margen-analitico.calcular.request',
      { project_id: pid, periodo, dimension, eje: input.eje }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    if (!data) return { real: null, fuente_real: null };
    // Se LEE el margen ya calculado por J2: la cubeta de esa dimension, o el total si no hay dimension.
    if (dimension && Array.isArray(data.por_dimension)) {
      const c = data.por_dimension.find(x => this._clave(x.dimension) === dimension);
      return { real: c ? this._num(c.margen) : null, fuente_real: 'margen-analitico' };
    }
    return { real: this._num(data.margen_total), fuente_real: 'margen-analitico' };
  }

  _umbral(input = {}, objetivoTraido) {
    const u = this._num(input.umbral);
    if (u !== null) return u;
    if (objetivoTraido && typeof objetivoTraido === 'object') return this._num(objetivoTraido.umbral);
    return null;
  }

  _clave(v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'object') return this._clave(v.id ?? v.clave ?? v.nombre ?? v.dimension ?? v.centro ?? v.linea ?? v.producto);
    return String(v);
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

/**
 * contabilidad/aviso-cuadre — PUENTE STATELESS (C6, hoja del plan).
 *
 * NO FINGE EL CUADRE: si falta cobertura, AVISA. Y si no hay cobertura
 * declarada, lo DICE — no asume que todo llego.
 *
 * Es una VISTA de la METRICA UNICA (A12, completitud-cobertura): aqui NO se
 * recalcula "lo que falta". Cuando el calculo de cobertura llega por EVENTO
 * (contabilidad.cobertura_calculada) se LEE su resultado tal cual; si el disparo
 * viene del cierre (contabilidad.cierre_realizado) se PIDE la metrica a A12 por
 * EVENTO (contabilidad.cobertura.calcular.request) con CONTRATO TOLERANTE: si
 * A12 no responde, NO se afirma ni que cuadra ni que falta — se declara que la
 * metrica no esta disponible y el cuadre NO se declara. Una segunda metrica
 * seria el conflicto ② del diseno, y no se materializa.
 *
 * El AVISO se pide al motor de avisos (K2) por EVENTO
 * (contabilidad.aviso.solicitar.request): si K2 no contesta, el veredicto de
 * cuadre QUEDA EMITIDO igualmente (es de contabilidad) y se declara el fallo del
 * aviso — no se fabrica un aviso que K2 no produjo.
 *
 * PUENTE (patron real, stateless): SIN PosPersistencia ni project.activated —
 * reacciona a un evento y sigue. La dependencia con completitud-cobertura (A12)
 * y motor-avisos (K2) es por EVENTO, NUNCA por require cruzado.
 * Emisor/par de fallo: exito publica contabilidad.cuadre_evaluado; error su par
 * determinista (contabilidad.cuadre.failed / contabilidad.cuadre_evaluado.failed).
 * NO REUTILIZA: el aviso de cuadre bebe de la metrica de cobertura de ESTA vertical.
 *
 * Ver hoja C6 del diseno-oop y bloque `aviso-cuadre` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Rol al que se avisa por defecto si la metrica no trae uno (lo contable = asesor).
const DESTINATARIO_CONTABLE = 'ASESOR';

// Rol al que se avisa cuando lo que falta es del negocio (su fuente, su ritmo).
const DESTINATARIO_NEGOCIO = 'DUENO';

// Tolerancia: por debajo de 1 la cobertura esta incompleta.
const COBERTURA_COMPLETA = 1;

class AvisoCuadre extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'aviso-cuadre';
    this.version = 'reflejo-0.1.0';
    // Puente stateless: sin store que persistir (la metrica vive en A12).
  }

  async onUnload() { return super.onUnload(); }

  // Fire-and-forget: completitud-cobertura (A12) calculo la cobertura → se
  // EVALUA el cuadre LEYENDO la metrica unica (no se recalcula nada).
  onCoberturaCalculada(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    return (async () => this._evaluarConAviso(d, d))();
  }

  // Fire-and-forget: cierre-ejercicio (C4) cerro un periodo → hay que decir si
  // el cuadre se sostiene. La metrica se PIDE a A12 por EVENTO (tolerante).
  onCierreRealizado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    return (async () => {
      const metrica = await this._leerMetrica(d);
      if (!metrica) {
        // SIN metrica NO se afirma ni cuadra ni falta: se declara.
        const fallo = this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
          'completitud-cobertura (A12) no respondio: NO se afirma el cuadre ni su falta', {
            dependencia: 'completitud-cobertura',
            accion: 'NO_FINGIR_CUADRE',
            cierre: d.clave_natural || null
          });
        this.eventBus?.publish('contabilidad.cuadre.failed', { ...fallo, correlation_id: d.correlation_id });
        return fallo;
      }
      return this._evaluarConAviso(d, metrica);
    })();
  }

  // ── proyecciones puras ──

  // evaluar(cierre|cobertura) -> Cuadra | FaltaCobertura. Lee la metrica unica;
  // NO la recalcula (es_metrica_unica:true, recalcula_metrica:false).
  _evaluar(input) {
    const c = input || {};
    const pid = c.project_id;
    if (!pid) return this._invalid('project_id');

    const detalle = c.detalle || {};
    const esMetrica = c.es_metrica_unica === true || Array.isArray(detalle.huecos) || c.tasa !== undefined;

    // Sin la metrica de A12 no hay veredicto: el cuadre NO se finge.
    if (!esMetrica) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'falta la metrica unica de cobertura (A12): el cuadre NO se finge', {
          metrica: 'A12', recalcula_metrica: false, asumido: false, senal: 'SIN_METRICA'
        });
    }

    const esperados = Number(c.esperados) || 0;
    const recibidos = Number(c.recibidos) || 0;
    const huecos = Number(c.huecos) || 0;
    const tasa = Number(c.tasa) || 0;
    const senalMetrica = c.senal || (huecos > 0 ? 'HUECOS' : (esperados === 0 ? 'SIN_ACTIVIDAD' : 'COMPLETA'));

    // SIN ACTIVIDAD: no habia nada esperado. NO se finge un cuadre: se dice.
    if (senalMetrica === 'SIN_ACTIVIDAD' || esperados === 0) {
      return {
        status: 200,
        data: {
          project_id: pid,
          periodo: c.periodo || null,
          veredicto: 'SIN_ACTIVIDAD',
          cuadra: null,
          falta_cobertura: false,
          avisa: false,
          esperados: 0,
          recibidos,
          huecos: 0,
          tasa: 0,
          // Ni cuadra ni falta: no habia nada que medir.
          finge_cuadre: false,
          lee_metrica: 'A12',
          recalcula_metrica: false,
          detalle_huecos: [],
          motivo: 'no habia nada esperado: el sistema NO finge un cuadre'
        }
      };
    }

    // FALTA COBERTURA: hay huecos → AVISA (esa es toda la obligacion de C6).
    if (huecos > 0 || tasa < COBERTURA_COMPLETA) {
      const lista = Array.isArray(detalle.huecos) ? detalle.huecos : [];
      // El hueco dice de QUE vertical falta: lo de una fuente del negocio se
      // avisa al dueno; lo contable, al asesor. Se lee de la clave de la metrica
      // (`<pid>:<vertical>:<unidad>`), SIN inventar.
      const verticales = [...new Set(lista.map((k) => String(k).split(':')[1]).filter(Boolean))];
      return {
        status: 200,
        data: {
          project_id: pid,
          periodo: c.periodo || null,
          veredicto: 'FALTA_COBERTURA',
          cuadra: false,
          falta_cobertura: true,
          avisa: true,
          esperados,
          recibidos,
          huecos,
          tasa,
          verticales,
          detalle_huecos: lista,
          destinatario: lista.length ? DESTINATARIO_NEGOCIO : DESTINATARIO_CONTABLE,
          motivo: 'el cuadre no se sostiene: falta cobertura de la entrada',
          // La metrica se LEE, jamas se recalcula aqui.
          lee_metrica: 'A12',
          recalcula_metrica: false,
          segunda_metrica: false,
          finge_cuadre: false
        }
      };
    }

    // COMPLETA: el cuadre se sostiene — y se dice con su base.
    return {
      status: 200,
      data: {
        project_id: pid,
        periodo: c.periodo || null,
        veredicto: 'CUADRA',
        cuadra: true,
        falta_cobertura: false,
        avisa: false,
        esperados,
        recibidos,
        huecos: 0,
        tasa,
        detalle_huecos: [],
        lee_metrica: 'A12',
        recalcula_metrica: false,
        finge_cuadre: false,
        base: { esperados, recibidos, tasa }
      }
    };
  }

  // evaluar + aviso a K2 (por EVENTO, contrato tolerante).
  async _evaluarConAviso(d, metrica) {
    const res = this._evaluar({ ...metrica, project_id: (d && d.project_id) || (metrica && metrica.project_id) });
    if (res.status !== 200) {
      this.eventBus?.publish('contabilidad.cuadre.failed', {
        ...res,
        correlation_id: d && d.correlation_id
      });
      return res;
    }

    // El veredicto de cuadre es de contabilidad: se publica SIEMPRE.
    this.eventBus?.publish('contabilidad.cuadre_evaluado', {
      ...res.data,
      cierre: (d && d.clave_natural) || null,
      correlation_id: d && d.correlation_id
    });

    // Si falta cobertura, AVISA: se PIDE el aviso a K2 (fire-and-forget tolerante).
    if (res.data.avisa) {
      const aviso = this._avisar(d, res.data);
      if (aviso.status !== 200) {
        this.eventBus?.publish('contabilidad.cuadre.failed', aviso);
        return res;
      }
      await this._pedirAviso(d, res.data, aviso.data);
    }
    return res;
  }

  // avisar(evaluacion) -> senal al motor de avisos (K2).
  _avisar(input, evaluacion) {
    const pid = (input && input.project_id) || (evaluacion && evaluacion.project_id);
    if (!pid) return this._invalid('project_id');
    if (!evaluacion || !evaluacion.falta_cobertura) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'no se avisa de un cuadre que no falta cobertura', { veredicto: evaluacion && evaluacion.veredicto });
    }
    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'AVISO_CUADRE',
        origen: 'C6_AVISO_CUADRE',
        motivo: evaluacion.motivo,
        destinatario: evaluacion.destinatario || DESTINATARIO_CONTABLE,
        cola_destino: evaluacion.destinatario || DESTINATARIO_CONTABLE,
        prioridad: evaluacion.tasa < 0.5 ? 'ALTA' : 'NORMAL',
        contexto: {
          periodo: evaluacion.periodo,
          esperados: evaluacion.esperados,
          recibidos: evaluacion.recibidos,
          huecos: evaluacion.huecos,
          tasa: evaluacion.tasa,
          verticales: evaluacion.verticales,
          lee_metrica: 'A12'
        }
      }
    };
  }

  // Aviso a motor-avisos (K2) por EVENTO. CONTRATO TOLERANTE.
  async _pedirAviso(d, evaluacion, senal) {
    const resp = await this._rpc('contabilidad.aviso.solicitar.request', {
      project_id: senal.project_id,
      origen: senal.origen,
      tipo: senal.tipo,
      motivo: senal.motivo,
      destinatario: senal.destinatario,
      cola_destino: senal.cola_destino,
      prioridad: senal.prioridad,
      contexto: senal.contexto,
      correlation_id: d && d.correlation_id
    }, { timeout_ms: 4000 });

    if (!resp || resp.status !== 200) {
      // K2 no responde: el VEREDICTO de cuadre queda emitido igualmente;
      // NO se fabrica el aviso.
      this.eventBus?.publish('contabilidad.aviso.solicitar.failed', {
        status: (resp && resp.status) || 503,
        error: {
          code: 'DEPENDENCIA_NO_DISPONIBLE',
          message: 'motor-avisos (K2) no respondio: el veredicto de cuadre queda EMITIDO, no se fabrica el aviso',
          details: { dependencia: 'motor-avisos', tipo: senal.tipo, huecos: evaluacion.huecos }
        },
        correlation_id: d && d.correlation_id
      });
      return null;
    }
    return resp;
  }

  // Leer la metrica UNICA a A12 por EVENTO (contrato TOLERANTE). No se recalcula.
  async _leerMetrica(d) {
    const pid = d && d.project_id;
    if (!pid) return null;
    const resp = await this._rpc('contabilidad.cobertura.calcular.request', {
      project_id: pid,
      periodo: (d && d.clave_natural) || (d && d.periodo) || null
    }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200) return null;
    return resp.data || null;
  }

  // ── Tools ──
  toolEvaluar(params) { return this._evaluar(params.cobertura || params.cierre || params); }
  toolAvisar(params) { return this._avisar(params, params && params.evaluacion); }
  toolLeerMetrica(params) { return this._leerMetrica(params); }
}

module.exports = AvisoCuadre;

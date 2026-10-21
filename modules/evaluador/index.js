/**
 * evaluador — REFLEJO PURO (sin estado) del dictamen de fichas del radar.
 *
 * Contrato (plan-construccion.md HOJA 2):
 *   entrada = evaluador.evaluar.request { project_id, candidatoId } (reloj / interfaz)
 *   salida  = evaluador.veredicto_emitido { project_id, candidatoId, veredicto, detalle, criterios_faltantes? }
 *   regla   = por criterio de la ficha: evidencia no vacía → CON_EVIDENCIA; vacía → FALTA_EVIDENCIA.
 *             algún criterio en FALTA → veredicto FALTA_EVIDENCIA + criterios_faltantes (M10: el banco aparca).
 *             los 6 con evidencia → dictamen PASA propuesto (transparente: detalle por criterio).
 *   no hace = NO decide si el contenido vale (M11: el dueño confirma la decisión final);
 *             NO inventa evidencia — una ficha sin dato nunca viaja a la newsletter.
 *
 * FORMA: reflejo puro sin persistencia. Única dependencia: RPC banco.obtener.request
 * (el banco custodia la ficha). Sin egress al exterior → no necesita interruptor propio.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

// Los 6 ejes fijos de la ficha (FASE 2 §2). El dictamen se decide SOLO sobre estos;
// cualquier criterio extra presente en la ficha se muestra en el detalle (transparencia), no decide.
const CRITERIOS = Object.freeze([
  'DOLOR_RECURRENTE',
  'DISPOSICION_A_PAGAR',
  'AUDIENCIA_ACCESIBLE',
  'EVIDENCIA_DE_DEMANDA',
  'COMPETENCIA_NO_SATURADA',
  'ACCIONABLE'
]);

class EvaluadorReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'evaluador';
    this.version = 'reflejo-0.1.0';
  }

  // ── Handlers RPC ──
  onEvaluarRequest(e) { return this._atender(e, 'evaluar', 'evaluador.evaluar.response', (d) => this._evaluar(d)); }
  onFichaRequest(e)   { return this._atender(e, 'ficha', 'evaluador.ficha.response', (d) => this._ficha(d)); }

  // ── Proyecciones ──

  // _evaluar: dictamen determinista sobre los 6 criterios de la ficha del candidato.
  // Lee la ficha vía banco.obtener.request (el banco es el custodio). Emite
  // evaluador.veredicto_emitido para que el banco aplique la transición de estado.
  async _evaluar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.candidatoId) return this._invalid('candidatoId');

    const res = await this._obtenerCandidato(input);
    if (res.error) return res.error;
    const candidato = res.candidato;

    const ficha = candidato.ficha || {};
    const criterios = ficha.criterios || {};
    const detalle = {};
    const faltantes = [];

    // Criterios fijos: estado por evidencia; los extras se reflejan sin decidir.
    for (const c of CRITERIOS) {
      const entrada = criterios[c] || {};
      const evidencia = Array.isArray(entrada.evidencia) ? entrada.evidencia : [];
      detalle[c] = { estado: evidencia.length > 0 ? 'CON_EVIDENCIA' : 'FALTA_EVIDENCIA', evidencia };
      if (evidencia.length === 0) faltantes.push(c);
    }
    for (const [c, entrada] of Object.entries(criterios)) {
      if (CRITERIOS.includes(c)) continue;
      const evidencia = Array.isArray(entrada && entrada.evidencia) ? entrada.evidencia : [];
      detalle[c] = { estado: evidencia.length > 0 ? 'CON_EVIDENCIA' : 'FALTA_EVIDENCIA', evidencia, extra: true };
    }

    const veredicto = faltantes.length > 0 ? 'FALTA_EVIDENCIA' : 'PASA';
    const payload = {
      project_id: input.project_id,
      candidatoId: candidato.id,
      veredicto,
      detalle
    };
    if (faltantes.length > 0) payload.criterios_faltantes = faltantes;

    this._publicarEvento('evaluador.veredicto_emitido', payload);
    return { status: 200, data: { candidatoId: candidato.id, veredicto, criterios_faltantes: faltantes, detalle } };
  }

  // _ficha: vista transparente del candidato + detalle por criterio (M11: el dueño
  // ve TODO — la evidencia de cada eje — antes de confirmar o corregir).
  async _ficha(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.candidatoId) return this._invalid('candidatoId');

    const res = await this._obtenerCandidato(input);
    if (res.error) return res.error;
    const candidato = res.candidato;

    const criterios = (candidato.ficha && candidato.ficha.criterios) || {};
    const detallePorCriterio = {};
    for (const c of CRITERIOS) {
      const entrada = criterios[c] || {};
      const evidencia = Array.isArray(entrada.evidencia) ? entrada.evidencia : [];
      detallePorCriterio[c] = { estado: evidencia.length > 0 ? 'CON_EVIDENCIA' : 'FALTA_EVIDENCIA', evidencia };
    }

    return { status: 200, data: { candidato, detallePorCriterio } };
  }

  // _obtenerCandidato: RPC al custodio. Devuelve { candidato } o { error } (canónico).
  async _obtenerCandidato(input) {
    const r = await this._rpc('banco.obtener.request', { project_id: input.project_id, id: input.candidatoId });
    if (!r) {
      const err = this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE', 'banco no respondió a banco.obtener.request');
      this._emitirFailed(input, err.error);
      return { error: err };
    }
    if (r.status !== 200 || !r.data || !r.data.candidato) {
      const err = this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'candidato_no_encontrado', { id: input.candidatoId });
      this._emitirFailed(input, err.error);
      return { error: err };
    }
    return { candidato: r.data.candidato };
  }

  // Par de fallo canónico: el reloj/interfaz saben que la evaluación no cerró.
  _emitirFailed(input, error) {
    this._publicarEvento('evaluador.evaluar.failed', {
      project_id: input.project_id,
      candidatoId: input.candidatoId,
      code: error.code,
      message: error.message
    });
  }

  _publicarEvento(evento, payload) {
    this.eventBus?.publish(evento, payload);
  }
}

module.exports = EvaluadorReflejo;
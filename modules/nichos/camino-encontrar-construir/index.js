/**
 * nichos/camino-encontrar-construir — MICRO-AGENTE (juicio asistido): la pieza C4.
 *
 * Decide, para cada OPCION de nicho, si la oportunidad se ENCUENTRA o se CONSTRUYE:
 *   ENCONTRAR — hay demanda real (veredicto VIABLE / demanda de 1er orden suficiente)
 *               y la solucion se puede servir con las CAPACIDADES existentes del
 *               proyecto (catalogo-capacidades D3): no hay que crear nada, se aprovecha.
 *   CONSTRUIR — la necesidad no existe todavia o falta CAPACIDAD para materializarla
 *               (invariante D3 "lo que falta se crea"): hay que construir la solucion.
 *   PUENTE    — el riesgo declarado es ALTO o no hay datos para decidir con honestidad:
 *               en vez de decidir solo, SUBE una SolicitudDecision (D2/K2) y no decide
 *               por cuenta propia (REGLA del sistema, ver 5.3 - decision humana).
 *
 * Recibe: { project_id, nicho, veredicto?, estudio?, capacidades? } —
 *   veredicto: el de veredicto-viabilidad (C3, VIABLE|NO_VIABLE|PUENTE), si ya se emitio.
 *   capacidades: la respuesta de catalogo-capacidades (D3, disponibles/faltantes), si se consulto.
 *   riesgo:  0-1 declarado por el dueño/ensamblador (riesgo alto -> sube decision).
 *
 * HIBRIDO (patrón real de nichos/veredicto-viabilidad + estudio-demanda):
 *   _decidirReflejo — REFLEJO determinista: de veredicto y capacidades deriva el camino
 *                     base por reglas (no inventa: solo usa lo que llega).
 *   _concluir       — FUZZY (juicio LLM): guion-prompt + el caso -> llm.complete.request
 *                     -> camino asistido en JSON tipado. Si falla, el reflejo asegura el camino.
 *   _subirRiesgo    — riesgo alto -> emite la SolicitudDecision (payload a K2/D2), NO decide.
 *
 * NUNCA decide solo un camino de alto riesgo: lo SUBE. Sin store, sin custodio.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// ── guion-prompt del micro-agente (self-contained) ──
const GUION_CAMINO =
  'Eres el DECISOR DE CAMINO de un buscador de nichos de negocio. Recibes la OPORTUNIDAD de un ' +
  'nicho con su VEREDICTO DE VIABILIDAD (VIABLE|NO_VIABLE|PUENTE), el ESTUDIO DE DEMANDA (si mide ' +
  'demanda real) y el CATALOGO DE CAPACIDADES del proyecto (existentes y faltantes para construir la ' +
  'solucion). Decide si la oportunidad se ENCUENTRA (hay demanda real y la solucion se sirve con las ' +
  'capacidades existentes, sin construir nada nuevo) o se CONSTRUYE (la necesidad no existe todavia o ' +
  'falta capacidad para materializarla -> hay que construir la solucion). Reglas: usa SOLO los datos que ' +
  'te dan. Si hay demanda real y capacidades existentes -> ENCONTRAR; si falta capacidad o no hay demanda ' +
  'establecida -> CONSTRUIR; si no hay datos suficientes para decidir con honestidad -> PUENTE. Responde ' +
  'SOLO JSON: {"camino":"ENCONTRAR|CONSTRUIR|PUENTE","riesgo":<0-1>,"motivo":"<frase breve en espanol>"}.';

// Constante de la SolicitudDecision (evento de dominio a K2/D2).
const EVENTO_SOLICITUD = 'nichos.gate.solicitado';

class CaminoEncontrarConstruir extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'camino-encontrar-construir';
    this.version = 'reflejo-0.1.0';
    this.project_id = null;
  }
  async onUnload() { return super.onUnload(); }

  onDecidirRequest(e) {
    return this._atender(e, 'decidir', 'nichos.camino.decidir.response', async (d) => {
      const res = await this._decidir(d);
      // Fire-and-forget de dominio: exito → decidido; fallo → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.camino.decidido', res.data);
        // Riesgo alto declarado → sube la SolicitudDecision (NUNCA decide solo).
        if (res.data.riesgo_alto) this._subirRiesgo(res.data);
      } else {
        this.eventBus?.publish('nichos.camino.decidir.failed', res);
      }
      return res;
    });
  }

  // ── el juicio: decisiones base por reglas (reflejo) + asistencia fuzzy + riesgo ──
  async _decidir({ project_id, nicho, veredicto, estudio, capacidades, riesgo = 0 } = {}) {
    project_id = project_id || this.project_id;
    if (!nicho || typeof nicho !== 'object') {
      return this._errorResponse(400, 'NICHO_INVALIDO', 'la opcion de nicho es obligatoria para decidir el camino', { project_id });
    }
    riesgo = Number(riesgo);
    riesgo = Number.isFinite(riesgo) ? Math.min(1, Math.max(0, riesgo)) : 0;

    // Reflejo determinista primero: ancla el camino en los datos que llegan.
    const base = this._decidirReflejo({ veredicto, estudio, capacidades });
    let camino = base.camino;
    let motivo = base.motivo;

    // Asistencia fuzzy: si el LLM responde con un camino valido, refina (solo si riesgo < alto).
    if (riesgo < 0.7) {
      const asistido = await this._concluir({ veredicto, estudio, capacidades, riesgo, base });
      if (asistido && ['ENCONTRAR', 'CONSTRUIR', 'PUENTE'].includes(asistido.camino)) {
        camino = asistido.camino;
        motivo = asistido.motivo;
      }
    }

    const riesgoAlto = camino === 'PUENTE' || riesgo >= 0.7;
    return {
      status: 200,
      data: {
        project_id,
        nicho,
        camino,
        motivo,
        riesgo,
        riesgo_alto: riesgoAlto,
        capacidad_faltante: (capacidades && capacidades.capacidades_faltantes && capacidades.capacidades_faltantes.length) || 0,
        decidido: true
      }
    };
  }

  // ── REFLEJO determinista: deriva el camino de veredicto + capacidades ──
  _decidirReflejo({ veredicto, estudio, capacidades }) {
    const hayDemanda = (veredicto && veredicto === 'VIABLE') ||
      (estudio && estudio.demanda_1er_orden && estudio.demanda_1er_orden.fuerza_demanda >= 0.4);
    // Faltantes del catalogo (si el ensamblador consulto capacidades).
    const faltantes = (capacidades && Array.isArray(capacidades.capacidades_faltantes))
      ? capacidades.capacidades_faltantes.length : 0;
    const existeCapacidad = (capacidades && Array.isArray(capacidades.capacidades_disponibles)
      && capacidades.capacidades_disponibles.length > 0);

    if (hayDemanda && existeCapacidad && faltantes === 0) {
      return { camino: 'ENCONTRAR', motivo: 'hay demanda real y la solucion se sirve con las capacidades existentes del proyecto' };
    }
    if (hayDemanda && faltantes > 0) {
      return { camino: 'CONSTRUIR', motivo: 'hay demanda pero falta capacidad para materializar la solucion: se construye (D3)' };
    }
    if (!hayDemanda && (estudio || veredicto)) {
      return { camino: 'CONSTRUIR', motivo: 'la necesidad no esta establecida: hay que crear la demanda (construir)' };
    }
    return { camino: 'PUENTE', motivo: 'sin datos suficientes de demanda o capacidades: no se decide por defecto' };
  }

  // ── FUZZY: 1 llamada llm.complete.request con el guion + el caso ──
  async _concluir(caso) {
    const resp = await this._rpc('llm.complete.request', {
      system: GUION_CAMINO,
      messages: [{ role: 'user', content: JSON.stringify(caso) }],
      tools: [], settings: { temperature: 0.2 }
    }, { timeout_ms: 30000 }).catch(() => null);
    if (!resp || resp.status >= 400) return null;
    return this._parse(resp);
  }

  // ── FUZZY: extrae el JSON del completado (tolera fences y texto) ──
  _parse(resp) {
    let c = resp?.data?.content ?? resp?.content ?? resp?.data?.text ?? resp?.text ?? resp?.data?.message ?? '';
    if (c && typeof c === 'object' && c.camino) return c;
    if (c && typeof c === 'object') return c;
    if (typeof c !== 'string') return null;
    c = c.replace(/```json/gi, '').replace(/```/g, '').trim();
    const i = c.indexOf('{'), j = c.lastIndexOf('}');
    if (i < 0 || j < 0 || j < i) return null;
    try { return JSON.parse(c.slice(i, j + 1)); } catch { return null; }
  }

  // ── riesgo alto: emite la SolicitudDecision a K2/D2 (NUNCA decide el sistema solo) ──
  _subirRiesgo(d) {
    this.eventBus?.publish(EVENTO_SOLICITUD, {
      tipo: 'CAMINO_CONSTRUIR_ALTO_RIESGO',
      project_id: d.project_id,
      nicho: d.nicho,
      camino_propuesto: d.camino,
      riesgo: d.riesgo,
      motivo: d.motivo,
      estado: 'PENDIENTE',
      decision: null
    });
  }
}

module.exports = CaminoEncontrarConstruir;

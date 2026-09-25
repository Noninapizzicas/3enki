/**
 * nichos/paquete-decision — MICRO-AGENTE (fuzzy): arma un paquete de decision
 * autocxplicado para el dueño (H1).
 *
 * Dado un NICHO y la evidencia/riesgo/alternativa, arma un PAQUETE DE DECISION
 * autocxplicado: nicho + evidencia + riesgo + alternativa, en estructura JSON que
 * el dueño puede leer y decidir (APRUEBA/RECHAZA). Lo consume el
 * gate-decision-operar (E2) y el canal-supervision (G1) via nichos.paquete_construido.
 *
 * Híbrido (patrón real de nichos/proponedor-modelo-cobro):
 *   _hidratarReflejo    — REFLEJO (mecánico, determinista): valida el nicho y
 *                         hidrata la evidencia/riesgo/alternativa en estructura.
 *   _redactarSintesis   — FUZZY (juicio LLM): un guion-prompt self-contained +
 *                         los datos -> llm.complete.request -> sintesis autocxplicada.
 *                         Si falla → fallback reflejo (_sintesisReflejo) garantiza
 *                         un resumen derivado de los datos.
 *
 * NUNCA inventa: no fabrica evidencia/riesgo/alternativa ausentes; si el nicho viene
 * vacio → par de fallo honesto (nichos.paquete.construir.failed). Sin store,
 * sin custodio.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// ── guion-prompt del micro-agente (self-contained) ──
const GUION_SINTESIS =
  'Eres el REDACTOR DE PAQUETES DE DECISION de un buscador de nichos de negocio. Recibes un NICHO ' +
  'construido, la EVIDENCIA (que apoya operar), el RIESGO (que amenaza operar) y la ALTERNATIVA (que ' +
  'se puede hacer en su lugar). Tu trabajo es escribir la SINTESIS autocxplicada que el duenyo lee ' +
  'antes de decidir: que se propone, por que (evidencia), que puede salir mal (riesgo) y que otra ' +
  'opcion existe (alternativa). Reglas: usa SOLO los datos que te dan, NO inventes evidencia, riesgo ' +
  'ni alternativa ausentes. Responde SOLO JSON: {"sintesis":"<2-3 frases en espanol>"}.';

class PaqueteDecision extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'paquete-decision';
    this.version = 'reflejo-0.1.0';
    this.project_id = null;
  }
  async onUnload() { return super.onUnload(); }

  onConstruirRequest(e) {
    return this._atender(e, 'construir', 'nichos.paquete.construir.response', async (d) => {
      const res = await this._construir(d);
      // Fire-and-forget de dominio: exito → construido; fallo → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.paquete_construido', res.data);
      } else {
        this.eventBus?.publish('nichos.paquete.construir.failed', res);
      }
      return res;
    });
  }

  // ── el juicio: hidrata reflejos (reflejo) + sintetiza (fuzzy) ──
  async _construir({ project_id, nicho, evidencia, riesgo, alternativa } = {}) {
    project_id = project_id || this.project_id;
    const hidrato = this._hidratarReflejo({ nicho, evidencia, riesgo, alternativa });
    if (hidrato.status !== 200) {
      return this._errorResponse(hidrato.status, hidrato.error?.code, hidrato.error?.message, { project_id });
    }
    // Juicio fuzzy: sintesis autocxplicada. Si falla → fallback reflejo por reglas.
    let sintesis = await this._redactarSintesis(hidrato.data);
    if (!sintesis) {
      sintesis = this._sintesisReflejo(hidrato.data);
    }
    if (!sintesis) {
      return this._errorResponse(502, 'SIN_SINTESIS', 'el juicio no pudo sintetizar el paquete de decision', { project_id, nicho });
    }
    return {
      status: 200,
      data: { project_id, ...hidrato.data, sintesis, construido: true }
    };
  }

  // ── REFLEJO (mecánico, determinista): valida el nicho y normaliza la celula ──
  _hidratarReflejo({ nicho, evidencia, riesgo, alternativa } = {}) {
    if (!nicho || typeof nicho !== 'object') {
      return this._errorResponse(400, 'NICHO_INVALIDO', 'el nicho es obligatorio para armar el paquete de decision', {});
    }
    const nombre = nicho.producto || nicho.servicio || nicho.nombre || nicho.id || null;
    const evidenciaTxt = (Array.isArray(evidencia) && evidencia.length > 0) ? evidencia.map(e => String(e).trim()) : ['sin evidencia declarada'];
    const riesgoTxt = (Array.isArray(riesgo) && riesgo.length > 0) ? riesgo.map(r => String(r).trim()) : ['sin riesgo declarado'];
    const alternativaTxt = (Array.isArray(alternativa) && alternativa.length > 0) ? alternativa.map(a => String(a).trim()) : ['sin alternativa declarada'];
    return {
      status: 200,
      data: {
        nicho: nombre,
        tipo_nicho: nicho.tipo || null,
        evidencia: evidenciaTxt,
        riesgo: riesgoTxt,
        alternativa: alternativaTxt,
        autocxplicado: true
      }
    };
  }

  // ── FUZZY: 1 llamada llm.complete.request con el guion + los datos ──
  async _redactarSintesis(celula) {
    const resp = await this._rpc('llm.complete.request', {
      system: GUION_SINTESIS,
      messages: [{ role: 'user', content: JSON.stringify(celula) }],
      tools: [], settings: { temperature: 0.2 }
    }, { timeout_ms: 30000 }).catch(() => null);
    if (!resp || resp.status >= 400) return null;
    const t = this._parseSintesis(resp);
    return t && t.trim() ? t.trim() : null;
  }

  // ── FUZZY: extrae la sintesis del completado (tolera fences ```json y texto) ──
  _parseSintesis(resp) {
    let c = resp?.data?.content ?? resp?.content ?? resp?.data?.text ?? resp?.text ?? resp?.data?.message ?? '';
    if (c && typeof c === 'object' && c.sintesis && typeof c.sintesis === 'string') return c.sintesis;
    if (typeof c !== 'string') return null;
    const original = c;
    c = c.replace(/```json/gi, '').replace(/```/g, '').trim();
    const i = c.indexOf('{'), j = c.lastIndexOf('}');
    if (i >= 0 && j > i) {
      try {
        const o = JSON.parse(c.slice(i, j + 1));
        if (o && o.sintesis && typeof o.sintesis === 'string') return o.sintesis;
      } catch (_) { /* cae al final */ }
    }
    if (original && typeof original === 'string' && original.trim().length > 1) return original.trim();
    return null;
  }

  // ── REFLEJO (fallback determinista): sintesis derivada de los datos, nunca inventa ──
  _sintesisReflejo(celula) {
    const evidencia = celula.evidencia[0] === 'sin evidencia declarada' ? '' : ` apoyada en: ${celula.evidencia.join('; ')}.`;
    const riesgo = celula.riesgo[0] === 'sin riesgo declarado' ? '' : ` Riesgo: ${celula.riesgo.join('; ')}.`;
    const alternativa = celula.alternativa[0] === 'sin alternativa declarada' ? '' : ` Alternativa: ${celula.alternativa.join('; ')}.`;
    return `Se propone operar el nicho "${celula.nicho}"${evidencia}${riesgo}${alternativa}`.trim();
  }
}

module.exports = PaqueteDecision;

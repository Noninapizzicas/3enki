/**
 * nichos/propuesta-valor-canal — MICRO-AGENTE (I2): propone como el nicho gana
 * confianza y compra en su territorio.
 *
 * Dado un NICHO viable y los datos de su canal (estudio-competencia, sondeo-
 * territorio), escribe la PROPUESTA DE VALOR: el copy/posicionamiento que
 * conecta el problema del cliente con la promesa del producto, adaptado al
 * territorio donde se vende.
 *
 * HIBRIDO (patrón real de estudio-demanda):
 *   _proponerMensajeFuzzy   — FUZZY: 1 llamada llm.complete.request con guion
 *                             self-contained + el nicho y los datos de canal.
 *   _proponerMensajeReflejo  — REFLEJO determinista: plantilla declarada que
 *                             arma copy a partir del producto/audiencia/territorio.
 * SIEMPRE devuelve {copy, posicionamiento, promesa, canal_target}. NUNCA inventa:
 * un nicho vacío o sin identidad → par de fallo honesto.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// ── guion-prompt del micro-agente (self-contained) ──
const GUION_PROPONER =
  'Eres el REDACTOR DE PROPUESTA DE VALOR de un buscador de nichos de negocio. Recibes un NICHO ' +
  '(su producto/servicio, su audiencia, su territorio) y los DATOS DEL CANAL de ese territorio ' +
  '(competencia y senales de demanda). Tu trabajo es REDACTAR la propuesta de valor: como el nicho ' +
  'gana confianza y compra en ese territorio concreto. Entrega: COPY (el mensaje clave, breve), ' +
  'POSICIONAMIENTO (una frase de como se diferencia), PROMESA (que beneficio concreto promete al ' +
  'cliente) y CANAL_TARGET (el canal o segmento donde tiene mas sentido). Reglas: usa SOLO los datos ' +
  'que te dan, NO inventes competidores, precios ni canales inexistentes. Responde SOLO con un JSON: ' +
  '{"copy":"...","posicionamiento":"...","promesa":"...","canal_target":"..."} en espanol.';

// ── REFLEJO (plantillas declaradas, sin LLM): arma el copy de los datos del nicho ──
function capitalizar(s) {
  if (!s) return '';
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

class PropuestaValorCanal extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'propuesta-valor-canal';
    this.version = 'reflejo-0.1.0';
    this.project_id = null;
  }
  async onUnload() { return super.onUnload(); }

  // project.activated — micro-agente sin estado: solo registra el project activo.
  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    this.project_id = d.project_id || this.project_id;
    this.logger?.info(`${this.name}.reflejo.project_activated`, { project_id: this.project_id });
    return { status: 200, data: { project_id: this.project_id } };
  }

  onProponerRequest(e) {
    return this._atender(e, 'proponer', 'nichos.copy.proponer.response', async (d) => {
      const res = await this._proponer(d);
      // Fire-and-forget de dominio: exito → copy_propuesto; fallo → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.copy_propuesto', res.data);
      } else {
        this.eventBus?.publish('nichos.copy.proponer.failed', res);
      }
      return res;
    });
  }

  // ── el juicio: valida el nicho, intenta fuzzy y cae al reflejo por plantilla ──
  async _proponer({ project_id, nicho, canal } = {}) {
    project_id = project_id || this.project_id;
    if (!nicho || typeof nicho !== 'object') {
      return this._errorResponse(400, 'NICHO_INVALIDO', 'el nicho es obligatorio para proponer la propuesta de valor', { project_id });
    }
    const identidad = this._identidadDelNicho(nicho, canal);
    if (!identidad.producto && !identidad.audiencia) {
      return this._errorResponse(400, 'NICHO_SIN_IDENTIDAD', 'el nicho debe tener producto o audiencia para proponer valor', { project_id });
    }
    // Intento fuzzy. Si falla o no cumple contrato → fallback reflejo por plantilla.
    let propuesta = await this._proponerFuzzy(project_id, nicho, canal);
    if (!propuesta || !propuesta.copy) {
      propuesta = this._proponerReflejo(identidad, canal);
    }
    return {
      status: 200,
      data: {
        project_id,
        nicho,
        copy: propuesta.copy,
        posicionamiento: propuesta.posicionamiento,
        promesa: propuesta.promesa,
        canal_target: propuesta.canal_target,
        fuente: propuesta.fuente,
        propuesto: true
      }
    };
  }

  // ── REFLEJO: extrae la identidad declarada del nicho (producto/audiencia/territorio) ──
  _identidadDelNicho(nicho, canal) {
    return {
      producto: nicho.producto || nicho.servicio || null,
      audiencia: nicho.audiencia || nicho.cliente || null,
      territorio: nicho.territorio || nicho.canal || nicho.lugar || canal || null
    };
  }

  // ── FUZZY: 1 llamada llm.complete.request con el guion + el nicho y el canal ──
  async _proponerFuzzy(project_id, nicho, canal) {
    const resp = await this._rpc('llm.complete.request', {
      system: GUION_PROPONER,
      messages: [{ role: 'user', content: JSON.stringify({ nicho, canal }) }],
      tools: [], settings: { temperature: 0.7 }
    }, { timeout_ms: 30000 }).catch(() => null);
    if (!resp || resp.status >= 400) return null;
    return this._parsePropuesta(resp);
  }

  // ── FUZZY: extrae el JSON de la propuesta (tolera fences ```json y texto) ──
  _parsePropuesta(resp) {
    let c = resp?.data?.content ?? resp?.content ?? resp?.data?.text ?? resp?.text ?? resp?.data?.message ?? '';
    if (c && typeof c === 'object' && c.copy) return { ...c, fuente: 'fuzzy' };
    if (typeof c !== 'string') return null;
    c = c.replace(/```json/gi, '').replace(/```/g, '').trim();
    const i = c.indexOf('{'), j = c.lastIndexOf('}');
    if (i >= 0 && j > i) {
      try {
        const o = JSON.parse(c.slice(i, j + 1));
        if (o && o.copy) return { copy: o.copy, posicionamiento: o.posicionamiento, promesa: o.promesa, canal_target: o.canal_target, fuente: 'fuzzy' };
      } catch (_) { /* cae al final */ }
    }
    return null;
  }

  // ── REFLEJO (fallback determinista): plantilla declarada de los datos del nicho ──
  _proponerMensajeReflejo(identidad) {
    const producto = identidad.producto || capitalizar(identidad.audiencia);
    const audiencia = identidad.audiencia || 'tu mercado';
    const territorio = identidad.territorio || 'tu zona';
    return {
      copy: `${producto} pensado para ${audiencia}, y al alcance en ${territorio}.`,
      posicionamiento: `La opcion que combina calidad local y precio honesto para ${audiencia} en ${territorio}.`,
      promesa: `Resolvemos tu necesidad de ${producto} sin complicaciones: rapido, claro y cercano.`,
      canal_target: territorio,
      fuente: 'reflejo'
    };
  }

  _proponerReflejo(identidad, _canal) {
    return this._proponerMensajeReflejo(identidad);
  }

  // ── Tools ──
  toolProponer(params) { return this._proponer(params); }
}

module.exports = PropuestaValorCanal;

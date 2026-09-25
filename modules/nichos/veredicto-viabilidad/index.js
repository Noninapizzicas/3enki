/**
 * nichos/veredicto-viabilidad — MICRO-AGENTE (juicio asistido): la pieza C3 del
 * ESLABON LIMITANTE del sistema (validacion, embudo C).
 *
 * Recibe el ESTUDIO DE DEMANDA ya medido (estudio-demanda C1, nichos.estudio.medido)
 * y el CRITERIO DE VIABILIDAD vigente (criterio-viabilidad C2, umbral ingresos +
 * minimos de demanda) y decide, por candidato: VIABLE | NO_VIABLE | PUENTE.
 *
 *   VIABLE   — la demanda medida supera/iguala el criterio vigente (ingresos
 *              prospectivos y/o minimos de demanda). Entra al tramo caro con control.
 *   NO_VIABLE — la demanda no alcanza el criterio. El corte DURO lo aplica C6
 *              (corte-temprano), NO este agente: aqui solo se evalúa y se declara
 *              el veredicto. Un NO_VIABLE NUNCA avanza a construccion.
 *   PUENTE   — el juicio no tiene datos suficientes / el criterio no esta declarado:
 *              no se decide por defecto, se sube a decision humana (D2/K2), nunca
 *              se asume viable.
 *
 * HIBRIDO (patrón real de nichos/normalizacion-semilla + estudio-demanda):
 *   _evaluarReflejo — REFLEJO determinista (numeros declarados): contrasta el estudio
 *                     contra el criterio por reglas y devuelve el veredicto base.
 *   _concluir       — FUZZY (juicio LLM): un guion-prompt self-contained + el estudio
 *                     y el criterio -> llm.complete.request -> veredicto asistido en
 *                     JSON tipado. Si el LLM falla o no cumple el contrato, el reflejo
 *                     determinista por reglas asegura el veredicto (no rompe el embudo).
 *
 * NUNCA inventa: no fabrica demanda que el estudio no apoye; si el estudio viene vacio
 * o el criterio no permite decidir -> par de fallo honesto (nichos.veredicto.evaluar.failed)
 * o veredicto PUENTE con motivo explicito. Sin store, sin custodio.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// ── guion-prompt del micro-agente (self-contained) ──
const GUION_VEREDICTO =
  'Eres el VEREDICTOR DE VIABILIDAD de un buscador de nichos de negocio. Recibes el ' +
  'ESTUDIO DE DEMANDA ya medido (demanda de 1er orden y disposicion a pagar) y el CRITERIO ' +
  'DE VIABILIDAD vigente (umbral de ingresos minimo y minimos de demanda). Decide si el nicho ' +
  'es viable para invertir en construirlo. Usa SOLO los numeros del estudio y del criterio que ' +
  'te dan; NO inventes datos de demanda ni de precio ausentes. Reglas: si la demanda medida ' +
  'supera o iguala el criterio -> VIABLE; si no alcanza el criterio -> NO_VIABLE; si falta ' +
  'informacion para decidir con honestidad -> PUENTE. Responde SOLO JSON: ' +
  '{"veredicto":"VIABLE|NO_VIABLE|PUENTE","confianza":<0-1>,"motivo":"<frase breve en espanol>"}.';

class VeredictoViabilidad extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'veredicto-viabilidad';
    this.version = 'reflejo-0.1.0';
    this.project_id = null;
  }
  async onUnload() { return super.onUnload(); }

  onEvaluarRequest(e) {
    return this._atender(e, 'evaluar', 'nichos.veredicto.evaluar.response', async (d) => {
      const res = await this._evaluar(d);
      // Fire-and-forget de dominio: exito → emitido; fallo → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.veredicto.emitido', res.data);
      } else {
        this.eventBus?.publish('nichos.veredicto.evaluar.failed', res);
      }
      return res;
    });
  }

  // ── el juicio: evalua (reflejo) + concluye (fuzzy), con fallback reflejo ──
  async _evaluar({ project_id, estudio, criterio } = {}) {
    project_id = project_id || this.project_id;
    if (!estudio || typeof estudio !== 'object') {
      return this._errorResponse(400, 'ESTUDIO_INVALIDO', 'el estudio de demanda es obligatorio para evaluar la viabilidad', { project_id });
    }
    // Reflejo determinista primero: ancla el veredicto en numeros reales.
    const base = this._evaluarReflejo(estudio, criterio);
    if (base.motivo === 'SIN_CRITERIO') {
      // Sin criterio declarable no se decide por defecto: PUENTE honesto.
      return this._emitir(project_id, estudio, criterio, 'PUENTE', 0.2, 'sin criterio de viabilidad declarado: no se asume viable');
    }
    // Juicio fuzzy asistido (si responde y valida, refina; si no, cae al reflejo ya calculado).
    const asistido = await this._concluir(estudio, criterio, base);
    const v = asistioValido(asistido) ? asistido : base;
    return this._emitir(project_id, estudio, criterio, v.veredicto, v.confianza, v.motivo);
  }

  // ── REFLEJO determinista (numeros declarados): contraste estudio vs criterio ──
  _evaluarReflejo(estudio, criterio) {
    // Criterio vigente (puede venir el objeto declarado o un subset).
    const umbral = (criterio && criterio.umbral_ingresos != null) ? Number(criterio.umbral_ingresos) : null;
    const minimos = (criterio && criterio.minimos_demanda) || {};
    const minBusquedas = minimos.numero_busquedas != null ? Number(minimos.numero_busquedas) : null;
    const minContactos = minimos.contactos_semana != null ? Number(minimos.contactos_semana) : null;
    // Si no hay criterio declarable → no se puede adjudicar contra reglas.
    if (umbral == null && minBusquedas == null && minContactos == null) {
      return { veredicto: 'PUENTE', confianza: 0.2, motivo: 'SIN_CRITERIO' };
    }
    // Metricas del estudio.
    const d = (estudio.demanda_1er_orden) || {};
    const fuerza = typeof d.fuerza_demanda === 'number' ? d.fuerza_demanda : 0;
    const volumen = typeof d.volumen_busqueda === 'number' ? d.volumen_busqueda : 0;
    const p = (estudio.disposicion_pagar) || {};
    const precioMedio = typeof p.precio_medio_eur === 'number' ? p.precio_medio_eur : 0;
    // Ingresos prospectivos estimados: volumen de senales x precio medio (proyeccion
    // derivada de los numeros del estudio, NO fabricada). El umbral de ingresos solo
    // se considera cumplido si ademas se cumple el minimo de búsquedas declarado:
    // un precio alto sobre una demanda diminuta NO puede viabilizar el nicho.
    const ingresosProspectivos = this._round(volumen * precioMedio, 2);
    // Contrasta cada dimension declarada.
    const checks = [];
    const cumplidos = [];
    if (umbral != null) {
      const cumpleIngresos = this._cumple(ingresosProspectivos, umbral) &&
        (minBusquedas == null || this._cumple(volumen, minBusquedas));
      checks.push(dimension('umbral_ingresos', cumpleIngresos));
      if (cumpleIngresos) cumplidos.push('umbral_ingresos');
    }
    if (minBusquedas != null) {
      checks.push(dimension('numero_busquedas', this._cumple(volumen, minBusquedas)));
      if (this._cumple(volumen, minBusquedas)) cumplidos.push('numero_busquedas');
    }
    if (minContactos != null) {
      // contactos es un proxy determinista del volumen de senales (no hay contador
      // de contactos separado en el estudio): mismo numero, comparado contra el minimo.
      checks.push(dimension('contactos_semana', this._cumple(volumen, minContactos)));
      if (this._cumple(volumen, minContactos)) cumplidos.push('contactos_semana');
    }
    // Viable si cumple AL MENOS una dimension declarada con solvencia (fuerza suficiente).
    if (cumplidos.length > 0 && fuerza >= 0.4) {
      return { veredicto: 'VIABLE', confianza: this._round(0.6 + 0.1 * cumplidos.length, 2), motivo: `alcanza ${cumplidos.join(', ')}` };
    }
    if (cumplidos.length === 0) {
      return { veredicto: 'NO_VIABLE', confianza: 0.8, motivo: 'la demanda medida no alcanza el criterio de viabilidad vigente' };
    }
    // Hay datos pero la fuerza es baja: no se descarta duro, se sube a decision.
    return { veredicto: 'PUENTE', confianza: 0.4, motivo: 'la demanda alcanza alguna dimension pero la fuerza de demanda es baja' };
  }

  _cumple(valor, minimo) { return valor >= minimo; }

  // ── FUZZY: 1 llamada llm.complete.request con el guion + estudio + criterio ──
  async _concluir(estudio, criterio, base) {
    const resp = await this._rpc('llm.complete.request', {
      system: GUION_VEREDICTO,
      messages: [{ role: 'user', content: JSON.stringify({ estudio, criterio, evaluacion_reflejo: base }) }],
      tools: [], settings: { temperature: 0.2 }
    }, { timeout_ms: 30000 }).catch(() => null);
    if (!resp || resp.status >= 400) return null;
    const out = this._parse(resp);
    return out && out.veredicto ? out : null;
  }

  // ── FUZZY: extrae el JSON del completado (tolera fences y texto) ──
  _parse(resp) {
    let c = resp?.data?.content ?? resp?.content ?? resp?.data?.text ?? resp?.text ?? resp?.data?.message ?? '';
    if (c && typeof c === 'object' && c.veredicto) return c;
    if (c && typeof c === 'object') return c;
    if (typeof c !== 'string') return null;
    c = c.replace(/```json/gi, '').replace(/```/g, '').trim();
    const i = c.indexOf('{'), j = c.lastIndexOf('}');
    if (i < 0 || j < 0 || j < i) return null;
    try { return JSON.parse(c.slice(i, j + 1)); } catch { return null; }
  }

  // ── emisor del veredicto: estructura el dominio publicado ──
  _emitir(project_id, estudio, criterio, veredicto, confianza, motivo) {
    return {
      status: 200,
      data: {
        project_id,
        candidato: estudio.candidato || (estudio.producto || estudio.audiencia || ''),
        estudio,
        criterio,
        veredicto,
        confianza,
        motivo,
        emitido: true
      }
    };
  }
}

// helper de lista de dimensiones evaluadas (para debug/motivo)
function dimension(nombre, cumple) { return { nombre, cumple }; }

// valida que el veredicto asistido sea uno de los tres canonicos
function asistioValido(a) {
  return a && ['VIABLE', 'NO_VIABLE', 'PUENTE'].includes(a.veredicto) &&
    typeof a.confianza === 'number' && a.confianza >= 0 && a.confianza <= 1;
}

module.exports = VeredictoViabilidad;

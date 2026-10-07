/**
 * nichos/clasificador-intencion — MICRO-AGENTE (G3): clasifica la intencion del
 * mensaje que llega del canal del dueno.
 *
 * Dado un MENSAJE (que captura-semilla A1 pudo aceptar como semilla o que llega
 * por el canal de supervision), decide si es:
 *   SEMILLA  — una palabra/idea para arrancar la busqueda de un nicho nuevo.
 *   DECISION — una respuesta/veredicto del dueno a un gate o solicitud (APRUEBA,
 *              RECHAZA, dejo pasar, cobra/sangra, etc.).
 *   CONSULTA — una pregunta de estado/informacion sobre el pipeline o un nicho.
 *
 * HIBRIDO (patrón real de estudio-demanda/normalizacion-semilla):
 *   _clasificarFuzzy   — FUZZY: 1 llamada llm.complete.request con guion
 *                         self-contained + el mensaje → {tipo, confianza}.
 *   _clasificarReflejo  — REFLEJO determinista: reglas de marcadores de lengua
 *                         (verbos/decisiones, signos de pregunta) con fallback
 *                         SEMILLA conservador si no hay marcadore claro.
 * SIEMPRE devuelve {tipo, confianza, senales}. NUNCA inventa: un mensaje que no
 * puede clasificarse (vacío) → par de fallo honesto.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// ── guion-prompt del micro-agente (self-contained) ──
const GUION_CLASIFICAR =
  'Eres el CLASIFICADOR DE INTENCION de un buscador de nichos de negocio. Recibes un MENSAJE ' +
  'del dueno del proyecto. Tu trabajo es clasificar su intencion en UNA de tres categorias: ' +
  'SEMILLA (una palabra o idea nueva para arrancar la busqueda de un nicho), DECISION (una ' +
  'respuesta concreta a una solicitud del sistema: apruebo/rechazo/si/no/cobro/lo dejo), o ' +
  'CONSULTA (una pregunta sobre el estado o informacion del pipeline o de un nicho). Reglas: ' +
  'si el mensaje tiene signo de interrogacion o pide estado/datos, es CONSULTA; si da una ' +
  'respuesta corta con intencion de decidir, es DECISION; si introduce un tema/producto nuevo ' +
  'para explorar, es SEMILLA. Responde SOLO con un JSON: {"tipo":"SEMILLA|DECISION|CONSULTA",' +
  '"confianza":0.0-1.0,"motivo":"breve en espanol"}.';

// Verbos/marcadores de DECISION (reflejo, determinista).
const MARCADORES_DECISION = [
  'aprueb', 'rechaz', 'si', 'no', 'ok', 'vale', 'cobra', 'sangra', 'dejo', 'dejar',
  'adelante', 'en caja', 'autoriz', 'visto bueno', 'permiso', 'listo', 'acepto'
];
// Marcadores de CONSULTA (reflejo, determinista).
const MARCADORES_CONSULTA = [
  'estado', 'como va', 'que paso', 'donde esta', 'cuant', 'informe', 'dashboard',
  'avance', 'progreso', 'muestra', 'ensena', 'dime', 'status', 'en que va',
  'por que', 'cuando', 'quien', 'que es'
];

class ClasificadorIntencion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'clasificador-intencion';
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

  onClasificarRequest(e) {
    return this._atender(e, 'clasificar', 'nichos.intencion.clasificar.response', async (d) => {
      const res = await this._clasificar(d);
      // Fire-and-forget de dominio: exito → clasificada; fallo → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.intencion.clasificada', res.data);
      } else {
        this.eventBus?.publish('nichos.intencion.clasificar.failed', res);
      }
      return res;
    });
  }

  // ── el juicio: normaliza el mensaje, intenta fuzzy y cae al reflejo por reglas ──
  async _clasificar({ project_id, mensaje } = {}) {
    project_id = project_id || this.project_id;
    const texto = typeof mensaje === 'string' ? mensaje.trim() : '';
    if (!texto) {
      return this._errorResponse(400, 'MENSAJE_VACIO', 'el mensaje esta vacio o no es un texto util', { project_id });
    }
    // Intento fuzzy (LLM). Si falla o no cumple contrato → fallback reflejo por reglas.
    let resultado = await this._clasificarFuzzy(project_id, texto);
    if (!resultado || !['SEMILLA', 'DECISION', 'CONSULTA'].includes(resultado.tipo)) {
      resultado = this._clasificarReflejo(texto);
    }
    if (!resultado) {
      return this._errorResponse(422, 'SIN_CLASIFICAR', 'el mensaje no pudo clasificarse en una intencion valida', { project_id });
    }
    return {
      status: 200,
      data: {
        project_id,
        mensaje: texto,
        tipo: resultado.tipo,
        confianza: resultado.confianza,
        senales: resultado.senales || [],
        clasificado: true
      }
    };
  }

  // ── FUZZY: 1 llamada llm.complete.request con el guion + el mensaje ──
  async _clasificarFuzzy(project_id, texto) {
    const resp = await this._rpc('llm.complete.request', {
      system: GUION_CLASIFICAR,
      messages: [{ role: 'user', content: texto }],
      tools: [], settings: { temperature: 0.0 }
    }, { timeout_ms: 20000 }).catch(() => null);
    if (!resp || resp.status >= 400) return null;
    return this._parseIntencion(resp);
  }

  // ── FUZZY: extrae el JSON de la intencion (tolera fences ```json y texto) ──
  _parseIntencion(resp) {
    let c = resp?.data?.content ?? resp?.content ?? resp?.data?.text ?? resp?.text ?? resp?.data?.message ?? '';
    if (c && typeof c === 'object' && c.tipo) return c;
    if (typeof c !== 'string') return null;
    c = c.replace(/```json/gi, '').replace(/```/g, '').trim();
    const i = c.indexOf('{'), j = c.lastIndexOf('}');
    if (i >= 0 && j > i) {
      try {
        const o = JSON.parse(c.slice(i, j + 1));
        if (o && o.tipo) return { tipo: o.tipo, confianza: Number(o.confianza) || 0.8, motivo: o.motivo };
      } catch (_) { /* cae al final */ }
    }
    return null;
  }

  // ── REFLEJO (fallback determinista): clasifica por marcadores de lengua ──
  _clasificarReflejo(texto) {
    const t = texto.toLowerCase();
    const esPregunta = /\?/.test(texto) || /\b(?:qué|que|cuál|como|cuando|donde|quien|por qué|porque)\b/.test(t);
    let tipo = 'SEMILLA';
    if (esPregunta) tipo = 'CONSULTA';
    // Los marcadores de decision pesan mas que el signo de pregunta si hay verbo de decidir.
    const hayDecision = MARCADORES_DECISION.some(m => t.includes(m));
    const hayConsulta = MARCADORES_CONSULTA.some(m => t.includes(m));
    if (hayDecision && !hayConsulta) tipo = 'DECISION';
    else if (hayConsulta) tipo = 'CONSULTA';
    const confianza = tipo === 'SEMILLA' ? 0.6 : 0.8;
    return { tipo, confianza, senales: [{ fuente: 'reflejo', regla: 'marcadores_de_lengua' }] };
  }

  // ── Tools ──
  toolClasificar(params) { return this._clasificar(params); }
}

module.exports = ClasificadorIntencion;

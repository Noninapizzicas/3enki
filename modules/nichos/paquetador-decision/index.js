/**
 * nichos/paquetador-decision — REFLEJO JS (MICRO-AGENTE del vertical NICHOS).
 *
 * Redacta un paquete de contexto para el dueno: narrativa + riesgo + alternativa,
 * empaquetados de forma clara para que pueda tomar una decision informada sobre
 * un nicho. Usa ai-gateway (llm.complete.request) para la redaccion.
 *
 * Sin estado persistido — micro-agente puro (request -> LLM -> response).
 * Patron: ModuloHibridoReflejo.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

const PROMPT_SISTEMA = [
  'Eres un redactor de paquetes de decision para un sistema de gestion de nichos de mercado.',
  'Tu trabajo es empaquetar la evidencia, el riesgo y la alternativa de un nicho en una',
  'narrativa clara, concisa y accionable para que el dueno pueda decidir.',
  '',
  'Responde SOLO con un JSON:',
  '{',
  '  "narrativa": "<resumen ejecutivo del nicho en 2-3 frases>",',
  '  "riesgo_redactado": "<riesgo principal en 1 frase>",',
  '  "alternativa_redactada": "<alternativa viable en 1 frase>"',
  '}',
  'Sin explicacion adicional. Solo el JSON.'
].join('\n');

class PaquetadorDecision extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'paquetador-decision';
    this.version = '0.1.0';
    this._pendientes = new Map(); // correlation_id → { resolve, reject }
  }
  onLoad(context) {
    this.eventBus?.subscribe('llm.complete.response', (e) => this._onLLMResponse(e));
    return super.onLoad(context);
  }

  // ── RPC HANDLER ──
  onEmpaquetarRequest(e) {
    return this._atender(e, 'empaquetar', 'nichos.paquete.decision.empaquetar.response', d => this._empaquetar(d));
  }

  // =============================================================
  // PROYECCION: empaquetar
  // =============================================================
  async _empaquetar(input) {
    if (!input.nicho_id) return this._invalid('nicho_id');
    if (!input.evidencia) return this._invalid('evidencia');

    const textoUsuario = [
      `Nicho: ${input.nicho_id}`,
      `Evidencia: ${typeof input.evidencia === 'string' ? input.evidencia : JSON.stringify(input.evidencia)}`,
      `Riesgo: ${input.riesgo || 'no especificado'}`,
      `Alternativa: ${input.alternativa || 'no especificada'}`
    ].join('\n');

    try {
      const resultado = await this._pedirAlLLM(textoUsuario, input.project_id);

      this.eventBus?.publish('nichos.paquete.decision.redactado', {
        nicho_id: input.nicho_id,
        narrativa: resultado.narrativa,
        riesgo: resultado.riesgo_redactado,
        alternativa: resultado.alternativa_redactada,
        timestamp: nowISO()
      });

      return {
        status: 200,
        data: {
          paquete_contexto: {
            nicho_id: input.nicho_id,
            narrativa: resultado.narrativa,
            riesgo: resultado.riesgo_redactado,
            alternativa: resultado.alternativa_redactada
          }
        }
      };
    } catch (err) {
      this.eventBus?.publish('nichos.paquete.decision.redactado.failed', {
        nicho_id: input.nicho_id,
        code: 'REDACCION_FALLIDA',
        message: err.message || 'error al redactar paquete de decision',
        timestamp: nowISO()
      });
      return this._errorResponse(
        502,
        'LLM_ERROR',
        err.message || 'el LLM no devolvio un paquete valido',
        {}
      );
    }
  }

  // =============================================================
  // LLM — pide redaccion via ai-gateway
  // =============================================================
  _pedirAlLLM(texto, projectId) {
    return new Promise((resolve, reject) => {
      const correlationId = `paq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timeout = setTimeout(() => {
        this._pendientes.delete(correlationId);
        reject(new Error('timeout esperando respuesta del LLM'));
      }, 30000);

      this._pendientes.set(correlationId, {
        resolve: (resultado) => {
          clearTimeout(timeout);
          this._pendientes.delete(correlationId);
          resolve(resultado);
        },
        reject: (err) => {
          clearTimeout(timeout);
          this._pendientes.delete(correlationId);
          reject(err);
        }
      });

      this.eventBus?.publish('llm.complete.request', {
        request_id: correlationId,
        project_id: projectId,
        messages: [
          { role: 'system', content: PROMPT_SISTEMA },
          { role: 'user', content: texto }
        ],
        options: {
          temperature: 0.3,
          max_tokens: 500
        }
      });
    });
  }

  _onLLMResponse(e) {
    const d = (e && (e.data || e)) || {};
    const correlationId = d.request_id;
    if (!correlationId) return;

    const pendiente = this._pendientes.get(correlationId);
    if (!pendiente) return;

    if (d.error) {
      pendiente.reject(new Error(d.error.message || 'error del LLM'));
      return;
    }

    const contenido = (d.content || d.text || '').trim();
    try {
      const parsed = JSON.parse(contenido);
      pendiente.resolve({
        narrativa: parsed.narrativa || '',
        riesgo_redactado: parsed.riesgo_redactado || parsed.riesgo || '',
        alternativa_redactada: parsed.alternativa_redactada || parsed.alternativa || ''
      });
    } catch (_parseErr) {
      // Si el LLM no devolvio JSON, usar el texto crudo como narrativa.
      pendiente.resolve({
        narrativa: contenido,
        riesgo_redactado: '',
        alternativa_redactada: ''
      });
    }
  }
}

module.exports = PaquetadorDecision;

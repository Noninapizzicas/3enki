/**
 * nichos/normalizador-semilla — MICRO-AGENTE del vertical NICHOS.
 *
 * Normaliza la semilla cruda via LLM (ai-gateway): extrae campos
 * estructurados (territorio, senal, intencion) del texto libre capturado.
 * Emite el pulso nichos.semilla.normalizada y encola candidato en la cola
 * (nichos.cola.candidatos.meter.request).
 *
 * Sin estado persistido — micro-agente puro (request -> LLM -> response).
 * Patron: ModuloHibridoReflejo.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

const PROMPT_SISTEMA = [
  'Eres un normalizador de semillas de nicho de mercado.',
  'Recibes un texto libre con una idea de nicho y extraes campos estructurados.',
  '',
  'Extrae EXACTAMENTE estos campos:',
  '- territorio: zona geografica o segmento de mercado (string).',
  '- senal: la senal de oportunidad detectada (string corto, maximo 80 chars).',
  '- intencion: que quiere lograr el dueno (string corto, maximo 80 chars).',
  '- keywords: array de 3-5 palabras clave relevantes (array de strings).',
  '- vertical_sugerido: tipo de negocio sugerido (string).',
  '',
  'Responde SOLO con un JSON:',
  '{"territorio":"...","senal":"...","intencion":"...","keywords":["..."],"vertical_sugerido":"..."}',
  'Sin explicacion, sin texto adicional. Solo el JSON.'
].join('\n');

class NormalizadorSemilla extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'normalizador-semilla';
    this.version = '0.1.0';
    this._pendientes = new Map(); // correlation_id -> { resolve, reject }
  }

  onLoad(context) {
    const result = super.onLoad(context);
    // Escuchar respuestas del LLM correladas.
    this.eventBus?.subscribe('llm.complete.response', (e) => this._onLLMResponse(e));
    return result;
  }

  // -- RPC HANDLER --
  onNormalizarRequest(e) {
    return this._atender(e, 'normalizar', 'nichos.semilla.normalizar.response', d => this._normalizar(d));
  }

  // =============================================================
  // PROYECCION: _normalizar
  // =============================================================

  /**
   * _normalizar — llama LLM para estructurar la semilla.
   *
   * @param {Object} input
   * @param {Object} input.semilla_cruda - { texto, origen, meta?, capturado_en }
   * @param {string} [input.project_id]
   * @param {string} [input.correlation_id]
   * @returns {{ status:number, data?:Object, error?:Object }}
   */
  async _normalizar(input) {
    if (!input.semilla_cruda) return this._invalid('semilla_cruda');

    const cruda = input.semilla_cruda;
    const texto = typeof cruda === 'string' ? cruda : (cruda.texto || '');
    if (!texto || typeof texto !== 'string' || texto.trim().length === 0) {
      return this._invalid('semilla_cruda.texto');
    }

    const correlation_id = input.correlation_id || input.request_id || `norm-${Date.now()}`;
    const projectId = input.project_id || null;

    try {
      const campos = await this._pedirAlLLM(texto, projectId);

      const semilla_normalizada = {
        texto_original: texto,
        territorio: campos.territorio || 'sin_territorio',
        senal: campos.senal || texto.slice(0, 80),
        intencion: campos.intencion || 'explorar',
        keywords: Array.isArray(campos.keywords) ? campos.keywords : [],
        vertical_sugerido: campos.vertical_sugerido || 'general',
        normalizado_en: nowISO()
      };

      // PULSO: semilla normalizada
      this.eventBus?.publish('nichos.semilla.normalizada', {
        semilla_cruda: cruda,
        semilla_normalizada,
        campos_extraidos: campos,
        correlation_id,
        project_id: projectId,
        timestamp: nowISO()
      });

      // Encolar candidato
      this.eventBus?.publish('nichos.cola.candidatos.meter.request', {
        request_id: `cola-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        candidato: {
          semilla: semilla_normalizada,
          origen: cruda.origen || 'desconocido',
          estado: 'pendiente'
        },
        correlation_id,
        project_id: projectId
      });

      return {
        status: 200,
        data: { semilla_normalizada }
      };
    } catch (err) {
      this.eventBus?.publish('nichos.semilla.normalizada.failed', {
        correlation_id,
        project_id: projectId,
        code: 'NORMALIZACION_FALLIDA',
        message: err.message || 'error al normalizar semilla',
        timestamp: nowISO()
      });
      return this._errorResponse(
        502,
        'LLM_ERROR',
        err.message || 'el LLM no devolvio una normalizacion valida',
        {}
      );
    }
  }

  // =============================================================
  // LLM — pide normalizacion via ai-gateway
  // =============================================================
  _pedirAlLLM(texto, projectId) {
    return new Promise((resolve, reject) => {
      const correlationId = `nsem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
          temperature: 0.2,
          max_tokens: 300
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
        territorio: parsed.territorio || null,
        senal: parsed.senal || null,
        intencion: parsed.intencion || null,
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
        vertical_sugerido: parsed.vertical_sugerido || null
      });
    } catch (_parseErr) {
      // Degradacion honesta: si el LLM no devolvio JSON, usar el texto como senal
      pendiente.resolve({
        territorio: null,
        senal: contenido.slice(0, 80),
        intencion: null,
        keywords: [],
        vertical_sugerido: null
      });
    }
  }
}

module.exports = NormalizadorSemilla;

/**
 * nichos/propuesta-valor-canal — REFLEJO JS (MICRO-AGENTE del vertical NICHOS).
 *
 * Redacta una propuesta de valor (tono + gancho) adecuada al canal destino.
 * Dado un nicho, su panorama y un canal (email, whatsapp, landing, redes...),
 * genera el tono comunicativo y el gancho de entrada via ai-gateway.
 *
 * Sin estado persistido — micro-agente puro (request -> LLM -> response).
 * Patron: ModuloHibridoReflejo.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

const PROMPT_SISTEMA = [
  'Eres un redactor de propuestas de valor para canales de comunicacion.',
  'Tu trabajo es adaptar la propuesta de valor de un nicho al tono y formato',
  'adecuados para el canal destino (email, whatsapp, landing, redes sociales, etc).',
  '',
  'Responde SOLO con un JSON:',
  '{',
  '  "tono": "<descripcion del tono adecuado al canal en 1 frase>",',
  '  "gancho": "<frase de apertura/gancho adaptada al canal, max 2 frases>"',
  '}',
  'Sin explicacion adicional. Solo el JSON.'
].join('\n');

class PropuestaValorCanal extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'propuesta-valor-canal';
    this.version = '0.1.0';
    this._pendientes = new Map(); // correlation_id → { resolve, reject }
  }

  onLoad() {
    this.eventBus?.subscribe('llm.complete.response', (e) => this._onLLMResponse(e));
    return super.onLoad ? super.onLoad() : undefined;
  }

  // ── RPC HANDLER ──
  onRedactarRequest(e) {
    return this._atender(e, 'redactar', 'nichos.propuesta.valor.redactar.response', d => this._redactar(d));
  }

  // =============================================================
  // PROYECCION: redactar
  // =============================================================
  async _redactar(input) {
    if (!input.nicho) return this._invalid('nicho');
    if (!input.canal) return this._invalid('canal');

    const textoUsuario = [
      `Nicho: ${typeof input.nicho === 'string' ? input.nicho : JSON.stringify(input.nicho)}`,
      `Panorama: ${input.panorama || 'no especificado'}`,
      `Canal destino: ${input.canal}`
    ].join('\n');

    try {
      const resultado = await this._pedirAlLLM(textoUsuario, input.project_id);

      this.eventBus?.publish('nichos.propuesta.valor.redactada', {
        id_proyecto: input.project_id || null,
        canal: input.canal,
        tono: resultado.tono,
        gancho: resultado.gancho,
        timestamp: nowISO()
      });

      return {
        status: 200,
        data: {
          propuesta_valor: {
            canal: input.canal,
            tono: resultado.tono,
            gancho: resultado.gancho
          }
        }
      };
    } catch (err) {
      this.eventBus?.publish('nichos.propuesta.valor.redactada.failed', {
        id_proyecto: input.project_id || null,
        code: 'REDACCION_FALLIDA',
        message: err.message || 'error al redactar propuesta de valor',
        timestamp: nowISO()
      });
      return this._errorResponse(
        502,
        'LLM_ERROR',
        err.message || 'el LLM no devolvio una propuesta valida',
        {}
      );
    }
  }

  // =============================================================
  // LLM — pide redaccion via ai-gateway
  // =============================================================
  _pedirAlLLM(texto, projectId) {
    return new Promise((resolve, reject) => {
      const correlationId = `pvc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
          temperature: 0.5,
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
        tono: parsed.tono || '',
        gancho: parsed.gancho || ''
      });
    } catch (_parseErr) {
      // Si el LLM no devolvio JSON, usar el texto crudo como gancho.
      pendiente.resolve({
        tono: '',
        gancho: contenido
      });
    }
  }
}

module.exports = PropuestaValorCanal;

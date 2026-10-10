/**
 * nichos/clasificador-intencion — REFLEJO JS (MICRO-AGENTE del vertical NICHOS).
 *
 * Clasifica cada mensaje entrante del canal en 5 intenciones canonicas via
 * ai-gateway (llm.complete.request). Reactivo: escucha nichos.canal.mensaje.recibido
 * (F7b) y emite nichos.intencion.clasificada; atiende el RPC nichos.intencion.clasificar.
 *
 * 5 intenciones canonicas:
 *   SEMILLA             — idea nueva de nicho.
 *   RESPUESTA_DECISION  — respuesta a solicitud pendiente del sistema.
 *   CONSULTA            — pregunta del dueno.
 *   AJUSTE_CONFIG       — cambio de perfil/umbral.
 *   DESCONOCIDO         — no encaja en ninguna.
 *
 * Sin estado persistido — micro-agente puro (request → LLM → response).
 * Patron: ModuloHibridoReflejo.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

const INTENCIONES_VALIDAS = [
  'SEMILLA',
  'RESPUESTA_DECISION',
  'CONSULTA',
  'AJUSTE_CONFIG',
  'DESCONOCIDO'
];

const PROMPT_SISTEMA = [
  'Eres un clasificador de intenciones para un sistema de gestion de nichos de mercado.',
  'Clasifica el mensaje del usuario en EXACTAMENTE una de estas 5 intenciones:',
  '',
  '- SEMILLA: idea nueva de nicho o mercado a explorar.',
  '- RESPUESTA_DECISION: respuesta a una solicitud pendiente del sistema (aprobacion, rechazo, eleccion).',
  '- CONSULTA: pregunta del dueno sobre el estado, datos o funcionamiento del sistema.',
  '- AJUSTE_CONFIG: peticion de cambio de configuracion, perfil, umbral o parametro.',
  '- DESCONOCIDO: no encaja en ninguna de las anteriores.',
  '',
  'Responde SOLO con un JSON: {"tipo":"<INTENCION>","confianza":<0.0-1.0>}',
  'Sin explicacion, sin texto adicional. Solo el JSON.'
].join('\n');

class ClasificadorIntencion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'clasificador-intencion';
    this.version = '0.1.0';
    this._pendientes = new Map(); // correlation_id → { resolve, reject, context }
  }
  async onLoad(context) {
    // OJO: this.eventBus lo asigna super.onLoad. Si se llama al subscribe
    // ANTES, this.eventBus es undefined y el optional-chaining traga la
    // suscripcion EN SILENCIO: el modulo pedia al LLM y nunca oia la
    // respuesta (→ timeout de 30s y nichos.intencion.clasificada.failed).
    await super.onLoad(context);
    // Escuchar respuestas del LLM correladas.
    this.eventBus?.subscribe('llm.complete.response', (e) => this._onLLMResponse(e));
  }

  // ── RPC HANDLER ──
  onClasificarRequest(e) {
    return this._atender(e, 'clasificar', 'nichos.intencion.clasificar.response', d => this._clasificar(d));
  }

  // ── FIRE-AND-FORGET: reaccion a mensaje del canal (F7b) ──
  async onMensajeRecibido(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.mensaje_entrante && !d.texto) return;

    const texto = d.mensaje_entrante || d.texto;
    const projectId = d.project_id;

    try {
      const resultado = await this._pedirAlLLM(texto, projectId);
      this.eventBus?.publish('nichos.intencion.clasificada', {
        project_id: projectId,
        mensaje_ref: d.mensaje_ref || d.id || null,
        tipo: resultado.tipo,
        confianza: resultado.confianza,
        timestamp: nowISO()
      });
    } catch (err) {
      this.eventBus?.publish('nichos.intencion.clasificada.failed', {
        project_id: projectId,
        code: 'CLASIFICACION_FALLIDA',
        message: err.message || 'error al clasificar intencion',
        timestamp: nowISO()
      });
    }
  }

  // ── PROYECCION: clasificar (usada por RPC) ──
  async _clasificar(input) {
    if (!input.mensaje_entrante) return this._invalid('mensaje_entrante');

    try {
      const resultado = await this._pedirAlLLM(input.mensaje_entrante, input.project_id);
      return {
        status: 200,
        data: {
          intencion_entrante: {
            tipo: resultado.tipo,
            confianza: resultado.confianza
          }
        }
      };
    } catch (err) {
      this.eventBus?.publish('nichos.intencion.clasificada.failed', {
        project_id: input.project_id,
        code: 'CLASIFICACION_FALLIDA',
        message: err.message || 'error al clasificar intencion',
        timestamp: nowISO()
      });
      return this._errorResponse(
        502,
        'LLM_ERROR',
        err.message || 'el LLM no devolvio una clasificacion valida',
        {}
      );
    }
  }

  // =============================================================
  // LLM — pide clasificacion via ai-gateway
  // =============================================================
  _pedirAlLLM(texto, projectId) {
    return new Promise((resolve, reject) => {
      const correlationId = `clf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
          temperature: 0.1,
          max_tokens: 100
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

    // Parsear la respuesta del LLM.
    const contenido = (d.content || d.text || '').trim();
    try {
      const parsed = JSON.parse(contenido);
      const tipo = INTENCIONES_VALIDAS.includes(parsed.tipo) ? parsed.tipo : 'DESCONOCIDO';
      const confianza = typeof parsed.confianza === 'number'
        ? Math.max(0, Math.min(1, parsed.confianza))
        : 0.5;
      pendiente.resolve({ tipo, confianza });
    } catch (_parseErr) {
      // Si el LLM no devolvio JSON valido, intentar extraer la intencion del texto.
      const tipoEncontrado = INTENCIONES_VALIDAS.find(t => contenido.toUpperCase().includes(t));
      if (tipoEncontrado) {
        pendiente.resolve({ tipo: tipoEncontrado, confianza: 0.5 });
      } else {
        pendiente.resolve({ tipo: 'DESCONOCIDO', confianza: 0.1 });
      }
    }
  }
}

module.exports = ClasificadorIntencion;

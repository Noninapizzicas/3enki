'use strict';

/**
 * nichos/proponedor-modelo-cobro — REFLEJO JS (MICRO-AGENTE del vertical NICHOS).
 *
 * Propone un modelo de cobro para un nicho: consulta la plantilla de cobro
 * base por bus (nichos.perfil.cobro.plantilla.request) y la ajusta via LLM
 * (llm.complete.request) al nicho y la solucion concretos.
 *
 * RPC: nichos.modelo.cobro.proponer
 *   req: { id_nicho, solucion }
 *   resp: { modelo_cobro }
 *
 * PULSO: nichos.modelo.cobro.propuesto
 *   { id_proyecto, modelo, timestamp }
 *
 * Sin estado persistido — micro-agente puro (request → plantilla → LLM → response).
 * Patron: ModuloHibridoReflejo.
 */

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

const PROMPT_SISTEMA = [
  'Eres un experto en modelos de negocio y monetizacion.',
  'Se te entrega una plantilla base de cobro y una solucion/nicho concreto.',
  'Ajusta la plantilla al nicho y responde SOLO con un JSON:',
  '{',
  '  "tipo": "<freemium|suscripcion|pago_unico|comision|publicidad|mixto>",',
  '  "precio_sugerido": "<rango o cifra>",',
  '  "frecuencia": "<mensual|anual|por_uso|unico>",',
  '  "justificacion": "<por que este modelo encaja con el nicho>",',
  '  "variantes": ["<alternativa_1>", "<alternativa_2>"]',
  '}',
  'Sin explicacion adicional. Solo el JSON.'
].join('\n');

class ProponedorModeloCobro extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'proponedor-modelo-cobro';
    this.version = '0.1.0';
    this._pendientes = new Map(); // correlation_id → { resolve, reject }
  }

  onLoad(context) {
    const r = super.onLoad(context);
    this.eventBus?.subscribe('llm.complete.response', (e) => this._onLLMResponse(e));
    return r;
  }

  // ── RPC HANDLER ──
  onProponerRequest(e) {
    return this._atender(e, 'proponer', 'nichos.modelo.cobro.proponer.response', d => this._proponer(d));
  }

  // ── PROYECCION: _proponer (aplica plantilla + ajuste LLM) ──
  async _proponer(input) {
    if (!input.id_nicho) return this._invalid('id_nicho');
    if (!input.solucion) return this._invalid('solucion');

    const projectId = input.project_id || input.id_proyecto;

    // 1. Consultar plantilla de cobro base
    const plantillaResp = await this._rpc('nichos.perfil.cobro.plantilla.request', {
      project_id: projectId,
      id_nicho: input.id_nicho
    }, { timeout_ms: 5000 });

    const plantilla = (plantillaResp && plantillaResp.status === 200)
      ? plantillaResp.data?.plantilla || {}
      : {};

    // 2. Pedir ajuste al LLM
    const contexto = [
      `Nicho: ${JSON.stringify(input.id_nicho)}`,
      `Solucion: ${JSON.stringify(input.solucion)}`,
      plantilla && Object.keys(plantilla).length > 0
        ? `Plantilla base de cobro: ${JSON.stringify(plantilla)}`
        : 'No hay plantilla base — proponer desde cero.'
    ].join('\n');

    try {
      const resultado = await this._pedirAlLLM(contexto, projectId);

      // 3. Emitir pulso
      this.eventBus?.publish('nichos.modelo.cobro.propuesto', {
        id_proyecto: projectId,
        modelo: resultado,
        timestamp: nowISO()
      });

      return {
        status: 200,
        data: {
          modelo_cobro: resultado
        }
      };
    } catch (err) {
      this.eventBus?.publish('nichos.modelo.cobro.propuesto.failed', {
        id_proyecto: projectId,
        code: 'PROPUESTA_FALLIDA',
        message: err.message || 'error al proponer modelo de cobro',
        timestamp: nowISO()
      });
      return this._errorResponse(
        502,
        'LLM_ERROR',
        err.message || 'el LLM no devolvio un modelo de cobro valido',
        {}
      );
    }
  }

  // =============================================================
  // LLM — pide ajuste de modelo de cobro via ai-gateway
  // =============================================================
  _pedirAlLLM(texto, projectId) {
    return new Promise((resolve, reject) => {
      const correlationId = `cobro-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
          temperature: 0.4,
          max_tokens: 600
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
        tipo: parsed.tipo || 'mixto',
        precio_sugerido: parsed.precio_sugerido || 'por determinar',
        frecuencia: parsed.frecuencia || 'mensual',
        justificacion: parsed.justificacion || 'sin justificacion',
        variantes: Array.isArray(parsed.variantes) ? parsed.variantes : []
      });
    } catch (_parseErr) {
      // Fallback: modelo basico
      pendiente.resolve({
        tipo: 'mixto',
        precio_sugerido: 'por determinar',
        frecuencia: 'mensual',
        justificacion: contenido || 'respuesta no estructurada del LLM',
        variantes: []
      });
    }
  }
}

module.exports = ProponedorModeloCobro;

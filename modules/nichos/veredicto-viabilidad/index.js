'use strict';

/**
 * nichos/veredicto-viabilidad — REFLEJO JS (MICRO-AGENTE del vertical NICHOS).
 *
 * Emite veredicto de viabilidad (VIABLE, NO_VIABLE o PUENTE) sobre un informe
 * de nicho. Consulta el criterio vigente (nichos.criterio.viabilidad.leer.request)
 * y usa ai-gateway (llm.complete.request) para evaluar el informe contra criterio.
 *
 * Sin estado persistido — micro-agente puro (request → criterio + LLM → response).
 * Patron: ModuloHibridoReflejo.
 */

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

const DECISIONES_VALIDAS = ['VIABLE', 'NO_VIABLE', 'PUENTE'];

const PROMPT_SISTEMA = [
  'Eres un evaluador de viabilidad de nichos de mercado.',
  'Recibes un informe de analisis de un nicho y un criterio de viabilidad.',
  'Debes emitir un veredicto: VIABLE, NO_VIABLE o PUENTE.',
  '',
  '- VIABLE: el nicho cumple el criterio y merece inversion.',
  '- NO_VIABLE: el nicho no cumple el criterio; descartar.',
  '- PUENTE: datos insuficientes o ambiguos; requiere mas investigacion antes de decidir.',
  '',
  'Responde SOLO con un JSON:',
  '{"decision":"<VIABLE|NO_VIABLE|PUENTE>","razon":"<justificacion concisa>"}',
  'Sin explicacion adicional. Solo el JSON.'
].join('\n');

class VeredictoViabilidad extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'veredicto-viabilidad';
    this.version = '0.1.0';
    this._pendientes = new Map();
  }

  onLoad() {
    this.eventBus?.subscribe('llm.complete.response', (e) => this._onLLMResponse(e));
    this.eventBus?.subscribe('nichos.criterio.viabilidad.leer.response', (e) => this._onCriterioResponse(e));
    return super.onLoad ? super.onLoad() : undefined;
  }

  // ── RPC HANDLER ──
  onEmitirRequest(e) {
    return this._atender(e, 'emitir', 'nichos.veredicto.emitir.response', d => this._emitir(d));
  }

  // ── PROYECCION: _emitir (aplica criterio; VIABLE|NO_VIABLE|PUENTE) ──
  async _emitir(input) {
    if (!input.informe) return this._invalid('informe');

    const projectId = input.project_id;
    const idNicho = input.informe.id_nicho || input.id_nicho || 'sin-id';

    try {
      // 1. Consultar criterio vigente
      const criterio = await this._leerCriterio(projectId);

      // 2. Pedir al LLM que evalúe
      const resultado = await this._pedirAlLLM(input.informe, criterio, projectId);

      const veredicto = {
        decision: resultado.decision,
        razon: resultado.razon,
        criterio_aplicado: criterio
      };

      this.eventBus?.publish('nichos.veredicto.emitido', {
        id_nicho: idNicho,
        decision: veredicto.decision,
        razon: veredicto.razon,
        timestamp: nowISO()
      });

      return { status: 200, data: { veredicto } };
    } catch (err) {
      return this._errorResponse(502, 'ERROR_VEREDICTO', err.message || 'error al emitir veredicto', {});
    }
  }

  // =============================================================
  // BUS — leer criterio de viabilidad
  // =============================================================
  _leerCriterio(projectId) {
    return new Promise((resolve) => {
      const correlationId = `vvc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timeout = setTimeout(() => {
        this._pendientes.delete(correlationId);
        resolve({ fuente: 'default', reglas: 'criterio por defecto: demanda detectada y coste asumible' });
      }, 10000);

      this._pendientes.set(correlationId, {
        tipo: 'criterio',
        resolve: (data) => {
          clearTimeout(timeout);
          this._pendientes.delete(correlationId);
          resolve(data);
        }
      });

      this.eventBus?.publish('nichos.criterio.viabilidad.leer.request', {
        request_id: correlationId,
        project_id: projectId
      });
    });
  }

  _onCriterioResponse(e) {
    const d = (e && (e.data || e)) || {};
    const pendiente = this._pendientes.get(d.request_id);
    if (!pendiente || pendiente.tipo !== 'criterio') return;
    pendiente.resolve(d.data?.criterio || d.data || { fuente: 'bus', reglas: 'sin criterio recibido' });
  }

  // =============================================================
  // LLM — pide evaluacion via ai-gateway
  // =============================================================
  _pedirAlLLM(informe, criterio, projectId) {
    return new Promise((resolve, reject) => {
      const correlationId = `vva-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timeout = setTimeout(() => {
        this._pendientes.delete(correlationId);
        reject(new Error('timeout esperando respuesta del LLM'));
      }, 30000);

      this._pendientes.set(correlationId, {
        tipo: 'llm',
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

      const userContent = [
        'INFORME DEL NICHO:',
        JSON.stringify(informe, null, 2),
        '',
        'CRITERIO DE VIABILIDAD:',
        typeof criterio === 'string' ? criterio : JSON.stringify(criterio, null, 2)
      ].join('\n');

      this.eventBus?.publish('llm.complete.request', {
        request_id: correlationId,
        project_id: projectId,
        messages: [
          { role: 'system', content: PROMPT_SISTEMA },
          { role: 'user', content: userContent }
        ],
        options: {
          temperature: 0.1,
          max_tokens: 200
        }
      });
    });
  }

  _onLLMResponse(e) {
    const d = (e && (e.data || e)) || {};
    const correlationId = d.request_id;
    if (!correlationId) return;

    const pendiente = this._pendientes.get(correlationId);
    if (!pendiente || pendiente.tipo !== 'llm') return;

    if (d.error) {
      pendiente.reject(new Error(d.error.message || 'error del LLM'));
      return;
    }

    const contenido = (d.content || d.text || '').trim();
    try {
      const parsed = JSON.parse(contenido);
      const decision = DECISIONES_VALIDAS.includes(parsed.decision) ? parsed.decision : 'PUENTE';
      const razon = parsed.razon || 'sin razon proporcionada';
      pendiente.resolve({ decision, razon });
    } catch (_parseErr) {
      const encontrada = DECISIONES_VALIDAS.find(d => contenido.toUpperCase().includes(d));
      pendiente.resolve({
        decision: encontrada || 'PUENTE',
        razon: contenido || 'respuesta no estructurada del LLM'
      });
    }
  }
}

module.exports = VeredictoViabilidad;

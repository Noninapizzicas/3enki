'use strict';

/**
 * nichos/estudio-competencia — REFLEJO JS (MICRO-AGENTE del vertical NICHOS).
 *
 * Estudia la competencia de una solucion propuesta: consume fuentes externas
 * por bus, las pasa al LLM (llm.complete.request) y sintetiza un informe
 * con panorama competitivo + diferencial.
 *
 * RPC: nichos.competencia.estudiar
 *   req: { solucion }
 *   resp: { informe_competencia: { panorama, diferencial, fuentes_usadas[] } }
 *
 * PULSO: nichos.competencia.estudiada
 *   { id_proyecto, panorama, diferencial, fuentes_usadas[], timestamp }
 *
 * Sin estado persistido — micro-agente puro (request → fuentes → LLM → response).
 * Patron: ModuloHibridoReflejo.
 */

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

const PROMPT_SISTEMA = [
  'Eres un analista de competencia para nichos de mercado.',
  'Se te entrega una solucion propuesta junto con datos de fuentes externas.',
  'Analiza la competencia y responde SOLO con un JSON:',
  '{',
  '  "panorama": "<descripcion del panorama competitivo: jugadores, cuota, tendencias>",',
  '  "diferencial": "<que hace unica a esta solucion frente a la competencia>"',
  '}',
  'Sin explicacion adicional. Solo el JSON.'
].join('\n');

class EstudioCompetencia extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'estudio-competencia';
    this.version = '0.1.0';
    this._pendientes = new Map(); // correlation_id → { resolve, reject }
  }

  onLoad(context) {
    const r = super.onLoad(context);
    this.eventBus?.subscribe('llm.complete.response', (e) => this._onLLMResponse(e));
    return r;
  }

  // ── RPC HANDLER ──
  onEstudiarRequest(e) {
    return this._atender(e, 'estudiar', 'nichos.competencia.estudiar.response', d => this._estudiar(d));
  }

  // ── PROYECCION: _estudiar (mapea panorama + diferencial) ──
  async _estudiar(input) {
    if (!input.solucion) return this._invalid('solucion');

    const projectId = input.project_id || input.id_proyecto;

    // 1. Consultar si podemos consumir fuentes
    const puedeConsumir = await this._rpc('nichos.fuente.limites.puede.consumir.request', {
      project_id: projectId
    }, { timeout_ms: 5000 });

    // 2. Consumir fuentes si hay permiso
    const fuentes_usadas = [];
    if (puedeConsumir && puedeConsumir.status === 200 && puedeConsumir.data?.puede) {
      const fuenteResp = await this._rpc('nichos.fuente.consumir.request', {
        project_id: projectId,
        tipo: 'competencia',
        query: input.solucion
      }, { timeout_ms: 15000 });

      if (fuenteResp && fuenteResp.status === 200 && fuenteResp.data?.resultados) {
        for (const r of fuenteResp.data.resultados) {
          fuentes_usadas.push({
            nombre: r.nombre || r.fuente || 'desconocida',
            tipo: r.tipo || 'web'
          });
        }
      }
    }

    // 3. Preparar contexto para el LLM
    const contextoFuentes = fuentes_usadas.length > 0
      ? `\n\nDatos de fuentes externas:\n${JSON.stringify(fuentes_usadas)}`
      : '';

    // 4. Pedir analisis al LLM
    try {
      const resultado = await this._pedirAlLLM(
        `Solucion a analizar: ${JSON.stringify(input.solucion)}${contextoFuentes}`,
        projectId
      );

      // 5. Emitir pulso
      this.eventBus?.publish('nichos.competencia.estudiada', {
        id_proyecto: projectId,
        panorama: resultado.panorama,
        diferencial: resultado.diferencial,
        fuentes_usadas,
        timestamp: nowISO()
      });

      return {
        status: 200,
        data: {
          informe_competencia: {
            panorama: resultado.panorama,
            diferencial: resultado.diferencial,
            fuentes_usadas
          }
        }
      };
    } catch (err) {
      this.eventBus?.publish('nichos.competencia.estudiada.failed', {
        id_proyecto: projectId,
        code: 'ESTUDIO_FALLIDO',
        message: err.message || 'error al estudiar competencia',
        timestamp: nowISO()
      });
      return this._errorResponse(
        502,
        'LLM_ERROR',
        err.message || 'el LLM no devolvio un analisis valido',
        {}
      );
    }
  }

  // =============================================================
  // LLM — pide analisis competitivo via ai-gateway
  // =============================================================
  _pedirAlLLM(texto, projectId) {
    return new Promise((resolve, reject) => {
      const correlationId = `comp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
          max_tokens: 800
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
        panorama: parsed.panorama || 'sin datos',
        diferencial: parsed.diferencial || 'sin datos'
      });
    } catch (_parseErr) {
      // Fallback: usar el texto crudo como panorama
      pendiente.resolve({
        panorama: contenido || 'sin datos',
        diferencial: 'no se pudo extraer del LLM'
      });
    }
  }
}

module.exports = EstudioCompetencia;

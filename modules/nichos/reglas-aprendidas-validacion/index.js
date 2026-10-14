'use strict';

/**
 * nichos/reglas-aprendidas-validacion — MICRO-AGENTE del vertical NICHOS.
 *
 * Tras cada lote de validacion completado, registra resultados en un historial
 * de patrones y destila reglas de validacion aprendidas via ai-gateway
 * (llm.complete.request). Propone ajustes de umbral al dueno cuando detecta
 * un patron recurrente.
 *
 * Store (per-proyecto, PosPersistencia): /prisma/pos/nichos/reglas-aprendidas.json
 *   {
 *     _version, _updated,
 *     historial: {
 *       patrones: [ { patron, ocurrencias, umbral_actual, ultima_vez } ],
 *       lotes_procesados: Number
 *     }
 *   }
 *
 * Patron: ModuloHibridoReflejo (micro-agente — LLM + PosPersistencia).
 */

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();

const PROMPT_SISTEMA = [
  'Eres un analista de patrones de validacion de nichos de mercado.',
  'Se te da un historial de resultados de validacion (viables, no viables, puentes).',
  'Tu tarea: detectar patrones recurrentes y proponer ajustes de umbral.',
  '',
  'Responde SOLO con un JSON:',
  '{"patrones":[{"patron":"<descripcion corta>","umbral_actual":<number>,"umbral_sugerido":<number>,"confianza":<0.0-1.0>}]}',
  'Si no hay patron claro, responde: {"patrones":[]}',
  'Sin explicacion, sin texto adicional. Solo el JSON.'
].join('\n');

const MAX_HISTORIAL = 50; // entradas maximas en historial

function esqueletoVacio() {
  return {
    patrones: [],
    lotes_procesados: 0
  };
}

class ReglasAprendidasValidacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'reglas-aprendidas-validacion';
    this.version = '0.1.0';
    this.historialPorProyecto = new Map(); // project_id -> esqueleto
    this._pendientes = new Map(); // correlation_id -> { resolve, reject }

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'reglas-aprendidas.json',
      dir: '/prisma/pos/nichos',
      snapshot: (pid) => ({ historial: this.historialPorProyecto.get(pid) || null }),
      hidratar: (pid, data) => {
        if (data && data.historial && typeof data.historial === 'object') {
          this.historialPorProyecto.set(pid, data.historial);
        }
      }
    });
  }

  onLoad(context) {
    const r = super.onLoad(context);
    this.eventBus?.subscribe('llm.complete.response', (e) => this._onLLMResponse(e));
    return r;
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // -- RPC HANDLER --
  onProponerRequest(e) {
    return this._atender(e, 'proponer', 'nichos.aprendizaje.proponer.response', d => this._proponer(d));
  }

  // -- FIRE-AND-FORGET: reaccion a lote completado (F7b) --
  async onLoteCompletado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.lote_id) return;

    const projectId = d.project_id;
    const historial = this._historial(projectId);

    // Registrar resultados del lote en historial.
    historial.lotes_procesados = (historial.lotes_procesados || 0) + 1;
    historial.patrones.push({
      patron: `lote_${d.lote_id}`,
      ocurrencias: 1,
      viables: d.viables || 0,
      no_viables: d.no_viables || 0,
      puentes: d.puentes || 0,
      umbral_actual: null,
      ultima_vez: nowISO()
    });

    // Podar historial si excede el maximo.
    if (historial.patrones.length > MAX_HISTORIAL) {
      historial.patrones = historial.patrones.slice(-MAX_HISTORIAL);
    }

    this._persist.marcarDirty(projectId);

    // Analizar patrones si hay suficiente historial.
    if (historial.lotes_procesados >= 3) {
      try {
        await this._analizarYProponer(projectId, historial);
      } catch (_) {
        // Degradacion honesta: el historial se guardo, el analisis se reintentara.
      }
    }
  }

  // =============================================================
  // PROYECCION: _proponer (destila patron sobre historial)
  // =============================================================
  async _proponer(input) {
    const projectId = input.project_id;
    const historial = this._historial(projectId);

    if (historial.lotes_procesados < 1) {
      return { status: 200, data: { vacio: true, razon: 'sin historial suficiente' } };
    }

    try {
      const propuestas = await this._analizarYProponer(projectId, historial);
      if (!propuestas || propuestas.length === 0) {
        return { status: 200, data: { vacio: true, razon: 'sin patron detectado' } };
      }

      return {
        status: 200,
        data: {
          solicitud_decision: {
            tipo: 'regla_aprendida',
            propuestas
          }
        }
      };
    } catch (err) {
      return this._errorResponse(502, 'LLM_ERROR', err.message || 'error al destilar patrones');
    }
  }

  // =============================================================
  // LLM — destila patrones via ai-gateway
  // =============================================================
  async _analizarYProponer(projectId, historial) {
    const resumen = JSON.stringify({
      lotes_procesados: historial.lotes_procesados,
      patrones: historial.patrones.slice(-20) // ultimos 20 para contexto
    });

    const resultado = await this._pedirAlLLM(resumen, projectId);
    const propuestas = resultado.patrones || [];

    // Emitir pulso y solicitud de decision por cada propuesta.
    for (const p of propuestas) {
      this.eventBus?.publish('nichos.regla.aprendida.propuesta', {
        project_id: projectId,
        patron: p.patron,
        umbral_actual: p.umbral_actual,
        umbral_sugerido: p.umbral_sugerido,
        timestamp: nowISO()
      });

      this.eventBus?.publish('nichos.decision.solicitud.abierta', {
        project_id: projectId,
        tipo: 'regla_aprendida',
        patron: p.patron,
        timestamp: nowISO()
      });
    }

    return propuestas;
  }

  _pedirAlLLM(texto, projectId) {
    return new Promise((resolve, reject) => {
      const correlationId = `rav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
      pendiente.resolve({ patrones: Array.isArray(parsed.patrones) ? parsed.patrones : [] });
    } catch (_parseErr) {
      pendiente.resolve({ patrones: [] });
    }
  }

  // =============================================================
  // Estado
  // =============================================================
  _historial(projectId) {
    let h = this.historialPorProyecto.get(projectId);
    if (!h) {
      h = esqueletoVacio();
      this.historialPorProyecto.set(projectId, h);
    }
    return h;
  }
}

module.exports = ReglasAprendidasValidacion;

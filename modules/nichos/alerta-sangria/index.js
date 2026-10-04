'use strict';

/**
 * nichos/alerta-sangria — PUENTE JS (bloque K del vertical NICHOS, #50).
 *
 * Cuando el cuadro de salud detecta sangría (métricas indican pérdida),
 * evalúa el indicador contra el umbral y alza puente humano con alerta urgente.
 *
 * Sin estado. Puente reactivo: detecta, evalúa y escala.
 *
 * Patrón: ModuloHibridoReflejo (mitad REFLEJO, JS determinista).
 */

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

class AlertaSangria extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'alerta-sangria';
    this.version = '0.1.0';
  }

  // ── LISTENER (fire-and-forget entrante) ──
  onSangriaDetectada(e) {
    const d = (e && (e.data || e)) || {};
    this._evaluar(d);
  }

  // ── RPC HANDLER ──
  onEstadoRequest(e) {
    return this._atender(e, 'estado', 'nichos.cuadro.salud.estado.response', d => this._consultarEstado(d));
  }

  // =============================================================
  // PROYECCIÓN — evalúa indicador contra umbral
  // =============================================================

  /**
   * _evaluar — compara indicador contra umbral y emite alerta + puente humano.
   *
   * @param {Object} input
   * @param {string} input.id_nicho     - identificador del nicho
   * @param {string} input.indicador    - nombre del indicador de sangría
   * @param {number} input.umbral       - umbral declarado
   * @param {number} input.valor_actual - valor actual del indicador
   */
  async _evaluar(input) {
    if (!input.id_nicho || !input.indicador) return;

    const umbral = input.umbral ?? 0;
    const valor_actual = input.valor_actual ?? 0;

    // La sangría ya viene detectada — emitir alerta
    const alerta = {
      id_nicho: input.id_nicho,
      indicador: input.indicador,
      umbral,
      valor_actual,
      timestamp: nowISO()
    };

    // PULSO de alerta emitida
    this.eventBus?.publish('nichos.alerta.sangria.emitida', alerta);

    // Alzar puente humano con alerta urgente
    try {
      await this._publishAlBus('nichos.puente.humano.alzar.request', {
        tipo: 'sangria',
        prioridad: 'urgente',
        detalle: {
          id_nicho: input.id_nicho,
          indicador: input.indicador,
          umbral,
          valor_actual,
          mensaje: `Sangría detectada en nicho ${input.id_nicho}: ${input.indicador} = ${valor_actual} (umbral: ${umbral})`
        }
      });
    } catch (_) {
      // Degradación honesta: la alerta se emitió, el puente humano falló
      this.logger?.warn('alerta-sangria.puente.humano.failed', {
        id_nicho: input.id_nicho,
        indicador: input.indicador
      });
    }
  }

  /**
   * _consultarEstado — consulta el cuadro de salud para un nicho.
   *
   * @param {Object} input
   * @param {string} input.id_nicho
   * @returns {{ status:number, data?:Object, error?:Object }}
   */
  async _consultarEstado(input) {
    if (!input.id_nicho) return this._invalid('id_nicho');

    // Delegar al cuadro de salud via RPC
    const resp = await this._rpc('nichos.cuadro.salud.estado.request', {
      id_nicho: input.id_nicho
    });

    if (!resp || resp.status >= 400) {
      return this._errorResponse(
        502,
        'CUADRO_SALUD_NO_DISPONIBLE',
        'no se pudo consultar el cuadro de salud',
        { id_nicho: input.id_nicho }
      );
    }

    return { status: 200, data: resp.data || {} };
  }

  // =============================================================
  // Utilidades
  // =============================================================

  async _publishAlBus(topic, payload) {
    if (this.eventBus?.publishAndWait) {
      try {
        return await this.eventBus.publishAndWait(topic, payload);
      } catch (_) { /* degradación: fire-and-forget */ }
    }
    this.eventBus?.publish(topic, payload);
  }
}

module.exports = AlertaSangria;

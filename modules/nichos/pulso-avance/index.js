'use strict';

/**
 * nichos/pulso-avance — REFLEJO JS (bloque K del vertical NICHOS, #52).
 *
 * Calcula métricas de avance (duración en estado, velocidad) a partir de
 * cada transición del pipeline y actualiza el cuadro de salud.
 *
 * Sin estado. REFLEJO puro, determinista.
 *
 * Patrón: ModuloHibridoReflejo (mitad REFLEJO, JS determinista).
 */

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

class PulsoAvance extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'pulso-avance';
    this.version = '0.1.0';
  }

  // ── LISTENER (fire-and-forget entrante) ──
  onPipelineTransitado(e) {
    const d = (e && (e.data || e)) || {};
    this._emitir(d);
  }

  // =============================================================
  // PROYECCIÓN — calcula duración y formatea pulso de avance
  // =============================================================

  /**
   * _emitir — calcula duración en el estado anterior y emite pulso de avance.
   *
   * @param {Object} input
   * @param {string} input.id_nicho          - identificador del nicho
   * @param {string} input.estado_anterior   - estado antes de la transición
   * @param {string} input.estado_nuevo      - estado después de la transición
   * @param {string} input.timestamp         - momento de la transición
   * @param {string} [input.timestamp_anterior] - momento en que entró al estado anterior
   */
  async _emitir(input) {
    if (!input.id_nicho || !input.estado_nuevo) return;

    const ahora = input.timestamp || nowISO();
    const duracion_en_estado_ms = this._calcularDuracion(input.timestamp_anterior, ahora);

    const pulso = {
      id_nicho: input.id_nicho,
      estado_anterior: input.estado_anterior || null,
      estado_nuevo: input.estado_nuevo,
      timestamp: ahora,
      duracion_en_estado_ms
    };

    // PULSO de avance emitido
    this.eventBus?.publish('nichos.pulso.avance.emitido', pulso);

    // Actualizar cuadro de salud con métricas de avance
    try {
      await this._publishAlBus('nichos.cuadro.salud.actualizar.request', {
        id_nicho: input.id_nicho,
        metrica: 'avance',
        valor: {
          estado_anterior: input.estado_anterior || null,
          estado_nuevo: input.estado_nuevo,
          duracion_en_estado_ms,
          timestamp: ahora
        }
      });
    } catch (_) {
      // Degradación honesta: el pulso se emitió, la actualización del cuadro falló
      this.logger?.warn('pulso-avance.cuadro.salud.failed', {
        id_nicho: input.id_nicho
      });
    }
  }

  // =============================================================
  // Utilidades
  // =============================================================

  /**
   * Calcula la duración en milisegundos entre dos timestamps ISO.
   * Si falta timestamp_anterior, devuelve 0 (primera transición).
   */
  _calcularDuracion(timestamp_anterior, timestamp_actual) {
    if (!timestamp_anterior) return 0;
    try {
      const inicio = new Date(timestamp_anterior).getTime();
      const fin = new Date(timestamp_actual).getTime();
      if (isNaN(inicio) || isNaN(fin)) return 0;
      return Math.max(0, fin - inicio);
    } catch (_) {
      return 0;
    }
  }

  async _publishAlBus(topic, payload) {
    if (this.eventBus?.publishAndWait) {
      try {
        return await this.eventBus.publishAndWait(topic, payload);
      } catch (_) { /* degradación: fire-and-forget */ }
    }
    this.eventBus?.publish(topic, payload);
  }
}

module.exports = PulsoAvance;

/**
 * nichos/capturador-semilla — REFLEJO JS (sin estado) del vertical NICHOS.
 *
 * Captura la semilla cruda del input del dueno (texto libre), la valida,
 * emite el pulso nichos.semilla.capturada, y encadena al normalizador
 * publicando nichos.semilla.normalizar.request.
 *
 * Sin estado persistido — REFLEJO puro determinista.
 * Patron: ModuloHibridoReflejo.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

class CapturadorSemilla extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'capturador-semilla';
    this.version = '0.1.0';
  }

  // -- RPC HANDLER --
  onCapturarRequest(e) {
    return this._atender(e, 'capturar', 'nichos.semilla.capturar.response', d => this._capturar(d));
  }

  // =============================================================
  // PROYECCION: _capturar
  // =============================================================

  /**
   * _capturar — valida texto, extrae semilla cruda, encadena normalizacion.
   *
   * @param {Object} input
   * @param {string} input.texto - texto libre del dueno con la idea de nicho
   * @param {string} [input.origen] - canal de origen (telegram, whatsapp, web, etc.)
   * @param {Object} [input.meta] - metadatos adicionales
   * @param {string} [input.project_id]
   * @param {string} [input.correlation_id]
   * @returns {{ status:number, data?:Object, error?:Object }}
   */
  async _capturar(input) {
    if (!input.texto || typeof input.texto !== 'string') {
      return this._invalid('texto');
    }

    const textoLimpio = input.texto.trim();
    if (textoLimpio.length === 0) {
      return this._invalid('texto');
    }

    const origen = input.origen || 'desconocido';
    const correlation_id = input.correlation_id || input.request_id || `sem-${Date.now()}`;
    const timestamp = nowISO();

    const semilla_cruda = {
      texto: textoLimpio,
      origen,
      meta: input.meta || null,
      capturado_en: timestamp
    };

    // PULSO: semilla capturada
    this.eventBus?.publish('nichos.semilla.capturada', {
      texto: textoLimpio,
      origen,
      timestamp,
      correlation_id,
      project_id: input.project_id || null
    });

    // Encadenar al normalizador
    this.eventBus?.publish('nichos.semilla.normalizar.request', {
      request_id: `norm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      semilla_cruda,
      correlation_id,
      project_id: input.project_id || null
    });

    return {
      status: 200,
      data: { semilla_cruda }
    };
  }
}

module.exports = CapturadorSemilla;

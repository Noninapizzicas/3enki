/**
 * nichos/puente-humano — PUENTE JS del vertical NICHOS.
 *
 * Bridge hacia el dueño humano. Traduce solicitudes de decisión del sistema
 * al canal del dueño. Dos operaciones:
 *
 *   1. ALZAR  — formatea pregunta + opciones para el canal humano y emite
 *               solicitud de decisión al bus.
 *   2. ESCUCHAR — suscribe nichos.decision.solicitud.respondida y re-emite
 *                 por el bus para que el flujo original continúe.
 *
 * Sin estado propio. Traduce la solicitud de decisión del sistema al canal
 * del dueño.
 *
 * Patrón: ModuloHibridoReflejo (mitad REFLEJO, JS determinista).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const crypto = require('crypto');

const nowISO = () => new Date().toISOString();

class PuenteHumano extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puente-humano';
    this.version = '0.1.0';
  }

  // ── RPC HANDLER ──
  onAlzarRequest(e) {
    return this._atender(e, 'alzar', 'nichos.puente.humano.alzar.response', d => this._alzar(d));
  }

  // ── LISTENER (fire-and-forget) ──
  onSolicitudRespondida(e) {
    const d = (e && (e.data || e)) || {};
    // Re-emitir por el bus para que el flujo original continúe
    this.logger?.info('puente-humano.respuesta.reenviada', {
      solicitud_id: d.solicitud_id,
      opcion_elegida: d.opcion_elegida
    });
  }

  // =============================================================
  // PROYECCIÓN — lógica de dominio pura
  // =============================================================

  /**
   * _alzar — formatea pregunta + opciones para el canal humano y emite
   * solicitud de decisión al bus.
   *
   * @param {Object} input
   * @param {string} input.id_nicho       - identificador del nicho
   * @param {string} input.contexto       - contexto de la decisión
   * @param {string} input.pregunta       - pregunta para el dueño
   * @param {Array}  [input.opciones]     - opciones disponibles
   * @param {string} [input.correlation_id]
   * @returns {{ status:number, data?:Object, error?:Object }}
   */
  _alzar(input) {
    if (!input.id_nicho) return this._invalid('id_nicho');
    if (!input.pregunta) return this._invalid('pregunta');

    const solicitud_id = crypto.randomUUID();

    // Emitir solicitud de decisión al bus (para cola-decisiones)
    this.eventBus?.publish('nichos.decision.solicitud.abierta', {
      solicitud_id,
      tipo: 'puente-humano',
      contexto: input.contexto || '',
      opciones: input.opciones || [],
      pregunta: this._formatearPregunta(input),
      id_nicho: input.id_nicho,
      timestamp: nowISO()
    });

    // PULSO — alzado
    this.eventBus?.publish('nichos.puente.humano.alzado', {
      id_nicho: input.id_nicho,
      solicitud_id,
      pregunta: input.pregunta,
      timestamp: nowISO()
    });

    return {
      status: 200,
      data: { solicitud_id }
    };
  }

  // =============================================================
  // Utilidades
  // =============================================================

  /**
   * _formatearPregunta — formatea la pregunta con opciones para el canal humano.
   */
  _formatearPregunta(input) {
    let texto = input.pregunta;
    if (input.contexto) {
      texto = `[${input.contexto}] ${texto}`;
    }
    if (Array.isArray(input.opciones) && input.opciones.length > 0) {
      const lista = input.opciones
        .map((op, i) => `  ${i + 1}. ${typeof op === 'string' ? op : op.label || op.valor || JSON.stringify(op)}`)
        .join('\n');
      texto += '\nOpciones:\n' + lista;
    }
    return texto;
  }
}

module.exports = PuenteHumano;

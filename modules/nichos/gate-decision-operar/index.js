/**
 * nichos/gate-decision-operar — PUENTE JS del vertical NICHOS.
 *
 * Gate de arranque del vertical. Controla si el vertical opera o está en pausa.
 * Dos operaciones:
 *
 *   1. OPERAR — valida acción ABRIR|CERRAR y transita estado. Si ABRIR sin
 *              confirmación del dueño → emite solicitud de decisión.
 *   2. ESCUCHAR — suscribe nichos.decision.solicitud.respondida; cuando el
 *                 dueño responde, completa la transición de apertura.
 *
 * Sin estado persistido — el estado del gate vive en memoria por proyecto.
 * Patrón: ModuloHibridoReflejo (mitad REFLEJO, JS determinista).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const crypto = require('crypto');

const nowISO = () => new Date().toISOString();

const ACCIONES_VALIDAS = ['ABRIR', 'CERRAR'];
const ESTADOS = { ABIERTO: 'ABIERTO', CERRADO: 'CERRADO', PENDIENTE: 'PENDIENTE' };

class GateDecisionOperar extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'gate-decision-operar';
    this.version = '0.1.0';
    // Estado en memoria por project_id: { estado, solicitud_pendiente? }
    this.gates = new Map();
  }

  // ── RPC HANDLER ──
  onOperarRequest(e) {
    return this._atender(e, 'operar', 'nichos.gate.operar.response', d => this._operar(d));
  }

  // ── LISTENER (fire-and-forget) ──
  onSolicitudRespondida(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.solicitud_id) return;

    // Buscar si esta solicitud corresponde a un gate pendiente
    for (const [project_id, gate] of this.gates.entries()) {
      if (gate.solicitud_pendiente === d.solicitud_id) {
        const aceptado = d.opcion_elegida === 'SI' || d.opcion_elegida === 'ABRIR';
        if (aceptado) {
          gate.estado = ESTADOS.ABIERTO;
          gate.solicitud_pendiente = null;
          this.eventBus?.publish('nichos.gate.operacion.abierto', {
            project_id,
            timestamp: nowISO()
          });
          this.logger?.info('gate-decision-operar.abierto.por-respuesta', { project_id });
        } else {
          gate.estado = ESTADOS.CERRADO;
          gate.solicitud_pendiente = null;
          this.logger?.info('gate-decision-operar.apertura.rechazada', { project_id });
        }
        break;
      }
    }
  }

  // =============================================================
  // PROYECCIÓN — lógica de dominio pura
  // =============================================================

  /**
   * _operar — valida acción y transita estado del gate.
   *
   * @param {Object} input
   * @param {string} input.project_id   - proyecto del vertical
   * @param {string} input.accion       - 'ABRIR' | 'CERRAR'
   * @param {string} [input.correlation_id]
   * @returns {{ status:number, data?:Object, error?:Object }}
   */
  _operar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.accion) return this._invalid('accion');

    const accion = String(input.accion).toUpperCase();
    if (!ACCIONES_VALIDAS.includes(accion)) {
      return this._errorResponse(
        400,
        'ACCION_INVALIDA',
        `accion debe ser ABRIR o CERRAR, recibido: '${input.accion}'`,
        { accion: input.accion, validas: ACCIONES_VALIDAS }
      );
    }

    const gate = this.gates.get(input.project_id) || { estado: ESTADOS.CERRADO, solicitud_pendiente: null };

    if (accion === 'CERRAR') {
      gate.estado = ESTADOS.CERRADO;
      gate.solicitud_pendiente = null;
      this.gates.set(input.project_id, gate);

      this.eventBus?.publish('nichos.gate.operacion.cerrado', {
        project_id: input.project_id,
        timestamp: nowISO()
      });

      return { status: 200, data: { estado: ESTADOS.CERRADO } };
    }

    // ABRIR → solicitar confirmación del dueño
    const solicitud_id = crypto.randomUUID();
    gate.estado = ESTADOS.PENDIENTE;
    gate.solicitud_pendiente = solicitud_id;
    this.gates.set(input.project_id, gate);

    this.eventBus?.publish('nichos.decision.solicitud.abierta', {
      solicitud_id,
      tipo: 'gate-operar',
      contexto: `Abrir el vertical NICHOS para el proyecto ${input.project_id}`,
      opciones: ['SI', 'NO'],
      timestamp: nowISO()
    });

    return {
      status: 200,
      data: { estado: ESTADOS.PENDIENTE, solicitud_id }
    };
  }
}

module.exports = GateDecisionOperar;

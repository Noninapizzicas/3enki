/**
 * nichos/gate-decision-operar — PUENTE STATELESS: cero persistencia, solo entrega la
 * decision al dueño por EVENTO y espera aprueba/rechaza.
 *
 * E2 del plan: es el gate de operar — el SISTEMA NUNCA decide operar por su cuenta.
 * Dado un nicho construido + el paquete de decision y la proyeccion, arma el
 * paquete-cerrado (nicho + competencia + modelo + costo + proyeccion) y lo entrega
 * al dueño por EVENTO como SolicitudDecision; el dueño aprueba/rechaza. No es una
 * reunion sincrona: viaja por el bus y espera la decision.
 *
 * Proyecciones puras:
 *   _armarPaquete   valida el nicho y arma/consolida el paquete-cerrado autocxplicado
 *                   con la celula de evidencia (competencia, modelo, costo,
 *                   proyeccion). Entrega la solicitud por evento.
 *
 * Sin store, sin custodio: cada op entra objeto, sale objeto. El puente comunica con
 * el exterior (el dueño via canal-supervision G1), no decide ni lo resuelve.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class GateDecisionOperar extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'gate-decision-operar';
    this.version = 'reflejo-0.1.0';
  }
  async onUnload() { return super.onUnload(); }

  // Solicitar la decision de operar: arma el paquete-cerrado y lo entrega por evento.
  onSolicitarRequest(e) {
    return this._atender(e, 'solicitar', 'nichos.gate.solicitar.response', async (d) => {
      const res = await this._solicitar(d);
      // Fire-and-forget de dominio: exito → solicitado; fallo → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.gate.solicitado', res.data);
      } else {
        this.eventBus?.publish('nichos.gate.solicitar.failed', res);
      }
      return res;
    });
  }

  // ── el puente: arma el paquete-cerrado de operar y espera la decision del dueño ──
  async _solicitar({ project_id, nicho, competencia, modelo_cobro, costo, proyeccion } = {}) {
    project_id = project_id || this.project_id;
    const paquete = this._armarPaquete({ nicho, competencia, modelo_cobro, costo, proyeccion });
    if (paquete.status !== 200) {
      return this._errorResponse(paquete.status, paquete.error?.code, paquete.error?.message, { project_id });
    }
    // Paquete-cerrado autocxplicado hacia el dueño (APRUEBA/RECHAZA). No reunion sincrona.
    return {
      status: 200,
      data: {
        project_id,
        tipo: 'gate_operar',
        estado: 'PENDIENTE',
        ...paquete.data,
        decision_esperada: 'APRUEBA|RECHAZA',
        solicitado_en: new Date().toISOString()
      }
    };
  }

  // ── REFLEJO (mecánico, determinista): consolida la celula del paquete-cerrado ──
  _armarPaquete({ nicho, competencia, modelo_cobro, costo, proyeccion } = {}) {
    if (!nicho || typeof nicho !== 'object') {
      return this._errorResponse(400, 'NICHO_INVALIDO', 'el nicho es obligatorio para armar el paquete del gate', {});
    }
    const nombre = nicho.producto || nicho.servicio || nicho.nombre || nicho.id || null;
    // Celula de evidencia: SOLO lo declarado; el sistema no fabrica numeros ausentes.
    return {
      status: 200,
      data: {
        nicho: nombre,
        competencia: competencia || { conclusion_diferenciacion: null },
        modelo_cobro: modelo_cobro || { modelo: null, precio_sugerido_eur: null },
        costo: costo || null,
        proyeccion: proyeccion || null,
        paquete_cerrado: true
      }
    };
  }
}

module.exports = GateDecisionOperar;

/**
 * manejo-fallo — REFLEJO del taller 3D (pieza 15).
 *
 * Al fallar una impresión, ESTE módulo: 1) avisa SIEMPRE (adaptador-avisos,
 * fire-and-forget aviso.solicitar tipo fallo), 2) consulta la POLÍTICA del dueño
 * (adaptador-confirmacion, SolicitudDecision) y 3) NUNCA decide por su cuenta.
 *
 * Política de fallo (configurada por el dueño, ABIERTO):
 *   - politica 'reintentar' (reintentos_max N): si reintentos < max -> REINTENTAR;
 *     si agotados -> SALTAR (no detener el taller).
 *   - politica 'saltar': -> SALTAR siempre (no detener).
 *   - politica ABIERTO o sin política conocida: -> SolicitudDecision al dueño y
 *     ESPERA (el sistema nunca la sustituye).
 *
 * Reflejo puro: sin store propio, sin PosPersistencia. Cada fallo cierra su círculo:
 * si no puede avisar ni resolver, emite manejo-fallo.manejar.failed. CERO juicio:
 * ningún fallo se calla; ninguna acción sin política conocida del dueño.
 *
 * v0.1.0: FASE 4 TANDA 4 (última).
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

class ManejoFalloReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'manejo-fallo';
    this.version = 'reflejo-0.1.0';
    // reintentos en memoria por tarea (no persiste; es política operativa del día)
    this._reintentos = new Map(); // `${project_id}:${tarea_id}` -> n
  }

  async onUnload() { return super.onUnload(); }

  // ── Handler RPC ──
  onManejarRequest(e) { return this._atender(e, 'manejar', 'manejo-fallo.manejar.response', d => this._manejar(d)); }

  // ── PROYECCIONES (dominio) ──

  // _manejar: 1) avisa SIEMPRE · 2) política reintento limitado no superado -> REINTENTAR
  // · 3) política saltar o agotado -> SALTAR (no detener) · 4) política ABIERTO o sin política
  // -> SolicitudDecision y espera. CERO juicio: la acción sale de la política del dueño.
  async _manejar(input) {
    if (!input.project_id) return this._invalid('project_id');

    const pid = input.project_id;
    const tareaId = input.tarea_id || input.id || null;
    const key = tareaId ? `${pid}:${tareaId}` : `${pid}:__global__`;

    // 1) AVISAR SIEMPRE (fire-and-forget; el ack lo verifica adaptador-avisos).
    this._avisar(input);

    // 2) Resolver la política: la trae el llamante (input.politica) o el módulo la
    //    tiene configurada (ABIERTO). Sin política conocida -> pedir decisión.
    const politica = input.politica || input.politica_fallo || null;
    const reintentosMax = input.reintentos_max != null ? Number(input.reintentos_max) : (this._reintentosMax || 1);
    const reintentosActuales = (this._reintentos.get(key) || 0);

    // 3) Decidir según política del dueño.
    if (politica === 'saltar') {
      return this._resolver(input, 'SALTAR', { reintentos: reintentosActuales });
    }

    if (politica === 'reintentar') {
      if (reintentosActuales < reintentosMax) {
        this._reintentos.set(key, reintentosActuales + 1);
        return this._resolver(input, 'REINTENTAR', { reintentos: reintentosActuales + 1, reintentos_max: reintentosMax });
      }
      // agotado -> SALTAR (no detener el taller)
      return this._resolver(input, 'SALTAR', { reintentos: reintentosActuales, agotado: true });
    }

    // politica ABIERTO (null/'abierto') o sin política -> SolicitudDecision al dueño.
    const espera = await this._solicitarDecision(input);
    if (espera.status >= 400) return espera;
    this._publicarEvento('manejo-fallo.manejar.response', {
      request_id: input.request_id, ...espera.data, timestamp: nowISO()
    });
    return { status: 200, data: espera.data };
  }

  // _avisar: NOTIFICA siempre por el canal del dueño (fire-and-forget aviso.solicitar).
  _avisar(input) {
    this.eventBus?.publish('aviso.solicitar', {
      project_id: input.project_id, aviso_id: `aviso_${crypto.randomUUID().slice(0, 8)}`,
      tipo: 'fallo',
      nombre: input.modelo_nombre || input.nombre || 'desconocido',
      detalle: input.motivo || input.error || null,
      correlation_id: input.correlation_id, timestamp: nowISO()
    });
  }

  // _solicitarDecision: pide al dueño (adaptador-confirmacion.confirmar.request) la
  // acción para el fallo. Puerto SolicitudDecision; el sistema espera, no sustituye.
  async _solicitarDecision(input) {
    const resp = await this._rpc('adaptador-confirmacion.confirmar.request', {
      project_id: input.project_id, tipo: 'reanudar_ciclo',
      confirmacion_id: input.confirmacion_id ? `${input.confirmacion_id}_fallo` : crypto.randomUUID(),
      nombre: input.modelo_nombre || input.nombre || 'desconocido',
      detalle: `Fallo: ${input.motivo || input.error || 'desconocido'}. ¿Reintentar?`,
      correlation_id: input.correlation_id
    }, { timeout_ms: 30000 });

    if (!resp || resp.status !== 200) {
      const err = this._errorResponse(502, 'CANAL_NO_CONFIRMO', 'no se pudo pedir la decision al dueño', { canal: 'confirmacion' });
      this._failed('manejar', input, 'solicitud_decision_fallo', {});
      return { status: 500, data: { accion: 'ESPERAR_DECISION', fallo: true, error: err.error } };
    }
    return {
      status: 200,
      data: {
        accion: 'ESPERAR_DECISION',
        confirmacion_id: resp.data?.confirmacion_id || null,
        esperando: true,
        nota: 'la politica exige juicio del dueño; el sistema espera, no decide'
      }
    };
  }

  // _resolver: devuelve la accion decidida (según política del dueño) y re-emite la
  // decisión (evento de dominio, el encadenamiento respeta la acción).
  _resolver(input, accion, extra) {
    const data = { accion, ...extra, decision: 'politica_del_dueno' };
    this._publicarEvento('manejo-fallo.manejar.response', {
      request_id: input.request_id, ...data, timestamp: nowISO()
    });
    return { status: 200, data };
  }

  _failed(op, input, motivo, extra) {
    this._publicarEvento(`manejo-fallo.${op}.failed`, {
      project_id: input.project_id, motivo, ...extra,
      correlation_id: input.correlation_id, timestamp: nowISO()
    });
  }

  _publicarEvento(evento, data) {
    if (this.eventBus?.publish) this.eventBus.publish(evento, data);
  }
}

module.exports = ManejoFalloReflejo;

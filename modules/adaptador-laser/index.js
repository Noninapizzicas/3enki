'use strict';
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const BRIDGE_PREFIX = 'bridge.grbl';

class AdaptadorLaserReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'adaptador-laser';
    this.version = 'reflejo-0.1.0';
    this._streamAbierto = false;
    this._unsubEstadoPush = null;
    this._unsubProgresoPush = null;
  }

  // =============================================================
  // Handlers RPC — una línea cada uno, delegan en _atender
  // =============================================================
  onEnviarGcodeRequest(e) {
    return this._atender(e, 'enviar_gcode', 'adaptador-laser.enviar_gcode.response', d => this._enviarGcode(d));
  }
  onIniciarTrabajoRequest(e) {
    return this._atender(e, 'iniciar_trabajo', 'adaptador-laser.iniciar_trabajo.response', d => this._iniciarTrabajo(d));
  }
  onObservarEstadoRequest(e) {
    return this._atender(e, 'observar_estado', 'adaptador-laser.observar_estado.response', d => this._observarEstado(d));
  }

  // =============================================================
  // Proyecciones (lógica de dominio)
  // =============================================================

  async _enviarGcode(input) {
    const pid = (input && input.project_id) || null;
    const gcode = (input && input.gcode) || null;
    if (!gcode || typeof gcode !== 'string' || gcode.trim().length === 0) {
      this._publicarEvento('enviar_gcode.failed', { project_id: pid, motivo: 'gcode_vacio' });
      return { status: 400, data: { error: 'INVALID_INPUT', message: 'gcode requerido (no vacio)' } };
    }

    this._unsubProgresoPush = this._subscribeBridge(`${BRIDGE_PREFIX}.progreso_push`, (data) => {
      this._publicarEvento('adaptador-laser.progreso', {
        project_id: pid,
        linea: data.data?.linea || data.linea,
        total: data.data?.total || data.total,
        progreso: data.data?.progreso || data.progreso,
      });
    });

    const res = await this._rpcBridge(`${BRIDGE_PREFIX}.enviar_gcode.request`, {
      gcode: gcode.trim(), project_id: pid
    }, { timeout_ms: 300000 });

    if (this._unsubProgresoPush) { this._unsubProgresoPush(); this._unsubProgresoPush = null; }

    if (!res) {
      this._publicarEvento('enviar_gcode.failed', { project_id: pid, motivo: 'bridge_sin_respuesta' });
      return { status: 503, data: { error: 'UPSTREAM_UNREACHABLE', message: 'bridge no responde (timeout)' } };
    }
    if (res.ok !== true) {
      this._publicarEvento('enviar_gcode.failed', { project_id: pid, motivo: 'bridge_rechazo', error: res.error });
      return { status: 502, data: { error: 'UPSTREAM_INVALID_RESPONSE', message: res.error || 'bridge rechazo el gcode' } };
    }
    return { status: 200, data: { ok: true, lineas: res.lineas || null, confirmado: true } };
  }

  async _iniciarTrabajo(input) {
    const pid = (input && input.project_id) || null;
    const cmd = (input && input.comando) || null;
    if (!cmd || typeof cmd !== 'string') {
      this._publicarEvento('iniciar_trabajo.failed', { project_id: pid, motivo: 'comando_requerido' });
      return { status: 400, data: { error: 'INVALID_INPUT', message: 'comando requerido' } };
    }
    const res = await this._rpcBridge(`${BRIDGE_PREFIX}.iniciar_trabajo.request`, {
      comando: cmd, project_id: pid
    }, { timeout_ms: 15000 });
    if (!res) {
      this._publicarEvento('iniciar_trabajo.failed', { project_id: pid, motivo: 'bridge_sin_respuesta' });
      return { status: 503, data: { error: 'UPSTREAM_UNREACHABLE', message: 'bridge no responde (timeout)' } };
    }
    if (res.ok !== true) {
      this._publicarEvento('iniciar_trabajo.failed', { project_id: pid, motivo: 'bridge_rechazo', error: res.error });
      return { status: 502, data: { error: 'UPSTREAM_INVALID_RESPONSE', message: res.error || 'bridge rechazo el comando' } };
    }
    return { status: 200, data: { ok: true, confirmado: true } };
  }

  async _observarEstado(input) {
    const pid = (input && input.project_id) || null;
    if (this._streamAbierto) {
      return { status: 200, data: { ok: true, stream: 'ya_abierto' } };
    }
    const res = await this._rpcBridge(`${BRIDGE_PREFIX}.observar_estado.request`, { project_id: pid }, { timeout_ms: 15000 });
    if (!res || res.ok !== true) {
      this._publicarEvento('observar_estado.failed', { project_id: pid, motivo: 'bridge_sin_respuesta' });
      return { status: 503, data: { error: 'UPSTREAM_UNREACHABLE', message: 'bridge no responde para el stream' } };
    }
    this._unsubEstadoPush = this._subscribeBridge(`${BRIDGE_PREFIX}.estado_push`, (data) => {
      const crudo = data?.data || data;
      const interpretado = this._interpretarEstado(crudo);
      this._publicarEvento('adaptador-laser.estado_crudo', {
        project_id: pid, crudo, estado_sistema: interpretado
      });
    });
    this._streamAbierto = true;
    return { status: 200, data: { ok: true, stream: 'abierto', via: 'bridge' } };
  }

  // =============================================================
  // CONVERSOR: estado crudo GRBL -> estado_sistema
  // =============================================================
  _interpretarEstado(crudo) {
    const c = crudo || {};
    const estadoMaquina = c.estado_maquina || 'Unknown';
    const estadoSistema = c.estado_sistema || 'desconocido';
    const mpos = c.mpos || { x: 0, y: 0, z: 0 };

    return {
      estado: estadoSistema,
      estado_maquina: estadoMaquina,
      pos_x: mpos.x != null ? this._round(mpos.x, 3) : null,
      pos_y: mpos.y != null ? this._round(mpos.y, 3) : null,
      pos_z: mpos.z != null ? this._round(mpos.z, 3) : null,
      feed: c.feed != null ? c.feed : null,
      spindle: c.spindle != null ? c.spindle : null,
      laser_activo: (c.spindle || 0) > 0,
    };
  }

  // =============================================================
  // Utilidades
  // =============================================================
  _publicarEvento(evento, data) {
    if (this.eventBus?.publish) this.eventBus.publish(evento, { ...data, timestamp: new Date().toISOString() });
  }
}

module.exports = AdaptadorLaserReflejo;

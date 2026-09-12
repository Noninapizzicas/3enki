'use strict';
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const BRIDGE_PREFIX = 'bridge.moonraker';

/**
 * AdaptadorImpresoraReflejo — PUENTE hacia la impresora 3D SPARKX i7 (Moonraker).
 *
 * Dos modos de transporte (transparente para quien consume el adaptador):
 *   LOCAL  — puerto inyectado via registrarImpresora() (mismo proceso).
 *   REMOTO — thin bridge en el PC del dueño, comunicado por MQTT RPC
 *            (bridge.moonraker.*.request/response + estado_push).
 * Si hay puerto local, se usa; si no, se delega al bridge remoto.
 *
 * La impresora reporta por PUSH (WebSocket, sin polling). El adaptador interpreta
 * el estado crudo -> estado_sistema (CONVERSOR interno _interpretarEstado, 9.4).
 * Todo flujo cierra su circulo con par de fallo (*.failed).
 */
class AdaptadorImpresoraReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'adaptador-impresora';
    this.version = 'reflejo-0.2.0';
    this._impresora = null;   // puerto inyectado local (opcional)
    this._streamAbierto = false;
    this._unsubBridgePush = null;
  }

  // =============================================================
  // Handlers RPC — una línea cada uno, delegan en _atender
  // =============================================================
  onSubirGcodeRequest(e) {
    return this._atender(e, 'subir_gcode', 'adaptador-impresora.subir_gcode.response', d => this._subirGcode(d));
  }
  onIniciarImpresionRequest(e) {
    return this._atender(e, 'iniciar_impresion', 'adaptador-impresora.iniciar_impresion.response', d => this._iniciarImpresion(d));
  }
  onObservarEstadoRequest(e) {
    return this._atender(e, 'observar_estado', 'adaptador-impresora.observar_estado.response', d => this._observarEstado(d));
  }

  // =============================================================
  // Puerto de la impresora — lo cablea el thin PC del dueño
  // =============================================================
  registrarImpresora(impresora) {
    if (impresora && typeof impresora.subirGcode === 'function'
      && typeof impresora.iniciarImpresion === 'function'
      && typeof impresora.observarEstado === 'function') {
      this._impresora = impresora;
    }
  }

  // =============================================================
  // Proyecciones (lógica de dominio DENTRO del módulo)
  // =============================================================

  // 9.1 — subir gcode a la impresora
  async _subirGcode(input) {
    const pid = (input && input.project_id) || null;
    const gcode = (input && input.gcode) || null;
    if (!gcode || typeof gcode !== 'string' || gcode.trim().length === 0) {
      this._publicarEvento('subir_gcode.failed', { project_id: pid, motivo: 'gcode_vacio' });
      return { status: 400, data: { error: 'INVALID_INPUT', message: 'gcode requerido (no vacio)' } };
    }
    if (this._impresora) {
      try {
        const res = await this._impresora.subirGcode(gcode.trim());
        if (!res || res.ok !== true) {
          this._publicarEvento('subir_gcode.failed', { project_id: pid, motivo: 'impresora_rechazo' });
          return { status: 502, data: { error: 'UPSTREAM_INVALID_RESPONSE', message: 'la impresora no confirmo la subida' } };
        }
        return { status: 200, data: { ok: true, id: res.id || null, confirmado: true } };
      } catch (err) {
        this._publicarEvento('subir_gcode.failed', { project_id: pid, motivo: 'error', error: err.message });
        return { status: 503, data: { error: 'UPSTREAM_UNREACHABLE', message: err.message } };
      }
    }
    return this._delegarAlBridge('subir_gcode', { gcode: gcode.trim(), project_id: pid }, pid);
  }

  // 9.2 — iniciar la impresion del gcode ya subido
  async _iniciarImpresion(input) {
    const pid = (input && input.project_id) || null;
    if (this._impresora) {
      try {
        const res = await this._impresora.iniciarImpresion();
        if (!res || res.ok !== true) {
          this._publicarEvento('iniciar_impresion.failed', { project_id: pid, motivo: 'impresora_rechazo' });
          return { status: 502, data: { error: 'UPSTREAM_INVALID_RESPONSE', message: 'la impresora no confirmo el inicio' } };
        }
        return { status: 200, data: { ok: true, confirmado: true } };
      } catch (err) {
        this._publicarEvento('iniciar_impresion.failed', { project_id: pid, motivo: 'error', error: err.message });
        return { status: 503, data: { error: 'UPSTREAM_UNREACHABLE', message: err.message } };
      }
    }
    return this._delegarAlBridge('iniciar_impresion', { filename: input?.filename || input?.id, project_id: pid }, pid);
  }

  // 9.3 — abrir el stream de estado (push, sin polling) y entregar estado_crudo
  async _observarEstado(input) {
    const pid = (input && input.project_id) || null;
    if (this._streamAbierto) {
      return { status: 200, data: { ok: true, stream: 'ya_abierto' } };
    }
    if (this._impresora) {
      try {
        const res = await this._impresora.observarEstado((crudo) => {
          const interpretado = this._interpretarEstado(crudo);
          this._publicarEvento('adaptador-impresora.estado_crudo', {
            project_id: pid, crudo, estado_sistema: interpretado
          });
        });
        if (!res || res.ok !== true) {
          this._publicarEvento('observar_estado.failed', { project_id: pid, motivo: 'stream_rechazado' });
          return { status: 502, data: { error: 'UPSTREAM_INVALID_RESPONSE', message: 'no se pudo abrir el stream de estado' } };
        }
        this._streamAbierto = true;
        this._unsubscribeStream = res.unsubscribe || null;
        return { status: 200, data: { ok: true, stream: 'abierto' } };
      } catch (err) {
        this._publicarEvento('observar_estado.failed', { project_id: pid, motivo: 'error', error: err.message });
        return { status: 503, data: { error: 'UPSTREAM_UNREACHABLE', message: err.message } };
      }
    }
    return this._delegarStreamAlBridge(pid);
  }

  // 9.4 — CONVERSOR interno: estado crudo -> estado_sistema
  // {imprimiendo, completado, fallo, pausado, desconectado}
  _interpretarEstado(crudo) {
    const c = (crudo && crudo.data) || crudo || {};
    const printStats = c.print_stats || {};
    const state = (printStats.state || 'desconocido').toLowerCase();
    const virtualSdcard = c.virtual_sdcard || {};
    const filamentSensor = c.filament_switch_sensor || {};
    const pauseResume = c.pause_resume || {};
    const idleTimeout = c.idle_timeout || {};
    const extruder = c.extruder || {};
    const heaterBed = c.heater_bed || {};

    let estado;
    if (state === 'paused' || pauseResume.is_paused === true) estado = 'pausado';
    else if (state === 'printing') estado = 'imprimiendo';
    else if (state === 'complete') estado = 'completado';
    else if (state === 'error') estado = 'fallo';
    else estado = 'desconectado';

    return {
      estado,
      progress: virtualSdcard.progress != null ? this._round(virtualSdcard.progress, 4) : null,
      filament_used_mm: printStats.filament_used != null ? this._round(printStats.filament_used, 2) : null,
      print_duration: printStats.print_duration != null ? this._round(printStats.print_duration, 2) : null,
      total_duration: printStats.total_duration != null ? this._round(printStats.total_duration, 2) : null,
      current_layer: printStats.current_layer != null ? printStats.current_layer : null,
      total_layer: printStats.total_layer != null ? printStats.total_layer : null,
      filament_detected: filamentSensor.filament_detected != null ? filamentSensor.filament_detected : null,
      extruder_temp: extruder.temperature != null ? this._round(extruder.temperature, 2) : null,
      extruder_target: extruder.target != null ? this._round(extruder.target, 2) : null,
      bed_temp: heaterBed.temperature != null ? this._round(heaterBed.temperature, 2) : null,
      bed_target: heaterBed.target != null ? this._round(heaterBed.target, 2) : null,
      idle_state: idleTimeout.state || 'desconocido'
    };
  }

  // =============================================================
  // Delegación al bridge remoto (MQTT RPC)
  // =============================================================
  async _delegarAlBridge(op, payload, pid) {
    const res = await this._rpcBridge(`${BRIDGE_PREFIX}.${op}.request`, payload, { timeout_ms: 30000 });
    if (!res) {
      this._publicarEvento(`${op}.failed`, { project_id: pid, motivo: 'bridge_sin_respuesta' });
      return { status: 503, data: { error: 'UPSTREAM_UNREACHABLE', message: 'bridge no responde (timeout)' } };
    }
    if (res.ok !== true) {
      this._publicarEvento(`${op}.failed`, { project_id: pid, motivo: 'bridge_rechazo', error: res.error });
      return { status: 502, data: { error: 'UPSTREAM_INVALID_RESPONSE', message: res.error || 'bridge rechazo la operacion' } };
    }
    if (op === 'subir_gcode') return { status: 200, data: { ok: true, id: res.id || null, confirmado: true } };
    return { status: 200, data: { ok: true, confirmado: true } };
  }

  async _delegarStreamAlBridge(pid) {
    const res = await this._rpcBridge(`${BRIDGE_PREFIX}.observar_estado.request`, { project_id: pid }, { timeout_ms: 15000 });
    if (!res || res.ok !== true) {
      this._publicarEvento('observar_estado.failed', { project_id: pid, motivo: 'bridge_sin_respuesta' });
      return { status: 503, data: { error: 'UPSTREAM_UNREACHABLE', message: 'bridge no responde para el stream' } };
    }
    this._unsubBridgePush = this._subscribeBridge(`${BRIDGE_PREFIX}.estado_push`, (data) => {
      const crudo = data?.data || data;
      const interpretado = this._interpretarEstado(crudo);
      this._publicarEvento('adaptador-impresora.estado_crudo', {
        project_id: pid, crudo, estado_sistema: interpretado
      });
    });
    this._streamAbierto = true;
    return { status: 200, data: { ok: true, stream: 'abierto', via: 'bridge' } };
  }

  // =============================================================
  // Utilidades
  // =============================================================
  _publicarEvento(evento, data) {
    if (this.eventBus?.publish) this.eventBus.publish(evento, { ...data, timestamp: new Date().toISOString() });
  }
}

module.exports = AdaptadorImpresoraReflejo;

/**
 * panel-trabajador — REFLEJO del taller 3D (pieza 16, rol HOY).
 *
 * Cara OPERATIVA del trabajador. Expone:
 *   - _estadoVivo: pieza actual + progreso + fase del ciclo, cruzando ciclo-impresion,
 *     cola y filamento por RPC (best-effort; huecos -> 'desconocido', nunca inventado).
 *   - _proximoAEncadenar: la siguiente pieza lista (cola.siguiente).
 *   - _eventosRecientes: últimos registros (historial.recientes).
 *   - _pendientesConfirmacion: confirmaciones que esperan decisión del dueño.
 *   - _control: comandos HOY que DELEGAN (pausar/abortar/reanudar -> ciclo-impresion;
 *     reintentar/saltar -> manejo-fallo; cambio de bobina -> filamento.cambiar;
 *     confirmar -> adaptador-confirmacion.confirmar). CERO juicio: no decide el futuro
 *     (eso es panel-jefe); cada acción espera la respuesta del dueño.
 *
 * Reflejo puro, sin store propio. Sin gesto de jefe: no aprueba propuestas ni marca
 * urgencia futura. Pares de fallo panel-trabajador.*.failed.
 *
 * v0.1.0: FASE 4 TANDA 4 (última).
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

// Acciones de control HOY permitidas (delegan; nada de decisión futura).
const ACCIONES = Object.freeze([
  'pausar', 'abortar', 'reanudar', 'reintentar', 'saltar', 'cambio_bobina', 'confirmar'
]);

class PanelTrabajadorReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'panel-trabajador';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── Handlers RPC ──
  onEstadoVivoRequest(e)       { return this._atender(e, 'estado_vivo',      'panel-trabajador.estado_vivo.response', d => this._estadoVivo(d)); }
  onProximoEncadenarRequest(e) { return this._atender(e, 'proximo_encadenar', 'panel-trabajador.proximo_encadenar.response', d => this._proximoAEncadenar(d)); }
  onEventosRequest(e)          { return this._atender(e, 'eventos',          'panel-trabajador.eventos.response', d => this._eventosRecientes(d)); }
  onPendientesRequest(e)       { return this._atender(e, 'pendientes',       'panel-trabajador.pendientes.response', d => this._pendientesConfirmacion(d)); }
  onControlRequest(e)          { return this._atender(e, 'control',          'panel-trabajador.control.response', d => this._control(d)); }

  // ── PROYECCIONES (dominio) ──

  // _estadoVivo: cruza ciclo + cola + filamento + eventos por RPC (best-effort).
  // Dato ausente -> 'desconocido' (nunca inventado).
  async _estadoVivo(input) {
    if (!input.project_id) return this._invalid('project_id');
    const pid = input.project_id;
    const cid = input.correlation_id;
    const [ciclo, cola, filamento, eventos] = await Promise.all([
      this._rpc('ciclo-impresion.estado.request', { project_id: pid, correlation_id: cid }),
      this._rpc('cola.siguiente.request', { project_id: pid, correlation_id: cid }),
      this._rpc('filamento.evaluar.request', { project_id: pid, correlation_id: cid }),
      this._rpc('historial.recientes.request', { project_id: pid, n: 5, correlation_id: cid })
    ]);
    return {
      status: 200,
      data: {
        fase: (ciclo && ciclo.status === 200 && ciclo.data) ? ciclo.data : { estado: 'desconocido' },
        pieza: this._piezaDe(cola),
        cola: (cola && cola.status === 200 && cola.data) ? cola.data : 'desconocido',
        filamento: (filamento && filamento.status === 200 && filamento.data) ? filamento.data : 'desconocido',
        eventos: (eventos && eventos.status === 200 && eventos.data) ? eventos.data.registros || [] : [],
        timestamp: nowISO()
      }
    };
  }

  // _proximoAEncadenar: la siguiente cabecera LISTA (la cola la ofrece; no se decide aquí).
  async _proximoAEncadenar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const r = await this._rpc('cola.siguiente.request', { project_id: input.project_id, correlation_id: input.correlation_id });
    return { status: 200, data: (r && r.data) ? r.data : { siguiente: null, razon: 'desconocido' } };
  }

  // _eventosRecientes: últimos registros del taller (append-only, dato medido).
  async _eventosRecientes(input) {
    if (!input.project_id) return this._invalid('project_id');
    const n = Number(input.n || 10);
    const r = await this._rpc('historial.recientes.request', { project_id: input.project_id, n, correlation_id: input.correlation_id });
    return { status: 200, data: (r && r.data) ? r.data : { registros: [], total: 0 } };
  }

  // _pendientesConfirmacion: las decisiones que esperan al dueño (en el ciclo actual).
  async _pendientesConfirmacion(input) {
    if (!input.project_id) return this._invalid('project_id');
    const ciclo = await this._rpc('ciclo-impresion.estado.request', { project_id: input.project_id, correlation_id: input.correlation_id });
    const est = ((ciclo || {}).data) || {};
    const pendientes = (est.estado === 'FALLIDA' || est.esperando)
      ? [{ fase: est.estado || 'desconocido', tarea_id: est.pieza ? est.pieza.tarea_id : null, motivo: est.error || null }]
      : [];
    return { status: 200, data: { pendientes, total: pendientes.length } };
  }

  // _control: comando HOY que DELEGA en el módulo de dominio. CERO juicio.
  async _control(input) {
    if (!input.project_id) return this._invalid('project_id');
    const accion = input.accion || input.tipo;
    if (!ACCIONES.includes(accion)) return this._invalid('accion');

    const pid = input.project_id;
    const cid = input.correlation_id;
    let topic, payload;

    switch (accion) {
      case 'pausar':
        topic = 'ciclo-impresion.pausar.request'; payload = { project_id: pid, correlation_id: cid }; break;
      case 'reanudar':
        topic = 'ciclo-impresion.reanudar.request'; payload = { project_id: pid, correlation_id: cid }; break;
      case 'abortar':
        topic = 'ciclo-impresion.abortar.request'; payload = { project_id: pid, motivo: input.motivo || 'abortado_por_trabajador', correlation_id: cid }; break;
      case 'reintentar':
        topic = 'manejo-fallo.manejar.request'; payload = { project_id: pid, tarea_id: input.tarea_id, politica: 'reintentar', reintentos_max: input.reintentos_max, correlation_id: cid }; break;
      case 'saltar':
        topic = 'manejo-fallo.manejar.request'; payload = { project_id: pid, tarea_id: input.tarea_id, politica: 'saltar', correlation_id: cid }; break;
      case 'cambio_bobina':
        topic = 'filamento.cambiar.request'; payload = { project_id: pid, bobina_id: input.bobina_id, material: input.material, gramos_restantes: input.gramos_restantes, en_uso: true, correlation_id: cid }; break;
      case 'confirmar':
        topic = 'adaptador-confirmacion.confirmar.request'; payload = { project_id: pid, tipo: input.tipo_confirmacion || input.tipo, confirmacion_id: input.confirmacion_id, correlation_id: cid }; break;
    }

    try {
      const r = await this._rpc(topic, payload);
      if (!r || r.status >= 400) {
        this._failed('control', input, r && r.error ? r.error.code : 'delegacion_fallo', { accion });
        return r && r.error ? { status: r.status, error: r.error } : this._errorResponse(502, 'DELEGACION_FALLO', `no se pudo ejecutar ${accion}`, { accion });
      }
      return { status: 200, data: { accion, resultado: r.data || {}, delegado_en: topic } };
    } catch (err) {
      this._failed('control', input, 'delegacion_error', { accion, error: err.message });
      return this._errorResponse(502, 'DELEGACION_ERROR', err.message, { accion });
    }
  }

  // helpers internos (lógica de negocio DENTRO del módulo)
  _piezaDe(cola) {
    const d = (cola && cola.data) || {};
    if (d.siguiente) return d.siguiente;
    if (d.pieza) return d.pieza;
    if (d.en_impresion) return { tarea_id: d.en_impresion };
    return null;
  }

  _failed(op, input, motivo, extra) {
    this._publicarEvento(`panel-trabajador.${op}.failed`, {
      project_id: input.project_id, motivo, ...extra,
      correlation_id: input.correlation_id, timestamp: nowISO()
    });
  }

  _publicarEvento(evento, data) {
    if (this.eventBus?.publish) this.eventBus.publish(evento, data);
  }
}

module.exports = PanelTrabajadorReflejo;

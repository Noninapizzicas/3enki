/**
 * conserje — abre el camino al comerciante.
 *
 * Cruza lo que el sistema OFRECE (LibroDeCapacidades) con lo que el comerciante
 * USA (derivado del bus en vivo) y, cuando hay una brecha con intención, le
 * ofrece el siguiente paso — en POSITIVO, no señalando la carencia.
 *
 * No tiene sondas hardcodeadas: lee el grafo de capacidades y el uso real.
 *   intentada pero vacía  -> "lo buscas, te falta montarlo, ¿lo completamos?"
 *   ofrecida nunca tocada -> "esto existe y te daría valor, ¿lo arrancamos?"
 *
 * Apagado por defecto. Su on/off vive en el registro central de interruptores
 * (botón 'conserje'); reacciona a interruptor.cambiado en caliente. Cooldown
 * por capacidad para no agobiar.
 */

'use strict';

const crypto = require('crypto');
const BaseModule = require('../_shared/base-module');
const { LibroDeCapacidades, PIZZEPOS_CAPACIDADES } = require('../_shared/libro-capacidades');

// Cómo el bus delata el USO de una capacidad. El project_id viaja en el .request;
// el estado (lleno/vacío) en el .response — que NO lleva project_id. Por eso se
// correla request->response por request_id.
//   SEÑAL_REQUEST: <evento>.request -> capacidad (da el project_id)
//   SEÑAL_RESPONSE: <evento>.response -> { capacidad, lleno(data) } (da el estado)
//   SEÑAL_EVENTO: evento de dominio autocontenido (project_id + significado juntos)
const SEÑAL_REQUEST = {
  'carta-marketing.get_perfil.request': 'marca',
  'recetas.listar.request': 'recetas',
  'carta.get.request': 'carta',
  'carta.list.request': 'carta'
};
const SEÑAL_RESPONSE = {
  'carta-marketing.get_perfil.response': {
    capacidad: 'marca',
    lleno: d => !!(d && (d.onboarding_completado || (d.esencia && d.esencia.nombre) || d.nombre))
  },
  'recetas.listar.response': {
    capacidad: 'recetas',
    lleno: d => !!(d && ((d.total || 0) > 0 || (Array.isArray(d.recetas) && d.recetas.length > 0)))
  },
  'carta.get.response': {
    capacidad: 'carta',
    lleno: d => !!(d && ((Array.isArray(d.productos) && d.productos.length > 0) || d.carta_id))
  },
  'carta.list.response': {
    capacidad: 'carta',
    lleno: d => !!(d && ((d.total || 0) > 0 || (Array.isArray(d.cartas) && d.cartas.length > 0)))
  }
};
const SEÑAL_EVENTO = {
  'escandallo.coste.calculado': { capacidad: 'escandallo', lleno: () => true }
};

class ConserjeModule extends BaseModule {
  constructor() {
    super();
    this.name = 'conserje';
    this.version = '0.1.0';
    this.config = null;
    this.libro = new LibroDeCapacidades(PIZZEPOS_CAPACIDADES);
    this.activo = false;                 // OFF por defecto (lo gobierna el interruptor)
    this.estados = new Map();            // project_id -> { usadas:Set, intentadas:Set }
    this.cooldown = new Map();           // `${project}::${capacidad}` -> ts
    this.pendientes = new Map();         // project_id -> empujon (lo lee el nervio, una vez)
    this.pendingReq = new Map();         // request_id -> { project_id, capacidad } (correla req->resp)
    this.maxPendingReq = 500;
    this.dirty = new Set();
    this._onBusMessage = null;
    this._tickTimer = null;
    this.cooldownMs = 24 * 60 * 60 * 1000;
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.metrics = context.metrics;
    this.config = context.moduleConfig || {};
    this.activo = this.config.enabled_default === true;   // por defecto false
    this.cooldownMs = Number(this.config.cooldown_h ? this.config.cooldown_h * 3600000 : null) || 24 * 60 * 60 * 1000;

    this._registrarBoton();   // por si interruptores ya cargó

    this._startBusCapture();
    const tickMs = Number(this.config.tick_ms) || 15000;
    this._tickTimer = setInterval(() => this._tick(), tickMs);

    this.logger?.info('conserje.loaded', { module: this.name, version: this.version, activo: this.activo });
  }

  async onUnload() {
    this._stopBusCapture();
    if (this._tickTimer) clearInterval(this._tickTimer);
    this._tickTimer = null;
    this.estados.clear();
    this.cooldown.clear();
    this.pendientes.clear();
    this.pendingReq.clear();
    this.dirty.clear();
    this.logger?.info('conserje.unloaded', { module: this.name });
  }

  // registra su botón en el panel central. Idempotente: se llama al cargar y
  // cada vez que interruptores pide registro (cura la carrera de arranque).
  _registrarBoton() {
    try {
      this.eventBus.publish('interruptor.registrar', {
        id: 'conserje', label: 'Conserje (empujones al comerciante)', grupo: 'aprendizaje',
        descripcion: 'Sugiere al comerciante el siguiente paso según lo que ofrece el sistema y lo que ya usa.',
        default: false
      });
    } catch (_) { /* best-effort */ }
  }

  // interruptores (re)cargó y pide a todos que se registren -> respondemos.
  onSolicitarRegistro() {
    this._registrarBoton();
  }

  // ── on/off en caliente desde el panel ──
  onInterruptorCambiado(event) {
    const d = (event && event.data) || event || {};
    if (d.id !== 'conserje') return;
    this.activo = !!d.enabled;
    this.logger?.warn('conserje.toggled', { activo: this.activo });
  }

  // ── oído al bus: deriva usadas / intentadas ──
  _startBusCapture() {
    const mqtt = this.eventBus?.mqtt;
    if (!mqtt || typeof mqtt.on !== 'function') {
      this.logger?.warn('conserje.bus.unavailable', {});
      return;
    }
    this._onBusMessage = (topic, message) => {
      try { this._capturar(topic, message); } catch (_) { this.metrics?.increment('conserje.errors.total', { kind: 'capture' }); }
    };
    mqtt.on('message', this._onBusMessage);
  }

  _stopBusCapture() {
    const mqtt = this.eventBus?.mqtt;
    if (mqtt && this._onBusMessage && typeof mqtt.removeListener === 'function') mqtt.removeListener('message', this._onBusMessage);
    this._onBusMessage = null;
  }

  _capturar(topic, message) {
    const env = this._parseEnvelope(message);
    if (!env) return;
    const eventType = env.event_type || this._eventTypeFromTopic(topic);
    if (!eventType) return;
    const data = env.data || {};

    // .request -> recuerda qué proyecto+capacidad por request_id (el response no lo lleva)
    const capReq = SEÑAL_REQUEST[eventType];
    if (capReq) {
      const projectId = data.project_id || data.projectId || null;
      if (projectId && data.request_id) {
        this.pendingReq.set(data.request_id, { project_id: projectId, capacidad: capReq });
        while (this.pendingReq.size > this.maxPendingReq) {
          this.pendingReq.delete(this.pendingReq.keys().next().value);  // evict el más viejo
        }
      }
      return;
    }

    // .response -> resuelve el proyecto por request_id y evalúa el estado
    const señalResp = SEÑAL_RESPONSE[eventType];
    if (señalResp) {
      const pend = data.request_id ? this.pendingReq.get(data.request_id) : null;
      if (!pend) return;
      this.pendingReq.delete(data.request_id);
      const inner = (data && typeof data.data === 'object' && data.data) ? data.data : data;  // response envuelve en .data
      this._actualizar(pend.project_id, señalResp.capacidad, señalResp.lleno(inner));
      return;
    }

    // evento de dominio autocontenido (project_id + significado juntos)
    const señalEv = SEÑAL_EVENTO[eventType];
    if (señalEv) {
      const projectId = data.project_id || data.projectId || null;
      if (projectId) this._actualizar(projectId, señalEv.capacidad, señalEv.lleno(data));
    }
  }

  _actualizar(projectId, capacidad, lleno) {
    const est = this._estado(projectId);
    if (lleno) {                                   // entrega valor -> usada
      est.usadas.add(capacidad);
      est.intentadas.delete(capacidad);
    } else if (!est.usadas.has(capacidad)) {       // la toca vacía -> intentada (intención)
      est.intentadas.add(capacidad);
    }
    this.dirty.add(projectId);
  }

  _estado(projectId) {
    let est = this.estados.get(projectId);
    if (!est) { est = { usadas: new Set(), intentadas: new Set() }; this.estados.set(projectId, est); }
    return est;
  }

  // ── evalúa la brecha y empuja (si activo) ──
  _tick() {
    if (!this.activo || this.dirty.size === 0) { this.dirty.clear(); return; }
    const proyectos = Array.from(this.dirty);
    this.dirty.clear();
    for (const projectId of proyectos) {
      const est = this.estados.get(projectId);
      if (!est) continue;
      const item = this.libro.siguienteEmpujon({ usadas: est.usadas, intentadas: est.intentadas });
      if (!item) continue;
      const key = `${projectId}::${item.id}`;
      if (Date.now() - (this.cooldown.get(key) || 0) < this.cooldownMs) continue;  // no agobiar
      this.cooldown.set(key, Date.now());
      this._emitirEmpujon(projectId, item);
    }
  }

  _emitirEmpujon(projectId, item) {
    const mensaje = item.tipo === 'desbloqueo'
      ? `Veo que buscas ${item.ofrece}, pero aún está sin montar. ¿Lo completamos? Es rápido.`
      : `¿Sabías que puedes tener ${item.ofrece}? Si quieres, lo arrancamos.`;
    const empujon = { tipo: item.tipo, recurso: item.id, mensaje, accion_sugerida: item.entrada };
    this.pendientes.set(projectId, empujon);   // el nervio lo leerá y consumirá (una vez)
    try {
      this.eventBus.publish('conserje.empujon', {
        project_id: projectId, ...empujon,
        correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
      });
      this.metrics?.increment('conserje.empujon.total', { tipo: item.tipo, recurso: item.id });
      this.logger?.info('conserje.empujon', { project_id: projectId, recurso: item.id, tipo: item.tipo });
    } catch (_) {
      this.metrics?.increment('conserje.errors.total', { kind: 'emit' });
    }
  }

  // ── el NERVIO lee el empujón pendiente (y lo CONSUME: se ofrece una vez) ──
  async handleEmpujonPendiente(data) {
    const project_id = data && (data.project_id || data.projectId);
    if (!project_id) return { status: 200, data: { empujon: null } };
    const empujon = this.pendientes.get(project_id) || null;
    if (empujon) this.pendientes.delete(project_id);   // consume-on-read
    return { status: 200, data: { empujon } };
  }

  // ── UI: ver la brecha de un proyecto (visibilidad / debug) ──
  async handleBrecha(data) {
    try {
      const { project_id } = data || {};
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id requerido', { field: 'project_id' });
      const est = this.estados.get(project_id) || { usadas: new Set(), intentadas: new Set() };
      const brecha = this.libro.brecha({ usadas: est.usadas, intentadas: est.intentadas });
      return {
        status: 200,
        data: {
          project_id, activo: this.activo,
          usadas: Array.from(est.usadas), intentadas: Array.from(est.intentadas),
          brecha
        }
      };
    } catch (err) {
      return this._handleHandlerError('conserje.brecha.failed', err, 'brecha');
    }
  }

  async handleHealthCheck() {
    return { status: 200, data: { module: this.name, version: this.version, activo: this.activo, proyectos: this.estados.size } };
  }

  _parseEnvelope(message) {
    if (!message) return null;
    if (typeof message === 'object' && !Buffer.isBuffer(message)) return message;
    try { return JSON.parse(Buffer.isBuffer(message) ? message.toString('utf-8') : String(message)); } catch (_) { return null; }
  }

  _eventTypeFromTopic(topic) {
    const m = String(topic || '').match(/\/events\/(.+)$/);
    return m ? m[1].replace(/\//g, '.') : null;
  }
}

module.exports = ConserjeModule;

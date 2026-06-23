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

// Cómo el bus delata el USO de una capacidad. lleno(data) = ¿entrega valor ya?
// Si el evento llega pero lleno=false -> el comerciante la INTENTA (la toca vacía).
const SEÑALES = {
  'carta-marketing.get_perfil.response': {
    capacidad: 'marca',
    lleno: d => !!(d && (d.onboarding_completado || (d.esencia && d.esencia.nombre) || d.nombre))
  },
  'recetas.listar.response': {
    capacidad: 'recetas',
    lleno: d => !!(d && ((d.total || 0) > 0 || (Array.isArray(d.recetas) && d.recetas.length > 0)))
  },
  'escandallo.coste.calculado': { capacidad: 'escandallo', lleno: () => true },
  'carta.get.response': {
    capacidad: 'carta',
    lleno: d => !!(d && ((Array.isArray(d.productos) && d.productos.length > 0) || d.carta_id))
  },
  'carta.list.response': {
    capacidad: 'carta',
    lleno: d => !!(d && ((d.total || 0) > 0 || (Array.isArray(d.cartas) && d.cartas.length > 0)))
  }
};

class ConserjeModule extends BaseModule {
  constructor() {
    super();
    this.name = 'conserje';
    this.version = '0.2.0';
    this.config = null;
    this.libro = new LibroDeCapacidades(PIZZEPOS_CAPACIDADES);
    this.activo = false;                 // OFF por defecto (lo gobierna el interruptor 'conserje')
    this.activoRutas = false;            // OFF por defecto — interruptor 'conserje-rutas' (replay sugerente)
    this.umbralRuta = 3;                 // solo ofrece rutas aprendidas >= N veces
    this.estados = new Map();            // project_id -> { usadas:Set, intentadas:Set }
    this.cooldown = new Map();           // `${project}::${capacidad}` -> ts
    this.pendientes = new Map();         // project_id -> empujon (lo lee el nervio, una vez)
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
    this.activoRutas = this.config.rutas_enabled_default === true;   // por defecto false (aparcado)
    this.umbralRuta = Number(this.config.umbral_ruta) || 3;
    this.cooldownMs = Number(this.config.cooldown_h ? this.config.cooldown_h * 3600000 : null) || 24 * 60 * 60 * 1000;

    // registra sus botones en el panel central de interruptores
    try {
      this.eventBus.publish('interruptor.registrar', {
        id: 'conserje', label: 'Conserje (empujones al comerciante)', grupo: 'aprendizaje',
        descripcion: 'Sugiere al comerciante el siguiente paso según lo que ofrece el sistema y lo que ya usa.',
        default: false
      });
      this.eventBus.publish('interruptor.registrar', {
        id: 'conserje-rutas', label: 'Conserje · rutas aprendidas (replay)', grupo: 'aprendizaje',
        descripcion: 'Tras un paso, ofrece la ruta que el destilador aprendió que suele seguir (replay sugerente). Independiente del conserje base.',
        default: false
      });
    } catch (_) { /* el registro puede no estar aún; se re-registra al recargar */ }

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
    this.dirty.clear();
    this.logger?.info('conserje.unloaded', { module: this.name });
  }

  // ── on/off en caliente desde el panel ──
  onInterruptorCambiado(event) {
    const d = (event && event.data) || event || {};
    if (d.id === 'conserje') {
      this.activo = !!d.enabled;
      this.logger?.warn('conserje.toggled', { activo: this.activo });
    } else if (d.id === 'conserje-rutas') {
      this.activoRutas = !!d.enabled;
      this.logger?.warn('conserje.rutas.toggled', { activoRutas: this.activoRutas });
    }
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
    const señal = SEÑALES[eventType];
    if (!señal) return;
    const data = env.data || {};
    const projectId = data.project_id || data.projectId || null;
    if (!projectId) return;

    const est = this._estado(projectId);
    est.ultimaCapacidad = señal.capacidad;    // dónde está el comerciante (semilla del replay de rutas)
    if (señal.lleno(data)) {                  // entrega valor -> usada
      est.usadas.add(señal.capacidad);
      est.intentadas.delete(señal.capacidad);
    } else if (!est.usadas.has(señal.capacidad)) {  // la toca vacía -> intentada (intención)
      est.intentadas.add(señal.capacidad);
    }
    this.dirty.add(projectId);
  }

  _estado(projectId) {
    let est = this.estados.get(projectId);
    if (!est) { est = { usadas: new Set(), intentadas: new Set(), ultimaCapacidad: null }; this.estados.set(projectId, est); }
    return est;
  }

  // ── evalúa la brecha y empuja (si activo) ──
  async _tick() {
    if (this.dirty.size === 0) return;
    const proyectos = Array.from(this.dirty);
    this.dirty.clear();
    if (this.activo) this._tickBrecha(proyectos);              // empujón por brecha (OFRECE vs USA)
    if (this.activoRutas) await this._tickRutas(proyectos);    // empujón por ruta aprendida (replay sugerente)
  }

  _tickBrecha(proyectos) {
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

  // ── REPLAY SUGERENTE: pregunta al destilador "desde aquí, ¿por dónde se suele ir?" ──
  async _tickRutas(proyectos) {
    for (const projectId of proyectos) {
      if (this.pendientes.has(projectId)) continue;            // el empujón de brecha tiene prioridad este tick
      const est = this.estados.get(projectId);
      if (!est || !est.ultimaCapacidad) continue;
      let resp = null;
      try {
        resp = await this._rpc('destilador.ruta.request',
          { project_id: projectId, desde: est.ultimaCapacidad, limite: 1 }, { timeout_ms: 3000 });
      } catch (_) { this.metrics?.increment('conserje.errors.total', { kind: 'rpc_ruta' }); continue; }
      const ruta = resp && resp.data && Array.isArray(resp.data.rutas) ? resp.data.rutas[0] : null;
      if (!ruta || !Array.isArray(ruta.continuacion) || ruta.continuacion.length === 0) continue;
      if ((ruta.ocurrencias || 0) < this.umbralRuta) continue;  // solo rutas probadas
      const key = `${projectId}::ruta::${ruta.firma}`;
      if (Date.now() - (this.cooldown.get(key) || 0) < this.cooldownMs) continue;
      this.cooldown.set(key, Date.now());
      this._emitirEmpujonRuta(projectId, est.ultimaCapacidad, ruta);
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

  _emitirEmpujonRuta(projectId, desde, ruta) {
    const camino = ruta.continuacion.map(p => String(p).split('.')[0]).join(' → ');
    const mensaje = `Después de ${desde}, esto suele seguir así: ${camino}. ¿Sigo por ahí?`;
    const empujon = {
      tipo: 'ruta', recurso: ruta.firma, mensaje,
      accion_sugerida: ruta.continuacion[0], ruta: ruta.continuacion
    };
    this.pendientes.set(projectId, empujon);   // el nervio lo leerá y consumirá (una vez)
    try {
      this.eventBus.publish('conserje.empujon', {
        project_id: projectId, ...empujon,
        correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
      });
      this.metrics?.increment('conserje.empujon.total', { tipo: 'ruta', recurso: ruta.firma });
      this.logger?.info('conserje.empujon.ruta', { project_id: projectId, desde, firma: ruta.firma, pasos: ruta.continuacion.length });
    } catch (_) {
      this.metrics?.increment('conserje.errors.total', { kind: 'emit_ruta' });
    }
  }

  // publishAndWait genérico al bus (RPC request/response correlado por request_id).
  async _rpc(evento, payload = {}, { timeout_ms = 3000 } = {}) {
    if (!this.eventBus?.subscribe || !this.eventBus?.publish) return null;
    const request_id = crypto.randomUUID();
    const responseEvent = evento.endsWith('.request')
      ? evento.slice(0, -('.request'.length)) + '.response'
      : `${evento}.response`;
    return new Promise((resolve) => {
      let unsub = null;
      const timeout = setTimeout(() => { if (unsub) unsub(); resolve(null); }, timeout_ms);
      try {
        unsub = this.eventBus.subscribe(responseEvent, (event) => {
          const d = (event && event.data) || event;
          if (!d || d.request_id !== request_id) return;
          clearTimeout(timeout);
          if (unsub) unsub();
          resolve(d);
        });
        this.eventBus.publish(evento, { request_id, ...payload });
      } catch (_) {
        clearTimeout(timeout);
        if (unsub) unsub();
        resolve(null);
      }
    });
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

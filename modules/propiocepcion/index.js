/**
 * propiocepcion — copia eferente del sistema.
 *
 * Reflejo JS siempre-encendido. Escucha el bus crudo (mqtt.on('message')),
 * filtra los eventos de los modulos vinculados por proyecto (el recetario), y
 * deja constancia legible de lo que paso — tanto lo consciente (ops que dirige
 * el LLM en su turno) como lo reflejo (ejecuciones JS de otros modulos). Lo
 * persiste por proyecto en un archivo bounded.
 *
 * Es SOLO la mitad de la propiocepcion: la memoria (escribir lo que paso). La
 * otra mitad — el nervio que inyecta esta rebanada en el contexto del turno del
 * LLM para volverlo CONSCIENTE — vive en ai-gateway y se construye despues.
 *
 * Por que existe: el LLM no controla los reflejos (ni debe), pero tiene que ser
 * consciente de que ocurrieron, como el ser humano sabe que retiro la mano del
 * fuego aunque no lo decidiera. Sin esta constancia, el LLM supone ("guardado"
 * sin saber si se guardo) — el teatro. Con ella, ve lo que de verdad paso.
 */

'use strict';

const crypto = require('crypto');
const BaseModule = require('../_shared/base-module');

class PropiocepcionModule extends BaseModule {
  constructor() {
    super();
    this.name = 'propiocepcion';
    this.version = '1.0.0';

    // Inyectados en onLoad
    this.config = null;
    this.uiHandler = null;

    // Estado runtime
    this.buffers = new Map();        // project_id -> Array<record> (ring bounded)
    this.dirty = new Set();          // project_ids con cambios sin flushear
    this.pendingFsReads = new Map(); // request_id -> { project_id, resolve, timeout }
    this._onBusMessage = null;       // handler ligado, para removeListener
    this._flushTimer = null;

    // Derivados de config (rellenos en onLoad)
    this.scope = new Set();
    this.blueprint = new Set();
    this.bufferMax = 200;
    this.archivoPath = '/_propiocepcion.json';
  }

  // =============================================================
  // Lifecycle
  // =============================================================

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.metrics = context.metrics;
    this.config = context.moduleConfig || {};
    this.uiHandler = context.uiHandler || null;

    this.scope = new Set(this.config.scope_modulos || []);
    this.blueprint = new Set(this.config.modulos_blueprint || []);
    this.bufferMax = Number(this.config.buffer_max) || 200;
    this.archivoPath = this.config.archivo_path || '/_propiocepcion.json';

    this._startBusCapture();

    const flushMs = Number(this.config.flush_interval_ms) || 8000;
    this._flushTimer = setInterval(() => this._flushDirty(), flushMs);

    this.logger.info('propiocepcion.loaded', {
      module: this.name, version: this.version,
      scope: this.scope.size, flush_ms: flushMs
    });
  }

  async onUnload() {
    this._stopBusCapture();
    if (this._flushTimer) clearInterval(this._flushTimer);
    this._flushTimer = null;
    await this._flushDirty();
    for (const { timeout } of this.pendingFsReads.values()) clearTimeout(timeout);
    this.pendingFsReads.clear();
    this.buffers.clear();
    this.dirty.clear();
    this.logger.info('propiocepcion.unloaded', { module: this.name });
  }

  // =============================================================
  // Captura del bus (el reflejo escuchando el mundo)
  // =============================================================

  _startBusCapture() {
    const mqtt = this.eventBus?.mqtt;
    if (!mqtt || typeof mqtt.on !== 'function') {
      this.logger.warn('propiocepcion.bus.unavailable', { reason: 'eventBus.mqtt sin on()' });
      return;
    }
    this._onBusMessage = (topic, message) => {
      try { this._capturar(topic, message); }
      catch (err) { this.metrics?.increment('propiocepcion.errors.total', { kind: 'capture' }); }
    };
    mqtt.on('message', this._onBusMessage);
    this.logger.info('propiocepcion.bus.captured', {});
  }

  _stopBusCapture() {
    const mqtt = this.eventBus?.mqtt;
    if (mqtt && this._onBusMessage && typeof mqtt.removeListener === 'function') {
      mqtt.removeListener('message', this._onBusMessage);
    }
    this._onBusMessage = null;
  }

  _capturar(topic, message) {
    const env = this._parseEnvelope(message);
    if (!env) return;
    const eventType = env.event_type || this._eventTypeFromTopic(topic);
    if (!eventType) return;
    const domain = String(eventType).split('.')[0];
    // Solo el mundo vinculado al proyecto (scope). Lo demas no es "su mundo".
    if (!this.scope.has(domain)) return;

    const data = env.data || {};
    const projectId = data.project_id || data.projectId || null;
    if (!projectId) return; // sin proyecto no hay propiocepcion por proyecto

    const record = this._buildRecord(eventType, domain, data, env);
    const buf = this.buffers.get(projectId) || [];
    buf.push(record);
    while (buf.length > this.bufferMax) buf.shift();
    this.buffers.set(projectId, buf);
    this.dirty.add(projectId);

    this.metrics?.increment('propiocepcion.capturado.total', { modulo: domain, tipo: record.tipo });
    this.metrics?.gauge?.('propiocepcion.buffer.size', buf.length);
  }

  _buildRecord(eventType, domain, data, env) {
    return {
      ts: env.timestamp || new Date().toISOString(),
      modulo: domain,
      // reflejo = ejecucion JS; consciente = lo produjo un turno LLM (modulo blueprint)
      tipo: this.blueprint.has(domain) ? 'consciente' : 'reflejo',
      evento: eventType,
      resumen: this._resumen(eventType, data),
      datos_clave: this._datosClave(data),
      correlation_id: data.correlation_id || env?.metadata?.correlation_id || null
    };
  }

  // Frase corta y humana de lo que paso. El LLM la lee como recuerdo, no como log.
  _resumen(eventType, d) {
    const nombre = d.nombre || d.receta_id || d.producto_id || d.id || '';
    switch (eventType) {
      case 'escandallo.coste.calculado':
        return `costeo ${d.receta_id || nombre} -> ${this._eur(d.coste_unidad)}/ud`;
      case 'escandallo.recalcular_siguiente.response':
        return d.terminado
          ? 'recalculo: todas las recetas costeadas'
          : `recalculo: costeo ${d.costeada?.nombre || '1'} (${this._eur(d.costeada?.coste_unidad)}), faltan ${d.faltan}`;
      case 'escandallo.recalcular_siguiente.failed':
      case 'escandallo.calcular.failed':
        return `escandallo fallo: ${d.error?.message || d.message || 'error'}`;
      case 'escandallo.calcular.response':
        return `costeo ${nombre} -> ${this._eur(d.coste_unidad ?? d.data?.coste_unidad)}/ud`;
      case 'recetas.creada':   return `creo receta "${nombre}"`;
      case 'recetas.actualizada': return `actualizo receta "${nombre}"`;
      case 'recetas.eliminada':   return `elimino receta "${nombre}"`;
      case 'catalogo.actualizado':
        return `catalogo actualizado (${(d.productos || []).length || d.total || '?'} productos)`;
      case 'producto.creado':     return `creo producto "${nombre}"`;
      case 'producto.actualizado': return `actualizo producto "${nombre}"`;
      default: {
        // Fallback generico honesto: el evento + lo que se reconozca.
        const tail = nombre ? ` (${nombre})` : '';
        return `${eventType}${tail}`;
      }
    }
  }

  _datosClave(d) {
    const out = {};
    for (const k of ['receta_id', 'producto_id', 'id', 'nombre', 'coste_unidad', 'coste_total', 'faltan', 'terminado', 'estado']) {
      if (d[k] !== undefined) out[k] = d[k];
    }
    if (d.costeada && typeof d.costeada === 'object') {
      out.costeada = { nombre: d.costeada.nombre, coste_unidad: d.costeada.coste_unidad };
    }
    return out;
  }

  _eur(v) {
    const n = Number(v);
    return Number.isFinite(n) ? `${n.toFixed(2)}€` : '¿?€';
  }

  // =============================================================
  // Persistencia (el reflejo se apoya en el reflejo fs)
  // =============================================================

  async _flushDirty() {
    if (this.dirty.size === 0) return;
    const proyectos = Array.from(this.dirty);
    this.dirty.clear();
    for (const projectId of proyectos) {
      try {
        const eventos = this.buffers.get(projectId) || [];
        const content = JSON.stringify({ _version: 1, _updated: new Date().toISOString(), eventos }, null, 0);
        // fs.write.request es fire-and-forget; el fs reflex escribe atomico.
        this.eventBus.publish('fs.write.request', {
          project_id: projectId, path: this.archivoPath, content,
          request_id: crypto.randomUUID()
        });
        this.metrics?.increment('propiocepcion.flush.total');
      } catch (err) {
        this.dirty.add(projectId); // reintentar en el proximo tick
        this.metrics?.increment('propiocepcion.errors.total', { kind: 'flush' });
      }
    }
    this.metrics?.gauge?.('propiocepcion.proyectos.activos', this.buffers.size);
  }

  // =============================================================
  // Bus API
  // =============================================================

  async onProjectActivated(event) {
    const data = event.data || event;
    const projectId = data.project_id;
    if (!projectId) return;
    if (this.buffers.has(projectId)) return; // ya cargado
    try {
      const request_id = crypto.randomUUID();
      const timeout = setTimeout(() => {
        this.pendingFsReads.delete(request_id);
        if (!this.buffers.has(projectId)) this.buffers.set(projectId, []);
      }, 8000);
      this.pendingFsReads.set(request_id, { project_id: projectId, timeout });
      this.eventBus.publish('fs.read.request', {
        project_id: projectId, path: this.archivoPath, request_id, encoding: 'utf-8'
      });
    } catch (err) {
      this.buffers.set(projectId, []);
    }
  }

  async onProjectDeactivated(event) {
    const data = event.data || event;
    const projectId = data.project_id;
    if (!projectId) return;
    if (this.dirty.has(projectId)) await this._flushDirty();
  }

  onFsReadResponse(event) {
    const payload = event.data || event;
    const { request_id } = payload;
    const pending = this.pendingFsReads.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingFsReads.delete(request_id);
    const projectId = pending.project_id;
    let eventos = [];
    if (payload.status === 200 && payload.content) {
      try {
        const parsed = JSON.parse(payload.content);
        if (Array.isArray(parsed.eventos)) eventos = parsed.eventos.slice(-this.bufferMax);
      } catch (_) { /* archivo corrupto -> arranca vacio */ }
    }
    // No pisar lo capturado en vivo mientras se leia: prepend lo de disco.
    const live = this.buffers.get(projectId) || [];
    const merged = eventos.concat(live).slice(-this.bufferMax);
    this.buffers.set(projectId, merged);
    this.logger.info('propiocepcion.restored', { project_id: projectId, eventos: merged.length });
  }

  // =============================================================
  // UI / Tool — el nervio leera de aqui
  // =============================================================

  async handleLeer(data) {
    try {
      const { project_id } = data || {};
      if (!project_id || typeof project_id !== 'string') {
        return this._errorResponse(400, 'INVALID_INPUT', 'project_id requerido (string)',
          { field: 'project_id', entity_type: 'project' });
      }
      const limite = Number(data.limite) > 0 ? Number(data.limite) : 30;
      let eventos = this.buffers.get(project_id) || [];
      if (data.desde_ts) eventos = eventos.filter(e => e.ts > data.desde_ts);
      const slice = eventos.slice(-limite);
      return {
        status: 200,
        data: { project_id, total: eventos.length, eventos: slice }
      };
    } catch (err) {
      return this._handleHandlerError('propiocepcion.leer.failed', err, 'leer');
    }
  }

  async handleHealthCheck() {
    let totalEventos = 0;
    for (const b of this.buffers.values()) totalEventos += b.length;
    return {
      status: 200,
      data: {
        module: this.name, version: this.version,
        proyectos: this.buffers.size, eventos_buffer: totalEventos,
        capturando: !!this._onBusMessage, scope: Array.from(this.scope)
      }
    };
  }

  // =============================================================
  // Privados
  // =============================================================

  _parseEnvelope(message) {
    if (!message) return null;
    if (typeof message === 'object' && !Buffer.isBuffer(message)) return message;
    try { return JSON.parse(Buffer.isBuffer(message) ? message.toString('utf-8') : String(message)); }
    catch (_) { return null; }
  }

  _eventTypeFromTopic(topic) {
    // core/<core>/events/a/b/c -> a.b.c
    const m = String(topic || '').match(/\/events\/(.+)$/);
    return m ? m[1].replace(/\//g, '.') : null;
  }
}

module.exports = PropiocepcionModule;

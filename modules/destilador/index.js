/**
 * destilador — el MINERO del lazo de aprendizaje (paso 1, solo reflejo).
 *
 * Hermano de propiocepcion: escucha el bus crudo (mqtt.on('message')) pero no
 * guarda QUE paso, sino que detecta CUANDO un PATRON DE RESOLUCION se repite.
 *
 * Como: agrupa los eventos del scope por correlation_id en "trazas" (la cadena
 * causal de una resolucion). Cierra la traza con un evento terminal o por
 * inactividad, la reduce a una FIRMA (la secuencia normalizada de dominio.op,
 * sin ids ni verbos request/response) y cuenta cuantas trazas DISTINTAS comparten
 * esa firma. Cuando una firma cruza el umbral de recurrencia, emite
 * 'aprendizaje.candidata.detectada' — la senal que (en el paso 2) disparara al
 * blueprint a redactar una skill.
 *
 * Paso 1 = SOLO la mineria. Sin blueprint, sin cola, sin escribir skills. El
 * objetivo es OBSERVAR las firmas que emergen (listar_clusters) y comprobar que
 * son patrones de verdad antes de cablear la redaccion automatica.
 *
 * Determinista de punta a punta: la firma sale de la secuencia, jamas de prosa.
 */

'use strict';

const crypto = require('crypto');
const BaseModule = require('../_shared/base-module');

class DestiladorModule extends BaseModule {
  constructor() {
    super();
    this.name = 'destilador';
    this.version = '0.1.0';

    // Inyectados en onLoad
    this.config = null;

    // Estado runtime
    this.trazas = new Map();      // groupKey -> { project_id, pasos:[], firstTs, lastTs }
    this.clusters = new Map();    // `${project}::${firma}` -> Cluster
    this.dirty = new Set();       // project_ids con clusters sin flushear
    this.pendingFsReads = new Map();
    this._onBusMessage = null;
    this._flushTimer = null;

    // Derivados de config (rellenos en onLoad)
    this.scope = new Set();
    this.umbral = 3;
    this.minPasos = 1;
    this.ventanaMs = 60000;       // traza inactiva > ventana -> se cierra
    this.maxTrazas = 500;
    this.archivoPath = '/_destilador/clusters.json';
  }

  // =============================================================
  // Lifecycle
  // =============================================================

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.metrics = context.metrics;
    this.config = context.moduleConfig || {};

    this.scope = new Set(this.config.scope_modulos || []);
    this.umbral = Number(this.config.umbral_recurrencia) || 3;
    this.minPasos = Number(this.config.min_pasos) || 1;
    this.ventanaMs = Number(this.config.ventana_traza_ms) || 60000;
    this.maxTrazas = Number(this.config.max_trazas_abiertas) || 500;
    this.archivoPath = this.config.archivo_path || '/_destilador/clusters.json';

    this._startBusCapture();

    const flushMs = Number(this.config.flush_interval_ms) || 10000;
    this._flushTimer = setInterval(() => this._tick(), flushMs);

    this.logger.info('destilador.loaded', {
      module: this.name, version: this.version,
      scope: this.scope.size, umbral: this.umbral, ventana_ms: this.ventanaMs
    });
  }

  async onUnload() {
    this._stopBusCapture();
    if (this._flushTimer) clearInterval(this._flushTimer);
    this._flushTimer = null;
    this._cerrarTrazasInactivas(0); // cierra todo lo abierto
    await this._flushDirty();
    for (const { timeout } of this.pendingFsReads.values()) clearTimeout(timeout);
    this.pendingFsReads.clear();
    this.trazas.clear();
    this.clusters.clear();
    this.dirty.clear();
    this.logger.info('destilador.unloaded', { module: this.name });
  }

  // =============================================================
  // Captura del bus (la mineria)
  // =============================================================

  _startBusCapture() {
    const mqtt = this.eventBus?.mqtt;
    if (!mqtt || typeof mqtt.on !== 'function') {
      this.logger.warn('destilador.bus.unavailable', { reason: 'eventBus.mqtt sin on()' });
      return;
    }
    this._onBusMessage = (topic, message) => {
      try { this._capturar(topic, message); }
      catch (_) { this.metrics?.increment('destilador.errors.total', { kind: 'capture' }); }
    };
    mqtt.on('message', this._onBusMessage);
    this.logger.info('destilador.bus.captured', {});
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
    if (!this.scope.has(domain)) return;            // solo el mundo del scope

    const data = env.data || {};
    const projectId = data.project_id || data.projectId || null;
    if (!projectId) return;                         // patrones por proyecto

    const correlationId = data.correlation_id || env?.metadata?.correlation_id || null;
    const eventId = env.event_id || crypto.randomUUID();
    // Con correlation_id: la traza acumula la cadena causal. Sin el: evento
    // suelto -> traza de 1 paso con clave propia (igual cuenta para su firma).
    const groupKey = correlationId ? `corr:${correlationId}` : `solo:${eventId}`;
    const norm = this._normalizarEvento(eventType);

    let traza = this.trazas.get(groupKey);
    if (!traza) {
      traza = { project_id: projectId, pasos: [], firstTs: Date.now(), lastTs: Date.now() };
      this.trazas.set(groupKey, traza);
      if (this.trazas.size > this.maxTrazas) this._evictTrazaMasVieja();
    }
    // dedup de pasos consecutivos identicos (ruido de re-emisiones)
    if (traza.pasos[traza.pasos.length - 1] !== norm) traza.pasos.push(norm);
    traza.lastTs = Date.now();

    this.metrics?.increment('destilador.capturado.total', { modulo: domain });
    // La traza la cierra la INACTIVIDAD (la ventana en _tick), no el sufijo del
    // evento: un .response intermedio (una lectura RPC) no es fin de resolucion.
  }

  // dominio.op.response -> dominio.op  (quita verbo de transporte + minuscula)
  _normalizarEvento(eventType) {
    const sinVerbo = String(eventType)
      .replace(/\.(request|response|failed|completado|resuelto)$/i, '');
    return sinVerbo.toLowerCase();
  }

  _tick() {
    this._cerrarTrazasInactivas(this.ventanaMs);
    this._flushDirty();
  }

  _cerrarTrazasInactivas(ventanaMs) {
    const ahora = Date.now();
    for (const [groupKey, t] of this.trazas) {
      if (ahora - t.lastTs >= ventanaMs) this._cerrarTraza(groupKey);
    }
  }

  _evictTrazaMasVieja() {
    let viejaKey = null; let viejaTs = Infinity;
    for (const [k, t] of this.trazas) {
      if (t.firstTs < viejaTs) { viejaTs = t.firstTs; viejaKey = k; }
    }
    if (viejaKey) this._cerrarTraza(viejaKey); // cerrarla cuenta, no se pierde
  }

  // Cierra una traza: la reduce a firma y la suma a su cluster.
  _cerrarTraza(groupKey) {
    const traza = this.trazas.get(groupKey);
    if (!traza) return;
    this.trazas.delete(groupKey);
    if (traza.pasos.length < this.minPasos) return; // demasiado corta para ser patron

    const firma = this._firmar(traza.pasos);
    const clusterKey = `${traza.project_id}::${firma}`;
    let cluster = this.clusters.get(clusterKey);
    if (!cluster) {
      cluster = {
        firma, project_id: traza.project_id, secuencia: traza.pasos.slice(),
        ocurrencias: 0, grupos: [], primera_ts: new Date().toISOString(),
        ultima_ts: null, emitida: false
      };
      this.clusters.set(clusterKey, cluster);
    }
    cluster.ocurrencias++;
    cluster.ultima_ts = new Date().toISOString();
    if (cluster.grupos.length < 20) cluster.grupos.push(groupKey);
    this.dirty.add(traza.project_id);

    this.metrics?.increment('destilador.traza.cerrada.total', { pasos: traza.pasos.length });

    if (!cluster.emitida && cluster.ocurrencias >= this.umbral) {
      cluster.emitida = true;
      this._emitirCandidata(cluster);
    }
  }

  _firmar(pasos) {
    const repr = JSON.stringify(pasos);
    return crypto.createHash('sha1').update(repr).digest('hex').slice(0, 16);
  }

  _emitirCandidata(cluster) {
    try {
      this.eventBus.publish('aprendizaje.candidata.detectada', {
        firma: cluster.firma,
        project_id: cluster.project_id,
        secuencia: cluster.secuencia,
        ocurrencias: cluster.ocurrencias,
        grupos: cluster.grupos.slice(),
        correlation_id: crypto.randomUUID(),
        timestamp: new Date().toISOString()
      });
      this.metrics?.increment('destilador.candidata.detectada.total');
      this.logger.info('destilador.candidata.detectada', {
        firma: cluster.firma, project_id: cluster.project_id,
        ocurrencias: cluster.ocurrencias, secuencia: cluster.secuencia
      });
    } catch (err) {
      this.metrics?.increment('destilador.errors.total', { kind: 'emit' });
      this.logger.error('destilador.candidata.emit.failed', { error: err.message });
    }
  }

  // =============================================================
  // Persistencia (se apoya en el reflejo fs, como propiocepcion)
  // =============================================================

  async _flushDirty() {
    if (this.dirty.size === 0) return;
    const proyectos = Array.from(this.dirty);
    this.dirty.clear();
    for (const projectId of proyectos) {
      try {
        const clusters = this._clustersDeProyecto(projectId);
        const content = JSON.stringify(
          { _version: 1, _updated: new Date().toISOString(), clusters }, null, 0);
        this.eventBus.publish('fs.write.request', {
          project_id: projectId, path: this.archivoPath, content,
          request_id: crypto.randomUUID()
        });
        this.metrics?.increment('destilador.flush.total');
      } catch (_) {
        this.dirty.add(projectId);
        this.metrics?.increment('destilador.errors.total', { kind: 'flush' });
      }
    }
  }

  _clustersDeProyecto(projectId) {
    const out = [];
    for (const c of this.clusters.values()) {
      if (c.project_id === projectId) out.push(c);
    }
    return out;
  }

  async onProjectActivated(event) {
    const data = event.data || event;
    const projectId = data.project_id;
    if (!projectId) return;
    // si ya tenemos clusters de este proyecto en memoria, no recargamos
    for (const c of this.clusters.values()) if (c.project_id === projectId) return;
    try {
      const request_id = crypto.randomUUID();
      const timeout = setTimeout(() => this.pendingFsReads.delete(request_id), 8000);
      this.pendingFsReads.set(request_id, { project_id: projectId, timeout });
      this.eventBus.publish('fs.read.request', {
        project_id: projectId, path: this.archivoPath, request_id, encoding: 'utf-8'
      });
    } catch (_) { /* arranca vacio */ }
  }

  onFsReadResponse(event) {
    const payload = event.data || event;
    const pending = this.pendingFsReads.get(payload.request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingFsReads.delete(payload.request_id);
    if (payload.status !== 200 || !payload.content) return;
    try {
      const parsed = JSON.parse(payload.content);
      for (const c of parsed.clusters || []) {
        const key = `${c.project_id}::${c.firma}`;
        if (!this.clusters.has(key)) this.clusters.set(key, c);
      }
      this.logger.info('destilador.restored', {
        project_id: pending.project_id, clusters: (parsed.clusters || []).length
      });
    } catch (_) { /* corrupto -> ignora */ }
  }

  // =============================================================
  // UI / inspeccion — el ojo humano del paso 1
  // =============================================================

  async handleListarClusters(data) {
    try {
      const { project_id } = data || {};
      if (!project_id || typeof project_id !== 'string') {
        return this._errorResponse(400, 'INVALID_INPUT', 'project_id requerido (string)',
          { field: 'project_id', entity_type: 'project' });
      }
      const minOcurrencias = Number(data.min_ocurrencias) > 0 ? Number(data.min_ocurrencias) : 1;
      const clusters = this._clustersDeProyecto(project_id)
        .filter(c => c.ocurrencias >= minOcurrencias)
        .sort((a, b) => b.ocurrencias - a.ocurrencias)
        .map(c => ({
          firma: c.firma, secuencia: c.secuencia, ocurrencias: c.ocurrencias,
          emitida: c.emitida, primera_ts: c.primera_ts, ultima_ts: c.ultima_ts
        }));
      return { status: 200, data: { project_id, total: clusters.length, clusters } };
    } catch (err) {
      return this._handleHandlerError('destilador.listar_clusters.failed', err, 'listar_clusters');
    }
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        module: this.name, version: this.version,
        capturando: !!this._onBusMessage,
        trazas_abiertas: this.trazas.size,
        clusters: this.clusters.size,
        umbral: this.umbral, scope: Array.from(this.scope)
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
    const m = String(topic || '').match(/\/events\/(.+)$/);
    return m ? m[1].replace(/\//g, '.') : null;
  }
}

module.exports = DestiladorModule;

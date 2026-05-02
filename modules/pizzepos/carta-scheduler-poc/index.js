'use strict';

const path     = require('path');
const crypto   = require('crypto');
const ProjectStorage   = require('./project-storage');
const PendientesTimer  = require('./pendientes-timer');

/**
 * carta-scheduler POC v2.0.0 — Programacion de cambios de carta multi-tenant.
 *
 * Aplica los 8 contratos arquitectonicos:
 *  - events:        publishes/subscribes declarados, _publicarEvento canonico,
 *                   mqttRequest a scheduler/tarifas (NO acceso directo via moduleLoader).
 *  - lifecycle:     onLoad inicializa, onUnload limpia timers + maps + storage refs.
 *  - observability: log + metric en cada operacion via _emitMetric (API canonica).
 *  - errors:        _buildErrorResponse / _buildSuccessResponse (shape canonico).
 *  - persistence:   ProjectStorage (json-file-per-project con write atomico).
 *  - http:          NO expone HTTP server (apis: []). Solo bus.
 *  - naming:        language=es, tools con prefix carta-scheduler.* (drift cerrado).
 *  - glossary:      terminos cross-modulo (project_id, regla, pendiente, cambio, canal, carta).
 */
class CartaSchedulerModule {
  constructor() {
    this.name    = 'carta-scheduler';
    this.version = '2.0.0';

    // Inyectados en onLoad
    this.eventBus    = null;
    this.logger      = null;
    this.metrics     = null;
    this.config      = null;
    this.mqttRequest = null;

    // Multi-tenant state in-memory
    this.reglasPerProject     = new Map();   // project_id → Map<regla_id, regla>
    this.pendientesPerProject = new Map();   // project_id → Map<pendiente_id, pendiente>

    // Helpers
    this.storage = null;
    this.timer   = null;
  }

  // ----------------------------------------------------------------- lifecycle

  async onLoad(context) {
    this.eventBus    = context.eventBus;
    this.logger      = context.logger;
    this.metrics     = context.metrics || null;
    this.config      = context.moduleConfig || context.config || {};
    this.mqttRequest = context.mqttRequest || null;

    if (!this.mqttRequest) {
      this.logger.error(`${this.name}.load.failed`, { reason: 'mqttRequest_not_provided' });
      throw new Error('carta-scheduler-poc: context.mqttRequest is required (cross-module dependencies via bus)');
    }

    const persistenceCfg = this.config.persistence || {};
    if (persistenceCfg.pattern !== 'json-file-per-project') {
      throw new Error(`carta-scheduler-poc: config.persistence.pattern must be 'json-file-per-project' (got '${persistenceCfg.pattern}')`);
    }

    // Storage — subdir derivado del template (POC: usa el sufijo despues del placeholder)
    const subdir = (persistenceCfg.data_path_template || '<project.base_path>/storage/pizzepos/config')
      .replace(/^<project\.base_path>\/?/, '');
    this.storage = new ProjectStorage({
      logger:     this.logger,
      metrics:    this.metrics,
      moduleName: this.name,
      subdir
    });

    // Timer de cleanup vencidos
    this.timer = new PendientesTimer({
      intervalMs: this.config.cleanup_interval_ms || 3600000,
      callback:   () => this._limpiarPendientesVencidos(),
      logger:     this.logger,
      metrics:    this.metrics,
      moduleName: this.name
    });
    this.timer.start();

    this.logger.info(`${this.name}.loaded`, {
      version:               this.version,
      cleanup_interval_ms:   this.config.cleanup_interval_ms,
      ventana_confirmacion_ms: this.config.ventana_confirmacion_ms
    });
    this._emitMetric(`${this.name}.lifecycle.loaded`, 1, {});
  }

  async onUnload() {
    if (this.timer) this.timer.stop();
    this.reglasPerProject.clear();
    this.pendientesPerProject.clear();
    if (this.logger) this.logger.info(`${this.name}.unloaded`, {});
    this._emitMetric(`${this.name}.lifecycle.unloaded`, 1, {});
  }

  // ----------------------------------------------------------------- handlers (subscribes)

  async onProjectActivated(payload) {
    const { project_id, base_path, metadata } = payload || {};
    if (!project_id) {
      this.logger.warn(`${this.name}.project.activated.invalid`, { reason: 'no_project_id' });
      return;
    }

    const resolvedBase = (metadata?.is_system === true) ? process.cwd() : base_path;
    if (!resolvedBase) {
      this.logger.warn(`${this.name}.project.activated.no_base_path`, { project_id });
      return;
    }

    this.storage.register(project_id, resolvedBase);

    // Cargar reglas y pendientes desde disco (graceful — ENOENT acepta vacio)
    const reglasResp     = await this.storage.readJson(project_id, 'carta-scheduler-reglas.json',     []);
    const pendientesResp = await this.storage.readJson(project_id, 'carta-scheduler-pendientes.json', []);

    const reglasMap = new Map();
    for (const r of reglasResp.data) reglasMap.set(r.id, r);
    this.reglasPerProject.set(project_id, reglasMap);

    const pendientesMap = new Map();
    for (const p of pendientesResp.data) pendientesMap.set(p.id, p);
    this.pendientesPerProject.set(project_id, pendientesMap);

    // Registrar jobs activos en scheduler (via mqttRequest, NO acceso directo)
    let registered = 0;
    for (const regla of reglasMap.values()) {
      if (!regla.activa) continue;
      const reg = await this._registrarJobEnScheduler(project_id, regla);
      if (reg.ok) registered++;
    }

    this.logger.info(`${this.name}.project.activated`, {
      project_id, reglas: reglasMap.size, pendientes: pendientesMap.size, jobs_registered: registered
    });
    this._emitMetric(`${this.name}.project.activated`, 1, {});
  }

  async onProjectDeactivated(payload) {
    const { project_id } = payload || {};
    if (!project_id) return;
    this.storage.unregister(project_id);
    this.reglasPerProject.delete(project_id);
    this.pendientesPerProject.delete(project_id);
    this.logger.info(`${this.name}.project.deactivated`, { project_id });
  }

  async onSchedulerJobTriggered(payload) {
    const job = payload?.job;
    if (!job?.name?.startsWith(`${this.name}:`)) return;  // Job de otro modulo, ignorar

    const reglaId   = job.metadata?.regla_id;
    const projectId = job.project_id;
    if (!reglaId || !projectId) {
      this.logger.warn(`${this.name}.job.triggered.invalid`, { reason: 'missing_regla_or_project', job_name: job.name });
      return;
    }

    const regla = this._getReglas(projectId).get(reglaId);
    if (!regla || !regla.activa) {
      this.logger.info(`${this.name}.job.triggered.skipped`, { regla_id: reglaId, project_id: projectId, reason: regla ? 'inactiva' : 'no_existe' });
      return;
    }

    this.logger.info(`${this.name}.regla.triggered`, { regla_id: reglaId, project_id: projectId });
    this._emitMetric(`${this.name}.regla.triggered`, 1, { project_id: projectId });

    // Crear pendiente esperando confirmacion
    const ventanaMs = this.config.ventana_confirmacion_ms || 86400000;
    const pendiente = {
      id:         `pend_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`,
      regla_id:   reglaId,
      project_id: projectId,
      cambios:    regla.cambios,
      estado:     'esperando_confirmacion',
      creado_at:  new Date().toISOString(),
      expira_at:  new Date(Date.now() + ventanaMs).toISOString()
    };

    this._getPendientes(projectId).set(pendiente.id, pendiente);
    await this._savePendientes(projectId);

    // Notificar al agente dispatcher (fire-and-forget, propaga correlation_id)
    await this._publicarEvento('agent.execute.request', {
      agentName: 'scheduler-dispatcher',
      context:   { project_id: projectId, pendiente_id: pendiente.id, regla, cambios: regla.cambios },
      task:      `Cambio de carta programado listo. Avisa al usuario y pide confirmacion. Regla: "${regla.descripcion}". Cambios: ${JSON.stringify(regla.cambios)}.`
    }, payload);
  }

  // ----------------------------------------------------------------- tools

  async toolCrearRegla({ project_id, regla }, sourcePayload = null) {
    const v = this._validate({ project_id, regla }, ['project_id', 'regla']);
    if (!v.ok) return this._buildErrorResponse({ status: 400, code: 'VALIDATION_FAILED', message: v.message, details: { kind: 'domain', field: v.field } });

    const reglas = this._getReglas(project_id);
    const id = regla.id || `regla_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`;
    const nueva = {
      id,
      descripcion: regla.descripcion || '',
      cambios:     regla.cambios     || [],
      trigger:     regla.trigger,
      activa:      regla.activa !== false,
      created_at:  new Date().toISOString(),
      updated_at:  new Date().toISOString()
    };
    reglas.set(id, nueva);
    const w = await this._saveReglas(project_id);
    if (!w.ok) return this._buildErrorResponse({ status: w.error.status, code: w.error.code, message: w.error.message, details: w.error.details });

    if (nueva.activa) {
      const reg = await this._registrarJobEnScheduler(project_id, nueva);
      if (!reg.ok) {
        this.logger.warn(`${this.name}.regla.creada.scheduler_failed`, {
          regla_id: id, project_id, code: reg.error.code
        });
      }
    }

    await this._publicarEvento(`${this.name}.regla.creada`, { project_id, regla: nueva }, sourcePayload);
    return this._buildSuccessResponse({ status: 201, data: { regla: nueva, message: `Regla "${id}" creada y ${nueva.activa ? 'activada' : 'inactiva'}.` } });
  }

  async toolListarReglas({ project_id }) {
    const v = this._validate({ project_id }, ['project_id']);
    if (!v.ok) return this._buildErrorResponse({ status: 400, code: 'VALIDATION_FAILED', message: v.message, details: { kind: 'domain', field: v.field } });
    const reglas = Array.from(this._getReglas(project_id).values());
    return this._buildSuccessResponse({ status: 200, data: { reglas, total: reglas.length } });
  }

  async toolEliminarRegla({ project_id, regla_id }, sourcePayload = null) {
    const v = this._validate({ project_id, regla_id }, ['project_id', 'regla_id']);
    if (!v.ok) return this._buildErrorResponse({ status: 400, code: 'VALIDATION_FAILED', message: v.message, details: { kind: 'domain', field: v.field } });

    const reglas = this._getReglas(project_id);
    if (!reglas.has(regla_id)) {
      return this._buildErrorResponse({
        status: 404, code: 'RESOURCE_NOT_FOUND',
        message: `Regla "${regla_id}" no encontrada en proyecto "${project_id}"`,
        details: { kind: 'domain', entity_type: 'regla', entity_id: regla_id }
      });
    }
    reglas.delete(regla_id);
    const w = await this._saveReglas(project_id);
    if (!w.ok) return this._buildErrorResponse({ status: w.error.status, code: w.error.code, message: w.error.message, details: w.error.details });

    // Eliminar job del scheduler externo (best-effort, no bloquea)
    await this._eliminarJobEnScheduler(project_id, regla_id);

    await this._publicarEvento(`${this.name}.regla.eliminada`, { project_id, regla_id }, sourcePayload);
    return this._buildSuccessResponse({ status: 200, data: { regla_id, message: `Regla "${regla_id}" eliminada.` } });
  }

  async toolDetectarConflictos({ project_id, nueva_regla }) {
    const v = this._validate({ project_id, nueva_regla }, ['project_id', 'nueva_regla']);
    if (!v.ok) return this._buildErrorResponse({ status: 400, code: 'VALIDATION_FAILED', message: v.message, details: { kind: 'domain', field: v.field } });

    const reglas = Array.from(this._getReglas(project_id).values()).filter(r => r.activa);
    const conflictos = [];
    for (const canal of (nueva_regla.cambios || []).map(c => c.canal)) {
      const otras = reglas.filter(r => r.cambios.some(c => c.canal === canal));
      if (otras.length > 0) {
        conflictos.push({
          canal,
          reglas_existentes: otras.map(r => ({ id: r.id, descripcion: r.descripcion, trigger: r.trigger }))
        });
      }
    }
    return this._buildSuccessResponse({
      status: 200,
      data: {
        hay_conflicto: conflictos.length > 0,
        conflictos,
        message: conflictos.length > 0
          ? `Atencion: ${conflictos.length} canal(es) ya tienen reglas activas. Revisar antes de guardar.`
          : 'Sin conflictos detectados.'
      }
    });
  }

  async toolProximosCambios({ project_id }) {
    const v = this._validate({ project_id }, ['project_id']);
    if (!v.ok) return this._buildErrorResponse({ status: 400, code: 'VALIDATION_FAILED', message: v.message, details: { kind: 'domain', field: v.field } });
    const pendientes = Array.from(this._getPendientes(project_id).values())
      .filter(p => p.estado === 'esperando_confirmacion')
      .sort((a, b) => new Date(a.creado_at) - new Date(b.creado_at));
    return this._buildSuccessResponse({ status: 200, data: { pendientes, total: pendientes.length } });
  }

  async toolConfirmar({ project_id, pendiente_id }, sourcePayload = null) {
    const v = this._validate({ project_id, pendiente_id }, ['project_id', 'pendiente_id']);
    if (!v.ok) return this._buildErrorResponse({ status: 400, code: 'VALIDATION_FAILED', message: v.message, details: { kind: 'domain', field: v.field } });

    const pendiente = this._getPendientes(project_id).get(pendiente_id);
    if (!pendiente) {
      return this._buildErrorResponse({
        status: 404, code: 'RESOURCE_NOT_FOUND',
        message: `Pendiente "${pendiente_id}" no encontrado`,
        details: { kind: 'domain', entity_type: 'pendiente', entity_id: pendiente_id }
      });
    }
    if (pendiente.estado !== 'esperando_confirmacion') {
      return this._buildErrorResponse({
        status: 409, code: 'CONFLICT',
        message: `Pendiente en estado "${pendiente.estado}", no se puede confirmar`,
        details: { kind: 'domain', entity_type: 'pendiente', entity_id: pendiente_id, estado_actual: pendiente.estado }
      });
    }

    // Aplicar cambios via mqttRequest a tarifas (event-core: cross-modulo via bus)
    const aplicados = [];
    const fallidos  = [];
    for (const cambio of pendiente.cambios) {
      const resp = await this._mqttRequestSafe('tarifas', 'assign', {
        canal: cambio.canal, carta_id: cambio.carta_id, project_id
      });
      if (resp.ok && resp.data?.status === 200) {
        aplicados.push(cambio);
      } else {
        fallidos.push({ cambio, error_code: resp.error?.code || resp.data?.error?.code || 'UNKNOWN_ERROR' });
      }
    }

    pendiente.estado     = fallidos.length > 0 ? 'aplicado_con_errores' : 'aplicado';
    pendiente.aplicado_at = new Date().toISOString();
    pendiente.aplicados  = aplicados;
    pendiente.fallidos   = fallidos;
    const w = await this._savePendientes(project_id);
    if (!w.ok) {
      this.logger.warn(`${this.name}.pendiente.save_failed_after_apply`, {
        project_id, pendiente_id, code: w.error.code
      });
    }

    this._emitMetric(`${this.name}.pendiente.aplicado`, 1, { project_id });
    await this._publicarEvento(`${this.name}.cambio.aplicado`, {
      project_id, pendiente_id, aplicados: aplicados.length, fallidos: fallidos.length
    }, sourcePayload);

    return this._buildSuccessResponse({
      status: 200,
      data: {
        pendiente_id, aplicados: aplicados.length, fallidos: fallidos.length, detalle: { aplicados, fallidos },
        message: fallidos.length > 0
          ? `Cambios aplicados parcialmente (${aplicados.length} OK, ${fallidos.length} fallidos).`
          : `Cambios aplicados correctamente (${aplicados.length}).`
      }
    });
  }

  async toolRechazar({ project_id, pendiente_id, razon }, sourcePayload = null) {
    const v = this._validate({ project_id, pendiente_id }, ['project_id', 'pendiente_id']);
    if (!v.ok) return this._buildErrorResponse({ status: 400, code: 'VALIDATION_FAILED', message: v.message, details: { kind: 'domain', field: v.field } });

    const pendiente = this._getPendientes(project_id).get(pendiente_id);
    if (!pendiente) {
      return this._buildErrorResponse({
        status: 404, code: 'RESOURCE_NOT_FOUND',
        message: `Pendiente "${pendiente_id}" no encontrado`,
        details: { kind: 'domain', entity_type: 'pendiente', entity_id: pendiente_id }
      });
    }
    pendiente.estado       = 'rechazado';
    pendiente.rechazado_at = new Date().toISOString();
    pendiente.razon        = razon || null;
    const w = await this._savePendientes(project_id);
    if (!w.ok) return this._buildErrorResponse({ status: w.error.status, code: w.error.code, message: w.error.message, details: w.error.details });

    this._emitMetric(`${this.name}.pendiente.rechazado`, 1, { project_id });
    await this._publicarEvento(`${this.name}.cambio.rechazado`, { project_id, pendiente_id, razon: razon || null }, sourcePayload);
    return this._buildSuccessResponse({ status: 200, data: { pendiente_id, message: 'Cambio rechazado.' } });
  }

  // ----------------------------------------------------------------- ui_handlers

  async handleListarReglas(data) {
    const r = await this.toolListarReglas({ project_id: data?.project_id });
    return r.status === 200 ? r.data : r;
  }

  async handleProximosCambios(data) {
    const r = await this.toolProximosCambios({ project_id: data?.project_id });
    return r.status === 200 ? r.data : r;
  }

  async handleHealth() {
    let totalReglas = 0, totalPendientes = 0;
    for (const r of this.reglasPerProject.values())     totalReglas     += r.size;
    for (const p of this.pendientesPerProject.values()) totalPendientes += p.size;
    return {
      status:           'healthy',
      module:           this.name,
      version:          this.version,
      reglas:           totalReglas,
      pendientes:       totalPendientes,
      timer_running:    this.timer?.isRunning() || false,
      timer_ticks:      this.timer?.ticks()     || 0
    };
  }

  // ----------------------------------------------------------------- helpers (canonicos)

  _buildErrorResponse({ status, code, message, details }) {
    return { status, error: { code, message, details: details || {} } };
  }

  _buildSuccessResponse({ status, data }) {
    return { status: status || 200, data };
  }

  async _publicarEvento(eventName, payload, sourcePayload = null) {
    const correlation_id = sourcePayload?.correlation_id || payload?.correlation_id || null;
    const outPayload = {
      ...(correlation_id ? { correlation_id } : {}),
      ...payload,
      timestamp: payload.timestamp || new Date().toISOString()
    };
    try {
      await this.eventBus.publish(eventName, outPayload);
      this.logger.info(`${this.name}.event.published`, { event: eventName, correlation_id });
    } catch (err) {
      this.logger.error(`${this.name}.event.publish.failed`, {
        event: eventName, error_message: err.message, correlation_id
      });
      this._emitMetric(`${this.name}.event.errors`, 1, { event: eventName });
    }
  }

  /**
   * Wrapper canonico de mqttRequest: timeout, telemetria, mapeo de errores.
   * Devuelve shape interno { ok, data | error } — el caller traduce al canonico.
   */
  async _mqttRequestSafe(domain, action, payload) {
    const timeoutMs = this.config.mqtt_request_timeout_ms || 5000;
    const t0 = Date.now();
    try {
      const data = await this.mqttRequest(domain, action, payload, { timeout_ms: timeoutMs });
      const dur = Date.now() - t0;
      this._timing(`${this.name}.mqttRequest.duration`, dur, { domain, action, status: 'ok' });
      return { ok: true, data };
    } catch (err) {
      const dur = Date.now() - t0;
      const isTimeout = /timeout/i.test(err.message);
      const code   = isTimeout ? 'UPSTREAM_TIMEOUT' : 'DEPENDENCY_UNAVAILABLE';
      const status = isTimeout ? 504 : 503;
      this.logger.warn(`${this.name}.mqttRequest.failed`, {
        domain, action, dur_ms: dur, error_message: err.message, code
      });
      this._timing(`${this.name}.mqttRequest.duration`, dur, { domain, action, status: 'error' });
      this._emitMetric(`${this.name}.mqttRequest.errors`, 1, { domain, action, code });
      return {
        ok: false,
        error: { code, status, message: `mqttRequest ${domain}.${action} failed: ${err.message}`, details: { kind: 'infrastructure', retryable: isTimeout, domain, action } }
      };
    }
  }

  async _registrarJobEnScheduler(projectId, regla) {
    return this._mqttRequestSafe('scheduler', 'addJob', {
      name:        `${this.name}:${regla.id}`,
      description: regla.descripcion || `Cambio de carta programado (${regla.id})`,
      project_id:  projectId,
      trigger:     regla.trigger,
      action:      { type: 'event', event: 'carta-scheduler.regla.triggered', payload: { regla_id: regla.id, project_id: projectId } },
      metadata:    { managedBy: this.name, regla_id: regla.id }
    });
  }

  async _eliminarJobEnScheduler(projectId, reglaId) {
    return this._mqttRequestSafe('scheduler', 'deleteJob', {
      name:       `${this.name}:${reglaId}`,
      project_id: projectId
    });
  }

  async _saveReglas(projectId) {
    const arr = Array.from(this._getReglas(projectId).values());
    return this.storage.writeJson(projectId, 'carta-scheduler-reglas.json', arr);
  }

  async _savePendientes(projectId) {
    const arr = Array.from(this._getPendientes(projectId).values());
    return this.storage.writeJson(projectId, 'carta-scheduler-pendientes.json', arr);
  }

  async _limpiarPendientesVencidos() {
    const now = Date.now();
    let totalLimpiados = 0;
    for (const [projectId, pendientes] of this.pendientesPerProject) {
      let limpiados = 0;
      for (const pendiente of pendientes.values()) {
        if (pendiente.estado === 'esperando_confirmacion' && new Date(pendiente.expira_at).getTime() < now) {
          pendiente.estado    = 'vencido';
          pendiente.cerrado_at = new Date().toISOString();
          limpiados++;
        }
      }
      if (limpiados > 0) {
        await this._savePendientes(projectId);
        await this._publicarEvento(`${this.name}.cambio.vencido`, { project_id: projectId, count: limpiados });
        this.logger.info(`${this.name}.pendientes.vencidos`, { project_id: projectId, count: limpiados });
        this._emitMetric(`${this.name}.pendiente.vencido`, limpiados, { project_id: projectId });
        totalLimpiados += limpiados;
      }
    }
    return totalLimpiados;
  }

  _getReglas(projectId) {
    if (!this.reglasPerProject.has(projectId)) this.reglasPerProject.set(projectId, new Map());
    return this.reglasPerProject.get(projectId);
  }

  _getPendientes(projectId) {
    if (!this.pendientesPerProject.has(projectId)) this.pendientesPerProject.set(projectId, new Map());
    return this.pendientesPerProject.get(projectId);
  }

  _validate(payload, requiredFields) {
    if (!payload || typeof payload !== 'object') return { ok: false, message: 'payload missing or invalid', field: 'payload' };
    for (const f of requiredFields) {
      if (payload[f] === undefined || payload[f] === null) return { ok: false, message: `${f} is required`, field: f };
    }
    return { ok: true };
  }

  _emitMetric(name, value, labels) {
    if (!this.metrics) return;
    if (/\.duration$/.test(name))   { this.metrics.timing(name, value, labels);    return; }
    if (/\.count$/.test(name))      { this.metrics.gauge(name, value, labels);     return; }
    this.metrics.increment(name, value || 1, labels);
  }

  _timing(name, value, labels) {
    if (this.metrics?.timing) this.metrics.timing(name, value, labels);
  }
}

module.exports = CartaSchedulerModule;

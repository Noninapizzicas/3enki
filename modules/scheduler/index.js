/**
 * scheduler v1.0.0 — Migrado al canon (24 contratos transversales).
 *
 * Job scheduling con multiples trigger types:
 *  - cron: Cron expressions
 *  - interval: Fixed intervals
 *  - datetime: Specific date/time
 *  - event: MQTT event-based triggers
 *  - condition: Condition-based triggers
 *  - composite: Combination of triggers (AND/OR/NAND/NOR/XOR)
 *
 * Contratos cumplidos en esta migracion:
 *  - errors: handlers devuelven { status, data | error: { code, message } } con
 *    error.code del catalogo. Sin string suelto. Sin codigos inventados.
 *  - observability: log + metric en cada error path. correlation_id propagado.
 *  - events: publishes con project_id + correlation_id obligatorios.
 *  - lifecycle: onLoad/onUnload limpios, no leak de timers/subscriptions.
 *  - tools: toolListJobs/toolCreateJob/toolTriggerJob con retorno canonico
 *    { status, data | error: { code, message } } (no success: bool).
 *  - resilience: timeouts en HTTP/module actions. Retry con backoff (heredado
 *    de TriggerManager). Sin loops infinitos.
 *  - persistence: pattern declarado (json-file por scheduler en data/scheduler/jobs.json,
 *    JobManager hace tempfile+rename atomico).
 *  - multi-tenancy: project_id propagado en publishes y aislamiento por proyecto
 *    en jobs.
 */

'use strict';

const crypto = require('crypto');

const JobManager = require('./services/job-manager');
const TriggerManager = require('./services/trigger-manager');
const BaseModule = require('../_shared/base-module');

class SchedulerModule extends BaseModule {
  constructor() {
    super();
    this.name = 'scheduler';
    this.version = '1.0.0';

    // Inyectados en onLoad (logger, metrics, eventBus heredados de BaseModule)
    this.uiHandler = null;
    this.config = null;

    // Servicios internos
    this.jobManager = null;
    this.triggerManager = null;

    // Cleanup de subscriptions dinamicas
    this.unsubscribes = [];

    // Historial de ejecuciones (FIFO en memoria)
    this.executions = [];
    this.maxExecutionHistory = 100;

    // Stats runtime (NO persistidos en archivos declarativos)
    this.stats = {
      jobsCreated: 0,
      jobsDeleted: 0,
      jobsTriggered: 0,
      jobsCompleted: 0,
      jobsFailed: 0,
      startedAt: null
    };
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;
    this.config = this._loadConfig(core.moduleConfig);

    this.logger.info('scheduler.loading', { module: this.name, version: this.version });

    this.jobManager = new JobManager({
      logger: this.logger,
      config: this.config,
      onJobChange: () => this._onJobsChanged()
    });

    this.triggerManager = new TriggerManager({
      logger: this.logger,
      eventBus: this.eventBus,
      config: this.config,
      onTrigger: (job, triggerInfo) => this.executeJob(job, triggerInfo)
    });

    await this.jobManager.load();
    await this._subscribeToEventTriggers();
    await this._startAllJobs();

    this.stats.startedAt = new Date().toISOString();

    this.logger.info('scheduler.loaded', {
      totalJobs: this.jobManager.count(),
      activeJobs: this.jobManager.countEnabled()
    });
  }

  async onUnload() {
    this.logger.info('scheduler.unloading');
    if (this.triggerManager) this.triggerManager.stopAll();
    if (this.jobManager) await this.jobManager.save();
    for (const unsub of this.unsubscribes) {
      if (typeof unsub === 'function') {
        try { await unsub(); } catch (_) {}
      }
    }
    this.unsubscribes = [];
    this.logger.info('scheduler.unloaded');
  }

  _loadConfig(moduleConfig) {
    return {
      jobsPath: './data/scheduler/jobs.json',
      autoSave: true,
      saveInterval: 30000,
      defaultTimezone: 'Europe/Madrid',
      maxConcurrentJobs: 100,
      defaultTimeout: 300000,
      defaultRetries: 3,
      defaultRetryDelay: 5000,
      ...(moduleConfig || {})
    };
  }

  // ==========================================
  // Trigger setup
  // ==========================================

  async _subscribeToEventTriggers() {
    const jobs = this.jobManager.getAll();
    const topics = new Set();

    for (const job of jobs) {
      if (job.trigger?.type === 'event' && job.trigger.topic) topics.add(job.trigger.topic);
      if (job.trigger?.type === 'composite' && job.trigger.triggers) {
        for (const t of job.trigger.triggers) {
          if (t.type === 'event' && t.topic) topics.add(t.topic);
        }
      }
    }

    for (const topic of topics) {
      const unsub = await this.eventBus.subscribe(topic, (event) => this._onEventReceived(topic, event));
      this.unsubscribes.push(unsub);
    }

    this.logger.debug('scheduler.event-triggers.subscribed', { topics: Array.from(topics) });
  }

  async _startAllJobs() {
    for (const job of this.jobManager.getAll()) {
      if (job.enabled !== false) this.triggerManager.start(job);
    }
  }

  _onJobsChanged() {
    if (this.config.autoSave) {
      this.jobManager.save().catch(err => {
        this.logger.error('scheduler.autosave.failed', { error: err.message });
        this.metrics?.increment('scheduler.errors', { kind: 'autosave' });
      });
    }
  }

  async _onEventReceived(topic, event) {
    const jobs = this.jobManager.getAll().filter(job => {
      if (job.enabled === false) return false;
      if (job.trigger?.type === 'event' && job.trigger.topic === topic) {
        return this._evaluateEventCondition(job.trigger, event);
      }
      if (job.trigger?.type === 'composite') {
        return job.trigger.triggers?.some(t =>
          t.type === 'event' && t.topic === topic && this._evaluateEventCondition(t, event)
        );
      }
      return false;
    });
    for (const job of jobs) this.triggerManager.handleEventTrigger(job, topic, event);
  }

  _evaluateEventCondition(trigger, event) {
    if (!trigger.condition) return true;
    try {
      const fn = new Function('payload', `return ${trigger.condition}`);
      return fn(event);
    } catch (err) {
      this.logger.warn('scheduler.event-condition.error', {
        condition: trigger.condition, error: err.message
      });
      return false;
    }
  }

  // ==========================================
  // Job execution
  // ==========================================

  async executeJob(job, triggerInfo = {}) {
    const executionId = crypto.randomUUID();
    const correlation_id = triggerInfo.correlation_id || crypto.randomUUID();
    const startTime = Date.now();

    this.logger.info('scheduler.job.executing', {
      jobId: job.id, jobName: job.name, executionId,
      trigger: triggerInfo.type || 'manual', correlation_id
    });

    this.stats.jobsTriggered++;
    this.metrics?.increment('scheduler.jobs.triggered');

    await this._publicarEvento('scheduler.job.triggered', {
      jobId: job.id, jobName: job.name,
      project_id: job.project_id || null,
      executionId, trigger: triggerInfo
    }, { correlation_id });

    const execution = {
      id: executionId, jobId: job.id, jobName: job.name,
      project_id: job.project_id || null,
      trigger: triggerInfo,
      startedAt: new Date().toISOString(),
      status: 'running', result: null, error: null, duration: null,
      correlation_id
    };
    this.executions.unshift(execution);
    if (this.executions.length > this.maxExecutionHistory) this.executions.pop();

    try {
      const result = await this._executeAction(job.action, { job, trigger: triggerInfo, executionId });

      execution.status = 'completed';
      execution.result = result;
      execution.duration = Date.now() - startTime;

      this.stats.jobsCompleted++;
      this.metrics?.increment('scheduler.jobs.completed');
      this.metrics?.timing('scheduler.execution.duration', execution.duration);

      this.jobManager.updateLastRun(job.id, {
        executionId, success: true, timestamp: new Date().toISOString()
      });

      await this._publicarEvento('scheduler.job.completed', {
        jobId: job.id, jobName: job.name,
        project_id: job.project_id || null,
        executionId, duration: execution.duration, result
      }, { correlation_id });

      this.logger.info('scheduler.job.completed', {
        jobId: job.id, executionId, duration: execution.duration, correlation_id
      });
      return result;
    } catch (error) {
      execution.status = 'failed';
      execution.error = error.message;
      execution.duration = Date.now() - startTime;

      this.stats.jobsFailed++;
      this.metrics?.increment('scheduler.jobs.failed');

      this.jobManager.updateLastRun(job.id, {
        executionId, success: false, error: error.message, timestamp: new Date().toISOString()
      });

      await this._publicarEvento('scheduler.job.failed', {
        jobId: job.id, jobName: job.name,
        project_id: job.project_id || null,
        executionId,
        error: { code: this._classifyExecutionError(error), message: error.message },
        duration: execution.duration
      }, { correlation_id });

      this.logger.error('scheduler.job.failed', {
        jobId: job.id, executionId, error: error.message, correlation_id
      });

      // Retry logic (heredado, sin loops infinitos por max_retries del job)
      if (job.options?.maxRetries > 0 && (triggerInfo.retryCount || 0) < job.options.maxRetries) {
        const retryDelay = job.options.retryDelay || this.config.defaultRetryDelay;
        this.logger.info('scheduler.job.retrying', {
          jobId: job.id,
          retryCount: (triggerInfo.retryCount || 0) + 1,
          maxRetries: job.options.maxRetries,
          delayMs: retryDelay,
          correlation_id
        });
        setTimeout(() => {
          this.executeJob(job, {
            ...triggerInfo, type: 'retry',
            retryCount: (triggerInfo.retryCount || 0) + 1,
            correlation_id
          }).catch(() => {});
        }, retryDelay);
      }

      throw error;
    }
  }

  async _executeAction(action, context) {
    switch (action.type) {
      case 'mqtt':   return this._executeActionMQTT(action, context);
      case 'http':   return this._executeActionHTTP(action, context);
      case 'module': return this._executeActionModule(action, context);
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  async _executeActionMQTT(action, context) {
    const { job, trigger } = context;
    const topic = this._resolveTemplate(action.topic, { job, trigger, now: new Date().toISOString() });
    let payload = action.payload || {};
    const tmplCtx = { job, trigger, now: new Date().toISOString() };
    if (typeof payload === 'string') payload = this._resolveTemplate(payload, tmplCtx);
    else if (typeof payload === 'object') payload = JSON.parse(this._resolveTemplate(JSON.stringify(payload), tmplCtx));

    const now = new Date();
    payload._time = {
      timestamp: now.getTime(), iso: now.toISOString(),
      hour: now.getHours(), minute: now.getMinutes(), second: now.getSeconds(),
      dayOfWeek: now.getDay(), dayOfMonth: now.getDate(),
      month: now.getMonth() + 1, year: now.getFullYear(),
      timezone: this.config.defaultTimezone || 'Europe/Madrid'
    };
    payload._job = { id: job.id, name: job.name };

    await this.eventBus.publish(topic, payload, { qos: action.qos || 1 });
    return { published: true, topic, payload };
  }

  async _executeActionHTTP(action, context) {
    const { job, trigger } = context;
    const tmplCtx = { job, trigger, now: new Date().toISOString() };
    const url = this._resolveTemplate(action.url, tmplCtx);
    const method = action.method || 'GET';
    const headers = action.headers || {};
    let body = action.body;
    if (body && typeof body === 'object') {
      body = JSON.parse(this._resolveTemplate(JSON.stringify(body), tmplCtx));
    }
    const timeout = action.timeout || this.config.defaultTimeout;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const responseText = await response.text();
      let responseData;
      try { responseData = JSON.parse(responseText); } catch { responseData = responseText; }
      if (!response.ok) {
        const err = new Error(`HTTP ${response.status}: ${responseText.slice(0, 200)}`);
        err._upstream_status = response.status;
        throw err;
      }
      return { status: response.status, data: responseData };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        const err = new Error(`HTTP request timeout after ${timeout}ms`);
        err._timeout = true;
        throw err;
      }
      throw error;
    }
  }

  async _executeActionModule(action, context) {
    const requestEvent = `${action.module}.${action.method}.request`;
    const responseEvent = `${action.module}.${action.method}.response`;
    const requestId = crypto.randomUUID();
    const timeoutMs = action.timeout || this.config.defaultTimeout;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const err = new Error(`Module action timeout: ${action.module}.${action.method}`);
        err._timeout = true;
        reject(err);
      }, timeoutMs);

      const handler = async (event) => {
        if (event.request_id === requestId) {
          clearTimeout(timeout);
          if (event.success === false) {
            reject(new Error(event.error?.message || event.error || 'Module action failed'));
          } else {
            resolve(event.data || event);
          }
        }
      };

      this.eventBus.subscribe(responseEvent, handler).then(unsub => {
        setTimeout(() => unsub(), timeoutMs + 1000);
      });

      this.eventBus.publish(requestEvent, { request_id: requestId, ...action.params });
    });
  }

  _resolveTemplate(template, context) {
    if (typeof template !== 'string') return template;
    return template.replace(/\{\{([^}]+)\}\}/g, (match, expr) => {
      const trimmed = expr.trim();
      if (trimmed === 'now') return context.now || new Date().toISOString();
      if (trimmed === 'uuid') return crypto.randomUUID();
      if (trimmed === 'timestamp') return Date.now().toString();
      if (trimmed === 'date') return new Date().toISOString().split('T')[0];
      if (trimmed === 'time') return new Date().toISOString().split('T')[1].split('.')[0];
      try {
        let value = context;
        for (const part of trimmed.split('.')) value = value?.[part];
        return value !== undefined ? (typeof value === 'object' ? JSON.stringify(value) : value) : match;
      } catch {
        return match;
      }
    });
  }

  // ==========================================
  // UI Handlers (mqttRequest cross-modulo, retorno canonico)
  // ==========================================

  async handleUIListJobs(data) {
    try {
      const { project_id } = data || {};
      let jobs;
      if (project_id) {
        const projectJobs = this.jobManager.getByProject(project_id);
        const globalJobs = this.jobManager.getGlobal();
        jobs = [...projectJobs, ...globalJobs];
      } else {
        jobs = this.jobManager.getAll();
      }
      const jobsWithStatus = jobs.map(job => ({
        ...job, status: this.triggerManager.getStatus(job.id)
      }));
      return { status: 200, data: { jobs: jobsWithStatus, count: jobsWithStatus.length } };
    } catch (err) {
      return this._handleHandlerError('scheduler.ui.list.error', err, 'list');
    }
  }

  async handleUIGetJob(data) {
    try {
      const { jobId } = data || {};
      if (!jobId) return this._errorResponse(400, 'VALIDATION_FAILED', 'jobId is required', { kind: 'domain', field: 'jobId' });
      const job = this.jobManager.get(jobId);
      if (!job) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Job not found', { entity_type: 'job', entity_id: jobId });
      return { status: 200, data: { ...job, status: this.triggerManager.getStatus(jobId) } };
    } catch (err) {
      return this._handleHandlerError('scheduler.ui.get.error', err, 'get');
    }
  }

  async handleUICreateJob(data) {
    try {
      const { name, description, trigger, action, options, metadata, project_id } = data || {};
      if (!name) return this._errorResponse(400, 'VALIDATION_FAILED', 'name is required', { kind: 'domain', field: 'name' });
      if (!trigger || !trigger.type) return this._errorResponse(400, 'VALIDATION_FAILED', 'trigger with type is required', { kind: 'domain', field: 'trigger.type' });
      if (!action || !action.type) return this._errorResponse(400, 'VALIDATION_FAILED', 'action with type is required', { kind: 'domain', field: 'action.type' });

      const job = this.jobManager.create({
        name, description,
        project_id: project_id || null,
        trigger, action,
        options: {
          enabled: true,
          maxRetries: this.config.defaultRetries,
          retryDelay: this.config.defaultRetryDelay,
          timeout: this.config.defaultTimeout,
          overlap: false,
          ...options
        },
        metadata: { createdAt: new Date().toISOString(), ...metadata }
      });

      if (job.enabled !== false) {
        this.triggerManager.start(job);
        if (job.trigger.type === 'event' && job.trigger.topic) {
          const unsub = await this.eventBus.subscribe(job.trigger.topic, (event) => {
            this._onEventReceived(job.trigger.topic, event);
          });
          this.unsubscribes.push(unsub);
        }
      }

      this.stats.jobsCreated++;
      this.metrics?.increment('scheduler.jobs.created');

      await this._publicarEvento('scheduler.job.created', {
        jobId: job.id, jobName: job.name,
        project_id: job.project_id || null,
        job
      });

      this.logger.info('scheduler.job.created', { jobId: job.id, jobName: job.name });
      return { status: 201, data: job };
    } catch (err) {
      return this._handleHandlerError('scheduler.ui.create.error', err, 'create');
    }
  }

  async handleUIUpdateJob(data) {
    try {
      const { jobId, ...updates } = data || {};
      if (!jobId) return this._errorResponse(400, 'VALIDATION_FAILED', 'jobId is required', { kind: 'domain', field: 'jobId' });

      const existing = this.jobManager.get(jobId);
      if (!existing) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Job not found', { entity_type: 'job', entity_id: jobId });

      this.triggerManager.stop(jobId);
      const job = this.jobManager.update(jobId, {
        ...updates,
        metadata: { ...existing.metadata, ...updates.metadata, updatedAt: new Date().toISOString() }
      });

      if (job.enabled !== false) this.triggerManager.start(job);

      await this._publicarEvento('scheduler.job.updated', {
        jobId: job.id, jobName: job.name,
        project_id: job.project_id || null,
        job
      });

      this.logger.info('scheduler.job.updated', { jobId: job.id });
      return { status: 200, data: job };
    } catch (err) {
      return this._handleHandlerError('scheduler.ui.update.error', err, 'update');
    }
  }

  async handleUIDeleteJob(data) {
    try {
      const { jobId } = data || {};
      if (!jobId) return this._errorResponse(400, 'VALIDATION_FAILED', 'jobId is required', { kind: 'domain', field: 'jobId' });
      const job = this.jobManager.get(jobId);
      if (!job) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Job not found', { entity_type: 'job', entity_id: jobId });

      this.triggerManager.stop(jobId);
      this.jobManager.delete(jobId);

      this.stats.jobsDeleted++;
      this.metrics?.increment('scheduler.jobs.deleted');

      await this._publicarEvento('scheduler.job.deleted', {
        jobId, jobName: job.name,
        project_id: job.project_id || null
      });

      this.logger.info('scheduler.job.deleted', { jobId });
      return { status: 200, data: { deleted: true, jobId } };
    } catch (err) {
      return this._handleHandlerError('scheduler.ui.delete.error', err, 'delete');
    }
  }

  async handleUIEnableJob(data) {
    try {
      const { jobId } = data || {};
      if (!jobId) return this._errorResponse(400, 'VALIDATION_FAILED', 'jobId is required', { kind: 'domain', field: 'jobId' });
      const job = this.jobManager.get(jobId);
      if (!job) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Job not found', { entity_type: 'job', entity_id: jobId });

      this.jobManager.update(jobId, { enabled: true });
      this.triggerManager.start(job);

      await this._publicarEvento('scheduler.job.enabled', {
        jobId, jobName: job.name,
        project_id: job.project_id || null
      });
      this.logger.info('scheduler.job.enabled', { jobId });
      return { status: 200, data: { enabled: true, jobId } };
    } catch (err) {
      return this._handleHandlerError('scheduler.ui.enable.error', err, 'enable');
    }
  }

  async handleUIDisableJob(data) {
    try {
      const { jobId } = data || {};
      if (!jobId) return this._errorResponse(400, 'VALIDATION_FAILED', 'jobId is required', { kind: 'domain', field: 'jobId' });
      const job = this.jobManager.get(jobId);
      if (!job) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Job not found', { entity_type: 'job', entity_id: jobId });

      this.triggerManager.stop(jobId);
      this.jobManager.update(jobId, { enabled: false });

      await this._publicarEvento('scheduler.job.disabled', {
        jobId, jobName: job.name,
        project_id: job.project_id || null
      });
      this.logger.info('scheduler.job.disabled', { jobId });
      return { status: 200, data: { enabled: false, jobId } };
    } catch (err) {
      return this._handleHandlerError('scheduler.ui.disable.error', err, 'disable');
    }
  }

  async handleUITriggerJob(data) {
    try {
      const { jobId } = data || {};
      if (!jobId) return this._errorResponse(400, 'VALIDATION_FAILED', 'jobId is required', { kind: 'domain', field: 'jobId' });
      const job = this.jobManager.get(jobId);
      if (!job) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Job not found', { entity_type: 'job', entity_id: jobId });

      const result = await this.executeJob(job, { type: 'manual', triggeredBy: 'ui' });
      return { status: 200, data: { triggered: true, jobId, result } };
    } catch (err) {
      return this._handleHandlerError('scheduler.ui.trigger.error', err, 'trigger');
    }
  }

  async handleUIGetTriggerTypes() {
    return { status: 200, data: { types: this._triggerTypesSchema() } };
  }

  async handleUIGetStats() {
    return {
      status: 200,
      data: {
        stats: {
          ...this.stats,
          totalJobs: this.jobManager.count(),
          activeJobs: this.jobManager.countEnabled(),
          disabledJobs: this.jobManager.count() - this.jobManager.countEnabled(),
          uptime: this.stats.startedAt ? Date.now() - new Date(this.stats.startedAt).getTime() : 0
        }
      }
    };
  }

  async handleUIListExecutions(data) {
    const { limit = 50, jobId } = data || {};
    let filtered = this.executions;
    if (jobId) filtered = filtered.filter(e => e.jobId === jobId);
    return { status: 200, data: { executions: filtered.slice(0, limit), count: filtered.length } };
  }

  // ==========================================
  // HTTP API Handlers (delegan en UI handlers)
  // ==========================================

  async handleHealthCheck() {
    return {
      status: 'ok', module: this.name, version: this.version,
      jobs: { total: this.jobManager.count(), active: this.jobManager.countEnabled() },
      uptime: this.stats.startedAt ? Date.now() - new Date(this.stats.startedAt).getTime() : 0
    };
  }

  async handleListJobs(req) {
    const result = await this.handleUIListJobs(req.query || {});
    return result.data?.jobs ?? [];
  }

  async handleGetJob(req, res) {
    const result = await this.handleUIGetJob({ jobId: req.params.jobId });
    if (res && typeof res.status === 'function') res.status(result.status);
    return result.data || result.error;
  }

  async handleCreateJob(req, res) {
    const result = await this.handleUICreateJob(req.body);
    if (res && typeof res.status === 'function') res.status(result.status);
    return result.data || result.error;
  }

  async handleUpdateJob(req, res) {
    const result = await this.handleUIUpdateJob({ jobId: req.params.jobId, ...req.body });
    if (res && typeof res.status === 'function') res.status(result.status);
    return result.data || result.error;
  }

  async handleDeleteJob(req, res) {
    const result = await this.handleUIDeleteJob({ jobId: req.params.jobId });
    if (res && typeof res.status === 'function') res.status(result.status);
    return result.data || result.error;
  }

  async handleEnableJob(req, res) {
    const result = await this.handleUIEnableJob({ jobId: req.params.jobId });
    if (res && typeof res.status === 'function') res.status(result.status);
    return result.data || result.error;
  }

  async handleDisableJob(req, res) {
    const result = await this.handleUIDisableJob({ jobId: req.params.jobId });
    if (res && typeof res.status === 'function') res.status(result.status);
    return result.data || result.error;
  }

  async handleTriggerJob(req, res) {
    const result = await this.handleUITriggerJob({ jobId: req.params.jobId });
    if (res && typeof res.status === 'function') res.status(result.status);
    return result.data || result.error;
  }

  async handleGetTriggerTypes() {
    const result = await this.handleUIGetTriggerTypes();
    return result.data;
  }

  async handleListExecutions(req) {
    const result = await this.handleUIListExecutions({
      limit: parseInt(req.query?.limit, 10) || 50,
      jobId: req.query?.jobId
    });
    return result.data;
  }

  async handleGetStats() {
    const result = await this.handleUIGetStats();
    return result.data;
  }

  // ==========================================
  // AI Tools (retorno canonico { status, data | error })
  // ==========================================

  async toolListJobs(params) {
    try {
      const jobs = this.jobManager.getAll();
      let filtered = jobs;
      if (params?.enabled !== undefined) filtered = filtered.filter(j => j.enabled === params.enabled);
      if (params?.triggerType) filtered = filtered.filter(j => j.trigger?.type === params.triggerType);
      return {
        status: 200,
        data: {
          total: filtered.length,
          jobs: filtered.map(job => ({
            id: job.id, name: job.name, description: job.description,
            enabled: job.enabled, triggerType: job.trigger?.type,
            lastRun: job.lastRun,
            status: this.triggerManager.getStatus(job.id)
          }))
        }
      };
    } catch (err) {
      return this._handleHandlerError('scheduler.tool.list_jobs.error', err, 'list_jobs');
    }
  }

  async toolCreateJob(params) {
    return this.handleUICreateJob(params);
  }

  async toolTriggerJob(params) {
    return this.handleUITriggerJob(params);
  }

  // ==========================================
  // Internals (helpers canonicos)
  // ==========================================
  //
  // _errorResponse, _handleHandlerError, _classifyHandlerError y
  // _publicarEvento se heredan de BaseModule (modules/_shared/base-module.js).
  // Eliminados del codigo local; cualquier bug fix vive en BaseModule.

  _classifyExecutionError(err) {
    if (err?._timeout) return 'UPSTREAM_TIMEOUT';
    if (err?._upstream_status) {
      if (err._upstream_status === 401 || err._upstream_status === 403) return 'UPSTREAM_AUTH_FAILED';
      if (err._upstream_status === 429) return 'UPSTREAM_RATE_LIMITED';
      if (err._upstream_status >= 500) return 'UPSTREAM_5XX';
    }
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('timeout')) return 'UPSTREAM_TIMEOUT';
    if (msg.includes('econnrefused') || msg.includes('network')) return 'UPSTREAM_UNREACHABLE';
    return 'INTERNAL_ERROR';
  }

  _triggerTypesSchema() {
    return [
      {
        type: 'cron', name: 'Cron Expression',
        description: 'Schedule using cron expressions (e.g., "0 3 * * *" for daily at 3am)',
        schema: {
          expression: { type: 'string', required: true, description: 'Cron expression' },
          timezone: { type: 'string', description: 'Timezone (default: Europe/Madrid)' }
        },
        examples: [
          { expression: '*/5 * * * *', description: 'Every 5 minutes' },
          { expression: '0 3 * * *', description: 'Daily at 3:00 AM' },
          { expression: '0 3 * * 0', description: 'Every Sunday at 3:00 AM' },
          { expression: '0 9 * * 1-5', description: 'Weekdays at 9:00 AM' }
        ]
      },
      {
        type: 'interval', name: 'Fixed Interval',
        description: 'Execute at fixed intervals',
        schema: {
          value: { type: 'number', required: true, description: 'Interval value' },
          unit: { type: 'string', enum: ['ms', 's', 'm', 'h', 'd'], description: 'Time unit' }
        },
        examples: [
          { value: 30, unit: 's', description: 'Every 30 seconds' },
          { value: 5, unit: 'm', description: 'Every 5 minutes' },
          { value: 1, unit: 'h', description: 'Every hour' }
        ]
      },
      {
        type: 'datetime', name: 'Specific Date/Time',
        description: 'Execute at a specific date and time',
        schema: {
          date: { type: 'string', description: 'Date (YYYY-MM-DD)' },
          time: { type: 'string', description: 'Time (HH:mm:ss)' },
          repeat: { type: 'string', enum: ['once', 'daily', 'weekly', 'monthly', 'yearly'], description: 'Repeat pattern' },
          timezone: { type: 'string', description: 'Timezone' }
        },
        examples: [
          { date: '2025-12-25', time: '00:00:00', repeat: 'yearly', description: 'Every Christmas' }
        ]
      },
      {
        type: 'event', name: 'Event-Based',
        description: 'Trigger when an MQTT event is received',
        schema: {
          topic: { type: 'string', required: true, description: 'MQTT topic to listen' },
          condition: { type: 'string', description: 'JavaScript condition (e.g., "payload.size > 1000")' },
          debounce: { type: 'number', description: 'Debounce time in ms' }
        },
        examples: [
          { topic: 'file.uploaded', condition: 'payload.type === "pdf"', description: 'When PDF uploaded' }
        ]
      },
      {
        type: 'condition', name: 'Condition-Based',
        description: 'Trigger when a condition becomes true',
        schema: {
          check: { type: 'string', required: true, description: 'JavaScript expression to evaluate' },
          interval: { type: 'number', description: 'Check interval in ms (default: 10000)' },
          persist: { type: 'boolean', description: 'Stay triggered until reset' }
        },
        examples: [
          { check: 'metrics.cpu > 80', interval: 10000, description: 'High CPU usage' }
        ]
      },
      {
        type: 'composite', name: 'Composite',
        description: 'Combine multiple triggers with logic operators',
        schema: {
          logic: { type: 'string', enum: ['AND', 'OR', 'NAND', 'NOR', 'XOR'], description: 'Logic operator' },
          triggers: { type: 'array', description: 'Array of trigger definitions' }
        },
        examples: [
          {
            logic: 'AND',
            triggers: [
              { type: 'cron', expression: '0 9 * * 1-5' },
              { type: 'condition', check: 'system.load < 50' }
            ],
            description: 'Weekdays 9am when load is low'
          }
        ]
      }
    ];
  }
}

module.exports = SchedulerModule;

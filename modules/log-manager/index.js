'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const LogStorage = require('./lib/storage');
const LogCollector = require('./lib/collector');
const SessionLogger = require('./lib/session');
const BaseModule = require('../_shared/base-module');
const { listSessions, readSessionLogs } = require('./lib/session');

class LogManagerModule extends BaseModule {
  constructor() {
    super();
    this.name = 'log-manager';
    this.version = '2.1.0';
    this.storage = null;
    this.collector = null;
    this.session = null;
    this.config = null;
    this.cleanupInterval = null;
  }

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger?.child
      ? context.logger.child({ module: this.name })
      : context.logger;
    this.metrics = context.metrics;
    this.config = context.moduleConfig || {};

    const logsPath = path.resolve(
      process.cwd(),
      this.config.logsPath || './data/logs'
    );
    const sessionsPath = path.join(logsPath, 'sessions');
    const coreId = context.config?.core?.id || context.id || 'unknown';

    this.session = new SessionLogger({
      sessionsPath,
      coreId,
      trackedModules: this.config.trackedModules || ['*'],
      excludedModules: this.config.excludedModules || ['log-manager']
    });
    await this.session.init();

    this.storage = new LogStorage({
      logsPath,
      maxFileSize: this.config.maxFileSize || 10 * 1024 * 1024,
      retentionDays: this.config.retentionDays || 30,
      rotateDaily: this.config.rotateDaily !== false,
      organizeByModule: false
    });

    this.collector = new LogCollector({
      storage: this.storage,
      session: this.session,
      eventBus: this.eventBus,
      logger: this.logger,
      coreId
    });
    this.collector.start();

    this.cleanupInterval = setInterval(() => {
      try { this.storage.cleanup(); } catch (err) {
        this.logger?.warn('log-manager.storage.cleanup_failed', { error: err.message });
      }
      this._cleanupOldSessions();
    }, 24 * 60 * 60 * 1000);

    this.logger?.info('log-manager.loaded', {
      module: this.name,
      version: this.version,
      sessionId: this.session.sessionId,
      trackedModules: this.session.trackedModules,
      excludedModules: this.session.excludedModules
    });

    this.session.write('log-manager', {
      ts: new Date().toISOString(),
      level: 'info',
      source: 'backend',
      module: 'log-manager',
      msg: 'session.started',
      ctx: {
        sessionId: this.session.sessionId,
        trackedModules: this.session.trackedModules,
        version: this.version
      }
    });
  }

  async onUnload() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    if (this.collector) { try { this.collector.stop(); } catch (_) { /* idempotent */ } }
    if (this.session)   { try { this.session.close();   } catch (_) { /* idempotent */ } }
    if (this.storage)   { try { this.storage.close();   } catch (_) { /* idempotent */ } }
    this.logger?.info('log-manager.unloaded', { module: this.name });
  }

  // ==========================================
  // POC2 Helpers
  // ==========================================

  _buildCorrelationId() {
    return crypto.randomUUID();
  }

  _errorResponse(status, code, message, details) {
    const r = { status, error: { code, message } };
    if (details !== undefined) r.error.details = details;
    return r;
  }

  _classifyHandlerError(error) {
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('no encontrad')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('requerido') || msg.includes('missing')) return 'INVALID_INPUT';
    if (msg.includes('not initialized') || msg.includes('unavailable')) return 'UPSTREAM_UNREACHABLE';
    return 'UNKNOWN_ERROR';
  }

  _handleHandlerError(eventName, error, kind) {
    const code = error._code || this._classifyHandlerError(error);
    const details = error._details;
    const statusMap = {
      RESOURCE_NOT_FOUND: 404,
      INVALID_INPUT: 400,
      INVALID_INPUT: 400,
      UPSTREAM_UNREACHABLE: 503,
      UNKNOWN_ERROR: 500
    };
    const status = statusMap[code] || 500;
    const level = status < 500 ? 'warn' : 'error';
    this.logger?.[level]?.(eventName, { module: this.name, code, kind, error: error.message });
    this.metrics?.increment?.('log-manager.handler_error', { code, kind });
    return this._errorResponse(status, code, error.message, details);
  }

  async _publicarEvento(event, payload, opts = {}) {
    const correlationId = opts.correlation_id || this._buildCorrelationId();
    return this.eventBus.publish(event, {
      ...payload,
      correlation_id: correlationId,
      timestamp: new Date().toISOString()
    });
  }

  // ==========================================
  // Helpers internos
  // ==========================================

  _successResponse(data) {
    return { status: 200, data };
  }

  _requireSession() {
    if (!this.session) {
      throw Object.assign(new Error('Session logger not initialized'), {
        _code: 'UPSTREAM_UNREACHABLE'
      });
    }
  }

  _requireCollector() {
    if (!this.collector) {
      throw Object.assign(new Error('Log collector not initialized'), {
        _code: 'UPSTREAM_UNREACHABLE'
      });
    }
  }

  _sessionsBasePath() {
    return path.join(
      process.cwd(),
      this.config?.logsPath || './data/logs',
      'sessions'
    );
  }

  _cleanupOldSessions() {
    const retentionDays = this.config?.sessionRetentionDays || 7;
    const sessionsPath = this._sessionsBasePath();
    try {
      const sessions = listSessions(sessionsPath);
      const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
      let deleted = 0;
      for (const s of sessions) {
        const sessionDate = new Date(s.startedAt || 0);
        if (sessionDate.getTime() < cutoff) {
          fs.rmSync(s.path, { recursive: true, force: true });
          deleted++;
        }
      }
      if (deleted > 0) {
        this.logger?.info('log-manager.sessions.cleaned', { deleted, retentionDays });
        this.metrics?.increment?.('log-manager.sessions_cleaned', { count: String(deleted) });
      }
    } catch (err) {
      this.logger?.error('log-manager.sessions.cleanup_failed', { error: err.message });
    }
  }

  _extractModuleName(urlPath, before, after) {
    const parts = (urlPath || '').split('/');
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === before && parts[i + 2] === after) return parts[i + 1];
    }
    return null;
  }

  _extractParam(urlPath, after) {
    const parts = (urlPath || '').split('/');
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === after && parts[i + 1]) return parts[i + 1];
    }
    return null;
  }

  _extractSessionId(urlPath) {
    const parts = (urlPath || '').split('/');
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === 'sessions' && parts[i + 1] && parts[i + 1] !== 'logs') {
        return parts[i + 1];
      }
    }
    return null;
  }

  // ==========================================
  // HTTP handlers — shape canonico {status, data | error}
  // ==========================================

  async getSession(_req) {
    try {
      this._requireSession();
      return this._successResponse({ session: this.session.getSessionInfo() });
    } catch (error) {
      return this._handleHandlerError('log-manager.get_session.failed', error, 'http');
    }
  }

  async getSessionModules(_req) {
    try {
      this._requireSession();
      const modules = this.session.listModules();
      return this._successResponse({
        sessionId: this.session.sessionId,
        count: modules.length,
        modules
      });
    } catch (error) {
      return this._handleHandlerError('log-manager.get_session_modules.failed', error, 'http');
    }
  }

  async getSessionModuleLogs(req) {
    try {
      this._requireSession();
      const moduleName = this._extractModuleName(req?.path, 'modules', 'logs');
      if (!moduleName) {
        throw Object.assign(new Error('Module name required'), {
          _code: 'INVALID_INPUT',
          _details: { field: 'module' }
        });
      }
      const filters = {
        level: req?.query?.level,
        search: req?.query?.search
      };
      const logs = this.session.readModule(moduleName, filters);
      return this._successResponse({
        sessionId: this.session.sessionId,
        module: moduleName,
        count: logs.length,
        logs
      });
    } catch (error) {
      return this._handleHandlerError('log-manager.get_session_module_logs.failed', error, 'http');
    }
  }

  async setTrackedModules(req) {
    try {
      this._requireSession();
      const { modules, exclude } = req?.body || {};
      if (modules) this.session.setTrackedModules(modules);
      if (exclude) this.session.addExcludedModules(exclude);
      return this._successResponse({
        trackedModules: this.session.trackedModules,
        excludedModules: this.session.excludedModules
      });
    } catch (error) {
      return this._handleHandlerError('log-manager.set_tracked_modules.failed', error, 'http');
    }
  }

  async addTrackedModules(req) {
    try {
      this._requireSession();
      const { modules } = req?.body || {};
      if (!Array.isArray(modules)) {
        throw Object.assign(new Error('modules array required'), {
          _code: 'INVALID_INPUT',
          _details: { field: 'modules' }
        });
      }
      this.session.addTrackedModules(modules);
      return this._successResponse({
        trackedModules: this.session.trackedModules
      });
    } catch (error) {
      return this._handleHandlerError('log-manager.add_tracked_modules.failed', error, 'http');
    }
  }

  async getSessionResumen(_req) {
    try {
      this._requireSession();
      this._requireCollector();

      const sessionInfo = this.session.getSessionInfo();
      const deviceStats = this.collector.getDeviceStats();
      const mqttTimeline = this.collector.getMqttTimeline() || [];

      const errores  = this.session.readAllModules({ level: 'error' }) || [];
      const warnings = this.session.readAllModules({ level: 'warn' })  || [];
      const printErrors = this.session.readModule('impresion', { level: 'error' }) || [];

      const mqttDesconexiones = mqttTimeline.filter(e => e.event === 'mqtt:disconnected');
      const mqttReconexiones  = mqttTimeline.filter(e => e.event === 'mqtt:connected');

      const erroresPorModulo = {};
      for (const err of errores) {
        const mod = err.module || 'unknown';
        erroresPorModulo[mod] = (erroresPorModulo[mod] || 0) + 1;
      }

      const problemas = [];
      for (const e of mqttDesconexiones) problemas.push({ ts: e.ts, tipo: 'mqtt_desconexion', detalle: e.ctx });
      for (const e of printErrors)        problemas.push({ ts: e.ts, tipo: 'print_error', detalle: e.ctx || e.msg });
      for (const err of errores.slice(-50)) problemas.push({ ts: err.ts, tipo: 'error', modulo: err.module, msg: err.msg });
      problemas.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));

      return this._successResponse({
        resumen: {
          sesion: {
            id: sessionInfo.id,
            inicio: sessionInfo.startedAt,
            uptime: sessionInfo.uptime,
            total_logs: sessionInfo.stats?.totalEntries || 0
          },
          salud: {
            errores_total: errores.length,
            warnings_total: warnings.length,
            errores_por_modulo: erroresPorModulo,
            modulo_mas_problemas: Object.entries(erroresPorModulo).sort((a, b) => b[1] - a[1])[0] || null
          },
          mqtt: {
            desconexiones: mqttDesconexiones.length,
            reconexiones: mqttReconexiones.length,
            timeline: mqttTimeline.slice(-20)
          },
          impresora: {
            dispositivos: deviceStats,
            errores_impresion: printErrors.length,
            ultimos_errores: printErrors.slice(-10)
          },
          timeline_problemas: problemas.slice(-30)
        }
      });
    } catch (error) {
      return this._handleHandlerError('log-manager.get_session_resumen.failed', error, 'http');
    }
  }

  async getSessions(req) {
    try {
      const sessions = listSessions(this._sessionsBasePath());
      const limit = parseInt(req?.query?.limit, 10) || 20;
      return this._successResponse({
        currentSession: this.session?.sessionId || null,
        count: sessions.length,
        sessions: sessions.slice(0, limit)
      });
    } catch (error) {
      return this._handleHandlerError('log-manager.get_sessions.failed', error, 'http');
    }
  }

  async getSessionById(req) {
    try {
      const sessionId = this._extractParam(req?.path, 'sessions');
      if (!sessionId) {
        throw Object.assign(new Error('Session ID required'), {
          _code: 'INVALID_INPUT',
          _details: { field: 'session_id' }
        });
      }
      const sessions = listSessions(this._sessionsBasePath());
      const session = sessions.find(s => s.id === sessionId);
      if (!session) {
        throw Object.assign(new Error(`Session ${sessionId} not found`), {
          _code: 'RESOURCE_NOT_FOUND',
          _details: { entity_type: 'session', entity_id: sessionId }
        });
      }
      return this._successResponse({ session });
    } catch (error) {
      return this._handleHandlerError('log-manager.get_session_by_id.failed', error, 'http');
    }
  }

  async getSessionLogs(req) {
    try {
      const sessionId = this._extractSessionId(req?.path);
      if (!sessionId) {
        throw Object.assign(new Error('Session ID required'), {
          _code: 'INVALID_INPUT',
          _details: { field: 'session_id' }
        });
      }
      const moduleName = req?.query?.module || null;
      const logs = readSessionLogs(sessionId, moduleName, this._sessionsBasePath());
      const limit = parseInt(req?.query?.limit, 10) || 500;
      return this._successResponse({
        sessionId,
        module: moduleName || 'all',
        count: logs.length,
        logs: logs.slice(-limit)
      });
    } catch (error) {
      return this._handleHandlerError('log-manager.get_session_logs.failed', error, 'http');
    }
  }

  async getLogs(req) {
    try {
      if (!this.storage) {
        throw Object.assign(new Error('Log storage not initialized'), {
          _code: 'UPSTREAM_UNREACHABLE'
        });
      }
      const filters = {
        level:   req?.query?.level,
        module:  req?.query?.module,
        source:  req?.query?.source,
        search:  req?.query?.search,
        from:    req?.query?.from,
        to:      req?.query?.to,
        limit:   parseInt(req?.query?.limit,  10) || 100,
        offset:  parseInt(req?.query?.offset, 10) || 0
      };
      const logs = this.storage.read(filters);
      return this._successResponse({ count: logs.length, filters, logs });
    } catch (error) {
      return this._handleHandlerError('log-manager.get_logs.failed', error, 'http');
    }
  }

  async addLog(req) {
    try {
      this._requireCollector();
      const body = req?.body || {};
      const msg = body.msg || body.message;
      if (!body.level || !body.module || !msg) {
        throw Object.assign(new Error('Missing required fields: level, module, msg'), {
          _code: 'INVALID_INPUT',
          _details: { fields: ['level', 'module', 'msg'] }
        });
      }
      const normalized = { ...body, msg };
      const result = this.collector.addFromHttp(normalized);
      return this._successResponse({ result });
    } catch (error) {
      return this._handleHandlerError('log-manager.add_log.failed', error, 'http');
    }
  }

  async getStats(_req) {
    try {
      this._requireSession();
      this._requireCollector();
      const sessionInfo = this.session.getSessionInfo();
      const collectorStats = this.collector.getStats();
      return this._successResponse({
        stats: {
          currentSession: {
            id: sessionInfo.id,
            startedAt: sessionInfo.startedAt,
            uptime: sessionInfo.uptime,
            entries: sessionInfo.stats?.totalEntries || 0,
            byModule: sessionInfo.stats?.byModule || {},
            byLevel:  sessionInfo.stats?.byLevel  || {}
          },
          collector: collectorStats,
          trackedModules: this.session.trackedModules,
          excludedModules: this.session.excludedModules
        }
      });
    } catch (error) {
      return this._handleHandlerError('log-manager.get_stats.failed', error, 'http');
    }
  }

  // ==========================================
  // Helpers de uso interno (frontend / agentes)
  // ==========================================

  queryModule(moduleName, filters = {}) {
    return this.session?.readModule(moduleName, filters) || [];
  }

  getCurrentSession() {
    return this.session?.getSessionInfo() || null;
  }

  getSessionPath() {
    return this.session?.sessionPath || null;
  }
}

module.exports = LogManagerModule;

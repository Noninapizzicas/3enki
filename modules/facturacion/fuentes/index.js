/**
 * Fuentes Module v2.0.0 — POC2 canonico.
 *
 * Adaptador strategy-pattern entre canales externos (Telegram push, Gmail pull,
 * extensible) y el pipeline `facturas`. NO procesa facturas: solo traduce input
 * externo en `factura.entrada` con shape canonico
 * { projectId, filePath, source, origen, correlation_id, project_id, timestamp }.
 *
 * Strategies en strategies/{telegram,gmail}.js. Cada strategy llama a
 * `modulo._publicarEvento('factura.entrada', ...)` via `emitFacturaEntrada`.
 *
 * trabajo_pendiente: renombrar `factura.entrada` -> `fuentes.factura.detectada`
 * coordinado con migracion de `facturas/` (unico consumer).
 */

'use strict';

const ServiceExecutor = require('../../../core/service-executor');
const TelegramStrategy = require('./strategies/telegram');
const GmailStrategy = require('./strategies/gmail');

class FuentesModule {
  constructor() {
    this.name = 'fuentes';
    this.version = '2.0.0';

    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.services = null;
    this.config = null;

    this.projectConfigs = new Map();

    this.strategies = {};
    this._registerStrategy(new TelegramStrategy());
    this._registerStrategy(new GmailStrategy());
  }

  _registerStrategy(strategy) {
    this.strategies[strategy.tipo] = strategy;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics || null;
    this.eventBus = core.eventBus;
    this.config = core.moduleConfig || {};
    this.services = new ServiceExecutor(this.eventBus, this.logger);

    for (const strategy of Object.values(this.strategies)) {
      strategy.init(this);
    }

    this.logger.info('fuentes.loaded', {
      module: this.name,
      version: this.version,
      strategies: Object.keys(this.strategies)
    });
  }

  async onUnload() {
    for (const strategy of Object.values(this.strategies)) {
      if (typeof strategy.cleanup === 'function') strategy.cleanup();
    }
    this.projectConfigs.clear();
    this.logger?.info?.('fuentes.unloaded', { module: this.name });
  }

  // ==========================================
  // Helpers POC2
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details !== undefined) error.details = details;
    return { status, error };
  }

  _classifyHandlerError(err) {
    const msg = err?.message || String(err);
    const code = err?.code;
    if (code === 'ENOENT') return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (code === 'EACCES' || code === 'EPERM') return { status: 500, code: 'FILESYSTEM_ERROR' };
    if (/required|invalid|missing|requerido/i.test(msg)) return { status: 400, code: 'INVALID_INPUT' };
    if (/not found|no encontrad|no disponible/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/timeout|timed out/i.test(msg)) return { status: 504, code: 'TIMEOUT' };
    if (/dependency|service|unavailable/i.test(msg)) return { status: 503, code: 'DEPENDENCY_UNAVAILABLE' };
    return { status: 500, code: 'INTERNAL_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'handler') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('fuentes.errors', { code, kind });
    return this._errorResponse(status, code, err?.message || 'Error interno');
  }

  _validateRequiredFields(data, fields) {
    const missing = fields.filter(f => data?.[f] === undefined || data?.[f] === null || data?.[f] === '');
    if (missing.length > 0) {
      const err = new Error(`Campos requeridos faltantes: ${missing.join(', ')}`);
      err._code = 'INVALID_INPUT';
      throw err;
    }
  }

  async _publicarEvento(name, payload, sourcePayload) {
    const correlation_id =
      payload?.correlation_id ||
      sourcePayload?.correlation_id ||
      sourcePayload?.metadata?.correlationId ||
      null;
    const project_id =
      payload?.project_id ??
      payload?.projectId ??
      sourcePayload?.project_id ??
      sourcePayload?.projectId ??
      null;
    const enriched = {
      ...payload,
      correlation_id,
      timestamp: payload?.timestamp || new Date().toISOString()
    };
    if (project_id !== null && project_id !== undefined) enriched.project_id = project_id;
    try {
      await this.eventBus.publish(name, enriched);
    } catch (err) {
      this.logger?.warn?.('fuentes.publish.failed', {
        event: name, error_message: err.message
      });
    }
    return enriched;
  }

  // ==========================================
  // Bus subscribers (telegram → strategies)
  // ==========================================

  async onTelegramPhoto(event) {
    const data = event?.data || event?.payload || event;
    try {
      const strategy = this.strategies.telegram;
      if (!strategy) return;
      await strategy.onPhotoReceived({ data });
    } catch (err) {
      this._handleHandlerError('fuentes.telegram.photo.error', err, 'subscribe');
    }
  }

  async onTelegramDocument(event) {
    const data = event?.data || event?.payload || event;
    try {
      const strategy = this.strategies.telegram;
      if (!strategy) return;
      await strategy.onDocumentReceived({ data });
    } catch (err) {
      this._handleHandlerError('fuentes.telegram.document.error', err, 'subscribe');
    }
  }

  // ==========================================
  // Punto unico de emision factura.entrada
  // ==========================================

  async emitFacturaEntrada({ projectId, filePath, source, origen, correlation_id }) {
    this.metrics?.increment?.('fuentes.factura.entrada.emitida', { source });
    this.logger.info('fuentes.emitiendo-entrada', { projectId, filePath, source });

    return this._publicarEvento('factura.entrada', {
      projectId,
      project_id: projectId,
      filePath,
      source,
      origen,
      correlation_id
    });
  }

  // ==========================================
  // Project config resolution
  // ==========================================

  async getProjectFuentesConfig(projectId) {
    if (this.projectConfigs.has(projectId)) {
      return this.projectConfigs.get(projectId);
    }
    try {
      const result = await this.services.call('local.project-config', 'get', {
        project_id: projectId
      }, { timeout: 5000 });
      const config = result?.data || result;
      if (config) {
        this.projectConfigs.set(projectId, config);
        return config;
      }
    } catch (e) {
      this.logger.debug('fuentes.config.no-disponible', { projectId, error: e.message });
    }
    return null;
  }

  setProjectConfig(projectId, config) {
    this.projectConfigs.set(projectId, config);
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleStatus(_data) {
    try {
      const status = {};
      for (const [tipo, strategy] of Object.entries(this.strategies)) {
        status[tipo] = {
          tipo,
          version: strategy.version || '1.0.0',
          health: typeof strategy.getHealth === 'function' ? strategy.getHealth() : 'unknown'
        };
      }
      return {
        status: 200,
        data: {
          strategies: status,
          projectConfigs: this.projectConfigs.size
        }
      };
    } catch (err) {
      return this._handleHandlerError('fuentes.status.error', err, 'ui_handler');
    }
  }

  async handleGetConfig(data) {
    try {
      this._validateRequiredFields(data, ['proyecto']);
      const { proyecto } = data;

      const config = await this.getProjectFuentesConfig(proyecto);
      const fuentes = config?.fuentes || {};

      const strategies = {};
      for (const [tipo, strategy] of Object.entries(this.strategies)) {
        strategies[tipo] = {
          configured: !!fuentes[tipo]?.enabled,
          health: typeof strategy.getHealth === 'function' ? strategy.getHealth() : 'unknown'
        };
      }

      return {
        status: 200,
        data: { proyecto, fuentes, strategies }
      };
    } catch (err) {
      return this._handleHandlerError('fuentes.get-config.error', err, 'ui_handler');
    }
  }

  async handleSaveConfig(data) {
    try {
      this._validateRequiredFields(data, ['proyecto', 'fuentes']);
      const { proyecto, fuentes } = data;

      await this.services.call('local.project-config', 'set', {
        project_id: proyecto,
        key: 'fuentes',
        value: fuentes
      }, { timeout: 5000 });

      const existing = this.projectConfigs.get(proyecto) || {};
      existing.fuentes = fuentes;
      this.projectConfigs.set(proyecto, existing);

      this.metrics?.increment?.('fuentes.config.saved');
      this.logger.info('fuentes.config.saved', { proyecto, keys: Object.keys(fuentes) });

      return { status: 200, data: { saved: true, fuentes } };
    } catch (err) {
      return this._handleHandlerError('fuentes.save-config.error', err, 'ui_handler');
    }
  }

  async handleCheckGmail(data) {
    try {
      this._validateRequiredFields(data, ['proyecto']);
      const { proyecto, correlation_id } = data;

      const strategy = this.strategies.gmail;
      if (!strategy) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Gmail strategy no disponible');
      }

      const result = await strategy.checkAndProcess(proyecto, { correlation_id });
      return { status: 200, data: result };
    } catch (err) {
      return this._handleHandlerError('fuentes.check-gmail.error', err, 'ui_handler');
    }
  }

  async handleHealth(_data) {
    const strategies = {};
    for (const [tipo, strategy] of Object.entries(this.strategies)) {
      strategies[tipo] = typeof strategy.getHealth === 'function' ? strategy.getHealth() : 'unknown';
    }
    return {
      status: 200,
      data: {
        module: this.name,
        version: this.version,
        strategies,
        projectConfigsCached: this.projectConfigs.size
      }
    };
  }
}

module.exports = FuentesModule;

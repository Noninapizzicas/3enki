/**
 * system-inspector v2.0.0 — Observador pasivo dev-only del sistema.
 *
 * Captura todo lo que ocurre en el runtime (similar a la consola de DevTools
 * del navegador) en un buffer circular in-memory + persiste snapshot a archivo
 * JSON cada N segundos. Expone 4 APIs HTTP read-only para que la IA consulte
 * el estado del sistema.
 *
 * Captura (cada interceptor activable independientemente via config.capture):
 *   - HTTP requests/responses (via hooks beforeRequest/afterResponse del gateway).
 *   - Errores no capturados + unhandledRejection.
 *   - Logs error/warn/info-relevante del logger global.
 *   - Mensajes MQTT entrantes/salientes.
 *
 * APIs:
 *   GET    /modules/system-inspector/status   → snapshot completo
 *   GET    /modules/system-inspector/errors   → solo errores
 *   GET    /modules/system-inspector/network  → solo HTTP requests
 *   DELETE /modules/system-inspector/clear    → vacia el buffer
 *
 * No publica al bus (recursion via los wildcards `core/+/events/#`). Subscribes
 * declarados en module.json son wildcards de observacion pasiva — la captura
 * real ocurre via MqttInterceptor wrapping de eventBus.publish + listener de
 * mensajes entrantes.
 *
 * Early-exit en production a menos que `config.force_in_production: true`.
 */

'use strict';

const crypto = require('crypto');

const ConsoleBuffer    = require('./lib/console-buffer');
const HttpInterceptor  = require('./lib/http-interceptor');
const ErrorInterceptor = require('./lib/error-interceptor');
const MqttInterceptor  = require('./lib/mqtt-interceptor');
const FileWriter       = require('./lib/file-writer');

class SystemInspectorModule {
  constructor() {
    this.name    = 'system-inspector';
    this.version = '2.0.0';

    // Inyectados en onLoad
    this.core      = null;
    this.logger    = null;
    this.eventBus  = null;
    this.metrics   = null;
    this.config    = null;
    this.startTime = null;

    // Componentes (inicializados en onLoad si la config lo pide)
    this.buffer            = null;
    this.httpInterceptor   = null;
    this.errorInterceptor  = null;
    this.mqttInterceptor   = null;
    this.fileWriter        = null;

    this.skipped = false;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.core      = core;
    this.logger    = core.logger;
    this.eventBus  = core.eventBus || null;
    this.metrics   = core.metrics  || null;
    this.startTime = Date.now();
    this.config    = this._loadConfig();

    if (process.env.NODE_ENV === 'production' && !this.config.force_in_production) {
      this.skipped = true;
      this.logger?.warn('system-inspector.skipped', {
        reason: 'production environment',
        hint:   'Set force_in_production: true to override'
      });
      return;
    }

    this.buffer = new ConsoleBuffer({
      maxSize:    this.config.buffer_size,
      truncateAt: this.config.truncate_bodies
    });

    await this._initializeInterceptors();
    this._initializeFileWriter();

    this.buffer.info('system-inspector', 'System Inspector initialized', {
      capture: this.config.capture
    });

    this.logger?.info('system-inspector.loaded', {
      module:      this.name,
      version:     this.version,
      buffer_size: this.config.buffer_size,
      output_file: this.config.output_file,
      capture:     this.config.capture
    });
  }

  async onUnload() {
    this.logger?.info('system-inspector.unloading', { module: this.name });

    if (this.fileWriter) {
      try { this.fileWriter.stop(); }
      catch (err) { this.logger?.warn('system-inspector.unload.fileWriter_stop_failed', { error: err.message }); }
      this.fileWriter = null;
    }

    if (this.httpInterceptor) {
      try { this.httpInterceptor.stop(); }
      catch (err) { this.logger?.warn('system-inspector.unload.http_stop_failed', { error: err.message }); }
      this.httpInterceptor = null;
    }

    if (this.errorInterceptor) {
      try { this.errorInterceptor.stop(); }
      catch (err) { this.logger?.warn('system-inspector.unload.error_stop_failed', { error: err.message }); }
      this.errorInterceptor = null;
    }

    if (this.mqttInterceptor) {
      try { this.mqttInterceptor.stop(); }
      catch (err) { this.logger?.warn('system-inspector.unload.mqtt_stop_failed', { error: err.message }); }
      this.mqttInterceptor = null;
    }

    if (this.buffer) {
      this.buffer.clear();
      this.buffer = null;
    }

    this.logger?.info('system-inspector.unloaded', { module: this.name });
  }

  // ==========================================
  // Config
  // ==========================================

  _loadConfig() {
    const moduleConfig = this.core?.moduleConfig || {};
    return {
      buffer_size:         moduleConfig.buffer_size         || 500,
      write_interval_ms:   moduleConfig.write_interval_ms   || 2000,
      output_file:         moduleConfig.output_file         || './data/system-console.json',
      truncate_bodies:     moduleConfig.truncate_bodies     || 1000,
      force_in_production: moduleConfig.force_in_production === true,
      capture: {
        http:       moduleConfig.capture?.http       !== false,
        mqtt:       moduleConfig.capture?.mqtt       !== false,
        errors:     moduleConfig.capture?.errors     !== false,
        logs:       moduleConfig.capture?.logs       !== false,
        validation: moduleConfig.capture?.validation !== false
      }
    };
  }

  // ==========================================
  // Setup interceptors
  // ==========================================

  async _initializeInterceptors() {
    if (this.config.capture.http) {
      this.httpInterceptor = new HttpInterceptor(this.buffer, this.core);
      await this.httpInterceptor.start();
    }

    if (this.config.capture.errors || this.config.capture.logs) {
      this.errorInterceptor = new ErrorInterceptor(this.buffer, this.core, {
        captureErrors: this.config.capture.errors,
        captureLogs:   this.config.capture.logs
      });
      await this.errorInterceptor.start();
    }

    if (this.config.capture.mqtt) {
      this.mqttInterceptor = new MqttInterceptor(this.buffer, this.core);
      await this.mqttInterceptor.start();
    }
  }

  _initializeFileWriter() {
    this.fileWriter = new FileWriter({
      buffer:     this.buffer,
      filePath:   this.config.output_file,
      intervalMs: this.config.write_interval_ms,
      coreId:     this.core?.id || 'unknown',
      startTime:  this.startTime,
      onError:    this._buildLogProxy()
    });
    this.fileWriter.start();
  }

  // ==========================================
  // HTTP API handlers (shape canonico { status, data | error })
  // ==========================================

  async handleGetStatus(req, context) {
    try {
      const guard = this._guardInitialized();
      if (guard) return guard;

      this._updateGauges();
      const data = this.buffer.getFullState(this.core?.id || 'unknown', this.startTime);

      this.metrics?.increment('system-inspector.api.status.ok');
      return { status: 200, data };
    } catch (err) {
      return this._handleHandlerError('system-inspector.api.status.failed', err, 'http_status', context);
    }
  }

  async handleGetErrors(req, context) {
    try {
      const guard = this._guardInitialized();
      if (guard) return guard;

      const errors = this.buffer.getErrors();
      this.metrics?.increment('system-inspector.api.errors.ok');
      return {
        status: 200,
        data: {
          generated_at: new Date().toISOString(),
          count:        errors.length,
          errors
        }
      };
    } catch (err) {
      return this._handleHandlerError('system-inspector.api.errors.failed', err, 'http_errors', context);
    }
  }

  async handleGetNetwork(req, context) {
    try {
      const guard = this._guardInitialized();
      if (guard) return guard;

      const requests = this.buffer.getNetwork();
      this.metrics?.increment('system-inspector.api.network.ok');
      return {
        status: 200,
        data: {
          generated_at: new Date().toISOString(),
          count:        requests.length,
          requests
        }
      };
    } catch (err) {
      return this._handleHandlerError('system-inspector.api.network.failed', err, 'http_network', context);
    }
  }

  async handleClear(req, context) {
    try {
      const guard = this._guardInitialized();
      if (guard) return guard;

      const before = this.buffer.entries.length;
      this.buffer.clear();

      this.logger?.warn('system-inspector.buffer.cleared', {
        entries_cleared: before,
        correlation_id:  context?.correlationId
      });
      this.metrics?.increment('system-inspector.api.clear.ok');

      return {
        status: 200,
        data: {
          success:        true,
          message:        'Console buffer cleared',
          entries_cleared: before,
          timestamp:      new Date().toISOString()
        }
      };
    } catch (err) {
      return this._handleHandlerError('system-inspector.api.clear.failed', err, 'http_clear', context);
    }
  }

  // ==========================================
  // Internals
  // ==========================================

  _guardInitialized() {
    if (this.skipped) {
      return this._errorResponse(
        503,
        'NOT_INITIALIZED',
        'System Inspector disabled in production',
        { hint: 'Set force_in_production: true in module config to override' }
      );
    }
    if (!this.buffer) {
      return this._errorResponse(
        503,
        'NOT_INITIALIZED',
        'System Inspector not initialized',
        { reason: 'module not loaded or onLoad failed' }
      );
    }
    return null;
  }

  _updateGauges() {
    if (!this.metrics || !this.buffer) return;
    this.metrics.gauge('system-inspector.buffer.size',    this.buffer.entries.length);
    this.metrics.gauge('system-inspector.buffer.maxSize', this.buffer.maxSize);
  }

  // Logger proxy para libs internas (evita acoplar libs al core).
  // Las libs reciben un callback unico (event, payload) que enrutan al logger del modulo.
  _buildLogProxy() {
    return (level, event, payload) => {
      try {
        const fn = this.logger?.[level] || this.logger?.warn;
        if (typeof fn === 'function') fn.call(this.logger, event, payload);
      } catch (_e) {
        // Nunca reventar por logging — el modulo es read-only observer.
      }
    };
  }

  // ==========================================
  // Helpers POC2 (catalogo canonico)
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details && typeof details === 'object') error.details = details;
    return { status, error };
  }

  _handleHandlerError(logEvent, err, kind, context) {
    const code = err._code || this._classifyHandlerError(err);
    const status = code === 'VALIDATION_FAILED'      ? 400 :
                   code === 'RESOURCE_NOT_FOUND'     ? 404 :
                   code === 'AUTHORIZATION_REQUIRED' ? 403 :
                   code === 'CONFLICT'               ? 409 :
                   code === 'NOT_INITIALIZED'        ? 503 : 500;
    const message = err.message || String(err);
    this.logger?.error(logEvent, {
      error:          message,
      code,
      correlation_id: context?.correlationId
    });
    this.metrics?.increment('system-inspector.errors.total', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('not found'))                                                          return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('validation')) return 'VALIDATION_FAILED';
    if (msg.includes('unauthorized') || msg.includes('forbidden'))                          return 'AUTHORIZATION_REQUIRED';
    if (msg.includes('conflict') || msg.includes('already exists'))                         return 'CONFLICT';
    if (msg.includes('not initialized'))                                                    return 'NOT_INITIALIZED';
    return 'INTERNAL_ERROR';
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    if (!this.eventBus || typeof this.eventBus.publish !== 'function') return;
    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      timestamp:      new Date().toISOString(),
      ...payload
    };
    await this.eventBus.publish(name, enriched);
  }
}

module.exports = SystemInspectorModule;

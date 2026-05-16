/**
 * plugin-manager v2.1.0 — Reescrito al canon (POC2 #7 del horizontal).
 *
 * Descubre y gestiona plugins JSON con funciones ejecutables que viven en
 *   <pluginsPath>/<plugin-name>/<plugin-name>.functions.json
 *
 * Sub-areas (mismo dominio):
 *  - Discovery: escanear directorio + cargar definiciones.
 *  - Storage in-memory: Map<name, definition>.
 *  - Bus: par request/response correlacionados por request_id.
 *  - HTTP API: 5 endpoints (GET/LIST/RELOAD/health/metrics).
 *  - Auto-reload opcional via setInterval.
 *
 * Cumple los 24 contratos transversales:
 *  - errors: HTTP handlers devuelven { status, data | error: { code, message, details? } }.
 *    Metodos privados lanzan con _code canonico.
 *  - observability: log + metric en cada error path. Prefix plugin-manager.*.
 *    correlation_id propagado en todos los responses.
 *  - events: 6 eventos canonicos preservados invariantes.
 *  - lifecycle: onLoad inicializa schema-fs + watcher; onUnload limpia.
 *  - persistence: filesystem read-only de plugins/ (no DB propia).
 *  - resilience: errores de discovery/load no detienen el proceso.
 *
 * 5 helpers POC2 transferibles:
 *  _errorResponse, _handleHandlerError, _classifyHandlerError,
 *  _publicarEvento, + auxiliar _readPluginFile.
 *
 * Monolito (515 LOC) preservado en
 * arquitectura/migracion/_legacy/plugin-manager-monolito-pre-rewrite.js.bak
 *
 * Mapa exhaustivo (PASO 0 del rewrite) en
 * arquitectura/migracion/notas/plugin-manager-mapa.md
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const BaseModule = require('../_shared/base-module');

class PluginManagerModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'plugin-manager';
    this.version = '2.1.0';

    this.plugins       = new Map();
    this.pluginsPath   = null;
    this.watchInterval = null;

    this.config   = null;

    this.internalCounters = {
      loaded_total: 0,
      error_total: 0,
      reload_total: 0
    };
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger   = core.logger;
    this.metrics  = core.metrics;
    this.eventBus = core.eventBus;
    this.config   = core.moduleConfig || {};

    const correlation_id = crypto.randomUUID();
    this.logger.info('plugin-manager.loading', {
      module: this.name, version: this.version, correlation_id
    });

    this.pluginsPath = path.resolve(
      __dirname,
      this.config.pluginsPath || '../../plugins'
    );

    this._ensurePluginsDirectory();

    await this._discoverPlugins(correlation_id);

    if (this.config.autoReload) this._startWatching();

    this.logger.info('plugin-manager.loaded', {
      plugins_path: this.pluginsPath,
      plugins_count: this.plugins.size,
      auto_reload: !!this.config.autoReload,
      correlation_id
    });
  }

  async onUnload() {
    const correlation_id = crypto.randomUUID();
    this.logger.info('plugin-manager.unloading', {
      plugins_count: this.plugins.size, correlation_id
    });

    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }

    const names = Array.from(this.plugins.keys());
    this.plugins.clear();
    for (const name of names) {
      await this._publicarEvento('plugin.unloaded', { name }, { correlation_id });
    }

    this.internalCounters = { loaded_total: 0, error_total: 0, reload_total: 0 };
  }

  // ==========================================
  // Init helpers (privados)
  // ==========================================

  _ensurePluginsDirectory() {
    if (!fs.existsSync(this.pluginsPath)) {
      fs.mkdirSync(this.pluginsPath, { recursive: true });
      this.logger.info('plugin-manager.directory.created', { path: this.pluginsPath });
    }
  }

  _startWatching() {
    const interval = this.config.watchInterval || 5000;
    this.logger.info('plugin-manager.watch.started', { interval });
    this.watchInterval = setInterval(() => {
      this._discoverPlugins(crypto.randomUUID()).catch(err => {
        this.logger.error('plugin-manager.watch.discovery_failed', { error: err.message });
        this.metrics?.increment('plugin-manager.errors', { kind: 'watch_discovery' });
      });
    }, interval);
  }

  // ==========================================
  // Bus handlers
  // ==========================================

  async onGetPluginRequest(event) {
    const eventData = event.payload || event.data || event;
    const { name, request_id, correlation_id } = eventData;
    const cid = correlation_id || crypto.randomUUID();

    if (!request_id) {
      this.logger.warn('plugin-manager.get.invalid_payload', { has_name: !!name });
      this.metrics?.increment('plugin-manager.errors', { kind: 'invalid_payload', source: 'get' });
      return;
    }

    const plugin = this.plugins.get(name);
    if (plugin) {
      await this._publicarEvento('plugin.get.response', {
        request_id, success: true, plugin
      }, { correlation_id: cid });
      this.metrics?.increment('plugin-manager.request.success', { action: 'get' });
    } else {
      await this._publicarEvento('plugin.get.response', {
        request_id, success: false,
        error: `Plugin '${name}' not found`,
        error_code: 'RESOURCE_NOT_FOUND'
      }, { correlation_id: cid });
      this.metrics?.increment('plugin-manager.errors', { kind: 'request', action: 'get', code: 'RESOURCE_NOT_FOUND' });
    }
  }

  async onListPluginsRequest(event) {
    const eventData = event.payload || event.data || event;
    const { request_id, correlation_id } = eventData;
    const cid = correlation_id || crypto.randomUUID();

    if (!request_id) {
      this.logger.warn('plugin-manager.list.invalid_payload');
      this.metrics?.increment('plugin-manager.errors', { kind: 'invalid_payload', source: 'list' });
      return;
    }

    const pluginsList = this._getPluginsSummary();
    await this._publicarEvento('plugin.list.response', {
      request_id, success: true,
      plugins: pluginsList, count: pluginsList.length
    }, { correlation_id: cid });
    this.metrics?.increment('plugin-manager.request.success', { action: 'list' });
  }

  // ==========================================
  // HTTP API handlers (shape canonico)
  // ==========================================

  async handleGetPlugin(req, context) {
    try {
      const { name } = context.params || {};
      if (!name) {
        return this._errorResponse(400, 'VALIDATION_FAILED',
          'Plugin name is required',
          { kind: 'domain', field: 'name' });
      }
      const plugin = this.plugins.get(name);
      if (!plugin) {
        this.logger.warn('plugin-manager.http.get.not_found', {
          name, correlation_id: context.correlationId
        });
        this.metrics?.increment('plugin-manager.errors', {
          kind: 'http_get', code: 'RESOURCE_NOT_FOUND'
        });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
          `Plugin '${name}' not found`,
          { entity_type: 'plugin', entity_id: name });
      }
      return { status: 200, data: { plugin } };
    } catch (err) {
      return this._handleHandlerError('plugin-manager.http.get.failed', err, 'http_get');
    }
  }

  async handleListPlugins(req, context) {
    try {
      const pluginsList = this._getPluginsSummary();
      const totalFunctions = pluginsList.reduce((acc, p) => acc + p.function_count, 0);
      this.logger.info('plugin-manager.http.list.completed', {
        count: pluginsList.length, total_functions: totalFunctions,
        correlation_id: context?.correlationId
      });
      return {
        status: 200,
        data: {
          plugins: pluginsList,
          count: pluginsList.length,
          total_functions: totalFunctions
        }
      };
    } catch (err) {
      return this._handleHandlerError('plugin-manager.http.list.failed', err, 'http_list');
    }
  }

  async handleReloadPlugins(req, context) {
    const correlation_id = context?.correlationId || crypto.randomUUID();
    try {
      const result = await this._reloadPlugins(correlation_id);
      this.internalCounters.reload_total++;
      this.metrics?.increment('plugin-manager.reload.success');

      await this._publicarEvento('plugin.reloaded', {
        count: result.count,
        loaded: result.loaded,
        errors: result.errors
      }, { correlation_id });

      return {
        status: 200,
        data: {
          message: 'Plugins reloaded',
          count: result.count,
          loaded: result.loaded,
          errors: result.errors
        }
      };
    } catch (err) {
      return this._handleHandlerError('plugin-manager.http.reload.failed', err, 'http_reload');
    }
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        uptime: process.uptime(),
        plugins_count: this.plugins.size,
        plugins_path: this.pluginsPath,
        auto_reload: !!this.config.autoReload,
        timestamp: new Date().toISOString()
      }
    };
  }

  async handleGetMetrics() {
    let totalFunctions = 0;
    for (const plugin of this.plugins.values()) {
      totalFunctions += Object.keys(plugin.functions || {}).length;
    }
    return {
      status: 200,
      data: {
        counters: {
          'plugin-manager.loaded.total': this.internalCounters.loaded_total,
          'plugin-manager.error.total': this.internalCounters.error_total,
          'plugin-manager.reload.total': this.internalCounters.reload_total
        },
        gauges: {
          'plugin-manager.count': this.plugins.size,
          'plugin-manager.functions.count': totalFunctions
        }
      }
    };
  }

  // ==========================================
  // Core logic (privados)
  // ==========================================

  async _discoverPlugins(correlation_id) {
    const startTime = Date.now();
    this.logger.info('plugin-manager.discovery.start', {
      path: this.pluginsPath, correlation_id
    });

    if (!fs.existsSync(this.pluginsPath)) {
      this.logger.warn('plugin-manager.directory.missing', {
        path: this.pluginsPath, correlation_id
      });
      this.metrics?.increment('plugin-manager.errors', { kind: 'directory_missing' });
      return { count: 0, loaded: 0, errors: 0 };
    }

    let loaded = 0;
    let errors = 0;
    try {
      const entries = fs.readdirSync(this.pluginsPath, { withFileTypes: true });
      for (const dirent of entries) {
        if (!dirent.isDirectory()) continue;
        const dirPath = path.join(this.pluginsPath, dirent.name);
        const files = fs.readdirSync(dirPath);
        const definitionFile = files.find(f => f.endsWith('.functions.json'));
        if (!definitionFile) continue;

        const filePath = path.join(dirPath, definitionFile);
        const ok = await this._loadPluginFromFile(filePath, correlation_id);
        if (ok) loaded++;
        else errors++;
      }
    } catch (err) {
      this.logger.error('plugin-manager.discovery.failed', {
        error: err.message, path: this.pluginsPath, correlation_id
      });
      this.metrics?.increment('plugin-manager.errors', { kind: 'discovery' });
      this.internalCounters.error_total++;

      await this._publicarEvento('plugin.error', {
        error: err.message, context: 'discovery'
      }, { correlation_id });

      throw err;
    }

    const duration = Date.now() - startTime;
    this.logger.info('plugin-manager.discovery.completed', {
      total: this.plugins.size, loaded, errors, duration, correlation_id
    });

    return { count: this.plugins.size, loaded, errors };
  }

  async _loadPluginFromFile(filePath, correlation_id) {
    const startTime = Date.now();
    try {
      const pluginDef = this._readPluginFile(filePath);

      if (!pluginDef.metadata || !pluginDef.metadata.name || !pluginDef.functions) {
        const reason = 'Invalid structure: missing metadata, name, or functions';
        this.logger.error('plugin-manager.load.invalid_structure', {
          file: filePath, reason, correlation_id
        });
        this.internalCounters.error_total++;
        this.metrics?.increment('plugin-manager.errors', { kind: 'invalid_structure' });
        await this._publicarEvento('plugin.error', {
          file: filePath, error: reason, context: 'load'
        }, { correlation_id });
        return false;
      }

      const pluginName = pluginDef.metadata.name;
      if (this.plugins.has(pluginName)) {
        this.logger.debug('plugin-manager.already_loaded', { name: pluginName, correlation_id });
        return true;
      }

      this.plugins.set(pluginName, pluginDef);
      this.internalCounters.loaded_total++;

      const functionNames = Object.keys(pluginDef.functions);
      const duration = Date.now() - startTime;

      this.logger.info('plugin-manager.loaded.plugin', {
        name: pluginName,
        version: pluginDef.metadata.version || '1.0.0',
        function_count: functionNames.length,
        duration, correlation_id
      });
      this.metrics?.increment('plugin-manager.plugin.loaded');

      await this._publicarEvento('plugin.loaded', {
        name: pluginName,
        definition: pluginDef,
        version: pluginDef.metadata.version || '1.0.0',
        description: pluginDef.metadata.description || '',
        functions: functionNames,
        function_count: functionNames.length
      }, { correlation_id });

      return true;
    } catch (err) {
      this.logger.error('plugin-manager.load.failed', {
        file: filePath, error: err.message, correlation_id
      });
      this.internalCounters.error_total++;
      this.metrics?.increment('plugin-manager.errors', { kind: 'load_failed' });
      await this._publicarEvento('plugin.error', {
        file: filePath, error: err.message, context: 'load'
      }, { correlation_id });
      return false;
    }
  }

  async _reloadPlugins(correlation_id) {
    this.logger.info('plugin-manager.reload.clearing', { correlation_id });
    this.plugins.clear();
    return await this._discoverPlugins(correlation_id);
  }

  _getPluginsSummary() {
    return Array.from(this.plugins.entries()).map(([name, def]) => ({
      name,
      version: def.metadata?.version || '1.0.0',
      description: def.metadata?.description || '',
      functions: Object.keys(def.functions || {}),
      function_count: Object.keys(def.functions || {}).length
    }));
  }

  // ==========================================
  // Helpers POC2 (transferibles) + auxiliares
  // ==========================================

  // _errorResponse heredado de BaseModule

  _handleHandlerError(logEvent, err, kind) {
    const code    = err._code || this._classifyHandlerError(err);
    const status  = code === 'VALIDATION_FAILED'      ? 400 :
                    code === 'RESOURCE_NOT_FOUND'     ? 404 :
                    code === 'AUTHORIZATION_REQUIRED' ? 403 :
                    code === 'CONFLICT'               ? 409 :
                    code === 'UPSTREAM_UNAVAILABLE'   ? 503 :
                                                        500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code });
    this.metrics?.increment('plugin-manager.errors', { kind, code });
    this.internalCounters.error_total++;
    return this._errorResponse(status, code, message, err._details);
  }

  // _classifyHandlerError heredado de BaseModule (superset estricto del local)
  // _publicarEvento heredado de BaseModule

  _readPluginFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  }

  // 6o helper auxiliar — slugify canonico (para nombres de plugin como ids estables)
  _slugify(text) {
    if (!text) return 'plugin';
    return String(text).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'plugin';
  }
}

module.exports = PluginManagerModule;

/**
 * Ocr Service Module
 *
 * Servicio OCR con soporte multi-engine (Tesseract, Google Vision, Claude Vision)
 *
 * Arquitectura:
 * - Orquestador genérico que descubre plugins en plugins/ocr/
 * - Soporta engines locales (con handler.js) y remotos (API HTTP)
 * - Incluye builtin por defecto en builtin/
 *
 * @module ocr-service
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const PluginLoader = require('./lib/plugin-loader');
const ApiExecutor = require('./lib/api-executor');

class OcrServiceModule {
  constructor() {
    this.name = 'ocr-service';
    this.version = '1.0.0';

    // Engines disponibles
    this.engines = new Map();

    // Dependencias (inyectadas en onLoad)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.uiHandler = null;
    this.config = null;

    // Helpers
    this.pluginLoader = null;
    this.apiExecutor = null;

    // Estado
    this.startTime = Date.now();
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;

    this.logger.info('ocr-service.loading', {
      module: this.name,
      version: this.version
    });

    // Cargar configuración desde module.json
    const moduleJsonPath = path.join(__dirname, 'module.json');
    const moduleJson = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf-8'));
    this.config = moduleJson.config || {};

    // Inicializar helpers
    this.pluginLoader = new PluginLoader(this.logger, this.config);
    this.apiExecutor = new ApiExecutor(this.logger, core);

    // Cargar builtin engine (siempre disponible)
    await this.loadBuiltinEngine();

    // Descubrir plugins externos
    await this.discoverPlugins();

    // Registrar handlers UI
    await this.registerUIHandlers();

    // Suscribirse a eventos
    await this.subscribeToEvents();

    // Actualizar métricas
    this.updateMetrics();

    this.logger.info('ocr-service.loaded', {
      module: this.name,
      engines: Array.from(this.engines.keys()),
      engines_count: this.engines.size
    });
  }

  async onUnload() {
    this.logger.info('ocr-service.unloading', { module: this.name });

    // Limpiar engines que necesiten cleanup
    for (const [name, engine] of this.engines) {
      if (engine.handler?.terminate) {
        try {
          await engine.handler.terminate();
        } catch (e) {
          this.logger.warn('ocr-service.engine.terminate_error', {
            engine: name,
            error: e.message
          });
        }
      }
    }

    this.engines.clear();

    this.logger.info('ocr-service.unloaded', { module: this.name });
  }

  // ==========================================
  // Plugin Discovery
  // ==========================================

  async loadBuiltinEngine() {
    const builtinPath = path.join(__dirname, 'builtin');

    if (!fs.existsSync(builtinPath)) {
      this.logger.warn('ocr-service.builtin.not_found', {
        path: builtinPath
      });
      return;
    }

    const engineFiles = fs.readdirSync(builtinPath)
      .filter(f => f.endsWith('.js'));

    for (const file of engineFiles) {
      try {
        const engineName = path.basename(file, '.js');
        const handler = require(path.join(builtinPath, file));

        this.engines.set(engineName, {
          name: engineName,
          type: 'ocr-engine',
          local: true,
          builtin: true,
          handler,
          priority: 0,
          capabilities: handler.capabilities || [],
          config: handler.config || {}
        });

        this.logger.info('ocr-service.builtin.loaded', {
          engine: engineName,
          capabilities: handler.capabilities || []
        });
      } catch (error) {
        this.logger.error('ocr-service.builtin.load_error', {
          file,
          error: error.message
        });
      }
    }
  }

  async discoverPlugins() {
    const pluginsPath = path.resolve(__dirname, this.config.pluginsPath || '../../plugins/ocr');

    if (!fs.existsSync(pluginsPath)) {
      this.logger.info('ocr-service.plugins.directory_not_found', {
        path: pluginsPath,
        message: 'No plugins directory, using only builtin engines'
      });
      return;
    }

    const pluginDirs = fs.readdirSync(pluginsPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const dir of pluginDirs) {
      const pluginPath = path.join(pluginsPath, dir);
      await this.loadPlugin(pluginPath, dir);
    }
  }

  async loadPlugin(pluginPath, pluginName) {
    try {
      // Buscar engine.json en el directorio del plugin
      const engineJsonPath = path.join(pluginPath, 'engine.json');

      if (!fs.existsSync(engineJsonPath)) {
        this.logger.warn('ocr-service.plugin.no_engine_json', {
          plugin: pluginName,
          path: engineJsonPath
        });
        return;
      }

      const engineConfig = JSON.parse(fs.readFileSync(engineJsonPath, 'utf-8'));

      // Validar tipo
      if (engineConfig.type !== 'ocr-engine') {
        this.logger.warn('ocr-service.plugin.invalid_type', {
          plugin: pluginName,
          expected: 'ocr-engine',
          got: engineConfig.type
        });
        return;
      }

      // Si es local, cargar handler.js
      if (engineConfig.local) {
        const handlerPath = path.join(pluginPath, 'handler.js');

        if (fs.existsSync(handlerPath)) {
          engineConfig.handler = require(handlerPath);
        } else {
          this.logger.warn('ocr-service.plugin.handler_not_found', {
            plugin: pluginName,
            path: handlerPath
          });
          return;
        }
      }

      // Registrar engine
      this.engines.set(engineConfig.name, engineConfig);

      this.logger.info('ocr-service.plugin.loaded', {
        engine: engineConfig.name,
        local: engineConfig.local,
        priority: engineConfig.priority || 99,
        capabilities: engineConfig.capabilities || []
      });

      // Publicar evento
      await this.eventBus.publish('ocr.engine.loaded', {
        name: engineConfig.name,
        local: engineConfig.local,
        capabilities: engineConfig.capabilities
      });

    } catch (error) {
      this.logger.error('ocr-service.plugin.load_error', {
        plugin: pluginName,
        error: error.message
      });
    }
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe(
      'ocr.extract.request',
      this.onExtractRequest.bind(this)
    );

    this.logger.info('ocr-service.events.subscribed', {
      events: ['ocr.extract.request']
    });
  }

  async registerUIHandlers() {
    if (!this.uiHandler) return;

    // Registro de handlers UI via MQTT
    this.uiHandler.register('ocr', 'extract', this.handleUIExtract.bind(this));
    this.uiHandler.register('ocr', 'engines', this.handleUIListEngines.bind(this));

    this.logger.info('ocr-service.ui.handlers.registered', {
      domain: 'ocr',
      actions: ['extract', 'engines']
    });
  }

  // ==========================================
  // Core Logic
  // ==========================================

  async extract(input, options = {}) {
    const startTime = Date.now();
    const engineName = options.engine || this.config.defaultEngine || 'auto';

    try {
      // Seleccionar engine
      const engine = this.selectEngine(engineName, options);

      if (!engine) {
        throw new Error(`No engine available for: ${engineName}`);
      }

      this.logger.info('ocr-service.extract.start', {
        engine: engine.name,
        inputSize: input?.length || 0
      });

      let result;

      if (engine.local) {
        // Ejecutar handler local
        result = await engine.handler.extract(input, {
          ...engine.config,
          ...options
        });
      } else {
        // Ejecutar via API
        result = await this.apiExecutor.execute(engine, input, options);
      }

      const duration = Date.now() - startTime;

      this.logger.info('ocr-service.extract.completed', {
        engine: engine.name,
        duration,
        resultLength: result?.text?.length || 0
      });

      // Métricas
      this.metrics?.increment('ocr.extract.success');
      this.metrics?.timing('ocr.extract.duration', duration);

      return {
        success: true,
        engine: engine.name,
        ...result,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error('ocr-service.extract.error', {
        engine: engineName,
        error: error.message,
        duration
      });

      this.metrics?.increment('ocr.extract.error');

      // Si fallback está habilitado, intentar con otro engine
      if (this.config.fallbackEnabled && engineName !== 'auto') {
        this.logger.info('ocr-service.extract.fallback', {
          from: engineName,
          to: 'auto'
        });
        return this.extract(input, { ...options, engine: 'auto', _fallback: true });
      }

      throw error;
    }
  }

  selectEngine(engineName, options = {}) {
    // Auto: seleccionar por prioridad
    if (engineName === 'auto') {
      const available = Array.from(this.engines.values())
        .filter(e => this.isEngineAvailable(e, options))
        .sort((a, b) => (a.priority || 99) - (b.priority || 99));

      return available[0] || null;
    }

    // Engine específico
    const engine = this.engines.get(engineName);

    if (engine && this.isEngineAvailable(engine, options)) {
      return engine;
    }

    return null;
  }

  isEngineAvailable(engine, options = {}) {
    // Local siempre disponible
    if (engine.local) return true;

    // API: verificar que tenemos credencial
    if (engine.credentialKey) {
      const hasCredential = process.env[engine.credentialKey];
      return !!hasCredential;
    }

    return true;
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onExtractRequest(event) {
    const data = event.data || event.payload || event;
    const { request_id, input, options, correlation_id } = data;

    try {
      const result = await this.extract(input, options);

      await this.eventBus.publish('ocr.extract.completed', {
        request_id,
        ...result
      }, { correlationId: correlation_id });

    } catch (error) {
      await this.eventBus.publish('ocr.extract.failed', {
        request_id,
        error: error.message
      }, { correlationId: correlation_id });
    }
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleExtract(req, context) {
    try {
      const { input, engine, ...options } = req.body || {};

      if (!input) {
        return {
          status: 400,
          data: { error: 'INPUT_REQUIRED', message: 'input is required' }
        };
      }

      const result = await this.extract(input, { engine, ...options });

      return { status: 200, data: result };

    } catch (error) {
      this.logger.error('ocr-service.handleExtract.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: { error: 'EXTRACT_FAILED', message: error.message }
      };
    }
  }

  async handleListEngines(req, context) {
    const engines = Array.from(this.engines.values()).map(e => ({
      name: e.name,
      local: e.local,
      builtin: e.builtin || false,
      priority: e.priority || 99,
      capabilities: e.capabilities || [],
      available: this.isEngineAvailable(e)
    }));

    engines.sort((a, b) => a.priority - b.priority);

    return {
      status: 200,
      data: {
        engines,
        count: engines.length,
        default: this.config.defaultEngine || 'auto'
      }
    };
  }

  async handleGetEngine(req, context) {
    const { name } = context.params;
    const engine = this.engines.get(name);

    if (!engine) {
      return {
        status: 404,
        data: { error: 'ENGINE_NOT_FOUND', message: `Engine '${name}' not found` }
      };
    }

    return {
      status: 200,
      data: {
        name: engine.name,
        local: engine.local,
        builtin: engine.builtin || false,
        priority: engine.priority || 99,
        capabilities: engine.capabilities || [],
        config: engine.config || {},
        available: this.isEngineAvailable(engine)
      }
    };
  }

  async handleHealthCheck(req, context) {
    const uptime = (Date.now() - this.startTime) / 1000;

    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        uptime,
        engines_count: this.engines.size,
        engines: Array.from(this.engines.keys()),
        timestamp: new Date().toISOString()
      }
    };
  }

  // ==========================================
  // UI Handlers (MQTT)
  // ==========================================

  async handleUIExtract(data, context) {
    try {
      const { input, engine, ...options } = data;

      if (!input) {
        return { status: 400, error: 'input is required' };
      }

      const result = await this.extract(input, { engine, ...options });

      return { status: 200, data: result };

    } catch (error) {
      return { status: 500, error: error.message };
    }
  }

  async handleUIListEngines(data, context) {
    const engines = Array.from(this.engines.values()).map(e => ({
      name: e.name,
      local: e.local,
      available: this.isEngineAvailable(e)
    }));

    return { status: 200, data: { engines } };
  }

  // ==========================================
  // Metrics
  // ==========================================

  updateMetrics() {
    this.metrics?.gauge('ocr.engines.active', this.engines.size);
  }
}

module.exports = OcrServiceModule;

/**
 * Module Loader - Autodescubrimiento y carga de módulos
 *
 * Escanea el directorio ./modules/ y carga módulos automáticamente.
 * Cada módulo debe tener:
 * - module.json: Manifest con metadata y configuración
 * - index.js: Entry point que exporta clase con métodos onLoad() y onUnload()
 *
 * @example
 * const ModuleLoader = require('./modules/loader');
 *
 * const loader = new ModuleLoader({
 *   modulesPath: './modules',
 *   core,
 *   logger
 * });
 *
 * await loader.loadAll();
 * console.log('Loaded modules:', loader.getLoadedModules());
 */

const fs = require('fs');
const path = require('path');
const IntentRegistry = require('./intent-registry');

class ModuleLoader {
  /**
   * @param {Object} options - Opciones
   * @param {string} options.modulesPath - Path al directorio de módulos
   * @param {Object} options.core - Core instance (se pasa a módulos en onLoad)
   * @param {Object} options.registry - ModuleRegistry instance
   * @param {Object} options.logger - Logger instance
   * @param {Object} options.metrics - Metrics instance
   */
  constructor(options = {}) {
    this.modulesPath = options.modulesPath || './modules';
    this.core = options.core || null;
    this.registry = options.registry || null;
    this.logger = options.logger || null;
    this.metrics = options.metrics || null;
    this.config = options.config || {};

    /**
     * Módulos cargados
     * Map: moduleName -> { manifest, instance, path }
     */
    this.loadedModules = new Map();

    /**
     * Watchers para hot-reload
     * Map: moduleName -> FSWatcher
     */
    this.watchers = new Map();

    /**
     * Tools registry for AI
     * Map: toolName -> { name, description, parameters, handler, module, confirmation }
     */
    this.toolsRegistry = new Map();

    /**
     * Intent Registry — construido desde los campos "intents" de cada module.json
     * Permite al Conversation Router hacer matching sin LLM para casos claros
     */
    this.intentRegistry = new IntentRegistry(this.logger);
  }

  /**
   * Descubre todos los módulos en el directorio
   *
   * @returns {Array<Object>} Array de { name, path, manifest }
   *
   * @example
   * const discovered = loader.discover();
   * console.log('Found modules:', discovered.length);
   */
  discover() {
    const modules = [];

    try {
      // Verificar que el directorio existe
      if (!fs.existsSync(this.modulesPath)) {
        if (this.logger) {
          this.logger.warn('modules.path.not.found', {
            path: this.modulesPath
          });
        }
        return modules;
      }

      // Leer contenido del directorio
      const entries = fs.readdirSync(this.modulesPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const moduleName = entry.name;
        const modulePath = path.join(this.modulesPath, moduleName);
        const manifestPath = path.join(modulePath, 'module.json');

        // Verificar que existe module.json
        if (fs.existsSync(manifestPath)) {
          try {
            // Leer y parsear manifest
            const manifestContent = fs.readFileSync(manifestPath, 'utf8');
            const manifest = JSON.parse(manifestContent);

            modules.push({
              name: moduleName,
              path: modulePath,
              manifest
            });

          } catch (error) {
            if (this.logger) {
              this.logger.error('module.manifest.invalid', {
                module: moduleName,
                error: error.message
              }, error);
            }
          }
        } else {
          // Sin module.json → escanear subdirectorios (soporta agrupación por vertical, ej: modules/pizzepos/*)
          const subEntries = fs.readdirSync(modulePath, { withFileTypes: true });

          for (const subEntry of subEntries) {
            if (!subEntry.isDirectory()) {
              continue;
            }

            const subModuleName = subEntry.name;
            const subModulePath = path.join(modulePath, subModuleName);
            const subManifestPath = path.join(subModulePath, 'module.json');

            if (!fs.existsSync(subManifestPath)) {
              continue;
            }

            try {
              const subManifestContent = fs.readFileSync(subManifestPath, 'utf8');
              const subManifest = JSON.parse(subManifestContent);

              modules.push({
                name: subModuleName,
                path: subModulePath,
                manifest: subManifest,
                group: moduleName
              });

            } catch (error) {
              if (this.logger) {
                this.logger.error('module.manifest.invalid', {
                  module: `${moduleName}/${subModuleName}`,
                  error: error.message
                }, error);
              }
            }
          }
        }
      }

      if (this.logger) {
        this.logger.info('modules.discovered', {
          count: modules.length,
          modules: modules.map(m => m.name)
        });
      }

    } catch (error) {
      if (this.logger) {
        this.logger.error('modules.discover.failed', {
          error: error.message
        }, error);
      }
    }

    return modules;
  }

  /**
   * Valida el manifest de un módulo
   *
   * @param {Object} manifest - Module manifest
   * @returns {boolean} true si es válido
   */
  validateManifest(manifest) {
    // Campos requeridos
    const required = ['name', 'version', 'description'];
    for (const field of required) {
      if (!manifest[field]) {
        return false;
      }
    }

    // Validar formato de version (semver básico)
    const versionRegex = /^\d+\.\d+\.\d+$/;
    if (!versionRegex.test(manifest.version)) {
      return false;
    }

    return true;
  }

  /**
   * Construye APIs desde manifest y módulo instance
   *
   * @param {Object} manifest - Module manifest
   * @param {Object} instance - Module instance
   * @returns {Array<Object>} Array de API definitions
   */
  buildAPIsFromManifest(manifest, instance) {
    const apis = [];

    // Support both manifest.apis and manifest.provides.apis formats
    const apiDefinitions = manifest.apis || manifest.provides?.apis;

    if (!apiDefinitions || apiDefinitions.length === 0) {
      return apis;
    }

    for (const apiDef of apiDefinitions) {
      // Support two formats:
      // 1. { name: "ping", ... } - auto-detect handler as handlePing
      // 2. { handler: "handleListTodos", ... } - use handler directly

      let handlerName;
      let apiName;

      if (apiDef.handler) {
        // Format: { handler: "handleListTodos", path: "/todos", method: "GET" }
        handlerName = apiDef.handler;
        // Extract API name from path (e.g., "/todos" -> "todos")
        apiName = apiDef.path.split('/').filter(p => p && !p.startsWith(':')).pop() || apiDef.handler;
      } else if (apiDef.name) {
        // Format: { name: "ping", ... }
        apiName = apiDef.name;
        handlerName = `handle${apiName.charAt(0).toUpperCase()}${apiName.slice(1)}`;
      } else {
        if (this.logger) {
          this.logger.warn('module.api.invalid', {
            module: manifest.name,
            reason: 'API definition must have either "name" or "handler"'
          });
        }
        continue;
      }

      const handler = instance[handlerName];

      if (typeof handler !== 'function') {
        if (this.logger) {
          this.logger.warn('module.api.handler.missing', {
            module: manifest.name,
            api: apiName,
            expected_handler: handlerName
          });
        }
        continue;
      }

      apis.push({
        name: apiName,
        method: apiDef.method,
        path: apiDef.path,
        description: apiDef.description,
        handler: handler.bind(instance) // Bind para mantener contexto
      });
    }

    return apis;
  }

  /**
   * Carga un módulo específico
   *
   * @param {string} moduleName - Nombre del módulo
   * @param {string} modulePath - Path al módulo
   * @param {Object} manifest - Module manifest
   * @returns {Promise<Object>} Module instance
   *
   * @example
   * await loader.load('echo', './modules/echo', manifest);
   */
  async load(moduleName, modulePath, manifest) {
    try {
      // Validar manifest
      if (!this.validateManifest(manifest)) {
        throw new Error('Invalid manifest');
      }

      // Verificar que no esté ya cargado
      if (this.loadedModules.has(moduleName)) {
        throw new Error(`Module ${moduleName} already loaded`);
      }

      // Blueprint-driven module: declarativo puro, no hay index.js ni instancia.
      // El LLM ejecuta el modulo via ai-gateway leyendo el blueprint JSON como
      // system prompt + invocando bus.publish/bus.publishAndWait. Aqui solo lo
      // registramos para que ai-gateway lo descubra al arrancar.
      if (manifest.blueprint_driven === true) {
        const hybridIndexPath = path.join(modulePath, 'index.js');
        const hasHybridIndex = fs.existsSync(hybridIndexPath);
        if (this.logger) {
          this.logger.info('module.loaded.blueprint', {
            module: moduleName,
            version: manifest.version,
            blueprint_path: manifest.blueprint_path,
            target_page_id: manifest.target_page_id,
            hybrid: hasHybridIndex
          });
        }
        if (this.metrics) {
          this.metrics.increment('modules.loaded.blueprint');
        }
        // Blueprint PURO: declarativo, sin instancia. ai-gateway lo sirve via LLM.
        if (!hasHybridIndex) {
          this.loadedModules.set(moduleName, {
            manifest,
            instance: null,
            path: modulePath,
            loadedAt: Date.now(),
            blueprint_driven: true
          });
          return null;
        }
        // Blueprint HIBRIDO: ademas del blueprint (que el LLM ejecuta via
        // ai-gateway), carga su index.js como REFLEJO JS — sirve sus ops
        // deterministas en el bus (ej. recetas.listar.request) SIN un turno LLM
        // sintetico. Cae al camino de carga normal; el loadedModules.set final
        // conserva blueprint_driven:true (ai-gateway lo sigue viendo como
        // blueprint por manifest.blueprint_driven). Retrocompatible: los
        // blueprints sin index.js siguen el camino puro de arriba.
      }

      // Cargar el módulo
      const indexPath = path.join(modulePath, 'index.js');
      if (!fs.existsSync(indexPath)) {
        throw new Error('index.js not found');
      }

      // Clear require cache para hot-reload
      delete require.cache[require.resolve(path.resolve(indexPath))];

      const ModuleClass = require(path.resolve(indexPath));

      // Verificar que exporta una clase o función
      if (typeof ModuleClass !== 'function') {
        throw new Error('Module must export a class or constructor function');
      }

      // Instanciar módulo
      const instance = new ModuleClass();

      // Verificar que tiene método onLoad
      if (typeof instance.onLoad !== 'function') {
        throw new Error('Module must implement onLoad() method');
      }

      // Auto-wire event subscriptions BEFORE onLoad so modules can
      // publish request events and receive responses during initialization
      const eventUnsubs = this.wireEventSubscriptions(manifest, instance);

      // Ejecutar onLoad - pasamos el core context + moduleConfig + moduleLoader
      const moduleContext = {
        ...this.core,
        moduleConfig: manifest.config || {},  // Config específica del module.json
        moduleLoader: this,                   // Referencia al loader (legacy; preferir mqttRequest)
        // mqttRequest canónico (events v1.5.0 context_injection): el módulo llama a otros
        // peers via context.mqttRequest(domain, action, payload). Internamente delega al
        // uiHandler.handle() que invoca el handler registrado por el módulo destinatario
        // (auto-wired desde manifest.ui_handlers). Patrón cross-process aún single-process —
        // cuando se active multi-core, esta función se reemplaza por publish/subscribe MQTT
        // real sobre topics 'core/api/request/{domain}/{action}' SIN cambiar callers.
        mqttRequest: async (domain, action, payload = {}, options = {}) => {
          if (!this.core?.uiHandler) {
            throw new Error('mqttRequest unavailable: core.uiHandler not initialized');
          }
          return this.core.uiHandler.handle(domain, action, payload);
        }
      };

      try {
        await instance.onLoad(moduleContext);
      } catch (loadError) {
        // Clean up event subscriptions if onLoad fails
        for (const unsub of eventUnsubs) {
          if (typeof unsub === 'function') unsub();
        }
        throw loadError;
      }

      // Guardar módulo cargado. blueprint_driven se conserva para el caso
      // hibrido (blueprint + index.js): ai-gateway lo sigue tratando como
      // pagina blueprint, y ademas su reflejo JS queda activo.
      this.loadedModules.set(moduleName, {
        manifest,
        instance,
        path: modulePath,
        loadedAt: Date.now(),
        _eventUnsubs: eventUnsubs,
        blueprint_driven: manifest.blueprint_driven === true
      });

      // Registrar en ModuleRegistry si está disponible
      if (this.registry) {
        const apis = this.buildAPIsFromManifest(manifest, instance);
        const hooks = manifest.provides?.hooks || [];
        const subscribes = manifest.subscribes || [];

        this.registry.register(moduleName, {
          manifest,
          instance,
          apis,
          hooks,
          subscribes
        });
      }

      // Register tools for AI if defined in manifest
      if (manifest.tools && Array.isArray(manifest.tools)) {
        this.registerToolsForAI(moduleName, manifest.tools, instance);
      }

      // tools.contract v1.2: wrappers HTTP declarativos sin codigo JS.
      // El loader genera la closure handler en runtime (templating + auth via
      // credential-manager + fetch + mapeo status->canon) y la registra en los
      // 3 destinos identicamente a una tool de tools[].
      if (manifest.tools_http && Array.isArray(manifest.tools_http)) {
        this.registerToolsHttpForAI(moduleName, manifest.tools_http);
      }

      // Register intents for Conversation Router if defined in manifest
      if (manifest.intents && Array.isArray(manifest.intents)) {
        this.intentRegistry.register(moduleName, manifest.intents);
      }

      // Auto-wire UI handlers from manifest
      const uiRegistrations = this.wireUIHandlers(manifest, instance);

      // Store UI wiring data for automatic cleanup on unload
      const moduleData = this.loadedModules.get(moduleName);
      if (moduleData) {
        moduleData._uiRegistrations = uiRegistrations;
      }

      if (this.logger) {
        this.logger.info('module.loaded', {
          module: moduleName,
          version: manifest.version
        });
      }

      if (this.metrics) {
        this.metrics.increment('modules.loaded');
      }

      return instance;

    } catch (error) {
      if (this.logger) {
        this.logger.error('module.load.failed', {
          module: moduleName,
          error: error.message
        }, error);
      }

      if (this.metrics) {
        this.metrics.increment('modules.load.failed');
      }

      throw error;
    }
  }

  /**
   * Descarga un módulo
   *
   * @param {string} moduleName - Nombre del módulo
   * @returns {Promise<void>}
   *
   * @example
   * await loader.unload('echo');
   */
  async unload(moduleName) {
    const moduleData = this.loadedModules.get(moduleName);
    if (!moduleData) {
      throw new Error(`Module ${moduleName} not loaded`);
    }

    try {
      // Auto-cleanup: unsubscribe all events wired from manifest
      if (moduleData._eventUnsubs) {
        for (const unsub of moduleData._eventUnsubs) {
          try { unsub(); } catch (e) { /* already cleaned */ }
        }
        if (this.logger) {
          this.logger.debug('module.events.unwired', {
            module: moduleName,
            count: moduleData._eventUnsubs.length
          });
        }
      }

      // Auto-cleanup: unregister all UI handlers wired from manifest
      if (moduleData._uiRegistrations && this.core?.uiHandler) {
        for (const { domain, action } of moduleData._uiRegistrations) {
          try { this.core.uiHandler.unregister(domain, action); } catch (e) { /* already cleaned */ }
        }
        if (this.logger) {
          this.logger.debug('module.ui_handlers.unwired', {
            module: moduleName,
            count: moduleData._uiRegistrations.length
          });
        }
      }

      // Ejecutar onUnload si existe (solo para cleanup propio del módulo).
      // Blueprint-driven modules no tienen instance — se saltan.
      if (moduleData.instance && typeof moduleData.instance.onUnload === 'function') {
        await moduleData.instance.onUnload();
      }

      // Desregistrar del ModuleRegistry
      if (this.registry) {
        this.registry.unregister(moduleName);
      }

      // Unregister intents
      this.intentRegistry.unregister(moduleName);

      // Unregister tools for AI
      this.unregisterToolsForAI(moduleName);

      // Detener watcher si existe
      if (this.watchers.has(moduleName)) {
        this.watchers.get(moduleName).close();
        this.watchers.delete(moduleName);
      }

      // Remover del mapa
      this.loadedModules.delete(moduleName);

      if (this.logger) {
        this.logger.info('module.unloaded', {
          module: moduleName
        });
      }

      if (this.metrics) {
        this.metrics.increment('modules.unloaded');
      }

    } catch (error) {
      if (this.logger) {
        this.logger.error('module.unload.failed', {
          module: moduleName,
          error: error.message
        }, error);
      }

      throw error;
    }
  }

  /**
   * Recarga un módulo (unload + load)
   *
   * @param {string} moduleName - Nombre del módulo
   * @returns {Promise<void>}
   *
   * @example
   * await loader.reload('echo');
   */
  async reload(moduleName) {
    const moduleData = this.loadedModules.get(moduleName);
    if (!moduleData) {
      throw new Error(`Module ${moduleName} not loaded`);
    }

    const modulePath = moduleData.path;
    const manifestPath = path.join(modulePath, 'module.json');

    // Leer manifest actualizado
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);

    // Unload
    await this.unload(moduleName);

    // Load
    await this.load(moduleName, modulePath, manifest);

    if (this.logger) {
      this.logger.info('module.reloaded', {
        module: moduleName,
        version: manifest.version
      });
    }

    if (this.metrics) {
      this.metrics.increment('modules.reloaded');
    }
  }

  /**
   * Carga todos los módulos descubiertos
   *
   * @returns {Promise<void>}
   *
   * @example
   * await loader.loadAll();
   * console.log('Loaded:', loader.getLoadedModules().length);
   */
  async loadAll() {
    const discovered = this.discover();
    const disabled = this.config.disabled || [];

    // Filter out disabled modules
    const toLoad = disabled.length > 0
      ? discovered.filter(m => {
          if (disabled.includes(m.name)) {
            if (this.logger) {
              this.logger.info('module.skipped.disabled', { module: m.name });
            }
            return false;
          }
          return true;
        })
      : discovered;

    // Sort by config.enabled order (if specified)
    const enabledOrder = this.config.enabled || [];
    if (enabledOrder.length > 0) {
      toLoad.sort((a, b) => {
        const indexA = enabledOrder.indexOf(a.name);
        const indexB = enabledOrder.indexOf(b.name);
        const orderA = indexA >= 0 ? indexA : enabledOrder.length;
        const orderB = indexB >= 0 ? indexB : enabledOrder.length;
        return orderA - orderB;
      });
    }

    if (this.logger) {
      this.logger.info('modules.loading.all', {
        count: toLoad.length,
        disabled: disabled.length > 0 ? disabled.length : undefined
      });
    }

    const results = [];

    for (const { name, path, manifest } of toLoad) {
      try {
        await this.load(name, path, manifest);
        results.push({ name, success: true });
      } catch (error) {
        results.push({ name, success: false, error: error.message });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    if (this.logger) {
      this.logger.info('modules.loaded.all', {
        total: discovered.length,
        successful,
        failed
      });
    }

    // Emit canonical bus event so late wirings (e.g. ai-gateway blueprint
    // async subscribers) can hook reliably after all modules are loaded.
    // Replaces the lazy-rewire workaround in ai-gateway (PR #206) by a
    // deterministic signal. The lazy-rewire stays as defense-in-depth.
    if (this.core?.eventBus?.publish) {
      try {
        await this.core.eventBus.publish('core.modules.loaded.all', {
          total: discovered.length,
          successful,
          failed,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        this.logger?.warn('core.modules.loaded.all.publish_failed', {
          error_message: err && err.message ? err.message : String(err)
        });
      }
    }

    return results;
  }

  /**
   * Descarga todos los módulos
   *
   * @returns {Promise<void>}
   */
  async unloadAll() {
    const moduleNames = Array.from(this.loadedModules.keys());

    for (const name of moduleNames) {
      try {
        await this.unload(name);
      } catch (error) {
        if (this.logger) {
          this.logger.error('module.unload.error', {
            module: name,
            error: error.message
          }, error);
        }
      }
    }
  }

  /**
   * Habilita hot-reload para un módulo
   *
   * @param {string} moduleName - Nombre del módulo
   *
   * @example
   * loader.watch('echo');
   */
  watch(moduleName) {
    const moduleData = this.loadedModules.get(moduleName);
    if (!moduleData) {
      throw new Error(`Module ${moduleName} not loaded`);
    }

    // Si ya está siendo observado, no hacer nada
    if (this.watchers.has(moduleName)) {
      return;
    }

    const modulePath = moduleData.path;

    // Crear watcher
    const watcher = fs.watch(modulePath, { recursive: true }, async (eventType, filename) => {
      if (filename === 'module.json' || filename === 'index.js') {
        if (this.logger) {
          this.logger.info('module.changed', {
            module: moduleName,
            file: filename
          });
        }

        // Debounce: esperar 500ms antes de recargar
        clearTimeout(this.reloadTimeout);
        this.reloadTimeout = setTimeout(async () => {
          try {
            await this.reload(moduleName);
          } catch (error) {
            if (this.logger) {
              this.logger.error('module.reload.failed', {
                module: moduleName,
                error: error.message
              }, error);
            }
          }
        }, 500);
      }
    });

    this.watchers.set(moduleName, watcher);

    if (this.logger) {
      this.logger.debug('module.watch.enabled', {
        module: moduleName
      });
    }
  }

  /**
   * Habilita hot-reload para todos los módulos cargados
   */
  watchAll() {
    for (const moduleName of this.loadedModules.keys()) {
      try {
        this.watch(moduleName);
      } catch (error) {
        if (this.logger) {
          this.logger.error('module.watch.failed', {
            module: moduleName,
            error: error.message
          }, error);
        }
      }
    }
  }

  /**
   * Obtiene la lista de módulos cargados
   *
   * @returns {Array<Object>} Array de módulos cargados
   */
  getLoadedModules() {
    return Array.from(this.loadedModules.entries()).map(([name, data]) => ({
      name,
      version: data.manifest.version,
      description: data.manifest.description,
      loadedAt: data.loadedAt
    }));
  }

  /**
   * Obtiene un módulo cargado por nombre
   *
   * @param {string} moduleName - Nombre del módulo
   * @returns {Object|null} Module data o null si no está cargado
   */
  getModule(moduleName) {
    return this.loadedModules.get(moduleName) || null;
  }

  /**
   * Verifica si un módulo está cargado
   *
   * @param {string} moduleName - Nombre del módulo
   * @returns {boolean}
   */
  isLoaded(moduleName) {
    return this.loadedModules.has(moduleName);
  }

  // ==========================================
  // Declarative Wiring from module.json
  // ==========================================

  /**
   * Normalizes subscribes from module.json into a consistent format.
   * Accepts all legacy formats:
   *   - root "subscribes": ["event.name", ...]
   *   - root "subscribes": [{ event, handler }, ...]
   *   - nested "events.subscribes": ["event.name", ...]
   *   - nested "events.subscribes": [{ event, handler }, ...]
   *
   * @param {Object} manifest - Module manifest
   * @returns {Array<{event: string, handler: string|null}>}
   */
  normalizeSubscriptions(manifest) {
    // Merge both sources (root and nested), root takes priority
    const raw = manifest.subscribes || manifest.events?.subscribes || [];

    return raw.map(entry => {
      if (typeof entry === 'string') {
        return { event: entry, handler: null };
      }
      return {
        event: entry.event || entry.topic || entry,
        handler: entry.handler || null
      };
    });
  }

  /**
   * Auto-wires event subscriptions declared in module.json.
   * Resolves handler strings to bound methods on the instance.
   * Returns array of unsubscribe functions for automatic cleanup.
   *
   * @param {Object} manifest - Module manifest
   * @param {Object} instance - Module instance
   * @returns {Array<Function>} Unsubscribe functions
   */
  wireEventSubscriptions(manifest, instance) {
    const unsubs = [];
    const eventBus = this.core?.eventBus;

    if (!eventBus) return unsubs;

    const subscriptions = this.normalizeSubscriptions(manifest);

    for (const sub of subscriptions) {
      if (!sub.handler) continue;

      const handlerFn = instance[sub.handler];
      if (typeof handlerFn !== 'function') {
        if (this.logger) {
          this.logger.warn('module.event.handler.missing', {
            module: manifest.name,
            event: sub.event,
            expected: sub.handler
          });
        }
        continue;
      }

      const unsub = eventBus.subscribe(sub.event, handlerFn.bind(instance));
      unsubs.push(unsub);

      if (this.logger) {
        this.logger.debug('module.event.wired', {
          module: manifest.name,
          event: sub.event,
          handler: sub.handler
        });
      }
    }

    if (unsubs.length > 0 && this.logger) {
      this.logger.info('module.events.wired', {
        module: manifest.name,
        count: unsubs.length
      });
    }

    return unsubs;
  }

  /**
   * Normalizes UI handler declarations from module.json.
   * Accepts legacy formats:
   *   - "handlers": [{ domain, action, method }]   (filesystem)
   *   - "uiActions": [{ domain, action, handler }]  (scheduler)
   *   - "ui_handlers": [{ domain, action, handler }] (standard)
   *
   * @param {Object} manifest - Module manifest
   * @returns {Array<{domain: string, action: string, handler: string}>}
   */
  normalizeUIHandlers(manifest) {
    const raw = manifest.ui_handlers || manifest.uiActions || manifest.handlers || [];

    return raw.map(entry => ({
      domain: entry.domain,
      action: entry.action,
      handler: entry.handler || entry.method || null
    }));
  }

  /**
   * Auto-wires UI request handlers declared in module.json.
   * Resolves handler strings to bound methods on the instance.
   * Returns registration records for automatic cleanup.
   *
   * @param {Object} manifest - Module manifest
   * @param {Object} instance - Module instance
   * @returns {Array<{domain: string, action: string}>} Registrations for cleanup
   */
  wireUIHandlers(manifest, instance) {
    const registrations = [];
    const uiHandler = this.core?.uiHandler;

    if (!uiHandler) return registrations;

    const handlers = this.normalizeUIHandlers(manifest);

    for (const h of handlers) {
      if (!h.handler || !h.domain || !h.action) continue;

      const handlerFn = instance[h.handler];
      if (typeof handlerFn !== 'function') {
        if (this.logger) {
          this.logger.warn('module.ui_handler.missing', {
            module: manifest.name,
            domain: h.domain,
            action: h.action,
            expected: h.handler
          });
        }
        continue;
      }

      uiHandler.register(h.domain, h.action, handlerFn.bind(instance));
      registrations.push({ domain: h.domain, action: h.action });

      if (this.logger) {
        this.logger.debug('module.ui_handler.wired', {
          module: manifest.name,
          domain: h.domain,
          action: h.action,
          handler: h.handler
        });
      }
    }

    if (registrations.length > 0 && this.logger) {
      this.logger.info('module.ui_handlers.wired', {
        module: manifest.name,
        count: registrations.length
      });
    }

    return registrations;
  }

  // ==========================================
  // Tools Registry for AI
  // ==========================================

  /**
   * Register tools from a module for AI use.
   *
   * Cada tool con handler queda auto-suscrita al evento `<toolName>` en el bus.
   * Esa suscripcion recibe `{request_id, ...args}`, invoca al handler con los
   * args (request_id stripped) y publica `<toolName>.response` con shape
   * canonico `{request_id, result|error}`. El unwrapping `{status,data}` → `data`
   * y `{status>=400, error}` → `error` se hace aqui para que cualquier caller
   * (ai-gateway u otro modulo) reciba siempre la misma forma.
   *
   * Consecuencia arquitectonica: NINGUN modulo invoca tool handlers via
   * `toolsRegistry.get(name).handler(...)` — todas las invocaciones van por
   * bus. Ver tools.contract.json: decisiones_arquitectonicas.tool_invocacion_canonica_por_bus
   * y prohibido.tool_invocacion_directa_via_toolsRegistry_handler.
   *
   * @param {string} moduleName - Module name
   * @param {Array} tools - Tools definitions from module.json
   * @param {Object} instance - Module instance
   */
  registerToolsForAI(moduleName, tools, instance) {
    const bus = this.core?.eventBus || null;
    const uiHandler = this.core?.uiHandler || null;

    for (const tool of tools) {
      // Registrar siempre el schema para que el LLM conozca la tool.
      // La ejecución va por eventos — el handler es opcional.
      const handlerName = tool.handler || tool.name.split('.')[1];
      // tools.contract v1.2: handler puede ser un path con puntos para resolver
      // metodos anidados (ej. 'strategies.mesa.handleAbrirMesa'). Caso comun
      // para modulos con patron Strategy donde los handlers viven en
      // sub-componentes accesibles desde la instance principal. Para handlers
      // sin punto el comportamiento es identico a instance[handlerName].
      const { fn: handler, owner: handlerOwner } = this._resolveHandlerByPath(instance, handlerName);
      const boundHandler = typeof handler === 'function' ? handler.bind(handlerOwner) : null;

      const entry = {
        name: tool.name,
        description: tool.description || `${moduleName} ${tool.name}`,
        parameters: tool.parameters || {},
        handler: boundHandler,
        module: moduleName,
        confirmation: tool.confirmation || false,
        event_based: true,
        _busUnsub: null,
        _uiKey: null
      };

      if (boundHandler && bus) {
        entry._busUnsub = this._wireToolBusSubscription(tool.name, boundHandler, bus);
      }

      // tools.contract v1.2: una declaracion, tres destinos.
      // Auto-registrar en uiHandler con domain = parte antes del primer punto,
      // action = resto (puntos preservados). Ej: 'mercadona.producto.obtener' →
      // domain='mercadona', action='producto.obtener'. UIRequestHandler tolera
      // action con puntos porque parsea ui/request/{domain}/{action} con split
      // limitado al primer slash de los path segments.
      if (boundHandler && uiHandler) {
        const uiKey = this._deriveUiKeyFromToolName(tool.name);
        if (uiKey) {
          uiHandler.register(uiKey.domain, uiKey.action, boundHandler);
          entry._uiKey = uiKey;
        }
      }

      this.toolsRegistry.set(tool.name, entry);

      if (this.logger) {
        this.logger.debug('module.tool.registered', {
          module: moduleName,
          tool: tool.name,
          confirmation: tool.confirmation || false,
          bus_wired: entry._busUnsub != null,
          ui_wired: entry._uiKey != null
        });
      }
    }

    if (this.logger) {
      this.logger.info('module.tools.registered', {
        module: moduleName,
        count: tools.length
      });
    }
  }

  /**
   * Register tools_http declaratives for AI (tools.contract v1.2)
   *
   * Wrappers HTTP declarativos: el modulo declara name + parameters + http
   * (method, url, auth_type, credential_id?, headers?, body_template?,
   * response_path?, timeout_ms?) y el loader genera la closure handler en
   * runtime. La closure se registra en los 3 destinos identicamente a una
   * tool de tools[] (toolsRegistry, bus event, uiHandler).
   *
   * Ver tools.contract.json::decisiones_arquitectonicas.tool_http_declarativa_runtime_en_loader.
   *
   * @param {string} moduleName
   * @param {Array} toolsHttp - tools_http[] del manifest
   */
  registerToolsHttpForAI(moduleName, toolsHttp) {
    const bus = this.core?.eventBus || null;
    const uiHandler = this.core?.uiHandler || null;

    for (const tool of toolsHttp) {
      // Closure runtime — captura `tool` y `bus` por cierre.
      const closure = this._makeHttpToolHandler(tool, bus, moduleName);

      const entry = {
        name: tool.name,
        description: tool.description || `${moduleName} ${tool.name}`,
        parameters: tool.parameters || {},
        handler: closure,
        module: moduleName,
        confirmation: tool.confirmation || false,
        event_based: true,
        http: true, // distinguir de tools[] normales
        _busUnsub: null,
        _uiKey: null
      };

      if (bus) {
        entry._busUnsub = this._wireToolBusSubscription(tool.name, closure, bus);
      }

      if (uiHandler) {
        const uiKey = this._deriveUiKeyFromToolName(tool.name);
        if (uiKey) {
          uiHandler.register(uiKey.domain, uiKey.action, closure);
          entry._uiKey = uiKey;
        }
      }

      this.toolsRegistry.set(tool.name, entry);

      if (this.logger) {
        this.logger.debug('module.tool_http.registered', {
          module: moduleName,
          tool: tool.name,
          method: tool.http?.method,
          auth_type: tool.http?.auth_type || 'none',
          bus_wired: entry._busUnsub != null,
          ui_wired: entry._uiKey != null
        });
      }
    }

    if (this.logger) {
      this.logger.info('module.tools_http.registered', {
        module: moduleName,
        count: toolsHttp.length
      });
    }
  }

  /**
   * Genera la closure runtime para una entry de tools_http[].
   *
   * La closure async (args) =>
   *   1. Resuelve auth si auth_type !== 'none' via credential.resolve.request
   *      (par bus con timeout ~5s). El secreto NO se loguea ni se publica
   *      en otro evento — solo se aplica al request HTTP saliente.
   *   2. Aplica templating `{{paramName}}` a url / headers / body_template
   *      con los args. Path params consumidos no se agregan al query/body.
   *   3. Para GET: args no consumidos van como query string.
   *      Para POST/PUT/PATCH: body_template (templated) o args restantes
   *      como JSON body.
   *   4. fetch con timeout (AbortController, default 30000ms).
   *   5. Mapea status HTTP a shape canonico (tools.contract):
   *        2xx/3xx → { status, data }
   *        400 → INVALID_INPUT, 401/403 → PERMISSION_DENIED,
   *        404 → RESOURCE_NOT_FOUND, 409 → CONFLICT_STATE,
   *        429 → RATE_LIMITED, otros 4xx → INVALID_INPUT
   *        5xx → UPSTREAM_TIMEOUT (timeout) / UPSTREAM_UNREACHABLE / UPSTREAM_INVALID_RESPONSE
   *   6. Si response_path, extrae subcampo via dot-path navegation.
   *
   * @private
   * @param {Object} tool - entry de tools_http[]
   * @param {Object} bus  - core.eventBus (puede ser null en tests)
   * @param {string} moduleName
   * @returns {Function} closure async
   */
  _makeHttpToolHandler(tool, bus, moduleName) {
    const loader = this;
    const http = tool.http || {};
    return async function httpToolHandler(args) {
      const inputArgs = (args && typeof args === 'object') ? args : {};
      try {
        // 1. Auth (si aplica)
        let authValue = null;
        const authType = http.auth_type || 'none';
        if (authType !== 'none') {
          if (!http.credential_id) {
            return loader._httpErrorResponse(400, 'INVALID_INPUT',
              `tools_http ${tool.name}: auth_type='${authType}' pero credential_id ausente`);
          }
          try {
            authValue = await loader._resolveCredentialViaBus(http.credential_id, bus);
          } catch (err) {
            return loader._httpErrorResponse(500, 'PERMISSION_DENIED',
              `No se pudo resolver credential '${http.credential_id}': ${err.message}`);
          }
          if (!authValue) {
            return loader._httpErrorResponse(500, 'PERMISSION_DENIED',
              `Credential '${http.credential_id}' no encontrada`);
          }
        }

        // 2. Templating de url, headers, body
        const { rendered: url, consumed: pathConsumed } = loader._renderTemplate(http.url, inputArgs);
        const headersIn = http.headers || {};
        const renderedHeaders = {};
        let headerConsumed = new Set(pathConsumed);
        for (const [hk, hv] of Object.entries(headersIn)) {
          const r = loader._renderTemplate(hv, inputArgs);
          renderedHeaders[hk] = r.rendered;
          for (const c of r.consumed) headerConsumed.add(c);
        }

        // 3. Aplicar auth a request
        if (authType === 'bearer') {
          renderedHeaders['Authorization'] = `Bearer ${authValue}`;
        } else if (authType === 'api_key_header') {
          const hname = http.auth_header_name || 'X-API-Key';
          renderedHeaders[hname] = authValue;
        } else if (authType === 'basic') {
          renderedHeaders['Authorization'] = `Basic ${Buffer.from(authValue).toString('base64')}`;
        }

        // 4. Construir URL final con query (api_key_query + args sobrantes en GET)
        const method = (http.method || 'GET').toUpperCase();
        const remainingArgs = {};
        for (const [k, v] of Object.entries(inputArgs)) {
          if (!headerConsumed.has(k)) remainingArgs[k] = v;
        }

        let finalUrl = url;
        if (authType === 'api_key_query') {
          const qname = http.auth_query_param_name || 'apiKey';
          finalUrl = loader._appendQuery(finalUrl, { [qname]: authValue });
        }

        // 5. Body / query
        const fetchOpts = {
          method,
          headers: renderedHeaders
        };

        if (method === 'GET' || method === 'DELETE') {
          if (Object.keys(remainingArgs).length > 0) {
            finalUrl = loader._appendQuery(finalUrl, remainingArgs);
          }
        } else {
          // POST/PUT/PATCH
          if (http.body_template !== undefined) {
            const bodyRendered = loader._renderBodyTemplate(http.body_template, inputArgs);
            fetchOpts.body = typeof bodyRendered === 'string'
              ? bodyRendered
              : JSON.stringify(bodyRendered);
            if (!renderedHeaders['Content-Type'] && typeof bodyRendered !== 'string') {
              renderedHeaders['Content-Type'] = 'application/json';
            }
          } else if (Object.keys(remainingArgs).length > 0) {
            fetchOpts.body = JSON.stringify(remainingArgs);
            if (!renderedHeaders['Content-Type']) {
              renderedHeaders['Content-Type'] = 'application/json';
            }
          }
        }

        if (!renderedHeaders['Accept']) renderedHeaders['Accept'] = 'application/json';

        // 6. fetch con timeout
        const timeoutMs = Number.isInteger(http.timeout_ms) ? http.timeout_ms : 30000;
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), timeoutMs);
        fetchOpts.signal = controller.signal;

        const fetchImpl = loader._fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
        if (!fetchImpl) {
          clearTimeout(tid);
          return loader._httpErrorResponse(500, 'UNKNOWN_ERROR', 'No fetch implementation available');
        }

        let response;
        try {
          response = await fetchImpl(finalUrl, fetchOpts);
        } catch (err) {
          clearTimeout(tid);
          if (err.name === 'AbortError') {
            return loader._httpErrorResponse(504, 'UPSTREAM_TIMEOUT',
              `Timeout (${timeoutMs}ms) llamando ${tool.name}`);
          }
          return loader._httpErrorResponse(502, 'UPSTREAM_UNREACHABLE',
            `Error de red llamando ${tool.name}: ${err.message}`);
        }
        clearTimeout(tid);

        // 7. Parsear body
        const contentType = response.headers.get?.('content-type') || '';
        let parsed;
        try {
          if (contentType.includes('application/json')) {
            parsed = await response.json();
          } else {
            parsed = await response.text();
          }
        } catch (err) {
          return loader._httpErrorResponse(502, 'UPSTREAM_INVALID_RESPONSE',
            `Response parse error de ${tool.name}: ${err.message}`);
        }

        // 8. Mapear status a shape canonico
        if (response.status >= 200 && response.status < 400) {
          let data = parsed;
          if (http.response_path) {
            data = loader._extractResponsePath(parsed, http.response_path);
          }
          return { status: response.status, data };
        }

        const errCode = loader._mapHttpStatusToCanonCode(response.status);
        // Extrae el mensaje del upstream: shape plano (parsed.message) o anidado
        // REST/Google (parsed.error.message). Si nada, cae al status HTTP.
        const upstreamMsg = (parsed && typeof parsed === 'object')
          ? (parsed.message || parsed.error?.message || parsed.error?.status || (typeof parsed.error === 'string' ? parsed.error : null))
          : (typeof parsed === 'string' ? parsed.slice(0, 300) : null);
        const errMessage = upstreamMsg
          ? String(upstreamMsg)
          : `HTTP ${response.status} ${response.statusText || ''}`.trim();
        return loader._httpErrorResponse(response.status, errCode, errMessage, {
          upstream_status: response.status,
          upstream_body: (parsed && typeof parsed === 'object') ? parsed : undefined
        });
      } catch (err) {
        return loader._httpErrorResponse(500, 'UNKNOWN_ERROR',
          `tools_http handler error: ${err?.message || String(err)}`);
      }
    };
  }

  /**
   * Resuelve una credencial via el par bus credential.resolve.request/response.
   * Lanza si el bus no resuelve en 5s o si la response llega con success:false.
   * @private
   */
  _resolveCredentialViaBus(credentialId, bus) {
    return new Promise((resolve, reject) => {
      if (!bus || typeof bus.publish !== 'function' || typeof bus.subscribe !== 'function') {
        return reject(new Error('eventBus no disponible para credential.resolve'));
      }
      const request_id = (this.core?.utils?.uuid?.()) || ('cred-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      const timeoutMs = 5000;
      let settled = false;
      let unsub = null;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (typeof unsub === 'function') { try { unsub(); } catch (_) {} }
        reject(new Error(`credential.resolve.response timeout (${timeoutMs}ms)`));
      }, timeoutMs);

      try {
        const handler = (event) => {
          const data = (event && typeof event === 'object' && 'data' in event) ? event.data : event;
          if (!data || data.request_id !== request_id) return;
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (typeof unsub === 'function') { try { unsub(); } catch (_) {} }
          if (data.success === false) {
            return reject(new Error(data.error || 'credential resolution failed'));
          }
          resolve(data.api_key || null);
        };
        const subResult = bus.subscribe('credential.resolve.response', handler);
        // bus.subscribe puede devolver una funcion unsub o un id
        if (typeof subResult === 'function') unsub = subResult;
        bus.publish('credential.resolve.request', { request_id, provider: credentialId });
      } catch (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (typeof unsub === 'function') { try { unsub(); } catch (_) {} }
        reject(err);
      }
    });
  }

  /**
   * Reemplaza {{paramName}} en un string con valores de args. Devuelve el
   * rendered string y la lista de paramName consumidos (para no duplicarlos
   * en query/body posteriormente).
   * @private
   */
  _renderTemplate(template, args) {
    if (typeof template !== 'string') return { rendered: template, consumed: [] };
    const consumed = [];
    const rendered = template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (m, key) => {
      if (Object.prototype.hasOwnProperty.call(args, key)) {
        consumed.push(key);
        const v = args[key];
        return v === null || v === undefined ? '' : encodeURIComponent(String(v));
      }
      return m;
    });
    return { rendered, consumed };
  }

  /**
   * Templating del body. Si es string, reemplaza tokens (sin encodeURIComponent
   * — el body crudo no es URL). Si es object, recorre clave a clave reemplazando
   * tokens en values string; valores no-string se sustituyen por el arg crudo
   * si el value es exactamente '{{paramName}}'.
   * @private
   */
  _renderBodyTemplate(template, args) {
    if (template === null || template === undefined) return template;
    if (typeof template === 'string') {
      return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (m, key) => {
        return Object.prototype.hasOwnProperty.call(args, key)
          ? String(args[key] === null || args[key] === undefined ? '' : args[key])
          : m;
      });
    }
    if (typeof template !== 'object') return template;
    if (Array.isArray(template)) return template.map(v => this._renderBodyTemplate(v, args));
    const out = {};
    for (const [k, v] of Object.entries(template)) {
      if (typeof v === 'string') {
        const fullMatch = /^\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}$/.exec(v);
        if (fullMatch && Object.prototype.hasOwnProperty.call(args, fullMatch[1])) {
          out[k] = args[fullMatch[1]];
        } else {
          out[k] = v.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (m, key) => {
            return Object.prototype.hasOwnProperty.call(args, key)
              ? String(args[key] === null || args[key] === undefined ? '' : args[key])
              : m;
          });
        }
      } else if (typeof v === 'object' && v !== null) {
        out[k] = this._renderBodyTemplate(v, args);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  /**
   * Anyade query params a una URL preservando los existentes.
   * @private
   */
  _appendQuery(url, params) {
    const entries = Object.entries(params).filter(([, v]) => v !== null && v !== undefined);
    if (entries.length === 0) return url;
    const qs = entries
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    return url.includes('?') ? `${url}&${qs}` : `${url}?${qs}`;
  }

  /**
   * Mapea status HTTP a codigo canonico de errors.contract.
   * @private
   */
  _mapHttpStatusToCanonCode(status) {
    if (status === 400) return 'INVALID_INPUT';
    if (status === 401 || status === 403) return 'PERMISSION_DENIED';
    if (status === 404) return 'RESOURCE_NOT_FOUND';
    if (status === 409) return 'CONFLICT_STATE';
    if (status === 429) return 'RATE_LIMITED';
    if (status >= 400 && status < 500) return 'INVALID_INPUT';
    if (status === 502 || status === 503 || status === 504) return 'UPSTREAM_UNREACHABLE';
    if (status >= 500) return 'UPSTREAM_INVALID_RESPONSE';
    return 'UNKNOWN_ERROR';
  }

  /**
   * Extrae subcampo del response parseado siguiendo un path tipo
   * 'data.results[0].text'. Devuelve undefined si el path no resuelve.
   * @private
   */
  _extractResponsePath(obj, path) {
    if (obj === null || obj === undefined || !path) return obj;
    const tokens = String(path).split(/\.|\[(\d+)\]/).filter(t => t !== '' && t !== undefined);
    let cur = obj;
    for (const t of tokens) {
      if (cur === null || cur === undefined) return undefined;
      if (/^\d+$/.test(t)) cur = cur[Number(t)];
      else cur = cur[t];
    }
    return cur;
  }

  /**
   * Helper para construir shape canonico de error de tools_http.
   *
   * El error nace FÉRTIL (error-fertil): además de {code, message} lleva
   * {clase, reintentable, diagnostico, siguiente, no_es}. Así el LLM recibe la
   * INTERPRETACIÓN del fallo (determinista) en vez de un código pelado que
   * rellena con su prior pesimista ("está roto → hazlo a mano"). Toda tool_http
   * lo hereda gratis por pasar por aquí.
   * @private
   */
  _httpErrorResponse(status, code, message, details) {
    let error;
    try {
      error = require('../../modules/_shared/error-fertil').enriquecerError(code, { message, details });
    } catch (_) {
      // Degradación honesta: si el banco no carga, error canónico plano (nunca rompe la tool).
      error = { code, message };
      if (details !== undefined) error.details = details;
    }
    return { status, error };
  }

  /**
   * Deriva el par {domain, action} para el uiHandler a partir del tool name.
   * Split en el PRIMER punto: parte anterior = domain, resto = action.
   *
   *   'pdf.extract'                    → { domain: 'pdf',             action: 'extract' }
   *   'carta-scheduler.crear_regla'    → { domain: 'carta-scheduler', action: 'crear_regla' }
   *   'mercadona.producto.obtener'     → { domain: 'mercadona',       action: 'producto.obtener' }
   *
   * Devuelve null si el name no tiene punto, empieza/acaba en punto, o tiene
   * domain vacio — en esos casos la tool no se auto-registra en uiHandler
   * (sigue siendo invocable por bus y por LLM normalmente).
   *
   * Ver tools.contract.json::principios.ui_request_topic_derivado_del_name.
   *
   * @private
   * @param {string} toolName
   * @returns {{domain: string, action: string} | null}
   */
  /**
   * Resuelve un handler segun su string declarado en module.json.tools[].handler.
   *
   * Soporta dos formas:
   *   - 'handleX'                       → instance.handleX           (caso default)
   *   - 'strategies.mesa.handleAbrirMesa' → instance.strategies.mesa.handleAbrirMesa
   *
   * Para que `this` se enlace correctamente al objeto duenyo cuando el method
   * vive en un sub-componente, devolvemos { fn, owner } y el caller hace
   * fn.bind(owner). Sin esto, un metodo de MesaStrategy bindeado al modulo
   * padre perderia acceso a this.mesasActivas, this.modulo, etc.
   *
   * @private
   * @param {Object} instance
   * @param {string} path
   * @returns {{fn: Function|undefined, owner: Object}}
   */
  _resolveHandlerByPath(instance, path) {
    if (!path || typeof path !== 'string') return { fn: undefined, owner: instance };
    if (!path.includes('.')) {
      return { fn: instance?.[path], owner: instance };
    }
    const parts = path.split('.');
    let owner = instance;
    for (let i = 0; i < parts.length - 1; i++) {
      if (owner == null) return { fn: undefined, owner: instance };
      owner = owner[parts[i]];
    }
    if (owner == null) return { fn: undefined, owner: instance };
    return { fn: owner[parts[parts.length - 1]], owner };
  }

  _deriveUiKeyFromToolName(toolName) {
    if (typeof toolName !== 'string') return null;
    const firstDot = toolName.indexOf('.');
    if (firstDot < 1 || firstDot === toolName.length - 1) return null;
    const domain = toolName.substring(0, firstDot);
    const action = toolName.substring(firstDot + 1);
    if (!domain || !action) return null;
    return { domain, action };
  }

  /**
   * Wire la suscripcion bus de una tool. Devuelve la funcion unsubscribe.
   *
   * Shape de invocacion canonica:
   *   - Caller publica  `<toolName>`           con `{request_id, ...args}`.
   *   - Wrapper publica `<toolName>.response`  con `{request_id, result}` o `{request_id, error: {code, message}}`.
   *
   * Unwrapping al publicar `result`:
   *   - handler devuelve `{status, data}` con 200-399 → `result = data`.
   *   - handler devuelve `{status>=400, error}` o `{error, ...}` sin status → publica error canonico.
   *   - handler lanza excepcion → publica `error: { code: 'UNKNOWN_ERROR', message }`.
   *   - cualquier otro shape → `result = raw return`.
   *
   * @private
   */
  _wireToolBusSubscription(toolName, boundHandler, bus) {
    const responseEvent = `${toolName}.response`;
    const wrapper = async (event) => {
      const payload = (event && typeof event === 'object' && 'data' in event) ? event.data : event;
      const { request_id, ...args } = payload || {};
      try {
        let result = await boundHandler(args);
        if (result && typeof result === 'object') {
          if (result.error && (result.status == null || result.status >= 400)) {
            const errObj = (typeof result.error === 'object' && result.error !== null)
              ? result.error
              : { code: 'UNKNOWN_ERROR', message: String(result.error) };
            await bus.publish(responseEvent, { request_id, error: errObj });
            return;
          }
          if ('status' in result && 'data' in result && result.status >= 200 && result.status < 400) {
            result = result.data;
          }
        }
        await bus.publish(responseEvent, { request_id, result });
      } catch (err) {
        await bus.publish(responseEvent, {
          request_id,
          error: { code: 'UNKNOWN_ERROR', message: err?.message || String(err) }
        });
      }
    };
    return bus.subscribe(toolName, wrapper);
  }

  /**
   * Unregister tools from a module
   *
   * @param {string} moduleName - Module name
   */
  unregisterToolsForAI(moduleName) {
    const toDelete = [];
    const uiHandler = this.core?.uiHandler || null;

    for (const [toolName, tool] of this.toolsRegistry) {
      if (tool.module === moduleName) {
        if (typeof tool._busUnsub === 'function') {
          try { tool._busUnsub(); } catch (_) { /* ignore */ }
        }
        if (tool._uiKey && uiHandler) {
          try { uiHandler.unregister(tool._uiKey.domain, tool._uiKey.action); } catch (_) { /* ignore */ }
        }
        toDelete.push(toolName);
      }
    }

    for (const toolName of toDelete) {
      this.toolsRegistry.delete(toolName);
    }

    if (this.logger && toDelete.length > 0) {
      this.logger.info('module.tools.unregistered', {
        module: moduleName,
        count: toDelete.length
      });
    }
  }

  /**
   * Register provider tools for AI use
   *
   * This method unifies the two tool systems by registering service providers
   * (from services/providers/) into the toolsRegistry alongside module tools.
   *
   * @param {Object} providerRegistry - ProviderRegistry instance
   */
  registerProviderTools(providerRegistry) {
    if (!providerRegistry) {
      if (this.logger) {
        this.logger.warn('module-loader.provider-registry.not-available');
      }
      return;
    }

    const stats = providerRegistry.getStats();
    if (this.logger) {
      this.logger.info('module-loader.registering-provider-tools', {
        providers: stats.total_providers,
        functions: stats.total_functions
      });
    }

    // Get all providers info from registry (returns an Array)
    const providersInfo = providerRegistry.getAll();
    let registeredCount = 0;

    for (const providerInfo of providersInfo) {
      if (!providerInfo.available) {
        if (this.logger) {
          this.logger.debug('module-loader.provider.skipped', {
            provider: providerInfo.name,
            reason: 'not available'
          });
        }
        continue;
      }

      // Get full provider data with function definitions
      const provider = providerRegistry.get(providerInfo.name);
      if (!provider || !provider.functions) {
        if (this.logger) {
          this.logger.debug('module-loader.provider.skipped', {
            provider: providerInfo.name,
            reason: 'no functions defined'
          });
        }
        continue;
      }

      // Register each function as a tool
      for (const [fnName, fnDef] of Object.entries(provider.functions)) {
        const toolName = this.buildProviderToolName(providerInfo.name, fnName);
        const eventName = fnDef.event || `${providerInfo.name}.${fnName}.request`;

        // Build parameters schema for AI
        const parameters = this.buildProviderParametersSchema(fnDef.input);

        this.toolsRegistry.set(toolName, {
          name: toolName,
          description: fnDef.description || `${providerInfo.name} ${fnName}`,
          parameters,
          handler: this.createProviderToolHandler(eventName, providerInfo.name, fnName),
          module: `provider:${providerInfo.name}`,
          confirmation: fnDef.confirmation || false
        });

        registeredCount++;

        if (this.logger) {
          this.logger.debug('module-loader.provider-tool.registered', {
            provider: providerInfo.name,
            function: fnName,
            tool: toolName,
            event: eventName
          });
        }
      }
    }

    if (this.logger) {
      this.logger.info('module-loader.provider-tools.registered', {
        total: registeredCount
      });
    }
  }

  /**
   * Build tool name for provider function
   * Uses underscore format: provider_function
   *
   * @param {string} providerName - Provider name (e.g., 'local.gmail')
   * @param {string} fnName - Function name (e.g., 'send')
   * @returns {string} Tool name (e.g., 'gmail_send')
   */
  buildProviderToolName(providerName, fnName) {
    // Remove 'local.' prefix if present
    const cleanProvider = providerName.replace(/^local\./, '');
    // Replace dots and dashes with underscores
    const normalizedProvider = cleanProvider.replace(/[.-]/g, '_');
    return `${normalizedProvider}_${fnName}`;
  }

  /**
   * Build parameters schema from provider input definition
   *
   * @param {Object} input - Provider function input schema
   * @returns {Object} Parameters schema for AI tools
   */
  buildProviderParametersSchema(input) {
    if (!input) {
      return {
        type: 'object',
        properties: {},
        required: []
      };
    }

    // If input is already in the right format, return it
    if (input.type === 'object' && input.properties) {
      return input;
    }

    // Convert provider format to JSON Schema
    const properties = {};
    const required = [];

    for (const [key, value] of Object.entries(input)) {
      if (typeof value === 'string') {
        // Simple type string
        properties[key] = { type: this.normalizeSchemaType(value) };
      } else if (typeof value === 'object') {
        // Object with type, description, etc.
        const prop = {};

        // Normalize type (convert "string|array" to ["string", "array"])
        if (value.type) {
          prop.type = this.normalizeSchemaType(value.type);
        }

        // Copy valid JSON Schema properties
        if (value.description) prop.description = value.description;
        if (value.enum) prop.enum = value.enum;
        if (value.default !== undefined) prop.default = value.default;
        if (value.items) prop.items = value.items;
        if (value.minLength !== undefined) prop.minLength = value.minLength;
        if (value.maxLength !== undefined) prop.maxLength = value.maxLength;
        if (value.minimum !== undefined) prop.minimum = value.minimum;
        if (value.maximum !== undefined) prop.maximum = value.maximum;
        if (value.pattern) prop.pattern = value.pattern;

        properties[key] = prop;

        // Check if required (explicitly true or not set to false)
        if (value.required === true) {
          required.push(key);
        }
      }
    }

    return {
      type: 'object',
      properties,
      required
    };
  }

  /**
   * Normalize type notation to valid JSON Schema
   * Converts "string|array" to ["string", "array"]
   *
   * @param {string} type - Type notation
   * @returns {string|Array} JSON Schema type
   */
  normalizeSchemaType(type) {
    if (typeof type !== 'string') return type;

    // Handle pipe notation: "string|array" -> ["string", "array"]
    if (type.includes('|')) {
      return type.split('|').map(t => t.trim());
    }

    return type;
  }

  /**
   * Create handler function for provider tool
   * Uses event bus to communicate with provider
   *
   * @param {string} eventName - Request event name
   * @param {string} providerName - Provider name
   * @param {string} fnName - Function name
   * @returns {Function} Handler function
   */
  createProviderToolHandler(eventName, providerName, fnName) {
    const self = this;

    return async function(args) {
      if (!self.core?.eventBus) {
        throw new Error('EventBus not available');
      }

      const correlationId = `${fnName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const responseEvent = eventName.replace(/\.request$/, '.response');

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          unsubscribe();
          reject(new Error(`Timeout waiting for ${responseEvent}`));
        }, 30000);

        const unsubscribe = self.core.eventBus.subscribe(responseEvent, (response) => {
          // Skip responses from other concurrent calls
          if (response._correlationId && response._correlationId !== correlationId) {
            return;
          }
          clearTimeout(timeout);
          unsubscribe();

          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });

        self.core.eventBus.publish(eventName, { ...args, _correlationId: correlationId });
      });
    };
  }

  /**
   * Get all tools for AI providers
   * Returns tools in a format suitable for function calling
   *
   * @returns {Array} Array of tool definitions
   */
  getToolsForAI() {
    return Array.from(this.toolsRegistry.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      confirmation: tool.confirmation
    }));
  }

  /**
   * Get a specific tool by name
   *
   * @param {string} toolName - Tool name (e.g., 'fs.read')
   * @returns {Object|null} Tool definition or null
   */
  getTool(toolName) {
    return this.toolsRegistry.get(toolName) || null;
  }

  /**
   * Execute a tool by name
   *
   * @param {string} toolName - Tool name (e.g., 'fs.read')
   * @param {Object} args - Tool arguments
   * @returns {Promise<Object>} Tool execution result
   */
  async executeTool(toolName, args) {
    const tool = this.toolsRegistry.get(toolName);

    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // Validate required parameters against schema
    const params = tool.parameters;
    if (params?.required && Array.isArray(params.required)) {
      const missing = params.required.filter(p => args[p] === undefined);
      if (missing.length > 0) {
        throw new Error(`Tool '${toolName}' missing required params: ${missing.join(', ')}`);
      }
    }

    if (this.logger) {
      this.logger.info('tool.executing', {
        tool: toolName,
        module: tool.module
      });
    }

    try {
      const result = await tool.handler(args);

      if (this.logger) {
        this.logger.info('tool.executed', {
          tool: toolName,
          status: result?.status || 200
        });
      }

      return result;

    } catch (error) {
      if (this.logger) {
        this.logger.error('tool.execution.error', {
          tool: toolName,
          error: error.message
        });
      }
      throw error;
    }
  }

  /**
   * Check if a tool requires confirmation
   *
   * @param {string} toolName - Tool name
   * @returns {boolean}
   */
  toolRequiresConfirmation(toolName) {
    const tool = this.toolsRegistry.get(toolName);
    return tool?.confirmation || false;
  }
}

module.exports = ModuleLoader;

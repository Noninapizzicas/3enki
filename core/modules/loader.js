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
        if (!fs.existsSync(manifestPath)) {
          if (this.logger) {
            this.logger.warn('module.manifest.missing', {
              module: moduleName,
              path: modulePath
            });
          }
          continue;
        }

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

    if (!manifest.provides || !manifest.provides.apis) {
      return apis;
    }

    for (const apiDef of manifest.provides.apis) {
      // Buscar handler en la instancia
      // Convención: handlePing para API 'ping', handleEcho para API 'echo'
      const handlerName = `handle${apiDef.name.charAt(0).toUpperCase()}${apiDef.name.slice(1)}`;
      const handler = instance[handlerName];

      if (typeof handler !== 'function') {
        if (this.logger) {
          this.logger.warn('module.api.handler.missing', {
            module: manifest.name,
            api: apiDef.name,
            expected_handler: handlerName
          });
        }
        continue;
      }

      apis.push({
        name: apiDef.name,
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

      // Ejecutar onLoad
      await instance.onLoad(this.core);

      // Guardar módulo cargado
      this.loadedModules.set(moduleName, {
        manifest,
        instance,
        path: modulePath,
        loadedAt: Date.now()
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
      // Ejecutar onUnload si existe
      if (typeof moduleData.instance.onUnload === 'function') {
        await moduleData.instance.onUnload();
      }

      // Desregistrar del ModuleRegistry
      if (this.registry) {
        this.registry.unregister(moduleName);
      }

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

    if (this.logger) {
      this.logger.info('modules.loading.all', {
        count: discovered.length
      });
    }

    const results = [];

    for (const { name, path, manifest } of discovered) {
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
}

module.exports = ModuleLoader;

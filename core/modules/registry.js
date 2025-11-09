/**
 * Module Registry - Registro de módulos y sus capacidades
 *
 * Mantiene un registro de:
 * - Módulos cargados
 * - APIs que exponen
 * - Hooks que registran
 * - Eventos que publican/consumen
 *
 * @example
 * const registry = new ModuleRegistry({ logger });
 *
 * registry.register('echo', {
 *   manifest,
 *   instance,
 *   apis: [{ name: 'ping', method: 'GET', path: '/ping' }],
 *   hooks: ['beforeEventPublish']
 * });
 *
 * const apis = registry.getModuleAPIs('echo');
 */

class ModuleRegistry {
  /**
   * @param {Object} options - Opciones
   * @param {Object} options.logger - Logger instance
   */
  constructor(options = {}) {
    this.logger = options.logger || null;

    /**
     * Registro de módulos
     * Map: moduleName -> { manifest, instance, apis, hooks, events, registeredAt }
     */
    this.modules = new Map();

    /**
     * Índice de APIs por path
     * Map: path -> { moduleName, apiName, method, handler }
     */
    this.apiIndex = new Map();

    /**
     * Índice de hooks por hook name
     * Map: hookName -> Set(moduleNames)
     */
    this.hookIndex = new Map();
  }

  /**
   * Registra un módulo en el registry
   *
   * @param {string} moduleName - Nombre del módulo
   * @param {Object} data - Datos del módulo
   * @param {Object} data.manifest - Module manifest
   * @param {Object} data.instance - Module instance
   * @param {Array} data.apis - APIs expuestas
   * @param {Array} data.hooks - Hooks registrados
   * @param {Array} data.subscribes - Topics MQTT suscritos
   *
   * @example
   * registry.register('echo', {
   *   manifest,
   *   instance,
   *   apis: [{ name: 'ping', method: 'GET', path: '/ping', handler: fn }],
   *   hooks: ['beforeEventPublish'],
   *   subscribes: ['core/+/events/#']
   * });
   */
  register(moduleName, data) {
    // Registrar módulo
    this.modules.set(moduleName, {
      manifest: data.manifest,
      instance: data.instance,
      apis: data.apis || [],
      hooks: data.hooks || [],
      subscribes: data.subscribes || [],
      registeredAt: Date.now()
    });

    // Indexar APIs
    if (data.apis) {
      for (const api of data.apis) {
        const apiPath = `/modules/${moduleName}${api.path}`;
        // Use method + path as key to allow multiple HTTP methods on same path
        const apiKey = `${api.method}:${apiPath}`;
        this.apiIndex.set(apiKey, {
          moduleName,
          apiName: api.name,
          method: api.method,
          path: apiPath,
          handler: api.handler
        });
      }
    }

    // Indexar hooks
    if (data.hooks) {
      for (const hookName of data.hooks) {
        if (!this.hookIndex.has(hookName)) {
          this.hookIndex.set(hookName, new Set());
        }
        this.hookIndex.get(hookName).add(moduleName);
      }
    }

    if (this.logger) {
      this.logger.debug('module.registered', {
        module: moduleName,
        apis: data.apis ? data.apis.length : 0,
        hooks: data.hooks ? data.hooks.length : 0
      });
    }
  }

  /**
   * Desregistra un módulo
   *
   * @param {string} moduleName - Nombre del módulo
   */
  unregister(moduleName) {
    const moduleData = this.modules.get(moduleName);
    if (!moduleData) {
      return;
    }

    // Remover APIs del índice
    for (const api of moduleData.apis) {
      const apiPath = `/modules/${moduleName}${api.path}`;
      this.apiIndex.delete(apiPath);
    }

    // Remover hooks del índice
    for (const hookName of moduleData.hooks) {
      const hookSet = this.hookIndex.get(hookName);
      if (hookSet) {
        hookSet.delete(moduleName);
        if (hookSet.size === 0) {
          this.hookIndex.delete(hookName);
        }
      }
    }

    // Remover módulo
    this.modules.delete(moduleName);

    if (this.logger) {
      this.logger.debug('module.unregistered', {
        module: moduleName
      });
    }
  }

  /**
   * Obtiene todos los módulos registrados
   *
   * @returns {Array<Object>} Array de módulos
   */
  getAll() {
    return Array.from(this.modules.entries()).map(([name, data]) => ({
      name,
      version: data.manifest.version,
      description: data.manifest.description,
      apis: data.apis.map(a => ({ name: a.name, method: a.method, path: a.path })),
      hooks: data.hooks,
      subscribes: data.subscribes,
      registeredAt: data.registeredAt
    }));
  }

  /**
   * Obtiene un módulo por nombre
   *
   * @param {string} moduleName - Nombre del módulo
   * @returns {Object|null} Module data o null
   */
  get(moduleName) {
    return this.modules.get(moduleName) || null;
  }

  /**
   * Obtiene las APIs expuestas por un módulo
   *
   * @param {string} moduleName - Nombre del módulo
   * @returns {Array<Object>} APIs del módulo
   */
  getModuleAPIs(moduleName) {
    const moduleData = this.modules.get(moduleName);
    return moduleData ? moduleData.apis : [];
  }

  /**
   * Obtiene todos los módulos que registran un hook específico
   *
   * @param {string} hookName - Nombre del hook
   * @returns {Array<string>} Array de nombres de módulos
   */
  getModulesWithHook(hookName) {
    const hookSet = this.hookIndex.get(hookName);
    return hookSet ? Array.from(hookSet) : [];
  }

  /**
   * Busca un handler de API por path y método
   *
   * @param {string} path - Path de la API
   * @param {string} method - Método HTTP
   * @returns {Object|null} API data o null
   */
  findAPI(path, method) {
    const apiKey = `${method}:${path}`;
    const apiData = this.apiIndex.get(apiKey);
    return apiData || null;
  }

  /**
   * Obtiene todas las APIs registradas
   *
   * @returns {Array<Object>} Array de APIs
   */
  getAllAPIs() {
    return Array.from(this.apiIndex.entries()).map(([key, data]) => ({
      path: data.path,
      method: data.method,
      moduleName: data.moduleName,
      apiName: data.apiName
    }));
  }

  /**
   * Verifica si un módulo está registrado
   *
   * @param {string} moduleName - Nombre del módulo
   * @returns {boolean}
   */
  has(moduleName) {
    return this.modules.has(moduleName);
  }

  /**
   * Obtiene estadísticas del registry
   *
   * @returns {Object} Estadísticas
   */
  getStats() {
    return {
      total_modules: this.modules.size,
      total_apis: this.apiIndex.size,
      total_hooks: this.hookIndex.size
    };
  }
}

module.exports = ModuleRegistry;

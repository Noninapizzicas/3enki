/**
 * Auto-UI Resolver v2.0
 *
 * Resuelve referencias dinámicas en configuraciones:
 * - @data.user.name
 * - @metrics.total
 * - @env.API_URL
 * - @compute:sum(items.price)
 * - @i18n.messages.welcome
 */

class Resolver {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.eventBus = options.eventBus;

    // Data sources
    this.dataSources = new Map();
    this.computeFunctions = new Map();

    // Cache
    this.cache = new Map();
    this.cacheTTL = options.cacheTTL || 60000; // 60s default

    // Register built-in functions
    this.registerBuiltInFunctions();
  }

  // ==========================================
  // Data Source Registration
  // ==========================================

  /**
   * Registra una fuente de datos
   */
  registerDataSource(name, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Data source handler must be a function');
    }

    this.dataSources.set(name, handler);
    this.logger.info(`[Resolver] Registered data source: ${name}`);

    return this;
  }

  /**
   * Registra múltiples fuentes
   */
  registerDataSources(sources) {
    for (const [name, handler] of Object.entries(sources)) {
      this.registerDataSource(name, handler);
    }
    return this;
  }

  /**
   * Registra función de cómputo
   */
  registerCompute(name, fn) {
    if (typeof fn !== 'function') {
      throw new Error('Compute function must be a function');
    }

    this.computeFunctions.set(name, fn);
    this.logger.info(`[Resolver] Registered compute function: ${name}`);

    return this;
  }

  // ==========================================
  // Resolution
  // ==========================================

  /**
   * Resuelve un valor o referencia
   *
   * @param {*} value - Valor a resolver
   * @param {Object} context - Contexto de resolución
   * @returns {Promise<*>} Valor resuelto
   */
  async resolve(value, context = {}) {
    // Si no es string, devolver tal cual
    if (typeof value !== 'string') {
      return value;
    }

    // Si no empieza con @, es valor literal
    if (!value.startsWith('@')) {
      return value;
    }

    try {
      // Parsear referencia
      const ref = this.parseReference(value);

      // Resolver según tipo
      switch (ref.type) {
        case 'data':
          return await this.resolveData(ref, context);
        case 'metrics':
          return await this.resolveMetrics(ref, context);
        case 'env':
          return this.resolveEnv(ref, context);
        case 'compute':
          return await this.resolveCompute(ref, context);
        case 'i18n':
          return this.resolveI18n(ref, context);
        case 'context':
          return this.resolveContext(ref, context);
        case 'api':
          return await this.resolveApi(ref, context);
        default:
          this.logger.warn(`[Resolver] Unknown reference type: ${ref.type}`);
          return value;
      }

    } catch (error) {
      this.logger.error('[Resolver] Resolution error:', error);
      return value; // Fallback to original value
    }
  }

  /**
   * Resuelve múltiples valores
   */
  async resolveMany(values, context = {}) {
    if (Array.isArray(values)) {
      return await Promise.all(values.map(v => this.resolve(v, context)));
    }

    if (typeof values === 'object' && values !== null) {
      const resolved = {};
      for (const [key, value] of Object.entries(values)) {
        resolved[key] = await this.resolve(value, context);
      }
      return resolved;
    }

    return await this.resolve(values, context);
  }

  /**
   * Resuelve objeto completo (recursivo)
   */
  async resolveDeep(obj, context = {}) {
    if (Array.isArray(obj)) {
      return await Promise.all(obj.map(item => this.resolveDeep(item, context)));
    }

    if (typeof obj === 'object' && obj !== null) {
      const resolved = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = await this.resolveDeep(value, context);
      }
      return resolved;
    }

    return await this.resolve(obj, context);
  }

  // ==========================================
  // Reference Parsers
  // ==========================================

  /**
   * Parsea una referencia
   * Ejemplos:
   *   @data.user.name → { type: 'data', path: 'user.name' }
   *   @compute:sum(items.price) → { type: 'compute', fn: 'sum', args: ['items.price'] }
   */
  parseReference(ref) {
    // Remove @
    const str = ref.slice(1);

    // Check for compute function: @compute:sum(...)
    const computeMatch = str.match(/^(\w+):(\w+)\((.*?)\)$/);
    if (computeMatch) {
      return {
        type: computeMatch[1],
        function: computeMatch[2],
        args: computeMatch[3].split(',').map(s => s.trim())
      };
    }

    // Simple path: @data.user.name
    const parts = str.split('.');
    return {
      type: parts[0],
      path: parts.slice(1).join('.'),
      parts: parts.slice(1)
    };
  }

  // ==========================================
  // Resolution Methods
  // ==========================================

  /**
   * Resuelve referencia de datos
   */
  async resolveData(ref, context) {
    const cacheKey = `data:${ref.path}`;

    // Check cache
    const cached = this.getCache(cacheKey);
    if (cached !== undefined) return cached;

    // Get data source
    const handler = this.dataSources.get('data');
    if (!handler) {
      this.logger.warn('[Resolver] No data source registered');
      return null;
    }

    // Resolve
    const data = await handler(ref.path, context);
    const value = this.getNestedValue(data, ref.parts);

    // Cache
    this.setCache(cacheKey, value);

    return value;
  }

  /**
   * Resuelve referencia de métricas
   */
  async resolveMetrics(ref, context) {
    const cacheKey = `metrics:${ref.path}`;

    // Check cache
    const cached = this.getCache(cacheKey);
    if (cached !== undefined) return cached;

    // Get metrics handler
    const handler = this.dataSources.get('metrics');
    if (!handler) {
      this.logger.warn('[Resolver] No metrics source registered');
      return null;
    }

    // Resolve
    const value = await handler(ref.path, context);

    // Cache
    this.setCache(cacheKey, value);

    return value;
  }

  /**
   * Resuelve variable de entorno
   */
  resolveEnv(ref, context) {
    return process.env[ref.path] || null;
  }

  /**
   * Resuelve función de cómputo
   */
  async resolveCompute(ref, context) {
    const fn = this.computeFunctions.get(ref.function);
    if (!fn) {
      this.logger.warn(`[Resolver] Compute function not found: ${ref.function}`);
      return null;
    }

    // Resolver argumentos primero
    const resolvedArgs = await Promise.all(
      ref.args.map(arg => this.resolve(`@${arg}`, context))
    );

    // Ejecutar función
    return fn(...resolvedArgs, context);
  }

  /**
   * Resuelve cadena i18n
   */
  resolveI18n(ref, context) {
    // TODO: Implementar sistema i18n completo
    // Por ahora devolver la key
    return ref.path;
  }

  /**
   * Resuelve valor del contexto
   */
  resolveContext(ref, context) {
    return this.getNestedValue(context, ref.parts);
  }

  /**
   * Resuelve llamada a API
   */
  async resolveApi(ref, context) {
    const cacheKey = `api:${ref.path}`;

    // Check cache
    const cached = this.getCache(cacheKey);
    if (cached !== undefined) return cached;

    try {
      // Construir URL
      const url = `http://localhost:3000${ref.path}`;

      // Fetch
      const response = await fetch(url);
      const json = await response.json();
      const value = json.data || json;

      // Cache
      this.setCache(cacheKey, value);

      return value;

    } catch (error) {
      this.logger.error('[Resolver] API resolution error:', error);
      return null;
    }
  }

  // ==========================================
  // Built-in Compute Functions
  // ==========================================

  registerBuiltInFunctions() {
    // Suma
    this.registerCompute('sum', (...args) => {
      const numbers = args.filter(arg => Array.isArray(arg) ? true : typeof arg === 'number');
      if (numbers.length === 0) return 0;

      // Si es array de objetos, sumar
      if (Array.isArray(numbers[0])) {
        return numbers[0].reduce((sum, n) => sum + (typeof n === 'number' ? n : 0), 0);
      }

      // Si son números, sumar
      return numbers.reduce((sum, n) => sum + n, 0);
    });

    // Promedio
    this.registerCompute('avg', (...args) => {
      const numbers = args.filter(arg => Array.isArray(arg) ? true : typeof arg === 'number');
      if (numbers.length === 0) return 0;

      if (Array.isArray(numbers[0])) {
        const sum = numbers[0].reduce((s, n) => s + (typeof n === 'number' ? n : 0), 0);
        return sum / numbers[0].length;
      }

      const sum = numbers.reduce((s, n) => s + n, 0);
      return sum / numbers.length;
    });

    // Cuenta
    this.registerCompute('count', (array) => {
      if (!Array.isArray(array)) return 0;
      return array.length;
    });

    // Mínimo
    this.registerCompute('min', (...args) => {
      const numbers = args.filter(arg => typeof arg === 'number');
      if (numbers.length === 0) return null;
      return Math.min(...numbers);
    });

    // Máximo
    this.registerCompute('max', (...args) => {
      const numbers = args.filter(arg => typeof arg === 'number');
      if (numbers.length === 0) return null;
      return Math.max(...numbers);
    });

    // Concatenar
    this.registerCompute('concat', (...args) => {
      return args.map(arg => String(arg)).join('');
    });

    // Formatear número
    this.registerCompute('formatNumber', (num, decimals = 2) => {
      if (typeof num !== 'number') return num;
      return num.toFixed(decimals);
    });

    // Formatear fecha
    this.registerCompute('formatDate', (date, locale = 'es-ES') => {
      if (!date) return '';
      return new Date(date).toLocaleDateString(locale);
    });

    // Porcentaje
    this.registerCompute('percent', (value, total) => {
      if (!total || total === 0) return 0;
      return ((value / total) * 100).toFixed(2);
    });

    // Filtrar
    this.registerCompute('filter', (array, property, value) => {
      if (!Array.isArray(array)) return [];
      return array.filter(item => item[property] === value);
    });

    // Mapear
    this.registerCompute('map', (array, property) => {
      if (!Array.isArray(array)) return [];
      return array.map(item => item[property]);
    });
  }

  // ==========================================
  // Utilities
  // ==========================================

  /**
   * Obtiene valor anidado de un objeto
   */
  getNestedValue(obj, parts) {
    if (!obj || !parts || parts.length === 0) return obj;

    let value = obj;
    for (const part of parts) {
      if (value === null || value === undefined) return null;
      value = value[part];
    }

    return value;
  }

  /**
   * Cache get
   */
  getCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return undefined;

    // Check TTL
    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return undefined;
    }

    return cached.value;
  }

  /**
   * Cache set
   */
  setCache(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  /**
   * Limpia cache
   */
  clearCache() {
    this.cache.clear();
    this.logger.info('[Resolver] Cache cleared');
  }

  /**
   * Limpia cache expirado
   */
  cleanExpiredCache() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.cacheTTL) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.info(`[Resolver] Cleaned ${cleaned} expired cache entries`);
    }

    return cleaned;
  }

  /**
   * Obtiene estadísticas
   */
  getStats() {
    return {
      dataSources: this.dataSources.size,
      computeFunctions: this.computeFunctions.size,
      cacheSize: this.cache.size
    };
  }
}

module.exports = Resolver;

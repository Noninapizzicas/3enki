/**
 * Variable Resolver
 * Resuelve variables {{ path.to.value }} en strings y objetos
 */

class VariableResolver {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Resuelve todas las variables en un valor
   * @param {any} value - String, objeto o array con variables
   * @param {object} context - Contexto con valores disponibles
   * @returns {any} Valor con variables resueltas
   */
  resolve(value, context) {
    if (typeof value === 'string') {
      return this.resolveString(value, context);
    }

    if (Array.isArray(value)) {
      return value.map(item => this.resolve(item, context));
    }

    if (value && typeof value === 'object') {
      return this.resolveObject(value, context);
    }

    return value;
  }

  /**
   * Resuelve variables en un string
   * Soporta:
   * - {{ trigger.file.path }} - Acceso a propiedades
   * - {{ steps.ocr.output.text }} - Resultados de pasos anteriores
   * - {{ env.API_KEY }} - Variables de entorno
   * - {{ now }} - Timestamp actual
   * - {{ uuid }} - UUID aleatorio
   */
  resolveString(str, context) {
    // Patrón para {{ variable }}
    const pattern = /\{\{\s*([^}]+)\s*\}\}/g;

    // Si el string es SOLO una variable, devolver el valor directo (preserva tipo)
    const fullMatch = str.match(/^\{\{\s*([^}]+)\s*\}\}$/);
    if (fullMatch) {
      const value = this.getValue(fullMatch[1].trim(), context);
      return value !== undefined ? value : str;
    }

    // Si tiene variables mezcladas con texto, interpolar como string
    return str.replace(pattern, (match, path) => {
      const value = this.getValue(path.trim(), context);
      if (value === undefined) {
        this.logger?.debug('variable-resolver.undefined', { path: path.trim() });
        return match; // Mantener original si no se encuentra
      }
      // Convertir a string si es objeto
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value);
    });
  }

  /**
   * Resuelve variables en un objeto (recursivo)
   */
  resolveObject(obj, context) {
    const resolved = {};
    for (const [key, value] of Object.entries(obj)) {
      // También resolver claves si tienen variables
      const resolvedKey = this.resolveString(key, context);
      resolved[resolvedKey] = this.resolve(value, context);
    }
    return resolved;
  }

  /**
   * Obtiene valor de un path
   * Ej: "trigger.file.path" -> context.trigger.file.path
   */
  getValue(path, context) {
    // Valores especiales
    if (path === 'now') {
      return new Date().toISOString();
    }
    if (path === 'timestamp') {
      return Date.now();
    }
    if (path === 'uuid') {
      return this.generateUUID();
    }
    if (path === 'date') {
      return new Date().toISOString().split('T')[0];
    }
    if (path === 'time') {
      return new Date().toISOString().split('T')[1].split('.')[0];
    }

    // Variables de entorno
    if (path.startsWith('env.')) {
      return process.env[path.slice(4)];
    }

    // Funciones básicas
    if (path.startsWith('lowercase(') && path.endsWith(')')) {
      const inner = path.slice(10, -1);
      const value = this.getValue(inner, context);
      return typeof value === 'string' ? value.toLowerCase() : value;
    }
    if (path.startsWith('uppercase(') && path.endsWith(')')) {
      const inner = path.slice(10, -1);
      const value = this.getValue(inner, context);
      return typeof value === 'string' ? value.toUpperCase() : value;
    }
    if (path.startsWith('length(') && path.endsWith(')')) {
      const inner = path.slice(7, -1);
      const value = this.getValue(inner, context);
      return value?.length || 0;
    }
    // globalPath(path) - Convierte rutas data/... a @/... para acceso global
    if (path.startsWith('globalPath(') && path.endsWith(')')) {
      const inner = path.slice(11, -1);
      const value = this.getValue(inner, context);
      if (typeof value === 'string') {
        // Quitar prefijo 'data/' si existe y agregar '@/'
        const cleanPath = value.replace(/^(\.\/)?data\//, '');
        return `@/${cleanPath}`;
      }
      return value;
    }

    // json(path) - Serializa un objeto a JSON string
    if (path.startsWith('json(') && path.endsWith(')')) {
      const inner = path.slice(5, -1);
      const value = this.getValue(inner, context);
      if (typeof value === 'object' && value !== null) {
        return JSON.stringify(value, null, 2);
      }
      return String(value);
    }

    if (path.startsWith('default(') && path.endsWith(')')) {
      // default(trigger.caption, "sin caption")
      const inner = path.slice(8, -1);
      const parts = inner.split(',').map(p => p.trim());
      const value = this.getValue(parts[0], context);
      if (value === undefined || value === null || value === '') {
        // Quitar comillas del default
        return parts[1]?.replace(/^["']|["']$/g, '') || '';
      }
      return value;
    }

    // Path normal: navegar por el objeto
    const parts = path.split('.');
    let current = context;

    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }

      // Soporte para arrays: steps[0] o steps.0
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        current = current[arrayMatch[1]]?.[parseInt(arrayMatch[2])];
      } else {
        current = current[part];
      }
    }

    return current;
  }

  /**
   * Genera UUID v4
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Evalúa una condición simple
   * Soporta: ==, !=, <, >, <=, >=, contains, startsWith, endsWith
   */
  evaluateCondition(condition, context) {
    // Resolver variables en la condición primero
    const resolved = this.resolveString(condition, context);

    // Operadores soportados
    const operators = [
      { op: '===', fn: (a, b) => a === b },
      { op: '!==', fn: (a, b) => a !== b },
      { op: '==', fn: (a, b) => a == b },
      { op: '!=', fn: (a, b) => a != b },
      { op: '>=', fn: (a, b) => parseFloat(a) >= parseFloat(b) },
      { op: '<=', fn: (a, b) => parseFloat(a) <= parseFloat(b) },
      { op: '>', fn: (a, b) => parseFloat(a) > parseFloat(b) },
      { op: '<', fn: (a, b) => parseFloat(a) < parseFloat(b) },
      { op: ' contains ', fn: (a, b) => String(a).includes(b) },
      { op: ' startsWith ', fn: (a, b) => String(a).startsWith(b) },
      { op: ' endsWith ', fn: (a, b) => String(a).endsWith(b) },
    ];

    for (const { op, fn } of operators) {
      if (resolved.includes(op)) {
        const [left, right] = resolved.split(op).map(s => s.trim().replace(/^["']|["']$/g, ''));
        return fn(left, right);
      }
    }

    // Si no hay operador, evaluar como truthy/falsy
    const value = this.getValue(condition, context);
    return !!value;
  }
}

module.exports = VariableResolver;

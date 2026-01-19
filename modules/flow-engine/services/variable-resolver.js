/**
 * Variable Resolver
 * Resuelve variables {{ path.to.value }} en strings y objetos
 *
 * Funciones soportadas:
 * - Strings: lowercase, uppercase, trim, split, substring, replace, join, first, last
 * - Math: add, subtract, multiply, divide, round, floor, ceil, abs, min, max
 * - Objects: keys, values, count, isEmpty, get
 * - Utils: globalPath, projectPath, json, default, length
 * - Specials: now, timestamp, uuid, date, time, env.*
 */

class VariableResolver {
  constructor(logger) {
    this.logger = logger;

    // Registry de funciones para extensibilidad
    this.functions = this._initFunctions();
  }

  /**
   * Inicializa las funciones disponibles
   */
  _initFunctions() {
    return {
      // === String functions ===
      lowercase: (args, ctx) => {
        const value = this.getValue(args[0], ctx);
        return typeof value === 'string' ? value.toLowerCase() : value;
      },
      uppercase: (args, ctx) => {
        const value = this.getValue(args[0], ctx);
        return typeof value === 'string' ? value.toUpperCase() : value;
      },
      trim: (args, ctx) => {
        const value = this.getValue(args[0], ctx);
        return typeof value === 'string' ? value.trim() : value;
      },
      split: (args, ctx) => {
        // split(path, delimiter)
        const value = this.getValue(args[0], ctx);
        const delimiter = this._parseArg(args[1]) || ',';
        return typeof value === 'string' ? value.split(delimiter) : [value];
      },
      substring: (args, ctx) => {
        // substring(path, start, end?)
        const value = this.getValue(args[0], ctx);
        const start = parseInt(this._parseArg(args[1])) || 0;
        const end = args[2] ? parseInt(this._parseArg(args[2])) : undefined;
        return typeof value === 'string' ? value.substring(start, end) : value;
      },
      replace: (args, ctx) => {
        // replace(path, search, replacement)
        const value = this.getValue(args[0], ctx);
        const search = this._parseArg(args[1]) || '';
        const replacement = this._parseArg(args[2]) || '';
        return typeof value === 'string' ? value.replace(new RegExp(search, 'g'), replacement) : value;
      },
      join: (args, ctx) => {
        // join(path, delimiter)
        const value = this.getValue(args[0], ctx);
        const delimiter = this._parseArg(args[1]) || ',';
        return Array.isArray(value) ? value.join(delimiter) : value;
      },
      first: (args, ctx) => {
        // first(path) - primer elemento de array o primer char de string
        const value = this.getValue(args[0], ctx);
        if (Array.isArray(value)) return value[0];
        if (typeof value === 'string') return value[0];
        return value;
      },
      last: (args, ctx) => {
        // last(path) - último elemento de array o último char de string
        const value = this.getValue(args[0], ctx);
        if (Array.isArray(value)) return value[value.length - 1];
        if (typeof value === 'string') return value[value.length - 1];
        return value;
      },

      // === Math functions ===
      add: (args, ctx) => {
        const a = this._toNumber(this.getValue(args[0], ctx));
        const b = this._toNumber(this._parseArg(args[1]));
        return a + b;
      },
      subtract: (args, ctx) => {
        const a = this._toNumber(this.getValue(args[0], ctx));
        const b = this._toNumber(this._parseArg(args[1]));
        return a - b;
      },
      multiply: (args, ctx) => {
        const a = this._toNumber(this.getValue(args[0], ctx));
        const b = this._toNumber(this._parseArg(args[1]));
        return a * b;
      },
      divide: (args, ctx) => {
        const a = this._toNumber(this.getValue(args[0], ctx));
        const b = this._toNumber(this._parseArg(args[1]));
        return b !== 0 ? a / b : 0;
      },
      round: (args, ctx) => {
        const value = this._toNumber(this.getValue(args[0], ctx));
        const decimals = args[1] ? parseInt(this._parseArg(args[1])) : 0;
        const factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
      },
      floor: (args, ctx) => Math.floor(this._toNumber(this.getValue(args[0], ctx))),
      ceil: (args, ctx) => Math.ceil(this._toNumber(this.getValue(args[0], ctx))),
      abs: (args, ctx) => Math.abs(this._toNumber(this.getValue(args[0], ctx))),
      min: (args, ctx) => {
        const values = args.map(a => this._toNumber(this.getValue(a, ctx) ?? this._parseArg(a)));
        return Math.min(...values);
      },
      max: (args, ctx) => {
        const values = args.map(a => this._toNumber(this.getValue(a, ctx) ?? this._parseArg(a)));
        return Math.max(...values);
      },

      // === Object/Array functions ===
      keys: (args, ctx) => {
        const value = this.getValue(args[0], ctx);
        return value && typeof value === 'object' ? Object.keys(value) : [];
      },
      values: (args, ctx) => {
        const value = this.getValue(args[0], ctx);
        return value && typeof value === 'object' ? Object.values(value) : [];
      },
      count: (args, ctx) => {
        const value = this.getValue(args[0], ctx);
        if (Array.isArray(value)) return value.length;
        if (value && typeof value === 'object') return Object.keys(value).length;
        return 0;
      },
      isEmpty: (args, ctx) => {
        const value = this.getValue(args[0], ctx);
        if (value === undefined || value === null || value === '') return true;
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === 'object') return Object.keys(value).length === 0;
        return false;
      },
      get: (args, ctx) => {
        // get(path, defaultValue) - con valor por defecto
        const value = this.getValue(args[0], ctx);
        if (value === undefined || value === null) {
          return this._parseArg(args[1]);
        }
        return value;
      },

      // === Utility functions ===
      length: (args, ctx) => {
        const value = this.getValue(args[0], ctx);
        return value?.length || 0;
      },
      globalPath: (args, ctx) => {
        const value = this.getValue(args[0], ctx);
        if (typeof value === 'string') {
          const cleanPath = value.replace(/^(\.\/)?data\//, '');
          return `@/${cleanPath}`;
        }
        return value;
      },
      projectPath: (args, ctx) => {
        // projectPath('inbox') -> @/projects/{projectId}/inbox
        // projectPath('inbox', trigger.file.name) -> @/projects/{projectId}/inbox/{filename}
        // projectPath('datos', date, '_factura.json') -> @/projects/{projectId}/datos/{date}_factura.json
        const projectId = ctx?.project?.id;

        // Construir ruta uniendo todos los argumentos
        const parts = args.map(arg => {
          // Intentar resolver como variable primero
          const resolved = this.getValue(arg, ctx);
          if (resolved !== undefined) return resolved;
          // Si no es variable, parsear como literal
          return this._parseArg(arg) || '';
        }).filter(p => p !== '');

        const relativePath = parts.join('').replace(/^\//, '');

        // Si ya es una ruta completa @/, devolverla tal cual (evitar doble prefijo)
        if (relativePath.startsWith('@/')) {
          return relativePath;
        }

        if (!projectId) {
          this.logger?.warn('variable-resolver.projectPath.no_project', { relativePath });
          return `@/${relativePath}`.replace(/\/+/g, '/'); // Fallback sin proyecto
        }
        // Limpiar dobles // excepto en @/
        const result = `@/projects/${projectId}/${relativePath}`;
        return result.replace(/([^:])\/+/g, '$1/');
      },
      json: (args, ctx) => {
        const value = this.getValue(args[0], ctx);
        if (typeof value === 'object' && value !== null) {
          return JSON.stringify(value, null, 2);
        }
        return String(value);
      },
      default: (args, ctx) => {
        const value = this.getValue(args[0], ctx);
        if (value === undefined || value === null || value === '') {
          return this._parseArg(args[1]) || '';
        }
        return value;
      },

      // === File/Path functions ===
      mimeToExt: (args, ctx) => {
        // mimeToExt(mimeType) - Convierte mimeType a extensión de archivo
        const mimeType = this.getValue(args[0], ctx) || this._parseArg(args[0]) || '';
        const map = {
          'image/jpeg': '.jpg',
          'image/png': '.png',
          'image/webp': '.webp',
          'image/gif': '.gif',
          'image/bmp': '.bmp',
          'image/tiff': '.tiff',
          'application/pdf': '.pdf',
          'text/plain': '.txt',
          'application/json': '.json',
          'application/xml': '.xml'
        };
        return map[mimeType] || '';
      },
      cleanPath: (args, ctx) => {
        // cleanPath(path) - Limpia rutas removiendo dobles //
        const path = this.getValue(args[0], ctx) || this._parseArg(args[0]) || '';
        return path.replace(/\/+/g, '/').replace('@/', '@/');
      },
      parseJson: (args, ctx) => {
        // parseJson(string) - Parsea un string JSON a objeto
        const value = this.getValue(args[0], ctx) || this._parseArg(args[0]) || '';
        if (typeof value === 'object') return value; // Ya es objeto
        try {
          // Limpiar posibles markdown code blocks
          let clean = value.trim();
          if (clean.startsWith('```json')) clean = clean.slice(7);
          if (clean.startsWith('```')) clean = clean.slice(3);
          if (clean.endsWith('```')) clean = clean.slice(0, -3);
          return JSON.parse(clean.trim());
        } catch (e) {
          this.logger?.warn('variable-resolver.parseJson.error', { error: e.message });
          return null;
        }
      },

      // === Type conversion ===
      int: (args, ctx) => parseInt(this.getValue(args[0], ctx)) || 0,
      float: (args, ctx) => parseFloat(this.getValue(args[0], ctx)) || 0,
      string: (args, ctx) => String(this.getValue(args[0], ctx) ?? ''),
      bool: (args, ctx) => !!this.getValue(args[0], ctx)
    };
  }

  /**
   * Helper: convierte a número
   */
  _toNumber(val) {
    if (typeof val === 'number') return val;
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Helper: parsea argumento (quita comillas)
   */
  _parseArg(arg) {
    if (arg === undefined) return undefined;
    const trimmed = arg.trim();
    // Quitar comillas si las tiene
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }
    // Intentar parsear como número
    const num = parseFloat(trimmed);
    if (!isNaN(num) && trimmed === String(num)) {
      return num;
    }
    return trimmed;
  }

  /**
   * Parsea una llamada a función: name(arg1, arg2, ...)
   * Retorna { name, args } o null
   */
  _parseFunction(path) {
    const match = path.match(/^(\w+)\((.*)?\)$/);
    if (!match) return null;

    const name = match[1];
    const argsStr = match[2] || '';

    // Parsear argumentos respetando comillas y paréntesis anidados
    const args = [];
    let current = '';
    let depth = 0;
    let inQuote = null;

    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i];

      if (inQuote) {
        current += char;
        if (char === inQuote) inQuote = null;
      } else if (char === '"' || char === "'") {
        current += char;
        inQuote = char;
      } else if (char === '(') {
        current += char;
        depth++;
      } else if (char === ')') {
        current += char;
        depth--;
      } else if (char === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      args.push(current.trim());
    }

    return { name, args };
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
    // Valores especiales (sin argumentos)
    const specials = {
      'now': () => new Date().toISOString(),
      'timestamp': () => Date.now(),
      'uuid': () => this.generateUUID(),
      'date': () => new Date().toISOString().split('T')[0],
      'time': () => new Date().toISOString().split('T')[1].split('.')[0]
    };

    if (specials[path]) {
      return specials[path]();
    }

    // Variables de entorno
    if (path.startsWith('env.')) {
      return process.env[path.slice(4)];
    }

    // Verificar si es una llamada a función
    const fn = this._parseFunction(path);
    if (fn && this.functions[fn.name]) {
      try {
        return this.functions[fn.name](fn.args, context);
      } catch (e) {
        this.logger?.warn('variable-resolver.function.error', { function: fn.name, error: e.message });
        return undefined;
      }
    }

    // Path normal: navegar por el objeto
    return this._navigatePath(path, context);
  }

  /**
   * Navega por un path en el contexto
   */
  _navigatePath(path, context) {
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
   * Evalúa una condición
   * Soporta:
   * - Comparadores: ==, !=, <, >, <=, >=, ===, !==
   * - Texto: contains, startsWith, endsWith
   * - Lógicos: &&, ||
   * - Negación: ! al inicio
   */
  evaluateCondition(condition, context) {
    // Resolver variables en la condición primero
    const resolved = this.resolveString(condition, context);

    // Manejar operadores lógicos && y || (con precedencia correcta)
    // || tiene menor precedencia, evaluarlo primero (buscar de derecha a izquierda)
    const orParts = this._splitLogical(resolved, '||');
    if (orParts.length > 1) {
      return orParts.some(part => this.evaluateCondition(part.trim(), context));
    }

    // && tiene mayor precedencia
    const andParts = this._splitLogical(resolved, '&&');
    if (andParts.length > 1) {
      return andParts.every(part => this.evaluateCondition(part.trim(), context));
    }

    // Manejar negación: !condition
    if (resolved.trim().startsWith('!') && !resolved.includes('!=')) {
      const inner = resolved.trim().slice(1).trim();
      return !this.evaluateCondition(inner, context);
    }

    // Operadores de comparación
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
      { op: ' matches ', fn: (a, b) => new RegExp(b).test(String(a)) },
    ];

    for (const { op, fn } of operators) {
      const idx = resolved.indexOf(op);
      if (idx !== -1) {
        const left = resolved.slice(0, idx).trim().replace(/^["']|["']$/g, '');
        const right = resolved.slice(idx + op.length).trim().replace(/^["']|["']$/g, '');
        return fn(left, right);
      }
    }

    // Si no hay operador, evaluar como truthy/falsy
    // Pero primero verificar si es una variable o función
    const value = this.getValue(condition.trim(), context);
    if (value !== undefined) {
      return !!value;
    }

    // Evaluar el string resuelto como truthy
    return !!resolved && resolved !== 'false' && resolved !== '0' && resolved !== 'null' && resolved !== 'undefined';
  }

  /**
   * Divide una condición por operador lógico respetando paréntesis
   */
  _splitLogical(str, operator) {
    const parts = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      if (char === '(') {
        depth++;
        current += char;
      } else if (char === ')') {
        depth--;
        current += char;
      } else if (depth === 0 && str.slice(i, i + operator.length) === operator) {
        parts.push(current);
        current = '';
        i += operator.length - 1;
      } else {
        current += char;
      }
    }

    if (current) {
      parts.push(current);
    }

    return parts;
  }
}

module.exports = VariableResolver;

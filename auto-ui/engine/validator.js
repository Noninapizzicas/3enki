/**
 * Auto-UI Validator v2.0
 *
 * Sistema de validación avanzado para formularios y datos
 */

class Validator {
  constructor(options = {}) {
    this.logger = options.logger || console;

    // Registry de validadores personalizados
    this.customValidators = new Map();

    // Registry de validadores async
    this.asyncValidators = new Map();

    // Register built-in validators
    this.registerBuiltInValidators();
  }

  // ==========================================
  // Validator Registration
  // ==========================================

  /**
   * Registra un validador personalizado
   */
  register(name, validator) {
    if (typeof validator !== 'function') {
      throw new Error('Validator must be a function');
    }

    this.customValidators.set(name, validator);
    this.logger.info(`[Validator] Registered custom validator: ${name}`);

    return this;
  }

  /**
   * Registra un validador async
   */
  registerAsync(name, validator) {
    if (typeof validator !== 'function') {
      throw new Error('Async validator must be a function');
    }

    this.asyncValidators.set(name, validator);
    this.logger.info(`[Validator] Registered async validator: ${name}`);

    return this;
  }

  // ==========================================
  // Validation
  // ==========================================

  /**
   * Valida un valor contra reglas
   *
   * @param {*} value - Valor a validar
   * @param {Object} rules - Reglas de validación
   * @param {Object} context - Contexto (otros valores del formulario)
   * @returns {Promise<Object>} { valid: boolean, errors: string[] }
   */
  async validate(value, rules = {}, context = {}) {
    const errors = [];

    try {
      // Required
      if (rules.required) {
        if (!this.validateRequired(value)) {
          errors.push(rules.requiredMessage || 'Este campo es requerido');
        }
      }

      // Si no es requerido y está vacío, skip otras validaciones
      if (!rules.required && this.isEmpty(value)) {
        return { valid: true, errors: [] };
      }

      // Type
      if (rules.type) {
        const typeError = this.validateType(value, rules.type);
        if (typeError) errors.push(typeError);
      }

      // MinLength
      if (rules.minLength !== undefined) {
        const error = this.validateMinLength(value, rules.minLength);
        if (error) errors.push(error);
      }

      // MaxLength
      if (rules.maxLength !== undefined) {
        const error = this.validateMaxLength(value, rules.maxLength);
        if (error) errors.push(error);
      }

      // Min
      if (rules.min !== undefined) {
        const error = this.validateMin(value, rules.min);
        if (error) errors.push(error);
      }

      // Max
      if (rules.max !== undefined) {
        const error = this.validateMax(value, rules.max);
        if (error) errors.push(error);
      }

      // Pattern
      if (rules.pattern) {
        const error = this.validatePattern(value, rules.pattern);
        if (error) errors.push(error);
      }

      // Email
      if (rules.email) {
        const error = this.validateEmail(value);
        if (error) errors.push(error);
      }

      // URL
      if (rules.url) {
        const error = this.validateURL(value);
        if (error) errors.push(error);
      }

      // Custom validator
      if (rules.custom) {
        const customValidator = this.customValidators.get(rules.custom);
        if (customValidator) {
          const result = customValidator(value, rules, context);
          if (result !== true && result) {
            errors.push(result);
          }
        }
      }

      // Async validator
      if (rules.async) {
        const asyncValidator = this.asyncValidators.get(rules.async);
        if (asyncValidator) {
          const result = await asyncValidator(value, rules, context);
          if (result !== true && result) {
            errors.push(result);
          }
        }
      }

      // Dependencies (campos relacionados)
      if (rules.dependencies && Array.isArray(rules.dependencies)) {
        for (const dep of rules.dependencies) {
          if (!context[dep]) {
            errors.push(`Este campo depende de: ${dep}`);
          }
        }
      }

      // Conditional validation
      if (rules.conditional) {
        const shouldValidate = this.evaluateConditional(rules.conditional, context);
        if (shouldValidate && rules.conditional.rules) {
          const conditionalResult = await this.validate(value, rules.conditional.rules, context);
          if (!conditionalResult.valid) {
            errors.push(...conditionalResult.errors);
          }
        }
      }

      // OneOf (debe ser uno de los valores)
      if (rules.oneOf && Array.isArray(rules.oneOf)) {
        if (!rules.oneOf.includes(value)) {
          errors.push(`Debe ser uno de: ${rules.oneOf.join(', ')}`);
        }
      }

      // Match (debe coincidir con otro campo)
      if (rules.match) {
        if (value !== context[rules.match]) {
          errors.push(`Debe coincidir con ${rules.match}`);
        }
      }

      return {
        valid: errors.length === 0,
        errors
      };

    } catch (error) {
      this.logger.error('[Validator] Validation error:', error);
      return {
        valid: false,
        errors: ['Error de validación']
      };
    }
  }

  /**
   * Valida múltiples campos (formulario completo)
   *
   * @param {Object} data - Datos del formulario
   * @param {Object} schema - Schema de validación
   * @returns {Promise<Object>} { valid: boolean, errors: Object }
   */
  async validateForm(data, schema) {
    const errors = {};
    let isValid = true;

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];
      const result = await this.validate(value, rules, data);

      if (!result.valid) {
        errors[field] = result.errors;
        isValid = false;
      }
    }

    return {
      valid: isValid,
      errors
    };
  }

  // ==========================================
  // Individual Validators
  // ==========================================

  /**
   * Valida campo requerido
   */
  validateRequired(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }

  /**
   * Valida tipo
   */
  validateType(value, type) {
    switch (type) {
      case 'string':
        if (typeof value !== 'string') {
          return 'Debe ser texto';
        }
        break;

      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return 'Debe ser un número';
        }
        break;

      case 'integer':
        if (!Number.isInteger(Number(value))) {
          return 'Debe ser un número entero';
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          return 'Debe ser verdadero o falso';
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          return 'Debe ser una lista';
        }
        break;

      case 'object':
        if (typeof value !== 'object' || Array.isArray(value)) {
          return 'Debe ser un objeto';
        }
        break;

      case 'date':
        if (!(value instanceof Date) && isNaN(Date.parse(value))) {
          return 'Debe ser una fecha válida';
        }
        break;

      case 'email':
        return this.validateEmail(value);

      case 'url':
        return this.validateURL(value);
    }

    return null;
  }

  /**
   * Valida longitud mínima
   */
  validateMinLength(value, min) {
    const length = String(value).length;
    if (length < min) {
      return `Debe tener al menos ${min} caracteres`;
    }
    return null;
  }

  /**
   * Valida longitud máxima
   */
  validateMaxLength(value, max) {
    const length = String(value).length;
    if (length > max) {
      return `Debe tener máximo ${max} caracteres`;
    }
    return null;
  }

  /**
   * Valida valor mínimo
   */
  validateMin(value, min) {
    const num = Number(value);
    if (isNaN(num) || num < min) {
      return `Debe ser al menos ${min}`;
    }
    return null;
  }

  /**
   * Valida valor máximo
   */
  validateMax(value, max) {
    const num = Number(value);
    if (isNaN(num) || num > max) {
      return `Debe ser máximo ${max}`;
    }
    return null;
  }

  /**
   * Valida patrón regex
   */
  validatePattern(value, pattern) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    if (!regex.test(String(value))) {
      return 'Formato inválido';
    }
    return null;
  }

  /**
   * Valida email
   */
  validateEmail(value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(value))) {
      return 'Email inválido';
    }
    return null;
  }

  /**
   * Valida URL
   */
  validateURL(value) {
    try {
      new URL(String(value));
      return null;
    } catch {
      return 'URL inválida';
    }
  }

  // ==========================================
  // Built-in Custom Validators
  // ==========================================

  registerBuiltInValidators() {
    // API Key format
    this.register('apiKey', (value) => {
      if (typeof value !== 'string') return 'Debe ser texto';
      if (value.length < 20) return 'API Key demasiado corta';
      if (!/^[A-Za-z0-9_-]+$/.test(value)) return 'API Key contiene caracteres inválidos';
      return true;
    });

    // Alphanumeric
    this.register('alphanumeric', (value) => {
      if (!/^[A-Za-z0-9]+$/.test(String(value))) {
        return 'Solo se permiten letras y números';
      }
      return true;
    });

    // Alphanumeric with spaces
    this.register('alphanumericSpaces', (value) => {
      if (!/^[A-Za-z0-9\s]+$/.test(String(value))) {
        return 'Solo se permiten letras, números y espacios';
      }
      return true;
    });

    // Slug (URL-friendly)
    this.register('slug', (value) => {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value))) {
        return 'Debe ser un slug válido (minúsculas, números y guiones)';
      }
      return true;
    });

    // JSON
    this.register('json', (value) => {
      try {
        JSON.parse(String(value));
        return true;
      } catch {
        return 'Debe ser JSON válido';
      }
    });

    // Phone
    this.register('phone', (value) => {
      const phoneRegex = /^[\d\s\-\+\(\)]+$/;
      if (!phoneRegex.test(String(value))) {
        return 'Número de teléfono inválido';
      }
      return true;
    });

    // Credit card (basic)
    this.register('creditCard', (value) => {
      const cleaned = String(value).replace(/\s/g, '');
      if (!/^\d{13,19}$/.test(cleaned)) {
        return 'Número de tarjeta inválido';
      }
      return true;
    });

    // Strong password
    this.register('strongPassword', (value) => {
      const str = String(value);
      if (str.length < 8) return 'Debe tener al menos 8 caracteres';
      if (!/[a-z]/.test(str)) return 'Debe contener al menos una minúscula';
      if (!/[A-Z]/.test(str)) return 'Debe contener al menos una mayúscula';
      if (!/\d/.test(str)) return 'Debe contener al menos un número';
      if (!/[!@#$%^&*]/.test(str)) return 'Debe contener al menos un carácter especial';
      return true;
    });

    // IPv4
    this.register('ipv4', (value) => {
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipRegex.test(String(value))) {
        return 'Dirección IP inválida';
      }
      const parts = String(value).split('.');
      for (const part of parts) {
        const num = parseInt(part, 10);
        if (num < 0 || num > 255) {
          return 'Dirección IP inválida';
        }
      }
      return true;
    });

    // Color hex
    this.register('hexColor', (value) => {
      if (!/^#[0-9A-Fa-f]{6}$/.test(String(value))) {
        return 'Color hexadecimal inválido (ejemplo: #FF5733)';
      }
      return true;
    });
  }

  // ==========================================
  // Utilities
  // ==========================================

  /**
   * Verifica si un valor está vacío
   */
  isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  }

  /**
   * Evalúa condición para validación condicional
   */
  evaluateConditional(conditional, context) {
    if (!conditional.when) return false;

    const fieldValue = context[conditional.when];
    const expectedValue = conditional.equals;

    return fieldValue === expectedValue;
  }

  /**
   * Genera mensajes de error formateados
   */
  formatErrors(errors) {
    if (typeof errors === 'object' && !Array.isArray(errors)) {
      const formatted = {};
      for (const [field, fieldErrors] of Object.entries(errors)) {
        formatted[field] = Array.isArray(fieldErrors) ? fieldErrors.join(', ') : fieldErrors;
      }
      return formatted;
    }
    return errors;
  }

  /**
   * Obtiene estadísticas
   */
  getStats() {
    return {
      customValidators: this.customValidators.size,
      asyncValidators: this.asyncValidators.size
    };
  }
}

module.exports = Validator;

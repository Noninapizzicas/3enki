/**
 * Flow Validator
 * Valida definiciones de flujos contra JSON Schema
 *
 * @module flow-engine/flow-validator
 * @version 1.0.0
 */

/**
 * Schema de definición de flujo
 */
const FLOW_SCHEMA = {
  type: 'object',
  required: ['id', 'steps'],
  properties: {
    id: {
      type: 'string',
      minLength: 1,
      pattern: '^[a-zA-Z0-9_:-]+$',
      description: 'Identificador único del flujo'
    },
    name: {
      type: 'string',
      description: 'Nombre descriptivo del flujo'
    },
    description: {
      type: 'string',
      description: 'Descripción del propósito del flujo'
    },
    version: {
      type: 'string',
      pattern: '^\\d+\\.\\d+\\.\\d+$',
      description: 'Versión semántica (ej: 1.0.0)'
    },
    enabled: {
      type: 'boolean',
      default: true,
      description: 'Si el flujo está activo'
    },
    trigger: {
      type: 'object',
      properties: {
        event: {
          type: 'string',
          minLength: 1,
          description: 'Nombre del evento que dispara el flujo'
        },
        filter: {
          type: 'object',
          description: 'Filtros MongoDB-style para coincidir eventos'
        }
      }
    },
    schedule: {
      type: 'object',
      properties: {
        cron: {
          type: 'string',
          pattern: '^[0-9*,/-]+ [0-9*,/-]+ [0-9*,/-]+ [0-9*,/-]+ [0-9*,/-]+',
          description: 'Expresión cron (minuto hora día-mes mes día-semana)'
        },
        timezone: {
          type: 'string',
          description: 'Zona horaria (default: Europe/Madrid)'
        }
      }
    },
    steps: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#/$defs/step' },
      description: 'Array de pasos a ejecutar'
    }
  },
  $defs: {
    step: {
      type: 'object',
      required: ['id', 'type'],
      properties: {
        id: {
          type: 'string',
          minLength: 1,
          description: 'Identificador único del paso dentro del flujo'
        },
        type: {
          type: 'string',
          enum: ['service', 'condition', 'parallel', 'agent', 'http', 'delay', 'log', 'set', 'emit'],
          description: 'Tipo de paso'
        },
        // Propiedades comunes opcionales
        continueOnError: { type: 'boolean' },
        timeout: { type: 'number', minimum: 0 },
        retry: {
          oneOf: [
            { type: 'number', minimum: 1 },
            {
              type: 'object',
              properties: {
                attempts: { type: 'number', minimum: 1 },
                delay: { type: 'number', minimum: 0 },
                backoff: { type: 'number', minimum: 1 },
                maxDelay: { type: 'number', minimum: 0 }
              }
            }
          ]
        }
      },
      allOf: [
        // Validaciones específicas por tipo
        {
          if: { properties: { type: { const: 'service' } } },
          then: {
            required: ['service', 'function'],
            properties: {
              service: { type: 'string', minLength: 1 },
              function: { type: 'string', minLength: 1 },
              input: { type: 'object' }
            }
          }
        },
        {
          if: { properties: { type: { const: 'condition' } } },
          then: {
            required: ['condition'],
            properties: {
              condition: { type: 'string', minLength: 1 },
              then: { type: 'array', items: { $ref: '#/$defs/step' } },
              else: { type: 'array', items: { $ref: '#/$defs/step' } }
            }
          }
        },
        {
          if: { properties: { type: { const: 'parallel' } } },
          then: {
            required: ['branches'],
            properties: {
              branches: {
                type: 'array',
                minItems: 1,
                items: { type: 'array', items: { $ref: '#/$defs/step' } }
              },
              waitFor: { type: 'string', enum: ['all', 'first', 'any'] }
            }
          }
        },
        {
          if: { properties: { type: { const: 'agent' } } },
          then: {
            anyOf: [
              // Modo named agent
              { required: ['agent'] },
              // Modo inline AI
              { required: ['prompt'] }
            ],
            properties: {
              agent: { type: 'string' },
              task: { type: 'string' },
              config: { type: 'object' },
              model: { type: 'string' },
              provider: { type: 'string' },
              system: { type: 'string' },
              prompt: { type: 'string' },
              temperature: { type: 'number', minimum: 0, maximum: 2 },
              max_tokens: { type: 'number', minimum: 1 },
              tools: { type: 'array' },
              execute_tools: { type: 'boolean' }
            }
          }
        },
        {
          if: { properties: { type: { const: 'http' } } },
          then: {
            required: ['url'],
            properties: {
              url: { type: 'string', minLength: 1 },
              method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] },
              headers: { type: 'object' },
              body: {}
            }
          }
        },
        {
          if: { properties: { type: { const: 'delay' } } },
          then: {
            required: ['ms'],
            properties: {
              ms: { type: 'number', minimum: 0 }
            }
          }
        },
        {
          if: { properties: { type: { const: 'log' } } },
          then: {
            required: ['message'],
            properties: {
              level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
              message: { type: 'string' },
              data: { type: 'object' }
            }
          }
        },
        {
          if: { properties: { type: { const: 'set' } } },
          then: {
            required: ['variables'],
            properties: {
              variables: { type: 'object' }
            }
          }
        },
        {
          if: { properties: { type: { const: 'emit' } } },
          then: {
            required: ['event'],
            properties: {
              event: { type: 'string', minLength: 1 },
              data: { type: 'object' }
            }
          }
        }
      ]
    }
  }
};

/**
 * Mensajes de error legibles
 */
const ERROR_MESSAGES = {
  'required': (path, prop) => `Falta propiedad requerida '${prop}' en ${path || 'flow'}`,
  'type': (path, expected) => `${path} debe ser de tipo ${expected}`,
  'enum': (path, allowed) => `${path} debe ser uno de: ${allowed.join(', ')}`,
  'minLength': (path, min) => `${path} debe tener al menos ${min} caracter(es)`,
  'minItems': (path, min) => `${path} debe tener al menos ${min} elemento(s)`,
  'minimum': (path, min) => `${path} debe ser >= ${min}`,
  'maximum': (path, max) => `${path} debe ser <= ${max}`,
  'pattern': (path, pattern) => `${path} no coincide con el patrón requerido`,
  'anyOf': (path) => `${path} no cumple ninguna de las opciones válidas`,
  'oneOf': (path) => `${path} debe cumplir exactamente una opción`,
  'additionalProperties': (path, prop) => `Propiedad no permitida '${prop}' en ${path}`
};

class FlowValidator {
  constructor(logger) {
    this.logger = logger;
    this.schema = FLOW_SCHEMA;
    this.stepTypes = new Set(['service', 'transform', 'condition', 'parallel', 'agent', 'http', 'delay', 'log', 'set', 'emit']);
  }

  /**
   * Valida un flujo completo
   * @param {Object} flow - Definición del flujo
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(flow) {
    const errors = [];

    // Validación de estructura básica
    if (!flow || typeof flow !== 'object') {
      return { valid: false, errors: ['El flujo debe ser un objeto'] };
    }

    // Validar propiedades requeridas
    if (!flow.id) {
      errors.push(ERROR_MESSAGES.required('flow', 'id'));
    } else if (typeof flow.id !== 'string') {
      errors.push(ERROR_MESSAGES.type('flow.id', 'string'));
    } else if (!/^[a-zA-Z0-9_:-]+$/.test(flow.id)) {
      errors.push('flow.id solo puede contener letras, números, guiones, guiones bajos y dos puntos');
    }

    // Validar version si existe
    if (flow.version !== undefined) {
      if (typeof flow.version !== 'string') {
        errors.push(ERROR_MESSAGES.type('flow.version', 'string'));
      } else if (!/^\d+\.\d+\.\d+$/.test(flow.version)) {
        errors.push('flow.version debe ser versión semántica (ej: 1.0.0)');
      }
    }

    // Validar enabled
    if (flow.enabled !== undefined && typeof flow.enabled !== 'boolean') {
      errors.push(ERROR_MESSAGES.type('flow.enabled', 'boolean'));
    }

    // Validar trigger
    if (flow.trigger) {
      this.validateTrigger(flow.trigger, errors);
    }

    // Validar schedule
    if (flow.schedule) {
      this.validateSchedule(flow.schedule, errors);
    }

    // Validar steps
    if (!flow.steps) {
      errors.push(ERROR_MESSAGES.required('flow', 'steps'));
    } else if (!Array.isArray(flow.steps)) {
      errors.push(ERROR_MESSAGES.type('flow.steps', 'array'));
    } else if (flow.steps.length === 0) {
      errors.push(ERROR_MESSAGES.minItems('flow.steps', 1));
    } else {
      // Validar cada step
      const stepIds = new Set();
      flow.steps.forEach((step, index) => {
        this.validateStep(step, `flow.steps[${index}]`, errors, stepIds);
      });
    }

    // Validar que trigger o schedule exista (uno de los dos)
    if (!flow.trigger && !flow.schedule) {
      errors.push('El flujo debe tener un trigger o un schedule');
    }

    const valid = errors.length === 0;

    if (!valid && this.logger) {
      this.logger.warn('flow-validator.validation.failed', {
        flowId: flow.id,
        errorCount: errors.length,
        errors
      });
    }

    return { valid, errors };
  }

  /**
   * Valida un trigger
   */
  validateTrigger(trigger, errors, path = 'flow.trigger') {
    if (typeof trigger !== 'object') {
      errors.push(ERROR_MESSAGES.type(path, 'object'));
      return;
    }

    if (trigger.event !== undefined) {
      if (typeof trigger.event !== 'string') {
        errors.push(ERROR_MESSAGES.type(`${path}.event`, 'string'));
      } else if (trigger.event.length === 0) {
        errors.push(ERROR_MESSAGES.minLength(`${path}.event`, 1));
      }
    }

    if (trigger.filter !== undefined && typeof trigger.filter !== 'object') {
      errors.push(ERROR_MESSAGES.type(`${path}.filter`, 'object'));
    }
  }

  /**
   * Valida un schedule
   */
  validateSchedule(schedule, errors, path = 'flow.schedule') {
    if (typeof schedule !== 'object') {
      errors.push(ERROR_MESSAGES.type(path, 'object'));
      return;
    }

    if (schedule.cron !== undefined) {
      if (typeof schedule.cron !== 'string') {
        errors.push(ERROR_MESSAGES.type(`${path}.cron`, 'string'));
      } else {
        // Validar formato cron básico
        const parts = schedule.cron.trim().split(/\s+/);
        if (parts.length < 5 || parts.length > 6) {
          errors.push(`${path}.cron debe tener 5 o 6 partes (minuto hora día-mes mes día-semana [año])`);
        }
      }
    }

    if (schedule.timezone !== undefined && typeof schedule.timezone !== 'string') {
      errors.push(ERROR_MESSAGES.type(`${path}.timezone`, 'string'));
    }
  }

  /**
   * Valida un step
   */
  validateStep(step, path, errors, stepIds) {
    if (!step || typeof step !== 'object') {
      errors.push(ERROR_MESSAGES.type(path, 'object'));
      return;
    }

    // Validar id
    if (!step.id) {
      errors.push(ERROR_MESSAGES.required(path, 'id'));
    } else if (typeof step.id !== 'string') {
      errors.push(ERROR_MESSAGES.type(`${path}.id`, 'string'));
    } else {
      // Verificar IDs duplicados
      if (stepIds.has(step.id)) {
        errors.push(`ID de step duplicado: '${step.id}' en ${path}`);
      }
      stepIds.add(step.id);
    }

    // Validar type
    if (!step.type) {
      errors.push(ERROR_MESSAGES.required(path, 'type'));
    } else if (typeof step.type !== 'string') {
      errors.push(ERROR_MESSAGES.type(`${path}.type`, 'string'));
    } else if (!this.stepTypes.has(step.type)) {
      errors.push(ERROR_MESSAGES.enum(`${path}.type`, Array.from(this.stepTypes)));
    } else {
      // Validación específica por tipo
      this.validateStepByType(step, path, errors, stepIds);
    }

    // Validar propiedades comunes opcionales
    if (step.timeout !== undefined) {
      if (typeof step.timeout !== 'number' || step.timeout < 0) {
        errors.push(`${path}.timeout debe ser un número >= 0`);
      }
    }

    if (step.continueOnError !== undefined && typeof step.continueOnError !== 'boolean') {
      errors.push(ERROR_MESSAGES.type(`${path}.continueOnError`, 'boolean'));
    }

    if (step.retry !== undefined) {
      this.validateRetry(step.retry, `${path}.retry`, errors);
    }
  }

  /**
   * Valida configuración de retry
   */
  validateRetry(retry, path, errors) {
    if (typeof retry === 'number') {
      if (retry < 1) {
        errors.push(`${path} debe ser >= 1`);
      }
    } else if (typeof retry === 'object') {
      if (retry.attempts !== undefined && (typeof retry.attempts !== 'number' || retry.attempts < 1)) {
        errors.push(`${path}.attempts debe ser un número >= 1`);
      }
      if (retry.delay !== undefined && (typeof retry.delay !== 'number' || retry.delay < 0)) {
        errors.push(`${path}.delay debe ser un número >= 0`);
      }
      if (retry.backoff !== undefined && (typeof retry.backoff !== 'number' || retry.backoff < 1)) {
        errors.push(`${path}.backoff debe ser un número >= 1`);
      }
      if (retry.maxDelay !== undefined && (typeof retry.maxDelay !== 'number' || retry.maxDelay < 0)) {
        errors.push(`${path}.maxDelay debe ser un número >= 0`);
      }
    } else {
      errors.push(`${path} debe ser un número o un objeto con {attempts, delay, backoff, maxDelay}`);
    }
  }

  /**
   * Valida propiedades específicas según el tipo de step
   */
  validateStepByType(step, path, errors, stepIds) {
    switch (step.type) {
      case 'service':
        if (!step.service) {
          errors.push(ERROR_MESSAGES.required(path, 'service'));
        } else if (typeof step.service !== 'string') {
          errors.push(ERROR_MESSAGES.type(`${path}.service`, 'string'));
        }
        // Accept either 'action' (preferred) or 'function' (legacy)
        if (!step.action && !step.function) {
          errors.push(ERROR_MESSAGES.required(path, 'action'));
        } else if (step.action && typeof step.action !== 'string') {
          errors.push(ERROR_MESSAGES.type(`${path}.action`, 'string'));
        } else if (step.function && typeof step.function !== 'string') {
          errors.push(ERROR_MESSAGES.type(`${path}.function`, 'string'));
        }
        if (step.input !== undefined && typeof step.input !== 'object') {
          errors.push(ERROR_MESSAGES.type(`${path}.input`, 'object'));
        }
        break;

      case 'condition':
        // Accept either 'if' (preferred) or 'condition' (legacy)
        if (!step.if && !step.condition) {
          errors.push(ERROR_MESSAGES.required(path, 'if'));
        } else if (step.if && typeof step.if !== 'string') {
          errors.push(ERROR_MESSAGES.type(`${path}.if`, 'string'));
        } else if (step.condition && typeof step.condition !== 'string') {
          errors.push(ERROR_MESSAGES.type(`${path}.condition`, 'string'));
        }
        // then/else can be strings (step references) or arrays (inline steps)
        if (step.then !== undefined) {
          if (typeof step.then === 'string') {
            // Step reference - valid
          } else if (Array.isArray(step.then)) {
            step.then.forEach((s, i) => this.validateStep(s, `${path}.then[${i}]`, errors, stepIds));
          } else {
            errors.push(`${path}.then debe ser string (referencia a step) o array de steps`);
          }
        }
        if (step.else !== undefined) {
          if (typeof step.else === 'string') {
            // Step reference - valid
          } else if (Array.isArray(step.else)) {
            step.else.forEach((s, i) => this.validateStep(s, `${path}.else[${i}]`, errors, stepIds));
          } else {
            errors.push(`${path}.else debe ser string (referencia a step) o array de steps`);
          }
        }
        break;

      case 'parallel':
        // Accept either 'steps' (preferred) or 'branches' (legacy)
        const parallelSteps = step.steps || step.branches;
        if (!parallelSteps) {
          errors.push(ERROR_MESSAGES.required(path, 'steps'));
        } else if (!Array.isArray(parallelSteps)) {
          errors.push(ERROR_MESSAGES.type(`${path}.steps`, 'array'));
        } else if (parallelSteps.length === 0) {
          errors.push(ERROR_MESSAGES.minItems(`${path}.steps`, 1));
        } else {
          // steps is flat array of step objects
          parallelSteps.forEach((s, i) => {
            if (typeof s === 'object' && !Array.isArray(s)) {
              this.validateStep(s, `${path}.steps[${i}]`, errors, stepIds);
            } else if (Array.isArray(s)) {
              // branches format: array of arrays
              s.forEach((innerStep, si) => this.validateStep(innerStep, `${path}.branches[${i}][${si}]`, errors, stepIds));
            }
          });
        }
        if (step.waitFor !== undefined) {
          const validWaitFor = ['all', 'first', 'any'];
          if (!validWaitFor.includes(step.waitFor)) {
            errors.push(ERROR_MESSAGES.enum(`${path}.waitFor`, validWaitFor));
          }
        }
        break;

      case 'transform':
        if (!step.operation) {
          errors.push(ERROR_MESSAGES.required(path, 'operation'));
        } else if (typeof step.operation !== 'string') {
          errors.push(ERROR_MESSAGES.type(`${path}.operation`, 'string'));
        } else {
          const validOps = ['map', 'filter', 'reduce', 'sort', 'pick', 'omit', 'merge', 'flatten', 'unique'];
          if (!validOps.includes(step.operation)) {
            errors.push(ERROR_MESSAGES.enum(`${path}.operation`, validOps));
          }
        }
        break;

      case 'agent':
        // Debe tener agent (named) O prompt (inline)
        if (!step.agent && !step.prompt) {
          errors.push(`${path} requiere 'agent' (modo named) o 'prompt' (modo inline AI)`);
        }
        if (step.agent !== undefined && typeof step.agent !== 'string') {
          errors.push(ERROR_MESSAGES.type(`${path}.agent`, 'string'));
        }
        if (step.prompt !== undefined && typeof step.prompt !== 'string') {
          errors.push(ERROR_MESSAGES.type(`${path}.prompt`, 'string'));
        }
        if (step.system !== undefined && typeof step.system !== 'string') {
          errors.push(ERROR_MESSAGES.type(`${path}.system`, 'string'));
        }
        if (step.model !== undefined && typeof step.model !== 'string') {
          errors.push(ERROR_MESSAGES.type(`${path}.model`, 'string'));
        }
        if (step.temperature !== undefined) {
          if (typeof step.temperature !== 'number') {
            errors.push(ERROR_MESSAGES.type(`${path}.temperature`, 'number'));
          } else if (step.temperature < 0 || step.temperature > 2) {
            errors.push(`${path}.temperature debe estar entre 0 y 2`);
          }
        }
        if (step.max_tokens !== undefined) {
          if (typeof step.max_tokens !== 'number' || step.max_tokens < 1) {
            errors.push(`${path}.max_tokens debe ser un número >= 1`);
          }
        }
        break;

      case 'http':
        if (!step.url) {
          errors.push(ERROR_MESSAGES.required(path, 'url'));
        } else if (typeof step.url !== 'string') {
          errors.push(ERROR_MESSAGES.type(`${path}.url`, 'string'));
        }
        if (step.method !== undefined) {
          const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
          if (!validMethods.includes(step.method)) {
            errors.push(ERROR_MESSAGES.enum(`${path}.method`, validMethods));
          }
        }
        if (step.headers !== undefined && typeof step.headers !== 'object') {
          errors.push(ERROR_MESSAGES.type(`${path}.headers`, 'object'));
        }
        break;

      case 'delay':
        if (step.ms === undefined) {
          errors.push(ERROR_MESSAGES.required(path, 'ms'));
        } else if (typeof step.ms !== 'number' || step.ms < 0) {
          errors.push(`${path}.ms debe ser un número >= 0`);
        }
        break;

      case 'log':
        if (!step.message) {
          errors.push(ERROR_MESSAGES.required(path, 'message'));
        } else if (typeof step.message !== 'string') {
          errors.push(ERROR_MESSAGES.type(`${path}.message`, 'string'));
        }
        if (step.level !== undefined) {
          const validLevels = ['debug', 'info', 'warn', 'error'];
          if (!validLevels.includes(step.level)) {
            errors.push(ERROR_MESSAGES.enum(`${path}.level`, validLevels));
          }
        }
        break;

      case 'set':
        if (!step.variables) {
          errors.push(ERROR_MESSAGES.required(path, 'variables'));
        } else if (typeof step.variables !== 'object') {
          errors.push(ERROR_MESSAGES.type(`${path}.variables`, 'object'));
        }
        break;

      case 'emit':
        if (!step.event) {
          errors.push(ERROR_MESSAGES.required(path, 'event'));
        } else if (typeof step.event !== 'string') {
          errors.push(ERROR_MESSAGES.type(`${path}.event`, 'string'));
        }
        if (step.data !== undefined && typeof step.data !== 'object') {
          errors.push(ERROR_MESSAGES.type(`${path}.data`, 'object'));
        }
        break;
    }
  }

  /**
   * Valida un flujo y lanza error si es inválido
   * @throws {Error} Si el flujo es inválido
   */
  validateOrThrow(flow) {
    const { valid, errors } = this.validate(flow);
    if (!valid) {
      const errorMsg = errors.length === 1
        ? errors[0]
        : `${errors.length} errores de validación:\n- ${errors.join('\n- ')}`;
      throw new Error(`Flujo inválido: ${errorMsg}`);
    }
    return true;
  }

  /**
   * Obtiene el schema JSON
   */
  getSchema() {
    return this.schema;
  }
}

module.exports = FlowValidator;

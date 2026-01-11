/**
 * Step Handlers
 * Ejecuta cada tipo de step en un flujo
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class StepHandlers {
  constructor(logger, eventBus, variableResolver) {
    this.logger = logger;
    this.eventBus = eventBus;
    this.resolver = variableResolver;

    // Pendientes de respuesta (para steps async)
    this.pendingResponses = new Map();

    // Handlers por tipo
    this.handlers = {
      service: this.handleService.bind(this),
      transform: this.handleTransform.bind(this),
      condition: this.handleCondition.bind(this),
      parallel: this.handleParallel.bind(this),
      agent: this.handleAgent.bind(this),
      http: this.handleHttp.bind(this),
      delay: this.handleDelay.bind(this),
      log: this.handleLog.bind(this),
      set: this.handleSet.bind(this),
    };
  }

  /**
   * Ejecuta un step
   * @returns {Promise<{output: any, nextStep?: string}>}
   */
  async execute(step, context, executionId) {
    const handler = this.handlers[step.type];

    if (!handler) {
      throw new Error(`Unknown step type: ${step.type}`);
    }

    // Resolver variables en la configuración del step
    const resolvedStep = this.resolver.resolve(step, context);

    this.logger.debug('step-handlers.executing', {
      executionId,
      stepId: step.id,
      type: step.type
    });

    return await handler(resolvedStep, context, executionId);
  }

  // ==========================================
  // SERVICE: Llama a servicios locales via eventos
  // ==========================================

  async handleService(step, context, executionId) {
    const { service, action, input, config, timeout = 60000 } = step;

    // Mapeo de servicios a eventos
    const serviceEvents = {
      ocr: {
        request: 'ocr.extract.request',
        completed: 'ocr.extract.completed',
        failed: 'ocr.extract.failed'
      },
      telegram: {
        request: 'telegram.send_message.request',
        completed: 'telegram.send_message.response',
        failed: 'telegram.send_message.error'
      },
      filesystem: {
        // filesystem es síncrono, lo manejamos directo
      },
      database: {
        request: 'db.query.request',
        completed: 'db.query.response',
        failed: 'db.query.error'
      }
    };

    // Filesystem: manejo directo
    if (service === 'filesystem') {
      return await this.handleFilesystem(action, step, context);
    }

    // Otros servicios: via eventos
    const events = serviceEvents[service];
    if (!events) {
      throw new Error(`Unknown service: ${service}`);
    }

    const requestId = crypto.randomUUID();

    // Crear promesa para esperar respuesta
    const responsePromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingResponses.delete(requestId);
        reject(new Error(`Service ${service}.${action} timeout after ${timeout}ms`));
      }, timeout);

      this.pendingResponses.set(requestId, {
        resolve: (result) => {
          clearTimeout(timeoutId);
          this.pendingResponses.delete(requestId);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          this.pendingResponses.delete(requestId);
          reject(error);
        },
        service,
        action,
        executionId
      });
    });

    // Publicar request
    await this.eventBus.publish(events.request, {
      request_id: requestId,
      input,
      options: config || {},
      correlation_id: executionId
    });

    // Esperar respuesta
    const result = await responsePromise;

    return { output: result };
  }

  /**
   * Maneja respuestas de servicios
   */
  handleServiceResponse(requestId, result, isError = false) {
    const pending = this.pendingResponses.get(requestId);
    if (!pending) return false;

    if (isError) {
      pending.reject(new Error(result.error || 'Service error'));
    } else {
      pending.resolve(result);
    }

    return true;
  }

  // ==========================================
  // FILESYSTEM: Operaciones de archivo
  // ==========================================

  async handleFilesystem(action, step, context) {
    switch (action) {
      case 'read': {
        const filePath = step.path || step.input;
        const content = await fs.readFile(filePath);
        const encoding = step.encoding || 'base64';
        return {
          output: {
            content: content.toString(encoding),
            path: filePath,
            size: content.length
          }
        };
      }

      case 'write': {
        const filePath = step.path;
        let content = step.content;

        // Si content es objeto, convertir a JSON
        if (typeof content === 'object') {
          content = JSON.stringify(content, null, 2);
        }

        // Asegurar directorio
        await fs.mkdir(path.dirname(filePath), { recursive: true });

        // Escribir
        await fs.writeFile(filePath, content, 'utf-8');

        return {
          output: {
            path: filePath,
            size: content.length,
            written: true
          }
        };
      }

      case 'append': {
        const filePath = step.path;
        let content = step.content;

        if (typeof content === 'object') {
          content = JSON.stringify(content, null, 2);
        }

        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.appendFile(filePath, content + '\n', 'utf-8');

        return {
          output: { path: filePath, appended: true }
        };
      }

      case 'delete': {
        const filePath = step.path;
        await fs.unlink(filePath);
        return {
          output: { path: filePath, deleted: true }
        };
      }

      case 'exists': {
        const filePath = step.path;
        try {
          await fs.access(filePath);
          return { output: { exists: true, path: filePath } };
        } catch {
          return { output: { exists: false, path: filePath } };
        }
      }

      case 'list': {
        const dirPath = step.path;
        const files = await fs.readdir(dirPath);
        return {
          output: {
            files,
            count: files.length,
            path: dirPath
          }
        };
      }

      case 'rename': {
        const { from, to } = step;
        await fs.rename(from, to);
        return {
          output: { from, to, renamed: true }
        };
      }

      default:
        throw new Error(`Unknown filesystem action: ${action}`);
    }
  }

  // ==========================================
  // TRANSFORM: Transforma datos
  // ==========================================

  async handleTransform(step, context) {
    const { operation, input, config } = step;

    switch (operation) {
      case 'map': {
        // Mapear campos
        const result = {};
        for (const [key, value] of Object.entries(config.mapping || {})) {
          result[key] = this.resolver.resolve(value, { ...context, input });
        }
        return { output: result };
      }

      case 'filter': {
        // Filtrar array
        if (!Array.isArray(input)) {
          throw new Error('Filter requires array input');
        }
        const filtered = input.filter(item => {
          return this.resolver.evaluateCondition(config.condition, { ...context, item });
        });
        return { output: filtered };
      }

      case 'merge': {
        // Merge objetos
        const merged = Object.assign({}, ...config.sources.map(s =>
          this.resolver.resolve(s, context)
        ));
        return { output: merged };
      }

      case 'extract': {
        // Extraer campos específicos
        const result = {};
        for (const field of config.fields || []) {
          result[field] = this.resolver.getValue(field, { ...context, input });
        }
        return { output: result };
      }

      case 'template': {
        // Aplicar template string
        const result = this.resolver.resolveString(config.template, context);
        return { output: result };
      }

      case 'json.parse': {
        const parsed = JSON.parse(input);
        return { output: parsed };
      }

      case 'json.stringify': {
        const stringified = JSON.stringify(input, null, config?.indent || 2);
        return { output: stringified };
      }

      case 'split': {
        const parts = String(input).split(config.delimiter || '\n');
        return { output: parts };
      }

      case 'join': {
        const joined = input.join(config.delimiter || '\n');
        return { output: joined };
      }

      case 'regex': {
        const regex = new RegExp(config.pattern, config.flags || 'g');
        const matches = String(input).match(regex);
        return { output: matches || [] };
      }

      default:
        throw new Error(`Unknown transform operation: ${operation}`);
    }
  }

  // ==========================================
  // CONDITION: Bifurcación condicional
  // ==========================================

  async handleCondition(step, context) {
    const { if: condition, then: thenStep, else: elseStep } = step;

    const result = this.resolver.evaluateCondition(condition, context);

    this.logger.debug('step-handlers.condition', {
      condition,
      result,
      nextStep: result ? thenStep : elseStep
    });

    return {
      output: { conditionResult: result },
      nextStep: result ? thenStep : elseStep
    };
  }

  // ==========================================
  // PARALLEL: Ejecuta steps en paralelo
  // ==========================================

  async handleParallel(step, context, executionId) {
    const { steps: parallelSteps } = step;

    const results = await Promise.all(
      parallelSteps.map(async (s, index) => {
        try {
          const result = await this.execute(s, context, executionId);
          return { id: s.id || `parallel_${index}`, success: true, ...result };
        } catch (error) {
          return { id: s.id || `parallel_${index}`, success: false, error: error.message };
        }
      })
    );

    // Convertir a objeto indexado por id
    const outputByStep = {};
    for (const r of results) {
      outputByStep[r.id] = r;
    }

    const allSuccess = results.every(r => r.success);

    return {
      output: {
        results: outputByStep,
        allSuccess,
        successCount: results.filter(r => r.success).length,
        failCount: results.filter(r => !r.success).length
      }
    };
  }

  // ==========================================
  // AGENT: Invoca agente AI
  // ==========================================

  async handleAgent(step, context, executionId) {
    const { agent, task, config, timeout = 120000 } = step;

    const requestId = crypto.randomUUID();

    // Crear promesa para esperar respuesta
    const responsePromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingResponses.delete(requestId);
        reject(new Error(`Agent ${agent} timeout after ${timeout}ms`));
      }, timeout);

      this.pendingResponses.set(requestId, {
        resolve: (result) => {
          clearTimeout(timeoutId);
          this.pendingResponses.delete(requestId);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          this.pendingResponses.delete(requestId);
          reject(error);
        },
        type: 'agent',
        agent,
        executionId
      });
    });

    // Publicar request al agente
    await this.eventBus.publish('agent.execute.request', {
      request_id: requestId,
      agentName: agent,
      task,
      context: {
        ...context,
        flowExecutionId: executionId,
        ...(config || {})
      }
    });

    const result = await responsePromise;

    return { output: result };
  }

  /**
   * Maneja respuestas de agentes
   */
  handleAgentResponse(requestId, result, isError = false) {
    // Buscar por requestId en los pendientes
    for (const [key, pending] of this.pendingResponses) {
      if (pending.type === 'agent' && key === requestId) {
        if (isError) {
          pending.reject(new Error(result.error || 'Agent error'));
        } else {
          pending.resolve(result);
        }
        return true;
      }
    }
    return false;
  }

  // ==========================================
  // HTTP: Llamada HTTP externa
  // ==========================================

  async handleHttp(step, context) {
    const { url, method = 'GET', headers = {}, body, timeout = 30000 } = step;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        signal: controller.signal
      };

      if (body && method !== 'GET') {
        options.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      let data;

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      return {
        output: {
          status: response.status,
          ok: response.ok,
          data,
          headers: Object.fromEntries(response.headers.entries())
        }
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw new Error(`HTTP ${method} ${url} failed: ${error.message}`);
    }
  }

  // ==========================================
  // DELAY: Espera
  // ==========================================

  async handleDelay(step) {
    const { ms = 1000 } = step;
    await new Promise(resolve => setTimeout(resolve, ms));
    return { output: { delayed: ms } };
  }

  // ==========================================
  // LOG: Logging
  // ==========================================

  async handleLog(step, context) {
    const { level = 'info', message, data } = step;
    const resolvedMessage = this.resolver.resolveString(message, context);
    const resolvedData = data ? this.resolver.resolve(data, context) : undefined;

    this.logger[level]?.('flow.log', {
      message: resolvedMessage,
      ...resolvedData
    });

    return { output: { logged: true, message: resolvedMessage } };
  }

  // ==========================================
  // SET: Establecer variable en contexto
  // ==========================================

  async handleSet(step, context) {
    const { variables } = step;
    const resolved = {};

    for (const [key, value] of Object.entries(variables || {})) {
      resolved[key] = this.resolver.resolve(value, context);
    }

    return {
      output: resolved,
      setVariables: resolved
    };
  }
}

module.exports = StepHandlers;

/**
 * Step Handlers
 * Ejecuta cada tipo de step en un flujo
 */

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
      emit: this.handleEmit.bind(this),
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
  // SERVICE: Llama a servicios via eventos
  // Patrón: {provider}.{function}.request → {provider}.{function}.response
  // ==========================================

  async handleService(step, context, executionId) {
    const { service, action, timeout = 60000, config } = step;

    // Extract control properties, pass everything else as payload
    const { id, type, service: _s, action: _a, timeout: _t, onError, config: _c, ...directProps } = step;

    // Construir eventos según patrón del sistema:
    // {provider}.{action}.request → {provider}.{action}.response
    const requestEvent = `${service}.${action}.request`;
    const responseEvent = `${service}.${action}.response`;
    const failedEvent = `${service}.${action}.failed`;

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
        requestEvent,
        responseEvent,
        executionId
      });
    });

    // Publicar request: spread config first, then direct props (direct props override config)
    await this.eventBus.publish(requestEvent, {
      request_id: requestId,
      ...config,
      ...directProps,
      correlation_id: executionId
    });

    this.logger.debug('step-handlers.service.request', {
      requestId,
      event: requestEvent,
      service,
      action
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

  // ==========================================
  // EMIT: Publica evento para encadenar flujos
  // ==========================================

  async handleEmit(step, context) {
    const { event, data = {} } = step;

    if (!event) {
      throw new Error('Emit step requires "event" property');
    }

    // Resolver datos del evento
    const resolvedData = this.resolver.resolve(data, context);

    // Añadir metadata del flujo origen
    const eventPayload = {
      ...resolvedData,
      _flowMeta: {
        sourceFlow: context.flow?.id,
        sourceExecution: context.execution?.id,
        emittedAt: new Date().toISOString()
      }
    };

    // Publicar evento
    await this.eventBus.publish(event, eventPayload);

    this.logger.info('step-handlers.emit', {
      event,
      sourceFlow: context.flow?.id
    });

    return {
      output: {
        emitted: true,
        event,
        data: resolvedData
      }
    };
  }
}

module.exports = StepHandlers;
